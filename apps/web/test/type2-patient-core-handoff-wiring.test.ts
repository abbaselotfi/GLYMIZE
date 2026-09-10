import fs from "node:fs";
import { describe, expect, it } from "vitest";

const clientSource = fs.readFileSync(
  new URL("../app/type-2/type2-scenarios-client.tsx", import.meta.url),
  "utf8",
);
const hookSource = fs.readFileSync(
  new URL("../lib/use-type2-patient-core-handoff.ts", import.meta.url),
  "utf8",
);
const reviewSource = fs.readFileSync(
  new URL("../app/type-2/type2-patient-core-handoff-review.tsx", import.meta.url),
  "utf8",
);

describe("R28-07 Type 2 Patient Core handoff wiring", () => {
  it("re-reads Patient Core and checks runtime practice plus source revisions before review", () => {
    expect(hookSource).toContain("getCachedRuntimeUser() ?? await initializeRuntimeSession()");
    expect(hookSource).toContain("user.practiceId !== intent.scope.practiceId");
    expect(hookSource).toContain("getPatientLongitudinalReadModel(");
    expect(hookSource).toContain("expectedPracticeId: intent.scope.practiceId");
    expect(hookSource).toContain("type2PatientCoreHandoffMatchesIntent(nextCandidate, intent)");
    expect(hookSource).toContain("PATIENT_MODULE_HANDOFF_SOURCE_CHANGED");
  });

  it("requires explicit clinician confirmation before eligible Patient Core values touch the Type2 form", () => {
    expect(clientSource).toContain("const patientCoreHandoff = useType2PatientCoreHandoff()");
    expect(clientSource).toContain("patientCoreHandoff.confirm(applyPatientCoreHandoff)");
    expect(clientSource).toContain("function applyPatientCoreHandoff(candidate: Type2PatientCoreHandoffCandidate)");
    expect(reviewSource).toContain("Confirm and apply eligible candidates");
    expect(reviewSource).toContain("no candidate enters the form before your confirmation");
  });

  it("keeps target A1C outside Patient Core prefill and retains the existing Decision Graph submit path", () => {
    expect(clientSource).toContain('const [targetHba1c, setTargetHba1c] = useState("7")');
    expect(clientSource).not.toContain("prefill.targetHba1c");
    expect(clientSource).toContain('apiFetch("/v1/catalog/type-2/considerations"');
    expect(clientSource).toContain("buildType2TreatmentScenarios");
  });

  it("retains the legacy handoff path alongside the new governed Patient Core handoff", () => {
    expect(clientSource).toContain("function applyPatientHandoff(record: PatientHandoffRecord");
    expect(clientSource).toContain("<PatientHandoffLookup onApply={applyPatientHandoff} />");
    expect(clientSource).toContain("record.labs.filter((item) => item.verification === \"confirmed\")");
  });

  it("clears a failed or discarded descriptor instead of silently applying stale context", () => {
    expect(hookSource).toContain("clearPatientModuleHandoffIntent()");
    expect(hookSource).toContain('setState("invalid")');
    expect(reviewSource).toContain("No clinical value was applied");
    expect(reviewSource).toContain("FAIL CLOSED");
  });
});
