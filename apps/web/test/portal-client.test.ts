import { beforeEach, describe, expect, it, vi } from "vitest";

import { browserWindow } from "./browser-storage";

describe("portal-client sessions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_API_URL", "https://runtime.test");
    vi.stubGlobal("window", browserWindow());
  });

  it("stores a persistent login session in the correct browser stores", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      accessToken: "portal-access",
      accessExpiresAt: "2099-01-01T00:00:00.000Z",
      refreshToken: "portal-refresh",
      refreshExpiresAt: "2099-02-01T00:00:00.000Z",
      persistent: true,
      mustChangePassword: false,
    })));
    const { portalLogin } = await import("../lib/portal-client");

    await portalLogin("patient@example.test", "password", true);

    expect(window.sessionStorage.getItem("glymize-portal-access-v1"))
      .toBe("portal-access");
    expect(window.localStorage.getItem("glymize-portal-refresh-local-v1"))
      .toBe("portal-refresh");
    expect(window.sessionStorage.getItem("glymize-portal-refresh-session-v1"))
      .toBeNull();
  });

  it("preserves the server login error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json({ error: "invalid_credentials" }, { status: 401 }),
    ));
    const { portalLogin } = await import("../lib/portal-client");

    await expect(portalLogin("patient", "wrong", false))
      .rejects.toThrow("invalid_credentials");
  });
});
