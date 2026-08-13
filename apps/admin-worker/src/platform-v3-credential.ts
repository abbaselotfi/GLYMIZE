import { base64UrlToBytes, bytesToBase64Url, constantTimeEqual } from "./runtime-security";

export const CREDENTIAL_ITERATIONS=600000;
export function validCredentialValue(value:unknown){if(typeof value!=="string")return false;const length=Array.from(value).length;return length>=10&&length<=128}
async function derive(value:string,salt:Uint8Array,iterations:number){const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(value),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},material,256);return bytesToBase64Url(new Uint8Array(bits))}
export async function createCredential(value:string){const salt=crypto.getRandomValues(new Uint8Array(16));return{hash:await derive(value,salt,CREDENTIAL_ITERATIONS),salt:bytesToBase64Url(salt),iterations:CREDENTIAL_ITERATIONS}}
export async function credentialMatches(value:string,stored:{hash:string;salt:string;iterations:number}){if(!stored.hash||!stored.salt||stored.iterations<100000||stored.iterations>2000000)return false;return constantTimeEqual(await derive(value,base64UrlToBytes(stored.salt),stored.iterations),stored.hash)}
