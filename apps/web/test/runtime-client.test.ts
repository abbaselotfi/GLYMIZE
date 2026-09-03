import { beforeEach, describe, expect, it, vi } from "vitest";

import { browserWindow } from "./browser-storage";

describe("runtime-client authentication", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_API_URL", "https://runtime.test");
    vi.stubGlobal("window", browserWindow());
    vi.stubGlobal("navigator", { platform: "test" });
  });

  it("refreshes once after a 401 and retries with the rotated access token", async () => {
    window.sessionStorage.setItem("glymize-runtime-access-v1", "expired-access");
    window.sessionStorage.setItem("glymize-runtime-refresh-session-v1", "refresh-token");
    const user = {
      id: "user-1",
      role: "assistant",
      status: "active",
      firstName: "Test",
      lastName: "Assistant",
      layoutPreset: "auto",
      practiceId: "practice-1",
      practiceName: "Test practice",
      permissions: ["care_team", "handoff.write"],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({
        accessToken: "fresh-access",
        accessExpiresAt: "2099-01-01T00:00:00.000Z",
        refreshToken: "fresh-refresh",
        refreshExpiresAt: "2099-02-01T00:00:00.000Z",
        user,
      }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { runtimeFetch } = await import("../lib/runtime-client");
    const response = await runtimeFetch("/v1/protected");

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get("authorization"))
      .toBe("Bearer fresh-access");
  });
});
