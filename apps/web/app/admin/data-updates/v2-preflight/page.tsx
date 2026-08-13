"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  buildClinicianMarketDeploymentRuntime,
  preflightClinicianMarketV23,
  sha256Blob,
  type ClinicianMarketV23PreflightResult,
} from "../../../../lib/clinician-market-v2-import";
import {
  preflightDrugMarketV2,
  type DrugMarketV2PreflightResult,
} from "../../../../lib/drug-market-v2-preflight";
import styles from "./v2-preflight.module.css";

function fmt(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function mb(value: number) {
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

type WritableFile = {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
};

type BrowserFileHandle = {
  createWritable(): Promise<WritableFile>;
};

type BrowserDirectoryHandle = {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<BrowserDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<BrowserFileHandle>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<BrowserDirectoryHandle>;
};

export default function DrugMarketV2PreflightPage() {
  const [runtimeResult, setRuntimeResult] = useState<ClinicianMarketV23PreflightResult | null>(null);
  const [canonicalResult, setCanonicalResult] = useState<DrugMarketV2PreflightResult | null>(null);
  const [message, setMessage] = useState("فایل `glymize-clinician-market-v2.json` خروجی Extractor را انتخاب کنید.");
  const [busy, setBusy] = useState(false);
  const [sourceSize, setSourceSize] = useState<number | null>(null);
  const [deploymentSize, setDeploymentSize] = useState<number | null>(null);
  const [deploymentSha, setDeploymentSha] = useState<string | null>(null);

  const runtimePayload = useRef<unknown>(null);
  const runtimeSourceName = useRef("glymize-clinician-market-v2.json");
  const deploymentBlob = useRef<Blob | null>(null);
  const deploymentMetaBlob = useRef<Blob | null>(null);

  async function inspectRuntime(file: File) {
    setBusy(true);
    setRuntimeResult(null);
    setDeploymentSize(null);
    setDeploymentSha(null);
    deploymentBlob.current = null;
    deploymentMetaBlob.current = null;
    runtimePayload.current = null;
    runtimeSourceName.current = file.name;
    setSourceSize(file.size);
    setMessage(`در حال Preflight فایل ${file.name}…`);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const next = preflightClinicianMarketV23(parsed);
      setRuntimeResult(next);
      if (next.acceptedForDeployment) {
        runtimePayload.current = parsed;
        setMessage("Runtime v2.3 پاس شد. اکنون می‌توانید نسخه بهینه GLYMIZE را بسازید.");
      } else {
        setMessage("Runtime رد شد؛ فایل فعال GLYMIZE بدون تغییر می‌ماند.");
      }
    } catch {
      setMessage("Runtime JSON قابل خواندن نیست یا فایل ناقص است.");
    } finally {
      setBusy(false);
    }
  }

  async function inspectCanonical(file: File) {
    setBusy(true);
    setCanonicalResult(null);
    setMessage(`در حال Audit اختیاری canonical: ${file.name}…`);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const next = preflightDrugMarketV2(parsed);
      setCanonicalResult(next);
      setMessage(next.acceptedForStaging
        ? "Canonical preflight پاس شد. Runtime همچنان فایل اصلی برای Deploy داخل GLYMIZE است."
        : "Canonical preflight رد شد؛ قبل از انتشار Runtime علت را در Extractor رفع کنید.");
    } catch {
      setMessage("Canonical JSON قابل خواندن نیست یا فایل ناقص است.");
    } finally {
      setBusy(false);
    }
  }

  async function prepareDeployment() {
    if (!runtimePayload.current || !runtimeResult?.acceptedForDeployment) return null;
    setBusy(true);
    setMessage("در حال ساخت Runtime بهینه GLYMIZE؛ هیچ Product حذف نمی‌شود…");
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    try {
      const compact = buildClinicianMarketDeploymentRuntime(runtimePayload.current);
      const blob = new Blob([JSON.stringify(compact)], { type: "application/json" });
      const sha = await sha256Blob(blob);
      const compactRecord = compact as Record<string, unknown>;
      const meta = {
        schemaVersion: 1,
        runtimeSchemaVersion: 2,
        kind: "glymize_clinician_market_deployment_meta",
        sourceFile: runtimeSourceName.current,
        sourceGeneratedAt: runtimeResult.generatedAt,
        canonicalSha256: runtimeResult.canonicalSha256,
        deploymentSha256: sha,
        scope: compactRecord.scope,
        runtimeIntegrity: compactRecord.runtimeIntegrity,
        sourceCalculationValidation: compactRecord.sourceCalculationValidation,
        sourceSemanticValidation: compactRecord.sourceSemanticValidation,
        dashboardMetrics: {
          productCount: runtimeResult.metrics.productCount,
          genericCount: runtimeResult.metrics.genericCount,
          verifiedPresentationCount: runtimeResult.metrics.verifiedPresentationCount,
          insuranceRecordCount: runtimeResult.metrics.insuranceRecordCount,
        },
      };
      const metaBlob = new Blob([JSON.stringify(meta, null, 2)], { type: "application/json" });

      deploymentBlob.current = blob;
      deploymentMetaBlob.current = metaBlob;
      setDeploymentSize(blob.size);
      setDeploymentSha(sha);
      setMessage("نسخه Deployment آماده است. فقط داده‌های audit-heavy حذف شده‌اند؛ Product retention همچنان 100% است.");
      return { blob, metaBlob };
    } catch {
      setMessage("ساخت Runtime بهینه انجام نشد؛ فایل فعال بدون تغییر باقی ماند.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function ensureDeployment() {
    if (deploymentBlob.current && deploymentMetaBlob.current) {
      return { blob: deploymentBlob.current, metaBlob: deploymentMetaBlob.current };
    }
    return prepareDeployment();
  }

  async function downloadDeployment() {
    const prepared = await ensureDeployment();
    if (!prepared) return;

    const download = (blob: Blob, name: string) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
    };

    download(prepared.blob, "glymize-clinician-market-v2.json");
    download(prepared.metaBlob, "glymize-clinician-market-v2.meta.json");
    setMessage("دو فایل Deployment دانلود شدند. می‌توانید آنها را در `apps/web/public/data` جایگزین کنید.");
  }

  async function writeToLocalRepo() {
    const prepared = await ensureDeployment();
    if (!prepared) return;

    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      setMessage("مرورگر شما File System Access API ندارد؛ از دکمه دانلود استفاده کنید.");
      return;
    }

    try {
      setMessage("پوشه ریشه GLYMIZE-RC را انتخاب کنید…");
      const root = await picker({ mode: "readwrite" });
      const apps = await root.getDirectoryHandle("apps");
      const web = await apps.getDirectoryHandle("web");
      const publicDir = await web.getDirectoryHandle("public");
      const dataDir = await publicDir.getDirectoryHandle("data");

      const runtimeHandle = await dataDir.getFileHandle("glymize-clinician-market-v2.json", { create: true });
      const runtimeWriter = await runtimeHandle.createWritable();
      await runtimeWriter.write(prepared.blob);
      await runtimeWriter.close();

      const metaHandle = await dataDir.getFileHandle("glymize-clinician-market-v2.meta.json", { create: true });
      const metaWriter = await metaHandle.createWritable();
      await metaWriter.write(prepared.metaBlob);
      await metaWriter.close();

      setMessage("Runtime v2.3 مستقیماً داخل پروژه نوشته شد. اکنون Typecheck/Test/Build را اجرا کنید؛ انتشار GitHub هنوز انجام نشده است.");
    } catch (error) {
      setMessage(error instanceof Error
        ? `نوشتن پروژه انجام نشد: ${error.message}`
        : "نوشتن پروژه لغو یا متوقف شد.");
    }
  }

  const metrics = runtimeResult?.metrics;
  const canonicalMetrics = canonicalResult?.metrics;

  return (
    <main className="shell admin-shell">
      <Link className="back-button" href="/admin/data-updates">→ بازگشت به مرکز به‌روزرسانی</Link>

      <header className="page-heading">
        <div>
          <span className="eyebrow">Market v2.3 · Primary import</span>
          <h1>ورود و آماده‌سازی داده بازار GLYMIZE</h1>
          <p>Runtime جدید را Validate، برای مرورگر بهینه و در صورت تمایل مستقیماً داخل پروژه محلی نصب کنید. هیچ Product بر اساس ATC یا حوزه درمانی حذف نمی‌شود.</p>
        </div>
        <span className={`version-badge${runtimeResult?.acceptedForDeployment ? " connected" : ""}`}>
          {runtimeResult?.acceptedForDeployment ? "READY" : "NO PUBLISH"}
        </span>
      </header>

      <section className="panel">
        <span className="eyebrow">Step 1 · Required</span>
        <h2>Runtime Full Clinical Market</h2>
        <label className="file-picker">
          <span>انتخاب `glymize-clinician-market-v2.json`</span>
          <input
            accept=".json,application/json"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void inspectRuntime(file);
            }}
            type="file"
          />
        </label>
        <p className="muted">فایل کامل در localStorage ذخیره نمی‌شود. رکوردهای Costing مبهم مجازند، اما برای آنها Auto-fill بسته غیرفعال می‌ماند.</p>
      </section>

      {runtimeResult && metrics && <>
        <section className={runtimeResult.acceptedForDeployment ? styles.pass : styles.fail}>
          <strong>{runtimeResult.acceptedForDeployment ? "قابل Deploy" : "رد برای Deploy"}</strong>
          <span>{fmt(runtimeResult.blockers.length)} مانع · {fmt(runtimeResult.warnings.length)} هشدار</span>
        </section>

        <section className={styles.metrics}>
          <article><small>Products</small><b>{fmt(metrics.productCount)}</b></article>
          <article><small>NFI verified presentations</small><b>{fmt(metrics.verifiedPresentationCount)}</b></article>
          <article><small>Retention</small><b>{metrics.productRetentionPercent.toFixed(0)}%</b></article>
          <article><small>Costing resolved</small><b>{fmt(metrics.costingProfileResolvedCount)}</b></article>
          <article><small>Costing ambiguous</small><b>{fmt(metrics.costingProfileAmbiguousCount)}</b></article>
          <article><small>Package resolved</small><b>{fmt(metrics.packageResolvedCount)}</b></article>
          <article><small>Insulin units/package</small><b>{fmt(metrics.insulinResolvedCount)} / {fmt(metrics.insulinProductsCount)}</b></article>
          <article><small>Tablet/Capsule pack</small><b>{fmt(metrics.tabletCapsuleResolvedCount)} / {fmt(metrics.tabletCapsuleProductsCount)}</b></article>
          <article><small>Liquid total mL</small><b>{fmt(metrics.liquidResolvedCount)} / {fmt(metrics.liquidProductsCount)}</b></article>
          <article><small>Inhaler actuations</small><b>{fmt(metrics.inhalerResolvedCount)} / {fmt(metrics.inhalerProductsCount)}</b></article>
          <article><small>Package derivation errors</small><b>{fmt(metrics.packageDerivationErrorCount)}</b></article>
        </section>

        {runtimeResult.blockers.length > 0 && <section className="import-preview has-errors">
          <strong>Blockerهای انتشار</strong>
          <ul>{runtimeResult.blockers.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>}

        {runtimeResult.warnings.length > 0 && <section className="import-warning">
          <strong>هشدارهای Fail-soft</strong>
          <ul>{runtimeResult.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>}

        {runtimeResult.acceptedForDeployment && <section className={`panel ${styles.deployPanel}`}>
          <span className="eyebrow">Step 2 · Optimize & install</span>
          <h2>ساخت نسخه مرورگر GLYMIZE</h2>
          <p>همه Productها و Package/Costing metadata حفظ می‌شوند. فقط Field provenance، Search aliases سنگین، fingerprints و derivation metadata تکراری از نسخه Deploy حذف می‌شوند؛ Canonical/Audit همچنان منبع کامل هستند.</p>
          <div className={styles.sizeRow}>
            <span>Extractor Runtime <b>{sourceSize ? mb(sourceSize) : "—"}</b></span>
            <span>Deployment Runtime <b>{deploymentSize ? mb(deploymentSize) : "هنوز ساخته نشده"}</b></span>
          </div>
          {deploymentSha && <code className={styles.sha}>SHA-256: {deploymentSha}</code>}
          <div className={styles.actions}>
            <button disabled={busy} onClick={() => void prepareDeployment()} type="button">ساخت نسخه بهینه</button>
            <button className="secondary" disabled={busy} onClick={() => void downloadDeployment()} type="button">دانلود فایل آماده</button>
            <button className="secondary" disabled={busy} onClick={() => void writeToLocalRepo()} type="button">نوشتن مستقیم در GLYMIZE-RC</button>
          </div>
          <p className="muted">نوشتن مستقیم فقط در Chrome/Edge دسکتاپ و با انتخاب دستی پوشه ریشه پروژه انجام می‌شود. این دکمه Commit/Push نمی‌کند.</p>
        </section>}
      </>}

      <section className="panel">
        <span className="eyebrow">Optional deep audit</span>
        <h2>Canonical v2</h2>
        <p>برای کنترل کامل Source runها، NFI contamination، collision هویت Generic و Insurance semantics می‌توانید canonical را هم بررسی کنید. برای نصب Runtime اجباری نیست.</p>
        <label className="file-picker">
          <span>انتخاب `glymize-drug-market-v2.json`</span>
          <input
            accept=".json,application/json"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void inspectCanonical(file);
            }}
            type="file"
          />
        </label>
      </section>

      {canonicalResult && canonicalMetrics && <section className={canonicalResult.acceptedForStaging ? styles.pass : styles.fail}>
        <div>
          <strong>{canonicalResult.acceptedForStaging ? "Canonical PASS" : "Canonical FAIL"}</strong>
          <small>{fmt(canonicalMetrics.productCount)} Product · {fmt(canonicalMetrics.insuranceRecordCount)} Insurance</small>
        </div>
        <span>{fmt(canonicalResult.blockers.length)} مانع · {fmt(canonicalResult.warnings.length)} هشدار</span>
      </section>}

      <p className="form-message" role="status">{message}</p>
    </main>
  );
}
