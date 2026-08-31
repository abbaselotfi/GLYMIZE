import { scrypt as nodeScrypt } from "node:crypto";
import { base64UrlToBytes, bytesToBase64Url, constantTimeEqual } from "./runtime-security";

export const CREDENTIAL_SCHEME = "scrypt-v1";
export const SCRYPT_N = 32768;
export const SCRYPT_R = 8;
export const SCRYPT_P = 3;
export const SCRYPT_MAXMEM = 64 * 1024 * 1024;
export const WORKERD_MAX_SCRYPT_COST = 1 << 20;
export const LEGACY_PBKDF2_MIN_ITERATIONS = 100000;
export const LEGACY_PBKDF2_MAX_ITERATIONS = 100000;
// Kept for the existing D1 schema. For scrypt-v1, password_iterations stores N.
export const CREDENTIAL_ITERATIONS = SCRYPT_N;
const DERIVED_KEY_BYTES = 32;
const HASH_PREFIX = `${CREDENTIAL_SCHEME}$`;

export function validCredentialValue(value: unknown) {
  if (typeof value !== "string") return false;
  const length = Array.from(value).length;
  return length >= 10 && length <= 128;
}

function saltBuffer(salt: Uint8Array) {
  return salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
}

function deriveScrypt(value: string, salt: Uint8Array) {
  return new Promise<Uint8Array>((resolve, reject) => {
    nodeScrypt(
      value,
      salt,
      DERIVED_KEY_BYTES,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(Uint8Array.from(derivedKey));
      },
    );
  });
}

async function deriveLegacyPbkdf2(value: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(value),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer(salt), iterations },
    material,
    DERIVED_KEY_BYTES * 8,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

export async function createCredential(value: string) {
  if (!validCredentialValue(value)) throw new Error("password_policy_failed");
  const cost = SCRYPT_N * SCRYPT_R * SCRYPT_P;
  if (cost > WORKERD_MAX_SCRYPT_COST) throw new Error("scrypt_cost_exceeds_workerd_limit");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await deriveScrypt(value, salt);
  return {
    hash: `${HASH_PREFIX}${bytesToBase64Url(derived)}`,
    salt: bytesToBase64Url(salt),
    iterations: CREDENTIAL_ITERATIONS,
  };
}

export async function credentialMatches(
  value: string,
  stored: { hash: string; salt: string; iterations: number },
) {
  if (!validCredentialValue(value) || !stored.hash || !stored.salt || !Number.isInteger(stored.iterations)) {
    return false;
  }

  try {
    if (stored.hash.startsWith(HASH_PREFIX)) {
      if (stored.iterations !== SCRYPT_N) return false;
      const expected = stored.hash.slice(HASH_PREFIX.length);
      if (!expected) return false;
      const derived = await deriveScrypt(value, base64UrlToBytes(stored.salt));
      return constantTimeEqual(bytesToBase64Url(derived), expected);
    }

    // Legacy unversioned hashes were PBKDF2-SHA256. workerd rejects PBKDF2 costs >100k,
    // so unsupported legacy costs fail closed instead of throwing a runtime exception.
    if (
      stored.iterations < LEGACY_PBKDF2_MIN_ITERATIONS ||
      stored.iterations > LEGACY_PBKDF2_MAX_ITERATIONS
    ) {
      return false;
    }
    const derived = await deriveLegacyPbkdf2(
      value,
      base64UrlToBytes(stored.salt),
      stored.iterations,
    );
    return constantTimeEqual(derived, stored.hash);
  } catch {
    return false;
  }
}
