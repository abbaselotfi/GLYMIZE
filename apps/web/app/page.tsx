"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";

import { migrateLegacyGlymizeStorage } from "../lib/glymize-brand-migration";
import { useGlymizeLocale } from "./components/use-glymize-locale";
import styles from "./page.module.css";

type Locale = "fa" | "en";

type Copy = {
  platform: string;
  headline: string;
  description: string;
  physicianStart: string;
  patientStart: string;
  entryLabel: string;
  patientEntry: string;
  clinicianEntry: string;
  safety: string;
  briefLabel: string;
  briefTitle: string;
  changedLabel: string;
  changedTitle: string;
  changedBody: string;
  factsLabel: string;
  factsTitle: string;
  factsBody: string;
  modulesLabel: string;
  modulesTitle: string;
  modulesBody: string;
  actionLabel: string;
  actionTitle: string;
  actionBody: string;
  domainsLabel: string;
  domains: string[];
};

const COPY: Record<Locale, Copy> = {
  fa: {
    platform: "فضای هوشمند بالینی بیمارمحور",
    headline: "داستان کامل بیمار؛ از داده تا اقدام روشن.",
    description:
      "پروندهٔ طولی، آزمایش‌ها، داروها، شواهد و ماژول‌های تخصصی در یک فضای کاری مشترک برای پزشک.",
    physicianStart: "ورود پزشک و دستیار",
    patientStart: "ورود به فضای بیمار",
    entryLabel: "مسیرهای ورود به GLYMIZE",
    patientEntry: "بیمار",
    clinicianEntry: "پزشک و دستیار",
    safety:
      "GLYMIZE داده، تغییرات و گزینه‌های قابل‌استناد را کنار هم می‌گذارد؛ تصمیم و اقدام نهایی با پزشک است.",
    briefLabel: "خلاصهٔ ۱۰ ثانیه‌ای",
    briefTitle: "وضعیت امروز بیمار",
    changedLabel: "چه چیزی تغییر کرده؟",
    changedTitle: "روند و تغییرات مهم",
    changedBody: "ویزیت، آزمایش، دارو و رویدادهای طولی با منبع و زمان مشخص.",
    factsLabel: "Patient Clinical Core",
    factsTitle: "یک واقعیت، یک منبع",
    factsBody: "همهٔ تخصص‌ها از همان پرونده و زمینهٔ بالینی مشترک استفاده می‌کنند.",
    modulesLabel: "ماژول‌های تخصصی",
    modulesTitle: "هوش بالینی قابل توسعه",
    modulesBody: "دیابت نخستین ماژول بالغ است؛ تخصص‌های بعدی روی همان هسته اضافه می‌شوند.",
    actionLabel: "اقدام بعدی",
    actionTitle: "پیشنهاد قابل‌ردیابی",
    actionBody: "دارو، آزمایش، پایش یا ارجاع با شواهد و تأیید پزشک.",
    domainsLabel: "یک بیمار، چند نگاه تخصصی",
    domains: [
      "دیابت",
      "قلب",
      "کلیه",
      "ریه",
      "گوارش",
      "عفونی",
      "نورولوژی",
      "روماتولوژی",
      "هماتولوژی",
    ],
  },
  en: {
    platform: "Patient-centered clinical intelligence workspace",
    headline: "The whole patient story—from data to clear action.",
    description:
      "Longitudinal records, labs, medications, evidence, and specialty modules in one shared physician workspace.",
    physicianStart: "Physician & assistant sign in",
    patientStart: "Open patient area",
    entryLabel: "GLYMIZE sign-in paths",
    patientEntry: "Patient",
    clinicianEntry: "Physician & assistant",
    safety:
      "GLYMIZE brings traceable facts, change, and options together; the physician owns the final decision and action.",
    briefLabel: "10-second clinical brief",
    briefTitle: "The patient today",
    changedLabel: "What changed?",
    changedTitle: "Meaningful longitudinal change",
    changedBody: "Encounters, labs, medications, and events with explicit source and time.",
    factsLabel: "Patient Clinical Core",
    factsTitle: "One fact, one source",
    factsBody: "Every specialty works from the same shared record and clinical context.",
    modulesLabel: "Specialty modules",
    modulesTitle: "Clinical intelligence that can grow",
    modulesBody: "Diabetes is the first mature module; new specialties build on the same core.",
    actionLabel: "Next action",
    actionTitle: "A traceable proposal",
    actionBody:
      "Medication, investigation, monitoring, or referral with evidence and physician confirmation.",
    domainsLabel: "One patient, multiple clinical lenses",
    domains: [
      "Diabetes",
      "Cardiology",
      "Kidney",
      "Pulmonary",
      "GI & liver",
      "Infectious",
      "Neurology",
      "Rheumatology",
      "Hematology",
    ],
  },
};

function publicAsset(path: string): string {
  const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${configuredBasePath}${path}`;
}

function ArrowIcon({ rtl }: { rtl: boolean }) {
  return (
    <svg className={rtl ? styles.arrowRtl : undefined} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M14 6l6 6-6 6" />
    </svg>
  );
}

function PulseMark() {
  return (
    <svg viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="25" />
      <path d="M10 29h10l4-10 7 19 5-9h10" />
    </svg>
  );
}

export default function HomePage() {
  const { locale, setLocale, isRtl } = useGlymizeLocale();
  const copy = COPY[locale];

  useEffect(() => {
    migrateLegacyGlymizeStorage();
  }, []);

  return (
    <main className={styles.page} dir={isRtl ? "rtl" : "ltr"}>
      <header className={styles.header}>
        <Link className={styles.brandLink} href="/" aria-label="GLYMIZE home">
          <Image
            className={styles.wordmark}
            src={publicAsset("/glymize-logo.png")}
            alt="GLYMIZE"
            width={180}
            height={48}
            priority
          />
        </Link>

        <div className={styles.headerActions}>
          <fieldset className={styles.languageSwitch}>
            <legend className={styles.srOnly}>Language selector</legend>
            <button type="button" aria-pressed={locale === "fa"} onClick={() => setLocale("fa")}>
              FA
            </button>
            <span aria-hidden="true">/</span>
            <button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>
              EN
            </button>
          </fieldset>
          <nav className={styles.entryNav} aria-label={copy.entryLabel}>
            <Link className={styles.entryLink} data-actor="patient" href="/patient">
              <span className={styles.entryMark} aria-hidden="true">
                P
              </span>
              <span>{copy.patientEntry}</span>
            </Link>
            <Link className={styles.entryLink} data-actor="clinician" href="/account">
              <span className={styles.entryMark} aria-hidden="true">
                MD
              </span>
              <span>{copy.clinicianEntry}</span>
            </Link>
          </nav>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="glymize-headline">
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowLine} />
            {copy.platform}
          </div>
          <h1 id="glymize-headline">{copy.headline}</h1>
          <p className={styles.description}>{copy.description}</p>

          <div className={styles.ctaRow}>
            <Link className={styles.primaryCta} href="/account">
              <span>{copy.physicianStart}</span>
              <ArrowIcon rtl={isRtl} />
            </Link>
            <Link className={styles.secondaryCta} href="/patient">
              <span>{copy.patientStart}</span>
              <ArrowIcon rtl={isRtl} />
            </Link>
          </div>

          <div className={styles.safetyNote}>
            <PulseMark />
            <p>{copy.safety}</p>
          </div>
        </div>

        <section className={styles.clinicalCanvas} aria-label={copy.briefTitle}>
          <div className={styles.canvasGlow} aria-hidden="true" />
          <article className={styles.briefCard}>
            <div>
              <span>{copy.briefLabel}</span>
              <h2>{copy.briefTitle}</h2>
            </div>
            <div className={styles.patientSignal} aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </article>

          <div className={styles.canvasGrid}>
            <article className={styles.canvasCard} data-tone="change">
              <span>{copy.changedLabel}</span>
              <h3>{copy.changedTitle}</h3>
              <p>{copy.changedBody}</p>
              <div className={styles.trend} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </article>
            <article className={styles.canvasCard} data-tone="core">
              <span>{copy.factsLabel}</span>
              <h3>{copy.factsTitle}</h3>
              <p>{copy.factsBody}</p>
              <div className={styles.factOrbit} aria-hidden="true">
                <b>01</b>
                <i />
                <i />
                <i />
              </div>
            </article>
            <article className={styles.canvasCard} data-tone="module">
              <span>{copy.modulesLabel}</span>
              <h3>{copy.modulesTitle}</h3>
              <p>{copy.modulesBody}</p>
              <div className={styles.moduleDots} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </article>
          </div>

          <article className={styles.actionCard}>
            <div className={styles.actionMark} aria-hidden="true">
              →
            </div>
            <div>
              <span>{copy.actionLabel}</span>
              <h3>{copy.actionTitle}</h3>
              <p>{copy.actionBody}</p>
            </div>
          </article>
        </section>
      </section>

      <section className={styles.domainRail} aria-label={copy.domainsLabel}>
        <strong>{copy.domainsLabel}</strong>
        <div>
          {copy.domains.map((domain, index) => (
            <span key={domain} data-active={index === 0}>
              {domain}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
