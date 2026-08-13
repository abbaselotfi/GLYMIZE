"use client";

import { engineEvidenceSources } from "@glymize/clinical-engine";
import Link from "next/link";
import { useEffect, useState } from "react";
import { withBasePath } from "../../lib/base-path";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./dashboard.module.css";

type Locale = "fa" | "en";
type Status = "available" | "foundation" | "planned";

type MarketDashboardMeta = {
  sourceGeneratedAt?: string;
  dashboardMetrics?: {
    productCount?: number;
    genericCount?: number;
    verifiedPresentationCount?: number;
    insuranceRecordCount?: number;
  };
};

type Tool = {
  href: string;
  icon: string;
  title: Record<Locale, string>;
  description: Record<Locale, string>;
  status: Status;
};

const COPY = {
  fa: {
    eyebrow: "GLYMIZE Clinical Command Center",
    title: "مرکز فرمان بالینی",
    intro: "مسیر درمان، ابزارهای بالینی، تیم مراقبت و شواهد علمی در یک فضای واحد با اولویت تصمیم پزشک.",
    primary: "مسیر اصلی درمان",
    primaryHint: "سریع‌ترین مسیر برای تصمیم‌گیری دارویی بر اساس فنوتیپ، ایمنی، هزینه، بیمه و دسترسی.",
    otherPathways: "مسیرهای تخصصی",
    otherHint: "مسیرهای مکمل بر اساس نوع دیابت و شرایط ویژه بیمار.",
    workflow: "ابزار و جریان کار",
    workflowHint: "محاسبه، آماده‌سازی بیمار و پاسخ علمی بدون خروج از فضای بالینی.",
    open: "ورود به مسیر",
    available: "فعال",
    foundation: "فونداسیون آماده",
    planned: "در حال آماده‌سازی",
    safetyTitle: "مرز ایمنی تصمیم‌یار",
    safetyBody: "GLYMIZE تصمیم پزشک را جایگزین نمی‌کند. خروجی انسولین نیازمند بازبینی پزشک است و handoff فقط پس از تأیید صریح وارد مسیر درمان می‌شود.",
    evidenceTitle: "شواهد فعال در موتور",
    evidenceHint: "فقط منابعی نمایش داده می‌شوند که Rule یا مسیر بالینی مشخصی در موتور GLYMIZE را تغذیه می‌کنند.",
    guideline: "Guideline",
    consensus: "Consensus",
    regulatory: "Regulatory",
    evidenceNote: "به‌روزرسانی منبع به‌تنهایی Rule بالینی را تغییر نمی‌دهد؛ نسخه جدید ابتدا باید بازبینی و تایید شود.",
    dataTitle: "پوشش داده فعال",
    dataHint: "نمای سریع از آخرین Full Clinical Market؛ برای شفافیت دامنه داده، نه ادعای کیفیت بالینی.",
    marketProducts: "فرآورده بازار",
    generics: "ژنریک",
    verifiedPresentations: "Presentation تأییدشده NFI",
    insuranceRecords: "رکورد بیمه",
    lastUpdated: "آخرین همگام‌سازی",
    contact: "گزارش خطای داده",
    startType2: "شروع ارزیابی Type 2",
  },
  en: {
    eyebrow: "GLYMIZE Clinical Command Center",
    title: "Clinical command center",
    intro: "Treatment pathways, clinical tools, care-team workflow, and evidence in one physician-prioritized workspace.",
    primary: "Primary treatment pathway",
    primaryHint: "The fastest route to a medication decision using phenotype, safety, cost, insurance, and access.",
    otherPathways: "Specialty pathways",
    otherHint: "Complementary pathways for diabetes type and special clinical contexts.",
    workflow: "Tools & workflow",
    workflowHint: "Calculation, pre-visit preparation, and evidence support without leaving the clinical workspace.",
    open: "Open pathway",
    available: "Available",
    foundation: "Foundation ready",
    planned: "In preparation",
    safetyTitle: "Decision-support safety boundary",
    safetyBody: "GLYMIZE does not replace clinician judgment. Insulin output requires physician review and handoff enters treatment only after explicit confirmation.",
    evidenceTitle: "Evidence actively used by the engine",
    evidenceHint: "Only sources that feed a defined GLYMIZE clinical rule or pathway are shown here.",
    guideline: "Guideline",
    consensus: "Consensus",
    regulatory: "Regulatory",
    evidenceNote: "A source update never changes a clinical rule automatically; new versions require review and approval first.",
    dataTitle: "Active data coverage",
    dataHint: "A quick view of the latest Full Clinical Market, shown for scope transparency rather than as a clinical-quality claim.",
    marketProducts: "Market products",
    generics: "Generics",
    verifiedPresentations: "NFI-verified presentations",
    insuranceRecords: "Insurance records",
    lastUpdated: "Last sync",
    contact: "Report a data issue",
    startType2: "Start Type 2 assessment",
  },
} as const;

const SPECIALTY_TOOLS: Tool[] = [
  {
    href: "/type-1", icon: "T1", title: { fa: "دیابت نوع ۱", en: "Type 1 diabetes" },
    description: { fa: "مرور درمان انسولین و مسیر آینده مدیریت رژیم‌های Type 1.", en: "Insulin-therapy review and the evolving Type 1 management pathway." }, status: "foundation",
  },
  {
    href: "/pregnancy", icon: "P", title: { fa: "دیابت و بارداری", en: "Diabetes in pregnancy" },
    description: { fa: "مسیر پرخطر برای پیش از بارداری، بارداری و پس از زایمان.", en: "High-risk pathway for preconception, pregnancy, and postpartum care." }, status: "foundation",
  },
];

const WORKFLOW_TOOLS: Tool[] = [
  {
    href: "/insulin-tools", icon: "IU", title: { fa: "ابزارهای انسولین", en: "Insulin tools" },
    description: { fa: "تبدیل Basal/Premix/Prandial/FRC با guardrailهای ایمنی و خروجی قابل بازبینی.", en: "Basal, premix, prandial, and FRC conversion with safety guardrails." }, status: "available",
  },
  {
    href: "/care-team", icon: "RN", title: { fa: "تیم مراقبت", en: "Care team" },
    description: { fa: "آماده‌سازی پیش از ویزیت، آزمایش‌ها، داروها و handoff ساختاریافته.", en: "Pre-visit preparation, labs, medications, and structured handoff." }, status: "available",
  },
  {
    href: "/evidence-assistant", icon: "AI", title: { fa: "دستیار علمی AI", en: "Evidence AI" },
    description: { fa: "پاسخ grounded فقط بر پایه شواهد تاییدشده موتور و با citation.", en: "Grounded answers using only approved engine evidence with citations." }, status: "available",
  },
];

function StatusBadge({ status, locale }: { status: Status; locale: Locale }) {
  const copy = COPY[locale];
  return <span className={`${styles.status} ${styles[status]}`}>{copy[status]}</span>;
}

function ToolCard({ tool, locale }: { tool: Tool; locale: Locale }) {
  const copy = COPY[locale];
  return (
    <Link className={styles.toolCard} href={tool.href}>
      <div className={styles.cardTop}><span className={styles.icon} aria-hidden="true">{tool.icon}</span><StatusBadge locale={locale} status={tool.status} /></div>
      <div className={styles.cardCopy}><h3>{tool.title[locale]}</h3><p>{tool.description[locale]}</p></div>
      <span className={styles.openLink}>{copy.open}<b aria-hidden="true">←</b></span>
    </Link>
  );
}

export default function DashboardPage() {
  const { locale, isRtl } = useGlymizeLocale();
  const copy = COPY[locale];
  const [marketMeta, setMarketMeta] = useState<MarketDashboardMeta | null>(null);

  useEffect(() => {
    void fetch(`${withBasePath("/data/glymize-clinician-market-v2.meta.json")}?t=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<MarketDashboardMeta> : null)
      .then(setMarketMeta)
      .catch(() => setMarketMeta(null));
  }, []);

  const dataMetrics = marketMeta?.dashboardMetrics;
  const lastUpdated = marketMeta?.sourceGeneratedAt
    ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-GB", { year: "numeric", month: "short", day: "numeric" }).format(new Date(marketMeta.sourceGeneratedAt))
    : "—";

  return (
    <main className={styles.page} dir={isRtl ? "rtl" : "ltr"} lang={locale}>
      <header className={styles.hero}>
        <div><span className={styles.eyebrow}>{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.intro}</p></div>
        <Link className={styles.heroAction} href="/type-2">{copy.startType2}<span aria-hidden="true">←</span></Link>
      </header>

      <div className={styles.commandGrid}>
        <section className={styles.primaryLane}>
          <div className={styles.sectionHeading}><span>01</span><div><h2>{copy.primary}</h2><p>{copy.primaryHint}</p></div></div>
          <Link className={styles.primaryCard} href="/type-2">
            <div className={styles.primaryIcon}>T2</div>
            <div><span>TYPE 2 DECISION PATHWAY</span><h2>{locale === "fa" ? "ارزیابی و پیشنهاد درمان Type 2" : "Type 2 treatment assessment"}</h2><p>{locale === "fa" ? "HbA1c، درمان فعلی، قلب و کلیه، کبد، وزن، هزینه، بیمه و دسترسی در یک مسیر تصمیم." : "HbA1c, current therapy, cardiorenal, liver, weight, cost, insurance, and access in one decision path."}</p></div>
            <b aria-hidden="true">←</b>
          </Link>
        </section>

        <aside className={styles.coverageRail}>
          <div className={styles.sectionHeading}><span>DATA</span><div><h2>{copy.dataTitle}</h2><p>{copy.dataHint}</p></div></div>
          <div className={styles.dataGrid}>
            <article><b>{dataMetrics?.productCount?.toLocaleString(locale === "fa" ? "fa-IR" : "en-US") ?? "—"}</b><span>{copy.marketProducts}</span></article>
            <article><b>{dataMetrics?.genericCount?.toLocaleString(locale === "fa" ? "fa-IR" : "en-US") ?? "—"}</b><span>{copy.generics}</span></article>
            <article><b>{dataMetrics?.verifiedPresentationCount?.toLocaleString(locale === "fa" ? "fa-IR" : "en-US") ?? "—"}</b><span>{copy.verifiedPresentations}</span></article>
            <article><b>{dataMetrics?.insuranceRecordCount?.toLocaleString(locale === "fa" ? "fa-IR" : "en-US") ?? "—"}</b><span>{copy.insuranceRecords}</span></article>
          </div>
          <div className={styles.dataMeta}><span>{copy.lastUpdated}: <b>{lastUpdated}</b></span><a href="mailto:info@glymize.ir?subject=GLYMIZE%20Data%20or%20Clinical%20Feedback">{copy.contact}</a></div>
        </aside>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHeading}><span>02</span><div><h2>{copy.workflow}</h2><p>{copy.workflowHint}</p></div></div>
        <div className={styles.gridThree}>{WORKFLOW_TOOLS.map((tool) => <ToolCard key={tool.href} locale={locale} tool={tool} />)}</div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}><span>03</span><div><h2>{copy.otherPathways}</h2><p>{copy.otherHint}</p></div></div>
        <div className={styles.gridTwo}>{SPECIALTY_TOOLS.map((tool) => <ToolCard key={tool.href} locale={locale} tool={tool} />)}</div>
      </section>

      <section className={styles.safety}><span aria-hidden="true">✓</span><div><strong>{copy.safetyTitle}</strong><p>{copy.safetyBody}</p></div></section>

      <section className={styles.evidenceSection} aria-labelledby="engine-evidence-title">
        <div className={styles.sectionHeading}><span>EV</span><div><h2 id="engine-evidence-title">{copy.evidenceTitle}</h2><p>{copy.evidenceHint}</p></div></div>
        <div className={styles.evidenceGrid}>{engineEvidenceSources.map((source) => <a className={styles.evidenceChip} href={source.sourceUrl} key={source.id} rel="noreferrer" target="_blank" title={locale === "fa" ? source.engineRoleFa : source.engineRoleEn}><strong>{source.shortCode}</strong><span>{copy[source.sourceKind]}</span></a>)}</div>
        <p className={styles.evidenceNote}>{copy.evidenceNote}</p>
      </section>
    </main>
  );
}
