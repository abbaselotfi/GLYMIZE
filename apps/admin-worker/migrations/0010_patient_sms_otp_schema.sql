-- P5-A: provider-neutral SMS OTP persistence, schema only.
-- PATIENT_SMS_OTP_ENABLED remains OFF and no delivery/login route is added by
-- this migration. Codes and destinations must never be stored in plaintext.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS patient_account_otp_challenges (
  id TEXT PRIMARY KEY,
  patient_identity_id TEXT NOT NULL
    REFERENCES patient_account_identities(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (
    purpose IN ('login','password_recovery','identity_verification')
  ),
  destination_lookup_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5
    CHECK (max_attempts >= 1 AND max_attempts <= 10),
  consumed_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (consumed_at IS NULL OR revoked_at IS NULL)
);

CREATE INDEX IF NOT EXISTS patient_account_otp_challenges_identity_idx
  ON patient_account_otp_challenges(patient_identity_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS patient_account_otp_challenges_expiry_idx
  ON patient_account_otp_challenges(destination_lookup_hash, expires_at);
