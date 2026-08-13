import type { PatientHandoffLab } from "@glymize/contracts";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

const TEST_PATTERNS: Array<{ canonicalKey: string; name: string; pattern: RegExp; defaultUnit?: string }> = [
  { canonicalKey: "hba1c", name: "HbA1c", pattern: /\b(?:hba1c|hb\s*a1c|a1c|glycated\s+hemoglobin)\b|هموگلوبین\s*(?:گلیکوزیله|a1c)/i, defaultUnit: "%" },
  { canonicalKey: "egfr", name: "eGFR", pattern: /\b(?:e\s*gfr|estimated\s+gfr)\b|نرخ\s+فیلتراسیون/i, defaultUnit: "mL/min/1.73m²" },
  { canonicalKey: "uacr", name: "UACR", pattern: /\b(?:uacr|albumin\s*[/\-]?\s*creatinine|acr)\b|نسبت\s+آلبومین.*کراتینین/i, defaultUnit: "mg/g" },
  { canonicalKey: "creatinine", name: "Creatinine", pattern: /\b(?:creatinine|cr)\b|کراتینین/i, defaultUnit: "mg/dL" },
  { canonicalKey: "fbs", name: "FBS", pattern: /\b(?:fbs|fasting\s+(?:blood\s+)?(?:glucose|sugar))\b|قند\s+ناشتا/i, defaultUnit: "mg/dL" },
  { canonicalKey: "glucose", name: "Glucose", pattern: /\b(?:glucose|blood\s+sugar)\b|گلوکز|قند\s+خون/i, defaultUnit: "mg/dL" },
  { canonicalKey: "alt", name: "ALT", pattern: /\b(?:alt|sgpt)\b/i, defaultUnit: "U/L" },
  { canonicalKey: "ast", name: "AST", pattern: /\b(?:ast|sgot)\b/i, defaultUnit: "U/L" },
  { canonicalKey: "ldl", name: "LDL-C", pattern: /\b(?:ldl(?:-c)?|low\s+density\s+lipoprotein)\b/i, defaultUnit: "mg/dL" },
  { canonicalKey: "tg", name: "Triglyceride", pattern: /\b(?:tg|triglycerides?)\b|تری\s*گلیسرید/i, defaultUnit: "mg/dL" },
];

export function normalizeOcrDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const p = PERSIAN_DIGITS.indexOf(digit);
    if (p >= 0) return String(p);
    const a = ARABIC_DIGITS.indexOf(digit);
    return a >= 0 ? String(a) : digit;
  });
}

function normalizeLine(value: string) {
  return normalizeOcrDigits(value)
    .replace(/[٫،]/g, ".")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDate(text: string) {
  const match = normalizeLine(text).match(/\b((?:13|14|19|20)\d{2})[\/-](\d{1,2})[\/-](\d{1,2})\b/);
  return match?.[0];
}

function extractUnit(line: string, fallback?: string) {
  const unit = line.match(/(?:mg\s*\/\s*(?:dL|g)|mmol\s*\/\s*L|mL\s*\/\s*min(?:\s*\/\s*1\.73\s*m(?:2|²))?|U\s*\/\s*L|%|µ?g\s*\/\s*(?:mL|L)|ng\s*\/\s*mL)/i)?.[0];
  return unit?.replace(/\s+/g, "") ?? fallback;
}

function extractReferenceRange(line: string, selectedValue?: number) {
  const ranges = Array.from(line.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:-|to)\s*(-?\d+(?:\.\d+)?)/gi));
  const candidate = ranges.find((match) => {
    const low = Number(match[1]);
    const high = Number(match[2]);
    return selectedValue === undefined || Math.abs(low - selectedValue) > 0.001 || Math.abs(high - selectedValue) > 0.001;
  });
  return candidate ? `${candidate[1]}–${candidate[2]}` : undefined;
}

function stableId(sourceDocumentName: string | undefined, line: string, key: string, index: number) {
  const raw = `${sourceDocumentName ?? "ocr"}:${key}:${index}:${line}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `ocr-${key}-${(hash >>> 0).toString(16)}`;
}

export function parseClinicalLabText(rawText: string, sourceDocumentName?: string, ocrConfidence?: number): PatientHandoffLab[] {
  const lines = rawText.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const documentDate = extractDate(rawText);
  const labs: PatientHandoffLab[] = [];
  let sourcePage = 1;

  lines.forEach((line, lineIndex) => {
    const pageMatch = line.match(/^---\s*page\s+(\d+)\s*---$/i);
    if (pageMatch) {
      sourcePage = Number(pageMatch[1]);
      return;
    }
    for (const test of TEST_PATTERNS) {
      const match = line.match(test.pattern);
      if (!match) continue;
      const after = line.slice((match.index ?? 0) + match[0].length);
      const values = Array.from(after.matchAll(/-?\d+(?:\.\d+)?/g)).map((item) => Number(item[0])).filter(Number.isFinite);
      const value = values[0];
      if (value === undefined) continue;
      if (labs.some((item) => item.canonicalKey === test.canonicalKey)) continue;
      labs.push({
        id: stableId(sourceDocumentName, line, test.canonicalKey, lineIndex),
        canonicalKey: test.canonicalKey,
        rawName: test.name,
        value,
        unit: extractUnit(line, test.defaultUnit),
        referenceRange: extractReferenceRange(after, value),
        observedAt: documentDate,
        ocrConfidence,
        parserConfidence: Math.min(0.95, 0.72 + (match[0].toLowerCase() === test.name.toLowerCase() ? 0.15 : 0.08)),
        verification: "unverified",
        sourceDocumentName,
        sourcePage,
      });
    }
  });
  return labs;
}
