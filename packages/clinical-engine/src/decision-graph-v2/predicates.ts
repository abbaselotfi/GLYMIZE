import type { FactKeyV2, PatientContextV2, PredicateV2, ScalarV2 } from "./types.js";

export type FactMapV2 = Record<FactKeyV2, ScalarV2 | undefined>;

export function finiteNonNegativeClinicalNumberV2(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function finitePositiveClinicalNumberV2(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function finitePercentClinicalNumberV2(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : undefined;
}

export function buildFactMapV2(patient: PatientContextV2, severeHyperglycemia: boolean): FactMapV2 {
  return {
    pregnancy: patient.pregnancy,
    "glycemia.severeHyperglycemia": severeHyperglycemia,
    "glycemia.fastingPlasmaGlucoseMgDl": finiteNonNegativeClinicalNumberV2(
      patient.glycemia.fastingPlasmaGlucoseMgDl,
    ),
    "glycemia.twoHourPostprandialGlucoseMgDl": finiteNonNegativeClinicalNumberV2(
      patient.glycemia.twoHourPostprandialGlucoseMgDl,
    ),
    "kidney.ckd": patient.kidney?.ckd,
    "kidney.eGfr": finiteNonNegativeClinicalNumberV2(patient.kidney?.eGfr),
    "kidney.creatinineClearanceMlMin": finiteNonNegativeClinicalNumberV2(
      patient.kidney?.creatinineClearanceMlMin,
    ),
    "kidney.uacrMgG": finiteNonNegativeClinicalNumberV2(patient.kidney?.uacrMgG),
    "kidney.potassiumMmolL": finitePositiveClinicalNumberV2(patient.kidney?.potassiumMmolL),
    "kidney.dialysis": patient.kidney?.dialysis,
    "cardiovascular.ascvd": patient.cardiovascular?.ascvd,
    "cardiovascular.heartFailure": patient.cardiovascular?.heartFailure,
    "cardiovascular.lvefPercent": finitePercentClinicalNumberV2(
      patient.cardiovascular?.lvefPercent,
    ),
    "liver.masldMash": patient.liver?.masldMash,
    "liver.fibrosisStage": patient.liver?.fibrosisStage,
    "liver.cirrhosis": patient.liver?.cirrhosis,
    "hypoglycemia.highRisk": patient.hypoglycemiaRisk === "high",
  };
}

function comparable(value: ScalarV2 | undefined): string | number | boolean | undefined {
  if (typeof value === "number" && !Number.isFinite(value)) return undefined;
  return value;
}

export function evaluatePredicateV2(predicate: PredicateV2, facts: FactMapV2): boolean {
  if ("all" in predicate) return predicate.all.every((item) => evaluatePredicateV2(item, facts));
  if ("any" in predicate) return predicate.any.some((item) => evaluatePredicateV2(item, facts));
  if ("not" in predicate) return !evaluatePredicateV2(predicate.not, facts);

  const fact = comparable(facts[predicate.fact]);
  if (predicate.op === "exists") return fact !== undefined && fact !== null;
  if (fact === undefined) return false;

  const expected = predicate.value;
  switch (predicate.op) {
    case "eq": return fact === expected;
    case "neq": return fact !== expected;
    case "lt": return typeof fact === "number" && typeof expected === "number" && fact < expected;
    case "lte": return typeof fact === "number" && typeof expected === "number" && fact <= expected;
    case "gt": return typeof fact === "number" && typeof expected === "number" && fact > expected;
    case "gte": return typeof fact === "number" && typeof expected === "number" && fact >= expected;
  }
}
