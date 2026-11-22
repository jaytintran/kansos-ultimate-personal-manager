import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUpNarrowWide,
  CheckSquare,
  ChevronDown,
  Command,
  FileText,
  FolderOpen,
  FolderPlus,
  GripVertical,
  LayoutGrid,
  List,
  PanelRight,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AndroidFolderManagerModal } from "../components/library/AndroidFolderManagerModal";
import { AndroidImportChoiceModal } from "../components/library/AndroidImportChoiceModal";
import { AddBooksToFolderModal } from "../components/library/AddBooksToFolderModal";
import {
  BookContextMenu,
  type BookContextMenuState,
} from "../components/library/BookContextMenu";
import { BookGrid } from "../components/library/BookGrid";
import { BookInspector } from "../components/library/BookInspector";
import { BookTable } from "../components/library/BookTable";
import { BulkActionBar } from "../components/library/BulkActionBar";
import {
  BulkEditModal,
  type BulkEditPatch,
} from "../components/library/BulkEditModal";
import { CommandPalette } from "../components/library/CommandPalette";
import { ConfirmDeleteModal } from "../components/library/ConfirmDeleteModal";
import { ContinueReadingShelf } from "../components/library/ContinueReadingShelf";
import {
  DuplicateImportModal,
  type DuplicateResolutionAction,
  type PendingDuplicateItem,
} from "../components/library/DuplicateImportModal";
import { EmptyLibraryDropzone } from "../components/library/EmptyLibraryDropzone";
import { FloatingFolderDropDock } from "../components/library/FloatingFolderDropDock";
import {
  FolderDropActionModal,
  type PendingFolderDrop,
} from "../components/library/FolderDropActionModal";
import { HighlightsHubView } from "../components/library/HighlightsHubView";
import { ImportBackupModal } from "../components/library/ImportBackupModal";
import { LibraryFolderModal } from "../components/library/LibraryFolderModal";
import { LibraryOptionsPopover } from "../components/library/LibraryOptionsPopover";
import { LibraryShelfStrip } from "../components/library/LibraryShelfStrip";
import type { ActiveLibraryFilter } from "../components/library/LibrarySidebar";
import { MetadataDrawer } from "../components/library/MetadataDrawer";
import { MobileBookActionSheet } from "../components/library/MobileBookActionSheet";
import { MobileBookList } from "../components/library/MobileBookList";
import { MobileFilterSortSheet } from "../components/library/MobileFilterSortSheet";
import {
  MobileOrganizeSheet,
  type MobileOrganizePayload,
} from "../components/library/MobileOrganizeSheet";
import { StorageManagerModal } from "../components/library/StorageManagerModal";
import { ViewFoldersSection } from "../components/library/ViewFoldersSection";
import { ReaderTabStrip } from "../components/reader/ReaderTabStrip";
import { ReaderView } from "../components/reader/ReaderView";
import { useWorkspace } from "../context/WorkspaceContext";
import { useLibraryPreferences } from "../hooks/usePreferences";
import {
  exportLibraryBackupZip,
  parseLibraryBackupZip,
  type ParsedBackupArchive,
} from "../lib/backup";
import { findMissingBookIds } from "../lib/bookFileLoader";
import { computeSha256Hex, libraryDb } from "../lib/db";
import {
  getBookFolderIds,
  getFolderDescendantIds,
  withBookFolderIds,
} from "../lib/formatters";
import {
  detectBookFormat,
  extractBookImportMetadata,
  extractBookImportMetadataFromBuffer,
} from "../lib/parsers/importBook";
import {
  addOrUpdateAndroidLinkedFolder,
  getAndroidImportMode,
  getAndroidLinkedFolders,
  isAndroidCapacitor,
  pickAndroidBookDocuments,
  pickAndroidBookFolder,
  readAndroidUriAsArrayBuffer,
  releaseAndroidUri,
  removeAndroidLinkedFolder,
  scanAndroidBookFolder,
  setAndroidImportMode,
  type AndroidImportStorageMode,
  type AndroidLinkedFolder,
  type AndroidSafPickedFile,
} from "../utils/androidSaf";
import type {
  BookJumpRequest,
  BookNoteLink,
  DetailSheetTarget,
} from "../types";
import type {
  BookFormat,
  BookRecord,
  CategoryRecord,
  FolderColor,
  FolderRecord,
  GroupByField,
  HighlightRecord,
  ReadingStatus,
  SortField,
  ViewFolderRecord,
} from "../types/library";

export interface LibraryViewProps {
  zenMode?: boolean;
  jumpRequest?: BookJumpRequest | null;
  onOpenDetail?: (target: DetailSheetTarget) => void;
  onToggleZenMode?: () => void;
  onExitZenMode?: () => void;
  onMuteBackgroundStreamer?: () => void;
  /**
   * Whether this Library instance is the currently-visible view.
   * Used to gate global listeners & pause the reader when the Library
   * stays mounted offscreen (keep-alive in App.tsx).
   * Defaults to true for safety.
   */
  isActiveView?: boolean;
}

function makeId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function hashPaletteIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 8;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  zenMode = false,
  jumpRequest = null,
  onOpenDetail,
  onToggleZenMode,
  onExitZenMode,
  onMuteBackgroundStreamer,
  isActiveView = true,
}) => {
  const {
    workspace,
    pushToast,
    updateLibraryState,
    syncLibraryAnnotationsFromDb,
    sendBookExcerptToNotes,
    addNotePage,
    deleteEntry,
    deleteBooks,
  } = useWorkspace();

  const {
    prefs,
    updateUiPrefs,
    updateReaderPrefs,
    resetReaderPrefs,
    updateCardDetails,
  } = useLibraryPreferences();

  const books = workspace.books;
  const folders = workspace.libraryFolders ?? [];
  const categories = workspace.libraryCategories ?? [];
  const viewFolders = workspace.libraryViewFolders ?? [];
  const bookmarks = workspace.bookBookmarks ?? [];
  const highlights = workspace.bookHighlights ?? [];

  // Active reader tabs (multi-book workspace)
  const [openBookIds, setOpenBookIds] = useState<string[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);

  // Deep-link jump from Notes / DetailSheet into a specific book & page/chapter
  const lastConsumedJumpNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!jumpRequest) return;
    if (lastConsumedJumpNonceRef.current === jumpRequest.nonce) return;
    const target = books.find((b) => b.id === jumpRequest.bookId);
    if (!target) return;
    lastConsumedJumpNonceRef.current = jumpRequest.nonce;
    setOpenBookIds((prev) =>
      prev.includes(jumpRequest.bookId) ? prev : [...prev, jumpRequest.bookId],
    );
    setActiveBookId(jumpRequest.bookId);
  }, [jumpRequest, books]);

  // Library filtering, search & drill-down
  const [activeFilter, setActiveFilter] = useState<ActiveLibraryFilter>({
    kind: "smart",
    id: "all",
  });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [formatFilter, setFormatFilter] = useState<"all" | BookFormat>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [drilledViewFolderId, setDrilledViewFolderId] = useState<string | null>(
    null,
  );

  // Selection, Inspector, Popovers & Drawers
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedBookIdRef = useRef<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectedBookId, setInspectedBookId] = useState<string | null>(null);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [booksPendingDelete, setBooksPendingDelete] = useState<BookRecord[]>(
    [],
  );
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [storageManagerOpen, setStorageManagerOpen] = useState(false);
  const [displayPopoverOpen, setDisplayPopoverOpen] = useState(false);
  const [folderModal, setFolderModal] = useState<
    { mode: "create" } | { mode: "edit"; folder: FolderRecord } | null
  >(null);
  const [mobileFilterSheetOpen, setMobileFilterSheetOpen] = useState(false);
  const [mobileActionBook, setMobileActionBook] = useState<BookRecord | null>(
    null,
  );
  const [organizeTargetIds, setOrganizeTargetIds] = useState<string[] | null>(
    null,
  );
  const [addingBooksToViewFolder, setAddingBooksToViewFolder] =
    useState<ViewFolderRecord | null>(null);
  const [contextMenu, setContextMenu] = useState<BookContextMenuState | null>(
    null,
  );

  // Drag & Drop (Books → Folders, External Files → Import)
  const [isDraggingBooks, setIsDraggingBooks] = useState(false);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [pendingFolderDrop, setPendingFolderDrop] =
    useState<PendingFolderDrop | null>(null);

  // Import, Deduplication & Backup ZIP states
  const [isImporting, setIsImporting] = useState(false);
  const [pendingDuplicates, setPendingDuplicates] = useState<
    PendingDuplicateItem[]
  >([]);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isParsingBackup, setIsParsingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [pendingBackupArchive, setPendingBackupArchive] =
    useState<ParsedBackupArchive | null>(null);

  // Missing-file audit & relink state (cross-device Gist sync + Android linked URIs)
  const [missingBookIds, setMissingBookIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Android Capacitor-only SAF direct file access state
  const isAndroidApp = useMemo(() => isAndroidCapacitor(), []);
  const [androidImportMenuOpen, setAndroidImportMenuOpen] = useState(false);
  const [androidImportMode, setAndroidImportModeState] =
    useState<AndroidImportStorageMode>(() =>
      isAndroidCapacitor() ? getAndroidImportMode() : "ask",
    );
  const [androidLinkedFolders, setAndroidLinkedFolders] = useState<
    AndroidLinkedFolder[]
  >(() => (isAndroidCapacitor() ? getAndroidLinkedFolders() : []));
  const [androidFolderManagerOpen, setAndroidFolderManagerOpen] =
    useState(false);
  const [isScanningAndroidFolders, setIsScanningAndroidFolders] =
    useState(false);
  const [androidChoicePrompt, setAndroidChoicePrompt] = useState<{
    fileCount: number;
    totalBytes: number;
    contextLabel?: string;
  } | null>(null);
  const androidChoiceResolverRef = useRef<
    ((choice: "link" | "copy" | null) => void) | null
  >(null);
  const pendingDupAndroidRef = useRef<
    Map<string, { uri: string; choice: "link" | "copy" }>
  >(new Map());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const relinkFileInputRef = useRef<HTMLInputElement>(null);
  const relinkTargetBookRef = useRef<BookRecord | null>(null);

  const notify = useCallback(
    (
      title: string,
      tone: "info" | "success" | "error" = "info",
      detail?: string,
    ) => {
      const msg = detail ? `${title} — ${detail}` : title;
      pushToast(msg, tone === "info" ? "neutral" : tone);
    },
    [pushToast],
  );

  // Keep openBookIds clean if books are deleted
  useEffect(() => {
    const idSet = new Set(books.map((b) => b.id));
    setOpenBookIds((prev) => {
      const next = prev.filter((id) => idSet.has(id));
      return next.length === prev.length ? prev : next;
    });
    setActiveBookId((curr) => (curr && !idSet.has(curr) ? null : curr));
    setInspectedBookId((curr) => (curr && !idSet.has(curr) ? null : curr));
  }, [books]);

  const refreshMissingBookIds = useCallback(async () => {
    try {
      const missing = await findMissingBookIds(books);
      setMissingBookIds(missing);
    } catch {
      // Non-fatal
    }
  }, [books]);

  useEffect(() => {
    void refreshMissingBookIds();
  }, [refreshMissingBookIds]);

  useEffect(() => {
    if (!isAndroidApp) return;
    const onModeChanged = (e: Event) => {
      const next = (e as CustomEvent<AndroidImportStorageMode>).detail;
      if (next) setAndroidImportModeState(next);
    };
    window.addEventListener("kanso:android-import-mode-changed", onModeChanged);
    return () => {
      window.removeEventListener(
        "kanso:android-import-mode-changed",
        onModeChanged,
      );
    };
  }, [isAndroidApp]);

  // Exit Zen mode whenever returning from Reader back to Library grid
  useEffect(() => {
    if (!isActiveView) return;
    if (!activeBookId && zenMode) {
      onExitZenMode?.();
    }
  }, [isActiveView, activeBookId, zenMode, onExitZenMode]);

  // Global Cmd/Ctrl+K Command Palette & Escape handling when in Library shelf view
  useEffect(() => {
    if (!isActiveView) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      } else if (e.key === "Escape" && !activeBookId) {
        if (contextMenu) setContextMenu(null);
        else if (displayPopoverOpen) setDisplayPopoverOpen(false);
        else if (selectedIds.size > 0) setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isActiveView,
    activeBookId,
    contextMenu,
    displayPopoverOpen,
    selectedIds.size,
  ]);

  // Track internal book drag state synchronously + for FloatingFolderDropDock
  const isInternalBookDragRef = useRef(false);

  useEffect(() => {
    if (!isActiveView) return;

    const onDragStart = (e: DragEvent) => {
      const types = e.dataTransfer?.types;
      if (
        types &&
        (types.includes("application/x-folio-book-id") ||
          types.includes("application/x-folio-book-ids"))
      ) {
        isInternalBookDragRef.current = true;
        setIsFileDragActive(false);
        setIsDraggingBooks(true);
      }
    };
    const onDragEnd = () => {
      isInternalBookDragRef.current = false;
      setIsDraggingBooks(false);
      setIsFileDragActive(false);
    };
    window.addEventListener("dragstart", onDragStart);
    window.addEventListener("dragend", onDragEnd);
    window.addEventListener("drop", onDragEnd);
    return () => {
      window.removeEventListener("dragstart", onDragStart);
      window.removeEventListener("dragend", onDragEnd);
      window.removeEventListener("drop", onDragEnd);
    };
  }, [isActiveView]);

  const isPureExternalFileDrag = useCallback(
    (dt: DataTransfer | null): boolean => {
      if (!dt || isInternalBookDragRef.current) return false;
      const types = dt.types;
      if (
        types.includes("application/x-folio-book-id") ||
        types.includes("application/x-folio-book-ids")
      ) {
        return false;
      }
      if (!types.includes("Files")) return false;
      if (dt.items && dt.items.length > 0) {
        return Array.from(dt.items).some((item) => item.kind === "file");
      }
      return true;
    },
    [],
  );

  // Derived collections & keys
  const activeViewKey = `${activeFilter.kind}:${activeFilter.id}`;

  const activeViewLabel = useMemo(() => {
    if (activeFilter.kind === "smart") {
      const labels: Record<string, string> = {
        all: "All Books",
        reading: "Currently Reading",
        unread: "Unread",
        finished: "Finished",
        favorites: "Favorites",
        highlights: "Highlights & Notes",
      };
      return labels[activeFilter.id] ?? "Library";
    }
    if (activeFilter.kind === "folder") {
      return folders.find((f) => f.id === activeFilter.id)?.name ?? "Folder";
    }
    return categories.find((c) => c.id === activeFilter.id)?.name ?? "Category";
  }, [activeFilter, folders, categories]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const book of books) {
      for (const t of book.tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [books]);

  const existingTagNames = useMemo(() => allTags.map((t) => t.name), [allTags]);

  const currentViewFolders = useMemo(
    () => viewFolders.filter((vf) => vf.viewKey === activeViewKey),
    [viewFolders, activeViewKey],
  );

  const drilledViewFolder = useMemo(
    () =>
      drilledViewFolderId
        ? (currentViewFolders.find((vf) => vf.id === drilledViewFolderId) ??
          null)
        : null,
    [currentViewFolders, drilledViewFolderId],
  );

  // Reset drill-down when switching sidebar filters
  useEffect(() => {
    setDrilledViewFolderId(null);
    setSelectedIds(new Set());
  }, [activeViewKey]);

  // Step 1: Books matching the active Sidebar filter + tags + format + search (before view-folder hiding/drilling)
  const viewBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const descendantIds =
      activeFilter.kind === "folder"
        ? getFolderDescendantIds(folders, activeFilter.id)
        : null;

    return books.filter((book) => {
      if (activeFilter.kind === "smart") {
        if (activeFilter.id === "reading" && book.status !== "reading")
          return false;
        if (activeFilter.id === "unread" && book.status !== "unread")
          return false;
        if (activeFilter.id === "finished" && book.status !== "finished")
          return false;
        if (activeFilter.id === "favorites" && !book.isFavorite) return false;
      } else if (activeFilter.kind === "folder" && descendantIds) {
        const bFolders = getBookFolderIds(book);
        if (!bFolders.some((fid) => descendantIds.has(fid))) return false;
      } else if (activeFilter.kind === "category") {
        if (book.categoryId !== activeFilter.id) return false;
      }

      if (formatFilter !== "all" && book.format !== formatFilter) return false;

      if (selectedTags.length > 0) {
        if (!selectedTags.every((t) => book.tags.includes(t))) return false;
      }

      if (q) {
        const hay =
          `${book.title} ${book.subtitle ?? ""} ${book.author} ${book.series ?? ""} ${book.publisher ?? ""} ${book.tags.join(" ")} ${book.fileName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [books, activeFilter, folders, formatFilter, selectedTags, searchQuery]);

  // Filed book IDs inside the current view's ViewFolders
  const filedBookIdSet = useMemo(() => {
    const set = new Set<string>();
    for (const vf of currentViewFolders) {
      for (const bid of vf.bookIds) set.add(bid);
    }
    return set;
  }, [currentViewFolders]);

  const filedBooksCount = useMemo(
    () => viewBooks.filter((b) => filedBookIdSet.has(b.id)).length,
    [viewBooks, filedBookIdSet],
  );

  const customBookOrderCompare = useCallback((a: BookRecord, b: BookRecord) => {
    const aOrder =
      typeof a.sortOrder === "number" && Number.isFinite(a.sortOrder)
        ? a.sortOrder
        : null;
    const bOrder =
      typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder)
        ? b.sortOrder
        : null;
    if (aOrder !== null && bOrder !== null) {
      if (aOrder !== bOrder) return aOrder - bOrder;
    } else if (aOrder !== null) {
      return -1;
    } else if (bOrder !== null) {
      return 1;
    }
    const aTime = a.lastReadAt ?? a.addedAt;
    const bTime = b.lastReadAt ?? b.addedAt;
    return bTime - aTime || a.id.localeCompare(b.id);
  }, []);

  // Step 2: Visible books after view-folder drill-down / hide-filed + sorting
  const visibleBooks = useMemo(() => {
    let list = viewBooks;
    if (drilledViewFolder) {
      const inFolder = new Set(drilledViewFolder.bookIds);
      list = list.filter((b) => inFolder.has(b.id));
    } else if (prefs.hideFiledBooks && currentViewFolders.length > 0) {
      list = list.filter((b) => !filedBookIdSet.has(b.id));
    }

    const dir = prefs.sortDirection === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (prefs.sortField) {
        case "custom":
          return customBookOrderCompare(a, b);
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "author":
          return a.author.localeCompare(b.author) * dir;
        case "progress":
          return (a.progress - b.progress) * dir;
        case "fileSize":
          return (a.fileSize - b.fileSize) * dir;
        case "year":
          return (a.year ?? "").localeCompare(b.year ?? "") * dir;
        case "format":
          return a.format.localeCompare(b.format) * dir;
        case "addedAt":
          return (a.addedAt - b.addedAt) * dir;
        case "recent":
        case "lastReadAt":
        default: {
          const aVal = a.lastReadAt ?? a.addedAt;
          const bVal = b.lastReadAt ?? b.addedAt;
          return (aVal - bVal) * dir;
        }
      }
    });
  }, [
    viewBooks,
    drilledViewFolder,
    prefs.hideFiledBooks,
    currentViewFolders.length,
    filedBookIdSet,
    prefs.sortField,
    prefs.sortDirection,
    customBookOrderCompare,
  ]);

  // Grouped visible books when groupBy !== 'none'
  const groupedBooks = useMemo(() => {
    if (prefs.groupBy === "none") {
      return [{ key: "all", label: "", books: visibleBooks }];
    }
    const categoryNameMap = new Map(categories.map((c) => [c.id, c.name]));
    const groups = new Map<string, BookRecord[]>();

    for (const book of visibleBooks) {
      let label = "Other";
      if (prefs.groupBy === "status") {
        label =
          book.status === "reading"
            ? "Currently Reading"
            : book.status === "finished"
              ? "Finished"
              : "Unread";
      } else if (prefs.groupBy === "format") {
        label = book.format.toUpperCase();
      } else if (prefs.groupBy === "author") {
        label = book.author || "Unknown Author";
      } else if (prefs.groupBy === "category") {
        label =
          (book.categoryId && categoryNameMap.get(book.categoryId)) ||
          "Uncategorized";
      } else if (prefs.groupBy === "series") {
        label = book.series?.trim() || "Standalone";
      }
      const arr = groups.get(label) ?? [];
      arr.push(book);
      groups.set(label, arr);
    }

    return Array.from(groups.entries()).map(([label, items]) => ({
      key: label,
      label,
      books: items,
    }));
  }, [visibleBooks, prefs.groupBy, categories]);

  const openBooks = useMemo(
    () =>
      openBookIds
        .map((id) => books.find((b) => b.id === id))
        .filter((b): b is BookRecord => Boolean(b)),
    [openBookIds, books],
  );

  const activeBook = useMemo(
    () =>
      activeBookId ? (books.find((b) => b.id === activeBookId) ?? null) : null,
    [activeBookId, books],
  );

  const inspectedBook = useMemo(
    () =>
      inspectedBookId
        ? (books.find((b) => b.id === inspectedBookId) ?? null)
        : null,
    [inspectedBookId, books],
  );

  const editingBook = useMemo(
    () =>
      editingBookId
        ? (books.find((b) => b.id === editingBookId) ?? null)
        : null,
    [editingBookId, books],
  );

  // Open a book in a Reader tab (optionally jumping straight to a chapter/page)
  const handleOpenBook = useCallback(
    (book: BookRecord, jumpUnitIndex?: number) => {
      if (typeof jumpUnitIndex === "number") {
        const updated: BookRecord = {
          ...book,
          lastReadAt: Date.now(),
          currentLocation: {
            unitIndex: jumpUnitIndex,
            scrollRatio: 0,
            label: book.format === "pdf" ? `Page ${jumpUnitIndex}` : undefined,
          },
        };
        updateLibraryState((prev) => ({
          books: prev.books.map((b) => (b.id === book.id ? updated : b)),
        }));
      }
      setOpenBookIds((prev) =>
        prev.includes(book.id) ? prev : [...prev, book.id],
      );
      setActiveBookId(book.id);
    },
    [updateLibraryState],
  );

  const handleCloseBookTab = useCallback((bookId: string) => {
    setOpenBookIds((prev) => {
      const idx = prev.indexOf(bookId);
      const next = prev.filter((id) => id !== bookId);
      setActiveBookId((curr) => {
        if (curr !== bookId) return curr;
        if (next.length === 0) return null;
        return next[Math.max(0, idx - 1)] ?? next[0];
      });
      return next;
    });
  }, []);

  const handleCycleReaderSurface = useCallback(() => {
    const next =
      prefs.reader.theme === "kanso"
        ? "sepia"
        : prefs.reader.theme === "sepia"
          ? "dark"
          : "kanso";
    updateReaderPrefs({ theme: next });
  }, [prefs.reader.theme, updateReaderPrefs]);

  // Book CRUD & Metadata
  const handleUpdateBook = useCallback(
    (updated: BookRecord) => {
      updateLibraryState((prev) => ({
        books: prev.books.map((b) => (b.id === updated.id ? updated : b)),
      }));
    },
    [updateLibraryState],
  );

  const handleToggleFavorite = useCallback(
    (book: BookRecord) => {
      handleUpdateBook({ ...book, isFavorite: !book.isFavorite });
    },
    [handleUpdateBook],
  );

  const handleReorderBooks = useCallback(
    (
      draggedIds: string[],
      targetBookId: string,
      position: "before" | "after",
    ) => {
      if (draggedIds.length === 0 || draggedIds.includes(targetBookId)) return;
      const draggedSet = new Set(draggedIds);
      const visibleIds = visibleBooks.map((b) => b.id);
      if (!visibleIds.includes(targetBookId)) return;

      const draggedInVisibleOrder = visibleIds.filter((id) =>
        draggedSet.has(id),
      );
      if (draggedInVisibleOrder.length === 0) return;

      const remainingVisible = visibleIds.filter((id) => !draggedSet.has(id));
      const targetIndex = remainingVisible.indexOf(targetBookId);
      if (targetIndex === -1) return;

      const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
      const nextVisibleIds = [
        ...remainingVisible.slice(0, insertIndex),
        ...draggedInVisibleOrder,
        ...remainingVisible.slice(insertIndex),
      ];

      if (nextVisibleIds.every((id, idx) => id === visibleIds[idx])) return;

      const visibleSet = new Set(visibleIds);
      updateLibraryState((prev) => {
        const globalSorted = [...prev.books].sort(customBookOrderCompare);
        const byId = new Map(prev.books.map((b) => [b.id, b]));
        let visibleCursor = 0;
        const reorderedGlobal: BookRecord[] = [];
        for (const book of globalSorted) {
          if (visibleSet.has(book.id)) {
            const nextId = nextVisibleIds[visibleCursor++];
            const nextBook = nextId ? byId.get(nextId) : undefined;
            if (nextBook) reorderedGlobal.push(nextBook);
          } else {
            reorderedGlobal.push(book);
          }
        }
        while (visibleCursor < nextVisibleIds.length) {
          const nextBook = byId.get(nextVisibleIds[visibleCursor++]);
          if (nextBook) reorderedGlobal.push(nextBook);
        }

        const sortOrderById = new Map<string, number>();
        reorderedGlobal.forEach((b, idx) => {
          sortOrderById.set(b.id, idx);
        });

        return {
          books: prev.books.map((b) => ({
            ...b,
            sortOrder: sortOrderById.get(b.id) ?? b.sortOrder,
          })),
        };
      });
    },
    [visibleBooks, customBookOrderCompare, updateLibraryState],
  );

  const handleDeleteBooksConfirmed = useCallback(
    async (
      idsToDelete: string[],
      linkedNotesBehavior: "keep" | "delete" = "keep",
    ) => {
      const deleteSet = new Set(idsToDelete);
      if (deleteSet.size === 0) return;

      await deleteBooks(Array.from(deleteSet), linkedNotesBehavior);

      setOpenBookIds((prev) => prev.filter((id) => !deleteSet.has(id)));
      setActiveBookId((prev) => (prev && deleteSet.has(prev) ? null : prev));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of deleteSet) next.delete(id);
        return next;
      });
      setBooksPendingDelete([]);
    },
    [deleteBooks],
  );

  // Import Pipeline with SHA-256 + Metadata Deduplication + Missing-book Auto-Relink
  const handleImportFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const rawFiles = Array.from(fileList);
      if (rawFiles.length === 0) return;

      const supported = rawFiles.filter(
        (f) => detectBookFormat(f.name) !== null,
      );
      const unsupportedCount = rawFiles.length - supported.length;
      if (unsupportedCount > 0) {
        notify(
          `Skipped ${unsupportedCount} unsupported file${unsupportedCount === 1 ? "" : "s"}`,
          "error",
          "Supports .epub, .pdf, and .mobi",
        );
      }
      if (supported.length === 0) return;

      setIsImporting(true);
      const newlyAdded: BookRecord[] = [];
      const relinkedUpdates = new Map<string, BookRecord>();
      const knownBooks: BookRecord[] = [...books];
      const duplicatesFound: PendingDuplicateItem[] = [];

      try {
        for (const file of supported) {
          try {
            const { meta: metadata, buffer: arrayBuffer } =
              await extractBookImportMetadata(file);

            // Auto-match missing books (e.g., Gist-synced) by SHA-256 hash
            const missingHashMatch = knownBooks.find(
              (b) =>
                missingBookIds.has(b.id) &&
                Boolean(b.fileHash) &&
                b.fileHash === metadata.fileHash,
            );
            if (missingHashMatch) {
              await libraryDb.saveBookFile(
                missingHashMatch.id,
                arrayBuffer,
                metadata.fileHash,
              );
              const patched: BookRecord = {
                ...missingHashMatch,
                storageMode: "indexeddb",
                externalUri: undefined,
                format: metadata.format,
                fileName: metadata.fileName,
                fileSize: metadata.fileSize,
                fileHash: metadata.fileHash,
                totalUnits: metadata.totalUnits,
                coverDataUrl:
                  missingHashMatch.coverDataUrl ?? metadata.coverDataUrl,
              };
              relinkedUpdates.set(patched.id, patched);
              const idx = knownBooks.findIndex((b) => b.id === patched.id);
              if (idx >= 0) knownBooks[idx] = patched;
              continue;
            }

            // Detect duplicate against both existing books and earlier items in this batch
            const existingByFile = knownBooks.find(
              (b) =>
                (b.fileHash && b.fileHash === metadata.fileHash) ||
                (b.fileName.toLowerCase() === metadata.fileName.toLowerCase() &&
                  b.fileSize === metadata.fileSize),
            );
            const existingByTitle = !existingByFile
              ? knownBooks.find(
                  (b) =>
                    b.title.trim().toLowerCase() ===
                      metadata.title.trim().toLowerCase() &&
                    b.author.trim().toLowerCase() ===
                      metadata.author.trim().toLowerCase(),
                )
              : undefined;

            const existing = existingByFile ?? existingByTitle;
            if (existing) {
              duplicatesFound.push({
                id: makeId("dup"),
                file,
                arrayBuffer,
                metadata,
                existingBook: existing,
                matchReason: existingByFile
                  ? "Same file name & size"
                  : "Same title & author",
              });
              continue;
            }

            const newId = makeId("book");
            await libraryDb.saveBookFile(newId, arrayBuffer, metadata.fileHash);

            const targetFolderIds =
              activeFilter.kind === "folder" ? [activeFilter.id] : [];
            const targetCategoryId =
              activeFilter.kind === "category" ? activeFilter.id : null;

            const record: BookRecord = {
              id: newId,
              format: metadata.format,
              fileName: metadata.fileName,
              fileSize: metadata.fileSize,
              fileHash: metadata.fileHash,
              storageMode: "indexeddb",
              title: metadata.title,
              subtitle: metadata.subtitle || undefined,
              author: metadata.author,
              description: metadata.description || undefined,
              publisher: metadata.publisher || undefined,
              language: metadata.language || undefined,
              year: metadata.year || undefined,
              status: "unread",
              isFavorite:
                activeFilter.kind === "smart" &&
                activeFilter.id === "favorites",
              categoryId: targetCategoryId,
              folderId: targetFolderIds[0] ?? null,
              folderIds: targetFolderIds,
              tags: [...selectedTags],
              coverDataUrl: metadata.coverDataUrl,
              coverPaletteIndex: hashPaletteIndex(metadata.title),
              coverStyle: "editorial",
              progress: 0,
              totalUnits: metadata.totalUnits,
              currentLocation: {
                unitIndex: metadata.format === "pdf" ? 1 : 0,
                scrollRatio: 0,
              },
              addedAt: Date.now(),
              lastReadAt: null,
            };

            newlyAdded.push(record);
            knownBooks.push(record);
          } catch (err) {
            notify(
              `Failed to import "${file.name}"`,
              "error",
              err instanceof Error ? err.message : undefined,
            );
          }
        }

        if (newlyAdded.length > 0 || relinkedUpdates.size > 0) {
          const addedIds = newlyAdded.map((b) => b.id);
          const drilledId = drilledViewFolder?.id ?? null;
          updateLibraryState((prev) => ({
            books: [
              ...newlyAdded,
              ...prev.books.map((b) => relinkedUpdates.get(b.id) ?? b),
            ],
            ...(drilledId && addedIds.length > 0
              ? {
                  libraryViewFolders: prev.libraryViewFolders.map((vf) =>
                    vf.id === drilledId
                      ? {
                          ...vf,
                          bookIds: Array.from(
                            new Set([...vf.bookIds, ...addedIds]),
                          ),
                        }
                      : vf,
                  ),
                }
              : {}),
          }));
          if (relinkedUpdates.size > 0 && newlyAdded.length === 0) {
            notify(
              relinkedUpdates.size === 1
                ? `Relinked "${Array.from(relinkedUpdates.values())[0].title}"`
                : `Relinked ${relinkedUpdates.size} missing books`,
              "success",
            );
          } else if (newlyAdded.length > 0) {
            notify(
              newlyAdded.length === 1
                ? `Imported "${newlyAdded[0].title}"`
                : `Imported ${newlyAdded.length} books`,
              "success",
              relinkedUpdates.size > 0
                ? `Also relinked ${relinkedUpdates.size} missing ${relinkedUpdates.size === 1 ? "book" : "books"}`
                : undefined,
            );
          }
        }

        if (duplicatesFound.length > 0) {
          setPendingDuplicates(duplicatesFound);
        }
      } finally {
        setIsImporting(false);
        void refreshMissingBookIds();
      }
    },
    [
      books,
      missingBookIds,
      activeFilter,
      selectedTags,
      drilledViewFolder,
      updateLibraryState,
      notify,
      refreshMissingBookIds,
    ],
  );

  // Android Capacitor SAF Helpers (never activated on web desktop/PWA)
  const askAndroidStorageChoice = useCallback(
    (
      fileCount: number,
      totalBytes: number,
      contextLabel?: string,
    ): Promise<"link" | "copy" | null> => {
      if (androidImportMode === "always-link") return Promise.resolve("link");
      if (androidImportMode === "always-copy") return Promise.resolve("copy");
      return new Promise((resolve) => {
        androidChoiceResolverRef.current = resolve;
        setAndroidChoicePrompt({ fileCount, totalBytes, contextLabel });
      });
    },
    [androidImportMode],
  );

  const handleResolveAndroidChoice = useCallback(
    (
      choice: "link" | "copy" | null,
      rememberPreference?: AndroidImportStorageMode,
    ) => {
      if (rememberPreference) {
        setAndroidImportMode(rememberPreference);
        setAndroidImportModeState(rememberPreference);
      }
      const resolver = androidChoiceResolverRef.current;
      androidChoiceResolverRef.current = null;
      setAndroidChoicePrompt(null);
      resolver?.(choice);
    },
    [],
  );

  const processAndroidPickedFiles = useCallback(
    async (
      pickedFiles: AndroidSafPickedFile[],
      mode: "link" | "copy",
      options?: { silent?: boolean; skipDuplicatesSilently?: boolean },
    ): Promise<{ added: number; relinked: number }> => {
      const supported = pickedFiles.filter(
        (f) => detectBookFormat(f.name) !== null,
      );
      const unsupportedCount = pickedFiles.length - supported.length;
      if (!options?.silent && unsupportedCount > 0) {
        notify(
          `Skipped ${unsupportedCount} unsupported file${unsupportedCount === 1 ? "" : "s"}`,
          "error",
          "Supports .epub, .pdf, and .mobi",
        );
      }
      if (supported.length === 0) return { added: 0, relinked: 0 };

      setIsImporting(true);
      const newlyAdded: BookRecord[] = [];
      const relinkedUpdates = new Map<string, BookRecord>();
      const knownBooks: BookRecord[] = [...books];
      const duplicatesFound: PendingDuplicateItem[] = [];

      // Skip already-bound readable URIs immediately (important for folder re-scans)
      const activeReadableUriSet = new Set(
        knownBooks
          .filter(
            (b) =>
              b.storageMode === "android-uri" &&
              Boolean(b.externalUri) &&
              !missingBookIds.has(b.id),
          )
          .map((b) => b.externalUri as string),
      );

      try {
        for (const safFile of supported) {
          if (
            options?.skipDuplicatesSilently &&
            activeReadableUriSet.has(safFile.uri)
          ) {
            continue;
          }

          try {
            const buffer = await readAndroidUriAsArrayBuffer(
              safFile.uri,
              safFile.size,
            );
            const { meta: metadata } = await extractBookImportMetadataFromBuffer(
              safFile.name,
              safFile.size,
              buffer,
            );

            // Auto-match missing book (e.g., Gist-synced or moved) by SHA-256 hash
            const missingHashMatch = knownBooks.find(
              (b) =>
                missingBookIds.has(b.id) &&
                Boolean(b.fileHash) &&
                b.fileHash === metadata.fileHash,
            );
            if (missingHashMatch) {
              if (mode === "copy") {
                await libraryDb.saveBookFile(
                  missingHashMatch.id,
                  buffer,
                  metadata.fileHash,
                );
              }
              const patched: BookRecord = {
                ...missingHashMatch,
                storageMode: mode === "link" ? "android-uri" : "indexeddb",
                externalUri: mode === "link" ? safFile.uri : undefined,
                format: metadata.format,
                fileName: metadata.fileName,
                fileSize: metadata.fileSize,
                fileHash: metadata.fileHash,
                totalUnits: metadata.totalUnits,
                coverDataUrl:
                  missingHashMatch.coverDataUrl ?? metadata.coverDataUrl,
              };
              relinkedUpdates.set(patched.id, patched);
              const idx = knownBooks.findIndex((b) => b.id === patched.id);
              if (idx >= 0) knownBooks[idx] = patched;
              if (mode === "link") activeReadableUriSet.add(safFile.uri);
              continue;
            }

            const existingByFile = knownBooks.find(
              (b) =>
                (b.externalUri && b.externalUri === safFile.uri) ||
                (b.fileHash && b.fileHash === metadata.fileHash) ||
                (b.fileName.toLowerCase() === metadata.fileName.toLowerCase() &&
                  b.fileSize === metadata.fileSize),
            );
            const existingByTitle = !existingByFile
              ? knownBooks.find(
                  (b) =>
                    b.title.trim().toLowerCase() ===
                      metadata.title.trim().toLowerCase() &&
                    b.author.trim().toLowerCase() ===
                      metadata.author.trim().toLowerCase(),
                )
              : undefined;

            const existing = existingByFile ?? existingByTitle;
            if (existing) {
              if (options?.skipDuplicatesSilently) continue;
              const dupId = makeId("dup");
              const fileProxy = new File([buffer], safFile.name, {
                type: safFile.mimeType || "application/octet-stream",
              });
              pendingDupAndroidRef.current.set(dupId, {
                uri: safFile.uri,
                choice: mode,
              });
              duplicatesFound.push({
                id: dupId,
                file: fileProxy,
                arrayBuffer: buffer,
                metadata,
                existingBook: existing,
                matchReason: existingByFile
                  ? "Same file name & size"
                  : "Same title & author",
              });
              continue;
            }

            const newId = makeId("book");
            if (mode === "copy") {
              await libraryDb.saveBookFile(newId, buffer, metadata.fileHash);
            }

            const targetFolderIds =
              activeFilter.kind === "folder" ? [activeFilter.id] : [];
            const targetCategoryId =
              activeFilter.kind === "category" ? activeFilter.id : null;

            const record: BookRecord = {
              id: newId,
              format: metadata.format,
              fileName: metadata.fileName,
              fileSize: metadata.fileSize,
              fileHash: metadata.fileHash,
              storageMode: mode === "link" ? "android-uri" : "indexeddb",
              externalUri: mode === "link" ? safFile.uri : undefined,
              title: metadata.title,
              subtitle: metadata.subtitle || undefined,
              author: metadata.author,
              description: metadata.description || undefined,
              publisher: metadata.publisher || undefined,
              language: metadata.language || undefined,
              year: metadata.year || undefined,
              status: "unread",
              isFavorite:
                activeFilter.kind === "smart" &&
                activeFilter.id === "favorites",
              categoryId: targetCategoryId,
              folderId: targetFolderIds[0] ?? null,
              folderIds: targetFolderIds,
              tags: [...selectedTags],
              coverDataUrl: metadata.coverDataUrl,
              coverPaletteIndex: hashPaletteIndex(metadata.title),
              coverStyle: "editorial",
              progress: 0,
              totalUnits: metadata.totalUnits,
              currentLocation: {
                unitIndex: metadata.format === "pdf" ? 1 : 0,
                scrollRatio: 0,
              },
              addedAt: Date.now(),
              lastReadAt: null,
            };

            newlyAdded.push(record);
            knownBooks.push(record);
            if (mode === "link") activeReadableUriSet.add(safFile.uri);
          } catch (err) {
            if (!options?.silent) {
              notify(
                `Failed to import "${safFile.name}"`,
                "error",
                err instanceof Error ? err.message : undefined,
              );
            }
          }
        }

        if (newlyAdded.length > 0 || relinkedUpdates.size > 0) {
          const addedIds = newlyAdded.map((b) => b.id);
          const drilledId = drilledViewFolder?.id ?? null;
          updateLibraryState((prev) => ({
            books: [
              ...newlyAdded,
              ...prev.books.map((b) => relinkedUpdates.get(b.id) ?? b),
            ],
            ...(drilledId && addedIds.length > 0
              ? {
                  libraryViewFolders: prev.libraryViewFolders.map((vf) =>
                    vf.id === drilledId
                      ? {
                          ...vf,
                          bookIds: Array.from(
                            new Set([...vf.bookIds, ...addedIds]),
                          ),
                        }
                      : vf,
                  ),
                }
              : {}),
          }));

          if (!options?.silent) {
            if (newlyAdded.length > 0) {
              notify(
                newlyAdded.length === 1
                  ? `${mode === "link" ? "Linked" : "Imported"} "${newlyAdded[0].title}"`
                  : `${mode === "link" ? "Linked" : "Imported"} ${newlyAdded.length} books`,
                "success",
                relinkedUpdates.size > 0
                  ? `Also auto-relinked ${relinkedUpdates.size} missing book${relinkedUpdates.size === 1 ? "" : "s"}`
                  : undefined,
              );
            } else if (relinkedUpdates.size > 0) {
              notify(
                relinkedUpdates.size === 1
                  ? `Auto-relinked "${Array.from(relinkedUpdates.values())[0].title}"`
                  : `Auto-relinked ${relinkedUpdates.size} missing books`,
                "success",
              );
            }
          }
        }

        if (duplicatesFound.length > 0) {
          setPendingDuplicates(duplicatesFound);
        }

        return { added: newlyAdded.length, relinked: relinkedUpdates.size };
      } finally {
        setIsImporting(false);
        void refreshMissingBookIds();
      }
    },
    [
      books,
      missingBookIds,
      activeFilter,
      selectedTags,
      drilledViewFolder,
      updateLibraryState,
      notify,
      refreshMissingBookIds,
    ],
  );

  const handleAndroidPickFiles = useCallback(async () => {
    setAndroidImportMenuOpen(false);
    try {
      const picked = await pickAndroidBookDocuments(true);
      if (picked.cancelled || picked.files.length === 0) return;

      const supported = picked.files.filter(
        (f) => detectBookFormat(f.name) !== null,
      );
      if (supported.length === 0) {
        notify(
          "No supported e-books selected",
          "error",
          "Supports .epub, .pdf, and .mobi",
        );
        return;
      }

      const totalBytes = supported.reduce((s, f) => s + (f.size || 0), 0);
      const mode = await askAndroidStorageChoice(supported.length, totalBytes);
      if (!mode) return;

      await processAndroidPickedFiles(supported, mode);
    } catch (err) {
      notify(
        "Could not open Android file picker",
        "error",
        err instanceof Error ? err.message : undefined,
      );
    }
  }, [askAndroidStorageChoice, notify, processAndroidPickedFiles]);

  const scanSingleAndroidFolder = useCallback(
    async (
      folderUri: string,
      folderName?: string,
      silent = false,
    ): Promise<{ added: number; relinked: number }> => {
      setIsScanningAndroidFolders(true);
      try {
        const scanned = await scanAndroidBookFolder(folderUri);
        const existingMeta = getAndroidLinkedFolders().find(
          (f) => f.uri === folderUri,
        );
        const nextFolders = addOrUpdateAndroidLinkedFolder({
          uri: folderUri,
          name: folderName || existingMeta?.name || "Device Folder",
          addedAt: existingMeta?.addedAt ?? Date.now(),
          lastScannedAt: Date.now(),
          lastFoundCount: scanned.length,
        });
        setAndroidLinkedFolders(nextFolders);

        const mode: "link" | "copy" =
          androidImportMode === "always-copy" ? "copy" : "link";
        const result = await processAndroidPickedFiles(scanned, mode, {
          silent,
          skipDuplicatesSilently: true,
        });
        if (!silent && result.added === 0 && result.relinked === 0) {
          notify(
            `Scanned "${folderName || existingMeta?.name || "folder"}"`,
            "info",
            scanned.length === 0
              ? "No EPUB, PDF, or MOBI files found"
              : `${scanned.length} file${scanned.length === 1 ? "" : "s"} up to date`,
          );
        }
        return result;
      } catch (err) {
        if (!silent) {
          notify(
            "Folder scan failed",
            "error",
            err instanceof Error ? err.message : undefined,
          );
        }
        return { added: 0, relinked: 0 };
      } finally {
        setIsScanningAndroidFolders(false);
      }
    },
    [androidImportMode, notify, processAndroidPickedFiles],
  );

  const handleAndroidLinkFolder = useCallback(async () => {
    setAndroidImportMenuOpen(false);
    try {
      const picked = await pickAndroidBookFolder();
      if (picked.cancelled || !picked.uri) return;
      const folderName = picked.name || "Device Books";
      const nextFolders = addOrUpdateAndroidLinkedFolder({
        uri: picked.uri,
        name: folderName,
        addedAt: Date.now(),
        lastScannedAt: null,
      });
      setAndroidLinkedFolders(nextFolders);
      await scanSingleAndroidFolder(picked.uri, folderName, false);
    } catch (err) {
      notify(
        "Could not link Android folder",
        "error",
        err instanceof Error ? err.message : undefined,
      );
    }
  }, [notify, scanSingleAndroidFolder]);

  const handleScanAllAndroidFolders = useCallback(
    async (silent = false) => {
      const linked = getAndroidLinkedFolders();
      if (linked.length === 0) return;
      let totalAdded = 0;
      let totalRelinked = 0;
      for (const folder of linked) {
        const res = await scanSingleAndroidFolder(
          folder.uri,
          folder.name,
          true,
        );
        totalAdded += res.added;
        totalRelinked += res.relinked;
      }
      if (!silent) {
        if (totalAdded > 0 || totalRelinked > 0) {
          notify(
            `Folder scan complete (${totalAdded} linked, ${totalRelinked} relinked)`,
            "success",
          );
        } else {
          notify("All linked folders are up to date", "info");
        }
      }
    },
    [notify, scanSingleAndroidFolder],
  );

  // Silent Android linked-folder auto-scan once on mount if folders are already linked
  const hasAutoScannedAndroidRef = useRef(false);
  useEffect(() => {
    if (!isAndroidApp || hasAutoScannedAndroidRef.current) return;
    if (androidLinkedFolders.length === 0) return;
    hasAutoScannedAndroidRef.current = true;
    const timer = window.setTimeout(() => {
      void handleScanAllAndroidFolders(true);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [isAndroidApp, androidLinkedFolders.length, handleScanAllAndroidFolders]);

  // Unified Import entry point (Web -> native file picker; Android Capacitor -> SAF menu)
  const triggerLibraryImport = useCallback(() => {
    if (isAndroidApp) {
      setAndroidImportMenuOpen((v) => !v);
      return;
    }
    fileInputRef.current?.click();
  }, [isAndroidApp]);

  // Manual Relink for missing/Gist-synced books or replacing linked files
  const handleRelinkBook = useCallback(
    async (book: BookRecord): Promise<boolean> => {
      if (isAndroidApp) {
        try {
          const picked = await pickAndroidBookDocuments(false);
          if (picked.cancelled || picked.files.length === 0) return false;
          const safFile = picked.files[0];
          if (!detectBookFormat(safFile.name)) {
            notify(
              "Unsupported file format",
              "error",
              "Choose an .epub, .pdf, or .mobi file",
            );
            return false;
          }
          const choice = await askAndroidStorageChoice(
            1,
            safFile.size,
            `Relink "${book.title}"`,
          );
          if (!choice) return false;

          setIsImporting(true);
          try {
            const buffer = await readAndroidUriAsArrayBuffer(
              safFile.uri,
              safFile.size,
            );
            const { meta: metadata } =
              await extractBookImportMetadataFromBuffer(
                safFile.name,
                safFile.size,
                buffer,
              );

            const previousUri = book.externalUri;
            if (choice === "copy") {
              await libraryDb.saveBookFile(book.id, buffer, metadata.fileHash);
            }

            const updated: BookRecord = {
              ...book,
              storageMode: choice === "link" ? "android-uri" : "indexeddb",
              externalUri: choice === "link" ? safFile.uri : undefined,
              format: metadata.format,
              fileName: metadata.fileName,
              fileSize: metadata.fileSize,
              fileHash: metadata.fileHash,
              totalUnits: metadata.totalUnits,
              coverDataUrl: book.coverDataUrl ?? metadata.coverDataUrl,
            };
            handleUpdateBook(updated);

            if (
              previousUri &&
              previousUri !== updated.externalUri &&
              !books.some(
                (other) => other.id !== book.id && other.externalUri === previousUri,
              )
            ) {
              void releaseAndroidUri(previousUri);
            }

            await refreshMissingBookIds();
            notify(
              `${choice === "link" ? "Linked" : "Copied"} file for "${book.title}"`,
              "success",
            );
            return true;
          } finally {
            setIsImporting(false);
          }
        } catch (err) {
          notify(
            `Could not relink "${book.title}"`,
            "error",
            err instanceof Error ? err.message : undefined,
          );
          return false;
        }
      }

      relinkTargetBookRef.current = book;
      relinkFileInputRef.current?.click();
      return false;
    },
    [
      isAndroidApp,
      askAndroidStorageChoice,
      books,
      handleUpdateBook,
      notify,
      refreshMissingBookIds,
    ],
  );

  // Resolve duplicates from DuplicateImportModal
  const handleResolveDuplicates = useCallback(
    async (decisions: Record<string, DuplicateResolutionAction>) => {
      const additions: BookRecord[] = [];
      const replacements = new Map<string, BookRecord>();

      for (const item of pendingDuplicates) {
        const action = decisions[item.id] ?? "skip";
        const androidInfo = pendingDupAndroidRef.current.get(item.id);
        pendingDupAndroidRef.current.delete(item.id);
        if (action === "skip") continue;

        const useAndroidUri =
          isAndroidApp && androidInfo?.choice === "link" && androidInfo.uri;

        if (action === "replace") {
          if (!useAndroidUri) {
            await libraryDb.saveBookFile(
              item.existingBook.id,
              item.arrayBuffer,
              item.metadata.fileHash,
            );
          }
          replacements.set(item.existingBook.id, {
            ...item.existingBook,
            storageMode: useAndroidUri ? "android-uri" : "indexeddb",
            externalUri: useAndroidUri ? androidInfo.uri : undefined,
            format: item.metadata.format,
            fileName: item.metadata.fileName,
            fileSize: item.metadata.fileSize,
            fileHash: item.metadata.fileHash,
            totalUnits: item.metadata.totalUnits,
            coverDataUrl:
              item.existingBook.coverDataUrl ?? item.metadata.coverDataUrl,
          });
        } else if (action === "keep-both") {
          const newId = makeId("book");
          if (!useAndroidUri) {
            await libraryDb.saveBookFile(
              newId,
              item.arrayBuffer,
              item.metadata.fileHash,
            );
          }
          additions.push({
            id: newId,
            storageMode: useAndroidUri ? "android-uri" : "indexeddb",
            externalUri: useAndroidUri ? androidInfo.uri : undefined,
            format: item.metadata.format,
            fileName: item.metadata.fileName,
            fileSize: item.metadata.fileSize,
            fileHash: item.metadata.fileHash,
            title: item.metadata.title,
            subtitle: item.metadata.subtitle || undefined,
            author: item.metadata.author,
            description: item.metadata.description || undefined,
            publisher: item.metadata.publisher || undefined,
            language: item.metadata.language || undefined,
            year: item.metadata.year || undefined,
            status: "unread",
            isFavorite: false,
            categoryId: null,
            folderId: null,
            folderIds: [],
            tags: [],
            coverDataUrl: item.metadata.coverDataUrl,
            coverPaletteIndex: hashPaletteIndex(item.metadata.title),
            coverStyle: "editorial",
            progress: 0,
            totalUnits: item.metadata.totalUnits,
            currentLocation: {
              unitIndex: item.metadata.format === "pdf" ? 1 : 0,
              scrollRatio: 0,
            },
            addedAt: Date.now(),
            lastReadAt: null,
          });
        }
      }

      if (additions.length > 0 || replacements.size > 0) {
        updateLibraryState((prev) => ({
          books: [
            ...additions,
            ...prev.books.map((b) => replacements.get(b.id) ?? b),
          ],
        }));
        notify(
          `Resolved duplicates (${replacements.size} replaced, ${additions.length} added)`,
          "success",
        );
      }
      setPendingDuplicates([]);
      void refreshMissingBookIds();
    },
    [
      pendingDuplicates,
      isAndroidApp,
      updateLibraryState,
      notify,
      refreshMissingBookIds,
    ],
  );

  // Replace book binary file (from MetadataDrawer or StorageManagerModal) preserving metadata & notes
  const handleReplaceBookFile = useCallback(
    async (bookId: string, file: File) => {
      const target = books.find((b) => b.id === bookId);
      if (!target) return;
      const fmt = detectBookFormat(file.name);
      if (!fmt) {
        notify(
          "Unsupported file format",
          "error",
          "Choose an .epub, .pdf, or .mobi file",
        );
        return;
      }
      const { meta: metadata, buffer: arrayBuffer } =
        await extractBookImportMetadata(file);
      await libraryDb.saveBookFile(bookId, arrayBuffer, metadata.fileHash);

      const previousUri = target.externalUri;
      const updated: BookRecord = {
        ...target,
        storageMode: "indexeddb",
        externalUri: undefined,
        format: metadata.format,
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        fileHash: metadata.fileHash,
        totalUnits: metadata.totalUnits,
        coverDataUrl: target.coverDataUrl ?? metadata.coverDataUrl,
      };
      handleUpdateBook(updated);
      if (
        previousUri &&
        !books.some(
          (other) => other.id !== target.id && other.externalUri === previousUri,
        )
      ) {
        void releaseAndroidUri(previousUri);
      }
      await refreshMissingBookIds();
      notify(`Replaced file for "${target.title}"`, "success");
    },
    [books, handleUpdateBook, notify, refreshMissingBookIds],
  );

  // Folders & Categories CRUD
  const handleCreateFolder = useCallback(
    async (
      name: string,
      parentId: string | null = null,
      color: FolderColor = "neutral",
    ): Promise<FolderRecord> => {
      const created: FolderRecord = {
        id: makeId("fld"),
        name: name.trim() || "Untitled Folder",
        parentId,
        color,
        createdAt: Date.now(),
      };
      updateLibraryState((prev) => ({
        libraryFolders: [...prev.libraryFolders, created],
      }));
      return created;
    },
    [updateLibraryState],
  );

  const handleUpdateFolder = useCallback(
    (id: string, patch: { name?: string; color?: FolderColor }) => {
      updateLibraryState((prev) => ({
        libraryFolders: prev.libraryFolders.map((f) =>
          f.id === id ? { ...f, ...patch } : f,
        ),
      }));
    },
    [updateLibraryState],
  );

  const handleDeleteFolder = useCallback(
    (id: string) => {
      const descendants = getFolderDescendantIds(folders, id);
      updateLibraryState((prev) => ({
        libraryFolders: prev.libraryFolders.filter(
          (f) => !descendants.has(f.id),
        ),
        books: prev.books.map((b) => {
          const remaining = getBookFolderIds(b).filter(
            (fid) => !descendants.has(fid),
          );
          return withBookFolderIds(b, remaining);
        }),
      }));
      if (activeFilter.kind === "folder" && descendants.has(activeFilter.id)) {
        setActiveFilter({ kind: "smart", id: "all" });
      }
    },
    [folders, activeFilter, updateLibraryState],
  );

  const handleCreateCategory = useCallback(
    async (name: string): Promise<CategoryRecord> => {
      const created: CategoryRecord = {
        id: makeId("cat"),
        name: name.trim() || "Untitled Category",
        createdAt: Date.now(),
      };
      updateLibraryState((prev) => ({
        libraryCategories: [...prev.libraryCategories, created],
      }));
      return created;
    },
    [updateLibraryState],
  );

  const handleDeleteCategory = useCallback(
    (id: string) => {
      updateLibraryState((prev) => ({
        libraryCategories: prev.libraryCategories.filter((c) => c.id !== id),
        books: prev.books.map((b) =>
          b.categoryId === id ? { ...b, categoryId: null } : b,
        ),
      }));
      if (activeFilter.kind === "category" && activeFilter.id === id) {
        setActiveFilter({ kind: "smart", id: "all" });
      }
    },
    [activeFilter, updateLibraryState],
  );

  // Per-View Folders CRUD
  const handleCreateViewFolder = useCallback(
    async (name: string): Promise<ViewFolderRecord> => {
      const created: ViewFolderRecord = {
        id: makeId("vf"),
        viewKey: activeViewKey,
        name: name.trim() || "New Shelf",
        bookIds: [],
        createdAt: Date.now(),
      };
      updateLibraryState((prev) => ({
        libraryViewFolders: [...prev.libraryViewFolders, created],
      }));
      return created;
    },
    [activeViewKey, updateLibraryState],
  );

  const handleRenameViewFolder = useCallback(
    (folderId: string, name: string) => {
      updateLibraryState((prev) => ({
        libraryViewFolders: prev.libraryViewFolders.map((vf) =>
          vf.id === folderId ? { ...vf, name: name.trim() || vf.name } : vf,
        ),
      }));
    },
    [updateLibraryState],
  );

  const handleDeleteViewFolder = useCallback(
    (folderId: string) => {
      updateLibraryState((prev) => ({
        libraryViewFolders: prev.libraryViewFolders.filter(
          (vf) => vf.id !== folderId,
        ),
      }));
      if (drilledViewFolderId === folderId) setDrilledViewFolderId(null);
    },
    [drilledViewFolderId, updateLibraryState],
  );

  const handleSaveViewFolderBooks = useCallback(
    (folderId: string, nextBookIds: string[]) => {
      updateLibraryState((prev) => ({
        libraryViewFolders: prev.libraryViewFolders.map((vf) =>
          vf.id === folderId
            ? { ...vf, bookIds: Array.from(new Set(nextBookIds)) }
            : vf,
        ),
      }));
    },
    [updateLibraryState],
  );

  const handleToggleViewFolderMembership = useCallback(
    (bookIds: string[], folderId: string, add: boolean) => {
      const idSet = new Set(bookIds);
      updateLibraryState((prev) => ({
        libraryViewFolders: prev.libraryViewFolders.map((vf) => {
          if (vf.id !== folderId) return vf;
          const next = add
            ? Array.from(new Set([...vf.bookIds, ...bookIds]))
            : vf.bookIds.filter((id) => !idSet.has(id));
          return { ...vf, bookIds: next };
        }),
      }));
    },
    [updateLibraryState],
  );

  const handleToggleSidebarFolderMembership = useCallback(
    (bookIds: string[], folderId: string, add: boolean) => {
      const idSet = new Set(bookIds);
      updateLibraryState((prev) => ({
        books: prev.books.map((b) => {
          if (!idSet.has(b.id)) return b;
          const current = getBookFolderIds(b);
          const next = add
            ? Array.from(new Set([...current, folderId]))
            : current.filter((fid) => fid !== folderId);
          return withBookFolderIds(b, next);
        }),
      }));
    },
    [updateLibraryState],
  );

  // Drag-Drop Book to Sidebar Folder (asks Add vs Move if already in another folder)
  const handleDropBooksToSidebarFolder = useCallback(
    (bookIds: string[], targetFolderId: string) => {
      const targetFolder = folders.find((f) => f.id === targetFolderId);
      if (!targetFolder || bookIds.length === 0) return;

      const droppedBooks = books.filter((b) => bookIds.includes(b.id));
      const existingFolderIds = new Set<string>();
      for (const b of droppedBooks) {
        for (const fid of getBookFolderIds(b)) {
          if (fid !== targetFolderId) existingFolderIds.add(fid);
        }
      }

      if (existingFolderIds.size > 0) {
        const existingNames = Array.from(existingFolderIds)
          .map((fid) => folders.find((f) => f.id === fid)?.name)
          .filter((n): n is string => Boolean(n));
        setPendingFolderDrop({
          kind: "sidebar",
          targetFolderId,
          targetFolderName: targetFolder.name,
          bookIds,
          bookTitles: droppedBooks.map((b) => b.title),
          existingFolderNames: existingNames,
        });
      } else {
        handleToggleSidebarFolderMembership(bookIds, targetFolderId, true);
        notify(`Added to "${targetFolder.name}"`, "success");
      }
    },
    [folders, books, handleToggleSidebarFolderMembership, notify],
  );

  // Drag-Drop Book to View Folder (asks Add vs Move if already in another view folder)
  const handleDropBooksToViewFolder = useCallback(
    (bookIds: string[], targetFolderId: string) => {
      const targetVf = currentViewFolders.find(
        (vf) => vf.id === targetFolderId,
      );
      if (!targetVf || bookIds.length === 0) return;

      const droppedBooks = books.filter((b) => bookIds.includes(b.id));
      const otherViewFolders = currentViewFolders.filter(
        (vf) =>
          vf.id !== targetFolderId &&
          vf.bookIds.some((bid) => bookIds.includes(bid)),
      );

      if (otherViewFolders.length > 0) {
        setPendingFolderDrop({
          kind: "view",
          targetFolderId,
          targetFolderName: targetVf.name,
          bookIds,
          bookTitles: droppedBooks.map((b) => b.title),
          existingFolderNames: otherViewFolders.map((vf) => vf.name),
        });
      } else {
        handleToggleViewFolderMembership(bookIds, targetFolderId, true);
        notify(`Filed into "${targetVf.name}"`, "success");
      }
    },
    [currentViewFolders, books, handleToggleViewFolderMembership, notify],
  );

  const handleConfirmFolderDrop = useCallback(
    (mode: "add" | "move") => {
      if (!pendingFolderDrop) return;
      const { kind, targetFolderId, targetFolderName, bookIds } =
        pendingFolderDrop;
      const idSet = new Set(bookIds);

      if (kind === "sidebar") {
        updateLibraryState((prev) => ({
          books: prev.books.map((b) => {
            if (!idSet.has(b.id)) return b;
            const next =
              mode === "move"
                ? [targetFolderId]
                : Array.from(new Set([...getBookFolderIds(b), targetFolderId]));
            return withBookFolderIds(b, next);
          }),
        }));
      } else {
        updateLibraryState((prev) => ({
          libraryViewFolders: prev.libraryViewFolders.map((vf) => {
            if (vf.viewKey !== activeViewKey) return vf;
            if (vf.id === targetFolderId) {
              return {
                ...vf,
                bookIds: Array.from(new Set([...vf.bookIds, ...bookIds])),
              };
            }
            if (mode === "move") {
              return {
                ...vf,
                bookIds: vf.bookIds.filter((bid) => !idSet.has(bid)),
              };
            }
            return vf;
          }),
        }));
      }

      notify(
        `${mode === "move" ? "Moved" : "Added"} to "${targetFolderName}"`,
        "success",
      );
      setPendingFolderDrop(null);
    },
    [pendingFolderDrop, activeViewKey, updateLibraryState, notify],
  );

  // Bulk Edit & Mobile Organize apply
  const handleApplyBulkEdit = useCallback(
    (patch: BulkEditPatch) => {
      const targetIds = new Set(selectedIds);
      if (targetIds.size === 0) return;

      updateLibraryState((prev) => {
        const nextBooks = prev.books.map((b) => {
          if (!targetIds.has(b.id)) return b;
          let updated = { ...b };

          const folderSet = new Set(getBookFolderIds(updated));
          for (const fid of patch.addSidebarFolderIds) folderSet.add(fid);
          for (const fid of patch.removeSidebarFolderIds) folderSet.delete(fid);
          updated = withBookFolderIds(updated, Array.from(folderSet));

          const tagSet = new Set(updated.tags);
          for (const t of patch.addTags) tagSet.add(t);
          for (const t of patch.removeTags) tagSet.delete(t);
          updated.tags = Array.from(tagSet);

          if (patch.subtitle !== undefined) updated.subtitle = patch.subtitle;
          if (patch.author !== undefined) updated.author = patch.author;
          if (patch.series !== undefined) updated.series = patch.series;
          if (patch.publisher !== undefined)
            updated.publisher = patch.publisher;
          if (patch.language !== undefined) updated.language = patch.language;

          if (patch.categoryAction === "set")
            updated.categoryId = patch.categoryId;
          else if (patch.categoryAction === "clear") updated.categoryId = null;

          if (patch.statusAction !== "keep")
            updated.status = patch.statusAction;
          if (patch.favoriteAction === "favorite") updated.isFavorite = true;
          else if (patch.favoriteAction === "unfavorite")
            updated.isFavorite = false;

          if (patch.resetProgress) {
            updated.progress = 0;
            updated.status = "unread";
            updated.currentLocation = {
              unitIndex: updated.format === "pdf" ? 1 : 0,
              scrollRatio: 0,
            };
          }
          return updated;
        });

        const nextViewFolders = prev.libraryViewFolders.map((vf) => {
          let ids = [...vf.bookIds];
          if (patch.addViewFolderIds.includes(vf.id)) {
            ids = Array.from(new Set([...ids, ...targetIds]));
          }
          if (patch.removeViewFolderIds.includes(vf.id)) {
            ids = ids.filter((id) => !targetIds.has(id));
          }
          return { ...vf, bookIds: ids };
        });

        return { books: nextBooks, libraryViewFolders: nextViewFolders };
      });

      setBulkEditOpen(false);
      notify(`Updated ${targetIds.size} books`, "success");
    },
    [selectedIds, updateLibraryState, notify],
  );

  const handleApplyMobileOrganize = useCallback(
    (payload: MobileOrganizePayload) => {
      const targetIds = new Set(payload.bookIds);
      if (targetIds.size === 0) return;

      updateLibraryState((prev) => {
        const nextBooks = prev.books.map((b) => {
          if (!targetIds.has(b.id)) return b;
          const folderSet = new Set(getBookFolderIds(b));
          for (const fid of payload.addToSidebarFolderIds) folderSet.add(fid);
          for (const fid of payload.removeFromSidebarFolderIds)
            folderSet.delete(fid);
          let updated = withBookFolderIds(b, Array.from(folderSet));

          if (payload.categoryChange.mode === "set") {
            updated.categoryId = payload.categoryChange.categoryId;
          } else if (payload.categoryChange.mode === "clear") {
            updated.categoryId = null;
          }

          if (payload.addTags.length > 0 || payload.removeTags.length > 0) {
            const tagSet = new Set(updated.tags);
            for (const t of payload.addTags) tagSet.add(t);
            for (const t of payload.removeTags) tagSet.delete(t);
            updated.tags = Array.from(tagSet);
          }

          return updated;
        });

        const nextViewFolders = prev.libraryViewFolders.map((vf) => {
          let ids = [...vf.bookIds];
          if (payload.addToViewFolderIds.includes(vf.id)) {
            ids = Array.from(new Set([...ids, ...targetIds]));
          }
          if (payload.removeFromViewFolderIds.includes(vf.id)) {
            ids = ids.filter((id) => !targetIds.has(id));
          }
          return { ...vf, bookIds: ids };
        });

        return { books: nextBooks, libraryViewFolders: nextViewFolders };
      });

      setOrganizeTargetIds(null);
      notify(
        payload.bookIds.length === 1
          ? "Book organization updated"
          : `Organized ${payload.bookIds.length} books`,
        "success",
      );
    },
    [updateLibraryState, notify],
  );

  // Selection with Shift-range support
  const handleToggleSelectBook = useCallback(
    (bookId: string, shiftKey: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastClickedBookIdRef.current) {
          const orderedIds = visibleBooks.map((b) => b.id);
          const fromIdx = orderedIds.indexOf(lastClickedBookIdRef.current);
          const toIdx = orderedIds.indexOf(bookId);
          if (fromIdx !== -1 && toIdx !== -1) {
            const [start, end] =
              fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
            for (let i = start; i <= end; i++) {
              next.add(orderedIds[i]);
            }
            return next;
          }
        }
        if (next.has(bookId)) next.delete(bookId);
        else next.add(bookId);
        lastClickedBookIdRef.current = bookId;
        return next;
      });
    },
    [visibleBooks],
  );

  // Highlights Hub edits
  const handleUpdateHighlight = useCallback(
    async (updated: HighlightRecord) => {
      await libraryDb.saveHighlight(updated);
      updateLibraryState((prev) => ({
        bookHighlights: prev.bookHighlights.map((h) =>
          h.id === updated.id ? updated : h,
        ),
      }));
    },
    [updateLibraryState],
  );

  const handleDeleteHighlight = useCallback(
    async (id: string) => {
      await libraryDb.deleteHighlight(id);
      updateLibraryState((prev) => ({
        bookHighlights: prev.bookHighlights.filter((h) => h.id !== id),
      }));
      notify("Highlight deleted", "info");
    },
    [updateLibraryState, notify],
  );

  // Full ZIP Backup Export & Import
  const handleExportBackup = useCallback(async () => {
    setIsExportingBackup(true);
    try {
      const zipBlob = await exportLibraryBackupZip({
        books,
        folders,
        categories,
        viewFolders,
        bookmarks,
        highlights,
      });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kanso-library-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      notify("Library ZIP backup exported", "success");
    } catch (err) {
      notify(
        "Backup export failed",
        "error",
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setIsExportingBackup(false);
    }
  }, [books, folders, categories, viewFolders, bookmarks, highlights, notify]);

  const handleSelectBackupFile = useCallback(
    async (file: File) => {
      setIsParsingBackup(true);
      try {
        const parsed = await parseLibraryBackupZip(file);
        setPendingBackupArchive(parsed);
      } catch (err) {
        notify(
          "Could not read backup archive",
          "error",
          err instanceof Error ? err.message : undefined,
        );
      } finally {
        setIsParsingBackup(false);
      }
    },
    [notify],
  );

  const handleConfirmRestoreBackup = useCallback(
    async (mode: "merge" | "replace") => {
      if (!pendingBackupArchive) return;
      setIsRestoringBackup(true);
      try {
        const { snapshot } = pendingBackupArchive;
        if (mode === "replace") {
          await libraryDb.clearAllData();
        }

        for (const entry of snapshot.files) {
          const sha = await computeSha256Hex(entry.data);
          await libraryDb.saveBookFile(entry.bookId, entry.data, sha);
        }

        if (mode === "replace") {
          await libraryDb.replaceAllAnnotations(
            snapshot.bookmarks,
            snapshot.highlights,
          );
          updateLibraryState(() => ({
            books: snapshot.books,
            libraryFolders: snapshot.folders,
            libraryCategories: snapshot.categories,
            libraryViewFolders: snapshot.viewFolders,
            bookBookmarks: snapshot.bookmarks,
            bookHighlights: snapshot.highlights,
          }));
        } else {
          for (const bm of snapshot.bookmarks) await libraryDb.saveBookmark(bm);
          for (const hl of snapshot.highlights)
            await libraryDb.saveHighlight(hl);

          updateLibraryState((prev) => {
            const mergeById = <T extends { id: string }>(
              existing: T[],
              incoming: T[],
            ): T[] => {
              const map = new Map(existing.map((i) => [i.id, i]));
              for (const item of incoming) map.set(item.id, item);
              return Array.from(map.values());
            };
            return {
              books: mergeById(prev.books, snapshot.books),
              libraryFolders: mergeById(prev.libraryFolders, snapshot.folders),
              libraryCategories: mergeById(
                prev.libraryCategories,
                snapshot.categories,
              ),
              libraryViewFolders: mergeById(
                prev.libraryViewFolders,
                snapshot.viewFolders,
              ),
              bookBookmarks: mergeById(prev.bookBookmarks, snapshot.bookmarks),
              bookHighlights: mergeById(
                prev.bookHighlights,
                snapshot.highlights,
              ),
            };
          });
        }

        setPendingBackupArchive(null);
        notify(
          mode === "replace"
            ? `Restored ${snapshot.books.length} books from backup`
            : `Merged ${snapshot.books.length} books from backup`,
          "success",
        );
      } catch (err) {
        notify(
          "Backup restore failed",
          "error",
          err instanceof Error ? err.message : undefined,
        );
      } finally {
        setIsRestoringBackup(false);
      }
    },
    [pendingBackupArchive, updateLibraryState, notify],
  );

  // Active folder removal context (for Drag Dock & Context Menu)
  const activeFolderRemovalTarget = useMemo(() => {
    if (drilledViewFolder) {
      return {
        kind: "view" as const,
        id: drilledViewFolder.id,
        name: drilledViewFolder.name,
      };
    }
    if (activeFilter.kind === "folder") {
      const f = folders.find((item) => item.id === activeFilter.id);
      if (f) return { kind: "sidebar" as const, id: f.id, name: f.name };
    }
    return null;
  }, [drilledViewFolder, activeFilter, folders]);

  const handleRemoveBooksFromCurrentFolder = useCallback(
    (bookIds: string[]) => {
      if (!activeFolderRemovalTarget) return;
      if (activeFolderRemovalTarget.kind === "view") {
        handleToggleViewFolderMembership(
          bookIds,
          activeFolderRemovalTarget.id,
          false,
        );
      } else {
        handleToggleSidebarFolderMembership(
          bookIds,
          activeFolderRemovalTarget.id,
          false,
        );
      }
      notify(`Removed from "${activeFolderRemovalTarget.name}"`, "info");
    },
    [
      activeFolderRemovalTarget,
      handleToggleViewFolderMembership,
      handleToggleSidebarFolderMembership,
      notify,
    ],
  );

  const hasActiveFilters =
    formatFilter !== "all" ||
    selectedTags.length > 0 ||
    searchQuery.trim().length > 0 ||
    prefs.groupBy !== "none";

  // Notes linked to the currently active Reader book
  const activeBookNotes = useMemo(() => {
    if (!activeBook) return [];
    return workspace.entries.filter(
      (e) => e.type === "note" && e.bookLink?.bookId === activeBook.id,
    );
  }, [workspace.entries, activeBook]);

  const linkedNotesCountForPendingDelete = useMemo(() => {
    if (booksPendingDelete.length === 0) return 0;
    const pendingSet = new Set(booksPendingDelete.map((b) => b.id));
    return workspace.entries.filter(
      (e) =>
        e.type === "note" &&
        e.bookLink?.bookId &&
        pendingSet.has(e.bookLink.bookId),
    ).length;
  }, [workspace.entries, booksPendingDelete]);

  // If a book tab is active, render the full Reader Studio viewport
  if (activeBook) {
    return (
      <div className="h-[calc(100dvh-6.75rem)] lg:h-dvh w-full overflow-hidden">
        <ReaderView
          book={activeBook}
          openBooks={openBooks}
          prefs={prefs.reader}
          zenMode={zenMode}
          jumpRequest={jumpRequest}
          bookNotes={activeBookNotes}
          onCreateBookNote={({
            title,
            content,
            bookLink,
          }: {
            title: string;
            content: string;
            bookLink: BookNoteLink;
          }) => {
            const created = addNotePage({
              title,
              content,
              icon: "📖",
              noteStatus: "active",
              bookLink,
            });
            notify("Book note saved", "success");
            return created;
          }}
          onDeleteBookNote={(noteId) => {
            deleteEntry(noteId);
          }}
          onOpenNoteDetail={(noteId) => {
            onOpenDetail?.({ mode: "note", id: noteId });
          }}
          onToggleZenMode={onToggleZenMode}
          onUpdatePrefs={updateReaderPrefs}
          onResetPrefs={resetReaderPrefs}
          onToggleTheme={handleCycleReaderSurface}
          onBookProgressUpdate={handleUpdateBook}
          onSelectLibrary={() => setActiveBookId(null)}
          onSelectBookTab={(id) => setActiveBookId(id)}
          onCloseBookTab={handleCloseBookTab}
          onSendHighlightToNotes={(
            bookTitle,
            excerpt,
            locationLabel,
            linkMeta,
          ) => {
            sendBookExcerptToNotes(bookTitle, excerpt, locationLabel, linkMeta);
          }}
          onNarrationStart={onMuteBackgroundStreamer}
          onAnnotationsChange={() => void syncLibraryAnnotationsFromDb()}
          onRelinkBook={handleRelinkBook}
          onNotify={(title, tone) => notify(title, tone)}
        />
      </div>
    );
  }

  return (
    <div
      className="h-[calc(100dvh-6.75rem)] lg:h-dvh flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] overflow-hidden relative"
      onDragEnter={(e) => {
        if (isPureExternalFileDrag(e.dataTransfer)) {
          e.preventDefault();
          setIsFileDragActive(true);
        }
      }}
      onDragOver={(e) => {
        if (isPureExternalFileDrag(e.dataTransfer)) {
          e.preventDefault();
          setIsFileDragActive(true);
        } else if (isFileDragActive) {
          setIsFileDragActive(false);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsFileDragActive(false);
        }
      }}
      onDrop={(e) => {
        if (
          isPureExternalFileDrag(e.dataTransfer) &&
          e.dataTransfer.files?.length > 0
        ) {
          e.preventDefault();
          setIsFileDragActive(false);
          void handleImportFiles(e.dataTransfer.files);
        } else {
          setIsFileDragActive(false);
        }
      }}
    >
      {/* Hidden File Importer & Relinker */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".epub,.pdf,.mobi,.prc,.azw,application/epub+zip,application/pdf"
        onChange={(e) => {
          if (e.target.files) void handleImportFiles(e.target.files);
          e.target.value = "";
        }}
        className="hidden"
      />
      <input
        ref={relinkFileInputRef}
        type="file"
        accept=".epub,.pdf,.mobi,.prc,.azw,application/epub+zip,application/pdf"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const target = relinkTargetBookRef.current;
          relinkTargetBookRef.current = null;
          if (!file || !target) return;
          await handleReplaceBookFile(target.id, file);
        }}
        className="hidden"
      />

      {/* Multi-Book Tab Strip (visible whenever 1+ books are open in Reader tabs) */}
      <ReaderTabStrip
        openBooks={openBooks}
        activeBookId={null}
        onSelectLibrary={() => setActiveBookId(null)}
        onSelectBook={(id) => setActiveBookId(id)}
        onCloseBookTab={handleCloseBookTab}
      />

      {/* Main Library Studio Shell: Full-Width Shelf + Optional Split Inspector */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Center Library Workspace */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Bar 1: Compact Unified Header (52px) */}
          <header className="h-[52px] px-4 sm:px-6 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex items-center justify-between gap-2 sm:gap-3 shrink-0">
            {/* Left: Active View Title + Inline Count */}
            <div className="flex items-baseline gap-2.5 min-w-0">
              <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight text-[var(--text-primary)] truncate">
                {drilledViewFolder ? drilledViewFolder.name : activeViewLabel}
              </h1>
              <span className="font-mono tabular-nums text-xs text-[var(--text-muted)] shrink-0">
                {activeFilter.kind === "smart" &&
                activeFilter.id === "highlights"
                  ? highlights.length
                  : visibleBooks.length}
              </span>
            </div>

            {/* Right: Active Folder/Category Actions + Inspector + Primary Import CTA */}
            <div className="flex items-center gap-1.5 shrink-0">
              {!drilledViewFolder &&
                activeFilter.kind === "folder" &&
                (() => {
                  const activeFolder = folders.find(
                    (f) => f.id === activeFilter.id,
                  );
                  if (!activeFolder) return null;
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setFolderModal({ mode: "edit", folder: activeFolder })
                        }
                        title="Edit folder"
                        className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFolder(activeFolder.id)}
                        title="Delete folder (books are preserved)"
                        className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--danger)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    </>
                  );
                })()}

              {!drilledViewFolder &&
                activeFilter.kind === "category" &&
                (() => {
                  const activeCategory = categories.find(
                    (c) => c.id === activeFilter.id,
                  );
                  if (!activeCategory) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(activeCategory.id)}
                      title="Delete category"
                      className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--danger)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  );
                })()}

              {!(
                activeFilter.kind === "smart" &&
                activeFilter.id === "highlights"
              ) && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !inspectorOpen;
                    setInspectorOpen(next);
                    if (next && !inspectedBookId && visibleBooks[0]) {
                      setInspectedBookId(visibleBooks[0].id);
                    }
                  }}
                  title="Toggle Book Inspector pane"
                  aria-label="Toggle Book Inspector"
                  className={`hidden md:inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    inspectorOpen
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <PanelRight className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Inspector</span>
                </button>
              )}

              {/* Primary Import CTA */}
              <div className="relative">
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={triggerLibraryImport}
                  title={
                    drilledViewFolder
                      ? `Import Here "${drilledViewFolder.name}"`
                      : activeFilter.kind === "folder"
                        ? `Import Here "${activeViewLabel}"`
                        : "Import Books"
                  }
                  className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {isImporting
                      ? "Importing…"
                      : drilledViewFolder || activeFilter.kind === "folder"
                        ? "Import Here"
                        : "Import"}
                  </span>
                  {isAndroidApp && <ChevronDown className="w-3 h-3 opacity-80" />}
                </button>

                {isAndroidApp && androidImportMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setAndroidImportMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-10 z-40 w-64 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-xl p-1.5 space-y-1">
                      <button
                        type="button"
                        onClick={() => void handleAndroidPickFiles()}
                        className="w-full min-h-[44px] px-3 py-2 rounded-lg text-left flex items-center gap-2.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      >
                        <FileText className="w-4 h-4 text-[var(--accent)] shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--text-primary)]">
                            Pick E-Book Files
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            Link or copy EPUB, PDF, MOBI
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleAndroidLinkFolder()}
                        className="w-full min-h-[44px] px-3 py-2 rounded-lg text-left flex items-center gap-2.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      >
                        <FolderPlus className="w-4 h-4 text-[var(--accent)] shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--text-primary)]">
                            Link Device Folder
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            Auto-scan folder without copying
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAndroidImportMenuOpen(false);
                          setAndroidFolderManagerOpen(true);
                        }}
                        className="w-full min-h-[44px] px-3 py-2 rounded-lg text-left flex items-center justify-between gap-2 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <FolderOpen className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                          <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                            Linked Folders
                          </span>
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-[var(--text-muted)]">
                          {androidLinkedFolders.length}
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* Horizontal Scrolling Shelf Strip (Smart Shelves + Folders + Categories) */}
          <LibraryShelfStrip
            books={books}
            folders={folders}
            categories={categories}
            totalHighlightsCount={highlights.length}
            activeFilter={activeFilter}
            onSelectFilter={(filter) => setActiveFilter(filter)}
            onRequestCreateFolder={() => setFolderModal({ mode: "create" })}
            onDropBooksToFolder={handleDropBooksToSidebarFolder}
            onDropBooksToCategory={(bookIds, categoryId) => {
              const set = new Set(bookIds);
              updateLibraryState((prev) => ({
                books: prev.books.map((b) =>
                  set.has(b.id) ? { ...b, categoryId } : b,
                ),
              }));
              notify("Category updated", "success");
            }}
            onDropBooksToFavorites={(bookIds) => {
              const set = new Set(bookIds);
              updateLibraryState((prev) => ({
                books: prev.books.map((b) =>
                  set.has(b.id) ? { ...b, isFavorite: true } : b,
                ),
              }));
              notify("Added to Favorites", "success");
            }}
          />

          {/* Bar 2: Unified 32px Control Toolbar (Search · Sort · View · Options ▾ · Select) */}
          {!(
            activeFilter.kind === "smart" && activeFilter.id === "highlights"
          ) && (
            <div className="px-4 sm:px-6 pt-4 border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 flex flex-wrap items-center justify-between gap-2 shrink-0">
              {/* Left: Drill-down Breadcrumb + Unified Search + Active Tag Chips */}
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[200px]">
                {drilledViewFolder && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDrilledViewFolderId(null)}
                      className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAddingBooksToViewFolder(drilledViewFolder)
                      }
                      className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>Add Books</span>
                    </button>
                  </div>
                )}

                <div className="relative flex-1 min-w-[160px] max-w-xs">
                  <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter titles, authors, tags…"
                    className="w-full h-8 pl-8 pr-12 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCommandPaletteOpen(true)}
                      title="Command Palette (Cmd/Ctrl+K)"
                      className="hidden sm:inline-flex items-center gap-0.5 absolute right-1.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono tabular-nums rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <Command className="w-2.5 h-2.5" />
                      <span>K</span>
                    </button>
                  )}
                </div>

                {selectedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setSelectedTags((prev) => prev.filter((t) => t !== tag))
                    }
                    className="inline-flex items-center gap-1 h-7 px-2 text-[11px] rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)] cursor-pointer"
                  >
                    <span>#{tag}</span>
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>

              {/* Right: Sort · View · Options ▾ · Select (Unified 32px Controls) */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Desktop Sort + Direction */}
                <div className="hidden lg:flex items-center gap-1">
                  <select
                    value={prefs.sortField}
                    onChange={(e) => {
                      const nextField = e.target.value as SortField;
                      updateUiPrefs(
                        nextField === "custom"
                          ? { sortField: "custom", sortDirection: "asc" }
                          : { sortField: nextField },
                      );
                    }}
                    aria-label="Sort books by"
                    className="h-8 px-2.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] outline-none cursor-pointer"
                  >
                    <option value="custom">Sort: Custom Order</option>
                    <option value="lastReadAt">Sort: Recently Read</option>
                    <option value="addedAt">Sort: Date Added</option>
                    <option value="title">Sort: Title</option>
                    <option value="author">Sort: Author</option>
                    <option value="progress">Sort: Progress</option>
                    <option value="fileSize">Sort: File Size</option>
                    <option value="year">Sort: Year</option>
                  </select>

                  <button
                    type="button"
                    disabled={prefs.sortField === "custom"}
                    onClick={() =>
                      updateUiPrefs({
                        sortDirection:
                          prefs.sortDirection === "asc" ? "desc" : "asc",
                      })
                    }
                    title={
                      prefs.sortField === "custom"
                        ? "Custom order — drag books to rearrange"
                        : prefs.sortDirection === "asc"
                          ? "Ascending order"
                          : "Descending order"
                    }
                    aria-label={
                      prefs.sortField === "custom"
                        ? "Custom drag order active"
                        : "Toggle sort direction"
                    }
                    className={`h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] ${
                      prefs.sortField === "custom"
                        ? "text-[var(--accent)] opacity-80 cursor-default"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    }`}
                  >
                    {prefs.sortField === "custom" ? (
                      <GripVertical className="w-3.5 h-3.5" />
                    ) : prefs.sortDirection === "asc" ? (
                      <ArrowUpNarrowWide className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownWideNarrow className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Desktop View Mode Segmented Control */}
                <div className="hidden lg:inline-flex items-center h-8 p-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                  <button
                    type="button"
                    onClick={() => updateUiPrefs({ viewMode: "grid" })}
                    title="Grid view"
                    aria-label="Grid view"
                    className={`h-full px-2 rounded-md transition-colors cursor-pointer ${
                      prefs.viewMode === "grid"
                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateUiPrefs({ viewMode: "table" })}
                    title="Table view"
                    aria-label="Table view"
                    className={`h-full px-2 rounded-md transition-colors cursor-pointer ${
                      prefs.viewMode === "table"
                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Consolidated Options Popover (Format, Group, Display, Tags, Categories, Storage, Backup) */}
                {(() => {
                  const activeOptionsCount =
                    (formatFilter !== "all" ? 1 : 0) +
                    (prefs.groupBy !== "none" ? 1 : 0) +
                    selectedTags.length;
                  const totalBytes = books.reduce(
                    (sum, b) => sum + (b.fileSize || 0),
                    0,
                  );

                  return (
                    <div className="hidden lg:block relative">
                      <button
                        type="button"
                        onClick={() => setDisplayPopoverOpen((v) => !v)}
                        title="Format, grouping, cover display, tags, backup & storage"
                        className={`inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                          displayPopoverOpen || activeOptionsCount > 0
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>Options</span>
                        {activeOptionsCount > 0 && (
                          <span className="font-mono tabular-nums text-[10px] px-1 rounded bg-[var(--accent)] text-[var(--accent-contrast)]">
                            {activeOptionsCount}
                          </span>
                        )}
                        <ChevronDown className="w-3 h-3 opacity-70" />
                      </button>

                      {displayPopoverOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-30"
                            onClick={() => setDisplayPopoverOpen(false)}
                          />
                          <div className="absolute right-0 top-10 z-40">
                            <LibraryOptionsPopover
                              formatFilter={formatFilter}
                              groupBy={prefs.groupBy}
                              coverSize={prefs.coverSize}
                              cardDetails={prefs.cardDetails}
                              allTags={allTags}
                              selectedTags={selectedTags}
                              categories={categories}
                              activeFilter={activeFilter}
                              totalBytes={totalBytes}
                              isExportingBackup={isExportingBackup}
                              isParsingBackup={isParsingBackup}
                              onFormatFilterChange={setFormatFilter}
                              onGroupByChange={(groupBy) =>
                                updateUiPrefs({ groupBy })
                              }
                              onCoverSizeChange={(coverSize) =>
                                updateUiPrefs({ coverSize })
                              }
                              onCardDetailsChange={updateCardDetails}
                              onToggleTag={(tag) =>
                                setSelectedTags((prev) =>
                                  prev.includes(tag)
                                    ? prev.filter((t) => t !== tag)
                                    : [...prev, tag],
                                )
                              }
                              onClearTags={() => setSelectedTags([])}
                              onSelectCategory={(categoryId) =>
                                setActiveFilter({
                                  kind: "category",
                                  id: categoryId,
                                })
                              }
                              onCreateCategory={(name) => {
                                void handleCreateCategory(name);
                              }}
                              onDeleteCategory={handleDeleteCategory}
                              onExportBackup={() => void handleExportBackup()}
                              onSelectImportBackupFile={(file) =>
                                void handleSelectBackupFile(file)
                              }
                              onOpenStorageManager={() =>
                                setStorageManagerOpen(true)
                              }
                              onClose={() => setDisplayPopoverOpen(false)}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* Desktop Multi-Select Toggle */}
                {visibleBooks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedIds.size > 0) setSelectedIds(new Set());
                      else setSelectedIds(new Set([visibleBooks[0].id]));
                    }}
                    title={
                      selectedIds.size > 0
                        ? "Exit selection"
                        : "Select multiple books"
                    }
                    className={`hidden lg:inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                      selectedIds.size > 0
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>
                      {selectedIds.size > 0
                        ? `${selectedIds.size} selected`
                        : "Select"}
                    </span>
                  </button>
                )}

                {/* Mobile Filter/Sort Trigger (<lg) */}
                <button
                  type="button"
                  onClick={() => setMobileFilterSheetOpen(true)}
                  aria-label="Filter, sort, and display options"
                  className={`lg:hidden h-8 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    hasActiveFilters
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Options</span>
                </button>
              </div>
            </div>
          )}

          {/* Main Scrollable Content Area */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {activeFilter.kind === "smart" &&
            activeFilter.id === "highlights" ? (
              <HighlightsHubView
                books={books}
                highlights={highlights}
                onOpenPassage={(book, unitIndex) =>
                  handleOpenBook(book, unitIndex)
                }
                onUpdateHighlight={(hl) => void handleUpdateHighlight(hl)}
                onDeleteHighlight={(id) => void handleDeleteHighlight(id)}
                onSendToNotes={(bookTitle, excerpt, loc, linkMeta) =>
                  sendBookExcerptToNotes(bookTitle, excerpt, loc, linkMeta)
                }
                onBackToBooks={() =>
                  setActiveFilter({ kind: "smart", id: "all" })
                }
              />
            ) : books.length === 0 ? (
              <EmptyLibraryDropzone
                onFilesSelected={(files) => void handleImportFiles(files)}
                onBrowseClick={triggerLibraryImport}
                isImporting={isImporting}
              />
            ) : (
              <div className="p-4 sm:p-6 lg:p-7 pb-28 space-y-7 max-w-[1600px] mx-auto">
                {/* Continue Reading Editorial Shelf (All Books top-level) */}
                {activeFilter.kind === "smart" &&
                  activeFilter.id === "all" &&
                  !drilledViewFolder &&
                  !hasActiveFilters && (
                    <ContinueReadingShelf
                      books={books}
                      totalHighlightsCount={highlights.length}
                      onOpenBook={(book) => handleOpenBook(book)}
                      onInspectBook={(book) => {
                        setInspectedBookId(book.id);
                        setInspectorOpen(true);
                      }}
                      onOpenHighlightsHub={() =>
                        setActiveFilter({ kind: "smart", id: "highlights" })
                      }
                    />
                  )}

                {/* Per-View Shelf Folders Section (when not drilled into a folder) */}
                {!drilledViewFolder && (
                  <ViewFoldersSection
                    viewLabel={activeViewLabel}
                    viewFolders={currentViewFolders}
                    viewBooks={viewBooks}
                    displayMode={prefs.viewFolderDisplayMode}
                    cardLayout={prefs.viewFolderCardLayout}
                    hideFiledBooks={prefs.hideFiledBooks}
                    filedBooksCount={filedBooksCount}
                    coverSize={prefs.coverSize}
                    inspectorOpen={inspectorOpen}
                    inspectedBookId={inspectedBookId}
                    onDisplayModeChange={(viewFolderDisplayMode) =>
                      updateUiPrefs({ viewFolderDisplayMode })
                    }
                    onCardLayoutChange={(viewFolderCardLayout) =>
                      updateUiPrefs({ viewFolderCardLayout })
                    }
                    onToggleHideFiled={() =>
                      updateUiPrefs({ hideFiledBooks: !prefs.hideFiledBooks })
                    }
                    onCreateFolder={(name) => void handleCreateViewFolder(name)}
                    onRenameFolder={handleRenameViewFolder}
                    onDeleteFolder={handleDeleteViewFolder}
                    onOpenFolder={(fid) => setDrilledViewFolderId(fid)}
                    onRequestAddBooks={(vf) => setAddingBooksToViewFolder(vf)}
                    onDropBooksToViewFolder={handleDropBooksToViewFolder}
                    onRemoveBookFromViewFolder={(bookId, folderId) =>
                      handleToggleViewFolderMembership(
                        [bookId],
                        folderId,
                        false,
                      )
                    }
                    onOpenBook={(book) => handleOpenBook(book)}
                    onInspectBook={(book) => {
                      setInspectedBookId(book.id);
                      setInspectorOpen(true);
                    }}
                  />
                )}

                {/* Empty filtered state */}
                {visibleBooks.length === 0 ? (
                  <div className="py-16 text-center space-y-2 border border-dashed border-[var(--border-subtle)] rounded-xl">
                    <p className="font-display text-sm font-medium text-[var(--text-primary)]">
                      No books in this view
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {hasActiveFilters
                        ? "Try clearing search or format filters."
                        : drilledViewFolder
                          ? 'Use "Add Books" above or drag covers onto this shelf.'
                          : "Import EPUB, PDF, or MOBI files to grow this collection."}
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                          setFormatFilter("all");
                          setSelectedTags([]);
                          updateUiPrefs({ groupBy: "none" });
                        }}
                        className="mt-2 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-subtle)] text-[var(--accent)] hover:bg-[var(--bg-surface)] cursor-pointer"
                      >
                        Reset filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groupedBooks.map((group) => (
                      <section key={group.key} className="space-y-3">
                        {group.label && (
                          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                              {group.label}
                            </h2>
                            <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                              {group.books.length}
                            </span>
                          </div>
                        )}

                        {/* Desktop Grid or Table */}
                        <div className="hidden lg:block">
                          {prefs.viewMode === "table" ? (
                            <BookTable
                              books={group.books}
                              categories={categories}
                              folders={folders}
                              selectedIds={selectedIds}
                              allSelected={
                                group.books.length > 0 &&
                                group.books.every((b) => selectedIds.has(b.id))
                              }
                              inspectorOpen={inspectorOpen}
                              inspectedBookId={inspectedBookId}
                              sortField={prefs.sortField}
                              sortDirection={prefs.sortDirection}
                              isCustomSort={prefs.sortField === "custom"}
                              missingBookIds={missingBookIds}
                              onReorderBooks={handleReorderBooks}
                              onSortChange={(field) => {
                                if (prefs.sortField === field) {
                                  updateUiPrefs({
                                    sortDirection:
                                      prefs.sortDirection === "asc"
                                        ? "desc"
                                        : "asc",
                                  });
                                } else {
                                  updateUiPrefs({
                                    sortField: field,
                                    sortDirection: "asc",
                                  });
                                }
                              }}
                              onToggleSelect={handleToggleSelectBook}
                              onToggleSelectAll={() => {
                                const allInGroup = group.books.every((b) =>
                                  selectedIds.has(b.id),
                                );
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  for (const b of group.books) {
                                    if (allInGroup) next.delete(b.id);
                                    else next.add(b.id);
                                  }
                                  return next;
                                });
                              }}
                              onOpenBook={(book) => handleOpenBook(book)}
                              onInspectBook={(book) => {
                                setInspectedBookId(book.id);
                                setInspectorOpen(true);
                              }}
                              onEditBook={(book) => setEditingBookId(book.id)}
                              onRelinkBook={(book) => void handleRelinkBook(book)}
                              onToggleFavorite={handleToggleFavorite}
                              onContextMenuBook={(book, e) => {
                                e.preventDefault();
                                const targetIds = selectedIds.has(book.id)
                                  ? Array.from(selectedIds)
                                  : [book.id];
                                setContextMenu({
                                  x: e.clientX,
                                  y: e.clientY,
                                  targetBookIds: targetIds,
                                  primaryBookId: book.id,
                                });
                              }}
                            />
                          ) : (
                            <BookGrid
                              books={group.books}
                              categories={categories}
                              selectedIds={selectedIds}
                              isSelectionMode={selectedIds.size > 0}
                              coverSize={prefs.coverSize}
                              cardDetails={prefs.cardDetails}
                              inspectorOpen={inspectorOpen}
                              inspectedBookId={inspectedBookId}
                              isCustomSort={prefs.sortField === "custom"}
                              missingBookIds={missingBookIds}
                              onReorderBooks={handleReorderBooks}
                              onOpenBook={(book) => handleOpenBook(book)}
                              onInspectBook={(book) => {
                                setInspectedBookId(book.id);
                                setInspectorOpen(true);
                              }}
                              onEditBook={(book) => setEditingBookId(book.id)}
                              onRelinkBook={(book) => void handleRelinkBook(book)}
                              onToggleFavorite={handleToggleFavorite}
                              onToggleSelect={handleToggleSelectBook}
                              onRemoveFromFolder={
                                drilledViewFolder
                                  ? (book) =>
                                      handleToggleViewFolderMembership(
                                        [book.id],
                                        drilledViewFolder.id,
                                        false,
                                      )
                                  : undefined
                              }
                              onQuickAction={(book) =>
                                setMobileActionBook(book)
                              }
                              onContextMenuBook={(book, e) => {
                                e.preventDefault();
                                const targetIds = selectedIds.has(book.id)
                                  ? Array.from(selectedIds)
                                  : [book.id];
                                setContextMenu({
                                  x: e.clientX,
                                  y: e.clientY,
                                  targetBookIds: targetIds,
                                  primaryBookId: book.id,
                                });
                              }}
                            />
                          )}
                        </div>

                        {/* Mobile & Tablet Compact List (<lg) */}
                        <div className="lg:hidden">
                          <MobileBookList
                            books={group.books}
                            categories={categories}
                            cardDetails={prefs.cardDetails}
                            selectedIds={selectedIds}
                            isSelectionMode={selectedIds.size > 0}
                            isCustomSort={prefs.sortField === "custom"}
                            missingBookIds={missingBookIds}
                            onReorderBooks={handleReorderBooks}
                            onOpenBook={(book) => handleOpenBook(book)}
                            onRelinkBook={(book) => void handleRelinkBook(book)}
                            onQuickAction={(book) => setMobileActionBook(book)}
                            onToggleSelect={handleToggleSelectBook}
                          />
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Split Book Inspector (Desktop xl+ docked, tablet drawer, mobile bottom sheet) */}
        <BookInspector
          book={inspectedBook}
          isOpen={inspectorOpen}
          isMissing={
            inspectedBook ? missingBookIds.has(inspectedBook.id) : false
          }
          folders={folders}
          categories={categories}
          highlights={
            inspectedBook
              ? highlights.filter((h) => h.bookId === inspectedBook.id)
              : []
          }
          bookmarks={
            inspectedBook
              ? bookmarks.filter((bm) => bm.bookId === inspectedBook.id)
              : []
          }
          onClose={() => setInspectorOpen(false)}
          onOpenBook={(book, unitIndex) => handleOpenBook(book, unitIndex)}
          onUpdateBook={handleUpdateBook}
          onEditMetadata={(book) => setEditingBookId(book.id)}
          onRelinkBook={(book) => void handleRelinkBook(book)}
          onDeleteBook={(bookId) => {
            const target = books.find((b) => b.id === bookId);
            if (target) setBooksPendingDelete([target]);
          }}
        />
      </div>

      {/* External File Drag-and-Drop Overlay */}
      {isFileDragActive && (
        <div className="absolute inset-0 z-50 bg-[var(--bg-canvas)]/90 backdrop-blur-xs flex flex-col items-center justify-center p-6 pointer-events-none border-2 border-dashed border-[var(--accent)] m-3 rounded-xl">
          <Upload className="w-8 h-8 text-[var(--accent)] mb-2" />
          <p className="font-display text-base font-semibold text-[var(--text-primary)]">
            Drop ebooks to import into Kanso Library
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Supports EPUB, PDF, and MOBI — stored privately offline
          </p>
        </div>
      )}

      {/* Floating Drag-to-Folder Dock */}
      <FloatingFolderDropDock
        visible={isDraggingBooks}
        activeViewLabel={activeViewLabel}
        currentViewFolders={currentViewFolders}
        sidebarFolders={folders}
        activeFolderRemovalTarget={activeFolderRemovalTarget}
        onDropToViewFolder={handleDropBooksToViewFolder}
        onDropToSidebarFolder={handleDropBooksToSidebarFolder}
        onDropToRemoveFromCurrentFolder={handleRemoveBooksFromCurrentFolder}
      />

      {/* Right-Click Context Menu */}
      <BookContextMenu
        menuState={contextMenu}
        books={books}
        activeViewLabel={activeViewLabel}
        currentViewFolders={currentViewFolders}
        sidebarFolders={folders}
        activeFolderRemovalName={activeFolderRemovalTarget?.name ?? null}
        selectedIds={selectedIds}
        onClose={() => setContextMenu(null)}
        onOpenBook={(book) => handleOpenBook(book)}
        onInspectBook={(book) => {
          setInspectedBookId(book.id);
          setInspectorOpen(true);
        }}
        onEditMetadata={(book) => setEditingBookId(book.id)}
        onBulkEditBooks={(ids) => {
          setSelectedIds(new Set(ids));
          setBulkEditOpen(true);
        }}
        onOrganizeBooks={(ids) => setOrganizeTargetIds(ids)}
        onToggleViewFolderMembership={handleToggleViewFolderMembership}
        onToggleSidebarFolderMembership={handleToggleSidebarFolderMembership}
        onCreateViewFolderAndAssign={async (name, bookIds) => {
          const vf = await handleCreateViewFolder(name);
          handleToggleViewFolderMembership(bookIds, vf.id, true);
        }}
        onCreateSidebarFolderAndAssign={async (name, bookIds) => {
          const fld = await handleCreateFolder(name);
          handleToggleSidebarFolderMembership(bookIds, fld.id, true);
        }}
        onRemoveFromCurrentFolder={
          activeFolderRemovalTarget
            ? handleRemoveBooksFromCurrentFolder
            : undefined
        }
        onSetReadingStatus={(bookIds, status: ReadingStatus) => {
          const set = new Set(bookIds);
          updateLibraryState((prev) => ({
            books: prev.books.map((b) =>
              set.has(b.id) ? { ...b, status } : b,
            ),
          }));
        }}
        onSetFavorite={(bookIds, favorite) => {
          const set = new Set(bookIds);
          updateLibraryState((prev) => ({
            books: prev.books.map((b) =>
              set.has(b.id) ? { ...b, isFavorite: favorite } : b,
            ),
          }));
        }}
        onToggleSelectBook={(bookId) => handleToggleSelectBook(bookId, false)}
        onClearSelection={() => setSelectedIds(new Set())}
        onRequestDeleteBooks={(ids) => {
          const list = books.filter((b) => ids.includes(b.id));
          if (list.length > 0) setBooksPendingDelete(list);
        }}
      />

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        totalVisibleCount={visibleBooks.length}
        onSelectAll={() =>
          setSelectedIds(new Set(visibleBooks.map((b) => b.id)))
        }
        onClearSelection={() => setSelectedIds(new Set())}
        onBulkEdit={() => setBulkEditOpen(true)}
        onMobileOrganize={() => setOrganizeTargetIds(Array.from(selectedIds))}
        onBulkFavorite={() => {
          const set = selectedIds;
          const allFav = books
            .filter((b) => set.has(b.id))
            .every((b) => b.isFavorite);
          updateLibraryState((prev) => ({
            books: prev.books.map((b) =>
              set.has(b.id) ? { ...b, isFavorite: !allFav } : b,
            ),
          }));
        }}
        onBulkDelete={() => {
          const list = books.filter((b) => selectedIds.has(b.id));
          if (list.length > 0) setBooksPendingDelete(list);
        }}
      />

      {/* Bulk Edit Studio Modal */}
      {bulkEditOpen && selectedIds.size > 0 && (
        <BulkEditModal
          selectedBooks={books.filter((b) => selectedIds.has(b.id))}
          activeViewLabel={activeViewLabel}
          currentViewFolders={currentViewFolders}
          folders={folders}
          categories={categories}
          existingTags={existingTagNames}
          onCreateViewFolder={handleCreateViewFolder}
          onCreateFolder={(name) => handleCreateFolder(name)}
          onApply={handleApplyBulkEdit}
          onClose={() => setBulkEditOpen(false)}
        />
      )}

      {/* Full Metadata & Cover Customizer Drawer */}
      {editingBook && (
        <MetadataDrawer
          book={editingBook}
          isMissing={missingBookIds.has(editingBook.id)}
          folders={folders}
          categories={categories}
          existingTags={existingTagNames}
          onSave={(updated) => {
            handleUpdateBook(updated);
            setEditingBookId(null);
            notify("Metadata saved", "success");
          }}
          onReplaceFile={handleReplaceBookFile}
          onRelinkBook={(book) => void handleRelinkBook(book)}
          onDelete={(bookId) => {
            setEditingBookId(null);
            const target = books.find((b) => b.id === bookId);
            if (target) setBooksPendingDelete([target]);
          }}
          onCreateFolder={(name) => handleCreateFolder(name)}
          onCreateCategory={handleCreateCategory}
          onClose={() => setEditingBookId(null)}
        />
      )}

      {/* Add Books to View Folder Modal */}
      {addingBooksToViewFolder && (
        <AddBooksToFolderModal
          folder={addingBooksToViewFolder}
          availableBooks={viewBooks}
          onSave={(folderId, nextBookIds) => {
            handleSaveViewFolderBooks(folderId, nextBookIds);
            setAddingBooksToViewFolder(null);
          }}
          onClose={() => setAddingBooksToViewFolder(null)}
        />
      )}

      {/* Add vs Move Folder Drop Confirmation Modal */}
      <FolderDropActionModal
        pendingDrop={pendingFolderDrop}
        onAdd={() => handleConfirmFolderDrop("add")}
        onMove={() => handleConfirmFolderDrop("move")}
        onCancel={() => setPendingFolderDrop(null)}
      />

      {/* Confirm Delete Modal */}
      {booksPendingDelete.length > 0 && (
        <ConfirmDeleteModal
          booksToDelete={booksPendingDelete}
          linkedNotesCount={linkedNotesCountForPendingDelete}
          onConfirm={(linkedNotesBehavior) =>
            void handleDeleteBooksConfirmed(
              booksPendingDelete.map((b) => b.id),
              linkedNotesBehavior,
            )
          }
          onClose={() => setBooksPendingDelete([])}
        />
      )}

      {/* Duplicate Import Resolution Modal */}
      {pendingDuplicates.length > 0 && (
        <DuplicateImportModal
          items={pendingDuplicates}
          onResolve={(decisions) => void handleResolveDuplicates(decisions)}
          onCancel={() => setPendingDuplicates([])}
        />
      )}

      {/* Storage Manager Modal (Quota, Audits, Replace File, Orphan Cleanup) */}
      <StorageManagerModal
        isOpen={storageManagerOpen}
        books={books}
        onClose={() => setStorageManagerOpen(false)}
        onReplaceFile={handleReplaceBookFile}
        onRelinkBook={(book) => void handleRelinkBook(book)}
        onDeleteBooks={handleDeleteBooksConfirmed}
        onEditMetadata={(book) => {
          setStorageManagerOpen(false);
          setEditingBookId(book.id);
        }}
        onImportBooks={() => {
          setStorageManagerOpen(false);
          triggerLibraryImport();
        }}
        onNotify={notify}
      />

      {/* Full ZIP Backup Import Modal */}
      {pendingBackupArchive && (
        <ImportBackupModal
          backup={pendingBackupArchive}
          existingBooksCount={books.length}
          isRestoring={isRestoringBackup}
          onConfirm={(mode) => void handleConfirmRestoreBackup(mode)}
          onCancel={() => setPendingBackupArchive(null)}
        />
      )}

      {/* Global Library Command Palette (Cmd/Ctrl+K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        books={books}
        folders={folders}
        categories={categories}
        highlights={highlights}
        theme={prefs.reader.theme}
        inspectorOpen={inspectorOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenBook={(book, unitIndex) => handleOpenBook(book, unitIndex)}
        onSelectFolder={(folderId) =>
          setActiveFilter({ kind: "folder", id: folderId })
        }
        onSelectCategory={(catId) =>
          setActiveFilter({ kind: "category", id: catId })
        }
        onOpenHighlightsHub={() =>
          setActiveFilter({ kind: "smart", id: "highlights" })
        }
        onImportBooks={triggerLibraryImport}
        onOpenStorageManager={() => setStorageManagerOpen(true)}
        onToggleTheme={handleCycleReaderSurface}
        onToggleInspector={() => setInspectorOpen((v) => !v)}
      />

      {/* Mobile Sheets */}
      <MobileBookActionSheet
        book={mobileActionBook}
        isMissing={
          mobileActionBook ? missingBookIds.has(mobileActionBook.id) : false
        }
        activeDrilledFolderName={drilledViewFolder?.name ?? null}
        onClose={() => setMobileActionBook(null)}
        onReadBook={(book) => handleOpenBook(book)}
        onRelinkBook={(book) => void handleRelinkBook(book)}
        onInspectBook={(book) => {
          setInspectedBookId(book.id);
          setInspectorOpen(true);
        }}
        onOrganizeBook={(book) => setOrganizeTargetIds([book.id])}
        onToggleFavorite={handleToggleFavorite}
        onEditMetadata={(book) => setEditingBookId(book.id)}
        onSelectBook={(book) => handleToggleSelectBook(book.id, false)}
        onRemoveFromViewFolder={
          drilledViewFolder
            ? (book) =>
                handleToggleViewFolderMembership(
                  [book.id],
                  drilledViewFolder.id,
                  false,
                )
            : undefined
        }
        onDeleteBook={(bookId) => {
          const target = books.find((b) => b.id === bookId);
          if (target) setBooksPendingDelete([target]);
        }}
      />

      <MobileFilterSortSheet
        isOpen={mobileFilterSheetOpen}
        formatFilter={formatFilter}
        groupBy={prefs.groupBy}
        sortField={prefs.sortField}
        sortDirection={prefs.sortDirection}
        coverSize={prefs.coverSize}
        cardDetails={prefs.cardDetails}
        hasViewFolders={currentViewFolders.length > 0}
        hideFiledBooks={prefs.hideFiledBooks}
        hasActiveFilters={hasActiveFilters}
        onFormatChange={setFormatFilter}
        onGroupByChange={(groupBy) => updateUiPrefs({ groupBy })}
        onSortFieldChange={(sortField) =>
          updateUiPrefs(
            sortField === "custom"
              ? { sortField: "custom", sortDirection: "asc" }
              : { sortField },
          )
        }
        onToggleSortDirection={() =>
          updateUiPrefs({
            sortDirection: prefs.sortDirection === "asc" ? "desc" : "asc",
          })
        }
        onCoverSizeChange={(coverSize) => updateUiPrefs({ coverSize })}
        onCardDetailsChange={updateCardDetails}
        onToggleHideFiled={() =>
          updateUiPrefs({ hideFiledBooks: !prefs.hideFiledBooks })
        }
        onResetFilters={() => {
          setFormatFilter("all");
          setSelectedTags([]);
          setSearchQuery("");
          updateUiPrefs({ groupBy: "none" });
        }}
        onClose={() => setMobileFilterSheetOpen(false)}
      />

      <MobileOrganizeSheet
        isOpen={Boolean(organizeTargetIds && organizeTargetIds.length > 0)}
        targetBooks={
          organizeTargetIds
            ? books.filter((b) => organizeTargetIds.includes(b.id))
            : []
        }
        activeViewLabel={activeViewLabel}
        currentViewFolders={currentViewFolders}
        sidebarFolders={folders}
        categories={categories}
        existingTags={existingTagNames}
        onCreateViewFolder={handleCreateViewFolder}
        onCreateSidebarFolder={(name) => handleCreateFolder(name)}
        onApply={handleApplyMobileOrganize}
        onClose={() => setOrganizeTargetIds(null)}
      />

      {/* Create / Edit Library Folder Modal */}
      {folderModal && (
        <LibraryFolderModal
          mode={folderModal.mode}
          folder={folderModal.mode === "edit" ? folderModal.folder : undefined}
          folders={folders}
          onClose={() => setFolderModal(null)}
          onSave={({ name, color, parentId }) => {
            if (folderModal.mode === "create") {
              void handleCreateFolder(name, parentId, color);
            } else {
              handleUpdateFolder(folderModal.folder.id, { name, color });
            }
          }}
        />
      )}
      {/* Android Capacitor-only Direct Storage Choice & Folder Manager */}
      {isAndroidApp && (
        <>
          <AndroidImportChoiceModal
            isOpen={Boolean(androidChoicePrompt)}
            fileCount={androidChoicePrompt?.fileCount ?? 1}
            totalBytes={androidChoicePrompt?.totalBytes ?? 0}
            contextLabel={androidChoicePrompt?.contextLabel}
            onChoose={(choice, rememberPreference) =>
              handleResolveAndroidChoice(choice, rememberPreference)
            }
            onCancel={() => handleResolveAndroidChoice(null)}
          />
          <AndroidFolderManagerModal
            isOpen={androidFolderManagerOpen}
            folders={androidLinkedFolders}
            isScanning={isScanningAndroidFolders}
            onClose={() => setAndroidFolderManagerOpen(false)}
            onAddFolder={() => void handleAndroidLinkFolder()}
            onScanFolder={(uri) => void scanSingleAndroidFolder(uri, undefined, false)}
            onScanAll={() => void handleScanAllAndroidFolders(false)}
            onRemoveFolder={(uri) => {
              const next = removeAndroidLinkedFolder(uri);
              setAndroidLinkedFolders(next);
              notify("Unlinked device folder", "info");
            }}
          />
        </>
      )}
    </div>
  );
};
