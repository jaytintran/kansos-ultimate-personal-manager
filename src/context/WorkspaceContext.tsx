import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createEmptyWorkspace, createSeedWorkspace, DEFAULT_STREAMER_STATE } from '../data/seedData';
import {
  BookBookmark,
  BookHighlight,
  BookRecord,
  Entry,
  EntryType,
  FocusBucket,
  GistSyncConfig,
  Habit,
  KansoWorkspace,
  LibraryCategory,
  LibraryFolder,
  LibraryViewFolder,
  ListCollection,
  ListItem,
  ListItemStatus,
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
import { buildDateAtTime, formatTime, getTodayKey, parseLocalDateKey, toLocalDateKey } from '../utils/date';
import { clearAllBookFiles, deleteBookFile } from '../utils/ebookStorage';
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

function loadInitialWorkspace(): KansoWorkspace {
  try {
    const raw = localStorage.getItem(STORAGE_WORKSPACE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<KansoWorkspace>;
      if (parsed && Array.isArray(parsed.entries) && parsed.settings) {
        const empty = createEmptyWorkspace();
        const seed = createSeedWorkspace();
        // Gracefully hydrate built-in sample books & streams when upgrading from a v1 workspace
        const hasBooksField = Array.isArray(parsed.books);
        const hasStreamsField = Array.isArray(parsed.streams);
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
  addFocusItem: (bucket: Exclude<FocusBucket, null>, rawText: string) => boolean;
  addTimelineEntry: (type: EntryType, rawText: string, activeDateKey: string, extra?: Partial<Entry>) => Entry | null;
  updateEntry: (id: string, patch: Partial<Entry>) => void;
  toggleEntryCompleted: (id: string) => void;
  deleteEntry: (id: string) => void;
  duplicateEntry: (id: string) => Entry | null;
  moveEntryToDate: (id: string, dateKey: string) => void;

  // Habit actions
  addHabit: (habit: Omit<Habit, 'id' | 'createdAt' | 'completions'>) => void;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  toggleHabitCompletion: (habitId: string, dateKey: string) => void;

  // Lists actions
  addList: (title: string, icon: string) => ListCollection;
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
    (bucket: Exclude<FocusBucket, null>, rawText: string): boolean => {
      const trimmed = rawText.trim();
      if (!trimmed) return false;

      const todayKey = getTodayKey();
      const parsed = parseNlpInput(trimmed, todayKey, workspace.settings.timeFormat);
      const nowIso = new Date().toISOString();

      if (bucket === 'x-active') {
        const activeCount = workspace.entries.filter(
          (e) => e.focusBucket === 'x-active' && !e.completed
        ).length;
        if (activeCount >= workspace.settings.xActiveLimit) {
          pushToast(
            `X-Active is at its ${workspace.settings.xActiveLimit}-task limit. Complete one or adjust the limit in Settings.`,
            'error'
          );
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
          scheduledAt: parsed.scheduledAt || nowIso,
          completedAt: null,
          endAt: parsed.endAt,
          completed: false,
          focusBucket: 'anchor',
          tags: [],
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
          scheduledAt: parsed.scheduledAt,
          completedAt: null,
          endAt: parsed.endAt,
          completed: false,
          focusBucket: 'x-active',
          tags: [],
        };
        mutateWorkspace((prev) => ({
          ...prev,
          entries: [xEntry, ...prev.entries],
        }));
        return true;
      }

      // bucket === 'completed': records a finished task directly (appears crossed-out on Timeline, no redundant log)
      const finishedTime = parsed.scheduledAt || nowIso;
      const completedEntry: Entry = {
        id: uid('ent'),
        type: 'task',
        title: parsed.cleanTitle,
        content: '',
        createdAt: nowIso,
        scheduledAt: parsed.scheduledAt,
        completedAt: finishedTime,
        endAt: parsed.endAt,
        completed: true,
        focusBucket: 'completed',
        tags: [],
      };

      mutateWorkspace((prev) => ({
        ...prev,
        entries: [completedEntry, ...prev.entries],
      }));
      pushToast(
        `Recorded at ${formatTime(finishedTime, workspace.settings.timeFormat)}`,
        'success'
      );
      return true;
    },
    [workspace.entries, workspace.settings.timeFormat, workspace.settings.xActiveLimit, mutateWorkspace, pushToast]
  );

  const addTimelineEntry = useCallback(
    (type: EntryType, rawText: string, activeDateKey: string, extra?: Partial<Entry>): Entry | null => {
      const trimmed = rawText.trim();
      if (!trimmed) return null;

      const parsed = parseNlpInput(trimmed, activeDateKey, workspace.settings.timeFormat);
      const now = new Date();
      const todayKey = getTodayKey();

      // Anchor createdAt to the viewed date when adding on a non-today date without an explicit timestamp
      const defaultIsoForDay =
        activeDateKey === todayKey
          ? now.toISOString()
          : buildDateAtTime(activeDateKey, now.getHours(), now.getMinutes());

      let scheduledAt = parsed.scheduledAt;
      let endAt = parsed.endAt;

      if (type === 'timeblock') {
        scheduledAt = scheduledAt || defaultIsoForDay;
        if (!endAt) {
          endAt = new Date(new Date(scheduledAt).getTime() + 60 * 60 * 1000).toISOString();
        }
      } else if (type === 'event') {
        scheduledAt = scheduledAt || defaultIsoForDay;
      }

      const newEntry: Entry = {
        id: uid('ent'),
        type,
        title: parsed.cleanTitle,
        content: '',
        createdAt: defaultIsoForDay,
        scheduledAt,
        completedAt: null,
        endAt,
        completed: false,
        focusBucket: null,
        tags: [],
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

  const updateEntry = useCallback(
    (id: string, patch: Partial<Entry>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        entries: prev.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
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
      if (!nextCompleted && target.focusBucket === 'x-active') {
        const activeCount = workspace.entries.filter(
          (e) => e.focusBucket === 'x-active' && !e.completed
        ).length;
        if (activeCount >= workspace.settings.xActiveLimit) {
          pushToast(
            `Cannot reopen: X-Active already has ${workspace.settings.xActiveLimit} active tasks.`,
            'error'
          );
          return;
        }
      }

      // Focus tasks appear directly on Timeline as crossed-out tasks at completedAt (no duplicate log spawned)
      mutateWorkspace((prev) => ({
        ...prev,
        entries: prev.entries.map((e) =>
          e.id === id
            ? {
                ...e,
                completed: nextCompleted,
                completedAt: nextCompleted ? nowIso : null,
              }
            : e
        ),
      }));

      if (nextCompleted && target.focusBucket !== null) {
        pushToast(
          `Completed at ${formatTime(nowIso, workspace.settings.timeFormat)}`,
          'success'
        );
      }
    },
    [workspace.entries, workspace.settings.timeFormat, workspace.settings.xActiveLimit, mutateWorkspace, pushToast]
  );

  const deleteEntry = useCallback(
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
      const copy: Entry = {
        ...original,
        id: uid('ent'),
        title: `${original.title} (Copy)`,
        createdAt: new Date().toISOString(),
        focusBucket: original.focusBucket === 'x-active' ? null : original.focusBucket,
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
      if (target.completedAt) {
        patch.completedAt = shiftIsoToDay(target.completedAt);
      } else if (target.scheduledAt) {
        patch.scheduledAt = shiftIsoToDay(target.scheduledAt);
        if (target.endAt) {
          const duration = new Date(target.endAt).getTime() - new Date(target.scheduledAt).getTime();
          patch.endAt = new Date(new Date(patch.scheduledAt!).getTime() + Math.max(duration, 15 * 60 * 1000)).toISOString();
        }
      } else {
        patch.createdAt = shiftIsoToDay(target.createdAt) || buildDateAtTime(dateKey, 9, 0);
      }

      updateEntry(id, patch);
      pushToast(`Moved to ${toLocalDateKey(dateKey)}`);
    },
    [workspace.entries, updateEntry, pushToast]
  );

  // Habits
  const addHabit = useCallback(
    (habit: Omit<Habit, 'id' | 'createdAt' | 'completions'>) => {
      const newHabit: Habit = {
        ...habit,
        id: uid('hab'),
        createdAt: new Date().toISOString(),
        completions: {},
      };
      mutateWorkspace((prev) => ({
        ...prev,
        habits: [...prev.habits, newHabit],
      }));
      pushToast(`Habit "${habit.title}" created`, 'success');
    },
    [mutateWorkspace, pushToast]
  );

  const updateHabit = useCallback(
    (id: string, patch: Partial<Habit>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        habits: prev.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)),
      }));
    },
    [mutateWorkspace]
  );

  const deleteHabit = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        habits: prev.habits.filter((h) => h.id !== id),
      }));
      pushToast('Habit deleted');
    },
    [mutateWorkspace, pushToast]
  );

  const toggleHabitCompletion = useCallback(
    (habitId: string, dateKey: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        habits: prev.habits.map((h) => {
          if (h.id !== habitId) return h;
          const nextCompletions = { ...h.completions };
          if (nextCompletions[dateKey]) {
            delete nextCompletions[dateKey];
          } else {
            nextCompletions[dateKey] = true;
          }
          return { ...h, completions: nextCompletions };
        }),
      }));
    },
    [mutateWorkspace]
  );

  // Lists
  const addList = useCallback(
    (title: string, icon: string): ListCollection => {
      const created: ListCollection = {
        id: uid('list'),
        title: title.trim() || 'Untitled List',
        icon,
        createdAt: new Date().toISOString(),
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

  const renameList = useCallback(
    (id: string, title: string, icon?: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        lists: prev.lists.map((l) =>
          l.id === id ? { ...l, title: title.trim() || l.title, icon: icon ?? l.icon } : l
        ),
      }));
    },
    [mutateWorkspace]
  );

  const deleteList = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        lists: prev.lists.filter((l) => l.id !== id),
        listItems: prev.listItems.filter((item) => item.listId !== id),
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
        status,
        content: '',
        scheduledAt: parsed.scheduledAt,
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
      mutateWorkspace((prev) => ({
        ...prev,
        listItems: prev.listItems.map((item) =>
          item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item
        ),
      }));
    },
    [mutateWorkspace]
  );

  const deleteListItem = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        listItems: prev.listItems.filter((item) => item.id !== id),
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
        content: `<blockquote><p>${safeExcerpt}</p></blockquote><p>${
          locationLabel ? `<em>Source: ${bookTitle} (${locationLabel})</em>` : `<em>Source: ${bookTitle}</em>`
        }</p>`,
        createdAt: nowIso,
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
          epubPrefs: {
            ...empty.settings.epubPrefs!,
            ...(next.settings?.epubPrefs || {}),
          },
        },
      });

      // Mirror pulled bookmarks & highlights into IndexedDB so ReaderView sees them immediately
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
        addTimelineEntry,
        updateEntry,
        toggleEntryCompleted,
        deleteEntry,
        duplicateEntry,
        moveEntryToDate,
        addHabit,
        updateHabit,
        deleteHabit,
        toggleHabitCompletion,
        addList,
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
