import type { AudioTrackRecord } from "../types/audio";
import {
  checkAndroidAudioUris,
  isAndroidCapacitor,
  prepareAndroidAudioSrc,
  readAndroidUriAsArrayBuffer,
} from "../utils/androidSaf";
import { audioDb } from "./db";

export class AudioFileMissingError extends Error {
  trackId: string;
  reason: "not-on-device" | "uri-unreadable";

  constructor(
    trackId: string,
    reason: "not-on-device" | "uri-unreadable",
    message: string,
  ) {
    super(message);
    this.name = "AudioFileMissingError";
    this.trackId = trackId;
    this.reason = reason;
  }
}

/**
 * Resolves the raw audio ArrayBuffer for an AudioTrackRecord from either:
 * 1) Native Android SAF cache via Capacitor HTTP asset loader (or Base64 fallback)
 * 2) Local IndexedDB `audio_files` store
 */
export async function resolveAudioFileBuffer(
  track: AudioTrackRecord,
): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  if (track.storageMode === "android-uri" && track.externalUri) {
    if (isAndroidCapacitor()) {
      try {
        const prepared = await prepareAndroidAudioSrc(
          track.externalUri,
          track.format,
        );
        const res = await fetch(prepared.src);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          return { buffer, mimeType: track.mimeType || "audio/mpeg" };
        }
      } catch {
        // Fallback to chunked SAF bridge or IndexedDB cache
      }
      try {
        const buffer = await readAndroidUriAsArrayBuffer(
          track.externalUri,
          track.fileSize,
        );
        return { buffer, mimeType: track.mimeType || "audio/mpeg" };
      } catch {
        const cached = await audioDb.getAudioFile(track.id);
        if (cached?.data) {
          return {
            buffer: cached.data,
            mimeType: cached.mimeType || track.mimeType || "audio/mpeg",
          };
        }
        throw new AudioFileMissingError(
          track.id,
          "uri-unreadable",
          `The linked audio file "${track.fileName}" could not be read from device storage. It may have been moved or deleted.`,
        );
      }
    }
  }

  const stored = await audioDb.getAudioFile(track.id);
  if (stored?.data) {
    return {
      buffer: stored.data,
      mimeType: stored.mimeType || track.mimeType || "audio/mpeg",
    };
  }

  throw new AudioFileMissingError(
    track.id,
    "not-on-device",
    `The audio file "${track.fileName}" is not stored on this device.`,
  );
}

/**
 * Creates a playable URL for a track along with a cleanup callback.
 * On Android Capacitor linked tracks, streams directly from native Android LRU cache
 * via Capacitor.convertFileSrc (`https://localhost/_capacitor_file_/...`) without
 * loading multi-megabyte blobs across the Base64 JS bridge.
 */
export async function resolveAudioPlaybackUrl(
  track: AudioTrackRecord,
): Promise<{ url: string; revoke: () => void }> {
  if (
    track.storageMode === "android-uri" &&
    track.externalUri &&
    isAndroidCapacitor()
  ) {
    try {
      const prepared = await prepareAndroidAudioSrc(
        track.externalUri,
        track.format,
      );
      return {
        url: prepared.src,
        revoke: () => {
          // Managed by native Android LRU cache
        },
      };
    } catch (nativeErr) {
      const errMsg =
        nativeErr instanceof Error ? nativeErr.message.toLowerCase() : "";
      const isUnimplemented =
        errMsg.includes("not implemented") || errMsg.includes("unimplemented");
      if (!isUnimplemented) {
        // Check IndexedDB fallback before failing
        const cached = await audioDb.getAudioFile(track.id).catch(() => null);
        if (cached?.data) {
          const blob = new Blob([cached.data], {
            type: cached.mimeType || track.mimeType || "audio/mpeg",
          });
          const url = URL.createObjectURL(blob);
          return {
            url,
            revoke: () => {
              try {
                URL.revokeObjectURL(url);
              } catch {
                // Ignore
              }
            },
          };
        }
        throw new AudioFileMissingError(
          track.id,
          "uri-unreadable",
          `The linked audio file "${track.fileName}" could not be read from device storage. Tap Relink.`,
        );
      }
    }
  }

  const { buffer, mimeType } = await resolveAudioFileBuffer(track);
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  return {
    url,
    revoke: () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore already revoked URLs
      }
    },
  };
}

/**
 * Audits broken Android SAF audio links (`storageMode === "android-uri"`) on Android.
 * Relink UI stays scoped strictly to broken Android SAF links.
 */
export async function findMissingAudioIds(
  tracks: AudioTrackRecord[],
): Promise<Set<string>> {
  const missing = new Set<string>();
  if (tracks.length === 0 || !isAndroidCapacitor()) return missing;

  const androidTracks = tracks.filter(
    (t) => t.storageMode === "android-uri",
  );
  if (androidTracks.length === 0) return missing;

  const idbIds = await audioDb
    .getAudioFileIds()
    .catch(() => new Set<string>());

  const urisToCheck = androidTracks
    .map((t) => t.externalUri)
    .filter((u): u is string => Boolean(u));

  const statusMap =
    urisToCheck.length > 0 ? await checkAndroidAudioUris(urisToCheck) : {};

  for (const track of androidTracks) {
    if (idbIds.has(track.id)) continue;
    if (track.externalUri && statusMap[track.externalUri] === true) continue;
    missing.add(track.id);
  }

  return missing;
}

/**
 * Finds all audio cards whose local binary file is missing on this device
 * (neither stored in IndexedDB nor backed by a readable Android SAF URI).
 */
export async function findOrphanedMissingAudioIds(
  tracks: AudioTrackRecord[],
): Promise<Set<string>> {
  const missing = new Set<string>();
  if (tracks.length === 0) return missing;

  const idbIds = await audioDb
    .getAudioFileIds()
    .catch(() => new Set<string>());

  const urisToCheck: string[] = [];
  if (isAndroidCapacitor()) {
    for (const track of tracks) {
      if (track.storageMode === "android-uri" && track.externalUri) {
        urisToCheck.push(track.externalUri);
      }
    }
  }

  const statusMap =
    urisToCheck.length > 0 ? await checkAndroidAudioUris(urisToCheck) : {};

  for (const track of tracks) {
    if (idbIds.has(track.id)) continue;
    if (
      isAndroidCapacitor() &&
      track.storageMode === "android-uri" &&
      track.externalUri &&
      statusMap[track.externalUri] === true
    ) {
      continue;
    }
    missing.add(track.id);
  }

  return missing;
}
