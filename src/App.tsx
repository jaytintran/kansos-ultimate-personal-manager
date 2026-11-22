import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CloudDownload,
  CloudUpload,
  Headphones,
  Loader2,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  RefreshCw,
  Settings,
  SkipBack,
  SkipForward,
  Sun,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { DetailSheet } from "./components/DetailSheet";
import { KansoLogo } from "./components/KansoLogo";
import {
  SettingsModalTab,
  SettingsSyncModal,
} from "./components/SettingsSyncModal";
import {
  TimestampFieldFocus,
  TimestampsModal,
} from "./components/TimestampsModal";
import {
  ContextMenuState,
  UniversalContextMenu,
} from "./components/UniversalContextMenu";
import { WorkspaceProvider, useWorkspace } from "./context/WorkspaceContext";
import {
  BookJumpRequest,
  BookNoteLink,
  ContextMenuRecord,
  DetailSheetTarget,
  ViewId,
} from "./types";
import { formatAudioDuration } from "./lib/audioFormatters";
import {
  resolveNavigationConfig,
  VIEW_META_MAP,
} from "./lib/viewNavigation";
import { getEntryDayKey, getTodayKey, isVisibleOnTimeline } from "./utils/date";
import { AchievementsView } from "./views/AchievementsView";
import {
  AudioControllerHandle,
  AudioPlaybackSummary,
  AudioView,
} from "./views/AudioView";
import { ContactsView } from "./views/ContactsView";
import { EventsView } from "./views/EventsView";
import { FinanceView } from "./views/FinanceView";
import { FocusView } from "./views/FocusView";
import { HabitsView } from "./views/HabitsView";
import { LibraryView } from "./views/LibraryView";
import { ListsView } from "./views/ListsView";
import { NotesView } from "./views/NotesView";
import {
  StreamerControllerHandle,
  StreamerPlaybackSummary,
  StreamerView,
} from "./views/StreamerView";
import { TimelineView } from "./views/TimelineView";

const NON_KEYBOARD_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "date",
  "datetime-local",
  "file",
  "hidden",
  "image",
  "month",
  "radio",
  "range",
  "reset",
  "submit",
  "time",
  "week",
]);

function isTextEditableElement(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) {
    return !el.readOnly && !el.disabled;
  }
  if (el instanceof HTMLInputElement) {
    if (el.readOnly || el.disabled) return false;
    return !NON_KEYBOARD_INPUT_TYPES.has((el.type || "text").toLowerCase());
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

const DESKTOP_SIDEBAR_COLLAPSED_KEY = "kanso_desktop_sidebar_collapsed_v1";

interface RailTooltipState {
  label: string;
  sublabel?: string;
  top: number;
}

const KansoShell: React.FC = () => {
  const {
    workspace,
    gistConfig,
    gistSyncBusy,
    quickPushGist,
    quickPullGist,
    toasts,
    dismissToast,
    pushToast,
    updateSettings,
  } = useWorkspace();
  const navConfig = useMemo(
    () => resolveNavigationConfig(workspace.settings.navigation),
    [workspace.settings.navigation],
  );
  const initialView: ViewId = navConfig.resolveSafeView(
    workspace.settings.defaultView,
  );
  const [activeView, setActiveView] = useState<ViewId>(initialView);

  // Track whether Library, Streamer, and Audio have ever been opened, so we can keep them mounted -> audio keeps running | book tabs persist
  const [hasVisitedStreamer, setHasVisitedStreamer] = useState(
    initialView === "streamer",
  );
  const [hasVisitedLibrary, setHasVisitedLibrary] = useState(
    initialView === "library",
  );
  const [hasVisitedAudio, setHasVisitedAudio] = useState(
    initialView === "audio",
  );

  const [streamerPlayback, setStreamerPlayback] =
    useState<StreamerPlaybackSummary>({
      activeCount: 0,
      playingCount: 0,
      isPlaying: false,
      isViewMuted: false,
      isAllPaused: false,
    });
  const streamerControllerRef = useRef<StreamerControllerHandle | null>(null);

  const [audioPlayback, setAudioPlayback] = useState<AudioPlaybackSummary>({
    activeCount: 0,
    playingCount: 0,
    isPlaying: false,
    isViewMuted: false,
    isAllPaused: false,
    primaryTrackId: null,
    primaryTitle: null,
    primaryArtist: null,
    primaryCoverDataUrl: null,
    currentTime: 0,
    duration: 0,
  });
  const [audioMiniCollapsed, setAudioMiniCollapsed] = useState(false);
  const audioControllerRef = useRef<AudioControllerHandle | null>(null);

  // Shared Global Systems: Polymorphic DetailSheet, UniversalContextMenu, TimestampsModal
  const [detailTarget, setDetailTarget] = useState<DetailSheetTarget | null>(
    null,
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [timestampsState, setTimestampsState] = useState<{
    entryId: string;
    focus?: TimestampFieldFocus;
  } | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [libraryZenMode, setLibraryZenMode] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<SettingsModalTab>("appearance");
  const [bookJumpRequest, setBookJumpRequest] =
    useState<BookJumpRequest | null>(null);
  const [isMobileKeyboardOpen, setIsMobileKeyboardOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState<boolean>(
    () => {
      try {
        return localStorage.getItem(DESKTOP_SIDEBAR_COLLAPSED_KEY) === "1";
      } catch {
        return false;
      }
    },
  );
  const [railTooltip, setRailTooltip] = useState<RailTooltipState | null>(null);
  const bookJumpNonceRef = useRef(0);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [activeView]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let usingNativeIme = false;
    let focusTimer: number | null = null;
    const baseline = {
      width: window.visualViewport?.width ?? window.innerWidth,
      height: window.visualViewport?.height ?? window.innerHeight,
    };

    const clearFocusTimer = () => {
      if (focusTimer !== null) {
        window.clearTimeout(focusTimer);
        focusTimer = null;
      }
    };

    const updateFallbackKeyboardState = () => {
      if (usingNativeIme) return;
      if (window.innerWidth >= 1024) {
        setIsMobileKeyboardOpen(false);
        return;
      }

      const vv = window.visualViewport;
      const currentWidth = vv?.width ?? window.innerWidth;
      const currentHeight = vv?.height ?? window.innerHeight;

      // Reset baseline on orientation/horizontal layout change; otherwise keep max height seen
      if (Math.abs(currentWidth - baseline.width) > 40) {
        baseline.width = currentWidth;
        baseline.height = currentHeight;
        setIsMobileKeyboardOpen(false);
        return;
      }
      if (currentHeight > baseline.height) {
        baseline.height = currentHeight;
      }

      const heightDrop = baseline.height - currentHeight;
      const editableFocused = isTextEditableElement(document.activeElement);

      if (heightDrop > 130 && editableFocused) {
        setIsMobileKeyboardOpen(true);
      } else if (heightDrop <= 100) {
        setIsMobileKeyboardOpen(false);
      }
    };

    const handleNativeImeChange = (event: Event) => {
      usingNativeIme = true;
      clearFocusTimer();
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      const open = Boolean(detail?.open) && window.innerWidth < 1024;
      setIsMobileKeyboardOpen(open);
    };

    const handleFocusIn = () => {
      if (usingNativeIme) return;
      clearFocusTimer();
      focusTimer = window.setTimeout(updateFallbackKeyboardState, 100);
    };

    const handleFocusOut = () => {
      if (usingNativeIme) return;
      clearFocusTimer();
      focusTimer = window.setTimeout(() => {
        if (!isTextEditableElement(document.activeElement)) {
          setIsMobileKeyboardOpen(false);
        } else {
          updateFallbackKeyboardState();
        }
      }, 120);
    };

    const handleWindowResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileKeyboardOpen(false);
        return;
      }
      if (!usingNativeIme) {
        updateFallbackKeyboardState();
      }
    };

    window.addEventListener("kanso:ime-change", handleNativeImeChange);
    window.addEventListener("resize", handleWindowResize);
    window.visualViewport?.addEventListener("resize", updateFallbackKeyboardState);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      clearFocusTimer();
      window.removeEventListener("kanso:ime-change", handleNativeImeChange);
      window.removeEventListener("resize", handleWindowResize);
      window.visualViewport?.removeEventListener(
        "resize",
        updateFallbackKeyboardState,
      );
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  const handleOpenContextMenu = useCallback(
    (record: ContextMenuRecord, e: React.MouseEvent) => {
      setContextMenu({
        record,
        x: e.clientX,
        y: e.clientY,
      });
    },
    [],
  );

  const handleOpenTimestamps = useCallback(
    (entryId: string, focus?: TimestampFieldFocus) => {
      setTimestampsState({ entryId, focus: focus ?? null });
    },
    [],
  );

  const navigateToView = useCallback((view: ViewId) => {
    if (view === "streamer") {
      setHasVisitedStreamer(true);
    }
    if (view === "library") {
      setHasVisitedLibrary(true);
    }
    if (view === "audio") {
      setHasVisitedAudio(true);
    }
    if (view !== "library") {
      setLibraryZenMode(false);
    }
    setActiveView(view);
  }, []);

  // Safely redirect if the active view is turned off (e.g. from Settings or a Gist pull)
  useEffect(() => {
    if (navConfig.hiddenSet.has(activeView)) {
      navigateToView(navConfig.resolveSafeView(workspace.settings.defaultView));
    }
  }, [navConfig, activeView, workspace.settings.defaultView, navigateToView]);

  const handleJumpToBookLocation = useCallback(
    (bookLink: BookNoteLink) => {
      const targetBook = bookLink.bookId
        ? workspace.books.find((b) => b.id === bookLink.bookId)
        : undefined;
      if (!targetBook) {
        pushToast("This book is no longer in your Library", "error");
        return;
      }
      setDetailTarget(null);
      setMoreSheetOpen(false);
      setHasVisitedLibrary(true);
      setActiveView("library");
      bookJumpNonceRef.current += 1;
      setBookJumpRequest({
        bookId: targetBook.id,
        unitIndex: bookLink.unitIndex,
        scrollRatio: bookLink.scrollRatio ?? 0,
        nonce: bookJumpNonceRef.current,
      });
    },
    [workspace.books, pushToast],
  );

  const handleMuteBackgroundStreamer = useCallback(() => {
    if (
      hasVisitedStreamer &&
      streamerPlayback.activeCount > 0 &&
      streamerPlayback.isPlaying &&
      !streamerPlayback.isViewMuted
    ) {
      streamerControllerRef.current?.toggleViewMute();
    }
  }, [hasVisitedStreamer, streamerPlayback]);

  const handleStreamerPlaybackChange = useCallback(
    (summary: StreamerPlaybackSummary) => {
      setStreamerPlayback(summary);
    },
    [],
  );

  const handleAudioPlaybackChange = useCallback(
    (summary: AudioPlaybackSummary) => {
      setAudioPlayback(summary);
    },
    [],
  );

  const showStreamerAudioControls =
    hasVisitedStreamer &&
    streamerPlayback.activeCount > 0 &&
    (streamerPlayback.isPlaying || streamerPlayback.isAllPaused);

  const showAudioStudioControls =
    hasVisitedAudio && audioPlayback.activeCount > 0;

  const todayKey = getTodayKey();

  const navCounts = useMemo(() => {
    const activeEntries = workspace.entries;
    const activeListsSet = new Set(workspace.lists.map((l) => l.id));
    const activeListItems = workspace.listItems.filter((i) =>
      activeListsSet.has(i.listId),
    );
    const activeHabits = workspace.habits;
    const activeFocus = activeEntries.filter(
      (e) =>
        (e.source === "focus-anchor" ||
          e.source === "focus-active" ||
          e.focusBucket === "anchor" ||
          e.focusBucket === "x-active") &&
        !e.completed,
    ).length;
    const todayTimeline = activeEntries.filter(
      (e) => isVisibleOnTimeline(e) && getEntryDayKey(e) === todayKey,
    ).length;
    const notesCount = activeEntries.filter(
      (e) => e.type === "note" && !e.archived && e.noteStatus !== "archived",
    ).length;
    const eventsCount = activeEntries.filter((e) => e.type === "event").length;
    const habitsTodayLeft = activeHabits.filter(
      (h) => !h.completions[todayKey],
    ).length;
    const achievementsCount =
      activeListItems.filter((i) => i.status === "done").length +
      activeEntries.filter(
        (e) => e.isAchievement && (e.type !== "task" || e.completed),
      ).length;
    const listsCount = activeListItems.length;
    const libraryCount = workspace.books.length;
    const streamerCount = workspace.streamerState.activeStreamIds.length;
    const audioCount = (workspace.audioTracks ?? []).length;
    const contactsCount = (workspace.contacts ?? []).length;
    const financeCount = (workspace.financeTransactions ?? []).length;

    return {
      focus: activeFocus,
      timeline: todayTimeline,
      habits: habitsTodayLeft,
      achievements: achievementsCount,
      notes: notesCount,
      events: eventsCount,
      lists: listsCount,
      library: libraryCount,
      streamer: streamerCount,
      audio: audioCount,
      contacts: contactsCount,
      finance: financeCount,
    };
  }, [
    workspace.entries,
    workspace.habits,
    workspace.lists,
    workspace.listItems,
    workspace.books.length,
    workspace.streamerState.activeStreamIds.length,
    workspace.audioTracks,
    workspace.contacts,
    workspace.financeTransactions,
    todayKey,
  ]);

  const toggleColorMode = () => {
    updateSettings({
      colorMode: workspace.settings.colorMode === "dark" ? "light" : "dark",
    });
  };

  const toggleDesktopSidebar = useCallback(() => {
    setRailTooltip(null);
    setDesktopSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(DESKTOP_SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Ignore storage write errors in restricted browsing contexts
      }
      return next;
    });
  }, []);

  const showRailTooltip = useCallback(
    (
      e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>,
      label: string,
      sublabel?: string,
    ) => {
      if (!desktopSidebarCollapsed) return;
      const rect = e.currentTarget.getBoundingClientRect();
      setRailTooltip({
        label,
        sublabel,
        top: rect.top + rect.height / 2,
      });
    },
    [desktopSidebarCollapsed],
  );

  const hideRailTooltip = useCallback(() => {
    setRailTooltip(null);
  }, []);

  const openModal = (tab: SettingsModalTab) => {
    setRailTooltip(null);
    setMoreSheetOpen(false);
    setSettingsInitialTab(tab);
    setSettingsOpen(true);
  };

  const hasGistToken = Boolean(gistConfig.token.trim());
  const hasGistId = Boolean(gistConfig.gistId.trim());
  const isGistConfigured = hasGistToken || hasGistId;
  const showNavCounts = workspace.settings.showNavCounts ?? true;

  const isMoreViewActive = navConfig.mobileMoreVisible.includes(activeView);
  const activeViewDef = VIEW_META_MAP[activeView];

  const isFixedHeightView =
    activeView === "streamer" ||
    activeView === "audio" ||
    activeView === "library" ||
    activeView === "lists" ||
    activeView === "timeline" ||
    activeView === "achievements" ||
    activeView === "contacts" ||
    activeView === "finance";

  return (
    <div
      className="h-dvh overflow-hidden overscroll-none flex flex-col lg:h-auto lg:min-h-dvh lg:overflow-visible lg:flex-row"
      style={{
        backgroundColor: "var(--bg-canvas)",
        color: "var(--text-primary)",
      }}
    >
      {/* Desktop Sidebar Navigation (Collapsible 240px ↔ 68px Icon Rail) */}
      {!(activeView === "library" && libraryZenMode) && (
        <aside
          className={`hidden lg:flex lg:flex-col lg:shrink-0 lg:sticky lg:top-0 lg:h-dvh border-r transition-[width,padding] duration-200 ease-out ${
            desktopSidebarCollapsed ? "lg:w-[68px] px-2 py-4" : "lg:w-60 px-3.5 py-5"
          }`}
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          {desktopSidebarCollapsed ? (
            <div className="flex flex-col items-center gap-2 pb-3.5 shrink-0">
              <div
                className="h-9 w-9 flex items-center justify-center rounded-xl"
                title="Kanso"
              >
                <KansoLogo size={24} />
              </div>
              <button
                type="button"
                onClick={toggleDesktopSidebar}
                onMouseEnter={(e) =>
                  showRailTooltip(e, "Expand sidebar", "Show labels")
                }
                onFocus={(e) =>
                  showRailTooltip(e, "Expand sidebar", "Show labels")
                }
                onMouseLeave={hideRailTooltip}
                onBlur={hideRailTooltip}
                className="w-10 h-8 flex items-center justify-center rounded-lg border transition-colors hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="px-2.5 pb-5 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <KansoLogo size={24} />
                <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">
                  Kanso
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={toggleColorMode}
                  className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  style={{ color: "var(--text-secondary)" }}
                  title={`Switch to ${workspace.settings.colorMode === "dark" ? "light" : "dark"} mode`}
                  aria-label="Toggle light or dark mode"
                >
                  {workspace.settings.colorMode === "dark" ? (
                    <Sun className="w-4 h-4" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={toggleDesktopSidebar}
                  className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  style={{ color: "var(--text-secondary)" }}
                  title="Collapse sidebar to icon rail"
                  aria-label="Collapse sidebar to icon rail"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <nav
            onScroll={desktopSidebarCollapsed ? hideRailTooltip : undefined}
            className={`flex-1 overflow-y-auto overflow-x-hidden ${
              desktopSidebarCollapsed ? "space-y-2.5" : "space-y-3"
            }`}
            aria-label="Main workspace navigation"
          >
            {navConfig.desktopGroupsVisible.map((groupIds, groupIdx) => (
              <div
                key={groupIdx}
                className={
                  groupIdx > 0
                    ? `${desktopSidebarCollapsed ? "pt-2.5" : "pt-3"} border-t space-y-1`
                    : "space-y-1"
                }
                style={
                  groupIdx > 0
                    ? { borderColor: "var(--border-subtle)" }
                    : undefined
                }
              >
                {groupIds.map((viewId) => {
                  const item = VIEW_META_MAP[viewId];
                  const Icon = item.icon;
                  const active = activeView === item.id;
                  const count = navCounts[item.id];
                  const isStreamerRowWithControls =
                    item.id === "streamer" && showStreamerAudioControls;
                  const isAudioRowWithControls =
                    item.id === "audio" && showAudioStudioControls;

                  if (desktopSidebarCollapsed) {
                    const hasMediaState =
                      isStreamerRowWithControls || isAudioRowWithControls;
                    const mediaMuted = isAudioRowWithControls
                      ? audioPlayback.isViewMuted
                      : streamerPlayback.isViewMuted;
                    const mediaPaused = isAudioRowWithControls
                      ? audioPlayback.isAllPaused
                      : streamerPlayback.isAllPaused;
                    const mediaPlaying = isAudioRowWithControls
                      ? audioPlayback.isPlaying
                      : streamerPlayback.isPlaying;
                    const mediaActiveCount = isAudioRowWithControls
                      ? audioPlayback.activeCount
                      : streamerPlayback.activeCount;

                    const mediaStatusLabel = hasMediaState
                      ? mediaMuted
                        ? `Muted · ${mediaActiveCount} active`
                        : mediaPlaying
                          ? `Playing · ${mediaActiveCount} active`
                          : mediaPaused
                            ? `Paused · ${mediaActiveCount} active`
                            : `${mediaActiveCount} active`
                      : undefined;

                    const tooltipSublabel = mediaStatusLabel
                      ? showNavCounts && count > 0
                        ? `${mediaStatusLabel} · ${count}`
                        : mediaStatusLabel
                      : showNavCounts
                        ? `${count} ${count === 1 ? "item" : "items"}`
                        : undefined;

                    const formattedBadge = count > 99 ? "99+" : String(count);

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigateToView(item.id)}
                        onMouseEnter={(e) =>
                          showRailTooltip(e, item.label, tooltipSublabel)
                        }
                        onFocus={(e) =>
                          showRailTooltip(e, item.label, tooltipSublabel)
                        }
                        onMouseLeave={hideRailTooltip}
                        onBlur={hideRailTooltip}
                        aria-label={
                          tooltipSublabel
                            ? `${item.label} (${tooltipSublabel})`
                            : item.label
                        }
                        aria-current={active ? "page" : undefined}
                        className="relative mx-auto w-11 h-11 flex items-center justify-center rounded-xl transition-colors hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] cursor-pointer"
                        style={{
                          backgroundColor: active
                            ? "var(--accent-soft)"
                            : "transparent",
                          color: active
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                        }}
                      >
                        <Icon className="w-[18px] h-[18px] shrink-0" />

                        {showNavCounts && count > 0 && (
                          <span
                            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-mono font-semibold tabular-nums leading-none flex items-center justify-center border pointer-events-none"
                            style={{
                              backgroundColor: active
                                ? "var(--accent)"
                                : "var(--bg-surface-subtle)",
                              color: active
                                ? "var(--accent-fg)"
                                : "var(--text-primary)",
                              borderColor: active
                                ? "var(--bg-surface)"
                                : "var(--border-strong)",
                            }}
                          >
                            {formattedBadge}
                          </span>
                        )}

                        {hasMediaState && (
                          <span
                            aria-hidden="true"
                            className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full ring-2 ring-[var(--bg-surface)] pointer-events-none"
                            style={{
                              backgroundColor: mediaMuted
                                ? "var(--danger)"
                                : mediaPlaying
                                  ? "var(--accent)"
                                  : "var(--warning)",
                            }}
                          />
                        )}
                      </button>
                    );
                  }

                  if (isStreamerRowWithControls || isAudioRowWithControls) {
                    const isAudioRow = isAudioRowWithControls;
                    const rowPaused = isAudioRow
                      ? audioPlayback.isAllPaused
                      : streamerPlayback.isAllPaused;
                    const rowMuted = isAudioRow
                      ? audioPlayback.isViewMuted
                      : streamerPlayback.isViewMuted;
                    const rowPlaying = isAudioRow
                      ? audioPlayback.isPlaying
                      : streamerPlayback.isPlaying;

                    return (
                      <div
                        key={item.id}
                        className="w-full flex items-center justify-between gap-1.5 pl-3 pr-2 py-1.5 rounded-xl text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: active
                            ? "var(--accent-soft)"
                            : "transparent",
                          color: active
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => navigateToView(item.id)}
                          className="flex items-center gap-2.5 min-w-0 flex-1 py-0.5 text-left whitespace-nowrap cursor-pointer"
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isAudioRow) {
                                audioControllerRef.current?.togglePauseAll();
                              } else {
                                streamerControllerRef.current?.togglePauseAll();
                              }
                            }}
                            className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                            style={{
                              color: rowPaused
                                ? "var(--accent)"
                                : "var(--text-secondary)",
                            }}
                            title={
                              isAudioRow
                                ? rowPaused
                                  ? "Resume audio"
                                  : "Pause audio"
                                : rowPaused
                                  ? "Resume all streams"
                                  : "Pause all streams"
                            }
                            aria-label={
                              isAudioRow
                                ? rowPaused
                                  ? "Resume audio"
                                  : "Pause audio"
                                : rowPaused
                                  ? "Resume all streams"
                                  : "Pause all streams"
                            }
                          >
                            {rowPaused ? (
                              <Play className="w-3.5 h-3.5" />
                            ) : (
                              <Pause className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isAudioRow) {
                                audioControllerRef.current?.toggleViewMute();
                              } else {
                                streamerControllerRef.current?.toggleViewMute();
                              }
                            }}
                            className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                            style={{
                              color: rowMuted
                                ? "var(--danger)"
                                : rowPlaying
                                  ? "var(--accent)"
                                  : "var(--text-secondary)",
                            }}
                            title={
                              isAudioRow
                                ? rowMuted
                                  ? "Unmute Audio"
                                  : "Mute Audio"
                                : rowMuted
                                  ? "Unmute Streamer"
                                  : "Temporarily mute Streamer"
                            }
                            aria-label={
                              isAudioRow
                                ? rowMuted
                                  ? "Unmute Audio"
                                  : "Mute Audio"
                                : rowMuted
                                  ? "Unmute Streamer"
                                  : "Temporarily mute Streamer"
                            }
                          >
                            {rowMuted ? (
                              <VolumeX className="w-3.5 h-3.5" />
                            ) : (
                              <Volume2 className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {showNavCounts && (
                            <span
                              className="text-xs font-mono tabular-nums pl-0.5 pr-0.5"
                              style={{
                                color: active
                                  ? "var(--accent)"
                                  : "var(--text-muted)",
                              }}
                            >
                              {count}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigateToView(item.id)}
                      className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                      style={{
                        backgroundColor: active
                          ? "var(--accent-soft)"
                          : "transparent",
                        color: active
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                      }}
                    >
                      <span className="flex items-center gap-2.5 whitespace-nowrap">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </span>
                      {showNavCounts && (
                        <span
                          className="text-xs font-mono tabular-nums"
                          style={{
                            color: active
                              ? "var(--accent)"
                              : "var(--text-muted)",
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Bottom Utility Dock */}
          {desktopSidebarCollapsed ? (
            <div
              className="pt-3 mt-2.5 border-t flex flex-col items-center gap-1.5 shrink-0"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <button
                type="button"
                onClick={() => openModal("sync")}
                onMouseEnter={(e) =>
                  showRailTooltip(
                    e,
                    "Gist Sync",
                    gistSyncBusy
                      ? gistSyncBusy === "push"
                        ? "Pushing..."
                        : "Pulling..."
                      : isGistConfigured
                        ? gistConfig.lastSyncedAt
                          ? `Synced ${new Date(gistConfig.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                          : "Configured"
                        : "Setup",
                  )
                }
                onFocus={(e) =>
                  showRailTooltip(
                    e,
                    "Gist Sync",
                    isGistConfigured ? "Configured" : "Setup",
                  )
                }
                onMouseLeave={hideRailTooltip}
                onBlur={hideRailTooltip}
                className="relative w-11 h-10 flex items-center justify-center rounded-xl border transition-colors hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
                aria-label="Open GitHub Gist Sync"
              >
                {gistSyncBusy !== null ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </button>

              <button
                type="button"
                onClick={() => openModal("appearance")}
                onMouseEnter={(e) =>
                  showRailTooltip(
                    e,
                    "Settings",
                    `${workspace.settings.theme} · ${workspace.settings.xActiveLimit}`,
                  )
                }
                onFocus={(e) =>
                  showRailTooltip(
                    e,
                    "Settings",
                    `${workspace.settings.theme} · ${workspace.settings.xActiveLimit}`,
                  )
                }
                onMouseLeave={hideRailTooltip}
                onBlur={hideRailTooltip}
                className="w-11 h-10 flex items-center justify-center rounded-xl border transition-colors hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--accent)",
                }}
                aria-label="Open Settings"
              >
                <Settings className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={toggleColorMode}
                onMouseEnter={(e) =>
                  showRailTooltip(
                    e,
                    workspace.settings.colorMode === "dark"
                      ? "Light Mode"
                      : "Dark Mode",
                    "Switch theme",
                  )
                }
                onFocus={(e) =>
                  showRailTooltip(
                    e,
                    workspace.settings.colorMode === "dark"
                      ? "Light Mode"
                      : "Dark Mode",
                    "Switch theme",
                  )
                }
                onMouseLeave={hideRailTooltip}
                onBlur={hideRailTooltip}
                className="w-11 h-10 flex items-center justify-center rounded-xl border transition-colors hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
                aria-label="Toggle light or dark mode"
              >
                {workspace.settings.colorMode === "dark" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>
            </div>
          ) : (
            <div
              className="pt-3.5 mt-3 border-t space-y-2 shrink-0"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              {/* Top Row: Gist Sync Bar */}
              {isGistConfigured ? (
                <div
                  className="flex items-center justify-between gap-1 p-1 rounded-xl border"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openModal("sync")}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium min-w-0 flex-1 text-left transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{ color: "var(--text-secondary)" }}
                    title={
                      gistConfig.lastSyncedAt
                        ? `Last ${gistConfig.lastDirection || "sync"}: ${new Date(gistConfig.lastSyncedAt).toLocaleString()}`
                        : "Configure GitHub Gist Sync"
                    }
                  >
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Gist Sync</span>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={gistSyncBusy !== null || !hasGistToken}
                      onClick={() => void quickPushGist()}
                      className="h-7 w-7 flex items-center justify-center rounded-lg border transition-colors hover:bg-[var(--bg-surface)] disabled:opacity-40 cursor-pointer"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }}
                      title={
                        hasGistToken
                          ? "Quick Push to GitHub Gist"
                          : "Add GitHub token in Gist Sync to push"
                      }
                      aria-label="Quick Push to GitHub Gist"
                    >
                      {gistSyncBusy === "push" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CloudUpload className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={gistSyncBusy !== null || !hasGistId}
                      onClick={() => void quickPullGist()}
                      className="h-7 w-7 flex items-center justify-center rounded-lg border transition-colors hover:bg-[var(--bg-surface)] disabled:opacity-40 cursor-pointer"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }}
                      title={
                        hasGistId
                          ? "Instant Pull from GitHub Gist"
                          : "Push once or add Gist ID to pull"
                      }
                      aria-label="Instant Pull from GitHub Gist"
                    >
                      {gistSyncBusy === "pull" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CloudDownload className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openModal("sync")}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-medium transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Gist Sync</span>
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>Setup</span>
                </button>
              )}

              {/* Bottom Row: Wide Settings Button */}
              <button
                type="button"
                onClick={() => openModal("appearance")}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              >
                <span className="flex items-center gap-2">
                  <Settings
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--accent)" }}
                  />
                  <span>Settings</span>
                </span>
                <span
                  className="text-[11px] font-normal capitalize"
                  style={{ color: "var(--text-muted)" }}
                >
                  {workspace.settings.theme} · {workspace.settings.xActiveLimit}
                </span>
              </button>
            </div>
          )}
        </aside>
      )}

      {/* Floating Desktop Rail Tooltip Overlay (unclipped outside <nav> scroll bounds) */}
      {desktopSidebarCollapsed &&
        railTooltip &&
        !settingsOpen &&
        !(activeView === "library" && libraryZenMode) && (
          <div
            role="tooltip"
            className="hidden lg:flex items-center gap-2 fixed left-[76px] -translate-y-1/2 z-50 pointer-events-none px-3 py-1.5 rounded-xl border whitespace-nowrap"
            style={{
              top: `${railTooltip.top}px`,
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              color: "var(--text-primary)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <span className="text-xs font-semibold">{railTooltip.label}</span>
            {railTooltip.sublabel && (
              <>
                <span
                  aria-hidden="true"
                  className="text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  ·
                </span>
                <span
                  className="text-[11px] font-mono tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  {railTooltip.sublabel}
                </span>
              </>
            )}
          </div>
        )}

      {/* Mobile Compact Top Bar */}
      <header
        className="lg:hidden shrink-0 z-30 pt-safe px-3 border-b"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="h-12 px-1 px-safe flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <KansoLogo size={22} />
            <span className="font-display text-base font-bold tracking-tight whitespace-nowrap">
              Kanso
            </span>
            {isMoreViewActive && activeViewDef && (
              <span
                className="text-xs mt-1 font-medium truncate"
                style={{ color: "var(--text-muted)" }}
              >
                · {activeViewDef.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleColorMode}
              className="h-9 w-9 flex items-center justify-center rounded-lg"
              style={{ color: "var(--text-secondary)" }}
              aria-label="Toggle color mode"
            >
              {workspace.settings.colorMode === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            {isGistConfigured ? (
              <>
                <button
                  type="button"
                  disabled={gistSyncBusy !== null || !hasGistToken}
                  onClick={() => void quickPushGist()}
                  className="h-9 w-9 flex items-center justify-center rounded-lg disabled:opacity-40"
                  style={{ color: "var(--text-secondary)" }}
                  aria-label="Quick Push to GitHub Gist"
                  title="Quick Push to GitHub Gist"
                >
                  {gistSyncBusy === "push" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CloudUpload className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  disabled={gistSyncBusy !== null || !hasGistId}
                  onClick={() => void quickPullGist()}
                  className="h-9 w-9 flex items-center justify-center rounded-lg disabled:opacity-40"
                  style={{ color: "var(--text-secondary)" }}
                  aria-label="Instant Pull from GitHub Gist"
                  title="Instant Pull from GitHub Gist"
                >
                  {gistSyncBusy === "pull" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CloudDownload className="w-4 h-4" />
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => openModal("sync")}
                className="h-9 w-9 flex items-center justify-center rounded-lg"
                style={{ color: "var(--text-secondary)" }}
                aria-label="GitHub Gist Sync"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => openModal("appearance")}
              className="h-9 w-9 flex items-center justify-center rounded-lg"
              style={{ color: "var(--text-secondary)" }}
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main
        ref={mainRef}
        className={`flex-1 min-w-0 min-h-0 overscroll-none ${
          isFixedHeightView
            ? "flex flex-col overflow-hidden lg:block lg:overflow-visible lg:pb-0"
            : "overflow-y-auto lg:overflow-visible lg:pb-8"
        }`}
      >
        {activeView === "focus" && (
          <FocusView
            onOpenDetail={setDetailTarget}
            onOpenContextMenu={handleOpenContextMenu}
          />
        )}
        {activeView === "timeline" && (
          <TimelineView
            onOpenDetail={setDetailTarget}
            onOpenContextMenu={handleOpenContextMenu}
            onOpenTimestamps={handleOpenTimestamps}
          />
        )}
        {activeView === "habits" && (
          <HabitsView onOpenDetail={setDetailTarget} />
        )}
        {activeView === "achievements" && (
          <AchievementsView
            onOpenDetail={setDetailTarget}
            onOpenContextMenu={handleOpenContextMenu}
          />
        )}
        {activeView === "notes" && (
          <NotesView
            onOpenDetail={setDetailTarget}
            onOpenContextMenu={handleOpenContextMenu}
            onJumpToBookLocation={handleJumpToBookLocation}
          />
        )}
        {activeView === "events" && (
          <EventsView
            onOpenDetail={setDetailTarget}
            onOpenContextMenu={handleOpenContextMenu}
          />
        )}
        {activeView === "lists" && (
          <ListsView
            onOpenDetail={setDetailTarget}
            onOpenContextMenu={handleOpenContextMenu}
          />
        )}
        {activeView === "contacts" && <ContactsView />}
        {activeView === "finance" && <FinanceView />}
        {hasVisitedLibrary && (
          <div
            className={
              activeView === "library"
                ? "flex-1 min-h-0 h-full w-full flex flex-col lg:block"
                : "fixed -left-[9999px] top-0 w-[1024px] h-[600px] opacity-0 pointer-events-none select-none overflow-hidden"
            }
            aria-hidden={activeView !== "library"}
          >
            <LibraryView
              zenMode={libraryZenMode}
              onToggleZenMode={() => setLibraryZenMode((z) => !z)}
              onExitZenMode={() => setLibraryZenMode(false)}
              onMuteBackgroundStreamer={handleMuteBackgroundStreamer}
              isActiveView={activeView === "library"}
              jumpRequest={bookJumpRequest}
              onOpenDetail={setDetailTarget}
            />
          </div>
        )}
        {hasVisitedStreamer && (
          <div
            className={
              activeView === "streamer"
                ? "flex-1 min-h-0 h-full w-full flex flex-col lg:block"
                : "fixed -left-[9999px] top-0 w-[1024px] h-[600px] opacity-0 pointer-events-none select-none overflow-hidden"
            }
            aria-hidden={activeView !== "streamer"}
          >
            <StreamerView
              ref={streamerControllerRef}
              isActiveView={activeView === "streamer"}
              onPlaybackStateChange={handleStreamerPlaybackChange}
            />
          </div>
        )}
        {hasVisitedAudio && (
          <div
            className={
              activeView === "audio"
                ? "flex-1 min-h-0 h-full w-full flex flex-col lg:block"
                : "fixed -left-[9999px] top-0 w-[1024px] h-[600px] opacity-0 pointer-events-none select-none overflow-hidden"
            }
            aria-hidden={activeView !== "audio"}
          >
            <AudioView
              ref={audioControllerRef}
              isActiveView={activeView === "audio"}
              onPlaybackStateChange={handleAudioPlaybackChange}
            />
          </div>
        )}
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation (hidden cleanly while typing on soft keyboard) */}
      {!isMobileKeyboardOpen && (
        <nav
          className="lg:hidden shrink-0 z-30 border-t pb-safe"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
          aria-label="Mobile workspace navigation"
        >
        <div
          className="h-15 grid items-center px-1 px-safe"
          style={{
            gridTemplateColumns: `repeat(${navConfig.mobilePrimaryVisible.length + 1}, minmax(0, 1fr))`,
          }}
        >
          {navConfig.mobilePrimaryVisible.map((id) => {
            const item = VIEW_META_MAP[id];
            const Icon = item.icon;
            const active = activeView === item.id && !moreSheetOpen;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMoreSheetOpen(false);
                  navigateToView(item.id);
                }}
                className="flex flex-col items-center justify-center h-full gap-0.5 transition-colors"
                style={{
                  color: active ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                <Icon className="w-4.5 h-4.5" />
                <span className="text-[10px] font-medium leading-none truncate max-w-full px-0.5">
                  {item.label}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreSheetOpen((prev) => !prev)}
            className="flex flex-col items-center justify-center h-full gap-0.5 transition-colors"
            style={{
              color:
                moreSheetOpen ||
                isMoreViewActive ||
                (showStreamerAudioControls && streamerPlayback.isPlaying) ||
                (showAudioStudioControls && audioPlayback.isPlaying)
                  ? (streamerPlayback.isViewMuted || audioPlayback.isViewMuted) &&
                    !moreSheetOpen &&
                    !isMoreViewActive
                    ? "var(--danger)"
                    : "var(--accent)"
                  : "var(--text-muted)",
            }}
            aria-expanded={moreSheetOpen}
            aria-label="More views"
          >
            {(showAudioStudioControls && activeView !== "audio") ||
            (showStreamerAudioControls && activeView !== "streamer") ? (
              (showAudioStudioControls && audioPlayback.isViewMuted) ||
              (showStreamerAudioControls && streamerPlayback.isViewMuted) ? (
                <VolumeX className="w-4.5 h-4.5" />
              ) : (showAudioStudioControls && !audioPlayback.isPlaying) ||
                (showStreamerAudioControls && streamerPlayback.isAllPaused) ? (
                <Pause className="w-4.5 h-4.5" />
              ) : (
                <Volume2 className="w-4.5 h-4.5" />
              )
            ) : (
              <MoreHorizontal className="w-4.5 h-4.5" />
            )}
            <span className="text-[10px] font-medium leading-none">
              {isMoreViewActive && activeViewDef ? activeViewDef.label : "More"}
            </span>
          </button>
        </div>
        </nav>
      )}

      {/* Mobile "More" Slide-Up Bottom Sheet */}
      {moreSheetOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 flex items-end"
          role="dialog"
          aria-modal="true"
          aria-label="More Kanso views"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setMoreSheetOpen(false)}
            aria-hidden="true"
          />
          <div
            className="relative z-10 w-full rounded-t-2xl border-t pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-2.5 px-4 space-y-4 overscroll-none"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-subtle)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div className="flex justify-center">
              <span
                className="w-10 h-1 rounded-full"
                style={{ backgroundColor: "var(--border-strong)" }}
                aria-hidden="true"
              />
            </div>

            <div className="flex items-center justify-between px-1">
              <span className="font-display text-sm font-bold">More Views</span>
              <button
                type="button"
                onClick={() => setMoreSheetOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg"
                style={{ color: "var(--text-muted)" }}
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {navConfig.mobileMoreVisible.length === 0 ? (
              <div
                className="p-4 rounded-xl border text-center text-xs"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-muted)",
                }}
              >
                No additional views in More. Customize views in Settings → Views.
              </div>
            ) : (
            <div className="grid grid-cols-2 gap-2.5 max-h-[50dvh] overflow-y-auto">
              {navConfig.mobileMoreVisible.map((id) => {
                const item = VIEW_META_MAP[id];
                const Icon = item.icon;
                const active = activeView === item.id;
                const count = navCounts[item.id];
                const isStreamerCardWithControls =
                  item.id === "streamer" && showStreamerAudioControls;
                const isAudioCardWithControls =
                  item.id === "audio" && showAudioStudioControls;

                if (isStreamerCardWithControls || isAudioCardWithControls) {
                  const isAudioCard = isAudioCardWithControls;
                  const cardPaused = isAudioCard
                    ? audioPlayback.isAllPaused
                    : streamerPlayback.isAllPaused;
                  const cardMuted = isAudioCard
                    ? audioPlayback.isViewMuted
                    : streamerPlayback.isViewMuted;

                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl border text-left transition-colors flex flex-col justify-between gap-2 min-h-[76px]"
                      style={{
                        backgroundColor: active
                          ? "var(--accent-soft)"
                          : "var(--bg-surface)",
                        borderColor: active
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <Icon
                          className="w-4.5 h-4.5 shrink-0"
                          style={{
                            color: active
                              ? "var(--accent)"
                              : "var(--text-secondary)",
                          }}
                        />
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (isAudioCard) {
                                audioControllerRef.current?.togglePauseAll();
                              } else {
                                streamerControllerRef.current?.togglePauseAll();
                              }
                            }}
                            className="h-8 w-8 flex items-center justify-center rounded-lg border transition-colors"
                            style={{
                              backgroundColor: "var(--bg-surface-subtle)",
                              borderColor: "var(--border-subtle)",
                              color: cardPaused
                                ? "var(--accent)"
                                : "var(--text-secondary)",
                            }}
                            aria-label={
                              isAudioCard
                                ? cardPaused
                                  ? "Resume audio"
                                  : "Pause audio"
                                : cardPaused
                                  ? "Resume all streams"
                                  : "Pause all streams"
                            }
                          >
                            {cardPaused ? (
                              <Play className="w-3.5 h-3.5" />
                            ) : (
                              <Pause className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (isAudioCard) {
                                audioControllerRef.current?.toggleViewMute();
                              } else {
                                streamerControllerRef.current?.toggleViewMute();
                              }
                            }}
                            className="h-8 w-8 flex items-center justify-center rounded-lg border transition-colors"
                            style={{
                              backgroundColor: "var(--bg-surface-subtle)",
                              borderColor: cardMuted
                                ? "var(--danger)"
                                : "var(--border-subtle)",
                              color: cardMuted
                                ? "var(--danger)"
                                : "var(--accent)",
                            }}
                            aria-label={
                              isAudioCard
                                ? cardMuted
                                  ? "Unmute Audio"
                                  : "Mute Audio"
                                : cardMuted
                                  ? "Unmute Streamer"
                                  : "Temporarily mute Streamer"
                            }
                          >
                            {cardMuted ? (
                              <VolumeX className="w-3.5 h-3.5" />
                            ) : (
                              <Volume2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigateToView(item.id);
                          setMoreSheetOpen(false);
                        }}
                        className="text-left"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className="text-sm font-semibold leading-tight"
                            style={{
                              color: active
                                ? "var(--accent)"
                                : "var(--text-primary)",
                            }}
                          >
                            {item.label}
                          </span>
                          {showNavCounts && (
                            <span
                              className="text-xs font-mono tabular-nums"
                              style={{
                                color: active
                                  ? "var(--accent)"
                                  : "var(--text-muted)",
                              }}
                            >
                              {count}
                            </span>
                          )}
                        </div>
                        <div
                          className="text-[11px] mt-0.5 line-clamp-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {cardMuted
                            ? "Muted in background"
                            : cardPaused
                              ? "Paused in background"
                              : "Playing in background"}
                        </div>
                      </button>
                    </div>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      navigateToView(item.id);
                      setMoreSheetOpen(false);
                    }}
                    className="p-3.5 rounded-xl border text-left transition-colors flex flex-col gap-2 min-h-[76px]"
                    style={{
                      backgroundColor: active
                        ? "var(--accent-soft)"
                        : "var(--bg-surface)",
                      borderColor: active
                        ? "var(--accent)"
                        : "var(--border-subtle)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <Icon
                        className="w-4.5 h-4.5"
                        style={{
                          color: active
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                        }}
                      />
                      {showNavCounts && (
                        <span
                          className="text-xs font-mono tabular-nums"
                          style={{
                            color: active
                              ? "var(--accent)"
                              : "var(--text-muted)",
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </div>
                    <div>
                      <div
                        className="text-sm font-semibold leading-tight"
                        style={{
                          color: active
                            ? "var(--accent)"
                            : "var(--text-primary)",
                        }}
                      >
                        {item.label}
                      </div>
                      <div
                        className="text-[11px] mt-0.5 line-clamp-1"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {item.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            )}

            {/* Mobile Option 1 Utility Dock: Top Sync Bar + Bottom Wide Settings */}
            <div
              className="pt-3 border-t space-y-2"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              {isGistConfigured ? (
                <div
                  className="flex items-center justify-between gap-1.5 p-1.5 rounded-xl border"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openModal("sync")}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium min-w-0 flex-1 text-left"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Gist Sync</span>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={gistSyncBusy !== null || !hasGistToken}
                      onClick={() => void quickPushGist()}
                      className="h-9 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {gistSyncBusy === "push" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CloudUpload className="w-3.5 h-3.5" />
                      )}
                      <span>Push</span>
                    </button>

                    <button
                      type="button"
                      disabled={gistSyncBusy !== null || !hasGistId}
                      onClick={() => void quickPullGist()}
                      className="h-9 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {gistSyncBusy === "pull" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CloudDownload className="w-3.5 h-3.5" />
                      )}
                      <span>Pull</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openModal("sync")}
                  className="w-full h-11 px-3.5 rounded-xl border text-xs font-medium flex items-center justify-between"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Gist Sync</span>
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>Setup</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => openModal("appearance")}
                className="w-full h-11 px-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              >
                <span className="flex items-center gap-2">
                  <Settings
                    className="w-4 h-4"
                    style={{ color: "var(--accent)" }}
                  />
                  <span>Settings</span>
                </span>
                <span
                  className="text-[11px] font-normal"
                  style={{ color: "var(--text-muted)" }}
                >
                  Theme · Views · Workspace
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Polymorphic DetailSheet (all 6 modes) */}
      <DetailSheet
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        onOpenTimestamps={(entryId, focus) =>
          handleOpenTimestamps(entryId, focus ?? null)
        }
        onJumpToBookLocation={handleJumpToBookLocation}
      />

      {/* Universal Context Menu */}
      <UniversalContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onOpenDetail={setDetailTarget}
        onOpenTimestamps={(entryId) => handleOpenTimestamps(entryId, null)}
      />

      {/* Timestamps Modal */}
      <TimestampsModal
        entryId={timestampsState?.entryId ?? null}
        initialFocus={timestampsState?.focus ?? null}
        onClose={() => setTimestampsState(null)}
      />

      {/* Slim Global Background Audio Mini-Player outside Audio view */}
      {activeView !== "audio" &&
        hasVisitedAudio &&
        audioPlayback.activeCount > 0 &&
        !isMobileKeyboardOpen && (
          <div
            role="region"
            aria-label="Background Audio Mini-Player"
            className={`fixed bottom-[4.5rem] lg:bottom-4 right-3 z-40 rounded-xl border transition-all ${
              audioMiniCollapsed
                ? "w-auto max-w-[calc(100vw-1.5rem)]"
                : "left-3 sm:left-auto sm:w-[390px]"
            }`}
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div className="flex items-center justify-between gap-2 px-2.5 py-2">
              <button
                type="button"
                onClick={() => navigateToView("audio")}
                className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                title="Open Audio Studio"
              >
                {audioPlayback.primaryCoverDataUrl ? (
                  <img
                    src={audioPlayback.primaryCoverDataUrl}
                    alt={audioPlayback.primaryTitle || "Audio"}
                    className="w-8 h-8 rounded-lg object-cover shrink-0 border border-[var(--border-subtle)]"
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: "var(--accent-soft)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--accent)",
                    }}
                  >
                    <Headphones className="w-4 h-4" />
                  </div>
                )}

                {!audioMiniCollapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold truncate text-[var(--text-primary)]">
                      {audioPlayback.primaryTitle || "Kanso Audio"}
                      {audioPlayback.activeCount > 1
                        ? ` (+${audioPlayback.activeCount - 1})`
                        : ""}
                    </div>
                    <div className="text-[11px] truncate text-[var(--text-muted)] font-mono tabular-nums">
                      {audioPlayback.primaryArtist || "Audio Studio"} ·{" "}
                      {formatAudioDuration(audioPlayback.currentTime)}
                      {audioPlayback.duration > 0
                        ? ` / ${formatAudioDuration(audioPlayback.duration)}`
                        : ""}
                    </div>
                  </div>
                )}
              </button>

              <div className="flex items-center gap-0.5 shrink-0">
                {!audioMiniCollapsed && (
                  <button
                    type="button"
                    onClick={() => audioControllerRef.current?.prevTrack()}
                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] cursor-pointer"
                    aria-label="Previous audio track"
                    title="Previous track"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => audioControllerRef.current?.togglePauseAll()}
                  className="h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                  aria-label={
                    audioPlayback.isAllPaused ? "Play audio" : "Pause audio"
                  }
                  title={audioPlayback.isAllPaused ? "Play" : "Pause"}
                >
                  {audioPlayback.isAllPaused ? (
                    <Play className="w-3.5 h-3.5 ml-0.5" />
                  ) : (
                    <Pause className="w-3.5 h-3.5" />
                  )}
                </button>

                {!audioMiniCollapsed && (
                  <>
                    <button
                      type="button"
                      onClick={() => audioControllerRef.current?.nextTrack()}
                      className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] cursor-pointer"
                      aria-label="Next audio track"
                      title="Next track"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        audioControllerRef.current?.toggleViewMute()
                      }
                      className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                      style={{
                        color: audioPlayback.isViewMuted
                          ? "var(--danger)"
                          : "var(--text-secondary)",
                      }}
                      aria-label={
                        audioPlayback.isViewMuted ? "Unmute audio" : "Mute audio"
                      }
                      title={audioPlayback.isViewMuted ? "Unmute" : "Mute"}
                    >
                      {audioPlayback.isViewMuted ? (
                        <VolumeX className="w-3.5 h-3.5" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setAudioMiniCollapsed((c) => !c)}
                  className="h-8 w-7 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] cursor-pointer"
                  aria-label={
                    audioMiniCollapsed
                      ? "Expand audio mini-player"
                      : "Collapse audio mini-player"
                  }
                  title={audioMiniCollapsed ? "Expand" : "Minimize"}
                >
                  {audioMiniCollapsed ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Themes, Settings & GitHub Gist Sync Modal */}
      <SettingsSyncModal
        open={settingsOpen}
        initialTab={settingsInitialTab}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Non-intrusive Toast Feedback */}
      {toasts.length > 0 && (
        <div
          className="fixed bottom-36 lg:bottom-24 right-4 sm:right-6 z-[80] flex flex-col gap-2 max-w-sm"
          aria-live="polite"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-xs font-medium"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor:
                  toast.tone === "error"
                    ? "var(--danger)"
                    : toast.tone === "success"
                      ? "var(--accent)"
                      : "var(--border-strong)",
                color:
                  toast.tone === "error"
                    ? "var(--danger)"
                    : "var(--text-primary)",
                boxShadow: "var(--shadow-popover)",
              }}
            >
              <span>{toast.text}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="opacity-70 hover:opacity-100 shrink-0"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <WorkspaceProvider>
      <KansoShell />
    </WorkspaceProvider>
  );
}
