import type { Type2ParallelSafetyProjectionV2 } from "@glymize/clinical-engine/type2-intake-v2";
import {
  activeParallelSafetyCards,
  parallelSafetyLabel,
  type Type2ParallelSafetyLocale,
} from "./type2-parallel-safety-model";
import styles from "./type2-parallel-safety-panel.module.css";

export default function Type2ParallelSafetyPanel({
  projection,
  locale,
}: {
  projection?: Type2ParallelSafetyProjectionV2;
  locale: Type2ParallelSafetyLocale;
}) {
  if (!projection) return null;
  const cards = activeParallelSafetyCards(projection, locale);
  if (!cards.length) return null;

  return (
    <section
      className={styles.panel}
      data-parallel-safety="true"
      aria-label={parallelSafetyLabel(locale, "مسیرهای ایمنی و ارجاع موازی", "Parallel safety and referral pathways")}
    >
      <header className={styles.header}>
        <div>
          <span>{parallelSafetyLabel(locale, "خارج از رتبه‌بندی دارویی", "OUTSIDE MEDICATION RANKING")}</span>
          <h2>{parallelSafetyLabel(locale, "مسیرهای ایمنی و ارجاع موازی", "Parallel safety and referral pathways")}</h2>
          <p>{parallelSafetyLabel(locale, "این کارت‌ها مسیر درمان دارویی را رتبه‌بندی نمی‌کنند؛ آن‌ها referral، safety boundary و داده‌های لازم را مستقل نگه می‌دارند.", "These cards do not rank drug therapy. They keep referral, safety boundaries, and missing-data requirements separate from treatment scenarios.")}</p>
        </div>
      </header>

      <div className={styles.grid}>
        {cards.map((card) => (
          <article className={`${styles.card} ${styles[card.tone]}`} data-safety-lane={card.id} key={card.id}>
            <div className={styles.cardHead}>
              <div><h3>{card.title}</h3><p>{card.subtitle}</p></div>
              <span>{card.badge}</span>
            </div>
            {card.bullets.length > 0 && <ul>{card.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
            {card.missingKeys.length > 0 && (
              <div className={styles.missing}>
                <b>{parallelSafetyLabel(locale, "داده موردنیاز", "Required data")}</b>
                <div>{card.missingKeys.map((key) => <code key={key}>{key}</code>)}</div>
              </div>
            )}
            {card.evidence.length > 0 && (
              <details className={styles.evidence}>
                <summary>{parallelSafetyLabel(locale, "منابع و مرز شواهد", "Evidence and boundary sources")}</summary>
                <ul>
                  {card.evidence.map((item) => (
                    <li key={item.sourceId}>
                      {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : <span>{item.title}</span>}
                      {item.locator && <small>{item.locator}</small>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
