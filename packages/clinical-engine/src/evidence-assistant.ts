import { buildDecisionGraphEvidenceAssistantIndexV2 } from "./decision-graph-v2/evidence-assistant-index.js";
import type { EvidenceReferenceV2 } from "./decision-graph-v2/types.js";
import { activeGuidelineSources, evidenceSourcesFor } from "./guideline-registry.js";
import { getActiveClinicalRulePack } from "./rule-pack.js";

export type EvidenceAssistantLocale = "fa" | "en";

export interface EvidenceAssistantCitation {
  sourceId: string;
  shortCode: string;
  title: string;
  activeVersion: string;
  sourceUrl: string;
  sourceKind: "guideline" | "consensus" | "regulatory";
  locator?: string;
}

export interface EvidenceAssistantHit {
  ruleId: string;
  domain: string;
  score: number;
  textFa: string;
  textEn: string;
  engineEffect: string;
  sourceIds: string[];
  citations: EvidenceAssistantCitation[];
}

export interface EvidenceAssistantRetrievalResult {
  question: string;
  locale: EvidenceAssistantLocale;
  rulePackVersion: string;
  hits: EvidenceAssistantHit[];
  sufficientEvidence: boolean;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "with", "is", "are", "be", "on", "by", "from",
  "treatment", "therapy", "patient", "clinical", "recommendation", "program", "about", "what", "which",
  "در", "از", "به", "با", "برای", "و", "یا", "که", "این", "آن", "است", "هست", "شود", "می", "را", "یک",
  "درمان", "بیمار", "بالینی", "توصیه", "برنامه", "درباره", "چه", "کدام",
]);

const QUERY_ALIASES: Record<string, string[]> = {
  ckd: ["kidney", "renal", "egfr", "uacr", "کلیه", "کلیوی", "آلبومینوری"],
  kidney: ["ckd", "renal", "egfr", "uacr", "کلیه", "کلیوی"],
  renal: ["ckd", "kidney", "egfr", "کلیه", "کلیوی"],
  قلب: ["ascvd", "cardiovascular", "heart", "hf", "cvd"],
  قلبی: ["ascvd", "cardiovascular", "heart", "hf", "cvd"],
  hf: ["heart", "failure", "نارسایی", "قلبی"],
  ascvd: ["cardiovascular", "cvd", "mi", "stroke", "قلبی", "عروقی"],
  mash: ["masld", "liver", "fibrosis", "کبد", "فیبروز"],
  masld: ["mash", "liver", "fibrosis", "کبد", "فیبروز"],
  کبد: ["liver", "masld", "mash", "fibrosis"],
  زخم: ["foot", "wound", "iwgdf", "infection", "پای", "عفونت"],
  foot: ["wound", "infection", "iwgdf", "زخم", "پای"],
  wound: ["foot", "infection", "iwgdf", "زخم", "پای"],
  metformin: ["متفورمین", "egfr", "ckd", "kidney"],
  متفورمین: ["metformin", "egfr", "ckd", "کلیه"],
  sglt2: ["ckd", "heart", "failure", "cardiorenal", "کلیه", "قلب"],
  glp1: ["glp", "weight", "ascvd", "وزن", "قلبی"],
  insulin: ["انسولین", "hyperglycemia", "catabolism", "هایپرگلیسمی"],
  انسولین: ["insulin", "hyperglycemia", "catabolism", "هایپرگلیسمی"],
  resmetirom: ["mash", "fibrosis", "f2", "f3", "rezdiffra", "رسمتی‌روم", "رسمتیrom"],
  dose: ["dosage", "starting", "start", "titration", "دوز", "شروع", "تیتراسیون"],
  dosage: ["dose", "starting", "start", "titration", "دوز", "شروع", "تیتراسیون"],
  دوز: ["dose", "dosage", "starting", "start", "titration", "شروع", "تیتراسیون"],
  شروع: ["start", "starting", "initial", "initiation", "دوز"],
  toujeo: ["توجئو", "glargine", "u-300", "u300"],
  توجئو: ["toujeo", "glargine", "u-300", "u300"],
  tresiba: ["ترسیبا", "degludec"],
  ترسیبا: ["tresiba", "degludec"],
};

function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[^\p{L}\p{N}.+-]+/gu, " ")
    .trim();
}

function tokens(value: string) {
  const base = normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
  const expanded = new Set(base);
  for (const token of base) {
    for (const alias of QUERY_ALIASES[token] ?? []) expanded.add(alias);
  }
  return [...expanded];
}

function scoreRule(questionTokens: readonly string[], haystack: string, domain: string) {
  if (!questionTokens.length) return 0;
  const normalized = normalizeText(`${domain} ${haystack}`);
  const haystackTokens = new Set(tokens(normalized));
  let score = 0;
  for (const token of questionTokens) {
    if (haystackTokens.has(token)) score += 3;
    else if (token.length >= 4 && normalized.includes(token)) score += 1;
  }
  const domainTokens = tokens(domain);
  if (domainTokens.some((token) => questionTokens.includes(token))) score += 2;
  return score;
}

function graphCitation(reference: EvidenceReferenceV2): EvidenceAssistantCitation {
  return {
    sourceId: reference.sourceId,
    shortCode: reference.sourceId,
    title: reference.title,
    activeVersion: reference.version ?? "current",
    sourceUrl: reference.url,
    sourceKind: reference.strength === "regulatory_label" ? "regulatory" : "guideline",
    locator: reference.locator,
  };
}

/**
 * Retrieval is deliberately limited to clinically approved, executable rule
 * provenance. It never reads draft rule packs and it cannot change clinical
 * ranking or patient inputs. Product/safety citations are materialized from the
 * same Decision Graph rule builders that execute those rules.
 */
export function retrieveApprovedEvidence(
  question: string,
  locale: EvidenceAssistantLocale = "fa",
  limit = 6,
): EvidenceAssistantRetrievalResult {
  const pack = getActiveClinicalRulePack();
  const queryTokens = tokens(question);

  const rulePackHits = pack.rules.map((rule) => {
    const sources = evidenceSourcesFor(rule.sourceIds);
    const sourceText = sources.map((source) => [
      source.shortCode,
      source.title,
      source.engineRoleFa,
      source.engineRoleEn,
      source.engineDomains.join(" "),
    ].join(" ")).join(" ");
    const score = scoreRule(
      queryTokens,
      `${rule.descriptionFa} ${rule.descriptionEn} ${rule.engineEffect} ${sourceText}`,
      rule.domain,
    );
    return {
      ruleId: rule.id,
      domain: rule.domain,
      score,
      textFa: rule.descriptionFa,
      textEn: rule.descriptionEn,
      engineEffect: rule.engineEffect,
      sourceIds: [...rule.sourceIds],
      citations: sources.map((source) => ({
        sourceId: source.id,
        shortCode: source.shortCode,
        title: source.title,
        activeVersion: source.activeVersion,
        sourceUrl: source.sourceUrl,
        sourceKind: source.sourceKind,
      })),
    } satisfies EvidenceAssistantHit;
  });

  const decisionGraphHits = buildDecisionGraphEvidenceAssistantIndexV2().map((record) => {
    const score = scoreRule(
      queryTokens,
      `${record.textFa} ${record.textEn} ${record.engineEffect} ${record.searchText}`,
      record.domain,
    );
    return {
      ruleId: record.ruleId,
      domain: record.domain,
      score,
      textFa: record.textFa,
      textEn: record.textEn,
      engineEffect: record.engineEffect,
      sourceIds: [...new Set(record.evidence.map((item) => item.sourceId))],
      citations: record.evidence.map(graphCitation),
    } satisfies EvidenceAssistantHit;
  });

  const hits = [...rulePackHits, ...decisionGraphHits]
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score || left.ruleId.localeCompare(right.ruleId))
    .slice(0, limit);

  return {
    question,
    locale,
    rulePackVersion: pack.version,
    hits,
    sufficientEvidence: hits.length > 0 && hits[0]!.score >= 3,
  };
}

export function buildExtractiveEvidenceAnswer(result: EvidenceAssistantRetrievalResult) {
  if (!result.sufficientEvidence) {
    return result.locale === "fa"
      ? "در شواهد تاییدشده و فعال GLYMIZE برای پاسخ قابل اتکا به این سؤال اطلاعات کافی پیدا نشد. لطفاً سؤال را دقیق‌تر کنید یا منبع بالینی جدید را برای بازبینی ادمین اضافه کنید."
      : "The approved active GLYMIZE evidence set does not contain enough support for a reliable answer. Refine the question or add the relevant clinical source for review.";
  }

  const top = result.hits.slice(0, 3);
  const lines = top.map((hit) => result.locale === "fa" ? hit.textFa : hit.textEn);
  return result.locale === "fa"
    ? `بر اساس شواهد تاییدشده فعلی:\n${lines.map((line) => `• ${line}`).join("\n")}\n\nاین پاسخ خلاصهٔ بازیابی‌شده از Rule Pack و Ruleهای اجرایی فعال است و جایگزین قضاوت بالینی یا متن کامل منبع نیست.`
    : `Based on the currently approved evidence:\n${lines.map((line) => `• ${line}`).join("\n")}\n\nThis is an extractive summary from the active Rule Pack and executable evidence rules and does not replace clinical judgment or the complete source text.`;
}

export const evidenceAssistantSources = activeGuidelineSources.filter((source) => source.engineInfluence);
