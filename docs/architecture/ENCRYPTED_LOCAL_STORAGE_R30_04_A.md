# R30-04-A — Encrypted local storage, key custody and offline recovery

Started: 2026-09-22; reviewed: 2026-09-27. Status: bounded design packet; implementation candidate selected, **not runtime acceptance**. Owner confirmed Astra High for this packet. Parent: [Roadmap §30](../ROADMAP.md), [R30-01](LOCAL_FIRST_R30_01.md), [Offline Clinic target](OFFLINE_CLINIC_LOCAL_INTELLIGENCE_ADR.md). The broader Offline Clinic ADR remains Proposed; this document does not supersede current [Runtime of Record](RUNTIME_OF_RECORD.md).

## 1. Source baseline and decision boundary

Baseline `f4d4c6feda967c7fd825ad248179ea45df37138c`, equal to fetched `origin/main`, clean before task. R30-03-C2 accepts only the reference shell. Directly inspected:

- `apps/desktop/src-tauri/Cargo.toml`, `src/main.rs`, `tauri.conf.json`: Tauri only, reference routes, empty IPC permissions; no SQLite or Stronghold integration in these files.
- `apps/admin-worker/src/runtime-security.ts`: server clinical AES-GCM payloads bind caller-supplied AAD; request-scoped decryption-key reuse is not a portable local key store.
- `apps/admin-worker/src/platform-patient-record-v2-core.ts`: random record IDs, practice/patient-bound encrypted identifiers and revision-bound snapshots.
- `apps/admin-worker/src/patient-core/authority-read-repository.ts`: scoped projections, provenance and decryption failures remain meaningful; encryption does not authorize a read or establish clinical verification.

Tier 2 graph discovery plus exact source fallback was used. Initial graph: 8,731 nodes / 33,288 edges; coverage reported metadata drift, so graph output was not treated as proof of source freshness. Scope is documentation/architecture only: no runtime/plugin, dependency lock, schema, migration, credential, AI, clinical or feature-flag change. On September 27 resumption, separate owner/agent instruction and analysis files were present; they are preserved and excluded from this packet's commit. Context7 rechecked the rusqlite build route against upstream documentation; no native build is claimed.

## 2. Storage decision and alternatives

**Select SQLCipher Community page encryption as the implementation candidate**, through a native-only Rust storage adapter. Use separate authenticated envelopes for attachment objects, portable backups and key wrapping. This is not a choice of envelope-only SQLite. Acceptance of the exact build depends on R30-04-B1/B2; failure reopens this decision under Astra High, never silently falls back to plaintext.

| Candidate | Search and exposure | Cost/build consequence | Disposition |
| --- | --- | --- | --- |
| SQLCipher Community | Native indexed queries remain usable after unlock; database/index pages encrypted. Side-file behavior must be checked on our build. | Self-build and redistribution notices; no paid edition selected. Native crypto/toolchain maintenance remains our responsibility. | Selected candidate. |
| Ordinary SQLite with application field envelopes only | Exact keyed lookup is possible, but relational metadata and any plaintext index/temp column need independent protection; range/prefix/full-text search risks broad decrypt scans or additional leakage. | More custom schema/crypto/search complexity, even without a license fee. | Not selected as the primary PHI store. |
| Ordinary SQLite plus Stronghold or OS disk encryption | Secret storage or disk protection does not itself encrypt exported database/attachment/backup files. | Useful defense in depth, insufficient as the application storage boundary. | Not sufficient alone. |

Upstream SQLCipher encrypts database and journal/WAL page content; other temporary files require explicit handling. It is a specialized SQLite build, not a loadable encryption extension. [SQLCipher design](https://www.zetetic.net/sqlcipher/design/). Community distribution requires notices, including dependency notices; commercial binaries/support are not assumed free. [Community terms](https://www.zetetic.net/sqlcipher/community/).

Prefer a pinned `rusqlite`/`libsqlite3-sys` SQLCipher build with a bundled crypto provider for the Windows spike. Upstream supports `bundled-sqlcipher-vendored-openssl`; that documents an integration route, not proof of GLYMIZE MSVC compatibility. Record exact source versions, feature graph, compiler, crypto provider, notices and artifact hashes; inspect advisories before pinning. No package version is selected by this paper. [rusqlite upstream](https://github.com/rusqlite/rusqlite).

The official Tauri SQL plugin exposes frontend database operations through SQLx. Do not enable its generic JavaScript SQL surface for PHI. A native adapter preserves the existing narrow-command boundary; it is not another clinical backend. Retain the Stronghold direction for native key custody, but do not grant renderer key/store/export permissions. Stronghold is not database encryption. [Tauri SQL](https://v2.tauri.app/plugin/sql/), [Stronghold](https://v2.tauri.app/plugin/stronghold/).

## 3. Workspace, query and persistence boundary

One random workspace UUID maps to one operational clinic database and its independent key set. Multiple practices on one Windows account must not share a database key. Resolve workspace paths internally beneath a private application-data root; reject caller-controlled paths, UNC/network shares, traversal and reparse-point escapes. Do not place the active database in OneDrive or a removable-media working directory. Offline media is for distribution, verified backup or transfer, not concurrent live database access.

The same native repository port serves single-device use first and the later Clinic Host API. Phones never receive database files or database keys. One host serializes writes, with bounded reads/queues and explicit busy/disk-full failures. WAL requires same-host coordination; it is not a network-share database. [SQLite WAL](https://www.sqlite.org/wal.html).

Native operations validate the active actor, workspace/practice, patient subset, permissions, expected revision and applicable authority profile before querying. Scope is obtained from the authenticated session, not trusted from a UI argument. Crypto unlock is not clinician login, role elevation, physician confirmation or professional verification. Cancel obsolete work and clear plaintext on scope/session change.

Keep existing patient/encounter/operation UUID semantics, typed aliases, provenance, immutable signed records and revision checks. National IDs are not keys and no `0000` lookalike identifier is generated. Identifier lookup uses a workspace-purpose key and canonical type/issuer/value normalization; no central HMAC secret or server ciphertext is copied to local storage. Index equality can leak repetition to an unlocked database observer; do not call it anonymization. Start with exact lookup and bounded history; defer fuzzy/FTS indexes until measured and explicitly reviewed.

R30-05 owns command/schema parity. The local database has a separately versioned adapter schema, not a blind copy/execution of D1 migrations. A permitted local mutation, revision, audit entry and future outbox intent must commit atomically. Local Only operations remain durable without any cloud acknowledgement; enabling Sync later needs an explicit baseline/enrollment contract, not fabricated historical acknowledgements.

### Disk and memory exposure checklist

| Surface | Required policy and negative evidence |
| --- | --- |
| Main DB, indexes, free pages | Encrypted from first creation; no plaintext intermediate DB; raw-key API preferred over interpolated key SQL/logs. Verify cipher identity, keyed read and wrong/no-key rejection; a successful unknown PRAGMA alone proves nothing. |
| WAL, rollback journal, statement/temp files, SHM | Inspect actual generated artifacts with synthetic canaries and file-I/O tracing. Disable file-backed temp storage at build and connection level, verify effective settings. SHM and headers can expose structural activity; do not claim every byte is encrypted. |
| Attachments/OCR/thumbnails | Opaque random filenames, encrypted authenticated objects, protected metadata in DB. Streaming bounded processing; no plaintext preview/cache/temp fallback. Separate attachment key domain and object/version/scope binding. |
| Browser/logs/crash/AI | No PHI in browser persistence, telemetry, SQL traces, command lines or automatic crash uploads. AI/OCR does not receive storage keys. Minimize plaintext lifetime; zeroize owned buffers where feasible, acknowledge runtime copies. |
| Backups/export | Encrypted consistent package, not a copy of a live `.db` alone; no unencrypted dump or key beside backup. Deliberate patient transfer remains separate R31-05 authorization. |

Use a fail-closed connection factory for every handle: key before schema access, verify expected workspace/schema identity, foreign keys and defensive settings; prohibit arbitrary `ATTACH`, extension loading and raw SQL IPC. Candidate write policy is WAL plus `synchronous=FULL`, bounded checkpointing/read duration and explicit transaction outcomes; do not trade away acknowledged-write durability for benchmarks. Test the selected SQLite base against current WAL fixes. Page authentication is not proof against restoration of an older valid whole database. [Key verification/API](https://www.zetetic.net/sqlcipher/sqlcipher-api/), [WAL durability](https://www.sqlite.org/wal.html).

Disk size, timestamps and access patterns remain visible. Encryption at rest cannot defeat an administrator, malware in an unlocked process, screenshots, paging/hibernation or copied old backups. OS full-disk protection and restricted ACLs are defense in depth, not prerequisites secretly substituted for application encryption. No tamper-proof offline time, secure deletion on SSDs, or absolute anti-rollback claim.

## 4. Key custody and authorization profiles

Generate an independent random 256-bit workspace root, with purpose-separated database, attachment, lookup and wrapping keys; version the key hierarchy. Never derive the data key directly from a national ID, account UUID or reusable cloud password. No server signing/encryption master material, central password verifier or cloud provider credential is distributed.

Normal unlock requires both a local unlock passphrase factor and a Windows-user-protected device factor. Use reviewed libraries for a memory-hard password KDF and domain-separated key derivation/wrapping; salts and versioned KDF parameters are nonsecret. Stronghold holds the wrapped key hierarchy in native custody. The Windows factor is random, protected with CurrentUser DPAPI, not machine-wide protection. DPAPI alone is not a hardware binding guarantee (roaming profiles are an exception). [Microsoft DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata).

R30-04-B2 must pin the exact Stronghold/native integration, KDF algorithm/parameters, authenticated wrapping library, canonical AAD encoding and nonce lifecycle before implementing persistent custody. Require known-answer and tamper tests, calibrated memory/latency on the supported low-resource tier, versioned min/max KDF bounds against downgrade/resource exhaustion, fresh salts and no fast-hash password substitute. A design change to these boundaries needs a short Astra High review, not ad-hoc implementation. Library names are not security evidence.

The planned authenticated envelope binds format version, purpose, workspace UUID, key version and object/revision identity; install identity applies to device wrappers, not portable backups. Nonces must never repeat under a key. Reject malformed, mixed-workspace, replay-incompatible or unknown-version input before use. Retain necessary historical key versions until dependent backups/data are safely migrated; credential rewrapping and data-key rotation are different operations.

- **Local Only:** a locally created owner governs local RBAC indefinitely without a central grant. The owner must establish and verify recovery material before protected workspace activation. Staff get individual sessions/roles, not workspace root keys or owner recovery powers. This is not central physician verification.
- **Cloud-linked:** valid enrollment/offline grants still gate protected commands. Possessing a decryptable database does not renew a grant or bypass central membership rules. Restore never fabricates a valid grant; R30-07 owns outage/clock/revocation policy.
- **Patient device:** separate future subset keys and patient authorization. No reuse of clinic owner keys, grants or recovery credentials.

After reboot the host starts locked; no hidden unattended unlock or Windows autologon. In single-device mode logout/lock closes DB handles and clears key/renderer state. Later Clinic Host needs an explicitly visible service-unlock state distinct from each clinician's session: clinician logout must invalidate that session, while an authorized owner may keep the host available to other authenticated staff. Whole-workspace lock stops all protected operations. R30-07/R31-03 must specify this before LAN activation.

Password change rewraps keys only after verifying the old factor; it does not silently change data keys. Staff password reset cannot recover root keys. Local retry throttling is useful but cannot prevent offline guessing of copied artifacts. Missing/corrupt vault/device factor must never recreate an empty workspace over the existing database.

## 5. Offline recovery, backup and migration

Recovery deliberately permits portability otherwise denied by normal device unlock. Use a high-entropy, generated recovery secret (not security questions), shown once with verification and an offline printable/exportable format. Store it separately from the computer and backup media; never upload it automatically. It wraps only the versioned recovery key material, not a permanent centrally verified identity. Whoever has both a complete backup and its recovery secret can recover its data; disclose this custody power.

Initial target is single-owner recovery, not an unimplemented quorum. Multi-owner/quorum custody is deferred for explicit product/security design. Losing all unlock and recovery factors means encrypted data may be unrecoverable; support cannot promise a backdoor. Lost recovery material while still unlocked permits creation/verification of a replacement, but does not revoke readable old backups already copied by someone else.

Backup transaction boundary: pause new writes for the initial implementation, establish a committed generation, produce a keyed consistent DB snapshot plus referenced immutable encrypted objects and audit/outbox/inbox/revision state. Retain objects until the snapshot is finalized. Authenticate manifest, schema/cipher/key versions, workspace identity, component hashes/counts and generation; use opaque external metadata. SQLite's backup API is a consistency mechanism, not an assurance that our destination is encrypted: key and test that destination before writing. [SQLite backup API](https://www.sqlite.org/backup.html).

Write a new encrypted candidate, flush/close/verify, then publish atomically on the same filesystem; do not overwrite the last verified backup first. Interrupted writes leave an unaccepted candidate. R31-09 adds scheduling/retention/removable-media UX and real replacement-machine acceptance over these R30-04 primitives, not another backup implementation.

Restore into a new isolated directory; reject unsafe paths/links, oversize archives/KDF parameters, missing components, wrong keys, corrupted tags and unsupported future formats. Verify decryption, database integrity and domain invariants before activation. Preserve unsynced operations, original operation IDs, source actors, revisions and provenance. Generate a new installation/device epoch for new work; never replay using cloned sequence/session identity. Disable automatic cloud upload during restore pending explicit reconciliation; no revoked sessions or old grants resurrect. Local Only recovery remains possible offline, with owner reauthentication/credential reset recorded separately from historical authorship.

A local migration has its own version/checksum journal, exclusive writer lease, pre-migration verified backup and power-loss checkpoints. Preserve old encrypted data until the new state is verified. Reject downgrade/newer schema rather than open with old code. Never modify an applied migration or silently roll back after new writes. If failure leaves uncertain state, expose recovery-required read restrictions instead of claiming success. Recovery cannot reconstruct changes made after the most recent usable backup; show the actual recovery point.

## 6. Execution packets and executable acceptance obligations

These are children of existing R30-04, **not duplicate R31 capabilities**. None of the tests below has been run by this design packet.

| Packet / model | Boundaries and required acceptance |
| --- | --- |
| **R30-04-B1 / Sol High — accepted 2026-09-28** | The isolated [Windows synthetic-data spike](../R30_04_B1_SQLCIPHER_SPIKE_2026-09-28.md) pins the native dependency graph and passes cipher identity, correct/wrong/no key, tamper, indexed exact lookup, crash/WAL recovery, temp/side-file canaries and encrypted backup round-trip with a pending synthetic operation. Measurements are bounded evidence, not a production SLO or plaintext comparison. No app IPC, PHI, auth, migration or runtime activation. |
| **R30-04-B2 / Astra High bounded review, then Sol High implementation** | Pin key-envelope/KDF/Stronghold protocol from B1 compatibility evidence; implement synthetic custody/recovery harness only after review. Verify wrong password/user/device/workspace, nonce/AAD/tag tamper, key rotation interruption, password rewrap, missing/corrupt vault and offline replacement-device recovery. No auto-unlock or secret export to renderer/logs. |
| **R30-04-C / Sol High after R30-05/07 reviewed contracts** | Integrate private storage/migration/backup primitives through narrow ports and scoped commands. Prove actor/practice/patient/RBAC isolation, restart locking, optimistic concurrency and atomic mutation/audit/outbox failures; preserve reference-shell regressions. Coordinate R31-01/02, not independent competing account or patient implementations. |
| **R31-09 and R30-09/R31-10 / existing tasks** | User-facing backup lifecycle and exact installed-candidate tests: unsynced data restore, replacement Windows device, offline re-login, interrupted migration/rotation, corrupted/missing media, then safe reconnect without duplicate encounters. Clinical/AI/LAN acceptance still belongs to its existing owners. |

Stop and reopen the design if B1 cannot deliver encrypted temp/side-file policy or usable bounded queries, if B2 cannot enforce native key custody and verified recovery, or if recovery requires an online account. A passing synthetic harness alone never authorizes patient data in the reference shell. Parent R30-04 remains open until integration and recovery acceptance pass.

B1 also found that `cipher_memory_security=ON` fails Windows `VirtualLock` with `LastError=1453` and then overflows the process stack on the validation host. The accepted B1 harness records this setting OFF; B2 must resolve or explicitly bound locked-memory and zeroization behavior under Astra High. This observation does not silently change the intended production key-custody design.

## 7. Design acceptance and unchanged gates

Local validation on 2026-09-27: 94 relative document links and `git diff --check` passed. Sequential `turbo run test typecheck lint --concurrency=1` passed 21 tasks (19 cached); these are existing regression checks, not tests of unimplemented encryption. PRE gate passed on the original clean baseline; POST gate passed after architecture refresh. Local graph is 8,819 nodes / 33,362 edges with 26 known partial files and zero skipped files. Its delta includes unrelated local instruction/analysis files present at resumption, not new runtime functions from this design. The canonical GitHub graph must be generated from the committed source separately. ADR was synchronized through the graph service without dropping prior records. RC Worker dry-run passed with the existing RC-only bindings; remote publication/CI remain a separate exact-commit verification step.

A is complete only as a reviewed, published design: alternatives/selection, threat limits, two trust profiles, custody/recovery, migration compatibility and downstream negative tests recorded; document links/diff and Roadmap/Graph gates pass. Production encryption approval remains conditional on B1/B2/C and installed evidence. Full runtime regression is not substituted for tests of unimplemented storage.

Publication follows the owner's standing local/GitHub/RC alignment instruction: reviewed documentation commit to main, exact-SHA CI/shared graph, RC Pages source and RC Worker publication verification. No production deploy, D1 migration (including 0019), default-off activation or new provider. R29-01 through R29-05 and R30-02 retain every missing acceptance gate. See [active handoff](../ACTIVE_TASK_HANDOFF.md) for the next model checkpoint.
