import { getRuntimeAccessToken, initializeRuntimeSession } from "./runtime-client";
import type { RuntimePermission } from "./runtime-permissions";

const adminApiUrl = (process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "").replace(/\/$/, "");
const sessionStorageKey = "glymize-admin-session";

export interface AdminIdentity {
  login: string;
  expiresAt: string;
  source: "github" | "runtime";
  userId?: string;
  permissions: RuntimePermission[];
}

export interface CatalogPublishResult {
  commitSha: string;
  commitUrl: string;
  message: string;
}

export function isAdminApiConfigured() {
  return Boolean(adminApiUrl);
}

export function consumeAdminSessionFromLocation() {
  if (typeof window === "undefined") return null;
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const session = fragment.get("auth_session");
  if (!session) return null;
  window.sessionStorage.setItem(sessionStorageKey, session);
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
  return session;
}

export function getAdminSession() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(sessionStorageKey);
}

export function clearAdminSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(sessionStorageKey);
}

export function getAdminBearerToken() {
  return getAdminSession() ?? getRuntimeAccessToken();
}

export async function getFreshAdminBearerToken() {
  const github = getAdminSession();
  if (github) return github;
  await initializeRuntimeSession(true).catch(() => null);
  return getRuntimeAccessToken();
}

export function getAdminLoginUrl(returnTo: string) {
  if (!adminApiUrl) return "";
  const url = new URL(`${adminApiUrl}/auth/start`);
  url.searchParams.set("return_to", returnTo);
  return url.toString();
}

async function authenticatedFetch(path: string, init?: RequestInit) {
  const session = await getFreshAdminBearerToken();
  if (!adminApiUrl || !session) throw new Error("admin_auth_required");
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${session}`);
  headers.set("content-type", "application/json");
  return fetch(`${adminApiUrl}${path}`, { ...init, headers, cache: "no-store" });
}

export async function getAdminIdentity(): Promise<AdminIdentity> {
  const response = await authenticatedFetch("/session");
  if (!response.ok) {
    if ((response.status === 401 || response.status === 403) && getAdminSession()) clearAdminSession();
    throw new Error("admin_auth_invalid");
  }
  return response.json() as Promise<AdminIdentity>;
}

export async function publishAdminCatalog(catalog: unknown): Promise<CatalogPublishResult> {
  const response = await authenticatedFetch("/catalog/publish", {
    method: "POST",
    body: JSON.stringify({ catalog })
  });
  const result = await response.json() as CatalogPublishResult & { error?: string };
  if (!response.ok) {
    if ((response.status === 401 || response.status === 403) && getAdminSession()) clearAdminSession();
    throw new Error(result.error ?? "catalog_publish_failed");
  }
  return result;
}

export type AdminAiProvider = "workers_ai" | "openai_compatible";
export type AdminAiRole = "primary" | "fallback" | "compare";
export type AdminAiReasoningEffort = "none" | "low" | "medium" | "high";

export interface AdminAiModel {
  id: string;
  name: string;
  provider: AdminAiProvider;
  enabled: boolean;
  role: AdminAiRole;
  priority: number;
  accountId?: string;
  gatewayId?: string;
  baseUrl?: string;
  modelId: string;
  reasoningEffort: AdminAiReasoningEffort;
  maxCompletionTokens: number;
  timeoutMs: number;
  tokenConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAiModelInput {
  name: string;
  provider: AdminAiProvider;
  enabled: boolean;
  role: AdminAiRole;
  priority: number;
  accountId?: string;
  gatewayId?: string;
  baseUrl?: string;
  modelId: string;
  reasoningEffort: AdminAiReasoningEffort;
  maxCompletionTokens: number;
  timeoutMs: number;
  token?: string;
}

export async function listAdminAiModels(): Promise<AdminAiModel[]> {
  const response = await authenticatedFetch("/ai/models");
  if (!response.ok) throw new Error("ai_models_read_failed");
  return response.json() as Promise<AdminAiModel[]>;
}

export async function createAdminAiModel(input: AdminAiModelInput): Promise<AdminAiModel> {
  const response = await authenticatedFetch("/ai/models", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const result = await response.json() as AdminAiModel & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "ai_model_create_failed");
  return result;
}

export async function updateAdminAiModel(id: string, input: AdminAiModelInput): Promise<AdminAiModel> {
  const response = await authenticatedFetch(`/ai/models/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  const result = await response.json() as AdminAiModel & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "ai_model_update_failed");
  return result;
}

export async function deleteAdminAiModel(id: string): Promise<void> {
  const response = await authenticatedFetch(`/ai/models/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    const result = await response.json() as { error?: string };
    throw new Error(result.error ?? "ai_model_delete_failed");
  }
}

export async function testAdminAiModel(id: string) {
  const response = await authenticatedFetch(`/ai/models/${encodeURIComponent(id)}/test`, { method: "POST" });
  const result = await response.json() as {
    healthy?: boolean;
    configuredModel?: string;
    latencyMs?: number;
    httpStatus?: number;
    error?: string;
  };
  if (!response.ok) throw new Error(result.error ?? "ai_model_test_failed");
  return result;
}

export interface AdminCommunicationsConfig {
  version: 1;
  physicianIdentity: {
    provider: "irimc";
    required: true;
    matchMode: "exact";
    priority: 1;
    bypassAllowedOnMismatch: false;
  };
  sms: {
    provider: "sms_ir";
    enabled: boolean;
    registrationOtp: boolean;
    loginOtp: boolean;
    passwordReset: boolean;
    assistantInvitation: boolean;
    lineNumber: string;
    otpTemplateId?: number;
    otpParameterName: string;
    apiKeyConfigured: boolean;
  };
  email: {
    provider: "resend";
    enabled: boolean;
    registrationVerification: boolean;
    passwordReset: boolean;
    assistantInvitation: boolean;
    fromAddress: string;
    apiKeyConfigured: boolean;
  };
  effectiveRegistration: {
    medicalCouncilRequired: true;
    smsRequired: boolean;
    emailRequired: boolean;
    contactVerificationRequired: boolean;
  };
  updatedAt: string;
}

export interface AdminCommunicationsConfigInput {
  sms?: Partial<Pick<AdminCommunicationsConfig["sms"],
    "enabled" | "registrationOtp" | "loginOtp" | "passwordReset" | "assistantInvitation" |
    "lineNumber" | "otpTemplateId" | "otpParameterName"
  >>;
  email?: Partial<Pick<AdminCommunicationsConfig["email"],
    "enabled" | "registrationVerification" | "passwordReset" | "assistantInvitation" | "fromAddress"
  >>;
}

export async function getAdminCommunicationsConfig(): Promise<AdminCommunicationsConfig> {
  const response = await authenticatedFetch("/communications/config");
  const result = await response.json() as AdminCommunicationsConfig & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "communications_config_read_failed");
  return result;
}

export async function updateAdminCommunicationsConfig(input: AdminCommunicationsConfigInput): Promise<AdminCommunicationsConfig> {
  const response = await authenticatedFetch("/communications/config", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  const result = await response.json() as AdminCommunicationsConfig & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "communications_config_update_failed");
  return result;
}

export async function setAdminSmsApiKey(apiKey: string) {
  const response = await authenticatedFetch("/communications/sms/secret", {
    method: "POST",
    body: JSON.stringify({ apiKey }),
  });
  const result = await response.json() as { configured?: boolean; error?: string };
  if (!response.ok) throw new Error(result.error ?? "sms_api_key_save_failed");
  return result;
}

export async function deleteAdminSmsApiKey() {
  const response = await authenticatedFetch("/communications/sms/secret", { method: "DELETE" });
  const result = await response.json() as { configured?: boolean; error?: string };
  if (!response.ok) throw new Error(result.error ?? "sms_api_key_delete_failed");
  return result;
}

export async function testAdminSmsConnection() {
  const response = await authenticatedFetch("/communications/sms/test", { method: "POST" });
  const result = await response.json() as {
    healthy?: boolean;
    credit?: unknown;
    httpStatus?: number;
    latencyMs?: number;
    message?: string;
    error?: string;
  };
  if (!response.ok) throw new Error(result.error ?? result.message ?? "sms_connection_test_failed");
  return result;
}

export async function sendAdminTestSms(mobile: string) {
  const response = await authenticatedFetch("/communications/sms/send-test", {
    method: "POST",
    body: JSON.stringify({ mobile }),
  });
  const result = await response.json() as { sent?: boolean; mobile?: string; error?: string; message?: string };
  if (!response.ok) throw new Error(result.error ?? result.message ?? "sms_test_send_failed");
  return result;
}

export async function setAdminEmailApiKey(apiKey: string) {
  const response = await authenticatedFetch("/communications/email/secret", {
    method: "POST",
    body: JSON.stringify({ apiKey }),
  });
  const result = await response.json() as { configured?: boolean; error?: string };
  if (!response.ok) throw new Error(result.error ?? "email_api_key_save_failed");
  return result;
}

export async function deleteAdminEmailApiKey() {
  const response = await authenticatedFetch("/communications/email/secret", { method: "DELETE" });
  const result = await response.json() as { configured?: boolean; error?: string };
  if (!response.ok) throw new Error(result.error ?? "email_api_key_delete_failed");
  return result;
}

export async function sendAdminTestEmail(to: string) {
  const response = await authenticatedFetch("/communications/email/send-test", {
    method: "POST",
    body: JSON.stringify({ to }),
  });
  const result = await response.json() as { sent?: boolean; id?: string; error?: string; message?: string };
  if (!response.ok) throw new Error(result.error ?? result.message ?? "email_test_send_failed");
  return result;
}
