import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { decryptClinicalPayload, encryptClinicalPayload } from "../src/runtime-security";
import {
  measureRuntimeReadDecryption,
  measureRuntimeReadQuery,
  RuntimeReadMetricsCollector,
  type RuntimeReadMetricsSnapshot,
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

// Opt-in distribution run; ordinary CI retains the quick R28-05 structural gate.
const baseline = process.env.GLYMIZE_R29_BASELINE === "1";
const sampleCount = baseline ? 21 : 1;
if (
  process.env.GLYMIZE_R29_COHORT &&
  !cohorts.some((c) => c.name === process.env.GLYMIZE_R29_COHORT)
) {
  throw new Error("Invalid GLYMIZE_R29_COHORT");
}
const fingerprintPaths = [
  "../src/runtime-read-metrics.ts",
  "../src/runtime-security.ts",
  "../src/patient-core/pagination.ts",
  "./patient-core-longitudinal-performance.test.ts",
];

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1]!;
}

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
  it(
    "keeps initial read work bounded as source history grows",
    async () => {
      const encrypted = await encryptClinicalPayload(
        { value: 7.2, unit: "%" },
        "synthetic-clinical-secret",
        "synthetic-aad",
      );

      for (const cohort of cohorts.filter(
        (c) => !process.env.GLYMIZE_R29_COHORT || c.name === process.env.GLYMIZE_R29_COHORT,
      )) {
        const samples: Array<RuntimeReadMetricsSnapshot & { nodeProcessCpuMs: number }> = [];
        for (let sample = 0; sample < sampleCount; sample += 1) {
          const cpuStart = process.cpuUsage();
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
            const result = await measureRuntimeReadDecryption(metrics, () =>
              decryptClinicalPayload<Record<string, unknown>>(
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
          const cpu = process.cpuUsage(cpuStart);
          const nodeProcessCpuMs = (cpu.user + cpu.system) / 1000;
          samples.push({ ...snapshot, nodeProcessCpuMs });
          const evidence = {
            cohort: cohort.name,
            sourceObservationRows: cohort.sourceObservationRows,
            sourceTimelineRows: cohort.sourceTimelineRows,
            returnedObservationRows,
            returnedTimelineRows,
            timelineCandidateRows,
            ...snapshot,
          };
          if (!baseline) console.info("R28_05_SYNTHETIC_BUDGET", JSON.stringify(evidence));

          expect(snapshot.queryCount).toBe(13);
          expect(snapshot.decryptionCount).toBeLessThanOrEqual(150);
          expect(snapshot.rowCount).toBeLessThanOrEqual(210);
          expect(snapshot.responseBytes).toBeLessThanOrEqual(512 * 1024);
          expect(snapshot.decryptionMs).toBeLessThan(5_000);
          expect(snapshot.totalMs).toBeLessThan(5_000);
          expect(nodeProcessCpuMs).toBeLessThan(5_000);
          expect(snapshot.knownRowsRead).toBeNull();
          expect(snapshot.queryFailureCount).toBe(0);
          expect(snapshot.decryptionFailureCount).toBe(0);
        }
        if (baseline) {
          const repeated = samples.slice(1);
          const distributions = Object.fromEntries(
            (["totalMs", "decryptionMs", "queryMs", "nodeProcessCpuMs"] as const).map((key) => [
              key,
              {
                p50: percentile(
                  repeated.map((s) => s[key]),
                  0.5,
                ),
                p95: percentile(
                  repeated.map((s) => s[key]),
                  0.95,
                ),
                max: Math.max(...repeated.map((s) => s[key])),
              },
            ]),
          );
          // Deliberately loose local regression ceilings, not a Worker/free-tier SLA.
          for (const key of ["totalMs", "decryptionMs", "nodeProcessCpuMs"] as const) {
            expect(
              percentile(
                repeated.map((s) => s[key]),
                0.95,
              ),
            ).toBeLessThanOrEqual(500);
          }
          const fingerprint = createHash("sha256");
          for (const path of fingerprintPaths) {
            fingerprint.update(path).update(readFileSync(new URL(path, import.meta.url)));
          }
          console.info(
            "R29_01_BASELINE",
            JSON.stringify({
              schemaVersion: 1,
              benchmarkKind: "synthetic-count-model-real-webcrypto",
              sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
              sourceFingerprint: fingerprint.digest("hex"),
              fingerprintPaths,
              workingTreeDirty: Boolean(
                execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
              ),
              environment: {
                node: process.version,
                platform: process.platform,
                arch: process.arch,
                cpu: cpus()[0]?.model,
              },
              cohort,
              authorityModel: "enabled-empty-allergy-problem",
              firstRead: samples[0],
              repeatedSamples: repeated.length,
              distributions,
              samples,
              workerCpuMs: null,
              d1RowsRead: null,
              cloudRequests: 0,
              authIncluded: false,
              workerColdStartMeasured: false,
              // First read is in-process AFTER fixture encryption, not isolate cold start.
              firstReadMeaning: "fresh collector after fixture encryption; no app cache",
              budgets: {
                queryCount: 13,
                returnedRowsMax: 210,
                decryptionsMax: 150,
                responseBytesMax: 524288,
                localWallMsMax: 5000,
                localCpuMsMax: 5000,
                localRepeatedP95WallMsMax: 500,
                localRepeatedP95DecryptionMsMax: 500,
                localRepeatedP95CpuMsMax: 500,
              },
            }),
          );
        }
      }
    },
    baseline ? 120_000 : 30_000,
  );
});
