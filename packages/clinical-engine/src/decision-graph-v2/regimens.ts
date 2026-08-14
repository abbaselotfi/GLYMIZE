import { assessIranAvailabilityV2 } from "./availability.js";
import type {
  ClinicalStateV2,
  DecisionGraphRequestV2,
  KnowledgeMedicationV2,
  RegimenCandidateV2,
  RegimenConflictRuleV2,
  RegimenWeightProfileV2,
  RegimenTemplateV2,
} from "./types.js";

function maxEfficacy(a: RegimenCandidateV2["efficacyBand"], b: RegimenCandidateV2["efficacyBand"]) {
  const order = ["none", "modest", "intermediate", "high", "very_high"] as const;
  return order[Math.max(order.indexOf(a), order.indexOf(b))]!;
}

function maxHypoglycemiaRisk(a: RegimenCandidateV2["hypoglycemiaRisk"], b: RegimenCandidateV2["hypoglycemiaRisk"]) {
  const order = ["minimal", "low", "moderate", "high"] as const;
  return order[Math.max(order.indexOf(a), order.indexOf(b))]!;
}

function combineWeightProfiles(a: RegimenWeightProfileV2, b: RegimenWeightProfileV2): RegimenWeightProfileV2 {
  const values = new Set([a, b]);
  if (values.has("mixed")) return "mixed";
  if (values.has("gain") && values.has("loss")) return "mixed";
  if (values.has("gain")) return "gain";
  if (values.has("loss")) return "loss";
  if (values.has("neutral")) return "neutral";
  return "unknown";
}

function normalizedPreferenceCoverage(
  coverage: readonly RegimenCandidateV2["objectiveCoverage"][number][],
  hypoglycemiaRisk: RegimenCandidateV2["hypoglycemiaRisk"],
  weightProfile: RegimenWeightProfileV2,
) {
  const next = new Set(coverage);
  next.delete("low_hypoglycemia_risk");
  next.delete("weight_benefit");
  if (hypoglycemiaRisk === "minimal" || hypoglycemiaRisk === "low") next.add("low_hypoglycemia_risk");
  if (weightProfile === "loss") next.add("weight_benefit");
  return [...next];
}

function unique<T>(items: readonly T[]) {
  return [...new Set(items)];
}

function medicationTags(medication: KnowledgeMedicationV2) {
  return unique([medication.therapyGroup, medication.drugClass ?? "", ...(medication.tags ?? [])].filter(Boolean));
}

function baseRegimenForLane(request: DecisionGraphRequestV2, medication: KnowledgeMedicationV2, lane: RegimenCandidateV2["lane"]): RegimenCandidateV2 {
  const availability = assessIranAvailabilityV2(medication, request.inventory.marketProducts);
  const beneficialEffects = medication.effects
    .filter((effect) => effect.direction === "strong_benefit" || effect.direction === "benefit");
  const objectiveCoverage = beneficialEffects.map((effect) => effect.objective);
  const objectiveStrength = Object.fromEntries(beneficialEffects.map((effect) => [effect.objective, effect.direction])) as RegimenCandidateV2["objectiveStrength"];
  if (medication.efficacyBand !== "none" && medication.primaryLanes.includes("glycemic")) objectiveCoverage.push("glycemic_control");
  if (medication.hypoglycemiaRisk === "minimal" || medication.hypoglycemiaRisk === "low") objectiveCoverage.push("low_hypoglycemia_risk");
  if (medication.weightDirection === "loss") objectiveCoverage.push("weight_benefit");

  return {
    regimenId: `med:${medication.masterDrugId}:${lane}`,
    lane,
    kind: lane === "glycemic" ? (medication.combination ? "fixed_dose_combination" : "single") : "organ_protection",
    components: [{
      masterDrugId: medication.masterDrugId,
      genericName: medication.genericName,
      persianName: medication.persianName,
      therapyGroup: medication.therapyGroup,
      tags: medicationTags(medication),
      availability,
    }],
    efficacyBand: medication.efficacyBand,
    hypoglycemiaRisk: medication.hypoglycemiaRisk,
    weightProfile: medication.weightDirection,
    objectiveCoverage: unique(objectiveCoverage),
    objectiveStrength,
    evidence: unique(medication.evidence),
    gate: { status: "pass", reasons: [], evidence: [] },
    routeFit: "neutral",
    insuranceFit: "unknown",
    distinctProducts: 1,
    reasons: [],
    cautions: [],
    preferenceConflicts: [],
  };
}

function baseRegimens(request: DecisionGraphRequestV2, medication: KnowledgeMedicationV2): RegimenCandidateV2[] {
  const lanes = medication.primaryLanes.length ? medication.primaryLanes : ["other" as const];
  return unique(lanes).map((lane) => baseRegimenForLane(request, medication, lane));
}

function conflictReason(tagsA: readonly string[], tagsB: readonly string[], rules: readonly RegimenConflictRuleV2[]) {
  for (const rule of rules) {
    const direct = tagsA.includes(rule.tagA) && tagsB.includes(rule.tagB);
    const reverse = tagsA.includes(rule.tagB) && tagsB.includes(rule.tagA);
    if (direct || reverse) return rule;
  }
  return undefined;
}

function combineRegimens(
  left: RegimenCandidateV2,
  right: RegimenCandidateV2,
  kind: RegimenCandidateV2["kind"],
  conflictRules: readonly RegimenConflictRuleV2[],
  evidenceReason?: string,
): RegimenCandidateV2 | undefined {
  const leftIds = new Set(left.components.map((item) => item.masterDrugId));
  if (right.components.some((item) => leftIds.has(item.masterDrugId))) return undefined;
  for (const a of left.components) {
    for (const b of right.components) {
      const conflict = conflictReason(a.tags, b.tags, conflictRules);
      if (conflict) return undefined;
    }
  }
  const hypoglycemiaRisk = maxHypoglycemiaRisk(left.hypoglycemiaRisk, right.hypoglycemiaRisk);
  const weightProfile = combineWeightProfiles(left.weightProfile, right.weightProfile);
  const coverage = normalizedPreferenceCoverage(
    unique([...left.objectiveCoverage, ...right.objectiveCoverage]),
    hypoglycemiaRisk,
    weightProfile,
  );
  const objectiveStrength: RegimenCandidateV2["objectiveStrength"] = { ...left.objectiveStrength };
  for (const [objective, strength] of Object.entries(right.objectiveStrength) as Array<[keyof RegimenCandidateV2["objectiveStrength"], "benefit" | "strong_benefit"]>) {
    if (strength === "strong_benefit" || !objectiveStrength[objective]) objectiveStrength[objective] = strength;
  }
  return {
    regimenId: `reg:${[...left.components, ...right.components].map((item) => item.masterDrugId).sort().join("+")}`,
    lane: left.lane === right.lane ? left.lane : "glycemic",
    kind,
    components: [...left.components, ...right.components],
    efficacyBand: maxEfficacy(left.efficacyBand, right.efficacyBand),
    hypoglycemiaRisk,
    weightProfile,
    objectiveCoverage: coverage,
    objectiveStrength,
    evidence: unique([...left.evidence, ...right.evidence]),
    gate: { status: "pass", reasons: [], evidence: [] },
    routeFit: "neutral",
    insuranceFit: "unknown",
    distinctProducts: left.distinctProducts + right.distinctProducts,
    reasons: evidenceReason ? [evidenceReason] : [],
    cautions: [],
    preferenceConflicts: [],
  };
}

function approvedTemplateRegimens(
  request: DecisionGraphRequestV2,
  singles: readonly RegimenCandidateV2[],
  state: ClinicalStateV2,
  templates: readonly RegimenTemplateV2[],
  conflicts: readonly RegimenConflictRuleV2[],
) {
  const result: RegimenCandidateV2[] = [];
  const glycemicSingles = singles.filter((item) => item.lane === "glycemic");
  const byId = new Map(glycemicSingles.map((item) => [item.components[0]!.masterDrugId, item]));
  const byGroup = new Map<string, RegimenCandidateV2[]>();
  for (const single of glycemicSingles) {
    const group = single.components[0]!.therapyGroup;
    byGroup.set(group, [...(byGroup.get(group) ?? []), single]);
  }

  for (const template of templates.filter((item) => item.reviewState === "approved" && item.allowedPathways.includes(state.pathway))) {
    let candidates: RegimenCandidateV2[][] = [];
    if (template.componentMasterDrugIds?.length) {
      const resolved = template.componentMasterDrugIds.map((id) => byId.get(id)).filter((item): item is RegimenCandidateV2 => Boolean(item));
      if (resolved.length === template.componentMasterDrugIds.length) candidates = resolved.map((item) => [item]);
    } else if (template.componentTherapyGroups?.length) {
      candidates = template.componentTherapyGroups.map((group) => byGroup.get(group) ?? []);
    }
    if (!candidates.length || candidates.some((items) => items.length === 0)) continue;

    let partial = candidates[0]!.map((item) => item);
    for (let i = 1; i < candidates.length; i += 1) {
      const next: RegimenCandidateV2[] = [];
      for (const left of partial) {
        for (const right of candidates[i]!) {
          const combined = combineRegimens(left, right, "approved_multi_drug_template", conflicts, template.rationale);
          if (combined) next.push(combined);
        }
      }
      partial = next;
    }
    result.push(...partial);
  }
  return result;
}

export function generateRegimenCandidatesV2(request: DecisionGraphRequestV2, state: ClinicalStateV2) {
  const knowledge = request.inventory.knowledge.filter((item) => item.engineState !== "disabled");
  const singles = knowledge.flatMap((item) => baseRegimens(request, item));
  const glycemicSingles = singles.filter((item) => item.lane === "glycemic");
  const conflicts = request.inventory.regimenConflictRules ?? [];
  const result = [...singles];

  // Registered FDCs are already represented as their own medication candidates.
  // Additional multi-drug combinations are generated ONLY from an approved template.
  result.push(...approvedTemplateRegimens(request, glycemicSingles, state, request.inventory.regimenTemplates ?? [], conflicts));

  // Intensification is built from the FULL recognized active regimen, not one
  // current medication at a time. This prevents a two-drug current regimen from
  // being silently replaced by "one old drug + one new drug" during add-on generation.
  const activeCurrent = (request.patient.currentMedications ?? []).filter((item) =>
    (item.status ?? "active") === "active" && item.masterDrugId && item.tolerance !== "intolerant",
  );
  const currentSingles = activeCurrent
    .map((current) => glycemicSingles.find((item) => item.components[0]!.masterDrugId === current.masterDrugId))
    .filter((item): item is RegimenCandidateV2 => Boolean(item));

  let currentBaseline: RegimenCandidateV2 | undefined;
  if (currentSingles.length) {
    currentBaseline = currentSingles[0];
    for (const currentSingle of currentSingles.slice(1)) {
      if (!currentBaseline) break;
      currentBaseline = combineRegimens(
        currentBaseline, currentSingle, "current_regimen_plus_add_on", conflicts,
        "رژیم فعلی شناخته‌شده به‌عنوان baseline ساختاریافته بازسازی شد.",
      );
    }
  }

  if (currentBaseline) {
    const baselineIds = new Set(currentBaseline.components.map((item) => item.masterDrugId));
    for (const addOn of glycemicSingles) {
      if (baselineIds.has(addOn.components[0]!.masterDrugId)) continue;
      const combined = combineRegimens(
        currentBaseline, addOn, "current_regimen_plus_add_on", conflicts,
        "تشدید درمان با حفظ تمام اجزای قابل‌تحمل رژیم فعلی و افزودن یک add-on؛ eligibility نهایی در Hard Gate بررسی می‌شود.",
      );
      if (combined) result.push(combined);
    }
  }

  const deduped = new Map<string, RegimenCandidateV2>();
  for (const candidate of result) if (!deduped.has(candidate.regimenId)) deduped.set(candidate.regimenId, candidate);
  return [...deduped.values()];
}
