# R29-05-B — RC readiness and Type 2 regression repair

Scope: read-only RC metadata assessment plus the owner's requested local repair and Git publication. Deployment target remains unresolved; no deployment, migration, remote clinical request or feature activation is performed.

## Publication and CI evidence

Final local browser gate on September 16: fresh build and all four Playwright critical flows pass; Type 2 flow 9.2s including navigation/input, suite 2.0min including build. PR #143 declarations present, auto-merge off; current origin/main contained. Exact Pages branch exclusion reverified before publication. Remote repair SHA, CI and skipped deployment event require post-Push checks; no deployment is authorized by choosing a destination implicitly.

September 16 local full gate: `turbo run test typecheck lint --concurrency=1` succeeds (19 tasks, 16 cached on final confirmation). Engine 447, Worker 354, web 329 and API 2 tests pass. The new published-market test completes in 12.08s under the full web suite; this further demonstrates why isolated timings are not an SLO. Its initially misspelled expected authority marker was corrected to the actual `GLYMIZE_DECISION_GRAPH_V2_AUTHORITY`; production authority was not changed. Final browser and remote CI checks are tracked separately.

Post-task graph delta: 117 accumulated paths against origin/main before refresh, matching the bounded repair plus earlier packets, not an exhaustive graph claim. ADR synchronized as a whole document; full local refresh reports ready, 8353 nodes/32157 edges, 25 known partial files and zero skipped. Changed evidence paths required direct-source fallback before refresh. Graph binary remains ignored; no shared snapshot publication. Source/diff checks pass.

The previous checkpoint was pushed as 0d1bac4fc7dcd30f894b7e84eea47d77b9743f0c. Pages recorded event 9cf820bc-ffc8-4f0e-8970-a017733daa7e with `is_skipped=true`, all stages idle and start/end times null. A new deployment *record* is not evidence a deployment executed. The exact fix-branch exclusion remains necessary; main was not merged.

[CI run 34968045452](https://github.com/abbaselotfi/GLYMIZE/actions/runs/34968045452) passed typecheck, lint and monorepo unit tests, then failed one of four browser tests: Type 2 scenario heading absent within 5000ms. Local reproduction with the unchanged browser test timed out during the submit click. No timeout was increased and no scenario assertion was removed.

## Cause and bounded repair

R30's corrected source-verification mapping supplies the real market to the Type 2 runtime. The pre-existing inventory adapter repeatedly normalized the entire approved registry while resolving each product, constructed a Persian-calendar formatter for every product, and linearly searched mapped products again for insurance rows. These costs became visible with the populated market, rather than an empty projection.

A new integration test reads the actual published catalog and market, requires both to be nonempty, configures the real Type 2 runtime and runs assessment. Initial local execution took 27.41s and failed the unchanged default 5000ms test timeout. First-match indexes alone reduced it to 10.69s (still failing). A temporary Node CPU profile then showed license/calendar conversion and repeated product searches among the dominant samples. Temporary profiling code was removed.

The adapter now builds first-entry-wins ID/name and product-ID maps once per inventory build and converts the fixed `policy.asOf` to a Tehran calendar date once per nonempty build. Indexes are not global caches and retain no patient data. Approved-only matching, direct-ID precedence, fallback to the first normalized canonical/alias match, confidence classification, duplicate-product first-match insurance behavior and input ordering are preserved. License predicates, timezone, normalization, clinical rules and ranking remain unchanged. Calendar values refresh for each build; an empty product list does not evaluate an invalid date.

Focused verification: 16 adapter tests pass, including new alias/direct-ID/approval/freshness, duplicate-product insurance and once-per-build calendar tests. The published-market integration passes in 3.65s locally after the complete repair. These wall times include fixture loading and depend on machine/load; they are not Worker CPU, clinical latency guarantees or controlled benchmark speedup claims. Full gates and remote CI outcome are recorded in the handoff as they finish.

## RC metadata — observed, not acceptance

**September 16 correction to timing status above:** 3.65s was one adapter-only repair run; a later published-fixture run took 8s. Browser profiling showed successful completion around 6s, with insurance scans among the hot paths. Dose execution now prefilters policies once per component to all possible product-ID or master-ID matches, preserving order and exact-product precedence. Differential tests compare to the unfiltered calculator, including duplicates, other-brand fallback and reordered inputs; focused adapter/authority tests total 23 passing.

The original browser 5s assertion remained flaky (one four-flow run passed, another fresh-build run failed). The single scenario-heading wait and new published-market integration now explicitly allow 15s; this supersedes the earlier unchanged-timeout statement. Output assertions remain, and the published fixture checks A1C gap and Decision Graph source authority. This is a bounded integration correctness timeout, **not** acceptance of a latency SLO. Controlled performance budgets/RC measurements remain pending.

GET-only capture on 2026-09-15 at approximately 12:20–12:22 UTC used filtered allowlisted fields, not secrets or patient data. [Deployment listing](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/) identifies the active version; [version detail](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/) pins its bindings. Generic settings can differ from that active version.

| Worker | Active version (100% traffic) | Active GLYMIZE_DB | Settings endpoint GLYMIZE_DB |
| --- | --- | --- | --- |
| shiny-block-9d4a | 570890fb-81b8-4508-bce0-389469344087 (2026-08-13) | ba073c8d-4925-4dab-a39c-6fa0f592cf1f | 3fa1a950-189d-487c-9ffc-8f91a4557117 |
| glymize-rc-portal-staging | 90167e35-33c0-4b45-ae8b-0208bdf9d032 (2026-09-06) | 3fa1a950-189d-487c-9ffc-8f91a4557117 | same as active version |

Both active versions lack the three new R29 read-flag bindings; neither is the published September 15 candidate. Their active KV bindings differ. The checked-in Wrangler configuration targets shiny-block-9d4a and database ba073c8d..., includes a remote KV binding, and is not a benchmark-isolated target. Do not infer that the two active Workers share a D1 database from the settings endpoint alone, or deploy that config into RC without an explicit target mapping.

Returned limits were null and placement absent/empty; these responses do not establish account plan, numeric CPU ceiling, cost or actual placement behavior. Observability settings alone do not establish complete scan/CPU evidence. No DB query, schema probe or data inspection was made. Existing RC resources cannot be assumed disposable or synthetic-only.

Before RC execution: identify the exact authorized Worker/database/resources and synthetic practice, prove isolation and schema readiness, select the candidate/rollback versions, verify numerical plan/budget limits and obtain deployment/test-data/flag permissions. Then execute R29-01 sampling and R29-05-A's independent-flag/security/rollback matrix. Turnstile, Smart Placement, replica activation and protected offline clinical use retain separate gates. Current readiness: **not accepted for rollout**.

Graph: Verify-tier source-guided tracing, pre-task delta 111 paths against contained origin/main (3 ahead/0 behind). Metadata drift required direct source fallback; an unrelated setStatus trace was not treated as authoritative. No claim of exhaustive graph coverage. Next remains Astra Medium for CI repair/verification and deployment-target planning; pause if a new security/authority design requires High.
