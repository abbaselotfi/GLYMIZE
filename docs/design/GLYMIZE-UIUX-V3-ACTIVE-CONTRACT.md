# GLYMIZE UI/UX v3 — Active Contract

This is the active implementation gate. It supersedes only the old timing note in `GLYMIZE-UX-LAYOUT-VISION.md`; its architecture and product decisions remain authoritative.

## Layout
- Auto: desktop = Concept A, tablet landscape = compact A, tablet portrait = expanded C, phone = Concept C.
- Concept B is optional Focused Workflow.
- One Clinical/Data Core and one shared component system; layouts never duplicate clinical logic, state, market, insurance, AI, evidence or ranking.

## Hierarchy
Patient context → safety → primary decision → alternatives → cost/access → evidence/details.
Use progressive disclosure instead of tiny text.

## Fidelity
- A: patient-context rail + main decision workspace + application/navigation rail.
- B: genuinely sequential workflow, not merely narrower styling.
- C: single-column mobile cards, large touch targets, compact/bottom navigation, no scaled-down desktop.

## Readability
- clinical body 13.5–14px minimum;
- rationale and labels 13–13.5px;
- calculation notes 12.5–13px;
- metadata >=12px;
- mobile secondary clinical copy generally >=13px.

## Interaction
Every primitive defines default, hover, active/pressed, focus-visible, selected, disabled and error states. Hover never becomes near-black; destructive actions remain distinct.

## Light / Dark
Both are equal acceptance targets. No migrated v3 component may depend on hard-coded white surfaces or low-contrast legacy text. Verify surfaces, muted text, status colors, borders, elevation, focus and disabled states in both modes.

## Implementation order
Shared tokens/primitives → Type 2 reference workspace → Command Center fidelity → mobile cards → Focused Workflow → Dashboard → Admin Drug/Data → remaining surfaces → tablet/RTL/LTR/accessibility → final smoke.
