# R30-04-B1 SQLCipher spike

This crate is an isolated Windows-native, synthetic-data acceptance harness. It is not linked to the GLYMIZE Tauri shell and exposes no renderer IPC, authentication, patient model, D1 migration, or runtime activation path.

Review correction and proof (2026-09-28): the original helper supplied a 32-byte binary passphrase. It now encodes the required 67-byte raw-key form and passes independent PRAGMA/native interoperability and same-bytes passphrase rejection. See [corrective evidence](../../../../docs/R30_04_B2_RAW_KEY_PROOF_2026-09-28.md) and [remaining B2 gates](../../../../docs/architecture/KEY_CUSTODY_R30_04_B2_REVIEW.md). Historical v1 evidence is unchanged. This remains synthetic code, not production custody or a zeroization guarantee. Use a new evidence path for corrected v2 runs; do not overwrite the historical v1 artifact.

Run from the repository root on Windows with Rust, Visual Studio C++ x64 Build Tools, and a complete Perl distribution available:

```powershell
cargo test --locked --manifest-path apps/desktop/spikes/r30-04-b1-sqlcipher/Cargo.toml
cargo run --release --locked --manifest-path apps/desktop/spikes/r30-04-b1-sqlcipher/Cargo.toml -- --evidence .tmp/r30-04-b1/evidence.json
```

The vendored OpenSSL build is sensitive to long Windows paths. The reproducible runner below initializes the Visual Studio build environment only for its process, uses a short Cargo target directory, and can prepend a portable Strawberry Perl distribution without installing it system-wide:

```powershell
& apps/desktop/spikes/r30-04-b1-sqlcipher/run-windows.ps1 `
  -PerlHome .tmp/toolchains/strawberry-perl `
  -CargoTargetDir C:\glymize-r30-04-b1-target
```

The harness uses only generated identifiers and explicit synthetic canaries. It verifies the bundled cipher identity, raw-key operation, wrong/no-key rejection, tamper rejection, indexed lookup, WAL crash recovery, in-memory temp policy, absence of synthetic plaintext canaries in database side files, and an encrypted backup round-trip containing a pending synthetic outbox operation. It also records bounded warm/cold measurements for the declared synthetic cohort and Windows process/hardware metrics. These results do not authorize PHI storage or production use.

`cipher_memory_security=ON` produced a Windows `VirtualLock` failure (`LastError=1453`) and process stack overflow on the validation host. B1 therefore records it as disabled experimental configuration; the security and key-lifecycle decision remains an explicit R30-04-B2 review item rather than a runtime default.

The B2 memory probe runs each memory/logging combination in a separate non-elevated subprocess with a fixed synthetic workload and timeout. It intentionally does not turn a successful probe into a production policy decision:

```powershell
& apps/desktop/spikes/r30-04-b1-sqlcipher/run-memory-probes.ps1 `
  -PerlHome .tmp/toolchains/strawberry-perl `
  -CargoTargetDir C:\glymize-r30-04-b1-target
```

Do not pass a key on the command line. The internal crash child receives the generated synthetic key over an inherited stdin pipe.
