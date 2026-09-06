# GLYMIZE — Mandatory Roadmap & Codebase Memory Task Gate

Status: Normative engineering workflow contract
Updated: 2026-09-07
Applies to: every implementation, refactor, migration, contract change, route change, shared UI change, release-preparation task, and any task that can alter architecture or clinical/runtime authority

This document is a mandatory companion to `docs/GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md` and the other domain roadmaps under `docs/`.

A GLYMIZE coding task is not ready to start, and is not complete, until the applicable gates below have been satisfied.

## 1. Mandatory ROADMAP gate — before every coding task

Before changing code, the implementer or coding agent must:

1. Read `docs/GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md`.
2. Identify the current phase, the exact roadmap item being implemented, and any predecessor/acceptance gates that constrain it.
3. Read any directly applicable companion roadmap, including when relevant:
   - `docs/GLYMIZE_PATIENT_CARE_HUB_ROADMAP.md`;
   - `docs/GLYMIZE_HEALTH_EXCHANGE_READINESS_ROADMAP.md`;
   - `docs/GLYMIZE_INSURANCE_EPRESCRIPTION_STANDARDS_ROADMAP.md`;
   - this Codebase Memory task-gate document.
4. Check whether the task is already complete, partially implemented, superseded, or duplicated elsewhere before creating new code.
5. Check cross-module dependencies and future-facing constraints so the smallest compatible change is chosen.
6. Record `Roadmap review: PASS` in the pull request only after the applicable roadmap review is actually complete.

If the roadmap and current source disagree, investigate the drift before implementation. Source code determines current runtime behavior; the roadmap determines intended product/architecture direction unless a later accepted decision explicitly supersedes it.

## 2. Purpose of the Codebase Memory graph

GLYMIZE maintains a persistent Codebase Memory knowledge graph so implementation work does not repeatedly rediscover the whole repository. The graph is used to identify package boundaries, symbols, imports, call paths, routes, hotspots, and likely blast radius before code is changed.

The graph is an engineering navigation and impact-analysis aid. It does **not** replace direct source inspection, authorization/security review, clinical-rule review, migration review, deterministic tests, CI, RC acceptance, or production invariants.

## 3. Canonical shared snapshot model

The first local full index created on 2026-09-06 with Codebase Memory MCP `0.10.8` produced:

- nodes: `5097`;
- edges: `19109`;
- local artifact: `.codebase-memory/graph.db.zst`;
- local metadata: `.codebase-memory/artifact.json`.

That first local index is retained only as a **provisional historical baseline** because the exact local Git SHA was not proven against `origin/main` before indexing.

The canonical shared graph is instead generated from the exact GitHub `main` checkout by `.github/workflows/codebase-memory-snapshot.yml` and published inside the private GLYMIZE GitHub repository as release assets under the moving tag/release:

`codebase-memory-latest`

The release contains:

- `codebase-memory-snapshot.tar.gz` containing `.codebase-memory/graph.db.zst`, `artifact.json`, `.gitattributes` when emitted, and `snapshot-source.json`;
- `codebase-memory-snapshot.sha256`;
- `snapshot-source.json` with the exact source `main` SHA, Codebase Memory version, and workflow run provenance.

This keeps the graph shared and recoverable from GitHub without adding multi-megabyte binary rewrites to normal Git history or creating a non-source branch that could trigger Cloudflare preview deployment.

The project name/path shown by `list_projects` is machine-specific and must be resolved dynamically. `C-Users-abbas-GLYMIZE-RC-AUTHFIX-0903bdb` and `C:\Users\abbas\GLYMIZE-RC-AUTHFIX-0903bdb` are workstation references, not portable identifiers.

## 4. Known index limitations

The initial scan showed the following best-effort limitations:

- `apps/web/public/data/glymize-clinician-market-v2.json` timed out during parsing;
- several SQL migration files were indexed partially around parser-specific constructs;
- image/SVG/build-info and normal ignored files are intentionally not graph-indexed.

`apps/web/public/data/glymize-clinician-market-v2.json` is data rather than useful call/dependency structure and is excluded through root `.cbmignore` to avoid repeated parse-timeout cost.

SQL migrations remain indexable best-effort inputs and are **not** excluded. Any schema/migration task requires direct migration-file inspection regardless of graph output.

## 5. Mandatory PRE-TASK graph gate

After the ROADMAP gate and before implementation:

1. Confirm the intended repository and branch.
2. Fetch `origin/main` and verify the task branch contains the current `origin/main`; do not start a new independent task from a stale base.
3. Require a clean worktree for a new independent task unless the current task explicitly owns the existing changes.
4. Check Codebase Memory availability and project/index status.
5. Run `detect_changes` **before any refresh** so changes since the last index are not erased from the delta view.
6. If the graph is missing, stale, or not aligned to the current source, refresh it before implementation. Prefer incremental refresh when correctness is clear; use a full re-index when the graph is missing, corrupted, schema-incompatible, or incremental correctness is uncertain.
7. Use graph tools to identify the relevant architecture before broad file reading. Appropriate tools include `get_architecture`, `search_graph`, `query_graph`, `trace_path`, `get_code_snippet`, `search_code`, and `detect_changes`.
8. Establish a pre-change blast-radius hypothesis: expected files, packages, routes, contracts, migrations and tests.
9. Directly inspect every security-, authorization-, clinical-authority-, migration-, encryption-, patient-isolation-, order-authority-, or deployment-critical source identified by the graph.
10. Only then define the smallest implementation scope.

If graph and source disagree, **source wins** and the graph is stale until refreshed.

## 6. During implementation

During a task:

- stay inside the verified blast radius unless a new dependency is discovered;
- when a new caller/callee/dependency is discovered, update the impact assessment before expanding scope;
- use graph queries to avoid duplicate helpers, duplicate storage, duplicate preferences, parallel authority paths and redundant contracts;
- do not weaken security or clinical boundaries to satisfy structural expectations;
- continue to apply normal deterministic test, typecheck, lint, browser and CI requirements.

## 7. Mandatory POST-TASK graph gate

At the end of a task, before declaring it complete:

1. Determine whether graph-relevant structure changed. Examples include functions, classes, components, exported symbols, imports, package boundaries, HTTP/API routes, shared contracts, Worker/runtime wiring, migrations/schema relationships, shared UI adapters, or shared state flows.
2. Run `detect_changes` **before refreshing the graph** and capture the actual delta/blast radius.
3. Compare that delta with the intended scope, actual Git diff and tests. Investigate unexplained expansion.
4. If graph-relevant structure changed, refresh Codebase Memory after the final code state is reached.
5. Verify `index_status`/project usability after refresh.
6. If an architectural decision, persistent boundary, authority model, or significant module ownership changed, update the Codebase Memory ADR.
7. Re-read the applicable Roadmap item and confirm the implementation still satisfies its acceptance constraints. Update roadmap/checklist documentation when the accepted product state materially changed.
8. Record `Graph gate: PASS` in the pull request only after the applicable graph checks are complete.

A documentation-only change with no source/dependency impact does not require a graph rebuild unless the documentation changes an architectural contract that must be reflected in ADR/architecture documentation.

## 8. Architecture documentation vs Codebase Memory ADR

To avoid duplicate or conflicting architecture sources:

- `docs/ARCHITECTURE.md` is the authoritative human-readable architecture description;
- Roadmap documents are authoritative for accepted product direction, sequencing and gates;
- the Codebase Memory graph is a generated navigation/dependency model;
- Codebase Memory ADR stores discrete architecture decisions/change rationale and complements `docs/ARCHITECTURE.md`; it must not become a second copied architecture document.

When a decision changes the architecture contract, update the authoritative human document and the ADR where appropriate rather than maintaining divergent descriptions.

## 9. Shared snapshot persistence policy

The shared graph must live in GitHub, not only on one workstation.

Policy:

- local graph refresh is allowed whenever the PRE/POST gates require it;
- GitHub Actions regenerates the canonical snapshot from exact `main` source after graph-relevant `main` changes and on manual dispatch;
- the generated snapshot is published to the private GitHub Release/tag `codebase-memory-latest`;
- the tag is moved to the exact source SHA and release assets are replaced with `--clobber`, so only the current canonical shared snapshot is retained as the normal bootstrap target;
- `main` keeps the workflow, scripts, `.cbmignore`, Roadmap contract and PR/CI enforcement;
- a local developer/agent may bootstrap from the shared release snapshot and then apply incremental local differences.

If the snapshot workflow fails, the source merge remains the authority, but the Graph Gate becomes degraded/YELLOW until the shared snapshot is repaired.

## 10. CI enforcement

Every pull request targeting `main` must contain checked declarations:

- `- [x] Roadmap review: PASS`
- `- [x] Graph gate: PASS`

`.github/workflows/validate-pull-request.yml` fails when either declaration is missing.

These declarations are not substitutes for doing the work; they make the engineering gate visible and auditable in PR history.

## 11. Task completion contract

For GLYMIZE engineering work, `DONE` means all applicable existing Definition-of-Done gates **plus**:

- applicable Roadmap(s) reviewed before implementation;
- current Roadmap item and dependencies identified;
- stale/duplicate implementation risk checked;
- PRE-TASK graph status and blast radius reviewed;
- safety-critical source paths directly inspected;
- implementation/tests/CI completed;
- POST-TASK `detect_changes` captured before refresh when applicable;
- graph refreshed after graph-relevant changes;
- architecture/ADR updated when required;
- applicable Roadmap re-checked after implementation;
- PR gate declarations present and passing;
- shared GitHub snapshot healthy or any degraded snapshot state explicitly reported.

## 12. Default operating rule for AI agents

Before modifying GLYMIZE, an AI coding agent must first consult the applicable Roadmap(s), then the current Codebase Memory graph, and only then inspect/edit the source inside the verified blast radius.

After modifying GLYMIZE, the agent must run the post-task delta/refresh logic and re-check the Roadmap before reporting the task complete.

If Codebase Memory is unavailable, work may proceed only with explicit fallback to direct repository inspection and the limitation must be reported. The shared graph must be restored before the next normal graph-dependent task where possible.
