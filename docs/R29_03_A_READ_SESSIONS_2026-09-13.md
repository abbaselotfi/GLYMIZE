# R29-03-A — local fresh-primary read session foundation

2026-09-13. Implements packet A of the [consistency design](architecture/D1_READ_CONSISTENCY_R29_03.md). Not completion or activation of all R29-03.

## Implemented boundary

- `PATIENT_CORE_D1_READ_SESSIONS_ENABLED` requires exactly the string `true`; absent/false/unknown selects direct-primary. No Wrangler/provider configuration was enabled or changed.
- Only authenticated, authorized exact `GET /v1/patients/:id/longitudinal/history`, observations/timeline, selects the session. Cursor signature/scope validation precedes creation. Reader-level validation remains: opt-in currently adds one bounded cursor verification, which must be included in CPU measurements before activation.
- `patient-core/read-session.ts` creates one `withSession("first-primary")` per request. The existing scoped registry lookup executes first; a request-local queue serializes actual prepare/bind/first/all operations, including Promise.all fan-out. Original envelopes/errors are retained; a failed operation prevents queued executions. Final bookmark retrieval waits for successful draining; bytes are not logged, persisted or transported.
- `PatientRecordV2ReadContext` exposes only the read capability and necessary scope/crypto input. It is an internal fixed-reader boundary, not a SQL firewall: `.all()` must never be interpreted as a runtime guarantee that arbitrary SQL cannot write. No untrusted SQL input or regex SQL classifier was introduced.
- Original authentication/revocation/role closures and authority/legacy write contexts remain on the original database. No full-session-to-D1Database production cast, new binding, global session, mutation retry, migration or PHI cache.
- History failure logs now use a fixed message rather than raw provider error text. Cursor/sourceVersion, clinical AAD, page bodies and completeness semantics are unchanged for successful reads. Invalid cursors may now be rejected before checking patient existence when opt-in is enabled.

## Measurement and local evidence

R29-01 metric-v2 receives an optional `d1Routing` section on history requests: requested mode is separate from observed primary/replica/unknown counts and bounded region counts/unknown coverage. Native `.first()` lacks the result envelope, so its routing and rows-read metadata remain unknown; no extra query or fabricated primary observation fills that gap. Other existing metric collectors retain their prior shape. No bookmarks or clinical payloads enter this section.

- Full Worker suite: **50 files / 310 tests passed** (`pnpm --filter @glymize/admin-worker test`).
- Worker typecheck and lint passed; focused sessions/metrics tests passed before the full run.
- New deterministic tests cover serial execution and delayed-primary/lagging-replica floor simulation, errors/queue cancellation, immutable bindings/envelopes, independent concurrent requests, OFF selection, primary role denial, invalid/wrong-scope cursors, route/method exclusions, missing patients, unchanged observation decryption and both history payloads, no bookmark header/log, and original authority/legacy contexts.
- Existing pagination, authority, authorization and synthetic performance suites passed. The facade wiring/auth closure guard is a source check; the route tests use a synthetic primary-role callback. These do not prove real revoked-session behavior under remote replication.
- Installed workers types `5.20260730.1` and retrieved latest `5.20260911.1` agree on the relevant D1 signatures; no dependency update. Current [D1 replication documentation](https://developers.cloudflare.com/d1/best-practices/read-replication/) informed the adapter. Cloudflare/Workers skill retrieval rules prevented using the stale separate-replica/session-close examples.

These are Node/Vitest/fake-provider checks, not workerd/remote D1 lag, regional latency, authenticated RC CPU, quota or cost evidence. Serial reads and the extra preflight HMAC may cost latency/CPU; activation requires measured benefit against the existing parallel direct-primary path.

## Remaining gates and rollback

Keep OFF. Setting the flag absent/false selects original primary access at request entry; no provider shutdown wait is needed for this code rollback. No provider settings, deployment, commit, PR or shared-main graph publication occurred.

Next **R29-03-B / Astra Medium**: bounded scoped in-memory bookmark transport and generation/reset tests under the existing design; current clinical reads must still start fresh-primary. Do not retrofit write transactions merely to produce headers. Real workerd/RC consistency, revocation, latency/CPU/rows budgets, provider cost inspection and activation remain separate. R29-01/02/04/05 and protected offline R30 gates remain pending where already recorded.

## Graph gate

Pre-task: branch contains fetched origin/main (1 ahead / 0 behind); continuing work preserved. Tier 2 history caller/callee trace exhausted depth 1; candidate coverage reported metadata drift, so exact reader/context/route source was inspected. Pre-refresh accumulated delta captured, graph refreshed to 8070 nodes / 31329 edges before code edits. Known partial parses remain a disclosed graph limitation; graph evidence is not a full security audit.

Post-task: accumulated delta captured before refresh (94 paths including previous packets; this packet adds the read adapter, two test files and this report, and changes the bounded Worker/context/metrics and five documentation/ADR files). Broad impact rollup includes earlier web/data work and is not attributed to A. ADR synchronized; refreshed graph ready **8112 nodes / 31450 edges**, 25 known partial-parse files, zero skipped; new adapter and routing metric symbols resolve. Coverage still reports metadata drift after refresh, so source/diff/tests remain the evidence, not a claim of exhaustive graph coverage. Diff whitespace and local documentation links checked. Local graph binary is excluded; no shared snapshot publication.
