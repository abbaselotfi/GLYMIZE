# Catalogue Persistence Decision

- Status: **Proposed — awaiting owner confirmation** (implementation is a separate owner-confirmed task)
- Date: 2026-09-04
- Roadmap reference: §8.26 and Phase 0 / Task 9; context §8.14; boundary set by [Runtime of Record](RUNTIME_OF_RECORD.md)
- Scope: production persistence model for the medication catalogue only. This decision changes no runtime behavior and implements no migration.

## 1. Current facts (measured in the repository)

| Fact | Value |
| --- | --- |
| Reference catalogue (`global-reference-catalog/presentations.ts`) | 104 presentations, 9 sources (SHA-256 pinned in Task 7) |
| Published admin catalogue (`apps/web/public/data/admin-catalog.json`) | 893,087 bytes (~0.87 MB) |
| Clinician market asset (`glymize-clinician-market-v2.json`) | 30,486,959 bytes (~29 MB) — 7,066 products, 349 generics, 3,508 presentation summaries, 2,300 insurance records (generated 2026-08-12 by the three-source consensus pipeline) |
| Catalogue tables in D1 (`GLYMIZE_DB`, `glymize-runtime`) | **None.** All 18 migrations are patient/platform concerns |
| Catalogue writes | Authenticated Worker `POST /catalog/publish` validates and commits the single `CATALOG_PATH` file to GitHub `main`; Git history is the publication record |
| Catalogue reads | Static browser-owned routes over repository seeds + the published JSON snapshot; the clinical engine evaluates against this projection client-side |
| Editing safety | Local admin edits are device-local browser drafts (`glymize-browser-catalog-v2`), explicitly not a shared source of truth |
| PostgreSQL foundation | 5 unchecked migrations exist, including `004_reference_catalogue_staging.sql` and `005_iran_drug_data_pipeline.sql` |
| Roles | Practice-scoped `editor`/`approver` RBAC shipped in migration `0018`; the current catalogue publisher exception is documented in Task 6 |

## 2. Constraints the decision must satisfy

1. **Iranian catalogue size and growth:** ~7k products today; plausible full-market coverage plus Phase 4 cardiac/renal/hypertension/lipid additions stays in the low tens of thousands of records (a few tens of MB of rows).
2. **Edit frequency:** Iranian price and insurance churn is frequent (weekly/monthly), plus bulk consensus-pipeline imports. Record-level updates, review history, and rollback-at-record are required by §8.14.
3. **Portal and platform growth:** the patient portal and scheduling live on the same Worker/D1 platform (default-off); catalogue persistence should consolidate onto the platform that already owns authenticated writes.
4. **Clinical determinism invariant:** the client-side engine must keep reading a stable, versioned catalogue projection. Whatever stores the editing truth must also produce that artifact atomically.
5. **Engineering invariants:** one authenticated write path (`apps/admin-worker`), approved-only rule activation, de-identified patient data. Cloudflare-first operations; no new provider without a scale justification.

## 3. Options

### Option A — Permanent Git-JSON operation (status quo)

Keep `admin-catalog.json` and the market JSON as the only persistence; Git history remains the audit trail.

- **Strengths:** zero infrastructure; deterministic, versioned, CDN-served reads; tooling already works; strongest possible audit (every publish is a signed commit).
- **Weaknesses:** whole-file commits make record-level rollback and review history manual; concurrent editors are unsafe on one blob; no server-side querying (the browser filters ~7k products); every market refresh re-commits a ~29 MB file; publication is coupled to a Pages build; multi-editor drafts have no shared staging.
- **Verdict vs constraints:** acceptable at today's size, degrades directly as edit frequency and multi-editor work grow. Fails the §8.14 record-level requirements structurally.

### Option B — D1 consolidation with a generated Git-JSON read artifact (recommended)

Make `GLYMIZE_DB` the authoritative editing/publishing store for the catalogue; keep the Git-committed JSON as the generated read artifact.

- Shape (proposal, not implementation): normalized catalogue tables plus an append-only `catalog_revisions` history and a `catalog_publications` snapshot table; editor/approver RBAC from `0018` applied to catalogue routes; approval triggers an atomic export that validates and commits the existing `CATALOG_PATH` JSON (and market artifacts) to GitHub exactly as today.
- **Strengths:** record-level history, rollback, and safe concurrent editing; SQL querying for admin and Evidence Assistant; co-located with the platform that already owns patient/encounter truth and RBAC; keeps the deterministic static read path and the Git audit boundary for publications; 7k→70k products is trivial against D1 limits; no new provider, secrets surface, or network hop.
- **Weaknesses:** SQLite-dialect SQL (no native JSONB/RLS); adds an export step that must be equivalence-tested; D1 limits (10 GB/db) must be respected as the market asset grows — comfortably far today.
- **Verdict vs constraints:** satisfies all five constraints with the least new operational surface.

### Option C — PostgreSQL completion

Stand up the `infra/postgres` foundation (including catalogue staging and the Iran drug pipeline schema) as the catalogue authority, likely behind Hyperdrive from the Worker.

- **Strengths:** richest ecosystem (RLS, JSONB, tooling); matches §8.14's original wording and the Phase 8 production-backend target; staging/pipeline schema already drafted.
- **Weaknesses:** introduces a second database plus provider selection, credentials, secrets, networking, backup/DR, and cost before any patient-side need exists; splits authenticated writes across two stores today; current scale does not justify it (7k products).
- **Verdict vs constraints:** strong eventually, premature now. Revisit at Phase 8 when multi-tenant patient data, RLS, and analytical workloads arrive.

## 4. Evaluation against the §8.26 axes

| Axis | A. Git-JSON permanent | B. D1 consolidation | C. PostgreSQL |
| --- | --- | --- | --- |
| Actual Iranian catalogue size (7k products, 29 MB asset) | Marginal (browser-heavy, blob churn) | Comfortable | Over-provisioned |
| Edit frequency (price/insurance churn, bulk imports) | Weak (whole-file commits) | Strong (record-level, transactions) | Strong |
| Portal/platform growth | Weak (detached from patient platform) | Strong (same Worker/D1 authority) | Strong, but second store |
| Clinical read determinism | Native | Preserved via atomic export | Requires export step too |
| Invariants (single write path, audit) | Kept | Kept (D1 authority + Git publication record) | Kept, but split surface |
| New operational cost/risk | None | Low | High |

## 5. Decision

**Recommend Option B — D1 consolidation.** `GLYMIZE_DB` becomes the catalogue's editing and publishing authority; the Git-committed JSON remains the generated, versioned read artifact produced atomically at publication, so the browser/clinical read path and the Git publication audit are preserved unchanged. Permanent Git-JSON (A) is rejected as the *editing* authority because it structurally cannot provide record-level review history, rollback, or concurrent editing. PostgreSQL (C) is deferred to the Phase 8 owner-confirmed foundation, where its RLS and multi-tenant features are actually needed.

## 6. Consequences and explicit non-goals

- **No migration, table, Worker change, or configuration change is implemented in this task.** Implementation requires a later owner-confirmed task with: new D1 migrations, catalogue route RBAC wiring, the atomic export/equivalence step (byte-compare of the published JSON against the D1-derived projection), editor/approver tests, and a documented rollout order.
- The Task 6 publisher exception for `POST /catalog/publish` remains until catalogue RBAC wiring replaces it.
- The clinical engine continues to read the static projection; Phase 3 Tasks 1–2 are unaffected.
- If the owner rejects Option B, Option C (PostgreSQL) is the alternative to decide next; Option A remains the fallback default and the current working model until any implementation task is confirmed and merged.

## 7. Verification anchors

- Runtime boundary being decided: [Runtime of Record](RUNTIME_OF_RECORD.md) — "Medication catalogue boundary"
- Publication path: `apps/admin-worker/wrangler.jsonc` (`CATALOG_PATH`, `GITHUB_REPOSITORY`, `GITHUB_BRANCH`) and `apps/admin-worker/src/index.ts`
- Read path: `apps/web/lib/api-client.ts` and `apps/web/public/data/*`
- Market scale facts: `apps/web/public/data/glymize-clinician-market-v2.meta.json`
- Postgres foundation being deferred: `infra/postgres/004_reference_catalogue_staging.sql`, `infra/postgres/005_iran_drug_data_pipeline.sql`
- RBAC to be reused: `apps/admin-worker/migrations/0018_patient_access_rbac.sql`
