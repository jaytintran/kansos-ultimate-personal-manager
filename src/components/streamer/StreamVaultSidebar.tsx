import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Hash,
  Layers,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Smile,
  Star,
  Tag,
  Trash2,
  Tv,
  X,
} from 'lucide-react';
import type { VaultPointerDropTarget } from '../../hooks/useVaultStreamDrag';
import { StreamFolder, StreamItem } from '../../types';
import { DynamicIcon } from '../IconLibrary';
import { IconPickerPopover } from '../IconPicker';

export type VaultScope =
  | { kind: 'all' }
  | { kind: 'in-grid' }
  | { kind: 'favorites' }
  | { kind: 'top-rated' }
  | { kind: 'channels' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'topic'; topic: string }
  | { kind: 'channel'; channel: string };

interface StreamVaultSidebarProps {
  streams: StreamItem[];
  folders: StreamFolder[];
  topicIcons?: Record<string, string>;
  topicOrder?: string[];
  activeIdSet: Set<string>;
  scope: VaultScope;
  selectedTags: string[];
  isMobileDrawer?: boolean;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  activePointerDropTarget?: VaultPointerDropTarget | null;
  onSelectScope: (scope: VaultScope) => void;
  onToggleTag: (tag: string) => void;
  onAddFolder: (name: string, parentId: string | null) => StreamFolder;
  onRenameFolder: (id: string, name: string) => void;
  onUpdateFolder?: (id: string, patch: Partial<StreamFolder>) => void;
  onReorderFolders?: (
    draggedId: string,
    targetId: string,
    position: 'before' | 'after' | 'inside',
  ) => void;
  onDeleteFolder: (id: string) => void;
  onSetTopicIcon?: (topic: string, icon: string | undefined) => void;
  onReorderTopics?: (orderedTopics: string[]) => void;
  onResetTopicOrder?: () => void;
  onLoadFolderToGrid: (folderId: string, folderName: string) => void;
  onLoadChannelToGrid: (channel: string) => void;
  onCloseMobile?: () => void;
}

export function compareStreamFolders(a: StreamFolder, b: StreamFolder): number {
  const ao =
    typeof a.sortOrder === 'number' && Number.isFinite(a.sortOrder)
      ? a.sortOrder
      : null;
  const bo =
    typeof b.sortOrder === 'number' && Number.isFinite(b.sortOrder)
      ? b.sortOrder
      : null;
  if (ao !== null && bo !== null && ao !== bo) return ao - bo;
  if (ao !== null && bo === null) return -1;
  if (ao === null && bo !== null) return 1;
  return a.name.localeCompare(b.name);
}

function wouldCreateFolderCycle(
  draggedId: string,
  candidateParentId: string | null | undefined,
  folderById: Map<string, StreamFolder>,
): boolean {
  if (!candidateParentId) return false;
  if (candidateParentId === draggedId) return true;
  const seen = new Set<string>();
  let cursor: string | null | undefined = candidateParentId;
  while (cursor && !seen.has(cursor)) {
    if (cursor === draggedId) return true;
    seen.add(cursor);
    cursor = folderById.get(cursor)?.parentId ?? null;
  }
  return false;
}

export function getDescendantFolderIds(folderId: string, folders: StreamFolder[]): Set<string> {
  const result = new Set<string>([folderId]);
  let added = true;
  while (added) {
    added = false;
    for (const f of folders) {
      if (f.parentId && result.has(f.parentId) && !result.has(f.id)) {
        result.add(f.id);
        added = true;
      }
    }
  }
  return result;
}

export const StreamVaultSidebar: React.FC<StreamVaultSidebarProps> = ({
  streams,
  folders,
  topicIcons = {},
  topicOrder = [],
  activeIdSet,
  scope,
  selectedTags,
  isMobileDrawer = false,
  scrollContainerRef,
  activePointerDropTarget,
  onSelectScope,
  onToggleTag,
  onAddFolder,
  onRenameFolder,
  onUpdateFolder,
  onReorderFolders,
  onDeleteFolder,
  onSetTopicIcon,
  onReorderTopics,
  onResetTopicOrder,
  onLoadFolderToGrid,
  onLoadChannelToGrid,
  onCloseMobile,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [creatingParentId, setCreatingParentId] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameIconOpen, setRenameIconOpen] = useState(false);
  const [iconPickerTarget, setIconPickerTarget] = useState<
    | { kind: 'folder'; folderId: string }
    | { kind: 'topic'; topic: string }
    | null
  >(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target:
      | { kind: 'folder'; folder: StreamFolder }
      | { kind: 'topic'; topicName: string };
  } | null>(null);
  const [sectionsOpen, setSectionsOpen] = useState({
    folders: true,
    topics: true,
    tags: true,
  });

  // Desktop-only drag-to-reorder state for Folders & Topics
  const dragFolderIdRef = useRef<string | null>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [folderDropTarget, setFolderDropTarget] = useState<{
    folderId: string;
    position: 'before' | 'after' | 'inside';
  } | null>(null);

  const dragTopicNameRef = useRef<string | null>(null);
  const [draggingTopicName, setDraggingTopicName] = useState<string | null>(null);
  const [topicDropTarget, setTopicDropTarget] = useState<{
    topicName: string;
    position: 'before' | 'after';
  } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('mousedown', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  // Total channels count for smart views
  const totalChannels = useMemo(() => {
    const set = new Set<string>();
    for (const s of streams) {
      const ch = s.channel.trim() || 'Unknown Channel';
      set.add(ch);
    }
    return streams.length === 0 ? 0 : set.size;
  }, [streams]);

  // Smart view counts
  const counts = useMemo(() => {
    let inGrid = 0;
    let favorites = 0;
    let topRated = 0;
    for (const s of streams) {
      if (activeIdSet.has(s.id)) inGrid++;
      if (s.favorite) favorites++;
      if ((s.rating ?? 0) >= 4) topRated++;
    }
    return { all: streams.length, inGrid, favorites, topRated };
  }, [streams, activeIdSet]);

  const folderById = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders],
  );

  // Folder children lookup & recursive item counts
  const folderChildrenMap = useMemo(() => {
    const map = new Map<string | null, StreamFolder[]>();
    const validIds = new Set(folders.map((f) => f.id));
    for (const f of folders) {
      const parentKey = f.parentId && validIds.has(f.parentId) ? f.parentId : null;
      const list = map.get(parentKey) || [];
      list.push(f);
      map.set(parentKey, list);
    }
    for (const list of map.values()) {
      list.sort(compareStreamFolders);
    }
    return map;
  }, [folders]);

  const folderStreamCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of folders) {
      const subtree = getDescendantFolderIds(f.id, folders);
      let count = 0;
      for (const s of streams) {
        if (s.folderIds?.some((fid) => subtree.has(fid))) count++;
      }
      map.set(f.id, count);
    }
    return map;
  }, [folders, streams]);

  // Topics / Themes derived from stream.category (respecting custom topicOrder when set)
  const topics = useMemo(() => {
    const countsMap = new Map<string, number>();
    for (const s of streams) {
      const cat = s.category.trim() || 'Uncategorized';
      countsMap.set(cat, (countsMap.get(cat) || 0) + 1);
    }
    const orderIndex = new Map<string, number>();
    topicOrder.forEach((raw, idx) => {
      const key = raw.trim().toLowerCase();
      if (key && !orderIndex.has(key)) orderIndex.set(key, idx);
    });

    return Array.from(countsMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (orderIndex.size > 0) {
          const ai = orderIndex.get(a.name.trim().toLowerCase());
          const bi = orderIndex.get(b.name.trim().toLowerCase());
          if (ai !== undefined && bi !== undefined) return ai - bi;
          if (ai !== undefined) return -1;
          if (bi !== undefined) return 1;
        }
        return b.count - a.count || a.name.localeCompare(b.name);
      });
  }, [streams, topicOrder]);

  const hasCustomTopicOrder = topicOrder.length > 0;

  const computeFolderDropPosition = (
    e: React.DragEvent<HTMLDivElement>,
    draggedId: string | null,
    targetFolder: StreamFolder,
  ): 'before' | 'after' | 'inside' | null => {
    if (!draggedId || draggedId === targetFolder.id) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const rawPos: 'before' | 'after' | 'inside' =
      relY < rect.height * 0.28
        ? 'before'
        : relY > rect.height * 0.72
          ? 'after'
          : 'inside';
    const candidateParentId =
      rawPos === 'inside' ? targetFolder.id : (targetFolder.parentId ?? null);
    if (wouldCreateFolderCycle(draggedId, candidateParentId, folderById)) {
      return null;
    }
    return rawPos;
  };

  // Multi-tags directory
  const allTags = useMemo(() => {
    const countsMap = new Map<string, number>();
    for (const s of streams) {
      for (const raw of s.tags) {
        const t = raw.trim().toLowerCase();
        if (t) countsMap.set(t, (countsMap.get(t) || 0) + 1);
      }
    }
    return Array.from(countsMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [streams]);

  const handleSelectAndClose = (nextScope: VaultScope) => {
    onSelectScope(nextScope);
    onCloseMobile?.();
  };

  const handleSubmitNewFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      setCreatingParentId(undefined);
      return;
    }
    const parent = creatingParentId ?? null;
    const created = onAddFolder(trimmed, parent);
    if (parent) {
      setExpandedFolders((prev) => ({ ...prev, [parent]: true }));
    }
    setNewFolderName('');
    setCreatingParentId(undefined);
    onSelectScope({ kind: 'folder', folderId: created.id });
  };

  const handleSubmitRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (renamingFolderId && renameValue.trim()) {
      onRenameFolder(renamingFolderId, renameValue.trim());
    }
    setRenamingFolderId(null);
    setRenameValue('');
    setRenameIconOpen(false);
  };

  const renderFolderNodes = (parentId: string | null, depth: number): React.ReactNode => {
    const children = folderChildrenMap.get(parentId) || [];
    return (
      <>
        {children.map((folder) => {
          const subFolders = folderChildrenMap.get(folder.id) || [];
          const hasChildren = subFolders.length > 0;
          const isExpanded = expandedFolders[folder.id] ?? depth === 0;
          const isSelected = scope.kind === 'folder' && scope.folderId === folder.id;
          const itemCount = folderStreamCounts.get(folder.id) || 0;
          const isRenaming = renamingFolderId === folder.id;
          const isIconPickerOpen =
            iconPickerTarget?.kind === 'folder' && iconPickerTarget.folderId === folder.id;
          const isFolderBeingDragged = draggingFolderId === folder.id;
          const isFolderOrderTarget = folderDropTarget?.folderId === folder.id;
          const folderDropPos = isFolderOrderTarget ? folderDropTarget?.position : null;
          const isStreamDropHover =
            activePointerDropTarget?.kind === 'sidebar-folder' &&
            activePointerDropTarget.id === folder.id;

          return (
            <div key={folder.id}>
              {isRenaming ? (
                <form
                  onSubmit={handleSubmitRename}
                  className="flex items-center gap-1 py-1 pr-1"
                  style={{ paddingLeft: `${8 + depth * 14}px` }}
                >
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setRenameIconOpen((v) => !v)}
                      title="Choose folder icon"
                      aria-label="Choose folder icon"
                      className="h-7 w-7 rounded-md border flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: renameIconOpen ? 'var(--accent)' : 'var(--border-subtle)',
                        color: folder.icon ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >
                      {folder.icon ? (
                        <DynamicIcon name={folder.icon} className="w-3.5 h-3.5" />
                      ) : (
                        <Folder className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <IconPickerPopover
                      open={renameIconOpen}
                      onClose={() => setRenameIconOpen(false)}
                      value={folder.icon}
                      onChange={(iconKey) => onUpdateFolder?.(folder.id, { icon: iconKey })}
                      onClear={() => onUpdateFolder?.(folder.id, { icon: undefined })}
                      allowClear
                      clearLabel="Default"
                      title="Folder Icon"
                    />
                  </div>
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                    className="flex-1 min-w-0 h-7 px-2 rounded-md border text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--accent)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="submit"
                    className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                    aria-label="Confirm folder rename"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingFolderId(null);
                      setRenameIconOpen(false);
                    }}
                    className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label="Cancel folder rename"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <div
                  data-vault-drop-kind="sidebar-folder"
                  data-vault-drop-id={folder.id}
                  data-vault-drop-label={folder.name}
                  draggable={!isMobileDrawer && Boolean(onReorderFolders)}
                  onDragStart={(e) => {
                    if (isMobileDrawer || !onReorderFolders) {
                      e.preventDefault();
                      return;
                    }
                    e.stopPropagation();
                    e.dataTransfer.setData('application/x-kanso-vault-folder-id', folder.id);
                    e.dataTransfer.effectAllowed = 'move';
                    dragFolderIdRef.current = folder.id;
                    setDraggingFolderId(folder.id);
                  }}
                  onDragEnd={() => {
                    dragFolderIdRef.current = null;
                    setDraggingFolderId(null);
                    setFolderDropTarget(null);
                  }}
                  onDragOver={(e) => {
                    if (
                      isMobileDrawer ||
                      !onReorderFolders ||
                      !e.dataTransfer.types.includes('application/x-kanso-vault-folder-id')
                    ) {
                      return;
                    }
                    const pos = computeFolderDropPosition(e, dragFolderIdRef.current, folder);
                    if (!pos) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    setFolderDropTarget((prev) =>
                      prev?.folderId === folder.id && prev.position === pos
                        ? prev
                        : { folderId: folder.id, position: pos },
                    );
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setFolderDropTarget((prev) =>
                        prev?.folderId === folder.id ? null : prev,
                      );
                    }
                  }}
                  onDrop={(e) => {
                    if (
                      isMobileDrawer ||
                      !onReorderFolders ||
                      !e.dataTransfer.types.includes('application/x-kanso-vault-folder-id')
                    ) {
                      return;
                    }
                    const draggedId =
                      e.dataTransfer.getData('application/x-kanso-vault-folder-id') ||
                      dragFolderIdRef.current;
                    const pos = computeFolderDropPosition(e, draggedId, folder);
                    dragFolderIdRef.current = null;
                    setDraggingFolderId(null);
                    setFolderDropTarget(null);
                    if (!draggedId || !pos) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (pos === 'inside') {
                      setExpandedFolders((prev) => ({ ...prev, [folder.id]: true }));
                    }
                    onReorderFolders(draggedId, folder.id, pos);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      target: { kind: 'folder', folder },
                    });
                  }}
                  className={`relative group flex items-center gap-1 rounded-lg transition-colors pr-1 ${
                    isFolderBeingDragged ? 'opacity-45' : ''
                  } ${
                    isStreamDropHover || folderDropPos === 'inside'
                      ? 'ring-1 ring-[var(--accent)]'
                      : ''
                  }`}
                  style={{
                    paddingLeft: `${4 + depth * 14}px`,
                    backgroundColor:
                      isStreamDropHover || folderDropPos === 'inside'
                        ? 'var(--accent-soft)'
                        : isSelected
                          ? 'var(--accent-soft)'
                          : 'transparent',
                    color:
                      isStreamDropHover || folderDropPos === 'inside' || isSelected
                        ? 'var(--accent)'
                        : 'var(--text-secondary)',
                    boxShadow:
                      folderDropPos === 'before'
                        ? 'inset 0 2px 0 var(--accent)'
                        : folderDropPos === 'after'
                          ? 'inset 0 -2px 0 var(--accent)'
                          : undefined,
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      hasChildren
                        ? setExpandedFolders((prev) => ({
                            ...prev,
                            [folder.id]: !isExpanded,
                          }))
                        : handleSelectAndClose({ kind: 'folder', folderId: folder.id })
                    }
                    className="h-7 w-5 flex items-center justify-center shrink-0 opacity-70 hover:opacity-100"
                    aria-label={hasChildren ? 'Toggle subfolder' : 'Open folder'}
                  >
                    {hasChildren ? (
                      isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )
                    ) : (
                      <span className="w-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectAndClose({ kind: 'folder', folderId: folder.id })}
                    className="flex-1 min-w-0 h-8 flex items-center gap-2 text-left text-xs font-medium"
                  >
                    {folder.icon ? (
                      <DynamicIcon name={folder.icon} className="w-3.5 h-3.5 shrink-0" />
                    ) : isSelected || (hasChildren && isExpanded) ? (
                      <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Folder className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="truncate">{folder.name}</span>
                  </button>

                  <span
                    className="lg:group-hover:hidden text-[11px] font-mono tabular-nums px-1 shrink-0"
                    style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}
                  >
                    {itemCount}
                  </span>

                  {/* Single three-dots trigger opening the folder context menu */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setContextMenu({
                        x: rect.left,
                        y: rect.bottom + 4,
                        target: { kind: 'folder', folder },
                      });
                    }}
                    className="flex lg:hidden lg:group-hover:flex focus:flex h-6 w-6 rounded items-center justify-center shrink-0 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                    title={`Actions for ${folder.name}`}
                    aria-label={`More actions for ${folder.name}`}
                    aria-haspopup="menu"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  <IconPickerPopover
                    open={isIconPickerOpen}
                    onClose={() => setIconPickerTarget(null)}
                    value={folder.icon}
                    onChange={(iconKey) => onUpdateFolder?.(folder.id, { icon: iconKey })}
                    onClear={() => onUpdateFolder?.(folder.id, { icon: undefined })}
                    allowClear
                    clearLabel="Default"
                    title={`Icon · ${folder.name}`}
                  />
                </div>
              )}

              {/* Nested create input */}
              {creatingParentId === folder.id && (
                <form
                  onSubmit={handleSubmitNewFolder}
                  className="flex items-center gap-1 py-1 pr-1"
                  style={{ paddingLeft: `${22 + depth * 14}px` }}
                >
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Subfolder name..."
                    autoFocus
                    className="flex-1 min-w-0 h-7 px-2 rounded-md border text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--accent)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="submit"
                    className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                    aria-label="Create subfolder"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingParentId(undefined);
                      setNewFolderName('');
                    }}
                    className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label="Cancel subfolder"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}

              {hasChildren && isExpanded && renderFolderNodes(folder.id, depth + 1)}
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {/* Smart Views */}
        <div className="space-y-0.5">
          {[
            { id: 'all' as const, label: 'All Saved', icon: Layers, count: counts.all },
            { id: 'in-grid' as const, label: 'In Live Grid', icon: Radio, count: counts.inGrid },
            { id: 'favorites' as const, label: 'Favorites', icon: Star, count: counts.favorites },
            { id: 'top-rated' as const, label: 'Top Rated (4+)', icon: Star, count: counts.topRated },
            { id: 'channels' as const, label: 'Channels', icon: Tv, count: totalChannels },
          ].map((item) => {
            const Icon = item.icon;
            const active = scope.kind === item.id;
            const isFavDropOver =
              item.id === 'favorites' &&
              activePointerDropTarget?.kind === 'sidebar-favorites';
            return (
              <button
                key={item.id}
                type="button"
                data-vault-drop-kind={item.id === 'favorites' ? 'sidebar-favorites' : undefined}
                data-vault-drop-label={item.id === 'favorites' ? 'Favorites' : undefined}
                onClick={() => handleSelectAndClose({ kind: item.id })}
                className={`w-full h-8 px-2.5 rounded-lg flex items-center justify-between gap-2 text-xs font-medium transition-colors ${
                  isFavDropOver ? 'ring-1 ring-[var(--accent)]' : ''
                }`}
                style={{
                  backgroundColor:
                    isFavDropOver || active ? 'var(--accent-soft)' : 'transparent',
                  color:
                    isFavDropOver || active ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <span className="inline-flex items-center gap-2 min-w-0 truncate">
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      item.id === 'favorites' && active ? 'fill-current' : ''
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <span
                  className="text-[11px] font-mono tabular-nums shrink-0"
                  style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Nested Folders & Listening Stacks */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1.5">
            <button
              type="button"
              onClick={() => setSectionsOpen((s) => ({ ...s, folders: !s.folders }))}
              className="flex items-center gap-1 text-[11px] font-semibold tracking-tight"
              style={{ color: 'var(--text-muted)' }}
            >
              {sectionsOpen.folders ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <span>Folders & Stacks</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSectionsOpen((s) => ({ ...s, folders: true }));
                setCreatingParentId(null);
                setNewFolderName('');
              }}
              className="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="New folder"
              aria-label="Create new folder"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {sectionsOpen.folders && (
            <div className="space-y-0.5">
              {creatingParentId === null && (
                <form onSubmit={handleSubmitNewFolder} className="flex items-center gap-1 px-1.5 py-1">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="New folder or stack..."
                    autoFocus
                    className="flex-1 min-w-0 h-7 px-2 rounded-md border text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--accent)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="submit"
                    className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                    aria-label="Create folder"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingParentId(undefined);
                      setNewFolderName('');
                    }}
                    className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label="Cancel new folder"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}

              {folders.length === 0 && creatingParentId === undefined ? (
                <p className="text-[11px] px-2.5 py-1.5" style={{ color: 'var(--text-muted)' }}>
                  No folders yet. Create stacks for morning, sleep, or topic playlists.
                </p>
              ) : (
                renderFolderNodes(null, 0)
              )}
            </div>
          )}
        </div>

        {/* Topics & Themes */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1.5">
            <button
              type="button"
              onClick={() => setSectionsOpen((s) => ({ ...s, topics: !s.topics }))}
              className="flex items-center gap-1 text-[11px] font-semibold tracking-tight cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              {sectionsOpen.topics ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <span>Topics & Themes</span>
            </button>
            <div className="flex items-center gap-1.5 shrink-0">
              {hasCustomTopicOrder && onResetTopicOrder && (
                <button
                  type="button"
                  onClick={onResetTopicOrder}
                  title="Reset topics to count order"
                  aria-label="Reset topics to count order"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Reset</span>
                </button>
              )}
              <span
                className="text-[11px] font-mono tabular-nums"
                style={{ color: 'var(--text-muted)' }}
              >
                {topics.length}
              </span>
            </div>
          </div>

          {sectionsOpen.topics && (
            <div className="space-y-0.5">
              {topics.map((t) => {
                const active = scope.kind === 'topic' && scope.topic === t.name;
                const isTopicDropOver =
                  activePointerDropTarget?.kind === 'sidebar-topic' &&
                  activePointerDropTarget.id === t.name;
                const topicKey = t.name.trim().toLowerCase();
                const customIcon = topicIcons[topicKey];
                const isTopicPickerOpen =
                  iconPickerTarget?.kind === 'topic' && iconPickerTarget.topic === t.name;
                const isTopicBeingDragged = draggingTopicName === t.name;
                const isTopicOrderTarget = topicDropTarget?.topicName === t.name;
                const topicDropPos = isTopicOrderTarget ? topicDropTarget?.position : null;

                return (
                  <div
                    key={t.name}
                    data-vault-drop-kind="sidebar-topic"
                    data-vault-drop-id={t.name}
                    data-vault-drop-label={t.name}
                    draggable={!isMobileDrawer && Boolean(onReorderTopics)}
                    onDragStart={(e) => {
                      if (isMobileDrawer || !onReorderTopics) {
                        e.preventDefault();
                        return;
                      }
                      e.stopPropagation();
                      e.dataTransfer.setData('application/x-kanso-vault-topic', t.name);
                      e.dataTransfer.effectAllowed = 'move';
                      dragTopicNameRef.current = t.name;
                      setDraggingTopicName(t.name);
                    }}
                    onDragEnd={() => {
                      dragTopicNameRef.current = null;
                      setDraggingTopicName(null);
                      setTopicDropTarget(null);
                    }}
                    onDragOver={(e) => {
                      if (
                        isMobileDrawer ||
                        !onReorderTopics ||
                        !e.dataTransfer.types.includes('application/x-kanso-vault-topic')
                      ) {
                        return;
                      }
                      const draggedName = dragTopicNameRef.current;
                      if (!draggedName || draggedName === t.name) return;
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos: 'before' | 'after' =
                        e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                      setTopicDropTarget((prev) =>
                        prev?.topicName === t.name && prev.position === pos
                          ? prev
                          : { topicName: t.name, position: pos },
                      );
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setTopicDropTarget((prev) =>
                          prev?.topicName === t.name ? null : prev,
                        );
                      }
                    }}
                    onDrop={(e) => {
                      if (
                        isMobileDrawer ||
                        !onReorderTopics ||
                        !e.dataTransfer.types.includes('application/x-kanso-vault-topic')
                      ) {
                        return;
                      }
                      const draggedName =
                        e.dataTransfer.getData('application/x-kanso-vault-topic') ||
                        dragTopicNameRef.current;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos: 'before' | 'after' =
                        e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                      dragTopicNameRef.current = null;
                      setDraggingTopicName(null);
                      setTopicDropTarget(null);
                      if (!draggedName || draggedName === t.name) return;
                      e.preventDefault();
                      e.stopPropagation();

                      const orderedNames = topics.map((item) => item.name);
                      const remaining = orderedNames.filter((n) => n !== draggedName);
                      const targetIdx = remaining.indexOf(t.name);
                      if (targetIdx === -1) return;
                      const insertIdx = pos === 'before' ? targetIdx : targetIdx + 1;
                      const nextOrder = [
                        ...remaining.slice(0, insertIdx),
                        draggedName,
                        ...remaining.slice(insertIdx),
                      ];
                      onReorderTopics(nextOrder);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        target: { kind: 'topic', topicName: t.name },
                      });
                    }}
                    className={`relative group flex items-center justify-between gap-1 rounded-lg px-2.5 transition-colors ${
                      isTopicBeingDragged ? 'opacity-45' : ''
                    } ${isTopicDropOver ? 'ring-1 ring-[var(--accent)]' : ''}`}
                    style={{
                      backgroundColor:
                        isTopicDropOver || active ? 'var(--accent-soft)' : 'transparent',
                      color:
                        isTopicDropOver || active
                          ? 'var(--accent)'
                          : 'var(--text-secondary)',
                      boxShadow:
                        topicDropPos === 'before'
                          ? 'inset 0 2px 0 var(--accent)'
                          : topicDropPos === 'after'
                            ? 'inset 0 -2px 0 var(--accent)'
                            : undefined,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectAndClose({ kind: 'topic', topic: t.name })}
                      className="flex-1 min-w-0 h-8 flex items-center gap-2 text-left text-xs font-medium cursor-pointer"
                    >
                      {customIcon ? (
                        <DynamicIcon name={customIcon} className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <Tag className="w-3.5 h-3.5 shrink-0 opacity-75" />
                      )}
                      <span className="truncate">{t.name}</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIconPickerTarget(
                          isTopicPickerOpen ? null : { kind: 'topic', topic: t.name }
                        );
                      }}
                      title={`Change icon for ${t.name}`}
                      aria-label={`Change icon for ${t.name}`}
                      className="hidden group-hover:flex focus:flex h-6 w-6 rounded items-center justify-center shrink-0 hover:bg-[var(--bg-surface-hover)]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>

                    <span
                      className="group-hover:hidden text-[11px] font-mono tabular-nums shrink-0"
                      style={{
                        color:
                          isTopicDropOver || active ? 'var(--accent)' : 'var(--text-muted)',
                      }}
                    >
                      {t.count}
                    </span>

                    <IconPickerPopover
                      open={isTopicPickerOpen}
                      onClose={() => setIconPickerTarget(null)}
                      value={customIcon}
                      onChange={(iconKey) => onSetTopicIcon?.(t.name, iconKey)}
                      onClear={() => onSetTopicIcon?.(t.name, undefined)}
                      allowClear
                      clearLabel="Default"
                      title={`Topic Icon · ${t.name}`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Multi-Tags Filter */}
        {allTags.length > 0 && (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setSectionsOpen((s) => ({ ...s, tags: !s.tags }))}
              className="w-full flex items-center justify-between px-1.5 text-[11px] font-semibold tracking-tight"
              style={{ color: 'var(--text-muted)' }}
            >
              <span className="inline-flex items-center gap-1">
                {sectionsOpen.tags ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                <span>Tags</span>
              </span>
              <span className="font-mono tabular-nums">{allTags.length}</span>
            </button>

            {sectionsOpen.tags && (
              <div className="flex flex-wrap gap-1 px-1">
                {allTags.map((tag) => {
                  const active = selectedTags.includes(tag.name);
                  return (
                    <button
                      key={tag.name}
                      type="button"
                      onClick={() => onToggleTag(tag.name)}
                      className="h-6 px-2 rounded-md border text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                        borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >
                      <Hash className="w-2.5 h-2.5 opacity-70" />
                      <span>{tag.name}</span>
                      <span className="font-mono tabular-nums opacity-65">{tag.count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vault Sidebar Context Menu (Folders & Topics) */}
      {contextMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              top: `${Math.min(contextMenu.y, window.innerHeight - 240)}px`,
              left: `${Math.min(contextMenu.x, window.innerWidth - 196)}px`,
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-strong)',
              boxShadow: 'var(--shadow-popover)',
            }}
            className="fixed z-[95] w-48 rounded-xl border p-1.5 space-y-0.5"
            role="menu"
          >
            {contextMenu.target.kind === 'folder' ? (
              <>
                {(folderStreamCounts.get(contextMenu.target.folder.id) || 0) > 0 && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        if (contextMenu.target.kind === 'folder') {
                          onLoadFolderToGrid(
                            contextMenu.target.folder.id,
                            contextMenu.target.folder.name
                          );
                        }
                        setContextMenu(null);
                      }}
                      className="w-full h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-2 hover:bg-[var(--bg-surface-hover)] text-left"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" style={{ color: 'var(--accent)' }} />
                      <span>Load Folder</span>
                    </button>
                    <div className="my-1 border-t" style={{ borderColor: 'var(--border-subtle)' }} />
                  </>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const folderId = contextMenu.target.kind === 'folder' ? contextMenu.target.folder.id : '';
                    setContextMenu(null);
                    setIconPickerTarget({ kind: 'folder', folderId });
                  }}
                  className="w-full h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-2 hover:bg-[var(--bg-surface-hover)] text-left"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Smile className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  <span>Change Icon...</span>
                </button>
                {contextMenu.target.folder.icon && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      if (contextMenu.target.kind === 'folder') {
                        onUpdateFolder?.(contextMenu.target.folder.id, { icon: undefined });
                      }
                      setContextMenu(null);
                    }}
                    className="w-full h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-2 hover:bg-[var(--bg-surface-hover)] text-left"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset to Default Icon</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (contextMenu.target.kind === 'folder') {
                      setRenamingFolderId(contextMenu.target.folder.id);
                      setRenameValue(contextMenu.target.folder.name);
                      setRenameIconOpen(false);
                    }
                    setContextMenu(null);
                  }}
                  className="w-full h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-2 hover:bg-[var(--bg-surface-hover)] text-left"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Rename Folder</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (contextMenu.target.kind === 'folder') {
                      const fid = contextMenu.target.folder.id;
                      setExpandedFolders((prev) => ({ ...prev, [fid]: true }));
                      setCreatingParentId(fid);
                      setNewFolderName('');
                    }
                    setContextMenu(null);
                  }}
                  className="w-full h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-2 hover:bg-[var(--bg-surface-hover)] text-left"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>New Subfolder</span>
                </button>
                <div className="my-1 border-t" style={{ borderColor: 'var(--border-subtle)' }} />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (contextMenu.target.kind === 'folder') {
                      const fid = contextMenu.target.folder.id;
                      onDeleteFolder(fid);
                      if (scope.kind === 'folder' && scope.folderId === fid) {
                        onSelectScope({ kind: 'all' });
                      }
                    }
                    setContextMenu(null);
                  }}
                  className="w-full h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-2 hover:bg-[var(--bg-surface-hover)] text-left"
                  style={{ color: 'var(--danger)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Folder</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const topicName = contextMenu.target.kind === 'topic' ? contextMenu.target.topicName : '';
                    setContextMenu(null);
                    setIconPickerTarget({ kind: 'topic', topic: topicName });
                  }}
                  className="w-full h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-2 hover:bg-[var(--bg-surface-hover)] text-left"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Smile className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  <span>Change Icon...</span>
                </button>
                {topicIcons[contextMenu.target.topicName.trim().toLowerCase()] && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      if (contextMenu.target.kind === 'topic') {
                        onSetTopicIcon?.(contextMenu.target.topicName, undefined);
                      }
                      setContextMenu(null);
                    }}
                    className="w-full h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-2 hover:bg-[var(--bg-surface-hover)] text-left"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset to Default Icon</span>
                  </button>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};
