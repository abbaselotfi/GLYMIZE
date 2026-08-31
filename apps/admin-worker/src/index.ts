import { isRuntimeOriginAllowed } from "./platform-cors";
import {
  ADMIN_PERMISSION_KEYS,
  openPayload,
  sanitizeRuntimePermissions,
  type AdminPermission,
  type RuntimePermission,
} from "./runtime-security";

interface Env {
  ADMIN_ORIGIN: string;
  ADMIN_PATH_PREFIX: string;
  ALLOWED_GITHUB_LOGIN: string;
  GITHUB_REPOSITORY: string;
  GITHUB_BRANCH: string;
  CATALOG_PATH: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  AI_CONFIG_KV: KVNamespace;
  AI_CONFIG_MASTER_KEY: string;
  AI_RUNTIME_SHARED_SECRET: string;
  GLYMIZE_DB?: D1Database;
}

interface OAuthState {
  kind: "oauth_state";
  returnTo: string;
  expiresAt: number;
}

interface AdminSession {
  kind: "admin_session";
  login: string;
  githubToken: string;
  expiresAt: number;
}

type RuntimeAccessPayload = {
  kind: "runtime_access";
  userId: string;
  practiceId: string;
  sessionId: string;
  expiresAt: number;
};

type GitHubAdminPrincipal = AdminSession & {
  source: "github";
  permissions: RuntimePermission[];
};

type RuntimeAdminPrincipal = {
  source: "runtime";
  login: string;
  userId: string;
  permissions: RuntimePermission[];
  expiresAt: number;
};

type AdminPrincipal = GitHubAdminPrincipal | RuntimeAdminPrincipal;

interface CoverageState {
  provider: string;
  percent: number;
  origin?: string;
  genericCode?: string;
  brandCode?: string;
  insurerShareToman?: number;
  patientShareToman?: number;
  referencePriceToman?: number;
}

interface CatalogState {
  visibility: Record<string, boolean>;
  insurance: Record<string, CoverageState[]>;
  brands: Record<string, Array<{
    id: string;
    name: string;
    showInsteadOfGeneric: boolean;
    priority: number;
    customInsurance: boolean;
    insuranceCoverages: CoverageState[];
    genericRegistryCode?: string;
    brandRegistryCode?: string;
    price?: unknown;
    sourceDiscovered?: boolean;
    hiddenFromSource?: boolean;
  }>>;
  customGenerics: unknown[];
  marketData?: Record<string, unknown>;
  notifications?: unknown[];
  updateRuns?: unknown[];
  masterCandidates?: unknown[];
  masterRegistry?: unknown[];
  customPresentations?: unknown[];
}

const githubHeaders = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "GLYMIZE-Admin-Worker"
};

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sessionKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function seal(payload: OAuthState | AdminSession, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await sessionKey(secret);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  ));
  const token = new Uint8Array(iv.length + encrypted.length);
  token.set(iv);
  token.set(encrypted, iv.length);
  return base64UrlEncode(token);
}

async function open<T extends OAuthState | AdminSession>(token: string, secret: string): Promise<T | null> {
  try {
    const encoded = base64UrlDecode(token);
    const iv = encoded.slice(0, 12);
    const encrypted = encoded.slice(12);
    const key = await sessionKey(secret);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    return JSON.parse(new TextDecoder().decode(decrypted)) as T;
  } catch {
    return null;
  }
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin");
  return isRuntimeOriginAllowed(origin, env) ? {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin"
  } : {};
}

function json(request: Request, env: Env, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff"
    }
  });
}

function validatedReturnTo(value: string | null, env: Env) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.origin !== env.ADMIN_ORIGIN || !url.pathname.startsWith(env.ADMIN_PATH_PREFIX)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function anyAdminPermission(permissions: readonly RuntimePermission[]) {
  return ADMIN_PERMISSION_KEYS.some((permission) => permissions.includes(permission));
}

function adminHasPermission(session: AdminPrincipal, permission: AdminPermission) {
  return session.source === "github" || session.permissions.includes(permission);
}

async function runtimeAdminFromToken(
  token: string,
  env: Env,
): Promise<RuntimeAdminPrincipal | null> {
  if (!env.GLYMIZE_DB) return null;
  const [iv, ciphertext, extra] = token.split(".");
  if (!iv || !ciphertext || extra) return null;
  const access = await openPayload<RuntimeAccessPayload>(
    { iv, ciphertext },
    env.SESSION_SECRET,
    "RUNTIME-ACCESS-V1",
  );
  if (
    !access ||
    access.kind !== "runtime_access" ||
    access.expiresAt <= Date.now()
  ) {
    return null;
  }

  const session = await env.GLYMIZE_DB.prepare(
    `SELECT revoked_at, expires_at
     FROM refresh_tokens
     WHERE id=? AND user_id=? AND practice_id=?`,
  )
    .bind(access.sessionId, access.userId, access.practiceId)
    .first<{ revoked_at: string | null; expires_at: string }>();
  if (
    !session ||
    session.revoked_at ||
    Date.parse(session.expires_at) <= Date.now()
  ) {
    return null;
  }

  const row = await env.GLYMIZE_DB.prepare(
    `SELECT u.id, u.status, u.first_name, u.last_name,
            m.status AS membership_status, m.permissions_json
     FROM runtime_users u
     JOIN practice_memberships m ON m.user_id=u.id
     WHERE u.id=? AND m.practice_id=?`,
  )
    .bind(access.userId, access.practiceId)
    .first<{
      id: string;
      status: string;
      first_name: string;
      last_name: string;
      membership_status: string;
      permissions_json: string;
    }>();
  if (
    !row ||
    row.status !== "active" ||
    row.membership_status !== "active"
  ) {
    return null;
  }

  let permissions: RuntimePermission[] = [];
  try {
    permissions = sanitizeRuntimePermissions(
      row.permissions_json ? JSON.parse(row.permissions_json) : [],
    );
  } catch {
    permissions = [];
  }
  if (!anyAdminPermission(permissions)) return null;

  return {
    source: "runtime",
    login: `${row.first_name} ${row.last_name}`.trim() || row.id,
    userId: row.id,
    permissions,
    expiresAt: access.expiresAt,
  };
}

async function requireAdmin(request: Request, env: Env): Promise<AdminPrincipal | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const github = await open<AdminSession>(token, env.SESSION_SECRET);
  if (
    github &&
    github.kind === "admin_session" &&
    github.expiresAt > Date.now() &&
    github.login.toLocaleLowerCase() === env.ALLOWED_GITHUB_LOGIN.toLocaleLowerCase()
  ) {
    return {
      ...github,
      source: "github",
      permissions: [...ADMIN_PERMISSION_KEYS],
    };
  }

  return runtimeAdminFromToken(token, env);
}

function validCoverage(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const coverage = value as Record<string, unknown>;
  const providers = ["social_security", "health_insurance", "armed_forces", "other_organizations", "supplementary"];
  const validOptionalCode = (key: string) => coverage[key] === undefined || (typeof coverage[key] === "string" && (coverage[key] as string).length <= 160);
  const validOptionalMoney = (key: string) => coverage[key] === undefined || (typeof coverage[key] === "number" && Number.isSafeInteger(coverage[key]) && (coverage[key] as number) >= 0);
  const validOptionalRawMoney = (key: string) => coverage[key] === undefined || (typeof coverage[key] === "number" && Number.isFinite(coverage[key]) && (coverage[key] as number) >= 0);
  return typeof coverage.provider === "string" && providers.includes(coverage.provider) &&
    typeof coverage.percent === "number" &&
    Number.isFinite(coverage.percent) &&
    coverage.percent >= 0 &&
    coverage.percent <= 100 &&
    (coverage.origin === undefined || coverage.origin === "source" || coverage.origin === "manual") &&
    validOptionalCode("genericCode") &&
    validOptionalCode("brandCode") &&
    validOptionalMoney("insurerShareToman") &&
    validOptionalMoney("patientShareToman") &&
    validOptionalMoney("referencePriceToman") &&
    (coverage.sourceCurrency === undefined || coverage.sourceCurrency === "IRR" || coverage.sourceCurrency === "TOMAN") &&
    validOptionalRawMoney("sourceInsurerShare") &&
    validOptionalRawMoney("sourcePatientShare") &&
    validOptionalRawMoney("sourceReferencePrice");
}

function validPrice(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const price = value as Record<string, unknown>;
  const validMoney = (amount: unknown) => typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0;
  return validMoney(price.amountToman) &&
    ["consumer_retail", "insurance_reference", "unknown"].includes(String(price.priceKind)) &&
    (price.manualOverrideToman === undefined || validMoney(price.manualOverrideToman)) &&
    (price.sourceCurrency === undefined || price.sourceCurrency === "IRR" || price.sourceCurrency === "TOMAN") &&
    (price.sourceUrl === undefined || (typeof price.sourceUrl === "string" && price.sourceUrl.length <= 2000));
}

function validMarketData(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const market = value as Record<string, unknown>;
  const domains = [
    "diabetes",
    "cardiovascular",
    "kidney",
    "liver",
    "obesity",
    "hypertension",
    "lipids",
    "heart_failure",
    "ascvd",
    "masld_mash",
    "neuropathy",
    "retinopathy",
    "diabetic_foot",
    "nutrition_support",
    "pregnancy"
  ];
  return (market.displayMode === undefined || ["generic_or_primary_brand", "generic_with_selected_brands"].includes(String(market.displayMode))) &&
    (market.clinicalDomains === undefined || (Array.isArray(market.clinicalDomains) && market.clinicalDomains.every((domain) => domains.includes(String(domain))))) &&
    (market.genericRegistryCode === undefined || (typeof market.genericRegistryCode === "string" && market.genericRegistryCode.length <= 160)) &&
    (market.price === undefined || validPrice(market.price));
}

function validNotification(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const notification = value as Record<string, unknown>;
  return typeof notification.id === "string" && notification.id.length <= 100 &&
    ["info", "warning", "error"].includes(String(notification.severity)) &&
    ["unread", "read", "resolved"].includes(String(notification.status)) &&
    typeof notification.title === "string" && notification.title.length <= 240 &&
    typeof notification.message === "string" && notification.message.length <= 2000 &&
    typeof notification.createdAt === "string";
}

function validUpdateRun(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const run = value as Record<string, unknown>;
  return typeof run.id === "string" && run.schemaVersion === 1 &&
    ["staging", "needs_review", "ready_to_publish", "published", "failed"].includes(String(run.status)) &&
    typeof run.startedAt === "string" && Array.isArray(run.sources) && run.sources.length <= 4 &&
    typeof run.summary === "object" && run.summary !== null;
}

function validCatalog(value: unknown): value is CatalogState {
  if (!value || typeof value !== "object") return false;
  const catalog = value as Partial<CatalogState>;
  if (!catalog.visibility || !catalog.insurance || !catalog.brands || !Array.isArray(catalog.customGenerics)) return false;
  if (catalog.marketData !== undefined && (!catalog.marketData || typeof catalog.marketData !== "object" || Array.isArray(catalog.marketData) || Object.values(catalog.marketData).some((item) => !validMarketData(item)))) return false;
  if (catalog.notifications !== undefined && (!Array.isArray(catalog.notifications) || catalog.notifications.length > 200 || catalog.notifications.some((item) => !validNotification(item)))) return false;
  if (catalog.updateRuns !== undefined && (!Array.isArray(catalog.updateRuns) || catalog.updateRuns.length > 24 || catalog.updateRuns.some((item) => !validUpdateRun(item)))) return false;
  if (catalog.masterCandidates !== undefined && !Array.isArray(catalog.masterCandidates)) return false;
  if (catalog.masterRegistry !== undefined && !Array.isArray(catalog.masterRegistry)) return false;
  if (catalog.customPresentations !== undefined && !Array.isArray(catalog.customPresentations)) return false;
  if (Object.values(catalog.visibility).some((visible) => typeof visible !== "boolean")) return false;
  if (Object.values(catalog.insurance).some((coverages) => !Array.isArray(coverages) || coverages.some((coverage) => !validCoverage(coverage)))) return false;
  return !Object.values(catalog.brands).some((brands) => !Array.isArray(brands) || brands.some((brand) =>
    !brand ||
    typeof brand.id !== "string" ||
    typeof brand.name !== "string" ||
    brand.name.length > 160 ||
    typeof brand.showInsteadOfGeneric !== "boolean" ||
    typeof brand.priority !== "number" ||
    !Number.isSafeInteger(brand.priority) || brand.priority < 1 ||
    typeof brand.customInsurance !== "boolean" ||
    (brand.genericRegistryCode !== undefined && (typeof brand.genericRegistryCode !== "string" || brand.genericRegistryCode.length > 160)) ||
    (brand.brandRegistryCode !== undefined && (typeof brand.brandRegistryCode !== "string" || brand.brandRegistryCode.length > 160)) ||
    (brand.price !== undefined && !validPrice(brand.price)) ||
    (brand.sourceDiscovered !== undefined && typeof brand.sourceDiscovered !== "boolean") ||
    (brand.hiddenFromSource !== undefined && typeof brand.hiddenFromSource !== "boolean") ||
    !Array.isArray(brand.insuranceCoverages) ||
    brand.insuranceCoverages.some((coverage) => !validCoverage(coverage))
  ));
}

function utf8Base64(value: string) {
  const encoded = base64UrlEncode(new TextEncoder().encode(value))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
}

type AiProvider = "workers_ai" | "openai_compatible";
type AiRole = "primary" | "fallback" | "compare";
type AiReasoningEffort = "none" | "low" | "medium" | "high";

interface AiModelConfig {
  id: string;
  name: string;
  provider: AiProvider;
  enabled: boolean;
  role: AiRole;
  priority: number;
  accountId?: string;
  gatewayId?: string;
  baseUrl?: string;
  modelId: string;
  reasoningEffort: AiReasoningEffort;
  maxCompletionTokens: number;
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
}

interface AiModelPublic extends AiModelConfig {
  tokenConfigured: boolean;
}

const AI_MODELS_KEY = "ai:models:v1";
const AI_SECRET_PREFIX = "ai:secret:v1:";

function validPublicHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLocaleLowerCase();
    if (
      host === "localhost" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === "0.0.0.0"
    ) return false;
    return true;
  } catch {
    return false;
  }
}

function validAiModel(config: AiModelConfig) {
  if (!/^[a-z0-9][a-z0-9_-]{2,79}$/i.test(config.id)) return false;
  if (!config.name || config.name.length > 120) return false;
  if (!["workers_ai", "openai_compatible"].includes(config.provider)) return false;
  if (!["primary", "fallback", "compare"].includes(config.role)) return false;
  if (!["none", "low", "medium", "high"].includes(config.reasoningEffort)) return false;
  if (!Number.isSafeInteger(config.priority) || config.priority < 1 || config.priority > 99) return false;
  if (!Number.isSafeInteger(config.maxCompletionTokens) || config.maxCompletionTokens < 64 || config.maxCompletionTokens > 8192) return false;
  if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 5_000 || config.timeoutMs > 120_000) return false;
  if (!config.modelId || config.modelId.length > 240) return false;
  if (config.provider === "workers_ai") {
    if (!config.accountId || !/^[a-f0-9]{32}$/i.test(config.accountId)) return false;
    if (config.gatewayId && !/^[a-z0-9][a-z0-9_-]{1,79}$/i.test(config.gatewayId)) return false;
  }
  if (config.provider === "openai_compatible") {
    if (!config.baseUrl || !validPublicHttpsUrl(config.baseUrl)) return false;
  }
  return true;
}

async function aiEncryptionKey(secret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`GLYMIZE-AI-CONFIG:${secret}`)
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptAiToken(token: string, masterSecret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aiEncryptionKey(masterSecret);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token)
  ));
  const packed = new Uint8Array(iv.length + ciphertext.length);
  packed.set(iv);
  packed.set(ciphertext, iv.length);
  return base64UrlEncode(packed);
}

async function decryptAiToken(value: string, masterSecret: string) {
  try {
    const packed = base64UrlDecode(value);
    if (packed.length < 29) return null;
    const iv = packed.slice(0, 12);
    const ciphertext = packed.slice(12);
    const key = await aiEncryptionKey(masterSecret);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

async function readAiModels(env: Env): Promise<AiModelConfig[]> {
  const raw = await env.AI_CONFIG_KV.get(AI_MODELS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AiModelConfig => Boolean(item) && typeof item === "object" && validAiModel(item as AiModelConfig));
  } catch {
    return [];
  }
}

async function writeAiModels(env: Env, models: AiModelConfig[]) {
  await env.AI_CONFIG_KV.put(AI_MODELS_KEY, JSON.stringify(models));
}

async function publicAiModel(env: Env, model: AiModelConfig): Promise<AiModelPublic> {
  const tokenConfigured = Boolean(await env.AI_CONFIG_KV.get(`${AI_SECRET_PREFIX}${model.id}`));
  return { ...model, tokenConfigured };
}

async function listAiModels(env: Env) {
  const models = await readAiModels(env);
  return Promise.all(models.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name)).map((model) => publicAiModel(env, model)));
}

function aiModelFromInput(value: unknown, existing?: AiModelConfig): { model: AiModelConfig; token?: string } | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const now = new Date().toISOString();
  const id = existing?.id ?? (typeof body.id === "string" && /^[a-z0-9][a-z0-9_-]{2,79}$/i.test(body.id)
    ? body.id
    : `ai-${crypto.randomUUID()}`);
  const provider = String(body.provider ?? existing?.provider ?? "workers_ai") as AiProvider;
  const model: AiModelConfig = {
    id,
    name: String(body.name ?? existing?.name ?? "AI model").trim(),
    provider,
    enabled: body.enabled === undefined ? existing?.enabled ?? true : Boolean(body.enabled),
    role: String(body.role ?? existing?.role ?? "fallback") as AiRole,
    priority: Number(body.priority ?? existing?.priority ?? 1),
    accountId: String(body.accountId ?? existing?.accountId ?? "").trim() || undefined,
    gatewayId: String(body.gatewayId ?? existing?.gatewayId ?? "").trim() || undefined,
    baseUrl: String(body.baseUrl ?? existing?.baseUrl ?? "").trim().replace(/\/$/, "") || undefined,
    modelId: String(body.modelId ?? existing?.modelId ?? "").trim(),
    reasoningEffort: String(body.reasoningEffort ?? existing?.reasoningEffort ?? "low") as AiReasoningEffort,
    maxCompletionTokens: Number(body.maxCompletionTokens ?? existing?.maxCompletionTokens ?? 1000),
    timeoutMs: Number(body.timeoutMs ?? existing?.timeoutMs ?? 45_000),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  if (!validAiModel(model)) return null;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (token.length > 4096) return null;
  return { model, ...(token ? { token } : {}) };
}

async function saveAiModel(request: Request, env: Env, modelId?: string) {
  const raw = await request.text();
  if (raw.length > 20_000) return json(request, env, { error: "ai_config_too_large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }
  const models = await readAiModels(env);
  const existing = modelId ? models.find((item) => item.id === modelId) : undefined;
  if (modelId && !existing) return json(request, env, { error: "ai_model_not_found" }, 404);
  if (!modelId && models.length >= 12) return json(request, env, { error: "ai_model_limit_reached" }, 409);
  const parsed = aiModelFromInput(body, existing);
  if (!parsed) return json(request, env, { error: "invalid_ai_model" }, 422);

  const nextModels = existing
    ? models.map((item) => item.id === existing.id ? parsed.model : item)
    : [...models, parsed.model];

  await writeAiModels(env, nextModels);
  if (parsed.token) {
    const encrypted = await encryptAiToken(parsed.token, env.AI_CONFIG_MASTER_KEY);
    await env.AI_CONFIG_KV.put(`${AI_SECRET_PREFIX}${parsed.model.id}`, encrypted);
  }
  return json(request, env, await publicAiModel(env, parsed.model), existing ? 200 : 201);
}

async function deleteAiModel(request: Request, env: Env, modelId: string) {
  const models = await readAiModels(env);
  if (!models.some((item) => item.id === modelId)) return json(request, env, { error: "ai_model_not_found" }, 404);
  await writeAiModels(env, models.filter((item) => item.id !== modelId));
  await env.AI_CONFIG_KV.delete(`${AI_SECRET_PREFIX}${modelId}`);
  return json(request, env, { deleted: true });
}

async function loadAiToken(env: Env, modelId: string) {
  const encrypted = await env.AI_CONFIG_KV.get(`${AI_SECRET_PREFIX}${modelId}`);
  if (!encrypted) return null;
  return decryptAiToken(encrypted, env.AI_CONFIG_MASTER_KEY);
}

interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function validAiMessages(value: unknown): value is AiChatMessage[] {
  return Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 24 &&
    value.every((message) =>
      message &&
      typeof message === "object" &&
      ["system", "user", "assistant"].includes(String((message as Record<string, unknown>).role)) &&
      typeof (message as Record<string, unknown>).content === "string" &&
      String((message as Record<string, unknown>).content).length <= 40_000
    );
}

async function invokeAiModel(
  config: AiModelConfig,
  token: string,
  messages: AiChatMessage[],
  overrides?: { temperature?: number; maxCompletionTokens?: number }
) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const endpoint = config.provider === "workers_ai"
      ? `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/v1/chat/completions`
      : `${config.baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    };
    if (config.provider === "workers_ai") {
      if (config.gatewayId) headers["cf-aig-gateway-id"] = config.gatewayId;
      headers["cf-aig-collect-log-payload"] = "false";
    }
    const requestedMax = overrides?.maxCompletionTokens;
    const maxCompletionTokens = requestedMax
      ? Math.max(64, Math.min(requestedMax, config.maxCompletionTokens))
      : config.maxCompletionTokens;
    const body: Record<string, unknown> = {
      model: config.modelId,
      messages,
      temperature: typeof overrides?.temperature === "number" ? Math.max(0, Math.min(overrides.temperature, 1)) : 0.1,
      max_completion_tokens: maxCompletionTokens
    };
    if (config.reasoningEffort !== "none") body.reasoning_effort = config.reasoningEffort;

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null) as {
      choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
      usage?: Record<string, unknown>;
      error?: unknown;
    } | null;
    const content = payload?.choices?.[0]?.message?.content?.trim() ?? "";
    return {
      ok: response.ok && Boolean(content),
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      content,
      finishReason: payload?.choices?.[0]?.finish_reason ?? null,
      usage: payload?.usage ?? null
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 0,
      latencyMs: Date.now() - startedAt,
      content: "",
      finishReason: null,
      usage: null,
      error: error instanceof Error ? error.name : "ai_request_failed"
    };
  } finally {
    clearTimeout(timer);
  }
}

async function testAiModel(request: Request, env: Env, modelId: string) {
  const models = await readAiModels(env);
  const model = models.find((item) => item.id === modelId);
  if (!model) return json(request, env, { error: "ai_model_not_found" }, 404);
  const token = await loadAiToken(env, model.id);
  if (!token) return json(request, env, { error: "ai_token_not_configured" }, 409);
  const result = await invokeAiModel(model, token, [
    { role: "system", content: "This is a connectivity health check. Return only OK." },
    { role: "user", content: "OK" }
  ], { temperature: 0, maxCompletionTokens: Math.min(model.maxCompletionTokens, 1200) });
  return json(request, env, {
    healthy: result.ok,
    modelId: model.id,
    provider: model.provider,
    configuredModel: model.modelId,
    httpStatus: result.httpStatus,
    latencyMs: result.latencyMs,
    usage: result.usage
  }, result.ok ? 200 : 502);
}

async function secureSecretEqual(left: string, right: string) {
  if (!left || !right) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(left)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(right))
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let index = 0; index < av.length; index += 1) diff |= av[index]! ^ bv[index]!;
  return diff === 0;
}

async function runtimeAiChat(request: Request, env: Env) {
  const suppliedSecret = bearerToken(request);
  if (!(await secureSecretEqual(suppliedSecret, env.AI_RUNTIME_SHARED_SECRET))) {
    return json(request, env, { error: "ai_runtime_auth_required" }, 401);
  }
  const raw = await request.text();
  if (raw.length > 150_000) return json(request, env, { error: "ai_request_too_large" }, 413);
  let body: { messages?: unknown; temperature?: unknown; max_completion_tokens?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }
  if (!validAiMessages(body.messages)) return json(request, env, { error: "invalid_ai_messages" }, 422);
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.1;
  const maxCompletionTokens = typeof body.max_completion_tokens === "number"
    ? Math.floor(body.max_completion_tokens)
    : undefined;

  const models = (await readAiModels(env))
    .filter((model) => model.enabled && model.role !== "compare")
    .sort((a, b) => {
      const roleRank = (value: AiRole) => value === "primary" ? 0 : value === "fallback" ? 1 : 2;
      return roleRank(a.role) - roleRank(b.role) || a.priority - b.priority;
    });

  for (const model of models) {
    const token = await loadAiToken(env, model.id);
    if (!token) continue;
    const result = await invokeAiModel(model, token, body.messages, { temperature, maxCompletionTokens });
    if (!result.ok) continue;
    return json(request, env, {
      id: `glymize-ai-${crypto.randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model.modelId,
      provider: model.provider,
      selectedModelId: model.id,
      choices: [{
        index: 0,
        message: { role: "assistant", content: result.content },
        finish_reason: result.finishReason ?? "stop"
      }],
      usage: result.usage
    });
  }
  return json(request, env, { error: "all_ai_backends_failed" }, 502);
}


type CommunicationsSmsConfig = {
  provider: "sms_ir";
  enabled: boolean;
  registrationOtp: boolean;
  loginOtp: boolean;
  passwordReset: boolean;
  assistantInvitation: boolean;
  lineNumber: string;
  otpTemplateId?: number;
  otpParameterName: string;
};

type CommunicationsEmailConfig = {
  provider: "resend";
  enabled: boolean;
  registrationVerification: boolean;
  passwordReset: boolean;
  assistantInvitation: boolean;
  fromAddress: string;
};

type CommunicationsConfig = {
  version: 1;
  sms: CommunicationsSmsConfig;
  email: CommunicationsEmailConfig;
  updatedAt: string;
};

const COMMUNICATIONS_CONFIG_KEY = "communications:config:v1";
const COMMUNICATIONS_SMS_SECRET_KEY = "communications:secret:v1:sms_ir";
const COMMUNICATIONS_EMAIL_SECRET_KEY = "communications:secret:v1:resend";

function defaultCommunicationsConfig(): CommunicationsConfig {
  return {
    version: 1,
    sms: {
      provider: "sms_ir",
      enabled: false,
      registrationOtp: false,
      loginOtp: false,
      passwordReset: false,
      assistantInvitation: false,
      lineNumber: "",
      otpTemplateId: undefined,
      otpParameterName: "Code"
    },
    email: {
      provider: "resend",
      enabled: false,
      registrationVerification: false,
      passwordReset: false,
      assistantInvitation: false,
      fromAddress: "GLYMIZE <info@glymize.ir>"
    },
    updatedAt: new Date(0).toISOString()
  };
}

async function communicationsEncryptionKey(masterSecret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`GLYMIZE-COMMUNICATIONS-CONFIG:${masterSecret}`)
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptCommunicationsSecret(value: string, masterSecret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await communicationsEncryptionKey(masterSecret);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value)
  ));
  const packed = new Uint8Array(iv.length + ciphertext.length);
  packed.set(iv);
  packed.set(ciphertext, iv.length);
  return base64UrlEncode(packed);
}

async function decryptCommunicationsSecret(value: string, masterSecret: string) {
  try {
    const packed = base64UrlDecode(value);
    if (packed.length < 29) return null;
    const iv = packed.slice(0, 12);
    const ciphertext = packed.slice(12);
    const key = await communicationsEncryptionKey(masterSecret);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

async function readCommunicationsConfig(env: Env): Promise<CommunicationsConfig> {
  const raw = await env.AI_CONFIG_KV.get(COMMUNICATIONS_CONFIG_KEY);
  if (!raw) return defaultCommunicationsConfig();
  try {
    const value = JSON.parse(raw) as Partial<CommunicationsConfig>;
    if (value.version !== 1 || !value.sms || !value.email) return defaultCommunicationsConfig();
    return {
      version: 1,
      sms: {
        ...defaultCommunicationsConfig().sms,
        ...value.sms,
        provider: "sms_ir"
      },
      email: {
        ...defaultCommunicationsConfig().email,
        ...value.email,
        provider: "resend"
      },
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString()
    };
  } catch {
    return defaultCommunicationsConfig();
  }
}

async function writeCommunicationsConfig(env: Env, config: CommunicationsConfig) {
  await env.AI_CONFIG_KV.put(COMMUNICATIONS_CONFIG_KEY, JSON.stringify(config));
}

async function loadCommunicationsSecret(env: Env, key: string) {
  const encrypted = await env.AI_CONFIG_KV.get(key);
  if (!encrypted) return null;
  return decryptCommunicationsSecret(encrypted, env.AI_CONFIG_MASTER_KEY);
}

async function publicCommunicationsConfig(env: Env, config?: CommunicationsConfig) {
  const current = config ?? await readCommunicationsConfig(env);
  const [smsApiKeyConfigured, emailApiKeyConfigured] = await Promise.all([
    env.AI_CONFIG_KV.get(COMMUNICATIONS_SMS_SECRET_KEY).then(Boolean),
    env.AI_CONFIG_KV.get(COMMUNICATIONS_EMAIL_SECRET_KEY).then(Boolean)
  ]);
  const smsRequired = current.sms.enabled && current.sms.registrationOtp;
  const emailRequired = current.email.enabled && current.email.registrationVerification;
  return {
    ...current,
    physicianIdentity: {
      provider: "irimc",
      required: true,
      matchMode: "exact",
      priority: 1,
      bypassAllowedOnMismatch: false
    },
    sms: { ...current.sms, apiKeyConfigured: smsApiKeyConfigured },
    email: { ...current.email, apiKeyConfigured: emailApiKeyConfigured },
    effectiveRegistration: {
      medicalCouncilRequired: true,
      smsRequired,
      emailRequired,
      contactVerificationRequired: smsRequired || emailRequired
    }
  };
}

function validOptionalBoolean(value: unknown) {
  return value === undefined || typeof value === "boolean";
}

function validFromAddress(value: string) {
  return value.length >= 5 && value.length <= 180 && value.includes("@") && !/[\r\n]/.test(value);
}

async function updateCommunicationsConfig(request: Request, env: Env) {
  const raw = await request.text();
  if (raw.length > 20_000) return json(request, env, { error: "communications_config_too_large" }, 413);
  let body: { sms?: Record<string, unknown>; email?: Record<string, unknown> };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }

  const current = await readCommunicationsConfig(env);
  const next: CommunicationsConfig = structuredClone(current);
  const sms = body.sms;
  if (sms) {
    for (const key of ["enabled", "registrationOtp", "loginOtp", "passwordReset", "assistantInvitation"] as const) {
      if (!validOptionalBoolean(sms[key])) return json(request, env, { error: `invalid_sms_${key}` }, 422);
      if (typeof sms[key] === "boolean") next.sms[key] = sms[key] as boolean;
    }
    if (sms.lineNumber !== undefined) {
      const lineNumber = String(sms.lineNumber).trim();
      if (lineNumber && !/^\d{5,20}$/.test(lineNumber)) return json(request, env, { error: "invalid_sms_line_number" }, 422);
      next.sms.lineNumber = lineNumber;
    }
    if (sms.otpTemplateId !== undefined) {
      const templateId = sms.otpTemplateId === null || sms.otpTemplateId === "" ? undefined : Number(sms.otpTemplateId);
      if (templateId !== undefined && (!Number.isSafeInteger(templateId) || templateId < 1 || templateId > 2_147_483_647)) {
        return json(request, env, { error: "invalid_sms_otp_template_id" }, 422);
      }
      next.sms.otpTemplateId = templateId;
    }
    if (sms.otpParameterName !== undefined) {
      const name = String(sms.otpParameterName).trim();
      if (!/^[A-Za-z0-9_]{1,50}$/.test(name)) return json(request, env, { error: "invalid_sms_otp_parameter_name" }, 422);
      next.sms.otpParameterName = name;
    }
  }

  const email = body.email;
  if (email) {
    for (const key of ["enabled", "registrationVerification", "passwordReset", "assistantInvitation"] as const) {
      if (!validOptionalBoolean(email[key])) return json(request, env, { error: `invalid_email_${key}` }, 422);
      if (typeof email[key] === "boolean") next.email[key] = email[key] as boolean;
    }
    if (email.fromAddress !== undefined) {
      const fromAddress = String(email.fromAddress).trim();
      if (!validFromAddress(fromAddress)) return json(request, env, { error: "invalid_email_from_address" }, 422);
      next.email.fromAddress = fromAddress;
    }
  }

  next.updatedAt = new Date().toISOString();
  await writeCommunicationsConfig(env, next);
  return json(request, env, await publicCommunicationsConfig(env, next));
}

async function saveCommunicationsSecret(request: Request, env: Env, kind: "sms" | "email") {
  const raw = await request.text();
  if (raw.length > 10_000) return json(request, env, { error: "secret_payload_too_large" }, 413);
  let body: { apiKey?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (apiKey.length < 12 || apiKey.length > 4096 || /[\r\n]/.test(apiKey)) {
    return json(request, env, { error: "invalid_api_key" }, 422);
  }
  const encrypted = await encryptCommunicationsSecret(apiKey, env.AI_CONFIG_MASTER_KEY);
  const key = kind === "sms" ? COMMUNICATIONS_SMS_SECRET_KEY : COMMUNICATIONS_EMAIL_SECRET_KEY;
  await env.AI_CONFIG_KV.put(key, encrypted);
  return json(request, env, { configured: true, provider: kind === "sms" ? "sms_ir" : "resend" });
}

async function deleteCommunicationsSecret(request: Request, env: Env, kind: "sms" | "email") {
  const key = kind === "sms" ? COMMUNICATIONS_SMS_SECRET_KEY : COMMUNICATIONS_EMAIL_SECRET_KEY;
  await env.AI_CONFIG_KV.delete(key);
  return json(request, env, { configured: false, provider: kind === "sms" ? "sms_ir" : "resend" });
}

async function testSmsConnection(request: Request, env: Env) {
  const apiKey = await loadCommunicationsSecret(env, COMMUNICATIONS_SMS_SECRET_KEY);
  if (!apiKey) return json(request, env, { error: "sms_api_key_not_configured" }, 409);
  const startedAt = Date.now();
  try {
    const response = await fetch("https://api.sms.ir/v1/credit", {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        Accept: "application/json"
      }
    });
    const payload = await response.json().catch(() => null) as { data?: unknown; message?: unknown } | null;
    return json(request, env, {
      healthy: response.ok,
      provider: "sms_ir",
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      credit: response.ok ? payload?.data ?? null : null,
      message: response.ok ? "SMS.ir API reachable." : String(payload?.message ?? "SMS.ir API rejected the request.")
    }, response.ok ? 200 : 502);
  } catch {
    return json(request, env, {
      healthy: false,
      provider: "sms_ir",
      httpStatus: 0,
      latencyMs: Date.now() - startedAt,
      error: "sms_connection_failed"
    }, 502);
  }
}

function normalizeIranMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^989\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^00989\d{9}$/.test(digits)) return `0${digits.slice(4)}`;
  return null;
}

function randomSixDigitCode() {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + (bytes[0]! % 900000));
}

async function sendTestSms(request: Request, env: Env) {
  const apiKey = await loadCommunicationsSecret(env, COMMUNICATIONS_SMS_SECRET_KEY);
  if (!apiKey) return json(request, env, { error: "sms_api_key_not_configured" }, 409);
  const config = await readCommunicationsConfig(env);
  if (!config.sms.otpTemplateId) return json(request, env, { error: "sms_otp_template_not_configured" }, 409);

  let body: { mobile?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }
  const mobile = normalizeIranMobile(String(body.mobile ?? ""));
  if (!mobile) return json(request, env, { error: "invalid_iran_mobile" }, 422);

  const response = await fetch("https://api.sms.ir/v1/send/verify/", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      mobile,
      templateId: config.sms.otpTemplateId,
      parameters: [{
        name: config.sms.otpParameterName,
        value: randomSixDigitCode()
      }]
    })
  });
  const payload = await response.json().catch(() => null) as { data?: unknown; message?: unknown } | null;
  if (!response.ok) {
    return json(request, env, { error: "sms_test_send_failed", httpStatus: response.status, message: payload?.message ?? null }, 502);
  }
  return json(request, env, { sent: true, provider: "sms_ir", mobile, result: payload?.data ?? null });
}

function validEmailRecipient(value: string) {
  return value.length <= 180 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function sendTestEmail(request: Request, env: Env) {
  const apiKey = await loadCommunicationsSecret(env, COMMUNICATIONS_EMAIL_SECRET_KEY);
  if (!apiKey) return json(request, env, { error: "email_api_key_not_configured" }, 409);
  const config = await readCommunicationsConfig(env);

  let body: { to?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }
  const to = String(body.to ?? "").trim();
  if (!validEmailRecipient(to)) return json(request, env, { error: "invalid_email_recipient" }, 422);

  const idempotencyKey = `glymize-admin-test-${crypto.randomUUID()}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "GLYMIZE-Admin-Worker/1.0",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify({
      from: config.email.fromAddress,
      to: [to],
      subject: "GLYMIZE · Email API test",
      text: `GLYMIZE email provider test succeeded at ${new Date().toISOString()}.`
    })
  });
  const payload = await response.json().catch(() => null) as { id?: string; message?: string; name?: string } | null;
  if (!response.ok || !payload?.id) {
    return json(request, env, {
      error: "email_test_send_failed",
      httpStatus: response.status,
      message: payload?.message ?? payload?.name ?? null
    }, 502);
  }
  return json(request, env, { sent: true, provider: "resend", to, id: payload.id });
}

async function startAuthentication(request: Request, env: Env) {
  const url = new URL(request.url);
  const returnTo = validatedReturnTo(url.searchParams.get("return_to"), env);
  if (!returnTo) return json(request, env, { error: "invalid_return_url" }, 400);
  const redirectUri = `${url.origin}/auth/callback`;
  const state = await seal({
    kind: "oauth_state",
    returnTo,
    expiresAt: Date.now() + 10 * 60 * 1000
  }, env.SESSION_SECRET);
  const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
  authorizationUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("scope", "read:user public_repo");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("login", env.ALLOWED_GITHUB_LOGIN);
  return Response.redirect(authorizationUrl.toString(), 302);
}

async function completeAuthentication(request: Request, env: Env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  if (!code || !stateToken) return json(request, env, { error: "oauth_callback_incomplete" }, 400);
  const state = await open<OAuthState>(stateToken, env.SESSION_SECRET);
  if (!state || state.kind !== "oauth_state" || state.expiresAt <= Date.now()) {
    return json(request, env, { error: "oauth_state_invalid" }, 400);
  }
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/auth/callback`
    })
  });
  const tokenResult = await tokenResponse.json() as { access_token?: string; error?: string };
  if (!tokenResponse.ok || !tokenResult.access_token) {
    return json(request, env, { error: tokenResult.error ?? "oauth_exchange_failed" }, 502);
  }
  const userResponse = await fetch("https://api.github.com/user", {
    headers: { ...githubHeaders, authorization: `Bearer ${tokenResult.access_token}` }
  });
  const user = await userResponse.json() as { login?: string };
  if (!userResponse.ok || !user.login || user.login.toLocaleLowerCase() !== env.ALLOWED_GITHUB_LOGIN.toLocaleLowerCase()) {
    return json(request, env, { error: "github_account_not_allowed" }, 403);
  }
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const session = await seal({
    kind: "admin_session",
    login: user.login,
    githubToken: tokenResult.access_token,
    expiresAt
  }, env.SESSION_SECRET);
  const returnUrl = new URL(state.returnTo);
  returnUrl.hash = new URLSearchParams({ auth_session: session }).toString();
  return Response.redirect(returnUrl.toString(), 302);
}

async function publishCatalog(request: Request, env: Env, session: GitHubAdminPrincipal) {
  const raw = await request.text();
  if (raw.length > 1_500_000) return json(request, env, { error: "catalog_too_large" }, 413);
  let payload: { catalog?: unknown };
  try {
    payload = JSON.parse(raw) as { catalog?: unknown };
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }
  if (!validCatalog(payload.catalog)) return json(request, env, { error: "invalid_catalog" }, 400);

  const publishedCatalog = {
    ...payload.catalog,
    updateRuns: (payload.catalog.updateRuns ?? []).map((run) => {
      if (!run || typeof run !== "object") return run;
      const typed = run as Record<string, unknown>;
      return typed.status === "ready_to_publish" ? { ...typed, status: "published" } : run;
    }),
    schemaVersion: 2,
    revision: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    updatedBy: session.login
  };
  const contentsUrl = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/contents/${env.CATALOG_PATH}`;
  const currentResponse = await fetch(`${contentsUrl}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`, {
    headers: { ...githubHeaders, authorization: `Bearer ${session.githubToken}` }
  });
  const current = currentResponse.ok ? await currentResponse.json() as { sha?: string } : null;
  if (!currentResponse.ok && currentResponse.status !== 404) {
    return json(request, env, { error: "github_catalog_read_failed" }, 502);
  }
  const updateResponse = await fetch(contentsUrl, {
    method: "PUT",
    headers: {
      ...githubHeaders,
      authorization: `Bearer ${session.githubToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      message: "Publish GLYMIZE admin catalog",
      content: utf8Base64(`${JSON.stringify(publishedCatalog, null, 2)}\n`),
      branch: env.GITHUB_BRANCH,
      ...(current?.sha ? { sha: current.sha } : {})
    })
  });
  const update = await updateResponse.json() as {
    message?: string;
    commit?: { sha?: string; html_url?: string };
  };
  if (!updateResponse.ok || !update.commit?.sha) {
    return json(request, env, { error: update.message ?? "github_catalog_update_failed" }, updateResponse.status === 409 ? 409 : 502);
  }
  return json(request, env, {
    commitSha: update.commit.sha,
    commitUrl: update.commit.html_url ?? "",
    message: "Catalog committed; GitHub Pages deployment started."
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      if (!isRuntimeOriginAllowed(request.headers.get("origin"), env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (request.method === "GET" && url.pathname === "/auth/start") return startAuthentication(request, env);
    if (request.method === "GET" && url.pathname === "/auth/callback") return completeAuthentication(request, env);
    if (request.method === "POST" && url.pathname === "/ai/runtime/chat/completions") {
      return runtimeAiChat(request, env);
    }

    const session = await requireAdmin(request, env);
    if (!session) return json(request, env, { error: "admin_auth_required" }, 401);
    if (request.method === "GET" && url.pathname === "/session") {
      return json(request, env, {
        login: session.login,
        expiresAt: new Date(session.expiresAt).toISOString(),
        source: session.source,
        userId: session.source === "runtime" ? session.userId : undefined,
        permissions: session.permissions,
      });
    }

    if (
      url.pathname.startsWith("/communications/") &&
      !adminHasPermission(session, "admin.communications")
    ) {
      return json(request, env, { error: "admin_permission_denied" }, 403);
    }
    if (
      (url.pathname === "/ai/models" || url.pathname.startsWith("/ai/models/")) &&
      !adminHasPermission(session, "admin.ai_models")
    ) {
      return json(request, env, { error: "admin_permission_denied" }, 403);
    }

    if (request.method === "GET" && url.pathname === "/communications/config") {
      return json(request, env, await publicCommunicationsConfig(env));
    }
    if (request.method === "PATCH" && url.pathname === "/communications/config") {
      return updateCommunicationsConfig(request, env);
    }
    if (request.method === "POST" && url.pathname === "/communications/sms/secret") {
      return saveCommunicationsSecret(request, env, "sms");
    }
    if (request.method === "DELETE" && url.pathname === "/communications/sms/secret") {
      return deleteCommunicationsSecret(request, env, "sms");
    }
    if (request.method === "POST" && url.pathname === "/communications/sms/test") {
      return testSmsConnection(request, env);
    }
    if (request.method === "POST" && url.pathname === "/communications/sms/send-test") {
      return sendTestSms(request, env);
    }
    if (request.method === "POST" && url.pathname === "/communications/email/secret") {
      return saveCommunicationsSecret(request, env, "email");
    }
    if (request.method === "DELETE" && url.pathname === "/communications/email/secret") {
      return deleteCommunicationsSecret(request, env, "email");
    }
    if (request.method === "POST" && url.pathname === "/communications/email/send-test") {
      return sendTestEmail(request, env);
    }
    if (request.method === "POST" && url.pathname === "/catalog/publish") {
      if (session.source !== "github") {
        return json(request, env, { error: "github_superadmin_required" }, 403);
      }
      return publishCatalog(request, env, session);
    }
    if (request.method === "GET" && url.pathname === "/ai/models") {
      return json(request, env, await listAiModels(env));
    }
    if (request.method === "POST" && url.pathname === "/ai/models") {
      return saveAiModel(request, env);
    }
    const aiTestMatch = url.pathname.match(/^\/ai\/models\/([^/]+)\/test$/);
    if (request.method === "POST" && aiTestMatch) {
      return testAiModel(request, env, decodeURIComponent(aiTestMatch[1]!));
    }
    const aiModelMatch = url.pathname.match(/^\/ai\/models\/([^/]+)$/);
    if (aiModelMatch) {
      const modelId = decodeURIComponent(aiModelMatch[1]!);
      if (request.method === "PATCH") return saveAiModel(request, env, modelId);
      if (request.method === "DELETE") return deleteAiModel(request, env, modelId);
    }
    return json(request, env, { error: "not_found" }, 404);
  }
} satisfies ExportedHandler<Env>;
