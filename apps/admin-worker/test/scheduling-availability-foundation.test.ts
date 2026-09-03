import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { schedulingAvailabilityRoute } from "../src/platform-scheduling-availability";

const migration = fs.readFileSync(
  new URL("../migrations/0014_scheduling_availability_foundation.sql", import.meta.url),
  "utf8",
);
const runtime = fs.readFileSync(
  new URL("../src/platform-scheduling-availability.ts", import.meta.url),
  "utf8",
);
const contract = fs.readFileSync(
  new URL("../../../packages/contracts/src/scheduling.ts", import.meta.url),
  "utf8",
);
const design = fs.readFileSync(
  new URL("../../../docs/P5_C1_SCHEDULING_AVAILABILITY_DESIGN.md", import.meta.url),
  "utf8",
);
const admin = fs.readFileSync(
  new URL("../src/platform-v3-admin.ts", import.meta.url),
  "utf8",
);

const testEnv = {
  ADMIN_ORIGIN: "https://rc.example.test",
  SESSION_SECRET: "test-only-session-secret",
};

describe("P5-C1 scheduling availability foundation", () => {
  it("creates additive practice-scoped policy, rule, exception and event tables", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS provider_scheduling_policies");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS provider_availability_rules");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS provider_availability_exceptions");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS provider_scheduling_events");
    expect(migration).toContain("REFERENCES practice_memberships(practice_id, user_id) ON DELETE RESTRICT");
    expect(migration).toContain("UNIQUE (practice_id, physician_user_id)");
    expect(migration).not.toMatch(/CREATE TABLE IF NOT EXISTS appointments/i);
    expect(migration).not.toMatch(/CREATE TABLE IF NOT EXISTS payments/i);
    expect(migration).not.toMatch(/(?:ALTER|UPDATE|DELETE FROM)\s+patient_registry/i);
  });

  it("models recurring windows, leave/additional exceptions and configurable policy", () => {
    expect(migration).toContain("('auto_confirm','approval_required')");
    expect(migration).toContain("weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6)");
    expect(migration).toContain("('unavailable','additional')");
    expect(contract).toContain("defaultVisitDurationMinutes");
    expect(contract).toContain("bookingHorizonDays");
    expect(contract).toContain("cancellationNoticeMinutes");
    expect(contract).toContain("rescheduleNoticeMinutes");
    expect(runtime).toContain("new Intl.DateTimeFormat");
    expect(design).toMatch(/IANA\s+time-zone identifier/);
  });

  it("requires same-practice verified physician authority and explicit confirmation", () => {
    expect(runtime).toContain('auth.user.role !== "physician"');
    expect(runtime).toContain("provider_identity_verification_required");
    expect(runtime).toContain("practiceId, physicianUserId");
    expect(runtime).toContain("input.confirmed !== true");
    expect(runtime).not.toContain('permissions.includes("scheduling.manage")');
  });

  it("retires/revokes rows and records append-only events", () => {
    expect(runtime).toContain("SET retired_at=?,updated_at=?");
    expect(runtime).toContain("SET revoked_at=?,updated_at=?");
    expect(runtime).not.toMatch(/DELETE FROM provider_availability_/);
    expect(runtime).toContain("INSERT INTO provider_scheduling_events");
    expect(runtime).toContain("INSERT INTO audit_log");
    expect(migration).toContain("'rule_retired'");
    expect(migration).toContain("'exception_revoked'");
  });

  it("preserves scheduling history during runtime-user/practice deletion", () => {
    expect(admin).toContain("provider_scheduling_policies WHERE physician_user_id=?");
    expect(admin).toContain("provider_scheduling_policies WHERE practice_id=?");
    expect(migration).toContain("REFERENCES provider_scheduling_policies(id) ON DELETE RESTRICT");
  });

  it("keeps availability and all later scheduling/payment capabilities OFF by default", async () => {
    const capability = await schedulingAvailabilityRoute(
      new Request("https://worker.example.test/v1/scheduling/capabilities"),
      testEnv,
    );
    expect(await capability?.json()).toEqual({
      availabilityManagement: false,
      patientSlotDiscovery: false,
      slotLocking: false,
      booking: false,
      paymentGateway: false,
    });
    const disabled = await schedulingAvailabilityRoute(
      new Request("https://worker.example.test/v1/scheduling/manage"),
      testEnv,
    );
    expect(disabled?.status).toBe(403);
    expect(await disabled?.json()).toEqual({ error: "scheduling_availability_disabled" });
  });

  it("returns bodyless CORS preflight only for an exact allowed origin", async () => {
    const response = await schedulingAvailabilityRoute(
      new Request("https://worker.example.test/v1/scheduling/manage", {
        method: "OPTIONS",
        headers: { origin: testEnv.ADMIN_ORIGIN },
      }),
      testEnv,
    );
    expect(response?.status).toBe(204);
    expect(response?.headers.get("access-control-allow-origin")).toBe(testEnv.ADMIN_ORIGIN);
    expect(await response?.text()).toBe("");
  });
});
