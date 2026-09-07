export type ReviewedType2ClaimTimingPolicy = {
  id: string;
  provider: string;
  productId?: string;
  masterDrugId?: string;
  effectiveAt: string;
  sourceReference: string;
  sourceUrl?: string;
  claimTiming: {
    groupKey: string;
    windowDays: number;
    maxClaimsPerWindow: number;
    minimumDaysBetweenClaims: number;
    allowDistinctProductsWithinWindow: boolean;
  };
};

export const TYPE2_CLAIM_POLICY_REGISTRY_REVISION =
  "type2-claim-policy-registry-v1";

/**
 * Version-controlled reviewed claim-timing authority.
 *
 * Keep this empty until an authoritative payer/source document is reviewed.
 * Adding or changing an entry requires a normal Roadmap/Graph-gated PR with
 * source provenance and regression evidence. Ordinary insurance coverage rows
 * must never be promoted into this registry automatically.
 */
const REVIEWED_TYPE2_CLAIM_POLICIES: readonly ReviewedType2ClaimTimingPolicy[] = [];

const allowedProviders = new Set([
  "social_security",
  "health_insurance",
  "armed_forces",
  "other_organizations",
  "supplementary",
]);

function boundedText(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= max ? text : null;
}

function positiveInteger(value: unknown, max: number) {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= max
    ? Number(value)
    : null;
}

function nonNegativeInteger(value: unknown, max: number) {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= max
    ? Number(value)
    : null;
}

function httpsUrl(value: unknown) {
  const text = boundedText(value, 500);
  if (!text) return null;
  try {
    return new URL(text).protocol === "https:" ? text : null;
  } catch {
    return null;
  }
}

export function validateReviewedType2ClaimPolicies(
  input: unknown,
): ReviewedType2ClaimTimingPolicy[] {
  if (!Array.isArray(input)) throw new Error("TYPE2_CLAIM_POLICY_ARRAY_REQUIRED");

  const validated = input.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`TYPE2_CLAIM_POLICY_INVALID:${index}`);
    }
    const source = entry as Record<string, unknown>;
    const id = boundedText(source.id, 180);
    const provider = boundedText(source.provider, 80);
    const productId = boundedText(source.productId, 180);
    const masterDrugId = boundedText(source.masterDrugId, 180);
    const effectiveAt = boundedText(source.effectiveAt, 80);
    const sourceReference = boundedText(source.sourceReference, 240);
    const sourceUrl = source.sourceUrl === undefined
      ? undefined
      : httpsUrl(source.sourceUrl);
    const timing = source.claimTiming;

    if (!id || !provider || !allowedProviders.has(provider)) {
      throw new Error(`TYPE2_CLAIM_POLICY_ID_PROVIDER_INVALID:${index}`);
    }
    if (!productId && !masterDrugId) {
      throw new Error(`TYPE2_CLAIM_POLICY_TARGET_REQUIRED:${index}`);
    }
    if (!effectiveAt || !Number.isFinite(Date.parse(effectiveAt)) || !sourceReference) {
      throw new Error(`TYPE2_CLAIM_POLICY_PROVENANCE_REQUIRED:${index}`);
    }
    if (source.sourceUrl !== undefined && !sourceUrl) {
      throw new Error(`TYPE2_CLAIM_POLICY_SOURCE_URL_INVALID:${index}`);
    }
    if (!timing || typeof timing !== "object") {
      throw new Error(`TYPE2_CLAIM_POLICY_TIMING_REQUIRED:${index}`);
    }

    const claimTiming = timing as Record<string, unknown>;
    const groupKey = boundedText(claimTiming.groupKey, 120);
    const windowDays = positiveInteger(claimTiming.windowDays, 90);
    const maxClaimsPerWindow = positiveInteger(claimTiming.maxClaimsPerWindow, 10);
    const minimumDaysBetweenClaims = nonNegativeInteger(
      claimTiming.minimumDaysBetweenClaims,
      90,
    );

    if (
      !groupKey ||
      windowDays === null ||
      maxClaimsPerWindow === null ||
      minimumDaysBetweenClaims === null ||
      typeof claimTiming.allowDistinctProductsWithinWindow !== "boolean"
    ) {
      throw new Error(`TYPE2_CLAIM_POLICY_TIMING_INVALID:${index}`);
    }

    return {
      id,
      provider,
      ...(productId ? { productId } : {}),
      ...(masterDrugId ? { masterDrugId } : {}),
      effectiveAt,
      sourceReference,
      ...(sourceUrl ? { sourceUrl } : {}),
      claimTiming: {
        groupKey,
        windowDays,
        maxClaimsPerWindow,
        minimumDaysBetweenClaims,
        allowDistinctProductsWithinWindow:
          claimTiming.allowDistinctProductsWithinWindow,
      },
    };
  });

  const seenIds = new Set<string>();
  const seenTargets = new Set<string>();
  for (const policy of validated) {
    if (seenIds.has(policy.id)) {
      throw new Error(`TYPE2_CLAIM_POLICY_DUPLICATE_ID:${policy.id}`);
    }
    seenIds.add(policy.id);
    const target = policy.productId
      ? `product:${policy.productId}`
      : `master:${policy.masterDrugId}`;
    const targetKey = `${policy.provider}:${target}`;
    if (seenTargets.has(targetKey)) {
      throw new Error(`TYPE2_CLAIM_POLICY_DUPLICATE_TARGET:${targetKey}`);
    }
    seenTargets.add(targetKey);
  }
  return validated;
}

export function activeReviewedType2ClaimPolicies(
  input: unknown,
  now = Date.now(),
) {
  return validateReviewedType2ClaimPolicies(input)
    .filter((policy) => Date.parse(policy.effectiveAt) <= now);
}

export function reviewedType2ClaimPolicies(now = Date.now()) {
  return activeReviewedType2ClaimPolicies(REVIEWED_TYPE2_CLAIM_POLICIES, now);
}
