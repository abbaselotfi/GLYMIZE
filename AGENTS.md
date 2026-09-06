# GLYMIZE agent instructions

All coding agents working in this repository must follow the normative engineering contract in:

`docs/GLYMIZE_CODEBASE_MEMORY_ROADMAP.md`

## Before every implementation task

1. Read `docs/GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md`.
2. Read any directly applicable companion roadmap under `docs/`.
3. Identify the exact roadmap item, phase, dependencies, acceptance gates, and whether the work already exists or is partially complete.
4. Run the PRE-TASK Codebase Memory gate: confirm the branch contains current `origin/main`, check graph status, capture `detect_changes` before refresh, refresh if stale, map dependencies/blast radius, and directly inspect safety-critical source paths.
5. Only then modify code.

## After every task

1. Run `detect_changes` before graph refresh when graph-relevant code changed.
2. Compare the graph delta with the intended scope, Git diff, and tests.
3. Refresh the graph when required and verify it remains usable.
4. Update Codebase Memory ADR and `docs/ARCHITECTURE.md` when an architecture decision/boundary changed.
5. Re-read the applicable roadmap item and update roadmap/checklist documentation when the accepted product state changed.
6. Do not declare the task complete until the applicable post-task gates are done.

## Pull request declarations

Every PR to `main` must contain checked declarations:

- `- [x] Roadmap review: PASS`
- `- [x] Graph gate: PASS`

CI rejects a PR when either declaration is missing.

The graph is advisory. Source code, deterministic tests, CI, authorization/security rules, clinical authority, migration safety, and RC/production gates remain authoritative.
