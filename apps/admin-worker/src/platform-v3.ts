import platformHandler from "./platform-index";

interface Env {
  ADMIN_ORIGIN: string;
  SESSION_SECRET: string;
  GLYMIZE_DB?: D1Database;
  [key: string]: unknown;
}

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

export default {
  async fetch(request: Request, env: Env) {
    if (request.method === "GET" && new URL(request.url).pathname === "/v1/platform-v3") {
      return json(request, env, { version: 3, status: "ready" });
    }
    return platformHandler.fetch(request, env as never);
  },
};
