"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PortalMessage, PortalThreadSummary } from "@glymize/contracts";
import { runtimeFetch } from "../../lib/runtime-client";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./portal-review.module.css";

type AdminSubmission = {
  id: string;
  portalUserId: string;
  patientId: string;
  kind: string;
  status: string;
  createdAt: string;
  reviewedAt?: string;
  encounterId?: string;
  payload: Record<string, unknown> | null;
};

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await runtimeFetch(path, init);
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => null) as Record<string, unknown> | null;
    throw new Error(String(body?.error ?? "PORTAL_ADMIN_FAILED"));
  }
  return response.json() as Promise<T>;
}

function adminError(reason: unknown, fa: boolean) {
  const code = reason instanceof Error ? reason.message : "";
  if (code === "physician_authority_required") {
    return fa
      ? "این عمل فقط با اختیار پزشک مجاز است."
      : "This action requires physician authority.";
  }
  if (code === "PORTAL_MEDIA_NOT_CONFIGURED") {
    return fa
      ? "ارسال رسانه در این محیط فعال نیست."
      : "Media upload is not available in this environment.";
  }
  if (code === "auth_required" || code === "permission_denied") {
    return fa
      ? "دسترسی لازم را ندارید."
      : "You do not have the required access.";
  }
  return fa ? "عملیات ناموفق بود." : "The operation failed.";
}

export default function PortalReviewClient() {
  const { locale } = useGlymizeLocale();
  const fa = locale === "fa";

  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [threads, setThreads] = useState<PortalThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [accountPatientId, setAccountPatientId] = useState("");
  const [accountLogin, setAccountLogin] = useState("");
  const [accountTempPassword, setAccountTempPassword] = useState("");
  const [threadPatientId, setThreadPatientId] = useState("");
  const [threadPhysicianId, setThreadPhysicianId] = useState("");
  const [encounterLinks, setEncounterLinks] = useState<
    Record<string, string>
  >({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadSubmissions = useCallback(async () => {
    try {
      const query = statusFilter
        ? `?status=${encodeURIComponent(statusFilter)}`
        : "";
      const result = await adminJson<{ submissions: AdminSubmission[] }>(
        `/v1/portal/admin/submissions${query}`,
      );
      setSubmissions(result.submissions);
    } catch (reason) {
      setStatus(adminError(reason, fa));
    }
  }, [fa, statusFilter]);

  const loadThreads = useCallback(async () => {
    try {
      const result = await adminJson<{ threads: PortalThreadSummary[] }>(
        "/v1/portal/admin/threads",
      );
      setThreads(result.threads);
    } catch (reason) {
      setStatus(adminError(reason, fa));
    }
  }, [fa]);

  useEffect(() => {
    void loadSubmissions();
    void loadThreads();
  }, [loadSubmissions, loadThreads]);

  async function updateSubmission(id: string, target: string) {
    setBusy(true);
    setStatus("");
    try {
      const encounterId = encounterLinks[id]?.trim() || undefined;
      await adminJson(
        `/v1/portal/admin/submissions/${encodeURIComponent(id)}/status`,
        {
          method: "POST",
          body: JSON.stringify({
            status: target,
            ...(encounterId ? { encounterId } : {}),
          }),
        },
      );
      setStatus(fa ? "وضعیت به‌روزرسانی شد." : "Status updated.");
      await loadSubmissions();
    } catch (reason) {
      setStatus(adminError(reason, fa));
    } finally {
      setBusy(false);
    }
  }

  async function openThread(threadId: string) {
    setActiveThreadId(threadId);
    setMessages([]);
    try {
      const result = await adminJson<{ messages: PortalMessage[] }>(
        `/v1/portal/admin/threads/${encodeURIComponent(threadId)}/messages`,
      );
      setMessages(result.messages);
    } catch (reason) {
      setStatus(adminError(reason, fa));
    }
  }

  async function handleReply() {
    if (!activeThreadId) return;
    setBusy(true);
    setStatus("");
    try {
      const path = `/v1/portal/admin/threads/${encodeURIComponent(activeThreadId)}/messages`;
      let response: Response;
      if (replyFiles.length > 0) {
        const form = new FormData();
        form.append("payload", JSON.stringify({ body: replyText }));
        for (const file of replyFiles) form.append("files", file);
        response = await runtimeFetch(path, { method: "POST", body: form });
      } else {
        response = await runtimeFetch(path, {
          method: "POST",
          body: JSON.stringify({ body: replyText }),
        });
      }
      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => null) as Record<string, unknown> | null;
        throw new Error(String(body?.error ?? "PORTAL_ADMIN_FAILED"));
      }
      const result = await response.json() as { message: PortalMessage };
      setMessages((current) => [...current, result.message]);
      setReplyText("");
      setReplyFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      void loadThreads();
    } catch (reason) {
      setStatus(adminError(reason, fa));
    } finally {
      setBusy(false);
    }
  }

  async function downloadAttachment(attachmentId: string) {
    try {
      const response = await runtimeFetch(
        `/v1/portal/admin/attachments/${encodeURIComponent(attachmentId)}`,
      );
      if (!response.ok) throw new Error("download_failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `attachment-${attachmentId.slice(0, 8)}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setStatus(fa ? "دانلود ناموفق بود." : "Download failed.");
    }
  }

  async function handleCreateAccount() {
    setBusy(true);
    setStatus("");
    try {
      await adminJson("/v1/portal/admin/accounts", {
        method: "POST",
        body: JSON.stringify({
          patientId: accountPatientId,
          login: accountLogin,
          tempPassword: accountTempPassword,
        }),
      });
      setStatus(
        fa
          ? "حساب پرتال بیمار ساخته شد. رمز موقت را به بیمار بدهید."
          : "Patient portal account created. Share the temporary password securely.",
      );
      setAccountPatientId("");
      setAccountLogin("");
      setAccountTempPassword("");
    } catch (reason) {
      setStatus(adminError(reason, fa));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateThread() {
    setBusy(true);
    setStatus("");
    try {
      await adminJson("/v1/portal/admin/threads", {
        method: "POST",
        body: JSON.stringify({
          patientId: threadPatientId,
          ...(threadPhysicianId.trim()
            ? { physicianId: threadPhysicianId.trim() }
            : {}),
        }),
      });
      setStatus(fa ? "گفتگو ایجاد شد." : "Conversation created.");
      setThreadPatientId("");
      setThreadPhysicianId("");
      await loadThreads();
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "";
      setStatus(
        code === "PORTAL_ACCOUNT_REQUIRED"
          ? fa
            ? "ابتدا برای این بیمار حساب پرتال بسازید."
            : "Create a portal account for this patient first."
          : adminError(reason, fa),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page} dir={fa ? "rtl" : "ltr"}>
      <h1 className={styles.title}>
        GLYMIZE — {fa ? "بازبینی پرتال بیمار" : "Patient Portal Review"}
      </h1>
      {status ? <p className={styles.status}>{status}</p> : null}

      <section className={styles.card}>
        <h2 className={styles.subtitle}>
          {fa ? "ارسالی‌های بیماران" : "Patient submissions"}
        </h2>
        <div className={styles.filterRow}>
          {["", "submitted", "acknowledged", "reviewed", "archived"].map(
            (value) => (
              <button
                key={value || "all"}
                className={statusFilter === value ? styles.tabActive : styles.tab}
                onClick={() => setStatusFilter(value)}
              >
                {value === ""
                  ? fa ? "همه" : "All"
                  : value}
              </button>
            ),
          )}
          <button className={styles.ghost} onClick={() => void loadSubmissions()}>
            {fa ? "به‌روزرسانی" : "Refresh"}
          </button>
        </div>
        <ul className={styles.list}>
          {submissions.map((item) => (
            <li key={item.id} className={styles.listItem}>
              <div className={styles.submissionHead}>
                <strong>{item.kind}</strong>
                <span className={styles.muted}>{item.status}</span>
                <span className={styles.muted}>
                  {new Date(item.createdAt).toLocaleString(fa ? "fa-IR" : "en-US")}
                </span>
              </div>
              <pre className={styles.payload}>
                {item.payload ? JSON.stringify(item.payload, null, 2) : "—"}
              </pre>
              <div className={styles.actionRow}>
                <input
                  className={styles.input}
                  placeholder={fa ? "شناسه ویزیت (اختیاری)" : "Encounter ID (optional)"}
                  value={encounterLinks[item.id] ?? ""}
                  onChange={(event) =>
                    setEncounterLinks((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))
                  }
                />
                <button
                  className={styles.ghost}
                  disabled={busy}
                  onClick={() => void updateSubmission(item.id, "acknowledged")}
                >
                  {fa ? "دریافت شد" : "Acknowledge"}
                </button>
                <button
                  className={styles.primary}
                  disabled={busy}
                  onClick={() => void updateSubmission(item.id, "reviewed")}
                >
                  {fa ? "بررسی شد" : "Mark reviewed"}
                </button>
                <button
                  className={styles.ghost}
                  disabled={busy}
                  onClick={() => void updateSubmission(item.id, "archived")}
                >
                  {fa ? "بایگانی" : "Archive"}
                </button>
              </div>
            </li>
          ))}
          {submissions.length === 0 ? (
            <li className={styles.muted}>
              {fa ? "موردی نیست." : "Nothing here yet."}
            </li>
          ) : null}
        </ul>
      </section>

      <section className={styles.card}>
        <h2 className={styles.subtitle}>
          {fa ? "گفتگو با بیماران" : "Patient conversations"}
        </h2>
        <div className={styles.threadLayout}>
          <div className={styles.threadCol}>
            <ul className={styles.threadList}>
              {threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    className={
                      activeThreadId === thread.id ? styles.tabActive : styles.tab
                    }
                    onClick={() => void openThread(thread.id)}
                  >
                    {thread.patientId?.slice(0, 8) ?? ""}… ·{" "}
                    {new Date(thread.lastMessageAt).toLocaleDateString(
                      fa ? "fa-IR" : "en-US",
                    )}
                  </button>
                </li>
              ))}
              {threads.length === 0 ? (
                <li className={styles.muted}>
                  {fa ? "گفتگویی نیست." : "No conversations."}
                </li>
              ) : null}
            </ul>
            <div className={styles.createBox}>
              <h3 className={styles.h3}>
                {fa ? "گفتگوی جدید" : "New conversation"}
              </h3>
              <input
                className={styles.input}
                placeholder={fa ? "شناسه بیمار" : "Patient ID"}
                value={threadPatientId}
                onChange={(event) => setThreadPatientId(event.target.value)}
              />
              <input
                className={styles.input}
                placeholder={fa ? "شناسه پزشک (اختیاری)" : "Physician ID (optional)"}
                value={threadPhysicianId}
                onChange={(event) => setThreadPhysicianId(event.target.value)}
              />
              <button
                className={styles.primary}
                disabled={busy || !threadPatientId}
                onClick={() => void handleCreateThread()}
              >
                {fa ? "ایجاد گفتگو" : "Create conversation"}
              </button>
            </div>
          </div>
          <div className={styles.threadBody}>
            <div className={styles.messages}>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.senderRole === "physician"
                      ? styles.bubbleMine
                      : styles.bubbleOther
                  }
                >
                  <p className={styles.bubbleText}>{message.body}</p>
                  {message.attachments.map((attachment) => (
                    <button
                      key={attachment.id}
                      className={styles.attachment}
                      onClick={() => void downloadAttachment(attachment.id)}
                    >
                      {attachment.mediaKind === "image"
                        ? fa ? "تصویر" : "Photo"
                        : fa ? "ویدیو" : "Video"}{" "}
                      · {Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB
                    </button>
                  ))}
                </div>
              ))}
              {activeThreadId && messages.length === 0 ? (
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
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  placeholder={fa ? "پاسخ پزشک…" : "Physician reply…"}
                />
                <input
                  ref={fileInputRef}
                  className={styles.input}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/webm,video/quicktime"
                  onChange={(event) =>
                    setReplyFiles(
                      Array.from(event.target.files ?? []).slice(0, 4),
                    )
                  }
                />
                <button
                  className={styles.primary}
                  disabled={busy || (!replyText && replyFiles.length === 0)}
                  onClick={() => void handleReply()}
                >
                  {fa ? "ارسال پاسخ" : "Send reply"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.subtitle}>
          {fa ? "ساخت حساب پرتال برای بیمار" : "Create patient portal account"}
        </h2>
        <div className={styles.createGrid}>
          <input
            className={styles.input}
            placeholder={fa ? "شناسه بیمار" : "Patient ID"}
            value={accountPatientId}
            onChange={(event) => setAccountPatientId(event.target.value)}
          />
          <input
            className={styles.input}
            placeholder={fa ? "موبایل یا ایمیل بیمار" : "Patient mobile or email"}
            value={accountLogin}
            onChange={(event) => setAccountLogin(event.target.value)}
          />
          <input
            className={styles.input}
            placeholder={
              fa
                ? "رمز موقت (حداقل ۱۰ کاراکتر)"
                : "Temporary password (min 10 chars)"
            }
            value={accountTempPassword}
            onChange={(event) => setAccountTempPassword(event.target.value)}
          />
          <button
            className={styles.primary}
            disabled={
              busy || !accountPatientId || !accountLogin || !accountTempPassword
            }
            onClick={() => void handleCreateAccount()}
          >
            {fa ? "ساخت حساب" : "Create account"}
          </button>
        </div>
        <p className={styles.hint}>
          {fa
            ? "بیمار در اولین ورود باید رمز موقت را تغییر دهد."
            : "The patient must change the temporary password at first login."}
        </p>
      </section>
    </main>
  );
}
