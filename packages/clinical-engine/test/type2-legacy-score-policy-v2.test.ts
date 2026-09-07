import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TYPE2_LEGACY_SCORE_POLICY_V1 } from "../src/type2-legacy-score-policy.js";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Type 2 legacy score compatibility policy", () => {
  it("freezes the historical compatibility mechanics under an explicit non-authoritative identity", () => {
    expect(TYPE2_LEGACY_SCORE_POLICY_V1).toEqual({
      schemaVersion: 1,
      id: "glymize-type2-legacy-score-compatibility",
      version: "2026.09.08.1",
      authority: "compatibility_only",
      medication: {
        baselineScore: 50,
        minimumScore: 0,
        maximumScore: 100,
        insuranceCoveragePercentPerPoint: 5,
        recommendedTierMinimum: 75,
        preferredTierMinimum: 58,
      },
      scenario: {
        advancedCkdGlp1Bonus: 24,
        belowSglt2InitiationThresholdNewStartPenalty: 80,
        dialysisNewSglt2Penalty: 100,
        dialysisGlp1Bonus: 28,
        heartFailureSglt2Bonus: 18,
        heartFailureTzdPenalty: 100,
        hypoglycemiaPronePenalty: 60,
        weightPriorityGlp1Bonus: 12,
        oralOnlyInjectablePenalty: 1000,
        marketCoverageBonusCap: 20,
        marketCoveragePercentPerPoint: 5,
        marketPriceKnownBonus: 5,
        marketLowCostBonus: 18,
        marketMediumCostBonus: 8,
        marketHighCostPenalty: 8,
        alternativeMinimumScore: 58,
      },
    });
  });

  it("keeps legacy medication and scenario score mechanics wired through the named policy", () => {
    const legacyBuilder = source("../src/index.ts");
    const legacyScenarios = source("../src/scenario-engine.ts");

    expect(legacyBuilder).toContain("TYPE2_LEGACY_SCORE_POLICY_V1");
    expect(legacyBuilder).not.toContain("let score = 50;");
    expect(legacyBuilder).not.toContain("bestCoverage / 5");
    expect(legacyBuilder).not.toContain("Math.min(100, score)");
    expect(legacyBuilder).not.toContain("ranking.score >= 75");
    expect(legacyBuilder).not.toContain("ranking.score >= 58");

    expect(legacyScenarios).toContain("TYPE2_LEGACY_SCORE_POLICY_V1");
    for (const literal of [
      "score += 24;",
      "score -= 80;",
      "score -= 100;",
      "score += 28;",
      "score += 18;",
      "score -= 60;",
      "score += 12;",
      "score -= 1000;",
      "Math.min(20, coverage.percent / 5)",
      "score += 5;",
      "score += 8;",
      "score -= 8;",
      "adjustedClinicalScore(item, request) >= 58",
    ]) expect(legacyScenarios).not.toContain(literal);
  });

  it("keeps Evidence Assistant relevance weights named and outside treatment authority", () => {
    const evidenceAssistant = source("../src/evidence-assistant.ts");
    expect(evidenceAssistant).toContain("EVIDENCE_SEARCH_RELEVANCE_WEIGHTS");
    expect(evidenceAssistant).not.toContain("score += 3;");
    expect(evidenceAssistant).not.toContain("score += 2;");
  });

  it("prevents Decision Graph v2 from consuming the compatibility score policy", () => {
    const graphEngine = source("../src/decision-graph-v2/engine.ts");
    expect(graphEngine).not.toContain("type2-legacy-score-policy");
    expect(graphEngine).not.toContain("TYPE2_LEGACY_SCORE_POLICY_V1");
  });
});
