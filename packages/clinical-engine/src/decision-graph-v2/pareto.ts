import type { ClinicalObjectiveV2, RegimenCandidateV2 } from "./types.js";

const routeOrder = ["conflict_overridden", "neutral", "match"] as const;
const insuranceOrder = ["not_covered", "unknown", "conditional", "eligible"] as const;
const hypoglycemiaOrder = ["high", "moderate", "low", "minimal"] as const;
const weightOrder = ["gain", "mixed", "unknown", "neutral", "loss"] as const;

function compareOrdered<T extends string>(left: T, right: T, order: readonly T[]): -1 | 0 | 1 {
  const delta = order.indexOf(left) - order.indexOf(right);
  return delta === 0 ? 0 : delta > 0 ? 1 : -1;
}

function compareLowerBetter(left?: number, right?: number): -1 | 0 | 1 | undefined {
  if (left === undefined || right === undefined) return undefined;
  if (left === right) return 0;
  return left < right ? 1 : -1;
}

function isSuperset<T>(left: readonly T[], right: readonly T[]) {
  const leftSet = new Set(left);
  return right.every((item) => leftSet.has(item));
}

/**
 * V2.7 deliberately does NOT make "more glucose lowering" a universal Pareto
 * advantage once pathway-specific efficacy adequacy has passed the hard gate.
 * This prevents a very-high-efficacy agent from mechanically dominating an
 * otherwise sufficient regimen when route, hypoglycemia, cost, or simplicity
 * are more relevant to the patient.
 */
export function dominatesV2(
  left: RegimenCandidateV2,
  right: RegimenCandidateV2,
  objectives: readonly ClinicalObjectiveV2[],
): boolean {
  if (left.lane !== right.lane) return false;
  const required = objectives.filter((item) => item.level !== "preference").map((item) => item.id);
  const leftCoverage = left.objectiveCoverage.filter((item) => required.includes(item));
  const rightCoverage = right.objectiveCoverage.filter((item) => required.includes(item));
  if (!isSuperset(leftCoverage, rightCoverage)) return false;

  const comparisons: Array<-1 | 0 | 1 | undefined> = [
    compareOrdered(left.routeFit, right.routeFit, routeOrder),
    compareOrdered(left.insuranceFit, right.insuranceFit, insuranceOrder),
    compareLowerBetter(left.monthlyPatientCostToman, right.monthlyPatientCostToman),
    compareLowerBetter(left.dailyAdministrationBurden, right.dailyAdministrationBurden),
    compareLowerBetter(left.distinctProducts, right.distinctProducts),
  ];

  if (objectives.some((item) => item.id === "low_hypoglycemia_risk" && item.level !== "preference")) {
    comparisons.unshift(compareOrdered(left.hypoglycemiaRisk, right.hypoglycemiaRisk, hypoglycemiaOrder));
  }
  if (objectives.some((item) => item.id === "weight_benefit" && item.level !== "preference")) {
    comparisons.unshift(compareOrdered(left.weightProfile, right.weightProfile, weightOrder));
  }

  if (comparisons.some((value) => value === undefined)) return false;
  const concrete = comparisons as Array<-1 | 0 | 1>;
  return concrete.every((value) => value >= 0) && concrete.some((value) => value > 0);
}

export function paretoPruneV2(candidates: readonly RegimenCandidateV2[], objectives: readonly ClinicalObjectiveV2[]) {
  return candidates.filter((candidate, index) =>
    !candidates.some((other, otherIndex) => otherIndex !== index && dominatesV2(other, candidate, objectives)),
  );
}
