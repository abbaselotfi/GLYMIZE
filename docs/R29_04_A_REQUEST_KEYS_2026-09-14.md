# R29-04-A — Request-owned clinical keys (2026-09-14)

## Scope and decision

Implemented locally for the exact authorized patient history GET only. `PATIENT_CORE_CRYPTO_KEY_REUSE_ENABLED` enables reuse only when its value is exactly `true`; absent/other values retain legacy derivation. Configuration remains OFF. This flag is independent of the D1 read-session flag.

The route creates a lazy request-owned decryptor. Concurrent rows share its in-flight key derivation; no decryption means no key import. The key is non-extractable and decrypt-only, with unchanged SHA-256 material and CLINICAL-DATA-V1 purpose. Each new request creates a new closure. No module-global key, plaintext or PHI cache exists in this addition. Existing auth/authority/write and summary-route behavior is unchanged; observation, demographics and timeline-order readers use the optional capability only when supplied.

AES-GCM AAD, IV, tag handling and null-on-failure behavior are preserved. Authentication failure on one row does not prevent the next valid row. A failed key derivation stays failed within that request, avoiding repeated failures; a new request can derive again. Rotation uses each request's supplied secret, without introducing old-secret fallback. SQL, row limits, decryption accounting and reader concurrency are unchanged.

References: [Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) and [request-state best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/). This is key reuse, not a new encryption scheme or authorization grant.

## Verification

- Full Worker suite: **51 files / 325 tests passed**. Typecheck and lint passed.
- New security tests cover concurrent lazy import, non-extractability/decrypt-only usage, distinct request keys, changed secrets, practice/record AAD mismatch, malformed IV/ciphertext, altered tag, derivation failure recovery and no plaintext caching.
- 80 legacy decryptions require 80 key imports; 80 request-owned decryptions require one. Both still perform 80 decryptions.
- Real encrypted route fixtures produce identical responses with reuse OFF/ON, with either D1-session setting. Imports fall from two to one; query/decryption/failure counts remain 6/2/0. Denied, missing and empty fixtures perform no AES import.
- Initial full run exceeded the benchmark's default five-second timeout under suite contention. Only that benchmark timeout was increased to 30 seconds; subsequent full suite and final focused ten-test suite passed. No latency threshold is asserted.

## Bounded local measurement

Node v24.18.0 Web Crypto; seven paired rounds, alternating execution order; 80 synthetic encrypted rows per request. Fixtures prepared outside measurement. First round excluded below. Source SHA-256 (runtime-security.ts): `3a34af6e8c8ab811e618d087cf2ccef4d4282ad6827ebfe372146ea2fb6adce8`.

| Mode | Six measured wall-ms samples | Median ms | Sample p95 ms (nearest rank) |
| --- | --- | --- | --- |
| Legacy | 38.2515, 35.0697, 33.3051, 38.3607, 34.9082, 36.3306 | 35.7002 | 38.3607 |
| Request-owned | 18.9659, 19.5828, 17.3891, 17.9458, 19.4905, 17.4594 | 18.4559 | 19.5828 |

Warmup wall ms: legacy 37.7873, request-owned 20.0103. Measured process CPU ms: legacy [46,47,31,109,31,31], request-owned [0,16,16,16,16,16]; coarse Windows/process-wide accounting is not per-request Worker CPU. Six samples are descriptive, not a production percentile estimate. Worker CPU, D1 latency, real traffic and RC benefit are **unmeasured**; remote requests: zero. Do not translate fewer imports into an equivalent application speedup.

## Files and remaining gates

Runtime boundary: runtime-security.ts → patient-core/decryption.ts → demographics/observation/timeline-order readers; route.ts owns lifecycle; context.ts carries the optional narrow capability; platform facade/index carry the independent opt-in. Tests: clinical-key-reuse.test.ts, patient-core-read-session.test.ts and its boundary guard.

No dependency, schema/index migration, paid service, deployment, remote activation or commit. R29-04 is not complete. Next **R29-04-B / Astra Medium / medium relative token cost**: bounded read-only query-plan and rows assessment before selecting any index migration. R29-01 baseline RC evidence, R29-02 classified cache, R29-03 replication/conditional bookmarks and R29-05 rollout/Turnstile/Placement/rollback remain scheduled, as does protected local-first work.

Graph evidence is advisory: metadata drift required direct source fallback. The accumulated branch delta includes earlier approved packets; it is not this packet's file count. Local graph refresh is not publication of the shared main snapshot.

Post-gate: accumulated delta 95 → 99 paths captured before refresh; ADR synchronized; local graph ready with 8144 nodes/31518 edges, 25 known partial files and zero skipped. New-file/metadata freshness limitations were checked against exact source. Typecheck, final lint and diff checks passed; local binary stays excluded.
