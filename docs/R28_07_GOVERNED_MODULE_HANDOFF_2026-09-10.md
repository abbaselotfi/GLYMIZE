# R28-07 — Governed Clinical Module Handoff

Date: 2026-09-10

## Status

**Complete in repository history.**

- Exact implementation candidate: `0af430a87aec5ca03607f4210e20d0d5f23528b9`
- Implementation PR: #141
- Landed main merge: `f92aee7459ea5194d4b6dccbe3dc6a12f6ec6192`
- Exact-head PR validation: `34440472004` (#244) — PASS
- Local exact-head POST Roadmap + Graph Gate — PASS
- Post-merge direct-main validation: `34441361566` (#136) — PASS
- Post-merge Codebase Memory snapshot: `34441361551` (#63) — PASS

## Implemented boundary

R28-07 introduces a typed Clinical Module lifecycle/registry while keeping module registration, treatment authority, release eligibility and patient-context adapters separate.

Type 2 retains `decision-graph-v2` as treatment decision authority. Patient Core handoff is a review/prefill boundary only.

The handoff descriptor carries practice/patient scope and source-revision metadata rather than clinical values. Type 2 re-reads Patient Core, revalidates scope and source revisions, and requires explicit clinician confirmation before eligible values can be applied.

Missing, unverified, explicitly stale, revision-mismatched or incompatible-unit required inputs fail closed. Target HbA1c and treatment preferences remain clinician inputs.

The existing legacy Type 2 handoff and compatibility route remain in place. Type 1 is registered as a second `read_only_context` proof with no treatment-authority or release-eligibility claim.

## Authority and deployment guardrails

R28-07 introduces no new clinical threshold, dose rule, contraindication, ranking, treatment recommendation or Patient Core write authority.

Migration `0019` remains unapplied. The R28-06 Allergy/Problem authority rollout remains default-off. No RC or production deployment was performed.

## Validation

Exact candidate CI #244 passed repository declarations, typecheck, lint, full monorepo tests and Playwright critical flows.

The local exact-head POST Roadmap + Graph Gate passed and preserved the clean worktree and safety stash.

After merge, direct-main validation #136 passed lint, typecheck, clinical/security regression, Worker build, current web build and Playwright critical flows.

Codebase Memory snapshot #63 successfully built and published the canonical exact-main graph snapshot.

## Confirmation lifecycle hardening — 2026-09-10

Follow-up source review found that the original hook validated at initial load but could retain a candidate until a later confirmation without a second authenticated read. The review lifecycle now lives in `apps/web/lib/type2-handoff-review-controller.ts`; the React hook only connects that controller to the runtime client and auth events.

Confirmation re-reads the existing authorized Patient Core endpoint and checks actor/practice identity, the active same-tab patient descriptor and source revisions before applying eligible values. Real actor/practice/active-status changes, discard and unmount invalidate in-flight work, including transports that ignore cancellation; same-actor token or profile refresh events do not discard an otherwise valid review. Concurrent confirmation cannot apply twice. No clinical mapping, rule or persistence authority changes.

Focused behavioral tests in `type2-handoff-review-controller.test.ts` cover these races and server-side permission revocation. Candidate-wide CI and graph evidence remain required for this follow-up; the historical runs above refer to the original R28-07 candidate.
