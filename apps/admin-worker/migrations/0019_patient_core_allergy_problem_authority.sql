-- R28-06 / Option A: canonical longitudinal Allergy and Problem authority.
--
-- DESIGN/SCHEMA ONLY until applied through the separately controlled environment migration gate.
-- Clinical payloads are encrypted by application code before persistence.
-- These tables are append-only revision stores; resolving a fact creates a revision rather than
-- deleting prior provenance. Collection reconciliation is explicit so zero fact rows alone never
-- mean known absence.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS patient_core_allergy_revisions (
  fact_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  payload_ciphertext TEXT NOT NULL,
  payload_iv TEXT NOT NULL,
  payload_auth_tag TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'patient-core-allergy-v1',
  created_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (fact_id, revision)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS patient_core_allergy_patient_latest_idx
  ON patient_core_allergy_revisions(practice_id, patient_id, fact_id, revision DESC);
CREATE INDEX IF NOT EXISTS patient_core_allergy_patient_time_idx
  ON patient_core_allergy_revisions(practice_id, patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS patient_core_problem_revisions (
  fact_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  payload_ciphertext TEXT NOT NULL,
  payload_iv TEXT NOT NULL,
  payload_auth_tag TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'patient-core-problem-v1',
  created_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (fact_id, revision)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS patient_core_problem_patient_latest_idx
  ON patient_core_problem_revisions(practice_id, patient_id, fact_id, revision DESC);
CREATE INDEX IF NOT EXISTS patient_core_problem_patient_time_idx
  ON patient_core_problem_revisions(practice_id, patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS patient_core_collection_reconciliations (
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  family TEXT NOT NULL CHECK (family IN ('allergy','problem')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  completeness TEXT NOT NULL CHECK (completeness IN ('partial','complete')),
  payload_ciphertext TEXT NOT NULL,
  payload_iv TEXT NOT NULL,
  payload_auth_tag TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'patient-core-reconciliation-v1',
  reconciled_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  reconciled_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (practice_id, patient_id, family, revision)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS patient_core_reconciliation_latest_idx
  ON patient_core_collection_reconciliations(
    practice_id, patient_id, family, revision DESC
  );

-- D1 cannot express the patient/practice ownership invariant with a composite FK because the
-- existing patient_registry primary key is patient_id alone. Enforce it at the storage boundary.
CREATE TRIGGER IF NOT EXISTS patient_core_allergy_scope_guard
BEFORE INSERT ON patient_core_allergy_revisions
WHEN NOT EXISTS (
  SELECT 1 FROM patient_registry p
  WHERE p.id = NEW.patient_id AND p.practice_id = NEW.practice_id
)
BEGIN
  SELECT RAISE(ABORT, 'patient_scope_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS patient_core_problem_scope_guard
BEFORE INSERT ON patient_core_problem_revisions
WHEN NOT EXISTS (
  SELECT 1 FROM patient_registry p
  WHERE p.id = NEW.patient_id AND p.practice_id = NEW.practice_id
)
BEGIN
  SELECT RAISE(ABORT, 'patient_scope_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS patient_core_reconciliation_scope_guard
BEFORE INSERT ON patient_core_collection_reconciliations
WHEN NOT EXISTS (
  SELECT 1 FROM patient_registry p
  WHERE p.id = NEW.patient_id AND p.practice_id = NEW.practice_id
)
BEGIN
  SELECT RAISE(ABORT, 'patient_scope_mismatch');
END;
