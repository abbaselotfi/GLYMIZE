-- Phase 0 / Task 6: request-time RBAC for patient-adjacent Worker routes.
--
-- Clinical membership roles remain physician/assistant. These deliberately
-- separate access roles express what a runtime user may do to patient data:
-- editors may read and draft changes; approvers may also approve changes.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS patient_access_role_assignments (
  practice_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('editor','approver')),
  assignment_source TEXT NOT NULL DEFAULT 'membership_sync'
    CHECK (assignment_source IN ('membership_migration','membership_sync','manual')),
  assigned_by TEXT REFERENCES runtime_users(id) ON DELETE SET NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (practice_id,user_id),
  FOREIGN KEY (practice_id,user_id)
    REFERENCES practice_memberships(practice_id,user_id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS patient_access_role_assignments_user_idx
  ON patient_access_role_assignments(user_id,practice_id,role);

-- Preserve current access while moving authorization to explicit persisted
-- roles. A physician starts as approver; an assistant starts as editor.
INSERT INTO patient_access_role_assignments
  (practice_id,user_id,role,assignment_source,assigned_by,assigned_at)
SELECT
  practice_id,
  user_id,
  CASE role WHEN 'physician' THEN 'approver' ELSE 'editor' END,
  'membership_migration',
  invited_by,
  updated_at
FROM practice_memberships
WHERE status='active'
ON CONFLICT(practice_id,user_id) DO NOTHING;

-- New memberships receive a safe role without relying on application code.
CREATE TRIGGER IF NOT EXISTS patient_access_role_membership_insert
AFTER INSERT ON practice_memberships
WHEN NEW.status='active'
BEGIN
  INSERT INTO patient_access_role_assignments
    (practice_id,user_id,role,assignment_source,assigned_by,assigned_at)
  VALUES (
    NEW.practice_id,
    NEW.user_id,
    CASE NEW.role WHEN 'physician' THEN 'approver' ELSE 'editor' END,
    'membership_sync',
    NEW.invited_by,
    NEW.updated_at
  )
  ON CONFLICT(practice_id,user_id) DO NOTHING;
END;

-- A clinical-role or membership-status change invalidates the previous
-- patient-access assignment. Explicit manual grants remain possible after
-- this synchronization event.
CREATE TRIGGER IF NOT EXISTS patient_access_role_membership_update
AFTER UPDATE OF role,status ON practice_memberships
BEGIN
  DELETE FROM patient_access_role_assignments
  WHERE practice_id=NEW.practice_id AND user_id=NEW.user_id;

  INSERT INTO patient_access_role_assignments
    (practice_id,user_id,role,assignment_source,assigned_by,assigned_at)
  SELECT
    NEW.practice_id,
    NEW.user_id,
    CASE NEW.role WHEN 'physician' THEN 'approver' ELSE 'editor' END,
    'membership_sync',
    NEW.invited_by,
    NEW.updated_at
  WHERE NEW.status='active';
END;
