# GLYMIZE Design System v2 — implementation

## Approved direction

This branch implements the adaptive clinical workspace agreed for GLYMIZE on top of the validated online runtime branch.

- Desktop/laptop: **Clinical Command Center**
- Tablet landscape: compact Command Center
- Tablet portrait: expanded adaptive cards
- Phone: **Adaptive Cards** with persistent bottom navigation
- Focused Workflow: physician-selectable optional preset
- Default: **Auto**

## Clinical UX principles

1. Clinical hierarchy outranks decoration: patient context → safety → primary decision → alternatives → cost/insurance → evidence.
2. Secondary information is progressively disclosed but remains readable; clinical body copy should not depend on tiny text.
3. AI remains evidence-only and never changes deterministic treatment ranking or engine logic.
4. UI changes must preserve physician/assistant permissions, runtime authentication, D1 handoff, audit, market data, insurance, and clinical calculations.
5. RTL and LTR are first-class layouts rather than mirrored afterthoughts.
6. Touch targets target at least 44px; focus state must be visible; color is never the sole carrier of clinical meaning.
7. Motion is restrained and disabled under `prefers-reduced-motion`.

## Layout presets

- `auto`: Command Center on desktop; adaptive cards on small screens.
- `command_center`: full information-density workspace.
- `focused_workflow`: narrower reading width and reduced peripheral chrome.
- `compact_cards`: denser cards without reducing clinical text below readable sizes.

## Validation gate

Before review/merge the branch must pass monorepo typecheck, regression tests, Worker build, and static web build. Visual browser smoke is performed only after CI is green; the validated runtime branch remains the rollback baseline.
