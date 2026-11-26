import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookmarkPlus,
  Check,
  GripVertical,
  Layers,
  ListMusic,
  MonitorPlay,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useManagerPlaylistDrag } from '../../hooks/useManagerPlaylistDrag';
import { StackSlot, StreamFolder, StreamItem, StreamPreset } from '../../types';
import { getDescendantFolderIds } from './StreamVaultSidebar';

type ManagerTab = 'all' | 'playlists' | 'vault';

const MANAGER_TAB_STORAGE_KEY = 'kanso_streamer_manager_tab_v1';
const DEFAULT_PLAYLIST_CATEGORIES = ['Focus', 'Overnight', 'Study', 'Healing', 'General'];

interface StreamerStudioSidebarProps {
  streams: StreamItem[];
  folders: StreamFolder[];
  presets: StreamPreset[];
  activePresetId: string | null;
  activeSlotsCount: number;
  isActivePresetDirty: boolean;
  activeStreamIdSet: Set<string>;
  existingCategories?: string[];
  onLoadPreset: (presetId: string, mode?: 'replace' | 'append') => void;
  onSavePreset: (name: string, category: string) => void;
  onUpdatePreset: (
    presetId: string,
    patch: Partial<Pick<StreamPreset, 'name' | 'category' | 'pinned' | 'sortOrder'>>,
  ) => void;
  onUpdatePresetMix: (presetId: string) => void;
  onReorderPresets: (orderedPresetIds: string[]) => void;
  onDeletePreset: (presetId: string) => void;
  onStackStream: (streamId: string) => void;
  onEditStream?: (streamId: string) => void;
  onDeleteStream?: (streamId: string) => void;
  onCloseMobile?: () => void;
}

function readInitialManagerTab(): ManagerTab {
  if (typeof window === 'undefined') return 'all';
  try {
    const saved = localStorage.getItem(MANAGER_TAB_STORAGE_KEY);
    if (saved === 'all' || saved === 'playlists' || saved === 'vault') {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'all';
}

function buildNestedFolderOptions(folders: StreamFolder[]): { id: string; label: string }[] {
  const byParent = new Map<string | null, StreamFolder[]>();
  const idSet = new Set(folders.map((f) => f.id));
  for (const f of folders) {
    const parentKey = f.parentId && idSet.has(f.parentId) ? f.parentId : null;
    const arr = byParent.get(parentKey) ?? [];
    arr.push(f);
    byParent.set(parentKey, arr);
  }
  const result: { id: string; label: string }[] = [];
  const visited = new Set<string>();
  const visit = (parentId: string | null, depth: number) => {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      const indent = depth === 0 ? '' : `${'\u00A0\u00A0'.repeat(depth)}└ `;
      result.push({ id: child.id, label: `${indent}${child.name}` });
      visit(child.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}

function sortPlaylistsPinnedFirst(presets: StreamPreset[]): StreamPreset[] {
  const indexMap = new Map<string, number>();
  presets.forEach((p, idx) => indexMap.set(p.id, idx));

  return [...presets].sort((a, b) => {
    const aPinned = Boolean(a.pinned);
    const bPinned = Boolean(b.pinned);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;

    const aHasOrder = typeof a.sortOrder === 'number' && Number.isFinite(a.sortOrder);
    const bHasOrder = typeof b.sortOrder === 'number' && Number.isFinite(b.sortOrder);
    if (aHasOrder && bHasOrder && a.sortOrder !== b.sortOrder) {
      return (a.sortOrder as number) - (b.sortOrder as number);
    }
    if (aHasOrder !== bHasOrder) {
      // Newly created playlists without sortOrder sit cleanly at the top of their group
      return aHasOrder ? 1 : -1;
    }
    return (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0);
  });
}

function resolvePlaylistEntries(
  preset: StreamPreset,
  streamById: Map<string, StreamItem>,
): { slot: StackSlot; stream: StreamItem | undefined }[] {
  if (Array.isArray(preset.slots) && preset.slots.length > 0) {
    return preset.slots.map((slot) => ({
      slot,
      stream: streamById.get(slot.streamId),
    }));
  }
  return preset.streamIds.map((streamId, idx) => ({
    slot: {
      slotId: `${preset.id}-${idx}`,
      streamId,
      volume: 100,
      muted: false,
      loopMode: 'infinite',
      loopCount: 1,
    },
    stream: streamById.get(streamId),
  }));
}

export const StreamerStudioSidebar: React.FC<StreamerStudioSidebarProps> = ({
  streams,
  folders,
  presets,
  activePresetId,
  activeSlotsCount,
  isActivePresetDirty,
  activeStreamIdSet,
  existingCategories = [],
  onLoadPreset,
  onSavePreset,
  onUpdatePreset,
  onUpdatePresetMix,
  onReorderPresets,
  onDeletePreset,
  onStackStream,
  onEditStream,
  onDeleteStream,
  onCloseMobile,
}) => {
  const [activeTab, setActiveTab] = useState<ManagerTab>(readInitialManagerTab);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [folderFilter, setFolderFilter] = useState<string>('all');
  const [vaultQuery, setVaultQuery] = useState('');
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  // Header "+ Save" inline form state
  const [saveFormOpen, setSaveFormOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveCategory, setSaveCategory] = useState('Focus');
  const [saveCustomMode, setSaveCustomMode] = useState(false);
  const [saveCustomCategory, setSaveCustomCategory] = useState('');

  // Inline Playlist Rename & Category editor
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('General');
  const [editCustomMode, setEditCustomMode] = useState(false);
  const [editCustomCategory, setEditCustomCategory] = useState('');

  // Portal 3-dots action menu (shared for playlists & vault rows)
  const [openMenu, setOpenMenu] = useState<
    | { kind: 'playlist'; presetId: string; x: number; y: number }
    | { kind: 'vault'; streamId: string; x: number; y: number }
    | null
  >(null);

  // Replace vs Layer dialog when clicking a Playlist card while Live Grid has streams
  const [pendingLoadPresetId, setPendingLoadPresetId] = useState<string | null>(null);

  // Hover inspection popover for Playlists
  const [hoverPreview, setHoverPreview] = useState<{
    presetId: string;
    rect: { top: number; left: number; right: number; bottom: number };
  } | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const handleChangeTab = (tab: ManagerTab) => {
    setActiveTab(tab);
    setOpenMenu(null);
    setHoverPreview(null);
    try {
      localStorage.setItem(MANAGER_TAB_STORAGE_KEY, tab);
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('[data-manager-portal-menu="true"]') ||
        target?.closest('[data-manager-menu-trigger="true"]')
      ) {
        return;
      }
      setOpenMenu(null);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!pendingLoadPresetId) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingLoadPresetId(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [pendingLoadPresetId]);

  const streamById = useMemo(() => {
    const map = new Map<string, StreamItem>();
    for (const s of streams) map.set(s.id, s);
    return map;
  }, [streams]);

  const categoryChoices = useMemo(() => {
    const set = new Set<string>(DEFAULT_PLAYLIST_CATEGORIES);
    for (const c of existingCategories) {
      if (c.trim()) set.add(c.trim());
    }
    for (const p of presets) {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [existingCategories, presets]);

  const filterCategoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of presets) {
      set.add((p.category || 'General').trim() || 'General');
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [presets]);

  const sortedPresets = useMemo(() => sortPlaylistsPinnedFirst(presets), [presets]);

  const filteredPresets = useMemo(() => {
    if (categoryFilter === 'all') return sortedPresets;
    return sortedPresets.filter(
      (p) => ((p.category || 'General').trim() || 'General') === categoryFilter,
    );
  }, [sortedPresets, categoryFilter]);

  const folderOptions = useMemo(() => buildNestedFolderOptions(folders), [folders]);

  const activeFolderDescendants = useMemo(() => {
    if (folderFilter === 'all') return null;
    return getDescendantFolderIds(folderFilter, folders);
  }, [folderFilter, folders]);

  const filteredVaultStreams = useMemo(() => {
    const q = vaultQuery.trim().toLowerCase();
    return streams.filter((s) => {
      if (activeFolderDescendants) {
        const streamFolders = s.folderIds ?? [];
        if (!streamFolders.some((fid) => activeFolderDescendants.has(fid))) {
          return false;
        }
      }
      if (q) {
        const hay = `${s.customLabel} ${s.title} ${s.channel} ${s.category} ${(s.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [streams, activeFolderDescendants, vaultQuery]);

  const handleReorderPlaylistsDrop = useCallback(
    (draggedId: string, targetId: string, position: 'before' | 'after') => {
      if (draggedId === targetId) return;
      const ordered = [...sortedPresets];
      const draggedIdx = ordered.findIndex((p) => p.id === draggedId);
      if (draggedIdx === -1) return;
      const [draggedItem] = ordered.splice(draggedIdx, 1);
      const targetIdx = ordered.findIndex((p) => p.id === targetId);
      if (targetIdx === -1) return;
      const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
      ordered.splice(insertIdx, 0, draggedItem);
      onReorderPresets(ordered.map((p) => p.id));
    },
    [sortedPresets, onReorderPresets],
  );

  const {
    isDraggingPlaylist,
    draggingPlaylistId,
    activePlaylistDropTarget,
    handlePlaylistPointerDown,
    shouldSuppressPlaylistClick,
    renderPlaylistDragPreview,
  } = useManagerPlaylistDrag({
    enabled: activeTab !== 'vault' && filteredPresets.length > 1 && editingPlaylistId === null,
    scrollContainerRef,
    onReorderPlaylists: handleReorderPlaylistsDrop,
  });

  useEffect(() => {
    if (isDraggingPlaylist) {
      setHoverPreview(null);
      setOpenMenu(null);
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    }
  }, [isDraggingPlaylist]);

  const scheduleHoverPreview = (presetId: string, el: HTMLElement) => {
    if (isDraggingPlaylist || openMenu || editingPlaylistId === presetId) return;
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    const rect = el.getBoundingClientRect();
    hoverTimerRef.current = window.setTimeout(() => {
      setHoverPreview({
        presetId,
        rect: {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
        },
      });
    }, 180);
  };

  const clearHoverPreview = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverPreview(null);
  };

  const handleSaveFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = saveName.trim();
    if (!trimmed || activeSlotsCount === 0) return;
    const resolvedCategory = saveCustomMode
      ? saveCustomCategory.trim() || 'General'
      : saveCategory;
    onSavePreset(trimmed, resolvedCategory);
    setSaveName('');
    setSaveCustomCategory('');
    setSaveCustomMode(false);
    setSaveFormOpen(false);
  };

  const beginEditPlaylist = (preset: StreamPreset) => {
    setOpenMenu(null);
    clearHoverPreview();
    const currentCat = (preset.category || 'General').trim() || 'General';
    setEditingPlaylistId(preset.id);
    setEditName(preset.name);
    if (categoryChoices.includes(currentCat)) {
      setEditCategory(currentCat);
      setEditCustomMode(false);
      setEditCustomCategory('');
    } else {
      setEditCategory('General');
      setEditCustomMode(true);
      setEditCustomCategory(currentCat);
    }
  };

  const handleSavePlaylistEdit = (e: React.FormEvent, presetId: string) => {
    e.preventDefault();
    const trimmedName = editName.trim();
    if (!trimmedName) return;
    const resolvedCategory = editCustomMode
      ? editCustomCategory.trim() || 'General'
      : editCategory;
    onUpdatePreset(presetId, {
      name: trimmedName,
      category: resolvedCategory,
    });
    setEditingPlaylistId(null);
  };

  const handlePlaylistCardClick = (presetId: string) => {
    if (shouldSuppressPlaylistClick()) return;
    clearHoverPreview();
    if (activeSlotsCount > 0) {
      setPendingLoadPresetId(presetId);
    } else {
      onLoadPreset(presetId, 'replace');
      onCloseMobile?.();
    }
  };

  const openPortalMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
    payload: { kind: 'playlist'; presetId: string } | { kind: 'vault'; streamId: string },
  ) => {
    e.stopPropagation();
    clearHoverPreview();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const x = Math.max(10, Math.min(window.innerWidth - menuWidth - 10, rect.right - menuWidth));
    const y = Math.min(window.innerHeight - 132, rect.bottom + 4);
    setOpenMenu((prev) => {
      if (
        prev &&
        prev.kind === payload.kind &&
        ((prev.kind === 'playlist' &&
          payload.kind === 'playlist' &&
          prev.presetId === payload.presetId) ||
          (prev.kind === 'vault' &&
            payload.kind === 'vault' &&
            prev.streamId === payload.streamId))
      ) {
        return null;
      }
      return { ...payload, x, y };
    });
  };

  const pendingPreset = useMemo(
    () => (pendingLoadPresetId ? presets.find((p) => p.id === pendingLoadPresetId) ?? null : null),
    [pendingLoadPresetId, presets],
  );

  const hoveredPreset = useMemo(
    () => (hoverPreview ? presets.find((p) => p.id === hoverPreview.presetId) ?? null : null),
    [hoverPreview, presets],
  );

  const showPlaylistsSection = activeTab === 'all' || activeTab === 'playlists';
  const showVaultSection = activeTab === 'all' || activeTab === 'vault';

  const hasPinnedPlaylists = filteredPresets.some((p) => Boolean(p.pinned));
  const hasUnpinnedPlaylists = filteredPresets.some((p) => !p.pinned);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: 'var(--bg-surface)' }}
    >
      {/* Sticky Manager Tabs */}
      <div
        className="px-3.5 py-2.5 border-b flex items-center gap-2 shrink-0"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div
          className="flex-1 min-w-0 grid grid-cols-3 h-8 p-0.5 rounded-lg border gap-0.5"
          style={{
            backgroundColor: 'var(--bg-surface-subtle)',
            borderColor: 'var(--border-subtle)',
          }}
          role="tablist"
          aria-label="Manager sections"
        >
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'playlists', label: 'Playlists' },
              { id: 'vault', label: 'Vault' },
            ] as { id: ManagerTab; label: string }[]
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleChangeTab(tab.id)}
                className="h-full rounded-md text-xs font-semibold transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-muted)',
                  boxShadow: active ? 'var(--shadow-card)' : 'none',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-[var(--bg-surface-hover)]"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close manager pane"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Scrollable Body */}
      <div
        ref={scrollContainerRef}
        onScroll={() => {
          if (hoverPreview) clearHoverPreview();
        }}
        className="flex-1 overflow-y-auto p-3.5 space-y-5"
      >
        {/* Section 1: Playlists */}
        {showPlaylistsSection && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3
                  className="text-xs font-semibold tracking-tight whitespace-nowrap"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Playlists
                </h3>
                <span
                  className="text-[11px] font-mono tabular-nums"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {filteredPresets.length}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={activeSlotsCount === 0}
                  onClick={() => {
                    setOpenMenu(null);
                    setSaveFormOpen((prev) => !prev);
                  }}
                  className="h-7 px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors disabled:opacity-45 hover:bg-[var(--bg-surface-hover)]"
                  style={{
                    backgroundColor: saveFormOpen
                      ? 'var(--accent-soft)'
                      : 'var(--bg-surface-subtle)',
                    borderColor: saveFormOpen ? 'var(--accent)' : 'var(--border-subtle)',
                    color: saveFormOpen ? 'var(--accent)' : 'var(--text-primary)',
                  }}
                  title={
                    activeSlotsCount === 0
                      ? 'Add streams to Live Grid first to save a playlist'
                      : 'Save current Live Grid mix as a playlist'
                  }
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-7 px-2 rounded-lg border text-[11px] font-medium outline-none max-w-[116px]"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                  aria-label="Filter playlists by category"
                >
                  <option value="all">All Playlists</option>
                  {filterCategoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Inline Save Playlist Form */}
            {saveFormOpen && (
              <form
                onSubmit={handleSaveFormSubmit}
                className="rounded-xl border p-2.5 space-y-2"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-strong)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Save Active Mix ({activeSlotsCount}{' '}
                    {activeSlotsCount === 1 ? 'track' : 'tracks'})
                  </span>
                  <button
                    type="button"
                    onClick={() => setSaveFormOpen(false)}
                    className="h-5 w-5 rounded flex items-center justify-center"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label="Cancel saving playlist"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Playlist name..."
                  autoFocus
                  className="w-full h-7 px-2.5 rounded-lg border text-xs outline-none"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                {saveCustomMode ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={saveCustomCategory}
                      onChange={(e) => setSaveCustomCategory(e.target.value)}
                      placeholder="Custom category..."
                      autoFocus
                      className="flex-1 min-w-0 h-7 px-2.5 rounded-lg border text-xs outline-none"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSaveCustomMode(false);
                        setSaveCustomCategory('');
                      }}
                      className="h-7 w-7 rounded-lg border flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-muted)',
                      }}
                      title="Choose from saved categories"
                      aria-label="Back to category list"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <select
                    value={saveCategory}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setSaveCustomMode(true);
                      } else {
                        setSaveCategory(e.target.value);
                      }
                    }}
                    className="w-full h-7 px-2 rounded-lg border text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                    aria-label="New playlist category"
                  >
                    {categoryChoices.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__custom__">+ Custom category...</option>
                  </select>
                )}
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSaveFormOpen(false)}
                    className="h-7 px-2.5 rounded-lg border text-[11px] font-medium whitespace-nowrap"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!saveName.trim() || activeSlotsCount === 0}
                    className="h-7 px-2.5 rounded-lg text-[11px] font-semibold whitespace-nowrap disabled:opacity-45"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: 'var(--accent-fg)',
                    }}
                  >
                    Save Playlist
                  </button>
                </div>
              </form>
            )}

            {filteredPresets.length === 0 ? (
              <div
                className="rounded-xl border px-3 py-5 text-center space-y-1.5"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                <ListMusic className="w-4 h-4 mx-auto opacity-70" />
                <div className="text-[11px] leading-relaxed">
                  {presets.length === 0
                    ? 'No saved playlists yet. Build a stack and use Save above or in the transport bar.'
                    : 'No playlists in this category.'}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPresets.map((preset, idx) => {
                  const isActive = activePresetId === preset.id;
                  const isDirty = isActive && activeSlotsCount > 0 && isActivePresetDirty;
                  const isPinned = Boolean(preset.pinned);
                  const prevPreset = idx > 0 ? filteredPresets[idx - 1] : null;
                  const showPinnedLabel = hasPinnedPlaylists && hasUnpinnedPlaylists && idx === 0 && isPinned;
                  const showUnpinnedDivider =
                    hasPinnedPlaylists &&
                    hasUnpinnedPlaylists &&
                    !isPinned &&
                    Boolean(prevPreset?.pinned);

                  const entries = resolvePlaylistEntries(preset, streamById);
                  const validEntries = entries.filter((e) => e.stream !== undefined);
                  const trackCount = entries.length;
                  const hasMixSaved = Boolean(preset.slots && preset.slots.length > 0);
                  const collageItems = validEntries.slice(0, 4);
                  const isEditing = editingPlaylistId === preset.id;
                  const isDraggingThis = draggingPlaylistId === preset.id;
                  const dropPos =
                    activePlaylistDropTarget?.playlistId === preset.id
                      ? activePlaylistDropTarget.position
                      : null;

                  return (
                    <React.Fragment key={preset.id}>
                      {showPinnedLabel && (
                        <div
                          className="text-[10px] font-semibold uppercase tracking-wider px-0.5"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Pinned
                        </div>
                      )}
                      {showUnpinnedDivider && (
                        <div
                          className="pt-1.5 border-t text-[10px] font-semibold uppercase tracking-wider px-0.5"
                          style={{
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          Playlists
                        </div>
                      )}

                      <div
                        data-playlist-reorder-id={preset.id}
                        data-playlist-pinned={isPinned ? 'true' : 'false'}
                        onPointerDown={(e) =>
                          handlePlaylistPointerDown(
                            preset.id,
                            preset.name,
                            trackCount,
                            isPinned,
                            e,
                          )
                        }
                        onMouseEnter={(e) => scheduleHoverPreview(preset.id, e.currentTarget)}
                        onMouseLeave={clearHoverPreview}
                        className={`relative group rounded-xl border p-2.5 transition-colors ${
                          isDraggingThis ? 'opacity-45' : 'hover:bg-[var(--bg-surface-hover)]'
                        }`}
                        style={{
                          backgroundColor: isActive
                            ? 'var(--accent-soft)'
                            : 'var(--bg-surface-subtle)',
                          borderColor: isActive ? 'var(--accent)' : 'var(--border-subtle)',
                        }}
                      >
                        {dropPos === 'before' && (
                          <div
                            className="absolute -top-1 left-2 right-2 h-0.5 rounded-full pointer-events-none z-10"
                            style={{ backgroundColor: 'var(--accent)' }}
                          />
                        )}
                        {dropPos === 'after' && (
                          <div
                            className="absolute -bottom-1 left-2 right-2 h-0.5 rounded-full pointer-events-none z-10"
                            style={{ backgroundColor: 'var(--accent)' }}
                          />
                        )}

                        {isEditing ? (
                          <form
                            onSubmit={(e) => handleSavePlaylistEdit(e, preset.id)}
                            className="space-y-2"
                            data-no-playlist-drag="true"
                          >
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              autoFocus
                              placeholder="Playlist name..."
                              className="w-full h-7 px-2.5 rounded-lg border text-xs outline-none"
                              style={{
                                backgroundColor: 'var(--bg-surface)',
                                borderColor: 'var(--border-subtle)',
                                color: 'var(--text-primary)',
                              }}
                            />
                            {editCustomMode ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={editCustomCategory}
                                  onChange={(e) => setEditCustomCategory(e.target.value)}
                                  placeholder="Custom category..."
                                  autoFocus
                                  className="flex-1 min-w-0 h-7 px-2.5 rounded-lg border text-xs outline-none"
                                  style={{
                                    backgroundColor: 'var(--bg-surface)',
                                    borderColor: 'var(--border-subtle)',
                                    color: 'var(--text-primary)',
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditCustomMode(false);
                                    setEditCustomCategory('');
                                  }}
                                  className="h-7 w-7 rounded-lg border flex items-center justify-center shrink-0"
                                  style={{
                                    backgroundColor: 'var(--bg-surface)',
                                    borderColor: 'var(--border-subtle)',
                                    color: 'var(--text-muted)',
                                  }}
                                  aria-label="Back to saved categories"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <select
                                value={editCategory}
                                onChange={(e) => {
                                  if (e.target.value === '__custom__') {
                                    setEditCustomMode(true);
                                  } else {
                                    setEditCategory(e.target.value);
                                  }
                                }}
                                className="w-full h-7 px-2 rounded-lg border text-xs outline-none"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--border-subtle)',
                                  color: 'var(--text-secondary)',
                                }}
                                aria-label="Edit playlist category"
                              >
                                {categoryChoices.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                                <option value="__custom__">+ Custom category...</option>
                              </select>
                            )}
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingPlaylistId(null)}
                                className="h-7 px-2.5 rounded-lg border text-[11px] font-medium whitespace-nowrap"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--border-subtle)',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={!editName.trim()}
                                className="h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-45"
                                style={{
                                  backgroundColor: 'var(--accent)',
                                  color: 'var(--accent-fg)',
                                }}
                              >
                                <Check className="w-3 h-3" />
                                <span>Save</span>
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-start gap-2">
                              {/* Drag Handle */}
                              <button
                                type="button"
                                data-playlist-drag-handle="true"
                                onClick={(e) => e.stopPropagation()}
                                className="h-10 w-4 rounded flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing opacity-45 group-hover:opacity-100 transition-opacity touch-none"
                                style={{ color: 'var(--text-muted)' }}
                                title="Drag to reorder playlist"
                                aria-label={`Reorder playlist ${preset.name}`}
                              >
                                <GripVertical className="w-3.5 h-3.5" />
                              </button>

                              {/* 2x2 Thumbnail Collage */}
                              <button
                                type="button"
                                onClick={() => handlePlaylistCardClick(preset.id)}
                                className="w-11 h-11 rounded-lg overflow-hidden shrink-0 border grid grid-cols-2 grid-rows-2 gap-px"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--border-subtle)',
                                }}
                                aria-label={`Open or load playlist ${preset.name}`}
                              >
                                {collageItems.length === 0 ? (
                                  <div
                                    className="col-span-2 row-span-2 flex items-center justify-center"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    <ListMusic className="w-4 h-4" />
                                  </div>
                                ) : collageItems.length === 1 ? (
                                  <div className="col-span-2 row-span-2 overflow-hidden">
                                    {collageItems[0].stream &&
                                    !brokenThumbs[collageItems[0].stream.id] ? (
                                      <img
                                        src={collageItems[0].stream.thumbnailUrl}
                                        alt=""
                                        referrerPolicy="no-referrer"
                                        onError={() => {
                                          const id = collageItems[0].stream?.id;
                                          if (id) {
                                            setBrokenThumbs((prev) => ({ ...prev, [id]: true }));
                                          }
                                        }}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div
                                        className="w-full h-full flex items-center justify-center"
                                        style={{ color: 'var(--text-muted)' }}
                                      >
                                        <MonitorPlay className="w-3.5 h-3.5" />
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  [0, 1, 2, 3].map((cellIdx) => {
                                    const entry = collageItems[cellIdx];
                                    const stream = entry?.stream;
                                    const thumbKey = stream?.id;
                                    return (
                                      <div
                                        key={cellIdx}
                                        className="overflow-hidden flex items-center justify-center"
                                        style={{ backgroundColor: 'var(--bg-surface-subtle)' }}
                                      >
                                        {stream && thumbKey && !brokenThumbs[thumbKey] ? (
                                          <img
                                            src={stream.thumbnailUrl}
                                            alt=""
                                            referrerPolicy="no-referrer"
                                            onError={() =>
                                              setBrokenThumbs((prev) => ({
                                                ...prev,
                                                [thumbKey]: true,
                                              }))
                                            }
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <MonitorPlay
                                            className="w-2.5 h-2.5 opacity-45"
                                            style={{ color: 'var(--text-muted)' }}
                                          />
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </button>

                              {/* Clickable Title & Inline Unboxed Stats */}
                              <button
                                type="button"
                                onClick={() => handlePlaylistCardClick(preset.id)}
                                className="min-w-0 flex-1 text-left space-y-0.5 py-0.5"
                              >
                                <div className="flex items-center gap-1 min-w-0">
                                  {isPinned && (
                                    <Pin
                                      className="w-3 h-3 shrink-0"
                                      style={{ color: 'var(--accent)' }}
                                    />
                                  )}
                                  <span
                                    className="text-xs font-semibold truncate"
                                    style={{
                                      color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                                    }}
                                  >
                                    {preset.name}
                                  </span>
                                </div>
                                <div
                                  className="text-[11px] font-mono tabular-nums truncate"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  {[
                                    preset.category || 'General',
                                    `${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}`,
                                    hasMixSaved ? 'mix saved' : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </div>
                              </button>

                              {/* Pin & Vertical 3-dots Action Menu */}
                              <div className="flex items-center gap-0.5 shrink-0" data-no-playlist-drag="true">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdatePreset(preset.id, { pinned: !isPinned });
                                  }}
                                  className={`h-7 w-7 rounded-lg flex items-center justify-center transition-opacity hover:bg-[var(--bg-surface)] ${
                                    isPinned
                                      ? 'opacity-100'
                                      : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                                  }`}
                                  style={{
                                    color: isPinned ? 'var(--accent)' : 'var(--text-muted)',
                                  }}
                                  title={isPinned ? 'Unpin playlist' : 'Pin playlist to top'}
                                  aria-label={
                                    isPinned
                                      ? `Unpin playlist ${preset.name}`
                                      : `Pin playlist ${preset.name}`
                                  }
                                >
                                  {isPinned ? (
                                    <Pin className="w-3.5 h-3.5" />
                                  ) : (
                                    <PinOff className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  data-manager-menu-trigger="true"
                                  onClick={(e) =>
                                    openPortalMenu(e, { kind: 'playlist', presetId: preset.id })
                                  }
                                  className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-surface)]"
                                  style={{ color: 'var(--text-muted)' }}
                                  title="Playlist options"
                                  aria-label={`Playlist options for ${preset.name}`}
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Playlist Footer Action Bar: + Layer & Update Mix (when active mix edited) */}
                            <div
                              className="flex items-center justify-between gap-1.5 pt-0.5 pl-6"
                              data-no-playlist-drag="true"
                            >
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    clearHoverPreview();
                                    onLoadPreset(preset.id, 'append');
                                    onCloseMobile?.();
                                  }}
                                  className="h-6 px-2 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors hover:bg-[var(--bg-surface)]"
                                  style={{
                                    backgroundColor: 'var(--bg-surface)',
                                    borderColor: 'var(--border-subtle)',
                                    color: 'var(--text-secondary)',
                                  }}
                                  title="Append tracks from this playlist onto Live Grid"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Layer</span>
                                </button>

                                {isDirty && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      clearHoverPreview();
                                      onUpdatePresetMix(preset.id);
                                    }}
                                    className="h-6 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                                    style={{
                                      backgroundColor: 'var(--accent)',
                                      color: 'var(--accent-fg)',
                                    }}
                                    title="Save modified grid tracks, volumes, and loops back to this playlist"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    <span>Update Mix</span>
                                  </button>
                                )}
                              </div>

                              {isActive && (
                                <span
                                  className="text-[10px] font-semibold whitespace-nowrap shrink-0"
                                  style={{ color: 'var(--accent)' }}
                                >
                                  Active
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Section 2: Quick-Add from Vault */}
        {showVaultSection && (
          <section
            className={`space-y-2.5 ${showPlaylistsSection ? 'pt-3.5 border-t' : ''}`}
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3
                  className="text-xs font-semibold tracking-tight whitespace-nowrap"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Vault
                </h3>
                <span
                  className="text-[11px] font-mono tabular-nums"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {filteredVaultStreams.length}
                </span>
              </div>
              <select
                value={folderFilter}
                onChange={(e) => setFolderFilter(e.target.value)}
                className="h-7 px-2 rounded-lg border text-[11px] font-medium outline-none max-w-[148px]"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
                aria-label="Filter vault by folder"
              >
                <option value="all">All Folders</option>
                {folderOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Always-Visible Search Box */}
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                value={vaultQuery}
                onChange={(e) => setVaultQuery(e.target.value)}
                placeholder="Search vault tracks..."
                className="w-full h-8 pl-8 pr-7 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              {vaultQuery && (
                <button
                  type="button"
                  onClick={() => setVaultQuery('')}
                  className="h-6 w-6 rounded flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 hover:bg-[var(--bg-surface)]"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Clear vault search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {filteredVaultStreams.length === 0 ? (
              <div
                className="rounded-xl border px-3 py-4 text-center text-[11px]"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                No matching tracks in Vault.
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredVaultStreams.map((stream) => {
                  const alreadyStacked = activeStreamIdSet.has(stream.id);
                  const displayTitle = stream.customLabel || stream.title;

                  return (
                    <div
                      key={stream.id}
                      className="rounded-xl border p-2 flex items-center gap-2 transition-colors hover:bg-[var(--bg-surface-hover)]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div
                        className="w-11 h-8 rounded-md overflow-hidden shrink-0 border"
                        style={{
                          backgroundColor: 'var(--bg-surface-subtle)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        {!brokenThumbs[stream.id] ? (
                          <img
                            src={stream.thumbnailUrl}
                            alt={displayTitle}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenThumbs((prev) => ({ ...prev, [stream.id]: true }))
                            }
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <MonitorPlay className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate" title={displayTitle}>
                          {displayTitle}
                        </div>
                        <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                          {[stream.channel || 'Unknown Channel', stream.category]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onStackStream(stream.id)}
                        className="h-7 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors hover:bg-[var(--bg-surface-subtle)]"
                        style={{
                          backgroundColor: alreadyStacked
                            ? 'var(--accent-soft)'
                            : 'var(--bg-surface-subtle)',
                          borderColor: alreadyStacked ? 'var(--accent)' : 'var(--border-subtle)',
                          color: alreadyStacked ? 'var(--accent)' : 'var(--text-primary)',
                        }}
                        title={
                          alreadyStacked
                            ? 'Add another independent layer of this stream'
                            : 'Add stream to active stack'
                        }
                      >
                        <Plus className="w-3 h-3" />
                        <span>{alreadyStacked ? 'Layer' : 'Stack'}</span>
                      </button>

                      {(onEditStream || onDeleteStream) && (
                        <button
                          type="button"
                          data-manager-menu-trigger="true"
                          onClick={(e) =>
                            openPortalMenu(e, { kind: 'vault', streamId: stream.id })
                          }
                          className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 hover:bg-[var(--bg-surface-subtle)]"
                          style={{ color: 'var(--text-muted)' }}
                          title="Stream actions"
                          aria-label={`Actions for ${displayTitle}`}
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Portal: Hover Preview Popover for Playlist Inspection */}
      {hoveredPreset &&
        hoverPreview &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const entries = resolvePlaylistEntries(hoveredPreset, streamById);
            const shown = entries.slice(0, 7);
            const overflowCount = Math.max(0, entries.length - shown.length);
            const popoverWidth = 264;
            const preferredLeft = hoverPreview.rect.left - popoverWidth - 10;
            const left =
              preferredLeft >= 12
                ? preferredLeft
                : Math.min(window.innerWidth - popoverWidth - 12, hoverPreview.rect.right + 10);
            const estimatedHeight = 82 + shown.length * 38 + (overflowCount > 0 ? 22 : 0);
            const top = Math.max(
              12,
              Math.min(window.innerHeight - estimatedHeight - 12, hoverPreview.rect.top),
            );

            return (
              <div
                aria-hidden="true"
                className="fixed z-[85] w-[264px] rounded-xl border p-3 space-y-2 pointer-events-none"
                style={{
                  top,
                  left,
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-strong)',
                  boxShadow: 'var(--shadow-popover)',
                }}
              >
                <div className="space-y-0.5">
                  <div
                    className="text-xs font-semibold truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {hoveredPreset.name}
                  </div>
                  <div
                    className="text-[11px] font-mono tabular-nums truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {[
                      hoveredPreset.category || 'General',
                      `${entries.length} ${entries.length === 1 ? 'track' : 'tracks'}`,
                      typeof hoveredPreset.masterVolume === 'number'
                        ? `Master ${hoveredPreset.masterVolume}%`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>

                {shown.length === 0 ? (
                  <div className="text-[11px] py-1" style={{ color: 'var(--text-muted)' }}>
                    No tracks saved in this playlist.
                  </div>
                ) : (
                  <div
                    className="space-y-1.5 pt-1.5 border-t"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    {shown.map(({ slot, stream }, i) => {
                      const title = stream
                        ? stream.customLabel || stream.title
                        : 'Removed track';
                      const loopLabel =
                        slot.loopMode === 'count' ? `×${slot.loopCount}` : '∞';
                      return (
                        <div key={`${slot.slotId}-${i}`} className="flex items-center gap-2">
                          <div
                            className="w-8 h-6 rounded overflow-hidden shrink-0 border flex items-center justify-center"
                            style={{
                              backgroundColor: 'var(--bg-surface-subtle)',
                              borderColor: 'var(--border-subtle)',
                            }}
                          >
                            {stream && !brokenThumbs[stream.id] ? (
                              <img
                                src={stream.thumbnailUrl}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <MonitorPlay
                                className="w-3 h-3"
                                style={{ color: 'var(--text-muted)' }}
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div
                              className="text-[11px] font-medium truncate"
                              style={{
                                color: stream ? 'var(--text-primary)' : 'var(--text-muted)',
                              }}
                            >
                              {title}
                            </div>
                          </div>
                          <div
                            className="flex items-center gap-1 text-[10px] font-mono tabular-nums shrink-0"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {slot.muted ? (
                              <VolumeX className="w-3 h-3" style={{ color: 'var(--danger)' }} />
                            ) : (
                              <Volume2 className="w-3 h-3" />
                            )}
                            <span>{slot.muted ? 'Muted' : `${slot.volume}%`}</span>
                            <span>· {loopLabel}</span>
                          </div>
                        </div>
                      );
                    })}
                    {overflowCount > 0 && (
                      <div
                        className="text-[10px] font-mono tabular-nums pt-0.5"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        +{overflowCount} more {overflowCount === 1 ? 'track' : 'tracks'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })(),
          document.body,
        )}

      {/* Portal: Vertical Three-Dots Menu for Playlists & Vault Rows */}
      {openMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
            if (openMenu.kind === 'playlist') {
              const preset = presets.find((p) => p.id === openMenu.presetId);
              if (!preset) return null;
              const isPinned = Boolean(preset.pinned);

              return (
                <div
                  data-manager-portal-menu="true"
                  className="fixed z-[90] w-44 rounded-xl border p-1 space-y-0.5"
                  style={{
                    top: openMenu.y,
                    left: openMenu.x,
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-strong)',
                    boxShadow: 'var(--shadow-popover)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => beginEditPlaylist(preset)}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs font-medium inline-flex items-center gap-2 hover:bg-[var(--bg-surface-subtle)]"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    <span>Rename & Category</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdatePreset(preset.id, { pinned: !isPinned });
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs font-medium inline-flex items-center gap-2 hover:bg-[var(--bg-surface-subtle)]"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {isPinned ? (
                      <PinOff className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    ) : (
                      <Pin className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                    )}
                    <span>{isPinned ? 'Unpin Playlist' : 'Pin to Top'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDeletePreset(preset.id);
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs font-medium inline-flex items-center gap-2 hover:bg-[var(--bg-surface-subtle)]"
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Playlist</span>
                  </button>
                </div>
              );
            }

            const stream = streamById.get(openMenu.streamId);
            if (!stream) return null;
            return (
              <div
                data-manager-portal-menu="true"
                className="fixed z-[90] w-40 rounded-xl border p-1 space-y-0.5"
                style={{
                  top: openMenu.y,
                  left: openMenu.x,
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-strong)',
                  boxShadow: 'var(--shadow-popover)',
                }}
              >
                {onEditStream && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      onEditStream(stream.id);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs font-medium inline-flex items-center gap-2 hover:bg-[var(--bg-surface-subtle)]"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    <span>Edit</span>
                  </button>
                )}
                {onDeleteStream && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      onDeleteStream(stream.id);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs font-medium inline-flex items-center gap-2 hover:bg-[var(--bg-surface-subtle)]"
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            );
          })(),
          document.body,
        )}

      {/* Portal: Replace vs Layer Confirmation Modal when Live Grid is Non-Empty */}
      {pendingPreset &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[95] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Load playlist ${pendingPreset.name}`}
          >
            <div
              className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
              onClick={() => setPendingLoadPresetId(null)}
              aria-hidden="true"
            />
            <div
              className="relative z-10 w-full max-w-sm rounded-2xl border p-4 space-y-3"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-strong)',
                boxShadow: 'var(--shadow-popover)',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <h3
                    className="font-display text-sm font-bold truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Load “{pendingPreset.name}”
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Your Live Grid currently has {activeSlotsCount}{' '}
                    {activeSlotsCount === 1 ? 'stream' : 'streams'}. Replace the active stack or
                    layer these tracks onto it?
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingLoadPresetId(null)}
                  className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 hover:bg-[var(--bg-surface-subtle)]"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Cancel loading playlist"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingLoadPresetId(null)}
                  className="h-8 px-3 rounded-lg border text-xs font-medium whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onLoadPreset(pendingPreset.id, 'append');
                    setPendingLoadPresetId(null);
                    onCloseMobile?.();
                  }}
                  className="h-8 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-[var(--bg-surface-subtle)]"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--accent)',
                    color: 'var(--accent)',
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Layer onto Stack</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onLoadPreset(pendingPreset.id, 'replace');
                    setPendingLoadPresetId(null);
                    onCloseMobile?.();
                  }}
                  className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-fg)',
                  }}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Replace Stack</span>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {renderPlaylistDragPreview()}
    </div>
  );
};
