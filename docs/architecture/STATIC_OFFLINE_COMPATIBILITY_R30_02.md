# R30-02 — Static routing and public-data compatibility

Date: 2026-09-12
Status: bounded High design complete locally; implementation and release acceptance pending.
Scope: R29-02/R30-02 prerequisites, not offline patient authorization or a new clinical engine.

## Evidence and limits

The [cache foundation report](../R29_02_R30_02_PUBLIC_OFFLINE_CACHE_2026-09-11.md) records the failed real static export and successful synthetic browser test. This source review did not rerun or upgrade those results into product acceptance. Installed Next is 16.2.12; no upgrade is proposed.

| Boundary | Source evidence | Consequence |
| --- | --- | --- |
| Patient URL | `app/patients/[patientId]/page.tsx`, `next.config.ts` | Runtime patient IDs cannot be enumerated at export time. |
| Sensitive reads | `patient-clinical-workspace.tsx`, `lib/patient-longitudinal-read-guard.ts`, `lib/patient-clinical-core-client.ts` | Preserve exact patient/practice response validation and generation invalidation. The scope helper checks actor/practice/status, not the current route patient by itself. |
| Patient links | `app/records/patient-workspace-header.tsx`, `app/type-2/type2-patient-core-handoff-review.tsx` | Both construct `/patients/<encoded ID>`; centralize without changing handoff confirmation. |
| Navigation | `app/components/app-shell.tsx`, `app/page.tsx`, type-1/pregnancy pages, `scripts/offline-sw-template.js` | Next client navigation and intentional RSC cache bypass leave an offline navigation gap. |
| Market data | `lib/clinician-market-v2.ts`, `lib/type2-decision-graph-market.ts`, `scripts/split-market-static-assets.mjs` | Main loader reconstructs chunks, Type 2 requests only the monolith; splitter removes the oversized monolith. |
| Startup access | `app/components/app-shell.tsx`, `lib/runtime-client.ts` | Clinical modules require session/permission checks; failed initialization clears the in-memory user. Cached shell is not an offline grant. |

Source paths above are relative to `apps/web/`. Tier 2 graph: generation `2026-09-11T11:07:28Z`, 7922 nodes / 30706 edges. Relevant caller/callee queries were exhausted at depth 1; broad patient-symbol discovery was not exhaustive. Coverage of 22 evidence paths reported metadata drift with no recorded parse gap, so direct source was used. Some graph edges incorrectly resolve browser `fetch` or local `load` to unrelated functions; those edges are not evidence. Branch contains fetched `origin/main` (1 ahead / 0 behind). Pre-task `detect_changes` includes previous R28/R29/R30 work. This is a bounded design, not an application-wide security audit.

## A — One static patient entry, exact runtime ID

Use `/patients/?patientId=<URL-encoded opaque ID>` in both normal and export builds. Keep `/patient` and `/portal` patient-account surfaces separate.

1. Add `app/patients/page.tsx` with neutral Suspense fallback and client query resolver. Move existing workspace components into a private directory such as `app/patients/_components/`, preserving behavior/imports. Remove only the superseded dynamic page entry after replacement and compatibility tests pass, not the patient feature.
2. Introduce one pure URL builder/parser. Missing, empty, duplicate or malformed ID fails closed before a read. Preserve opaque identity: no trimming, case conversion, numeric coercion, double decoding, default patient or invented UUID-only restriction. Reject malformed percent escapes/control characters. Use `URLSearchParams` and existing API `encodeURIComponent` at their respective boundaries; test reserved characters and literal percent sequences.
3. Key the workspace subtree by resolved patient ID so A → B and back/forward never display A under B, even for one render. Preserve response identity checks and cancellation. Guard late history-continuation completions by mounted/generation scope as needed. A URL never grants access: missing auth, denied reads and mismatched responses stay unavailable.
4. Both internal link callers use the helper. Next links take a base-path-relative URL; native navigation adds `withBasePath` exactly once. Runtime API paths, practice/permission checks and confirmation lifecycle do not change.
5. Preserve legacy `/patients/<one encoded segment>` bookmarks with a narrow client bridge in the exported not-found/root shell, outside the clinician render gate. It only uses the shared parser and same-origin `location.replace` to the canonical entry, never patient reads. Match precisely the legacy shape, optional trailing slash and configured base path; reject ambiguous path/query IDs. No arbitrary return URL, broad success fallback, or interception of API, patient-account or unrelated 404 routes. Test normal Next and a static host serving `404.html`; other hosts need a verified host adapter before compatibility is claimed.
6. Patient documents and query URLs remain outside public precache. IDs are sensitive in history/URLs, not anonymous: apply no-referrer policy to this entry and do not log IDs/URLs in application telemetry. No PHI in exported artifacts.

This portable bridge adds a round trip only for legacy links, not a Cloudflare function for normal assets. Reject fake static patient IDs, sentinel IDs and build-time source-tree mutation. Next lists runtime dynamic routes, redirects and Proxy as unsupported in export and requires Suspense for static client query readers: [static export](https://nextjs.org/docs/app/guides/static-exports), [useSearchParams](https://nextjs.org/docs/app/api-reference/functions/use-search-params). Verify implementation against pinned 16.2.12. [Pages redirects](https://developers.cloudflare.com/pages/configuration/redirects/) are a host-specific alternative, not the portable default; they do not apply to requests served by Functions.

## B — Document navigation for the explicit P0 allowlist

For the opt-in offline-bundle build, use ordinary same-origin anchors for `/`, `/type-1/`, `/type-2/`, `/pregnancy/` in relevant navigation surfaces. A small shared link helper normalizes base paths. Ordinary builds retain Next links. Select by build capability, not `navigator.onLine`: filtering can fail requests while that flag stays true.

- Keep RSC bypass. No arbitrary `_rsc` aliases, HTML-as-RSC responses or global click interception. Disabling prefetch alone does not remove [Next Link client navigation](https://nextjs.org/docs/app/api-reference/components/link).
- Retain keyboard/modifier/new-tab semantics. Any discovered public programmatic navigation follows the same exact-target rule. Do not expand caching to dashboard, records or account as a convenience.
- Document navigation loses transient clinical form values. Warn before leaving dirty forms, including reload/back where browsers support it; do not persist PHI to avoid the warning. Provide a return-to-cached-home path when dashboard is unavailable.
- Test actual clicks/back/forward after cold restart, before/after worker control, root/prefixed hosting and blocked external requests with `navigator.onLine` still true. Navigation transport success is not clinical module access acceptance.

## C — Share validated market transport, preserve projections

Extract existing transport/validation in `lib/clinician-market-v2.ts` into a promise-deduplicated `loadValidatedClinicianMarketIndex` accessor. Both `loadClinicianMarketV2` (presentation indexes) and `loadType2DecisionGraphMarketProducts` (existing `mapMarket`) consume it. Share read-only data, avoiding duplicate full fetch/parse/clone; Type 2 should not need to build presentation indexes just to read products.

- Preserve meta → version → manifest → chunks. Monolith fallback remains **manifest 404 only**, for older hosts/development. Corrupt/version-mismatched/unauthorized/incomplete chunks never fall back to another dataset.
- Preserve schema/full-market/count, A10/non-A10, semantic, retention, package derivation and insulin-package gates. Publish shared data only after validation; clear failed in-flight promises for retry. Partial projection/index construction must not expose success. Keep one dataset version per active page; new offline data follows complete bundle activation/reload.
- Preserve `mapMarket` filters, identity, packages, price units/provenance and coverage fields. Deep-compare chunk/monolith projections with fixed clock for the current missing-observedAt fallback. Source-data corrections are separate reviewed changes.
- Keep `initializeTrustedType2ClaimPolicyRuntime`, expiry and fail-closed behavior separate. Financial coverage never authorizes claim timing. Do not bundle trusted-runtime policies or revive them from public cache.
- `browser-catalog-state.ensure()` currently catches market failures then marks catalog loaded. Integrate explicit retry/readiness so this does not permanently suppress market recovery. Preserve existing published/local-draft behavior; do not represent an admin draft as an approved offline release. Draft isolation remains a release gate, not a silent authority change here.

## Implementation sequence and gates

| Packet | Scope | Required evidence |
| --- | --- | --- |
| R30-02-A | Static patient entry, URL helper, legacy bridge, two callers, impacted source-path tests | Normal + root/prefixed export; exact-ID/legacy cold links; invalid IDs issue no read; unrelated 404 unchanged; A/B and continuation races, auth/practice changes, denied/mismatched responses, handoff regression. |
| R30-02-B | Allowlisted link helper, relevant shell/page links, dirty-form handling | Real-app offline restart/click/back navigation, blocked-host case, no selected-target RSC dependency, private-cache exclusions and native-link semantics. |
| R30-02-C | Shared loader, consumers and catalog retry | Real split output without monolith; projection equality; one concurrent transport; failure retry; invalid chunks fail closed; clinical and trusted-policy regression suites. |
| R30-02-D | Remaining installed-product access/freshness and release gate, outside A–C implementation | Explicit reference-only non-PHI surface or separately reviewed offline grants; approved catalogs/rules versus drafts; external-asset inventory, quota, updates, old clients, rollback and low-resource evidence. |

A–C use Astra Medium without repeated model confirmations. D may require short High authority design before changing access; never implement `offline => bypass auth` or enable local QA bypass. The approved R30-01 matrix is the target, not current runtime evidence.

Keep `GLYMIZE_OFFLINE_BUNDLE_ENABLED` default OFF until applicable real-app gates pass. No deployment, migration, service purchase or clinical rule change. All R29 items remain scheduled: this prerequisite does not replace replication/bookmarks, crypto/query improvements or RC/Turnstile/Placement/rollback.
