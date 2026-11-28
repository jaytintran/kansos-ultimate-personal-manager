import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  Columns2,
  Folder,
  FolderOpen,
  FolderPlus,
  GalleryHorizontal,
  GripVertical,
  Hash,
  Headphones,
  Layers,
  LayoutGrid,
  List,
  Menu,
  MonitorPlay,
  MoreHorizontal,
  Palette,
  Pause,
  Pencil,
  Pin,
  Play,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Smile,
  Star,
  Tag,
  Trash2,
  Tv,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useVaultChannelDrag } from '../../hooks/useVaultChannelDrag';
import { useVaultStreamDrag } from '../../hooks/useVaultStreamDrag';
import { StreamChannelMeta, StreamFolder, StreamItem } from '../../types';
import { VIEW_PREFERENCE_SYNC_EVENT } from '../../utils/viewPreferences';
import { DynamicIcon } from '../IconLibrary';
import { FloatingStreamFolderDropDock } from './FloatingStreamFolderDropDock';
import {
  ChannelBatchEditModal,
  ChannelDeleteModal,
  ChannelRenameMergeModal,
  ChannelSettingsModal,
  PendingChannelMerge,
} from './StreamChannelsModals';
import {
  ChannelsSortMode,
  ChannelsViewMode,
  ChannelSummaryEntry,
  StreamChannelsOverview,
} from './StreamChannelsOverview';
import { StreamEditorDrawer } from './StreamEditorDrawer';
import { StreamFolderAddStreamsModal } from './StreamFolderAddStreamsModal';
import {
  PendingStreamFolderDrop,
  StreamFolderDropActionModal,
  StreamFolderPickerModal,
} from './StreamFolderDropModal';
import { StreamFolderEditModal } from './StreamFolderEditModal';
import { StreamTopicIconModal } from './StreamTopicIconModal';
import { StreamVaultBulkBar } from './StreamVaultBulkBar';
import { BulkModalType, StreamVaultBulkModal } from './StreamVaultBulkModal';
import {
  StreamVaultControlsSheet,
  StreamVaultScopeActionsSheet,
  VaultCardDensity,
  VaultGridStatusFilter,
  VaultGroupByMode,
  VaultMinRatingFilter,
  VaultSortMode,
  VaultViewMode,
} from './StreamVaultControlsSheet';
import {
  compareStreamFolders,
  getDescendantFolderIds,
  StreamVaultSidebar,
  VaultScope,
} from './StreamVaultSidebar';

const VAULT_SORT_PREFS_KEY = 'kanso_streamer_vault_sort_v1';
const VAULT_DENSITY_PREFS_KEY = 'kanso_streamer_vault_density_v1';
const CHANNELS_PREFS_KEY = 'kanso_streamer_channels_prefs_v1';

const VALID_CHANNELS_VIEWS: ChannelsViewMode[] = ['carousels', 'directory', 'split'];
const VALID_CHANNELS_SORTS: ChannelsSortMode[] = [
  'custom',
  'count-desc',
  'count-asc',
  'listens',
  'recent',
  'title-asc',
  'title-desc',
];

function loadChannelsPrefs(): { viewMode: ChannelsViewMode; sortBy: ChannelsSortMode } {
  try {
    const raw = localStorage.getItem(CHANNELS_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<{
        viewMode: ChannelsViewMode;
        sortBy: ChannelsSortMode;
      }>;
      return {
        viewMode:
          parsed.viewMode && VALID_CHANNELS_VIEWS.includes(parsed.viewMode)
            ? parsed.viewMode
            : 'carousels',
        sortBy:
          parsed.sortBy && VALID_CHANNELS_SORTS.includes(parsed.sortBy)
            ? parsed.sortBy
            : 'count-desc',
      };
    }
  } catch {
    // Ignore storage errors
  }
  return { viewMode: 'carousels', sortBy: 'count-desc' };
}

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
  onClearStack?: () => void;
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
  onReorderFolders?: (
    draggedId: string,
    targetId: string,
    position: 'before' | 'after' | 'inside',
  ) => void;
  onDeleteFolder: (id: string) => void;
  topicIcons?: Record<string, string>;
  topicOrder?: string[];
  onSetTopicIcon?: (topic: string, icon: string | undefined) => void;
  onRenameTopic?: (fromTopic: string, targetTopic: string) => number;
  onReorderTopics?: (orderedTopics: string[]) => void;
  onResetTopicOrder?: () => void;
  channelConfigs?: Record<string, StreamChannelMeta>;
  onUpdateChannelMeta?: (channelName: string, patch: Partial<StreamChannelMeta>) => void;
  onReorderChannels?: (orderedChannelNames: string[]) => void;
  onRenameOrMergeChannels?: (fromNames: string[], targetName: string) => number;
  onBatchUpdateChannels?: (
    channelNames: string[],
    update: { topic?: string; tags?: string[]; tagsMode?: 'append' | 'replace' },
  ) => number;
  onDeleteChannels?: (channelNames: string[]) => number;
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
  onClearStack,
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
  onReorderFolders,
  onDeleteFolder,
  topicIcons = {},
  topicOrder = [],
  onSetTopicIcon,
  onRenameTopic,
  onReorderTopics,
  onResetTopicOrder,
  channelConfigs = {},
  onUpdateChannelMeta,
  onReorderChannels,
  onRenameOrMergeChannels,
  onBatchUpdateChannels,
  onDeleteChannels,
  onNotify,
}) => {
  const [scope, setScope] = useState<VaultScope>({ kind: 'all' });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<VaultViewMode>('grid');
  const [cardDensity, setCardDensity] = useState<VaultCardDensity>(() => {
    try {
      const saved = localStorage.getItem(VAULT_DENSITY_PREFS_KEY);
      if (saved === 'compact' || saved === 'standard') return saved;
    } catch {
      // Ignore storage errors
    }
    return 'standard';
  });
  const [groupBy, setGroupBy] = useState<VaultGroupByMode>('none');
  const [minRating, setMinRating] = useState<VaultMinRatingFilter>(0);
  const [gridStatusFilter, setGridStatusFilter] = useState<VaultGridStatusFilter>('all');
  const [untaggedOnly, setUntaggedOnly] = useState(false);
  const [pinnedOnlyChannels, setPinnedOnlyChannels] = useState(false);
  const [collapseUnpinnedChannels, setCollapseUnpinnedChannels] = useState(false);
  const [channelsViewMode, setChannelsViewMode] = useState<ChannelsViewMode>(
    () => loadChannelsPrefs().viewMode,
  );
  const [channelSortBy, setChannelSortBy] = useState<ChannelsSortMode>(
    () => loadChannelsPrefs().sortBy,
  );
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
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [mobileScopeActionsOpen, setMobileScopeActionsOpen] = useState(false);
  const [openToolbarPopover, setOpenToolbarPopover] = useState<
    'sort' | 'filters' | 'group' | null
  >(null);
  const toolbarPopoverRef = useRef<HTMLDivElement | null>(null);
  const [confirmClearStackDesktop, setConfirmClearStackDesktop] = useState(false);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  // Bulk edit state (streams & channels)
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedStreamIds, setSelectedStreamIds] = useState<Set<string>>(new Set());
  const [bulkModalType, setBulkModalType] = useState<BulkModalType>(null);
  const [channelBulkMode, setChannelBulkMode] = useState(false);
  const [selectedChannelNames, setSelectedChannelNames] = useState<Set<string>>(new Set());

  // Channel management modals & inline single-channel rename state
  const [channelSettingsTarget, setChannelSettingsTarget] = useState<string | null>(null);
  const [pendingChannelMerge, setPendingChannelMerge] =
    useState<PendingChannelMerge | null>(null);
  const [channelBatchTargets, setChannelBatchTargets] = useState<string[] | null>(null);
  const [channelDeleteTargets, setChannelDeleteTargets] = useState<
    { name: string; count: number }[] | null
  >(null);
  const [renamingSingleChannel, setRenamingSingleChannel] = useState(false);
  const [singleChannelRenameDraft, setSingleChannelRenameDraft] = useState('');

  // Folder canvas inline subfolder + add streams state
  const [creatingSubfolder, setCreatingSubfolder] = useState(false);
  const [subfolderDraft, setSubfolderDraft] = useState('');
  const [addingStreamsToFolderId, setAddingStreamsToFolderId] = useState<string | null>(null);

  // Topic canvas inline rename & icon picker state
  const [renamingTopic, setRenamingTopic] = useState(false);
  const [topicRenameDraft, setTopicRenameDraft] = useState('');
  const [topicIconModalTarget, setTopicIconModalTarget] = useState<string | null>(null);

  const toggleSelectStream = (streamId: string) => {
    setSelectedStreamIds((prev) => {
      const next = new Set(prev);
      if (next.has(streamId)) next.delete(streamId);
      else next.add(streamId);
      return next;
    });
  };

  const toggleSelectChannel = (channelName: string) => {
    setSelectedChannelNames((prev) => {
      const next = new Set(prev);
      if (next.has(channelName)) next.delete(channelName);
      else next.add(channelName);
      return next;
    });
  };

  // Drag-and-drop scroll containers & folder drop modals
  const gridRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const splitListScrollRef = useRef<HTMLDivElement | null>(null);
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  const dockScrollRef = useRef<HTMLDivElement | null>(null);
  const [pendingFolderDrop, setPendingFolderDrop] =
    useState<PendingStreamFolderDrop | null>(null);
  const [folderPickerStreamIds, setFolderPickerStreamIds] =
    useState<string[] | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);

  useEffect(() => {
    setRenamingSingleChannel(false);
    setSingleChannelRenameDraft('');
    setRenamingTopic(false);
    setTopicRenameDraft('');
    setCreatingSubfolder(false);
    setSubfolderDraft('');
    setConfirmClearStackDesktop(false);
    setOpenToolbarPopover(null);
    if (scope.kind !== 'channels') {
      setChannelBulkMode(false);
      setSelectedChannelNames(new Set());
    }
  }, [scope]);

  useEffect(() => {
    if (!openToolbarPopover) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        toolbarPopoverRef.current &&
        !toolbarPopoverRef.current.contains(e.target as Node)
      ) {
        setOpenToolbarPopover(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenToolbarPopover(null);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('touchstart', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [openToolbarPopover]);

  useEffect(() => {
    try {
      localStorage.setItem(VAULT_SORT_PREFS_KEY, sortBy);
    } catch {
      // Ignore storage errors
    }
  }, [sortBy]);

  useEffect(() => {
    try {
      localStorage.setItem(VAULT_DENSITY_PREFS_KEY, cardDensity);
    } catch {
      // Ignore storage errors
    }
  }, [cardDensity]);

  useEffect(() => {
    try {
      localStorage.setItem(
        CHANNELS_PREFS_KEY,
        JSON.stringify({ viewMode: channelsViewMode, sortBy: channelSortBy }),
      );
    } catch {
      // Ignore storage errors
    }
  }, [channelsViewMode, channelSortBy]);

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
        const chPrefs = loadChannelsPrefs();
        setChannelsViewMode(chPrefs.viewMode);
        setChannelSortBy(chPrefs.sortBy);
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
    | { open: false }
    | { open: true; mode: 'create'; defaultChannel?: string; defaultTopic?: string }
    | { open: true; mode: 'edit'; streamId: string }
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
          description: 'Manage, sort, pin, and browse creator channels.',
          canBatchLoad: false,
        };
      case 'channel': {
        const chMeta = channelConfigs[scope.channel];
        return {
          breadcrumb: `Vault / Channels / ${scope.channel}`,
          title: scope.channel,
          icon: chMeta?.icon,
          color: chMeta?.color,
          description: `Saved catalog from creator ${scope.channel}.`,
          canBatchLoad: true,
        };
      }
    }
  }, [scope, folderById, topicIcons, channelConfigs]);

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

  const isCustomSort = sortBy === 'custom' && !(scope.kind === 'all' && groupBy !== 'none');
  const isCustomChannelSort = channelSortBy === 'custom';

  const compareChannelEntries = useCallback(
    (
      a: {
        name: string;
        count: number;
        totalListens: number;
        latestAddedAt: string;
        meta: StreamChannelMeta;
      },
      b: {
        name: string;
        count: number;
        totalListens: number;
        latestAddedAt: string;
        meta: StreamChannelMeta;
      },
    ) => {
      const aPinned = a.meta.pinned ? 1 : 0;
      const bPinned = b.meta.pinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      switch (channelSortBy) {
        case 'custom': {
          const aOrder =
            typeof a.meta.sortOrder === 'number' && Number.isFinite(a.meta.sortOrder)
              ? a.meta.sortOrder
              : null;
          const bOrder =
            typeof b.meta.sortOrder === 'number' && Number.isFinite(b.meta.sortOrder)
              ? b.meta.sortOrder
              : null;
          if (aOrder !== null && bOrder !== null && aOrder !== bOrder) {
            return aOrder - bOrder;
          }
          if (aOrder !== null && bOrder === null) return -1;
          if (aOrder === null && bOrder !== null) return 1;
          return b.count - a.count || a.name.localeCompare(b.name);
        }
        case 'count-asc':
          return a.count - b.count || a.name.localeCompare(b.name);
        case 'listens':
          return (
            b.totalListens - a.totalListens ||
            b.count - a.count ||
            a.name.localeCompare(b.name)
          );
        case 'recent':
          return (
            b.latestAddedAt.localeCompare(a.latestAddedAt) ||
            a.name.localeCompare(b.name)
          );
        case 'title-asc':
          return a.name.localeCompare(b.name);
        case 'title-desc':
          return b.name.localeCompare(a.name);
        case 'count-desc':
        default:
          return b.count - a.count || a.name.localeCompare(b.name);
      }
    },
    [channelSortBy],
  );

  // Canonical directory of all exact case-sensitive channels (unfiltered) for duplicate/merge & ordering
  const allChannelsDirectory = useMemo(() => {
    const map = new Map<string, StreamItem[]>();
    for (const s of streams) {
      const ch = s.channel.trim() || 'Unknown Channel';
      const list = map.get(ch) || [];
      list.push(s);
      map.set(ch, list);
    }

    const entries = Array.from(map.entries()).map(([name, chStreams]) => {
      let totalListens = 0;
      let latestAddedAt = '';
      for (const s of chStreams) {
        totalListens += s.listenCount ?? 0;
        if (s.addedAt > latestAddedAt) latestAddedAt = s.addedAt;
      }
      return {
        name,
        allStreams: chStreams,
        count: chStreams.length,
        totalListens,
        latestAddedAt,
        meta: channelConfigs[name] ?? {},
      };
    });

    entries.sort(compareChannelEntries);
    return entries;
  }, [streams, channelConfigs, compareChannelEntries]);

  // Channels overview data when scope.kind === 'channels'
  const channelsOverviewData = useMemo<ChannelSummaryEntry[]>(() => {
    if (scope.kind !== 'channels') return [];
    const q = searchQuery.trim().toLowerCase();

    const result: ChannelSummaryEntry[] = [];

    for (const entry of allChannelsDirectory) {
      if (pinnedOnlyChannels && !entry.meta.pinned) continue;
      const channelMatchesQuery = q && entry.name.toLowerCase().includes(q);

      const filtered = entry.allStreams.filter((s) => {
        if (minRating > 0 && (s.rating ?? 0) < minRating) return false;
        if (gridStatusFilter === 'stacked' && !activeIdSet.has(s.id)) return false;
        if (gridStatusFilter === 'unstacked' && activeIdSet.has(s.id)) return false;
        if (untaggedOnly && s.tags.some((t) => t.trim().length > 0)) return false;
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
              return (
                (b.listenCount ?? 0) - (a.listenCount ?? 0) ||
                b.addedAt.localeCompare(a.addedAt)
              );
            case 'rating':
              return (
                (b.rating ?? 0) - (a.rating ?? 0) ||
                (b.listenCount ?? 0) - (a.listenCount ?? 0)
              );
            case 'title':
              return (a.customLabel || a.title).localeCompare(b.customLabel || b.title);
            case 'channel':
              return (a.channel || 'zzz').localeCompare(b.channel || 'zzz');
            case 'recent':
            default:
              return b.addedAt.localeCompare(a.addedAt);
          }
        });

        let totalListens = 0;
        let latestAddedAt = '';
        const favTopIds: string[] = [];
        for (const s of sorted) {
          totalListens += s.listenCount ?? 0;
          if (s.addedAt > latestAddedAt) latestAddedAt = s.addedAt;
          if (s.favorite || (s.rating ?? 0) >= 4) {
            favTopIds.push(s.id);
          }
        }

        result.push({
          name: entry.name,
          streams: sorted,
          totalListens,
          latestAddedAt,
          favTopIds,
          previewThumbnails: sorted
            .slice(0, 4)
            .map((s) => ({ id: s.id, url: s.thumbnailUrl })),
          meta: entry.meta,
        });
      }
    }

    result.sort((a, b) =>
      compareChannelEntries(
        {
          name: a.name,
          count: a.streams.length,
          totalListens: a.totalListens,
          latestAddedAt: a.latestAddedAt,
          meta: a.meta,
        },
        {
          name: b.name,
          count: b.streams.length,
          totalListens: b.totalListens,
          latestAddedAt: b.latestAddedAt,
          meta: b.meta,
        },
      ),
    );
    return result;
  }, [
    scope,
    allChannelsDirectory,
    searchQuery,
    selectedTags,
    minRating,
    gridStatusFilter,
    untaggedOnly,
    pinnedOnlyChannels,
    activeIdSet,
    sortBy,
    customStreamOrderCompare,
    compareChannelEntries,
  ]);

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

      if (minRating > 0 && (s.rating ?? 0) < minRating) return false;
      if (scope.kind !== 'in-grid') {
        if (gridStatusFilter === 'stacked' && !activeIdSet.has(s.id)) return false;
        if (gridStatusFilter === 'unstacked' && activeIdSet.has(s.id)) return false;
      }
      if (untaggedOnly && s.tags.some((t) => t.trim().length > 0)) return false;

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
  }, [
    streams,
    scope,
    folders,
    activeIdSet,
    selectedTags,
    minRating,
    gridStatusFilter,
    untaggedOnly,
    searchQuery,
    sortBy,
    customStreamOrderCompare,
    channelsOverviewData,
  ]);

  const currentFolder = useMemo(
    () => (scope.kind === 'folder' ? folderById.get(scope.folderId) ?? null : null),
    [scope, folderById],
  );

  const childFoldersInScope = useMemo(() => {
    if (scope.kind !== 'folder') return [];
    return folders
      .filter((f) => f.parentId === scope.folderId)
      .sort(compareStreamFolders);
  }, [scope, folders]);

  const folderStreamCountsMap = useMemo(() => {
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

  const groupedVisibleStreams = useMemo(() => {
    if (scope.kind !== 'all' || groupBy === 'none') return null;
    const map = new Map<string, StreamItem[]>();
    for (const s of visibleStreams) {
      const key =
        groupBy === 'topic'
          ? s.category.trim() || 'Uncategorized'
          : s.channel.trim() || 'Unknown Channel';
      const list = map.get(key) || [];
      list.push(s);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  }, [scope.kind, groupBy, visibleStreams]);

  const activeSecondaryFilterCount =
    selectedTags.length +
    (minRating > 0 ? 1 : 0) +
    (scope.kind !== 'in-grid' && gridStatusFilter !== 'all' ? 1 : 0) +
    (untaggedOnly ? 1 : 0) +
    (scope.kind === 'channels' && pinnedOnlyChannels ? 1 : 0);

  const resetSecondaryFilters = useCallback(() => {
    setSelectedTags([]);
    setMinRating(0);
    setGridStatusFilter('all');
    setUntaggedOnly(false);
    setPinnedOnlyChannels(false);
  }, []);

  const handleCommitTopicRename = useCallback(
    (fromTopic: string, rawTarget: string) => {
      const target = rawTarget.trim() || 'Uncategorized';
      setRenamingTopic(false);
      if (target === fromTopic) return;
      if (onRenameTopic) {
        const count = onRenameTopic(fromTopic, target);
        setScope({ kind: 'topic', topic: target });
        onNotify(
          `Renamed topic to “${target}” (${count} ${count === 1 ? 'stream' : 'streams'})`,
          'success',
        );
      }
    },
    [onRenameTopic, onNotify],
  );

  const handleCreateSubfolderInline = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (scope.kind !== 'folder') return;
      const trimmed = subfolderDraft.trim();
      if (!trimmed) {
        setCreatingSubfolder(false);
        return;
      }
      const created = onAddFolder(trimmed, scope.folderId);
      setSubfolderDraft('');
      setCreatingSubfolder(false);
      onNotify(`Created subfolder “${created.name}”`, 'success');
    },
    [scope, subfolderDraft, onAddFolder, onNotify],
  );

  const handleAddExistingStreamsToFolder = useCallback(
    (folderId: string, streamIds: string[]) => {
      if (streamIds.length === 0) return;
      const targetSet = new Set(streamIds);
      for (const s of streams) {
        if (!targetSet.has(s.id)) continue;
        const nextFolders = Array.from(new Set([...(s.folderIds ?? []), folderId]));
        onUpdateStream(s.id, { folderIds: nextFolders });
      }
      const folderName = folderById.get(folderId)?.name || 'folder';
      onNotify(
        `Added ${streamIds.length} ${streamIds.length === 1 ? 'stream' : 'streams'} to “${folderName}”`,
        'success',
      );
    },
    [streams, onUpdateStream, folderById, onNotify],
  );

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

  const anyChannelModalOpen = Boolean(
    channelSettingsTarget ||
      pendingChannelMerge ||
      channelBatchTargets ||
      channelDeleteTargets,
  );

  const handleReorderChannels = useCallback(
    (draggedName: string, targetName: string, position: 'before' | 'after') => {
      if (!onReorderChannels || !draggedName || !targetName || draggedName === targetName) {
        return;
      }
      const orderedNames = allChannelsDirectory.map((c) => c.name);
      if (!orderedNames.includes(draggedName) || !orderedNames.includes(targetName)) {
        return;
      }
      const remaining = orderedNames.filter((n) => n !== draggedName);
      const targetIdx = remaining.indexOf(targetName);
      if (targetIdx === -1) return;
      const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
      const nextOrder = [
        ...remaining.slice(0, insertIdx),
        draggedName,
        ...remaining.slice(insertIdx),
      ];
      if (nextOrder.every((n, i) => n === orderedNames[i])) return;
      onReorderChannels(nextOrder);
    },
    [allChannelsDirectory, onReorderChannels],
  );

  const {
    isDraggingChannel,
    draggingChannelName,
    activeChannelDropTarget,
    handleChannelPointerDown,
    shouldSuppressChannelClick,
    renderChannelDragPreview,
  } = useVaultChannelDrag({
    enabled:
      isActiveView &&
      scope.kind === 'channels' &&
      isCustomChannelSort &&
      !drawerState.open &&
      !bulkModalType &&
      !pendingFolderDrop &&
      !folderPickerStreamIds &&
      !editingFolderId &&
      !addingStreamsToFolderId &&
      !topicIconModalTarget &&
      !mobileControlsOpen &&
      !mobileScopeActionsOpen &&
      !anyChannelModalOpen,
    scrollContainerRef: mainScrollRef,
    secondaryScrollRef: splitListScrollRef,
    onReorderChannels: handleReorderChannels,
  });

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
      !isDraggingChannel &&
      !drawerState.open &&
      !bulkModalType &&
      !pendingFolderDrop &&
      !folderPickerStreamIds &&
      !editingFolderId &&
      !addingStreamsToFolderId &&
      !topicIconModalTarget &&
      !mobileControlsOpen &&
      !mobileScopeActionsOpen &&
      !anyChannelModalOpen,
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

  const handleTogglePinChannel = useCallback(
    (channelName: string) => {
      if (!onUpdateChannelMeta) return;
      const nextPinned = !channelConfigs[channelName]?.pinned;
      onUpdateChannelMeta(channelName, { pinned: nextPinned });
      onNotify(
        nextPinned ? `Pinned “${channelName}” to top` : `Unpinned “${channelName}”`,
        'success',
      );
    },
    [channelConfigs, onUpdateChannelMeta, onNotify],
  );

  const executeRenameOrMergeChannels = useCallback(
    (fromNames: string[], targetName: string) => {
      if (!onRenameOrMergeChannels) return;
      const resolvedTarget = targetName.trim() || 'Unknown Channel';
      const updatedCount = onRenameOrMergeChannels(fromNames, resolvedTarget);
      if (scope.kind === 'channel' && fromNames.includes(scope.channel)) {
        setScope({ kind: 'channel', channel: resolvedTarget });
      }
      setSelectedChannelNames((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const f of fromNames) next.delete(f);
        return next;
      });
      setChannelBulkMode(false);
      onNotify(
        fromNames.length > 1
          ? `Merged ${fromNames.length} channels (${updatedCount} ${updatedCount === 1 ? 'stream' : 'streams'}) into “${resolvedTarget}”`
          : `Updated “${resolvedTarget}” (${updatedCount} ${updatedCount === 1 ? 'stream' : 'streams'})`,
        'success',
      );
    },
    [onRenameOrMergeChannels, scope, onNotify],
  );

  const handleRequestRenameChannel = useCallback(
    (fromName: string, rawTargetName: string) => {
      const targetName = rawTargetName.trim() || 'Unknown Channel';
      if (targetName === fromName) return;
      const sourceEntry = allChannelsDirectory.find((c) => c.name === fromName);
      const existingTarget = allChannelsDirectory.find((c) => c.name === targetName);
      if (existingTarget) {
        setPendingChannelMerge({
          mode: 'confirm-rename-merge',
          sourceChannels: [{ name: fromName, count: sourceEntry?.count ?? 0 }],
          suggestedTargetName: targetName,
          targetExistingCount: existingTarget.count,
        });
        return;
      }
      executeRenameOrMergeChannels([fromName], targetName);
    },
    [allChannelsDirectory, executeRenameOrMergeChannels],
  );

  const handleBatchUpdateChannelsApply = useCallback(
    (
      channelNames: string[],
      update: { topic?: string; tags?: string[]; tagsMode?: 'append' | 'replace' },
    ) => {
      if (!onBatchUpdateChannels) return;
      const count = onBatchUpdateChannels(channelNames, update);
      setSelectedChannelNames(new Set());
      setChannelBulkMode(false);
      onNotify(
        `Updated ${count} ${count === 1 ? 'stream' : 'streams'} across ${channelNames.length} ${channelNames.length === 1 ? 'channel' : 'channels'}`,
        'success',
      );
    },
    [onBatchUpdateChannels, onNotify],
  );

  const handleDeleteChannelsConfirm = useCallback(
    (channelNames: string[]) => {
      if (!onDeleteChannels) return;
      const removed = onDeleteChannels(channelNames);
      if (scope.kind === 'channel' && channelNames.includes(scope.channel)) {
        setScope({ kind: 'channels' });
      }
      setSelectedChannelNames(new Set());
      setChannelBulkMode(false);
      onNotify(
        `Deleted ${channelNames.length} ${channelNames.length === 1 ? 'channel' : 'channels'} (${removed} ${removed === 1 ? 'stream' : 'streams'})`,
        'success',
      );
    },
    [onDeleteChannels, scope, onNotify],
  );

  const singleChannelFavTopIds = useMemo(() => {
    if (scope.kind !== 'channel') return [];
    return visibleStreams
      .filter((s) => s.favorite || (s.rating ?? 0) >= 4)
      .map((s) => s.id);
  }, [scope.kind, visibleStreams]);

  const channelBatchAffectedCount = useMemo(() => {
    if (!channelBatchTargets || channelBatchTargets.length === 0) return 0;
    const set = new Set(channelBatchTargets);
    return streams.filter((s) => set.has(s.channel.trim() || 'Unknown Channel')).length;
  }, [channelBatchTargets, streams]);

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

  const isAnyBulkBarOpen =
    (scope.kind !== 'channels' &&
      bulkMode &&
      selectedStreamIds.size > 0 &&
      !isDraggingStreams) ||
    (scope.kind === 'channels' &&
      channelBulkMode &&
      selectedChannelNames.size > 0);

  const isCompactDensity = cardDensity === 'compact';

  const renderStreamCard = (item: StreamItem) => {
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
        } ${selectedStreamIds.has(item.id) ? 'ring-2 ring-[var(--accent)]' : ''} ${
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
                    reorderTarget.position === 'before' ? '-top-1.5' : '-bottom-1.5'
                  }`
                : `pointer-events-none absolute top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] z-20 ${
                    reorderTarget.position === 'before' ? '-left-1.5' : '-right-1.5'
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
          <div
            className={
              isCompactDensity
                ? 'p-2.5 flex-1 flex flex-col gap-1.5'
                : 'p-3.5 flex-1 flex flex-col gap-2'
            }
          >
            <div className="flex items-start justify-between gap-1.5">
              <div className="flex items-start gap-1.5 min-w-0 flex-1">
                {isCustomSort && (
                  <div
                    aria-hidden="true"
                    title="Drag to reorder"
                    className="w-5 h-5 -ml-1 -mt-0.5 flex items-center justify-center rounded-md text-[var(--text-muted)] cursor-grab active:cursor-grabbing shrink-0"
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
                  <h3
                    className={
                      isCompactDensity
                        ? 'text-xs font-medium leading-snug line-clamp-2'
                        : 'text-sm font-medium leading-snug line-clamp-2'
                    }
                  >
                    {item.customLabel || item.title}
                  </h3>
                </button>
              </div>
              <button
                type="button"
                data-no-stream-drag="true"
                onClick={() => onUpdateStream(item.id, { favorite: !item.favorite })}
                className="h-6 w-6 -mr-1 -mt-0.5 rounded-md flex items-center justify-center shrink-0"
                style={{
                  color: item.favorite ? 'var(--warning)' : 'var(--text-muted)',
                }}
                aria-label={item.favorite ? 'Unfavorite' : 'Favorite'}
              >
                <Star className={`w-3.5 h-3.5 ${item.favorite ? 'fill-current' : ''}`} />
              </button>
            </div>

            <div
              className="text-[11px] leading-relaxed line-clamp-1"
              style={{ color: 'var(--text-muted)' }}
            >
              {[
                item.channel || 'YouTube',
                item.category || 'General',
                !isCompactDensity && item.tags.length > 0
                  ? item.tags.slice(0, 3).map((t) => `#${t}`).join(' ')
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>

            {!isCompactDensity && itemFolders.length > 0 && (
              <div
                className="text-[11px] flex items-center gap-1 truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                <Folder className="w-3 h-3 shrink-0 opacity-75" />
                <span className="truncate">{itemFolders.join(', ')}</span>
              </div>
            )}

            {!isCompactDensity && (item.affirmations || item.notes) && (
              <p
                className="text-[11px] leading-relaxed line-clamp-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                {item.affirmations || item.notes}
              </p>
            )}

            {/* Rating + Listen Count Strip */}
            <div className="flex items-center justify-between gap-1.5 pt-0.5 mt-auto">
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
                    <Star
                      className={`${isCompactDensity ? 'w-2.5 h-2.5' : 'w-3 h-3'} ${
                        star <= rating ? 'fill-current' : ''
                      }`}
                    />
                  </button>
                ))}
              </div>

              <button
                type="button"
                data-no-stream-drag="true"
                onClick={() => onIncrementListen(item.id)}
                className="text-[11px] font-mono tabular-nums inline-flex items-center gap-1 px-1 py-0.5 rounded hover:opacity-80"
                style={{ color: 'var(--text-muted)' }}
                title="Log +1 listen"
              >
                <Headphones className="w-3 h-3" />
                <span>{listens}</span>
                {!isCompactDensity && <span className="opacity-70">+1</span>}
              </button>
            </div>

            {/* Card Actions */}
            <div
              className={`flex items-center gap-1.5 border-t ${
                isCompactDensity ? 'pt-2' : 'pt-2.5'
              }`}
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {inGrid ? (
                <>
                  {!isCompactDensity && (
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
                  )}
                  <button
                    type="button"
                    data-no-stream-drag="true"
                    onClick={() => onStackStream(item.id)}
                    className={`flex-1 rounded-lg border text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
                      isCompactDensity ? 'h-7 px-2' : 'h-8 px-2.5'
                    }`}
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
                  className={`flex-1 rounded-lg border text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap hover:bg-[var(--bg-surface-hover)] ${
                    isCompactDensity ? 'h-7 px-2' : 'h-8 px-2.5'
                  }`}
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
                className={`rounded-lg border text-[11px] font-medium inline-flex items-center justify-center gap-1 whitespace-nowrap hover:bg-[var(--bg-surface-hover)] ${
                  isCompactDensity ? 'h-7 w-7 shrink-0' : 'h-8 px-2.5'
                }`}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
                aria-label="Edit details"
              >
                <Pencil className="w-3 h-3" />
                {!isCompactDensity && <span>Details</span>}
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  };

  const renderMobileCompactRow = (item: StreamItem) => {
    const inGrid = activeIdSet.has(item.id);
    const rating = item.rating ?? 0;
    const isBeingDragged = activeDragStreamIds.has(item.id);
    const reorderTarget =
      activeDropTarget?.kind === 'stream-reorder' &&
      activeDropTarget.streamId === item.id
        ? activeDropTarget
        : null;

    return (
      <div
        key={item.id}
        data-vault-reorder-id={item.id}
        data-vault-reorder-axis="y"
        onPointerDown={(e) => handleStreamPointerDown(item.id, e)}
        className={`relative px-3 py-2.5 flex items-center gap-2.5 transition-colors ${
          isBeingDragged ? 'opacity-45' : ''
        }`}
        style={{
          backgroundColor: selectedStreamIds.has(item.id)
            ? 'var(--accent-soft)'
            : undefined,
          boxShadow: reorderTarget
            ? reorderTarget.position === 'before'
              ? 'inset 0 2.5px 0 var(--accent)'
              : 'inset 0 -2.5px 0 var(--accent)'
            : undefined,
        }}
      >
        {(bulkMode || selectedStreamIds.has(item.id)) && (
          <button
            type="button"
            data-no-stream-drag="true"
            onClick={(e) => {
              e.stopPropagation();
              toggleSelectStream(item.id);
            }}
            className="w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer"
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
            className="w-5 h-7 -ml-1 flex items-center justify-center text-[var(--text-muted)] shrink-0"
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
            setDrawerState({ open: true, mode: 'edit', streamId: item.id });
          }}
          className="relative w-14 h-9 rounded-md overflow-hidden shrink-0 border select-none"
          style={{
            backgroundColor: 'var(--bg-surface-subtle)',
            borderColor: inGrid ? 'var(--accent)' : 'var(--border-subtle)',
          }}
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
            <div className="w-full h-full flex items-center justify-center pointer-events-none">
              <MonitorPlay
                className="w-3.5 h-3.5"
                style={{ color: 'var(--text-muted)' }}
              />
            </div>
          )}
        </button>

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
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-1">
            {item.favorite && (
              <Star
                className="w-3 h-3 fill-current shrink-0"
                style={{ color: 'var(--warning)' }}
              />
            )}
            <span className="text-xs font-semibold truncate">
              {item.customLabel || item.title}
            </span>
          </div>
          <div
            className="text-[11px] truncate flex items-center gap-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="truncate">
              {[item.channel || 'YouTube', item.category || 'General']
                .filter(Boolean)
                .join(' · ')}
            </span>
            {rating > 0 && (
              <span className="shrink-0 font-mono" style={{ color: 'var(--warning)' }}>
                · {rating}★
              </span>
            )}
          </div>
        </button>

        <div className="inline-flex items-center gap-1 shrink-0">
          <button
            type="button"
            data-no-stream-drag="true"
            onClick={() => onStackStream(item.id)}
            className="h-7 px-2 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1"
            style={{
              backgroundColor: inGrid
                ? 'var(--accent-soft)'
                : 'var(--bg-surface-subtle)',
              borderColor: inGrid ? 'var(--accent)' : 'var(--border-subtle)',
              color: inGrid ? 'var(--accent)' : 'var(--text-primary)',
            }}
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
            aria-label="Edit stream details"
          >
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };

  const renderDesktopTableRow = (item: StreamItem) => {
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
        <td className="py-2 pl-3.5 pr-3 max-w-[300px]" style={{ boxShadow: rowDropShadow }}>
          <div className="flex items-center gap-2 min-w-0">
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
                {selectedStreamIds.has(item.id) && <Check className="w-3 h-3 stroke-[3]" />}
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

        <td className="py-2 px-3 text-xs whitespace-nowrap" style={{ boxShadow: rowDropShadow }}>
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

        <td className="py-2 px-3 text-xs max-w-[200px]" style={{ boxShadow: rowDropShadow }}>
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

        <td className="py-2 px-3 whitespace-nowrap" style={{ boxShadow: rowDropShadow }}>
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
                  color: star <= rating ? 'var(--warning)' : 'var(--border-strong)',
                }}
                aria-label={`Rate ${star}`}
              >
                <Star className={`w-3 h-3 ${star <= rating ? 'fill-current' : ''}`} />
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
              title={inGrid ? 'Add another layer to stack' : 'Add stream to stack'}
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
  };

  const renderDesktopTableContainer = (items: StreamItem[]) => (
    <div
      className="hidden md:block rounded-xl border overflow-hidden"
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
            {items.map(renderDesktopTableRow)}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderMobileListContainer = (items: StreamItem[]) => (
    <div
      className="md:hidden rounded-xl border divide-y overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {items.map(renderMobileCompactRow)}
    </div>
  );

  const renderGroupHeader = (group: { name: string; items: StreamItem[] }) => (
    <div className="flex items-center justify-between gap-2 pb-1">
      <div className="flex items-center gap-2 min-w-0">
        {groupBy === 'topic' ? (
          <DynamicIcon
            name={topicIcons[group.name.trim().toLowerCase()] || 'Tag'}
            className="w-4 h-4 shrink-0"
            style={{ color: 'var(--accent)' }}
          />
        ) : (
          <DynamicIcon
            name={channelConfigs[group.name]?.icon || 'Tv'}
            className="w-4 h-4 shrink-0"
            style={{ color: channelConfigs[group.name]?.color || 'var(--accent)' }}
          />
        )}
        <h3 className="font-display text-sm font-semibold truncate">{group.name}</h3>
        <span
          className="text-xs font-mono tabular-nums"
          style={{ color: 'var(--text-muted)' }}
        >
          {group.items.length}
        </span>
      </div>
      <button
        type="button"
        onClick={() =>
          onLoadStreamsToGrid(
            group.items.map((s) => s.id),
            'replace',
            group.name,
          )
        }
        className="h-7 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] shrink-0 cursor-pointer"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
      >
        <Play className="w-3 h-3 fill-current" style={{ color: 'var(--accent)' }} />
        <span>Load Group</span>
      </button>
    </div>
  );

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
          topicOrder={topicOrder}
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
          onReorderFolders={onReorderFolders}
          onDeleteFolder={onDeleteFolder}
          onSetTopicIcon={onSetTopicIcon}
          onReorderTopics={onReorderTopics}
          onResetTopicOrder={onResetTopicOrder}
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
                topicOrder={topicOrder}
                activeIdSet={activeIdSet}
                scope={scope}
                selectedTags={selectedTags}
                isMobileDrawer
                onSelectScope={setScope}
                onToggleTag={handleToggleTag}
                onAddFolder={(name, parentId) => onAddFolder(name, parentId)}
                onRenameFolder={onRenameFolder}
                onUpdateFolder={onUpdateFolder}
                onDeleteFolder={onDeleteFolder}
                onSetTopicIcon={onSetTopicIcon}
                onResetTopicOrder={onResetTopicOrder}
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
          className="px-3 sm:px-6 pt-3 sm:pt-4 pb-3 sm:pb-3.5 border-b space-y-2.5 sm:space-y-3 shrink-0"
          style={{
            backgroundColor: 'var(--bg-canvas)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Row 1: Breadcrumb + Title + Contextual Stack Actions */}
          <div className="flex items-center sm:items-start justify-between gap-2 sm:gap-3">
            <div className="flex items-center sm:items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="lg:hidden h-8 w-8 rounded-lg border flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
                aria-label="Open folders and channels sidebar"
              >
                <Menu className="w-4 h-4" />
              </button>

              <div className="min-w-0 flex-1">
                <div
                  className="text-[11px] font-medium truncate hidden sm:block"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {scopeMeta.breadcrumb}
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 sm:mt-0.5 flex-wrap">
                  {scopeMeta.icon ? (
                    <DynamicIcon
                      name={scopeMeta.icon}
                      className="w-4 h-4 shrink-0"
                      style={{
                        color:
                          scope.kind === 'channel'
                            ? channelConfigs[scope.channel]?.color || 'var(--accent)'
                            : 'var(--accent)',
                      }}
                    />
                  ) : scope.kind === 'channel' ? (
                    <Tv
                      className="w-4 h-4 shrink-0"
                      style={{
                        color: channelConfigs[scope.channel]?.color || 'var(--accent)',
                      }}
                    />
                  ) : null}

                  {scope.kind === 'channel' && renamingSingleChannel ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const target = singleChannelRenameDraft;
                        setRenamingSingleChannel(false);
                        handleRequestRenameChannel(scope.channel, target);
                      }}
                      className="flex items-center gap-1.5 min-w-[180px] max-w-sm flex-1"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={singleChannelRenameDraft}
                        onChange={(e) => setSingleChannelRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            setRenamingSingleChannel(false);
                          }
                        }}
                        placeholder="Channel name (empty = Unknown Channel)"
                        className="flex-1 min-w-0 h-7 px-2.5 rounded-lg border text-xs font-medium outline-none focus:border-[var(--accent)]"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--accent)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <button
                        type="submit"
                        className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: 'var(--accent)',
                          color: 'var(--accent-fg)',
                        }}
                        aria-label="Save channel rename"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingSingleChannel(false)}
                        className="h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-muted)',
                        }}
                        aria-label="Cancel channel rename"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : scope.kind === 'topic' && renamingTopic ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleCommitTopicRename(scope.topic, topicRenameDraft);
                      }}
                      className="flex items-center gap-1.5 min-w-[180px] max-w-sm flex-1"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={topicRenameDraft}
                        onChange={(e) => setTopicRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            setRenamingTopic(false);
                          }
                        }}
                        placeholder="Topic name (empty = Uncategorized)"
                        className="flex-1 min-w-0 h-7 px-2.5 rounded-lg border text-xs font-medium outline-none focus:border-[var(--accent)]"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--accent)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <button
                        type="submit"
                        className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: 'var(--accent)',
                          color: 'var(--accent-fg)',
                        }}
                        aria-label="Save topic rename"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingTopic(false)}
                        className="h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-muted)',
                        }}
                        aria-label="Cancel topic rename"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <h2 className="font-display text-sm sm:text-base font-semibold tracking-tight truncate">
                        {scopeMeta.title}
                      </h2>
                      {scope.kind === 'folder' && currentFolder && (
                        <button
                          type="button"
                          onClick={() => setEditingFolderId(scope.folderId)}
                          title="Edit folder name & icon"
                          aria-label={`Edit ${scopeMeta.title}`}
                          className="hidden md:inline-flex h-6 w-6 rounded-md items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {scope.kind === 'channel' && (
                        <button
                          type="button"
                          onClick={() => {
                            setSingleChannelRenameDraft(
                              scope.channel === 'Unknown Channel' ? '' : scope.channel,
                            );
                            setRenamingSingleChannel(true);
                          }}
                          title="Rename or merge channel"
                          aria-label={`Rename ${scope.channel}`}
                          className="hidden md:inline-flex h-6 w-6 rounded-md items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {scope.kind === 'topic' && (
                        <div className="hidden md:inline-flex items-center gap-0.5 shrink-0">
                          {onRenameTopic && (
                            <button
                              type="button"
                              onClick={() => {
                                setTopicRenameDraft(
                                  scope.topic === 'Uncategorized' ? '' : scope.topic,
                                );
                                setRenamingTopic(true);
                              }}
                              title="Rename topic"
                              aria-label={`Rename ${scope.topic}`}
                              className="h-6 w-6 rounded-md inline-flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onSetTopicIcon && (
                            <button
                              type="button"
                              onClick={() => setTopicIconModalTarget(scope.topic)}
                              title="Change topic icon"
                              aria-label={`Change icon for ${scope.topic}`}
                              className="h-6 w-6 rounded-md inline-flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <Smile className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {scope.kind === 'channel' &&
                    channelConfigs[scope.channel]?.defaultTopic && (
                      <span
                        className="text-[11px] sm:text-xs truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {channelConfigs[scope.channel]?.defaultTopic}
                      </span>
                    )}
                </div>
              </div>
            </div>

            {/* Mobile Row 1 Right Actions: Load + More Sheet + Add URL */}
            <div className="flex md:hidden items-center gap-1.5 shrink-0">
              {scopeMeta.canBatchLoad && visibleStreams.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onLoadStreamsToGrid(
                      visibleStreams.map((s) => s.id),
                      'replace',
                      scopeMeta.title,
                    )
                  }
                  className="h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Play className="w-3 h-3 fill-current" style={{ color: 'var(--accent)' }} />
                  <span>Load</span>
                </button>
              )}

              {(scopeMeta.canBatchLoad ||
                scope.kind === 'in-grid' ||
                scope.kind === 'folder' ||
                scope.kind === 'topic' ||
                scope.kind === 'channel') && (
                <button
                  type="button"
                  onClick={() => setMobileScopeActionsOpen(true)}
                  className="h-8 w-8 rounded-lg border inline-flex items-center justify-center cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                  aria-label="More scope actions"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setDrawerState({ open: true, mode: 'create' })}
                className="h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-fg)',
                }}
                aria-label="Add stream URL"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            {/* Desktop Row 1 Right Actions */}
            <div className="hidden md:flex items-center gap-2 shrink-0 flex-wrap">
              {scope.kind === 'in-grid' && activeStreams.length > 0 && (
                <div className="inline-flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={onTogglePauseAll}
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      backgroundColor: isAllPaused ? 'var(--accent-soft)' : 'var(--bg-surface)',
                      borderColor: isAllPaused ? 'var(--accent)' : 'var(--border-subtle)',
                      color: isAllPaused ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {isAllPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    <span>{isAllPaused ? 'Resume All' : 'Pause All'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onToggleViewMute}
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      backgroundColor: allActiveMuted ? 'var(--bg-surface-subtle)' : 'var(--bg-surface)',
                      borderColor: allActiveMuted ? 'var(--danger)' : 'var(--border-subtle)',
                      color: allActiveMuted ? 'var(--danger)' : 'var(--text-secondary)',
                    }}
                  >
                    {allActiveMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    <span>{allActiveMuted ? 'Unmute' : 'Mute'}</span>
                  </button>

                  {onClearStack && (
                    confirmClearStackDesktop ? (
                      <div
                        className="inline-flex items-center gap-1 rounded-lg border px-1.5 h-8"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--danger)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onClearStack();
                            setConfirmClearStackDesktop(false);
                          }}
                          className="h-6 px-2 rounded text-[11px] font-semibold text-white cursor-pointer"
                          style={{ backgroundColor: 'var(--danger)' }}
                        >
                          Clear Stack?
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClearStackDesktop(false)}
                          className="h-6 px-1.5 rounded text-[11px] font-medium cursor-pointer"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmClearStackDesktop(true)}
                        className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--danger)',
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear Stack</span>
                      </button>
                    )
                  )}
                </div>
              )}

              {scope.kind === 'folder' && currentFolder && (
                <div className="inline-flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setAddingStreamsToFolderId(currentFolder.id)}
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                    <span>Add Streams</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingSubfolder((v) => !v);
                      setSubfolderDraft('');
                    }}
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      backgroundColor: creatingSubfolder ? 'var(--accent-soft)' : 'var(--bg-surface)',
                      borderColor: creatingSubfolder ? 'var(--accent)' : 'var(--border-subtle)',
                      color: creatingSubfolder ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>Subfolder</span>
                  </button>
                </div>
              )}

              {scope.kind === 'channel' && (
                <div className="inline-flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTogglePinChannel(scope.channel)}
                    className="h-8 w-8 rounded-lg border inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      backgroundColor: channelConfigs[scope.channel]?.pinned
                        ? 'var(--accent-soft)'
                        : 'var(--bg-surface)',
                      borderColor: channelConfigs[scope.channel]?.pinned
                        ? 'var(--accent)'
                        : 'var(--border-subtle)',
                      color: channelConfigs[scope.channel]?.pinned
                        ? 'var(--accent)'
                        : 'var(--text-muted)',
                    }}
                    title={
                      channelConfigs[scope.channel]?.pinned
                        ? 'Unpin channel'
                        : 'Pin channel to top'
                    }
                    aria-label="Pin channel"
                  >
                    <Pin
                      className={`w-3.5 h-3.5 ${
                        channelConfigs[scope.channel]?.pinned ? 'fill-current' : ''
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannelBatchTargets([scope.channel])}
                    className="h-8 w-8 rounded-lg border inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                    title={`Batch edit topic & tags for ${scope.channel}`}
                    aria-label="Batch edit topic and tags"
                  >
                    <Tag className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannelSettingsTarget(scope.channel)}
                    className="h-8 w-8 rounded-lg border inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                    title="Customize icon, color & default topic"
                    aria-label="Channel settings"
                  >
                    <Palette className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const entry = allChannelsDirectory.find(
                        (c) => c.name === scope.channel,
                      );
                      setChannelDeleteTargets([
                        {
                          name: scope.channel,
                          count: entry?.count ?? visibleStreams.length,
                        },
                      ]);
                    }}
                    className="h-8 w-8 rounded-lg border inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--danger)',
                    }}
                    title={`Delete ${scope.channel} and all its streams`}
                    aria-label="Delete channel"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

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
                        scopeMeta.title,
                      )
                    }
                    className="h-8 px-3 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap hover:bg-[var(--bg-surface-hover)] cursor-pointer"
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
                        scopeMeta.title,
                      )
                    }
                    className="h-8 px-2.5 border-l text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                    title={`Layer these ${visibleStreams.length} streams onto current Live Stack`}
                  >
                    <Plus className="w-3 h-3" />
                    <span>Layer</span>
                  </button>
                  {scope.kind === 'channel' && singleChannelFavTopIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        onLoadStreamsToGrid(
                          singleChannelFavTopIds,
                          'replace',
                          `${scope.channel} · Favorites & Top`,
                        )
                      }
                      className="h-8 px-2.5 border-l text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--warning)',
                      }}
                      title={`Load ${singleChannelFavTopIds.length} favorite or top-rated (4–5★) streams from ${scope.channel}`}
                    >
                      <Star className="w-3 h-3 fill-current" />
                      <span>Favs ({singleChannelFavTopIds.length})</span>
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setDrawerState({ open: true, mode: 'create' })}
                className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
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

          {/* Folder Canvas Subfolder Chips & Inline New Subfolder Form */}
          {scope.kind === 'folder' &&
            currentFolder &&
            (currentFolder.parentId ||
              childFoldersInScope.length > 0 ||
              creatingSubfolder) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {currentFolder.parentId && folderById.has(currentFolder.parentId) && (
                  <button
                    type="button"
                    onClick={() =>
                      setScope({ kind: 'folder', folderId: currentFolder.parentId! })
                    }
                    className="h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <ChevronLeft className="w-3 h-3" />
                    <span>{folderById.get(currentFolder.parentId)?.name}</span>
                  </button>
                )}

                {childFoldersInScope.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => setScope({ kind: 'folder', folderId: child.id })}
                    className="h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {child.icon ? (
                      <DynamicIcon
                        name={child.icon}
                        className="w-3 h-3 shrink-0"
                        style={{ color: 'var(--accent)' }}
                      />
                    ) : (
                      <FolderOpen
                        className="w-3 h-3 shrink-0"
                        style={{ color: 'var(--accent)' }}
                      />
                    )}
                    <span className="truncate max-w-[140px]">{child.name}</span>
                    <span
                      className="font-mono text-[10px] tabular-nums"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {folderStreamCountsMap.get(child.id) ?? 0}
                    </span>
                  </button>
                ))}

                {creatingSubfolder && (
                  <form
                    onSubmit={handleCreateSubfolderInline}
                    className="inline-flex items-center gap-1"
                  >
                    <input
                      type="text"
                      autoFocus
                      value={subfolderDraft}
                      onChange={(e) => setSubfolderDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setCreatingSubfolder(false);
                        }
                      }}
                      placeholder="New subfolder name..."
                      className="h-7 w-44 px-2.5 rounded-lg border text-xs outline-none"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--accent)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <button
                      type="submit"
                      className="h-7 w-7 rounded-lg flex items-center justify-center cursor-pointer"
                      style={{
                        backgroundColor: 'var(--accent)',
                        color: 'var(--accent-fg)',
                      }}
                      aria-label="Create subfolder"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreatingSubfolder(false)}
                      className="h-7 w-7 rounded-lg border flex items-center justify-center cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-muted)',
                      }}
                      aria-label="Cancel subfolder"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                )}
              </div>
            )}

          {/* Row 2: Search + Mobile Controls / Desktop Popover Toolbar */}
          <div ref={toolbarPopoverRef} className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[140px]">
              <Search
                className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search titles, channels, topics, tags..."
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

            {/* Mobile Row 2: Select + Controls Bottom Sheet Trigger */}
            <div className="flex md:hidden items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (scope.kind === 'channels') {
                    setChannelBulkMode((prev) => {
                      const next = !prev;
                      if (!next) setSelectedChannelNames(new Set());
                      else {
                        setBulkMode(false);
                        setSelectedStreamIds(new Set());
                      }
                      return next;
                    });
                  } else {
                    setBulkMode((prev) => {
                      if (prev) setSelectedStreamIds(new Set());
                      return !prev;
                    });
                  }
                }}
                className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 shrink-0 cursor-pointer"
                style={{
                  backgroundColor: (
                    scope.kind === 'channels' ? channelBulkMode : bulkMode
                  )
                    ? 'var(--accent-soft)'
                    : 'var(--bg-surface)',
                  borderColor: (
                    scope.kind === 'channels' ? channelBulkMode : bulkMode
                  )
                    ? 'var(--accent)'
                    : 'var(--border-subtle)',
                  color: (scope.kind === 'channels' ? channelBulkMode : bulkMode)
                    ? 'var(--accent)'
                    : 'var(--text-secondary)',
                }}
                aria-pressed={scope.kind === 'channels' ? channelBulkMode : bulkMode}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Select</span>
                {(scope.kind === 'channels'
                  ? selectedChannelNames.size
                  : selectedStreamIds.size) > 0 && (
                  <span
                    className="font-mono text-[10px] font-semibold px-1 rounded"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: 'var(--accent-fg)',
                    }}
                  >
                    {scope.kind === 'channels'
                      ? selectedChannelNames.size
                      : selectedStreamIds.size}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setMobileControlsOpen(true)}
                className="relative h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                style={{
                  backgroundColor:
                    activeSecondaryFilterCount > 0 ||
                    isCustomSort ||
                    (scope.kind === 'channels' && isCustomChannelSort) ||
                    (scope.kind === 'all' && groupBy !== 'none')
                      ? 'var(--accent-soft)'
                      : 'var(--bg-surface)',
                  borderColor:
                    activeSecondaryFilterCount > 0 ||
                    isCustomSort ||
                    (scope.kind === 'channels' && isCustomChannelSort) ||
                    (scope.kind === 'all' && groupBy !== 'none')
                      ? 'var(--accent)'
                      : 'var(--border-subtle)',
                  color:
                    activeSecondaryFilterCount > 0 ||
                    isCustomSort ||
                    (scope.kind === 'channels' && isCustomChannelSort) ||
                    (scope.kind === 'all' && groupBy !== 'none')
                      ? 'var(--accent)'
                      : 'var(--text-secondary)',
                }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Controls</span>
                {activeSecondaryFilterCount > 0 && (
                  <span
                    className="font-mono text-[10px] font-semibold px-1 rounded"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: 'var(--accent-fg)',
                    }}
                  >
                    {activeSecondaryFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Desktop Row 2: Unified Sort/Reorder Popover + Filters Popover + Group + Select + Density + View Switch */}
            <div className="hidden md:flex items-center gap-2 shrink-0 flex-wrap">
              {/* Merged Sort & Reorder Popover */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setOpenToolbarPopover((prev) => (prev === 'sort' ? null : 'sort'))
                  }
                  className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  style={{
                    backgroundColor:
                      openToolbarPopover === 'sort' ||
                      isCustomSort ||
                      (scope.kind === 'channels' && isCustomChannelSort)
                        ? 'var(--accent-soft)'
                        : 'var(--bg-surface)',
                    borderColor:
                      openToolbarPopover === 'sort' ||
                      isCustomSort ||
                      (scope.kind === 'channels' && isCustomChannelSort)
                        ? 'var(--accent)'
                        : 'var(--border-subtle)',
                    color:
                      openToolbarPopover === 'sort' ||
                      isCustomSort ||
                      (scope.kind === 'channels' && isCustomChannelSort)
                        ? 'var(--accent)'
                        : 'var(--text-secondary)',
                  }}
                >
                  {isCustomSort || (scope.kind === 'channels' && isCustomChannelSort) ? (
                    <GripVertical className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {scope.kind === 'channels'
                      ? isCustomChannelSort || isCustomSort
                        ? 'Sort: Custom Drag'
                        : `Sort: ${
                            channelSortBy === 'count-desc'
                              ? 'Most Streams'
                              : channelSortBy === 'count-asc'
                                ? 'Fewest'
                                : channelSortBy === 'listens'
                                  ? 'Listens'
                                  : channelSortBy === 'recent'
                                    ? 'Latest'
                                    : channelSortBy === 'title-asc'
                                      ? 'A–Z'
                                      : 'Z–A'
                          }`
                      : sortBy === 'custom'
                        ? 'Sort: Custom Drag'
                        : sortBy === 'recent'
                          ? 'Sort: Recent'
                          : sortBy === 'listens'
                            ? 'Sort: Listens'
                            : sortBy === 'rating'
                              ? 'Sort: Rating'
                              : sortBy === 'title'
                                ? 'Sort: Title'
                                : 'Sort: Channel'}
                  </span>
                  <ChevronDown className="w-3 h-3 opacity-70" />
                </button>

                {openToolbarPopover === 'sort' && (
                  <div
                    className="absolute right-0 top-full mt-1.5 z-40 w-72 rounded-xl border p-3 shadow-xl space-y-3"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-strong)',
                      boxShadow: 'var(--shadow-popover)',
                    }}
                  >
                    {scope.kind === 'channels' ? (
                      <>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span
                              className="text-[11px] font-semibold uppercase tracking-wider"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              Channels Order
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setChannelSortBy((p) =>
                                  p === 'custom' ? 'count-desc' : 'custom',
                                )
                              }
                              className="h-6 px-2 rounded-md border text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                              style={{
                                backgroundColor: isCustomChannelSort
                                  ? 'var(--accent-soft)'
                                  : 'var(--bg-surface)',
                                borderColor: isCustomChannelSort
                                  ? 'var(--accent)'
                                  : 'var(--border-subtle)',
                                color: isCustomChannelSort
                                  ? 'var(--accent)'
                                  : 'var(--text-secondary)',
                              }}
                            >
                              <GripVertical className="w-3 h-3" />
                              <span>{isCustomChannelSort ? 'Drag On' : 'Drag Order'}</span>
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            {(
                              [
                                ['count-desc', 'Most Streams'],
                                ['count-asc', 'Fewest Streams'],
                                ['listens', 'Total Listens'],
                                ['recent', 'Latest Added'],
                                ['title-asc', 'Title A–Z'],
                                ['title-desc', 'Title Z–A'],
                                ['custom', 'Custom Drag'],
                              ] as const
                            ).map(([id, label]) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setChannelSortBy(id)}
                                className="h-7 px-2 rounded-lg text-xs font-medium text-left flex items-center justify-between hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                                style={{
                                  backgroundColor:
                                    channelSortBy === id ? 'var(--accent-soft)' : 'transparent',
                                  color:
                                    channelSortBy === id
                                      ? 'var(--accent)'
                                      : 'var(--text-secondary)',
                                }}
                              >
                                <span className="truncate">{label}</span>
                                {channelSortBy === id && <Check className="w-3 h-3 shrink-0" />}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div
                          className="pt-2.5 border-t space-y-1.5"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className="text-[11px] font-semibold uppercase tracking-wider"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              In-Channel Streams
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setSortBy((p) => (p === 'custom' ? 'recent' : 'custom'))
                              }
                              className="h-6 px-2 rounded-md border text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                              style={{
                                backgroundColor: isCustomSort
                                  ? 'var(--accent-soft)'
                                  : 'var(--bg-surface)',
                                borderColor: isCustomSort
                                  ? 'var(--accent)'
                                  : 'var(--border-subtle)',
                                color: isCustomSort
                                  ? 'var(--accent)'
                                  : 'var(--text-secondary)',
                              }}
                            >
                              <GripVertical className="w-3 h-3" />
                              <span>{isCustomSort ? 'Drag On' : 'Drag Order'}</span>
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            {(
                              [
                                ['recent', 'Recently Added'],
                                ['listens', 'Most Listened'],
                                ['rating', 'Highest Rated'],
                                ['title', 'Title (A–Z)'],
                                ['custom', 'Custom Drag'],
                              ] as const
                            ).map(([id, label]) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setSortBy(id)}
                                className="h-7 px-2 rounded-lg text-xs font-medium text-left flex items-center justify-between hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                                style={{
                                  backgroundColor:
                                    sortBy === id ? 'var(--accent-soft)' : 'transparent',
                                  color:
                                    sortBy === id
                                      ? 'var(--accent)'
                                      : 'var(--text-secondary)',
                                }}
                              >
                                <span className="truncate">{label}</span>
                                {sortBy === id && <Check className="w-3 h-3 shrink-0" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span
                            className="text-[11px] font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            Sort Streams
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setSortBy((p) => (p === 'custom' ? 'recent' : 'custom'))
                            }
                            className="h-6 px-2 rounded-md border text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            style={{
                              backgroundColor: isCustomSort
                                ? 'var(--accent-soft)'
                                : 'var(--bg-surface)',
                              borderColor: isCustomSort
                                ? 'var(--accent)'
                                : 'var(--border-subtle)',
                              color: isCustomSort
                                ? 'var(--accent)'
                                : 'var(--text-secondary)',
                            }}
                          >
                            <GripVertical className="w-3 h-3" />
                            <span>{isCustomSort ? 'Drag On' : 'Enable Drag'}</span>
                          </button>
                        </div>

                        <div className="space-y-0.5">
                          {(
                            [
                              ['recent', 'Recently Added'],
                              ['listens', 'Most Listened'],
                              ['rating', 'Highest Rated'],
                              ['title', 'Title (A–Z)'],
                              ['channel', 'Channel (A–Z)'],
                              ['custom', 'Custom Drag Order'],
                            ] as const
                          ).map(([id, label]) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => {
                                setSortBy(id);
                                setOpenToolbarPopover(null);
                              }}
                              className="w-full h-8 px-2.5 rounded-lg text-xs font-medium text-left flex items-center justify-between hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                              style={{
                                backgroundColor:
                                  sortBy === id ? 'var(--accent-soft)' : 'transparent',
                                color:
                                  sortBy === id
                                    ? 'var(--accent)'
                                    : 'var(--text-secondary)',
                              }}
                            >
                              <span>{label}</span>
                              {sortBy === id && <Check className="w-3.5 h-3.5" />}
                            </button>
                          ))}
                        </div>
                        {scope.kind === 'all' && groupBy !== 'none' && sortBy === 'custom' && (
                          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            Set Group By to None to drag-reorder cards.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Filters Popover (Tags + Rating + Grid Status + Untagged + Pinned Channels) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setOpenToolbarPopover((prev) => (prev === 'filters' ? null : 'filters'))
                  }
                  className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  style={{
                    backgroundColor:
                      openToolbarPopover === 'filters' || activeSecondaryFilterCount > 0
                        ? 'var(--accent-soft)'
                        : 'var(--bg-surface)',
                    borderColor:
                      openToolbarPopover === 'filters' || activeSecondaryFilterCount > 0
                        ? 'var(--accent)'
                        : 'var(--border-subtle)',
                    color:
                      openToolbarPopover === 'filters' || activeSecondaryFilterCount > 0
                        ? 'var(--accent)'
                        : 'var(--text-secondary)',
                  }}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Filters</span>
                  {activeSecondaryFilterCount > 0 && (
                    <span
                      className="font-mono text-[10px] font-semibold px-1 rounded"
                      style={{
                        backgroundColor: 'var(--accent)',
                        color: 'var(--accent-fg)',
                      }}
                    >
                      {activeSecondaryFilterCount}
                    </span>
                  )}
                </button>

                {openToolbarPopover === 'filters' && (
                  <div
                    className="absolute right-0 top-full mt-1.5 z-40 w-80 rounded-xl border p-3.5 shadow-xl space-y-3"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-strong)',
                      boxShadow: 'var(--shadow-popover)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Quick Filters
                      </span>
                      {activeSecondaryFilterCount > 0 && (
                        <button
                          type="button"
                          onClick={resetSecondaryFilters}
                          className="text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          style={{ color: 'var(--accent)' }}
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {([0, 4, 5] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setMinRating(r)}
                          className="h-7 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                          style={{
                            backgroundColor:
                              minRating === r ? 'var(--accent-soft)' : 'var(--bg-surface)',
                            borderColor:
                              minRating === r ? 'var(--accent)' : 'var(--border-subtle)',
                            color:
                              minRating === r ? 'var(--accent)' : 'var(--text-secondary)',
                          }}
                        >
                          {r > 0 && <Star className="w-3 h-3 fill-current" />}
                          <span>{r === 0 ? 'Any Stars' : `${r}+ ★`}</span>
                        </button>
                      ))}

                      {scope.kind !== 'in-grid' && (
                        <button
                          type="button"
                          onClick={() =>
                            setGridStatusFilter((prev) =>
                              prev === 'all'
                                ? 'stacked'
                                : prev === 'stacked'
                                  ? 'unstacked'
                                  : 'all',
                            )
                          }
                          className="h-7 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                          style={{
                            backgroundColor:
                              gridStatusFilter !== 'all'
                                ? 'var(--accent-soft)'
                                : 'var(--bg-surface)',
                            borderColor:
                              gridStatusFilter !== 'all'
                                ? 'var(--accent)'
                                : 'var(--border-subtle)',
                            color:
                              gridStatusFilter !== 'all'
                                ? 'var(--accent)'
                                : 'var(--text-secondary)',
                          }}
                        >
                          <span>
                            {gridStatusFilter === 'all'
                              ? 'Grid: All'
                              : gridStatusFilter === 'stacked'
                                ? 'In Live Grid'
                                : 'Not In Grid'}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setUntaggedOnly((v) => !v)}
                        className="h-7 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: untaggedOnly
                            ? 'var(--accent-soft)'
                            : 'var(--bg-surface)',
                          borderColor: untaggedOnly
                            ? 'var(--accent)'
                            : 'var(--border-subtle)',
                          color: untaggedOnly ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                      >
                        <Hash className="w-3 h-3" />
                        <span>Untagged</span>
                      </button>

                      {scope.kind === 'channels' && (
                        <button
                          type="button"
                          onClick={() => setPinnedOnlyChannels((v) => !v)}
                          className="h-7 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                          style={{
                            backgroundColor: pinnedOnlyChannels
                              ? 'var(--accent-soft)'
                              : 'var(--bg-surface)',
                            borderColor: pinnedOnlyChannels
                              ? 'var(--accent)'
                              : 'var(--border-subtle)',
                            color: pinnedOnlyChannels
                              ? 'var(--accent)'
                              : 'var(--text-secondary)',
                          }}
                        >
                          <Pin className={`w-3 h-3 ${pinnedOnlyChannels ? 'fill-current' : ''}`} />
                          <span>Pinned Only</span>
                        </button>
                      )}
                    </div>

                    {existingTags.length > 0 && (
                      <div
                        className="pt-2.5 border-t space-y-2"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <span
                          className="text-[11px] font-semibold uppercase tracking-wider block"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Tags ({existingTags.length})
                        </span>
                        <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto pr-0.5">
                          {existingTags.map((tag) => {
                            const active = selectedTags.includes(tag);
                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => handleToggleTag(tag)}
                                className="h-6 px-2 rounded-md border text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                                style={{
                                  backgroundColor: active
                                    ? 'var(--accent-soft)'
                                    : 'var(--bg-surface)',
                                  borderColor: active
                                    ? 'var(--accent)'
                                    : 'var(--border-subtle)',
                                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                                }}
                              >
                                <Hash className="w-2.5 h-2.5 opacity-70" />
                                <span>{tag}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Group By Popover (All Saved only) */}
              {scope.kind === 'all' && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenToolbarPopover((prev) => (prev === 'group' ? null : 'group'))
                    }
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    style={{
                      backgroundColor:
                        groupBy !== 'none' ? 'var(--accent-soft)' : 'var(--bg-surface)',
                      borderColor:
                        groupBy !== 'none' ? 'var(--accent)' : 'var(--border-subtle)',
                      color: groupBy !== 'none' ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>
                      {groupBy === 'none'
                        ? 'Group'
                        : groupBy === 'topic'
                          ? 'Group: Topic'
                          : 'Group: Channel'}
                    </span>
                    <ChevronDown className="w-3 h-3 opacity-70" />
                  </button>

                  {openToolbarPopover === 'group' && (
                    <div
                      className="absolute right-0 top-full mt-1.5 z-40 w-44 rounded-xl border p-1.5 shadow-xl space-y-0.5"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        borderColor: 'var(--border-strong)',
                        boxShadow: 'var(--shadow-popover)',
                      }}
                    >
                      {(
                        [
                          ['none', 'None (Flat List)'],
                          ['topic', 'By Topic / Theme'],
                          ['channel', 'By Channel'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setGroupBy(id);
                            setOpenToolbarPopover(null);
                          }}
                          className="w-full h-8 px-2.5 rounded-lg text-xs font-medium text-left flex items-center justify-between hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                          style={{
                            backgroundColor:
                              groupBy === id ? 'var(--accent-soft)' : 'transparent',
                            color:
                              groupBy === id ? 'var(--accent)' : 'var(--text-secondary)',
                          }}
                        >
                          <span>{label}</span>
                          {groupBy === id && <Check className="w-3.5 h-3.5" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Channels Collapse Unpinned quick button */}
              {scope.kind === 'channels' &&
                channelsOverviewData.some((c) => c.meta.pinned) &&
                channelsOverviewData.some((c) => !c.meta.pinned) && (
                  <button
                    type="button"
                    onClick={() => setCollapseUnpinnedChannels((v) => !v)}
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    style={{
                      backgroundColor: collapseUnpinnedChannels
                        ? 'var(--accent-soft)'
                        : 'var(--bg-surface)',
                      borderColor: collapseUnpinnedChannels
                        ? 'var(--accent)'
                        : 'var(--border-subtle)',
                      color: collapseUnpinnedChannels
                        ? 'var(--accent)'
                        : 'var(--text-secondary)',
                    }}
                    title="Collapse or expand unpinned channels"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{collapseUnpinnedChannels ? 'Unpinned Hidden' : 'Collapse Unpinned'}</span>
                  </button>
                )}

              {/* Select Toggle for Bulk Edit */}
              <button
                type="button"
                onClick={() => {
                  if (scope.kind === 'channels') {
                    setChannelBulkMode((prev) => {
                      const next = !prev;
                      if (!next) {
                        setSelectedChannelNames(new Set());
                      } else {
                        setBulkMode(false);
                        setSelectedStreamIds(new Set());
                      }
                      return next;
                    });
                  } else {
                    setBulkMode((prev) => {
                      if (prev) setSelectedStreamIds(new Set());
                      return !prev;
                    });
                  }
                }}
                className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: (
                    scope.kind === 'channels' ? channelBulkMode : bulkMode
                  )
                    ? 'var(--accent-soft)'
                    : 'var(--bg-surface)',
                  borderColor: (
                    scope.kind === 'channels' ? channelBulkMode : bulkMode
                  )
                    ? 'var(--accent)'
                    : 'var(--border-subtle)',
                  color: (scope.kind === 'channels' ? channelBulkMode : bulkMode)
                    ? 'var(--accent)'
                    : 'var(--text-secondary)',
                }}
                aria-pressed={scope.kind === 'channels' ? channelBulkMode : bulkMode}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Select</span>
                {(scope.kind === 'channels'
                  ? selectedChannelNames.size
                  : selectedStreamIds.size) > 0 && (
                  <span
                    className="font-mono text-[11px] font-semibold px-1 rounded"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: 'var(--accent-fg)',
                    }}
                  >
                    {scope.kind === 'channels'
                      ? selectedChannelNames.size
                      : selectedStreamIds.size}
                  </span>
                )}
              </button>

              {/* Standard / Compact Card Density Toggle */}
              {(scope.kind === 'channels'
                ? channelsViewMode !== 'split'
                : viewMode === 'grid') && (
                <button
                  type="button"
                  onClick={() =>
                    setCardDensity((prev) =>
                      prev === 'standard' ? 'compact' : 'standard',
                    )
                  }
                  className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  style={{
                    backgroundColor:
                      cardDensity === 'compact' ? 'var(--accent-soft)' : 'var(--bg-surface)',
                    borderColor:
                      cardDensity === 'compact' ? 'var(--accent)' : 'var(--border-subtle)',
                    color:
                      cardDensity === 'compact' ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                  title="Toggle Standard vs Compact card density"
                >
                  <span>{cardDensity === 'compact' ? 'Compact' : 'Standard'}</span>
                </button>
              )}

              {/* View Mode Switcher */}
              {scope.kind === 'channels' ? (
                <div
                  className="inline-flex items-center h-8 gap-0.5 p-0.5 rounded-lg border shrink-0"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                  role="group"
                  aria-label="Channels view mode"
                >
                  <button
                    type="button"
                    onClick={() => setChannelsViewMode('carousels')}
                    className="h-full px-2 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                    style={{
                      backgroundColor:
                        channelsViewMode === 'carousels'
                          ? 'var(--accent-soft)'
                          : 'transparent',
                      color:
                        channelsViewMode === 'carousels'
                          ? 'var(--accent)'
                          : 'var(--text-muted)',
                    }}
                    aria-label="Horizontal carousels view"
                  >
                    <GalleryHorizontal className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Carousels</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannelsViewMode('directory')}
                    className="h-full px-2 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                    style={{
                      backgroundColor:
                        channelsViewMode === 'directory'
                          ? 'var(--accent-soft)'
                          : 'transparent',
                      color:
                        channelsViewMode === 'directory'
                          ? 'var(--accent)'
                          : 'var(--text-muted)',
                    }}
                    aria-label="Directory cards grid view"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Directory</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannelsViewMode('split')}
                    className="h-full px-2 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                    style={{
                      backgroundColor:
                        channelsViewMode === 'split'
                          ? 'var(--accent-soft)'
                          : 'transparent',
                      color:
                        channelsViewMode === 'split'
                          ? 'var(--accent)'
                          : 'var(--text-muted)',
                    }}
                    aria-label="Split master-detail list view"
                  >
                    <Columns2 className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Split</span>
                  </button>
                </div>
              ) : (
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
                    className="h-full px-2 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                    style={{
                      backgroundColor: viewMode === 'grid' ? 'var(--accent-soft)' : 'transparent',
                      color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                    aria-label="Grid cards view"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className="h-full px-2 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                    style={{
                      backgroundColor: viewMode === 'table' ? 'var(--accent-soft)' : 'transparent',
                      color: viewMode === 'table' ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                    aria-label="Dense table view"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>Table</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Active Filter & Tag Indicator Strip */}
          {activeSecondaryFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Filtered:
              </span>
              {minRating > 0 && (
                <button
                  type="button"
                  onClick={() => setMinRating(0)}
                  className="h-6 px-2 rounded-md border text-[11px] font-medium inline-flex items-center gap-1"
                  style={{
                    backgroundColor: 'var(--accent-soft)',
                    borderColor: 'var(--accent)',
                    color: 'var(--accent)',
                  }}
                >
                  <span>{minRating}+ ★</span>
                  <X className="w-3 h-3" />
                </button>
              )}
              {scope.kind !== 'in-grid' && gridStatusFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setGridStatusFilter('all')}
                  className="h-6 px-2 rounded-md border text-[11px] font-medium inline-flex items-center gap-1"
                  style={{
                    backgroundColor: 'var(--accent-soft)',
                    borderColor: 'var(--accent)',
                    color: 'var(--accent)',
                  }}
                >
                  <span>{gridStatusFilter === 'stacked' ? 'In Live Grid' : 'Not In Grid'}</span>
                  <X className="w-3 h-3" />
                </button>
              )}
              {untaggedOnly && (
                <button
                  type="button"
                  onClick={() => setUntaggedOnly(false)}
                  className="h-6 px-2 rounded-md border text-[11px] font-medium inline-flex items-center gap-1"
                  style={{
                    backgroundColor: 'var(--accent-soft)',
                    borderColor: 'var(--accent)',
                    color: 'var(--accent)',
                  }}
                >
                  <span>Untagged</span>
                  <X className="w-3 h-3" />
                </button>
              )}
              {scope.kind === 'channels' && pinnedOnlyChannels && (
                <button
                  type="button"
                  onClick={() => setPinnedOnlyChannels(false)}
                  className="h-6 px-2 rounded-md border text-[11px] font-medium inline-flex items-center gap-1"
                  style={{
                    backgroundColor: 'var(--accent-soft)',
                    borderColor: 'var(--accent)',
                    color: 'var(--accent)',
                  }}
                >
                  <span>Pinned Only</span>
                  <X className="w-3 h-3" />
                </button>
              )}
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
                onClick={resetSecondaryFilters}
                className="text-[11px] font-medium px-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Main Scrollable Catalog Area + Floating Folder Drop Dock Wrapper */}
        <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
        <div
          ref={mainScrollRef}
          className={`flex-1 overflow-y-auto px-3 sm:px-6 py-4 ${
            isDraggingStreams ? 'pb-40' : ''
          }`}
        >
          {scope.kind === 'channels' ? (
            <StreamChannelsOverview
              channels={channelsOverviewData}
              viewMode={channelsViewMode}
              cardDensity={cardDensity}
              collapseUnpinned={collapseUnpinnedChannels}
              onToggleCollapseUnpinned={() => setCollapseUnpinnedChannels((v) => !v)}
              isCustomChannelSort={isCustomChannelSort}
              isCustomStreamSort={isCustomSort}
              searchQuery={searchQuery}
              activeIdSet={activeIdSet}
              bulkMode={bulkMode}
              selectedStreamIds={selectedStreamIds}
              channelBulkMode={channelBulkMode}
              selectedChannelNames={selectedChannelNames}
              brokenThumbs={brokenThumbs}
              onBrokenThumb={(streamId) =>
                setBrokenThumbs((prev) => ({ ...prev, [streamId]: true }))
              }
              activeStreamDropTarget={activeDropTarget}
              activeDragStreamIds={activeDragStreamIds}
              onStreamPointerDown={handleStreamPointerDown}
              shouldSuppressStreamClick={shouldSuppressClick}
              draggingChannelName={draggingChannelName}
              activeChannelDropTarget={activeChannelDropTarget}
              onChannelPointerDown={handleChannelPointerDown}
              shouldSuppressChannelClick={shouldSuppressChannelClick}
              splitListScrollRef={splitListScrollRef}
              onToggleSelectStream={toggleSelectStream}
              onToggleSelectChannel={toggleSelectChannel}
              onSelectAllChannels={() =>
                setSelectedChannelNames(new Set(channelsOverviewData.map((c) => c.name)))
              }
              onClearChannelSelection={() => setSelectedChannelNames(new Set())}
              onCloseChannelBulkMode={() => {
                setChannelBulkMode(false);
                setSelectedChannelNames(new Set());
              }}
              onBulkMergeSelectedChannels={() => {
                const selected = channelsOverviewData.filter((c) =>
                  selectedChannelNames.has(c.name),
                );
                if (selected.length < 2) return;
                setPendingChannelMerge({
                  mode: 'bulk-merge',
                  sourceChannels: selected.map((c) => ({
                    name: c.name,
                    count: c.streams.length,
                  })),
                  suggestedTargetName: selected[0].name,
                });
              }}
              onBulkBatchEditChannels={() => {
                const selected = Array.from(selectedChannelNames);
                if (selected.length === 0) return;
                setChannelBatchTargets(selected);
              }}
              onBulkTogglePinChannels={() => {
                if (!onUpdateChannelMeta) return;
                const selected = Array.from(selectedChannelNames);
                if (selected.length === 0) return;
                const allPinned = selected.every((n) => Boolean(channelConfigs[n]?.pinned));
                for (const ch of selected) {
                  onUpdateChannelMeta(ch, { pinned: !allPinned });
                }
                onNotify(
                  allPinned
                    ? `Unpinned ${selected.length} channels`
                    : `Pinned ${selected.length} channels to top`,
                  'success',
                );
              }}
              onBulkLoadSelectedChannels={() => {
                const set = selectedChannelNames;
                const ids = channelsOverviewData
                  .filter((c) => set.has(c.name))
                  .flatMap((c) => c.streams.map((s) => s.id));
                if (ids.length === 0) return;
                onLoadStreamsToGrid(ids, 'replace', `${set.size} Channels`);
              }}
              onBulkDeleteSelectedChannels={() => {
                const selected = Array.from(selectedChannelNames).map((name) => {
                  const entry = allChannelsDirectory.find((c) => c.name === name);
                  return { name, count: entry?.count ?? 0 };
                });
                if (selected.length === 0) return;
                setChannelDeleteTargets(selected);
              }}
              onOpenChannel={(channelName) =>
                setScope({ kind: 'channel', channel: channelName })
              }
              onEditStream={(streamId) =>
                setDrawerState({ open: true, mode: 'edit', streamId })
              }
              onAddStreamInChannel={(channelName, defaultTopic) =>
                setDrawerState({
                  open: true,
                  mode: 'create',
                  defaultChannel:
                    channelName === 'Unknown Channel' ? '' : channelName,
                  defaultTopic: defaultTopic || undefined,
                })
              }
              onStackStream={onStackStream}
              onToggleStreamInGrid={onToggleStreamInGrid}
              onUpdateStream={onUpdateStream}
              onIncrementListen={onIncrementListen}
              onLoadStreamsToGrid={(ids, mode, label) =>
                onLoadStreamsToGrid(ids, mode, label)
              }
              onTogglePinChannel={handleTogglePinChannel}
              onRequestRenameChannel={handleRequestRenameChannel}
              onOpenChannelSettings={(channelName) =>
                setChannelSettingsTarget(channelName)
              }
              onOpenChannelBatchEdit={(channelName) =>
                setChannelBatchTargets([channelName])
              }
              onOpenChannelDelete={(channelName) => {
                const entry = allChannelsDirectory.find((c) => c.name === channelName);
                setChannelDeleteTargets([
                  { name: channelName, count: entry?.count ?? 0 },
                ]);
              }}
            />
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
                {(searchQuery ||
                  activeSecondaryFilterCount > 0 ||
                  groupBy !== 'none' ||
                  scope.kind !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      resetSecondaryFilters();
                      setGroupBy('none');
                      setScope({ kind: 'all' });
                    }}
                    className="h-9 px-3.5 rounded-lg border text-xs font-medium cursor-pointer"
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
                  className="h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
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
            /* GRID CARDS VIEW (Flat or Grouped, Standard or Compact Density) */
            groupedVisibleStreams ? (
              <div className="space-y-6 max-w-[1800px]">
                {groupedVisibleStreams.map((group, idx) => (
                  <section key={group.name} className="space-y-2.5">
                    {renderGroupHeader(group)}
                    <div
                      ref={idx === 0 ? gridRef : undefined}
                      className={
                        isCompactDensity
                          ? 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5'
                          : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4'
                      }
                    >
                      {group.items.map(renderStreamCard)}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div
                ref={gridRef}
                className={
                  isCompactDensity
                    ? 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 max-w-[1800px]'
                    : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 max-w-[1800px]'
                }
              >
                {visibleStreams.map(renderStreamCard)}
              </div>
            )
          ) : (
            /* MOBILE COMPACT LIST + DESKTOP DENSE TABLE VIEW */
            groupedVisibleStreams ? (
              <div className="space-y-6 max-w-[1800px]">
                {groupedVisibleStreams.map((group) => (
                  <section key={group.name} className="space-y-2">
                    {renderGroupHeader(group)}
                    {renderMobileListContainer(group.items)}
                    {renderDesktopTableContainer(group.items)}
                  </section>
                ))}
              </div>
            ) : (
              <>
                {renderMobileListContainer(visibleStreams)}
                {renderDesktopTableContainer(visibleStreams)}
              </>
            )
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

        {/* Persistent Live Audio Bar (ultra-compact on mobile; yields to bulk bar on mobile) */}
        {activeStreams.length > 0 && (
          <div
            className={`px-3 md:px-6 py-2 md:py-2.5 border-t items-center justify-between gap-2 md:gap-3 shrink-0 ${
              isAnyBulkBarOpen ? 'hidden md:flex' : 'flex'
            }`}
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-2 md:gap-2.5 min-w-0">
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
                  className="hidden md:block text-[11px] font-mono tabular-nums truncate"
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
                className="h-8 w-8 md:w-auto md:px-2.5 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: isAllPaused ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  borderColor: isAllPaused ? 'var(--accent)' : 'var(--border-subtle)',
                  color: isAllPaused ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                aria-label={isAllPaused ? 'Resume all streams' : 'Pause all streams'}
              >
                {isAllPaused ? (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Pause</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onToggleViewMute}
                className="h-8 w-8 md:w-auto md:px-2.5 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: allActiveMuted
                    ? 'var(--bg-surface-subtle)'
                    : 'var(--bg-surface)',
                  borderColor: allActiveMuted ? 'var(--danger)' : 'var(--border-subtle)',
                  color: allActiveMuted ? 'var(--danger)' : 'var(--text-secondary)',
                }}
                aria-label={allActiveMuted ? 'Unmute all streams' : 'Mute all streams'}
              >
                {allActiveMuted ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Unmute</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Mute</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onBackToGrid}
                className="h-8 px-2.5 md:px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-fg)',
                }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="md:hidden">Grid</span>
                <span className="hidden md:inline">Back to Live Grid</span>
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
          defaultTopic={
            drawerState.mode === 'create' && drawerState.defaultTopic !== undefined
              ? drawerState.defaultTopic
              : scope.kind === 'topic'
                ? scope.topic
                : scope.kind === 'channel'
                  ? channelConfigs[scope.channel]?.defaultTopic
                  : undefined
          }
          defaultChannel={
            drawerState.mode === 'create' && drawerState.defaultChannel !== undefined
              ? drawerState.defaultChannel
              : scope.kind === 'channel' && scope.channel !== 'Unknown Channel'
                ? scope.channel
                : undefined
          }
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

      {/* Edit Folder Name & Expanded Icon Picker Modal */}
      <StreamFolderEditModal
        folder={editingFolderId ? folderById.get(editingFolderId) ?? null : null}
        onClose={() => setEditingFolderId(null)}
        onSave={(folderId, patch) => {
          if (onUpdateFolder) {
            onUpdateFolder(folderId, patch);
          } else {
            onRenameFolder(folderId, patch.name);
          }
        }}
      />

      {/* Channel Management Modals */}
      <ChannelSettingsModal
        channelName={channelSettingsTarget}
        meta={channelSettingsTarget ? channelConfigs[channelSettingsTarget] : undefined}
        existingTopics={existingTopics}
        onClose={() => setChannelSettingsTarget(null)}
        onSave={(channelName, patch) => {
          if (!onUpdateChannelMeta) return;
          onUpdateChannelMeta(channelName, patch);
          onNotify(`Saved channel settings for “${channelName}”`, 'success');
        }}
      />

      <ChannelRenameMergeModal
        pending={pendingChannelMerge}
        existingChannels={allChannelsDirectory.map((c) => ({
          name: c.name,
          count: c.count,
        }))}
        onClose={() => setPendingChannelMerge(null)}
        onConfirm={executeRenameOrMergeChannels}
      />

      <ChannelBatchEditModal
        channelNames={channelBatchTargets}
        affectedStreamCount={channelBatchAffectedCount}
        existingTopics={existingTopics}
        existingTags={existingTags}
        onClose={() => setChannelBatchTargets(null)}
        onApply={handleBatchUpdateChannelsApply}
      />

      <ChannelDeleteModal
        targets={channelDeleteTargets}
        onClose={() => setChannelDeleteTargets(null)}
        onConfirm={handleDeleteChannelsConfirm}
      />

      {/* Mobile Controls & Scope Actions Bottom Sheets */}
      <StreamVaultControlsSheet
        open={mobileControlsOpen}
        onClose={() => setMobileControlsOpen(false)}
        scope={scope}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        cardDensity={cardDensity}
        onChangeCardDensity={setCardDensity}
        sortBy={sortBy}
        onChangeSortBy={setSortBy}
        groupBy={groupBy}
        onChangeGroupBy={setGroupBy}
        channelsViewMode={channelsViewMode}
        onChangeChannelsViewMode={setChannelsViewMode}
        channelSortBy={channelSortBy}
        onChangeChannelSortBy={setChannelSortBy}
        pinnedOnlyChannels={pinnedOnlyChannels}
        onTogglePinnedOnlyChannels={() => setPinnedOnlyChannels((v) => !v)}
        collapseUnpinnedChannels={collapseUnpinnedChannels}
        onToggleCollapseUnpinnedChannels={() => setCollapseUnpinnedChannels((v) => !v)}
        existingTags={existingTags}
        selectedTags={selectedTags}
        onToggleTag={handleToggleTag}
        minRating={minRating}
        onChangeMinRating={setMinRating}
        gridStatusFilter={gridStatusFilter}
        onChangeGridStatusFilter={setGridStatusFilter}
        untaggedOnly={untaggedOnly}
        onToggleUntaggedOnly={() => setUntaggedOnly((v) => !v)}
        onResetFilters={resetSecondaryFilters}
      />

      <StreamVaultScopeActionsSheet
        open={mobileScopeActionsOpen}
        onClose={() => setMobileScopeActionsOpen(false)}
        scope={scope}
        scopeTitle={scopeMeta.title}
        visibleCount={visibleStreams.length}
        canBatchLoad={scopeMeta.canBatchLoad}
        onLoadStack={() =>
          onLoadStreamsToGrid(
            visibleStreams.map((s) => s.id),
            'replace',
            scopeMeta.title,
          )
        }
        onLayerStack={() =>
          onLoadStreamsToGrid(
            visibleStreams.map((s) => s.id),
            'append',
            scopeMeta.title,
          )
        }
        activeStreamsCount={activeStreams.length}
        isAllPaused={isAllPaused}
        allActiveMuted={allActiveMuted}
        onTogglePauseAll={onTogglePauseAll}
        onToggleViewMute={onToggleViewMute}
        onClearStack={onClearStack}
        onEditFolder={
          scope.kind === 'folder' && currentFolder
            ? () => setEditingFolderId(currentFolder.id)
            : undefined
        }
        onStartNewSubfolder={
          scope.kind === 'folder' && currentFolder
            ? () => {
                setCreatingSubfolder(true);
                setSubfolderDraft('');
              }
            : undefined
        }
        onOpenAddStreamsToFolder={
          scope.kind === 'folder' && currentFolder
            ? () => setAddingStreamsToFolderId(currentFolder.id)
            : undefined
        }
        onStartRenameTopic={
          scope.kind === 'topic' && onRenameTopic
            ? () => {
                setTopicRenameDraft(
                  scope.topic === 'Uncategorized' ? '' : scope.topic,
                );
                setRenamingTopic(true);
              }
            : undefined
        }
        onOpenTopicIconModal={
          scope.kind === 'topic' && onSetTopicIcon
            ? () => setTopicIconModalTarget(scope.topic)
            : undefined
        }
        channelPinned={
          scope.kind === 'channel'
            ? Boolean(channelConfigs[scope.channel]?.pinned)
            : false
        }
        channelFavTopCount={singleChannelFavTopIds.length}
        onLoadChannelFavTop={
          scope.kind === 'channel' && singleChannelFavTopIds.length > 0
            ? () =>
                onLoadStreamsToGrid(
                  singleChannelFavTopIds,
                  'replace',
                  `${scope.channel} · Favorites & Top`,
                )
            : undefined
        }
        onTogglePinChannel={
          scope.kind === 'channel'
            ? () => handleTogglePinChannel(scope.channel)
            : undefined
        }
        onStartRenameChannel={
          scope.kind === 'channel'
            ? () => {
                setSingleChannelRenameDraft(
                  scope.channel === 'Unknown Channel' ? '' : scope.channel,
                );
                setRenamingSingleChannel(true);
              }
            : undefined
        }
        onBatchEditChannel={
          scope.kind === 'channel'
            ? () => setChannelBatchTargets([scope.channel])
            : undefined
        }
        onOpenChannelSettings={
          scope.kind === 'channel'
            ? () => setChannelSettingsTarget(scope.channel)
            : undefined
        }
        onDeleteChannel={
          scope.kind === 'channel'
            ? () => {
                const entry = allChannelsDirectory.find(
                  (c) => c.name === scope.channel,
                );
                setChannelDeleteTargets([
                  {
                    name: scope.channel,
                    count: entry?.count ?? visibleStreams.length,
                  },
                ]);
              }
            : undefined
        }
        onOpenCreateDrawer={() => setDrawerState({ open: true, mode: 'create' })}
      />

      {/* Folder Add Existing Streams Modal */}
      <StreamFolderAddStreamsModal
        folder={
          addingStreamsToFolderId
            ? folderById.get(addingStreamsToFolderId) ?? null
            : null
        }
        streams={streams}
        onClose={() => setAddingStreamsToFolderId(null)}
        onAddStreams={handleAddExistingStreamsToFolder}
      />

      {/* Topic Icon Picker Modal */}
      <StreamTopicIconModal
        topicName={topicIconModalTarget}
        currentIcon={
          topicIconModalTarget
            ? topicIcons[topicIconModalTarget.trim().toLowerCase()]
            : undefined
        }
        onClose={() => setTopicIconModalTarget(null)}
        onSelectIcon={(topic, icon) => {
          if (onSetTopicIcon) onSetTopicIcon(topic, icon);
        }}
      />

      {renderDragPreview()}
      {renderChannelDragPreview()}
    </div>
  );
};
