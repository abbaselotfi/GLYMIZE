import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { schedulingSlotsRoute } from "../src/platform-scheduling-slots";

const migration = fs.readFileSync(
  new URL("../migrations/0015_scheduling_slot_holds.sql", import.meta.url),
  "utf8",
);
const runtime = fs.readFileSync(
  new URL("../src/platform-scheduling-slots.ts", import.meta.url),
  "utf8",
);
const contract = fs.readFileSync(
  new URL("../../../packages/contracts/src/scheduling.ts", import.meta.url),
  "utf8",
);
const design = fs.readFileSync(
  new URL("../../../docs/P5_C2_SCHEDULING_SLOT_LOCK_DESIGN.md", import.meta.url),
  "utf8",
);
const platform = fs.readFileSync(
  new URL("../src/platform-v3.ts", import.meta.url),
  "utf8",
);

const testEnv = {
  ADMIN_ORIGIN: "https://rc.example.test",
  SESSION_SECRET: "test-only-session-secret",
};

describe("P5-C2 server-authoritative candidate slots and locks", () => {
  it("adds short-lived holds and append-only events without appointments/payments", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS appointment_slot_holds");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS appointment_slot_hold_events");
    expect(migration).toContain("WHERE status='held'");
    expect(migration).toContain("lock_starts_at");
    expect(migration).toContain("lock_ends_at");
    expect(migration).not.toMatch(/CREATE TABLE IF NOT EXISTS appointments/i);
    expect(migration).not.toMatch(/CREATE TABLE IF NOT EXISTS payments/i);
    expect(migration).not.toMatch(/(?:ALTER|UPDATE|DELETE FROM)\s+patient_registry/i);
  });

  it("derives bounded candidates from server time, timezone, policy and exceptions", () => {
    expect(runtime).toContain("new Intl.DateTimeFormat");
    expect(runtime).toContain("policy.minimum_notice_minutes");
    expect(runtime).toContain("policy.booking_horizon_days");
    expect(runtime).toContain("policy.max_daily_appointments");
    expect(runtime).toContain('item.exception_kind === "unavailable"');
    expect(runtime).toContain('item.exception_kind === "additional"');
    expect(runtime).toContain("datesBetween(from, to).length > 31");
    expect(runtime).toContain("return slots.slice(0, 500)");
    expect(contract).toContain("informational: true");
    expect(contract).toContain("reserved: false");
  });

  it("uses an atomic overlap guard plus database uniqueness", () => {
    const acquisition = runtime.slice(
      runtime.indexOf("async function acquireHold("),
      runtime.indexOf("async function listHolds("),
    );
    expect(acquisition).toContain("database.batch<HoldRow>");
    expect(acquisition).toContain("WHERE NOT EXISTS");
    expect(acquisition).toContain("h.lock_starts_at<? AND h.lock_ends_at>?");
    expect(acquisition).toContain("status='expired'");
    expect(migration).toContain("appointment_slot_holds_physician_start_held_uq");
    expect(design).toContain("roll back as a unit");
  });

  it("requires verified patient and exact active assigned care relationship", () => {
    expect(runtime).toContain("requirePatientAccountSession");
    expect(runtime).toContain('patient.proofingStatus !== "verified"');
    expect(runtime).toContain("patient.patientAccountId, policy.practice_id, policy.physician_user_id");
    expect(runtime).toContain("AND status='active'");
    expect(runtime).toContain("active_care_relationship_required");
    expect(runtime).toContain("consumeHoldRate");
    expect(runtime).toContain("explicit_confirmation_required");
  });

  it("never turns a candidate or hold into booking/clinical authorization", () => {
    expect(contract).toContain("bookingCreated: false");
    expect(contract).toContain("grantsClinicalAccess: false");
    expect(runtime).toContain("bookingEnabled: appointmentBookingEnabled(env)");
    expect(runtime).toContain("bookingCreated: false");
    expect(runtime).toContain("grantsClinicalAccess: false");
    expect(runtime).not.toContain("INSERT INTO appointments");
    expect(runtime).not.toContain("INSERT INTO payments");
  });

  it("routes slot endpoints before the availability catch-all", () => {
    expect(platform.indexOf("await schedulingSlotsRoute")).toBeLessThan(
      platform.indexOf("await schedulingAvailabilityRoute"),
    );
  });

  it("keeps discovery and locking OFF by default", async () => {
    const discovery = await schedulingSlotsRoute(
      new Request(
        "https://worker.example.test/v1/scheduling/providers/11111111-1111-4111-8111-111111111111/slots?from=2026-09-03&to=2026-09-03",
      ),
      testEnv,
    );
    expect(discovery?.status).toBe(403);
    expect(await discovery?.json()).toEqual({ error: "scheduling_slot_discovery_disabled" });

    const hold = await schedulingSlotsRoute(
      new Request("https://worker.example.test/v1/scheduling/slot-holds", { method: "POST" }),
      testEnv,
    );
    expect(hold?.status).toBe(403);
    expect(await hold?.json()).toEqual({ error: "scheduling_slot_locking_disabled" });
  });

  it("returns bodyless CORS preflight only for an exact allowed origin", async () => {
    const response = await schedulingSlotsRoute(
      new Request("https://worker.example.test/v1/scheduling/slot-holds", {
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
