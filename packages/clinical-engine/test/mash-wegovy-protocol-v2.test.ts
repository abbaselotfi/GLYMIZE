import { describe, expect, it } from "vitest";
import { applyHardGatesV2 } from "../src/decision-graph-v2/gates.js";
import { applyCoreClinicalRulesToInventoryV2 } from "../src/decision-graph-v2/inventory-rules.js";
import {
  applyReviewedWegovyMashKnowledgeV2,
  buildReviewedWegovyMashDoseRulesV2,
  evaluateReviewedWegovyMashProtocolV2,
  type WegovyMedicationSafetyContextV2,
} from "../src/decision-graph-v2/wegovy-mash-protocol.js";
import type {
  ClinicalObjectiveV2,
  ClinicalStateV2,
  DecisionGraphInventoryV2,
  DecisionGraphRequestV2,
  IranMarketProductV2,
  KnowledgeMedicationV2,
  PatientContextV2,
  RegimenCandidateV2,
} from "../src/decision-graph-v2/types.js";

const rawSemaglutide: KnowledgeMedicationV2 = {
  masterDrugId: "TEST-SEMAGLUTIDE-SC",
  genericName: "Semaglutide, subcutaneous",
  combination: false,
  therapeuticAreas: ["Diabetes"],
  therapyGroup: "glp_1_receptor_agonist",
  primaryLanes: ["glycemic"],
  routeOptions: ["subcutaneous"],
  dosageFormGroups: ["injection_pen"],
  efficacyBand: "very_high",
  hypoglycemiaRisk: "minimal",
  weightDirection: "loss",
  effects: [],
  tags: [],
  evidence: [],
  engineState: "approved",
};

function marketProduct(brandName: string, amountMg: number): IranMarketProductV2 {
  return {
    productId: `TEST-${brandName.toUpperCase()}-${String(amountMg).replace(".", "_")}`,
    masterDrugId: rawSemaglutide.masterDrugId,
    nfiMatchState: "verified",
    genericName: "Semaglutide",
    brandName,
    dosageFormGroup: "injection_pen",
    route: "subcutaneous",
    consumptionUnit: "pen",
    strengthComponents: [{ ingredientKey: rawSemaglutide.masterDrugId, amount: amountMg, unit: "mg" }],
    consumptionUnitsPerPurchaseUnit: 4,
    purchaseUnitLabel: "box",
    priceToman: 4_000_000,
    license: { everValid: true, currentValid: true, revoked: false },
    marketPresence: "confirmed_active",
    observedAt: "2026-09-05",
  };
}

const wegovyProducts = [0.25, 0.5, 1, 1.7, 2.4].map((dose) => marketProduct("Wegovy", dose));

function inventory(products: IranMarketProductV2[] = wegovyProducts): DecisionGraphInventoryV2 {
  return {
    knowledge: [rawSemaglutide],
    marketProducts: products,
    doseRules: [],
    insurancePolicies: [],
    medicationGateRules: [],
    regimenConflictRules: [],
    regimenTemplates: [],
    frcProtocolBindings: [],
    insulinConversionRules: [],
    titrationProtocols: [],
  };
}

type WegovyPatient = PatientContextV2 & { medicationSafety: WegovyMedicationSafetyContextV2 };

function patient(overrides: Partial<WegovyPatient> = {}): WegovyPatient {
  return {
    ageYears: 52,
    pregnancy: false,
    glycemia: { currentHba1c: 7, targetHba1c: 7 },
    liver: {
      masldMash: true,
      fibrosisStage: "F3",
      cirrhosis: false,
      decompensatedCirrhosis: false,
    },
    currentMedications: [],
    medicationSafety: {
      personalOrFamilyHistoryMtc: false,
      men2: false,
      priorSeriousSemaglutideHypersensitivity: false,
      severeGastroparesis: false,
      suspectedAcutePancreatitis: false,
    },
    ...overrides,
  };
}

const state: ClinicalStateV2 = {
  pathway: "maintain_and_monitor",
  insulinAction: "none",
  severeHyperglycemia: false,
  hba1cGap: 0,
  reasons: [],
  evidence: [],
};

const liverObjective: ClinicalObjectiveV2 = {
  id: "liver_directed_therapy",
  lane: "liver",
  level: "strong_preference",
  reason: "MASH is active.",
  evidence: [],
};

function candidate(medication: KnowledgeMedicationV2, lane: "liver" | "glycemic" = "liver"): RegimenCandidateV2 {
  return {
    regimenId: `single:${medication.masterDrugId}:${lane}`,
    lane,
    kind: lane === "liver" ? "organ_protection" : "single",
    components: [{
      masterDrugId: medication.masterDrugId,
      genericName: medication.genericName,
      therapyGroup: medication.therapyGroup,
      tags: medication.tags ?? [],
      availability: {
        masterDrugId: medication.masterDrugId,
        classification: "current_market",
        mainRecommendationEligible: true,
        moreOptionsEligible: true,
        currentProductIds: wegovyProducts.map((item) => item.productId),
        historicalProductIds: [],
        reasons: ["Synthetic current-market fixture."],
      },
    }],
    efficacyBand: medication.efficacyBand,
    hypoglycemiaRisk: medication.hypoglycemiaRisk,
    weightProfile: medication.weightDirection,
    objectiveCoverage: lane === "liver" ? ["liver_directed_therapy"] : ["glycemic_control", "weight_benefit"],
    objectiveStrength: lane === "liver" ? { liver_directed_therapy: "benefit" } : {},
    evidence: medication.evidence,
    gate: { status: "pass", reasons: [], evidence: [] },
    routeFit: "match",
    insuranceFit: "unknown",
    distinctProducts: 1,
    reasons: [],
    cautions: [],
    preferenceConflicts: [],
  };
}

function requestFor(input: PatientContextV2, products: IranMarketProductV2[] = wegovyProducts): DecisionGraphRequestV2 {
  const result = applyCoreClinicalRulesToInventoryV2(inventory(products));
  return {
    patient: input,
    preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    inventory: result.inventory,
  };
}

describe("reviewed product-bound WEGOVY MASH protocol", () => {
  it("adds liver execution only when exact current verified WEGOVY injections exist", () => {
    const withWegovy = applyReviewedWegovyMashKnowledgeV2(inventory());
    const medication = withWegovy.knowledge[0]!;
    expect(medication.primaryLanes).toContain("liver");
    expect(medication.effects.some((effect) => effect.objective === "liver_directed_therapy")).toBe(true);

    const ozempicOnly = applyReviewedWegovyMashKnowledgeV2(inventory([marketProduct("Ozempic", 0.25)]));
    expect(ozempicOnly.knowledge[0]?.primaryLanes).not.toContain("liver");
    expect(buildReviewedWegovyMashDoseRulesV2(ozempicOnly)).toHaveLength(0);
  });

  it("registers the five label escalation strengths as exact product-bound rules", () => {
    const result = applyCoreClinicalRulesToInventoryV2(inventory());
    const rules = result.inventory.doseRules.filter((rule) => rule.masterDrugId === rawSemaglutide.masterDrugId && rule.lane === "liver");
    expect(rules).toHaveLength(5);
    expect(rules.every((rule) => rule.productId?.startsWith("TEST-WEGOVY"))).toBe(true);
    expect(result.report.addedWegovyMashDoseRules).toBe(5);
    expect(result.inventory.titrationProtocols.some((item) => item.id.startsWith("TITRATE-WEGOVY-MASH"))).toBe(true);
  });

  it("passes only complete adult F2/F3 noncirrhotic safety-screened initiation and selects 0.25 mg weekly", () => {
    const request = requestFor(patient());
    const medication = request.inventory.knowledge[0]!;
    const protocol = evaluateReviewedWegovyMashProtocolV2({
      patient: request.patient,
      medication,
      marketProducts: request.inventory.marketProducts,
    });
    expect(protocol?.status).toBe("pass");
    expect(protocol?.doseRuleId).toContain("INIT-0_25");

    const gated = applyHardGatesV2(request, state, [liverObjective], candidate(medication));
    expect(gated.gate.status).toBe("pass");
    expect(gated.components[0]?.doseOptions).toHaveLength(1);
    expect(gated.components[0]?.dosePlan?.perAdministrationComponents?.[0]?.amount).toBe(0.25);
    expect(gated.components[0]?.dosePlan?.scheduleText).toContain("7");
  });

  it("fails closed for incomplete safety data and excludes label contraindications", () => {
    const promoted = applyReviewedWegovyMashKnowledgeV2(inventory()).knowledge[0]!;
    const missingSafety = patient({ medicationSafety: { personalOrFamilyHistoryMtc: false } });
    expect(evaluateReviewedWegovyMashProtocolV2({ patient: missingSafety, medication: promoted, marketProducts: wegovyProducts })?.status).toBe("needs_data");

    const mtc = patient({ medicationSafety: { ...patient().medicationSafety, personalOrFamilyHistoryMtc: true } });
    expect(evaluateReviewedWegovyMashProtocolV2({ patient: mtc, medication: promoted, marketProducts: wegovyProducts })?.status).toBe("exclude");

    const gastroparesis = patient({ medicationSafety: { ...patient().medicationSafety, severeGastroparesis: true } });
    expect(evaluateReviewedWegovyMashProtocolV2({ patient: gastroparesis, medication: promoted, marketProducts: wegovyProducts })?.status).toBe("exclude");
  });

  it("requires the complete current Iran-market escalation set and blocks concomitant GLP-1 execution", () => {
    const promoted = applyReviewedWegovyMashKnowledgeV2(inventory()).knowledge[0]!;
    const missingStrength = wegovyProducts.filter((item) => !item.productId.endsWith("2_4"));
    expect(evaluateReviewedWegovyMashProtocolV2({ patient: patient(), medication: promoted, marketProducts: missingStrength })?.status).toBe("conditional");

    const onDulaglutide = patient({ currentMedications: [{ genericName: "Dulaglutide", therapyGroup: "glp_1_receptor_agonist", status: "active" }] });
    expect(evaluateReviewedWegovyMashProtocolV2({ patient: onDulaglutide, medication: promoted, marketProducts: wegovyProducts })?.status).toBe("conditional");
  });

  it("does not apply MASH safety gates to the ordinary glycemic semaglutide lane", () => {
    const noMashContext: PatientContextV2 = {
      ageYears: 52,
      pregnancy: false,
      glycemia: { currentHba1c: 8, targetHba1c: 7 },
      currentMedications: [],
    };
    const request = requestFor(noMashContext);
    const medication = request.inventory.knowledge[0]!;
    const glycemic = applyHardGatesV2(request, { ...state, pathway: "modest_intensification", hba1cGap: 1 }, [], candidate(medication, "glycemic"));
    expect(glycemic.gate.reasons.join(" ")).not.toContain("MASH");
    expect(glycemic.gate.reasons.join(" ")).not.toContain("MTC");
  });
});
