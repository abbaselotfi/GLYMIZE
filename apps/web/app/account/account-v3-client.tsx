"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  acceptTeamInvitation,
  bootstrapPhysicianWithAdmin,
  getCachedRuntimeUser,
  initializeRuntimeSession,
  inspectTeamInvitation,
  registerPhysician,
  type RuntimeUser,
} from "../../lib/runtime-client";
import {
  getRuntimeV3Capabilities,
  loginAssistantWithPassword,
  loginPhysicianWithPassword,
  updateOwnPassword,
  type RuntimeV3Capabilities,
} from "../../lib/runtime-v3-client";
import { firstAllowedRuntimePath } from "../../lib/runtime-permissions";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./account.module.css";

type Invitation=Awaited<ReturnType<typeof inspectTeamInvitation>>;
type Mode="login"|"assistantLogin"|"signup"|"bootstrap";
const EMPTY_CAPS:RuntimeV3Capabilities={
 passwordLogin:false,
 assistantPasswordLogin:false,
 passwordSetup:false,
 adminUsers:false,
};

export default function AccountV3Client(){
 const {locale,isRtl}=useGlymizeLocale(),fa=locale==="fa";
 const [mode,setMode]=useState<Mode>("login"),[currentUser,setCurrentUser]=useState<RuntimeUser|null>(getCachedRuntimeUser());
 const [inviteToken,setInviteToken]=useState(""),[invitation,setInvitation]=useState<Invitation|null>(null),[caps,setCaps]=useState<RuntimeV3Capabilities>(EMPTY_CAPS),[capsChecked,setCapsChecked]=useState(false);
 const [medicalCouncilCode,setMedicalCouncilCode]=useState(""),[assistantIdentifier,setAssistantIdentifier]=useState(""),[firstName,setFirstName]=useState(""),[lastName,setLastName]=useState(""),[email,setEmail]=useState(""),[mobile,setMobile]=useState("");
 const [password,setPassword]=useState(""),[confirmPassword,setConfirmPassword]=useState(""),[rememberMe,setRememberMe]=useState(true),[adminSessionPresent,setAdminSessionPresent]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const passwordReady=caps.passwordLogin&&caps.passwordSetup;
 const assistantPasswordReady=caps.assistantPasswordLogin&&caps.passwordSetup;
 const passwordValid=password.length>=10&&password.length<=128;
 const passwordsMatch=password===confirmPassword;
 const registrationValid=/^\d{3,12}$/.test(medicalCouncilCode.replace(/\D/g,""))&&firstName.trim()&&lastName.trim()&&(email.trim()||mobile.trim())&&passwordValid&&passwordsMatch;

 useEffect(()=>{setInviteToken(new URLSearchParams(window.location.search).get("invite")??"");setAdminSessionPresent(Boolean(window.sessionStorage.getItem("glymize-admin-session")));void initializeRuntimeSession(true).then(setCurrentUser);void getRuntimeV3Capabilities().then(setCaps).finally(()=>setCapsChecked(true))},[]);
 useEffect(()=>{if(!inviteToken)return;setBusy(true);void inspectTeamInvitation(inviteToken).then(next=>{setInvitation(next);setFirstName(next.firstName??"");setLastName(next.lastName??"");setEmail(next.email??"");setMobile(next.mobile??"")}).catch(reason=>setError(reason instanceof Error?reason.message:"INVITATION_INVALID")).finally(()=>setBusy(false))},[inviteToken]);
 const readinessMessage=useMemo(()=>fa?"ورود با رمز عبور در طراحی جدید آماده است، اما تا فعال‌شدن ذخیره امن رمز در Runtime روی این محیط فعال نمی‌شود. OTP نمایشی عمداً حذف شده است.":"Password sign-in is ready in the new UI, but stays disabled until secure credential storage is enabled in this runtime. The placeholder OTP flow has been intentionally removed.",[fa]);

 async function login(event:FormEvent){event.preventDefault();if(!passwordReady)return;setBusy(true);setError("");setMessage("");try{const user=await loginPhysicianWithPassword(medicalCouncilCode,password,rememberMe);setCurrentUser(user);setMessage(fa?"ورود موفق بود.":"Signed in successfully.")}catch(reason){const code=reason instanceof Error?reason.message:"PASSWORD_LOGIN_FAILED";setError(code==="invalid_credentials"?(fa?"کد نظام پزشکی یا رمز عبور صحیح نیست.":"Medical Council code or password is incorrect."):code==="rate_limited"?(fa?"تلاش‌های ناموفق زیاد بوده است؛ کمی بعد دوباره امتحان کنید.":"Too many failed attempts. Try again later."):code==="password_not_set"?(fa?"برای این حساب هنوز رمز عبور تعریف نشده است. با نشست معتبر وارد شوید و از پروفایل رمز را تعریف کنید.":"This account does not have a password yet. Sign in through an existing valid session and set one from Profile."):code)}finally{setBusy(false)}}

 async function loginAssistant(event:FormEvent){
  event.preventDefault();
  if(!assistantPasswordReady)return;
  setBusy(true);
  setError("");
  setMessage("");
  try{
   const user=await loginAssistantWithPassword(
    assistantIdentifier,
    password,
    rememberMe,
   );
   setCurrentUser(user);
   setMessage(fa?"ظˆط±ظˆط¯ ط¯ط³طھغŒط§ط± ظ…ظˆظپظ‚ ط¨ظˆط¯.":"Assistant signed in successfully.");
  }catch(reason){
   const code=reason instanceof Error
    ?reason.message
    :"ASSISTANT_PASSWORD_LOGIN_FAILED";
   setError(
    code==="invalid_credentials"
     ?(fa?"ط§غŒظ…غŒظ„/ظ…ظˆط¨ط§غŒظ„ غŒط§ ط±ظ…ط² ط¹ط¨ظˆط± طµط­غŒط­ ظ†غŒط³طھ.":"Email/mobile or password is incorrect.")
     :code==="rate_limited"
      ?(fa?"طھظ„ط§ط´â€Œظ‡ط§غŒ ظ†ط§ظ…ظˆظپظ‚ ط²غŒط§ط¯ ط¨ظˆط¯ظ‡ ط§ط³طھط› ع©ظ…غŒ ط¨ط¹ط¯ ط¯ظˆط¨ط§ط±ظ‡ ط§ظ…طھط­ط§ظ† ع©ظ†غŒط¯.":"Too many failed attempts. Try again later.")
      :code==="password_not_set"
       ?(fa?"ط¨ط±ط§غŒ ط§غŒظ† ط­ط³ط§ط¨ ط¯ط³طھغŒط§ط± ظ‡ظ†ظˆط² ط±ظ…ط² طھط¹ط±غŒظپ ظ†ط´ط¯ظ‡ ط§ط³طھط› ط§ط² ظ„غŒظ†ع© ط¯ط¹ظˆطھ ظ…ط¹طھط¨ط± ط§ط³طھظپط§ط¯ظ‡ ع©ظ†غŒط¯.":"This assistant account has no password yet; use a valid invitation link.")
       :code==="practice_selection_required"
        ?(fa?"ط§غŒظ† ط­ط³ط§ط¨ ط¨ظ‡ ط¨غŒط´ ط§ط² غŒع© ظ…ط·ط¨ ظ…طھطµظ„ ط§ط³طھط› ط§ظ†طھط®ط§ط¨ ظ…ط·ط¨ ط¯ط± ظ†ط³ط®ظ‡ ط¨ط¹ط¯غŒ ظپط¹ط§ظ„ ظ…غŒâ€Œط´ظˆط¯.":"This account belongs to more than one practice; practice selection is required.")
        :code
   );
  }finally{
   setBusy(false);
  }
 }

 async function signup(event:FormEvent){event.preventDefault();if(!passwordReady||!registrationValid)return;setBusy(true);setError("");setMessage("");try{const user=await registerPhysician({medicalCouncilCode,firstName,lastName,email:email||undefined,mobile:mobile||undefined,rememberMe});await updateOwnPassword({newPassword:password});setCurrentUser(user);setMessage(fa?"ثبت‌نام، احراز نظام پزشکی و تعریف رمز عبور انجام شد.":"Registration, Medical Council verification, and password setup completed.")}catch(reason){const code=reason instanceof Error?reason.message:"PHYSICIAN_REGISTRATION_FAILED";setError(code==="irimc_provider_unavailable"?(fa?"اتصال احراز نظام پزشکی هنوز پیکربندی نشده است. برای مالک اولیه از Bootstrap مدیریت استفاده کنید.":"The Medical Council adapter is not configured. Use Admin bootstrap for the initial owner."):code)}finally{setBusy(false)}}

 async function bootstrap(event:FormEvent){event.preventDefault();if(!passwordReady||!registrationValid)return;setBusy(true);setError("");setMessage("");try{const user=await bootstrapPhysicianWithAdmin({medicalCouncilCode,firstName,lastName,email:email||undefined,mobile:mobile||undefined});await updateOwnPassword({newPassword:password});setCurrentUser(user);setMessage(fa?"حساب مالک و رمز عبور با موفقیت ساخته شد.":"Owner account and password were created successfully.")}catch(reason){setError(reason instanceof Error?reason.message:"BOOTSTRAP_FAILED")}finally{setBusy(false)}}

 async function acceptInvite(){
  if(!inviteToken||!invitation)return;
  const needsPassword=invitation.passwordSetupRequired===true;
  if(needsPassword&&(!passwordValid||!passwordsMatch)){
   setError(
    fa
     ?"ط±ظ…ط² ط¹ط¨ظˆط± ظ…ط¹طھط¨ط± ظˆ طھع©ط±ط§ط± غŒع©ط³ط§ظ† ظ„ط§ط²ظ… ط§ط³طھ."
     :"A valid matching password is required.",
   );
   return;
  }

  setBusy(true);
  setError("");
  try{
   const user=await acceptTeamInvitation(
    inviteToken,
    rememberMe,
    needsPassword?password:undefined,
   );
   setCurrentUser(user);
   setMessage(
    fa
     ?"ط¹ط¶ظˆغŒطھ ط¯ط± طھغŒظ… ظ¾ط°غŒط±ظپطھظ‡ ط´ط¯ ظˆ ظ†ط´ط³طھ ظ…ط³طھظ‚ظ„ ظپط¹ط§ظ„ ط§ط³طھ."
     :"Invitation accepted and your independent session is active.",
   );
  }catch(reason){
   const code=reason instanceof Error
    ?reason.message
    :"INVITATION_ACCEPT_FAILED";
   setError(
    code==="password_policy"
     ?(fa?"ط±ظ…ط² ط¹ط¨ظˆط± ط¨ط§غŒط¯ ط¨غŒظ† غ±غ° طھط§ غ±غ²غ¸ ع©ط§ط±ط§ع©طھط± ط¨ط§ط´ط¯.":"Password must be between 10 and 128 characters.")
     :code==="invitation_identity_conflict"
      ?(fa?"ط§غŒظ† ط§غŒظ…غŒظ„ غŒط§ ظ…ظˆط¨ط§غŒظ„ ظ‚ط¨ظ„ط§ظ‹ ط¨ط±ط§غŒ ظ†ظˆط¹ ط­ط³ط§ط¨ ط¯غŒع¯ط±غŒ ط«ط¨طھ ط´ط¯ظ‡ ط§ط³طھ.":"This email or mobile is already registered to another account type.")
      :code
   );
  }finally{
   setBusy(false);
  }
 }

 if(currentUser)return <main className={styles.page} dir={isRtl?"rtl":"ltr"}><section className={styles.successCard}><span>GLYMIZE ID</span><h1>{fa?`خوش آمدید، ${currentUser.firstName} ${currentUser.lastName}`:`Welcome, ${currentUser.firstName} ${currentUser.lastName}`}</h1><p>{currentUser.role==="physician"?(fa?"حساب پزشک فعال است.":"Physician account is active."):(fa?`دستیار/پرستار مستقل · ${currentUser.practiceName}`:`Independent assistant/nurse · ${currentUser.practiceName}`)}</p><div className={styles.actions}><Link href={firstAllowedRuntimePath(currentUser.permissions)}>{fa?"ورود به فضای کار":"Open workspace"}</Link><Link className={styles.secondary} href="/profile">{fa?"پروفایل و امنیت":"Profile & security"}</Link></div></section></main>;

 if(inviteToken)return (
  <main className={styles.page} dir={isRtl?"rtl":"ltr"}>
   <section className={styles.card}>
    <span className={styles.eyebrow}>CARE TEAM INVITATION</span>
    <h1>{fa?"ط¯ط¹ظˆطھ ط¨ظ‡ طھغŒظ… ظ…ط±ط§ظ‚ط¨طھ GLYMIZE":"GLYMIZE care-team invitation"}</h1>
    {invitation?<>
     <p>
      {fa
       ?`${invitation.physicianName} ط´ظ…ط§ ط±ط§ ط¨ظ‡ آ«${invitation.practiceName}آ» ط¯ط¹ظˆطھ ع©ط±ط¯ظ‡ ط§ط³طھ.`
       :`${invitation.physicianName} invited you to â€œ${invitation.practiceName}â€‌.`}
     </p>
     <p className={styles.muted}>{invitation.email??invitation.mobile}</p>
     {invitation.passwordSetupRequired===true&&<>
      <label>
       <span>{fa?"ط±ظ…ط² ط¹ط¨ظˆط± ط¯ط³طھغŒط§ط± (ط­ط¯ط§ظ‚ظ„ غ±غ° ع©ط§ط±ط§ع©طھط±)":"Assistant password (minimum 10 characters)"}</span>
       <input
        autoComplete="new-password"
        type="password"
        value={password}
        onChange={e=>setPassword(e.target.value)}
       />
      </label>
      <label>
       <span>{fa?"طھع©ط±ط§ط± ط±ظ…ط² ط¹ط¨ظˆط±":"Confirm password"}</span>
       <input
        autoComplete="new-password"
        type="password"
        value={confirmPassword}
        onChange={e=>setConfirmPassword(e.target.value)}
       />
      </label>
      {password&&!passwordValid&&
       <p className={styles.warning}>
        {fa
         ?"ط±ظ…ط² ط¹ط¨ظˆط± ط¨ط§غŒط¯ ط­ط¯ط§ظ‚ظ„ غ±غ° ظˆ ط­ط¯ط§ع©ط«ط± غ±غ²غ¸ ع©ط§ط±ط§ع©طھط± ط¨ط§ط´ط¯."
         :"Password must be between 10 and 128 characters."}
       </p>}
      {confirmPassword&&!passwordsMatch&&
       <p className={styles.warning}>
        {fa?"طھع©ط±ط§ط± ط±ظ…ط² ط¹ط¨ظˆط± غŒع©ط³ط§ظ† ظ†غŒط³طھ.":"Passwords do not match."}
       </p>}
     </>}
     <label className={styles.remember}>
      <input
       type="checkbox"
       checked={rememberMe}
       onChange={e=>setRememberMe(e.target.checked)}
      />
      <span>{fa?"ظˆط±ظˆط¯ ظ…ظ† ط±ظˆغŒ ط§غŒظ† ط¯ط³طھع¯ط§ظ‡ ط­ظپط¸ ط´ظˆط¯":"Keep me signed in on this device"}</span>
     </label>
     <button
      disabled={
       busy||
       (invitation.passwordSetupRequired===true&&
        (!passwordValid||!passwordsMatch))
      }
      onClick={()=>void acceptInvite()}
      type="button"
     >
      {fa?"ظ¾ط°غŒط±ط´ ظˆ ظˆط±ظˆط¯ ظ…ط³طھظ‚ظ„":"Accept and sign in"}
     </button>
    </>:<p>{busy?(fa?"ط¯ط± ط­ط§ظ„ ط¨ط±ط±ط³غŒ ط¯ط¹ظˆطھâ€¦":"Checking invitationâ€¦"):error}</p>}
   </section>
  </main>
 );

 return <main className={styles.page} dir={isRtl?"rtl":"ltr"}>
  <section className={styles.hero}>
   <span>GLYMIZE IDENTITY</span>
   <h1>{fa?"ظ‡ظˆغŒطھ ط­ط±ظپظ‡â€Œط§غŒ ظˆ ظˆط±ظˆط¯ ط§ظ…ظ†":"Professional identity & secure sign-in"}</h1>
   <p>
    {fa
     ?"ظ¾ط²ط´ع© ط¨ط§ ع©ط¯ ظ†ط¸ط§ظ… ظ¾ط²ط´ع©غŒ ظˆ ط±ظ…ط² ط´ط®طµغŒ ظˆط§ط±ط¯ ظ…غŒâ€Œط´ظˆط¯ط› ط¯ط³طھغŒط§ط±/ظ¾ط±ط³طھط§ط± ظ¾ط³ ط§ط² ظ¾ط°غŒط±ط´ ط¯ط¹ظˆطھ ط¨ط§ ط§غŒظ…غŒظ„ غŒط§ ظ…ظˆط¨ط§غŒظ„ ظˆ ط±ظ…ط² ظ…ط³طھظ‚ظ„ ظˆط§ط±ط¯ ظ…غŒâ€Œط´ظˆط¯."
     :"Physicians sign in with Medical Council code and a personal password; assistants/nurses use their invited email or mobile and an independent password."}
   </p>
  </section>
  <div className={styles.tabs}>
   <button data-active={mode==="login"} onClick={()=>setMode("login")}>
    {fa?"ظˆط±ظˆط¯ ظ¾ط²ط´ع©":"Physician sign in"}
   </button>
   <button data-active={mode==="assistantLogin"} onClick={()=>setMode("assistantLogin")}>
    {fa?"ظˆط±ظˆط¯ ط¯ط³طھغŒط§ط±":"Assistant sign in"}
   </button>
   <button data-active={mode==="signup"} onClick={()=>setMode("signup")}>
    {fa?"ط«ط¨طھâ€Œظ†ط§ظ… ظ¾ط²ط´ع©":"Physician sign-up"}
   </button>
   {adminSessionPresent&&
    <button data-active={mode==="bootstrap"} onClick={()=>setMode("bootstrap")}>
     {fa?"ط±ط§ظ‡â€Œط§ظ†ط¯ط§ط²غŒ ظ…ط§ظ„ع©":"Owner bootstrap"}
    </button>}
  </div>
  {!capsChecked?(
   <section className={styles.card}>
    <p>{fa?"ط¯ط± ط­ط§ظ„ ط¨ط±ط±ط³غŒ ظ‚ط§ط¨ظ„غŒطھâ€Œظ‡ط§غŒ ظˆط±ظˆط¯ ط§ظ…ظ†â€¦":"Checking secure sign-in capabilitiesâ€¦"}</p>
   </section>
  ):mode==="login"?(
   <section className={styles.card}>
    <h2>{fa?"ظˆط±ظˆط¯ ط¨ط§ ع©ط¯ ظ†ط¸ط§ظ… ظ¾ط²ط´ع©غŒ":"Sign in with Medical Council code"}</h2>
    {!passwordReady?(
     <p className={styles.warning}>{readinessMessage}</p>
    ):(
     <form onSubmit={login}>
      <label>
       <span>{fa?"ع©ط¯ ظ†ط¸ط§ظ… ظ¾ط²ط´ع©غŒ":"Medical Council code"}</span>
       <input
        autoComplete="username"
        inputMode="numeric"
        value={medicalCouncilCode}
        onChange={e=>setMedicalCouncilCode(e.target.value.replace(/\D/g,""))}
       />
      </label>
      <label>
       <span>{fa?"ط±ظ…ط² ط¹ط¨ظˆط±":"Password"}</span>
       <input
        autoComplete="current-password"
        type="password"
        value={password}
        onChange={e=>setPassword(e.target.value)}
       />
      </label>
      <label className={styles.remember}>
       <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}/>
       <span>{fa?"ظˆط±ظˆط¯ ظ…ظ† ط±ظˆغŒ ط§غŒظ† ط¯ط³طھع¯ط§ظ‡ ط­ظپط¸ ط´ظˆط¯":"Keep me signed in on this device"}</span>
      </label>
      <button disabled={busy||!medicalCouncilCode.trim()||!passwordValid}>
       {busy?(fa?"ط¯ط± ط­ط§ظ„ ظˆط±ظˆط¯â€¦":"Signing inâ€¦"):(fa?"ظˆط±ظˆط¯ ط§ظ…ظ†":"Secure sign in")}
      </button>
     </form>
    )}
   </section>
  ):mode==="assistantLogin"?(
   <section className={styles.card}>
    <h2>{fa?"ظˆط±ظˆط¯ ط¯ط³طھغŒط§ط± / ظ¾ط±ط³طھط§ط±":"Assistant / nurse sign in"}</h2>
    {!assistantPasswordReady?(
     <p className={styles.warning}>{readinessMessage}</p>
    ):(
     <form onSubmit={loginAssistant}>
      <label>
       <span>{fa?"ط§غŒظ…غŒظ„ غŒط§ ظ…ظˆط¨ط§غŒظ„":"Email or mobile"}</span>
       <input
        autoComplete="username"
        value={assistantIdentifier}
        onChange={e=>setAssistantIdentifier(e.target.value)}
       />
      </label>
      <label>
       <span>{fa?"ط±ظ…ط² ط¹ط¨ظˆط±":"Password"}</span>
       <input
        autoComplete="current-password"
        type="password"
        value={password}
        onChange={e=>setPassword(e.target.value)}
       />
      </label>
      <label className={styles.remember}>
       <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}/>
       <span>{fa?"ظˆط±ظˆط¯ ظ…ظ† ط±ظˆغŒ ط§غŒظ† ط¯ط³طھع¯ط§ظ‡ ط­ظپط¸ ط´ظˆط¯":"Keep me signed in on this device"}</span>
      </label>
      <button disabled={busy||!assistantIdentifier.trim()||!passwordValid}>
       {busy?(fa?"ط¯ط± ط­ط§ظ„ ظˆط±ظˆط¯â€¦":"Signing inâ€¦"):(fa?"ظˆط±ظˆط¯ ط¯ط³طھغŒط§ط±":"Assistant sign in")}
      </button>
     </form>
    )}
   </section>
  ):(
   <section className={styles.card}>
    <h2>
     {mode==="bootstrap"
      ?(fa?"ط³ط§ط®طھ ط­ط³ط§ط¨ ظ¾ط²ط´ع© ظ…ط§ظ„ع© â€” ظپظ‚ط· ظ…ط¯غŒط±غŒطھ":"Owner physician bootstrap â€” admin only")
      :(fa?"ط«ط¨طھâ€Œظ†ط§ظ… ظ¾ط²ط´ع© ظˆ طھط¹ط±غŒظپ ط±ظ…ط²":"Physician registration & password")}
    </h2>
    {!passwordReady?(
     <p className={styles.warning}>{readinessMessage}</p>
    ):(
     <form onSubmit={mode==="bootstrap"?bootstrap:signup}>
      <div className={styles.grid2}>
       <label>
        <span>{fa?"ع©ط¯ ظ†ط¸ط§ظ… ظ¾ط²ط´ع©غŒ":"Medical Council code"}</span>
        <input
         inputMode="numeric"
         value={medicalCouncilCode}
         onChange={e=>setMedicalCouncilCode(e.target.value.replace(/\D/g,""))}
        />
       </label>
       <label>
        <span>{fa?"ط§غŒظ…غŒظ„":"Email"}</span>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)}/>
       </label>
       <label>
        <span>{fa?"ظ†ط§ظ…":"First name"}</span>
        <input value={firstName} onChange={e=>setFirstName(e.target.value)}/>
       </label>
       <label>
        <span>{fa?"ظ†ط§ظ… ط®ط§ظ†ظˆط§ط¯ع¯غŒ":"Last name"}</span>
        <input value={lastName} onChange={e=>setLastName(e.target.value)}/>
       </label>
       <label>
        <span>{fa?"ظ…ظˆط¨ط§غŒظ„":"Mobile"}</span>
        <input inputMode="tel" value={mobile} onChange={e=>setMobile(e.target.value)}/>
       </label>
       <span></span>
       <label>
        <span>{fa?"ط±ظ…ط² ط¹ط¨ظˆط± (ط­ط¯ط§ظ‚ظ„ غ±غ° ع©ط§ط±ط§ع©طھط±)":"Password (minimum 10 characters)"}</span>
        <input
         autoComplete="new-password"
         type="password"
         value={password}
         onChange={e=>setPassword(e.target.value)}
        />
       </label>
       <label>
        <span>{fa?"طھع©ط±ط§ط± ط±ظ…ط² ط¹ط¨ظˆط±":"Confirm password"}</span>
        <input
         autoComplete="new-password"
         type="password"
         value={confirmPassword}
         onChange={e=>setConfirmPassword(e.target.value)}
        />
       </label>
      </div>
      {password&&!passwordValid&&
       <p className={styles.warning}>
        {fa
         ?"ط±ظ…ط² ط¹ط¨ظˆط± ط¨ط§غŒط¯ ط­ط¯ط§ظ‚ظ„ غ±غ° ظˆ ط­ط¯ط§ع©ط«ط± غ±غ²غ¸ ع©ط§ط±ط§ع©طھط± ط¨ط§ط´ط¯."
         :"Password must be between 10 and 128 characters."}
       </p>}
      {confirmPassword&&!passwordsMatch&&
       <p className={styles.warning}>
        {fa?"طھع©ط±ط§ط± ط±ظ…ط² ط¹ط¨ظˆط± غŒع©ط³ط§ظ† ظ†غŒط³طھ.":"Passwords do not match."}
       </p>}
      <label className={styles.remember}>
       <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}/>
       <span>{fa?"ظˆط±ظˆط¯ ظ…ظ† ط±ظˆغŒ ط§غŒظ† ط¯ط³طھع¯ط§ظ‡ ط­ظپط¸ ط´ظˆط¯":"Keep me signed in on this device"}</span>
      </label>
      <button disabled={busy||!registrationValid}>
       {busy
        ?(fa?"ط¯ط± ط­ط§ظ„ ط¨ط±ط±ط³غŒâ€¦":"Checkingâ€¦")
        :mode==="bootstrap"
         ?(fa?"ط³ط§ط®طھ ط­ط³ط§ط¨ ظˆ ط±ظ…ط² ظ…ط§ظ„ع©":"Create owner account & password")
         :(fa?"ط§ط­ط±ط§ط²طŒ ط«ط¨طھâ€Œظ†ط§ظ… ظˆ ط³ط§ط®طھ ط±ظ…ط²":"Verify, register & set password")}
      </button>
     </form>
    )}
   </section>
  )}
  {(message||error)&&<div className={error?styles.error:styles.message} role={error?"alert":"status"}>{error||message}</div>}<p className={styles.adminLink}>{fa?"مدیریت سیستم:":"System admin:"} <Link href="/admin">/admin</Link></p>
 </main>;
}
