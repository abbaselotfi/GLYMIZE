"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  type AssistantPermission,
  type LayoutPreset,
  type RuntimeUser,
  type TeamMember,
  getRuntimeProfile,
  getTeamMembers,
  inviteTeamMember,
  logoutRuntime,
  updateRuntimeProfile,
  updateTeamMember,
} from "../../lib/runtime-client";
import { withBasePath } from "../../lib/base-path";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./profile.module.css";

const PERMISSIONS: Array<{ key: AssistantPermission; fa: string; en: string }> = [
  { key: "dashboard", fa: "داشبورد", en: "Dashboard" },
  { key: "type2", fa: "دیابت نوع ۲", en: "Type 2" },
  { key: "type1", fa: "دیابت نوع ۱", en: "Type 1" },
  { key: "pregnancy", fa: "دیابت بارداری", en: "Pregnancy" },
  { key: "insulin_tools", fa: "ابزارهای انسولین", en: "Insulin tools" },
  { key: "evidence", fa: "دستیار علمی AI", en: "Evidence AI" },
  { key: "care_team", fa: "فرم دستیار/پرستار", en: "Care Team form" },
  { key: "handoff.read", fa: "دیدن پرونده‌های آماده", en: "Read handoffs" },
  { key: "handoff.write", fa: "ساخت/ویرایش پرونده", en: "Create/edit handoffs" },
];

const LAYOUT_OPTIONS: Array<{
  key: LayoutPreset;
  icon: string;
  fa: { title: string; body: string };
  en: { title: string; body: string };
}> = [
  { key: "auto", icon: "A", fa: { title: "Auto — پیشنهادی", body: "چیدمان به‌صورت هوشمند با اندازه صفحه تطبیق پیدا می‌کند." }, en: { title: "Auto — Recommended", body: "Automatically adapts the workspace to the current screen size." } },
  { key: "command_center", icon: "CC", fa: { title: "Command Center", body: "نمای دسکتاپ با بیشترین دید هم‌زمان به مسیر و داده‌های بالینی." }, en: { title: "Command Center", body: "Desktop workspace with maximum simultaneous clinical context." } },
  { key: "focused_workflow", icon: "F", fa: { title: "Focused Workflow", body: "محیط باریک‌تر و کم‌حاشیه برای تمرکز روی یک تصمیم در هر مرحله." }, en: { title: "Focused Workflow", body: "Reduced peripheral chrome for one decision at a time." } },
  { key: "compact_cards", icon: "C", fa: { title: "Compact Cards", body: "کارت‌های فشرده‌تر با حفظ حداقل خوانایی متن بالینی." }, en: { title: "Compact Cards", body: "Denser cards while preserving clinical readability." } },
];

const DEFAULT_PERMISSIONS: AssistantPermission[] = ["dashboard", "care_team", "handoff.read", "handoff.write"];

function readImage(file?: File): Promise<string | undefined> {
  if (!file) return Promise.resolve(undefined);
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 350_000) return Promise.reject(new Error("PROFILE_IMAGE_INVALID"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("PROFILE_IMAGE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { locale, isRtl } = useGlymizeLocale();
  const fa = locale === "fa";
  const [user, setUser] = useState<RuntimeUser | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>("auto");
  const [inviteFirst, setInviteFirst] = useState("");
  const [inviteLast, setInviteLast] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMobile, setInviteMobile] = useState("");
  const [invitePermissions, setInvitePermissions] = useState<AssistantPermission[]>(DEFAULT_PERMISSIONS);
  const [lastInviteUrl, setLastInviteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isPhysician = user?.role === "physician";
  const displayName = useMemo(() => user ? `${user.firstName} ${user.lastName}` : "", [user]);

  async function load() {
    setBusy(true); setError("");
    try {
      const profile = await getRuntimeProfile();
      setUser(profile); setFirstName(profile.firstName); setLastName(profile.lastName);
      setPhoto(profile.profilePhoto); setLayoutPreset(profile.layoutPreset);
      if (profile.role === "physician") setTeam(await getTeamMembers());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "PROFILE_LOAD_FAILED");
    } finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, []);

  async function saveProfile() {
    setBusy(true); setError(""); setMessage("");
    try {
      const next = await updateRuntimeProfile({ firstName, lastName, profilePhoto: photo, layoutPreset });
      setUser(next);
      setMessage(fa ? "پروفایل و ترجیح فضای کار ذخیره شد." : "Profile and workspace preference saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "PROFILE_UPDATE_FAILED"); }
    finally { setBusy(false); }
  }

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    try {
      const data = await readImage(event.target.files?.[0]);
      if (data) setPhoto(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "PROFILE_IMAGE_INVALID");
    } finally { event.target.value = ""; }
  }

  function toggleInvitePermission(permission: AssistantPermission) {
    setInvitePermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  }

  async function invite() {
    setBusy(true); setError(""); setMessage(""); setLastInviteUrl("");
    try {
      const result = await inviteTeamMember({ firstName: inviteFirst, lastName: inviteLast, email: inviteEmail || undefined, mobile: inviteMobile || undefined, permissions: invitePermissions });
      setLastInviteUrl(result.inviteUrl ?? "");
      setMessage(result.delivered
        ? (fa ? "دعوت دستیار ارسال شد." : "Care-team invitation sent.")
        : (fa ? "دعوت ساخته شد؛ در صورت غیرفعال بودن ارسال، لینک را امن برای دستیار بفرستید." : "Invitation created; if delivery is disabled, share the link securely."));
      setInviteFirst(""); setInviteLast(""); setInviteEmail(""); setInviteMobile(""); setInvitePermissions(DEFAULT_PERMISSIONS);
      setTeam(await getTeamMembers());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "TEAM_INVITE_FAILED"); }
    finally { setBusy(false); }
  }

  async function patchMember(member: TeamMember, permissions: AssistantPermission[], status = member.status) {
    setBusy(true); setError(""); setMessage("");
    try {
      await updateTeamMember(member.id, { permissions, status });
      setTeam(await getTeamMembers());
      setMessage(fa ? "دسترسی دستیار به‌روز شد." : "Care-team access updated.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "TEAM_MEMBER_UPDATE_FAILED"); }
    finally { setBusy(false); }
  }

  if (!user) return <main className={styles.page} dir={isRtl ? "rtl" : "ltr"}><section className={styles.card}><h1>{fa ? "پروفایل" : "Profile"}</h1><p>{busy ? (fa ? "در حال بارگذاری…" : "Loading…") : error || (fa ? "برای مشاهده پروفایل وارد شوید." : "Sign in to view your profile.")}</p></section></main>;

  return (
    <main className={styles.page} dir={isRtl ? "rtl" : "ltr"}>
      <section className={styles.identity}>
        <div className={styles.avatar}>{photo ? <img alt="" src={photo} /> : <span>{user.firstName.slice(0, 1)}{user.lastName.slice(0, 1)}</span>}</div>
        <div className={styles.identityCopy}><span>GLYMIZE PROFESSIONAL PROFILE</span><h1>{displayName}</h1><p>{isPhysician ? `${fa ? "پزشک · کد نظام پزشکی" : "Physician · Medical Council"}: ${user.medicalCouncilCode ?? "—"}` : `${fa ? "دستیار/پرستار" : "Assistant / nurse"} · ${user.practiceName}`}</p></div>
        <div className={styles.identityBadges}>
          <span data-tone={user.status === "active" ? "success" : "warning"}>{user.status === "active" ? (fa ? "حساب فعال" : "Active account") : user.status}</span>
          {isPhysician && <span data-tone={user.irimcStatus === "verified" ? "success" : "neutral"}>{user.irimcStatus === "verified" ? (fa ? "نظام پزشکی تأییدشده" : "Medical Council verified") : (fa ? "احراز اولیه مدیریت" : "Initial admin verification")}</span>}
        </div>
      </section>

      <div className={styles.profileGrid}>
        <section className={styles.card}>
          <div className={styles.heading}><div><span>IDENTITY</span><h2>{fa ? "مشخصات حرفه‌ای" : "Professional identity"}</h2><p>{fa ? "نام و عکس در تمام فضای کار و حساب مستقل شما نمایش داده می‌شود." : "Your name and photo are used consistently across your independent workspace."}</p></div></div>
          <div className={styles.grid2}>
            <label><span>{fa ? "نام" : "First name"}</span><input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></label>
            <label><span>{fa ? "نام خانوادگی" : "Last name"}</span><input value={lastName} onChange={(e) => setLastName(e.target.value)} /></label>
            <label className={styles.photoField}><span>{fa ? "عکس پروفایل" : "Profile photo"}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void uploadPhoto(e)} /><small>{fa ? "PNG/JPEG/WebP تا 350KB" : "PNG/JPEG/WebP up to 350KB"}</small></label>
          </div>
          <div className={styles.actions}>{photo && <button className={styles.secondary} disabled={busy} onClick={() => setPhoto(undefined)}>{fa ? "حذف عکس" : "Remove photo"}</button>}</div>
        </section>

        <section className={`${styles.card} ${styles.layoutCard}`}>
          <div className={styles.heading}><div><span>WORKSPACE</span><h2>{fa ? "چیدمان فضای کار" : "Workspace layout"}</h2><p>{fa ? "Auto برای اکثر پزشکان پیشنهاد می‌شود؛ انتخاب شما روی حساب ذخیره می‌شود." : "Auto is recommended for most clinicians; your choice follows your account."}</p></div></div>
          <div className={styles.layoutChoiceGrid}>{LAYOUT_OPTIONS.map((option) => {
            const active = layoutPreset === option.key;
            return <label className={styles.layoutChoice} data-active={active} key={option.key}>
              <input type="radio" name="layout-preset" value={option.key} checked={active} onChange={() => setLayoutPreset(option.key)} />
              <span className={styles.layoutIcon}>{option.icon}</span>
              <span><strong>{option[locale].title}</strong><small>{option[locale].body}</small></span>
            </label>;
          })}</div>
        </section>
      </div>

      <div className={styles.saveBar}><div><strong>{fa ? "تغییرات پروفایل" : "Profile changes"}</strong><small>{fa ? "نام، عکس و چیدمان با یک ذخیره به‌روزرسانی می‌شوند." : "Name, photo, and layout are updated together."}</small></div><button disabled={busy} onClick={() => void saveProfile()}>{busy ? (fa ? "در حال ذخیره…" : "Saving…") : (fa ? "ذخیره پروفایل" : "Save profile")}</button></div>

      {isPhysician ? <>
        <section className={styles.card}>
          <div className={styles.heading}><div><span>CARE TEAM</span><h2>{fa ? "دعوت دستیار / پرستار" : "Invite assistant / nurse"}</h2><p>{fa ? "هر عضو حساب مستقل دارد. حداقل دسترسی لازم را انتخاب کنید و بعداً در همین صفحه تغییر دهید." : "Each member gets an independent account. Grant the minimum access needed and adjust it here later."}</p></div></div>
          <div className={styles.grid2}><label><span>{fa ? "نام" : "First name"}</span><input value={inviteFirst} onChange={(e) => setInviteFirst(e.target.value)} /></label><label><span>{fa ? "نام خانوادگی" : "Last name"}</span><input value={inviteLast} onChange={(e) => setInviteLast(e.target.value)} /></label><label><span>{fa ? "ایمیل" : "Email"}</span><input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} /></label><label><span>{fa ? "موبایل" : "Mobile"}</span><input value={inviteMobile} onChange={(e) => setInviteMobile(e.target.value)} /></label></div>
          <div className={styles.permissionGrid}>{PERMISSIONS.map((permission) => <label key={permission.key} data-active={invitePermissions.includes(permission.key)}><input type="checkbox" checked={invitePermissions.includes(permission.key)} onChange={() => toggleInvitePermission(permission.key)} /><span>{permission[locale]}</span></label>)}</div>
          <button className={styles.primaryAction} disabled={busy || !inviteFirst.trim() || !inviteLast.trim() || (!inviteEmail.trim() && !inviteMobile.trim())} onClick={() => void invite()}>{fa ? "ساخت و ارسال دعوت" : "Create invitation"}</button>
          {lastInviteUrl && <div className={styles.inviteLink}><span>{fa ? "لینک دعوت امن" : "Secure invitation link"}</span><code>{lastInviteUrl}</code></div>}
        </section>

        <section className={styles.card}>
          <div className={styles.heading}><div><span>ACCESS CONTROL</span><h2>{fa ? "تیم و سطح دسترسی" : "Care team & permissions"}</h2><p>{fa ? "تغییر مجوز یا غیرفعال‌کردن عضو در درخواست بعدی Backend اعمال می‌شود." : "Permission or status changes are enforced by the backend on the next request."}</p></div></div>
          <div className={styles.teamList}>{team.length === 0 ? <p className={styles.muted}>{fa ? "هنوز دستیاری اضافه نشده است." : "No care-team member has been added yet."}</p> : team.map((member) => <article key={member.id}>
            <div className={styles.memberTop}><div className={styles.smallAvatar}>{member.profilePhoto ? <img alt="" src={member.profilePhoto} /> : member.firstName.slice(0,1)}</div><div><strong>{member.firstName} {member.lastName}</strong><small>{member.email ?? member.mobile ?? "—"}</small></div><select value={member.status} onChange={(e) => void patchMember(member, member.permissions, e.target.value as "active" | "disabled")}><option value="active">Active</option><option value="disabled">Disabled</option></select></div>
            <div className={styles.permissionGrid}>{PERMISSIONS.map((permission) => { const checked = member.permissions.includes(permission.key); return <label key={permission.key} data-active={checked}><input type="checkbox" checked={checked} disabled={busy} onChange={() => void patchMember(member, checked ? member.permissions.filter((item) => item !== permission.key) : [...member.permissions, permission.key])} /><span>{permission[locale]}</span></label>; })}</div>
          </article>)}</div>
        </section>
      </> : <section className={styles.card}><div className={styles.heading}><div><span>MY ACCESS</span><h2>{fa ? "دسترسی‌های من" : "My access"}</h2><p>{fa ? "این مجوزها توسط پزشک مالک تعیین شده‌اند." : "These permissions are controlled by the practice owner."}</p></div></div><div className={styles.permissionGrid}>{PERMISSIONS.map((permission) => <div key={permission.key} data-active={user.permissions.includes(permission.key)}>{permission[locale]}</div>)}</div></section>}

      {(message || error) && <div className={error ? styles.error : styles.message} role={error ? "alert" : "status"}>{error || message}</div>}
      <button className={styles.logout} onClick={async () => { await logoutRuntime(); window.location.href = withBasePath("/account"); }}>{fa ? "خروج از حساب" : "Sign out"}</button>
    </main>
  );
}
