"use client";

import type { PatientHandoffLab } from "@glymize/contracts";
import { parseClinicalLabText } from "@glymize/clinical-engine/lab-text-parser";
import { withBasePath } from "./base-path";

export interface OcrProgress {
  stage: "prepare" | "render_pdf" | "load_ocr" | "recognize" | "parse";
  page?: number;
  pages?: number;
  progress: number;
  message: string;
}

export interface OcrDocumentResult {
  rawText: string;
  labs: PatientHandoffLab[];
  processedPageCount: number;
  sourcePageCount: number;
  truncated: boolean;
  embeddedTextPages: number;
  ocrPages: number;
}

type ProgressHandler = (progress: OcrProgress) => void;

type PreparedPage = {
  pageNumber: number;
  embeddedText?: string;
  canvas?: HTMLCanvasElement;
};

function hasUsefulEmbeddedText(value: string) {
  return value.replace(/\s+/g, "").length >= 40;
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
      pages.push({ pageNumber, embeddedText });
      page.cleanup();
      continue;
    }

    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2.2, 2200 / Math.max(baseViewport.width, 1));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    pages.push({ pageNumber, canvas });
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
    pages = [{ pageNumber: 1, canvas: await renderImageFile(file) }];
  }

  const ocrPages = pages.filter((page) => page.canvas);
  const textByPage = new Map<number, string>();
  for (const page of pages) {
    if (page.embeddedText) textByPage.set(page.pageNumber, page.embeddedText);
  }

  const confidenceByPage: number[] = [];
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
        confidenceByPage.push(Number(result.data.confidence ?? 0));
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
  const meanConfidence = confidenceByPage.length
    ? confidenceByPage.reduce((sum, value) => sum + value, 0) / confidenceByPage.length
    : undefined;
  onProgress({ stage: "parse", progress: 1, message: "Parsing clinical fields for review" });
  return {
    rawText,
    labs: parseClinicalLabText(rawText, file.name, meanConfidence),
    processedPageCount: pages.length,
    sourcePageCount: originalPages,
    truncated: originalPages > pages.length,
    embeddedTextPages: pages.filter((page) => Boolean(page.embeddedText)).length,
    ocrPages: ocrPages.length,
  };
}
