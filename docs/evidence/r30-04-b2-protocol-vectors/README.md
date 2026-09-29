# KC1 public design vectors — not a custody implementation

Scope: [R30-04-B2 protocol contract](../../architecture/KEY_CUSTODY_R30_04_B2_PROTOCOL_V1.md). Every password/key/nonce in this directory is a **public deterministic test value**, not a credential. Never use these values or this generator for real storage. No patient data, RNG, native memory allocator, DPAPI, persistent vault, SQLCipher integration or app dependency is implemented here.

`Cargo.toml` and `Cargo.lock` pin the vector-only RustCrypto computation. `src/main.rs` emits the normal-wrapper vector and checks its round-trip plus all 130 single-byte header mutations. `vector.json` is the expected output, not regenerated during validation. The generator intentionally prints public values; product code must not copy that logging pattern. Fixed sequences are deliberately byte-oriented and not production UUID generation.

Run from the repository with a short external build-output path:

```powershell
$env:CARGO_TARGET_DIR = 'C:\glymize-r30-04-b2-remediation-target'
cargo fmt --manifest-path docs/evidence/r30-04-b2-protocol-vectors/Cargo.toml -- --check
cargo clippy --locked --all-targets --manifest-path docs/evidence/r30-04-b2-protocol-vectors/Cargo.toml -- -D warnings
python docs/evidence/r30-04-b2-protocol-vectors/verify.py
```

The Python verifier uses already-installed `cryptography 48.0.0` (OpenSSL-backed) independently for Argon2id and HKDF, independently serializes the complete 130-byte header with `struct`, and checks SHA256/card checksum. It requires the Rust output to match every stored field. It does not implement XChaCha itself or install dependencies. A second-library XChaCha interoperability test, full parser/recovery vectors, Windows arena/DPAPI and persistent crash tests belong to the next Sol High harness. **Round-trip and AAD mutation checks alone are not independent AEAD interoperability evidence.**

Password UTF-8: `Glymize-آفلاین-Vector-1`; salt bytes 0x30–0x3f, device bytes 0x40–0x5f, snapshot bytes 0x60–0x7f. Exact derived output, AAD, ciphertext and tag are in `vector.json`. Expected envelope SHA256: `d7bac9d704fe526f718eaf5e57ee9532ba07eb0de604f356ea3e054616e9ec81`. Recovery-card checksum is public `46d89732`; it is not an authentication code.

Primitive pins are a tested candidate for the synthetic harness, not a full platform dependency lock. No new package is added to the monorepo or Tauri manifests. Dependency/license/audit and final validation results are recorded in the active handoff; no native recovery or B2 completion follows from these vectors.

Secret-scan triage: Gitleaks 8.30.1 flags `passwordUtf8Hex` and `wrappingKeyHex` as generic-api-key patterns. These are intentionally public expected bytes reproduced exactly by the generator and verifier, not external credentials. Both findings remain visible; no rule, scanner, line or path allowlist was added. The scan is not reported as zero findings. Never reuse this public password or derived key outside test vectors.
