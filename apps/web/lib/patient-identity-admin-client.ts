"use client";

import type {
  PatientLegacyLinkReviewSummary,
  PatientLegacyLinkStatus,
} from "@glymize/contracts";

import { runtimeFetch } from "./runtime-client";

async function errorOf(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as
    | Record<string, unknown>
    | null;
  throw new Error(String(body?.error ?? fallback));
}

export async function listPatientLegacyLinks(status?: PatientLegacyLinkStatus) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const response = await runtimeFetch(
    `/v1/patient-identity/legacy-links${query}`,
    undefined,
    { allowAdminFallback: false },
  );
  if (!response.ok) await errorOf(response, "PATIENT_LINKS_READ_FAILED");
  const body = await response.json() as { links: PatientLegacyLinkReviewSummary[] };
  return body.links;
}

export async function decidePatientLegacyLink(
  portalUserId: string,
  decision: "verify" | "reject" | "revoke",
) {
  const response = await runtimeFetch(
    `/v1/patient-identity/legacy-links/${encodeURIComponent(portalUserId)}/${decision}`,
    {
      method: "POST",
      body: JSON.stringify({ confirmed: true }),
    },
    { allowAdminFallback: false },
  );
  if (!response.ok) await errorOf(response, "PATIENT_LINK_DECISION_FAILED");
  return response.json() as Promise<{ link: PatientLegacyLinkReviewSummary }>;
}
