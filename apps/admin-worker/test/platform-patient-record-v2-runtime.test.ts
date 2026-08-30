import fs from "node:fs";
import { describe, expect, it } from "vitest";

const runtime = fs.readFileSync(
  new URL("../src/platform-patient-record-v2.ts", import.meta.url),
  "utf8",
);
const platform = fs.readFileSync(
  new URL("../src/platform-index.ts", import.meta.url),
  "utf8",
);
const roadmap = fs.readFileSync(
  new URL(
    "../../../docs/GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md",
    import.meta.url,
  ),
  "utf8",
);
const queue = fs.readFileSync(
  new URL(
    "../../../docs/IMPLEMENTATION_QUEUE_2026-08-15.md",
    import.meta.url,
  ),
  "utf8",
);
const client = fs.readFileSync(
  new URL("../../web/lib/patient-record-v2-client.ts", import.meta.url),
  "utf8",
);
const runtimeSecurity = fs.readFileSync(
  new URL("../src/runtime-security.ts", import.meta.url),
  "utf8",
);
const encounterRevisionMigration = fs.readFileSync(
  new URL(
    "../migrations/0004_encounter_snapshot_revisions.sql",
    import.meta.url,
  ),
  "utf8",
);
const handoffClient = fs.readFileSync(
  new URL("../../web/lib/patient-handoff-client.ts", import.meta.url),
  "utf8",
);
const careTeamRecordClient = fs.readFileSync(
  new URL("../../web/lib/care-team-record-client.ts", import.meta.url),
  "utf8",
);
const careTeamPage = fs.readFileSync(
  new URL("../../web/app/care-team/care-team-client.tsx", import.meta.url),
  "utf8",
);

type PrepareBind = {
  sql: string;
  bindCount: number;
};

function topLevelArgumentCount(source: string) {
  let depth = 0;
  let count = 0;
  let segmentStart = 0;
  let quote = "";
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      continue;
    }
    if (char === "," && depth === 0) {
      if (source.slice(segmentStart, index).trim()) count += 1;
      segmentStart = index + 1;
    }
  }

  if (source.slice(segmentStart).trim()) count += 1;
  return count;
}

function scanPrepareBindCalls(source: string): PrepareBind[] {
  const marker = "context.database.prepare(";
  const calls: PrepareBind[] = [];
  let cursor = 0;

  while (true) {
    const start = source.indexOf(marker, cursor);
    if (start < 0) break;

    let index = start + marker.length;
    while (/\s/.test(source[index] ?? "")) index += 1;
    if (source[index] !== "`") {
      throw new Error("Patient Record v2 prepare() must use a static template");
    }

    index += 1;
    const sqlStart = index;
    while (index < source.length) {
      if (source[index] === "`" && source[index - 1] !== "\\") break;
      index += 1;
    }
    const sql = source.slice(sqlStart, index);
    if (sql.includes("${")) {
      throw new Error("Dynamic SQL interpolation is not allowed");
    }

    const bindMarker = ".bind(";
    const bindStart = source.indexOf(bindMarker, index);
    if (bindStart < 0 || bindStart - index > 120) {
      throw new Error("prepare() without a nearby bind()");
    }

    let argIndex = bindStart + bindMarker.length;
    const argsStart = argIndex;
    let depth = 1;
    let quote = "";
    let escaped = false;

    while (argIndex < source.length && depth > 0) {
      const char = source[argIndex]!;
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === quote) {
          quote = "";
        }
      } else if (char === "'" || char === '"' || char === "`") {
        quote = char;
      } else if (char === "(" || char === "[" || char === "{") {
        depth += 1;
      } else if (char === ")" || char === "]" || char === "}") {
        depth -= 1;
      }
      argIndex += 1;
    }

    const args = source.slice(argsStart, argIndex - 1);
    calls.push({
      sql,
      bindCount: topLevelArgumentCount(args),
    });
    cursor = argIndex;
  }

  return calls;
}

describe("Patient Record v2 runtime vertical slice", () => {
  it("uses one shared patient-code normalizer/checksum implementation", () => {
    expect(runtimeSecurity).toContain('from "@glymize/contracts"');
    expect(handoffClient).toContain('from "@glymize/contracts"');
    expect(runtimeSecurity).not.toContain("const PERSIAN_DIGITS");
    expect(handoffClient).not.toContain("const PERSIAN_DIGITS");
  });

  it("wires one authenticated v2 route without replacing the legacy handoff path", () => {
    expect(platform).toContain(
      'import { patientRecordV2Route } from "./platform-patient-record-v2"',
    );
    expect(platform).toContain('url.pathname.startsWith("/v1/patients")');
    expect(platform).toContain("patientRecordV2Route(request");
    expect(platform).toContain('"/v1/patient-handoff/upsert"');
    expect(platform).toContain('"/v1/patient-handoff/lookup"');
  });

  it("exposes the bounded Patient Record v2 foundation endpoints", () => {
    for (const marker of [
      '"/v1/patients/file-number-allocator"',
      '"/v1/patients/file-number-allocator/initialize"',
      '"/v1/patients/resolve"',
      '"/v1/patients/promote-legacy-handoff"',
      '"/v1/patients"',
      "/identifiers",
      "/encounters",
      "/workspace",
    ]) {
      expect(runtime).toContain(marker);
    }
    expect(runtime).toContain("patient_handoff_legacy_links");
  });

  it("keeps one typed web client aligned with the new runtime endpoints", () => {
    for (const marker of [
      "getPatientFileNumberAllocator",
      "initializePatientFileNumberAllocator",
      "resolvePatient",
      "promoteLegacyHandoff",
      "createCareTeamPatientIntake",
      "createPatient",
      "attachPatientIdentifier",
      "createPatientEncounter",
      "getPatientEncounter",
      "revisePatientEncounter",
      "getPatientWorkspace",
    ]) {
      expect(client).toContain(marker);
    }
    expect(client).toContain('"/v1/patients/resolve"');
    expect(client).toContain('"/v1/patients/promote-legacy-handoff"');
    expect(client).toContain('"/v1/patients/care-team-intake"');
    expect(client).toContain('"/v1/patients"');
  });

  it("keeps patient operations practice-scoped and legacy promotion explicit", () => {
    expect(runtime).toContain("context.user.practiceId");
    expect(runtime).toContain("legacyHandoff");
    expect(runtime).toContain('"legacy_handoff" as const');
    expect(runtime).not.toContain("silentLegacy");
    expect(runtime).not.toContain("autoMigrateLegacy");
  });

  it("promotes a legacy handoff only through explicit, practice-scoped, idempotent v2 migration", () => {
    const start = runtime.indexOf("async function promoteLegacyHandoff");
    const end = runtime.indexOf("function conflictResponse", start);
    const promotion = runtime.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(promotion).toContain('!can(context, "handoff.read")');
    expect(promotion).toContain('!can(context, "handoff.write")');
    expect(promotion).toContain("expectedLegacyRevision");
    expect(promotion).toContain("LEGACY_HANDOFF_REVISION_CONFLICT");
    expect(promotion).toContain("LEGACY_HANDOFF_IDENTIFIER_MISMATCH");
    expect(promotion).toContain("LEGACY_HANDOFF_REVIEWED_LOCKED");
    expect(promotion).toContain("PATIENT_IDENTIFIER_EXISTS");
    expect(promotion).toContain("INSERT INTO patient_handoff_legacy_links");
    expect(promotion).toContain("context.database.batch(statements)");
    expect(promotion).toContain('"patient.legacy_handoff_promoted"');
    expect(promotion).toContain('"care_team"');
    expect(promotion).toContain("migrationProvenance");
    expect(promotion).toContain("...payload");
    expect(promotion).toContain("legacyRevision: legacy.revision");
    expect(promotion).toContain("legacyCreatedAt: legacy.created_at");
    expect(promotion).toContain("legacyUpdatedAt: legacy.updated_at");
    expect(promotion).not.toContain("UPDATE patient_handoffs");
    expect(promotion).not.toContain("DELETE FROM patient_handoffs");
  });
  it("locks legacy handoff writes after explicit v2 promotion", () => {
    const start = platform.indexOf("async function upsertHandoff");
    const end = platform.indexOf("async function lookupHandoff", start);
    const upsert = platform.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(upsert).toContain("patient_handoff_legacy_links");
    expect(upsert).toContain("LEGACY_HANDOFF_PROMOTED_READ_ONLY");
    expect(upsert).toContain('"handoff.legacy_write_denied"');
    expect(upsert).toContain("expectedRecordId");
    expect(upsert).toContain('reason: "promoted_to_patient_record_v2"');

    const lockQuery = upsert.match(
      /SELECT l\.patient_id,l\.encounter_id[\s\S]*?LIMIT 1\x60,\s*\)\.bind\(([\s\S]*?)\)\.first/,
    );
    expect(lockQuery).not.toBeNull();
    const sqlSegment = lockQuery?.[0] ?? "";
    const placeholders = (sqlSegment.match(/\?/g) ?? []).length;
    const bindCount = topLevelArgumentCount(lockQuery?.[1] ?? "");
    expect(placeholders).toBe(3);
    expect(bindCount).toBe(3);
  });

  it("uses a monotonic allocator with server-side conflict and concurrency guards", () => {
    expect(runtime).toContain("FILE_NUMBER_ALLOCATOR_UNINITIALIZED");
    expect(runtime).toContain("FILE_NUMBER_ALLOCATOR_OUT_OF_SYNC");
    expect(runtime).toContain("FILE_NUMBER_ALLOCATION_RETRY_REQUIRED");
    expect(runtime).toContain("context.database.batch(statements)");
    expect(runtime).toContain(
      "AND CAST(last_allocated_number AS TEXT)=?",
    );
    expect(runtime).toContain(
      "patient_file_number_allocators",
    );
    expect(runtime).not.toContain("first-free");
  });

  it("can attach a later identifier to the same patient without creating a duplicate patient", () => {
    expect(runtime).toContain("attachPatientIdentifier");
    expect(runtime).toContain("PATIENT_IDENTIFIER_KIND_EXISTS");
    expect(runtime).toContain('"patient.identifier_attached"');
    expect(runtime).toContain("readPatientIdentifierKinds");
    expect(runtime).toContain(
      "INSERT INTO patient_identifiers",
    );
  });

  it("creates a new Care Team patient and first encounter atomically in Patient Record v2", () => {
    const start = runtime.indexOf(
      "async function createCareTeamPatientIntake",
    );
    const end = runtime.indexOf(
      "async function createPatient(",
      start,
    );
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const intake = runtime.slice(start, end);
    expect(intake).toContain(
      'context.user.role !== "assistant"',
    );
    expect(intake).toContain(
      "FILE_NUMBER_ALLOCATOR_UNINITIALIZED",
    );
    expect(intake).toContain(
      "INSERT INTO patient_registry",
    );
    expect(intake).toContain(
      "INSERT INTO patient_encounters",
    );
    expect(intake).toContain(
      "INSERT INTO patient_encounter_snapshots",
    );
    expect(intake).toContain(
      "await context.database.batch(statements)",
    );
    expect(intake).toContain(
      "'care_team','ready_for_physician'",
    );
    expect(runtime).toContain(
      'url.pathname === "/v1/patients/care-team-intake"',
    );
  });
  it("creates a separate encounter and append-only revision-1 snapshot", () => {
    expect(runtime).toContain("INSERT INTO patient_encounters");
    expect(runtime).toContain("INSERT INTO patient_encounter_snapshots");
    expect(runtime).toContain(
      "VALUES (?,?,?,?,1,?,?,?,?,?,?,?)",
    );
    expect(runtime).toContain('"patient.encounter_created"');
    expect(runtime).not.toContain("UPDATE patient_encounter_snapshots");
  });

  it("adds optimistic same-encounter revisions without overwriting history", () => {
    expect(runtime).toContain("ENCOUNTER_REVISION_CONFLICT");
    expect(runtime).toContain("expectedRevision");
    expect(runtime).toContain('"patient.encounter_revised"');
    expect(runtime).toContain('request.method === "PATCH"');
    expect(runtime).toContain("nextRevision = currentRevision + 1");
    expect(runtime).toContain("snapshotAad(");
    expect(runtime).not.toContain("UPDATE patient_encounter_snapshots");
  });

  it("links indexed observations to the snapshot revision via additive migration 0004", () => {
    expect(encounterRevisionMigration).toContain(
      "ADD COLUMN snapshot_revision",
    );
    expect(encounterRevisionMigration).toContain(
      "patient_observations_encounter_revision_idx",
    );
    expect(runtime).toContain("snapshot_revision");
    expect(runtime).toContain("nextRevision");
  });

  it("locks completed and signed encounters from in-place clinical revision", () => {
    expect(runtime).toContain("ENCOUNTER_COMPLETED_IMMUTABLE");
    expect(runtime).toContain("ENCOUNTER_SIGNED_PLAN_LOCKED");
    expect(runtime).toContain(
      "physician_encounter_revision_forbidden",
    );
  });

  it("locks physician-reviewed care_team encounters from assistant revision (WS-1 authorization fix)", () => {
    expect(runtime).toContain("ENCOUNTER_REVIEWED_ASSISTANT_LOCKED");
    expect(runtime).toContain(
      '"patient.encounter_assistant_revision_denied"',
    );
    const gate = runtime.slice(
      runtime.indexOf("async function reviseEncounter"),
      runtime.indexOf("async function workspace"),
    );
    expect(gate).toContain('encounter.source === "care_team"');
    expect(gate).toContain('encounter.status !== "draft"');
    expect(gate).toContain('encounter.status !== "ready_for_physician"');
  });

  it("gives assistants no reachable target statuses after physician review", () => {
    const fn = runtime.slice(
      runtime.indexOf("function allowedRevisionStatuses"),
      runtime.indexOf("async function reviseEncounter"),
    );
    expect(fn).toContain('return currentStatus === "draft" ||');
    expect(fn).toContain(": [];");
  });

  it("encrypts observations and marks timestamp fallback instead of inventing a source date", () => {
    expect(runtime).toContain("INSERT INTO patient_observations");
    expect(runtime).toContain("encryptClinicalPayload(");
    expect(runtime).toContain('basis: "source_timestamp" as const');
    expect(runtime).toContain('basis: "encounter_fallback" as const');
    expect(runtime).toContain("sourceObservedAt");
    expect(runtime).toContain("invalid_laboratory_observation");
  });

  it("does not put a patient file number into audit metadata", () => {
    expect(runtime).toContain("allocatedFileNumber: true");
    expect(runtime).not.toContain("fileNumber: code");
  });

  it("reuses the existing runtime layout preset for Patient Workspace", () => {
    expect(runtime).toContain("mode: context.user.layoutPreset");
    expect(roadmap).toContain(
      "existing physician `layoutPreset`",
    );
    expect(roadmap).toContain("`focused_workflow`");
    expect(roadmap).toContain("`compact_cards`");
    expect(roadmap).toContain("`command_center`");
  });

  it("freezes migration 0003 after isolated RC rehearsal", () => {
    expect(roadmap).toContain("Migration `0003` is now frozen");
    expect(queue).toContain("applied migration `0003` is frozen");
    expect(queue).toContain("Production is unchanged");
  });

  it("cuts Care Team persistence over to Patient Record v2 without legacy writes", () => {
    expect(careTeamPage).toContain(
      'from "../../lib/care-team-record-client";',
    );
    expect(careTeamPage).not.toContain(
      'from "../../lib/patient-handoff-client";',
    );
    for (const marker of [
      "resolvePatient",
      "promoteLegacyHandoff",
      "createCareTeamPatientIntake",
      "createPatientEncounter",
      "getPatientEncounter",
      "getPatientWorkspace",
      "revisePatientEncounter",
      "expectedRevision",
      "displayMask",
      "input.expectedRevision !== 0",
      'status: "ready_for_physician"',
    ]) {
      expect(careTeamRecordClient).toContain(marker);
    }
    expect(careTeamRecordClient).not.toContain("/v1/patient-handoff/");
    expect(careTeamRecordClient).not.toContain("patient-handoff-client");
    expect(careTeamPage).toContain("FILE_NUMBER_ALLOCATOR_UNINITIALIZED");
    expect(careTeamPage).toContain("ENCOUNTER_REVIEWED_ASSISTANT_LOCKED");
  });

  it("keeps every static D1 prepare placeholder aligned with bind arity", () => {
    const calls = scanPrepareBindCalls(runtime);
    expect(calls.length).toBeGreaterThanOrEqual(20);

    for (const [index, call] of calls.entries()) {
      const placeholders = [...call.sql.matchAll(/\?/g)].length;
      expect(
        call.bindCount,
        `prepare/bind #${index + 1}: ${call.sql.replace(/\s+/g, " ").slice(0, 120)}`,
      ).toBe(placeholders);
    }
  });
});
