import { openPayload, randomToken, sealPayload, sha256Hex } from "./runtime-security";
import { v3Bearer, v3db, v3now, v3ReadUser, type V3Env, type V3User } from "./platform-v3-base";

type Access={kind:"runtime_access";userId:string;practiceId:string;sessionId:string;expiresAt:number};
export async function v3IssueSession(env:V3Env,user:V3User,rememberMe:boolean,deviceLabel?:string){
 const sessionId=crypto.randomUUID(),refreshToken=randomToken(32),refreshHash=await sha256Hex(refreshToken),ttl=rememberMe?30*24*60*60*1000:12*60*60*1000,refreshExpiresAt=new Date(Date.now()+ttl).toISOString();
 await v3db(env).prepare(`INSERT INTO refresh_tokens(id,user_id,practice_id,token_hash,persistent,expires_at,revoked_at,created_at,last_used_at,device_label) VALUES(?,?,?,?,?,?,NULL,?,?,?)`).bind(sessionId,user.id,user.practiceId,refreshHash,rememberMe?1:0,refreshExpiresAt,v3now(),v3now(),String(deviceLabel??"").slice(0,180)||null).run();
 const expiresAt=Date.now()+20*60*1000,sealed=await sealPayload({kind:"runtime_access",userId:user.id,practiceId:user.practiceId,sessionId,expiresAt} satisfies Access,env.SESSION_SECRET,"RUNTIME-ACCESS-V1");
 return {accessToken:`${sealed.iv}.${sealed.ciphertext}`,accessExpiresAt:new Date(expiresAt).toISOString(),refreshToken,refreshExpiresAt,user};
}
export async function v3RequireRuntime(request:Request,env:V3Env){
 const [iv,ciphertext,extra]=v3Bearer(request).split(".");if(!iv||!ciphertext||extra)return null;
 const access=await openPayload<Access>({iv,ciphertext},env.SESSION_SECRET,"RUNTIME-ACCESS-V1");if(!access||access.kind!=="runtime_access"||access.expiresAt<=Date.now())return null;
 const session=await v3db(env).prepare(`SELECT revoked_at,expires_at FROM refresh_tokens WHERE id=? AND user_id=? AND practice_id=?`).bind(access.sessionId,access.userId,access.practiceId).first<{revoked_at:string|null;expires_at:string}>();if(!session||session.revoked_at||Date.parse(session.expires_at)<=Date.now())return null;
 const user=await v3ReadUser(env,access.userId,access.practiceId);return user?{user,access}:null;
}
