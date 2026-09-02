"use client";

import type {
  PatientIdentityCapabilities,
  PatientLegacyLinkReviewSummary,
} from "@glymize/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  decidePatientLegacyLink,
  listPatientLegacyLinks,
} from "../../../lib/patient-identity-admin-client";
import { getPatientIdentityCapabilities } from "../../../lib/patient-identity-client";
import { useGlymizeLocale } from "../../components/use-glymize-locale";
import styles from "./patient-identity-admin-panel.module.css";

const GATES = [
  ["patientIdentityV2", "Patient Identity v2", "هویت سراسری بیمار"],
  ["selfRegistration", "Self-registration", "ثبت‌نام مستقیم بیمار"],
  ["recordLinking", "Reviewed record linking", "اتصال بازبینی‌شده پرونده"],
  ["smsOtp", "SMS OTP", "ورود پیامکی"],
] as const;

function shortId(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export default function PatientIdentityAdminPanel() {
  const { locale } = useGlymizeLocale();
  const fa = locale === "fa";
  const [capabilities, setCapabilities] = useState<PatientIdentityCapabilities | null>(null);
  const [links, setLinks] = useState<PatientLegacyLinkReviewSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const next = await getPatientIdentityCapabilities();
      setCapabilities(next);
      if (next.patientIdentityV2) {
        setLinks(await listPatientLegacyLinks());
      } else {
        setLinks([]);
      }
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "PATIENT_IDENTITY_ADMIN_FAILED";
      setError(
        code === "auth_required" || code === "permission_denied"
          ? fa
            ? "بازبینی لینک فقط با نشست پزشکِ همان مطب و دسترسی مدیریت کاربران مجاز است."
            : "Link review requires a physician session in the same practice with Admin Users permission."
          : code,
      );
    } finally {
      setBusy(false);
    }
  }, [fa]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(
    () => links.filter((link) => link.status === "pending").length,
    [links],
  );

  async function decide(
    link: PatientLegacyLinkReviewSummary,
    decision: "verify" | "reject" | "revoke",
  ) {
    const prompt = decision === "verify"
      ? fa
        ? "اتصال این حساب سراسری به پرونده محلی پس از بررسی مدارک تأیید شود؟"
        : "Confirm this reviewed global-account to local-record link?"
      : decision === "reject"
        ? fa ? "این درخواست اتصال رد شود؟" : "Reject this link request?"
        : fa ? "دسترسی این لینک لغو شود؟" : "Revoke this verified link?";
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await decidePatientLegacyLink(link.portalUserId, decision);
      setMessage(fa ? "تصمیم ثبت و رویداد امنیتی audit شد." : "Decision saved and security-audited.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "PATIENT_LINK_DECISION_FAILED");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="patient-identity-admin-title">
      <header className={styles.header}>
        <div>
          <span>P5-A · PATIENT IDENTITY</span>
          <h2 id="patient-identity-admin-title">
            {fa ? "دروازه‌های هویت بیمار و صف اتصال" : "Patient identity gates & link queue"}
          </h2>
          <p>
            {fa
              ? "این وضعیت مستقیماً از Worker خوانده می‌شود. کارت‌ها کنترل نمایشی نیستند و فعال‌سازی فقط از مسیر release امن انجام می‌شود."
              : "Status is read directly from the Worker. These cards are not cosmetic toggles; activation remains a controlled release operation."}
          </p>
        </div>
        <div className={styles.queueMetric}>
          <b>{pendingCount}</b>
          <small>{fa ? "در انتظار بازبینی" : "pending review"}</small>
        </div>
      </header>

      <div className={styles.gates} aria-live="polite">
        {GATES.map(([key, en, faLabel]) => {
          const active = capabilities?.[key] === true;
          return (
            <article className={styles.gate} data-active={active} key={key}>
              <span className={styles.signal} aria-hidden="true" />
              <div>
                <strong>{fa ? faLabel : en}</strong>
                <small>{active ? (fa ? "فعال در سرور" : "Server enabled") : (fa ? "خاموش در سرور" : "Server disabled")}</small>
              </div>
            </article>
          );
        })}
      </div>

      {!capabilities ? (
        <p className={styles.notice}>{fa ? "در حال خواندن capabilityهای سرور…" : "Reading server capabilities…"}</p>
      ) : !capabilities.patientIdentityV2 ? (
        <p className={styles.notice}>
          {fa
            ? "Patient Identity v2 طبق release gate خاموش است؛ هیچ صف یا عملیات لینکی از رابط قابل اجرا نیست."
            : "Patient Identity v2 is release-gated OFF; no link queue or mutation is available from the UI."}
        </p>
      ) : (
        <div className={styles.queue}>
          <div className={styles.queueHeader}>
            <h3>{fa ? "درخواست‌های practice-scoped" : "Practice-scoped requests"}</h3>
            <button type="button" disabled={busy} onClick={() => void load()}>
              {fa ? "بازخوانی" : "Refresh"}
            </button>
          </div>
          {links.length === 0 ? (
            <p className={styles.notice}>{fa ? "درخواستی ثبت نشده است." : "No link requests."}</p>
          ) : links.map((link) => (
            <article className={styles.link} key={link.portalUserId}>
              <div className={styles.ids}>
                <strong>{shortId(link.patientAccountId)}</strong>
                <span aria-hidden="true">↔</span>
                <strong>{shortId(link.portalUserId)}</strong>
              </div>
              <div className={styles.meta}>
                <span>{link.provenance}</span>
                <span>{link.verificationMethod}</span>
                <span>{new Date(link.createdAt).toLocaleString(fa ? "fa-IR" : "en-US")}</span>
              </div>
              <span className={styles.status} data-status={link.status}>{link.status}</span>
              <div className={styles.actions}>
                {link.status === "pending" ? (
                  <>
                    <button disabled={busy || !capabilities.recordLinking} onClick={() => void decide(link, "verify")}>
                      {fa ? "تأیید بازبینی" : "Verify review"}
                    </button>
                    <button disabled={busy || !capabilities.recordLinking} data-danger onClick={() => void decide(link, "reject")}>
                      {fa ? "رد" : "Reject"}
                    </button>
                  </>
                ) : link.status === "verified" ? (
                  <button disabled={busy || !capabilities.recordLinking} data-danger onClick={() => void decide(link, "revoke")}>
                    {fa ? "لغو لینک" : "Revoke link"}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {message ? <p className={styles.message} role="status">{message}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}
