import { describe, expect, it } from "vitest";
import {
  composeTreatmentPlanV2,
  dominatesV2,
  generateRegimenCandidatesV2,
  runDecisionGraphV2,
  type ClinicalObjectiveV2,
  type ClinicalStateV2,
  type DecisionGraphRequestV2,
  type RegimenCandidateV2,
} from "../src/index.js";

const evidence = [{ sourceId: "T", title: "T", url: "https://example.test" }];
const state: ClinicalStateV2 = { pathway: "modest_intensification", insulinAction: "none", severeHyperglycemia: false, hba1cGap: 1, reasons: [], evidence };

function request(overrides: Partial<DecisionGraphRequestV2> = {}): DecisionGraphRequestV2 {
  return {
    patient: { glycemia: { currentHba1c: 8, targetHba1c: 7 } },
    preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    inventory: { knowledge: [], marketProducts: [], doseRules: [], insurancePolicies: [], regimenConflictRules: [] },
    ...overrides,
  };
}

function candidate(input: {
  id: string;
  lane?: RegimenCandidateV2["lane"];
  masterDrugId: string;
  therapyGroup: string;
  objectives: RegimenCandidateV2["objectiveCoverage"];
  doseMg?: number;
  cost?: number;
  tags?: string[];
}): RegimenCandidateV2 {
  const lane = input.lane ?? "glycemic";
  return {
    regimenId: input.id,
    lane,
    kind: lane === "glycemic" ? "single" : "organ_protection",
    components: [{
      masterDrugId: input.masterDrugId,
      genericName: input.masterDrugId,
      therapyGroup: input.therapyGroup,
      tags: input.tags ?? [input.therapyGroup],
      availability: { masterDrugId: input.masterDrugId, classification: "current_market", mainRecommendationEligible: true, moreOptionsEligible: true, currentProductIds: [input.masterDrugId], historicalProductIds: [], reasons: [] },
      dosePlan: input.doseMg === undefined ? undefined : {
        ruleId: `${input.id}-dose`, masterDrugId: input.masterDrugId, lane, dosageFormGroup: "tablet",
        dailyComponents: [{ ingredientKey: input.masterDrugId, amount: input.doseMg, unit: "mg" }],
        perAdministrationComponents: [{ ingredientKey: input.masterDrugId, amount: input.doseMg, unit: "mg" }],
        administrationsPerDay: 1, displayStartDose: `${input.doseMg} mg/day`, monitoring: [], evidence, clinicianConfirmationRequired: true,
      },
      genericCostBenchmark: input.cost === undefined ? undefined : {
        basis: "single_current_market", referenceMonthlyCashCostToman: input.cost, lowestMonthlyCashCostToman: input.cost, highestMonthlyCashCostToman: input.cost, medianMonthlyCashCostToman: input.cost,
        referenceNormalized30DayCostToman: input.cost, lowestNormalized30DayCostToman: input.cost, highestNormalized30DayCostToman: input.cost, medianNormalized30DayCostToman: input.cost,
        referenceProductId: input.masterDrugId, comparableProductIds: [input.masterDrugId],
      },
    }],
    efficacyBand: "high",
    hypoglycemiaRisk: "low",
    weightProfile: "neutral",
    objectiveCoverage: input.objectives,
    objectiveStrength: Object.fromEntries(input.objectives.map((id) => [id, "benefit"])) as RegimenCandidateV2["objectiveStrength"],
    evidence,
    gate: { status: "pass", reasons: [], evidence: [] },
    routeFit: "match",
    insuranceFit: "unknown",
    monthlyPatientCostToman: input.cost,
    dailyAdministrationBurden: 1,
    distinctProducts: 1,
    reasons: [], cautions: [], preferenceConflicts: [],
  };
}

const glycemicObjective: ClinicalObjectiveV2 = { id: "glycemic_control", lane: "glycemic", level: "mandatory", reason: "above target", evidence };
const kidneyObjective: ClinicalObjectiveV2 = { id: "kidney_protection", lane: "kidney", level: "mandatory", reason: "CKD", evidence };
const hfObjective: ClinicalObjectiveV2 = { id: "heart_failure_protection", lane: "heart_failure", level: "mandatory", reason: "HF", evidence };

describe("V2.7 regimen composer", () => {
  it("coalesces the same molecule across glycemic and kidney lanes", () => {
    const gly = candidate({ id: "gly-empa", masterDrugId: "EMPA", therapyGroup: "sglt2_inhibitor", objectives: ["glycemic_control", "kidney_protection"], doseMg: 10, cost: 100000 });
    const kidney = candidate({ id: "kidney-empa", lane: "kidney", masterDrugId: "EMPA", therapyGroup: "sglt2_inhibitor", objectives: ["kidney_protection"], doseMg: 10, cost: 100000 });
    const plan = composeTreatmentPlanV2({ request: request(), state, objectives: [glycemicObjective, kidneyObjective], glycemicRegimen: gly, executableCandidates: [gly, kidney] })!;
    expect(plan.components).toHaveLength(1);
    expect(plan.components[0]?.sourceLanes.sort()).toEqual(["glycemic", "kidney"]);
    expect(plan.coveredObjectives).toContain("kidney_protection");
  });

  it("reconciles a glycemic starting dose to a reviewed mandatory organ-lane dose for the same molecule", () => {
    const gly = candidate({ id: "gly-dapa", masterDrugId: "DAPA", therapyGroup: "sglt2_inhibitor", objectives: ["glycemic_control", "kidney_protection"], doseMg: 5 });
    const kidney = candidate({ id: "kidney-dapa", lane: "kidney", masterDrugId: "DAPA", therapyGroup: "sglt2_inhibitor", objectives: ["kidney_protection"], doseMg: 10 });
    const plan = composeTreatmentPlanV2({ request: request(), state, objectives: [glycemicObjective, kidneyObjective], glycemicRegimen: gly, executableCandidates: [gly, kidney] })!;
    expect(plan.components[0]?.dosePlan?.dailyComponents?.[0]?.amount).toBe(10);
    expect(plan.components[0]?.sourceLanes).toContain("kidney");
  });

  it("uses one SGLT2 across multiple organ lanes instead of adding a same-class duplicate", () => {
    const gly = candidate({ id: "gly-met", masterDrugId: "MET", therapyGroup: "biguanide", objectives: ["glycemic_control"], doseMg: 1000 });
    const kidneyEmpa = candidate({ id: "kidney-empa", lane: "kidney", masterDrugId: "EMPA", therapyGroup: "sglt2_inhibitor", objectives: ["kidney_protection"], doseMg: 10, cost: 200000 });
    const hfEmpa = candidate({ id: "hf-empa", lane: "heart_failure", masterDrugId: "EMPA", therapyGroup: "sglt2_inhibitor", objectives: ["heart_failure_protection"], doseMg: 10, cost: 200000 });
    const hfDapa = candidate({ id: "hf-dapa", lane: "heart_failure", masterDrugId: "DAPA", therapyGroup: "sglt2_inhibitor", objectives: ["heart_failure_protection"], doseMg: 10, cost: 100000 });
    const plan = composeTreatmentPlanV2({ request: request(), state, objectives: [glycemicObjective, kidneyObjective, hfObjective], glycemicRegimen: gly, executableCandidates: [gly, kidneyEmpa, hfEmpa, hfDapa] })!;
    const sglt2 = plan.components.filter((item) => item.therapyGroup === "sglt2_inhibitor");
    expect(sglt2).toHaveLength(1);
    expect(sglt2[0]?.masterDrugId).toBe("EMPA");
    expect(sglt2[0]?.servesObjectives).toContain("heart_failure_protection");
  });

  it("marks existing therapy as continue and new therapy as start", () => {
    const gly = candidate({ id: "gly-met", masterDrugId: "MET", therapyGroup: "biguanide", objectives: ["glycemic_control"], doseMg: 1000 });
    const kidney = candidate({ id: "kidney-empa", lane: "kidney", masterDrugId: "EMPA", therapyGroup: "sglt2_inhibitor", objectives: ["kidney_protection"], doseMg: 10 });
    const req = request({ patient: { glycemia: { currentHba1c: 8, targetHba1c: 7 }, currentMedications: [{ masterDrugId: "MET", genericName: "Metformin", therapyGroup: "biguanide" }] } });
    const plan = composeTreatmentPlanV2({ request: req, state, objectives: [glycemicObjective, kidneyObjective], glycemicRegimen: gly, executableCandidates: [gly, kidney] })!;
    expect(plan.components.find((item) => item.masterDrugId === "MET")?.action).toBe("continue");
    expect(plan.components.find((item) => item.masterDrugId === "EMPA")?.action).toBe("start");
  });

  it("never converts omission of a current medication into an automatic stop order", () => {
    const gly = candidate({ id: "gly-met", masterDrugId: "MET", therapyGroup: "biguanide", objectives: ["glycemic_control"], doseMg: 1000 });
    const req = request({ patient: { glycemia: { currentHba1c: 8, targetHba1c: 7 }, currentMedications: [{ masterDrugId: "SU", genericName: "Sulfonylurea", therapyGroup: "sulfonylurea" }] } });
    const plan = composeTreatmentPlanV2({ request: req, state, objectives: [glycemicObjective], glycemicRegimen: gly, executableCandidates: [gly] })!;
    expect(plan.currentTherapyReview[0]?.disposition).toBe("review_for_discontinuation");
    expect(plan.currentTherapyReview[0]?.reason).toContain("دستور قطع خودکار نیست");
  });

  it("preserves current therapy review when the pathway is maintain-and-monitor", () => {
    const maintain: ClinicalStateV2 = { ...state, pathway: "maintain_and_monitor", hba1cGap: 0 };
    const req = request({ patient: { glycemia: { currentHba1c: 7, targetHba1c: 7 }, currentMedications: [{ masterDrugId: "MET", genericName: "Metformin", therapyGroup: "biguanide" }] } });
    const organ = candidate({ id: "kidney-empa", lane: "kidney", masterDrugId: "EMPA", therapyGroup: "sglt2_inhibitor", objectives: ["kidney_protection"], doseMg: 10 });
    const plan = composeTreatmentPlanV2({ request: req, state: maintain, objectives: [kidneyObjective], executableCandidates: [organ] })!;
    expect(plan.currentTherapyReview[0]?.disposition).toBe("continue_pending_standard_review");
  });

  it("does not create a new glycemic recommendation solely because market candidates exist when A1C is at target", () => {
    const result = runDecisionGraphV2({
      patient: { glycemia: { currentHba1c: 7, targetHba1c: 7 } },
      preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
      inventory: { knowledge: [], marketProducts: [], doseRules: [], insurancePolicies: [] },
    });
    expect(result.primary).toBeUndefined();
    expect(result.treatmentPlan).toBeUndefined();
    expect(result.status).toBe("complete");
  });

  it("reports unresolved mandatory objectives instead of silently filling them with an incompatible regimen", () => {
    const gly = candidate({ id: "gly-met", masterDrugId: "MET", therapyGroup: "biguanide", objectives: ["glycemic_control"], doseMg: 1000 });
    const plan = composeTreatmentPlanV2({ request: request(), state, objectives: [glycemicObjective, kidneyObjective], glycemicRegimen: gly, executableCandidates: [gly] })!;
    expect(plan.unresolvedObjectives).toContain("kidney_protection");
  });

  it("rebuilds the full recognized current regimen before generating one add-on", () => {
    const med = (id: string, group: string) => ({
      masterDrugId: id, genericName: id, combination: false, therapeuticAreas: ["Diabetes"], therapyGroup: group, primaryLanes: ["glycemic" as const],
      routeOptions: ["oral"], efficacyBand: "high" as const, hypoglycemiaRisk: "low" as const, weightDirection: "neutral" as const, effects: [], evidence, engineState: "approved" as const,
    });
    const product = (id: string) => ({
      productId: `P-${id}`, masterDrugId: id, nfiMatchState: "verified" as const, genericName: id, dosageFormGroup: "tablet", route: "oral", consumptionUnit: "tablet",
      strengthComponents: [{ ingredientKey: id, amount: 1, unit: "mg" }], consumptionUnitsPerPurchaseUnit: 30, purchaseUnitLabel: "30 tablets",
      license: { everValid: true, currentValid: true }, marketPresence: "confirmed_active" as const, observedAt: "2026-08-08",
    });
    const req = request({
      patient: { glycemia: { currentHba1c: 8, targetHba1c: 7 }, currentMedications: [
        { masterDrugId: "MET", genericName: "MET", therapyGroup: "biguanide" },
        { masterDrugId: "EMPA", genericName: "EMPA", therapyGroup: "sglt2_inhibitor" },
      ] },
      inventory: { knowledge: [med("MET", "biguanide"), med("EMPA", "sglt2_inhibitor"), med("SITA", "dpp4_inhibitor")], marketProducts: [product("MET"), product("EMPA"), product("SITA")], doseRules: [], insurancePolicies: [] },
    });
    const generated = generateRegimenCandidatesV2(req, state);
    expect(generated.some((item) => item.kind === "current_regimen_plus_add_on" && item.components.map((c) => c.masterDrugId).sort().join("+") === "EMPA+MET+SITA")).toBe(true);
  });

  it("does not treat greater raw efficacy as a universal Pareto advantage after adequacy is met", () => {
    const high = candidate({ id: "high", masterDrugId: "A", therapyGroup: "biguanide", objectives: ["glycemic_control"], cost: 100000 });
    const veryHigh = { ...high, regimenId: "very-high", masterDrugId: undefined, efficacyBand: "very_high" as const };
    expect(dominatesV2(veryHigh, high, [glycemicObjective])).toBe(false);
    expect(dominatesV2(high, veryHigh, [glycemicObjective])).toBe(false);
  });


  it("does not let overlap or lower cost displace explicit strong organ-outcome evidence", () => {
    const gly = candidate({ id: "gly-glp", masterDrugId: "GLP", therapyGroup: "glp_1_receptor_agonist", objectives: ["glycemic_control", "kidney_protection"], doseMg: 1, cost: 100000 });
    const kidneyGlp = candidate({ id: "kidney-glp", lane: "kidney", masterDrugId: "GLP", therapyGroup: "glp_1_receptor_agonist", objectives: ["kidney_protection"], doseMg: 1, cost: 100000 });
    const kidneySglt2 = candidate({ id: "kidney-sglt2", lane: "kidney", masterDrugId: "SGLT2", therapyGroup: "sglt2_inhibitor", objectives: ["kidney_protection"], doseMg: 10, cost: 300000 });
    kidneySglt2.objectiveStrength.kidney_protection = "strong_benefit";
    const plan = composeTreatmentPlanV2({ request: request(), state, objectives: [glycemicObjective, kidneyObjective], glycemicRegimen: gly, executableCandidates: [gly, kidneyGlp, kidneySglt2] })!;
    expect(plan.components.some((item) => item.masterDrugId === "SGLT2")).toBe(true);
    expect(plan.components).toHaveLength(2);
  });

});
