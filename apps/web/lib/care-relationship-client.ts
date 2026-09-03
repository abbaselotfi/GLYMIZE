"use client";

import type {
  CareRelationshipCapabilities,
  CareRelationshipLocalRecordInput,
  CareRelationshipRequestInput,
  CareRelationshipStatus,
  CareRelationshipSummary,
  CareRelationshipTransitionInput,
  PracticeCareRelationshipSummary,
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

export async function getCareRelationshipCapabilities() {
  const response = await fetch(endpoint("/v1/care-relationships/capabilities"), {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await errorOf(response, "CARE_RELATIONSHIP_CAPABILITIES_FAILED"));
  return response.json() as Promise<CareRelationshipCapabilities>;
}

export async function requestCareRelationship(input: CareRelationshipRequestInput) {
  const response = await patientIdentityFetch("/v1/care-relationships/requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await errorOf(response, "CARE_RELATIONSHIP_REQUEST_FAILED"));
  const body = await response.json() as { relationship: CareRelationshipSummary };
  return body.relationship;
}

export async function listPatientCareRelationships() {
  const response = await patientIdentityFetch("/v1/care-relationships/patient", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await errorOf(response, "CARE_RELATIONSHIP_LIST_FAILED"));
  const body = await response.json() as { relationships: CareRelationshipSummary[] };
  return body.relationships;
}

export async function revokePatientCareRelationship(
  relationshipId: string,
  input: CareRelationshipTransitionInput,
) {
  const response = await patientIdentityFetch(
    `/v1/care-relationships/${encodeURIComponent(relationshipId)}/patient-revoke`,
    { method: "POST", body: JSON.stringify(input) },
  );
  if (!response.ok) throw new Error(await errorOf(response, "CARE_RELATIONSHIP_REVOKE_FAILED"));
  const body = await response.json() as { relationship: CareRelationshipSummary };
  return body.relationship;
}

export async function listPracticeCareRelationships(status?: CareRelationshipStatus) {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
  const response = await runtimeFetch(`/v1/care-relationships/practice${suffix}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await errorOf(response, "CARE_RELATIONSHIP_LIST_FAILED"));
  const body = await response.json() as { relationships: PracticeCareRelationshipSummary[] };
  return body.relationships;
}

export async function transitionCareRelationship(
  relationshipId: string,
  action: "accept" | "reject" | "pause" | "resume" | "end",
  input: CareRelationshipTransitionInput,
) {
  const response = await runtimeFetch(
    `/v1/care-relationships/${encodeURIComponent(relationshipId)}/${action}`,
    { method: "POST", body: JSON.stringify(input) },
  );
  if (!response.ok) throw new Error(await errorOf(response, "CARE_RELATIONSHIP_TRANSITION_FAILED"));
  const body = await response.json() as { relationship: PracticeCareRelationshipSummary };
  return body.relationship;
}

export async function linkCareRelationshipLocalRecord(
  relationshipId: string,
  input: CareRelationshipLocalRecordInput,
) {
  const response = await runtimeFetch(
    `/v1/care-relationships/${encodeURIComponent(relationshipId)}/link-local-record`,
    { method: "POST", body: JSON.stringify(input) },
  );
  if (!response.ok) throw new Error(await errorOf(response, "CARE_RELATIONSHIP_LINK_FAILED"));
  const body = await response.json() as { relationship: PracticeCareRelationshipSummary };
  return body.relationship;
}

export async function unlinkCareRelationshipLocalRecord(relationshipId: string) {
  const response = await runtimeFetch(
    `/v1/care-relationships/${encodeURIComponent(relationshipId)}/unlink-local-record`,
    { method: "POST", body: JSON.stringify({ confirmed: true }) },
  );
  if (!response.ok) throw new Error(await errorOf(response, "CARE_RELATIONSHIP_UNLINK_FAILED"));
  const body = await response.json() as { relationship: PracticeCareRelationshipSummary };
  return body.relationship;
}
