import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { legacyPatientWorkspaceHref, parsePatientWorkspaceQuery, patientWorkspaceHref } from "../lib/patient-workspace-url";

describe("static patient identity routing", () => {
  it.each(["0001", "Patient-A", " بیمار ", "a/b?c#d+e&f=g", "%2F", "a%", "😀"])("round trips opaque identity %s exactly", (id) => {
    const href = patientWorkspaceHref(id);
    expect(parsePatientWorkspaceQuery(href.slice(href.indexOf("?")))).toBe(id);
    expect(legacyPatientWorkspaceHref(`/patients/${encodeURIComponent(id)}`, "")).toBe(href);
    expect(legacyPatientWorkspaceHref(`/GLYMIZE/patients/${encodeURIComponent(id)}/`, "", "/GLYMIZE")).toBe(`/GLYMIZE${href}`);
  });

  it.each(["", "?patientId=", "?patientId=a&patientId=b", "?patientId=%", "?patientId=%GG", "?patientId=%C0%AF", "?patientId=%00", "?patientId=%7F", "?patientId=%ED%A0%80"])("rejects invalid query %s", (query) => {
    expect(parsePatientWorkspaceQuery(query)).toBeNull();
  });

  it.each(["", "a\n", "\u007f", "\ud800"])("rejects invalid builder identity", (id) => {
    expect(() => patientWorkspaceHref(id)).toThrow("PATIENT_ID_INVALID");
  });

  it.each(["/patients/", "/patients/a/b", "/patients/%", "/patients/%00", "/patients/%2e%2e", "/patient/a", "/portal/a", "/runtime-api/v1/patients/a", "/other/patients/a", "//external/patients/a"])("does not redirect unrelated/malformed path %s", (path) => {
    expect(legacyPatientWorkspaceHref(path, "")).toBeNull();
  });

  it("rejects ambiguous query-bearing legacy links and wrong base path", () => {
    expect(legacyPatientWorkspaceHref("/patients/a", "?patientId=b")).toBeNull();
    expect(legacyPatientWorkspaceHref("/patients/a", "?returnTo=https://evil.test")).toBeNull();
    expect(legacyPatientWorkspaceHref("/OTHER/patients/a", "", "/GLYMIZE")).toBeNull();
  });

  it("keys the patient subtree and invalidates continuation requests on teardown", () => {
    const entry = readFileSync(new URL("../app/patients/_components/patient-workspace-entry.tsx", import.meta.url), "utf8");
    const workspace = readFileSync(new URL("../app/patients/_components/patient-clinical-workspace.tsx", import.meta.url), "utf8");
    expect(entry).toContain("if (patientId === null)");
    expect(entry).toContain("key={patientId} patientId={patientId}");
    expect(workspace).toContain("signal: controller.signal");
    expect(workspace).toContain("if (controller.signal.aborted) return");
    expect(workspace).toMatch(/return \(\) => \{\s+invalidateHistory\(\)/);
  });
});
