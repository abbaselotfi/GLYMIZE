# GLYMIZE agent instructions

All coding agents working in this repository must follow both normative planning and engineering gates before changing code.

## Mandatory sources before implementation

Before every implementation, refactor, migration, contract, route, shared-UI, release-preparation, or architecture task, the agent must read and reconcile the task against:

1. `docs/GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md` — product/clinical implementation order, safety constraints, acceptance gates and remaining roadmap work;
2. `docs/GLYMIZE_CODEBASE_MEMORY_ROADMAP.md` — Codebase Memory graph/index/impact-analysis gate;
3. any companion roadmap explicitly referenced by the primary roadmap for the task area.

The agent must not start from the graph alone. The Roadmap defines **what should be built and in what order**; the graph helps determine **where and with what blast radius**.

## Mandatory PRE-TASK gate

Before modifying code:

- confirm the working branch/base is current with the intended `main`/release base;
- review the primary Roadmap and identify the exact current task/gate, already-completed adjacent work, dependencies and acceptance criteria;
- stop duplicate or out-of-order implementation when the Roadmap or current source shows the work already exists;
- check Codebase Memory index status;
- run `detect_changes` before refreshing when an existing graph may be stale, so the unindexed delta is not erased before impact review;
- refresh the graph if stale/missing after capturing the pre-refresh delta;
- use the graph to identify relevant symbols, dependencies, callers/callees, routes, contracts and likely blast radius;
- directly inspect safety-critical source paths before editing, including authentication/authorization, clinical authority, patient isolation, encryption, migrations/schema, signed orders, runtime bindings and deployment boundaries.

If Roadmap, graph and source disagree, direct source plus verified current repository state wins for implementation truth; the Roadmap/graph must then be corrected or explicitly marked stale before continuing.

## Mandatory POST-TASK gate

After implementation, before declaring a task complete:

- run deterministic tests and applicable CI/RC gates;
- run `detect_changes` before the final graph refresh when changes have not yet been indexed, and compare the reported blast radius with the actual diff/tests;
- refresh the graph when graph-relevant code changed;
- verify the refreshed graph/index is usable;
- update the Codebase Memory ADR when architecture, module ownership, authority boundaries, persistent data flow or significant dependency decisions changed;
- update the primary Roadmap/checklist when task status, implementation order, acceptance state or an accepted architecture/product decision changed;
- update companion roadmaps when their scope changed;
- do not declare `DONE` until Roadmap state and graph state both reflect the completed work.

## Shared graph persistence

The canonical shared Codebase Memory snapshot belongs in the private repository under `.codebase-memory/` at deliberate synchronization points. Local-only graph state must never be treated as the team/project baseline.

The graph is advisory. Source code, deterministic tests, CI, authorization/security rules, clinical authority, migration safety and RC/production gates remain authoritative.
