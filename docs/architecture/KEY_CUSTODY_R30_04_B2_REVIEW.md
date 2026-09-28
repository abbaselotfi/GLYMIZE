# R30-04-B2 — Key custody review checkpoint

Date: 2026-09-28. Status: **review findings recorded; B2 remains open**. This is a bounded continuation of [R30-04-A](ENCRYPTED_LOCAL_STORAGE_R30_04_A.md), not a replacement architecture or permission to persist patient data. Reviewed source: `990221bef058a772e73898aad74e7a05f9a522ec`; fetched main: `0b47d326da326a7997c8fcadd832032cefeed5de`. No application code, dependency lock, clinical behavior, migration or deployment changes in this packet.

## 1. Material correction to B1 evidence

**Later Astra High disposition (2026-09-29):** [dependency/lifecycle decision](KEY_CUSTODY_R30_04_B2_DECISION_2026-09-29.md) reopens custody and memory selection, records checked lock/recovery requirements and schedules bounded Sol High remediation before final protocol selection. This supersedes this paper's next-task wording; the candidate table remains unfrozen and historical evidence is retained.

**Subsequent implementation evidence:** [the Sol High corrective raw-key proof](../R30_04_B2_RAW_KEY_PROOF_2026-09-28.md) passes the raw-key and backup-negative obligations below. [The bounded Windows-memory and Stronghold probes](../R30_04_B2_MEMORY_STRONGHOLD_FEASIBILITY_2026-09-29.md) are also complete. They reproduce the memory-lock failure and prove a private native custody path plus its SQLCipher-copy boundary; final dependency/protocol/memory-policy selection and persistent custody evidence remain open. None of these prerequisites closes B2.

`apply_raw_key` passes exactly 32 binary bytes to `sqlite3_key`. The pinned SQLCipher source interprets this as passphrase input and derives the page key with PBKDF2; it is **not the raw-key path**. The raw-key-only form is 67 ASCII bytes: `x'` + 64 hexadecimal characters + `'`, passed with an explicit length through the native API. A raw page key still has separate HMAC-key derivation; do not claim all KDF work disappears. See [SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/) and [upstream README](https://github.com/sqlcipher/sqlcipher/blob/master/README.md).

Exact inspected artifact: `libsqlite3-sys 0.38.2/sqlcipher/sqlite3.c`, SHA-256 `EA0BF0B08F688CA5D9312B2E33E7F81B3F4AE54B5016FB062AE1F2632A30A1B9`, lines 111183–111234. Its format/length checks select the raw branch; the fallback invokes the provider KDF. The B1 Rust call is at `apps/desktop/spikes/r30-04-b1-sqlcipher/src/main.rs:78`.

The prior build, unreadable-with-wrong/no-key, tamper, query, WAL and backup observations remain evidence for the **binary-passphrase candidate only**. Preserve the original evidence JSON and hashes, including its misleading historical `rawBinaryKeyApi` label. The measured cold-open time includes this derivation and is not a raw-key baseline. This does not establish an encryption failure, but it reopens the raw-key compatibility claim before custody integration.

Required corrective proof inside the existing synthetic spike, not a new product store:

1. Encode the exact native raw-key form without interpolating SQL or logging secret bytes. Cover leading zero, high-bit and all-byte-value inputs, exact length and invalid length handling.
2. Independently create/open equivalent synthetic raw-key fixtures, reject the same 32 bytes interpreted as a passphrase, and reject wrong/no keys. Do not rely only on round-trip tests using the same helper.
3. Re-run cipher identity, page tamper, workspace identity, WAL/crash, side-file and encrypted backup checks with the corrected candidate. Include wrong/no backup key checks.
4. Record new executable/source/evidence hashes and cold/warm measurements separately. Never rewrite the old binary-passphrase database as if it used the new encoding; use new synthetic directories. No production migration is authorized.

## 2. Windows locked-memory finding

The prior `VirtualLock` failure with error 1453 and subsequent stack overflow remains an observed B1 failure, not a resolved exception. [Microsoft documents](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-virtuallock) that locked pages are resource-limited.

Source inspection identifies a plausible re-entrant path in the pinned amalgamation: `sqlcipher_mem_malloc` → `sqlcipher_mlock` → warning log → `sqlcipher_fprintf` for stdout/stderr → `sqlite3_vmprintf`/`sqlite3_malloc` → allocator. Relevant ranges: 110214–110223, 110158–110163, 111685–111716 and 111834–111910. This is a **source-supported causal hypothesis**, not a captured crash stack or proof of the original failure's complete cause. Ordinary file logging has a different branch.

The completed bounded subprocess probes cover ON/OFF and disabled/stderr/file log destinations with fixed workloads and timeouts. `ON` plus stderr reproduces stack overflow; file logging completes but records only `VirtualLock` `LastError=1453` warnings. Disabled logging hides the warnings and is not evidence of success. No real keys/PHI or automatic dump uploads were used. Do not suppress warnings, enlarge working-set quotas, run as Administrator, or turn memory security OFF and label the defect fixed. Changing global library memory/log settings must occur in a dedicated process before concurrent database use.

B1's explicit OFF setting remains experimental only. Separately test Stronghold allocation failure and release behavior; its memory protections do not prove SQLCipher pages, Argon2 working memory, renderer copies or Windows crash/hibernation files are protected. Production policy stays unaccepted until the failure is resolved or a reviewed, clearly bounded alternative is accepted.

## 3. Native custody feasibility and proposed protocol

The Stronghold direction is retained, but not activated. `iota_stronghold 2.1.0` is now pinned only in a separate feasibility-crate manifest/lockfile, not the Tauri application or monorepo runtime. Native APIs exercised: `KeyProvider::try_from(Zeroizing<Vec<u8>>)`, `commit_with_keyprovider`, `load_client_from_snapshot`, `clear`, and a private `UseSecret`. Its `ClientVault::read_secret` remains test-only. Do not enable `insecure` or a generic renderer secret-export route. The lock graph has zero RustSec vulnerabilities but unsuppressed unmaintained warnings for transitive `bincode 1.3.3` and `paste 1.0.15`; exact dependency selection remains an Astra High decision. [Versioned crate](https://docs.rs/iota_stronghold/2.1.0/iota_stronghold/), [source](https://docs.rs/crate/iota_stronghold/2.1.0/source/).

The feasibility crate proves a private `UseSecret` operation can supply only the purpose-derived DB key directly to the native SQLCipher handle, returning success/failure rather than key bytes. It also proves the remaining-handle boundary: Stronghold clear blocks a new handle but cannot revoke an already-keyed connection. Claim **no renderer export**, not “keys never leave Stronghold,” and close statements/connections before clearing custody. Bounded allocation/clear success does not prove OS page-lock success because the resolved `stronghold-runtime 2.0.1` ignores the `sodium_mlock` return value. Do not use the fast-hash `KeyProvider::with_passphrase*` constructors as a password KDF. Tauri's example plugin permissions are not approved GLYMIZE capabilities. [Tauri Stronghold documentation](https://v2.tauri.app/plugin/stronghold/).

The following is a **candidate for synthetic evaluation, not a frozen persistence format**:

| Concern | Candidate and acceptance condition |
| --- | --- |
| Independent secrets | OS CSPRNG generates separate 32-byte workspace root, snapshot key, device factor and recovery secret. RNG failure aborts setup. No B1 deterministic key generator in custody. |
| Password KDF | Argon2id v0x13, initial evaluation profile m=65,536 KiB, t=3, p=4, 32-byte output and fresh 16-byte salt. This is the RFC 9106 memory-constrained profile, not a measured GLYMIZE latency budget. Evaluate RustCrypto `argon2 0.5.3`; pin/audit the resolved dependency set before implementation. |
| Input/DoS bounds | Define exact UTF-8 password handling without silent trim/normalization; bound encoded length and envelope size before allocation. Accept only explicit profile IDs, not arbitrary attacker-supplied memory/iteration values. Serialize unlock work and measure low-resource hardware; never silently reduce KDF strength after allocation failure. |
| Normal unlock | Combine the KDF output and random CurrentUser-DPAPI-protected device factor using reviewed domain-separated HKDF-SHA256; use a distinct wrapping key for the snapshot key. Passphrase alone, device factor alone, a different workspace or a copied wrapper must fail. DPAPI is not guaranteed hardware binding. |
| Key hierarchy | Root-derived DB/object/lookup keys have distinct versioned purpose labels; snapshot/wrapping keys remain distinct from page keys. B2 must freeze salt/info encoding and known-answer vectors before persistent implementation. |
| Envelope | Evaluate RustCrypto `chacha20poly1305 0.10.1` XChaCha20Poly1305: 32-byte key, 24-byte fresh random nonce, 16-byte tag. No reduced-round feature. Explicit nonce/key-use limits and RNG-failure/repeated-nonce tests are required; randomness is not an absolute uniqueness guarantee. |
| Authenticated context | Freeze one canonical length-delimited binary encoding for format, suite, purpose, workspace UUID, key epoch, object/revision/generation, KDF profile/salt and wrapping metadata. Bind install identity only to device wrappers, never portable recovery. Reject ambiguous/duplicate/trailing/unknown fields and cross-purpose swaps. Encoding and vectors remain a pre-implementation gate. |
| Recovery | Independent high-entropy recovery secret wraps the snapshot key with its own KDF domain/context. A verified encrypted snapshot plus DB/object backup and recovery material must suffice on replacement hardware without old DPAPI, password or Internet. Never depend on a snapshot key stored only inside its own snapshot. |
| Password change vs rotation | Password change rewraps only custody with new salt/nonce. Data-key rotation is a separately journaled generation change with verified encrypted backup and crash tests. Old copied backups remain readable with their old recovery material. |

References: [RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.html), [Argon2 0.5.3](https://docs.rs/argon2/0.5.3/argon2/), [XChaCha20Poly1305 0.10.1](https://docs.rs/chacha20poly1305/0.10.1/chacha20poly1305/), [CurrentUser DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata). Exact library graph, HKDF/OS binding versions, canonical bytes and memory measurements are intentionally **not claimed selected or tested** by this paper.

## 4. Lifecycle and acceptance gates

- Setup creates a new candidate directory; verify recovery before protected activation. An existing corrupt/missing vault must never trigger blank workspace recreation.
- Publish immutable encrypted generations with a verified manifest binding snapshot, DB, objects and key/schema versions. Preserve the last accepted generation until the new one passes reopen/integrity tests; atomic rename alone is not a proven Windows power-loss guarantee.
- Restore into a new isolated destination, reject traversal/reparse/oversize/tamper/unsupported versions, and verify pending operations, revisions and provenance. Local Only recovery has no Internet dependency; Cloud-linked restore does not revive grants or automatically upload.
- Restart/logout/lock closes all DB handles and clears native custody and plaintext buffers. Tests must distinguish requested zeroization from evidence about actual library copies. Do not promise protection from an administrator or malware in an unlocked process.
- Valid whole-artifact rollback cannot always be detected offline after all local state is restored together. Authenticated generation checks prevent mix-and-match, not absolute rollback. Record the actual backup recovery point.
- No C integration before R30-05/07 actor/practice/patient/RBAC contracts. A storage unlock is not staff authentication or professional verification; R31-01 owns that shared authority design.

## 5. Execution order and completion status

1. **Completed / Sol High:** corrective raw-key proof and bounded Windows-memory/Stronghold API feasibility probes, synthetic only, on the isolated branch. No persistent custody format or app plugin.
2. **Next / Astra High bounded follow-up:** consume those results, finalize exact dependency/encoding/KDF/recovery and memory policy. Explicitly adjudicate the `VirtualLock` failures, unobservable Stronghold `sodium_mlock` return and two transitive maintenance warnings. Reopen the candidate decision if native custody cannot meet the boundary; do not substitute plaintext or a parallel key store.
3. **Sol High:** implement and test the frozen synthetic custody/recovery harness. B2 closes only with positive/negative/known-answer, corruption, rotation interruption, rewrap and offline replacement-device evidence.
4. Existing R30-04-C with R30-05/07 and R31-01/02, then single-device Clinic Host and the previously scheduled LAN/clinical/AI/sync/recovery/installed-acceptance sequence. No duplicate roadmap IDs or removed acceptance gates.

This review checkpoint is useful evidence, **not completion of B2 or final approval of its protocol**. The corrected raw-key proof is a prerequisite within existing B1/B2, not a second storage project. C2's accepted VM evidence and all missing R29 RC evidence remain unchanged.

## 6. Validation record

PRE Roadmap/Graph gate passed on a clean isolated branch containing fetched main. Tier 2 graph discovery found the native helper and its keyed-open/negative-test callers; the self-edge is a resolver artifact, not recursion in the Rust helper. Coverage marked source metadata changed, so exact source was read. Third-party crate source is outside the project graph and was inspected directly. The PRE refresh reported 8,903 nodes / 33,876 edges, 26 known partial files and zero skipped; six additional resolved edges versus the earlier 33,870 count appeared before any edits and are not new application behavior.

POST Roadmap/Graph gate passed. Refreshed local graph: 8,912 nodes / 33,885 edges (+9/+9 versus refreshed PRE), 26 known partial files, zero skipped. The main-based impact query includes the existing B1 branch and reports its same 25 inbound rows, not 25 new callers from this documentation change. This packet changes eight Markdown files only. Sequential monorepo test/typecheck/lint passed 21/21 tasks (19 cached); Desktop 9/9 executed freshly. All 102 relative links and staged diff checks passed; staged Gitleaks scanned approximately 19 KB with zero leaks. B1 evidence JSON retains SHA-256 `407692AAB553C812F8D2A384C4FBE34ABD00723B5053CC6B9DECA18B1629207D`. Graph ADR was updated without dropping prior records; the durable decision is also in this document and ARCHITECTURE.md.

Historical B1 runtime results are not fresh B2 tests. No shared/main graph publication or Cloudflare deployment is part of this isolated checkpoint. Publication status is reported separately after exact-SHA verification.

Publication safety check: live Pages source GET succeeded after the existing Wrangler OAuth refreshed. Deployments are enabled; custom preview policy includes `*` and excludes only `fix/r28-07-handoff-confirmation-lifecycle-20260910`, not this spike branch. Push is held pending authorized branch-only exclusion and trigger recheck. No cloud settings were changed. Absence of GitHub Actions runs does not certify absence of Pages builds. Local commit is permitted; remote publication is not claimed.

The follow-up GET also reports path includes `*`, no path exclusions, and a latest deployment record for the earlier B1 SHA `990221bef058a772e73898aad74e7a05f9a522ec` on this branch with `is_skipped=false`. This is evidence that the earlier Push was not excluded, not proof of a successful deployment or a new deployment by this checkpoint. Do not repeat the previous no-deploy assumption.

Owner-authorized resolution later in this checkpoint: PATCH added only `feat/r30-04-b1-sqlcipher` to `preview_branch_excludes`, preserving the existing exclusion. An independent GET verified the expected list and equality of every other pre-existing source field, `production_branch`, `build_config` and `deployment_configs`. No main/Production setting was changed. GitHub repository hooks count is zero and reviewed workflow branch filters do not match this branch. This supersedes the hold above; exact-SHA remote/Pages skip verification follows Push. The earlier unskipped B1 record is retained as historical evidence, not altered or deleted.
