-- P5-A3: Global Patient Identity v2 foundation.
-- Additive schema only. Runtime activation, self-registration and SMS remain OFF.
-- This migration intentionally does not alter patient_registry, portal_users,
-- patient records or current Portal v1 authorization.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS patient_accounts (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','disabled','closed')),
  proofing_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (proofing_status IN ('unverified','pending','verified','rejected')),
  password_hash TEXT,
  password_salt TEXT,
  password_iterations INTEGER,
  password_updated_at TEXT,
  credentials_revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  CHECK (
    (password_hash IS NULL AND password_salt IS NULL AND password_iterations IS NULL)
    OR
    (password_hash IS NOT NULL AND password_salt IS NOT NULL AND password_iterations IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS patient_accounts_status_updated_idx
  ON patient_accounts(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS patient_account_identities (
  id TEXT PRIMARY KEY,
  patient_account_id TEXT NOT NULL
    REFERENCES patient_accounts(id) ON DELETE CASCADE,
  identity_kind TEXT NOT NULL CHECK (identity_kind IN ('national_id','mobile')),
  lookup_hash TEXT NOT NULL,
  value_ciphertext TEXT NOT NULL,
  value_iv TEXT NOT NULL,
  value_auth_tag TEXT NOT NULL,
  display_mask TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','pending','verified','rejected')),
  verification_source TEXT,
  verified_at TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(identity_kind, lookup_hash)
);
CREATE INDEX IF NOT EXISTS patient_account_identities_account_idx
  ON patient_account_identities(patient_account_id, identity_kind, verification_status);

CREATE TABLE IF NOT EXISTS patient_account_sessions (
  id TEXT PRIMARY KEY,
  patient_account_id TEXT NOT NULL
    REFERENCES patient_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  family_id TEXT NOT NULL,
  parent_token_id TEXT,
  replaced_by_token_id TEXT,
  persistent INTEGER NOT NULL DEFAULT 0 CHECK (persistent IN (0,1)),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  compromised_at TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  device_label TEXT
);
CREATE INDEX IF NOT EXISTS patient_account_sessions_account_idx
  ON patient_account_sessions(patient_account_id, expires_at);
CREATE INDEX IF NOT EXISTS patient_account_sessions_family_idx
  ON patient_account_sessions(family_id, revoked_at, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS patient_account_sessions_parent_uq
  ON patient_account_sessions(parent_token_id) WHERE parent_token_id IS NOT NULL;

-- Transitional mapping only. A verified row does not replace the future
-- care_relationship authorization domain and never merges clinical records.
CREATE TABLE IF NOT EXISTS portal_user_account_links (
  portal_user_id TEXT PRIMARY KEY
    REFERENCES portal_users(id) ON DELETE CASCADE,
  patient_account_id TEXT NOT NULL
    REFERENCES patient_accounts(id) ON DELETE CASCADE,
  link_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (link_status IN ('pending','verified','rejected','revoked')),
  provenance TEXT NOT NULL CHECK (
    provenance IN ('clinician_referral','practice_confirmation','verified_mobile','admin_review','legacy_review')
  ),
  verified_by_runtime_user_id TEXT
    REFERENCES runtime_users(id) ON DELETE SET NULL,
  verified_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (link_status='verified' AND verified_at IS NOT NULL)
    OR link_status<>'verified'
  )
);
CREATE INDEX IF NOT EXISTS portal_user_account_links_account_idx
  ON portal_user_account_links(patient_account_id, link_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS patient_account_security_events (
  id TEXT PRIMARY KEY,
  patient_account_id TEXT
    REFERENCES patient_accounts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL
    CHECK (actor_type IN ('patient','runtime_user','platform','anonymous')),
  actor_id TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS patient_account_security_events_account_time_idx
  ON patient_account_security_events(patient_account_id, created_at DESC);
