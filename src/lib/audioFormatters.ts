import type { FolderColor } from "../types/library";
import type { AudioEqPreset, AudioFormat, AudioTrackRecord } from "../types/audio";

export const AUDIO_ACCEPT_STRING =
  ".mp3,.m4a,.wav,.ogg,.flac,.opus,.aac,audio/*";

export const AUDIO_FORMAT_LABELS: Record<AudioFormat, string> = {
  mp3: "MP3",
  m4a: "M4A",
  wav: "WAV",
  ogg: "OGG",
  flac: "FLAC",
  opus: "OPUS",
  aac: "AAC",
};

export const AUDIO_EQ_PRESETS: Array<{
  id: AudioEqPreset;
  label: string;
  description: string;
  lowDb: number;
  midDb: number;
  highDb: number;
}> = [
  {
    id: "flat",
    label: "Flat",
    description: "Uncolored reference response",
    lowDb: 0,
    midDb: 0,
    highDb: 0,
  },
  {
    id: "bass-boost",
    label: "Bass Boost",
    description: "+6 dB warm low-end weight",
    lowDb: 6,
    midDb: -1,
    highDb: 1.5,
  },
  {
    id: "vocal",
    label: "Vocal / Podcast",
    description: "Clear speech presence & reduced rumble",
    lowDb: -3,
    midDb: 4.5,
    highDb: 2.5,
  },
  {
    id: "warm",
    label: "Warm Analog",
    description: "Softened highs for long sessions",
    lowDb: 3,
    midDb: 1,
    highDb: -3,
  },
  {
    id: "late-night",
    label: "Late Night",
    description: "Balanced low-volume listening",
    lowDb: 4,
    midDb: 2,
    highDb: -2,
  },
];

export function formatAudioDuration(seconds?: number | null): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function getAudioFolderIds(
  track: Pick<AudioTrackRecord, "folderIds" | "folderId">,
): string[] {
  if (Array.isArray(track.folderIds) && track.folderIds.length > 0) {
    return Array.from(new Set(track.folderIds.filter(Boolean)));
  }
  if (track.folderId) {
    return [track.folderId];
  }
  return [];
}

export function withAudioFolderIds(
  track: AudioTrackRecord,
  folderIds: string[],
): AudioTrackRecord {
  const unique = Array.from(new Set(folderIds.filter(Boolean)));
  return {
    ...track,
    folderIds: unique,
    folderId: unique[0] ?? null,
  };
}

export function sanitizeAudioFileBaseName(raw: string): string {
  return raw
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function getTrackBadgeTint(color?: FolderColor | null): string {
  switch (color) {
    case "terracotta":
      return "#B45309";
    case "sage":
      return "#3F7D58";
    case "ochre":
      return "#C68B2C";
    case "cobalt":
      return "#3B6998";
    case "plum":
      return "#7E4A88";
    case "rose":
      return "#B84A62";
    case "neutral":
      return "#78716C";
    case "slate":
    default:
      return "#64748B";
  }
}
