import platformHandler from "./platform-index";
import type { V3Env } from "./platform-v3-base";

export async function registrationV3(request:Request,env:V3Env){
 return platformHandler.fetch(request,env as never);
}
