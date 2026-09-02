# P5-B1 Provider Directory RC acceptance — 2026-09-02

Status: **RC implementation checkpoint PASS; public activation remains OFF.**

## Traceability

- Branch: `feat/provider-directory-v1-20260902`
- Implementation commit: `936706a`
- Pull request: [#19](https://github.com/abbaselotfi/GLYMIZE/pull/19)
- Stacked base: P5-A branch from PR #18
- RC Worker version: `871158f1-cda0-4db3-94df-d2c4db6060f3`
- RC Worker URL: `https://glymize-rc-portal-staging.abbaselotfi.workers.dev`

## Roadmap scope accepted

- Provider profiles are practice-scoped through the physician's composite
  practice membership and do not change global patient-account ownership.
- Profiles start hidden and require an explicit publish operation.
- Public listing and detail reads require an active physician user, active
  physician membership, verified IRIMC identity and published profile.
- Medical council code publication is separately opt-in.
- Public responses use an allowlisted projection and contain no email, mobile,
  permission, admin-only or clinical fields.
- Search supports bounded name, specialty, subspecialty, practice display name
  and opted-in medical council code matching through prepared bindings.
- Save, hide and publish mutations are practice-scoped and auditable.
- Losing IRIMC verification immediately removes a published profile from public
  reads and prevents republishing.
- Directory discovery creates no referral, care relationship or clinical-data
  grant. `patient_registry` remains the authoritative practice-local record.

## RC database and runtime evidence

Migration `0011_provider_directory_foundation.sql` was applied to the isolated
RC D1 database. Wrangler reports no pending migration. Post-migration evidence:

- provider profiles: `0`
- `PRAGMA foreign_key_check`: no violations

The deployed RC Worker reports:

```json
{
  "providerDirectory": false
}
```

An unauthenticated provider listing fails closed with
`403 provider_directory_disabled`. Exact-origin CORS preflight from
`https://rc.glymize.ir` returns `204` with an empty body.

## Automated and local runtime evidence

- Repository typecheck: PASS (`7/7` tasks)
- Production build: PASS (`5/5` tasks, `32` static routes)
- Admin Worker tests: PASS (`20` files, `138` tests)
- Clinical Engine tests: PASS (`23` files, `196` tests)
- GitHub Actions runtime validation: PASS
  ([run `33629077155`](https://github.com/abbaselotfi/GLYMIZE/actions/runs/33629077155))
- Complete local D1 migration chain `0001` through `0011`: PASS
- Local D1 foreign-key check: PASS
- Authenticated local save/hide/publish/search/detail flow: PASS
- Audit target/action verification for save/hide/publish: PASS
- IRIMC verification-loss public-removal and republish rejection: PASS
- `git diff --check`: PASS

The first concurrent Worker regression run had one existing scrypt test exceed
its five-second timeout while contending with a production build. The unchanged
credential suite passed immediately when rerun alone (`20/20` files,
`138/138` tests); this was resource contention rather than a product failure.

## Isolation and remaining release gates

- `main` was not changed or merged.
- Production Worker, D1, Pages and configuration were not changed.
- No RC provider data was inserted; only the additive schema was applied.
- `PROVIDER_DIRECTORY_ENABLED=false` remains server-authoritative in RC.
- No Pages deployment was needed because P5-B1 adds the service/client
  foundation and no user-facing directory route.
- PR #19 is intentionally stacked on PR #18 and must not merge ahead of its
  dependency.
- GitHub Actions validation passed; PR/dependency review and a separate
  activation decision remain required before any production migration or
  public enablement.

The next Roadmap task is P5-B2: a practice-scoped, unpredictable, hashed,
expiring, revocable, bounded-use and audited Referral Service/QR contract. Code
knowledge alone must not grant record access; redemption will feed the explicit
care-relationship request flow.
