import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { patientPracticeContextRoute } from "../src/platform-patient-practice-contexts";

const runtime = fs.readFileSync(
  new URL("../src/platform-patient-practice-contexts.ts", import.meta.url),
  "utf8",
);
const contract = fs.readFileSync(
  new URL("../../../packages/contracts/src/patient-practice-contexts.ts", import.meta.url),
  "utf8",
);
const client = fs.readFileSync(
  new URL("../../web/lib/patient-practice-context-client.ts", import.meta.url),
  "utf8",
);
const design = fs.readFileSync(
  new URL("../../../docs/P5_B4_MULTI_PRACTICE_PATIENT_DESIGN.md", import.meta.url),
  "utf8",
);

const testEnv = {
  ADMIN_ORIGIN: "https://rc.example.test",
  SESSION_SECRET: "test-only-session-secret",
};

describe("P5-B4 multi-practice patient context", () => {
  it("returns a bounded patient-safe context projection", () => {
    expect(runtime).toContain("c.patient_account_id=?");
    expect(runtime).toContain("LIMIT 100");
    const publicContract = contract.slice(
      contract.indexOf("export interface PatientPracticeContext {"),
      contract.indexOf("export interface PatientPracticeContextSelectionInput"),
    );
    expect(publicContract).toContain("practiceId");
    expect(publicContract).toContain("relationshipStatus");
    expect(publicContract).toContain("linkedLocalRecord");
    expect(publicContract).not.toContain("localPatientId");
    expect(publicContract).not.toContain("portalUserId");
    expect(publicContract).not.toContain("nationalId");
    expect(design).toContain("never returns local patient IDs");
  });

  it("derives bridge readiness only from the exact verified practice-local mapping", () => {
    expect(runtime).toContain("u.practice_id=c.practice_id");
    expect(runtime).toContain("u.patient_id=c.local_patient_id");
    expect(runtime).toContain("l.patient_account_id=c.patient_account_id");
    expect(runtime).toContain("l.link_status='verified'");
    expect(runtime).toContain('row.status === "active"');
    expect(runtime).toContain('row.patient_proofing_status === "verified"');
    expect(runtime).toContain("linkingEnabled &&");
  });

  it("treats terminal contexts as history, not selectable state", () => {
    expect(runtime).toContain('row.status === "requested" || row.status === "active" || row.status === "paused"');
    expect(runtime).toContain("patient_practice_context_inactive");
  });

  it("rechecks selection ownership, confirmation and abuse limits server-side", () => {
    const selection = runtime.slice(
      runtime.indexOf("async function selectContext("),
      runtime.indexOf("export async function patientPracticeContextRoute("),
    );
    expect(selection).toContain("requirePatientAccountSession");
    expect(selection).toContain("consumeSelectionRate");
    expect(selection).toContain('body?.confirmed !== true');
    expect(selection).toContain("c.id=? AND c.patient_account_id=?");
    expect(selection).toContain("patient_account.practice_context_selected");
  });

  it("hard-codes that context selection grants no access", () => {
    expect(contract).toContain("grantsClinicalAccess: false");
    expect(contract).toContain("grantsCrossPracticeAccess: false");
    expect(runtime).toContain("grantsClinicalAccess: false");
    expect(runtime).toContain("grantsCrossPracticeAccess: false");
    expect(runtime).not.toContain("portal-session");
    expect(runtime).not.toContain("accessToken");
  });

  it("stores only the selected relationship UUID as a browser view preference", () => {
    expect(client).toContain('window.sessionStorage.setItem(STORAGE_KEY, body.selection.context.id)');
    expect(client).toContain("context.id === selectedId && context.selectable");
    expect(client).not.toContain("localStorage");
    expect(client).not.toContain("accessToken");
  });

  it("requires all dependency flags and stays OFF by default", async () => {
    const capability = await patientPracticeContextRoute(
      new Request("https://worker.example.test/v1/patient-practice-contexts/capabilities"),
      testEnv,
    );
    expect(await capability?.json()).toEqual({
      multiPracticePatient: false,
      contextSelectionGrantsAccess: false,
    });

    const missingDependency = await patientPracticeContextRoute(
      new Request("https://worker.example.test/v1/patient-practice-contexts/capabilities"),
      { ...testEnv, MULTI_PRACTICE_PATIENT_ENABLED: "true" },
    );
    expect(await missingDependency?.json()).toEqual({
      multiPracticePatient: false,
      contextSelectionGrantsAccess: false,
    });

    const disabled = await patientPracticeContextRoute(
      new Request("https://worker.example.test/v1/patient-practice-contexts"),
      testEnv,
    );
    expect(disabled?.status).toBe(403);
    expect(await disabled?.json()).toEqual({ error: "multi_practice_patient_disabled" });
  });

  it("returns a bodyless exact-origin CORS preflight", async () => {
    const response = await patientPracticeContextRoute(
      new Request("https://worker.example.test/v1/patient-practice-contexts", {
        method: "OPTIONS",
        headers: { origin: testEnv.ADMIN_ORIGIN },
      }),
      testEnv,
    );
    expect(response?.status).toBe(204);
    expect(response?.headers.get("access-control-allow-origin")).toBe(testEnv.ADMIN_ORIGIN);
    expect(await response?.text()).toBe("");
  });
});
