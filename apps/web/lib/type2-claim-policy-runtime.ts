"use client";

import {
  configureType2DecisionGraphRuntimeInsurancePolicies,
  type ClaimsAwareInsurancePolicyRuleV2,
} from "@glymize/clinical-engine";
import { runtimeAuthEventName, runtimeFetch } from "./runtime-client";

type TrustedClaimPolicyResponse = {
  schemaVersion: 1;
  authority: "trusted_runtime";
  generatedAt: string;
  expiresAt: string;
  policies: ClaimsAwareInsurancePolicyRuleV2[];
};

let started = false;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

function failClosed() {
  configureType2DecisionGraphRuntimeInsurancePolicies([], 0);
}

function scheduleRefresh() {
  if (typeof window === "undefined") return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    void refreshTrustedType2ClaimPolicies();
  }, 60_000);
}

function looksLikePolicy(value: unknown): value is ClaimsAwareInsurancePolicyRuleV2 {
  if (!value || typeof value !== "object") return false;
  const policy = value as Record<string, unknown>;
  const timing = policy.claimTiming;
  return typeof policy.id === "string" &&
    typeof policy.provider === "string" &&
    (typeof policy.productId === "string" || typeof policy.masterDrugId === "string") &&
    typeof policy.effectiveAt === "string" &&
    typeof policy.sourceReference === "string" &&
    Boolean(timing) &&
    typeof timing === "object";
}

export async function refreshTrustedType2ClaimPolicies() {
  try {
    const response = await runtimeFetch(
      "/v1/clinical/type2/insurance-claim-policies",
      { method: "GET" },
    );
    if (!response.ok) {
      failClosed();
      return;
    }

    const payload = (await response.json()) as Partial<TrustedClaimPolicyResponse>;
    if (
      payload.schemaVersion !== 1 ||
      payload.authority !== "trusted_runtime" ||
      typeof payload.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(payload.expiresAt)) ||
      !Array.isArray(payload.policies) ||
      !payload.policies.every(looksLikePolicy)
    ) {
      failClosed();
      return;
    }

    configureType2DecisionGraphRuntimeInsurancePolicies(
      payload.policies,
      payload.expiresAt,
    );
  } catch {
    failClosed();
  } finally {
    scheduleRefresh();
  }
}

export async function initializeTrustedType2ClaimPolicyRuntime() {
  if (typeof window === "undefined") return;
  if (started) return;
  started = true;
  window.addEventListener(runtimeAuthEventName(), () => {
    void refreshTrustedType2ClaimPolicies();
  });
  await refreshTrustedType2ClaimPolicies();
}
