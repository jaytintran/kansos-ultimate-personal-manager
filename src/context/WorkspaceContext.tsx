import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createEmptyWorkspace, createSeedWorkspace, DEFAULT_STREAMER_STATE } from '../data/seedData';
import {
  BookBookmark,
  BookHighlight,
  BookRecord,
  CustomFocusTab,
  Entry,
  EntrySource,
  EntryType,
  EventAttendance,
  FocusBucket,
  GistSyncConfig,
  Habit,
  HabitLog,
  KansoWorkspace,
  LibraryCategory,
  LibraryFolder,
  LibraryViewFolder,
  ListCollection,
  ListCollectionType,
  ListItem,
  ListItemStatus,
  NoteNotebook,
  NoteStatus,
  ScratchpadCard,
  StackSlot,
  StreamFolder,
  StreamItem,
  StreamPreset,
  StreamerState,
  ToastMessage,
  WorkspaceSettings,
} from '../types';
import { libraryDb } from '../lib/db';
import { normalizeLibraryWorkspaceData } from '../lib/migrateLibrary';
import {
  buildDateAtTime,
  formatTime,
  getEntryDayKey,
  getTodayKey,
  parseLocalDateKey,
  toLocalDateKey,
} from '../utils/date';
import { clearAllBookFiles, deleteBookFile } from '../utils/ebookStorage';
import { mergeWorkspaces } from '../utils/gist';
import { syncNativeStatusBar } from '../utils/nativeStatusBar';
import { parseNlpInput } from '../utils/nlp';

const STORAGE_WORKSPACE_KEY = 'kanso_workspace_v1';
const STORAGE_GIST_KEY = 'kanso_gist_config_v1';

const DEFAULT_GIST_CONFIG: GistSyncConfig = {
  token: '',
  gistId: '',
  filename: 'kanso-workspace.json',
  lastSyncedAt: null,
  lastDirection: null,
};

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createDefaultSlot(
  streamId: string,
  overrides?: Partial<Omit<StackSlot, 'slotId' | 'streamId'>>
): StackSlot {
  return {
    slotId: uid('slot'),
    streamId,
    volume: overrides?.volume ?? 100,
    muted: overrides?.muted ?? false,
    loopMode: overrides?.loopMode ?? 'infinite',
    loopCount: Math.max(1, overrides?.loopCount ?? 10),
    playbackRate: overrides?.playbackRate ?? 1,
  };
}

function normalizeStreamerState(
  raw: Partial<StreamerState> | undefined,
  validStreamIds: Set<string>
): StreamerState {
  const merged = { ...DEFAULT_STREAMER_STATE, ...(raw || {}) };
  let slots: StackSlot[];
  if (Array.isArray(merged.activeSlots) && merged.activeSlots.length > 0) {
    slots = merged.activeSlots
      .filter((sl) => sl && validStreamIds.has(sl.streamId))
      .map((sl) => ({
        slotId: sl.slotId || uid('slot'),
        streamId: sl.streamId,
        volume: typeof sl.volume === 'number' ? Math.max(0, Math.min(100, Math.round(sl.volume))) : 100,
        muted: Boolean(sl.muted),
        loopMode: sl.loopMode === 'count' ? 'count' : 'infinite',
        loopCount: typeof sl.loopCount === 'number' && sl.loopCount >= 1 ? Math.round(sl.loopCount) : 10,
        playbackRate: typeof sl.playbackRate === 'number' ? sl.playbackRate : 1,
      }));
  } else if (Array.isArray(merged.activeStreamIds) && merged.activeStreamIds.length > 0) {
    slots = merged.activeStreamIds
      .filter((sid) => validStreamIds.has(sid))
      .map((sid) => createDefaultSlot(sid));
  } else {
    slots = [];
  }
  return {
    ...merged,
    activeSlots: slots,
    activeStreamIds: slots.map((s) => s.streamId),
    viewMode: merged.viewMode || 'grid',
    sizingMode: merged.sizingMode || 'fit',
    masterVolume:
      typeof merged.masterVolume === 'number'
        ? Math.max(0, Math.min(100, Math.round(merged.masterVolume)))
        : 100,
    sidebarOpen: merged.sidebarOpen ?? true,
  };
}

function migrateEntries(rawEntries: Entry[]): Entry[] {
  return rawEntries.map((e) => {
    let source: EntrySource | undefined = e.source;
    if (!source) {
      if (e.focusBucket === 'anchor') source = 'focus-anchor';
      else if (e.focusBucket === 'x-active') source = 'focus-active';
      else if (e.habitId) source = 'habit';
      else source = 'timeline';
    }
    return {
      ...e,
      source,
      tags: Array.isArray(e.tags) ? e.tags : [],
      listIds: Array.isArray(e.listIds) ? e.listIds : [],
    };
  });
}

function loadInitialWorkspace(): KansoWorkspace {
  try {
    const raw = localStorage.getItem(STORAGE_WORKSPACE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<KansoWorkspace>;
      if (parsed && Array.isArray(parsed.entries) && parsed.settings) {
        const empty = createEmptyWorkspace();
        const seed = createSeedWorkspace();
        const hasBooksField = Array.isArray(parsed.books);
        const hasStreamsField = Array.isArray(parsed.streams);
        const hasScratchpadsField = Array.isArray(parsed.scratchpads);
        const hasCustomTabsField = Array.isArray(parsed.customTabs);
        const normalizedLib = hasBooksField
          ? normalizeLibraryWorkspaceData({
              books: parsed.books,
              libraryFolders: parsed.libraryFolders,
              libraryCategories: parsed.libraryCategories,
              libraryViewFolders: parsed.libraryViewFolders,
              bookBookmarks: parsed.bookBookmarks,
              bookHighlights: parsed.bookHighlights,
            })
          : {
              books: seed.books,
              libraryFolders: seed.libraryFolders ?? [],
              libraryCategories: seed.libraryCategories ?? [],
              libraryViewFolders: seed.libraryViewFolders ?? [],
              bookBookmarks: seed.bookBookmarks ?? [],
              bookHighlights: seed.bookHighlights ?? [],
            };
        return {
          ...empty,
          ...parsed,
          version: 3,
          entries: migrateEntries(parsed.entries),
          scratchpads: hasScratchpadsField ? parsed.scratchpads! : seed.scratchpads ?? [],
          customTabs: hasCustomTabsField ? parsed.customTabs! : seed.customTabs ?? [],
          habitLogs: Array.isArray(parsed.habitLogs) ? parsed.habitLogs : [],
          noteNotebooks: Array.isArray(parsed.noteNotebooks)
            ? parsed.noteNotebooks
            : seed.noteNotebooks ?? [],
          books: normalizedLib.books,
          libraryFolders: normalizedLib.libraryFolders,
          libraryCategories: normalizedLib.libraryCategories,
          libraryViewFolders: normalizedLib.libraryViewFolders,
          bookBookmarks: normalizedLib.bookBookmarks,
          bookHighlights: normalizedLib.bookHighlights,
          streams: hasStreamsField ? parsed.streams! : seed.streams,
          streamFolders: Array.isArray(parsed.streamFolders)
            ? parsed.streamFolders
            : hasStreamsField
            ? []
            : seed.streamFolders ?? [],
          streamPresets: Array.isArray(parsed.streamPresets)
            ? parsed.streamPresets
            : hasStreamsField
            ? []
            : seed.streamPresets,
          streamerState: parsed.streamerState
            ? normalizeStreamerState(
                parsed.streamerState,
                new Set((hasStreamsField ? parsed.streams! : seed.streams).map((s) => s.id))
              )
            : hasStreamsField
            ? { ...DEFAULT_STREAMER_STATE }
            : seed.streamerState,
          settings: {
            ...empty.settings,
            ...parsed.settings,
            timelineDisplayMode: parsed.settings.timelineDisplayMode || 'default',
            epubPrefs: {
              ...empty.settings.epubPrefs!,
              ...(parsed.settings.epubPrefs || {}),
            },
          },
        };
      }
    }
  } catch {
    // Fallback to seed data
  }
  return createSeedWorkspace();
}

function loadInitialGistConfig(): GistSyncConfig {
  try {
    const raw = localStorage.getItem(STORAGE_GIST_KEY);
    if (raw) {
      return { ...DEFAULT_GIST_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // Ignore
  }
  return DEFAULT_GIST_CONFIG;
}

interface WorkspaceContextValue {
  workspace: KansoWorkspace;
  gistConfig: GistSyncConfig;
  toasts: ToastMessage[];
  pushToast: (text: string, tone?: ToastMessage['tone']) => void;
  dismissToast: (id: string) => void;

  // Focus & Entry actions
  addFocusItem: (
    bucket: Exclude<FocusBucket, null> | 'custom-tab',
    rawText: string,
    tabId?: string
  ) => boolean;
  clearFocusDayFromView: (dateKey: string) => void;
  addTimelineEntry: (
    type: EntryType,
    rawText: string,
    activeDateKey: string,
    extra?: Partial<Entry>
  ) => Entry | null;
  createEntry: (draft: Partial<Entry>) => Entry;
  addAchievementEntry: (rawText: string) => Entry | null;
  updateEntry: (id: string, patch: Partial<Entry>) => void;
  toggleEntryCompleted: (id: string) => void;
  toggleEntryAchievement: (id: string) => void;
  cycleEventAttendance: (id: string) => void;
  setEventAttendance: (id: string, attendance: EventAttendance) => void;
  deleteEntry: (id: string) => void;
  hardDeleteEntry: (id: string) => void;
  duplicateEntry: (id: string) => Entry | null;
  moveEntryToDate: (id: string, dateKey: string) => void;

  // Scratchpad actions
  addScratchpad: (paletteIndex?: number) => ScratchpadCard;
  updateScratchpad: (id: string, patch: Partial<ScratchpadCard>) => void;
  deleteScratchpad: (id: string) => void;
  sendScratchpadToTimeline: (id: string) => Entry | null;

  // Custom Focus Tabs actions
  addCustomTab: (name: string, color: string) => CustomFocusTab;
  updateCustomTab: (id: string, patch: Partial<CustomFocusTab>) => void;
  deleteCustomTab: (id: string) => void;

  // Notes & Notebooks actions
  addNotePage: (options?: {
    title?: string;
    content?: string;
    notebookId?: string | null;
    parentId?: string | null;
    icon?: string;
    coverPreset?: string | null;
    noteStatus?: NoteStatus;
    tags?: string[];
    favorite?: boolean;
    syncToTimeline?: boolean;
    scheduledAt?: string | null;
  }) => Entry;
  duplicateNotePage: (id: string) => Entry | null;
  archiveNotePage: (id: string, archived: boolean) => void;
  trashNotePage: (id: string) => void;
  restoreNotePage: (id: string) => void;
  permanentlyDeleteNotePage: (id: string) => void;
  emptyNoteTrash: () => void;
  addNoteNotebook: (name: string, icon?: string) => NoteNotebook;
  updateNoteNotebook: (id: string, patch: Partial<NoteNotebook>) => void;
  deleteNoteNotebook: (id: string) => void;

  // Habit actions
  addHabit: (habit: Omit<Habit, 'id' | 'createdAt' | 'completions'>) => Habit;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  toggleHabitCompletion: (habitId: string, dateKey: string) => void;

  // Lists actions
  addList: (
    title: string,
    icon: string,
    color?: string,
    listType?: ListCollectionType
  ) => ListCollection;
  updateList: (id: string, patch: Partial<ListCollection>) => void;
  renameList: (id: string, title: string, icon?: string) => void;
  deleteList: (id: string) => void;
  addListItem: (listId: string, rawText: string, status?: ListItemStatus) => ListItem | null;
  updateListItem: (id: string, patch: Partial<ListItem>) => void;
  deleteListItem: (id: string) => void;

  // Library Studio actions (Gist-synced metadata + IndexedDB annotations)
  addBook: (book: Omit<BookRecord, 'id' | 'addedAt'> & { id?: string; addedAt?: number }) => BookRecord;
  updateBook: (id: string, patch: Partial<BookRecord>) => void;
  deleteBook: (id: string) => void;
  updateLibraryState: (
    updater: (prev: {
      books: BookRecord[];
      libraryFolders: LibraryFolder[];
      libraryCategories: LibraryCategory[];
      libraryViewFolders: LibraryViewFolder[];
      bookBookmarks: BookBookmark[];
      bookHighlights: BookHighlight[];
    }) => Partial<{
      books: BookRecord[];
      libraryFolders: LibraryFolder[];
      libraryCategories: LibraryCategory[];
      libraryViewFolders: LibraryViewFolder[];
      bookBookmarks: BookBookmark[];
      bookHighlights: BookHighlight[];
    }>
  ) => void;
  syncLibraryAnnotationsFromDb: () => Promise<void>;
  sendBookExcerptToNotes: (bookTitle: string, excerptText: string, locationLabel?: string) => Entry;

  // Streamer actions
  addStream: (stream: Omit<StreamItem, 'id' | 'addedAt'>, addToGrid?: boolean) => StreamItem;
  updateStream: (id: string, patch: Partial<StreamItem>) => void;
  deleteStream: (id: string) => void;
  toggleStreamInGrid: (id: string) => void;
  loadStreamsToGrid: (streamIds: string[], mode?: 'replace' | 'append', label?: string) => void;
  addStreamSlot: (
    streamId: string,
    overrides?: Partial<Omit<StackSlot, 'slotId' | 'streamId'>>
  ) => StackSlot | null;
  updateStreamSlot: (slotId: string, patch: Partial<StackSlot>) => void;
  updateAllStreamSlots: (updater: (slot: StackSlot) => StackSlot) => void;
  removeStreamSlot: (slotId: string) => void;
  clearStreamSlots: () => void;
  reorderActiveSlots: (fromIndex: number, toIndex: number) => void;
  incrementStreamListen: (id: string) => void;
  addStreamFolder: (name: string, parentId?: string | null, description?: string) => StreamFolder;
  updateStreamFolder: (id: string, patch: Partial<StreamFolder>) => void;
  deleteStreamFolder: (id: string) => void;
  reorderActiveStreams: (fromIndex: number, toIndex: number) => void;
  updateStreamerState: (patch: Partial<StreamerState>) => void;
  saveStreamPreset: (name: string, category?: string) => StreamPreset;
  loadStreamPreset: (presetId: string) => void;
  deleteStreamPreset: (presetId: string) => void;

  // Settings, Sync & Reset
  updateSettings: (patch: Partial<WorkspaceSettings>) => void;
  updateGistConfig: (patch: Partial<GistSyncConfig>) => void;
  replaceWorkspace: (next: KansoWorkspace, toastMessage?: string) => void;
  mergeRemoteWorkspace: (remote: KansoWorkspace, toastMessage?: string) => KansoWorkspace;
  clearWorkspaceData: () => void;
  restoreSampleData: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workspace, setWorkspace] = useState<KansoWorkspace>(loadInitialWorkspace);
  const [gistConfig, setGistConfig] = useState<GistSyncConfig>(loadInitialGistConfig);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((text: string, tone: ToastMessage['tone'] = 'neutral') => {
    const id = uid('toast');
    setToasts((prev) => [...prev.slice(-3), { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Persist workspace to localStorage offline
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_WORKSPACE_KEY, JSON.stringify(workspace));
    } catch {
      // Storage quota safeguard
    }
  }, [workspace]);

  // Persist gist config locally
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_GIST_KEY, JSON.stringify(gistConfig));
    } catch {
      // Ignore
    }
  }, [gistConfig]);

  // Apply theme & light/dark mode to <html> and sync native Android StatusBar
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', workspace.settings.theme);
    if (workspace.settings.colorMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    void syncNativeStatusBar(workspace.settings.theme, workspace.settings.colorMode);
  }, [workspace.settings.theme, workspace.settings.colorMode]);

  // Hydrate IndexedDB bookmarks & highlights on startup from workspace (supports Gist sync & seed data)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dbBookmarks, dbHighlights] = await Promise.all([
          libraryDb.getAllBookmarks(),
          libraryDb.getAllHighlights(),
        ]);
        if (cancelled) return;

        const wsBookmarks = workspace.bookBookmarks ?? [];
        const wsHighlights = workspace.bookHighlights ?? [];

        // If IndexedDB is empty but workspace has synced/seeded annotations, seed IndexedDB
        if (dbBookmarks.length === 0 && wsBookmarks.length > 0) {
          for (const bm of wsBookmarks) await libraryDb.saveBookmark(bm);
        }
        if (dbHighlights.length === 0 && wsHighlights.length > 0) {
          for (const hl of wsHighlights) await libraryDb.saveHighlight(hl);
        }
      } catch {
        // IndexedDB may be unavailable in restricted contexts
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once on initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mutateWorkspace = useCallback((updater: (prev: KansoWorkspace) => KansoWorkspace) => {
    setWorkspace((prev) => {
      const next = updater(prev);
      return { ...next, updatedAt: new Date().toISOString() };
    });
  }, []);

  const addFocusItem = useCallback(
    (
      bucket: Exclude<FocusBucket, null> | 'custom-tab',
      rawText: string,
      tabId?: string
    ): boolean => {
      const trimmed = rawText.trim();
      if (!trimmed) return false;

      const todayKey = getTodayKey();
      const parsed = parseNlpInput(trimmed, todayKey, workspace.settings.timeFormat);
      const nowIso = new Date().toISOString();

      if (bucket === 'x-active') {
        const activeCount = workspace.entries.filter(
          (e) =>
            !e.deletedAt &&
            (e.source === 'focus-active' || e.focusBucket === 'x-active') &&
            !e.completed
        ).length;
        if (activeCount >= workspace.settings.xActiveLimit) {
          return false;
        }
      }

      if (bucket === 'anchor') {
        const anchorEntry: Entry = {
          id: uid('ent'),
          type: 'task',
          title: parsed.cleanTitle,
          content: '',
          createdAt: nowIso,
          updatedAt: nowIso,
          scheduledAt: parsed.scheduledAt || nowIso,
          completedAt: null,
          endAt: parsed.endAt,
          completed: false,
          focusBucket: 'anchor',
          source: 'focus-anchor',
          tags: parsed.tags,
          listIds: [],
        };
        mutateWorkspace((prev) => ({
          ...prev,
          entries: [anchorEntry, ...prev.entries],
        }));
        return true;
      }

      if (bucket === 'x-active') {
        const xEntry: Entry = {
          id: uid('ent'),
          type: 'task',
          title: parsed.cleanTitle,
          content: '',
          createdAt: nowIso,
          updatedAt: nowIso,
          scheduledAt: parsed.scheduledAt,
          completedAt: null,
          endAt: parsed.endAt,
          completed: false,
          focusBucket: 'x-active',
          source: 'focus-active',
          tags: parsed.tags,
          listIds: [],
        };
        mutateWorkspace((prev) => ({
          ...prev,
          entries: [xEntry, ...prev.entries],
        }));
        return true;
      }

      if (bucket === 'custom-tab') {
        const customEntry: Entry = {
          id: uid('ent'),
          type: 'task',
          title: parsed.cleanTitle,
          content: '',
          createdAt: nowIso,
          updatedAt: nowIso,
          scheduledAt: parsed.scheduledAt,
          completedAt: null,
          endAt: parsed.endAt,
          completed: false,
          focusBucket: null,
          source: 'custom-tab',
          tabId: tabId ?? null,
          tags: parsed.tags,
          listIds: [],
        };
        mutateWorkspace((prev) => ({
          ...prev,
          entries: [customEntry, ...prev.entries],
        }));
        return true;
      }

      // bucket === 'completed': Log Done creates a born-completed log entry appearing in both Focus & Timeline
      const finishedTime = parsed.scheduledAt || nowIso;
      const logEntry: Entry = {
        id: uid('ent'),
        type: 'log',
        title: parsed.cleanTitle,
        content: '',
        createdAt: finishedTime,
        updatedAt: nowIso,
        scheduledAt: parsed.scheduledAt,
        completedAt: finishedTime,
        endAt: parsed.endAt,
        completed: true,
        focusBucket: 'completed',
        source: 'timeline',
        tags: parsed.tags,
        listIds: [],
      };

      mutateWorkspace((prev) => ({
        ...prev,
        entries: [logEntry, ...prev.entries],
      }));
      pushToast(
        `Logged at ${formatTime(finishedTime, workspace.settings.timeFormat)}`,
        'success'
      );
      return true;
    },
    [
      workspace.entries,
      workspace.settings.timeFormat,
      workspace.settings.xActiveLimit,
      mutateWorkspace,
      pushToast,
    ]
  );

  const clearFocusDayFromView = useCallback(
    (dateKey: string) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        entries: prev.entries.map((entry) => {
          if (entry.deletedAt || !entry.completed) return entry;
          const belongsToFocus =
            entry.focusBucket !== null ||
            entry.source === 'focus-anchor' ||
            entry.source === 'focus-active';
          if (!belongsToFocus) return entry;
          const dayKey = getEntryDayKey(entry);
          if (dayKey !== dateKey) return entry;
          return {
            ...entry,
            source: 'timeline',
            focusBucket: null,
            updatedAt: nowIso,
          };
        }),
      }));
      pushToast('Cleared from Focus View (kept in Timeline)');
    },
    [mutateWorkspace, pushToast]
  );

  const addTimelineEntry = useCallback(
    (
      type: EntryType,
      rawText: string,
      activeDateKey: string,
      extra?: Partial<Entry>
    ): Entry | null => {
      const trimmed = rawText.trim();
      if (!trimmed) return null;

      const parsed = parseNlpInput(trimmed, activeDateKey, workspace.settings.timeFormat);
      const effectiveType: EntryType = parsed.detectedType || type;
      const now = new Date();
      const nowIso = now.toISOString();
      const todayKey = getTodayKey();

      const defaultIsoForDay =
        activeDateKey === todayKey
          ? nowIso
          : buildDateAtTime(activeDateKey, now.getHours(), now.getMinutes());

      let scheduledAt = parsed.scheduledAt;
      let endAt = parsed.endAt;

      if (effectiveType === 'timeblock') {
        scheduledAt = scheduledAt || defaultIsoForDay;
        if (!endAt) {
          endAt = new Date(new Date(scheduledAt).getTime() + 60 * 60 * 1000).toISOString();
        }
      } else if (effectiveType === 'event') {
        scheduledAt = scheduledAt || defaultIsoForDay;
      }

      const isLog = effectiveType === 'log';
      const newEntry: Entry = {
        id: uid('ent'),
        type: effectiveType,
        title: parsed.cleanTitle,
        content: '',
        createdAt: isLog ? parsed.scheduledAt || defaultIsoForDay : defaultIsoForDay,
        updatedAt: nowIso,
        scheduledAt,
        completedAt: isLog ? parsed.scheduledAt || defaultIsoForDay : null,
        endAt,
        completed: isLog,
        focusBucket: null,
        source: extra?.source ?? 'timeline',
        tags: parsed.tags,
        listIds: [],
        syncToTimeline: effectiveType === 'note' ? true : undefined,
        eventCategory: effectiveType === 'event' ? 'personal' : undefined,
        attendance: effectiveType === 'event' ? null : undefined,
        ...extra,
      };

      mutateWorkspace((prev) => ({
        ...prev,
        entries: [newEntry, ...prev.entries],
      }));

      return newEntry;
    },
    [workspace.settings.timeFormat, mutateWorkspace]
  );

  const createEntry = useCallback(
    (draft: Partial<Entry>): Entry => {
      const nowIso = new Date().toISOString();
      const type: EntryType = draft.type || 'note';
      const entry: Entry = {
        id: uid('ent'),
        type,
        title: draft.title?.trim() || (type === 'note' ? 'Untitled Note' : 'Untitled'),
        content: draft.content ?? '',
        createdAt: draft.createdAt ?? nowIso,
        updatedAt: nowIso,
        scheduledAt: draft.scheduledAt ?? null,
        completedAt: draft.completedAt ?? (type === 'log' ? nowIso : null),
        endAt: draft.endAt ?? null,
        completed: draft.completed ?? type === 'log',
        focusBucket: draft.focusBucket ?? null,
        source: draft.source ?? 'timeline',
        tabId: draft.tabId ?? null,
        tags: draft.tags ?? [],
        pinned: draft.pinned ?? false,
        location: draft.location ?? '',
        isAchievement: draft.isAchievement ?? false,
        eventCategory:
          type === 'event' ? draft.eventCategory ?? 'personal' : draft.eventCategory,
        attendance: type === 'event' ? draft.attendance ?? null : draft.attendance,
        listIds: draft.listIds ?? [],
        syncToTimeline: draft.syncToTimeline ?? (type === 'note' ? false : undefined),
        ...draft,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        entries: [entry, ...prev.entries],
      }));
      return entry;
    },
    [mutateWorkspace]
  );

  const addAchievementEntry = useCallback(
    (rawText: string): Entry | null => {
      const trimmed = rawText.trim();
      if (!trimmed) return null;
      const nowIso = new Date().toISOString();
      const parsed = parseNlpInput(trimmed, getTodayKey(), workspace.settings.timeFormat);
      const finishedIso = parsed.scheduledAt || nowIso;
      const entry: Entry = {
        id: uid('ent'),
        type: parsed.detectedType && parsed.detectedType !== 'note' ? parsed.detectedType : 'log',
        title: parsed.cleanTitle,
        content: '',
        createdAt: finishedIso,
        updatedAt: nowIso,
        scheduledAt: parsed.scheduledAt,
        completedAt: finishedIso,
        endAt: parsed.endAt,
        completed: true,
        focusBucket: null,
        source: 'achievement',
        isAchievement: true,
        tags: parsed.tags,
        listIds: [],
      };
      mutateWorkspace((prev) => ({
        ...prev,
        entries: [entry, ...prev.entries],
      }));
      pushToast('Achievement recorded', 'success');
      return entry;
    },
    [workspace.settings.timeFormat, mutateWorkspace, pushToast]
  );

  const updateEntry = useCallback(
    (id: string, patch: Partial<Entry>) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        entries: prev.entries.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                ...patch,
                updatedAt: patch.updatedAt ?? nowIso,
              }
            : entry
        ),
      }));
    },
    [mutateWorkspace]
  );

  const toggleEntryCompleted = useCallback(
    (id: string) => {
      const target = workspace.entries.find((e) => e.id === id);
      if (!target) return;

      const nextCompleted = !target.completed;
      const nowIso = new Date().toISOString();

      // If reopening an X-Active task, verify capacity
      if (!nextCompleted && (target.source === 'focus-active' || target.focusBucket === 'x-active')) {
        const activeCount = workspace.entries.filter(
          (e) =>
            !e.deletedAt &&
            (e.source === 'focus-active' || e.focusBucket === 'x-active') &&
            !e.completed
        ).length;
        if (activeCount >= workspace.settings.xActiveLimit) {
          pushToast(
            `Cannot reopen: X-Active already has ${workspace.settings.xActiveLimit} active tasks.`,
            'error'
          );
          return;
        }
      }

      mutateWorkspace((prev) => ({
        ...prev,
        entries: prev.entries.map((e) =>
          e.id === id
            ? {
                ...e,
                completed: nextCompleted,
                completedAt: nextCompleted ? nowIso : null,
                // Un-completing a task auto-clears isAchievement
                isAchievement: nextCompleted ? e.isAchievement : false,
                updatedAt: nowIso,
              }
            : e
        ),
      }));

      if (nextCompleted && (target.focusBucket !== null || target.source === 'focus-anchor' || target.source === 'focus-active')) {
        pushToast(
          `Completed at ${formatTime(nowIso, workspace.settings.timeFormat)}`,
          'success'
        );
      }
    },
    [
      workspace.entries,
      workspace.settings.timeFormat,
      workspace.settings.xActiveLimit,
      mutateWorkspace,
      pushToast,
    ]
  );

  const toggleEntryAchievement = useCallback(
    (id: string) => {
      const target = workspace.entries.find((e) => e.id === id);
      if (!target) return;
      const eligible =
        target.type === 'log' ||
        target.type === 'event' ||
        (target.type === 'task' && target.completed);
      if (!eligible) return;
      const nextVal = !target.isAchievement;
      const nowIso = new Date().toISOString();
      updateEntry(id, {
        isAchievement: nextVal,
        completedAt: nextVal ? target.completedAt || nowIso : target.completedAt,
      });
      pushToast(nextVal ? 'Marked as Achievement' : 'Removed from Achievements', 'success');
    },
    [workspace.entries, updateEntry, pushToast]
  );

  const setEventAttendance = useCallback(
    (id: string, attendance: EventAttendance) => {
      const target = workspace.entries.find((e) => e.id === id);
      if (!target) return;
      const nowIso = new Date().toISOString();
      updateEntry(id, {
        attendance,
        completed: attendance === 'attended',
        completedAt: attendance === 'attended' ? target.completedAt || nowIso : null,
      });
    },
    [workspace.entries, updateEntry]
  );

  const cycleEventAttendance = useCallback(
    (id: string) => {
      const target = workspace.entries.find((e) => e.id === id);
      if (!target) return;
      const next: EventAttendance =
        !target.attendance ? 'attended' : target.attendance === 'attended' ? 'missed' : null;
      setEventAttendance(id, next);
    },
    [workspace.entries, setEventAttendance]
  );

  const deleteEntry = useCallback(
    (id: string) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        entries: prev.entries.map((e) =>
          e.id === id ? { ...e, deletedAt: nowIso, updatedAt: nowIso } : e
        ),
      }));
    },
    [mutateWorkspace]
  );

  const hardDeleteEntry = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        entries: prev.entries.filter((e) => e.id !== id),
      }));
    },
    [mutateWorkspace]
  );

  const duplicateEntry = useCallback(
    (id: string): Entry | null => {
      const original = workspace.entries.find((e) => e.id === id);
      if (!original) return null;
      const nowIso = new Date().toISOString();
      const copy: Entry = {
        ...original,
        id: uid('ent'),
        title: `${original.title} (Copy)`,
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
        focusBucket: original.focusBucket === 'x-active' ? null : original.focusBucket,
        source: original.source === 'focus-active' ? 'timeline' : original.source,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        entries: [copy, ...prev.entries],
      }));
      pushToast('Entry duplicated');
      return copy;
    },
    [workspace.entries, mutateWorkspace, pushToast]
  );

  const moveEntryToDate = useCallback(
    (id: string, dateKey: string) => {
      const target = workspace.entries.find((e) => e.id === id);
      if (!target) return;

      const shiftIsoToDay = (iso: string | null): string | null => {
        if (!iso) return null;
        const oldDate = new Date(iso);
        const nextDate = parseLocalDateKey(dateKey);
        nextDate.setHours(oldDate.getHours(), oldDate.getMinutes(), oldDate.getSeconds(), 0);
        return nextDate.toISOString();
      };

      const patch: Partial<Entry> = {};
      if (target.completedAt && target.completed) {
        patch.completedAt = shiftIsoToDay(target.completedAt);
      } else if (target.scheduledAt) {
        patch.scheduledAt = shiftIsoToDay(target.scheduledAt);
        if (target.endAt) {
          const duration =
            new Date(target.endAt).getTime() - new Date(target.scheduledAt).getTime();
          patch.endAt = new Date(
            new Date(patch.scheduledAt!).getTime() + Math.max(duration, 15 * 60 * 1000)
          ).toISOString();
        }
      } else {
        patch.createdAt = shiftIsoToDay(target.createdAt) || buildDateAtTime(dateKey, 9, 0);
      }

      updateEntry(id, patch);
      pushToast(`Moved to ${toLocalDateKey(dateKey)}`);
    },
    [workspace.entries, updateEntry, pushToast]
  );

  // Scratchpad actions
  const addScratchpad = useCallback(
    (paletteIndex = 0): ScratchpadCard => {
      const nowIso = new Date().toISOString();
      const card: ScratchpadCard = {
        id: uid('pad'),
        content: '',
        paletteIndex: paletteIndex % 5,
        pinned: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        scratchpads: [card, ...(prev.scratchpads ?? [])],
      }));
      return card;
    },
    [mutateWorkspace]
  );

  const updateScratchpad = useCallback(
    (id: string, patch: Partial<ScratchpadCard>) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        scratchpads: (prev.scratchpads ?? []).map((c) =>
          c.id === id ? { ...c, ...patch, updatedAt: nowIso } : c
        ),
      }));
    },
    [mutateWorkspace]
  );

  const deleteScratchpad = useCallback(
    (id: string) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        scratchpads: (prev.scratchpads ?? []).map((c) =>
          c.id === id ? { ...c, deletedAt: nowIso, updatedAt: nowIso } : c
        ),
      }));
    },
    [mutateWorkspace]
  );

  const sendScratchpadToTimeline = useCallback(
    (id: string): Entry | null => {
      const card = (workspace.scratchpads ?? []).find((c) => c.id === id && !c.deletedAt);
      if (!card) return null;
      const lines = card.content
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const title = lines[0]?.slice(0, 90) || 'Scratchpad Note';
      const bodyLines = lines.length > 1 ? lines.slice(1) : lines;
      const htmlContent = bodyLines
        .map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('');
      const nowIso = new Date().toISOString();
      const noteEntry: Entry = {
        id: uid('ent'),
        type: 'note',
        title,
        content: htmlContent,
        createdAt: nowIso,
        updatedAt: nowIso,
        scheduledAt: null,
        completedAt: null,
        endAt: null,
        completed: false,
        focusBucket: null,
        source: 'timeline',
        syncToTimeline: true,
        tags: ['scratchpad'],
        listIds: [],
      };
      mutateWorkspace((prev) => ({
        ...prev,
        entries: [noteEntry, ...prev.entries],
        scratchpads: (prev.scratchpads ?? []).map((c) =>
          c.id === id ? { ...c, deletedAt: nowIso, updatedAt: nowIso } : c
        ),
      }));
      pushToast('Sent sticky note to Timeline', 'success');
      return noteEntry;
    },
    [workspace.scratchpads, mutateWorkspace, pushToast]
  );

  // Custom Focus Tabs actions
  const addCustomTab = useCallback(
    (name: string, color: string): CustomFocusTab => {
      const nowIso = new Date().toISOString();
      const tab: CustomFocusTab = {
        id: uid('ftab'),
        name: name.trim() || 'Focus Tab',
        color,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        customTabs: [...(prev.customTabs ?? []), tab],
      }));
      pushToast(`Tab "${tab.name}" created`, 'success');
      return tab;
    },
    [mutateWorkspace, pushToast]
  );

  const updateCustomTab = useCallback(
    (id: string, patch: Partial<CustomFocusTab>) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        customTabs: (prev.customTabs ?? []).map((t) =>
          t.id === id ? { ...t, ...patch, updatedAt: nowIso } : t
        ),
      }));
    },
    [mutateWorkspace]
  );

  const deleteCustomTab = useCallback(
    (id: string) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        customTabs: (prev.customTabs ?? []).map((t) =>
          t.id === id ? { ...t, deletedAt: nowIso, updatedAt: nowIso } : t
        ),
        entries: prev.entries.map((e) =>
          e.tabId === id ? { ...e, deletedAt: nowIso, updatedAt: nowIso } : e
        ),
      }));
      pushToast('Custom tab and its tasks deleted');
    },
    [mutateWorkspace, pushToast]
  );

  // Notes & Notebooks actions
  const addNotePage = useCallback(
    (options?: {
      title?: string;
      content?: string;
      notebookId?: string | null;
      parentId?: string | null;
      icon?: string;
      coverPreset?: string | null;
      noteStatus?: NoteStatus;
      tags?: string[];
      favorite?: boolean;
      syncToTimeline?: boolean;
      scheduledAt?: string | null;
    }): Entry => {
      const nowIso = new Date().toISOString();
      const note: Entry = {
        id: uid('ent'),
        type: 'note',
        title: options?.title ?? 'Untitled Note',
        content: options?.content ?? '',
        createdAt: nowIso,
        updatedAt: nowIso,
        scheduledAt: options?.scheduledAt ?? null,
        completedAt: null,
        endAt: null,
        completed: false,
        focusBucket: null,
        tags: options?.tags ?? [],
        pinned: false,
        parentId: options?.parentId ?? null,
        notebookId: options?.notebookId ?? null,
        icon: options?.icon ?? '📝',
        coverPreset: options?.coverPreset ?? null,
        noteStatus: options?.noteStatus ?? 'draft',
        favorite: options?.favorite ?? false,
        archived: false,
        trashedAt: null,
        syncToTimeline: options?.syncToTimeline ?? Boolean(options?.scheduledAt),
        editorWidth: 'normal',
        editorFont: 'sans',
      };
      mutateWorkspace((prev) => ({
        ...prev,
        entries: [note, ...prev.entries],
      }));
      return note;
    },
    [mutateWorkspace]
  );

  const duplicateNotePage = useCallback(
    (id: string): Entry | null => {
      const orig = workspace.entries.find((e) => e.id === id && e.type === 'note');
      if (!orig) return null;
      const nowIso = new Date().toISOString();
      const copy: Entry = {
        ...orig,
        id: uid('ent'),
        title: orig.title ? `${orig.title} (Copy)` : 'Untitled Note (Copy)',
        createdAt: nowIso,
        updatedAt: nowIso,
        trashedAt: null,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        entries: [copy, ...prev.entries],
      }));
      pushToast('Note duplicated', 'success');
      return copy;
    },
    [workspace.entries, mutateWorkspace, pushToast]
  );

  const archiveNotePage = useCallback(
    (id: string, archived: boolean) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        entries: prev.entries.map((e) =>
          e.id === id
            ? {
                ...e,
                archived,
                noteStatus: archived ? 'archived' : e.noteStatus === 'archived' ? 'active' : e.noteStatus ?? 'active',
                updatedAt: nowIso,
              }
            : e
        ),
      }));
      pushToast(archived ? 'Moved note to Archive' : 'Restored from Archive');
    },
    [mutateWorkspace, pushToast]
  );

  const trashNotePage = useCallback(
    (id: string) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => {
        const toTrash = new Set<string>([id]);
        let added = true;
        while (added) {
          added = false;
          for (const e of prev.entries) {
            if (e.type === 'note' && e.parentId && toTrash.has(e.parentId) && !toTrash.has(e.id)) {
              toTrash.add(e.id);
              added = true;
            }
          }
        }
        return {
          ...prev,
          entries: prev.entries.map((e) =>
            toTrash.has(e.id) ? { ...e, trashedAt: nowIso, updatedAt: nowIso } : e
          ),
        };
      });
      pushToast('Moved to Trash');
    },
    [mutateWorkspace, pushToast]
  );

  const restoreNotePage = useCallback(
    (id: string) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => {
        const toRestore = new Set<string>([id]);
        let added = true;
        while (added) {
          added = false;
          for (const e of prev.entries) {
            if (e.type === 'note' && e.parentId && toRestore.has(e.parentId) && !toRestore.has(e.id)) {
              toRestore.add(e.id);
              added = true;
            }
          }
        }
        const entryMap = new Map(prev.entries.map((e) => [e.id, e]));
        return {
          ...prev,
          entries: prev.entries.map((e) => {
            if (!toRestore.has(e.id)) return e;
            const parent = e.parentId ? entryMap.get(e.parentId) : null;
            const keepParent = parent && (!parent.trashedAt || toRestore.has(parent.id));
            return {
              ...e,
              trashedAt: null,
              parentId: keepParent ? e.parentId : null,
              updatedAt: nowIso,
            };
          }),
        };
      });
      pushToast('Note restored', 'success');
    },
    [mutateWorkspace, pushToast]
  );

  const permanentlyDeleteNotePage = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => {
        const target = prev.entries.find((e) => e.id === id);
        const fallbackParent = target?.parentId ?? null;
        return {
          ...prev,
          entries: prev.entries
            .filter((e) => e.id !== id)
            .map((e) =>
              e.type === 'note' && e.parentId === id ? { ...e, parentId: fallbackParent } : e
            ),
        };
      });
      pushToast('Permanently deleted note');
    },
    [mutateWorkspace, pushToast]
  );

  const emptyNoteTrash = useCallback(() => {
    mutateWorkspace((prev) => ({
      ...prev,
      entries: prev.entries.filter((e) => !(e.type === 'note' && Boolean(e.trashedAt))),
    }));
    pushToast('Trash emptied');
  }, [mutateWorkspace, pushToast]);

  const addNoteNotebook = useCallback(
    (name: string, icon = '📓'): NoteNotebook => {
      const trimmed = name.trim() || 'Untitled Notebook';
      const created: NoteNotebook = {
        id: uid('nb'),
        name: trimmed,
        icon,
        createdAt: new Date().toISOString(),
      };
      mutateWorkspace((prev) => ({
        ...prev,
        noteNotebooks: [...(prev.noteNotebooks ?? []), created],
      }));
      pushToast(`Notebook "${trimmed}" created`, 'success');
      return created;
    },
    [mutateWorkspace, pushToast]
  );

  const updateNoteNotebook = useCallback(
    (id: string, patch: Partial<NoteNotebook>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        noteNotebooks: (prev.noteNotebooks ?? []).map((nb) =>
          nb.id === id ? { ...nb, ...patch } : nb
        ),
      }));
    },
    [mutateWorkspace]
  );

  const deleteNoteNotebook = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        noteNotebooks: (prev.noteNotebooks ?? []).filter((nb) => nb.id !== id),
        entries: prev.entries.map((e) =>
          e.type === 'note' && e.notebookId === id ? { ...e, notebookId: null } : e
        ),
      }));
      pushToast('Notebook deleted (notes preserved)');
    },
    [mutateWorkspace, pushToast]
  );

  // Habits
  const addHabit = useCallback(
    (habit: Omit<Habit, 'id' | 'createdAt' | 'completions'>): Habit => {
      const nowIso = new Date().toISOString();
      const newHabit: Habit = {
        ...habit,
        id: uid('hab'),
        createdAt: nowIso,
        updatedAt: nowIso,
        completions: {},
      };
      mutateWorkspace((prev) => ({
        ...prev,
        habits: [...prev.habits, newHabit],
      }));
      pushToast(`Habit "${habit.title}" created`, 'success');
      return newHabit;
    },
    [mutateWorkspace, pushToast]
  );

  const updateHabit = useCallback(
    (id: string, patch: Partial<Habit>) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        habits: prev.habits.map((h) =>
          h.id === id ? { ...h, ...patch, updatedAt: nowIso } : h
        ),
      }));
    },
    [mutateWorkspace]
  );

  const deleteHabit = useCallback(
    (id: string) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        habits: prev.habits.map((h) =>
          h.id === id ? { ...h, deletedAt: nowIso, updatedAt: nowIso } : h
        ),
        habitLogs: (prev.habitLogs ?? []).map((hl) =>
          hl.habitId === id ? { ...hl, deletedAt: nowIso, updatedAt: nowIso } : hl
        ),
        entries: prev.entries.map((e) =>
          e.habitId === id ? { ...e, deletedAt: nowIso, updatedAt: nowIso } : e
        ),
      }));
      pushToast('Habit deleted');
    },
    [mutateWorkspace, pushToast]
  );

  const toggleHabitCompletion = useCallback(
    (habitId: string, dateKey: string) => {
      const now = new Date();
      const nowIso = now.toISOString();
      const todayKey = getTodayKey();
      const logIso =
        dateKey === todayKey
          ? nowIso
          : buildDateAtTime(dateKey, now.getHours(), now.getMinutes());

      mutateWorkspace((prev) => {
        const habit = prev.habits.find((h) => h.id === habitId);
        if (!habit) return prev;
        const wasDone = Boolean(habit.completions[dateKey]);

        const nextHabits = prev.habits.map((h) => {
          if (h.id !== habitId) return h;
          const nextCompletions = { ...h.completions };
          if (wasDone) {
            delete nextCompletions[dateKey];
          } else {
            nextCompletions[dateKey] = true;
          }
          return { ...h, completions: nextCompletions, updatedAt: nowIso };
        });

        if (wasDone) {
          // Turning OFF: soft-delete matching HabitLog and linked Timeline entry
          return {
            ...prev,
            habits: nextHabits,
            habitLogs: (prev.habitLogs ?? []).map((hl) =>
              hl.habitId === habitId && hl.dateKey === dateKey && !hl.deletedAt
                ? { ...hl, deletedAt: nowIso, updatedAt: nowIso }
                : hl
            ),
            entries: prev.entries.map((e) =>
              e.habitId === habitId && e.habitDateKey === dateKey && !e.deletedAt
                ? { ...e, deletedAt: nowIso, updatedAt: nowIso }
                : e
            ),
          };
        }

        // Turning ON: create linked Timeline log entry + HabitLog record
        const entryId = uid('ent');
        const linkedEntry: Entry = {
          id: entryId,
          type: 'log',
          title: `Completed habit: ${habit.title}`,
          content: '',
          createdAt: logIso,
          updatedAt: nowIso,
          scheduledAt: null,
          completedAt: logIso,
          endAt: null,
          completed: true,
          focusBucket: null,
          source: 'habit',
          habitId,
          habitDateKey: dateKey,
          tags: ['habit'],
          listIds: [],
        };
        const habitLog: HabitLog = {
          id: uid('hlog'),
          habitId,
          dateKey,
          entryId,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        return {
          ...prev,
          habits: nextHabits,
          habitLogs: [habitLog, ...(prev.habitLogs ?? [])],
          entries: [linkedEntry, ...prev.entries],
        };
      });
    },
    [mutateWorkspace]
  );

  // Lists
  const addList = useCallback(
    (
      title: string,
      icon: string,
      color = '#6366f1',
      listType: ListCollectionType = 'custom'
    ): ListCollection => {
      const nowIso = new Date().toISOString();
      const created: ListCollection = {
        id: uid('list'),
        title: title.trim() || 'Untitled List',
        icon,
        color,
        listType,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        lists: [...prev.lists, created],
      }));
      pushToast(`Created list "${created.title}"`, 'success');
      return created;
    },
    [mutateWorkspace, pushToast]
  );

  const updateList = useCallback(
    (id: string, patch: Partial<ListCollection>) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        lists: prev.lists.map((l) =>
          l.id === id ? { ...l, ...patch, updatedAt: nowIso } : l
        ),
      }));
    },
    [mutateWorkspace]
  );

  const renameList = useCallback(
    (id: string, title: string, icon?: string) => {
      updateList(id, { title: title.trim() || undefined, icon });
    },
    [updateList]
  );

  const deleteList = useCallback(
    (id: string) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        lists: prev.lists.map((l) =>
          l.id === id ? { ...l, deletedAt: nowIso, updatedAt: nowIso } : l
        ),
        listItems: prev.listItems.map((item) =>
          item.listId === id ? { ...item, deletedAt: nowIso, updatedAt: nowIso } : item
        ),
        entries: prev.entries.map((entry) =>
          entry.listIds && entry.listIds.includes(id)
            ? {
                ...entry,
                listIds: entry.listIds.filter((lid) => lid !== id),
                updatedAt: nowIso,
              }
            : entry
        ),
      }));
      pushToast('List deleted');
    },
    [mutateWorkspace, pushToast]
  );

  const addListItem = useCallback(
    (listId: string, rawText: string, status: ListItemStatus = 'inbox'): ListItem | null => {
      const trimmed = rawText.trim();
      if (!trimmed) return null;
      const parsed = parseNlpInput(trimmed, getTodayKey(), workspace.settings.timeFormat);
      const nowIso = new Date().toISOString();
      const item: ListItem = {
        id: uid('li'),
        listId,
        title: parsed.cleanTitle,
        subtitle: '',
        status,
        tags: parsed.tags,
        content: '',
        scheduledAt: parsed.scheduledAt,
        completedAt: status === 'done' ? nowIso : null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        listItems: [item, ...prev.listItems],
      }));
      return item;
    },
    [workspace.settings.timeFormat, mutateWorkspace]
  );

  const updateListItem = useCallback(
    (id: string, patch: Partial<ListItem>) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        listItems: prev.listItems.map((item) => {
          if (item.id !== id) return item;
          let completedAt = item.completedAt ?? null;
          if (patch.completedAt !== undefined) {
            completedAt = patch.completedAt;
          } else if (patch.status === 'done' && item.status !== 'done') {
            completedAt = nowIso;
          } else if (patch.status && patch.status !== 'done') {
            completedAt = null;
          }
          return { ...item, ...patch, completedAt, updatedAt: nowIso };
        }),
      }));
    },
    [mutateWorkspace]
  );

  const deleteListItem = useCallback(
    (id: string) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        listItems: prev.listItems.map((item) =>
          item.id === id ? { ...item, deletedAt: nowIso, updatedAt: nowIso } : item
        ),
      }));
    },
    [mutateWorkspace]
  );

  // Library Studio (Ebook Manager & Reader)
  const addBook = useCallback(
    (book: Omit<BookRecord, 'id' | 'addedAt'> & { id?: string; addedAt?: number }): BookRecord => {
      const created: BookRecord = {
        ...book,
        id: book.id || uid('book'),
        addedAt: book.addedAt ?? Date.now(),
      };
      mutateWorkspace((prev) => ({
        ...prev,
        books: [created, ...prev.books],
      }));
      return created;
    },
    [mutateWorkspace]
  );

  const updateBook = useCallback(
    (id: string, patch: Partial<BookRecord>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        books: prev.books.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      }));
    },
    [mutateWorkspace]
  );

  const deleteBook = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        books: prev.books.filter((b) => b.id !== id),
        bookBookmarks: (prev.bookBookmarks ?? []).filter((bm) => bm.bookId !== id),
        bookHighlights: (prev.bookHighlights ?? []).filter((hl) => hl.bookId !== id),
        libraryViewFolders: (prev.libraryViewFolders ?? []).map((vf) => ({
          ...vf,
          bookIds: vf.bookIds.filter((bid) => bid !== id),
        })),
      }));
      void deleteBookFile(id);
      void libraryDb.deleteBookData(id);
      pushToast('Book removed from Library');
    },
    [mutateWorkspace, pushToast]
  );

  const updateLibraryState = useCallback(
    (
      updater: (prev: {
        books: BookRecord[];
        libraryFolders: LibraryFolder[];
        libraryCategories: LibraryCategory[];
        libraryViewFolders: LibraryViewFolder[];
        bookBookmarks: BookBookmark[];
        bookHighlights: BookHighlight[];
      }) => Partial<{
        books: BookRecord[];
        libraryFolders: LibraryFolder[];
        libraryCategories: LibraryCategory[];
        libraryViewFolders: LibraryViewFolder[];
        bookBookmarks: BookBookmark[];
        bookHighlights: BookHighlight[];
      }>
    ) => {
      mutateWorkspace((prev) => {
        const patch = updater({
          books: prev.books,
          libraryFolders: prev.libraryFolders ?? [],
          libraryCategories: prev.libraryCategories ?? [],
          libraryViewFolders: prev.libraryViewFolders ?? [],
          bookBookmarks: prev.bookBookmarks ?? [],
          bookHighlights: prev.bookHighlights ?? [],
        });
        return {
          ...prev,
          ...patch,
        };
      });
    },
    [mutateWorkspace]
  );

  const syncLibraryAnnotationsFromDb = useCallback(async () => {
    try {
      const [dbBookmarks, dbHighlights] = await Promise.all([
        libraryDb.getAllBookmarks(),
        libraryDb.getAllHighlights(),
      ]);
      mutateWorkspace((prev) => ({
        ...prev,
        bookBookmarks: dbBookmarks,
        bookHighlights: dbHighlights,
      }));
    } catch {
      // Ignore transient IndexedDB read errors
    }
  }, [mutateWorkspace]);

  const sendBookExcerptToNotes = useCallback(
    (bookTitle: string, excerptText: string, locationLabel?: string): Entry => {
      const nowIso = new Date().toISOString();
      const slugTag = bookTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 24);
      const safeExcerpt = excerptText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const noteEntry: Entry = {
        id: uid('ent'),
        type: 'note',
        title: `Excerpt — ${bookTitle}`,
        icon: '📖',
        noteStatus: 'inbox',
        syncToTimeline: false,
        content: `<blockquote><p>${safeExcerpt}</p></blockquote><p>${
          locationLabel ? `<em>Source: ${bookTitle} (${locationLabel})</em>` : `<em>Source: ${bookTitle}</em>`
        }</p>`,
        createdAt: nowIso,
        updatedAt: nowIso,
        scheduledAt: null,
        completedAt: null,
        endAt: null,
        completed: false,
        focusBucket: null,
        tags: ['reading', ...(slugTag ? [slugTag] : [])],
      };
      mutateWorkspace((prev) => ({
        ...prev,
        entries: [noteEntry, ...prev.entries],
      }));
      pushToast('Excerpt sent to Kanso Notes', 'success');
      return noteEntry;
    },
    [mutateWorkspace, pushToast]
  );

  // Streamer (Multi-YouTube Grid + Saved URLs Vault + Folders + Presets)
  const addStream = useCallback(
    (stream: Omit<StreamItem, 'id' | 'addedAt'>, addToGrid = true): StreamItem => {
      const nowIso = new Date().toISOString();
      const created: StreamItem = {
        ...stream,
        affirmations: stream.affirmations ?? '',
        folderIds: stream.folderIds ?? [],
        rating: stream.rating ?? 0,
        listenCount: stream.listenCount ?? (addToGrid ? 1 : 0),
        lastListenedAt: stream.lastListenedAt ?? (addToGrid ? nowIso : null),
        id: uid('str'),
        addedAt: nowIso,
      };
      mutateWorkspace((prev) => {
        const currentSlots = prev.streamerState.activeSlots ?? [];
        const nextSlots = addToGrid
          ? [...currentSlots, createDefaultSlot(created.id)]
          : currentSlots;
        return {
          ...prev,
          streams: [created, ...prev.streams],
          streamerState: addToGrid
            ? {
                ...prev.streamerState,
                activeSlots: nextSlots,
                activeStreamIds: nextSlots.map((sl) => sl.streamId),
                spotlightStreamId: prev.streamerState.spotlightStreamId || created.id,
                activePresetId: null,
              }
            : prev.streamerState,
        };
      });
      pushToast(`Saved "${created.customLabel || created.title}"`, 'success');
      return created;
    },
    [mutateWorkspace, pushToast]
  );

  const updateStream = useCallback(
    (id: string, patch: Partial<StreamItem>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        streams: prev.streams.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }));
    },
    [mutateWorkspace]
  );

  const deleteStream = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => {
        const currentSlots = prev.streamerState.activeSlots ?? [];
        const nextSlots = currentSlots.filter((sl) => sl.streamId !== id);
        const nextActive = nextSlots.map((sl) => sl.streamId);
        return {
          ...prev,
          streams: prev.streams.filter((s) => s.id !== id),
          streamPresets: prev.streamPresets.map((p) => ({
            ...p,
            streamIds: p.streamIds.filter((sid) => sid !== id),
            slots: p.slots ? p.slots.filter((sl) => sl.streamId !== id) : undefined,
          })),
          streamerState: {
            ...prev.streamerState,
            activeSlots: nextSlots,
            activeStreamIds: nextActive,
            spotlightStreamId:
              prev.streamerState.spotlightStreamId === id
                ? nextActive[0] || null
                : prev.streamerState.spotlightStreamId,
          },
        };
      });
      pushToast('Stream removed from vault');
    },
    [mutateWorkspace, pushToast]
  );

  const toggleStreamInGrid = useCallback(
    (id: string) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => {
        const currentSlots = prev.streamerState.activeSlots ?? [];
        const exists = currentSlots.some((sl) => sl.streamId === id);
        const nextSlots = exists
          ? currentSlots.filter((sl) => sl.streamId !== id)
          : [...currentSlots, createDefaultSlot(id)];
        const nextActive = nextSlots.map((sl) => sl.streamId);
        return {
          ...prev,
          streams: exists
            ? prev.streams
            : prev.streams.map((s) =>
                s.id === id
                  ? {
                      ...s,
                      listenCount: (s.listenCount ?? 0) + 1,
                      lastListenedAt: nowIso,
                    }
                  : s
              ),
          streamerState: {
            ...prev.streamerState,
            activeSlots: nextSlots,
            activeStreamIds: nextActive,
            spotlightStreamId:
              exists && prev.streamerState.spotlightStreamId === id
                ? nextActive[0] || null
                : prev.streamerState.spotlightStreamId || nextActive[0] || null,
            activePresetId: null,
          },
        };
      });
    },
    [mutateWorkspace]
  );

  const loadStreamsToGrid = useCallback(
    (streamIds: string[], mode: 'replace' | 'append' = 'replace', label?: string) => {
      const validUniqueIds = Array.from(
        new Set(streamIds.filter((sid) => workspace.streams.some((s) => s.id === sid)))
      );
      if (validUniqueIds.length === 0) {
        pushToast('No saved streams to load in this selection', 'error');
        return;
      }

      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => {
        const currentSlots = prev.streamerState.activeSlots ?? [];
        const existingSet = new Set(currentSlots.map((sl) => sl.streamId));
        const nextSlots =
          mode === 'append'
            ? [
                ...currentSlots,
                ...validUniqueIds
                  .filter((sid) => !existingSet.has(sid))
                  .map((sid) => createDefaultSlot(sid)),
              ]
            : validUniqueIds.map((sid) => createDefaultSlot(sid));
        const nextActive = nextSlots.map((sl) => sl.streamId);
        const newlyAddedSet = new Set(
          mode === 'append'
            ? validUniqueIds.filter((sid) => !existingSet.has(sid))
            : validUniqueIds
        );

        return {
          ...prev,
          streams: prev.streams.map((s) =>
            newlyAddedSet.has(s.id)
              ? {
                  ...s,
                  listenCount: (s.listenCount ?? 0) + 1,
                  lastListenedAt: nowIso,
                }
              : s
          ),
          streamerState: {
            ...prev.streamerState,
            activeSlots: nextSlots,
            activeStreamIds: nextActive,
            spotlightStreamId:
              nextActive.includes(prev.streamerState.spotlightStreamId || '')
                ? prev.streamerState.spotlightStreamId
                : nextActive[0] || null,
            activePresetId: null,
          },
        };
      });

      const actionWord = mode === 'append' ? 'Added' : 'Loaded';
      const targetText = label ? ` from "${label}"` : '';
      pushToast(
        `${actionWord} ${validUniqueIds.length} ${validUniqueIds.length === 1 ? 'stream' : 'streams'}${targetText} to Live Stack`,
        'success'
      );
    },
    [workspace.streams, mutateWorkspace, pushToast]
  );

  const addStreamSlot = useCallback(
    (
      streamId: string,
      overrides?: Partial<Omit<StackSlot, 'slotId' | 'streamId'>>
    ): StackSlot | null => {
      const target = workspace.streams.find((s) => s.id === streamId);
      if (!target) return null;
      const newSlot = createDefaultSlot(streamId, overrides);
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => {
        const currentSlots = prev.streamerState.activeSlots ?? [];
        const nextSlots = [...currentSlots, newSlot];
        return {
          ...prev,
          streams: prev.streams.map((s) =>
            s.id === streamId
              ? {
                  ...s,
                  listenCount: (s.listenCount ?? 0) + 1,
                  lastListenedAt: nowIso,
                }
              : s
          ),
          streamerState: {
            ...prev.streamerState,
            activeSlots: nextSlots,
            activeStreamIds: nextSlots.map((sl) => sl.streamId),
            spotlightStreamId: prev.streamerState.spotlightStreamId || streamId,
            activePresetId: null,
          },
        };
      });
      return newSlot;
    },
    [workspace.streams, mutateWorkspace]
  );

  const updateStreamSlot = useCallback(
    (slotId: string, patch: Partial<StackSlot>) => {
      mutateWorkspace((prev) => {
        const currentSlots = prev.streamerState.activeSlots ?? [];
        const nextSlots = currentSlots.map((sl) =>
          sl.slotId === slotId ? { ...sl, ...patch } : sl
        );
        return {
          ...prev,
          streamerState: {
            ...prev.streamerState,
            activeSlots: nextSlots,
          },
        };
      });
    },
    [mutateWorkspace]
  );

  const updateAllStreamSlots = useCallback(
    (updater: (slot: StackSlot) => StackSlot) => {
      mutateWorkspace((prev) => {
        const currentSlots = prev.streamerState.activeSlots ?? [];
        const nextSlots = currentSlots.map(updater);
        return {
          ...prev,
          streamerState: {
            ...prev.streamerState,
            activeSlots: nextSlots,
          },
        };
      });
    },
    [mutateWorkspace]
  );

  const removeStreamSlot = useCallback(
    (slotId: string) => {
      mutateWorkspace((prev) => {
        const currentSlots = prev.streamerState.activeSlots ?? [];
        const nextSlots = currentSlots.filter((sl) => sl.slotId !== slotId);
        const nextActive = nextSlots.map((sl) => sl.streamId);
        return {
          ...prev,
          streamerState: {
            ...prev.streamerState,
            activeSlots: nextSlots,
            activeStreamIds: nextActive,
            spotlightStreamId: nextActive.includes(prev.streamerState.spotlightStreamId || '')
              ? prev.streamerState.spotlightStreamId
              : nextActive[0] || null,
            activePresetId: null,
          },
        };
      });
    },
    [mutateWorkspace]
  );

  const clearStreamSlots = useCallback(() => {
    mutateWorkspace((prev) => ({
      ...prev,
      streamerState: {
        ...prev.streamerState,
        activeSlots: [],
        activeStreamIds: [],
        spotlightStreamId: null,
        activePresetId: null,
      },
    }));
    pushToast('Cleared active stack');
  }, [mutateWorkspace, pushToast]);

  const reorderActiveSlots = useCallback(
    (fromIndex: number, toIndex: number) => {
      mutateWorkspace((prev) => {
        const list = [...(prev.streamerState.activeSlots ?? [])];
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= list.length ||
          toIndex >= list.length ||
          fromIndex === toIndex
        ) {
          return prev;
        }
        const [moved] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, moved);
        return {
          ...prev,
          streamerState: {
            ...prev.streamerState,
            activeSlots: list,
            activeStreamIds: list.map((sl) => sl.streamId),
          },
        };
      });
    },
    [mutateWorkspace]
  );

  const incrementStreamListen = useCallback(
    (id: string) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        streams: prev.streams.map((s) =>
          s.id === id
            ? {
                ...s,
                listenCount: (s.listenCount ?? 0) + 1,
                lastListenedAt: nowIso,
              }
            : s
        ),
      }));
    },
    [mutateWorkspace]
  );

  const addStreamFolder = useCallback(
    (name: string, parentId: string | null = null, description = ''): StreamFolder => {
      const trimmed = name.trim() || 'Untitled Folder';
      const created: StreamFolder = {
        id: uid('sfold'),
        name: trimmed,
        parentId,
        description: description.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      mutateWorkspace((prev) => ({
        ...prev,
        streamFolders: [...(prev.streamFolders ?? []), created],
      }));
      pushToast(`Created folder "${trimmed}"`, 'success');
      return created;
    },
    [mutateWorkspace, pushToast]
  );

  const updateStreamFolder = useCallback(
    (id: string, patch: Partial<StreamFolder>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        streamFolders: (prev.streamFolders ?? []).map((f) =>
          f.id === id ? { ...f, ...patch } : f
        ),
      }));
    },
    [mutateWorkspace]
  );

  const deleteStreamFolder = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => {
        const folders = prev.streamFolders ?? [];
        const target = folders.find((f) => f.id === id);
        const fallbackParent = target?.parentId ?? null;
        return {
          ...prev,
          streamFolders: folders
            .filter((f) => f.id !== id)
            .map((f) => (f.parentId === id ? { ...f, parentId: fallbackParent } : f)),
          streams: prev.streams.map((s) =>
            s.folderIds?.includes(id)
              ? { ...s, folderIds: s.folderIds.filter((fid) => fid !== id) }
              : s
          ),
        };
      });
      pushToast('Folder deleted');
    },
    [mutateWorkspace, pushToast]
  );

  const reorderActiveStreams = reorderActiveSlots;

  const updateStreamerState = useCallback(
    (patch: Partial<StreamerState>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        streamerState: { ...prev.streamerState, ...patch },
      }));
    },
    [mutateWorkspace]
  );

  const saveStreamPreset = useCallback(
    (name: string, category = 'General'): StreamPreset => {
      const trimmed = name.trim() || 'Untitled Stack';
      const trimmedCategory = category.trim() || 'General';
      const currentSlots = workspace.streamerState.activeSlots ?? [];
      const created: StreamPreset = {
        id: uid('preset'),
        name: trimmed,
        category: trimmedCategory,
        layoutMode: workspace.streamerState.layoutMode,
        customRows: workspace.streamerState.customRows,
        customCols: workspace.streamerState.customCols,
        viewMode: workspace.streamerState.viewMode || 'grid',
        sizingMode: workspace.streamerState.sizingMode || 'fit',
        masterVolume: workspace.streamerState.masterVolume ?? 100,
        streamIds: currentSlots.map((sl) => sl.streamId),
        slots: currentSlots.map((sl) => ({ ...sl })),
        spotlightStreamId: workspace.streamerState.spotlightStreamId,
        createdAt: new Date().toISOString(),
      };
      mutateWorkspace((prev) => ({
        ...prev,
        streamPresets: [created, ...prev.streamPresets],
        streamerState: { ...prev.streamerState, activePresetId: created.id },
      }));
      pushToast(`Saved stack "${trimmed}"`, 'success');
      return created;
    },
    [workspace.streamerState, mutateWorkspace, pushToast]
  );

  const loadStreamPreset = useCallback(
    (presetId: string) => {
      const preset = workspace.streamPresets.find((p) => p.id === presetId);
      if (!preset) return;
      const validIdsSet = new Set(workspace.streams.map((s) => s.id));
      const restoredSlots: StackSlot[] =
        Array.isArray(preset.slots) && preset.slots.length > 0
          ? preset.slots
              .filter((sl) => validIdsSet.has(sl.streamId))
              .map((sl) => ({
                ...sl,
                slotId: uid('slot'),
              }))
          : preset.streamIds
              .filter((sid) => validIdsSet.has(sid))
              .map((sid) => createDefaultSlot(sid));

      const restoredStreamIds = restoredSlots.map((sl) => sl.streamId);
      mutateWorkspace((prev) => ({
        ...prev,
        streamerState: {
          ...prev.streamerState,
          layoutMode: preset.layoutMode,
          customRows: preset.customRows,
          customCols: preset.customCols,
          viewMode: preset.viewMode || prev.streamerState.viewMode || 'grid',
          sizingMode: preset.sizingMode || prev.streamerState.sizingMode || 'fit',
          masterVolume:
            typeof preset.masterVolume === 'number'
              ? preset.masterVolume
              : prev.streamerState.masterVolume ?? 100,
          activeSlots: restoredSlots,
          activeStreamIds: restoredStreamIds,
          spotlightStreamId: preset.spotlightStreamId || restoredStreamIds[0] || null,
          activePresetId: preset.id,
        },
      }));
      pushToast(`Loaded stack "${preset.name}"`, 'success');
    },
    [workspace.streamPresets, workspace.streams, mutateWorkspace, pushToast]
  );

  const deleteStreamPreset = useCallback(
    (presetId: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        streamPresets: prev.streamPresets.filter((p) => p.id !== presetId),
        streamerState: {
          ...prev.streamerState,
          activePresetId:
            prev.streamerState.activePresetId === presetId
              ? null
              : prev.streamerState.activePresetId,
        },
      }));
      pushToast('Preset deleted');
    },
    [mutateWorkspace, pushToast]
  );

  // Settings & Workspace lifecycle
  const updateSettings = useCallback(
    (patch: Partial<WorkspaceSettings>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        settings: { ...prev.settings, ...patch },
      }));
    },
    [mutateWorkspace]
  );

  const updateGistConfig = useCallback((patch: Partial<GistSyncConfig>) => {
    setGistConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const replaceWorkspace = useCallback(
    (next: KansoWorkspace, toastMessage?: string) => {
      const empty = createEmptyWorkspace();
      const normalizedLib = normalizeLibraryWorkspaceData({
        books: next.books,
        libraryFolders: next.libraryFolders,
        libraryCategories: next.libraryCategories,
        libraryViewFolders: next.libraryViewFolders,
        bookBookmarks: next.bookBookmarks,
        bookHighlights: next.bookHighlights,
      });

      setWorkspace({
        ...empty,
        ...next,
        version: 3,
        entries: migrateEntries(Array.isArray(next.entries) ? next.entries : []),
        scratchpads: Array.isArray(next.scratchpads) ? next.scratchpads : [],
        customTabs: Array.isArray(next.customTabs) ? next.customTabs : [],
        habitLogs: Array.isArray(next.habitLogs) ? next.habitLogs : [],
        noteNotebooks: Array.isArray(next.noteNotebooks) ? next.noteNotebooks : [],
        books: normalizedLib.books,
        libraryFolders: normalizedLib.libraryFolders,
        libraryCategories: normalizedLib.libraryCategories,
        libraryViewFolders: normalizedLib.libraryViewFolders,
        bookBookmarks: normalizedLib.bookBookmarks,
        bookHighlights: normalizedLib.bookHighlights,
        streams: Array.isArray(next.streams) ? next.streams : [],
        streamFolders: Array.isArray(next.streamFolders) ? next.streamFolders : [],
        streamPresets: Array.isArray(next.streamPresets) ? next.streamPresets : [],
        streamerState: normalizeStreamerState(
          next.streamerState,
          new Set((Array.isArray(next.streams) ? next.streams : []).map((s) => s.id))
        ),
        settings: {
          ...empty.settings,
          ...(next.settings || {}),
          timelineDisplayMode: next.settings?.timelineDisplayMode || 'default',
          epubPrefs: {
            ...empty.settings.epubPrefs!,
            ...(next.settings?.epubPrefs || {}),
          },
        },
      });

      void (async () => {
        try {
          await libraryDb.replaceAllAnnotations(
            normalizedLib.bookBookmarks,
            normalizedLib.bookHighlights
          );
        } catch {
          // Ignore
        }
      })();

      if (toastMessage) pushToast(toastMessage, 'success');
    },
    [pushToast]
  );

  const mergeRemoteWorkspace = useCallback(
    (remote: KansoWorkspace, toastMessage?: string): KansoWorkspace => {
      const merged = mergeWorkspaces(workspace, {
        ...remote,
        entries: migrateEntries(Array.isArray(remote.entries) ? remote.entries : []),
      });
      replaceWorkspace(merged, toastMessage);
      return merged;
    },
    [workspace, replaceWorkspace]
  );

  const clearWorkspaceData = useCallback(() => {
    void clearAllBookFiles();
    void libraryDb.clearAllData();
    setWorkspace((prev) => ({
      ...createEmptyWorkspace(),
      settings: prev.settings,
    }));
    pushToast('Workspace cleared to a blank slate', 'success');
  }, [pushToast]);

  const restoreSampleData = useCallback(() => {
    const seeded = createSeedWorkspace();
    setWorkspace((prev) => ({
      ...seeded,
      settings: prev.settings,
    }));
    void libraryDb.replaceAllAnnotations(
      seeded.bookBookmarks ?? [],
      seeded.bookHighlights ?? []
    );
    pushToast('Sample workspace data restored', 'success');
  }, [pushToast]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        gistConfig,
        toasts,
        pushToast,
        dismissToast,
        addFocusItem,
        clearFocusDayFromView,
        addTimelineEntry,
        createEntry,
        addAchievementEntry,
        updateEntry,
        toggleEntryCompleted,
        toggleEntryAchievement,
        cycleEventAttendance,
        setEventAttendance,
        deleteEntry,
        hardDeleteEntry,
        duplicateEntry,
        moveEntryToDate,
        addScratchpad,
        updateScratchpad,
        deleteScratchpad,
        sendScratchpadToTimeline,
        addCustomTab,
        updateCustomTab,
        deleteCustomTab,
        addNotePage,
        duplicateNotePage,
        archiveNotePage,
        trashNotePage,
        restoreNotePage,
        permanentlyDeleteNotePage,
        emptyNoteTrash,
        addNoteNotebook,
        updateNoteNotebook,
        deleteNoteNotebook,
        addHabit,
        updateHabit,
        deleteHabit,
        toggleHabitCompletion,
        addList,
        updateList,
        renameList,
        deleteList,
        addListItem,
        updateListItem,
        deleteListItem,
        addBook,
        updateBook,
        deleteBook,
        updateLibraryState,
        syncLibraryAnnotationsFromDb,
        sendBookExcerptToNotes,
        addStream,
        updateStream,
        deleteStream,
        toggleStreamInGrid,
        loadStreamsToGrid,
        addStreamSlot,
        updateStreamSlot,
        updateAllStreamSlots,
        removeStreamSlot,
        clearStreamSlots,
        reorderActiveSlots,
        incrementStreamListen,
        addStreamFolder,
        updateStreamFolder,
        deleteStreamFolder,
        reorderActiveStreams,
        updateStreamerState,
        saveStreamPreset,
        loadStreamPreset,
        deleteStreamPreset,
        updateSettings,
        updateGistConfig,
        replaceWorkspace,
        mergeRemoteWorkspace,
        clearWorkspaceData,
        restoreSampleData,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
