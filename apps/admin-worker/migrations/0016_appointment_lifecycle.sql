-- P5-C3 Appointment booking and lifecycle foundation.
-- Booking consumes a server-authoritative hold. Payment-provider integration,
-- notification delivery and clinical-record authorization remain absent.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  scheduling_policy_id TEXT NOT NULL
    REFERENCES provider_scheduling_policies(id) ON DELETE RESTRICT,
  slot_hold_id TEXT NOT NULL UNIQUE
    REFERENCES appointment_slot_holds(id) ON DELETE RESTRICT,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  physician_user_id TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  patient_account_id TEXT NOT NULL REFERENCES patient_accounts(id) ON DELETE RESTRICT,
  care_relationship_id TEXT NOT NULL REFERENCES care_relationships(id) ON DELETE RESTRICT,
  rescheduled_from_appointment_id TEXT UNIQUE
    REFERENCES appointments(id) ON DELETE RESTRICT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  lock_starts_at TEXT NOT NULL,
  lock_ends_at TEXT NOT NULL,
  visit_mode TEXT NOT NULL CHECK (visit_mode IN ('in_person','audio','video')),
  confirmation_policy TEXT NOT NULL
    CHECK (confirmation_policy IN ('auto_confirm','approval_required')),
  policy_revision INTEGER NOT NULL CHECK (policy_revision >= 1),
  status TEXT NOT NULL CHECK (
    status IN (
      'requested','confirmed','cancelled','rescheduled','checked_in',
      'in_progress','completed','no_show'
    )
  ),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  requested_at TEXT NOT NULL,
  confirmed_at TEXT,
  cancelled_at TEXT,
  rescheduled_at TEXT,
  checked_in_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  no_show_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (practice_id, physician_user_id)
    REFERENCES practice_memberships(practice_id, user_id) ON DELETE RESTRICT,
  CHECK (ends_at > starts_at),
  CHECK (lock_starts_at <= starts_at AND lock_ends_at >= ends_at),
  CHECK (lock_ends_at > lock_starts_at),
  CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL),
  CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL),
  CHECK (status <> 'rescheduled' OR rescheduled_at IS NOT NULL),
  CHECK (status <> 'checked_in' OR checked_in_at IS NOT NULL),
  CHECK (status <> 'in_progress' OR started_at IS NOT NULL),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CHECK (status <> 'no_show' OR no_show_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS appointments_physician_start_active_uq
  ON appointments(physician_user_id, starts_at)
  WHERE status IN ('requested','confirmed','checked_in','in_progress');
CREATE INDEX IF NOT EXISTS appointments_physician_overlap_idx
  ON appointments(physician_user_id, status, lock_starts_at, lock_ends_at);
CREATE INDEX IF NOT EXISTS appointments_patient_time_idx
  ON appointments(patient_account_id, starts_at DESC, status);
CREATE INDEX IF NOT EXISTS appointments_practice_time_idx
  ON appointments(practice_id, starts_at DESC, status);
CREATE INDEX IF NOT EXISTS appointments_relationship_time_idx
  ON appointments(care_relationship_id, starts_at DESC);

CREATE TABLE IF NOT EXISTS appointment_participants (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  participant_type TEXT NOT NULL
    CHECK (participant_type IN ('patient','runtime_user')),
  patient_account_id TEXT REFERENCES patient_accounts(id) ON DELETE RESTRICT,
  runtime_user_id TEXT REFERENCES runtime_users(id) ON DELETE RESTRICT,
  participant_role TEXT NOT NULL CHECK (
    participant_role IN ('patient','physician','assistant')
  ),
  created_at TEXT NOT NULL,
  CHECK (
    (participant_type='patient' AND patient_account_id IS NOT NULL AND runtime_user_id IS NULL AND participant_role='patient')
    OR
    (participant_type='runtime_user' AND runtime_user_id IS NOT NULL AND patient_account_id IS NULL AND participant_role IN ('physician','assistant'))
  ),
  UNIQUE (appointment_id, participant_type, patient_account_id, runtime_user_id)
);
CREATE INDEX IF NOT EXISTS appointment_participants_patient_idx
  ON appointment_participants(patient_account_id, appointment_id)
  WHERE patient_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS appointment_participants_user_idx
  ON appointment_participants(runtime_user_id, appointment_id)
  WHERE runtime_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS appointment_financial_snapshots (
  appointment_id TEXT PRIMARY KEY REFERENCES appointments(id) ON DELETE RESTRICT,
  fee_amount_minor INTEGER CHECK (fee_amount_minor IS NULL OR fee_amount_minor >= 0),
  currency_code TEXT CHECK (
    currency_code IS NULL OR (length(currency_code)=3 AND currency_code=upper(currency_code))
  ),
  pricing_policy_version TEXT,
  payment_required INTEGER NOT NULL DEFAULT 0 CHECK (payment_required IN (0,1)),
  payment_state TEXT NOT NULL CHECK (
    payment_state IN (
      'not_required','pending','authorized','paid','failed','cancelled',
      'refunded','partially_refunded'
    )
  ),
  captured_at TEXT NOT NULL,
  CHECK ((fee_amount_minor IS NULL) = (currency_code IS NULL)),
  CHECK (payment_required=1 OR payment_state='not_required'),
  CHECK (payment_required=0 OR (fee_amount_minor IS NOT NULL AND currency_code IS NOT NULL))
);

-- Financial terms are historical booking evidence. Later payment processing
-- will use separate intent/event rows rather than mutating this snapshot.
CREATE TRIGGER IF NOT EXISTS appointment_financial_snapshots_no_update
BEFORE UPDATE ON appointment_financial_snapshots
BEGIN
  SELECT RAISE(ABORT, 'appointment_financial_snapshot_immutable');
END;
CREATE TRIGGER IF NOT EXISTS appointment_financial_snapshots_no_delete
BEFORE DELETE ON appointment_financial_snapshots
BEGIN
  SELECT RAISE(ABORT, 'appointment_financial_snapshot_immutable');
END;

CREATE TABLE IF NOT EXISTS appointment_events (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  from_status TEXT CHECK (
    from_status IS NULL OR from_status IN (
      'requested','confirmed','cancelled','rescheduled','checked_in',
      'in_progress','completed','no_show'
    )
  ),
  to_status TEXT NOT NULL CHECK (
    to_status IN (
      'requested','confirmed','cancelled','rescheduled','checked_in',
      'in_progress','completed','no_show'
    )
  ),
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'requested','confirmed','cancelled','rescheduled','checked_in',
      'started','completed','no_show'
    )
  ),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('patient','runtime_user','platform')),
  actor_id TEXT,
  reason_code TEXT,
  replacement_appointment_id TEXT REFERENCES appointments(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS appointment_events_appointment_time_idx
  ON appointment_events(appointment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS appointment_events_practice_time_idx
  ON appointment_events(practice_id, created_at DESC);

-- Intentionally absent in P5-C3:
-- * payment intents, gateway/provider identifiers or raw payment credentials
-- * notification delivery jobs (P5-D)
-- * any mutation or replacement of practice-local patient_registry ownership
-- * any clinical-record grant derived solely from an appointment
