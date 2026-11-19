import {
  Check,
  Folder,
  FolderPlus,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Star,
  Tag,
  X,
} from 'lucide-react';
import React, {useEffect, useMemo, useState} from 'react';
import {
  COVER_PALETTES,
  flattenFoldersHierarchy,
  getBookFolderIds,
  getFolderColorHex,
} from '../../lib/formatters';
import type {
  BookRecord,
  CategoryRecord,
  FolderRecord,
  ReadingStatus,
  ViewFolderRecord,
} from '../../types/library';

export interface BulkEditPatch {
  addViewFolderIds: string[];
  removeViewFolderIds: string[];
  addSidebarFolderIds: string[];
  removeSidebarFolderIds: string[];
  addTags: string[];
  removeTags: string[];
  subtitle?: string;
  author?: string;
  series?: string;
  publisher?: string;
  language?: string;
  categoryAction: 'keep' | 'set' | 'clear';
  categoryId: string | null;
  statusAction: 'keep' | ReadingStatus;
  favoriteAction: 'keep' | 'favorite' | 'unfavorite';
  resetProgress: boolean;
}

interface BulkEditModalProps {
  selectedBooks: BookRecord[];
  activeViewLabel: string;
  currentViewFolders: ViewFolderRecord[];
  folders: FolderRecord[];
  categories: CategoryRecord[];
  existingTags: string[];
  onCreateViewFolder: (name: string) => Promise<ViewFolderRecord | undefined>;
  onCreateFolder: (name: string) => Promise<FolderRecord>;
  onApply: (patch: BulkEditPatch) => void;
  onClose: () => void;
}

type InitialMembership = 'all' | 'some' | 'none';
type StagedOverride = 'unchanged' | 'add' | 'remove';

function nextTriStateOverride(
  initial: InitialMembership,
  current: StagedOverride
): StagedOverride {
  if (initial === 'none') {
    return current === 'add' ? 'unchanged' : 'add';
  }
  if (initial === 'all') {
    return current === 'remove' ? 'unchanged' : 'remove';
  }
  // initial === 'some'
  if (current === 'unchanged') return 'add';
  if (current === 'add') return 'remove';
  return 'unchanged';
}

function getSharedFieldValue(books: BookRecord[], getter: (b: BookRecord) => string): {
  shared: string | null;
  isMixed: boolean;
} {
  if (books.length === 0) return {shared: '', isMixed: false};
  const first = getter(books[0]);
  const allSame = books.every((b) => getter(b) === first);
  return allSame ? {shared: first, isMixed: false} : {shared: null, isMixed: true};
}

export const BulkEditModal: React.FC<BulkEditModalProps> = ({
  selectedBooks,
  activeViewLabel,
  currentViewFolders,
  folders,
  categories,
  existingTags,
  onCreateViewFolder,
  onCreateFolder,
  onApply,
  onClose,
}) => {
  const selectedCount = selectedBooks.length;
  const selectedBookIds = useMemo(() => selectedBooks.map((b) => b.id), [selectedBooks]);

  // Folder search & staged tri-state overrides
  const [folderQuery, setFolderQuery] = useState('');
  const [viewFolderOverrides, setViewFolderOverrides] = useState<Record<string, StagedOverride>>(
    {}
  );
  const [sidebarFolderOverrides, setSidebarFolderOverrides] = useState<
    Record<string, StagedOverride>
  >({});

  // Inline folder creation
  const [creatingViewFolder, setCreatingViewFolder] = useState(false);
  const [newViewFolderName, setNewViewFolderName] = useState('');
  const [creatingSidebarFolder, setCreatingSidebarFolder] = useState(false);
  const [newSidebarFolderName, setNewSidebarFolderName] = useState('');

  // Visual tag manager state
  const [tagOverrides, setTagOverrides] = useState<Record<string, StagedOverride>>({});
  const [customAddedTags, setCustomAddedTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');

  // Metadata fields (tracked with dirty flags so untouched fields are never overwritten)
  const [subtitleValue, setSubtitleValue] = useState('');
  const [subtitleDirty, setSubtitleDirty] = useState(false);
  const [authorValue, setAuthorValue] = useState('');
  const [authorDirty, setAuthorDirty] = useState(false);
  const [seriesValue, setSeriesValue] = useState('');
  const [seriesDirty, setSeriesDirty] = useState(false);
  const [publisherValue, setPublisherValue] = useState('');
  const [publisherDirty, setPublisherDirty] = useState(false);
  const [languageValue, setLanguageValue] = useState('');
  const [languageDirty, setLanguageDirty] = useState(false);
  const [categorySelect, setCategorySelect] = useState<string>('__keep__');

  // Reading & Favorite controls
  const [statusAction, setStatusAction] = useState<'keep' | ReadingStatus>('keep');
  const [favoriteAction, setFavoriteAction] = useState<'keep' | 'favorite' | 'unfavorite'>('keep');
  const [resetProgress, setResetProgress] = useState(false);

  // Escape to close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const flatSidebarFolders = useMemo(() => flattenFoldersHierarchy(folders), [folders]);

  // Initial membership maps across selectedBooks
  const initialViewFolderState = useMemo(() => {
    const map = new Map<string, InitialMembership>();
    for (const vf of currentViewFolders) {
      const count = selectedBookIds.filter((id) => vf.bookIds.includes(id)).length;
      map.set(vf.id, count === 0 ? 'none' : count === selectedCount ? 'all' : 'some');
    }
    return map;
  }, [currentViewFolders, selectedBookIds, selectedCount]);

  const initialSidebarFolderState = useMemo(() => {
    const map = new Map<string, InitialMembership>();
    for (const f of folders) {
      const count = selectedBooks.filter((b) => getBookFolderIds(b).includes(f.id)).length;
      map.set(f.id, count === 0 ? 'none' : count === selectedCount ? 'all' : 'some');
    }
    return map;
  }, [folders, selectedBooks, selectedCount]);

  // All displayable tags (library catalog + selected books + newly added)
  const allTagEntries = useMemo(() => {
    const byLower = new Map<string, string>();
    for (const t of existingTags) byLower.set(t.toLowerCase(), t);
    for (const b of selectedBooks) {
      for (const t of b.tags) {
        if (!byLower.has(t.toLowerCase())) byLower.set(t.toLowerCase(), t);
      }
    }
    for (const t of customAddedTags) {
      if (!byLower.has(t.toLowerCase())) byLower.set(t.toLowerCase(), t);
    }

    return Array.from(byLower.entries())
      .map(([lower, label]) => {
        const count = selectedBooks.filter((b) =>
          b.tags.some((t) => t.toLowerCase() === lower)
        ).length;
        const initial: InitialMembership =
          count === 0 ? 'none' : count === selectedCount ? 'all' : 'some';
        return {lower, label, initial};
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [existingTags, selectedBooks, customAddedTags, selectedCount]);

  // Shared metadata placeholders
  const subtitleMeta = useMemo(
    () => getSharedFieldValue(selectedBooks, (b) => b.subtitle ?? ''),
    [selectedBooks]
  );
  const authorMeta = useMemo(
    () => getSharedFieldValue(selectedBooks, (b) => b.author),
    [selectedBooks]
  );
  const seriesMeta = useMemo(
    () => getSharedFieldValue(selectedBooks, (b) => b.series),
    [selectedBooks]
  );
  const publisherMeta = useMemo(
    () => getSharedFieldValue(selectedBooks, (b) => b.publisher),
    [selectedBooks]
  );
  const languageMeta = useMemo(
    () => getSharedFieldValue(selectedBooks, (b) => b.language),
    [selectedBooks]
  );

  // Filtered folder lists
  const normalizedFolderQuery = folderQuery.trim().toLowerCase();
  const filteredViewFolders = useMemo(
    () =>
      normalizedFolderQuery
        ? currentViewFolders.filter((vf) => vf.name.toLowerCase().includes(normalizedFolderQuery))
        : currentViewFolders,
    [currentViewFolders, normalizedFolderQuery]
  );
  const filteredSidebarFolders = useMemo(
    () =>
      normalizedFolderQuery
        ? flatSidebarFolders.filter(({pathLabel}) =>
            pathLabel.toLowerCase().includes(normalizedFolderQuery)
          )
        : flatSidebarFolders,
    [flatSidebarFolders, normalizedFolderQuery]
  );

  // Compute staged deltas
  const addViewFolderIds = useMemo(
    () =>
      Object.entries(viewFolderOverrides)
        .filter(([, v]) => v === 'add')
        .map(([k]) => k),
    [viewFolderOverrides]
  );
  const removeViewFolderIds = useMemo(
    () =>
      Object.entries(viewFolderOverrides)
        .filter(([, v]) => v === 'remove')
        .map(([k]) => k),
    [viewFolderOverrides]
  );
  const addSidebarFolderIds = useMemo(
    () =>
      Object.entries(sidebarFolderOverrides)
        .filter(([, v]) => v === 'add')
        .map(([k]) => k),
    [sidebarFolderOverrides]
  );
  const removeSidebarFolderIds = useMemo(
    () =>
      Object.entries(sidebarFolderOverrides)
        .filter(([, v]) => v === 'remove')
        .map(([k]) => k),
    [sidebarFolderOverrides]
  );

  const addTags = useMemo(() => {
    const out: string[] = [];
    for (const entry of allTagEntries) {
      if (tagOverrides[entry.lower] === 'add') {
        out.push(entry.label);
      }
    }
    return out;
  }, [allTagEntries, tagOverrides]);

  const removeTags = useMemo(() => {
    const out: string[] = [];
    for (const entry of allTagEntries) {
      if (tagOverrides[entry.lower] === 'remove') {
        out.push(entry.label);
      }
    }
    return out;
  }, [allTagEntries, tagOverrides]);

  // Section dirty flags
  const foldersDirty =
    addViewFolderIds.length > 0 ||
    removeViewFolderIds.length > 0 ||
    addSidebarFolderIds.length > 0 ||
    removeSidebarFolderIds.length > 0;
  const tagsDirty = addTags.length > 0 || removeTags.length > 0;
  const metadataDirty =
    subtitleDirty ||
    authorDirty ||
    seriesDirty ||
    publisherDirty ||
    languageDirty ||
    categorySelect !== '__keep__';
  const readingDirty = statusAction !== 'keep' || favoriteAction !== 'keep' || resetProgress;

  // Live Pending Changes Summary Items
  const pendingSummaryItems = useMemo(() => {
    const items: string[] = [];
    const totalFolderAdds = addViewFolderIds.length + addSidebarFolderIds.length;
    const totalFolderRemoves = removeViewFolderIds.length + removeSidebarFolderIds.length;
    if (totalFolderAdds > 0) {
      items.push(`+${totalFolderAdds} ${totalFolderAdds === 1 ? 'folder' : 'folders'}`);
    }
    if (totalFolderRemoves > 0) {
      items.push(`-${totalFolderRemoves} ${totalFolderRemoves === 1 ? 'folder' : 'folders'}`);
    }
    if (addTags.length > 0) {
      items.push(`+${addTags.length} ${addTags.length === 1 ? 'tag' : 'tags'}`);
    }
    if (removeTags.length > 0) {
      items.push(`-${removeTags.length} ${removeTags.length === 1 ? 'tag' : 'tags'}`);
    }
    if (subtitleDirty) {
      items.push(subtitleValue.trim() ? `Subtitle → ${subtitleValue.trim()}` : 'Clear Subtitle');
    }
    if (authorDirty && authorValue.trim()) {
      items.push(`Author → ${authorValue.trim()}`);
    }
    if (seriesDirty) {
      items.push(seriesValue.trim() ? `Series → ${seriesValue.trim()}` : 'Clear Series');
    }
    if (publisherDirty) {
      items.push(publisherValue.trim() ? `Publisher → ${publisherValue.trim()}` : 'Clear Publisher');
    }
    if (languageDirty && languageValue.trim()) {
      items.push(`Language → ${languageValue.trim()}`);
    }
    if (categorySelect === '__clear__') {
      items.push('Clear Category');
    } else if (categorySelect !== '__keep__') {
      const catName = categories.find((c) => c.id === categorySelect)?.name;
      if (catName) items.push(`Category → ${catName}`);
    }
    if (statusAction !== 'keep') {
      const labelMap: Record<ReadingStatus, string> = {
        unread: 'Mark Unread',
        reading: 'Mark Reading',
        finished: 'Mark Finished',
      };
      items.push(labelMap[statusAction]);
    }
    if (favoriteAction === 'favorite') items.push('Favorite');
    if (favoriteAction === 'unfavorite') items.push('Unfavorite');
    if (resetProgress) items.push('Reset progress to 0%');
    return items;
  }, [
    addViewFolderIds.length,
    addSidebarFolderIds.length,
    removeViewFolderIds.length,
    removeSidebarFolderIds.length,
    addTags.length,
    removeTags.length,
    subtitleDirty,
    subtitleValue,
    authorDirty,
    authorValue,
    seriesDirty,
    seriesValue,
    publisherDirty,
    publisherValue,
    languageDirty,
    languageValue,
    categorySelect,
    categories,
    statusAction,
    favoriteAction,
    resetProgress,
  ]);

  const hasChanges = pendingSummaryItems.length > 0;

  const resetFolders = () => {
    setViewFolderOverrides({});
    setSidebarFolderOverrides({});
  };

  const resetTags = () => {
    setTagOverrides({});
    setCustomAddedTags([]);
    setNewTagInput('');
  };

  const resetMetadata = () => {
    setSubtitleValue('');
    setSubtitleDirty(false);
    setAuthorValue('');
    setAuthorDirty(false);
    setSeriesValue('');
    setSeriesDirty(false);
    setPublisherValue('');
    setPublisherDirty(false);
    setLanguageValue('');
    setLanguageDirty(false);
    setCategorySelect('__keep__');
  };

  const resetReading = () => {
    setStatusAction('keep');
    setFavoriteAction('keep');
    setResetProgress(false);
  };

  const resetAll = () => {
    resetFolders();
    resetTags();
    resetMetadata();
    resetReading();
  };

  const handleAddTagDraft = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    setCustomAddedTags((prev) => {
      const next = [...prev];
      for (const p of parts) {
        if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) {
          next.push(p);
        }
      }
      return next;
    });
    setTagOverrides((prev) => {
      const next = {...prev};
      for (const p of parts) {
        next[p.toLowerCase()] = 'add';
      }
      return next;
    });
    setNewTagInput('');
  };

  const handleQuickCreateViewFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newViewFolderName.trim();
    if (!trimmed) return;
    const created = await onCreateViewFolder(trimmed);
    if (created) {
      setViewFolderOverrides((prev) => ({...prev, [created.id]: 'add'}));
    }
    setNewViewFolderName('');
    setCreatingViewFolder(false);
  };

  const handleQuickCreateSidebarFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSidebarFolderName.trim();
    if (!trimmed) return;
    const created = await onCreateFolder(trimmed);
    setSidebarFolderOverrides((prev) => ({...prev, [created.id]: 'add'}));
    setNewSidebarFolderName('');
    setCreatingSidebarFolder(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges) return;

    onApply({
      addViewFolderIds,
      removeViewFolderIds,
      addSidebarFolderIds,
      removeSidebarFolderIds,
      addTags,
      removeTags,
      ...(subtitleDirty ? {subtitle: subtitleValue.trim()} : {}),
      ...(authorDirty && authorValue.trim() ? {author: authorValue.trim()} : {}),
      ...(seriesDirty ? {series: seriesValue.trim()} : {}),
      ...(publisherDirty ? {publisher: publisherValue.trim()} : {}),
      ...(languageDirty && languageValue.trim() ? {language: languageValue.trim()} : {}),
      categoryAction:
        categorySelect === '__keep__'
          ? 'keep'
          : categorySelect === '__clear__'
            ? 'clear'
            : 'set',
      categoryId:
        categorySelect !== '__keep__' && categorySelect !== '__clear__' ? categorySelect : null,
      statusAction,
      favoriteAction,
      resetProgress,
    });
  };

  const renderTriStateCheckbox = (
    initial: InitialMembership,
    override: StagedOverride
  ) => {
    const visual: 'checked' | 'indeterminate' | 'unchecked' =
      override === 'add'
        ? 'checked'
        : override === 'remove'
          ? 'unchecked'
          : initial === 'all'
            ? 'checked'
            : initial === 'some'
              ? 'indeterminate'
              : 'unchecked';

    return (
      <span
        className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
          visual === 'checked'
            ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]'
            : visual === 'indeterminate'
              ? 'bg-[var(--bg-accent-subtle)] border-[var(--accent)] text-[var(--accent)]'
              : override === 'remove'
                ? 'border-[var(--danger)]/60 bg-[var(--danger)]/8 text-transparent'
                : 'border-[var(--border-strong)] bg-[var(--bg-input)] text-transparent'
        }`}
      >
        {visual === 'checked' && <Check className="w-3 h-3 stroke-[2.75]" />}
        {visual === 'indeterminate' && <Minus className="w-3 h-3 stroke-[2.75]" />}
      </span>
    );
  };

  const renderStateLabel = (initial: InitialMembership, override: StagedOverride) => {
    if (override === 'add') {
      return <span className="text-[11px] font-medium text-[var(--accent)]">+ Add</span>;
    }
    if (override === 'remove') {
      return <span className="text-[11px] font-medium text-[var(--danger)]">− Remove</span>;
    }
    if (initial === 'all') {
      return <span className="text-[11px] text-[var(--text-muted)]">All</span>;
    }
    if (initial === 'some') {
      return <span className="text-[11px] text-[var(--text-muted)]">Some</span>;
    }
    return null;
  };

  const previewStripBooks = selectedBooks.slice(0, 8);
  const remainingCount = Math.max(0, selectedCount - previewStripBooks.length);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bulk edit books"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header + Selected Books Cover Strip */}
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h2 className="font-serif-editorial text-lg font-semibold text-[var(--text-primary)]">
                  Bulk Edit
                </h2>
                <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
                  {selectedCount} {selectedCount === 1 ? 'book' : 'books'} selected
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Only sections you change will be updated; everything else stays intact.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close bulk edit modal"
              className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Miniature Selected Books Strip */}
          {selectedBooks.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-1.5 shrink-0">
                {previewStripBooks.map((book) => {
                  const palette =
                    COVER_PALETTES[Math.abs(book.coverPaletteIndex) % COVER_PALETTES.length];
                  return (
                    <div
                      key={book.id}
                      title={`${book.title} — ${book.author}`}
                      className="w-7 aspect-[3/4] rounded-[3px] border border-[var(--border-subtle)] overflow-hidden shrink-0 shadow-2xs"
                      style={book.coverDataUrl ? undefined : {backgroundColor: palette.bg}}
                    >
                      {book.coverDataUrl ? (
                        <img
                          src={book.coverDataUrl}
                          alt={book.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full relative">
                          <div
                            className="absolute inset-y-0 left-0 w-[18%]"
                            style={{backgroundColor: palette.spine}}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {remainingCount > 0 && (
                  <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] pl-1">
                    +{remainingCount}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] truncate min-w-0">
                {selectedBooks
                  .slice(0, 3)
                  .map((b) => b.title)
                  .join(' · ')}
                {selectedBooks.length > 3 ? ` · +${selectedBooks.length - 3} more` : ''}
              </p>
            </div>
          )}
        </div>

        {/* Two-Column Scrollable Body */}
        <form
          id="bulk-edit-studio-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)]"
        >
          {/* LEFT COLUMN: Folders & Tags */}
          <div className="p-5 sm:p-6 space-y-6">
            {/* Section 1: Folders (Unified Per-View + Sidebar) */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">Folders</h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Click to add or remove across selection (tri-state)
                  </p>
                </div>
                {foldersDirty && (
                  <button
                    type="button"
                    onClick={resetFolders}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              {/* Search Folders */}
              {(currentViewFolders.length > 0 || flatSidebarFolders.length > 0) && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={folderQuery}
                    onChange={(e) => setFolderQuery(e.target.value)}
                    placeholder="Filter folders..."
                    className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                  />
                  {folderQuery && (
                    <button
                      type="button"
                      onClick={() => setFolderQuery('')}
                      aria-label="Clear folder filter"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* Subsection A: Per-View Folders */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                    In &ldquo;{activeViewLabel}&rdquo;
                  </span>
                  <button
                    type="button"
                    onClick={() => setCreatingViewFolder((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    <FolderPlus className="w-3 h-3" />
                    <span>New</span>
                  </button>
                </div>

                {creatingViewFolder && (
                  <div className="flex items-center gap-1.5 pb-1">
                    <input
                      type="text"
                      autoFocus
                      value={newViewFolderName}
                      onChange={(e) => setNewViewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleQuickCreateViewFolder(e);
                        }
                      }}
                      placeholder={`New folder in ${activeViewLabel}...`}
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-md border border-[var(--accent)] bg-[var(--bg-input)] text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      onClick={(e) => void handleQuickCreateViewFolder(e)}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] cursor-pointer shrink-0"
                    >
                      Create
                    </button>
                  </div>
                )}

                {filteredViewFolders.length === 0 ? (
                  <p className="px-3 py-2 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]">
                    {currentViewFolders.length === 0
                      ? `No folders in "${activeViewLabel}" yet.`
                      : 'No matching view folders.'}
                  </p>
                ) : (
                  <div className="max-h-36 overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] divide-y divide-[var(--border-subtle)]">
                    {filteredViewFolders.map((vf) => {
                      const initial = initialViewFolderState.get(vf.id) ?? 'none';
                      const override = viewFolderOverrides[vf.id] ?? 'unchanged';
                      return (
                        <button
                          key={vf.id}
                          type="button"
                          onClick={() =>
                            setViewFolderOverrides((prev) => ({
                              ...prev,
                              [vf.id]: nextTriStateOverride(initial, override),
                            }))
                          }
                          className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left text-xs hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            {renderTriStateCheckbox(initial, override)}
                            <Folder className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                            <span
                              className={`truncate ${
                                override === 'remove'
                                  ? 'line-through text-[var(--text-muted)]'
                                  : 'text-[var(--text-primary)]'
                              }`}
                            >
                              {vf.name}
                            </span>
                          </span>
                          <span className="shrink-0">{renderStateLabel(initial, override)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Subsection B: Sidebar Library Folders */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                    Library Folders
                  </span>
                  <button
                    type="button"
                    onClick={() => setCreatingSidebarFolder((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    <FolderPlus className="w-3 h-3" />
                    <span>New</span>
                  </button>
                </div>

                {creatingSidebarFolder && (
                  <div className="flex items-center gap-1.5 pb-1">
                    <input
                      type="text"
                      autoFocus
                      value={newSidebarFolderName}
                      onChange={(e) => setNewSidebarFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleQuickCreateSidebarFolder(e);
                        }
                      }}
                      placeholder="New library folder..."
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-md border border-[var(--accent)] bg-[var(--bg-input)] text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      onClick={(e) => void handleQuickCreateSidebarFolder(e)}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] cursor-pointer shrink-0"
                    >
                      Create
                    </button>
                  </div>
                )}

                {filteredSidebarFolders.length === 0 ? (
                  <p className="px-3 py-2 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]">
                    {flatSidebarFolders.length === 0
                      ? 'No library folders created yet.'
                      : 'No matching library folders.'}
                  </p>
                ) : (
                  <div className="max-h-36 overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] divide-y divide-[var(--border-subtle)]">
                    {filteredSidebarFolders.map(({folder, depth, pathLabel}) => {
                      const initial = initialSidebarFolderState.get(folder.id) ?? 'none';
                      const override = sidebarFolderOverrides[folder.id] ?? 'unchanged';
                      return (
                        <button
                          key={folder.id}
                          type="button"
                          title={pathLabel}
                          onClick={() =>
                            setSidebarFolderOverrides((prev) => ({
                              ...prev,
                              [folder.id]: nextTriStateOverride(initial, override),
                            }))
                          }
                          className="w-full py-2 pr-3 flex items-center justify-between gap-2 text-left text-xs hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                          style={{paddingLeft: `${12 + depth * 12}px`}}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            {renderTriStateCheckbox(initial, override)}
                            <Folder
                              className="w-3.5 h-3.5 shrink-0"
                              style={{
                                color: getFolderColorHex(folder.color) ?? 'var(--text-muted)',
                              }}
                            />
                            <span
                              className={`truncate ${
                                override === 'remove'
                                  ? 'line-through text-[var(--text-muted)]'
                                  : 'text-[var(--text-primary)]'
                              }`}
                            >
                              {folder.name}
                            </span>
                          </span>
                          <span className="shrink-0">{renderStateLabel(initial, override)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* Section 2: Visual Tag Manager */}
            <section className="pt-5 border-t border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">Tags</h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Toggle existing tags or add new ones
                  </p>
                </div>
                {tagsDirty && (
                  <button
                    type="button"
                    onClick={resetTags}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      handleAddTagDraft(newTagInput);
                    }
                  }}
                  placeholder="Type a new tag and press Enter..."
                  className="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
                <button
                  type="button"
                  onClick={() => handleAddTagDraft(newTagInput)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>

              {allTagEntries.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  No tags in your library yet. Type one above to add it to all selected books.
                </p>
              ) : (
                <div className="max-h-36 overflow-y-auto flex flex-wrap gap-1.5 pt-0.5">
                  {allTagEntries.map(({lower, label, initial}) => {
                    const override = tagOverrides[lower] ?? 'unchanged';
                    const isStagedAdd = override === 'add';
                    const isStagedRemove = override === 'remove';
                    const isAllExisting = override === 'unchanged' && initial === 'all';
                    const isSomeExisting = override === 'unchanged' && initial === 'some';

                    return (
                      <button
                        key={lower}
                        type="button"
                        onClick={() =>
                          setTagOverrides((prev) => ({
                            ...prev,
                            [lower]: nextTriStateOverride(initial, override),
                          }))
                        }
                        title={
                          isStagedAdd
                            ? 'Staged to add to all selected books'
                            : isStagedRemove
                              ? 'Staged to remove from all selected books'
                              : isAllExisting
                                ? 'Present on all selected books (click to remove)'
                                : isSomeExisting
                                  ? 'Present on some selected books (click to add to all)'
                                  : 'Click to add to all selected books'
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                          isStagedAdd
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] font-medium'
                            : isStagedRemove
                              ? 'border-[var(--danger)]/60 bg-[var(--danger)]/8 text-[var(--danger)] line-through'
                              : isAllExisting
                                ? 'border-[var(--accent)]/60 bg-[var(--bg-accent-subtle)] text-[var(--text-primary)] font-medium'
                                : isSomeExisting
                                  ? 'border-dashed border-[var(--accent)]/70 bg-[var(--bg-surface)] text-[var(--text-primary)]'
                                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {isStagedAdd || isAllExisting ? (
                          <Check className="w-3 h-3 shrink-0" />
                        ) : isStagedRemove ? (
                          <X className="w-3 h-3 shrink-0" />
                        ) : isSomeExisting ? (
                          <Minus className="w-3 h-3 text-[var(--accent)] shrink-0" />
                        ) : (
                          <Tag className="w-3 h-3 opacity-60 shrink-0" />
                        )}
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* RIGHT COLUMN: Catalog Metadata + Reading & Favorite */}
          <div className="p-5 sm:p-6 space-y-6">
            {/* Section 3: Catalog Metadata */}
            <section className="space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                    Catalog Metadata
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Leave untouched to preserve each book&apos;s current value
                  </p>
                </div>
                {metadataDirty && (
                  <button
                    type="button"
                    onClick={resetMetadata}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {/* Subtitle */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">
                      Subtitle
                    </label>
                    {subtitleDirty && (
                      <button
                        type="button"
                        onClick={() => {
                          setSubtitleValue('');
                          setSubtitleDirty(false);
                        }}
                        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        Keep existing
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={subtitleDirty ? subtitleValue : ''}
                    onChange={(e) => {
                      setSubtitleValue(e.target.value);
                      setSubtitleDirty(true);
                    }}
                    placeholder={
                      subtitleMeta.isMixed
                        ? 'Mixed subtitles (keep existing)'
                        : subtitleMeta.shared || 'No subtitle (leave empty to keep)'
                    }
                    className={`w-full px-3 py-2 text-xs rounded-md border bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] ${
                      subtitleDirty ? 'border-[var(--accent)]' : 'border-[var(--border-strong)]'
                    }`}
                  />
                </div>

                {/* Author */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">
                      Author
                    </label>
                    {authorDirty && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthorValue('');
                          setAuthorDirty(false);
                        }}
                        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        Keep existing
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={authorDirty ? authorValue : ''}
                    onChange={(e) => {
                      setAuthorValue(e.target.value);
                      setAuthorDirty(e.target.value.trim().length > 0);
                    }}
                    placeholder={
                      authorMeta.isMixed
                        ? 'Mixed authors (keep existing)'
                        : authorMeta.shared || 'Keep existing'
                    }
                    className={`w-full px-3 py-2 text-xs rounded-md border bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] ${
                      authorDirty ? 'border-[var(--accent)]' : 'border-[var(--border-strong)]'
                    }`}
                  />
                </div>

                {/* Series */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">
                      Series
                    </label>
                    {seriesDirty && (
                      <button
                        type="button"
                        onClick={() => {
                          setSeriesValue('');
                          setSeriesDirty(false);
                        }}
                        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        Keep existing
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={seriesDirty ? seriesValue : ''}
                    onChange={(e) => {
                      setSeriesValue(e.target.value);
                      setSeriesDirty(true);
                    }}
                    placeholder={
                      seriesMeta.isMixed
                        ? 'Mixed series (keep existing)'
                        : seriesMeta.shared || 'No series (leave empty to keep)'
                    }
                    className={`w-full px-3 py-2 text-xs rounded-md border bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] ${
                      seriesDirty ? 'border-[var(--accent)]' : 'border-[var(--border-strong)]'
                    }`}
                  />
                </div>

                {/* Publisher + Language */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-[var(--text-secondary)]">
                        Publisher
                      </label>
                      {publisherDirty && (
                        <button
                          type="button"
                          onClick={() => {
                            setPublisherValue('');
                            setPublisherDirty(false);
                          }}
                          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          Keep
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={publisherDirty ? publisherValue : ''}
                      onChange={(e) => {
                        setPublisherValue(e.target.value);
                        setPublisherDirty(true);
                      }}
                      placeholder={
                        publisherMeta.isMixed
                          ? 'Mixed publishers'
                          : publisherMeta.shared || 'Keep existing'
                      }
                      className={`w-full px-3 py-2 text-xs rounded-md border bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] ${
                        publisherDirty
                          ? 'border-[var(--accent)]'
                          : 'border-[var(--border-strong)]'
                      }`}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-[var(--text-secondary)]">
                        Language
                      </label>
                      {languageDirty && (
                        <button
                          type="button"
                          onClick={() => {
                            setLanguageValue('');
                            setLanguageDirty(false);
                          }}
                          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          Keep
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={languageDirty ? languageValue : ''}
                      onChange={(e) => {
                        setLanguageValue(e.target.value);
                        setLanguageDirty(e.target.value.trim().length > 0);
                      }}
                      placeholder={
                        languageMeta.isMixed ? 'Mixed' : languageMeta.shared || 'en'
                      }
                      className={`w-full px-3 py-2 text-xs rounded-md border bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] ${
                        languageDirty
                          ? 'border-[var(--accent)]'
                          : 'border-[var(--border-strong)]'
                      }`}
                    />
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Category
                  </label>
                  <select
                    value={categorySelect}
                    onChange={(e) => setCategorySelect(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-md border bg-[var(--bg-input)] text-[var(--text-primary)] ${
                      categorySelect !== '__keep__'
                        ? 'border-[var(--accent)]'
                        : 'border-[var(--border-strong)]'
                    }`}
                  >
                    <option value="__keep__">Keep existing categories</option>
                    <option value="__clear__">Clear category (Uncategorized)</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        Set to: {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* Section 4: Reading & Favorite */}
            <section className="pt-5 border-t border-[var(--border-subtle)] space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                    Reading &amp; Favorite
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Batch update progress state and favorites
                  </p>
                </div>
                {readingDirty && (
                  <button
                    type="button"
                    onClick={resetReading}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              {/* Reading Status Segmented Control */}
              <div>
                <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Reading Status
                </span>
                <div
                  role="group"
                  aria-label="Bulk reading status"
                  className="grid grid-cols-4 gap-1 p-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-sidebar)]"
                >
                  {(
                    [
                      {id: 'keep', label: 'Keep'},
                      {id: 'unread', label: 'Unread'},
                      {id: 'reading', label: 'Reading'},
                      {id: 'finished', label: 'Finished'},
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setStatusAction(opt.id);
                        if (opt.id === 'finished') setResetProgress(false);
                      }}
                      className={`py-1.5 px-2 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                        statusAction === opt.id
                          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Favorite Segmented Control */}
              <div>
                <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Favorites
                </span>
                <div
                  role="group"
                  aria-label="Bulk favorite state"
                  className="grid grid-cols-3 gap-1 p-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-sidebar)]"
                >
                  {(
                    [
                      {id: 'keep', label: 'Keep'},
                      {id: 'favorite', label: 'Favorite'},
                      {id: 'unfavorite', label: 'Unfavorite'},
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFavoriteAction(opt.id)}
                      className={`py-1.5 px-2 text-xs font-medium rounded inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        favoriteAction === opt.id
                          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {opt.id === 'favorite' && (
                        <Star className="w-3 h-3 fill-[var(--accent)] text-[var(--accent)]" />
                      )}
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset Progress Checkbox */}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-md border transition-colors cursor-pointer ${
                  resetProgress
                    ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={resetProgress}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setResetProgress(checked);
                    if (checked && statusAction === 'finished') {
                      setStatusAction('unread');
                    }
                  }}
                  className="mt-0.5 w-4 h-4 accent-[var(--accent)] rounded cursor-pointer shrink-0"
                />
                <div className="min-w-0">
                  <span className="block text-xs font-medium text-[var(--text-primary)]">
                    Reset reading progress to 0%
                  </span>
                  <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
                    Returns selected books to page 1 / opening chapter (keeps bookmarks &amp;
                    highlights).
                  </span>
                </div>
              </label>
            </section>
          </div>
        </form>

        {/* Live Pending Summary Bar + Action Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 space-y-2.5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <p className="min-w-0 truncate text-[var(--text-secondary)]">
              {hasChanges ? (
                <>
                  <span className="font-medium text-[var(--text-primary)]">Pending: </span>
                  <span>{pendingSummaryItems.join(' · ')}</span>
                </>
              ) : (
                <span className="text-[var(--text-muted)]">
                  No changes staged yet — adjust any section above to update selected books.
                </span>
              )}
            </p>
            {hasChanges && (
              <button
                type="button"
                onClick={resetAll}
                className="text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer whitespace-nowrap shrink-0"
              >
                Reset All
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-md border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="bulk-edit-studio-form"
              disabled={!hasChanges}
              className="px-4 py-2 text-xs font-medium rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              Apply to {selectedCount} {selectedCount === 1 ? 'Book' : 'Books'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
