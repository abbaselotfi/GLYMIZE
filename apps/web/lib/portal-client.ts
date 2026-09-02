"use client";

import type {
  PortalMessage,
  PortalSessionUser,
  PortalSubmissionSummary,
  PortalThreadMessagesPage,
  PortalThreadSummary,
} from "@glymize/contracts";
import { runtimeApiUrl } from "./runtime-api-url";

const accessKey = "glymize-portal-access-v1";
const refreshLocalKey = "glymize-portal-refresh-local-v1";
const refreshSessionKey = "glymize-portal-refresh-session-v1";

export interface PortalLoginResponse {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  persistent: boolean;
  mustChangePassword: boolean;
}

function browser() {
  return typeof window !== "undefined";
}

export function getPortalAccessToken() {
  return browser() ? window.sessionStorage.getItem(accessKey) : null;
}

function getRefreshToken() {
  if (!browser()) return null;
  return (
    window.localStorage.getItem(refreshLocalKey) ??
    window.sessionStorage.getItem(refreshSessionKey)
  );
}

function storeSession(
  session: PortalLoginResponse,
) {
  if (!browser()) return;

  window.sessionStorage.setItem(
    accessKey,
    session.accessToken,
  );

  window.localStorage.removeItem(
    refreshLocalKey,
  );

  window.sessionStorage.removeItem(
    refreshSessionKey,
  );

  if (session.persistent === true) {
    window.localStorage.setItem(
      refreshLocalKey,
      session.refreshToken,
    );
  } else {
    window.sessionStorage.setItem(
      refreshSessionKey,
      session.refreshToken,
    );
  }
}

export function adoptPortalSession(session: PortalLoginResponse) {
  storeSession(session);
}
export function clearPortalSession() {
  if (!browser()) return;
  window.sessionStorage.removeItem(accessKey);
  window.localStorage.removeItem(refreshLocalKey);
  window.sessionStorage.removeItem(refreshSessionKey);
}

let portalRefreshInFlight: Promise<boolean> | null = null;

async function performPortalRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();

  if (!refreshToken || !runtimeApiUrl) {
    return false;
  }

  try {
    const response = await fetch(
      `${runtimeApiUrl}/v1/portal/auth/refresh`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          refreshToken,
        }),
      },
    );

    if (!response.ok) {
      // Never let a stale cross-tab refresh failure erase a token
      // that another tab has already rotated successfully.
      if (
        (response.status === 401 ||
          response.status === 403) &&
        getRefreshToken() === refreshToken
      ) {
        clearPortalSession();
      }

      return false;
    }

    const session =
      await response.json() as PortalLoginResponse;

    storeSession(session);
    return true;
  } catch {
    // Network failure does not prove the server-side session is invalid.
    return false;
  }
}

export function refreshPortalSession(): Promise<boolean> {
  if (portalRefreshInFlight) {
    return portalRefreshInFlight;
  }

  const operation = performPortalRefresh();
  portalRefreshInFlight = operation;

  void operation.finally(() => {
    if (portalRefreshInFlight === operation) {
      portalRefreshInFlight = null;
    }
  });

  return operation;
}
async function portalFetch(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const token = getPortalAccessToken();
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body && !(init.body instanceof FormData)) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${runtimeApiUrl}${path}`, {
    ...init,
    headers,
  });
  if (response.status === 401 && retry) {
    const refreshed = await refreshPortalSession();
    if (refreshed) return portalFetch(path, init, false);
  }
  return response;
}

export async function logoutPortal(): Promise<void> {
  try {
    if (!runtimeApiUrl) {
      return;
    }

    await portalFetch(
      "/v1/portal/auth/logout",
      {
        method: "POST",
      },
    );
  } finally {
    // Local logout must always complete even if the network is unavailable.
    clearPortalSession();
  }
}
async function errorOf(response: Response, fallback: string) {
  const body = await response
    .json()
    .catch(() => null) as Record<string, unknown> | null;
  return String(body?.error ?? fallback);
}

export async function portalLogin(
  login: string,
  password: string,
  rememberMe: boolean,
): Promise<PortalLoginResponse> {
  const response = await fetch(`${runtimeApiUrl}/v1/portal/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      login,
      password,
      rememberMe,
      deviceLabel: "portal-web",
    }),
  });
  if (!response.ok) {
    throw new Error(await errorOf(response, "PORTAL_LOGIN_FAILED"));
  }
  const session = await response.json() as PortalLoginResponse;
  storeSession(session);
  return session;
}

export async function getPortalSession(): Promise<PortalSessionUser | null> {
  const response = await portalFetch("/v1/portal/session");
  if (!response.ok) return null;
  const body = await response.json() as { user: PortalSessionUser };
  return body.user;
}

export async function changePortalPassword(
  currentPassword: string,
  newPassword: string,
) {
  const response = await portalFetch(
    "/v1/portal/auth/password",
    {
      method: "POST",
      body: JSON.stringify({
        currentPassword,
        newPassword,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      await errorOf(
        response,
        "PORTAL_PASSWORD_CHANGE_FAILED",
      ),
    );
  }

  const result =
    await response.json() as PortalLoginResponse & {
      ok: boolean;
    };

  storeSession(result);
  return result;
}
export async function createPortalSubmission(input: Record<string, unknown>) {
  const response = await portalFetch("/v1/portal/submissions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await errorOf(response, "PORTAL_SUBMISSION_FAILED"));
  }
  return response.json() as Promise<{ submission: PortalSubmissionSummary }>;
}

export async function listPortalSubmissions() {
  const response = await portalFetch("/v1/portal/submissions");
  if (!response.ok) throw new Error("PORTAL_SUBMISSION_LIST_FAILED");
  return response.json() as Promise<{ submissions: PortalSubmissionSummary[] }>;
}

export async function listPortalThreads() {
  const response = await portalFetch("/v1/portal/threads");
  if (!response.ok) throw new Error("PORTAL_THREAD_LIST_FAILED");
  return response.json() as Promise<{ threads: PortalThreadSummary[] }>;
}

export async function listPortalThreadMessages(threadId: string) {
  const response = await portalFetch(
    `/v1/portal/threads/${encodeURIComponent(threadId)}/messages`,
  );
  if (!response.ok) throw new Error("PORTAL_MESSAGES_FAILED");
  return response.json() as Promise<PortalThreadMessagesPage>;
}

export async function sendPortalMessage(
  threadId: string,
  body: string,
  files: File[],
) {
  let response: Response;
  const path = `/v1/portal/threads/${encodeURIComponent(threadId)}/messages`;
  if (files.length > 0) {
    const form = new FormData();
    form.append("payload", JSON.stringify({ body }));
    for (const file of files) form.append("files", file);
    response = await portalFetch(path, { method: "POST", body: form });
  } else {
    response = await portalFetch(path, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }
  if (!response.ok) {
    throw new Error(await errorOf(response, "PORTAL_MESSAGE_SEND_FAILED"));
  }
  return response.json() as Promise<{ message: PortalMessage }>;
}

export async function downloadPortalAttachment(
  attachmentId: string,
): Promise<Blob> {
  const response = await portalFetch(
    `/v1/portal/attachments/${encodeURIComponent(attachmentId)}`,
  );
  if (!response.ok) throw new Error("PORTAL_ATTACHMENT_DOWNLOAD_FAILED");
  return response.blob();
}
