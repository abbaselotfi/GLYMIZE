# Phase 4 Task 9 — Scenario diversity invariant

GLYMIZE keeps `topAlternativeCount: 2`, so a decision may surface one primary regimen and up to two alternatives.

## Meaningful diversity axes

Two cards are considered meaningfully different when at least one stable treatment axis differs:

- regimen kind;
- generic/master-drug composition;
- therapy-group composition;
- clinical-objective coverage;
- selected route profile;
- daily administration burden; or
- number of distinct products.

Price is deliberately not a diversity axis. Current Iranian market price may reorder clinically acceptable candidates under a cost preference, but price variation alone must not manufacture a new clinical scenario.

## Selection invariant

Clinical gates and mandatory objective coverage remain ahead of preference ordering. Cost, insurance/access, route and simplification preferences can reorder candidates only after the applicable higher-priority clinical criteria are equivalent.

`chooseDiverseAlternatives` no longer pads the requested alternative count with a candidate that has the same diversity key as a selected scenario. Returning fewer honest alternatives is preferred to displaying duplicated treatment cards.

This task adds no aggregate score and does not change the reviewed clinical thresholds, product-dose rules, market data, or deployment configuration.
