import { beforeEach, describe, expect, it, vi } from "vitest";

import { browserWindow } from "./browser-storage";

describe("patient-record-v2-client response mapping", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_API_URL", "https://runtime.test");
    vi.stubGlobal("window", browserWindow());
  });

  it("preserves the server revision-conflict code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json({ error: "ENCOUNTER_REVISION_CONFLICT" }, { status: 409 }),
    ));
    const { revisePatientEncounter } = await import("../lib/patient-record-v2-client");

    await expect(revisePatientEncounter("patient-1", "encounter-1", {
      expectedRevision: 2,
      snapshot: {},
    })).rejects.toThrow("ENCOUNTER_REVISION_CONFLICT");
  });

  it("maps an empty forbidden response to the stable permission code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(null, { status: 403 }),
    ));
    const { getPatientWorkspace } = await import("../lib/patient-record-v2-client");

    await expect(getPatientWorkspace("patient-1"))
      .rejects.toThrow("PATIENT_RECORD_PERMISSION_DENIED");
  });
});
