"use client";

import type {
  ManagedProviderProfile,
  ProviderDirectoryCapabilities,
  ProviderDirectorySearchResult,
  ProviderProfileDraftInput,
  PublicProviderProfile,
} from "@glymize/contracts";
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

export async function getProviderDirectoryCapabilities() {
  const response = await fetch(endpoint("/v1/provider-directory/capabilities"), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await errorOf(response, "PROVIDER_DIRECTORY_CAPABILITIES_FAILED"));
  }
  return response.json() as Promise<ProviderDirectoryCapabilities>;
}

export async function searchProviderDirectory(input?: { query?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (input?.query) params.set("q", input.query);
  if (input?.limit !== undefined) params.set("limit", String(input.limit));
  const suffix = params.size ? `?${params.toString()}` : "";
  const response = await fetch(endpoint(`/v1/provider-directory/providers${suffix}`), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await errorOf(response, "PROVIDER_DIRECTORY_SEARCH_FAILED"));
  }
  return response.json() as Promise<ProviderDirectorySearchResult>;
}

export async function getPublicProviderProfile(profileId: string) {
  const response = await fetch(
    endpoint(`/v1/provider-directory/providers/${encodeURIComponent(profileId)}`),
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(await errorOf(response, "PROVIDER_PROFILE_LOAD_FAILED"));
  }
  const body = await response.json() as { provider: PublicProviderProfile };
  return body.provider;
}

export async function getManagedProviderProfile() {
  const response = await runtimeFetch("/v1/provider-directory/manage/profile", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await errorOf(response, "PROVIDER_PROFILE_LOAD_FAILED"));
  }
  const body = await response.json() as { profile: ManagedProviderProfile | null };
  return body.profile;
}

export async function saveManagedProviderProfile(input: ProviderProfileDraftInput) {
  const response = await runtimeFetch("/v1/provider-directory/manage/profile", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await errorOf(response, "PROVIDER_PROFILE_SAVE_FAILED"));
  }
  const body = await response.json() as { profile: ManagedProviderProfile };
  return body.profile;
}

async function setProviderProfileVisibility(action: "publish" | "hide") {
  const response = await runtimeFetch(
    `/v1/provider-directory/manage/profile/${action}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    },
  );
  if (!response.ok) {
    throw new Error(await errorOf(response, "PROVIDER_PROFILE_VISIBILITY_FAILED"));
  }
  const body = await response.json() as { profile: ManagedProviderProfile };
  return body.profile;
}

export function publishManagedProviderProfile() {
  return setProviderProfileVisibility("publish");
}

export function hideManagedProviderProfile() {
  return setProviderProfileVisibility("hide");
}
