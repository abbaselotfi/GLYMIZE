import type { V3Env } from "./platform-v3-base";

export async function profileCredential(request:Request,env:V3Env){
 return new Response(JSON.stringify({error:"not_ready"}),{status:501,headers:{"content-type":"application/json"}});
}
