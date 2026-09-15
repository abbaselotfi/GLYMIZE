import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { PatientRecordV2RouteContext } from "../src/patient-record-v2/context";

const handlers = vi.hoisted(() => ({ legacy: vi.fn(), authority: vi.fn() }));
vi.mock("../src/platform-patient-record-v2-core", () => ({ patientRecordV2Route: handlers.legacy }));
vi.mock("../src/patient-core/authority-route", () => ({ patientCoreAuthorityRoute: handlers.authority }));
import { patientRecordV2Route } from "../src/platform-patient-record-v2";

beforeEach(() => vi.clearAllMocks());

describe("R29-03-A facade isolation", () => {
  it("keeps legacy write and batch capability on the original context", async () => {
    const withSession = vi.fn();
    const batch = vi.fn();
    const context = { database: { withSession, batch } } as unknown as PatientRecordV2RouteContext;
    handlers.authority.mockResolvedValue(null);
    handlers.legacy.mockResolvedValue(Response.json({ ok: true }));
    const request = new Request("https://example.test/v1/patients", { method: "POST" });
    await patientRecordV2Route(request, context, { patientCoreD1ReadSessionsEnabled: true });
    expect(handlers.legacy).toHaveBeenCalledExactlyOnceWith(request, context);
    expect(handlers.legacy.mock.calls[0]?.[1].database.batch).toBe(batch);
    expect(withSession).not.toHaveBeenCalled();
  });

  it("dispatches authority before the optional reader using the original context", async () => {
    const withSession = vi.fn();
    const context = { database: { withSession } } as unknown as PatientRecordV2RouteContext;
    const expected = Response.json({ authority: true });
    handlers.authority.mockResolvedValue(expected);
    const request = new Request("https://example.test/v1/patients/patient-1/patient-core/allergies", { method: "POST" });
    expect(await patientRecordV2Route(request, context, {
      patientCoreD1ReadSessionsEnabled: true, patientCoreAllergyProblemAuthorityEnabled: true,
    })).toBe(expected);
    expect(handlers.authority).toHaveBeenCalledExactlyOnceWith(request, context, true);
    expect(handlers.legacy).not.toHaveBeenCalled();
    expect(withSession).not.toHaveBeenCalled();
  });

  it("wires only explicit true and leaves primary auth/revocation closures intact", () => {
    // Source guard complements route behavior; not a remote session/auth test.
    const source = readFileSync(new URL("../src/platform-index.ts", import.meta.url), "utf8");
    expect(source).toContain('patientCoreD1ReadSessionsEnabled: env.PATIENT_CORE_D1_READ_SESSIONS_ENABLED === "true"');
    expect(source).toContain('patientCoreCryptoKeyReuseEnabled: env.PATIENT_CORE_CRYPTO_KEY_REUSE_ENABLED === "true"');
    expect(source).toContain('patientCoreHistoryScopeLookupEnabled: env.PATIENT_CORE_HISTORY_SCOPE_LOOKUP_ENABLED === "true"');
    expect(source).toContain('SELECT revoked_at, expires_at FROM refresh_tokens');
    expect(source).toContain('authorize:(route)=>runtimeUserCanAccessPatientRoute(env,auth,route)');
    expect(source).not.toContain(".withSession(");
  });
});
