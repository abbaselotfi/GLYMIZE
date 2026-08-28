"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PortalMessage,
  PortalSubmissionSummary,
  PortalThreadSummary,
} from "@glymize/contracts";
import {
  changePortalPassword,
  clearPortalSession,
  createPortalSubmission,
  downloadPortalAttachment,
  getPortalSession,
  listPortalSubmissions,
  listPortalThreadMessages,
  listPortalThreads,
  portalLogin,
  refreshPortalSession,
  sendPortalMessage,
} from "../../lib/portal-client";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./portal.module.css";

type SessionUser = {
  portalUserId: string;
  practiceId: string;
  patientId: string;
  mustChangePassword: boolean;
};

const SUBMISSION_KINDS = ["medications", "labs", "vitals", "note"] as const;
type SubmissionKind = (typeof SUBMISSION_KINDS)[number];

const EMPTY_MEDICATION_ROW = {
  genericName: "",
  doseAmount: "",
  doseUnit: "",
  frequencyPerDay: "",
};
const EMPTY_LAB_ROW = { rawName: "", value: "", unit: "", referenceRange: "" };
const EMPTY_VITALS = {
  weightKg: "",
  heightCm: "",
  systolicBp: "",
  diastolicBp: "",
  pulseBpm: "",
};

export default function PortalClient() {
  const { locale } = useGlymizeLocale();
  const fa = locale === "fa";

  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loginHandle, setLoginHandle] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [tab, setTab] = useState<"intake" | "messages">("intake");
  const [submissions, setSubmissions] = useState<PortalSubmissionSummary[]>([]);
  const [threads, setThreads] = useState<PortalThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [intakeKind, setIntakeKind] = useState<SubmissionKind>("medications");
  const [medicationRows, setMedicationRows] = useState([EMPTY_MEDICATION_ROW]);
  const [labRows, setLabRows] = useState([EMPTY_LAB_ROW]);
  const [vitalsForm, setVitalsForm] = useState(EMPTY_VITALS);
  const [intakeNote, setIntakeNote] = useState("");
  const [composeText, setComposeText] = useState("");
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadSession = useCallback(async () => {
    const user = await getPortalSession();
    setSession(user);
    setReady(true);
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshPortalSession();
      await loadSession();
    })();
  }, [loadSession]);

  const loadSubmissions = useCallback(async () => {
    try {
      const result = await listPortalSubmissions();
      setSubmissions(result.submissions);
    } catch {
      setStatusMessage(
        fa ? "دریافت فهرست ارسالی‌ها ناموفق بود." : "Failed to load submissions.",
      );
    }
  }, [fa]);

  const loadThreads = useCallback(async () => {
    try {
      const result = await listPortalThreads();
      setThreads(result.threads);
    } catch {
      setStatusMessage(
        fa ? "دریافت گفتگوها ناموفق بود." : "Failed to load conversations.",
      );
    }
  }, [fa]);

  useEffect(() => {
    if (!session) return;
    void loadSubmissions();
    void loadThreads();
  }, [session, loadSubmissions, loadThreads]);

  async function handleLogin() {
    setBusy(true);
    setLoginError("");
    try {
      await portalLogin(loginHandle, loginPassword, rememberMe);
      setLoginPassword("");
      await loadSession();
    } catch (reason) {
      const code =
        reason instanceof Error ? reason.message : "PORTAL_LOGIN_FAILED";
      setLoginError(
        code === "rate_limited"
          ? fa
            ? "تلاش بیش از حد. کمی بعد دوباره امتحان کنید."
            : "Too many attempts. Please try again later."
          : fa
            ? "ورود ناموفق بود. اطلاعات را بررسی کنید."
            : "Login failed. Check your credentials.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    clearPortalSession();
    setSession(null);
    setMessages([]);
    setActiveThreadId(null);
    setTab("intake");
  }

  async function handleChangePassword() {
    setBusy(true);
    setStatusMessage("");
    try {
      await changePortalPassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      await loadSession();
      setStatusMessage(
        fa ? "رمز عبور تغییر کرد." : "Password changed successfully.",
      );
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "";
      setStatusMessage(
        code === "password_policy_failed"
          ? fa
            ? "رمز جدید کوتاه است (حداقل ۱۰ کاراکتر)."
            : "New password is too short (minimum 10 characters)."
          : fa
            ? "تغییر رمز عبور ناموفق بود."
            : "Password change failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleIntakeSubmit() {
    setBusy(true);
    setStatusMessage("");
    try {
      const input: Record<string, unknown> = { kind: intakeKind };
      if (intakeKind === "medications") {
        input.medications = medicationRows
          .filter((row) => row.genericName.trim())
          .map((row) => ({
            genericName: row.genericName,
            doseAmount: row.doseAmount ? Number(row.doseAmount) : undefined,
            doseUnit: row.doseUnit || undefined,
            frequencyPerDay: row.frequencyPerDay
              ? Number(row.frequencyPerDay)
              : undefined,
          }));
      } else if (intakeKind === "labs") {
        input.labs = labRows
          .filter((row) => row.rawName.trim())
          .map((row) => ({
            rawName: row.rawName,
            value: row.value ? Number(row.value) : undefined,
            unit: row.unit || undefined,
            referenceRange: row.referenceRange || undefined,
          }));
      } else if (intakeKind === "vitals") {
        const vitals: Record<string, number> = {};
        for (const [field, value] of Object.entries(vitalsForm)) {
          if (value) vitals[field] = Number(value);
        }
        input.vitals = vitals;
      } else {
        input.note = intakeNote;
      }
      await createPortalSubmission(input);
      setStatusMessage(
        fa
          ? "ارسال شد و در انتظار بررسی پزشک است."
          : "Submitted and waiting for physician review.",
      );
      setIntakeNote("");
      setMedicationRows([EMPTY_MEDICATION_ROW]);
      setLabRows([EMPTY_LAB_ROW]);
      setVitalsForm(EMPTY_VITALS);
      await loadSubmissions();
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "";
      setStatusMessage(
        code === "empty_submission"
          ? fa
            ? "حداقل یک مورد وارد کنید."
            : "Enter at least one item."
          : fa
            ? "ارسال ناموفق بود."
            : "Submission failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function openThread(threadId: string) {
    setActiveThreadId(threadId);
    setMessages([]);
    try {
      const page = await listPortalThreadMessages(threadId);
      setMessages(page.messages);
    } catch {
      setStatusMessage(
        fa ? "دریافت پیام‌ها ناموفق بود." : "Failed to load messages.",
      );
    }
  }

  async function handleSend() {
    if (!activeThreadId) return;
    setBusy(true);
    try {
      const result = await sendPortalMessage(
        activeThreadId,
        composeText,
        composeFiles,
      );
      setMessages((current) => [...current, result.message]);
      setComposeText("");
      setComposeFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      void loadThreads();
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "";
      setStatusMessage(
        code === "PORTAL_MEDIA_NOT_CONFIGURED"
          ? fa
            ? "ارسال رسانه در این محیط فعال نیست."
            : "Media upload is not available in this environment."
          : code === "unsupported_media_type"
            ? fa
              ? "نوع فایل مجاز نیست (فقط تصویر یا ویدیو)."
              : "Only images or videos are allowed."
            : code === "media_size_rejected"
              ? fa
                ? "حجم فایل بیش از حد مجاز است (حداکثر ۲۵ مگابایت)."
                : "File is too large (max 25 MB)."
              : fa
                ? "ارسال پیام ناموفق بود."
                : "Failed to send the message.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(attachmentId: string) {
    try {
      const blob = await downloadPortalAttachment(attachmentId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `attachment-${attachmentId.slice(0, 8)}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setStatusMessage(fa ? "دانلود ناموفق بود." : "Download failed.");
    }
  }

  if (!ready) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <p className={styles.muted}>{fa ? "در حال بارگذاری…" : "Loading…"}</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className={styles.page} dir={fa ? "rtl" : "ltr"}>
        <div className={styles.card}>
          <h1 className={styles.title}>
            GLYMIZE — {fa ? "پرتال بیمار" : "Patient Portal"}
          </h1>
          <label className={styles.label}>
            {fa ? "موبایل یا ایمیل" : "Mobile or email"}
            <input
              className={styles.input}
              value={loginHandle}
              onChange={(event) => setLoginHandle(event.target.value)}
              autoComplete="username"
            />
          </label>
          <label className={styles.label}>
            {fa ? "رمز عبور" : "Password"}
            <input
              className={styles.input}
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span>{fa ? "مرا به خاطر بسپار" : "Remember me"}</span>
          </label>
          {loginError ? <p className={styles.error}>{loginError}</p> : null}
          <button
            className={styles.primary}
            disabled={busy || !loginHandle || !loginPassword}
            onClick={() => void handleLogin()}
          >
            {fa ? "ورود" : "Sign in"}
          </button>
        </div>
      </main>
    );
  }

  if (session.mustChangePassword) {
    return (
      <main className={styles.page} dir={fa ? "rtl" : "ltr"}>
        <div className={styles.card}>
          <h1 className={styles.title}>
            {fa ? "تنظیم رمز عبور جدید" : "Set a new password"}
          </h1>
          <p className={styles.hint}>
            {fa
              ? "برای امنیت حساب، ابتدا رمز عبور موقت را تغییر دهید."
              : "For account security, change the temporary password first."}
          </p>
          <label className={styles.label}>
            {fa ? "رمز عبور فعلی" : "Current password"}
            <input
              className={styles.input}
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label className={styles.label}>
            {fa ? "رمز عبور جدید" : "New password"}
            <input
              className={styles.input}
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          {statusMessage ? <p className={styles.status}>{statusMessage}</p> : null}
          <button
            className={styles.primary}
            disabled={busy || !currentPassword || !newPassword}
            onClick={() => void handleChangePassword()}
          >
            {fa ? "ذخیره رمز جدید" : "Save new password"}
          </button>
          <button className={styles.ghost} onClick={() => void handleLogout()}>
            {fa ? "خروج" : "Sign out"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page} dir={fa ? "rtl" : "ltr"}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          GLYMIZE — {fa ? "پرتال بیمار" : "Patient Portal"}
        </h1>
        <button className={styles.ghost} onClick={() => void handleLogout()}>
          {fa ? "خروج" : "Sign out"}
        </button>
      </header>
      {statusMessage ? <p className={styles.status}>{statusMessage}</p> : null}
      <nav className={styles.tabs}>
        <button
          className={tab === "intake" ? styles.tabActive : styles.tab}
          onClick={() => setTab("intake")}
        >
          {fa ? "ثبت اطلاعات" : "Intake"}
        </button>
        <button
          className={tab === "messages" ? styles.tabActive : styles.tab}
          onClick={() => setTab("messages")}
        >
          {fa ? "گفتگو با پزشک" : "Messages"}
        </button>
      </nav>

      {tab === "intake" ? (
        <section className={styles.card}>
          <div className={styles.kindRow}>
            {SUBMISSION_KINDS.map((kind) => (
              <button
                key={kind}
                className={intakeKind === kind ? styles.tabActive : styles.tab}
                onClick={() => setIntakeKind(kind)}
              >
                {kind === "medications"
                  ? fa ? "داروها" : "Medications"
                  : kind === "labs"
                    ? fa ? "آزمایش‌ها" : "Labs"
                    : kind === "vitals"
                      ? fa ? "علائم حیاتی" : "Vitals"
                      : fa ? "یادداشت" : "Note"}
              </button>
            ))}
          </div>

          {intakeKind === "medications"
            ? medicationRows.map((row, index) => (
                <div key={index} className={styles.rowGrid}>
                  <input
                    className={styles.input}
                    placeholder={fa ? "نام دارو" : "Medication name"}
                    value={row.genericName}
                    onChange={(event) =>
                      setMedicationRows((rows) =>
                        rows.map((item, i) =>
                          i === index
                            ? { ...item, genericName: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <input
                    className={styles.input}
                    placeholder={fa ? "دوز" : "Dose"}
                    value={row.doseAmount}
                    inputMode="decimal"
                    onChange={(event) =>
                      setMedicationRows((rows) =>
                        rows.map((item, i) =>
                          i === index
                            ? { ...item, doseAmount: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <input
                    className={styles.input}
                    placeholder={fa ? "واحد" : "Unit"}
                    value={row.doseUnit}
                    onChange={(event) =>
                      setMedicationRows((rows) =>
                        rows.map((item, i) =>
                          i === index
                            ? { ...item, doseUnit: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <input
                    className={styles.input}
                    placeholder={fa ? "دفعات در روز" : "Times per day"}
                    value={row.frequencyPerDay}
                    inputMode="numeric"
                    onChange={(event) =>
                      setMedicationRows((rows) =>
                        rows.map((item, i) =>
                          i === index
                            ? { ...item, frequencyPerDay: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
              ))
            : null}

          {intakeKind === "labs"
            ? labRows.map((row, index) => (
                <div key={index} className={styles.rowGrid}>
                  <input
                    className={styles.input}
                    placeholder={fa ? "نام آزمایش" : "Test name"}
                    value={row.rawName}
                    onChange={(event) =>
                      setLabRows((rows) =>
                        rows.map((item, i) =>
                          i === index
                            ? { ...item, rawName: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <input
                    className={styles.input}
                    placeholder={fa ? "مقدار" : "Value"}
                    value={row.value}
                    inputMode="decimal"
                    onChange={(event) =>
                      setLabRows((rows) =>
                        rows.map((item, i) =>
                          i === index
                            ? { ...item, value: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <input
                    className={styles.input}
                    placeholder={fa ? "واحد" : "Unit"}
                    value={row.unit}
                    onChange={(event) =>
                      setLabRows((rows) =>
                        rows.map((item, i) =>
                          i === index
                            ? { ...item, unit: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <input
                    className={styles.input}
                    placeholder={fa ? "محدوده مرجع" : "Reference range"}
                    value={row.referenceRange}
                    onChange={(event) =>
                      setLabRows((rows) =>
                        rows.map((item, i) =>
                          i === index
                            ? { ...item, referenceRange: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
              ))
            : null}

          {intakeKind === "vitals" ? (
            <div className={styles.rowGrid}>
              {(
                [
                  ["weightKg", "وزن (kg)", "Weight (kg)"],
                  ["heightCm", "قد (cm)", "Height (cm)"],
                  ["systolicBp", "سیستول", "Systolic BP"],
                  ["diastolicBp", "دیاستول", "Diastolic BP"],
                  ["pulseBpm", "نبض", "Pulse"],
                ] as const
              ).map(([field, faLabel, enLabel]) => (
                <label key={field} className={styles.label}>
                  {fa ? faLabel : enLabel}
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    value={vitalsForm[field]}
                    onChange={(event) =>
                      setVitalsForm((form) => ({
                        ...form,
                        [field]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          ) : null}

          {intakeKind === "note" ? (
            <textarea
              className={styles.textarea}
              rows={5}
              value={intakeNote}
              onChange={(event) => setIntakeNote(event.target.value)}
              placeholder={fa ? "توضیح برای پزشک" : "Note for your physician"}
            />
          ) : null}

          {intakeKind === "medications" || intakeKind === "labs" ? (
            <button
              className={styles.ghost}
              onClick={() =>
                intakeKind === "medications"
                  ? setMedicationRows((rows) => [...rows, EMPTY_MEDICATION_ROW])
                  : setLabRows((rows) => [...rows, EMPTY_LAB_ROW])
              }
            >
              + {fa ? "ردیف جدید" : "Add row"}
            </button>
          ) : null}

          <button
            className={styles.primary}
            disabled={busy}
            onClick={() => void handleIntakeSubmit()}
          >
            {fa ? "ارسال برای پزشک" : "Submit to physician"}
          </button>
          <p className={styles.hint}>
            {fa
              ? "داده‌های شما به‌عنوان «گزارش بیمار» ثبت می‌شود و پس از تأیید پزشک وارد پرونده بالینی می‌شود."
              : "Your data is recorded as patient-reported and enters the clinical record only after physician confirmation."}
          </p>

          <h2 className={styles.subtitle}>
            {fa ? "ارسالی‌های قبلی" : "Previous submissions"}
          </h2>
          <ul className={styles.list}>
            {submissions.map((item) => (
              <li key={item.id} className={styles.listItem}>
                <span>{item.kind}</span>
                <span className={styles.muted}>{item.status}</span>
                <span className={styles.muted}>
                  {new Date(item.createdAt).toLocaleString(fa ? "fa-IR" : "en-US")}
                </span>
              </li>
            ))}
            {submissions.length === 0 ? (
              <li className={styles.muted}>
                {fa ? "چیزی ثبت نشده است." : "Nothing submitted yet."}
              </li>
            ) : null}
          </ul>
        </section>
      ) : (

        <section className={styles.card}>
          {threads.length === 0 ? (
            <p className={styles.muted}>
              {fa
                ? "هنوز گفتگویی برای شما ایجاد نشده است. پزشک شما گفتگو را آغاز می‌کند."
                : "No conversation yet. Your physician will start one."}
            </p>
          ) : (
            <div className={styles.threadLayout}>
              <ul className={styles.threadList}>
                {threads.map((thread) => (
                  <li key={thread.id}>
                    <button
                      className={
                        activeThreadId === thread.id
                          ? styles.tabActive
                          : styles.tab
                      }
                      onClick={() => void openThread(thread.id)}
                    >
                      {fa ? "گفتگو" : "Chat"} ·{" "}
                      {new Date(thread.lastMessageAt).toLocaleDateString(
                        fa ? "fa-IR" : "en-US",
                      )}
                      {" · "}
                      {thread.status === "open"
                        ? fa ? "باز" : "open"
                        : fa ? "بسته" : "closed"}
                    </button>
                  </li>
                ))}
              </ul>
              <div className={styles.threadBody}>
                <div className={styles.messages}>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={
                        message.senderRole === "patient"
                          ? styles.bubbleMine
                          : styles.bubbleOther
                      }
                    >
                      <p className={styles.bubbleText}>{message.body}</p>
                      {message.attachments.map((attachment) => (
                        <button
                          key={attachment.id}
                          className={styles.attachment}
                          onClick={() => void handleDownload(attachment.id)}
                        >
                          {attachment.mediaKind === "image"
                            ? fa ? "تصویر" : "Photo"
                            : fa ? "ویدیو" : "Video"}{" "}
                          · {Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB
                        </button>
                      ))}
                    </div>
                  ))}
                  {messages.length === 0 ? (
                    <p className={styles.muted}>
                      {fa ? "پیامی نیست." : "No messages yet."}
                    </p>
                  ) : null}
                </div>
                {activeThreadId ? (
                  <div className={styles.compose}>
                    <textarea
                      className={styles.textarea}
                      rows={3}
                      value={composeText}
                      onChange={(event) => setComposeText(event.target.value)}
                      placeholder={
                        fa ? "پیام خود را بنویسید…" : "Write a message…"
                      }
                    />
                    <input
                      ref={fileInputRef}
                      className={styles.input}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/webm,video/quicktime"
                      onChange={(event) =>
                        setComposeFiles(
                          Array.from(event.target.files ?? []).slice(0, 4),
                        )
                      }
                    />
                    <button
                      className={styles.primary}
                      disabled={busy || (!composeText && composeFiles.length === 0)}
                      onClick={() => void handleSend()}
                    >
                      {fa ? "ارسال" : "Send"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}