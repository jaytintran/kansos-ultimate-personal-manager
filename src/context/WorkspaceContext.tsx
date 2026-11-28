import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createEmptyWorkspace,
  createSeedWorkspace,
  DEFAULT_AUDIO_STATE,
  DEFAULT_CONTACT_CIRCLES,
  DEFAULT_FINANCE_CATEGORIES,
  DEFAULT_FINANCE_SETTINGS,
  DEFAULT_STREAMER_STATE,
} from "../data/seedData";
import {
  AudioEqPreset,
  AudioFolderRecord,
  AudioMixPreset,
  AudioMixSlot,
  AudioPlaylistRecord,
  AudioStudioState,
  AudioTrackRecord,
  BookBookmark,
  BookHighlight,
  BookNoteLink,
  BookRecord,
  ContactCircle,
  ContactRecord,
  CustomFocusTab,
  Entry,
  EntrySource,
  EntryType,
  EventAttendance,
  FinanceAccount,
  FinanceCategory,
  FinanceSettings,
  FinanceSubscription,
  FinanceTransaction,
  FocusBucket,
  GistSyncConfig,
  Habit,
  HabitLog,
  KansoWorkspace,
  LanguageDailyStat,
  LanguageDeck,
  LanguageItem,
  LanguageProfile,
  LanguageSrsRating,
  LibraryCategory,
  LibraryFolder,
  LibraryViewFolder,
  ListCollection,
  ListCollectionType,
  ListItem,
  ListItemNoteLink,
  ListItemStatus,
  NoteNotebook,
  NoteStatus,
  ScratchpadCard,
  StackSlot,
  StreamChannelMeta,
  StreamFolder,
  StreamItem,
  StreamPreset,
  StreamerState,
  ToastMessage,
  WorkspaceSettings,
} from "../types";
import { pruneBookVoicePreferences, pruneMissingBookVoicePreferences } from "../hooks/useVoicePreferences";
import { getContactDisplayName, getDeterministicAvatarColor, getNextOccurrenceInfo } from "../lib/contactUtils";
import { audioDb, contactPhotoDb, libraryDb, listCoverDb } from "../lib/db";
import { advanceSubscriptionDueDate } from "../lib/financeUtils";
import { compressCoverDataUrl } from "../lib/formatters";
import { applySm2Review, createInitialSrsState } from "../lib/languageUtils";
import { applyWorkspaceFonts, normalizeFontSettings } from "../lib/fonts";
import { normalizeLibraryWorkspaceData } from "../lib/migrateLibrary";
import {
  buildListTreeIndex,
  getDescendantListIds,
  wouldCreateListCycle,
} from "../lib/listTree";
import { sanitizeNavigationSettings } from "../lib/viewNavigation";
import {
  buildDateAtTime,
  formatTime,
  getEntryDayKey,
  getTodayKey,
  parseLocalDateKey,
  toLocalDateKey,
} from "../utils/date";
import { releaseAndroidUri } from "../utils/androidSaf";
import {
  fetchRemoteGistUpdatedAt,
  isBookLinkedNote,
  pullWorkspaceFromGist,
  pushWorkspaceToGist,
} from "../utils/gist";
import { syncNativeStatusBar } from "../utils/nativeStatusBar";
import { extractUrlFromListInput, parseNlpInput } from "../utils/nlp";
import { removeListItemBookLinks } from "../utils/listBookLinks";
import {
  buildListItemNoteLink,
  normalizeListItemNoteLinks,
} from "../utils/listItemLinks";
import { applySyncedViewPreferences } from "../utils/viewPreferences";

const STORAGE_WORKSPACE_KEY = "kanso_workspace_v1";
const STORAGE_GIST_KEY = "kanso_gist_config_v1";
const STORAGE_GIST_DIRTY_KEY = "kanso_gist_dirty_v1";
const VIEW_PREFERENCE_STORAGE_KEYS = [
  "kanso_habits_view_mode_v1",
  "kanso_habits_range_v1",
  "kanso_notes_sort_v1",
  "kanso_notes_view_mode_v1",
  "kanso_lists_prefs_v1",
  "kanso_events_filters_v1",
  "kanso_library_studio_prefs_v1",
  "kanso_library_voice_prefs_v1",
  "kanso_streamer_vault_sort_v1",
  "kanso_audio_studio_prefs_v1",
  "kanso_contacts_prefs_v1",
  "kanso_finance_prefs_v1",
  "kanso_languages_prefs_v1",
] as const;

const DEFAULT_GIST_CONFIG: GistSyncConfig = {
  token: "",
  gistId: "",
  filename: "kanso-workspace.json",
  lastSyncedAt: null,
  lastRemoteUpdatedAt: null,
  lastDirection: null,
  autoPushEnabled: false,
  autoPushDelaySeconds: 30,
  autoPushIndicatorEnabled: true,
  autoPushIndicatorStyle: "push-button",
  autoPullEnabled: false,
  autoPullCheckMode: "resume-cooldown",
  autoPullCooldownSeconds: 15,
  autoPullIndicatorEnabled: true,
  autoPullIndicatorStyle: "pull-button",
};

function loadInitialGistDirtyFlag(): boolean {
  try {
    return localStorage.getItem(STORAGE_GIST_DIRTY_KEY) === "1";
  } catch {
    return false;
  }
}

function persistGistDirtyFlag(dirty: boolean): void {
  try {
    if (dirty) {
      localStorage.setItem(STORAGE_GIST_DIRTY_KEY, "1");
    } else {
      localStorage.removeItem(STORAGE_GIST_DIRTY_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function clampAutoPushDelaySeconds(seconds?: number): number {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return 30;
  return Math.max(5, Math.min(600, Math.round(seconds)));
}

export function clampAutoPullCooldownSeconds(seconds?: number): number {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return 15;
  return Math.max(5, Math.min(600, Math.round(seconds)));
}

function hasSyncableEntriesChanged(prevEntries: Entry[], nextEntries: Entry[]): boolean {
  if (prevEntries === nextEntries) return false;
  const prevSyncable = prevEntries.filter((e) => !isBookLinkedNote(e));
  const nextSyncable = nextEntries.filter((e) => !isBookLinkedNote(e));
  if (prevSyncable.length !== nextSyncable.length) return true;
  for (let i = 0; i < prevSyncable.length; i++) {
    if (prevSyncable[i] !== nextSyncable[i]) return true;
  }
  return false;
}

function hasSyncableWorkspaceChanged(
  prev: KansoWorkspace,
  next: KansoWorkspace,
): boolean {
  if (prev === next) return false;
  if (
    prev.habits !== next.habits ||
    prev.habitLogs !== next.habitLogs ||
    prev.lists !== next.lists ||
    prev.listItems !== next.listItems ||
    prev.scratchpads !== next.scratchpads ||
    prev.customTabs !== next.customTabs ||
    prev.noteNotebooks !== next.noteNotebooks ||
    prev.streams !== next.streams ||
    prev.streamFolders !== next.streamFolders ||
    prev.streamerState !== next.streamerState ||
    prev.streamPresets !== next.streamPresets ||
    prev.streamTopicIcons !== next.streamTopicIcons ||
    prev.streamTopicOrder !== next.streamTopicOrder ||
    prev.streamChannels !== next.streamChannels ||
    prev.contacts !== next.contacts ||
    prev.contactCircles !== next.contactCircles ||
    prev.financeAccounts !== next.financeAccounts ||
    prev.financeCategories !== next.financeCategories ||
    prev.financeTransactions !== next.financeTransactions ||
    prev.financeSubscriptions !== next.financeSubscriptions ||
    prev.financeSettings !== next.financeSettings ||
    prev.languages !== next.languages ||
    prev.languageDecks !== next.languageDecks ||
    prev.languageItems !== next.languageItems ||
    prev.languageDailyStats !== next.languageDailyStats ||
    prev.languageActiveId !== next.languageActiveId ||
    prev.settings !== next.settings ||
    prev.viewPreferences !== next.viewPreferences
  ) {
    return true;
  }
  return hasSyncableEntriesChanged(prev.entries, next.entries);
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createDefaultSlot(
  streamId: string,
  overrides?: Partial<Omit<StackSlot, "slotId" | "streamId">>,
): StackSlot {
  return {
    slotId: uid("slot"),
    streamId,
    volume: overrides?.volume ?? 100,
    muted: overrides?.muted ?? false,
    loopMode: overrides?.loopMode ?? "infinite",
    loopCount: Math.max(1, overrides?.loopCount ?? 10),
    playbackRate: overrides?.playbackRate ?? 1,
  };
}

function normalizeStreamerState(
  raw: Partial<StreamerState> | undefined,
  validStreamIds: Set<string>,
): StreamerState {
  const merged = { ...DEFAULT_STREAMER_STATE, ...(raw || {}) };
  let slots: StackSlot[];
  if (Array.isArray(merged.activeSlots) && merged.activeSlots.length > 0) {
    slots = merged.activeSlots
      .filter((sl) => sl && validStreamIds.has(sl.streamId))
      .map((sl) => ({
        slotId: sl.slotId || uid("slot"),
        streamId: sl.streamId,
        volume:
          typeof sl.volume === "number"
            ? Math.max(0, Math.min(100, Math.round(sl.volume)))
            : 100,
        muted: Boolean(sl.muted),
        loopMode: sl.loopMode === "count" ? "count" : "infinite",
        loopCount:
          typeof sl.loopCount === "number" && sl.loopCount >= 1
            ? Math.round(sl.loopCount)
            : 10,
        playbackRate: typeof sl.playbackRate === "number" ? sl.playbackRate : 1,
      }));
  } else if (
    Array.isArray(merged.activeStreamIds) &&
    merged.activeStreamIds.length > 0
  ) {
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
    viewMode: merged.viewMode || "grid",
    sizingMode: merged.sizingMode || "fit",
    masterVolume:
      typeof merged.masterVolume === "number"
        ? Math.max(0, Math.min(100, Math.round(merged.masterVolume)))
        : 100,
    sidebarOpen: merged.sidebarOpen ?? true,
  };
}

function createDefaultAudioSlot(
  trackId: string,
  overrides?: Partial<Omit<AudioMixSlot, "slotId" | "trackId">>,
): AudioMixSlot {
  return {
    slotId: uid("aslot"),
    trackId,
    volume:
      typeof overrides?.volume === "number"
        ? Math.max(0, Math.min(100, Math.round(overrides.volume)))
        : 85,
    muted: Boolean(overrides?.muted),
    solo: Boolean(overrides?.solo),
    loop: Boolean(overrides?.loop),
    playbackRate:
      typeof overrides?.playbackRate === "number"
        ? Math.max(0.5, Math.min(3, overrides.playbackRate))
        : 1,
    abLoopStart: overrides?.abLoopStart ?? null,
    abLoopEnd: overrides?.abLoopEnd ?? null,
  };
}

function normalizeAudioState(
  raw: Partial<AudioStudioState> | undefined,
  validTrackIds: Set<string>,
): AudioStudioState {
  const merged = { ...DEFAULT_AUDIO_STATE, ...(raw || {}) };
  const slots = Array.isArray(merged.activeSlots)
    ? merged.activeSlots
        .filter((sl) => sl && validTrackIds.has(sl.trackId))
        .map((sl) =>
          createDefaultAudioSlot(sl.trackId, {
            volume: sl.volume,
            muted: sl.muted,
            solo: sl.solo,
            loop: sl.loop,
            playbackRate: sl.playbackRate,
            abLoopStart: sl.abLoopStart,
            abLoopEnd: sl.abLoopEnd,
          }),
        )
    : [];
  const primaryTrackId =
    merged.primaryTrackId && validTrackIds.has(merged.primaryTrackId)
      ? merged.primaryTrackId
      : slots[0]?.trackId || null;
  const queueTrackIds = Array.isArray(merged.queueTrackIds)
    ? merged.queueTrackIds.filter((id) => validTrackIds.has(id))
    : [];
  return {
    ...merged,
    activeSlots: slots,
    primaryTrackId,
    queueTrackIds,
    masterVolume:
      typeof merged.masterVolume === "number"
        ? Math.max(0, Math.min(100, Math.round(merged.masterVolume)))
        : 100,
    eqPreset: merged.eqPreset || "flat",
    shuffle: Boolean(merged.shuffle),
    repeatMode:
      merged.repeatMode === "one" || merged.repeatMode === "all"
        ? merged.repeatMode
        : "off",
    activePresetId: merged.activePresetId || null,
    mixerExpanded: Boolean(merged.mixerExpanded),
  };
}

function migrateEntries(rawEntries: Entry[]): Entry[] {
  return rawEntries.map((e) => {
    let source: EntrySource | undefined = e.source;
    if (!source) {
      if (e.focusBucket === "anchor") source = "focus-anchor";
      else if (e.focusBucket === "x-active") source = "focus-active";
      else if (e.habitId) source = "habit";
      else source = "timeline";
    }
    return {
      ...e,
      source,
      tags: Array.isArray(e.tags) ? e.tags : [],
      listIds: Array.isArray(e.listIds) ? e.listIds : [],
      listItemLinks: Array.isArray(e.listItemLinks)
        ? normalizeListItemNoteLinks(e.listItemLinks)
        : undefined,
    };
  });
}

function purgeLegacyDeleted<T>(list: T[] | undefined): T[] {
  return (list ?? []).filter((i) => {
    const r = i as { deletedAt?: unknown; trashedAt?: unknown };
    return !r.deletedAt && !r.trashedAt;
  });
}

function purgeWorkspace(ws: KansoWorkspace): KansoWorkspace {
  return {
    ...ws,
    entries: purgeLegacyDeleted(ws.entries),
    scratchpads: purgeLegacyDeleted(ws.scratchpads),
    customTabs: purgeLegacyDeleted(ws.customTabs),
    habits: purgeLegacyDeleted(ws.habits),
    habitLogs: purgeLegacyDeleted(ws.habitLogs),
    lists: purgeLegacyDeleted(ws.lists),
    listItems: purgeLegacyDeleted(ws.listItems),
  };
}

function normalizeParsedWorkspace(
  parsed: Partial<KansoWorkspace> | null | undefined,
): KansoWorkspace | null {
  if (!parsed || !Array.isArray(parsed.entries) || !parsed.settings) {
    return null;
  }
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
  const hasContactsField = Array.isArray(parsed.contacts);
  const hasFinanceField =
    Array.isArray(parsed.financeAccounts) ||
    Array.isArray(parsed.financeTransactions) ||
    Array.isArray(parsed.financeSubscriptions);
  const hasLanguagesField = Array.isArray(parsed.languages);
  return purgeWorkspace({
    ...empty,
    ...parsed,
    version: 3,
    entries: migrateEntries(parsed.entries),
    scratchpads: hasScratchpadsField
      ? parsed.scratchpads!
      : (seed.scratchpads ?? []),
    customTabs: hasCustomTabsField
      ? parsed.customTabs!
      : (seed.customTabs ?? []),
    habitLogs: Array.isArray(parsed.habitLogs) ? parsed.habitLogs : [],
    habits: Array.isArray(parsed.habits)
      ? parsed.habits.map((h) => ({
          ...h,
          completions:
            h.completions && typeof h.completions === "object"
              ? h.completions
              : {},
          missedDates:
            h.missedDates && typeof h.missedDates === "object"
              ? h.missedDates
              : {},
        }))
      : seed.habits,
    noteNotebooks: Array.isArray(parsed.noteNotebooks)
      ? parsed.noteNotebooks
      : (seed.noteNotebooks ?? []),
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
        : (seed.streamFolders ?? []),
    streamTopicIcons:
      parsed.streamTopicIcons && typeof parsed.streamTopicIcons === "object"
        ? parsed.streamTopicIcons
        : {},
    streamTopicOrder: Array.isArray(parsed.streamTopicOrder)
      ? parsed.streamTopicOrder.filter(
          (t): t is string => typeof t === "string" && t.trim().length > 0,
        )
      : undefined,
    streamChannels:
      parsed.streamChannels && typeof parsed.streamChannels === "object"
        ? parsed.streamChannels
        : {},
    streamPresets: Array.isArray(parsed.streamPresets)
      ? parsed.streamPresets
      : hasStreamsField
        ? []
        : seed.streamPresets,
    streamerState: parsed.streamerState
      ? normalizeStreamerState(
          parsed.streamerState,
          new Set(
            (hasStreamsField ? parsed.streams! : seed.streams).map((s) => s.id),
          ),
        )
      : hasStreamsField
        ? { ...DEFAULT_STREAMER_STATE }
        : seed.streamerState,
    audioTracks: Array.isArray(parsed.audioTracks) ? parsed.audioTracks : [],
    audioFolders: Array.isArray(parsed.audioFolders) ? parsed.audioFolders : [],
    audioPlaylists: Array.isArray(parsed.audioPlaylists)
      ? parsed.audioPlaylists
      : [],
    audioMixPresets: Array.isArray(parsed.audioMixPresets)
      ? parsed.audioMixPresets
      : [],
    audioState: normalizeAudioState(
      parsed.audioState,
      new Set(
        (Array.isArray(parsed.audioTracks) ? parsed.audioTracks : []).map(
          (t) => t.id,
        ),
      ),
    ),
    contacts: hasContactsField
      ? parsed.contacts!
      : (seed.contacts ?? []),
    contactCircles: Array.isArray(parsed.contactCircles)
      ? parsed.contactCircles
      : DEFAULT_CONTACT_CIRCLES.map((c) => ({ ...c })),
    financeAccounts: Array.isArray(parsed.financeAccounts)
      ? parsed.financeAccounts
      : hasFinanceField
        ? []
        : (seed.financeAccounts ?? []),
    financeCategories: Array.isArray(parsed.financeCategories)
      ? parsed.financeCategories
      : DEFAULT_FINANCE_CATEGORIES.map((c) => ({ ...c })),
    financeTransactions: Array.isArray(parsed.financeTransactions)
      ? parsed.financeTransactions
      : hasFinanceField
        ? []
        : (seed.financeTransactions ?? []),
    financeSubscriptions: Array.isArray(parsed.financeSubscriptions)
      ? parsed.financeSubscriptions
      : hasFinanceField
        ? []
        : (seed.financeSubscriptions ?? []),
    financeSettings: {
      ...DEFAULT_FINANCE_SETTINGS,
      ...(parsed.financeSettings || {}),
    },
    languages: hasLanguagesField
      ? parsed.languages!
      : (seed.languages ?? []),
    languageDecks: Array.isArray(parsed.languageDecks)
      ? parsed.languageDecks
      : hasLanguagesField
        ? []
        : (seed.languageDecks ?? []),
    languageItems: Array.isArray(parsed.languageItems)
      ? parsed.languageItems
      : hasLanguagesField
        ? []
        : (seed.languageItems ?? []),
    languageDailyStats: Array.isArray(parsed.languageDailyStats)
      ? parsed.languageDailyStats
      : hasLanguagesField
        ? []
        : (seed.languageDailyStats ?? []),
    languageActiveId:
      typeof parsed.languageActiveId === "string" || parsed.languageActiveId === null
        ? parsed.languageActiveId
        : hasLanguagesField
          ? (parsed.languages![0]?.id ?? null)
          : (seed.languageActiveId ?? seed.languages?.[0]?.id ?? null),
    settings: {
      ...empty.settings,
      ...parsed.settings,
      ...normalizeFontSettings(parsed.settings),
      timelineDisplayMode: parsed.settings.timelineDisplayMode || "default",
      epubPrefs: {
        ...empty.settings.epubPrefs!,
        ...(parsed.settings.epubPrefs || {}),
      },
      navigation: sanitizeNavigationSettings(parsed.settings.navigation),
    },
  } as KansoWorkspace);
}

function loadInitialWorkspaceState(): {
  workspace: KansoWorkspace;
  fromLocalStorage: boolean;
} {
  try {
    const raw = localStorage.getItem(STORAGE_WORKSPACE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<KansoWorkspace>;
      const normalized = normalizeParsedWorkspace(parsed);
      if (normalized) {
        return { workspace: normalized, fromLocalStorage: true };
      }
    }
  } catch {
    // Fallback to seed data
  }
  return { workspace: createSeedWorkspace(), fromLocalStorage: false };
}

const OVERSIZED_DATA_IMAGE_URI_REGEX =
  /(["'(])data:image\/[^"')\s]{32000,}(["')])/gi;

function stripOversizedInlineNoteImages(content: string): string {
  if (!content || content.length < 32_000 || !content.includes("data:image/")) {
    return content;
  }
  return content.replace(OVERSIZED_DATA_IMAGE_URI_REGEX, "$1$2");
}

function persistWorkspaceToLocalStorage(
  ws: KansoWorkspace,
): "full" | "compact" | "failed" {
  try {
    localStorage.setItem(STORAGE_WORKSPACE_KEY, JSON.stringify(ws));
    return "full";
  } catch {
    // Stage-1 retry without inline book/audio cover data URLs so localStorage metadata cache fits within ~5 MB quota
    const compactWs: KansoWorkspace = {
      ...ws,
      books: ws.books.map((b) =>
        b.coverDataUrl ? { ...b, coverDataUrl: null } : b,
      ),
      audioTracks: (ws.audioTracks ?? []).map((t) =>
        t.coverDataUrl ? { ...t, coverDataUrl: null } : t,
      ),
    };
    try {
      localStorage.setItem(STORAGE_WORKSPACE_KEY, JSON.stringify(compactWs));
      return "compact";
    } catch {
      // Stage-2 silent fallback: strip oversized legacy inline data:image/* strings from note HTML in localStorage only (IndexedDB retains full payload)
      try {
        const ultraCompactWs: KansoWorkspace = {
          ...compactWs,
          entries: compactWs.entries.map((entry) => {
            const stripped = stripOversizedInlineNoteImages(entry.content);
            return stripped !== entry.content
              ? { ...entry, content: stripped }
              : entry;
          }),
        };
        localStorage.setItem(
          STORAGE_WORKSPACE_KEY,
          JSON.stringify(ultraCompactWs),
        );
        return "compact";
      } catch {
        return "failed";
      }
    }
  }
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

interface ToastContextValue {
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
}

export type AutoPushPhase =
  | "idle"
  | "pending"
  | "checking"
  | "pushing"
  | "synced"
  | "conflict"
  | "offline"
  | "error";

export interface AutoPushStatus {
  phase: AutoPushPhase;
  secondsRemaining: number | null;
  hasPendingChanges: boolean;
  lastAutoPushedAt: string | null;
  conflictRemoteUpdatedAt: string | null;
  message: string | null;
}

export type AutoPullPhase =
  | "idle"
  | "checking"
  | "pulling"
  | "pulled"
  | "conflict"
  | "offline"
  | "error";

export interface AutoPullStatus {
  phase: AutoPullPhase;
  hasRemoteUpdate: boolean;
  lastCheckedAt: string | null;
  lastAutoPulledAt: string | null;
  remoteUpdatedAt: string | null;
  message: string | null;
}

interface GistSyncStatusContextValue {
  gistSyncBusy: "push" | "pull" | null;
  autoPushStatus: AutoPushStatus;
  dismissAutoPushNotice: () => void;
  autoPullStatus: AutoPullStatus;
  dismissAutoPullNotice: () => void;
  checkAutoPullNow: () => Promise<void>;
}

interface WorkspaceContextValue {
  workspace: KansoWorkspace;
  gistConfig: GistSyncConfig;
  pushToast: (text: string, tone?: ToastMessage["tone"]) => void;

  // Focus & Entry actions
  addFocusItem: (
    bucket: Exclude<FocusBucket, null> | "custom-tab",
    rawText: string,
    tabId?: string,
  ) => boolean;
  moveFocusItem: (
    entryId: string,
    targetBucket: "anchor" | "x-active" | "custom-tab" | "timeline",
    options?: { tabId?: string; swapOutEntryId?: string },
  ) => { ok: boolean; reason?: "capacity" | "not_found" };
  clearFocusDayFromView: (dateKey: string) => void;
  addTimelineEntry: (
    type: EntryType,
    rawText: string,
    activeDateKey: string,
    extra?: Partial<Entry>,
  ) => Entry | null;
  createEntry: (draft: Partial<Entry>) => Entry;
  addAchievementEntry: (rawText: string, defaultType?: EntryType) => Entry | null;
  updateEntry: (id: string, patch: Partial<Entry>) => void;
  toggleEntryCompleted: (id: string) => void;
  toggleEntryAchievement: (id: string) => void;
  cycleEventAttendance: (id: string) => void;
  setEventAttendance: (id: string, attendance: EventAttendance) => void;
  deleteEntry: (id: string) => void;
  duplicateEntry: (id: string) => Entry | null;
  moveEntryToDate: (id: string, dateKey: string) => void;

  // Scratchpad actions
  addScratchpad: (paletteIndex?: number) => ScratchpadCard;
  updateScratchpad: (id: string, patch: Partial<ScratchpadCard>) => void;
  reorderScratchpads: (sortOrderById: Record<string, number>) => void;
  deleteScratchpad: (id: string) => void;
  sendScratchpadToTimeline: (id: string) => Entry | null;
  sendScratchpadToXActive: (
    id: string,
    swapOutEntryId?: string,
  ) => { ok: boolean; reason?: "capacity" | "not_found"; entry?: Entry };

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
    bookLink?: BookNoteLink | null;
    listItemLinks?: ListItemNoteLink[];
  }) => Entry;
  duplicateNotePage: (id: string) => Entry | null;
  deleteNotePage: (id: string, childMode?: "promote" | "cascade") => void;
  archiveNotePage: (
    id: string,
    archived: boolean,
    childMode?: "promote" | "cascade",
  ) => void;
  addNoteNotebook: (name: string, icon?: string) => NoteNotebook;
  updateNoteNotebook: (id: string, patch: Partial<NoteNotebook>) => void;
  deleteNoteNotebook: (id: string) => void;
  reorderNoteNotebooks: (
    draggedId: string,
    targetId: string,
    position: "before" | "after",
  ) => void;
  reorderNoteEntries: (sortOrderById: Record<string, number>) => void;

  // Habit actions
  addHabit: (habit: Omit<Habit, "id" | "createdAt" | "completions">) => Habit;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  toggleHabitCompletion: (habitId: string, dateKey: string) => void;
  setHabitDayStatus: (
    habitId: string,
    dateKey: string,
    status: "empty" | "done" | "missed",
  ) => void;
  cycleHabitDayStatus: (habitId: string, dateKey: string) => void;
  reorderHabits: (
    draggedId: string,
    targetId: string,
    position: "before" | "after",
  ) => void;

  // Lists actions
  addList: (
    title: string,
    icon: string,
    color?: string,
    listType?: ListCollectionType,
    parentId?: string | null,
  ) => ListCollection;
  updateList: (id: string, patch: Partial<ListCollection>) => void;
  renameList: (id: string, title: string, icon?: string) => void;
  deleteList: (
    id: string,
    moveItemsToListId?: string,
    linkedNotesBehavior?: "keep" | "delete",
  ) => void;
  reorderLists: (
    draggedId: string,
    targetId: string,
    position: "before" | "after" | "inside",
  ) => void;
  addListItem: (
    listId: string,
    rawText: string,
    status?: ListItemStatus,
  ) => ListItem | null;
  updateListItem: (id: string, patch: Partial<ListItem>) => void;
  reorderListItems: (
    sortOrderById: Record<string, number>,
    statusPatch?: { id: string; status: ListItemStatus },
  ) => void;
  deleteListItem: (
    id: string,
    linkedNotesBehavior?: "keep" | "delete",
  ) => void;
  deleteListItems: (
    ids: string[],
    linkedNotesBehavior?: "keep" | "delete",
  ) => void;
  linkNoteToListItem: (
    noteId: string,
    itemId: string,
    quote?: string,
  ) => void;
  unlinkNoteFromListItem: (noteId: string, itemId: string) => void;
  updateNoteListItemLinkQuote: (
    noteId: string,
    itemId: string,
    quote: string,
  ) => void;

  // Library Studio actions (Gist-synced metadata + IndexedDB annotations)
  addBook: (
    book: Omit<BookRecord, "id" | "addedAt"> & {
      id?: string;
      addedAt?: number;
    },
  ) => BookRecord;
  updateBook: (id: string, patch: Partial<BookRecord>) => void;
  deleteBook: (id: string) => Promise<void>;
  deleteBooks: (
    ids: string[],
    linkedNotesBehavior?: "keep" | "delete",
  ) => Promise<void>;
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
    }>,
  ) => void;
  syncLibraryAnnotationsFromDb: () => Promise<void>;
  sendBookExcerptToNotes: (
    bookTitle: string,
    excerptText: string,
    locationLabel?: string,
    linkMeta?: Partial<BookNoteLink>,
  ) => Entry;

  // Streamer actions
  addStream: (
    stream: Omit<StreamItem, "id" | "addedAt">,
    addToGrid?: boolean,
  ) => StreamItem;
  updateStream: (id: string, patch: Partial<StreamItem>) => void;
  deleteStream: (id: string) => void;
  toggleStreamInGrid: (id: string) => void;
  loadStreamsToGrid: (
    streamIds: string[],
    mode?: "replace" | "append",
    label?: string,
  ) => void;
  addStreamSlot: (
    streamId: string,
    overrides?: Partial<Omit<StackSlot, "slotId" | "streamId">>,
  ) => StackSlot | null;
  updateStreamSlot: (slotId: string, patch: Partial<StackSlot>) => void;
  updateAllStreamSlots: (updater: (slot: StackSlot) => StackSlot) => void;
  removeStreamSlot: (slotId: string) => void;
  clearStreamSlots: () => void;
  reorderActiveSlots: (fromIndex: number, toIndex: number) => void;
  incrementStreamListen: (id: string) => void;
  addStreamFolder: (
    name: string,
    parentId?: string | null,
    description?: string,
  ) => StreamFolder;
  updateStreamFolder: (id: string, patch: Partial<StreamFolder>) => void;
  reorderStreamFolders: (
    draggedId: string,
    targetId: string,
    position: "before" | "after" | "inside",
  ) => void;
  deleteStreamFolder: (id: string) => void;
  setStreamTopicIcon: (topic: string, icon: string | undefined) => void;
  renameStreamTopic: (fromTopic: string, targetTopic: string) => number;
  reorderStreamTopics: (orderedTopics: string[]) => void;
  resetStreamTopicOrder: () => void;
  updateStreamChannelMeta: (
    channelName: string,
    patch: Partial<StreamChannelMeta>,
  ) => void;
  reorderStreamChannels: (orderedChannelNames: string[]) => void;
  renameOrMergeStreamChannels: (
    fromNames: string[],
    targetName: string,
  ) => number;
  batchUpdateStreamChannels: (
    channelNames: string[],
    update: {
      topic?: string;
      tags?: string[];
      tagsMode?: "append" | "replace";
    },
  ) => number;
  deleteStreamChannels: (channelNames: string[]) => number;
  reorderActiveStreams: (fromIndex: number, toIndex: number) => void;
  reorderVaultStreams: (sortOrderById: Record<string, number>) => void;
  updateStreamerState: (patch: Partial<StreamerState>) => void;
  saveStreamPreset: (name: string, category?: string) => StreamPreset;
  loadStreamPreset: (presetId: string, mode?: "replace" | "append") => void;
  updateStreamPreset: (
    presetId: string,
    patch: Partial<
      Pick<StreamPreset, "name" | "category" | "pinned" | "sortOrder">
    >,
  ) => void;
  updateStreamPresetMix: (presetId: string) => void;
  reorderStreamPresets: (orderedPresetIds: string[]) => void;
  deleteStreamPreset: (presetId: string) => void;

  // Audio Studio actions (device-local files + multi-track mixer)
  addAudioTrack: (
    track: Omit<AudioTrackRecord, "id" | "addedAt"> & {
      id?: string;
      addedAt?: number;
    },
  ) => AudioTrackRecord;
  updateAudioTrack: (id: string, patch: Partial<AudioTrackRecord>) => void;
  deleteAudioTracks: (ids: string[]) => Promise<void>;
  updateAudioFolder: (id: string, patch: Partial<AudioFolderRecord>) => void;
  addAudioFolder: (
    name: string,
    parentId?: string | null,
    color?: AudioFolderRecord["color"],
  ) => AudioFolderRecord;
  deleteAudioFolder: (id: string) => void;
  addAudioPlaylist: (
    name: string,
    trackIds?: string[],
    description?: string,
    color?: AudioPlaylistRecord["color"],
  ) => AudioPlaylistRecord;
  updateAudioPlaylist: (
    id: string,
    patch: Partial<AudioPlaylistRecord>,
  ) => void;
  deleteAudioPlaylist: (id: string) => void;
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  reorderPlaylistTracks: (
    playlistId: string,
    fromIndex: number,
    toIndex: number,
  ) => void;
  reorderAudioTracks: (sortOrderById: Record<string, number>) => void;
  updateAudioState: (
    patch:
      | Partial<AudioStudioState>
      | ((prev: AudioStudioState) => AudioStudioState),
  ) => void;
  playAudioTrack: (trackId: string, options?: { replaceMix?: boolean }) => void;
  addAudioMixSlot: (
    trackId: string,
    overrides?: Partial<Omit<AudioMixSlot, "slotId" | "trackId">>,
  ) => AudioMixSlot | null;
  updateAudioMixSlot: (slotId: string, patch: Partial<AudioMixSlot>) => void;
  updateAllAudioMixSlots: (
    updater: (slot: AudioMixSlot) => AudioMixSlot,
  ) => void;
  removeAudioMixSlot: (slotId: string) => void;
  clearAudioMixSlots: () => void;
  reorderAudioMixSlots: (fromIndex: number, toIndex: number) => void;
  saveAudioMixPreset: (name: string, category?: string) => AudioMixPreset;
  loadAudioMixPreset: (presetId: string) => void;
  deleteAudioMixPreset: (presetId: string) => void;
  recordAudioPlay: (trackId: string) => void;
  setAudioEqPreset: (eqPreset: AudioEqPreset) => void;

  // Contacts CRM
  addContact: (draft?: Partial<ContactRecord>) => ContactRecord;
  updateContact: (id: string, patch: Partial<ContactRecord>) => void;
  deleteContact: (id: string) => void;
  importContacts: (incoming: Partial<ContactRecord>[]) => number;
  addContactCircle: (name: string, color: string, description?: string) => ContactCircle;
  updateContactCircle: (id: string, patch: Partial<ContactCircle>) => void;
  deleteContactCircle: (id: string) => void;

  // Personal Finance (Strictly Standalone)
  addFinanceAccount: (
    draft: Omit<FinanceAccount, "id" | "createdAt" | "updatedAt">,
  ) => FinanceAccount;
  updateFinanceAccount: (id: string, patch: Partial<FinanceAccount>) => void;
  deleteFinanceAccount: (id: string) => void;
  addFinanceCategory: (
    draft: Omit<FinanceCategory, "id" | "createdAt" | "updatedAt">,
  ) => FinanceCategory;
  updateFinanceCategory: (id: string, patch: Partial<FinanceCategory>) => void;
  deleteFinanceCategory: (id: string) => void;
  addFinanceTransaction: (
    draft: Omit<FinanceTransaction, "id" | "createdAt" | "updatedAt">,
  ) => FinanceTransaction;
  updateFinanceTransaction: (
    id: string,
    patch: Partial<FinanceTransaction>,
  ) => void;
  deleteFinanceTransaction: (id: string) => void;
  importFinanceTransactions: (
    drafts: Omit<FinanceTransaction, "id" | "createdAt" | "updatedAt">[],
  ) => number;
  addFinanceSubscription: (
    draft: Omit<FinanceSubscription, "id" | "createdAt" | "updatedAt">,
  ) => FinanceSubscription;
  updateFinanceSubscription: (
    id: string,
    patch: Partial<FinanceSubscription>,
  ) => void;
  deleteFinanceSubscription: (id: string) => void;
  logFinanceSubscriptionNow: (id: string, dateKey?: string) => void;
  skipFinanceSubscriptionCycle: (id: string) => void;
  runDueFinanceSubscriptions: () => number;
  updateFinanceSettings: (patch: Partial<FinanceSettings>) => void;

  // Languages (Standalone Absorption Studio)
  setActiveLanguageId: (languageId: string | null) => void;
  addLanguageProfile: (
    draft: Omit<LanguageProfile, "id" | "createdAt" | "updatedAt">,
  ) => LanguageProfile;
  updateLanguageProfile: (id: string, patch: Partial<LanguageProfile>) => void;
  deleteLanguageProfile: (id: string) => void;
  addLanguageDeck: (
    draft: Omit<LanguageDeck, "id" | "createdAt">,
  ) => LanguageDeck;
  updateLanguageDeck: (id: string, patch: Partial<LanguageDeck>) => void;
  deleteLanguageDeck: (id: string) => void;
  addLanguageItem: (
    draft: Omit<LanguageItem, "id" | "srs" | "createdAt" | "updatedAt"> & {
      srs?: LanguageItem["srs"];
    },
  ) => LanguageItem;
  updateLanguageItem: (id: string, patch: Partial<LanguageItem>) => void;
  deleteLanguageItem: (id: string) => void;
  reviewLanguageItem: (id: string, rating: LanguageSrsRating) => void;
  importLanguageItems: (
    languageId: string,
    drafts: Array<
      Omit<LanguageItem, "id" | "languageId" | "srs" | "createdAt" | "updatedAt">
    >,
  ) => number;

  // Settings, Sync & Reset
  quickPushGist: () => Promise<boolean>;
  quickPullGist: () => Promise<boolean>;
  updateSettings: (patch: Partial<WorkspaceSettings>) => void;
  updateGistConfig: (patch: Partial<GistSyncConfig>) => void;
  replaceWorkspace: (
    next: KansoWorkspace,
    toastMessage?: string,
    options?: { preserveLocalLibrary?: boolean },
  ) => void;
  purgeWorkspaceSection: (
    toastMessage: string,
    updater: (prev: KansoWorkspace) => KansoWorkspace,
  ) => void;
  clearWorkspaceData: () => void;
  restoreSampleData: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const ToastContext = createContext<ToastContextValue | null>(null);
const GistSyncStatusContext =
  createContext<GistSyncStatusContextValue | null>(null);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const initialLoadRef = useRef<{
    workspace: KansoWorkspace;
    fromLocalStorage: boolean;
  } | null>(null);
  if (!initialLoadRef.current) {
    initialLoadRef.current = loadInitialWorkspaceState();
  }

  const [workspace, setWorkspace] = useState<KansoWorkspace>(
    () => initialLoadRef.current!.workspace,
  );
  const [gistConfig, setGistConfig] = useState<GistSyncConfig>(
    loadInitialGistConfig,
  );
  const [gistSyncBusy, setGistSyncBusy] = useState<"push" | "pull" | null>(
    null,
  );
  const [autoPushStatus, setAutoPushStatus] = useState<AutoPushStatus>({
    phase: "idle",
    secondsRemaining: null,
    hasPendingChanges: false,
    lastAutoPushedAt: null,
    conflictRemoteUpdatedAt: null,
    message: null,
  });
  const [autoPullStatus, setAutoPullStatus] = useState<AutoPullStatus>({
    phase: "idle",
    hasRemoteUpdate: false,
    lastCheckedAt: null,
    lastAutoPulledAt: null,
    remoteUpdatedAt: null,
    message: null,
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const latestWorkspaceRef = useRef<KansoWorkspace>(workspace);
  latestWorkspaceRef.current = workspace;
  const latestGistConfigRef = useRef<GistSyncConfig>(gistConfig);
  latestGistConfigRef.current = gistConfig;
  const latestGistSyncBusyRef = useRef<"push" | "pull" | null>(gistSyncBusy);
  latestGistSyncBusyRef.current = gistSyncBusy;
  const hasUserMutatedRef = useRef(false);
  const skipInitialPersistRef = useRef(true);
  const quotaToastShownRef = useRef(false);
  const idbWriteQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const persistTimerRef = useRef<number | null>(null);
  const prevSyncableWsRef = useRef<KansoWorkspace>(workspace);
  const suppressAutoPushDirtyRef = useRef(false);
  const autoPushDirtyRef = useRef(loadInitialGistDirtyFlag());
  const autoPushConflictRef = useRef(false);
  const autoPushDeadlineRef = useRef<number | null>(null);
  const autoPushTimerRef = useRef<number | null>(null);
  const autoPushTickRef = useRef<number | null>(null);
  const autoPushSyncedClearRef = useRef<number | null>(null);
  const autoPushConflictToastShownRef = useRef(false);
  const autoPullRetryTimerRef = useRef<number | null>(null);
  const autoPullPulledClearRef = useRef<number | null>(null);
  const lastAutoPullCheckAtRef = useRef<number>(0);
  const lastAutoPullConflictRemoteRef = useRef<string | null>(null);
  const initialAutoPullCheckedRef = useRef(false);

  const pushToast = useCallback(
    (text: string, tone: ToastMessage["tone"] = "neutral") => {
      const id = uid("toast");
      setToasts((prev) => [...prev.slice(-3), { id, text, tone }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3400);
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const enqueueIdbWorkspaceSave = useCallback((ws: KansoWorkspace) => {
    const task = idbWriteQueueRef.current
      .catch(() => true)
      .then(async () => {
        try {
          await libraryDb.saveWorkspaceSnapshot(ws);
          return true;
        } catch {
          return false;
        }
      });
    idbWriteQueueRef.current = task;
    return task;
  }, []);

  // Debounce durable persistence (350ms) to both localStorage (with compact fallbacks) and IndexedDB
  useEffect(() => {
    if (skipInitialPersistRef.current) {
      skipInitialPersistRef.current = false;
      return;
    }
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      const snapshot = latestWorkspaceRef.current;
      const lsResult = persistWorkspaceToLocalStorage(snapshot);
      void enqueueIdbWorkspaceSave(snapshot).then((idbOk) => {
        if (lsResult === "failed" && !idbOk && !quotaToastShownRef.current) {
          quotaToastShownRef.current = true;
          pushToast(
            "Browser storage is full — free up space in Settings → Storage.",
            "error",
          );
        }
      });
    }, 350);
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [workspace, enqueueIdbWorkspaceSave, pushToast]);

  // Flush workspace immediately if the tab is hidden, closed, or refreshed
  useEffect(() => {
    const flushNow = (alsoIdb: boolean) => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      const snapshot = latestWorkspaceRef.current;
      persistWorkspaceToLocalStorage(snapshot);
      if (alsoIdb) {
        void enqueueIdbWorkspaceSave(snapshot);
      }
    };
    const handlePageHide = () => flushNow(false);
    const handleBeforeUnload = () => flushNow(false);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushNow(true);
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enqueueIdbWorkspaceSave]);

  // Persist gist config locally
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_GIST_KEY, JSON.stringify(gistConfig));
    } catch {
      // Ignore
    }
  }, [gistConfig]);

  const clearAutoPushTimers = useCallback(() => {
    if (autoPushTimerRef.current !== null) {
      window.clearTimeout(autoPushTimerRef.current);
      autoPushTimerRef.current = null;
    }
    if (autoPushTickRef.current !== null) {
      window.clearInterval(autoPushTickRef.current);
      autoPushTickRef.current = null;
    }
    if (autoPushSyncedClearRef.current !== null) {
      window.clearTimeout(autoPushSyncedClearRef.current);
      autoPushSyncedClearRef.current = null;
    }
    autoPushDeadlineRef.current = null;
  }, []);

  const dismissAutoPushNotice = useCallback(() => {
    autoPushConflictRef.current = false;
    autoPushConflictToastShownRef.current = false;
    setAutoPushStatus((prev) => ({
      ...prev,
      phase: "idle",
      secondsRemaining: null,
      conflictRemoteUpdatedAt: null,
      message: null,
    }));
  }, []);

  const scheduleAutoPushCountdownRef = useRef<(delaySec?: number) => void>(
    () => {},
  );

  const runSafeAutoPush = useCallback(async () => {
    const cfg = latestGistConfigRef.current;
    if (!cfg.autoPushEnabled || !cfg.token.trim() || !cfg.gistId.trim()) {
      clearAutoPushTimers();
      return;
    }
    if (autoPushConflictRef.current) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      clearAutoPushTimers();
      setAutoPushStatus((prev) => ({
        ...prev,
        phase: "offline",
        secondsRemaining: null,
        hasPendingChanges: true,
        message: "Offline — waiting to reconnect",
      }));
      return;
    }

    if (latestGistSyncBusyRef.current !== null) {
      scheduleAutoPushCountdownRef.current(2);
      return;
    }

    clearAutoPushTimers();
    latestGistSyncBusyRef.current = "push";
    setGistSyncBusy("push");
    setAutoPushStatus((prev) => ({
      ...prev,
      phase: "checking",
      secondsRemaining: null,
      hasPendingChanges: true,
      message: "Checking remote Gist...",
    }));

    try {
      const remoteUpdatedAt = await fetchRemoteGistUpdatedAt(cfg);
      const knownSyncStr = cfg.lastRemoteUpdatedAt || cfg.lastSyncedAt;
      const remoteMs = remoteUpdatedAt ? Date.parse(remoteUpdatedAt) : NaN;
      const knownMs = knownSyncStr ? Date.parse(knownSyncStr) : NaN;

      if (
        !Number.isNaN(remoteMs) &&
        !Number.isNaN(knownMs) &&
        remoteMs > knownMs + 1000
      ) {
        autoPushConflictRef.current = true;
        autoPushDirtyRef.current = true;
        persistGistDirtyFlag(true);
        setAutoPushStatus((prev) => ({
          ...prev,
          phase: "conflict",
          secondsRemaining: null,
          hasPendingChanges: true,
          conflictRemoteUpdatedAt: remoteUpdatedAt,
          message: "Remote Gist is newer. Pull before pushing.",
        }));
        if (!autoPushConflictToastShownRef.current) {
          autoPushConflictToastShownRef.current = true;
          pushToast(
            "Auto-push paused: remote Gist has newer changes. Pull before pushing.",
            "error",
          );
        }
        return;
      }

      setAutoPushStatus((prev) => ({
        ...prev,
        phase: "pushing",
        secondsRemaining: null,
        hasPendingChanges: true,
        message: "Auto-pushing...",
      }));

      const snapshot = latestWorkspaceRef.current;
      const result = await pushWorkspaceToGist(snapshot, cfg);
      const editedDuringPush = hasSyncableWorkspaceChanged(
        snapshot,
        latestWorkspaceRef.current,
      );

      setGistConfig((prev) => ({
        ...prev,
        gistId: result.gistId,
        lastSyncedAt: result.updatedAt,
        lastRemoteUpdatedAt: result.updatedAt,
        lastDirection: "push",
      }));

      autoPushConflictRef.current = false;
      autoPushConflictToastShownRef.current = false;
      lastAutoPullConflictRemoteRef.current = null;
      setAutoPullStatus((prev) =>
        prev.phase === "conflict"
          ? {
              ...prev,
              phase: "idle",
              hasRemoteUpdate: false,
              remoteUpdatedAt: result.updatedAt,
              message: null,
            }
          : prev,
      );

      if (editedDuringPush) {
        autoPushDirtyRef.current = true;
        persistGistDirtyFlag(true);
        scheduleAutoPushCountdownRef.current();
        return;
      }

      autoPushDirtyRef.current = false;
      persistGistDirtyFlag(false);
      setAutoPushStatus({
        phase: "synced",
        secondsRemaining: null,
        hasPendingChanges: false,
        lastAutoPushedAt: result.updatedAt,
        conflictRemoteUpdatedAt: null,
        message: "Auto-pushed",
      });

      if (
        cfg.autoPushIndicatorEnabled !== false &&
        cfg.autoPushIndicatorStyle === "toast"
      ) {
        pushToast("Auto-pushed workspace to GitHub Gist", "success");
      }

      autoPushSyncedClearRef.current = window.setTimeout(() => {
        autoPushSyncedClearRef.current = null;
        setAutoPushStatus((prev) =>
          prev.phase === "synced"
            ? { ...prev, phase: "idle", message: null }
            : prev,
        );
      }, 5000);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Auto-push failed.";
      setAutoPushStatus((prev) => ({
        ...prev,
        phase: "error",
        secondsRemaining: null,
        hasPendingChanges: autoPushDirtyRef.current,
        message: msg,
      }));
      pushToast(`Auto-push failed: ${msg}`, "error");
    } finally {
      latestGistSyncBusyRef.current = null;
      setGistSyncBusy(null);
    }
  }, [clearAutoPushTimers, pushToast]);

  const scheduleAutoPushCountdown = useCallback(
    (overrideDelaySec?: number) => {
      const cfg = latestGistConfigRef.current;
      if (
        !cfg.autoPushEnabled ||
        !cfg.token.trim() ||
        !cfg.gistId.trim() ||
        autoPushConflictRef.current
      ) {
        return;
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        clearAutoPushTimers();
        setAutoPushStatus((prev) => ({
          ...prev,
          phase: "offline",
          secondsRemaining: null,
          hasPendingChanges: true,
          message: "Offline — waiting to reconnect",
        }));
        return;
      }

      const delaySec =
        overrideDelaySec ?? clampAutoPushDelaySeconds(cfg.autoPushDelaySeconds);
      clearAutoPushTimers();
      const deadline = Date.now() + delaySec * 1000;
      autoPushDeadlineRef.current = deadline;

      setAutoPushStatus((prev) => ({
        ...prev,
        phase: "pending",
        secondsRemaining: delaySec,
        hasPendingChanges: true,
        conflictRemoteUpdatedAt: null,
        message: `Auto-push in ${delaySec}s`,
      }));

      autoPushTickRef.current = window.setInterval(() => {
        if (autoPushDeadlineRef.current === null) return;
        const remaining = Math.max(
          0,
          Math.ceil((autoPushDeadlineRef.current - Date.now()) / 1000),
        );
        setAutoPushStatus((prev) => {
          if (prev.phase !== "pending") return prev;
          if (prev.secondsRemaining === remaining) return prev;
          return {
            ...prev,
            secondsRemaining: remaining,
            message: `Auto-push in ${remaining}s`,
          };
        });
      }, 1000);

      autoPushTimerRef.current = window.setTimeout(() => {
        void runSafeAutoPush();
      }, delaySec * 1000);
    },
    [clearAutoPushTimers, runSafeAutoPush],
  );

  scheduleAutoPushCountdownRef.current = scheduleAutoPushCountdown;

  // Detect syncable workspace changes for Safe Hybrid Auto-Push
  useEffect(() => {
    const prevWs = prevSyncableWsRef.current;
    prevSyncableWsRef.current = workspace;

    if (suppressAutoPushDirtyRef.current) {
      suppressAutoPushDirtyRef.current = false;
      return;
    }
    if (!hasUserMutatedRef.current) return;
    if (!hasSyncableWorkspaceChanged(prevWs, workspace)) return;

    autoPushDirtyRef.current = true;
    persistGistDirtyFlag(true);
    const cfg = latestGistConfigRef.current;
    if (!cfg.autoPushEnabled || !cfg.token.trim() || !cfg.gistId.trim()) {
      return;
    }
    if (autoPushConflictRef.current) {
      setAutoPushStatus((prev) => ({
        ...prev,
        hasPendingChanges: true,
      }));
      return;
    }
    scheduleAutoPushCountdown();
  }, [workspace, scheduleAutoPushCountdown]);

  // React to Auto-Push config toggles / delay updates & online/offline changes
  useEffect(() => {
    const isActive =
      Boolean(gistConfig.autoPushEnabled) &&
      Boolean(gistConfig.token.trim()) &&
      Boolean(gistConfig.gistId.trim());

    if (!isActive) {
      clearAutoPushTimers();
      autoPushConflictRef.current = false;
      autoPushConflictToastShownRef.current = false;
      setAutoPushStatus((prev) =>
        prev.phase === "idle" && !prev.hasPendingChanges && !prev.message
          ? prev
          : {
              phase: "idle",
              secondsRemaining: null,
              hasPendingChanges: false,
              lastAutoPushedAt: prev.lastAutoPushedAt,
              conflictRemoteUpdatedAt: null,
              message: null,
            },
      );
      return;
    }

    if (
      autoPushDirtyRef.current &&
      !autoPushConflictRef.current &&
      latestGistSyncBusyRef.current === null
    ) {
      scheduleAutoPushCountdown();
    }
  }, [
    gistConfig.autoPushEnabled,
    gistConfig.autoPushDelaySeconds,
    gistConfig.token,
    gistConfig.gistId,
    clearAutoPushTimers,
    scheduleAutoPushCountdown,
  ]);

  useEffect(() => {
    const handleOnline = () => {
      const cfg = latestGistConfigRef.current;
      if (
        cfg.autoPushEnabled &&
        cfg.token.trim() &&
        cfg.gistId.trim() &&
        autoPushDirtyRef.current &&
        !autoPushConflictRef.current
      ) {
        scheduleAutoPushCountdown(
          Math.min(5, clampAutoPushDelaySeconds(cfg.autoPushDelaySeconds)),
        );
      }
    };
    const handleOffline = () => {
      const cfg = latestGistConfigRef.current;
      if (
        cfg.autoPushEnabled &&
        autoPushDirtyRef.current &&
        !autoPushConflictRef.current
      ) {
        clearAutoPushTimers();
        setAutoPushStatus((prev) => ({
          ...prev,
          phase: "offline",
          secondsRemaining: null,
          hasPendingChanges: true,
          message: "Offline — waiting to reconnect",
        }));
      }
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearAutoPushTimers();
    };
  }, [clearAutoPushTimers, scheduleAutoPushCountdown]);

  const clearAutoPullTimers = useCallback(() => {
    if (autoPullRetryTimerRef.current !== null) {
      window.clearTimeout(autoPullRetryTimerRef.current);
      autoPullRetryTimerRef.current = null;
    }
    if (autoPullPulledClearRef.current !== null) {
      window.clearTimeout(autoPullPulledClearRef.current);
      autoPullPulledClearRef.current = null;
    }
  }, []);

  const dismissAutoPullNotice = useCallback(() => {
    lastAutoPullConflictRemoteRef.current = null;
    setAutoPullStatus((prev) => ({
      ...prev,
      phase: "idle",
      hasRemoteUpdate: false,
      message: null,
    }));
  }, []);

  const replaceWorkspaceRef = useRef<
    (
      next: KansoWorkspace,
      toastMessage?: string,
      options?: { preserveLocalLibrary?: boolean },
    ) => void
  >(() => {});

  const runSafeAutoPullCheck = useCallback(
    async (trigger: "boot" | "resume" | "reconnect" | "manual") => {
      const cfg = latestGistConfigRef.current;
      if (!cfg.autoPullEnabled || !cfg.gistId.trim()) {
        clearAutoPullTimers();
        return;
      }

      const mode = cfg.autoPullCheckMode ?? "resume-cooldown";
      if (trigger === "resume") {
        if (mode === "boot-only") return;
        const elapsedMs = Date.now() - lastAutoPullCheckAtRef.current;
        if (mode === "resume-cooldown") {
          const cooldownMs =
            clampAutoPullCooldownSeconds(cfg.autoPullCooldownSeconds) * 1000;
          if (elapsedMs < cooldownMs) return;
        } else if (elapsedMs < 2000) {
          // Deduplicate paired focus + visibilitychange events on the same resume
          return;
        }
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setAutoPullStatus((prev) => ({
          ...prev,
          phase: "offline",
          message: "Offline — will check on reconnect",
        }));
        return;
      }

      if (latestGistSyncBusyRef.current !== null) {
        if (
          (trigger === "boot" || trigger === "reconnect" || trigger === "manual") &&
          autoPullRetryTimerRef.current === null
        ) {
          autoPullRetryTimerRef.current = window.setTimeout(() => {
            autoPullRetryTimerRef.current = null;
            void runSafeAutoPullCheck(trigger);
          }, 2500);
        }
        return;
      }

      if (autoPullRetryTimerRef.current !== null) {
        window.clearTimeout(autoPullRetryTimerRef.current);
        autoPullRetryTimerRef.current = null;
      }
      if (autoPullPulledClearRef.current !== null) {
        window.clearTimeout(autoPullPulledClearRef.current);
        autoPullPulledClearRef.current = null;
      }

      lastAutoPullCheckAtRef.current = Date.now();
      latestGistSyncBusyRef.current = "pull";
      setGistSyncBusy("pull");
      setAutoPullStatus((prev) => ({
        ...prev,
        phase: "checking",
        message: "Checking Gist...",
      }));

      try {
        const remoteUpdatedAt = await fetchRemoteGistUpdatedAt(cfg);
        const nowIso = new Date().toISOString();
        const knownSyncStr = cfg.lastRemoteUpdatedAt || cfg.lastSyncedAt;
        const remoteMs = remoteUpdatedAt ? Date.parse(remoteUpdatedAt) : NaN;
        const knownMs = knownSyncStr ? Date.parse(knownSyncStr) : NaN;

        const remoteIsNewer =
          !Number.isNaN(remoteMs) &&
          (Number.isNaN(knownMs) || remoteMs > knownMs + 1000);

        if (!remoteIsNewer) {
          setAutoPullStatus((prev) => ({
            ...prev,
            phase: "idle",
            hasRemoteUpdate: false,
            lastCheckedAt: nowIso,
            remoteUpdatedAt: remoteUpdatedAt ?? prev.remoteUpdatedAt,
            message: null,
          }));
          return;
        }

        // Local has unpushed edits or active conflict -> pause and warn safely
        if (autoPushDirtyRef.current || autoPushConflictRef.current) {
          autoPushConflictRef.current = true;
          setAutoPullStatus((prev) => ({
            ...prev,
            phase: "conflict",
            hasRemoteUpdate: true,
            lastCheckedAt: nowIso,
            remoteUpdatedAt,
            message: "Remote Gist is newer — local edits kept safe",
          }));
          if (lastAutoPullConflictRemoteRef.current !== remoteUpdatedAt) {
            lastAutoPullConflictRemoteRef.current = remoteUpdatedAt;
            pushToast(
              "Auto-pull paused: remote Gist is newer, but this device has unpushed local edits.",
              "error",
            );
          }
          return;
        }

        setAutoPullStatus((prev) => ({
          ...prev,
          phase: "pulling",
          hasRemoteUpdate: true,
          lastCheckedAt: nowIso,
          remoteUpdatedAt,
          message: "Auto-pulling...",
        }));

        const preview = await pullWorkspaceFromGist(cfg);

        // Guard against edits made while the pull request was in flight
        if (autoPushDirtyRef.current) {
          autoPushConflictRef.current = true;
          setAutoPullStatus((prev) => ({
            ...prev,
            phase: "conflict",
            hasRemoteUpdate: true,
            lastCheckedAt: new Date().toISOString(),
            remoteUpdatedAt: preview.remoteUpdatedAt,
            message: "Remote Gist is newer — local edits kept safe",
          }));
          if (lastAutoPullConflictRemoteRef.current !== preview.remoteUpdatedAt) {
            lastAutoPullConflictRemoteRef.current = preview.remoteUpdatedAt;
            pushToast(
              "Auto-pull paused: local edits were made while fetching remote updates.",
              "error",
            );
          }
          return;
        }

        autoPushDirtyRef.current = false;
        persistGistDirtyFlag(false);
        autoPushConflictRef.current = false;
        autoPushConflictToastShownRef.current = false;
        lastAutoPullConflictRemoteRef.current = null;
        clearAutoPushTimers();

        replaceWorkspaceRef.current(preview.workspace, undefined, {
          preserveLocalLibrary: true,
        });

        setGistConfig((prev) => ({
          ...prev,
          lastSyncedAt: preview.remoteUpdatedAt,
          lastRemoteUpdatedAt: preview.remoteUpdatedAt,
          lastDirection: "pull",
        }));

        setAutoPushStatus((prev) => ({
          phase: "idle",
          secondsRemaining: null,
          hasPendingChanges: false,
          lastAutoPushedAt: prev.lastAutoPushedAt,
          conflictRemoteUpdatedAt: null,
          message: null,
        }));

        setAutoPullStatus({
          phase: "pulled",
          hasRemoteUpdate: false,
          lastCheckedAt: new Date().toISOString(),
          lastAutoPulledAt: preview.remoteUpdatedAt,
          remoteUpdatedAt: preview.remoteUpdatedAt,
          message: "Auto-pulled",
        });

        if (
          cfg.autoPullIndicatorEnabled !== false &&
          cfg.autoPullIndicatorStyle === "toast"
        ) {
          pushToast(
            "Auto-pulled latest workspace from GitHub Gist",
            "success",
          );
        }

        autoPullPulledClearRef.current = window.setTimeout(() => {
          autoPullPulledClearRef.current = null;
          setAutoPullStatus((prev) =>
            prev.phase === "pulled"
              ? { ...prev, phase: "idle", message: null }
              : prev,
          );
        }, 5000);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Auto-pull check failed.";
        setAutoPullStatus((prev) => ({
          ...prev,
          phase: "error",
          lastCheckedAt: new Date().toISOString(),
          message: msg,
        }));
        if (
          cfg.autoPullIndicatorEnabled !== false &&
          cfg.autoPullIndicatorStyle === "toast"
        ) {
          pushToast(`Auto-pull failed: ${msg}`, "error");
        }
      } finally {
        latestGistSyncBusyRef.current = null;
        setGistSyncBusy(null);
      }
    },
    [clearAutoPullTimers, clearAutoPushTimers, pushToast],
  );

  const checkAutoPullNow = useCallback(async () => {
    await runSafeAutoPullCheck("manual");
  }, [runSafeAutoPullCheck]);

  // Trigger Clean-State Auto-Pull on initial boot / toggle enable, app resume, and reconnect
  useEffect(() => {
    const isActive =
      Boolean(gistConfig.autoPullEnabled) && Boolean(gistConfig.gistId.trim());

    if (!isActive) {
      initialAutoPullCheckedRef.current = false;
      clearAutoPullTimers();
      lastAutoPullConflictRemoteRef.current = null;
      setAutoPullStatus((prev) =>
        prev.phase === "idle" && !prev.hasRemoteUpdate && !prev.message
          ? prev
          : {
              phase: "idle",
              hasRemoteUpdate: false,
              lastCheckedAt: prev.lastCheckedAt,
              lastAutoPulledAt: prev.lastAutoPulledAt,
              remoteUpdatedAt: prev.remoteUpdatedAt,
              message: null,
            },
      );
      return;
    }

    if (!initialAutoPullCheckedRef.current) {
      initialAutoPullCheckedRef.current = true;
      void runSafeAutoPullCheck("boot");
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runSafeAutoPullCheck("resume");
      }
    };
    const handleFocus = () => {
      void runSafeAutoPullCheck("resume");
    };
    const handleOnline = () => {
      void runSafeAutoPullCheck("reconnect");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      clearAutoPullTimers();
    };
  }, [
    gistConfig.autoPullEnabled,
    gistConfig.gistId,
    gistConfig.autoPullCheckMode,
    gistConfig.autoPullCooldownSeconds,
    clearAutoPullTimers,
    runSafeAutoPullCheck,
  ]);

  // Apply theme & light/dark mode to <html> and sync native Android StatusBar
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", workspace.settings.theme);
    if (workspace.settings.colorMode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    void syncNativeStatusBar(
      workspace.settings.theme,
      workspace.settings.colorMode,
    );
  }, [workspace.settings.theme, workspace.settings.colorMode]);

  // Apply typography CSS variables to <html>
  useEffect(() => {
    applyWorkspaceFonts(workspace.settings);
  }, [
    workspace.settings.fontBody,
    workspace.settings.fontDisplay,
    workspace.settings.fontNotes,
    workspace.settings.fontMono,
  ]);

  // Hydrate workspace from IndexedDB if newer/more complete, compact oversized legacy covers, and seed annotations
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let effectiveWorkspace = latestWorkspaceRef.current;

        const snapshot = await libraryDb
          .loadWorkspaceSnapshot()
          .catch(() => null);
        if (cancelled) return;

        if (!hasUserMutatedRef.current && snapshot?.workspace) {
          const hydrated = normalizeParsedWorkspace(
            snapshot.workspace as Partial<KansoWorkspace>,
          );
          if (hydrated) {
            const lsWs = latestWorkspaceRef.current;
            const lsTime = Date.parse(lsWs.updatedAt || "") || 0;
            const idbTime = Date.parse(hydrated.updatedAt || "") || 0;
            const lsMissingCovers = lsWs.books.some(
              (b) =>
                !b.coverDataUrl &&
                hydrated.books.some(
                  (hb) => hb.id === b.id && Boolean(hb.coverDataUrl),
                ),
            );
            const lsEntryMap = new Map(lsWs.entries.map((e) => [e.id, e]));
            const lsMissingInlineImages = hydrated.entries.some((he) => {
              if (!he.content || !he.content.includes("data:image/")) {
                return false;
              }
              const lsEntry = lsEntryMap.get(he.id);
              return !lsEntry || he.content.length > lsEntry.content.length + 1024;
            });

            const shouldPreferIdb =
              !initialLoadRef.current?.fromLocalStorage ||
              idbTime > lsTime ||
              (idbTime === lsTime &&
                (lsMissingCovers ||
                  lsMissingInlineImages ||
                  hydrated.books.length > lsWs.books.length));

            if (shouldPreferIdb) {
              effectiveWorkspace = hydrated;
              setWorkspace(hydrated);
            } else if (lsTime > idbTime) {
              void enqueueIdbWorkspaceSave(lsWs);
            }
          }
        } else if (!hasUserMutatedRef.current && !snapshot?.workspace) {
          void enqueueIdbWorkspaceSave(effectiveWorkspace);
        }

        // One-time compaction of any legacy uncompressed book covers (> 100 KB)
        const oversizedBooks = effectiveWorkspace.books.filter(
          (b) =>
            typeof b.coverDataUrl === "string" && b.coverDataUrl.length > 100_000,
        );
        if (oversizedBooks.length > 0 && !cancelled) {
          const compacted = await Promise.all(
            oversizedBooks.map(async (b) => ({
              id: b.id,
              original: b.coverDataUrl!,
              compressed: await compressCoverDataUrl(b.coverDataUrl!),
            })),
          );
          if (!cancelled) {
            const patchMap = new Map(
              compacted
                .filter(
                  (c) => c.compressed && c.compressed.length < c.original.length,
                )
                .map((c) => [c.id, c.compressed]),
            );
            if (patchMap.size > 0) {
              setWorkspace((prev) => ({
                ...prev,
                books: prev.books.map((b) => {
                  const nextCover = patchMap.get(b.id);
                  return nextCover &&
                    b.coverDataUrl &&
                    b.coverDataUrl.length > 100_000
                    ? { ...b, coverDataUrl: nextCover }
                    : b;
                }),
                updatedAt: new Date().toISOString(),
              }));
            }
          }
        }

        const [dbBookmarks, dbHighlights] = await Promise.all([
          libraryDb.getAllBookmarks(),
          libraryDb.getAllHighlights(),
        ]);
        if (cancelled) return;

        const wsBookmarks = effectiveWorkspace.bookBookmarks ?? [];
        const wsHighlights = effectiveWorkspace.bookHighlights ?? [];

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

  const mutateWorkspace = useCallback(
    (updater: (prev: KansoWorkspace) => KansoWorkspace) => {
      hasUserMutatedRef.current = true;
      setWorkspace((prev) => {
        const next = updater(prev);
        return { ...next, updatedAt: new Date().toISOString() };
      });
    },
    [],
  );

  const addFocusItem = useCallback(
    (
      bucket: Exclude<FocusBucket, null> | "custom-tab",
      rawText: string,
      tabId?: string,
    ): boolean => {
      const trimmed = rawText.trim();
      if (!trimmed) return false;

      const currentWs = latestWorkspaceRef.current;
      const todayKey = getTodayKey();
      const parsed = parseNlpInput(
        trimmed,
        todayKey,
        currentWs.settings.timeFormat,
      );
      const nowIso = new Date().toISOString();

      if (bucket === "x-active") {
        const activeCount = currentWs.entries.filter(
          (e) =>
            (e.source === "focus-active" || e.focusBucket === "x-active") &&
            !e.completed,
        ).length;
        if (activeCount >= currentWs.settings.xActiveLimit) {
          return false;
        }
      }

      if (bucket === "anchor") {
        const anchorEntry: Entry = {
          id: uid("ent"),
          type: "task",
          title: parsed.cleanTitle,
          content: "",
          createdAt: nowIso,
          updatedAt: nowIso,
          scheduledAt: parsed.scheduledAt || nowIso,
          completedAt: null,
          endAt: parsed.endAt,
          completed: false,
          focusBucket: "anchor",
          source: "focus-anchor",
          tags: parsed.tags,
          listIds: [],
        };
        mutateWorkspace((prev) => ({
          ...prev,
          entries: [anchorEntry, ...prev.entries],
        }));
        return true;
      }

      if (bucket === "x-active") {
        const xEntry: Entry = {
          id: uid("ent"),
          type: "task",
          title: parsed.cleanTitle,
          content: "",
          createdAt: nowIso,
          updatedAt: nowIso,
          scheduledAt: parsed.scheduledAt,
          completedAt: null,
          endAt: parsed.endAt,
          completed: false,
          focusBucket: "x-active",
          source: "focus-active",
          tags: parsed.tags,
          listIds: [],
        };
        mutateWorkspace((prev) => ({
          ...prev,
          entries: [xEntry, ...prev.entries],
        }));
        return true;
      }

      if (bucket === "custom-tab") {
        const customEntry: Entry = {
          id: uid("ent"),
          type: "task",
          title: parsed.cleanTitle,
          content: "",
          createdAt: nowIso,
          updatedAt: nowIso,
          scheduledAt: parsed.scheduledAt,
          completedAt: null,
          endAt: parsed.endAt,
          completed: false,
          focusBucket: null,
          source: "custom-tab",
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
        id: uid("ent"),
        type: "log",
        title: parsed.cleanTitle,
        content: "",
        createdAt: finishedTime,
        updatedAt: nowIso,
        scheduledAt: parsed.scheduledAt,
        completedAt: finishedTime,
        endAt: parsed.endAt,
        completed: true,
        focusBucket: "completed",
        source: "timeline",
        tags: parsed.tags,
        listIds: [],
      };

      mutateWorkspace((prev) => ({
        ...prev,
        entries: [logEntry, ...prev.entries],
      }));
      pushToast(
        `Logged at ${formatTime(finishedTime, currentWs.settings.timeFormat)}`,
        "success",
      );
      return true;
    },
    [mutateWorkspace, pushToast],
  );

  const moveFocusItem = useCallback(
    (
      entryId: string,
      targetBucket: "anchor" | "x-active" | "custom-tab" | "timeline",
      options?: { tabId?: string; swapOutEntryId?: string },
    ): { ok: boolean; reason?: "capacity" | "not_found" } => {
      const currentWs = latestWorkspaceRef.current;
      const entry = currentWs.entries.find((e) => e.id === entryId);
      if (!entry) return { ok: false, reason: "not_found" };

      const alreadyXActive =
        (entry.source === "focus-active" || entry.focusBucket === "x-active") &&
        !entry.completed;

      if (targetBucket === "x-active" && !alreadyXActive) {
        const activeCount = currentWs.entries.filter(
          (e) =>
            (e.source === "focus-active" || e.focusBucket === "x-active") &&
            !e.completed,
        ).length;
        if (
          activeCount >= currentWs.settings.xActiveLimit &&
          !options?.swapOutEntryId
        ) {
          pushToast(
            `X-Active is at ${currentWs.settings.xActiveLimit}-task capacity — choose one to swap`,
            "neutral",
          );
          return { ok: false, reason: "capacity" };
        }
      }

      const nowIso = new Date().toISOString();
      const prevWasCustomTab = entry.source === "custom-tab" && entry.tabId;
      const prevWasAnchor =
        entry.source === "focus-anchor" || entry.focusBucket === "anchor";

      mutateWorkspace((prev) => ({
        ...prev,
        entries: prev.entries.map((e) => {
          if (e.id === entryId) {
            if (targetBucket === "anchor") {
              return {
                ...e,
                focusBucket: "anchor",
                source: "focus-anchor",
                tabId: null,
                scheduledAt: e.scheduledAt || nowIso,
                updatedAt: nowIso,
              };
            }
            if (targetBucket === "x-active") {
              return {
                ...e,
                completed: false,
                completedAt: null,
                focusBucket: "x-active",
                source: "focus-active",
                tabId: null,
                updatedAt: nowIso,
              };
            }
            if (targetBucket === "custom-tab") {
              return {
                ...e,
                focusBucket: null,
                source: "custom-tab",
                tabId: options?.tabId ?? null,
                updatedAt: nowIso,
              };
            }
            return {
              ...e,
              focusBucket: null,
              source: "timeline",
              tabId: null,
              updatedAt: nowIso,
            };
          }
          if (options?.swapOutEntryId && e.id === options.swapOutEntryId) {
            if (prevWasCustomTab) {
              return {
                ...e,
                focusBucket: null,
                source: "custom-tab",
                tabId: entry.tabId ?? null,
                updatedAt: nowIso,
              };
            }
            if (prevWasAnchor) {
              return {
                ...e,
                focusBucket: "anchor",
                source: "focus-anchor",
                tabId: null,
                scheduledAt: e.scheduledAt || nowIso,
                updatedAt: nowIso,
              };
            }
            return {
              ...e,
              focusBucket: null,
              source: "timeline",
              tabId: null,
              updatedAt: nowIso,
            };
          }
          return e;
        }),
      }));

      if (targetBucket === "x-active") {
        pushToast(
          options?.swapOutEntryId
            ? "Swapped task into X-Active"
            : "Moved to X-Active",
          "success",
        );
      } else if (targetBucket === "anchor") {
        pushToast("Moved to Daily Anchors", "success");
      } else if (targetBucket === "custom-tab") {
        const tabName = currentWs.customTabs?.find(
          (t) => t.id === options?.tabId,
        )?.name;
        pushToast(tabName ? `Moved to ${tabName}` : "Moved to custom tab");
      } else {
        pushToast("Moved to Timeline tasks");
      }

      return { ok: true };
    },
    [mutateWorkspace, pushToast],
  );

  const clearFocusDayFromView = useCallback(
    (dateKey: string) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        entries: prev.entries.map((entry) => {
          if (!entry.completed) return entry;
          const belongsToFocus =
            entry.focusBucket !== null ||
            entry.source === "focus-anchor" ||
            entry.source === "focus-active";
          if (!belongsToFocus) return entry;
          const dayKey = getEntryDayKey(entry);
          if (dayKey !== dateKey) return entry;
          return {
            ...entry,
            source: "timeline",
            focusBucket: null,
            updatedAt: nowIso,
          };
        }),
      }));
      pushToast("Cleared from Focus View (kept in Timeline)");
    },
    [mutateWorkspace, pushToast],
  );

  const addTimelineEntry = useCallback(
    (
      type: EntryType,
      rawText: string,
      activeDateKey: string,
      extra?: Partial<Entry>,
    ): Entry | null => {
      const trimmed = rawText.trim();
      if (!trimmed) return null;

      const parsed = parseNlpInput(
        trimmed,
        activeDateKey,
        latestWorkspaceRef.current.settings.timeFormat,
      );
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

      if (effectiveType === "timeblock") {
        scheduledAt = scheduledAt || defaultIsoForDay;
        if (!endAt) {
          endAt = new Date(
            new Date(scheduledAt).getTime() + 60 * 60 * 1000,
          ).toISOString();
        }
      } else if (effectiveType === "event") {
        scheduledAt = scheduledAt || defaultIsoForDay;
      }

      const isLog = effectiveType === "log";
      const newEntry: Entry = {
        id: uid("ent"),
        type: effectiveType,
        title: parsed.cleanTitle,
        content: "",
        createdAt: isLog
          ? parsed.scheduledAt || defaultIsoForDay
          : defaultIsoForDay,
        updatedAt: nowIso,
        scheduledAt,
        completedAt: isLog ? parsed.scheduledAt || defaultIsoForDay : null,
        endAt,
        completed: isLog,
        focusBucket: null,
        source: extra?.source ?? "timeline",
        tags: parsed.tags,
        listIds: [],
        syncToTimeline: effectiveType === "note" ? true : undefined,
        eventCategory: effectiveType === "event" ? "personal" : undefined,
        attendance: effectiveType === "event" ? null : undefined,
        ...extra,
      };

      mutateWorkspace((prev) => ({
        ...prev,
        entries: [newEntry, ...prev.entries],
      }));

      return newEntry;
    },
    [mutateWorkspace],
  );

  const createEntry = useCallback(
    (draft: Partial<Entry>): Entry => {
      const nowIso = new Date().toISOString();
      const type: EntryType = draft.type || "note";
      const entry: Entry = {
        id: uid("ent"),
        type,
        title:
          draft.title?.trim() ||
          (type === "note" ? "Untitled Note" : "Untitled"),
        content: draft.content ?? "",
        createdAt: draft.createdAt ?? nowIso,
        updatedAt: nowIso,
        scheduledAt: draft.scheduledAt ?? null,
        completedAt: draft.completedAt ?? (type === "log" ? nowIso : null),
        endAt: draft.endAt ?? null,
        completed: draft.completed ?? type === "log",
        focusBucket: draft.focusBucket ?? null,
        source: draft.source ?? "timeline",
        tabId: draft.tabId ?? null,
        tags: draft.tags ?? [],
        pinned: draft.pinned ?? false,
        location: draft.location ?? "",
        isAchievement: draft.isAchievement ?? false,
        eventCategory:
          type === "event"
            ? (draft.eventCategory ?? "personal")
            : draft.eventCategory,
        attendance:
          type === "event" ? (draft.attendance ?? null) : draft.attendance,
        listIds: draft.listIds ?? [],
        syncToTimeline:
          draft.syncToTimeline ?? (type === "note" ? false : undefined),
        ...draft,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        entries: [entry, ...prev.entries],
      }));
      return entry;
    },
    [mutateWorkspace],
  );

  const addAchievementEntry = useCallback(
    (rawText: string, defaultType: EntryType = "log"): Entry | null => {
      const trimmed = rawText.trim();
      if (!trimmed) return null;
      const nowIso = new Date().toISOString();
      const parsed = parseNlpInput(
        trimmed,
        getTodayKey(),
        latestWorkspaceRef.current.settings.timeFormat,
      );
      const finishedIso = parsed.scheduledAt || nowIso;
      const resolvedType: EntryType =
        parsed.detectedType && parsed.detectedType !== "note"
          ? parsed.detectedType
          : defaultType !== "note"
            ? defaultType
            : "log";
      const entry: Entry = {
        id: uid("ent"),
        type: resolvedType,
        title: parsed.cleanTitle,
        content: "",
        createdAt: finishedIso,
        updatedAt: nowIso,
        scheduledAt: parsed.scheduledAt,
        completedAt: finishedIso,
        endAt: parsed.endAt,
        completed: true,
        focusBucket: null,
        source: "achievement",
        isAchievement: true,
        eventCategory: resolvedType === "event" ? "personal" : undefined,
        attendance: resolvedType === "event" ? "attended" : undefined,
        tags: parsed.tags,
        listIds: [],
      };
      mutateWorkspace((prev) => ({
        ...prev,
        entries: [entry, ...prev.entries],
      }));
      pushToast("Achievement recorded", "success");
      return entry;
    },
    [mutateWorkspace, pushToast],
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
            : entry,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const toggleEntryCompleted = useCallback(
    (id: string) => {
      const currentWs = latestWorkspaceRef.current;
      const target = currentWs.entries.find((e) => e.id === id);
      if (!target) return;

      const nextCompleted = !target.completed;
      const nowIso = new Date().toISOString();

      // If reopening an X-Active task, verify capacity
      if (
        !nextCompleted &&
        (target.source === "focus-active" || target.focusBucket === "x-active")
      ) {
        const activeCount = currentWs.entries.filter(
          (e) =>
            (e.source === "focus-active" || e.focusBucket === "x-active") &&
            !e.completed,
        ).length;
        if (activeCount >= currentWs.settings.xActiveLimit) {
          pushToast(
            `Cannot reopen: X-Active already has ${currentWs.settings.xActiveLimit} active tasks.`,
            "error",
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
            : e,
        ),
      }));

      if (
        nextCompleted &&
        (target.focusBucket !== null ||
          target.source === "focus-anchor" ||
          target.source === "focus-active")
      ) {
        pushToast(
          `Completed at ${formatTime(nowIso, currentWs.settings.timeFormat)}`,
          "success",
        );
      }
    },
    [mutateWorkspace, pushToast],
  );

  const toggleEntryAchievement = useCallback(
    (id: string) => {
      const target = latestWorkspaceRef.current.entries.find((e) => e.id === id);
      if (!target) return;
      const eligible =
        target.type === "log" ||
        target.type === "event" ||
        (target.type === "task" && target.completed);
      if (!eligible) return;
      const nextVal = !target.isAchievement;
      const nowIso = new Date().toISOString();
      updateEntry(id, {
        isAchievement: nextVal,
        completedAt: nextVal
          ? target.completedAt || nowIso
          : target.completedAt,
      });
      pushToast(
        nextVal ? "Marked as Achievement" : "Removed from Achievements",
        "success",
      );
    },
    [updateEntry, pushToast],
  );

  const setEventAttendance = useCallback(
    (id: string, attendance: EventAttendance) => {
      const target = latestWorkspaceRef.current.entries.find((e) => e.id === id);
      if (!target) return;
      const nowIso = new Date().toISOString();
      // Universal: anchor on scheduled/created time, mark completed false
      if (attendance === "universal") {
        updateEntry(id, {
          attendance,
          completed: false,
          completedAt: null,
        });
        return;
      }
      updateEntry(id, {
        attendance,
        completed: attendance === "attended",
        completedAt:
          attendance === "attended" ? target.completedAt || nowIso : null,
      });
    },
    [updateEntry],
  );

  const cycleEventAttendance = useCallback(
    (id: string) => {
      const target = latestWorkspaceRef.current.entries.find((e) => e.id === id);
      if (!target) return;
      // Cycle: null → attended → missed → universal → null
      const next: EventAttendance =
        !target.attendance
          ? "attended"
          : target.attendance === "attended"
            ? "missed"
            : target.attendance === "missed"
              ? "universal"
              : null;
      setEventAttendance(id, next);
    },
    [setEventAttendance],
  );

  const deleteEntry = useCallback(
    (id: string) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => {
        // Cascade to child sub-notes (parentId hierarchy)
        const doomedIds = new Set<string>([id]);
        let added = true;
        while (added) {
          added = false;
          for (const e of prev.entries) {
            if (e.parentId && doomedIds.has(e.parentId) && !doomedIds.has(e.id)) {
              doomedIds.add(e.id);
              added = true;
            }
          }
        }

        // Cascade to linked HabitLog records and habit.completions[dateKey]
        const deletedHabitPairs = new Map<string, Set<string>>();
        const recordHabitPair = (
          habitId: string | undefined,
          dateKey: string | undefined,
        ) => {
          if (!habitId || !dateKey) return;
          let set = deletedHabitPairs.get(habitId);
          if (!set) {
            set = new Set<string>();
            deletedHabitPairs.set(habitId, set);
          }
          set.add(dateKey);
        };

        for (const e of prev.entries) {
          if (doomedIds.has(e.id) && e.habitId && e.habitDateKey) {
            recordHabitPair(e.habitId, e.habitDateKey);
          }
        }
        for (const hl of prev.habitLogs ?? []) {
          if (doomedIds.has(hl.entryId)) {
            recordHabitPair(hl.habitId, hl.dateKey);
          }
        }

        const nextHabits =
          deletedHabitPairs.size > 0
            ? prev.habits.map((h) => {
                const datesToClear = deletedHabitPairs.get(h.id);
                if (!datesToClear) return h;
                const nextCompletions = { ...h.completions };
                let changed = false;
                for (const d of datesToClear) {
                  if (d in nextCompletions) {
                    delete nextCompletions[d];
                    changed = true;
                  }
                }
                return changed
                  ? { ...h, completions: nextCompletions, updatedAt: nowIso }
                  : h;
              })
            : prev.habits;

        return {
          ...prev,
          entries: prev.entries.filter((e) => !doomedIds.has(e.id)),
          habitLogs: (prev.habitLogs ?? []).filter(
            (hl) => !doomedIds.has(hl.entryId),
          ),
          habits: nextHabits,
        };
      });
    },
    [mutateWorkspace],
  );

  const duplicateEntry = useCallback(
    (id: string): Entry | null => {
      const original = latestWorkspaceRef.current.entries.find((e) => e.id === id);
      if (!original) return null;
      const nowIso = new Date().toISOString();
      const copy: Entry = {
        ...original,
        id: uid("ent"),
        title: `${original.title} (Copy)`,
        createdAt: nowIso,
        updatedAt: nowIso,
        focusBucket:
          original.focusBucket === "x-active" ? null : original.focusBucket,
        source:
          original.source === "focus-active" ? "timeline" : original.source,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        entries: [copy, ...prev.entries],
      }));
      pushToast("Entry duplicated");
      return copy;
    },
    [mutateWorkspace, pushToast],
  );

  const moveEntryToDate = useCallback(
    (id: string, dateKey: string) => {
      const target = latestWorkspaceRef.current.entries.find((e) => e.id === id);
      if (!target) return;

      const shiftIsoToDay = (iso: string | null): string | null => {
        if (!iso) return null;
        const oldDate = new Date(iso);
        const nextDate = parseLocalDateKey(dateKey);
        nextDate.setHours(
          oldDate.getHours(),
          oldDate.getMinutes(),
          oldDate.getSeconds(),
          0,
        );
        return nextDate.toISOString();
      };

      const patch: Partial<Entry> = {};
      if (target.completedAt && target.completed) {
        patch.completedAt = shiftIsoToDay(target.completedAt);
      } else if (target.scheduledAt) {
        patch.scheduledAt = shiftIsoToDay(target.scheduledAt);
        if (target.endAt) {
          const duration =
            new Date(target.endAt).getTime() -
            new Date(target.scheduledAt).getTime();
          patch.endAt = new Date(
            new Date(patch.scheduledAt!).getTime() +
              Math.max(duration, 15 * 60 * 1000),
          ).toISOString();
        }
      } else {
        patch.createdAt =
          shiftIsoToDay(target.createdAt) || buildDateAtTime(dateKey, 9, 0);
      }

      updateEntry(id, patch);
      pushToast(`Moved to ${toLocalDateKey(dateKey)}`);
    },
    [updateEntry, pushToast],
  );

  // Scratchpad actions
  const addScratchpad = useCallback(
    (paletteIndex = 0): ScratchpadCard => {
      const nowIso = new Date().toISOString();
      const card: ScratchpadCard = {
        id: uid("pad"),
        content: "",
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
    [mutateWorkspace],
  );

  const updateScratchpad = useCallback(
    (id: string, patch: Partial<ScratchpadCard>) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        scratchpads: (prev.scratchpads ?? []).map((c) =>
          c.id === id ? { ...c, ...patch, updatedAt: nowIso } : c,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const reorderScratchpads = useCallback(
    (sortOrderById: Record<string, number>) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        scratchpads: (prev.scratchpads ?? []).map((c) =>
          typeof sortOrderById[c.id] === "number"
            ? { ...c, sortOrder: sortOrderById[c.id], updatedAt: nowIso }
            : c,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteScratchpad = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        scratchpads: (prev.scratchpads ?? []).filter((c) => c.id !== id),
      }));
    },
    [mutateWorkspace],
  );

  const sendScratchpadToTimeline = useCallback(
    (id: string): Entry | null => {
      const card = (latestWorkspaceRef.current.scratchpads ?? []).find(
        (c) => c.id === id,
      );
      if (!card) return null;
      if (
        !card.content.trim() ||
        /[\r\n]/.test(card.content) ||
        /^\s*-\s*\[[ xX]?\]/m.test(card.content)
      ) {
        return null;
      }
      const lines = card.content
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const title = lines[0]?.slice(0, 90) || "Scratchpad Note";
      const bodyLines = lines.length > 1 ? lines.slice(1) : lines;
      const htmlContent = bodyLines
        .map(
          (l) =>
            `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
        )
        .join("");
      const nowIso = new Date().toISOString();
      const noteEntry: Entry = {
        id: uid("ent"),
        type: "note",
        title,
        content: htmlContent,
        createdAt: nowIso,
        updatedAt: nowIso,
        scheduledAt: null,
        completedAt: null,
        endAt: null,
        completed: false,
        focusBucket: null,
        source: "timeline",
        syncToTimeline: true,
        tags: ["scratchpad"],
        listIds: [],
      };
      mutateWorkspace((prev) => ({
        ...prev,
        entries: [noteEntry, ...prev.entries],
        scratchpads: (prev.scratchpads ?? []).filter((c) => c.id !== id),
      }));
      pushToast("Sent sticky note to Timeline", "success");
      return noteEntry;
    },
    [mutateWorkspace, pushToast],
  );

  const sendScratchpadToXActive = useCallback(
    (
      id: string,
      swapOutEntryId?: string,
    ): { ok: boolean; reason?: "capacity" | "not_found"; entry?: Entry } => {
      const currentWs = latestWorkspaceRef.current;
      const card = (currentWs.scratchpads ?? []).find((c) => c.id === id);
      if (!card) return { ok: false, reason: "not_found" };
      if (
        !card.content.trim() ||
        /[\r\n]/.test(card.content) ||
        /^\s*-\s*\[[ xX]?\]/m.test(card.content)
      ) {
        return { ok: false, reason: "not_found" };
      }

      const activeCount = currentWs.entries.filter(
        (e) =>
          (e.source === "focus-active" || e.focusBucket === "x-active") &&
          !e.completed,
      ).length;
      if (activeCount >= currentWs.settings.xActiveLimit && !swapOutEntryId) {
        pushToast(
          `X-Active is at ${currentWs.settings.xActiveLimit}-task capacity — choose one to swap`,
          "neutral",
        );
        return { ok: false, reason: "capacity" };
      }

      const lines = card.content
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const firstLine = lines[0]?.slice(0, 120) || "Scratchpad Task";
      const parsed = parseNlpInput(
        firstLine,
        getTodayKey(),
        currentWs.settings.timeFormat,
      );
      const bodyLines = lines.slice(1);
      const htmlContent = bodyLines
        .map(
          (l) =>
            `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
        )
        .join("");
      const nowIso = new Date().toISOString();
      const xEntry: Entry = {
        id: uid("ent"),
        type: "task",
        title: parsed.cleanTitle || firstLine,
        content: htmlContent,
        createdAt: nowIso,
        updatedAt: nowIso,
        scheduledAt: parsed.scheduledAt,
        completedAt: null,
        endAt: parsed.endAt,
        completed: false,
        focusBucket: "x-active",
        source: "focus-active",
        tags: parsed.tags,
        listIds: [],
      };

      mutateWorkspace((prev) => ({
        ...prev,
        entries: [
          xEntry,
          ...prev.entries.map((e) =>
            swapOutEntryId && e.id === swapOutEntryId
              ? {
                  ...e,
                  focusBucket: null,
                  source: "timeline" as const,
                  tabId: null,
                  updatedAt: nowIso,
                }
              : e,
          ),
        ],
        scratchpads: (prev.scratchpads ?? []).filter((c) => c.id !== id),
      }));
      pushToast(
        swapOutEntryId
          ? "Swapped sticky note into X-Active"
          : "Promoted sticky note to X-Active",
        "success",
      );
      return { ok: true, entry: xEntry };
    },
    [mutateWorkspace, pushToast],
  );

  // Custom Focus Tabs actions
  const addCustomTab = useCallback(
    (name: string, color: string): CustomFocusTab => {
      const nowIso = new Date().toISOString();
      const tab: CustomFocusTab = {
        id: uid("ftab"),
        name: name.trim() || "Focus Tab",
        color,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        customTabs: [...(prev.customTabs ?? []), tab],
      }));
      pushToast(`Tab "${tab.name}" created`, "success");
      return tab;
    },
    [mutateWorkspace, pushToast],
  );

  const updateCustomTab = useCallback(
    (id: string, patch: Partial<CustomFocusTab>) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        customTabs: (prev.customTabs ?? []).map((t) =>
          t.id === id ? { ...t, ...patch, updatedAt: nowIso } : t,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteCustomTab = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        customTabs: (prev.customTabs ?? []).filter((t) => t.id !== id),
        entries: prev.entries.filter((e) => e.tabId !== id),
      }));
      pushToast("Custom tab and its tasks deleted");
    },
    [mutateWorkspace, pushToast],
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
      bookLink?: BookNoteLink | null;
      listItemLinks?: ListItemNoteLink[];
    }): Entry => {
      const nowIso = new Date().toISOString();
      const note: Entry = {
        id: uid("ent"),
        type: "note",
        title: options?.title ?? "Untitled Note",
        content: options?.content ?? "",
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
        icon: options?.icon ?? "📝",
        coverPreset: options?.coverPreset ?? null,
        noteStatus: options?.noteStatus ?? "draft",
        favorite: options?.favorite ?? false,
        archived: false,
        syncToTimeline:
          options?.syncToTimeline ?? Boolean(options?.scheduledAt),
        editorWidth: "normal",
        editorFont: "sans",
        bookLink: options?.bookLink ?? null,
        listItemLinks: options?.listItemLinks
          ? normalizeListItemNoteLinks(options.listItemLinks)
          : undefined,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        entries: [note, ...prev.entries],
      }));
      return note;
    },
    [mutateWorkspace],
  );

  const duplicateNotePage = useCallback(
    (id: string): Entry | null => {
      const orig = latestWorkspaceRef.current.entries.find(
        (e) => e.id === id && e.type === "note",
      );
      if (!orig) return null;
      const nowIso = new Date().toISOString();
      const copy: Entry = {
        ...orig,
        id: uid("ent"),
        title: orig.title ? `${orig.title} (Copy)` : "Untitled Note (Copy)",
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        entries: [copy, ...prev.entries],
      }));
      pushToast("Note duplicated", "success");
      return copy;
    },
    [mutateWorkspace, pushToast],
  );

  const deleteNotePage = useCallback(
    (id: string, childMode: "promote" | "cascade" = "cascade") => {
      if (childMode === "cascade") {
        deleteEntry(id);
        pushToast("Note deleted");
        return;
      }
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => {
        const target = prev.entries.find((e) => e.id === id);
        const fallbackParentId = target?.parentId ?? null;
        return {
          ...prev,
          entries: prev.entries
            .filter((e) => e.id !== id)
            .map((e) =>
              e.parentId === id
                ? { ...e, parentId: fallbackParentId, updatedAt: nowIso }
                : e,
            ),
        };
      });
      pushToast("Note deleted · Sub-pages promoted up", "success");
    },
    [deleteEntry, mutateWorkspace, pushToast],
  );

  const archiveNotePage = useCallback(
    (
      id: string,
      archived: boolean,
      childMode: "promote" | "cascade" = "promote",
    ) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => {
        const target = prev.entries.find((e) => e.id === id);
        const fallbackParentId = target?.parentId ?? null;

        const branchIds = new Set<string>([id]);
        if (childMode === "cascade") {
          let added = true;
          while (added) {
            added = false;
            for (const e of prev.entries) {
              if (
                e.parentId &&
                branchIds.has(e.parentId) &&
                !branchIds.has(e.id)
              ) {
                branchIds.add(e.id);
                added = true;
              }
            }
          }
        }

        return {
          ...prev,
          entries: prev.entries.map((e) => {
            if (branchIds.has(e.id)) {
              return {
                ...e,
                archived,
                noteStatus: archived
                  ? "archived"
                  : e.noteStatus === "archived"
                    ? "active"
                    : (e.noteStatus ?? "active"),
                updatedAt: nowIso,
              };
            }
            if (archived && childMode === "promote" && e.parentId === id) {
              return {
                ...e,
                parentId: fallbackParentId,
                updatedAt: nowIso,
              };
            }
            return e;
          }),
        };
      });
      pushToast(
        archived
          ? childMode === "cascade"
            ? "Moved branch to Archive"
            : "Moved note to Archive"
          : "Restored from Archive",
      );
    },
    [mutateWorkspace, pushToast],
  );


  const addNoteNotebook = useCallback(
    (name: string, icon = "📓"): NoteNotebook => {
      const trimmed = name.trim() || "Untitled Notebook";
      const created: NoteNotebook = {
        id: uid("nb"),
        name: trimmed,
        icon,
        createdAt: new Date().toISOString(),
      };
      mutateWorkspace((prev) => ({
        ...prev,
        noteNotebooks: [...(prev.noteNotebooks ?? []), created],
      }));
      pushToast(`Notebook "${trimmed}" created`, "success");
      return created;
    },
    [mutateWorkspace, pushToast],
  );

  const updateNoteNotebook = useCallback(
    (id: string, patch: Partial<NoteNotebook>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        noteNotebooks: (prev.noteNotebooks ?? []).map((nb) =>
          nb.id === id ? { ...nb, ...patch } : nb,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteNoteNotebook = useCallback(
    (id: string) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        noteNotebooks: (prev.noteNotebooks ?? []).filter((nb) => nb.id !== id),
        entries: prev.entries.map((e) =>
          e.type === "note" && e.notebookId === id
            ? { ...e, notebookId: null, updatedAt: nowIso }
            : e,
        ),
      }));
      pushToast("Notebook deleted (notes preserved)");
    },
    [mutateWorkspace, pushToast],
  );

  const reorderNoteNotebooks = useCallback(
    (draggedId: string, targetId: string, position: "before" | "after") => {
      if (!draggedId || !targetId || draggedId === targetId) return;
      mutateWorkspace((prev) => {
        const current = prev.noteNotebooks ?? [];
        const dragged = current.find((nb) => nb.id === draggedId);
        if (!dragged || !current.some((nb) => nb.id === targetId)) return prev;
        const remaining = current.filter((nb) => nb.id !== draggedId);
        const targetIdx = remaining.findIndex((nb) => nb.id === targetId);
        if (targetIdx === -1) return prev;
        const insertIdx = position === "before" ? targetIdx : targetIdx + 1;
        const nextNotebooks = [
          ...remaining.slice(0, insertIdx),
          dragged,
          ...remaining.slice(insertIdx),
        ];
        if (nextNotebooks.every((nb, idx) => nb.id === current[idx]?.id)) {
          return prev;
        }
        return {
          ...prev,
          noteNotebooks: nextNotebooks,
        };
      });
    },
    [mutateWorkspace],
  );

  const reorderNoteEntries = useCallback(
    (sortOrderById: Record<string, number>) => {
      if (Object.keys(sortOrderById).length === 0) return;
      mutateWorkspace((prev) => ({
        ...prev,
        entries: prev.entries.map((e) => {
          const nextOrder = sortOrderById[e.id];
          if (typeof nextOrder !== "number" || e.sortOrder === nextOrder) {
            return e;
          }
          return { ...e, sortOrder: nextOrder };
        }),
      }));
    },
    [mutateWorkspace],
  );

  // Habits
  const addHabit = useCallback(
    (habit: Omit<Habit, "id" | "createdAt" | "completions">): Habit => {
      const nowIso = new Date().toISOString();
      const newHabit: Habit = {
        ...habit,
        id: uid("hab"),
        createdAt: nowIso,
        updatedAt: nowIso,
        completions: {},
      };
      mutateWorkspace((prev) => ({
        ...prev,
        habits: [...prev.habits, newHabit],
      }));
      pushToast(`Habit "${habit.title}" created`, "success");
      return newHabit;
    },
    [mutateWorkspace, pushToast],
  );

  const updateHabit = useCallback(
    (id: string, patch: Partial<Habit>) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        habits: prev.habits.map((h) =>
          h.id === id ? { ...h, ...patch, updatedAt: nowIso } : h,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteHabit = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        habits: prev.habits.filter((h) => h.id !== id),
        habitLogs: (prev.habitLogs ?? []).filter((hl) => hl.habitId !== id),
        entries: prev.entries.filter((e) => e.habitId !== id),
      }));
      pushToast("Habit deleted");
    },
    [mutateWorkspace, pushToast],
  );

  const setHabitDayStatus = useCallback(
    (
      habitId: string,
      dateKey: string,
      status: "empty" | "done" | "missed",
    ) => {
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

        const nextHabits = prev.habits.map((h) => {
          if (h.id !== habitId) return h;
          const nextCompletions = { ...h.completions };
          const nextMissed = { ...(h.missedDates ?? {}) };
          if (status === "done") {
            nextCompletions[dateKey] = true;
            delete nextMissed[dateKey];
          } else if (status === "missed") {
            delete nextCompletions[dateKey];
            nextMissed[dateKey] = true;
          } else {
            delete nextCompletions[dateKey];
            delete nextMissed[dateKey];
          }
          return {
            ...h,
            completions: nextCompletions,
            missedDates: nextMissed,
            updatedAt: nowIso,
          };
        });

        if (status !== "done") {
          // Missed or empty: remove matching HabitLog and linked Timeline entry so missed habits stay hidden from Timeline
          return {
            ...prev,
            habits: nextHabits,
            habitLogs: (prev.habitLogs ?? []).filter(
              (hl) => !(hl.habitId === habitId && hl.dateKey === dateKey),
            ),
            entries: prev.entries.filter(
              (e) => !(e.habitId === habitId && e.habitDateKey === dateKey),
            ),
          };
        }

        const alreadyHasEntry = prev.entries.some(
          (e) => e.habitId === habitId && e.habitDateKey === dateKey,
        );
        if (alreadyHasEntry) {
          return {
            ...prev,
            habits: nextHabits,
          };
        }

        // Turning ON: create linked Timeline log entry + HabitLog record
        const entryId = uid("ent");
        const linkedEntry: Entry = {
          id: entryId,
          type: "log",
          title: `Completed habit: ${habit.title}`,
          content: "",
          createdAt: logIso,
          updatedAt: nowIso,
          scheduledAt: null,
          completedAt: logIso,
          endAt: null,
          completed: true,
          focusBucket: null,
          source: "habit",
          habitId,
          habitDateKey: dateKey,
          tags: ["habit"],
          listIds: [],
        };
        const habitLog: HabitLog = {
          id: uid("hlog"),
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
    [mutateWorkspace],
  );

  const toggleHabitCompletion = useCallback(
    (habitId: string, dateKey: string) => {
      const targetHabit = latestWorkspaceRef.current.habits.find(
        (h) => h.id === habitId,
      );
      if (!targetHabit) return;
      const wasDone = Boolean(targetHabit.completions[dateKey]);
      setHabitDayStatus(habitId, dateKey, wasDone ? "empty" : "done");
    },
    [setHabitDayStatus],
  );

  const cycleHabitDayStatus = useCallback(
    (habitId: string, dateKey: string) => {
      const targetHabit = latestWorkspaceRef.current.habits.find(
        (h) => h.id === habitId,
      );
      if (!targetHabit) return;
      const isDone = Boolean(targetHabit.completions[dateKey]);
      const isMissed = Boolean(targetHabit.missedDates?.[dateKey]);
      const nextStatus: "empty" | "done" | "missed" = isDone
        ? "missed"
        : isMissed
          ? "empty"
          : "done";
      setHabitDayStatus(habitId, dateKey, nextStatus);
    },
    [setHabitDayStatus],
  );

  const reorderHabits = useCallback(
    (draggedId: string, targetId: string, position: "before" | "after") => {
      if (!draggedId || !targetId || draggedId === targetId) return;
      mutateWorkspace((prev) => {
        const current = prev.habits ?? [];
        const dragged = current.find((h) => h.id === draggedId);
        if (!dragged || !current.some((h) => h.id === targetId)) return prev;
        const remaining = current.filter((h) => h.id !== draggedId);
        const targetIdx = remaining.findIndex((h) => h.id === targetId);
        if (targetIdx === -1) return prev;
        const insertIdx = position === "before" ? targetIdx : targetIdx + 1;
        const nextHabits = [
          ...remaining.slice(0, insertIdx),
          dragged,
          ...remaining.slice(insertIdx),
        ];
        if (nextHabits.every((h, idx) => h.id === current[idx]?.id)) {
          return prev;
        }
        return {
          ...prev,
          habits: nextHabits,
        };
      });
    },
    [mutateWorkspace],
  );

  // Lists
  const addList = useCallback(
    (
      title: string,
      icon: string,
      color = "#6366f1",
      listType: ListCollectionType = "custom",
      parentId: string | null = null,
    ): ListCollection => {
      const nowIso = new Date().toISOString();
      const validParentId =
        parentId && latestWorkspaceRef.current.lists.some((l) => l.id === parentId)
          ? parentId
          : null;
      const created: ListCollection = {
        id: uid("list"),
        title: title.trim() || "Untitled List",
        icon,
        color,
        listType,
        parentId: validParentId,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        lists: [...prev.lists, created],
      }));
      pushToast(
        validParentId
          ? `Created sublist "${created.title}"`
          : `Created list "${created.title}"`,
        "success",
      );
      return created;
    },
    [mutateWorkspace, pushToast],
  );

  const updateList = useCallback(
    (id: string, patch: Partial<ListCollection>) => {
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => {
        const { byId } = buildListTreeIndex(prev.lists);
        const sanitizedPatch = { ...patch };
        if (sanitizedPatch.parentId !== undefined) {
          const nextParent = sanitizedPatch.parentId || null;
          if (
            nextParent &&
            (!byId.has(nextParent) ||
              wouldCreateListCycle(id, nextParent, byId))
          ) {
            delete sanitizedPatch.parentId;
          } else {
            sanitizedPatch.parentId = nextParent;
          }
        }
        return {
          ...prev,
          lists: prev.lists.map((l) =>
            l.id === id ? { ...l, ...sanitizedPatch, updatedAt: nowIso } : l,
          ),
        };
      });
    },
    [mutateWorkspace],
  );

  const renameList = useCallback(
    (id: string, title: string, icon?: string) => {
      updateList(id, { title: title.trim() || undefined, icon });
    },
    [updateList],
  );

  const applyListItemDeletionToEntries = useCallback(
    (
      entries: Entry[],
      deletedItemIds: Set<string>,
      linkedNotesBehavior: "keep" | "delete",
      nowIso: string,
    ): Entry[] => {
      if (deletedItemIds.size === 0) return entries;

      if (linkedNotesBehavior === "delete") {
        const directDeletedNoteIds = new Set<string>();
        for (const e of entries) {
          if (e.type !== "note") continue;
          const links = e.listItemLinks || [];
          const touchesDeleted = links.some(
            (l) => l.listItemId && deletedItemIds.has(l.listItemId),
          );
          if (!touchesDeleted) continue;
          const hasSurvivingItem = links.some(
            (l) => l.listItemId && !deletedItemIds.has(l.listItemId),
          );
          const hasBookLink = Boolean(e.bookLink);
          if (!hasSurvivingItem && !hasBookLink) {
            directDeletedNoteIds.add(e.id);
          }
        }

        // Also cascade direct/nested sub-pages under deleted notes
        let added = true;
        while (added) {
          added = false;
          for (const e of entries) {
            if (
              e.type === "note" &&
              e.parentId &&
              directDeletedNoteIds.has(e.parentId) &&
              !directDeletedNoteIds.has(e.id)
            ) {
              directDeletedNoteIds.add(e.id);
              added = true;
            }
          }
        }

        return entries
          .filter((e) => !directDeletedNoteIds.has(e.id))
          .map((e) => {
            if (e.type !== "note" || !e.listItemLinks?.length) return e;
            const filtered = e.listItemLinks.filter(
              (l) => !(l.listItemId && deletedItemIds.has(l.listItemId)),
            );
            if (filtered.length === e.listItemLinks.length) return e;
            return {
              ...e,
              listItemLinks: filtered.length > 0 ? filtered : undefined,
              updatedAt: nowIso,
            };
          });
      }

      return entries.map((e) => {
        if (e.type !== "note" || !e.listItemLinks?.length) return e;
        let changed = false;
        const nextLinks = e.listItemLinks.map((l) => {
          if (l.listItemId && deletedItemIds.has(l.listItemId)) {
            changed = true;
            return {
              ...l,
              listItemId: null,
              itemRemoved: true,
            };
          }
          return l;
        });
        if (!changed) return e;
        return {
          ...e,
          listItemLinks: nextLinks,
          updatedAt: nowIso,
        };
      });
    },
    [],
  );

  const deleteList = useCallback(
    (
      id: string,
      moveItemsToListId?: string,
      linkedNotesBehavior: "keep" | "delete" = "keep",
    ) => {
      const nowIso = new Date().toISOString();
      let deletedIds: string[] = [];
      let movedItems = false;
      let deletedSublistCount = 0;

      mutateWorkspace((prev) => {
        const { childrenMap } = buildListTreeIndex(prev.lists);
        const subtreeIds = getDescendantListIds(id, childrenMap);
        const subtreeSet = new Set(subtreeIds);
        deletedSublistCount = Math.max(0, subtreeIds.length - 1);

        const targetMoveId =
          moveItemsToListId &&
          !subtreeSet.has(moveItemsToListId) &&
          prev.lists.some((l) => l.id === moveItemsToListId)
            ? moveItemsToListId
            : null;
        movedItems = Boolean(targetMoveId);

        if (!targetMoveId) {
          deletedIds = prev.listItems
            .filter((item) => subtreeSet.has(item.listId))
            .map((item) => item.id);
        }
        const deleteSet = new Set(deletedIds);
        const entriesWithoutListId = prev.entries.map((entry) =>
          entry.listIds && entry.listIds.some((lid) => subtreeSet.has(lid))
            ? {
                ...entry,
                listIds: entry.listIds.filter((lid) => !subtreeSet.has(lid)),
                updatedAt: nowIso,
              }
            : entry,
        );
        const finalEntries = targetMoveId
          ? entriesWithoutListId
          : applyListItemDeletionToEntries(
              entriesWithoutListId,
              deleteSet,
              linkedNotesBehavior,
              nowIso,
            );

        return {
          ...prev,
          lists: prev.lists.filter((l) => !subtreeSet.has(l.id)),
          listItems: targetMoveId
            ? prev.listItems.map((item) =>
                subtreeSet.has(item.listId)
                  ? { ...item, listId: targetMoveId, updatedAt: nowIso }
                  : item,
              )
            : prev.listItems.filter((item) => !subtreeSet.has(item.listId)),
          entries: finalEntries,
        };
      });
      if (deletedIds.length > 0) {
        queueMicrotask(() => removeListItemBookLinks(deletedIds));
      }
      pushToast(
        movedItems
          ? "Items moved and list deleted"
          : deletedSublistCount > 0
            ? "List and sublists deleted"
            : "List deleted",
      );
    },
    [mutateWorkspace, pushToast, applyListItemDeletionToEntries],
  );

  const addListItem = useCallback(
    (
      listId: string,
      rawText: string,
      status: ListItemStatus = "inbox",
    ): ListItem | null => {
      const trimmed = rawText.trim();
      if (!trimmed) return null;
      const { url, strippedText, fallbackTitle } =
        extractUrlFromListInput(trimmed);
      const parsed = parseNlpInput(
        url ? strippedText : trimmed,
        getTodayKey(),
        latestWorkspaceRef.current.settings.timeFormat,
      );
      const finalTitle =
        (parsed.cleanTitle || "").trim() || fallbackTitle || trimmed;
      const nowIso = new Date().toISOString();
      const item: ListItem = {
        id: uid("li"),
        listId,
        title: finalTitle,
        subtitle: "",
        status,
        tags: parsed.tags,
        content: "",
        url: url ?? undefined,
        scheduledAt: parsed.scheduledAt,
        completedAt: status === "done" ? nowIso : null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        listItems: [item, ...prev.listItems],
      }));
      return item;
    },
    [mutateWorkspace],
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
          } else if (patch.status === "done" && item.status !== "done") {
            completedAt = nowIso;
          } else if (patch.status && patch.status !== "done") {
            completedAt = null;
          }
          return { ...item, ...patch, completedAt, updatedAt: nowIso };
        }),
      }));
    },
    [mutateWorkspace],
  );

  const reorderLists = useCallback(
    (
      draggedId: string,
      targetId: string,
      position: "before" | "after" | "inside",
    ) => {
      if (!draggedId || !targetId || draggedId === targetId) return;
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => {
        const current = prev.lists ?? [];
        const { byId } = buildListTreeIndex(current);
        const dragged = byId.get(draggedId);
        const target = byId.get(targetId);
        if (!dragged || !target) return prev;

        const nextParentId =
          position === "inside" ? target.id : (target.parentId ?? null);

        if (
          nextParentId &&
          wouldCreateListCycle(draggedId, nextParentId, byId)
        ) {
          return prev;
        }

        const updatedDragged: ListCollection =
          (dragged.parentId ?? null) === nextParentId
            ? dragged
            : { ...dragged, parentId: nextParentId, updatedAt: nowIso };

        if (position === "inside") {
          const nextLists = current.map((l) =>
            l.id === draggedId ? updatedDragged : l,
          );
          return {
            ...prev,
            lists: nextLists,
          };
        }

        const remaining = current.filter((l) => l.id !== draggedId);
        const targetIdx = remaining.findIndex((l) => l.id === targetId);
        if (targetIdx === -1) return prev;
        const insertIdx = position === "before" ? targetIdx : targetIdx + 1;
        const nextLists = [
          ...remaining.slice(0, insertIdx),
          updatedDragged,
          ...remaining.slice(insertIdx),
        ];
        if (
          (dragged.parentId ?? null) === nextParentId &&
          nextLists.every((l, idx) => l.id === current[idx]?.id)
        ) {
          return prev;
        }
        return {
          ...prev,
          lists: nextLists,
        };
      });
    },
    [mutateWorkspace],
  );

  const reorderListItems = useCallback(
    (
      sortOrderById: Record<string, number>,
      statusPatch?: { id: string; status: ListItemStatus },
    ) => {
      if (Object.keys(sortOrderById).length === 0 && !statusPatch) return;
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        listItems: prev.listItems.map((item) => {
          const nextOrder = sortOrderById[item.id];
          const isStatusTarget =
            statusPatch &&
            statusPatch.id === item.id &&
            item.status !== statusPatch.status;
          if (typeof nextOrder !== "number" && !isStatusTarget) return item;

          let nextItem = item;
          if (
            typeof nextOrder === "number" &&
            item.sortOrder !== nextOrder
          ) {
            nextItem = { ...nextItem, sortOrder: nextOrder };
          }
          if (isStatusTarget && statusPatch) {
            const completedAt =
              statusPatch.status === "done"
                ? nowIso
                : item.status === "done"
                  ? null
                  : (item.completedAt ?? null);
            nextItem = {
              ...nextItem,
              status: statusPatch.status,
              completedAt,
              updatedAt: nowIso,
            };
          }
          return nextItem;
        }),
      }));
    },
    [mutateWorkspace],
  );

  const deleteListItems = useCallback(
    (ids: string[], linkedNotesBehavior: "keep" | "delete" = "keep") => {
      const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
      if (uniqueIds.length === 0) return;
      const deleteSet = new Set(uniqueIds);
      const nowIso = new Date().toISOString();
      removeListItemBookLinks(uniqueIds);
      void listCoverDb.deleteCovers(uniqueIds);
      mutateWorkspace((prev) => ({
        ...prev,
        listItems: prev.listItems.filter((item) => !deleteSet.has(item.id)),
        entries: applyListItemDeletionToEntries(
          prev.entries,
          deleteSet,
          linkedNotesBehavior,
          nowIso,
        ),
      }));
    },
    [mutateWorkspace, applyListItemDeletionToEntries],
  );

  const deleteListItem = useCallback(
    (id: string, linkedNotesBehavior: "keep" | "delete" = "keep") => {
      deleteListItems([id], linkedNotesBehavior);
    },
    [deleteListItems],
  );

  const linkNoteToListItem = useCallback(
    (noteId: string, itemId: string, quote?: string) => {
      if (!noteId || !itemId) return;
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => {
        const item = prev.listItems.find((i) => i.id === itemId);
        if (!item) return prev;
        const parentList =
          prev.lists.find((l) => l.id === item.listId) ?? null;
        return {
          ...prev,
          entries: prev.entries.map((entry) => {
            if (entry.id !== noteId || entry.type !== "note") return entry;
            const currentLinks = normalizeListItemNoteLinks(
              entry.listItemLinks,
            );
            const existingIdx = currentLinks.findIndex(
              (l) => l.listItemId === itemId,
            );
            if (existingIdx !== -1) {
              if (quote === undefined) return entry;
              const updatedLinks = currentLinks.map((l, idx) =>
                idx === existingIdx
                  ? { ...l, quote: quote.trim() || undefined }
                  : l,
              );
              return {
                ...entry,
                listItemLinks: updatedLinks,
                updatedAt: nowIso,
              };
            }
            const nextLink = buildListItemNoteLink(item, parentList, quote);
            return {
              ...entry,
              listItemLinks: [...currentLinks, nextLink],
              updatedAt: nowIso,
            };
          }),
        };
      });
    },
    [mutateWorkspace],
  );

  const unlinkNoteFromListItem = useCallback(
    (noteId: string, itemId: string) => {
      if (!noteId || !itemId) return;
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        entries: prev.entries.map((entry) => {
          if (entry.id !== noteId || entry.type !== "note") return entry;
          const currentLinks = normalizeListItemNoteLinks(entry.listItemLinks);
          const nextLinks = currentLinks.filter(
            (l) => l.listItemId !== itemId,
          );
          if (nextLinks.length === currentLinks.length) return entry;
          return {
            ...entry,
            listItemLinks: nextLinks.length > 0 ? nextLinks : undefined,
            updatedAt: nowIso,
          };
        }),
      }));
    },
    [mutateWorkspace],
  );

  const updateNoteListItemLinkQuote = useCallback(
    (noteId: string, itemId: string, quote: string) => {
      if (!noteId || !itemId) return;
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        entries: prev.entries.map((entry) => {
          if (entry.id !== noteId || entry.type !== "note") return entry;
          const currentLinks = normalizeListItemNoteLinks(entry.listItemLinks);
          let changed = false;
          const nextLinks = currentLinks.map((l) => {
            if (l.listItemId !== itemId) return l;
            changed = true;
            return {
              ...l,
              quote: quote.trim() ? quote : undefined,
            };
          });
          if (!changed) return entry;
          return {
            ...entry,
            listItemLinks: nextLinks,
            updatedAt: nowIso,
          };
        }),
      }));
    },
    [mutateWorkspace],
  );

  // Library Studio (Ebook Manager & Reader)
  const addBook = useCallback(
    (
      book: Omit<BookRecord, "id" | "addedAt"> & {
        id?: string;
        addedAt?: number;
      },
    ): BookRecord => {
      const created: BookRecord = {
        ...book,
        id: book.id || uid("book"),
        addedAt: book.addedAt ?? Date.now(),
      };
      mutateWorkspace((prev) => ({
        ...prev,
        books: [created, ...prev.books],
      }));
      return created;
    },
    [mutateWorkspace],
  );

  const updateBook = useCallback(
    (id: string, patch: Partial<BookRecord>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        books: prev.books.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      }));
    },
    [mutateWorkspace],
  );

  const deleteBooks = useCallback(
    async (
      ids: string[],
      linkedNotesBehavior: "keep" | "delete" = "keep",
    ): Promise<void> => {
      const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
      if (uniqueIds.length === 0) return;
      const deleteSet = new Set(uniqueIds);
      await libraryDb.deleteBooksData(uniqueIds);
      pruneBookVoicePreferences(uniqueIds);
      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => {
        const directDeletedNoteIds = new Set<string>();
        if (linkedNotesBehavior === "delete") {
          for (const e of prev.entries) {
            if (e.bookLink?.bookId && deleteSet.has(e.bookLink.bookId)) {
              directDeletedNoteIds.add(e.id);
            }
          }
        }
        const nextEntries =
          linkedNotesBehavior === "delete"
            ? prev.entries.filter(
                (e) =>
                  !directDeletedNoteIds.has(e.id) &&
                  !(e.parentId && directDeletedNoteIds.has(e.parentId)),
              )
            : prev.entries.map((e) => {
                if (e.bookLink?.bookId && deleteSet.has(e.bookLink.bookId)) {
                  return {
                    ...e,
                    bookLink: {
                      ...e.bookLink,
                      bookId: null,
                      bookRemoved: true,
                    },
                    updatedAt: nowIso,
                  };
                }
                return e;
              });

        const deletedBooks = prev.books.filter((b) => deleteSet.has(b.id));
        const remainingUris = new Set(
          prev.books
            .filter((b) => !deleteSet.has(b.id) && b.externalUri)
            .map((b) => b.externalUri!),
        );
        for (const b of deletedBooks) {
          if (b.externalUri && !remainingUris.has(b.externalUri)) {
            void releaseAndroidUri(b.externalUri);
          }
        }

        return {
          ...prev,
          books: prev.books.filter((b) => !deleteSet.has(b.id)),
          bookBookmarks: (prev.bookBookmarks ?? []).filter(
            (bm) => !deleteSet.has(bm.bookId),
          ),
          bookHighlights: (prev.bookHighlights ?? []).filter(
            (hl) => !deleteSet.has(hl.bookId),
          ),
          libraryViewFolders: (prev.libraryViewFolders ?? []).map((vf) => ({
            ...vf,
            bookIds: vf.bookIds.filter((bid) => !deleteSet.has(bid)),
          })),
          entries: nextEntries,
        };
      });
      pushToast(
        uniqueIds.length === 1
          ? "Book removed from Library"
          : `Removed ${uniqueIds.length} books from Library`,
      );
    },
    [mutateWorkspace, pushToast],
  );

  const deleteBook = useCallback(
    async (id: string): Promise<void> => {
      await deleteBooks([id], "keep");
    },
    [deleteBooks],
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
      }>,
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
    [mutateWorkspace],
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
    (
      bookTitle: string,
      excerptText: string,
      locationLabel?: string,
      linkMeta?: Partial<BookNoteLink>,
    ): Entry => {
      const nowIso = new Date().toISOString();
      const slugTag = bookTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 24);
      const safeExcerpt = excerptText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const resolvedLocation =
        linkMeta?.locationLabel || locationLabel || "Book Excerpt";
      const bookLink: BookNoteLink | null = linkMeta?.bookId
        ? {
            bookId: linkMeta.bookId,
            bookTitle: linkMeta.bookTitle || bookTitle,
            bookAuthor: linkMeta.bookAuthor,
            bookFormat: linkMeta.bookFormat,
            unitIndex: linkMeta.unitIndex ?? 0,
            scrollRatio: linkMeta.scrollRatio ?? 0,
            locationLabel: resolvedLocation,
            quote: linkMeta.quote ?? excerptText.slice(0, 280),
            bookRemoved: false,
          }
        : null;
      const noteEntry: Entry = {
        id: uid("ent"),
        type: "note",
        title: `Excerpt — ${bookTitle}`,
        icon: "📖",
        noteStatus: "inbox",
        syncToTimeline: false,
        content: `<blockquote><p>${safeExcerpt}</p></blockquote><p>${
          resolvedLocation
            ? `<em>Source: ${bookTitle} (${resolvedLocation})</em>`
            : `<em>Source: ${bookTitle}</em>`
        }</p>`,
        createdAt: nowIso,
        updatedAt: nowIso,
        scheduledAt: null,
        completedAt: null,
        endAt: null,
        completed: false,
        focusBucket: null,
        tags: ["reading", ...(slugTag ? [slugTag] : [])],
        bookLink,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        entries: [noteEntry, ...prev.entries],
      }));
      pushToast("Excerpt sent to Kanso Notes", "success");
      return noteEntry;
    },
    [mutateWorkspace, pushToast],
  );

  // Streamer (Multi-YouTube Grid + Saved URLs Vault + Folders + Presets)
  const addStream = useCallback(
    (
      stream: Omit<StreamItem, "id" | "addedAt">,
      addToGrid = true,
    ): StreamItem => {
      const nowIso = new Date().toISOString();
      const created: StreamItem = {
        ...stream,
        affirmations: stream.affirmations ?? "",
        folderIds: stream.folderIds ?? [],
        rating: stream.rating ?? 0,
        listenCount: stream.listenCount ?? (addToGrid ? 1 : 0),
        lastListenedAt: stream.lastListenedAt ?? (addToGrid ? nowIso : null),
        id: uid("str"),
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
                spotlightStreamId:
                  prev.streamerState.spotlightStreamId || created.id,
                activePresetId: null,
              }
            : prev.streamerState,
        };
      });
      pushToast(`Saved "${created.customLabel || created.title}"`, "success");
      return created;
    },
    [mutateWorkspace, pushToast],
  );

  const updateStream = useCallback(
    (id: string, patch: Partial<StreamItem>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        streams: prev.streams.map((s) =>
          s.id === id ? { ...s, ...patch } : s,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteStream = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => {
        const currentSlots = prev.streamerState.activeSlots ?? [];
        const nextSlots = currentSlots.filter((sl) => sl.streamId !== id);
        const nextActive = nextSlots.map((sl) => sl.streamId);
        const nextPresets = prev.streamPresets
          .map((p) => ({
            ...p,
            streamIds: p.streamIds.filter((sid) => sid !== id),
            slots: p.slots
              ? p.slots.filter((sl) => sl.streamId !== id)
              : undefined,
          }))
          .filter((p) => p.streamIds.length > 0);
        const activePresetStillExists =
          prev.streamerState.activePresetId !== null &&
          nextPresets.some((p) => p.id === prev.streamerState.activePresetId);
        return {
          ...prev,
          streams: prev.streams.filter((s) => s.id !== id),
          streamPresets: nextPresets,
          streamerState: {
            ...prev.streamerState,
            activeSlots: nextSlots,
            activeStreamIds: nextActive,
            spotlightStreamId:
              prev.streamerState.spotlightStreamId === id
                ? nextActive[0] || null
                : prev.streamerState.spotlightStreamId,
            activePresetId: activePresetStillExists
              ? prev.streamerState.activePresetId
              : null,
          },
        };
      });
      pushToast("Stream removed from vault");
    },
    [mutateWorkspace, pushToast],
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
                  : s,
              ),
          streamerState: {
            ...prev.streamerState,
            activeSlots: nextSlots,
            activeStreamIds: nextActive,
            spotlightStreamId:
              exists && prev.streamerState.spotlightStreamId === id
                ? nextActive[0] || null
                : prev.streamerState.spotlightStreamId || nextActive[0] || null,
            activePresetId:
              nextSlots.length === 0 ? null : prev.streamerState.activePresetId,
          },
        };
      });
    },
    [mutateWorkspace],
  );

  const loadStreamsToGrid = useCallback(
    (
      streamIds: string[],
      mode: "replace" | "append" = "replace",
      label?: string,
    ) => {
      const currentStreams = latestWorkspaceRef.current.streams;
      const validUniqueIds = Array.from(
        new Set(
          streamIds.filter((sid) => currentStreams.some((s) => s.id === sid)),
        ),
      );
      if (validUniqueIds.length === 0) {
        pushToast("No saved streams to load in this selection", "error");
        return;
      }

      const nowIso = new Date().toISOString();
      mutateWorkspace((prev) => {
        const currentSlots = prev.streamerState.activeSlots ?? [];
        const existingSet = new Set(currentSlots.map((sl) => sl.streamId));
        const nextSlots =
          mode === "append"
            ? [
                ...currentSlots,
                ...validUniqueIds
                  .filter((sid) => !existingSet.has(sid))
                  .map((sid) => createDefaultSlot(sid)),
              ]
            : validUniqueIds.map((sid) => createDefaultSlot(sid));
        const nextActive = nextSlots.map((sl) => sl.streamId);
        const newlyAddedSet = new Set(
          mode === "append"
            ? validUniqueIds.filter((sid) => !existingSet.has(sid))
            : validUniqueIds,
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
              : s,
          ),
          streamerState: {
            ...prev.streamerState,
            activeSlots: nextSlots,
            activeStreamIds: nextActive,
            spotlightStreamId: nextActive.includes(
              prev.streamerState.spotlightStreamId || "",
            )
              ? prev.streamerState.spotlightStreamId
              : nextActive[0] || null,
            activePresetId:
              mode === "append" ? prev.streamerState.activePresetId : null,
          },
        };
      });

      const actionWord = mode === "append" ? "Added" : "Loaded";
      const targetText = label ? ` from "${label}"` : "";
      pushToast(
        `${actionWord} ${validUniqueIds.length} ${validUniqueIds.length === 1 ? "stream" : "streams"}${targetText} to Live Stack`,
        "success",
      );
    },
    [mutateWorkspace, pushToast],
  );

  const addStreamSlot = useCallback(
    (
      streamId: string,
      overrides?: Partial<Omit<StackSlot, "slotId" | "streamId">>,
    ): StackSlot | null => {
      const target = latestWorkspaceRef.current.streams.find(
        (s) => s.id === streamId,
      );
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
              : s,
          ),
          streamerState: {
            ...prev.streamerState,
            activeSlots: nextSlots,
            activeStreamIds: nextSlots.map((sl) => sl.streamId),
            spotlightStreamId: prev.streamerState.spotlightStreamId || streamId,
            activePresetId: prev.streamerState.activePresetId,
          },
        };
      });
      return newSlot;
    },
    [mutateWorkspace],
  );

  const updateStreamSlot = useCallback(
    (slotId: string, patch: Partial<StackSlot>) => {
      mutateWorkspace((prev) => {
        const currentSlots = prev.streamerState.activeSlots ?? [];
        const nextSlots = currentSlots.map((sl) =>
          sl.slotId === slotId ? { ...sl, ...patch } : sl,
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
    [mutateWorkspace],
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
    [mutateWorkspace],
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
            spotlightStreamId: nextActive.includes(
              prev.streamerState.spotlightStreamId || "",
            )
              ? prev.streamerState.spotlightStreamId
              : nextActive[0] || null,
            activePresetId:
              nextSlots.length === 0 ? null : prev.streamerState.activePresetId,
          },
        };
      });
    },
    [mutateWorkspace],
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
    pushToast("Cleared active stack");
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
    [mutateWorkspace],
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
            : s,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const addStreamFolder = useCallback(
    (
      name: string,
      parentId: string | null = null,
      description = "",
    ): StreamFolder => {
      const trimmed = name.trim() || "Untitled Folder";
      const created: StreamFolder = {
        id: uid("sfold"),
        name: trimmed,
        parentId,
        description: description.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      mutateWorkspace((prev) => {
        const siblings = (prev.streamFolders ?? []).filter(
          (f) => (f.parentId ?? null) === (parentId ?? null),
        );
        const orderedOrders = siblings
          .map((f) => f.sortOrder)
          .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
        const nextCreated =
          orderedOrders.length > 0
            ? { ...created, sortOrder: Math.max(...orderedOrders) + 1 }
            : created;
        return {
          ...prev,
          streamFolders: [...(prev.streamFolders ?? []), nextCreated],
        };
      });
      pushToast(`Created folder "${trimmed}"`, "success");
      return created;
    },
    [mutateWorkspace, pushToast],
  );

  const updateStreamFolder = useCallback(
    (id: string, patch: Partial<StreamFolder>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        streamFolders: (prev.streamFolders ?? []).map((f) =>
          f.id === id ? { ...f, ...patch } : f,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const reorderStreamFolders = useCallback(
    (
      draggedId: string,
      targetId: string,
      position: "before" | "after" | "inside",
    ) => {
      if (!draggedId || !targetId || draggedId === targetId) return;
      const compareFolders = (a: StreamFolder, b: StreamFolder) => {
        const ao =
          typeof a.sortOrder === "number" && Number.isFinite(a.sortOrder)
            ? a.sortOrder
            : null;
        const bo =
          typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder)
            ? b.sortOrder
            : null;
        if (ao !== null && bo !== null && ao !== bo) return ao - bo;
        if (ao !== null && bo === null) return -1;
        if (ao === null && bo !== null) return 1;
        return a.name.localeCompare(b.name);
      };

      mutateWorkspace((prev) => {
        const current = prev.streamFolders ?? [];
        const byId = new Map(current.map((f) => [f.id, f]));
        const dragged = byId.get(draggedId);
        const target = byId.get(targetId);
        if (!dragged || !target) return prev;

        const nextParentId =
          position === "inside" ? target.id : (target.parentId ?? null);

        // Guard against cycles
        let cursor: string | null | undefined = nextParentId;
        const seen = new Set<string>();
        while (cursor && !seen.has(cursor)) {
          if (cursor === draggedId) return prev;
          seen.add(cursor);
          cursor = byId.get(cursor)?.parentId ?? null;
        }

        const updatedDragged: StreamFolder =
          (dragged.parentId ?? null) === nextParentId
            ? dragged
            : { ...dragged, parentId: nextParentId };

        const siblings = current
          .filter(
            (f) =>
              f.id !== draggedId &&
              (f.parentId && byId.has(f.parentId) ? f.parentId : null) ===
                nextParentId,
          )
          .sort(compareFolders);

        if (position === "inside") {
          siblings.push(updatedDragged);
        } else {
          const targetIdx = siblings.findIndex((f) => f.id === targetId);
          if (targetIdx === -1) return prev;
          const insertIdx = position === "before" ? targetIdx : targetIdx + 1;
          siblings.splice(insertIdx, 0, updatedDragged);
        }

        const orderBySiblingId = new Map<string, number>();
        siblings.forEach((f, idx) => orderBySiblingId.set(f.id, idx));

        const nextFolders = current.map((f) => {
          const base = f.id === draggedId ? updatedDragged : f;
          const nextOrder = orderBySiblingId.get(base.id);
          if (nextOrder !== undefined) {
            return { ...base, sortOrder: nextOrder };
          }
          return base;
        });

        return {
          ...prev,
          streamFolders: nextFolders,
        };
      });
    },
    [mutateWorkspace],
  );

  const setStreamTopicIcon = useCallback(
    (topic: string, icon: string | undefined) => {
      const normalizedKey = topic.trim().toLowerCase();
      if (!normalizedKey) return;
      mutateWorkspace((prev) => {
        const nextMap = { ...(prev.streamTopicIcons ?? {}) };
        if (icon && icon.trim()) {
          nextMap[normalizedKey] = icon.trim();
        } else {
          delete nextMap[normalizedKey];
        }
        return {
          ...prev,
          streamTopicIcons: nextMap,
        };
      });
    },
    [mutateWorkspace],
  );

  const renameStreamTopic = useCallback(
    (fromTopic: string, targetTopic: string): number => {
      const sourceLabel = fromTopic.trim() || "Uncategorized";
      const resolvedTarget = targetTopic.trim() || "Uncategorized";
      if (sourceLabel === resolvedTarget) return 0;

      const storedCategory =
        resolvedTarget === "Uncategorized" ? "" : resolvedTarget;
      let affectedCount = 0;

      mutateWorkspace((prev) => {
        const nextStreams = prev.streams.map((s) => {
          const cat = s.category.trim() || "Uncategorized";
          if (cat !== sourceLabel) return s;
          affectedCount++;
          if (s.category === storedCategory) return s;
          return { ...s, category: storedCategory };
        });

        const nextIcons = { ...(prev.streamTopicIcons ?? {}) };
        const fromKey = sourceLabel.toLowerCase();
        const toKey = resolvedTarget.toLowerCase();
        if (nextIcons[fromKey]) {
          if (!nextIcons[toKey]) {
            nextIcons[toKey] = nextIcons[fromKey];
          }
          delete nextIcons[fromKey];
        }

        let nextTopicOrder = prev.streamTopicOrder;
        if (Array.isArray(prev.streamTopicOrder) && prev.streamTopicOrder.length > 0) {
          const seen = new Set<string>();
          const updated: string[] = [];
          for (const raw of prev.streamTopicOrder) {
            const mapped =
              raw.trim().toLowerCase() === fromKey ? resolvedTarget : raw;
            const mappedKey = mapped.trim().toLowerCase();
            if (!mappedKey || seen.has(mappedKey)) continue;
            seen.add(mappedKey);
            updated.push(mapped);
          }
          nextTopicOrder = updated;
        }

        const nextChannels = { ...(prev.streamChannels ?? {}) };
        let channelsChanged = false;
        for (const [chName, meta] of Object.entries(nextChannels)) {
          if (meta.defaultTopic?.trim() === sourceLabel) {
            const updated = { ...meta };
            if (storedCategory) updated.defaultTopic = storedCategory;
            else delete updated.defaultTopic;
            nextChannels[chName] = updated;
            channelsChanged = true;
          }
        }

        return {
          ...prev,
          streams: nextStreams,
          streamTopicIcons: nextIcons,
          streamTopicOrder: nextTopicOrder,
          streamChannels: channelsChanged ? nextChannels : prev.streamChannels,
        };
      });

      return affectedCount;
    },
    [mutateWorkspace],
  );

  const reorderStreamTopics = useCallback(
    (orderedTopics: string[]) => {
      const cleaned = orderedTopics
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      mutateWorkspace((prev) => ({
        ...prev,
        streamTopicOrder: cleaned,
      }));
    },
    [mutateWorkspace],
  );

  const resetStreamTopicOrder = useCallback(() => {
    mutateWorkspace((prev) => {
      if (!prev.streamTopicOrder || prev.streamTopicOrder.length === 0) {
        return prev;
      }
      return {
        ...prev,
        streamTopicOrder: undefined,
      };
    });
  }, [mutateWorkspace]);

  const updateStreamChannelMeta = useCallback(
    (channelName: string, patch: Partial<StreamChannelMeta>) => {
      const key = channelName.trim() || "Unknown Channel";
      mutateWorkspace((prev) => {
        const nextMap = { ...(prev.streamChannels ?? {}) };
        const merged: StreamChannelMeta = {
          ...(nextMap[key] ?? {}),
          ...patch,
        };
        if (!merged.pinned) delete merged.pinned;
        if (!merged.icon?.trim()) delete merged.icon;
        else merged.icon = merged.icon.trim();
        if (!merged.color?.trim()) delete merged.color;
        else merged.color = merged.color.trim();
        if (!merged.defaultTopic?.trim()) delete merged.defaultTopic;
        else merged.defaultTopic = merged.defaultTopic.trim();
        if (
          typeof merged.sortOrder !== "number" ||
          !Number.isFinite(merged.sortOrder)
        ) {
          delete merged.sortOrder;
        }
        if (Object.keys(merged).length === 0) {
          delete nextMap[key];
        } else {
          nextMap[key] = merged;
        }
        return {
          ...prev,
          streamChannels: nextMap,
        };
      });
    },
    [mutateWorkspace],
  );

  const reorderStreamChannels = useCallback(
    (orderedChannelNames: string[]) => {
      if (orderedChannelNames.length === 0) return;
      mutateWorkspace((prev) => {
        const nextMap = { ...(prev.streamChannels ?? {}) };
        let changed = false;
        orderedChannelNames.forEach((rawName, idx) => {
          const key = rawName.trim() || "Unknown Channel";
          const current = nextMap[key] ?? {};
          if (current.sortOrder !== idx) {
            nextMap[key] = { ...current, sortOrder: idx };
            changed = true;
          }
        });
        if (!changed) return prev;
        return {
          ...prev,
          streamChannels: nextMap,
        };
      });
    },
    [mutateWorkspace],
  );

  const renameOrMergeStreamChannels = useCallback(
    (fromNames: string[], targetName: string): number => {
      const fromSet = new Set(
        fromNames.map((n) => n.trim() || "Unknown Channel"),
      );
      if (fromSet.size === 0) return 0;
      const resolvedTarget = targetName.trim() || "Unknown Channel";
      const storedChannel =
        resolvedTarget === "Unknown Channel" ? "" : resolvedTarget;
      let affectedCount = 0;

      mutateWorkspace((prev) => {
        const nextStreams = prev.streams.map((s) => {
          const ch = s.channel.trim() || "Unknown Channel";
          if (!fromSet.has(ch)) return s;
          affectedCount++;
          if (s.channel === storedChannel) return s;
          return { ...s, channel: storedChannel };
        });

        const nextChannels = { ...(prev.streamChannels ?? {}) };
        const combinedMeta: StreamChannelMeta = {
          ...(nextChannels[resolvedTarget] ?? {}),
        };
        for (const sourceName of fromSet) {
          const srcMeta = nextChannels[sourceName];
          if (!srcMeta) continue;
          if (srcMeta.pinned) combinedMeta.pinned = true;
          if (!combinedMeta.icon && srcMeta.icon)
            combinedMeta.icon = srcMeta.icon;
          if (!combinedMeta.color && srcMeta.color)
            combinedMeta.color = srcMeta.color;
          if (!combinedMeta.defaultTopic && srcMeta.defaultTopic) {
            combinedMeta.defaultTopic = srcMeta.defaultTopic;
          }
          if (
            typeof combinedMeta.sortOrder !== "number" &&
            typeof srcMeta.sortOrder === "number"
          ) {
            combinedMeta.sortOrder = srcMeta.sortOrder;
          }
          if (sourceName !== resolvedTarget) {
            delete nextChannels[sourceName];
          }
        }
        if (Object.keys(combinedMeta).length > 0) {
          nextChannels[resolvedTarget] = combinedMeta;
        }

        return {
          ...prev,
          streams: nextStreams,
          streamChannels: nextChannels,
        };
      });

      return affectedCount;
    },
    [mutateWorkspace],
  );

  const batchUpdateStreamChannels = useCallback(
    (
      channelNames: string[],
      update: {
        topic?: string;
        tags?: string[];
        tagsMode?: "append" | "replace";
      },
    ): number => {
      const targetSet = new Set(
        channelNames.map((n) => n.trim() || "Unknown Channel"),
      );
      if (targetSet.size === 0) return 0;
      let affectedCount = 0;

      mutateWorkspace((prev) => {
        const nextStreams = prev.streams.map((s) => {
          const ch = s.channel.trim() || "Unknown Channel";
          if (!targetSet.has(ch)) return s;
          affectedCount++;
          let nextCategory = s.category;
          let nextTags = s.tags;
          if (typeof update.topic === "string") {
            nextCategory = update.topic.trim() || "General";
          }
          if (Array.isArray(update.tags)) {
            const cleanIncoming = update.tags
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean);
            nextTags =
              update.tagsMode === "replace"
                ? Array.from(new Set(cleanIncoming))
                : Array.from(new Set([...s.tags, ...cleanIncoming]));
          }
          return {
            ...s,
            category: nextCategory,
            tags: nextTags,
          };
        });
        return {
          ...prev,
          streams: nextStreams,
        };
      });

      return affectedCount;
    },
    [mutateWorkspace],
  );

  const deleteStreamChannels = useCallback(
    (channelNames: string[]): number => {
      const targetSet = new Set(
        channelNames.map((n) => n.trim() || "Unknown Channel"),
      );
      if (targetSet.size === 0) return 0;
      let deletedCount = 0;

      mutateWorkspace((prev) => {
        const removedIds = new Set<string>();
        const remainingStreams = prev.streams.filter((s) => {
          const ch = s.channel.trim() || "Unknown Channel";
          if (targetSet.has(ch)) {
            removedIds.add(s.id);
            deletedCount++;
            return false;
          }
          return true;
        });

        const currentSlots = prev.streamerState.activeSlots ?? [];
        const nextSlots = currentSlots.filter(
          (sl) => !removedIds.has(sl.streamId),
        );
        const nextActive = nextSlots.map((sl) => sl.streamId);
        const nextPresets = prev.streamPresets
          .map((p) => {
            const filteredSlots = (p.slots ?? []).filter(
              (sl) => !removedIds.has(sl.streamId),
            );
            const filteredIds = p.streamIds.filter((sid) => !removedIds.has(sid));
            return {
              ...p,
              streamIds: filteredIds,
              slots: p.slots ? filteredSlots : undefined,
              spotlightStreamId:
                p.spotlightStreamId && removedIds.has(p.spotlightStreamId)
                  ? filteredIds[0] || null
                  : p.spotlightStreamId,
            };
          })
          .filter((p) => p.streamIds.length > 0);

        const nextPresetStillExists =
          prev.streamerState.activePresetId !== null &&
          nextPresets.some(
            (p) => p.id === prev.streamerState.activePresetId,
          );

        const nextChannels = { ...(prev.streamChannels ?? {}) };
        for (const name of targetSet) {
          delete nextChannels[name];
        }

        return {
          ...prev,
          streams: remainingStreams,
          streamChannels: nextChannels,
          streamPresets: nextPresets,
          streamerState: {
            ...prev.streamerState,
            activeSlots: nextSlots,
            activeStreamIds: nextActive,
            spotlightStreamId:
              prev.streamerState.spotlightStreamId &&
              removedIds.has(prev.streamerState.spotlightStreamId)
                ? nextActive[0] || null
                : prev.streamerState.spotlightStreamId,
            activePresetId: nextPresetStillExists
              ? prev.streamerState.activePresetId
              : null,
          },
        };
      });

      return deletedCount;
    },
    [mutateWorkspace],
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
            .map((f) =>
              f.parentId === id ? { ...f, parentId: fallbackParent } : f,
            ),
          streams: prev.streams.map((s) =>
            s.folderIds?.includes(id)
              ? { ...s, folderIds: s.folderIds.filter((fid) => fid !== id) }
              : s,
          ),
        };
      });
      pushToast("Folder deleted");
    },
    [mutateWorkspace, pushToast],
  );

  const reorderActiveStreams = reorderActiveSlots;

  const reorderVaultStreams = useCallback(
    (sortOrderById: Record<string, number>) => {
      if (Object.keys(sortOrderById).length === 0) return;
      mutateWorkspace((prev) => ({
        ...prev,
        streams: prev.streams.map((s) => {
          const nextOrder = sortOrderById[s.id];
          if (typeof nextOrder !== "number" || s.sortOrder === nextOrder) {
            return s;
          }
          return { ...s, sortOrder: nextOrder };
        }),
      }));
    },
    [mutateWorkspace],
  );

  const updateStreamerState = useCallback(
    (patch: Partial<StreamerState>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        streamerState: { ...prev.streamerState, ...patch },
      }));
    },
    [mutateWorkspace],
  );

  const saveStreamPreset = useCallback(
    (name: string, category = "General"): StreamPreset => {
      const currentStreamer = latestWorkspaceRef.current.streamerState;
      const trimmed = name.trim() || "Untitled Playlist";
      const trimmedCategory = category.trim() || "General";
      const currentSlots = currentStreamer.activeSlots ?? [];
      const created: StreamPreset = {
        id: uid("preset"),
        name: trimmed,
        category: trimmedCategory,
        layoutMode: currentStreamer.layoutMode,
        customRows: currentStreamer.customRows,
        customCols: currentStreamer.customCols,
        viewMode: currentStreamer.viewMode || "grid",
        sizingMode: currentStreamer.sizingMode || "fit",
        masterVolume: currentStreamer.masterVolume ?? 100,
        streamIds: currentSlots.map((sl) => sl.streamId),
        slots: currentSlots.map((sl) => ({ ...sl })),
        spotlightStreamId: currentStreamer.spotlightStreamId,
        createdAt: new Date().toISOString(),
      };
      mutateWorkspace((prev) => ({
        ...prev,
        streamPresets: [created, ...prev.streamPresets],
        streamerState: { ...prev.streamerState, activePresetId: created.id },
      }));
      pushToast(`Saved playlist "${trimmed}"`, "success");
      return created;
    },
    [mutateWorkspace, pushToast],
  );

  const loadStreamPreset = useCallback(
    (presetId: string, mode: "replace" | "append" = "replace") => {
      const currentWs = latestWorkspaceRef.current;
      const preset = currentWs.streamPresets.find((p) => p.id === presetId);
      if (!preset) return;
      const validIdsSet = new Set(currentWs.streams.map((s) => s.id));
      const restoredSlots: StackSlot[] =
        Array.isArray(preset.slots) && preset.slots.length > 0
          ? preset.slots
              .filter((sl) => validIdsSet.has(sl.streamId))
              .map((sl) => ({
                ...sl,
                slotId: uid("slot"),
              }))
          : preset.streamIds
              .filter((sid) => validIdsSet.has(sid))
              .map((sid) => createDefaultSlot(sid));

      if (mode === "append") {
        if (restoredSlots.length === 0) {
          pushToast(`"${preset.name}" has no saved tracks to layer`, "error");
          return;
        }
        mutateWorkspace((prev) => {
          const existingSlots = prev.streamerState.activeSlots ?? [];
          const combinedSlots = [...existingSlots, ...restoredSlots];
          const combinedStreamIds = combinedSlots.map((sl) => sl.streamId);
          return {
            ...prev,
            streamerState: {
              ...prev.streamerState,
              activeSlots: combinedSlots,
              activeStreamIds: combinedStreamIds,
              spotlightStreamId:
                prev.streamerState.spotlightStreamId ||
                combinedStreamIds[0] ||
                null,
              activePresetId: prev.streamerState.activePresetId || preset.id,
            },
          };
        });
        pushToast(
          `Layered playlist "${preset.name}" (+${restoredSlots.length} ${restoredSlots.length === 1 ? "track" : "tracks"})`,
          "success",
        );
        return;
      }

      const restoredStreamIds = restoredSlots.map((sl) => sl.streamId);
      mutateWorkspace((prev) => ({
        ...prev,
        streamerState: {
          ...prev.streamerState,
          layoutMode: preset.layoutMode,
          customRows: preset.customRows,
          customCols: preset.customCols,
          viewMode: preset.viewMode || prev.streamerState.viewMode || "grid",
          sizingMode:
            preset.sizingMode || prev.streamerState.sizingMode || "fit",
          masterVolume:
            typeof preset.masterVolume === "number"
              ? preset.masterVolume
              : (prev.streamerState.masterVolume ?? 100),
          activeSlots: restoredSlots,
          activeStreamIds: restoredStreamIds,
          spotlightStreamId:
            preset.spotlightStreamId || restoredStreamIds[0] || null,
          activePresetId: preset.id,
        },
      }));
      pushToast(`Loaded playlist "${preset.name}"`, "success");
    },
    [mutateWorkspace, pushToast],
  );

  const updateStreamPreset = useCallback(
    (
      presetId: string,
      patch: Partial<
        Pick<StreamPreset, "name" | "category" | "pinned" | "sortOrder">
      >,
    ) => {
      mutateWorkspace((prev) => ({
        ...prev,
        streamPresets: prev.streamPresets.map((p) => {
          if (p.id !== presetId) return p;
          return {
            ...p,
            ...patch,
            name:
              typeof patch.name === "string"
                ? patch.name.trim() || p.name
                : p.name,
            category:
              typeof patch.category === "string"
                ? patch.category.trim() || "General"
                : p.category,
          };
        }),
      }));
    },
    [mutateWorkspace],
  );

  const updateStreamPresetMix = useCallback(
    (presetId: string) => {
      const targetName = latestWorkspaceRef.current.streamPresets.find(
        (p) => p.id === presetId,
      )?.name;
      mutateWorkspace((prev) => {
        const currentStreamer = prev.streamerState;
        const currentSlots = currentStreamer.activeSlots ?? [];
        return {
          ...prev,
          streamPresets: prev.streamPresets.map((p) =>
            p.id === presetId
              ? {
                  ...p,
                  layoutMode: currentStreamer.layoutMode,
                  customRows: currentStreamer.customRows,
                  customCols: currentStreamer.customCols,
                  viewMode: currentStreamer.viewMode || "grid",
                  sizingMode: currentStreamer.sizingMode || "fit",
                  masterVolume: currentStreamer.masterVolume ?? 100,
                  streamIds: currentSlots.map((sl) => sl.streamId),
                  slots: currentSlots.map((sl) => ({ ...sl })),
                  spotlightStreamId: currentStreamer.spotlightStreamId,
                }
              : p,
          ),
          streamerState: {
            ...prev.streamerState,
            activePresetId: presetId,
          },
        };
      });
      if (targetName) {
        pushToast(`Updated mix for "${targetName}"`, "success");
      }
    },
    [mutateWorkspace, pushToast],
  );

  const reorderStreamPresets = useCallback(
    (orderedPresetIds: string[]) => {
      if (orderedPresetIds.length === 0) return;
      const indexById = new Map<string, number>();
      orderedPresetIds.forEach((id, idx) => indexById.set(id, idx));
      mutateWorkspace((prev) => {
        let nextOrder = orderedPresetIds.length;
        return {
          ...prev,
          streamPresets: prev.streamPresets.map((p) => {
            const idx = indexById.get(p.id);
            return {
              ...p,
              sortOrder: idx !== undefined ? idx : nextOrder++,
            };
          }),
        };
      });
    },
    [mutateWorkspace],
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
      pushToast("Playlist deleted");
    },
    [mutateWorkspace, pushToast],
  );

  // Audio Studio actions (100% local per device, matching Library rules)
  const addAudioTrack = useCallback(
    (
      track: Omit<AudioTrackRecord, "id" | "addedAt"> & {
        id?: string;
        addedAt?: number;
      },
    ): AudioTrackRecord => {
      const created: AudioTrackRecord = {
        ...track,
        id: track.id || uid("aud"),
        addedAt: track.addedAt ?? Date.now(),
        tags: Array.isArray(track.tags) ? track.tags : [],
        folderIds: Array.isArray(track.folderIds)
          ? track.folderIds
          : track.folderId
            ? [track.folderId]
            : [],
        currentPositionSeconds: track.currentPositionSeconds ?? 0,
        playCount: track.playCount ?? 0,
        lastPlayedAt: track.lastPlayedAt ?? null,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        audioTracks: [created, ...(prev.audioTracks ?? [])],
      }));
      return created;
    },
    [mutateWorkspace],
  );

  const updateAudioTrack = useCallback(
    (id: string, patch: Partial<AudioTrackRecord>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        audioTracks: (prev.audioTracks ?? []).map((t) =>
          t.id === id ? { ...t, ...patch } : t,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteAudioTracks = useCallback(
    async (ids: string[]): Promise<void> => {
      const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
      if (uniqueIds.length === 0) return;
      const deleteSet = new Set(uniqueIds);
      await audioDb.deleteAudioFiles(uniqueIds).catch(() => undefined);

      mutateWorkspace((prev) => {
        const tracks = prev.audioTracks ?? [];
        const deletedTracks = tracks.filter((t) => deleteSet.has(t.id));
        const remainingUris = new Set(
          tracks
            .filter((t) => !deleteSet.has(t.id) && t.externalUri)
            .map((t) => t.externalUri!),
        );
        for (const t of deletedTracks) {
          if (t.externalUri && !remainingUris.has(t.externalUri)) {
            void releaseAndroidUri(t.externalUri);
          }
        }

        const currentState = prev.audioState ?? { ...DEFAULT_AUDIO_STATE };
        const nextSlots = currentState.activeSlots.filter(
          (sl) => !deleteSet.has(sl.trackId),
        );
        const nextQueue = currentState.queueTrackIds.filter(
          (tid) => !deleteSet.has(tid),
        );
        const nextPrimary =
          currentState.primaryTrackId && !deleteSet.has(currentState.primaryTrackId)
            ? currentState.primaryTrackId
            : nextSlots[0]?.trackId || null;

        const nextPlaylists = (prev.audioPlaylists ?? []).map((pl) => ({
          ...pl,
          trackIds: pl.trackIds.filter((tid) => !deleteSet.has(tid)),
          updatedAt: Date.now(),
        }));
        const nextPresets = (prev.audioMixPresets ?? [])
          .map((p) => ({
            ...p,
            slots: p.slots.filter((sl) => !deleteSet.has(sl.trackId)),
          }))
          .filter((p) => p.slots.length > 0);

        return {
          ...prev,
          audioTracks: tracks.filter((t) => !deleteSet.has(t.id)),
          audioPlaylists: nextPlaylists,
          audioMixPresets: nextPresets,
          audioState: {
            ...currentState,
            activeSlots: nextSlots,
            queueTrackIds: nextQueue,
            primaryTrackId: nextPrimary,
          },
        };
      });

      pushToast(
        uniqueIds.length === 1
          ? "Track removed from Audio"
          : `Removed ${uniqueIds.length} tracks from Audio`,
      );
    },
    [mutateWorkspace, pushToast],
  );

  const addAudioFolder = useCallback(
    (
      name: string,
      parentId: string | null = null,
      color: AudioFolderRecord["color"] = "slate",
    ): AudioFolderRecord => {
      const created: AudioFolderRecord = {
        id: uid("afld"),
        name: name.trim() || "Untitled Folder",
        parentId,
        color,
        createdAt: Date.now(),
      };
      mutateWorkspace((prev) => ({
        ...prev,
        audioFolders: [...(prev.audioFolders ?? []), created],
      }));
      pushToast(`Created folder "${created.name}"`, "success");
      return created;
    },
    [mutateWorkspace, pushToast],
  );

  const updateAudioFolder = useCallback(
    (id: string, patch: Partial<AudioFolderRecord>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        audioFolders: (prev.audioFolders ?? []).map((f) =>
          f.id === id ? { ...f, ...patch } : f,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteAudioFolder = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => {
        const folders = prev.audioFolders ?? [];
        const target = folders.find((f) => f.id === id);
        const fallbackParent = target?.parentId ?? null;
        return {
          ...prev,
          audioFolders: folders
            .filter((f) => f.id !== id)
            .map((f) =>
              f.parentId === id ? { ...f, parentId: fallbackParent } : f,
            ),
          audioTracks: (prev.audioTracks ?? []).map((t) => {
            const nextFolderIds = (t.folderIds ?? (t.folderId ? [t.folderId] : []))
              .filter((fid) => fid !== id);
            return {
              ...t,
              folderIds: nextFolderIds,
              folderId: nextFolderIds[0] ?? null,
            };
          }),
        };
      });
      pushToast("Folder deleted");
    },
    [mutateWorkspace, pushToast],
  );

  const addAudioPlaylist = useCallback(
    (
      name: string,
      trackIds: string[] = [],
      description = "",
      color: AudioPlaylistRecord["color"] = "ochre",
    ): AudioPlaylistRecord => {
      const now = Date.now();
      const created: AudioPlaylistRecord = {
        id: uid("apl"),
        name: name.trim() || "Untitled Playlist",
        description: description.trim() || undefined,
        color,
        trackIds: Array.from(new Set(trackIds.filter(Boolean))),
        createdAt: now,
        updatedAt: now,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        audioPlaylists: [...(prev.audioPlaylists ?? []), created],
      }));
      pushToast(`Created playlist "${created.name}"`, "success");
      return created;
    },
    [mutateWorkspace, pushToast],
  );

  const updateAudioPlaylist = useCallback(
    (id: string, patch: Partial<AudioPlaylistRecord>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        audioPlaylists: (prev.audioPlaylists ?? []).map((pl) =>
          pl.id === id ? { ...pl, ...patch, updatedAt: Date.now() } : pl,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteAudioPlaylist = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        audioPlaylists: (prev.audioPlaylists ?? []).filter((pl) => pl.id !== id),
      }));
      pushToast("Playlist deleted");
    },
    [mutateWorkspace, pushToast],
  );

  const addTracksToPlaylist = useCallback(
    (playlistId: string, trackIds: string[]) => {
      if (trackIds.length === 0) return;
      mutateWorkspace((prev) => ({
        ...prev,
        audioPlaylists: (prev.audioPlaylists ?? []).map((pl) => {
          if (pl.id !== playlistId) return pl;
          const existing = new Set(pl.trackIds);
          const merged = [
            ...pl.trackIds,
            ...trackIds.filter((tid) => !existing.has(tid)),
          ];
          return { ...pl, trackIds: merged, updatedAt: Date.now() };
        }),
      }));
    },
    [mutateWorkspace],
  );

  const removeTrackFromPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        audioPlaylists: (prev.audioPlaylists ?? []).map((pl) =>
          pl.id === playlistId
            ? {
                ...pl,
                trackIds: pl.trackIds.filter((id) => id !== trackId),
                updatedAt: Date.now(),
              }
            : pl,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const reorderPlaylistTracks = useCallback(
    (playlistId: string, fromIndex: number, toIndex: number) => {
      mutateWorkspace((prev) => ({
        ...prev,
        audioPlaylists: (prev.audioPlaylists ?? []).map((pl) => {
          if (pl.id !== playlistId) return pl;
          const list = [...pl.trackIds];
          if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= list.length ||
            toIndex >= list.length ||
            fromIndex === toIndex
          ) {
            return pl;
          }
          const [moved] = list.splice(fromIndex, 1);
          list.splice(toIndex, 0, moved);
          return { ...pl, trackIds: list, updatedAt: Date.now() };
        }),
      }));
    },
    [mutateWorkspace],
  );

  const reorderAudioTracks = useCallback(
    (sortOrderById: Record<string, number>) => {
      if (Object.keys(sortOrderById).length === 0) return;
      mutateWorkspace((prev) => ({
        ...prev,
        audioTracks: (prev.audioTracks ?? []).map((t) => {
          const nextOrder = sortOrderById[t.id];
          if (typeof nextOrder !== "number" || t.sortOrder === nextOrder) {
            return t;
          }
          return { ...t, sortOrder: nextOrder };
        }),
      }));
    },
    [mutateWorkspace],
  );

  const updateAudioState = useCallback(
    (
      patch:
        | Partial<AudioStudioState>
        | ((prev: AudioStudioState) => AudioStudioState),
    ) => {
      mutateWorkspace((prev) => {
        const current = prev.audioState ?? { ...DEFAULT_AUDIO_STATE };
        const nextState =
          typeof patch === "function" ? patch(current) : { ...current, ...patch };
        return {
          ...prev,
          audioState: nextState,
        };
      });
    },
    [mutateWorkspace],
  );

  const playAudioTrack = useCallback(
    (trackId: string, options?: { replaceMix?: boolean }) => {
      const now = Date.now();
      mutateWorkspace((prev) => {
        const tracks = prev.audioTracks ?? [];
        const exists = tracks.some((t) => t.id === trackId);
        if (!exists) return prev;
        const current = prev.audioState ?? { ...DEFAULT_AUDIO_STATE };
        const existingSlot = current.activeSlots.find(
          (sl) => sl.trackId === trackId,
        );
        let nextSlots: AudioMixSlot[];
        if (options?.replaceMix) {
          nextSlots = [
            existingSlot ||
              createDefaultAudioSlot(trackId, {
                volume: current.activeSlots[0]?.volume ?? 90,
                loop: current.activeSlots[0]?.loop ?? false,
              }),
          ];
        } else if (existingSlot) {
          nextSlots = current.activeSlots;
        } else {
          nextSlots = [...current.activeSlots, createDefaultAudioSlot(trackId)];
        }
        return {
          ...prev,
          audioTracks: tracks.map((t) =>
            t.id === trackId
              ? { ...t, playCount: (t.playCount ?? 0) + 1, lastPlayedAt: now }
              : t,
          ),
          audioState: {
            ...current,
            activeSlots: nextSlots,
            primaryTrackId: trackId,
            activePresetId: null,
          },
        };
      });
    },
    [mutateWorkspace],
  );

  const addAudioMixSlot = useCallback(
    (
      trackId: string,
      overrides?: Partial<Omit<AudioMixSlot, "slotId" | "trackId">>,
    ): AudioMixSlot | null => {
      const tracks = latestWorkspaceRef.current.audioTracks ?? [];
      if (!tracks.some((t) => t.id === trackId)) return null;
      const newSlot = createDefaultAudioSlot(trackId, overrides);
      const now = Date.now();
      mutateWorkspace((prev) => {
        const current = prev.audioState ?? { ...DEFAULT_AUDIO_STATE };
        const nextSlots = [...current.activeSlots, newSlot];
        return {
          ...prev,
          audioTracks: (prev.audioTracks ?? []).map((t) =>
            t.id === trackId
              ? { ...t, playCount: (t.playCount ?? 0) + 1, lastPlayedAt: now }
              : t,
          ),
          audioState: {
            ...current,
            activeSlots: nextSlots,
            primaryTrackId: current.primaryTrackId || trackId,
            activePresetId: null,
          },
        };
      });
      return newSlot;
    },
    [mutateWorkspace],
  );

  const updateAudioMixSlot = useCallback(
    (slotId: string, patch: Partial<AudioMixSlot>) => {
      mutateWorkspace((prev) => {
        const current = prev.audioState ?? { ...DEFAULT_AUDIO_STATE };
        return {
          ...prev,
          audioState: {
            ...current,
            activeSlots: current.activeSlots.map((sl) =>
              sl.slotId === slotId ? { ...sl, ...patch } : sl,
            ),
          },
        };
      });
    },
    [mutateWorkspace],
  );

  const updateAllAudioMixSlots = useCallback(
    (updater: (slot: AudioMixSlot) => AudioMixSlot) => {
      mutateWorkspace((prev) => {
        const current = prev.audioState ?? { ...DEFAULT_AUDIO_STATE };
        return {
          ...prev,
          audioState: {
            ...current,
            activeSlots: current.activeSlots.map(updater),
          },
        };
      });
    },
    [mutateWorkspace],
  );

  const removeAudioMixSlot = useCallback(
    (slotId: string) => {
      mutateWorkspace((prev) => {
        const current = prev.audioState ?? { ...DEFAULT_AUDIO_STATE };
        const removed = current.activeSlots.find((sl) => sl.slotId === slotId);
        const nextSlots = current.activeSlots.filter(
          (sl) => sl.slotId !== slotId,
        );
        const stillHasPrimary =
          current.primaryTrackId &&
          nextSlots.some((sl) => sl.trackId === current.primaryTrackId);
        const nextPrimary = stillHasPrimary
          ? current.primaryTrackId
          : removed && current.primaryTrackId === removed.trackId
            ? nextSlots[0]?.trackId || null
            : nextSlots[0]?.trackId || null;
        return {
          ...prev,
          audioState: {
            ...current,
            activeSlots: nextSlots,
            primaryTrackId: nextPrimary,
            activePresetId: null,
          },
        };
      });
    },
    [mutateWorkspace],
  );

  const clearAudioMixSlots = useCallback(() => {
    mutateWorkspace((prev) => ({
      ...prev,
      audioState: {
        ...(prev.audioState ?? DEFAULT_AUDIO_STATE),
        activeSlots: [],
        primaryTrackId: null,
        activePresetId: null,
      },
    }));
    pushToast("Cleared active audio mixer");
  }, [mutateWorkspace, pushToast]);

  const reorderAudioMixSlots = useCallback(
    (fromIndex: number, toIndex: number) => {
      mutateWorkspace((prev) => {
        const current = prev.audioState ?? { ...DEFAULT_AUDIO_STATE };
        const list = [...current.activeSlots];
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
          audioState: {
            ...current,
            activeSlots: list,
          },
        };
      });
    },
    [mutateWorkspace],
  );

  const saveAudioMixPreset = useCallback(
    (name: string, category = "General"): AudioMixPreset => {
      const current = latestWorkspaceRef.current.audioState ?? DEFAULT_AUDIO_STATE;
      const trimmed = name.trim() || "Untitled Mix";
      const created: AudioMixPreset = {
        id: uid("amix"),
        name: trimmed,
        category: category.trim() || "General",
        masterVolume: current.masterVolume,
        eqPreset: current.eqPreset,
        slots: current.activeSlots.map((sl) => ({ ...sl })),
        createdAt: Date.now(),
      };
      mutateWorkspace((prev) => ({
        ...prev,
        audioMixPresets: [created, ...(prev.audioMixPresets ?? [])],
        audioState: {
          ...(prev.audioState ?? DEFAULT_AUDIO_STATE),
          activePresetId: created.id,
        },
      }));
      pushToast(`Saved mix preset "${trimmed}"`, "success");
      return created;
    },
    [mutateWorkspace, pushToast],
  );

  const loadAudioMixPreset = useCallback(
    (presetId: string) => {
      const currentWs = latestWorkspaceRef.current;
      const preset = (currentWs.audioMixPresets ?? []).find(
        (p) => p.id === presetId,
      );
      if (!preset) return;
      const validIds = new Set((currentWs.audioTracks ?? []).map((t) => t.id));
      const restoredSlots = preset.slots
        .filter((sl) => validIds.has(sl.trackId))
        .map((sl) => ({ ...sl, slotId: uid("aslot") }));
      mutateWorkspace((prev) => ({
        ...prev,
        audioState: {
          ...(prev.audioState ?? DEFAULT_AUDIO_STATE),
          activeSlots: restoredSlots,
          primaryTrackId: restoredSlots[0]?.trackId || null,
          masterVolume: preset.masterVolume ?? 100,
          eqPreset: preset.eqPreset || "flat",
          activePresetId: preset.id,
          mixerExpanded: restoredSlots.length > 1,
        },
      }));
      pushToast(`Loaded mix "${preset.name}"`, "success");
    },
    [mutateWorkspace, pushToast],
  );

  const deleteAudioMixPreset = useCallback(
    (presetId: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        audioMixPresets: (prev.audioMixPresets ?? []).filter(
          (p) => p.id !== presetId,
        ),
        audioState: {
          ...(prev.audioState ?? DEFAULT_AUDIO_STATE),
          activePresetId:
            prev.audioState?.activePresetId === presetId
              ? null
              : prev.audioState?.activePresetId ?? null,
        },
      }));
      pushToast("Mix preset deleted");
    },
    [mutateWorkspace, pushToast],
  );

  const recordAudioPlay = useCallback(
    (trackId: string) => {
      const now = Date.now();
      mutateWorkspace((prev) => ({
        ...prev,
        audioTracks: (prev.audioTracks ?? []).map((t) =>
          t.id === trackId
            ? { ...t, playCount: (t.playCount ?? 0) + 1, lastPlayedAt: now }
            : t,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const setAudioEqPreset = useCallback(
    (eqPreset: AudioEqPreset) => {
      mutateWorkspace((prev) => ({
        ...prev,
        audioState: {
          ...(prev.audioState ?? DEFAULT_AUDIO_STATE),
          eqPreset,
        },
      }));
    },
    [mutateWorkspace],
  );

  // =========================================================================
  // Contacts CRM & Birthday Timeline Sync
  // =========================================================================

  const applyBirthdayEntrySync = (
    entries: Entry[],
    contact: ContactRecord,
  ): Entry[] => {
    const linkedId = `bday-${contact.id}`;
    const filtered = entries.filter((e) => e.id !== linkedId);
    if (!contact.syncBirthdayToTimeline || !contact.birthday) {
      return filtered;
    }
    const info = getNextOccurrenceInfo(contact.birthday);
    if (!info) return filtered;
    const displayName = getContactDisplayName(contact);
    const existing = entries.find((e) => e.id === linkedId);
    const ageText =
      info.turningAge !== null ? ` (Turns ${info.turningAge})` : "";
    const nowIso = new Date().toISOString();
    const syncedEntry: Entry = {
      id: linkedId,
      type: "event",
      title: `${displayName}'s Birthday${ageText}`,
      content: `<p>Synced from Contacts (${displayName}).</p>`,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      scheduledAt: buildDateAtTime(info.nextDateKey, 9, 0),
      completedAt: null,
      endAt: buildDateAtTime(info.nextDateKey, 10, 0),
      completed: false,
      focusBucket: null,
      source: "timeline",
      eventCategory: "personal",
      attendance: existing?.attendance ?? null,
      tags: ["birthday", "contacts"],
      sourceEntryId: contact.id,
    };
    return [syncedEntry, ...filtered];
  };

  const addContact = useCallback(
    (draft: Partial<ContactRecord> = {}): ContactRecord => {
      const id = draft.id || uid("cnt");
      const nowIso = new Date().toISOString();
      const firstName = draft.firstName ?? "";
      const lastName = draft.lastName ?? "";
      const seedName = `${firstName} ${lastName} ${draft.company || ""} ${id}`.trim();
      const created: ContactRecord = {
        id,
        firstName,
        lastName,
        nickname: draft.nickname,
        company: draft.company,
        jobTitle: draft.jobTitle,
        circleIds: Array.isArray(draft.circleIds) ? draft.circleIds : [],
        closeness: draft.closeness ?? "regular",
        tags: Array.isArray(draft.tags) ? draft.tags : [],
        favorite: Boolean(draft.favorite),
        phones: Array.isArray(draft.phones) ? draft.phones : [],
        emails: Array.isArray(draft.emails) ? draft.emails : [],
        socialHandles: Array.isArray(draft.socialHandles) ? draft.socialHandles : [],
        addresses: Array.isArray(draft.addresses) ? draft.addresses : [],
        customFields: Array.isArray(draft.customFields) ? draft.customFields : [],
        relationships: Array.isArray(draft.relationships) ? draft.relationships : [],
        checkInLogs: Array.isArray(draft.checkInLogs) ? draft.checkInLogs : [],
        birthday: draft.birthday ?? null,
        anniversary: draft.anniversary ?? null,
        syncBirthdayToTimeline: Boolean(draft.syncBirthdayToTimeline),
        lastContactedAt: draft.lastContactedAt ?? null,
        bioHtml: draft.bioHtml ?? "",
        avatarColor: draft.avatarColor || getDeterministicAvatarColor(seedName),
        hasLocalPhoto: Boolean(draft.hasLocalPhoto),
        createdAt: draft.createdAt || nowIso,
        updatedAt: nowIso,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        contacts: [created, ...(prev.contacts ?? [])],
        entries: applyBirthdayEntrySync(prev.entries, created),
      }));
      return created;
    },
    [mutateWorkspace],
  );

  const updateContact = useCallback(
    (id: string, patch: Partial<ContactRecord>) => {
      mutateWorkspace((prev) => {
        let updatedRecord: ContactRecord | null = null;
        const nextContacts = (prev.contacts ?? []).map((c) => {
          if (c.id !== id) return c;
          updatedRecord = {
            ...c,
            ...patch,
            updatedAt: new Date().toISOString(),
          };
          return updatedRecord;
        });
        const nextEntries = updatedRecord
          ? applyBirthdayEntrySync(prev.entries, updatedRecord)
          : prev.entries;
        return {
          ...prev,
          contacts: nextContacts,
          entries: nextEntries,
        };
      });
    },
    [mutateWorkspace],
  );

  const deleteContact = useCallback(
    (id: string) => {
      void contactPhotoDb.deletePhoto(id);
      mutateWorkspace((prev) => ({
        ...prev,
        contacts: (prev.contacts ?? [])
          .filter((c) => c.id !== id)
          .map((c) => ({
            ...c,
            relationships: c.relationships.filter((r) => r.targetContactId !== id),
          })),
        entries: prev.entries.filter((e) => e.id !== `bday-${id}`),
      }));
      pushToast("Contact deleted");
    },
    [mutateWorkspace, pushToast],
  );

  const importContacts = useCallback(
    (incoming: Partial<ContactRecord>[]): number => {
      if (incoming.length === 0) return 0;
      const nowIso = new Date().toISOString();
      let addedCount = 0;
      mutateWorkspace((prev) => {
        const existing = prev.contacts ?? [];
        const existingKeys = new Set(
          existing.map((c) =>
            `${getContactDisplayName(c).toLowerCase()}|${c.emails[0]?.value?.toLowerCase() || ""}|${c.phones[0]?.value || ""}`,
          ),
        );
        const additions: ContactRecord[] = [];
        for (const item of incoming) {
          const id = uid("cnt");
          const candidate: ContactRecord = {
            id,
            firstName: item.firstName ?? "",
            lastName: item.lastName ?? "",
            nickname: item.nickname,
            company: item.company,
            jobTitle: item.jobTitle,
            circleIds: Array.isArray(item.circleIds) ? item.circleIds : [],
            closeness: item.closeness ?? "regular",
            tags: Array.isArray(item.tags) ? item.tags : [],
            favorite: Boolean(item.favorite),
            phones: Array.isArray(item.phones) ? item.phones : [],
            emails: Array.isArray(item.emails) ? item.emails : [],
            socialHandles: Array.isArray(item.socialHandles) ? item.socialHandles : [],
            addresses: Array.isArray(item.addresses) ? item.addresses : [],
            customFields: Array.isArray(item.customFields) ? item.customFields : [],
            relationships: Array.isArray(item.relationships) ? item.relationships : [],
            checkInLogs: Array.isArray(item.checkInLogs) ? item.checkInLogs : [],
            birthday: item.birthday ?? null,
            anniversary: item.anniversary ?? null,
            syncBirthdayToTimeline: false,
            lastContactedAt: item.lastContactedAt ?? null,
            bioHtml: item.bioHtml ?? "",
            avatarColor:
              item.avatarColor ||
              getDeterministicAvatarColor(
                `${item.firstName || ""} ${item.lastName || ""} ${id}`,
              ),
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          const dedupKey = `${getContactDisplayName(candidate).toLowerCase()}|${candidate.emails[0]?.value?.toLowerCase() || ""}|${candidate.phones[0]?.value || ""}`;
          if (!existingKeys.has(dedupKey)) {
            existingKeys.add(dedupKey);
            additions.push(candidate);
          }
        }
        addedCount = additions.length;
        return {
          ...prev,
          contacts: [...additions, ...existing],
        };
      });
      return addedCount;
    },
    [mutateWorkspace],
  );

  const addContactCircle = useCallback(
    (name: string, color: string, description?: string): ContactCircle => {
      const nowIso = new Date().toISOString();
      const circle: ContactCircle = {
        id: uid("cir"),
        name: name.trim() || "Circle",
        color,
        description,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        contactCircles: [...(prev.contactCircles ?? []), circle],
      }));
      return circle;
    },
    [mutateWorkspace],
  );

  const updateContactCircle = useCallback(
    (id: string, patch: Partial<ContactCircle>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        contactCircles: (prev.contactCircles ?? []).map((c) =>
          c.id === id
            ? { ...c, ...patch, updatedAt: new Date().toISOString() }
            : c,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteContactCircle = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        contactCircles: (prev.contactCircles ?? []).filter((c) => c.id !== id),
        contacts: (prev.contacts ?? []).map((c) => ({
          ...c,
          circleIds: c.circleIds.filter((cid) => cid !== id),
        })),
      }));
      pushToast("Circle removed");
    },
    [mutateWorkspace, pushToast],
  );

  // =========================================================================
  // Personal Finance Tracker (Strictly Standalone)
  // =========================================================================

  const addFinanceAccount = useCallback(
    (
      draft: Omit<FinanceAccount, "id" | "createdAt" | "updatedAt">,
    ): FinanceAccount => {
      const nowIso = new Date().toISOString();
      const account: FinanceAccount = {
        ...draft,
        id: uid("facc"),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        financeAccounts: [...(prev.financeAccounts ?? []), account],
      }));
      return account;
    },
    [mutateWorkspace],
  );

  const updateFinanceAccount = useCallback(
    (id: string, patch: Partial<FinanceAccount>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        financeAccounts: (prev.financeAccounts ?? []).map((a) =>
          a.id === id
            ? { ...a, ...patch, updatedAt: new Date().toISOString() }
            : a,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteFinanceAccount = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        financeAccounts: (prev.financeAccounts ?? []).filter((a) => a.id !== id),
        financeTransactions: (prev.financeTransactions ?? []).filter(
          (tx) => tx.accountId !== id && tx.toAccountId !== id,
        ),
        financeSubscriptions: (prev.financeSubscriptions ?? []).filter(
          (s) => s.accountId !== id,
        ),
      }));
      pushToast("Account deleted");
    },
    [mutateWorkspace, pushToast],
  );

  const addFinanceCategory = useCallback(
    (
      draft: Omit<FinanceCategory, "id" | "createdAt" | "updatedAt">,
    ): FinanceCategory => {
      const nowIso = new Date().toISOString();
      const cat: FinanceCategory = {
        ...draft,
        id: uid("fcat"),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        financeCategories: [...(prev.financeCategories ?? []), cat],
      }));
      return cat;
    },
    [mutateWorkspace],
  );

  const updateFinanceCategory = useCallback(
    (id: string, patch: Partial<FinanceCategory>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        financeCategories: (prev.financeCategories ?? []).map((c) =>
          c.id === id
            ? { ...c, ...patch, updatedAt: new Date().toISOString() }
            : c,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteFinanceCategory = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        financeCategories: (prev.financeCategories ?? []).filter(
          (c) => c.id !== id,
        ),
        financeTransactions: (prev.financeTransactions ?? []).map((tx) =>
          tx.categoryId === id ? { ...tx, categoryId: null } : tx,
        ),
      }));
      pushToast("Category deleted");
    },
    [mutateWorkspace, pushToast],
  );

  const addFinanceTransaction = useCallback(
    (
      draft: Omit<FinanceTransaction, "id" | "createdAt" | "updatedAt">,
    ): FinanceTransaction => {
      const nowIso = new Date().toISOString();
      const tx: FinanceTransaction = {
        ...draft,
        id: uid("ftx"),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        financeTransactions: [tx, ...(prev.financeTransactions ?? [])],
      }));
      return tx;
    },
    [mutateWorkspace],
  );

  const updateFinanceTransaction = useCallback(
    (id: string, patch: Partial<FinanceTransaction>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        financeTransactions: (prev.financeTransactions ?? []).map((tx) =>
          tx.id === id
            ? { ...tx, ...patch, updatedAt: new Date().toISOString() }
            : tx,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteFinanceTransaction = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        financeTransactions: (prev.financeTransactions ?? []).filter(
          (tx) => tx.id !== id,
        ),
      }));
      pushToast("Transaction deleted");
    },
    [mutateWorkspace, pushToast],
  );

  const importFinanceTransactions = useCallback(
    (
      drafts: Omit<FinanceTransaction, "id" | "createdAt" | "updatedAt">[],
    ): number => {
      if (drafts.length === 0) return 0;
      const nowIso = new Date().toISOString();
      let inserted = 0;
      mutateWorkspace((prev) => {
        const existing = prev.financeTransactions ?? [];
        const sigs = new Set(
          existing.map(
            (tx) =>
              `${tx.dateKey}|${tx.type}|${tx.amount}|${tx.currency}|${tx.accountId}|${(tx.merchant || "").toLowerCase()}`,
          ),
        );
        const additions: FinanceTransaction[] = [];
        for (const d of drafts) {
          const sig = `${d.dateKey}|${d.type}|${d.amount}|${d.currency}|${d.accountId}|${(d.merchant || "").toLowerCase()}`;
          if (!sigs.has(sig)) {
            sigs.add(sig);
            additions.push({
              ...d,
              id: uid("ftx"),
              createdAt: nowIso,
              updatedAt: nowIso,
            });
          }
        }
        inserted = additions.length;
        return {
          ...prev,
          financeTransactions: [...additions, ...existing],
        };
      });
      return inserted;
    },
    [mutateWorkspace],
  );

  const addFinanceSubscription = useCallback(
    (
      draft: Omit<FinanceSubscription, "id" | "createdAt" | "updatedAt">,
    ): FinanceSubscription => {
      const nowIso = new Date().toISOString();
      const sub: FinanceSubscription = {
        ...draft,
        id: uid("fsub"),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        financeSubscriptions: [sub, ...(prev.financeSubscriptions ?? [])],
      }));
      return sub;
    },
    [mutateWorkspace],
  );

  const updateFinanceSubscription = useCallback(
    (id: string, patch: Partial<FinanceSubscription>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        financeSubscriptions: (prev.financeSubscriptions ?? []).map((s) =>
          s.id === id
            ? { ...s, ...patch, updatedAt: new Date().toISOString() }
            : s,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteFinanceSubscription = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        financeSubscriptions: (prev.financeSubscriptions ?? []).filter(
          (s) => s.id !== id,
        ),
      }));
      pushToast("Subscription removed");
    },
    [mutateWorkspace, pushToast],
  );

  const logFinanceSubscriptionNow = useCallback(
    (id: string, dateKey?: string) => {
      const nowIso = new Date().toISOString();
      const effectiveDate = dateKey || getTodayKey();
      let loggedName = "";
      mutateWorkspace((prev) => {
        const sub = (prev.financeSubscriptions ?? []).find((s) => s.id === id);
        if (!sub) return prev;
        loggedName = sub.name;
        const tx: FinanceTransaction = {
          id: uid("ftx"),
          type: "expense",
          amount: sub.amount,
          currency: sub.currency,
          accountId: sub.accountId,
          categoryId: sub.categoryId,
          merchant: sub.name,
          note: `Subscription renewal (${sub.billingCycle})`,
          dateKey: effectiveDate,
          timeHHMM: "09:00",
          subscriptionId: sub.id,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        const nextDue = advanceSubscriptionDueDate(
          sub.nextDueDate <= effectiveDate ? sub.nextDueDate : effectiveDate,
          sub.billingCycle,
        );
        return {
          ...prev,
          financeTransactions: [tx, ...(prev.financeTransactions ?? [])],
          financeSubscriptions: (prev.financeSubscriptions ?? []).map((s) =>
            s.id === id
              ? {
                  ...s,
                  lastLoggedDate: effectiveDate,
                  nextDueDate: nextDue > effectiveDate ? nextDue : advanceSubscriptionDueDate(effectiveDate, sub.billingCycle),
                  updatedAt: nowIso,
                }
              : s,
          ),
        };
      });
      if (loggedName) pushToast(`Logged "${loggedName}" renewal`, "success");
    },
    [mutateWorkspace, pushToast],
  );

  const skipFinanceSubscriptionCycle = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        financeSubscriptions: (prev.financeSubscriptions ?? []).map((s) =>
          s.id === id
            ? {
                ...s,
                nextDueDate: advanceSubscriptionDueDate(
                  s.nextDueDate,
                  s.billingCycle,
                ),
                updatedAt: new Date().toISOString(),
              }
            : s,
        ),
      }));
      pushToast("Skipped to next billing cycle");
    },
    [mutateWorkspace, pushToast],
  );

  const runDueFinanceSubscriptions = useCallback((): number => {
    const today = getTodayKey();
    const nowIso = new Date().toISOString();
    let count = 0;
    mutateWorkspace((prev) => {
      const subs = prev.financeSubscriptions ?? [];
      const existingTxs = prev.financeTransactions ?? [];
      const newTxs: FinanceTransaction[] = [];
      let changed = false;

      const updatedSubs = subs.map((sub) => {
        if (!sub.active || !sub.autoLog || sub.nextDueDate > today) {
          return sub;
        }
        let cursorDue = sub.nextDueDate;
        let guard = 0;
        let lastLogged = sub.lastLoggedDate ?? null;
        while (cursorDue <= today && guard < 12) {
          guard++;
          const alreadyLogged = existingTxs.some(
            (tx) => tx.subscriptionId === sub.id && tx.dateKey === cursorDue,
          ) || newTxs.some((tx) => tx.subscriptionId === sub.id && tx.dateKey === cursorDue);
          if (!alreadyLogged) {
            newTxs.push({
              id: uid("ftx"),
              type: "expense",
              amount: sub.amount,
              currency: sub.currency,
              accountId: sub.accountId,
              categoryId: sub.categoryId,
              merchant: sub.name,
              note: `Auto-logged subscription (${sub.billingCycle})`,
              dateKey: cursorDue,
              timeHHMM: "09:00",
              subscriptionId: sub.id,
              createdAt: nowIso,
              updatedAt: nowIso,
            });
            count++;
            lastLogged = cursorDue;
          }
          cursorDue = advanceSubscriptionDueDate(cursorDue, sub.billingCycle);
          changed = true;
        }
        return changed
          ? {
              ...sub,
              nextDueDate: cursorDue,
              lastLoggedDate: lastLogged,
              updatedAt: nowIso,
            }
          : sub;
      });

      if (!changed && newTxs.length === 0) return prev;
      return {
        ...prev,
        financeTransactions: [...newTxs, ...existingTxs],
        financeSubscriptions: updatedSubs,
      };
    });
    return count;
  }, [mutateWorkspace]);

  const updateFinanceSettings = useCallback(
    (patch: Partial<FinanceSettings>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        financeSettings: {
          ...(prev.financeSettings ?? DEFAULT_FINANCE_SETTINGS),
          ...patch,
        },
      }));
    },
    [mutateWorkspace],
  );

  // ==========================================================================
  // Languages (Standalone Absorption Studio)
  // ==========================================================================

  const setActiveLanguageId = useCallback(
    (languageId: string | null) => {
      mutateWorkspace((prev) => ({
        ...prev,
        languageActiveId: languageId,
      }));
    },
    [mutateWorkspace],
  );

  const addLanguageProfile = useCallback(
    (
      draft: Omit<LanguageProfile, "id" | "createdAt" | "updatedAt">,
    ): LanguageProfile => {
      const now = new Date().toISOString();
      const profile: LanguageProfile = {
        ...draft,
        id: uid("lang"),
        createdAt: now,
        updatedAt: now,
      };
      mutateWorkspace((prev) => ({
        ...prev,
        languages: [...(prev.languages ?? []), profile],
        languageActiveId: profile.id,
      }));
      return profile;
    },
    [mutateWorkspace],
  );

  const updateLanguageProfile = useCallback(
    (id: string, patch: Partial<LanguageProfile>) => {
      const now = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        languages: (prev.languages ?? []).map((lang) =>
          lang.id === id ? { ...lang, ...patch, updatedAt: now } : lang,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteLanguageProfile = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => {
        const nextLanguages = (prev.languages ?? []).filter((l) => l.id !== id);
        const nextActiveId =
          prev.languageActiveId === id
            ? (nextLanguages[0]?.id ?? null)
            : prev.languageActiveId;
        return {
          ...prev,
          languages: nextLanguages,
          languageDecks: (prev.languageDecks ?? []).filter(
            (d) => d.languageId !== id,
          ),
          languageItems: (prev.languageItems ?? []).filter(
            (item) => item.languageId !== id,
          ),
          languageDailyStats: (prev.languageDailyStats ?? []).filter(
            (s) => s.languageId !== id,
          ),
          languageActiveId: nextActiveId,
        };
      });
    },
    [mutateWorkspace],
  );

  const addLanguageDeck = useCallback(
    (draft: Omit<LanguageDeck, "id" | "createdAt">): LanguageDeck => {
      const deck: LanguageDeck = {
        ...draft,
        id: uid("ldeck"),
        createdAt: new Date().toISOString(),
      };
      mutateWorkspace((prev) => ({
        ...prev,
        languageDecks: [...(prev.languageDecks ?? []), deck],
      }));
      return deck;
    },
    [mutateWorkspace],
  );

  const updateLanguageDeck = useCallback(
    (id: string, patch: Partial<LanguageDeck>) => {
      mutateWorkspace((prev) => ({
        ...prev,
        languageDecks: (prev.languageDecks ?? []).map((d) =>
          d.id === id ? { ...d, ...patch } : d,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteLanguageDeck = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        languageDecks: (prev.languageDecks ?? []).filter((d) => d.id !== id),
        languageItems: (prev.languageItems ?? []).map((item) => ({
          ...item,
          deckIds: item.deckIds.filter((did) => did !== id),
        })),
      }));
    },
    [mutateWorkspace],
  );

  const addLanguageItem = useCallback(
    (
      draft: Omit<LanguageItem, "id" | "srs" | "createdAt" | "updatedAt"> & {
        srs?: LanguageItem["srs"];
      },
    ): LanguageItem => {
      const now = new Date().toISOString();
      const todayKey = getTodayKey();
      const item: LanguageItem = {
        ...draft,
        id: uid("litem"),
        srs: draft.srs ?? createInitialSrsState(todayKey),
        createdAt: now,
        updatedAt: now,
      };
      mutateWorkspace((prev) => {
        const stats = [...(prev.languageDailyStats ?? [])];
        const idx = stats.findIndex(
          (s) => s.dateKey === todayKey && s.languageId === item.languageId,
        );
        if (idx >= 0) {
          stats[idx] = {
            ...stats[idx],
            capturedCount: stats[idx].capturedCount + 1,
          };
        } else {
          stats.push({
            dateKey: todayKey,
            languageId: item.languageId,
            reviewedCount: 0,
            capturedCount: 1,
          });
        }
        return {
          ...prev,
          languageItems: [item, ...(prev.languageItems ?? [])],
          languageDailyStats: stats,
        };
      });
      return item;
    },
    [mutateWorkspace],
  );

  const updateLanguageItem = useCallback(
    (id: string, patch: Partial<LanguageItem>) => {
      const now = new Date().toISOString();
      mutateWorkspace((prev) => ({
        ...prev,
        languageItems: (prev.languageItems ?? []).map((item) =>
          item.id === id ? { ...item, ...patch, updatedAt: now } : item,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const deleteLanguageItem = useCallback(
    (id: string) => {
      mutateWorkspace((prev) => ({
        ...prev,
        languageItems: (prev.languageItems ?? []).filter(
          (item) => item.id !== id,
        ),
      }));
    },
    [mutateWorkspace],
  );

  const reviewLanguageItem = useCallback(
    (id: string, rating: LanguageSrsRating) => {
      const now = new Date().toISOString();
      const todayKey = getTodayKey();
      mutateWorkspace((prev) => {
        const existing = prev.languageItems ?? [];
        const target = existing.find((it) => it.id === id);
        if (!target) return prev;

        const nextSrs = applySm2Review(
          target.srs ?? createInitialSrsState(todayKey),
          rating,
          todayKey,
        );

        const nextItems = existing.map((it) =>
          it.id === id ? { ...it, srs: nextSrs, updatedAt: now } : it,
        );

        const stats = [...(prev.languageDailyStats ?? [])];
        const statIdx = stats.findIndex(
          (s) => s.dateKey === todayKey && s.languageId === target.languageId,
        );
        if (statIdx >= 0) {
          stats[statIdx] = {
            ...stats[statIdx],
            reviewedCount: stats[statIdx].reviewedCount + 1,
          };
        } else {
          stats.push({
            dateKey: todayKey,
            languageId: target.languageId,
            reviewedCount: 1,
            capturedCount: 0,
          });
        }

        return {
          ...prev,
          languageItems: nextItems,
          languageDailyStats: stats,
        };
      });
    },
    [mutateWorkspace],
  );

  const importLanguageItems = useCallback(
    (
      languageId: string,
      drafts: Array<
        Omit<
          LanguageItem,
          "id" | "languageId" | "srs" | "createdAt" | "updatedAt"
        >
      >,
    ): number => {
      if (drafts.length === 0) return 0;
      const now = new Date().toISOString();
      const todayKey = getTodayKey();
      const additions: LanguageItem[] = drafts.map((d) => ({
        ...d,
        id: uid("litem"),
        languageId,
        srs: createInitialSrsState(todayKey),
        createdAt: now,
        updatedAt: now,
      }));
      mutateWorkspace((prev) => {
        const stats = [...(prev.languageDailyStats ?? [])];
        const idx = stats.findIndex(
          (s) => s.dateKey === todayKey && s.languageId === languageId,
        );
        if (idx >= 0) {
          stats[idx] = {
            ...stats[idx],
            capturedCount: stats[idx].capturedCount + additions.length,
          };
        } else {
          stats.push({
            dateKey: todayKey,
            languageId,
            reviewedCount: 0,
            capturedCount: additions.length,
          });
        }
        return {
          ...prev,
          languageItems: [...additions, ...(prev.languageItems ?? [])],
          languageDailyStats: stats,
        };
      });
      return additions.length;
    },
    [mutateWorkspace],
  );

  // Settings & Workspace lifecycle
  const updateSettings = useCallback(
    (patch: Partial<WorkspaceSettings>) => {
      mutateWorkspace((prev) => {
        const nextSettings: WorkspaceSettings = {
          ...prev.settings,
          ...patch,
        };
        if ("navigation" in patch) {
          const sanitized = sanitizeNavigationSettings(patch.navigation);
          if (sanitized) {
            nextSettings.navigation = sanitized;
          } else {
            delete nextSettings.navigation;
          }
        }
        return {
          ...prev,
          settings: nextSettings,
        };
      });
    },
    [mutateWorkspace],
  );

  const updateGistConfig = useCallback(
    (patch: Partial<GistSyncConfig>) => {
      if (patch.lastDirection === "push" || patch.lastDirection === "pull") {
        autoPushDirtyRef.current = false;
        persistGistDirtyFlag(false);
        autoPushConflictRef.current = false;
        autoPushConflictToastShownRef.current = false;
        lastAutoPullConflictRemoteRef.current = null;
        clearAutoPushTimers();
        setAutoPushStatus((prev) => ({
          phase: "idle",
          secondsRemaining: null,
          hasPendingChanges: false,
          lastAutoPushedAt: prev.lastAutoPushedAt,
          conflictRemoteUpdatedAt: null,
          message: null,
        }));
        setAutoPullStatus((prev) => ({
          ...prev,
          phase: "idle",
          hasRemoteUpdate: false,
          message: null,
        }));
      }
      setGistConfig((prev) => ({ ...prev, ...patch }));
    },
    [clearAutoPushTimers],
  );

  const replaceWorkspace = useCallback(
    (
      next: KansoWorkspace,
      toastMessage?: string,
      options?: { preserveLocalLibrary?: boolean },
    ) => {
      const preserveLocalLibrary = options?.preserveLocalLibrary ?? false;
      if (preserveLocalLibrary) {
        suppressAutoPushDirtyRef.current = true;
      } else {
        hasUserMutatedRef.current = true;
      }
      const empty = createEmptyWorkspace();
      const { viewPreferences: incomingViewPrefs, ...cleanNext } = next;

      const normalizedLib = preserveLocalLibrary
        ? null
        : normalizeLibraryWorkspaceData({
            books: cleanNext.books,
            libraryFolders: cleanNext.libraryFolders,
            libraryCategories: cleanNext.libraryCategories,
            libraryViewFolders: cleanNext.libraryViewFolders,
            bookBookmarks: cleanNext.bookBookmarks,
            bookHighlights: cleanNext.bookHighlights,
          });

      const nextStreams = Array.isArray(cleanNext.streams)
        ? cleanNext.streams
        : [];
      const validPulledStreamIds = new Set(nextStreams.map((s) => s.id));

      setWorkspace((prev) => {
        const preservedStreamerState = normalizeStreamerState(
          prev.streamerState,
          validPulledStreamIds,
        );

        const nextEntriesRaw = migrateEntries(
          Array.isArray(cleanNext.entries) ? cleanNext.entries : [],
        );

        let finalEntries: Entry[];
        let finalBooks: BookRecord[];
        let finalLibraryFolders: LibraryFolder[];
        let finalLibraryCategories: LibraryCategory[];
        let finalLibraryViewFolders: LibraryViewFolder[];
        let finalBookBookmarks: BookBookmark[];
        let finalBookHighlights: BookHighlight[];

        if (preserveLocalLibrary) {
          // Leave the local device's Library and book-linked notes completely untouched
          const localBookNotes = prev.entries.filter(isBookLinkedNote);
          const remoteNonBookEntries = nextEntriesRaw.filter(
            (e) => !isBookLinkedNote(e),
          );
          finalEntries = [...localBookNotes, ...remoteNonBookEntries];
          finalBooks = prev.books;
          finalLibraryFolders = prev.libraryFolders ?? [];
          finalLibraryCategories = prev.libraryCategories ?? [];
          finalLibraryViewFolders = prev.libraryViewFolders ?? [];
          finalBookBookmarks = prev.bookBookmarks ?? [];
          finalBookHighlights = prev.bookHighlights ?? [];
        } else {
          const lib = normalizedLib!;
          const localBindingById = new Map<
            string,
            { storageMode: BookRecord["storageMode"]; externalUri?: string }
          >();
          const localBindingByHash = new Map<
            string,
            { storageMode: BookRecord["storageMode"]; externalUri?: string }
          >();
          for (const localBook of prev.books) {
            if (localBook.storageMode === "android-uri" && localBook.externalUri) {
              const binding = {
                storageMode: localBook.storageMode,
                externalUri: localBook.externalUri,
              };
              localBindingById.set(localBook.id, binding);
              if (localBook.fileHash) {
                localBindingByHash.set(localBook.fileHash, binding);
              }
            }
          }

          finalEntries = nextEntriesRaw;
          finalBooks = lib.books.map((remoteBook) => {
            const {
              externalUri: _foreignUri,
              storageMode: _foreignMode,
              ...cleanRemote
            } = remoteBook;
            const localBinding =
              localBindingById.get(remoteBook.id) ??
              (remoteBook.fileHash
                ? localBindingByHash.get(remoteBook.fileHash)
                : undefined);
            return localBinding ? { ...cleanRemote, ...localBinding } : cleanRemote;
          });
          finalLibraryFolders = lib.libraryFolders;
          finalLibraryCategories = lib.libraryCategories;
          finalLibraryViewFolders = lib.libraryViewFolders;
          finalBookBookmarks = lib.bookBookmarks;
          finalBookHighlights = lib.bookHighlights;
        }

        return purgeWorkspace({
          ...empty,
          ...cleanNext,
          version: 3,
          entries: finalEntries,
          scratchpads: Array.isArray(cleanNext.scratchpads)
            ? cleanNext.scratchpads
            : [],
          customTabs: Array.isArray(cleanNext.customTabs)
            ? cleanNext.customTabs
            : [],
          habitLogs: Array.isArray(cleanNext.habitLogs)
            ? cleanNext.habitLogs
            : [],
          noteNotebooks: Array.isArray(cleanNext.noteNotebooks)
            ? cleanNext.noteNotebooks
            : [],
          books: finalBooks,
          libraryFolders: finalLibraryFolders,
          libraryCategories: finalLibraryCategories,
          libraryViewFolders: finalLibraryViewFolders,
          bookBookmarks: finalBookBookmarks,
          bookHighlights: finalBookHighlights,
          audioTracks: preserveLocalLibrary
            ? prev.audioTracks ?? []
            : Array.isArray(cleanNext.audioTracks)
              ? cleanNext.audioTracks
              : [],
          audioFolders: preserveLocalLibrary
            ? prev.audioFolders ?? []
            : Array.isArray(cleanNext.audioFolders)
              ? cleanNext.audioFolders
              : [],
          audioPlaylists: preserveLocalLibrary
            ? prev.audioPlaylists ?? []
            : Array.isArray(cleanNext.audioPlaylists)
              ? cleanNext.audioPlaylists
              : [],
          audioMixPresets: preserveLocalLibrary
            ? prev.audioMixPresets ?? []
            : Array.isArray(cleanNext.audioMixPresets)
              ? cleanNext.audioMixPresets
              : [],
          audioState: preserveLocalLibrary
            ? prev.audioState ?? { ...DEFAULT_AUDIO_STATE }
            : normalizeAudioState(
                cleanNext.audioState,
                new Set(
                  (Array.isArray(cleanNext.audioTracks)
                    ? cleanNext.audioTracks
                    : []
                  ).map((t) => t.id),
                ),
              ),
          streams: nextStreams,
          streamFolders: Array.isArray(cleanNext.streamFolders)
            ? cleanNext.streamFolders
            : [],
          streamTopicIcons:
            cleanNext.streamTopicIcons &&
            typeof cleanNext.streamTopicIcons === "object"
              ? cleanNext.streamTopicIcons
              : {},
          streamTopicOrder: Array.isArray(cleanNext.streamTopicOrder)
            ? cleanNext.streamTopicOrder.filter(
                (t): t is string =>
                  typeof t === "string" && t.trim().length > 0,
              )
            : undefined,
          streamChannels:
            cleanNext.streamChannels &&
            typeof cleanNext.streamChannels === "object"
              ? cleanNext.streamChannels
              : {},
          streamPresets: Array.isArray(cleanNext.streamPresets)
            ? cleanNext.streamPresets
            : [],
          streamerState: preservedStreamerState,
          contacts: Array.isArray(cleanNext.contacts) ? cleanNext.contacts : [],
          contactCircles: Array.isArray(cleanNext.contactCircles)
            ? cleanNext.contactCircles
            : DEFAULT_CONTACT_CIRCLES.map((c) => ({ ...c })),
          financeAccounts: Array.isArray(cleanNext.financeAccounts)
            ? cleanNext.financeAccounts
            : [],
          financeCategories: Array.isArray(cleanNext.financeCategories)
            ? cleanNext.financeCategories
            : DEFAULT_FINANCE_CATEGORIES.map((c) => ({ ...c })),
          financeTransactions: Array.isArray(cleanNext.financeTransactions)
            ? cleanNext.financeTransactions
            : [],
          financeSubscriptions: Array.isArray(cleanNext.financeSubscriptions)
            ? cleanNext.financeSubscriptions
            : [],
          financeSettings: {
            ...DEFAULT_FINANCE_SETTINGS,
            ...(cleanNext.financeSettings || {}),
          },
          languages: Array.isArray(cleanNext.languages)
            ? cleanNext.languages
            : [],
          languageDecks: Array.isArray(cleanNext.languageDecks)
            ? cleanNext.languageDecks
            : [],
          languageItems: Array.isArray(cleanNext.languageItems)
            ? cleanNext.languageItems
            : [],
          languageDailyStats: Array.isArray(cleanNext.languageDailyStats)
            ? cleanNext.languageDailyStats
            : [],
          languageActiveId:
            typeof cleanNext.languageActiveId === "string" ||
            cleanNext.languageActiveId === null
              ? cleanNext.languageActiveId
              : (Array.isArray(cleanNext.languages)
                  ? cleanNext.languages[0]?.id ?? null
                  : null),
          settings: {
            ...empty.settings,
            ...(cleanNext.settings || {}),
            ...normalizeFontSettings(cleanNext.settings),
            timelineDisplayMode:
              cleanNext.settings?.timelineDisplayMode || "default",
            epubPrefs: {
              ...empty.settings.epubPrefs!,
              ...(cleanNext.settings?.epubPrefs || {}),
            },
            navigation: sanitizeNavigationSettings(
              cleanNext.settings?.navigation,
            ),
          },
        });
      });

      // Apply synced view preferences to localStorage and notify active views
      applySyncedViewPreferences(incomingViewPrefs);

      if (!preserveLocalLibrary && normalizedLib) {
        const validBookIds = new Set(normalizedLib.books.map((b) => b.id));
        const validAudioIds = new Set(
          (Array.isArray(cleanNext.audioTracks)
            ? cleanNext.audioTracks
            : []
          ).map((t) => t.id),
        );
        pruneMissingBookVoicePreferences(validBookIds);

        void (async () => {
          try {
            await Promise.all([
              libraryDb.replaceAllAnnotations(
                normalizedLib.bookBookmarks,
                normalizedLib.bookHighlights,
              ),
              libraryDb.pruneBookFiles(validBookIds),
              audioDb.pruneAudioFiles(validAudioIds),
            ]);
          } catch {
            // Ignore
          }
        })();
      }

      if (toastMessage) pushToast(toastMessage, "success");
    },
    [pushToast],
  );

  const purgeWorkspaceSection = useCallback(
    (
      toastMessage: string,
      updater: (prev: KansoWorkspace) => KansoWorkspace,
    ) => {
      mutateWorkspace(updater);
      if (toastMessage) pushToast(toastMessage, "success");
    },
    [mutateWorkspace, pushToast],
  );

  replaceWorkspaceRef.current = replaceWorkspace;

  const quickPushGist = useCallback(async (): Promise<boolean> => {
    if (latestGistSyncBusyRef.current !== null) return false;
    clearAutoPushTimers();
    latestGistSyncBusyRef.current = "push";
    setGistSyncBusy("push");
    try {
      const snapshot = latestWorkspaceRef.current;
      const result = await pushWorkspaceToGist(
        snapshot,
        latestGistConfigRef.current,
      );
      autoPushDirtyRef.current = false;
      persistGistDirtyFlag(false);
      autoPushConflictRef.current = false;
      autoPushConflictToastShownRef.current = false;
      lastAutoPullConflictRemoteRef.current = null;
      updateGistConfig({
        gistId: result.gistId,
        lastSyncedAt: result.updatedAt,
        lastRemoteUpdatedAt: result.updatedAt,
        lastDirection: "push",
      });
      pushToast(
        result.createdNew
          ? `Created Gist (${result.gistId.slice(0, 8)}…) & pushed`
          : "Pushed workspace to GitHub Gist",
        "success",
      );
      return true;
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "Gist push failed.",
        "error",
      );
      return false;
    } finally {
      latestGistSyncBusyRef.current = null;
      setGistSyncBusy(null);
    }
  }, [clearAutoPushTimers, updateGistConfig, pushToast]);

  const quickPullGist = useCallback(async (): Promise<boolean> => {
    if (latestGistSyncBusyRef.current !== null) return false;
    clearAutoPushTimers();
    clearAutoPullTimers();
    latestGistSyncBusyRef.current = "pull";
    setGistSyncBusy("pull");
    try {
      const preview = await pullWorkspaceFromGist(latestGistConfigRef.current);
      autoPushDirtyRef.current = false;
      persistGistDirtyFlag(false);
      autoPushConflictRef.current = false;
      autoPushConflictToastShownRef.current = false;
      lastAutoPullConflictRemoteRef.current = null;
      replaceWorkspace(
        preview.workspace,
        "Pulled workspace from GitHub Gist",
        { preserveLocalLibrary: true },
      );
      updateGistConfig({
        lastSyncedAt: preview.remoteUpdatedAt,
        lastRemoteUpdatedAt: preview.remoteUpdatedAt,
        lastDirection: "pull",
      });
      return true;
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "Gist pull failed.",
        "error",
      );
      return false;
    } finally {
      latestGistSyncBusyRef.current = null;
      setGistSyncBusy(null);
    }
  }, [clearAutoPullTimers, clearAutoPushTimers, replaceWorkspace, updateGistConfig, pushToast]);

  const clearWorkspaceData = useCallback(() => {
    hasUserMutatedRef.current = true;
    void libraryDb.clearAllData();
    if (typeof localStorage !== "undefined") {
      for (const key of VIEW_PREFERENCE_STORAGE_KEYS) {
        try {
          localStorage.removeItem(key);
        } catch {
          // Ignore
        }
      }
    }
    setWorkspace((prev) => ({
      ...createEmptyWorkspace(),
      settings: prev.settings,
      updatedAt: new Date().toISOString(),
    }));
    pushToast("Workspace cleared to a blank slate", "success");
  }, [pushToast]);

  const restoreSampleData = useCallback(() => {
    hasUserMutatedRef.current = true;
    const seeded = createSeedWorkspace();
    const validBookIds = new Set(seeded.books.map((b) => b.id));
    pruneMissingBookVoicePreferences(validBookIds);
    setWorkspace((prev) => ({
      ...seeded,
      settings: prev.settings,
      updatedAt: new Date().toISOString(),
    }));
    void Promise.all([
      libraryDb.replaceAllAnnotations(
        seeded.bookBookmarks ?? [],
        seeded.bookHighlights ?? [],
      ),
      libraryDb.pruneBookFiles(validBookIds),
    ]);
    pushToast("Sample workspace data restored", "success");
  }, [pushToast]);

  const toastContextValue = useMemo<ToastContextValue>(
    () => ({ toasts, dismissToast }),
    [toasts, dismissToast],
  );

  const gistSyncStatusValue = useMemo<GistSyncStatusContextValue>(
    () => ({
      gistSyncBusy,
      autoPushStatus,
      dismissAutoPushNotice,
      autoPullStatus,
      dismissAutoPullNotice,
      checkAutoPullNow,
    }),
    [
      gistSyncBusy,
      autoPushStatus,
      dismissAutoPushNotice,
      autoPullStatus,
      dismissAutoPullNotice,
      checkAutoPullNow,
    ],
  );

  const workspaceContextValue = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      gistConfig,
      pushToast,
      addFocusItem,
      moveFocusItem,
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
      duplicateEntry,
      moveEntryToDate,
      addScratchpad,
      updateScratchpad,
      reorderScratchpads,
      deleteScratchpad,
      sendScratchpadToTimeline,
      sendScratchpadToXActive,
      addCustomTab,
      updateCustomTab,
      deleteCustomTab,
      addNotePage,
      duplicateNotePage,
      deleteNotePage,
      archiveNotePage,
      addNoteNotebook,
      updateNoteNotebook,
      deleteNoteNotebook,
      reorderNoteNotebooks,
      reorderNoteEntries,
      addHabit,
      updateHabit,
      deleteHabit,
      toggleHabitCompletion,
      setHabitDayStatus,
      cycleHabitDayStatus,
      reorderHabits,
      addList,
      updateList,
      renameList,
      deleteList,
      reorderLists,
      addListItem,
      updateListItem,
      reorderListItems,
      deleteListItem,
      deleteListItems,
      linkNoteToListItem,
      unlinkNoteFromListItem,
      updateNoteListItemLinkQuote,
      addBook,
      updateBook,
      deleteBook,
      deleteBooks,
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
      reorderStreamFolders,
      deleteStreamFolder,
      setStreamTopicIcon,
      renameStreamTopic,
      reorderStreamTopics,
      resetStreamTopicOrder,
      updateStreamChannelMeta,
      reorderStreamChannels,
      renameOrMergeStreamChannels,
      batchUpdateStreamChannels,
      deleteStreamChannels,
      reorderActiveStreams,
      reorderVaultStreams,
      updateStreamerState,
      saveStreamPreset,
      loadStreamPreset,
      updateStreamPreset,
      updateStreamPresetMix,
      reorderStreamPresets,
      deleteStreamPreset,
      addAudioTrack,
      updateAudioTrack,
      deleteAudioTracks,
      addAudioFolder,
      updateAudioFolder,
      deleteAudioFolder,
      addAudioPlaylist,
      updateAudioPlaylist,
      deleteAudioPlaylist,
      addTracksToPlaylist,
      removeTrackFromPlaylist,
      reorderPlaylistTracks,
      reorderAudioTracks,
      updateAudioState,
      playAudioTrack,
      addAudioMixSlot,
      updateAudioMixSlot,
      updateAllAudioMixSlots,
      removeAudioMixSlot,
      clearAudioMixSlots,
      reorderAudioMixSlots,
      saveAudioMixPreset,
      loadAudioMixPreset,
      deleteAudioMixPreset,
      recordAudioPlay,
      setAudioEqPreset,
      addContact,
      updateContact,
      deleteContact,
      importContacts,
      addContactCircle,
      updateContactCircle,
      deleteContactCircle,
      addFinanceAccount,
      updateFinanceAccount,
      deleteFinanceAccount,
      addFinanceCategory,
      updateFinanceCategory,
      deleteFinanceCategory,
      addFinanceTransaction,
      updateFinanceTransaction,
      deleteFinanceTransaction,
      importFinanceTransactions,
      addFinanceSubscription,
      updateFinanceSubscription,
      deleteFinanceSubscription,
      logFinanceSubscriptionNow,
      skipFinanceSubscriptionCycle,
      runDueFinanceSubscriptions,
      updateFinanceSettings,
      setActiveLanguageId,
      addLanguageProfile,
      updateLanguageProfile,
      deleteLanguageProfile,
      addLanguageDeck,
      updateLanguageDeck,
      deleteLanguageDeck,
      addLanguageItem,
      updateLanguageItem,
      deleteLanguageItem,
      reviewLanguageItem,
      importLanguageItems,
      quickPushGist,
      quickPullGist,
      updateSettings,
      updateGistConfig,
      replaceWorkspace,
      purgeWorkspaceSection,
      clearWorkspaceData,
      restoreSampleData,
    }),
    [
      workspace,
      gistConfig,
      pushToast,
      addFocusItem,
      moveFocusItem,
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
      duplicateEntry,
      moveEntryToDate,
      addScratchpad,
      updateScratchpad,
      reorderScratchpads,
      deleteScratchpad,
      sendScratchpadToTimeline,
      sendScratchpadToXActive,
      addCustomTab,
      updateCustomTab,
      deleteCustomTab,
      addNotePage,
      duplicateNotePage,
      deleteNotePage,
      archiveNotePage,
      addNoteNotebook,
      updateNoteNotebook,
      deleteNoteNotebook,
      reorderNoteNotebooks,
      reorderNoteEntries,
      addHabit,
      updateHabit,
      deleteHabit,
      toggleHabitCompletion,
      setHabitDayStatus,
      cycleHabitDayStatus,
      reorderHabits,
      addList,
      updateList,
      renameList,
      deleteList,
      reorderLists,
      addListItem,
      updateListItem,
      reorderListItems,
      deleteListItem,
      deleteListItems,
      linkNoteToListItem,
      unlinkNoteFromListItem,
      updateNoteListItemLinkQuote,
      addBook,
      updateBook,
      deleteBook,
      deleteBooks,
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
      reorderStreamFolders,
      deleteStreamFolder,
      setStreamTopicIcon,
      renameStreamTopic,
      reorderStreamTopics,
      resetStreamTopicOrder,
      updateStreamChannelMeta,
      reorderStreamChannels,
      renameOrMergeStreamChannels,
      batchUpdateStreamChannels,
      deleteStreamChannels,
      reorderActiveStreams,
      reorderVaultStreams,
      updateStreamerState,
      saveStreamPreset,
      loadStreamPreset,
      updateStreamPreset,
      updateStreamPresetMix,
      reorderStreamPresets,
      deleteStreamPreset,
      addAudioTrack,
      updateAudioTrack,
      deleteAudioTracks,
      addAudioFolder,
      updateAudioFolder,
      deleteAudioFolder,
      addAudioPlaylist,
      updateAudioPlaylist,
      deleteAudioPlaylist,
      addTracksToPlaylist,
      removeTrackFromPlaylist,
      reorderPlaylistTracks,
      reorderAudioTracks,
      updateAudioState,
      playAudioTrack,
      addAudioMixSlot,
      updateAudioMixSlot,
      updateAllAudioMixSlots,
      removeAudioMixSlot,
      clearAudioMixSlots,
      reorderAudioMixSlots,
      saveAudioMixPreset,
      loadAudioMixPreset,
      deleteAudioMixPreset,
      recordAudioPlay,
      setAudioEqPreset,
      addContact,
      updateContact,
      deleteContact,
      importContacts,
      addContactCircle,
      updateContactCircle,
      deleteContactCircle,
      addFinanceAccount,
      updateFinanceAccount,
      deleteFinanceAccount,
      addFinanceCategory,
      updateFinanceCategory,
      deleteFinanceCategory,
      addFinanceTransaction,
      updateFinanceTransaction,
      deleteFinanceTransaction,
      importFinanceTransactions,
      addFinanceSubscription,
      updateFinanceSubscription,
      deleteFinanceSubscription,
      logFinanceSubscriptionNow,
      skipFinanceSubscriptionCycle,
      runDueFinanceSubscriptions,
      updateFinanceSettings,
      setActiveLanguageId,
      addLanguageProfile,
      updateLanguageProfile,
      deleteLanguageProfile,
      addLanguageDeck,
      updateLanguageDeck,
      deleteLanguageDeck,
      addLanguageItem,
      updateLanguageItem,
      deleteLanguageItem,
      reviewLanguageItem,
      importLanguageItems,
      quickPushGist,
      quickPullGist,
      updateSettings,
      updateGistConfig,
      replaceWorkspace,
      purgeWorkspaceSection,
      clearWorkspaceData,
      restoreSampleData,
    ],
  );

  return (
    <WorkspaceContext.Provider value={workspaceContextValue}>
      <GistSyncStatusContext.Provider value={gistSyncStatusValue}>
        <ToastContext.Provider value={toastContextValue}>
          {children}
        </ToastContext.Provider>
      </GistSyncStatusContext.Provider>
    </WorkspaceContext.Provider>
  );
};

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}

export function useWorkspaceToasts(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error(
      "useWorkspaceToasts must be used within a WorkspaceProvider",
    );
  }
  return ctx;
}

export function useGistSyncStatus(): GistSyncStatusContextValue {
  const ctx = useContext(GistSyncStatusContext);
  if (!ctx) {
    throw new Error("useGistSyncStatus must be used within a WorkspaceProvider");
  }
  return ctx;
}
