# P5-B1 — Provider Directory foundation

Status: additive implementation checkpoint; runtime activation remains OFF.

## Scope

P5-B1 introduces a patient-safe provider profile and search boundary. It does
not create referral credentials, care relationships, appointments or clinical
authorization. `patient_registry` remains the authoritative practice-local
clinical file and is not altered by migration `0011`.

The ownership boundary is:

```text
runtime physician
  -> active physician membership in a practice
  -> practice-scoped provider profile
  -> explicitly published patient-safe projection
```

A directory result is discovery metadata only. Finding or viewing a provider
never grants access to a patient record and never links a global patient
account to a practice.

## Decisions

1. A provider profile is scoped to `(practice_id, physician_user_id)` because a
   clinician's public practice details can differ between memberships.
2. The composite foreign key points to `practice_memberships`; public reads
   additionally require active physician membership, an active physician user
   and verified IRIMC identity. Unverified profiles may be saved only as hidden.
3. `practice_display_name` and `public_location` are explicit public fields.
   The service does not expose internal practice metadata by default.
4. Profiles start `hidden`. Publication and hiding require separate,
   explicitly confirmed operations. `suspended` is reserved for platform
   enforcement and cannot be overridden by the physician endpoints.
5. Medical council code disclosure is opt-in per profile.
6. Public queries project an allowlist only: display name, specialty,
   subspecialty, public practice/location, visit modes, languages, optional
   medical council code and publication timestamp.
7. Search text and result limits are bounded and passed only as D1 prepared
   statement bindings.
8. Profile save/publication/hiding are recorded in `audit_log`.
9. `PROVIDER_DIRECTORY_ENABLED` is the independent fail-closed runtime gate and
   defaults to false when absent.

## HTTP boundary

- `GET /v1/provider-directory/capabilities` — always available, exposes only
  the server-authoritative feature state.
- `GET /v1/provider-directory/providers` — published-provider search/list.
- `GET /v1/provider-directory/providers/:id` — published patient-safe view.
- `GET|PUT /v1/provider-directory/manage/profile` — authenticated physician's
  profile for the current practice membership.
- `POST /v1/provider-directory/manage/profile/publish` — explicit publish.
- `POST /v1/provider-directory/manage/profile/hide` — explicit hide.

All routes other than capabilities fail closed while the feature flag is OFF.
Cross-origin preflight is accepted only for the exact configured runtime
origin allowlist.

## Explicitly deferred to subsequent P5-B tasks

- unpredictable, hashed, bounded-use, expiring and revocable referral code/QR;
- global-patient-to-practice `care_relationship` lifecycle;
- condition/service discovery filters;
- availability, appointment, insurance and fee projections;
- public activation and production rollout.

Referral redemption in P5-B2 must request or create a care relationship; it
must not treat directory discovery or referral-code knowledge as clinical
authorization.

## Rollout gates

1. Apply migration `0011` to an isolated local D1 and validate the complete
   migration chain.
2. Pass contracts, Worker, web and repository checks.
3. Apply only to the isolated RC D1 with `PROVIDER_DIRECTORY_ENABLED=false`.
4. Deploy only the RC Worker and verify capability/preflight/fail-closed
   behavior.
5. Keep Production schema/runtime/configuration untouched until the stacked
   P5-B review chain and activation decision are complete.
