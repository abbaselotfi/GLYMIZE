# R29-05-A — local rollout/rollback evidence

Status: local preparation passed; remote RC acceptance NOT RUN. No deployment, migration, feature activation or paid service. Model recommendation: Astra Medium, medium relative token cost.

## Reproduce and evidence boundary

Run from the repository root: `node apps/admin-worker/scripts/check-read-rollout.mjs`.

The runner invokes the installed Node/Vitest tests with fake D1 and real fixture encryption. It accepts no remote endpoint or credentials. It hashes 141 scoped source/test/contract/lock/runner files before and after execution and rejects concurrent source changes. [Captured JSON](evidence/R29_05_A_LOCAL_ROLLOUT_2026-09-15.json) records the dirty candidate's base commit, source fingerprint and timestamp; it is not a deployed-version attestation. The fingerprint is scoped, not a hash of the whole repository.

The actual history facade is exercised for observations and timeline. Bit order is D1 sessions, request CryptoKey reuse, history scope lookup. Each family runs `000, 001, 010, 100, 011, 101, 110, 111, 000`: eight independent configurations and full rollback in one process, 18 rows total. Bodies equal the fixed-time baseline. Authorization stays on the original primary context; the scoped registry lookup anchors the optional first-primary history session. Narrow-lookup fixtures use three queries/one decryption instead of six/two. This does not measure provider replication, Worker CPU, D1 scan/write cost or real latency. Key reuse changes imports, not the number of requested payload decryptions.

The new matrix proves full `111 -> 000` rollback only. Individual disable-from-111 transitions, overlapping in-flight requests during remote rollout, deployment rollback and provider behavior remain unmeasured. Existing boundary/security tests run alongside it; the 18 matrix rows alone are not an exhaustive authorization audit.

## Checks

- Focused runner: PASS, two test files / 59 tests; 18 matrix rows. Final capture 2026-09-15T10:16:33.033Z after removing an extra EOF blank line, Node v24.18.0.
- Sequential full repository test gate: PASS. Worker 51 files/354 tests; web 61/328; clinical engine 72/443. Separate evidence-casebase UCI suite is excluded by the normal engine command and was not run.
- Final `pnpm exec turbo run test --concurrency=1`: exit 0, seven successful/cached tasks, reusing the successful sequential execution.
- `pnpm exec turbo run typecheck lint --concurrency=1`: exit 0, 15 successful tasks.
- Earlier parallel `pnpm test` FAILED two existing 5000ms timing gates under cross-package load: the 80-import test took 5336ms; longitudinal decryption measured 5287.15ms. Sequential rerun passed without changing thresholds. This is a timing sensitivity, not a hidden successful parallel run or proof of production budgets.
- Historical web export/offline/browser checks remain in the R30 packet reports; no new browser/release acceptance is claimed here.
- Staged-file check initially exposed EOF/trailing-whitespace issues in two scripts and three existing packet documents. These were corrected; the source-fingerprinted focused runner was rerun. A bounded credential-pattern scan of 103 staged non-deleted files found no private-key/GitHub-token/AWS-access-key patterns; this is not a comprehensive secret audit.

## Remote acceptance checklist — pending, not execution permission

Graph post-gate: captured 106 accumulated changed paths before refresh (graph delta is not exhaustive Git inventory), synchronized the full ADR, refreshed and confirmed ready at 8341 nodes/32112 edges, 25 known partial files/zero skipped. Direct-source fallback covered the new untracked runner and metadata-drift focused tests. Local graph binary stays excluded; no shared snapshot was published. `git diff --check` passed, and refreshed origin/main remains contained (1 ahead/0 behind before the checkpoint commit).

1. Identify approved isolated RC target/database, exact candidate commit and deployed Worker version, operator, verified plan limits/cost budget and previous known-good version. Do not seed or migrate the existing runtime database just because Wrangler can access it.
2. Record actual remote values of all three independent flags. Checked-in flags remain absent/default OFF; local settings do not attest remote state. Use synthetic fixtures for both families and compare all eight states against 000.
3. Recheck permission denial/revocation, wrong practice/patient, invalid cursor, registry failure, ciphertext/AAD failure and sourceVersion changes. Preserve fresh-primary authorization and requested-history failures. Do not log PHI, tokens or bookmark bytes.
4. Capture requested routing separately from observed provider metadata and actual replica behavior. Missing `first()` row metadata remains unknown; a partial sum must not pass a complete rows budget.
5. Follow R29-01: at least 100 successful samples per workload/region, failures counted separately; CPU p95 within 80% of the verified applicable ceiling, latency/scan no worse than baseline. Record cold/warm behavior and real rows_read/rows_written, rather than substitute Node wall time or SQLite plans.
6. Exercise individual flag disablement, full 111-to-000 rollback, overlapping in-flight requests and the approved previous-version rollback. Capture error/body/routing/performance evidence before and after. No rollback command has been executed in this packet.
7. Turnstile and Smart Placement retain separate applicability, offline, cost, benefit and rollback gates. Do not bundle their activation with read optimizations. Reference-only offline success does not authorize protected offline patient access or installed-product release.

Unknown remote fields stay null/not_run in JSON. R29-01 through R29-05, conditional bookmark transport and protected-offline R30 obligations remain scheduled, not globally complete.

## Git publication gate — blocked by automatic Preview deployment

Owner approved reviewed Commit and Push on `fix/r28-07-handoff-confirmation-lifecycle-20260910`, explicitly **without Deploy**, and without main merge. Read-only metadata inspection on 2026-09-15 found:

- GitHub repository private; no reviewed workflow push trigger matches this fix branch. Repository hooks list was empty, which does not rule out GitHub App integration.
- Cloudflare Pages project `k1lqjcpcsjdfs4xtzkegqe` links `abbaselotfi/GLYMIZE`, production branch `main`.
- Source config: `deployments_enabled=true`, `production_deployments_enabled=true`, `preview_deployment_setting=all`, preview includes `["*"]`, excludes `[]`, path includes `["*"]`, excludes `[]`.
- Pages inventory pagination: page 1, count 1, total_count 1, total_pages 1. Wrangler list also reports Git Provider Yes. API metadata was filtered to avoid secrets; no settings were changed.

These settings match the current branch, so Push can trigger a Preview deployment and is withheld. An earlier direct API authentication error was resolved by Wrangler refresh; an invalid per_page=100 request was retried successfully with per_page=10. Neither failed request was treated as evidence of absent configuration. Workers Build triggers have not been exhaustively inspected: the positive Pages blocker is already sufficient to stop publication.

Next checkpoint: finish local reviewed commit; obtain explicit authority to exclude only this branch from automatic Preview deployment (or have the owner do so), then recheck Pages and Workers Build/GitHub triggers before Push. Do not change deployment settings, use skip-CI as proof, create a new branch, or deploy under the current authorization. R29-05-B RC readiness/evidence planning remains Astra Medium; remote activation needs its separate gate.
