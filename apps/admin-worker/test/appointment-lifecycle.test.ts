import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { schedulingAppointmentsRoute } from "../src/platform-scheduling-appointments";

const migration = fs.readFileSync(
  new URL("../migrations/0016_appointment_lifecycle.sql", import.meta.url),
  "utf8",
);
const hardeningMigration = fs.readFileSync(
  new URL("../migrations/0017_appointment_policy_snapshot_guards.sql", import.meta.url),
  "utf8",
);
const runtime = fs.readFileSync(
  new URL("../src/platform-scheduling-appointments.ts", import.meta.url),
  "utf8",
);
const slots = fs.readFileSync(
  new URL("../src/platform-scheduling-slots.ts", import.meta.url),
  "utf8",
);
const contract = fs.readFileSync(
  new URL("../../../packages/contracts/src/scheduling.ts", import.meta.url),
  "utf8",
);
const platform = fs.readFileSync(
  new URL("../src/platform-v3.ts", import.meta.url),
  "utf8",
);
const webClient = fs.readFileSync(
  new URL("../../web/lib/scheduling-availability-client.ts", import.meta.url),
  "utf8",
);

const testEnv = {
  ADMIN_ORIGIN: "https://rc.example.test",
  SESSION_SECRET: "test-only-session-secret",
};

describe("P5-C3 appointment booking and lifecycle", () => {
  it("adds canonical appointments, participants, immutable financial snapshots and events", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS appointments");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS appointment_participants");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS appointment_financial_snapshots");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS appointment_events");
    expect(migration).toContain("appointment_financial_snapshots_no_update");
    expect(migration).toContain("appointment_financial_snapshots_no_delete");
    expect(hardeningMigration).toContain("appointment_events_no_update");
    expect(hardeningMigration).toContain("appointment_events_no_delete");
    expect(migration).not.toMatch(/CREATE TABLE IF NOT EXISTS payment_(?:intents|events)/i);
    expect(migration).not.toMatch(/(?:ALTER|UPDATE|DELETE FROM)\s+patient_registry/i);
  });

  it("models every roadmap lifecycle state and an auditable transition ledger", () => {
    for (const status of [
      "requested", "confirmed", "cancelled", "rescheduled", "checked_in",
      "in_progress", "completed", "no_show",
    ]) {
      expect(contract).toContain(`"${status}"`);
      expect(migration).toContain(`'${status}'`);
    }
    expect(runtime).toContain("INSERT INTO appointment_events");
    expect(runtime).toContain("version=version+1");
    expect(runtime).toContain("invalid_appointment_transition");
  });

  it("books only from an owned, live hold and atomically consumes it", () => {
    const booking = runtime.slice(
      runtime.indexOf("async function bookAppointment("),
      runtime.indexOf("async function listPatientAppointments("),
    );
    expect(booking).toContain("requirePatientAccountSession");
    expect(booking).toContain('patient.proofingStatus !== "verified"');
    expect(booking).toContain("database.batch<AppointmentRow>");
    expect(booking).toContain("h.patient_account_id=? AND h.status='held' AND h.expires_at>?");
    expect(booking).toContain("UPDATE appointment_slot_holds SET status='consumed'");
    expect(booking).toContain("NOT EXISTS(");
    expect(migration).toContain("slot_hold_id TEXT NOT NULL UNIQUE");
  });

  it("removes active appointments from slot capacity and overlap candidates", () => {
    expect(slots).toContain("UNION ALL");
    expect(slots).toContain("FROM appointments");
    expect(slots).toContain("'requested','confirmed','checked_in','in_progress'");
    expect(migration).toContain("appointments_physician_start_active_uq");
    expect(migration).toContain("appointments_physician_overlap_idx");
  });

  it("snapshots confirmation and financial terms without enabling a payment provider", () => {
    expect(runtime).toContain('hold.confirmation_policy === "auto_confirm"');
    expect(runtime).toContain("payment_required,payment_state,captured_at");
    expect(runtime).toContain("0,'not_required'");
    expect(contract).toContain("financialSnapshot: AppointmentFinancialSnapshot");
    expect(contract).toContain("paymentGateway: false");
    expect(runtime).not.toMatch(/gateway|card_pan|cvv/i);
  });

  it("enforces notice windows, actor authority and explicit confirmation", () => {
    expect(runtime).toContain("current.cancellation_notice_minutes");
    expect(runtime).toContain("current.reschedule_notice_minutes");
    expect(hardeningMigration).toContain("cancellation_notice_minutes INTEGER NOT NULL");
    expect(hardeningMigration).toContain("reschedule_notice_minutes INTEGER NOT NULL");
    expect(runtime).toContain('actor.permissions.includes("appointments.manage")');
    expect(runtime).toContain("assigned_physician_required");
    expect(runtime).toContain("explicit_confirmation_required");
    expect(runtime).toContain("consumePatientRate");
  });

  it("uses patient identity sessions for patient scheduling client calls", () => {
    expect(webClient).toContain("patientIdentityFetch");
    expect(webClient).toContain("patientSchedulingFetch");
    expect(webClient).toContain("bookAppointment");
    expect(webClient).toContain("reschedulePatientAppointment");
    expect(webClient).toContain("managedAppointmentAction");
  });

  it("routes appointments before candidate slots and keeps booking OFF by default", async () => {
    expect(platform.indexOf("await schedulingAppointmentsRoute")).toBeLessThan(
      platform.indexOf("await schedulingSlotsRoute"),
    );
    const response = await schedulingAppointmentsRoute(
      new Request("https://worker.example.test/v1/scheduling/appointments"),
      testEnv,
    );
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: "scheduling_booking_disabled" });
  });

  it("returns bodyless CORS preflight only for an exact allowed origin", async () => {
    const response = await schedulingAppointmentsRoute(
      new Request("https://worker.example.test/v1/scheduling/appointments", {
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
