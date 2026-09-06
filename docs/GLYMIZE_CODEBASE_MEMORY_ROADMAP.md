# GLYMIZE — Codebase Memory Roadmap Gate

Status: Normative companion roadmap / engineering workflow contract
Updated: 2026-09-07
Applies to: every implementation, refactor, migration, contract change, route change, UI change with shared dependencies, architecture change, and release-preparation task

This document is a mandatory companion to `docs/GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md`. A task is not considered ready to start or complete unless both the Roadmap gate and the applicable Codebase Memory gates below have been satisfied.

## 1. Purpose

GLYMIZE maintains a persistent Codebase Memory knowledge graph so implementation work does not repeatedly rediscover the whole repository. The graph is used to identify package boundaries, symbols, imports, call paths, routes, hotspots, and likely blast radius before code is changed.

The graph is an engineering navigation and impact-analysis aid. It does **not** replace Roadmap review, direct source inspection, authorization/security review, clinical-rule review, migrations review, deterministic tests, CI, RC acceptance, or production invariants.

The operating principle is:

- **Roadmap = what/why/order/gates**
- **Graph = where/dependencies/blast radius**
- **Source + tests + CI = implementation truth and verification**

## 2. Shared baseline and portability

The Codebase Memory project name and local path are machine-specific and must not be treated as canonical project identity. Agents must resolve the current project from the repository root and `list_projects`/`index_status` rather than relying on one workstation path.

The first local full index created on 2026-09-06 used Codebase Memory MCP `0.10.8` and reported:

- nodes: `5097`
- edges: `19109`
- persistent artifact: `.codebase-memory/graph.db.zst`
- metadata: `.codebase-memory/artifact.json`
- auto-index: enabled
- auto-index file limit: `50000`

That first count is retained as historical evidence only. It must **not** be treated as the canonical shared baseline until a verified re-index is performed from a working tree whose `HEAD` is proven to match the intended canonical base commit, and the resulting `.codebase-memory/` artifact is committed to the private repository.

Known initial best-effort index limitations:

- `apps/web/public/data/glymize-clinician-market-v2.json` timed out during parsing and is data rather than code/dependency structure; it is excluded by repo-level `.cbmignore` from future graph indexing unless a task specifically requires its contents;
- several SQL migration files were indexed partially around parser-specific constructs;
- image/SVG/build-info and ignored files are intentionally not graph-indexed.

SQL migrations are **not** excluded from the graph merely because parsing is partial. Schema/migration work always requires direct source inspection in addition to graph queries.

## 3. Mandatory ROADMAP gate before coding

Before every new coding task:

1. Read `docs/GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md` and any companion roadmap applicable to the task area.
2. Identify the exact current Roadmap item/phase, prerequisites, already-completed neighboring work, acceptance criteria, and release/production restrictions.
3. Compare the requested work with current source and recent merged work to prevent duplicate implementation or re-opening already-closed tasks.
4. Do not start lower-priority or conflicting work merely because a graph path exists. Roadmap order and accepted architecture decisions govern scope unless the owner explicitly changes priority.
5. If implementation reality has overtaken the Roadmap, record that drift and update the Roadmap/checklist as part of the task rather than silently working from stale planning data.

No implementation task is considered started until this Roadmap review is complete.

## 4. Mandatory PRE-TASK graph gate

After Roadmap review and before editing source:

1. Confirm the repository, working branch and intended base commit. For work against current `main`, prove the local base is synchronized with `origin/main` before treating the graph as canonical.
2. Check Codebase Memory project/index status with `index_status`.
3. If an existing graph may be stale, run `detect_changes` **before** re-indexing so the unindexed delta and its likely impact are captured rather than erased by the refresh.
4. Refresh the graph after capturing the delta when the graph is stale. Prefer incremental/automatic refresh; use a full re-index when the graph is missing, corrupted, schema-incompatible, or incremental correctness is uncertain.
5. Use the graph to identify relevant architecture before broad file reading. At minimum inspect relevant symbols/modules and likely incoming/outgoing dependencies with appropriate Codebase Memory tools, such as:
   - `get_architecture`
   - `search_graph`
   - `query_graph`
   - `trace_path`
   - `get_code_snippet`
   - `search_code`
   - `detect_changes`
6. Establish a pre-change blast-radius hypothesis: files/packages/routes/contracts/migrations/tests expected to be affected.
7. Directly inspect every security-, authorization-, clinical-authority-, migration-, encryption-, patient-isolation-, order-authority-, runtime-binding-, or deployment-critical source identified by the graph. Never rely on graph inference alone for a safety-critical change.
8. Only then define the smallest implementation scope.

If graph and source disagree, **verified source code wins** and the graph must be refreshed or treated as stale before proceeding.

## 5. During implementation

During a task:

- keep changes inside the expected blast radius unless a new dependency is explicitly discovered;
- when a new dependency or caller/callee relationship is discovered, update the working impact assessment before expanding scope;
- use graph queries to avoid duplicate helpers, duplicate storage, duplicate preferences, parallel authority paths, and redundant contracts;
- re-check the Roadmap if the implementation uncovers scope that crosses into another phase or acceptance gate;
- do not weaken security/clinical boundaries merely to satisfy structural graph expectations;
- normal test and CI requirements remain mandatory.

## 6. Mandatory POST-TASK graph + Roadmap gate

At the end of every task, before declaring it complete:

1. Determine whether the task changed graph-relevant structure. Examples include functions/classes/components/exports, imports, package boundaries, routes, shared contracts, Worker/runtime wiring, migrations/schema relationships, shared UI adapters, and shared state flows.
2. If changes have not yet been indexed, run `detect_changes` **before** the final refresh and capture the reported delta/impact.
3. Compare the pre-refresh impact with the actual diff and tests. Unexpected callers/dependencies must be investigated rather than ignored.
4. Refresh Codebase Memory after the final code state is reached when graph-relevant structure changed.
5. Verify `index_status` reports a usable current project and that the persistent artifact can still be produced/read.
6. If the task changed an architectural decision, persistent boundary, authority model, significant module ownership, or important data flow, update the Codebase Memory ADR using `manage_adr`.
7. Re-open `docs/GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md` and applicable companion roadmaps. Update task/checklist status, accepted architecture decisions, sequencing or acceptance notes when the completed work changed them.
8. Record material parser/index limitations when they affect the completed task.

A documentation-only change with no source/dependency impact does not require a graph rebuild unless the documentation itself defines architecture/authority that should be reflected in ADR or shared graph documentation.

## 7. ADR versus human architecture documentation

GLYMIZE already maintains human-readable architecture documentation, including `docs/ARCHITECTURE.md`. To avoid duplicate/contradictory architecture sources:

- `docs/ARCHITECTURE.md` and the Roadmaps remain the human-readable authoritative architecture/product contracts;
- Codebase Memory ADR stores durable architecture decisions/change rationale useful to agents and graph-assisted work;
- ADR must not become a full copy of `docs/ARCHITECTURE.md`;
- when an ADR decision changes the authoritative architecture contract, update the human documentation in the same task.

## 8. Shared graph persistence policy

The canonical shared Codebase Memory snapshot belongs in the **private GitHub repository**, not only on one workstation.

Required shared files at synchronization points:

- `.codebase-memory/graph.db.zst`
- `.codebase-memory/artifact.json`
- `.codebase-memory/.gitattributes`

Rules:

- local graph may refresh whenever PRE/POST gates require it;
- do **not** commit every watcher/save refresh because the compressed database is binary and Git stores each revision as a new blob;
- commit the shared artifact deliberately after the initial canonical baseline, at milestone/release boundaries, after major architecture changes, or when another workstation/agent needs a materially newer bootstrap snapshot;
- the artifact commit must correspond to a verified repository base and should record the indexed source commit in the task/PR description or baseline note;
- if artifact churn becomes material, evaluate Git LFS or a lower-frequency publishing policy rather than growing repository history without control;
- local-only graph state must never be reported as the project/team baseline.

## 9. Daemon / auto-index semantics

`auto_index=true` is configuration, not proof that a persistent watcher is currently running. One-shot CLI commands may start a temporary daemon and exit.

Therefore PRE/POST gates must use `index_status`/`detect_changes` explicitly and must not assume the graph is current merely because auto-index is enabled. A persistent daemon may be used for convenience, but correctness must remain observable through explicit status checks.

## 10. Task completion contract

For GLYMIZE engineering work, `DONE` means all applicable existing Definition-of-Done gates **plus**:

- primary Roadmap and applicable companion roadmap reviewed before implementation;
- current task/order/acceptance gate identified and duplicate work ruled out;
- repository base verified;
- PRE-TASK graph status and pre-refresh delta checked when applicable;
- graph-assisted dependency/blast-radius review completed;
- critical source paths directly inspected;
- implementation/tests/CI completed;
- POST-TASK pre-refresh impact captured when applicable;
- graph refreshed after graph-relevant changes;
- ADR refreshed when architecture changed;
- Roadmap/checklist refreshed when task status or accepted design changed;
- shared graph artifact synchronized to GitHub when persistence policy calls for it.

## 11. Default operating rule for AI agents

Before modifying GLYMIZE, an AI coding agent must first consult the current Roadmap(s), then the current Codebase Memory graph, then the relevant source. After modifying GLYMIZE, the agent must reconcile tests/diff with graph impact, refresh graph/ADR when needed, and update Roadmap state before reporting completion.

If Codebase Memory is unavailable, work may proceed only with explicit fallback to direct repository inspection and the limitation must be reported. The graph should be restored/refreshed before the next normal task where possible.
