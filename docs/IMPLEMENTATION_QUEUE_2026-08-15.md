# Implementation queue snapshot — 2026-08-15

Immediate next atomic patches after the roadmap/schema foundation:

1. Assistant invitation public URL: remove hard-coded `/GLYMIZE`; use environment-specific public app URL.
2. Assistant invitation email: enforce Admin `assistantInvitation` policy and validate Resend delivery from `info@glymize.ir`.
3. Assistant identity: set initial password after invitation and support later email/mobile + password sign-in.
4. Diagnose and fix Care Team patient-handoff save failure with explicit runtime error mapping.
5. Complete release acceptance: permission changes, CSV export, synthetic user deletion/login failure, post-deploy smoke, production invariant.
6. Patient Record v2 runtime adapter and RC-only migration rehearsal.
7. Shared medication selector + dose schema across Type 2 and Care Team.
8. Focused Workflow optional Patient step.
9. Longitudinal timeline/trends and physician final prescription.
10. Integrated clinical domain engines, dose/action engine, then cost/insurance engine.

No item in this queue authorizes a production deployment or PR merge by itself.
