# GLYMIZE — Health Exchange & E‑Prescription Readiness Roadmap

Status: Normative roadmap extension / architecture contract
Created: 2026-08-18
Parent roadmap: `docs/GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md`
Primary release line: `release/glymize-clinical-ui-auth-v1`
Implementation state: **DESIGN/ROADMAP ONLY — no payer connection, no new mandatory physician field, no login/registration hardening, no production behavior change**

## 0. Purpose and decision

GLYMIZE must be able to add electronic prescription, eligibility, insurance and national-health-exchange integrations later **without redesigning the clinical core**.

The future integration path is intentionally unknown. GLYMIZE may eventually connect:

- directly to a payer such as Tamin, IHIO or Armed Forces;
- through a licensed health/e-prescription operator;
- through a third-party clinical/e-prescription platform;
- through a national/Ministry health exchange;
- through a clinic/HIS/EHR vendor;
- through another officially authorized integration route that does not exist yet.

No current provider or commercial platform is a required dependency. A product such as DoctorNext may be evaluated later as one possible `External E‑Prescription Provider`; it must never become part of the GLYMIZE canonical domain model.

**Core architecture rule:**

> GLYMIZE owns a payer-neutral clinical record and physician-authorized Final Plan. External systems are adapters at the boundary. Provider-specific contracts, codes, credentials and workflow quirks must not leak into the clinical engine or become database primary identifiers.

This roadmap is intended to reduce future regulatory and integration rework. It is not a claim that GLYMIZE currently satisfies any certification, payer contract or regulatory approval.

---

## 1. Current activation policy: prepare now, enforce later

All health-exchange/e-prescription readiness features must follow progressive activation.

### 1.1 No disruption to the current physician workflow

- Current physician login and registration behavior remains unchanged unless a separate accepted release explicitly changes it.
- New professional/insurance/integration profile fields may be added for voluntary completion.
- Additional health-exchange fields are **not mandatory now**.
- Future strong verification requirements must be independently configurable instead of hard-coded into registration.
- A future requirement must be activatable without a schema redesign or replacement registration flow.

### 1.2 Admin policy model

Where a future requirement can reasonably be optional or mandatory, use a policy enum rather than a boolean:

- `OFF` — feature/requirement is not used;
- `OPTIONAL` — field or verification is available but does not block the user;
- `REQUIRED` — user must satisfy it for the relevant protected operation.

The important distinction is:

- **field availability** — whether GLYMIZE can store/manage the information;
- **workflow enforcement** — whether a user is blocked when the information is absent/unverified.

For health-exchange-related physician requirements, **enforcement defaults to `OFF` until an approved product/regulatory decision changes it**. Optional profile collection may still be enabled.

### 1.3 Feature flags must default safe/off

Future Admin flags should include at least:

- `health_exchange.enabled` — master switch, default `OFF`;
- `health_exchange.direct_payer.enabled` — default `OFF`;
- `health_exchange.external_provider.enabled` — default `OFF`;
- `health_exchange.national_exchange.enabled` — default `OFF`;
- `health_exchange.eligibility.enabled` — default `OFF`;
- `health_exchange.prescription_submission.enabled` — default `OFF`;
- `health_exchange.prescription_status_sync.enabled` — default `OFF`;
- `health_exchange.prescription_cancel.enabled` — default `OFF`;
- `health_exchange.webhooks.enabled` — default `OFF`;
- `health_exchange.fhir_mapping.enabled` — internal/export capability; default `OFF` for runtime exchange;
- `professional_profile.extended_fields.visible` — may become `ON` while enforcement remains `OFF`;
- `professional_profile.exchange_requirements` — `OFF | OPTIONAL | REQUIRED`, default `OFF`;
- `professional_profile.strong_auth` — `OFF | OPTIONAL | REQUIRED`, default `OFF` for exchange-specific hardening;
- `consent.exchange_processing` — future policy, initially not an active submission gate while exchange itself is disabled;
- `security.integration_mtls` — connector capability/configuration, not globally assumed;
- `security.integration_ip_allowlist` — connector capability/configuration, not globally assumed.

Admin policy changes that affect authentication, clinical submission or external exchange must themselves be audited.

---

## 2. Physician professional profile: future-ready, optional now

A runtime `User` is not sufficient as the long-term identity of a healthcare professional. GLYMIZE should preserve separate concepts for account identity and professional identity.

### 2.1 Domain separation

Future domain model:

- `User` — GLYMIZE account/authentication identity;
- `Practitioner` — healthcare professional identity;
- `PractitionerRole` — professional acting in a particular practice/organization/specialty/context;
- `Organization` / `Practice` — care-delivery organization/facility;
- `ExternalIdentifier[]` — authority/provider-specific identifiers.

This separation should remain compatible with HL7 FHIR `Practitioner`, `PractitionerRole` and `Organization`, but GLYMIZE does not use FHIR resources as its database schema.

### 2.2 Optional physician-management fields

The Admin physician-management area should eventually support these fields without making them required now:

**Professional identity**

- Medical Council / IRIMC number;
- national ID — encrypted, never exposed unnecessarily;
- first/last/display name;
- specialty / subspecialty display;
- specialty coding system + code when an authoritative code exists;
- professional-license/verification status;
- verification source/reference;
- verification timestamp/expiry when applicable.

**Contact / strong-auth readiness**

- verified mobile status;
- verified email status;
- preferred verification channel;
- future strong-auth capability status;
- no storage of OTP values after their authentication purpose is complete.

**Practice / facility readiness**

- practice/organization relation;
- role in that organization;
- facility identifiers as namespace-qualified external identifiers;
- SIAM or future national facility identifier only when a real authoritative value/source exists;
- external payer/provider identifiers;
- future PID/service identifier metadata when officially supplied;
- validity/status/source metadata for each external identifier.

**External integration identity**

- external provider identifier(s);
- connection/provider name only through connector configuration, not fixed physician columns;
- account-link status;
- authorization status;
- last successful verification timestamp;
- external identifiers stored as `system + value + issuer/source + validity`, not as one hard-coded vendor column.

### 2.3 Current enforcement contract

- New fields are optional now.
- Missing exchange-specific profile data must not block current GLYMIZE use while the corresponding exchange feature is disabled.
- A physician who voluntarily fills the data should not have to re-enter it when future integrations are enabled, subject to future re-verification requirements.
- Do not collect fields merely because they might theoretically become useful; use data minimization and add only fields with a credible professional/integration use case.

---

## 3. Generalized identifiers: no external identifier is a primary key

GLYMIZE internal random IDs remain authoritative for database relationships.

### 3.1 Patient identifiers

Evolve from a closed `file_number | national_id | other` concept toward namespace-aware identifiers without breaking current behavior.

Target metadata:

- internal identifier row ID;
- `system` / namespace;
- `type`;
- `issuer` / assigning authority;
- normalized value;
- encrypted original value where authorized retrieval is required;
- keyed hash for deterministic lookup where appropriate;
- display mask;
- verification status/source;
- `validFrom` / `validTo` when applicable;
- active/inactive status;
- primary-for-display flag, never database primary-key semantics.

Possible future namespaces may include practice file number, national ID, payer member identifier, national-health identifier or external-operator identifier. None are assumed to exist until officially used.

### 3.2 Practitioner, organization and coverage identifiers

Use the same namespace pattern for:

- practitioner/provider IDs;
- facility/practice IDs;
- payer IDs;
- coverage/member IDs;
- external prescription IDs;
- transaction/correlation IDs.

Provider-specific identifiers must live in identifier/mapping records, not in the clinical patient/medication object as hard-coded columns.

---

## 4. Canonical terminology and coding registry

This is one of the highest-priority future-proofing requirements.

### 4.1 Generic coding primitive

Introduce a reusable conceptual coding shape:

- `system` — authoritative coding namespace/URI/OID/internal namespace;
- `code`;
- `version` when known;
- `display`;
- `issuer/source`;
- `status`;
- `validFrom` / `validTo` when relevant;
- provenance/freshness metadata.

A clinical concept may have multiple codings simultaneously. No insurer code, IRC code or third-party code becomes the identity of the concept.

### 4.2 Medication coding

Canonical medication/product identity remains GLYMIZE-owned. Mapping may include, when available and lawful:

- internal GLYMIZE medication/product ID;
- INN/generic identity;
- ATC;
- IRC;
- NFI/generic registry code;
- brand/product registry code;
- payer-specific code(s);
- operator/third-party code(s);
- future Ministry/national terminology code(s).

Payer/operator codes belong in mapping/coding registries and signed snapshots, not as the medication primary key.

### 4.3 Laboratory, diagnosis, service and procedure coding

Apply the same model to:

- laboratory tests/observations;
- specimens;
- units;
- diagnoses/conditions;
- services/procedures;
- investigations;
- routes of administration;
- dosage forms;
- specialties;
- organizations/facilities.

Use authoritative national code systems when officially available. Do not invent a payer/national code to fill a missing mapping.

### 4.4 Units

- Preserve numeric value separately from unit.
- Maintain canonical unit normalization.
- Prefer UCUM-compatible representation where practical for interoperability.
- Preserve the source unit and conversion provenance when normalization occurs.
- Never silently combine incompatible units in longitudinal trends or exchange payloads.

---

## 5. Payer-neutral canonical prescription model

GLYMIZE must not have a `TaminPrescription`, `IHIOPrescription` or `DoctorNextPrescription` as its clinical source of truth.

### 5.1 Canonical objects

Keep a provider-neutral model around:

- Patient;
- Encounter;
- Physician Final Plan;
- Medication Order;
- Investigation / Service Order;
- Coverage / payer context;
- physician authorization/sign-off;
- external submission lifecycle.

`PhysicianFinalPlan` remains separate from engine recommendations.

### 5.2 Minimum medication-order semantics

Future-ready medication orders should be able to represent, where clinically applicable:

- canonical medication/product;
- coding set;
- route;
- dosage form;
- strength;
- dose amount/unit;
- frequency/schedule;
- duration;
- quantity and quantity unit;
- number of authorized repeats/refills if later required;
- substitution policy if later required;
- clinical reason/diagnosis links when available;
- authoring encounter;
- authoring/requesting practitioner;
- authored timestamp;
- prior/superseded prescription relation;
- insurer/coding snapshot at physician sign-off.

Do not add fields only because FHIR contains them; add fields when GLYMIZE has a real clinical or exchange use case while keeping the model FHIR-mappable.

---

## 6. Strong separation: recommendation → physician plan → external submission

This is a permanent safety boundary.

Required workflow layers:

1. `Engine Recommendation`;
2. `Physician Draft`;
3. `Physician Final Plan`;
4. `Physician Sign-off / Authorization`;
5. `Exchange Submission Request`;
6. `External Acceptance/Registration/Rejection`.

Rules:

- An engine recommendation must never directly trigger external prescription submission.
- A physician must explicitly review/authorize the final clinical content before submission.
- External registration status must never alter the physician-authored clinical order.
- A later clinical change creates a superseding physician plan/order rather than mutating signed history.
- Submission retry/reconciliation is an integration concern, not a clinical re-sign action unless external rules require new authorization.

---

## 7. Sign-off and future legal/electronic signature abstraction

Current internal `signed` state is useful but must not be equated with a future legally recognized electronic signature.

### 7.1 `SignatureProof` abstraction

Future model should support:

- signature/authorization method;
- provider/authority;
- signer practitioner/user reference;
- practitioner role/organization context;
- signed timestamp;
- canonical payload hash;
- signature/authorization reference;
- certificate/key reference metadata when applicable;
- external verification status;
- verification timestamp;
- validity/expiry metadata where applicable.

Possible future methods may include internal confirmation, OTP-backed provider authorization, PKI/e-signature, operator authorization or another official mechanism. Do not hard-code one method until official requirements are known.

### 7.2 Secrets not stored in SignatureProof

Never store in the clinical signature record:

- plaintext password;
- reusable OTP;
- private signing key;
- raw long-lived access token;
- client secret.

Store only proof/reference/verification metadata required for traceability.

---

## 8. Consent, legal basis and purpose of use

Create a real consent/authorization domain instead of relying on a generic terms checkbox.

### 8.1 `ConsentRecord` readiness

Target fields/concepts:

- patient/subject;
- purpose of use;
- data scope;
- recipient/provider/organization scope where relevant;
- legal basis / consent basis;
- policy/notice version;
- captured by;
- granted timestamp;
- expiry/period;
- revoked timestamp/status;
- proof/reference;
- provenance.

### 8.2 Current behavior

- No new exchange consent gate is activated while external exchange is disabled.
- The data model should be designed so an official future consent requirement can become enforceable without rebuilding the patient/encounter model.
- Use data minimization; do not collect speculative sensitive data merely to appear future-ready.

FHIR `Consent` may be used as an interoperability mapping target, not as the internal persistence model.

---

## 9. Clinical provenance and security audit are separate

### 9.1 Provenance

Track the origin/history of clinically relevant data and documents, including:

- author/creator;
- source system/document;
- import/manual/OCR origin;
- human verification;
- creation/revision/signing event;
- rule/engine version where applicable;
- mapping version for exchanged data.

FHIR `Provenance` is a useful interoperability model.

### 9.2 Audit trail

Security/clinical access audit should record:

- actor/user/practitioner;
- role/permission context;
- practice/organization;
- patient/encounter/target reference;
- action;
- purpose/use context when available;
- result/success/failure;
- timestamp;
- source request/session metadata as appropriate;
- external connector/provider and correlation ID when an exchange event occurs.

FHIR `AuditEvent` is a useful interoperability model.

### 9.3 Audit log data minimization

Do not copy unnecessary PHI or secrets into logs. In particular, avoid plaintext:

- national ID;
- full external credentials;
- OTP;
- access/refresh tokens;
- raw clinical payloads;
- full payer request/response bodies unless a narrowly governed encrypted diagnostic store explicitly requires them.

---

## 10. Granular permissions for future prescribing/exchange

Do not rely on only `physician` vs `assistant` role checks.

Future permissions should include at least:

- `prescription.prepare`;
- `prescription.review`;
- `prescription.sign`;
- `prescription.submit`;
- `prescription.status.read`;
- `prescription.cancel`;
- `insurance.eligibility.read`;
- `insurance.coverage.read`;
- `health_exchange.use`;
- `health_exchange.configure`;
- `health_exchange.credentials.manage`;
- `clinical_record.export`.

Contract:

- an assistant may prepare/administer workflow only when explicitly permitted;
- an assistant must never impersonate the physician for sign-off;
- external submission must be attributable to the physician/practitioner and the authorized GLYMIZE user/session;
- Admin configuration authority does not automatically imply authority to sign clinical orders.

All new permissions remain unused until the corresponding feature exists.

---

## 11. `HealthExchangeGateway`: provider-neutral integration boundary

Create an architectural boundary, not a payer-specific dependency.

### 11.1 Connector categories

A future connector may be:

- `direct_payer`;
- `e_prescription_operator`;
- `national_health_exchange`;
- `third_party_clinical_platform`;
- `his_ehr_partner`;
- another approved category added later.

### 11.2 Connector capability discovery

Each connector should declare capabilities rather than assuming all providers support the same workflow:

- eligibility/member inquiry;
- coverage inquiry;
- medication/service code lookup;
- prescription submit;
- prescription status query;
- correction/amendment;
- cancellation;
- document attachment;
- webhook/callback;
- polling;
- synchronous/asynchronous processing;
- required authentication method;
- required network controls;
- sandbox availability.

### 11.3 No provider logic in clinical core

The connector is responsible for:

- provider-specific authentication;
- provider-specific DTO/schema;
- canonical-to-provider mapping;
- provider error mapping;
- provider status mapping;
- provider-specific retry/reconciliation rules;
- transport/network requirements.

The clinical engine, Final Plan and medication registry must not import provider DTOs.

### 11.4 Third-party provider path

A future platform such as an e-prescription vendor can be integrated through the exact same connector contract as a direct payer.

This allows GLYMIZE to choose later between:

- direct payer connections;
- one aggregator/operator;
- multiple providers;
- a migration from third-party to direct integration;

without changing the physician Final Plan or clinical engine.

---

## 12. Submission lifecycle, idempotency and reconciliation

External submission is a state machine, not a single `success` boolean.

### 12.1 Canonical submission states

Target conceptual states:

- `not_requested`;
- `queued`;
- `submission_pending`;
- `submitting`;
- `submitted`;
- `accepted` / `registered`;
- `rejected`;
- `status_unknown`;
- `reconciliation_pending`;
- `cancel_pending`;
- `cancelled`;
- `superseded`;
- `permanent_failure`.

Exact external statuses are mapped into canonical states while preserving provider-native status/code for troubleshooting.

### 12.2 Required identifiers

Future submission records should support:

- internal submission ID;
- idempotency key;
- correlation ID;
- provider/connector ID;
- provider environment;
- external transaction ID;
- external prescription/registration ID;
- attempt number;
- created/submitted/last-checked timestamps;
- mapping/schema version;
- canonical payload hash;
- external status/error code;
- reconciliation state.

### 12.3 Ambiguous timeout rule

If a request times out after it may have been accepted externally:

- do not blindly create a second prescription;
- mark `status_unknown`;
- use official status/reconciliation capability when available;
- retry only according to provider contract and idempotency guarantees.

---

## 13. Transactional outbox and async integration

Signed clinical data must survive external provider downtime.

Target pattern:

`Signed Final Plan → Submission Request → Transactional Outbox → Connector Worker/Service → External System`

Benefits:

- no loss of the physician plan when an insurer/provider is unavailable;
- controlled retry/backoff;
- independent connector deployment;
- clear audit/reconciliation;
- ability to use a connector server requiring Iranian network access, static IP, VPN, mTLS or another network control without moving the whole GLYMIZE clinical runtime.

The browser/PWA must never call payer/third-party credentialed APIs directly.

---

## 14. Connector configuration and Admin UX

Future Admin area should have a dedicated `Health Exchange / Integrations` section behind the master feature flag.

### 14.1 Provider registry

Store configuration metadata such as:

- internal connector ID;
- display name;
- connector category;
- environment (`sandbox`, `production`, etc.);
- enabled status;
- capabilities;
- endpoint/config references;
- credential secret references;
- certificate/mTLS secret references;
- network requirements;
- mapping version;
- health/status;
- last successful exchange;
- contract/approval metadata reference where useful;
- notes visible only to authorized admins.

### 14.2 Credentials

Admin UI may show credential **status**, never secret value after storage.

- Secrets are server-side only.
- Browsers do not receive long-lived provider credentials.
- Use secret references rather than copying secrets into normal configuration rows.
- Support rotation without changing clinical records.
- Separate sandbox and production credentials.

### 14.3 Safe activation

Enabling a connector does not automatically enable prescription submission. Require layered activation:

1. connector configured;
2. connector test/health accepted;
3. provider/payer approval state recorded when required;
4. target capability enabled;
5. physician/profile prerequisites policy satisfied if configured;
6. explicit production activation.

No single Admin toggle should accidentally turn on external prescribing for all users.

---

## 15. Secret and key separation

Permanent security rule:

> Authentication secret ≠ clinical encryption key ≠ identifier HMAC key ≠ integration client secret ≠ signing/private key.

Requirements:

- purpose-specific secrets;
- environment separation;
- version/rotation metadata;
- no secrets in Git history;
- no secrets in client bundles/PWA/local storage;
- no secrets in routine logs;
- no integration token fallback to unrelated authentication/encryption secrets;
- design for later KMS/HSM/envelope-encryption use if required;
- credential revocation and rotation runbooks before production exchange.

Legacy fallback patterns that reuse one token/secret for multiple cryptographic purposes should be removed when the affected subsystem is next migrated; do not create new instances of that pattern.

---

## 16. Interoperability: FHIR-mappable, not FHIR-locked

Use HL7 FHIR R4 as an interoperability reference/mapping target where useful, while keeping GLYMIZE canonical domain models independent.

Expected conceptual mappings include:

- GLYMIZE Patient → FHIR `Patient`;
- Practitioner → `Practitioner`;
- practitioner-in-practice → `PractitionerRole`;
- Practice/clinic → `Organization`;
- visit → `Encounter`;
- medication prescription/order → `MedicationRequest`;
- investigation/lab order → `ServiceRequest`;
- measured lab/vital → `Observation`;
- insurer/member context → `Coverage`;
- consent → `Consent`;
- clinical provenance → `Provenance`;
- security/access event → `AuditEvent`.

Rules:

- do not assume Iranian payer APIs use FHIR;
- do not make the D1 schema a serialized FHIR store;
- do maintain enough semantics that a deterministic mapper can be built later;
- mapping profile/version must be explicit and testable;
- provider-specific extensions remain in adapter mapping layers.

---

## 17. Time, calendar and locale rules

- Store canonical system timestamps as offset-aware ISO 8601/UTC-normalized values.
- Preserve source timezone when clinically/legally material.
- Persian/Jalali dates are presentation or source-date representations, not a replacement for canonical internal time.
- If a source provides only a Persian-calendar date, preserve source calendar/value/provenance until deterministically converted.
- Every external adapter owns conversion required by that provider contract.
- Never perform ambiguous date conversion silently.

---

## 18. Coverage and insurance data separation

Insurance/cost data are not the clinical order itself.

Keep separate concepts for:

- clinical medication/investigation order;
- current live insurance/market data;
- coverage/member context;
- insurance snapshot used at physician decision/sign-off;
- external eligibility result;
- external submission/registration result.

Historical signed orders must retain the payer/product/code snapshot used at sign-off. Later catalog/coverage changes must not rewrite history.

---

## 19. External payload retention and data minimization

Provider payloads must not become the canonical patient record.

### 19.1 Normalize what GLYMIZE needs

Extract and persist structured fields needed for operation/audit, such as:

- provider;
- external IDs;
- canonical status;
- native status/error code;
- timestamps;
- tracking/reference ID;
- coverage/eligibility result;
- mapping version;
- request/response hashes where useful.

### 19.2 Raw payload policy

If raw external requests/responses must be retained for a specific approved reason:

- classify them as sensitive clinical/integration data;
- encrypt at rest;
- restrict access;
- redact secrets;
- define retention/deletion policy;
- avoid duplicating PHI unnecessarily;
- never put them in ordinary application logs.

Default preference is **minimum necessary structured persistence**, not indefinite raw payload storage.

---

## 20. UI semantics and human-factors safety

The UI must clearly distinguish:

- GLYMIZE recommendation;
- physician draft;
- physician-signed/authorized plan;
- queued external submission;
- externally submitted;
- externally registered/accepted;
- rejected/unknown/cancelled.

Rules:

- never display `registered` merely because the physician signed locally;
- never display payer acceptance before an authoritative external response/reconciliation;
- external errors must not silently modify the clinical plan;
- ambiguous submission status must be visibly different from rejection;
- cancellation/supersession must make clear whether the local clinical order, external registration, or both are affected;
- physician confirmation before external submission must be explicit and reviewable.

These distinctions should be preserved even if a third-party integration presents a simplified API.

---

## 21. Secure transport and connector network readiness

Do not assume every provider uses the same network model.

Connector layer must be capable of supporting, when required:

- TLS-only endpoints;
- mTLS/client certificates;
- IP allowlisting/static egress IP;
- VPN/private link;
- OAuth/OIDC;
- client credentials;
- signed requests;
- short-lived access tokens;
- OTP/user-interactive authorization;
- provider-specific session/token exchange;
- webhook signature verification.

These are connector capabilities, **not current global requirements**. Do not build fake versions before official contracts are known.

---

## 22. Webhooks/callback safety

If a future provider uses callbacks/webhooks:

- dedicated server-side endpoint;
- verify provider signature/authentication before processing;
- anti-replay controls where supported;
- idempotent event processing;
- connector/provider scoping;
- correlation with an existing transaction;
- append-only receipt/audit event;
- no trust in caller-supplied physician/patient identity without verification;
- reject unsupported/unrecognized event types safely;
- never expose an unauthenticated generic webhook that can mutate clinical records.

---

## 23. Failure handling and provider independence

GLYMIZE must remain clinically usable when exchange services are unavailable unless an explicitly required workflow cannot legally proceed.

Design for:

- provider outage;
- authentication expiration;
- code mapping unavailable;
- invalid/expired practitioner credential;
- patient eligibility unavailable;
- rate limiting;
- timeout;
- partial provider failure;
- duplicate detection;
- mapping-version mismatch;
- sandbox/production misconfiguration;
- provider contract/API version deprecation.

Provider outage must never erase or corrupt the signed physician plan.

---

## 24. Versioning and compatibility

Version independently:

- GLYMIZE canonical prescription schema;
- terminology/coding maps;
- provider connector implementation;
- provider API contract version;
- FHIR mapping/profile;
- consent policy version;
- security/auth method configuration;
- transformation/mapping rules.

Historical transactions retain the versions/hashes needed to explain how the external payload was produced.

Do not edit an applied clinical/integration database migration in place. Continue additive numbered migrations.

---

## 25. Validation and test strategy

No real external prescribing feature is release-ready without:

- provider sandbox/approved test environment when available;
- canonical model unit tests;
- connector contract tests;
- mapping golden fixtures;
- validation of required/optional fields;
- idempotency tests;
- duplicate prevention tests;
- timeout/status-unknown reconciliation tests;
- retry/backoff tests;
- auth expiration/rotation tests;
- webhook verification tests when applicable;
- permission tests;
- physician explicit-authorization tests;
- audit/provenance tests;
- cross-practice isolation tests;
- secret-leak tests/log redaction review;
- sandbox-vs-production configuration gate;
- deterministic test patients only in CI.

Production patient data and production payer credentials must never be used in routine CI fixtures.

---

## 26. Security engineering and software-quality evidence

Prepare evidence without falsely claiming certification.

### 26.1 Security standards/alignment targets

Architecture/security work should remain compatible with:

- ISO/IEC 27001:2022 — information security management system framework;
- ISO 27799:2025 — health information security controls based on ISO/IEC 27002;
- OWASP ASVS for application-security verification where useful;
- OWASP API Security guidance for external API boundary design.

### 26.2 Medical-software lifecycle readiness

If future regulatory classification/intended use makes them applicable, preserve evidence compatible with:

- IEC 62304 — medical-device software lifecycle processes;
- ISO 14971:2019 — medical-device risk management;
- IEC 62366-1 — usability/human-factors engineering for safety;
- ISO 13485:2016 — medical-device quality management.

Current roadmap action is **documentation and process readiness**, not certification.

Maintain:

- requirement IDs;
- design decisions/ADRs;
- hazard/risk register for safety-relevant features;
- requirement → implementation → test traceability;
- change control;
- validation evidence;
- release notes/history;
- dependency/SBOM capability;
- vulnerability/dependency review;
- incident-response/security runbook before real PHI exchange scale-up.

---

## 27. National standards and regulatory-change strategy

Iranian health-exchange, terminology, MDS, signature, privacy, coding and payer requirements are expected to evolve. GLYMIZE must not guess missing official contracts.

Rules:

- track official Ministry/payer/operator standards as separate versioned external requirements;
- keep a requirements matrix: `source → requirement → affected GLYMIZE component → implementation status → validation evidence`;
- when an official national code system/MDS/security protocol is published, add a mapping/profile rather than rewriting the canonical clinical domain;
- isolate provider/payer differences in connectors;
- preserve old mapping versions for historical auditability;
- do not describe GLYMIZE as officially compliant/certified until the applicable authority has actually confirmed that status.

---

## 28. Admin configuration contract

The eventual Admin panel must separate **availability**, **policy**, **credentials** and **production activation**.

### 28.1 Professional profile settings

Admin can configure future policies independently for:

- extended professional-profile field visibility;
- national-ID collection policy;
- specialty-code policy;
- mobile verification policy;
- email verification policy;
- facility-identifier policy;
- external-provider identifier policy;
- strong-auth/signature prerequisite policy.

Current exchange-specific enforcement defaults `OFF`. Existing unrelated identity requirements remain unchanged unless separately approved.

### 28.2 Exchange settings

Admin can later manage:

- master exchange switch;
- provider/connector registry;
- direct-payer vs third-party/aggregator choice;
- enabled capabilities per connector;
- sandbox vs production;
- credential/certificate status;
- mapping/profile version;
- health checks;
- rollout scope by practice/user if needed;
- emergency disable/kill switch;
- read-only status/reconciliation mode without new submissions.

### 28.3 No secret exposure

Admin may view status such as `configured`, `expires_at`, `last_verified`, but not retrieve stored secrets in plaintext after saving.

---

## 29. Architectural tasks to perform before any real integration

These are the standardization tasks that should be incorporated into later GLYMIZE design phases even while every exchange runtime flag remains off.

### A. Canonical data contracts

- [ ] Generalize namespace-aware patient identifiers without breaking current lookup.
- [ ] Add reusable `Coding` / code-system metadata primitive.
- [ ] Add terminology/mapping registry with source/version/freshness.
- [ ] Ensure medication, lab, service, diagnosis, route, form and specialty concepts can hold multiple codings.
- [ ] Preserve GLYMIZE internal IDs as primary relational identities.
- [ ] Add canonical Coverage/payer-context concept when needed by the cost/insurance phase.

### B. Professional identity

- [ ] Add `Practitioner` / `PractitionerRole` domain separation from login `User`.
- [ ] Add optional extended physician-management fields.
- [ ] Add namespace-aware practitioner/facility/provider identifiers.
- [ ] Keep new fields optional while exchange-specific enforcement is `OFF`.
- [ ] Add verification status/source/timestamps rather than only a raw value.

### C. Sign-off, consent and audit

- [ ] Add future `SignatureProof` abstraction without changing current local sign-off semantics.
- [ ] Add `ConsentRecord` domain foundation.
- [ ] Separate Provenance from AuditEvent-style security/activity logging.
- [ ] Add granular prescription/exchange permissions.
- [ ] Audit Admin policy/connector changes.

### D. Exchange boundary

- [ ] Define `HealthExchangeGateway` / connector interface.
- [ ] Define connector capability declaration.
- [ ] Define direct-payer, operator and third-party connector categories.
- [ ] Keep all provider DTOs outside clinical-engine/contracts used as canonical medical truth.
- [ ] Define canonical external error/status mapping.
- [ ] Define sandbox/production environment isolation.

### E. Submission reliability

- [ ] Add submission state machine.
- [ ] Add idempotency/correlation/external transaction metadata.
- [ ] Add transactional outbox pattern.
- [ ] Add append-only submission attempts/events.
- [ ] Add `status_unknown` + reconciliation flow.
- [ ] Add cancellation/supersession lifecycle without mutating signed orders.

### F. Security hardening

- [ ] Separate auth/encryption/HMAC/integration/signing secrets.
- [ ] Remove legacy multi-purpose secret fallback when those modules are next migrated.
- [ ] Add secret-reference model for integration configs.
- [ ] Prepare key/credential rotation.
- [ ] Ensure PHI/secret log redaction.
- [ ] Prepare connector mTLS/static-IP/VPN capability without enabling it prematurely.
- [ ] Add webhook verification architecture before accepting callbacks.

### G. Interoperability and quality

- [ ] Maintain deterministic FHIR R4 mapping layer capability; do not make persistence FHIR-native by default.
- [ ] Normalize canonical units/time/date handling.
- [ ] Add connector contract-test harness and mapping fixtures.
- [ ] Maintain software requirement/risk/traceability evidence for future assessment.
- [ ] Track official Iranian standard changes and connector contract versions.

---

## 30. Suggested implementation placement in the parent product roadmap

The following items should be treated as cross-cutting dependencies in later product phases rather than implemented immediately.

### P1/P2 — Longitudinal patient & data quality

Include:

- namespace-aware identifiers;
- generic coding primitive;
- canonical units;
- Practitioner/PractitionerRole foundation where profile work touches identity;
- optional physician professional-profile fields;
- provenance foundations.

No external submission capability is enabled.

### P4/P5 — Medication action and cost/insurance

Include:

- canonical prescription completeness;
- coding snapshots;
- Coverage/payer context;
- terminology registry;
- external code mappings kept outside canonical medication identity;
- SignatureProof/Consent foundations when Final Plan signing evolves.

No payer API is required to complete these phases.

### New future phase — Health Exchange / E‑Prescription Readiness

Before any live insurer/operator integration:

- HealthExchangeGateway;
- connector registry/capabilities;
- external-provider adapter path;
- granular permissions;
- submission state machine;
- outbox/idempotency/reconciliation;
- Admin feature flags and staged activation;
- secret separation/rotation;
- FHIR mapping contract tests;
- provider sandbox validation;
- security/privacy/regulatory readiness review.

### Later live-integration phase

Only after a real official/commercial path is selected:

1. obtain authoritative API/partner documentation;
2. classify the integration (`direct_payer`, `operator`, `third_party_clinical_platform`, etc.);
3. implement one connector only in the adapter layer;
4. map required professional/patient/coding fields;
5. enable only required profile-policy checks;
6. validate in official sandbox/test;
7. complete legal/security/privacy review;
8. production-enable via staged Admin flags;
9. monitor/reconcile/audit;
10. keep the clinical engine independent of that provider.

---

## 31. Explicit non-goals for the current release

Do **not** currently:

- require company registration or payer API enrollment;
- require new physician professional fields for normal login/use;
- change current physician registration solely for future insurance integration;
- store payer/API passwords in physician profiles;
- store OTP values as reusable credentials;
- implement browser automation against insurer portals;
- reverse-engineer private endpoints and make them production dependencies;
- create a payer-specific prescription as the canonical Final Plan;
- expose provider credentials to the browser/PWA;
- call an external prescription API from the clinical engine;
- auto-submit an engine recommendation;
- assume a particular third-party vendor will be used;
- assume DATAS, a payer or a commercial provider uses FHIR;
- assume IRC/ATC/NFI/payer code is the sole medication identity;
- invent missing official codes;
- claim legal/regulatory certification that has not been granted.

---

## 32. Decision gate for choosing a future direct or third-party provider

When GLYMIZE is ready to select an integration route, compare candidates using the same matrix:

- legal/contractual eligibility for GLYMIZE;
- supported payers and service types;
- physician authentication/signature model;
- patient eligibility capabilities;
- prescription submit/status/cancel capabilities;
- medication/service coding model;
- sandbox/test access;
- documentation quality/versioning;
- availability/SLA;
- rate limits;
- idempotency/reconciliation support;
- webhook/polling model;
- security requirements (mTLS, static IP, VPN, OAuth, etc.);
- data residency/retention terms;
- privacy/security obligations;
- API cost/commercial dependency;
- lock-in and portability;
- ability to export/correlate transaction IDs;
- migration path to another provider;
- support responsiveness;
- production certification/approval burden.

A third-party provider is acceptable if it materially reduces operational/regulatory burden **and** the GLYMIZE canonical domain remains portable.

---

## 33. Definition of done for readiness (before live payer work)

GLYMIZE can be called **Health-Exchange Ready** architecturally only when:

1. no payer/operator-specific DTO is part of the clinical engine's source of truth;
2. canonical medication/service concepts support multiple coding systems;
3. patient/practitioner/facility identifiers are namespace-aware;
4. physician professional fields needed by future integrations can be stored but are independently enforceable;
5. current login still works with exchange enforcement off;
6. signed physician plan remains separate from external submission;
7. SignatureProof abstraction exists without storing secrets;
8. consent/legal-basis model exists;
9. granular exchange permissions exist;
10. audit and provenance are separate and testable;
11. HealthExchangeGateway/connector contract exists;
12. connector credentials are server-side secret references;
13. submission supports idempotency, status-unknown and reconciliation;
14. transactional outbox exists for external exchange;
15. sandbox/production configurations are isolated;
16. FHIR R4 mapping can be generated/tested without dictating the database schema;
17. PHI/secret logging controls are verified;
18. official/provider requirements can be captured in a versioned requirements matrix;
19. all runtime exchange feature flags remain off until an approved integration exists;
20. a future direct-payer or third-party connector can be added without changing Clinical Engine semantics.

---

## 34. Standards/reference baseline to monitor

These references inform architecture; they are not claims that a future Iranian interface will use them.

- HL7 FHIR R4 MedicationRequest: https://hl7.org/fhir/R4/medicationrequest.html
- HL7 FHIR R4 Practitioner: https://hl7.org/fhir/R4/practitioner.html
- HL7 FHIR R4 PractitionerRole: https://hl7.org/fhir/R4/practitionerrole.html
- HL7 FHIR R4 Consent: https://hl7.org/fhir/R4/consent.html
- HL7 FHIR R4 AuditEvent: https://hl7.org/fhir/R4/auditevent.html
- HL7 FHIR R4 Provenance: https://hl7.org/fhir/R4/provenance.html
- ISO/IEC 27001:2022: https://www.iso.org/standard/27001
- ISO 27799:2025: https://www.iso.org/standard/84647.html
- ISO 14971:2019: https://www.iso.org/standard/72704.html
- ISO 13485:2016: https://www.iso.org/standard/59752.html
- IEC 62304: https://webstore.iec.ch/en/publication/6792
- IEC 62366-1: https://webstore.iec.ch/en/publication/67220

Iranian national/payer/operator requirements must be added to the external-requirements matrix from authoritative current sources when implementation is actually scheduled.

---

## 35. Permanent safety constraints

- Clinical recommendation is not a prescription submission.
- Physician authorization remains explicit.
- External status never rewrites signed clinical history.
- Unknown external state is not success or failure; reconcile it.
- No secret belongs in the browser, Git, audit metadata or ordinary log.
- No external code is a GLYMIZE primary clinical identity.
- No provider is assumed permanent.
- No future compliance requirement is hard-coded into current registration when it can be policy-driven.
- No external integration becomes active merely because its fields/configuration exist.
- No unsupported regulatory/certification claim is made.

This document is a normative extension of the GLYMIZE clinical product roadmap and must be consulted whenever future work touches physician identity, patient identifiers, medication/service coding, consent, Final Plan signing, insurance, external APIs, e-prescription, national health exchange, interoperability, security or regulated-software readiness.
