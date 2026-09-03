"use client";

import type {
  RuntimeSessionResponse,
  RuntimeUser,
} from "./runtime-client";
import {
  adoptRuntimeSession,
  getRuntimeAccessToken,
} from "./runtime-client";
import { runtimeApiUrl } from "./runtime-api-url";

export interface RuntimeV3Capabilities{
  passwordLogin:boolean;
  assistantPasswordLogin:boolean;
  passwordSetup:boolean;
  adminUsers:boolean;
  patientPortal:boolean;
  patientIdentityV2:boolean;
  providerDirectory:boolean;
  referralService:boolean;
  careRelationships:boolean;
  multiPracticePatient:boolean;
  schedulingAvailability:boolean;
}

function deviceLabel(){
  if(typeof window==="undefined")return "web";
  const standalone=window.matchMedia?.("(display-mode: standalone)").matches
    ?"PWA"
    :"Browser";
  return `${standalone} آ· ${navigator.platform||"web"}`.slice(0,160);
}

function endpoint(path:string){
  if(!runtimeApiUrl)throw new Error("RUNTIME_API_NOT_CONFIGURED");
  return `${runtimeApiUrl}${path}`;
}

export async function getRuntimeV3Capabilities():Promise<RuntimeV3Capabilities>{
  const empty={
    passwordLogin:false,
    assistantPasswordLogin:false,
    passwordSetup:false,
    adminUsers:false,
    patientPortal:false,
    patientIdentityV2:false,
    providerDirectory:false,
    referralService:false,
    careRelationships:false,
    multiPracticePatient:false,
    schedulingAvailability:false,
  };

  if(!runtimeApiUrl)return empty;

  try{
    const response=await fetch(
      endpoint("/v1/platform-v3"),
      {cache:"no-store"},
    );
    if(!response.ok)return empty;

    const result=await response.json() as {
      capabilities?:Partial<RuntimeV3Capabilities>;
    };

    return {
      passwordLogin:result.capabilities?.passwordLogin===true,
      assistantPasswordLogin:
        result.capabilities?.assistantPasswordLogin===true,
      passwordSetup:result.capabilities?.passwordSetup===true,
      adminUsers:result.capabilities?.adminUsers===true,
      patientPortal:result.capabilities?.patientPortal===true,
      patientIdentityV2:result.capabilities?.patientIdentityV2===true,
      providerDirectory:result.capabilities?.providerDirectory===true,
      referralService:result.capabilities?.referralService===true,
      careRelationships:result.capabilities?.careRelationships===true,
      multiPracticePatient:result.capabilities?.multiPracticePatient===true,
      schedulingAvailability:result.capabilities?.schedulingAvailability===true,
    };
  }catch{
    return empty;
  }
}

export async function loginPhysicianWithPassword(
  medicalCouncilCode:string,
  password:string,
  rememberMe:boolean,
):Promise<RuntimeUser>{
  const response=await fetch(endpoint("/v1/auth/password"),{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      medicalCouncilCode,
      password,
      rememberMe,
      deviceLabel:deviceLabel(),
    }),
    cache:"no-store",
  });

  const result=await response.json() as
    RuntimeSessionResponse&{error?:string};

  if(!response.ok||!result.accessToken){
    throw new Error(result.error??"PASSWORD_LOGIN_FAILED");
  }

  adoptRuntimeSession(result,rememberMe);
  return result.user;
}

export async function loginAssistantWithPassword(
  identifier:string,
  password:string,
  rememberMe:boolean,
):Promise<RuntimeUser>{
  const response=await fetch(
    endpoint("/v1/auth/assistant/password"),
    {
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        identifier,
        password,
        rememberMe,
        deviceLabel:deviceLabel(),
      }),
      cache:"no-store",
    },
  );

  const result=await response.json() as
    RuntimeSessionResponse&{error?:string};

  if(!response.ok||!result.accessToken){
    throw new Error(
      result.error??"ASSISTANT_PASSWORD_LOGIN_FAILED",
    );
  }

  adoptRuntimeSession(result,rememberMe);
  return result.user;
}

export async function updateOwnPassword(input:{
  currentPassword?:string;
  newPassword:string;
}){
  const token=getRuntimeAccessToken();
  if(!token)throw new Error("AUTH_REQUIRED");

  const response=await fetch(endpoint("/v1/profile/password"),{
    method:"PATCH",
    headers:{
      authorization:`Bearer ${token}`,
      "content-type":"application/json",
    },
    body:JSON.stringify(input),
    cache:"no-store",
  });

  const result=await response.json() as {
    ready?:boolean;
    error?:string;
  };

  if(!response.ok||!result.ready){
    throw new Error(result.error??"PASSWORD_UPDATE_FAILED");
  }

  return result;
}
