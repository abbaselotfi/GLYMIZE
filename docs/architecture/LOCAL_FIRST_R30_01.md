# R30-01 — Offline capabilities, authority and threat model

Date: 2026-09-11. Status: design packet complete locally; implementation and installed-product acceptance pending R30-02 through R30-09. Parent authority: [canonical Roadmap](../ROADMAP.md), sections 29–30. This is an architecture companion to [ARCHITECTURE.md](../ARCHITECTURE.md), not a claim that current patient workflows already work offline.

## 1. Evidence and bounded scope

Reviewed source: `HEAD@1f1a5bbcac69832a0659ba5e14b3b7043b0ef501`, with the owner's preceding uncommitted R29/R30 documentation retained. `git fetch origin main` succeeded; HEAD was 1 ahead / 0 behind. Tier 2 graph discovery covered clinician runtime transport, staff/patient authorization, catalog persistence and PWA boundaries. It was not an exhaustive route, security or clinical audit.

| Evidence | Current behavior and design consequence |
| --- | --- |
| [Service worker](../../apps/web/public/sw.js) | Explicit shell documents/icons only; `/data/` and transient requests remain network-only. Offline navigation fallback does not prove all chunks/data are installed. R30-02 needs a complete verified bundle. |
| [runtimeFetch/directFetch](../../apps/web/lib/runtime-client.ts) | Runtime URL required; network requests use `no-store`, bearer access and refresh. An offline adapter must be explicit, not a fetch-error fallback that accepts cached authentication. |
| [Browser catalog state](../../apps/web/lib/catalog/browser-catalog-state.ts) | Local draft/remote published catalog selection, browser persistence and GitHub publication exist. Reuse data parsing, but separate approved runtime bundles from admin drafts; local draft presence is not offline clinical publication approval. |
| [requireRuntimeUser](../../apps/admin-worker/src/platform-index.ts) | Checks token, refresh-session revocation/expiry and runtime user via D1. Copying a token to disk cannot replace this authorization boundary. |
| [Patient RBAC](../../apps/admin-worker/src/patient-access-rbac.ts) and [contract](PATIENT_ACCESS_RBAC.md) | Editor/approver requirements and active practice/user membership apply separately from authentication; approval/self-approval rules survive local execution. |
| [Patient identity session](../../apps/admin-worker/src/platform-patient-identity.ts) | Patient-account authorization is a separate trust domain. Clinician offline grants must never authorize patient portal identity flows. |
| [R28-05 evidence](../R28_05_BOUNDED_LONGITUDINAL_READS_2026-09-09.md) | Bounded pages, signed scope-bound traversal cursors and read metrics already exist. R29-01 remeasures and extends them; the historical CI timings are not current Worker CPU or RC SLA evidence. |

The graph's complete depth-1 `runtimeFetch` trace returned 42 callers and 5 callees, including Patient Core, v2 patient operations, scheduling, care relationships and Evidence Assistant. This locates integration candidates; it does not prove every caller's offline readiness. Coverage generation `2026-09-10T23:31:52Z` reported metadata drift but no recorded parser gap on the cited paths. Exact relevant source was read; ADR lives in an intentionally excluded directory. No negative whole-repository claim relies on this index. No source code or schema changes are part of this packet.

## 2. Execution and data classes

Modes describe target behavior after dependent gates pass:

- **local-full:** operation completes durably on the device within its explicit authority; no claim of cloud acknowledgement.
- **local-read-only:** view the last authorized synchronized subset, with source time/completeness and last-sync state.
- **queued:** local draft/intent is durably recorded, but the remote transition is pending validation and acknowledgement.
- **online-only:** operation requires a reachable authority/provider; explain unavailability without pretending success.

Data classes: **P0** approved distributable assets/catalog/rules, **P1** nonclinical personal preferences, **P2** PHI and identifying administrative data (including appointments, attachments, drafts, identifiers and audit links), **P3** credentials/keys/authorization grants. Mixed payloads inherit the most restrictive class. Provider-licensed or private reference material is not automatically P0 merely because it contains no PHI.

PWA Offline-Lite persists only approved P0 and minimal P1. Manually entered clinical inputs may be transient in memory for computation, cleared on context change/close; no implicit localStorage, analytics or Service Worker persistence. Its UI must disclose that unsaved inputs are lost on close. Offline-Full persists an explicitly enrolled practice/device subset of P2 encrypted at rest. R30-04 must cover DB indexes, journals/WAL, temp files, attachments, backups and crash reports, not only JSON fields.

## 3. Workflow capability matrix

All device-local P2 rows require an unlocked device, a valid scoped offline grant and actor permissions. No automatic download of the global patient directory. Dates/revisions shown are source facts, not invented freshness cutoffs.

| Workflow | PWA Offline-Lite | Enrolled desktop target | Authority / class / degraded behavior |
| --- | --- | --- | --- |
| Launch, navigation, language/layout | local-full after verified installation | local-full | Versioned app bundle; P0/P1. Updates cannot block launch of accepted version. |
| Published reference/catalog/rule viewing | local-read-only | local-read-only | Reviewed bundle publisher; P0 when distributable. Show version/source date and missing bundle; admin drafts never silently replace approved rules. |
| Deterministic scenario calculation with manual inputs | local-full, memory only | local-full | Existing clinical engine and reviewed rule pack; inputs P2. Preserve missing-data and eligibility gates; no invented clinical rules. Signed/expired rule-pack policy controls treatment eligibility separately from reference viewing. |
| Patient search, brief, trends, history | online-only | local-read-only for enrolled subset | Worker/D1 committed patient facts; P2. Search never equates local miss with patient absence. Mark partial history and last sync. |
| Existing-patient encounter/intake/notes drafts | online-only | queued with durable local editing | Actor/practice-scoped draft authority; P2. Reuse validation and revision semantics. Display locally saved, awaiting sync. |
| New patient and new encounter while offline | online-only | queued using random device-scoped draft identity | P2; provisional record only until server identity/conflict checks. Never generate national IDs or claim globally unique practice file number. Existing allocator high-water mark is not safe to increment independently on devices. |
| Identifier attachment, legacy promotion/link | online-only | queued proposal; final transition online-only | Worker identity/link authority; P2. Require current identity evidence and existing reviewer permissions; no inferred merge of matching names. |
| Allergy/problem/medication reconciliation changes | online-only | queued draft; last committed facts local-read-only | Existing family write owner and verification rules; P2. Show pending edit alongside committed version, never treat conflict or missing data as safety clearance. |
| Patient Core → clinical module handoff | online-only for stored patient context | local-full only after local context/confirmation parity gate | P2. Bind actor/practice/patient and snapshot revision; re-read authorized local revision at confirmation, label pending/stale provenance. Current online confirmation remains unchanged until R30-05 tests pass. |
| Final Plan/approval/order sign-off | online-only | draft queued; canonical sign-off online-only initially | Physician/approver authority, immutable signed versions and self-approval policy; P2. No fake final/signed status. Full offline clinical sign-off needs a later explicit authority design. |
| Previously signed plans/orders | online-only | local-read-only | Committed source snapshot; P2. Last-sync warning, no silent amendment. Patient-facing fulfillment is not proof that a draft became signed. |
| Appointments and slot holds | online-only | local-read-only schedule; queued booking request | Scheduling authority; P2. Offline request reserves no slot and cannot extend a server hold. Confirm/cancel only after server acknowledgement. |
| OCR/file import and attachment editing | online-only unless already loaded local processing is proven | queued after local-only processing/storage gate | P2 including raw text/images. No silent cloud fallback. Bundle parser/OCR assets and isolate document content before promising offline support. |
| Evidence Assistant | local-read-only bundled references if available | local-read-only references; remote synthesis online-only | Existing evidence/provider authority. Do not conflate local extraction with LLM answers. Patient context transfer retains E1/R28-08 gates. |
| SMS/email, insurer/e-prescription, referrals/portal messaging | online-only | queued intent where supported; external completion online-only | Existing provider/server authority; P2. Revalidate recipient, consent, authorization and current intent before send; do not replay stale side effects blindly. |
| Sign-in, enrollment, role changes, device revocation | online-only | enrollment online-only; later local unlock under grant | Staff identity authority; P3/P2. No role elevation or new membership while disconnected. |
| Patient portal/global patient identity | online-only | online-only in initial clinician desktop | Separate patient identity authority; P2/P3. No clinician grant reuse. |
| Catalog administration/publication | online-only publication | editing only as isolated draft; publication online-only | Content publisher/admin authority; P0/P2 depending payload. Never queue a hidden automatic clinical activation. |
| Backup/restore; offline update import | limited to P0/P1 browser lifecycle | local-full after integrity/recovery gates | Encrypted P2 backup; P3 key recovery separated. Signed version-compatible update; failed import preserves last working state. |

## 4. Trust and write boundaries

The web UI is an untrusted caller of narrow desktop commands. Native code enforces grant, actor, practice, patient subset, route-equivalent permissions, revision and schema checks; it never exposes arbitrary SQL, arbitrary file paths or a generic privileged HTTP proxy to the webview. Deny remote navigation/content access to privileged IPC. Tauri capabilities constrain command access but do not replace application authorization; follow the [official security boundary](https://v2.tauri.app/security/).

The desktop stores committed server snapshots separately from local pending operations. A transaction must atomically persist an eligible draft plus its outbox entry before showing “saved locally”. Local calculation uses explicitly confirmed inputs with committed/pending/conflicted provenance. Cross-device canonical authority remains Worker/D1 in this first phase. Pending local drafts do not automatically alter a shared signed order or verified fact.

Proposed outbox envelope: `operationId`, `deviceId`, `actorId`, `practiceId`, entity/draft identifier, command type/schema version, base revision, grant reference/policy version, encrypted payload, local sequence and timestamps. These are proposed fields for R30-06, not a new implemented API. Bind encryption context to practice/device/entity/schema/key version. Remote writes revalidate current server permissions and expected revision, then atomically record the operation's acknowledgement with the mutation. Delivery retries cannot duplicate visits, orders or notifications.

On reconnect: establish trusted session → refresh revocation/membership policy → classify queued work → upload eligible operations → retain rejected/conflicted work for authorized resolution → fetch deltas/tombstones and acknowledge applied positions. Never delete a pending draft merely because its server submission failed. Rejected work from a revoked actor is quarantined; a currently authorized reviewer may re-author after review, never silently impersonate or replay the revoked actor.

Use three separate consistency values: D1 session bookmark (server read ordering), Patient Core source watermark/cursor (bounded historical traversal), and application sync revision/operation acknowledgement (device convergence). They are not interchangeable authorization or freshness proofs. D1 replicas require Sessions API, with bookmarks supporting sequential reads; this does not synchronize desktop SQLite. See [D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/). Authorization/revocation checks retain authoritative reads; replicas must not weaken write-time revision/permission checks.

## 5. Offline grant and prolonged outage policy

An offline grant is a separately signed, locally verifiable authorization issued after enrollment. Do not copy Worker encryption/signing master secrets or password hashes to a device. Proposed claims: issuer/audience, grant/device/actor/practice IDs, permissions, allowed data subset, policy/schema version, issuance/not-before/expiry and key ID. Bind grants to device-held key material; a copied database plus copied token must not suffice to unlock another installation. Stronghold is a candidate key-storage component, not automatic SQL database encryption or a complete recovery policy; see [official Stronghold documentation](https://v2.tauri.app/plugin/stronghold/).

Grant expiry and user inactivity locking are different policies. Reboot does not mint new authorization. Maintain trusted-server-time/high-water evidence and detect rollback; a software clock alone cannot guarantee tamper-proof time against a privileged device owner. P3 material is inaccessible to public caches/logs, and role/patient switches clear decrypted data and pending UI responses.

**Known product tradeoff:** indefinite disconnected access and prompt centrally enforced revocation cannot both be guaranteed. Public/reference functions continue while offline. Protected P2 access requires a valid grant; after expiry, preserve encrypted work but fail closed for protected reads/writes. Do not ship an arbitrary short expiry that defeats the owner's severe-outage requirement. R30-07 must choose an explicit outage horizon and renewal/recovery policy before activation. A signed offline-file renewal from an independent authorized issuer is a design candidate, not yet available; the clinical client never self-renews. Offline signing of clinical orders is also outside initial scope. These limitations must be visible before enrollment.

## 6. R29 cache and measurement contract

| Layer / work item | Allowed initial use | Boundary and required evidence |
| --- | --- | --- |
| R29-01 baseline | Existing bounded longitudinal benchmark plus cold/warm/repeated operations | Distinguish returned rows from database scanned rows; separate decrypt count/time, query time, wall latency and real Worker CPU. Use synthetic data, fixed source/config and separate local/RC results. Measure auth overhead instead of caching it away. |
| R29-02 L1 client | P0 approved immutable bundles; minimal P1 preferences | Version/content hash, bounded storage and atomic install rollback. P2 desktop database is durable clinical storage, not an evictable shared cache. |
| R29-02 L2 isolate memory | Bounded immutable public derivations; request-scoped memoization | No cross-request plaintext PHI or cached authorization decisions. Deduplicate request work only after scope validation. Eviction/TTL and key rotation explicit. |
| R29-02 L3 edge | Explicit allowlisted P0 public responses | No patient, admin, token, personalized, cookie-dependent or mixed-class response. Versioned keys and public-only response contract; no broad “cache every GET”. |
| R29-03 replication | Eligible authorized reads with session/bookmark policy | Current authoritative auth checks and transactional write guards; read-after-write/scope-switch tests. A bookmark is not a permission. |
| R29-04 CryptoKey/query/index | Measured key import reuse and bounded decryption; query plans/indexes | Treat CryptoKey as P3: non-exportable where supported, key ID/version/purpose/scope binding, bounded lifetime and rotation invalidation. No indefinite key reuse or decrypted-record cache. Applied migrations immutable. |
| R29-05 RC | Actual provider configuration and rollback experiments | Turnstile only protects online endpoints; offline native operations cannot depend on siteverify. Verify actual CPU/latency/cost and rollback; release offline behavior only after R30-09 evidence. |

Local-first measurements later add device CPU/memory/disk, offline-start time, sync bytes/request count and replay cost. Saving cloud CPU is not success if it causes unbounded battery/memory use or loses data. No improvement percentage or free-tier fit is asserted by this design.

## 7. Threats and executable acceptance cases

These are required future behavioral tests, not tests run in this documentation packet.

| ID | Threat/failure | Required result / owner |
| --- | --- | --- |
| O01 | All Internet/DNS/GitHub/Cloudflare blocked; device restarts | Installed verified bundle starts; allowed local computation and scoped records work within grant; no update/auth network loop blocks shell. R30-02/09. |
| O02 | Stolen disk, copied DB/grant, another OS user | No plaintext PHI/keys in DB side files, logs or backup; copied artifacts cannot trivially unlock on another device. Document privileged-malware limits. R30-04/07. |
| O03 | Revoked membership during outage; expired grant; clock rollback | Enforce lease/clock policy, quarantine denied uploads after reconnect, no indefinite fallback or loss of encrypted pending work. R30-07/06. |
| O04 | Patient/practice/actor switch during decrypt, query or confirmation | Cancel/ignore previous generation, clear visible plaintext, enforce exact active scope and current authorized revision. R30-05. |
| O05 | Duplicate/reordered delivery, crash after server commit before acknowledgement | One canonical mutation and recoverable acknowledgement; atomic local draft/outbox commit. R30-06. |
| O06 | Two devices edit allergy/medication/plan; duplicate patient/file number | Explicit conflict/provisional identity; no clinical last-write-wins, silent identity merge or reuse of unreserved numeric file numbers. R30-06. |
| O07 | Malicious imported document, webview XSS/remote page | No privileged SQL/file/key access, no instructions from document content treated as commands; local parser isolated and no cloud upload fallback. R30-03/05. |
| O08 | Partial download, unsigned/older incompatible update, disk full | Preserve verified working bundle/DB; report save/update failure accurately; no partial “saved” state. R30-02/04/08. |
| O09 | Backup restore, key loss/rotation, tombstone replay | Verified restore and re-enrollment rules; no revoked-access resurrection, deleted-fact resurrection or erased pending work; recovery limitations disclosed. R30-04/06/07. |
| O10 | Stale catalog/rule/data or unavailable payer/AI/provider | Surface source version, uncertainty and unavailable status; preserve eligibility/clinical authority; queued request never appears delivered/signed/booked. R30-05/09. |
| O11 | Shared-cache poisoning/scope collision; rotated key; stale replica | No cross-scope response, stale auth acceptance or wrong-key reuse; invalidate eligible cache and preserve consistency. R29-02/03/04. |
| O12 | Low-resource device; long blackout backlog and reconnect storm | Bounded memory/storage/concurrency, retry backoff and resumable batches; no parallel duplicate sync workers. R29-01/R30-06/09. |

## 8. Deferred choices, owners and completion

| Decision | Owner task / default until resolved |
| --- | --- |
| Supported outage duration, grant lifetime, local lock and renewal method | R30-07; explicit owner policy before protected offline activation, no invented duration. Does not block R29 baseline/cache work. |
| Encryption backend, metadata leakage, recovery custody and password/device binding | R30-04 ADR/spike; no PHI persistence enabled before evidence. |
| Enrolled patient subset, attachment/storage budget and retention/export | R30-04/05; minimum explicit practice subset, no whole-global-database download. |
| Device-local approval/sign-off and multi-device file allocation | Initial canonical transitions online-only; R30-06/10 or later reviewed authority extension. |
| Signed bundle expiry/revocation and extended-offline rule eligibility | R30-02/08 with existing clinical release owner; reference visibility and treatment eligibility distinct. |
| Signing certificate, independent mirror/issuer and hosting costs | R30-03/08; record actual availability/cost before release, optional hosted expansion not assumed. |

R30-01 completion means this matrix, write/authorization boundaries, threats, R29 mapping and unresolved choices are recorded and cross-linked. It does not mean offline clinical acceptance, feature activation, installed testing or production rollout. Next packet: **R29-01, Astra Medium**, reuse R28-05 and produce measured budget evidence. High design effort ends here.

Local verification: relative source/document links resolved; `git diff --check` passed. PRE/POST graph deltas were compared with the Git working-tree diff; older R28-07 changes in the branch-vs-origin report are pre-existing history, not new work in this packet. This packet modifies documentation only, so no runtime test suite was run. Architecture and version-controlled graph ADR were updated. Remote CI/shared-main snapshot publication is not established by these local checks.
