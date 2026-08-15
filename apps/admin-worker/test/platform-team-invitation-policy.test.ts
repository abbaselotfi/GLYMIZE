import { describe, expect, it } from "vitest";
import {
  assistantInvitationEmailEnabled,
  resolvePublicAppBaseUrl,
} from "../src/platform-team-invitation-policy";

describe("assistant invitation public URL", () => {
  it("uses root origin for RC-style /admin deployments", () => {
    expect(
      resolvePublicAppBaseUrl({
        ADMIN_ORIGIN: "https://rc.glymize.ir",
        ADMIN_PATH_PREFIX: "/admin",
      }),
    ).toBe("https://rc.glymize.ir");
  });

  it("preserves legacy GitHub Pages base path when required", () => {
    expect(
      resolvePublicAppBaseUrl({
        ADMIN_ORIGIN: "https://abbaselotfi.github.io",
        ADMIN_PATH_PREFIX: "/GLYMIZE/admin",
      }),
    ).toBe("https://abbaselotfi.github.io/GLYMIZE");
  });

  it("accepts explicit environment-specific PUBLIC_APP_URL", () => {
    expect(
      resolvePublicAppBaseUrl({
        ADMIN_ORIGIN: "https://irrelevant.example",
        ADMIN_PATH_PREFIX: "/admin",
        PUBLIC_APP_URL: "https://preview.glymize.ir/workspace/",
      }),
    ).toBe("https://preview.glymize.ir/workspace");
  });

  it("rejects insecure remote PUBLIC_APP_URL values", () => {
    expect(() =>
      resolvePublicAppBaseUrl({
        ADMIN_ORIGIN: "https://rc.glymize.ir",
        ADMIN_PATH_PREFIX: "/admin",
        PUBLIC_APP_URL: "http://example.com",
      }),
    ).toThrow("PUBLIC_APP_URL_INVALID");
  });
});

describe("assistant invitation email policy", () => {
  it("requires both global email and assistant-invitation toggles", () => {
    expect(
      assistantInvitationEmailEnabled({
        email: { enabled: true, assistantInvitation: true },
      }),
    ).toBe(true);

    expect(
      assistantInvitationEmailEnabled({
        email: { enabled: true, assistantInvitation: false },
      }),
    ).toBe(false);

    expect(
      assistantInvitationEmailEnabled({
        email: { enabled: false, assistantInvitation: true },
      }),
    ).toBe(false);

    expect(assistantInvitationEmailEnabled({})).toBe(false);
  });
});
