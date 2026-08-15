# GLYMIZE — Clinical Product & Research Roadmap

Status: Living roadmap / architecture contract
Updated: 2026-08-15
Primary release branch: `release/glymize-clinical-ui-auth-v1`

## 0. Product north star

GLYMIZE is not intended to remain a diabetes-drug recommender. The long-term product is a physician-facing clinical workspace that:

- reduces missed clinical issues;
- structures pre-visit data collected by assistants/nurses;
- detects clinically important abnormalities across multiple organ systems;
- produces explainable, guideline-bound treatment considerations;
- proposes medication actions and dose/titration plans rather than only drug names;
- incorporates Iran market, package, insurance and out-of-pocket cost data;
- preserves longitudinal patient history;
- records the physician's final decision without forcing acceptance of GLYMIZE recommendations;
- supports privacy-preserving research and product-quality analytics;
- is architected to expand after diabetes into neurology, gastroenterology, nephrology and other specialties.

Core safety rule: **GLYMIZE may store a broad clinical dataset, but no datum may change treatment unless an explicit, versioned and traceable clinical rule permits it.** LLM output must never invent treatment thresholds or doses.

---

## 1. Release discipline and safety

- RC acceptance before production.
- No silent production Worker deployment.
- No merge of the current release PR until acceptance gates are complete.
- All clinical rules must be versioned and source-bound.
- Clinical recommendation, physician decision and physician override must be separate concepts.
- Patient identifiers must not be exposed in analytics/research exports.
- Clinical data must not be treated as anonymous merely because name is absent.
- Fail closed for authentication, authorization, credential verification and unsafe clinical decision paths.
- Browser clinical-runtime traffic must not depend on direct reachability of a vendor preview hostname. RC/production may use a same-origin, fixed-upstream gateway on the application domain; it must not become an open proxy, and Admin OAuth routing remains independently configurable.

---

## 2. Identity, physician onboarding and care-team access

### 2.1 Physician identity

Primary identity remains Medical Council / IRIMC exact matching where available.

Authentication/verification channels must be independently configurable by Admin with three policies where appropriate:

- `OFF`
- `OPTIONAL`
- `REQUIRED`

Examples:

- IRIMC verification: normally `REQUIRED`.
- Email verification via Resend: may begin `OPTIONAL` and later become `REQUIRED`.
- SMS verification: may be `OFF`, `OPTIONAL` or `REQUIRED`.

A transient failure of an OPTIONAL email/SMS provider must never block a physician who otherwise satisfies the required identity policy.

### 2.2 Email and SMS

- Transactional email provider: Resend.
- Default sender: `GLYMIZE <info@glymize.ir>`.
- Existing inbound email forwarding to the owner may remain independent.
- Assistant invitation email must be generated and sent automatically by GLYMIZE.
- Registration verification OTP by email must be supported when Admin enables it.
- SMS equivalents may be enabled independently by Admin.
- Provider secrets remain server-side and encrypted/not returned to browsers.

### 2.3 Assistant / nurse invitation

Target flow:

1. Physician enters assistant identity/contact.
2. Physician grants explicit permissions.
3. GLYMIZE creates a one-time invitation token.
4. GLYMIZE sends invitation through Resend when the corresponding Admin policy is enabled.
5. Invitation URL is generated from an environment-specific public application URL, never a hard-coded `/GLYMIZE` path.
6. Assistant sees physician/practice identity and granted permissions.
7. Assistant accepts invitation and chooses a personal password.
8. Later sign-in supports assistant email/mobile + password.
9. Permission changes remain controlled by the physician/practice owner.

Invitation tokens must expire and must not be embedded in a PWA manifest or permanent shortcut.

### 2.4 Assistant PWA

Future enhancement:

- Dedicated install experience for the assistant/care-team workspace.
- Separate PWA `id` and assistant-oriented `start_url` (e.g. `/care-team/`).
- Authorization still comes from the runtime session/backend, not from the PWA itself.

### 2.5 Owner/Admin privacy gate

Before showing GitHub OAuth UI, add an owner-only server-side password gate:

- secret stored only in Cloudflare secret storage;
- rate limited;
- short-lived unlock token;
- `/auth/start` must reject requests without valid owner unlock state;
- GitHub OAuth remains the second/authenticated Superadmin layer.

Goal: casual visitors should not learn that GitHub is the owner authentication provider.

### 2.6 Private repository

Long-term target: make the source repository Private after final hosting/runtime dependencies are verified. Cloudflare direct deployment must not rely on the repository being public. Re-test any GitHub OAuth/publishing integration after the visibility change.

---

## 3. Patient identity: multiple identifiers, one patient

A patient must have a stable internal random `patient_id` scoped to a practice.

A patient may have multiple identifiers at the same time:

- practice file number;
- Iranian national ID;
- other local identifier.

Both file number and national ID must be usable for lookup. They must resolve to the same patient rather than creating duplicate longitudinal records.

Privacy design:

- direct identifiers are never analytics keys;
- national ID/file number searchable through keyed hash/HMAC;
- original identifier may be retained only encrypted for authorized clinical retrieval;
- UI uses masked identifier when full value is unnecessary;
- names/contact/demographics remain protected clinical data.

Date of birth is preferred over storing a static age. Age is derived at encounter time.

---

## 4. Longitudinal patient record and encounters

Current single-record overwrite/revision behavior is insufficient for clinical history.

Target model:

- Patient master
- Multiple identifiers
- Multiple encounters/visits
- Append-only clinical snapshots/revisions
- Medication reconciliation
- Physician final prescription
- Historical trend retrieval

A new visit must not overwrite a previous visit.

Care-team workflow for a returning patient:

1. Search by file number/national ID.
2. Show patient summary and prior visits.
3. Offer `Create new visit from previous data`.
4. Carry forward stable information where appropriate.
5. Require review/reconfirmation of current medication and new labs/vitals.


Sequential Care Team intake for different patients:

- provide an explicit `Create new patient handoff` action without requiring navigation away from Care Team;
- compare the current draft with the last successfully saved/loaded state before clearing it;
- when unsaved changes exist, require an explicit choice between `Save and start new`, `Discard and start new`, and `Cancel`;
- the `Save and start new` path may clear the form only after the save succeeds; a failed save must retain the current draft;
- a clean/already-saved draft may reset immediately;
- resetting for a different patient must clear patient identity, vitals, flags, medications, labs, OCR text, notes and loaded revision state.

Physician workflow:

- load latest prepared visit;
- preview data;
- apply confirmed data;
- inspect previous visits;
- inspect `What changed since last visit`;
- inspect trends.

---

## 5. Full laboratory observation model

Do not restrict storage to HbA1c/eGFR/UACR.

Store every clinically extractable laboratory observation present in the source report, including but not limited to:

OCR/PDF parsing must continue after the first matched analyte even when a laboratory table is flattened into one long text line. Value, unit, reference interval/threshold and abnormal flag extraction must be bounded to the corresponding analyte window so neighboring tests cannot contaminate each other.

- glycemia: glucose, FBS, 2hPP, HbA1c;
- lipid: total cholesterol, LDL, HDL, TG, non-HDL where available;
- kidney: creatinine, eGFR, BUN, UACR, urine albumin/creatinine data;
- liver: AST, ALT, ALP, bilirubin, albumin and other reported indices;
- CBC/hematology: Hb, Hct, RBC, WBC/differential, platelets, MCV, MCH/MCHC, RDW;
- iron/deficiency: ferritin, serum iron, TIBC/transferrin/TSAT where available;
- vitamins: B12, folate, vitamin D and other measured supplements/nutrients;
- thyroid: TSH, FT4/T4/T3 when present;
- electrolytes/minerals: sodium, potassium, calcium, phosphorus, magnesium and related tests;
- inflammation: ESR, CRP/hs-CRP where present;
- any other laboratory test present in the patient report.

An ordered investigation and an observed result are different clinical objects. `PhysicianInvestigationOrder` records what the physician asked to be done; a laboratory observation records the result actually measured. A future result may satisfy/link to an earlier order, but the order must not be overwritten by the result.

Each observation should preserve:

- raw test name;
- canonical key/code when mapped;
- numeric/string value;
- unit;
- specimen/date when available;
- laboratory-provided reference low/high or reference text;
- laboratory abnormal flag when available;
- source (manual/OCR/PDF/import);
- OCR confidence/provenance where available;
- human verification status;
- encounter association.

Full values must be retained (not hashed). Sensitive clinical payloads should remain encrypted at rest while still being decryptable by authorized runtime services for longitudinal display and controlled export.

---

## 6. Lab safety, abnormal-result alerts and Clinical Blind Spot Detector

Three separate concepts:

1. **Out of laboratory reference range** — display for physician awareness even when not diabetes-specific.
2. **Clinically relevant to treatment** — a versioned rule shows that the finding may change medication choice/dose/monitoring.
3. **High-priority safety/referral signal** — only when supported by a validated rule and sufficient context.

Do not equate `abnormal` with a diagnosis.

### ESR

ESR is a nonspecific inflammation marker and cannot diagnose a cause by itself. GLYMIZE should:

- store ESR as a standard observation;
- compare with the laboratory reference range/age-sex context when available;
- flag marked/persistent abnormalities for clinical review;
- consider CRP, CBC, symptoms and other context;
- never generate a disease-specific treatment solely from ESR.

### Anemia / B12 example

Pattern such as persistent/unexplained anemia despite adequate/high B12 must not be reduced to `give more B12`.

Possible GLYMIZE behavior after a validated hematology rule pack exists:

- red/high-priority alert for unexplained persistent anemia;
- show missing/important discriminators (MCV, reticulocyte data, ferritin/TSAT, renal function, folate, hemolysis/bleeding context, etc. as rule pack requires);
- recommend clinician review and, when criteria are met, specialist hematology referral consideration;
- do not diagnose malignancy or another cause from incomplete data.

### Bone health / calcium

Do **not** implement `age >60 => prescribe calcium`.

Implement a bone-health domain using age, diabetes, fracture history/risk, medications, BMD where available, dietary intake and other validated factors. Guideline-aligned logic should focus on ensuring adequate calcium/vitamin D intake and fracture-risk assessment; supplementation is considered when intake/clinical context warrants it, not automatically because of age alone.

---

## 7. Integrated multi-domain clinical engine

GLYMIZE scenarios must evolve from `diabetes drug scenarios` into an integrated clinical action plan.

Planned domain engines:

- Glycemic management
- Cardiovascular / ASCVD risk
- Lipid management
- Hypertension
- Kidney protection / CKD
- Liver / MASLD-MASH
- Weight / obesity
- Bone health / fracture risk
- Hematology / deficiency signals
- Thyroid and other relevant endocrine findings
- Medication safety
- Drug-drug / drug-condition interaction
- General abnormal-lab awareness
- Referral / escalation signals

The drug master registry may contain diabetes, cardiovascular, renal, hepatic, neuropsychiatric, sleep and supplement products. Presence in the registry does not authorize recommendation. Each therapeutic domain needs a validated rule pack.

Scenario output should be organized by domain and action rather than only by drug class.

---

## 8. Medication Action & Dose Engine

For every current or proposed medication, GLYMIZE should be able to produce an explainable action:

- `KEEP`
- `UP_TITRATE`
- `DOWN_TITRATE`
- `HOLD`
- `STOP`
- `SWITCH`
- `ADD`

Required context may include:

- current dose and schedule;
- adherence;
- tolerance/adverse effects (e.g. GI tolerance with metformin);
- kidney/liver function;
- hypoglycemia risk;
- age/frailty;
- interactions;
- current glycemic/clinical target gap;
- validated titration rules.

Output should include, where evidence permits:

- current total daily dose;
- proposed dose;
- titration step/interval;
- max/target bounds when applicable;
- monitoring requirements;
- rationale;
- contraindications/stop conditions;
- source/rule-pack version.

Insulin requires dose/unit logic rather than static strength dropdowns, including current dose, proposed next dose and titration safeguards.

LLMs must not invent dose numbers.

### Missing-data investigation action

The engine may emit `REQUEST_INVESTIGATION` when a required datum is unavailable **only** when an explicit approved/versioned clinical rule defines:

- the missing required-data key;
- the investigation/test that can obtain the needed information;
- rationale/reason code;
- priority and timing;
- whether the missing datum blocks a treatment decision;
- source IDs and active rule-pack version.

An engine investigation recommendation is not a medical order. The physician must accept, modify or reject it before it can appear in the signed Final Plan. LLMs must never invent a test request or convert a missing field into an order without an approved rule.

---

## 9. Shared medication selector and dose schema

Create a single reusable medication-entry system used in:

- Type 2 current medication entry;
- Care Team medication entry;
- medication reconciliation;
- physician final prescription;
- future specialty modules.

Features:

- autocomplete/filter from the canonical medication registry;
- canonical generic/product identifier stored with display name;
- standard marketed strengths loaded automatically;
- formulation-specific dose entry;
- validated frequency choices;
- total daily dose calculation;
- prevention of impossible/obvious data-entry errors;
- payer/insurance registration code resolution for the selected product/provider;
- snapshot of selected generic/brand/IRC/insurance codes when a medication order is signed, with source/freshness metadata.

Dose modes should support at least:

- `strength_based` (e.g. tablets/capsules);
- `continuous_units` (e.g. insulin units);
- `titration_steps`;
- `product_strength` / fixed-dose combination;
- formulation-specific custom mode when necessary.

Do not create separate inconsistent medication-entry widgets for physician and assistant.

---

## 10. Physician final plan, medication/investigation orders and care-team execution

Scenario recommendations are not the final medical order. The physician's final output is a **Final Plan**, not merely a drug prescription.

A signed Final Plan may contain:

- medication orders;
- laboratory/investigation orders;
- both;
- or no new medication at all when investigation/monitoring is the appropriate next action.

### 10.1 Medication orders

Medication orders use the shared Medication Selector + Dose Schema and may include:

- canonical generic/product identity;
- brand/product when selected;
- formulation/strength/route;
- dose and frequency;
- duration/quantity when appropriate;
- payer/insurance registration snapshot:
  - insurer/provider;
  - generic insurance code;
  - brand insurance code;
  - generic/brand registry code;
  - IRC code when available;
  - source/freshness metadata.

If a payer code is unavailable, GLYMIZE shows it as unavailable; it must never invent one. Historical signed orders retain the code snapshot used at sign-off even if the live catalog later changes.

### 10.2 Investigation / laboratory orders

The physician may order investigations independently of medication changes. Each order should preserve, where applicable:

- canonical Lab Master Registry key for laboratory tests;
- raw/display order name;
- specimen/context when relevant;
- timing (`now`, `before_next_visit`, `at_next_visit`, `routine`);
- priority;
- fasting/preparation instructions;
- structured reason code;
- payer/service registration code for the selected insurer when available;
- link to an engine investigation recommendation when one was accepted or modified.

If an insurer/service code for an investigation is unavailable, GLYMIZE must show it as unavailable rather than inventing a code.

An investigation order is distinct from the eventual result. When a result later arrives through OCR/PDF/manual/import, it is stored as a laboratory observation and may be linked back to the originating order.

### 10.3 Physician sign-off and provenance

Persist separately:

- engine recommendation;
- physician final decision;
- accepted/modified/rejected state;
- signed Final Plan version;
- medication and investigation orders;
- optional structured reason for override;
- engine/rule-pack version at decision time.

Signed plans are encounter-scoped and immutable. A later change creates a superseding plan/version rather than silently rewriting history.

### 10.4 Care Team visibility and execution

After authorized Care Team staff open a patient by file number or national ID, they must be able to see the **latest signed physician Final Plan** for that patient/encounter.

The Care Team view is read-only for physician-authored clinical content and shows:

- medication orders with dose/frequency and payer/insurance registration codes;
- investigation/laboratory orders, payer/service codes when available, and preparation/timing instructions;
- order status and plan version/sign-off time.

Care Team administrative execution is stored separately from the physician order. Depending on permission, staff may append fulfillment states such as:

- pending;
- submitted to payer;
- registered;
- scheduled;
- collected;
- result received;
- completed;
- unable to process.

Care Team fulfillment must never alter the signed clinical order itself.

At a later visit the assistant/nurse should load the last physician-approved medication list for reconciliation and see pending/completed investigation orders before collecting new data.

---

## 11. Cost & insurance engine

Price calculation must be dose-aware and package-aware.

Pipeline:

1. selected medication/product/strength;
2. dose per administration;
3. frequency;
4. units/day;
5. units for selected time horizon (e.g. 30 days);
6. package size / usable quantity;
7. number of packages required;
8. gross reference cost;
9. insurer coverage/rules;
10. estimated patient out-of-pocket.

Generic reference price should resist premium-brand outliers.

Preferred approach:

- normalize comparable brand/product prices;
- filter unavailable/inactive entries;
- derive a central 80% market band (for example P10-P90);
- use a robust center such as median or availability-weighted median within the band;
- show premium/outlier brands separately rather than allowing them to distort the reference estimate.

For a signed medication order, payer-registration identifiers used for execution must be snapshotted with source/freshness metadata. Live catalog changes must not rewrite historical signed orders.

Display:

- GLYMIZE reference monthly cost;
- typical market range;
- insurance estimate;
- patient estimate;
- data freshness;
- cost confidence (High/Medium/Low).

---

## 12. Focused Workflow

Patient lookup is the first **optional** step, not a mandatory gate.

Target steps:

1. Patient
2. Glycemia & current regimen
3. Phenotype & decision factors
4. Insurance, cost & preference
5. Scenarios & rationale

Patient step supports:

- file number as first-priority entry;
- national ID;
- other supported identifier;
- `Load patient`;
- `Send/guide to Care Team`;
- `Continue without patient record`.

A physician must always be able to proceed and manually enter a new patient when no prepared file exists.

---

## 13. Patient timeline and trends

Provide simple longitudinal views after sufficient visits exist:

- HbA1c
- fasting/random glucose where comparable
- weight
- BMI
- systolic/diastolic blood pressure
- eGFR
- UACR
- LDL / HDL / TG / total cholesterol
- selected liver markers
- hemoglobin/iron-related markers when relevant
- other observation trends when clinically useful.

Never interpolate missing values as if measured.

The longitudinal view should distinguish ordered investigations from completed results and surface pending physician orders to authorized Care Team users.

Add `What changed since last visit` summary:

- major lab changes;
- new/worsened abnormal flags;
- medication changes;
- dose changes;
- weight/BP changes;
- new safety signals.

---

## 14. Research, analytics and de-identified scientific export

GLYMIZE should support scientific evaluation without exposing individual patient or physician identity.

### Patient research export

Exclude direct identifiers:

- name;
- national ID;
- practice file number;
- email/mobile;
- address or similar direct identifiers.

Use a research subject key that cannot be used by an external recipient to recover the original identifier.

Potential research variables:

- demographics at an appropriate privacy granularity;
- diabetes duration;
- longitudinal labs;
- diagnoses/clinical flags;
- current and prior medications/doses;
- engine recommendation;
- physician decision/override;
- outcomes at follow-up;
- insurance/cost category where appropriate;
- engine/rule-pack version.

Exports require governance, minimum cohort-size rules where appropriate and explicit controls; `de-identified` must not be claimed solely because name/national ID were removed.

### Physician prescribing-style research

Future optional research capability to study prescribing behavior while protecting physician identity.

Examples:

- older vs newer therapies preference;
- single-agent vs fixed-dose-combination preference;
- conservative vs aggressive dose titration;
- injectable vs oral preference when both are clinically reasonable;
- recommendation acceptance/modification patterns;
- cost sensitivity;
- guideline-adoption patterns over time.

Rules:

- no public or research export keyed by physician name, Medical Council number, email or stable directly identifying account ID;
- use cohort/anonymous research keys;
- report aggregates with minimum sample thresholds;
- separate quality/safety analytics from punitive physician ranking;
- physician-level feedback, if ever shown, is private to that physician unless explicitly consented otherwise.

Possible scientific outputs:

- recommendation acceptance rate;
- common override categories;
- treatment-inertia metrics;
- adoption of newer therapies;
- dose intensification patterns;
- clinical outcomes by treatment pathway.

---

## 15. Public impact dashboard

After adequate data quality, follow-up duration and privacy review, GLYMIZE may show aggregate program impact on the public/entry experience, such as:

- number of completed clinical assessments;
- number of medication-safety checks;
- number of clinically relevant alerts surfaced;
- anonymized aggregate longitudinal outcome measures where scientifically valid;
- guideline/rule-pack coverage and update freshness.

Never publish small-cell or potentially re-identifying statistics. Do not claim causality from observational product data without appropriate study design.

---

## 16. Personalization and retention

### Birthday / relationship messaging

For registered physicians and assistants only, date of birth may be an optional profile field.

Admin/user preference may enable:

- birthday email;
- birthday SMS;
- account anniversary message.

Do not scrape/archive birthdays of unregistered clinicians for unsolicited outreach unless a future legal/ethical review and source authorization explicitly permits it.

### Product personalization ideas

- annual personalized `GLYMIZE clinical year in review` for the physician;
- private aggregate insights such as patients reviewed, common risk domains detected, cost-saving estimates and follow-up completeness;
- release notes focused on clinical value rather than technical changes.

---

## 17. Additional high-value intelligent features

### Treatment Inertia Detector

Detect when a patient remains above individualized target across visits without an apparent treatment adjustment, while considering contraindications, adherence/tolerance, frailty and clinician-documented reasons.

### Missing Critical Data Prompt

Before recommendations, state when a decision is limited by missing information (e.g. current eGFR/UACR/potassium or other domain-specific prerequisites).

### Pre-visit Completeness Score

For the assistant, show whether essential patient data for the intended clinical workflow are complete, missing or stale.

### Clinical Blind Spot Detector

Surface clinically relevant issues that may be overlooked during a diabetes-focused visit, such as lipid risk, renal risk, hypertension, anemia pattern, liver abnormality or another validated domain signal.

### Evidence Trace

Every treatment-changing recommendation should expose:

- rule identifier;
- guideline/source;
- version/date;
- patient facts that triggered the rule;
- missing information/uncertainty;
- safety gates.

### Market freshness

Every cost/insurance output should carry source date/freshness and confidence.

---

## 18. Multi-specialty future architecture

After diabetes reaches a stable clinical release, reuse the same platform primitives for other specialties:

- neurology;
- gastroenterology;
- nephrology;
- cardiology;
- other domains as evidence/rule packs mature.

Shared primitives should include:

- identity/auth;
- patient master and identifiers;
- longitudinal encounters;
- lab observations;
- medication registry/selector/dose schema;
- final physician order;
- guideline/rule engine;
- evidence trace;
- communications;
- analytics/research export;
- privacy/audit controls.

Specialty-specific logic belongs in versioned domain rule packs, not duplicated application infrastructure.

---

## 19. Implementation order / gates

### P0 — Release stability and care-team access

- [x] Runtime password credential path fixed for workerd-compatible KDF.
- [x] Runtime session cache/sign-in loop fixed and RC browser permission gate accepted.
- [ ] Fix assistant invitation public URL (remove hard-coded `/GLYMIZE`).
- [ ] Enforce Admin assistant-invitation email policy.
- [ ] Verify automatic Resend delivery from `info@glymize.ir`.
- [ ] Assistant invitation acceptance + initial password setup.
- [ ] Assistant later sign-in with email/mobile + password.
- [ ] Fix patient handoff save failure with explicit diagnostic errors.
- [ ] Complete synthetic-account permission/CSV/delete acceptance from the current release checklist.

### P1 — Longitudinal patient foundation

- [ ] Apply/migrate Patient Record v2 schema after RC validation.
- [ ] Multi-identifier patient master (file number + national ID + other).
- [ ] Append-only encounters/snapshots.
- [ ] Full lab observation storage model.
- [ ] Medication reconciliation/history.
- [ ] Physician final prescription persistence.
- [ ] Patient timeline and trends.

### P2 — Data-entry quality

- [ ] Shared MedicationSelector.
- [ ] Standard strengths and dose schema.
- [ ] Frequency normalization.
- [ ] Total daily dose.
- [ ] Same component in physician and assistant workflows.
- [ ] Profile-photo preview and provenance preservation.
- [ ] Focused Workflow patient step with skip/care-team alternatives.

### P3 — Integrated clinical intelligence

- [ ] General abnormal-lab alerting.
- [ ] Clinical Blind Spot Detector.
- [ ] Glycemic action engine.
- [ ] Lipid/CV engine.
- [ ] Hypertension engine.
- [ ] Kidney engine.
- [ ] Liver/MASLD engine.
- [ ] Bone-health engine.
- [ ] Hematology/deficiency/referral signals.
- [ ] Medication interaction/safety engine.

### P4 — Dose and medication action

- [ ] KEEP/UP/DOWN/HOLD/STOP/SWITCH/ADD actions.
- [ ] Titration protocols.
- [ ] Insulin unit logic.
- [ ] Monitoring/follow-up actions.
- [ ] Physician override tracking.

### P5 — Cost/insurance

- [ ] Package quantity normalization.
- [ ] Dose-to-monthly-pack calculation.
- [ ] Robust central-80% reference price.
- [ ] Insurance/patient-share calculation.
- [ ] Cost freshness/confidence.

### P6 — Research, analytics and engagement

- [ ] De-identified scientific export.
- [ ] Physician prescribing-style cohort analytics.
- [ ] Recommendation acceptance/override research.
- [ ] Outcome/follow-up research datasets.
- [ ] Public aggregate impact dashboard after scientific/privacy review.
- [ ] Optional birthday/anniversary communications for registered users.

### P7 — Multi-specialty expansion

- [ ] Neurology discovery/rule-pack architecture.
- [ ] Gastroenterology.
- [ ] Nephrology.
- [ ] Additional specialties based on validated demand and evidence.

---

## 20. Definition of done for a new clinical feature

A clinical feature is not complete merely because UI exists. It requires:

1. explicit data contract;
2. privacy classification;
3. backend authorization;
4. versioned clinical rule where treatment-changing;
5. deterministic tests;
6. browser acceptance on RC;
7. auditability/evidence trace;
8. failure-state UX;
9. production invariant verification;
10. documentation in this roadmap/checklist.

This document should be updated whenever a new GLYMIZE product, medical, research or marketing idea is accepted so it is not lost between implementation phases.
