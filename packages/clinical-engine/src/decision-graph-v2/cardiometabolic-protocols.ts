import type {
  DecisionGraphInventoryV2,
  DoseRuleV2,
  EvidenceReferenceV2,
  KnowledgeMedicationV2,
  MedicationGateRuleV2,
} from "./types.js";

function normalized(value: string | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function medicationByName(
  knowledge: readonly KnowledgeMedicationV2[],
  name: string,
) {
  const wanted = normalized(name);
  return knowledge.find((item) => normalized(item.genericName) === wanted);
}

function regulatoryEvidence(
  sourceId: string,
  title: string,
  version: string,
  url: string,
  locator: string,
): EvidenceReferenceV2 {
  return {
    sourceId,
    title,
    version,
    url,
    locator,
    strength: "regulatory_label",
  };
}

export const cardiometabolicRegulatoryEvidenceV2 = {
  enalapril: regulatoryEvidence(
    "US-LABEL-ENALAPRIL-2026",
    "Enalapril maleate tablets — U.S. prescribing information",
    "DailyMed label reviewed 2026-09-05",
    "https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=63187a94-9ac7-4320-ac70-0631e08c2b8d",
    "Dosage and Administration — hypertension renal-adjustment table; Heart Failure",
  ),
  losartan: regulatoryEvidence(
    "US-LABEL-LOSARTAN-2026",
    "Losartan potassium tablets — U.S. prescribing information",
    "DailyMed label reviewed 2026-09-05",
    "https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e5886220-43b7-46e1-9034-5242ba245bd1",
    "Dosage and Administration 2.1, 2.3, 2.4",
  ),
  valsartan: regulatoryEvidence(
    "US-LABEL-VALSARTAN-2026",
    "Valsartan tablets — U.S. prescribing information",
    "DailyMed label reviewed 2026-09-05",
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=04b3c573-4ef7-5cf6-e063-6294a90a2c5f",
    "Dosage and Administration 2.2, 2.4",
  ),
  spironolactone: regulatoryEvidence(
    "US-LABEL-SPIRONOLACTONE-2026",
    "Spironolactone tablets — U.S. prescribing information",
    "DailyMed SPL 2026-04-14",
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b119ed8a-289a-46c5-9778-6b07e4c061c4",
    "Dosage and Administration 2.2",
  ),
  finerenone: regulatoryEvidence(
    "US-LABEL-KERENDIA-2025",
    "Kerendia (finerenone) — U.S. prescribing information",
    "DailyMed SPL 2025-08-28",
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=fc726765-5d5a-4d6e-b037-b847bda9fb7c",
    "Dosage and Administration 2.1–2.3",
  ),
  atorvastatin: regulatoryEvidence(
    "US-LABEL-ATORVASTATIN-2026",
    "Atorvastatin calcium tablets — U.S. prescribing information",
    "DailyMed updated 2026-03-06",
    "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=0e24e7cb-1949-6686-e063-6394a90a4760",
    "Dosage and Administration 2.2",
  ),
  rosuvastatin: regulatoryEvidence(
    "US-LABEL-ROSUVASTATIN-2026",
    "Rosuvastatin tablets — U.S. prescribing information",
    "DailyMed label reviewed 2026-09-05",
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4148e0b3-0340-9f3a-e063-6394a90afc96",
    "Dosage and Administration 2.2, 2.5; severe renal impairment",
  ),
} as const;

const adaCvdPregnancy: EvidenceReferenceV2 = {
  sourceId: "ADA10-2026",
  title: "Standards of Care in Diabetes—2026, Section 10: Cardiovascular Disease and Risk Management",
  version: "ADA Standards of Care 2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S216/163933/10-Cardiovascular-Disease-and-Risk-Management",
  locator: "Recommendations 10.10–10.12",
  strength: "guideline_grade_a",
};

function fixedDailyRule(
  input: Omit<DoseRuleV2, "formula" | "reviewState"> & {
    totalDailyMg: number;
    administrationsPerDay: number;
  },
): DoseRuleV2 {
  const { totalDailyMg, administrationsPerDay, ...rest } = input;
  return {
    ...rest,
    formula: {
      kind: "fixed_daily_components",
      dailyComponents: [{
        ingredientKey: input.masterDrugId,
        amount: totalDailyMg,
        unit: "mg",
      }],
      administrationsPerDay,
    },
    reviewState: "approved",
  };
}

/**
 * Exact reviewed initiation-dose rules for the first Phase 4 cardiometabolic
 * cohort. These rules never use class-average dosing. CrCl and eGFR remain
 * distinct patient facts: a CrCl-labelled branch cannot execute from eGFR.
 */
export function buildReviewedCardiometabolicDoseRulesV2(
  inventory: Pick<DecisionGraphInventoryV2, "knowledge">,
): DoseRuleV2[] {
  const rules: DoseRuleV2[] = [];
  const enalapril = medicationByName(inventory.knowledge, "Enalapril");
  const losartan = medicationByName(inventory.knowledge, "Losartan");
  const valsartan = medicationByName(inventory.knowledge, "Valsartan");
  const spironolactone = medicationByName(inventory.knowledge, "Spironolactone");
  const finerenone = medicationByName(inventory.knowledge, "Finerenone");
  const atorvastatin = medicationByName(inventory.knowledge, "Atorvastatin");
  const rosuvastatin = medicationByName(inventory.knowledge, "Rosuvastatin");

  if (enalapril) {
    rules.push(
      fixedDailyRule({
        id: `LABEL-ENALAPRIL-HTN-CRCLGT30:${enalapril.masterDrugId}`,
        masterDrugId: enalapril.masterDrugId,
        indication: "adult hypertension; CrCl >30 mL/min; not on dialysis",
        lane: "hypertension",
        useCase: "initiation",
        totalDailyMg: 5,
        administrationsPerDay: 1,
        eligibility: {
          all: [
            { fact: "kidney.creatinineClearanceMlMin", op: "gt", value: 30 },
            { fact: "kidney.dialysis", op: "eq", value: false },
          ],
        },
        titration: {
          stepText: "Titrate upward according to blood-pressure response and tolerability; renal function and potassium must be reviewed during treatment.",
        },
        targetDoseText: "Usual adult hypertension range is individualized from the 5 mg starting branch.",
        maximumDoseText: "40 mg/day per label.",
        monitoring: ["Blood pressure", "serum creatinine/renal function", "serum potassium", "symptomatic hypotension"],
        evidence: [cardiometabolicRegulatoryEvidenceV2.enalapril],
      }),
      fixedDailyRule({
        id: `LABEL-ENALAPRIL-HTN-CRCL30ORLESS:${enalapril.masterDrugId}`,
        masterDrugId: enalapril.masterDrugId,
        indication: "adult hypertension with CrCl ≤30 mL/min; not on dialysis",
        lane: "hypertension",
        useCase: "initiation",
        totalDailyMg: 2.5,
        administrationsPerDay: 1,
        eligibility: {
          all: [
            { fact: "kidney.creatinineClearanceMlMin", op: "lte", value: 30 },
            { fact: "kidney.dialysis", op: "eq", value: false },
          ],
        },
        titration: {
          stepText: "Titrate upward until blood pressure is controlled while monitoring renal function, potassium, and tolerability.",
        },
        maximumDoseText: "40 mg/day per label; dialysis-day dosing is a separate non-automated branch.",
        monitoring: ["Blood pressure", "serum creatinine/renal function", "serum potassium", "symptomatic hypotension"],
        evidence: [cardiometabolicRegulatoryEvidenceV2.enalapril],
      }),
      fixedDailyRule({
        id: `LABEL-ENALAPRIL-HF-START:${enalapril.masterDrugId}`,
        masterDrugId: enalapril.masterDrugId,
        indication: "symptomatic heart failure — standard adult initiation",
        lane: "heart_failure",
        useCase: "initiation",
        totalDailyMg: 2.5,
        administrationsPerDay: 1,
        titration: {
          stepText: "Titrate upward as tolerated under clinician supervision; do not automate escalation when hypotension, renal deterioration, hyponatremia, or other modifiers are unresolved.",
        },
        targetDoseText: "Label dosing range 2.5–20 mg twice daily after individualized titration.",
        maximumDoseText: "40 mg/day in divided doses in heart-failure clinical trials.",
        monitoring: ["Blood pressure", "renal function", "serum potassium", "symptomatic hypotension"],
        evidence: [cardiometabolicRegulatoryEvidenceV2.enalapril],
      }),
    );
  }

  if (losartan) {
    rules.push(fixedDailyRule({
      id: `LABEL-LOSARTAN-HTN-START:${losartan.masterDrugId}`,
      masterDrugId: losartan.masterDrugId,
      indication: "adult hypertension — standard starting branch",
      lane: "hypertension",
      useCase: "initiation",
      totalDailyMg: 50,
      administrationsPerDay: 1,
      titration: {
        stepText: "Increase to 100 mg once daily if needed for blood-pressure response after clinician review.",
      },
      targetDoseText: "50–100 mg once daily according to blood-pressure response.",
      maximumDoseText: "100 mg once daily for adult hypertension / diabetic nephropathy label pathways.",
      monitoring: [
        "Review volume depletion and hepatic impairment before using this standard 50 mg branch; those label situations start lower.",
        "Monitor renal function and serum potassium as clinically appropriate.",
      ],
      evidence: [cardiometabolicRegulatoryEvidenceV2.losartan],
    }));
  }

  if (valsartan) {
    rules.push(
      fixedDailyRule({
        id: `LABEL-VALSARTAN-HTN-START:${valsartan.masterDrugId}`,
        masterDrugId: valsartan.masterDrugId,
        indication: "adult hypertension — conservative labeled starting branch",
        lane: "hypertension",
        useCase: "initiation",
        totalDailyMg: 80,
        administrationsPerDay: 1,
        titration: {
          stepText: "Titrate according to blood-pressure response and tolerability.",
        },
        targetDoseText: "Adult hypertension labeled range 80–320 mg once daily.",
        maximumDoseText: "320 mg once daily.",
        monitoring: ["Monitor blood pressure, renal function, and potassium as clinically appropriate."],
        evidence: [cardiometabolicRegulatoryEvidenceV2.valsartan],
      }),
      fixedDailyRule({
        id: `LABEL-VALSARTAN-HF-START:${valsartan.masterDrugId}`,
        masterDrugId: valsartan.masterDrugId,
        indication: "adult heart failure",
        lane: "heart_failure",
        useCase: "initiation",
        totalDailyMg: 80,
        administrationsPerDay: 2,
        titration: {
          stepText: "Uptitrate from 40 mg twice daily to 80 mg and then 160 mg twice daily, or to the highest tolerated dose; cardiometabolic titration is clinician-directed, not glycemic-engine automated.",
        },
        targetDoseText: "160 mg twice daily as tolerated.",
        maximumDoseText: "320 mg/day in divided doses in heart-failure clinical trials.",
        monitoring: ["Monitor blood pressure, renal function, potassium, hypotension, and tolerability during uptitration."],
        evidence: [cardiometabolicRegulatoryEvidenceV2.valsartan],
      }),
    );
  }

  if (atorvastatin) {
    rules.push(fixedDailyRule({
      id: `LABEL-ATORVASTATIN-LIPID-START:${atorvastatin.masterDrugId}`,
      masterDrugId: atorvastatin.masterDrugId,
      indication: "adult dyslipidemia / cardiovascular risk reduction — conservative labeled initiation",
      lane: "lipids",
      useCase: "initiation",
      totalDailyMg: 10,
      administrationsPerDay: 1,
      titration: {
        stepText: "Dose intensity must be selected from indication, LDL-C reduction required, cardiovascular risk, interactions, and tolerability; no automatic high-intensity escalation in this protocol.",
      },
      targetDoseText: "Adult label starting dose 10–20 mg once daily; 40 mg may be selected when >45% LDL-C reduction is required.",
      maximumDoseText: "80 mg once daily per adult label; this rule does not authorize automatic escalation.",
      monitoring: ["Review drug interactions, hepatic safety, muscle symptoms, pregnancy status, and follow-up lipids before dose escalation."],
      evidence: [cardiometabolicRegulatoryEvidenceV2.atorvastatin],
    }));
  }

  if (rosuvastatin) {
    rules.push(
      fixedDailyRule({
        id: `LABEL-ROSUVASTATIN-LIPID-CRCL30PLUS:${rosuvastatin.masterDrugId}`,
        masterDrugId: rosuvastatin.masterDrugId,
        indication: "adult dyslipidemia / cardiovascular risk reduction; CrCl ≥30 mL/min; not on dialysis",
        lane: "lipids",
        useCase: "initiation",
        totalDailyMg: 5,
        administrationsPerDay: 1,
        eligibility: {
          all: [
            { fact: "kidney.creatinineClearanceMlMin", op: "gte", value: 30 },
            { fact: "kidney.dialysis", op: "eq", value: false },
          ],
        },
        titration: {
          stepText: "Select subsequent dose from indication, LDL-C response, cardiovascular risk, ancestry, interactions, and tolerability; automated escalation is intentionally disabled.",
        },
        targetDoseText: "Adult label range 5–40 mg once daily when no lower interaction/ancestry limit applies.",
        maximumDoseText: "40 mg/day in appropriate adults; this protocol does not authorize automated escalation.",
        monitoring: ["Drug interactions", "muscle symptoms", "hepatic safety", "pregnancy status", "follow-up lipids"],
        evidence: [cardiometabolicRegulatoryEvidenceV2.rosuvastatin],
      }),
      fixedDailyRule({
        id: `LABEL-ROSUVASTATIN-LIPID-CRCLLT30:${rosuvastatin.masterDrugId}`,
        masterDrugId: rosuvastatin.masterDrugId,
        indication: "adult dyslipidemia / cardiovascular risk reduction; severe renal impairment CrCl <30 mL/min; not on hemodialysis",
        lane: "lipids",
        useCase: "initiation",
        totalDailyMg: 5,
        administrationsPerDay: 1,
        eligibility: {
          all: [
            { fact: "kidney.creatinineClearanceMlMin", op: "lt", value: 30 },
            { fact: "kidney.dialysis", op: "eq", value: false },
          ],
        },
        titration: {
          stepText: "Any dose change requires clinician review of renal status, interactions, muscle toxicity risk, and lipid response.",
        },
        targetDoseText: "5–10 mg once daily in the severe renal-impairment branch.",
        maximumDoseText: "10 mg once daily when CrCl <30 mL/min and the patient is not on hemodialysis.",
        monitoring: ["Renal status", "drug interactions", "muscle symptoms", "hepatic safety", "pregnancy status", "follow-up lipids"],
        evidence: [cardiometabolicRegulatoryEvidenceV2.rosuvastatin],
      }),
    );
  }

  if (finerenone) {
    const baseEligibility = [
      { fact: "kidney.ckd", op: "eq", value: true } as const,
      { fact: "kidney.uacrMgG", op: "gte", value: 30 } as const,
      { fact: "kidney.potassiumMmolL", op: "lte", value: 5 } as const,
    ];
    rules.push(
      fixedDailyRule({
        id: `LABEL-FINERENONE-CKD-EGFR60:${finerenone.masterDrugId}`,
        masterDrugId: finerenone.masterDrugId,
        indication: "CKD associated with type 2 diabetes with albuminuria; eGFR ≥60 and potassium ≤5.0",
        lane: "kidney",
        useCase: "initiation",
        totalDailyMg: 20,
        administrationsPerDay: 1,
        eligibility: {
          all: [
            ...baseEligibility,
            { fact: "kidney.eGfr", op: "gte", value: 60 },
          ],
        },
        titration: {
          stepText: "Recheck potassium and eGFR after about 4 weeks; CKD target is 20 mg once daily. Subsequent potassium/eGFR decisions remain clinician-directed until longitudinal lab-change rules are modeled.",
          intervalDays: 28,
        },
        targetDoseText: "20 mg once daily for CKD with T2D when potassium/eGFR remain acceptable.",
        maximumDoseText: "20 mg once daily for the CKD-with-T2D pathway represented by this rule.",
        monitoring: [
          "Measure serum potassium and eGFR before initiation.",
          "Do not initiate if serum potassium is >5.0 mmol/L.",
          "Recheck potassium and eGFR approximately 4 weeks after initiation/dose change and periodically thereafter.",
          "Review strong CYP3A4 inhibitors and other label contraindications/interactions before prescribing.",
        ],
        evidence: [cardiometabolicRegulatoryEvidenceV2.finerenone],
      }),
      fixedDailyRule({
        id: `LABEL-FINERENONE-CKD-EGFR25-59:${finerenone.masterDrugId}`,
        masterDrugId: finerenone.masterDrugId,
        indication: "CKD associated with type 2 diabetes with albuminuria; eGFR 25–59 and potassium ≤5.0",
        lane: "kidney",
        useCase: "initiation",
        totalDailyMg: 10,
        administrationsPerDay: 1,
        eligibility: {
          all: [
            ...baseEligibility,
            { fact: "kidney.eGfr", op: "gte", value: 25 },
            { fact: "kidney.eGfr", op: "lt", value: 60 },
          ],
        },
        titration: {
          stepText: "Recheck potassium and eGFR after about 4 weeks; consider the CKD target 20 mg once daily only when label potassium/eGFR criteria are satisfied.",
          intervalDays: 28,
        },
        targetDoseText: "20 mg once daily when follow-up potassium/eGFR criteria permit.",
        maximumDoseText: "20 mg once daily for the CKD-with-T2D pathway represented by this rule.",
        monitoring: [
          "Measure serum potassium and eGFR before initiation.",
          "Do not initiate if serum potassium is >5.0 mmol/L or eGFR is <25 mL/min/1.73 m².",
          "Recheck potassium and eGFR approximately 4 weeks after initiation/dose change and periodically thereafter.",
          "Review strong CYP3A4 inhibitors and other label contraindications/interactions before prescribing.",
        ],
        evidence: [cardiometabolicRegulatoryEvidenceV2.finerenone],
      }),
    );
  }

  if (spironolactone) {
    const hfEligibility = [
      { fact: "cardiovascular.heartFailure", op: "eq", value: true } as const,
      { fact: "cardiovascular.lvefPercent", op: "lte", value: 40 } as const,
      { fact: "kidney.potassiumMmolL", op: "lte", value: 5 } as const,
    ];
    rules.push(
      fixedDailyRule({
        id: `LABEL-SPIRONOLACTONE-HF-EGFR51:${spironolactone.masterDrugId}`,
        masterDrugId: spironolactone.masterDrugId,
        indication: "HFrEF; eGFR >50 and potassium ≤5.0",
        lane: "heart_failure",
        useCase: "initiation",
        totalDailyMg: 25,
        administrationsPerDay: 1,
        eligibility: {
          all: [
            ...hfEligibility,
            { fact: "kidney.eGfr", op: "gt", value: 50 },
          ],
        },
        titration: {
          stepText: "If 25 mg once daily is tolerated and renal function/potassium remain acceptable, the label permits increase to 50 mg once daily as clinically indicated; no automatic MRA titration is performed.",
        },
        targetDoseText: "25 mg once daily; may increase to 50 mg once daily if clinically indicated and tolerated.",
        maximumDoseText: "50 mg once daily for the represented heart-failure pathway.",
        monitoring: ["Monitor serum potassium and renal function soon after initiation and during titration; reassess with hyperkalemia or renal deterioration."],
        evidence: [cardiometabolicRegulatoryEvidenceV2.spironolactone],
      }),
      {
        id: `LABEL-SPIRONOLACTONE-HF-EGFR30-50:${spironolactone.masterDrugId}`,
        masterDrugId: spironolactone.masterDrugId,
        indication: "HFrEF; eGFR 30–50 and potassium ≤5.0",
        lane: "heart_failure",
        useCase: "initiation",
        formula: {
          kind: "fixed_interval_components",
          componentsPerAdministration: [{
            ingredientKey: spironolactone.masterDrugId,
            amount: 25,
            unit: "mg",
          }],
          administrationsPerPeriod: 1,
          periodDays: 2,
        },
        eligibility: {
          all: [
            ...hfEligibility,
            { fact: "kidney.eGfr", op: "gte", value: 30 },
            { fact: "kidney.eGfr", op: "lte", value: 50 },
          ],
        },
        titration: {
          stepText: "Start conservatively because of hyperkalemia risk; subsequent adjustment requires clinician review of potassium, renal function, blood pressure, and tolerability.",
        },
        targetDoseText: "25 mg every other day at initiation for eGFR 30–50; subsequent dosing is individualized.",
        maximumDoseText: "No automatic escalation authorized by this renal-risk branch.",
        monitoring: ["Monitor serum potassium and renal function closely after initiation and with any dose change."],
        evidence: [cardiometabolicRegulatoryEvidenceV2.spironolactone],
        reviewState: "approved",
      },
    );
  }

  return rules;
}

/**
 * Structural pregnancy boundary for the first cardiometabolic cohort.
 * ACEi/ARB/MRA avoidance is guideline-backed; statins use a conditional review
 * rather than an absolute exclusion because current U.S. labeling calls for
 * discontinuation in most pregnancies with individualized exceptions.
 */
export function buildReviewedCardiometabolicGateRulesV2(
  knowledge: readonly KnowledgeMedicationV2[],
): MedicationGateRuleV2[] {
  const rules: MedicationGateRuleV2[] = [];
  const hardAvoidNames = ["Enalapril", "Losartan", "Valsartan", "Finerenone", "Spironolactone"];
  for (const name of hardAvoidNames) {
    const medication = medicationByName(knowledge, name);
    if (!medication) continue;
    rules.push({
      id: `PHASE4-PREGNANCY-EXCLUDE:${medication.masterDrugId}`,
      masterDrugId: medication.masterDrugId,
      when: { fact: "pregnancy", op: "eq", value: true },
      effect: "exclude",
      reason: `${name} is not an executable GLYMIZE option during pregnancy; use a pregnancy-safe alternative pathway and clinician review.`,
      evidence: [adaCvdPregnancy],
    });
  }

  for (const name of ["Atorvastatin", "Rosuvastatin"]) {
    const medication = medicationByName(knowledge, name);
    if (!medication) continue;
    rules.push({
      id: `PHASE4-PREGNANCY-STATIN-REVIEW:${medication.masterDrugId}`,
      masterDrugId: medication.masterDrugId,
      when: { fact: "pregnancy", op: "eq", value: true },
      effect: "conditional",
      reason: `${name} requires pregnancy-specific clinician review; current U.S. labeling generally advises discontinuation once pregnancy is recognized while allowing individualized exceptions for rare high-risk circumstances.`,
      evidence: [name === "Atorvastatin" ? cardiometabolicRegulatoryEvidenceV2.atorvastatin : cardiometabolicRegulatoryEvidenceV2.rosuvastatin],
    });
  }

  return rules;
}
