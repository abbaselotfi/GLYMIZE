import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptClinicalPayload } from "../src/runtime-security";
import type { PatientRecordV2RouteContext } from "../src/patient-record-v2/context";
import { readPatientCoreObservations } from "../src/patient-core/observation-reader";

vi.mock("../src/runtime-security", () => ({
  decryptClinicalPayload: vi.fn(),
}));

type Row = {
  id: string;
  encounter_id: string;
  canonical_key: string;
  observed_at: string;
  verification: "unverified" | "confirmed" | "rejected";
  payload_ciphertext: string;
  payload_iv: string;
  payload_auth_tag: string;
  created_at: string;
};

function row(
  id: string,
  canonicalKey: string,
  verification: Row["verification"] = "confirmed",
): Row {
  return {
    id,
    encounter_id: `encounter-${id}`,
    canonical_key: canonicalKey,
    observed_at: `2026-09-0${Math.min(9, Number(id.replace(/\D/g, "")) || 1)}T08:00:00.000Z`,
    verification,
    payload_ciphertext: id,
    payload_iv: `iv-${id}`,
    payload_auth_tag: `tag-${id}`,
    created_at: "2026-09-09T09:00:00.000Z",
  };
}

function context(rows: Row[]) {
  let sql = "";
  let bound: unknown[] = [];
  const all = vi.fn(async () => ({ results: rows }));
  const bind = vi.fn((...values: unknown[]) => {
    bound = values;
    return { all };
  });
  const prepare = vi.fn((value: string) => {
    sql = value;
    return { bind };
  });

  return {
    value: {
      database: { prepare },
      user: { practiceId: "practice-1" },
      clinicalSecret: "clinical-secret",
    } as unknown as PatientRecordV2RouteContext,
    inspect: () => ({ sql, bound }),
  };
}

const decrypt = vi.mocked(decryptClinicalPayload);

beforeEach(() => {
  decrypt.mockReset();
});

describe("Patient Core observation completeness contract", () => {
  it("marks skipped eligible observations partial while accounting for intentional exclusions", async () => {
    const payloads: Record<string, Record<string, unknown>> = {
      valid: { value: 7.1, unit: "%", canonicalName: "HbA1c" },
      invalid: { value: null, canonicalName: "Missing value" },
    };
    decrypt.mockImplementation(async (encrypted) =>
      payloads[(encrypted as { ciphertext: string }).ciphertext] as never,
    );

    const fixture = context([
      row("valid", "hba1c"),
      row("rejected", "potassium", "rejected"),
      row("raw", "raw:free-text"),
      row("invalid", "creatinine"),
    ]);
    const result = await readPatientCoreObservations(fixture.value, "patient-1");

    expect(result.completeness).toBe("partial");
    expect(result.gapReason).toBe("other");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      factId: "valid",
      factKey: "observation:hba1c:%:",
      value: 7.1,
      meta: { scope: { practiceId: "practice-1", patientId: "patient-1" } },
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
    expect(decrypt).toHaveBeenCalledTimes(2);
  });

  it("keeps expected rejected/raw exclusions complete for the declared source scope", async () => {
    const fixture = context([
      row("rejected", "potassium", "rejected"),
      row("raw", "raw:free-text"),
    ]);
    const result = await readPatientCoreObservations(fixture.value, "patient-1");

    expect(result.completeness).toBe("complete");
    expect(result.items).toEqual([]);
    expect(result.diagnostics).toMatchObject({
      sourceRowCount: 2,
      eligibleCount: 0,
      includedCount: 0,
      intentionallyExcludedCount: 2,
      invalidSkippedCount: 0,
      truncatedCount: 0,
    });
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("fails closed on decryption failure instead of returning partial or empty data", async () => {
    decrypt.mockResolvedValue(null as never);
    const fixture = context([row("encrypted", "hba1c")]);

    await expect(
      readPatientCoreObservations(fixture.value, "patient-1"),
    ).rejects.toThrow("PATIENT_OBSERVATION_DECRYPTION_FAILED");
  });

  it("binds reads to practice and patient and declares latest snapshot revision as source scope", async () => {
    const fixture = context([]);
    await readPatientCoreObservations(fixture.value, "patient-from-another-practice");

    const inspected = fixture.inspect();
    expect(inspected.bound).toEqual(["practice-1", "patient-from-another-practice"]);
    expect(inspected.sql).toContain("o.practice_id=? AND o.patient_id=?");
    expect(inspected.sql).toContain("o.snapshot_revision=(");
    expect(inspected.sql).toContain("SELECT MAX(s.revision)");
    expect(inspected.sql).not.toContain("o.verification<>'rejected'");
    expect(inspected.sql).not.toContain("o.canonical_key NOT LIKE 'raw:%'");
  });
});
