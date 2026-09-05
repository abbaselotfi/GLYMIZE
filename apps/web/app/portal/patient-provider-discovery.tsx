"use client";

import type { PublicProviderProfile } from "@glymize/contracts";
import { FormEvent, useState } from "react";

import { searchProviderDirectory } from "../../lib/provider-directory-client";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./patient-identity-portal.module.css";

type Props = {
  enabled: boolean;
};

function visitModeLabel(mode: PublicProviderProfile["visitModes"][number], fa: boolean) {
  if (!fa) return mode.replaceAll("_", " ");
  if (mode === "in_person") return "حضوری";
  if (mode === "audio") return "صوتی";
  if (mode === "video") return "ویدیویی";
  return "غیرهمزمان";
}

/**
 * Patient-safe provider discovery only.
 * Search results are the public provider projection and cannot create a care
 * relationship, redeem a referral, or grant access to a clinical record.
 */
export default function PatientProviderDiscovery({ enabled }: Props) {
  const { locale } = useGlymizeLocale();
  const fa = locale === "fa";
  const [query, setQuery] = useState("");
  const [providers, setProviders] = useState<PublicProviderProfile[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!enabled) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await searchProviderDirectory({
        query: query.trim() || undefined,
        limit: 20,
      });
      setProviders(result.providers);
      setSearched(true);
    } catch {
      setProviders([]);
      setSearched(true);
      setError(
        fa
          ? "جست‌وجوی پزشک فعلاً در دسترس نیست. هیچ رابطه مراقبتی یا دسترسی پرونده‌ای ایجاد نشده است."
          : "Provider search is temporarily unavailable. No care relationship or record access was created.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.discovery} data-patient-section="provider-discovery">
      <div>
        <h2>{fa ? "پیدا کردن پزشک" : "Find a clinician"}</h2>
        <p>
          {fa
            ? "بر اساس نام، تخصص یا کد نظام پزشکی جست‌وجو کنید. پیدا کردن پزشک به‌تنهایی هیچ دسترسی درمانی ایجاد نمی‌کند."
            : "Search by name, specialty, or medical council code. Discovery alone never grants clinical access."}
        </p>
      </div>

      <form onSubmit={(event) => void submit(event)}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={fa ? "نام پزشک، تخصص یا کد نظام پزشکی" : "Name, specialty, or medical council code"}
          aria-label={fa ? "جست‌وجوی پزشک" : "Search clinicians"}
        />
        <button type="submit" disabled={busy}>
          {busy ? (fa ? "در حال جست‌وجو…" : "Searching…") : (fa ? "جست‌وجو" : "Search")}
        </button>
      </form>

      {error ? <p className={styles.error} role="status">{error}</p> : null}

      {searched && !error ? (
        providers.length > 0 ? (
          <div className={styles.practices} data-provider-search-results="patient-safe">
            {providers.map((provider) => (
              <article key={provider.id}>
                <span aria-hidden="true">MD</span>
                <div>
                  <strong>{provider.displayName}</strong>
                  <small>{provider.specialtyName}{provider.subspecialtyName ? ` · ${provider.subspecialtyName}` : ""}</small>
                  <small>{provider.practiceDisplayName}{provider.publicLocation ? ` · ${provider.publicLocation}` : ""}</small>
                  {provider.medicalCouncilCode ? <small>{fa ? "نظام پزشکی" : "Medical council"}: {provider.medicalCouncilCode}</small> : null}
                  {provider.visitModes.length > 0 ? (
                    <small>{provider.visitModes.map((mode) => visitModeLabel(mode, fa)).join(" · ")}</small>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.unlinked}>
            <strong>{fa ? "پزشکی با این جست‌وجو پیدا نشد" : "No clinician matched this search"}</strong>
          </div>
        )
      ) : null}

      <p className={styles.boundaryNote}>
        {fa
          ? "نتیجه جست‌وجو فقط پروفایل عمومی و patient-safe است. درخواست رابطه مراقبتی، referral یا دسترسی پرونده جریان‌های جداگانه و تأییدشده هستند."
          : "Search returns only the patient-safe public profile. Care-relationship requests, referrals, and record access are separate verified workflows."}
      </p>
    </section>
  );
}
