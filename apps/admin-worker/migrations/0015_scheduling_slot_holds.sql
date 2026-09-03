-- P5-C2 Server-authoritative candidate slots and transactional short-lived holds.
-- A hold is not an appointment, booking confirmation, clinical grant or payment.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS appointment_slot_holds (
  id TEXT PRIMARY KEY,
  scheduling_policy_id TEXT NOT NULL
    REFERENCES provider_scheduling_policies(id) ON DELETE RESTRICT,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  physician_user_id TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  patient_account_id TEXT NOT NULL REFERENCES patient_accounts(id) ON DELETE RESTRICT,
  care_relationship_id TEXT NOT NULL REFERENCES care_relationships(id) ON DELETE RESTRICT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  lock_starts_at TEXT NOT NULL,
  lock_ends_at TEXT NOT NULL,
  visit_mode TEXT NOT NULL CHECK (visit_mode IN ('in_person','audio','video')),
  policy_revision INTEGER NOT NULL CHECK (policy_revision >= 1),
  status TEXT NOT NULL DEFAULT 'held'
    CHECK (status IN ('held','released','expired','consumed')),
  expires_at TEXT NOT NULL,
  released_at TEXT,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (practice_id, physician_user_id)
    REFERENCES practice_memberships(practice_id, user_id) ON DELETE RESTRICT,
  CHECK (ends_at > starts_at),
  CHECK (lock_starts_at <= starts_at AND lock_ends_at >= ends_at),
  CHECK (lock_ends_at > lock_starts_at),
  CHECK (expires_at > created_at),
  CHECK (status <> 'released' OR released_at IS NOT NULL),
  CHECK (status <> 'consumed' OR consumed_at IS NOT NULL)
);

-- Exact-start backstop. The acquisition transaction additionally rejects any
-- interval overlap so a later policy-duration change cannot create collisions.
CREATE UNIQUE INDEX IF NOT EXISTS appointment_slot_holds_physician_start_held_uq
  ON appointment_slot_holds(physician_user_id, starts_at)
  WHERE status='held';
CREATE INDEX IF NOT EXISTS appointment_slot_holds_overlap_idx
  ON appointment_slot_holds(
    physician_user_id, status, lock_starts_at, lock_ends_at, expires_at
  );
CREATE INDEX IF NOT EXISTS appointment_slot_holds_patient_idx
  ON appointment_slot_holds(patient_account_id, status, expires_at);

CREATE TABLE IF NOT EXISTS appointment_slot_hold_events (
  id TEXT PRIMARY KEY,
  slot_hold_id TEXT NOT NULL REFERENCES appointment_slot_holds(id) ON DELETE RESTRICT,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('acquired','released','expired','consumed')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('patient','platform')),
  actor_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS appointment_slot_hold_events_hold_time_idx
  ON appointment_slot_hold_events(slot_hold_id, created_at DESC);
CREATE INDEX IF NOT EXISTS appointment_slot_hold_events_practice_time_idx
  ON appointment_slot_hold_events(practice_id, created_at DESC);

-- Intentionally absent in P5-C2:
-- * appointment or payment rows
-- * a guarantee that an informational candidate slot is reserved
-- * any clinical-record authorization derived from a hold
