"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  type AdminCommunicationsConfig,
  deleteAdminEmailApiKey,
  deleteAdminSmsApiKey,
  getAdminCommunicationsConfig,
  sendAdminTestEmail,
  sendAdminTestSms,
  setAdminEmailApiKey,
  setAdminSmsApiKey,
  testAdminSmsConnection,
  updateAdminCommunicationsConfig,
} from "../../../lib/admin-auth";
import styles from "./communications.module.css";

type BusyAction =
  | "load" | "save" | "sms-secret" | "sms-test" | "sms-send"
  | "email-secret" | "email-send" | "sms-delete" | "email-delete" | null;

function Toggle({
  checked,
  disabled,
  onChange,
  label,
  detail,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  label: string;
  detail: string;
}) {
  return (
    <label className={`${styles.toggleRow} ${disabled ? styles.disabled : ""}`}>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export default function CommunicationsAdminPage() {
  const [config, setConfig] = useState<AdminCommunicationsConfig | null>(null);
  const [busy, setBusy] = useState<BusyAction>("load");
  const [message, setMessage] = useState("در حال دریافت تنظیمات ارتباطات…");
  const [error, setError] = useState("");
  const [smsApiKey, setSmsApiKey] = useState("");
  const [emailApiKey, setEmailApiKey] = useState("");
  const [testMobile, setTestMobile] = useState("");
  const [testEmail, setTestEmail] = useState("");

  async function refresh() {
    setBusy("load");
    setError("");
    try {
      const next = await getAdminCommunicationsConfig();
      setConfig(next);
      setMessage("تنظیمات امن ارتباطات دریافت شد.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "communications_config_read_failed");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => { void refresh(); }, []);

  function updateSms<Key extends keyof AdminCommunicationsConfig["sms"]>(key: Key, value: AdminCommunicationsConfig["sms"][Key]) {
    setConfig((current) => current ? { ...current, sms: { ...current.sms, [key]: value } } : current);
  }

  function updateEmail<Key extends keyof AdminCommunicationsConfig["email"]>(key: Key, value: AdminCommunicationsConfig["email"][Key]) {
    setConfig((current) => current ? { ...current, email: { ...current.email, [key]: value } } : current);
  }

  async function saveConfig() {
    if (!config) return;
    setBusy("save");
    setError("");
    try {
      const next = await updateAdminCommunicationsConfig({
        sms: {
          enabled: config.sms.enabled,
          registrationOtp: config.sms.registrationOtp,
          loginOtp: config.sms.loginOtp,
          passwordReset: config.sms.passwordReset,
          assistantInvitation: config.sms.assistantInvitation,
          lineNumber: config.sms.lineNumber,
          otpTemplateId: config.sms.otpTemplateId,
          otpParameterName: config.sms.otpParameterName,
        },
        email: {
          enabled: config.email.enabled,
          registrationVerification: config.email.registrationVerification,
          passwordReset: config.email.passwordReset,
          assistantInvitation: config.email.assistantInvitation,
          fromAddress: config.email.fromAddress,
        },
      });
      setConfig(next);
      setMessage("تنظیمات ذخیره شد. نظام پزشکی همچنان مرجع اصلی و اجباری احراز پزشک است.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "communications_config_update_failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveSmsSecret(event: FormEvent) {
    event.preventDefault();
    if (!smsApiKey.trim()) return;
    setBusy("sms-secret");
    setError("");
    try {
      await setAdminSmsApiKey(smsApiKey.trim());
      setSmsApiKey("");
      await refresh();
      setMessage("API Key جدید SMS.ir رمزگذاری و ذخیره شد؛ مقدار کلید به مرورگر برگردانده نمی‌شود.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "sms_api_key_save_failed");
      setBusy(null);
    }
  }

  async function saveEmailSecret(event: FormEvent) {
    event.preventDefault();
    if (!emailApiKey.trim()) return;
    setBusy("email-secret");
    setError("");
    try {
      await setAdminEmailApiKey(emailApiKey.trim());
      setEmailApiKey("");
      await refresh();
      setMessage("API Key جدید Resend رمزگذاری و ذخیره شد.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "email_api_key_save_failed");
      setBusy(null);
    }
  }

  async function testSmsApi() {
    setBusy("sms-test");
    setError("");
    try {
      const result = await testAdminSmsConnection();
      setMessage(`SMS.ir متصل است · HTTP ${result.httpStatus ?? 200} · ${result.latencyMs ?? "—"}ms · اعتبار: ${String(result.credit ?? "—")}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "sms_connection_test_failed");
    } finally {
      setBusy(null);
    }
  }

  async function sendSms() {
    if (!testMobile.trim()) return;
    setBusy("sms-send");
    setError("");
    try {
      const result = await sendAdminTestSms(testMobile.trim());
      setMessage(`پیامک آزمایشی برای ${result.mobile ?? testMobile} ارسال شد.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "sms_test_send_failed");
    } finally {
      setBusy(null);
    }
  }

  async function sendEmail() {
    if (!testEmail.trim()) return;
    setBusy("email-send");
    setError("");
    try {
      const result = await sendAdminTestEmail(testEmail.trim());
      setMessage(`ایمیل آزمایشی ارسال شد${result.id ? ` · ${result.id}` : ""}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "email_test_send_failed");
    } finally {
      setBusy(null);
    }
  }

  if (!config) {
    return (
      <main className={styles.page}>
        <section className={styles.hero}><h1>ارتباطات و احراز هویت</h1><p>{error || message}</p></section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span>GLYMIZE Security & Communications</span>
          <h1>ارتباطات و احراز هویت</h1>
          <p>نظام پزشکی مرجع اول و اجباری هویت پزشک است. SMS و Email فقط لایه‌های قابل‌فعال‌سازی برای مالکیت راه ارتباطی و امنیت بیشتر هستند.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={busy !== null}>↻ بازخوانی</button>
      </header>

      <div className={styles.notice} data-error={Boolean(error)}>
        {error || message}
      </div>

      <section className={styles.identityCard}>
        <div className={styles.cardHeading}>
          <div><span className={styles.badge}>Priority 1</span><h2>نظام پزشکی / IRIMC</h2></div>
          <strong className={styles.required}>REQUIRED</strong>
        </div>
        <div className={styles.identityGrid}>
          <div><small>Verification</small><b>Exact match</b></div>
          <div><small>Mismatch bypass</small><b>غیرمجاز</b></div>
          <div><small>Contact services OFF</small><b>ثبت‌نام Block نمی‌شود</b></div>
        </div>
      </section>

      <div className={styles.providers}>
        <section className={styles.card}>
          <div className={styles.cardHeading}>
            <div><span className={styles.badge}>SMS Provider</span><h2>SMS.ir</h2></div>
            <span className={config.sms.apiKeyConfigured ? styles.connected : styles.missing}>
              {config.sms.apiKeyConfigured ? "API configured" : "API missing"}
            </span>
          </div>

          <Toggle checked={config.sms.enabled} onChange={(value) => updateSms("enabled", value)} label="سرویس پیامک" detail="Global ON/OFF؛ خاموش بودن سرویس، IRIMC یا ثبت‌نام پایه را مختل نمی‌کند." />
          <Toggle checked={config.sms.registrationOtp} disabled={!config.sms.enabled} onChange={(value) => updateSms("registrationOtp", value)} label="OTP ثبت‌نام" detail="فقط پس از Exact Match نظام پزشکی." />
          <Toggle checked={config.sms.loginOtp} disabled={!config.sms.enabled} onChange={(value) => updateSms("loginOtp", value)} label="OTP ورود" detail="برای فاز احراز ورود؛ مستقل از تأیید نظام پزشکی." />
          <Toggle checked={config.sms.passwordReset} disabled={!config.sms.enabled} onChange={(value) => updateSms("passwordReset", value)} label="بازیابی رمز با SMS" detail="قابل فعال/غیرفعال‌سازی مستقل." />
          <Toggle checked={config.sms.assistantInvitation} disabled={!config.sms.enabled} onChange={(value) => updateSms("assistantInvitation", value)} label="دعوت Assistant" detail="برای دعوت دستیار توسط پزشک." />

          <div className={styles.fields}>
            <label><span>شماره خط (اختیاری)</span><input value={config.sms.lineNumber} onChange={(e) => updateSms("lineNumber", e.target.value)} placeholder="3000…" inputMode="numeric" /></label>
            <label><span>Template ID برای OTP</span><input value={config.sms.otpTemplateId ?? ""} onChange={(e) => updateSms("otpTemplateId", e.target.value ? Number(e.target.value) : undefined)} placeholder="مثلاً 12345" inputMode="numeric" /></label>
            <label><span>نام پارامتر Template</span><input value={config.sms.otpParameterName} onChange={(e) => updateSms("otpParameterName", e.target.value)} placeholder="Code" /></label>
          </div>

          <form className={styles.secretBox} onSubmit={saveSmsSecret}>
            <label><span>SMS.ir API Key</span><input type="password" autoComplete="new-password" value={smsApiKey} onChange={(e) => setSmsApiKey(e.target.value)} placeholder={config.sms.apiKeyConfigured ? "••••••••••••  برای تغییر، کلید جدید را وارد کنید" : "API Key جدید"} /></label>
            <button type="submit" disabled={busy !== null || !smsApiKey.trim()}>{busy === "sms-secret" ? "در حال ذخیره…" : "ذخیره امن API Key"}</button>
          </form>

          <div className={styles.testRow}>
            <button type="button" onClick={() => void testSmsApi()} disabled={busy !== null || !config.sms.apiKeyConfigured}>تست اتصال API / اعتبار</button>
            <button className={styles.danger} type="button" disabled={busy !== null || !config.sms.apiKeyConfigured} onClick={async () => { setBusy("sms-delete"); try { await deleteAdminSmsApiKey(); await refresh(); setMessage("API Key پیامک حذف شد."); } catch (reason) { setError(reason instanceof Error ? reason.message : "sms_api_key_delete_failed"); setBusy(null); } }}>حذف API Key</button>
          </div>
          <div className={styles.inlineTest}>
            <input value={testMobile} onChange={(e) => setTestMobile(e.target.value)} placeholder="09xxxxxxxxx" inputMode="tel" />
            <button type="button" onClick={() => void sendSms()} disabled={busy !== null || !config.sms.apiKeyConfigured || !config.sms.otpTemplateId || !testMobile.trim()}>ارسال SMS آزمایشی</button>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeading}>
            <div><span className={styles.badge}>Email Provider</span><h2>Resend</h2></div>
            <span className={config.email.apiKeyConfigured ? styles.connected : styles.missing}>
              {config.email.apiKeyConfigured ? "API configured" : "API missing"}
            </span>
          </div>

          <Toggle checked={config.email.enabled} onChange={(value) => updateEmail("enabled", value)} label="سرویس ایمیل" detail="Global ON/OFF؛ خاموش بودن آن ثبت‌نام مبتنی بر IRIMC را Block نمی‌کند." />
          <Toggle checked={config.email.registrationVerification} disabled={!config.email.enabled} onChange={(value) => updateEmail("registrationVerification", value)} label="تأیید ایمیل در ثبت‌نام" detail="پس از موفقیت نظام پزشکی، در صورت فعال بودن." />
          <Toggle checked={config.email.passwordReset} disabled={!config.email.enabled} onChange={(value) => updateEmail("passwordReset", value)} label="بازیابی رمز با Email" detail="مسیر مستقل بازیابی رمز." />
          <Toggle checked={config.email.assistantInvitation} disabled={!config.email.enabled} onChange={(value) => updateEmail("assistantInvitation", value)} label="دعوت Assistant" detail="دعوت امن دستیار از طریق ایمیل." />

          <div className={styles.fields}>
            <label className={styles.full}><span>From address</span><input value={config.email.fromAddress} onChange={(e) => updateEmail("fromAddress", e.target.value)} placeholder="GLYMIZE <info@glymize.ir>" /></label>
          </div>

          <form className={styles.secretBox} onSubmit={saveEmailSecret}>
            <label><span>Resend API Key</span><input type="password" autoComplete="new-password" value={emailApiKey} onChange={(e) => setEmailApiKey(e.target.value)} placeholder={config.email.apiKeyConfigured ? "••••••••••••  برای تغییر، کلید جدید را وارد کنید" : "re_…"} /></label>
            <button type="submit" disabled={busy !== null || !emailApiKey.trim()}>{busy === "email-secret" ? "در حال ذخیره…" : "ذخیره امن API Key"}</button>
          </form>

          <div className={styles.testRow}>
            <span className={styles.testHint}>تست واقعی Email با ارسال پیام انجام می‌شود.</span>
            <button className={styles.danger} type="button" disabled={busy !== null || !config.email.apiKeyConfigured} onClick={async () => { setBusy("email-delete"); try { await deleteAdminEmailApiKey(); await refresh(); setMessage("API Key ایمیل حذف شد."); } catch (reason) { setError(reason instanceof Error ? reason.message : "email_api_key_delete_failed"); setBusy(null); } }}>حذف API Key</button>
          </div>
          <div className={styles.inlineTest}>
            <input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="doctor@example.com" inputMode="email" />
            <button type="button" onClick={() => void sendEmail()} disabled={busy !== null || !config.email.apiKeyConfigured || !testEmail.trim()}>ارسال Email آزمایشی</button>
          </div>
        </section>
      </div>

      <section className={styles.policyCard}>
        <div><span>Effective registration policy</span><strong>IRIMC Exact Match</strong></div>
        <div><span>SMS required</span><strong>{config.effectiveRegistration.smsRequired ? "YES" : "NO"}</strong></div>
        <div><span>Email required</span><strong>{config.effectiveRegistration.emailRequired ? "YES" : "NO"}</strong></div>
        <div><span>Contact verification</span><strong>{config.effectiveRegistration.contactVerificationRequired ? "REQUIRED" : "NOT REQUIRED"}</strong></div>
      </section>

      <div className={styles.saveBar}>
        <p>API Keyها داخل Catalog، GitHub یا localStorage ذخیره نمی‌شوند.</p>
        <button type="button" onClick={() => void saveConfig()} disabled={busy !== null}>{busy === "save" ? "در حال ذخیره…" : "ذخیره تنظیمات"}</button>
      </div>
    </main>
  );
}
