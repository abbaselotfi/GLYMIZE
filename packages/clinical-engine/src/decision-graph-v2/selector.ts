import type { ClinicalObjectiveV2, DecisionGraphRequestV2, RegimenCandidateV2 } from "./types.js";

const routeOrder = ["conflict_overridden", "neutral", "match"] as const;
const insuranceOrder = ["not_covered", "unknown", "conditional", "eligible"] as const;
const gateOrder = ["exclude", "needs_data", "historical_only", "conditional", "pass"] as const;
const availabilityOrder = [
  "excluded_unverified_match",
  "excluded_revoked",
  "excluded_never_licensed",
  "excluded_unavailable",
  "historical_only",
  "current_license_market_unconfirmed",
  "current_market",
] as const;
const hypoglycemiaOrder = ["high", "moderate", "low", "minimal"] as const;
const weightOrder = ["gain", "mixed", "unknown", "neutral", "loss"] as const;

function descendingOrder<T extends string>(left: T, right: T, order: readonly T[]) {
  return order.indexOf(right) - order.indexOf(left);
}

function ascendingNumber(left?: number, right?: number) {
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return left - right;
}

function availabilityOf(candidate: RegimenCandidateV2) {
  return candidate.components.map((item) => item.availability.classification).sort((a, b) => availabilityOrder.indexOf(a) - availabilityOrder.indexOf(b))[0]!;
}

function objectiveSupersetCompare(left: RegimenCandidateV2, right: RegimenCandidateV2, objectives: readonly ClinicalObjectiveV2[]) {
  const relevant = new Set(objectives.filter((item) => item.level !== "preference").map((item) => item.id));
  const l = new Set(left.objectiveCoverage.filter((item) => relevant.has(item)));
  const r = new Set(right.objectiveCoverage.filter((item) => relevant.has(item)));
  const leftSuperset = [...r].every((item) => l.has(item));
  const rightSuperset = [...l].every((item) => r.has(item));
  if (leftSuperset && !rightSuperset) return -1;
  if (rightSuperset && !leftSuperset) return 1;
  return 0;
}

function preferenceCriterionOrder(request: DecisionGraphRequestV2, objectives: readonly ClinicalObjectiveV2[]) {
  const criteria: string[] = ["gate", "objectiveCoverage"];
  if (objectives.some((item) => item.id === "low_hypoglycemia_risk" && item.level !== "preference")) criteria.push("hypoglycemia");
  if (objectives.some((item) => item.id === "weight_benefit" && item.level !== "preference")) criteria.push("weight");
  if (request.preferences.routePreference !== "oral_or_injectable") criteria.push("route");
  criteria.push("availability");
  if (request.preferences.costPreference === "insured_only") criteria.push("insurance");
  if (request.preferences.costPreference !== "no_constraint" || request.preferences.monthlyMedicationBudgetToman !== undefined) criteria.push("cost");
  if (request.preferences.adherencePriority === "simplify_regimen") criteria.push("burden", "distinctProducts");
  criteria.push("insurance", "cost", "burden", "distinctProducts", "stableName");
  return [...new Set(criteria)];
}

/** Deterministic lexicographic comparator; never aggregates dimensions. */
export function compareLexicographicallyV2(
  left: RegimenCandidateV2,
  right: RegimenCandidateV2,
  request: DecisionGraphRequestV2,
  objectives: readonly ClinicalObjectiveV2[] = [],
) {
  for (const criterion of preferenceCriterionOrder(request, objectives)) {
    let value = 0;
    if (criterion === "gate") value = descendingOrder(left.gate.status, right.gate.status, gateOrder);
    else if (criterion === "objectiveCoverage") value = objectiveSupersetCompare(left, right, objectives);
    else if (criterion === "hypoglycemia") value = descendingOrder(left.hypoglycemiaRisk, right.hypoglycemiaRisk, hypoglycemiaOrder);
    else if (criterion === "weight") value = descendingOrder(left.weightProfile, right.weightProfile, weightOrder);
    else if (criterion === "route") value = descendingOrder(left.routeFit, right.routeFit, routeOrder);
    else if (criterion === "availability") value = descendingOrder(availabilityOf(left), availabilityOf(right), availabilityOrder);
    else if (criterion === "insurance") value = descendingOrder(left.insuranceFit, right.insuranceFit, insuranceOrder);
    else if (criterion === "cost") value = ascendingNumber(left.monthlyPatientCostToman, right.monthlyPatientCostToman);
    else if (criterion === "burden") value = ascendingNumber(left.dailyAdministrationBurden, right.dailyAdministrationBurden);
    else if (criterion === "distinctProducts") value = left.distinctProducts - right.distinctProducts;
    else value = left.regimenId.localeCompare(right.regimenId);
    if (value !== 0) return value;
  }
  return 0;
}

export function selectLexicographicallyV2(
  candidates: readonly RegimenCandidateV2[],
  request: DecisionGraphRequestV2,
  objectives: readonly ClinicalObjectiveV2[] = [],
) {
  return [...candidates].sort((a, b) => compareLexicographicallyV2(a, b, request, objectives));
}

export function diversityKeyV2(candidate: RegimenCandidateV2) {
  return `${candidate.kind}|${[...new Set(candidate.components.map((item) => item.therapyGroup))].sort().join("+")}`;
}
