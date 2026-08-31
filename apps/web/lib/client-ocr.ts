"use client";

import type { PatientHandoffLab } from "@glymize/contracts";
import {
  extractClinicalDocumentDate,
  parseClinicalLabText,
} from "@glymize/clinical-engine/lab-text-parser";
import {
  parsePatientDocumentFields,
  type PatientDocumentFieldSuggestion,
} from "@glymize/clinical-engine/patient-document-parser";
import { withBasePath } from "./base-path";

export interface OcrProgress {
  stage: "prepare" | "render_pdf" | "load_ocr" | "recognize" | "parse";
  page?: number;
  pages?: number;
  progress: number;
  message: string;
}

export interface OcrPatientFieldSuggestion
  extends PatientDocumentFieldSuggestion {
  sourceKind: "ocr" | "pdf_text";
  sourceDocumentName: string;
  ocrConfidence?: number;
}

export interface OcrDocumentResult {
  rawText: string;
  labs: PatientHandoffLab[];
  patientFields: OcrPatientFieldSuggestion[];
  processedPageCount: number;
  sourcePageCount: number;
  truncated: boolean;
  embeddedTextPages: number;
  ocrPages: number;
  patientHeaderOcrPages: number;
}

type ProgressHandler = (progress: OcrProgress) => void;

type PreparedPage = {
  pageNumber: number;
  embeddedText?: string;
  canvas?: HTMLCanvasElement;
  patientHeaderCanvas?: HTMLCanvasElement;
};

function hasUsefulEmbeddedText(value: string) {
  return value.replace(/\s+/g, "").length >= 40;
}

function patientMetadataMissing(text: string) {
  const fields = parsePatientDocumentFields(text);
  const hasName = fields.some(
    (item) =>
      item.field === "first_name" ||
      item.field === "last_name" ||
      item.field === "full_name",
  );
  const hasBasic = fields.some(
    (item) =>
      item.field === "reported_age_years" ||
      item.field === "weight_kg" ||
      item.field === "height_cm" ||
      item.field === "national_id",
  );
  const hasDocumentDate = Boolean(
    extractClinicalDocumentDate(text),
  );

  return !hasName || !hasBasic || !hasDocumentDate;
}

function createPatientHeaderCanvas(source: HTMLCanvasElement) {
  const cropHeight = Math.max(
    1,
    Math.min(
      source.height,
      Math.round(source.height * 0.36),
    ),
  );
  const targetWidth = Math.min(
    2800,
    Math.max(
      source.width,
      Math.round(source.width * 1.2),
    ),
  );
  const scale = targetWidth / Math.max(1, source.width);
  const targetHeight = Math.max(
    1,
    Math.round(cropHeight * scale),
  );

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!context) throw new Error("CANVAS_UNAVAILABLE");

  context.drawImage(
    source,
    0,
    0,
    source.width,
    cropHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  const image = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const data = image.data;

  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(
      0.299 * data[index]! +
      0.587 * data[index + 1]! +
      0.114 * data[index + 2]!,
    );
    const boosted = Math.max(
      0,
      Math.min(255, (gray - 128) * 1.3 + 128),
    );
    data[index] = boosted;
    data[index + 1] = boosted;
    data[index + 2] = boosted;
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

async function renderPdfPageCanvas(page: any) {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(
    2.5,
    2400 / Math.max(baseViewport.width, 1),
  );
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!context) throw new Error("CANVAS_UNAVAILABLE");

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
  }).promise;

  return canvas;
}

function mergePatientSuggestions(
  primary: PatientDocumentFieldSuggestion[],
  fallback: PatientDocumentFieldSuggestion[],
) {
  const output: PatientDocumentFieldSuggestion[] = [];
  const seen = new Set<string>();

  for (const item of [...primary, ...fallback]) {
    const identity = `${item.field}|${String(item.value)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    output.push(item);
  }

  return output;
}

async function renderImageFile(file: File) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 2400;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("CANVAS_UNAVAILABLE");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
    const boosted = Math.max(0, Math.min(255, (gray - 128) * 1.22 + 128));
    data[i] = boosted;
    data[i + 1] = boosted;
    data[i + 2] = boosted;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

async function preparePdfPages(file: File, onProgress: ProgressHandler) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = withBasePath("/vendor/pdf.worker.min.mjs");
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data,
    wasmUrl: withBasePath("/vendor/pdfjs-wasm/"),
  });
  const pdf = await loadingTask.promise;
  const originalPages = pdf.numPages;
  const pageCount = Math.min(originalPages, 10);
  const pages: PreparedPage[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    onProgress({
      stage: "render_pdf",
      page: pageNumber,
      pages: pageCount,
      progress: (pageNumber - 1) / pageCount,
      message: `Reading PDF page ${pageNumber}/${pageCount}`,
    });
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const embeddedText = textContent.items
      .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (hasUsefulEmbeddedText(embeddedText)) {
      let patientHeaderCanvas: HTMLCanvasElement | undefined;

      if (
        pageNumber === 1 &&
        patientMetadataMissing(embeddedText)
      ) {
        const visualPage = await renderPdfPageCanvas(page);
        patientHeaderCanvas =
          createPatientHeaderCanvas(visualPage);
        visualPage.width = 1;
        visualPage.height = 1;
      }

      pages.push({
        pageNumber,
        embeddedText,
        patientHeaderCanvas,
      });
      page.cleanup();
      continue;
    }

    const canvas = await renderPdfPageCanvas(page);
    pages.push({
      pageNumber,
      canvas,
      patientHeaderCanvas:
        pageNumber === 1
          ? createPatientHeaderCanvas(canvas)
          : undefined,
    });
    page.cleanup();
  }
  await loadingTask.destroy();
  return { pages, originalPages };
}

export async function recognizeClinicalDocument(file: File, onProgress: ProgressHandler): Promise<OcrDocumentResult> {
  if (!file) throw new Error("NO_FILE");
  const maxBytes = 18 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error("FILE_TOO_LARGE");
  if (!file.type.startsWith("image/") && file.type !== "application/pdf") throw new Error("UNSUPPORTED_FILE_TYPE");

  onProgress({ stage: "prepare", progress: 0, message: "Preparing document" });
  let pages: PreparedPage[] = [];
  let originalPages = 1;
  if (file.type === "application/pdf") {
    const prepared = await preparePdfPages(file, onProgress);
    pages = prepared.pages;
    originalPages = prepared.originalPages;
  } else {
    const canvas = await renderImageFile(file);
    pages = [{
      pageNumber: 1,
      canvas,
      patientHeaderCanvas:
        createPatientHeaderCanvas(canvas),
    }];
  }

  const ocrPages = pages.filter((page) => page.canvas);
  const textByPage = new Map<number, string>();
  for (const page of pages) {
    if (page.embeddedText) textByPage.set(page.pageNumber, page.embeddedText);
  }

  const confidenceByPage = new Map<number, number>();
  if (ocrPages.length > 0) {
    onProgress({ stage: "load_ocr", progress: 0, message: "Loading Persian + English OCR" });
    const { createWorker } = await import("tesseract.js");
    let activeOcrIndex = 0;
    const worker = await createWorker(["fas", "eng"], 1, {
      logger: (message) => {
        const progress = typeof message.progress === "number" ? message.progress : 0;
        const page = ocrPages[activeOcrIndex];
        onProgress({
          stage: "recognize",
          page: page?.pageNumber ?? activeOcrIndex + 1,
          pages: pages.length,
          progress: (activeOcrIndex + progress) / Math.max(1, ocrPages.length),
          message: message.status || "OCR",
        });
      },
    });

    try {
      for (let index = 0; index < ocrPages.length; index += 1) {
        activeOcrIndex = index;
        const page = ocrPages[index]!;
        const result = await worker.recognize(page.canvas!);
        textByPage.set(page.pageNumber, result.data.text ?? "");
confidenceByPage.set(
  page.pageNumber,
  Number(result.data.confidence ?? 0),
);
        page.canvas!.width = 1;
        page.canvas!.height = 1;
      }
    } finally {
      await worker.terminate();
    }
  }

  const rawText = pages
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((page) => `--- page ${page.pageNumber} ---\n${(textByPage.get(page.pageNumber) ?? "").trim()}`)
    .join("\n\n")
    .trim();
  onProgress({ stage: "parse", progress: 1, message: "Parsing clinical fields for review" });
const sortedPages = pages.sort(
  (a, b) => a.pageNumber - b.pageNumber,
);

const labs = sortedPages.flatMap((page) => {
  const pageText = `--- page ${page.pageNumber} ---\n${(textByPage.get(page.pageNumber) ?? "").trim()}`;
  return parseClinicalLabText(
    pageText,
    file.name,
    confidenceByPage.get(page.pageNumber),
    page.canvas ? "ocr" : "pdf_text",
  );
});

const basePatientFields = new Map<
  number,
  PatientDocumentFieldSuggestion[]
>();
const baseDateByPage = new Map<number, string>();

for (const page of sortedPages) {
  const pageText =
    (textByPage.get(page.pageNumber) ?? "").trim();

  basePatientFields.set(
    page.pageNumber,
    parsePatientDocumentFields(
      pageText,
      page.pageNumber,
    ),
  );

  const date = extractClinicalDocumentDate(pageText);
  if (date) baseDateByPage.set(page.pageNumber, date);
}

const headerFallbackPages = sortedPages.filter((page) => {
  if (!page.patientHeaderCanvas) return false;

  const fields =
    basePatientFields.get(page.pageNumber) ?? [];
  const hasName = fields.some(
    (item) =>
      item.field === "first_name" ||
      item.field === "last_name" ||
      item.field === "full_name",
  );
  const hasBasic = fields.some(
    (item) =>
      item.field === "national_id" ||
      item.field === "reported_age_years" ||
      item.field === "weight_kg" ||
      item.field === "height_cm",
  );
  const hasDate = baseDateByPage.has(page.pageNumber);

  return !hasName || !hasBasic || !hasDate;
});

const headerTextByPage = new Map<number, string>();
const headerConfidenceByPage = new Map<number, number>();

if (headerFallbackPages.length > 0) {
  onProgress({
    stage: "load_ocr",
    progress: 0,
    message: "Reading patient header from rendered page",
  });

  const { createWorker } = await import("tesseract.js");
  let activeHeaderIndex = 0;

  const headerWorker = await createWorker(
    ["fas", "eng"],
    1,
    {
      logger: (message) => {
        const progress =
          typeof message.progress === "number"
            ? message.progress
            : 0;
        const page =
          headerFallbackPages[activeHeaderIndex];

        onProgress({
          stage: "recognize",
          page: page?.pageNumber ?? 1,
          pages: headerFallbackPages.length,
          progress:
            (activeHeaderIndex + progress) /
            Math.max(1, headerFallbackPages.length),
          message:
            message.status ||
            "Reading patient header",
        });
      },
    },
  );

  try {
    for (
      let index = 0;
      index < headerFallbackPages.length;
      index += 1
    ) {
      activeHeaderIndex = index;
      const page = headerFallbackPages[index]!;
      const result = await headerWorker.recognize(
        page.patientHeaderCanvas!,
      );

      headerTextByPage.set(
        page.pageNumber,
        result.data.text ?? "",
      );
      headerConfidenceByPage.set(
        page.pageNumber,
        Number(result.data.confidence ?? 0),
      );

      page.patientHeaderCanvas!.width = 1;
      page.patientHeaderCanvas!.height = 1;
    }
  } finally {
    await headerWorker.terminate();
  }
}

const patientFields = sortedPages.flatMap((page) => {
  const primary =
    basePatientFields.get(page.pageNumber) ?? [];
  const headerText =
    headerTextByPage.get(page.pageNumber) ?? "";
  const fallback = headerText
    ? parsePatientDocumentFields(
        headerText,
        page.pageNumber,
      )
    : [];

  const merged = mergePatientSuggestions(
    primary,
    fallback,
  );

  return merged.map((suggestion) => {
    const fromHeaderFallback = fallback.some(
      (item) =>
        item.field === suggestion.field &&
        String(item.value) === String(suggestion.value),
    );

    return {
      ...suggestion,
      sourceKind: fromHeaderFallback
        ? "ocr" as const
        : page.canvas
          ? "ocr" as const
          : "pdf_text" as const,
      sourceDocumentName: file.name,
      ocrConfidence: fromHeaderFallback
        ? headerConfidenceByPage.get(page.pageNumber)
        : confidenceByPage.get(page.pageNumber),
    };
  });
});

const fallbackDateByPage = new Map<number, string>();
for (const page of sortedPages) {
  const headerText =
    headerTextByPage.get(page.pageNumber) ?? "";
  const date = headerText
    ? extractClinicalDocumentDate(headerText)
    : undefined;
  if (date) fallbackDateByPage.set(page.pageNumber, date);
}

const documentDate = sortedPages
  .map(
    (page) =>
      baseDateByPage.get(page.pageNumber) ??
      fallbackDateByPage.get(page.pageNumber),
  )
  .find(Boolean);

const datedLabs = documentDate
  ? labs.map((lab) => ({
      ...lab,
      observedAt: lab.observedAt ?? documentDate,
    }))
  : labs;

for (const page of sortedPages) {
  if (page.patientHeaderCanvas) {
    page.patientHeaderCanvas.width = 1;
    page.patientHeaderCanvas.height = 1;
  }
}

return {
  rawText,
  labs: datedLabs,
  patientFields,
processedPageCount: pages.length,
    sourcePageCount: originalPages,
    truncated: originalPages > pages.length,
    embeddedTextPages: pages.filter((page) => Boolean(page.embeddedText)).length,
    ocrPages: ocrPages.length,
    patientHeaderOcrPages: headerFallbackPages.length,
  };
}
