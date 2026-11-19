import * as pdfjsLib from 'pdfjs-dist';
import type {ImportMetadataResult, ParsedTocItem} from '../../types/library';
import {computeSha256Hex} from '../db';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export type PdfDocumentHandle = pdfjsLib.PDFDocumentProxy;

function cleanBaseName(fileName: string): string {
  return (
    fileName
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'Untitled PDF'
  );
}

export async function loadPdfDocument(data: ArrayBuffer): Promise<PdfDocumentHandle> {
  // Always copy slice so PDF.js worker transfer never detaches caller's ArrayBuffer
  const copy = new Uint8Array(data.slice(0));
  const loadingTask = pdfjsLib.getDocument({data: copy});
  return loadingTask.promise;
}

export async function destroyPdfDocument(doc: PdfDocumentHandle | null): Promise<void> {
  if (!doc) return;
  try {
    const maybeDestroyable = doc as unknown as {destroy?: () => Promise<void>};
    if (typeof maybeDestroyable.destroy === 'function') {
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

export async function extractPdfToc(doc: PdfDocumentHandle): Promise<ParsedTocItem[]> {
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
          if (typeof node.dest === 'string') {
            destArray = (await doc.getDestination(node.dest)) as unknown[] | null;
          } else if (Array.isArray(node.dest)) {
            destArray = node.dest;
          }
          if (destArray && destArray[0]) {
            const ref = destArray[0];
            if (typeof ref === 'number') {
              pageNum = ref + 1;
            } else {
              const idx = await doc.getPageIndex(ref as Parameters<typeof doc.getPageIndex>[0]);
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

export async function extractPdfImportMetadata(
  data: ArrayBuffer,
  fileName: string
): Promise<ImportMetadataResult> {
  const fileHash = await computeSha256Hex(data);
  const doc = await loadPdfDocument(data);
  let title = cleanBaseName(fileName);
  let author = 'Unknown Author';
  let description = '';
  let year = '';

  try {
    const meta = await doc.getMetadata();
    const info = meta.info as Record<string, unknown> | undefined;
    if (info) {
      if (typeof info.Title === 'string' && info.Title.trim()) title = info.Title.trim();
      if (typeof info.Author === 'string' && info.Author.trim()) author = info.Author.trim();
      if (typeof info.Subject === 'string' && info.Subject.trim()) description = info.Subject.trim();
      if (typeof info.CreationDate === 'string') {
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
    const vp = page.getViewport({scale: 1});
    const scale = Math.min(1.25, 360 / Math.max(1, vp.width));
    const scaled = page.getViewport({scale});
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(scaled.width));
    canvas.height = Math.max(1, Math.round(scaled.height));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({canvas, canvasContext: ctx, viewport: scaled}).promise;
      coverDataUrl = canvas.toDataURL('image/jpeg', 0.82);
    }
  } catch {
    coverDataUrl = null;
  }

  const totalUnits = doc.numPages;
  await destroyPdfDocument(doc);

  return {
    format: 'pdf',
    fileName,
    fileSize: data.byteLength,
    fileHash,
    title,
    subtitle: '',
    author,
    description,
    publisher: '',
    language: 'en',
    year,
    totalUnits,
    coverDataUrl,
  };
}
