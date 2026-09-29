# R30-04-B2 — Native custody selection and KC1 protocol contract

Date: 2026-09-29. Status: **selected for the next isolated synthetic harness; not product acceptance**. Baseline `4b5745502395bbfce4a301f73273c6e9a746dc2a`, branch `feat/r30-04-b1-sqlcipher`, fetched main `0b47d326da326a7997c8fcadd832032cefeed5de`. This consumes the [remediation/KDF matrix](../R30_04_B2_REMEDIATION_KDF_2026-09-29.md) and supersedes the *pending custody selection* in the [reopening decision](KEY_CUSTODY_R30_04_B2_DECISION_2026-09-29.md). Its lock/recovery invariants still apply. B2 remains open, particularly SQLCipher memory acceptance and real replacement-device recovery.

## 1. Selection and explicit limits

Select a **single-purpose native Windows custody adapter** behind A's existing native repository port. Do not promote unchanged Stronghold or maintain a Stronghold fork: its unchecked locking, unbounded snapshot/decompression/deserialization and maintenance burden are disproportionate to this small key ring. Preserve its experiments and warnings as historical evidence; do not rewrite their lockfiles. No generic secret store, renderer key export, Tauri SQL/Stronghold plugin or second clinical backend is introduced.

Use reviewed primitives, not home-made cryptography. KC1 below is a small versioned framing/key-management protocol, not a new cipher. The code in the evidence directory generates **public deterministic vectors only**; it is not the native custody implementation and must never be imported by the app.

| Component | Pin / feature contract for the synthetic implementation |
| --- | --- |
| Password derivation | `argon2 = 0.6.0`, defaults off, `alloc,zeroize`; no `parallel`. Caller-owned, fallibly allocated blocks and cleanup guard on every exit. |
| Envelope | `chacha20poly1305 = 0.10.1`, defaults off; detached in-place XChaCha20Poly1305. No `reduced-round`, RNG or stream feature. This version zeroizes its stored key on Drop unconditionally; do not copy newer documentation's optional-feature/API assumptions. |
| Derivation / hashing | `hkdf = 0.12.4`, `sha2 = 0.10.9`, defaults off; HKDF-SHA256 with 32-byte output. Library-internal HMAC/hash copies are outside an owned-buffer erasure guarantee. |
| Owned buffers | `zeroize = 1.8.2`, defaults off, `alloc`; no Clone/Debug/Serialize on secret owners. |
| Windows binding | Proposed harness pin `windows-sys = 0.61.2`, defaults off, only `Win32_Foundation`, `Win32_Security_Cryptography`, `Win32_System_Memory`, `Win32_System_SystemInformation`. Resolve/audit this platform graph before its first use; not in the vector-only lock. |
| Database | Retain B1's `rusqlite = 0.40.1` / `libsqlite3-sys = 0.38.2` SQLCipher build and raw-key proof. No product memory configuration is accepted here. |

Commit the exact harness lock, feature tree, licenses/notices and fresh RustSec result before accepting that harness. The vector-only lock is reproducibility evidence for the four crypto primitives, not certification of a future merged Windows/SQLCipher dependency graph. Preserve Apache/MIT and all transitive notices; no paid component or service is selected.

### Memory disposition — do not silently weaken the gate

Owned native key arena: dedicated committed `VirtualAlloc` pages (one system page for the bounded ring and working secrets, no shared heap page), checked `VirtualLock` before secret ingress, checked protection transitions, bounded access leases and zero-before-unlock/free. RNG uses checked `BCryptGenRandom` with `BCRYPT_USE_SYSTEM_PREFERRED_RNG`; failure aborts. Allocation/lock/protection/cleanup errors must be observable, not panic-only or ignored. A failed partial initialization remains Locked; failed cleanup follows `LockFailed`. Require non-elevated OS and injected-failure tests before claiming the arena works. No administrator requirement, quota increase or automatic unlocked-memory fallback. Memory protection does not prevent a malicious same-process reader; library stack/register copies are not part of the arena.

KDF workspace is 64 MiB, explicitly cleared but not promised locked. Serialize unlocks across workspaces (one in flight); reject rather than enqueue unbounded work. Owned password, KDF output, device factor and raw-key encoding are transient and cleared on success/error. Small primitives can copy secrets internally; keep their lifetimes within the guarded operation. The application must not describe this as protection against an administrator, unlocked-process malware, paging/hibernation or every crash-dump copy.

**SQLCipher memory remains a blocking acceptance item, not a waived test.** Exact amalgamation SHA-256 `EA0BF0B08F688CA5D9312B2E33E7F81B3F4AE54B5016FB062AE1F2632A30A1B9`: `sqlcipher_mem_free` at lines 110227–110236 sanitizes only when memory security is ON; OFF forwards to the ordinary free/realloc path. Its separate codec private allocator still sanitizes its own allocations, which is not all SQLite/page-cache memory. ON's non-elevated failures and stderr recursion observation remain unresolved. Therefore neither OFF nor hidden warnings become a product policy here. Next Sol packet may implement/test custody without product linkage; existing OFF SQLCipher comparisons remain synthetic only. Before B2 closes, require a bounded allocator/logging remediation proposal and evidence, then Astra review of the exact SQLCipher build/policy. This blocker does not prevent testing framing, DPAPI, native key allocation and recovery independently.

## 2. KC1 input, keys and derivation

All integers below are unsigned little-endian; UUID fields are 16 opaque bytes in RFC UUID network byte order, never Windows GUID memory layout. Product UUID creation remains the existing random UUID contract. Vector byte sequences deliberately exercise raw encoding and are not generated identities. ASCII labels include the stated single NUL byte. No JSON, bincode, compression, variable text keys or implicit Unicode normalization enters cryptographic framing.

Password: exact valid UTF-8, 1–1024 encoded bytes at the cryptographic boundary; no trim, case fold, NFC/NFKC or replacement of malformed encoding. Reject embedded U+0000 and invalid/unpaired-surrogate input before KDF, including at a future JS-to-native boundary. Account/password-strength UX remains R30-07; accepting these bytes is not a policy that one-character passwords are suitable. Creation must explain that visually equivalent Unicode sequences may differ. Do not transform stored credentials on unlock.

KDF profile `1` is Argon2id v0x13, `m=65536 KiB, t=3, p=4, output=32`, fresh 16-byte salt. Only profile 1 is accepted for normal wrappers. Profile 0 means **no password KDF**, allowed only on non-password purposes with an all-zero salt. Reject unknown profile and header/size errors before Argon2/allocation. Never deserialize attacker-selected costs or lower this profile when memory is scarce. Existing median 239 ms on one i7 host is evidence, not an installed-device SLO.

Independent 32-byte OS-random values: workspace root `R[e]`, per-generation snapshot key `S`, local device factor `D`, separately held recovery secret `Q`. Data epochs `e` start at 1, increment without wrap, with at most 16 retained root epochs in a snapshot. New random generation UUID for every publication and new random installation UUID on restore. No derived recovery secret, no permanent OS-only unlock and no seed from deterministic vectors.

For purpose byte `p`, subject UUID `o`, epoch `e`, workspace `w`:

```text
info = ASCII("GLYMIZE-KC1") || 00 || U8(p) || w[16] || LE32(e) || o[16]
K(p, ikm, w, e, o) = HKDF-SHA256(salt=w[16], IKM=ikm, info=info, L=32)
```

| p | IKM | subject `o` | Output use |
| --- | --- | --- | --- |
| 1 | Argon2(password,salt)[32] concatenated with D[32] | generation UUID | Normal wrapper key, encrypts S[32] |
| 2 | Q[32] | generation UUID | Portable recovery wrapper key, encrypts S[32] |
| 3 | S[32] | generation UUID | Custody snapshot key, encrypts the root ring |
| 4 | R[e][32] | sixteen zero bytes | SQLCipher raw page key; native exact 67 ASCII bytes `x'` + 64 lowercase hex + `'`, explicit length; never SQL interpolation |
| 5 | R[e][32] | immutable object UUID | Attachment envelope key; no ID/revision reuse for changed content |
| 6 | R[e][32] | sixteen zero bytes | Reserved identifier-lookup key; identifier normalization/HMAC format stays R30-05/Identity, not implemented here |
| 7 | R[e][32] | generation UUID | Manifest envelope key |

Normal and recovery wrappers both carry the same S. Root keys are inside the authenticated snapshot, not wrappers; S is never recoverable only from inside its own ciphertext. A changed password causes fresh salt, generation and S, but preserves R[e] and DB derivation. Cross-purpose/workspace/epoch/subject keys differ.

## 3. Exact envelope bytes and bounds

KC1 uses XChaCha20Poly1305 with key 32, nonce 24, tag 16 bytes. Envelope = **header[130] || ciphertext[plaintextLength] || tag[16]**. The entire exact header is AAD; ciphertext length equals plaintext length. No padding/trailing fields. All reserved values must be zero; unknown version/suite/purpose fails closed.

| Offset | Bytes | Field |
| --- | --- | --- |
| 0 | 8 | ASCII `GLYKC001` |
| 8 | 2 | suite = 1 |
| 10 | 1 | purpose: envelope purposes only 1,2,3,5,7 |
| 11 | 1 | flags = 0 |
| 12 | 16 | workspace UUID |
| 28 | 16 | installation UUID for purpose 1; zeros otherwise |
| 44 | 16 | generation UUID |
| 60 | 16 | subject UUID: generation for 1,2,3,7; object UUID for 5 |
| 76 | 4 | current/owning root epoch, nonzero |
| 80 | 4 | local adapter schema version; harness accepts exactly 1 |
| 84 | 2 | KDF profile: 1 for purpose 1, else 0 |
| 86 | 16 | fresh password salt for purpose 1; zeros otherwise |
| 102 | 24 | independently random nonce |
| 126 | 4 | plaintext length |

Pre-authentication values are **untrusted routing hints**, not workspace authorization. Select trusted expected scope outside the blob and compare it before exposing results. Require whole length = 146 + declared length with checked arithmetic. A parser reads a fixed header first; never unbounded `read_to_end`. No partial plaintext is visible before successful tag verification. Clear the scratch buffer on failure even if the primitive reports no mutation.

Purpose 1/2 plaintext length exactly 32. Purpose 3 root ring: `LE16(1) || LE16(count) || count * (LE32(epoch) || root[32])`; count 1–16, strictly increasing unique nonzero epochs, includes header epoch and no later epoch. Exact length 4+36*count, maximum 580. Purpose 5 maximum plaintext 16 MiB, one immutable object per envelope (larger attachments require a later reviewed chunk profile, not implicit concatenation). Purpose 7 maximum plaintext 1 MiB. Other lengths fail before expensive work.

Use fresh CSPRNG nonces and fresh random generation/S per publication. Each derived generation/object key has **one encryption use**: retry by copying already sealed immutable bytes, or abandon the generation/object ID and obtain new randomness; never reseal modified content under the same identity/key. Reject duplicate generation/object IDs within owned state and manifest. Crash/restored state cannot prove global nonce history; fresh randomness and fresh identity are required, not a claimed absolute uniqueness guarantee. Forced RNG error/repeated output must abort the synthetic test; never fall back to a clock or counter. Root epoch policy caps 2^32 object/generation derivations per root and refuses overflow; replacement/rotation is explicit, not an automatic data-loss repair.

## 4. Windows device binding and recovery card

Device file plaintext passed to DPAPI: ASCII `GLYDP001` || workspace[16] || install[16] || D[32], exactly 72 bytes. Optional entropy is SHA256(ASCII `GLYMIZE-DPAPI-1` || 00 || workspace || install). Use CurrentUser `CryptProtectData`/`CryptUnprotectData` with `CRYPTPROTECT_UI_FORBIDDEN` only, null description/prompt/reserved; never `CRYPTPROTECT_LOCAL_MACHINE`. Bound protected blob to 16 KiB before API call; reject unexpected decrypted length/context; clear API output before `LocalFree`. DPAPI is user-profile protection, **not guaranteed unique hardware binding**. No DPAPI success can unlock without the password wrapper/tag and remaining generation verification. Never put Q or an exportable root in this file.

Recovery card canonical ASCII: `GLY-R1:` + 32 lowercase hex workspace digits + `:` + 64 lowercase hex Q digits + `:` + 8 lowercase hex checksum digits; exactly 113 characters, no whitespace. Checksum = first four bytes of SHA256(ASCII `GLYMIZE-RECOVERY-1` || 00 || workspace[16] || Q[32]). It is typo detection, **not authentication**. Reject malformed text/length/workspace/checksum before using Q; authenticate via the recovery wrapper and full generation. No security question or human-selected recovery password. A future UX may display grouping without changing the canonical encoded bytes.

Verify a separately held card by a recovery round-trip before declaring setup/rewrap accepted. Q is not stored in the DPAPI file, ordinary custody snapshot, backup or logs. During an unlocked password change, require Q again to produce the new recovery wrapper for fresh S; otherwise keep the existing generation and report unavailable. Alternatively, explicit replacement of Q requires displaying/verifying/storing the new card first. Possessing card plus backup confers data recovery power, not professional verification. Old copied backups remain recoverable with their old card.

## 5. Quiescent generation and backup manifest

This B2 format covers **immutable, quiescent synthetic generations**, not hashes of a live mutable DB. R30-04-C/05 must later specify the active workspace's mutation/checkpoint adapter without pretending an immutable backup manifest authenticates every subsequent write. That integration cannot change KC1 bytes silently.

Generation is a directory, not ZIP/tar: fixed `normal.kc1`, `recovery.kc1`, `custody.kc1`, `device.dpapi`, `database.db`, `manifest.kc1`, and zero or more `objects/<32-lowercase-hex-object-id>.kc1`. No other files, links/reparse points, caller-chosen paths, case aliases, duplicates, traversal or network locations accepted. Enumerate with bounded counts and safe handles; recheck same-file identity against races. Raw transfer into this directory is staging only, never activation. Portable recovery needs no successful use of normal/device entries, but verifies their bytes as part of the manifest.

Manifest plaintext = ASCII `GLYMF001` || LE32(entryCount) || sorted entries. Each entry = U8(kind) || id[16] || LE64(fileLength) || SHA256(exactFileBytes)[32]. Kinds: 1 normal, 2 recovery, 3 custody, 4 device, 5 DB, 6 object. Non-object IDs are zeros; object ID matches its canonical filename. Sort lexicographically by (kind,id raw bytes); exact one of kinds 1–5 and 0–16384 unique objects. Each entry is 57 bytes. Manifest excludes itself to avoid a circular hash, but its AAD binds workspace/generation/schema/epoch. Max DB 16 GiB; device max16 KiB; each other envelope obeys §3; total generation max64 GiB with checked sums. Stream hashes and DB copy, never allocate total lengths. Physical disk/free-space checks and cancellation must fail without deleting the prior generation. Limits are the initial harness contract, not promised final clinic capacity.

Decrypt S via the chosen wrapper, authenticate custody/root ring, then manifest. **Before DB open/activation**, verify every component hash/length/name, all matching workspace/generation/epoch/schema headers and object set. A DB's internal synthetic workspace/schema/key-epoch marker must also match; run SQLCipher and domain integrity checks before acceptance. Old immutable objects may retain their original generation and own epoch: manifest binds their exact bytes/IDs, owning epoch must exist in root ring, and workspace/schema must match; do not rewrite their headers to the new backup generation. No server secret or clinical authority originates in the bundle.

Publish: stop admission and settle writes under the existing coordinator; keyed consistent backup with audit/outbox/inbox/revision state; stage objects, both wrappers, DPAPI and custody; seal manifest last; flush, close, reopen and verify; then publish a pointer to the verified immutable directory on the same filesystem while preserving the previous verified directory. Treat pointer as an untrusted locator (validate all data again), not authority. No automatic selection of an older generation after a validation failure. Crash at each boundary, disk-full, short write and rename failure are required tests; an atomic rename is not a power-loss guarantee. Actual power-loss behavior remains installed acceptance.

## 6. Rewrap, rotation, restore and migration

- Rewrap requires current unlock and the recovery card (or explicitly confirmed replacement card), fresh password salt/D-protection as applicable, S, generation and nonces. Root and data epochs remain unchanged. Publish a complete verified generation, never replace one wrapper in place. Failure preserves old generation/card.
- Rotation takes an exclusive lease, verified pre-rotation backup, new R[e+1] and new encrypted DB/object generation; reencrypt rather than relabel. Keep every old epoch required by retained objects/backup recovery. No silent eviction at the 16-epoch limit. Prove interrupted rotation never mixes new page keys with old wrappers.
- Recovery: card plus complete generation, no old password, DPAPI account or Internet; verify all bytes, restore to a **new isolated directory**, generate fresh install UUID/D/password wrappers/S/generation. Preserve patient/encounter/operation UUIDs, revisions, authorship and unsynced work. Reset live sessions/grants; never upload automatically. R30-07 owns local-account recovery authority, not this storage decoder.
- KC1 is the first synthetic protocol, **not** compatible with prior unversioned B1 or Stronghold fixtures. Reject unknown/legacy/future formats without mutation. Do not infer old key mode from decrypt success. No implicit bincode import, destructive `PRAGMA rekey`, D1 migration or production migration is authorized. A future migration must identify exact source format/key mode and destination profile, read only into isolated staging, verify semantic equality and publish with the same crash gates. Preserve original evidence; no migration exists to run now.
- Whole valid-generation rollback can be undetectable after all offline state is rolled back. Hashes prevent component splicing, not trusted chronology. Show the actual recovery point and never promise recovery of post-backup mutations.

## 7. Required next Sol High packet and stop conditions

The [public vectors](../evidence/r30-04-b2-protocol-vectors/README.md) freeze encoding and primitive outputs for the synthetic harness. They do not prove a parser, DPAPI implementation, protected arena, file publication or data recovery exists. Implement those under B2, separate from Tauri, then test:

1. Fixed vectors plus independent AEAD interoperability; UTF-8 distinctions, missing/oversize/trailing/unknown fields, integers/count overflow, wrong purpose/workspace/install/epoch/schema, bad password/device/card/tag/nonce, short/long files and bounded KDF rejection.
2. Real and injected RNG/allocation/VirtualLock/protection/free failures, every partial initialization cleanup, KDF error-path clearing and non-elevated serialized unlock. No diagnostic prints of secrets/plaintext.
3. Restart locked; exact close-before-custody-clear state machine and all races/negative cases in the reopening decision. Failed close cannot publish Locked. A cleared key arena cannot revoke an open DB handle.
4. Recovery, rewrap and root rotation preserve synthetic unsynced IDs/revisions/provenance. Hash/manifest splicing, old-object epoch, disk-full, interrupted publication and restore, missing component, path/reparse/race negatives. Real clean replacement Windows account/device offline recovery remains required evidence, not a mocked DPAPI pass.
5. Resolve the SQLCipher memory gate with an explicit reviewed alternative before B2 closure/product integration. Do not temporarily disable security or label current OFF probes a fix.

Stop/reopen Astra review on a protocol ambiguity, unsafe allocator/API behavior or required byte-format change; do not implement a guessed interpretation. No new roadmap ID, R29 closure, C2 retest, runtime, PHI, clinical behavior, provider, main merge, migration or deployment follows from this decision. C still requires B2 and R30-05/07, coordinated with R31-01/02.

## 8. Source and validation record

Tier 2 graph: baseline 9,320 nodes / 34,633 edges, 29 partial files, zero skipped. `apply_key_from_vault` has two direct in-scope callers; the field-as-callee edge is heuristic, not a runtime link. Coverage metadata drift required exact source reads; the remediation PowerShell line 69 partial was also read. SQLCipher and RustCrypto registry sources are outside repository graph coverage. Direct source confirms no custody linkage in the Tauri reference entry point.

Context7 helped identify APIs, but its current AEAD examples describe a newer API/feature set; the exact 0.10.1 source controls this pin. External contracts: [DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata), [VirtualLock](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-virtuallock), [Argon2 0.6.0](https://docs.rs/argon2/0.6.0/argon2/), [HKDF 0.12.4](https://docs.rs/hkdf/0.12.4/hkdf/), [AEAD 0.10.1](https://docs.rs/chacha20poly1305/0.10.1/chacha20poly1305/). These references support primitive/OS contracts, not certification of this GLYMIZE protocol.

Final local gates/publication are recorded in [the active handoff](../ACTIVE_TASK_HANDOFF.md). No acceptance result may be inferred from this design alone.
