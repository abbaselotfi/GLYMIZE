# R30-02-D — Verification semantics and offline reference authority

Date: 2026-09-12. Status: bounded High design complete locally; runtime implementation and release gates remain pending. This refines [R30-01](LOCAL_FIRST_R30_01.md) and follows the [A–C evidence](../R30_02_STATIC_COMPATIBILITY_2026-09-12.md). It does not activate offline clinical access.

Update 2026-09-13: [D1/D2 implemented locally](../R30_02_REFERENCE_LITE_2026-09-12.md). The design below remains the authority; D3 clinical calculation and release gates are still pending.

## 1. Source-backed findings

| Boundary | Evidence | Meaning |
| --- | --- | --- |
| Published market status | `packages/contracts/src/index.ts` defines `MedicationMarketVerification` as `nfi_verified`, `admin_override`, `not_verified`. Web importer, validator and presentation reader recognize `nfi_verified`. | The Type 2 raw-market filter for `verified` is inconsistent with the current source contract. |
| Downstream identity status | `inventory-adapter.ts` uses `nfiMatchState = verified` only after resolving an approved master and evaluating direct identity/confidence. | This is a different enum at a different stage. Do not globally replace `verified` across the engine. |
| Clinical gates | Inventory mapping retains approved-master resolution, license, observation age, package/strength and knowledge-entry gates. | Market verification is neither treatment eligibility nor current license/stock/insurance authorization. |
| Browser authority | `api-client.ts` dispatches catalog and Type 2 considerations locally, but first initializes the catalog store. That store may prefer a newer local draft and configures a shared engine singleton. | Local calculation already exists; reusing its general facade for a public offline page would import draft/admin/engine authority. |
| Authentication | `AppShell` restores an online session; `initializeRuntimeSession` returns no user after network failure. | An offline network error must not become a clinical permission or revive a stored token. |
| Current cache profile | `write-offline-bundle.mjs` allowlists raw `admin-catalog.json`, whose schema includes author/update/notification/import metadata. | A filename or lack of patient fields does not establish P0 classification. Future public reference output needs an explicit projection, not a raw admin payload. |

Local read-only validator `node apps/web/scripts/validate-market-v2.mjs` passed: 7066 products, 3365 verified presentation rows, 143 search-status rows, 2300 insurance records, 472 ambiguous costing profiles, insulin package resolution 118/118. All products carry `nfi_verified`, NFI URL and observedAt. License labels: Active 6890, Renewed / Reactivated 152, Unknown license date 24. These are data labels, not newly verified licenses or clinical acceptance.

Deployment SHA: `34cc20f2196978555deed3cc8e9653ed6a6d9ed43dc9969392fac06ef913e77e`; canonical SHA: `c7e3d4a57cde131f9531e414ddd1b179536ff78ec5084a7d362e42ee0abdc444`. Metadata names upstream `glymize-clinician-market-v2(2).json`, dated 2026-08-12. This review establishes the checked-in artifact and consumer contract; it does not reproduce the external upstream collection/generation process or verify NFI data afresh.

## 2. D1 — Correct the source adapter, preserve clinical authority

Medium implementation may change the Type 2 raw-source predicate to exact `nfi_verified`. Reject unknown/missing statuses, `not_verified`, `admin_override` and raw `verified`; do not accept both spellings as an unversioned compatibility shortcut. Type raw input defensively; a TypeScript annotation is not runtime validation. Keep the whole-market transport/retention gates from A–C.

- Preserve existing availability filtering, identities, prices/currencies, packages, coverage provenance and source references. Keep the full market; do not reduce it to A10 to make tests pass.
- Stop fabricating active/current evidence for incomplete new input: a missing license label must stay unknown rather than default Active; missing/invalid observedAt or missing NFI source evidence must not become today's date or invented provenance. Reject such rows from the clinical projection with bounded reason counts, while retaining raw input for review. Do not rewrite the source dataset.
- Preserve the downstream distinction between market status and master-match status. Do not change `nfiMatchState`, master approval, confidence thresholds, license regex/date policy, freshness horizon, dosing, ranking or payer claim policy in this packet. Existing confidence assignment must not bypass unmatched/unapproved-master rejection. Any newly reproduced clinical-gate defect returns to a separately bounded review rather than weakening its test.
- Test the real output is nonempty and equals the exact expected source-product ID set after declared exclusions; chunk/monolith equality of two empty arrays is no longer acceptance. Expected exclusion counts derive from the fixture, not a new blanket target that every product must be selectable by the engine.
- Run positive/negative inventory and clinical-engine regressions at fixed dates: approved versus unapproved/unmatched master; unknown/expired/revoked license; stale/missing provenance; unresolved combination/strength/package; insurance coverage without reviewed claim timing. Preserve money units and references. Unknown fields remain unknown; do not make engine gates permissive to admit more products.

This is an implementation decision under the approved compatibility task, not an assertion that 7066 products are suitable for a patient. Release still requires the existing clinical acceptance gate.

## 3. D2 — A standalone reference-only entry

Implement exact `/offline/` as a static standalone **reference-only** page, linked from the home page. It works after completed installation with no auth, GitHub or Cloudflare request. This is public P0 reference access, not a new clinician identity or an offline exception inside `AppShell`.

- `RouteAwareShell` recognizes only `/offline` and `/offline/` as this standalone entry; no broad prefix bypass. `/patients`, `/records`, `/type-2`, admin and patient-account permissions stay unchanged. Nonexistent nested offline routes retain ordinary not-found behavior.
- The page imports only a dedicated read-only reference loader, locale/theme helpers and the explicit document-link helper. Do not import `api-client`, browser catalog state, runtime/admin auth, claim-policy runtime or engine-configuration singletons. No automatic session initialization, trusted-policy polling, admin publication or patient handoff.
- Initial functionality: reference search and bounded/paginated display of product identity, name, form/strength, market observation/license label and source/date; optional source price only when clearly labeled observed, not current. No patient fields, treatment ranking/dose/scenario submission, payer claim promises or patient persistence. Search text stays in memory, not URL/history/localStorage/telemetry. Render text safely; external source links are explicit user actions with no referrer, not startup fetches.
- Explain offline/reference-only state, bundle/source date and unsaved-input limits. A connected network icon is not freshness evidence. Do not call the last installed snapshot the latest data.

### Public data and cache profile

Generate a versioned `offline-reference.json` from the validated, checked-in market artifact using an explicit field allowlist. Include schema/profile version, source hash/date and typed reference rows; no arbitrary object spreads, author IDs, notifications, import jobs, review comments, admin draft state, credentials or patient data. Retain unknown labels rather than substituting active/approved. Validate distributability/classification under existing publication rules; no new clinical content or third-party license is approved by projection.

Use an explicit `reference-lite` profile for the next public bundle: home + offline entry + required static resources + projected reference data. Raw admin catalog and raw market chunks are not needed in that profile. Do not silently fall back to the older experimental four-clinical-shell profile; preserve its historical evidence but update tests and metadata to identify the new capability accurately. Normal non-offline builds remain unchanged. Add `/offline/` to the exact native-document target list and to the profile's generator/worker contract together.

The existing hash-verified download/atomic activation mechanism supplies integrity relative to the installed application. A hash is not a publisher signature, source freshness proof or treatment approval. The new profile remains opt-in/default-off. Migration/rollback tests must ensure old experimental caches containing excluded payload classes are not retained or selected as an approved reference fallback; scope cleanup to this application's cache namespaces and never delete admin local drafts or unrelated caches. Do not claim release readiness merely because reference navigation passes.

## 4. D3 — Calculation and protected offline use remain separate

The approved target still includes deterministic manual-input computation in PWA memory and enrolled encrypted desktop records. A reference page is an incremental capability, not a replacement for that target.

Before enabling offline calculation, give it an explicit reviewed runtime context: published-only catalog/master/rule versions, engine version, content provenance and a source-bound eligibility/expiry policy. Do not reuse the admin draft-preferred singleton, self-approve on local timestamp, infer approval from a hash, or use an arbitrary expiry duration. Missing eligibility evidence permits reference viewing but not treatment calculation. Policy authority and signing/renewal remain R30-02/08 and the clinical release owner; scoped protected patient access remains R30-04/07. No owner choice on lease length is invented in this packet.

Keep canonical writes, signing, patient lookup and remote-provider actions unavailable where R30-01 says online-only. No `offline => auth bypass`, local QA bypass, silent failed-fetch fallback or copying of server secrets. D1 replication/bookmarks do not provide an offline grant.

## 5. Next Medium sequence and acceptance

1. **D1 status adapter and evidence hardening:** web mapping/fixtures plus existing contract/engine tests. Test exact statuses, missing source evidence, clinical-gate exclusions and real-data ID coverage. No data/migration rewrite.
2. **D2 reference-only surface and projection:** new static page/read-only loader/projector, exact shell/link/cache-profile wiring and focused tests. Test zero auth/admin/patient/claim-policy calls, poisoned newer local draft ignored, no singleton mutation, no sensitive projection fields or search persistence, root/prefixed builds, offline cold restart, host blackout with navigator online, incomplete bundle/profile migration and rollback isolation. Record bundle bytes and request reduction, not invented savings.
3. **D3 remains gated:** choose/persist the reviewed computation policy before implementation of offline clinical execution; protected grants keep their separate roadmap dependencies. Do not stop D1/D2 for a lease-duration choice they do not need.

Continue the same-model D1/D2 sequence without repeated approvals. Keep R29-01 remote measurements, R29-02 server-cache work, R29-03 replication/bookmarks, R29-04 crypto/query work and R29-05 RC/Turnstile/Placement/rollback explicitly in scope; none is replaced by this design.

## 6. Review evidence limits

Branch contains fetched origin/main (1 ahead / 0 behind); existing uncommitted work preserved. Tier 2 graph generation `2026-09-11T21:54:13Z`, ready 7997 nodes / 31009 edges. Exact adapter/configuration traces exhausted depth 1. Fifteen evidence paths checked; source metadata drift and the intentionally excluded market JSON required direct code/structured-data reads. No whole-repository producer/security completeness claim. Source snippets, validator output and artifact counts support the decisions; no new runtime tests or runtime changes in this High packet. Architecture/ADR/Roadmap are updated separately; local graph refresh is not publication of the shared main snapshot.
