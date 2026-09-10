# Patient Clinical Core — B1 Index

The B1 architecture work is intentionally split into small focused documents:

- [`PATIENT_CLINICAL_CORE_INVENTORY.md`](PATIENT_CLINICAL_CORE_INVENTORY.md) — factual current-state inventory, target core boundary, visual/touch Clinical Awareness Contract, AI and Clinical Module boundaries, and B2–B8 sequence.
- [`PATIENT_CLINICAL_CORE_MIGRATION_ADR.md`](PATIENT_CLINICAL_CORE_MIGRATION_ADR.md) — accepted incremental-convergence migration decision; preserves Worker/D1 Patient Record v2 authority and prohibits a second patient store.
- [`PATIENT_CLINICAL_CORE_GAP_MATRIX.md`](PATIENT_CLINICAL_CORE_GAP_MATRIX.md) — trackable gaps and ownership/closure sequence for B2+.

Canonical product direction remains in [`../ROADMAP.md`](../ROADMAP.md), and all implementation must comply with [`MODULARITY_AND_CHANGEABILITY_POLICY.md`](MODULARITY_AND_CHANGEABILITY_POLICY.md).

## Current execution status — 2026-09-10

B1, B2 and B3 foundations are implemented. C1 workspace implementation and R28-02 through R28-07 hardening are complete in repository history. **R28-08 is the next canonical engineering task**; observed physician workflow and clinic-ready acceptance remain R28-09.

Use the [Roadmap Status Crosswalk](../ROADMAP_STATUS_CROSSWALK_2026-09-09.md) for current gaps and the mapping of historical B4–B8 aliases. Do not restart B2 from the historical inventory below. Migration `0019` and Allergy/Problem rollout remain separate environment work; repository completion is not deployment evidence.

## Historical B1 conclusion

At the B1 baseline, B2 was the next task after B1 validation and the post-merge graph snapshot. The inventory retains that historical sequence; subsequent completion is recorded in the current crosswalk.
