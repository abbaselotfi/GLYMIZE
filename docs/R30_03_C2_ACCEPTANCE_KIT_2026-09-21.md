# R30-03-C2 — clean-machine acceptance kit

Date: 2026-09-21. Model: Sol High. Status: **accepted on a real disposable clean Windows 11 VM**. Parent evidence: [R30-03-C1](R30_03_C_NATIVE_ACCEPTANCE_2026-09-20.md), [Windows shell contract](architecture/WINDOWS_SHELL_R30_03_A.md) and [sanitized C2 evidence](evidence/R30_03_C2_CLEAN_VM_ACCEPTANCE_2026-09-21.json).

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
| `windows-clean-machine-acceptance.ps1` | 30,340 | `83DAC943C5F50F2A05587EB55647DC8814D177B1D35CD32BE753D0CC401BB436` |
| `kit-manifest.json` | 1,224 | `C2A9FB3827EBC91D908411500FC98239547DDA5823389F35C9F3F4A31CFF6A32` |

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

Corrected verification passes 9/9 desktop tests, including Windows PowerShell 5.1 parsing/audit, deterministic repeated staging, dirty-source rejection and the existing reference/native security checks. Real-VM execution exposed two fail-closed StrictMode portability defects before acceptance: optional Uninstall registry values were read as mandatory properties, and an empty browser-storage property collection used unsafe member enumeration. Both were corrected with explicit property collection handling and regression assertions; neither failed run reached Finalize or supplied acceptance evidence. The actual negative Preflight still exits `1` with `CLEAN_MACHINE_ACCEPTANCE_INCOMPLETE` on the disqualified development host. Full sequential monorepo tests pass (desktop 9, Worker 356, clinical engine 447, web 330 with one intentional skip, API 2); Turbo typecheck passes 9/9 tasks and lint passes 7/7. The refreshed post-task graph records 8,731 nodes / 33,288 edges, 26 known partial parses and zero skipped files; direct source covers the runner's single parser-recovery line.

## Clean Windows VM acceptance

The final v3 candidate ran under a standard non-elevated account on Microsoft Windows 11 Pro x64 build 22631. Its virtual NIC remained disconnected from Preflight through Finalize. No Git, Node, pnpm, Rust, Cargo, MSVC or MSBuild toolchain was detected; GLYMIZE was initially absent; one official OS-provided WebView2 registration was recorded as `preinstalled`.

All required phases passed for the same externally pinned manifest:

| Phase | Result | Material evidence |
| --- | --- | --- |
| Preflight | Passed | clean app state, zero developer toolchains, non-admin token, Windows 11 x64, DNS/TCP blackout |
| Install | Passed | silent exit `0`, current-user registration, preinstalled WebView2 retained, runtime policy passed in 4,935 ms |
| PostReboot | Passed | boot time changed, application survived, blackout retained, runtime policy passed in 2,337 ms |
| UninstallReinstall | Passed | removal observed before silent reinstall, application restored, blackout retained, runtime policy passed in 1,988 ms |
| Finalize | **Accepted** | all four prerequisite reports present, passed and bound to the same manifest; blackout still active |

Each of the three runtime probes returned the exact 30-result local search, found zero external page resources and zero non-loopback established process connections, retained zero Service Workers, rejected the external fetch through `connect-src`, exposed no global Tauri API and denied new-window/non-reference navigation. The committed sanitized JSON preserves phase/gate/metric results and SHA-256 anchors for the five raw reports while omitting computer/user names, paths, registry data, process IDs and addresses. Raw reports remain local evidence and contain no patient data.

## Disposable VM procedure

On the build host:

```powershell
pnpm --filter @glymize/desktop package:clean-machine-kit
```

Copy `.tmp/r30-03-c2-clean-machine-kit` into a fresh Windows 11 x64 VM using an offline attachment. A standard Windows 11 image may already contain WebView2; do not uninstall it merely to manufacture an absent-runtime result. Disconnect the virtual NIC before `Preflight`; do not rely only on the page proxy. From a non-elevated Windows PowerShell 5.1 prompt, pin the manifest and run:

```powershell
$kit = 'D:\r30-03-c2-clean-machine-kit'
$evidence = 'D:\r30-03-c2-evidence'
$sha = 'C2A9FB3827EBC91D908411500FC98239547DDA5823389F35C9F3F4A31CFF6A32'
powershell -NoProfile -ExecutionPolicy Bypass -File "$kit\windows-clean-machine-acceptance.ps1" -Phase Preflight -KitRoot $kit -EvidenceRoot $evidence -ExpectedKitManifestSha256 $sha
powershell -NoProfile -ExecutionPolicy Bypass -File "$kit\windows-clean-machine-acceptance.ps1" -Phase Install -KitRoot $kit -EvidenceRoot $evidence -ExpectedKitManifestSha256 $sha
# Reboot the VM while its virtual NIC remains disconnected.
powershell -NoProfile -ExecutionPolicy Bypass -File "$kit\windows-clean-machine-acceptance.ps1" -Phase PostReboot -KitRoot $kit -EvidenceRoot $evidence -ExpectedKitManifestSha256 $sha
powershell -NoProfile -ExecutionPolicy Bypass -File "$kit\windows-clean-machine-acceptance.ps1" -Phase UninstallReinstall -KitRoot $kit -EvidenceRoot $evidence -ExpectedKitManifestSha256 $sha
powershell -NoProfile -ExecutionPolicy Bypass -File "$kit\windows-clean-machine-acceptance.ps1" -Phase Finalize -KitRoot $kit -EvidenceRoot $evidence -ExpectedKitManifestSha256 $sha
```

C2 is complete because the five phase reports were reviewed and `Finalize` returned `accepted=true` for the externally pinned v3 manifest. This accepts only the reference-shell clean-Windows/full-blackout boundary; it does not accept the untested runtime-absent compatibility path, signed distribution, protected PHI/auth, Local Only workspace, clinical parity, sync or recovery. No migration, feature activation, clinical behavior or production change occurred. R29-01 through R29-05 remain open wherever their own RC/cache/replication/query/rollout evidence is pending. The next packet is R30-04-A and requires an owner-visible switch to Astra High before work begins.
