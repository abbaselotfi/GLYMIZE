-- GLYMIZE Patient Longitudinal Record v2 foundation
-- Migration 0003 (DESIGN/SCHEMA ONLY until explicitly applied through the RC migration gate)
--
-- Goals:
--   * one stable patient_id per practice;
--   * multiple identifiers (file number, national ID, other) resolving to the same patient;
--   * no plaintext patient identifier requirement for lookup/indexing;
--   * append-only encounter history instead of overwriting prior visits;
--   * encrypted full clinical snapshots suitable for later authorized longitudinal display/export;
--   * separate physician final-prescription records;
--   * preserve legacy patient_handoffs during staged migration.
--
-- IMPORTANT:
--   Application code MUST hash identifiers with a keyed clinical secret and encrypt original
--   identifier/demographic/clinical payloads before inserting them into the *_ciphertext fields.
--   This migration intentionally does not drop or rewrite the existing patient_handoffs table.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS patient_registry (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS patient_registry_practice_updated_idx
  ON patient_registry(practice_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS patient_identifiers (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  identifier_kind TEXT NOT NULL CHECK (identifier_kind IN ('file_number','national_id','other')),
  -- HMAC/keyed hash used for deterministic lookup. Never store the raw identifier here.
  identifier_hash TEXT NOT NULL,
  -- Authorized clinical retrieval may require the original value; keep it encrypted at rest.
  value_ciphertext TEXT NOT NULL,
  value_iv TEXT NOT NULL,
  value_auth_tag TEXT NOT NULL,
  display_mask TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(practice_id, identifier_kind, identifier_hash)
);
CREATE INDEX IF NOT EXISTS patient_identifiers_patient_idx
  ON patient_identifiers(patient_id, identifier_kind);
CREATE INDEX IF NOT EXISTS patient_identifiers_lookup_idx
  ON patient_identifiers(practice_id, identifier_hash);

CREATE TABLE IF NOT EXISTS patient_demographics (
  patient_id TEXT PRIMARY KEY REFERENCES patient_registry(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  -- Encrypted JSON may contain name, date of birth, sex and other protected demographics.
  payload_ciphertext TEXT NOT NULL,
  payload_iv TEXT NOT NULL,
  payload_auth_tag TEXT NOT NULL,
  updated_by TEXT REFERENCES runtime_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS patient_demographics_practice_idx
  ON patient_demographics(practice_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS patient_encounters (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  encounter_at TEXT NOT NULL,
  encounter_kind TEXT NOT NULL DEFAULT 'outpatient' CHECK (encounter_kind IN ('outpatient','telehealth','other')),
  source TEXT NOT NULL DEFAULT 'care_team' CHECK (source IN ('care_team','physician','import','other')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready_for_physician','reviewed','completed','archived')),
  created_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS patient_encounters_patient_time_idx
  ON patient_encounters(patient_id, encounter_at DESC);
CREATE INDEX IF NOT EXISTS patient_encounters_practice_time_idx
  ON patient_encounters(practice_id, encounter_at DESC);

-- Append-only snapshots. Application code must NEVER UPDATE a historical snapshot row.
CREATE TABLE IF NOT EXISTS patient_encounter_snapshots (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES patient_encounters(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  snapshot_kind TEXT NOT NULL DEFAULT 'clinical' CHECK (snapshot_kind IN ('clinical','care_team','physician_review','final')),
  -- Full structured encounter payload encrypted at rest. Payload may include all lab observations,
  -- vitals, conditions/flags, medication reconciliation, OCR provenance and notes.
  payload_ciphertext TEXT NOT NULL,
  payload_iv TEXT NOT NULL,
  payload_auth_tag TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'patient-record-v2',
  created_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  UNIQUE(encounter_id, revision)
);
CREATE INDEX IF NOT EXISTS patient_encounter_snapshots_patient_idx
  ON patient_encounter_snapshots(patient_id, created_at DESC);

-- Physician's final medication plan is intentionally separate from engine recommendations.
-- The encrypted payload should retain canonical medication IDs, drug names, strength/form,
-- dose, frequency, total daily dose, action (KEEP/UP/DOWN/HOLD/STOP/SWITCH/ADD where relevant),
-- and any physician-entered modification/override metadata.
CREATE TABLE IF NOT EXISTS patient_prescription_records (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES patient_encounters(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  decision_state TEXT NOT NULL DEFAULT 'final' CHECK (decision_state IN ('draft','final','void')),
  payload_ciphertext TEXT NOT NULL,
  payload_iv TEXT NOT NULL,
  payload_auth_tag TEXT NOT NULL,
  engine_version TEXT,
  rule_pack_version TEXT,
  created_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS patient_prescription_patient_time_idx
  ON patient_prescription_records(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS patient_prescription_encounter_idx
  ON patient_prescription_records(encounter_id, created_at DESC);

-- Maps a legacy current patient_handoffs row to the new patient/encounter model during staged rollout.
-- This allows migration without dropping or rewriting the currently tested handoff path.
CREATE TABLE IF NOT EXISTS patient_handoff_legacy_links (
  legacy_handoff_id TEXT PRIMARY KEY REFERENCES patient_handoffs(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  encounter_id TEXT NOT NULL REFERENCES patient_encounters(id) ON DELETE CASCADE,
  migrated_at TEXT NOT NULL
);

-- Optional privacy-preserving research key registry.
-- `research_subject_key` must be generated independently of direct patient identifiers and must not
-- be reversible by research-export recipients. This table is not an authorization mechanism.
CREATE TABLE IF NOT EXISTS patient_research_keys (
  patient_id TEXT PRIMARY KEY REFERENCES patient_registry(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  research_subject_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS patient_research_keys_practice_idx
  ON patient_research_keys(practice_id);
