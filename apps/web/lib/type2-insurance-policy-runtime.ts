"use client";

import { runtimeFetch } from "./runtime-client";

export const TYPE2_INSURANCE_CLAIM_POLICY_AUTHORITY =
  "GLYMIZE_WORKER_REVIEWED_CLAIM_TIMING_V1";

export interface Type2InsuranceClaimTimingPolicy {
  id: string;
  provider: string;
  productId?: string;
  masterDrugId?: string;
  claimTiming: {
    groupKey: string;
    windowDays: number;
    maxClaimsPerWindow: number;
    minimumDaysBetweenClaims: number;
    allowDistinctProductsWithinWindow: boolean;
  };
  reviewState: "approved";
  effectiveAt?: string;
  sourceReference?: string;
}

type PolicySnapshot = {
  schemaVersion: 1;
  authority: typeof TYPE2_INSURANCE_CLAIM_POLICY_AUTHORITY;
  reviewState: "approved";
  policies: Type2InsuranceClaimTimingPolicy[];
};

let cache: Type2InsuranceClaimTimingPolicy[] | undefined;
let loadPromise: Promise<Type2InsuranceClaimTimingPolicy[]> | undefined;

function nonEmptyText(value: unknown, maximum = 240): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function policyIsValid(value: unknown): value is Type2InsuranceClaimTimingPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  const timing = policy.claimTiming;
  if (!timing || typeof timing !== "object" || Array.isArray(timing)) return false;
  const rule = timing as Record<string, unknown>;

  return nonEmptyText(policy.id, 160) &&
    nonEmptyText(policy.provider, 80) &&
    (policy.productId === undefined || nonEmptyText(policy.productId, 200)) &&
    (policy.masterDrugId === undefined || nonEmptyText(policy.masterDrugId, 200)) &&
    (policy.productId !== undefined || policy.masterDrugId !== undefined) &&
    policy.reviewState === "approved" &&
    nonEmptyText(rule.groupKey, 160) &&
    positiveInteger(rule.windowDays) &&
    positiveInteger(rule.maxClaimsPerWindow) &&
    nonNegativeInteger(rule.minimumDaysBetweenClaims) &&
    typeof rule.allowDistinctProductsWithinWindow === "boolean" &&
    (policy.effectiveAt === undefined || nonEmptyText(policy.effectiveAt, 80)) &&
    (policy.sourceReference === undefined || nonEmptyText(policy.sourceReference, 240));
}

function snapshotIsValid(value: unknown): value is PolicySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  return snapshot.schemaVersion === 1 &&
    snapshot.authority === TYPE2_INSURANCE_CLAIM_POLICY_AUTHORITY &&
    snapshot.reviewState === "approved" &&
    Array.isArray(snapshot.policies) &&
    snapshot.policies.length <= 500 &&
    snapshot.policies.every(policyIsValid);
}

export function cachedType2InsuranceClaimTimingPolicies() {
  return cache ?? [];
}

export async function loadType2InsuranceClaimTimingPolicies(options?: { force?: boolean }) {
  if (!options?.force && cache) return cache;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const response = await runtimeFetch(
        "/v1/clinical/type2/insurance-policy-snapshot",
      );
      if (!response.ok) return cache ?? [];
      const payload = await response.json() as unknown;
      if (!snapshotIsValid(payload)) return cache ?? [];
      cache = structuredClone(payload.policies);
      return cache;
    } catch {
      return cache ?? [];
    }
  })().finally(() => {
    loadPromise = undefined;
  });

  return loadPromise;
}

export function clearType2InsuranceClaimTimingPolicyCacheForTests() {
  cache = undefined;
  loadPromise = undefined;
}
