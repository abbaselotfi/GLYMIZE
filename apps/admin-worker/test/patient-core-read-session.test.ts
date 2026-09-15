import { afterEach, describe, expect, it, vi } from "vitest";
import { createPatientCoreReadSession } from "../src/patient-core/read-session";
import { patientClinicalCoreRoute } from "../src/patient-core/route";
import { encodePatientObservationCursor, encodePatientTimelineCursor } from "../src/patient-core/pagination";
import type { PatientRecordV2RouteContext } from "../src/patient-record-v2/context";
import { encryptClinicalPayload } from "../src/runtime-security";
import { patientDemographicsAad, patientObservationAad } from "../src/patient-core/aad";
import { patientFinalOrderAad } from "../src/patient-record-v2/orders";
import { readPatientCoreSummary } from "../src/patient-core/patient-summary-reader";
import { RuntimeReadMetricsCollector } from "../src/runtime-read-metrics";
import { patientRecordV2Route } from "../src/platform-patient-record-v2";

const scope = { practiceId: "practice-1", patientId: "patient-1" };
const stamp = "2026-09-01T00:00:00.000Z";
const secret = "synthetic-secret";

async function request(family: "observations" | "timeline" = "observations") {
  const cursor = family === "observations"
    ? await encodePatientObservationCursor(scope, stamp, { observedAt: stamp, createdAt: stamp, id: "obs-9" }, secret)
    : await encodePatientTimelineCursor(scope, stamp, { effectiveAt: stamp, eventId: "encounter:9" }, secret);
  return new Request(`https://example.test/v1/patients/patient-1/longitudinal/history?family=${family}&cursor=${cursor}`,
    { headers: { "x-d1-bookmark": "untrusted-browser-bookmark" } });
}

function fixture(options: { missing?: boolean; denied?: boolean; failSql?: string; observation?: unknown; order?: unknown; demographics?: unknown; archived?: boolean; registryPractice?: string } = {}) {
  const events: Array<{ session: number; sql: string; binds: unknown[] }> = [];
  let active = 0;
  let maxActive = 0;
  let sequence = 0;
  const bookmarks: ReturnType<typeof vi.fn>[] = [];
  function prepared(sql: string, session: number, binds: unknown[] = []): D1PreparedStatement {
    async function execute(all: boolean) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      events.push({ session, sql, binds });
      await Promise.resolve();
      active -= 1;
      if (options.failSql && sql.includes(options.failSql)) throw new Error("sensitive-provider-bookmark-error");
      if (sql === "PRIMARY_ROLE") return options.denied ? null : { allowed: true };
      if (sql.includes("FROM patient_registry")) {
        expect(sql).toContain("practice_id=? AND id=?");
        const rows = [
          { id: scope.patientId, practiceId: options.registryPractice ?? scope.practiceId },
          { id: "other-patient", practiceId: scope.practiceId },
        ];
        const found = !options.missing && rows.find(row => row.practiceId === binds[0] && row.id === binds[1]);
        return found ? { id: found.id, status: options.archived ? "archived" : "active" } : null;
      }
      if (sql.includes("FROM patient_demographics")) return options.demographics ?? null;
      if (sql.includes("AS source_row_count")) return {
        source_row_count: options.observation ? 1 : 0, rejected_count: 0, raw_count: 0, eligible_count: options.observation ? 1 : 0,
      };
      if (!all) return null;
      const results = sql.includes("SELECT o.id,o.encounter_id") && options.observation ? [options.observation]
        : sql.includes("FROM patient_final_orders o") && options.order ? [options.order] : [];
      return { success: true, results, meta: { rows_read: 3, served_by_primary: session === 0, served_by_region: "WEUR" } };
    }
    // Deliberately partial provider fake; production adapter has no D1Database cast.
    return {
      bind: (...values: unknown[]) => prepared(sql, session, values),
      first: () => execute(false),
      all: () => execute(true),
    } as unknown as D1PreparedStatement;
  }
  const withSession = vi.fn((constraint: string) => {
    expect(constraint).toBe("first-primary");
    const id = ++sequence;
    const getBookmark = vi.fn(() => {
      expect(active).toBe(0);
      return `opaque-session-${id}`;
    });
    bookmarks.push(getBookmark);
    return { prepare: (sql: string) => prepared(sql, id), getBookmark } as unknown as D1DatabaseSession;
  });
  const database = { prepare: (sql: string) => prepared(sql, 0), withSession } as unknown as D1Database;
  const context: PatientRecordV2RouteContext = {
    database, clinicalSecret: secret,
    user: { id: "user-1", practiceId: scope.practiceId, role: "physician", permissions: ["handoff.read"], layoutPreset: "auto" },
    authorize: async () => Boolean(await database.prepare("PRIMARY_ROLE").first()),
    respond: (body, status = 200) => Response.json(body, { status }),
    audit: vi.fn(async () => {}),
  };
  return { context, database, events, withSession, bookmarks, maxActive: () => maxActive };
}

afterEach(() => vi.restoreAllMocks());

describe("R29-05-A local rollout and rollback", () => {
  it.each(["observations", "timeline"] as const)("checks all flag states then rolls back %s in one process", async family => {
    const logs = vi.spyOn(console, "info").mockImplementation(() => {});
    const demographics = await encryptClinicalPayload({ firstName: "Synthetic" }, secret, patientDemographicsAad(scope.practiceId, scope.patientId));
    const f = fixture({ ...await encryptedHistoryFixture(family), demographics: {
      payload_ciphertext: demographics.ciphertext, payload_iv: demographics.iv, payload_auth_tag: demographics.authTag,
    } });
    const states = [0, 1, 2, 4, 3, 5, 6, 7, 0];
    const evidence = [];
    let baseline: unknown;
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      for (const [step, bits] of states.entries()) {
        const sessions = Boolean(bits & 4), keys = Boolean(bits & 2), lookup = Boolean(bits & 1);
        const eventStart = f.events.length;
        const sessionStart = f.withSession.mock.calls.length;
        const response = await patientRecordV2Route(await request(family), f.context, {
          patientCoreD1ReadSessionsEnabled: sessions,
          patientCoreCryptoKeyReuseEnabled: keys,
          patientCoreHistoryScopeLookupEnabled: lookup,
        });
        expect(response?.status).toBe(200);
        const body = await response?.json();
        if (step === 0) baseline = body;
        else expect(body).toEqual(baseline);
        const metrics = JSON.parse(String(logs.mock.calls.at(-1)?.[1]));
        expect(metrics.queryCount).toBe(lookup ? 3 : 6);
        expect(metrics.decryptionCount).toBe(lookup ? 1 : 2);
        expect(metrics.decryptionFailureCount).toBe(0);
        const events = f.events.slice(eventStart);
        expect(events[0]?.sql).toBe("PRIMARY_ROLE");
        expect(events[0]?.session).toBe(0);
        const reads = events.filter(event => event.sql !== "PRIMARY_ROLE");
        expect(reads[0]?.sql).toContain("FROM patient_registry");
        expect(f.withSession.mock.calls.length - sessionStart).toBe(sessions ? 1 : 0);
        expect(reads.every(event => sessions ? event.session > 0 : event.session === 0)).toBe(true);
        if (lookup) expect(reads.some(event => /patient_identifiers|patient_demographics|SELECT encounter_at/.test(event.sql))).toBe(false);
        evidence.push({ bits: bits.toString(2).padStart(3, "0"), family, rollback: step === 8,
          responseEqual: true, queryCount: metrics.queryCount, decryptionCount: metrics.decryptionCount,
          expectedRouting: sessions ? "first-primary" : "direct-primary" });
      }
    } finally { vi.useRealTimers(); }
    // Emission is local harness evidence, never a production/remote acceptance signal.
    if (process.env.GLYMIZE_R29_ROLLOUT_EVIDENCE === "1") {
      process.stdout.write("R29_05_LOCAL_MATRIX " + JSON.stringify(evidence) + "\n");
    }
  });
});


async function encryptedHistoryFixture(family: "observations" | "timeline", wrongAad = false) {
  const practice = wrongAad ? "wrong-practice" : scope.practiceId;
  const payload = await encryptClinicalPayload(
    family === "observations" ? { value: 7.2 } : { displayName: "Synthetic investigation" }, secret,
    family === "observations" ? patientObservationAad(practice, "obs-1") : patientFinalOrderAad(practice, "order-1"),
  );
  const encrypted = { payload_ciphertext: payload.ciphertext, payload_iv: payload.iv, payload_auth_tag: payload.authTag };
  return family === "observations" ? { observation: {
    id: "obs-1", encounter_id: "enc-1", canonical_key: "hba1c", observed_at: stamp,
    verification: "confirmed", snapshot_revision: 1, created_at: stamp, ...encrypted,
  } } : { order: {
    order_id: "order-1", encounter_id: "enc-1", order_kind: "investigation", order_status: "active",
    plan_status: "signed", signed_at: stamp, latest_fulfillment_status: null, linked_result_count: 0, ...encrypted,
  } };
}

describe("R29-04-E history scope lookup", () => {
  const combinations = (["observations", "timeline"] as const).flatMap(family =>
    [false, true].flatMap(d1ReadSessionsEnabled => [false, true].map(cryptoKeyReuseEnabled =>
      ({ family, d1ReadSessionsEnabled, cryptoKeyReuseEnabled }))));
  it.each(combinations)("preserves $family with sessions=$d1ReadSessionsEnabled keys=$cryptoKeyReuseEnabled", async settings => {
    const logs = vi.spyOn(console, "info").mockImplementation(() => {});
    const demographic = await encryptClinicalPayload({ firstName: "Synthetic" }, secret, patientDemographicsAad(scope.practiceId, scope.patientId));
    const f = fixture({ ...await encryptedHistoryFixture(settings.family), demographics: {
      payload_ciphertext: demographic.ciphertext, payload_iv: demographic.iv, payload_auth_tag: demographic.authTag,
    } });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const legacy = await patientClinicalCoreRoute(await request(settings.family), f.context, settings);
      const start = f.events.length;
      const result = await patientClinicalCoreRoute(await request(settings.family), f.context, { ...settings, historyScopeLookupEnabled: true });
      expect(result?.status).toBe(200);
      expect(await result?.json()).toEqual(await legacy?.json());
      const reads = f.events.slice(start).filter(event => event.sql !== "PRIMARY_ROLE");
      expect(reads).toHaveLength(3);
      expect(reads[0]?.sql).toContain("FROM patient_registry");
      expect(reads[0]?.binds).toEqual([scope.practiceId, scope.patientId]);
      expect(reads.every(event => settings.d1ReadSessionsEnabled ? event.session > 0 : event.session === 0)).toBe(true);
      expect(reads.some(event => /patient_identifiers|patient_demographics|SELECT encounter_at/.test(event.sql))).toBe(false);
      const metrics = logs.mock.calls.map(call => JSON.parse(String(call[1])));
      expect(metrics.map(m => [m.queryCount, m.decryptionCount])).toEqual([[6, 2], [3, 1]]);
      expect(f.context).not.toHaveProperty("historyScopeLookupEnabled");
    } finally { vi.useRealTimers(); }
  });

  it.each(["patient_identifiers", "patient_demographics", "SELECT encounter_at"])("avoids discarded %s dependency only when opted in", async failSql => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const enabled of [undefined, false, true]) {
      const f = fixture({ failSql });
      expect((await patientClinicalCoreRoute(await request(), f.context, { historyScopeLookupEnabled: enabled }))?.status).toBe(enabled ? 200 : 500);
      if (enabled) expect(f.events.some(event => event.sql.includes(failSql))).toBe(false);
    }
  });

  it.each([false, true])("keeps summary strict and isolates unrelated demographics corruption, sessions=%s", async d1ReadSessionsEnabled => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fixture({ demographics: { payload_ciphertext: "!", payload_iv: "!", payload_auth_tag: "!" } });
    expect((await patientClinicalCoreRoute(await request(), f.context, { d1ReadSessionsEnabled }))?.status).toBe(500);
    expect((await patientClinicalCoreRoute(await request(), f.context, { d1ReadSessionsEnabled, historyScopeLookupEnabled: true }))?.status).toBe(200);
    expect((await patientClinicalCoreRoute(new Request("https://example.test/v1/patients/patient-1/longitudinal"), f.context,
      { d1ReadSessionsEnabled, historyScopeLookupEnabled: true }))?.status).toBe(500);
  });

  it.each([false, true])("retains scoped lookup/archive/permission/error precedence, sessions=%s", async d1ReadSessionsEnabled => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const settings = { d1ReadSessionsEnabled, historyScopeLookupEnabled: true, cryptoKeyReuseEnabled: true };
    for (const options of [{ missing: true }, { registryPractice: "other-practice" }]) {
      const f = fixture(options);
      expect((await patientClinicalCoreRoute(await request(), f.context, settings))?.status).toBe(404);
      expect(f.events.filter(e => e.sql !== "PRIMARY_ROLE")).toHaveLength(1);
    }
    expect((await patientClinicalCoreRoute(await request(), fixture({ archived: true }).context, settings))?.status).toBe(200);
    for (const permission of [false, true]) {
      const f = fixture({ denied: !permission });
      if (permission) f.context.user.permissions = [];
      expect((await patientClinicalCoreRoute(await request(), f.context, settings))?.status).toBe(403);
      expect(f.withSession).not.toHaveBeenCalled();
      expect(f.events.every(e => e.sql === "PRIMARY_ROLE")).toBe(true);
    }
    const bad = new URL((await request()).url);
    bad.searchParams.set("cursor", "invalid");
    for (const options of [{ missing: true }, { failSql: "patient_registry" }, {}]) {
      const f = fixture(options);
      const expected = d1ReadSessionsEnabled ? 422 : "missing" in options ? 404 : "failSql" in options ? 500 : 422;
      expect((await patientClinicalCoreRoute(new Request(bad), f.context, settings))?.status).toBe(expected);
    }
    bad.searchParams.set("family", "invalid");
    const invalid = fixture();
    expect((await patientClinicalCoreRoute(new Request(bad), invalid.context, settings))?.status).toBe(422);
    expect(invalid.events.every(e => e.sql === "PRIMARY_ROLE")).toBe(true);
  });

  it.each(combinations)("fails requested $family data closed, sessions=$d1ReadSessionsEnabled keys=$cryptoKeyReuseEnabled", async settings => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fixture(await encryptedHistoryFixture(settings.family, true));
    const response = await patientClinicalCoreRoute(await request(settings.family), f.context, { ...settings, historyScopeLookupEnabled: true });
    expect(response?.status).toBe(500);
    expect(await response?.json()).toEqual({ error: "patient_core_read_failed" });
    expect(f.bookmarks.every(bookmark => bookmark.mock.calls.length === 0)).toBe(true);
  });

  it.each(["patient_registry", "patient_observations", "patient_final_orders"])("propagates %s failures without fallback", async failSql => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fixture({ failSql });
    const result = await patientClinicalCoreRoute(await request(failSql === "patient_final_orders" ? "timeline" : "observations"), f.context,
      { historyScopeLookupEnabled: true, d1ReadSessionsEnabled: true });
    expect(result?.status).toBe(500);
    expect(await result?.json()).toEqual({ error: "patient_core_read_failed" });
    expect(f.events.filter(e => e.session === 0).map(e => e.sql)).toEqual(["PRIMARY_ROLE"]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive-provider");
    expect(f.bookmarks[0]).not.toHaveBeenCalled();
  });

  it("preserves the full summary projection and four-query metrics through the extracted helper", async () => {
    const payload = await encryptClinicalPayload({ firstName: "Synthetic" }, secret, patientDemographicsAad(scope.practiceId, scope.patientId));
    const f = fixture({ archived: true, demographics: { payload_ciphertext: payload.ciphertext, payload_iv: payload.iv, payload_auth_tag: payload.authTag } });
    const metrics = new RuntimeReadMetricsCollector();
    expect(await readPatientCoreSummary(f.context, scope.patientId, { metrics })).toEqual({
      patientId: scope.patientId, status: "archived", demographics: { firstName: "Synthetic" }, identifiers: [],
    });
    expect(metrics.finish({})).toMatchObject({ queryCount: 4, decryptionCount: 1 });
  });
});


describe("R29-03-A request-owned read capability", () => {
  it.each([false, true])("reuses one history key independently of D1 sessions=%s, preserving payloads and metrics", async d1ReadSessionsEnabled => {
    const logs = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const encrypted = await encryptClinicalPayload({ value: 7.2 }, secret, patientObservationAad(scope.practiceId, "obs-1"));
      const demographics = await encryptClinicalPayload({ firstName: "Synthetic" }, secret, patientDemographicsAad(scope.practiceId, scope.patientId));
      const observation = { id: "obs-1", encounter_id: "enc-1", canonical_key: "hba1c", observed_at: stamp,
        verification: "confirmed", snapshot_revision: 1, created_at: stamp,
        payload_ciphertext: encrypted.ciphertext, payload_iv: encrypted.iv, payload_auth_tag: encrypted.authTag };
      const f = fixture({ observation, demographics: {
        payload_ciphertext: demographics.ciphertext, payload_iv: demographics.iv, payload_auth_tag: demographics.authTag,
      } });
      const imports = vi.spyOn(crypto.subtle, "importKey");
      const legacy = await patientClinicalCoreRoute(await request(), f.context, { d1ReadSessionsEnabled });
      const aesCalls = () => imports.mock.calls.filter(call => typeof call[2] === "object" && call[2].name === "AES-GCM");
      expect(aesCalls()).toHaveLength(2);
      imports.mockClear();
      const optimized = await patientClinicalCoreRoute(await request(), f.context, { d1ReadSessionsEnabled, cryptoKeyReuseEnabled: true });
      expect(optimized?.status).toBe(200);
      expect(await optimized?.json()).toEqual(await legacy?.json());
      expect(aesCalls()).toHaveLength(1);
      expect(f.context).not.toHaveProperty("decryptClinical");
      const snapshots = logs.mock.calls.map(call => JSON.parse(String(call[1])));
      expect(snapshots.map(s => [s.queryCount, s.decryptionCount, s.decryptionFailureCount])).toEqual([[6, 2, 0], [6, 2, 0]]);
    } finally { vi.useRealTimers(); }
  });

  it.each(["denied", "missing", "empty"])("does not derive an AES key for %s history", async kind => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const f = fixture({ denied: kind === "denied", missing: kind === "missing" });
    const imports = vi.spyOn(crypto.subtle, "importKey");
    const response = await patientClinicalCoreRoute(await request(), f.context, { cryptoKeyReuseEnabled: true });
    expect(response?.status).toBe(kind === "denied" ? 403 : kind === "missing" ? 404 : 200);
    expect(imports.mock.calls.filter(call => typeof call[2] === "object" && call[2].name === "AES-GCM")).toHaveLength(0);
  });

  it("waits for the primary anchor before lagging replica operations select their floor", async () => {
    let floor = 0;
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const provider = {
      withSession: vi.fn((constraint: string) => {
        expect(constraint).toBe("first-primary");
        return {
          prepare: () => ({
            async first() {
              const ordinal = started++;
              const observed = ordinal === 0 ? 40 : Math.max(floor, 3);
              if (ordinal === 0) await gate;
              floor = observed;
              return observed;
            },
          }),
          getBookmark: () => `opaque-${floor}`,
        };
      }),
    } as unknown as Pick<D1Database, "withSession">;
    const session = createPatientCoreReadSession(provider);
    const reads = Promise.all([
      session.database.prepare("scoped-primary-lookup").first(),
      session.database.prepare("lagging-replica-read").first(),
    ]);
    await Promise.resolve();
    expect(started).toBe(1);
    release();
    expect(await reads).toEqual([40, 40]);
    expect(await session.finish()).toBe("opaque-40");
  });

  it("serializes actual execution, preserves envelopes/binds, and closes after draining", async () => {
    const f = fixture();
    const session = createPatientCoreReadSession(f.database);
    const statement = session.database.prepare("SELECT synthetic");
    const reads = Promise.all([statement.bind("one").all(), statement.bind("two").all()]);
    const finishing = session.finish();
    const results = await reads;
    expect(results[0]).toEqual({ success: true, results: [], meta: { rows_read: 3, served_by_primary: false, served_by_region: "WEUR" } });
    expect(f.events.map(e => e.binds)).toEqual([["one"], ["two"]]);
    expect(f.maxActive()).toBe(1);
    expect(await finishing).toBe("opaque-session-1");
    expect(Object.keys(statement).sort()).toEqual(["all", "bind", "first"]);
    expect(Object.keys(session.database)).toEqual(["prepare"]);
    await expect(statement.first()).rejects.toThrow("PATIENT_CORE_READ_SESSION_CLOSED");
  });

  it("does not execute queued reads or obtain a bookmark after the first failure", async () => {
    const f = fixture({ failSql: "FAIL" });
    const session = createPatientCoreReadSession(f.database);
    const results = await Promise.allSettled([
      session.database.prepare("FAIL").first(), session.database.prepare("LATER").all(),
    ]);
    expect(results.map(r => r.status)).toEqual(["rejected", "rejected"]);
    expect(f.events.map(e => e.sql)).toEqual(["FAIL"]);
    await expect(session.finish()).rejects.toThrow("sensitive-provider-bookmark-error");
    expect(f.bookmarks[0]).not.toHaveBeenCalled();
  });

  it.each(["observations", "timeline"] as const)("keeps %s payload/cursor contracts and primary authorization", async family => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const encrypted = await encryptClinicalPayload({ value: 7.2, unit: "%" }, secret, patientObservationAad(scope.practiceId, "obs-1"));
      const observation = { id: "obs-1", encounter_id: "enc-1", canonical_key: "hba1c", observed_at: stamp,
        verification: "confirmed", snapshot_revision: 1, created_at: stamp,
        payload_ciphertext: encrypted.ciphertext, payload_iv: encrypted.iv, payload_auth_tag: encrypted.authTag };
      const primary = fixture({ observation });
      const optedIn = fixture({ observation });
      const direct = await patientClinicalCoreRoute(await request(family), primary.context);
      const selected = await patientClinicalCoreRoute(await request(family), optedIn.context, { d1ReadSessionsEnabled: true });
      expect(selected?.status).toBe(200);
      expect(await selected?.json()).toEqual(await direct?.json());
      expect(primary.withSession).not.toHaveBeenCalled();
      expect(optedIn.withSession).toHaveBeenCalledExactlyOnceWith("first-primary");
      expect(optedIn.events[0]?.session).toBe(0);
      expect(optedIn.events[0]?.sql).toBe("PRIMARY_ROLE");
      expect(optedIn.events[1]?.sql).toContain("FROM patient_registry");
      expect(optedIn.events[1]?.binds).toEqual([scope.practiceId, scope.patientId]);
      expect(optedIn.events.slice(1).every(e => e.session === 1)).toBe(true);
      expect(optedIn.maxActive()).toBe(1);
      expect(optedIn.bookmarks[0]).toHaveBeenCalledOnce();
      expect(selected?.headers.has("x-d1-bookmark")).toBe(false);
      expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("opaque-session");
    } finally { vi.useRealTimers(); }
  });

  it("creates independent fresh sessions for concurrent requests", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const f = fixture();
    const responses = await Promise.all([
      patientClinicalCoreRoute(await request(), f.context, { d1ReadSessionsEnabled: true }),
      patientClinicalCoreRoute(await request(), f.context, { d1ReadSessionsEnabled: true }),
    ]);
    expect(responses.map(r => r?.status)).toEqual([200, 200]);
    expect(f.withSession).toHaveBeenCalledTimes(2);
    expect(f.bookmarks).toHaveLength(2);
    for (const id of [1, 2]) expect(f.events.find(e => e.session === id)?.sql).toContain("FROM patient_registry");
  });

  it.each([false, undefined])("stays primary when flag is %s", async enabled => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const f = fixture();
    expect((await patientClinicalCoreRoute(await request(), f.context, { d1ReadSessionsEnabled: enabled }))?.status).toBe(200);
    expect(f.withSession).not.toHaveBeenCalled();
  });

  it.each(["permission", "revoked-role", "bad-cursor", "wrong-patient", "wrong-family", "missing-cursor"])("rejects %s before session creation", async kind => {
    const f = fixture({ denied: kind === "revoked-role" });
    const valid = await request();
    const url = new URL(valid.url);
    if (kind === "permission") f.context.user.permissions = [];
    if (kind === "bad-cursor") url.searchParams.set("cursor", "tampered");
    if (kind === "wrong-patient") url.pathname = url.pathname.replace("patient-1", "patient-2");
    if (kind === "wrong-family") url.searchParams.set("family", "timeline");
    if (kind === "missing-cursor") url.searchParams.delete("cursor");
    const response = await patientClinicalCoreRoute(new Request(url), f.context, { d1ReadSessionsEnabled: true });
    expect(response?.status).toBe(kind === "permission" || kind === "revoked-role" ? 403 : 422);
    expect(f.withSession).not.toHaveBeenCalled();
    expect(f.events.every(e => e.session === 0)).toBe(true);
  });

  it.each(["POST", "PATCH", "DELETE"])("does not intercept history %s", async method => {
    const f = fixture();
    const response = await patientClinicalCoreRoute(new Request((await request()).url, { method }), f.context, { d1ReadSessionsEnabled: true });
    expect(response).toBeNull();
    expect(f.withSession).not.toHaveBeenCalled();
  });

  it.each(["/workspace", "/longitudinal/history/", "/patient-core/allergies"])("does not redirect %s", async suffix => {
    const f = fixture();
    await patientClinicalCoreRoute(new Request(`https://example.test/v1/patients/patient-1${suffix}`), f.context, { d1ReadSessionsEnabled: true });
    expect(f.withSession).not.toHaveBeenCalled();
  });

  it("returns 404 after only the scoped primary-start lookup for a missing patient", async () => {
    const f = fixture({ missing: true });
    expect((await patientClinicalCoreRoute(await request(), f.context, { d1ReadSessionsEnabled: true }))?.status).toBe(404);
    expect(f.events.filter(e => e.session === 1)).toHaveLength(1);
  });

  it("fails closed without leaking provider errors or retrying primary", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fixture({ failSql: "patient_identifiers" });
    const response = await patientClinicalCoreRoute(await request(), f.context, { d1ReadSessionsEnabled: true });
    expect(response?.status).toBe(500);
    expect(await response?.json()).toEqual({ error: "patient_core_read_failed" });
    expect(f.events.filter(e => e.session === 0).map(e => e.sql)).toEqual(["PRIMARY_ROLE"]);
    expect(f.bookmarks[0]).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive-provider");
  });
});
