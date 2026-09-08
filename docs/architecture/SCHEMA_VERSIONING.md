# Schema Versioning Policy

- Status: Accepted engineering policy
- Date: 2026-09-08
- Scope: active persisted, public, and runtime transport boundaries

## Decision

GLYMIZE versions schemas at the boundary that owns compatibility rather than adding a version field to every internal TypeScript interface.

| Boundary | Version authority | Compatibility rule |
| --- | --- | --- |
| Cloudflare D1 storage | Ordered SQL migrations in `apps/admin-worker/migrations` | Schema changes require a new migration; deployed tables are never inferred from TypeScript shapes. |
| PostgreSQL foundation | Ordered SQL migrations in `infra/postgres` | Foundation schema changes require a new migration before that runtime can be promoted. |
| HTTP runtime contracts | Major route namespace `/v1` plus contract tests | Breaking transport changes require a reviewed version transition rather than silent response-shape replacement. |
| Published admin catalogue | `schemaVersion` in `admin-catalog.json` | Readers accept only supported versions. Current writer emits v2; legacy v1 remains readable. Explicit unknown versions are rejected. |
| Browser catalogue draft | `schemaVersion` in the local-storage envelope | Current writes use v2. Legacy unwrapped drafts remain readable for migration compatibility; an explicit unknown version is rejected. |
| AI admin local preview | `schemaVersion` in the local-storage envelope | Current writes use v1. Legacy unwrapped model arrays are migrated deterministically on read; malformed and explicit unknown future versions are rejected. Browser persistence never restores `tokenConfigured=true`. Secure Worker-backed AI configuration is unchanged. |
| Worker AI model configuration | `schemaVersion` in the `ai:models:v1` KV value envelope | Current writes use v1. Legacy raw model arrays remain readable as an explicit backward-read path; malformed and explicit unknown future envelopes fail closed. Provider tokens remain separately encrypted under `ai:secret:v1:*` and are never moved into the model envelope. |
| Clinician market index | Runtime payload `schemaVersion: 2` | Loader rejects any other payload schema before indexing products. |
| Clinician market chunk manifest/chunks | `schemaVersion: 1` plus `kind` | Loader validates manifest/chunk version, kind, section identity and counts before reconstruction. |
| Clinician market deployment metadata | `schemaVersion: 1` + `runtimeSchemaVersion: 2` | Metadata is used as a cache/version hint only after version, kind and SHA validation. Invalid metadata cannot bypass validation of the market payload. |
| Clinical rule/evidence bundles | semantic rule-pack/review/evidence versions | Clinical content lifecycle remains governed by approved rule/review versions; this policy does not create or change clinical authority. |

## Non-goals

Ephemeral in-process DTOs, UI component props and helper-only TypeScript types do not receive independent `schemaVersion` fields merely to satisfy a checklist. They inherit the versioned transport or persistence boundary that owns their compatibility. Authentication tokens and encrypted payloads use their existing versioned cryptographic context/kind boundaries and are not converted into public JSON schemas by this policy.

Scalar browser preferences, locale/theme/layout values, build-version markers, practice/context identifiers and access/refresh/admin session tokens are not structured schema envelopes. They remain scalar storage values and are intentionally outside the JSON schema-version contract.

## Reader invariant

A persisted/public payload with an explicit schema version must never be silently interpreted as a different version. Supported historical versions may have an explicit backward-read path. Unknown future versions fail closed at that boundary. Version validation does not relax field-level, clinical, authorization, integrity, or migration checks.
