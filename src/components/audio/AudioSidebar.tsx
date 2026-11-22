import {
  ChevronDown,
  ChevronRight,
  Clock,
  Disc3,
  Download,
  Folder,
  FolderPlus,
  HardDrive,
  Headphones,
  ListMusic,
  PanelLeftClose,
  Pencil,
  Plus,
  Radio,
  SlidersHorizontal,
  Star,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import { getAudioFolderIds } from "../../lib/audioFormatters";
import {
  FOLDER_COLORS,
  formatFileSize,
  getFolderColorHex,
  getFolderDescendantIds,
} from "../../lib/formatters";
import type {
  AudioFolderRecord,
  AudioMixPreset,
  AudioPlaylistRecord,
  AudioSidebarSectionKey,
  AudioSmartView,
  AudioTrackRecord,
} from "../../types/audio";
import type { FolderColor } from "../../types/library";

export interface ActiveAudioFilter {
  kind: "smart" | "folder" | "playlist";
  id: string;
}

const DEFAULT_SIDEBAR_WIDTH = 248;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 360;

interface AudioSidebarProps {
  tracks: AudioTrackRecord[];
  folders: AudioFolderRecord[];
  playlists: AudioPlaylistRecord[];
  mixPresets: AudioMixPreset[];
  activeSlotTrackIds: Set<string>;
  activePresetId: string | null;
  allTags: Array<{ name: string; count: number }>;
  activeFilter: ActiveAudioFilter;
  selectedTags: string[];
  collapsedSections: Record<AudioSidebarSectionKey, boolean>;
  sidebarWidth: number;
  isExportingBackup: boolean;
  isParsingBackup: boolean;
  onSidebarWidthChange: (width: number) => void;
  onToggleSection: (section: AudioSidebarSectionKey) => void;
  onSelectFilter: (filter: ActiveAudioFilter) => void;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  onCreateFolder: (
    name: string,
    parentId?: string | null,
    color?: FolderColor,
  ) => void;
  onUpdateFolder: (
    id: string,
    patch: { name?: string; color?: FolderColor },
  ) => void;
  onDeleteFolder: (id: string) => void;
  onCreatePlaylist: (name: string) => void;
  onUpdatePlaylist: (id: string, patch: { name?: string }) => void;
  onDeletePlaylist: (id: string) => void;
  onLoadMixPreset: (presetId: string) => void;
  onDeleteMixPreset: (presetId: string) => void;
  onDropTracksToFolder: (trackIds: string[], folderId: string) => void;
  onDropTracksToPlaylist: (trackIds: string[], playlistId: string) => void;
  onDropTracksToTag: (trackIds: string[], tagName: string) => void;
  onDropTracksToFavorites: (trackIds: string[]) => void;
  onExportBackup: () => void;
  onSelectImportBackupFile: (file: File) => void;
  onOpenStorageManager: () => void;
  isCollapsedDesktop?: boolean;
  onCollapseDesktop?: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export function extractDraggedAudioIds(dt: DataTransfer | null): string[] {
  if (!dt) return [];
  const multiRaw = dt.getData("application/x-kanso-audio-ids");
  if (multiRaw) {
    try {
      const parsed = JSON.parse(multiRaw);
      if (Array.isArray(parsed)) {
        const ids = parsed.filter((id): id is string => typeof id === "string");
        if (ids.length > 0) return ids;
      }
    } catch {
      // fall through
    }
  }
  const single = dt.getData("application/x-kanso-audio-id");
  return single ? [single] : [];
}

export function hasDraggedAudioPayload(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return (
    dt.types.includes("application/x-kanso-audio-ids") ||
    dt.types.includes("application/x-kanso-audio-id")
  );
}

export const AudioSidebar: React.FC<AudioSidebarProps> = ({
  tracks,
  folders,
  playlists,
  mixPresets,
  activeSlotTrackIds,
  activePresetId,
  allTags,
  activeFilter,
  selectedTags,
  collapsedSections,
  sidebarWidth,
  isExportingBackup,
  isParsingBackup,
  onSidebarWidthChange,
  onToggleSection,
  onSelectFilter,
  onToggleTag,
  onClearTags,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onCreatePlaylist,
  onUpdatePlaylist,
  onDeletePlaylist,
  onLoadMixPreset,
  onDeleteMixPreset,
  onDropTracksToFolder,
  onDropTracksToPlaylist,
  onDropTracksToTag,
  onDropTracksToFavorites,
  onExportBackup,
  onSelectImportBackupFile,
  onOpenStorageManager,
  isCollapsedDesktop = false,
  onCollapseDesktop,
  isOpenMobile,
  onCloseMobile,
}) => {
  const [addingFolderParentId, setAddingFolderParentId] = useState<
    string | null | undefined
  >(undefined);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState<FolderColor>("slate");

  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [editingFolderColor, setEditingFolderColor] =
    useState<FolderColor>("slate");
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    new Set(),
  );

  const [addingPlaylist, setAddingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(
    null,
  );
  const [editingPlaylistName, setEditingPlaylistName] = useState("");

  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const totalBytes = tracks.reduce((sum, t) => sum + (t.fileSize || 0), 0);

  const smartCounts: Record<AudioSmartView, number> = {
    all: tracks.length,
    mixing: tracks.filter((t) => activeSlotTrackIds.has(t.id)).length,
    favorites: tracks.filter((t) => t.isFavorite).length,
    recent: tracks.filter((t) => Boolean(t.lastPlayedAt)).length,
    unplayed: tracks.filter((t) => (t.playCount ?? 0) === 0).length,
  };

  const smartItems: Array<{
    id: AudioSmartView;
    label: string;
    icon: React.ReactNode;
    acceptsDrop?: boolean;
  }> = [
    {
      id: "all",
      label: "All Tracks",
      icon: <Headphones className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: "mixing",
      label: "Now Mixing",
      icon: <Radio className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: "favorites",
      label: "Favorites",
      icon: <Star className="w-3.5 h-3.5 shrink-0" />,
      acceptsDrop: true,
    },
    {
      id: "recent",
      label: "Recently Played",
      icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: "unplayed",
      label: "Unplayed",
      icon: <Disc3 className="w-3.5 h-3.5 shrink-0" />,
    },
  ];

  const folderChildrenMap = useMemo(() => {
    const byId = new Set(folders.map((f) => f.id));
    const map = new Map<string | null, AudioFolderRecord[]>();
    for (const folder of folders) {
      const parentKey =
        folder.parentId && byId.has(folder.parentId) ? folder.parentId : null;
      const list = map.get(parentKey) ?? [];
      list.push(folder);
      map.set(parentKey, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [folders]);

  const folderTrackCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const folder of folders) {
      const descendants = getFolderDescendantIds(folders, folder.id);
      counts.set(
        folder.id,
        tracks.filter((t) =>
          getAudioFolderIds(t).some((id) => descendants.has(id)),
        ).length,
      );
    }
    return counts;
  }, [folders, tracks]);

  const handleStartResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, startWidth + (moveEvent.clientX - startX)),
      );
      onSidebarWidthChange(nextWidth);
    };

    const onPointerUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const handleFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (trimmed && addingFolderParentId !== undefined) {
      onCreateFolder(trimmed, addingFolderParentId, newFolderColor);
      if (addingFolderParentId) {
        setCollapsedFolderIds((prev) => {
          const next = new Set(prev);
          next.delete(addingFolderParentId);
          return next;
        });
      }
      setNewFolderName("");
      setNewFolderColor("slate");
      setAddingFolderParentId(undefined);
    }
  };

  const handleFolderEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = editingFolderName.trim();
    if (editingFolderId && trimmed) {
      onUpdateFolder(editingFolderId, {
        name: trimmed,
        color: editingFolderColor,
      });
    }
    setEditingFolderId(null);
    setEditingFolderName("");
  };

  const handlePlaylistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlaylistName.trim();
    if (trimmed) {
      onCreatePlaylist(trimmed);
      setNewPlaylistName("");
      setAddingPlaylist(false);
    }
  };

  const handlePlaylistEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = editingPlaylistName.trim();
    if (editingPlaylistId && trimmed) {
      onUpdatePlaylist(editingPlaylistId, { name: trimmed });
    }
    setEditingPlaylistId(null);
    setEditingPlaylistName("");
  };

  const selectAndClose = (filter: ActiveAudioFilter) => {
    onSelectFilter(filter);
    onCloseMobile();
  };

  const toggleFolderExpanded = (folderId: string) => {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const renderColorSwatches = (
    selected: FolderColor,
    onSelect: (c: FolderColor) => void,
  ) => (
    <div className="flex items-center gap-1.5 pt-1">
      {FOLDER_COLORS.map((col) => (
        <button
          key={col.id}
          type="button"
          title={col.label}
          aria-label={`Folder color ${col.label}`}
          onClick={() => onSelect(col.id)}
          className={`w-3.5 h-3.5 rounded-full border transition-transform cursor-pointer ${
            selected === col.id
              ? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg-sidebar)] scale-105"
              : "border-black/15 opacity-80 hover:opacity-100"
          }`}
          style={{ backgroundColor: col.swatch }}
        />
      ))}
    </div>
  );

  const renderFolderForm = (parentId: string | null, depth: number) => (
    <form
      onSubmit={handleFolderSubmit}
      className="my-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 space-y-1.5"
      style={{ marginLeft: `${depth * 12}px` }}
    >
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          autoFocus
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder={parentId ? "Sub-folder name..." : "Folder name..."}
          className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setAddingFolderParentId(undefined);
              setNewFolderName("");
            }
          }}
        />
        <button
          type="submit"
          className="px-2 py-1 text-[11px] font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] cursor-pointer shrink-0"
        >
          Add
        </button>
      </div>
      {renderColorSwatches(newFolderColor, setNewFolderColor)}
    </form>
  );

  const renderFolderTree = (
    parentId: string | null,
    depth: number,
  ): React.ReactNode => {
    const items = folderChildrenMap.get(parentId) ?? [];
    return items.map((folder) => {
      const children = folderChildrenMap.get(folder.id) ?? [];
      const hasChildren = children.length > 0;
      const isExpanded = !collapsedFolderIds.has(folder.id);
      const active =
        activeFilter.kind === "folder" && activeFilter.id === folder.id;
      const count = folderTrackCountMap.get(folder.id) ?? 0;
      const isEditing = editingFolderId === folder.id;
      const dropKey = `folder:${folder.id}`;
      const isDragOver = dragOverKey === dropKey;
      const accentHex = getFolderColorHex(folder.color);

      return (
        <div key={folder.id}>
          {isEditing ? (
            <form
              onSubmit={handleFolderEditSubmit}
              className="my-1 rounded-md border border-[var(--accent)] bg-[var(--bg-surface)] p-2 space-y-1.5"
              style={{ marginLeft: `${depth * 12}px` }}
            >
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  autoFocus
                  value={editingFolderName}
                  onChange={(e) => setEditingFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingFolderId(null);
                  }}
                  className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)]"
                />
                <button
                  type="submit"
                  className="px-2 py-1 text-[11px] font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] cursor-pointer"
                >
                  Save
                </button>
              </div>
              {renderColorSwatches(editingFolderColor, setEditingFolderColor)}
            </form>
          ) : (
            <div
              onDragOver={(e) => {
                if (hasDraggedAudioPayload(e.dataTransfer)) {
                  e.preventDefault();
                  setDragOverKey(dropKey);
                }
              }}
              onDragLeave={() => {
                if (dragOverKey === dropKey) setDragOverKey(null);
              }}
              onDrop={(e) => {
                const ids = extractDraggedAudioIds(e.dataTransfer);
                if (ids.length > 0) {
                  e.preventDefault();
                  onDropTracksToFolder(ids, folder.id);
                }
                setDragOverKey(null);
              }}
              style={{ paddingLeft: `${6 + Math.min(depth, 3) * 12}px` }}
              className={`group flex items-center justify-between gap-1 pr-2 py-1.5 rounded-md text-xs transition-colors ${
                isDragOver
                  ? "ring-1 ring-[var(--accent)] bg-[var(--bg-accent-subtle)]"
                  : active
                    ? "bg-[var(--bg-accent-subtle)] text-[var(--accent)] font-medium"
                    : "text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
              }`}
            >
              <div className="flex items-center gap-1 min-w-0 flex-1">
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFolderExpanded(folder.id);
                    }}
                    aria-label={
                      isExpanded
                        ? `Collapse ${folder.name}`
                        : `Expand ${folder.name}`
                    }
                    className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </button>
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}

                <button
                  type="button"
                  onClick={() =>
                    selectAndClose({ kind: "folder", id: folder.id })
                  }
                  className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                >
                  <Folder
                    className="w-3.5 h-3.5 shrink-0"
                    style={
                      accentHex
                        ? { color: accentHex, fill: `${accentHex}24` }
                        : undefined
                    }
                  />
                  <span className="truncate">{folder.name}</span>
                </button>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                {depth < 3 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddingFolderParentId(folder.id);
                      setNewFolderName("");
                      setNewFolderColor(folder.color ?? "slate");
                    }}
                    title={`Add sub-folder inside ${folder.name}`}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-opacity"
                  >
                    <FolderPlus className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingFolderId(folder.id);
                    setEditingFolderName(folder.name);
                    setEditingFolderColor(folder.color ?? "slate");
                  }}
                  title="Edit folder"
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-opacity"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFolder(folder.id);
                  }}
                  title="Delete folder"
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--danger)] cursor-pointer transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
                <span className="font-mono tabular-nums text-[11px] text-[var(--text-muted)] w-4 text-right">
                  {count}
                </span>
              </div>
            </div>
          )}

          {addingFolderParentId === folder.id &&
            renderFolderForm(folder.id, depth + 1)}

          {hasChildren && isExpanded && (
            <div className="mt-0.5 space-y-0.5">
              {renderFolderTree(folder.id, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const sidebarContent = (isDesktop: boolean) => (
    <aside
      style={isDesktop ? { width: `${sidebarWidth}px` } : { width: "264px" }}
      className="relative flex flex-col h-full shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] select-none"
    >
      <input
        ref={backupInputRef}
        type="file"
        accept=".zip,application/zip"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelectImportBackupFile(file);
          e.target.value = "";
        }}
        className="hidden"
      />

      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-[var(--border-subtle)] shrink-0">
        <button
          type="button"
          onClick={() => selectAndClose({ kind: "smart", id: "all" })}
          className="flex items-center gap-2 text-left cursor-pointer whitespace-nowrap shrink-0"
        >
          <Headphones className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <span className="font-display text-base font-semibold tracking-tight text-[var(--text-primary)]">
            Audio
          </span>
        </button>

        {isDesktop && onCollapseDesktop && (
          <button
            type="button"
            onClick={onCollapseDesktop}
            title="Hide audio sidebar"
            aria-label="Hide audio sidebar"
            className="hidden lg:inline-flex p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close sidebar"
          className="lg:hidden p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3.5 space-y-4">
        {/* Smart Views */}
        <div>
          <button
            type="button"
            onClick={() => onToggleSection("views")}
            className="w-full px-2 mb-1 flex items-center justify-between text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <span>Library</span>
            {collapsedSections.views ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>

          {!collapsedSections.views && (
            <nav className="space-y-0.5" aria-label="Audio smart views">
              {smartItems.map((item) => {
                const active =
                  activeFilter.kind === "smart" && activeFilter.id === item.id;
                const dropKey = `smart:${item.id}`;
                const isDragOver = item.acceptsDrop && dragOverKey === dropKey;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      selectAndClose({ kind: "smart", id: item.id })
                    }
                    onDragOver={(e) => {
                      if (
                        item.acceptsDrop &&
                        hasDraggedAudioPayload(e.dataTransfer)
                      ) {
                        e.preventDefault();
                        setDragOverKey(dropKey);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverKey === dropKey) setDragOverKey(null);
                    }}
                    onDrop={(e) => {
                      if (!item.acceptsDrop) return;
                      const ids = extractDraggedAudioIds(e.dataTransfer);
                      if (ids.length > 0) {
                        e.preventDefault();
                        onDropTracksToFavorites(ids);
                      }
                      setDragOverKey(null);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      isDragOver
                        ? "ring-1 ring-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]"
                        : active
                          ? "bg-[var(--bg-accent-subtle)] text-[var(--accent)] font-medium"
                          : "text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className={
                          active || isDragOver
                            ? "text-[var(--accent)]"
                            : "text-[var(--text-secondary)]"
                        }
                      >
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-[var(--text-muted)] shrink-0">
                      {smartCounts[item.id]}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        {/* Folders */}
        <div>
          <div className="px-2 mb-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onToggleSection("folders")}
              className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {collapsedSections.folders ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              <span>Folders</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (collapsedSections.folders) onToggleSection("folders");
                setAddingFolderParentId((prev) =>
                  prev === null ? undefined : null,
                );
                setNewFolderName("");
                setNewFolderColor("slate");
              }}
              title="New folder"
              aria-label="Create new audio folder"
              className="p-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          {!collapsedSections.folders && (
            <>
              {addingFolderParentId === null && renderFolderForm(null, 0)}
              {folders.length === 0 && addingFolderParentId === undefined ? (
                <p className="px-2 py-1 text-[11px] text-[var(--text-muted)]">
                  No folders yet
                </p>
              ) : (
                <div className="space-y-0.5">{renderFolderTree(null, 0)}</div>
              )}
            </>
          )}
        </div>

        {/* Playlists (DnD Enabled) */}
        <div>
          <div className="px-2 mb-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onToggleSection("playlists")}
              className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {collapsedSections.playlists ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              <span>Playlists</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (collapsedSections.playlists) onToggleSection("playlists");
                setAddingPlaylist((v) => !v);
              }}
              title="New playlist"
              aria-label="Create new playlist"
              className="p-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {!collapsedSections.playlists && (
            <>
              {addingPlaylist && (
                <form onSubmit={handlePlaylistSubmit} className="px-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      autoFocus
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      placeholder="Playlist name..."
                      className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setAddingPlaylist(false);
                          setNewPlaylistName("");
                        }
                      }}
                    />
                    <button
                      type="submit"
                      className="px-2 py-1 text-[11px] font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] cursor-pointer shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </form>
              )}

              {playlists.length === 0 && !addingPlaylist ? (
                <p className="px-2 py-1 text-[11px] text-[var(--text-muted)]">
                  No playlists yet
                </p>
              ) : (
                <div className="space-y-0.5">
                  {playlists.map((pl) => {
                    const active =
                      activeFilter.kind === "playlist" &&
                      activeFilter.id === pl.id;
                    const dropKey = `playlist:${pl.id}`;
                    const isDragOver = dragOverKey === dropKey;

                    if (editingPlaylistId === pl.id) {
                      return (
                        <form
                          key={pl.id}
                          onSubmit={handlePlaylistEditSubmit}
                          className="my-1 rounded-md border border-[var(--accent)] bg-[var(--bg-surface)] p-1.5 flex items-center gap-1"
                        >
                          <input
                            type="text"
                            autoFocus
                            value={editingPlaylistName}
                            onChange={(e) =>
                              setEditingPlaylistName(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setEditingPlaylistId(null);
                            }}
                            className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)]"
                          />
                          <button
                            type="submit"
                            className="px-2 py-1 text-[11px] font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] cursor-pointer"
                          >
                            Save
                          </button>
                        </form>
                      );
                    }

                    return (
                      <div
                        key={pl.id}
                        onDragOver={(e) => {
                          if (hasDraggedAudioPayload(e.dataTransfer)) {
                            e.preventDefault();
                            setDragOverKey(dropKey);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverKey === dropKey) setDragOverKey(null);
                        }}
                        onDrop={(e) => {
                          const ids = extractDraggedAudioIds(e.dataTransfer);
                          if (ids.length > 0) {
                            e.preventDefault();
                            onDropTracksToPlaylist(ids, pl.id);
                          }
                          setDragOverKey(null);
                        }}
                        className={`group flex items-center justify-between gap-1 px-2 py-1.5 rounded-md text-xs transition-colors ${
                          isDragOver
                            ? "ring-1 ring-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]"
                            : active
                              ? "bg-[var(--bg-accent-subtle)] text-[var(--accent)] font-medium"
                              : "text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            selectAndClose({ kind: "playlist", id: pl.id })
                          }
                          className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                        >
                          <ListMusic className="w-3.5 h-3.5 shrink-0 text-[var(--text-secondary)]" />
                          <span className="truncate">{pl.name}</span>
                        </button>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPlaylistId(pl.id);
                              setEditingPlaylistName(pl.name);
                            }}
                            title="Rename playlist"
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-opacity"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeletePlaylist(pl.id);
                            }}
                            title="Delete playlist"
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--danger)] cursor-pointer transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <span className="font-mono tabular-nums text-[11px] text-[var(--text-muted)] w-4 text-right">
                            {pl.trackIds.length}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Saved Mix Presets */}
        <div>
          <button
            type="button"
            onClick={() => onToggleSection("presets")}
            className="w-full px-2 mb-1 flex items-center justify-between text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <span className="flex items-center gap-1">
              {collapsedSections.presets ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              <span>Mix Presets</span>
            </span>
            <span className="font-mono tabular-nums text-[10px] opacity-70">
              {mixPresets.length}
            </span>
          </button>

          {!collapsedSections.presets &&
            (mixPresets.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-[var(--text-muted)]">
                Save multi-track mixes from Mixer
              </p>
            ) : (
              <div className="space-y-0.5">
                {mixPresets.map((preset) => {
                  const isActive = activePresetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className={`group flex items-center justify-between gap-1 px-2 py-1.5 rounded-md text-xs transition-colors ${
                        isActive
                          ? "bg-[var(--bg-accent-subtle)] text-[var(--accent)] font-medium"
                          : "text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onLoadMixPreset(preset.id);
                          onCloseMobile();
                        }}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5 shrink-0 text-[var(--text-secondary)]" />
                        <span className="truncate">{preset.name}</span>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="font-mono tabular-nums text-[10px] text-[var(--text-muted)]">
                          {preset.slots.length}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteMixPreset(preset.id);
                          }}
                          title="Delete mix preset"
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--danger)] cursor-pointer transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>

        {/* Tags Section (Drag-and-Drop Enabled) */}
        <div>
          <div className="px-2 mb-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onToggleSection("tags")}
              className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {collapsedSections.tags ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              <span>Tags</span>
            </button>
            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={onClearTags}
                className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {!collapsedSections.tags &&
            (allTags.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-[var(--text-muted)]">
                Add tags via Edit Metadata
              </p>
            ) : (
              <div className="space-y-0.5">
                {allTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag.name);
                  const dropKey = `tag:${tag.name}`;
                  const isDragOver = dragOverKey === dropKey;

                  return (
                    <button
                      key={tag.name}
                      type="button"
                      onClick={() => onToggleTag(tag.name)}
                      onDragOver={(e) => {
                        if (hasDraggedAudioPayload(e.dataTransfer)) {
                          e.preventDefault();
                          setDragOverKey(dropKey);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverKey === dropKey) setDragOverKey(null);
                      }}
                      onDrop={(e) => {
                        const ids = extractDraggedAudioIds(e.dataTransfer);
                        if (ids.length > 0) {
                          e.preventDefault();
                          onDropTracksToTag(ids, tag.name);
                        }
                        setDragOverKey(null);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                        isDragOver
                          ? "ring-1 ring-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]"
                          : isSelected
                            ? "bg-[var(--bg-accent-subtle)] text-[var(--accent)] font-medium"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Tag className="w-3 h-3 shrink-0 opacity-75" />
                        <span className="truncate">{tag.name}</span>
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-[var(--text-muted)] shrink-0">
                        {tag.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
        </div>
      </div>

      {/* Offline Storage Summary & ZIP Backup Actions */}
      <div className="p-3 border-t border-[var(--border-subtle)] space-y-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            onCloseMobile();
            onOpenStorageManager();
          }}
          title="Inspect local audio storage or linked Android folders"
          className="w-full inline-flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-medium rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
        >
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <HardDrive className="w-3 h-3 shrink-0 text-[var(--accent)]" />
            <span className="truncate">Manage Audio</span>
          </span>
          <span className="font-mono tabular-nums text-[var(--text-secondary)] shrink-0">
            {tracks.length} · {formatFileSize(totalBytes)}
          </span>
        </button>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={isExportingBackup || isParsingBackup}
            onClick={onExportBackup}
            title="Export Audio ZIP backup (tracks, folders, playlists, mix presets)"
            className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-55 transition-colors cursor-pointer whitespace-nowrap truncate"
          >
            <Download className="w-3 h-3 shrink-0 text-[var(--accent)]" />
            <span className="truncate">
              {isExportingBackup ? "Exporting…" : "Export"}
            </span>
          </button>

          <button
            type="button"
            disabled={isExportingBackup || isParsingBackup}
            onClick={() => backupInputRef.current?.click()}
            title="Import a Kanso Audio .zip backup archive"
            className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-55 transition-colors cursor-pointer whitespace-nowrap truncate"
          >
            <Upload className="w-3 h-3 shrink-0 text-[var(--text-secondary)]" />
            <span className="truncate">
              {isParsingBackup ? "Reading…" : "Import"}
            </span>
          </button>
        </div>
      </div>

      {/* Desktop Drag-Resize Divider */}
      {isDesktop && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize audio sidebar width"
          title="Drag to resize sidebar · Double-click to reset"
          onPointerDown={handleStartResize}
          onDoubleClick={() => onSidebarWidthChange(DEFAULT_SIDEBAR_WIDTH)}
          className={`absolute top-0 right-[-3px] bottom-0 w-1.5 cursor-col-resize z-20 transition-colors ${
            isResizing
              ? "bg-[var(--accent)]/60"
              : "bg-transparent hover:bg-[var(--accent)]/35"
          }`}
        />
      )}
    </aside>
  );

  return (
    <>
      {!isCollapsedDesktop && (
        <div className="hidden lg:block h-full shrink-0">
          {sidebarContent(true)}
        </div>
      )}

      {isOpenMobile && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex bg-black/50 backdrop-blur-[1px] overscroll-none"
          onClick={onCloseMobile}
        >
          <div
            className="h-full bg-[var(--bg-sidebar)] pt-safe pb-safe flex overscroll-none"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent(false)}
          </div>
        </div>
      )}
    </>
  );
};
