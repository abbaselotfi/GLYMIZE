# GLYMIZE — Insurance API & E‑Prescription Standards Roadmap

Status: Companion standards lane / design-time guardrail
Created: 2026-08-19
Parent roadmap: `docs/GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md`
Normative exchange roadmap: `docs/GLYMIZE_HEALTH_EXCHANGE_READINESS_ROADMAP.md`
Primary release line: `release/glymize-clinical-ui-auth-v1`
Runtime activation: **OFF — no payer/API connection or external prescription submission is enabled by this document**

## 0. Purpose

This roadmap defines the standards and architectural constraints GLYMIZE should respect **now**, while building the clinical platform, so that future Iranian insurer APIs and electronic-prescription integrations can be added without redesigning the patient record, physician identity, medication model, Final Plan, audit model or security boundary.

It is intentionally provider-neutral. Tamin, IHIO, Armed Forces, a Ministry/national exchange, an operator, a HIS/EHR vendor or a commercial e-prescription platform must all enter through adapters. No payer-specific contract becomes the GLYMIZE clinical source of truth.

This document is a companion checklist to the more detailed `GLYMIZE_HEALTH_EXCHANGE_READINESS_ROADMAP.md`. Where they differ, the stricter safety/privacy rule applies.

---

## 1. Permanent architecture rules

1. `Patient`, `Encounter`, `Physician Final Plan`, medication/investigation orders and longitudinal observations are payer-neutral canonical objects.
2. External identifiers are business identifiers, never relational primary keys.
3. Clinical recommendation is not a prescription; physician review/sign-off is a separate event.
4. Local physician sign-off is not automatically equivalent to a future legally recognized electronic signature.
5. External submission state is separate from signed clinical state.
6. Payer/provider DTOs must not enter the Clinical Engine.
7. Browser/PWA code must never hold long-lived payer credentials, signing keys or integration client secrets.
8. Integration capability exists behind feature flags and remains `OFF` until an approved provider path exists.
9. Unknown or timed-out external submission state is `status_unknown`, not success and not automatic retry-as-new.
10. No unsupported Iranian national/payer requirement is guessed; authoritative requirements are captured as versioned external requirements when official documentation is available.

---

## 2. Standards baseline to design against

These standards are **architecture/mapping targets**, not claims of certification and not assumptions that an Iranian payer API will use them.

### 2.1 HL7 FHIR R4 mapping readiness

Keep GLYMIZE canonical models deterministic and FHIR-mappable without storing serialized FHIR as the database schema.

Target conceptual mappings:

- GLYMIZE patient → FHIR R4 `Patient`
- physician professional identity → `Practitioner`
- physician-in-practice role → `PractitionerRole`
- clinic/practice → `Organization`
- visit → `Encounter`
- medication order/prescription → `MedicationRequest`
- laboratory/investigation order → `ServiceRequest`
- measured laboratory/vital result → `Observation`
- coverage/member context → `Coverage`
- eligibility/benefit inquiry → `CoverageEligibilityRequest`
- eligibility/benefit response → `CoverageEligibilityResponse`
- clinical origin/revision/signing history → `Provenance`
- security/access/activity audit → `AuditEvent`
- consent/legal-basis mapping when required → `Consent`

Rules:

- FHIR mapping/version is explicit and testable.
- Provider-specific extensions remain in the connector/mapping layer.
- An Iranian API may be non-FHIR; the connector maps canonical GLYMIZE objects to that provider contract.
- Do not add fields merely because a FHIR resource contains them; add them when GLYMIZE has a credible clinical/exchange use case.

### 2.2 Coding and terminology primitive

Every externally codable concept must be capable of holding multiple codings:

```text
system / namespace
code
version
preferred display
issuer / source
status
validFrom / validTo
mapping version
freshness / provenance
```

Apply this pattern to:

- medication generic and product identity;
- ATC / IRC / NFI and future payer codes;
- laboratory/investigation concepts;
- diagnoses/conditions;
- services/procedures;
- route and dosage form;
- specialty;
- practitioner/provider/facility identifiers;
- insurer/member identifiers.

No payer code, IRC code, ATC code or third-party code becomes the GLYMIZE object identity.

### 2.3 Units and dates

- Preserve source value and source unit.
- Use canonical normalized units where deterministic; prefer UCUM-compatible representation where practical.
- Preserve conversion provenance.
- Do not combine incompatible units/specimens in trends or exchange payloads.
- Store system timestamps as offset-aware ISO 8601 / UTC-normalized values.
- Preserve Persian/Jalali source date/calendar metadata when the source is not yet deterministically converted.

---

## 3. Security and health-information baseline

### 3.1 Security management/readiness

Architecture and engineering evidence should remain compatible with:

- ISO/IEC 27001:2022 — information security management systems;
- ISO 27799:2025 — health information security controls based on ISO/IEC 27002;
- ISO 27789:2021 — audit trails for electronic health records; monitor the newer edition while it is under development;
- OWASP ASVS — application-security verification guidance;
- OWASP API Security guidance — external API boundary threats and controls.

These are readiness/alignment targets only unless GLYMIZE later completes a formal certification/assessment process.

### 3.2 Conditional regulated-software readiness

If intended use/regulatory classification makes them applicable, preserve process evidence compatible with:

- IEC 62304 — medical-device software lifecycle processes;
- ISO 14971:2019 — medical-device risk management;
- IEC 62366-1 — safety-related usability/human-factors engineering;
- ISO 13485:2016 — medical-device quality-management system.

Maintain requirement IDs, design decisions, risk/hazard records, implementation/test traceability, change control and release evidence even before a certification claim exists.

---

## 4. Identity model required before live prescribing

Keep these concepts separate:

- `User` — authentication/account identity;
- `Practitioner` — healthcare professional identity;
- `PractitionerRole` — practitioner acting in a practice/facility/specialty context;
- `Organization/Practice` — care-delivery organization;
- namespace-aware `ExternalIdentifier[]`.

Future insurer/prescription prerequisites may include Medical Council identity, national ID, facility/provider IDs, verified mobile/email or stronger authorization. New fields may be stored when useful, but exchange-specific enforcement remains policy-driven:

- `OFF`
- `OPTIONAL`
- `REQUIRED`

Current GLYMIZE usage must not be blocked by speculative future requirements while exchange features are disabled.

---

## 5. Patient/coverage identity readiness

During Patient Record v2 work:

- preserve random practice-scoped `patient_id` as authoritative;
- allow multiple namespace-aware identifiers over time;
- national ID and practice file number remain lookup identifiers, not primary keys;
- prepare for future payer member/coverage identifiers without replacing existing patient identity;
- encrypt retrievable raw sensitive identifiers;
- use keyed hashes/HMAC for deterministic lookup when appropriate;
- retain issuer/source/verification/validity metadata;
- never expose direct identifiers in analytics/export keys.

`Coverage`/payer context is separate from the patient object and from the signed clinical order.

---

## 6. Canonical prescription readiness

The physician Final Plan and medication/investigation orders must eventually contain enough semantics for deterministic provider mapping.

Medication order readiness includes, where clinically applicable:

- canonical medication/product identity;
- coding snapshot;
- strength/form/route;
- dose amount and unit;
- frequency/schedule;
- duration;
- quantity/quantity unit;
- repeat/refill allowance when later required;
- substitution policy when later required;
- linked clinical reason/diagnosis when available;
- patient/encounter;
- requesting practitioner/role;
- authored/signed timestamp;
- superseded/prior order relation;
- insurer/product/code snapshot at sign-off.

Investigation/service order readiness includes:

- canonical test/service key;
- coding set;
- specimen/context when relevant;
- priority/timing/preparation;
- reason/indication;
- authoring encounter/practitioner;
- insurer/service-code snapshot when available.

Missing codes are represented as unavailable; they are never invented.

---

## 7. Mandatory workflow separation

The workflow boundary must remain:

```text
Engine Recommendation
→ Physician Draft
→ Physician Final Plan
→ Physician Sign-off / Authorization
→ Exchange Submission Request
→ External Acceptance / Registration / Rejection
```

An engine recommendation must never directly trigger payer/e-prescription submission.

Signed clinical content is immutable. Corrections create a superseding plan/order. External retry or reconciliation never silently rewrites the signed physician plan.

---

## 8. Signature/authorization abstraction

Prepare a future `SignatureProof` model containing metadata/proof only:

- authorization/signature method;
- signer practitioner/user/role;
- organization/practice context;
- signed timestamp;
- canonical payload hash;
- authority/provider;
- external proof/reference;
- certificate/key-reference metadata when relevant;
- verification state/timestamp/expiry.

Never store plaintext passwords, reusable OTPs, private keys, raw long-lived tokens or client secrets in the clinical signature record.

---

## 9. Provenance and audit are separate

### Clinical provenance

Record how clinical content came to exist/change:

- manual/import/OCR/source document;
- author/creator;
- human verification;
- rule/engine version;
- mapping/transformation version;
- revision/signing event.

### Security/activity audit

Record access/action events with minimum necessary metadata:

- actor/user/practitioner;
- role/permission context;
- practice/organization;
- patient/encounter/target reference;
- action and outcome;
- timestamp;
- purpose/use context when available;
- session/request/connector/correlation metadata where appropriate.

Do not copy raw clinical payloads, national IDs, OTPs, credentials or tokens into routine logs.

---

## 10. Future `HealthExchangeGateway` contract

All insurer/operator/provider integrations use one provider-neutral boundary.

A connector declares capabilities such as:

- patient/coverage eligibility lookup;
- benefits/coverage inquiry;
- medication/service code lookup;
- prescription submit;
- status query;
- correction/amendment;
- cancellation;
- attachments;
- webhook/callback;
- polling;
- synchronous/asynchronous processing;
- sandbox availability;
- auth/network requirements.

The connector owns provider authentication, provider DTOs, mapping, errors, statuses, retry rules and transport requirements.

Clinical Engine and canonical Final Plan must not import connector DTOs.

---

## 11. API reliability rules

Before any live payer submission implement:

- internal submission ID;
- idempotency key;
- correlation ID;
- provider/connector/environment ID;
- external transaction/prescription ID;
- attempt number;
- canonical payload hash;
- mapping/schema version;
- provider-native and canonical status;
- timestamps;
- append-only attempt/event history;
- `status_unknown` state;
- reconciliation flow;
- cancellation/supersession flow.

Use a transactional outbox pattern:

```text
Signed Final Plan
→ Submission Request
→ Transactional Outbox
→ Connector worker/service
→ External payer/operator
```

Provider outage must not lose or corrupt the physician plan.

---

## 12. Integration security capabilities

The connector layer must be capable of supporting a real provider contract requiring any of:

- TLS-only transport;
- mTLS/client certificate;
- static egress IP / IP allowlist;
- VPN/private network;
- OAuth/OIDC;
- client-credentials flow;
- signed requests;
- short-lived tokens;
- interactive/OTP-backed authorization;
- provider-specific session exchange;
- webhook signature verification.

Do not implement fake versions before the authoritative contract is known.

Permanent secret separation:

```text
auth secret
≠ clinical encryption key
≠ identifier HMAC key
≠ integration client secret
≠ signing/private key
```

Sandbox and production credentials/configuration must be isolated.

---

## 13. What must be respected during the CURRENT Patient Record v2 work

These requirements are active design constraints now, even though payer integration is disabled:

- [ ] Keep `patient_id` and `encounter_id` internal/random and payer-neutral.
- [ ] Do not add payer/provider DTO fields into Patient Record v2 snapshots.
- [ ] Keep multiple patient identifiers structurally separable from the patient master.
- [ ] Design identifier evolution toward namespace/issuer/source metadata.
- [ ] Preserve immutable/revisioned encounters and snapshots.
- [ ] Preserve clinical provenance.
- [ ] Keep observations unit/date/source aware.
- [ ] Keep physician-authored Final Plan separate from recommendations.
- [ ] Keep signed orders immutable/superseding rather than overwriting history.
- [ ] Keep insurer/coding data as snapshots/mappings, not medication identity.
- [ ] Keep Audit and Provenance conceptually separate.
- [ ] Continue additive migrations only (`0003` remains frozen; later changes use `0004+`).

No current P1 item requires a live insurer API.

---

## 14. Placement beside the main product roadmap

### P1 — Longitudinal Patient Foundation

Apply now:

- payer-neutral patient/encounter identity;
- multiple identifier readiness;
- immutable/revisioned encounter history;
- provenance foundations;
- canonical time/unit semantics;
- additive migrations.

### P2 — Data-entry quality

Add/strengthen:

- reusable Coding primitive;
- canonical medication/lab/service identifiers;
- source/verification metadata;
- optional extended Practitioner profile fields where useful.

### P4 — Medication Action / Final Plan

Require:

- provider-neutral medication/investigation orders;
- explicit physician sign-off;
- superseding order history;
- signature-proof abstraction readiness;
- granular permission boundary.

### P5 — Cost & Insurance

Add:

- canonical `Coverage`/payer context;
- eligibility/coverage result model;
- namespace-aware payer/member identifiers;
- mapping registry and code snapshots;
- freshness/provenance/confidence.

No live API is required to complete P5.

### Future PX — Health Exchange / E‑Prescription

Only when a real official/commercial integration path exists:

- HealthExchangeGateway;
- provider connector registry;
- sandbox/production separation;
- idempotent submission state machine;
- transactional outbox;
- reconciliation;
- webhook verification if used;
- provider contract tests;
- legal/privacy/security review;
- controlled production activation.

---

## 15. Iranian external-requirements matrix

When implementation is scheduled, create and maintain a versioned matrix for each authoritative source:

```text
Authority / payer / operator
→ document/API contract version
→ requirement ID
→ mandatory/optional field
→ code system / namespace
→ auth/signature requirement
→ network requirement
→ affected GLYMIZE canonical field
→ connector transformation
→ implementation status
→ test evidence
→ effective/deprecation date
```

Until an authoritative current API/standard is available, mark the requirement `UNKNOWN/PENDING AUTHORITY`, not inferred.

Provider-specific changes should normally require a connector/mapping update, not a rewrite of Patient Record, Clinical Engine or Final Plan.

---

## 16. Definition of done before requesting a real insurer API

Before GLYMIZE starts a live payer/operator onboarding project, verify that:

- [ ] patient/practitioner/facility identities are namespace-ready;
- [ ] canonical clinical IDs are independent of external IDs;
- [ ] Coding/mapping primitive is implemented;
- [ ] medication/investigation orders are provider-neutral and complete enough to map;
- [ ] physician sign-off is explicit and immutable;
- [ ] SignatureProof/strong-auth requirements can be added without redesigning orders;
- [ ] Consent/legal-basis requirements can be represented;
- [ ] Provenance and Audit are separate;
- [ ] granular prescription/exchange permissions exist;
- [ ] secrets are purpose-separated and server-side;
- [ ] submission supports idempotency and correlation;
- [ ] `status_unknown` and reconciliation are modeled;
- [ ] outbox/async failure handling exists;
- [ ] sandbox and production are isolated;
- [ ] mapping/version provenance is preserved;
- [ ] log redaction/PHI controls are verified;
- [ ] official requirements can be loaded into the external-requirements matrix;
- [ ] provider outage cannot corrupt the signed clinical plan;
- [ ] no live submission feature can activate through a single unsafe toggle.

---

## 17. Current non-goals

Do not currently:

- activate a payer API;
- register GLYMIZE as a payer provider through code changes;
- require speculative new physician fields;
- scrape private insurer endpoints into a production dependency;
- automate insurer portals as the canonical prescription path;
- expose payer credentials to PWA/browser code;
- submit engine recommendations automatically;
- invent national/payer codes;
- claim FHIR/ISO/medical-device certification merely because architecture is compatible;
- change current physician registration solely for future insurance integration.

The current task is **architectural readiness while the core product continues to mature**.
