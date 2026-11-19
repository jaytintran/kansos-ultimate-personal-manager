import {Check, Folder, FolderPlus, Minus, Plus, Search, Tag, X} from 'lucide-react';
import React, {useEffect, useMemo, useState} from 'react';
import {
  flattenFoldersHierarchy,
  getBookFolderIds,
  getFolderColorHex,
} from '../../lib/formatters';
import type {
  BookRecord,
  CategoryRecord,
  FolderRecord,
  ViewFolderRecord,
} from '../../types/library';
import {BottomSheet} from '../ui/BottomSheet';

export interface MobileOrganizePayload {
  bookIds: string[];
  addToViewFolderIds: string[];
  removeFromViewFolderIds: string[];
  addToSidebarFolderIds: string[];
  removeFromSidebarFolderIds: string[];
  categoryChange: {mode: 'keep' | 'set' | 'clear'; categoryId: string | null};
  addTags: string[];
  removeTags: string[];
}

interface MobileOrganizeSheetProps {
  isOpen: boolean;
  targetBooks: BookRecord[];
  activeViewLabel: string;
  currentViewFolders: ViewFolderRecord[];
  sidebarFolders: FolderRecord[];
  categories: CategoryRecord[];
  existingTags: string[];
  onCreateViewFolder: (name: string) => Promise<ViewFolderRecord | undefined> | void;
  onCreateSidebarFolder?: (name: string) => Promise<FolderRecord | undefined> | void;
  onApply: (payload: MobileOrganizePayload) => Promise<void> | void;
  onClose: () => void;
}

type TriState = 'all' | 'some' | 'none';

export const MobileOrganizeSheet: React.FC<MobileOrganizeSheetProps> = ({
  isOpen,
  targetBooks,
  activeViewLabel,
  currentViewFolders,
  sidebarFolders,
  categories,
  existingTags,
  onCreateViewFolder,
  onCreateSidebarFolder,
  onApply,
  onClose,
}) => {
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Close desktop right slide-in drawer on Escape
  useEffect(() => {
    if (!isOpen || !isDesktop) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isDesktop, onClose]);

  const isSingle = targetBooks.length === 1;
  const singleBook = isSingle ? targetBooks[0] : null;
  const targetBookIds = useMemo(() => targetBooks.map((b) => b.id), [targetBooks]);

  // Folder search
  const [folderSearch, setFolderSearch] = useState('');

  // Tri-state view folder overrides (id -> 'add' | 'remove')
  const [viewFolderDecisions, setViewFolderDecisions] = useState<Map<string, 'add' | 'remove'>>(
    () => new Map()
  );
  const [newViewFolderName, setNewViewFolderName] = useState('');
  const [creatingViewFolder, setCreatingViewFolder] = useState(false);

  // Tri-state sidebar folder overrides (id -> 'add' | 'remove')
  const [sidebarFolderDecisions, setSidebarFolderDecisions] = useState<
    Map<string, 'add' | 'remove'>
  >(() => new Map());
  const [newSidebarFolderName, setNewSidebarFolderName] = useState('');
  const [creatingSidebarFolder, setCreatingSidebarFolder] = useState(false);

  const [categoryMode, setCategoryMode] = useState<'keep' | 'set' | 'clear'>('keep');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Tags
  const [tagsToAdd, setTagsToAdd] = useState<Set<string>>(new Set());
  const [tagsToRemove, setTagsToRemove] = useState<Set<string>>(new Set());
  const [newTagDraft, setNewTagDraft] = useState('');

  const flatSidebarFolders = useMemo(
    () => flattenFoldersHierarchy(sidebarFolders),
    [sidebarFolders]
  );

  const targetKey = targetBookIds.join(',');

  // Initialize state whenever panel opens for a target selection
  useEffect(() => {
    if (!isOpen || targetBooks.length === 0) return;

    setViewFolderDecisions(new Map());
    setSidebarFolderDecisions(new Map());
    setFolderSearch('');

    if (singleBook) {
      if (singleBook.categoryId) {
        setCategoryMode('set');
        setSelectedCategoryId(singleBook.categoryId);
      } else {
        setCategoryMode('clear');
        setSelectedCategoryId(null);
      }
    } else {
      setCategoryMode('keep');
      setSelectedCategoryId(null);
    }

    setTagsToAdd(new Set());
    setTagsToRemove(new Set());
    setNewTagDraft('');
    setNewViewFolderName('');
    setCreatingViewFolder(false);
    setNewSidebarFolderName('');
    setCreatingSidebarFolder(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, targetKey]);

  const getInitialViewState = (vf: ViewFolderRecord): TriState => {
    const count = targetBookIds.filter((id) => vf.bookIds.includes(id)).length;
    if (count === 0) return 'none';
    if (count === targetBookIds.length) return 'all';
    return 'some';
  };

  const getEffectiveViewState = (vf: ViewFolderRecord): TriState => {
    const decision = viewFolderDecisions.get(vf.id);
    if (decision === 'add') return 'all';
    if (decision === 'remove') return 'none';
    return getInitialViewState(vf);
  };

  const getInitialSidebarState = (folderId: string): TriState => {
    const count = targetBooks.filter((b) => getBookFolderIds(b).includes(folderId)).length;
    if (count === 0) return 'none';
    if (count === targetBooks.length) return 'all';
    return 'some';
  };

  const getEffectiveSidebarState = (folderId: string): TriState => {
    const decision = sidebarFolderDecisions.get(folderId);
    if (decision === 'add') return 'all';
    if (decision === 'remove') return 'none';
    return getInitialSidebarState(folderId);
  };

  const toggleViewFolder = (vf: ViewFolderRecord) => {
    const initial = getInitialViewState(vf);
    const current = getEffectiveViewState(vf);
    setViewFolderDecisions((prev) => {
      const next = new Map(prev);
      if (current === 'all') {
        if (initial === 'none') next.delete(vf.id);
        else next.set(vf.id, 'remove');
      } else {
        if (initial === 'all') next.delete(vf.id);
        else next.set(vf.id, 'add');
      }
      return next;
    });
  };

  const toggleSidebarFolder = (folderId: string) => {
    const initial = getInitialSidebarState(folderId);
    const current = getEffectiveSidebarState(folderId);
    setSidebarFolderDecisions((prev) => {
      const next = new Map(prev);
      if (current === 'all') {
        if (initial === 'none') next.delete(folderId);
        else next.set(folderId, 'remove');
      } else {
        if (initial === 'all') next.delete(folderId);
        else next.set(folderId, 'add');
      }
      return next;
    });
  };

  const handleQuickCreateViewFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newViewFolderName.trim();
    if (!trimmed) return;
    const created = await onCreateViewFolder(trimmed);
    if (created) {
      setViewFolderDecisions((prev) => {
        const next = new Map(prev);
        next.set(created.id, 'add');
        return next;
      });
    }
    setNewViewFolderName('');
    setCreatingViewFolder(false);
  };

  const handleQuickCreateSidebarFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSidebarFolderName.trim();
    if (!trimmed || !onCreateSidebarFolder) return;
    const created = await onCreateSidebarFolder(trimmed);
    if (created) {
      setSidebarFolderDecisions((prev) => {
        const next = new Map(prev);
        next.set(created.id, 'add');
        return next;
      });
    }
    setNewSidebarFolderName('');
    setCreatingSidebarFolder(false);
  };

  const normalizedQuery = folderSearch.trim().toLowerCase();

  const filteredViewFolders = useMemo(() => {
    if (!normalizedQuery) return currentViewFolders;
    return currentViewFolders.filter((vf) => vf.name.toLowerCase().includes(normalizedQuery));
  }, [currentViewFolders, normalizedQuery]);

  const filteredSidebarFolders = useMemo(() => {
    if (!normalizedQuery) return flatSidebarFolders;
    return flatSidebarFolders.filter(
      ({folder, pathLabel}) =>
        folder.name.toLowerCase().includes(normalizedQuery) ||
        pathLabel.toLowerCase().includes(normalizedQuery)
    );
  }, [flatSidebarFolders, normalizedQuery]);

  const singleBookTagSet = useMemo(
    () => new Set((singleBook?.tags ?? []).map((t) => t.toLowerCase())),
    [singleBook]
  );

  const toggleTag = (tag: string) => {
    const lower = tag.toLowerCase();
    if (singleBook) {
      const originallyHas = singleBookTagSet.has(lower);
      if (originallyHas) {
        setTagsToRemove((prev) => {
          const next = new Set(prev);
          if (next.has(tag)) next.delete(tag);
          else next.add(tag);
          return next;
        });
      } else {
        setTagsToAdd((prev) => {
          const next = new Set(prev);
          if (next.has(tag)) next.delete(tag);
          else next.add(tag);
          return next;
        });
      }
    } else {
      setTagsToAdd((prev) => {
        const next = new Set(prev);
        if (next.has(tag)) next.delete(tag);
        else next.add(tag);
        return next;
      });
    }
  };

  const handleAddCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTagDraft.trim();
    if (!trimmed) return;
    setTagsToAdd((prev) => new Set(prev).add(trimmed));
    setNewTagDraft('');
  };

  const allDisplayTags = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of existingTags) map.set(t.toLowerCase(), t);
    for (const t of tagsToAdd) map.set(t.toLowerCase(), t);
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [existingTags, tagsToAdd]);

  const handleApply = async () => {
    const addToViewFolderIds: string[] = [];
    const removeFromViewFolderIds: string[] = [];
    for (const [id, action] of viewFolderDecisions.entries()) {
      if (action === 'add') addToViewFolderIds.push(id);
      else if (action === 'remove') removeFromViewFolderIds.push(id);
    }

    const addToSidebarFolderIds: string[] = [];
    const removeFromSidebarFolderIds: string[] = [];
    for (const [id, action] of sidebarFolderDecisions.entries()) {
      if (action === 'add') addToSidebarFolderIds.push(id);
      else if (action === 'remove') removeFromSidebarFolderIds.push(id);
    }

    await onApply({
      bookIds: targetBookIds,
      addToViewFolderIds,
      removeFromViewFolderIds,
      addToSidebarFolderIds,
      removeFromSidebarFolderIds,
      categoryChange: {mode: categoryMode, categoryId: selectedCategoryId},
      addTags: Array.from(tagsToAdd),
      removeTags: Array.from(tagsToRemove),
    });
    onClose();
  };

  if (!isOpen || targetBooks.length === 0) return null;

  const title = isSingle ? 'Organize Book' : `Organize ${targetBooks.length} Books`;
  const subtitle = singleBook
    ? singleBook.title
    : 'File selected books into folders, categories, or tags';

  const renderTriCheck = (state: TriState) => (
    <span
      className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 transition-colors ${
        state === 'all'
          ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]'
          : state === 'some'
            ? 'bg-[var(--bg-accent-subtle)] border-[var(--accent)] text-[var(--accent)]'
            : 'border-[var(--border-strong)] text-transparent'
      }`}
    >
      {state === 'all' && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
      {state === 'some' && <Minus className="w-3.5 h-3.5 stroke-[2.5]" />}
    </span>
  );

  const organizeBody = (
    <div className={isDesktop ? 'p-6 space-y-6' : 'p-4 space-y-6'}>
      {/* Search across both folder lists */}
      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 pointer-events-none" />
        <input
          type="text"
          value={folderSearch}
          onChange={(e) => setFolderSearch(e.target.value)}
          placeholder="Search folders..."
          aria-label="Search folders"
          className="w-full pl-8 pr-8 py-2 text-xs rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
        />
        {folderSearch && (
          <button
            type="button"
            onClick={() => setFolderSearch('')}
            aria-label="Clear folder search"
            className="absolute right-2.5 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Per-View Folders in current view */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            Folders in {activeViewLabel}
          </p>
          <button
            type="button"
            onClick={() => setCreatingViewFolder((v) => !v)}
            className="min-h-[30px] px-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer whitespace-nowrap"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>

        {creatingViewFolder && (
          <form onSubmit={(e) => void handleQuickCreateViewFolder(e)} className="mb-2.5 flex gap-2">
            <input
              type="text"
              autoFocus
              value={newViewFolderName}
              onChange={(e) => setNewViewFolderName(e.target.value)}
              placeholder={`Folder in ${activeViewLabel}...`}
              className="flex-1 min-w-0 h-9 px-3 text-xs rounded-md border border-[var(--accent)] bg-[var(--bg-input)] text-[var(--text-primary)] focus:outline-none"
            />
            <button
              type="submit"
              className="h-9 px-3 rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
            >
              Create
            </button>
          </form>
        )}

        {currentViewFolders.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-1.5">
            No folders in {activeViewLabel} yet. Select &ldquo;New&rdquo; to create one.
          </p>
        ) : filteredViewFolders.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-1.5">No matching view folders.</p>
        ) : (
          <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
            {filteredViewFolders.map((vf) => {
              const state = getEffectiveViewState(vf);
              return (
                <button
                  key={vf.id}
                  type="button"
                  onClick={() => toggleViewFolder(vf)}
                  className="w-full min-h-[42px] px-3.5 flex items-center justify-between gap-2 text-left hover:bg-[var(--bg-surface-hover)] active:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Folder className="w-4 h-4 text-[var(--accent)] shrink-0" />
                    <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {vf.name}
                    </span>
                  </span>
                  {renderTriCheck(state)}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Global Sidebar Library Folders */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-[var(--text-secondary)]">Library Folders</p>
          {onCreateSidebarFolder && (
            <button
              type="button"
              onClick={() => setCreatingSidebarFolder((v) => !v)}
              className="min-h-[30px] px-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer whitespace-nowrap"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          )}
        </div>

        {creatingSidebarFolder && onCreateSidebarFolder && (
          <form
            onSubmit={(e) => void handleQuickCreateSidebarFolder(e)}
            className="mb-2.5 flex gap-2"
          >
            <input
              type="text"
              autoFocus
              value={newSidebarFolderName}
              onChange={(e) => setNewSidebarFolderName(e.target.value)}
              placeholder="New library folder..."
              className="flex-1 min-w-0 h-9 px-3 text-xs rounded-md border border-[var(--accent)] bg-[var(--bg-input)] text-[var(--text-primary)] focus:outline-none"
            />
            <button
              type="submit"
              className="h-9 px-3 rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
            >
              Create
            </button>
          </form>
        )}

        {flatSidebarFolders.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-1.5">
            No library folders created yet.
          </p>
        ) : filteredSidebarFolders.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-1.5">No matching library folders.</p>
        ) : (
          <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
            {filteredSidebarFolders.map(({folder, depth, pathLabel}) => {
              const state = getEffectiveSidebarState(folder.id);
              return (
                <button
                  key={folder.id}
                  type="button"
                  title={pathLabel}
                  onClick={() => toggleSidebarFolder(folder.id)}
                  className="w-full min-h-[42px] pr-3.5 flex items-center justify-between gap-2 text-left hover:bg-[var(--bg-surface-hover)] active:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                  style={{paddingLeft: `${14 + (normalizedQuery ? 0 : depth) * 14}px`}}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Folder
                      className="w-4 h-4 shrink-0"
                      style={{color: getFolderColorHex(folder.color) ?? 'var(--text-muted)'}}
                    />
                    <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {normalizedQuery ? pathLabel : folder.name}
                    </span>
                  </span>
                  {renderTriCheck(state)}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Category */}
      <section>
        <p className="text-xs font-medium text-[var(--text-secondary)] mb-2">Category</p>
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
          {!isSingle && (
            <button
              type="button"
              onClick={() => {
                setCategoryMode('keep');
                setSelectedCategoryId(null);
              }}
              className="w-full min-h-[40px] px-3.5 flex items-center justify-between text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
            >
              <span>Keep existing categories</span>
              {categoryMode === 'keep' && (
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setCategoryMode('clear');
              setSelectedCategoryId(null);
            }}
            className="w-full min-h-[40px] px-3.5 flex items-center justify-between text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
          >
            <span>None</span>
            {categoryMode === 'clear' && (
              <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />
            )}
          </button>
          {categories.map((cat) => {
            const active = categoryMode === 'set' && selectedCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setCategoryMode('set');
                  setSelectedCategoryId(cat.id);
                }}
                className="w-full min-h-[40px] px-3.5 flex items-center justify-between gap-2 text-left hover:bg-[var(--bg-surface-hover)] active:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
              >
                <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                  {cat.name}
                </span>
                {active && <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* Tags */}
      <section>
        <p className="text-xs font-medium text-[var(--text-secondary)] mb-2">
          {isSingle ? 'Tags' : 'Add Tags to Selected'}
        </p>
        <form onSubmit={handleAddCustomTag} className="flex gap-2 mb-2.5">
          <input
            type="text"
            value={newTagDraft}
            onChange={(e) => setNewTagDraft(e.target.value)}
            placeholder="Add new tag..."
            className="flex-1 min-w-0 h-9 px-3 text-xs rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
          />
          <button
            type="submit"
            className="h-9 px-3 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </form>

        {allDisplayTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allDisplayTags.map((tag) => {
              const lower = tag.toLowerCase();
              const isActive = singleBook
                ? (singleBookTagSet.has(lower) && !tagsToRemove.has(tag)) || tagsToAdd.has(tag)
                : tagsToAdd.has(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`min-h-[34px] px-2.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isActive
                      ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Tag className="w-3 h-3" />
                  <span>{tag}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );

  // Desktop (>= 768px): Right Slide-In Drawer harmonized with MetadataDrawer
  if (isDesktop) {
    return (
      <div
        className="fixed inset-0 z-50 flex justify-end bg-black/45"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Organize books"
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md h-full bg-[var(--bg-elevated)] border-l border-[var(--border-subtle)] flex flex-col shadow-2xl animate-folio-drawer-in"
        >
          {/* Sticky Drawer Header */}
          <div className="px-6 py-3.5 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <h2 className="font-serif-editorial text-lg font-semibold text-[var(--text-primary)] truncate">
                {title}
              </h2>
              <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close organize drawer"
              className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div data-folio-vscroll="true" className="flex-1 min-h-0 overflow-y-auto">
            {organizeBody}
          </div>

          {/* Sticky Footer */}
          <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2 shrink-0 bg-[var(--bg-surface)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-md border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              className="px-4 py-2 text-xs font-medium rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] cursor-pointer whitespace-nowrap"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Mobile (< 768px): Bottom Sheet
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      ariaLabel="Organize books"
      maxHeightClass="max-h-[88dvh]"
      footer={
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm font-medium text-[var(--text-primary)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            className="flex-1 h-11 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-medium active:opacity-90 cursor-pointer"
          >
            Save Changes
          </button>
        </div>
      }
    >
      {organizeBody}
    </BottomSheet>
  );
};
