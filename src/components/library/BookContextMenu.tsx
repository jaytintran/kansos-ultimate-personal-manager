import {
  BookOpen,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Circle,
  Folder,
  FolderInput,
  FolderMinus,
  FolderPlus,
  Info,
  Minus,
  Pencil,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  flattenFoldersHierarchy,
  getBookFolderIds,
  getFolderColorHex,
} from '../../lib/formatters';
import type {
  BookRecord,
  FolderRecord,
  ReadingStatus,
  ViewFolderRecord,
} from '../../types/library';

export interface BookContextMenuState {
  x: number;
  y: number;
  targetBookIds: string[];
  primaryBookId: string;
}

interface BookContextMenuProps {
  menuState: BookContextMenuState | null;
  books: BookRecord[];
  activeViewLabel: string;
  currentViewFolders: ViewFolderRecord[];
  sidebarFolders: FolderRecord[];
  activeFolderRemovalName: string | null;
  selectedIds: Set<string>;
  onClose: () => void;
  onOpenBook: (book: BookRecord) => void;
  onInspectBook: (book: BookRecord) => void;
  onEditMetadata: (book: BookRecord) => void;
  onBulkEditBooks: (bookIds: string[]) => void;
  onOrganizeBooks: (bookIds: string[]) => void;
  onToggleViewFolderMembership: (bookIds: string[], folderId: string, add: boolean) => void;
  onToggleSidebarFolderMembership: (bookIds: string[], folderId: string, add: boolean) => void;
  onCreateViewFolderAndAssign: (name: string, bookIds: string[]) => Promise<void>;
  onCreateSidebarFolderAndAssign: (name: string, bookIds: string[]) => Promise<void>;
  onRemoveFromCurrentFolder?: (bookIds: string[]) => void;
  onSetReadingStatus: (bookIds: string[], status: ReadingStatus) => void;
  onSetFavorite: (bookIds: string[], favorite: boolean) => void;
  onToggleSelectBook: (bookId: string) => void;
  onClearSelection: () => void;
  onRequestDeleteBooks: (bookIds: string[]) => void;
}

type SubmenuKind = 'folders' | 'status' | null;

type MenuItemId =
  | 'open'
  | 'inspect'
  | 'edit'
  | 'folders'
  | 'remove-folder'
  | 'bulk-edit'
  | 'organize'
  | 'status'
  | 'favorite'
  | 'select'
  | 'delete';

export const BookContextMenu: React.FC<BookContextMenuProps> = ({
  menuState,
  books,
  activeViewLabel,
  currentViewFolders,
  sidebarFolders,
  activeFolderRemovalName,
  selectedIds,
  onClose,
  onOpenBook,
  onInspectBook,
  onEditMetadata,
  onBulkEditBooks,
  onOrganizeBooks,
  onToggleViewFolderMembership,
  onToggleSidebarFolderMembership,
  onCreateViewFolderAndAssign,
  onCreateSidebarFolderAndAssign,
  onRemoveFromCurrentFolder,
  onSetReadingStatus,
  onSetFavorite,
  onToggleSelectBook,
  onClearSelection,
  onRequestDeleteBooks,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Partial<Record<MenuItemId, HTMLButtonElement | null>>>({});
  const hoverTimerRef = useRef<number | null>(null);

  const [coords, setCoords] = useState<{left: number; top: number}>({left: 0, top: 0});
  const [activeSubmenu, setActiveSubmenu] = useState<SubmenuKind>(null);
  const [submenuPos, setSubmenuPos] = useState<{left: number; top: number; maxHeight: number}>({
    left: 0,
    top: 0,
    maxHeight: 440,
  });
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [submenuFocusedIndex, setSubmenuFocusedIndex] = useState<number>(-1);

  // Search & inline folder creation inside Folders submenu
  const [folderSearch, setFolderSearch] = useState('');
  const [creatingTarget, setCreatingTarget] = useState<'view' | 'sidebar' | null>(null);
  const [newFolderDraft, setNewFolderDraft] = useState('');

  const targetBooks = useMemo(() => {
    if (!menuState) return [];
    const idSet = new Set(menuState.targetBookIds);
    return books.filter((b) => idSet.has(b.id));
  }, [menuState, books]);

  const primaryBook = useMemo(() => {
    if (!menuState) return null;
    return books.find((b) => b.id === menuState.primaryBookId) ?? targetBooks[0] ?? null;
  }, [menuState, books, targetBooks]);

  const flatSidebarFolders = useMemo(
    () => flattenFoldersHierarchy(sidebarFolders),
    [sidebarFolders]
  );

  const normalizedFolderQuery = folderSearch.trim().toLowerCase();

  const filteredViewFolders = useMemo(() => {
    if (!normalizedFolderQuery) return currentViewFolders;
    return currentViewFolders.filter((vf) =>
      vf.name.toLowerCase().includes(normalizedFolderQuery)
    );
  }, [currentViewFolders, normalizedFolderQuery]);

  const filteredSidebarFolders = useMemo(() => {
    if (!normalizedFolderQuery) return flatSidebarFolders;
    return flatSidebarFolders.filter(
      ({folder, pathLabel}) =>
        folder.name.toLowerCase().includes(normalizedFolderQuery) ||
        pathLabel.toLowerCase().includes(normalizedFolderQuery)
    );
  }, [flatSidebarFolders, normalizedFolderQuery]);

  const isMulti = targetBooks.length > 1;
  const allFavorited = targetBooks.length > 0 && targetBooks.every((b) => b.isFavorite);
  const sharedStatus: ReadingStatus | null = useMemo(() => {
    if (targetBooks.length === 0) return null;
    const first = targetBooks[0].status;
    return targetBooks.every((b) => b.status === first) ? first : null;
  }, [targetBooks]);

  const isPrimarySelected = primaryBook ? selectedIds.has(primaryBook.id) : false;

  const visibleItemIds = useMemo<MenuItemId[]>(() => {
    const ids: MenuItemId[] = [];
    if (!isMulti) {
      ids.push('open', 'inspect', 'edit');
    }
    ids.push('folders');
    if (activeFolderRemovalName && onRemoveFromCurrentFolder) {
      ids.push('remove-folder');
    }
    ids.push('bulk-edit', 'organize', 'status', 'favorite', 'select', 'delete');
    return ids;
  }, [isMulti, activeFolderRemovalName, onRemoveFromCurrentFolder]);

  // Reset submenu, search & creation state whenever menu opens at new position
  useEffect(() => {
    setActiveSubmenu(null);
    setFocusedIndex(-1);
    setSubmenuFocusedIndex(-1);
    setFolderSearch('');
    setCreatingTarget(null);
    setNewFolderDraft('');
  }, [menuState?.x, menuState?.y, menuState?.primaryBookId]);

  // Clear pending hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  // Clamp main menu within viewport
  useLayoutEffect(() => {
    if (!menuState || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 8;
    const maxLeft = Math.max(pad, window.innerWidth - rect.width - pad);
    const maxTop = Math.max(pad, window.innerHeight - rect.height - pad);
    setCoords({
      left: Math.min(Math.max(pad, menuState.x), maxLeft),
      top: Math.min(Math.max(pad, menuState.y), maxTop),
    });
  }, [menuState, visibleItemIds.length]);

  // Position cascading submenu with viewport edge flipping and guaranteed scroll-safe maxHeight
  useLayoutEffect(() => {
    if (!activeSubmenu || !menuRef.current || !submenuRef.current) return;
    const triggerKey: MenuItemId = activeSubmenu === 'folders' ? 'folders' : 'status';
    const triggerEl = triggerRefs.current[triggerKey];
    const menuRect = menuRef.current.getBoundingClientRect();
    const subRect = submenuRef.current.getBoundingClientRect();
    const triggerRect = triggerEl?.getBoundingClientRect() ?? menuRect;

    const pad = 10;
    const gap = 4;
    const maxViewportHeight = Math.max(200, window.innerHeight - pad * 2);
    const maxHeight = Math.min(460, maxViewportHeight);

    let left = menuRect.right + gap;
    if (left + subRect.width > window.innerWidth - pad) {
      left = Math.max(pad, menuRect.left - subRect.width - gap);
    }

    const effectiveHeight = Math.min(subRect.height, maxHeight);
    let top = triggerRect.top - 4;
    if (top + effectiveHeight > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - effectiveHeight - pad);
    }
    if (top < pad) {
      top = pad;
    }

    setSubmenuPos({left, top, maxHeight});
  }, [
    activeSubmenu,
    coords,
    filteredViewFolders.length,
    filteredSidebarFolders.length,
    creatingTarget,
  ]);

  // Close on outside mousedown, window resize, or main container scroll
  useEffect(() => {
    if (!menuState) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || submenuRef.current?.contains(target)) {
        return;
      }
      onClose();
    };
    const onResize = () => onClose();

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', onResize);
    };
  }, [menuState, onClose]);

  const scheduleSubmenu = (next: SubmenuKind, delayMs = 95) => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = window.setTimeout(() => {
      setActiveSubmenu(next);
      setSubmenuFocusedIndex(-1);
    }, delayMs);
  };

  const cancelSubmenuTimer = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const targetIds = menuState?.targetBookIds ?? [];

  const activateMainItem = (id: MenuItemId) => {
    if (!primaryBook) return;
    switch (id) {
      case 'open':
        onOpenBook(primaryBook);
        onClose();
        break;
      case 'inspect':
        onInspectBook(primaryBook);
        onClose();
        break;
      case 'edit':
        onEditMetadata(primaryBook);
        onClose();
        break;
      case 'folders':
        cancelSubmenuTimer();
        setActiveSubmenu('folders');
        setSubmenuFocusedIndex(0);
        break;
      case 'remove-folder':
        if (onRemoveFromCurrentFolder) {
          onRemoveFromCurrentFolder(targetIds);
        }
        onClose();
        break;
      case 'bulk-edit':
        onBulkEditBooks(targetIds);
        onClose();
        break;
      case 'organize':
        onOrganizeBooks(targetIds);
        onClose();
        break;
      case 'status':
        cancelSubmenuTimer();
        setActiveSubmenu('status');
        setSubmenuFocusedIndex(0);
        break;
      case 'favorite':
        onSetFavorite(targetIds, !allFavorited);
        onClose();
        break;
      case 'select':
        if (isMulti) {
          onClearSelection();
        } else {
          onToggleSelectBook(primaryBook.id);
        }
        onClose();
        break;
      case 'delete':
        onRequestDeleteBooks(targetIds);
        onClose();
        break;
    }
  };

  // Keyboard navigation across main menu and active submenu
  useEffect(() => {
    if (!menuState) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Let inline new-folder or search inputs handle their own typing
      const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (creatingTarget) {
            setCreatingTarget(null);
            setNewFolderDraft('');
          } else if (folderSearch) {
            setFolderSearch('');
          } else {
            setActiveSubmenu(null);
            setSubmenuFocusedIndex(-1);
          }
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (activeSubmenu) {
          setActiveSubmenu(null);
          setSubmenuFocusedIndex(-1);
        } else {
          onClose();
        }
        return;
      }

      // If submenu is active & keyboard focused inside submenu
      if (activeSubmenu && submenuFocusedIndex >= 0) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setActiveSubmenu(null);
          setSubmenuFocusedIndex(-1);
          return;
        }
        const subButtons = submenuRef.current?.querySelectorAll<HTMLButtonElement>(
          'button[data-submenu-item="true"]'
        );
        const total = subButtons?.length ?? 0;
        if (total === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = (submenuFocusedIndex + 1) % total;
          setSubmenuFocusedIndex(next);
          subButtons?.[next]?.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = (submenuFocusedIndex - 1 + total) % total;
          setSubmenuFocusedIndex(prev);
          subButtons?.[prev]?.focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          subButtons?.[submenuFocusedIndex]?.click();
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = focusedIndex < 0 ? 0 : (focusedIndex + 1) % visibleItemIds.length;
        setFocusedIndex(next);
        const nextId = visibleItemIds[next];
        triggerRefs.current[nextId]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev =
          focusedIndex <= 0 ? visibleItemIds.length - 1 : focusedIndex - 1;
        setFocusedIndex(prev);
        const prevId = visibleItemIds[prev];
        triggerRefs.current[prevId]?.focus();
      } else if (e.key === 'ArrowRight' && focusedIndex >= 0) {
        const currentId = visibleItemIds[focusedIndex];
        if (currentId === 'folders' || currentId === 'status') {
          e.preventDefault();
          setActiveSubmenu(currentId);
          setSubmenuFocusedIndex(0);
          requestAnimationFrame(() => {
            const first = submenuRef.current?.querySelector<HTMLButtonElement>(
              'button[data-submenu-item="true"]'
            );
            first?.focus();
          });
        }
      } else if ((e.key === 'Enter' || e.key === ' ') && focusedIndex >= 0) {
        e.preventDefault();
        activateMainItem(visibleItemIds[focusedIndex]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!menuState || !primaryBook || targetBooks.length === 0) return null;

  const getViewFolderState = (vf: ViewFolderRecord): 'all' | 'some' | 'none' => {
    const count = targetIds.filter((id) => vf.bookIds.includes(id)).length;
    if (count === 0) return 'none';
    if (count === targetIds.length) return 'all';
    return 'some';
  };

  const getSidebarFolderState = (folderId: string): 'all' | 'some' | 'none' => {
    const count = targetBooks.filter((b) => getBookFolderIds(b).includes(folderId)).length;
    if (count === 0) return 'none';
    if (count === targetBooks.length) return 'all';
    return 'some';
  };

  const handleCreateInlineFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderDraft.trim();
    if (!trimmed || !creatingTarget) return;
    if (creatingTarget === 'view') {
      await onCreateViewFolderAndAssign(trimmed, targetIds);
    } else {
      await onCreateSidebarFolderAndAssign(trimmed, targetIds);
    }
    setNewFolderDraft('');
    setCreatingTarget(null);
  };

  const itemBaseClass = (id: MenuItemId, danger = false) => {
    const idx = visibleItemIds.indexOf(id);
    const isFocused = focusedIndex === idx;
    const isSubOpen =
      (id === 'folders' && activeSubmenu === 'folders') ||
      (id === 'status' && activeSubmenu === 'status');
    return `w-full px-3 py-1.5 flex items-center justify-between gap-3 text-left text-xs rounded transition-colors cursor-pointer whitespace-nowrap focus:outline-none ${
      danger
        ? isFocused
          ? 'bg-[var(--danger)]/12 text-[var(--danger)]'
          : 'text-[var(--danger)] hover:bg-[var(--danger)]/10'
        : isFocused || isSubOpen
          ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
          : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
    }`;
  };

  const renderTriCheck = (state: 'all' | 'some' | 'none') => (
    <span
      className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
        state === 'all'
          ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]'
          : state === 'some'
            ? 'bg-[var(--bg-accent-subtle)] border-[var(--accent)] text-[var(--accent)]'
            : 'border-[var(--border-strong)] text-transparent'
      }`}
    >
      {state === 'all' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
      {state === 'some' && <Minus className="w-2.5 h-2.5 stroke-[3]" />}
    </span>
  );

  return (
    <>
      {/* Main Context Menu */}
      <div
        ref={menuRef}
        role="menu"
        aria-label={isMulti ? `Actions for ${targetBooks.length} selected books` : `Actions for ${primaryBook.title}`}
        onContextMenu={(e) => e.preventDefault()}
        className="fixed z-50 w-60 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl py-1.5 select-none"
        style={{left: `${coords.left}px`, top: `${coords.top}px`}}
      >
        {/* Header */}
        <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] mb-1">
          {isMulti ? (
            <>
              <p className="font-mono-tabular text-xs font-semibold text-[var(--text-primary)]">
                {targetBooks.length} books selected
              </p>
              <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                Actions apply to entire selection
              </p>
            </>
          ) : (
            <>
              <p className="font-serif-editorial text-xs font-semibold text-[var(--text-primary)] truncate">
                {primaryBook.title}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                {primaryBook.author}
              </p>
            </>
          )}
        </div>

        <div className="px-1 space-y-0.5">
          {/* Single-book primary actions */}
          {!isMulti && (
            <>
              <button
                ref={(el) => {
                  triggerRefs.current.open = el;
                }}
                type="button"
                role="menuitem"
                onMouseEnter={() => {
                  setFocusedIndex(visibleItemIds.indexOf('open'));
                  scheduleSubmenu(null);
                }}
                onClick={() => activateMainItem('open')}
                className={itemBaseClass('open')}
              >
                <span className="inline-flex items-center gap-2.5 min-w-0">
                  <BookOpen className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span className="font-medium">
                    {primaryBook.progress > 0 ? 'Continue Reading' : 'Open Book'}
                  </span>
                </span>
              </button>

              <button
                ref={(el) => {
                  triggerRefs.current.inspect = el;
                }}
                type="button"
                role="menuitem"
                onMouseEnter={() => {
                  setFocusedIndex(visibleItemIds.indexOf('inspect'));
                  scheduleSubmenu(null);
                }}
                onClick={() => activateMainItem('inspect')}
                className={itemBaseClass('inspect')}
              >
                <span className="inline-flex items-center gap-2.5 min-w-0">
                  <Info className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                  <span>Inspect Details</span>
                </span>
              </button>

              <button
                ref={(el) => {
                  triggerRefs.current.edit = el;
                }}
                type="button"
                role="menuitem"
                onMouseEnter={() => {
                  setFocusedIndex(visibleItemIds.indexOf('edit'));
                  scheduleSubmenu(null);
                }}
                onClick={() => activateMainItem('edit')}
                className={itemBaseClass('edit')}
              >
                <span className="inline-flex items-center gap-2.5 min-w-0">
                  <Pencil className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                  <span>Edit Metadata...</span>
                </span>
              </button>

              <div className="my-1 border-t border-[var(--border-subtle)]" />
            </>
          )}

          {/* Organization Group */}
          <button
            ref={(el) => {
              triggerRefs.current.folders = el;
            }}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={activeSubmenu === 'folders'}
            onMouseEnter={() => {
              setFocusedIndex(visibleItemIds.indexOf('folders'));
              scheduleSubmenu('folders', 70);
            }}
            onClick={() => activateMainItem('folders')}
            className={itemBaseClass('folders')}
          >
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <Folder className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Add to Folder</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          </button>

          {activeFolderRemovalName && onRemoveFromCurrentFolder && (
            <button
              ref={(el) => {
                triggerRefs.current['remove-folder'] = el;
              }}
              type="button"
              role="menuitem"
              onMouseEnter={() => {
                setFocusedIndex(visibleItemIds.indexOf('remove-folder'));
                scheduleSubmenu(null);
              }}
              onClick={() => activateMainItem('remove-folder')}
              className={itemBaseClass('remove-folder')}
            >
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <FolderMinus className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                <span className="truncate">
                  Remove from &ldquo;{activeFolderRemovalName}&rdquo;
                </span>
              </span>
            </button>
          )}

          <button
            ref={(el) => {
              triggerRefs.current['bulk-edit'] = el;
            }}
            type="button"
            role="menuitem"
            onMouseEnter={() => {
              setFocusedIndex(visibleItemIds.indexOf('bulk-edit'));
              scheduleSubmenu(null);
            }}
            onClick={() => activateMainItem('bulk-edit')}
            className={itemBaseClass('bulk-edit')}
          >
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
              <span>
                {isMulti ? `Bulk Edit ${targetBooks.length} Books...` : 'Bulk Edit...'}
              </span>
            </span>
          </button>

          <button
            ref={(el) => {
              triggerRefs.current.organize = el;
            }}
            type="button"
            role="menuitem"
            onMouseEnter={() => {
              setFocusedIndex(visibleItemIds.indexOf('organize'));
              scheduleSubmenu(null);
            }}
            onClick={() => activateMainItem('organize')}
            className={itemBaseClass('organize')}
          >
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <FolderInput className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
              <span>Organize...</span>
            </span>
          </button>

          <div className="my-1 border-t border-[var(--border-subtle)]" />

          {/* Reading Status, Favorite, Select */}
          <button
            ref={(el) => {
              triggerRefs.current.status = el;
            }}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={activeSubmenu === 'status'}
            onMouseEnter={() => {
              setFocusedIndex(visibleItemIds.indexOf('status'));
              scheduleSubmenu('status', 70);
            }}
            onClick={() => activateMainItem('status')}
            className={itemBaseClass('status')}
          >
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
              <span>Reading Status</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          </button>

          <button
            ref={(el) => {
              triggerRefs.current.favorite = el;
            }}
            type="button"
            role="menuitem"
            onMouseEnter={() => {
              setFocusedIndex(visibleItemIds.indexOf('favorite'));
              scheduleSubmenu(null);
            }}
            onClick={() => activateMainItem('favorite')}
            className={itemBaseClass('favorite')}
          >
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <Star
                className={`w-3.5 h-3.5 shrink-0 ${
                  allFavorited
                    ? 'fill-[var(--accent)] text-[var(--accent)]'
                    : 'text-[var(--text-secondary)]'
                }`}
              />
              <span>{allFavorited ? 'Remove from Favorites' : 'Add to Favorites'}</span>
            </span>
          </button>

          <button
            ref={(el) => {
              triggerRefs.current.select = el;
            }}
            type="button"
            role="menuitem"
            onMouseEnter={() => {
              setFocusedIndex(visibleItemIds.indexOf('select'));
              scheduleSubmenu(null);
            }}
            onClick={() => activateMainItem('select')}
            className={itemBaseClass('select')}
          >
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <CheckSquare className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
              <span>
                {isMulti
                  ? 'Clear Selection'
                  : isPrimarySelected
                    ? 'Deselect Book'
                    : 'Select Book'}
              </span>
            </span>
          </button>

          <div className="my-1 border-t border-[var(--border-subtle)]" />

          {/* Delete */}
          <button
            ref={(el) => {
              triggerRefs.current.delete = el;
            }}
            type="button"
            role="menuitem"
            onMouseEnter={() => {
              setFocusedIndex(visibleItemIds.indexOf('delete'));
              scheduleSubmenu(null);
            }}
            onClick={() => activateMainItem('delete')}
            className={itemBaseClass('delete', true)}
          >
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isMulti ? `Delete ${targetBooks.length} Books...` : 'Delete Book...'}
              </span>
            </span>
          </button>
        </div>
      </div>

      {/* Cascading Submenu: Folders (Scrollable with Sticky Search Filter) */}
      {activeSubmenu === 'folders' && (
        <div
          ref={submenuRef}
          role="menu"
          aria-label="Folders submenu"
          onMouseEnter={cancelSubmenuTimer}
          onContextMenu={(e) => e.preventDefault()}
          className="fixed z-50 w-72 flex flex-col overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl select-none"
          style={{
            left: `${submenuPos.left}px`,
            top: `${submenuPos.top}px`,
            maxHeight: `${submenuPos.maxHeight}px`,
          }}
        >
          {/* Sticky Search Filter Bar */}
          <div className="shrink-0 px-2 pt-2 pb-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                value={folderSearch}
                onChange={(e) => setFolderSearch(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="Search folders..."
                aria-label="Filter folders"
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
              />
              {folderSearch && (
                <button
                  type="button"
                  onClick={() => setFolderSearch('')}
                  aria-label="Clear folder filter"
                  className="absolute right-2 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Folder Groups */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 py-1.5 space-y-2">
            {/* Per-View Folders */}
            <div>
              <div className="px-2.5 py-1 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-[var(--text-muted)] truncate">
                  In {activeViewLabel}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingTarget('view');
                    setNewFolderDraft('');
                  }}
                  className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer shrink-0"
                >
                  <FolderPlus className="w-3 h-3" />
                  <span>New</span>
                </button>
              </div>

              {creatingTarget === 'view' && (
                <form
                  onSubmit={(e) => void handleCreateInlineFolder(e)}
                  className="px-2 pb-1.5 flex items-center gap-1"
                >
                  <input
                    type="text"
                    autoFocus
                    value={newFolderDraft}
                    onChange={(e) => setNewFolderDraft(e.target.value)}
                    placeholder={`Folder in ${activeViewLabel}...`}
                    className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-[var(--accent)] bg-[var(--bg-input)] text-[var(--text-primary)] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 text-[11px] font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] cursor-pointer shrink-0"
                  >
                    Add
                  </button>
                </form>
              )}

              {currentViewFolders.length === 0 ? (
                <p className="px-2.5 py-1 text-[11px] text-[var(--text-muted)]">
                  No folders in this view yet.
                </p>
              ) : filteredViewFolders.length === 0 ? (
                <p className="px-2.5 py-1 text-[11px] text-[var(--text-muted)]">
                  No matching view folders.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {filteredViewFolders.map((vf) => {
                    const state = getViewFolderState(vf);
                    return (
                      <button
                        key={vf.id}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={state === 'all' ? true : state === 'some' ? 'mixed' : false}
                        data-submenu-item="true"
                        onClick={() =>
                          onToggleViewFolderMembership(targetIds, vf.id, state !== 'all')
                        }
                        className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left text-xs rounded hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)] focus:outline-none cursor-pointer"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Folder className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                          <span className="truncate text-[var(--text-primary)]">{vf.name}</span>
                        </span>
                        {renderTriCheck(state)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-[var(--border-subtle)]" />

            {/* Sidebar Library Folders */}
            <div>
              <div className="px-2.5 py-1 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">
                  Library Folders
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingTarget('sidebar');
                    setNewFolderDraft('');
                  }}
                  className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer shrink-0"
                >
                  <FolderPlus className="w-3 h-3" />
                  <span>New</span>
                </button>
              </div>

              {creatingTarget === 'sidebar' && (
                <form
                  onSubmit={(e) => void handleCreateInlineFolder(e)}
                  className="px-2 pb-1.5 flex items-center gap-1"
                >
                  <input
                    type="text"
                    autoFocus
                    value={newFolderDraft}
                    onChange={(e) => setNewFolderDraft(e.target.value)}
                    placeholder="New library folder..."
                    className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-[var(--accent)] bg-[var(--bg-input)] text-[var(--text-primary)] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 text-[11px] font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] cursor-pointer shrink-0"
                  >
                    Add
                  </button>
                </form>
              )}

              {flatSidebarFolders.length === 0 ? (
                <p className="px-2.5 py-1 text-[11px] text-[var(--text-muted)]">
                  No library folders yet.
                </p>
              ) : filteredSidebarFolders.length === 0 ? (
                <p className="px-2.5 py-1 text-[11px] text-[var(--text-muted)]">
                  No matching library folders.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {filteredSidebarFolders.map(({folder, depth, pathLabel}) => {
                    const state = getSidebarFolderState(folder.id);
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={state === 'all' ? true : state === 'some' ? 'mixed' : false}
                        data-submenu-item="true"
                        title={pathLabel}
                        onClick={() =>
                          onToggleSidebarFolderMembership(targetIds, folder.id, state !== 'all')
                        }
                        className="w-full py-1.5 pr-2.5 flex items-center justify-between gap-2 text-left text-xs rounded hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)] focus:outline-none cursor-pointer"
                        style={{paddingLeft: `${10 + (normalizedFolderQuery ? 0 : depth) * 12}px`}}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Folder
                            className="w-3.5 h-3.5 shrink-0"
                            style={{color: getFolderColorHex(folder.color) ?? 'var(--text-muted)'}}
                          />
                          <span className="truncate text-[var(--text-primary)]">
                            {normalizedFolderQuery ? pathLabel : folder.name}
                          </span>
                        </span>
                        {renderTriCheck(state)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cascading Submenu: Reading Status */}
      {activeSubmenu === 'status' && (
        <div
          ref={submenuRef}
          role="menu"
          aria-label="Reading status submenu"
          onMouseEnter={cancelSubmenuTimer}
          onContextMenu={(e) => e.preventDefault()}
          className="fixed z-50 w-48 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl py-1.5 px-1 select-none"
          style={{left: `${submenuPos.left}px`, top: `${submenuPos.top}px`}}
        >
          {(
            [
              {id: 'unread', label: 'Unread', icon: <Circle className="w-3.5 h-3.5" />},
              {
                id: 'reading',
                label: 'Currently Reading',
                icon: <BookOpen className="w-3.5 h-3.5" />,
              },
              {id: 'finished', label: 'Finished', icon: <CheckCircle2 className="w-3.5 h-3.5" />},
            ] as const
          ).map((opt) => {
            const active = sharedStatus === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                data-submenu-item="true"
                onClick={() => {
                  onSetReadingStatus(targetIds, opt.id);
                  onClose();
                }}
                className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left text-xs rounded text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)] focus:outline-none cursor-pointer whitespace-nowrap"
              >
                <span className="inline-flex items-center gap-2">
                  <span className={active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}>
                    {opt.icon}
                  </span>
                  <span>{opt.label}</span>
                </span>
                {active && <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
};
