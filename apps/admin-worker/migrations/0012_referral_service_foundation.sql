-- P5-B2 Referral Service foundation.
-- Codes are high-entropy credentials and only a keyed hash plus a short hint is stored.
-- Redemption records intent only; they do not grant clinical access or create care relationships.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS referral_invites (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  issuer_user_id TEXT NOT NULL,
  intended_physician_user_id TEXT NOT NULL,
  provider_profile_id TEXT NOT NULL
    REFERENCES provider_profiles(id) ON DELETE RESTRICT,
  workflow TEXT NOT NULL DEFAULT 'provider_connection'
    CHECK (workflow IN ('provider_connection')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','revoked','exhausted')),
  code_hash TEXT NOT NULL UNIQUE,
  code_hint TEXT NOT NULL,
  purpose_label TEXT,
  provider_display_name TEXT NOT NULL,
  specialty_name TEXT NOT NULL,
  practice_display_name TEXT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 100),
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count BETWEEN 0 AND max_uses),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by_user_id TEXT REFERENCES runtime_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (practice_id, issuer_user_id)
    REFERENCES practice_memberships(practice_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (practice_id, intended_physician_user_id)
    REFERENCES practice_memberships(practice_id, user_id) ON DELETE RESTRICT,
  CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),
  CHECK (status <> 'exhausted' OR use_count = max_uses)
);

CREATE INDEX IF NOT EXISTS referral_invites_practice_status_idx
  ON referral_invites(practice_id, status, expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_invites_physician_status_idx
  ON referral_invites(intended_physician_user_id, status, expires_at);

CREATE TABLE IF NOT EXISTS referral_redemptions (
  id TEXT PRIMARY KEY,
  referral_id TEXT NOT NULL REFERENCES referral_invites(id) ON DELETE RESTRICT,
  patient_account_id TEXT NOT NULL REFERENCES patient_accounts(id) ON DELETE RESTRICT,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  intended_physician_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_care_relationship'
    CHECK (status IN ('pending_care_relationship','converted','cancelled','rejected')),
  patient_proofing_status_at_redeem TEXT NOT NULL
    CHECK (patient_proofing_status_at_redeem IN ('unverified','pending','verified','rejected')),
  redeemed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (referral_id, patient_account_id),
  FOREIGN KEY (practice_id, intended_physician_user_id)
    REFERENCES practice_memberships(practice_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS referral_redemptions_patient_status_idx
  ON referral_redemptions(patient_account_id, status, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS referral_redemptions_practice_status_idx
  ON referral_redemptions(practice_id, status, redeemed_at DESC);

-- Intentionally absent in P5-B2:
-- * plaintext referral codes
-- * changes to patient_registry
-- * care_relationship creation or clinical authorization
