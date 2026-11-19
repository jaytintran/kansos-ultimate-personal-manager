import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUpNarrowWide,
  CheckSquare,
  Command,
  FolderPlus,
  HardDrive,
  LayoutGrid,
  List,
  PanelLeftOpen,
  PanelRight,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AddBooksToFolderModal} from '../components/library/AddBooksToFolderModal';
import {
  BookContextMenu,
  type BookContextMenuState,
} from '../components/library/BookContextMenu';
import {BookGrid} from '../components/library/BookGrid';
import {BookInspector} from '../components/library/BookInspector';
import {BookTable} from '../components/library/BookTable';
import {BulkActionBar} from '../components/library/BulkActionBar';
import {BulkEditModal, type BulkEditPatch} from '../components/library/BulkEditModal';
import {CommandPalette} from '../components/library/CommandPalette';
import {ConfirmDeleteModal} from '../components/library/ConfirmDeleteModal';
import {ContinueReadingShelf} from '../components/library/ContinueReadingShelf';
import {DisplayOptionsPopover} from '../components/library/DisplayOptionsPopover';
import {
  DuplicateImportModal,
  type DuplicateResolutionAction,
  type PendingDuplicateItem,
} from '../components/library/DuplicateImportModal';
import {EmptyLibraryDropzone} from '../components/library/EmptyLibraryDropzone';
import {FloatingFolderDropDock} from '../components/library/FloatingFolderDropDock';
import {
  FolderDropActionModal,
  type PendingFolderDrop,
} from '../components/library/FolderDropActionModal';
import {HighlightsHubView} from '../components/library/HighlightsHubView';
import {ImportBackupModal} from '../components/library/ImportBackupModal';
import {
  type ActiveLibraryFilter,
  LibrarySidebar,
} from '../components/library/LibrarySidebar';
import {MetadataDrawer} from '../components/library/MetadataDrawer';
import {MobileBookActionSheet} from '../components/library/MobileBookActionSheet';
import {MobileBookList} from '../components/library/MobileBookList';
import {MobileFilterSortSheet} from '../components/library/MobileFilterSortSheet';
import {
  MobileOrganizeSheet,
  type MobileOrganizePayload,
} from '../components/library/MobileOrganizeSheet';
import {StorageManagerModal} from '../components/library/StorageManagerModal';
import {ViewFoldersSection} from '../components/library/ViewFoldersSection';
import {ReaderTabStrip} from '../components/reader/ReaderTabStrip';
import {ReaderView} from '../components/reader/ReaderView';
import {useWorkspace} from '../context/WorkspaceContext';
import {useLibraryPreferences} from '../hooks/usePreferences';
import {
  exportLibraryBackupZip,
  parseLibraryBackupZip,
  type ParsedBackupArchive,
} from '../lib/backup';
import {computeSha256Hex, libraryDb} from '../lib/db';
import {
  getBookFolderIds,
  getFolderDescendantIds,
  withBookFolderIds,
} from '../lib/formatters';
import {detectBookFormat, extractBookImportMetadata} from '../lib/parsers/importBook';
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
} from '../types/library';

export interface LibraryViewProps {
  zenMode?: boolean;
  onToggleZenMode?: () => void;
  onExitZenMode?: () => void;
  onMuteBackgroundStreamer?: () => void;
}

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
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
  onToggleZenMode,
  onExitZenMode,
  onMuteBackgroundStreamer,
}) => {
  const {
    workspace,
    pushToast,
    updateLibraryState,
    syncLibraryAnnotationsFromDb,
    sendBookExcerptToNotes,
  } = useWorkspace();

  const {
    prefs,
    updateUiPrefs,
    updateReaderPrefs,
    resetReaderPrefs,
    updateCardDetails,
    toggleSidebarSection,
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

  // Library filtering, search & drill-down
  const [activeFilter, setActiveFilter] = useState<ActiveLibraryFilter>({
    kind: 'smart',
    id: 'all',
  });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [formatFilter, setFormatFilter] = useState<'all' | BookFormat>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [drilledViewFolderId, setDrilledViewFolderId] = useState<string | null>(null);

  // Selection, Inspector, Popovers & Drawers
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedBookIdRef = useRef<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectedBookId, setInspectedBookId] = useState<string | null>(null);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [booksPendingDelete, setBooksPendingDelete] = useState<BookRecord[]>([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [storageManagerOpen, setStorageManagerOpen] = useState(false);
  const [displayPopoverOpen, setDisplayPopoverOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileFilterSheetOpen, setMobileFilterSheetOpen] = useState(false);
  const [mobileActionBook, setMobileActionBook] = useState<BookRecord | null>(null);
  const [organizeTargetIds, setOrganizeTargetIds] = useState<string[] | null>(null);
  const [addingBooksToViewFolder, setAddingBooksToViewFolder] =
    useState<ViewFolderRecord | null>(null);
  const [contextMenu, setContextMenu] = useState<BookContextMenuState | null>(null);

  // Drag & Drop (Books → Folders, External Files → Import)
  const [isDraggingBooks, setIsDraggingBooks] = useState(false);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [pendingFolderDrop, setPendingFolderDrop] = useState<PendingFolderDrop | null>(null);

  // Import, Deduplication & Backup ZIP states
  const [isImporting, setIsImporting] = useState(false);
  const [pendingDuplicates, setPendingDuplicates] = useState<PendingDuplicateItem[]>([]);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isParsingBackup, setIsParsingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [pendingBackupArchive, setPendingBackupArchive] =
    useState<ParsedBackupArchive | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = useCallback(
    (title: string, tone: 'info' | 'success' | 'error' = 'info', detail?: string) => {
      const msg = detail ? `${title} — ${detail}` : title;
      pushToast(msg, tone === 'info' ? 'neutral' : tone);
    },
    [pushToast]
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

  // Exit Zen mode whenever returning from Reader back to Library grid
  useEffect(() => {
    if (!activeBookId && zenMode) {
      onExitZenMode?.();
    }
  }, [activeBookId, zenMode, onExitZenMode]);

  // Global Cmd/Ctrl+K Command Palette & Escape handling when in Library shelf view
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      } else if (e.key === 'Escape' && !activeBookId) {
        if (contextMenu) setContextMenu(null);
        else if (displayPopoverOpen) setDisplayPopoverOpen(false);
        else if (selectedIds.size > 0) setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeBookId, contextMenu, displayPopoverOpen, selectedIds.size]);

  // Track internal book drag state for FloatingFolderDropDock
  useEffect(() => {
    const onDragStart = (e: DragEvent) => {
      const types = e.dataTransfer?.types;
      if (
        types &&
        (types.includes('application/x-folio-book-id') ||
          types.includes('application/x-folio-book-ids'))
      ) {
        setIsDraggingBooks(true);
      }
    };
    const onDragEnd = () => setIsDraggingBooks(false);
    window.addEventListener('dragstart', onDragStart);
    window.addEventListener('dragend', onDragEnd);
    window.addEventListener('drop', onDragEnd);
    return () => {
      window.removeEventListener('dragstart', onDragStart);
      window.removeEventListener('dragend', onDragEnd);
      window.removeEventListener('drop', onDragEnd);
    };
  }, []);

  // Derived collections & keys
  const activeViewKey = `${activeFilter.kind}:${activeFilter.id}`;

  const activeViewLabel = useMemo(() => {
    if (activeFilter.kind === 'smart') {
      const labels: Record<string, string> = {
        all: 'All Books',
        reading: 'Currently Reading',
        unread: 'Unread',
        finished: 'Finished',
        favorites: 'Favorites',
        highlights: 'Highlights & Notes',
      };
      return labels[activeFilter.id] ?? 'Library';
    }
    if (activeFilter.kind === 'folder') {
      return folders.find((f) => f.id === activeFilter.id)?.name ?? 'Folder';
    }
    return categories.find((c) => c.id === activeFilter.id)?.name ?? 'Category';
  }, [activeFilter, folders, categories]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const book of books) {
      for (const t of book.tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({name, count}))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [books]);

  const existingTagNames = useMemo(() => allTags.map((t) => t.name), [allTags]);

  const currentViewFolders = useMemo(
    () => viewFolders.filter((vf) => vf.viewKey === activeViewKey),
    [viewFolders, activeViewKey]
  );

  const drilledViewFolder = useMemo(
    () =>
      drilledViewFolderId
        ? currentViewFolders.find((vf) => vf.id === drilledViewFolderId) ?? null
        : null,
    [currentViewFolders, drilledViewFolderId]
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
      activeFilter.kind === 'folder'
        ? getFolderDescendantIds(folders, activeFilter.id)
        : null;

    return books.filter((book) => {
      if (activeFilter.kind === 'smart') {
        if (activeFilter.id === 'reading' && book.status !== 'reading') return false;
        if (activeFilter.id === 'unread' && book.status !== 'unread') return false;
        if (activeFilter.id === 'finished' && book.status !== 'finished') return false;
        if (activeFilter.id === 'favorites' && !book.isFavorite) return false;
      } else if (activeFilter.kind === 'folder' && descendantIds) {
        const bFolders = getBookFolderIds(book);
        if (!bFolders.some((fid) => descendantIds.has(fid))) return false;
      } else if (activeFilter.kind === 'category') {
        if (book.categoryId !== activeFilter.id) return false;
      }

      if (formatFilter !== 'all' && book.format !== formatFilter) return false;

      if (selectedTags.length > 0) {
        if (!selectedTags.every((t) => book.tags.includes(t))) return false;
      }

      if (q) {
        const hay = `${book.title} ${book.subtitle ?? ''} ${book.author} ${book.series ?? ''} ${book.publisher ?? ''} ${book.tags.join(' ')} ${book.fileName}`.toLowerCase();
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
    [viewBooks, filedBookIdSet]
  );

  // Step 2: Visible books after view-folder drill-down / hide-filed + sorting
  const visibleBooks = useMemo(() => {
    let list = viewBooks;
    if (drilledViewFolder) {
      const inFolder = new Set(drilledViewFolder.bookIds);
      list = list.filter((b) => inFolder.has(b.id));
    } else if (prefs.hideFiledBooks && currentViewFolders.length > 0) {
      list = list.filter((b) => !filedBookIdSet.has(b.id));
    }

    const dir = prefs.sortDirection === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (prefs.sortField) {
        case 'title':
          return a.title.localeCompare(b.title) * dir;
        case 'author':
          return a.author.localeCompare(b.author) * dir;
        case 'progress':
          return (a.progress - b.progress) * dir;
        case 'fileSize':
          return (a.fileSize - b.fileSize) * dir;
        case 'year':
          return (a.year ?? '').localeCompare(b.year ?? '') * dir;
        case 'format':
          return a.format.localeCompare(b.format) * dir;
        case 'addedAt':
          return (a.addedAt - b.addedAt) * dir;
        case 'recent':
        case 'lastReadAt':
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
  ]);

  // Grouped visible books when groupBy !== 'none'
  const groupedBooks = useMemo(() => {
    if (prefs.groupBy === 'none') {
      return [{key: 'all', label: '', books: visibleBooks}];
    }
    const categoryNameMap = new Map(categories.map((c) => [c.id, c.name]));
    const groups = new Map<string, BookRecord[]>();

    for (const book of visibleBooks) {
      let label = 'Other';
      if (prefs.groupBy === 'status') {
        label =
          book.status === 'reading'
            ? 'Currently Reading'
            : book.status === 'finished'
              ? 'Finished'
              : 'Unread';
      } else if (prefs.groupBy === 'format') {
        label = book.format.toUpperCase();
      } else if (prefs.groupBy === 'author') {
        label = book.author || 'Unknown Author';
      } else if (prefs.groupBy === 'category') {
        label = (book.categoryId && categoryNameMap.get(book.categoryId)) || 'Uncategorized';
      } else if (prefs.groupBy === 'series') {
        label = book.series?.trim() || 'Standalone';
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
    [openBookIds, books]
  );

  const activeBook = useMemo(
    () => (activeBookId ? books.find((b) => b.id === activeBookId) ?? null : null),
    [activeBookId, books]
  );

  const inspectedBook = useMemo(
    () => (inspectedBookId ? books.find((b) => b.id === inspectedBookId) ?? null : null),
    [inspectedBookId, books]
  );

  const editingBook = useMemo(
    () => (editingBookId ? books.find((b) => b.id === editingBookId) ?? null : null),
    [editingBookId, books]
  );

  // Open a book in a Reader tab (optionally jumping straight to a chapter/page)
  const handleOpenBook = useCallback(
    (book: BookRecord, jumpUnitIndex?: number) => {
      if (typeof jumpUnitIndex === 'number') {
        const updated: BookRecord = {
          ...book,
          lastReadAt: Date.now(),
          currentLocation: {
            unitIndex: jumpUnitIndex,
            scrollRatio: 0,
            label: book.format === 'pdf' ? `Page ${jumpUnitIndex}` : undefined,
          },
        };
        updateLibraryState((prev) => ({
          books: prev.books.map((b) => (b.id === book.id ? updated : b)),
        }));
      }
      setOpenBookIds((prev) => (prev.includes(book.id) ? prev : [...prev, book.id]));
      setActiveBookId(book.id);
    },
    [updateLibraryState]
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
      prefs.reader.theme === 'kanso'
        ? 'sepia'
        : prefs.reader.theme === 'sepia'
          ? 'dark'
          : 'kanso';
    updateReaderPrefs({theme: next});
  }, [prefs.reader.theme, updateReaderPrefs]);

  // Book CRUD & Metadata
  const handleUpdateBook = useCallback(
    (updated: BookRecord) => {
      updateLibraryState((prev) => ({
        books: prev.books.map((b) => (b.id === updated.id ? updated : b)),
      }));
    },
    [updateLibraryState]
  );

  const handleToggleFavorite = useCallback(
    (book: BookRecord) => {
      handleUpdateBook({...book, isFavorite: !book.isFavorite});
    },
    [handleUpdateBook]
  );

  const handleDeleteBooksConfirmed = useCallback(
    async (idsToDelete: string[]) => {
      const deleteSet = new Set(idsToDelete);
      if (deleteSet.size === 0) return;

      for (const id of deleteSet) {
        await libraryDb.deleteBookData(id);
      }

      updateLibraryState((prev) => ({
        books: prev.books.filter((b) => !deleteSet.has(b.id)),
        bookBookmarks: prev.bookBookmarks.filter((bm) => !deleteSet.has(bm.bookId)),
        bookHighlights: prev.bookHighlights.filter((hl) => !deleteSet.has(hl.bookId)),
        libraryViewFolders: prev.libraryViewFolders.map((vf) => ({
          ...vf,
          bookIds: vf.bookIds.filter((bid) => !deleteSet.has(bid)),
        })),
      }));

      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of deleteSet) next.delete(id);
        return next;
      });
      setBooksPendingDelete([]);
      notify(
        deleteSet.size === 1 ? 'Book removed' : `${deleteSet.size} books removed`,
        'info'
      );
    },
    [updateLibraryState, notify]
  );

  // Import Pipeline with SHA-256 + Metadata Deduplication
  const handleImportFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const rawFiles = Array.from(fileList);
      if (rawFiles.length === 0) return;

      const supported = rawFiles.filter((f) => detectBookFormat(f.name) !== null);
      const unsupportedCount = rawFiles.length - supported.length;
      if (unsupportedCount > 0) {
        notify(
          `Skipped ${unsupportedCount} unsupported file${unsupportedCount === 1 ? '' : 's'}`,
          'error',
          'Supports .epub, .pdf, and .mobi'
        );
      }
      if (supported.length === 0) return;

      setIsImporting(true);
      const newlyAdded: BookRecord[] = [];
      const duplicatesFound: PendingDuplicateItem[] = [];

      try {
        for (const file of supported) {
          try {
            const {meta: metadata, buffer: arrayBuffer} = await extractBookImportMetadata(file);

            // Detect duplicate by exact file hash, filename+size, or normalized title+author
            const existingByFile = books.find(
              (b) =>
                (b.fileHash && b.fileHash === metadata.fileHash) ||
                (b.fileName.toLowerCase() === metadata.fileName.toLowerCase() &&
                  b.fileSize === metadata.fileSize)
            );
            const existingByTitle = !existingByFile
              ? books.find(
                  (b) =>
                    b.title.trim().toLowerCase() === metadata.title.trim().toLowerCase() &&
                    b.author.trim().toLowerCase() === metadata.author.trim().toLowerCase()
                )
              : undefined;

            const existing = existingByFile ?? existingByTitle;
            if (existing) {
              duplicatesFound.push({
                id: makeId('dup'),
                file,
                arrayBuffer,
                metadata,
                existingBook: existing,
                matchReason: existingByFile ? 'Same file name & size' : 'Same title & author',
              });
              continue;
            }

            const newId = makeId('book');
            await libraryDb.saveBookFile(newId, arrayBuffer, metadata.fileHash);

            const targetFolderIds =
              activeFilter.kind === 'folder' ? [activeFilter.id] : [];
            const targetCategoryId =
              activeFilter.kind === 'category' ? activeFilter.id : null;

            const record: BookRecord = {
              id: newId,
              format: metadata.format,
              fileName: metadata.fileName,
              fileSize: metadata.fileSize,
              fileHash: metadata.fileHash,
              title: metadata.title,
              subtitle: metadata.subtitle || undefined,
              author: metadata.author,
              description: metadata.description || undefined,
              publisher: metadata.publisher || undefined,
              language: metadata.language || undefined,
              year: metadata.year || undefined,
              status: 'unread',
              isFavorite: activeFilter.kind === 'smart' && activeFilter.id === 'favorites',
              categoryId: targetCategoryId,
              folderId: targetFolderIds[0] ?? null,
              folderIds: targetFolderIds,
              tags: [...selectedTags],
              coverDataUrl: metadata.coverDataUrl,
              coverPaletteIndex: hashPaletteIndex(metadata.title),
              coverStyle: 'editorial',
              progress: 0,
              totalUnits: metadata.totalUnits,
              currentLocation: {
                unitIndex: metadata.format === 'pdf' ? 1 : 0,
                scrollRatio: 0,
              },
              addedAt: Date.now(),
              lastReadAt: null,
            };

            newlyAdded.push(record);
          } catch (err) {
            notify(
              `Failed to import "${file.name}"`,
              'error',
              err instanceof Error ? err.message : undefined
            );
          }
        }

        if (newlyAdded.length > 0) {
          updateLibraryState((prev) => ({
            books: [...newlyAdded, ...prev.books],
          }));
          notify(
            newlyAdded.length === 1
              ? `Imported "${newlyAdded[0].title}"`
              : `Imported ${newlyAdded.length} books`,
            'success'
          );
        }

        if (duplicatesFound.length > 0) {
          setPendingDuplicates(duplicatesFound);
        }
      } finally {
        setIsImporting(false);
      }
    },
    [books, activeFilter, selectedTags, updateLibraryState, notify]
  );

  // Resolve duplicates from DuplicateImportModal
  const handleResolveDuplicates = useCallback(
    async (decisions: Record<string, DuplicateResolutionAction>) => {
      const additions: BookRecord[] = [];
      const replacements = new Map<string, BookRecord>();

      for (const item of pendingDuplicates) {
        const action = decisions[item.id] ?? 'skip';
        if (action === 'skip') continue;

        if (action === 'replace') {
          await libraryDb.saveBookFile(
            item.existingBook.id,
            item.arrayBuffer,
            item.metadata.fileHash
          );
          replacements.set(item.existingBook.id, {
            ...item.existingBook,
            format: item.metadata.format,
            fileName: item.metadata.fileName,
            fileSize: item.metadata.fileSize,
            fileHash: item.metadata.fileHash,
            totalUnits: item.metadata.totalUnits,
            coverDataUrl: item.existingBook.coverDataUrl ?? item.metadata.coverDataUrl,
          });
        } else if (action === 'keep-both') {
          const newId = makeId('book');
          await libraryDb.saveBookFile(newId, item.arrayBuffer, item.metadata.fileHash);
          additions.push({
            id: newId,
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
            status: 'unread',
            isFavorite: false,
            categoryId: null,
            folderId: null,
            folderIds: [],
            tags: [],
            coverDataUrl: item.metadata.coverDataUrl,
            coverPaletteIndex: hashPaletteIndex(item.metadata.title),
            coverStyle: 'editorial',
            progress: 0,
            totalUnits: item.metadata.totalUnits,
            currentLocation: {
              unitIndex: item.metadata.format === 'pdf' ? 1 : 0,
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
          'success'
        );
      }
      setPendingDuplicates([]);
    },
    [pendingDuplicates, updateLibraryState, notify]
  );

  // Replace book binary file (from MetadataDrawer or StorageManagerModal) preserving metadata & notes
  const handleReplaceBookFile = useCallback(
    async (bookId: string, file: File) => {
      const target = books.find((b) => b.id === bookId);
      if (!target) return;
      const fmt = detectBookFormat(file.name);
      if (!fmt) {
        notify('Unsupported file format', 'error', 'Choose an .epub, .pdf, or .mobi file');
        return;
      }
      const {meta: metadata, buffer: arrayBuffer} = await extractBookImportMetadata(file);
      await libraryDb.saveBookFile(bookId, arrayBuffer, metadata.fileHash);

      const updated: BookRecord = {
        ...target,
        format: metadata.format,
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        fileHash: metadata.fileHash,
        totalUnits: metadata.totalUnits,
        coverDataUrl: target.coverDataUrl ?? metadata.coverDataUrl,
      };
      handleUpdateBook(updated);
      notify(`Replaced file for "${target.title}"`, 'success');
    },
    [books, handleUpdateBook, notify]
  );

  // Folders & Categories CRUD
  const handleCreateFolder = useCallback(
    async (
      name: string,
      parentId: string | null = null,
      color: FolderColor = 'neutral'
    ): Promise<FolderRecord> => {
      const created: FolderRecord = {
        id: makeId('fld'),
        name: name.trim() || 'Untitled Folder',
        parentId,
        color,
        createdAt: Date.now(),
      };
      updateLibraryState((prev) => ({
        libraryFolders: [...prev.libraryFolders, created],
      }));
      return created;
    },
    [updateLibraryState]
  );

  const handleUpdateFolder = useCallback(
    (id: string, patch: {name?: string; color?: FolderColor}) => {
      updateLibraryState((prev) => ({
        libraryFolders: prev.libraryFolders.map((f) => (f.id === id ? {...f, ...patch} : f)),
      }));
    },
    [updateLibraryState]
  );

  const handleDeleteFolder = useCallback(
    (id: string) => {
      const descendants = getFolderDescendantIds(folders, id);
      updateLibraryState((prev) => ({
        libraryFolders: prev.libraryFolders.filter((f) => !descendants.has(f.id)),
        books: prev.books.map((b) => {
          const remaining = getBookFolderIds(b).filter((fid) => !descendants.has(fid));
          return withBookFolderIds(b, remaining);
        }),
      }));
      if (activeFilter.kind === 'folder' && descendants.has(activeFilter.id)) {
        setActiveFilter({kind: 'smart', id: 'all'});
      }
    },
    [folders, activeFilter, updateLibraryState]
  );

  const handleCreateCategory = useCallback(
    async (name: string): Promise<CategoryRecord> => {
      const created: CategoryRecord = {
        id: makeId('cat'),
        name: name.trim() || 'Untitled Category',
        createdAt: Date.now(),
      };
      updateLibraryState((prev) => ({
        libraryCategories: [...prev.libraryCategories, created],
      }));
      return created;
    },
    [updateLibraryState]
  );

  const handleDeleteCategory = useCallback(
    (id: string) => {
      updateLibraryState((prev) => ({
        libraryCategories: prev.libraryCategories.filter((c) => c.id !== id),
        books: prev.books.map((b) => (b.categoryId === id ? {...b, categoryId: null} : b)),
      }));
      if (activeFilter.kind === 'category' && activeFilter.id === id) {
        setActiveFilter({kind: 'smart', id: 'all'});
      }
    },
    [activeFilter, updateLibraryState]
  );

  // Per-View Folders CRUD
  const handleCreateViewFolder = useCallback(
    async (name: string): Promise<ViewFolderRecord> => {
      const created: ViewFolderRecord = {
        id: makeId('vf'),
        viewKey: activeViewKey,
        name: name.trim() || 'New Shelf',
        bookIds: [],
        createdAt: Date.now(),
      };
      updateLibraryState((prev) => ({
        libraryViewFolders: [...prev.libraryViewFolders, created],
      }));
      return created;
    },
    [activeViewKey, updateLibraryState]
  );

  const handleRenameViewFolder = useCallback(
    (folderId: string, name: string) => {
      updateLibraryState((prev) => ({
        libraryViewFolders: prev.libraryViewFolders.map((vf) =>
          vf.id === folderId ? {...vf, name: name.trim() || vf.name} : vf
        ),
      }));
    },
    [updateLibraryState]
  );

  const handleDeleteViewFolder = useCallback(
    (folderId: string) => {
      updateLibraryState((prev) => ({
        libraryViewFolders: prev.libraryViewFolders.filter((vf) => vf.id !== folderId),
      }));
      if (drilledViewFolderId === folderId) setDrilledViewFolderId(null);
    },
    [drilledViewFolderId, updateLibraryState]
  );

  const handleSaveViewFolderBooks = useCallback(
    (folderId: string, nextBookIds: string[]) => {
      updateLibraryState((prev) => ({
        libraryViewFolders: prev.libraryViewFolders.map((vf) =>
          vf.id === folderId
            ? {...vf, bookIds: Array.from(new Set(nextBookIds))}
            : vf
        ),
      }));
    },
    [updateLibraryState]
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
          return {...vf, bookIds: next};
        }),
      }));
    },
    [updateLibraryState]
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
    [updateLibraryState]
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
          kind: 'sidebar',
          targetFolderId,
          targetFolderName: targetFolder.name,
          bookIds,
          bookTitles: droppedBooks.map((b) => b.title),
          existingFolderNames: existingNames,
        });
      } else {
        handleToggleSidebarFolderMembership(bookIds, targetFolderId, true);
        notify(`Added to "${targetFolder.name}"`, 'success');
      }
    },
    [folders, books, handleToggleSidebarFolderMembership, notify]
  );

  // Drag-Drop Book to View Folder (asks Add vs Move if already in another view folder)
  const handleDropBooksToViewFolder = useCallback(
    (bookIds: string[], targetFolderId: string) => {
      const targetVf = currentViewFolders.find((vf) => vf.id === targetFolderId);
      if (!targetVf || bookIds.length === 0) return;

      const droppedBooks = books.filter((b) => bookIds.includes(b.id));
      const otherViewFolders = currentViewFolders.filter(
        (vf) => vf.id !== targetFolderId && vf.bookIds.some((bid) => bookIds.includes(bid))
      );

      if (otherViewFolders.length > 0) {
        setPendingFolderDrop({
          kind: 'view',
          targetFolderId,
          targetFolderName: targetVf.name,
          bookIds,
          bookTitles: droppedBooks.map((b) => b.title),
          existingFolderNames: otherViewFolders.map((vf) => vf.name),
        });
      } else {
        handleToggleViewFolderMembership(bookIds, targetFolderId, true);
        notify(`Filed into "${targetVf.name}"`, 'success');
      }
    },
    [currentViewFolders, books, handleToggleViewFolderMembership, notify]
  );

  const handleConfirmFolderDrop = useCallback(
    (mode: 'add' | 'move') => {
      if (!pendingFolderDrop) return;
      const {kind, targetFolderId, targetFolderName, bookIds} = pendingFolderDrop;
      const idSet = new Set(bookIds);

      if (kind === 'sidebar') {
        updateLibraryState((prev) => ({
          books: prev.books.map((b) => {
            if (!idSet.has(b.id)) return b;
            const next =
              mode === 'move'
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
              return {...vf, bookIds: Array.from(new Set([...vf.bookIds, ...bookIds]))};
            }
            if (mode === 'move') {
              return {...vf, bookIds: vf.bookIds.filter((bid) => !idSet.has(bid))};
            }
            return vf;
          }),
        }));
      }

      notify(
        `${mode === 'move' ? 'Moved' : 'Added'} to "${targetFolderName}"`,
        'success'
      );
      setPendingFolderDrop(null);
    },
    [pendingFolderDrop, activeViewKey, updateLibraryState, notify]
  );

  // Bulk Edit & Mobile Organize apply
  const handleApplyBulkEdit = useCallback(
    (patch: BulkEditPatch) => {
      const targetIds = new Set(selectedIds);
      if (targetIds.size === 0) return;

      updateLibraryState((prev) => {
        const nextBooks = prev.books.map((b) => {
          if (!targetIds.has(b.id)) return b;
          let updated = {...b};

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
          if (patch.publisher !== undefined) updated.publisher = patch.publisher;
          if (patch.language !== undefined) updated.language = patch.language;

          if (patch.categoryAction === 'set') updated.categoryId = patch.categoryId;
          else if (patch.categoryAction === 'clear') updated.categoryId = null;

          if (patch.statusAction !== 'keep') updated.status = patch.statusAction;
          if (patch.favoriteAction === 'favorite') updated.isFavorite = true;
          else if (patch.favoriteAction === 'unfavorite') updated.isFavorite = false;

          if (patch.resetProgress) {
            updated.progress = 0;
            updated.status = 'unread';
            updated.currentLocation = {
              unitIndex: updated.format === 'pdf' ? 1 : 0,
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
          return {...vf, bookIds: ids};
        });

        return {books: nextBooks, libraryViewFolders: nextViewFolders};
      });

      setBulkEditOpen(false);
      notify(`Updated ${targetIds.size} books`, 'success');
    },
    [selectedIds, updateLibraryState, notify]
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
          for (const fid of payload.removeFromSidebarFolderIds) folderSet.delete(fid);
          let updated = withBookFolderIds(b, Array.from(folderSet));

          if (payload.categoryChange.mode === 'set') {
            updated.categoryId = payload.categoryChange.categoryId;
          } else if (payload.categoryChange.mode === 'clear') {
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
          return {...vf, bookIds: ids};
        });

        return {books: nextBooks, libraryViewFolders: nextViewFolders};
      });

      setOrganizeTargetIds(null);
      notify(
        payload.bookIds.length === 1
          ? 'Book organization updated'
          : `Organized ${payload.bookIds.length} books`,
        'success'
      );
    },
    [updateLibraryState, notify]
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
            const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
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
    [visibleBooks]
  );

  // Highlights Hub edits
  const handleUpdateHighlight = useCallback(
    async (updated: HighlightRecord) => {
      await libraryDb.saveHighlight(updated);
      updateLibraryState((prev) => ({
        bookHighlights: prev.bookHighlights.map((h) => (h.id === updated.id ? updated : h)),
      }));
    },
    [updateLibraryState]
  );

  const handleDeleteHighlight = useCallback(
    async (id: string) => {
      await libraryDb.deleteHighlight(id);
      updateLibraryState((prev) => ({
        bookHighlights: prev.bookHighlights.filter((h) => h.id !== id),
      }));
      notify('Highlight deleted', 'info');
    },
    [updateLibraryState, notify]
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
      const a = document.createElement('a');
      a.href = url;
      a.download = `kanso-library-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      notify('Library ZIP backup exported', 'success');
    } catch (err) {
      notify(
        'Backup export failed',
        'error',
        err instanceof Error ? err.message : undefined
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
          'Could not read backup archive',
          'error',
          err instanceof Error ? err.message : undefined
        );
      } finally {
        setIsParsingBackup(false);
      }
    },
    [notify]
  );

  const handleConfirmRestoreBackup = useCallback(
    async (mode: 'merge' | 'replace') => {
      if (!pendingBackupArchive) return;
      setIsRestoringBackup(true);
      try {
        const {snapshot} = pendingBackupArchive;
        if (mode === 'replace') {
          await libraryDb.clearAllData();
        }

        for (const entry of snapshot.files) {
          const sha = await computeSha256Hex(entry.data);
          await libraryDb.saveBookFile(entry.bookId, entry.data, sha);
        }

        if (mode === 'replace') {
          await libraryDb.replaceAllAnnotations(snapshot.bookmarks, snapshot.highlights);
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
          for (const hl of snapshot.highlights) await libraryDb.saveHighlight(hl);

          updateLibraryState((prev) => {
            const mergeById = <T extends {id: string}>(existing: T[], incoming: T[]): T[] => {
              const map = new Map(existing.map((i) => [i.id, i]));
              for (const item of incoming) map.set(item.id, item);
              return Array.from(map.values());
            };
            return {
              books: mergeById(prev.books, snapshot.books),
              libraryFolders: mergeById(prev.libraryFolders, snapshot.folders),
              libraryCategories: mergeById(prev.libraryCategories, snapshot.categories),
              libraryViewFolders: mergeById(prev.libraryViewFolders, snapshot.viewFolders),
              bookBookmarks: mergeById(prev.bookBookmarks, snapshot.bookmarks),
              bookHighlights: mergeById(prev.bookHighlights, snapshot.highlights),
            };
          });
        }

        setPendingBackupArchive(null);
        notify(
          mode === 'replace'
            ? `Restored ${snapshot.books.length} books from backup`
            : `Merged ${snapshot.books.length} books from backup`,
          'success'
        );
      } catch (err) {
        notify(
          'Backup restore failed',
          'error',
          err instanceof Error ? err.message : undefined
        );
      } finally {
        setIsRestoringBackup(false);
      }
    },
    [pendingBackupArchive, updateLibraryState, notify]
  );

  // Active folder removal context (for Drag Dock & Context Menu)
  const activeFolderRemovalTarget = useMemo(() => {
    if (drilledViewFolder) {
      return {
        kind: 'view' as const,
        id: drilledViewFolder.id,
        name: drilledViewFolder.name,
      };
    }
    if (activeFilter.kind === 'folder') {
      const f = folders.find((item) => item.id === activeFilter.id);
      if (f) return {kind: 'sidebar' as const, id: f.id, name: f.name};
    }
    return null;
  }, [drilledViewFolder, activeFilter, folders]);

  const handleRemoveBooksFromCurrentFolder = useCallback(
    (bookIds: string[]) => {
      if (!activeFolderRemovalTarget) return;
      if (activeFolderRemovalTarget.kind === 'view') {
        handleToggleViewFolderMembership(bookIds, activeFolderRemovalTarget.id, false);
      } else {
        handleToggleSidebarFolderMembership(bookIds, activeFolderRemovalTarget.id, false);
      }
      notify(`Removed from "${activeFolderRemovalTarget.name}"`, 'info');
    },
    [
      activeFolderRemovalTarget,
      handleToggleViewFolderMembership,
      handleToggleSidebarFolderMembership,
      notify,
    ]
  );

  const hasActiveFilters =
    formatFilter !== 'all' ||
    selectedTags.length > 0 ||
    searchQuery.trim().length > 0 ||
    prefs.groupBy !== 'none';

  // If a book tab is active, render the full Reader Studio viewport
  if (activeBook) {
    return (
      <div className="h-[calc(100dvh-6.75rem)] lg:h-dvh w-full overflow-hidden">
        <ReaderView
          book={activeBook}
          openBooks={openBooks}
          prefs={prefs.reader}
          zenMode={zenMode}
          onToggleZenMode={onToggleZenMode}
          onUpdatePrefs={updateReaderPrefs}
          onResetPrefs={resetReaderPrefs}
          onToggleTheme={handleCycleReaderSurface}
          onBookProgressUpdate={handleUpdateBook}
          onSelectLibrary={() => setActiveBookId(null)}
          onSelectBookTab={(id) => setActiveBookId(id)}
          onCloseBookTab={handleCloseBookTab}
          onSendHighlightToNotes={(bookTitle, excerpt, locationLabel) => {
            sendBookExcerptToNotes(bookTitle, excerpt, locationLabel);
          }}
          onNarrationStart={onMuteBackgroundStreamer}
          onAnnotationsChange={() => void syncLibraryAnnotationsFromDb()}
          onNotify={(title, tone) => notify(title, tone)}
        />
      </div>
    );
  }

  return (
    <div
      className="h-[calc(100dvh-6.75rem)] lg:h-dvh flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] overflow-hidden relative"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsFileDragActive(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsFileDragActive(false);
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          setIsFileDragActive(false);
          void handleImportFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* Hidden File Importer */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".epub,.pdf,.mobi,.prc,.azw,application/epub+zip,application/pdf"
        onChange={(e) => {
          if (e.target.files) void handleImportFiles(e.target.files);
          e.target.value = '';
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

      {/* Main Library Studio Shell: Collapsible Left Rail · Center Shelf · Optional Split Inspector */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <LibrarySidebar
          books={books}
          folders={folders}
          categories={categories}
          allTags={allTags}
          totalHighlightsCount={highlights.length}
          activeFilter={activeFilter}
          selectedTags={selectedTags}
          collapsedSections={prefs.collapsedSections}
          sidebarWidth={prefs.sidebarWidth}
          isExportingBackup={isExportingBackup}
          isParsingBackup={isParsingBackup}
          onSidebarWidthChange={(w) => updateUiPrefs({sidebarWidth: w})}
          onToggleSection={toggleSidebarSection}
          onSelectFilter={(filter) => setActiveFilter(filter)}
          onToggleTag={(tag) =>
            setSelectedTags((prev) =>
              prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
            )
          }
          onClearTags={() => setSelectedTags([])}
          onCreateFolder={(name, parentId, color) => {
            void handleCreateFolder(name, parentId ?? null, color ?? 'neutral');
          }}
          onUpdateFolder={handleUpdateFolder}
          onDeleteFolder={handleDeleteFolder}
          onCreateCategory={(name) => {
            void handleCreateCategory(name);
          }}
          onDeleteCategory={handleDeleteCategory}
          onDropBooksToFolder={handleDropBooksToSidebarFolder}
          onDropBooksToCategory={(bookIds, categoryId) => {
            const set = new Set(bookIds);
            updateLibraryState((prev) => ({
              books: prev.books.map((b) => (set.has(b.id) ? {...b, categoryId} : b)),
            }));
            notify('Category updated', 'success');
          }}
          onDropBooksToTag={(bookIds, tagName) => {
            const set = new Set(bookIds);
            updateLibraryState((prev) => ({
              books: prev.books.map((b) =>
                set.has(b.id)
                  ? {...b, tags: Array.from(new Set([...b.tags, tagName]))}
                  : b
              ),
            }));
            notify(`Tagged with #${tagName}`, 'success');
          }}
          onDropBooksToFavorites={(bookIds) => {
            const set = new Set(bookIds);
            updateLibraryState((prev) => ({
              books: prev.books.map((b) => (set.has(b.id) ? {...b, isFavorite: true} : b)),
            }));
            notify('Added to Favorites', 'success');
          }}
          onExportBackup={() => void handleExportBackup()}
          onSelectImportBackupFile={(file) => void handleSelectBackupFile(file)}
          onOpenStorageManager={() => setStorageManagerOpen(true)}
          isCollapsedDesktop={prefs.sidebarCollapsedDesktop}
          onCollapseDesktop={() => updateUiPrefs({sidebarCollapsedDesktop: true})}
          isOpenMobile={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        {/* Center Library Workspace */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Top Library Command Bar */}
          <header className="h-14 px-3 sm:px-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2 sm:gap-3 shrink-0">
            {/* Left: Sidebar toggle + Active View Title */}
            <div className="flex items-center gap-2 min-w-0">
              {prefs.sidebarCollapsedDesktop && (
                <button
                  type="button"
                  onClick={() => updateUiPrefs({sidebarCollapsedDesktop: false})}
                  title="Show shelves sidebar"
                  aria-label="Show shelves sidebar"
                  className="hidden lg:inline-flex p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open library shelves"
                className="lg:hidden min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                <PanelLeftOpen className="w-4.5 h-4.5" />
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="font-serif-editorial text-base sm:text-lg font-semibold text-[var(--text-primary)] truncate">
                    {drilledViewFolder ? drilledViewFolder.name : activeViewLabel}
                  </h1>
                  <span className="font-mono-tabular text-xs text-[var(--text-muted)] shrink-0">
                    {activeFilter.kind === 'smart' && activeFilter.id === 'highlights'
                      ? highlights.length
                      : visibleBooks.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Center: Search & Command Palette */}
            {!(activeFilter.kind === 'smart' && activeFilter.id === 'highlights') && (
              <div className="hidden md:flex items-center gap-1.5 flex-1 max-w-sm">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter titles, authors, tags…"
                    className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setCommandPaletteOpen(true)}
                  title="Command Palette (Cmd/Ctrl+K)"
                  className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-mono-tabular rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer shrink-0"
                >
                  <Command className="w-3 h-3" />
                  <span>K</span>
                </button>
              </div>
            )}

            {/* Right: Controls & Import */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 relative">
              {!(activeFilter.kind === 'smart' && activeFilter.id === 'highlights') && (
                <>
                  {/* Desktop View Mode Toggle */}
                  <div className="hidden lg:inline-flex items-center p-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
                    <button
                      type="button"
                      onClick={() => updateUiPrefs({viewMode: 'grid'})}
                      title="Grid view"
                      aria-label="Grid view"
                      className={`p-1.5 rounded transition-colors cursor-pointer ${
                        prefs.viewMode === 'grid'
                          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateUiPrefs({viewMode: 'table'})}
                      title="Table view"
                      aria-label="Table view"
                      className={`p-1.5 rounded transition-colors cursor-pointer ${
                        prefs.viewMode === 'table'
                          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Desktop Display Options Popover Trigger */}
                  <div className="hidden lg:block relative">
                    <button
                      type="button"
                      onClick={() => setDisplayPopoverOpen((v) => !v)}
                      title="Cover size & card metadata display"
                      className={`inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                        displayPopoverOpen
                          ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                    </button>
                    {displayPopoverOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setDisplayPopoverOpen(false)}
                        />
                        <div className="absolute right-0 top-10 z-40">
                          <DisplayOptionsPopover
                            coverSize={prefs.coverSize}
                            cardDetails={prefs.cardDetails}
                            onCoverSizeChange={(coverSize) => updateUiPrefs({coverSize})}
                            onCardDetailsChange={updateCardDetails}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Desktop Inspector Toggle */}
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
                    className={`hidden md:inline-flex p-1.5 rounded-md border transition-colors cursor-pointer ${
                      inspectorOpen
                        ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <PanelRight className="w-3.5 h-3.5" />
                  </button>

                  {/* Mobile Filter/Sort Trigger */}
                  <button
                    type="button"
                    onClick={() => setMobileFilterSheetOpen(true)}
                    aria-label="Filter and sort books"
                    className={`lg:hidden min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-md border transition-colors cursor-pointer ${
                      hasActiveFilters
                        ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                  </button>
                </>
              )}

              {/* Storage Manager Quick Button */}
              <button
                type="button"
                onClick={() => setStorageManagerOpen(true)}
                title="Offline Storage Manager & Deduplication"
                aria-label="Storage Manager"
                className="hidden sm:inline-flex p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <HardDrive className="w-3.5 h-3.5" />
              </button>

              {/* Primary Import CTA */}
              <button
                type="button"
                disabled={isImporting}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isImporting ? 'Importing…' : 'Import'}</span>
              </button>
            </div>
          </header>

          {/* Secondary Compact Filter / Sort / Drill-Down Bar (when viewing Books) */}
          {!(activeFilter.kind === 'smart' && activeFilter.id === 'highlights') && (
            <div className="px-3 sm:px-5 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 flex flex-wrap items-center justify-between gap-2 shrink-0">
              {/* Mobile inline search */}
              <div className="md:hidden relative w-full">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search library…"
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Left: Drill-down Breadcrumb OR Format Filter + Select Mode */}
              <div className="flex flex-wrap items-center gap-2">
                {drilledViewFolder ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDrilledViewFolderId(null)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to {activeViewLabel}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingBooksToViewFolder(drilledViewFolder)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>Add Books</span>
                    </button>
                  </div>
                ) : (
                  <div className="hidden lg:inline-flex items-center p-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px]">
                    {(['all', 'epub', 'pdf', 'mobi'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setFormatFilter(fmt)}
                        className={`px-2 py-0.5 rounded uppercase font-medium transition-colors cursor-pointer ${
                          formatFilter === fmt
                            ? 'bg-[var(--bg-elevated)] text-[var(--accent)] shadow-xs'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                )}

                {selectedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setSelectedTags((prev) => prev.filter((t) => t !== tag))
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-[var(--accent)]/40 bg-[var(--bg-accent-subtle)] text-[var(--accent)] cursor-pointer"
                  >
                    <span>#{tag}</span>
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>

              {/* Right: Desktop Group, Sort, Direction & Multi-Select Toggle */}
              <div className="hidden lg:flex items-center gap-2">
                <select
                  value={prefs.groupBy}
                  onChange={(e) =>
                    updateUiPrefs({groupBy: e.target.value as GroupByField})
                  }
                  aria-label="Group books by"
                  className="px-2 py-1 text-[11px] rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] cursor-pointer"
                >
                  <option value="none">No grouping</option>
                  <option value="status">Group: Status</option>
                  <option value="format">Group: Format</option>
                  <option value="author">Group: Author</option>
                  <option value="category">Group: Category</option>
                </select>

                <select
                  value={prefs.sortField}
                  onChange={(e) =>
                    updateUiPrefs({sortField: e.target.value as SortField})
                  }
                  aria-label="Sort books by"
                  className="px-2 py-1 text-[11px] rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] cursor-pointer"
                >
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
                  onClick={() =>
                    updateUiPrefs({
                      sortDirection: prefs.sortDirection === 'asc' ? 'desc' : 'asc',
                    })
                  }
                  title={
                    prefs.sortDirection === 'asc' ? 'Ascending order' : 'Descending order'
                  }
                  aria-label="Toggle sort direction"
                  className="p-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {prefs.sortDirection === 'asc' ? (
                    <ArrowUpNarrowWide className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownWideNarrow className="w-3.5 h-3.5" />
                  )}
                </button>

                {visibleBooks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedIds.size > 0) setSelectedIds(new Set());
                      else setSelectedIds(new Set([visibleBooks[0].id]));
                    }}
                    title={selectedIds.size > 0 ? 'Exit selection' : 'Select multiple books'}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border transition-colors cursor-pointer ${
                      selectedIds.size > 0
                        ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Main Scrollable Content Area */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {activeFilter.kind === 'smart' && activeFilter.id === 'highlights' ? (
              <HighlightsHubView
                books={books}
                highlights={highlights}
                onOpenPassage={(book, unitIndex) => handleOpenBook(book, unitIndex)}
                onUpdateHighlight={(hl) => void handleUpdateHighlight(hl)}
                onDeleteHighlight={(id) => void handleDeleteHighlight(id)}
                onSendToNotes={(bookTitle, excerpt, loc) =>
                  sendBookExcerptToNotes(bookTitle, excerpt, loc)
                }
                onBackToBooks={() => setActiveFilter({kind: 'smart', id: 'all'})}
              />
            ) : books.length === 0 ? (
              <EmptyLibraryDropzone
                onFilesSelected={(files) => void handleImportFiles(files)}
                onBrowseClick={() => fileInputRef.current?.click()}
                isImporting={isImporting}
              />
            ) : (
              <div className="p-4 sm:p-6 lg:p-7 pb-28 space-y-7 max-w-[1600px] mx-auto">
                {/* Continue Reading Editorial Shelf (All Books top-level) */}
                {activeFilter.kind === 'smart' &&
                  activeFilter.id === 'all' &&
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
                        setActiveFilter({kind: 'smart', id: 'highlights'})
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
                      updateUiPrefs({viewFolderDisplayMode})
                    }
                    onCardLayoutChange={(viewFolderCardLayout) =>
                      updateUiPrefs({viewFolderCardLayout})
                    }
                    onToggleHideFiled={() =>
                      updateUiPrefs({hideFiledBooks: !prefs.hideFiledBooks})
                    }
                    onCreateFolder={(name) => void handleCreateViewFolder(name)}
                    onRenameFolder={handleRenameViewFolder}
                    onDeleteFolder={handleDeleteViewFolder}
                    onOpenFolder={(fid) => setDrilledViewFolderId(fid)}
                    onRequestAddBooks={(vf) => setAddingBooksToViewFolder(vf)}
                    onDropBooksToViewFolder={handleDropBooksToViewFolder}
                    onRemoveBookFromViewFolder={(bookId, folderId) =>
                      handleToggleViewFolderMembership([bookId], folderId, false)
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
                    <p className="font-serif-editorial text-base text-[var(--text-primary)]">
                      No books in this view
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {hasActiveFilters
                        ? 'Try clearing search or format filters.'
                        : drilledViewFolder
                          ? 'Use "Add Books" above or drag covers onto this shelf.'
                          : 'Import EPUB, PDF, or MOBI files to grow this collection.'}
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setFormatFilter('all');
                          setSelectedTags([]);
                          updateUiPrefs({groupBy: 'none'});
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
                          {prefs.viewMode === 'table' ? (
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
                              onSortChange={(field) => {
                                if (prefs.sortField === field) {
                                  updateUiPrefs({
                                    sortDirection:
                                      prefs.sortDirection === 'asc' ? 'desc' : 'asc',
                                  });
                                } else {
                                  updateUiPrefs({sortField: field, sortDirection: 'asc'});
                                }
                              }}
                              onToggleSelect={handleToggleSelectBook}
                              onToggleSelectAll={() => {
                                const allInGroup = group.books.every((b) =>
                                  selectedIds.has(b.id)
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
                              onOpenBook={(book) => handleOpenBook(book)}
                              onInspectBook={(book) => {
                                setInspectedBookId(book.id);
                                setInspectorOpen(true);
                              }}
                              onEditBook={(book) => setEditingBookId(book.id)}
                              onToggleFavorite={handleToggleFavorite}
                              onToggleSelect={handleToggleSelectBook}
                              onRemoveFromFolder={
                                drilledViewFolder
                                  ? (book) =>
                                      handleToggleViewFolderMembership(
                                        [book.id],
                                        drilledViewFolder.id,
                                        false
                                      )
                                  : undefined
                              }
                              onQuickAction={(book) => setMobileActionBook(book)}
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
                            onOpenBook={(book) => handleOpenBook(book)}
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
          <p className="font-serif-editorial text-lg font-semibold text-[var(--text-primary)]">
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
          activeFolderRemovalTarget ? handleRemoveBooksFromCurrentFolder : undefined
        }
        onSetReadingStatus={(bookIds, status: ReadingStatus) => {
          const set = new Set(bookIds);
          updateLibraryState((prev) => ({
            books: prev.books.map((b) => (set.has(b.id) ? {...b, status} : b)),
          }));
        }}
        onSetFavorite={(bookIds, favorite) => {
          const set = new Set(bookIds);
          updateLibraryState((prev) => ({
            books: prev.books.map((b) =>
              set.has(b.id) ? {...b, isFavorite: favorite} : b
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
        onSelectAll={() => setSelectedIds(new Set(visibleBooks.map((b) => b.id)))}
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
              set.has(b.id) ? {...b, isFavorite: !allFav} : b
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
          folders={folders}
          categories={categories}
          existingTags={existingTagNames}
          onSave={(updated) => {
            handleUpdateBook(updated);
            setEditingBookId(null);
            notify('Metadata saved', 'success');
          }}
          onReplaceFile={handleReplaceBookFile}
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
        onAdd={() => handleConfirmFolderDrop('add')}
        onMove={() => handleConfirmFolderDrop('move')}
        onCancel={() => setPendingFolderDrop(null)}
      />

      {/* Confirm Delete Modal */}
      {booksPendingDelete.length > 0 && (
        <ConfirmDeleteModal
          booksToDelete={booksPendingDelete}
          onConfirm={() =>
            void handleDeleteBooksConfirmed(booksPendingDelete.map((b) => b.id))
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
        onDeleteBooks={handleDeleteBooksConfirmed}
        onEditMetadata={(book) => {
          setStorageManagerOpen(false);
          setEditingBookId(book.id);
        }}
        onImportBooks={() => {
          setStorageManagerOpen(false);
          fileInputRef.current?.click();
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
        onSelectFolder={(folderId) => setActiveFilter({kind: 'folder', id: folderId})}
        onSelectCategory={(catId) => setActiveFilter({kind: 'category', id: catId})}
        onOpenHighlightsHub={() => setActiveFilter({kind: 'smart', id: 'highlights'})}
        onImportBooks={() => fileInputRef.current?.click()}
        onOpenStorageManager={() => setStorageManagerOpen(true)}
        onToggleTheme={handleCycleReaderSurface}
        onToggleInspector={() => setInspectorOpen((v) => !v)}
      />

      {/* Mobile Sheets */}
      <MobileBookActionSheet
        book={mobileActionBook}
        activeDrilledFolderName={drilledViewFolder?.name ?? null}
        onClose={() => setMobileActionBook(null)}
        onReadBook={(book) => handleOpenBook(book)}
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
                handleToggleViewFolderMembership([book.id], drilledViewFolder.id, false)
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
        onGroupByChange={(groupBy) => updateUiPrefs({groupBy})}
        onSortFieldChange={(sortField) => updateUiPrefs({sortField})}
        onToggleSortDirection={() =>
          updateUiPrefs({
            sortDirection: prefs.sortDirection === 'asc' ? 'desc' : 'asc',
          })
        }
        onCoverSizeChange={(coverSize) => updateUiPrefs({coverSize})}
        onCardDetailsChange={updateCardDetails}
        onToggleHideFiled={() =>
          updateUiPrefs({hideFiledBooks: !prefs.hideFiledBooks})
        }
        onResetFilters={() => {
          setFormatFilter('all');
          setSelectedTags([]);
          setSearchQuery('');
          updateUiPrefs({groupBy: 'none'});
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
    </div>
  );
};
