-- P5-C1 Scheduling availability foundation.
-- Availability is practice/physician scoped and is not a reservation or an
-- authorization grant. Appointment and payment tables are intentionally absent.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS provider_scheduling_policies (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  physician_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','suspended')),
  time_zone TEXT NOT NULL,
  confirmation_policy TEXT NOT NULL
    CHECK (confirmation_policy IN ('auto_confirm','approval_required')),
  default_visit_duration_minutes INTEGER NOT NULL
    CHECK (default_visit_duration_minutes BETWEEN 5 AND 240),
  buffer_before_minutes INTEGER NOT NULL DEFAULT 0
    CHECK (buffer_before_minutes BETWEEN 0 AND 120),
  buffer_after_minutes INTEGER NOT NULL DEFAULT 0
    CHECK (buffer_after_minutes BETWEEN 0 AND 120),
  max_daily_appointments INTEGER NOT NULL
    CHECK (max_daily_appointments BETWEEN 1 AND 200),
  booking_horizon_days INTEGER NOT NULL
    CHECK (booking_horizon_days BETWEEN 1 AND 365),
  minimum_notice_minutes INTEGER NOT NULL
    CHECK (minimum_notice_minutes BETWEEN 0 AND 43200),
  cancellation_notice_minutes INTEGER NOT NULL
    CHECK (cancellation_notice_minutes BETWEEN 0 AND 43200),
  reschedule_notice_minutes INTEGER NOT NULL
    CHECK (reschedule_notice_minutes BETWEEN 0 AND 43200),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (practice_id, physician_user_id),
  FOREIGN KEY (practice_id, physician_user_id)
    REFERENCES practice_memberships(practice_id, user_id) ON DELETE RESTRICT,
  CHECK (status <> 'published' OR published_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS provider_scheduling_policies_status_idx
  ON provider_scheduling_policies(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS provider_availability_rules (
  id TEXT PRIMARY KEY,
  scheduling_policy_id TEXT NOT NULL
    REFERENCES provider_scheduling_policies(id) ON DELETE RESTRICT,
  practice_id TEXT NOT NULL,
  physician_user_id TEXT NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute INTEGER NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  visit_mode TEXT NOT NULL CHECK (visit_mode IN ('in_person','audio','video')),
  effective_from TEXT NOT NULL,
  effective_until TEXT,
  retired_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (practice_id, physician_user_id)
    REFERENCES practice_memberships(practice_id, user_id) ON DELETE RESTRICT,
  CHECK (end_minute > start_minute),
  CHECK (effective_until IS NULL OR effective_until >= effective_from),
  UNIQUE (
    scheduling_policy_id, weekday, start_minute, end_minute, visit_mode,
    effective_from
  )
);

CREATE INDEX IF NOT EXISTS provider_availability_rules_active_idx
  ON provider_availability_rules(
    scheduling_policy_id, weekday, effective_from, effective_until
  ) WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS provider_availability_rules_practice_idx
  ON provider_availability_rules(practice_id, physician_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS provider_availability_exceptions (
  id TEXT PRIMARY KEY,
  scheduling_policy_id TEXT NOT NULL
    REFERENCES provider_scheduling_policies(id) ON DELETE RESTRICT,
  practice_id TEXT NOT NULL,
  physician_user_id TEXT NOT NULL,
  exception_date TEXT NOT NULL,
  exception_kind TEXT NOT NULL CHECK (exception_kind IN ('unavailable','additional')),
  start_minute INTEGER CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute INTEGER CHECK (end_minute BETWEEN 1 AND 1440),
  visit_mode TEXT CHECK (visit_mode IN ('in_person','audio','video')),
  reason_label TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (practice_id, physician_user_id)
    REFERENCES practice_memberships(practice_id, user_id) ON DELETE RESTRICT,
  CHECK (
    (start_minute IS NULL AND end_minute IS NULL) OR
    (start_minute IS NOT NULL AND end_minute IS NOT NULL AND end_minute > start_minute)
  ),
  CHECK (
    exception_kind <> 'additional' OR
    (start_minute IS NOT NULL AND end_minute IS NOT NULL AND visit_mode IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS provider_availability_exceptions_active_idx
  ON provider_availability_exceptions(scheduling_policy_id, exception_date)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS provider_scheduling_events (
  id TEXT PRIMARY KEY,
  scheduling_policy_id TEXT NOT NULL
    REFERENCES provider_scheduling_policies(id) ON DELETE RESTRICT,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'policy_saved','published','hidden','rule_created','rule_retired',
      'exception_created','exception_revoked'
    )
  ),
  actor_user_id TEXT REFERENCES runtime_users(id) ON DELETE SET NULL,
  target_id TEXT,
  policy_revision INTEGER NOT NULL CHECK (policy_revision >= 1),
  meta_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS provider_scheduling_events_policy_time_idx
  ON provider_scheduling_events(scheduling_policy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS provider_scheduling_events_practice_time_idx
  ON provider_scheduling_events(practice_id, created_at DESC);

-- Intentionally absent in P5-C1:
-- * appointment, slot-lock or payment rows
-- * patient clinical-record references
-- * public claims that a displayed time is reserved
