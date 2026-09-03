-- P5-C3 follow-up: freeze notice terms and enforce append-only lifecycle rows.
-- Kept separate because 0016 was already exercised on the isolated RC D1.
PRAGMA foreign_keys = ON;

ALTER TABLE appointments ADD COLUMN cancellation_notice_minutes INTEGER NOT NULL DEFAULT 0
  CHECK (cancellation_notice_minutes BETWEEN 0 AND 43200);
ALTER TABLE appointments ADD COLUMN reschedule_notice_minutes INTEGER NOT NULL DEFAULT 0
  CHECK (reschedule_notice_minutes BETWEEN 0 AND 43200);

CREATE UNIQUE INDEX IF NOT EXISTS appointment_participants_patient_uq
  ON appointment_participants(appointment_id, patient_account_id)
  WHERE patient_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS appointment_participants_runtime_user_uq
  ON appointment_participants(appointment_id, runtime_user_id)
  WHERE runtime_user_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS appointment_events_no_update
BEFORE UPDATE ON appointment_events
BEGIN
  SELECT RAISE(ABORT, 'appointment_event_immutable');
END;
CREATE TRIGGER IF NOT EXISTS appointment_events_no_delete
BEFORE DELETE ON appointment_events
BEGIN
  SELECT RAISE(ABORT, 'appointment_event_immutable');
END;
