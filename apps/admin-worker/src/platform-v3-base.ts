import { sanitizeAssistantPermissions, type AssistantPermission, type LayoutPreset, type RuntimeRole } from "./runtime-security";

export interface V3Env { ADMIN_ORIGIN:string; SESSION_SECRET:string; GLYMIZE_DB?:D1Database; [key:string]:unknown }
export type V3User={id:string;role:RuntimeRole;status:"active"|"disabled";firstName:string;lastName:string;email?:string;mobile?:string;medicalCouncilCode?:string;profilePhoto?:string;layoutPreset:LayoutPreset;practiceId:string;practiceName:string;permissions:AssistantPermission[]};
export function v3db(env:V3Env){if(!env.GLYMIZE_DB)throw new Error("GLYMIZE_DB_NOT_CONFIGURED");return env.GLYMIZE_DB}
export function v3now(){return new Date().toISOString()}
export function v3Bearer(request:Request){const value=request.headers.get("authorization")??"";return value.startsWith("Bearer ")?value.slice(7).trim():""}
function parsed(value:string|null){try{return sanitizeAssistantPermissions(value?JSON.parse(value):[])}catch{return [] as AssistantPermission[]}}
const physicianPermissions:AssistantPermission[]=["dashboard","type2","type1","pregnancy","insulin_tools","evidence","care_team","handoff.read","handoff.write"];
export async function v3ReadUser(env:V3Env,userId:string,practiceId:string):Promise<V3User|null>{
 const user=await v3db(env).prepare(`SELECT id,status,first_name,last_name,email_norm,mobile_norm,medical_council_code,profile_photo,layout_preset FROM runtime_users WHERE id=?`).bind(userId).first<any>();
 if(!user||user.status!=="active")return null;
 const member=await v3db(env).prepare(`SELECT m.practice_id,p.name AS practice_name,m.role,m.status,m.permissions_json FROM practice_memberships m JOIN practices p ON p.id=m.practice_id WHERE m.user_id=? AND m.practice_id=?`).bind(userId,practiceId).first<any>();
 if(!member||member.status!=="active")return null;
 return {id:user.id,role:member.role,status:user.status,firstName:user.first_name,lastName:user.last_name,email:user.email_norm??undefined,mobile:user.mobile_norm??undefined,medicalCouncilCode:user.medical_council_code??undefined,profilePhoto:user.profile_photo??undefined,layoutPreset:user.layout_preset??"auto",practiceId:member.practice_id,practiceName:member.practice_name,permissions:member.role==="physician"?physicianPermissions:parsed(member.permissions_json)};
}
