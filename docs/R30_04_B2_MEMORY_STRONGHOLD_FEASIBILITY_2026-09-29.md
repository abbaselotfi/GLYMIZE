# R30-04-B2 prerequisite — Windows memory and Stronghold feasibility

Date: 2026-09-29. Model checkpoint: Sol High. Parent: [B2 review](architecture/KEY_CUSTODY_R30_04_B2_REVIEW.md). [Machine-readable evidence](evidence/R30_04_B2_MEMORY_STRONGHOLD_FEASIBILITY_2026-09-29.json).

## Verdict and boundary

The bounded Sol High prerequisite packet is complete, but **R30-04-B2 is not complete and no production memory or custody policy is accepted**. Both probes ran on Windows as a non-elevated user, used only fixed synthetic data, and remain isolated from Tauri, renderer IPC, authentication, PHI, migrations and runtime activation.

The results require the planned Astra High checkpoint before persistent custody implementation. Disabling logs hides evidence and is not a resolution. Running as Administrator, increasing working-set quota, suppressing warnings, accepting plaintext fallback or exposing a generic Stronghold/SQL interface to the renderer remain unauthorized.

## SQLCipher locked-memory probe

Each mode ran in a separate child process with a 20-second timeout and a fixed eight-by-two-MiB synthetic blob workload (16 MiB maximum per child).

| Mode | Result | Elapsed | Evidence |
| --- | --- | ---: | --- |
| `off-none` | PASS, exit 0 | 3,366.241 ms | Experimental comparison only; not an accepted default. |
| `on-none` | PASS, exit 0 | 2,106.691 ms | Logging was disabled, so this cannot prove `VirtualLock` success. |
| `on-stderr` | FAIL, exit `-1073741571` | 2,162.655 ms | Reproducible stack overflow. |
| `on-file` | Process PASS, exit 0 | 2,202.285 ms | 488/488 log lines report `VirtualLock() returned 0 LastError=1453`; 46,360 bytes; no unexpected lines. |

The file logger avoids the stderr recursion but does not fix memory locking. The production policy therefore remains unaccepted and the B1 harness continues to be experimental evidence only.

## Native Stronghold feasibility

The separate crate pins `iota_stronghold 2.1.0`, resolving `stronghold_engine` and `stronghold-runtime 2.0.1`, and reuses the pinned `rusqlite 0.40.1` SQLCipher stack. A private `UseSecret<1>` operation borrows the fixed 32-byte vault secret, constructs the 67-byte SQLCipher raw-key encoding on the native stack, applies it through `sqlite3_key`, zeroizes the encoding and returns only success/failure.

Snapshot commit, clear and reload passed. Wrong and short vault secrets were rejected. Clearing Stronghold prevented keying a new connection, but an already-keyed SQLCipher connection remained readable: SQLCipher necessarily retains its own native copy. A future lock transition must close statements and all database handles before clearing custody.

The 32-byte, 1-MiB and 16-MiB bounded allocation children completed within timeout and `Stronghold::clear` returned successfully. No allocation failure occurred inside this bound. This is not proof of every failure/release path or of an operating-system page lock: the locked `stronghold-runtime 2.0.1` source calls `sodium_mlock` without surfacing its return value.

## Dependency and security review

`cargo-audit 0.22.2` scanned the 1,273-advisory database. The 186-package Stronghold lock graph has zero vulnerability findings and two unsuppressed unmaintained warnings: `RUSTSEC-2025-0141` for `bincode 1.3.3` and `RUSTSEC-2024-0436` for `paste 1.0.15`. They are transitive through the candidate and must be part of the Astra High dependency-selection decision. The adjacent 26-package SQLCipher graph remains at zero vulnerability/warning findings.

The experimental notice records direct resolved licenses, but this is not the distributable-product license inventory. Strawberry Perl portable `5.34.3.1` is a developer-only OpenSSL build prerequisite stored outside the repository; end users do not receive or need this toolchain.

## Executed validation and artifacts

- Stronghold runner: Rust format PASS; 2/2 unit tests PASS; clippy with warnings denied PASS; Release feasibility PASS; three bounded allocation children PASS.
- SQLCipher/B1 regression runner: format PASS; 8/8 Rust tests PASS (6 B1 plus 2 memory-probe); clippy with warnings denied PASS; Release B1 acceptance PASS. Adding the second binary initially made the old unqualified `cargo run` ambiguous; the runner now pins the original B1 binary and the full rerun passes.
- SQLCipher memory runner: Release build PASS; all four isolated modes completed before timeout; expected `on-stderr` failure and file-log warnings captured without secrets.
- Both final harnesses were launched through temporary `RunLevel=Limited` tasks because the orchestration terminal was elevated; `nonElevated=true` is recorded in their evidence and both temporary tasks were removed.
- RustSec: zero vulnerabilities; two Stronghold transitive maintenance warnings retained above.
- Sequential monorepo test/typecheck/lint: 21/21 tasks PASS (19 cached), including freshly executed Desktop 9/9. Clinical Engine 447/447, Worker 356/356 and Web 330/330 with one existing skip remain green.
- Documentation: 112 relative links across 11 changed Markdown files PASS; JSON and PowerShell parsing, `git diff --check` and exact path staging PASS.
- Gitleaks scanned the staged 103.25 KB and reported one reviewed public prose false positive around the words `password rewrap`; no credential or patient data is present and no rule was disabled.
- Semgrep 1.178.0 initially hit its Windows gitignore lexer defect and scanned zero files, so that attempt is not counted. The explicit five-file rerun with the same `p/rust` and `p/security-audit` rules scanned all target lines and reported five reviewed informational findings: three required SQLCipher FFI `unsafe` sites and two bounded synthetic CLI `args_os` sites. No rule was suppressed.
- Final POST Roadmap/Graph Gate observation: PASS at 9,183 nodes / 34,368 edges, 28 known partial files and zero skipped. The two new partial files are PowerShell parser ranges already covered by direct full-source review; both Rust sources have no recorded parse gap. Coverage is best-effort and deterministic tests remain authoritative.

| Artifact | SHA-256 |
| --- | --- |
| Generated memory evidence | `FE44A4E870DCB1829B30D7EE57C379FF9EDF96836489FFDC5484603CEE21BFAF` |
| Generated Stronghold evidence | `D4919B80F57847F8DF78D213951AD5471FA9BEB06436ABCA39735075D8A08C90` |
| Generated allocation evidence | `5DE0965C56B1C99ACFA22A042C55324067414FE363A97BC422D565B355540FF9` |
| Stronghold `Cargo.lock` | `B680106C530E8B261DCC72795F801461BE19C13799018D4FD1D06296A65DC1D8` |

## Next checkpoint

Pause and switch to **Astra High**. That bounded review must decide whether this dependency graph remains acceptable and freeze the exact memory policy, KDF parameters/bounds, key hierarchy, canonical AAD/nonces, Stronghold snapshot protection, DPAPI factor, recovery/replacement-device, rotation/rewrap and handle-close ordering. If the candidate cannot meet the boundary, reopen the candidate decision; do not weaken it silently. Only after that checkpoint may Sol High implement the persistent synthetic custody/recovery harness.
