# GLYMIZE — Codebase Memory Roadmap Gate

Status: Normative companion roadmap / engineering workflow contract
Updated: 2026-09-06
Applies to: every implementation, refactor, migration, contract change, route change, UI change with shared dependencies, and release-preparation task
Primary codebase-memory project: `C-Users-abbas-GLYMIZE-RC-AUTHFIX-0903bdb`
Primary local repository: `C:\Users\abbas\GLYMIZE-RC-AUTHFIX-0903bdb`

This document is a mandatory companion to `docs/GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md`. A task is not considered ready to start or complete unless the applicable Codebase Memory gates below have been satisfied.

## 1. Purpose

GLYMIZE maintains a persistent Codebase Memory knowledge graph so implementation work does not repeatedly rediscover the whole repository. The graph is used to identify package boundaries, symbols, imports, call paths, routes, hotspots, and likely blast radius before code is changed.

The graph is an engineering navigation and impact-analysis aid. It does **not** replace direct source inspection, authorization/security review, clinical-rule review, migrations review, deterministic tests, CI, RC acceptance, or production invariants.

## 2. Current baseline

The initial full GLYMIZE index was created on 2026-09-06 with Codebase Memory MCP `0.10.8`:

- nodes: `5097`
- edges: `19109`
- persistent artifact: `.codebase-memory/graph.db.zst`
- metadata: `.codebase-memory/artifact.json`
- auto-index: enabled
- auto-index file limit: `50000`

Known initial best-effort index limitations:

- `apps/web/public/data/glymize-clinician-market-v2.json` timed out during parsing;
- several SQL migration files were indexed partially around parser-specific constructs;
- image/SVG/build-info and ignored files are intentionally not graph-indexed.

These limitations do not invalidate the graph, but code or schema work touching those areas requires direct file inspection in addition to graph queries.

## 3. Mandatory PRE-TASK graph gate

Before starting every new Roadmap task:

1. Confirm the working repository/branch and ensure the intended base is current.
2. Check Codebase Memory project/index status with `index_status`.
3. If the graph is stale, missing, or the source tree has changed since the last usable index, refresh it before implementation. Prefer incremental/automatic refresh; use a full re-index when the graph is missing, corrupted, schema-incompatible, or incremental correctness is uncertain.
4. Use the graph to identify the task's relevant architecture before broad file reading. At minimum inspect the relevant symbols/modules and likely incoming/outgoing dependencies with the appropriate Codebase Memory tools, such as:
   - `get_architecture`
   - `search_graph`
   - `query_graph`
   - `trace_path`
   - `get_code_snippet`
   - `search_code`
   - `detect_changes`
5. Establish a pre-change blast-radius hypothesis: files/packages/routes/contracts/migrations/tests expected to be affected.
6. Directly inspect every security-, authorization-, clinical-authority-, migration-, encryption-, patient-isolation-, order-authority-, or deployment-critical source identified by the graph. Never rely on graph inference alone for a safety-critical change.
7. Only then define the smallest implementation scope.

If the graph and source code disagree, **source code wins** and the graph must be refreshed or treated as stale before proceeding.

## 4. During implementation

During a task:

- keep changes inside the blast radius unless a new dependency is explicitly discovered;
- when a new dependency or caller/callee relationship is discovered, update the working impact assessment before expanding scope;
- use graph queries to avoid duplicate helpers, duplicate storage, duplicate preferences, parallel authority paths, and redundant contracts;
- do not weaken security/clinical boundaries merely to satisfy structural graph expectations;
- normal test and CI requirements remain mandatory.

## 5. Mandatory POST-TASK graph gate

At the end of every task, before declaring it complete:

1. Determine whether the task changed any graph-relevant structure. Examples include:
   - functions, classes, components, or exported symbols;
   - imports/dependencies;
   - package/module boundaries;
   - HTTP/API routes;
   - contracts/types used across modules;
   - Worker/runtime wiring;
   - migrations/schema relationships;
   - shared UI adapters or shared state flows.
2. If graph-relevant structure changed, refresh Codebase Memory after the final code state is reached.
3. Re-run `detect_changes`/impact analysis as appropriate and compare the resulting affected area with the actual diff and tests.
4. If the task changed an architectural decision, persistent boundary, authority model, or significant module ownership, update the Codebase Memory ADR using `manage_adr`.
5. Verify that the persistent artifact can still be produced/read and that `index_status` reports a usable project.
6. Record material parser/index limitations when they affect the completed task.

A documentation-only change with no source/dependency impact does not require a graph rebuild unless the documentation itself defines architecture that must be persisted in the ADR.

## 6. Artifact persistence policy

`.codebase-memory/graph.db.zst` is the shared persistent knowledge-graph snapshot. The repository is Private, so the artifact may be versioned with the project.

However, the graph artifact is rewritten during indexing and Git stores binary revisions as new blobs. Therefore:

- do **not** commit a refreshed graph after every file save or trivial task;
- refresh the local graph whenever required by the PRE/POST gates;
- commit the shared `graph.db.zst` and `artifact.json` deliberately at a milestone, release boundary, major architecture change, or another explicit synchronization point;
- keep `.codebase-memory/.gitattributes` with the artifact;
- if artifact churn later becomes material, evaluate Git LFS or a lower-frequency artifact publishing policy rather than growing repository history without control.

## 7. Task completion contract

For GLYMIZE engineering work, `DONE` means all applicable existing Definition-of-Done gates **plus**:

- PRE-TASK graph status checked;
- graph-assisted dependency/blast-radius review completed;
- critical source paths directly inspected;
- implementation/tests/CI completed;
- POST-TASK graph refresh performed when graph-relevant code changed;
- ADR refreshed when architecture changed;
- shared graph artifact committed only when the artifact persistence policy calls for it.

## 8. Default operating rule for AI agents

Before modifying GLYMIZE, an AI coding agent should first consult this roadmap and the current Codebase Memory graph. After modifying GLYMIZE, the agent should decide explicitly whether the graph and/or ADR require refresh before reporting the task complete.

If Codebase Memory is unavailable, work may proceed only with explicit fallback to direct repository inspection and the limitation must be reported; the graph should be restored/refreshed before the next normal task where possible.
