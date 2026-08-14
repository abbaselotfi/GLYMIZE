import type {
  EvidenceReferenceV2,
  InsulinConversionRequestV2,
  InsulinConversionResultV2,
  InsulinConversionRuleV2,
  KnowledgeMedicationV2,
} from "./types.js";

export const lantusLabelEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "US-LABEL-LANTUS",
  title: "LANTUS (insulin glargine U-100) — U.S. Prescribing Information",
  url: "https://products.sanofi.us/Lantus/Lantus.html",
  locator: "Dosage and Administration 2.4: switching from TOUJEO and NPH",
  strength: "regulatory_label",
};

export const toujeoLabelEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "US-LABEL-TOUJEO-2026",
  title: "TOUJEO U-300 (insulin glargine) — U.S. Prescribing Information",
  version: "2026",
  url: "https://products.sanofi.us/toujeo/toujeo.pdf",
  locator: "Dosage and Administration 2.4",
  strength: "regulatory_label",
};

export const tresibaLabelEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "US-LABEL-TRESIBA-2026",
  title: "TRESIBA (insulin degludec U-100/U-200) — U.S. Prescribing Information",
  version: "2026",
  url: "https://www.novo-pi.com/tresiba.pdf",
  locator: "Dosage and Administration: adults switching from other basal insulin",
  strength: "regulatory_label",
};

export const ryzodegLabelEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "US-LABEL-RYZODEG-2026",
  title: "RYZODEG 70/30 (insulin degludec/insulin aspart) — U.S. Prescribing Information",
  version: "2026",
  url: "https://www.novo-pi.com/ryzodeg7030.pdf",
  locator: "Dosage and Administration 2.4",
  strength: "regulatory_label",
};

export const cardiohInterchangeEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "CARDIOH-INSULIN-INTERCHANGE-2025",
  title: "Guide to Therapeutic Interchange of Insulin Products for Safe and Effective Transitions in Diabetes Management",
  version: "2025-11",
  url: "https://www.cardi-oh.org/files/resources/cardi-oh-guide-to-therapeutic-interchange-of-insulin-products-for-safe-and-effective-transitions-in-diabetes-management.pdf",
  locator: "Therapeutic interchange tables",
  strength: "expert_consensus",
};

function norm(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

function findOne(knowledge: readonly KnowledgeMedicationV2[], matcher: (item: KnowledgeMedicationV2) => boolean) {
  return knowledge.find((item) => item.engineState === "approved" && matcher(item));
}

function basalKnowledge(knowledge: readonly KnowledgeMedicationV2[]) {
  return knowledge.filter((item) => item.engineState === "approved" && (
    item.therapyGroup === "basal_insulin_analog" ||
    (item.therapyGroup === "human_insulin" && /\bnph\b/.test(norm(item.genericName)))
  ));
}

function rapidKnowledge(knowledge: readonly KnowledgeMedicationV2[]) {
  return knowledge.filter((item) => item.engineState === "approved" && item.therapyGroup === "prandial_insulin_analog" && /aspart|lispro|glulisine/.test(norm(item.genericName)));
}

function regularKnowledge(knowledge: readonly KnowledgeMedicationV2[]) {
  return findOne(knowledge, (item) => item.therapyGroup === "human_insulin" && /regular/.test(norm(item.genericName)));
}

function pushRule(rules: InsulinConversionRuleV2[], rule: InsulinConversionRuleV2 | undefined) {
  if (rule && rule.sourceMasterDrugId !== rule.targetMasterDrugId) rules.push(rule);
}

/**
 * Label-first insulin conversion registry. Exact product-label rules are executable;
 * reviewed cross-class interchange rules remain specialist_review. No basal↔prandial
 * conversion is synthesized.
 */
export function buildReviewedInsulinConversionRulesV2(knowledge: readonly KnowledgeMedicationV2[]): InsulinConversionRuleV2[] {
  const rules: InsulinConversionRuleV2[] = [];
  const nph = findOne(knowledge, (item) => /human insulin nph/.test(norm(item.genericName)));
  const glargineU100 = findOne(knowledge, (item) => /insulin glargine u 100/.test(norm(item.genericName)));
  const glargineU300 = findOne(knowledge, (item) => /insulin glargine u 300/.test(norm(item.genericName)));
  const degludec = findOne(knowledge, (item) => /insulin degludec/.test(norm(item.genericName)));
  const detemir = findOne(knowledge, (item) => /insulin detemir/.test(norm(item.genericName)));
  const ryzodeg = findOne(knowledge, (item) => /insulin degludec.*insulin aspart/.test(norm(item.genericName)));

  if (glargineU300 && glargineU100) pushRule(rules, {
    id: "LANTUS-FROM-TOUJEO-80PCT", sourceMasterDrugId: glargineU300.masterDrugId, targetMasterDrugId: glargineU100.masterDrugId,
    sourceFrequencyPerDay: [1], factor: 0.8, executionStatus: "executable", evidenceTier: "regulatory_label",
    reason: "When switching once-daily TOUJEO U-300 to once-daily LANTUS U-100, the LANTUS label recommends 80% of the discontinued TOUJEO dose.", evidence: [lantusLabelEvidenceV2],
  });
  if (nph && glargineU100) {
    pushRule(rules, { id: "LANTUS-FROM-NPH-QD-1TO1", sourceMasterDrugId: nph.masterDrugId, targetMasterDrugId: glargineU100.masterDrugId, sourceFrequencyPerDay: [1], factor: 1, executionStatus: "executable", evidenceTier: "regulatory_label", reason: "Once-daily NPH to once-daily LANTUS starts at the same unit dose.", evidence: [lantusLabelEvidenceV2] });
    pushRule(rules, { id: "LANTUS-FROM-NPH-BID-80PCT", sourceMasterDrugId: nph.masterDrugId, targetMasterDrugId: glargineU100.masterDrugId, sourceFrequencyPerDay: [2], factor: 0.8, executionStatus: "executable", evidenceTier: "regulatory_label", reason: "Twice-daily NPH to once-daily LANTUS starts at 80% of total daily NPH dose.", evidence: [lantusLabelEvidenceV2] });
  }

  if (glargineU300) {
    for (const source of basalKnowledge(knowledge)) {
      if (source.masterDrugId === glargineU300.masterDrugId) continue;
      const isNph = nph?.masterDrugId === source.masterDrugId;
      const isDetemir = detemir?.masterDrugId === source.masterDrugId;
      pushRule(rules, { id: `TOUJEO-FROM-QD:${source.masterDrugId}`, sourceMasterDrugId: source.masterDrugId, targetMasterDrugId: glargineU300.masterDrugId, sourceFrequencyPerDay: [1], factor: 1, executionStatus: "executable", evidenceTier: "regulatory_label", reason: "TOUJEO label: once-daily long/intermediate-acting basal insulin starts at the same unit dose.", evidence: [toujeoLabelEvidenceV2] });
      if (isNph || isDetemir) pushRule(rules, { id: `TOUJEO-FROM-BID-80PCT:${source.masterDrugId}`, sourceMasterDrugId: source.masterDrugId, targetMasterDrugId: glargineU300.masterDrugId, sourceFrequencyPerDay: [2], factor: 0.8, executionStatus: "executable", evidenceTier: "regulatory_label", reason: "TOUJEO label: twice-daily NPH or detemir starts at 80% of the previous total daily basal dose.", evidence: [toujeoLabelEvidenceV2] });
    }
  }

  if (degludec) {
    for (const source of basalKnowledge(knowledge)) {
      if (source.masterDrugId === degludec.masterDrugId) continue;
      pushRule(rules, { id: `TRESIBA-ADULT-1TO1:${source.masterDrugId}`, sourceMasterDrugId: source.masterDrugId, targetMasterDrugId: degludec.masterDrugId, sourceFrequencyPerDay: [1, 2], factor: 1, executionStatus: "executable", evidenceTier: "regulatory_label", reason: "Adult patients switching to TRESIBA may start at the same unit total daily basal dose; close glucose monitoring remains required.", evidence: [tresibaLabelEvidenceV2] });
    }
  }

  if (ryzodeg) {
    for (const source of knowledge.filter((item) => item.engineState === "approved" && item.therapyGroup === "premixed_insulin")) {
      if (source.masterDrugId === ryzodeg.masterDrugId) continue;
      pushRule(rules, { id: `RYZODEG-FROM-PREMIX-1TO1:${source.masterDrugId}`, sourceMasterDrugId: source.masterDrugId, targetMasterDrugId: ryzodeg.masterDrugId, sourceFrequencyPerDay: [1, 2], factor: 1, executionStatus: "executable", evidenceTier: "regulatory_label", reason: "RYZODEG 70/30 label: adults switching from once- or twice-daily premix/self-mix start at the same unit dose and injection schedule.", evidence: [ryzodegLabelEvidenceV2] });
    }
  }

  const rapids = rapidKnowledge(knowledge);
  for (const source of rapids) for (const target of rapids) {
    if (source.masterDrugId === target.masterDrugId) continue;
    pushRule(rules, { id: `RAPID-ANALOG-INTERCHANGE:${source.masterDrugId}:${target.masterDrugId}`, sourceMasterDrugId: source.masterDrugId, targetMasterDrugId: target.masterDrugId, sourceFrequencyPerDay: [1, 2, 3, 4], factor: 1, executionStatus: "specialist_review", evidenceTier: "reviewed_interchange", reason: "Reviewed therapeutic-interchange guidance supports unit-for-unit rapid-acting analog interchange, but meal timing and patient-specific response require clinician review.", evidence: [cardiohInterchangeEvidenceV2] });
  }

  const regular = regularKnowledge(knowledge);
  if (regular) {
    for (const rapid of rapids) {
      pushRule(rules, { id: `RAPID-TO-REGULAR-80PCT:${rapid.masterDrugId}`, sourceMasterDrugId: rapid.masterDrugId, targetMasterDrugId: regular.masterDrugId, sourceFrequencyPerDay: [1, 2, 3, 4], factor: 0.8, executionStatus: "specialist_review", evidenceTier: "reviewed_interchange", reason: "Reviewed interchange guidance uses a conservative 20% reduction when moving between rapid-acting analog and regular insulin; timing differences must be reviewed.", evidence: [cardiohInterchangeEvidenceV2] });
      pushRule(rules, { id: `REGULAR-TO-RAPID-80PCT:${rapid.masterDrugId}`, sourceMasterDrugId: regular.masterDrugId, targetMasterDrugId: rapid.masterDrugId, sourceFrequencyPerDay: [1, 2, 3, 4], factor: 0.8, executionStatus: "specialist_review", evidenceTier: "reviewed_interchange", reason: "Reviewed interchange guidance uses a conservative 20% reduction when moving between regular insulin and rapid-acting analog; timing differences must be reviewed.", evidence: [cardiohInterchangeEvidenceV2] });
    }
  }

  return rules;
}

function roundUnits(value: number) {
  return Math.max(0, Math.round(value));
}

export function calculateInsulinConversionV2(
  request: InsulinConversionRequestV2,
  rules: readonly InsulinConversionRuleV2[],
): InsulinConversionResultV2 {
  const base: InsulinConversionResultV2 = {
    status: "unsupported",
    sourceMasterDrugId: request.sourceMasterDrugId,
    targetMasterDrugId: request.targetMasterDrugId,
    sourceTotalDailyUnits: request.sourceTotalDailyUnits,
    sourceFrequencyPerDay: request.sourceFrequencyPerDay,
    targetFrequencyPerDay: request.targetFrequencyPerDay,
    rationale: [],
    evidence: [],
    clinicianConfirmationRequired: true,
  };

  if (!(request.sourceTotalDailyUnits > 0) || !Number.isFinite(request.sourceTotalDailyUnits) || !(request.sourceFrequencyPerDay >= 1)) {
    return { ...base, status: "needs_data", rationale: ["A positive source total daily dose and valid injection frequency are required."] };
  }
  if (request.sourceMasterDrugId === request.targetMasterDrugId) return { ...base, rationale: ["Source and target insulin are identical; no conversion is required."] };

  const rule = rules.find((item) => item.sourceMasterDrugId === request.sourceMasterDrugId && item.targetMasterDrugId === request.targetMasterDrugId && (!item.sourceFrequencyPerDay || item.sourceFrequencyPerDay.includes(request.sourceFrequencyPerDay)));
  if (!rule) return { ...base, rationale: ["No reviewed conversion edge exists for this source/target/frequency combination. Decision Graph will not invent a dose conversion."] };

  const targetTdd = roundUnits(request.sourceTotalDailyUnits * rule.factor);
  const targetFrequency = request.targetFrequencyPerDay ?? (rule.id.startsWith("RYZODEG-") ? request.sourceFrequencyPerDay : 1);
  let targetPerInjection: number[] | undefined;
  if (targetFrequency === 1) targetPerInjection = [targetTdd];
  else if (rule.id.startsWith("RYZODEG-")) {
    const sourceDoses = request.sourcePerInjectionUnits;
    if (!sourceDoses || sourceDoses.length !== request.sourceFrequencyPerDay || Math.abs(sourceDoses.reduce((sum, dose) => sum + dose, 0) - request.sourceTotalDailyUnits) > 1) {
      return { ...base, status: "needs_data", appliedRuleId: rule.id, factor: rule.factor, targetStartingTotalDailyUnits: targetTdd, targetFrequencyPerDay: targetFrequency, rationale: [rule.reason, "The source premix dose at each injection is required because the label preserves the injection schedule; equal splitting will not be assumed."], evidence: rule.evidence };
    }
    targetPerInjection = sourceDoses.map((dose) => roundUnits(dose * rule.factor));
  } else if (request.sourcePerInjectionUnits?.length === targetFrequency) {
    targetPerInjection = request.sourcePerInjectionUnits.map((dose) => roundUnits(dose * rule.factor));
  }

  return {
    ...base,
    status: rule.executionStatus,
    targetStartingTotalDailyUnits: targetTdd,
    targetFrequencyPerDay: targetFrequency,
    targetPerInjectionUnits: targetPerInjection,
    appliedRuleId: rule.id,
    factor: rule.factor,
    rationale: [rule.reason, rule.executionStatus === "specialist_review" ? "This is reviewed interchange guidance rather than a direct target-product label conversion; physician review is mandatory." : "Target-product regulatory labeling supports this starting conversion; close glucose monitoring is still required."],
    evidence: rule.evidence,
  };
}
