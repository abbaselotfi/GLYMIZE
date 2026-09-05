"use client";

import type { ReferralInspection, ReferralRedemption } from "@glymize/contracts";
import { FormEvent, useEffect, useState } from "react";

import {
  getReferralCapabilities,
  inspectReferralCode,
  redeemReferralCode,
} from "../../lib/referral-client";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./patient-identity-portal.module.css";

type Props = {
  enabled: boolean;
};

/**
 * Patient-authenticated referral redemption surface.
 * Inspection is read-only. Redemption requires a second explicit confirmation
 * and starts the existing care-relationship workflow; it never grants record access.
 */
export default function PatientReferralRedemption({ enabled }: Props) {
  const { locale } = useGlymizeLocale();
  const fa = locale === "fa";
  const [patientRedemptionEnabled, setPatientRedemptionEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState("");
  const [inspectedCode, setInspectedCode] = useState("");
  const [inspection, setInspection] = useState<ReferralInspection | null>(null);
  const [redemption, setRedemption] = useState<ReferralRedemption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setPatientRedemptionEnabled(false);
      setReady(true);
      return () => { active = false; };
    }
    void getReferralCapabilities()
      .then((capabilities) => {
        if (!active) return;
        setPatientRedemptionEnabled(
          capabilities.referralService && capabilities.patientRedemption,
        );
      })
      .catch(() => {
        if (active) setPatientRedemptionEnabled(false);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => { active = false; };
  }, [enabled]);

  if (!enabled || !ready || !patientRedemptionEnabled) return null;

  async function inspect(event: FormEvent) {
    event.preventDefault();
    const normalized = code.trim();
    if (!normalized) return;
    setBusy(true);
    setError("");
    setInspection(null);
    setRedemption(null);
    try {
      const next = await inspectReferralCode(normalized);
      setInspection(next);
      setInspectedCode(normalized);
    } catch {
      setInspectedCode("");
      setError(
        fa
          ? "این کد ارجاع معتبر یا قابل استفاده نیست. هیچ تغییری در حساب یا دسترسی شما ایجاد نشد."
          : "This referral code is invalid or unavailable. No account or access change was made.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    if (!inspection || !inspectedCode) return;
    setBusy(true);
    setError("");
    try {
      const next = await redeemReferralCode(inspectedCode);
      setRedemption(next);
      setInspection(null);
      setCode("");
      setInspectedCode("");
    } catch {
      setError(
        fa
          ? "ثبت ارجاع انجام نشد. هیچ دسترسی درمانی یا پرونده‌ای ایجاد نشده است."
          : "Referral redemption failed. No clinical or record access was granted.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.referral} data-patient-section="referral-redemption">
      <div>
        <h2>{fa ? "اتصال با کد ارجاع" : "Connect with a referral code"}</h2>
        <p>
          {fa
            ? "ابتدا کد را بررسی کنید. ثبت نهایی فقط بعد از تأیید شما انجام می‌شود و به‌تنهایی دسترسی به پرونده درمانی نمی‌دهد."
            : "Inspect the code first. Final redemption happens only after your confirmation and does not by itself grant clinical-record access."}
        </p>
      </div>

      <form onSubmit={(event) => void inspect(event)}>
        <input
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setInspection(null);
            setInspectedCode("");
            setRedemption(null);
          }}
          autoComplete="off"
          placeholder={fa ? "کد ارجاع" : "Referral code"}
          aria-label={fa ? "کد ارجاع" : "Referral code"}
        />
        <button type="submit" disabled={busy || !code.trim()}>
          {busy ? (fa ? "در حال بررسی…" : "Checking…") : (fa ? "بررسی کد" : "Inspect code")}
        </button>
      </form>

      {inspection ? (
        <div className={styles.referralPreview} data-referral-state="inspected">
          <strong>{inspection.provider.displayName}</strong>
          <span>{inspection.provider.specialtyName} · {inspection.provider.practiceDisplayName}</span>
          {inspection.purposeLabel ? <span>{inspection.purposeLabel}</span> : null}
          <small>{fa ? "انقضا" : "Expires"}: {inspection.expiresAt}</small>
          <small>{fa ? "دفعات باقی‌مانده" : "Remaining uses"}: {inspection.remainingUses}</small>
          <button type="button" disabled={busy} onClick={() => void redeem()}>
            {fa ? "تأیید و ثبت این ارجاع" : "Confirm and redeem this referral"}
          </button>
          <p>
            {fa
              ? "با این تأیید، فقط workflow رابطه مراقبتی آغاز/ثبت می‌شود. دسترسی به پرونده نیازمند مجوز مستقل است."
              : "This confirmation only starts/records the care-relationship workflow. Record access requires separate authorization."}
          </p>
        </div>
      ) : null}

      {redemption ? (
        <div className={styles.message} role="status" data-referral-state="redeemed">
          {fa ? "ارجاع ثبت شد." : "Referral redeemed."} {fa ? "وضعیت" : "Status"}: {redemption.status}. {fa ? "این وضعیت دسترسی پرونده ایجاد نمی‌کند." : "This status does not grant record access."}
        </div>
      ) : null}

      {error ? <p className={styles.error} role="status">{error}</p> : null}
    </section>
  );
}
