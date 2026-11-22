import type { AudioFormat, AudioImportMetadataResult } from "../types/audio";
import { computeSha256Hex } from "./db";
import { compressCoverDataUrl } from "./formatters";

const EXT_TO_FORMAT: Record<string, AudioFormat> = {
  mp3: "mp3",
  m4a: "m4a",
  mp4: "m4a",
  wav: "wav",
  wave: "wav",
  ogg: "ogg",
  oga: "ogg",
  flac: "flac",
  opus: "opus",
  aac: "aac",
};

const FORMAT_TO_MIME: Record<AudioFormat, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  opus: "audio/opus",
  aac: "audio/aac",
};

export function detectAudioFormat(
  fileName: string,
  mimeType = "",
): AudioFormat | null {
  const lower = (fileName || "").trim().toLowerCase();
  const extMatch = lower.match(/\.([a-z0-9]{2,5})$/);
  if (extMatch && EXT_TO_FORMAT[extMatch[1]]) {
    return EXT_TO_FORMAT[extMatch[1]];
  }
  const mime = mimeType.toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("x-m4a"))
    return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("opus")) return "opus";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("aac")) return "aac";
  return null;
}

export function getAudioMimeType(format: AudioFormat, rawMime?: string): string {
  if (rawMime && rawMime.startsWith("audio/")) return rawMime;
  return FORMAT_TO_MIME[format] || "audio/mpeg";
}

function cleanTrackBaseTitle(fileName: string): {
  title: string;
  artist: string;
} {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").trim();
  const dashIdx = base.indexOf(" - ");
  if (dashIdx > 0 && dashIdx < base.length - 4) {
    return {
      artist: base.slice(0, dashIdx).trim(),
      title: base.slice(dashIdx + 3).trim(),
    };
  }
  return { title: base || "Untitled Track", artist: "Unknown Artist" };
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + chunk));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function decodeTextBytes(bytes: Uint8Array, encodingByte: number): string {
  try {
    if (encodingByte === 1 || encodingByte === 2) {
      const hasBomLE = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
      const hasBomBE = bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff;
      const decoderName = hasBomBE || (encodingByte === 2 && !hasBomLE)
        ? "utf-16be"
        : "utf-16le";
      const start = hasBomLE || hasBomBE ? 2 : 0;
      return new TextDecoder(decoderName).decode(bytes.subarray(start)).replace(/\0+$/g, "").trim();
    }
    if (encodingByte === 3) {
      return new TextDecoder("utf-8").decode(bytes).replace(/\0+$/g, "").trim();
    }
    return new TextDecoder("latin1").decode(bytes).replace(/\0+$/g, "").trim();
  } catch {
    return "";
  }
}

function readSynchsafe(view: DataView, offset: number): number {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  );
}

interface ParsedRawTags {
  title?: string;
  artist?: string;
  album?: string;
  trackNumber?: number | null;
  year?: string;
  genre?: string;
  coverDataUrl?: string | null;
}

function parseTrackNumber(raw: string): number | null {
  const m = raw.trim().match(/^(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseId3v2(bytes: Uint8Array): ParsedRawTags {
  const out: ParsedRawTags = {};
  if (bytes.length < 10) return out;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return out;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const major = bytes[3];
  const flags = bytes[5];
  const tagSize = readSynchsafe(view, 6);
  const end = Math.min(bytes.length, 10 + tagSize);

  let pos = 10;
  if ((flags & 0x40) !== 0 && pos + 4 <= end) {
    const extSize =
      major >= 4 ? readSynchsafe(view, pos) : view.getUint32(pos, false);
    pos += Math.max(4, extSize);
  }

  if (major === 2) {
    while (pos + 6 <= end) {
      const frameId = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2]);
      if (bytes[pos] === 0) break;
      const frameSize =
        (bytes[pos + 3] << 16) | (bytes[pos + 4] << 8) | bytes[pos + 5];
      pos += 6;
      if (frameSize <= 0 || pos + frameSize > end) break;
      const payload = bytes.subarray(pos, pos + frameSize);
      pos += frameSize;

      if (frameId === "TT2") out.title = decodeTextBytes(payload.subarray(1), payload[0]);
      else if (frameId === "TP1") out.artist = decodeTextBytes(payload.subarray(1), payload[0]);
      else if (frameId === "TAL") out.album = decodeTextBytes(payload.subarray(1), payload[0]);
      else if (frameId === "TRK") out.trackNumber = parseTrackNumber(decodeTextBytes(payload.subarray(1), payload[0]));
      else if (frameId === "TYE") out.year = decodeTextBytes(payload.subarray(1), payload[0]).slice(0, 4);
      else if (frameId === "TCO") out.genre = decodeTextBytes(payload.subarray(1), payload[0]);
      else if (frameId === "PIC" && !out.coverDataUrl && payload.length > 6) {
        const enc = payload[0];
        const imgFmt = String.fromCharCode(payload[1], payload[2], payload[3]).toLowerCase();
        const mime = imgFmt === "png" ? "image/png" : "image/jpeg";
        let cursor = 5;
        if (enc === 1 || enc === 2) {
          while (cursor + 1 < payload.length && !(payload[cursor] === 0 && payload[cursor + 1] === 0)) cursor += 2;
          cursor += 2;
        } else {
          while (cursor < payload.length && payload[cursor] !== 0) cursor++;
          cursor += 1;
        }
        if (cursor < payload.length) {
          const picBytes = payload.subarray(cursor);
          if (picBytes.length > 16) {
            out.coverDataUrl = `data:${mime};base64,${uint8ToBase64(picBytes)}`;
          }
        }
      }
    }
    return out;
  }

  while (pos + 10 <= end) {
    const frameId = String.fromCharCode(
      bytes[pos],
      bytes[pos + 1],
      bytes[pos + 2],
      bytes[pos + 3],
    );
    if (bytes[pos] === 0) break;
    const frameSize =
      major >= 4 ? readSynchsafe(view, pos + 4) : view.getUint32(pos + 4, false);
    pos += 10;
    if (frameSize <= 0 || pos + frameSize > end) break;
    const payload = bytes.subarray(pos, pos + frameSize);
    pos += frameSize;

    if (frameId === "TIT2") out.title = decodeTextBytes(payload.subarray(1), payload[0]);
    else if (frameId === "TPE1" && !out.artist) out.artist = decodeTextBytes(payload.subarray(1), payload[0]);
    else if (frameId === "TPE2" && !out.artist) out.artist = decodeTextBytes(payload.subarray(1), payload[0]);
    else if (frameId === "TALB") out.album = decodeTextBytes(payload.subarray(1), payload[0]);
    else if (frameId === "TRCK") out.trackNumber = parseTrackNumber(decodeTextBytes(payload.subarray(1), payload[0]));
    else if (frameId === "TDRC" || frameId === "TYER") {
      const yr = decodeTextBytes(payload.subarray(1), payload[0]).match(/\d{4}/);
      if (yr) out.year = yr[0];
    } else if (frameId === "TCON") {
      out.genre = decodeTextBytes(payload.subarray(1), payload[0]);
    } else if (frameId === "APIC" && !out.coverDataUrl && payload.length > 4) {
      const enc = payload[0];
      let cursor = 1;
      let mime = "";
      while (cursor < payload.length && payload[cursor] !== 0) {
        mime += String.fromCharCode(payload[cursor]);
        cursor++;
      }
      cursor++; // skip null
      cursor++; // skip picture type byte
      if (enc === 1 || enc === 2) {
        while (cursor + 1 < payload.length && !(payload[cursor] === 0 && payload[cursor + 1] === 0)) {
          cursor += 2;
        }
        cursor += 2;
      } else {
        while (cursor < payload.length && payload[cursor] !== 0) cursor++;
        cursor++;
      }
      if (cursor < payload.length) {
        const picBytes = payload.subarray(cursor);
        if (picBytes.length > 16) {
          const resolvedMime = mime.includes("/") ? mime : "image/jpeg";
          out.coverDataUrl = `data:${resolvedMime};base64,${uint8ToBase64(picBytes)}`;
        }
      }
    }
  }

  return out;
}

function parseMp4Tags(bytes: Uint8Array): ParsedRawTags {
  const out: ParsedRawTags = {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const readType = (off: number) =>
    String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);

  const walkBoxes = (start: number, end: number, path: string[]) => {
    let pos = start;
    while (pos + 8 <= end) {
      let size = view.getUint32(pos, false);
      const boxType = readType(pos + 4);
      let header = 8;
      if (size === 1 && pos + 16 <= end) {
        size = Number(view.getBigUint64(pos + 8, false));
        header = 16;
      } else if (size === 0) {
        size = end - pos;
      }
      if (size < header || pos + size > end) break;
      const bodyStart = pos + header;
      const bodyEnd = pos + size;

      if (boxType === "moov" || boxType === "udta" || boxType === "ilst") {
        walkBoxes(bodyStart, bodyEnd, [...path, boxType]);
      } else if (boxType === "meta" && bodyStart + 4 <= bodyEnd) {
        // meta is a FullBox (4 bytes version+flags before children)
        walkBoxes(bodyStart + 4, bodyEnd, [...path, "meta"]);
      } else if (path[path.length - 1] === "ilst") {
        // Look inside data atom(s)
        let inner = bodyStart;
        while (inner + 16 <= bodyEnd) {
          const dSize = view.getUint32(inner, false);
          const dType = readType(inner + 4);
          if (dSize < 16 || inner + dSize > bodyEnd) break;
          if (dType === "data") {
            const typeIndicator = view.getUint32(inner + 8, false);
            const payload = bytes.subarray(inner + 16, inner + dSize);
            if (boxType === "\u00a9nam") {
              out.title = new TextDecoder("utf-8").decode(payload).trim();
            } else if (boxType === "\u00a9ART" || boxType === "aART") {
              if (!out.artist) {
                out.artist = new TextDecoder("utf-8").decode(payload).trim();
              }
            } else if (boxType === "\u00a9alb") {
              out.album = new TextDecoder("utf-8").decode(payload).trim();
            } else if (boxType === "\u00a9day") {
              const yr = new TextDecoder("utf-8").decode(payload).match(/\d{4}/);
              if (yr) out.year = yr[0];
            } else if (boxType === "\u00a9gen") {
              out.genre = new TextDecoder("utf-8").decode(payload).trim();
            } else if (boxType === "trkn" && payload.length >= 4) {
              const trk = (payload[2] << 8) | payload[3];
              if (trk > 0) out.trackNumber = trk;
            } else if (boxType === "covr" && !out.coverDataUrl && payload.length > 16) {
              const mime =
                typeIndicator === 14
                  ? "image/png"
                  : typeIndicator === 27
                    ? "image/bmp"
                    : "image/jpeg";
              out.coverDataUrl = `data:${mime};base64,${uint8ToBase64(payload)}`;
            }
          }
          inner += dSize;
        }
      }
      pos += size;
    }
  };

  walkBoxes(0, bytes.length, []);
  return out;
}

function parseVorbisCommentBlock(
  bytes: Uint8Array,
  out: ParsedRawTags,
): void {
  if (bytes.length < 8) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vendorLen = view.getUint32(0, true);
  let pos = 4 + vendorLen;
  if (pos + 4 > bytes.length) return;
  const count = view.getUint32(pos, true);
  pos += 4;
  for (let i = 0; i < count && pos + 4 <= bytes.length; i++) {
    const len = view.getUint32(pos, true);
    pos += 4;
    if (len <= 0 || pos + len > bytes.length) break;
    const raw = new TextDecoder("utf-8").decode(bytes.subarray(pos, pos + len));
    pos += len;
    const eq = raw.indexOf("=");
    if (eq <= 0) continue;
    const key = raw.slice(0, eq).trim().toUpperCase();
    const val = raw.slice(eq + 1).trim();
    if (!val) continue;
    if (key === "TITLE") out.title = val;
    else if (key === "ARTIST" || (key === "ALBUMARTIST" && !out.artist))
      out.artist = val;
    else if (key === "ALBUM") out.album = val;
    else if (key === "TRACKNUMBER") out.trackNumber = parseTrackNumber(val);
    else if (key === "DATE" || key === "YEAR") {
      const m = val.match(/\d{4}/);
      if (m) out.year = m[0];
    } else if (key === "GENRE") out.genre = val;
    else if (key === "METADATA_BLOCK_PICTURE" && !out.coverDataUrl) {
      try {
        const bin = atob(val);
        const picBytes = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) picBytes[j] = bin.charCodeAt(j);
        const cover = parseFlacPictureBlock(picBytes);
        if (cover) out.coverDataUrl = cover;
      } catch {
        // Ignore malformed base64 picture
      }
    }
  }
}

function parseFlacPictureBlock(bytes: Uint8Array): string | null {
  if (bytes.length < 32) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 4; // skip picture type
  const mimeLen = view.getUint32(pos, false);
  pos += 4;
  if (pos + mimeLen + 4 > bytes.length) return null;
  const mime = new TextDecoder("latin1").decode(
    bytes.subarray(pos, pos + mimeLen),
  );
  pos += mimeLen;
  const descLen = view.getUint32(pos, false);
  pos += 4 + descLen + 16; // skip description + width/height/depth/colors
  if (pos + 4 > bytes.length) return null;
  const dataLen = view.getUint32(pos, false);
  pos += 4;
  if (dataLen <= 16 || pos + dataLen > bytes.length) return null;
  const resolvedMime = mime.includes("/") ? mime : "image/jpeg";
  return `data:${resolvedMime};base64,${uint8ToBase64(bytes.subarray(pos, pos + dataLen))}`;
}

function parseFlacTags(bytes: Uint8Array): ParsedRawTags & { durationHint?: number } {
  const out: ParsedRawTags & { durationHint?: number } = {};
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x66 ||
    bytes[1] !== 0x4c ||
    bytes[2] !== 0x61 ||
    bytes[3] !== 0x43
  ) {
    return out;
  }
  let pos = 4;
  while (pos + 4 <= bytes.length) {
    const headerByte = bytes[pos];
    const isLast = (headerByte & 0x80) !== 0;
    const blockType = headerByte & 0x7f;
    const blockSize =
      (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
    pos += 4;
    if (pos + blockSize > bytes.length) break;
    const block = bytes.subarray(pos, pos + blockSize);
    pos += blockSize;

    if (blockType === 0 && block.length >= 18) {
      // STREAMINFO: sampleRate (20 bits at byte 10), totalSamples (36 bits)
      const sampleRate =
        (block[10] << 12) | (block[11] << 4) | (block[12] >> 4);
      const totalSamplesHigh = block[13] & 0x0f;
      const totalSamplesLow =
        ((block[14] << 24) >>> 0) +
        (block[15] << 16) +
        (block[16] << 8) +
        block[17];
      const totalSamples = totalSamplesHigh * 4294967296 + totalSamplesLow;
      if (sampleRate > 0 && totalSamples > 0) {
        out.durationHint = totalSamples / sampleRate;
      }
    } else if (blockType === 4) {
      parseVorbisCommentBlock(block, out);
    } else if (blockType === 6 && !out.coverDataUrl) {
      const pic = parseFlacPictureBlock(block);
      if (pic) out.coverDataUrl = pic;
    }

    if (isLast) break;
  }
  return out;
}

function parseOggTags(bytes: Uint8Array): ParsedRawTags {
  const out: ParsedRawTags = {};
  // Scan early Ogg pages for "vorbis" (type 3) or "OpusTags" comment header
  const limit = Math.min(bytes.length, 262144);
  for (let i = 0; i < limit - 12; i++) {
    if (
      bytes[i] === 0x03 &&
      bytes[i + 1] === 0x76 &&
      bytes[i + 2] === 0x6f &&
      bytes[i + 3] === 0x72 &&
      bytes[i + 4] === 0x62 &&
      bytes[i + 5] === 0x69 &&
      bytes[i + 6] === 0x73
    ) {
      parseVorbisCommentBlock(bytes.subarray(i + 7, limit), out);
      break;
    }
    if (
      bytes[i] === 0x4f &&
      bytes[i + 1] === 0x70 &&
      bytes[i + 2] === 0x75 &&
      bytes[i + 3] === 0x73 &&
      bytes[i + 4] === 0x54 &&
      bytes[i + 5] === 0x61 &&
      bytes[i + 6] === 0x67 &&
      bytes[i + 7] === 0x73
    ) {
      parseVorbisCommentBlock(bytes.subarray(i + 8, limit), out);
      break;
    }
  }
  return out;
}

function parseRiffWavTags(bytes: Uint8Array): ParsedRawTags {
  const out: ParsedRawTags = {};
  if (
    bytes.length < 12 ||
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "RIFF"
  ) {
    return out;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = String.fromCharCode(
      bytes[pos],
      bytes[pos + 1],
      bytes[pos + 2],
      bytes[pos + 3],
    );
    const size = view.getUint32(pos + 4, true);
    pos += 8;
    if (pos + size > bytes.length) break;
    if (id === "id3 " || id === "ID3 ") {
      Object.assign(out, parseId3v2(bytes.subarray(pos, pos + size)));
    } else if (id === "LIST" && size >= 4) {
      const listType = String.fromCharCode(
        bytes[pos],
        bytes[pos + 1],
        bytes[pos + 2],
        bytes[pos + 3],
      );
      if (listType === "INFO") {
        let p = pos + 4;
        const end = pos + size;
        while (p + 8 <= end) {
          const subId = String.fromCharCode(
            bytes[p],
            bytes[p + 1],
            bytes[p + 2],
            bytes[p + 3],
          );
          const subSize = view.getUint32(p + 4, true);
          p += 8;
          if (p + subSize > end) break;
          const val = new TextDecoder("utf-8")
            .decode(bytes.subarray(p, p + subSize))
            .replace(/\0+$/g, "")
            .trim();
          if (val) {
            if (subId === "INAM") out.title = val;
            else if (subId === "IART") out.artist = val;
            else if (subId === "IPRD") out.album = val;
            else if (subId === "ICRD") {
              const yr = val.match(/\d{4}/);
              if (yr) out.year = yr[0];
            } else if (subId === "IGNR") out.genre = val;
          }
          p += subSize + (subSize % 2);
        }
      }
    }
    pos += size + (size % 2);
  }
  return out;
}

export function buildDeterministicWaveformPeaks(
  buffer: ArrayBuffer,
  barCount = 48,
): number[] {
  const bytes = new Uint8Array(buffer);
  const len = bytes.length;
  if (len === 0) return Array.from({ length: barCount }, () => 0.35);

  const peaks: number[] = [];
  const startOffset = Math.min(len - 1, 2048);
  const span = Math.max(1, len - startOffset);
  const step = Math.max(1, Math.floor(span / barCount));

  for (let i = 0; i < barCount; i++) {
    const chunkStart = startOffset + i * step;
    const sampleStep = Math.max(1, Math.floor(step / 16));
    let sum = 0;
    let count = 0;
    for (
      let j = chunkStart;
      j < Math.min(len, chunkStart + step);
      j += sampleStep
    ) {
      const centered = Math.abs(bytes[j] - 128) / 128;
      sum += centered;
      count++;
    }
    const avg = count > 0 ? sum / count : 0.4;
    peaks.push(Math.max(0.18, Math.min(0.98, 0.22 + avg * 0.9)));
  }
  return peaks;
}

async function probeAudioDuration(
  buffer: ArrayBuffer,
  mimeType: string,
): Promise<number> {
  if (typeof Audio === "undefined" || typeof URL === "undefined") return 0;
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<number>((resolve) => {
      const el = new Audio();
      el.preload = "metadata";
      const timer = window.setTimeout(() => {
        cleanup();
        resolve(0);
      }, 3500);
      const cleanup = () => {
        window.clearTimeout(timer);
        el.removeAttribute("src");
        el.load();
      };
      el.onloadedmetadata = () => {
        const dur =
          Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
        cleanup();
        resolve(dur);
      };
      el.onerror = () => {
        cleanup();
        resolve(0);
      };
      el.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function extractRealWaveformPeaks(
  buffer: ArrayBuffer,
  barCount = 48,
): Promise<number[] | null> {
  // Only decode moderate-sized files (<= 30 MB) to avoid excessive memory pressure on Android
  if (
    buffer.byteLength > 30 * 1024 * 1024 ||
    typeof window === "undefined"
  ) {
    return null;
  }
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;

  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioCtx();
    const copy = buffer.slice(0);
    const audioBuffer = await Promise.race([
      ctx.decodeAudioData(copy),
      new Promise<never>((_, rej) =>
        window.setTimeout(() => rej(new Error("decode timeout")), 3500),
      ),
    ]);
    const channelData = audioBuffer.getChannelData(0);
    const totalSamples = channelData.length;
    if (totalSamples === 0) return null;

    const blockSize = Math.max(1, Math.floor(totalSamples / barCount));
    const rawPeaks: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const start = i * blockSize;
      const end = Math.min(totalSamples, start + blockSize);
      const stride = Math.max(1, Math.floor((end - start) / 64));
      let peak = 0;
      for (let s = start; s < end; s += stride) {
        const v = Math.abs(channelData[s]);
        if (v > peak) peak = v;
      }
      rawPeaks.push(peak);
    }
    const maxPeak = Math.max(0.05, ...rawPeaks);
    return rawPeaks.map((p) =>
      Math.max(0.12, Math.min(1, Number((p / maxPeak).toFixed(2)))),
    );
  } catch {
    return null;
  } finally {
    if (ctx) {
      void ctx.close().catch(() => undefined);
    }
  }
}

export async function extractAudioMetadataFromBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  rawMimeType = "",
  knownSize?: number,
): Promise<AudioImportMetadataResult> {
  const format = detectAudioFormat(fileName, rawMimeType) ?? "mp3";
  const mimeType = getAudioMimeType(format, rawMimeType);
  const bytes = new Uint8Array(buffer);
  const fallback = cleanTrackBaseTitle(fileName);

  let parsed: ParsedRawTags & { durationHint?: number } = {};

  if (format === "mp3" || format === "aac") {
    parsed = parseId3v2(bytes);
  } else if (format === "m4a") {
    parsed = parseMp4Tags(bytes);
  } else if (format === "flac") {
    parsed = parseFlacTags(bytes);
  } else if (format === "ogg" || format === "opus") {
    parsed = parseOggTags(bytes);
  } else if (format === "wav") {
    parsed = parseRiffWavTags(bytes);
  }

  // Fallback check if an MP3/AAC file started slightly past header or had ID3 on WAV
  if (!parsed.title && bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    parsed = { ...parseId3v2(bytes), ...parsed };
  }

  const [fileHash, probedDuration, decodedPeaks, compressedCover] =
    await Promise.all([
      computeSha256Hex(buffer),
      probeAudioDuration(buffer, mimeType),
      extractRealWaveformPeaks(buffer),
      parsed.coverDataUrl
        ? compressCoverDataUrl(parsed.coverDataUrl, 360, 360, 0.8)
        : Promise.resolve(null),
    ]);

  const durationSeconds =
    probedDuration > 0
      ? probedDuration
      : parsed.durationHint && parsed.durationHint > 0
        ? parsed.durationHint
        : 0;

  return {
    format,
    mimeType,
    fileName,
    fileSize: knownSize && knownSize > 0 ? knownSize : buffer.byteLength,
    fileHash,
    title: parsed.title || fallback.title,
    artist: parsed.artist || fallback.artist,
    album: parsed.album || "",
    trackNumber: parsed.trackNumber ?? null,
    year: parsed.year || "",
    genre: parsed.genre || "",
    durationSeconds,
    waveformPeaks: decodedPeaks || buildDeterministicWaveformPeaks(buffer),
    coverDataUrl: compressedCover,
  };
}
