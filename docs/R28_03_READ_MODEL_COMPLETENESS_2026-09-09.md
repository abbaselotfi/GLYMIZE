# R28-03 — Read-model completeness execution record

Date: 2026-09-09  
Roadmap task: R28-03 — Make read-model completeness an executable contract  
Implementation commit: `8419ffa6b11698f81c36ba785226239895c301b0`  
Runtime authority changed: **No**  
Applied migration changed: **No**

## Scope completed

The Patient Core longitudinal observation reader now declares one explicit source universe:

`latest_snapshot_revision_per_encounter`

Within that source scope:

- `rejected` observations are intentional exclusions;
- `raw:*` canonical keys are intentional exclusions;
- non-rejected/non-raw rows are eligible facts;
- an eligible row with an unusable canonical key or value is counted as invalid/skipped and forces `partial` completeness;
- a decryption failure remains a hard `PATIENT_OBSERVATION_DECRYPTION_FAILED` error rather than being converted to an empty or partial collection;
- superseded snapshot revisions remain outside the declared source scope through the existing latest-revision SQL predicate.

`PatientCoreCollection` now supports optional projection diagnostics recording:

- source scope;
- source row count;
- eligible count;
- included count;
- intentionally excluded count;
- invalid-skipped count;
- truncated count;
- exclusion reason counts.

Runtime accounting enforces:

`sourceRowCount = eligibleCount + intentionallyExcludedCount`

and

`eligibleCount = includedCount + invalidSkippedCount + truncatedCount`.

A collection with diagnostics is derived as `partial` whenever an eligible fact is skipped or truncated. Intentional exclusions alone do not make the declared projection partial.

## Behavioral evidence

Added controlled tests cover:

1. a valid eligible observation plus rejected/raw exclusions plus an eligible invalid observation;
2. rejected/raw-only source rows remaining complete for the declared projection universe;
3. decryption failure failing closed;
4. practice/patient bind parameters and latest immutable snapshot-revision SQL scope;
5. projection accounting rejecting inconsistent counts;
6. completeness derivation for invalid-skipped and truncated eligible facts;
7. snapshot projection remaining partial when an eligible lab is unusable;
8. existing deterministic change detection continuing to suppress add/remove when a family is partial.

The existing AAD equivalence and Patient Record v2 authority boundaries remain unchanged.

## Validation

Validation candidate: `8419ffa6b11698f81c36ba785226239895c301b0` plus a validation-lane-only workflow adjustment for the current non-GitHub-Pages web target. The workflow adjustment was not merged to `main`.

GitHub Actions run: `34330061403` (`Validate UIUX v2`, run 120).

Results:

- frozen dependency install: PASS;
- monorepo lint: PASS;
- monorepo typecheck: PASS;
- full clinical/security regression tests: PASS;
- Worker build: PASS;
- current web production build: PASS.

## Compatibility and safety

- No D1/PostgreSQL migration was changed.
- No Patient Record authority moved.
- No clinical threshold, freshness cutoff, diagnosis, contraindication, medication status or treatment rule was introduced.
- `freshness: unknown` semantics remain unchanged.
- Rejected/raw source data remains auditable in its existing source store; it is only outside the canonical observation projection universe.
- The existing change detector invariant remains: absence from a partial family is not evidence of removal.

## Remaining work

R28-03 does not bound longitudinal history size or add continuation; that remains R28-05. It does not create authoritative allergy/problem/medication/context sources or clinical freshness policy; that remains R28-06 and any separately reviewed authority decision required there.
