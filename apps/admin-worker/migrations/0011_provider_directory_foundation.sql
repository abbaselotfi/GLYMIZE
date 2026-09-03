-- P5-B1 Provider Directory foundation.
-- Additive only: patient_registry remains the authoritative practice-local clinical file.
-- Directory discovery does not create a referral, care relationship, or clinical-data grant.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS provider_profiles (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  physician_user_id TEXT NOT NULL,
  directory_status TEXT NOT NULL DEFAULT 'hidden'
    CHECK (directory_status IN ('hidden','published','suspended')),
  display_name TEXT NOT NULL,
  specialty_code TEXT,
  specialty_name TEXT NOT NULL,
  subspecialty_name TEXT,
  practice_display_name TEXT NOT NULL,
  public_location TEXT,
  visit_modes_json TEXT NOT NULL DEFAULT '[]',
  languages_json TEXT NOT NULL DEFAULT '[]',
  show_medical_council_code INTEGER NOT NULL DEFAULT 0
    CHECK (show_medical_council_code IN (0,1)),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (practice_id, physician_user_id),
  FOREIGN KEY (practice_id, physician_user_id)
    REFERENCES practice_memberships(practice_id, user_id) ON DELETE CASCADE,
  CHECK (directory_status <> 'published' OR published_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS provider_profiles_public_specialty_idx
  ON provider_profiles(directory_status, specialty_code, updated_at DESC);
CREATE INDEX IF NOT EXISTS provider_profiles_physician_idx
  ON provider_profiles(physician_user_id, directory_status, updated_at DESC);

-- Intentionally absent in P5-B1:
-- * changes to patient_registry
-- * referral or QR credentials
-- * care relationships or clinical authorization
