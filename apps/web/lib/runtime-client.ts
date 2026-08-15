"use client";

import type { AssistantPermission, RuntimePermission } from "./runtime-permissions";
export type { AssistantPermission, RuntimePermission } from "./runtime-permissions";

const runtimeApiUrl = (process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "").replace(/\/$/, "");
const accessKey = "glymize-runtime-access-v1";
const refreshLocalKey = "glymize-runtime-refresh-v1";
const refreshSessionKey = "glymize-runtime-refresh-session-v1";
const adminSessionKey = "glymize-admin-session";
const authEvent = "glymize-runtime-auth-change";

export type RuntimeRole = "physician" | "assistant";
export type LayoutPreset = "auto" | "command_center" | "focused_workflow" | "compact_cards";
export interface RuntimeUser {
  id: string;
  role: RuntimeRole;
  status: "active" | "disabled";
  firstName: string;
  lastName: string;
  email?: string;
  mobile?: string;
  medicalCouncilCode?: string;
  irimcStatus?: "verified" | "pending" | "unavailable";
  irimcVerifiedAt?: string;
  profilePhoto?: string;
  profilePhotoSource?: "irimc" | "user_upload" | "none";
  layoutPreset: LayoutPreset;
  practiceId: string;
  practiceName: string;
  permissions: RuntimePermission[];
}

export interface RuntimeSessionResponse {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  user: RuntimeUser;
}

export interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  mobile?: string;
  profilePhoto?: string;
  role: RuntimeRole;
  status: "active" | "disabled";
  permissions: AssistantPermission[];
  createdAt: string;
}

let cachedUser: RuntimeUser | null = null;
let initPromise: Promise<RuntimeUser | null> | null = null;

function browser() {
  return typeof window !== "undefined";
}

function emitAuthChange() {
  if (browser()) window.dispatchEvent(new CustomEvent(authEvent));
}

export function runtimeAuthEventName() {
  return authEvent;
}

export function isRuntimeApiConfigured() {
  return Boolean(runtimeApiUrl);
}

export function getCachedRuntimeUser() {
  return cachedUser;
}

export function getRuntimeAccessToken() {
  return getAccessToken();
}

function getAccessToken() {
  return browser() ? window.sessionStorage.getItem(accessKey) : null;
}

function getRefreshToken() {
  if (!browser()) return null;
  return window.localStorage.getItem(refreshLocalKey) ?? window.sessionStorage.getItem(refreshSessionKey);
}

function isPersistentRefresh() {
  return browser() && Boolean(window.localStorage.getItem(refreshLocalKey));
}

function storeSession(session: RuntimeSessionResponse, rememberMe: boolean) {
  if (!browser()) return;
  window.sessionStorage.setItem(accessKey, session.accessToken);
  window.localStorage.removeItem(refreshLocalKey);
  window.sessionStorage.removeItem(refreshSessionKey);
  if (rememberMe) window.localStorage.setItem(refreshLocalKey, session.refreshToken);
  else window.sessionStorage.setItem(refreshSessionKey, session.refreshToken);
  cachedUser = session.user;
  emitAuthChange();
}

function clearSession() {
  if (!browser()) return;
  window.sessionStorage.removeItem(accessKey);
  window.localStorage.removeItem(refreshLocalKey);
  window.sessionStorage.removeItem(refreshSessionKey);
  cachedUser = null;
  emitAuthChange();
}

function deviceLabel() {
  if (!browser()) return "web";
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ? "PWA" : "Browser";
  return `${standalone} · ${navigator.platform || "web"}`.slice(0, 160);
}

async function directFetch(path: string, init?: RequestInit) {
  if (!runtimeApiUrl) throw new Error("RUNTIME_API_NOT_CONFIGURED");
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(`${runtimeApiUrl}${path}`, { ...init, headers, cache: "no-store" });
}

async function refreshWithStoredToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  const rememberMe = isPersistentRefresh();
  const response = await directFetch("/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken, deviceLabel: deviceLabel() }),
  });
  if (!response.ok) {
    clearSession();
    return null;
  }
  const session = await response.json() as RuntimeSessionResponse;
  storeSession(session, rememberMe);
  return session.user;
}

async function loadCurrentUser() {
  const accessToken = getAccessToken();
  if (accessToken) {
    const response = await directFetch("/v1/session", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      cachedUser = await response.json() as RuntimeUser;
      return cachedUser;
    }
  }
  return refreshWithStoredToken();
}

export function initializeRuntimeSession(force = false): Promise<RuntimeUser | null> {
  if (!browser() || !runtimeApiUrl) return Promise.resolve(null);
  if (!force && initPromise) return initPromise;
  initPromise = loadCurrentUser()
    .catch(() => {
      cachedUser = null;
      return null;
    })
    .finally(() => { initPromise = null; });
  return initPromise;
}

export async function runtimeFetch(path: string, init?: RequestInit, options?: { allowAdminFallback?: boolean }) {
  let accessToken = getAccessToken();
  if (!accessToken && getRefreshToken()) {
    await refreshWithStoredToken().catch(() => null);
    accessToken = getAccessToken();
  }

  const send = async (token: string | null) => {
    const headers = new Headers(init?.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (init?.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
    return directFetch(path, { ...init, headers });
  };

  let response = await send(accessToken);
  if (response.status === 401 && getRefreshToken()) {
    const user = await refreshWithStoredToken().catch(() => null);
    if (user) response = await send(getAccessToken());
  }

  if (response.status === 401 && options?.allowAdminFallback && browser()) {
    const admin = window.sessionStorage.getItem(adminSessionKey);
    if (admin) response = await send(admin);
  }
  return response;
}

export async function requestLoginCode(identifier: string) {
  const response = await directFetch("/v1/auth/login/request", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
  const result = await response.json() as { challengeId?: string; expiresAt?: string; delivered?: boolean; channel?: string; error?: string };
  if (!response.ok || !result.challengeId) throw new Error(result.error ?? "LOGIN_CODE_REQUEST_FAILED");
  return result;
}

export async function verifyLoginCode(challengeId: string, code: string, rememberMe: boolean) {
  const response = await directFetch("/v1/auth/login/verify", {
    method: "POST",
    body: JSON.stringify({ challengeId, code, rememberMe, deviceLabel: deviceLabel() }),
  });
  const result = await response.json() as RuntimeSessionResponse & { error?: string };
  if (!response.ok || !result.accessToken) throw new Error(result.error ?? "LOGIN_CODE_VERIFY_FAILED");
  storeSession(result, rememberMe);
  return result.user;
}

export async function registerPhysician(input: {
  medicalCouncilCode: string;
  firstName: string;
  lastName: string;
  email?: string;
  mobile?: string;
  rememberMe: boolean;
}) {
  const response = await directFetch("/v1/auth/physician/register", {
    method: "POST",
    body: JSON.stringify({ ...input, deviceLabel: deviceLabel() }),
  });
  const result = await response.json() as RuntimeSessionResponse & { error?: string; retryable?: boolean };
  if (!response.ok || !result.accessToken) throw new Error(result.error ?? "PHYSICIAN_REGISTRATION_FAILED");
  storeSession(result, input.rememberMe);
  return result.user;
}

export async function bootstrapPhysicianWithAdmin(input: {
  medicalCouncilCode: string;
  firstName: string;
  lastName: string;
  email?: string;
  mobile?: string;
  profilePhoto?: string;
}) {
  if (!browser()) throw new Error("ADMIN_AUTH_REQUIRED");
  const admin = window.sessionStorage.getItem(adminSessionKey);
  if (!admin) throw new Error("ADMIN_AUTH_REQUIRED");
  const response = await directFetch("/v1/admin/runtime/bootstrap-physician", {
    method: "POST",
    headers: { authorization: `Bearer ${admin}` },
    body: JSON.stringify(input),
  });
  const result = await response.json() as RuntimeSessionResponse & { error?: string };
  if (!response.ok || !result.accessToken) throw new Error(result.error ?? "PHYSICIAN_BOOTSTRAP_FAILED");
  storeSession(result, true);
  return result.user;
}

export async function inspectTeamInvitation(token: string) {
  const response = await directFetch(`/v1/team/invitations/${encodeURIComponent(token)}`);
  const result = await response.json() as {
    id?: string; firstName?: string; lastName?: string; email?: string; mobile?: string;
    expiresAt?: string; practiceName?: string; physicianName?: string; error?: string;
  };
  if (!response.ok) throw new Error(result.error ?? "INVITATION_INVALID");
  return result;
}

export async function acceptTeamInvitation(token: string, rememberMe: boolean) {
  const response = await directFetch("/v1/team/invitations/accept", {
    method: "POST",
    body: JSON.stringify({ token, rememberMe, deviceLabel: deviceLabel() }),
  });
  const result = await response.json() as RuntimeSessionResponse & { error?: string };
  if (!response.ok || !result.accessToken) throw new Error(result.error ?? "INVITATION_ACCEPT_FAILED");
  storeSession(result, rememberMe);
  return result.user;
}

export async function getRuntimeProfile() {
  const response = await runtimeFetch("/v1/profile");
  if (!response.ok) throw new Error(response.status === 401 ? "AUTH_REQUIRED" : "PROFILE_READ_FAILED");
  const user = await response.json() as RuntimeUser;
  cachedUser = user;
  emitAuthChange();
  return user;
}

export async function updateRuntimeProfile(input: Partial<Pick<RuntimeUser, "firstName" | "lastName" | "profilePhoto" | "layoutPreset">>) {
  const response = await runtimeFetch("/v1/profile", { method: "PATCH", body: JSON.stringify(input) });
  const result = await response.json() as RuntimeUser & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "PROFILE_UPDATE_FAILED");
  cachedUser = result;
  emitAuthChange();
  return result;
}

export async function getTeamMembers() {
  const response = await runtimeFetch("/v1/team");
  const result = await response.json() as TeamMember[] | { error?: string };
  if (!response.ok || !Array.isArray(result)) throw new Error(!Array.isArray(result) ? result.error ?? "TEAM_READ_FAILED" : "TEAM_READ_FAILED");
  return result;
}

export async function inviteTeamMember(input: {
  firstName: string;
  lastName: string;
  email?: string;
  mobile?: string;
  permissions: AssistantPermission[];
}) {
  const response = await runtimeFetch("/v1/team/invitations", { method: "POST", body: JSON.stringify(input) });
  const result = await response.json() as { id?: string; inviteUrl?: string; delivered?: boolean; error?: string };
  if (!response.ok) throw new Error(result.error ?? "TEAM_INVITE_FAILED");
  return result;
}

export async function updateTeamMember(memberId: string, input: { permissions: AssistantPermission[]; status?: "active" | "disabled" }) {
  const response = await runtimeFetch(`/v1/team/members/${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  const result = await response.json() as { updated?: boolean; error?: string };
  if (!response.ok) throw new Error(result.error ?? "TEAM_MEMBER_UPDATE_FAILED");
  return result;
}

export async function logoutRuntime() {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) await directFetch("/v1/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
  } finally {
    clearSession();
  }
}
