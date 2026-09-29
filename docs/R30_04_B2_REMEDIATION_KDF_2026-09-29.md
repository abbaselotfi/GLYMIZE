# R30-04-B2 — bounded dependency remediation and KDF calibration

Date: 2026-09-29
Status: Sol High evidence packet complete; **R30-04-B2 remains open**
Scope: synthetic probes and dependency review only; no Tauri linkage, persistent envelope, PHI, migration, provider activation or deployment

## 1. Outcome

This packet supplies the bounded evidence requested by the September 29 Astra High decision. It does not select a custody dependency or persistent format.

- The exact `stronghold-runtime` 2.0.1 source was copied to a temporary directory only, hash-checked, instrumented by a committed test-only patch, and exercised as a non-elevated user. One exact test injected allocation, `sodium_mlock` and memory-protection failures. All three failures were visible; the partially initialized `mlock` path was zeroed before free; each partial-allocation path performed one cleanup. The patch still communicates failure by panic, so it is evidence rather than an acceptable product API.
- Pinned RustCrypto `argon2` 0.5.3 and 0.6.0 produced the same synthetic Argon2id v0x13 output for the unchanged input parameters. Five release samples per version passed explicit caller-owned workspace and output clearing. Version 0.5.3 measured 222–237 ms (median 234 ms); 0.6.0 measured 219–280 ms (median 239 ms) on the declared host.
- The complete KDF process observation was 71,176,192 bytes peak working set, 2,546.875 ms CPU and 3,425 ms wall time. This covers both candidates sequentially and is not a per-candidate peak or a product SLO.
- RustSec database commit `f23b768236fe2880e4cfa167da662cad8ca79240` reported zero vulnerabilities and zero warnings in the 40-package KDF lockfile. The 186-package Stronghold feasibility lockfile reported zero vulnerabilities and retained two unsuppressed unmaintained warnings: `RUSTSEC-2025-0141` for runtime `bincode` 1.3.3 and `RUSTSEC-2024-0436` for compile-time `paste` 1.0.15.

Accepted machine-readable results are [KDF calibration](evidence/R30_04_B2_KDF_CALIBRATION_2026-09-29.json) and [Stronghold observability](evidence/R30_04_B2_STRONGHOLD_OBSERVABILITY_2026-09-29.json).

## 2. Reproducible probe boundary

The isolated crate is under `apps/desktop/spikes/r30-04-b2-remediation`. Its lockfile SHA-256 is `1D97A992BF5CC84171ED1A8DDE160D8929D8EBC4BD32D4B55FA9CDCAD940849E`; the zero-context Stronghold instrumentation patch SHA-256 is `25DD359AC34795A53933E24A76F0DAEB86CA84D20B7B662E68FEA05BCBB21175`. The runner passes `--unidiff-zero` explicitly, verifies the pinned source before patching, and rejects a missing source marker or a result other than the one named passing test.

The KDF runner requires a non-elevated Windows identity, then runs format, two unit tests, Clippy with warnings denied, a locked release build and the release calibration. Inputs are fixed synthetic bytes. The parameters are:

| Parameter | Value |
| --- | ---: |
| Algorithm/version | Argon2id / v0x13 |
| Memory | 65,536 KiB |
| Time cost | 3 |
| Lanes | 4 |
| Output | 32 bytes |
| Salt | 16 bytes |
| Samples | 5 per crate version |

Both crates were built without default features and with caller-provided `Block` memory. The 0.6 `parallel` feature was deliberately not enabled, so `p=4` is the Argon2 lane parameter and these measurements do not claim a four-thread speedup. The injected allocation error occurs at GLYMIZE's caller-owned reservation boundary before hashing; it is not a forced operating-system out-of-memory event. The 1,024-byte password maximum in the probe is a safety bound only and is not a selected envelope constraint.

The Stronghold runner verifies the cached source hashes before copying. The accepted evidence came only from the corrected runner requiring all of the following: an explicit patch directory, a source marker, the fully qualified test name with `--exact`, and output containing exactly one passing test. An earlier zero-test run was rejected and is not evidence.

## 3. Exact dependency paths and snapshot limits

The locked paths are:

```text
bincode 1.3.3 -> iota_stronghold 2.1.0 -> GLYMIZE feasibility crate
paste 1.0.15 -> stronghold_engine 2.0.1 -> iota_stronghold 2.1.0 -> GLYMIZE feasibility crate
```

`paste` is used by `stronghold_engine` store macros during compilation. It is a maintenance/supply-chain warning but not a runtime parser. `bincode` is different: `iota_stronghold` uses plain `bincode::deserialize` for decrypted snapshot state and client state, with no `Options::with_limit` call in the reviewed source.

The current snapshot order is authentication before deserialization: the file route validates magic/version, reads and decrypts the age/ChaCha20-Poly1305 content, decompresses it, and only then invokes bincode; encrypted client state is also decrypted before bincode. This prevents unauthenticated ciphertext from being directly deserialized. It does **not** provide a sufficient resource boundary:

- encrypted input is accumulated with `read_to_end` without an outer maximum;
- decompression occurs before a declared decompressed-size ceiling;
- bincode deserialization has no explicit byte limit;
- protected-memory visitors reserve from serialized `size_hint` and then continue collecting elements without a GLYMIZE object-count/product bound.

Therefore any Stronghold-based candidate must reject an oversized artifact before read/decrypt, apply authenticated envelope and decompressed-size limits, apply bounded deserialization, and preserve a versioned migration path. Authentication-before-deserialization alone is not acceptance.

## 4. Three-candidate handoff matrix

| Candidate | Pins/build and license | Failure visibility | Serialization/recovery | Maintenance and decision status |
| --- | --- | --- | --- | --- |
| Upstream Stronghold unchanged | `iota_stronghold=2.1.0`, `stronghold-runtime=2.0.1`, Apache-2.0; prior feasibility build passes | Allocation/protection failures panic, but the reviewed `sodium_mlock` return is ignored | Existing snapshot/reload works, but runtime bincode has no explicit limit and outer read/decompression are unbounded | Latest crates.io version found remains 2.1.0. Zero vulnerabilities, two unmaintained warnings. **Not promotable unchanged.** |
| Narrowly maintained Stronghold fork | Exact hash-bound source plus a reviewed patch; license remains Apache-2.0 subject to notices and fork compliance | The probe proves allocation/lock/protection failures can be made visible and partial cleanup can be tested; current demonstration still panics | Must add bounded artifact/decompression/deserialization, format versioning, old-snapshot vectors and recovery compatibility; warnings remain until dependencies are replaced or consciously owned | Technically viable, but creates a security-fork and release burden. Candidate only; no fork repository or production dependency is selected. |
| Single-purpose native custody adapter | Not implemented in this packet; would target only the 32-byte SQLCipher key behind the existing custody port | Must expose typed allocation/lock/protection/zeroization errors, treat page locking according to the Astra policy, and prove cleanup | Avoids Stronghold snapshot/bincode/paste surface, but needs a new versioned device/recovery envelope and exact migration vectors | Smallest intended surface but highest new-design responsibility. Preferred first subject for Astra comparison, **not selected**. |

No compatible maintained Stronghold release newer than 2.1.0 was available in the crates.io query on 2026-09-29. Repository activity alone is not treated as a supported release or maintenance commitment.

**Later selection:** [KC1/native protocol](architecture/KEY_CUSTODY_R30_04_B2_PROTOCOL_V1.md) consumes this matrix, selects Argon2 0.6.0 with unchanged parameters and the single-purpose native adapter for the next synthetic harness. It defines public primitive vectors and framing, not product custody acceptance. SQLCipher memory remains blocked. The handoff/checkpoint below is historical; current next packet is Sol High persistent/native testing.

## 5. KDF handoff

Both pinned versions are byte-compatible for the tested parameters and synthetic vector. The median difference on this host is 5 ms and is too small, too noisy and too host-specific to drive selection. Version 0.6.0 has the more current allocation-failure handling in its allocating API and passes the clean RustSec scan; because GLYMIZE's safer path is caller-owned memory with `try_reserve_exact`, both candidates expose the required pre-hash failure boundary in this probe.

The bounded recommendation for Astra High is to review `argon2=0.6.0` as the single final pin, while keeping all parameters unchanged. This is not final protocol selection. Astra must still specify:

- the exact password/recovery-material input bound and normalization/non-normalization rule;
- salt generation and storage, envelope version, domain separation and key split;
- device sealing, recovery, rotation/generation and lost-key semantics;
- exact positive/negative vectors and compatibility behavior;
- whether parallel execution is allowed on each supported hardware tier.

## 6. Gates and next checkpoint

Passed locally:

- remediation crate: format, 2/2 unit tests, Clippy with warnings denied, locked release build;
- non-elevated KDF evidence: accepted, ten total samples, clearing checks, matching fingerprint and injected pre-hash allocation failure;
- corrected non-elevated Stronghold test: exactly 1/1, three injected failures, zero-before-free and cleanup checks;
- RustSec 0.22.2: zero vulnerabilities in both lockfiles; zero KDF warnings; two retained Stronghold unmaintained warnings;
- dependency trees, license metadata and source paths inspected directly.
- sequential monorepo test/typecheck/lint: 21/21 tasks passed (19 cached; Desktop 9/9 executed fresh);
- focused Semgrep: 51 rules over the three new executable source/script files, zero findings;
- staged Gitleaks 8.30.1: approximately 55 KB scanned, zero leaks;
- official POST Roadmap + Graph Gate and persistent full refresh: PASS at 9,320 nodes / 34,633 edges, 29 known partial files and zero skipped. The exact packet delta has 52 seeds and zero impacted symbols outside the packet. The branch-wide gate's five one-hop rows are same-name/spike resolution artifacts rejected by direct source/isolation review. The only new partial is `run-stronghold-observability.ps1:69`, whose cargo invocation was read directly; this remains an isolated spike binary with no Tauri/runtime linkage.
- implementation/evidence commit `e202940f50390a8537c8760f3a889223bae525d2`: exact remote branch match; Cloudflare Pages event `2ace33f6-6086-4bc5-bd7a-2d5a0fa80053` is skipped with queued, initialize, clone, build and deploy stages all idle.

Not accepted or changed:

- no custody dependency, memory policy, persistent envelope or protocol vector;
- no production-grade Result-based Stronghold patch;
- no Tauri/SQLCipher runtime linkage, PHI, migration, RC/production deploy or provider activation;
- no B2 completion.

```text
MODEL CHECKPOINT
تسک: R30-04-B2 — انتخاب نهایی وابستگی custody و تعریف پروتکل/وکتورهای دقیق
مدل پیشنهادی: Astra High
دلیل: انتخاب امنیتی ماندگار میان fork و adapter بومی و تثبیت فرمت بازیابی/مهاجرت
مصرف نسبی توکن: زیاد
```

Stop at this checkpoint. After the owner switches to Astra High and sends `ادامه تسک`, perform the bounded selection and vector design. Do not start the persistent Sol High harness before that decision.
