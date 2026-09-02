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
 patientPortal:false,
 patientIdentityV2:false,
 providerDirectory:false,
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
   setMessage(fa?"ورود دستیار موفق بود.":"Assistant signed in successfully.");
  }catch(reason){
   const code=reason instanceof Error
    ?reason.message
    :"ASSISTANT_PASSWORD_LOGIN_FAILED";
   setError(
    code==="invalid_credentials"
     ?(fa?"ایمیل/موبایل یا رمز عبور صحیح نیست.":"Email/mobile or password is incorrect.")
     :code==="rate_limited"
      ?(fa?"تلاش‌های ناموفق زیاد بوده است؛ کمی بعد دوباره امتحان کنید.":"Too many failed attempts. Try again later.")
      :code==="password_not_set"
       ?(fa?"برای این حساب دستیار هنوز رمز تعریف نشده است؛ از لینک دعوت معتبر استفاده کنید.":"This assistant account has no password yet; use a valid invitation link.")
       :code==="practice_selection_required"
        ?(fa?"این حساب به بیش از یک مطب متصل است؛ انتخاب مطب در نسخه بعدی فعال می‌شود.":"This account belongs to more than one practice; practice selection is required.")
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
     ?"رمز عبور معتبر و تکرار یکسان لازم است."
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
     ?"عضویت در تیم پذیرفته شد و نشست مستقل فعال است."
     :"Invitation accepted and your independent session is active.",
   );
  }catch(reason){
   const code=reason instanceof Error
    ?reason.message
    :"INVITATION_ACCEPT_FAILED";
   setError(
    code==="password_policy"
     ?(fa?"رمز عبور باید بین ۱۰ تا ۱۲۸ کاراکتر باشد.":"Password must be between 10 and 128 characters.")
     :code==="invitation_identity_conflict"
      ?(fa?"این ایمیل یا موبایل قبلاً برای نوع حساب دیگری ثبت شده است.":"This email or mobile is already registered to another account type.")
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
    <h1>{fa?"دعوت به تیم مراقبت GLYMIZE":"GLYMIZE care-team invitation"}</h1>
    {invitation?<>
     <p>
      {fa
       ?`${invitation.physicianName} شما را به «${invitation.practiceName}» دعوت کرده است.`
       :`${invitation.physicianName} invited you to “${invitation.practiceName}”.`}
     </p>
     <p className={styles.muted}>{invitation.email??invitation.mobile}</p>
     {invitation.passwordSetupRequired===true&&<>
      <label>
       <span>{fa?"رمز عبور دستیار (حداقل ۱۰ کاراکتر)":"Assistant password (minimum 10 characters)"}</span>
       <input
        autoComplete="new-password"
        type="password"
        value={password}
        onChange={e=>setPassword(e.target.value)}
       />
      </label>
      <label>
       <span>{fa?"تکرار رمز عبور":"Confirm password"}</span>
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
         ?"رمز عبور باید حداقل ۱۰ و حداکثر ۱۲۸ کاراکتر باشد."
         :"Password must be between 10 and 128 characters."}
       </p>}
      {confirmPassword&&!passwordsMatch&&
       <p className={styles.warning}>
        {fa?"تکرار رمز عبور یکسان نیست.":"Passwords do not match."}
       </p>}
     </>}
     <label className={styles.remember}>
      <input
       type="checkbox"
       checked={rememberMe}
       onChange={e=>setRememberMe(e.target.checked)}
      />
      <span>{fa?"ورود من روی این دستگاه حفظ شود":"Keep me signed in on this device"}</span>
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
      {fa?"پذیرش و ورود مستقل":"Accept and sign in"}
     </button>
    </>:<p>{busy?(fa?"در حال بررسی دعوت…":"Checking invitation…"):error}</p>}
   </section>
  </main>
 );

 return <main className={styles.page} dir={isRtl?"rtl":"ltr"}>
  <section className={styles.hero}>
   <span>GLYMIZE IDENTITY</span>
   <h1>{fa?"هویت حرفه‌ای و ورود امن":"Professional identity & secure sign-in"}</h1>
   <p>
    {fa
     ?"پزشک با کد نظام پزشکی و رمز شخصی وارد می‌شود؛ دستیار/پرستار پس از پذیرش دعوت با ایمیل یا موبایل و رمز مستقل وارد می‌شود."
     :"Physicians sign in with Medical Council code and a personal password; assistants/nurses use their invited email or mobile and an independent password."}
   </p>
  </section>
  <div className={styles.tabs}>
   <button data-active={mode==="login"} onClick={()=>setMode("login")}>
    {fa?"ورود پزشک":"Physician sign in"}
   </button>
   <button data-active={mode==="assistantLogin"} onClick={()=>setMode("assistantLogin")}>
    {fa?"ورود دستیار":"Assistant sign in"}
   </button>
   <button data-active={mode==="signup"} onClick={()=>setMode("signup")}>
    {fa?"ثبت‌نام پزشک":"Physician sign-up"}
   </button>
   {adminSessionPresent&&
    <button data-active={mode==="bootstrap"} onClick={()=>setMode("bootstrap")}>
     {fa?"راه‌اندازی مالک":"Owner bootstrap"}
    </button>}
  </div>
  {!capsChecked?(
   <section className={styles.card}>
    <p>{fa?"در حال بررسی قابلیت‌های ورود امن…":"Checking secure sign-in capabilities…"}</p>
   </section>
  ):mode==="login"?(
   <section className={styles.card}>
    <h2>{fa?"ورود با کد نظام پزشکی":"Sign in with Medical Council code"}</h2>
    {!passwordReady?(
     <p className={styles.warning}>{readinessMessage}</p>
    ):(
     <form onSubmit={login}>
      <label>
       <span>{fa?"کد نظام پزشکی":"Medical Council code"}</span>
       <input
        autoComplete="username"
        inputMode="numeric"
        value={medicalCouncilCode}
        onChange={e=>setMedicalCouncilCode(e.target.value.replace(/\D/g,""))}
       />
      </label>
      <label>
       <span>{fa?"رمز عبور":"Password"}</span>
       <input
        autoComplete="current-password"
        type="password"
        value={password}
        onChange={e=>setPassword(e.target.value)}
       />
      </label>
      <label className={styles.remember}>
       <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}/>
       <span>{fa?"ورود من روی این دستگاه حفظ شود":"Keep me signed in on this device"}</span>
      </label>
      <button disabled={busy||!medicalCouncilCode.trim()||!passwordValid}>
       {busy?(fa?"در حال ورود…":"Signing in…"):(fa?"ورود امن":"Secure sign in")}
      </button>
     </form>
    )}
   </section>
  ):mode==="assistantLogin"?(
   <section className={styles.card}>
    <h2>{fa?"ورود دستیار / پرستار":"Assistant / nurse sign in"}</h2>
    {!assistantPasswordReady?(
     <p className={styles.warning}>{readinessMessage}</p>
    ):(
     <form onSubmit={loginAssistant}>
      <label>
       <span>{fa?"ایمیل یا موبایل":"Email or mobile"}</span>
       <input
        autoComplete="username"
        value={assistantIdentifier}
        onChange={e=>setAssistantIdentifier(e.target.value)}
       />
      </label>
      <label>
       <span>{fa?"رمز عبور":"Password"}</span>
       <input
        autoComplete="current-password"
        type="password"
        value={password}
        onChange={e=>setPassword(e.target.value)}
       />
      </label>
      <label className={styles.remember}>
       <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}/>
       <span>{fa?"ورود من روی این دستگاه حفظ شود":"Keep me signed in on this device"}</span>
      </label>
      <button disabled={busy||!assistantIdentifier.trim()||!passwordValid}>
       {busy?(fa?"در حال ورود…":"Signing in…"):(fa?"ورود دستیار":"Assistant sign in")}
      </button>
     </form>
    )}
   </section>
  ):(
   <section className={styles.card}>
    <h2>
     {mode==="bootstrap"
      ?(fa?"ساخت حساب پزشک مالک — فقط مدیریت":"Owner physician bootstrap — admin only")
      :(fa?"ثبت‌نام پزشک و تعریف رمز":"Physician registration & password")}
    </h2>
    {!passwordReady?(
     <p className={styles.warning}>{readinessMessage}</p>
    ):(
     <form onSubmit={mode==="bootstrap"?bootstrap:signup}>
      <div className={styles.grid2}>
       <label>
        <span>{fa?"کد نظام پزشکی":"Medical Council code"}</span>
        <input
         inputMode="numeric"
         value={medicalCouncilCode}
         onChange={e=>setMedicalCouncilCode(e.target.value.replace(/\D/g,""))}
        />
       </label>
       <label>
        <span>{fa?"ایمیل":"Email"}</span>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)}/>
       </label>
       <label>
        <span>{fa?"نام":"First name"}</span>
        <input value={firstName} onChange={e=>setFirstName(e.target.value)}/>
       </label>
       <label>
        <span>{fa?"نام خانوادگی":"Last name"}</span>
        <input value={lastName} onChange={e=>setLastName(e.target.value)}/>
       </label>
       <label>
        <span>{fa?"موبایل":"Mobile"}</span>
        <input inputMode="tel" value={mobile} onChange={e=>setMobile(e.target.value)}/>
       </label>
       <span></span>
       <label>
        <span>{fa?"رمز عبور (حداقل ۱۰ کاراکتر)":"Password (minimum 10 characters)"}</span>
        <input
         autoComplete="new-password"
         type="password"
         value={password}
         onChange={e=>setPassword(e.target.value)}
        />
       </label>
       <label>
        <span>{fa?"تکرار رمز عبور":"Confirm password"}</span>
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
         ?"رمز عبور باید حداقل ۱۰ و حداکثر ۱۲۸ کاراکتر باشد."
         :"Password must be between 10 and 128 characters."}
       </p>}
      {confirmPassword&&!passwordsMatch&&
       <p className={styles.warning}>
        {fa?"تکرار رمز عبور یکسان نیست.":"Passwords do not match."}
       </p>}
      <label className={styles.remember}>
       <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}/>
       <span>{fa?"ورود من روی این دستگاه حفظ شود":"Keep me signed in on this device"}</span>
      </label>
      <button disabled={busy||!registrationValid}>
       {busy
        ?(fa?"در حال بررسی…":"Checking…")
        :mode==="bootstrap"
         ?(fa?"ساخت حساب و رمز مالک":"Create owner account & password")
         :(fa?"احراز، ثبت‌نام و ساخت رمز":"Verify, register & set password")}
      </button>
     </form>
    )}
   </section>
  )}
  {(message||error)&&<div className={error?styles.error:styles.message} role={error?"alert":"status"}>{error||message}</div>}<p className={styles.adminLink}>{fa?"مدیریت سیستم:":"System admin:"} <Link href="/admin">/admin</Link></p>
 </main>;
}
