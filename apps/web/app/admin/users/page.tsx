"use client";

import { useEffect, useMemo, useState } from "react";
import { getRuntimeV3Capabilities } from "../../../lib/runtime-v3-client";
import {
 createRuntimePhysicianAdmin,
 deleteRuntimeUserAdmin,
 downloadRuntimeUsersCsv,
 listRuntimeUsers,
 resetRuntimeUserPassword,
 updateRuntimeUserAdmin,
 type AdminRuntimeUser,
} from "../../../lib/admin-runtime-users";
import {
 DEFAULT_PHYSICIAN_PERMISSIONS,
 RUNTIME_PERMISSION_GROUPS,
 RUNTIME_PERMISSION_KEYS,
 type RuntimePermission,
} from "../../../lib/runtime-permissions";
import { useGlymizeLocale } from "../../components/use-glymize-locale";
import PatientIdentityAdminPanel from "./patient-identity-admin-panel";
import styles from "./admin-users.module.css";

export default function AdminUsersPage(){
 const {locale,isRtl}=useGlymizeLocale(),fa=locale==="fa";
 const [enabled,setEnabled]=useState(false),[checked,setChecked]=useState(false),[users,setUsers]=useState<AdminRuntimeUser[]>([]),[query,setQuery]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[status,setStatus]=useState("");
 const [resetUser,setResetUser]=useState<AdminRuntimeUser|null>(null),[newPassword,setNewPassword]=useState(""),[confirmPassword,setConfirmPassword]=useState("");
 const [editUser,setEditUser]=useState<AdminRuntimeUser|null>(null),[editFirstName,setEditFirstName]=useState(""),[editLastName,setEditLastName]=useState(""),[editMedicalCouncilCode,setEditMedicalCouncilCode]=useState(""),[editEmail,setEditEmail]=useState(""),[editMobile,setEditMobile]=useState(""),[editPermissions,setEditPermissions]=useState<RuntimePermission[]>([]);
 const [createOpen,setCreateOpen]=useState(false),[firstName,setFirstName]=useState(""),[lastName,setLastName]=useState(""),[medicalCouncilCode,setMedicalCouncilCode]=useState(""),[email,setEmail]=useState(""),[mobile,setMobile]=useState(""),[practiceName,setPracticeName]=useState(""),[createPassword,setCreatePassword]=useState(""),[createPassword2,setCreatePassword2]=useState(""),[createPermissions,setCreatePermissions]=useState<RuntimePermission[]>([...DEFAULT_PHYSICIAN_PERMISSIONS]);

 async function load(){setBusy(true);setError("");try{setUsers(await listRuntimeUsers())}catch(reason){setError(reason instanceof Error?reason.message:"USERS_READ_FAILED")}finally{setBusy(false)}}
 useEffect(()=>{void getRuntimeV3Capabilities().then(c=>{setEnabled(c.adminUsers);if(c.adminUsers)void load()}).finally(()=>setChecked(true))},[]);
 const visible=useMemo(()=>{const q=query.trim().toLowerCase();if(!q)return users;return users.filter(user=>`${user.firstName} ${user.lastName} ${user.email??""} ${user.mobile??""} ${user.medicalCouncilCode??""}`.toLowerCase().includes(q))},[query,users]);
 const activeCount=users.filter(user=>user.status==="active").length;
 const createReady=/^\d{3,12}$/.test(medicalCouncilCode)&&firstName.trim()&&lastName.trim()&&(email.trim()||mobile.trim())&&createPassword.length>=10&&createPassword.length<=128&&createPassword===createPassword2;
 function togglePermission(current:RuntimePermission[],permission:RuntimePermission){return current.includes(permission)?current.filter(item=>item!==permission):[...current,permission]}

 function friendlyError(reason:unknown){
  const raw=reason instanceof Error?reason.message:String(reason);
  if(raw.startsWith("account_identifier_already_registered")){
   return fa?"یکی از شناسه‌ها (کد نظام پزشکی، ایمیل یا موبایل) قبلاً ثبت شده است. حساب موجود را در همین صفحه پیدا و مدیریت/حذف کنید.":"A Medical Council code, email, or mobile is already registered. Find the existing account here and manage/delete it first.";
  }
  return raw;
 }

 async function toggleStatus(user:AdminRuntimeUser){setBusy(true);setError("");setStatus("");try{await updateRuntimeUserAdmin(user.id,{status:user.status==="active"?"disabled":"active"});setStatus(fa?"وضعیت دسترسی به‌روز شد.":"Access status updated.");await load()}catch(reason){setError(friendlyError(reason))}finally{setBusy(false)}}

 async function reset(){
  if(!resetUser||newPassword.length<10||newPassword!==confirmPassword)return;
  setBusy(true);setError("");setStatus("");
  try{
   await resetRuntimeUserPassword(resetUser.id,newPassword);
   setStatus(fa?"رمز عبور جدید ثبت و نشست‌های قبلی کاربر باطل شد.":"New password saved and previous sessions were revoked.");
   setResetUser(null);setNewPassword("");setConfirmPassword("");await load();
  }catch(reason){setError(friendlyError(reason))}finally{setBusy(false)}
 }

 function beginEdit(user:AdminRuntimeUser){
  setEditUser(user);setEditFirstName(user.firstName);setEditLastName(user.lastName);setEditMedicalCouncilCode(user.medicalCouncilCode??"");setEditEmail(user.email??"");setEditMobile(user.mobile??"");setEditPermissions([...user.permissions]);
 }
 async function saveEdit(){
  if(!editUser||!editFirstName.trim()||!editLastName.trim()||(!editEmail.trim()&&!editMobile.trim()))return;
  if(editUser.role==="physician"&&!/^\d{3,12}$/.test(editMedicalCouncilCode))return;
  setBusy(true);setError("");setStatus("");
  try{
   await updateRuntimeUserAdmin(editUser.id,{
    firstName:editFirstName.trim(),lastName:editLastName.trim(),email:editEmail.trim(),mobile:editMobile.trim(),
    medicalCouncilCode:editUser.role==="physician"?editMedicalCouncilCode:undefined,
    permissions:editPermissions,
   });
   setStatus(fa?"مشخصات حساب به‌روز شد.":"Account details updated.");
   setEditUser(null);await load();
  }catch(reason){setError(friendlyError(reason))}finally{setBusy(false)}
 }

 async function createAccount(){
  if(!createReady)return;
  setBusy(true);setError("");setStatus("");
  try{
   await createRuntimePhysicianAdmin({
    firstName:firstName.trim(),lastName:lastName.trim(),medicalCouncilCode,
    email:email.trim()||undefined,mobile:mobile.trim()||undefined,
    practiceName:practiceName.trim()||undefined,password:createPassword,permissions:createPermissions,
   });
   setStatus(fa?"حساب پزشک با مجوز مستقیم مدیریت ساخته شد؛ این مسیر به تأیید نظام پزشکی وابسته نیست.":"Physician account created by explicit admin override; this path does not depend on Medical Council verification.");
   setFirstName("");setLastName("");setMedicalCouncilCode("");setEmail("");setMobile("");setPracticeName("");setCreatePassword("");setCreatePassword2("");setCreatePermissions([...DEFAULT_PHYSICIAN_PERMISSIONS]);setCreateOpen(false);
   await load();
  }catch(reason){setError(friendlyError(reason))}finally{setBusy(false)}
 }

 async function removeUser(user:AdminRuntimeUser){
  const ok=window.confirm(fa?`حذف حساب «${user.firstName} ${user.lastName}»؟ دسترسی و شناسه‌های ورود حذف می‌شوند. اگر سابقه بالینی به حساب وابسته باشد، رکورد هویتی ناشناس برای حفظ یکپارچگی audit باقی می‌ماند.`:`Delete “${user.firstName} ${user.lastName}”? Access and login identifiers will be removed. If clinical history references the account, an anonymized tombstone is retained for referential integrity.`);
  if(!ok)return;
  setBusy(true);setError("");setStatus("");
  try{
   const result=await deleteRuntimeUserAdmin(user.id);
   setStatus(result?.mode==="identity_purged"
    ?(fa?"حساب و شناسه‌های ورود حذف شد؛ فقط رکورد ناشناس برای حفظ سابقه بالینی باقی ماند.":"Account access and identifiers were removed; only an anonymized clinical-history tombstone remains.")
    :(fa?"حساب به‌طور کامل حذف شد.":"Account was fully deleted."));
   await load();
  }catch(reason){setError(friendlyError(reason))}finally{setBusy(false)}
 }

 return <main className={styles.page} dir={isRtl?"rtl":"ltr"}>
  <section className={styles.hero}><div><span>IDENTITY & ACCESS</span><h1>{fa?"کاربران و کنترل دسترسی":"Users & access control"}</h1><p>{fa?"مدیریت حساب پزشکان و اعضای تیم مراقبت؛ مدیریت می‌تواند پزشک را مستقل از سرویس نظام پزشکی ایجاد کند. حذف حساب، دسترسی و شناسه‌ها را قطع می‌کند و در صورت وجود سابقه بالینی فقط یک رکورد ناشناس برای حفظ یکپارچگی ارجاعات باقی می‌گذارد.":"Manage physician and care-team accounts. Admins can create physicians independently of the Medical Council adapter. Account deletion removes access and identifiers; when clinical history depends on the identity, only an anonymized tombstone is retained for referential integrity."}</p></div><div className={styles.stat}><b>{activeCount}</b><small>{fa?"حساب فعال":"active accounts"}</small></div></section>

  <PatientIdentityAdminPanel />

  {!checked?<div className={styles.notice}>{fa?"در حال بررسی سرویس مدیریت کاربران…":"Checking user-management service…"}</div>:!enabled?<div className={styles.notice}>{fa?"Runtime هنوز قابلیت مدیریت کاربران را فعال نکرده است.":"This runtime has not enabled Admin Users yet."}</div>:<>
   <div className={styles.toolbar}>
    <input value={query} onChange={e=>setQuery(e.target.value)} placeholder={fa?"جستجو با نام، کد نظام پزشکی، ایمیل یا موبایل…":"Search by name, Medical Council code, email, or mobile…"}/>
    <button disabled={busy} onClick={()=>setCreateOpen(v=>!v)}>{createOpen?(fa?"بستن فرم":"Close form"):(fa?"ساخت حساب پزشک":"Create physician")}</button>
    <button disabled={busy||users.length===0} onClick={()=>downloadRuntimeUsersCsv(users)}>{fa?"خروجی CSV":"Export CSV"}</button>
    <button disabled={busy} onClick={()=>void load()}>{fa?"بازخوانی":"Refresh"}</button>
   </div>

   {createOpen&&<section className={styles.create}>
    <h2>{fa?"ساخت حساب پزشک توسط مدیریت":"Admin-created physician account"}</h2>
    <p>{fa?"این مسیر عمداً از احراز آنلاین نظام پزشکی عبور نمی‌کند و حساب با برچسب admin_manual / unverified ایجاد می‌شود. یکتایی کد نظام پزشکی، ایمیل و موبایل همچنان الزامی است تا ورود مبهم نشود.":"This path intentionally bypasses online Medical Council verification and records the account as admin_manual / unverified. Medical Council code, email, and mobile remain unique to prevent ambiguous sign-in."}</p>
    <div className={styles.createGrid}>
     <label><span>{fa?"نام":"First name"}</span><input value={firstName} onChange={e=>setFirstName(e.target.value)}/></label>
     <label><span>{fa?"نام خانوادگی":"Last name"}</span><input value={lastName} onChange={e=>setLastName(e.target.value)}/></label>
     <label><span>{fa?"کد نظام پزشکی (دستی)":"Medical Council code (manual)"}</span><input inputMode="numeric" value={medicalCouncilCode} onChange={e=>setMedicalCouncilCode(e.target.value.replace(/\D/g,""))}/></label>
     <label><span>{fa?"نام مطب/فضای کاری":"Practice name"}</span><input value={practiceName} onChange={e=>setPracticeName(e.target.value)}/></label>
     <label><span>{fa?"ایمیل":"Email"}</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
     <label><span>{fa?"موبایل":"Mobile"}</span><input inputMode="tel" value={mobile} onChange={e=>setMobile(e.target.value)}/></label>
     <label><span>{fa?"رمز اولیه":"Initial password"}</span><input type="password" autoComplete="new-password" value={createPassword} onChange={e=>setCreatePassword(e.target.value)}/></label>
     <label><span>{fa?"تکرار رمز":"Confirm password"}</span><input type="password" autoComplete="new-password" value={createPassword2} onChange={e=>setCreatePassword2(e.target.value)}/></label>
    </div>
    <div className={styles.permissionPanel}>
     <div className={styles.permissionHeader}><div><strong>{fa?"دسترسی صفحات و امکانات":"Page & feature access"}</strong><small>{fa?"می‌توانید فقط یک صفحه، چند صفحه یا همه بخش‌ها را انتخاب کنید. پروفایل و صفحه ورود همیشه در دسترس می‌مانند.":"Choose one page, several pages, or all sections. Profile and sign-in remain available."}</small></div><div className={styles.permissionQuick}><button type="button" onClick={()=>setCreatePermissions([...DEFAULT_PHYSICIAN_PERMISSIONS])}>{fa?"بالینی پیش‌فرض":"Clinical default"}</button><button type="button" onClick={()=>setCreatePermissions([...RUNTIME_PERMISSION_KEYS])}>{fa?"همه دسترسی‌ها":"Select all"}</button><button type="button" onClick={()=>setCreatePermissions([])}>{fa?"پاک کردن همه":"Clear all"}</button></div></div>
     {RUNTIME_PERMISSION_GROUPS.map(group=><fieldset className={styles.permissionGroup} key={group.id}><legend>{fa?group.fa:group.en}</legend><div className={styles.permissionGrid}>{group.items.map(item=><label className={styles.permissionItem} key={item.key}><input type="checkbox" checked={createPermissions.includes(item.key)} onChange={()=>setCreatePermissions(current=>togglePermission(current,item.key))}/><span>{fa?item.fa:item.en}</span>{item.key==="admin.users"&&<em>{fa?"سطح بالا":"High privilege"}</em>}</label>)}</div></fieldset>)}
    </div>
    <button className={styles.primary} disabled={busy||!createReady} onClick={()=>void createAccount()}>{fa?"ایجاد حساب با مجوز مدیریت":"Create with admin override"}</button>
   </section>}

   <section className={styles.list}>{visible.map(user=><article className={styles.user} key={user.id}>
    <div className={styles.identity}><span className={styles.avatar}>{user.firstName.slice(0,1)}{user.lastName.slice(0,1)}</span><div><strong>{user.firstName} {user.lastName}</strong><small>{user.role==="physician"?(fa?`پزشک · ${user.medicalCouncilCode??"بدون کد"}`:`Physician · ${user.medicalCouncilCode??"no code"}`):(fa?"دستیار / پرستار":"Assistant / nurse")}</small></div></div>
    <div className={styles.meta}><small>{user.email??user.mobile??"—"}</small><small>{user.practiceName??"—"}</small><small>{user.verificationSource==="admin_manual"?(fa?"ایجاد دستی مدیریت · بدون تأیید آنلاین نظام پزشکی":"Admin manual · not online-verified"):user.verificationSource??"—"}</small></div>
    <div className={styles.badges}><span className={styles.badge} data-tone={user.status==="active"?"success":"danger"}>{user.status==="active"?(fa?"فعال":"Active"):(fa?"غیرفعال":"Disabled")}</span><span className={styles.badge} data-tone={user.passwordSet?"success":"warning"}>{user.passwordSet?(fa?"رمز تعریف شده":"Password set"):(fa?"بدون رمز":"No password")}</span><span className={styles.badge}>{fa?`${user.permissions.length} دسترسی`:`${user.permissions.length} permissions`}</span></div>
    <div className={styles.actions}><button disabled={busy} onClick={()=>beginEdit(user)}>{fa?"ویرایش مشخصات":"Edit details"}</button><button disabled={busy} onClick={()=>setResetUser(user)}>{fa?"تعویض رمز":"Reset password"}</button><button className={user.status==="active"?styles.disable:undefined} disabled={busy} onClick={()=>void toggleStatus(user)}>{user.status==="active"?(fa?"غیرفعال کردن":"Deactivate"):(fa?"فعال‌سازی":"Reactivate")}</button><button className={styles.danger} disabled={busy} onClick={()=>void removeUser(user)}>{fa?"حذف حساب":"Delete account"}</button></div>
   </article>)}</section>

   {editUser&&<section className={styles.reset}><h2>{fa?`ویرایش ${editUser.firstName} ${editUser.lastName}`:`Edit ${editUser.firstName} ${editUser.lastName}`}</h2><p>{fa?"ادمین می‌تواند مشخصات و دسترسی هر صفحه را اصلاح کند. یکتایی کد نظام پزشکی، ایمیل و موبایل همچنان کنترل می‌شود.":"Admins can change account details and page-level access. Medical Council code, email, and mobile uniqueness is still enforced."}</p><div className={styles.editGrid}><input placeholder={fa?"نام":"First name"} value={editFirstName} onChange={e=>setEditFirstName(e.target.value)}/><input placeholder={fa?"نام خانوادگی":"Last name"} value={editLastName} onChange={e=>setEditLastName(e.target.value)}/><input placeholder={fa?"کد نظام پزشکی":"Medical Council code"} inputMode="numeric" disabled={editUser.role!=="physician"} value={editMedicalCouncilCode} onChange={e=>setEditMedicalCouncilCode(e.target.value.replace(/\D/g,""))}/><input placeholder={fa?"ایمیل":"Email"} type="email" value={editEmail} onChange={e=>setEditEmail(e.target.value)}/><input placeholder={fa?"موبایل":"Mobile"} inputMode="tel" value={editMobile} onChange={e=>setEditMobile(e.target.value)}/></div><div className={styles.permissionPanel}><div className={styles.permissionQuick}><button type="button" onClick={()=>setEditPermissions([...RUNTIME_PERMISSION_KEYS])}>{fa?"همه دسترسی‌ها":"Select all"}</button><button type="button" onClick={()=>setEditPermissions([])}>{fa?"پاک کردن همه":"Clear all"}</button></div>{RUNTIME_PERMISSION_GROUPS.map(group=><fieldset className={styles.permissionGroup} key={group.id}><legend>{fa?group.fa:group.en}</legend><div className={styles.permissionGrid}>{group.items.map(item=><label className={styles.permissionItem} key={item.key}><input type="checkbox" checked={editPermissions.includes(item.key)} onChange={()=>setEditPermissions(current=>togglePermission(current,item.key))}/><span>{fa?item.fa:item.en}</span>{item.key==="admin.users"&&<em>{fa?"سطح بالا":"High privilege"}</em>}</label>)}</div></fieldset>)}</div><div className={styles.editActions}><button disabled={busy||!editFirstName.trim()||!editLastName.trim()||(!editEmail.trim()&&!editMobile.trim())||(editUser.role==="physician"&&!/^\d{3,12}$/.test(editMedicalCouncilCode))} onClick={()=>void saveEdit()}>{fa?"ذخیره مشخصات و دسترسی‌ها":"Save details & access"}</button><button disabled={busy} onClick={()=>setEditUser(null)}>{fa?"انصراف":"Cancel"}</button></div></section>}
   {resetUser&&<section className={styles.reset}><h2>{fa?`تعویض رمز ${resetUser.firstName} ${resetUser.lastName}`:`Reset password for ${resetUser.firstName} ${resetUser.lastName}`}</h2><p>{fa?"رمز جدید حداقل ۱۰ کاراکتر باشد. با ثبت آن، نشست‌های قبلی کاربر باطل می‌شوند.":"Use at least 10 characters. Saving the new password revokes existing sessions."}</p><div className={styles.resetGrid}><input type="password" autoComplete="new-password" placeholder={fa?"رمز جدید":"New password"} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><input type="password" autoComplete="new-password" placeholder={fa?"تکرار رمز":"Confirm password"} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/><button disabled={busy||newPassword.length<10||newPassword!==confirmPassword} onClick={()=>void reset()}>{fa?"ثبت رمز جدید":"Save new password"}</button></div></section>}
  </>}
  {(status||error)&&<p className={`${styles.status} ${error?styles.error:""}`} role={error?"alert":"status"}>{error||status}</p>}
 </main>;
}
