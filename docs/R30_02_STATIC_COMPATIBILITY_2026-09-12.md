# R30-02 A–C — Local compatibility implementation

Date: 2026-09-12
Status: infrastructure implemented locally; installed clinical acceptance remains blocked by the explicitly documented gates below. No deployment, migration or activation. All R29 items remain approved.

## Changes

- A: `/patients/?patientId=...` is a static entry with client query resolution inside Suspense. The workspace was relocated from `[patientId]` to `_components`, not removed. Internal links share a strict opaque-ID codec; the root legacy bridge redirects only valid same-origin legacy patient paths with no query. Missing/duplicate/malformed IDs fail closed. The subtree is keyed by exact ID. History requests now abort on replacement, refresh, auth change and teardown; obsolete completions cannot merge into new context. Existing API scope validation and authorization remain unchanged. Root no-referrer metadata also covers legacy patient URLs; patient pages remain excluded from public cache.
- B: the opt-in static bundle build uses native document links for the four explicit P0 destinations only, with base-path normalization and a cached-home link. Normal builds retain Next links. Dirty Type 2 transient inputs install a beforeunload warning; this is a browser warning, not durable storage or a guarantee against OS termination. No auth bypass and no RSC-as-HTML cache fallback.
- C: presentation and Type 2 adapters share `loadValidatedClinicianMarketIndex`, existing validation gates and one in-flight transport. Manifest 404 alone permits monolith fallback. Failure clears the promise for retry; presentation-index failure clears partial derived caches. The browser catalog can retry market initialization without replacing edited catalog state. Clinical projection filters, price/provenance rules, trusted-policy initialization and expiry were not changed.

The [High design](architecture/STATIC_OFFLINE_COMPATIBILITY_R30_02.md) remains the authority for acceptance. Source now implements A–C infrastructure, not every installed-product acceptance case.

## Evidence

- Root static export: succeeds, 34 pages; the prior missing-generateStaticParams failure is resolved. Export splitting produces 7066 products, 3508 presentation summaries and 2300 insurance records across four chunks, with no monolith in the split output.
- Root opt-in bundle: 107 assets / 41,701,918 bytes, version `05cdf5f6984f79251ec0467d` at the first successful browser run. Later rebuilds may change content hashes; this identifies that test artifact, not a published release.
- Real Chrome `152.0.7977.84`, production-like loopback hostname and disposable profile: exact legacy ID round trip (including Unicode, percent and reserved characters), unrelated 404, public anchor navigation/back, full browser close/reopen offline and host blackout with `navigator.onLine === true` passed. Private API fetch failed. The test uses the actual export, not the older synthetic shell fixture; **clinical access is not claimed**, as the existing auth gate remains active.
- Final web suite: 59 files / 299 tests passed. Lint: 222 files passed. Typecheck passed after correcting a test-only indexed-access annotation; stale generated route types from the removed dynamic entry were eliminated by the production build.
- Prefixed static build and actual-browser rerun passed for `/GLYMIZE`, bundle `8148c2a226279207b31cced6`, 107 assets / 41,703,958 bytes. Same legacy-ID, 404, navigation, cold restart, host-blackout and private-denial assertions passed. The test server now explicitly closes its own connections to avoid hanging at blackout teardown.
- Normal-mode production artifact was also generated. Its final build-process handle was unavailable after the continuation message, so a separate startup smoke test verified the artifact: Next 16.2.12 started successfully, `/` and `/patients/?patientId=synthetic-smoke` returned HTTP 200 with no-referrer metadata. `required-server-files.json` confirms normal output, empty base path and offline flag false. Test server was stopped afterward; this is startup/HTTP evidence, not authenticated patient acceptance.
- Static identity codec and existing patient response/read guards cover malformed/duplicate IDs, exact patient/practice binding, replaced requests and authorization failures. New source-wiring assertions cover keyed mount and history abort wiring; they are not a substitute for authenticated end-to-end continuation/auth-race coverage.
- Shared transport tests cover concurrency, chunk/monolith projection equality, retry, version/HTTP/chunk failures and retained data gates. Actual exported data was loaded, not merely synthetic fixtures.

## Newly proven existing market gate — do not silently fix eligibility

Every one of the 7066 source products has `market.nfiVerificationStatus = "nfi_verified"`. Existing Type 2 `mapMarket` accepts only `"verified"`. Therefore both the old monolithic projection and the new shared/chunked projection produce **zero products**. Equality alone is not clinical acceptance.

This packet deliberately preserves that filter, as required by the reviewed compatibility scope. The real-data regression test explicitly documents the empty current projection, rather than silently treating it as useful market output. A short High review must reconcile the verification-status contract and its producers/consumers before changing eligibility, with positive/negative clinical fixtures. Do not mark R30-02 or offline Type 2 market functionality complete until this passes.

## Remaining acceptance and operational limits

- R30-02-D: clinical shell session restoration still needs online authority; cached HTML does not grant offline clinical access. A reference-only surface/offline-grant boundary and approved-catalog-versus-local-draft isolation still need their own reviewed implementation.
- Authenticated real-app A/B navigation, late continuation/auth transitions and dirty-form browser prompts need end-to-end acceptance beyond unit/source guards; no live patient account was used here.
- Browser eviction/quota, low-resource devices, overlapping old clients, partial updates and actual RC rollback remain release gates. Host-specific not-found behavior must serve the built 404 document for legacy compatibility. No broad Cloudflare function route was added.
- `GLYMIZE_OFFLINE_BUNDLE_ENABLED` remains opt-in/default-off in source. Local test builds enabling it are not deployment activation. New Redis/services/subscriptions were not introduced.
- Interrupted browser attempts required cleanup; one cleanup command was rejected by execution policy and not bypassed. Later read-only checks initially saw residual temporary profiles, but the final check found no `glymize-static-browser-*` directory. Test profiles contained only synthetic/public content. Successful tests close/remove their own profiles; no unrelated user browser profile was targeted.

## Post-task graph/documentation gate

Captured `detect_changes` before refresh against `origin/main`, including all 42 depth-1 reported impacts. The broad delta contains earlier approved Worker work and graph name-resolution artifacts, not new Worker/SQL/clinical-engine modifications in this packet. Git/source review bounded this packet to web routing/navigation/market transport, tests and documentation. Full local refresh: ready, 7997 nodes / 31009 edges, 25 known partial files, zero skipped. New relocated workspace, URL helper and shared-loader symbols resolve. Coverage continues to report metadata drift despite refresh; exact source/tests remain authoritative. ADR synchronized; relative documentation links and `git diff --check` passed. Local graph binaries remain excluded; no main snapshot/PR/deployment was published.

Update 2026-09-13: the [bounded R30-02-D design](architecture/OFFLINE_REFERENCE_AUTHORITY_R30_02_D.md) and [D1/D2 implementation](R30_02_REFERENCE_LITE_2026-09-12.md) are complete locally for source-status correction and standalone reference-only access. The new reference-lite cache supersedes the four-clinical-shell profile described historically above. Next checkpoint: **Astra High, R29-03 bounded replication/bookmark-consistency design**. D3 clinical computation and protected grants remain gated. R29-04 crypto/query optimization and R29-05 RC/Turnstile/Placement/rollback remain scheduled, not superseded.
