"use client";

import { useEffect, useMemo, useState } from "react";
import { loadOfflineReference, searchOfflineReferences } from "../../lib/offline-reference";
import { publicOfflineNavigationEnabled } from "../../lib/public-offline-navigation";
import { withBasePath } from "../../lib/base-path";
import Link from "../components/public-document-link";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./reference.module.css";

export default function OfflineReferences() {
  const { locale, setLocale } = useGlymizeLocale();
  const fa = locale === "fa";
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadOfflineReference>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [installation, setInstallation] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  useEffect(() => {
    if (!publicOfflineNavigationEnabled) return;
    const controller = new AbortController();
    setFailed(false);
    void loadOfflineReference(controller.signal).then((result) => {
      if (!controller.signal.aborted) setLoaded(result);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [attempt]);
  const results = useMemo(() => searchOfflineReferences(loaded?.data.rows ?? [], query, page), [loaded, query, page]);
  async function install() {
    setInstallation("loading");
    try {
      const registration = await navigator.serviceWorker.register(withBasePath("/sw.js"), { scope: withBasePath("/") });
      const worker = registration.installing ?? registration.waiting;
      if (worker && worker.state !== "installed" && worker.state !== "activated") {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => finish(new Error("install_timeout")), 120000);
          const changed = () => {
            if (worker.state === "installed" || worker.state === "activated") finish();
            else if (worker.state === "redundant") finish(new Error("install_failed"));
          };
          const finish = (error?: Error) => { clearTimeout(timer); worker.removeEventListener("statechange", changed); error ? reject(error) : resolve(); };
          worker.addEventListener("statechange", changed);
          changed();
        });
      }
      const installedWorker = registration.waiting ?? registration.active;
      if (!installedWorker) throw new Error("install_not_ready");
      // An existing legacy worker must never be reported as a reference-lite install.
      await new Promise<void>((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => finish(new Error("profile_timeout")), 60000);
        const finish = (error?: Error) => { clearTimeout(timer); channel.port1.close(); error ? reject(error) : resolve(); };
        channel.port1.onmessage = (event) => {
          if (event.data?.profile === "reference-lite" && /^[a-f0-9]{24}$/.test(event.data?.version ?? "")) finish();
          else finish(new Error("profile_invalid"));
        };
        installedWorker.postMessage({ type: "REFERENCE_BUNDLE_STATUS" }, [channel.port2]);
      });
      if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
      setInstallation("ready");
    } catch { setInstallation("failed"); }
  }
  const pick = (persian: string, english: string) => fa ? persian : english;
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>GLYMIZE <span>REFERENCE / 01</span></Link>
      <button type="button" onClick={() => setLocale(fa ? "en" : "fa")}>{fa ? "English" : "فارسی"}</button>
    </header>
    <section className={styles.hero}>
      <p className={styles.eyebrow}>{pick("کتابخانهٔ محلی · فقط مراجع", "LOCAL LIBRARY · REFERENCE ONLY")}</p>
      <h1>{pick("مرجع در دسترس؛ حتی هنگام قطع ارتباط.", "References within reach. Even without a connection.")}</h1>
      <p>{pick("پس از تکمیل دریافت بسته، این مراجع روی همین دستگاه قابل مشاهده‌اند. این صفحه محاسبهٔ درمان، تجویز یا دسترسی به پروندهٔ بیمار ندارد.", "After the bundle download completes, references are available on this device. No treatment calculation, prescribing or patient-record access is provided here.")}</p>
      <aside className={styles.notice}>{pick("اطلاعات نسخهٔ دریافت‌شده، نه تضمین آخرین داده، مجوز معتبر امروز یا موجودی بازار. اطلاعات بیمار وارد نکنید؛ متن جستجو ذخیره نمی‌شود.", "An installed snapshot—not proof of latest data, a current license or stock. Do not enter patient information; searches are not saved.")}</aside>
      {publicOfflineNavigationEnabled && <button type="button" disabled={installation === "loading"} onClick={() => void install()}>
        {installation === "loading" ? pick("در حال دریافت بسته…", "Downloading bundle…") : pick("دریافت / به‌روزرسانی بستهٔ آفلاین", "Download / update offline bundle")}
      </button>}
      <p role="status">{installation === "ready" ? pick("دریافت کامل شد. صفحه را دوباره باز کنید؛ پاک‌سازی حافظهٔ مرورگر می‌تواند بسته را حذف کند.", "Download complete. Reopen the page; clearing browser storage can remove the bundle.") : installation === "failed" ? pick("دریافت کامل نشد؛ دوباره تلاش کنید. بستهٔ ناقص آمادهٔ آفلاین نیست.", "Download incomplete. Retry; an incomplete bundle is not offline-ready.") : ""}</p>
    </section>
    {!publicOfflineNavigationEnabled ? <p className={styles.notice}>{pick("این ساخت، بستهٔ مراجع آفلاین ندارد.", "This build does not include an offline reference bundle.")}</p> : failed ? <div role="alert"><p>{pick("مراجع در دسترس نیست. ابتدا دریافت کامل بسته لازم است.", "References unavailable. Complete the bundle download first.")}</p><button type="button" onClick={() => setAttempt(attempt + 1)}>{pick("تلاش دوباره", "Retry")}</button></div> : !loaded ? <p role="status">{pick("در حال خواندن مراجع…", "Loading references…")}</p> : <>
      <div className={styles.provenance}>
        <p>{pick("تاریخ منبع", "Source date")}: <bdi>{loaded.data.sourceDate}</bdi></p>
        <p>{pick("نسخهٔ بسته", "Bundle version")}: <bdi>{loaded.bundleVersion ?? pick("از شبکه؛ نصب آفلاین تأیید نشده", "Network copy; offline installation not confirmed")}</bdi></p>
        <details><summary>{pick("شناسهٔ یکپارچگی منبع (نه امضای ناشر)", "Source integrity hash (not a publisher signature)")}</summary><code>{loaded.data.sourceHash}</code></details>
      </div>
      <label className={styles.search}>{pick("جستجوی نام دارو یا شناسهٔ محصول", "Search medicine name or product ID")}
        <input type="search" autoComplete="off" maxLength={160} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
      </label>
      <p role="status">{results.count} {pick("مرجع", "references")}</p>
      <div className={styles.grid}>{results.rows.map((row) => <article key={row.id} className={styles.card}>
        <p className={styles.identifier}><bdi>{row.id}</bdi></p><h2><bdi>{row.brand || row.name}</bdi></h2><p><bdi>{row.name}</bdi></p>
        <dl>{[[pick("شکل / قدرت", "Form / strength"), `${row.form ?? "—"} / ${row.strength ?? "—"}`], [pick("برچسب مجوز در منبع", "Source license label"), row.license], [pick("تاریخ مشاهده", "Observed at"), row.observation]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd><bdi>{value || pick("نامشخص", "Unknown")}</bdi></dd></div>)}</dl>
        {row.sourceUrl && <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{pick("باز کردن منبع (نیازمند اینترنت)", "Open source (internet required)")}</a>}
      </article>)}</div>
      <nav className={styles.pagination} aria-label={pick("صفحه‌بندی مراجع", "Reference pages")}>
        <button type="button" disabled={results.current === 0} onClick={() => setPage(results.current - 1)}>{pick("قبلی", "Previous")}</button>
        <span>{results.current + 1} / {results.pages}</span>
        <button type="button" disabled={results.current + 1 >= results.pages} onClick={() => setPage(results.current + 1)}>{pick("بعدی", "Next")}</button>
      </nav>
    </>}
  </main>;
}
