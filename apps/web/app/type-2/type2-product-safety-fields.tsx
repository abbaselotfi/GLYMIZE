"use client";

import { useEffect, useState } from "react";
import { loadType2ReviewedProductSafetyReviewSetsV2 } from "../../lib/type2-product-safety-metadata";
import styles from "./type2-scenarios.module.css";
import {
  type2ProductSafetyResponseStateV2,
  updateType2ProductSafetyScreensV2,
  type Type2ProductSafetyResponseStateV2,
  type Type2ProductSafetyScreenV2,
  type Type2ReviewedProductSafetyReviewSetV2,
} from "./type2-product-safety-ui";

interface Props {
  screens: readonly Type2ProductSafetyScreenV2[];
  locale: "fa" | "en";
  onChange: (screens: Type2ProductSafetyScreenV2[]) => void;
}

type LoadState = "loading" | "ready" | "error";

export default function Type2ProductSafetyFields({ screens, locale, onChange }: Props) {
  const fa = locale === "fa";
  const [reviewSets, setReviewSets] = useState<Type2ReviewedProductSafetyReviewSetV2[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    void loadType2ReviewedProductSafetyReviewSetsV2()
      .then((sets) => {
        if (cancelled) return;
        setReviewSets(sets);
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setReviewSets([]);
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div data-testid="type2-product-safety-screen">
      <div className={styles.subhead}>
        <div>
          <b>{fa ? "غربالگری ایمنی محصول برای مسیر MASH" : "Product-specific safety screening for the MASH pathway"}</b>
          <small>
            {fa
              ? "فقط review-set نسخه‌دار و تأییدشده از همان runtime دارویی نمایش داده می‌شود. پاسخ ناقص یا نامشخص مسیر اجرایی را fail-closed نگه می‌دارد."
              : "Only the versioned reviewed set from the same medication runtime is shown. Missing or unknown answers keep product execution fail-closed."}
          </small>
        </div>
      </div>

      {loadState === "loading" ? (
        <div className={styles.emptyLine} data-testid="type2-product-safety-loading">
          {fa ? "در حال بارگذاری review-set ایمنی تأییدشده…" : "Loading reviewed product-safety metadata…"}
        </div>
      ) : null}

      {loadState !== "loading" && reviewSets.length === 0 ? (
        <div className={styles.emptyLine} data-testid="type2-product-safety-unavailable">
          {fa
            ? "review-set معتبر برای فرآوردهٔ جاری در دسترس نیست؛ هیچ پاسخ یا مجوز ایمنی پیش‌فرض ساخته نمی‌شود."
            : "No current authoritative review set is available; no default safety answer or clearance is fabricated."}
        </div>
      ) : null}

      {reviewSets.map((reviewSet) => (
        <div
          key={`${reviewSet.masterDrugId}:${reviewSet.reviewSetId}:${reviewSet.reviewSetVersion}`}
          data-review-set-id={reviewSet.reviewSetId}
          data-review-set-version={reviewSet.reviewSetVersion}
        >
          <div className={styles.subhead}>
            <div>
              <b>{reviewSet.productIdentity.brandName} · {reviewSet.productIdentity.route}</b>
              <small>
                {fa ? "نسخه" : "Version"}: {reviewSet.reviewSetVersion} · {reviewSet.reviewSetId}
              </small>
            </div>
          </div>
          <div className={styles.twoCols}>
            {reviewSet.criteria.map((criterion) => {
              const value = type2ProductSafetyResponseStateV2(
                screens,
                reviewSet,
                criterion.criterionId,
              ) ?? "";
              return (
                <label className={styles.selectField} key={criterion.criterionId}>
                  <span>{fa ? criterion.promptFa : criterion.label}</span>
                  <select
                    data-product-safety-criterion={criterion.criterionId}
                    value={value}
                    onChange={(event) => {
                      const selected = event.target.value as Type2ProductSafetyResponseStateV2 | "";
                      onChange(updateType2ProductSafetyScreensV2(
                        screens,
                        reviewSet,
                        criterion.criterionId,
                        selected || undefined,
                      ));
                    }}
                  >
                    <option value="">{fa ? "پاسخ داده نشده" : "Not answered"}</option>
                    <option value="present">{fa ? "بله" : "Present"}</option>
                    <option value="absent">{fa ? "خیر" : "Absent"}</option>
                    <option value="unknown">{fa ? "نامشخص" : "Unknown"}</option>
                  </select>
                </label>
              );
            })}
          </div>
          <p className={styles.costProfileHint}>
            {fa
              ? "«پاسخ داده نشده» هیچ factی ارسال نمی‌کند؛ «نامشخص» فقط با انتخاب صریح ثبت می‌شود. کامل بودن این فرم به‌تنهایی تأیید کلی ایمنی یا دستور درمان نیست."
              : "Not answered sends no fact; Unknown is sent only when explicitly selected. Completing this set is not global product clearance or a treatment order."}
          </p>
        </div>
      ))}
    </div>
  );
}
