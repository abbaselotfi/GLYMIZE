"use client";

import type {
  GlobalPatientAccountSummary,
  PatientVerifiedLegacyLinkSummary,
} from "@glymize/contracts";

import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./patient-identity-portal.module.css";

type Props = {
  account: GlobalPatientAccountSummary;
  links: PatientVerifiedLegacyLinkSummary[];
  legacyPortalEnabled: boolean;
  busy: boolean;
  onLogout: () => void;
  onOpenPractice: (link: PatientVerifiedLegacyLinkSummary) => void;
};

/**
 * Authenticated patient shell.
 *
 * This surface deliberately represents the global patient account as the app
 * boundary. Practice-local records remain separate destinations and are never
 * merged into a synthetic global clinical record.
 */
export default function PatientCareHub({
  account,
  links,
  legacyPortalEnabled,
  busy,
  onLogout,
  onOpenPractice,
}: Props) {
  const { locale } = useGlymizeLocale();
  const fa = locale === "fa";

  return (
    <main className={styles.page} data-patient-surface="care-hub">
      <section className={styles.accountCard}>
        <div className={styles.accountHeader}>
          <div>
            <span>PATIENT CARE HUB</span>
            <h1>{fa ? "فضای سلامت من" : "My health space"}</h1>
            <p className={styles.intro}>
              {fa
                ? "حساب سراسری شما نقطه ورود به خدمات بیمار است؛ هر پرونده درمانی همچنان مستقل و متعلق به همان مرکز درمانی باقی می‌ماند."
                : "Your global account is the entry point to patient services; each clinical record remains separate and owned by its care organization."}
            </p>
          </div>
          <button type="button" disabled={busy} onClick={onLogout}>
            {fa ? "خروج" : "Sign out"}
          </button>
        </div>

        <div className={styles.statusGrid} aria-label={fa ? "وضعیت حساب بیمار" : "Patient account status"}>
          <div><small>{fa ? "وضعیت حساب" : "Account"}</small><strong>{account.status}</strong></div>
          <div><small>{fa ? "احراز هویت" : "Proofing"}</small><strong>{account.proofingStatus}</strong></div>
          <div><small>{fa ? "پروندهٔ متصل" : "Linked record"}</small><strong>{account.linkedClinicalRecord ? (fa ? "دارد" : "Yes") : (fa ? "ندارد" : "No")}</strong></div>
        </div>

        <section aria-labelledby="care-hub-records-heading">
          <div className={styles.practices}>
            <h2 id="care-hub-records-heading">{fa ? "پرونده‌ها و مراکز درمانی من" : "My records and care organizations"}</h2>
            {links.length > 0 ? links.map((link) => (
              <article key={link.portalUserId}>
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>{link.practiceName}</strong>
                  <small>{fa ? "لینک پرونده تأیید شده" : "Record link verified"}</small>
                </div>
                {legacyPortalEnabled ? (
                  <button type="button" disabled={busy} onClick={() => onOpenPractice(link)}>
                    {fa ? "باز کردن پرونده این مرکز" : "Open this care record"}
                  </button>
                ) : (
                  <small>{fa ? "دسترسی پرتال این مرکز فعلاً فعال نیست" : "This practice portal is currently unavailable"}</small>
                )}
              </article>
            )) : (
              <div className={styles.unlinked}>
                <strong>{fa ? "حساب شما هنوز به پرونده‌ای متصل نیست" : "Your account is not linked to a record yet"}</strong>
                <p>{fa ? "دانستن کد ملی به‌تنهایی دسترسی درمانی ایجاد نمی‌کند. اتصال باید توسط مرکز درمانی و در یک جریان تأییدشده انجام شود." : "Knowing a national ID never grants clinical access. A care organization must complete a verified linking flow."}</p>
              </div>
            )}
          </div>
        </section>

        <p className={styles.boundaryNote}>
          {fa
            ? "Care Hub پرونده‌های مراکز مختلف را ادغام نمی‌کند و هیچ داده بالینی را بدون لینک تأییدشده نمایش نمی‌دهد."
            : "Care Hub does not merge records across organizations and never exposes clinical data without a verified link."}
        </p>
      </section>
    </main>
  );
}
