import type { V3Env } from "./platform-v3-base";

export async function saveCredential(env:V3Env,userId:string,value:string){
 return Boolean(env&&userId&&value);
}
