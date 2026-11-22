import type { CoverStyle, FolderColor, SortDirection } from "./library";

export type AudioFormat =
  | "mp3"
  | "m4a"
  | "wav"
  | "ogg"
  | "flac"
  | "opus"
  | "aac";

export type AudioStorageMode = "indexeddb" | "android-uri";

export type AudioEqPreset =
  | "flat"
  | "bass-boost"
  | "vocal"
  | "warm"
  | "late-night";

export type AudioRepeatMode = "off" | "all" | "one";

export type AudioScrubberStyle =
  | "rail"
  | "youtube"
  | "bars"
  | "mirrored"
  | "ribbon"
  | "blocks"
  | "groove";

export type AudioCoverSize = "compact" | "standard" | "large";

export type AudioSmartView =
  | "all"
  | "mixing"
  | "favorites"
  | "recent"
  | "unplayed";

export type AudioSidebarSectionKey =
  | "views"
  | "folders"
  | "playlists"
  | "presets"
  | "tags";

export type AudioSortField =
  | "custom"
  | "lastPlayedAt"
  | "addedAt"
  | "title"
  | "artist"
  | "duration"
  | "playCount"
  | "fileSize"
  | "format";

export type AudioGroupByField =
  | "none"
  | "artist"
  | "album"
  | "format"
  | "folder";

export interface AudioCardDetailOptions {
  artist: boolean;
  album: boolean;
  format: boolean;
  duration: boolean;
  playCount: boolean;
  tags: boolean;
  resumeBar: boolean;
}

export interface AudioTrackRecord {
  id: string;
  format: AudioFormat;
  mimeType: string;
  fileName: string;
  fileSize: number;
  fileHash?: string;
  title: string;
  artist: string;
  album?: string;
  trackNumber?: number | null;
  year?: string;
  genre?: string;
  notes?: string;
  durationSeconds: number;
  /** Exact saved playback position in seconds, persisted across sessions for every track. */
  currentPositionSeconds: number;
  /** Compact normalized amplitude peaks (0..1) for deterministic waveform rendering. */
  waveformPeaks?: number[];
  isFavorite?: boolean;
  playCount: number;
  lastPlayedAt: number | null;
  addedAt: number;
  folderId?: string | null;
  folderIds?: string[];
  tags: string[];
  coverDataUrl: string | null;
  coverPaletteIndex: number;
  coverStyle?: CoverStyle;
  sortOrder?: number;
  /** Device-local storage backend ('indexeddb' by default; 'android-uri' for SAF-linked Android files). */
  storageMode?: AudioStorageMode;
  /** Device-local Android SAF content:// URI when storageMode === 'android-uri'. */
  externalUri?: string;
}

export interface AudioFolderRecord {
  id: string;
  name: string;
  parentId: string | null;
  color: FolderColor;
  createdAt: number;
}

export interface AudioPlaylistRecord {
  id: string;
  name: string;
  description?: string;
  color?: FolderColor;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface AudioMixSlot {
  slotId: string;
  trackId: string;
  volume: number; // 0..100
  muted: boolean;
  solo?: boolean;
  loop: boolean;
  playbackRate: number; // 0.5..3.0
  abLoopStart?: number | null;
  abLoopEnd?: number | null;
}

export interface AudioMixPreset {
  id: string;
  name: string;
  category?: string;
  masterVolume: number;
  eqPreset: AudioEqPreset;
  slots: AudioMixSlot[];
  createdAt: number;
}

export interface AudioStudioState {
  activeSlots: AudioMixSlot[];
  primaryTrackId: string | null;
  queueTrackIds: string[];
  masterVolume: number;
  eqPreset: AudioEqPreset;
  shuffle: boolean;
  repeatMode: AudioRepeatMode;
  activePresetId: string | null;
  mixerExpanded: boolean;
}

export interface AudioImportMetadataResult {
  format: AudioFormat;
  mimeType: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  title: string;
  artist: string;
  album: string;
  trackNumber: number | null;
  year: string;
  genre: string;
  durationSeconds: number;
  waveformPeaks: number[];
  coverDataUrl: string | null;
}

export type AudioSortDirection = SortDirection;
