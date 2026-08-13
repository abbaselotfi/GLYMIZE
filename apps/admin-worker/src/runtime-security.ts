
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

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toAsciiDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const p = PERSIAN_DIGITS.indexOf(digit);
    if (p >= 0) return String(p);
    const a = ARABIC_DIGITS.indexOf(digit);
    return a >= 0 ? String(a) : digit;
  });
}

export function normalizePatientCode(value: string) {
  return toAsciiDigits(value).trim().toUpperCase().replace(/[\s\-_/\\\.]+/g, "");
}

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

export function validateIranianNationalId(value: string) {
  const code = normalizePatientCode(value);
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false;
  const check = Number(code[9]);
  const sum = code
    .slice(0, 9)
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  return check === (remainder < 2 ? remainder : 11 - remainder);
}

export function sanitizeAssistantPermissions(value: unknown): AssistantPermission[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(ASSISTANT_PERMISSION_KEYS);
  return [...new Set(value.map(String).filter((item): item is AssistantPermission => allowed.has(item)))];
}

export function defaultAssistantPermissions(): AssistantPermission[] {
  return ["dashboard", "care_team", "handoff.read", "handoff.write"];
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

export function constantTimeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
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
