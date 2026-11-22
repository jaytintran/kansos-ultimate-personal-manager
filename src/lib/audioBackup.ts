import JSZip from "jszip";
import type {
  AudioFolderRecord,
  AudioMixPreset,
  AudioPlaylistRecord,
  AudioTrackRecord,
} from "../types/audio";
import { resolveAudioFileBuffer } from "./audioFileLoader";
import { audioDb } from "./db";

export interface AudioBackupFileEntry {
  trackId: string;
  fileName: string;
  mimeType: string;
  data: ArrayBuffer;
}

export interface AudioBackupSnapshot {
  version: number;
  exportedAt: number;
  tracks: AudioTrackRecord[];
  folders: AudioFolderRecord[];
  playlists: AudioPlaylistRecord[];
  presets: AudioMixPreset[];
  files: AudioBackupFileEntry[];
}

export interface ParsedAudioBackupArchive {
  fileName: string;
  fileSize: number;
  exportedAt: number;
  snapshot: AudioBackupSnapshot;
}

export async function exportAudioBackupZip(params: {
  tracks: AudioTrackRecord[];
  folders: AudioFolderRecord[];
  playlists: AudioPlaylistRecord[];
  presets: AudioMixPreset[];
  inAppOnly?: boolean;
}): Promise<Blob> {
  const zip = new JSZip();
  const exportedAt = Date.now();
  const fileEntries: Array<{
    trackId: string;
    archivePath: string;
    fileName: string;
    mimeType: string;
  }> = [];

  let candidateTracks = params.tracks;
  if (params.inAppOnly) {
    const audit = await audioDb.auditAudioFiles().catch(() => []);
    const idbTrackIds = new Set(audit.map((a) => a.trackId));
    candidateTracks = params.tracks.filter(
      (t) => t.storageMode !== "android-uri" && idbTrackIds.has(t.id),
    );
  }

  const exportedTrackIds = new Set<string>();

  for (const track of candidateTracks) {
    let data: ArrayBuffer | null = null;
    let mimeType = track.mimeType || "audio/mpeg";
    try {
      if (params.inAppOnly) {
        const stored = await audioDb.getAudioFile(track.id);
        data = stored?.data ?? null;
        if (stored?.mimeType) mimeType = stored.mimeType;
      } else {
        const resolved = await resolveAudioFileBuffer(track);
        data = resolved.buffer;
        mimeType = resolved.mimeType;
      }
    } catch {
      data = null;
    }
    if (!data) continue;
    const safeExt = track.format || "mp3";
    const archivePath = `files/${track.id}.${safeExt}`;
    zip.file(archivePath, data);
    fileEntries.push({
      trackId: track.id,
      archivePath,
      fileName: track.fileName,
      mimeType,
    });
    exportedTrackIds.add(track.id);
  }

  const exportedTracks = params.inAppOnly
    ? candidateTracks.filter((t) => exportedTrackIds.has(t.id))
    : params.tracks;

  const exportedPlaylists = params.inAppOnly
    ? params.playlists.map((pl) => ({
        ...pl,
        trackIds: pl.trackIds.filter((tid) => exportedTrackIds.has(tid)),
      }))
    : params.playlists;

  const exportedPresets = params.inAppOnly
    ? params.presets
        .map((pr) => ({
          ...pr,
          slots: pr.slots.filter((sl) => exportedTrackIds.has(sl.trackId)),
        }))
        .filter((pr) => pr.slots.length > 0)
    : params.presets;

  const manifest = {
    version: 1,
    app: "kanso-audio",
    exportedAt,
    tracks: exportedTracks,
    folders: params.folders,
    playlists: exportedPlaylists,
    presets: exportedPresets,
    fileEntries,
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  return zip.generateAsync({
    type: "blob",
    compression: "STORE", // Audio files are mostly already compressed; fast & zero CPU stall
  });
}

export async function parseAudioBackupZip(
  file: File,
): Promise<ParsedAudioBackupArchive> {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error(
      "This archive does not contain a valid Kanso Audio manifest.json.",
    );
  }

  const rawText = await manifestFile.async("string");
  const parsed = JSON.parse(rawText) as {
    version?: number;
    app?: string;
    exportedAt?: number;
    tracks?: AudioTrackRecord[];
    folders?: AudioFolderRecord[];
    playlists?: AudioPlaylistRecord[];
    presets?: AudioMixPreset[];
    fileEntries?: Array<{
      trackId: string;
      archivePath: string;
      fileName: string;
      mimeType?: string;
    }>;
  };

  if (parsed.app && parsed.app !== "kanso-audio") {
    throw new Error("This ZIP archive belongs to another Kanso module.");
  }

  const files: AudioBackupFileEntry[] = [];
  const entries = Array.isArray(parsed.fileEntries) ? parsed.fileEntries : [];
  for (const entry of entries) {
    const zf = zip.file(entry.archivePath);
    if (!zf) continue;
    const data = await zf.async("arraybuffer");
    files.push({
      trackId: entry.trackId,
      fileName: entry.fileName,
      mimeType: entry.mimeType || "audio/mpeg",
      data,
    });
  }

  const exportedAt = parsed.exportedAt ?? Date.now();
  return {
    fileName: file.name,
    fileSize: file.size,
    exportedAt,
    snapshot: {
      version: parsed.version ?? 1,
      exportedAt,
      tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [],
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
      presets: Array.isArray(parsed.presets) ? parsed.presets : [],
      files,
    },
  };
}
