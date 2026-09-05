import { describe, expect, it } from "vitest";
import { composeTreatmentPlanV2 } from "../src/decision-graph-v2/composer.js";
import { resolveDosePlanV2 } from "../src/decision-graph-v2/dose.js";
import { enrichCandidateWithDoseMarketCostV2 } from "../src/decision-graph-v2/enrich.js";
import { applyCoreClinicalRulesToInventoryV2 } from "../src/decision-graph-v2/inventory-rules.js";
import {
  buildWegovyMashInitiationTitrationCostV2,
  phaseAwareTitrationCostV2,
} from "../src/decision-graph-v2/wegovy-titration-cost.js";
import type {
  ClinicalObjectiveV2,
  ClinicalStateV2,
  DecisionGraphInventoryV2,
  DecisionGraphRequestV2,
  IranMarketProductV2,
  KnowledgeMedicationV2,
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

function product(doseMg: number, overrides: Partial<IranMarketProductV2> = {}): IranMarketProductV2 {
  return {
    productId: `TEST-WEGOVY-${String(doseMg).replace(".", "_")}`,
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
    observedAt: "2026-09-05",
    ...overrides,
  };
}

const products = [0.25, 0.5, 1, 1.7, 2.4].map((dose) => product(dose));

function baseInventory(marketProducts: IranMarketProductV2[] = products): DecisionGraphInventoryV2 {
  return {
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
  reason: "Synthetic MASH objective.",
  evidence: [],
};

function fixture(marketProducts: IranMarketProductV2[] = products) {
  const inventory = applyCoreClinicalRulesToInventoryV2(baseInventory(marketProducts)).inventory;
  const initRule = inventory.doseRules.find((rule) => rule.id.startsWith("LABEL-WEGOVY-MASH-INIT-0_25:"));
  if (!initRule) throw new Error("Synthetic WEGOVY initiation rule missing.");
  const patient: DecisionGraphRequestV2["patient"] = {
    ageYears: 52,
    pregnancy: false,
    glycemia: { currentHba1c: 7, targetHba1c: 7 },
    liver: { masldMash: true, fibrosisStage: "F3", cirrhosis: false, decompensatedCirrhosis: false },
    currentMedications: [],
  };
  const dosePlan = resolveDosePlanV2(initRule, patient, state);
  if (!dosePlan) throw new Error("Synthetic WEGOVY initiation plan missing.");
  const request: DecisionGraphRequestV2 = {
    patient,
    preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    inventory,
  };
  const candidate: RegimenCandidateV2 = {
    regimenId: `single:${masterDrugId}:liver`,
    lane: "liver",
    kind: "organ_protection",
    components: [{
      masterDrugId,
      genericName: "Semaglutide, subcutaneous",
      therapyGroup: "glp_1_receptor_agonist",
      tags: ["wegovy-mash-f2-f3", "wegovy-product-bound"],
      dosePlan,
      doseOptions: [dosePlan],
      availability: {
        masterDrugId,
        classification: "current_market",
        mainRecommendationEligible: true,
        moreOptionsEligible: true,
        currentProductIds: marketProducts.map((item) => item.productId),
        historicalProductIds: [],
        reasons: ["Synthetic current market."],
      },
    }],
    efficacyBand: "very_high",
    hypoglycemiaRisk: "minimal",
    weightProfile: "loss",
    objectiveCoverage: ["liver_directed_therapy"],
    objectiveStrength: { liver_directed_therapy: "strong_benefit" },
    evidence: dosePlan.evidence,
    gate: { status: "pass", reasons: [], evidence: [] },
    routeFit: "match",
    insuranceFit: "unknown",
    distinctProducts: 1,
    reasons: [],
    cautions: [],
    preferenceConflicts: [],
  };
  return { request, candidate };
}

describe("phase-aware WEGOVY MASH titration cost", () => {
  it("counts four 0.25 mg injections then the first 0.5 mg injection inside day 30", () => {
    const { request, candidate } = fixture();
    const plan = buildWegovyMashInitiationTitrationCostV2({ request, component: candidate.components[0]!, windowDays: 30 });

    expect(plan).toBeDefined();
    expect(plan?.phases.map((phase) => [phase.doseMg, phase.administrationsInWindow])).toEqual([
      [0.25, 4],
      [0.5, 1],
    ]);
    expect(plan?.totalAdministrations).toBe(5);
    expect(plan?.cashPurchaseCostToman).toBe(8_000_000);
    expect(plan?.normalizedTreatmentValueToman).toBe(5_000_000);
    expect(plan?.carryoverInventoryValueToman).toBe(3_000_000);
    expect(plan?.productPurchases).toHaveLength(2);
    expect(plan?.insuranceProjection).toBe("not_projected_phase_claim_timing_required");
  });

  it("prices the complete 140-day escalation as five exact four-dose phases without leftover", () => {
    const { request, candidate } = fixture();
    const plan = buildWegovyMashInitiationTitrationCostV2({ request, component: candidate.components[0]!, windowDays: 140 });

    expect(plan?.phases.map((phase) => phase.doseMg)).toEqual([0.25, 0.5, 1, 1.7, 2.4]);
    expect(plan?.phases.every((phase) => phase.administrationsInWindow === 4)).toBe(true);
    expect(plan?.totalAdministrations).toBe(20);
    expect(plan?.cashPurchaseCostToman).toBe(20_000_000);
    expect(plan?.normalizedTreatmentValueToman).toBe(20_000_000);
    expect(plan?.carryoverInventoryValueToman).toBe(0);
  });

  it("fails closed when a future phase lacks price data or is not exact WEGOVY", () => {
    const noFuturePrice = products.map((item) => item.productId.endsWith("0_5") ? { ...item, priceToman: undefined } : item);
    const missing = fixture(noFuturePrice);
    expect(buildWegovyMashInitiationTitrationCostV2({ request: missing.request, component: missing.candidate.components[0]!, windowDays: 30 })).toBeUndefined();

    const ozempic = products.map((item) => item.productId.endsWith("0_5") ? { ...item, brandName: "Ozempic" } : item);
    const wrongBrand = fixture(ozempic);
    expect(buildWegovyMashInitiationTitrationCostV2({ request: wrongBrand.request, component: wrongBrand.candidate.components[0]!, windowDays: 30 })).toBeUndefined();
  });

  it("drives live candidate and composed-plan 30-day cost from the phase plan", () => {
    const { request, candidate } = fixture();
    const enriched = enrichCandidateWithDoseMarketCostV2(request, candidate);
    const phasePlan = phaseAwareTitrationCostV2(enriched.components[0]!);

    expect(enriched.gate.status).toBe("pass");
    expect(phasePlan?.normalizedTreatmentValueToman).toBe(5_000_000);
    expect(enriched.monthlyPatientCostToman).toBe(5_000_000);
    expect(enriched.components[0]?.selectedProductCost).toBeUndefined();
    expect(enriched.dailyAdministrationBurden).toBeCloseTo(5 / 30, 8);

    const treatmentPlan = composeTreatmentPlanV2({
      request,
      state,
      objectives: [objective],
      executableCandidates: [enriched],
    });
    expect(treatmentPlan?.monthlyPatientCostToman).toBe(5_000_000);
  });

  it("does not claim insured-only cost or coverage before phase claim timing is modeled", () => {
    const { request, candidate } = fixture();
    request.preferences.costPreference = "insured_only";
    request.preferences.insuranceProviders = ["social_security"];
    const enriched = enrichCandidateWithDoseMarketCostV2(request, candidate);

    expect(enriched.monthlyPatientCostToman).toBeUndefined();
    expect(enriched.insuranceFit).toBe("unknown");
    expect(enriched.gate.status).toBe("exclude");
    expect(enriched.cautions.join(" ")).toContain("claim timing");
  });
});
