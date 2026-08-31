-- GLYMIZE Patient Longitudinal Record v2 foundation
-- Migration 0003 (DESIGN/SCHEMA ONLY until explicitly applied through the RC migration gate)
--
-- Goals:
--   * one stable patient_id per practice;
--   * multiple identifiers (file number, national ID, other) resolving to the same patient;
--   * no plaintext patient identifier requirement for lookup/indexing;
--   * append-only encounter history instead of overwriting prior visits;
--   * encrypted full clinical snapshots suitable for later authorized longitudinal display/export;
--   * searchable observation keys with encrypted observation values for efficient trends;
--   * separate physician Final Plans with medication and investigation orders;
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

-- Practice-scoped monotonic file-number allocator.
-- Legacy HMAC-only identifiers cannot reveal a trustworthy global maximum, so an existing
-- practice starts uninitialized until an authorized user confirms the latest assigned number.
-- The application must allocate/bump this high-water mark atomically with identifier creation.
CREATE TABLE IF NOT EXISTS patient_file_number_allocators (
  practice_id TEXT PRIMARY KEY REFERENCES practices(id) ON DELETE CASCADE,
  allocation_status TEXT NOT NULL DEFAULT 'uninitialized'
    CHECK (allocation_status IN ('uninitialized','ready')),
  last_allocated_number INTEGER,
  display_width INTEGER NOT NULL DEFAULT 1
    CHECK (display_width >= 1 AND display_width <= 18),
  initialized_by TEXT REFERENCES runtime_users(id) ON DELETE SET NULL,
  initialized_at TEXT,
  updated_by TEXT REFERENCES runtime_users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (allocation_status='uninitialized' AND last_allocated_number IS NULL)
    OR
    (allocation_status='ready' AND last_allocated_number IS NOT NULL AND last_allocated_number >= 0)
  )
);


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

-- Physician notes use a stable thread plus append-only encrypted revisions.
-- Patient-scoped threads persist across visits; encounter-scoped threads belong to one visit.
CREATE TABLE IF NOT EXISTS patient_note_threads (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  note_scope TEXT NOT NULL CHECK (note_scope IN ('patient','encounter')),
  encounter_id TEXT REFERENCES patient_encounters(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'physician_only'
    CHECK (visibility IN ('physician_only','care_team_visible')),
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0,1)),
  created_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  CHECK (
    (note_scope='patient' AND encounter_id IS NULL)
    OR
    (note_scope='encounter' AND encounter_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS patient_note_threads_patient_idx
  ON patient_note_threads(patient_id, note_scope, updated_at DESC);
CREATE INDEX IF NOT EXISTS patient_note_threads_encounter_idx
  ON patient_note_threads(encounter_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS patient_note_revisions (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES patient_note_threads(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  payload_ciphertext TEXT NOT NULL,
  payload_iv TEXT NOT NULL,
  payload_auth_tag TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'physician-note-v1',
  authored_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  UNIQUE(thread_id, revision)
);
CREATE INDEX IF NOT EXISTS patient_note_revisions_patient_time_idx
  ON patient_note_revisions(patient_id, created_at DESC);


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

-- Searchable observation index for trends and rule-engine retrieval.
-- `canonical_key` and timestamps are intentionally indexable; the actual value, unit, lab reference
-- interval/text, raw test name, abnormal flag, source metadata and OCR/human-verification details
-- are stored inside the encrypted payload. This allows fast queries such as "all hba1c observations
-- for patient X" without exposing the clinical value in plaintext storage.
CREATE TABLE IF NOT EXISTS patient_observations (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES patient_encounters(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  canonical_key TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  verification TEXT NOT NULL DEFAULT 'unverified' CHECK (verification IN ('unverified','confirmed','rejected')),
  payload_ciphertext TEXT NOT NULL,
  payload_iv TEXT NOT NULL,
  payload_auth_tag TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'observation-v1',
  created_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS patient_observations_patient_key_time_idx
  ON patient_observations(patient_id, canonical_key, observed_at DESC);
CREATE INDEX IF NOT EXISTS patient_observations_practice_key_time_idx
  ON patient_observations(practice_id, canonical_key, observed_at DESC);
CREATE INDEX IF NOT EXISTS patient_observations_encounter_idx
  ON patient_observations(encounter_id, created_at);

-- Physician Final Plan is intentionally separate from engine recommendations.
-- A signed plan may contain medication orders, investigation/laboratory orders, both,
-- or no medication order. Signed clinical content is immutable; later changes create a
-- superseding plan rather than silently rewriting history.
CREATE TABLE IF NOT EXISTS patient_final_plans (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES patient_encounters(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  plan_version INTEGER NOT NULL CHECK (plan_version >= 1),
  plan_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (plan_status IN ('draft','signed','superseded','void')),
  supersedes_plan_id TEXT REFERENCES patient_final_plans(id) ON DELETE SET NULL,
  payload_ciphertext TEXT,
  payload_iv TEXT,
  payload_auth_tag TEXT,
  engine_decision_record_id TEXT,
  engine_version TEXT,
  rule_pack_version TEXT,
  authored_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  signed_by TEXT REFERENCES runtime_users(id) ON DELETE RESTRICT,
  signed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(encounter_id, plan_version)
);
CREATE INDEX IF NOT EXISTS patient_final_plans_patient_signed_idx
  ON patient_final_plans(patient_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS patient_final_plans_encounter_idx
  ON patient_final_plans(encounter_id, plan_version DESC);

-- Encrypted medication orders include dose/schedule and the payer-registration snapshot.
-- Encrypted investigation orders include Lab Master key, timing/preparation and any
-- insurer/service registration code snapshot available at physician sign-off.
CREATE TABLE IF NOT EXISTS patient_final_orders (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES patient_final_plans(id) ON DELETE CASCADE,
  encounter_id TEXT NOT NULL REFERENCES patient_encounters(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  order_kind TEXT NOT NULL CHECK (order_kind IN ('medication','investigation')),
  order_status TEXT NOT NULL DEFAULT 'active'
    CHECK (order_status IN ('active','cancelled')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  payload_ciphertext TEXT NOT NULL,
  payload_iv TEXT NOT NULL,
  payload_auth_tag TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'physician-order-v1',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS patient_final_orders_plan_idx
  ON patient_final_orders(plan_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS patient_final_orders_patient_idx
  ON patient_final_orders(patient_id, created_at DESC);

-- Care Team execution is append-only and never mutates physician-authored orders.
CREATE TABLE IF NOT EXISTS patient_order_fulfillment_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES patient_final_orders(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES patient_final_plans(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  fulfillment_status TEXT NOT NULL CHECK (
    fulfillment_status IN (
      'pending',
      'submitted_to_payer',
      'registered',
      'scheduled',
      'collected',
      'result_received',
      'completed',
      'unable_to_process',
      'cancelled'
    )
  ),
  note_ciphertext TEXT,
  note_iv TEXT,
  note_auth_tag TEXT,
  updated_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS patient_order_fulfillment_order_time_idx
  ON patient_order_fulfillment_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS patient_order_fulfillment_patient_time_idx
  ON patient_order_fulfillment_events(patient_id, created_at DESC);

-- Returned observations may satisfy earlier investigation orders without overwriting orders.
CREATE TABLE IF NOT EXISTS patient_investigation_result_links (
  order_id TEXT NOT NULL REFERENCES patient_final_orders(id) ON DELETE CASCADE,
  observation_id TEXT NOT NULL REFERENCES patient_observations(id) ON DELETE CASCADE,
  linked_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  linked_at TEXT NOT NULL,
  PRIMARY KEY(order_id, observation_id)
);
CREATE INDEX IF NOT EXISTS patient_investigation_result_observation_idx
  ON patient_investigation_result_links(observation_id);


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
