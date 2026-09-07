# Clinical Rule Metadata Traceability

Status: accepted architecture boundary for the current GLYMIZE clinical engine.

Repository baseline for this closure: `main@b0d9f614b0fb88a99ffa21e244be6c598a365025`.

This document defines how executable or decision-bearing clinical artifacts remain traceable to reviewed evidence. It does not add, approve, or change any clinical threshold, eligibility rule, dose, ranking policy, or product indication.

## 1. Identity and evidence requirements

Decision Graph artifacts that carry clinical authority must have a stable identity and evidence provenance appropriate to their role:

| Artifact | Stable identity | Evidence requirement | Review-state requirement |
| --- | --- | --- | --- |
| Medication/safety gate | `id` | non-empty `evidence` | governed by reviewed rule source; no new generic review field is introduced here |
| Regimen conflict rule | `id` | non-empty `evidence` | governed by reviewed rule source |
| Clinical objective | objective `id` | non-empty `evidence` when the objective is guideline-derived and can influence selection/composition | no new review-state field is introduced by this task |
| Clinically-derived missing-data requirement | requirement `key` | non-empty `evidence` when the requirement is justified by clinical guidance and can block or shape clinical reasoning | no new review-state field is introduced by this task |
| Dose/titration/approved protocol | rule/protocol `id` | non-empty `evidence` | explicit `reviewState` where the executable protocol type already requires it |
| Product-safety review set | review-set and criterion IDs | reviewed evidence attached to the criterion set | explicit reviewed version/state boundary |

Every evidence reference used for this closure carries at least `sourceId`, `title`, `version`, and `url`; locators and evidence strength remain available where the source module already provides them.

## 2. Current Type 2 provenance closure

The Phase 2 audit found four central organ-protection objectives whose treatment authority was already implemented but whose `evidence` arrays were empty:

- `kidney_protection`;
- `heart_failure_protection`;
- `ascvd_protection`;
- `liver_directed_therapy`.

The closure reuses evidence authorities already reviewed and present in the repository:

- KDIGO diabetes/CKD guidance for the CKD objective;
- ADA cardiovascular-risk guidance for heart-failure and ASCVD objectives;
- the existing AASLD MASH/resmetirom guidance reference for the liver-directed objective.

The audit also found three clinically-derived adaptive-data requirements with empty evidence: `kidney.eGfr`, `kidney.uacrMgG`, and `cardiovascular.lvefPercent`. They receive the same domain-appropriate, already-existing evidence references. Their priority, blocking behavior, reason text, and trigger predicates remain unchanged.

## 3. Intentionally evidence-empty structures

An empty `evidence` array is not automatically a provenance defect. The following current structures are intentionally evidence-empty because they do not themselves assert a reviewed clinical rule:

- the initial `pass` gate attached to a generated regimen before hard-gate evaluation;
- the base `unsupported` insulin-conversion result before any reviewed conversion edge is matched;
- synthetic KnowledgeMedication fixtures used only to materialize reviewed rules for Evidence Assistant indexing;
- the `preferences.insuranceProviders` missing-data requirement, which enforces a request/policy prerequisite for `insured_only` rather than a clinical guideline rule.

These cases must not be used as precedent to omit evidence from a new guideline-derived clinical objective, gate, dose rule, or clinically-derived blocking requirement.

## 4. Boundary with source review/version governance

This closure satisfies the Roadmap requirement to make current clinical rule metadata traceable; it does **not** claim that every public schema or every future clinical module has a universal review/version lifecycle.

The separate Phase 2 item **Add source versioning and review fields** remains independently auditable. A future task may standardize review-state/version metadata more broadly, but it must not fabricate review approval for artifacts that have not undergone that governance process.

## 5. Regression expectation

Automated regression must prove that:

1. the four organ-protection objectives above carry non-empty, versioned evidence when emitted;
2. the three clinically-derived adaptive-data requirements above carry non-empty, versioned evidence when emitted;
3. the insurance-provider request prerequisite remains evidence-empty rather than being falsely presented as a clinical guideline rule;
4. Decision Graph triggers, objective levels, blocking flags, dose logic, and selection behavior remain unchanged by this metadata-only closure.
