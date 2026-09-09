# R28-04 — Patient Workspace current findings and source drill-down

Date: 2026-09-09

Status: **Complete**

Canonical task: Roadmap §28.3 `R28-04 — Align the brief, Attention Now and source drill-down`.

Final implementation/test baseline before this evidence record: `main@c9afbed2b8fbecbc8255548156a4aa96b04449a3`.

## What changed

R28-04 makes the physician-facing Patient Workspace use one structural selection contract for the 10-second Brief, Attention Now and current-finding previews.

- A current observation is the newest fact inside the same exact `factKey` series. The existing Worker fact key includes canonical key, unit and specimen, so incompatible unit/specimen series are not silently collapsed.
- Historical source flags remain reviewable but are not counted as a current finding when a newer fact exists in that exact series.
- Current unverified findings are surfaced separately. No severity, target, clinical resolution or disease-state inference was introduced.
- Preview limits now expose omitted counts and expandable remainder lists instead of silently dropping the rest of the already-loaded collection.
- Consequential displayed facts expose an expandable Source/Audit view including record/encounter/document identifiers where present, revision, verification, freshness and source/effective timestamps.
- D1 longitudinal observations now propagate the already-existing immutable `snapshot_revision` into Patient Core provenance. No migration, write authority or clinical authority changed.
- The Patient Workspace was decomposed: the route-facing component owns auth/async binding, while a dedicated view owns selection/rendering/source disclosure. Tests were updated to follow that module boundary rather than forcing the view back into the loader.

## Acceptance cases

Focused automated coverage includes:

1. old source-flagged result followed by a newer normal source flag in the same exact series — only the newer result is current; the older flag remains historical;
2. repeated analytes are reduced newest-per-exact-series for current-summary purposes;
3. incompatible units or specimens remain distinct current series;
4. current unverified observations surface as a review signal without a clinical severity inference;
5. observation, medication, reconciliation, change and timeline counts reconcile with preview and explicit omitted collections beyond every configured preview limit;
6. observation provenance exposes the source record, encounter and immutable snapshot revision;
7. the pre-existing active actor/practice/patient async guard remains the loader boundary.

## Engineering validation

Direct-main validation run: `34335565064` on `c9afbed2b8fbecbc8255548156a4aa96b04449a3`.

All applicable gates passed:

- frozen dependency install — PASS;
- monorepo lint — PASS;
- monorepo TypeScript typecheck — PASS;
- full clinical/security/regression test suite — PASS;
- Worker build — PASS;
- current web production build — PASS;
- Playwright browser install — PASS;
- web critical-flow Playwright suite — PASS.

The first direct-main validation exposed three source-text tests coupled to the pre-decomposition file location. Production behavior and the new R28-04 focused tests were already green. The tests were corrected to assert loader responsibilities in `patient-clinical-workspace.tsx` and presentation/safety responsibilities in `patient-clinical-workspace-view.tsx`; no artificial production strings or monolith rollback were used.

## Graph evidence

Codebase Memory run `34335565170` completed successfully on `main@c9afbed2b8fbecbc8255548156a4aa96b04449a3`, including exact-main checkout, pinned generator verification, canonical graph build, provenance packaging and private release publication.

A final graph refresh is required after this closure documentation commit so `codebase-memory-latest` reflects the closure SHA rather than only the implementation SHA.

## Guardrails preserved

- No new clinical threshold, severity score, target, automatic resolved state, contraindication or dose rule was added.
- `freshness: unknown` remains explicit where no reviewed use-specific policy exists.
- No Patient Core source of truth, D1 schema, catalogue persistence decision, clinical-engine authority or deployment flag changed.
- Historical abnormal/source-flagged data remains visible for review; it is not deleted or reclassified.
- `complete` still means complete only for the declared projection/source scope, not globally complete medical history.

## Continuation

R28-04 closes the source-aligned physician summary/display gap. The next canonical task is **R28-05 — Bound longitudinal reads and measure their cost**. R28-05 must measure before optimizing, preserve explicit partial/continuation semantics, and must not use performance work as justification for an unapproved datastore migration.