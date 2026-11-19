export type ViewId =
  | 'focus'
  | 'timeline'
  | 'habits'
  | 'notes'
  | 'events'
  | 'lists'
  | 'library'
  | 'streamer';

export type ThemeId = 'paper' | 'neon' | 'cyberpunk' | 'nordic' | 'emerald';
export type ColorMode = 'light' | 'dark';

export type EntryType = 'log' | 'task' | 'event' | 'note' | 'timeblock';
export type FocusBucket = 'anchor' | 'x-active' | 'completed' | null;

export interface Entry {
  id: string;
  type: EntryType;
  title: string;
  content: string; // Tiptap HTML / markdown-compatible rich text
  createdAt: string; // ISO string
  scheduledAt: string | null; // ISO string
  completedAt: string | null; // ISO string
  endAt: string | null; // ISO string (for timeblocks / events)
  completed: boolean;
  focusBucket: FocusBucket;
  tags: string[];
  pinned?: boolean;
  location?: string;
  sourceEntryId?: string | null;
}

export type HabitFrequencyType = 'daily' | 'weekdays' | 'custom' | 'weekly';

export interface Habit {
  id: string;
  title: string;
  icon: string; // Lucide icon name key
  color: string; // Hex accent color
  frequencyType: HabitFrequencyType;
  customDays?: number[]; // 0 = Sun .. 6 = Sat
  weeklyTarget?: number; // 1..7
  createdAt: string;
  completions: Record<string, boolean>; // YYYY-MM-DD -> true
}

export type ListItemStatus = 'inbox' | 'processing' | 'done' | 'maybe-later' | 'dropped';

export interface ListCollection {
  id: string;
  title: string;
  icon: string;
  createdAt: string;
}

export interface ListItem {
  id: string;
  listId: string;
  title: string;
  status: ListItemStatus;
  content: string; // Tiptap rich markdown content
  url?: string;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ==========================================================================
// Library (Offline EPUB, PDF & MOBI Manager + Studio Reader)
// ==========================================================================

import type {
  BookFormat as LibraryBookFormat,
  BookRecord as LibraryBookRecord,
  BookmarkRecord as LibraryBookmarkRecord,
  CategoryRecord as LibraryCategoryRecord,
  FolderRecord as LibraryFolderRecord,
  HighlightRecord as LibraryHighlightRecord,
  ReadingStatus as LibraryReadingStatus,
  ViewFolderRecord as LibraryViewFolderRecord,
} from './types/library';

export type BookFormat = LibraryBookFormat;
export type BookReadingStatus = LibraryReadingStatus;
export type BookRecord = LibraryBookRecord;
export type BookBookmark = LibraryBookmarkRecord;
export type LibraryFolder = LibraryFolderRecord;
export type LibraryCategory = LibraryCategoryRecord;
export type LibraryViewFolder = LibraryViewFolderRecord;
export type BookHighlight = LibraryHighlightRecord;

export interface EpubReaderPrefs {
  fontSize: number; // 14..26
  fontFamily: 'serif' | 'sans' | 'mono';
  lineHeight: number; // 1.4..2.0
}

// ==========================================================================
// Streamer (Multi-YouTube Grid + Saved URLs Manager + Presets)
// ==========================================================================

export type StreamLayoutMode = 'auto' | '1x1' | '2x2' | '3x3' | '4x4' | 'custom' | 'spotlight';

export interface StreamFolder {
  id: string;
  name: string;
  parentId: string | null;
  description?: string;
  createdAt: string;
}

export interface StreamItem {
  id: string;
  url: string;
  videoId: string;
  title: string;
  channel: string;
  customLabel: string;
  thumbnailUrl: string;
  category: string;
  tags: string[];
  favorite: boolean;
  notes: string;
  affirmations?: string;
  folderIds?: string[];
  rating?: number; // 0..5
  listenCount?: number;
  lastListenedAt?: string | null;
  addedAt: string;
}

export interface StreamPreset {
  id: string;
  name: string;
  layoutMode: StreamLayoutMode;
  customRows: number;
  customCols: number;
  streamIds: string[];
  spotlightStreamId: string | null;
  createdAt: string;
}

export interface StreamerState {
  activeStreamIds: string[];
  layoutMode: StreamLayoutMode;
  customRows: number;
  customCols: number;
  spotlightStreamId: string | null;
  activePresetId: string | null;
}

// ==========================================================================
// Workspace Settings, Gist Sync & Envelope
// ==========================================================================

export interface WorkspaceSettings {
  theme: ThemeId;
  colorMode: ColorMode;
  xActiveLimit: number;
  timeFormat: '12h' | '24h';
  epubPrefs?: EpubReaderPrefs;
}

export interface GistSyncConfig {
  token: string;
  gistId: string;
  filename: string;
  lastSyncedAt: string | null;
  lastDirection: 'push' | 'pull' | null;
}

export interface KansoWorkspace {
  version: number;
  updatedAt: string;
  entries: Entry[];
  habits: Habit[];
  lists: ListCollection[];
  listItems: ListItem[];
  books: BookRecord[];
  libraryFolders?: LibraryFolder[];
  libraryCategories?: LibraryCategory[];
  libraryViewFolders?: LibraryViewFolder[];
  bookBookmarks?: BookBookmark[];
  bookHighlights?: BookHighlight[];
  streams: StreamItem[];
  streamFolders?: StreamFolder[];
  streamPresets: StreamPreset[];
  streamerState: StreamerState;
  settings: WorkspaceSettings;
}

export interface ToastMessage {
  id: string;
  text: string;
  tone?: 'neutral' | 'success' | 'error';
}
