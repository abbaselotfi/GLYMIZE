# GLYMIZE Codebase Memory ADR

## 2026-09-20 — Implement deterministic reference-only desktop stage without native authority

R30-03-B implements `apps/desktop` as a Tauri 2 reference-only candidate over a dedicated Next export, not RC, a Node sidecar or the browser PWA install. Stage only reachable `/offline/` assets plus the regenerated P0 projection; bind exact files, hashes and source provenance in a strict manifest, reject unsafe/missing/extra/symlink/colliding content, strip remote fonts/PWA manifest metadata and never fall back to cloud data. The renderer has installed-snapshot copy, text-only source URLs, no patient shell, auth, Service Worker or persistent search. The native scaffold has explicit empty capabilities, no app command/plugins, local-only navigation and denied new windows/downloads. Staged-browser evidence is not native WebView/installer evidence: R30-03-C still owns Rust/MSVC provisioning, Cargo lock, compile/install/WebView2 blackout and effective CSP/navigation/IPC negatives. No PHI, migration, cloud activation or signing is introduced. See docs/R30_03_B_DESKTOP_REFERENCE_2026-09-20.md. R29-01 through R29-05 remain open where remote evidence is pending.

## 2026-09-20 — Embed a reference-only Windows shell before protected offline capabilities

R30-03-A selects Tauri 2 embedded static assets and a dedicated reference-only desktop profile reusing the existing page/parser/P0 projection. Isolate staging from Pages/RC outputs and inherited API settings; never package a stale gateway or use a remote website/Node sidecar as startup. No privileged app commands/plugins, remote navigation, clinician auth or SW dependency in the initial shell. Explicit native navigation, CSP and capability tests precede acceptance; future app handlers require command manifests plus business authorization. Use an offline WebView2 prerequisite for disconnected installation; signing is still a release gate. No encrypted PHI, grants, sync or clinical authority is introduced. R30-03-B implementation uses Sol High after the owner checkpoint; C records real native installation/blackout evidence, not substituted browser smoke. See docs/architecture/WINDOWS_SHELL_R30_03_A.md and docs/ARCHITECTURE.md. This is design only; all five R29 obligations remain.

## 2026-09-20 — Route implementation packets through Sol High and resume local-first order

Sol High replaces Astra Medium for future implementation packets. Preserve historical model labels as execution records. Sol Extra High requires a separate checkpoint and a concrete reason; pause before every model or reasoning-level change. Astra High remains bounded to security, authority, consistency and architecture reviews. R29-05-C RC deployment/evidence is complete at `932c1a1` with passing CI. C1 workspace is implemented; C2 interaction/usability evidence remains open. Resume the canonical local-first sequence at R30-03-A Tauri/Windows shell architecture, then return to Sol High for implementation.

## 2026-09-19 — Pin RC resources and the authorized migration ceiling

Use a separate RC-only Wrangler config with exact existing Worker/D1/KV/R2 IDs, keep_vars, unchanged compatibility date, and migrations_pattern matching only 0018. Do not alter the default production config or activate default-off features. Pages main deployment slot serves the RC custom domain and does not imply Git main merge. Preserve previous Worker/Pages version IDs and a D1 Time Travel bookmark; restore is an incident decision that can discard later writes. Use a fixed one-off Wrangler 4.135.0 for the known CRLF-trigger migration bug, leaving canonical SQL and dependency lockfile unchanged. See docs/R29_05_C_RC_DEPLOYMENT_2026-09-19.md.

## 2026-09-16 — Bound insurance lookup without changing cost authority

Dose execution prefilters policies to any current component product ID or its master ID once, preserving input order. Exact-product priority and first master fallback remain in the existing calculator, including rules naming another brand. No shared cache or policy change. Differential regression compares with unfiltered cost calculation, including duplicates and reordered inputs. Full-market integration correctness timeouts explicitly allow 15s after ~6s browser completion and 3.65–8s fixture variance; this is not acceptance of a latency SLO.

## 2026-09-15 — Preserve inventory semantics while bounding repeated lookup work

R29-05-B repairs real-market Type 2 assessment latency with inventory-build-local first-approved-entry ID/name indexes, a first-mapped-product ID index and one fixed-asOf Tehran calendar conversion per nonempty build. Preserve direct-ID precedence, normalized alias matching, confidence, duplicate order, license rules and clinical ranking; no global cache. New real published-market and focused semantic tests cover the previously unexercised populated runtime. Pin RC resources to active version bindings: generic settings can differ. Previous branch publication is confirmed with Pages is_skipped=true; main/activation remain separate. See docs/R29_05_B_RC_READINESS_AND_TYPE2_FIX_2026-09-15.md.

## 2026-09-15 — Separate local rollout checks, remote acceptance and Git publication

R29-05-A adds a local-only source-fingerprinted Node/fake-D1 runner for all eight independent read flags and full 111-to-000 rollback across both history families. Preserve default-OFF runtime behavior and primary authority. Local equality/routing/query checks cannot certify provider replication, Worker CPU, complete D1 rows or remote rollback; unknown evidence remains explicit. Pages source metadata currently enables previews for all branches, so the owner's reviewed Commit/Push-without-Deploy permission permits local commit but not a deployment-triggering Push. No trigger settings are changed. See docs/R29_05_A_LOCAL_ROLLOUT_2026-09-15.md; next Medium publication safety resolution, then R29-05-B RC readiness planning with separate activation authority.

## 2026-09-14 — Implement the reviewed narrow history gate behind independent opt-in

R29-04-E extracts the exact measured scoped registry read for reuse by summary and opt-in history. PATIENT_CORE_HISTORY_SCOPE_LOOKUP_ENABLED is exact-string/default-OFF and independent of D1/key flags. Full summary remains strict; opt-in history intentionally omits unrelated summary dependencies per D. Authorization, archive behavior, cursor ordering and requested-data failures remain unchanged. Local 6→3 query evidence is not provider CPU/latency; no migration/cloud activation. See docs/R29_04_E_HISTORY_SCOPE_2026-09-14.md; next Medium R29-05-A local rollout/rollback evidence.

## 2026-09-14 — Decouple authorized history from unused summary dependencies

R29-04-D review permits an independent default-OFF history scope lookup, implemented later in E. Reuse the exact registry read in a narrow measured helper without touching authority-write helpers. Preserve primary authorization, scoped binds, archived-row behavior, first-primary ordering and requested-data failures. Removing unused summary reads deliberately stops unrelated demographics/identifier failures from blocking otherwise valid history; it does not grant access or certify patient integrity. Cursor/error precedence and full summary behavior remain pinned by the D matrix. See docs/architecture/HISTORY_SCOPE_LOOKUP_R29_04_D.md; next Medium implementation, no runtime/cloud changes in D.

## 2026-09-14 — Evaluate index fragments and maintenance costs independently

R29-04-C keeps hypothetical indexes in local in-memory scripts. Forty-four SQL comparisons preserve fixture outputs; measured B-tree allocation and one added compiled IdxInsert per candidate do not prove production cost savings. Observation/encounter candidates remain shortlisted, fulfillment conditional, links lower priority pending workload evidence; no migration selected. Outer order sort and observation count/revision work remain. Next High review must decide auth/not-found/failure semantics before replacing history's unused summary read with a narrow existence gate. See docs/R29_04_C_INDEX_TRADEOFFS_2026-09-14.md.

## 2026-09-14 — Separate query-plan candidates from migration acceptance

R29-04-B extracts actual observation SQL into a local-only in-memory assessment using unchanged 0003/0004 schema and synthetic data. A practice/patient/time/ID index removes the page sort in the measured fixture with eight equivalent outputs, but does not remove aggregate/revision work. Do not equate returned rows or EXPLAIN plans with D1 rows_read/Worker CPU. Keep candidate DDL out of migrations/runtime until write/storage, broader query and RC evidence supports selection. No clinical/sourceVersion/tenant semantics changed. See docs/R29_04_B_QUERY_PLANS_2026-09-14.md; next Medium R29-04-C.

## 2026-09-14 — Lazy clinical key reuse belongs to one authorized request

R29-04-A adds an independent default-OFF exact-string opt-in for history GET only. Create the lazy decrypt capability after authorization; share only its non-extractable decrypt-only key promise across that request's rows. Preserve CLINICAL-DATA-V1 derivation/AAD, per-row authentication/null failures, query limits and metrics. No global key/plaintext cache or altered auth/write context. A rejected derivation stays rejected for the request; the next request is independent. Tests prove 80 imports become one, not fewer decryptions or a production speedup. See docs/R29_04_A_REQUEST_KEYS_2026-09-14.md. No schema, deployment or remote activation; next Medium query-plan/rows assessment.

## 2026-09-14 — Gate bookmark transport on a useful consumer

R29-03-B High review defines a conditional encrypted, purpose-separated envelope bound to primary-verified exact sessionId/expiry, trusted audience/database epoch and patient/family scope. Client transport owns per-attempt invalidation while the view owns bounded sequential application; refresh/admin fallback and overlapping/ambiguous writes cannot inherit a stale chain. Do not implement the wire layer until a reviewed consumer can use the bookmark floor with measurable benefit. Current history keeps first-primary, so extra round-trip crypto has no demonstrated benefit; A and replica/RC gates stay intact. B is deferred, not implemented or removed from R29. See `docs/architecture/D1_BOOKMARK_TRANSPORT_R29_03_B.md`. No runtime/remote changes; next Medium R29-04-A measures request-owned key reuse.

## 2026-09-13 — Primary authority and request-owned D1 read sessions

R29-03-A is implemented locally behind default-OFF exact-string opt-in. Original-primary auth/revocation/write contexts remain; the exact history GET uses a narrow request-owned capability, fresh-primary scoped lookup and serialized query execution. Invalid cursor/scope preflight precedes creation, failures stop the queue, final bookmarks are neither transported nor logged. Metric-v2 records requested routing separately from observed/unknown metadata; native first() coverage remains unknown. No global env binding substitution, separate replica database or stale-start clinical permission. B scoped transport and RC latency/rows/CPU/consistency evidence remain pending; rollback selects direct-primary at request entry. See `docs/R29_03_A_READ_SESSIONS_2026-09-13.md` and the consistency design. No remote activation/deployment.

## 2026-09-13 — Reference-lite implementation keeps clinical authority separate

R30-02-D1/D2 implemented locally: exact source `nfi_verified`, bounded rejection categories and no fabricated active/current evidence, while downstream matching and clinical/payer policies remain unchanged. Standalone exact `/offline/` uses only projected P0 reference rows, bounded fetching and volatile search; no admin draft, patient API or clinical-engine singleton calls. Opt-in reference-lite bundles exclude raw catalog/market data and clinical route documents. Cache migration/rollback is profile-scoped, and download readiness checks profile/completeness. Offline clinical calculation, grants and release acceptance remain gated. See `docs/R30_02_REFERENCE_LITE_2026-09-12.md`; this supersedes the pending-implementation status of the prior design ADR.

## 2026-09-12 — Offline reference access is not clinical authorization

Design: recognize exact source `nfi_verified` in the Type 2 adapter while retaining downstream master-match `verified` and all clinical/payer gates. Incomplete source evidence cannot mint active/current provenance. Introduce a standalone reference-only `/offline/` page consuming a sanitized published projection, without auth/catalog-draft/engine-singleton imports. An explicit reference-lite profile excludes raw admin payloads; rollout must address old-cache classification. Hash integrity does not establish clinical approval or freshness. Offline computation and protected grants remain separately gated. See `docs/architecture/OFFLINE_REFERENCE_AUTHORITY_R30_02_D.md`; Medium D1/D2 implementation pending.

## 2026-09-12 — A–C static compatibility implemented locally

Patient workspace components moved into a private route directory; one static query entry and narrow legacy URL bridge preserve opaque IDs. Keyed patient mounts and abortable history requests prevent stale continuation application. Opt-in public links perform document navigation; dirty Type 2 inputs warn before document unload. Both market projections share validated transport and retry, without changing clinical filters. Actual data proves a pre-existing `verified`/`nfi_verified` mismatch yielding zero Type 2 products, so clinical market acceptance stays blocked pending short High authority review. See `docs/R30_02_STATIC_COMPATIBILITY_2026-09-12.md`. No auth bypass, PHI cache, deployment or new service.

## 2026-09-12 — Static compatibility without authority changes

Design complete locally; implementation pending. Use one static clinician patient entry with exact query ID, preserved read/response scope and a strict legacy-link bridge, not enumerated/sentinel patients. Opt-in public destinations use document navigation, not arbitrary RSC caching. Presentation and Type 2 share validated chunk/monolith transport; clinical mapping and trusted claim-policy expiry remain authoritative. Clinical auth restoration and catalog draft isolation remain installed-product gates, not bypassed by cache tests. See `docs/architecture/STATIC_OFFLINE_COMPATIBILITY_R30_02.md`, packets A–D. No runtime route/data dependency is changed by this ADR.

## 2026-09-11 — Verified public asset bundles before offline activation

R29-02/R30-02 uses an explicit P0 build allowlist, immutable content hashes and credential-free verified downloads. Browser Cache Storage and bounded Service Worker memory reduce repeat fetches; Pages snapshot headers provide the CDN layer without adding asset Worker invocations. This browser isolate cache is not a server authorization cache; original Cloudflare isolate optimization remains measurement-gated. P2/P3/runtime traffic stays excluded. New bundle activation is opt-in/default-off until actual static patient routing, public RSC navigation and market chunk compatibility pass. See `docs/R29_02_R30_02_PUBLIC_OFFLINE_CACHE_2026-09-11.md`; synthetic real-browser success is not installed clinical acceptance.

## 2026-09-11 — Read-cost metric semantics

R29-01 adds metric version 2 in the existing request-local runtime read collector: returned rows remain compatible with rowCount; known D1 scan rows carry coverage and are null when unavailable. Query/decryption failures preserve original returns/errors. Local synthetic/real-crypto benchmark records process CPU separately from wall time; neither substitutes for real Worker CPU or authenticated RC latency. No SQL rewrite, shared PHI state or authorization caching. See `docs/R29_01_RESOURCE_BASELINE_2026-09-11.md`; RC acceptance remains pending.

## 2026-09-11 — Local execution and bounded cloud dependence

R30-01 design refinement: `docs/architecture/LOCAL_FIRST_R30_01.md` records workflow modes and P0–P3 classes. Separate committed facts from durable queued drafts; retain initial online-only canonical sign-off/slot reservation and identity transitions. Native commands enforce actor/practice/device/patient scope; staff and patient trust domains remain distinct. Local grants are separately signed, time-bounded and never use Worker master secrets. Offline revocation has an explicit lease limitation; outage duration and renewal remain R30-07 activation policy. D1 bookmarks, traversal cursors and application sync acknowledgements are distinct. Public caches exclude PHI and auth decisions; R29-01 extends the existing R28-05 baseline. Design complete locally; implementation/RC gates remain pending.

Status: owner-accepted direction; implementation pending under ROADMAP R29/R30.

Reuse the existing web frontend, contracts and deterministic clinical engine for PWA Offline-Lite and enrolled Windows Tauri Offline-Full. Desktop uses encrypted scoped SQLite and protected device keys; Worker/D1 retains current authority until repository adapters, offline authorization and revisioned sync pass their gates. No shared PHI cache, implicit authorization cache or last-write-wins clinical reconciliation. Offline startup cannot require GitHub/Cloudflare; remote-only actions expose their actual state. R30-01 defines the detailed authority/threat model; encryption selection, lease policy and conflict protocol remain design deliverables. See `docs/ARCHITECTURE.md` and `docs/ROADMAP.md` sections 29–30. Graph source nodes describe implemented code, not this future topology.

## 2026-09-07 — Reviewed Type 2 insurance claim-timing authority

- Status: Accepted
- Scope: Type 2 insurance claim timing; no production insurer integration or migration

### Context

Ordinary Iran market insurance rows can describe financial coverage, but they do not prove payer rules for multiple claims, strength switches, minimum claim spacing, or claim-count limits inside a treatment window. Inferring those rules from coverage rows could incorrectly make an `insured_only` treatment schedule appear executable.

### Decision

GLYMIZE keeps reviewed Type 2 claim-timing policy as a separate authority boundary:

1. Reviewed claim-timing entries are version-controlled in `apps/admin-worker/src/type2-claim-policy-registry.ts` and require ordinary Roadmap/Graph-gated GitHub review with source provenance.
2. The registry starts empty and must never be populated automatically from ordinary NFI/market insurance coverage rows.
3. The Worker exposes the reviewed registry only to an authenticated runtime user with the `type2` permission.
4. The web runtime fails closed to an empty reviewed policy set when the trusted runtime response is unavailable, malformed, unauthorized, or expired.
5. Decision Graph v2 may add reviewed `claimTiming` metadata only to an already-existing imported financial insurance policy with the same provider and target. Claim-timing authority cannot create financial coverage.
6. The imported financial policy identity, coverage values, effective date, and financial source provenance remain unchanged when claim-timing metadata is attached.
7. Duplicate reviewed provider/target authority is rejected, and a future-dated reviewed entry does not activate before its `effectiveAt`.
8. Decision Graph v2 remains the executable/ranking Type 2 clinical authority; this boundary does not move clinical ranking or dosing into the Worker.

### Consequences

- Multi-claim insurance schedules remain `unknown` unless explicit reviewed timing metadata exists for every required policy target.
- Adding real payer rules is a later reviewed data task, not part of this boundary implementation.
- No real insurer API, e-prescription integration, patient-data migration, or production deployment is authorized by this decision.
- `.codebase-memory/adr.md` is kept as small version-controlled text so Codebase Memory ADR decisions survive fresh canonical snapshot builds; graph binaries remain excluded from normal Git history and are distributed through the private `codebase-memory-latest` Release snapshot.
# 2026-09-10 — Patient module confirmation lifecycle

Decision: isolate the Type 2 handoff review state machine from React wiring and clinical field mapping. Revalidate actor/practice/patient descriptor and source revisions through the existing authorized read endpoint at confirmation. Cancellation/generation guards suppress obsolete responses and duplicate confirmation. Runtime auth events invalidate active work only when actor identity, practice, or active status changes; same-actor token/profile refreshes retain the review. Worker/D1 and Decision Graph v2 authorities remain unchanged. See `docs/ARCHITECTURE.md` and the R28-07 completion record.
