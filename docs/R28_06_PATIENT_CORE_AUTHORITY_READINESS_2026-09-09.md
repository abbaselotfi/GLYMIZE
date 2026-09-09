# R28-06 — Patient Core authority/readiness convergence

Date: 2026-09-09

Status: **Non-authority implementation complete on main; authority-selection gate remains open**

Canonical task: Roadmap §28.3 `R28-06 — Close Patient Core authority gaps before shared medication safety consumes them`.

Validated implementation baseline: `main@964d94fff808679a61d3845f2ac527185326f2df`.

Decision-ready authority ADR: [`architecture/PATIENT_CORE_ALLERGY_PROBLEM_AUTHORITY_ADR.md`](architecture/PATIENT_CORE_ALLERGY_PROBLEM_AUTHORITY_ADR.md) — **Proposed / not accepted**.

## Factual authority audit

The current Patient Record v2 contract and D1 schema do not expose a canonical allergy or problem-list write authority. The existing encounter snapshot contains medications, labs, bounded clinical flags, vitals, demographics and notes; clinical flags are cross-cutting contexts, not a diagnosis/problem list.

Current safe source mapping:

- medication reconciliation → existing immutable Patient Record v2 encounter snapshot;
- bounded cross-cutting context → existing snapshot `clinicalFlags`, always projected as a partial family;
- observations → existing indexed Patient Record v2 observations and immutable snapshot revisions;
- allergies → no canonical source currently exposed;
- problems → no canonical source currently exposed.

Creating allergy/problem persistence or declaring another source authoritative is outside the completed non-authority implementation and requires the separately reviewed gap/ADR gate in Roadmap §28.

## Non-authoritative implementation

R28-06 adds a small Clinical Engine subpath `patient-core-safety-readiness` that consumes `PatientContextView` and preserves structural safety state for later reviewed medication-safety consumers.

It distinguishes:

- `not_collected`;
- `not_available`;
- `partial`;
- `known_absent` only when the declared collection is complete and empty;
- `present`.

Fact readiness separately preserves:

- `unverified`;
- `freshness_unknown`;
- `stale`;
- `current`.

The returned envelope declares `decisionAuthority: "none"`. It contains no eligibility, contraindication, ranking, dose, treatment or clearance rule and does not duplicate existing product-safety registries.

Medication reconciliation additionally carries the structural immutable-snapshot stage:

- `clinical_snapshot`;
- `care_team_snapshot`;
- `physician_review_snapshot`;
- `final_snapshot`.

This stage is not a prescribing state. Clinical-engine output and signed physician orders remain separate authorities/objects.

## Freshness boundary

Patient Core continues to preserve the explicit `current | stale | unknown` vocabulary but does not create a universal staleness threshold. A reviewed clinical use may later provide a versioned policy for the exact fact/decision it consumes. Until then, existing runtime projections continue to emit `freshness: unknown` where no such policy exists.

## Acceptance covered by the implementation

Focused tests require that:

1. `not_collected`, `partial`, `known_absent` and populated state remain distinct;
2. missing/partial allergy or problem families never become `known_absent` or a clearance decision;
3. unverified, unknown-freshness, stale and current facts remain distinct;
4. source/effective/recorded time, verification and revision are retained in the fact passed to the structural consumer;
5. medication reconciliation stage follows the actual immutable snapshot kind;
6. medication reconciliation never acquires signed-order fields;
7. an explicit false bounded clinical flag is an absent state for that represented flag only while the overall context collection remains partial;
8. notes and bounded clinical flags are not promoted to allergy/problem facts.

## Validation evidence

Validation PR #136 used candidate `d8b76b3f9c6ab7946478f97333f30826d67ccdaf` with tree `89eca7fd57a2f5f4e71bded1b08de777035c07fb`.

PR validation run `34354445235` completed successfully, including:

- Roadmap/Graph declarations — PASS;
- frozen dependency install — PASS;
- monorepo typecheck — PASS;
- monorepo lint — PASS;
- full monorepo regression tests — PASS;
- Playwright browser install — PASS;
- critical web Playwright flows — PASS.

The exact tested tree was reapplied as one clean direct-main commit `964d94fff808679a61d3845f2ac527185326f2df` with parent `56fea40d922e41350110d40797949302bef307c9`. PR #136 was then closed as superseded-by-direct-main; it was not merged because no distinct code remained.

Direct-main validation run `34356760954` completed successfully on `main@964d94fff808679a61d3845f2ac527185326f2df`, including lint, typecheck, clinical/security regression tests, Worker build, current web production build and critical-flow Playwright.

Codebase Memory run `34356754050` completed successfully on the same main SHA and published the updated graph snapshot.

## Explicit owner gate

R28-06 cannot be marked fully complete until the project decides how canonical allergy and problem facts are authored/persisted, or explicitly chooses an existing authority through a reviewed ADR.

The proposed decision document is [`architecture/PATIENT_CORE_ALLERGY_PROBLEM_AUTHORITY_ADR.md`](architecture/PATIENT_CORE_ALLERGY_PROBLEM_AUTHORITY_ADR.md). It recommends dedicated longitudinal Allergy and Problem persistence responsibilities **inside the existing Worker/D1 Patient Record v2 authority**, with explicit collection reconciliation/coverage semantics so an empty data set cannot silently mean `known_absent`.

That recommendation is **not accepted merely by being documented**. No migration or write path is authorized until the owner explicitly accepts an option.

No D1 migration, PostgreSQL migration, catalogue-persistence change, new Patient Core write authority, freshness cutoff, clinical rule, product criterion, deployment or feature activation is part of the completed non-authority implementation.

## Continuation boundary

Until the authority ADR is explicitly accepted or revised:

- R28-06 remains **partially complete / authority-gated**;
- Allergy and Problem projections remain `not_available / source_not_exposed`;
- missing safety facts remain non-clearance;
- R28-07 must not assume canonical Allergy/Problem authority is satisfied;
- no schema or write-authority implementation starts automatically.
