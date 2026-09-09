# R28-05 — Bounded longitudinal reads and measured cost

Date: 2026-09-09

Status: **Complete**

Canonical task: Roadmap §28.3 `R28-05 — Bound longitudinal reads and measure their cost`.

Final implementation commit: `a3076171690f5cd80d3c89ba55ded5fba4b67faf`.

## What changed

R28-05 bounds Patient Core initial longitudinal reads while preserving explicit continuation and source-version semantics.

- Initial observations are bounded to 80 items by default; timeline is bounded to 60 items by default; caller-requested pages are capped at 200.
- Observation responses also use a 192 KiB byte budget so a small row count cannot silently produce an unbounded payload.
- Continuation cursors are opaque, HMAC-signed with the existing clinical secret, bound to practice/patient/family, and carry a frozen `sourceVersion` plus the last deterministic position.
- Observation and timeline continuation remain on the same source watermark. Cursor tampering, wrong-secret use, cross-patient/practice reuse and cross-family reuse fail closed.
- Timeline traversal merges encounter and signed-order events with deterministic ordering. Historical signed-order membership remains inspectable across later `signed`/`superseded`/`void` plan state changes; fulfillment/result-link state is bounded to the traversal watermark.
- A bounded `/v1/patients/:id/longitudinal/history` continuation route reuses the existing Patient Workspace authorization gates. No new patient store or authorization model was introduced.
- The web client validates history-page version/scope/sourceVersion before merge and rejects duplicate event/fact IDs. Patient Workspace exposes touch-friendly load-more controls rather than presenting a bounded first page as full history.
- Runtime read metrics record query count, returned rows, query/decryption duration, decryption count, response bytes and total duration. The metric payload contains no patient clinical values.
- No cache was introduced.

## Completeness and safety semantics

A bounded observation page cannot report `complete` when eligible facts remain outside the returned page. R28-03 projection accounting remains authoritative: truncation is explicit and forces `partial` for the declared source scope.

Timeline remains `partial/source_not_exposed` even after its current paged encounter/order sources are exhausted, because referrals, documents, notes and other longitudinal families are not silently claimed as covered.

Continuation does not create a clinical interpretation. `sourceVersion` is a traversal consistency watermark, not a freshness or clinical-validity cutoff.

## Continuation acceptance

Focused automated coverage proves:

1. signed observation cursors round-trip their exact deterministic position and source watermark;
2. cursor tampering, wrong-secret use and patient/practice/family mismatch fail closed;
3. multi-page observation traversal returns every fixture fact exactly once with no duplicate or omission;
4. mixed encounter/order timeline traversal returns every fixture event exactly once under one watermark;
5. later append-only order fulfillment/result state is excluded from an older traversal;
6. web history-page parsing rejects malformed or wrong-scope envelopes;
7. page merge rejects wrong sourceVersion and duplicate IDs;
8. bounded collections retain explicit remaining/truncation semantics rather than implying global completeness.

## Synthetic CI budget evidence

The acceptance benchmark is a deterministic **CI synthetic budget**, not a production latency SLA and not evidence that production was previously slow.

Validation run `34351829348` recorded:

| Cohort | Source observations | Source timeline rows | Returned observations | Returned timeline | Query count | Read rows | Decryptions | Response bytes | Total CI time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| small | 40 | 30 | 40 | 30 | 9 | 108 | 73 | 11,058 | 66.52 ms |
| medium | 400 | 300 | 80 | 60 | 9 | 210 | 144 | 22,054 | 72.40 ms |
| large | 4,000 | 3,000 | 80 | 60 | 9 | 210 | 144 | 22,054 | 50.50 ms |

The important acceptance property is bounded initial work: when source history grows from medium to large, initial returned rows, query count, decryption count and response size remain fixed at their configured bounds. Wall-clock figures are runner-specific observations only.

## Engineering validation

PR-validation run `34351829348` on exact candidate `a3076171690f5cd80d3c89ba55ded5fba4b67faf` completed successfully:

- Roadmap/Graph declarations — PASS;
- frozen dependency install / supply-chain check — PASS;
- monorepo TypeScript typecheck — PASS;
- monorepo lint — PASS;
- full monorepo tests and established clinical stress campaigns — PASS;
- Playwright browser install — PASS;
- web critical-flow Playwright suite — PASS.

Observed suite counts in that run included Web `48 files / 207 tests`, Admin Worker `41 files / 243 tests`, Clinical Engine `71 files / 433 tests`, plus the API compatibility tests. The established 100k clinical, 100k financial, 50k metamorphic, 25k adversarial and multidomain release gates remained green.

After the exact validated commit was fast-forwarded directly to `main`, direct-main validation run `34352391023` also completed **SUCCESS**.

## Graph evidence

Codebase Memory run `34352390942` completed successfully on `main@a3076171690f5cd80d3c89ba55ded5fba4b67faf`. The graph is rebuilt again after closure documentation so the published latest tag follows the final documented repository state.

## Guardrails preserved

- Worker/D1 Patient Record v2 remains the patient/encounter read-write authority.
- No D1 or PostgreSQL migration was added.
- No cache, alternate datastore or second patient store was introduced.
- No clinical threshold, freshness cutoff, contraindication, ranking, treatment objective or medication authority changed.
- Existing Type 2 `decision-graph-v2` authority is untouched.
- Performance results do not justify a datastore migration.

## Continuation

R28-05 closes the bounded-history/performance-evidence gap. The next canonical task is **R28-06 — Close Patient Core authority gaps before shared medication safety consumes them**. R28-06 may adapt existing authoritative sources, but any new Patient Core write authority or persistence model requires its separately reviewed gap/ADR gate.