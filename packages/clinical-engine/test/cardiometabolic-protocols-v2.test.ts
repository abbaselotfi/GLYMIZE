import { describe, expect, it } from "vitest";
import {
  buildReviewedCardiometabolicDoseRulesV2,
  buildReviewedCardiometabolicGateRulesV2,
} from "../src/decision-graph-v2/cardiometabolic-protocols.js";
import {
  approvedDoseRulesForV2,
  resolveDosePlanV2,
} from "../src/decision-graph-v2/dose.js";
import {
  buildFactMapV2,
  evaluatePredicateV2,
} from "../src/decision-graph-v2/predicates.js";
import type {
  ClinicalStateV2,
  DecisionLaneV2,
  KidneyContextV2,
  KnowledgeMedicationV2,
  PatientContextV2,
} from "../src/decision-graph-v2/types.js";

const names = [
  ["ENALAPRIL", "Enalapril", "raas_blocker"],
  ["LOSARTAN", "Losartan", "raas_blocker"],
  ["VALSARTAN", "Valsartan", "raas_blocker"],
  ["ATORVASTATIN", "Atorvastatin", "lipid_lowering"],
  ["ROSUVASTATIN", "Rosuvastatin", "lipid_lowering"],
  ["FINERENONE", "Finerenone", "mineralocorticoid_receptor_antagonist"],
  ["SPIRONOLACTONE", "Spironolactone", "mineralocorticoid_receptor_antagonist"],
] as const;

const knowledge: KnowledgeMedicationV2[] = names.map(([id, genericName, therapyGroup]) => ({
  masterDrugId: `TEST-${id}`,
  genericName,
  combination: false,
  therapeuticAreas: ["Cardiometabolic"],
  therapyGroup,
  primaryLanes: therapyGroup === "lipid_lowering" ? ["lipids"] : ["hypertension", "kidney", "heart_failure"],
  routeOptions: ["oral"],
  efficacyBand: "none",
  hypoglycemiaRisk: "minimal",
  weightDirection: "neutral",
  effects: [],
  tags: [],
  evidence: [],
  engineState: "approved",
}));

const rules = buildReviewedCardiometabolicDoseRulesV2({ knowledge });
const state: ClinicalStateV2 = {
  pathway: "maintain_and_monitor",
  insulinAction: "none",
  severeHyperglycemia: false,
  hba1cGap: 0,
  reasons: [],
  evidence: [],
};

function patient(
  kidney: KidneyContextV2 = {},
  cardiovascular: PatientContextV2["cardiovascular"] = {},
): PatientContextV2 {
  return {
    pregnancy: false,
    glycemia: { currentHba1c: 7, targetHba1c: 7 },
    kidney,
    cardiovascular,
  };
}

function matching(
  masterDrugId: string,
  input: PatientContextV2,
  lane: DecisionLaneV2,
) {
  return approvedDoseRulesForV2(
    masterDrugId,
    rules,
    buildFactMapV2(input, false),
    "initiation",
    lane,
  );
}

function dailyMg(rule: ReturnType<typeof matching>[number], input: PatientContextV2) {
  const plan = resolveDosePlanV2(rule, input, state);
  return plan?.dailyComponents?.[0]?.amount;
}

describe("Phase 4 Task 8 cardiometabolic protocols", () => {
  it("keeps clinician-provided CrCl independent from eGFR and exposes dialysis separately", () => {
    const facts = buildFactMapV2(patient({
      eGfr: 82,
      creatinineClearanceMlMin: 29,
      dialysis: false,
    }), false);

    expect(facts["kidney.eGfr"]).toBe(82);
    expect(facts["kidney.creatinineClearanceMlMin"]).toBe(29);
    expect(facts["kidney.dialysis"]).toBe(false);
  });

  it("uses explicit CrCl for enalapril hypertension dosing and never substitutes eGFR", () => {
    const id = "TEST-ENALAPRIL";

    const standardPatient = patient({ eGfr: 20, creatinineClearanceMlMin: 31, dialysis: false });
    const standard = matching(id, standardPatient, "hypertension");
    expect(standard).toHaveLength(1);
    expect(dailyMg(standard[0]!, standardPatient)).toBe(5);

    const renalPatient = patient({ eGfr: 90, creatinineClearanceMlMin: 30, dialysis: false });
    const renal = matching(id, renalPatient, "hypertension");
    expect(renal).toHaveLength(1);
    expect(dailyMg(renal[0]!, renalPatient)).toBe(2.5);

    expect(matching(id, patient({ eGfr: 20, dialysis: false }), "hypertension")).toHaveLength(0);
    expect(matching(id, patient({ creatinineClearanceMlMin: 20, dialysis: true }), "hypertension")).toHaveLength(0);
  });

  it("applies the rosuvastatin severe-renal cap only from explicit CrCl and fails closed on dialysis", () => {
    const id = "TEST-ROSUVASTATIN";

    const severePatient = patient({ creatinineClearanceMlMin: 29, dialysis: false });
    const severe = matching(id, severePatient, "lipids");
    expect(severe).toHaveLength(1);
    expect(dailyMg(severe[0]!, severePatient)).toBe(5);
    expect(severe[0]!.maximumDoseText).toContain("10 mg");

    const standardPatient = patient({ creatinineClearanceMlMin: 30, dialysis: false });
    const standard = matching(id, standardPatient, "lipids");
    expect(standard).toHaveLength(1);
    expect(dailyMg(standard[0]!, standardPatient)).toBe(5);
    expect(standard[0]!.maximumDoseText).toContain("40 mg");

    expect(matching(id, patient({ eGfr: 80, dialysis: false }), "lipids")).toHaveLength(0);
    expect(matching(id, patient({ creatinineClearanceMlMin: 20, dialysis: true }), "lipids")).toHaveLength(0);
  });

  it("requires CKD, albuminuria, potassium and eGFR before finerenone becomes executable", () => {
    const id = "TEST-FINERENONE";
    const lowEgfr = patient({ ckd: true, uacrMgG: 30, potassiumMmolL: 5, eGfr: 25 });
    const lowEgfrRules = matching(id, lowEgfr, "kidney");
    expect(lowEgfrRules).toHaveLength(1);
    expect(dailyMg(lowEgfrRules[0]!, lowEgfr)).toBe(10);

    const highEgfr = patient({ ckd: true, uacrMgG: 30, potassiumMmolL: 5, eGfr: 60 });
    const highEgfrRules = matching(id, highEgfr, "kidney");
    expect(highEgfrRules).toHaveLength(1);
    expect(dailyMg(highEgfrRules[0]!, highEgfr)).toBe(20);

    expect(matching(id, patient({ ckd: true, potassiumMmolL: 4.5, eGfr: 60 }), "kidney")).toHaveLength(0);
    expect(matching(id, patient({ ckd: true, uacrMgG: 30, eGfr: 60 }), "kidney")).toHaveLength(0);
    expect(matching(id, patient({ ckd: true, uacrMgG: 30, potassiumMmolL: 5.1, eGfr: 60 }), "kidney")).toHaveLength(0);
    expect(matching(id, patient({ ckd: true, uacrMgG: 30, potassiumMmolL: 4.5, eGfr: 24 }), "kidney")).toHaveLength(0);
  });

  it("limits spironolactone initiation to the reviewed HFrEF eGFR/potassium phenotype", () => {
    const id = "TEST-SPIRONOLACTONE";
    const lowerRenal = patient(
      { eGfr: 50, potassiumMmolL: 5 },
      { heartFailure: true, lvefPercent: 40 },
    );
    const lowerRules = matching(id, lowerRenal, "heart_failure");
    expect(lowerRules).toHaveLength(1);
    expect(lowerRules[0]!.formula.kind).toBe("fixed_interval_components");
    if (lowerRules[0]!.formula.kind === "fixed_interval_components") {
      expect(lowerRules[0]!.formula.periodDays).toBe(2);
      expect(lowerRules[0]!.formula.componentsPerAdministration[0]?.amount).toBe(25);
    }

    const preservedRenal = patient(
      { eGfr: 51, potassiumMmolL: 5 },
      { heartFailure: true, lvefPercent: 40 },
    );
    const preservedRules = matching(id, preservedRenal, "heart_failure");
    expect(preservedRules).toHaveLength(1);
    expect(dailyMg(preservedRules[0]!, preservedRenal)).toBe(25);

    expect(matching(id, patient(
      { eGfr: 60, potassiumMmolL: 5.1 },
      { heartFailure: true, lvefPercent: 35 },
    ), "heart_failure")).toHaveLength(0);
    expect(matching(id, patient(
      { eGfr: 60, potassiumMmolL: 4.5 },
      { heartFailure: true, lvefPercent: 45 },
    ), "heart_failure")).toHaveLength(0);
  });

  it("preserves the pregnancy boundary for ACEi/ARB/MRA and conditional statin review", () => {
    const gates = buildReviewedCardiometabolicGateRulesV2(knowledge);
    const facts = buildFactMapV2({
      pregnancy: true,
      glycemia: { currentHba1c: 7, targetHba1c: 7 },
    }, false);

    const active = gates.filter((gate) => evaluatePredicateV2(gate.when, facts));
    const hardExcluded = active.filter((gate) => gate.effect === "exclude").map((gate) => gate.masterDrugId);
    const conditional = active.filter((gate) => gate.effect === "conditional").map((gate) => gate.masterDrugId);

    expect(hardExcluded).toEqual(expect.arrayContaining([
      "TEST-ENALAPRIL",
      "TEST-LOSARTAN",
      "TEST-VALSARTAN",
      "TEST-FINERENONE",
      "TEST-SPIRONOLACTONE",
    ]));
    expect(conditional).toEqual(expect.arrayContaining([
      "TEST-ATORVASTATIN",
      "TEST-ROSUVASTATIN",
    ]));
  });
});
