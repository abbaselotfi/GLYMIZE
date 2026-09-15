# R29-04-C — Timeline plans and index tradeoffs (2026-09-14)

## Outcome

Local assessment complete; **no runtime change or migration selected/applied**. Candidates improve different plan fragments, not the entire history request. Existing observation COUNT/revision work and the final order-timeline sort remain. Do not add all indexes merely because they can be used.

| Candidate | Fixture rows indexed | Local B-tree bytes | Local benefit |
| --- | ---: | ---: | --- |
| Observation practice/patient/time/ID | 9600 | 806912 (788 KiB) | B page sort remains eliminated |
| Encounter practice/patient/time/prefixed ID | 360 | 28672 (28 KiB) | Removes encounter tie-break temporary sort |
| Fulfillment practice/order/time/ID | 1440 | 86016 (84 KiB) | Removes latest-fulfillment tie-break sort; outer order sort remains |
| Result links order/linked_at | 1440 | 57344 (56 KiB) | Covering index and timestamp range for result count; outer sorts remain |

Candidates are tested **individually**, not as a combined migration. Storage is dbstat B-tree allocation in this local fixture, not total database growth, production storage, or a monetary estimate. Different IDs, payload distribution and page packing change costs. Existing indexes are retained.

## Reproduction and evidence

Run from repository root with a Node version supporting node:sqlite and SQLite dbstat:

```sh
node apps/admin-worker/scripts/assess-history-query-plans.mjs
node apps/admin-worker/scripts/assess-timeline-query-plans.mjs
```

[Captured JSON](R29_04_C_INDEX_TRADEOFFS_2026-09-14.json) contains both final runs, source/schema fingerprints, full baseline/candidate plans, allocated pages/cells, and explicit unknown D1 metrics. B's earlier JSON remains historical evidence, not overwritten.

Timeline script reads exact SQL templates and cursor predicates from the two runtime readers; unexpected template shapes fail. It uses migration 0003 in :memory:, synthetic placeholders, FK enforcement disabled for isolated fixture loading, and ANALYZE in baseline/candidate states. It does not simulate full application schema, auth, crypto, migrations, Worker runtime or D1.

Timeline fixture: 360 encounters/plans/orders, 1440 fulfillment events and 1440 result links; three patients across two practices, with same-practice other-patient data. Five encounters share timestamps; signed/superseded/void/draft plans occur; fulfillment ties and events/links after sourceVersion are included. Synthetic strings are not clinical ciphertext.

Six cases × two queries × three separate indexes = **36 exact SQL-result comparisons**: first page, encounter-prefix cursor, order-prefix cursor, older sourceVersion, populated wrong practice, and before-created empty history. First pages return 41 candidates per family. Explicit assertions check no wrong-practice/pre-created results and current latest fulfillment is completed with three links (future cancelled event/fourth link excluded). Equality checks preserve SQL ordering and data across candidate changes; they do not test signed cursor verification, browser merged pagination, runtime decryption, or all clinical states.

The observation assessment retains its eight comparisons, now also measuring index storage and a rolled-back synthetic insert. **44 comparisons total** passed. Syntax checks and Worker lint (114 files) passed. No runtime source changed; the full Worker test suite was not rerun. Earlier 325 tests belong to packet A.

## Write overhead: what was and was not measured

Every candidate adds one IdxInsert opcode to the compiled INSERT program for its table. Counts observed: observation 8→9, encounter 15→16, fulfillment 12→13, links 2→3. These are **static EXPLAIN program counts**, which may include subprograms; they are not dynamically executed instruction counts, billed rows_written or latency. One synthetic insert under each candidate succeeds and is rolled back. This establishes basic insert compatibility and additional index-maintenance structure only.

Actual write CPU/latency, WAL/network/storage service effects, UPDATE/DELETE workloads, billed rows_written and read-frequency break-even remain unmeasured. No index may be called free or cost-saving from these results alone. [SQLite dbstat](https://www.sqlite.org/dbstat.html) defines the B-tree space metric; [Cloudflare index guidance](https://developers.cloudflare.com/d1/best-practices/use-indexes/) supports plan verification and read/write tradeoff measurement.

## Decision and next checkpoint

Keep observation and encounter candidates on the migration evaluation shortlist. Keep fulfillment conditional on event volume/tie frequency and links lower priority until real result-link volume warrants it. This ranking is an engineering judgment based on local plan fragments, not production frequency measurements.

Before remote activation, require exact target/schema/backup/rollback ownership, representative D1 rows_read/rows_written and latency evidence, and a new numbered migration if selected. No existing migration, flag, cloud setting, dependency, commit or deployment changed in this packet.

**Next: R29-04-D / Astra High / bounded security/behavior review / high relative token cost.** Decide whether history continuation may replace the unused full summary read with a narrow primary-scoped existence check, preserving authorization, not-found, failure semantics and patient isolation. Source shows three unused companion reads and demographics decryption today; removing their failure behavior requires an explicit decision before implementation. Do not implement the optimization during that review. Return to Medium for the resulting bounded implementation. All R29-01–05 and protected offline/RC gates remain open as previously recorded.

## Graph and scope

Post-gate: accumulated graph delta captured before refresh, 103 paths including earlier work (not an exhaustive Git inventory). ADR synchronized; graph ready 8263 nodes/31834 edges, 25 known partial/zero skipped. New/untracked metadata used direct source fallback. Git confirms the new script/report/JSON; diff check passed. Local binary stays excluded; no shared snapshot publication.

Fetched current origin/main; branch contains it (1 ahead/0 behind). Tier-2 trace and coverage mapped timeline readers and the existing assessment; metadata drift and migration partial coverage used direct source fallback. New work is one local assessment script, a bounded extension to the earlier script, and evidence/docs. No runtime call graph/authority boundary changed.
