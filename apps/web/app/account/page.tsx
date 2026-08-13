"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  acceptTeamInvitation,
  bootstrapPhysicianWithAdmin,
  getCachedRuntimeUser,
  initializeRuntimeSession,
  inspectTeamInvitation,
  registerPhysician,
  requestLoginCode,
  verifyLoginCode,
} from "../../lib/runtime-client";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./account.module.css";

type Invitation = Awaited<ReturnType<typeof inspectTeamInvitation>>;

type Mode = "login" | "signup" | "bootstrap";

export default function AccountPage() {
  const { locale, isRtl } = useGlymizeLocale();
  const fa = locale === "fa";
  const [inviteToken, setInviteToken] = useState("");
  const [mode, setMode] = useState<Mode>("login");
  const [currentUser, setCurrentUser] = useState(getCachedRuntimeUser());
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [medicalCouncilCode, setMedicalCouncilCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [adminSessionPresent, setAdminSessionPresent] = useState(false);

  useEffect(() => {
    setInviteToken(new URLSearchParams(window.location.search).get("invite") ?? "");
    setAdminSessionPresent(Boolean(window.sessionStorage.getItem("glymize-admin-session")));
    void initializeRuntimeSession(true).then(setCurrentUser);
  }, []);

  useEffect(() => {
    if (!inviteToken) return;
    setBusy(true);
    void inspectTeamInvitation(inviteToken)
      .then((next) => {
        setInvitation(next);
        setFirstName(next.firstName ?? "");
        setLastName(next.lastName ?? "");
        setEmail(next.email ?? "");
        setMobile(next.mobile ?? "");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "INVITATION_INVALID"))
      .finally(() => setBusy(false));
  }, [inviteToken]);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    if (!identifier.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await requestLoginCode(identifier.trim());
      setChallengeId(result.challengeId ?? "");
      setMessage(result.delivered
        ? (fa ? "کد ورود ارسال شد." : "Login code sent.")
        : (fa ? "اگر حساب فعال و روش ورود پیکربندی شده باشد، کد ارسال می‌شود." : "If the account and delivery method are active, a code will be sent."));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "LOGIN_FAILED");
    } finally { setBusy(false); }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const user = await verifyLoginCode(challengeId, otp, rememberMe);
      setCurrentUser(user);
      setMessage(fa ? "ورود موفق بود." : "Signed in successfully.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "LOGIN_FAILED");
    } finally { setBusy(false); }
  }

  async function signup(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const user = await registerPhysician({ medicalCouncilCode, firstName, lastName, email: email || undefined, mobile: mobile || undefined, rememberMe });
      setCurrentUser(user);
      setMessage(fa ? "ثبت‌نام و احراز نظام پزشکی انجام شد." : "Registration and Medical Council verification succeeded.");
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "PHYSICIAN_REGISTRATION_FAILED";
      setError(code === "irimc_provider_unavailable"
        ? (fa ? "اتصال مستقیم احراز نظام پزشکی هنوز پیکربندی نشده است. برای راه‌اندازی اولیه مالک، از Bootstrap مدیریت استفاده کنید." : "The direct Medical Council verification adapter is not configured yet. Use the admin bootstrap for the initial owner account.")
        : code);
    } finally { setBusy(false); }
  }

  async function bootstrap(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const user = await bootstrapPhysicianWithAdmin({ medicalCouncilCode, firstName, lastName, email: email || undefined, mobile: mobile || undefined });
      setCurrentUser(user);
      setMessage(fa ? "حساب پزشک مالک برای تست اولیه ساخته شد. این مسیر فقط مدیریت است و جایگزین احراز عمومی نظام پزشکی نیست." : "The owner physician account was bootstrapped for initial testing. This admin-only path does not replace public Medical Council verification.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "BOOTSTRAP_FAILED");
    } finally { setBusy(false); }
  }

  async function acceptInvite() {
    if (!inviteToken) return;
    setBusy(true); setError("");
    try {
      const user = await acceptTeamInvitation(inviteToken, rememberMe);
      setCurrentUser(user);
      setMessage(fa ? "عضویت در تیم پذیرفته شد و ورود مستقل شما فعال است." : "Invitation accepted. Your independent care-team login is now active.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "INVITATION_ACCEPT_FAILED");
    } finally { setBusy(false); }
  }

  if (currentUser) {
    return (
      <main className={styles.page} dir={isRtl ? "rtl" : "ltr"}>
        <section className={styles.successCard}>
          <span>GLYMIZE ID</span>
          <h1>{fa ? `خوش آمدید، ${currentUser.firstName} ${currentUser.lastName}` : `Welcome, ${currentUser.firstName} ${currentUser.lastName}`}</h1>
          <p>{currentUser.role === "physician" ? (fa ? "حساب پزشک فعال است." : "Physician account is active.") : (fa ? `دستیار/پرستار مستقل · ${currentUser.practiceName}` : `Independent assistant/nurse · ${currentUser.practiceName}`)}</p>
          <div className={styles.actions}><Link href="/dashboard">{fa ? "ورود به فضای کار" : "Open workspace"}</Link><Link className={styles.secondary} href="/profile">{fa ? "پروفایل و دسترسی‌ها" : "Profile & access"}</Link></div>
        </section>
      </main>
    );
  }

  if (inviteToken) {
    return (
      <main className={styles.page} dir={isRtl ? "rtl" : "ltr"}>
        <section className={styles.card}>
          <span className={styles.eyebrow}>CARE TEAM INVITATION</span>
          <h1>{fa ? "دعوت به تیم مراقبت GLYMIZE" : "GLYMIZE care-team invitation"}</h1>
          {invitation ? <>
            <p>{fa ? `${invitation.physicianName} شما را به «${invitation.practiceName}» دعوت کرده است.` : `${invitation.physicianName} invited you to “${invitation.practiceName}”.`}</p>
            <p className={styles.muted}>{invitation.email ?? invitation.mobile}</p>
            <label className={styles.remember}><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /><span>{fa ? "ورود من روی این دستگاه حفظ شود" : "Keep me signed in on this device"}</span></label>
            <button disabled={busy} onClick={() => void acceptInvite()} type="button">{fa ? "پذیرش و ورود مستقل" : "Accept and sign in"}</button>
          </> : <p>{busy ? (fa ? "در حال بررسی دعوت…" : "Checking invitation…") : error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page} dir={isRtl ? "rtl" : "ltr"}>
      <section className={styles.hero}>
        <span>GLYMIZE IDENTITY</span>
        <h1>{fa ? "ورود و پروفایل حرفه‌ای" : "Professional sign-in & profile"}</h1>
        <p>{fa ? "پزشک با احراز نظام پزشکی و دستیار/پرستار با دعوت پزشک، حساب مستقل و ماندگار دریافت می‌کنند." : "Physicians are verified through the Medical Council; assistants/nurses receive independent accounts through physician invitations."}</p>
      </section>

      <div className={styles.tabs}>
        <button data-active={mode === "login"} onClick={() => setMode("login")}>{fa ? "ورود" : "Sign in"}</button>
        <button data-active={mode === "signup"} onClick={() => setMode("signup")}>{fa ? "ثبت‌نام پزشک" : "Physician sign-up"}</button>
        {adminSessionPresent && <button data-active={mode === "bootstrap"} onClick={() => setMode("bootstrap")}>{fa ? "راه‌اندازی اولیه مدیریت" : "Admin bootstrap"}</button>}
      </div>

      {mode === "login" ? (
        <section className={styles.card}>
          <h2>{fa ? "ورود پزشک یا دستیار" : "Physician or care-team sign in"}</h2>
          {!challengeId ? <form onSubmit={requestCode}>
            <label><span>{fa ? "ایمیل یا موبایل" : "Email or mobile"}</span><input autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></label>
            <button disabled={busy || !identifier.trim()}>{fa ? "ارسال کد ورود" : "Send login code"}</button>
          </form> : <form onSubmit={verifyCode}>
            <label><span>{fa ? "کد ۶ رقمی" : "6-digit code"}</span><input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} /></label>
            <label className={styles.remember}><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /><span>{fa ? "ورود من حفظ شود (مناسب PWA و دستگاه شخصی)" : "Keep me signed in (recommended for a personal/PWA device)"}</span></label>
            <button disabled={busy || otp.length !== 6}>{fa ? "ورود" : "Sign in"}</button>
          </form>}
        </section>
      ) : (
        <section className={styles.card}>
          <h2>{mode === "bootstrap" ? (fa ? "ساخت حساب پزشک مالک — فقط مدیریت" : "Owner physician bootstrap — admin only") : (fa ? "ثبت‌نام پزشک" : "Physician registration")}</h2>
          <form onSubmit={mode === "bootstrap" ? bootstrap : signup}>
            <div className={styles.grid2}>
              <label><span>{fa ? "کد نظام پزشکی" : "Medical Council code"}</span><input inputMode="numeric" value={medicalCouncilCode} onChange={(e) => setMedicalCouncilCode(e.target.value)} /></label>
              <label><span>{fa ? "ایمیل" : "Email"}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label><span>{fa ? "نام" : "First name"}</span><input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></label>
              <label><span>{fa ? "نام خانوادگی" : "Last name"}</span><input value={lastName} onChange={(e) => setLastName(e.target.value)} /></label>
              <label><span>{fa ? "موبایل (اختیاری اگر ایمیل دارید)" : "Mobile (optional if email provided)"}</span><input inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} /></label>
            </div>
            {mode === "signup" && <label className={styles.remember}><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /><span>{fa ? "ورود من روی این دستگاه حفظ شود" : "Keep me signed in on this device"}</span></label>}
            <button disabled={busy || !medicalCouncilCode.trim() || !firstName.trim() || !lastName.trim() || (!email.trim() && !mobile.trim())}>{busy ? (fa ? "در حال بررسی…" : "Checking…") : mode === "bootstrap" ? (fa ? "ساخت حساب تست مالک" : "Create owner test account") : (fa ? "بررسی نظام پزشکی و ثبت‌نام" : "Verify Medical Council & register")}</button>
          </form>
          {mode === "bootstrap" && <p className={styles.warning}>{fa ? "این مسیر فقط برای راه‌اندازی اولیه مالک و با نشست GitHub Admin فعال است؛ در ثبت‌نام عمومی هیچ bypass برای عدم تطابق نظام پزشکی وجود ندارد." : "This path is only for initial owner setup under the GitHub Admin session; public registration has no Medical Council mismatch bypass."}</p>}
        </section>
      )}

      {(message || error) && <div className={error ? styles.error : styles.message} role={error ? "alert" : "status"}>{error || message}</div>}
      <p className={styles.adminLink}>{fa ? "مدیریت سیستم:" : "System admin:"} <Link href="/admin">/admin</Link></p>
    </main>
  );
}
