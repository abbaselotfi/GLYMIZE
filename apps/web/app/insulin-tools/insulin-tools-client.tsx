"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  INSULIN_THERAPIES,
  allowedInsulinTargets,
  calculateInsulinConversion,
  getInsulinTherapy,
  type InsulinConversionResult,
} from "@glymize/clinical-engine/insulin-conversion";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./insulin-tools.module.css";

function categoryLabel(category: string, fa: boolean) {
  if (category === "basal") return fa ? "بیزال" : "Basal";
  if (category === "premix") return fa ? "میکس" : "Premix";
  if (category === "prandial") return fa ? "پرندیال" : "Prandial";
  return "FRC";
}

function doseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export default function InsulinToolsClient() {
  const { locale, isRtl } = useGlymizeLocale();
  const fa = locale === "fa";
  const [diabetesType, setDiabetesType] = useState<"type_1" | "type_2">("type_2");
  const [sourceId, setSourceId] = useState("glargine-u100");
  const [targetId, setTargetId] = useState("soliqua");
  const [sourceFrequency, setSourceFrequency] = useState(1);
  const [targetFrequency, setTargetFrequency] = useState(2);
  const [doseRows, setDoseRows] = useState([""]);
  const [highHypoglycemiaRisk, setHighHypoglycemiaRisk] = useState(false);
  const [conservativeReduction, setConservativeReduction] = useState(false);
  const [severeRenalImpairmentOrEsrd, setSevereRenalImpairmentOrEsrd] = useState(false);
  const [severeGastroparesis, setSevereGastroparesis] = useState(false);
  const [result, setResult] = useState<InsulinConversionResult | null>(null);
  const [status, setStatus] = useState("");

  const source = useMemo(() => getInsulinTherapy(sourceId), [sourceId]);
  const targets = useMemo(() => allowedInsulinTargets(sourceId, { diabetesType }), [sourceId, diabetesType]);
  const target = useMemo(() => getInsulinTherapy(targetId), [targetId]);
  const totalDailyDose = doseRows.reduce((sum, item) => sum + doseNumber(item), 0);

  useEffect(() => {
    const nextSource = getInsulinTherapy(sourceId);
    const firstFrequency = nextSource?.frequencies[0] ?? 1;
    if (!nextSource?.frequencies.includes(sourceFrequency)) setSourceFrequency(firstFrequency);
  }, [sourceId, sourceFrequency]);

  useEffect(() => {
    setDoseRows((current) => Array.from({ length: sourceFrequency }, (_, index) => current[index] ?? ""));
    setResult(null);
  }, [sourceFrequency]);

  useEffect(() => {
    if (targets.some((item) => item.id === targetId)) return;
    const soliqua = targets.find((item) => item.id === "soliqua");
    setTargetId(soliqua?.id ?? targets[0]?.id ?? "");
    setResult(null);
  }, [sourceId, targetId, targets]);

  useEffect(() => {
    if (target?.category === "premix") {
      const allowed = target.targetFrequencies ?? target.frequencies;
      if (!allowed.includes(targetFrequency)) setTargetFrequency(allowed[0] ?? 2);
    }
  }, [target, targetFrequency]);

  function updateDose(index: number, value: string) {
    setDoseRows((current) => current.map((item, row) => row === index ? value : item));
    setResult(null);
  }

  function calculate() {
    if (!source || !target || totalDailyDose <= 0) {
      setStatus(fa ? "دوز هر نوبت را وارد کنید." : "Enter the dose for each source injection.");
      setResult(null);
      return;
    }
    try {
      const next = calculateInsulinConversion({
        sourceId,
        targetId,
        totalDailyDose,
        sourceFrequency,
        targetFrequency,
        highHypoglycemiaRisk,
        conservativeReduction,
        diabetesType,
        severeRenalImpairmentOrEsrd,
        severeGastroparesis,
      });
      setResult(next);
      setStatus("");
    } catch (error) {
      const code = error instanceof Error ? error.message : "CONVERSION_FAILED";
      const messages: Record<string, string> = {
        SOLIQUA_RANGE: fa ? "دوز بیزال تعدیل‌شده خارج از بازه پشتیبانی‌شده قلم Suliqua/Soliqua است؛ تبدیل عددی خودکار متوقف شد." : "Adjusted basal dose is outside the supported Suliqua/Soliqua pen range; automatic numeric conversion was stopped.",
        INSUFFICIENT_REGIMEN: fa ? "تبدیل بین پرندیال و بیزال/میکس به‌تنهایی یک رژیم کامل نمی‌سازد و در این ابزار مسدود است." : "A prandial ↔ basal/premix switch does not create a complete insulin regimen and is blocked here.",
        INVALID_DOSE: fa ? "دوز کل روزانه معتبر نیست." : "Total daily dose is invalid.",
        FRC_TYPE2_ONLY: fa ? "Suliqua/Soliqua برای دیابت نوع ۱ استفاده نمی‌شود؛ مسیر FRC مسدود شد." : "Suliqua/Soliqua is not used for type 1 diabetes; the FRC path was blocked.",
        SOLIQUA_SEVERE_RENAL_NOT_RECOMMENDED: fa ? "در نارسایی شدید کلیه/ESRD به علت تجربه ناکافی، تبدیل خودکار به Suliqua متوقف شد." : "Automatic Suliqua conversion was stopped in severe renal impairment/ESRD because use is not recommended due to insufficient experience.",
        SOLIQUA_SEVERE_GI_NOT_RECOMMENDED: fa ? "در گاستروپارزی شدید، استفاده از Suliqua توصیه نمی‌شود؛ تبدیل خودکار متوقف شد." : "Suliqua is not recommended in severe gastroparesis; automatic conversion was stopped.",
      };
      setStatus(messages[code] ?? (fa ? "این مسیر تبدیل قابل محاسبه نیست و نیاز به بازبینی دارد." : "This conversion path cannot be calculated and requires review."));
      setResult(null);
    }
  }

  const groupedSources = ["basal", "premix", "prandial"].map((category) => ({
    category,
    items: INSULIN_THERAPIES.filter((item) => item.category === category && !item.targetOnly),
  }));

  return (
    <main className={styles.page} dir={isRtl ? "rtl" : "ltr"} lang={locale}>
      <div className={styles.topline}>
        <Link href="/dashboard">{isRtl ? "→" : "←"} {fa ? "داشبورد" : "Dashboard"}</Link>
        <span>GLYMIZE INSULIN SWITCH ENGINE · v1 LOCAL RC</span>
      </div>

      <header className={styles.hero}>
        <div><span>INSULIN MANAGEMENT</span><h1>{fa ? "تبدیل رژیم انسولین" : "Insulin regimen conversion"}</h1><p>{fa ? "موتور بازطراحی‌شده بر پایه قواعد جهت‌دار، مجموع دوز روزانه، نوع رژیم و مرزهای ایمنی؛ بدون تبدیل‌های ناقص بین پرندیال و بیزال." : "A rebuilt direction-specific engine using total daily dose, regimen type, and safety gates, without incomplete prandial-to-basal conversions."}</p></div>
        <div className={styles.guardrail}>{fa ? "خروجی = نقطه شروع برای بازبینی پزشک" : "Output = clinician-reviewed starting point"}</div>
      </header>

      <div className={styles.layout}>
        <section className={styles.calculator}>
          <div className={styles.sectionTitle}><b>1</b><div><h2>{fa ? "رژیم فعلی" : "Current regimen"}</h2><p>{fa ? "اگر بیمار چند تزریق از یک بیزال/میکس دارد، دوز هر نوبت جدا وارد و مجموع روزانه خودکار محاسبه می‌شود." : "For multiple injections of the same basal/premix, enter each injection; total daily dose is summed automatically."}</p></div></div>
          <div className={styles.frequency}><span>{fa ? "نوع دیابت" : "Diabetes type"}</span><div><button type="button" className={diabetesType === "type_2" ? styles.selected : ""} onClick={() => { setDiabetesType("type_2"); setResult(null); }}>T2</button><button type="button" className={diabetesType === "type_1" ? styles.selected : ""} onClick={() => { setDiabetesType("type_1"); setResult(null); }}>T1</button></div></div>
          <label className={styles.field}><span>{fa ? "انسولین مبدأ" : "Source insulin"}</span><select value={sourceId} onChange={(event) => { setSourceId(event.target.value); setResult(null); }}>
            {groupedSources.map((group) => <optgroup label={categoryLabel(group.category, fa)} key={group.category}>{group.items.map((item) => <option value={item.id} key={item.id}>{item.generic} · {item.brand}</option>)}</optgroup>)}
          </select></label>
          {source && source.frequencies.length > 1 && <div className={styles.frequency}><span>{fa ? "تعداد تزریق مبدأ در روز" : "Source injections per day"}</span><div>{source.frequencies.map((count) => <button type="button" className={sourceFrequency === count ? styles.selected : ""} key={count} onClick={() => setSourceFrequency(count)}>{count}×</button>)}</div></div>}
          <div className={styles.doseGrid}>{doseRows.map((dose, index) => <label className={styles.field} key={index}><span>{sourceFrequency === 1 ? (fa ? "دوز روزانه" : "Daily dose") : (fa ? `دوز نوبت ${index + 1}` : `Injection ${index + 1} dose`)}</span><div className={styles.unitInput}><input inputMode="decimal" value={dose} onChange={(e) => updateDose(index, e.target.value)} /><b>units</b></div></label>)}</div>
          <div className={styles.total}><span>{fa ? "مجموع دوز روزانه مبدأ" : "Source total daily dose"}</span><strong>{totalDailyDose || "—"} {fa ? "واحد" : "units"}</strong></div>

          <div className={styles.divider} />
          <div className={styles.sectionTitle}><b>2</b><div><h2>{fa ? "رژیم جایگزین" : "Destination regimen"}</h2><p>{fa ? "Soliqua برای مبدأ بیزال و میکس قابل انتخاب است؛ مقصدهای ناسازگار از ابتدا نمایش داده نمی‌شوند." : "Soliqua remains available for basal and premix sources; incompatible targets are removed before calculation."}</p></div></div>
          <label className={styles.field}><span>{fa ? "انسولین مقصد" : "Target insulin"}</span><select value={targetId} onChange={(event) => { setTargetId(event.target.value); setResult(null); }}>{targets.map((item) => <option value={item.id} key={item.id}>{item.generic} · {item.brand}</option>)}</select></label>
          {target?.category === "premix" && <div className={styles.frequency}><span>{fa ? "تعداد تزریق مقصد" : "Target injections"}</span><div>{(target.targetFrequencies ?? target.frequencies).map((count) => <button type="button" className={targetFrequency === count ? styles.selected : ""} key={count} onClick={() => setTargetFrequency(count)}>{count}×</button>)}</div></div>}

          {target?.category === "frc" && <div className={styles.frcSafety}><strong>{fa ? "چک ایمنی FRC" : "FRC safety check"}</strong><label><input type="checkbox" checked={severeRenalImpairmentOrEsrd} onChange={(e) => { setSevereRenalImpairmentOrEsrd(e.target.checked); setResult(null); }} /><span>{fa ? "نارسایی شدید کلیه / ESRD (CrCl <30 یا وضعیت معادل بالینی)" : "Severe renal impairment / ESRD (CrCl <30 or clinical equivalent)"}</span></label><label><input type="checkbox" checked={severeGastroparesis} onChange={(e) => { setSevereGastroparesis(e.target.checked); setResult(null); }} /><span>{fa ? "گاستروپارزی شدید" : "Severe gastroparesis"}</span></label></div>}

          <div className={styles.options}>
            <label><input type="checkbox" checked={highHypoglycemiaRisk} onChange={(e) => { setHighHypoglycemiaRisk(e.target.checked); setResult(null); }} /><span><strong>{fa ? "ریسک بالاتر هیپوگلیسمی" : "Higher hypoglycemia risk"}</strong><small>{fa ? "در مسیرهای بدون rule اختصاصی، شروع محافظه‌کارانه‌تر لحاظ می‌شود." : "Uses a more conservative starting factor where no product-specific rule overrides it."}</small></span></label>
            <label><input type="checkbox" checked={conservativeReduction} onChange={(e) => { setConservativeReduction(e.target.checked); setResult(null); }} /><span><strong>{fa ? "کاهش احتیاطی ۲۰٪" : "Conservative 20% reduction"}</strong><small>{fa ? "فقط وقتی rule اختصاصی محصول قفل نشده باشد." : "Only when a product-specific rule does not lock the factor."}</small></span></label>
          </div>
          <button className={styles.calculate} type="button" onClick={calculate}>{fa ? "محاسبه تبدیل انسولین" : "Calculate insulin conversion"}</button>
          {status && <div className={styles.status}>{status}</div>}
        </section>

        <aside className={styles.result}>
          {!result ? <div className={styles.empty}><span>IU</span><h2>{fa ? "خروجی تبدیل" : "Conversion result"}</h2><p>{fa ? "مبدأ، دوزها و مقصد را انتخاب کنید. موتور فقط مسیرهای کامل و قابل دفاع را محاسبه می‌کند." : "Choose source, doses, and target. The engine calculates only complete, defensible pathways."}</p></div> : <div className={styles.resultContent}>
            <div className={styles.resultHeader}><span>{result.specialistReview ? (fa ? "نیازمند بازبینی تخصصی" : "Specialist review") : (fa ? "محاسبه اولیه" : "Initial conversion")}</span><strong>{result.estimatedTotalDailyDose} {result.soliqua ? (fa ? "dose-step شروع" : "starting dose-steps") : (fa ? "واحد/روز" : "units/day")}</strong><small>{result.source.brand} → {result.target.brand}</small></div>
            <article><h3>{fa ? "فرمول" : "Formula"}</h3><code>{result.formula}</code></article>
            {result.soliqua && <article className={styles.soliqua}><h3>Suliqua / Soliqua</h3><div className={styles.metricGrid}><div><span>{fa ? "قلم" : "Pen"}</span><b>{result.soliqua.pen}</b></div><div><span>{fa ? "بازه قلم" : "Pen range"}</span><b>{result.soliqua.penRange}</b></div><div><span>{fa ? "بیزال تعدیل‌شده" : "Adjusted basal"}</span><b>{result.adjustedBasalDose} U</b></div></div></article>}
            {result.sourceComposition && <article><h3>{fa ? "ترکیب میکس مبدأ" : "Source premix composition"}</h3><p>{result.sourceComposition.basalPercent}% basal = {result.sourceComposition.basalDose} U · {result.sourceComposition.prandialPercent}% prandial = {result.sourceComposition.prandialDose} U</p></article>}
            {result.targetComposition && <article><h3>{fa ? "ترکیب میکس مقصد" : "Target premix composition"}</h3><p>{result.targetComposition.basalPercent}% basal / {result.targetComposition.prandialPercent}% prandial</p>{result.arithmeticSchedule && <div className={styles.schedule}>{result.arithmeticSchedule.map((item) => <span key={item.injection}>{fa ? `نوبت ${item.injection}` : `Dose ${item.injection}`}: <b>{item.dose} U</b></span>)}</div>}</article>}
            <article><h3>{fa ? "منطق تبدیل" : "Rationale"}</h3><ul>{(fa ? result.rationaleFa : result.rationale).map((item) => <li key={item}>{item}</li>)}</ul></article>
            {result.warnings.length > 0 && <article className={styles.warning}><h3>{fa ? "هشدارهای لازم" : "Required cautions"}</h3><ul>{(fa ? result.warningsFa : result.warnings).map((item) => <li key={item}>{item}</li>)}</ul></article>}
            {result.requiresPrandialPlan && <div className={styles.critical}>{fa ? "این تبدیل پوشش پرندیال رژیم قبلی را جایگزین نمی‌کند. قبل از اجرا باید برنامه کنترل قند/پرندیال جداگانه تعیین شود." : "This conversion does not replace the source regimen's prandial coverage. A separate prandial/glycemic plan is required before implementation."}</div>}
            <small className={styles.evidence}>{result.evidence.join(" · ")}</small>
          </div>}
        </aside>
      </div>
    </main>
  );
}
