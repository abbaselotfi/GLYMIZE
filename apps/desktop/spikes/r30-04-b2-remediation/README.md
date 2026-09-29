# R30-04-B2 bounded remediation and KDF calibration

This crate is an isolated synthetic probe. It does not link to the Tauri application, open a patient database, define a persistent key envelope, activate a custody provider, or change production behavior.

It compares pinned `argon2` 0.5.3 and 0.6.0 with the unchanged decision input (`Argon2id`, v0x13, 65,536 KiB, t=3, p=4, 32-byte output, 16-byte salt). Memory is caller-owned so reservation failure can be handled before hashing and the workspace can be explicitly cleared and verified. The 1,024-byte password ceiling is deliberately labelled probe-only; Astra High must select the real protocol bound.

`run-windows.ps1` requires a non-elevated Windows shell and records process CPU/peak working-set observations around the release executable. All input is fixed synthetic material.

The companion Stronghold script copies the exact cached `stronghold-runtime` 2.0.1 source to a temporary directory, verifies the reviewed source hash, applies the committed test-only patch, and runs one exact injected-failure test. It never modifies Cargo's registry cache or the product runtime. The test makes allocation, `mlock` and protection failures visible, verifies zero-before-free on the partially initialized `mlock` path, and verifies one cleanup on each partial-allocation path. The patch still uses panic and is not a production dependency selection.
