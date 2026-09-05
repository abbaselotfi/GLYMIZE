import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const entry = readFileSync(
  fileURLToPath(new URL("../app/portal/patient-portal-entry.tsx", import.meta.url)),
  "utf8",
);
const identity = readFileSync(
  fileURLToPath(new URL("../app/portal/patient-identity-portal.tsx", import.meta.url)),
  "utf8",
);
const hub = readFileSync(
  fileURLToPath(new URL("../app/portal/patient-care-hub.tsx", import.meta.url)),
  "utf8",
);

describe("Patient Care Hub multi-practice context boundary", () => {
  it("gates multi-practice context loading on the runtime capability", () => {
    expect(entry).toContain("setMultiPracticePatientEnabled(runtimeResult.value.multiPracticePatient)");
    expect(entry).toContain("multiPracticePatientEnabled={multiPracticePatientEnabled}");
    expect(identity).toContain("if (!multiPracticePatientEnabled)");
    expect(identity).toContain("listPatientPracticeContexts()");
  });

  it("keeps context selection explicitly non-authorizing", () => {
    expect(identity).toContain("selectPatientPracticeContext(context.id)");
    expect(identity).toContain("selection.grantsClinicalAccess || selection.grantsCrossPracticeAccess");
    expect(identity).toContain("PATIENT_CONTEXT_ACCESS_INVARIANT_FAILED");
    expect(hub).toContain("grants neither clinical nor cross-practice access");
  });

  it("keeps care contexts separate from verified clinical-record bridges", () => {
    expect(hub).toContain('data-patient-section="care-contexts"');
    expect(hub).toContain('data-patient-section="verified-record-links"');
    expect(hub).toContain("practiceContexts.map");
    expect(hub).toContain("links.map");
    expect(hub).not.toContain("practiceContexts.flatMap");
  });

  it("does not turn a linked local record flag into record access", () => {
    expect(hub).toContain("context.linkedLocalRecord");
    expect(hub).not.toContain("onOpenPractice(context");
    expect(hub).toContain("onOpenPractice(link)");
  });
});
