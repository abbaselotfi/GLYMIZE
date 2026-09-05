import { describe, expect, it } from "vitest";
import {
  resolveCurrentMedicationAdministrationV2,
  type IntervalAwareCurrentMedicationV2,
} from "../src/decision-graph-v2/current-medication-interval.js";
import { enrichCandidateWithDoseMarketCostV2 as enrichBaseV2 } from "../src/decision-graph-v2/enrich.js";
import { enrichCandidateWithDoseMarketCostV2 } from "../src/decision-graph-v2/enrich-wegovy-continuation.js";
import { resolveDosePlanV2 } from "../src/decision-graph-v2/dose.js";
import {
  attachWegovyMashContinuationCostV2,
  buildWegovyMashContinuationWindowCostV2,
  executableContinuationMonthlyCostV2,
  wegovyMashContinuationCostV2,
} from "../src/decision-graph-v2/wegovy-continuation-cost.js";
import type {
  ClinicalStateV2,
  DecisionGraphRequestV2,
  DoseRuleV2,
  IranMarketProductV2,
  RegimenCandidateV2,
  ResolvedDosePlanV2,
} from "../src/decision-graph-v2/types.js";

const masterDrugId = "TEST-SEMAGLUTIDE-SC";
const steps = [0.25, 0.5, 1, 1.7, 2.4] as const;
type Step = (typeof steps)[number];

function productId(step: Step) {
  return `TEST-WEGOVY-${String(step).replace(".", "_")}`;
}

function product(step: Step): IranMarketProductV2 {
  return {
    productId: productId(step),
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

function rule(step: Step): DoseRuleV2 {
  const phase = step === 0.25 ? "INIT" : step === 2.4 ? "MAINT" : step === 1.7 ? "MAINT-ALT" : "ESCALATION";
  return {
    id: `LABEL-WEGOVY-MASH-${phase}-${String(step).replace(".", "_")}:${productId(step)}`,
    masterDrugId,
    productId: productId(step),
    indication: "MASH F2-F3",
    lane: "liver",
    dosageFormGroup: "injection_pen",
    selectionRole: "product_specific",
    useCase: step === 0.25 ? "either" : "continuation",
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

const state: ClinicalStateV2 = {
  pathway: "maintain_and_monitor",
  insulinAction: "none",
  severeHyperglycemia: false,
  hba1cGap: 0,
  reasons: [],
  evidence: [],
};

function selectedPlan(step: Step, patient: DecisionGraphRequestV2["patient"]): ResolvedDosePlanV2 {
  const plan = resolveDosePlanV2(rule(step), patient, state);
  if (!plan) throw new Error(`test dose plan missing for ${step}`);
  return plan;
}

function current(input: {
  step: Step;
  daysOnCurrentDose: number;
  therapyPhase: "initiation" | "escalation" | "maintenance";
  nextAdministrationInDays?: number;
  tolerance?: "good" | "limited" | "intolerant" | "unknown";
}): IntervalAwareCurrentMedicationV2 {
  const administration = resolveCurrentMedicationAdministrationV2({
    genericName: "Semaglutide",
    brandName: "Wegovy",
    referencePresentationId: productId(input.step),
    doseAmount: input.step,
    doseUnit: "mg",
    administrationsPerPeriod: 1,
    administrationPeriodDays: 7,
    daysOnCurrentDose: input.daysOnCurrentDose,
    therapyPhase: input.therapyPhase,
    nextAdministrationInDays: input.nextAdministrationInDays,
    adherence: "good",
    tolerance: input.tolerance ?? "good",
  }, masterDrugId, "mg");
  return {
    masterDrugId,
    genericName: "Semaglutide",
    therapyGroup: "glp_1_receptor_agonist",
    route: "subcutaneous",
    dosageFormGroup: "injection_pen",
    status: "active",
    adherence: "good",
    tolerance: input.tolerance ?? "good",
    administrationInterval: administration.administrationInterval,
    intervalIssue: administration.intervalIssue,
    brandName: "Wegovy",
  };
}

function request(currentMedication: IntervalAwareCurrentMedicationV2): DecisionGraphRequestV2 {
  return {
    patient: {
      ageYears: 52,
      glycemia: { currentHba1c: 7, targetHba1c: 7 },
      liver: { masldMash: true, fibrosisStage: "F3", cirrhosis: false, decompensatedCirrhosis: false },
      currentMedications: [currentMedication],
    },
    preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    inventory: {
      knowledge: [],
      marketProducts: steps.map(product),
      doseRules: steps.map(rule),
      insurancePolicies: [],
      medicationGateRules: [],
      regimenConflictRules: [],
      regimenTemplates: [],
      frcProtocolBindings: [],
      insulinConversionRules: [],
      titrationProtocols: [],
    },
  };
}

function candidate(req: DecisionGraphRequestV2, target: Step): RegimenCandidateV2 {
  const plan = selectedPlan(target, req.patient);
  return {
    regimenId: `single:${masterDrugId}:liver`,
    lane: "liver",
    kind: "organ_protection",
    components: [{
      masterDrugId,
      genericName: "Semaglutide",
      therapyGroup: "glp_1_receptor_agonist",
      tags: ["wegovy-mash-f2-f3"],
      dosePlan: plan,
      availability: {
        masterDrugId,
        classification: "current_market",
        mainRecommendationEligible: true,
        moreOptionsEligible: true,
        currentProductIds: steps.map(productId),
        historicalProductIds: [],
        reasons: [],
      },
    }],
    efficacyBand: "none",
    hypoglycemiaRisk: "minimal",
    weightProfile: "loss",
    objectiveCoverage: ["liver_directed_therapy"],
    objectiveStrength: { liver_directed_therapy: "strong_benefit" },
    evidence: [],
    gate: { status: "pass", reasons: [], evidence: [] },
    routeFit: "match",
    insuranceFit: "unknown",
    distinctProducts: 1,
    reasons: [],
    cautions: [],
    preferenceConflicts: [],
  };
}

describe("WEGOVY continuation-window phase-aware cost", () => {
  it("requires a valid next-administration anchor for interval costing", () => {
    const invalid = resolveCurrentMedicationAdministrationV2({
      genericName: "Semaglutide",
      doseAmount: 2.4,
      doseUnit: "mg",
      administrationsPerPeriod: 1,
      administrationPeriodDays: 7,
      daysOnCurrentDose: 60,
      therapyPhase: "maintenance",
      nextAdministrationInDays: 7,
    }, masterDrugId, "mg");
    expect(invalid.intervalIssue).toContain("nextAdministrationInDays");
    expect(invalid.administrationInterval).toBeUndefined();

    const missing = current({ step: 2.4, daysOnCurrentDose: 60, therapyPhase: "maintenance" });
    const req = request(missing);
    expect(buildWegovyMashContinuationWindowCostV2({ request: req, component: candidate(req, 2.4).components[0]!, windowDays: 30 })).toBeUndefined();
  });

  it("calculates exact discrete 2.4 mg maintenance cost from the next-dose anchor", () => {
    const med = current({ step: 2.4, daysOnCurrentDose: 60, therapyPhase: "maintenance", nextAdministrationInDays: 0 });
    const req = request(med);
    const comp = candidate(req, 2.4).components[0]!;
    comp.selectedProduct = product(2.4);
    const plan = buildWegovyMashContinuationWindowCostV2({ request: req, component: comp, windowDays: 30 });
    expect(plan?.costAuthority).toBe("executable");
    expect(plan?.totalAdministrations).toBe(5);
    expect(plan?.normalizedTreatmentValueToman).toBe(5_000_000);
    expect(plan?.cashPurchaseCostToman).toBe(8_000_000);
    expect(plan?.carryoverInventoryValueToman).toBe(3_000_000);

    attachWegovyMashContinuationCostV2(comp, plan!);
    const exact = executableContinuationMonthlyCostV2(comp);
    expect(exact?.consumptionUnits30Days).toBe(5);
    expect(exact?.purchaseUnitsNeeded30Days).toBe(2);
    expect(exact?.normalized30DayTreatmentCostToman).toBe(5_000_000);
  });

  it("respects a later next dose and avoids fractional weekly administration math", () => {
    const med = current({ step: 2.4, daysOnCurrentDose: 60, therapyPhase: "maintenance", nextAdministrationInDays: 3 });
    const req = request(med);
    const plan = buildWegovyMashContinuationWindowCostV2({ request: req, component: candidate(req, 2.4).components[0]!, windowDays: 30 });
    expect(plan?.costAuthority).toBe("executable");
    expect(plan?.totalAdministrations).toBe(4);
    expect(plan?.phases[0]?.firstAdministrationDay).toBe(4);
    expect(plan?.phases[0]?.lastAdministrationDay).toBe(25);
    expect(plan?.normalizedTreatmentValueToman).toBe(4_000_000);
    expect(plan?.cashPurchaseCostToman).toBe(4_000_000);
    expect(plan?.carryoverInventoryValueToman).toBe(0);
  });

  it("keeps future escalation as a display-only conditional projection", () => {
    const med = current({ step: 0.5, daysOnCurrentDose: 14, therapyPhase: "escalation", nextAdministrationInDays: 0 });
    const req = request(med);
    const plan = buildWegovyMashContinuationWindowCostV2({ request: req, component: candidate(req, 0.5).components[0]!, windowDays: 30 });
    expect(plan?.costAuthority).toBe("conditional_projection");
    expect(plan?.totalAdministrations).toBe(5);
    expect(plan?.phases.map((phase) => [phase.doseMg, phase.administrationsInWindow])).toEqual([
      [0.5, 2],
      [1, 3],
    ]);
    expect(plan?.projectionAssumption).toContain("continued tolerability");

    const enriched = enrichCandidateWithDoseMarketCostV2(req, candidate(req, 0.5));
    expect(enriched.monthlyPatientCostToman).toBeUndefined();
    expect(enriched.components[0]?.selectedProductCost).toBeUndefined();
    expect(wegovyMashContinuationCostV2(enriched.components[0]!)?.costAuthority).toBe("conditional_projection");
    expect(enriched.cautions.join(" ")).toContain("display-only");
  });

  it("restores exact maintenance cost into the live candidate without changing insurance authority", () => {
    const med = current({ step: 2.4, daysOnCurrentDose: 60, therapyPhase: "maintenance", nextAdministrationInDays: 0 });
    const req = request(med);
    const enriched = enrichCandidateWithDoseMarketCostV2(req, candidate(req, 2.4));
    expect(enriched.monthlyPatientCostToman).toBe(5_000_000);
    expect(enriched.components[0]?.selectedProductCost?.normalized30DayTreatmentCostToman).toBe(5_000_000);
    expect(enriched.components[0]?.selectedProductCost?.purchaseUnitsNeeded30Days).toBe(2);
    expect(enriched.insuranceFit).toBe("unknown");
    expect(wegovyMashContinuationCostV2(enriched.components[0]!)?.costAuthority).toBe("executable");
    expect(enriched.cautions.join(" ")).not.toContain("cost تک-strength جایگزین آن نشده است");
  });

  it("treats an already-authorized move from 1.7 mg escalation to 2.4 mg as stable maintenance costing", () => {
    const med = current({ step: 1.7, daysOnCurrentDose: 28, therapyPhase: "escalation", nextAdministrationInDays: 0 });
    const req = request(med);
    const plan = buildWegovyMashContinuationWindowCostV2({ request: req, component: candidate(req, 2.4).components[0]!, windowDays: 30 });
    expect(plan?.costAuthority).toBe("executable");
    expect(plan?.selectedDoseMg).toBe(2.4);
    expect(plan?.phases).toHaveLength(1);
    expect(plan?.phases[0]?.doseMg).toBe(2.4);
  });

  it("preserves base enrichment byte-for-byte for a non-WEGOVY candidate", () => {
    const med = current({ step: 2.4, daysOnCurrentDose: 60, therapyPhase: "maintenance", nextAdministrationInDays: 0 });
    const req = request(med);
    const plain = candidate(req, 2.4);
    plain.components[0]!.dosePlan = { ...plain.components[0]!.dosePlan!, ruleId: "OTHER-APPROVED-RULE" };
    const base = enrichBaseV2(req, structuredClone(plain));
    const wrapped = enrichCandidateWithDoseMarketCostV2(req, structuredClone(plain));
    expect(wrapped).toEqual(base);
  });
});
