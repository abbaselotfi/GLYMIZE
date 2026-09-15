# R29-04-D — History scope lookup security/behavior review

Date: 2026-09-14
Status: bounded High review complete; implementation pending R29-04-E

## Decision

Permit a **default-OFF, independent opt-in** to replace the unused full patient summary read on the exact authorized history GET with a narrow, measured registry lookup. This is a deliberate dependency/error-boundary change, not a claim of identical failure behavior for every database fault. Do not implement it in this review packet.

The registry lookup is an existence/scope check, **not authorization**. Runtime session validation, handoff.read, patient_record.workspace.read role checks and their existing primary database ownership remain unchanged. The trusted practice comes from the authenticated context, never a query parameter/cursor assertion.

## Source evidence (Tier 2, bounded)

- platform-index.ts gates patient dispatch with requireRuntimeUser; the facade context carries auth.user and a runtimeUserCanAccessPatientRoute closure over the original database. That closure delegates user/practice/route authorization to authorizePatientRoute. This review does not re-audit every authentication/RBAC implementation.
- patient-core/route.ts runs permission/role checks before patient parsing/history work; history requires the exact GET path, valid family and a cursor. Session opt-in validates cursor scope before session creation. Non-history/authority/write dispatch remains separate.
- readPatientLongitudinalHistoryPage calls readPatientCoreSummary, tests only whether a patient exists, then discards that summary. Returned payload consists of history family, scope, generatedAt and collection; summary/demographics are not included.
- readPatientCoreSummary first queries registry by practice_id and id. On a hit it reads identifiers, demographics and latest encounter, then decrypts demographics if present. It does not use demographics, identifiers or active status as an authorization decision. A missing demographics row is already allowed.
- patientExistsInAuthorityScope already exists, but is tied to the full authority context and not instrumented for this read path. Do not widen/refactor the write-authority helper just to reuse it.
- The read-session adapter retains first-primary and its ordered queue. The registry lookup must remain its first executed history query. A session is not a snapshot or an additional permission grant.

Direct source inspected for these claims: platform-index.ts (dispatch and role closure), patient-core/{route,read-model,patient-summary-reader,read-session,authority-storage}.ts, patient-record-v2/context.ts and relevant read-session tests. Coverage reported metadata drift; exact source, not graph absence, supports the decision.

## Implementation contract for E (Medium)

1. Extract the existing registry query into a small read helper, preferably in patient-summary-reader.ts, accepting only the narrow read context plus optional metrics. Preserve SQL shape and bind order: SELECT id,status FROM patient_registry WHERE practice_id=? AND id=?. Return the row or null; propagate query failures.
2. Reuse that helper in the existing full summary reader without changing its behavior. Only the history reader may select the narrow lookup. Do not add status='active': archived rows are currently accepted, and this packet must not redefine archive access.
3. Gate history selection through exact-string PATIENT_CORE_HISTORY_SCOPE_LOOKUP_ENABLED === "true", threaded via facade/route/read options. Default/false/unknown values retain the legacy full summary. Independent of D1 sessions and key reuse; no Wrangler configuration/remote activation.
4. Keep the original context immutable. Pass the existing request-owned database capability: direct-primary when sessions are OFF, fresh-primary registry start when ON. No extra uninstrumented read, global existence cache, fallback retry, bookmark transport or authority/write redirect.
5. Preserve cursor/sourceVersion/AAD rules, source counts, exclusion accounting, pagination ties, completeness and response shape. Do not move validation or change error precedence as incidental cleanup.
6. Registry failures and requested-history query/decryption failures still propagate to the existing sanitized 500 path. Never convert a failed lookup into null/404 or an empty successful history. No fallback to cached/client-supplied identity.
7. Full summary/workspace/authority paths remain strict. No change to their handling of corrupted demographics or failed identifier queries. No new PHI log or fabricated integrity/complete status on history responses.
8. Rollback disables only the new flag at request entry. In-flight requests keep their selected path. No migration/dependency/schema change.

## Explicit behavior matrix

| Condition | Existing path | Opt-in contract |
| --- | --- | --- |
| Missing runtime authentication | 401 before patient dispatch | unchanged |
| Permission or patient-role denial | 403 before history reads | unchanged |
| Missing/wrong-practice registry row, valid cursor | 404, no downstream clinical read | unchanged |
| Registry query failure | sanitized 500 | unchanged; no fallback |
| Existing archived patient | allowed by this registry gate | unchanged |
| Valid requested history; unrelated demographics corrupt | 500 during discarded summary | history may succeed; summary route still fails |
| Valid requested history; identifier/demographics/latest-encounter query would fail | summary dependency can produce 500 | those companion queries are not executed |
| Requested observation/order query or payload authentication fails | sanitized 500 | unchanged |
| Existing patient, invalid cursor | 422 normally; discarded-summary fault can mask it as 500 with sessions OFF | 422 once required registry lookup succeeds |
| Missing patient plus invalid cursor | sessions OFF: registry miss can produce 404; sessions ON: preflight produces 422 | preserve existing ordering |
| Registry failure plus invalid cursor | sessions OFF may produce 500; sessions ON preflight may produce 422 | preserve existing ordering |

The removed dependency is not an integrity certificate for the whole patient. History access remains bound to authorized patient scope and each requested encrypted row's AAD. Unrelated corruption must not silently alter that requested payload; it also need not become a universal history outage. No browser changes or promise that the full patient workspace opens when its summary is corrupt.

## Required E regression evidence

- Flag OFF preserves legacy six-query happy history and companion failure behavior.
- Both history families, D1 ON/OFF and CryptoKey reuse ON/OFF; valid responses equal under a fixed Date. Registry remains first; no full-summary companion queries under the new flag.
- Missing and populated wrong-practice fixtures enforce actual binds (the existing generic mock returns the same patient for any registry query and is insufficient alone).
- Archived registry behavior preserved; no permission/role or invalid-family/cursor bypass. Assert no session/history reads after authorization denial.
- Registry faults and real malformed observation/order ciphertext/AAD still fail closed with sanitized output; no primary fallback/bookmark leak.
- Corrupted demographics and throwing companion-query sentinels: legacy fails as before, opt-in valid history does not touch them; summary route remains strict. Exercise invalid-cursor/missing-patient error ordering.
- Reusing the extracted helper leaves summary payloads/metrics unchanged.
- With standard successful fixtures: history query count falls from six to three (registry + two family queries). Demographics decryption is removed only when that row would have existed; requested-row decryption count remains unchanged. Auth queries are outside these route metrics. Provider CPU/rows/latency are not inferred from query-count reduction.

## Review verification and remaining gates

Post-gate: origin/main fetched and contained (1 ahead/0 behind); accumulated delta 103 → 104 paths captured before refresh, new design plus existing-document updates only. ADR synchronized; local graph ready 8273 nodes/31844 edges, 25 known partial/zero skipped; source fallback for metadata drift. Diff check passed. No shared snapshot publication or exhaustive security audit claim.

Existing read-session and facade boundary suites ran: **2 files / 30 tests passed**. They establish the current baseline only; opt-in code and the new matrix are not implemented/tested yet. Documentation-only packet; no runtime edit, migration, commit, cloud setting or deployment.

R29-04-E is next, Astra Medium, medium relative token cost, bounded implementation of this contract. Pause before High → Medium transition. R29-01–05 remain scheduled; index selection/D1 measurements/RC rollout and protected offline clinical work are not replaced by this optimization.
