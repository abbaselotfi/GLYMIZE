# R30-04-B1 — Windows SQLCipher synthetic-data spike

Date: 2026-09-28. Model checkpoint: Sol High. Parent: [R30-04-A](architecture/ENCRYPTED_LOCAL_STORAGE_R30_04_A.md). Machine-readable evidence: [R30_04_B1_SQLCIPHER_SPIKE_2026-09-28.json](evidence/R30_04_B1_SQLCIPHER_SPIKE_2026-09-28.json).

## Verdict and boundary

**September 28 B2 review correction:** the native call uses a 32-byte binary **passphrase**, not SQLCipher's raw-key encoding. The historical JSON/hash is retained unchanged. Build/encryption/query/WAL/backup observations remain valid for that candidate; raw-key compatibility and its cold-open baseline require corrective proof before custody integration. See [B2 review](architecture/KEY_CUSTODY_R30_04_B2_REVIEW.md). This correction supersedes the raw-key wording below and in the historical harness metadata.

The isolated Windows-native SQLCipher spike is **accepted for R30-04-B1 only**. It proves that the pinned candidate can build and execute the required synthetic storage tests on the declared Windows host. It does not connect storage to Tauri, expose renderer IPC, create authentication, store PHI, migrate D1 data, activate a feature, or authorize production use. Parent R30-04 remains open for B2 key custody/recovery and C scoped integration.

The crate lives under `apps/desktop/spikes/r30-04-b1-sqlcipher` and is intentionally outside the application runtime/workspace. Generated database files, keys and build output remain ignored. The crash child receives its generated test key over stdin rather than command-line arguments.

## Pinned candidate and build

| Item | Accepted value |
| --- | --- |
| SQLCipher runtime identity | `4.14.0 community` |
| Rust adapter | `rusqlite 0.40.1` |
| Native binding | `libsqlite3-sys 0.38.2` with `bundled-sqlcipher-vendored-openssl` |
| Crypto source | `openssl-src 300.6.1+3.6.3`, `openssl-sys 0.9.117` |
| Serialization | `serde_json 1.0.151` |
| Rust toolchain | `rustc/cargo 1.98.1`, `x86_64-pc-windows-msvc` |
| Native toolchain | Visual Studio Build Tools 2022 `17.14.41` |
| Build-only Perl | Strawberry Perl portable `5.42.3.1`; archive SHA-256 `6A081A811781C30ACA51DBC036AFD93092AF91E3297901F02C17043795A10690` |
| Advisory scan | `cargo-audit 0.22.2`; 1,273 RustSec advisories loaded; zero findings in the 26-package lock graph |

The lockfile records the full resolved graph and `THIRD_PARTY_NOTICES.md` records redistribution follow-up. Cargo metadata showed a declared SPDX-compatible license for every third-party package. The experimental GLYMIZE crate itself is `UNLICENSED` and `publish=false`.

Vendored OpenSSL required a full Perl distribution and a short Cargo target path on Windows. `run-windows.ps1` discovers Visual Studio Build Tools, modifies environment variables only for its process, validates Perl core modules and executes format, test, clippy and Release acceptance. The build emitted MSVC `LNK4099` warnings because the vendored static OpenSSL PDB was not present; linking succeeded in Debug and Release and the warning did not suppress a test failure.

## Executed acceptance

| Check | Result |
| --- | --- |
| 32-byte binary passphrase and workspace/schema identity | PASS; raw-key path NOT proven (B2 correction) |
| No key and wrong key | PASS — unreadable |
| Tampered database page | PASS — HMAC rejection/unreadable |
| SQLite and SQLCipher integrity | PASS |
| Exact lookup uses `idx_synthetic_patient_lookup_token` | PASS |
| `TEMP_STORE=2`, effective in-memory temp store | PASS |
| WAL checkpoint and committed crash recovery | PASS; synthetic pending operation recovered |
| Plaintext canary scan across DB, WAL, SHM, tampered copy and backup | PASS |
| Encrypted backup with separate synthetic key | PASS; 5,000 rows and unsent operation restored |
| `cargo fmt --check` | PASS |
| `cargo test --locked` | PASS — 3/3 |
| `cargo clippy --locked --all-targets -- -D warnings` | PASS |
| Release acceptance | PASS — `R30_04_B1_ACCEPTED_TRUE` |

Negative key/tamper tests intentionally emit SQLCipher HMAC error lines. They are expected evidence of rejection, not leaked key or patient data.

## Measurements

Host: Windows x86-64, Intel64 Family 6 Model 158 Stepping 10, 12 logical CPUs, 12,752,048,128 bytes physical RAM. Cohort: 5,000 generated records with 512-byte padding; 200 warm exact lookups and 20 cold open/key/verify/exact lookups.

| Measurement | Result |
| --- | ---: |
| Warm exact lookup p50 / p95 | 10 / 18 microseconds |
| Cold open+key+verify+lookup p50 / p95 | 404,313 / 451,116 microseconds |
| Harness elapsed / process CPU | 15,160.71 / 12,140.63 ms |
| Normalized CPU across 12 logical CPUs | 6.67% |
| Peak / final working set | 30,138,368 / 14,704,640 bytes |
| Primary / backup / tampered file | 3,866,624 bytes each |

These are bounded synthetic spike measurements, not production SLOs and not a SQLCipher-versus-plaintext comparison.

## Artifacts and limitations

| Artifact | SHA-256 |
| --- | --- |
| Generated Release evidence JSON | `B604A0D88A86AC33B3F63D5647C4A5473A63D052D7847665D1A35AAA3A3A36A9` |
| Checked-in normalized evidence JSON | `407692AAB553C812F8D2A384C4FBE34ABD00723B5053CC6B9DECA18B1629207D` |
| Release spike executable | `2C58DE37E615C4B923B9F984831F27F144C3094592753DA3E678E5C2AF2D65D1` |
| Cargo.lock | `2E0F3D5F34EC9374E46EED8F7004237187FEE746735A0DB86F37F1750C5DF96F` |

SQLCipher protects page contents, including the tested WAL frames, but file names, sizes, timestamps and access patterns remain visible. Attachment/object envelopes remain unimplemented.

`PRAGMA cipher_memory_security=ON` produced `VirtualLock` failure `LastError=1453` followed by process stack overflow on this host. B1 therefore runs it OFF and records the exception; this is not an accepted production default. R30-04-B2 must review the exact key/KDF/Stronghold protocol, Windows locked-memory behavior, zeroization and recovery boundary under Astra High before custody implementation.

## Next checkpoint

The [B2 review checkpoint](architecture/KEY_CUSTODY_R30_04_B2_REVIEW.md) now records the key-mode correction and Windows memory hypothesis. Next: Sol High synthetic prerequisite probes, then bounded Astra High protocol finalization before custody implementation. B2 and R30-04-C remain open; C still depends on reviewed R30-05/R30-07 contracts.

## Repository and Graph Gate validation

- Frozen `pnpm install` passed without changing the lockfile.
- Desktop regression passed 9/9 tests.
- Sequential monorepo `test`, `typecheck` and `lint` passed 21/21 tasks (19 cache hits), including Clinical Engine 447/447, Worker 356/356 and Web 330/330 with one pre-existing skip.
- `git diff --check`, PowerShell parser validation and evidence JSON parsing passed.
- Staged Gitleaks scan covered about 60 KB and found no leaks; Semgrep ran 51 applicable rules over the Rust/PowerShell sources with zero findings.
- PRE baseline was clean at `origin/main@0b47d326da326a7997c8fcadd832032cefeed5de`.
- POST delta contained only the 13 isolated spike/roadmap/evidence files. The graph reported 25 inbound rows: two point to the new spike module/file and 23 cross-area CSS/Python rows are name-resolution artifacts; direct source and Git review confirm no application import, Tauri registration or runtime linkage.
- Full persistent POST graph: 8,903 nodes / 33,870 edges; 26 known parse-partial files outside the new spike, zero skipped. B1 source paths have no recorded parse gap; generated `target/` remains deliberately excluded. Coverage is best-effort, so direct source and deterministic tests remain authoritative.
