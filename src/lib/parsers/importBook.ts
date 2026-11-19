import type {BookFormat, ImportMetadataResult} from '../../types/library';
import {extractEpubImportMetadata} from './epubParser';
import {extractMobiImportMetadata} from './mobiParser';
import {extractPdfImportMetadata} from './pdfParser';

export function detectBookFormat(fileName: string): BookFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.epub')) return 'epub';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.mobi') || lower.endsWith('.prc') || lower.endsWith('.azw')) return 'mobi';
  return null;
}

export async function extractBookImportMetadata(
  file: File
): Promise<{meta: ImportMetadataResult; buffer: ArrayBuffer}> {
  const format = detectBookFormat(file.name);
  if (!format) {
    throw new Error(`Unsupported file "${file.name}". Please import EPUB, PDF, or MOBI files.`);
  }
  const buffer = await file.arrayBuffer();
  let meta: ImportMetadataResult;
  if (format === 'epub') {
    meta = await extractEpubImportMetadata(buffer, file.name);
  } else if (format === 'pdf') {
    meta = await extractPdfImportMetadata(buffer, file.name);
  } else {
    meta = await extractMobiImportMetadata(buffer, file.name);
  }
  return {meta, buffer};
}
