-- P5-A: reviewed bridge between a global patient account and the current
-- practice-local Portal identity. This remains a migration bridge only;
-- care_relationships belong to P5-B and patient_registry stays authoritative.

PRAGMA foreign_keys = ON;

ALTER TABLE portal_user_account_links
  ADD COLUMN requested_by_runtime_user_id TEXT
    REFERENCES runtime_users(id) ON DELETE SET NULL;

ALTER TABLE portal_user_account_links
  ADD COLUMN verification_method TEXT CHECK (
    verification_method IS NULL OR verification_method IN (
      'in_person_document_review',
      'existing_portal_reauthentication',
      'verified_contact_callback'
    )
  );

ALTER TABLE portal_user_account_links
  ADD COLUMN reviewed_at TEXT;

CREATE INDEX IF NOT EXISTS portal_user_account_links_practice_review_idx
  ON portal_user_account_links(link_status, reviewed_at, updated_at DESC);
