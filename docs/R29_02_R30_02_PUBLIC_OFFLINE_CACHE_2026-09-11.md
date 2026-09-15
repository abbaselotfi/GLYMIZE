# R29-02 / R30-02 — Public asset cache foundation

Status: public bundle infrastructure implemented locally, gated OFF by default. Full installed GLYMIZE acceptance and R29-02/R30-02 completion remain pending. This packet does not enable offline patient persistence or deploy anything.

## Delivered boundaries

The build step [write-offline-bundle.mjs](../apps/web/scripts/write-offline-bundle.mjs) runs after static asset splitting in both normal and RC build pipelines. Activation requires **both** `GITHUB_PAGES=true` and `GLYMIZE_OFFLINE_BUNDLE_ENABLED=true`. Normal builds retain the legacy Service Worker. Do not turn on the new bundle for release until the actual application gates below pass.

An explicit allowlist includes the four existing public shell documents (`/`, `/type-2/`, `/type-1/`, `/pregnancy/`), compiled public JS/CSS/fonts/images, brand assets/icons and published catalog metadata/chunks. Patient/admin HTML, private API responses, tokens and user state are excluded. Data allowlisting is by exact published filename/chunk pattern, never every JSON file or every GET. Existing source content/clinical approval rules remain authoritative; inclusion does not approve new clinical rules.

Every asset receives a SHA-256, byte count and immutable `/_offline/<bundle-version>/<hash>.<extension>` snapshot URL. Version incorporates the manifest, base path and Service Worker template. The build rejects source symlinks, invalid base paths, files at/above 25 MiB and total content above 128 MiB. These are chosen engineering budgets, not promises of available browser storage. At most current and previous owned cache versions are retained, so persistent storage may approach twice the bundle size plus browser overhead. Generated snapshots increase deployment asset storage too.

## Cache classification and ownership

| Location | Allowed class / content | Key, bound and invalidation | Boundary |
| --- | --- | --- | --- |
| Browser Cache Storage | P0 approved public snapshots | Origin + registration scope + content-derived bundle version; <=128 MiB manifest, current/previous versions | Installed atomically; mixed-version downloads fail hash/size verification. Browser can evict storage; failed recovery is explicit. |
| Browser Service Worker memory | P0 small response bodies | Exact manifest path; max 32 entries / 4 MiB, individual entry <=256 KiB, 5-minute TTL; clear on worker replacement | This is a **browser** isolate cache, not a Redis service or Cloudflare Worker authorization cache. Public immutable responses only. |
| Pages static CDN | P0 immutable snapshot files | Hashed versioned path, `public, max-age=31536000, immutable`; new content means new URL | `_headers` applies only to snapshots; SW/version/manifest require revalidation. Actual CDN hit/cost evidence remains an RC gate. |
| Runtime/P2/P3 | Patient facts, identity, auth/grants, private admin state, keys | No new cache | Existing runtime gateway `no-store` and authorization preserved; no Cloudflare isolate cache added without an eligible measured workload. |

This delivers useful local memory/persistent/CDN layers for the owner's local-execution goal. The original R29-02 Cloudflare-side isolate optimization remains deferred to demonstrated eligible work rather than adding Worker invocations to assets Pages already serves directly. No Redis dependency or hosted cache cost is introduced. R29-01 remote measurements and R29-03/04 still remain required.

The [new Service Worker template](../apps/web/scripts/offline-sw-template.js) fetches immutable snapshots without credentials, rejects personalized/private/error responses and unexpected Vary headers, streams with a declared size ceiling, verifies SHA-256 and stores only verified bodies. Install downloads sequentially to bound peak network/memory use. An incomplete install deletes only its own partial cache and does not activate. A complete prior bundle may be reused on rollback; this does not claim an offline signed installer/update system.

While the new worker controls the app, public catalog `t`/`v` cache-busting hints resolve to the active verified bundle even if the loader requests `no-store`; this is an explicit P0-only version-pinning policy. It prevents old shell/new-data mixing and avoids repeated downloads. Updated catalog visibility therefore follows completed bundle activation. Arbitrary query keys, authorization/range headers, POST and Next RSC requests bypass this cache. No API failure falls back to a successful HTML response.

The PWA install component limits local unregister/cache cleanup to its own scope, avoids offline update polling and catches failed registration/update requests. Initial controller attachment no longer reloads a possibly edited page. A newer version probe alone cannot force a reload loop while a pinned worker waits for its full replacement. The offline status message describes the limited availability without claiming offline patient access. Legacy cache cleanup now also uses a scope-qualified prefix and leaves unrelated application caches alone.

## Evidence

- Full web suite: 54 files / 245 tests passed before the final additional response-rejection case; final focused offline suite: 6 tests passed.
- Web lint passed; typecheck and normal production build verified separately.
- `PLAYWRIGHT_USE_SYSTEM_CHROME=1 pnpm --filter @glymize/web run test:offline` passed using installed Chrome `152.0.7977.84`, a fresh disposable profile, and a synthetic static export. Bundled Playwright Chromium was absent; the system Chrome fallback required no browser installation.
- Browser evidence: 8 public fixture assets installed, public navigation/data worked with network disabled, private patient API failed, another app's cache survived, and a full browser close/reopen with the same test profile still loaded cached content offline. Final fixture version: `d61726ff2a76499f5ccc4c24`.
- Unit cases cover deterministic content versions and base path, private-file exclusion, header preservation, in-memory TTL, no-network public reads, auth/POST/RSC/query bypass, corrupt hashes, oversized bodies/private headers, failed install cleanup and previous-cache retention.
- These are infrastructure tests. They do not establish clinical correctness, complete real-app offline navigation, real CDN hit rate or production rollback.

## Actual application gates discovered

1. **Historical export failure, before R30-02 A:** `GITHUB_PAGES=true GITHUB_PAGES_CUSTOM_DOMAIN=true pnpm --filter @glymize/web build` compiled/typechecked, then failed because `/patients/[patientId]` lacked `generateStaticParams`. That dynamic page passed its ID to the authorized client workspace. It has since been replaced by the [static query entry](../apps/web/app/patients/page.tsx), with legacy compatibility and exact patient binding; see the later implementation evidence below. No fake patient IDs or permission bypass were introduced. Bundle activation still requires the remaining gates.
2. **Real-app offline navigation:** Next RSC/client navigation currently bypasses the public snapshot cache. Direct cold navigations of a synthetic export passed; public route RSC payloads and actual UI transitions need a compatible versioned strategy after export works. Do not claim full Next app navigation acceptance.
3. **Market loader compatibility:** the splitter removes the oversized monolithic market JSON; `loadClinicianMarketV2` supports chunks, while `loadType2DecisionGraphMarketProducts` still requests the monolithic path. The bundle includes split data; this pre-existing discrepancy needs a source/authority-preserving adapter review before claiming full offline Type 2 market behavior. No clinical fallback/eligibility semantics were changed here.
4. **Failure/release tests:** actual bundle storage on low-resource devices, missing external assets, clinical rule/catalog freshness, quota exhaustion, overlapping old clients, incomplete updates and RC rollback remain R30-02/09 release gates. Retaining a previous cache alone is not proof of application-level rollback safety.

Update — 2026-09-12: the [bounded High design](architecture/STATIC_OFFLINE_COMPATIBILITY_R30_02.md) is complete locally; the next checkpoint is **Astra Medium, R30-02 A–C implementation**. Design adds an explicit installed-access gate: the clinical shell still restores its session online, and catalog draft isolation needs acceptance. This does not change the implementation/test results above or activate offline access. R29-03 consistency design remains scheduled after this prerequisite.

Later implementation update — 2026-09-12: [A–C local infrastructure and evidence](R30_02_STATIC_COMPATIBILITY_2026-09-12.md) resolves the export failure and implements public document navigation/shared market transport. Earlier failure results above are historical. The real market exposes a preserved verification-status mismatch yielding zero Type 2 products; offline auth/draft authority also remains unresolved. Next checkpoint is now **Astra High, bounded R30-02-D authority review**. No full offline clinical acceptance or activation.

## References

The implementation explicitly enforces cache policy because the [browser Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache) does not enforce HTTP caching headers itself and browser storage can be evicted. [Service Worker lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) informs install/update behavior. [Cloudflare Pages headers](https://developers.cloudflare.com/pages/configuration/headers/) apply to static responses; no assumption is made that `_headers` overrides Worker-generated runtime responses.
