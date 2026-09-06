import type { PatientWorkspaceOrderSummary } from "@glymize/contracts";
import styles from "./patient-workspace-orders.module.css";

type Locale = "fa" | "en";

type Props = {
  orders: PatientWorkspaceOrderSummary[];
  locale: Locale;
  onOpenEncounter: (encounterId: string) => void | Promise<void>;
};

const stateLabels: Record<
  PatientWorkspaceOrderSummary["state"],
  { fa: string; en: string }
> = {
  pending: { fa: "در انتظار", en: "Pending" },
  in_progress: { fa: "در حال انجام", en: "In progress" },
  result_received: { fa: "نتیجه دریافت شده", en: "Result received" },
  completed: { fa: "تکمیل شده", en: "Completed" },
  cancelled: { fa: "لغو شده", en: "Cancelled" },
  unable_to_process: { fa: "قابل انجام نبوده", en: "Unable to process" },
};

function orderTitle(item: PatientWorkspaceOrderSummary) {
  if ("genericName" in item.order) {
    return item.order.brandName
      ? `${item.order.genericName} · ${item.order.brandName}`
      : item.order.genericName;
  }
  return item.order.displayName;
}

function orderDetails(item: PatientWorkspaceOrderSummary, locale: Locale) {
  if ("genericName" in item.order) {
    const parts: string[] = [];
    if (item.order.doseAmount !== undefined || item.order.doseUnit) {
      parts.push(
        [item.order.doseAmount, item.order.doseUnit]
          .filter((value) => value !== undefined && value !== "")
          .join(" "),
      );
    }
    if (item.order.frequencyPerDay !== undefined) {
      parts.push(
        locale === "fa"
          ? `${item.order.frequencyPerDay} بار در روز`
          : `${item.order.frequencyPerDay}× daily`,
      );
    } else if (item.order.frequencyCode) {
      parts.push(item.order.frequencyCode);
    }
    if (item.order.durationDays !== undefined) {
      parts.push(
        locale === "fa"
          ? `${item.order.durationDays} روز`
          : `${item.order.durationDays} days`,
      );
    }
    return parts;
  }

  const parts: string[] = [item.order.kind, item.order.priority, item.order.timing];
  if (item.order.specimen) parts.push(item.order.specimen);
  if (item.order.fastingRequired === true) {
    parts.push(locale === "fa" ? "نیاز به ناشتایی" : "Fasting required");
  }
  return parts;
}

export function PatientWorkspaceOrders({
  orders,
  locale,
  onOpenEncounter,
}: Props) {
  const fa = locale === "fa";

  return (
    <section className={styles.panel} aria-labelledby="patient-workspace-orders-title">
      <div className={styles.heading}>
        <div>
          <span>{fa ? "برنامه امضاشده پزشک" : "SIGNED PHYSICIAN PLAN"}</span>
          <h3 id="patient-workspace-orders-title">
            {fa ? "دستورها و وضعیت پیگیری" : "Orders and follow-up status"}
          </h3>
        </div>
        <strong>{orders.length}</strong>
      </div>

      {orders.length === 0 ? (
        <p className={styles.empty}>
          {fa
            ? "برای این بیمار هنوز دستور فعال یا تاریخی از برنامه امضاشده در Patient Record v2 ثبت نشده است."
            : "No signed-plan orders are recorded for this patient in Patient Record v2 yet."}
        </p>
      ) : (
        <div className={styles.list}>
          {orders.map((item) => {
            const labels = stateLabels[item.state];
            const details = orderDetails(item, locale);
            return (
              <article className={styles.card} key={item.orderId} data-state={item.state}>
                <div className={styles.cardTop}>
                  <div>
                    <small>
                      {item.orderKind === "medication"
                        ? (fa ? "دارو" : "Medication")
                        : (fa ? "بررسی / آزمایش" : "Investigation")}
                    </small>
                    <strong>{orderTitle(item)}</strong>
                  </div>
                  <span className={styles.state}>{fa ? labels.fa : labels.en}</span>
                </div>

                {details.length > 0 && (
                  <div className={styles.details}>
                    {details.map((detail) => (
                      <span key={detail}>{detail}</span>
                    ))}
                  </div>
                )}

                <div className={styles.meta}>
                  <span>
                    {fa ? "امضا" : "Signed"}: {new Date(item.signedAt).toLocaleString(fa ? "fa-IR" : "en-US")}
                  </span>
                  <span>{fa ? `نسخه برنامه ${item.planVersion}` : `Plan v${item.planVersion}`}</span>
                  {item.latestFulfillmentAt && (
                    <span>
                      {fa ? "آخرین پیگیری" : "Last follow-up"}: {new Date(item.latestFulfillmentAt).toLocaleString(fa ? "fa-IR" : "en-US")}
                    </span>
                  )}
                  {item.hasLinkedResult && (
                    <span>{fa ? "نتیجه به این دستور متصل شده است" : "A result is linked to this order"}</span>
                  )}
                </div>

                <button
                  type="button"
                  className={styles.openButton}
                  onClick={() => void onOpenEncounter(item.encounterId)}
                >
                  {fa ? "باز کردن ویزیت منبع" : "Open source visit"}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
