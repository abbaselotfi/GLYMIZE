# R30-04-B2 KC1 isolated synthetic harness — partial

This crate is **not linked to Tauri or the product**. It consumes only public deterministic vectors and synthetic local fixtures. It does not implement a clinical record, a production credential store or an accepted SQLCipher memory policy.

Implemented here: exact KC1 header/AEAD/KDF/card/root-ring primitives; checked Windows RNG, one-page locked arena and DPAPI binding; strict manifest codec; a read-only generation inventory/hash verifier; and a synthetic close-before-key-clear coordinator. The inventory verifier deliberately remains non-production: it lacks Windows no-follow/same-file identity under concurrent replacement, authentic DB marker and integrity checks, immutable publication/pointer semantics, and restore on a clean replacement account. Do not use it as an import/activation gate.

Run from a normal non-elevated Windows account with Rust/MSVC tools and the existing portable Perl build prerequisite:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run-windows.ps1
```

The script uses the pinned offline Cargo graph and an external target directory. No administrator privilege, patient data, secret or network service is required. The normal runtime has no dependency on this developer toolchain.

Dependency pin and notices: `Cargo.lock` contains 61 packages including this unpublished crate. The resolved license expressions from offline `cargo metadata` are 39 `MIT OR Apache-2.0`, 8 `Apache-2.0 OR MIT`, 5 `MIT/Apache-2.0`, 5 `MIT`, one `BSD-3-Clause`, one `(MIT OR Apache-2.0) AND Unicode-3.0`, one `Unlicense OR MIT`, and this crate's `UNLICENSED`. There were no missing license expressions in this local metadata check. Upstream package license/notice texts must accompany any future distribution; this inventory is not a product SBOM or license clearance. SQLCipher's pinned amalgamation and native OpenSSL build remain subject to the separate B1/B2 evidence and memory review.

The remaining B2 gates are tracked in the [KC1 protocol](../../../../docs/architecture/KEY_CUSTODY_R30_04_B2_PROTOCOL_V1.md) and [SQLCipher memory remediation proposal](../../../../docs/R30_04_B2_SQLCIPHER_MEMORY_REMEDIATION_PROPOSAL_2026-09-30.md). No B2 completion follows from this partial harness.
