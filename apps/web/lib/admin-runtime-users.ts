"use client";

import { getFreshAdminBearerToken } from "./admin-auth";
import type { RuntimePermission } from "./runtime-permissions";

const adminApiUrl=(process.env.NEXT_PUBLIC_ADMIN_API_URL??"").replace(/\/$/,"");

export interface AdminRuntimeUser{
 id:string;
 role:"physician"|"assistant";
 status:"active"|"disabled";
 firstName:string;
 lastName:string;
 email?:string;
 mobile?:string;
 medicalCouncilCode?:string;
 irimcStatus?:string;
 verificationSource?:string;
 practiceId?:string;
 practiceName?:string;
 layoutPreset?:string;
 passwordSet:boolean;
 createdAt?:string;
 permissions:RuntimePermission[];
}

async function call(path:string,init?:RequestInit){
 const token=await getFreshAdminBearerToken();
 if(!adminApiUrl||!token)throw new Error("ADMIN_AUTH_REQUIRED");
 const headers=new Headers(init?.headers);
 headers.set("authorization",`Bearer ${token}`);
 if(init?.body!==undefined)headers.set("content-type","application/json");
 return fetch(`${adminApiUrl}${path}`,{...init,headers,cache:"no-store"});
}

async function errorCode(response:Response,fallback:string){
 const result=await response.json().catch(()=>null) as {error?:string;conflicts?:string[];existingDisplayName?:string}|null;
 if(response.ok)return result;
 const suffix=result?.conflicts?.length?`:${result.conflicts.join(",")}`:"";
 const display=result?.existingDisplayName?`:${result.existingDisplayName}`:"";
 throw new Error(`${result?.error??fallback}${suffix}${display}`);
}

export async function listRuntimeUsers(){
 const response=await call("/v1/admin/runtime/users");
 const result=await response.json() as AdminRuntimeUser[]|{error?:string};
 if(!response.ok||!Array.isArray(result))throw new Error(Array.isArray(result)?"USERS_READ_FAILED":result.error??"USERS_READ_FAILED");
 return result;
}

export async function createRuntimePhysicianAdmin(input:{
 firstName:string;
 lastName:string;
 medicalCouncilCode:string;
 email?:string;
 mobile?:string;
 practiceName?:string;
 password:string;
 permissions:RuntimePermission[];
}){
 const response=await call("/v1/admin/runtime/users",{method:"POST",body:JSON.stringify(input)});
 const result=await errorCode(response,"USER_CREATE_FAILED") as {created?:boolean;userId?:string}|null;
 return result;
}

export async function updateRuntimeUserAdmin(userId:string,input:{
 status?:"active"|"disabled";
 firstName?:string;
 lastName?:string;
 email?:string;
 mobile?:string;
 medicalCouncilCode?:string;
 permissions?:RuntimePermission[];
}){
 const response=await call(`/v1/admin/runtime/users/${encodeURIComponent(userId)}`,{method:"PATCH",body:JSON.stringify(input)});
 return errorCode(response,"USER_UPDATE_FAILED");
}

export async function resetRuntimeUserPassword(userId:string,newPassword:string){
 const response=await call(`/v1/admin/runtime/users/${encodeURIComponent(userId)}/password`,{method:"POST",body:JSON.stringify({newPassword})});
 return errorCode(response,"PASSWORD_RESET_FAILED");
}

export async function deleteRuntimeUserAdmin(userId:string){
 const response=await call(`/v1/admin/runtime/users/${encodeURIComponent(userId)}`,{
  method:"DELETE",
  body:JSON.stringify({confirmUserId:userId}),
 });
 return errorCode(response,"USER_DELETE_FAILED") as Promise<{deleted?:boolean;mode?:string;identifiersReleased?:boolean;clinicalHistoryPreserved?:boolean}|null>;
}

function csvCell(value:unknown){
 const text=value===undefined||value===null?"":String(value);
 return `"${text.replace(/"/g,'""')}"`;
}

export function downloadRuntimeUsersCsv(users:AdminRuntimeUser[]){
 if(typeof window==="undefined")return;
 const header=[
  "id","role","status","first_name","last_name","email","mobile","medical_council_code",
  "irimc_status","verification_source","practice_id","practice_name","permissions","password_set","created_at"
 ];
 const rows=users.map(user=>[
  user.id,user.role,user.status,user.firstName,user.lastName,user.email??"",user.mobile??"",
  user.medicalCouncilCode??"",user.irimcStatus??"",user.verificationSource??"",
  user.practiceId??"",user.practiceName??"",user.permissions.join("|"),user.passwordSet?"yes":"no",user.createdAt??""
 ]);
 const csv="\uFEFF"+[header,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n");
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob);
 const anchor=document.createElement("a");
 anchor.href=url;
 anchor.download=`glymize-users-${new Date().toISOString().slice(0,10)}.csv`;
 document.body.appendChild(anchor);
 anchor.click();
 anchor.remove();
 URL.revokeObjectURL(url);
}
