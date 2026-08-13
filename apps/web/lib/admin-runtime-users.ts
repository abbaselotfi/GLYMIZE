"use client";

const adminApiUrl=(process.env.NEXT_PUBLIC_ADMIN_API_URL??"").replace(/\/$/,"");
const adminSessionKey="glymize-admin-session";

export interface AdminRuntimeUser{
 id:string;role:"physician"|"assistant";status:"active"|"disabled";firstName:string;lastName:string;email?:string;mobile?:string;medicalCouncilCode?:string;practiceName?:string;layoutPreset?:string;passwordSet:boolean;createdAt?:string;permissions:string[];
}

function session(){return typeof window!=="undefined"?window.sessionStorage.getItem(adminSessionKey):null}
async function call(path:string,init?:RequestInit){const token=session();if(!adminApiUrl||!token)throw new Error("ADMIN_AUTH_REQUIRED");const headers=new Headers(init?.headers);headers.set("authorization",`Bearer ${token}`);if(init?.body!==undefined)headers.set("content-type","application/json");return fetch(`${adminApiUrl}${path}`,{...init,headers,cache:"no-store"})}
export async function listRuntimeUsers(){const response=await call("/v1/admin/runtime/users");const result=await response.json() as AdminRuntimeUser[]|{error?:string};if(!response.ok||!Array.isArray(result))throw new Error(Array.isArray(result)?"USERS_READ_FAILED":result.error??"USERS_READ_FAILED");return result}
export async function updateRuntimeUserAdmin(userId:string,input:{status?:"active"|"disabled";permissions?:string[]}){const response=await call(`/v1/admin/runtime/users/${encodeURIComponent(userId)}`,{method:"PATCH",body:JSON.stringify(input)});const result=await response.json() as {updated?:boolean;error?:string};if(!response.ok)throw new Error(result.error??"USER_UPDATE_FAILED");return result}
export async function resetRuntimeUserPassword(userId:string,newPassword:string){const response=await call(`/v1/admin/runtime/users/${encodeURIComponent(userId)}/password`,{method:"POST",body:JSON.stringify({newPassword})});const result=await response.json() as {updated?:boolean;error?:string};if(!response.ok)throw new Error(result.error??"PASSWORD_RESET_FAILED");return result}
