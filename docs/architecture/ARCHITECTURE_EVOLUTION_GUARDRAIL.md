# GLYMIZE — Architecture Evolution Guardrail

**Status:** Accepted engineering principle  
**Date:** 2026-09-09  
**Applies to:** Product architecture, Patient Clinical Core, clinical modules, UI/UX, runtime boundaries, and future migrations

## Principle

GLYMIZE preserves **clinical meaning, safety, data integrity, auditability, and required compatibility**. It does not preserve an existing technical shape merely because that shape already exists.

Existing code is an asset and a source of proven behavior, not a veto on a better architecture.

## Preserve semantics, not accidental structure

When evaluating an existing component, contract, route, datastore boundary, or user flow, distinguish between:

- invariants that must survive a migration; and
- implementation choices that may be replaced.

Examples of invariants include patient identity/scope, authoritative clinical facts, immutable history where required, physician-confirmed actions, deterministic safety rules, provenance, and regression-proven behavior.

Examples of replaceable structure include a large façade, route hierarchy, screen composition, contract layout, adapter, package boundary, navigation model, or historical UI pattern.

## Innovation is allowed when it produces measurable benefit

A new design may supersede an existing design when it materially improves one or more of:

- physician usefulness and speed;
- clinical safety and explainability;
- touch/stylus/tablet usability;
- information comprehension and visual awareness;
- modularity and changeability;
- performance or reliability;
- testability and blast-radius control;
- interoperability or future specialty expansion.

Novelty by itself is not sufficient. The change must have a clear product or engineering advantage.

## Migration discipline

A better architecture should not be rejected solely because migration is required. Instead, migrations must make the transition explicit through the appropriate combination of:

- versioned contracts;
- adapters/compatibility façades;
- equivalence and regression tests;
- data migration plans when persistence changes;
- staged rollout and rollback;
- updated architecture/graph documentation;
- dedicated ADRs for material authority or storage changes.

Compatibility is therefore a migration responsibility, not a permanent design constraint.

## Patient Clinical Core implication

The current Patient Record v2 / Worker / D1 authority is the default B-series persistence baseline because it is proven and already contains valuable longitudinal data. The current migration ADR's convergence strategy remains appropriate for the present phase.

However, that decision does **not** prohibit a later reviewed redesign or replacement if future requirements demonstrate that a different model is safer, simpler, more useful, or materially more scalable. Such a change must preserve or deliberately migrate the authoritative semantics rather than silently creating competing truth.

## UX implication

Existing screens, tabs, menus, forms, and information density patterns are not protected architecture. The physician experience may be substantially recomposed when a better visual, context-aware, touch/pen-first workflow is identified.

The target remains clinical awareness before data density, progressive disclosure, minimal typing, and fast access to source detail when needed.

## Decision rule

When old and new designs conflict, ask in this order:

1. Which clinical/data invariants must not change?
2. Which design better serves the physician and patient?
3. Which design is safer and more explainable?
4. Which design has the cleaner dependency direction and smaller future change cost?
5. Can migration/compatibility be handled explicitly without creating dual authority?

If the new design wins those questions, GLYMIZE should migrate toward the new design rather than preserve the old structure by default.
