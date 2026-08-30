import fs from "node:fs";
import { describe, expect, it } from "vitest";

const runtime = fs.readFileSync(
  new URL("../src/platform-patient-portal.ts", import.meta.url),
  "utf8",
);
const entry = fs.readFileSync(
  new URL("../src/platform-v3.ts", import.meta.url),
  "utf8",
);
const v3base = fs.readFileSync(
  new URL("../src/platform-v3-base.ts", import.meta.url),
  "utf8",
);
const wrangler = fs.readFileSync(
  new URL("../wrangler.jsonc", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../migrations/0005_patient_portal_v1.sql", import.meta.url),
  "utf8",
);
const contracts = fs.readFileSync(
  new URL("../../../packages/contracts/src/patient-portal.ts", import.meta.url),
  "utf8",
);
const contractsIndex = fs.readFileSync(
  new URL("../../../packages/contracts/src/index.ts", import.meta.url),
  "utf8",
);
const portalClient = fs.readFileSync(
  new URL("../../web/lib/portal-client.ts", import.meta.url),
  "utf8",
);
const portalUi = fs.readFileSync(
  new URL("../../web/app/portal/portal-client.tsx", import.meta.url),
  "utf8",
);
const reviewUi = fs.readFileSync(
  new URL("../../web/app/portal-review/portal-review-client.tsx", import.meta.url),
  "utf8",
);
const recordRuntime = fs.readFileSync(
  new URL("../src/platform-patient-record-v2.ts", import.meta.url),
  "utf8",
);

function prepareTemplatesUseStaticSql(source: string) {
  const marker = ".prepare(";
  let cursor = 0;
  while (true) {
    const start = source.indexOf(marker, cursor);
    if (start < 0) return true;
    let index = start + marker.length;
    while (/\s/.test(source[index] ?? "")) index += 1;
    if (source[index] !== "`") return false;
    index += 1;
    const sqlStart = index;
    while (index < source.length) {
      if (source[index] === "`" && source[index - 1] !== "\\") break;
      index += 1;
    }
    const sql = source.slice(sqlStart, index);
    if (sql.includes("${")) return false;
    cursor = index;
  }
}

describe("Patient Portal v1 vertical slice (WS-2 / WS-3)", () => {
  it("stores patient intake in additive tables with no plaintext login handle", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS portal_users");
    expect(migration).toContain("login_hash TEXT NOT NULL UNIQUE");
    expect(migration).not.toContain("login_plain");
    expect(migration).not.toContain("login_norm TEXT");
    expect(migration).toContain(
      "must_change_password INTEGER NOT NULL DEFAULT 1",
    );
    expect(migration).toContain("UNIQUE(practice_id, patient_id)");
    expect(migration).toContain("portal_submissions");
    expect(migration).toContain("portal_threads");
    expect(migration).toContain("portal_messages");
    expect(migration).toContain("portal_message_attachments");
    expect(migration).toContain(
      "(sender_role='patient' AND sender_portal_user_id IS NOT NULL AND sender_runtime_user_id IS NULL)",
    );
  });

  it("keeps patient submissions isolated until explicit physician review", () => {
    expect(migration).toContain("status TEXT NOT NULL DEFAULT 'submitted'");
    expect(migration).toContain(
      "CHECK (status IN ('submitted','acknowledged','reviewed','archived'))",
    );
    expect(migration).toContain(
      "encounter_id TEXT REFERENCES patient_encounters(id) ON DELETE SET NULL",
    );
    expect(contracts).toContain("portalSubmissionKinds");
    expect(contracts).toContain("reportedBy");
    expect(contractsIndex).toContain('from "./patient-portal.js"');
  });

  it("forces patient-reported verification to unverified at the runtime boundary", () => {
    expect(runtime).toContain('verification: "unverified"');
    expect(runtime).toContain('payload.reportedBy = "patient"');
    expect(runtime).toContain("sanitizePatientMedications");
    expect(runtime).toContain("sanitizePatientLabs");
    expect(runtime).toContain("sanitizePatientVitals");
  });

  it("fails closed on a disabled feature flag", () => {
    expect(runtime).toContain("portalEnabled");
    expect(runtime).toContain('{ error: "portal_disabled" }');
    expect(wrangler).toContain('"PATIENT_PORTAL_V1_ENABLED": "false"');
    expect(entry).toContain(
      'import { patientPortalRoute } from "./platform-patient-portal"',
    );
    expect(entry).toContain("patientPortalRoute(request, env)");
    expect(v3base).toContain("PATIENT_PORTAL_V1_ENABLED?:string");
  });

  it("separates patient sessions from runtime physician/assistant sessions", () => {
    expect(runtime).toContain('"PORTAL-ACCESS-V1"');
    expect(runtime).not.toContain('"RUNTIME-ACCESS-V1"');
    expect(runtime).toContain("portal_refresh_tokens");
    expect(runtime).toContain("portalRate");
    expect(runtime).toContain("`portal-login:${normalized}`");
  });

  it("fails closed on refresh replay and cross-patient encounter binding", () => {
    const refreshStart = runtime.indexOf(
      "async function portalRefresh(",
    );
    const refreshEnd = runtime.indexOf(
      "async function portalLogout(",
      refreshStart,
    );

    expect(refreshStart).toBeGreaterThanOrEqual(0);
    expect(refreshEnd).toBeGreaterThan(refreshStart);

    const refresh = runtime.slice(
      refreshStart,
      refreshEnd,
    );

    expect(refresh).toContain(
      "persistent,expires_at,revoked_at",
    );
    expect(refresh).toContain(
      "refreshToken.length < 32",
    );
    expect(refresh).toContain(
      "refreshToken.length > 200",
    );
    expect(refresh).toContain(
      "(revoked.meta.changes ?? 0) !== 1",
    );
    expect(refresh).toContain(
      '"refresh_token_replayed"',
    );
    expect(refresh).toContain(
      "token.persistent === 1",
    );
    expect(refresh).not.toContain(
      'issuePortalSession(env, user, true, "portal-refresh")',
    );

    expect(runtime).toContain(
      "user.practice_id !== access.practiceId",
    );
    expect(runtime).toContain(
      "user.patient_id !== access.patientId",
    );

    const statusStart = runtime.indexOf(
      "async function adminSubmissionStatus(",
    );
    const statusEnd = runtime.indexOf(
      "async function adminThreadsList(",
      statusStart,
    );

    expect(statusStart).toBeGreaterThanOrEqual(0);
    expect(statusEnd).toBeGreaterThan(statusStart);

    const statusHandler = runtime.slice(
      statusStart,
      statusEnd,
    );

    expect(statusHandler).toContain(
      "WHERE id=? AND practice_id=? AND patient_id=?",
    );
    expect(statusHandler).toContain(
      "submission.patient_id",
    );
    expect(
      statusHandler.indexOf(
        "SELECT id,patient_id FROM portal_submissions",
      ),
    ).toBeLessThan(
      statusHandler.indexOf(
        "SELECT id FROM patient_encounters",
      ),
    );
  });
  it("requires temporary-password rotation before patient PHI and replaces prior sessions", () => {
    expect(runtime).toContain(
      "function portalPatientDataPath",
    );

    expect(runtime).toContain(
      'pathname === "/v1/portal/submissions"',
    );
    expect(runtime).toContain(
      'pathname === "/v1/portal/threads"',
    );
    expect(runtime).toContain(
      "^\\/v1\\/portal\\/threads\\/[^/]+\\/messages$",
    );
    expect(runtime).toContain(
      "^\\/v1\\/portal\\/attachments\\/[^/]+$",
    );

    expect(runtime).toContain(
      "portalPatientDataPath(url.pathname)",
    );
    expect(runtime).toContain(
      "patient.must_change_password === 1",
    );
    expect(runtime).toContain(
      '"password_change_required"',
    );

    const passwordStart = runtime.indexOf(
      "async function portalChangePassword(",
    );

    const passwordEnd = runtime.indexOf(
      "// --- Patient intake submissions",
      passwordStart,
    );

    expect(passwordStart).toBeGreaterThanOrEqual(0);
    expect(passwordEnd).toBeGreaterThan(passwordStart);

    const passwordHandler = runtime.slice(
      passwordStart,
      passwordEnd,
    );

    for (const marker of [
      "portalAccessPayload(request, env)",
      "access.sessionId",
      "SELECT persistent,device_label",
      "v3db(env).batch([",
      "must_change_password=0",
      "WHERE portal_user_id=? AND revoked_at IS NULL",
      "currentSession.persistent === 1",
      "sessionsRevoked: true",
      "replacementSessionIssued: true",
      "const replacementSession",
      "must_change_password: 0",
    ]) {
      expect(passwordHandler).toContain(marker);
    }

    expect(portalClient).toContain(
      "PortalLoginResponse &",
    );
    expect(portalClient).toContain(
      "storeSession(",
    );
    expect(portalClient).toContain(
      "rememberMe",
    );

    expect(portalUi).toContain(
      "if (!session || session.mustChangePassword) return;",
    );
  });
  it("revokes logout server-side, single-flights refresh, and purges prior patient state", () => {
    const logoutStart = runtime.indexOf(
      "async function portalLogout(",
    );
    const logoutEnd = runtime.indexOf(
      "async function portalSession(",
      logoutStart,
    );

    expect(logoutStart).toBeGreaterThanOrEqual(0);
    expect(logoutEnd).toBeGreaterThan(logoutStart);

    const logoutHandler = runtime.slice(
      logoutStart,
      logoutEnd,
    );

    expect(logoutHandler).toContain(
      "UPDATE portal_refresh_tokens SET revoked_at=?",
    );
    expect(logoutHandler).toContain(
      "access.sessionId",
    );
    expect(logoutHandler).toContain(
      "access.portalUserId",
    );

    for (const marker of [
      "let portalRefreshInFlight: Promise<boolean> | null = null",
      "async function performPortalRefresh()",
      "if (portalRefreshInFlight)",
      "portalRefreshInFlight = operation",
      "getRefreshToken() === refreshToken",
      "export async function logoutPortal()",
      '"/v1/portal/auth/logout"',
      "finally {",
      "clearPortalSession();",
    ]) {
      expect(portalClient).toContain(marker);
    }

    expect(portalUi).toContain(
      "logoutPortal,",
    );
    expect(portalUi).not.toContain(
      "  clearPortalSession,",
    );
    expect(portalUi).toContain(
      "await logoutPortal();",
    );
    expect(portalUi).toContain(
      "resetPortalPatientState",
    );

    for (const marker of [
      "setSubmissions([]);",
      "setThreads([]);",
      "setMessages([]);",
      "setMedicationRows([EMPTY_MEDICATION_ROW]);",
      "setLabRows([EMPTY_LAB_ROW]);",
      "setVitalsForm(EMPTY_VITALS);",
      "setComposeFiles([]);",
    ]) {
      expect(portalUi).toContain(marker);
    }
  });
  it("limits direct conversations to the assigned physician and attributes clinician audit actors", () => {
    const auditStart = runtime.indexOf(
      "async function portalAudit(",
    );
    const auditEnd = runtime.indexOf(
      "async function issuePortalSession(",
      auditStart,
    );

    expect(auditStart).toBeGreaterThanOrEqual(0);
    expect(auditEnd).toBeGreaterThan(auditStart);

    const audit = runtime.slice(
      auditStart,
      auditEnd,
    );

    expect(audit).toContain(
      "actorUserId: string | null = null",
    );
    expect(audit).toContain(
      "VALUES(?,?,?,?,?,?,?,?)",
    );
    expect(audit).not.toContain(
      "VALUES(?,NULL",
    );

    expect(runtime).toContain(
      "sender.runtimeUserId ?? null",
    );

    const threadListStart = runtime.indexOf(
      "async function adminThreadsList(",
    );
    const threadListEnd = runtime.indexOf(
      "async function adminThreadCreate(",
      threadListStart,
    );
    const threadList = runtime.slice(
      threadListStart,
      threadListEnd,
    );

    expect(threadList).toContain(
      'clinician.role !== "physician"',
    );
    expect(threadList).toContain(
      "WHERE practice_id=? AND physician_id=?",
    );
    expect(threadList).toContain(
      "clinician.id",
    );

    const messageStart = runtime.indexOf(
      "async function adminThreadMessages(",
    );
    const messageEnd = runtime.indexOf(
      "type ThreadMessagesResult =",
      messageStart,
    );
    const messageHandler = runtime.slice(
      messageStart,
      messageEnd,
    );

    expect(messageHandler).toContain(
      'clinician.role !== "physician"',
    );
    expect(messageHandler).toContain(
      "thread.physician_id !== clinician.id",
    );
    expect(messageHandler).toContain(
      '"thread_not_assigned_to_physician"',
    );

    const attachmentStart = runtime.indexOf(
      "async function adminDownloadAttachment(",
    );
    const attachmentEnd = runtime.indexOf(
      "async function adminAccountCreate(",
      attachmentStart,
    );
    const attachmentHandler = runtime.slice(
      attachmentStart,
      attachmentEnd,
    );

    expect(attachmentHandler).toContain(
      "JOIN portal_threads",
    );
    expect(attachmentHandler).toContain(
      "attachmentThread.physician_id !== clinician.id",
    );

    const accountStart = runtime.indexOf(
      "async function adminAccountCreate(",
    );
    const accountEnd = runtime.indexOf(
      "// --- Route dispatcher",
      accountStart,
    );
    const accountHandler = runtime.slice(
      accountStart,
      accountEnd,
    );

    expect(accountHandler).toContain(
      'clinicianCan(clinician, "handoff.write")',
    );

    expect(reviewUi).toContain(
      "thread_not_assigned_to_physician",
    );
    expect(reviewUi).toContain(
      "This conversation is assigned to another physician.",
    );
  });
  it("keeps media private and fail-closed with no public or presigned URLs", () => {
    expect(wrangler).toContain('"binding": "PORTAL_MEDIA"');
    expect(runtime).toContain("PORTAL_MEDIA_NOT_CONFIGURED");
    expect(runtime).toContain("25 * 1024 * 1024");
    expect(runtime).toContain('"image/jpeg"');
    expect(runtime).toContain('"video/mp4"');
    expect(runtime).not.toMatch(/presign/i);
    expect(runtime).not.toContain("publicBucket");
    expect(runtime).toContain('"cache-control": "private, no-store"');
    expect(runtime).toContain("MAX_ATTACHMENTS_PER_MESSAGE");
  });

  it("enforces physician authority over clinical review actions", () => {
    expect(runtime).toContain("physician_authority_required");
    expect(runtime).toContain("thread.physician_id !== clinician.id");
    expect(runtime).toContain('clinicianCan(clinician, "handoff.read")');
    expect(runtime).toContain('clinicianCan(clinician, "handoff.write")');
  });

  it("audits portal security-relevant actions", () => {
    expect(runtime).toContain('"portal.login"');
    expect(runtime).toContain('"portal.submission_created"');
    expect(runtime).toContain('"portal.message_sent"');
    expect(runtime).toContain('"portal.submission_status_changed"');
    expect(runtime).toContain('"portal.account_created"');
    expect(runtime).toContain('"portal.thread_created"');
  });

  it("keeps portal account INSERT placeholder arity aligned with bind values", () => {
    const match = runtime.match(
      /INSERT INTO portal_users[\s\S]*?VALUES\(([^`]+)\)`\s*,\s*\)\s*\.bind\(([\s\S]*?)\)\s*\.run\(\);/,
    );

    expect(match).not.toBeNull();

    const placeholders = (match?.[1].match(/\?/g) ?? []).length;
    const bindValues = (match?.[2] ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.endsWith(",")).length;

    expect(placeholders).toBe(15);
    expect(bindValues).toBe(15);
    expect(placeholders).toBe(bindValues);
  });
  it("keeps every portal query on a static SQL template", () => {
    expect(prepareTemplatesUseStaticSql(runtime)).toBe(true);
  });

  it("ships bilingual patient and clinician surfaces wired to the portal API", () => {
    expect(portalClient).toContain("/v1/portal/auth/login");
    expect(portalClient).toContain("refreshPortalSession");
    expect(portalClient).toContain("sendPortalMessage");
    expect(portalUi).toContain("handleIntakeSubmit");
    expect(portalUi).toContain("patient-reported");
    expect(reviewUi).toContain("/v1/portal/admin/submissions");
    expect(reviewUi).toContain("physician_authority_required");
  });

  it("preserves the WS-1 encounter authorization lock in the same release", () => {
    expect(recordRuntime).toContain("ENCOUNTER_REVIEWED_ASSISTANT_LOCKED");
  });
});
