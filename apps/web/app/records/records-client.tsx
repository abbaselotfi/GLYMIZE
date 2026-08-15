"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  PatientHandoffArchiveItem,
  PatientHandoffRecord,
} from "@glymize/contracts";
import {
  getPatientHandoffById,
  listPatientHandoffs,
  lookupPatientHandoff,
} from "../../lib/patient-handoff-client";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./records.module.css";

const PAGE_SIZE = 50;

function recordKindLabel(
  kind: PatientHandoffArchiveItem["patientCodeKind"],
  fa: boolean,
) {
  if (kind === "national_id") {
    return fa ? "\u06a9\u062f \u0645\u0644\u06cc" : "National ID";
  }
  if (kind === "file_number") {
    return fa ? "\u0634\u0645\u0627\u0631\u0647 \u067e\u0631\u0648\u0646\u062f\u0647" : "File number";
  }
  return fa ? "\u06a9\u062f \u062f\u06cc\u06af\u0631" : "Other code";
}

export default function RecordsClient() {
  const { locale, isRtl } = useGlymizeLocale();
  const fa = locale === "fa";

  const [items, setItems] = useState<PatientHandoffArchiveItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<PatientHandoffRecord | null>(null);
  const [searchCode, setSearchCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function loadPage(reset = false) {
    setBusy(true);
    setStatus("");

    try {
      const page = await listPatientHandoffs(
        reset ? null : nextCursor,
        PAGE_SIZE,
      );

      setItems((current) => {
        const merged = reset
          ? page.items
          : [...current, ...page.items];

        const byId = new Map(
          merged.map((item) => [item.id, item]),
        );

        return [...byId.values()];
      });
      setNextCursor(page.nextCursor);
    } catch (reason) {
      const code =
        reason instanceof Error
          ? reason.message
          : "HANDOFF_ARCHIVE_LIST_FAILED";

      setStatus(
        code === "HANDOFF_PERMISSION_DENIED"
          ? (
              fa
                ? "\u062f\u0633\u062a\u0631\u0633\u06cc \u0645\u0634\u0627\u0647\u062f\u0647 \u0622\u0631\u0634\u06cc\u0648 \u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u062d\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a."
                : "Archive access is not enabled for this account."
            )
          : (
              fa
                ? "\u062f\u0631\u06cc\u0627\u0641\u062a \u0622\u0631\u0634\u06cc\u0648 \u0627\u0646\u062c\u0627\u0645 \u0646\u0634\u062f."
                : "Could not load the patient archive."
            ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function openRecord(id: string) {
    setBusy(true);
    setStatus("");

    try {
      setSelected(await getPatientHandoffById(id));
    } catch (reason) {
      const code =
        reason instanceof Error
          ? reason.message
          : "HANDOFF_ARCHIVE_OPEN_FAILED";

      setStatus(
        code === "HANDOFF_NOT_FOUND"
          ? (
              fa
                ? "\u067e\u0631\u0648\u0646\u062f\u0647 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f \u06cc\u0627 \u062f\u06cc\u06af\u0631 \u062f\u0631 \u0627\u06cc\u0646 \u0645\u0637\u0628 \u0642\u0627\u0628\u0644 \u062f\u0633\u062a\u0631\u0633\u06cc \u0646\u06cc\u0633\u062a."
                : "The record was not found or is no longer available to this practice."
            )
          : (
              fa
                ? "\u0628\u0627\u0632 \u06a9\u0631\u062f\u0646 \u067e\u0631\u0648\u0646\u062f\u0647 \u0627\u0646\u062c\u0627\u0645 \u0646\u0634\u062f."
                : "Could not open the record."
            ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function searchExactCode() {
    if (!searchCode.trim()) {
      setStatus(
        fa
          ? "\u06a9\u062f \u0628\u06cc\u0645\u0627\u0631 \u0631\u0627 \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f."
          : "Enter a patient code.",
      );
      return;
    }

    setBusy(true);
    setStatus("");

    try {
      const result = await lookupPatientHandoff(searchCode);
      if (!result.found || !result.record) {
        setSelected(null);
        setStatus(
          fa
            ? "\u067e\u0631\u0648\u0646\u062f\u0647\u200c\u0627\u06cc \u0628\u0627 \u0627\u06cc\u0646 \u06a9\u062f \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f."
            : "No record was found for this code.",
        );
        return;
      }

      setSelected(result.record);
    } catch {
      setStatus(
        fa
          ? "\u062c\u0633\u062a\u200c\u0648\u062c\u0648\u06cc \u067e\u0631\u0648\u0646\u062f\u0647 \u0627\u0646\u062c\u0627\u0645 \u0646\u0634\u062f."
          : "Could not search the record.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadPage(true);
    // Initial archive page only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedName = useMemo(
    () => [selected?.firstName, selected?.lastName]
      .filter(Boolean)
      .join(" "),
    [selected],
  );

  const confirmedLabs =
    selected?.labs.filter((lab) => lab.verification === "confirmed") ?? [];

  const confirmedMedications =
    selected?.medications.filter(
      (medication) => medication.verification === "confirmed",
    ) ?? [];

  return (
    <main
      className={styles.page}
      dir={isRtl ? "rtl" : "ltr"}
      lang={locale}
    >
      <div className={styles.topline}>
        <Link href="/profile">
          {isRtl ? "\u2192" : "\u2190"} {fa ? "\u067e\u0631\u0648\u0641\u0627\u06cc\u0644" : "Profile"}
        </Link>
        <Link href="/care-team">
          {fa ? "\u062a\u06cc\u0645 \u0645\u0631\u0627\u0642\u0628\u062a" : "Care team"}
        </Link>
      </div>

      <header className={styles.hero}>
        <div>
          <span>PATIENT ARCHIVE</span>
          <h1>
            {fa
              ? "\u0622\u0631\u0634\u06cc\u0648 \u067e\u0631\u0648\u0646\u062f\u0647\u200c\u0647\u0627"
              : "Patient archive"}
          </h1>
          <p>
            {fa
              ? "\u062a\u0645\u0627\u0645 \u067e\u0631\u0648\u0646\u062f\u0647\u200c\u0647\u0627\u06cc \u0641\u0639\u0644\u06cc \u0627\u06cc\u0646 \u0645\u0637\u0628 \u062f\u0631 \u0622\u0631\u0634\u06cc\u0648 \u0628\u0627\u0642\u06cc \u0645\u06cc\u200c\u0645\u0627\u0646\u0646\u062f. \u0641\u0647\u0631\u0633\u062a \u0641\u0642\u0637 \u0628\u0631\u0627\u06cc \u0633\u0631\u0639\u062a \u0628\u0647\u200c\u0635\u0648\u0631\u062a \u0635\u0641\u062d\u0647\u200c\u0627\u06cc \u0628\u0627\u0631\u06af\u06cc\u0631\u06cc \u0645\u06cc\u200c\u0634\u0648\u062f \u0648 \u0633\u0642\u0641 \u062a\u0639\u062f\u0627\u062f\u06cc \u0628\u0631\u0627\u06cc \u0622\u0631\u0634\u06cc\u0648 \u062a\u0639\u0631\u06cc\u0641 \u0646\u0634\u062f\u0647 \u0627\u0633\u062a."
              : "All current records for this practice remain in the archive. The list is paginated only for performance; the archive has no product-level record-count cap."}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadPage(true)}
        >
          {fa ? "\u0628\u0647\u200c\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc" : "Refresh"}
        </button>
      </header>

      <section className={styles.searchCard}>
        <div>
          <strong>
            {fa
              ? "\u062c\u0633\u062a\u200c\u0648\u062c\u0648\u06cc \u062f\u0642\u06cc\u0642 \u0628\u0627 \u06a9\u062f \u0628\u06cc\u0645\u0627\u0631"
              : "Exact patient-code search"}
          </strong>
          <small>
            {fa
              ? "\u062f\u06cc\u062f\u0646 \u0641\u0647\u0631\u0633\u062a \u0646\u06cc\u0627\u0632\u06cc \u0628\u0647 \u06a9\u062f \u0646\u062f\u0627\u0631\u062f\u061b \u0627\u06cc\u0646 \u0641\u06cc\u0644\u062f \u0641\u0642\u0637 \u0628\u0631\u0627\u06cc \u0627\u062d\u0636\u0627\u0631 \u0645\u0633\u062a\u0642\u06cc\u0645 \u0627\u0633\u062a."
              : "Browsing needs no code; use this only to retrieve a known patient directly."}
          </small>
        </div>
        <div className={styles.searchAction}>
          <input
            value={searchCode}
            onChange={(event) => setSearchCode(event.target.value)}
            placeholder={fa ? "\u06a9\u062f \u0628\u06cc\u0645\u0627\u0631" : "Patient code"}
            autoComplete="off"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void searchExactCode()}
          >
            {fa ? "\u0627\u062d\u0636\u0627\u0631" : "Load"}
          </button>
        </div>
      </section>

      <div className={styles.layout}>
        <section className={styles.archiveCard}>
          <div className={styles.cardHeader}>
            <div>
              <span>{items.length}</span>
              <strong>
                {fa
                  ? "\u0631\u06a9\u0648\u0631\u062f \u0628\u0627\u0631\u06af\u06cc\u0631\u06cc\u200c\u0634\u062f\u0647"
                  : "records loaded"}
              </strong>
            </div>
            {nextCursor && (
              <small>
                {fa
                  ? "\u067e\u0631\u0648\u0646\u062f\u0647\u200c\u0647\u0627\u06cc \u0628\u06cc\u0634\u062a\u0631 \u0645\u0648\u062c\u0648\u062f \u0627\u0633\u062a"
                  : "More records are available"}
              </small>
            )}
          </div>

          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <span>{fa ? "\u0634\u0646\u0627\u0633\u0647" : "Identifier"}</span>
              <span>{fa ? "\u0646\u0648\u0639" : "Type"}</span>
              <span>{fa ? "\u0646\u0633\u062e\u0647" : "Revision"}</span>
              <span>{fa ? "\u0622\u062e\u0631\u06cc\u0646 \u062a\u063a\u06cc\u06cc\u0631" : "Updated"}</span>
              <span />
            </div>

            {items.length === 0 && !busy ? (
              <div className={styles.empty}>
                {fa
                  ? "\u0647\u0646\u0648\u0632 \u067e\u0631\u0648\u0646\u062f\u0647\u200c\u0627\u06cc \u062b\u0628\u062a \u0646\u0634\u062f\u0647 \u0627\u0633\u062a."
                  : "No patient records have been saved yet."}
              </div>
            ) : (
              items.map((item) => (
                <div
                  className={styles.tableRow}
                  key={item.id}
                  data-selected={selected?.id === item.id}
                >
                  <strong>{item.patientCodeDisplay}</strong>
                  <span>{recordKindLabel(item.patientCodeKind, fa)}</span>
                  <span>{item.revision}</span>
                  <span>
                    {new Date(item.updatedAt).toLocaleString(
                      fa ? "fa-IR" : "en-US",
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void openRecord(item.id)}
                  >
                    {fa ? "\u0628\u0627\u0632 \u06a9\u0631\u062f\u0646" : "Open"}
                  </button>
                </div>
              ))
            )}
          </div>

          {nextCursor && (
            <button
              type="button"
              className={styles.loadMore}
              disabled={busy}
              onClick={() => void loadPage(false)}
            >
              {busy
                ? "\u2026"
                : (
                    fa
                      ? "\u0646\u0645\u0627\u06cc\u0634 \u067e\u0631\u0648\u0646\u062f\u0647\u200c\u0647\u0627\u06cc \u0628\u06cc\u0634\u062a\u0631"
                      : "Load more records"
                  )}
            </button>
          )}
        </section>

        <aside className={styles.previewCard}>
          {!selected ? (
            <div className={styles.previewEmpty}>
              <span>PREVIEW</span>
              <strong>
                {fa
                  ? "\u06cc\u06a9 \u067e\u0631\u0648\u0646\u062f\u0647 \u0631\u0627 \u0627\u0632 \u0622\u0631\u0634\u06cc\u0648 \u0628\u0627\u0632 \u06a9\u0646\u06cc\u062f"
                  : "Open a record from the archive"}
              </strong>
              <p>
                {fa
                  ? "\u062c\u0632\u0626\u06cc\u0627\u062a \u0631\u0645\u0632\u06af\u0634\u0627\u06cc\u06cc\u200c\u0634\u062f\u0647 \u0641\u0642\u0637 \u062f\u0631 \u0647\u0645\u06cc\u0646 \u0645\u0637\u0628 \u0646\u0645\u0627\u06cc\u0634 \u062f\u0627\u062f\u0647 \u0645\u06cc\u200c\u0634\u0648\u062f."
                  : "Decrypted clinical details are shown only inside the signed-in practice."}
              </p>
            </div>
          ) : (
            <>
              <div className={styles.previewTitle}>
                <span>{selected.patientCodeDisplay}</span>
                <h2>
                  {selectedName ||
                    (
                      fa
                        ? "\u0628\u06cc\u0645\u0627\u0631 \u0628\u062f\u0648\u0646 \u0646\u0627\u0645 \u062b\u0628\u062a\u200c\u0634\u062f\u0647"
                        : "Patient name not recorded"
                    )}
                </h2>
                <small>
                  rev {selected.revision} \u00b7{" "}
                  {new Date(selected.updatedAt).toLocaleString(
                    fa ? "fa-IR" : "en-US",
                  )}
                </small>
              </div>

              <div className={styles.metrics}>
                <div>
                  <b>{confirmedLabs.length}</b>
                  <span>
                    {fa ? "\u0622\u0632\u0645\u0627\u06cc\u0634 \u062a\u0627\u06cc\u06cc\u062f\u0634\u062f\u0647" : "confirmed labs"}
                  </span>
                </div>
                <div>
                  <b>{confirmedMedications.length}</b>
                  <span>
                    {fa ? "\u062f\u0627\u0631\u0648\u06cc \u062a\u0627\u06cc\u06cc\u062f\u0634\u062f\u0647" : "confirmed medications"}
                  </span>
                </div>
              </div>

              {selected.labs.length > 0 && (
                <section className={styles.detailSection}>
                  <h3>{fa ? "\u0622\u0632\u0645\u0627\u06cc\u0634\u200c\u0647\u0627" : "Labs"}</h3>
                  <div className={styles.detailList}>
                    {selected.labs.map((lab) => (
                      <div key={lab.id}>
                        <strong>{(lab.canonicalName ?? lab.rawName) || "\u2014"}</strong>
                        <span>
                          {lab.valueText ??
                            (
                              lab.value !== undefined
                                ? String(lab.value)
                                : "\u2014"
                            )}{" "}
                          {lab.unit ?? ""}
                        </span>
                        <small>
                          {lab.referenceRange || "\u2014"} \u00b7 {lab.verification}{lab.interpretation ? ` \u00b7 ${lab.interpretation}` : ""}
                        </small>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {selected.medications.length > 0 && (
                <section className={styles.detailSection}>
                  <h3>{fa ? "\u062f\u0627\u0631\u0648\u0647\u0627" : "Medications"}</h3>
                  <div className={styles.detailList}>
                    {selected.medications.map((medication, index) => (
                      <div key={`${medication.genericName}-${index}`}>
                        <strong>{medication.genericName}</strong>
                        <span>
                          {medication.doseAmount ?? "\u2014"}{" "}
                          {medication.doseUnit ?? ""}
                        </span>
                        <small>{medication.verification}</small>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {selected.nurseNotes && (
                <section className={styles.detailSection}>
                  <h3>{fa ? "\u06cc\u0627\u062f\u062f\u0627\u0634\u062a" : "Notes"}</h3>
                  <p>{selected.nurseNotes}</p>
                </section>
              )}
            </>
          )}
        </aside>
      </div>

      {status && (
        <div className={styles.status} role="status">
          {status}
        </div>
      )}
    </main>
  );
}
