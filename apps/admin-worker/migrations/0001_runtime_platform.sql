-- GLYMIZE Online Runtime Platform v1
-- D1 / SQLite. No plaintext patient identifiers or clinical payloads are stored.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runtime_users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('physician','assistant')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email_norm TEXT,
  mobile_norm TEXT,
  medical_council_code TEXT,
  irimc_status TEXT CHECK (irimc_status IN ('verified','pending','unavailable')),
  irimc_verified_at TEXT,
  irimc_verification_source TEXT,
  profile_photo TEXT,
  profile_photo_source TEXT NOT NULL DEFAULT 'none' CHECK (profile_photo_source IN ('irimc','user_upload','none')),
  layout_preset TEXT NOT NULL DEFAULT 'auto' CHECK (layout_preset IN ('auto','command_center','focused_workflow','compact_cards')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS runtime_users_email_uq ON runtime_users(email_norm) WHERE email_norm IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS runtime_users_mobile_uq ON runtime_users(mobile_norm) WHERE mobile_norm IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS runtime_users_medical_council_uq ON runtime_users(medical_council_code) WHERE medical_council_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS practices (
  id TEXT PRIMARY KEY,
  owner_physician_id TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS practices_owner_uq ON practices(owner_physician_id);

CREATE TABLE IF NOT EXISTS practice_memberships (
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('physician','assistant')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  permissions_json TEXT NOT NULL DEFAULT '[]',
  invited_by TEXT REFERENCES runtime_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (practice_id,user_id)
);
CREATE INDEX IF NOT EXISTS practice_memberships_user_idx ON practice_memberships(user_id,status);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  persistent INTEGER NOT NULL DEFAULT 0 CHECK (persistent IN (0,1)),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  device_label TEXT
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id,practice_id,expires_at);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES runtime_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms')),
  destination_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('login')),
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS otp_challenges_expiry_idx ON otp_challenges(expires_at);

CREATE TABLE IF NOT EXISTS team_invitations (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'assistant' CHECK (role='assistant'),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email_norm TEXT,
  mobile_norm TEXT,
  permissions_json TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS team_invitations_practice_idx ON team_invitations(practice_id,created_at);

CREATE TABLE IF NOT EXISTS patient_handoffs (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  patient_code_hash TEXT NOT NULL,
  patient_code_kind TEXT NOT NULL CHECK (patient_code_kind IN ('file_number','national_id','other')),
  patient_code_display TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready_for_physician',
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES runtime_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(practice_id,patient_code_hash)
);
CREATE INDEX IF NOT EXISTS patient_handoffs_practice_updated_idx ON patient_handoffs(practice_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES runtime_users(id) ON DELETE SET NULL,
  practice_id TEXT REFERENCES practices(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_practice_created_idx ON audit_log(practice_id,created_at DESC);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0)
);
