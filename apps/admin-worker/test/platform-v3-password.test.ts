import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_ITERATIONS,
  createCredential,
  credentialMatches,
  validCredentialValue,
} from "../src/platform-v3-credential";

describe("platform v3 password security", () => {
  it("enforces the 10-128 character password policy", () => {
    expect(validCredentialValue("123456789")).toBe(false);
    expect(validCredentialValue("1234567890")).toBe(true);
    expect(validCredentialValue("x".repeat(128))).toBe(true);
    expect(validCredentialValue("x".repeat(129))).toBe(false);
  });

  it("stores a salted PBKDF2-derived credential and never the plaintext", async () => {
    const password = "A-strong-test-password-2026";
    const stored = await createCredential(password);

    expect(CREDENTIAL_ITERATIONS).toBe(600000);
    expect(stored.iterations).toBe(CREDENTIAL_ITERATIONS);
    expect(stored.salt.length).toBeGreaterThan(10);
    expect(stored.hash).not.toContain(password);
    expect(await credentialMatches(password, stored)).toBe(true);
    expect(await credentialMatches("wrong-password-2026", stored)).toBe(false);
  });

  it("keeps routing, persistence, current-password and session-revocation contracts enabled", () => {
    const platform = fs.readFileSync(new URL("../src/platform-v3.ts", import.meta.url), "utf8");
    const profile = fs.readFileSync(
      new URL("../src/platform-v3-profile-password.ts", import.meta.url),
      "utf8",
    );
    const store = fs.readFileSync(
      new URL("../src/platform-v3-store-credential.ts", import.meta.url),
      "utf8",
    );

    expect(platform).toContain('url.pathname === "/v1/profile/password"');
    expect(platform).toContain("passwordLogin: true");
    expect(platform).toContain("passwordSetup: true");

    expect(profile).toContain("verifyCurrentCredential");
    expect(profile).toContain("current_password_invalid");
    expect(profile).toContain("saveCredential");
    expect(profile).toContain("auth.access.sessionId");

    expect(store).toContain("password_hash");
    expect(store).toContain("password_salt");
    expect(store).toContain("password_iterations");
    expect(store).toContain("UPDATE refresh_tokens");
    expect(store).toContain("id<>?");
    expect(store).not.toContain("console.log");
  });
});