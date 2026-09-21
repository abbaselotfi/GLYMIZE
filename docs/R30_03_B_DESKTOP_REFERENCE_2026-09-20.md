# R30-03-B — deterministic desktop reference profile

Date: 2026-09-20. Model: Sol High. Status: local implementation and browser/artifact gates complete; native Windows compile/install acceptance remains R30-03-C. Parent contract: [R30-03-A](architecture/WINDOWS_SHELL_R30_03_A.md).

## Delivered boundary

`apps/desktop` now owns a reference-only Tauri 2 candidate. Its build entry creates a dedicated Next static export, regenerates the reviewed P0 projection, copies only reachable reference assets into an isolated stage and emits a content-addressed manifest. The installed renderer is `/offline/`; it has no patient/admin shell, clinician session initialization, runtime API, Service Worker install path, clickable external source link or persistent search state.

The native scaffold pins Tauri CLI 2.11.5, `tauri` 2.11.5 and `tauri-build` 2.6.3. It declares one non-automatically-created window, an explicit empty capability, no global Tauri object, plugins or invoke handler, disabled asset protocol/devtools/drag-drop/zoom/browser extensions, local-only navigation, denied new windows/downloads and a restrictive release CSP. NSIS uses current-user install plus the offline WebView2 installer candidate. This is configuration evidence, not a compiled installer.

The normal web build remains the default. `GLYMIZE_DESKTOP_REFERENCE_PROFILE=true` is build-only and independent of the opt-in PWA bundle. Desktop output uses a separate `.next-desktop-reference` directory and rejects inherited Pages/RC/API/bypass settings and conflicting dotenv values. A repository-contained exclusive lock prevents overlapping desktop exports.

## Artifact invariants

- Only `offline/index.html`, its reachable `_next/static` files, two local icons, the P0 JSON and `desktop-reference-manifest.json` may be staged. Admin/market/raw clinical documents, `_worker.js`, source maps and other route HTML are excluded.
- Paths must be relative, allowlisted and case-unique. Symlinks, traversal, missing/extra files, modified hashes, empty/oversized assets and source provenance mismatch fail validation.
- The stage strips remote font imports and web manifest metadata deterministically. No runtime/admin API strings or Service Worker registration are accepted on the browser surface.
- The desktop manifest binds source revision/dirty state, source date/hash, exact file sizes/hashes and a 24-character version. Hashes detect corruption; they are not a publisher signature.
- The desktop loader verifies the strict manifest, then requires exact source date/hash equality before returning rows. Failure shows unavailable and never falls back to cloud data.

Local dirty-worktree evidence produced version `0e8457b452d5baf23aab86c1`: 14 assets, 3,436,548 bytes, P0 source hash `34cc20f2196978555deed3cc8e9653ed6a6d9ed43dc9969392fac06ef913e77e`. A clean committed C build will intentionally have different manifest metadata/version.

## Verification

| Gate | Result |
| --- | --- |
| Desktop unit/security tests | 5/5 pass: deterministic set, unsafe/case paths, extra/missing/modified files, symlink rejection and no IPC/plugin/native escape surface. |
| Artifact validator | Pass for the 14-file staged artifact; manifest, byte/hash and P0 provenance checks pass. |
| Staged-browser test | Pass on Chromium 151: 12 local requests, zero external requests, 30 metformin results, zero Service Worker registrations, zero local/session storage keys and no external target links. |
| Focused web reference tests | 2 files / 15 tests pass. |
| Static web regressions | Root and `/GLYMIZE` exports pass legacy-ID, unrelated 404, install/offline navigation, cold restart, host blackout and private-request denial. The Playwright 1.62 Chromium channel is explicit because its new headless shell did not expose CacheStorage for the synthetic secure origin. |
| Full suites | Engine 72 files / 447 tests; Worker 52 / 356; desktop 5; full web with one worker 62 / 330 pass, one skip. The default parallel web run exceeded the existing 15s published-market correctness timeout (18.1s); the unchanged test passed alone in 10.6s and in the serialized full run. No timeout/assertion was changed. |
| Typecheck/lint | Turbo typecheck 9/9 tasks and lint 7/7 tasks pass. |
| Tauri environment probe | Config loads and reports the intended CSP/frontendDist; WebView2 153 is present. Rust/Cargo and MSVC/Windows SDK are absent, so no native compile result is claimed. |

The root/prefixed browser update is test infrastructure only. It selects the full bundled Chromium channel rather than the headless-shell binary; product code and PWA activation defaults are unchanged.

## Remaining C gates

R30-03-C must provision a pinned Rust/MSVC/Windows SDK environment, generate and commit `Cargo.lock`, compile the Rust navigation policy, build the NSIS package and capture clean-user install/start/reboot/blackout evidence. It must test disconnected installation with the standard Windows 11 WebView2 state recorded, effective production CSP, denied remote/file/javascript/clinical navigation, new-window/download/IPC negatives, package hash/size and local CPU/RAM/startup/network attempts. Because Microsoft includes Evergreen WebView2 with Windows 11, an absent Runtime is independently tested only on a separately supported target that naturally lacks it, before claiming that compatibility. Browser smoke cannot substitute for those native checks.

No deployment, main merge, migration, feature activation, protected offline authority, PHI persistence, signing or updater was added. R30-04 through R30-09 retain encryption, repositories, sync, grants, trusted distribution and full blackout acceptance. R29-01 through R29-05 remain open wherever actual RC CPU/latency/rows, cache activation, provider replication/bookmarks, query/index benefit, Turnstile/Placement or final rollback evidence is still pending.

Publication evidence: implementation commit `a490b167f772abcd3a51367624275d41c4aef5ed` is on the reviewed fix branch. GitHub validation run `35508634006` passed Roadmap/Graph declarations, install, typecheck, lint, monorepo tests and four critical Playwright flows. Cloudflare Pages event `e769ebe9-3f69-4011-bb7b-fff514fc2e6a` is `is_skipped=true` with every build/deploy stage idle. PR #143 remains open with auto-merge disabled. No deployment occurred.
