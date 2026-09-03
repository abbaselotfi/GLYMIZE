# Runtime of Record

- Status: Accepted
- Date: 2026-09-03
- Scope: Current implemented behavior; this decision does not change runtime behavior

## Decision

GLYMIZE currently has three different execution surfaces. They are not interchangeable sources of truth:

| Concern | Authoritative runtime today | Durable record / source | Explicitly not authoritative |
| --- | --- | --- | --- |
| Medication catalogue reads | The static Next.js/GitHub Pages application, through the browser-owned routes in `apps/web/lib/api-client.ts` | The deployed `apps/web/public/data/admin-catalog.json`, compiled catalogue seeds, and versioned clinician-market static assets | The running NestJS `apps/api` process and Cloudflare D1 |
| Medication catalogue writes | The authenticated Cloudflare Worker `POST /catalog/publish` path | A validated commit to `apps/web/public/data/admin-catalog.json` on the configured GitHub `main` branch; Git history is the central publication record | Browser `localStorage`, the NestJS in-memory catalogue, D1, KV, and R2 |
| Type 2 clinical rule evaluation | `@glymize/clinical-engine` executing inside the deployed web application | The engine and approved rule-pack content compiled into the deployed build | `apps/api`, the Cloudflare Worker, and browser presentation code |
| Patient and encounter reads/writes | The Cloudflare Worker selected by `apps/admin-worker/wrangler.jsonc` (`src/platform-v3.ts`) and its Patient Record v2 routes | The `GLYMIZE_DB` D1 binding, with application-layer protection for identifiers and clinical payloads | `apps/api`, browser storage, catalogue JSON, KV, and R2 |

These authorities describe the repository as it works now. The broader target architecture in `docs/ARCHITECTURE.md` remains aspirational where it mentions services or persistence that are not deployed.

## Medication catalogue boundary

`apps/web/lib/api-client.ts` deliberately handles `/v1/catalog/*`, `/v1/admin/catalog/*`, the Type 2 protocol route, and related catalogue preview routes in the browser. These routes do not switch to `NEXT_PUBLIC_API_URL` when that variable is present.

On load, the browser catalogue combines repository-shipped seeds and market assets with the published `admin-catalog.json` snapshot. An authenticated admin edit is first a browser working draft in `glymize-browser-catalog-v2`. That draft is device-local and is not a shared source of truth. Publication calls the Worker through `apps/web/lib/admin-auth.ts`; the Worker validates the payload and commits the one configured catalogue file to GitHub. A later Pages build makes that commit the deployed read snapshot.

Consequences:

- a successful local edit is not a central publish;
- a successful Worker response identifies the Git commit that became the central record;
- D1, KV, and R2 do not currently hold the medication catalogue;
- changing catalogue persistence requires the separate Phase 0 / Task 9 decision and must not be inferred from this ADR.

## Clinical evaluation boundary

The live `/type-2` page posts to the browser-owned `/v1/catalog/type-2/considerations` adapter. That adapter calls `buildType2Assessment` from `@glymize/clinical-engine` with the current visible catalogue projection. The result is computed client-side in the deployed Next.js bundle; neither the NestJS API nor the Worker evaluates that Type 2 request in the current Pages deployment.

The clinical-engine package is therefore the code authority, and the selected approved rule pack is the content authority. The browser adapter may supply catalogue availability, presentation, price, and insurance context, but presentation code is not allowed to create clinical rules or thresholds.

This ADR intentionally does not decide which internal Type 2 implementation should be canonical. Tracing the older score path versus `decision-graph-v2`, then converging them, is reserved for the ordered Phase 3 Tasks 1 and 2.

## Patient and encounter boundary

The web runtime clients resolve their base URL from `NEXT_PUBLIC_RUNTIME_API_URL`, falling back to `NEXT_PUBLIC_ADMIN_API_URL`. The current Pages workflow injects the admin URL, so the deployed client reaches the same Cloudflare Worker for OAuth/admin and `/v1/*` platform requests. `src/platform-v3.ts` is the Wrangler entry point and delegates authenticated patient routes to `src/platform-index.ts` and `src/platform-patient-record-v2.ts`.

Patient Record v2 owns current patient and encounter commands and queries under `/v1/patients/*`. D1 is the durable runtime record. The legacy `patient_handoffs` table is compatibility-only and read-only after cutover: legacy write routes return `410 LEGACY_HANDOFF_WRITE_RETIRED`, while explicit lookup and promotion remain available for unmigrated records.

The global patient account architecture is additive. A practice-scoped patient registry remains the local clinical record for that practice; global identity and verified links do not replace, merge, or silently rewrite it. R2 is used for portal media and KV for AI/configuration secrets, not as the patient/encounter source of truth.

## Status of `apps/api`

`apps/api` is **local-development-only compatibility code** in the current deployment topology:

- the root `dev:app` script can start it beside the web app on loopback;
- no repository deployment workflow deploys it;
- the Pages workflow does not inject `NEXT_PUBLIC_API_URL`;
- catalogue routes used by the web app are browser-owned even if `NEXT_PUBLIC_API_URL` is set;
- patient/encounter clients use the Cloudflare Worker runtime instead.

Some web build-time imports still reuse catalogue and guideline seed files located under `apps/api/src`. That source-code dependency does not make the NestJS process a production runtime or source of truth. Moving those shared seeds to a neutral package remains planned cleanup.

Do not point production traffic or real patient data at `apps/api` unless a future reviewed architecture decision, persistence design, authorization model, and deployment plan explicitly promote it.

## Verification anchors

- Catalogue browser ownership: `apps/web/lib/api-client.ts`
- Catalogue publication: `apps/web/lib/admin-auth.ts` and `apps/admin-worker/src/index.ts`
- Type 2 evaluation: `apps/web/app/type-2/type2-scenarios-client.tsx` and `packages/clinical-engine/src/index.ts`
- Worker entry point and bindings: `apps/admin-worker/wrangler.jsonc` and `apps/admin-worker/src/platform-v3.ts`
- Patient Record v2 routing: `apps/admin-worker/src/platform-index.ts` and `apps/admin-worker/src/platform-patient-record-v2.ts`
- Current deployment topology: `.github/workflows/deploy-pages.yml`

