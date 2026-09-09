import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptClinicalPayload } from "../src/runtime-security";
import type { PatientRecordV2RouteContext } from "../src/patient-record-v2/context";
import { readPatientCoreObservations } from "../src/patient-core/observation-reader";

vi.mock("../src/runtime-security", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/runtime-security")>();
  return { ...original, decryptClinicalPayload: vi.fn() };
});

type Row = {
  id: string;
  encounter_id: string;
  canonical_key: string;
  observed_at: string;
  verification: "unverified" | "confirmed" | "rejected";
  snapshot_revision: number;
  payload_ciphertext: string;
  payload_iv: string;
  payload_auth_tag: string;
  created_at: string;
};

function row(
  id: string,
  canonicalKey: string,
  verification: Row["verification"] = "confirmed",
  ordinal = 1,
): Row {
  const day = String(Math.max(1, Math.min(28, ordinal))).padStart(2, "0");
  return {
    id,
    encounter_id: `encounter-${id}`,
    canonical_key: canonicalKey,
    observed_at: `2026-08-${day}T08:00:00.000Z`,
    verification,
    snapshot_revision: 2,
    payload_ciphertext: id,
    payload_iv: `iv-${id}`,
    payload_auth_tag: `tag-${id}`,
    created_at: `2026-08-${day}T09:00:00.000Z`,
  };
}

function afterCursor(source: Row[], sql: string, bound: unknown[]) {
  if (!sql.includes("o.observed_at < ?")) return source;
  const observedAt = String(bound[4]);
  const createdAt = String(bound[6]);
  const id = String(bound[9]);
  return source.filter((item) =>
    item.observed_at < observedAt ||
    (item.observed_at === observedAt && item.created_at < createdAt) ||
    (item.observed_at === observedAt && item.created_at === createdAt && item.id < id)
  );
}

function context(sourceRows: Row[]) {
  const calls: Array<{ sql: string; bound: unknown[] }> = [];
  const sorted = [...sourceRows].sort((left, right) =>
    right.observed_at.localeCompare(left.observed_at) ||
    right.created_at.localeCompare(left.created_at) ||
    right.id.localeCompare(left.id),
  );
  const database = {
    prepare: (sql: string) => ({
      bind: (...bound: unknown[]) => {
        calls.push({ sql, bound });
        const sourceVersion = String(bound[2]);
        const scoped = afterCursor(
          sorted.filter((item) => item.created_at <= sourceVersion),
          sql,
          bound,
        );
        if (sql.includes("COUNT(*) AS source_row_count")) {
          const rejected = scoped.filter((item) => item.verification === "rejected").length;
          const raw = scoped.filter(
            (item) => item.verification !== "rejected" && item.canonical_key.startsWith("raw:"),
          ).length;
          const eligible = scoped.length - rejected - raw;
          return {
            first: async () => ({
              source_row_count: scoped.length,
              rejected_count: rejected,
              raw_count: raw,
              eligible_count: eligible,
            }),
          };
        }
        const eligible = scoped.filter(
          (item) => item.verification !== "rejected" && !item.canonical_key.startsWith("raw:"),
        );
        const limit = Number(bound.at(-1));
        return { all: async () => ({ results: eligible.slice(0, limit) }) };
      },
    }),
  };
  return {
    value: {
      database,
      user: { practiceId: "practice-1" },
      clinicalSecret: "clinical-secret",
    } as unknown as PatientRecordV2RouteContext,
    calls,
  };
}

const decrypt = vi.mocked(decryptClinicalPayload);
const sourceVersion = "2026-09-09T10:00:00.000Z";

beforeEach(() => {
  decrypt.mockReset();
});

describe("Patient Core observation completeness and pagination", () => {
  it("marks skipped eligible observations partial while accounting for intentional exclusions", async () => {
    const payloads: Record<string, Record<string, unknown>> = {
      valid: { value: 7.1, unit: "%", canonicalName: "HbA1c" },
      invalid: { value: null, canonicalName: "Missing value" },
    };
    decrypt.mockImplementation(async (encrypted) =>
      payloads[(encrypted as { ciphertext: string }).ciphertext] as never,
    );

    const fixture = context([
      row("valid", "hba1c", "confirmed", 4),
      row("rejected", "potassium", "rejected", 3),
      row("raw", "raw:free-text", "confirmed", 2),
      row("invalid", "creatinine", "confirmed", 1),
    ]);
    const result = await readPatientCoreObservations(fixture.value, "patient-1", {
      sourceVersion,
    });

    expect(result.completeness).toBe("partial");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      factId: "valid",
      factKey: "observation:hba1c:%:",
      value: 7.1,
      meta: { revision: 2 },
    });
    expect(result.diagnostics).toEqual({
      sourceScope: "latest_snapshot_revision_per_encounter",
      sourceRowCount: 4,
      eligibleCount: 2,
      includedCount: 1,
      intentionallyExcludedCount: 2,
      invalidSkippedCount: 1,
      truncatedCount: 0,
      exclusions: [
        { reason: "raw_namespace", count: 1 },
        { reason: "rejected", count: 1 },
      ],
    });
    expect(result.continuation).toMatchObject({
      sourceVersion,
      hasMore: false,
      remainingCount: 0,
    });
    expect(decrypt).toHaveBeenCalledTimes(2);
  });

  it("fails closed on decryption failure", async () => {
    decrypt.mockResolvedValue(null as never);
    const fixture = context([row("encrypted", "hba1c", "confirmed", 1)]);
    await expect(
      readPatientCoreObservations(fixture.value, "patient-1", { sourceVersion }),
    ).rejects.toThrow("PATIENT_OBSERVATION_DECRYPTION_FAILED");
  });

  it("walks a frozen eligible universe without duplicates or omissions", async () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      row(`obs-${index + 1}`, "hba1c", "confirmed", index + 1),
    );
    decrypt.mockImplementation(async (encrypted) => ({
      value: Number(String((encrypted as { ciphertext: string }).ciphertext).replace(/\D/g, "")),
      unit: "%",
      canonicalName: "HbA1c",
    }) as never);
    const fixture = context(rows);

    const ids: string[] = [];
    let page = await readPatientCoreObservations(fixture.value, "patient-1", {
      sourceVersion,
      limit: 2,
    });
    expect(page.diagnostics?.truncatedCount).toBe(3);

    for (;;) {
      ids.push(...page.items.map((item) => item.factId));
      if (!page.continuation?.hasMore) break;
      expect(page.continuation.nextCursor).toEqual(expect.any(String));
      page = await readPatientCoreObservations(fixture.value, "patient-1", {
        cursor: page.continuation.nextCursor,
        limit: 2,
      });
    }

    expect(ids).toEqual(["obs-5", "obs-4", "obs-3", "obs-2", "obs-1"]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(page.continuation).toMatchObject({ hasMore: false, remainingCount: 0 });
    expect(fixture.calls.every((call) => call.bound[0] === "practice-1")).toBe(true);
    expect(fixture.calls.every((call) => call.bound[1] === "patient-1")).toBe(true);
  });
});
