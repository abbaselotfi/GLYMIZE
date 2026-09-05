import { describe, expect, it } from "vitest";
import { resolveCurrentMedicationAdministrationV2, type IntervalAwareCurrentMedicationV2 } from "../src/decision-graph-v2/current-medication-interval.js";
import { resolveDosePlanV2 } from "../src/decision-graph-v2/dose.js";
import { buildWegovyMashContinuationWindowCostV2 } from "../src/decision-graph-v2/wegovy-continuation-cost.js";
import type {
  ClinicalStateV2,
  DecisionGraphRequestV2,
  DoseRuleV2,
  IranMarketProductV2,
  RegimenComponentV2,
} from "../src/decision-graph-v2/types.js";

const masterDrugId = "TEST-SEMAGLUTIDE-AUTHORITY";
const state: ClinicalStateV2 = {
  pathway: "maintain_and_monitor",
  insulinAction: "none",
  severeHyperglycemia: false,
  hba1cGap: 0,
  reasons: [],
  evidence: [],
};

function product(step: number): IranMarketProductV2 {
  return {
    productId: `WEGOVY-${step}`,
    masterDrugId,
    nfiMatchState: "verified",
    genericName: "Semaglutide",
    brandName: "Wegovy",
    dosageFormGroup: "injection_pen",
    route: "subcutaneous",
    consumptionUnit: "pen",
    strengthComponents: [{ ingredientKey: masterDrugId, amount: step, unit: "mg" }],
    consumptionUnitsPerPurchaseUnit: 4,
    purchaseUnitLabel: "box",
    priceToman: 4_000_000,
    license: { everValid: true, currentValid: true, revoked: false },
    marketPresence: "confirmed_active",
  };
}

function rule(step: number): DoseRuleV2 {
  return {
    id: `LABEL-WEGOVY-MASH-TEST-${step}:WEGOVY-${step}`,
    masterDrugId,
    productId: `WEGOVY-${step}`,
    indication: "MASH F2-F3",
    lane: "liver",
    dosageFormGroup: "injection_pen",
    selectionRole: "product_specific",
    useCase: "continuation",
    formula: {
      kind: "fixed_interval_components",
      componentsPerAdministration: [{ ingredientKey: masterDrugId, amount: step, unit: "mg" }],
      administrationsPerPeriod: 1,
      periodDays: 7,
    },
    evidence: [],
    reviewState: "approved",
  };
}

function current(daysOnCurrentDose: number): IntervalAwareCurrentMedicationV2 {
  const administration = resolveCurrentMedicationAdministrationV2({
    genericName: "Semaglutide",
    brandName: "Wegovy",
    doseAmount: 0.5,
    doseUnit: "mg",
    administrationsPerPeriod: 1,
    administrationPeriodDays: 7,
    daysOnCurrentDose,
    therapyPhase: "escalation",
    nextAdministrationInDays: 0,
    adherence: "good",
    tolerance: "good",
  }, masterDrugId, "mg");
  return {
    masterDrugId,
    genericName: "Semaglutide",
    therapyGroup: "glp_1_receptor_agonist",
    route: "subcutaneous",
    dosageFormGroup: "injection_pen",
    status: "active",
    adherence: "good",
    tolerance: "good",
    brandName: "Wegovy",
    administrationInterval: administration.administrationInterval,
    intervalIssue: administration.intervalIssue,
  };
}

function request(daysOnCurrentDose: number): DecisionGraphRequestV2 {
  return {
    patient: {
      glycemia: { currentHba1c: 7, targetHba1c: 7 },
      currentMedications: [current(daysOnCurrentDose)],
    },
    preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    inventory: {
      knowledge: [],
      marketProducts: [product(0.5), product(1), product(2.4)],
      doseRules: [rule(0.5), rule(1), rule(2.4)],
      insurancePolicies: [],
    },
  };
}

function component(req: DecisionGraphRequestV2, selectedStep: number): RegimenComponentV2 {
  const dosePlan = resolveDosePlanV2(rule(selectedStep), req.patient, state);
  if (!dosePlan) throw new Error("test dose plan missing");
  return {
    masterDrugId,
    genericName: "Semaglutide",
    therapyGroup: "glp_1_receptor_agonist",
    tags: ["wegovy-mash-f2-f3"],
    dosePlan,
    availability: {
      masterDrugId,
      classification: "current_market",
      mainRecommendationEligible: true,
      moreOptionsEligible: true,
      currentProductIds: ["WEGOVY-0.5", "WEGOVY-1", "WEGOVY-2.4"],
      historicalProductIds: [],
      reasons: [],
    },
  };
}

describe("WEGOVY continuation cost authority boundary", () => {
  it("rejects an arbitrary multi-step jump even when an exact market product exists", () => {
    const req = request(28);
    expect(buildWegovyMashContinuationWindowCostV2({
      request: req,
      component: component(req, 2.4),
      windowDays: 7,
    })).toBeUndefined();
  });

  it("rejects a stale same-step plan after a tolerated 28-day escalation stage", () => {
    const req = request(28);
    expect(buildWegovyMashContinuationWindowCostV2({
      request: req,
      component: component(req, 0.5),
      windowDays: 7,
    })).toBeUndefined();
  });

  it("accepts exactly the next step selected by the clinical continuation gate", () => {
    const req = request(28);
    const plan = buildWegovyMashContinuationWindowCostV2({
      request: req,
      component: component(req, 1),
      windowDays: 7,
    });
    expect(plan?.selectedDoseMg).toBe(1);
    expect(plan?.costAuthority).toBe("conditional_projection");
    expect(plan?.phases[0]?.doseMg).toBe(1);
  });
});
