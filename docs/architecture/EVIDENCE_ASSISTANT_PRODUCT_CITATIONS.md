# Evidence Assistant Product Citation Index

- Status: **Phase 3 / Task 5 implementation candidate**
- Date: 2026-09-05
- Roadmap reference: Phase 3 / Task 5 and §8.30
- Scope: make product- and dose-specific Evidence Assistant questions resolve to the exact approved executable rule citation instead of relying only on generic Rule Pack provenance.

## 1. Evidence sources indexed

Evidence Assistant continues to search the active approved clinical Rule Pack.
Task 5 adds a second approved index materialized from the executable Decision
Graph builders:

- `decision-graph-v2/product-dose-rules.ts` for reviewed product-dose rules;
- `decision-graph-v2/safety-rules.ts` for reviewed medication safety gates.

The index is built by `decision-graph-v2/evidence-assistant-index.ts` from those
builders. It does not maintain an independent list of clinical thresholds,
doses, or citations.

## 2. Product-dose provenance

Each indexed dose hit carries:

- the executable dose-rule ID;
- medication/product identity used by that rule;
- formula, indication, target/maximum dose, titration and monitoring text used
  for retrieval;
- exact evidence source ID;
- source title and version;
- source URL;
- source locator when the product label provides one.

For example, a Toujeo U-300 starting-dose question resolves to the executable
`LABEL-TOUJEO-T2-START:*` rule and the `US-LABEL-TOUJEO-2026` regulatory
citation with locator `Dosage and Administration 2.3`.

## 3. Safety provenance

Medication hard/conditional gates are materialized through
`buildCoreAda2026DecisionRulesV2()`. This means a renal-safety question about
metformin can retrieve the exact executable safety rule together with its ADA
and KDIGO evidence, rather than depending only on keyword overlap with a broad
Rule Pack description.

## 4. Retrieval boundary

This feature is read-only evidence retrieval. It cannot:

- alter clinical ranking or hard-gate outcomes;
- change patient inputs;
- activate draft rules;
- change approved doses, thresholds, or citations.

The Evidence Assistant result now supports an optional citation `locator` so the
UI/API can expose the precise source section for product-specific evidence.

## 5. Regression proof

`packages/clinical-engine/test/evidence-assistant-product-citations-v2.test.ts`
proves that:

1. a Persian Toujeo dose-specific question returns the exact Toujeo regulatory
   product-label citation and section locator;
2. a metformin eGFR safety question retrieves the executable hard-gate rule and
   KDIGO provenance.

Existing insufficient-evidence refusal behavior remains covered by the original
Evidence Assistant tests.

## 6. Infrastructure

No production/RC deployment, database migration, secret, Cloudflare binding, or
persistent data change is part of Task 5.
