# GLYMIZE â€” Patient Care Hub, Scheduling & Telehealth Roadmap

Status: Normative roadmap extension / architecture contract
Created: 2026-08-31
Parent roadmap: `docs/GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md`
Companion roadmap: `docs/GLYMIZE_HEALTH_EXCHANGE_READINESS_ROADMAP.md`
Primary implementation line after current release closure: P5
Implementation state: **DESIGN/ROADMAP ONLY â€” no payment gateway, SMS provider, live-video provider or production patient self-registration is activated by this document.**

---

## 0. Purpose and product decision

GLYMIZE will evolve the current Patient Portal into a broader **Patient Care Hub** without weakening the deterministic clinical core or coupling a patient account to one physician practice.

The target care journey is:

`find/connect to clinician â†’ schedule or start asynchronous care â†’ prepare diabetes data â†’ communicate securely â†’ clinician review â†’ GLYMIZE clinical decision support â†’ treatment/follow-up`

The Patient Care Hub is not a copy of a generic doctor marketplace. Its differentiator is the combination of:

- provider discovery and referral;
- appointment scheduling;
- asynchronous secure care;
- structured diabetes pre-visit preparation;
- longitudinal patient record linkage;
- clinician/assistant workflows;
- deterministic clinical decision support;
- future live audio/video care;
- payment-ready but provider-neutral architecture.

**Core architecture rule:**

> The patient account is global to the patient. Clinical records remain practice-scoped. A care relationship links the global patient identity to an authorized practice-specific patient record.

---

## 1. Actors and trust boundaries

Primary actors:

- `patient`
- `physician`
- `assistant`
- `practice_admin`
- `platform_admin`
- future external notification/payment/video providers

The Patient Care Hub must preserve role separation.

### Patient

May see and act only on patient-facing resources authorized for that account.

### Physician

Owns clinical authority, clinical confirmation, diagnosis/treatment decisions and clinician-approved medication state.

### Assistant

May perform administrative and delegated workflow actions according to explicit permissions, including scheduling, referral issuance, patient intake coordination and permitted record views.

Assistant access must not silently grant physician clinical authority.

### Platform admin

May manage platform feature flags, providers and operational configuration, but does not gain arbitrary clinical access merely by being a platform administrator.

---

## 2. Landing page and entry separation

The public/landing experience must expose clearly separated entry paths:

- **Patient login / patient area**
- **Physician & assistant login / clinical workspace**

Patient routes must not render the clinician navigation shell.

Clinician routes must not expose the patient shell as if it were a clinician module.

The distinction is both UX and security architecture.

Target conceptual routes:

- `/patient` or `/portal` â€” patient shell
- `/account` â€” physician/assistant authentication
- clinician workspace routes â€” authenticated clinician/assistant shell

A future redesign may rename routes, but the actor boundary is normative.

---

## 3. Patient identity v2

### 3.1 Default login

Target default patient login:

- Iranian national ID
- password

National ID is an identifier, not an authentication secret.

The design must avoid a plaintext national-ID lookup index where a keyed lookup can be used.

Directional storage model:

- keyed/HMAC lookup value for normalized national ID;
- encrypted national ID for authorized display/use where required;
- password hash using the hardened credential mechanism;
- auditable credential lifecycle;
- generic login errors;
- rate limiting and abuse controls.

### 3.2 Self-registration safety

Knowledge of another person's national ID must not automatically grant access to that person's existing clinical record.

Patient account creation and **clinical-record linking** are separate events.

A newly created patient account may remain unlinked until identity/care relationship proof is sufficient.

Clinical record linkage can later be established through a verified flow such as:

- clinician/assistant referral;
- verified mobile flow when SMS is enabled;
- practice-controlled identity confirmation;
- another explicitly approved identity-proofing mechanism.

### 3.3 SMS OTP

SMS OTP is architected now but remains **OFF by default**.

Activation requires both:

1. an operational/configured SMS provider capability; and
2. an explicit platform-admin feature setting.

The UI must not advertise a usable SMS-login option when the capability is disabled.

Future settings should distinguish at least:

- patient password login;
- patient SMS OTP login;
- SMS password recovery;
- appointment/reminder SMS.

No SMS provider is selected or activated by this roadmap.

---

## 4. Global patient account vs practice-specific clinical records

The current practice-bound portal identity must not become the long-term global patient identity model.

Target direction:

`patient_account`
â†’ one or more `care_relationships`
â†’ one or more practice-specific `patient_registry` records

Example:

- one patient account;
- endocrine practice record;
- cardiology practice record;
- nephrology practice record.

Each practice may retain its own:

- file number;
- care team;
- local notes;
- practice-specific workflow state;
- clinical authorizations.

No cross-practice record merge is implied merely because the same global patient account is connected to multiple practices.

---

## 5. Provider directory, discovery and referral

Patients must be able to find/connect to a clinician by:

- physician name;
- medical council code;
- specialty;
- future condition/service filters;
- referral code;
- referral QR.

### 5.1 Referral codes

A physician or authorized assistant may generate a referral/invite code.

Required properties:

- practice-scoped;
- linked to the intended clinician or practice workflow;
- random/unpredictable;
- stored as a hash where feasible;
- one-time or explicitly bounded-use;
- expiring;
- revocable;
- auditable.

A referral code must not become a permanent clinical identifier.

### 5.2 Provider profile

Provider discovery may expose a patient-safe public profile such as:

- clinician display name;
- specialty/subspecialty;
- medical council code where appropriate;
- practice/location;
- supported visit modes;
- next available appointment;
- languages;
- future insurance/fee information.

Clinical/admin-only details must not leak into the public directory.

---

## 6. Care relationship domain

A successful patientâ€“provider connection creates or requests a `care_relationship`.

Directional states may include:

- `requested`
- `active`
- `paused`
- `ended`
- `revoked`

A care relationship must identify:

- global patient account;
- practice;
- optionally primary/assigned physician;
- linked practice-specific patient record if one exists;
- provenance of connection;
- activation timestamps;
- status/revocation history.

Discovery alone does not grant clinical record access.

---

## 7. Scheduling and clinician availability

Scheduling is a first-class domain, not a chat timestamp convention.

Physicians/practices must be able to define:

- recurring availability;
- date-specific exceptions;
- holidays/leave;
- visit duration;
- buffer time;
- maximum daily capacity;
- supported modality per schedule;
- booking horizon;
- minimum notice;
- cancellation/reschedule policy.

Supported appointment modes should include:

- scheduled live visit;
- asynchronous consultation;
- future in-person scheduling where enabled.

### 7.1 Booking confirmation policy

The confirmation model must be configurable per physician/practice.

Supported policies:

- `auto_confirm` â€” patient reserves an available slot immediately;
- `approval_required` â€” patient requests a slot and physician/assistant approves;
- future hybrid policy.

The data model must not hard-code one policy platform-wide.

### 7.2 Concurrency

Slot allocation must prevent double booking.

Booking must use server-authoritative time and transactional/concurrency protection.

Client-side slot availability is informational until the server confirms reservation.

### 7.3 Appointment lifecycle

Directional states:

- `requested`
- `confirmed`
- `cancelled`
- `rescheduled`
- `checked_in`
- `in_progress`
- `completed`
- `no_show`

State transitions must be auditable.

---

## 8. Notification architecture

Initial notification channels:

- in-app notification;
- PWA/Web Push when available.

Later channels:

- SMS;
- email;
- other approved provider adapters.

Notification intent must be stored separately from delivery-provider implementation.

Core appointment events should support notification to patient, physician and/or assistant as appropriate.

Examples:

- booking requested;
- booking confirmed;
- rescheduled;
- cancelled;
- new patient message;
- new clinician message;
- patient checked in;
- clinician ready;
- consultation summary ready.

### 8.1 Reminder policy

Default roadmap target for scheduled online visits:

- optional earlier reminder such as 24 hours;
- mandatory product-level target reminder approximately **15 minutes before** the appointment for patient and physician;
- assistant reminder according to practice preference.

Reminder policy must be configurable and timezone-safe.

Repeated delivery must be idempotent.

---

## 9. Patient application information architecture

The patient must see a patient-specific shell only.

Target primary navigation:

- Home
- My clinicians
- My appointments
- Messages
- My record
- Notifications
- Account & security

### Home

Prioritize:

- next appointment;
- pre-visit tasks;
- unread messages;
- important follow-up actions.

Avoid clinician terminology and clinical command-center complexity.

The patient experience should be mobile-first, low-friction and focused on one dominant action per screen.

---

## 10. Clinician and assistant workspace

Clinician/assistant entry remains separate from patient entry.

The clinician workspace should surface:

- today's/next appointments;
- waiting patients;
- pending asynchronous consults;
- unread patient messages;
- pre-visit package completeness;
- patient record context;
- relevant clinical alerts;
- follow-up tasks.

### Assistant-visible administrative record elements

Subject to permission:

- patient identity/display information;
- practice file number;
- contact information;
- appointment status;
- intake completion;
- patient-reported medication list;
- clinician-confirmed medication list;
- received documents/files;
- administrative notes.

Assistant UI must visually distinguish patient-reported data from clinician-confirmed clinical state.

---

## 11. Medication provenance

Medication state must preserve provenance.

At minimum distinguish:

- `patient_reported`
- `clinician_confirmed`

Future states may include:

- `external_import`
- `discontinued`
- `historical`

Patient-reported medication must never silently become physician-confirmed medication.

The deterministic clinical engine must receive appropriately governed medication context.

---

## 12. Structured diabetes pre-visit pack

GLYMIZE should use its diabetes-specific advantage before a visit.

A structured pre-visit flow may collect:

- current medications;
- insulin doses;
- recent HbA1c;
- recent glucose values;
- hypoglycemia history;
- weight;
- blood pressure;
- recent labs;
- uploaded documents/images;
- patient questions/goals.

The patient should see completion progress.

The clinician should receive a concise pre-visit summary without losing provenance of patient-entered data.

This is an intake aid, not autonomous diagnosis.

---

## 13. Asynchronous care

Asynchronous consultation is a first-class modality.

Patient may:

- provide structured complaint/context;
- upload permitted files/media;
- send secure messages;
- receive physician/authorized-team responses.

The system may support a practice-defined response-time expectation/SLA.

A scheduled appointment is not required for every asynchronous interaction unless practice policy requires it.

Existing secure Portal messaging/media hardening should be reused rather than replaced.

---

## 14. Live online visit and waiting room

Live audio/video comes **after** scheduling and asynchronous care are stable.

The platform should use a replaceable `LiveVisitGateway` boundary.

No single video vendor is part of the canonical clinical domain.

A waiting-room model should support:

- patient check-in;
- device readiness;
- clinician notification that patient is waiting;
- patient-visible status;
- clinician-ready state;
- authorized room/session token issuance;
- appointment-bound participant authorization.

Potential managed WebRTC providers can be evaluated later.

No live-video provider is activated by this roadmap.

---

## 15. Appointment waitlist / earlier-slot notification

A patient may opt in to:

- keep the existing appointment;
- be notified if an earlier suitable slot becomes available.

Claiming an earlier slot must still use server-authoritative locking.

An availability notification is not itself a reservation.

---

## 16. Access transparency

The patient experience should eventually expose understandable access history such as:

- clinician viewed record;
- assistant performed an authorized administrative access;
- practice action on appointment;
- significant patient-portal security activity.

This patient-facing transparency is derived from auditable server events and must not expose internal security-sensitive details.

---

## 17. Payment-readiness â€” no payment activation now

GLYMIZE currently has **no active patient-to-physician payment system**, and this roadmap does not add one.

However, scheduling must not be designed in a way that forces a major rewrite when payment is introduced.

### 17.1 Financial snapshot

An appointment should be able to carry an immutable-at-booking financial snapshot when required in the future:

- fee amount;
- currency;
- pricing policy/version;
- whether payment is required;
- payment state.

Changing the physician's later tariff must not retroactively rewrite the historical appointment fee.

### 17.2 Provider-neutral payment boundary

Future payment integration must use a boundary such as:

`PaymentGateway`

The canonical appointment/payment model must not embed one bank or gateway's schema.

Directional payment states may include:

- `not_required`
- `pending`
- `authorized`
- `paid`
- `failed`
- `cancelled`
- `refunded`
- `partially_refunded`

### 17.3 Payment intent / event ledger

Future implementation should support:

- internal payment intent ID;
- provider-neutral payment reference;
- external provider reference stored as external metadata;
- idempotency key;
- payment event ledger;
- reconciliation state;
- paid/refunded timestamps.

### 17.4 Sensitive payment data

GLYMIZE must not store raw card PAN/CVV or equivalent bank secrets.

Sensitive payment entry should remain with an authorized payment provider where possible.

### 17.5 Feature flags

Until explicitly implemented and approved:

- payment requirement is OFF;
- payment gateway capability is absent;
- booking must continue to work without a payment provider.

Insurance/e-prescription integration and patient service-fee payment are separate domains even if future workflows interact.

---

## 18. Admin controls

Platform/practice administration should eventually expose policy-driven settings such as:

- patient self-registration enabled/disabled;
- password login enabled/disabled;
- SMS OTP enabled/disabled;
- SMS reminders enabled/disabled;
- provider-directory visibility;
- referral-code policy;
- booking confirmation mode;
- reminder policy;
- asynchronous-care availability;
- live-visit capability;
- payment-required policy;
- payment provider capability.

A UI toggle must not claim a capability is enabled when the required server/provider configuration is absent.

Security-sensitive configuration changes must be audited.

---

## 19. Directional data model

Names are directional, not migration commitments.

Potential canonical entities:

- `patient_accounts`
- `patient_account_identities`
- `patient_sessions`
- `provider_profiles`
- `care_relationships`
- `referral_codes`
- `provider_availability_rules`
- `provider_availability_exceptions`
- `appointments`
- `appointment_events`
- `appointment_participants`
- `notification_jobs`
- `notification_deliveries`
- `payment_intents`
- `payment_events`

Existing domains remain authoritative where already established:

- `patient_registry`
- `patient_identifiers`
- patient encounters/snapshots/observations
- Portal threads/messages/attachments
- audit log

The final migration design must avoid duplicating existing authoritative Patient Record v2 data.

---

## 20. API / service boundaries

Directional boundaries:

- `PatientIdentityService`
- `ProviderDirectoryService`
- `ReferralService`
- `CareRelationshipService`
- `SchedulingService`
- `NotificationGateway`
- `LiveVisitGateway`
- `PaymentGateway`

External providers are adapters.

Provider-specific credentials, request formats and IDs must not become clinical primary keys.

---

## 21. Security and privacy invariants

Required principles:

- fail closed;
- strict actor/role scoping;
- practice isolation;
- server-authoritative authorization;
- short-lived access sessions with hardened refresh rotation;
- credential secrets never logged;
- PHI encrypted according to project security architecture;
- private media storage;
- attachment integrity verification;
- audit significant reads/writes/security events;
- rate-limit login/referral/booking abuse surfaces;
- do not expose clinical record merely from provider discovery;
- do not equate national-ID knowledge with identity proof;
- no production testing by overwriting production configuration.

---

## 22. Phased implementation after P4 closure

### P4 closure â€” before P5

Finish current Patient Record v2 / Portal release work:

- close or integrate open PRs safely;
- fix clinician UI capability/runtime wiring;
- complete current Portal/manual acceptance;
- RC cleanup and baseline proof;
- preserve production isolation.

### P5-A â€” Patient Identity v2 and entry separation

Implementation checkpoint (2026-09-02): RC PASS with all new public
capabilities still OFF. See
[`P5_A_RC_ACCEPTANCE_20260902.md`](./P5_A_RC_ACCEPTANCE_20260902.md). PR
CI/review and manual Preview review remain the merge gate before P5-B.

- separate patient vs physician/assistant landing entry;
- patient-only shell;
- global patient account;
- national-ID + password authentication;
- secure record-linking rules;
- SMS OTP schema/capability, OFF by default;
- admin capability gates.

### P5-B â€” Provider discovery, referral and care relationships

Implementation checkpoint (2026-09-02): P5-B1 Provider Directory RC PASS with
the public capability still OFF. See
[`P5_B1_RC_ACCEPTANCE_20260902.md`](./P5_B1_RC_ACCEPTANCE_20260902.md). PR #19
is intentionally stacked on the P5-A branch from PR #18; dependency review and
the already-passing CI validation remain merge gates.

- provider profile/directory — P5-B1 RC PASS, activation OFF;
- name / medical council code / specialty search — P5-B1 RC PASS, activation OFF;
- referral code/QR;
- care relationship lifecycle;
- multi-practice patient account.

### P5-C â€” Scheduling core

- clinician availability;
- exceptions/leave;
- configurable confirmation policy;
- slot locking;
- booking/reschedule/cancel;
- appointment lifecycle;
- payment-ready financial snapshot without gateway activation.

### P5-D â€” Notifications

- in-app notifications;
- PWA/Web Push;
- appointment event notifications;
- 15-minute reminder;
- assistant notification policy;
- provider-neutral delivery abstraction;
- SMS remains optional/off until configured.

### P5-E â€” Asynchronous diabetes care

- structured pre-visit pack;
- secure chat/files;
- async consultation lifecycle;
- response-time policy;
- clinician review;
- patient-reported vs clinician-confirmed provenance.

### P5-F â€” Live visit

- waiting room;
- patient check-in;
- clinician ready state;
- replaceable LiveVisitGateway;
- audio/video integration only after authorization model is stable.

### P5-G â€” Care-team operations

- assistant scheduling;
- referral management;
- file number visibility;
- permitted medication/intake visibility;
- delegated permissions;
- administrative workflow notifications.

### P5-H â€” Patient experience polish

- earlier-slot/waitlist;
- patient access history;
- family/proxy access design;
- follow-up journey;
- accessibility/mobile refinements.

### P5-I â€” Payment activation, only when business/legal/provider readiness exists

- select authorized gateway/provider;
- implement PaymentGateway adapter;
- payment intents/events/reconciliation;
- refunds/cancellations;
- operational monitoring;
- security/legal review.

Payment activation is not required for earlier P5 scheduling milestones.

---

## 23. Explicit non-goals for current P4 / PR #17 closure

Do **not** expand the current P4 hardening PR into a full scheduling/payment/video implementation.

Allowed future-facing changes during P4 closure are limited to changes that prevent obvious rework, such as:

- correct patient vs clinician shell separation;
- capability wiring;
- stable boundaries/interfaces;
- avoiding new practice-bound assumptions that block global patient identity;
- preserving extensible metadata/contracts where low-risk.

Do not introduce speculative migrations merely to reserve empty tables.

---

## 24. Relationship to deterministic clinical decision support

The Patient Care Hub transports identity, scheduling, patient-reported information and clinician communication.

It does not replace the deterministic clinical engine.

AI/generative components may assist with retrieval, summarization or guideline support under project governance, but they must not silently become the authoritative prescribing decision path.

Clinical authority and final sign-off remain clinician-governed.

---

## 25. Definition of architectural success

The roadmap is successful if later implementation can add:

- patient self-service;
- multi-provider relationships;
- scheduling;
- reminders;
- async care;
- live visits;
- future payment;

without redesigning Patient Record v2, weakening practice isolation, leaking patient data, or coupling the clinical engine to a marketplace, SMS vendor, video vendor, bank or payment gateway.
