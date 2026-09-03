import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { providerDirectoryRoute } from "../src/platform-provider-directory";

const migration = fs.readFileSync(
  new URL("../migrations/0011_provider_directory_foundation.sql", import.meta.url),
  "utf8",
);
const runtime = fs.readFileSync(
  new URL("../src/platform-provider-directory.ts", import.meta.url),
  "utf8",
);
const contract = fs.readFileSync(
  new URL("../../../packages/contracts/src/provider-directory.ts", import.meta.url),
  "utf8",
);
const design = fs.readFileSync(
  new URL("../../../docs/P5_B1_PROVIDER_DIRECTORY_DESIGN.md", import.meta.url),
  "utf8",
);

const testEnv = {
  ADMIN_ORIGIN: "https://rc.example.test",
  SESSION_SECRET: "test-only-session-secret",
};

describe("P5-B1 provider directory foundation", () => {
  it("is additive and preserves the practice-local patient record boundary", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS provider_profiles");
    expect(migration).toContain(
      "REFERENCES practice_memberships(practice_id, user_id) ON DELETE CASCADE",
    );
    expect(migration).toContain("UNIQUE (practice_id, physician_user_id)");
    expect(migration).not.toMatch(/ALTER TABLE\s+patient_registry/i);
    expect(migration).not.toMatch(/CREATE TABLE[^;]*care_relationship/i);
    expect(migration).not.toMatch(/CREATE TABLE[^;]*referral/i);
    expect(migration).not.toContain("DROP TABLE");
    expect(migration).not.toContain("DELETE FROM");
    expect(design).toMatch(
      /`patient_registry` remains the authoritative practice-local\s+clinical file/,
    );
  });

  it("requires explicit publication and supports platform suspension", () => {
    expect(migration).toContain("('hidden','published','suspended')");
    expect(migration).toContain("directory_status <> 'published' OR published_at IS NOT NULL");
    expect(runtime).toContain('body?.confirmed !== true');
    expect(runtime).toContain('current.directory_status === "suspended"');
    expect(runtime).toContain('current.irimc_status !== "verified"');
    expect(runtime).toContain("provider_identity_verification_required");
    expect(runtime).toContain('const status = action === "publish" ? "published" : "hidden"');
    expect(runtime).toContain("`provider_profile.${status}`");
  });

  it("exposes only the patient-safe public contract", () => {
    const publicContract = contract.slice(
      contract.indexOf("export interface PublicProviderProfile"),
      contract.indexOf("export interface ProviderDirectorySearchResult"),
    );
    expect(publicContract).toContain("displayName");
    expect(publicContract).toContain("specialtyName");
    expect(publicContract).toContain("practiceDisplayName");
    expect(publicContract).not.toContain("email");
    expect(publicContract).not.toContain("mobile");
    expect(publicContract).not.toContain("permissions");
    expect(publicContract).not.toContain("patient");
    expect(runtime).not.toContain("email_norm");
    expect(runtime).not.toContain("mobile_norm");
    expect(runtime).not.toContain("permissions_json");
    expect(runtime).not.toContain("patient_registry");
    expect(runtime).not.toContain("care_relationships");
  });

  it("keeps the capability OFF by default and fails closed", async () => {
    const capability = await providerDirectoryRoute(
      new Request("https://worker.example.test/v1/provider-directory/capabilities"),
      testEnv,
    );
    expect(capability?.status).toBe(200);
    expect(await capability?.json()).toEqual({ providerDirectory: false });

    const disabled = await providerDirectoryRoute(
      new Request("https://worker.example.test/v1/provider-directory/providers"),
      testEnv,
    );
    expect(disabled?.status).toBe(403);
    expect(await disabled?.json()).toEqual({ error: "provider_directory_disabled" });
  });

  it("returns a bodyless preflight only for an allowed exact origin", async () => {
    const response = await providerDirectoryRoute(
      new Request("https://worker.example.test/v1/provider-directory/providers", {
        method: "OPTIONS",
        headers: { origin: testEnv.ADMIN_ORIGIN },
      }),
      testEnv,
    );
    expect(response?.status).toBe(204);
    expect(response?.headers.get("access-control-allow-origin")).toBe(testEnv.ADMIN_ORIGIN);
    expect(await response?.text()).toBe("");
  });

  it("binds search input and enforces active physician membership", () => {
    expect(runtime).toContain("m.role='physician' AND m.status='active'");
    expect(runtime).toContain("u.role='physician' AND u.status='active'");
    expect(runtime).toContain("u.irimc_status='verified'");
    expect(runtime).toContain("LIKE ? ESCAPE");
    expect(runtime).toContain("requestedLimit > 50");
    expect(runtime).toContain("database.batch<ProviderProfileRow>");
  });
});
