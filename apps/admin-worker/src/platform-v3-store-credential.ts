import { createCredential } from "./platform-v3-credential";
import { v3now, type V3Env } from "./platform-v3-base";

export async function saveCredential(env:V3Env,userId:string,value:string){
 const item=await createCredential(value),now=v3now();
 return {env,userId,item,now};
}
