"use client";

import type { CareRelationshipSummary, ReferralRedemption } from "@glymize/contracts";
import { useEffect, useState } from "react";

import {
  getCareRelationshipCapabilities,
  listPatientCareRelationships,
  requestCareRelationship,
  revokePatientCareRelationship,
} from "../../lib/care-relationship-client";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./patient-identity-portal.module.css";

export type PendingCareRelationshipReferral = Pick<
  ReferralRedemption,
  "id" | "status" | "provider"
>;

type Props = {
  enabled: boolean;
  pendingReferral: PendingCareRelationshipReferral | null;
  onReferralConverted: () => void;
};

const PATIENT_REVOCABLE = new Set<CareRelationshipSummary["status"]>([
  "requested",
  "active",
  "paused",
]);

/**
 * Patient-authenticated care-relationship governance surface.
 * A relationship is not clinical authorization and never becomes a record-opening path here.
 */
export default function PatientCareRelationships({
  enabled,
  pendingReferral,
  onReferralConverted,
}: Props) {
  const { locale } = useGlymizeLocale();
  const fa = locale === "fa";
  const [available, setAvailable] = useState(false);
  const [ready, setReady] = useState(false);
  const [relationships, setRelationships] = useState<CareRelationshipSummary[]>([]);
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setReady(false);
    setAvailable(false);
    setRelationships([]);

    if (!enabled) {
      setReady(true);
      return () => { active = false; };
    }

    void (async () => {
      try {
        const capabilities = await getCareRelationshipCapabilities();
        if (!active) return;
        const safeBoundary = capabilities.careRelationships && capabilities.clinicalAuthorization === false;
        setAvailable(safeBoundary);
        if (!safeBoundary) return;
        const next = await listPatientCareRelationships();
        if (active) setRelationships(next);
      } catch {
        if (active) {
          setAvailable(false);
          setRelationships([]);
        }
      } finally {
        if (active) setReady(true);
      }
    })();

    return () => { active = false; };
  }, [enabled]);

  if (!enabled || !ready || !available) return null;

  function statusLabel(status: CareRelationshipSummary["status"]) {
    const labels = fa
      ? {
          requested: "در انتظار بررسی پزشک",
          active: "فعال",
          paused: "متوقف موقت",
          ended: "پایان‌یافته",
          revoked: "لغوشده توسط بیمار",
          rejected: "ردشده",
        }
      : {
          requested: "Awaiting clinician review",
          active: "Active",
          paused: "Paused",
          ended: "Ended",
          revoked: "Revoked by patient",
          rejected: "Rejected",
        };
    return labels[status];
  }

  function formatTime(value: string) {
    try {
      return new Intl.DateTimeFormat(fa ? "fa-IR" : "en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    } catch {
      return value;
    }
  }

  async function refreshRelationships() {
    const next = await listPatientCareRelationships();
    setRelationships(next);
  }

  async function confirmRelationshipRequest() {
    if (!pendingReferral || pendingReferral.status !== "pending_care_relationship") return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await requestCareRelationship({
        referralRedemptionId: pendingReferral.id,
        confirmed: true,
      });
      await refreshRelationships();
      onReferralConverted();
      setMessage(
        fa
          ? "درخواست رابطه مراقبتی ثبت شد و اکنون منتظر تصمیم پزشک است. این درخواست به‌تنهایی دسترسی پرونده ایجاد نمی‌کند."
          : "The care-relationship request was submitted for clinician review. This request alone does not grant record access.",
      );
    } catch {
      setError(
        fa
          ? "ثبت درخواست رابطه مراقبتی انجام نشد. هیچ دسترسی درمانی یا پرونده‌ای ایجاد نشده است."
          : "The care-relationship request failed. No clinical or record access was granted.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke(relationshipId: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await revokePatientCareRelationship(relationshipId, {
        confirmed: true,
        reasonCode: "patient_requested",
      });
      await refreshRelationships();
      setConfirmingRevokeId(null);
      setMessage(
        fa
          ? "رابطه مراقبتی لغو شد. مسیرهای دسترسی پرونده همچنان تابع مجوزهای مستقل خود هستند."
          : "The care relationship was revoked. Record-access paths remain governed by their separate authorization.",
      );
    } catch {
      setError(
        fa
          ? "لغو رابطه انجام نشد و وضعیت دسترسی پرونده تغییری نکرد."
          : "The relationship could not be revoked, and record-access state was not changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.referral} data-patient-section="care-relationships">
      <div>
        <h2>{fa ? "روابط مراقبتی" : "Care relationships"}</h2>
        <p>
          {fa
            ? "این بخش فقط وضعیت رابطه شما با ارائه‌دهنده را نشان می‌دهد. حتی وضعیت فعال، به‌تنهایی مجوز مشاهده پرونده یا دسترسی بین‌مطب نیست."
            : "This section shows relationship governance only. Even an active relationship does not by itself authorize record viewing or cross-practice access."}
        </p>
      </div>

      {pendingReferral?.status === "pending_care_relationship" ? (
        <div className={styles.referralPreview} data-care-relationship-state="pending-referral">
          <strong>{pendingReferral.provider.displayName}</strong>
          <span>{pendingReferral.provider.specialtyName} · {pendingReferral.provider.practiceDisplayName}</span>
          <p>
            {fa
              ? "ارجاع ثبت شده است، اما درخواست رابطه مراقبتی هنوز جداگانه تأیید نشده است."
              : "The referral is redeemed, but the separate care-relationship request has not yet been confirmed."}
          </p>
          <button type="button" disabled={busy} onClick={() => void confirmRelationshipRequest()}>
            {fa ? "تأیید و ارسال درخواست رابطه مراقبتی" : "Confirm and request care relationship"}
          </button>
        </div>
      ) : null}

      {relationships.length ? (
        <div className={styles.referralPreview} data-care-relationship-state="list">
          {relationships.map((relationship) => (
            <article key={relationship.id} data-care-relationship-status={relationship.status}>
              <strong>{relationship.provider.displayName}</strong>
              <span>{relationship.provider.specialtyName} · {relationship.provider.practiceDisplayName}</span>
              <small>{fa ? "وضعیت" : "Status"}: {statusLabel(relationship.status)}</small>
              <small>{fa ? "آخرین تغییر" : "Last updated"}: {formatTime(relationship.updatedAt)}</small>
              {relationship.activatedAt ? (
                <small>{fa ? "فعال از" : "Active since"}: {formatTime(relationship.activatedAt)}</small>
              ) : null}
              {relationship.terminalAt ? (
                <small>{fa ? "پایان وضعیت" : "Terminal at"}: {formatTime(relationship.terminalAt)}</small>
              ) : null}

              {PATIENT_REVOCABLE.has(relationship.status) ? (
                confirmingRevokeId === relationship.id ? (
                  <div data-care-relationship-action="confirm-revoke">
                    <p>
                      {fa
                        ? "لغو را دوباره تأیید کنید. این عمل رابطه را خاتمه می‌دهد؛ مجوز پرونده یک مرز مستقل دارد."
                        : "Confirm revocation once more. This ends the relationship; record authorization remains a separate boundary."}
                    </p>
                    <button type="button" disabled={busy} onClick={() => void confirmRevoke(relationship.id)}>
                      {fa ? "تأیید نهایی لغو" : "Confirm revocation"}
                    </button>
                    <button type="button" disabled={busy} onClick={() => setConfirmingRevokeId(null)}>
                      {fa ? "انصراف" : "Cancel"}
                    </button>
                  </div>
                ) : (
                  <button type="button" disabled={busy} onClick={() => setConfirmingRevokeId(relationship.id)}>
                    {relationship.status === "requested"
                      ? (fa ? "پس‌گرفتن درخواست" : "Withdraw request")
                      : (fa ? "لغو رابطه مراقبتی" : "Revoke care relationship")}
                  </button>
                )
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p>{fa ? "هنوز رابطه مراقبتی ثبت‌شده‌ای وجود ندارد." : "No care relationships are recorded yet."}</p>
      )}

      {message ? <p className={styles.message} role="status">{message}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}
