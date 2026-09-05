"use client";

import type {
  GlobalPatientAccountSummary,
  PatientPracticeContext,
  PatientVerifiedLegacyLinkSummary,
} from "@glymize/contracts";

import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./patient-identity-portal.module.css";

type Props = {
  account: GlobalPatientAccountSummary;
  links: PatientVerifiedLegacyLinkSummary[];
  practiceContexts: PatientPracticeContext[];
  selectedPracticeContextId: string | null;
  careContextError: string;
  legacyPortalEnabled: boolean;
  busy: boolean;
  onLogout: () => void;
  onSelectPracticeContext: (context: PatientPracticeContext) => void;
  onOpenPractice: (link: PatientVerifiedLegacyLinkSummary) => void;
};

/**
 * Authenticated patient surface within the Patient Care Hub.
 * Practice-local records remain distinct verified destinations and are never
 * synthesized into a global clinical chart. Selecting a P5-B practice context
 * is a view preference only and must never grant clinical or cross-practice access.
 */
export default function PatientCareHub({
  account,
  links,
  practiceContexts,
  selectedPracticeContextId,
  careContextError,
  legacyPortalEnabled,
  busy,
  onLogout,
  onSelectPracticeContext,
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

        {practiceContexts.length > 0 ? (
          <div className={styles.practices} data-patient-section="care-contexts">
            <h2>{fa ? "تیم‌ها و زمینه‌های مراقبت من" : "My care contexts"}</h2>
            {practiceContexts.map((context) => {
              const selected = selectedPracticeContextId === context.id;
              return (
                <article key={context.id} data-selected={selected ? "true" : "false"}>
                  <span aria-hidden="true">{selected ? "●" : "○"}</span>
                  <div>
                    <strong>{context.provider.practiceDisplayName}</strong>
                    <small>{context.provider.displayName} · {context.provider.specialtyName}</small>
                    <small>{fa ? `رابطه مراقبتی: ${context.relationshipStatus}` : `Care relationship: ${context.relationshipStatus}`}</small>
                    {context.linkedLocalRecord ? <small>{fa ? "پرونده محلی متصل است" : "Local record linked"}</small> : null}
                  </div>
                  {context.selectable ? (
                    <button
                      type="button"
                      disabled={busy || selected}
                      onClick={() => onSelectPracticeContext(context)}
                    >
                      {selected ? (fa ? "زمینه فعال" : "Active context") : (fa ? "انتخاب زمینه" : "Select context")}
                    </button>
                  ) : (
                    <small>{fa ? "این رابطه قابل انتخاب نیست" : "This relationship is not selectable"}</small>
                  )}
                </article>
              );
            })}
            <p className={styles.boundaryNote}>
              {fa
                ? "انتخاب زمینه مراقبت فقط ترجیح نمایشی این نشست است و هیچ دسترسی درمانی یا دسترسی بین‌مطب ایجاد نمی‌کند."
                : "Selecting a care context is only a session view preference; it grants neither clinical nor cross-practice access."}
            </p>
          </div>
        ) : null}

        {careContextError ? <p className={styles.error} role="status">{careContextError}</p> : null}

        <div className={styles.practices} data-patient-section="verified-record-links">
          <h2>{fa ? "پرونده‌های تأییدشده من" : "My verified care records"}</h2>
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

        <p className={styles.boundaryNote}>
          {fa
            ? "Care Hub پرونده‌های مراکز مختلف را ادغام نمی‌کند و هیچ داده بالینی را بدون لینک تأییدشده نمایش نمی‌دهد."
            : "Care Hub does not merge records across organizations and never exposes clinical data without a verified link."}
        </p>
      </section>
    </main>
  );
}
