/**
 * Frozen numeric mechanics for the retired Type 2 aggregate-score path.
 *
 * This policy is compatibility-only. It is not clinical evidence authority and
 * MUST NOT be consumed by Decision Graph v2. The values preserve historical
 * fallback/admin-preview behavior exactly; changing them is a behavior change
 * that requires a separate compatibility review and regression campaign.
 *
 * Clinical thresholds and reviewed treatment weights remain owned by the active
 * versioned ClinicalRulePack. This file only names the previously inline score
 * mechanics that survive inside non-authoritative compatibility paths.
 */
export const TYPE2_LEGACY_SCORE_POLICY_V1 = {
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
} as const;

export type Type2LegacyScorePolicyV1 = typeof TYPE2_LEGACY_SCORE_POLICY_V1;
