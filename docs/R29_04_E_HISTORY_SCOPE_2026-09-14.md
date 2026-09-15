# R29-04-E — Narrow history scope lookup (2026-09-14)

## Outcome

Implemented locally under the [D security/behavior contract](architecture/HISTORY_SCOPE_LOOKUP_R29_04_D.md). Exact authorized history GET can use a measured registry-only existence read when PATIENT_CORE_HISTORY_SCOPE_LOOKUP_ENABLED is exactly the string true. Missing/false/other values retain full-summary behavior. The flag is independent of D1 sessions and key reuse; configuration remains OFF.

The existing registry query is extracted as readPatientCoreRegistry in patient-summary-reader.ts and reused by the full summary reader. SQL/bind order remains SELECT id,status FROM patient_registry WHERE practice_id=? AND id=?. A history-specific options type selects the narrow helper only for history. Auth, role closure, archive behavior, cursor/sourceVersion/AAD logic, original context, source accounting, authority/write handlers and full summary behavior are unchanged. The same request database capability keeps registry first and preserves direct-primary / first-primary routing.

This is not authorization or a cache. Failed registry reads still throw; no retry/fallback/empty successful result is introduced. Full summary remains strict about its own dependencies. Opt-in history deliberately no longer reads identifiers, demographics or the latest-encounter companion query, so those unrelated failures cannot block otherwise valid requested history. See D's explicit error matrix; this is not blanket failure equivalence or a patient-integrity certificate.

## Verification

- Focused read-session/facade tests: **2 files / 57 tests passed**.
- Full Worker suite: **51 files / 352 tests passed**.
- Worker typecheck and lint passed.
- Eight combinations cover observations/timeline × D1 OFF/ON × key reuse OFF/ON, comparing successful bodies under a fixed Date. Query counts are **6 → 3**, decryption counts **2 → 1** in fixtures with one demographics row and one history payload. No claim all requests decrypt exactly those counts.
- Registry fixtures now enforce actual practice/patient bind order and include another patient in the same practice. Missing and populated wrong-practice cases return 404 after one registry query; archived rows remain accepted.
- Tests retain permission/role denial, invalid-family rejection, missing/failed-registry versus invalid-cursor precedence, first-query/session ownership, source-scoped encrypted observation/order AAD failures, sanitized query failures and no primary fallback/bookmark leakage.
- Throwing companion-query sentinels and malformed demographics distinguish legacy strict behavior from opt-in history. Full summary still fails on corrupt demographics; a direct full-summary fixture preserves its projection and four-query/one-decryption accounting.
- Static platform guard covers exact-string environment wiring. No real remote session/RBAC or deployment acceptance is claimed.

The full suite's existing local CryptoKey benchmark ran under suite contention; its timings are not used as performance evidence for E. Query/decryption work reduction is deterministic fixture evidence. Real Worker CPU, provider rows_read, latency and RC benefit remain unmeasured.

## Scope and guidance

Changed runtime files: patient-core/patient-summary-reader.ts, read-model.ts, route.ts, platform-patient-record-v2.ts and platform-index.ts. Tests extend existing read-session and boundary suites. No new package, schema/index migration, cloud setting, remote database access, deployment or commit.

Workers guidance kept this implementation request-owned, using existing bindings and propagated errors rather than global state or fallback reads. [Current best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) were consulted. Latest npm type retrieval failed with transport EOF; installed @cloudflare/workers-types 5.20260730.1 D1PreparedStatement signatures were inspected as the documented fallback. No platform API or configuration schema was changed; the added non-secret opt-in follows the existing optional-variable convention.

## Next packet and remaining gates

Graph limitation: inbound helper trace resolves the direct summary call but not history's dynamically selected lookup function. The history edge is verified by exact source and behavior tests; do not infer that the helper has only one runtime caller from the graph.

Post-gate: fetched origin/main contained (1 ahead/0 behind); accumulated delta 104 → 105 paths captured before refresh, including earlier packets. ADR synchronized; graph ready 8284 nodes/31919 edges, 25 known partial/zero skipped. Metadata drift used exact-source fallback; helper trace checked after refresh. Diff check passed. Local graph binary stays excluded; no shared snapshot publication.

**R29-05-A / Astra Medium / medium relative token cost:** prepare the local RC rollout/rollback evidence matrix and reproducible checks for the three independent read flags. Record baseline, individual and combined configurations, error/consistency cases and budget evidence; keep remote activation/deployment separate. Do not enable Turnstile/Smart Placement or select a migration without their existing gates.

R29-04 local A–E evidence does not close index/write-cost/D1/RC acceptance. R29-01 baseline, R29-02 classified cache, R29-03 replication/conditional bookmarks and R29-05 provider rollout remain open where previously recorded; protected local-first clinical access remains future gated work.
