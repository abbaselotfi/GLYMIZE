import fs from "node:fs";
import { describe, expect, it } from "vitest";

const runtime = [
  "../src/platform-patient-portal.ts",
  "../src/patient-portal/media-policy.ts",
].map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
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
const refreshFamilyMigration = fs.readFileSync(
  new URL("../migrations/0006_refresh_token_families.sql", import.meta.url),
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
  it("adds refresh-token families without rewriting the frozen patient schema", () => {
    expect(refreshFamilyMigration).toContain("ALTER TABLE refresh_tokens ADD COLUMN family_id");
    expect(refreshFamilyMigration).toContain("ALTER TABLE portal_refresh_tokens ADD COLUMN family_id");
    expect(refreshFamilyMigration).toContain("replaced_by_token_id");
    expect(refreshFamilyMigration).toContain("compromised_at");
    expect(refreshFamilyMigration).not.toContain("ALTER TABLE patient_registry");
    expect(refreshFamilyMigration).not.toContain("DROP TABLE");
  });
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
      '"refresh_token_reuse_detected"',
    );
    expect(refresh).toContain(
      '"refresh_token_replayed"',
    );
    expect(refresh).toContain("family_id,replaced_by_token_id");
    expect(refresh).toContain("compromised_at=?");
    expect(refresh).toContain(
      "token.persistent === 1",
    );
    expect(refresh).not.toContain(
      'issuePortalSession(env, user, true, "portal-refresh")',
    );

    const issueStart = runtime.indexOf("async function issuePortalSession(");
    const issueEnd = runtime.indexOf(
      "export async function issuePortalSessionForVerifiedPatientLink(",
      issueStart,
    );
    const issue = runtime.slice(issueStart, issueEnd);
    expect(issue.indexOf("SET revoked_at=?,last_used_at=?,replaced_by_token_id=?"))
      .toBeLessThan(issue.indexOf("await insert.run();"));
    expect(issue).toContain("consumed.meta.changes");

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
      "INSERT INTO audit_log",
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
  it("enforces monotonic submission transitions and bounds portal write abuse", () => {
    expect(runtime).toContain(
      "MAX_TOTAL_MEDIA_BYTES = 50 * 1024 * 1024",
    );
    expect(runtime).toContain(
      "PORTAL_RATE_WINDOW_MS = 15 * 60 * 1000",
    );
    expect(runtime).toContain(
      "async function portalRateKey(",
    );

    for (const scope of [
      '"login-account"',
      '"login-ip"',
      '"refresh-ip"',
      '"password-change"',
      '"submission"',
      '"patient-message"',
    ]) {
      expect(runtime).toContain(scope);
    }

    expect(runtime).not.toContain(
      '`portal-login:${loginHash}:${request.headers.get("cf-connecting-ip")',
    );

    const refreshStart = runtime.indexOf(
      "async function portalRefresh(",
    );
    const refreshEnd = runtime.indexOf(
      "async function portalLogout(",
      refreshStart,
    );
    const refreshHandler = runtime.slice(
      refreshStart,
      refreshEnd,
    );

    expect(refreshHandler).toContain(
      '"refresh-ip"',
    );
    expect(refreshHandler).toContain(
      "const refreshHash = await sha256Hex(refreshToken);",
    );
    expect(refreshHandler).toContain(
      '"refresh_token_reuse_detected"',
    );

    expect(runtime).toContain(
      '"media_total_size_rejected"',
    );
    expect(runtime).toContain(
      "function portalSubmissionTransitionAllowed(",
    );
    expect(runtime).toContain(
      '"invalid_submission_transition"',
    );
    expect(runtime).toContain(
      '"submission_status_conflict"',
    );
    expect(runtime).toContain(
      '"encounter_reference_requires_review"',
    );
    expect(runtime).toContain(
      '"reviewed_submission_locked"',
    );

    const statusStart = runtime.indexOf(
      "async function adminSubmissionStatus(",
    );
    const statusEnd = runtime.indexOf(
      "async function adminThreadsList(",
      statusStart,
    );
    const statusHandler = runtime.slice(
      statusStart,
      statusEnd,
    );

    expect(statusHandler).toContain(
      "WHERE id=? AND practice_id=? AND status=?",
    );
    expect(statusHandler).toContain(
      "reviewed_by=CASE WHEN ?='reviewed'",
    );
    expect(statusHandler).toContain(
      "reviewed_at=CASE WHEN ?='reviewed'",
    );
    expect(statusHandler).toContain(
      "fromStatus: submission.status",
    );
    expect(statusHandler).not.toContain(
      "SET status=?,reviewed_by=?,reviewed_at=?",
    );

    expect(reviewUi).toContain(
      'target === "reviewed" && encounterId',
    );
    expect(reviewUi).toContain(
      'item.status === "archived"',
    );
    expect(reviewUi).toContain(
      "encounter_reference_requires_review",
    );

    expect(portalUi).toContain(
      '"media_total_size_rejected"',
    );
    expect(portalUi).toContain(
      'code === "rate_limited"',
    );
  });
  it("hardens portal media lifecycle and keeps persistence explicit", () => {
    expect(runtime).toContain(
      "function portalMediaSignatureMatches(",
    );
    expect(runtime).toContain(
      "async function cleanupPortalMedia(",
    );
    expect(runtime).toContain(
      "await bucket.delete(mediaKey)",
    );
    expect(runtime).toContain(
      '"media_signature_rejected"',
    );

    const persistStart = runtime.indexOf(
      "async function persistThreadMessage(",
    );
    const persistEnd = runtime.indexOf(
      "// --- Patient-side thread handlers",
      persistStart,
    );
    const persist = runtime.slice(
      persistStart,
      persistEnd,
    );

    expect(persist).toContain(
      "uploadedMediaKeys.push(mediaKey)",
    );
    expect(persist).toContain(
      "cleanupPortalMedia(",
    );
    expect(persist).toContain(
      "INSERT INTO audit_log",
    );
    expect(persist).toContain(
      "v3db(env).batch(",
    );
    expect(persist).not.toContain(
      "await portalAudit(",
    );

    const serveStart = runtime.indexOf(
      "async function serveAttachment(",
    );
    const serveEnd = runtime.indexOf(
      "async function portalDownloadAttachment(",
      serveStart,
    );
    const serve = runtime.slice(
      serveStart,
      serveEnd,
    );

    expect(serve).toContain(
      "a.sha256",
    );
    expect(serve).toContain(
      "await sha256BytesHex(bytes)",
    );
    expect(serve).toContain(
      '"attachment_integrity_mismatch"',
    );
        expect(serve).toContain(
      "isRuntimeOriginAllowed(origin, env)",
    );
    expect(serve).not.toContain(
      "origin === env.ADMIN_ORIGIN",
    );
    expect(serve).toContain(
      '"x-content-type-options":',
    );
    expect(serve).toContain(
      '"nosniff"',
    );
    expect(serve).toContain(
      "attachment; filename=",
    );
    expect(serve).not.toContain(
      '"content-disposition": "inline"',
    );

    const passwordStart = runtime.indexOf(
      "async function portalChangePassword(",
    );
    const passwordEnd = runtime.indexOf(
      "// --- Patient intake submissions",
      passwordStart,
    );
    const passwordHandler = runtime.slice(
      passwordStart,
      passwordEnd,
    );

    expect(passwordHandler).toContain(
      "INSERT INTO audit_log",
    );
    expect(passwordHandler).toContain(
      '"portal.password_changed"',
    );
    expect(passwordHandler).toContain(
      "sessionsRevoked: true",
    );
    expect(passwordHandler).not.toContain(
      "replacementSessionIssued: true",
    );
    expect(passwordHandler).not.toContain(
      "await portalAudit(",
    );

    expect(runtime).toContain(
      "persistent: rememberMe",
    );
    expect(runtime).toContain(
      "body.rememberMe === true",
    );
    expect(runtime).not.toContain(
      "body.rememberMe !== false",
    );

    expect(portalClient).toContain(
      "persistent: boolean;",
    );
    expect(portalClient).toContain(
      "session.persistent === true",
    );
    expect(portalClient).toContain(
      "storeSession(session);",
    );
    expect(portalClient).toContain(
      "storeSession(result);",
    );
    expect(portalClient).not.toContain(
      "storeSession(session, rememberMe)",
    );

    expect(portalUi).toContain(
      "const [rememberMe, setRememberMe] = useState(false);",
    );
    expect(portalUi).toContain(
      '"media_signature_rejected"',
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
    expect(runtime).toMatch(
      /"cache-control"\s*:\s*"private, no-store"/,
    );
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
