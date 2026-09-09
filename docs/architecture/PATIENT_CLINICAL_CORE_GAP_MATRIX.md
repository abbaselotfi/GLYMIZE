# GLYMIZE — Patient Clinical Core Gap Matrix

**Status:** B1 gap matrix  
**Date:** 2026-09-09  
**Baseline:** `main@b135925898239b2e6628064aec6a679d903bc718`  
**Related:** `PATIENT_CLINICAL_CORE_INVENTORY.md`, `PATIENT_CLINICAL_CORE_MIGRATION_ADR.md`

This matrix is intentionally separate from the narrative inventory so B2+ tasks can update individual gaps without turning the core architecture document into a change log.

| ID | Capability | Existing asset/state | Gap | Target closure | Dependency / guardrail |
| --- | --- | --- | --- | --- | --- |
| PCC-G01 | Longitudinal patient persistence | Worker/D1 Patient Record v2 | no canonical Adult Medicine read/context contract | B2 | preserve Worker/D1 authority; no second store |
| PCC-G02 | Identity and practice scope | patient identity + identifiers + practice contexts | scope must be uniformly present in shared patient views | B2 | global identity remains additive; no silent practice merge |
| PCC-G03 | Clinical fact semantics | existing patient/encounter/observation transports | no universal provenance/effective-time/freshness vocabulary | B2 | never infer missing facts |
| PCC-G04 | Problems/diagnoses | existing record/snapshot information | no canonical shared Problem/Problem Graph contract | B2 + later graph expansion | diagnosis and routing signal remain distinct |
| PCC-G05 | Allergies/intolerances | patient clinical data foundations | needs normalized shared safety-facing view | B2/B4 | one canonical fact consumed by all modules |
| PCC-G06 | Patient medication state | physician medication reconciliation exists | needs reusable medication-state contract linked to Medication Intelligence | B2/B4 | patient state separate from catalogue knowledge |
| PCC-G07 | Labs/observations | observations + `trends.ts` + lab registry/parser | needs canonical observation/freshness projection | B2/B3 | trend view derives from authority, not duplicate store |
| PCC-G08 | Encounters/timeline | encounters + snapshot revisions + timeline UI | needs common event/context projection | B2/B3 | preserve immutable/revision semantics |
| PCC-G09 | Orders/investigations | `orders.ts` + physician-order contracts | needs consistent Plans/Actions projection | B2/B3 | actions remain physician-confirmed |
| PCC-G10 | Referrals/care relationships | referral/provider/relationship foundations | needs longitudinal awareness projection | B2/B3 | workflow service keeps bounded ownership |
| PCC-G11 | Documents | archive + patient-document parser | needs source-linked document/extracted-fact semantics | B2/later | extracted facts retain provenance and review state |
| PCC-G12 | Cross-cutting Clinical Context | mature Type 2 context concepts in parts of engine | no general cross-domain Patient Core context projection | B2 | pregnancy/lactation etc. not duplicated per specialty |
| PCC-G13 | What Changed | current workspace change-summary capability | no universal versioned deterministic `PatientChangeSet` | B2/B3 | AI may summarize, not invent deltas |
| PCC-G14 | 10-Second Clinical Brief | product target + reusable patient data | no canonical high-signal brief projection | B3 | source traceability; critical data not hidden |
| PCC-G15 | Visual status / trend UX | responsive UI + lab trends | not yet unified visual-first awareness system | B3 | awareness → focused detail → source/audit |
| PCC-G16 | Touch/stylus interaction | responsive existing app | not yet formalized in shared clinical controls/usability tests | B3 | large targets, no hover dependency, minimal typing |
| PCC-G17 | Medication Intelligence integration | catalogue + cost/insurance + safety primitives | patient state and cross-domain eligibility need common boundary | B4 | no silent medication exclusion |
| PCC-G18 | AI patient context | Evidence Assistant + provider configuration | no versioned curated `PatientContextView` for Adult Medicine | B5 | AI has no direct authority over facts/rules |
| PCC-G19 | Clinical module registration | Type 2 Decision Graph is mature | no universal typed module registry/maturity contract | B6 | new specialty must not grow central if/else tree |
| PCC-G20 | Diabetes module convergence | Type 2 + insulin mature; Type 1/pregnancy surfaces partial | still route-specific rather than reference module over shared core | B7 | preserve clinical regression/safety authority |
| PCC-G21 | Second specialty extensibility | cardiometabolic primitives already exist | modular extensibility not proven with independent second domain | B8 | add module without rewriting Patient Core/Diabetes |
| PCC-G22 | DecisionRecord | roadmap target | no production persistence authority | later dedicated ADR/task | no persistence invented inside B2/B3 |
| PCC-G23 | Contract concentration | `patient-record-v2.ts` and large `index.ts` | future additions could create God contracts | B2 incremental split | small files + compatibility re-exports |
| PCC-G24 | Worker façade concentration | Patient Record partially decomposed into archive/context/orders/trends | some compatibility/orchestration files remain large | incremental when touched | no big-bang refactor; no new unrelated logic in façades |
| PCC-G25 | Codebase dependency graph freshness | Codebase Memory snapshot/release exists | canonical Roadmap/architecture changes were not guaranteed triggers | B1 | workflow paths include canonical docs; verify post-merge SHA |
| PCC-G26 | Human usability evidence | automated critical flows exist | touch/pen/visual assumptions need structured physician usability validation | B3 and release gates | real physician testing; automation is not usability evidence |

## B2 blocking subset

The following gaps must be addressed before a broad visual Patient Overview or AI patient-context integration becomes authoritative enough to build upon:

- PCC-G01 — canonical read/context contract;
- PCC-G02 — identity/practice scope;
- PCC-G03 — provenance/freshness semantics;
- PCC-G04 — minimal problem model;
- PCC-G06 — patient medication state;
- PCC-G07 — observation model;
- PCC-G12 — cross-cutting context;
- PCC-G13 — deterministic change contract;
- PCC-G23 — contract decomposition boundary.

B2 should remain primarily contracts/projection/equivalence work. It should not absorb the full B3 visual redesign, B4 Medication Intelligence convergence, or B5 AI integration.

## B3 physician-experience acceptance subset

B3 must explicitly address:

- PCC-G14 — 10-Second Clinical Brief;
- PCC-G15 — visual/trend awareness;
- PCC-G16 — touch/stylus interaction;
- PCC-G26 — physician usability validation.

The target is not maximum information density. It is the shortest safe path from opening a patient to understanding current clinical state, meaningful change, and the next relevant action.

---

## R28-06 authority audit — 2026-09-09

This section is a factual append to the historical B1 matrix. It does not retroactively rewrite the B1 baseline and does not create a new source of truth.

| Patient Core family | Current authoritative source / write owner | Current Patient Core projection | Safety-facing state that can be asserted now | Unresolved authority decision |
| --- | --- | --- | --- | --- |
| Allergies / intolerances | **No canonical allergy authority is exposed by the current Patient Record v2 snapshot contract or D1 schema.** | `not_available / source_not_exposed` | Missing/not-collected must remain unavailable; it is never known absence or medication clearance. | Selecting/creating an allergy write authority or persistence shape requires a separate reviewed gap/ADR and is owner-gated. |
| Problems / diagnoses | **No canonical problem-list authority is exposed by the current Patient Record v2 snapshot contract or D1 schema.** Bounded `clinicalFlags` are contexts, not a problem list. | `not_available / source_not_exposed` | Missing problem data remains unavailable; notes/flags must not be promoted to diagnoses by projection. | Selecting/creating a problem write authority or persistence shape requires a separate reviewed gap/ADR and is owner-gated. |
| Medication reconciliation | Immutable Patient Record v2 encounter snapshots written through the existing encounter/snapshot workflow. | Snapshot-derived `PatientMedicationStateView`; rejected entries excluded; invalid eligible entries make the collection partial. | `not_collected`, known-empty for the declared snapshot source, unverified/verified, status, source state, snapshot revision/time and reconciliation stage can be preserved. | No new authority is required for the current snapshot-derived reconciliation view. Broader longitudinal medication-history authority remains a separate future decision. |
| Cross-cutting Clinical Context | Existing Patient Record v2 encounter snapshot `clinicalFlags` for the currently enumerated bounded subset. | Explicit true/false flags are projected as present/absent, while the family remains `partial / not_supported`. | Explicit represented flag state can be preserved with snapshot provenance; absence of an unrepresented context cannot be inferred. | Broad pregnancy/lactation/frailty/hepatic/acute-illness context authority beyond the existing flag subset requires separate reviewed source/ADR work. |
| Observations used by medication safety | Patient Record v2 indexed observations from the latest immutable snapshot revision per encounter. | R28-03/R28-05 bounded Patient Core observations with explicit completeness/provenance. | Verification, source/effective/recorded time, revision and current `freshness` state are transportable to reviewed safety consumers. | Freshness policy is use-specific. No universal cutoff may be invented in Patient Core. |

### R28-06 non-negotiable state semantics

1. `not_available` / `not_collected` is not `known_absent`.
2. `known_absent` is only valid for a collection that is `complete` for its declared source scope and contains no facts.
3. A `partial` collection remains partial even when it contains zero items.
4. `unverified`, `freshness: unknown`, `stale`, and `current` are distinct transport states. Patient Core does not calculate a universal staleness threshold.
5. Care-Team/pre-visit reconciliation, physician-review/final snapshot reconciliation, clinical-engine decision output, and signed physician order are separate objects/stages. A reconciled medication fact is not itself an order.
6. Missing safety facts must never become an implicit eligibility or clearance decision.
7. Existing reviewed medication/product safety registries remain the clinical-rule authority. The Patient Core adapter may carry state into those consumers but must not duplicate their criteria or ranking logic.

### R28-06 gate status

The current repository supports a non-authoritative structural adapter for existing medication/context/observation facts. **Allergy and problem authority selection remains unresolved and owner-gated.** No migration or new write authority is authorized by this audit.
