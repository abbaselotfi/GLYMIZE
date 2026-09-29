# R30-04-B2 — bounded SQLCipher memory remediation proposal

Status: **proposal for Astra review, not a product policy or B2 acceptance**. This document does not change the pinned SQLCipher binary, its PRAGMAs, the Tauri runtime or any clinical behavior.

## Exact observed boundary

The pinned `libsqlite3-sys 0.38.2` SQLCipher amalgamation has SHA-256 `EA0BF0B08F688CA5D9312B2E33E7F81B3F4AE54B5016FB062AE1F2632A30A1B9`. In `sqlcipher_mem_free`, `sqlcipher_mem_security_on` gates **both** random overwrite and `sqlcipher_munlock`; with OFF, the wrapper forwards to the default allocator. The realloc path similarly forwards under OFF. Under ON, `sqlcipher_mlock` calls Windows `VirtualLock` but returns `void`; failed lock produces a log event, not a failure returned to the allocation caller. The existing non-elevated probe saw Windows error 488; stderr logging recursed/crashed, file logging recorded failures, and suppressing logging did not prove locking. The codec-private allocator's erasure does not cover all SQLite memory.

The KC1 adapter's checked dedicated page protects only its own bounded key ring. A keyed SQLCipher connection retains native copies and must close before that page is cleared. Passing the KC1 page test cannot close the SQLCipher memory gate. Existing B1 OFF results are comparisons, not an accepted security mode.

## Narrow candidates to test; no silent fallback

1. **Instrumented allocator boundary on the same pinned SQLCipher build.** Install a process-scoped custom SQLite allocator before initialization, whose free/realloc path erases the exact allocated capacity and whose allocation can fail observably. Keep SQLCipher codec-private erasure. Verify the allocator is actually the one SQLCipher wraps and that no alternate page-cache/extension route bypasses it. This is a candidate only if zero-on-free and failure paths can be demonstrated without relying on best-effort `VirtualLock`; it makes an explicit at-rest/owned-buffer claim, **not** a no-paging claim.
2. **Small reviewed SQLCipher-source patch separating erasure from page locking.** In a test-only copy of the exact amalgamation, make allocator free/realloc sanitization unconditional while treating lock policy as a distinct explicit decision. Any production fork would need reproducible source hash/patch, license notices, upgrade/maintenance owner and all regression gates. No patch is authorized by this proposal.
3. **Unmodified ON with a bounded logger.** This avoids stderr recursion but does not make `VirtualLock` failure fatal and did fail non-elevated locking in prior evidence. It is **not** a sufficient remediation by itself. Neither ON-with-hidden-warning nor OFF-without-erasure is a candidate for automatic promotion.

## Bounded experiment before decision

- Use only synthetic data in a separate harness and separate target directory. Preserve the unmodified B1 baseline; fingerprint every test artifact and source/feature graph. Do not point Tauri or production at the experiment.
- Run under a normal, non-elevated Windows account with no working-set quota change. Record allocator callback counts, zeroization-before-free/realloc, size rounding, OOM and `VirtualLock` failure channels without logging addresses, keys or plaintext. Inject allocation/realloc/free failures and verify safe close and no `Locked` state while a DB handle survives.
- Exercise keyed open, wrong key, WAL/checkpoint, backup, integrity, crash/restart and concurrent statement/connection close. Measure peak private bytes, page-lock failures and bounded latency. Verify a short/failed operation leaves no readable side file and no silent downgrade.
- Compare instrumented candidate with unmodified ON/OFF evidence, including sanitizer logs and any allocator coverage gap. A zeroized app-owned buffer test alone is insufficient to claim SQLite-wide memory erasure. Document process-memory, crash-dump, paging/hibernation and malicious same-process limitations.
- Run RustSec/license review and a bounded Astra decision on the exact binary/patch/policy. If no candidate meets an explicit policy, B2 stays open; do not disable the gate to advance C.

Decision needed: choose the enforceable claim and exact implementation *after* evidence. The product may ultimately adopt an explicit at-rest-only/best-effort memory-locking policy only by a separate security review, not by this proposal or by the synthetic KC1 tests.
