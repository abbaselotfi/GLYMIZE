import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("assistant password invitation and login contracts", () => {
  const platformIndex = fs.readFileSync(
    new URL("../src/platform-index.ts", import.meta.url),
    "utf8",
  );
  const login = fs.readFileSync(
    new URL("../src/platform-v3-login.ts", import.meta.url),
    "utf8",
  );
  const platformV3 = fs.readFileSync(
    new URL("../src/platform-v3.ts", import.meta.url),
    "utf8",
  );
  const runtimeClient = fs.readFileSync(
    new URL("../../web/lib/runtime-client.ts", import.meta.url),
    "utf8",
  );
  const runtimeV3Client = fs.readFileSync(
    new URL("../../web/lib/runtime-v3-client.ts", import.meta.url),
    "utf8",
  );
  const account = fs.readFileSync(
    new URL("../../web/app/account/account-v3-client.tsx", import.meta.url),
    "utf8",
  );

  it("requires scrypt-backed password setup when an invited assistant has no credential", () => {
    expect(platformIndex).toContain("passwordSetupRequired");
    expect(platformIndex).toContain("validCredentialValue(newPassword)");
    expect(platformIndex).toContain("createCredential(newPassword)");
    expect(platformIndex).toContain("password_hash");
    expect(platformIndex).toContain("password_salt");
    expect(platformIndex).toContain("password_iterations");
    expect(platformIndex).toContain('existing.role!=="assistant"');
    expect(platformIndex).toContain("invitation_identity_conflict");
  });

  it("keeps physician login on Medical Council code and adds assistant identifier login", () => {
    expect(login).toContain("assistantCredentialLogin");
    expect(login).toContain("normalizeEmail(identifier)");
    expect(login).toContain("normalizeIranMobile(identifier)");
    expect(login).toContain("role='assistant'");
    expect(login).toContain("role='physician' AND medical_council_code=?");
    expect(login).toContain("practice_selection_required");
    expect(platformV3).toContain('"/v1/auth/assistant/password"');
    expect(platformV3).toContain("assistantPasswordLogin: true");
  });

  it("rate limits account and IP independently and does not enumerate unset passwords", () => {
    expect(login).toContain("credential-account:");
    expect(login).toContain("credential-ip:");
    expect(login).toContain("assistant-credential-account:");
    expect(login).toContain("assistant-credential-ip:");
    expect(login).toContain("!accountAllowed||!ipAllowed");
    expect(login).not.toContain('error:"password_not_set"');
  });

  it("propagates password setup and assistant login through the web client", () => {
    expect(runtimeClient).toContain("passwordSetupRequired?: boolean");
    expect(runtimeClient).toContain("newPassword?: string");
    expect(runtimeV3Client).toContain('endpoint("/v1/auth/assistant/password")');
    expect(runtimeV3Client).toContain("loginAssistantWithPassword");
    expect(runtimeV3Client).toContain("result.ready");
    expect(account).toContain('"assistantLogin"');
    expect(account).toContain("loginAssistantWithPassword");
    expect(account).toContain("invitation.passwordSetupRequired");
    expect(account).toContain("Assistant / nurse sign in");
  });

  it("keeps Account Persian copy valid UTF-8 without Windows-1256 mojibake", () => {
    const mojibakeMarkers = [
      "\u0638\u02c6",
      "\u0637\u00a7",
      "\u0637\u00b1",
      "\u063a\u0152",
      "\u00e2\u20ac",
      "\u0622\u00ab",
      "\u0639\u00a9",
      "\u0638\u2026",
      "\u0637\u00af",
      "\u0637\u00a8",
    ];

    for (const marker of mojibakeMarkers) {
      expect(account).not.toContain(marker);
    }

    expect(account).toContain(
      "\u0648\u0631\u0648\u062f \u062f\u0633\u062a\u06cc\u0627\u0631",
    );
    expect(account).toContain(
      "\u062f\u0639\u0648\u062a \u0628\u0647 \u062a\u06cc\u0645 \u0645\u0631\u0627\u0642\u0628\u062a GLYMIZE",
    );
    expect(account).toContain(
      "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u062f\u0633\u062a\u06cc\u0627\u0631",
    );
  });

});
