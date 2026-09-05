import type {
  DecisionGraphInventoryV2,
  DoseRuleV2,
  EvidenceReferenceV2,
  KnowledgeMedicationV2,
  MedicationGateRuleV2,
} from "./types.js";

export const ada2026PainfulDpnEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "ADA12-2026",
  title: "ADA Standards of Care in Diabetes—2026, Section 12: Retinopathy, Neuropathy, and Foot Care",
  version: "2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S261/163919/12-Retinopathy-Neuropathy-and-Foot-Care-Standards",
  locator: "Neuropathy: Diagnosis and Treatment; Recommendations 12.21-12.22",
  strength: "guideline_grade_a",
};

export const pregabalinDpnLabelEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "US-LABEL-PREGABALIN-DPN-2025-05",
  title: "Pregabalin capsules — U.S. prescribing information",
  version: "DailyMed SPL 2025-05-20",
  url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ceed457b-8f43-4021-fd70-071c96e09470",
  locator: "Dosage and Administration 2.2 and 2.7, Table 2; Contraindications 4; Warnings 5.1-5.8",
  strength: "regulatory_label",
};

export const duloxetineDpnLabelEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "US-LABEL-DULOXETINE-DPN-2026-04",
  title: "Duloxetine delayed-release capsules — U.S. prescribing information",
  version: "DailyMed revised 2026-04",
  url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=05a744a5-64ef-42d7-a19c-568be5a272d4",
  locator: "Dosage and Administration 2.4, 2.7, 2.9-2.10; Contraindications 4; Warnings 5.2, 5.4, 5.11, 5.14",
  strength: "regulatory_label",
};

function normalized(value: string | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function exactGeneric(medication: KnowledgeMedicationV2, name: "pregabalin" | "duloxetine") {
  return normalized(medication.genericName) === name;
}

function uniqueEvidence(values: readonly EvidenceReferenceV2[]) {
  const byId = new Map<string, EvidenceReferenceV2>();
  for (const value of values) byId.set(value.sourceId, value);
  return [...byId.values()];
}

/**
 * Explicitly promotes only the two reviewed DPN molecules. A general neuropathy
 * tag in WorldDrug is never sufficient to become executable.
 */
export function applyReviewedPainfulDpnKnowledgeV2(inventory: DecisionGraphInventoryV2): DecisionGraphInventoryV2 {
  const knowledge = inventory.knowledge.map((medication) => {
    const pregabalin = exactGeneric(medication, "pregabalin");
    const duloxetine = exactGeneric(medication, "duloxetine");
    if (!pregabalin && !duloxetine) return medication;

    const next = structuredClone(medication);
    next.engineState = "approved";
    next.primaryLanes = [...new Set([...next.primaryLanes, "neuropathy" as const])];
    next.therapyGroup = pregabalin ? "gabapentinoid" : "snri";
    next.efficacyBand = "none";
    next.hypoglycemiaRisk = "minimal";
    next.tags = [...new Set([...(next.tags ?? []), "painful-dpn-reviewed", pregabalin ? "gabapentinoid" : "snri"] )];
    const productEvidence = pregabalin ? pregabalinDpnLabelEvidenceV2 : duloxetineDpnLabelEvidenceV2;
    next.evidence = uniqueEvidence([...next.evidence, ada2026PainfulDpnEvidenceV2, productEvidence]);
    if (!next.effects.some((effect) => effect.objective === "painful_dpn_symptom_control")) {
      next.effects.push({
        objective: "painful_dpn_symptom_control",
        direction: "benefit",
        phenotype: "Clinician-confirmed painful diabetic peripheral neuropathy without atypical diagnostic features",
        evidence: [ada2026PainfulDpnEvidenceV2, productEvidence],
        note: pregabalin
          ? "Pregabalin execution remains CrCl-dependent; renal ambiguity is not resolved by eGFR substitution."
          : "Duloxetine execution requires renal, hepatic and MAOI/alcohol safety facts to be explicitly reconciled.",
      });
    }
    return next;
  });
  return { ...inventory, knowledge };
}

function dpnPhenotypeEligibility() {
  return [
    { fact: "ageYears", op: "gte", value: 18 } as const,
    { fact: "neuropathy.dpnConfirmed", op: "eq", value: true } as const,
    { fact: "neuropathy.painfulSymptoms", op: "eq", value: true } as const,
    { fact: "neuropathy.atypicalFeaturesPresent", op: "eq", value: false } as const,
  ];
}

export function buildReviewedPainfulDpnDoseRulesV2(
  inventory: Pick<DecisionGraphInventoryV2, "knowledge">,
): DoseRuleV2[] {
  const rules: DoseRuleV2[] = [];
  const pregabalin = inventory.knowledge.find((item) => item.engineState === "approved" && exactGeneric(item, "pregabalin") && item.primaryLanes.includes("neuropathy"));
  const duloxetine = inventory.knowledge.find((item) => item.engineState === "approved" && exactGeneric(item, "duloxetine") && item.primaryLanes.includes("neuropathy"));

  if (pregabalin) {
    rules.push({
      id: `LABEL-PREGABALIN-DPN-CRCL60-START:${pregabalin.masterDrugId}`,
      masterDrugId: pregabalin.masterDrugId,
      indication: "Adult painful diabetic peripheral neuropathy; standard renal-function initiation",
      lane: "neuropathy",
      useCase: "initiation",
      formula: {
        kind: "fixed_daily_components",
        dailyComponents: [{ ingredientKey: pregabalin.masterDrugId, amount: 150, unit: "mg" }],
        administrationsPerDay: 3,
      },
      eligibility: {
        all: [
          ...dpnPhenotypeEligibility(),
          { fact: "kidney.creatinineClearanceMlMin", op: "gte", value: 60 },
          { fact: "kidney.dialysis", op: "eq", value: false },
          { fact: "medicationSafety.knownPregabalinHypersensitivity", op: "eq", value: false },
        ],
      },
      titration: {
        stepText: "May increase from 150 mg/day to 300 mg/day within 1 week based on efficacy and tolerability; clinician confirmation required.",
        intervalDays: 7,
        targetMetric: "pain relief and tolerability",
      },
      targetDoseText: "50 mg three times daily initially; may increase to 100 mg three times daily (300 mg/day).",
      maximumDoseText: "For DPN with CrCl >=60 mL/min, maximum recommended dose is 300 mg/day; higher studied doses were less tolerated without additional significant benefit.",
      monitoring: [
        "dizziness and somnolence",
        "peripheral edema and weight gain",
        "respiratory depression risk with CNS depressants or respiratory impairment",
        "mood/suicidal ideation warning",
        "taper gradually over at least 1 week if discontinuing",
      ],
      evidence: [ada2026PainfulDpnEvidenceV2, pregabalinDpnLabelEvidenceV2],
      reviewState: "approved",
    });

    // The label's renal table maps the normal-function 150 mg/day starting dose
    // to an unambiguous 25 mg once-daily starting dose when CrCl is <15 mL/min.
    // Intermediate CrCl bands intentionally remain non-executable here because
    // the label permits multiple valid divided-dose schedules/ranges.
    rules.push({
      id: `LABEL-PREGABALIN-DPN-CRCL15-START:${pregabalin.masterDrugId}`,
      masterDrugId: pregabalin.masterDrugId,
      indication: "Adult painful diabetic peripheral neuropathy; severe renal impairment, not on dialysis",
      lane: "neuropathy",
      useCase: "initiation",
      formula: {
        kind: "fixed_daily_components",
        dailyComponents: [{ ingredientKey: pregabalin.masterDrugId, amount: 25, unit: "mg" }],
        administrationsPerDay: 1,
      },
      eligibility: {
        all: [
          ...dpnPhenotypeEligibility(),
          { fact: "kidney.creatinineClearanceMlMin", op: "lt", value: 15 },
          { fact: "kidney.dialysis", op: "eq", value: false },
          { fact: "medicationSafety.knownPregabalinHypersensitivity", op: "eq", value: false },
        ],
      },
      targetDoseText: "Renal-adjusted total daily dose must follow the product-label Table 2 mapping; do not import the normal-renal-function 300 mg/day target.",
      maximumDoseText: "For CrCl <15 mL/min the renal table maps the DPN 300 mg/day normal-function ceiling to 25-50 mg/day; exact titration remains clinician-confirmed.",
      monitoring: [
        "renal function and accumulation-related adverse effects",
        "dizziness and somnolence",
        "peripheral edema",
      ],
      evidence: [ada2026PainfulDpnEvidenceV2, pregabalinDpnLabelEvidenceV2],
      reviewState: "approved",
    });
  }

  if (duloxetine) {
    rules.push({
      id: `LABEL-DULOXETINE-DPN-60QD:${duloxetine.masterDrugId}`,
      masterDrugId: duloxetine.masterDrugId,
      indication: "Adult diabetic peripheral neuropathic pain",
      lane: "neuropathy",
      dosageFormGroup: "capsule",
      useCase: "either",
      formula: {
        kind: "fixed_daily_components",
        dailyComponents: [{ ingredientKey: duloxetine.masterDrugId, amount: 60, unit: "mg" }],
        administrationsPerDay: 1,
      },
      eligibility: {
        all: [
          ...dpnPhenotypeEligibility(),
          { fact: "kidney.eGfr", op: "gte", value: 30 },
          { fact: "liver.chronicLiverDisease", op: "eq", value: false },
          { fact: "liver.cirrhosis", op: "eq", value: false },
          { fact: "medicationSafety.maoiUseOrRecentExposure", op: "eq", value: false },
          { fact: "medicationSafety.substantialAlcoholUse", op: "eq", value: false },
        ],
      },
      targetDoseText: "60 mg once daily. A lower starting dose may be considered when tolerability is a concern, but GLYMIZE does not infer that branch without an explicit reviewed indication.",
      maximumDoseText: "For diabetic peripheral neuropathic pain there is no evidence that doses above 60 mg once daily add significant benefit, and higher doses are less well tolerated.",
      monitoring: [
        "blood pressure and orthostatic symptoms",
        "serotonin syndrome and interacting serotonergic medicines",
        "hepatic symptoms or jaundice",
        "hyponatremia risk where clinically relevant",
        "glycemic control in diabetes",
      ],
      evidence: [ada2026PainfulDpnEvidenceV2, duloxetineDpnLabelEvidenceV2],
      reviewState: "approved",
    });
  }

  return rules;
}

export function buildReviewedPainfulDpnGateRulesV2(
  knowledge: readonly KnowledgeMedicationV2[],
): MedicationGateRuleV2[] {
  const rules: MedicationGateRuleV2[] = [];
  const pregabalin = knowledge.find((item) => exactGeneric(item, "pregabalin"));
  const duloxetine = knowledge.find((item) => exactGeneric(item, "duloxetine"));

  if (pregabalin) {
    rules.push({
      id: `LABEL-PREGABALIN-HYPERSENSITIVITY:${pregabalin.masterDrugId}`,
      masterDrugId: pregabalin.masterDrugId,
      when: { fact: "medicationSafety.knownPregabalinHypersensitivity", op: "eq", value: true },
      effect: "exclude",
      reason: "Pregabalin is contraindicated with known hypersensitivity to pregabalin or its components.",
      evidence: [pregabalinDpnLabelEvidenceV2],
    });
  }

  if (duloxetine) {
    rules.push(
      {
        id: `LABEL-DULOXETINE-MAOI:${duloxetine.masterDrugId}`,
        masterDrugId: duloxetine.masterDrugId,
        when: { fact: "medicationSafety.maoiUseOrRecentExposure", op: "eq", value: true },
        effect: "exclude",
        reason: "Duloxetine must not be initiated during prohibited MAOI exposure/washout periods, including relevant linezolid or intravenous methylene blue exposure.",
        evidence: [duloxetineDpnLabelEvidenceV2],
      },
      {
        id: `LABEL-DULOXETINE-RENAL-LT30:${duloxetine.masterDrugId}`,
        masterDrugId: duloxetine.masterDrugId,
        when: { fact: "kidney.eGfr", op: "lt", value: 30 },
        effect: "exclude",
        reason: "Routine duloxetine execution is excluded when GFR/eGFR is below 30 mL/min because the label advises avoiding use in severe renal impairment.",
        evidence: [duloxetineDpnLabelEvidenceV2],
      },
      {
        id: `LABEL-DULOXETINE-CHRONIC-LIVER:${duloxetine.masterDrugId}`,
        masterDrugId: duloxetine.masterDrugId,
        when: {
          any: [
            { fact: "liver.chronicLiverDisease", op: "eq", value: true },
            { fact: "liver.cirrhosis", op: "eq", value: true },
          ],
        },
        effect: "exclude",
        reason: "Routine duloxetine execution is excluded in chronic liver disease or cirrhosis per product labeling.",
        evidence: [duloxetineDpnLabelEvidenceV2],
      },
      {
        id: `LABEL-DULOXETINE-SUBSTANTIAL-ALCOHOL:${duloxetine.masterDrugId}`,
        masterDrugId: duloxetine.masterDrugId,
        when: { fact: "medicationSafety.substantialAlcoholUse", op: "eq", value: true },
        effect: "exclude",
        reason: "Routine duloxetine execution is excluded with substantial alcohol use because the label warns of increased hepatic injury risk.",
        evidence: [duloxetineDpnLabelEvidenceV2],
      },
    );
  }

  return rules;
}
