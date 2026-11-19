import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Folder,
  Headphones,
  LayoutGrid,
  List,
  Menu,
  MonitorPlay,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { StreamFolder, StreamItem } from '../../types';
import { StreamEditorDrawer } from './StreamEditorDrawer';
import {
  getDescendantFolderIds,
  StreamVaultSidebar,
  VaultScope,
} from './StreamVaultSidebar';

type VaultViewMode = 'grid' | 'table';
type VaultSortMode = 'recent' | 'listens' | 'rating' | 'title' | 'channel';

interface StreamVaultViewProps {
  isActiveView?: boolean;
  streams: StreamItem[];
  folders: StreamFolder[];
  activeStreams: StreamItem[];
  activeIdSet: Set<string>;
  playingCount: number;
  isAllPaused: boolean;
  allActiveMuted: boolean;
  onTogglePauseAll: () => void;
  onToggleViewMute: () => void;
  onBackToGrid: () => void;
  onAddStream: (stream: Omit<StreamItem, 'id' | 'addedAt'>, addToGrid: boolean) => void;
  onUpdateStream: (id: string, patch: Partial<StreamItem>) => void;
  onDeleteStream: (id: string) => void;
  onToggleStreamInGrid: (id: string) => void;
  onLoadStreamsToGrid: (streamIds: string[], mode?: 'replace' | 'append', label?: string) => void;
  onIncrementListen: (id: string) => void;
  onAddFolder: (name: string, parentId?: string | null) => StreamFolder;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onNotify: (text: string, tone?: 'neutral' | 'success' | 'error') => void;
}

export const StreamVaultView: React.FC<StreamVaultViewProps> = ({
  isActiveView = true,
  streams,
  folders,
  activeStreams,
  activeIdSet,
  playingCount,
  isAllPaused,
  allActiveMuted,
  onTogglePauseAll,
  onToggleViewMute,
  onBackToGrid,
  onAddStream,
  onUpdateStream,
  onDeleteStream,
  onToggleStreamInGrid,
  onLoadStreamsToGrid,
  onIncrementListen,
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  onNotify,
}) => {
  const [scope, setScope] = useState<VaultScope>({ kind: 'all' });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<VaultViewMode>('grid');
  const [sortBy, setSortBy] = useState<VaultSortMode>('recent');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  // Editor drawer state
  const [drawerState, setDrawerState] = useState<
    { open: false } | { open: true; mode: 'create' } | { open: true; mode: 'edit'; streamId: string }
  >({ open: false });

  const folderById = useMemo(() => {
    const map = new Map<string, StreamFolder>();
    for (const f of folders) map.set(f.id, f);
    return map;
  }, [folders]);

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Resolve current scope header info
  const scopeMeta = useMemo(() => {
    switch (scope.kind) {
      case 'all':
        return {
          breadcrumb: 'Vault / All Saved',
          title: 'All Saved Streams',
          description: 'Browse, organize, and launch subliminals, frequencies, and ambient stacks.',
          canBatchLoad: true,
        };
      case 'in-grid':
        return {
          breadcrumb: 'Vault / In Live Grid',
          title: 'Currently In Live Grid',
          description: 'Streams active in your live multi-stream grid right now.',
          canBatchLoad: false,
        };
      case 'favorites':
        return {
          breadcrumb: 'Vault / Favorites',
          title: 'Favorites',
          description: 'Starred subliminals and frequencies ready for quick recall.',
          canBatchLoad: true,
        };
      case 'top-rated':
        return {
          breadcrumb: 'Vault / Top Rated',
          title: 'Top Rated (4–5 Stars)',
          description: 'Your highest-rated streams by personal effectiveness.',
          canBatchLoad: true,
        };
      case 'folder': {
        const folder = folderById.get(scope.folderId);
        const chain: string[] = [];
        let cursor = folder;
        let safety = 0;
        while (cursor && safety < 8) {
          chain.unshift(cursor.name);
          cursor = cursor.parentId ? folderById.get(cursor.parentId) : undefined;
          safety++;
        }
        return {
          breadcrumb: `Vault / Folders / ${chain.join(' / ') || 'Folder'}`,
          title: folder?.name || 'Folder',
          description: folder?.description || 'Listening stack & folder collection.',
          canBatchLoad: true,
        };
      }
      case 'topic':
        return {
          breadcrumb: `Vault / Topics / ${scope.topic}`,
          title: scope.topic,
          description: `All saved streams grouped under the ${scope.topic} theme.`,
          canBatchLoad: true,
        };
      case 'channel':
        return {
          breadcrumb: `Vault / Channels / ${scope.channel}`,
          title: scope.channel,
          description: `Saved catalog from creator ${scope.channel}.`,
          canBatchLoad: true,
        };
    }
  }, [scope, folderById]);

  // Filter + sort visible streams
  const visibleStreams = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const folderSubtree =
      scope.kind === 'folder' ? getDescendantFolderIds(scope.folderId, folders) : null;

    const filtered = streams.filter((s) => {
      if (scope.kind === 'in-grid' && !activeIdSet.has(s.id)) return false;
      if (scope.kind === 'favorites' && !s.favorite) return false;
      if (scope.kind === 'top-rated' && (s.rating ?? 0) < 4) return false;
      if (scope.kind === 'folder' && folderSubtree) {
        if (!s.folderIds?.some((fid) => folderSubtree.has(fid))) return false;
      }
      if (scope.kind === 'topic') {
        const cat = s.category.trim() || 'Uncategorized';
        if (cat !== scope.topic) return false;
      }
      if (scope.kind === 'channel') {
        const ch = s.channel.trim() || 'Unknown Channel';
        if (ch !== scope.channel) return false;
      }

      if (selectedTags.length > 0) {
        const streamTags = new Set(s.tags.map((t) => t.trim().toLowerCase()));
        for (const req of selectedTags) {
          if (!streamTags.has(req)) return false;
        }
      }

      if (q) {
        const haystack = [
          s.title,
          s.customLabel,
          s.channel,
          s.category,
          s.affirmations || '',
          s.notes || '',
          ...s.tags,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'listens':
          return (b.listenCount ?? 0) - (a.listenCount ?? 0) || b.addedAt.localeCompare(a.addedAt);
        case 'rating':
          return (b.rating ?? 0) - (a.rating ?? 0) || (b.listenCount ?? 0) - (a.listenCount ?? 0);
        case 'title':
          return (a.customLabel || a.title).localeCompare(b.customLabel || b.title);
        case 'channel':
          return (a.channel || 'zzz').localeCompare(b.channel || 'zzz');
        case 'recent':
        default:
          return b.addedAt.localeCompare(a.addedAt);
      }
    });
    return sorted;
  }, [streams, scope, folders, activeIdSet, selectedTags, searchQuery, sortBy]);

  const handleLoadFolderToGrid = (folderId: string, folderName: string) => {
    const subtree = getDescendantFolderIds(folderId, folders);
    const ids = streams
      .filter((s) => s.folderIds?.some((fid) => subtree.has(fid)))
      .map((s) => s.id);
    onLoadStreamsToGrid(ids, 'replace', folderName);
  };

  const handleLoadChannelToGrid = (channelName: string) => {
    const ids = streams
      .filter((s) => (s.channel.trim() || 'Unknown Channel') === channelName)
      .map((s) => s.id);
    onLoadStreamsToGrid(ids, 'replace', channelName);
  };

  const editingStream =
    drawerState.open && drawerState.mode === 'edit'
      ? streams.find((s) => s.id === drawerState.streamId) || null
      : null;

  const activeTitlesSummary = useMemo(() => {
    if (activeStreams.length === 0) return '';
    const labels = activeStreams.slice(0, 3).map((s) => s.customLabel || s.title);
    const rest = activeStreams.length - labels.length;
    return rest > 0 ? `${labels.join(' · ')} +${rest}` : labels.join(' · ');
  }, [activeStreams]);

  const audioStatusText = useMemo(() => {
    if (allActiveMuted) return `Muted · ${activeStreams.length} in grid`;
    if (isAllPaused) return `Paused · ${activeStreams.length} in grid`;
    if (playingCount > 0) return `Playing ${playingCount} of ${activeStreams.length}`;
    return `${activeStreams.length} loaded in grid`;
  }, [allActiveMuted, isAllPaused, playingCount, activeStreams.length]);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden relative">
      {/* Desktop Vault Sidebar (256px) */}
      <aside
        className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r h-full overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <StreamVaultSidebar
          streams={streams}
          folders={folders}
          activeIdSet={activeIdSet}
          scope={scope}
          selectedTags={selectedTags}
          onSelectScope={setScope}
          onToggleTag={handleToggleTag}
          onAddFolder={(name, parentId) => onAddFolder(name, parentId)}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          onLoadFolderToGrid={handleLoadFolderToGrid}
          onLoadChannelToGrid={handleLoadChannelToGrid}
        />
      </aside>

      {/* Mobile / Tablet Vault Sidebar Drawer */}
      {isActiveView && mobileSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Vault navigation"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
          <div
            className="relative z-10 w-72 max-w-[85vw] h-full border-r flex flex-col overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              boxShadow: 'var(--shadow-popover)',
            }}
          >
            <div
              className="px-4 py-3 border-b flex items-center justify-between shrink-0"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span className="font-display text-sm font-bold">Browse Vault</span>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Close vault menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <StreamVaultSidebar
                streams={streams}
                folders={folders}
                activeIdSet={activeIdSet}
                scope={scope}
                selectedTags={selectedTags}
                onSelectScope={setScope}
                onToggleTag={handleToggleTag}
                onAddFolder={(name, parentId) => onAddFolder(name, parentId)}
                onRenameFolder={onRenameFolder}
                onDeleteFolder={onDeleteFolder}
                onLoadFolderToGrid={handleLoadFolderToGrid}
                onLoadChannelToGrid={handleLoadChannelToGrid}
                onCloseMobile={() => setMobileSidebarOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Vault Workspace Column */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Vault Context Header & Controls */}
        <div
          className="px-4 sm:px-6 pt-4 pb-3.5 border-b space-y-3 shrink-0"
          style={{
            backgroundColor: 'var(--bg-canvas)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Row 1: Breadcrumb + Title + Contextual Stack Actions */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="lg:hidden mt-0.5 h-9 w-9 rounded-lg border flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
                aria-label="Open folders and channels sidebar"
              >
                <Menu className="w-4 h-4" />
              </button>

              <div className="min-w-0">
                <div
                  className="text-[11px] font-medium truncate"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {scopeMeta.breadcrumb}
                </div>
                <div className="flex items-baseline gap-2.5 mt-0.5 flex-wrap">
                  <h2 className="font-display text-base sm:text-lg font-bold tracking-tight truncate">
                    {scopeMeta.title}
                  </h2>
                  <span
                    className="text-xs font-mono tabular-nums"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {visibleStreams.length} {visibleStreams.length === 1 ? 'stream' : 'streams'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {scopeMeta.canBatchLoad && visibleStreams.length > 0 && (
                <div
                  className="inline-flex items-center rounded-lg border overflow-hidden"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onLoadStreamsToGrid(
                        visibleStreams.map((s) => s.id),
                        'replace',
                        scopeMeta.title
                      )
                    }
                    className="h-9 px-3 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    style={{ color: 'var(--text-primary)' }}
                    title={`Replace Live Grid with these ${visibleStreams.length} streams`}
                  >
                    <Play className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                    <span>Load to Grid</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onLoadStreamsToGrid(
                        visibleStreams.map((s) => s.id),
                        'append',
                        scopeMeta.title
                      )
                    }
                    className="h-9 px-2.5 border-l text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                    title={`Append these ${visibleStreams.length} streams to current Live Grid`}
                  >
                    <Plus className="w-3 h-3" />
                    <span className="hidden sm:inline">Append</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setDrawerState({ open: true, mode: 'create' })}
                className="h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-fg)',
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add URL</span>
              </button>
            </div>
          </div>

          {/* Row 2: Search + Sort + Grid/Table Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search titles, channels, topics, tags, affirmations, or notes..."
                className="w-full h-9 pl-9 pr-8 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="h-6 w-6 rounded flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Selector */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as VaultSortMode)}
              className="h-9 px-2.5 rounded-lg border text-xs font-medium outline-none shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
              aria-label="Sort streams"
            >
              <option value="recent">Sort: Recently Added</option>
              <option value="listens">Sort: Most Listened</option>
              <option value="rating">Sort: Highest Rated</option>
              <option value="title">Sort: Title (A–Z)</option>
              <option value="channel">Sort: Channel (A–Z)</option>
            </select>

            {/* Grid / Table Segmented View Switch */}
            <div
              className="inline-flex items-center gap-0.5 p-1 rounded-lg border shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                borderColor: 'var(--border-subtle)',
              }}
              role="group"
              aria-label="Vault display mode"
            >
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: viewMode === 'grid' ? 'var(--bg-surface)' : 'transparent',
                  color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                aria-label="Grid cards view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: viewMode === 'table' ? 'var(--bg-surface)' : 'transparent',
                  color: viewMode === 'table' ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                aria-label="Dense table view"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Table</span>
              </button>
            </div>
          </div>

          {/* Active Multi-Tag Filter Indicator */}
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Filtered by tags:
              </span>
              {selectedTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleToggleTag(tag)}
                  className="h-6 px-2 rounded-md border text-[11px] font-medium inline-flex items-center gap-1"
                  style={{
                    backgroundColor: 'var(--accent-soft)',
                    borderColor: 'var(--accent)',
                    color: 'var(--accent)',
                  }}
                >
                  <span>#{tag}</span>
                  <X className="w-3 h-3" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelectedTags([])}
                className="text-[11px] font-medium px-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                Clear tags
              </button>
            </div>
          )}
        </div>

        {/* Main Scrollable Catalog Area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {visibleStreams.length === 0 ? (
            <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3">
              <div
                className="w-11 h-11 rounded-xl border flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                <MonitorPlay className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-sm font-bold">
                  {streams.length === 0 ? 'Your Vault is empty' : 'No matching streams'}
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {streams.length === 0
                    ? 'Save YouTube subliminals, frequencies, and ambient videos here to organize them by folder, topic, and channel.'
                    : 'Try clearing your search or tag filters, or add a new URL to this view.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(searchQuery || selectedTags.length > 0 || scope.kind !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedTags([]);
                      setScope({ kind: 'all' });
                    }}
                    className="h-9 px-3.5 rounded-lg border text-xs font-medium"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Reset Filters
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDrawerState({ open: true, mode: 'create' })}
                  className="h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-fg)',
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add URL</span>
                </button>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            /* GRID CARDS VIEW */
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 max-w-[1800px]">
              {visibleStreams.map((item) => {
                const inGrid = activeIdSet.has(item.id);
                const rating = item.rating ?? 0;
                const listens = item.listenCount ?? 0;
                const itemFolders = (item.folderIds ?? [])
                  .map((fid) => folderById.get(fid)?.name)
                  .filter((n): n is string => Boolean(n));

                return (
                  <article
                    key={item.id}
                    className="rounded-xl border flex flex-col overflow-hidden transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: inGrid ? 'var(--accent)' : 'var(--border-subtle)',
                    }}
                  >
                    {/* Thumbnail */}
                    <button
                      type="button"
                      onClick={() =>
                        setDrawerState({ open: true, mode: 'edit', streamId: item.id })
                      }
                      className="relative aspect-video w-full overflow-hidden text-left group"
                      style={{ backgroundColor: 'var(--bg-surface-subtle)' }}
                    >
                      {!brokenThumbs[item.id] ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.customLabel || item.title}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenThumbs((prev) => ({ ...prev, [item.id]: true }))
                          }
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <MonitorPlay className="w-7 h-7" />
                        </div>
                      )}
                      {inGrid && (
                        <span
                          className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-tight"
                          style={{
                            backgroundColor: 'var(--accent)',
                            color: 'var(--accent-fg)',
                          }}
                        >
                          In Grid
                        </span>
                      )}
                    </button>

                    {/* Body */}
                    <div className="p-3.5 flex-1 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setDrawerState({ open: true, mode: 'edit', streamId: item.id })
                          }
                          className="text-left min-w-0 flex-1"
                        >
                          <h3 className="text-xs font-semibold leading-snug line-clamp-2 hover:underline">
                            {item.customLabel || item.title}
                          </h3>
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateStream(item.id, { favorite: !item.favorite })}
                          className="h-7 w-7 -mr-1 -mt-1 rounded-md flex items-center justify-center shrink-0"
                          style={{
                            color: item.favorite ? 'var(--warning)' : 'var(--text-muted)',
                          }}
                          aria-label={item.favorite ? 'Unfavorite' : 'Favorite'}
                        >
                          <Star className={`w-3.5 h-3.5 ${item.favorite ? 'fill-current' : ''}`} />
                        </button>
                      </div>

                      {/* Clean unboxed inline metadata (Zero-Pill discipline) */}
                      <div
                        className="text-[11px] leading-relaxed line-clamp-1"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {[
                          item.channel || 'YouTube',
                          item.category || 'General',
                          item.tags.length > 0
                            ? item.tags.slice(0, 3).map((t) => `#${t}`).join(' ')
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>

                      {itemFolders.length > 0 && (
                        <div
                          className="text-[11px] flex items-center gap-1 truncate"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Folder className="w-3 h-3 shrink-0 opacity-75" />
                          <span className="truncate">{itemFolders.join(', ')}</span>
                        </div>
                      )}

                      {/* Affirmations / Listening Notes Preview */}
                      {(item.affirmations || item.notes) && (
                        <p
                          className="text-[11px] leading-relaxed line-clamp-2"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {item.affirmations || item.notes}
                        </p>
                      )}

                      {/* Rating + Listen Count Strip */}
                      <div className="flex items-center justify-between gap-2 pt-1 mt-auto">
                        <div className="flex items-center gap-0.5" aria-label={`Rating ${rating} of 5`}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() =>
                                onUpdateStream(item.id, { rating: rating === star ? 0 : star })
                              }
                              className="p-0.5 transition-colors"
                              style={{
                                color: star <= rating ? 'var(--warning)' : 'var(--border-strong)',
                              }}
                              aria-label={`Set rating to ${star}`}
                            >
                              <Star className={`w-3 h-3 ${star <= rating ? 'fill-current' : ''}`} />
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => onIncrementListen(item.id)}
                          className="text-[11px] font-mono tabular-nums inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:opacity-80"
                          style={{ color: 'var(--text-muted)' }}
                          title="Log +1 listen"
                        >
                          <Headphones className="w-3 h-3" />
                          <span>{listens}</span>
                          <span className="opacity-70">+1</span>
                        </button>
                      </div>

                      {/* Card Actions */}
                      <div
                        className="flex items-center gap-1.5 pt-2.5 border-t"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <button
                          type="button"
                          onClick={() => onToggleStreamInGrid(item.id)}
                          className="flex-1 h-8 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                          style={{
                            backgroundColor: inGrid ? 'var(--accent-soft)' : 'var(--bg-surface-subtle)',
                            color: inGrid ? 'var(--accent)' : 'var(--text-primary)',
                          }}
                        >
                          {inGrid ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>In Grid</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add to Grid</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setDrawerState({ open: true, mode: 'edit', streamId: item.id })
                          }
                          className="h-8 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Details</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            /* DENSE TABLE VIEW */
            <div
              className="rounded-xl border overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr
                      className="border-b text-[11px] font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-surface-subtle)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <th className="py-2.5 pl-3.5 pr-3">Stream</th>
                      <th className="py-2.5 px-3">Channel</th>
                      <th className="py-2.5 px-3">Topic & Tags</th>
                      <th className="py-2.5 px-3 hidden xl:table-cell">Folders</th>
                      <th className="py-2.5 px-3">Rating</th>
                      <th className="py-2.5 px-3 text-right">Listens</th>
                      <th className="py-2.5 pl-3 pr-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                    {visibleStreams.map((item) => {
                      const inGrid = activeIdSet.has(item.id);
                      const rating = item.rating ?? 0;
                      const listens = item.listenCount ?? 0;
                      const itemFolders = (item.folderIds ?? [])
                        .map((fid) => folderById.get(fid)?.name)
                        .filter((n): n is string => Boolean(n));

                      return (
                        <tr
                          key={item.id}
                          className="transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <td className="py-2 pl-3.5 pr-3 max-w-[300px]">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setDrawerState({ open: true, mode: 'edit', streamId: item.id })
                                }
                                className="w-14 h-8 rounded overflow-hidden shrink-0 border"
                                style={{
                                  backgroundColor: 'var(--bg-surface-subtle)',
                                  borderColor: 'var(--border-subtle)',
                                }}
                              >
                                {!brokenThumbs[item.id] ? (
                                  <img
                                    src={item.thumbnailUrl}
                                    alt={item.customLabel || item.title}
                                    referrerPolicy="no-referrer"
                                    onError={() =>
                                      setBrokenThumbs((prev) => ({ ...prev, [item.id]: true }))
                                    }
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <MonitorPlay
                                      className="w-3.5 h-3.5"
                                      style={{ color: 'var(--text-muted)' }}
                                    />
                                  </div>
                                )}
                              </button>
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDrawerState({ open: true, mode: 'edit', streamId: item.id })
                                  }
                                  className="text-xs font-semibold truncate block max-w-full text-left hover:underline"
                                >
                                  {item.customLabel || item.title}
                                </button>
                                {(item.affirmations || item.notes) && (
                                  <div
                                    className="text-[11px] truncate max-w-[240px]"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    {item.affirmations || item.notes}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-2 px-3 text-xs whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() =>
                                setScope({
                                  kind: 'channel',
                                  channel: item.channel.trim() || 'Unknown Channel',
                                })
                              }
                              className="hover:underline max-w-[140px] truncate block"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {item.channel || 'YouTube'}
                            </button>
                          </td>

                          <td className="py-2 px-3 text-xs max-w-[200px]">
                            <div className="truncate" style={{ color: 'var(--text-secondary)' }}>
                              {item.category || 'General'}
                              {item.tags.length > 0 && (
                                <span style={{ color: 'var(--text-muted)' }}>
                                  {' · '}
                                  {item.tags.slice(0, 3).map((t) => `#${t}`).join(' ')}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-2 px-3 text-xs hidden xl:table-cell max-w-[160px]">
                            <div className="truncate" style={{ color: 'var(--text-muted)' }}>
                              {itemFolders.length > 0 ? itemFolders.join(', ') : '—'}
                            </div>
                          </td>

                          <td className="py-2 px-3 whitespace-nowrap">
                            <div className="inline-flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() =>
                                    onUpdateStream(item.id, { rating: rating === star ? 0 : star })
                                  }
                                  style={{
                                    color:
                                      star <= rating ? 'var(--warning)' : 'var(--border-strong)',
                                  }}
                                  aria-label={`Rate ${star}`}
                                >
                                  <Star
                                    className={`w-3 h-3 ${star <= rating ? 'fill-current' : ''}`}
                                  />
                                </button>
                              ))}
                            </div>
                          </td>

                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onIncrementListen(item.id)}
                              className="text-xs font-mono tabular-nums inline-flex items-center gap-1 hover:opacity-80"
                              style={{ color: 'var(--text-secondary)' }}
                              title="Log +1 listen"
                            >
                              <span>{listens}</span>
                              <Plus className="w-3 h-3 opacity-60" />
                            </button>
                          </td>

                          <td className="py-2 pl-3 pr-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onToggleStreamInGrid(item.id)}
                                className="h-7 px-2.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                                style={{
                                  backgroundColor: inGrid
                                    ? 'var(--accent-soft)'
                                    : 'var(--bg-surface-subtle)',
                                  color: inGrid ? 'var(--accent)' : 'var(--text-primary)',
                                }}
                              >
                                {inGrid ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span>In Grid</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3" />
                                    <span>Grid</span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDrawerState({ open: true, mode: 'edit', streamId: item.id })
                                }
                                className="h-7 w-7 rounded-md border inline-flex items-center justify-center"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--border-subtle)',
                                  color: 'var(--text-secondary)',
                                }}
                                aria-label="Edit details"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteStream(item.id)}
                                className="h-7 w-7 rounded-md border inline-flex items-center justify-center"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--border-subtle)',
                                  color: 'var(--danger)',
                                }}
                                aria-label="Delete stream"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Compact Persistent Live Audio Bar (stays docked while streams play uninterrupted in background) */}
        {activeStreams.length > 0 && (
          <div
            className="px-4 sm:px-6 py-2.5 border-t flex items-center justify-between gap-3 shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: allActiveMuted
                    ? 'var(--bg-surface-subtle)'
                    : 'var(--accent-soft)',
                  color: allActiveMuted ? 'var(--danger)' : 'var(--accent)',
                }}
              >
                {allActiveMuted ? (
                  <VolumeX className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">
                  {activeTitlesSummary}
                </div>
                <div
                  className="text-[11px] font-mono tabular-nums truncate"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {audioStatusText}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onTogglePauseAll}
                className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                style={{
                  backgroundColor: isAllPaused ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  borderColor: isAllPaused ? 'var(--accent)' : 'var(--border-subtle)',
                  color: isAllPaused ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                {isAllPaused ? (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Pause</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onToggleViewMute}
                className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                style={{
                  backgroundColor: allActiveMuted
                    ? 'var(--bg-surface-subtle)'
                    : 'var(--bg-surface)',
                  borderColor: allActiveMuted ? 'var(--danger)' : 'var(--border-subtle)',
                  color: allActiveMuted ? 'var(--danger)' : 'var(--text-secondary)',
                }}
              >
                {allActiveMuted ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Unmute</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Mute</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onBackToGrid}
                className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-fg)',
                }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Grid</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Slide-Over Inspector Drawer */}
      {isActiveView && drawerState.open && (
        <StreamEditorDrawer
          mode={drawerState.mode}
          stream={editingStream}
          allStreams={streams}
          folders={folders}
          inGrid={editingStream ? activeIdSet.has(editingStream.id) : false}
          defaultFolderId={scope.kind === 'folder' ? scope.folderId : null}
          defaultTopic={scope.kind === 'topic' ? scope.topic : undefined}
          defaultChannel={scope.kind === 'channel' ? scope.channel : undefined}
          onClose={() => setDrawerState({ open: false })}
          onCreate={onAddStream}
          onUpdate={onUpdateStream}
          onDelete={onDeleteStream}
          onToggleInGrid={onToggleStreamInGrid}
          onAddFolder={(name, parentId) => onAddFolder(name, parentId ?? null)}
          onNotify={onNotify}
        />
      )}
    </div>
  );
};
