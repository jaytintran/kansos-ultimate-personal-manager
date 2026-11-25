import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckSquare,
  ChevronRight,
  Folder,
  GripVertical,
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
  Tv,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useVaultStreamDrag } from '../../hooks/useVaultStreamDrag';
import { StreamFolder, StreamItem } from '../../types';
import { VIEW_PREFERENCE_SYNC_EVENT } from '../../utils/viewPreferences';
import { DynamicIcon } from '../IconLibrary';
import { FloatingStreamFolderDropDock } from './FloatingStreamFolderDropDock';
import { StreamEditorDrawer } from './StreamEditorDrawer';
import {
  PendingStreamFolderDrop,
  StreamFolderDropActionModal,
  StreamFolderPickerModal,
} from './StreamFolderDropModal';
import { StreamVaultBulkBar } from './StreamVaultBulkBar';
import { BulkModalType, StreamVaultBulkModal } from './StreamVaultBulkModal';
import {
  getDescendantFolderIds,
  StreamVaultSidebar,
  VaultScope,
} from './StreamVaultSidebar';

type VaultViewMode = 'grid' | 'table';
type VaultSortMode = 'custom' | 'recent' | 'listens' | 'rating' | 'title' | 'channel';

const VAULT_SORT_PREFS_KEY = 'kanso_streamer_vault_sort_v1';

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
  onStackStream: (id: string) => void;
  onLoadStreamsToGrid: (streamIds: string[], mode?: 'replace' | 'append', label?: string) => void;
  onReorderStreams: (sortOrderById: Record<string, number>) => void;
  onIncrementListen: (id: string) => void;
  onAddFolder: (name: string, parentId?: string | null) => StreamFolder;
  onRenameFolder: (id: string, name: string) => void;
  onUpdateFolder?: (id: string, patch: Partial<StreamFolder>) => void;
  onDeleteFolder: (id: string) => void;
  topicIcons?: Record<string, string>;
  onSetTopicIcon?: (topic: string, icon: string | undefined) => void;
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
  onStackStream,
  onLoadStreamsToGrid,
  onReorderStreams,
  onIncrementListen,
  onAddFolder,
  onRenameFolder,
  onUpdateFolder,
  onDeleteFolder,
  topicIcons = {},
  onSetTopicIcon,
  onNotify,
}) => {
  const [scope, setScope] = useState<VaultScope>({ kind: 'all' });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<VaultViewMode>('grid');
  const [sortBy, setSortBy] = useState<VaultSortMode>(() => {
    try {
      const saved = localStorage.getItem(VAULT_SORT_PREFS_KEY);
      if (
        saved === 'custom' ||
        saved === 'recent' ||
        saved === 'listens' ||
        saved === 'rating' ||
        saved === 'title' ||
        saved === 'channel'
      ) {
        return saved;
      }
    } catch {
      // Ignore storage errors
    }
    return 'recent';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  // Bulk edit state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedStreamIds, setSelectedStreamIds] = useState<Set<string>>(new Set());
  const [bulkModalType, setBulkModalType] = useState<BulkModalType>(null);

  const toggleSelectStream = (streamId: string) => {
    setSelectedStreamIds((prev) => {
      const next = new Set(prev);
      if (next.has(streamId)) next.delete(streamId);
      else next.add(streamId);
      return next;
    });
  };

  // Drag-and-drop scroll containers & folder drop modals
  const gridRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  const dockScrollRef = useRef<HTMLDivElement | null>(null);
  const [pendingFolderDrop, setPendingFolderDrop] =
    useState<PendingStreamFolderDrop | null>(null);
  const [folderPickerStreamIds, setFolderPickerStreamIds] =
    useState<string[] | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(VAULT_SORT_PREFS_KEY, sortBy);
    } catch {
      // Ignore storage errors
    }
  }, [sortBy]);

  useEffect(() => {
    const onSynced = () => {
      try {
        const saved = localStorage.getItem(VAULT_SORT_PREFS_KEY);
        if (
          saved === 'custom' ||
          saved === 'recent' ||
          saved === 'listens' ||
          saved === 'rating' ||
          saved === 'title' ||
          saved === 'channel'
        ) {
          setSortBy(saved);
        }
      } catch {
        // Ignore
      }
    };
    window.addEventListener(VIEW_PREFERENCE_SYNC_EVENT, onSynced);
    return () => {
      window.removeEventListener(VIEW_PREFERENCE_SYNC_EVENT, onSynced);
    };
  }, []);

  // Editor drawer state
  const [drawerState, setDrawerState] = useState<
    { open: false } | { open: true; mode: 'create' } | { open: true; mode: 'edit'; streamId: string }
  >({ open: false });

  const folderById = useMemo(() => {
    const map = new Map<string, StreamFolder>();
    for (const f of folders) map.set(f.id, f);
    return map;
  }, [folders]);

  const existingTopics = useMemo(() => {
    const set = new Set<string>();
    for (const s of streams) {
      if (s.category?.trim()) set.add(s.category.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [streams]);

  const existingTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of streams) {
      for (const t of s.tags) {
        if (t.trim()) set.add(t.trim().toLowerCase());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [streams]);

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
          breadcrumb: 'Vault / Active Stack',
          title: 'Currently In Live Stack',
          description: 'Streams active in your live multi-stream stack right now.',
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
          icon: folder?.icon,
          description: folder?.description || 'Listening stack & folder collection.',
          canBatchLoad: true,
        };
      }
      case 'topic':
        return {
          breadcrumb: `Vault / Topics / ${scope.topic}`,
          title: scope.topic,
          icon: topicIcons[scope.topic.trim().toLowerCase()],
          description: `All saved streams grouped under the ${scope.topic} theme.`,
          canBatchLoad: true,
        };
      case 'channels':
        return {
          breadcrumb: 'Vault / Channels',
          title: 'Channels Overview',
          description: 'Browse all creators and channels as horizontal carousels.',
          canBatchLoad: false,
        };
      case 'channel':
        return {
          breadcrumb: `Vault / Channels / ${scope.channel}`,
          title: scope.channel,
          description: `Saved catalog from creator ${scope.channel}.`,
          canBatchLoad: true,
        };
    }
  }, [scope, folderById, topicIcons]);

  const customStreamOrderCompare = useCallback((a: StreamItem, b: StreamItem) => {
    const aOrder =
      typeof a.sortOrder === 'number' && Number.isFinite(a.sortOrder)
        ? a.sortOrder
        : null;
    const bOrder =
      typeof b.sortOrder === 'number' && Number.isFinite(b.sortOrder)
        ? b.sortOrder
        : null;
    if (aOrder !== null && bOrder !== null) {
      if (aOrder !== bOrder) return aOrder - bOrder;
    } else if (aOrder === null && bOrder !== null) {
      return -1;
    } else if (aOrder !== null && bOrder === null) {
      return 1;
    }
    return b.addedAt.localeCompare(a.addedAt) || a.id.localeCompare(b.id);
  }, []);

  const isCustomSort = sortBy === 'custom';

  // Channels overview data when scope.kind === 'channels'
  const channelsOverviewData = useMemo(() => {
    if (scope.kind !== 'channels') return [];
    const q = searchQuery.trim().toLowerCase();

    const map = new Map<string, StreamItem[]>();
    for (const s of streams) {
      const ch = s.channel.trim() || 'Unknown Channel';
      const list = map.get(ch) || [];
      list.push(s);
      map.set(ch, list);
    }

    const result: { name: string; streams: StreamItem[] }[] = [];

    for (const [chName, chStreams] of map.entries()) {
      const channelMatchesQuery = q && chName.toLowerCase().includes(q);

      const filtered = chStreams.filter((s) => {
        if (selectedTags.length > 0) {
          const streamTags = new Set(s.tags.map((t) => t.trim().toLowerCase()));
          for (const req of selectedTags) {
            if (!streamTags.has(req)) return false;
          }
        }
        if (!q) return true;
        if (channelMatchesQuery) return true;
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
        return haystack.includes(q);
      });

      if (filtered.length > 0) {
        const sorted = [...filtered].sort((a, b) => {
          switch (sortBy) {
            case 'custom':
              return customStreamOrderCompare(a, b);
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
        result.push({ name: chName, streams: sorted });
      }
    }

    result.sort((a, b) => b.streams.length - a.streams.length || a.name.localeCompare(b.name));
    return result;
  }, [scope, streams, searchQuery, selectedTags, sortBy, customStreamOrderCompare]);

  // Filter + sort visible streams
  const visibleStreams = useMemo(() => {
    if (scope.kind === 'channels') {
      return channelsOverviewData.flatMap((c) => c.streams);
    }

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
        case 'custom':
          return customStreamOrderCompare(a, b);
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
  }, [streams, scope, folders, activeIdSet, selectedTags, searchQuery, sortBy, customStreamOrderCompare, channelsOverviewData]);

  const handleReorderStreams = useCallback(
    (draggedIds: string[], targetId: string, position: 'before' | 'after') => {
      if (draggedIds.length === 0 || !targetId) return;
      const draggedSet = new Set(draggedIds);
      if (draggedSet.has(targetId)) return;

      const visibleIds = visibleStreams.map((s) => s.id);
      if (!visibleIds.includes(targetId)) return;

      const movingVisibleIds = visibleIds.filter((id) => draggedSet.has(id));
      if (movingVisibleIds.length === 0) return;

      const remainingVisible = visibleIds.filter((id) => !draggedSet.has(id));
      const targetIndex = remainingVisible.indexOf(targetId);
      if (targetIndex === -1) return;

      const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
      const nextVisibleIds = [
        ...remainingVisible.slice(0, insertIndex),
        ...movingVisibleIds,
        ...remainingVisible.slice(insertIndex),
      ];

      if (nextVisibleIds.every((id, idx) => id === visibleIds[idx])) return;

      const visibleSet = new Set(visibleIds);
      const globalSorted = [...streams].sort(customStreamOrderCompare);
      const byId = new Map(streams.map((s) => [s.id, s]));
      let visibleCursor = 0;
      const reorderedGlobal: StreamItem[] = [];

      for (const st of globalSorted) {
        if (visibleSet.has(st.id)) {
          const nextId = nextVisibleIds[visibleCursor++];
          const nextSt = nextId ? byId.get(nextId) : undefined;
          if (nextSt) reorderedGlobal.push(nextSt);
        } else {
          reorderedGlobal.push(st);
        }
      }
      while (visibleCursor < nextVisibleIds.length) {
        const nextSt = byId.get(nextVisibleIds[visibleCursor++]);
        if (nextSt) reorderedGlobal.push(nextSt);
      }

      const sortOrderById: Record<string, number> = {};
      reorderedGlobal.forEach((s, idx) => {
        sortOrderById[s.id] = idx;
      });
      onReorderStreams(sortOrderById);
    },
    [visibleStreams, streams, customStreamOrderCompare, onReorderStreams]
  );

  const isSingleColumnGrid = useCallback(() => {
    if (viewMode === 'table') return true;
    const grid = gridRef.current;
    if (grid) {
      const cols = getComputedStyle(grid)
        .gridTemplateColumns.split(' ')
        .filter(Boolean).length;
      if (cols > 0) return cols === 1;
    }
    return typeof window !== 'undefined' ? window.innerWidth < 640 : false;
  }, [viewMode]);

  const handleDropToFolder = useCallback(
    (streamIds: string[], folderId: string) => {
      const targetFolder = folderById.get(folderId);
      if (!targetFolder || streamIds.length === 0) return;

      const targetSet = new Set(streamIds);
      const targetStreams = streams.filter((s) => targetSet.has(s.id));
      if (targetStreams.length === 0) return;

      const allAlreadyInTarget = targetStreams.every((s) =>
        (s.folderIds ?? []).includes(folderId)
      );
      if (allAlreadyInTarget) {
        setPendingFolderDrop({
          actionMode: 'remove',
          targetFolderId: folderId,
          targetFolderName: targetFolder.name,
          streamIds,
          streamTitles: targetStreams.map((s) => s.customLabel || s.title),
          existingFolderNames: [],
        });
        return;
      }

      const otherFolderIds = new Set<string>();
      for (const s of targetStreams) {
        for (const fid of s.folderIds ?? []) {
          if (fid !== folderId) otherFolderIds.add(fid);
        }
      }

      if (otherFolderIds.size > 0) {
        const existingNames = Array.from(otherFolderIds)
          .map((fid) => folderById.get(fid)?.name)
          .filter((n): n is string => Boolean(n));
        setPendingFolderDrop({
          actionMode: 'add-or-move',
          targetFolderId: folderId,
          targetFolderName: targetFolder.name,
          streamIds,
          streamTitles: targetStreams.map((s) => s.customLabel || s.title),
          existingFolderNames: existingNames,
        });
        return;
      }

      for (const s of targetStreams) {
        onUpdateStream(s.id, { folderIds: [folderId] });
      }
      onNotify(
        targetStreams.length === 1
          ? `Moved “${targetStreams[0].customLabel || targetStreams[0].title}” to ${targetFolder.name}`
          : `Moved ${targetStreams.length} streams to ${targetFolder.name}`,
        'success'
      );
    },
    [folderById, streams, onUpdateStream, onNotify]
  );

  const handleConfirmDropAdd = useCallback(() => {
    if (!pendingFolderDrop) return;
    const { streamIds, targetFolderId, targetFolderName } = pendingFolderDrop;
    const targetSet = new Set(streamIds);
    for (const s of streams) {
      if (!targetSet.has(s.id)) continue;
      const next = Array.from(new Set([...(s.folderIds ?? []), targetFolderId]));
      onUpdateStream(s.id, { folderIds: next });
    }
    setPendingFolderDrop(null);
    onNotify(
      streamIds.length === 1
        ? `Added stream to ${targetFolderName}`
        : `Added ${streamIds.length} streams to ${targetFolderName}`,
      'success'
    );
  }, [pendingFolderDrop, streams, onUpdateStream, onNotify]);

  const handleConfirmDropMove = useCallback(() => {
    if (!pendingFolderDrop) return;
    const { streamIds, targetFolderId, targetFolderName } = pendingFolderDrop;
    for (const id of streamIds) {
      onUpdateStream(id, { folderIds: [targetFolderId] });
    }
    setPendingFolderDrop(null);
    onNotify(
      streamIds.length === 1
        ? `Moved stream to ${targetFolderName}`
        : `Moved ${streamIds.length} streams to ${targetFolderName}`,
      'success'
    );
  }, [pendingFolderDrop, onUpdateStream, onNotify]);

  const handleConfirmDropRemove = useCallback(() => {
    if (!pendingFolderDrop) return;
    const { streamIds, targetFolderId, targetFolderName } = pendingFolderDrop;
    const targetSet = new Set(streamIds);
    for (const s of streams) {
      if (!targetSet.has(s.id)) continue;
      const next = (s.folderIds ?? []).filter((fid) => fid !== targetFolderId);
      onUpdateStream(s.id, { folderIds: next });
    }
    setPendingFolderDrop(null);
    onNotify(
      streamIds.length === 1
        ? `Removed stream from ${targetFolderName}`
        : `Removed ${streamIds.length} streams from ${targetFolderName}`,
      'success'
    );
  }, [pendingFolderDrop, streams, onUpdateStream, onNotify]);

  const handleDropToFavorites = useCallback(
    (streamIds: string[]) => {
      if (streamIds.length === 0) return;
      for (const id of streamIds) {
        onUpdateStream(id, { favorite: true });
      }
      onNotify(
        streamIds.length === 1
          ? 'Added stream to Favorites'
          : `Added ${streamIds.length} streams to Favorites`,
        'success'
      );
    },
    [onUpdateStream, onNotify]
  );

  const handleDropToTopic = useCallback(
    (streamIds: string[], topicName: string) => {
      if (streamIds.length === 0) return;
      const nextCategory = topicName === 'Uncategorized' ? '' : topicName;
      for (const id of streamIds) {
        onUpdateStream(id, { category: nextCategory });
      }
      onNotify(
        nextCategory
          ? streamIds.length === 1
            ? `Set topic to ${nextCategory}`
            : `Set topic to ${nextCategory} for ${streamIds.length} streams`
          : streamIds.length === 1
            ? 'Cleared stream topic'
            : `Cleared topic for ${streamIds.length} streams`,
        'success'
      );
    },
    [onUpdateStream, onNotify]
  );

  const handleApplyFolderPicker = useCallback(
    (streamIds: string[], addFolderIds: string[], removeFolderIds: string[]) => {
      const targetSet = new Set(streamIds);
      const removeSet = new Set(removeFolderIds);
      for (const s of streams) {
        if (!targetSet.has(s.id)) continue;
        const filtered = (s.folderIds ?? []).filter((fid) => !removeSet.has(fid));
        const next = Array.from(new Set([...filtered, ...addFolderIds]));
        onUpdateStream(s.id, { folderIds: next });
      }
      onNotify(
        streamIds.length === 1
          ? 'Updated folders for stream'
          : `Updated folders for ${streamIds.length} streams`,
        'success'
      );
    },
    [streams, onUpdateStream, onNotify]
  );

  const {
    isDraggingStreams,
    activeDropTarget,
    activeDragStreamIds,
    handleStreamPointerDown,
    shouldSuppressClick,
    renderDragPreview,
  } = useVaultStreamDrag({
    enabled:
      isActiveView &&
      !drawerState.open &&
      !bulkModalType &&
      !pendingFolderDrop &&
      !folderPickerStreamIds,
    streams,
    selectedIds: selectedStreamIds,
    isCustomSort,
    mainScrollRef,
    sidebarScrollRef,
    dockScrollRef,
    onDropToFolder: handleDropToFolder,
    onDropToTopic: handleDropToTopic,
    onDropToFavorites: handleDropToFavorites,
    onDropToMoreFolders: (ids) => setFolderPickerStreamIds(ids),
    onReorderStreams: handleReorderStreams,
  });

  const trayMemberFolderIds = useMemo(() => {
    if (bulkMode || activeDragStreamIds.size !== 1) {
      return new Set<string>();
    }
    const singleId = Array.from(activeDragStreamIds)[0];
    const stream = streams.find((s) => s.id === singleId);
    return new Set(stream?.folderIds ?? []);
  }, [bulkMode, activeDragStreamIds, streams]);

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

  const handleBulkApplyTopic = useCallback(
    (newTopic: string) => {
      for (const id of selectedStreamIds) {
        onUpdateStream(id, { category: newTopic });
      }
      onNotify(`Updated topic for ${selectedStreamIds.size} streams`, 'success');
      setSelectedStreamIds(new Set());
      setBulkMode(false);
    },
    [selectedStreamIds, onUpdateStream, onNotify]
  );

  const handleBulkApplyTags = useCallback(
    (tags: string[], mode: 'append' | 'replace') => {
      for (const id of selectedStreamIds) {
        const stream = streams.find((s) => s.id === id);
        if (!stream) continue;
        const nextTags =
          mode === 'append'
            ? Array.from(new Set([...stream.tags, ...tags]))
            : tags;
        onUpdateStream(id, { tags: nextTags });
      }
      onNotify(`Updated tags for ${selectedStreamIds.size} streams`, 'success');
      setSelectedStreamIds(new Set());
      setBulkMode(false);
    },
    [selectedStreamIds, streams, onUpdateStream, onNotify]
  );

  const handleBulkApplyFolders = useCallback(
    (folderIds: string[], mode: 'append' | 'replace') => {
      for (const id of selectedStreamIds) {
        const stream = streams.find((s) => s.id === id);
        if (!stream) continue;
        const nextFolders =
          mode === 'append'
            ? Array.from(new Set([...(stream.folderIds || []), ...folderIds]))
            : folderIds;
        onUpdateStream(id, { folderIds: nextFolders });
      }
      onNotify(`Updated folders for ${selectedStreamIds.size} streams`, 'success');
      setSelectedStreamIds(new Set());
      setBulkMode(false);
    },
    [selectedStreamIds, streams, onUpdateStream, onNotify]
  );

  const handleBulkFavorite = useCallback(() => {
    const allFav = Array.from(selectedStreamIds).every(
      (id) => streams.find((s) => s.id === id)?.favorite
    );
    for (const id of selectedStreamIds) {
      onUpdateStream(id, { favorite: !allFav });
    }
    onNotify(
      allFav
        ? `Unfavorited ${selectedStreamIds.size} streams`
        : `Favorited ${selectedStreamIds.size} streams`,
      'success'
    );
  }, [selectedStreamIds, streams, onUpdateStream, onNotify]);

  const handleBulkApplyRating = useCallback(
    (ratingVal: number) => {
      for (const id of selectedStreamIds) {
        onUpdateStream(id, { rating: ratingVal });
      }
      onNotify(`Updated rating for ${selectedStreamIds.size} streams`, 'success');
      setSelectedStreamIds(new Set());
      setBulkMode(false);
    },
    [selectedStreamIds, onUpdateStream, onNotify]
  );

  const handleBulkLoadToGrid = useCallback(() => {
    onLoadStreamsToGrid(Array.from(selectedStreamIds), 'replace', 'Selected Streams');
    onNotify(`Loaded ${selectedStreamIds.size} streams to Live Grid`, 'success');
  }, [selectedStreamIds, onLoadStreamsToGrid, onNotify]);

  const handleBulkConfirmDelete = useCallback(() => {
    const count = selectedStreamIds.size;
    for (const id of selectedStreamIds) {
      onDeleteStream(id);
    }
    setSelectedStreamIds(new Set());
    setBulkMode(false);
    onNotify(`Deleted ${count} streams`, 'success');
  }, [selectedStreamIds, onDeleteStream, onNotify]);

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
    if (allActiveMuted) return `Muted · ${activeStreams.length} stacked`;
    if (isAllPaused) return `Paused · ${activeStreams.length} stacked`;
    if (playingCount > 0) return `Playing ${playingCount} of ${activeStreams.length} stacked`;
    return `${activeStreams.length} stacked in studio`;
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
          topicIcons={topicIcons}
          activeIdSet={activeIdSet}
          scope={scope}
          selectedTags={selectedTags}
          scrollContainerRef={sidebarScrollRef}
          activePointerDropTarget={activeDropTarget}
          onSelectScope={setScope}
          onToggleTag={handleToggleTag}
          onAddFolder={(name, parentId) => onAddFolder(name, parentId)}
          onRenameFolder={onRenameFolder}
          onUpdateFolder={onUpdateFolder}
          onDeleteFolder={onDeleteFolder}
          onSetTopicIcon={onSetTopicIcon}
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
                topicIcons={topicIcons}
                activeIdSet={activeIdSet}
                scope={scope}
                selectedTags={selectedTags}
                onSelectScope={setScope}
                onToggleTag={handleToggleTag}
                onAddFolder={(name, parentId) => onAddFolder(name, parentId)}
                onRenameFolder={onRenameFolder}
                onUpdateFolder={onUpdateFolder}
                onDeleteFolder={onDeleteFolder}
                onSetTopicIcon={onSetTopicIcon}
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
                  className="lg:hidden mt-0.5 h-8 w-8 rounded-lg border flex items-center justify-center shrink-0"
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
                  <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
                    {scopeMeta.icon && (
                      <DynamicIcon
                        name={scopeMeta.icon}
                        className="w-4 h-4 shrink-0"
                        style={{ color: 'var(--accent)' }}
                      />
                    )}
                    <h2 className="font-display text-base font-semibold tracking-tight truncate">
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
                    className="h-8 px-3 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap hover:bg-[var(--bg-surface-hover)]"
                    style={{ color: 'var(--text-primary)' }}
                    title={`Replace Live Stack with these ${visibleStreams.length} streams`}
                  >
                    <Play className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                    <span>Load Stack</span>
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
                    className="h-8 px-2.5 border-l text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap hover:bg-[var(--bg-surface-hover)]"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                    title={`Layer these ${visibleStreams.length} streams onto current Live Stack`}
                  >
                    <Plus className="w-3 h-3" />
                    <span className="hidden sm:inline">Layer</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setDrawerState({ open: true, mode: 'create' })}
                className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
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

          {/* Row 2: Unified 32px Search + Sort + Grid/Table Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search titles, channels, topics, tags, or notes..."
                className="w-full h-8 pl-8 pr-7 rounded-lg border text-xs outline-none"
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
                  className="h-6 w-6 rounded flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Selector + Custom Order GripVertical Toggle */}
            <div className="inline-flex items-center gap-1 shrink-0">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as VaultSortMode)}
                className="h-8 px-2.5 rounded-lg border text-xs font-medium outline-none cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
                aria-label="Sort streams"
              >
                <option value="custom">Sort: Custom Order</option>
                <option value="recent">Sort: Recently Added</option>
                <option value="listens">Sort: Most Listened</option>
                <option value="rating">Sort: Highest Rated</option>
                <option value="title">Sort: Title (A–Z)</option>
                <option value="channel">Sort: Channel (A–Z)</option>
              </select>

              <button
                type="button"
                onClick={() =>
                  setSortBy((prev) => (prev === 'custom' ? 'recent' : 'custom'))
                }
                title={
                  isCustomSort
                    ? 'Custom order active — drag cards or rows to rearrange (click to switch back)'
                    : 'Enable Custom Order (drag & drop)'
                }
                aria-label={
                  isCustomSort
                    ? 'Custom drag order active'
                    : 'Switch to Custom Order'
                }
                aria-pressed={isCustomSort}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border transition-colors cursor-pointer shrink-0"
                style={{
                  backgroundColor: isCustomSort
                    ? 'var(--accent-soft)'
                    : 'var(--bg-surface)',
                  borderColor: isCustomSort
                    ? 'var(--accent)'
                    : 'var(--border-subtle)',
                  color: isCustomSort ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Select Toggle for Bulk Edit */}
            <button
              type="button"
              onClick={() => {
                setBulkMode((prev) => {
                  if (prev) {
                    setSelectedStreamIds(new Set());
                  }
                  return !prev;
                });
              }}
              className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors shrink-0"
              style={{
                backgroundColor: bulkMode ? 'var(--accent-soft)' : 'var(--bg-surface)',
                borderColor: bulkMode ? 'var(--accent)' : 'var(--border-subtle)',
                color: bulkMode ? 'var(--accent)' : 'var(--text-secondary)',
              }}
              title={bulkMode ? 'Exit Select mode' : 'Select multiple streams for bulk edit'}
              aria-pressed={bulkMode}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Select</span>
              {selectedStreamIds.size > 0 && (
                <span
                  className="font-mono text-[11px] font-semibold px-1 rounded"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                >
                  {selectedStreamIds.size}
                </span>
              )}
            </button>

            {/* Grid / Table Segmented View Switch */}
            <div
              className="inline-flex items-center h-8 gap-0.5 p-0.5 rounded-lg border shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
              role="group"
              aria-label="Vault display mode"
            >
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className="h-full px-2 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: viewMode === 'grid' ? 'var(--accent-soft)' : 'transparent',
                  color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
                }}
                aria-label="Grid cards view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className="h-full px-2 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: viewMode === 'table' ? 'var(--accent-soft)' : 'transparent',
                  color: viewMode === 'table' ? 'var(--accent)' : 'var(--text-muted)',
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

        {/* Main Scrollable Catalog Area + Floating Folder Drop Dock Wrapper */}
        <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
        <div
          ref={mainScrollRef}
          className={`flex-1 overflow-y-auto px-4 sm:px-6 py-4 ${
            isDraggingStreams ? 'pb-40' : ''
          }`}
        >
          {scope.kind === 'channels' ? (
            channelsOverviewData.length === 0 ? (
              <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3">
                <div
                  className="w-11 h-11 rounded-xl border flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <Tv className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-display text-sm font-bold">No channels found</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {searchQuery
                      ? 'No channels or tracks match your search query.'
                      : 'Save streams with creator channels to organize them here.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-7 max-w-[1800px] pb-16">
                {channelsOverviewData.map((ch) => (
                  <section key={ch.name} className="space-y-2.5">
                    {/* Channel Row Header */}
                    <div className="flex items-center justify-between gap-3 px-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => setScope({ kind: 'channel', channel: ch.name })}
                          className="font-display text-sm font-bold hover:underline truncate text-left inline-flex items-center gap-1.5"
                          style={{ color: 'var(--text-primary)' }}
                          title={`View all streams from ${ch.name}`}
                        >
                          <Tv className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                          <span className="truncate">{ch.name}</span>
                        </button>
                        <span
                          className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-full border shrink-0"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {ch.streams.length} {ch.streams.length === 1 ? 'stream' : 'streams'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onLoadStreamsToGrid(
                              ch.streams.map((s) => s.id),
                              'replace',
                              ch.name
                            )
                          }
                          className="h-7 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] transition-colors whitespace-nowrap"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                          title={`Load "${ch.name}" stack to Live Grid`}
                        >
                          <Play className="w-3 h-3 fill-current" style={{ color: 'var(--accent)' }} />
                          <span>Load Stack</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setScope({ kind: 'channel', channel: ch.name })}
                          className="h-7 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] transition-colors whitespace-nowrap"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-secondary)',
                          }}
                          title={`Open ${ch.name} channel view`}
                        >
                          <span>View All</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Horizontal scrollable carousel: mouse horizontal scroll and touch swipe only */}
                    <div className="overflow-x-auto flex gap-3.5 pb-2.5 pt-0.5 scrollbar-none">
                      {ch.streams.map((item) => {
                        const inGrid = activeIdSet.has(item.id);
                        const isSelected = selectedStreamIds.has(item.id);
                        const isBeingDragged = activeDragStreamIds.has(item.id);

                        return (
                          <div
                            key={item.id}
                            onPointerDown={(e) => handleStreamPointerDown(item.id, e)}
                            className={`w-64 shrink-0 rounded-xl border flex flex-col overflow-hidden transition-all duration-150 ${
                              isBeingDragged ? 'opacity-45 scale-[0.98]' : ''
                            } ${
                              isSelected ? 'ring-2 ring-[var(--accent)]' : ''
                            }`}
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: isSelected
                                ? 'var(--accent)'
                                : inGrid
                                ? 'var(--accent)'
                                : 'var(--border-subtle)',
                            }}
                          >
                            {/* Thumbnail */}
                            <div className="relative aspect-video w-full overflow-hidden bg-[var(--bg-surface-subtle)]">
                              <button
                                type="button"
                                draggable={false}
                                onDragStart={(e) => e.preventDefault()}
                                onClick={() => {
                                  if (shouldSuppressClick()) return;
                                  if (bulkMode) {
                                    toggleSelectStream(item.id);
                                  } else {
                                    setDrawerState({ open: true, mode: 'edit', streamId: item.id });
                                  }
                                }}
                                className="w-full h-full text-left group select-none"
                              >
                                {!brokenThumbs[item.id] ? (
                                  <img
                                    src={item.thumbnailUrl}
                                    alt={item.customLabel || item.title}
                                    draggable={false}
                                    referrerPolicy="no-referrer"
                                    onError={() =>
                                      setBrokenThumbs((prev) => ({ ...prev, [item.id]: true }))
                                    }
                                    className="w-full h-full object-cover pointer-events-none select-none"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] pointer-events-none">
                                    <MonitorPlay className="w-6 h-6" />
                                  </div>
                                )}
                              </button>

                              {/* Bulk checkbox */}
                              {(bulkMode || isSelected) && (
                                <button
                                  type="button"
                                  data-no-stream-drag="true"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSelectStream(item.id);
                                  }}
                                  className="absolute top-2 left-2 w-5 h-5 rounded-md border flex items-center justify-center z-20 shadow-md cursor-pointer transition-transform active:scale-90"
                                  style={{
                                    backgroundColor: isSelected ? 'var(--accent)' : 'var(--bg-surface)',
                                    borderColor: isSelected ? 'var(--accent)' : 'var(--border-strong)',
                                    color: 'var(--accent-fg)',
                                  }}
                                  aria-label="Select stream"
                                >
                                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                </button>
                              )}

                              {inGrid && !bulkMode && !isSelected && (
                                <span
                                  className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-tight pointer-events-none"
                                  style={{
                                    backgroundColor: 'var(--accent)',
                                    color: 'var(--accent-fg)',
                                  }}
                                >
                                  Stacked
                                </span>
                              )}
                            </div>

                            {/* Card Content */}
                            <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                              <div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (shouldSuppressClick()) return;
                                    if (bulkMode) {
                                      toggleSelectStream(item.id);
                                    } else {
                                      setDrawerState({ open: true, mode: 'edit', streamId: item.id });
                                    }
                                  }}
                                  className="text-left w-full"
                                >
                                  <h4 className="text-xs font-semibold leading-snug line-clamp-2">
                                    {item.customLabel || item.title}
                                  </h4>
                                </button>
                                <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                  {item.category || 'General'}
                                </p>
                              </div>

                              <div className="flex items-center justify-between gap-1 pt-1.5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                                <button
                                  type="button"
                                  data-no-stream-drag="true"
                                  onClick={() => onStackStream(item.id)}
                                  className="h-6 px-2 rounded-md border text-[10px] font-semibold inline-flex items-center gap-1 transition-colors"
                                  style={{
                                    backgroundColor: inGrid ? 'var(--accent-soft)' : 'var(--bg-surface-subtle)',
                                    borderColor: inGrid ? 'var(--accent)' : 'var(--border-subtle)',
                                    color: inGrid ? 'var(--accent)' : 'var(--text-primary)',
                                  }}
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                  <span>{inGrid ? 'Layer' : 'Stack'}</span>
                                </button>

                                <button
                                  type="button"
                                  data-no-stream-drag="true"
                                  onClick={() => onUpdateStream(item.id, { favorite: !item.favorite })}
                                  className="h-6 w-6 rounded-md flex items-center justify-center"
                                  style={{ color: item.favorite ? 'var(--warning)' : 'var(--text-muted)' }}
                                  aria-label={item.favorite ? 'Unfavorite' : 'Favorite'}
                                >
                                  <Star className={`w-3 h-3 ${item.favorite ? 'fill-current' : ''}`} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )
          ) : visibleStreams.length === 0 ? (
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
            <div
              ref={gridRef}
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 max-w-[1800px]"
            >
              {visibleStreams.map((item) => {
                const inGrid = activeIdSet.has(item.id);
                const rating = item.rating ?? 0;
                const listens = item.listenCount ?? 0;
                const itemFolders = (item.folderIds ?? [])
                  .map((fid) => folderById.get(fid)?.name)
                  .filter((n): n is string => Boolean(n));
                const isBeingDragged = activeDragStreamIds.has(item.id);
                const reorderTarget =
                  activeDropTarget?.kind === 'stream-reorder' &&
                  activeDropTarget.streamId === item.id
                    ? activeDropTarget
                    : null;
                const isDropTarget = reorderTarget !== null;
                const singleCol = isSingleColumnGrid();

                return (
                  <article
                    key={item.id}
                    data-vault-reorder-id={item.id}
                    data-vault-reorder-axis={singleCol ? 'y' : 'x'}
                    onPointerDown={(e) => handleStreamPointerDown(item.id, e)}
                    className={`relative rounded-xl border flex flex-col transition-all duration-150 ${
                      isBeingDragged ? 'opacity-45 scale-[0.98]' : ''
                    } ${
                      selectedStreamIds.has(item.id) ? 'ring-2 ring-[var(--accent)]' : ''
                    } ${
                      isDropTarget
                        ? 'ring-1 ring-[var(--accent)]/60 ring-offset-1 ring-offset-[var(--bg-canvas)]'
                        : ''
                    }`}
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: isDropTarget
                        ? 'var(--accent)'
                        : selectedStreamIds.has(item.id)
                        ? 'var(--accent)'
                        : inGrid
                        ? 'var(--accent)'
                        : 'var(--border-subtle)',
                    }}
                  >
                    {reorderTarget && (
                      <div
                        aria-hidden="true"
                        className={
                          singleCol
                            ? `pointer-events-none absolute inset-x-2 h-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] z-20 ${
                                reorderTarget.position === 'before'
                                  ? '-top-1.5'
                                  : '-bottom-1.5'
                              }`
                            : `pointer-events-none absolute top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] z-20 ${
                                reorderTarget.position === 'before'
                                  ? '-left-1.5'
                                  : '-right-1.5'
                              }`
                        }
                      />
                    )}

                    <div className="rounded-[11px] overflow-hidden flex-1 flex flex-col">
                    {/* Thumbnail */}
                    <button
                      type="button"
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      onClick={() => {
                        if (shouldSuppressClick()) return;
                        if (bulkMode) {
                          toggleSelectStream(item.id);
                          return;
                        }
                        setDrawerState({ open: true, mode: 'edit', streamId: item.id });
                      }}
                      className="relative aspect-video w-full overflow-hidden text-left group select-none"
                      style={{ backgroundColor: 'var(--bg-surface-subtle)' }}
                    >
                      {!brokenThumbs[item.id] ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.customLabel || item.title}
                          draggable={false}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenThumbs((prev) => ({ ...prev, [item.id]: true }))
                          }
                          className="w-full h-full object-cover pointer-events-none select-none"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center pointer-events-none"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <MonitorPlay className="w-7 h-7" />
                        </div>
                      )}
                      {/* Checkbox for bulk edit */}
                      {(bulkMode || selectedStreamIds.has(item.id)) && (
                        <div
                          role="checkbox"
                          data-no-stream-drag="true"
                          aria-checked={selectedStreamIds.has(item.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectStream(item.id);
                          }}
                          className="absolute top-2 left-2 w-5 h-5 rounded-md border flex items-center justify-center z-20 shadow-md cursor-pointer transition-transform active:scale-90"
                          style={{
                            backgroundColor: selectedStreamIds.has(item.id)
                              ? 'var(--accent)'
                              : 'var(--bg-surface)',
                            borderColor: selectedStreamIds.has(item.id)
                              ? 'var(--accent)'
                              : 'var(--border-strong)',
                            color: 'var(--accent-fg)',
                          }}
                          aria-label="Select stream"
                        >
                          {selectedStreamIds.has(item.id) && (
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          )}
                        </div>
                      )}
                      {inGrid && !bulkMode && !selectedStreamIds.has(item.id) && (
                        <span
                          className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-tight pointer-events-none"
                          style={{
                            backgroundColor: 'var(--accent)',
                            color: 'var(--accent-fg)',
                          }}
                        >
                          Stacked
                        </span>
                      )}
                    </button>

                    {/* Body */}
                    <div className="p-3.5 flex-1 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-1.5 min-w-0 flex-1">
                          {isCustomSort && (
                            <div
                              aria-hidden="true"
                              title="Drag to reorder"
                              className="w-6 h-6 -ml-1 -mt-0.5 flex items-center justify-center rounded-md text-[var(--text-muted)] cursor-grab active:cursor-grabbing shrink-0"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (shouldSuppressClick()) return;
                              if (bulkMode) {
                                toggleSelectStream(item.id);
                                return;
                              }
                              setDrawerState({ open: true, mode: 'edit', streamId: item.id });
                            }}
                            className="text-left min-w-0 flex-1"
                          >
                            <h3 className="text-sm font-medium leading-snug line-clamp-2">
                              {item.customLabel || item.title}
                            </h3>
                          </button>
                        </div>
                        <button
                          type="button"
                          data-no-stream-drag="true"
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
                              data-no-stream-drag="true"
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
                          data-no-stream-drag="true"
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
                        {inGrid ? (
                          <>
                            <button
                              type="button"
                              data-no-stream-drag="true"
                              onClick={() => onToggleStreamInGrid(item.id)}
                              className="h-8 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                              style={{
                                backgroundColor: 'var(--bg-surface-subtle)',
                                borderColor: 'var(--border-subtle)',
                                color: 'var(--text-secondary)',
                              }}
                              title="Remove from Live Stack"
                            >
                              <Check className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                              <span>Stacked</span>
                            </button>
                            <button
                              type="button"
                              data-no-stream-drag="true"
                              onClick={() => onStackStream(item.id)}
                              className="flex-1 h-8 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                              style={{
                                backgroundColor: 'var(--accent-soft)',
                                borderColor: 'var(--accent)',
                                color: 'var(--accent)',
                              }}
                              title="Add another independent layer to stack"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Layer</span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            data-no-stream-drag="true"
                            onClick={() => onStackStream(item.id)}
                            className="flex-1 h-8 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap hover:bg-[var(--bg-surface-hover)]"
                            style={{
                              backgroundColor: 'var(--bg-surface-subtle)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Stack</span>
                          </button>
                        )}

                        <button
                          type="button"
                          data-no-stream-drag="true"
                          onClick={() =>
                            setDrawerState({ open: true, mode: 'edit', streamId: item.id })
                          }
                          className="h-8 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap hover:bg-[var(--bg-surface-hover)]"
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
                      const isBeingDragged = activeDragStreamIds.has(item.id);
                      const reorderTarget =
                        activeDropTarget?.kind === 'stream-reorder' &&
                        activeDropTarget.streamId === item.id
                          ? activeDropTarget
                          : null;
                      const rowDropShadow = reorderTarget
                        ? reorderTarget.position === 'before'
                          ? 'inset 0 2.5px 0 var(--accent)'
                          : 'inset 0 -2.5px 0 var(--accent)'
                        : undefined;

                      return (
                        <tr
                          key={item.id}
                          data-vault-reorder-id={item.id}
                          data-vault-reorder-axis="y"
                          onPointerDown={(e) => handleStreamPointerDown(item.id, e)}
                          className={`transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] ${
                            isBeingDragged ? 'opacity-45' : ''
                          }`}
                          style={{
                            borderColor: 'var(--border-subtle)',
                            backgroundColor: selectedStreamIds.has(item.id)
                              ? 'var(--accent-soft)'
                              : undefined,
                          }}
                        >
                          <td
                            className="py-2 pl-3.5 pr-3 max-w-[300px]"
                            style={{ boxShadow: rowDropShadow }}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {/* Checkbox for bulk edit */}
                              {(bulkMode || selectedStreamIds.has(item.id)) && (
                                <button
                                  type="button"
                                  data-no-stream-drag="true"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSelectStream(item.id);
                                  }}
                                  className="w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer shadow-sm transition-transform active:scale-90"
                                  style={{
                                    backgroundColor: selectedStreamIds.has(item.id)
                                      ? 'var(--accent)'
                                      : 'var(--bg-surface)',
                                    borderColor: selectedStreamIds.has(item.id)
                                      ? 'var(--accent)'
                                      : 'var(--border-strong)',
                                    color: 'var(--accent-fg)',
                                  }}
                                  aria-label="Select stream"
                                >
                                  {selectedStreamIds.has(item.id) && (
                                    <Check className="w-3 h-3 stroke-[3]" />
                                  )}
                                </button>
                              )}
                              {isCustomSort && (
                                <div
                                  aria-hidden="true"
                                  title="Drag to reorder"
                                  className="w-6 h-6 -ml-1 flex items-center justify-center rounded-md text-[var(--text-muted)] cursor-grab active:cursor-grabbing shrink-0"
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </div>
                              )}
                              <button
                                type="button"
                                draggable={false}
                                onDragStart={(e) => e.preventDefault()}
                                onClick={() => {
                                  if (shouldSuppressClick()) return;
                                  if (bulkMode) {
                                    toggleSelectStream(item.id);
                                    return;
                                  }
                                  setDrawerState({
                                    open: true,
                                    mode: 'edit',
                                    streamId: item.id,
                                  });
                                }}
                                className="w-14 h-8 rounded overflow-hidden shrink-0 border select-none"
                                style={{
                                  backgroundColor: 'var(--bg-surface-subtle)',
                                  borderColor: 'var(--border-subtle)',
                                }}
                              >
                                {!brokenThumbs[item.id] ? (
                                  <img
                                    src={item.thumbnailUrl}
                                    alt={item.customLabel || item.title}
                                    draggable={false}
                                    referrerPolicy="no-referrer"
                                    onError={() =>
                                      setBrokenThumbs((prev) => ({
                                        ...prev,
                                        [item.id]: true,
                                      }))
                                    }
                                    className="w-full h-full object-cover pointer-events-none select-none"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center pointer-events-none">
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
                                  onClick={() => {
                                    if (shouldSuppressClick()) return;
                                    if (bulkMode) {
                                      toggleSelectStream(item.id);
                                      return;
                                    }
                                    setDrawerState({
                                      open: true,
                                      mode: 'edit',
                                      streamId: item.id,
                                    });
                                  }}
                                  className="text-xs font-semibold truncate block max-w-full text-left"
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

                          <td
                            className="py-2 px-3 text-xs whitespace-nowrap"
                            style={{ boxShadow: rowDropShadow }}
                          >
                            <button
                              type="button"
                              data-no-stream-drag="true"
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

                          <td
                            className="py-2 px-3 text-xs max-w-[200px]"
                            style={{ boxShadow: rowDropShadow }}
                          >
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

                          <td
                            className="py-2 px-3 text-xs hidden xl:table-cell max-w-[160px]"
                            style={{ boxShadow: rowDropShadow }}
                          >
                            <div className="truncate" style={{ color: 'var(--text-muted)' }}>
                              {itemFolders.length > 0 ? itemFolders.join(', ') : '—'}
                            </div>
                          </td>

                          <td
                            className="py-2 px-3 whitespace-nowrap"
                            style={{ boxShadow: rowDropShadow }}
                          >
                            <div className="inline-flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  data-no-stream-drag="true"
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

                          <td
                            className="py-2 px-3 text-right whitespace-nowrap"
                            style={{ boxShadow: rowDropShadow }}
                          >
                            <button
                              type="button"
                              data-no-stream-drag="true"
                              onClick={() => onIncrementListen(item.id)}
                              className="text-xs font-mono tabular-nums inline-flex items-center gap-1 hover:opacity-80"
                              style={{ color: 'var(--text-secondary)' }}
                              title="Log +1 listen"
                            >
                              <span>{listens}</span>
                              <Plus className="w-3 h-3 opacity-60" />
                            </button>
                          </td>

                          <td
                            className="py-2 pl-3 pr-3.5 text-right whitespace-nowrap"
                            style={{ boxShadow: rowDropShadow }}
                          >
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                data-no-stream-drag="true"
                                onClick={() => onStackStream(item.id)}
                                className="h-7 px-2.5 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                                style={{
                                  backgroundColor: inGrid
                                    ? 'var(--accent-soft)'
                                    : 'var(--bg-surface-subtle)',
                                  borderColor: inGrid ? 'var(--accent)' : 'var(--border-subtle)',
                                  color: inGrid ? 'var(--accent)' : 'var(--text-primary)',
                                }}
                                title={
                                  inGrid
                                    ? 'Add another layer to stack'
                                    : 'Add stream to stack'
                                }
                              >
                                <Plus className="w-3 h-3" />
                                <span>{inGrid ? 'Layer' : 'Stack'}</span>
                              </button>
                              <button
                                type="button"
                                data-no-stream-drag="true"
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
                                data-no-stream-drag="true"
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

        {/* Floating Folder & "More" Drag-and-Drop Dock */}
        <FloatingStreamFolderDropDock
          visible={isDraggingStreams}
          folders={folders}
          memberFolderIds={trayMemberFolderIds}
          dockScrollRef={dockScrollRef}
          activePointerDropTarget={activeDropTarget}
        />
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
                <span>Back to Live Grid</span>
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

      {/* Floating Bottom Action Bar for Bulk Edit */}
      {bulkMode && selectedStreamIds.size > 0 && !isDraggingStreams && (
        <StreamVaultBulkBar
          selectedCount={selectedStreamIds.size}
          totalVisibleCount={visibleStreams.length}
          onSelectAll={() => setSelectedStreamIds(new Set(visibleStreams.map((s) => s.id)))}
          onClearSelection={() => setSelectedStreamIds(new Set())}
          onOpenBulkTopic={() => setBulkModalType('topic')}
          onOpenBulkTags={() => setBulkModalType('tags')}
          onOpenBulkFolders={() => setBulkModalType('folders')}
          onBulkFavorite={handleBulkFavorite}
          onOpenBulkRating={() => setBulkModalType('rating')}
          onBulkLoadToGrid={handleBulkLoadToGrid}
          onBulkDelete={() => setBulkModalType('delete')}
          onCloseBulkMode={() => {
            setBulkMode(false);
            setSelectedStreamIds(new Set());
          }}
        />
      )}

      {/* Bulk Edit Modal */}
      <StreamVaultBulkModal
        type={bulkModalType}
        selectedCount={selectedStreamIds.size}
        folders={folders}
        existingTopics={existingTopics}
        existingTags={existingTags}
        onClose={() => setBulkModalType(null)}
        onApplyTopic={handleBulkApplyTopic}
        onApplyTags={handleBulkApplyTags}
        onApplyFolders={handleBulkApplyFolders}
        onApplyRating={handleBulkApplyRating}
        onConfirmDelete={handleBulkConfirmDelete}
      />

      {/* Folder Drop Add/Move/Remove Modal */}
      <StreamFolderDropActionModal
        pendingDrop={pendingFolderDrop}
        onAdd={handleConfirmDropAdd}
        onMove={handleConfirmDropMove}
        onRemove={handleConfirmDropRemove}
        onCancel={() => setPendingFolderDrop(null)}
      />

      {/* "More" Folder Picker Modal */}
      <StreamFolderPickerModal
        streamIds={folderPickerStreamIds}
        streams={streams}
        folders={folders}
        onAddFolder={(name, parentId) => onAddFolder(name, parentId ?? null)}
        onApply={handleApplyFolderPicker}
        onClose={() => setFolderPickerStreamIds(null)}
      />

      {renderDragPreview()}
    </div>
  );
};
