-- P5-A2: additive refresh-token family and replay-containment metadata.
-- Existing sessions remain valid; their token id becomes the family root lazily.

ALTER TABLE refresh_tokens ADD COLUMN family_id TEXT;
ALTER TABLE refresh_tokens ADD COLUMN parent_token_id TEXT;
ALTER TABLE refresh_tokens ADD COLUMN replaced_by_token_id TEXT;
ALTER TABLE refresh_tokens ADD COLUMN compromised_at TEXT;

UPDATE refresh_tokens SET family_id=id WHERE family_id IS NULL;

CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx
  ON refresh_tokens(family_id, revoked_at, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_parent_uq
  ON refresh_tokens(parent_token_id) WHERE parent_token_id IS NOT NULL;

ALTER TABLE portal_refresh_tokens ADD COLUMN family_id TEXT;
ALTER TABLE portal_refresh_tokens ADD COLUMN parent_token_id TEXT;
ALTER TABLE portal_refresh_tokens ADD COLUMN replaced_by_token_id TEXT;
ALTER TABLE portal_refresh_tokens ADD COLUMN compromised_at TEXT;

UPDATE portal_refresh_tokens SET family_id=id WHERE family_id IS NULL;

CREATE INDEX IF NOT EXISTS portal_refresh_tokens_family_idx
  ON portal_refresh_tokens(family_id, revoked_at, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS portal_refresh_tokens_parent_uq
  ON portal_refresh_tokens(parent_token_id) WHERE parent_token_id IS NOT NULL;
