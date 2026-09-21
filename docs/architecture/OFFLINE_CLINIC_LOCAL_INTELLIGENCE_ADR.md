# Proposed ADR — Offline Clinic & Local Intelligence

**Status:** Proposed architecture contract; owner-approved product direction, implementation decisions pending  
**Date:** 2026-09-21  
**Roadmap:** [Canonical Roadmap §16.1](../ROADMAP.md#161-glymize--offline-clinic--local-intelligence)  
**Existing foundations:** [R30-01](LOCAL_FIRST_R30_01.md), [Patient Clinical Core migration](PATIENT_CLINICAL_CORE_MIGRATION_ADR.md), [Runtime of Record](RUNTIME_OF_RECORD.md), [Clinical Engine Authority](CLINICAL_ENGINE_AUTHORITY.md)

## Context

The accepted R30 direction already defines PWA Offline-Lite, a Tauri 2 Windows shell, encrypted local SQLite, offline grants, adapters, sync, backup/update and blackout acceptance. It deliberately keeps Worker/D1 authoritative until those gates pass. Current code also has reusable Patient Core projections, Patient Record v2, Decision Graph v2, Evidence Assistant retrieval, replaceable remote AI configuration, additive Patient Identity and a separately authorized Patient Portal.

The owner now requires a stronger product target: a practice must be able to install GLYMIZE from offline media, create a local workspace, operate indefinitely in an intentional Local Only mode, optionally host trusted LAN clients, run deterministic clinical intelligence and supported local AI, and later opt into Cloud Sync. This must extend the existing architecture rather than create a second patient model, a second clinical engine or an offline fork of the product.

This proposal records the target and the decisions still required. It changes no current runtime authority, migration, feature flag, clinical rule or deployment.

## Proposed decision

### 1. One product, shared domain and clinical authority

Offline and online execution reuse the same versioned contracts, Patient Clinical Core semantics, Clinical Module contract, Decision Graph v2, Medication Intelligence and governed Evidence Platform. Storage and transport adapters may differ; clinical facts, rule meanings and confirmation boundaries may not.

No offline-only treatment rule, dose, threshold, hard-exclusion variant or parallel recommendation engine is permitted. AI remains outside deterministic clinical authority.

### 2. Two explicit trust profiles

| Profile | Membership/authorization source | Cloud relationship | Required UI truth |
| --- | --- | --- | --- |
| **Local Only clinic** | Locally established clinic owner and local RBAC, protected by the selected key/recovery design | None required; Cloud Sync may be enabled later through an explicit enrollment/mapping ceremony | The account and practice are local. They are not centrally verified professional identity. No sync warning is shown while Local Only remains selected. |
| **Cloud-linked clinic** | Central account/practice enrollment plus device-bound, scoped offline authorization policy | Cloud is optional for day-to-day accepted offline workflows but remains the synchronization/revocation authority | Last successful sync, pending operations, conflicts and grant state are visible. Offline revocation cannot be instantaneous. |

A central time-bounded grant is not silently reused as the root authority for a permanent Local Only workspace. Conversely, a local owner account does not become a verified central physician account merely because the device later connects. R30-07 and the additive roadmap tasks must design an explicit transition that preserves audit history and never elevates identity by identifier equality.

### 3. One operational clinic database

A clinic host owns one encrypted operational database for its workspace. Desktop use on that same machine is the first deployment slice. Later phones/tablets are clients of the host over a reviewed local API; they do not each maintain independently writable clinic databases.

The local schema must preserve internal UUIDs, practice/patient scope, append-only or revisioned history, provenance, source versions, optimistic revisions, outbox/inbox state and conflict evidence. SQLite remains the leading candidate because it fits the existing Tauri/R30 direction, but the encryption method and key/recovery design remain R30-04-A decisions. Plain SQLite plus Stronghold is not presumed to encrypt database pages, WAL, journals, temp files, attachments or backups.

### 4. Identity is typed; UUID remains internal authority

Every local patient, encounter and operation receives an internal random UUID. Human identifiers are typed aliases and lookup inputs, never database primary keys:

- Iranian national ID, checksum-validated when present;
- a defined foreign-resident identifier with issuer/type metadata;
- passport number plus issuing country;
- a clearly labelled temporary local identifier for patients without documents.

Do not generate a national-ID-looking value, including a `0000` prefix. Sync identity matching must preserve old identifiers and provenance, use explicit reviewed links/merge records, and never silently collapse two clinical records. A temporary identifier remains temporary until an authorized identity-resolution action records the mapping.

### 5. Offline accounts and recovery are separate from central verification

Local installation may create a clinic workspace and local owner account without Internet. Local clinicians and care-team users require individual credentials, roles and permissions; shared anonymous clinic access is not acceptable. Offline re-login, lockout, credential change, audit and recovery must be tested without Cloud.

Patient offline access is limited to a separately prepared, encrypted and authorized device subset. Clinician credentials/grants never authorize the Patient Portal trust domain. Local recovery cannot bypass encryption or silently reset professional identity; key custody, recovery factors and data-loss boundaries remain explicit R30-04/R31 work.

### 6. Clinic Host and LAN clients

The installed desktop may host the local database, narrow local API, authentication/RBAC, PWA assets, deterministic clinical engine, local AI provider and sync queue. Single-device operation remains fully supported and must not require networking.

LAN access requires an authenticated HTTPS origin and a reviewed certificate/trust/bootstrap design. Service Workers and installable PWA behavior cannot be assumed for an arbitrary plain-HTTP LAN IP. Android and iOS installation, certificate trust, reconnect and offline behavior require separate acceptance matrices.

QR flows have distinct purposes and encodings:

- **network/bootstrap hint**: optional Wi-Fi/host discovery information;
- **device pairing**: short-lived challenge bound to host identity, session and requested device; human approval assigns a role;
- **patient transfer**: a separate namespace and consent/authorization workflow, never accepted as device pairing.

Scanning a QR never grants patient access by itself.

### 7. Offline patient transfer

Patient transfer uses a consented, scope-minimized, encrypted and integrity-protected transfer package. QR may carry only bounded bootstrap/fingerprint/key material; large clinical payloads use an encrypted file or other reviewed offline medium. Export and import retain patient/encounter/operation UUIDs, source revisions and provenance, and use idempotency records so re-import or later sync cannot duplicate visits.

Recipient authenticity, sender authorization, patient consent/policy, key exchange, expiry/revocation and merge review remain design gates. Transfer is not an implicit global-identity merge.

### 8. Deterministic offline clinical and evidence execution

Reviewed rule packs, Decision Graph v2, Medication Intelligence and approved evidence objects are versioned installable bundles. Offline execution must expose bundle version, source/evidence version and freshness state, preserve hard exclusions and missing-data behavior, and require the same physician confirmation as online execution.

Bundle signatures/checksums establish artifact integrity, not clinical approval by themselves. Unsupported, expired or absent clinical bundles fail according to reviewed policy without substituting AI or stale hidden rules.

### 9. Local AI is an interchangeable Copilot provider

Local AI is added behind the existing AI Copilot/provider boundary. It may summarize authorized chart context, answer grounded questions, explain deterministic output, retrieve evidence, identify missing information and draft actions for physician confirmation. Failure or absence of local AI cannot block records, deterministic rules or normal clinic operation.

No model or runtime is selected by this ADR. Candidates must be evaluated on Persian/English quality, patient/evidence grounding, citation fidelity, safety behavior, prompt-injection resistance, RAM/VRAM/CPU, latency, hardware tiers, artifact size, offline distribution/update, license and redistribution terms. Existing Qwen, llama.cpp or other names in older design notes are candidates only, not approved defaults.

### 10. Optional Cloud Sync, backup and recovery

Cloud Sync uses a durable transactional outbox/inbox, idempotent operation IDs, acknowledgements, delta positions, tombstones, base revisions and explicit clinical conflict handling. Local changes remain until acknowledged or explicitly resolved. Clinical facts/orders never use automatic last-write-wins.

Cloud-linked users see last sync, backlog and conflicts. If unsent eligible operations remain for more than seven days, show a weekly warning without deleting or reordering them. Local Only mode suppresses Cloud Sync warnings while retaining local backup/recovery reminders.

This roadmap introduces no ArvanCloud or other Iranian hosted-server dependency. Any future mirror or alternative sync host remains a separate owner decision; it is not required for Local Only operation.

Encrypted backup and workspace relocation must work offline and cover unsynced data, database side files, attachments, audit/outbox state, keys and compatibility metadata. Restore tests must prove both successful recovery and safe failure for wrong/lost keys, corruption, interrupted migration and version mismatch.

## Compatibility and transition

Current Worker/D1 Patient Record v2 remains the implemented patient/encounter authority. This proposed target does not silently supersede the accepted Runtime-of-Record or Patient Core migration ADR. R30-04/05/06/07 and the R31 integration tasks must define, test and document the authority of each supported command in Local Only and Cloud-linked profiles before activation.

The existing Patient Core projection is the shared read/context contract. The existing Decision Graph v2 remains Type 2 authority. Existing central Patient Identity and Patient Portal remain separate trust domains. Existing R29 cache/replication work applies to eligible cloud paths; durable local clinical storage is not a cache, and D1 bookmarks do not synchronize SQLite.

## Open decisions and owner gates

1. R30-04-A: SQLite encryption approach, page/metadata exposure, device/password binding, key rotation, backup custody and recovery proof — **Astra High before implementation**.
2. Local Only root-account lifecycle, recovery quorum and later central enrollment without identity elevation.
3. Clinic Host TLS identity, certificate trust/bootstrap, discovery and network-isolation design for Windows, Android and iOS.
4. Local API protocol/capability surface and process isolation for database, AI and imported documents.
5. Exact sync command/revision/conflict contracts and migration compatibility with Worker/D1.
6. Offline transfer authorization, consent, package format, key exchange and deduplication policy.
7. AI model/runtime evaluation matrix, licensing/redistribution review and hardware-tier packaging.
8. Signed clinical/evidence/model bundle lifecycle and safe offline update/rollback.

No ADR status may move from Proposed to Accepted merely because roadmap documentation exists. Each decision needs its named evidence and model checkpoint.

## Acceptance boundary

Final acceptance requires a clean offline Windows VM installed from removable media; Local Only workspace/account creation; offline re-login after restart; patient/encounter/diagnosis/medication/lab/history operations; deterministic clinical execution; one supported local-AI tier; encrypted backup/restore; Clinic Host pairing and PWA use on independently tested Android and iOS paths; authorized patient transfer; reconnect/sync/conflict behavior; and proof that GitHub/Cloudflare blocking does not disable accepted local workflows.

This ADR records no completed capability. R30-03-C2 remains open until its real clean-VM runner finalizes. No migration, provider/model activation, deployment or clinical behavior change is authorized here.

## Constraint references

- [Microsoft WebView2 offline distribution](https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution)
- [MDN PWA installability and secure-origin requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [MDN Service Worker secure-context requirements](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Tauri SQL plugin](https://v2.tauri.app/plugin/sql/) and [Tauri Stronghold plugin](https://v2.tauri.app/plugin/stronghold/)

These external constraints inform later design/acceptance work; they do not select an implementation or replace repository evidence gates.
