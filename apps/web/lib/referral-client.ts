"use client";

import type {
  IssuedReferral,
  ReferralCapabilities,
  ReferralInspection,
  ReferralIssueInput,
  ReferralRedemption,
  ReferralSummary,
} from "@glymize/contracts";
import { patientIdentityFetch } from "./patient-identity-client";
import { runtimeApiUrl } from "./runtime-api-url";
import { runtimeFetch } from "./runtime-client";

function endpoint(path: string) {
  if (!runtimeApiUrl) throw new Error("RUNTIME_API_NOT_CONFIGURED");
  return `${runtimeApiUrl}${path}`;
}

async function errorOf(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  return String(body?.error ?? fallback);
}

export async function getReferralCapabilities() {
  const response = await fetch(endpoint("/v1/referrals/capabilities"), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await errorOf(response, "REFERRAL_CAPABILITIES_FAILED"));
  }
  return response.json() as Promise<ReferralCapabilities>;
}

export async function inspectReferralCode(code: string) {
  const response = await fetch(endpoint("/v1/referrals/inspect"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await errorOf(response, "REFERRAL_UNAVAILABLE"));
  }
  const body = await response.json() as { referral: ReferralInspection };
  return body.referral;
}

export async function redeemReferralCode(code: string) {
  const response = await patientIdentityFetch("/v1/referrals/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, confirmed: true }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await errorOf(response, "REFERRAL_REDEMPTION_FAILED"));
  }
  const body = await response.json() as { redemption: ReferralRedemption };
  return body.redemption;
}

export async function listManagedReferrals() {
  const response = await runtimeFetch("/v1/referrals", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await errorOf(response, "REFERRAL_LIST_FAILED"));
  }
  const body = await response.json() as { referrals: ReferralSummary[] };
  return body.referrals;
}

export async function issueManagedReferral(input: ReferralIssueInput) {
  const response = await runtimeFetch("/v1/referrals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await errorOf(response, "REFERRAL_ISSUANCE_FAILED"));
  }
  const body = await response.json() as { referral: IssuedReferral };
  return body.referral;
}

export async function revokeManagedReferral(referralId: string) {
  const response = await runtimeFetch(
    `/v1/referrals/${encodeURIComponent(referralId)}/revoke`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    },
  );
  if (!response.ok) {
    throw new Error(await errorOf(response, "REFERRAL_REVOKE_FAILED"));
  }
  const body = await response.json() as { referral: ReferralSummary };
  return body.referral;
}
