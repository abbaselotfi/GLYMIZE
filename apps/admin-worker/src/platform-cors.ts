export type RuntimeCorsEnv = {
  ADMIN_ORIGIN: string;
  ADMIN_ALLOWED_ORIGINS?: unknown;
};

function exactHttpOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (candidate !== value) return null;
  if (!candidate || candidate === "*") return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.origin !== candidate) return null;
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function configuredRuntimeOrigins(env: RuntimeCorsEnv): Set<string> {
  const candidates: unknown[] = [env.ADMIN_ORIGIN];
  if (typeof env.ADMIN_ALLOWED_ORIGINS === "string") {
    candidates.push(...env.ADMIN_ALLOWED_ORIGINS.split(","));
  }
  const allowed = new Set<string>();
  for (const candidate of candidates) {
    const origin = exactHttpOrigin(candidate);
    if (origin) allowed.add(origin);
  }
  return allowed;
}

export function isRuntimeOriginAllowed(
  origin: string | null,
  env: RuntimeCorsEnv,
): origin is string {
  const normalized = exactHttpOrigin(origin);
  if (!normalized) return false;
  return configuredRuntimeOrigins(env).has(normalized);
}
