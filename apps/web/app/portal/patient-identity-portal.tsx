"use client";

import type {
  GlobalPatientAccountSummary,
  PatientIdentityCapabilities,
  PatientPracticeContext,
  PatientVerifiedLegacyLinkSummary,
} from "@glymize/contracts";
import { FormEvent, useEffect, useState } from "react";

import {
  exchangeVerifiedPatientLegacyLink,
  getPatientIdentitySession,
  listVerifiedPatientLegacyLinks,
  loginPatientIdentity,
  logoutPatientIdentity,
  registerPatientIdentity,
} from "../../lib/patient-identity-client";
import {
  clearSelectedPatientPracticeContext,
  listPatientPracticeContexts,
  resolveSelectedPatientPracticeContext,
  selectPatientPracticeContext,
} from "../../lib/patient-practice-context-client";
import { adoptPortalSession } from "../../lib/portal-client";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import PatientCareHub from "./patient-care-hub";
import styles from "./patient-identity-portal.module.css";

type Props = {
  capabilities: PatientIdentityCapabilities;
  legacyPortalEnabled: boolean;
  multiPracticePatientEnabled: boolean;
  onUseLegacy: () => void;
};

export default function PatientIdentityPortal({
  capabilities,
  legacyPortalEnabled,
  multiPracticePatientEnabled,
  onUseLegacy,
}: Props) {
  const { locale } = useGlymizeLocale();
  const fa = locale === "fa";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [nationalId, setNationalId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [account, setAccount] = useState<GlobalPatientAccountSummary | null>(null);
  const [links, setLinks] = useState<PatientVerifiedLegacyLinkSummary[]>([]);
  const [practiceContexts, setPracticeContexts] = useState<PatientPracticeContext[]>([]);
  const [selectedPracticeContextId, setSelectedPracticeContextId] = useState<string | null>(null);
  const [careContextError, setCareContextError] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadPatientHome(nextAccount: GlobalPatientAccountSummary) {
    setAccount(nextAccount);

    if (nextAccount.linkedClinicalRecord) {
      setLinks(await listVerifiedPatientLegacyLinks());
    } else {
      setLinks([]);
    }

    if (!multiPracticePatientEnabled) {
      setPracticeContexts([]);
      setSelectedPracticeContextId(null);
      setCareContextError("");
      return;
    }

    try {
      const contexts = await listPatientPracticeContexts();
      setPracticeContexts(contexts);
      setSelectedPracticeContextId(resolveSelectedPatientPracticeContext(contexts)?.id ?? null);
      setCareContextError("");
    } catch {
      setPracticeContexts([]);
      setSelectedPracticeContextId(null);
      setCareContextError(
        fa
          ? "زمینه‌های مراقبتی فعلاً قابل بازیابی نیستند؛ این خطا هیچ دسترسی درمانی ایجاد نمی‌کند."
          : "Care contexts are temporarily unavailable; this failure does not grant any clinical access.",
      );
    }
  }

  useEffect(() => {
    let active = true;
    void getPatientIdentitySession()
      .then(async (session) => {
        if (!active || !session) return;
        await loadPatientHome(session.account);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => { active = false; };
  }, [multiPracticePatientEnabled]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "register") {
        await registerPatientIdentity({ nationalId, password });
        setMode("login");
        setPassword("");
        setMessage(
          fa
            ? "حساب سراسری به‌صورت بدون لینک ساخته شد. اکنون وارد شوید؛ اتصال پرونده فقط پس از بررسی مطب انجام می‌شود."
            : "Your unlinked global account was created. Sign in now; a practice must separately review any record link.",
        );
      } else {
        const session = await loginPatientIdentity({ nationalId, password, rememberMe });
        await loadPatientHome(session.account);
        setPassword("");
      }
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "PATIENT_IDENTITY_FAILED";
      setError(
        code === "invalid_credentials"
          ? fa ? "کد ملی یا رمز عبور صحیح نیست." : "National ID or password is incorrect."
          : code === "registration_unavailable"
            ? fa ? "ثبت‌نام با این اطلاعات در دسترس نیست." : "Registration is unavailable for these details."
            : code === "rate_limited"
              ? fa ? "تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره امتحان کنید." : "Too many attempts; try again later."
              : code,
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await logoutPatientIdentity();
      clearSelectedPatientPracticeContext();
      setAccount(null);
      setLinks([]);
      setPracticeContexts([]);
      setSelectedPracticeContextId(null);
      setCareContextError("");
    } finally {
      setBusy(false);
    }
  }

  async function choosePracticeContext(context: PatientPracticeContext) {
    if (!context.selectable || !multiPracticePatientEnabled) return;
    setBusy(true);
    setCareContextError("");
    try {
      const selection = await selectPatientPracticeContext(context.id);
      if (selection.grantsClinicalAccess || selection.grantsCrossPracticeAccess) {
        throw new Error("PATIENT_CONTEXT_ACCESS_INVARIANT_FAILED");
      }
      setSelectedPracticeContextId(selection.context.id);
    } catch {
      setCareContextError(
        fa
          ? "انتخاب زمینه مراقبت انجام نشد. هیچ دسترسی درمانی یا بین‌مطب ایجاد نشده است."
          : "Care-context selection failed. No clinical or cross-practice access was granted.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function openPracticePortal(link: PatientVerifiedLegacyLinkSummary) {
    setBusy(true);
    setError("");
    try {
      const portalSession = await exchangeVerifiedPatientLegacyLink(
        link.portalUserId,
        rememberMe,
      );
      adoptPortalSession(portalSession);
      onUseLegacy();
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "PATIENT_PORTAL_EXCHANGE_FAILED";
      setError(
        code === "verified_link_unavailable"
          ? fa ? "لینک تأییدشده دیگر در دسترس نیست؛ فهرست را دوباره بررسی کنید." : "The verified link is no longer available; refresh the account view."
          : code,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <div className={styles.loading}>{fa ? "در حال بازیابی نشست امن…" : "Restoring secure session…"}</div>;
  }

  if (account) {
    return (
      <PatientCareHub
        account={account}
        links={links}
        practiceContexts={practiceContexts}
        selectedPracticeContextId={selectedPracticeContextId}
        careContextError={careContextError}
        legacyPortalEnabled={legacyPortalEnabled}
        busy={busy}
        onLogout={() => void logout()}
        onSelectPracticeContext={(context) => void choosePracticeContext(context)}
        onOpenPractice={(link) => void openPracticePortal(link)}
      />
    );
  }

  return (
    <main className={styles.page} data-patient-surface="identity-entry">
      <section className={styles.signInCard}>
        <div className={styles.eyebrow}>PATIENT IDENTITY v2</div>
        <h1>{mode === "login" ? (fa ? "ورود بیمار" : "Patient sign in") : (fa ? "ساخت حساب سراسری" : "Create global account")}</h1>
        <p className={styles.intro}>
          {fa ? "حساب شما مستقل از یک پزشک یا مطب ساخته می‌شود. پرونده‌های درمانی بدون تأیید جداگانه نمایش داده نمی‌شوند." : "Your account is independent of any one clinician or practice. Clinical records remain unavailable until separately verified."}
        </p>

        {capabilities.selfRegistration ? (
          <div className={styles.modeSwitch}>
            <button type="button" data-active={mode === "login"} onClick={() => setMode("login")}>{fa ? "ورود" : "Sign in"}</button>
            <button type="button" data-active={mode === "register"} onClick={() => setMode("register")}>{fa ? "ثبت‌نام" : "Register"}</button>
          </div>
        ) : null}

        <form onSubmit={(event) => void submit(event)}>
          <label>
            <span>{fa ? "کد ملی" : "National ID"}</span>
            <input inputMode="numeric" autoComplete="username" value={nationalId} onChange={(event) => setNationalId(event.target.value.replace(/\D/g, "").slice(0, 10))} />
          </label>
          <label>
            <span>{fa ? "رمز عبور" : "Password"}</span>
            <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {mode === "login" ? (
            <label className={styles.remember}>
              <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
              <span>{fa ? "مرا به خاطر بسپار" : "Remember me"}</span>
            </label>
          ) : null}
          <button className={styles.primary} type="submit" disabled={busy || nationalId.length !== 10 || password.length < 10}>
            {busy ? (fa ? "در حال بررسی…" : "Checking…") : mode === "login" ? (fa ? "ورود امن" : "Secure sign in") : (fa ? "ساخت حساب بدون لینک" : "Create unlinked account")}
          </button>
        </form>

        {message ? <p className={styles.message} role="status">{message}</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        {legacyPortalEnabled ? (
          <button className={styles.legacy} type="button" onClick={onUseLegacy}>
            {fa ? "ورود با حساب پروندهٔ قدیمی مطب" : "Use an existing practice Portal account"}
          </button>
        ) : null}
        <small className={styles.smsState}>{fa ? "ورود پیامکی فعلاً خاموش است." : "SMS sign-in is currently off."}</small>
      </section>
    </main>
  );
}
