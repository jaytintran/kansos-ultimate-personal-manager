import type { AudioTrackRecord } from "../types/audio";
import {
  checkAndroidAudioUris,
  isAndroidCapacitor,
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
 * 1) Persisted Android SAF content:// URI (zero-copy on Android Capacitor)
 * 2) Local IndexedDB `audio_files` store
 */
export async function resolveAudioFileBuffer(
  track: AudioTrackRecord,
): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  if (track.storageMode === "android-uri" && track.externalUri) {
    if (isAndroidCapacitor()) {
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
 * Creates a playable Blob URL for a track along with a cleanup callback.
 */
export async function resolveAudioPlaybackUrl(
  track: AudioTrackRecord,
): Promise<{ url: string; revoke: () => void }> {
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

  const auditEntries = await audioDb.auditAudioFiles().catch(() => []);
  const idbIds = new Set(auditEntries.map((e) => e.trackId));

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

  const auditEntries = await audioDb.auditAudioFiles().catch(() => []);
  const idbIds = new Set(auditEntries.map((e) => e.trackId));

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
