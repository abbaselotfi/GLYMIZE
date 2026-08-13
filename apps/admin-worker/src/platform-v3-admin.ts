import type { V3Env } from "./platform-v3-base";

export async function adminRuntimeRoute(request:Request,env:V3Env){
 return new Response(JSON.stringify({error:"not_found"}),{status:404,headers:{"content-type":"application/json"}});
}
