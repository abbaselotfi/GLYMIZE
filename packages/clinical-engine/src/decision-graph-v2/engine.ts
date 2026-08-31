import { resolveAdaptiveDataRequirementsV2 } from "./adaptive-data.js";
import { classifyClinicalStateV2 } from "./classify.js";
import { composeTreatmentPlanV2 } from "./composer.js";
import { enrichCandidateWithDoseMarketCostV2 } from "./enrich.js";
import { toRecommendationV2 } from "./explain.js";
import { applyHardGatesV2 } from "./gates.js";
import { resolveClinicalObjectivesV2 } from "./objectives.js";
import { paretoPruneV2 } from "./pareto.js";
import { defaultDecisionGraphPolicyV2 } from "./policy.js";
import { generateRegimenCandidatesV2 } from "./regimens.js";
import { diversityKeyV2, selectLexicographicallyV2 } from "./selector.js";
import { runInsulinDecisionSubgraphV2 } from "./insulin-subgraph.js";
import type {
  ClinicalObjectiveV2,
  DecisionGraphPolicyV2,
  DecisionGraphRequestV2,
  DecisionGraphResultV2,
  DecisionTraceEntryV2,
  RecommendationV2,
  RegimenCandidateV2,
} from "./types.js";

function mandatoryObjectivesForLane(objectives: readonly ClinicalObjectiveV2[], lane: RegimenCandidateV2["lane"]) {
  return objectives.filter((objective) => objective.level === "mandatory" && (objective.lane === lane || objective.lane === "glycemic"));
}

function isTopEligible(candidate: RegimenCandidateV2) {
  return candidate.gate.status === "pass";
}

function chooseDiverseAlternatives(primary: RegimenCandidateV2, ordered: readonly RegimenCandidateV2[], limit: number) {
  const chosen: RegimenCandidateV2[] = [];
  const keys = new Set<string>([diversityKeyV2(primary)]);
  for (const candidate of ordered) {
    if (candidate.regimenId === primary.regimenId) continue;
    const key = diversityKeyV2(candidate);
    if (!keys.has(key)) {
      chosen.push(candidate);
      keys.add(key);
    }
    if (chosen.length >= limit) return chosen;
  }
  for (const candidate of ordered) {
    if (candidate.regimenId === primary.regimenId || chosen.some((item) => item.regimenId === candidate.regimenId)) continue;
    chosen.push(candidate);
    if (chosen.length >= limit) break;
  }
  return chosen;
}

export function runDecisionGraphV2(
  request: DecisionGraphRequestV2,
  policy: DecisionGraphPolicyV2 = defaultDecisionGraphPolicyV2,
): DecisionGraphResultV2 {
  const trace: DecisionTraceEntryV2[] = [];
  const clinicalState = classifyClinicalStateV2(request.patient, policy);
  trace.push({ nodeId: "classify-clinical-state", status: "branched", summary: `Pathway=${clinicalState.pathway}; insulinAction=${clinicalState.insulinAction}`, details: clinicalState.reasons, evidence: clinicalState.evidence });

  const insulinSubgraph = runInsulinDecisionSubgraphV2(request.patient, clinicalState, policy);
  trace.push({ nodeId: "insulin-subgraph", status: insulinSubgraph.status === "needs_data" ? "needs_data" : insulinSubgraph.status === "urgent_review" ? "blocked" : "branched", summary: `Insulin subgraph=${insulinSubgraph.status}; requiresTool=${insulinSubgraph.requiresInsulinTool}`, details: insulinSubgraph.rationale, evidence: insulinSubgraph.evidence });

  const missingData = resolveAdaptiveDataRequirementsV2(request, clinicalState, policy);
  const blockingMissing = missingData.filter((item) => item.blocksFinalDecision);
  trace.push({ nodeId: "adaptive-data", status: blockingMissing.length ? "needs_data" : "passed", summary: `${missingData.length} adaptive data requirement(s); ${blockingMissing.length} blocking.` });

  const objectives = resolveClinicalObjectivesV2(request, clinicalState, policy);
  trace.push({ nodeId: "resolve-objectives", status: "passed", summary: `Resolved ${objectives.length} clinical objective(s).`, details: objectives.map((item) => `${item.level}:${item.id}`) });

  const generated = generateRegimenCandidatesV2(request, clinicalState);
  trace.push({ nodeId: "generate-regimens", status: "passed", summary: `Generated ${generated.length} regimen candidate(s) without free-form combinatorial prescribing.` });

  const gated = generated.map((candidate) => applyHardGatesV2(request, clinicalState, objectives, candidate));
  const enriched = gated.map((candidate) => enrichCandidateWithDoseMarketCostV2(request, candidate));
  trace.push({ nodeId: "hard-gates", status: "passed", summary: `${enriched.filter(isTopEligible).length} candidate(s) survived hard gates for executable consideration.` });

  const historical = enriched.filter((candidate) => candidate.gate.status === "historical_only");
  const excluded = enriched.filter((candidate) => candidate.gate.status === "exclude" || candidate.gate.status === "needs_data");
  const topEligible = enriched.filter(isTopEligible);

  // Primary glycemic selection is independent from additional organ-protection lanes.
  const glycemicMandatory = mandatoryObjectivesForLane(objectives, "glycemic");
  const glycemicPool = glycemicMandatory.length
    ? topEligible.filter((candidate) => candidate.lane === "glycemic" && glycemicMandatory.every((objective) => candidate.objectiveCoverage.includes(objective.id) || objective.id === "high_efficacy_glycemic_control" || objective.id === "insulin_replacement"))
    : [];
  const pruned = paretoPruneV2(glycemicPool, objectives);
  const ordered = selectLexicographicallyV2(pruned, request, objectives);
  trace.push({ nodeId: "pareto-prune", status: "passed", summary: `${glycemicPool.length} glycemic candidate(s) → ${pruned.length} non-dominated candidate(s).` });
  trace.push({ nodeId: "lexicographic-select", status: "passed", summary: "Selection used ordered constraints only; no aggregate score was calculated." });

  const primaryCandidate = ordered[0];
  const alternativeCandidates = primaryCandidate ? chooseDiverseAlternatives(primaryCandidate, ordered, policy.topAlternativeCount) : [];
  const primary = primaryCandidate ? toRecommendationV2(primaryCandidate, objectives, request, clinicalState) : undefined;
  const alternatives = alternativeCandidates.map((item) => toRecommendationV2(item, objectives, request, clinicalState));

  const treatmentPlan = composeTreatmentPlanV2({
    request,
    state: clinicalState,
    objectives,
    glycemicRegimen: primaryCandidate,
    executableCandidates: topEligible,
  });
  const alternativeTreatmentPlans = alternativeCandidates
    .map((candidate) => composeTreatmentPlanV2({ request, state: clinicalState, objectives, glycemicRegimen: candidate, executableCandidates: topEligible }))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const supportIds = new Set(treatmentPlan?.supportingRegimenIds ?? []);
  const supportCandidates = [...supportIds]
    .map((id) => topEligible.find((candidate) => candidate.regimenId === id))
    .filter((item): item is RegimenCandidateV2 => Boolean(item));
  const supportByComponentSet = new Map<string, RegimenCandidateV2>();
  for (const item of supportCandidates) {
    const key = item.components.map((component) => component.masterDrugId).sort().join("+");
    if (!supportByComponentSet.has(key)) supportByComponentSet.set(key, item);
  }
  const comorbidityRecommendations: RecommendationV2[] = [...supportByComponentSet.values()]
    .map((item) => toRecommendationV2(item, objectives, request, clinicalState));

  const selectedIds = new Set([
    primaryCandidate?.regimenId,
    ...alternativeCandidates.map((item) => item.regimenId),
    ...(treatmentPlan?.supportingRegimenIds ?? []),
  ].filter((item): item is string => Boolean(item)));
  const moreCurrent = enriched
    .filter((candidate) => (candidate.gate.status === "pass" || candidate.gate.status === "conditional") && !selectedIds.has(candidate.regimenId))
    .sort((a, b) => a.regimenId.localeCompare(b.regimenId));
  const moreOptions = [...moreCurrent, ...historical]
    .map((item) => toRecommendationV2(item, objectives, request, clinicalState));

  trace.push({
    nodeId: "regimen-compose",
    status: treatmentPlan?.unresolvedObjectives.length ? "blocked" : "passed",
    summary: treatmentPlan
      ? `Composed one unified plan with ${treatmentPlan.components.length} unique medication component(s); ${treatmentPlan.unresolvedObjectives.length} mandatory objective(s) unresolved.`
      : "No new executable treatment plan was required/constructed.",
    details: treatmentPlan?.reasons,
  });

  const conflicts: string[] = [];
  if (!primary && objectives.some((item) => item.lane === "glycemic" && item.level === "mandatory")) {
    conflicts.push("هیچ رژیم جاری نتوانست تمام Hard Gateها و اهداف mandatory گلیسمیک را هم‌زمان عبور دهد؛ موتور از ساخت توصیه قطعی خودداری کرد.");
  }
  if (blockingMissing.length) conflicts.push("اطلاعات بالینی blocking ناقص است؛ Recommendation نهایی تا تکمیل داده قفل می‌ماند.");
  if (treatmentPlan?.unresolvedObjectives.length) {
    conflicts.push(`Plan یکپارچه نتوانست اهداف mandatory زیر را با گزینه‌های executable و سازگار هم‌زمان پوشش دهد: ${treatmentPlan.unresolvedObjectives.join("، ")}.`);
  }

  // GLYMIZE_MANDATORY_INSULIN_ACCESS_STATUS_V5
  // A clinically mandatory insulin recommendation may remain visible even when
  // insured_only cannot verify coverage. That preserves clinical safety, but
  // access is unresolved and the overall result must not be labelled complete.
  const mandatoryInsulinAccessConflict =
    request.preferences.costPreference === "insured_only" &&
    Boolean(
      primary &&
      primary.components.some((component) => /insulin/.test(component.therapyGroup)) &&
      primary.insuranceFit !== "eligible" &&
      primary.insuranceFit !== "conditional" &&
      primary.preferenceConflicts.some((item) => item.includes("الزام بالینی")),
    );

  let status: DecisionGraphResultV2["status"] = "complete";
  if (
    request.patient.glycemia.acuteHyperglycemicCrisis === "dka" ||
    request.patient.glycemia.acuteHyperglycemicCrisis === "hhs" ||
    request.patient.glycemia.acuteHyperglycemicCrisis === "mixed" ||
    request.patient.glycemia.ketonesKnownPositive ||
    (clinicalState.severeHyperglycemia && request.patient.glycemia.catabolicFeatures)
  ) status = "urgent_clinician_review";
  else if (blockingMissing.length) status = "needs_data";
  else if (mandatoryInsulinAccessConflict) status = "no_fully_eligible_regimen";
  else if (treatmentPlan?.unresolvedObjectives.length) status = "no_fully_eligible_regimen";
  else if (!primary && objectives.some((item) => item.lane === "glycemic" && item.level === "mandatory")) status = "no_fully_eligible_regimen";

  return {
    engine: {
      name: "GLYMIZE Decision Graph",
      version: policy.engineVersion,
      scoreBased: false,
      selectionMethod: "hard_gates_then_pareto_then_lexicographic",
    },
    status,
    clinicalState,
    insulinSubgraph,
    missingData,
    objectives,
    primary,
    alternatives,
    comorbidityRecommendations,
    treatmentPlan,
    alternativeTreatmentPlans,
    moreOptions,
    excluded,
    conflicts,
    trace,
  };
}
