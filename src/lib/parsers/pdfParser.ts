import * as pdfjsLib from "pdfjs-dist";
import type {
  ImportMetadataResult,
  ParsedChapter,
  ParsedReflowableBook,
  ParsedTocItem,
} from "../../types/library";
import { computeSha256Hex } from "../db";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export type PdfDocumentHandle = pdfjsLib.PDFDocumentProxy;

function cleanBaseName(fileName: string): string {
  return (
    fileName
      .replace(/\.pdf$/i, "")
      .replace(/[_-]+/g, " ")
      .trim() || "Untitled PDF"
  );
}

export async function loadPdfDocument(
  data: ArrayBuffer,
): Promise<PdfDocumentHandle> {
  // Always copy slice so PDF.js worker transfer never detaches caller's ArrayBuffer
  const copy = new Uint8Array(data.slice(0));
  const loadingTask = pdfjsLib.getDocument({
    data: copy,
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    iccUrl: "/pdfjs/iccs/",
    wasmUrl: "/pdfjs/wasm/",
    useSystemFonts: true,
  });
  return loadingTask.promise;
}

export async function destroyPdfDocument(
  doc: PdfDocumentHandle | null,
): Promise<void> {
  if (!doc) return;
  try {
    const maybeDestroyable = doc as unknown as {
      destroy?: () => Promise<void>;
    };
    if (typeof maybeDestroyable.destroy === "function") {
      await maybeDestroyable.destroy();
    }
  } catch {
    // Ignore cleanup errors
  }
}

interface PdfOutlineNode {
  title?: string;
  dest?: string | unknown[] | null;
  items?: PdfOutlineNode[];
}

export async function extractPdfToc(
  doc: PdfDocumentHandle,
): Promise<ParsedTocItem[]> {
  const toc: ParsedTocItem[] = [];
  try {
    const outline = (await doc.getOutline()) as PdfOutlineNode[] | null;
    if (!outline || outline.length === 0) return toc;

    let counter = 0;
    const walk = async (nodes: PdfOutlineNode[], depth: number) => {
      for (const node of nodes) {
        let pageNum = 1;
        try {
          let destArray: unknown[] | null = null;
          if (typeof node.dest === "string") {
            destArray = (await doc.getDestination(node.dest)) as
              | unknown[]
              | null;
          } else if (Array.isArray(node.dest)) {
            destArray = node.dest;
          }
          if (destArray && destArray[0]) {
            const ref = destArray[0];
            if (typeof ref === "number") {
              pageNum = ref + 1;
            } else {
              const idx = await doc.getPageIndex(
                ref as Parameters<typeof doc.getPageIndex>[0],
              );
              pageNum = idx + 1;
            }
          }
        } catch {
          pageNum = 1;
        }

        toc.push({
          id: `pdf-toc-${counter++}`,
          title: (node.title || `Section ${counter}`).trim(),
          unitIndex: Math.min(doc.numPages, Math.max(1, pageNum)),
          depth,
        });

        if (node.items && node.items.length > 0 && depth < 3) {
          await walk(node.items, depth + 1);
        }
      }
    };

    await walk(outline, 0);
  } catch {
    // Outline unavailable
  }
  return toc;
}

interface RawPdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

interface ReconstructedLine {
  y: number;
  minX: number;
  maxX: number;
  fontHeight: number;
  text: string;
}

export interface PdfReflowExtractResult {
  book: ParsedReflowableBook;
  extractedWordCount: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clusterItemsIntoLines(
  rawItems: RawPdfTextItem[],
): ReconstructedLine[] {
  interface Fragment {
    x: number;
    y: number;
    width: number;
    fontHeight: number;
    str: string;
  }

  const fragments: Fragment[] = [];
  for (const item of rawItems) {
    if (
      typeof item.str !== "string" ||
      !Array.isArray(item.transform) ||
      item.transform.length < 6
    ) {
      continue;
    }
    if (item.str.length === 0) continue;
    const fontHeight =
      Math.hypot(item.transform[2], item.transform[3]) ||
      Math.abs(item.height || 0) ||
      11;
    fragments.push({
      x: item.transform[4],
      y: item.transform[5],
      width: Math.max(0, Number(item.width) || 0),
      fontHeight,
      str: item.str,
    });
  }

  if (fragments.length === 0) return [];

  // Sort top-to-bottom (descending PDF Y), then left-to-right
  fragments.sort((a, b) => {
    if (Math.abs(b.y - a.y) > Math.max(a.fontHeight, b.fontHeight) * 0.35) {
      return b.y - a.y;
    }
    return a.x - b.x;
  });

  const lineBuckets: Fragment[][] = [];
  for (const frag of fragments) {
    if (frag.str.trim().length === 0 && frag.width === 0) continue;
    let targetBucket: Fragment[] | null = null;
    for (
      let i = lineBuckets.length - 1;
      i >= Math.max(0, lineBuckets.length - 6);
      i--
    ) {
      const bucket = lineBuckets[i];
      const ref = bucket[0];
      const tolerance = Math.max(ref.fontHeight, frag.fontHeight) * 0.45;
      if (Math.abs(frag.y - ref.y) <= tolerance) {
        targetBucket = bucket;
        break;
      }
    }
    if (targetBucket) {
      targetBucket.push(frag);
    } else {
      lineBuckets.push([frag]);
    }
  }

  const lines: ReconstructedLine[] = [];
  for (const bucket of lineBuckets) {
    bucket.sort((a, b) => a.x - b.x);
    let text = "";
    let prevEndX = bucket[0].x;
    let minX = bucket[0].x;
    let maxX = bucket[0].x + bucket[0].width;
    let weightedHeight = 0;
    let totalChars = 0;

    for (let i = 0; i < bucket.length; i++) {
      const frag = bucket[i];
      const charCount = Math.max(1, frag.str.trim().length);
      weightedHeight += frag.fontHeight * charCount;
      totalChars += charCount;
      if (frag.x < minX) minX = frag.x;
      if (frag.x + frag.width > maxX) maxX = frag.x + frag.width;

      if (i > 0) {
        const gap = frag.x - prevEndX;
        const avgH = (bucket[i - 1].fontHeight + frag.fontHeight) / 2;
        const prevEndsSpace = /\s$/.test(text);
        const currStartsSpace = /^\s/.test(frag.str);
        if (!prevEndsSpace && !currStartsSpace && gap > avgH * 0.16) {
          text += " ";
        }
      }
      text += frag.str;
      prevEndX = Math.max(prevEndX, frag.x + frag.width);
    }

    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    lines.push({
      y: bucket[0].y,
      minX,
      maxX,
      fontHeight:
        totalChars > 0 ? weightedHeight / totalChars : bucket[0].fontHeight,
      text: cleaned,
    });
  }

  lines.sort((a, b) => b.y - a.y);
  return lines;
}

function estimateBodyFontHeight(pagesLines: ReconstructedLine[][]): number {
  const buckets = new Map<number, number>();
  for (const lines of pagesLines) {
    for (const line of lines) {
      const rounded = Math.round(line.fontHeight * 2) / 2;
      buckets.set(rounded, (buckets.get(rounded) || 0) + line.text.length);
    }
  }
  let bestHeight = 11;
  let bestWeight = -1;
  for (const [height, weight] of buckets.entries()) {
    if (weight > bestWeight) {
      bestWeight = weight;
      bestHeight = height;
    }
  }
  return Math.max(6, bestHeight);
}

function appendDeHyphenated(current: string, nextLine: string): string {
  if (!current) return nextLine;
  if (
    /[A-Za-z\u00C0-\u024F]-$/.test(current) &&
    !/\s-$|--$/.test(current) &&
    /^[a-z\u00E0-\u024F]/.test(nextLine)
  ) {
    return current.slice(0, -1) + nextLine;
  }
  return `${current} ${nextLine}`;
}

export async function extractPdfReflowableBook(
  doc: PdfDocumentHandle,
  title: string,
  author: string,
): Promise<PdfReflowExtractResult> {
  const pagesLines: ReconstructedLine[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    try {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      pagesLines.push(clusterItemsIntoLines(content.items as RawPdfTextItem[]));
    } catch {
      pagesLines.push([]);
    }
  }

  const bodyFontHeight = estimateBodyFontHeight(pagesLines);
  const chapters: ParsedChapter[] = [];
  let extractedWordCount = 0;

  for (let idx = 0; idx < pagesLines.length; idx++) {
    const pageNum = idx + 1;
    const lines = pagesLines[idx];

    if (lines.length === 0) {
      chapters.push({
        index: idx,
        id: `pdf-page-${pageNum}`,
        href: `#pdf-page-${pageNum}`,
        title: `Page ${pageNum}`,
        html: `<p style="opacity:0.6;font-style:italic;">No selectable text on page ${pageNum}.</p>`,
      });
      continue;
    }

    const sortedMinX = [...lines].map((l) => l.minX).sort((a, b) => a - b);
    const pageLeftMargin =
      sortedMinX[Math.floor(sortedMinX.length * 0.15)] ?? sortedMinX[0];
    const sortedMaxX = [...lines].map((l) => l.maxX).sort((a, b) => a - b);
    const pageRightEdge =
      sortedMaxX[Math.floor(sortedMaxX.length * 0.85)] ??
      sortedMaxX[sortedMaxX.length - 1];

    const blocks: string[] = [];
    let paraBuffer = "";

    const flushPara = () => {
      const trimmed = paraBuffer.trim();
      if (trimmed) {
        blocks.push(`<p>${escapeHtml(trimmed)}</p>`);
        extractedWordCount += trimmed.split(/\s+/).filter(Boolean).length;
      }
      paraBuffer = "";
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isShort = line.text.length < 140;
      const ratio = line.fontHeight / bodyFontHeight;

      if (isShort && ratio >= 1.38) {
        flushPara();
        blocks.push(`<h2>${escapeHtml(line.text)}</h2>`);
        extractedWordCount += line.text.split(/\s+/).filter(Boolean).length;
        continue;
      }
      if (isShort && ratio >= 1.2) {
        flushPara();
        blocks.push(`<h3>${escapeHtml(line.text)}</h3>`);
        extractedWordCount += line.text.split(/\s+/).filter(Boolean).length;
        continue;
      }

      if (!paraBuffer) {
        paraBuffer = line.text;
        continue;
      }

      const prevLine = lines[i - 1];
      const verticalGap = prevLine.y - line.y;
      const lineStepRef = Math.max(prevLine.fontHeight, line.fontHeight);
      const largeVerticalGap = verticalGap > lineStepRef * 1.52;
      const hasIndent =
        line.minX - pageLeftMargin > line.fontHeight * 1.15 &&
        prevLine.text.length > 20;
      const prevShortSentenceEnd =
        /[.!?]["'”’)\]]*$/.test(prevLine.text) &&
        pageRightEdge - prevLine.maxX > line.fontHeight * 4.5 &&
        prevLine.text.length > 16;

      if (largeVerticalGap || hasIndent || prevShortSentenceEnd) {
        flushPara();
        paraBuffer = line.text;
      } else {
        paraBuffer = appendDeHyphenated(paraBuffer, line.text);
      }
    }
    flushPara();

    chapters.push({
      index: idx,
      id: `pdf-page-${pageNum}`,
      href: `#pdf-page-${pageNum}`,
      title: `Page ${pageNum}`,
      html: blocks.join("\n"),
    });
  }

  return {
    book: {
      title,
      author,
      chapters,
      toc: [],
      cleanupUrls: [],
    },
    extractedWordCount,
  };
}

export async function extractPdfImportMetadata(
  data: ArrayBuffer,
  fileName: string,
): Promise<ImportMetadataResult> {
  const fileHash = await computeSha256Hex(data);
  const doc = await loadPdfDocument(data);
  let title = cleanBaseName(fileName);
  let author = "Unknown Author";
  let description = "";
  let year = "";

  try {
    const meta = await doc.getMetadata();
    const info = meta.info as Record<string, unknown> | undefined;
    if (info) {
      if (typeof info.Title === "string" && info.Title.trim())
        title = info.Title.trim();
      if (typeof info.Author === "string" && info.Author.trim())
        author = info.Author.trim();
      if (typeof info.Subject === "string" && info.Subject.trim())
        description = info.Subject.trim();
      if (typeof info.CreationDate === "string") {
        const yMatch = info.CreationDate.match(/(19|20)\d{2}/);
        if (yMatch) year = yMatch[0];
      }
    }
  } catch {
    // Ignore metadata read errors
  }

  let coverDataUrl: string | null = null;
  try {
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const scale = Math.min(1.25, 360 / Math.max(1, vp.width));
    const scaled = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(scaled.width));
    canvas.height = Math.max(1, Math.round(scaled.height));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: scaled })
        .promise;
      coverDataUrl = canvas.toDataURL("image/jpeg", 0.82);
    }
  } catch {
    coverDataUrl = null;
  }

  const totalUnits = doc.numPages;
  await destroyPdfDocument(doc);

  return {
    format: "pdf",
    fileName,
    fileSize: data.byteLength,
    fileHash,
    title,
    subtitle: "",
    author,
    description,
    publisher: "",
    language: "en",
    year,
    totalUnits,
    coverDataUrl,
  };
}
