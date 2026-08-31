import type {
  DecisionGraphInventoryV2,
  DoseRuleV2,
  EvidenceReferenceV2,
  KnowledgeMedicationV2,
  StrengthComponentV2,
  TitrationProtocolV2,
} from "./types.js";

function evidence(sourceId: string, title: string, version: string, url: string, locator: string): EvidenceReferenceV2 {
  return { sourceId, title, version, url, locator, strength: "regulatory_label" };
}

export const metforminImmediateReleaseLabelEvidenceV2 = evidence(
  "US-LABEL-METFORMIN-IR-2026",
  "Metformin hydrochloride immediate-release tablets — U.S. prescribing information",
  "2026",
  "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=13235d8e-ac3a-45b4-9c5d-9a9012951dfe&version=12",
  "Dosage and Administration; renal impairment precautions",
);

export const metforminExtendedReleaseLabelEvidenceV2 = evidence(
  "US-LABEL-METFORMIN-XR-2026",
  "Metformin hydrochloride extended-release tablets — U.S. prescribing information",
  "2026",
  "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=3dca884d-ec44-496f-9eeb-31fd8fa3f574",
  "Dosage and Administration; renal impairment",
);

export const jardiance2026EvidenceV2 = evidence(
  "US-LABEL-JARDIANCE-2026-01",
  "JARDIANCE (empagliflozin) — U.S. prescribing information",
  "2026-01-30",
  "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=faf3dd6a-9cd0-39c2-0d2e-232cb3f67565",
  "Dosage and Administration 2.1-2.3",
);

export const farxiga2026EvidenceV2 = evidence(
  "US-LABEL-FARXIGA-2026-06",
  "FARXIGA (dapagliflozin) — U.S. prescribing information",
  "2026-06-03",
  "https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=72ad22ae-efe6-4cd6-a302-98aaee423d69",
  "Dosage and Administration 2.1-2.4",
);

export const januvia2026EvidenceV2 = evidence(
  "US-LABEL-JANUVIA-2026",
  "JANUVIA (sitagliptin) — U.S. prescribing information",
  "2026",
  "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=194c3718-5eb5-4cf5-85d0-2bb1ed8293b8&type=display",
  "Dosage and Administration 2.1-2.2",
);

export const linagliptin2026EvidenceV2 = evidence(
  "US-LABEL-LINAGLIPTIN-2026-01",
  "Linagliptin tablets — U.S. prescribing information",
  "2026-01-14",
  "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=cbdbd4b2-c07b-00e1-e053-2995a90a5fc9&version=6",
  "Dosage and Administration; Renal Impairment 8.6",
);

export const glimepiride2026EvidenceV2 = evidence(
  "US-LABEL-GLIMEPIRIDE-2026-02",
  "Glimepiride tablets — U.S. prescribing information",
  "2026-02-01",
  "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=e12ab052-e3d6-4246-b727-f1e3f9057f09&version=2",
  "Dosage and Administration 2.1",
);

export const pioglitazone2026EvidenceV2 = evidence(
  "US-LABEL-PIOGLITAZONE-2026",
  "Pioglitazone tablets — U.S. prescribing information",
  "2026",
  "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=d740d2a2-b26d-4b16-aedc-e4b4b1c94daa&type=display",
  "Dosage and Administration 2.1",
);

export const victozaEvidenceV2 = evidence(
  "US-LABEL-VICTOZA",
  "VICTOZA (liraglutide) — U.S. prescribing information",
  "current label",
  "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=1d18f106-0584-4fee-97ab-32771a64b809",
  "Adult Dosage 2.2",
);

export const ozempic2026EvidenceV2 = evidence(
  "US-LABEL-OZEMPIC-2026-05",
  "OZEMPIC (semaglutide) — U.S. prescribing information",
  "2026-05",
  "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=adec4fd2-6858-4c99-91d4-531f5f2a2d79",
  "Dosage and Administration 2.1-2.2",
);

export const trulicity2026EvidenceV2 = evidence(
  "US-LABEL-TRULICITY-2026-03",
  "TRULICITY (dulaglutide) — U.S. prescribing information",
  "2026-03",
  "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=463050bd-2b1c-40f5-b3c3-0a04bb433309",
  "Adult Dosage 2.1",
);

export const mounjaro2026EvidenceV2 = evidence(
  "US-LABEL-MOUNJARO-2026-01",
  "MOUNJARO (tirzepatide) — U.S. prescribing information",
  "2026-01",
  "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d2d7da5d-ad07-4228-955f-cf7e355c8cc0",
  "Recommended Dosage 2.1",
);

export const toujeoLabelDoseEvidenceV2 = evidence(
  "US-LABEL-TOUJEO-2026",
  "TOUJEO U-300 (insulin glargine) — U.S. Prescribing Information",
  "2026",
  "https://products.sanofi.us/toujeo/toujeo.pdf",
  "Dosage and Administration 2.3",
);

export const tresibaLabelDoseEvidenceV2 = evidence(
  "US-LABEL-TRESIBA-2026",
  "TRESIBA (insulin degludec) — U.S. Prescribing Information",
  "2026",
  "https://www.novo-pi.com/tresiba.pdf",
  "Dosage and Administration: type 2 diabetes initiation",
);

function findMedication(knowledge: readonly KnowledgeMedicationV2[], matcher: (item: KnowledgeMedicationV2) => boolean) {
  return knowledge.find((item) => item.engineState === "approved" && matcher(item));
}

function dailyRule(input: {
  id: string;
  medication: KnowledgeMedicationV2;
  amount: number;
  unit: string;
  administrationsPerDay?: number;
  indication?: string;
  lane?: DoseRuleV2["lane"];
  form?: string;
  role?: DoseRuleV2["selectionRole"];
  eligibility?: DoseRuleV2["eligibility"];
  titration?: DoseRuleV2["titration"];
  titrationProtocolId?: string;
  target?: string;
  maximum?: string;
  monitoring?: string[];
  evidence: EvidenceReferenceV2;
}): DoseRuleV2 {
  return {
    id: input.id,
    masterDrugId: input.medication.masterDrugId,
    indication: input.indication ?? "Type 2 diabetes — adult treatment",
    lane: input.lane,
    dosageFormGroup: input.form ?? "tablet",
    selectionRole: input.role ?? "default",
    useCase: "initiation",
    formula: {
      kind: "fixed_daily_components",
      dailyComponents: [{ ingredientKey: input.medication.masterDrugId, amount: input.amount, unit: input.unit }],
      administrationsPerDay: input.administrationsPerDay ?? 1,
    },
    eligibility: input.eligibility,
    titration: input.titration,
    titrationProtocolId: input.titrationProtocolId,
    targetDoseText: input.target,
    maximumDoseText: input.maximum,
    monitoring: input.monitoring ?? [],
    evidence: [input.evidence],
    reviewState: "approved",
  };
}

function weeklyRule(input: {
  id: string;
  medication: KnowledgeMedicationV2;
  amount: number;
  unit: string;
  evidence: EvidenceReferenceV2;
  titrationProtocolId?: string;
  maximum?: string;
  target?: string;
  monitoring?: string[];
}): DoseRuleV2 {
  return {
    id: input.id,
    masterDrugId: input.medication.masterDrugId,
    indication: "Type 2 diabetes — adult initiation",
    lane: "glycemic",
    dosageFormGroup: "injection_pen",
    selectionRole: "product_specific",
    useCase: "initiation",
    formula: {
      kind: "fixed_interval_components",
      componentsPerAdministration: [{ ingredientKey: input.medication.masterDrugId, amount: input.amount, unit: input.unit }],
      administrationsPerPeriod: 1,
      periodDays: 7,
    },
    titrationProtocolId: input.titrationProtocolId,
    targetDoseText: input.target,
    maximumDoseText: input.maximum,
    monitoring: input.monitoring ?? ["gastrointestinal tolerability", "hypoglycemia when combined with insulin/secretagogue"],
    evidence: [input.evidence],
    reviewState: "approved",
  };
}

/**
 * Label-derived executable dose rules for a deliberately reviewed core cohort.
 * A drug outside this registry remains non-executable rather than inheriting a
 * class-average dose. NFI availability is still a separate hard gate.
 */
export function buildReviewedProductDoseRulesV2(inventory: Pick<DecisionGraphInventoryV2, "knowledge">): DoseRuleV2[] {
  const rules: DoseRuleV2[] = [];
  const knowledge = inventory.knowledge;

  const metformin = findMedication(knowledge, (item) => item.therapyGroup === "biguanide" && /metformin/i.test(item.genericName));
  if (metformin) {
    rules.push(dailyRule({
      id: `LABEL-METFORMIN-IR-START:${metformin.masterDrugId}`, medication: metformin, amount: 1000, unit: "mg", administrationsPerDay: 2,
      form: "tablet", titrationProtocolId: `TITRATE-METFORMIN-IR:${metformin.masterDrugId}`,
      titration: { stepText: "Increase by 500 mg/day weekly according to glycemic response and gastrointestinal tolerability", intervalDays: 7, targetMetric: "individualized glycemic target and tolerability" },
      maximum: "2550 mg/day in divided doses; doses >2000 mg/day may be better tolerated three times daily",
      monitoring: ["eGFR before initiation and periodically", "gastrointestinal tolerability", "vitamin B12 with long-term use/risk context"], evidence: metforminImmediateReleaseLabelEvidenceV2,
    }));
    rules.push(dailyRule({
      id: `LABEL-METFORMIN-XR-START:${metformin.masterDrugId}`, medication: metformin, amount: 500, unit: "mg", administrationsPerDay: 1,
      form: "extended_release_tablet", role: "alternative_formulation", titrationProtocolId: `TITRATE-METFORMIN-XR:${metformin.masterDrugId}`,
      titration: { stepText: "Increase by 500 mg/day weekly according to glycemic response and tolerability", intervalDays: 7, targetMetric: "individualized glycemic target and tolerability" },
      maximum: "2000 mg once daily with the evening meal; use exact product labeling when alternate XR regimens are considered",
      monitoring: ["eGFR before initiation and periodically", "gastrointestinal tolerability", "swallow extended-release tablet whole"], evidence: metforminExtendedReleaseLabelEvidenceV2,
    }));
  }

  const empa = findMedication(knowledge, (item) => /^empagliflozin$/i.test(item.genericName));
  if (empa) rules.push(dailyRule({
    id: `LABEL-EMPAGLIFLOZIN-10:${empa.masterDrugId}`, medication: empa, amount: 10, unit: "mg", evidence: jardiance2026EvidenceV2,
    titrationProtocolId: `TITRATE-EMPAGLIFLOZIN:${empa.masterDrugId}`, maximum: "25 mg once daily when additional glycemic control is needed and 10 mg is tolerated",
    monitoring: ["renal function as clinically indicated", "volume status", "genital/urinary infection symptoms", "ketosis risk and perioperative fasting"],
  }));

  const dapa = findMedication(knowledge, (item) => /^dapagliflozin$/i.test(item.genericName));
  if (dapa) {
    rules.push(dailyRule({
      id: `LABEL-DAPAGLIFLOZIN-GLYCEMIC-5:${dapa.masterDrugId}`, medication: dapa, amount: 5, unit: "mg", lane: "glycemic", evidence: farxiga2026EvidenceV2,
      titrationProtocolId: `TITRATE-DAPAGLIFLOZIN:${dapa.masterDrugId}`, maximum: "10 mg once daily for additional glycemic control",
      monitoring: ["renal function", "volume status", "ketosis risk and perioperative fasting"],
    }));
    for (const lane of ["kidney", "heart_failure"] as const) rules.push(dailyRule({
      id: `LABEL-DAPAGLIFLOZIN-${lane.toUpperCase()}-10:${dapa.masterDrugId}`, medication: dapa, amount: 10, unit: "mg", lane, evidence: farxiga2026EvidenceV2,
      indication: lane === "kidney" ? "Chronic kidney disease risk reduction" : "Heart failure risk reduction",
      monitoring: ["renal function", "volume status", "ketosis risk and perioperative fasting"],
    }));
  }

  const sita = findMedication(knowledge, (item) => /^sitagliptin$/i.test(item.genericName));
  if (sita) {
    rules.push(dailyRule({ id: `LABEL-SITAGLIPTIN-EGFR45PLUS:${sita.masterDrugId}`, medication: sita, amount: 100, unit: "mg", evidence: januvia2026EvidenceV2, eligibility: { fact: "kidney.eGfr", op: "gte", value: 45 }, monitoring: ["renal function before initiation and periodically"] }));
    rules.push(dailyRule({ id: `LABEL-SITAGLIPTIN-EGFR30TO44:${sita.masterDrugId}`, medication: sita, amount: 50, unit: "mg", evidence: januvia2026EvidenceV2, eligibility: { all: [{ fact: "kidney.eGfr", op: "gte", value: 30 }, { fact: "kidney.eGfr", op: "lt", value: 45 }] }, monitoring: ["renal function before initiation and periodically"] }));
    rules.push(dailyRule({ id: `LABEL-SITAGLIPTIN-EGFRLT30:${sita.masterDrugId}`, medication: sita, amount: 25, unit: "mg", evidence: januvia2026EvidenceV2, eligibility: { fact: "kidney.eGfr", op: "lt", value: 30 }, monitoring: ["renal function before initiation and periodically; dialysis timing does not require synchronization per label"] }));
  }

  const lina = findMedication(knowledge, (item) => /^linagliptin$/i.test(item.genericName));
  if (lina) rules.push(dailyRule({
    id: `LABEL-LINAGLIPTIN-5:${lina.masterDrugId}`, medication: lina, amount: 5, unit: "mg", evidence: linagliptin2026EvidenceV2,
    monitoring: ["pancreatitis symptoms", "heart-failure symptoms in susceptible patients"], maximum: "5 mg once daily; no renal dose adjustment is recommended",
  }));

  const glimepiride = findMedication(knowledge, (item) => /^glimepiride$/i.test(item.genericName));
  if (glimepiride) rules.push(dailyRule({
    id: `LABEL-GLIMEPIRIDE-CONSERVATIVE-START:${glimepiride.masterDrugId}`, medication: glimepiride, amount: 1, unit: "mg", evidence: glimepiride2026EvidenceV2,
    titrationProtocolId: `TITRATE-GLIMEPIRIDE:${glimepiride.masterDrugId}`, maximum: "8 mg once daily",
    titration: { stepText: "Increase conservatively in 1 mg steps; label permits 1–2 mg increments no more frequently than every 1–2 weeks", intervalDays: 14, targetMetric: "glycemic response without hypoglycemia" },
    monitoring: ["hypoglycemia", "meal regularity", "renal impairment/frailty"],
  }));

  const pio = findMedication(knowledge, (item) => /^pioglitazone$/i.test(item.genericName));
  if (pio) rules.push(dailyRule({
    id: `LABEL-PIOGLITAZONE-15:${pio.masterDrugId}`, medication: pio, amount: 15, unit: "mg", evidence: pioglitazone2026EvidenceV2,
    maximum: "45 mg once daily; increase in 15 mg increments based on glycemic response",
    monitoring: ["edema and heart-failure symptoms", "weight", "liver tests before initiation"],
  }));

  const liraglutide = findMedication(knowledge, (item) => /^liraglutide$/i.test(item.genericName));
  if (liraglutide) rules.push(dailyRule({
    id: `LABEL-LIRAGLUTIDE-0.6:${liraglutide.masterDrugId}`, medication: liraglutide, amount: 0.6, unit: "mg", administrationsPerDay: 1,
    form: "injection_pen", role: "product_specific", evidence: victozaEvidenceV2, titrationProtocolId: `TITRATE-LIRAGLUTIDE:${liraglutide.masterDrugId}`,
    target: "1.2 mg once daily after the starter week; 1.8 mg once daily if additional glycemic control is needed",
    maximum: "1.8 mg once daily", monitoring: ["gastrointestinal tolerability", "gallbladder/pancreatitis warning symptoms", "hypoglycemia with insulin/secretagogue"],
  }));

  const semaSq = findMedication(knowledge, (item) => /semaglutide.*subcutaneous/i.test(item.genericName));
  if (semaSq) rules.push(weeklyRule({
    id: `LABEL-SEMAGLUTIDE-SC-0.25:${semaSq.masterDrugId}`, medication: semaSq, amount: 0.25, unit: "mg", evidence: ozempic2026EvidenceV2,
    titrationProtocolId: `TITRATE-SEMAGLUTIDE-SC:${semaSq.masterDrugId}`, target: "0.5 mg weekly after 4 weeks; may advance to 1 mg then 2 mg after at least 4 weeks at each prior dose if additional glycemic control is needed",
    maximum: "2 mg once weekly for glycemic control",
  }));

  const dula = findMedication(knowledge, (item) => /^dulaglutide$/i.test(item.genericName));
  if (dula) rules.push(weeklyRule({
    id: `LABEL-DULAGLUTIDE-0.75:${dula.masterDrugId}`, medication: dula, amount: 0.75, unit: "mg", evidence: trulicity2026EvidenceV2,
    titrationProtocolId: `TITRATE-DULAGLUTIDE:${dula.masterDrugId}`, target: "1.5 mg weekly after 4 weeks if additional glycemic control is needed; further 1.5 mg increments require at least 4 weeks on the current dose",
    maximum: "4.5 mg once weekly",
  }));

  const tirzepatide = findMedication(knowledge, (item) => /^tirzepatide$/i.test(item.genericName));
  if (tirzepatide) rules.push(weeklyRule({
    id: `LABEL-TIRZEPATIDE-2.5:${tirzepatide.masterDrugId}`, medication: tirzepatide, amount: 2.5, unit: "mg", evidence: mounjaro2026EvidenceV2,
    titrationProtocolId: `TITRATE-TIRZEPATIDE:${tirzepatide.masterDrugId}`, target: "5 mg weekly after 4 weeks; thereafter increase by 2.5 mg after at least 4 weeks at the current dose if additional glycemic control is needed",
    maximum: "15 mg once weekly in adults",
  }));

  const toujeo = findMedication(knowledge, (item) => /insulin glargine u[- ]?300/i.test(item.genericName));
  if (toujeo) rules.push({
    id: `LABEL-TOUJEO-T2-START:${toujeo.masterDrugId}`, masterDrugId: toujeo.masterDrugId, indication: "Type 2 diabetes — insulin-naive initiation", lane: "glycemic",
    selectionRole: "product_specific", useCase: "initiation", formula: { kind: "weight_based_daily", ingredientKey: toujeo.masterDrugId, unit: "U", minPerKg: 0.2, maxPerKg: 0.2, administrationsPerDay: 1, selection: "lower_bound", roundTo: 1 },
    titration: { stepText: "Individualize from glucose monitoring; do not titrate more frequently than every 3–4 days", intervalDays: 3, targetMetric: "individualized fasting glucose target" },
    monitoring: ["fasting glucose", "hypoglycemia", "frequent glucose checks during transitions"], evidence: [toujeoLabelDoseEvidenceV2], reviewState: "approved",
  });

  const degludec = findMedication(knowledge, (item) => /insulin degludec/i.test(item.genericName) && !item.combination);
  if (degludec) rules.push(dailyRule({
    id: `LABEL-TRESIBA-T2-START:${degludec.masterDrugId}`, medication: degludec, amount: 10, unit: "U", form: "injection_pen", role: "product_specific", evidence: tresibaLabelDoseEvidenceV2,
    titration: { stepText: "Individualize from fasting glucose and metabolic needs; recommended interval between dose increases is 3–4 days", intervalDays: 3, targetMetric: "individualized fasting glucose target" },
    monitoring: ["fasting glucose", "hypoglycemia", "renal/hepatic or acute-illness changes that alter insulin needs"],
  }));

  return rules;
}

function dose(id: string, amount: number, unit: string): StrengthComponentV2[] {
  return [{ ingredientKey: id, amount, unit }];
}

function steps(id: string, values: number[], unit: string, reason: (from: number, to: number) => string) {
  return values.slice(0, -1).map((value, index) => ({ currentDose: dose(id, value, unit), nextDose: dose(id, values[index + 1]!, unit), reason: reason(value, values[index + 1]!) }));
}

/** Structured titration protocols only where the reviewed label supports a deterministic step sequence. */
export function buildReviewedTitrationProtocolsV2(inventory: Pick<DecisionGraphInventoryV2, "knowledge">): TitrationProtocolV2[] {
  const protocols: TitrationProtocolV2[] = [];
  const knowledge = inventory.knowledge;

  const metformin = findMedication(knowledge, (item) => item.therapyGroup === "biguanide" && /metformin/i.test(item.genericName));
  if (metformin) {
    protocols.push({ id: `TITRATE-METFORMIN-IR:${metformin.masterDrugId}`, masterDrugId: metformin.masterDrugId, kind: "stepwise_fixed", minimumDaysOnCurrentDose: 7, steps: steps(metformin.masterDrugId, [1000, 1500, 2000, 2500], "mg", (_a, b) => `Increase total daily immediate-release metformin by 500 mg to ${b} mg/day after at least 7 days when more glycemic control is needed and GI tolerance is acceptable.`), evidence: [metforminImmediateReleaseLabelEvidenceV2], reviewState: "approved" });
    protocols.push({ id: `TITRATE-METFORMIN-XR:${metformin.masterDrugId}`, masterDrugId: metformin.masterDrugId, kind: "stepwise_fixed", minimumDaysOnCurrentDose: 7, steps: steps(metformin.masterDrugId, [500, 1000, 1500, 2000], "mg", (_a, b) => `Increase extended-release metformin by 500 mg/day to ${b} mg/day after at least 7 days if needed and tolerated.`), evidence: [metforminExtendedReleaseLabelEvidenceV2], reviewState: "approved" });
  }

  const empa = findMedication(knowledge, (item) => /^empagliflozin$/i.test(item.genericName));
  if (empa) protocols.push({ id: `TITRATE-EMPAGLIFLOZIN:${empa.masterDrugId}`, masterDrugId: empa.masterDrugId, kind: "stepwise_fixed", steps: steps(empa.masterDrugId, [10, 25], "mg", () => "Increase empagliflozin from 10 mg to 25 mg once daily only when additional glycemic control is needed and 10 mg is tolerated."), evidence: [jardiance2026EvidenceV2], reviewState: "approved" });

  const dapa = findMedication(knowledge, (item) => /^dapagliflozin$/i.test(item.genericName));
  if (dapa) protocols.push({ id: `TITRATE-DAPAGLIFLOZIN:${dapa.masterDrugId}`, masterDrugId: dapa.masterDrugId, kind: "stepwise_fixed", steps: steps(dapa.masterDrugId, [5, 10], "mg", () => "For glycemic control, increase dapagliflozin from 5 mg to 10 mg once daily when additional control is needed."), evidence: [farxiga2026EvidenceV2], reviewState: "approved" });

  const glimepiride = findMedication(knowledge, (item) => /^glimepiride$/i.test(item.genericName));
  if (glimepiride) protocols.push({ id: `TITRATE-GLIMEPIRIDE:${glimepiride.masterDrugId}`, masterDrugId: glimepiride.masterDrugId, kind: "stepwise_fixed", minimumDaysOnCurrentDose: 14, steps: steps(glimepiride.masterDrugId, [1, 2, 3, 4, 5, 6, 7, 8], "mg", (_a, b) => `Conservative label-concordant escalation to ${b} mg once daily; the label permits 1–2 mg increments no more frequently than every 1–2 weeks.`), evidence: [glimepiride2026EvidenceV2], reviewState: "approved" });

  const liraglutide = findMedication(knowledge, (item) => /^liraglutide$/i.test(item.genericName));
  if (liraglutide) protocols.push({ id: `TITRATE-LIRAGLUTIDE:${liraglutide.masterDrugId}`, masterDrugId: liraglutide.masterDrugId, kind: "stepwise_fixed", minimumDaysOnCurrentDose: 7, steps: steps(liraglutide.masterDrugId, [0.6, 1.2, 1.8], "mg", (_a, b) => `Increase liraglutide to ${b} mg once daily after at least one week at the current step when clinically indicated and tolerated.`), evidence: [victozaEvidenceV2], reviewState: "approved" });

  const semaSq = findMedication(knowledge, (item) => /semaglutide.*subcutaneous/i.test(item.genericName));
  if (semaSq) protocols.push({ id: `TITRATE-SEMAGLUTIDE-SC:${semaSq.masterDrugId}`, masterDrugId: semaSq.masterDrugId, kind: "stepwise_fixed", minimumDaysOnCurrentDose: 28, steps: steps(semaSq.masterDrugId, [0.25, 0.5, 1, 2], "mg", (_a, b) => `Increase subcutaneous semaglutide to ${b} mg once weekly after at least 4 weeks at the current dose when additional glycemic control is needed.`), evidence: [ozempic2026EvidenceV2], reviewState: "approved" });

  const dula = findMedication(knowledge, (item) => /^dulaglutide$/i.test(item.genericName));
  if (dula) protocols.push({ id: `TITRATE-DULAGLUTIDE:${dula.masterDrugId}`, masterDrugId: dula.masterDrugId, kind: "stepwise_fixed", minimumDaysOnCurrentDose: 28, steps: steps(dula.masterDrugId, [0.75, 1.5, 3, 4.5], "mg", (_a, b) => `Increase dulaglutide to ${b} mg once weekly after at least 4 weeks at the current dose when additional glycemic control is needed.`), evidence: [trulicity2026EvidenceV2], reviewState: "approved" });

  const tirzepatide = findMedication(knowledge, (item) => /^tirzepatide$/i.test(item.genericName));
  if (tirzepatide) protocols.push({ id: `TITRATE-TIRZEPATIDE:${tirzepatide.masterDrugId}`, masterDrugId: tirzepatide.masterDrugId, kind: "stepwise_fixed", minimumDaysOnCurrentDose: 28, steps: steps(tirzepatide.masterDrugId, [2.5, 5, 7.5, 10, 12.5, 15], "mg", (_a, b) => `Increase tirzepatide to ${b} mg once weekly after at least 4 weeks at the current dose when additional glycemic control is needed.`), evidence: [mounjaro2026EvidenceV2], reviewState: "approved" });

  return protocols;
}
