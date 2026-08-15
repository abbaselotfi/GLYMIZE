# Implementation queue snapshot — 2026-08-15

Immediate next atomic patches after the roadmap/schema foundation:

1. Assistant invitation public URL: remove hard-coded `/GLYMIZE`; use environment-specific public app URL.
2. Assistant invitation email: enforce Admin `assistantInvitation` policy and validate Resend delivery from `info@glymize.ir`.
3. Assistant identity: set initial password after invitation and support later email/mobile + password sign-in.
4. Diagnose and fix Care Team patient-handoff save failure with explicit runtime error mapping.
5. Complete release acceptance: full-report OCR extraction when tables collapse to one line, RC same-origin clinical-runtime gateway so physician/assistant flows do not depend on direct `workers.dev` reachability, permission changes, CSV export, synthetic user deletion/login failure, post-deploy smoke, production invariant.
6. Patient Record v2 runtime adapter and RC-only migration rehearsal.
7. Shared medication selector + dose schema across Type 2, Care Team, medication reconciliation and physician Final Plan.
8. Physician Final Plan + medication/investigation orders + Care Team fulfillment: signed encounter-scoped plan, payer-code snapshots, Lab Master order keys, and order-to-result linking.
9. Engine REQUEST_INVESTIGATION integration: only explicit approved missing-data rules may suggest a test; physician acceptance/sign-off remains required.
10. Focused Workflow optional Patient step.
11. Longitudinal timeline/trends including pending/completed investigation orders and What changed since last visit.
12. Integrated clinical domain engines, dose/action engine, then cost/insurance engine.

No item in this queue authorizes a production deployment or PR merge by itself.
