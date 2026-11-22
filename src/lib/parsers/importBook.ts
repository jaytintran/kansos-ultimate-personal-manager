import type { BookFormat, ImportMetadataResult } from "../../types/library";
import { extractEpubImportMetadata } from "./epubParser";
import { extractMobiImportMetadata } from "./mobiParser";
import { extractPdfImportMetadata } from "./pdfParser";

export function detectBookFormat(fileName: string): BookFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".epub")) return "epub";
  if (lower.endsWith(".pdf")) return "pdf";
  if (
    lower.endsWith(".mobi") ||
    lower.endsWith(".prc") ||
    lower.endsWith(".azw")
  )
    return "mobi";
  return null;
}

export async function extractBookImportMetadataFromBuffer(
  fileName: string,
  fileSize: number,
  buffer: ArrayBuffer,
): Promise<{ meta: ImportMetadataResult; buffer: ArrayBuffer }> {
  const format = detectBookFormat(fileName);
  if (!format) {
    throw new Error(
      `Unsupported file "${fileName}". Please import EPUB, PDF, or MOBI files.`,
    );
  }
  let meta: ImportMetadataResult;
  if (format === "epub") {
    meta = await extractEpubImportMetadata(buffer, fileName);
  } else if (format === "pdf") {
    meta = await extractPdfImportMetadata(buffer, fileName);
  } else {
    meta = await extractMobiImportMetadata(buffer, fileName);
  }
  return {
    meta: {
      ...meta,
      fileSize: meta.fileSize || fileSize,
    },
    buffer,
  };
}

export async function extractBookImportMetadata(
  file: File,
): Promise<{ meta: ImportMetadataResult; buffer: ArrayBuffer }> {
  const format = detectBookFormat(file.name);
  if (!format) {
    throw new Error(
      `Unsupported file "${file.name}". Please import EPUB, PDF, or MOBI files.`,
    );
  }
  const buffer = await file.arrayBuffer();
  return extractBookImportMetadataFromBuffer(file.name, file.size, buffer);
}
