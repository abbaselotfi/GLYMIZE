
import {
  decryptClinicalPayload,
  encryptClinicalPayload,
  hmacHex,
  maskIdentifier,
  normalizePatientCode,
  validateIranianNationalId,
  type LayoutPreset,
  type RuntimePermission,
  type RuntimeRole,
} from "./runtime-security";
import {
  nextNumericFileNumber,
  normalizeEncounterTimestamp,
  observationIndexKey,
  parseNumericFileNumber,
  resolveSmartPatientIdentifierKind,
  type PatientIdentifierKind,
} from "./patient-record-v2-policy";

type PatientRecordUser = {
  id: string;
  role: RuntimeRole;
  practiceId: string;
  permissions: RuntimePermission[];
  layoutPreset: LayoutPreset;
};

export type PatientRecordV2RouteContext = {
  database: D1Database;
  clinicalSecret: string;
  user: PatientRecordUser;
  respond: (body: unknown, status?: number) => Response;
  audit: (
    action: string,
    targetType?: string,
    targetId?: string,
    meta?: unknown,
  ) => Promise<void>;
};

type AllocatorRow = {
  allocation_status: "uninitialized" | "ready";
  last_allocated_number: string | null;
  display_width: number;
  initialized_at: string | null;
};

type PatientRow = {
  id: string;
  status: "active" | "archived";
};

type IdentifierRow = {
  id: string;
  identifier_kind: PatientIdentifierKind;
  display_mask: string;
  is_primary: number;
};

type NormalizedIdentifier = {
  kind: PatientIdentifierKind;
  normalized: string;
  hash: string;
  isPrimary: boolean;
};

type LegacyReference = {
  id: string;
  patient_code_kind: PatientIdentifierKind;
  patient_code_display: string;
  revision: number;
  updated_at: string;
};

type LegacyPromotionRow = {
  id: string;
  patient_code_hash: string;
  patient_code_kind: PatientIdentifierKind;
  patient_code_display: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  status: "draft" | "ready_for_physician" | "reviewed";
  revision: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};
type LegacyLinkRow = {
  patient_id: string;
  encounter_id: string;
};

const MAX_PAYLOAD_CHARS = 250_000;
const MAX_LABS = 500;

function can(
  context: PatientRecordV2RouteContext,
  permission: RuntimePermission,
) {
  return context.user.permissions.includes(permission);
}

function nowIso() {
  return new Date().toISOString();
}

function validPatientId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function safeName(value: unknown) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text && text.length <= 100 ? text : undefined;
}

function safeDateOfBirth(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = Date.parse(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed) || parsed > Date.now()) return null;
  return new Date(parsed).toISOString().slice(0, 10) === text
    ? text
    : null;
}

function allocatorPublicState(row: AllocatorRow | null) {
  if (
    !row ||
    row.allocation_status !== "ready" ||
    row.last_allocated_number === null
  ) {
    return {
      status: "uninitialized" as const,
      displayWidth: row?.display_width ?? 1,
    };
  }

  const next = nextNumericFileNumber(
    row.last_allocated_number,
    row.display_width,
  );

  return {
    status: "ready" as const,
    lastAllocatedNumber: row.last_allocated_number,
    ...(next ? { nextProposedNumber: next } : {}),
    displayWidth: row.display_width,
    ...(row.initialized_at
      ? { initializedAt: row.initialized_at }
      : {}),
  };
}

async function readAllocator(
  context: PatientRecordV2RouteContext,
) {
  return context.database.prepare(
    `SELECT allocation_status,
            CAST(last_allocated_number AS TEXT) AS last_allocated_number,
            display_width,initialized_at
     FROM patient_file_number_allocators
     WHERE practice_id=?`,
  ).bind(
    context.user.practiceId,
  ).first<AllocatorRow>();
}

async function codeHash(
  context: PatientRecordV2RouteContext,
  kind: PatientIdentifierKind,
  value: string,
) {
  return hmacHex(
    context.clinicalSecret,
    `${context.user.practiceId}:${kind}:${value}`,
  );
}

async function normalizeIdentifier(
  context: PatientRecordV2RouteContext,
  raw: unknown,
): Promise<NormalizedIdentifier | null> {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const kind = String(input.kind ?? "") as PatientIdentifierKind;
  if (!["file_number", "national_id", "other"].includes(kind)) {
    return null;
  }

  const normalized = normalizePatientCode(
    String(input.value ?? ""),
  );
  if (normalized.length < 3 || normalized.length > 64) {
    return null;
  }
  if (
    kind === "national_id" &&
    !validateIranianNationalId(normalized)
  ) {
    return null;
  }

  return {
    kind,
    normalized,
    hash: await codeHash(context, kind, normalized),
    isPrimary: input.isPrimary === true,
  };
}

async function normalizeIdentifierList(
  context: PatientRecordV2RouteContext,
  raw: unknown,
) {
  const source = Array.isArray(raw) ? raw : [];
  if (source.length > 3) {
    return { error: "too_many_patient_identifiers" as const };
  }

  const identifiers: NormalizedIdentifier[] = [];
  const kinds = new Set<string>();
  for (const item of source) {
    const normalized = await normalizeIdentifier(context, item);
    if (!normalized) {
      return { error: "invalid_patient_identifier" as const };
    }
    if (kinds.has(normalized.kind)) {
      return {
        error: "duplicate_patient_identifier_kind" as const,
      };
    }
    kinds.add(normalized.kind);
    identifiers.push(normalized);
  }
  return { identifiers };
}

async function findConflict(
  context: PatientRecordV2RouteContext,
  identifier: NormalizedIdentifier,
) {
  const v2 = await context.database.prepare(
    `SELECT patient_id
     FROM patient_identifiers
     WHERE practice_id=? AND identifier_kind=? AND identifier_hash=?`,
  ).bind(
    context.user.practiceId,
    identifier.kind,
    identifier.hash,
  ).first<{ patient_id: string }>();
  if (v2) {
    return {
      source: "patient_record_v2" as const,
      patientId: v2.patient_id,
    };
  }

  const legacy = await context.database.prepare(
    `SELECT id,patient_code_kind,patient_code_display,revision,updated_at
     FROM patient_handoffs
     WHERE practice_id=? AND patient_code_hash=?`,
  ).bind(
    context.user.practiceId,
    identifier.hash,
  ).first<LegacyReference>();
  return legacy
    ? { source: "legacy_handoff" as const, legacy }
    : null;
}

async function firstConflict(
  context: PatientRecordV2RouteContext,
  identifiers: NormalizedIdentifier[],
) {
  for (const identifier of identifiers) {
    const conflict = await findConflict(context, identifier);
    if (conflict) return { identifier, conflict };
  }
  return null;
}

function identifierAad(
  practiceId: string,
  patientId: string,
  identifierId: string,
) {
  return `patient-identifier:${practiceId}:${patientId}:${identifierId}`;
}

function demographicsAad(
  practiceId: string,
  patientId: string,
) {
  return `patient-demographics:${practiceId}:${patientId}`;
}

function snapshotAad(
  practiceId: string,
  encounterId: string,
  revision: number,
) {
  return `patient-snapshot:${practiceId}:${encounterId}:${revision}`;
}

function observationAad(
  practiceId: string,
  observationId: string,
) {
  return `patient-observation:${practiceId}:${observationId}`;
}

async function encryptedIdentifierRow(
  context: PatientRecordV2RouteContext,
  patientId: string,
  item: NormalizedIdentifier,
  createdAt: string,
) {
  const id = crypto.randomUUID();
  const encrypted = await encryptClinicalPayload(
    { value: item.normalized },
    context.clinicalSecret,
    identifierAad(
      context.user.practiceId,
      patientId,
      id,
    ),
  );

  return {
    id,
    patientId,
    practiceId: context.user.practiceId,
    kind: item.kind,
    hash: item.hash,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    displayMask: maskIdentifier(item.normalized),
    createdAt,
  };
}


async function identifierInsertStatements(
  context: PatientRecordV2RouteContext,
  patientId: string,
  identifiers: NormalizedIdentifier[],
  primaryKind: PatientIdentifierKind,
  createdAt: string,
) {
  const statements: D1PreparedStatement[] = [];

  for (const item of identifiers) {
    const row = await encryptedIdentifierRow(
      context,
      patientId,
      item,
      createdAt,
    );

    statements.push(
      context.database.prepare(
        `INSERT INTO patient_identifiers
         (id,patient_id,practice_id,identifier_kind,identifier_hash,
          value_ciphertext,value_iv,value_auth_tag,display_mask,is_primary,
          created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        row.id,
        row.patientId,
        row.practiceId,
        row.kind,
        row.hash,
        row.ciphertext,
        row.iv,
        row.authTag,
        row.displayMask,
        item.kind === primaryKind ? 1 : 0,
        row.createdAt,
        row.createdAt,
      ),
    );
  }

  return statements;
}

async function demographicsInsertStatement(
  context: PatientRecordV2RouteContext,
  patientId: string,
  raw: unknown,
  createdAt: string,
) {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  ) {
    return null;
  }
  const input = raw as Record<string, unknown>;
  const firstName = safeName(input.firstName);
  const lastName = safeName(input.lastName);
  const dateOfBirth = safeDateOfBirth(input.dateOfBirth);

  if (dateOfBirth === null) {
    throw new Error("INVALID_DATE_OF_BIRTH");
  }

  const payload = {
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(dateOfBirth ? { dateOfBirth } : {}),
  };
  if (!Object.keys(payload).length) return null;

  const encrypted = await encryptClinicalPayload(
    payload,
    context.clinicalSecret,
    demographicsAad(context.user.practiceId, patientId),
  );

  return context.database.prepare(
    `INSERT INTO patient_demographics
     (patient_id,practice_id,payload_ciphertext,payload_iv,payload_auth_tag,
      updated_by,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).bind(
    patientId,
    context.user.practiceId,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.authTag,
    context.user.id,
    createdAt,
    createdAt,
  );
}

async function readPatientSummary(
  context: PatientRecordV2RouteContext,
  patientId: string,
) {
  const patient = await context.database.prepare(
    `SELECT id,status
     FROM patient_registry
     WHERE practice_id=? AND id=?`,
  ).bind(
    context.user.practiceId,
    patientId,
  ).first<PatientRow>();
  if (!patient) return null;

  const identifiers = await context.database.prepare(
    `SELECT id,identifier_kind,display_mask,is_primary
     FROM patient_identifiers
     WHERE practice_id=? AND patient_id=?
     ORDER BY is_primary DESC,created_at ASC`,
  ).bind(
    context.user.practiceId,
    patientId,
  ).all<IdentifierRow>();

  const demographicsRow = await context.database.prepare(
    `SELECT payload_ciphertext,payload_iv,payload_auth_tag
     FROM patient_demographics
     WHERE practice_id=? AND patient_id=?`,
  ).bind(
    context.user.practiceId,
    patientId,
  ).first<{
    payload_ciphertext: string;
    payload_iv: string;
    payload_auth_tag: string;
  }>();

  const demographics = demographicsRow
    ? await decryptClinicalPayload<Record<string, unknown>>(
        {
          ciphertext: demographicsRow.payload_ciphertext,
          iv: demographicsRow.payload_iv,
          authTag: demographicsRow.payload_auth_tag,
        },
        context.clinicalSecret,
        demographicsAad(
          context.user.practiceId,
          patientId,
        ),
      )
    : null;
  if (demographicsRow && !demographics) {
    throw new Error("PATIENT_DEMOGRAPHICS_DECRYPTION_FAILED");
  }

  const latest = await context.database.prepare(
    `SELECT encounter_at
     FROM patient_encounters
     WHERE practice_id=? AND patient_id=?
     ORDER BY encounter_at DESC,created_at DESC
     LIMIT 1`,
  ).bind(
    context.user.practiceId,
    patientId,
  ).first<{ encounter_at: string }>();

  return {
    patientId,
    status: patient.status,
    ...(demographics ? { demographics } : {}),
    identifiers: identifiers.results.map((row) => ({
      id: row.id,
      kind: row.identifier_kind,
      displayMask: row.display_mask,
      isPrimary: row.is_primary === 1,
    })),
    ...(latest
      ? { latestEncounterAt: latest.encounter_at }
      : {}),
  };
}

async function getAllocator(
  context: PatientRecordV2RouteContext,
) {
  if (!can(context, "handoff.read")) {
    return context.respond({ error: "permission_denied" }, 403);
  }
  return context.respond(
    allocatorPublicState(await readAllocator(context)),
  );
}

async function initializeAllocator(
  request: Request,
  context: PatientRecordV2RouteContext,
) {
  if (
    context.user.role !== "physician" ||
    !can(context, "handoff.write")
  ) {
    return context.respond({ error: "physician_required" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return context.respond({ error: "invalid_json" }, 400);
  }

  const parsed = parseNumericFileNumber(
    String(body.lastAllocatedNumber ?? ""),
  );
  if (!parsed) {
    return context.respond(
      { error: "invalid_last_allocated_file_number" },
      422,
    );
  }

  const requestedWidth = Number(
    body.displayWidth ?? parsed.width,
  );
  if (
    !Number.isInteger(requestedWidth) ||
    requestedWidth < parsed.width ||
    requestedWidth > 18
  ) {
    return context.respond(
      { error: "invalid_file_number_display_width" },
      422,
    );
  }

  const now = nowIso();
  const row = await context.database.prepare(
    `INSERT INTO patient_file_number_allocators
     (practice_id,allocation_status,last_allocated_number,display_width,
      initialized_by,initialized_at,updated_by,updated_at)
     VALUES (?,'ready',CAST(? AS INTEGER),?,?,?,?,?)
     ON CONFLICT(practice_id) DO UPDATE SET
       allocation_status='ready',
       last_allocated_number=CAST(excluded.last_allocated_number AS INTEGER),
       display_width=excluded.display_width,
       initialized_by=excluded.initialized_by,
       initialized_at=excluded.initialized_at,
       updated_by=excluded.updated_by,
       updated_at=excluded.updated_at
     WHERE patient_file_number_allocators.allocation_status='uninitialized'
     RETURNING allocation_status,
       CAST(last_allocated_number AS TEXT) AS last_allocated_number,
       display_width,initialized_at`,
  ).bind(
    context.user.practiceId,
    parsed.number.toString(),
    requestedWidth,
    context.user.id,
    now,
    context.user.id,
    now,
  ).first<AllocatorRow>();

  if (!row) {
    return context.respond(
      {
        error: "FILE_NUMBER_ALLOCATOR_ALREADY_INITIALIZED",
        allocator:
          allocatorPublicState(await readAllocator(context)),
      },
      409,
    );
  }

  await context.audit(
    "patient.file_number_allocator_initialized",
    "practice",
    context.user.practiceId,
    {
      lastAllocatedNumber: parsed.number.toString(),
      displayWidth: requestedWidth,
    },
  );

  return context.respond(allocatorPublicState(row), 201);
}

async function resolvePatient(
  request: Request,
  context: PatientRecordV2RouteContext,
) {
  if (!can(context, "handoff.read")) {
    return context.respond({ error: "permission_denied" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return context.respond({ error: "invalid_json" }, 400);
  }

  const normalized = normalizePatientCode(
    String(body.identifier ?? ""),
  );
  if (normalized.length < 3 || normalized.length > 64) {
    return context.respond(
      { error: "invalid_patient_identifier" },
      422,
    );
  }

  const kind = resolveSmartPatientIdentifierKind(
    normalized,
    body.kind,
  );
  if (!kind) {
    return context.respond(
      { error: "invalid_patient_identifier_kind" },
      422,
    );
  }
  if (
    kind === "national_id" &&
    !validateIranianNationalId(normalized)
  ) {
    return context.respond({ error: "invalid_national_id" }, 422);
  }

  const hash = await codeHash(context, kind, normalized);
  const matched = await context.database.prepare(
    `SELECT id,patient_id,display_mask,is_primary
     FROM patient_identifiers
     WHERE practice_id=? AND identifier_kind=? AND identifier_hash=?`,
  ).bind(
    context.user.practiceId,
    kind,
    hash,
  ).first<{
    id: string;
    patient_id: string;
    display_mask: string;
    is_primary: number;
  }>();

  if (matched) {
    const patient = await readPatientSummary(
      context,
      matched.patient_id,
    );
    if (!patient) {
      return context.respond(
        { error: "patient_identity_integrity_error" },
        500,
      );
    }

    return context.respond({
      found: true,
      resolvedKind: kind,
      matchedIdentifier: {
        id: matched.id,
        kind,
        displayMask: matched.display_mask,
        isPrimary: matched.is_primary === 1,
      },
      patient,
    });
  }

  const legacy = await context.database.prepare(
    `SELECT id,patient_code_kind,patient_code_display,revision,updated_at
     FROM patient_handoffs
     WHERE practice_id=? AND patient_code_hash=?`,
  ).bind(
    context.user.practiceId,
    hash,
  ).first<LegacyReference>();

  return context.respond({
    found: false,
    resolvedKind: kind,
    ...(legacy
      ? {
          legacyHandoff: {
            id: legacy.id,
            kind: legacy.patient_code_kind,
            displayMask: legacy.patient_code_display,
            revision: legacy.revision,
            updatedAt: legacy.updated_at,
          },
        }
      : {}),
  }, legacy ? 200 : 404);
}

async function promoteLegacyHandoff(
  request: Request,
  context: PatientRecordV2RouteContext,
) {
  if (
    !can(context, "handoff.read") ||
    !can(context, "handoff.write")
  ) {
    return context.respond({ error: "permission_denied" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return context.respond({ error: "invalid_json" }, 400);
  }
  if (JSON.stringify(body).length > MAX_PAYLOAD_CHARS) {
    return context.respond(
      { error: "promotion_payload_too_large" },
      413,
    );
  }

  const legacyHandoffId = String(
    body.legacyHandoffId ?? "",
  ).trim();
  const expectedLegacyRevision = Number(
    body.expectedLegacyRevision,
  );
  if (
    !/^[A-Za-z0-9-]{8,80}$/.test(legacyHandoffId) ||
    !Number.isSafeInteger(expectedLegacyRevision) ||
    expectedLegacyRevision < 1
  ) {
    return context.respond(
      { error: "invalid_legacy_handoff_target" },
      422,
    );
  }

  const identifier = await normalizeIdentifier(
    context,
    body.identifier,
  );
  if (!identifier) {
    return context.respond(
      { error: "invalid_patient_identifier" },
      422,
    );
  }

  const legacy = await context.database.prepare(
    `SELECT id,patient_code_hash,patient_code_kind,patient_code_display,
            ciphertext,iv,auth_tag,status,revision,created_by,updated_by,
            created_at,updated_at
     FROM patient_handoffs
     WHERE practice_id=? AND id=?`,
  ).bind(
    context.user.practiceId,
    legacyHandoffId,
  ).first<LegacyPromotionRow>();
  if (!legacy) {
    return context.respond(
      { error: "legacy_handoff_not_found" },
      404,
    );
  }
  if (
    identifier.kind !== legacy.patient_code_kind ||
    identifier.hash !== legacy.patient_code_hash
  ) {
    return context.respond(
      { error: "LEGACY_HANDOFF_IDENTIFIER_MISMATCH" },
      409,
    );
  }

  const existingLink = await context.database.prepare(
    `SELECT l.patient_id,l.encounter_id
     FROM patient_handoff_legacy_links l
     JOIN patient_registry p ON p.id=l.patient_id
     JOIN patient_encounters e ON e.id=l.encounter_id
     WHERE l.legacy_handoff_id=?
       AND p.practice_id=?
       AND e.practice_id=?`,
  ).bind(
    legacyHandoffId,
    context.user.practiceId,
    context.user.practiceId,
  ).first<LegacyLinkRow>();
  if (existingLink) {
    return context.respond({
      legacyHandoffId,
      legacyRevision: legacy.revision,
      patientId: existingLink.patient_id,
      encounterId: existingLink.encounter_id,
      alreadyPromoted: true,
    });
  }

  if (legacy.revision !== expectedLegacyRevision) {
    return context.respond(
      {
        error: "LEGACY_HANDOFF_REVISION_CONFLICT",
        currentRevision: legacy.revision,
      },
      409,
    );
  }
  if (legacy.status === "reviewed") {
    return context.respond(
      { error: "LEGACY_HANDOFF_REVIEWED_LOCKED" },
      409,
    );
  }
  if (
    legacy.status !== "draft" &&
    legacy.status !== "ready_for_physician"
  ) {
    return context.respond(
      { error: "LEGACY_HANDOFF_STATUS_UNSUPPORTED" },
      409,
    );
  }

  const existingIdentifier = await context.database.prepare(
    `SELECT patient_id
     FROM patient_identifiers
     WHERE practice_id=? AND identifier_kind=? AND identifier_hash=?`,
  ).bind(
    context.user.practiceId,
    identifier.kind,
    identifier.hash,
  ).first<{ patient_id: string }>();
  if (existingIdentifier) {
    return context.respond(
      { error: "PATIENT_IDENTIFIER_EXISTS" },
      409,
    );
  }

  const payload = await decryptClinicalPayload<Record<string, unknown>>(
    {
      ciphertext: legacy.ciphertext,
      iv: legacy.iv,
      authTag: legacy.auth_tag,
    },
    context.clinicalSecret,
    `${context.user.practiceId}:${legacy.patient_code_hash}`,
  );
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return context.respond(
      { error: "legacy_handoff_decryption_failed" },
      500,
    );
  }

  const labs = payload.labs === undefined
    ? []
    : Array.isArray(payload.labs)
      ? payload.labs
      : null;
  const medications = payload.medications === undefined
    ? []
    : Array.isArray(payload.medications)
      ? payload.medications
      : null;
  if (!labs || !medications || labs.length > MAX_LABS) {
    return context.respond(
      { error: "LEGACY_HANDOFF_PAYLOAD_INVALID" },
      500,
    );
  }
  for (const rawLab of labs) {
    if (
      !rawLab ||
      typeof rawLab !== "object" ||
      Array.isArray(rawLab)
    ) {
      return context.respond(
        { error: "LEGACY_HANDOFF_PAYLOAD_INVALID" },
        500,
      );
    }
  }

  const snapshotObject: Record<string, unknown> = {
    ...payload,
    labs,
    medications,
    migrationProvenance: {
      source: "legacy_patient_handoff",
      legacyHandoffId,
      legacyRevision: legacy.revision,
      legacyStatus: legacy.status,
      legacyCreatedAt: legacy.created_at,
      legacyUpdatedAt: legacy.updated_at,
    },
  };
  if (JSON.stringify(snapshotObject).length > MAX_PAYLOAD_CHARS) {
    return context.respond(
      { error: "LEGACY_HANDOFF_PAYLOAD_INVALID" },
      500,
    );
  }

  const patientId = crypto.randomUUID();
  const encounterId = crypto.randomUUID();
  const migratedAt = nowIso();
  const encounterAt = normalizeEncounterTimestamp(
    legacy.updated_at,
    migratedAt,
  );
  if (!encounterAt) {
    return context.respond(
      { error: "LEGACY_HANDOFF_TIMESTAMP_INVALID" },
      500,
    );
  }
  const encryptedSnapshot = await encryptClinicalPayload(
    snapshotObject,
    context.clinicalSecret,
    snapshotAad(
      context.user.practiceId,
      encounterId,
      1,
    ),
  );

  const statements: D1PreparedStatement[] = [
    context.database.prepare(
      `INSERT INTO patient_registry
       (id,practice_id,status,created_at,updated_at,archived_at)
       VALUES (?,?,'active',?,?,NULL)`,
    ).bind(
      patientId,
      context.user.practiceId,
      migratedAt,
      migratedAt,
    ),
    ...(await identifierInsertStatements(
      context,
      patientId,
      [identifier],
      identifier.kind,
      migratedAt,
    )),
  ];

  const demographicsStatement = await demographicsInsertStatement(
    context,
    patientId,
    {
      firstName: payload.firstName,
      lastName: payload.lastName,
    },
    migratedAt,
  );
  if (demographicsStatement) {
    statements.push(demographicsStatement);
  }

  statements.push(
    context.database.prepare(
      `INSERT INTO patient_encounters
       (id,patient_id,practice_id,encounter_at,encounter_kind,source,status,
        created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      encounterId,
      patientId,
      context.user.practiceId,
      encounterAt,
      "outpatient",
      "care_team",
      legacy.status,
      context.user.id,
      context.user.id,
      migratedAt,
      migratedAt,
    ),
    context.database.prepare(
      `INSERT INTO patient_encounter_snapshots
       (id,encounter_id,patient_id,practice_id,revision,snapshot_kind,
        payload_ciphertext,payload_iv,payload_auth_tag,schema_version,
        created_by,created_at)
       VALUES (?,?,?,?,1,'care_team',?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      encounterId,
      patientId,
      context.user.practiceId,
      encryptedSnapshot.ciphertext,
      encryptedSnapshot.iv,
      encryptedSnapshot.authTag,
      "patient-record-v2",
      context.user.id,
      migratedAt,
    ),
  );

  let observationCount = 0;
  for (const rawLab of labs) {
    const lab = rawLab as Record<string, unknown>;
    const observationId = crypto.randomUUID();
    const time = canonicalObservationTime(
      lab.observedAt,
      encounterAt,
    );
    const verification = String(
      lab.verification ?? "unverified",
    );
    const safeVerification =
      verification === "confirmed" ||
      verification === "rejected"
        ? verification
        : "unverified";
    const encrypted = await encryptClinicalPayload(
      {
        ...lab,
        sourceObservedAt:
          String(lab.observedAt ?? "").trim() || undefined,
        observedAtBasis: time.basis,
      },
      context.clinicalSecret,
      observationAad(
        context.user.practiceId,
        observationId,
      ),
    );
    statements.push(
      context.database.prepare(
        `INSERT INTO patient_observations
         (id,encounter_id,patient_id,practice_id,snapshot_revision,
          canonical_key,observed_at,verification,payload_ciphertext,payload_iv,
          payload_auth_tag,schema_version,created_by,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        observationId,
        encounterId,
        patientId,
        context.user.practiceId,
        1,
        observationIndexKey(
          lab.canonicalKey,
          lab.rawName,
        ),
        time.observedAt,
        safeVerification,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        "observation-v1",
        context.user.id,
        migratedAt,
      ),
    );
    observationCount += 1;
  }

  if (identifier.kind === "file_number") {
    const numericFile = parseNumericFileNumber(
      identifier.normalized,
    );
    if (numericFile) {
      const numericValue = numericFile.number.toString();
      statements.push(
        context.database.prepare(
          `UPDATE patient_file_number_allocators
           SET last_allocated_number=CAST(? AS INTEGER),
               display_width=CASE WHEN display_width < ? THEN ? ELSE display_width END,
               updated_by=?,updated_at=?
           WHERE practice_id=?
             AND allocation_status='ready'
             AND CAST(last_allocated_number AS INTEGER) < CAST(? AS INTEGER)`,
        ).bind(
          numericValue,
          numericFile.width,
          numericFile.width,
          context.user.id,
          migratedAt,
          context.user.practiceId,
          numericValue,
        ),
      );
    }
  }

  statements.push(
    context.database.prepare(
      `INSERT INTO patient_handoff_legacy_links
       (legacy_handoff_id,patient_id,encounter_id,migrated_at)
       VALUES (?,?,?,?)`,
    ).bind(
      legacyHandoffId,
      patientId,
      encounterId,
      migratedAt,
    ),
  );

  try {
    await context.database.batch(statements);
  } catch (error) {
    const racedLink = await context.database.prepare(
      `SELECT l.patient_id,l.encounter_id
       FROM patient_handoff_legacy_links l
       JOIN patient_registry p ON p.id=l.patient_id
       JOIN patient_encounters e ON e.id=l.encounter_id
       WHERE l.legacy_handoff_id=?
         AND p.practice_id=?
         AND e.practice_id=?`,
    ).bind(
      legacyHandoffId,
      context.user.practiceId,
      context.user.practiceId,
    ).first<LegacyLinkRow>();
    if (racedLink) {
      return context.respond({
        legacyHandoffId,
        legacyRevision: legacy.revision,
        patientId: racedLink.patient_id,
        encounterId: racedLink.encounter_id,
        alreadyPromoted: true,
      });
    }
    const racedIdentifier = await context.database.prepare(
      `SELECT patient_id
       FROM patient_identifiers
       WHERE practice_id=? AND identifier_kind=? AND identifier_hash=?`,
    ).bind(
      context.user.practiceId,
      identifier.kind,
      identifier.hash,
    ).first<{ patient_id: string }>();
    if (racedIdentifier) {
      return context.respond(
        { error: "PATIENT_IDENTIFIER_EXISTS" },
        409,
      );
    }
    throw error;
  }

  await context.audit(
    "patient.legacy_handoff_promoted",
    "patient_handoff",
    legacyHandoffId,
    {
      patientId,
      encounterId,
      legacyRevision: legacy.revision,
      observationCount,
    },
  );
  return context.respond({
    legacyHandoffId,
    legacyRevision: legacy.revision,
    patientId,
    encounterId,
    alreadyPromoted: false,
  }, 201);
}

function conflictResponse(
  context: PatientRecordV2RouteContext,
  conflict: Awaited<ReturnType<typeof firstConflict>>,
) {
  if (!conflict) return null;

  if (conflict.conflict.source === "patient_record_v2") {
    return context.respond(
      {
        error: "PATIENT_IDENTIFIER_EXISTS",
        kind: conflict.identifier.kind,
        ...(can(context, "handoff.read")
          ? {
              existingPatientId:
                conflict.conflict.patientId,
            }
          : {}),
      },
      409,
    );
  }

  return context.respond(
    {
      error: "PATIENT_IDENTIFIER_LEGACY_EXISTS",
      kind: conflict.identifier.kind,
      ...(can(context, "handoff.read")
        ? {
            legacyHandoffId:
              conflict.conflict.legacy.id,
          }
        : {}),
    },
    409,
  );
}

async function createPatientManual(
  context: PatientRecordV2RouteContext,
  identifiers: NormalizedIdentifier[],
  demographics: unknown,
) {
  const numericFile = identifiers.find(
    (item) =>
      item.kind === "file_number" &&
      parseNumericFileNumber(item.normalized),
  );
  if (numericFile) {
    const allocator = await readAllocator(context);
    if (
      !allocator ||
      allocator.allocation_status !== "ready"
    ) {
      return context.respond(
        {
          error: "FILE_NUMBER_ALLOCATOR_UNINITIALIZED",
          allocator: allocatorPublicState(allocator),
        },
        409,
      );
    }
  }

  const conflict = await firstConflict(
    context,
    identifiers,
  );
  if (conflict) return conflictResponse(context, conflict)!;

  const patientId = crypto.randomUUID();
  const createdAt = nowIso();
  const primaryKind =
    identifiers.find((item) => item.kind === "national_id")
      ?.kind ??
    identifiers.find((item) => item.isPrimary)?.kind ??
    identifiers[0]!.kind;

  const statements: D1PreparedStatement[] = [
    context.database.prepare(
      `INSERT INTO patient_registry
       (id,practice_id,status,created_at,updated_at,archived_at)
       VALUES (?,?,'active',?,?,NULL)`,
    ).bind(
      patientId,
      context.user.practiceId,
      createdAt,
      createdAt,
    ),
    ...(await identifierInsertStatements(
      context,
      patientId,
      identifiers,
      primaryKind,
      createdAt,
    )),
  ];

  const demographicsInsert =
    await demographicsInsertStatement(
      context,
      patientId,
      demographics,
      createdAt,
    );
  if (demographicsInsert) statements.push(demographicsInsert);

  if (numericFile) {
    const parsed = parseNumericFileNumber(
      numericFile.normalized,
    )!;
    statements.push(
      context.database.prepare(
        `UPDATE patient_file_number_allocators
         SET last_allocated_number=
           CASE
             WHEN last_allocated_number < CAST(? AS INTEGER)
             THEN CAST(? AS INTEGER)
             ELSE last_allocated_number
           END,
           display_width=
           CASE WHEN display_width < ? THEN ? ELSE display_width END,
           updated_by=?,updated_at=?
         WHERE practice_id=? AND allocation_status='ready'`,
      ).bind(
        parsed.number.toString(),
        parsed.number.toString(),
        parsed.width,
        parsed.width,
        context.user.id,
        createdAt,
        context.user.practiceId,
      ),
    );
  }

  try {
    await context.database.batch(statements);
  } catch (error) {
    const raced = await firstConflict(
      context,
      identifiers,
    );
    if (raced) return conflictResponse(context, raced)!;
    throw error;
  }

  await context.audit(
    "patient.created",
    "patient",
    patientId,
    {
      identifierKinds: identifiers.map((item) => item.kind),
      allocatedFileNumber: false,
    },
  );

  return context.respond({
    patient: await readPatientSummary(context, patientId),
    allocator:
      allocatorPublicState(await readAllocator(context)),
  }, 201);
}

async function createPatientAllocated(
  context: PatientRecordV2RouteContext,
  identifiers: NormalizedIdentifier[],
  demographics: unknown,
) {
  const conflict = await firstConflict(
    context,
    identifiers,
  );
  if (conflict) return conflictResponse(context, conflict)!;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const allocator = await readAllocator(context);
    if (
      !allocator ||
      allocator.allocation_status !== "ready" ||
      allocator.last_allocated_number === null
    ) {
      return context.respond(
        {
          error: "FILE_NUMBER_ALLOCATOR_UNINITIALIZED",
          allocator: allocatorPublicState(allocator),
        },
        409,
      );
    }

    const code = nextNumericFileNumber(
      allocator.last_allocated_number,
      allocator.display_width,
    );
    if (!code) {
      return context.respond(
        { error: "FILE_NUMBER_ALLOCATOR_EXHAUSTED" },
        409,
      );
    }

    const allocated = await normalizeIdentifier(
      context,
      { kind: "file_number", value: code },
    );
    if (!allocated) {
      return context.respond(
        { error: "FILE_NUMBER_ALLOCATION_FAILED" },
        500,
      );
    }

    if (await findConflict(context, allocated)) {
      return context.respond(
        {
          error: "FILE_NUMBER_ALLOCATOR_OUT_OF_SYNC",
          candidate: code,
          allocator: allocatorPublicState(allocator),
        },
        409,
      );
    }

    const patientId = crypto.randomUUID();
    const createdAt = nowIso();
    const allIdentifiers = [...identifiers, allocated];
    const primaryKind =
      allIdentifiers.find(
        (item) => item.kind === "national_id",
      )?.kind ?? "file_number";

    const statements: D1PreparedStatement[] = [
      context.database.prepare(
        `UPDATE patient_file_number_allocators
         SET last_allocated_number=CAST(? AS INTEGER),
             updated_by=?,updated_at=?
         WHERE practice_id=?
           AND allocation_status='ready'
           AND CAST(last_allocated_number AS TEXT)=?`,
      ).bind(
        BigInt(code).toString(),
        context.user.id,
        createdAt,
        context.user.practiceId,
        BigInt(allocator.last_allocated_number).toString(),
      ),
      context.database.prepare(
        `INSERT INTO patient_registry
         (id,practice_id,status,created_at,updated_at,archived_at)
         SELECT ?,?,'active',?,?,NULL
         WHERE EXISTS (
           SELECT 1
           FROM patient_file_number_allocators
           WHERE practice_id=?
             AND allocation_status='ready'
             AND CAST(last_allocated_number AS TEXT)=?
         )`,
      ).bind(
        patientId,
        context.user.practiceId,
        createdAt,
        createdAt,
        context.user.practiceId,
        BigInt(code).toString(),
      ),
      ...(await identifierInsertStatements(
        context,
        patientId,
        allIdentifiers,
        primaryKind,
        createdAt,
      )),
    ];

    const demographicsInsert =
      await demographicsInsertStatement(
        context,
        patientId,
        demographics,
        createdAt,
      );
    if (demographicsInsert) statements.push(demographicsInsert);

    try {
      await context.database.batch(statements);

      await context.audit(
        "patient.created",
        "patient",
        patientId,
        {
          identifierKinds:
            allIdentifiers.map((item) => item.kind),
          allocatedFileNumber: true,
        },
      );

      return context.respond({
        patient: await readPatientSummary(
          context,
          patientId,
        ),
        assignedFileNumber: code,
        allocator:
          allocatorPublicState(await readAllocator(context)),
      }, 201);
    } catch (error) {
      const explicitRace = await firstConflict(
        context,
        identifiers,
      );
      if (explicitRace) {
        return conflictResponse(context, explicitRace)!;
      }

      const latest = await readAllocator(context);
      if (
        latest?.last_allocated_number !==
        allocator.last_allocated_number
      ) {
        continue;
      }
      throw error;
    }
  }

  return context.respond(
    {
      error: "FILE_NUMBER_ALLOCATION_RETRY_REQUIRED",
      allocator:
        allocatorPublicState(await readAllocator(context)),
    },
    409,
  );
}


async function createCareTeamPatientIntake(
  request: Request,
  context: PatientRecordV2RouteContext,
) {
  if (
    context.user.role !== "assistant" ||
    !can(context, "handoff.write")
  ) {
    return context.respond({ error: "assistant_required" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return context.respond({ error: "invalid_json" }, 400);
  }

  if (JSON.stringify(body).length > MAX_PAYLOAD_CHARS) {
    return context.respond(
      { error: "care_team_intake_payload_too_large" },
      413,
    );
  }

  const identifier = await normalizeIdentifier(
    context,
    body.identifier,
  );
  if (!identifier) {
    return context.respond(
      { error: "invalid_patient_identifier" },
      422,
    );
  }

  const numericFile =
    identifier.kind === "file_number"
      ? parseNumericFileNumber(identifier.normalized)
      : null;
  if (numericFile) {
    const allocator = await readAllocator(context);
    if (
      !allocator ||
      allocator.allocation_status !== "ready"
    ) {
      return context.respond(
        {
          error: "FILE_NUMBER_ALLOCATOR_UNINITIALIZED",
          allocator: allocatorPublicState(allocator),
        },
        409,
      );
    }
  }

  const conflict = await findConflict(context, identifier);
  if (conflict) {
    return conflictResponse(context, {
      identifier,
      conflict,
    })!;
  }

  const snapshot = body.snapshot;
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot)
  ) {
    return context.respond(
      { error: "invalid_encounter_snapshot" },
      422,
    );
  }
  const snapshotObject =
    snapshot as Record<string, unknown>;
  const labs = snapshotObject.labs === undefined
    ? []
    : Array.isArray(snapshotObject.labs)
      ? snapshotObject.labs
      : null;
  if (!labs || labs.length > MAX_LABS) {
    return context.respond(
      { error: "too_many_laboratory_observations" },
      422,
    );
  }
  for (const rawLab of labs) {
    if (
      !rawLab ||
      typeof rawLab !== "object" ||
      Array.isArray(rawLab)
    ) {
      return context.respond(
        { error: "invalid_laboratory_observation" },
        422,
      );
    }
  }

  const currentTime = nowIso();
  const encounterAt = normalizeEncounterTimestamp(
    body.encounterAt,
    currentTime,
  );
  if (!encounterAt) {
    return context.respond(
      { error: "invalid_encounter_at" },
      422,
    );
  }

  const encounterKind = String(
    body.encounterKind ?? "outpatient",
  );
  if (
    !["outpatient", "telehealth", "other"].includes(
      encounterKind,
    )
  ) {
    return context.respond(
      { error: "invalid_encounter_kind" },
      422,
    );
  }

  const patientId = crypto.randomUUID();
  const encounterId = crypto.randomUUID();
  const encryptedSnapshot = await encryptClinicalPayload(
    snapshotObject,
    context.clinicalSecret,
    snapshotAad(
      context.user.practiceId,
      encounterId,
      1,
    ),
  );

  const statements: D1PreparedStatement[] = [
    context.database.prepare(
      `INSERT INTO patient_registry
       (id,practice_id,status,created_at,updated_at,archived_at)
       VALUES (?,?,'active',?,?,NULL)`,
    ).bind(
      patientId,
      context.user.practiceId,
      currentTime,
      currentTime,
    ),
    ...(await identifierInsertStatements(
      context,
      patientId,
      [identifier],
      identifier.kind,
      currentTime,
    )),
  ];

  let demographicsStatement: D1PreparedStatement | null;
  try {
    demographicsStatement =
      await demographicsInsertStatement(
        context,
        patientId,
        body.demographics,
        currentTime,
      );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "INVALID_DATE_OF_BIRTH"
    ) {
      return context.respond(
        { error: "invalid_date_of_birth" },
        422,
      );
    }
    throw error;
  }
  if (demographicsStatement) {
    statements.push(demographicsStatement);
  }

  if (numericFile) {
    const numericValue = numericFile.number.toString();
    statements.push(
      context.database.prepare(
        `UPDATE patient_file_number_allocators
         SET last_allocated_number=
           CASE
             WHEN last_allocated_number < CAST(? AS INTEGER)
             THEN CAST(? AS INTEGER)
             ELSE last_allocated_number
           END,
           display_width=
           CASE WHEN display_width < ? THEN ? ELSE display_width END,
           updated_by=?,updated_at=?
         WHERE practice_id=? AND allocation_status='ready'`,
      ).bind(
        numericValue,
        numericValue,
        numericFile.width,
        numericFile.width,
        context.user.id,
        currentTime,
        context.user.practiceId,
      ),
    );
  }

  statements.push(
    context.database.prepare(
      `INSERT INTO patient_encounters
       (id,patient_id,practice_id,encounter_at,encounter_kind,source,status,
        created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,'care_team','ready_for_physician',?,?,?,?)`,
    ).bind(
      encounterId,
      patientId,
      context.user.practiceId,
      encounterAt,
      encounterKind,
      context.user.id,
      context.user.id,
      currentTime,
      currentTime,
    ),
    context.database.prepare(
      `INSERT INTO patient_encounter_snapshots
       (id,encounter_id,patient_id,practice_id,revision,snapshot_kind,
        payload_ciphertext,payload_iv,payload_auth_tag,schema_version,
        created_by,created_at)
       VALUES (?,?,?,?,1,'care_team',?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      encounterId,
      patientId,
      context.user.practiceId,
      encryptedSnapshot.ciphertext,
      encryptedSnapshot.iv,
      encryptedSnapshot.authTag,
      "patient-record-v2",
      context.user.id,
      currentTime,
    ),
  );

  let observationCount = 0;
  for (const rawLab of labs) {
    const lab = rawLab as Record<string, unknown>;
    const observationId = crypto.randomUUID();
    const time = canonicalObservationTime(
      lab.observedAt,
      encounterAt,
    );
    const verification = String(
      lab.verification ?? "unverified",
    );
    const safeVerification =
      verification === "confirmed" ||
      verification === "rejected"
        ? verification
        : "unverified";
    const encrypted = await encryptClinicalPayload(
      {
        ...lab,
        sourceObservedAt:
          String(lab.observedAt ?? "").trim() ||
          undefined,
        observedAtBasis: time.basis,
      },
      context.clinicalSecret,
      observationAad(
        context.user.practiceId,
        observationId,
      ),
    );
    statements.push(
      context.database.prepare(
        `INSERT INTO patient_observations
         (id,encounter_id,patient_id,practice_id,snapshot_revision,
          canonical_key,observed_at,verification,payload_ciphertext,payload_iv,
          payload_auth_tag,schema_version,created_by,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        observationId,
        encounterId,
        patientId,
        context.user.practiceId,
        1,
        observationIndexKey(
          lab.canonicalKey,
          lab.rawName,
        ),
        time.observedAt,
        safeVerification,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        "observation-v1",
        context.user.id,
        currentTime,
      ),
    );
    observationCount += 1;
  }

  try {
    await context.database.batch(statements);
  } catch (error) {
    const raced = await findConflict(context, identifier);
    if (raced) {
      return conflictResponse(context, {
        identifier,
        conflict: raced,
      })!;
    }
    throw error;
  }

  await context.audit(
    "patient.created",
    "patient",
    patientId,
    {
      identifierKinds: [identifier.kind],
      allocatedFileNumber: false,
      careTeamAtomicIntake: true,
    },
  );
  await context.audit(
    "patient.encounter_created",
    "patient_encounter",
    encounterId,
    {
      patientId,
      source: "care_team",
      status: "ready_for_physician",
      observationCount,
      careTeamAtomicIntake: true,
    },
  );

  const patient = await readPatientSummary(
    context,
    patientId,
  );
  if (!patient) {
    throw new Error(
      "CARE_TEAM_INTAKE_PATIENT_READBACK_FAILED",
    );
  }

  return context.respond({
    patient,
    encounter: {
      encounterId,
      patientId,
      encounterAt,
      encounterKind,
      source: "care_team",
      status: "ready_for_physician",
      latestSnapshotRevision: 1,
    },
    observationCount,
    allocator:
      allocatorPublicState(await readAllocator(context)),
  }, 201);
}

async function createPatient(
  request: Request,
  context: PatientRecordV2RouteContext,
) {
  if (!can(context, "handoff.write")) {
    return context.respond({ error: "permission_denied" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return context.respond({ error: "invalid_json" }, 400);
  }
  if (JSON.stringify(body).length > MAX_PAYLOAD_CHARS) {
    return context.respond(
      { error: "patient_payload_too_large" },
      413,
    );
  }

  const normalized = await normalizeIdentifierList(
    context,
    body.identifiers,
  );
  if ("error" in normalized) {
    return context.respond({ error: normalized.error }, 422);
  }

  const allocate = body.allocateFileNumber === true;
  if (
    allocate &&
    normalized.identifiers.some(
      (item) => item.kind === "file_number",
    )
  ) {
    return context.respond(
      {
        error:
          "allocate_file_number_conflicts_with_explicit_file_number",
      },
      422,
    );
  }
  if (!allocate && normalized.identifiers.length === 0) {
    return context.respond(
      { error: "patient_identifier_required" },
      422,
    );
  }

  try {
    return await (
      allocate
        ? createPatientAllocated(
            context,
            normalized.identifiers,
            body.demographics,
          )
        : createPatientManual(
            context,
            normalized.identifiers,
            body.demographics,
          )
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "INVALID_DATE_OF_BIRTH"
    ) {
      return context.respond(
        { error: "invalid_date_of_birth" },
        422,
      );
    }
    throw error;
  }
}


async function readPatientIdentifierKinds(
  context: PatientRecordV2RouteContext,
  patientId: string,
) {
  const rows = await context.database.prepare(
    `SELECT identifier_kind,is_primary
     FROM patient_identifiers
     WHERE practice_id=? AND patient_id=?`,
  ).bind(
    context.user.practiceId,
    patientId,
  ).all<{
    identifier_kind: PatientIdentifierKind;
    is_primary: number;
  }>();

  return rows.results;
}

async function attachPatientIdentifierManual(
  context: PatientRecordV2RouteContext,
  patientId: string,
  identifier: NormalizedIdentifier,
  existingKinds: Array<{
    identifier_kind: PatientIdentifierKind;
    is_primary: number;
  }>,
) {
  const numericFile =
    identifier.kind === "file_number"
      ? parseNumericFileNumber(identifier.normalized)
      : null;

  if (numericFile) {
    const allocator = await readAllocator(context);
    if (
      !allocator ||
      allocator.allocation_status !== "ready"
    ) {
      return context.respond(
        {
          error: "FILE_NUMBER_ALLOCATOR_UNINITIALIZED",
          allocator: allocatorPublicState(allocator),
        },
        409,
      );
    }
  }

  const conflict = await findConflict(context, identifier);
  if (conflict) {
    return conflictResponse(
      context,
      { identifier, conflict },
    )!;
  }

  const createdAt = nowIso();
  const row = await encryptedIdentifierRow(
    context,
    patientId,
    identifier,
    createdAt,
  );
  const hasNationalId =
    identifier.kind === "national_id" ||
    existingKinds.some(
      (item) => item.identifier_kind === "national_id",
    );
  const makePrimary =
    identifier.kind === "national_id" ||
    (
      !hasNationalId &&
      identifier.kind === "file_number"
    ) ||
    !existingKinds.some((item) => item.is_primary === 1);

  const statements: D1PreparedStatement[] = [];

  if (makePrimary) {
    statements.push(
      context.database.prepare(
        `UPDATE patient_identifiers
         SET is_primary=0,updated_at=?
         WHERE practice_id=? AND patient_id=?`,
      ).bind(
        createdAt,
        context.user.practiceId,
        patientId,
      ),
    );
  }

  statements.push(
    context.database.prepare(
      `INSERT INTO patient_identifiers
       (id,patient_id,practice_id,identifier_kind,identifier_hash,
        value_ciphertext,value_iv,value_auth_tag,display_mask,is_primary,
        created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      row.id,
      row.patientId,
      row.practiceId,
      row.kind,
      row.hash,
      row.ciphertext,
      row.iv,
      row.authTag,
      row.displayMask,
      makePrimary ? 1 : 0,
      row.createdAt,
      row.createdAt,
    ),
  );

  if (numericFile) {
    statements.push(
      context.database.prepare(
        `UPDATE patient_file_number_allocators
         SET last_allocated_number=
           CASE
             WHEN last_allocated_number < CAST(? AS INTEGER)
             THEN CAST(? AS INTEGER)
             ELSE last_allocated_number
           END,
           display_width=
           CASE WHEN display_width < ? THEN ? ELSE display_width END,
           updated_by=?,updated_at=?
         WHERE practice_id=? AND allocation_status='ready'`,
      ).bind(
        numericFile.number.toString(),
        numericFile.number.toString(),
        numericFile.width,
        numericFile.width,
        context.user.id,
        createdAt,
        context.user.practiceId,
      ),
    );
  }

  try {
    await context.database.batch(statements);
  } catch (error) {
    const raced = await findConflict(context, identifier);
    if (raced) {
      return conflictResponse(
        context,
        { identifier, conflict: raced },
      )!;
    }
    throw error;
  }

  await context.audit(
    "patient.identifier_attached",
    "patient",
    patientId,
    {
      identifierKind: identifier.kind,
      primary: makePrimary,
      allocatedFileNumber: false,
    },
  );

  return context.respond({
    patient: await readPatientSummary(context, patientId),
    ...(identifier.kind === "file_number"
      ? { assignedFileNumber: identifier.normalized }
      : {}),
    allocator:
      allocatorPublicState(await readAllocator(context)),
  }, 201);
}

async function attachPatientIdentifierAllocated(
  context: PatientRecordV2RouteContext,
  patientId: string,
  existingKinds: Array<{
    identifier_kind: PatientIdentifierKind;
    is_primary: number;
  }>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const allocator = await readAllocator(context);
    if (
      !allocator ||
      allocator.allocation_status !== "ready" ||
      allocator.last_allocated_number === null
    ) {
      return context.respond(
        {
          error: "FILE_NUMBER_ALLOCATOR_UNINITIALIZED",
          allocator: allocatorPublicState(allocator),
        },
        409,
      );
    }

    const code = nextNumericFileNumber(
      allocator.last_allocated_number,
      allocator.display_width,
    );
    if (!code) {
      return context.respond(
        { error: "FILE_NUMBER_ALLOCATOR_EXHAUSTED" },
        409,
      );
    }

    const identifier = await normalizeIdentifier(
      context,
      { kind: "file_number", value: code },
    );
    if (!identifier) {
      return context.respond(
        { error: "FILE_NUMBER_ALLOCATION_FAILED" },
        500,
      );
    }

    if (await findConflict(context, identifier)) {
      return context.respond(
        {
          error: "FILE_NUMBER_ALLOCATOR_OUT_OF_SYNC",
          candidate: code,
          allocator: allocatorPublicState(allocator),
        },
        409,
      );
    }

    const createdAt = nowIso();
    const row = await encryptedIdentifierRow(
      context,
      patientId,
      identifier,
      createdAt,
    );
    const hasNationalId = existingKinds.some(
      (item) => item.identifier_kind === "national_id",
    );
    const makePrimary =
      !hasNationalId &&
      (
        existingKinds.length === 0 ||
        !existingKinds.some(
          (item) => item.identifier_kind === "file_number",
        )
      );

    const statements: D1PreparedStatement[] = [
      context.database.prepare(
        `UPDATE patient_file_number_allocators
         SET last_allocated_number=CAST(? AS INTEGER),
             updated_by=?,updated_at=?
         WHERE practice_id=?
           AND allocation_status='ready'
           AND CAST(last_allocated_number AS TEXT)=?`,
      ).bind(
        BigInt(code).toString(),
        context.user.id,
        createdAt,
        context.user.practiceId,
        BigInt(allocator.last_allocated_number).toString(),
      ),
    ];

    if (makePrimary) {
      statements.push(
        context.database.prepare(
          `UPDATE patient_identifiers
           SET is_primary=0,updated_at=?
           WHERE practice_id=? AND patient_id=?
             AND EXISTS (
               SELECT 1
               FROM patient_file_number_allocators
               WHERE practice_id=?
                 AND allocation_status='ready'
                 AND CAST(last_allocated_number AS TEXT)=?
             )`,
        ).bind(
          createdAt,
          context.user.practiceId,
          patientId,
          context.user.practiceId,
          BigInt(code).toString(),
        ),
      );
    }

    statements.push(
      context.database.prepare(
        `INSERT INTO patient_identifiers
         (id,patient_id,practice_id,identifier_kind,identifier_hash,
          value_ciphertext,value_iv,value_auth_tag,display_mask,is_primary,
          created_at,updated_at)
         SELECT ?,?,?,?,?,?,?,?,?,?,?,?
         WHERE EXISTS (
           SELECT 1
           FROM patient_file_number_allocators
           WHERE practice_id=?
             AND allocation_status='ready'
             AND CAST(last_allocated_number AS TEXT)=?
         )`,
      ).bind(
        row.id,
        row.patientId,
        row.practiceId,
        row.kind,
        row.hash,
        row.ciphertext,
        row.iv,
        row.authTag,
        row.displayMask,
        makePrimary ? 1 : 0,
        row.createdAt,
        row.createdAt,
        context.user.practiceId,
        BigInt(code).toString(),
      ),
    );

    try {
      await context.database.batch(statements);
    } catch (error) {
      const raced = await findConflict(context, identifier);
      if (raced) {
        return context.respond(
          {
            error: "FILE_NUMBER_ALLOCATOR_OUT_OF_SYNC",
            candidate: code,
            allocator:
              allocatorPublicState(await readAllocator(context)),
          },
          409,
        );
      }
      throw error;
    }

    const inserted = await context.database.prepare(
      `SELECT id
       FROM patient_identifiers
       WHERE practice_id=? AND patient_id=? AND id=?`,
    ).bind(
      context.user.practiceId,
      patientId,
      row.id,
    ).first<{ id: string }>();

    if (!inserted) {
      const latest = await readAllocator(context);
      if (
        latest?.last_allocated_number !==
        allocator.last_allocated_number
      ) {
        continue;
      }
      throw new Error("FILE_NUMBER_ALLOCATION_INTEGRITY_ERROR");
    }

    await context.audit(
      "patient.identifier_attached",
      "patient",
      patientId,
      {
        identifierKind: "file_number",
        primary: makePrimary,
        allocatedFileNumber: true,
      },
    );

    return context.respond({
      patient: await readPatientSummary(context, patientId),
      assignedFileNumber: code,
      allocator:
        allocatorPublicState(await readAllocator(context)),
    }, 201);
  }

  return context.respond(
    {
      error: "FILE_NUMBER_ALLOCATION_RETRY_REQUIRED",
      allocator:
        allocatorPublicState(await readAllocator(context)),
    },
    409,
  );
}

async function attachPatientIdentifier(
  request: Request,
  context: PatientRecordV2RouteContext,
  patientId: string,
) {
  if (!can(context, "handoff.write")) {
    return context.respond({ error: "permission_denied" }, 403);
  }
  if (!validPatientId(patientId)) {
    return context.respond({ error: "invalid_patient_id" }, 422);
  }

  const patient = await context.database.prepare(
    `SELECT id,status
     FROM patient_registry
     WHERE practice_id=? AND id=?`,
  ).bind(
    context.user.practiceId,
    patientId,
  ).first<PatientRow>();

  if (!patient) {
    return context.respond({ error: "patient_not_found" }, 404);
  }
  if (patient.status !== "active") {
    return context.respond({ error: "patient_archived" }, 409);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return context.respond({ error: "invalid_json" }, 400);
  }

  const allocateFileNumber =
    body.allocateFileNumber === true;
  if (
    allocateFileNumber &&
    body.identifier !== undefined
  ) {
    return context.respond(
      {
        error:
          "allocate_file_number_conflicts_with_explicit_identifier",
      },
      422,
    );
  }
  if (
    !allocateFileNumber &&
    body.identifier === undefined
  ) {
    return context.respond(
      { error: "patient_identifier_required" },
      422,
    );
  }

  const existingKinds =
    await readPatientIdentifierKinds(
      context,
      patientId,
    );

  if (
    allocateFileNumber &&
    existingKinds.some(
      (item) => item.identifier_kind === "file_number",
    )
  ) {
    return context.respond(
      { error: "PATIENT_IDENTIFIER_KIND_EXISTS" },
      409,
    );
  }

  if (allocateFileNumber) {
    return attachPatientIdentifierAllocated(
      context,
      patientId,
      existingKinds,
    );
  }

  const identifier = await normalizeIdentifier(
    context,
    body.identifier,
  );
  if (!identifier) {
    return context.respond(
      { error: "invalid_patient_identifier" },
      422,
    );
  }
  if (
    existingKinds.some(
      (item) => item.identifier_kind === identifier.kind,
    )
  ) {
    return context.respond(
      { error: "PATIENT_IDENTIFIER_KIND_EXISTS" },
      409,
    );
  }

  return attachPatientIdentifierManual(
    context,
    patientId,
    identifier,
    existingKinds,
  );
}


function canonicalObservationTime(
  rawObservedAt: unknown,
  encounterAt: string,
) {
  const raw = String(rawObservedAt ?? "").trim();
  if (raw) {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      return {
        observedAt: new Date(parsed).toISOString(),
        basis: "source_timestamp" as const,
      };
    }
  }

  return {
    observedAt: encounterAt,
    basis: "encounter_fallback" as const,
  };
}

async function createEncounter(
  request: Request,
  context: PatientRecordV2RouteContext,
  patientId: string,
) {
  if (!can(context, "handoff.write")) {
    return context.respond({ error: "permission_denied" }, 403);
  }
  if (!validPatientId(patientId)) {
    return context.respond({ error: "invalid_patient_id" }, 422);
  }

  const patient = await context.database.prepare(
    `SELECT id,status
     FROM patient_registry
     WHERE practice_id=? AND id=?`,
  ).bind(
    context.user.practiceId,
    patientId,
  ).first<PatientRow>();
  if (!patient) {
    return context.respond({ error: "patient_not_found" }, 404);
  }
  if (patient.status !== "active") {
    return context.respond({ error: "patient_archived" }, 409);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return context.respond({ error: "invalid_json" }, 400);
  }
  if (JSON.stringify(body).length > MAX_PAYLOAD_CHARS) {
    return context.respond(
      { error: "encounter_payload_too_large" },
      413,
    );
  }

  const currentTime = nowIso();
  const encounterAt = normalizeEncounterTimestamp(
    body.encounterAt,
    currentTime,
  );
  if (!encounterAt) {
    return context.respond(
      { error: "invalid_encounter_at" },
      422,
    );
  }

  const encounterKind = String(
    body.encounterKind ?? "outpatient",
  );
  if (
    !["outpatient", "telehealth", "other"].includes(
      encounterKind,
    )
  ) {
    return context.respond(
      { error: "invalid_encounter_kind" },
      422,
    );
  }

  const defaultStatus =
    context.user.role === "assistant"
      ? "ready_for_physician"
      : "draft";
  const status = String(body.status ?? defaultStatus);
  const allowedStatuses =
    context.user.role === "assistant"
      ? ["draft", "ready_for_physician"]
      : ["draft", "reviewed", "completed"];
  if (!allowedStatuses.includes(status)) {
    return context.respond(
      { error: "invalid_encounter_status" },
      422,
    );
  }

  const source =
    context.user.role === "assistant"
      ? "care_team"
      : "physician";
  const snapshotKind =
    context.user.role === "assistant"
      ? "care_team"
      : "physician_review";
  const encounterId = crypto.randomUUID();

  const statements: D1PreparedStatement[] = [
    context.database.prepare(
      `INSERT INTO patient_encounters
       (id,patient_id,practice_id,encounter_at,encounter_kind,source,status,
        created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      encounterId,
      patientId,
      context.user.practiceId,
      encounterAt,
      encounterKind,
      source,
      status,
      context.user.id,
      context.user.id,
      currentTime,
      currentTime,
    ),
  ];

  const snapshot = body.snapshot;
  let observationCount = 0;
  if (snapshot !== undefined) {
    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      Array.isArray(snapshot)
    ) {
      return context.respond(
        { error: "invalid_encounter_snapshot" },
        422,
      );
    }

    const snapshotObject =
      snapshot as Record<string, unknown>;
    const labs = Array.isArray(snapshotObject.labs)
      ? snapshotObject.labs
      : [];
    if (labs.length > MAX_LABS) {
      return context.respond(
        { error: "too_many_laboratory_observations" },
        422,
      );
    }

    const snapshotId = crypto.randomUUID();
    const encryptedSnapshot = await encryptClinicalPayload(
      snapshotObject,
      context.clinicalSecret,
      snapshotAad(
        context.user.practiceId,
        encounterId,
        1,
      ),
    );
    statements.push(
      context.database.prepare(
        `INSERT INTO patient_encounter_snapshots
         (id,encounter_id,patient_id,practice_id,revision,snapshot_kind,
          payload_ciphertext,payload_iv,payload_auth_tag,schema_version,
          created_by,created_at)
         VALUES (?,?,?,?,1,?,?,?,?,?,?,?)`,
      ).bind(
        snapshotId,
        encounterId,
        patientId,
        context.user.practiceId,
        snapshotKind,
        encryptedSnapshot.ciphertext,
        encryptedSnapshot.iv,
        encryptedSnapshot.authTag,
        "patient-record-v2",
        context.user.id,
        currentTime,
      ),
    );

    for (const rawLab of labs) {
      if (
        !rawLab ||
        typeof rawLab !== "object" ||
        Array.isArray(rawLab)
      ) {
        return context.respond(
          { error: "invalid_laboratory_observation" },
          422,
        );
      }
      const lab = rawLab as Record<string, unknown>;
      const observationId = crypto.randomUUID();
      const time = canonicalObservationTime(
        lab.observedAt,
        encounterAt,
      );
      const verification = String(
        lab.verification ?? "unverified",
      );
      const safeVerification =
        verification === "confirmed" ||
        verification === "rejected"
          ? verification
          : "unverified";

      const encrypted = await encryptClinicalPayload(
        {
          ...lab,
          sourceObservedAt:
            String(lab.observedAt ?? "").trim() ||
            undefined,
          observedAtBasis: time.basis,
        },
        context.clinicalSecret,
        observationAad(
          context.user.practiceId,
          observationId,
        ),
      );

      statements.push(
        context.database.prepare(
          `INSERT INTO patient_observations
           (id,encounter_id,patient_id,practice_id,snapshot_revision,
            canonical_key,observed_at,verification,payload_ciphertext,payload_iv,
            payload_auth_tag,schema_version,created_by,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
          observationId,
          encounterId,
          patientId,
          context.user.practiceId,
          1,
          observationIndexKey(
            lab.canonicalKey,
            lab.rawName,
          ),
          time.observedAt,
          safeVerification,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.authTag,
          "observation-v1",
          context.user.id,
          currentTime,
        ),
      );
      observationCount += 1;
    }
  }

  await context.database.batch(statements);

  await context.audit(
    "patient.encounter_created",
    "patient_encounter",
    encounterId,
    {
      patientId,
      source,
      status,
      observationCount,
    },
  );

  return context.respond({
    encounter: {
      encounterId,
      patientId,
      encounterAt,
      encounterKind,
      source,
      status,
      ...(snapshot !== undefined
        ? { latestSnapshotRevision: 1 }
        : {}),
    },
    observationCount,
  }, 201);
}

type EncounterStateRow = {
  id: string;
  patient_id: string;
  encounter_at: string;
  encounter_kind: "outpatient" | "telehealth" | "other";
  source: "care_team" | "physician" | "import" | "other";
  status:
    | "draft"
    | "ready_for_physician"
    | "reviewed"
    | "completed"
    | "archived";
  current_revision: number | null;
  latest_signed_plan_id: string | null;
};

async function readEncounterState(
  context: PatientRecordV2RouteContext,
  patientId: string,
  encounterId: string,
) {
  return context.database.prepare(
    `SELECT e.id,e.patient_id,e.encounter_at,e.encounter_kind,e.source,e.status,
            (
              SELECT MAX(s.revision)
              FROM patient_encounter_snapshots s
              WHERE s.encounter_id=e.id
            ) AS current_revision,
            (
              SELECT p.id
              FROM patient_final_plans p
              WHERE p.encounter_id=e.id AND p.plan_status='signed'
              ORDER BY p.plan_version DESC
              LIMIT 1
            ) AS latest_signed_plan_id
     FROM patient_encounters e
     WHERE e.practice_id=? AND e.patient_id=? AND e.id=?`,
  ).bind(
    context.user.practiceId,
    patientId,
    encounterId,
  ).first<EncounterStateRow>();
}

function encounterSummary(row: EncounterStateRow) {
  return {
    encounterId: row.id,
    patientId: row.patient_id,
    encounterAt: row.encounter_at,
    encounterKind: row.encounter_kind,
    source: row.source,
    status: row.status,
    ...(row.current_revision !== null
      ? { latestSnapshotRevision: row.current_revision }
      : {}),
    ...(row.latest_signed_plan_id
      ? { latestSignedPlanId: row.latest_signed_plan_id }
      : {}),
  };
}

async function getEncounter(
  context: PatientRecordV2RouteContext,
  patientId: string,
  encounterId: string,
) {
  if (!can(context, "handoff.read")) {
    return context.respond({ error: "permission_denied" }, 403);
  }
  if (!validPatientId(patientId) || !validPatientId(encounterId)) {
    return context.respond({ error: "invalid_encounter_reference" }, 422);
  }

  const encounter = await readEncounterState(
    context,
    patientId,
    encounterId,
  );
  if (!encounter) {
    return context.respond({ error: "encounter_not_found" }, 404);
  }

  const currentRevision = encounter.current_revision ?? 0;
  if (currentRevision === 0) {
    return context.respond({
      encounter: encounterSummary(encounter),
    });
  }

  const snapshotRow = await context.database.prepare(
    `SELECT revision,snapshot_kind,payload_ciphertext,payload_iv,payload_auth_tag,
            created_by,created_at
     FROM patient_encounter_snapshots
     WHERE practice_id=? AND patient_id=? AND encounter_id=? AND revision=?`,
  ).bind(
    context.user.practiceId,
    patientId,
    encounterId,
    currentRevision,
  ).first<{
    revision: number;
    snapshot_kind: "clinical" | "care_team" | "physician_review" | "final";
    payload_ciphertext: string;
    payload_iv: string;
    payload_auth_tag: string;
    created_by: string;
    created_at: string;
  }>();

  if (!snapshotRow) {
    return context.respond(
      { error: "encounter_snapshot_integrity_error" },
      500,
    );
  }

  const snapshot = await decryptClinicalPayload<Record<string, unknown>>(
    {
      ciphertext: snapshotRow.payload_ciphertext,
      iv: snapshotRow.payload_iv,
      authTag: snapshotRow.payload_auth_tag,
    },
    context.clinicalSecret,
    snapshotAad(
      context.user.practiceId,
      encounterId,
      currentRevision,
    ),
  );
  if (!snapshot) {
    return context.respond(
      { error: "encounter_snapshot_decryption_failed" },
      500,
    );
  }

  return context.respond({
    encounter: encounterSummary(encounter),
    latestSnapshot: {
      revision: snapshotRow.revision,
      snapshotKind: snapshotRow.snapshot_kind,
      snapshot,
      createdBy: snapshotRow.created_by,
      createdAt: snapshotRow.created_at,
    },
  });
}

function allowedRevisionStatuses(
  role: RuntimeRole,
  currentStatus: EncounterStateRow["status"],
) {
  if (role === "assistant") {
    // WS-1 authorization fix (handoff section 15): an assistant may only act
    // on encounters that have NOT yet reached physician review. Once an
    // encounter is reviewed/locked, there are no assistant-reachable target
    // statuses; the reviseEncounter gate rejects earlier with 403.
    return currentStatus === "draft" ||
      currentStatus === "ready_for_physician"
      ? ["draft", "ready_for_physician"]
      : [];
  }
  if (currentStatus === "reviewed") {
    return ["reviewed", "completed"];
  }
  if (currentStatus === "ready_for_physician") {
    return ["ready_for_physician", "reviewed", "completed"];
  }
  return ["draft", "reviewed", "completed"];
}

async function reviseEncounter(
  request: Request,
  context: PatientRecordV2RouteContext,
  patientId: string,
  encounterId: string,
) {
  if (!can(context, "handoff.write")) {
    return context.respond({ error: "permission_denied" }, 403);
  }
  if (!validPatientId(patientId) || !validPatientId(encounterId)) {
    return context.respond({ error: "invalid_encounter_reference" }, 422);
  }

  const encounter = await readEncounterState(
    context,
    patientId,
    encounterId,
  );
  if (!encounter) {
    return context.respond({ error: "encounter_not_found" }, 404);
  }
  if (encounter.status === "archived") {
    return context.respond({ error: "encounter_archived" }, 409);
  }
  if (encounter.status === "completed") {
    return context.respond(
      { error: "ENCOUNTER_COMPLETED_IMMUTABLE" },
      409,
    );
  }
  if (encounter.latest_signed_plan_id) {
    return context.respond(
      {
        error: "ENCOUNTER_SIGNED_PLAN_LOCKED",
        latestSignedPlanId: encounter.latest_signed_plan_id,
      },
      409,
    );
  }
  if (
    context.user.role === "assistant" &&
    encounter.source !== "care_team"
  ) {
    return context.respond(
      { error: "physician_encounter_revision_forbidden" },
      403,
    );
  }
  if (
    context.user.role === "assistant" &&
    encounter.source === "care_team" &&
    encounter.status !== "draft" &&
    encounter.status !== "ready_for_physician"
  ) {
    // WS-1 authorization fix (handoff section 15 edge case): once a
    // care_team encounter has been reviewed/locked by physician policy, an
    // assistant must not silently revise clinical content or return it to
    // draft. A deliberate physician-driven amendment workflow with its own
    // authorization and audit is required instead. Fail closed.
    await context.audit(
      "patient.encounter_assistant_revision_denied",
      "patient_encounter",
      encounterId,
      {
        patientId,
        status: encounter.status,
        source: encounter.source,
      },
    );
    return context.respond(
      { error: "ENCOUNTER_REVIEWED_ASSISTANT_LOCKED" },
      403,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return context.respond({ error: "invalid_json" }, 400);
  }
  if (JSON.stringify(body).length > MAX_PAYLOAD_CHARS) {
    return context.respond(
      { error: "encounter_payload_too_large" },
      413,
    );
  }

  const expectedRevision = Number(body.expectedRevision);
  if (
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    return context.respond(
      { error: "invalid_expected_revision" },
      422,
    );
  }

  const currentRevision = encounter.current_revision ?? 0;
  if (expectedRevision !== currentRevision) {
    return context.respond(
      {
        error: "ENCOUNTER_REVISION_CONFLICT",
        expectedRevision,
        currentRevision,
      },
      409,
    );
  }

  const snapshot = body.snapshot;
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot)
  ) {
    return context.respond(
      { error: "invalid_encounter_snapshot" },
      422,
    );
  }

  const snapshotObject = snapshot as Record<string, unknown>;
  const labs = Array.isArray(snapshotObject.labs)
    ? snapshotObject.labs
    : [];
  if (labs.length > MAX_LABS) {
    return context.respond(
      { error: "too_many_laboratory_observations" },
      422,
    );
  }

  const targetStatus = String(
    body.status ?? encounter.status,
  ) as EncounterStateRow["status"];
  if (
    !allowedRevisionStatuses(
      context.user.role,
      encounter.status,
    ).includes(targetStatus)
  ) {
    return context.respond(
      { error: "invalid_encounter_status_transition" },
      422,
    );
  }

  const nextRevision = currentRevision + 1;
  const currentTime = nowIso();
  const snapshotKind =
    context.user.role === "assistant"
      ? "care_team"
      : "physician_review";
  const snapshotId = crypto.randomUUID();

  const encryptedSnapshot = await encryptClinicalPayload(
    snapshotObject,
    context.clinicalSecret,
    snapshotAad(
      context.user.practiceId,
      encounterId,
      nextRevision,
    ),
  );

  const statements: D1PreparedStatement[] = [
    context.database.prepare(
      `INSERT INTO patient_encounter_snapshots
       (id,encounter_id,patient_id,practice_id,revision,snapshot_kind,
        payload_ciphertext,payload_iv,payload_auth_tag,schema_version,
        created_by,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      snapshotId,
      encounterId,
      patientId,
      context.user.practiceId,
      nextRevision,
      snapshotKind,
      encryptedSnapshot.ciphertext,
      encryptedSnapshot.iv,
      encryptedSnapshot.authTag,
      "patient-record-v2",
      context.user.id,
      currentTime,
    ),
  ];

  let observationCount = 0;
  for (const rawLab of labs) {
    if (
      !rawLab ||
      typeof rawLab !== "object" ||
      Array.isArray(rawLab)
    ) {
      return context.respond(
        { error: "invalid_laboratory_observation" },
        422,
      );
    }

    const lab = rawLab as Record<string, unknown>;
    const observationId = crypto.randomUUID();
    const time = canonicalObservationTime(
      lab.observedAt,
      encounter.encounter_at,
    );
    const verification = String(
      lab.verification ?? "unverified",
    );
    const safeVerification =
      verification === "confirmed" ||
      verification === "rejected"
        ? verification
        : "unverified";

    const encrypted = await encryptClinicalPayload(
      {
        ...lab,
        sourceObservedAt:
          String(lab.observedAt ?? "").trim() ||
          undefined,
        observedAtBasis: time.basis,
      },
      context.clinicalSecret,
      observationAad(
        context.user.practiceId,
        observationId,
      ),
    );

    statements.push(
      context.database.prepare(
        `INSERT INTO patient_observations
         (id,encounter_id,patient_id,practice_id,snapshot_revision,
          canonical_key,observed_at,verification,payload_ciphertext,payload_iv,
          payload_auth_tag,schema_version,created_by,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        observationId,
        encounterId,
        patientId,
        context.user.practiceId,
        nextRevision,
        observationIndexKey(
          lab.canonicalKey,
          lab.rawName,
        ),
        time.observedAt,
        safeVerification,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        "observation-v1",
        context.user.id,
        currentTime,
      ),
    );
    observationCount += 1;
  }

  statements.push(
    context.database.prepare(
      `UPDATE patient_encounters
       SET status=?,updated_by=?,updated_at=?
       WHERE practice_id=? AND patient_id=? AND id=?`,
    ).bind(
      targetStatus,
      context.user.id,
      currentTime,
      context.user.practiceId,
      patientId,
      encounterId,
    ),
  );

  try {
    await context.database.batch(statements);
  } catch (error) {
    const latest = await readEncounterState(
      context,
      patientId,
      encounterId,
    );
    const latestRevision = latest?.current_revision ?? 0;
    if (latestRevision !== expectedRevision) {
      return context.respond(
        {
          error: "ENCOUNTER_REVISION_CONFLICT",
          expectedRevision,
          currentRevision: latestRevision,
        },
        409,
      );
    }
    throw error;
  }

  await context.audit(
    "patient.encounter_revised",
    "patient_encounter",
    encounterId,
    {
      patientId,
      previousRevision: currentRevision,
      revision: nextRevision,
      status: targetStatus,
      observationCount,
    },
  );

  const updated = await readEncounterState(
    context,
    patientId,
    encounterId,
  );
  if (!updated) {
    return context.respond(
      { error: "encounter_revision_integrity_error" },
      500,
    );
  }

  return context.respond({
    encounter: encounterSummary(updated),
    previousRevision: currentRevision,
    revision: nextRevision,
    observationCount,
  });
}


async function workspace(
  context: PatientRecordV2RouteContext,
  patientId: string,
) {
  if (!can(context, "handoff.read")) {
    return context.respond({ error: "permission_denied" }, 403);
  }
  if (!validPatientId(patientId)) {
    return context.respond({ error: "invalid_patient_id" }, 422);
  }

  const patient = await readPatientSummary(
    context,
    patientId,
  );
  if (!patient) {
    return context.respond({ error: "patient_not_found" }, 404);
  }

  const encounters = await context.database.prepare(
    `SELECT e.id,e.patient_id,e.encounter_at,e.encounter_kind,e.source,e.status,
            (
              SELECT MAX(s.revision)
              FROM patient_encounter_snapshots s
              WHERE s.encounter_id=e.id
            ) AS latest_snapshot_revision,
            (
              SELECT p.id
              FROM patient_final_plans p
              WHERE p.encounter_id=e.id AND p.plan_status='signed'
              ORDER BY p.plan_version DESC
              LIMIT 1
            ) AS latest_signed_plan_id
     FROM patient_encounters e
     WHERE e.practice_id=? AND e.patient_id=?
     ORDER BY e.encounter_at DESC,e.created_at DESC`,
  ).bind(
    context.user.practiceId,
    patientId,
  ).all<{
    id: string;
    patient_id: string;
    encounter_at: string;
    encounter_kind: "outpatient" | "telehealth" | "other";
    source: "care_team" | "physician" | "import" | "other";
    status:
      | "draft"
      | "ready_for_physician"
      | "reviewed"
      | "completed"
      | "archived";
    latest_snapshot_revision: number | null;
    latest_signed_plan_id: string | null;
  }>();

  return context.respond({
    patient,
    encounters: encounters.results.map((row) => ({
      encounterId: row.id,
      patientId: row.patient_id,
      encounterAt: row.encounter_at,
      encounterKind: row.encounter_kind,
      source: row.source,
      status: row.status,
      ...(row.latest_snapshot_revision !== null
        ? {
            latestSnapshotRevision:
              row.latest_snapshot_revision,
          }
        : {}),
      ...(row.latest_signed_plan_id
        ? { latestSignedPlanId: row.latest_signed_plan_id }
        : {}),
    })),
    patientNotes: [],
    trends: [],
    mode: context.user.layoutPreset,
  });
}

export async function patientRecordV2Route(
  request: Request,
  context: PatientRecordV2RouteContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/v1/patients")) {
    return null;
  }

  if (
    url.pathname === "/v1/patients/file-number-allocator" &&
    request.method === "GET"
  ) {
    return getAllocator(context);
  }
  if (
    url.pathname ===
      "/v1/patients/file-number-allocator/initialize" &&
    request.method === "POST"
  ) {
    return initializeAllocator(request, context);
  }
  if (
    url.pathname === "/v1/patients/resolve" &&
    request.method === "POST"
  ) {
    return resolvePatient(request, context);
  }
  if (
    url.pathname === "/v1/patients/promote-legacy-handoff" &&
    request.method === "POST"
  ) {
    return promoteLegacyHandoff(request, context);
  }
  if (
    url.pathname === "/v1/patients/care-team-intake" &&
    request.method === "POST"
  ) {
    return createCareTeamPatientIntake(request, context);
  }
  if (
    url.pathname === "/v1/patients" &&
    request.method === "POST"
  ) {
    return createPatient(request, context);
  }

  const identifierMatch = url.pathname.match(
    /^\/v1\/patients\/([^/]+)\/identifiers$/,
  );
  if (identifierMatch && request.method === "POST") {
    return attachPatientIdentifier(
      request,
      context,
      decodeURIComponent(identifierMatch[1]!),
    );
  }

  const encounterMatch = url.pathname.match(
    /^\/v1\/patients\/([^/]+)\/encounters$/,
  );
  if (encounterMatch && request.method === "POST") {
    return createEncounter(
      request,
      context,
      decodeURIComponent(encounterMatch[1]!),
    );
  }

  const encounterDetailMatch = url.pathname.match(
    /^\/v1\/patients\/([^/]+)\/encounters\/([^/]+)$/,
  );
  if (encounterDetailMatch && request.method === "GET") {
    return getEncounter(
      context,
      decodeURIComponent(encounterDetailMatch[1]!),
      decodeURIComponent(encounterDetailMatch[2]!),
    );
  }
  if (encounterDetailMatch && request.method === "PATCH") {
    return reviseEncounter(
      request,
      context,
      decodeURIComponent(encounterDetailMatch[1]!),
      decodeURIComponent(encounterDetailMatch[2]!),
    );
  }

  const workspaceMatch = url.pathname.match(
    /^\/v1\/patients\/([^/]+)\/workspace$/,
  );
  if (workspaceMatch && request.method === "GET") {
    return workspace(
      context,
      decodeURIComponent(workspaceMatch[1]!),
    );
  }

  return context.respond({ error: "not_found" }, 404);
}
