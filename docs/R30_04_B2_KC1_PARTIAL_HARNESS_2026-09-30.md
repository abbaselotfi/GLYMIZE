# R30-04-B2 — KC1 partial native harness evidence

Date: 2026-09-30. Status: **partial Sol High implementation; B2 remains open**. Source: isolated [`r30-04-b2-kc1`](../apps/desktop/spikes/r30-04-b2-kc1/README.md) crate on `feat/r30-04-b1-sqlcipher`. No Tauri import, renderer command, protected PHI, migration, Cloudflare deployment or product memory-policy change.

## What is exercised

- Exact 130-byte KC1 header, field/length/scope validation, Argon2id profile 1 with caller-owned 64-MiB block workspace and zeroizing guard, HKDF purpose separation, detached XChaCha20Poly1305, UTF-8 rejection/distinction, card checksum and ordered root ring. The published deterministic vector matches its wrapping key, AAD, ciphertext and tag. A tampered tag/ciphertext and changed routing fields fail.
- Native Windows RNG, checked single-page `VirtualAlloc`/`VirtualLock`/`VirtualProtect` and zero-before-unlock/free, CurrentUser DPAPI context binding, and injected allocation/lock/protection/cleanup failure paths. The executing Windows account was verified **non-elevated**. This does not claim that SQLCipher memory or every library temporary is page-locked.
- Strict manifest codec and bounded read-only directory inventory/hash checks. A synthetic fixture rejects component splice and unexpected files. The fixture's `database.db` is a placeholder, **not** a SQLCipher database; no DB marker or integrity acceptance is claimed.
- A synthetic coordinator refuses a transition to `Locked` while an actual SQLite statement causes connection close to fail; the arena remains owned in `LockFailed`, and retry after statement finalization succeeds. This is not yet the app's connection pool or a crash-safe generation publisher.

## Validation and open findings

| Gate | Result |
| --- | --- |
| Rust format, 7 native unit tests, Clippy with warnings denied | PASS with the local prebuilt B1 OpenSSL `300.6.1+3.6.3` static artifact matching the KC1 lock version. The linker reports missing release PDB `LNK4099` for this accelerated debug link; runtime tests pass. The standalone vendored default runner remains to be checked separately. |
| Locked RustSec scan | 61 packages scanned against 1,277 cached advisories; no vulnerabilities/warnings emitted. |
| Semgrep `p/rust` + `p/security-audit` | Four source files scanned, 16 unsuppressed findings: 15 expected native/SQLite `unsafe` call sites and one randomized synthetic test temp-directory use. These require ongoing direct review; a zero-finding result is **not** claimed. |
| Staged Gitleaks 8.30.1 | 71.17 KB scanned; zero leaks reported. No real credential or patient data entered the fixture. |
| Sequential monorepo test/typecheck/lint | 21/21 tasks pass, 19 cached; Desktop 9/9 fresh and Web 330/330 with one existing skip. |
| Roadmap + Graph Gate | Official POST PASS; the latest full refresh reports 9,522 nodes / 35,730 edges versus pre-change 9,378 / 34,745. An immediately preceding refresh reported 35,742 edges, so the edge total is a run-specific graph observation, not a stable product metric. There are 30 known partial files and zero skipped. New `run-windows.ps1` partial ranges 23, 41, 56–57 and 60–61 were read directly; four Rust sources have no recorded parse gap, but coverage metadata reports a post-index change and is not treated as proof of completeness. No runtime import was found in the checked Tauri entry targets. |

## Still blocking B2

The read-only verifier must gain safe Windows no-follow/same-file handles, complete header/root-epoch/DPAPI cross-checks, SQLCipher DB marker/integrity checks and size/race failure tests. Immutable generation staging, fsync/flush/pointer publication, restart, rewrap, rotation, replacement-account/device recovery, independent XChaCha interoperability and forced repeated-RNG rejection are not proved here. The [bounded SQLCipher memory proposal](R30_04_B2_SQLCIPHER_MEMORY_REMEDIATION_PROPOSAL_2026-09-30.md) is **not** remediation evidence or an accepted policy. B2 stays open; Astra review cannot waive missing executable evidence, and R30-04-C remains blocked by B2 and R30-05/07 contracts.
