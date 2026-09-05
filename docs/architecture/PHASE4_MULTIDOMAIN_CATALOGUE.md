# Phase 4 multidomain Iranian catalogue

Status: Phase 4 / Task 6 implementation contract.

## Purpose

The Phase 4 catalogue extension admits cardiovascular, renal, hypertension, and lipid medicines into the existing Iranian consensus ingestion path before new blood-pressure, lipid, and product-dose clinical logic is added.

The extension is deliberately a data-boundary change. It does not create new treatment thresholds, ranking weights, contraindications, doses, prices, brands, or insurance coverage values.

## Authoritative identity boundary

`apps/web/public/data/admin-catalog.json` remains the approved Master Drug Registry source consumed by the application. The Phase 4 scope is limited to canonical medicines that already have approved Master Registry identities.

`tools/iran-drug-runner/scope_multidomain_allowlist.json` contains the reviewed ingestion extension for:

- ACE inhibitors;
- ARBs;
- statins;
- spironolactone; and
- finerenone.

The default `consensus_pipeline.py` run merges this extension with the existing diabetes scope. Explicit custom scopes are never implicitly broadened.

## Iranian market evidence boundary

The multidomain allowlist is only an admission and clinical-domain classification list. It is not a market-data source.

Market facts continue to require source evidence:

- product/brand identity and observed price: Iran NFI (`irc.fda.gov.ir`);
- Health Insurance coverage: IHIO (`mdp.ihio.gov.ir`);
- Armed Forces coverage: SATA (`esata.ir`); and
- Social Security coverage: Tamin (`darman.tamin.ir`).

The consensus pipeline retains source URLs/references instead of replacing them with manually entered catalogue facts. Missing price or coverage remains missing; the Phase 4 extension must not synthesize it.

## Decision Graph classification contract

`packages/clinical-engine/src/decision-graph-v2/inventory-adapter.ts` remains the classification authority when approved Master Registry entries are projected into Decision Graph v2.

Expected therapy groups are:

| Catalogue class | Decision Graph therapy group |
| --- | --- |
| ACE inhibitor | `raas_blocker` |
| ARB | `raas_blocker` |
| Statin | `lipid_lowering` |
| Spironolactone / finerenone | `mineralocorticoid_receptor_antagonist` |

Clinical domains are projected into the existing kidney, heart-failure, hypertension, and lipid lanes. Task 6 does not add a second class/ranking implementation.

## Runtime provenance contract

`apps/web/lib/type2-decision-graph-market.ts` carries NFI product evidence into `IranMarketDrugProduct` and preserves insurer source metadata on `insuranceCoverages`.

Regression tests require NFI source URL/reference, source price fields, insurer URL/reference, and raw insurer percentages to survive the runtime mapping.

## Deferred work

Task 6 does not activate new blood-pressure or lipid treatment objectives. Those remain Phase 4 / Task 7.

Task 6 also does not add new evidence-backed product-dose rules for the newly admitted classes. Those remain Phase 4 / Task 8.

A fresh source extraction can populate newly admitted Iranian market records without changing this code contract. Publication of such a source snapshot must continue to pass the existing consensus/preflight gates; no synthetic market row is committed by this task.
