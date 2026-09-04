# CSS consolidation — Phase 0 / Task 8 record

Roadmap reference: `docs/PROJECT_OVERVIEW_AND_ROADMAP.md` §9 Phase 0 / Task 8 and §8.25.
Status: implemented on `refactor/phase0-task8-css-consolidation-20260904`. One PR,
behavior-preserving, no clinical or runtime code touched.

## 1. Inventory at task start (65 stylesheets under `apps/web/app`)

Versioned / layered chains (all imported from `app/layout.tsx` in this exact
order, or `@import`-ed by `redesign-v3-entry.css`):

| Chain | Files |
| --- | --- |
| Base theme | `globals.css` (itself `@import`s `glymize-theme.css`) |
| v2 design system | `design-system-v2.css` → `-a11y.css` → `-legacy.css` → `-smoke-fixes.css` |
| v3 tokens | `design-tokens-v3-core.css` → `-semantic.css` → `-dark.css` |
| v3 redesign aggregator | `redesign-v3-entry.css` `@import`ing 11 files: `workspace-v3-foundation.css`, `clinical-workspaces-v3.css`, `profile/profile-v3-surfaces.css`, `profile/profile-v3-controls.css`, `account/account-interactions-v3.css`, `type-2/type2-redesign-v3.css`, `type-2/type2-redesign-v3-meta.css` (which `@import`ed `type-2/type2-results-v3.css`), `type-2/type2-redesign-v3-accessibility.css`, `admin/admin-redesign-v3.css`, `layout-overrides-v3.css`, `performance-hotfix.css` |
| Type 2 layout files | `type2-command-center-v3.css`, `type2-focused-workflow-v3.css`, `type2-visual-flow-v3.css`, `type2-evidence-trace-v3.css`, `type2-adaptive-cards-v3.css`, `type2-final-ux-v4.css` (imported after the aggregator in `layout.tsx`) |

Orphans (zero references from any `.ts`, `.tsx`, or `.css` file):
`gate-cta-visual-fix.css` (hotfix), `typography-v3.css`, `home.module.css`.

Kept in place: `admin-legacy-controls-v3.css` and `admin-mobile-qa-v3.css` are
`@import`-ed inside `admin/admin-workspace-nav.module.css`. Moving them into the
global chain would change their cascade position (module CSS loads after the
global chain), so consolidation there was deferred to avoid a behavior change.

## 2. Consolidation performed

- `design-system-v2.css` now contains the former a11y, legacy, and smoke-fix
  layers as ordered sections. The three files were deleted.
- `design-tokens-v3.css` merges core + semantic + dark tokens in the previous
  order. The three files were deleted.
- `redesign-v3.css` flattens the aggregator and its 11 `@import`ed children
  (12 files including `type2-results-v3.css`) by concatenation in the previous
  import order; the only removed rule bytes are the `@import` lines and added
  section comments. All 12 files were deleted.
- `app/layout.tsx` imports the three consolidated files at the same cascade
  positions as before.
- Orphans `gate-cta-visual-fix.css`, `typography-v3.css`, `home.module.css`
  were deleted (they never reached the browser bundle).
- Net: 65 → 45 stylesheets; the maintained sources of truth are
  `globals.css` (+`glymize-theme.css`), `internal-shell.css`,
  `theme-overrides.css`, `dark-readability.css`, `design-system-v2.css`,
  `design-tokens-v3.css`, `redesign-v3.css`, the six Type 2 layout files, and
  the per-route `*.module.css` files.
- `apps/web/test/css-import-graph.test.ts` guards against reintroducing
  unreferenced stylesheets or losing a consolidated source.

## 3. Behavior-preservation evidence

- Rule bodies were moved, not rewritten; concatenation order equals the
  previous import order, so the global cascade is byte-equivalent.
- Five key surfaces — welcome/home, Type 2 assessment (form + ranked results),
  Care Team handoff (form + saved state), Admin workspace, Patient Portal
  record — were screenshot-compared before and after deleting the superseded
  files: desktop 1280×900 and mobile 390×844, full page, Chromium (system
  Chrome), animations disabled, deterministic capture protocol.
- Result: 14/14 screenshots SHA-256-identical between the pre-consolidation
  and post-consolidation production builds. Earlier run-to-run diffs were
  reproduced on a single build and traced to capture nondeterminism
  (`backdrop-filter` rasterization on the sticky save bar and fixed-element
  painting versus scroll offset), not to CSS.
- RTL (fa) / LTR (en) / responsive / print / accessibility behavior is carried
  by unchanged rule bodies in unchanged cascade positions; the captured
  surfaces include the responsive mobile pass.

## 4. Out of scope (deferred, documented)

- Token unification between the `--glymize-*`, `--ds-*`, `--g3-*`, and `--t2-*`
  families: values are consumed under different scopes; aliasing them changes
  resolution order for no visual gain today.
- The duplicate-vs-shadowing `!important` readability rules between v2 layers
  are intentional cascade and were preserved verbatim.
