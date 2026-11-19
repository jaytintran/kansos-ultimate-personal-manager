export type BookFormat = 'epub' | 'pdf' | 'mobi';

export type ReadingStatus = 'unread' | 'reading' | 'finished';

export type CoverStyle = 'editorial' | 'minimal' | 'framed' | 'swiss';

export type CoverSize = 'compact' | 'standard' | 'large';

export type ThemeMode = 'sepia' | 'dark' | 'kanso';

export type FolderColor =
  | 'neutral'
  | 'slate'
  | 'terracotta'
  | 'sage'
  | 'ochre'
  | 'cobalt'
  | 'plum'
  | 'rose';

export type HighlightColor = 'amber' | 'sage' | 'sky' | 'rose';

export type SmartView =
  | 'all'
  | 'reading'
  | 'unread'
  | 'finished'
  | 'favorites'
  | 'highlights';

export type SidebarSectionKey = 'library' | 'folders' | 'categories' | 'tags';

export type SortField =
  | 'recent'
  | 'lastReadAt'
  | 'addedAt'
  | 'title'
  | 'author'
  | 'progress'
  | 'fileSize'
  | 'format'
  | 'year';

export type SortDirection = 'asc' | 'desc';

export type GroupByField = 'none' | 'status' | 'format' | 'author' | 'category' | 'series';

export type ViewFolderDisplayMode = 'card' | 'carousel';

export type ViewFolderCardLayout = 'stacked' | 'auto' | '2x2' | '3x3' | '4x4';

export interface CardDetailOptions {
  subtitle: boolean;
  author: boolean;
  format: boolean;
  category: boolean;
  progress: boolean;
  tags: boolean;
}

export interface BookLocation {
  unitIndex: number; // 0-based chapter index for EPUB/MOBI, 1-based page for PDF
  scrollRatio: number; // 0..1
  label?: string;
}

export interface BookRecord {
  id: string;
  format: BookFormat;
  fileName: string;
  fileSize: number;
  fileHash?: string;
  isBuiltInSample?: boolean;
  title: string;
  subtitle?: string;
  author: string;
  description?: string;
  publisher?: string;
  language?: string;
  series?: string;
  year?: string;
  status: ReadingStatus;
  isFavorite?: boolean;
  rating?: number; // 0..5 (preserved from Kanso)
  readingNotes?: string; // Tiptap HTML (preserved from Kanso)
  shelves?: string[]; // Legacy Kanso shelves (auto-migrated to folders when needed)
  categoryId?: string | null;
  folderId?: string | null;
  folderIds?: string[];
  tags: string[];
  coverDataUrl: string | null;
  coverPaletteIndex: number;
  coverStyle?: CoverStyle;
  progress: number; // 0..100
  totalUnits: number; // chapter count or PDF pages
  currentLocation?: BookLocation | null;
  addedAt: number; // epoch ms
  lastReadAt: number | null; // epoch ms
}

export interface FolderRecord {
  id: string;
  name: string;
  parentId: string | null;
  color: FolderColor;
  createdAt: number;
}

export interface CategoryRecord {
  id: string;
  name: string;
  createdAt: number;
}

export interface ViewFolderRecord {
  id: string;
  viewKey: string; // e.g. 'smart:all', 'folder:abc', 'category:xyz'
  name: string;
  bookIds: string[];
  createdAt: number;
}

export interface BookmarkRecord {
  id: string;
  bookId: string;
  unitIndex: number;
  scrollRatio: number;
  label: string;
  excerpt?: string;
  createdAt: number;
}

export interface HighlightRecord {
  id: string;
  bookId: string;
  unitIndex: number;
  selectedText: string;
  prefixContext: string;
  suffixContext: string;
  color: HighlightColor;
  note: string;
  createdAt: number;
}

export interface ParsedChapter {
  index: number;
  id: string;
  href: string;
  title: string;
  html: string;
}

export interface ParsedTocItem {
  id: string;
  title: string;
  unitIndex: number;
  anchorId?: string;
  depth: number;
}

export interface ParsedReflowableBook {
  title: string;
  author: string;
  chapters: ParsedChapter[];
  toc: ParsedTocItem[];
  cleanupUrls: string[];
}

export interface SearchMatch {
  id: string;
  unitIndex: number;
  unitLabel: string;
  occurrenceInUnit: number;
  snippetBefore: string;
  matchText: string;
  snippetAfter: string;
}

export type ReaderFontFamily =
  | 'source-serif'
  | 'literata'
  | 'georgia'
  | 'palatino'
  | 'dm-sans'
  | 'inter'
  | 'system-sans'
  | 'mono'
  | 'serif'
  | 'sans';

export type ReaderContrastPreset = 'soft' | 'balanced' | 'crisp';

export type ReaderFontWeight = 300 | 400 | 500 | 600;

export type PdfViewMode = 'original' | 'reflow';

export interface ReaderPreferences {
  theme: ThemeMode;
  fontFamily: ReaderFontFamily;
  fontSize: number; // 14..28
  fontWeight: ReaderFontWeight; // 300 | 400 | 500 | 600
  wordSpacing: number; // -0.04..0.36 em
  letterSpacing: number; // -0.02..0.12 em
  lineHeight: number; // 1.25..2.3
  paragraphSpacing: number; // 0.2..2.2 em
  textIndent: number; // 0..2.2 em
  textAlign: 'left' | 'justify';
  pageMargins: number; // 16..96 px horizontal padding
  pageWidth: number; // 540..960px
  contrastPreset: ReaderContrastPreset;
  brightness: number; // 75..115 (%)
  readingLayout: 'scroll' | 'page' | 'spread';
  pdfViewMode: PdfViewMode;
  pdfLayout: 'continuous' | 'single';
  pdfFitMode: 'width' | 'manual';
  pdfZoom: number; // 0.6..2.2
  pdfThemeTone: boolean;
  pinHeader: boolean;
  pinBottomBar: boolean;
  pinLeftSidebar: boolean;
}

export type NarratorTone = 'warm' | 'crisp' | 'calm';

export type SleepTimerMode = 'off' | '15m' | '30m' | '45m' | 'chapter';

export interface BookVoiceOverride {
  deviceVoiceUri: string;
  tone: NarratorTone;
  rate: number; // 0.7..2.5
}

export interface ImportMetadataResult {
  format: BookFormat;
  fileName: string;
  fileSize: number;
  fileHash: string;
  title: string;
  subtitle: string;
  author: string;
  description: string;
  publisher: string;
  language: string;
  year: string;
  totalUnits: number;
  coverDataUrl: string | null;
}
