from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one exact marker, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_all_exact(path: str, old: str, new: str, expected: int) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{path}: expected {expected} exact markers, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new), encoding="utf-8")


# 1) Explicit non-clinical selection-constraint contract.
replace_once(
    "packages/clinical-engine/src/decision-graph-v2/types.ts",
    '''export interface GateOutcomeV2 {\n  status: HardGateStatusV2;\n  reasons: string[];\n  evidence: EvidenceReferenceV2[];\n}\n\nexport type RegimenKindV2 =''',
    '''export interface GateOutcomeV2 {\n  status: HardGateStatusV2;\n  reasons: string[];\n  evidence: EvidenceReferenceV2[];\n}\n\n/**\n * Request/access constraints may block primary selection without becoming a\n * clinical contraindication. Generated live candidates always carry this field;\n * it remains optional only for backward-compatible serialized/test fixtures.\n */\nexport type SelectionConstraintKindV2 = "route" | "access";\nexport interface SelectionConstraintV2 {\n  status: "pass" | "blocked";\n  kinds: SelectionConstraintKindV2[];\n  reasons: string[];\n}\n\nexport type RegimenKindV2 =''',
)
replace_once(
    "packages/clinical-engine/src/decision-graph-v2/types.ts",
    '''  evidence: EvidenceReferenceV2[];\n  gate: GateOutcomeV2;\n  routeFit:''',
    '''  evidence: EvidenceReferenceV2[];\n  gate: GateOutcomeV2;\n  selectionConstraint?: SelectionConstraintV2;\n  routeFit:''',
)

Path("packages/clinical-engine/src/decision-graph-v2/selection-constraints.ts").write_text('''import type { RegimenCandidateV2, SelectionConstraintKindV2, SelectionConstraintV2 } from "./types.js";\n\nexport function resolvedSelectionConstraintV2(candidate: RegimenCandidateV2): SelectionConstraintV2 {\n  return candidate.selectionConstraint ?? { status: "pass", kinds: [], reasons: [] };\n}\n\nexport function candidateSelectionEligibleV2(candidate: RegimenCandidateV2) {\n  return resolvedSelectionConstraintV2(candidate).status === "pass";\n}\n\nexport function blockCandidateSelectionV2(\n  candidate: RegimenCandidateV2,\n  kind: SelectionConstraintKindV2,\n  reason: string,\n) {\n  const current = resolvedSelectionConstraintV2(candidate);\n  candidate.selectionConstraint = {\n    status: "blocked",\n    kinds: [...new Set([...current.kinds, kind])],\n    reasons: [...new Set([...current.reasons, reason])],\n  };\n}\n''', encoding="utf-8")
replace_once(
    "packages/clinical-engine/src/decision-graph-v2/index.ts",
    'export * from "./gates.js";\nexport * from "./enrich.js";',
    'export * from "./gates.js";\nexport * from "./selection-constraints.js";\nexport * from "./enrich.js";',
)
replace_all_exact(
    "packages/clinical-engine/src/decision-graph-v2/regimens.ts",
    '    gate: { status: "pass", reasons: [], evidence: [] },\n    routeFit:',
    '    gate: { status: "pass", reasons: [], evidence: [] },\n    selectionConstraint: { status: "pass", kinds: [], reasons: [] },\n    routeFit:',
    2,
)

# 2) Route preference no longer mutates the clinical hard gate.
replace_once(
    "packages/clinical-engine/src/decision-graph-v2/gates.ts",
    'import { buildFactMapV2, evaluatePredicateV2 } from "./predicates.js";\nimport type {',
    'import { buildFactMapV2, evaluatePredicateV2 } from "./predicates.js";\nimport { blockCandidateSelectionV2 } from "./selection-constraints.js";\nimport type {',
)
replace_once(
    "packages/clinical-engine/src/decision-graph-v2/gates.ts",
    '''      } else {\n        status = "exclude";\n        reasons.push("پزشک/بیمار مسیر oral-only را به‌عنوان constraint انتخاب کرده است.");\n      }\n''',
    '''      } else {\n        result.routeFit = "neutral";\n        const routeConstraintReason = "پزشک/بیمار مسیر oral-only را به‌عنوان constraint انتخاب کرده است.";\n        blockCandidateSelectionV2(result, "route", routeConstraintReason);\n        result.preferenceConflicts.push(routeConstraintReason);\n      }\n''',
)

# 3) Insurance/access constraint gets its own channel. Mandatory insulin is derived
# from the resolved clinical objective, never from localized display text.
replace_once(
    "packages/clinical-engine/src/decision-graph-v2/enrich.ts",
    '''} from "./wegovy-titration-cost.js";\nimport type {\n  DecisionGraphRequestV2,''',
    '''} from "./wegovy-titration-cost.js";\nimport { blockCandidateSelectionV2 } from "./selection-constraints.js";\nimport type {\n  ClinicalObjectiveV2,\n  DecisionGraphRequestV2,''',
)
replace_once(
    "packages/clinical-engine/src/decision-graph-v2/enrich.ts",
    '''export function enrichCandidateWithDoseMarketCostV2(\n  request: DecisionGraphRequestV2,\n  candidate: RegimenCandidateV2,\n): RegimenCandidateV2 {''',
    '''export function enrichCandidateWithDoseMarketCostV2(\n  request: DecisionGraphRequestV2,\n  candidate: RegimenCandidateV2,\n  objectives: readonly ClinicalObjectiveV2[] = [],\n): RegimenCandidateV2 {''',
)
replace_once(
    "packages/clinical-engine/src/decision-graph-v2/enrich.ts",
    '''    const mandatoryInsulin =\n      result.components.some((component) => /insulin/.test(component.therapyGroup)) &&\n      result.preferenceConflicts.some((item) => item.includes("الزام بالینی"));\n\n    if (mandatoryInsulin) {''',
    '''    const mandatoryInsulin =\n      result.components.some((component) => /insulin|fixed_ratio_combination/.test(component.therapyGroup)) &&\n      objectives.some((objective) => objective.level === "mandatory" && objective.id === "insulin_replacement");\n\n    if (mandatoryInsulin) {''',
)
replace_once(
    "packages/clinical-engine/src/decision-graph-v2/enrich.ts",
    '''    } else {\n      result.gate.status = "exclude";\n      result.gate.reasons.push(\n        result.insuranceFit === "unknown"\n          ? "insured-only فعال است اما پوشش قابل استفاده برای بیمه انتخاب‌شده تأیید نشده است."\n          : "insured-only فعال است و پوشش قابل استفاده برای این رژیم یافت نشد.",\n      );\n    }\n''',
    '''    } else {\n      const accessConstraintReason = result.insuranceFit === "unknown"\n        ? "insured-only فعال است اما پوشش قابل استفاده برای بیمه انتخاب‌شده تأیید نشده است."\n        : "insured-only فعال است و پوشش قابل استفاده برای این رژیم یافت نشد.";\n      blockCandidateSelectionV2(result, "access", accessConstraintReason);\n      if (!result.preferenceConflicts.includes(accessConstraintReason)) result.preferenceConflicts.push(accessConstraintReason);\n    }\n''',
)

# 4) Selection pipeline and composer require both clinical/execution pass and
# non-clinical selection-constraint pass.
replace_once(
    "packages/clinical-engine/src/decision-graph-v2/engine.ts",
    'import { diversityKeyV2, selectLexicographicallyV2 } from "./selector.js";\nimport { runInsulinDecisionSubgraphV2 }',
    'import { diversityKeyV2, selectLexicographicallyV2 } from "./selector.js";\nimport { candidateSelectionEligibleV2 } from "./selection-constraints.js";\nimport { runInsulinDecisionSubgraphV2 }',
)
replace_once(
    "packages/clinical-engine/src/decision-graph-v2/engine.ts",
    '''function isTopEligible(candidate: RegimenCandidateV2) {\n  return candidate.gate.status === "pass";\n}''',
    '''function isTopEligible(candidate: RegimenCandidateV2) {\n  return candidate.gate.status === "pass" && candidateSelectionEligibleV2(candidate);\n}''',
)
replace_once(
    "packages/clinical-engine/src/decision-graph-v2/engine.ts",
    '  const enriched = gated.map((candidate) => enrichCandidateWithDoseMarketCostV2(request, candidate));',
    '  const enriched = gated.map((candidate) => enrichCandidateWithDoseMarketCostV2(request, candidate, objectives));',
)
replace_once(
    "packages/clinical-engine/src/decision-graph-v2/engine.ts",
    '''  const mandatoryInsulinAccessConflict =\n    request.preferences.costPreference === "insured_only" &&\n    Boolean(\n      primary &&\n      primary.components.some((component) => /insulin/.test(component.therapyGroup)) &&\n      primary.insuranceFit !== "eligible" &&\n      primary.insuranceFit !== "conditional" &&\n      primary.preferenceConflicts.some((item) => item.includes("الزام بالینی")),\n    );''',
    '''  const mandatoryInsulinAccessConflict =\n    request.preferences.costPreference === "insured_only" &&\n    Boolean(\n      primary &&\n      primary.components.some((component) => /insulin|fixed_ratio_combination/.test(component.therapyGroup)) &&\n      objectives.some((objective) => objective.level === "mandatory" && objective.id === "insulin_replacement") &&\n      primary.insuranceFit !== "eligible" &&\n      primary.insuranceFit !== "conditional",\n    );''',
)
replace_once(
    "packages/clinical-engine/src/decision-graph-v2/composer.ts",
    'import { paretoPruneV2 } from "./pareto.js";\nimport { selectLexicographicallyV2 } from "./selector.js";',
    'import { paretoPruneV2 } from "./pareto.js";\nimport { candidateSelectionEligibleV2 } from "./selection-constraints.js";\nimport { selectLexicographicallyV2 } from "./selector.js";',
)
replace_once(
    "packages/clinical-engine/src/decision-graph-v2/composer.ts",
    '''  const pool = candidates.filter((candidate) =>\n    candidate.gate.status === "pass" &&\n    candidate.lane === objective.lane &&''',
    '''  const pool = candidates.filter((candidate) =>\n    candidate.gate.status === "pass" &&\n    candidateSelectionEligibleV2(candidate) &&\n    candidate.lane === objective.lane &&''',
)

# 5) Focused behavioral regression: hard clinical exclusions stay hard; route/access
# constraints remain non-clinical yet cannot enter primary selection; mandatory
# insulin remains clinically visible even when access is unresolved.
Path("packages/clinical-engine/test/type2-authority-channel-separation-v2.test.ts").write_text(r'''import { describe, expect, it } from "vitest";
import {
  applyHardGatesV2,
  defaultDecisionGraphPolicyV2,
  enrichCandidateWithDoseMarketCostV2,
  runDecisionGraphV2,
  type ClinicalObjectiveV2,
  type ClinicalStateV2,
  type DecisionGraphRequestV2,
  type DoseRuleV2,
  type IranMarketProductV2,
  type KnowledgeMedicationV2,
  type RegimenCandidateV2,
} from "../src/decision-graph-v2/index.js";

const evidence = defaultDecisionGraphPolicyV2.evidence.pharmacologic;

function medication(overrides: Partial<KnowledgeMedicationV2> = {}): KnowledgeMedicationV2 {
  return {
    masterDrugId: "WD-ORAL",
    genericName: "Test oral",
    combination: false,
    therapeuticAreas: ["Type 2 diabetes"],
    therapyGroup: "oral_glucose_lowering",
    primaryLanes: ["glycemic"],
    routeOptions: ["oral"],
    efficacyBand: "high",
    hypoglycemiaRisk: "low",
    weightDirection: "neutral",
    effects: [{ objective: "glycemic_control", direction: "benefit", evidence: [evidence] }],
    evidence: [evidence],
    engineState: "approved",
    ...overrides,
  };
}

function product(masterDrugId: string, route: string, dosageFormGroup: string): IranMarketProductV2 {
  return {
    productId: `P-${masterDrugId}`,
    masterDrugId,
    nfiMatchState: "verified",
    genericName: masterDrugId,
    dosageFormGroup,
    route,
    consumptionUnit: route === "oral" ? "tablet" : "U",
    strengthComponents: [{ ingredientKey: masterDrugId, amount: route === "oral" ? 500 : 1, unit: route === "oral" ? "mg" : "U" }],
    consumptionUnitsPerPurchaseUnit: route === "oral" ? 30 : 1500,
    purchaseUnitLabel: "pack",
    priceToman: 100_000,
    license: { everValid: true, currentValid: true },
    marketPresence: "confirmed_active",
    observedAt: "2026-09-08",
  };
}

function doseRule(masterDrugId: string, injectable = false): DoseRuleV2 {
  return {
    id: `DOSE-${masterDrugId}`,
    masterDrugId,
    indication: "type2",
    formula: {
      kind: "fixed_daily_components",
      dailyComponents: [{ ingredientKey: masterDrugId, amount: injectable ? 20 : 1000, unit: injectable ? "U" : "mg" }],
      administrationsPerDay: 1,
    },
    evidence: [evidence],
    reviewState: "approved",
  };
}

function candidate(masterDrugId: string, therapyGroup: string, route: string, dosageFormGroup: string): RegimenCandidateV2 {
  return {
    regimenId: `med:${masterDrugId}:glycemic`,
    lane: "glycemic",
    kind: therapyGroup.includes("insulin") ? "insulin_basal" : "single",
    components: [{
      masterDrugId,
      genericName: masterDrugId,
      therapyGroup,
      tags: [],
      availability: {
        masterDrugId,
        classification: "current_market",
        mainRecommendationEligible: true,
        moreOptionsEligible: true,
        currentProductIds: [`P-${masterDrugId}`],
        historicalProductIds: [],
        reasons: [],
      },
    }],
    efficacyBand: therapyGroup.includes("insulin") ? "very_high" : "high",
    hypoglycemiaRisk: therapyGroup.includes("insulin") ? "moderate" : "low",
    weightProfile: "neutral",
    objectiveCoverage: therapyGroup.includes("insulin") ? ["glycemic_control", "insulin_replacement"] : ["glycemic_control"],
    objectiveStrength: {},
    evidence: [evidence],
    gate: { status: "pass", reasons: [], evidence: [] },
    selectionConstraint: { status: "pass", kinds: [], reasons: [] },
    routeFit: route === "oral" ? "match" : "neutral",
    insuranceFit: "unknown",
    distinctProducts: 1,
    reasons: [],
    cautions: [],
    preferenceConflicts: [],
  };
}

const maintenanceState: ClinicalStateV2 = {
  pathway: "maintenance_or_modest_gap",
  insulinAction: "none",
  severeHyperglycemia: false,
  hba1cGap: 1,
  reasons: [],
  evidence: [evidence],
};

function baseRequest(): DecisionGraphRequestV2 {
  const oral = medication();
  return {
    patient: {
      glycemia: { currentHba1c: 8, targetHba1c: 7, fastingPlasmaGlucoseMgDl: 150 },
      anthropometrics: { weightKg: 80, bmi: 29 },
    },
    preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    inventory: {
      knowledge: [oral],
      marketProducts: [product("WD-ORAL", "oral", "tablet")],
      doseRules: [doseRule("WD-ORAL")],
      insurancePolicies: [],
    },
  };
}

describe("Type 2 authority-channel separation", () => {
  it("keeps oral-only as a selection constraint rather than a clinical exclusion", () => {
    const injectable = medication({
      masterDrugId: "WD-INJECT",
      genericName: "Test injectable",
      therapyGroup: "glp1_ra",
      routeOptions: ["subcutaneous"],
    });
    const request: DecisionGraphRequestV2 = {
      ...baseRequest(),
      preferences: { routePreference: "oral_only", costPreference: "no_constraint" },
      inventory: {
        knowledge: [injectable],
        marketProducts: [product("WD-INJECT", "subcutaneous", "injection_pen")],
        doseRules: [doseRule("WD-INJECT", true)],
        insurancePolicies: [],
      },
    };
    const result = applyHardGatesV2(request, maintenanceState, [], candidate("WD-INJECT", "glp1_ra", "subcutaneous", "injection_pen"));
    expect(result.gate.status).toBe("pass");
    expect(result.gate.reasons).not.toContain("پزشک/بیمار مسیر oral-only را به‌عنوان constraint انتخاب کرده است.");
    expect(result.selectionConstraint).toEqual({
      status: "blocked",
      kinds: ["route"],
      reasons: ["پزشک/بیمار مسیر oral-only را به‌عنوان constraint انتخاب کرده است."],
    });
  });

  it("preserves a true clinical authority failure as gate exclude", () => {
    const unapproved = medication({ engineState: "candidate" });
    const request = baseRequest();
    request.inventory.knowledge = [unapproved];
    const result = applyHardGatesV2(request, maintenanceState, [], candidate("WD-ORAL", "oral_glucose_lowering", "oral", "tablet"));
    expect(result.gate.status).toBe("exclude");
    expect(result.selectionConstraint?.status).toBe("pass");
  });

  it("keeps insured-only access failure out of the clinical gate while blocking selection", () => {
    const request = baseRequest();
    request.preferences = {
      routePreference: "oral_or_injectable",
      costPreference: "insured_only",
      insuranceProviders: ["social_security"],
    };
    const gated = applyHardGatesV2(request, maintenanceState, [], candidate("WD-ORAL", "oral_glucose_lowering", "oral", "tablet"));
    const enriched = enrichCandidateWithDoseMarketCostV2(request, gated, []);
    expect(enriched.gate.status).toBe("pass");
    expect(enriched.insuranceFit).toBe("unknown");
    expect(enriched.selectionConstraint?.status).toBe("blocked");
    expect(enriched.selectionConstraint?.kinds).toContain("access");
  });

  it("does not allow a route-blocked candidate into primary or alternatives", () => {
    const oral = medication();
    const injectable = medication({
      masterDrugId: "WD-INJECT",
      genericName: "Test injectable",
      therapyGroup: "glp1_ra",
      routeOptions: ["subcutaneous"],
    });
    const request = baseRequest();
    request.preferences = { routePreference: "oral_only", costPreference: "no_constraint" };
    request.inventory = {
      knowledge: [oral, injectable],
      marketProducts: [product("WD-ORAL", "oral", "tablet"), product("WD-INJECT", "subcutaneous", "injection_pen")],
      doseRules: [doseRule("WD-ORAL"), doseRule("WD-INJECT", true)],
      insurancePolicies: [],
    };
    const result = runDecisionGraphV2(request);
    expect(result.primary?.components.some((component) => component.masterDrugId === "WD-INJECT")).toBe(false);
    expect(result.alternatives.some((regimen) => regimen.components.some((component) => component.masterDrugId === "WD-INJECT"))).toBe(false);
    expect(result.moreOptions.some((regimen) => regimen.selectionConstraint?.status === "blocked")).toBe(true);
  });

  it("preserves mandatory insulin clinical visibility when insured-only access is unresolved without relying on display text", () => {
    const insulin = medication({
      masterDrugId: "INS-BASAL",
      genericName: "Basal insulin",
      therapyGroup: "basal_insulin",
      routeOptions: ["subcutaneous"],
      efficacyBand: "very_high",
      effects: [
        { objective: "glycemic_control", direction: "strong_benefit", evidence: [evidence] },
        { objective: "insulin_replacement", direction: "strong_benefit", evidence: [evidence] },
      ],
    });
    const request: DecisionGraphRequestV2 = {
      patient: {
        glycemia: { currentHba1c: 11, targetHba1c: 7, randomGlucoseMgDl: 320 },
        anthropometrics: { weightKg: 80, bmi: 29 },
      },
      preferences: {
        routePreference: "oral_or_injectable",
        costPreference: "insured_only",
        insuranceProviders: ["social_security"],
      },
      inventory: {
        knowledge: [insulin],
        marketProducts: [product("INS-BASAL", "subcutaneous", "injection_pen")],
        doseRules: [doseRule("INS-BASAL", true)],
        insurancePolicies: [],
      },
    };
    const result = runDecisionGraphV2(request);
    expect(result.clinicalState.pathway).toBe("insulin_centered");
    expect(result.primary?.components.some((component) => component.masterDrugId === "INS-BASAL")).toBe(true);
    expect(result.primary?.selectionConstraint?.status).toBe("pass");
    expect(result.primary?.insuranceFit).toBe("unknown");
    expect(result.status).toBe("no_fully_eligible_regimen");
  });

  it("keeps budget excess as a preference conflict, not a clinical or selection block", () => {
    const request = baseRequest();
    request.preferences = {
      routePreference: "oral_or_injectable",
      costPreference: "low_cost",
      monthlyMedicationBudgetToman: 1,
    };
    const gated = applyHardGatesV2(request, maintenanceState, [], candidate("WD-ORAL", "oral_glucose_lowering", "oral", "tablet"));
    const enriched = enrichCandidateWithDoseMarketCostV2(request, gated, []);
    expect(enriched.gate.status).toBe("pass");
    expect(enriched.selectionConstraint?.status).toBe("pass");
    expect(enriched.preferenceConflicts.some((item) => item.includes("بودجه"))).toBe(true);
  });
});
''', encoding="utf-8")

# 6) Governance truth-sync, qualified to the live Type 2 authority boundary only.
replace_once(
    "docs/PROJECT_OVERVIEW_AND_ROADMAP.md",
    '- [ ] Separate hard blocks, cautions, preferences, cost, and display',
    '- [x] Separate hard blocks, cautions, preferences, cost, and display — implemented for live Type 2 authority; request/access constraints block selection without becoming clinical contraindications, while unrelated future modules require their own authority review.',
)
replace_once(
    "docs/REMAINING_ROADMAP_REBASELINE_2026-09-08.md",
    '| Separate hard blocks, cautions, preferences, cost, and display | **Partial — strong on live Type 2** | Phase 3/4 work structurally excludes hard contraindications, keeps specialist/parallel-safety lanes outside ranking, and separates cost/access from clinical authority. The broad roadmap item spans more than the live Type 2 path and should remain open until the precedence model is formally documented across supported modules. |',
    '| Separate hard blocks, cautions, preferences, cost, and display | **Implemented — live Type 2 authority boundary** | Clinical/execution `gate` authority is now structurally distinct from `selectionConstraint` request/access blocking. `oral_only` and non-mandatory `insured_only` constraints can prevent primary selection without being represented as contraindications; mandatory insulin authority is derived from resolved clinical objectives, not display text. Cautions, preference conflicts, cost/insurance enrichment, and presentation remain separate channels. This does not claim universal governance for unrelated future modules. |',
)
replace_once(
    "docs/architecture/CLINICAL_RULE_PRECEDENCE.md",
    '''The retained unconfigured legacy fallback has a separate `filterHardExcludedLegacyType2Assessment()` firewall for the same safety reason: legacy score arithmetic is never sufficient authority to keep a true hard contraindication in returned ranked compatibility choices.\n\n### 2.6 Reviewed dose/product/market/access enrichment cannot create clinical eligibility''',
    '''The retained unconfigured legacy fallback has a separate `filterHardExcludedLegacyType2Assessment()` firewall for the same safety reason: legacy score arithmetic is never sufficient authority to keep a true hard contraindication in returned ranked compatibility choices.\n\n### 2.5.1 Request/access selection constraints are a separate authority channel\n\nThe live Type 2 candidate contract separates `gate` from `selectionConstraint`. `gate` remains clinical/execution authority (`pass`, `conditional`, `needs_data`, `historical_only`, `exclude`). `selectionConstraint` carries request/access restrictions that may prevent a clinically valid candidate from entering primary/alternative selection without representing that restriction as a contraindication.\n\n- `oral_only` against an otherwise clinically valid injectable is a `route` selection constraint, not `gate.status = exclude`.\n- `insured_only` without proved usable coverage is an `access` selection constraint for non-mandatory therapy, not a clinical contraindication.\n- when insulin replacement is a resolved mandatory clinical objective, unresolved insurance cannot erase the clinical requirement; access remains unresolved and the overall result is not labelled complete. This mandatory status is derived from resolved objectives, never from localized display strings.\n- budget excess remains a preference conflict. Cost and insurance values remain enrichment/ranking inputs inside the already-safe candidate pool; they do not manufacture clinical exclusion authority.\n\nPrimary/alternative selection and regimen composition require both a passing clinical/execution gate and an unblocked selection constraint. Constraint-blocked candidates may remain inspectable as non-primary options, preserving transparency without conflating user/access restrictions with contraindications.\n\nCautions and presentation remain non-authoritative channels: cautions explain uncertainty/monitoring/execution limits, while `toRecommendationV2()` and compatibility projections can display only already-resolved authority and cannot promote a blocked candidate.\n\n### 2.6 Reviewed dose/product/market/access enrichment cannot create clinical eligibility''',
)
replace_once(
    "docs/architecture/CLINICAL_RULE_PRECEDENCE.md",
    '- **Separate hard blocks, cautions, preferences, cost, and display:** strongly implemented and now documented for live Type 2, but the roadmap item spans retained compatibility and other clinical modules.',
    '- **Separate hard blocks, cautions, preferences, cost, and display:** implemented for the live Type 2 authority boundary. Clinical/execution gates, route/access selection constraints, cautions, preferences, cost/insurance enrichment, and display are structurally distinct; unrelated future modules still require their own authority review.',
)

print("TYPE2 AUTHORITY CHANNEL PATCH APPLIED")
