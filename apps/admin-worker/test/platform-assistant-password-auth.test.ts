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
});
