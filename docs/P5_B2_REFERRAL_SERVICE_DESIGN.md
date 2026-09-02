# P5-B2 — Referral Service and QR contract

Status: additive implementation checkpoint; runtime activation remains OFF.

## Scope

P5-B2 adds a secure, practice-scoped referral credential and a patient-account
redemption record. Redemption expresses intent to connect and remains
`pending_care_relationship`; it never creates a clinical-data grant, links a
practice-local record or changes `patient_registry`.

```text
authorized practice member
  -> one-time plaintext referral credential
  -> keyed hash + bounded lifecycle in D1
  -> authenticated global patient redemption
  -> pending input for P5-B3 CareRelationshipService
```

## Credential decisions

1. Codes contain 144 random bits and use the versioned `GLY1_` format.
2. Plaintext is returned only in the successful issuance response. D1 stores a
   keyed HMAC-SHA-256 lookup hash and a non-secret four-character hint.
3. `REFERRAL_CODE_LOOKUP_SECRET` is independent from session and patient
   identity secrets. `REFERRAL_CODE_LOOKUP_SECRET_PREVIOUS` supports bounded
   rotation; the previous secret must remain only until all codes created under
   it have expired or been revoked.
4. QR payloads use a URL fragment (`#referral=`), so the credential is not sent
   in the initial HTTP request path or referrer. The web client later submits it
   to the Worker in a JSON request body.
5. Every code is practice-scoped, tied to one intended physician and the
   `provider_connection` workflow, expiring, revocable and limited to 1–100
   unique patient-account redemptions. Maximum lifetime is 30 days.
6. Issuance requires a physician or an assistant with `referrals.manage`. The
   intended physician must have active membership, verified IRIMC identity and
   a published provider profile at issuance.
7. Safe provider display/specialty/practice values are snapshotted at issuance.
   Hiding a profile does not invalidate a direct invitation, but suspension,
   inactive membership/user or loss of IRIMC verification does.
8. Runtime-user hard deletion is disallowed while referral provenance exists;
   the established identity-purge path preserves the audit relationship.
9. The optional purpose label is patient-visible metadata. Callers must keep it
   generic and must not place patient identifiers or clinical details in it.

## Redemption and race safety

- Inspection is anonymous but returns only the safe snapshot and uses one
  generic unavailable response for malformed, unknown, expired, revoked or
  exhausted credentials.
- Redemption requires an active global patient session and explicit patient
  confirmation. Unverified or pending accounts may create a pending request,
  but rejected identities may not.
- `(referral_id, patient_account_id)` is unique, making retries idempotent.
- D1 batch execution inserts the redemption first, increments capacity only if
  that exact redemption exists, marks the invite exhausted at its bound, and
  writes practice audit plus patient security events atomically.
- Discovery or code knowledge alone never grants clinical authorization.
- Issuance, anonymous inspection and redemption use independent keyed rate
  limits. No plaintext code is written to audit metadata.

## HTTP boundary

- `GET /v1/referrals/capabilities` — server-authoritative feature/dependency
  state.
- `POST /v1/referrals` — authorized issuance; plaintext code/QR returned once.
- `GET /v1/referrals` — bounded practice-scoped management list without hash or
  plaintext credential.
- `POST /v1/referrals/:id/revoke` — explicit, auditable revocation.
- `POST /v1/referrals/inspect` — rate-limited patient-safe inspection.
- `POST /v1/referrals/redeem` — authenticated, idempotent bounded redemption.

`REFERRAL_SERVICE_ENABLED` defaults to false. Patient redemption is reported
available only when both Referral Service and Patient Identity v2 are enabled.

## Explicitly deferred to P5-B3

- creation and lifecycle of `care_relationship`;
- physician/practice acceptance or rejection of a connection request;
- optional linking to a practice-local `patient_registry` row;
- clinical authorization derived from an active relationship;
- multi-practice relationship views.

P5-B3 must reference the immutable redemption provenance and must not infer
authorization merely from a valid or previously redeemed code.

## Rollout gates

1. Validate migrations `0001` through `0012` on isolated local D1.
2. Exercise issue/inspect/redeem/exhaust/revoke and concurrent/idempotent paths
   locally with test identities only.
3. Pass repository tests, typecheck, build and secret-pattern checks.
4. Apply migration `0012` only to RC and deploy with
   `REFERRAL_SERVICE_ENABLED=false`.
5. Keep lookup secrets unset while the feature is OFF; configure through
   Wrangler secrets only immediately before a separate activation exercise.
6. Keep Production schema, Worker, configuration and data untouched.
