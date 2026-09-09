# R28-02 Completion — Patient Workspace Active-Context Binding

**Date:** 2026-09-09  
**Status:** Complete  
**Canonical task:** Roadmap §28 — R28-02  
**Parent baseline:** `0d799f93a5a671df5c6ff26627d056a743571a13`  
**Final implementation commit:** `37f6bbf1d5c89878e871587253e75713a7973ffa`

## Purpose

R28-02 closes the Patient Workspace async-response binding gap without introducing a second patient store, changing clinical authority, or changing the Worker/D1 runtime of record.

The requirement is simple but safety-critical: only data belonging to the currently active authorized actor/practice/patient context may render. A late response, overlapping refresh, logout, account switch, practice switch, denied access, malformed payload, unsupported contract version, or mismatched patient/practice response must not retain or overwrite another active patient view.

## Implemented boundaries

- `apps/web/app/patients/[patientId]/patient-clinical-workspace.tsx`
  - captures actor, practice and patient as the request scope;
  - clears the previously rendered patient model when a new read begins;
  - invalidates in-flight reads on runtime-auth changes and component cleanup;
  - rechecks actor/practice context after a response resolves before committing it to React state;
  - does not retain the prior model when the current read fails or access changes.
- `apps/web/lib/patient-longitudinal-read-guard.ts`
  - provides a small request-generation guard;
  - aborts the previous request when a newer read begins;
  - marks late success or failure from an obsolete generation as `obsolete` rather than allowing it to own state;
  - keeps concurrency/context ownership separate from response-schema validation.
- `apps/web/lib/patient-longitudinal-response-validator.ts`
  - validates supported longitudinal schema version;
  - validates patient/practice scope;
  - validates collection completeness envelopes and gap reasons;
  - validates fact provenance/source/freshness/verification fields used by the workspace;
  - validates medication/problem/allergy/context enums consumed by UI branching;
  - validates observations, timeline events, comparison coverage, changes and deltas;
  - fails closed with bounded error codes rather than casting arbitrary JSON into the TypeScript contract.
- `apps/web/lib/patient-clinical-core-client.ts`
  - propagates `AbortSignal` to the runtime request;
  - requires the expected practice scope;
  - parses JSON as `unknown` and passes it through the validator before returning a Patient Core model.
- `apps/web/test/patient-longitudinal-read-guard.test.ts`
  - covers response validation and request/context ownership behavior independently of presentation code.

## Acceptance evidence

The R28-02 behavioral suite contains 10 tests covering:

1. valid supported response for the requested patient/practice;
2. patient/practice scope mismatch;
3. unsupported or malformed response envelope;
4. valid nested facts/timeline/change payloads;
5. malformed nested values used by the workspace;
6. logout/account/practice/disabled-context rejection;
7. out-of-order patient A/B responses;
8. overlapping refreshes for the same patient;
9. invalidation of an in-flight request when authorization/practice context changes;
10. obsolete/current access-failure behavior so stale state cannot survive a denied current read.

## Validation

A temporary validation branch was used so `main` was not moved before the candidate was green. The source changes that became `37f6bbf1d5c89878e871587253e75713a7973ffa` passed the repository validation sequence in GitHub Actions run `34323740302`:

- dependency installation / supply-chain check: PASS;
- Biome lint, all monorepo packages: PASS;
- TypeScript typecheck, all monorepo packages: PASS;
- full monorepo regression tests: PASS;
- Worker build: PASS;
- current web build: PASS.

Observed package test counts in the validated run included:

- Web: 46 files / 200 tests PASS, including the 10 new R28-02 tests;
- Admin Worker: 35 files / 228 tests PASS;
- Clinical Engine: 71 files / 433 tests PASS;
- API compatibility suite: 2 tests PASS.

The established large clinical/financial/metamorphic/adversarial/multidomain campaigns remained green as part of the full test run.

## Validation-workflow note

An earlier run of the old `Validate UIUX v2` branch workflow failed only at its legacy GitHub-Pages static export step because it forced `GITHUB_PAGES=true`, while the current physician Patient Workspace contains the dynamic route `/patients/[patientId]`. The repository already records GitHub Pages as retired. The validation branch was therefore adjusted to run the current non-Pages web build; that current build passed.

No temporary validation-workflow change was merged to `main`. The implementation commit on `main` contains only the five R28-02 source/test files.

## Explicit non-goals / unchanged authorities

R28-02 does **not**:

- add or migrate a patient datastore;
- modify D1 schema or migrations;
- modify Patient Record v2 write behavior;
- change Type 2 Decision Graph or any clinical threshold/rule;
- transfer patient data to the Evidence Assistant/AI drawer;
- declare incomplete Patient Core families complete;
- implement R28-03 completeness semantics;
- change production/RC activation state.

## Next dependency boundary

R28-02 is complete. The next canonical implementation task is **R28-03 — Make read-model completeness an executable contract**. R28-03 must preserve the active-context binding established here and must not infer absence from incomplete or unavailable source coverage.
