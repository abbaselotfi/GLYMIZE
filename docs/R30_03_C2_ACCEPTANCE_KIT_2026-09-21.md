# R30-03-C2 — clean-machine acceptance kit

Date: 2026-09-21. Model: Sol High. Status: acceptance automation and current-host qualification complete; disposable clean-Windows execution remains open. Parent evidence: [R30-03-C1](R30_03_C_NATIVE_ACCEPTANCE_2026-09-20.md) and [Windows shell contract](architecture/WINDOWS_SHELL_R30_03_A.md).

## Delivered boundary

`apps/desktop/scripts/package-clean-machine-kit.mjs` stages a portable kit from the exact clean C1 desktop manifest and NSIS candidate. It refuses a dirty/reference-mismatched source manifest, unsafe output scopes and partial copies, then binds the installer and standalone Windows PowerShell 5.1 runner by size and SHA-256. The generated kit lives under ignored `.tmp/`; its 219 MB unsigned installer is not added to Git.

`apps/desktop/scripts/windows-clean-machine-acceptance.ps1` needs no Git, Node, pnpm, Rust, Cargo, MSVC or MSBuild on the target. Its full phases are ordered and fail closed:

1. `Preflight`: Windows 11 x64, non-elevated token, the initial official WebView2 `pv` state recorded, toolchains/app absent, exact kit hashes and DNS/TCP blackout.
2. `Install`: same blackout, silent current-user NSIS install, an official WebView2 registration available after installation and installed-runtime probe. Evidence distinguishes a preinstalled runtime from one provisioned by the offline installer.
3. `PostReboot`: changed OS boot time, retained install, continued blackout and repeated runtime probe.
4. `UninstallReinstall`: silent removal is observed before offline reinstall; runtime and blackout checks repeat.
5. `Finalize`: all four phase reports must pass for the same manifest. Only this phase can emit `accepted=true`.

Every non-audit phase requires the operator to pass an independently published `-ExpectedKitManifestSha256`; editing the manifest and payload together cannot silently replace that external anchor. Runtime CDP tests the exact local URL, 30-result search, zero external page resources, volatile query, bounded language-only local storage, empty session/SW state, effective `connect-src` rejection, absent global Tauri API, denied new window, denied `/admin/` navigation and zero non-loopback established connections across the native process tree.

WebView2 detection uses Microsoft's documented `pv` registration and client ID `{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`. Microsoft documents both that the Evergreen Runtime is included in Windows 11 and that the Standalone Installer supports offline installation: [WebView2 distribution](https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution). Therefore absence is not a valid clean-Windows-11 precondition. If a supported target actually begins without a registration, the same phase evidence proves the `installer-provisioned` path; that compatibility case is reported separately and is not fabricated by removing a shared runtime from a normal Windows 11 image.

## Exact kit candidate

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `GLYMIZE Reference_0.1.0_x64-setup.exe` | 219,074,637 | `13C48BAF7FF641C551E998CA39B07D2DB44969A948784843376034D520CD9BEB` |
| `windows-clean-machine-acceptance.ps1` | 30,021 | `3558962B87085BD51F5ED1E2C6B6A58C9FA6BF6A5B08F3E55385F4D379365038` |
| `kit-manifest.json` | 1,224 | `34F9ECD2643DDDC2ADDBE382E6F93B7BEFBC60B04F6D599FB86ABE84E4D8C220` |

The kit points to clean source revision `ea02642b8ac212edd5e266ff421ae72ca1e75dc3` and desktop reference manifest `18015f82d63957dbceebb3f0`. Hashes identify this internal candidate; they are not publisher signatures. Trusted signing remains R30-08.

## Current-host audit

The sanitized [machine-readable audit](evidence/R30_03_C2_HOST_AUDIT_2026-09-21.json) correctly disqualifies this workstation:

- Windows 11 Pro x64 build 26200 and a non-elevated token pass.
- WebView2 `153.0.4234.48` is already registered and is now recorded as the normal Windows 11 preinstalled path rather than a disqualifier.
- Git, Node/npm/pnpm, Rust/Cargo and Visual Studio discovery tooling are present.
- GitHub and Cloudflare DNS/TCP probes succeed rather than being blocked.
- the C1 test application is already installed.
- Windows Sandbox, Hyper-V management and VirtualBox/VMware/QEMU tooling are unavailable to this account.

The independent PowerShell `AuditRuntime` does not accept C2. It reached CDP in 3,106 ms, returned 30 metformin results, found no external page resources, and passed CSP/storage/navigation/no-global-Tauri checks. It also observed two established runtime-owned TLS connections to `52.98.253.50:443`, so the process-egress gate failed exactly as intended. Raw evidence remains ignored under `.tmp` and contains no patient data; committed evidence omits workstation/user identifiers and process IDs.

Corrected verification passes 9/9 desktop tests, including Windows PowerShell 5.1 parsing/audit, deterministic repeated staging, dirty-source rejection and the existing reference/native security checks. The actual negative Preflight exits `1` with `CLEAN_MACHINE_ACCEPTANCE_INCOMPLETE` on this disqualified host and now reports only the developer-toolchain, network-blackout and prior-application failures; preinstalled WebView2 is recorded rather than rejected. Full sequential monorepo tests pass (desktop 9, Worker 356, clinical engine 447, web 330 with one intentional skip, API 2); Turbo typecheck passes 9/9 tasks and lint passes 7/7. The refreshed post-task graph records 8,679 nodes / 33,180 edges, 26 known partial parses and zero skipped files. The kit/runtime symbols resolve; direct source was inspected for the runner's single parser-recovery line.

## Disposable VM procedure

On the build host:

```powershell
pnpm --filter @glymize/desktop package:clean-machine-kit
```

Copy `.tmp/r30-03-c2-clean-machine-kit` into a fresh Windows 11 x64 VM using an offline attachment. A standard Windows 11 image may already contain WebView2; do not uninstall it merely to manufacture an absent-runtime result. Disconnect the virtual NIC before `Preflight`; do not rely only on the page proxy. From a non-elevated Windows PowerShell 5.1 prompt, pin the manifest and run:

```powershell
$kit = 'D:\r30-03-c2-clean-machine-kit'
$evidence = 'D:\r30-03-c2-evidence'
$sha = '34F9ECD2643DDDC2ADDBE382E6F93B7BEFBC60B04F6D599FB86ABE84E4D8C220'
powershell -NoProfile -ExecutionPolicy Bypass -File "$kit\windows-clean-machine-acceptance.ps1" -Phase Preflight -KitRoot $kit -EvidenceRoot $evidence -ExpectedKitManifestSha256 $sha
powershell -NoProfile -ExecutionPolicy Bypass -File "$kit\windows-clean-machine-acceptance.ps1" -Phase Install -KitRoot $kit -EvidenceRoot $evidence -ExpectedKitManifestSha256 $sha
# Reboot the VM while its virtual NIC remains disconnected.
powershell -NoProfile -ExecutionPolicy Bypass -File "$kit\windows-clean-machine-acceptance.ps1" -Phase PostReboot -KitRoot $kit -EvidenceRoot $evidence -ExpectedKitManifestSha256 $sha
powershell -NoProfile -ExecutionPolicy Bypass -File "$kit\windows-clean-machine-acceptance.ps1" -Phase UninstallReinstall -KitRoot $kit -EvidenceRoot $evidence -ExpectedKitManifestSha256 $sha
powershell -NoProfile -ExecutionPolicy Bypass -File "$kit\windows-clean-machine-acceptance.ps1" -Phase Finalize -KitRoot $kit -EvidenceRoot $evidence -ExpectedKitManifestSha256 $sha
```

C2 remains open until those five phase reports are reviewed and `Finalize` returns `accepted=true`. No VM result, reboot, runtime-absent compatibility result or full blackout is fabricated here. No main merge, deployment, migration, feature activation, PHI capability or production change occurred. R29-01 through R29-05 remain open wherever their own RC/cache/replication/query/rollout evidence is pending.
