import { describe, expect, it } from "vitest";
import {
  decryptClinicalPayload,
  encryptClinicalPayload,
} from "../src/runtime-security";
import {
  measureRuntimeReadDecryption,
  measureRuntimeReadQuery,
  RuntimeReadMetricsCollector,
} from "../src/runtime-read-metrics";
import {
  PATIENT_CORE_DEFAULT_OBSERVATION_PAGE_SIZE,
  PATIENT_CORE_DEFAULT_TIMELINE_PAGE_SIZE,
} from "../src/patient-core/pagination";

const cohorts = [
  { name: "small", sourceObservationRows: 40, sourceTimelineRows: 30 },
  { name: "medium", sourceObservationRows: 400, sourceTimelineRows: 300 },
  { name: "large", sourceObservationRows: 4_000, sourceTimelineRows: 3_000 },
] as const;

function syntheticPayload(observations: number, timeline: number) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-09T10:00:00.000Z",
    context: {
      observations: Array.from({ length: observations }, (_, index) => ({
        factId: `obs-${index}`,
        factKey: `observation:synthetic-${index % 12}:unit:serum`,
        displayName: `Synthetic observation ${index}`,
        value: index + 0.5,
        unit: "unit",
        observedAt: "2026-09-01T08:00:00.000Z",
      })),
    },
    timeline: Array.from({ length: timeline }, (_, index) => ({
      eventId: `encounter:${index}`,
      eventType: "encounter",
      effectiveAt: "2026-09-01T08:00:00.000Z",
      status: "completed",
      label: "synthetic",
    })),
  };
}

describe("R28-05 bounded longitudinal synthetic budgets", () => {
  it("keeps initial read work bounded as source history grows", async () => {
    const encrypted = await encryptClinicalPayload(
      { value: 7.2, unit: "%" },
      "synthetic-clinical-secret",
      "synthetic-aad",
    );

    for (const cohort of cohorts) {
      const metrics = new RuntimeReadMetricsCollector();
      const returnedObservationRows = Math.min(
        cohort.sourceObservationRows,
        PATIENT_CORE_DEFAULT_OBSERVATION_PAGE_SIZE,
      );
      const returnedTimelineRows = Math.min(
        cohort.sourceTimelineRows,
        PATIENT_CORE_DEFAULT_TIMELINE_PAGE_SIZE,
      );
      const timelineCandidateRows = Math.min(
        cohort.sourceTimelineRows,
        PATIENT_CORE_DEFAULT_TIMELINE_PAGE_SIZE + 1,
      );

      // Structural initial-read budget after R28-06 Option A when rollout is enabled:
      // registry + identifiers + demographics + latest encounter + snapshots +
      // observation count/page + encounter/order timeline candidates + bounded
      // allergy facts/reconciliation + bounded problem facts/reconciliation =
      // thirteen D1 operations regardless of observation/timeline source history.
      // These synthetic cohorts model empty Allergy/Problem authorities; their
      // independent item bounds are locked by R28-06 authority tests.
      const syntheticReturnedRows = [
        1,
        2,
        1,
        1,
        2,
        1,
        returnedObservationRows,
        timelineCandidateRows,
        timelineCandidateRows,
        0,
        0,
        0,
        0,
      ];
      for (const rowCount of syntheticReturnedRows) {
        await measureRuntimeReadQuery(
          metrics,
          async () => ({ rowCount }),
          (result) => result.rowCount,
        );
      }

      // Real AES-GCM work is measured on the CI runner. D1/network latency is
      // intentionally not claimed by this synthetic harness.
      const decryptionCount = 3 + returnedObservationRows + timelineCandidateRows;
      for (let index = 0; index < decryptionCount; index += 1) {
        const result = await measureRuntimeReadDecryption(
          metrics,
          () => decryptClinicalPayload<Record<string, unknown>>(
            encrypted,
            "synthetic-clinical-secret",
            "synthetic-aad",
          ),
        );
        expect(result).toEqual({ value: 7.2, unit: "%" });
      }

      const snapshot = metrics.finish(
        syntheticPayload(returnedObservationRows, returnedTimelineRows),
      );
      const evidence = {
        cohort: cohort.name,
        sourceObservationRows: cohort.sourceObservationRows,
        sourceTimelineRows: cohort.sourceTimelineRows,
        returnedObservationRows,
        returnedTimelineRows,
        timelineCandidateRows,
        ...snapshot,
      };
      console.info("R28_05_SYNTHETIC_BUDGET", JSON.stringify(evidence));

      expect(snapshot.queryCount).toBe(13);
      expect(snapshot.decryptionCount).toBeLessThanOrEqual(150);
      expect(snapshot.rowCount).toBeLessThanOrEqual(210);
      expect(snapshot.responseBytes).toBeLessThanOrEqual(512 * 1024);
      expect(snapshot.decryptionMs).toBeLessThan(5_000);
      expect(snapshot.totalMs).toBeLessThan(5_000);
    }
  }, 30_000);
});
