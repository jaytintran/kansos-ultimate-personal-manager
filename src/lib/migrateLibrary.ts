import type {
  BookFormat,
  BookRecord,
  BookmarkRecord,
  CategoryRecord,
  FolderColor,
  FolderRecord,
  HighlightRecord,
  ViewFolderRecord,
} from "../types/library";

interface LegacyBookBookmark {
  id: string;
  label: string;
  page?: number;
  chapterIndex?: number;
  scrollRatio?: number;
  createdAt?: string | number;
}

interface LegacyBookShape {
  id?: string;
  format?: string;
  fileName?: string;
  fileSize?: number;
  fileHash?: string;
  isBuiltInSample?: boolean;
  coverDataUrl?: string | null;
  coverPaletteIndex?: number;
  coverStyle?: BookRecord["coverStyle"];
  title?: string;
  subtitle?: string;
  author?: string;
  description?: string;
  publisher?: string;
  language?: string;
  series?: string;
  year?: string;
  status?: BookRecord["status"];
  isFavorite?: boolean;
  rating?: number;
  readingNotes?: string;
  shelves?: string[];
  categoryId?: string | null;
  folderId?: string | null;
  folderIds?: string[];
  tags?: string[];
  progress?: number;
  totalUnits?: number;
  totalPages?: number;
  currentPage?: number;
  currentChapterIndex?: number;
  scrollRatio?: number;
  currentLocation?: BookRecord["currentLocation"];
  bookmarks?: LegacyBookBookmark[];
  addedAt?: string | number;
  lastReadAt?: string | number | null;
  sortOrder?: number;
  storageMode?: BookRecord["storageMode"];
  externalUri?: string;
}

function toEpochMs(
  val: string | number | null | undefined,
  fallback: number,
): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim()) {
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function hashTitleToPalette(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) {
    h = (h * 31 + title.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 8;
}

const FOLDER_COLOR_CYCLE: FolderColor[] = [
  "terracotta",
  "sage",
  "cobalt",
  "ochre",
  "plum",
  "slate",
  "rose",
];

export interface NormalizedLibraryBundle {
  books: BookRecord[];
  libraryFolders: FolderRecord[];
  libraryCategories: CategoryRecord[];
  libraryViewFolders: ViewFolderRecord[];
  bookBookmarks: BookmarkRecord[];
  bookHighlights: HighlightRecord[];
}

export function normalizeLibraryWorkspaceData(raw: {
  books?: unknown[];
  libraryFolders?: FolderRecord[];
  libraryCategories?: CategoryRecord[];
  libraryViewFolders?: ViewFolderRecord[];
  bookBookmarks?: BookmarkRecord[];
  bookHighlights?: HighlightRecord[];
}): NormalizedLibraryBundle {
  const folders: FolderRecord[] = Array.isArray(raw.libraryFolders)
    ? raw.libraryFolders.map((f) => ({
        ...f,
        parentId: f.parentId ?? null,
        color: f.color ?? "neutral",
        createdAt: toEpochMs(f.createdAt, Date.now()),
      }))
    : [];

  const folderByName = new Map<string, FolderRecord>();
  for (const f of folders) {
    folderByName.set(f.name.trim().toLowerCase(), f);
  }

  const categories: CategoryRecord[] = Array.isArray(raw.libraryCategories)
    ? raw.libraryCategories.map((c) => ({
        ...c,
        createdAt: toEpochMs(c.createdAt, Date.now()),
      }))
    : [];

  const viewFolders: ViewFolderRecord[] = Array.isArray(raw.libraryViewFolders)
    ? raw.libraryViewFolders.map((vf) => ({
        ...vf,
        bookIds: Array.isArray(vf.bookIds) ? vf.bookIds : [],
        createdAt: toEpochMs(vf.createdAt, Date.now()),
      }))
    : [];

  const bookmarks: BookmarkRecord[] = Array.isArray(raw.bookBookmarks)
    ? raw.bookBookmarks.map((bm) => ({
        ...bm,
        createdAt: toEpochMs(bm.createdAt, Date.now()),
      }))
    : [];
  const bookmarkIdSet = new Set(bookmarks.map((b) => b.id));

  const highlights: HighlightRecord[] = Array.isArray(raw.bookHighlights)
    ? raw.bookHighlights.map((hl) => ({
        ...hl,
        createdAt: toEpochMs(hl.createdAt, Date.now()),
      }))
    : [];

  const rawBooks = Array.isArray(raw.books)
    ? (raw.books as LegacyBookShape[])
    : [];
  const now = Date.now();

  const books: BookRecord[] = rawBooks.map((item, idx) => {
    const format: BookFormat =
      item.format === "pdf" || item.format === "mobi" ? item.format : "epub";
    const id = item.id || `book-${now}-${idx}`;
    const title = (item.title || "Untitled Book").trim();

    // Migrate legacy shelves[] into real FolderRecords if book has no folderIds yet
    let folderIds: string[] = Array.isArray(item.folderIds)
      ? item.folderIds.filter(Boolean)
      : item.folderId
        ? [item.folderId]
        : [];
    let isFavorite = Boolean(item.isFavorite);

    if (
      folderIds.length === 0 &&
      Array.isArray(item.shelves) &&
      item.shelves.length > 0
    ) {
      const migratedIds: string[] = [];
      for (const shelfRaw of item.shelves) {
        const shelfName = shelfRaw.trim();
        if (!shelfName) continue;
        if (shelfName.toLowerCase() === "favorites") {
          isFavorite = true;
          continue;
        }
        const key = shelfName.toLowerCase();
        let existing = folderByName.get(key);
        if (!existing) {
          existing = {
            id: `fld-${key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || idx}`,
            name: shelfName,
            parentId: null,
            color:
              FOLDER_COLOR_CYCLE[folders.length % FOLDER_COLOR_CYCLE.length],
            createdAt: now,
          };
          folders.push(existing);
          folderByName.set(key, existing);
        }
        migratedIds.push(existing.id);
      }
      folderIds = Array.from(new Set(migratedIds));
    }

    // Migrate legacy inline bookmarks[] into normalized BookmarkRecords
    if (Array.isArray(item.bookmarks) && item.bookmarks.length > 0) {
      for (const legacyBm of item.bookmarks) {
        if (!legacyBm?.id || bookmarkIdSet.has(legacyBm.id)) continue;
        bookmarkIdSet.add(legacyBm.id);
        bookmarks.push({
          id: legacyBm.id,
          bookId: id,
          unitIndex:
            format === "pdf"
              ? Math.max(1, legacyBm.page ?? 1)
              : Math.max(0, legacyBm.chapterIndex ?? 0),
          scrollRatio: legacyBm.scrollRatio ?? 0,
          label:
            legacyBm.label ||
            (format === "pdf" ? `Page ${legacyBm.page ?? 1}` : "Bookmark"),
          createdAt: toEpochMs(legacyBm.createdAt, now),
        });
      }
    }

    const totalUnits = Math.max(1, item.totalUnits ?? item.totalPages ?? 1);
    const currentLocation =
      item.currentLocation ??
      (format === "pdf"
        ? {
            unitIndex: Math.max(1, item.currentPage ?? 1),
            scrollRatio: item.scrollRatio ?? 0,
            label: `Page ${Math.max(1, item.currentPage ?? 1)}`,
          }
        : {
            unitIndex: Math.max(0, item.currentChapterIndex ?? 0),
            scrollRatio: item.scrollRatio ?? 0,
          });

    return {
      id,
      format,
      fileName: item.fileName || `${title}.${format}`,
      fileSize: typeof item.fileSize === "number" ? item.fileSize : 0,
      fileHash: item.fileHash,
      isBuiltInSample: item.isBuiltInSample,
      title,
      subtitle: item.subtitle || undefined,
      author: (item.author || "Unknown Author").trim(),
      description: item.description || undefined,
      publisher: item.publisher || undefined,
      language: item.language || undefined,
      series: item.series || undefined,
      year: item.year || undefined,
      status:
        item.status === "reading" || item.status === "finished"
          ? item.status
          : "unread",
      isFavorite,
      rating: typeof item.rating === "number" ? item.rating : undefined,
      readingNotes: item.readingNotes || undefined,
      categoryId: item.categoryId ?? null,
      folderId: folderIds[0] ?? null,
      folderIds,
      tags: Array.isArray(item.tags) ? item.tags.filter(Boolean) : [],
      coverDataUrl: item.coverDataUrl ?? null,
      coverPaletteIndex:
        typeof item.coverPaletteIndex === "number"
          ? item.coverPaletteIndex
          : hashTitleToPalette(title),
      coverStyle: item.coverStyle ?? "editorial",
      progress:
        typeof item.progress === "number"
          ? Math.max(0, Math.min(100, Math.round(item.progress)))
          : 0,
      totalUnits,
      currentLocation,
      addedAt: toEpochMs(item.addedAt, now),
      lastReadAt:
        item.lastReadAt === null || item.lastReadAt === undefined
          ? null
          : toEpochMs(item.lastReadAt, now),
      sortOrder:
        typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)
          ? item.sortOrder
          : undefined,
      ...(item.storageMode === "android-uri" || item.storageMode === "indexeddb"
        ? { storageMode: item.storageMode }
        : {}),
      ...(typeof item.externalUri === "string" && item.externalUri.trim()
        ? { externalUri: item.externalUri.trim() }
        : {}),
    };
  });

  return {
    books,
    libraryFolders: folders,
    libraryCategories: categories,
    libraryViewFolders: viewFolders,
    bookBookmarks: bookmarks,
    bookHighlights: highlights,
  };
}
