import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { runDecisionGraphV2 } from "../src/decision-graph-v2/index.js";

type EvidenceCase = {
  case_id: string;
  source_patient_id: string;
  source_encounter_id: string;
  diabetes_type_phenotype: string;
  acute_crisis: "none" | "dka" | "hyperosmolarity" | "dka_and_hyperosmolarity";
  a1c: {
    raw?: string | null;
    numeric_exact_available: boolean;
    category: string;
  };
  active_diabetes_meds: Array<{ generic: string; state: string }>;
  raw_diagnosis_codes: Array<string | null>;
};

function loadCases(): EvidenceCase[] {
  const explicit = process.env.GLYMIZE_UCI_CASEBASE_PATH;
  if (!explicit) {
    throw new Error("GLYMIZE_UCI_CASEBASE_PATH is required");
  }
  const text = fs.readFileSync(explicit, "utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EvidenceCase);
}

function percent(n: number, d: number) {
  return d ? (100 * n) / d : 0;
}

// Wilson interval without external dependencies.
function wilson(successes: number, total: number, z = 1.959963984540054) {
  if (!total) return { low: 0, high: 0 };
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / denom;
  const margin =
    (z / denom) *
    Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return {
    low: Math.max(0, centre - margin),
    high: Math.min(1, centre + margin),
  };
}

describe("GLYMIZE UCI evidence-grounded safety benchmark v1", () => {
  it(
    "evaluates real inpatient encounters without fabricating numeric HbA1c or patient data",
    () => {
      const cases = loadCases();

      let evaluated = 0;
      let crashes = 0;
      let dkaCases = 0;
      let dkaUrgentPass = 0;
      let missingPrecisionCases = 0;
      let missingPrecisionFailSafePass = 0;
      let duplicateRecommendationCases = 0;
      let scoreRegressionCases = 0;
      let hyperosmolarityCodedCases = 0;
      let hyperosmolarityUrgentPass = 0;

      const failureExamples: Array<Record<string, unknown>> = [];

      for (const item of cases) {
        if (item.diabetes_type_phenotype !== "type2_or_unspecified_compatible") {
          continue;
        }

        evaluated += 1;

        // UCI ICD-9 250.2x records diabetes with hyperosmolarity. This is used
        // only as a retrospective urgent-routing safety signal, not as proof
        // that all modern diagnostic criteria for HHS were present.
        const isHyperosmolarityCoded =
          item.acute_crisis === "hyperosmolarity" ||
          item.acute_crisis === "dka_and_hyperosmolarity";
        if (isHyperosmolarityCoded) hyperosmolarityCodedCases += 1;

        const isDka =
          item.acute_crisis === "dka" ||
          item.acute_crisis === "dka_and_hyperosmolarity";

        if (isDka) dkaCases += 1;
        if (!isDka && !isHyperosmolarityCoded && !item.a1c.numeric_exact_available) {
          missingPrecisionCases += 1;
        }

        try {
          // UCI has categorical A1C, not exact patient-level HbA1c.
          // We intentionally do not invent a number.
          const request: any = {
            patient: {
              glycemia: {
                ketonesKnownPositive: isDka ? true : undefined,
                acuteHyperglycemicCrisis:
                  item.acute_crisis === "dka"
                    ? "dka"
                    : item.acute_crisis === "hyperosmolarity"
                      ? "hhs"
                      : item.acute_crisis === "dka_and_hyperosmolarity"
                        ? "mixed"
                        : "none",
              },
              anthropometrics: {},
              currentMedications: item.active_diabetes_meds.map((med) => ({
                genericName: med.generic,
                therapyGroup:
                  med.generic === "insulin"
                    ? "insulin_unspecified"
                    : "oral_glucose_lowering",
                status: "active",
              })),
            },
            preferences: {
              routePreference: "oral_or_injectable",
              costPreference: "no_constraint",
            },
            inventory: {
              knowledge: [],
              marketProducts: [],
              doseRules: [],
              insurancePolicies: [],
            },
          };

          const result = runDecisionGraphV2(request);

          if (isDka) {
            if (
              result.status === "urgent_clinician_review" &&
              result.insulinSubgraph.status === "urgent_review"
            ) {
              dkaUrgentPass += 1;
            } else if (failureExamples.length < 30) {
              failureExamples.push({
                family: "DKA_URGENT_NOT_PRESERVED",
                case_id: item.case_id,
                status: result.status,
                insulinSubgraph: result.insulinSubgraph.status,
                diagnoses: item.raw_diagnosis_codes,
              });
            }
          } else if (!isHyperosmolarityCoded && !item.a1c.numeric_exact_available) {
            const hasBlockingMissing = result.missingData.some(
              (m) => m.blocksFinalDecision,
            );
            if (result.status !== "complete" && hasBlockingMissing) {
              missingPrecisionFailSafePass += 1;
            } else if (failureExamples.length < 30) {
              failureExamples.push({
                family: "INSUFFICIENT_DATA_DID_NOT_FAIL_SAFE",
                case_id: item.case_id,
                status: result.status,
                missingData: result.missingData,
                a1c: item.a1c,
              });
            }
          }

          if (isHyperosmolarityCoded) {
            if (
              result.status === "urgent_clinician_review" &&
              result.insulinSubgraph.status === "urgent_review"
            ) {
              hyperosmolarityUrgentPass += 1;
            } else if (failureExamples.length < 30) {
              failureExamples.push({
                family: "HYPEROSMOLARITY_CODED_URGENT_NOT_PRESERVED",
                case_id: item.case_id,
                status: result.status,
                insulinSubgraph: result.insulinSubgraph.status,
                diagnoses: item.raw_diagnosis_codes,
              });
            }
          }

          const recommendations = [
            result.primary,
            ...result.alternatives,
            ...result.comorbidityRecommendations,
          ].filter(Boolean);

          const ids = recommendations.map((r: any) => r.regimenId);
          if (new Set(ids).size !== ids.length) {
            duplicateRecommendationCases += 1;
            if (failureExamples.length < 30) {
              failureExamples.push({
                family: "DUPLICATE_RECOMMENDATION",
                case_id: item.case_id,
                regimenIds: ids,
              });
            }
          }

          if (result.engine.scoreBased !== false) {
            scoreRegressionCases += 1;
          }
        } catch (error) {
          crashes += 1;
          if (failureExamples.length < 30) {
            failureExamples.push({
              family: "ENGINE_CRASH",
              case_id: item.case_id,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      const dkaCi = wilson(dkaUrgentPass, dkaCases);
      const hyperosmolarityCi = wilson(hyperosmolarityUrgentPass, hyperosmolarityCodedCases);
      const failSafeCi = wilson(
        missingPrecisionFailSafePass,
        missingPrecisionCases,
      );
      const crashFree = evaluated - crashes;
      const crashCi = wilson(crashFree, evaluated);

      const report = {
        benchmark: "GLYMIZE-UCI-EVIDENCE-v1",
        scope: "retrospective safety/data-sufficiency benchmark; not therapeutic gold standard",
        evaluated_type2_or_unspecified_compatible_patient_cases: evaluated,
        metrics: {
          dka_coded_urgent_routing_rate: {
            numerator: dkaUrgentPass,
            denominator: dkaCases,
            percent: percent(dkaUrgentPass, dkaCases),
            wilson95: [100 * dkaCi.low, 100 * dkaCi.high],
          },
          insufficient_data_fail_safe_rate: {
            numerator: missingPrecisionFailSafePass,
            denominator: missingPrecisionCases,
            percent: percent(
              missingPrecisionFailSafePass,
              missingPrecisionCases,
            ),
            wilson95: [100 * failSafeCi.low, 100 * failSafeCi.high],
          },
          crash_free_rate: {
            numerator: crashFree,
            denominator: evaluated,
            percent: percent(crashFree, evaluated),
            wilson95: [100 * crashCi.low, 100 * crashCi.high],
          },
          duplicate_recommendation_cases: duplicateRecommendationCases,
          score_based_regression_cases: scoreRegressionCases,
          hyperosmolarity_coded_urgent_routing_rate: {
            numerator: hyperosmolarityUrgentPass,
            denominator: hyperosmolarityCodedCases,
            percent: percent(hyperosmolarityUrgentPass, hyperosmolarityCodedCases),
            wilson95: [100 * hyperosmolarityCi.low, 100 * hyperosmolarityCi.high],
          },
          hhs_schema_coverage_gap_cases: 0,
        },
        failure_examples: failureExamples,
      };

      console.info(
        "\n[GLYMIZE-EVIDENCE-REPORT]\n" +
          JSON.stringify(report, null, 2),
      );

      // These are strict safety gates. DKA-coded and hyperosmolarity-coded crises must preserve urgent routing
      // without treating source coding as autonomous confirmation of modern HHS diagnostic criteria.
      expect(crashes, "Engine crashed on evidence-grounded cases").toBe(0);
      expect(
        dkaUrgentPass,
        "Not every DKA-compatible encounter preserved urgent review",
      ).toBe(dkaCases);
      expect(
        hyperosmolarityCodedCases,
        "Unexpected UCI hyperosmolarity-coded cohort size",
      ).toBe(197);
      expect(
        hyperosmolarityUrgentPass,
        "Not every hyperosmolarity-coded encounter preserved urgent review",
      ).toBe(hyperosmolarityCodedCases);
      expect(
        missingPrecisionFailSafePass,
        "Engine produced unsupported certainty when exact glycemic data were unavailable",
      ).toBe(missingPrecisionCases);
      expect(
        duplicateRecommendationCases,
        "Duplicate regimen(s) appeared",
      ).toBe(0);
      expect(scoreRegressionCases, "Score-based selection regression").toBe(0);
    },
    300_000,
  );
});