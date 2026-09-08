# Patient Clinical Core — B1 Index

The B1 architecture work is intentionally split into small focused documents:

- [`PATIENT_CLINICAL_CORE_INVENTORY.md`](PATIENT_CLINICAL_CORE_INVENTORY.md) — factual current-state inventory, target core boundary, visual/touch Clinical Awareness Contract, AI and Clinical Module boundaries, and B2–B8 sequence.
- [`PATIENT_CLINICAL_CORE_MIGRATION_ADR.md`](PATIENT_CLINICAL_CORE_MIGRATION_ADR.md) — accepted incremental-convergence migration decision; preserves Worker/D1 Patient Record v2 authority and prohibits a second patient store.
- [`PATIENT_CLINICAL_CORE_GAP_MATRIX.md`](PATIENT_CLINICAL_CORE_GAP_MATRIX.md) — trackable gaps and ownership/closure sequence for B2+.

Canonical product direction remains in [`../ROADMAP.md`](../ROADMAP.md), and all implementation must comply with [`MODULARITY_AND_CHANGEABILITY_POLICY.md`](MODULARITY_AND_CHANGEABILITY_POLICY.md).

## B1 conclusion

Proceed to **B2 — Canonical Patient Core contracts and read projection** only after this B1 PR validates and the post-merge Codebase Memory snapshot is verified against the resulting `main` SHA.
