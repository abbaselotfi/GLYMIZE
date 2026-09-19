# R29-05-C — owner-authorized RC deployment

Owner selected RC, then explicitly authorized migration **0018 only** before deployment. This supersedes the deployment-destination blocker in earlier handoffs. No production Worker deployment, main merge, 0019 migration, clinical feature activation, synthetic seeding or paid service is authorized by this packet.

## Candidate and targets

- Runtime/frontend source: `6f70c588c8a5aa77ee875177ed9607c6fa34adae`; [CI 35022947290](https://github.com/abbaselotfi/GLYMIZE/actions/runs/35022947290) passed including browser flows.
- RC Worker: `glymize-rc-portal-staging`; RC D1: `glymize-runtime-rc`, `3fa1a950-189d-487c-9ffc-8f91a4557117`.
- RC KV: `0b88c7b5544e4b848aaf748ed6a6e75b`; R2: `glymize-portal-media-rc`.
- Pages project `k1lqjcpcsjdfs4xtzkegqe` serves `rc.glymize.ir` and its pages.dev domain only. Its provider-labelled production slot uses `--branch main`; this is the **RC application domain**, not a Git merge or deployment of the production Worker.
- Runtime proxy and Admin API target the RC Worker. New offline bundle activation remains OFF; R29 read flags remain absent/default-OFF. Existing portal/identity flags are preserved.

## Recovery points and migration

- Pre-0018 D1 Time Travel bookmark: `000000bf-00000000-000050eb-0354cdc9d07c78f3f20bc4aa58dff146` (2026-09-19). Time Travel availability was checked through Wrangler; no clinical database export was downloaded. Retention depends on the account plan. Restore overwrites later writes and needs a separately reviewed incident decision, not an automatic smoke-test action.
- Previous RC Worker: `90167e35-33c0-4b45-ae8b-0208bdf9d032`; deployment `e23515c8-f65b-41ca-92e3-5b2df1971521`.
- Previous Pages canonical deployment: `f49c7f7b-e87d-464d-8315-536e953c855d`.
- Production Worker invariant: `shiny-block-9d4a`, version `570890fb-81b8-4508-bce0-389469344087`, deployment `e13903fe-c921-4314-b318-8af5865587fd`. Active D1 is `ba073c8d-4925-4dab-a39c-6fa0f592cf1f`; generic settings must not substitute for version-pinned bindings.

`wrangler.rc.jsonc` pins RC resources and restricts migration discovery to the exact 0018 filename. A regression test protects that scope and keep-vars behavior. SQLite in-memory rehearsal applied 0001–0018, created both triggers and returned zero foreign-key violations. Focused RBAC/gateway and RC configuration/build tests pass; Worker typecheck/lint and dry-run pass. No runtime source changed from the validated candidate.

First remote attempt with repository Wrangler 4.115.0 failed with `incomplete input`; independent schema/ledger reads confirmed **no partial 0018 objects or migration entry**. This matches [Cloudflare issue 14991](https://github.com/cloudflare/workers-sdk/issues/14991), fixed in [4.124.0](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler%404.124.0). Pinned one-off `pnpm dlx wrangler@4.135.0` applied the unchanged CRLF migration successfully; project dependencies/lockfile and migration contents were not changed. Local migration file SHA256: `22d2e08b92f582fbef8c05fc9e2605677580dc8b2046bec9882243a8b3732f01`.

Post-migration read-only verification: 0018 recorded, 0019 not recorded; role table, index and both triggers present; missing active-member assignments = 0; incorrect initial roles = 0; `foreign_key_check` empty. No identities or clinical payloads were queried or printed.

## Deployment and acceptance

RC Worker deployed as `787faa91-1d2c-41ce-8a78-929dde88c9c6`, tag `rc-6f70c58`. Exact previous/new plain-text variables and secret-binding metadata compare equal; RC D1/KV/R2 bindings remain pinned. `/v1/platform-v3` returns 200/ready with unchanged capability flags. Wrangler's 10ms startup report is not request CPU/latency acceptance.

Frontend RC build passed with same-origin `/runtime-api`, fixed RC upstream, split market assets (7066 products, largest chunk 18,869,718 bytes). Pages canonical deployment `45784fd0-be72-4b17-9315-a400e78c0401` succeeded and serves https://rc.glymize.ir. Provider source metadata records 6f70c58 and dirty=true because release configuration/documentation were not yet committed; runtime/frontend source was independently unchanged from that candidate.

Post-deploy HTTP: `/`, `/type-2/` and `/runtime-api/v1/platform-v3` return 200; unauthenticated session/archive return the expected 401. Gateway responses identify `pages-same-origin` and `no-store`. Headless Chrome DOM-content/visible-body smoke passed both pages with no page errors. The first browser probe timed out waiting 45s for `networkidle`; the successful bounded DOM probe is not a claim that all background traffic settled or that authenticated workflows passed. No patient credentials/data were used. Production version/deployment independently remain unchanged.

This is deployment verification, not completion of R29 benchmark/replication/rollback-exercise gates or protected offline clinical acceptance. Authenticated RC workflow acceptance remains outstanding. Configuration, tests, Roadmap and ADR evidence are published separately from the already deployed runtime candidate.

Publication follow-up: evidence/configuration commit `932c1a1e5cd1cbf94ec3d9462f329e249ec1e8e1` is on the fix branch and GitHub Actions run `35457811581` passed. Its exact-branch Pages event was skipped, so canonical RC Pages deployment `45784fd0-be72-4b17-9315-a400e78c0401` remained active.

## Repository gate

Pre-refresh accumulated graph delta: 117 to 120 paths; Git independently identifies this packet's seven edited/new files. Whole-document ADR synchronized and full local index refreshed: 8363 nodes / 32174 edges, 25 known partial files, zero skipped. Exact-source fallback covers the migration/configuration and changed test; the graph is not exhaustive evidence. Local graph binary remains ignored. PR #143 remains open with auto-merge disabled; exact fix-branch Pages Preview exclusion independently reverified before publication. No main merge or automatic RC re-deployment is part of this evidence commit.
