-- P5-A: preserve the authorization source across Portal refresh rotation.
-- A verified global-account link may issue a Portal session without changing
-- or depending on the legacy practice-local Portal password state.

PRAGMA foreign_keys = ON;

ALTER TABLE portal_refresh_tokens
  ADD COLUMN auth_source TEXT NOT NULL DEFAULT 'legacy_portal'
    CHECK (auth_source IN ('legacy_portal','patient_identity'));

CREATE INDEX IF NOT EXISTS portal_refresh_tokens_auth_source_idx
  ON portal_refresh_tokens(portal_user_id, auth_source, expires_at);
