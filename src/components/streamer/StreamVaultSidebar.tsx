import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Hash,
  Layers,
  Pencil,
  Play,
  Plus,
  Radio,
  Search,
  Star,
  Tag,
  Trash2,
  Tv,
  X,
} from 'lucide-react';
import { StreamFolder, StreamItem } from '../../types';

export type VaultScope =
  | { kind: 'all' }
  | { kind: 'in-grid' }
  | { kind: 'favorites' }
  | { kind: 'top-rated' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'topic'; topic: string }
  | { kind: 'channel'; channel: string };

interface StreamVaultSidebarProps {
  streams: StreamItem[];
  folders: StreamFolder[];
  activeIdSet: Set<string>;
  scope: VaultScope;
  selectedTags: string[];
  onSelectScope: (scope: VaultScope) => void;
  onToggleTag: (tag: string) => void;
  onAddFolder: (name: string, parentId: string | null) => StreamFolder;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onLoadFolderToGrid: (folderId: string, folderName: string) => void;
  onLoadChannelToGrid: (channel: string) => void;
  onCloseMobile?: () => void;
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
  activeIdSet,
  scope,
  selectedTags,
  onSelectScope,
  onToggleTag,
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  onLoadFolderToGrid,
  onLoadChannelToGrid,
  onCloseMobile,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [creatingParentId, setCreatingParentId] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [channelSearch, setChannelSearch] = useState('');
  const [sectionsOpen, setSectionsOpen] = useState({
    folders: true,
    topics: true,
    channels: true,
    tags: true,
  });

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
      list.sort((a, b) => a.name.localeCompare(b.name));
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

  // Topics / Themes derived from stream.category
  const topics = useMemo(() => {
    const countsMap = new Map<string, number>();
    for (const s of streams) {
      const cat = s.category.trim() || 'Uncategorized';
      countsMap.set(cat, (countsMap.get(cat) || 0) + 1);
    }
    return Array.from(countsMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [streams]);

  // Channels directory derived from stream.channel
  const channels = useMemo(() => {
    const countsMap = new Map<string, number>();
    for (const s of streams) {
      const ch = s.channel.trim() || 'Unknown Channel';
      countsMap.set(ch, (countsMap.get(ch) || 0) + 1);
    }
    const q = channelSearch.trim().toLowerCase();
    return Array.from(countsMap.entries())
      .map(([name, count]) => ({ name, count }))
      .filter((item) => (!q ? true : item.name.toLowerCase().includes(q)))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [streams, channelSearch]);

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

          return (
            <div key={folder.id}>
              {isRenaming ? (
                <form
                  onSubmit={handleSubmitRename}
                  className="flex items-center gap-1 py-1 pr-1"
                  style={{ paddingLeft: `${8 + depth * 14}px` }}
                >
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
                    onClick={() => setRenamingFolderId(null)}
                    className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label="Cancel folder rename"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <div
                  className="group flex items-center gap-1 rounded-lg transition-colors pr-1"
                  style={{
                    paddingLeft: `${4 + depth * 14}px`,
                    backgroundColor: isSelected ? 'var(--accent-soft)' : 'transparent',
                    color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
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
                    {isSelected || (hasChildren && isExpanded) ? (
                      <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Folder className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="truncate">{folder.name}</span>
                  </button>

                  {/* Hover actions: Load stack, Add subfolder, Rename, Delete */}
                  <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    {itemCount > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLoadFolderToGrid(folder.id, folder.name);
                        }}
                        className="h-6 w-6 rounded flex items-center justify-center hover:opacity-100"
                        style={{ color: 'var(--accent)' }}
                        title={`Load "${folder.name}" to Live Grid`}
                        aria-label={`Load ${folder.name} to Live Grid`}
                      >
                        <Play className="w-3 h-3 fill-current" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedFolders((prev) => ({ ...prev, [folder.id]: true }));
                        setCreatingParentId(folder.id);
                        setNewFolderName('');
                      }}
                      className="h-6 w-6 rounded flex items-center justify-center"
                      style={{ color: 'var(--text-muted)' }}
                      title="New subfolder"
                      aria-label={`New subfolder inside ${folder.name}`}
                    >
                      <FolderPlus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingFolderId(folder.id);
                        setRenameValue(folder.name);
                      }}
                      className="h-6 w-6 rounded flex items-center justify-center"
                      style={{ color: 'var(--text-muted)' }}
                      title="Rename folder"
                      aria-label={`Rename ${folder.name}`}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFolder(folder.id);
                        if (isSelected) onSelectScope({ kind: 'all' });
                      }}
                      className="h-6 w-6 rounded flex items-center justify-center"
                      style={{ color: 'var(--danger)' }}
                      title="Delete folder"
                      aria-label={`Delete ${folder.name}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  <span
                    className="group-hover:hidden text-[11px] font-mono tabular-nums px-1.5 shrink-0"
                    style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}
                  >
                    {itemCount}
                  </span>
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
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {/* Smart Views */}
        <div className="space-y-0.5">
          {[
            { id: 'all' as const, label: 'All Saved', icon: Layers, count: counts.all },
            { id: 'in-grid' as const, label: 'In Live Grid', icon: Radio, count: counts.inGrid },
            { id: 'favorites' as const, label: 'Favorites', icon: Star, count: counts.favorites },
            { id: 'top-rated' as const, label: 'Top Rated (4+)', icon: Star, count: counts.topRated },
          ].map((item) => {
            const Icon = item.icon;
            const active = scope.kind === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectAndClose({ kind: item.id })}
                className="w-full h-8 px-2.5 rounded-lg flex items-center justify-between gap-2 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
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
          <button
            type="button"
            onClick={() => setSectionsOpen((s) => ({ ...s, topics: !s.topics }))}
            className="w-full flex items-center justify-between px-1.5 text-[11px] font-semibold tracking-tight"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="inline-flex items-center gap-1">
              {sectionsOpen.topics ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <span>Topics & Themes</span>
            </span>
            <span className="font-mono tabular-nums">{topics.length}</span>
          </button>

          {sectionsOpen.topics && (
            <div className="space-y-0.5">
              {topics.map((t) => {
                const active = scope.kind === 'topic' && scope.topic === t.name;
                return (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => handleSelectAndClose({ kind: 'topic', topic: t.name })}
                    className="w-full h-8 px-2.5 rounded-lg flex items-center justify-between gap-2 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0 truncate">
                      <Tag className="w-3.5 h-3.5 shrink-0 opacity-75" />
                      <span className="truncate">{t.name}</span>
                    </span>
                    <span
                      className="text-[11px] font-mono tabular-nums shrink-0"
                      style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
                    >
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Channels Directory */}
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setSectionsOpen((s) => ({ ...s, channels: !s.channels }))}
            className="w-full flex items-center justify-between px-1.5 text-[11px] font-semibold tracking-tight"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="inline-flex items-center gap-1">
              {sectionsOpen.channels ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <span>Channels</span>
            </span>
            <span className="font-mono tabular-nums">{channels.length}</span>
          </button>

          {sectionsOpen.channels && (
            <div className="space-y-1">
              {streams.length >= 6 && (
                <div className="relative px-1">
                  <Search
                    className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <input
                    type="text"
                    value={channelSearch}
                    onChange={(e) => setChannelSearch(e.target.value)}
                    placeholder="Filter channels..."
                    className="w-full h-7 pl-7 pr-2 rounded-md border text-[11px] outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              )}

              <div className="space-y-0.5">
                {channels.map((ch) => {
                  const active = scope.kind === 'channel' && scope.channel === ch.name;
                  return (
                    <div
                      key={ch.name}
                      className="group flex items-center gap-1 rounded-lg pr-1 transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectAndClose({ kind: 'channel', channel: ch.name })}
                        className="flex-1 min-w-0 h-8 px-2.5 flex items-center gap-2 text-left text-xs font-medium"
                      >
                        <Tv className="w-3.5 h-3.5 shrink-0 opacity-75" />
                        <span className="truncate">{ch.name}</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLoadChannelToGrid(ch.name);
                        }}
                        className="hidden group-hover:flex h-6 w-6 rounded items-center justify-center shrink-0"
                        style={{ color: 'var(--accent)' }}
                        title={`Load all streams from ${ch.name} to Live Grid`}
                        aria-label={`Load ${ch.name} streams to Live Grid`}
                      >
                        <Play className="w-3 h-3 fill-current" />
                      </button>

                      <span
                        className="group-hover:hidden text-[11px] font-mono tabular-nums px-1.5 shrink-0"
                        style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
                      >
                        {ch.count}
                      </span>
                    </div>
                  );
                })}
              </div>
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
    </div>
  );
};
