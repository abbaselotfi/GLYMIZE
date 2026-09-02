-- P5-B3 CareRelationshipService foundation.
-- A relationship connects one global patient account to one practice while
-- retaining the optional link to that practice's authoritative local record.
-- No row in this migration changes patient_registry or grants access by itself.
PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX IF NOT EXISTS patient_registry_practice_id_uq
  ON patient_registry(practice_id, id);

CREATE TABLE IF NOT EXISTS care_relationships (
  id TEXT PRIMARY KEY,
  patient_account_id TEXT NOT NULL
    REFERENCES patient_accounts(id) ON DELETE RESTRICT,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  assigned_physician_user_id TEXT,
  local_patient_id TEXT,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','active','paused','ended','revoked','rejected')),
  provider_display_name TEXT NOT NULL,
  specialty_name TEXT NOT NULL,
  practice_display_name TEXT NOT NULL,
  activated_at TEXT,
  terminal_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (patient_account_id, practice_id),
  FOREIGN KEY (practice_id, assigned_physician_user_id)
    REFERENCES practice_memberships(practice_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (practice_id, local_patient_id)
    REFERENCES patient_registry(practice_id, id) ON DELETE RESTRICT,
  CHECK (status NOT IN ('active','paused') OR activated_at IS NOT NULL),
  CHECK (status NOT IN ('ended','revoked','rejected') OR terminal_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS care_relationships_patient_status_idx
  ON care_relationships(patient_account_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS care_relationships_practice_status_idx
  ON care_relationships(practice_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS care_relationships_local_patient_idx
  ON care_relationships(practice_id, local_patient_id, status)
  WHERE local_patient_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS care_relationship_provenance (
  id TEXT PRIMARY KEY,
  care_relationship_id TEXT NOT NULL
    REFERENCES care_relationships(id) ON DELETE RESTRICT,
  provenance_type TEXT NOT NULL CHECK (provenance_type IN ('referral_redemption')),
  referral_redemption_id TEXT NOT NULL UNIQUE
    REFERENCES referral_redemptions(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS care_relationship_provenance_relationship_idx
  ON care_relationship_provenance(care_relationship_id, created_at DESC);

CREATE TABLE IF NOT EXISTS care_relationship_events (
  id TEXT PRIMARY KEY,
  care_relationship_id TEXT NOT NULL
    REFERENCES care_relationships(id) ON DELETE RESTRICT,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  from_status TEXT CHECK (
    from_status IS NULL OR from_status IN ('requested','active','paused','ended','revoked','rejected')
  ),
  to_status TEXT NOT NULL
    CHECK (to_status IN ('requested','active','paused','ended','revoked','rejected')),
  event_type TEXT NOT NULL CHECK (
    event_type IN ('requested','referral_attached','accepted','rejected','paused','resumed','ended','revoked','local_record_linked','local_record_unlinked')
  ),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('patient','runtime_user','platform')),
  actor_id TEXT,
  reason_code TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS care_relationship_events_relationship_time_idx
  ON care_relationship_events(care_relationship_id, created_at DESC);
CREATE INDEX IF NOT EXISTS care_relationship_events_practice_time_idx
  ON care_relationship_events(practice_id, created_at DESC);

-- Intentionally absent in P5-B3:
-- * automatic local patient-record creation or matching
-- * cross-practice clinical record access or merging
-- * implicit authorization from provider discovery or referral-code knowledge
