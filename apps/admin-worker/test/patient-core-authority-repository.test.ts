import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientRecordV2RouteContext } from "../src/patient-record-v2/context";
import {
  readPatientCoreAllergies,
  readPatientCoreProblems,
  reconcilePatientCoreCollection,
  writePatientCoreAllergy,
  writePatientCoreProblem,
} from "../src/patient-core/authority-repository";

type RevisionRow = {
  fact_id: string;
  revision: number;
  patient_id: string;
  practice_id: string;
  payload_ciphertext: string;
  payload_iv: string;
  payload_auth_tag: string;
  created_by: string;
  created_at: string;
};

type ReconciliationRow = {
  practice_id: string;
  patient_id: string;
  family: "allergy" | "problem";
  revision: number;
  completeness: "partial" | "complete";
  payload_ciphertext: string;
  payload_iv: string;
  payload_auth_tag: string;
  reconciled_by: string;
  reconciled_at: string;
  created_at: string;
};

class AuthorityDatabase {
  readonly patients = new Set(["practice-1:patient-1", "practice-2:patient-2"]);
  readonly allergies: RevisionRow[] = [];
  readonly problems: RevisionRow[] = [];
  readonly reconciliations: ReconciliationRow[] = [];

  prepare(sql: string) {
    const database = this;
    return {
      bind(...values: unknown[]) {
        return {
          async first<T>() {
            if (sql.includes("FROM patient_registry")) {
              const [patientId, practiceId] = values.map(String);
              return (database.patients.has(`${practiceId}:${patientId}`)
                ? { id: patientId }
                : null) as T | null;
            }

            if (sql.includes("MAX(revision) AS revision")) {
              const [factId, patientId, practiceId] = values.map(String);
              const rows = sql.includes("patient_core_allergy_revisions")
                ? database.allergies
                : database.problems;
              const revisions = rows
                .filter(
                  (row) => row.fact_id === factId &&
                    row.patient_id === patientId &&
                    row.practice_id === practiceId,
                )
                .map((row) => row.revision);
              return { revision: revisions.length ? Math.max(...revisions) : null } as T;
            }

            if (sql.includes("FROM patient_core_collection_reconciliations")) {
              const [practiceId, patientId, family] = values.map(String);
              const row = database.reconciliations
                .filter(
                  (item) => item.practice_id === practiceId &&
                    item.patient_id === patientId &&
                    item.family === family,
                )
                .sort((left, right) => right.revision - left.revision)[0];
              return (row ?? null) as T | null;
            }

            throw new Error(`Unexpected first query: ${sql}`);
          },

          async all<T>() {
            if (!sql.includes("WITH latest AS")) {
              throw new Error(`Unexpected all query: ${sql}`);
            }
            const [practiceId, patientId, readPracticeId, readPatientId, limitValue] = values;
            expect(readPracticeId).toBe(practiceId);
            expect(readPatientId).toBe(patientId);
            const source = sql.includes("patient_core_allergy_revisions")
              ? database.allergies
              : database.problems;
            const scoped = source.filter(
              (row) => row.practice_id === String(practiceId) &&
                row.patient_id === String(patientId),
            );
            const latest = new Map<string, RevisionRow>();
            for (const row of scoped) {
              const existing = latest.get(row.fact_id);
              if (!existing || existing.revision < row.revision) latest.set(row.fact_id, row);
            }
            const rows = [...latest.values()]
              .sort(
                (left, right) =>
                  right.created_at.localeCompare(left.created_at) ||
                  left.fact_id.localeCompare(right.fact_id),
              )
              .slice(0, Number(limitValue));
            return { results: rows as T[] };
          },

          async run() {
            if (sql.includes("INSERT INTO patient_core_allergy_revisions")) {
              const [
                fact_id,
                revision,
                patient_id,
                practice_id,
                payload_ciphertext,
                payload_iv,
                payload_auth_tag,
                created_by,
                created_at,
              ] = values;
              const duplicate = database.allergies.some(
                (row) => row.fact_id === String(fact_id) && row.revision === Number(revision),
              );
              if (duplicate) throw new Error("UNIQUE constraint failed");
              database.allergies.push({
                fact_id: String(fact_id),
                revision: Number(revision),
                patient_id: String(patient_id),
                practice_id: String(practice_id),
                payload_ciphertext: String(payload_ciphertext),
                payload_iv: String(payload_iv),
                payload_auth_tag: String(payload_auth_tag),
                created_by: String(created_by),
                created_at: String(created_at),
              });
              return {};
            }

            if (sql.includes("INSERT INTO patient_core_problem_revisions")) {
              const [
                fact_id,
                revision,
                patient_id,
                practice_id,
                payload_ciphertext,
                payload_iv,
                payload_auth_tag,
                created_by,
                created_at,
              ] = values;
              const duplicate = database.problems.some(
                (row) => row.fact_id === String(fact_id) && row.revision === Number(revision),
              );
              if (duplicate) throw new Error("UNIQUE constraint failed");
              database.problems.push({
                fact_id: String(fact_id),
                revision: Number(revision),
                patient_id: String(patient_id),
                practice_id: String(practice_id),
                payload_ciphertext: String(payload_ciphertext),
                payload_iv: String(payload_iv),
                payload_auth_tag: String(payload_auth_tag),
                created_by: String(created_by),
                created_at: String(created_at),
              });
              return {};
            }

            if (sql.includes("INSERT INTO patient_core_collection_reconciliations")) {
              const [
                practice_id,
                patient_id,
                family,
                revision,
                completeness,
                payload_ciphertext,
                payload_iv,
                payload_auth_tag,
                reconciled_by,
                reconciled_at,
                created_at,
              ] = values;
              database.reconciliations.push({
                practice_id: String(practice_id),
                patient_id: String(patient_id),
                family: String(family) as "allergy" | "problem",
                revision: Number(revision),
                completeness: String(completeness) as "partial" | "complete",
                payload_ciphertext: String(payload_ciphertext),
                payload_iv: String(payload_iv),
                payload_auth_tag: String(payload_auth_tag),
                reconciled_by: String(reconciled_by),
                reconciled_at: String(reconciled_at),
                created_at: String(created_at),
              });
              return {};
            }

            throw new Error(`Unexpected run query: ${sql}`);
          },
        };
      },
    };
  }
}

function context(database: AuthorityDatabase, practiceId = "practice-1", secret = "clinical-secret") {
  return {
    database: database as unknown as D1Database,
    clinicalSecret: secret,
    user: {
      id: "clinician-1",
      role: "physician",
      practiceId,
      permissions: ["handoff.read", "handoff.write"],
      layoutPreset: "auto",
    },
  } as unknown as PatientRecordV2RouteContext;
}

const source = {
  sourceType: "patient_record_v2" as const,
  recordType: "patient_core_manual_entry",
  recordId: "entry-1",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-10T08:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("R28-06 Option A Patient Core authority repository", () => {
  it("keeps a legacy zero-row family not_collected until an explicit complete reconciliation", async () => {
    const database = new AuthorityDatabase();
    const routeContext = context(database);

    expect(await readPatientCoreAllergies(routeContext, "patient-1")).toMatchObject({
      completeness: "not_available",
      gapReason: "not_collected",
      items: [],
    });

    await reconcilePatientCoreCollection(routeContext, "patient-1", {
      schemaVersion: 1,
      family: "allergy",
      completeness: "complete",
      source,
    });

    expect(await readPatientCoreAllergies(routeContext, "patient-1")).toMatchObject({
      completeness: "complete",
      items: [],
      asOf: "2026-09-10T08:00:00.000Z",
    });
  });

  it("stores patient-reported facts unverified and requires reconciliation before collection completeness", async () => {
    const database = new AuthorityDatabase();
    const routeContext = context(database);
    const result = await writePatientCoreAllergy(routeContext, "patient-1", {
      schemaVersion: 1,
      displayName: "Penicillin",
      category: "medication",
      status: "active",
      criticality: "high",
      verification: "unverified",
      source: {
        sourceType: "patient_reported",
        recordType: "patient_report",
        recordId: "report-1",
      },
    });
    expect(result?.revision).toBe(1);

    const beforeReconciliation = await readPatientCoreAllergies(routeContext, "patient-1");
    expect(beforeReconciliation.completeness).toBe("partial");
    expect(beforeReconciliation.gapReason).toBe("not_collected");
    expect(beforeReconciliation.items[0]).toMatchObject({
      displayName: "Penicillin",
      meta: {
        verification: "unverified",
        freshness: "unknown",
        revision: 1,
        source: { sourceType: "patient_reported" },
      },
    });
  });

  it("preserves append-only revisions when a problem is resolved", async () => {
    const database = new AuthorityDatabase();
    const routeContext = context(database);
    const created = await writePatientCoreProblem(routeContext, "patient-1", {
      schemaVersion: 1,
      displayName: "Chronic kidney disease",
      status: "active",
      verification: "verified",
      verificationIntent: "direct_clinician_entry",
      source,
    });
    expect(created).not.toBeNull();

    vi.setSystemTime(new Date("2026-09-10T08:05:00.000Z"));
    const revised = await writePatientCoreProblem(routeContext, "patient-1", {
      schemaVersion: 1,
      factId: created!.factId,
      expectedRevision: 1,
      displayName: "Chronic kidney disease",
      status: "resolved",
      resolvedAt: "2026-09-10T08:04:00.000Z",
      verification: "verified",
      verificationIntent: "direct_clinician_entry",
      source,
    });

    expect(revised?.revision).toBe(2);
    expect(database.problems).toHaveLength(2);
    expect(database.problems.map((row) => row.revision)).toEqual([1, 2]);
    const current = await readPatientCoreProblems(routeContext, "patient-1");
    expect(current.items).toHaveLength(1);
    expect(current.items[0]).toMatchObject({
      factId: created!.factId,
      status: "resolved",
      resolvedAt: "2026-09-10T08:04:00.000Z",
      meta: { revision: 2, recordedAt: "2026-09-10T08:05:00.000Z" },
    });
  });

  it("invalidates an older complete reconciliation after a later fact revision", async () => {
    const database = new AuthorityDatabase();
    const routeContext = context(database);
    const created = await writePatientCoreAllergy(routeContext, "patient-1", {
      schemaVersion: 1,
      displayName: "Latex",
      category: "other",
      status: "active",
      criticality: "unable_to_assess",
      verification: "verified",
      verificationIntent: "direct_clinician_entry",
      source,
    });

    vi.setSystemTime(new Date("2026-09-10T08:05:00.000Z"));
    await reconcilePatientCoreCollection(routeContext, "patient-1", {
      schemaVersion: 1,
      family: "allergy",
      completeness: "complete",
      source,
    });
    expect((await readPatientCoreAllergies(routeContext, "patient-1")).completeness)
      .toBe("complete");

    vi.setSystemTime(new Date("2026-09-10T08:10:00.000Z"));
    await writePatientCoreAllergy(routeContext, "patient-1", {
      schemaVersion: 1,
      factId: created!.factId,
      expectedRevision: 1,
      displayName: "Latex",
      category: "other",
      status: "resolved",
      criticality: "unable_to_assess",
      verification: "verified",
      verificationIntent: "direct_clinician_entry",
      source,
    });

    expect(await readPatientCoreAllergies(routeContext, "patient-1")).toMatchObject({
      completeness: "partial",
      gapReason: "other",
    });
  });

  it("fails optimistic revisions closed instead of overwriting history", async () => {
    const database = new AuthorityDatabase();
    const routeContext = context(database);
    const created = await writePatientCoreProblem(routeContext, "patient-1", {
      schemaVersion: 1,
      displayName: "Hypertension",
      status: "active",
      verification: "unverified",
      source,
    });

    await expect(writePatientCoreProblem(routeContext, "patient-1", {
      schemaVersion: 1,
      factId: created!.factId,
      expectedRevision: 9,
      displayName: "Hypertension",
      status: "resolved",
      verification: "unverified",
      source,
    })).rejects.toThrow("PATIENT_CORE_AUTHORITY_REVISION_CONFLICT");
    expect(database.problems).toHaveLength(1);
  });

  it("does not read or mutate a patient outside the active practice scope", async () => {
    const database = new AuthorityDatabase();
    const wrongPractice = context(database, "practice-2");
    expect(await writePatientCoreAllergy(wrongPractice, "patient-1", {
      schemaVersion: 1,
      displayName: "Penicillin",
      category: "medication",
      status: "active",
      criticality: "high",
      verification: "unverified",
      source,
    })).toBeNull();
    expect(database.allergies).toHaveLength(0);
    expect(await readPatientCoreAllergies(wrongPractice, "patient-1")).toMatchObject({
      completeness: "not_available",
      gapReason: "not_collected",
      items: [],
    });
  });

  it("fails closed if encrypted clinical fact payload cannot be opened", async () => {
    const database = new AuthorityDatabase();
    const writer = context(database, "practice-1", "secret-a");
    await writePatientCoreProblem(writer, "patient-1", {
      schemaVersion: 1,
      displayName: "Hypertension",
      status: "active",
      verification: "unverified",
      source,
    });

    await expect(
      readPatientCoreProblems(context(database, "practice-1", "secret-b"), "patient-1"),
    ).rejects.toThrow("PATIENT_CORE_AUTHORITY_DECRYPTION_FAILED");
  });
});
