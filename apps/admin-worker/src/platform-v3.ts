import platformHandler from "./platform-index";
import { credentialLogin } from "./platform-v3-login";
import type { V3Env } from "./platform-v3-base";

type Env=V3Env;

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
    const url=new URL(request.url);
    if(request.method==="POST"&&url.pathname==="/v1/auth/password")return credentialLogin(request,env);
    if(request.method==="GET"&&url.pathname==="/v1/platform-v3")return json(request,env,{version:3,status:"ready"});
    return platformHandler.fetch(request, env as never);
  },
};
