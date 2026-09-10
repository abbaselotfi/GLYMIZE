import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { PatientObservationView } from "@glymize/contracts/patient-core";
import { buildPatientObservationTrends } from "../lib/patient-observation-trends";

const scope = { practiceId: "practice-1", patientId: "patient-1" };

function observation(
  factId: string,
  value: number | string,
  observedAt: string,
  factKey = "observation:egfr:mL/min/1.73m2:",
): PatientObservationView {
  return {
    factId,
    factKey,
    displayName: "eGFR",
    value,
    unit: "mL/min/1.73m2",
    observedAt,
    meta: {
      scope,
      source: {
        sourceType: "patient_record_v2",
        recordType: "patient_observation",
        recordId: factId,
      },
      freshness: "unknown",
      verification: "verified",
    },
  };
}

describe("C1 Patient Workspace completion surfaces", () => {
  const completionSource = fs.readFileSync(
    new URL(
      "../app/patients/[patientId]/patient-workspace-c1-completion.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const workspaceLoaderSource = fs.readFileSync(
    new URL("../app/patients/[patientId]/patient-clinical-workspace.tsx", import.meta.url),
    "utf8",
  );
  const workspaceViewSource = fs.readFileSync(
    new URL("../app/patients/[patientId]/patient-clinical-workspace-view.tsx", import.meta.url),
    "utf8",
  );

  it("builds real repeated numeric trends without clinical thresholding", () => {
    const trends = buildPatientObservationTrends([
      observation("o3", 58, "2026-09-09T00:00:00.000Z"),
      observation("o1", 62, "2026-07-01T00:00:00.000Z"),
      observation("o2", 60, "2026-08-01T00:00:00.000Z"),
      observation("text", "not-numeric", "2026-09-08T00:00:00.000Z", "observation:note::"),
    ]);

    expect(trends).toHaveLength(1);
    expect(trends[0]?.points.map((point) => point.value)).toEqual([62, 60, 58]);
    expect(trends[0]?.latest).toBe(58);
    expect(trends[0]?.previous).toBe(60);
    expect(trends[0]?.direction).toBe("down");
  });

  it("requires at least two numeric observations in the same canonical series", () => {
    expect(buildPatientObservationTrends([observation("o1", 62, "2026-07-01T00:00:00.000Z")])).toEqual([]);
  });

  it("completes every remaining C1 roadmap surface through the decomposed view", () => {
    expect(completionSource).toContain('data-patient-workspace="problems"');
    expect(completionSource).toContain('data-patient-workspace="trends"');
    expect(completionSource).toContain('data-patient-workspace="clinical-modules-launcher"');
    expect(completionSource).toContain('data-patient-workspace="contextual-ai-drawer"');
    expect(workspaceLoaderSource).toContain("PatientClinicalWorkspaceView");
    expect(workspaceViewSource).toContain("PatientWorkspaceC1Completion");
  });

  it("treats an empty or incomplete problem projection as uncertainty, not absence", () => {
    expect(completionSource).toContain("problemCoverageLimited");
    expect(completionSource).toContain("never proof that the patient has no disease or clinical problem");
    expect(completionSource).toContain("An empty list here is never proof");
  });

  it("uses the governed registry and keeps authority/release state explicit at the launcher", () => {
    expect(completionSource).toContain("CLINICAL_MODULE_REGISTRY");
    expect(completionSource).toContain('data-maturity={module.maturity}');
    expect(completionSource).toContain('data-treatment-authority={module.treatmentAuthority}');
    expect(completionSource).toContain('data-release-eligibility={module.releaseEligibility}');
    expect(completionSource).toContain("no clinical value is stored in the URL or transport");
    expect(completionSource).not.toContain("?patientId=");
  });

  it("creates a revision-only Type2 launch descriptor instead of carrying clinical values", () => {
    expect(completionSource).toContain("buildType2PatientCoreHandoffCandidate(model)");
    expect(completionSource).toContain("createPatientModuleHandoffIntent");
    expect(completionSource).toContain("sourceRevisions: candidate.sourceRevisions");
    expect(completionSource).toContain("writePatientModuleHandoffIntent(intent)");
    expect(completionSource).not.toContain("currentHba1c: candidate.prefill.currentHba1c");
  });

  it("keeps the contextual AI drawer non-authoritative and does not send patient data", () => {
    expect(completionSource).toContain("sends no patient data to the Evidence Assistant endpoint");
    expect(completionSource).toContain("without automatic context transfer");
    expect(completionSource).not.toContain("runtimeFetch");
    expect(completionSource).not.toContain("/v1/evidence-assistant/ask");
    expect(completionSource).not.toContain("fetch(");
  });

  it("makes trend direction explicitly arithmetic rather than clinical interpretation", () => {
    expect(completionSource).toContain("arithmetic direction only");
    expect(completionSource).toContain("not a clinical interpretation, target, or severity assessment");
  });
});