"use client";

import Link from "next/link";

import GlymizeLanguageSwitch from "./glymize-language-switch";
import { useGlymizeLocale } from "./use-glymize-locale";
import styles from "./patient-shell.module.css";

const COPY = {
  fa: {
    area: "فضای بیمار",
    boundary: "محیط مستقل بیمار",
    home: "صفحه اصلی",
    privacy: "دسترسی به اطلاعات پرونده فقط از مسیرهای مجاز و تأییدشده انجام می‌شود.",
  },
  en: {
    area: "Patient area",
    boundary: "Standalone patient environment",
    home: "Home",
    privacy: "Clinical record access is available only through authorized, verified paths.",
  },
} as const;

export default function PatientShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const { locale, isRtl } = useGlymizeLocale();
  const copy = COPY[locale];

  return (
    <div
      className={styles.shell}
      data-actor-shell="patient"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="GLYMIZE home">
          <span className={styles.brandMark} aria-hidden="true">G</span>
          <span>
            <strong>GLYMIZE</strong>
            <small>{copy.area}</small>
          </span>
        </Link>

        <div className={styles.actions}>
          <span className={styles.boundary}>
            <span aria-hidden="true" />
            {copy.boundary}
          </span>
          <GlymizeLanguageSwitch />
          <Link className={styles.homeLink} href="/">{copy.home}</Link>
        </div>
      </header>

      <div className={styles.content}>{children}</div>

      <footer className={styles.footer}>{copy.privacy}</footer>
    </div>
  );
}
