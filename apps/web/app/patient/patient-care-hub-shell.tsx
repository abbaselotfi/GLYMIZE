"use client";

import Link from "next/link";

import PatientPortalEntry from "../portal/patient-portal-entry";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./patient-care-hub-shell.module.css";

export default function PatientCareHubShell() {
  const { locale, isRtl } = useGlymizeLocale();
  const fa = locale === "fa";

  return (
    <div
      className={styles.app}
      data-app="patient-care-hub"
      data-actor="patient"
      dir={isRtl ? "rtl" : "ltr"}
      lang={locale}
    >
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label={fa ? "خانه GLYMIZE" : "GLYMIZE home"}>
          <span className={styles.brandMark} aria-hidden="true">G</span>
          <span>
            <b>GLYMIZE</b>
            <small>{fa ? "فضای بیمار" : "Patient Care Hub"}</small>
          </span>
        </Link>

        <div className={styles.actorBadge} aria-label={fa ? "فضای اختصاصی بیمار" : "Dedicated patient application"}>
          <span aria-hidden="true">P</span>
          <div>
            <b>{fa ? "بیمار" : "Patient"}</b>
            <small>{fa ? "حساب و ارتباط درمانی" : "Account & care connections"}</small>
          </div>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="patient-hub-title">
        <div>
          <span className={styles.eyebrow}>{fa ? "PATIENT CARE HUB" : "PATIENT CARE HUB"}</span>
          <h1 id="patient-hub-title">{fa ? "فضای درمانی شما در GLYMIZE" : "Your GLYMIZE patient care space"}</h1>
          <p>
            {fa
              ? "ورود و حساب بیمار از فضای پزشک و دستیار جداست. هر پرونده درمانی همچنان متعلق به همان مطب می‌ماند و فقط پس از اتصال تأییدشده در دسترس قرار می‌گیرد."
              : "Patient sign-in and account access are separate from the clinician workspace. Each clinical record remains owned by its practice and is available only after a verified link."}
          </p>
        </div>

        <div className={styles.boundaryCard}>
          <span aria-hidden="true">✓</span>
          <div>
            <b>{fa ? "مرز حریم خصوصی" : "Privacy boundary"}</b>
            <p>
              {fa
                ? "داشتن کد ملی به‌تنهایی دسترسی به پرونده پزشکی ایجاد نمی‌کند و پرونده‌های مطب‌های مختلف به‌طور خودکار با هم ادغام نمی‌شوند."
                : "Knowing a national ID never grants clinical-record access, and records from different practices are never silently merged."}
            </p>
          </div>
        </div>
      </section>

      <div className={styles.workspace}>
        <PatientPortalEntry />
      </div>

      <footer className={styles.footer}>
        <Link href="/">{fa ? "بازگشت به صفحه اصلی" : "Back to GLYMIZE home"}</Link>
        <span>{fa ? "فضای بیمار مستقل از پنل پزشک و دستیار است." : "The patient app is separate from the physician and assistant workspace."}</span>
      </footer>
    </div>
  );
}
