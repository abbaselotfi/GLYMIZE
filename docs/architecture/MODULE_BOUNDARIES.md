# Oversized-module decomposition

Status: accepted for Phase 0 / Task 7 on 2026-09-03.

This refactor establishes the first cohesive boundaries inside the five modules
identified by `PROJECT_OVERVIEW_AND_ROADMAP.md` §8.24. Public entry points remain
compatibility façades; consumers do not need import-path changes.

| Public entry point | Extracted responsibility | New module |
| --- | --- | --- |
| `platform-patient-record-v2.ts` | route context contract | `patient-record-v2/context.ts` |
| `platform-patient-record-v2.ts` | archive query, cursor and projection | `patient-record-v2/archive.ts` |
| `platform-patient-portal.ts` | media signatures, hashing, extension and cleanup | `patient-portal/media-policy.ts` |
| `global-reference-catalog.ts` | generated presentation records | `global-reference-catalog/presentations.ts` |
| `global-reference-catalog.ts` | source records | `global-reference-catalog/sources.ts` |
| `care-team-client.tsx` | form defaults, normalization and draft fingerprinting | `care-team-form-model.ts` |
| `api-client.ts` | browser catalogue persistence and publish batching | `catalog/browser-catalog-state.ts` |

The original public exports are preserved: Patient Record v2 still exports its
route and context type, Portal still exports its session exchange and route,
the reference-catalogue façade exports both arrays, Care Team retains its
default component, and `api-client.ts` retains `apiFetch`, publish batching,
diagnostics, and its two public state types.

Equivalence tests execute the extracted pure behavior and keep existing
source-contract suites pointed at the responsible module. The generated global
catalogue arrays were compared with `main` byte for byte and retained identical
SHA-256 hashes. No clinical values, catalogue records, UI strings, routes,
feature flags, or runtime contracts changed.
