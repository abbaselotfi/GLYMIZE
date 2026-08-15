"use client";

import type { RuntimeSessionResponse, RuntimeUser } from "./runtime-client";
import { adoptRuntimeSession, getRuntimeAccessToken } from "./runtime-client";

const runtimeApiUrl=(process.env.NEXT_PUBLIC_ADMIN_API_URL??"").replace(/\/$/,"");

export interface RuntimeV3Capabilities{passwordLogin:boolean;passwordSetup:boolean;adminUsers:boolean}

function deviceLabel(){if(typeof window==="undefined")return "web";const standalone=window.matchMedia?.("(display-mode: standalone)").matches?"PWA":"Browser";return `${standalone} · ${navigator.platform||"web"}`.slice(0,160)}
function endpoint(path:string){if(!runtimeApiUrl)throw new Error("RUNTIME_API_NOT_CONFIGURED");return `${runtimeApiUrl}${path}`}

export async function getRuntimeV3Capabilities():Promise<RuntimeV3Capabilities>{
 if(!runtimeApiUrl)return {passwordLogin:false,passwordSetup:false,adminUsers:false};
 try{const response=await fetch(endpoint("/v1/platform-v3"),{cache:"no-store"});if(!response.ok)return {passwordLogin:false,passwordSetup:false,adminUsers:false};const result=await response.json() as {capabilities?:Partial<RuntimeV3Capabilities>};return {passwordLogin:result.capabilities?.passwordLogin===true,passwordSetup:result.capabilities?.passwordSetup===true,adminUsers:result.capabilities?.adminUsers===true}}catch{return {passwordLogin:false,passwordSetup:false,adminUsers:false}}
}

export async function loginPhysicianWithPassword(medicalCouncilCode:string,password:string,rememberMe:boolean):Promise<RuntimeUser>{
 const response=await fetch(endpoint("/v1/auth/password"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({medicalCouncilCode,password,rememberMe,deviceLabel:deviceLabel()}),cache:"no-store"});
 const result=await response.json() as RuntimeSessionResponse&{error?:string};if(!response.ok||!result.accessToken)throw new Error(result.error??"PASSWORD_LOGIN_FAILED");adoptRuntimeSession(result,rememberMe);return result.user;
}

export async function updateOwnPassword(input:{currentPassword?:string;newPassword:string}){
 const token=getRuntimeAccessToken();if(!token)throw new Error("AUTH_REQUIRED");
 const response=await fetch(endpoint("/v1/profile/password"),{method:"PATCH",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(input),cache:"no-store"});
 const result=await response.json() as {updated?:boolean;error?:string};if(!response.ok||!result.updated)throw new Error(result.error??"PASSWORD_UPDATE_FAILED");return result;
}
