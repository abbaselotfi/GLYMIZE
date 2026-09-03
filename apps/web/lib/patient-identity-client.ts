"use client";

import type {
  PatientIdentityCapabilities,
  PatientIdentityLoginInput,
  PatientIdentityRegistrationInput,
  PatientIdentityRegistrationResult,
  PatientIdentitySessionResult,
  PatientIdentitySessionView,
  PatientLinkedPortalSessionResult,
  PatientVerifiedLegacyLinkSummary,
} from "@glymize/contracts";

import { runtimeApiUrl } from "./runtime-api-url";

const accessKey = "glymize-patient-identity-access-v1";
const refreshLocalKey = "glymize-patient-identity-refresh-local-v1";
const refreshSessionKey = "glymize-patient-identity-refresh-session-v1";

function inBrowser() {
  return typeof window !== "undefined";
}

export function getPatientIdentityAccessToken() {
  return inBrowser() ? window.sessionStorage.getItem(accessKey) : null;
}

function getRefreshToken() {
  if (!inBrowser()) return null;
  return (
    window.localStorage.getItem(refreshLocalKey) ??
    window.sessionStorage.getItem(refreshSessionKey)
  );
}

function storeSession(session: PatientIdentitySessionResult) {
  if (!inBrowser()) return;
  window.sessionStorage.setItem(accessKey, session.accessToken);
  window.localStorage.removeItem(refreshLocalKey);
  window.sessionStorage.removeItem(refreshSessionKey);
  if (session.persistent) {
    window.localStorage.setItem(refreshLocalKey, session.refreshToken);
  } else {
    window.sessionStorage.setItem(refreshSessionKey, session.refreshToken);
  }
}

export function clearPatientIdentitySession() {
  if (!inBrowser()) return;
  window.sessionStorage.removeItem(accessKey);
  window.localStorage.removeItem(refreshLocalKey);
  window.sessionStorage.removeItem(refreshSessionKey);
}

async function errorOf(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as
    | Record<string, unknown>
    | null;
  return String(body?.error ?? fallback);
}

let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken || !runtimeApiUrl) return false;
  try {
    const response = await fetch(
      `${runtimeApiUrl}/v1/patient-identity/auth/refresh`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken, deviceLabel: "patient-web-refresh" }),
      },
    );
    if (!response.ok) {
      if (
        (response.status === 401 || response.status === 403) &&
        getRefreshToken() === refreshToken
      ) {
        clearPatientIdentitySession();
      }
      return false;
    }
    storeSession(await response.json() as PatientIdentitySessionResult);
    return true;
  } catch {
    return false;
  }
}

export function refreshPatientIdentitySession() {
  if (refreshInFlight) return refreshInFlight;
  const operation = performRefresh();
  refreshInFlight = operation;
  void operation.finally(() => {
    if (refreshInFlight === operation) refreshInFlight = null;
  });
  return operation;
}

async function identityFetch(path: string, init: RequestInit = {}, retry = true) {
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const token = getPatientIdentityAccessToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body) headers["content-type"] = "application/json";
  const response = await fetch(`${runtimeApiUrl}${path}`, { ...init, headers });
  if (response.status === 401 && retry && await refreshPatientIdentitySession()) {
    return identityFetch(path, init, false);
  }
  return response;
}

export async function getPatientIdentityCapabilities() {
  const response = await fetch(`${runtimeApiUrl}/v1/patient-identity/capabilities`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await errorOf(response, "PATIENT_IDENTITY_CAPABILITIES_FAILED"));
  }
  return response.json() as Promise<PatientIdentityCapabilities>;
}

export async function registerPatientIdentity(
  input: PatientIdentityRegistrationInput,
) {
  const response = await fetch(`${runtimeApiUrl}/v1/patient-identity/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await errorOf(response, "PATIENT_IDENTITY_REGISTRATION_FAILED"));
  }
  return response.json() as Promise<PatientIdentityRegistrationResult>;
}

export async function loginPatientIdentity(input: PatientIdentityLoginInput) {
  const response = await fetch(`${runtimeApiUrl}/v1/patient-identity/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, deviceLabel: input.deviceLabel ?? "patient-web" }),
  });
  if (!response.ok) {
    throw new Error(await errorOf(response, "PATIENT_IDENTITY_LOGIN_FAILED"));
  }
  const session = await response.json() as PatientIdentitySessionResult;
  storeSession(session);
  return session;
}

export async function getPatientIdentitySession() {
  const response = await identityFetch("/v1/patient-identity/session");
  if (!response.ok) return null;
  return response.json() as Promise<PatientIdentitySessionView>;
}

export async function listVerifiedPatientLegacyLinks() {
  const response = await identityFetch("/v1/patient-identity/links");
  if (!response.ok) {
    throw new Error(await errorOf(response, "PATIENT_IDENTITY_LINKS_FAILED"));
  }
  const body = await response.json() as { links: PatientVerifiedLegacyLinkSummary[] };
  return body.links;
}

export async function exchangeVerifiedPatientLegacyLink(
  portalUserId: string,
  rememberMe: boolean,
) {
  const response = await identityFetch(
    `/v1/patient-identity/links/${encodeURIComponent(portalUserId)}/portal-session`,
    {
      method: "POST",
      body: JSON.stringify({
        rememberMe,
        deviceLabel: "patient-web-linked-portal",
      }),
    },
  );
  if (!response.ok) {
    throw new Error(await errorOf(response, "PATIENT_PORTAL_EXCHANGE_FAILED"));
  }
  return response.json() as Promise<PatientLinkedPortalSessionResult>;
}

export async function logoutPatientIdentity() {
  try {
    await identityFetch("/v1/patient-identity/auth/logout", { method: "POST" }, false);
  } finally {
    clearPatientIdentitySession();
  }
}
