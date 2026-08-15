import type {
  LabInterpretation,
  LabObservationSource,
  PatientHandoffLab,
} from "@glymize/contracts";
import {
  LAB_MASTER_REGISTRY,
  type LabMasterEntry,
  normalizeLabUnit,
  ocrAliasesForLab,
} from "./lab-master-registry.js";

export {
  LAB_MASTER_REGISTRY,
  LAB_MASTER_REGISTRY_VERSION,
  normalizeLabUnit,
  resolveLabMasterEntry,
  searchLabMasterRegistry,
} from "./lab-master-registry.js";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export const CLINICAL_LAB_CATALOG = LAB_MASTER_REGISTRY;

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
  const match = normalizeLine(text).match(
    /\b((?:13|14|19|20)\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/,
  );
  return match?.[0];
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasRegex(alias: string) {
  const compact = alias.trim();
  const escaped = escapeRegex(compact).replace(/\s+/g, "\\s*");
  const simpleAscii = /^[A-Za-z0-9]+$/.test(compact);
  return new RegExp(
    simpleAscii ? `\\b${escaped}\\b` : escaped,
    "i",
  );
}

const OCR_REGISTRY_MATCHERS = LAB_MASTER_REGISTRY.flatMap(
  (entry) =>
    ocrAliasesForLab(entry).map((alias) => ({
      entry,
      regex: aliasRegex(alias),
    })),
);

type RegistryMatch = {
  entry: LabMasterEntry;
  index: number;
  text: string;
};

function findRegistryMatches(line: string): RegistryMatch[] {
  const candidates: RegistryMatch[] = [];

  for (const matcher of OCR_REGISTRY_MATCHERS) {
    let offset = 0;

    while (offset < line.length) {
      const match = matcher.regex.exec(line.slice(offset));
      if (!match || match.index === undefined) break;

      const index = offset + match.index;
      candidates.push({
        entry: matcher.entry,
        index,
        text: match[0],
      });

      offset = index + Math.max(1, match[0].length);
    }
  }

  candidates.sort(
    (a, b) =>
      a.index - b.index ||
      b.text.length - a.text.length,
  );

  const selected: RegistryMatch[] = [];
  for (const candidate of candidates) {
    const previous = selected[selected.length - 1];
    if (
      previous &&
      candidate.index <
        previous.index + previous.text.length
    ) {
      continue;
    }
    selected.push(candidate);
  }

  return selected;
}

function extractUnit(
  line: string,
  fallback?: string,
) {
  const unit = line.match(
    /(?:mL\s*\/\s*min(?:\s*\/\s*1\.73\s*m(?:2|²))?|mg\s*\/\s*(?:dL|L|g|mmol)|g\s*\/\s*(?:dL|L|24h)|mmol\s*\/\s*L|mEq\s*\/\s*L|u?mol\s*\/\s*L|[µμ]mol\s*\/\s*L|U\s*\/\s*L|I?U\s*\/\s*(?:L|mL)|mIU\s*\/\s*L|[uµμ]IU\s*\/\s*mL|ng\s*\/\s*(?:mL|dL|L)|pg\s*\/\s*mL|[uµμ]g\s*\/\s*(?:dL|L|mL)|nmol\s*\/\s*L|pmol\s*\/\s*L|10(?:\^|\*)?[36]\s*\/\s*[uµμ]L|\/\s*[uµμ]L|\/\s*HPF|fL|pg|mm\s*\/\s*h|mmHg|mOsm\s*\/\s*kg|%)/i,
  )?.[0];

  return normalizeLabUnit(
    unit?.replace(/\s+/g, "") ?? fallback,
  );
}

function extractReferenceRange(
  line: string,
  selectedValue?: number,
) {
  const ranges = Array.from(
    line.matchAll(
      /(-?\d+(?:\.\d+)?)\s*(?:-|to)\s*(-?\d+(?:\.\d+)?)/gi,
    ),
  );

  const candidate = ranges.find((match) => {
    const low = Number(match[1]);
    const high = Number(match[2]);
    return (
      selectedValue === undefined ||
      Math.abs(low - selectedValue) > 0.001 ||
      Math.abs(high - selectedValue) > 0.001
    );
  });

  if (candidate) {
    return {
      text: `${candidate[1]}–${candidate[2]}`,
      low: Number(candidate[1]),
      high: Number(candidate[2]),
    };
  }

  const threshold = line.match(
    /(<=|>=|<|>|≤|≥)\s*(-?\d+(?:\.\d+)?)/,
  );
  if (threshold) {
    const operatorToken = threshold[1];
    const boundaryToken = threshold[2];

    if (operatorToken && boundaryToken) {
      const boundary = Number(boundaryToken);
      const isReportedValue =
        selectedValue !== undefined &&
        Math.abs(boundary - selectedValue) <= 0.001;

      if (!isReportedValue) {
        const operator = operatorToken
          .replace("≤", "<=")
          .replace("≥", ">=");

        return {
          text: `${operator}${boundaryToken}`,
          low:
            operator === ">" || operator === ">="
              ? boundary
              : undefined,
          high:
            operator === "<" || operator === "<="
              ? boundary
              : undefined,
        };
      }
    }
  }

  return {
    text: undefined,
    low: undefined,
    high: undefined,
  };
}

const INTERPRETATION_PATTERNS: Array<{
  code: LabInterpretation;
  patterns: RegExp[];
}> = [
  {
    code: "HH",
    patterns: [
      /(?:^|[\s|()*])HH(?:$|[\s|()*])/i,
      /\bcritical\s*high\b/i,
      /↑↑/,
    ],
  },
  {
    code: "LL",
    patterns: [
      /(?:^|[\s|()*])LL(?:$|[\s|()*])/i,
      /\bcritical\s*low\b/i,
      /↓↓/,
    ],
  },
  {
    code: "H",
    patterns: [
      /(?:^|[\s|()*])H(?:$|[\s|()*])/i,
      /\bHIGH\b/i,
      /\bHI\b/i,
      /↑/,
    ],
  },
  {
    code: "L",
    patterns: [
      /(?:^|[\s|()*])L(?:$|[\s|()*])/i,
      /\bLOW\b/i,
      /\bLO\b/i,
      /↓/,
    ],
  },
  {
    code: "A",
    patterns: [
      /\bABN(?:ORMAL)?\b/i,
      /\bABNORMAL\b/i,
    ],
  },
  { code: "N", patterns: [/\bNORMAL\b/i] },
];

export function extractLabInterpretation(
  text: string,
): LabInterpretation | undefined {
  for (const item of INTERPRETATION_PATTERNS) {
    if (
      item.patterns.some((pattern) => pattern.test(text))
    ) {
      return item.code;
    }
  }
  return undefined;
}

function extractQualitativeValue(text: string) {
  const match = text.match(
    /\b(positive|negative|reactive|non[-\s]?reactive|detected|not\s+detected|trace|present|absent)\b/i,
  );
  return match?.[1]?.replace(/\s+/g, " ").trim();
}

function stableId(
  sourceDocumentName: string | undefined,
  line: string,
  key: string,
  index: number | string,
) {
  const raw =
    `${sourceDocumentName ?? "ocr"}:${key}:${index}:${line}`;

  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `ocr-${key}-${(hash >>> 0).toString(16)}`;
}

function deduplicateExactObservations(
  labs: PatientHandoffLab[],
) {
  const seen = new Set<string>();

  return labs.filter((lab) => {
    const identity = [
      lab.canonicalKey ?? lab.rawName,
      lab.value ?? lab.valueText ?? "",
      lab.unit ?? "",
      lab.observedAt ?? "",
      lab.sourceDocumentName ?? "",
      lab.sourcePage ?? "",
    ].join("|");

    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function parseClinicalLabText(
  rawText: string,
  sourceDocumentName?: string,
  ocrConfidence?: number,
  sourceKind: LabObservationSource =
    ocrConfidence === undefined ? "pdf_text" : "ocr",
): PatientHandoffLab[] {
  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const documentDate = extractDate(rawText);
  const labs: PatientHandoffLab[] = [];
  let sourcePage = 1;

  lines.forEach((line, lineIndex) => {
    const pageMatch = line.match(
      /^---\s*page\s+(\d+)\s*---$/i,
    );

    if (pageMatch) {
      sourcePage = Number(pageMatch[1]);
      return;
    }

    const matches = findRegistryMatches(line);
    matches.forEach((matched, matchIndex) => {
      const { entry } = matched;
      const nextMatch = matches[matchIndex + 1];
      const windowEnd = nextMatch?.index ?? line.length;
      const after = line
        .slice(
          matched.index + matched.text.length,
          windowEnd,
        )
        .trim();

      const interpretation =
        extractLabInterpretation(after);
      const stableIndex = `${lineIndex}:${matched.index}`;

      if (entry.valueKind === "qualitative") {
        const valueText = extractQualitativeValue(after);
        if (!valueText) return;

        labs.push({
          id: stableId(
            sourceDocumentName,
            line,
            entry.canonicalKey,
            stableIndex,
          ),
          canonicalKey: entry.canonicalKey,
          canonicalName: entry.name,
          rawName: matched.text,
          valueText,
          unit: extractUnit(after, entry.defaultUnit),
          specimen: entry.specimens[0],
          observedAt: documentDate,
          sourceKind,
          interpretation,
          interpretationSource:
            interpretation ? "ocr" : undefined,
          ocrConfidence,
          parserConfidence: 0.84,
          verification: "unverified",
          sourceDocumentName,
          sourcePage,
        });
        return;
      }

      const values = Array.from(
        after.matchAll(/-?\d+(?:\.\d+)?/g),
      )
        .map((item) => Number(item[0]))
        .filter(Number.isFinite);

      const value = values[0];
      if (value === undefined) return;

      const reference = extractReferenceRange(
        after,
        value,
      );

      labs.push({
        id: stableId(
          sourceDocumentName,
          line,
          entry.canonicalKey,
          stableIndex,
        ),
        canonicalKey: entry.canonicalKey,
        canonicalName: entry.name,
        rawName: matched.text,
        value,
        unit: extractUnit(after, entry.defaultUnit),
        specimen: entry.specimens[0],
        referenceRange: reference.text,
        referenceLow: reference.low,
        referenceHigh: reference.high,
        observedAt: documentDate,
        sourceKind,
        interpretation,
        interpretationSource:
          interpretation ? "ocr" : undefined,
        ocrConfidence,
        parserConfidence: 0.84,
        verification: "unverified",
        sourceDocumentName,
        sourcePage,
      });
    });
  });

  return deduplicateExactObservations(labs);
}
