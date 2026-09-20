# R30-03-C1 — Windows native build and installed-runtime evidence

Date: 2026-09-20. Model: Sol High. Status: native build, current-user install and WebView2-present runtime acceptance pass locally; clean-machine/runtime-absent, reboot and full network-blackout acceptance remain open. Parent evidence: [R30-03-B](R30_03_B_DESKTOP_REFERENCE_2026-09-20.md) and [R30-03-A](architecture/WINDOWS_SHELL_R30_03_A.md).

## Delivered native boundary

The Windows toolchain is now real rather than inferred: Rust uses the `x86_64-pc-windows-msvc` host, Cargo resolves a committed lockfile, MSVC and the Windows SDK compile the shell, and Tauri produces a current-user NSIS package with the offline WebView2 installer embedded. The package installs under `%LOCALAPPDATA%\GLYMIZE Reference` without elevation and starts the embedded `https://tauri.localhost/offline/index.html` reference surface. End-user startup does not call GitHub, Cloudflare, a local Node server or an application API.

The native allowlist is now a separately tested function. It accepts only the two exact HTTPS local reference paths, with no alternate port, credentials, query or fragment. External origins, HTTP, other local paths and encoded traversal are rejected. The WebView window also applies best-effort background-network suppression flags; those flags reduce browser work but are not treated as a security boundary. CSP, native navigation callbacks, denied new windows/downloads and empty capabilities remain the boundaries.

Windows packaging required the standard Tauri `icons/icon.ico`; it is generated from the existing GLYMIZE icon. Generated target/schema/mobile-icon output is ignored, while `Cargo.lock` and the Windows ICO are committed. No plugin, IPC command, SQLite, Stronghold, PHI, auth or clinical authority was added.

## Environment and package evidence

| Item | Observed value |
| --- | --- |
| OS | Windows 11 Pro, kernel `10.0.26200.0`, x64 |
| Rust | `rustc 1.98.1 (48a229cea 2026-09-01)`, stable MSVC host |
| Cargo | `1.98.1 (797e8a9bc 2026-08-05)` |
| Native tools | Visual Studio Build Tools 2022 `17.14.37710.0`; MSVC `14.44.35207`; Windows SDK `10.0.26100.0` |
| WebView2 present case | `153.0.4234.48` |
| Locked Rust graph | 430 lock entries (the build resolved 429 dependencies); `Cargo.lock` 109,844 bytes, SHA-256 `6F5B6663744EA437C87AC11418EB60C975C59F42A7A5F1DB76037F0A07407384` |
| Offline WebView2 input | 213,053,648 bytes; SHA-256 `AD9B350625E132481BC0953EEE9E032810134DF9FEDBD7BE364C3F4E0E4DBD64`; valid Microsoft Corporation Authenticode signature |
| Clean source/artifact | Commit `ea02642b8ac212edd5e266ff421ae72ca1e75dc3`; manifest `18015f82d63957dbceebb3f0`; 14 assets / 3,436,548 bytes; `sourceDirty=false` |
| Clean NSIS candidate | 219,074,637 bytes; SHA-256 `13C48BAF7FF641C551E998CA39B07D2DB44969A948784843376034D520CD9BEB`; unsigned/internal test only |
| Installed executable | 9,775,616 bytes; SHA-256 `EF98364B09A5111AB8DDC02FC2DDF533F8F4CA9F6FBAEA069FD245B95CEE3F8C` |
| Install result | Initial install and final clean-candidate reinstall exit `0`; one HKCU uninstall entry; version `0.1.0`; no pre-existing installation before the initial run |

The first native compile correctly failed because the required Windows ICO was absent. After generating the resource, the Rust release binary compiled. The first NSIS attempt then exposed an intermittent TLS EOF at the Microsoft WebView2 CDN. Windows BITS downloaded the exact official redirect target into Tauri's standard cache; its Microsoft signature and SHA-256 were checked before packaging. The later Tauri HEAD request and NSIS build succeeded. This cache intervention is build-host evidence, not an end-user runtime dependency.

The package is intentionally unsigned because trusted code signing belongs to R30-08. It must not be presented as a production release or accompanied by advice to bypass SmartScreen.

## Installed runtime verification

| Gate | Result |
| --- | --- |
| Rust navigation policy | 3/3 pass: exact allowed routes plus scheme/origin/port/path/query/fragment/credential negatives. |
| Desktop build/security tests | 5/5 pass, including empty capability/no IPC-plugin assertions and exact background-network arguments. |
| Installed startup | Responsive native window titled `GLYMIZE · Local Reference`; observed app working set about 28 MB and 1.19 CPU-seconds after 15 seconds. |
| Installed UI through local CDP test hook | Final clean candidate: CDP ready in 2,701 ms; search UI ready in 4,101 ms; `metformin` returns 30 cards. The hook is test-process-only and is not configured in the product. |
| Page network isolation | Final reload/search produced 17 local page requests and zero external page requests while page traffic used a `127.0.0.1:9` black-hole proxy. The clean staged-browser control used 12 local/zero external requests. No cloud fallback occurred. |
| Renderer state | Only the optional P1 UI-language key existed (`fa`); query text was not stored. Session storage and Service Worker registrations were empty. |
| Effective native policy | External `fetch` rejected with a `connect-src` CSP violation; `window.__TAURI__` absent; `window.open` denied; runtime navigation to local `/admin/` cancelled and remained on the reference page. |
| Process cleanup | App and all seven observed descendants exited after the bounded test. |

Repository gates pass sequentially: desktop 5/5, Rust 3/3, Worker 356, clinical engine 447, web 330 with one intentional skip, and API 2. Turbo typecheck passes 9/9 tasks and lint passes 7/7. The final refreshed graph records 8,559 nodes / 32,844 edges, 25 known partial parses and zero skipped files. New native-test and navigation symbols resolve; direct source remains authoritative where graph heuristic edges are spurious or generated/binary files are excluded.

## Publication evidence

Implementation commit `ea02642b8ac212edd5e266ff421ae72ca1e75dc3` and clean-candidate evidence commit `db505e9fc17a2736eadb0c186c7bf74b06c200a0` were pushed to `fix/r28-07-handoff-confirmation-lifecycle-20260910`. GitHub PR #143 remains open against `main` with auto-merge disabled. Validation run [`35524913635`](https://github.com/abbaselotfi/GLYMIZE/actions/runs/35524913635) passed in 4m24s, including the Roadmap/Graph declarations, monorepo typecheck, lint, tests and four critical web flows.

Cloudflare Pages recorded preview event `a0e289d6-2f79-4e90-af32-03cead0d71e8` for exact commit `db505e9fc17a2736eadb0c186c7bf74b06c200a0` with `is_skipped=true`. Queued, initialize, clone, build and deploy stages all remained `idle`; the branch-specific Preview exclusion remained exact. This is publication evidence only: no Pages build/deploy, main merge, Worker deployment, migration or production change occurred.

## Network limitation and remaining acceptance

Page-level operation is independent of GitHub, Cloudflare and external fetches. However, the Evergreen WebView2 browser process itself opened two background TLS connections through the machine's `singbox_tun` adapter, even with `--disable-background-networking`, component-update suppression and a page proxy. These were not renderer requests and did not affect the local UI. Microsoft tracks the lack of a supported switch to eliminate all WebView2 outgoing traffic in [WebView2Feedback #5224](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5224), and WebView2 networking occurs in the separate runtime process as described in [WebView2Feedback #369](https://github.com/MicrosoftEdge/WebView2Feedback/issues/369). Therefore this packet does **not** claim zero process egress or full Internet blackout.

The current account is non-administrative, Windows Sandbox is not installed, and removing the machine's shared WebView2 runtime would be unsafe. The following gates remain R30-03-C2 and must run in a disposable clean Windows environment:

- install with WebView2 absent and all external networking disabled, using only the embedded prerequisite;
- install/start without Git, Node, Rust or Visual Studio present;
- cold restart after reboot plus uninstall/reinstall evidence;
- firewall/DNS/GitHub/Cloudflare blackout with process-level connection evidence;
- repeat effective native-policy checks against the exact clean candidate.

Signed distribution/update recovery remains R30-08, and full protected-workflow blackout remains R30-09. R30-03 is therefore partially accepted, not complete. No deployment, main merge, migration, feature activation or cloud setting changed. R29-01 through R29-05 remain open wherever RC CPU/latency/rows, classified cache activation, D1 replication/bookmarks, query/index benefit, Turnstile/Placement or final rollback evidence is still pending.
