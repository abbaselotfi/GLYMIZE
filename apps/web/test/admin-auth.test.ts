import { beforeEach, describe, expect, it, vi } from "vitest";

import { browserWindow } from "./browser-storage";

describe("admin-auth browser handoff", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_ADMIN_API_URL", "https://admin.test");
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_API_URL", "https://runtime.test");
    vi.stubGlobal("window", browserWindow());
  });

  it("consumes the OAuth fragment without leaving the token in the URL", async () => {
    const replaceState = vi.fn();
    Object.assign(window.location, {
      hash: "#auth_session=github-session",
      pathname: "/admin",
      search: "?tab=catalog",
    });
    Object.assign(window.history, { replaceState });
    const { consumeAdminSessionFromLocation, getAdminSession } = await import("../lib/admin-auth");

    expect(consumeAdminSessionFromLocation()).toBe("github-session");
    expect(getAdminSession()).toBe("github-session");
    expect(replaceState).toHaveBeenCalledWith({}, "", "/admin?tab=catalog");
  });

  it("clears an invalid GitHub admin session", async () => {
    window.sessionStorage.setItem("glymize-admin-session", "expired-admin");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    const { getAdminIdentity } = await import("../lib/admin-auth");

    await expect(getAdminIdentity()).rejects.toThrow("admin_auth_invalid");
    expect(window.sessionStorage.getItem("glymize-admin-session")).toBeNull();
  });
});
