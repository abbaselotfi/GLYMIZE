import { beforeEach, describe, expect, it, vi } from "vitest";

import { browserWindow } from "./browser-storage";

describe("Care Team patient-record save regression", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_ADMIN_API_URL", "");
    vi.stubGlobal("window", browserWindow());
  });

  it("maps a missing Runtime API to the actionable handoff error", async () => {
    const { saveCareTeamPatientRecord } = await import("../lib/care-team-record-client");

    await expect(saveCareTeamPatientRecord({
      patientCode: "1042",
      patientCodeKind: "file_number",
      writeMode: "create",
    })).rejects.toThrow("HANDOFF_API_NOT_CONFIGURED");
  });

  it("maps a network fetch failure without hiding it behind the generic save error", async () => {
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_API_URL", "https://runtime.test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const { saveCareTeamPatientRecord } = await import("../lib/care-team-record-client");

    await expect(saveCareTeamPatientRecord({
      patientCode: "1042",
      patientCodeKind: "file_number",
      writeMode: "create",
    })).rejects.toThrow("HANDOFF_API_UNREACHABLE");
  });
});
