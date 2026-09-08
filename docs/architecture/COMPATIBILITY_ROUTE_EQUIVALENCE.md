# Compatibility Route Equivalence Boundary

Status: accepted architecture guard for the current Phase 6 compatibility surface.

## Purpose

The browser-owned catalogue adapter is part of the current static Web runtime, while `apps/api` is a local-development-only NestJS compatibility service. They are not co-equal production authorities. Where both surfaces intentionally expose the same catalogue, guideline, notification, brand-management, Type 2 protocol, or Type 2 assessment route, their route availability must not silently drift.

`apps/web/test/browser-api-route-equivalence.test.ts` therefore guards the shared route surface at source level. The test does not claim repository-wide behavioral equivalence and does not promote `apps/api` to runtime authority.

## Shared route contract

The guard covers the currently shared catalogue/guideline compatibility surface, including:

- catalogue generics;
- reference sources and medication checklist reads;
- medication visibility, insurance, market-data, and brand mutations;
- admin notifications and update-run reads;
- Type 2 protocol seed, physician assessment, and compatibility preview;
- admin generic creation and catalogue import requests;
- guideline source listing and explicit update-check requests.

Existing focused clinical tests continue to own semantic parity for the Type 2 Decision Graph and parallel-safety projection. This route guard only prevents one side of a deliberately shared transport surface from disappearing or being renamed without review.

## Intentional exceptions

The following differences are explicit and are not treated as missing parity:

- `GET /v1/admin/catalog/reference-presentations` remains a NestJS compatibility-only read; the browser runtime derives its active checklist/presentation surface from the browser-owned catalogue state.
- `GET /v1/admin/guidelines/rule-pack` remains a NestJS local-development compatibility read. No active Web consumer was found during the 2026-09-08 Phase 6 audit, so a browser route must not be invented merely to make route counts equal.
- Master Registry and Master Candidate browser routes remain browser-owned catalogue administration surfaces; the local-development NestJS controller does not define them.
- normalized-import preview/apply browser routes remain part of the browser catalogue workflow and are not made NestJS requirements by this guard.

Any future attempt to remove an exception must establish a real consumer and an accepted runtime owner first.

## Safety boundary

This contract changes no clinical threshold, contraindication, dose, ranking, authorization rule, catalogue record, or persistence authority. It is an architecture regression guard only.
