# R29-03 — D1 read consistency and replica rollout design

**Current B disposition — 2026-09-14:** [bounded security contract](D1_BOOKMARK_TRANSPORT_R29_03_B.md) complete. Transport implementation is deferred until a reviewed consumer benefits from a bookmark floor; current clinical history stays first-primary. The contract resolves the B preflight questions below and supersedes its pending High checkpoint. Next implementation is R29-04-A / Astra Medium. A, replica measurement and all R29 acceptance gates remain intact; B is not implemented.

2026-09-13. Bounded High design complete locally; subsequent [A implementation evidence](../R29_03_A_READ_SESSIONS_2026-09-13.md) records the default-OFF local foundation. B transport, remote measurements and activation remain pending. Implements the direction in [Roadmap §29](../ROADMAP.md), preserving [R30-01 authority](LOCAL_FIRST_R30_01.md). Historical design-packet statements below describe the pre-implementation state.

## Provider contract verified today

D1 replication requires Sessions API; ordinary binding queries remain primary. Replicas are asynchronous. `first-primary` constrains only the first query, not the whole session. A supplied bookmark establishes a minimum observed database version; sessions are not an application snapshot or transaction. Replica shutdown can take up to 24 hours, so provider shutdown alone is not an immediate rollback. [Official replication documentation](https://developers.cloudflare.com/d1/best-practices/read-replication/).

Use synchronous `withSession(constraintOrBookmark)` and `getBookmark(): string | null`; session methods include `prepare` and `batch`. No invented `DB_REPLICA` binding, timeout-object overload, or `close()` method. Installed `@cloudflare/workers-types/index.d.ts` agrees with this shape. One documentation example destructures `getBookmark`; use its documented return type and installed declarations instead. [Binding API](https://developers.cloudflare.com/d1/worker-api/d1-database/).

Replicas carry no separate replica charge; existing row-read/write and storage billing still applies. This is not unlimited free usage or proof this account can activate within its budget. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/). The local Cloudflare skill's D1 README/API examples conflict with these sources; retrieval-first instructions determined this design. Do not copy the outdated paid-add-on/connection-session examples.

## Repository evidence and bounded scope

| Boundary | Source finding | Consequence |
| --- | --- | --- |
| Worker entry | `wrangler.jsonc` uses `platform-v3.ts`, delegating to `platform-index.ts`; one `GLYMIZE_DB` binding | No second database/binding or global replacement of `env.GLYMIZE_DB` |
| Authentication | `platform-v3-session.ts` and `platform-index.ts` check refresh-token revocation and resolve user/practice | Keep the original primary binding for every authorization query |
| Patient RBAC | `patient-access-rbac.ts` checks active membership/user and role; context `authorize` closes over original environment | A read-session context must never replace that closure or derive permission from a bookmark |
| Read/write facade | `platform-patient-record-v2.ts` invokes Patient Core routes and legacy write/workspace routes | Select exact GET history route only; never change the entire shared facade/context |
| Initial read | `readPatientLongitudinalHistoryPage` first awaits `readPatientCoreSummary`; its first query reads scoped patient registry | Existing patient lookup can establish the primary starting point; do not add a dummy query merely to obtain a bookmark |
| Fan-out | Summary and timeline/read-model use `Promise.all` | Preserve a defined query order in the session adapter; no claim concurrent queries form one immutable snapshot |
| Continuation | History cursors encode scope, sourceVersion and ordering; rows include mutable encounter status | D1 bookmarks cannot replace cursors, revisions, completeness or current-authority checks |
| Browser/gateway | `runtimeFetch` refreshes/retries on 401; gateway forwards request/response headers and forces no-store; current CORS allows authorization/content-type | New bookmark transport needs explicit scope/generation and header tests, not a global fetch interceptor |

No `withSession`/`getBookmark` occurrences were found in the bounded Worker `src` literal check. This does not establish remote replication configuration. No dashboard/account state or remote rows were accessed.

## A — Next Medium implementation: fresh-primary session foundation

Introduce default-OFF `PATIENT_CORE_D1_READ_SESSIONS_ENABLED`. Missing, false or unknown values keep the existing direct-primary path. Candidate: exact authenticated `GET /v1/patients/:id/longitudinal/history`, for existing observations/timeline families only. Summary, authority endpoints and other routes stay unchanged initially.

1. Authenticate, authorize and validate request with the original primary context. Authority-route dispatch must occur before the optional read-session branch. Keep SQL practice/patient predicates and existing clinical-secret/AAD handling.
2. Create a request-owned `withSession("first-primary")` only for the selected read branch, after denial checks. The existing scoped patient lookup must be awaited before downstream fan-out.
3. Provide a narrow read capability to these readers rather than casting a session to `D1Database`. Keep the full write context for legacy consumers. A local adapter must serialize actual query executions (including internal Promise.all callers) and preserve result envelopes/errors; it must not expose write-capable operations to arbitrary routes. Existing fixed read SQL, not regex SQL classification, determines eligibility.
4. Do not share sessions, statements or bookmarks across requests, users or isolates. Obtain the final bookmark only after all scheduled queries succeed. Do not log or persist its bytes. No response-body/pagination contract change in A.
5. Keep auth, role/revocation, allocator, duplicate detection, revisions, signing/approval, payer policy, orders and all writes on original primary paths. Do not rewrite their batches or add mutation retry.
6. Request failure stays an explicit failure; never fall back to unconstrained or cached PHI. Feature OFF selects primary from the outset. A successful write followed by a fresh-primary request has no replica-only stale-start window; concurrent commits after the request's starting point remain possible, as before. No snapshot-isolation claim.

Serial execution may cost latency. Measure it against the current parallel primary reader; reject activation if the safety-preserving design has no useful benefit. Do not loosen ordering to manufacture improvement.

## B — Cross-request bookmarks, after A tests

The current clinical routes require a fresh primary starting point on every request, including history: an old bookmark alone does not prove current status. Therefore A deliberately does not accept browser bookmarks. This is a conservative first increment, not completion of all R29-03 acceptance criteria.

For the later transport packet, use an explicit opt-in header contract, not cookies, URL queries or browser persistent storage. Scope its in-memory chain to runtime origin/database epoch, actor session generation, practice, patient and read family. Treat bookmark bytes as opaque: no parsing, lexicographic maximum or numeric comparison. A scoped server-issued integrity envelope must bind that context and domain-separate its authentication from patient cursors/offline grants. It is a consistency hint, never authorization.

- Current clinical reads still start fresh-primary, superseding an older same-database bookmark rather than downgrading to its floor. `withSession(bookmark)` is reserved for a subsequently reviewed route whose data semantics explicitly permit a lower-bound start. No existing mutable clinical route is approved for that relaxation here.
- A bookmark-producing write must acknowledge its committed state before the next read; do not retrofit legacy write transactions just to return a header. Uninstrumented or ambiguous write completion invalidates the local chain; the next read starts primary. Existing server-side revision/idempotency invariants remain mandatory.
- Serialize each participating logical browser chain. An operation started before a newer write/auth-generation change may neither update its bookmark nor apply stale UI results afterward. Abort/discard on logout, login, refresh-generation, admin fallback, patient/practice/tenant/origin switch. Separate tabs/devices use a fresh-primary start; no global high-water-mark assumption.
- Reject tampered/wrong-scope envelopes before using their bookmark. Missing/expired-by-existing-session/unsupported/oversized hints select a documented fresh-primary reset; do not invent an offline lease duration. Cap the transport envelope locally (initial engineering budget 4 KiB, to verify against real bookmarks), never truncate it. Do not expose/log token contents or derive clinical timestamps from them.
- Handle malformed provider bookmarks as bounded errors, not an unbounded retry loop. Never retry a mutation because a read-hint failed. For a fresh-primary reset, rebuild the complete authorized read result; never merge partial replica output.
- Expose/allow the exact header only for already permitted origins and participating routes; preserve gateway no-store, existing auth and private-cache exclusions. Header absence must not become an authorization error. Clear the chain on rollback/database restore/epoch change.

B transport and any bookmark-only route activation are separately gated acceptance work. This design specifies the rules but does not pretend that implementing A has completed cross-request propagation.

## Tests, observations and rollback

### B preflight — 2026-09-14; bounded security checkpoint before transport edits

Direct source inspection found two integration boundaries that the policy above does not yet specify concretely:

- `apps/web/lib/runtime-client.ts`, `runtimeFetch`: the send closure constructs headers from the same `init.headers` on initial send, 401 refresh retry and optional admin fallback. Adding a bookmark header only in the patient client would therefore replay it across authentication transitions unless retry ownership is explicitly changed. This is a future-integration hazard, not an existing bookmark leak: no such header is wired today.
- `apps/admin-worker/src/patient-record-v2/context.ts` and the facade call in `platform-index.ts`: readers receive the user, clinical secret and authorization closure, but not authenticated access/session identity. The envelope's required session-generation binding must be derived from server-verified context, not accepted from client assertions or conflated with patient cursor scope.

Next **Astra High**, bounded to deciding the authenticated session/expiry and database-epoch bridge, private/domain-separated envelope representation, and lifecycle ownership for retry/admin fallback/write invalidation. Preserve existing primary authentication and fresh-primary reads. Do not expose raw access tokens or adopt an arbitrary offline lease. Return to Medium to implement and test the selected contract. Also state whether transport has a concrete consumer while all reads remain fresh-primary; do not claim latency benefit for extra header/crypto work.

Preflight evidence: fetched origin/main contained (1 ahead/0 behind); Tier 2 graph ready 8112 nodes/31450 edges. Web history/session search paginated (31 matches); history depth-1 trace exhausted (runtimeFetch/validator/error helper, workspace caller). Seven candidate paths checked; metadata drift required direct source fallback. No source, API, schema, CORS or provider change; no new runtime tests or B completion claim. This checkpoint updates documentation only and does not change the implemented graph topology.

Medium A must cover: flag OFF never calls withSession; denied/invalid requests never create a session; revoked roles still query primary; exact route/family allowlist; scoped primary lookup occurs before other reads; interleaved fake replicas cannot regress the chosen sequence; parallel callers are serialized; cross-request contexts are independent; result envelopes/decryption/AAD/cursors/completeness remain identical; missing patient and D1 errors fail closed; no write route/batch is redirected. Run existing Worker authorization, Patient Core pagination/authority and performance suites.

B adds read-after-write, simultaneous writes, out-of-order responses, missing/stale/tampered/wrong-scope/oversized hints, 401 refresh and admin-fallback invalidation, multi-tab reset, gateway/CORS and rollback tests. A fake/session test cannot establish actual regional replication or lag.

Reuse R29-01 metrics. Record requested mode, actual `served_by_primary`/`served_by_region` when available, rows scanned/returned and coverage, query counts, decryption counts/time, CPU and p50/p95 end-to-end latency. Do not count unknown metadata as zero or fabricate regional results locally. Provider metadata is described in the [replication guide](https://developers.cloudflare.com/d1/best-practices/read-replication/).

Before RC activation: inspect actual database mode/plan/usage with read-only access, establish numerical acceptance budgets from R29-01, run synthetic RC cohorts and verify no authorization/pagination regression. Retain OFF until observed benefit and budget gates pass. Immediate code rollback sets the feature OFF and returns to direct-primary binding access; separately disable provider replication when appropriate. No schema migration, paid subscription or production enablement is authorized by this document.

## Evidence and next checkpoint

Branch `fix/r28-07-handoff-confirmation-lifecycle-20260910` contains fetched origin/main (1 ahead / 0 behind); continuing uncommitted work preserved. Tier 2 graph ready 8060 nodes/31319 edges; bounded timeline/read-model traces exhausted depth 1 and runtime-client search paginated fully. Thirteen evidence paths checked; metadata drift/not-tracked required direct source reads. No whole-repository security audit. This packet ran source/documentation checks only, not new runtime tests.

Next: **Astra Medium — R29-03-A**, request-scoped fresh-primary session adapter, exact history-route opt-in, tests and metrics wiring. No replica activation. R29-01 remote baselines, R29-02 server-cache work, R29-04 optimization and R29-05 rollout remain in scope; R30 offline authorization is separate.

Post-design gate: accumulated delta captured before refresh; new work is this design, Roadmap/Architecture/handoff and ADR only. ADR synchronized; graph ready 8070 nodes/31329 edges, 25 known partial-parse files and zero skipped. Relative links and git diff --check passed. No new runtime tests, remote account query, commit, deployment, schema migration or shared-main snapshot publication.
