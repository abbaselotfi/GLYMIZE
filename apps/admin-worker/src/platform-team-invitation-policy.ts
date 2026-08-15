export type TeamInvitationPublicUrlEnv = {
  ADMIN_ORIGIN: string;
  ADMIN_PATH_PREFIX: string;
  PUBLIC_APP_URL?: string;
};

export type TeamInvitationCommunicationsConfig = {
  email?: {
    enabled?: boolean;
    assistantInvitation?: boolean;
  };
};

function normalizedPublicBase(value: string) {
  const parsed = new URL(value);
  const localHttp =
    parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);

  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error("PUBLIC_APP_URL_INVALID");
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${path === "/" ? "" : path}`;
}

function appPathFromAdminPrefix(prefix: string) {
  const normalized = `/${prefix}`
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");

  if (normalized === "/admin") return "";
  if (normalized.endsWith("/admin")) {
    return normalized.slice(0, -"/admin".length);
  }

  return "";
}

export function resolvePublicAppBaseUrl(env: TeamInvitationPublicUrlEnv) {
  const explicit = env.PUBLIC_APP_URL?.trim();
  if (explicit) return normalizedPublicBase(explicit);

  const origin = new URL(env.ADMIN_ORIGIN).origin;
  return normalizedPublicBase(
    `${origin}${appPathFromAdminPrefix(env.ADMIN_PATH_PREFIX)}`,
  );
}

export function assistantInvitationEmailEnabled(
  config: TeamInvitationCommunicationsConfig,
) {
  return (
    config.email?.enabled === true &&
    config.email?.assistantInvitation === true
  );
}
