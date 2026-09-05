import type {
  DecisionGraphInventoryV2,
  DoseRuleV2,
  EvidenceReferenceV2,
  KnowledgeMedicationV2,
  PatientContextV2,
} from "./types.js";

export const resmetirom2026LabelEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "US-LABEL-REZDIFFRA-2026-07",
  title: "REZDIFFRA (resmetirom) tablets — U.S. prescribing information",
  version: "DailyMed updated 2026-07-31",
  url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e67ea09f-a840-439c-86c8-f98585f978b2",
  locator: "Indications and Usage 1; Dosage and Administration 2.1-2.2; Warnings 5.1-5.3; Drug Interactions 7.1-7.2",
  strength: "regulatory_label",
};

export const aasldResmetirom2024EvidenceV2: EvidenceReferenceV2 = {
  sourceId: "AASLD-RESMETIROM-2024",
  title: "AASLD MASLD Practice Guidance — Resmetirom Therapy update",
  version: "October 2024 update",
  url: "https://www.aasld.org/practice-guidelines/clinical-assessment-and-management-metabolic-dysfunction-associated-steatotic",
  locator: "Resmetirom patient selection and monitoring update",
  strength: "expert_consensus",
};

const RESMETIROM_STANDARD_LT100 = "LABEL-RESMETIROM-80-LT100";
const RESMETIROM_STANDARD_GTE100 = "LABEL-RESMETIROM-100-GTE100";
const RESMETIROM_CLOPIDOGREL_LT100 = "LABEL-RESMETIROM-60-LT100-CLOPIDOGREL";
const RESMETIROM_CLOPIDOGREL_GTE100 = "LABEL-RESMETIROM-80-GTE100-CLOPIDOGREL";

function normalized(value: string | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isResmetirom(medication: KnowledgeMedicationV2) {
  return normalized(medication.genericName) === "resmetirom";
}

function uniqueEvidence(values: readonly EvidenceReferenceV2[]) {
  const map = new Map<string, EvidenceReferenceV2>();
  for (const value of values) map.set(value.sourceId, value);
  return [...map.values()];
}

/**
 * Promotes only the exact reviewed resmetirom molecule. Market availability,
 * phenotype eligibility, interactions and dose resolution remain independent
 * hard gates and can still block execution.
 */
export function applyReviewedMashKnowledgeV2(inventory: DecisionGraphInventoryV2): DecisionGraphInventoryV2 {
  const knowledge = inventory.knowledge.map((medication) => {
    if (!isResmetirom(medication)) return medication;
    const next = structuredClone(medication);
    next.engineState = "approved";
    next.therapyGroup = "liver_directed_therapy";
    next.primaryLanes = [...new Set([...next.primaryLanes, "liver" as const])];
    next.tags = [...new Set([...(next.tags ?? []), "mash-f2-f3", "resmetirom-reviewed-2026"] )];
    next.evidence = uniqueEvidence([
      ...next.evidence,
      resmetirom2026LabelEvidenceV2,
      aasldResmetirom2024EvidenceV2,
    ]);
    const alreadyCovered = next.effects.some((effect) => effect.objective === "liver_directed_therapy");
    if (!alreadyCovered) {
      next.effects.push({
        objective: "liver_directed_therapy",
        direction: "benefit",
        phenotype: "adult noncirrhotic MASH with F2-F3 fibrosis",
        evidence: [resmetirom2026LabelEvidenceV2, aasldResmetirom2024EvidenceV2],
        note: "Executable only after the reviewed phenotype, interaction, Iran-market and dose gates pass.",
      });
    }
    return next;
  });
  return { ...inventory, knowledge };
}

function fixedDailyRule(input: {
  id: string;
  medication: KnowledgeMedicationV2;
  amountMg: number;
  note: string;
}): DoseRuleV2 {
  return {
    id: `${input.id}:${input.medication.masterDrugId}`,
    masterDrugId: input.medication.masterDrugId,
    indication: "Adults with noncirrhotic MASH and F2-F3 fibrosis",
    lane: "liver",
    dosageFormGroup: "tablet",
    selectionRole: "product_specific",
    useCase: "either",
    formula: {
      kind: "fixed_daily_components",
      dailyComponents: [{ ingredientKey: input.medication.masterDrugId, amount: input.amountMg, unit: "mg" }],
      administrationsPerDay: 1,
    },
    eligibility: {
      all: [
        { fact: "liver.masldMash", op: "eq", value: true },
        { any: [
          { fact: "liver.fibrosisStage", op: "eq", value: "F2" },
          { fact: "liver.fibrosisStage", op: "eq", value: "F3" },
        ] },
        { fact: "liver.cirrhosis", op: "eq", value: false },
      ],
    },
    targetDoseText: input.note,
    maximumDoseText: input.note,
    monitoring: [
      "liver tests and symptoms of hepatotoxicity",
      "gallbladder-related adverse reactions",
      "complete medication-interaction reconciliation before initiation and after medication changes",
      "statin-related liver tests, myopathy and rhabdomyolysis when an affected statin is coadministered",
    ],
    evidence: [resmetirom2026LabelEvidenceV2, aasldResmetirom2024EvidenceV2],
    reviewState: "approved",
  };
}

/** Label-derived static rule catalogue. Patient-specific rule selection is kept
 * in evaluateReviewedResmetiromProtocolV2 because weight and medication
 * interactions are richer than the generic PredicateV2 surface. */
export function buildReviewedMashDoseRulesV2(
  inventory: Pick<DecisionGraphInventoryV2, "knowledge">,
): DoseRuleV2[] {
  const medication = inventory.knowledge.find((item) => item.engineState === "approved" && isResmetirom(item));
  if (!medication) return [];
  return [
    fixedDailyRule({
      id: RESMETIROM_STANDARD_LT100,
      medication,
      amountMg: 80,
      note: "Actual body weight <100 kg: 80 mg orally once daily.",
    }),
    fixedDailyRule({
      id: RESMETIROM_STANDARD_GTE100,
      medication,
      amountMg: 100,
      note: "Actual body weight >=100 kg: 100 mg orally once daily.",
    }),
    fixedDailyRule({
      id: RESMETIROM_CLOPIDOGREL_LT100,
      medication,
      amountMg: 60,
      note: "Actual body weight <100 kg with moderate CYP2C8 inhibitor clopidogrel: reduce to 60 mg once daily.",
    }),
    fixedDailyRule({
      id: RESMETIROM_CLOPIDOGREL_GTE100,
      medication,
      amountMg: 80,
      note: "Actual body weight >=100 kg with moderate CYP2C8 inhibitor clopidogrel: reduce to 80 mg once daily.",
    }),
  ];
}

export type ReviewedMashProtocolStatusV2 = "pass" | "needs_data" | "conditional" | "exclude";

export interface ReviewedMashProtocolOutcomeV2 {
  status: ReviewedMashProtocolStatusV2;
  reasons: string[];
  evidence: EvidenceReferenceV2[];
  doseRuleId?: string;
}

function activeMedications(patient: PatientContextV2) {
  return (patient.currentMedications ?? []).filter((item) => (item.status ?? "active") === "active");
}

function hasActiveMedication(patient: PatientContextV2, genericName: string) {
  const target = normalized(genericName);
  return activeMedications(patient).some((item) => normalized(item.genericName) === target);
}

function dailyDoseMg(medication: ReturnType<typeof activeMedications>[number]) {
  const mg = medication.dailyDose?.filter((component) => normalized(component.unit) === "mg") ?? [];
  if (mg.length !== 1) return undefined;
  const amount = mg[0]?.amount;
  return typeof amount === "number" && Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

const affectedStatinLimits = new Map<string, number>([
  ["atorvastatin", 40],
  ["pravastatin", 40],
  ["rosuvastatin", 20],
  ["simvastatin", 20],
]);

function statinCompatibility(patient: PatientContextV2) {
  for (const medication of activeMedications(patient)) {
    const limit = affectedStatinLimits.get(normalized(medication.genericName));
    if (limit === undefined) continue;
    const dose = dailyDoseMg(medication);
    if (dose === undefined) {
      return {
        status: "conditional" as const,
        reason: `${medication.genericName}: current daily statin dose is not documented; REZDIFFRA label dose-limit reconciliation is required before execution.`,
      };
    }
    if (dose > limit) {
      return {
        status: "conditional" as const,
        reason: `${medication.genericName} ${dose} mg/day exceeds the REZDIFFRA coadministration limit of ${limit} mg/day; clinician-directed statin reconciliation is required.`,
      };
    }
  }
  return { status: "pass" as const };
}

/**
 * Exact resmetirom phenotype/dose selector. This function intentionally knows
 * only interactions explicitly operationalised from the reviewed label. The
 * label still requires a complete medication interaction review; no unknown
 * drug is silently inferred to be interaction-free.
 */
export function evaluateReviewedResmetiromProtocolV2(
  patient: PatientContextV2,
  medication: KnowledgeMedicationV2,
): ReviewedMashProtocolOutcomeV2 | undefined {
  if (!isResmetirom(medication)) return undefined;
  const evidence = [resmetirom2026LabelEvidenceV2, aasldResmetirom2024EvidenceV2];
  const reasons: string[] = [];

  if (patient.ageYears === undefined || !Number.isFinite(patient.ageYears)) {
    return { status: "needs_data", reasons: ["Resmetirom requires documented adult age before execution."], evidence };
  }
  if (patient.ageYears < 18) {
    return { status: "exclude", reasons: ["REZDIFFRA MASH indication is for adults; age is below 18 years."], evidence };
  }
  if (patient.liver?.masldMash !== true) {
    return { status: "exclude", reasons: ["Documented MASH is required for the reviewed resmetirom pathway."], evidence };
  }
  const fibrosis = patient.liver?.fibrosisStage;
  if (fibrosis === undefined || fibrosis === "unknown") {
    return { status: "needs_data", reasons: ["Fibrosis stage is required; executable resmetirom is limited to F2-F3."], evidence };
  }
  if (fibrosis !== "F2" && fibrosis !== "F3") {
    return { status: "exclude", reasons: [`Fibrosis stage ${fibrosis} is outside the reviewed F2-F3 indication.`], evidence };
  }
  if (patient.liver?.cirrhosis === undefined) {
    return { status: "needs_data", reasons: ["Explicit noncirrhotic status is required before resmetirom execution."], evidence };
  }
  if (patient.liver.cirrhosis || patient.liver.decompensatedCirrhosis) {
    return { status: "exclude", reasons: ["Resmetirom executable pathway is noncirrhotic; decompensated cirrhosis must be avoided per label."], evidence };
  }
  const weightKg = patient.anthropometrics?.weightKg;
  if (typeof weightKg !== "number" || !Number.isFinite(weightKg) || weightKg <= 0) {
    return { status: "needs_data", reasons: ["Actual body weight is required for the label-derived resmetirom dose tier."], evidence };
  }
  if (patient.pregnancy) {
    return {
      status: "conditional",
      reasons: ["Pregnancy safety data for resmetirom are insufficient for autonomous execution; specialist review is required."],
      evidence,
    };
  }
  if (hasActiveMedication(patient, "gemfibrozil")) {
    return {
      status: "exclude",
      reasons: ["Gemfibrozil is a strong CYP2C8 inhibitor; concomitant REZDIFFRA use is not recommended by the label."],
      evidence,
    };
  }

  const statin = statinCompatibility(patient);
  if (statin.status !== "pass") {
    return { status: statin.status, reasons: [statin.reason!], evidence };
  }

  const moderateCyp2c8 = hasActiveMedication(patient, "clopidogrel");
  const doseRuleId = moderateCyp2c8
    ? weightKg < 100
      ? `${RESMETIROM_CLOPIDOGREL_LT100}:${medication.masterDrugId}`
      : `${RESMETIROM_CLOPIDOGREL_GTE100}:${medication.masterDrugId}`
    : weightKg < 100
      ? `${RESMETIROM_STANDARD_LT100}:${medication.masterDrugId}`
      : `${RESMETIROM_STANDARD_GTE100}:${medication.masterDrugId}`;

  reasons.push(
    moderateCyp2c8
      ? "Clopidogrel detected: the reviewed moderate-CYP2C8 dose reduction is selected."
      : "No operationalised label-named CYP2C8 inhibitor requiring dose modification was detected.",
  );
  reasons.push(`Resmetirom dose tier selected from actual body weight ${weightKg} kg.`);
  return { status: "pass", reasons, evidence, doseRuleId };
}
