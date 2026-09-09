# R28-06 — Patient Core authority/readiness convergence

Date: 2026-09-09

Status: **In progress — non-authority implementation candidate complete; authority-selection gate remains open**

Canonical task: Roadmap §28.3 `R28-06 — Close Patient Core authority gaps before shared medication safety consumes them`.

## Factual authority audit

The current Patient Record v2 contract and D1 schema do not expose a canonical allergy or problem-list write authority. The existing encounter snapshot contains medications, labs, bounded clinical flags, vitals, demographics and notes; clinical flags are cross-cutting contexts, not a diagnosis/problem list.

Current safe source mapping:

- medication reconciliation → existing immutable Patient Record v2 encounter snapshot;
- bounded cross-cutting context → existing snapshot `clinicalFlags`, always projected as a partial family;
- observations → existing indexed Patient Record v2 observations and immutable snapshot revisions;
- allergies → no canonical source currently exposed;
- problems → no canonical source currently exposed.

Creating allergy/problem persistence or declaring another source authoritative is outside this candidate and requires the separately reviewed gap/ADR gate in Roadmap §28.

## Non-authoritative implementation

The candidate adds a small Clinical Engine subpath `patient-core-safety-readiness` that consumes `PatientContextView` and preserves structural safety state for later reviewed medication-safety consumers.

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

## Acceptance covered by the candidate

Focused tests require that:

1. `not_collected`, `partial`, `known_absent` and populated state remain distinct;
2. missing/partial allergy or problem families never become `known_absent` or a clearance decision;
3. unverified, unknown-freshness, stale and current facts remain distinct;
4. source/effective/recorded time, verification and revision are retained in the fact passed to the structural consumer;
5. medication reconciliation stage follows the actual immutable snapshot kind;
6. medication reconciliation never acquires signed-order fields;
7. an explicit false bounded clinical flag is an absent state for that represented flag only while the overall context collection remains partial;
8. notes and bounded clinical flags are not promoted to allergy/problem facts.

## Explicit owner gate

R28-06 cannot be marked fully complete until the project decides how canonical allergy and problem facts are authored/persisted, or explicitly chooses an existing authority through a reviewed ADR. The current automatic execution grant does not authorize that choice.

No D1 migration, PostgreSQL migration, catalogue-persistence change, new Patient Core write authority, freshness cutoff, clinical rule, product criterion, deployment or feature activation is part of this candidate.
