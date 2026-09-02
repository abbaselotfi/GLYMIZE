
import {
  normalizePatientCode,
  toAsciiDigits,
  validateIranianNationalId,
} from "@glymize/contracts";
import { timingSafeEqual } from "node:crypto";

export {
  normalizePatientCode,
  toAsciiDigits,
  validateIranianNationalId,
} from "@glymize/contracts";

export type RuntimeRole = "physician" | "assistant";
export type LayoutPreset = "auto" | "command_center" | "focused_workflow" | "compact_cards";

export const ASSISTANT_PERMISSION_KEYS = [
  "dashboard",
  "type2",
  "type1",
  "pregnancy",
  "insulin_tools",
  "evidence",
  "care_team",
  "handoff.read",
  "handoff.write",
] as const;

export type AssistantPermission = typeof ASSISTANT_PERMISSION_KEYS[number];

export const ADMIN_PERMISSION_KEYS = [
  "admin.center",
  "admin.medications",
  "admin.data_updates",
  "admin.master_registry",
  "admin.users",
  "admin.ai_models",
  "admin.communications",
  "admin.notifications",
] as const;

export const RUNTIME_PERMISSION_KEYS = [
  ...ASSISTANT_PERMISSION_KEYS,
  ...ADMIN_PERMISSION_KEYS,
] as const;

export type AdminPermission = typeof ADMIN_PERMISSION_KEYS[number];
export type RuntimePermission = typeof RUNTIME_PERMISSION_KEYS[number];

export function normalizeMedicalCouncilCode(value: string) {
  return toAsciiDigits(value).trim().replace(/\D/g, "");
}

export function normalizeIranMobile(value: string) {
  const digits = toAsciiDigits(value).replace(/\D/g, "");
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^989\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^00989\d{9}$/.test(digits)) return `0${digits.slice(4)}`;
  return null;
}

export function normalizeEmail(value: string) {
  const email = value.trim().toLocaleLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 180 ? email : null;
}

export function sanitizeAssistantPermissions(value: unknown): AssistantPermission[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(ASSISTANT_PERMISSION_KEYS);
  return [...new Set(value.map(String).filter((item): item is AssistantPermission => allowed.has(item)))];
}

export function sanitizeRuntimePermissions(value: unknown): RuntimePermission[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(RUNTIME_PERMISSION_KEYS);
  return [...new Set(value.map(String).filter((item): item is RuntimePermission => allowed.has(item)))];
}

export function defaultAssistantPermissions(): AssistantPermission[] {
  return ["dashboard", "care_team", "handoff.read", "handoff.write"];
}

export function defaultPhysicianPermissions(): RuntimePermission[] {
  return [...ASSISTANT_PERMISSION_KEYS];
}

export function validLayoutPreset(value: unknown): value is LayoutPreset {
  return ["auto", "command_center", "focused_workflow", "compact_cards"].includes(String(value));
}

export function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return timingSafeEqual(
    new Uint8Array(leftDigest),
    new Uint8Array(rightDigest),
  );
}

export function randomToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToBase64Url(bytes);
}

export async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function contextKey(secret: string, context: string) {
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`GLYMIZE:${context}:${secret}`),
  );
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function sealPayload(payload: unknown, secret: string, context: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await contextKey(secret, context);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded));
  return {
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(ciphertext),
  };
}

export async function openPayload<T>(
  sealed: { iv: string; ciphertext: string },
  secret: string,
  context: string,
): Promise<T | null> {
  try {
    const key = await contextKey(secret, context);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(sealed.iv) },
      key,
      base64UrlToBytes(sealed.ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}

type AuthTokenSecretEnv = {
  SESSION_SECRET: string;
  AUTH_TOKEN_SECRET?: unknown;
  AUTH_TOKEN_SECRET_PREVIOUS?: unknown;
  AUTH_TOKEN_ALLOW_LEGACY_SESSION_SECRET?: unknown;
};

function configuredSecret(value: unknown) {
  const secret = typeof value === "string" ? value.trim() : "";
  return secret || null;
}

export function authTokenSealSecret(env: AuthTokenSecretEnv) {
  return configuredSecret(env.AUTH_TOKEN_SECRET) ?? env.SESSION_SECRET;
}

export function authTokenOpenSecrets(env: AuthTokenSecretEnv) {
  const allowLegacy = String(
    env.AUTH_TOKEN_ALLOW_LEGACY_SESSION_SECRET ?? "true",
  ).trim().toLowerCase() !== "false";
  return [...new Set([
    authTokenSealSecret(env),
    configuredSecret(env.AUTH_TOKEN_SECRET_PREVIOUS),
    allowLegacy ? env.SESSION_SECRET : null,
  ].filter((value): value is string => Boolean(value)))];
}

export async function sealAuthPayload(payload: unknown, env: AuthTokenSecretEnv, context: string) {
  return sealPayload(payload, authTokenSealSecret(env), context);
}

export async function openAuthPayload<T>(
  sealed: { iv: string; ciphertext: string },
  env: AuthTokenSecretEnv,
  context: string,
): Promise<T | null> {
  for (const secret of authTokenOpenSecrets(env)) {
    const payload = await openPayload<T>(sealed, secret, context);
    if (payload) return payload;
  }
  return null;
}

export async function encryptClinicalPayload(
  payload: unknown,
  secret: string,
  aad: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await contextKey(secret, "CLINICAL-DATA-V1");
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const packed = new Uint8Array(cipher);
  const tagLength = 16;
  return {
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(packed.slice(0, packed.length - tagLength)),
    authTag: bytesToBase64Url(packed.slice(packed.length - tagLength)),
  };
}

export async function decryptClinicalPayload<T>(
  payload: { iv: string; ciphertext: string; authTag: string },
  secret: string,
  aad: string,
): Promise<T | null> {
  try {
    const key = await contextKey(secret, "CLINICAL-DATA-V1");
    const ciphertext = base64UrlToBytes(payload.ciphertext);
    const tag = base64UrlToBytes(payload.authTag);
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext);
    combined.set(tag, ciphertext.length);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64UrlToBytes(payload.iv),
        additionalData: new TextEncoder().encode(aad),
      },
      key,
      combined,
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}

export function maskIdentifier(value: string) {
  const normalized = normalizePatientCode(value);
  const visible = normalized.slice(-4);
  return `${"•".repeat(Math.max(4, Math.min(8, normalized.length - visible.length)))}${visible}`;
}
