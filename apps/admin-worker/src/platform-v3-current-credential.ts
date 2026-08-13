import { credentialMatches, validCredentialValue } from "./platform-v3-credential";
import { v3db, type V3Env } from "./platform-v3-base";

export async function verifyCurrentCredential(env:V3Env,userId:string,value:unknown){
 const row=await v3db(env).prepare(`SELECT password_hash,password_salt,password_iterations FROM runtime_users WHERE id=?`).bind(userId).first<any>();
 if(!row)return {exists:false,valid:false};
 if(!row.password_hash||!row.password_salt||!row.password_iterations)return {exists:false,valid:true};
 const current=String(value??"");
 if(!validCredentialValue(current))return {exists:true,valid:false};
 return {exists:true,valid:await credentialMatches(current,{hash:row.password_hash,salt:row.password_salt,iterations:row.password_iterations})};
}
