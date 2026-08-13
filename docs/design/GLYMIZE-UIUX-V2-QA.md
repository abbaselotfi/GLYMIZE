# GLYMIZE UI/UX v2 — QA gate

This checklist is the review gate for `feature/uiux-command-center-v2`.

## Clinical workflow
- [ ] Type 2 keeps the deterministic clinical engine unchanged.
- [ ] Phenotype/decision factors render 4 columns desktop, 2 tablet, 1 phone.
- [ ] Safety and urgent states are visible without relying on color alone.
- [ ] Type 1 and pregnancy retain their conservative safety boundaries.
- [ ] Insulin result narrative and formula are readable in light and dark mode.
- [ ] Care Team review/handoff actions are clear and patient data flow is unchanged.
- [ ] Evidence AI keeps source-first answer hierarchy and citations.

## Workspace
- [ ] Auto preset adapts by viewport.
- [ ] Command Center, Focused Workflow, Compact Cards persist through profile.
- [ ] Physician identity/photo is visible without dominating clinical content.
- [ ] Assistant navigation contains only granted permissions.
- [ ] Mobile bottom navigation does not cover clinical actions.

## Accessibility / responsive
- [ ] RTL Persian and LTR English both work.
- [ ] 44px minimum interactive targets on key clinical controls.
- [ ] Keyboard focus is visible.
- [ ] `prefers-reduced-motion` is respected.
- [ ] Dark mode status colors retain readable contrast.
- [ ] 360px phone, tablet portrait/landscape, 1366px desktop, and wide desktop checked.

## Regression
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] Worker build
- [ ] Static web build
- [ ] Auth/profile refresh session smoke
- [ ] Care Team D1 save/reopen smoke
- [ ] Evidence AI smoke

No merge to the validated runtime/mainline is permitted until the automated checks are green and the browser smoke is reviewed.
