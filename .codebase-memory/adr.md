# GLYMIZE Codebase Memory ADR

## 2026-09-07 — Reviewed Type 2 insurance claim-timing authority

- Status: Accepted
- Scope: Type 2 insurance claim timing; no production insurer integration or migration

### Context

Ordinary Iran market insurance rows can describe financial coverage, but they do not prove payer rules for multiple claims, strength switches, minimum claim spacing, or claim-count limits inside a treatment window. Inferring those rules from coverage rows could incorrectly make an `insured_only` treatment schedule appear executable.

### Decision

GLYMIZE keeps reviewed Type 2 claim-timing policy as a separate authority boundary:

1. Reviewed claim-timing entries are version-controlled in `apps/admin-worker/src/type2-claim-policy-registry.ts` and require ordinary Roadmap/Graph-gated GitHub review with source provenance.
2. The registry starts empty and must never be populated automatically from ordinary NFI/market insurance coverage rows.
3. The Worker exposes the reviewed registry only to an authenticated runtime user with the `type2` permission.
4. The web runtime fails closed to an empty reviewed policy set when the trusted runtime response is unavailable, malformed, unauthorized, or expired.
5. Decision Graph v2 may add reviewed `claimTiming` metadata only to an already-existing imported financial insurance policy with the same provider and target. Claim-timing authority cannot create financial coverage.
6. The imported financial policy identity, coverage values, effective date, and financial source provenance remain unchanged when claim-timing metadata is attached.
7. Duplicate reviewed provider/target authority is rejected, and a future-dated reviewed entry does not activate before its `effectiveAt`.
8. Decision Graph v2 remains the executable/ranking Type 2 clinical authority; this boundary does not move clinical ranking or dosing into the Worker.

### Consequences

- Multi-claim insurance schedules remain `unknown` unless explicit reviewed timing metadata exists for every required policy target.
- Adding real payer rules is a later reviewed data task, not part of this boundary implementation.
- No real insurer API, e-prescription integration, patient-data migration, or production deployment is authorized by this decision.
- `.codebase-memory/adr.md` is kept as small version-controlled text so Codebase Memory ADR decisions survive fresh canonical snapshot builds; graph binaries remain excluded from normal Git history and are distributed through the private `codebase-memory-latest` Release snapshot.
# 2026-09-10 — Patient module confirmation lifecycle

Decision: isolate the Type 2 handoff review state machine from React wiring and clinical field mapping. Revalidate actor/practice/patient descriptor and source revisions through the existing authorized read endpoint at confirmation. Cancellation/generation guards suppress obsolete responses and duplicate confirmation. Runtime auth events invalidate active work only when actor identity, practice, or active status changes; same-actor token/profile refreshes retain the review. Worker/D1 and Decision Graph v2 authorities remain unchanged. See `docs/ARCHITECTURE.md` and the R28-07 completion record.
