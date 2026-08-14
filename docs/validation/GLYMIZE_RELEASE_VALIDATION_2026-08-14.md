# GLYMIZE Release Validation — 2026-08-14

## Scope
This release candidate consolidates the validated Decision Graph v2 clinical engine, the accepted UI/UX Command Center changes, and secure physician password setup/login wiring.

## Clinical engine closure
Final local gate before release consolidation:
- Contracts build: PASS
- Clinical engine typecheck: PASS
- Decision Graph targeted regressions: 12/12 PASS
- Deterministic randomized clinical validation: 10,000/10,000 PASS
- Deterministic randomized financial validation: 10,000/10,000 PASS
- Synthetic stress/property campaign: 275,000/275,000 PASS
- Core regressions: 80/80 PASS
- git diff --check: PASS

Retrospective UCI safety/data-sufficiency benchmark:
- Evaluated type-2-or-unspecified-compatible patient-derived cases: 4,629
- DKA-coded urgent routing: 469/469
- Hyperosmolarity-coded urgent routing: 197/197
- Insufficient-data fail-safe: 3,969/3,969
- Crash-free execution: 4,629/4,629
- HHS schema coverage gap after explicit crisis contract: 0

These results are safety/regression evidence, not proof of therapeutic accuracy or autonomous diagnosis.

## Final known engine debts closed
- Missing glycemic data fail-closed behavior
- DKA urgent precedence with missing glycemic context
- Explicit HHS/mixed acute-crisis routing
- Independent CKD/HF/ASCVD organ-protection objectives at A1C target
- Selected-brand missing-price fallback to valid generic/reference cost
- insured-only access integrity
- malformed/adversarial numeric cost inputs

## Data governance
Patient-level UCI JSONL files and the raw UCI ZIP are intentionally excluded from source control.
Only the reproducibility builder and aggregate summary are included.

## Password authentication
Release candidate enables:
- PBKDF2-SHA256 credential hashing with random salt
- 600,000 iterations
- authenticated first password setup
- current-password verification for subsequent changes
- revocation of other refresh sessions after password change
- password capability discovery in `/v1/platform-v3`
- password login rate limiting (existing runtime implementation)

Production activation requires D1 migration `0002_password_auth.sql` before deploying the new Worker version.

## Online-release policy
No merge to `main` is performed by the consolidation script.
The release is first pushed to a dedicated release branch and opened as a draft PR for Cloudflare preview testing.