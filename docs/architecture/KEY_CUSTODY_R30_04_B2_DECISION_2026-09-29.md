# R30-04-B2 — Astra High dependency and lifecycle decision

Date: 2026-09-29. Owner confirmed Astra High for this bounded review. Reviewed branch: `feat/r30-04-b1-sqlcipher` at `d6fc0e06f28ca736c88928871327ed7ada8fb549`, containing fetched `origin/main@0b47d326da326a7997c8fcadd832032cefeed5de`.

**Review outcome: reopen the custody dependency and memory-policy selection.** The review is complete as a decision; B2, its persistent protocol and protected storage are not complete. The [prerequisite evidence](../R30_04_B2_MEMORY_STRONGHOLD_FEASIBILITY_2026-09-29.md) does not support freezing a production format around the current candidate. This is the reopen branch expressly allowed by [the previous review](KEY_CUSTODY_R30_04_B2_REVIEW.md), not a failed test being waived.

## 1. Decisions and evidence

| Decision | Disposition and reason |
| --- | --- |
| SQLCipher Community native page encryption | Retain the R30-04-A candidate and corrected raw-key proof. Its encrypted-file behavior is distinct from the unresolved process-memory policy. No plaintext SQLite fallback. |
| `iota_stronghold 2.1.0` / runtime `2.0.1` | Keep the existing synthetic feasibility crate as evidence. Do not promote this locked graph into persistent product custody yet. Native private key application works, but memory-lock failure is unobservable to its caller and dependency maintenance remains unresolved. No generic Tauri Stronghold plugin or parallel product key store. |
| Memory protection | No currently tested SQLCipher mode is accepted as a production memory policy. `on-stderr` crashes; `on-file` records lock failures; `on-none` hides them; `off-none` is only a comparison. No Administrator requirement, quota expansion, disabled warning rule or automatic weaker mode. |
| Maintenance warnings | Keep both warnings visible. They are informational unmaintained advisories, not reported vulnerabilities or proof of compromise. Their absence from a vulnerability count does not settle long-term custody maintenance. Accept the existing graph only for the isolated, synthetic experiment. |
| Exact persistence format | Remains unfrozen. Do not invent final snapshot bytes, AAD or library pins while custody selection is reopened. The candidate Argon2/HKDF/XChaCha suite in the earlier review is retained for evaluation, not silently upgraded or approved. |
| Lifecycle and recovery invariants | Adopt sections 3–4 below as requirements for every candidate. These refine A's native-only boundary without activating storage, auth, clinical behavior or a migration. |

Direct source check: `stronghold-runtime-2.0.1/src/boxed.rs:322–324` calls `sodium_mlock` and discards its result. `mprotect` above it does check protection failures and can panic; these are different protections and neither implies the other succeeded. An external test that successfully calls `VirtualLock` on another buffer cannot certify Stronghold's allocations. [Microsoft's contract](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-virtuallock) requires checking the return value and describes the working-set limit.

The [bincode advisory](https://rustsec.org/advisories/RUSTSEC-2025-0141.html) and [paste advisory](https://rustsec.org/advisories/RUSTSEC-2024-0436.html) remain unmaintained notices with no patched version listed at review. Bincode's serialization role makes blind substitution particularly inappropriate: preserve snapshot compatibility or explicitly version a reviewed migration. A compile-time macro dependency and a runtime deserializer need separate reachability assessments.

Context7 resolved only broad IOTA documentation and returned no relevant Stronghold result. Versioned local crate source and the committed lockfile therefore supply that evidence. The RustCrypto query surfaced newer Argon2 allocation-failure handling; it does not authorize changing the earlier `0.5.3` candidate. Compare the exact versions before pinning, including allocation cleanup and MSRV. No dependency was installed or upgraded in this review.

## 2. Memory policy to evaluate

Classify memory by owner: native long-lived root/snapshot/device keys; transient KDF and raw-key encoding; SQLCipher connection keys/page cache; renderer result copies. Clearing one owner cannot certify the others.

The selected implementation must report what it can actually enforce. Failed key-buffer allocation/protection must leave the workspace locked and clean up partially acquired resources. No success result may mean that an unchecked lock was assumed successful. Full locking of all database pages and KDF work memory is not an existing A guarantee: A already excludes paging, hibernation and privileged-process attacks. Do not add that guarantee merely to satisfy a probe.

A future at-rest-only policy with best-effort page locking is a possible reviewed alternative, not accepted here. It requires an explicit comparison of retained zeroization, native key exposure, process/log behavior, supported hardware and paging/hibernation limitations. Turning `cipher_memory_security` OFF is not an isolated performance toggle: inspect the pinned allocator's zero-on-free behavior too. An owner request to temporarily disable a task is not permission to weaken encryption.

Keep synthetic memory experiments bounded and non-elevated. Use controlled error injection for failure paths rather than exhausting host memory. Report injected versus real OS failures separately. No debugger or dump should include real keys or patient data; automatic dump upload remains prohibited by A.

## 3. Required lock protocol

One native workspace coordinator owns every keyed connection, statement/cache, backup handle, custody handle and protected-operation lease. The later R30-05/07 commands must use that coordinator; this review introduces no renderer command surface.

States: `Locked → Unlocking → Unlocked → Locking → Locked`. Any uncertain cleanup ends in `LockFailed`; recovery from that state requires verified cleanup or termination/restart of the owning process. Neither `Locking` nor `LockFailed` admits protected work or a new unlock.

1. Atomically enter `Locking`, stop admitting protected operations, invalidate the workspace/session epoch and cancel queued work. Recheck the epoch before accepting a lease or publishing an asynchronous result. Already-admitted writes may have committed; do not label them rolled back without evidence.
2. Drain or interrupt bounded active operations and determine their transaction outcomes. Stop new backup, sync, key-rotation and AI work using this workspace. Preserve a committed mutation and its audit/outbox together; do not retry an uncertain write with a new operation ID.
3. Finalize statements, clear statement caches, release cursors, BLOB and backup handles, and explicitly close every keyed connection. Check close results. A deferred/zombie SQLite close or a Rust `Drop` call alone is not evidence that the last key-owning handle was released. On busy/failed close, remain unavailable and report cleanup failure; retain ownership for cleanup instead of forgetting the handle.
4. After all handles close, clear native custody, KDF/device/snapshot temporaries and owned result buffers. Handle cleanup errors explicitly. Invalidate old client clones and verify that they cannot reopen or key a connection.
5. Clear renderer state and suppress stale responses by epoch. Publish `Locked` only after the native cleanup acknowledgements. This proves the application lifecycle, not physical erasure of every OS/library copy.

Restart always starts `Locked`; there is no saved unlocked bit or automatic use of DPAPI alone. Failed unlock never makes a usable connection visible. Whole-workspace lock invalidates every session; a single clinician logout in a future running Clinic Host invalidates that clinician's session without implicitly stopping other authorized users. R30-07/R31-03 must define the latter authority before LAN use.

Required tests: lock racing a new query, active read/write, queued operation, delayed response, backup and rotation; busy close; custody-clear failure; old handle/client reuse; repeat lock; unlock racing lock; crash/restart while `Unlocking`, `Locking` or `LockFailed`. Each failure must leave protected commands unavailable. An in-process harness cannot claim guaranteed cleanup of a wedged native thread; process isolation/termination requires a later explicit boundary decision if needed.

## 4. Custody, recovery and generation requirements retained

- Normal unlock combines the local passphrase-derived factor and random CurrentUser-DPAPI device factor. DPAPI is not an assertion of unique hardware binding; a copied protected blob alone must not bypass the passphrase. Storage unlock is not staff RBAC or central professional verification.
- Independent CSPRNG-generated workspace root, snapshot key and recovery secret have distinct purposes. The root has versioned database/object/lookup derivations. No deterministic probe key enters product code.
- Recovery material plus a complete authenticated backup must recover on replacement hardware without the original Windows account, device factor, password or Internet. A snapshot key stored only inside that same snapshot is circular recovery and unacceptable.
- Password change verifies existing unlock authority and rewraps with fresh salt/nonce; it does not rotate clinical data keys. Recovery-secret replacement cannot revoke old copied backups. Data-key rotation creates and verifies a new encrypted generation; retain required old key epochs until data and retained backups are accounted for.
- Each accepted generation binds the exact custody snapshot, wrappers, keyed DB snapshot, object hashes, workspace and schema/key versions. An independently valid old wrapper/snapshot must not be spliced into a new manifest. Pure whole-generation rollback may be undetectable offline; do not promise a trusted monotonic clock/counter.
- Write/flush/close/reopen verification precedes publication; preserve the last verified generation. Test crashes at every publication boundary. Atomic rename alone is not proven Windows power-loss durability. Wrong password or missing/corrupt vault never initializes a blank database over existing data.
- Restore uses a new isolated destination and a fresh install/device epoch. It preserves original patient/encounter/operation IDs, revisions, provenance and unsynced work. Cloud upload and old grants stay inactive pending the existing reconciliation/authorization gates.

## 5. Exact next packet — Sol High, within existing B2

**Dependency and failure-observability remediation**, synthetic only. This is a subpacket of B2, not a new roadmap capability. Do not repeat the four already-recorded memory modes or successful Stronghold round trips unless the candidate changes.

1. Trace the exact locked dependency paths for `bincode` and `paste`, snapshot authentication-before-deserialization, serialization bounds and migration compatibility. Record reachability, upstream maintenance/release evidence and redistribution terms. Search for a maintained compatible release/fork before proposing an owned fork; a fork is not a drop-in product selection.
2. Evaluate a bounded native allocator/protection failure experiment for the exact candidate. Require observable allocation/lock/protection failures and cleanup of partial initialization, plus zeroization evidence within an owned-buffer test boundary. An external successful lock probe is insufficient. A test-only instrumented dependency must be separately identified and never replace the baseline artifact or production dependency silently.
3. Compare at most three options: maintained compatible Stronghold; a narrowly maintained patch with an explicit upkeep/compatibility burden; a native custody adapter using reviewed primitives. Preserve the same storage/auth/recovery boundaries. No alternative product store, OS-only recovery, new service or paid component is selected by this comparison.
4. Evaluate the existing RFC 9106 Argon2id profile (`m=65536 KiB`, `t=3`, `p=4`, 32-byte output, 16-byte fresh salt) on the declared hardware tier, including allocation failure and owned-workspace clearing. Compare relevant pinned Argon2 versions without silently changing parameters. Bound encoded password size and unlock concurrency in the proposal; no arbitrary imported KDF costs or automatic downgrade.
5. Produce one matrix with exact pins/features, build/audit/notices, failure visibility, serialization/recovery compatibility, non-elevated CPU/RAM/latency and remaining limits. Return to bounded Astra High for selection and final format vectors; do not proceed directly to the persistent harness.

That final protocol review must specify library/feature locks, input limits and UTF-8 handling, KDF profile IDs, HKDF salt/info byte encoding, key epochs, canonical AAD and length bounds, nonces/key-use limits, authenticated snapshot/bundle format, DPAPI flags, recovery-secret representation/verification, rewrap/rotation publication and known-answer/interoperability vectors. These items remain explicitly open. The following Sol High packet implements the resulting persistent synthetic harness; B2 closes only after its acceptance tests pass.

R30-04-C still waits for B2 plus R30-05/07 contracts, coordinated with R31-01/02. R31-09 reuses these recovery primitives. R30-03-C2 evidence and incomplete R29 gates are preserved. No runtime, migration, provider, deployment or main merge belongs to this review.

## 6. Validation and graph record

PRE gate: PASS, clean intended branch contains fetched main. Initial graph: 9,183 nodes / 34,385 edges; mandatory PRE refresh: 9,185 / 34,387, before edits. This +2/+2 refresh variation is not attributed to this documentation change. There are 28 known partial files and zero skipped. Tier 2 trace of `apply_key_from_vault` has three in-scope callers through depth two, all in the feasibility crate; no pagination remains. Exact Rust source was inspected because coverage metadata had drifted. Third-party allocator source is outside the repository graph and was inspected directly.

POST Roadmap/Graph Gate: PASS. Refreshed graph: 9,194 nodes / 34,396 edges (+9/+9 versus refreshed PRE), 28 known partial files and zero skipped. `detect_changes` before refresh identifies exactly ten Markdown/ADR files and zero changed source symbols. No Rust, manifest, lockfile or runtime path changed. The graph service ADR preserves earlier entries; the new decision is also committed in `.codebase-memory/adr.md`, which is deliberately excluded from code extraction and was read directly. Coverage metadata drift was handled with direct source review and the required refresh; graph coverage remains best-effort.

Sequential `pnpm exec turbo run test typecheck lint --concurrency=1`: 21/21 successful, all 21 cached, valid unchanged-code regression evidence rather than fresh crypto execution. All 120 relative file links across ten staged Markdown files and `git diff --cached --check` pass. Gitleaks scanned approximately 35 KB of the staged diff with zero leaks and no suppressed rule. Existing probe failures and historical test results remain unchanged; this review runs no new crypto or Windows acceptance experiment.

Publication precheck: live Cloudflare GET confirms custom Preview policy still excludes only the prior R28 branch and this B1 branch; production branch remains `main`. GitHub hooks count is zero and the inspected workflow filters do not run on this branch. Commit/push is authorized on this isolated branch; exact remote SHA and Pages skip must be checked after publishing. No cloud setting was changed.
