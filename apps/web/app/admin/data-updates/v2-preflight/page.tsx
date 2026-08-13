"use client";

import Link from "next/link";
import { useState } from "react";
import { preflightDrugMarketV2, type DrugMarketV2PreflightResult } from "../../../../lib/drug-market-v2-preflight";
import styles from "./v2-preflight.module.css";

function fmt(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

export default function DrugMarketV2PreflightPage() {
  const [result, setResult] = useState<DrugMarketV2PreflightResult | null>(null);
  const [message, setMessage] = useState("فایل canonical v2 را انتخاب کنید. این صفحه فقط کنترل می‌کند و هیچ داده‌ای را Publish نمی‌کند.");
  const [busy, setBusy] = useState(false);

  async function inspect(file: File) {
    setBusy(true);
    setResult(null);
    setMessage(`در حال خواندن ${file.name}…`);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const next = preflightDrugMarketV2(parsed);
      setResult(next);
      setMessage(next.acceptedForStaging
        ? "Preflight پاس شد. فایل فقط برای مرحله Staging آماده است؛ Publish هنوز انجام نشده."
        : "Preflight رد شد. نسخه فعال GLYMIZE بدون تغییر باقی می‌ماند.");
    } catch {
      setMessage("JSON قابل خواندن نیست یا فایل ناقص است.");
    } finally {
      setBusy(false);
    }
  }

  const metrics = result?.metrics;

  return (
    <main className="shell admin-shell">
      <Link className="back-button" href="/admin/data-updates">→ بازگشت به مرکز به‌روزرسانی</Link>
      <header className="page-heading">
        <div>
          <span className="eyebrow">Canonical v2 safety gate</span>
          <h1>Preflight داده بازار دارو v2</h1>
          <p>قبل از ورود هر Full Run به GLYMIZE، contamination جست‌وجوی NFI، collision هویت Generic، Package و Insurance semantics بررسی می‌شود.</p>
        </div>
        <span className={`version-badge${result?.acceptedForStaging ? " connected" : ""}`}>{result?.acceptedForStaging ? "PASS" : "NO PUBLISH"}</span>
      </header>

      <section className="panel">
        <label className="file-picker">
          <span>انتخاب `glymize-drug-market-v2.json`</span>
          <input accept=".json,application/json" disabled={busy} onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void inspect(file);
          }} type="file" />
        </label>
        <p className="muted">فایل کامل canonical در localStorage ذخیره نمی‌شود. این مرحله فقط در حافظه مرورگر آن را Validate می‌کند.</p>
      </section>

      {result && metrics && <>
        <section className={result.acceptedForStaging ? styles.pass : styles.fail}>
          <strong>{result.acceptedForStaging ? "قابل Staging" : "رد برای Import/Publish"}</strong>
          <span>{result.blockers.length} blocker · {result.warnings.length} warning</span>
        </section>

        <section className={styles.metrics}>
          <article><small>Products</small><b>{fmt(metrics.productCount)}</b></article>
          <article><small>NFI verified</small><b>{fmt(metrics.nfiVerifiedCount)}</b></article>
          <article><small>Insurance</small><b>{fmt(metrics.insuranceRecordCount)}</b></article>
          <article><small>Review queue</small><b>{fmt(metrics.reviewQueueCount)}</b></article>
          <article><small>Merged generic/no components</small><b>{fmt(metrics.mergedGenericWithoutComponentsCount)}</b></article>
          <article><small>Generic-code collisions</small><b>{fmt(metrics.genericCodeIdentityCollisionCount)}</b></article>
          <article><small>Suspicious NFI searches</small><b>{fmt(metrics.suspiciousSearchScopeCount)}</b></article>
          <article><small>Package conflicts</small><b>{fmt(metrics.packageConfidenceConflictCount)}</b></article>
        </section>

        {result.blockers.length > 0 && <section className="import-preview has-errors">
          <strong>Blockerهای انتشار</strong>
          <ul>{result.blockers.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>}

        {result.warnings.length > 0 && <section className="import-warning">
          <strong>هشدارهای نیازمند بازبینی</strong>
          <ul>{result.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>}
      </>}

      <p className="form-message" role="status">{message}</p>
    </main>
  );
}
