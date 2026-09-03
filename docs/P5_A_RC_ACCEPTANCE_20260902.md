# P5-A RC acceptance — 2026-09-02

Status: **RC implementation checkpoint PASS; production activation remains OFF.**

## Traceability

- Branch: `feat/patient-global-account-v1-20260901`
- Implementation commit: `a0f1827`
- CORS preflight correction: `955de69`
- RC Worker version: `241756ae-e628-420f-b3a6-404327599791`
- RC Pages deployment: `cd7f92cb` on branch `p5-a-rc`
- RC visual URL: `https://p5-a-rc.k1lqjcpcsjdfs4xtzkegqe.pages.dev`

## Roadmap scope accepted

- Patient and physician/assistant landing entries are separate.
- `/portal` uses a patient-only shell and never initializes the clinician
  runtime session or navigation.
- The canonical patient account is global and has no practice ownership.
- National-ID/password authentication uses protected lookup material,
  versioned credentials, generic failures and independent account/IP limits.
- Account creation and practice-local record linking remain separate.
- A legacy record link requires explicit practice scope, review provenance and
  physician/admin confirmation; it never creates a `care_relationship` or
  changes `patient_registry`.
- A verified link may exchange into the existing Portal without inheriting the
  legacy temporary-password requirement. Its auth source survives refresh and
  revocation invalidates exchanged sessions.
- Refresh-token families detect replay and consume the parent before issuing a
  child, including the runtime, Portal and patient-account session families.
- OTP persistence is provider-neutral, contains no plaintext destination or
  code, and has bounded expiry/attempt metadata. No SMS delivery or OTP route
  exists yet.
- Admin surfaces expose server-authoritative capability state and reviewed-link
  controls; they do not present local fake toggles.

## RC database and runtime evidence

Migrations `0006` through `0010` were applied in order to the isolated RC D1
database. Wrangler reports no pending migration. Post-migration counts were:

- patient accounts: `0`
- reviewed legacy links: `0`
- OTP challenges: `0`

The deployed RC Worker reports:

```json
{
  "patientIdentityV2": false,
  "selfRegistration": false,
  "smsOtp": false,
  "recordLinking": false
}
```

An unauthenticated Patient Identity session request fails closed with
`patient_identity_disabled`. The exact Pages Preview origin passes CORS
preflight with `204` and receives the same OFF capability response.

## Automated and visual evidence

- Repository typecheck: PASS (`7/7` tasks)
- Production build: PASS (`5/5` tasks, 32 static routes)
- Admin Worker tests: PASS (`19` files, `132` tests)
- Clinical engine tests: PASS (`23` files, `196` tests), including the complete
  deterministic randomized and stress campaigns
- `git diff --check`: PASS before the implementation checkpoint commit
- Credential/private-key pattern scan: no committed secret detected
- 1440x1100 headless visual check: landing entry separation, assets, RTL layout,
  patient shell and legacy Portal fallback rendered correctly

## Isolation and remaining release gates

- `main` was not changed.
- The production Worker and its database/configuration were not changed.
- The Cloudflare Pages deployment is a Preview deployment; the Pages production
  deployment and `rc.glymize.ir` custom-domain deployment were not replaced.
- P5-A public capabilities remain OFF until a separate activation decision.
- PR CI/review and manual stakeholder review of the Preview URL remain required
  before merge. Merge/production rollout is not part of this checkpoint.

After that gate, the next roadmap workstream is P5-B: provider discovery,
referral and the explicit care-relationship lifecycle. P5-B must build on the
global account boundary without moving practice ownership out of
`patient_registry`.
