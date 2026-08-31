import type { PatientReportedSex } from "@glymize/contracts";
import { normalizeOcrDigits } from "./lab-text-parser.js";

export type PatientDocumentField =
  | "first_name"
  | "last_name"
  | "full_name"
  | "national_id"
  | "reported_age_years"
  | "reported_sex"
  | "weight_kg"
  | "height_cm";

export interface PatientDocumentFieldSuggestion {
  field: PatientDocumentField;
  value: string | number;
  rawLabel: string;
  parserConfidence: number;
  sourcePage?: number;
}

export function normalizePatientDocumentText(raw: string) {
  return normalizeOcrDigits(raw.normalize("NFKC"))
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\u0640+/g, "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[：]/g, ":")
    .replace(/[–—]/g, "-")
    .replace(/[ \t]+/g, " ")
    .replace(/\r?\n/g, " | ")
    .replace(/\s*\|\s*/g, " | ")
    .trim();
}

function validIranianNationalId(value: string) {
  const code = normalizeOcrDigits(value).replace(/\D/g, "");
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) {
    return false;
  }

  const sum = code
    .slice(0, 9)
    .split("")
    .reduce(
      (acc, digit, index) =>
        acc + Number(digit) * (10 - index),
      0,
    );

  const remainder = sum % 11;
  const expected =
    remainder < 2 ? remainder : 11 - remainder;

  return Number(code[9]) === expected;
}

function cleanName(value: string) {
  return value
    .replace(/[|,:;،]+$/g, "")
    .replace(
      /^(?:(?:سرکار\s+خانم|آقای|آقا|خانم)\s+)+/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function reversedPatientFullName(text: string) {
  const marker = /نام\s*بیمار\s*[:\-]?/i.exec(text);
  if (!marker || marker.index === undefined) return undefined;

  const before = text.slice(
    Math.max(0, marker.index - 120),
    marker.index,
  );
  const segment = (
    before.split(/[|,:;،0-9]/).pop() ?? ""
  ).trim();
  const value = cleanName(segment);
  const words = value.split(/\s+/).filter(Boolean);

  if (
    !value ||
    value.length > 80 ||
    words.length < 2 ||
    words.length > 6 ||
    !/^[آ-یA-Za-z][آ-یA-Za-z‌ .'\-]+$/.test(value)
  ) {
    return undefined;
  }

  return value;
}

function normalizeReportedSex(
  value: string,
): PatientReportedSex | undefined {
  const normalized = normalizePatientDocumentText(value)
    .toLowerCase()
    .trim();

  if (
    normalized === "مرد" ||
    normalized === "مذکر" ||
    normalized === "male" ||
    normalized === "m"
  ) {
    return "male";
  }

  if (
    normalized === "زن" ||
    normalized === "مونث" ||
    normalized === "مؤنث" ||
    normalized === "female" ||
    normalized === "f"
  ) {
    return "female";
  }

  return undefined;
}

function pushUnique(
  output: PatientDocumentFieldSuggestion[],
  suggestion: PatientDocumentFieldSuggestion,
) {
  if (
    output.some(
      (item) =>
        item.field === suggestion.field &&
        String(item.value) === String(suggestion.value),
    )
  ) {
    return;
  }
  output.push(suggestion);
}

function captureName(
  text: string,
  regex: RegExp,
  field: PatientDocumentField,
  rawLabel: string,
  confidence: number,
  output: PatientDocumentFieldSuggestion[],
  sourcePage?: number,
) {
  const match = text.match(regex);
  const value = cleanName(match?.[1] ?? "");
  if (!value || value.length < 2 || value.length > 80) return;

  pushUnique(output, {
    field,
    value,
    rawLabel,
    parserConfidence: confidence,
    sourcePage,
  });
}

export function parsePatientDocumentFields(
  rawText: string,
  sourcePage?: number,
): PatientDocumentFieldSuggestion[] {
  const text = normalizePatientDocumentText(rawText);
  const output: PatientDocumentFieldSuggestion[] = [];

  captureName(
    text,
    /(?:^|[| ])نام\s*خانوادگی\s*[:\-]?\s*([آ-یA-Za-z][آ-یA-Za-z‌\-\s]{1,60}?)(?=\s+(?:کد\s*ملی|سن|وزن|قد)(?=\s|:|\-|$)|\s+(?:National\s*(?:ID|Code)|Age|Weight|Height)\b|\s*\||$)/i,
    "last_name",
    "نام خانوادگی",
    0.94,
    output,
    sourcePage,
  );

  captureName(
    text,
    /(?:^|[| ])(?:Last\s*Name|Surname|Family\s*Name)\s*[:\-]?\s*([A-Za-z][A-Za-z .'\-]{1,60}?)(?=\s+(?:National\s*(?:ID|Code)|Age|Weight|Height|First\s*Name)\b|\s*\||$)/i,
    "last_name",
    "Last name",
    0.94,
    output,
    sourcePage,
  );

  captureName(
    text,
    /(?:^|[| ])نام(?!\s*خانوادگی|\s*و\s*نام|\s*بیمار)\s*[:\-]?\s*([آ-یA-Za-z][آ-یA-Za-z‌\-]{1,35})(?=\s|$)/i,
    "first_name",
    "نام",
    0.92,
    output,
    sourcePage,
  );

  captureName(
    text,
    /(?:^|[| ])First\s*Name\s*[:\-]?\s*([A-Za-z][A-Za-z .'\-]{1,40}?)(?=\s+(?:Last\s*Name|Surname|National\s*(?:ID|Code)|Age|Weight|Height)\b|\s*\||$)/i,
    "first_name",
    "First name",
    0.94,
    output,
    sourcePage,
  );

  if (
    !output.some(
      (item) =>
        item.field === "first_name" ||
        item.field === "last_name",
    )
  ) {
    const reversedName = reversedPatientFullName(text);
    if (reversedName) {
      pushUnique(output, {
        field: "full_name",
        value: reversedName,
        rawLabel: "Patient name (RTL text order)",
        parserConfidence: 0.74,
        sourcePage,
      });
    }

    captureName(
      text,
      /(?:^|[| ])(?:نام\s*و\s*نام\s*خانوادگی|نام\s*بیمار|Patient\s*Name|Full\s*Name)\s*[:\-]?\s*([آ-یA-Za-z][آ-یA-Za-z‌A-Za-z .'\-]{2,75}?)(?=\s+(?:کد\s*ملی|سن(?:\s*\/\s*(?:جنسیت|جنس))?|جنس(?:یت)?|وزن|قد)(?=\s|:|\/|\-|$)|\s+(?:National\s*(?:ID|Code)|Age(?:\s*\/\s*(?:Sex|Gender))?|Sex|Gender|Weight|Height)\b|\s*\||$)/i,
      "full_name",
      "Patient name",
      0.78,
      output,
      sourcePage,
    );
  }

  const nationalId = text.match(
    /(?:^|[| ])(?:کد\s*ملی|کدملی|National\s*(?:ID|Code))\s*[:\-]?\s*([0-9]{10})(?=\D|$)/i,
  );
  if (nationalId?.[1] && validIranianNationalId(nationalId[1])) {
    pushUnique(output, {
      field: "national_id",
      value: nationalId[1],
      rawLabel: "National ID",
      parserConfidence: 0.98,
      sourcePage,
    });
  }

  const age = text.match(
    /(?:^|[| ])(?:سن(?:\s*\/\s*(?:جنسیت|جنس))?|Age(?:\s*\/\s*(?:Sex|Gender))?)\s*[:\-]?\s*([0-9]{1,3})(?:\s*(?:سال|years?|yrs?))?/i,
  );
  if (age?.[1]) {
    const value = Number(age[1]);
    if (Number.isFinite(value) && value >= 0 && value <= 120) {
      pushUnique(output, {
        field: "reported_age_years",
        value,
        rawLabel: "Age",
        parserConfidence: 0.9,
        sourcePage,
      });
    }
  }

  const combinedSex = text.match(
    /(?:^|[| ])(?:سن(?:\s*\/\s*(?:جنسیت|جنس))?|Age(?:\s*\/\s*(?:Sex|Gender))?)\s*[:\-]?\s*[0-9]{1,3}(?:\s*(?:سال|years?|yrs?))?\s*\/\s*(مرد|زن|مذکر|مونث|مؤنث|male|female|m|f)(?=\s|[|,:;،\-]|$)/i,
  );
  const standaloneSex = text.match(
    /(?:^|[| ])(?:جنس(?:یت)?|Sex|Gender)\s*[:\-]?\s*(مرد|زن|مذکر|مونث|مؤنث|male|female|m|f)(?=\s|[|,:;،\-]|$)/i,
  );
  const reportedSex = normalizeReportedSex(
    combinedSex?.[1] ?? standaloneSex?.[1] ?? "",
  );
  if (reportedSex) {
    pushUnique(output, {
      field: "reported_sex",
      value: reportedSex,
      rawLabel: "Sex",
      parserConfidence: 0.92,
      sourcePage,
    });
  }

  const weight = text.match(
    /(?:^|[| ])(?:وزن|Weight)\s*[:\-]?\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*(?:kg|کیلوگرم|کيلوگرم)?/i,
  );
  if (weight?.[1]) {
    const value = Number(weight[1]);
    if (Number.isFinite(value) && value >= 2 && value <= 350) {
      pushUnique(output, {
        field: "weight_kg",
        value,
        rawLabel: "Weight",
        parserConfidence: 0.92,
        sourcePage,
      });
    }
  }

  const height = text.match(
    /(?:^|[| ])(?:قد|Height)\s*[:\-]?\s*([0-9]{2,3}(?:\.[0-9]+)?)\s*(?:cm|سانتی\s*متر|سانتیمتر)?/i,
  );
  if (height?.[1]) {
    const value = Number(height[1]);
    if (Number.isFinite(value) && value >= 40 && value <= 250) {
      pushUnique(output, {
        field: "height_cm",
        value,
        rawLabel: "Height",
        parserConfidence: 0.92,
        sourcePage,
      });
    }
  }

  return output;
}
