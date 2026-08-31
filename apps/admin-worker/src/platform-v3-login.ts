import { isRuntimeOriginAllowed } from "./platform-cors";
import {
  normalizeEmail,
  normalizeIranMobile,
  normalizeMedicalCouncilCode,
  sha256Hex,
} from "./runtime-security";
import {
  credentialMatches,
  validCredentialValue,
} from "./platform-v3-credential";
import {
  v3db,
  v3ReadUser,
  v3now,
  type V3Env,
} from "./platform-v3-base";
import { v3IssueSession } from "./platform-v3-session";

function reply(request:Request,env:V3Env,body:unknown,status=200){
  const origin=request.headers.get("origin");
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      ...(isRuntimeOriginAllowed(origin,env)
        ? {
            "access-control-allow-origin":origin,
            "access-control-allow-headers":"authorization, content-type",
            vary:"Origin",
          }
        : {}),
      "cache-control":"no-store",
      "content-type":"application/json; charset=utf-8",
    },
  });
}

async function rate(env:V3Env,key:string){
  const now=v3now();
  const cutoff=new Date(Date.now()-15*60*1000).toISOString();
  const row=await v3db(env).prepare(
    `INSERT INTO auth_rate_limits(key,window_started_at,count)
     VALUES(?,?,1)
     ON CONFLICT(key) DO UPDATE SET
       count=CASE WHEN auth_rate_limits.window_started_at<? THEN 1 ELSE auth_rate_limits.count+1 END,
       window_started_at=CASE WHEN auth_rate_limits.window_started_at<? THEN excluded.window_started_at ELSE auth_rate_limits.window_started_at END
     RETURNING count`,
  ).bind(key,now,cutoff,cutoff).first<{count:number}>();
  return Boolean(row&&row.count<=6);
}

export async function credentialLogin(request:Request,env:V3Env){
  let body:Record<string,unknown>;
  try { body=await request.json() as Record<string,unknown>; }
  catch { return reply(request,env,{error:"invalid_json"},400); }

  const code=normalizeMedicalCouncilCode(
    String(body.medicalCouncilCode??""),
  );
  const value=String(body.password??"");

  if(!/^\d{3,12}$/.test(code)||!validCredentialValue(value)){
    return reply(request,env,{error:"invalid_credentials"},401);
  }

  const key=await sha256Hex(
    `credential:${code}:${request.headers.get("cf-connecting-ip")??"unknown"}`,
  );
  if(!(await rate(env,key))) {
    return reply(request,env,{error:"rate_limited"},429);
  }

  const row=await v3db(env).prepare(
    `SELECT id,status,password_hash,password_salt,password_iterations
     FROM runtime_users
     WHERE role='physician' AND medical_council_code=?
     LIMIT 1`,
  ).bind(code).first<any>();

  if(!row||row.status!=="active"){
    return reply(request,env,{error:"invalid_credentials"},401);
  }
  if(!row.password_hash||!row.password_salt||!row.password_iterations){
    return reply(request,env,{error:"password_not_set"},409);
  }
  if(!(await credentialMatches(value,{
    hash:row.password_hash,
    salt:row.password_salt,
    iterations:row.password_iterations,
  }))){
    return reply(request,env,{error:"invalid_credentials"},401);
  }

  const member=await v3db(env).prepare(
    `SELECT practice_id
     FROM practice_memberships
     WHERE user_id=? AND role='physician' AND status='active'
     ORDER BY created_at
     LIMIT 1`,
  ).bind(row.id).first<{practice_id:string}>();

  if(!member) return reply(request,env,{error:"membership_missing"},403);

  const user=await v3ReadUser(env,row.id,member.practice_id);
  if(!user) return reply(request,env,{error:"runtime_user_inactive"},403);

  return reply(
    request,
    env,
    await v3IssueSession(
      env,
      user,
      body.rememberMe!==false,
      String(body.deviceLabel??""),
    ),
  );
}

export async function assistantCredentialLogin(
  request:Request,
  env:V3Env,
){
  let body:Record<string,unknown>;
  try { body=await request.json() as Record<string,unknown>; }
  catch { return reply(request,env,{error:"invalid_json"},400); }

  const identifier=String(body.identifier??"").trim();
  const email=normalizeEmail(identifier);
  const mobile=normalizeIranMobile(identifier);
  const value=String(body.password??"");

  if((!email&&!mobile)||!validCredentialValue(value)){
    return reply(request,env,{error:"invalid_credentials"},401);
  }

  const normalized=email??mobile!;
  const key=await sha256Hex(
    `assistant-credential:${normalized}:${request.headers.get("cf-connecting-ip")??"unknown"}`,
  );
  if(!(await rate(env,key))){
    return reply(request,env,{error:"rate_limited"},429);
  }

  const users=await v3db(env).prepare(
    `SELECT id,status,password_hash,password_salt,password_iterations
     FROM runtime_users
     WHERE role='assistant'
       AND ((? IS NOT NULL AND email_norm=?)
         OR (? IS NOT NULL AND mobile_norm=?))`,
  ).bind(email,email,mobile,mobile).all<any>();

  if(users.results.length!==1){
    return reply(request,env,{error:"invalid_credentials"},401);
  }

  const row=users.results[0]!;
  if(row.status!=="active"){
    return reply(request,env,{error:"invalid_credentials"},401);
  }
  if(!row.password_hash||!row.password_salt||!row.password_iterations){
    return reply(request,env,{error:"password_not_set"},409);
  }
  if(!(await credentialMatches(value,{
    hash:row.password_hash,
    salt:row.password_salt,
    iterations:row.password_iterations,
  }))){
    return reply(request,env,{error:"invalid_credentials"},401);
  }

  const memberships=await v3db(env).prepare(
    `SELECT practice_id
     FROM practice_memberships
     WHERE user_id=? AND role='assistant' AND status='active'
     ORDER BY created_at`,
  ).bind(row.id).all<{practice_id:string}>();

  if(memberships.results.length===0){
    return reply(request,env,{error:"membership_missing"},403);
  }
  if(memberships.results.length>1){
    return reply(
      request,
      env,
      {error:"practice_selection_required"},
      409,
    );
  }

  const member=memberships.results[0]!;
  const user=await v3ReadUser(env,row.id,member.practice_id);
  if(!user) return reply(request,env,{error:"runtime_user_inactive"},403);

  return reply(
    request,
    env,
    await v3IssueSession(
      env,
      user,
      body.rememberMe!==false,
      String(body.deviceLabel??""),
    ),
  );
}
