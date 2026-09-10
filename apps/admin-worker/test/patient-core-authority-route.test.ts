import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientRecordV2RouteContext } from "../src/patient-record-v2/context";
import { patientCoreAuthorityRoute } from "../src/patient-core/authority-route";
import {
  reconcilePatientCoreCollection,
  writePatientCoreAllergy,
  writePatientCoreProblem,
} from "../src/patient-core/authority-repository";

vi.mock("../src/patient-core/authority-repository", () => ({
  writePatientCoreAllergy: vi.fn(),
  writePatientCoreProblem: vi.fn(),
  reconcilePatientCoreCollection: vi.fn(),
}));

const writeAllergy = vi.mocked(writePatientCoreAllergy);
const writeProblem = vi.mocked(writePatientCoreProblem);
const reconcile = vi.mocked(reconcilePatientCoreCollection);

function context(options: {
  authorize?: (route: string) => boolean;
  encounterMatches?: boolean;
} = {}) {
  const audits: unknown[][] = [];
  const database = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first() {
              if (sql.includes("patient_encounters")) {
                return options.encounterMatches === false ? null : { id: values[0] };
              }
              throw new Error(`unexpected query: ${sql}`);
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return {
    value: {
      database,
      clinicalSecret: "clinical-secret",
      user: {
        id: "clinician-1",
        role: "physician",
        practiceId: "practice-1",
        permissions: ["handoff.read", "handoff.write"],
        layoutPreset: "auto",
      },
      authorize: async (route: string) => options.authorize?.(route) ?? true,
      respond: (body: unknown, status = 200) => Response.json(body, { status }),
      audit: async (...args: unknown[]) => { audits.push(args); },
    } as unknown as PatientRecordV2RouteContext,
    audits,
  };
}

const patientReportedAllergy = {
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
};

beforeEach(() => {
  vi.clearAllMocks();
  writeAllergy.mockResolvedValue({
    schemaVersion: 1,
    family: "allergy",
    factId: "allergy-1",
    revision: 1,
    recordedAt: "2026-09-10T08:00:00.000Z",
  });
  writeProblem.mockResolvedValue({
    schemaVersion: 1,
    family: "problem",
    factId: "problem-1",
    revision: 1,
    recordedAt: "2026-09-10T08:00:00.000Z",
  });
  reconcile.mockResolvedValue({
    schemaVersion: 1,
    family: "allergy",
    revision: 1,
    completeness: "complete",
    reconciledAt: "2026-09-10T08:00:00.000Z",
  });
});

describe("R28-06 Option A authority HTTP boundary", () => {
  it("allows an editor to persist an unverified candidate and audits without clinical display text", async () => {
    const fixture = context({
      authorize: (route) => route === "patient_record.clinical_fact.write",
    });
    const response = await patientCoreAuthorityRoute(
      new Request("https://worker.example/v1/patients/patient-1/patient-core/allergies", {
        method: "POST",
        body: JSON.stringify(patientReportedAllergy),
      }),
      fixture.value,
    );

    expect(response?.status).toBe(201);
    expect(writeAllergy).toHaveBeenCalledOnce();
    expect(fixture.audits).toHaveLength(1);
    expect(JSON.stringify(fixture.audits[0])).not.toContain("Penicillin");
  });

  it("requires approver authority for a verified canonical fact", async () => {
    const fixture = context({
      authorize: (route) => route === "patient_record.clinical_fact.write",
    });
    const response = await patientCoreAuthorityRoute(
      new Request("https://worker.example/v1/patients/patient-1/patient-core/problems", {
        method: "POST",
        body: JSON.stringify({
          schemaVersion: 1,
          displayName: "Hypertension",
          status: "active",
          verification: "verified",
          verificationIntent: "direct_clinician_entry",
          source: {
            sourceType: "patient_record_v2",
            recordType: "patient_core_manual_entry",
            recordId: "entry-1",
          },
        }),
      }),
      fixture.value,
    );

    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({ requiredRole: "approver" });
    expect(writeProblem).not.toHaveBeenCalled();
  });

  it("requires approver authority for an explicit collection-completeness assertion", async () => {
    const fixture = context({
      authorize: (route) => route !== "patient_record.clinical_fact.reconcile",
    });
    const response = await patientCoreAuthorityRoute(
      new Request("https://worker.example/v1/patients/patient-1/patient-core/reconciliation", {
        method: "POST",
        body: JSON.stringify({
          schemaVersion: 1,
          family: "allergy",
          completeness: "complete",
          source: {
            sourceType: "patient_record_v2",
            recordType: "allergy_reconciliation",
            recordId: "reconcile-1",
          },
        }),
      }),
      fixture.value,
    );

    expect(response?.status).toBe(403);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("rejects an encounter provenance reference outside the patient scope", async () => {
    const fixture = context({ encounterMatches: false });
    const response = await patientCoreAuthorityRoute(
      new Request("https://worker.example/v1/patients/patient-1/patient-core/allergies", {
        method: "POST",
        body: JSON.stringify({
          ...patientReportedAllergy,
          source: {
            ...patientReportedAllergy.source,
            encounterId: "encounter-other-patient",
          },
        }),
      }),
      fixture.value,
    );

    expect(response?.status).toBe(422);
    expect(await response?.json()).toEqual({ error: "patient_core_source_scope_mismatch" });
    expect(writeAllergy).not.toHaveBeenCalled();
  });

  it("rejects derived/AI material as a direct verified fact before repository mutation", async () => {
    const fixture = context();
    const response = await patientCoreAuthorityRoute(
      new Request("https://worker.example/v1/patients/patient-1/patient-core/allergies", {
        method: "POST",
        body: JSON.stringify({
          ...patientReportedAllergy,
          verification: "verified",
          verificationIntent: "clinician_review_of_external_source",
          source: {
            sourceType: "derived_projection",
            recordType: "ai_candidate",
            recordId: "ai-1",
          },
        }),
      }),
      fixture.value,
    );

    expect(response?.status).toBe(422);
    expect(writeAllergy).not.toHaveBeenCalled();
  });
});
