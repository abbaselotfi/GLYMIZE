import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { PatientLongitudinalReadModel } from "@glymize/contracts/patient-core";
import {
  buildPatientTenSecondBrief,
  isSourceFlaggedObservation,
} from "../lib/patient-clinical-brief";

function model(
  overrides: {
    changes?: number;
    medicationStatus?: "active" | "held" | "uncertain";
    abnormalFlag?: string;
    completeness?: "complete" | "partial" | "not_available";
    current?: boolean;
    baseline?: boolean;
  } = {},
): PatientLongitudinalReadModel {
  const completeness = overrides.completeness ?? "complete";
  const scope = { practiceId: "practice-1", patientId: "patient-1" };
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-09T00:00:00.000Z",
    context: {
      schemaVersion: 1,
      generatedAt: "2026-09-09T00:00:00.000Z",
      identity: {
        scope,
        patient: {
          patientId: "patient-1",
          status: "active",
          identifiers: [],
        },
      },
      allergies: { completeness, items: [] },
      problems: { completeness, items: [] },
      medications: {
        completeness,
        items: overrides.medicationStatus
          ? [{
              factId: "med-1",
              factKey: "medication:x",
              displayName: "Example",
              status: overrides.medicationStatus,
              sourceState: "reconciled",
              adherence: "unknown",
              meta: {
                scope,
                source: {
                  sourceType: "patient_record_v2",
                  recordType: "snapshot",
                  recordId: "s1",
                },
                freshness: "unknown",
                verification: "verified",
              },
            }]
          : [],
      },
      observations: {
        completeness,
        items: overrides.abnormalFlag
          ? [{
              factId: "obs-1",
              factKey: "observation:x",
              displayName: "Example lab",
              value: 1,
              abnormalFlag: overrides.abnormalFlag,
              observedAt: "2026-09-09T00:00:00.000Z",
              meta: {
                scope,
                source: {
                  sourceType: "patient_record_v2",
                  recordType: "observation",
                  recordId: "o1",
                },
                freshness: "unknown",
                verification: "verified",
              },
            }]
          : [],
      },
      clinicalContexts: { completeness, items: [] },
    },
    timeline: { completeness, items: [] },
    changesSincePreviousEncounter: {
      schemaVersion: 1,
      scope,
      generatedAt: "2026-09-09T00:00:00.000Z",
      comparisonStatus: overrides.current && overrides.baseline ? "complete" : "unavailable",
      ...(overrides.current
        ? {
            current: {
              encounterId: "enc-current",
              effectiveAt: "2026-09-09T00:00:00.000Z",
              snapshotRevision: 1,
            },
          }
        : {}),
      ...(overrides.baseline
        ? {
            baseline: {
              encounterId: "enc-old",
              effectiveAt: "2026-08-01T00:00:00.000Z",
              snapshotRevision: 1,
            },
          }
        : {}),
      coverage: [],
      changes: Array.from({ length: overrides.changes ?? 0 }, (_, index) => ({
        changeId: `change-${index}`,
        family: "medication" as const,
        kind: "changed" as const,
        subjectKey: `medication:${index}`,
        displayName: `Medication ${index}`,
      })),
    },
  };
}

describe("C1 10-second Patient Workspace", () => {
  const loaderSource = fs.readFileSync(
    new URL("../app/patients/[patientId]/patient-clinical-workspace.tsx", import.meta.url),
    "utf8",
  );
  const viewSource = fs.readFileSync(
    new URL("../app/patients/[patientId]/patient-clinical-workspace-view.tsx", import.meta.url),
    "utf8",
  );
  const clientSource = fs.readFileSync(
    new URL("../lib/patient-clinical-core-client.ts", import.meta.url),
    "utf8",
  );

  it("prioritizes recorded review triggers without inventing a global severity score", () => {
    expect(buildPatientTenSecondBrief(model({ changes: 1 })).posture).toBe(
      "review_recorded_changes",
    );
    expect(buildPatientTenSecondBrief(model({ medicationStatus: "held" })).posture).toBe(
      "review_recorded_changes",
    );
    expect(buildPatientTenSecondBrief(model({ abnormalFlag: "H" })).posture).toBe(
      "review_recorded_changes",
    );
  });

  it("treats incomplete coverage as uncertainty rather than clinical stability", () => {
    const brief = buildPatientTenSecondBrief(model({ completeness: "partial" }));
    expect(brief.posture).toBe("coverage_limited");
    expect(brief.incompleteFamilyCount).toBe(6);
  });

  it("marks a current encounter without baseline as the first comparable record", () => {
    expect(
      buildPatientTenSecondBrief(model({ current: true, completeness: "complete" })).posture,
    ).toBe("first_recorded_encounter");
  });

  it("does not treat normal source flags as an attention signal", () => {
    expect(isSourceFlaggedObservation("N")).toBe(false);
    expect(isSourceFlaggedObservation("normal")).toBe(false);
    expect(isSourceFlaggedObservation("H")).toBe(true);
    expect(isSourceFlaggedObservation("LL")).toBe(true);
  });

  it("uses the B3 longitudinal endpoint as the dedicated workspace read source", () => {
    expect(clientSource).toContain("runtimeFetch");
    expect(clientSource).toContain("/longitudinal");
    expect(clientSource).toContain("PatientLongitudinalReadModel");
    expect(loaderSource).toContain("getPatientLongitudinalReadModel");
    expect(loaderSource).toContain("PatientClinicalWorkspaceView");
    expect(viewSource).toContain('data-patient-workspace="ten-second-brief"');
    expect(viewSource).toContain('data-patient-workspace="attention-now"');
    expect(viewSource).toContain('data-patient-workspace="what-changed"');
    expect(viewSource).toContain('data-patient-workspace="current-clinical-picture"');
    expect(viewSource).toContain('data-patient-workspace="data-coverage"');
  });

  it("keeps explicit safety language in the physician-facing brief", () => {
    expect(viewSource).toContain("does not infer disease severity");
    expect(viewSource).toContain("This does not mean the patient is clinically stable");
    expect(viewSource).toContain("Missing data is not evidence of clinical absence");
    expect(viewSource).not.toContain("healthScore");
    expect(viewSource).not.toContain("severityScore");
  });
});