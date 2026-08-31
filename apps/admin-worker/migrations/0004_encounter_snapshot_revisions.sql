-- Patient Record v2 encounter revision provenance.
-- Migration 0003 is frozen. This additive migration links each searchable
-- observation row to the append-only encounter snapshot revision that created it.

ALTER TABLE patient_observations
  ADD COLUMN snapshot_revision INTEGER NOT NULL DEFAULT 1
  CHECK (snapshot_revision >= 1);

CREATE INDEX IF NOT EXISTS patient_observations_encounter_revision_idx
  ON patient_observations(encounter_id, snapshot_revision, created_at);
