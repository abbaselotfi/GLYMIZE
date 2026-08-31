import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_ITERATIONS,
  CREDENTIAL_SCHEME,
  LEGACY_PBKDF2_MAX_ITERATIONS,
  SCRYPT_N,
  SCRYPT_P,
  SCRYPT_R,
  WORKERD_MAX_SCRYPT_COST,
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

  it("stores a versioned salted scrypt credential and never the plaintext", async () => {
    const password = "A-strong-test-password-2026";
    const stored = await createCredential(password);

    expect(CREDENTIAL_SCHEME).toBe("scrypt-v1");
    expect(CREDENTIAL_ITERATIONS).toBe(SCRYPT_N);
    expect(SCRYPT_N * SCRYPT_R * SCRYPT_P).toBeLessThanOrEqual(WORKERD_MAX_SCRYPT_COST);
    expect(stored.iterations).toBe(CREDENTIAL_ITERATIONS);
    expect(stored.salt.length).toBeGreaterThan(10);
    expect(stored.hash.startsWith(`${CREDENTIAL_SCHEME}$`)).toBe(true);
    expect(stored.hash).not.toContain(password);
    expect(await credentialMatches(password, stored)).toBe(true);
    expect(await credentialMatches("wrong-password-2026", stored)).toBe(false);
  });

  it("fails closed for legacy PBKDF2 costs above the workerd limit", async () => {
    expect(LEGACY_PBKDF2_MAX_ITERATIONS).toBe(100000);
    await expect(
      credentialMatches("A-strong-test-password-2026", {
        hash: "legacy-unversioned-hash",
        salt: "AQIDBAUGBwgJCgsMDQ4PEA",
        iterations: 600000,
      }),
    ).resolves.toBe(false);
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
    const credential = fs.readFileSync(
      new URL("../src/platform-v3-credential.ts", import.meta.url),
      "utf8",
    );
    const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

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

    expect(credential).toContain('CREDENTIAL_SCHEME = "scrypt-v1"');
    expect(credential).toContain('scrypt as nodeScrypt');
    expect(credential).not.toContain("CREDENTIAL_ITERATIONS=600000");
    expect(wrangler).toContain('"nodejs_compat"');
  });
});
