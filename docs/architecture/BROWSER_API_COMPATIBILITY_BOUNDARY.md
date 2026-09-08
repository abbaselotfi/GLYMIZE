# Browser / API compatibility boundary

## Status

Accepted engineering boundary for the current GLYMIZE runtime topology.

## Runtime ownership

The static/browser application is the current owner of browser-resident catalogue and Type 2 adapter routes. `apps/api` remains a local-development-only NestJS/Fastify compatibility service and is not a production runtime authority.

Contract equivalence therefore does **not** mean that every browser response must be byte-for-byte identical to every NestJS response. The browser may legitimately enrich catalogue state with published data, approved Master Registry records, local draft state, or other browser-owned runtime inputs that the in-memory compatibility service does not own.

## Authorities that must remain equivalent

The following immutable/shared authorities must not fork between Browser and NestJS compatibility code:

- ADA 2026 Type 2 generic seed data from `@glymize/catalog-data`;
- Type 2 protocol seed data from `@glymize/catalog-data`;
- global reference catalogue and reference-source records from `@glymize/catalog-data`;
- active guideline-source registry from `@glymize/clinical-engine`;
- active clinical rule-pack identity and source-version metadata from `@glymize/clinical-engine`;
- physician-facing Type 2 clinical assessment authority from the shared clinical engine rather than an independently reimplemented NestJS algorithm.

`apps/api/test/shared-authority-contract.test.ts` guards the immutable catalogue/guideline portion of this boundary. Existing clinical-engine Type 2 authority/parity tests guard the shared assessment boundary.

## Intentional divergence

The following differences are expected and must not be normalized merely to make tests pass:

- Browser catalogue routes may include published/browser state and approved Master Registry enrichment.
- Browser local draft and admin-preview storage are browser-owned compatibility mechanisms.
- NestJS catalogue edits are process-memory compatibility behavior and are not durable publication authority.
- Worker-backed patient, identity, portal, scheduling, referral, and practice routes are not NestJS equivalence targets.

## Regression rule

When a route exists in both Browser and NestJS compatibility surfaces, first identify its authority. Add an equivalence assertion only for data or clinical semantics that are intentionally shared. Do not assert transport equality for state that belongs to different runtime owners.
