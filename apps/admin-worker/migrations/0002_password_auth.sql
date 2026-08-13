ALTER TABLE runtime_users ADD COLUMN password_hash TEXT;
ALTER TABLE runtime_users ADD COLUMN password_salt TEXT;
ALTER TABLE runtime_users ADD COLUMN password_iterations INTEGER;
ALTER TABLE runtime_users ADD COLUMN password_updated_at TEXT;
