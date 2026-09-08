import type {
  AdminAiModel,
  AdminAiProvider,
  AdminAiReasoningEffort,
  AdminAiRole,
} from "./admin-auth";

export const AI_ADMIN_PREVIEW_SCHEMA_VERSION = 1 as const;

export interface StoredAiAdminPreviewV1 {
  schemaVersion: typeof AI_ADMIN_PREVIEW_SCHEMA_VERSION;
  models: AdminAiModel[];
}

export interface ParsedAiAdminPreview {
  models: AdminAiModel[];
  migratedFromLegacy: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isProvider(value: unknown): value is AdminAiProvider {
  return value === "workers_ai" || value === "openai_compatible";
}

function isRole(value: unknown): value is AdminAiRole {
  return value === "primary" || value === "fallback" || value === "compare";
}

function isReasoningEffort(value: unknown): value is AdminAiReasoningEffort {
  return value === "none" || value === "low" || value === "medium" || value === "high";
}

function isAdminAiModel(value: unknown): value is AdminAiModel {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isProvider(value.provider) &&
    typeof value.enabled === "boolean" &&
    isRole(value.role) &&
    typeof value.priority === "number" && Number.isFinite(value.priority) &&
    isOptionalString(value.accountId) &&
    isOptionalString(value.gatewayId) &&
    isOptionalString(value.baseUrl) &&
    typeof value.modelId === "string" &&
    isReasoningEffort(value.reasoningEffort) &&
    typeof value.maxCompletionTokens === "number" && Number.isFinite(value.maxCompletionTokens) &&
    typeof value.timeoutMs === "number" && Number.isFinite(value.timeoutMs) &&
    typeof value.tokenConfigured === "boolean" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function normalizeModels(value: unknown): AdminAiModel[] | null {
  if (!Array.isArray(value) || !value.every(isAdminAiModel)) return null;
  return value.map((model) => ({ ...model, tokenConfigured: false }));
}

export function parseAiAdminPreviewStorage(raw: string | null): ParsedAiAdminPreview | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const models = normalizeModels(parsed);
      return models ? { models, migratedFromLegacy: true } : null;
    }
    if (!isRecord(parsed) || parsed.schemaVersion !== AI_ADMIN_PREVIEW_SCHEMA_VERSION) return null;
    const models = normalizeModels(parsed.models);
    return models ? { models, migratedFromLegacy: false } : null;
  } catch {
    return null;
  }
}

export function serializeAiAdminPreviewStorage(models: AdminAiModel[]): string {
  const payload: StoredAiAdminPreviewV1 = {
    schemaVersion: AI_ADMIN_PREVIEW_SCHEMA_VERSION,
    models: models.map((model) => ({ ...model, tokenConfigured: false })),
  };
  return JSON.stringify(payload);
}
