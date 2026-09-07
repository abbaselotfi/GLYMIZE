# Type 2 UI ownership

Type 2 redesign uses shared GLYMIZE tokens and adaptive layout presets. Presentation changes do not alter clinical authority.

## Module boundary

`type2-v2-client.tsx` and `type2-scenarios-client.tsx` are orchestration surfaces, not destinations for new clinical-input logic. New intake fields, draft models, request projection, and domain-specific panels should be implemented in small responsibility-focused modules and composed by those clients.

Machine-readable input identities live in `@glymize/clinical-engine/type2-input-contract-v2`; UI coverage remains explicit in `type2-input-coverage-v2.ts`. Missing clinical facts stay absent/fail-closed and must not be inferred merely to satisfy UI or capability coverage.
