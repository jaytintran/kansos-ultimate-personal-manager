import type {
  ImportMetadataResult,
  ParsedChapter,
  ParsedReflowableBook,
  ParsedTocItem,
} from "../../types/library";
import { computeSha256Hex } from "../db";

function cleanBaseName(fileName: string): string {
  return (
    fileName
      .replace(/\.(mobi|prc|azw)$/i, "")
      .replace(/[_-]+/g, " ")
      .trim() || "Untitled MOBI"
  );
}

/**
 * Standard PalmDOC LZ77 decompression used by MOBI / PRC / AZW ebooks.
 */
function decompressPalmDoc(input: Uint8Array): Uint8Array {
  const output: number[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i++];
    if (c === 0) {
      output.push(0);
    } else if (c >= 1 && c <= 8) {
      for (let j = 0; j < c && i < input.length; j++) {
        output.push(input[i++]);
      }
    } else if (c <= 0x7f) {
      output.push(c);
    } else if (c >= 0xc0) {
      output.push(0x20, c ^ 0x80);
    } else {
      // 0x80..0xbf: 2-byte LZ77 distance + length pair
      if (i >= input.length) break;
      const next = input[i++];
      const pair = ((c << 8) | next) & 0x3fff;
      const distance = pair >> 3;
      const length = (pair & 0x07) + 3;
      if (distance === 0 || distance > output.length) continue;
      for (let k = 0; k < length; k++) {
        output.push(output[output.length - distance]);
      }
    }
  }
  return new Uint8Array(output);
}

function readAscii(view: DataView, offset: number, len: number): string {
  let out = "";
  for (let i = 0; i < len && offset + i < view.byteLength; i++) {
    const ch = view.getUint8(offset + i);
    if (ch === 0) break;
    out += String.fromCharCode(ch);
  }
  return out;
}

interface MobiExtracted {
  title: string;
  author: string;
  publisher: string;
  description: string;
  html: string;
}

function decodeMobiBinary(
  buffer: ArrayBuffer,
  fallbackTitle: string,
): MobiExtracted {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  if (buffer.byteLength < 96) {
    throw new Error("File is too small to be a valid MOBI/PRC ebook.");
  }

  const pdbTitle = readAscii(view, 0, 32).replace(/[_]+/g, " ").trim();
  const numRecords = view.getUint16(76, false);
  if (numRecords < 2 || 78 + numRecords * 8 > buffer.byteLength) {
    throw new Error("Unsupported or corrupted MOBI record table.");
  }

  const recordOffsets: number[] = [];
  for (let i = 0; i < numRecords; i++) {
    recordOffsets.push(view.getUint32(78 + i * 8, false));
  }
  recordOffsets.push(buffer.byteLength);

  const rec0Start = recordOffsets[0];
  const rec0End = recordOffsets[1];
  const compression = view.getUint16(rec0Start, false);
  const textRecordCount = view.getUint16(rec0Start + 8, false);
  const encryption = view.getUint16(rec0Start + 12, false);

  if (encryption !== 0) {
    throw new Error(
      "This MOBI file is DRM-encrypted and cannot be opened offline.",
    );
  }
  if (compression !== 1 && compression !== 2) {
    throw new Error(
      "This MOBI uses Huff/CDIC compression. Convert to EPUB for full reading support.",
    );
  }

  let title = pdbTitle || fallbackTitle;
  let author = "Unknown Author";
  let publisher = "";
  let description = "";
  let encoding = 65001; // UTF-8 default
  let trailingFlags = 0;

  // Parse MOBI header if present at rec0Start + 16
  if (
    rec0Start + 32 < rec0End &&
    readAscii(view, rec0Start + 16, 4) === "MOBI"
  ) {
    const mobiHeaderLen = view.getUint32(rec0Start + 20, false);
    encoding = view.getUint32(rec0Start + 28, false);
    const fullNameOffset = view.getUint32(rec0Start + 84, false);
    const fullNameLen = view.getUint32(rec0Start + 88, false);
    if (
      fullNameOffset > 0 &&
      fullNameLen > 0 &&
      rec0Start + fullNameOffset + fullNameLen <= rec0End
    ) {
      const decoder = new TextDecoder(
        encoding === 1252 ? "windows-1252" : "utf-8",
      );
      const fullName = decoder
        .decode(
          bytes.slice(
            rec0Start + fullNameOffset,
            rec0Start + fullNameOffset + fullNameLen,
          ),
        )
        .trim();
      if (fullName) title = fullName;
    }

    if (mobiHeaderLen >= 228 && rec0Start + 244 <= rec0End) {
      trailingFlags = view.getUint32(rec0Start + 240, false);
    }

    // Parse EXTH metadata block if flag bit 0x40 is set
    const exthFlags =
      rec0Start + 132 <= rec0End ? view.getUint32(rec0Start + 128, false) : 0;
    const exthStart = rec0Start + 16 + mobiHeaderLen;
    if (
      (exthFlags & 0x40) !== 0 &&
      exthStart + 12 <= rec0End &&
      readAscii(view, exthStart, 4) === "EXTH"
    ) {
      const exthCount = view.getUint32(exthStart + 8, false);
      let cursor = exthStart + 12;
      const decoder = new TextDecoder(
        encoding === 1252 ? "windows-1252" : "utf-8",
      );
      for (let i = 0; i < exthCount && cursor + 8 <= rec0End; i++) {
        const recType = view.getUint32(cursor, false);
        const recLen = view.getUint32(cursor + 4, false);
        if (recLen < 8 || cursor + recLen > rec0End) break;
        const val = decoder
          .decode(bytes.slice(cursor + 8, cursor + recLen))
          .trim();
        if (recType === 100 && val) author = val;
        if (recType === 101 && val) publisher = val;
        if (recType === 103 && val)
          description = val
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (recType === 503 && val) title = val;
        cursor += recLen;
      }
    }
  }

  // Decompress text records
  const chunks: Uint8Array[] = [];
  let totalDecodedBytes = 0;
  const maxRecord = Math.min(numRecords - 1, textRecordCount);

  for (let i = 1; i <= maxRecord; i++) {
    let start = recordOffsets[i];
    let end = recordOffsets[i + 1];
    if (end <= start) continue;

    // Strip multibyte / extra trailing bytes if indicated by trailingFlags
    if (trailingFlags > 0) {
      let flags = trailingFlags >> 1;
      while (flags > 0 && end > start) {
        if (flags & 1) {
          let size = 0;
          let shift = 0;
          let pos = end - 1;
          while (pos >= start) {
            const b = bytes[pos--];
            size |= (b & 0x7f) << shift;
            shift += 7;
            if (b & 0x80) break;
          }
          if (size > 0 && end - size >= start) {
            end -= size;
          }
        }
        flags >>= 1;
      }
      if (trailingFlags & 1 && end > start) {
        const overlap = (bytes[end - 1] & 0x03) + 1;
        if (end - overlap >= start) end -= overlap;
      }
    }

    const slice = bytes.slice(start, end);
    const decoded = compression === 2 ? decompressPalmDoc(slice) : slice;
    chunks.push(decoded);
    totalDecodedBytes += decoded.byteLength;
  }

  const combined = new Uint8Array(totalDecodedBytes);
  let offset = 0;
  for (const ch of chunks) {
    combined.set(ch, offset);
    offset += ch.byteLength;
  }

  const decoder = new TextDecoder(encoding === 1252 ? "windows-1252" : "utf-8");
  const html = decoder.decode(combined);

  return { title, author, publisher, description, html };
}

function splitMobiHtmlIntoChapters(
  rawHtml: string,
  bookTitle: string,
): {
  chapters: ParsedChapter[];
  toc: ParsedTocItem[];
} {
  const cleaned = rawHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  // Split on Kindle pagebreak markers or major heading tags
  const parts = cleaned
    .split(/<mbp:pagebreak\s*\/?>/i)
    .map((p) => p.trim())
    .filter((p) => p.replace(/<[^>]+>/g, "").trim().length > 0);

  const sections = parts.length > 0 ? parts : [cleaned];
  const parser = new DOMParser();
  const chapters: ParsedChapter[] = [];
  const toc: ParsedTocItem[] = [];

  sections.forEach((sec, idx) => {
    const doc = parser.parseFromString(sec, "text/html");
    doc
      .querySelectorAll("script, style, iframe, object")
      .forEach((el) => el.remove());
    const heading = doc.querySelector("h1, h2, h3, b, strong");
    const candidate = heading?.textContent?.replace(/\s+/g, " ").trim() || "";
    const title =
      candidate && candidate.length <= 90
        ? candidate
        : sections.length === 1
          ? bookTitle
          : `Section ${idx + 1}`;
    const bodyHtml = doc.body?.innerHTML?.trim() || `<p>${sec}</p>`;

    chapters.push({
      index: idx,
      id: `mobi-ch-${idx}`,
      href: `chapter-${idx}`,
      title,
      html: bodyHtml,
    });
    toc.push({
      id: `mobi-toc-${idx}`,
      title,
      unitIndex: idx,
      depth: 0,
    });
  });

  return { chapters, toc };
}

export async function parseMobiForReading(
  data: ArrayBuffer,
  fallbackTitle = "Untitled MOBI",
): Promise<ParsedReflowableBook> {
  const extracted = decodeMobiBinary(data, fallbackTitle);
  const { chapters, toc } = splitMobiHtmlIntoChapters(
    extracted.html,
    extracted.title,
  );
  return {
    title: extracted.title,
    author: extracted.author,
    chapters,
    toc,
    cleanupUrls: [],
  };
}

export async function extractMobiImportMetadata(
  data: ArrayBuffer,
  fileName: string,
): Promise<ImportMetadataResult> {
  const fileHash = await computeSha256Hex(data);
  const extracted = decodeMobiBinary(data, cleanBaseName(fileName));
  const { chapters } = splitMobiHtmlIntoChapters(
    extracted.html,
    extracted.title,
  );
  return {
    format: "mobi",
    fileName,
    fileSize: data.byteLength,
    fileHash,
    title: extracted.title,
    subtitle: "",
    author: extracted.author,
    description: extracted.description,
    publisher: extracted.publisher,
    language: "en",
    year: "",
    totalUnits: Math.max(1, chapters.length),
    coverDataUrl: null,
  };
}
