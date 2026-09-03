# GLYMIZE project handoff — 2026-09-04

This document records the repository state at the requested stopping point. It
is a factual engineering handoff, not a production-deployment claim or a
clinical-release approval.

## Stop point

- Repository: `abbaselotfi/GLYMIZE`
- Local workspace: `C:\Users\abbas\GLYMIZE-RC-AUTHFIX-0903bdb`
- Starting branch: `main`
- Starting commit: `af632fb23ec57f3621abdce96c6e21cf689e64ac`
- Starting commit subject: `Merge pull request #33 from
  abbaselotfi/refactor/phase0-task7-module-decomposition-20260903`
- Starting branch state when this handoff was prepared: clean and synchronized with
  `origin/main`
- Open pull requests when this handoff was prepared: none
- Canonical roadmap position: Phase 0 / Task 7 is complete; Phase 0 / Task 8 is
  next and has **not** been started.

No repository-level `AGENTS.md` file exists at this snapshot. The applicable
instructions are therefore the checked-in roadmaps, architecture decisions,
acceptance records, CI workflows, and package scripts.

## Milestones and merged work

P4 is closed. Patient Care Hub implementation has reached the P5-C3 RC
checkpoint, while activation remains off. The repository then completed the
accepted engineering-convergence sequence through Phase 0 / Task 7.

| PR | Merge commit | Delivered result |
| ---: | --- | --- |
| [#25](https://github.com/abbaselotfi/GLYMIZE/pull/25) | `566a8b3` | P5-C3 appointment booking and lifecycle RC implementation |
| [#26](https://github.com/abbaselotfi/GLYMIZE/pull/26) | `57bea6c` | Roadmap reconciliation and canonical execution order |
| [#27](https://github.com/abbaselotfi/GLYMIZE/pull/27) | `073aef3` | Phase 0 / Task 1: repository lint baseline |
| [#28](https://github.com/abbaselotfi/GLYMIZE/pull/28) | `6e4f96b` | Phase 0 / Task 2: pull-request validation workflow |
| [#29](https://github.com/abbaselotfi/GLYMIZE/pull/29) | `cd5848a` | Phase 0 / Task 3: web unit/E2E coverage and Care Team error fix |
| [#30](https://github.com/abbaselotfi/GLYMIZE/pull/30) | `57bf719` | Phase 0 / Task 4: accepted runtime-of-record decision |
| [#31](https://github.com/abbaselotfi/GLYMIZE/pull/31) | `41f4312` | Phase 0 / Task 5: reproducible factual current-state snapshot |
| [#32](https://github.com/abbaselotfi/GLYMIZE/pull/32) | `a48233a` | Phase 0 / Task 6: persisted patient-route RBAC |
| [#33](https://github.com/abbaselotfi/GLYMIZE/pull/33) | `af632fb` | Phase 0 / Task 7: behavior-preserving module decomposition |

### Phase 0 / Task 6 — patient-route RBAC

- Added Worker/D1 migration `0018_patient_access_rbac.sql`.
- Added persisted practice-scoped `editor` and `approver` roles. Existing
  fine-grained permissions remain a second authorization gate.
- Enforced request-time RBAC on Patient Record v2, encounter, legacy handoff
  read/promotion, clinician portal, and reviewed legacy-link routes.
- Denied editor self-approval for encounters and reviewed legacy links.
- Kept patient-owned portal authentication as a separate boundary.
- Documented the temporary explicit GitHub-login exception for
  `POST /catalog/publish`.
- Applied migrations through `0018` only to a local D1 database for validation;
  the production/remote database was not changed.

See [Patient access RBAC](architecture/PATIENT_ACCESS_RBAC.md).

### Phase 0 / Task 7 — module decomposition

All five roadmap-named oversized modules retain their public APIs while
delegating cohesive responsibilities:

- `platform-patient-record-v2.ts` delegates patient context and archive logic
  to `patient-record-v2/context.ts` and `patient-record-v2/archive.ts`.
- `platform-patient-portal.ts` delegates portal media policy to
  `patient-portal/media-policy.ts`.
- `global-reference-catalog.ts` is a compatibility facade over generated
  `global-reference-catalog/presentations.ts` and
  `global-reference-catalog/sources.ts`.
- `care-team-client.tsx` delegates form-state behavior to
  `care-team-form-model.ts`.
- `apps/web/lib/api-client.ts` delegates browser catalogue state to
  `lib/catalog/browser-catalog-state.ts`.

Equivalence tests were added for the Worker and web boundaries. The generated
catalogue arrays were compared byte-for-byte with their pre-refactor values:

- presentations: 104 entries, SHA-256
  `baa6d6c0224f68c8d9f09091a19739dbf9d9949e7176cfb57b5223ba5c1fa701`
- sources: 9 entries, SHA-256
  `c4e42e3bcdddb1b175d1ce4723004df6a3c9b86af0aa671073a2dcfd5646d8fb`

See [Module boundaries](architecture/MODULE_BOUNDARIES.md).

#### Task 7 closure correction

The post-merge Pages workflow exposed one compatibility consumer that the
original equivalence checks had missed. The Iran drug-runner's Python finalizer
still parsed `global-reference-catalog.ts` as though it contained the generated
array inline. After the file became a facade, the Python test stage failed
before the Pages build could begin.

The closure correction included with this handoff points the finalizer at the
new `global-reference-catalog/presentations.ts` source and parses its exported
JSON array without changing catalogue content. The complete five-file Python
tooling test sequence passes after the correction. This is remediation within
Task 7, not the start of Task 8.

## Verification evidence at the stop point

The Task 7 implementation commit was `bdf5c68`. Its pull-request validation
workflow completed successfully as GitHub Actions run
[#33769929543](https://github.com/abbaselotfi/GLYMIZE/actions/runs/33769929543)
before PR #33 was merged.

The automatic Pages run
[#33770219970](https://github.com/abbaselotfi/GLYMIZE/actions/runs/33770219970)
on merge commit `af632fb` failed in the pre-build Python stage because of the
stale catalogue parser described above; its deploy job was skipped. The issue
was reproduced and corrected before this handoff was finalized.

Local validation for Task 7 also passed:

- the five Python tooling files used by the Pages workflow: 29 tests passed
- `pnpm lint`: 5 package tasks passed
- `pnpm typecheck`: 5 package tasks passed
- `pnpm test`: passed, including:
  - Admin Worker: 28 test files / 197 tests
  - Clinical engine: 23 test files / 196 tests
  - Web: 7 test files / 13 tests
  - deterministic 275,000-case clinical stress campaign
- Critical Playwright suite in system Chrome: 4/4 passed
  - admin login
  - Type 2 scenarios
  - Care Team save
  - patient Portal record
- `GITHUB_PAGES=true pnpm --filter @glymize/web... build`: 32 static
  routes built successfully

The generated factual inventory currently reports:

| Repository fact | Count |
| --- | ---: |
| Web App Router entries | 27 (27 pages, 0 route handlers) |
| Automated test files | 65 (60 JS/TS, 5 Python) |
| SQL migration files | 23 (18 Worker/D1, 5 PostgreSQL foundation) |

Regenerate or check this inventory with
`node scripts/generate-current-state.mjs --check`.

## Architecture and safety invariants

- The practice-scoped `patient_registry` remains each practice's local
  clinical record. Global patient identity and reviewed links are additive and
  must not replace, merge, or silently rewrite that registry.
- Medication catalogue reads are served from the static web/GitHub JSON model;
  central catalogue publication is the authenticated Worker path that commits
  validated JSON to GitHub.
- Live Type 2 evaluation runs client-side through
  `@glymize/clinical-engine`.
- Patient and encounter reads/writes use the Cloudflare Worker and D1.
- `apps/api` remains local-development-only compatibility code and is not a
  production source of truth.
- Patient Identity v2, provider/referral/care-relationship features,
  scheduling, and the patient portal remain disabled by default in checked-in
  configuration unless separately activated and verified.
- Engineering cleanup must not alter clinical ranking, scores, thresholds,
  gates, approved rule-pack content, citations, or rule activation.
- A clinical threshold, dose rule, or citation may only be added from an exact
  named source with year and section/table traceability.
- Behavior-preserving clinical work must keep the full suite, including the
  275,000-case campaign, green.

See [Runtime of Record](architecture/RUNTIME_OF_RECORD.md), [Current State](CURRENT_STATE.md),
and [Clinical Intelligence Guardrails](architecture/CLINICAL_INTELLIGENCE_GUARDRAILS.md).

## Remote-state boundary

No direct production deployment, remote Cloudflare configuration change,
remote D1 migration, secret update, or remote data mutation was performed for
Phase 0 Tasks 1–7. Merges to `main` can trigger the repository's automatic
GitHub Pages workflow; the Task 7 merge attempt failed before deployment, as
recorded above. Migration `0018` is versioned in the repository and was
exercised locally; applying it to any remote environment remains a separate
reviewed release operation.

The P5 RC documents describe implementation checkpoints, not evidence that
default-off capabilities are active in production. In particular, P5-C3 does
not activate scheduling or payments.

## Exact continuation point — not started

The next canonical unit is **Phase 0 / Task 8 — CSS consolidation**. It must be
delivered as one pull request and should begin from a freshly synchronized
`main` branch. Its roadmap scope is:

1. Inventory versioned, legacy, final, hotfix, and smoke-fix stylesheets.
2. Consolidate duplicated tokens and overlapping rules into maintained sources
   of truth.
3. Capture and compare the five key surfaces before deleting superseded files.
4. Preserve Persian RTL, English LTR, responsive, print, and accessibility
   behavior.
5. Finish with repository lint, typecheck, full unit/stress tests, and critical
   Playwright validation.

No Task 8 inventory, branch, CSS edit, screenshot baseline, or implementation
was started as part of this handoff.

After Task 8, Phase 0 / Task 9 is an architecture decision record comparing
PostgreSQL, D1, and permanent Git-JSON catalogue persistence. It must decide
and document the model before any persistence implementation. Phase 3 and
Phase 4 follow only in the order recorded in the canonical roadmap.

## Resume checklist

1. Confirm `git switch main`, `git pull --ff-only`, and a clean `git status`.
2. Read [Project Overview and Roadmap](PROJECT_OVERVIEW_AND_ROADMAP.md), especially
   the execution rules and Phase 0 / Task 8 acceptance criteria.
3. Recheck [Current State](CURRENT_STATE.md) and the accepted architecture
   decisions before changing code.
4. Create a dedicated Task 8 branch and retain before/after screenshot evidence
   for the five named surfaces.
5. Keep remote deployment, Cloudflare configuration, secrets, migrations, and
   data outside the task unless separately authorized.

No VS Code extension or additional plugin is required to resume the repository
work described above.
