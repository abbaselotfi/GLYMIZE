import platformHandler from "./platform-index";
import { base64UrlToBytes, bytesToBase64Url, constantTimeEqual } from "./runtime-security";

interface Env {
  ADMIN_ORIGIN: string;
  SESSION_SECRET: string;
  GLYMIZE_DB?: D1Database;
  [key: string]: unknown;
}

const CREDENTIAL_ITERATIONS = 600000;

function json(request: Request, env: Env, body: unknown, status = 200) {
  const origin = request.headers.get("origin");
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(origin === env.ADMIN_ORIGIN ? {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
        vary: "Origin",
      } : {}),
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function validCredentialValue(value: unknown) {
  if (typeof value !== "string") return false;
  const length = Array.from(value).length;
  return length >= 10 && length <= 128;
}

async function deriveCredential(value: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(value), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

async function createCredential(value: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    hash: await deriveCredential(value, salt, CREDENTIAL_ITERATIONS),
    salt: bytesToBase64Url(salt),
    iterations: CREDENTIAL_ITERATIONS,
  };
}

async function credentialMatches(value: string, stored: { hash: string; salt: string; iterations: number }) {
  const actual = await deriveCredential(value, base64UrlToBytes(stored.salt), stored.iterations);
  return constantTimeEqual(actual, stored.hash);
}

export default {
  async fetch(request: Request, env: Env) {
    if (request.method === "GET" && new URL(request.url).pathname === "/v1/platform-v3") {
      return json(request, env, { version: 3, status: "ready" });
    }
    return platformHandler.fetch(request, env as never);
  },
};
