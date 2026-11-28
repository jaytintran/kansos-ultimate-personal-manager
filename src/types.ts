export type ViewId =
  | "focus"
  | "timeline"
  | "habits"
  | "achievements"
  | "notes"
  | "events"
  | "lists"
  | "library"
  | "streamer"
  | "audio"
  | "contacts"
  | "finance"
  | "languages";

export type ThemeId = "paper" | "neon" | "cyberpunk" | "nordic" | "emerald";
export type ColorMode = "light" | "dark";
export type TimelineDisplayMode = "default" | "compact" | "flat";

export type EntryType = "log" | "task" | "event" | "note" | "timeblock";
export type FocusBucket = "anchor" | "x-active" | "completed" | null;
export type EntrySource =
  | "timeline"
  | "focus-anchor"
  | "focus-active"
  | "custom-tab"
  | "habit"
  | "achievement";

export type EventCategory = "official" | "personal";
export type EventAttendance = "attended" | "missed" | "universal" | null;

export type NoteStatus =
  | "inbox"
  | "draft"
  | "active"
  | "evergreen"
  | "archived";
export type NoteEditorWidth = "normal" | "full";
export type NoteEditorFont = "sans" | "serif" | "mono";

export interface NoteNotebook {
  id: string;
  name: string;
  icon: string;
  createdAt: string;
}

export interface BookNoteLink {
  bookId: string | null;
  bookTitle: string;
  bookAuthor?: string;
  bookFormat?: LibraryBookFormat;
  unitIndex: number; // 0-based chapter/spine index for EPUB/MOBI, 1-based page number for PDF
  scrollRatio: number; // 0..1 within chapter/page
  locationLabel: string; // e.g., "Page 42" or "Chapter 3 · p. 18"
  quote?: string;
  bookRemoved?: boolean;
}

export interface BookJumpRequest {
  bookId: string;
  unitIndex: number;
  scrollRatio: number;
  nonce: number;
}

export interface ListItemNoteLink {
  listItemId: string | null;
  itemTitle: string;
  listId?: string;
  listTitle?: string;
  listColor?: string;
  quote?: string;
  itemRemoved?: boolean;
}

export interface NoteJumpRequest {
  noteId: string;
  nonce: number;
}

export interface ListItemJumpRequest {
  listItemId: string;
  nonce: number;
}

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
  source?: EntrySource;
  tabId?: string | null;
  tags: string[];
  pinned?: boolean;
  paletteIndex?: number | null;
  sortOrder?: number;
  location?: string;
  isAchievement?: boolean;
  eventCategory?: EventCategory;
  attendance?: EventAttendance;
  listIds?: string[];
  habitId?: string | null;
  habitDateKey?: string | null;
  sourceEntryId?: string | null;
  // Optional legacy/note fields preserved for backward compatibility
  parentId?: string | null;
  notebookId?: string | null;
  icon?: string;
  coverPreset?: string | null;
  noteStatus?: NoteStatus;
  favorite?: boolean;
  archived?: boolean;
  syncToTimeline?: boolean;
  editorWidth?: NoteEditorWidth;
  editorFont?: NoteEditorFont;
  bookLink?: BookNoteLink | null;
  listItemLinks?: ListItemNoteLink[];
  updatedAt?: string;
}

export interface ScratchpadCard {
  id: string;
  content: string;
  paletteIndex: number; // 0..4
  pinned: boolean;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomFocusTab {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export type HabitFrequencyType =
  | "daily"
  | "weekdays"
  | "bi-weekly"
  | "weekly"
  | "monthly"
  | "custom";

export interface Habit {
  id: string;
  title: string;
  purpose?: string;
  icon: string; // Lucide icon name key
  color: string; // Hex accent color
  frequencyType: HabitFrequencyType;
  customDays?: number[]; // 0 = Sun .. 6 = Sat
  weeklyTarget?: number; // 1..7
  createdAt: string;
  updatedAt?: string;
  completions: Record<string, boolean>; // YYYY-MM-DD -> true
  missedDates?: Record<string, boolean>; // YYYY-MM-DD -> true
}

export interface HabitLog {
  id: string;
  habitId: string;
  dateKey: string;
  entryId: string;
  createdAt: string;
  updatedAt: string;
}

export type ListItemStatus =
  | "inbox"
  | "processing"
  | "done"
  | "maybe-later"
  | "dropped";
export type ListCollectionType = "projects" | "books" | "courses" | "custom";

export interface ListCollection {
  id: string;
  title: string;
  icon: string;
  color?: string;
  listType?: ListCollectionType;
  parentId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ListItem {
  id: string;
  listId: string;
  title: string;
  subtitle?: string;
  status: ListItemStatus;
  tags?: string[];
  content: string; // Tiptap rich markdown content
  url?: string;
  coverUrl?: string;
  scheduledAt: string | null;
  completedAt?: string | null;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

// ==========================================================================
// Shared UI Target Types (Polymorphic DetailSheet & Universal Context Menu)
// ==========================================================================

export type DetailSheetMode =
  | "note"
  | "event"
  | "task"
  | "log"
  | "habit"
  | "list_item";

export interface DetailSheetTarget {
  mode: DetailSheetMode;
  id?: string;
  draft?: Partial<Entry> & Partial<Habit> & Partial<ListItem>;
}

export type ContextMenuRecord =
  | { kind: "entry"; entry: Entry }
  | { kind: "list_item"; item: ListItem };

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
} from "./types/library";

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
  fontFamily: "serif" | "sans" | "mono";
  lineHeight: number; // 1.4..2.0
}

// ==========================================================================
// Audio (Offline Multi-Track Mixer + Local Audio Shelf)
// ==========================================================================

import type {
  AudioEqPreset,
  AudioFolderRecord,
  AudioFormat,
  AudioMixPreset,
  AudioMixSlot,
  AudioPlaylistRecord,
  AudioRepeatMode,
  AudioStorageMode,
  AudioStudioState,
  AudioTrackRecord,
} from "./types/audio";

export type {
  AudioEqPreset,
  AudioFolderRecord,
  AudioFormat,
  AudioMixPreset,
  AudioMixSlot,
  AudioPlaylistRecord,
  AudioRepeatMode,
  AudioStorageMode,
  AudioStudioState,
  AudioTrackRecord,
};

// ==========================================================================
// Streamer (Multi-YouTube Grid + Saved URLs Manager + Presets)
// ==========================================================================

export type StreamLayoutMode =
  | "auto"
  | "1"
  | "2"
  | "1x1"
  | "2x2"
  | "3x2"
  | "3x3"
  | "4x4"
  | "5x5"
  | "6x6"
  | "7x7"
  | "8x8"
  | "custom"
  | "spotlight";

export type StreamViewMode = "grid" | "mixer" | "tiles";
export type StreamSizingMode = "fit" | "canvas";

export interface StackSlot {
  slotId: string;
  streamId: string;
  volume: number; // 0..100
  muted: boolean;
  loopMode: "infinite" | "count";
  loopCount: number; // finite loop target >= 1
  playbackRate?: number; // 0.25..2
}

export interface StreamFolder {
  id: string;
  name: string;
  parentId: string | null;
  icon?: string;
  description?: string;
  createdAt: string;
}

export interface StreamChannelMeta {
  pinned?: boolean;
  icon?: string;
  color?: string;
  defaultTopic?: string;
  sortOrder?: number;
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
  sortOrder?: number;
  addedAt: string;
}

export interface StreamPreset {
  id: string;
  name: string;
  category?: string;
  layoutMode: StreamLayoutMode;
  customRows: number;
  customCols: number;
  viewMode?: StreamViewMode;
  sizingMode?: StreamSizingMode;
  masterVolume?: number;
  streamIds: string[];
  slots?: StackSlot[];
  spotlightStreamId: string | null;
  pinned?: boolean;
  sortOrder?: number;
  createdAt: string;
}

export interface StreamerState {
  activeStreamIds: string[];
  activeSlots?: StackSlot[];
  layoutMode: StreamLayoutMode;
  viewMode?: StreamViewMode;
  sizingMode?: StreamSizingMode;
  masterVolume?: number;
  sidebarOpen?: boolean;
  customRows: number;
  customCols: number;
  spotlightStreamId: string | null;
  activePresetId: string | null;
}

// ==========================================================================
// Workspace Settings, Gist Sync & Envelope
// ==========================================================================

export interface WorkspaceNavigationSettings {
  hiddenViews?: ViewId[];
  desktopGroups?: ViewId[][];
  mobilePrimary?: ViewId[];
  mobileMore?: ViewId[];
  mobilePrimarySlots?: number;
}

export type AppFontId =
  | "dm-sans"
  | "plus-jakarta-sans"
  | "inter"
  | "manrope"
  | "ibm-plex-sans"
  | "public-sans"
  | "nunito-sans"
  | "source-serif-4"
  | "system";

export type DisplayFontId =
  | "match"
  | "plus-jakarta-sans"
  | "bricolage-grotesque"
  | "outfit"
  | "manrope"
  | "dm-sans"
  | "inter"
  | "newsreader"
  | "source-serif-4"
  | "literata"
  | "system";

export type NotesFontId =
  | "match"
  | "source-serif-4"
  | "literata"
  | "newsreader"
  | "lora"
  | "dm-sans"
  | "inter"
  | "manrope"
  | "ibm-plex-sans"
  | "jetbrains-mono"
  | "system";

export type MonoFontId =
  | "jetbrains-mono"
  | "ibm-plex-mono"
  | "fira-code"
  | "source-code-pro"
  | "space-mono"
  | "system-mono";

export interface WorkspaceSettings {
  theme: ThemeId;
  colorMode: ColorMode;
  xActiveLimit: number;
  timeFormat: "12h" | "24h";
  timelineDisplayMode?: TimelineDisplayMode;
  defaultView?: ViewId;
  showNavCounts?: boolean;
  defaultTimelineType?: EntryType;
  defaultNoteTimelineSync?: boolean;
  epubPrefs?: EpubReaderPrefs;
  navigation?: WorkspaceNavigationSettings;
  fontBody?: AppFontId;
  fontDisplay?: DisplayFontId;
  fontNotes?: NotesFontId;
  fontMono?: MonoFontId;
}

export type AutoPushIndicatorStyle =
  | "push-button"
  | "sidebar-line"
  | "floating-card"
  | "toast";

export type AutoPullIndicatorStyle =
  | "pull-button"
  | "sidebar-line"
  | "floating-card"
  | "toast";

export type AutoPullCheckMode =
  | "boot-only"
  | "resume-cooldown"
  | "resume-always";

export interface GistSyncConfig {
  token: string;
  gistId: string;
  filename: string;
  lastSyncedAt: string | null;
  lastRemoteUpdatedAt?: string | null;
  lastDirection: "push" | "pull" | "full" | null;
  autoPushEnabled?: boolean;
  autoPushDelaySeconds?: number;
  autoPushIndicatorEnabled?: boolean;
  autoPushIndicatorStyle?: AutoPushIndicatorStyle;
  autoPullEnabled?: boolean;
  autoPullCheckMode?: AutoPullCheckMode;
  autoPullCooldownSeconds?: number;
  autoPullIndicatorEnabled?: boolean;
  autoPullIndicatorStyle?: AutoPullIndicatorStyle;
}

// ==========================================================================
// Contacts (Personal CRM) & Finance (Standalone Personal Financial Tracker)
// ==========================================================================

import type {
  ContactAddress,
  ContactCircle,
  ContactClosenessTier,
  ContactCustomField,
  ContactLabeledValue,
  ContactRecord,
  ContactRelationshipLink,
} from "./types/contacts";

import type {
  FinanceAccount,
  FinanceAccountType,
  FinanceBillingCycle,
  FinanceCategory,
  FinanceCategoryKind,
  FinanceCurrency,
  FinanceSettings,
  FinanceSubscription,
  FinanceTransaction,
  FinanceTransactionType,
} from "./types/finance";

import type {
  LanguageCefrLevel,
  LanguageDailyStat,
  LanguageDeck,
  LanguageExample,
  LanguageItem,
  LanguageItemType,
  LanguageMasteryStage,
  LanguagePreset,
  LanguageProfile,
  LanguageRegister,
  LanguageSrsRating,
  LanguageSrsState,
} from "./types/languages";

export type {
  ContactAddress,
  ContactCircle,
  ContactClosenessTier,
  ContactCustomField,
  ContactLabeledValue,
  ContactRecord,
  ContactRelationshipLink,
  FinanceAccount,
  FinanceAccountType,
  FinanceBillingCycle,
  FinanceCategory,
  FinanceCategoryKind,
  FinanceCurrency,
  FinanceSettings,
  FinanceSubscription,
  FinanceTransaction,
  FinanceTransactionType,
  LanguageCefrLevel,
  LanguageDailyStat,
  LanguageDeck,
  LanguageExample,
  LanguageItem,
  LanguageItemType,
  LanguageMasteryStage,
  LanguagePreset,
  LanguageProfile,
  LanguageRegister,
  LanguageSrsRating,
  LanguageSrsState,
};

export interface KansoWorkspace {
  version: number;
  updatedAt: string;
  entries: Entry[];
  scratchpads?: ScratchpadCard[];
  customTabs?: CustomFocusTab[];
  noteNotebooks?: NoteNotebook[];
  habits: Habit[];
  habitLogs?: HabitLog[];
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
  streamTopicIcons?: Record<string, string>;
  streamChannels?: Record<string, StreamChannelMeta>;
  streamPresets: StreamPreset[];
  streamerState: StreamerState;
  audioTracks?: AudioTrackRecord[];
  audioFolders?: AudioFolderRecord[];
  audioPlaylists?: AudioPlaylistRecord[];
  audioMixPresets?: AudioMixPreset[];
  audioState?: AudioStudioState;
  contacts?: ContactRecord[];
  contactCircles?: ContactCircle[];
  financeAccounts?: FinanceAccount[];
  financeCategories?: FinanceCategory[];
  financeTransactions?: FinanceTransaction[];
  financeSubscriptions?: FinanceSubscription[];
  financeSettings?: FinanceSettings;
  languages?: LanguageProfile[];
  languageDecks?: LanguageDeck[];
  languageItems?: LanguageItem[];
  languageDailyStats?: LanguageDailyStat[];
  languageActiveId?: string | null;
  settings: WorkspaceSettings;
  viewPreferences?: Record<string, string>;
}

export interface ToastMessage {
  id: string;
  text: string;
  tone?: "neutral" | "success" | "error";
}
