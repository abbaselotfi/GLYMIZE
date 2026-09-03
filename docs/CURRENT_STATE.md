# GLYMIZE Current State

Snapshot date: 2026-09-03

This document is a factual repository snapshot, not a product promise or replacement for the ordered [Project Overview and Roadmap](PROJECT_OVERVIEW_AND_ROADMAP.md). It describes code, routes, tests, migrations, workflow configuration, and default feature flags present in the repository. It does not assert that an uninspected remote environment has been deployed or activated.

For runtime ownership, see the accepted [Runtime of Record](architecture/RUNTIME_OF_RECORD.md).

## Generated repository inventory

Run `node scripts/generate-current-state.mjs` from the repository root to reproduce this block.

<!-- current-state:generated:start -->
| Repository fact | Count |
| --- | ---: |
| Web App Router entries | 27 (27 pages, 0 route handlers) |
| Automated test files | 65 (60 JS/TS, 5 Python) |
| SQL migration files | 23 (18 Worker/D1, 5 PostgreSQL foundation) |
<!-- current-state:generated:end -->

The counts are file inventory, not a claim that every route or migration is active in production. JS/TS test files include Vitest and Playwright files; Python tests cover the Iran drug-data tooling.

## Implemented

### Product surfaces

- A bilingual Next.js application with landing, account, dashboard, profile/security, Type 2, Type 1, pregnancy, Care Team, patient archive, patient portal, portal review, Evidence Assistant, insulin tools, and multi-page admin surfaces.
- App-shell session restoration and permission-aware navigation for physician and assistant users, plus a standalone patient boundary for `/portal`.
- GitHub OAuth owner authentication for central catalogue publication and runtime-account authorization for permitted admin surfaces.
- PWA manifest generation, service-worker registration, offline/version handling, and responsive Persian RTL / English LTR presentation.

### Clinical and medication capabilities

- Client-side Type 2 assessment and ranked medication-scenario output from `@glymize/clinical-engine`, including explanation, market, insurance, cost, and safety context.
- An insulin-regimen conversion workspace with direction-specific supported paths, dose arithmetic, explicit blocked conversions, warnings, and clinician-review framing.
- Versioned rule-pack, evidence registry, lab registry/parser, patient-document parser, decision-graph-v2, dose, cost, insurance, inventory, regimen, and investigation primitives in the clinical-engine package.
- A repository-published medication catalogue projection, browser draft/edit workflows, normalized import and master-registry review surfaces, and a Worker-only central publish command that commits the validated catalogue JSON to GitHub.

### Patient and practice runtime

- A Cloudflare Worker entry point that combines admin publishing with runtime authentication, profile/team management, Evidence Assistant, Patient Record v2, portal, provider, referral, relationship, practice-context, and scheduling route modules.
- D1 migrations through `0018`, including runtime accounts, longitudinal patients and encounters, immutable snapshot revisions, patient portal sessions, additive global patient identity, provider/referral/relationship foundations, practice contexts, availability, slot holds, appointments, appointment policy snapshots, and practice-scoped patient-access roles.
- Patient Record v2 practice-scoped resolve/create, identifier attachment, monotonic file-number allocation, Care Team atomic intake, encounters, snapshot revisions, observations, archive, and workspace reads.
- Request-time `editor`/`approver` authorization on patient-adjacent Worker routes, with existing fine-grained permissions retained as a second gate and self-approval denied for encounter and reviewed legacy-link changes.
- Care Team OCR/manual intake and reviewed handoff creation, explicit create/update intent, duplicate-code guard, optimistic revision conflict handling, and actionable Runtime failure messages.
- A practice-local patient registry remains the clinical record. Global patient identity and verified legacy links are additive and do not replace or silently merge practice-local records.
- Legacy `patient_handoffs` reads and explicit promotion remain for compatibility; its create/update routes are retired.

### Engineering controls

- Repository-wide TypeScript typechecking, Biome linting, Vitest suites, a 275,000-case deterministic clinical stress campaign, and Playwright coverage for four critical web journeys.
- Every pull request targeting `main` runs frozen install, typecheck, lint, unit/stress tests, and the critical Playwright flows.
- The five previously oversized modules identified in roadmap §8.24 now expose compatibility façades over cohesive archive, portal-media, generated-catalogue, Care Team form-model, and browser-catalogue state modules, with equivalence tests.
- GitHub Pages build/deploy automation and a separately deployable Wrangler Worker package.

## Partial or disabled by default

- Patient Identity v2, provider directory, referral service, care relationships, multi-practice patient contexts, scheduling availability, slot discovery, slot locking, and booking have schema/contracts/runtime tests, but their corresponding Worker feature flags are absent or false in the checked-in Wrangler configuration. Their RC checkpoints do not by themselves mean production activation.
- The patient portal runtime exists but `PATIENT_PORTAL_V1_ENABLED` is `false` in the checked-in Worker configuration.
- Type 1 and pregnancy pages provide informational/checklist and catalogue surfaces; they are not complete autonomous treatment pathways.
- Evidence Assistant is isolated from clinical-engine decisions (`engineInfluence: "none"`), and generated-model operation depends on configured runtime providers and secrets.
- Scheduling stores provider-neutral financial snapshots; no payment processor integration is claimed.
- The NestJS `apps/api` service remains local-development-only compatibility code with in-memory state and no repository production deployment.
- PostgreSQL migrations are an architecture foundation, not the current patient/encounter runtime record.

## Planned in the canonical execution order

- Phase 0 Tasks 8–9: CSS consolidation and the catalogue-persistence ADR.
- Phase 3 Tasks 1–5: trace the live Type 2 call path, converge on decision-graph-v2, remove independent threshold duplication, make hard contraindications structural exclusions, and improve product/dose evidence indexing.
- Phase 4 Tasks 6–10: verified multi-domain inventory, sourced blood-pressure/lipid objectives and product-dose rules, scenario-diversity acceptance, and extended stress validation.
- Patient Care Hub work after the completed P5-C scheduling checkpoint remains subject to its own feature gates, security review, and release acceptance.
- Production clinical use, legal/regulatory readiness, operational monitoring, backup/recovery, and formal clinical validation remain outside the claims of this snapshot.

## Safety status

GLYMIZE remains pre-clinical decision-support software under active development. Implemented output must not be interpreted as autonomous diagnosis or prescribing, and features that are present behind default-off flags must not be described as deployed or available without separate environment evidence.

