# R29-01 — Resource baseline and budgets

Status: local instrumentation/benchmark packet implemented and validated; remote acceptance PENDING. R29-01 as a whole is not marked complete. No deployment or patient-data query was performed.

## Reproduction and provenance

Run `pnpm --filter @glymize/admin-worker run benchmark:reads` from the repository. It launches a separate Node/Vitest process for each small/medium/large cohort, performs one initial read followed by 20 repeated reads, and emits JSON including every sample. Invalid cohort selection and missing/failed evidence fail the command. Normal `test` runs retain a single quick structural sample per cohort.

Raw results: [local evidence](evidence/R29_01_LOCAL_BASELINE_2026-09-11.json). The artifact records base Git SHA, dirty-worktree flag, SHA-256 of the benchmark/metrics/crypto/pagination source files, Node/platform/CPU and UTC capture time. The source fingerprint, not base SHA alone, identifies the changed code measured. Fixture generation and Git metadata capture are outside the measured region. Local civil date is 2026-09-11; the artifact's UTC time may be 2026-09-10.

This extends the existing [R28-05 harness](R28_05_BOUNDED_LONGITUDINAL_READS_2026-09-09.md); it does **not** execute actual SQL, full Patient Core readers, HTTP, authentication or the deployed Worker. The query/row/decryption counts are a synthetic workload model with real existing AES-GCM decryptions. Empty Allergy/Problem authority is modeled enabled (13 queries); the deployment flag is unchanged/default-off. Populated authority distributions require a separate workload. The model alone cannot detect an extra SQL call introduced into a reader; existing behavioral reader tests remain necessary.

## Recorded local results

| Cohort (source observations / timeline) | Initial read ms | Repeated wall p50 / p95 ms | Decryption p95 ms | Node process CPU p95 ms | Modeled queries / returned rows / decryptions | Payload bytes |
| --- | ---: | --- | ---: | ---: | --- | ---: |
| small (40 / 30) | 41.59 | 30.44 / 36.03 | 29.56 | 48 | 13 / 108 / 73 | 11,058 |
| medium (400 / 300) | 93.80 | 65.72 / 77.27 | 63.82 | 79 | 13 / 210 / 144 | 22,054 |
| large (4,000 / 3,000) | 79.09 | 61.00 / 72.65 | 59.98 | 79 | 13 / 210 / 144 | 22,054 |

Nearest-rank percentiles use only the 20 repeated samples. Initial read follows fixture encryption: it is not a cold Worker isolate measurement. Node CPU uses `process.cpuUsage`, includes process/test/assertion overhead and all process threads, and can exceed elapsed wall time; Windows CPU accounting is coarse. All samples use fresh request-local collectors without an application cache. Cloud requests executed: zero. This is neither evidence of zero future cloud usage nor a production performance claim.

## Executable local budgets

Existing per-sample bounds: modeled query count exactly 13, returned rows at most 210, decryptions at most 150, response at most 512 KiB; decryption/wall time each under 5,000 ms. Add local process CPU under 5,000 ms. For opt-in distribution runs, repeated p95 wall/decryption/process CPU each must be at most 500 ms. These intentionally loose engineering regression ceilings permit machine/runner variation; they are not clinical UX targets or Cloudflare free-plan limits. Preserve raw evidence on failure and investigate before changing a budget.

## Runtime metric semantics (version 2)

`RuntimeReadMetricsCollector` stays request-local. Existing `rowCount` remains a compatibility alias for `returnedRows`. D1 `meta.rows_read` from successful result envelopes contributes to `knownRowsRead`; `queriesWithRowsRead` and `rowsReadComplete` describe coverage. When none is available, the sum is null, not a fabricated zero. `first()` results discard the envelope, so their scan count is unknown in the current readers. A partial sum must never be compared with a whole-request scan budget as though complete. No SQL/query shape was changed merely to collect metadata.

Query/decryption failures are counted and original thrown errors propagate; a null decryption is counted as failed while preserving its return value. Payloads, SQL, identifiers, tokens and keys are never stored in the collector. Only aggregate numeric metrics are emitted. Existing route logging remains success-path logging; failure counts are available to callers/tests, not a newly promised error telemetry stream.

`queryMs` and `decryptionMs` sum operation elapsed durations and can overlap under concurrency. `totalMs` covers collector lifetime through payload serialization, not full network/authenticated request latency. Route collectors currently start after authorization. None of these clocks measures Worker CPU. Cloudflare describes [D1 result metadata](https://developers.cloudflare.com/d1/worker-api/return-object/) and [Worker CPU versus duration metrics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/); follow those definitions when collecting remote evidence.

## Remaining RC gate (not fabricated or waived)

Before the R29-01 remote gate can pass, record an isolated RC Worker/database, exact candidate deployment/version, flags, applicable plan/configured CPU ceiling, source SHA and synthetic cohort identities. Current checked-in `wrangler.jsonc` targets the existing runtime, not a benchmark-specific isolated environment; do not seed/load it automatically.

For each cohort and both initial/repeated authenticated reads:

1. Exercise the actual summary/history routes and authorize under a dedicated synthetic practice; retain denied/missing-patient error counts. Include current default-off authority configuration and, separately, enabled/populated authority only where RC migrations/flags permit.
2. Collect at least 100 successful samples per declared workload/region and report failures separately, HTTP p50/p95, actual invocation CPU, cold/warm sampling methodology and auth overhead. Do not label a client-first request an isolate cold start without platform evidence.
3. Obtain full scanned rows using D1 metadata/observability, query count, returned rows, decrypt count/time and bytes. Keep incomplete scan coverage explicitly pending. Include first page, continuation and repeated-read cloud request counts; no plaintext PHI in telemetry.
4. Set a numerical RC budget profile before optimization/rollout: Worker CPU p95 <= 80% of the verified configured/plan ceiling, latency p95 no worse than measured baseline (target reductions evaluated per R29-02/03/04), and scanned rows per cohort no worse than that cohort's measured baseline. Persist the actual ceiling/baseline numbers, not only this formula. These RC numbers remain pending until measured; a local 500 ms ceiling never licenses cloud CPU use.
5. Re-run on the optimization candidate under the same workload/config, and preserve rollback evidence in R29-05. No cache/replica can bypass active authorization or turn partial history into complete history.

Local work enables R29-02 engineering; real-world benefit, free-tier fit and final R29-01 completion remain blocked on the remote measurement gate, not inferred from this synthetic harness.

## Verification

- Focused metrics/benchmark/read-contract suite: 3 files, 10 tests passed.
- Full Admin Worker suite: 48 files, 284 tests passed.
- Admin Worker typecheck and lint passed.
- Dedicated 63-sample baseline passed; links and Git whitespace checked.
- PRE graph/diff preserved the owner's earlier uncommitted documentation and historical R28-07 branch changes. Scope is metrics helper, its tests/benchmark runner/package command and evidence/docs. No migration, clinical rule, authorization policy or deployment changed.

The Workers best-practices review led to request-local counters, explicit unknown metadata and separate platform CPU evidence. API metadata shape was checked against current official docs and published `@cloudflare/workers-types@5.20260910.1`; the project's installed dependency version was not upgraded.
