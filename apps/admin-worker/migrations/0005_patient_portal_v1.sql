-- GLYMIZE Patient Portal v1 (WS-2 / WS-3): online-visit patient access.
-- Migration 0003 is frozen; verify the 0004 chain against the target D1
-- before applying this additive migration.
--
-- Design rules:
--   * Patient identity is a SEPARATE domain from runtime_users (physician/assistant).
--   * No plaintext login handle: keyed-hash lookup key, original value encrypted.
--   * Patient-submitted intake lives in its own tables and is NEVER merged into
--     patient_encounters automatically; physician review is mandatory.
--   * Media bytes live in a private R2 bucket (binding PORTAL_MEDIA) and are
--     never publicly addressable; only metadata is stored in D1.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS portal_users (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  login_kind TEXT NOT NULL CHECK (login_kind IN ('mobile','email')),
  -- Keyed HMAC of the normalized handle. Lookup key only; never the raw value.
  login_hash TEXT NOT NULL UNIQUE,
  login_ciphertext TEXT NOT NULL,
  login_iv TEXT NOT NULL,
  login_auth_tag TEXT NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  password_iterations INTEGER,
  password_updated_at TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1)),
  created_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(practice_id, patient_id)
);
CREATE INDEX IF NOT EXISTS portal_users_practice_idx ON portal_users(practice_id, status);

CREATE TABLE IF NOT EXISTS portal_refresh_tokens (
  id TEXT PRIMARY KEY,
  portal_user_id TEXT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  persistent INTEGER NOT NULL DEFAULT 0 CHECK (persistent IN (0,1)),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  device_label TEXT
);
CREATE INDEX IF NOT EXISTS portal_refresh_tokens_user_idx
  ON portal_refresh_tokens(portal_user_id, expires_at);

-- Patient-reported intake. Physician review is mandatory before any of this
-- content can enter the clinical record (encounter link is explicit only).
CREATE TABLE IF NOT EXISTS portal_submissions (
  id TEXT PRIMARY KEY,
  portal_user_id TEXT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('medications','labs','vitals','note')),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','acknowledged','reviewed','archived')),
  payload_ciphertext TEXT NOT NULL,
  payload_iv TEXT NOT NULL,
  payload_auth_tag TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'portal-submission-v1',
  reviewed_by TEXT REFERENCES runtime_users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  encounter_id TEXT REFERENCES patient_encounters(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS portal_submissions_practice_status_idx
  ON portal_submissions(practice_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_submissions_patient_idx
  ON portal_submissions(patient_id, created_at DESC);

-- One secure messaging thread per patient per practice.
CREATE TABLE IF NOT EXISTS portal_threads (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patient_registry(id) ON DELETE CASCADE,
  portal_user_id TEXT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  physician_id TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  encounter_id TEXT REFERENCES patient_encounters(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  last_message_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(practice_id, patient_id)
);
CREATE INDEX IF NOT EXISTS portal_threads_practice_idx
  ON portal_threads(practice_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS portal_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES portal_threads(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('patient','physician')),
  sender_portal_user_id TEXT REFERENCES portal_users(id) ON DELETE SET NULL,
  sender_runtime_user_id TEXT REFERENCES runtime_users(id) ON DELETE SET NULL,
  body_ciphertext TEXT NOT NULL,
  body_iv TEXT NOT NULL,
  body_auth_tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (
    (sender_role='patient' AND sender_portal_user_id IS NOT NULL AND sender_runtime_user_id IS NULL)
    OR
    (sender_role='physician' AND sender_runtime_user_id IS NOT NULL AND sender_portal_user_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS portal_messages_thread_idx
  ON portal_messages(thread_id, created_at);

-- Metadata only. Bytes are stored privately under media_key (unguessable
-- random path) in the PORTAL_MEDIA R2 bucket; downloads are authenticated.
CREATE TABLE IF NOT EXISTS portal_message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES portal_messages(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES portal_threads(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  media_key TEXT NOT NULL UNIQUE,
  media_kind TEXT NOT NULL CHECK (media_kind IN ('image','video')),
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS portal_message_attachments_message_idx
  ON portal_message_attachments(message_id);