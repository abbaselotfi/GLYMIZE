import { describe, expect, it } from "vitest";
import { resolveCurrentMedicationAdministrationV2, type IntervalAwareCurrentMedicationV2 } from "../src/decision-graph-v2/current-medication-interval.js";
import { applyHardGatesV2 } from "../src/decision-graph-v2/gates.js";
import { applyCoreClinicalRulesToInventoryV2 } from "../src/decision-graph-v2/inventory-rules.js";
import {
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

const masterDrugId = "TEST-SEMAGLUTIDE-SC";
const rawSemaglutide: KnowledgeMedicationV2 = {
  masterDrugId,
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

function product(doseMg: number, suffix = ""): IranMarketProductV2 {
  return {
    productId: `TEST-WEGOVY-${String(doseMg).replace(".", "_")}${suffix}`,
    masterDrugId,
    nfiMatchState: "verified",
    genericName: "Semaglutide",
    brandName: "Wegovy",
    dosageFormGroup: "injection_pen",
    route: "subcutaneous",
    consumptionUnit: "pen",
    strengthComponents: [{ ingredientKey: masterDrugId, amount: doseMg, unit: "mg" }],
    consumptionUnitsPerPurchaseUnit: 4,
    purchaseUnitLabel: "box",
    priceToman: 4_000_000,
    license: { everValid: true, currentValid: true, revoked: false },
    marketPresence: "confirmed_active",
  };
}

const products = [0.25, 0.5, 1, 1.7, 2.4].map((dose) => product(dose));

function inventory(marketProducts: IranMarketProductV2[] = products): DecisionGraphInventoryV2 {
  return applyCoreClinicalRulesToInventoryV2({
    knowledge: [rawSemaglutide],
    marketProducts,
    doseRules: [],
    insurancePolicies: [],
    medicationGateRules: [],
    regimenConflictRules: [],
    regimenTemplates: [],
    frcProtocolBindings: [],
    insulinConversionRules: [],
    titrationProtocols: [],
  }).inventory;
}

type Patient = PatientContextV2 & { medicationSafety: WegovyMedicationSafetyContextV2 };

function currentWegovy(input: {
  doseMg: number;
  daysOnCurrentDose?: number;
  therapyPhase?: "initiation" | "escalation" | "maintenance";
  adherence?: "good" | "partial" | "poor" | "unknown";
  tolerance?: "good" | "limited" | "intolerant" | "unknown";
  brandName?: string;
  referencePresentationId?: string;
}): IntervalAwareCurrentMedicationV2 {
  const administration = resolveCurrentMedicationAdministrationV2({
    genericName: "Semaglutide",
    brandName: input.brandName ?? "Wegovy",
    referencePresentationId: input.referencePresentationId,
    doseAmount: input.doseMg,
    doseUnit: "mg",
    administrationsPerPeriod: 1,
    administrationPeriodDays: 7,
    daysOnCurrentDose: input.daysOnCurrentDose,
    therapyPhase: input.therapyPhase,
    adherence: input.adherence ?? "good",
    tolerance: input.tolerance ?? "good",
  }, masterDrugId, "mg");
  return {
    masterDrugId,
    genericName: "Semaglutide",
    therapyGroup: "glp_1_receptor_agonist",
    route: "subcutaneous",
    dosageFormGroup: "injection_pen",
    status: "active",
    adherence: input.adherence ?? "good",
    tolerance: input.tolerance ?? "good",
    administrationInterval: administration.administrationInterval,
    intervalIssue: administration.intervalIssue,
    brandName: input.brandName ?? "Wegovy",
  };
}

function patient(current: IntervalAwareCurrentMedicationV2[]): Patient {
  return {
    ageYears: 52,
    pregnancy: false,
    glycemia: { currentHba1c: 7, targetHba1c: 7 },
    liver: { masldMash: true, fibrosisStage: "F3", cirrhosis: false, decompensatedCirrhosis: false },
    currentMedications: current,
    medicationSafety: {
      personalOrFamilyHistoryMtc: false,
      men2: false,
      priorSeriousSemaglutideHypersensitivity: false,
      severeGastroparesis: false,
      suspectedAcutePancreatitis: false,
    },
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

const objective: ClinicalObjectiveV2 = {
  id: "liver_directed_therapy",
  lane: "liver",
  level: "mandatory",
  reason: "MASH objective",
  evidence: [],
};

function candidate(medication: KnowledgeMedicationV2): RegimenCandidateV2 {
  return {
    regimenId: `single:${masterDrugId}:liver`,
    lane: "liver",
    kind: "organ_protection",
    components: [{
      masterDrugId,
      genericName: medication.genericName,
      therapyGroup: medication.therapyGroup,
      tags: medication.tags ?? [],
      availability: {
        masterDrugId,
        classification: "current_market",
        mainRecommendationEligible: true,
        moreOptionsEligible: true,
        currentProductIds: products.map((item) => item.productId),
        historicalProductIds: [],
        reasons: [],
      },
    }],
    efficacyBand: medication.efficacyBand,
    hypoglycemiaRisk: medication.hypoglycemiaRisk,
    weightProfile: medication.weightDirection,
    objectiveCoverage: ["liver_directed_therapy"],
    objectiveStrength: { liver_directed_therapy: "strong_benefit" },
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

function protocol(current: IntervalAwareCurrentMedicationV2[], marketProducts: IranMarketProductV2[] = products) {
  const inv = inventory(marketProducts);
  const medication = inv.knowledge[0]!;
  return evaluateReviewedWegovyMashProtocolV2({ patient: patient(current), medication, marketProducts: inv.marketProducts });
}

describe("WEGOVY MASH exact continuation reconciliation", () => {
  it("advances a tolerated 0.5 mg escalation stage to the exact 1 mg product after 28 days", () => {
    const current = currentWegovy({ doseMg: 0.5, daysOnCurrentDose: 28, therapyPhase: "escalation" });
    const outcome = protocol([current]);
    expect(outcome?.status).toBe("pass");
    expect(outcome?.doseRuleId).toContain("ESCALATION-1:");
    expect(outcome?.requiredProductId).toBe("TEST-WEGOVY-1");

    const inv = inventory();
    const request: DecisionGraphRequestV2 = {
      patient: patient([current]),
      preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
      inventory: inv,
    };
    const gated = applyHardGatesV2(request, state, [objective], candidate(inv.knowledge[0]!));
    expect(gated.gate.status).toBe("pass");
    expect(gated.components[0]?.doseOptions).toHaveLength(1);
    expect(gated.components[0]?.dosePlan?.perAdministrationComponents?.[0]?.amount).toBe(1);
    expect(gated.components[0]?.dosePlan?.scheduleText).toBe("once weekly");
  });

  it("holds the same stage before day 28 or when tolerability is limited", () => {
    const early = protocol([currentWegovy({ doseMg: 0.5, daysOnCurrentDose: 14, therapyPhase: "escalation" })]);
    expect(early?.status).toBe("pass");
    expect(early?.doseRuleId).toContain("ESCALATION-0_5:");

    const limited = protocol([currentWegovy({ doseMg: 0.5, daysOnCurrentDose: 28, therapyPhase: "escalation", tolerance: "limited" })]);
    expect(limited?.status).toBe("pass");
    expect(limited?.doseRuleId).toContain("ESCALATION-0_5:");
    expect(limited?.reasons.join(" ")).toContain("delay escalation");
  });

  it("distinguishes 1.7 mg escalation from the 1.7 mg maintenance fallback", () => {
    const escalation = protocol([currentWegovy({ doseMg: 1.7, daysOnCurrentDose: 28, therapyPhase: "escalation" })]);
    expect(escalation?.status).toBe("pass");
    expect(escalation?.doseRuleId).toContain("MAINT-2_4:");

    const fallback = protocol([currentWegovy({ doseMg: 1.7, daysOnCurrentDose: 35, therapyPhase: "maintenance" })]);
    expect(fallback?.status).toBe("pass");
    expect(fallback?.doseRuleId).toContain("MAINT-ALT-1_7:");
    expect(fallback?.reasons.join(" ")).toContain("re-escalation");

    const ambiguous = protocol([currentWegovy({ doseMg: 1.7, daysOnCurrentDose: 28 })]);
    expect(ambiguous?.status).toBe("needs_data");
    expect(ambiguous?.reasons.join(" ")).toContain("therapyPhase");
  });

  it("continues exact 2.4 mg maintenance only with adequate reconciliation", () => {
    const maintenance = protocol([currentWegovy({ doseMg: 2.4, daysOnCurrentDose: 60, therapyPhase: "maintenance" })]);
    expect(maintenance?.status).toBe("pass");
    expect(maintenance?.doseRuleId).toContain("MAINT-2_4:");

    const limited = protocol([currentWegovy({ doseMg: 2.4, daysOnCurrentDose: 60, therapyPhase: "maintenance", tolerance: "limited" })]);
    expect(limited?.status).toBe("conditional");
  });

  it("fails closed for missing stage timing, poor adherence, intolerance, or non-WEGOVY semaglutide", () => {
    expect(protocol([currentWegovy({ doseMg: 0.5, therapyPhase: "escalation" })])?.status).toBe("needs_data");
    expect(protocol([currentWegovy({ doseMg: 0.5, daysOnCurrentDose: 28, therapyPhase: "escalation", adherence: "poor" })])?.status).toBe("conditional");
    expect(protocol([currentWegovy({ doseMg: 0.5, daysOnCurrentDose: 28, therapyPhase: "escalation", tolerance: "intolerant" })])?.status).toBe("conditional");
    const ozempic = currentWegovy({ doseMg: 0.5, daysOnCurrentDose: 28, therapyPhase: "escalation", brandName: "Ozempic" });
    expect(protocol([ozempic])?.status).toBe("conditional");
  });

  it("requires exact product disambiguation when a current strength has multiple active presentations", () => {
    const duplicatedProducts = [...products, product(0.5, "-B")];
    const ambiguous = protocol([
      currentWegovy({ doseMg: 0.5, daysOnCurrentDose: 14, therapyPhase: "escalation" }),
    ], duplicatedProducts);
    expect(ambiguous?.status).toBe("needs_data");

    const referenced = protocol([
      currentWegovy({
        doseMg: 0.5,
        daysOnCurrentDose: 14,
        therapyPhase: "escalation",
        referencePresentationId: "TEST-WEGOVY-0_5-B",
      }),
    ], duplicatedProducts);
    expect(referenced?.status).toBe("pass");
    expect(referenced?.requiredProductId).toBe("TEST-WEGOVY-0_5-B");
  });
});
