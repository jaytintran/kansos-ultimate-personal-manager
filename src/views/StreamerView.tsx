import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Bookmark, FolderKanban, LayoutGrid } from "lucide-react";
import { StreamEditorDrawer } from "../components/streamer/StreamEditorDrawer";
import { StreamerStudioSidebar } from "../components/streamer/StreamerStudioSidebar";
import {
  StreamerSubView,
  StreamerTopBar,
} from "../components/streamer/StreamerTopBar";
import { StreamerTransportBar } from "../components/streamer/StreamerTransportBar";
import { StreamSlotCard } from "../components/streamer/StreamSlotCard";
import { StreamVaultView } from "../components/streamer/StreamVaultView";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  StackSlot,
  StreamItem,
  StreamLayoutMode,
  StreamSizingMode,
  StreamViewMode,
} from "../types";
import {
  isAndroidCapacitor,
  subscribeAndroidMediaControls,
  syncAndroidBackgroundAudio,
} from "../utils/androidSaf";
import {
  fetchYouTubeMetadata,
  parseYouTubeUrl,
  parseYouTubeMessage,
  registerYouTubeListener,
  sendYouTubeCommand,
} from "../utils/youtube";

export interface StreamerPlaybackSummary {
  activeCount: number;
  playingCount: number;
  isPlaying: boolean;
  isViewMuted: boolean;
  isAllPaused: boolean;
  primaryTitle?: string;
  primarySubtitle?: string;
}

export interface StreamerControllerHandle {
  toggleViewMute: () => void;
  togglePauseAll: () => void;
  stopAll: () => void;
}

export interface StreamerViewProps {
  isActiveView?: boolean;
  onPlaybackStateChange?: (summary: StreamerPlaybackSummary) => void;
}

const STUDIO_SIDEBAR_WIDTH_KEY = "kanso_streamer_sidebar_width_v1";
const DEFAULT_STUDIO_SIDEBAR_WIDTH = 320;
const MIN_STUDIO_SIDEBAR_WIDTH = 260;
const MAX_STUDIO_SIDEBAR_WIDTH = 640;

function resolveGridColumns(
  layoutMode: StreamLayoutMode,
  count: number,
  customCols: number,
): number {
  switch (layoutMode) {
    case "1":
    case "1x1":
      return 1;
    case "2":
    case "2x2":
      return 2;
    case "3x2":
    case "3x3":
      return 3;
    case "4x4":
      return 4;
    case "5x5":
      return 5;
    case "6x6":
      return 6;
    case "7x7":
      return 7;
    case "8x8":
      return 8;
    case "custom":
      return Math.max(1, Math.min(8, customCols || 2));
    case "spotlight":
      return 2;
    case "auto":
    default:
      if (count <= 1) return 1;
      if (count <= 4) return 2;
      if (count <= 9) return 3;
      return 4;
  }
}

export const StreamerView = forwardRef<
  StreamerControllerHandle,
  StreamerViewProps
>(({ isActiveView = true, onPlaybackStateChange }, ref) => {
  const {
    workspace,
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
    reorderVaultStreams,
    incrementStreamListen,
    addStreamFolder,
    updateStreamFolder,
    deleteStreamFolder,
    setStreamTopicIcon,
    updateStreamChannelMeta,
    reorderStreamChannels,
    renameOrMergeStreamChannels,
    batchUpdateStreamChannels,
    deleteStreamChannels,
    updateStreamerState,
    saveStreamPreset,
    loadStreamPreset,
    deleteStreamPreset,
    pushToast,
  } = useWorkspace();

  const { streams, streamPresets, streamerState } = workspace;
  const streamFolders = workspace.streamFolders ?? [];
  const streamTopicIcons = workspace.streamTopicIcons ?? {};
  const streamChannels = workspace.streamChannels ?? {};

  const viewMode: StreamViewMode = streamerState.viewMode || "grid";
  const sizingMode: StreamSizingMode = streamerState.sizingMode || "fit";
  const masterVolume: number = streamerState.masterVolume ?? 100;
  const desktopSidebarOpen: boolean = streamerState.sidebarOpen ?? true;

  const [subView, setSubView] = useState<StreamerSubView>("grid");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [studioSidebarWidth, setStudioSidebarWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_STUDIO_SIDEBAR_WIDTH;
    try {
      const saved = localStorage.getItem(STUDIO_SIDEBAR_WIDTH_KEY);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (
          !Number.isNaN(parsed) &&
          parsed >= MIN_STUDIO_SIDEBAR_WIDTH &&
          parsed <= MAX_STUDIO_SIDEBAR_WIDTH
        ) {
          return parsed;
        }
      }
    } catch {
      // fallback
    }
    return DEFAULT_STUDIO_SIDEBAR_WIDTH;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [editingStreamId, setEditingStreamId] = useState<string | null>(null);
  const [isLargeViewport, setIsLargeViewport] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 1024px)").matches
      : true,
  );
  const [isDesktopGridViewport, setIsDesktopGridViewport] = useState<boolean>(
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(min-width: 768px)").matches
        : true,
  );

  // Runtime audio & loop tracking keyed by slotId
  const [viewMuted, setViewMuted] = useState(false);
  const [allPaused, setAllPaused] = useState(false);
  const [playerStates, setPlayerStates] = useState<Record<string, number>>({});
  const [completedLoops, setCompletedLoops] = useState<Record<string, number>>(
    {},
  );
  const [loopDoneMap, setLoopDoneMap] = useState<Record<string, boolean>>({});
  const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState<
    number | null
  >(null);

  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const pausedSlotIdsRef = useRef<string[]>([]);
  const handshakeTimersRef = useRef<Record<string, number[]>>({});
  const prevSummaryRef = useRef<StreamerPlaybackSummary | null>(null);
  const allPausedRef = useRef(allPaused);
  allPausedRef.current = allPaused;
  const playerStatesRef = useRef(playerStates);
  playerStatesRef.current = playerStates;
  const intentionalPauseUntilRef = useRef<number>(0);
  const lastBackgroundAtRef = useRef<number>(0);
  const preBackgroundPlayingRef = useRef<Set<string>>(new Set());
  const playingIntentsRef = useRef<Set<string>>(new Set());
  const backgroundRecoveryCountsRef = useRef<Record<string, number>>({});
  const backgroundRecoveryTimersRef = useRef<Record<string, number>>({});

  const markIntentionalPause = useCallback(() => {
    intentionalPauseUntilRef.current = Date.now() + 2000;
    preBackgroundPlayingRef.current.clear();
    playingIntentsRef.current.clear();
    backgroundRecoveryCountsRef.current = {};
    for (const timer of Object.values(backgroundRecoveryTimersRef.current)) {
      window.clearTimeout(timer);
    }
    backgroundRecoveryTimersRef.current = {};
  }, []);

  // Drag-and-drop reorder state (keyed by slotId so playing YouTube iframes stay stable)
  const activeDragSlotIdRef = useRef<string | null>(null);
  const dragStartRafRef = useRef<number | null>(null);
  const slotElRefs = useRef<Map<string, HTMLElement>>(new Map());
  const slotsGridRef = useRef<HTMLDivElement | null>(null);
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const [slotDropTarget, setSlotDropTarget] = useState<{
    slotId: string;
    position: "before" | "after";
  } | null>(null);

  const clearSlotDragState = useCallback(() => {
    if (dragStartRafRef.current !== null) {
      window.cancelAnimationFrame(dragStartRafRef.current);
      dragStartRafRef.current = null;
    }
    activeDragSlotIdRef.current = null;
    setDraggingSlotId(null);
    setSlotDropTarget(null);
  }, []);

  useEffect(() => {
    window.addEventListener("dragend", clearSlotDragState);
    window.addEventListener("drop", clearSlotDragState);
    window.addEventListener("blur", clearSlotDragState);
    return () => {
      if (dragStartRafRef.current !== null) {
        window.cancelAnimationFrame(dragStartRafRef.current);
      }
      window.removeEventListener("dragend", clearSlotDragState);
      window.removeEventListener("drop", clearSlotDragState);
      window.removeEventListener("blur", clearSlotDragState);
    };
  }, [clearSlotDragState]);

  // Resize handler for desktop right studio sidebar
  const handleSidebarResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsResizingSidebar(true);
      const startX = e.clientX;
      const startWidth = studioSidebarWidth;

      const onPointerMove = (moveEvent: PointerEvent) => {
        const deltaX = startX - moveEvent.clientX;
        const newWidth = Math.min(
          MAX_STUDIO_SIDEBAR_WIDTH,
          Math.max(MIN_STUDIO_SIDEBAR_WIDTH, startWidth + deltaX),
        );
        setStudioSidebarWidth(newWidth);
        try {
          localStorage.setItem(STUDIO_SIDEBAR_WIDTH_KEY, String(newWidth));
        } catch {
          // ignore
        }
      };

      const onPointerUp = () => {
        setIsResizingSidebar(false);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [studioSidebarWidth],
  );

  const handleSidebarResizeDoubleClick = useCallback(() => {
    setStudioSidebarWidth(DEFAULT_STUDIO_SIDEBAR_WIDTH);
    try {
      localStorage.setItem(
        STUDIO_SIDEBAR_WIDTH_KEY,
        String(DEFAULT_STUDIO_SIDEBAR_WIDTH),
      );
    } catch {
      // ignore
    }
  }, []);

  // Responsive viewport listeners
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mqLg = window.matchMedia("(min-width: 1024px)");
    const mqMd = window.matchMedia("(min-width: 768px)");
    const onLg = (e: MediaQueryListEvent) => setIsLargeViewport(e.matches);
    const onMd = (e: MediaQueryListEvent) =>
      setIsDesktopGridViewport(e.matches);
    setIsLargeViewport(mqLg.matches);
    setIsDesktopGridViewport(mqMd.matches);
    mqLg.addEventListener("change", onLg);
    mqMd.addEventListener("change", onMd);
    return () => {
      mqLg.removeEventListener("change", onLg);
      mqMd.removeEventListener("change", onMd);
    };
  }, []);

  const streamById = useMemo(() => {
    const map = new Map<string, StreamItem>();
    for (const s of streams) map.set(s.id, s);
    return map;
  }, [streams]);

  const editingStream = useMemo(() => {
    if (!editingStreamId) return null;
    return streamById.get(editingStreamId) ?? null;
  }, [editingStreamId, streamById]);

  const activeSlots = useMemo<StackSlot[]>(() => {
    const rawSlots = streamerState.activeSlots ?? [];
    return rawSlots.filter((sl) => streamById.has(sl.streamId));
  }, [streamerState.activeSlots, streamById]);

  // Render slots in a stable DOM order keyed by slotId and use CSS `order`
  // so reordering cards NEVER moves/reloads live YouTube iframes or drops audio.
  const domOrderedSlots = useMemo<StackSlot[]>(
    () => [...activeSlots].sort((a, b) => a.slotId.localeCompare(b.slotId)),
    [activeSlots],
  );

  const slotOrderIndexById = useMemo(() => {
    const map = new Map<string, number>();
    activeSlots.forEach((sl, idx) => map.set(sl.slotId, idx));
    return map;
  }, [activeSlots]);

  const activeStreams = useMemo(
    () =>
      activeSlots
        .map((sl) => streamById.get(sl.streamId))
        .filter((s): s is StreamItem => Boolean(s)),
    [activeSlots, streamById],
  );

  const activeSlotIdSet = useMemo(
    () => new Set(activeSlots.map((sl) => sl.slotId)),
    [activeSlots],
  );

  const activeStreamIdSet = useMemo(
    () => new Set(activeSlots.map((sl) => sl.streamId)),
    [activeSlots],
  );

  // Sleep Timer fade-out multiplier (smooth linear fade during final 15 seconds)
  const sleepFadeMultiplier = useMemo(() => {
    if (sleepRemainingSeconds === null || sleepRemainingSeconds > 15) return 1;
    return Math.max(0, sleepRemainingSeconds / 15);
  }, [sleepRemainingSeconds]);

  // Refs for stable access inside window message & load callbacks
  const activeSlotsRef = useRef(activeSlots);
  activeSlotsRef.current = activeSlots;
  const viewMutedRef = useRef(viewMuted);
  viewMutedRef.current = viewMuted;
  const masterVolumeRef = useRef(masterVolume);
  masterVolumeRef.current = masterVolume;
  const sleepFadeRef = useRef(sleepFadeMultiplier);
  sleepFadeRef.current = sleepFadeMultiplier;
  const completedLoopsRef = useRef(completedLoops);
  completedLoopsRef.current = completedLoops;

  const applySlotAudio = useCallback(
    (
      slot: StackSlot,
      iframe: HTMLIFrameElement | null,
      fadeMult = sleepFadeRef.current,
    ) => {
      if (!iframe) return;
      const effectiveVol = Math.max(
        0,
        Math.min(
          100,
          Math.round(slot.volume * (masterVolumeRef.current / 100) * fadeMult),
        ),
      );
      const shouldMute =
        viewMutedRef.current || slot.muted || effectiveVol === 0;
      if (shouldMute) {
        sendYouTubeCommand(iframe, "mute", [], slot.slotId);
      } else {
        sendYouTubeCommand(iframe, "unMute", [], slot.slotId);
        sendYouTubeCommand(iframe, "setVolume", [effectiveVol], slot.slotId);
      }
    },
    [],
  );

  // Re-sync volume/mute commands whenever slot volumes, mutes, masterVolume, viewMuted, or fade changes
  useEffect(() => {
    for (const slot of activeSlots) {
      const iframe = iframeRefs.current[slot.slotId] || null;
      if (iframe) {
        applySlotAudio(slot, iframe, sleepFadeMultiplier);
      }
    }
  }, [
    activeSlots,
    masterVolume,
    viewMuted,
    sleepFadeMultiplier,
    applySlotAudio,
  ]);

  // Clean up runtime playback state & handshake timers when slots leave the stack
  useEffect(() => {
    setPlayerStates((prev) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const key of Object.keys(prev)) {
        if (activeSlotIdSet.has(key)) next[key] = prev[key];
        else changed = true;
      }
      return changed ? next : prev;
    });

    setCompletedLoops((prev) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const key of Object.keys(prev)) {
        if (activeSlotIdSet.has(key)) next[key] = prev[key];
        else changed = true;
      }
      return changed ? next : prev;
    });

    setLoopDoneMap((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) {
        if (activeSlotIdSet.has(key)) next[key] = prev[key];
        else changed = true;
      }
      return changed ? next : prev;
    });

    for (const key of Object.keys(handshakeTimersRef.current)) {
      if (!activeSlotIdSet.has(key)) {
        for (const timer of handshakeTimersRef.current[key]) {
          window.clearTimeout(timer);
        }
        delete handshakeTimersRef.current[key];
      }
    }

    for (const key of Array.from(playingIntentsRef.current)) {
      if (!activeSlotIdSet.has(key)) {
        playingIntentsRef.current.delete(key);
        if (backgroundRecoveryTimersRef.current[key]) {
          window.clearTimeout(backgroundRecoveryTimersRef.current[key]);
          delete backgroundRecoveryTimersRef.current[key];
        }
      }
    }

    if (activeSlots.length === 0) {
      setViewMuted(false);
      setAllPaused(false);
      setSleepRemainingSeconds(null);
      pausedSlotIdsRef.current = [];
      playingIntentsRef.current.clear();
    }
  }, [activeSlotIdSet, activeSlots.length]);

  // Clean up handshake & recovery timers on unmount
  useEffect(() => {
    return () => {
      for (const timers of Object.values(handshakeTimersRef.current)) {
        for (const timer of timers) {
          window.clearTimeout(timer);
        }
      }
      handshakeTimersRef.current = {};
      for (const timer of Object.values(backgroundRecoveryTimersRef.current)) {
        window.clearTimeout(timer);
      }
      backgroundRecoveryTimersRef.current = {};
    };
  }, []);

  // Close mobile sidebar drawer when navigating away from Streamer
  useEffect(() => {
    if (!isActiveView) {
      setMobileSidebarOpen(false);
    }
  }, [isActiveView]);

  // Sleep Timer countdown & gradual fade-out pause
  useEffect(() => {
    if (sleepRemainingSeconds === null) return;
    if (sleepRemainingSeconds <= 0) {
      markIntentionalPause();
      for (const slot of activeSlotsRef.current) {
        sendYouTubeCommand(
          iframeRefs.current[slot.slotId] || null,
          "pauseVideo",
          [],
          slot.slotId,
        );
      }
      setAllPaused(true);
      setPlayerStates((prev) => {
        const next = { ...prev };
        for (const slot of activeSlotsRef.current) {
          if (next[slot.slotId] === 1 || next[slot.slotId] === 3) {
            next[slot.slotId] = 2;
          }
        }
        return next;
      });
      setSleepRemainingSeconds(null);
      pushToast("Sleep timer ended — streams paused");
      return;
    }

    const timer = window.setTimeout(() => {
      setSleepRemainingSeconds((prev) =>
        prev === null ? null : Math.max(0, prev - 1),
      );
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [sleepRemainingSeconds, pushToast, markIntentionalPause]);

  // Snapshot active playing streams before Android backgrounds/locks so transient pause blips recover cleanly
  useEffect(() => {
    if (!isAndroidCapacitor()) return;

    const recordBackgroundTransition = () => {
      if (allPausedRef.current || Date.now() <= intentionalPauseUntilRef.current) {
        return;
      }
      const playingSet = new Set<string>(playingIntentsRef.current);
      for (const sl of activeSlotsRef.current) {
        const st = playerStatesRef.current[sl.slotId];
        if (st === 1 || st === 3) {
          playingSet.add(sl.slotId);
        }
      }
      if (playingSet.size > 0) {
        lastBackgroundAtRef.current = Date.now();
        preBackgroundPlayingRef.current = playingSet;
        backgroundRecoveryCountsRef.current = {};
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordBackgroundTransition();
      } else {
        preBackgroundPlayingRef.current.clear();
        backgroundRecoveryCountsRef.current = {};
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", recordBackgroundTransition);
    window.addEventListener("pagehide", recordBackgroundTransition);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", recordBackgroundTransition);
      window.removeEventListener("pagehide", recordBackgroundTransition);
    };
  }, []);

  // Listen for real-time YouTube IFrame postMessage state changes (playback & loop completion)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const parsed = parseYouTubeMessage(event);
      if (!parsed) return;

      let matchedSlotId: string | null = null;
      for (const [slotId, iframe] of Object.entries(iframeRefs.current)) {
        if (
          iframe &&
          iframe.contentWindow &&
          iframe.contentWindow === event.source
        ) {
          matchedSlotId = slotId;
          break;
        }
      }
      if (!matchedSlotId) return;

      // Handshake acknowledged — cancel retry timers
      if (handshakeTimersRef.current[matchedSlotId]) {
        for (const timer of handshakeTimersRef.current[matchedSlotId]) {
          window.clearTimeout(timer);
        }
        delete handshakeTimersRef.current[matchedSlotId];
      }

      if (parsed.playerState !== undefined) {
        const nextState = parsed.playerState;
        const slot = activeSlotsRef.current.find(
          (sl) => sl.slotId === matchedSlotId,
        );
        const iframe = iframeRefs.current[matchedSlotId] || null;

        // Recover if Android WebView window transition emitted an unsolicited pause while backgrounded/unfocused
        const isBackgroundedOrTransitioning =
          document.hidden ||
          !document.hasFocus() ||
          Date.now() - lastBackgroundAtRef.current < 4000;

        if (
          nextState === 2 &&
          isAndroidCapacitor() &&
          !allPausedRef.current &&
          Date.now() > intentionalPauseUntilRef.current &&
          isBackgroundedOrTransitioning &&
          (preBackgroundPlayingRef.current.has(matchedSlotId) ||
            playingIntentsRef.current.has(matchedSlotId))
        ) {
          const retries = backgroundRecoveryCountsRef.current[matchedSlotId] || 0;
          if (retries < 6 && slot && iframe) {
            backgroundRecoveryCountsRef.current[matchedSlotId] = retries + 1;
            sendYouTubeCommand(iframe, "playVideo", [], matchedSlotId);
            applySlotAudio(slot, iframe, sleepFadeRef.current);
            if (backgroundRecoveryTimersRef.current[matchedSlotId]) {
              window.clearTimeout(
                backgroundRecoveryTimersRef.current[matchedSlotId],
              );
            }
            backgroundRecoveryTimersRef.current[matchedSlotId] =
              window.setTimeout(() => {
                delete backgroundRecoveryTimersRef.current[matchedSlotId!];
                if (
                  !allPausedRef.current &&
                  Date.now() > intentionalPauseUntilRef.current &&
                  playingIntentsRef.current.has(matchedSlotId!)
                ) {
                  const latestIframe =
                    iframeRefs.current[matchedSlotId!] || null;
                  const latestSlot = activeSlotsRef.current.find(
                    (sl) => sl.slotId === matchedSlotId,
                  );
                  if (latestIframe && latestSlot) {
                    sendYouTubeCommand(
                      latestIframe,
                      "playVideo",
                      [],
                      matchedSlotId!,
                    );
                    applySlotAudio(
                      latestSlot,
                      latestIframe,
                      sleepFadeRef.current,
                    );
                  }
                }
              }, 220);
            return;
          }
        }

        if (nextState === 1 || nextState === 3) {
          playingIntentsRef.current.add(matchedSlotId);
          setAllPaused(false);
          if (slot && iframe) {
            applySlotAudio(slot, iframe, sleepFadeRef.current);
          }
        } else if (nextState === 2) {
          playingIntentsRef.current.delete(matchedSlotId);
        } else if (nextState === 0 && slot) {
          // Video ended: increment loop counter & either loop or auto-pause at target
          const nextCount = (completedLoopsRef.current[matchedSlotId] || 0) + 1;
          setCompletedLoops((prev) => ({
            ...prev,
            [matchedSlotId!]: nextCount,
          }));

          if (slot.loopMode === "infinite" || nextCount < slot.loopCount) {
            playingIntentsRef.current.add(matchedSlotId);
            setLoopDoneMap((prev) => ({ ...prev, [matchedSlotId!]: false }));
            sendYouTubeCommand(iframe, "seekTo", [0, true], slot.slotId);
            sendYouTubeCommand(iframe, "playVideo", [], slot.slotId);
            applySlotAudio(slot, iframe, sleepFadeRef.current);
          } else {
            playingIntentsRef.current.delete(matchedSlotId);
            markIntentionalPause();
            setLoopDoneMap((prev) => ({ ...prev, [matchedSlotId!]: true }));
            sendYouTubeCommand(iframe, "pauseVideo", [], slot.slotId);
          }
        }

        setPlayerStates((prev) =>
          prev[matchedSlotId!] === nextState
            ? prev
            : { ...prev, [matchedSlotId!]: nextState },
        );
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [applySlotAudio, markIntentionalPause]);

  // Register YouTube IFrame listener & initial audio state on iframe load
  const handleIframeLoad = useCallback(
    (slot: StackSlot, iframe: HTMLIFrameElement | null) => {
      if (!iframe) return;
      const slotId = slot.slotId;
      if (handshakeTimersRef.current[slotId]) {
        for (const timer of handshakeTimersRef.current[slotId]) {
          window.clearTimeout(timer);
        }
      }

      registerYouTubeListener(iframe, slotId);
      applySlotAudio(slot, iframe, sleepFadeRef.current);

      const delays = [450, 1100, 2000, 3200, 4800, 6800, 9000, 12000];
      handshakeTimersRef.current[slotId] = delays.map((delayMs) =>
        window.setTimeout(() => {
          const el = iframeRefs.current[slotId] || iframe;
          registerYouTubeListener(el, slotId);
          const latestSlot =
            activeSlotsRef.current.find((sl) => sl.slotId === slotId) || slot;
          applySlotAudio(latestSlot, el, sleepFadeRef.current);
        }, delayMs),
      );
    },
    [applySlotAudio],
  );

  // Derived audio & playback summary for KansoShell & Transport bar
  const allIndividuallyMuted = useMemo(
    () =>
      activeSlots.length > 0 &&
      activeSlots.every((sl) => sl.muted || sl.volume === 0),
    [activeSlots],
  );

  const allActiveMuted = viewMuted || allIndividuallyMuted;

  const playingSlots = useMemo(
    () =>
      activeSlots.filter((sl) => {
        const st = playerStates[sl.slotId];
        return st === 1 || st === 3;
      }),
    [activeSlots, playerStates],
  );

  const playingCount = playingSlots.length;
  const isPlaying = playingCount > 0;
  const isAllPaused = allPaused && activeSlots.length > 0 && !isPlaying;

  const hasSyncedAndroidRef = useRef(false);
  const bannerDismissedRef = useRef(false);

  const backgroundMediaMeta = useMemo(() => {
    const activePreset = streamerState.activePresetId
      ? streamPresets.find((p) => p.id === streamerState.activePresetId)
      : undefined;

    if (playingSlots.length === 0) {
      const fallbackSlot =
        activeSlots.find((sl) => pausedSlotIdsRef.current.includes(sl.slotId)) ||
        activeSlots[0];
      const fallbackStream = fallbackSlot
        ? streamById.get(fallbackSlot.streamId)
        : undefined;
      const pausedTitle =
        activePreset?.name ||
        fallbackStream?.customLabel ||
        fallbackStream?.title ||
        "Kanso Streamer";
      return { title: pausedTitle, subtitle: "Paused" };
    }

    const firstStream = streamById.get(playingSlots[0].streamId);
    const firstTitle =
      firstStream?.customLabel || firstStream?.title || "Kanso Streamer";

    if (playingSlots.length === 1) {
      return {
        title: firstTitle,
        subtitle: firstStream?.channel
          ? `${firstStream.channel} · Playing in background`
          : "Playing in background",
      };
    }

    return {
      title: activePreset?.name || firstTitle,
      subtitle: `${playingSlots.length} streams playing in background`,
    };
  }, [
    playingSlots,
    activeSlots,
    streamById,
    streamerState.activePresetId,
    streamPresets,
  ]);

  // Sync Android Foreground MediaPlayback Service (keeps paused banner alive until Stop or swipe dismiss)
  useEffect(() => {
    if (!isAndroidCapacitor()) return;
    if (activeSlots.length === 0) {
      bannerDismissedRef.current = false;
      if (hasSyncedAndroidRef.current) {
        hasSyncedAndroidRef.current = false;
        void syncAndroidBackgroundAudio({
          source: "streamer",
          playing: false,
          keepServiceAlive: false,
          showTrackControls: false,
        });
      }
      return;
    }

    if (isPlaying) {
      bannerDismissedRef.current = false;
      hasSyncedAndroidRef.current = true;
    }

    if (isPlaying || (hasSyncedAndroidRef.current && !bannerDismissedRef.current)) {
      void syncAndroidBackgroundAudio({
        source: "streamer",
        playing: isPlaying,
        title: backgroundMediaMeta.title,
        subtitle: isPlaying ? backgroundMediaMeta.subtitle : "Paused",
        keepServiceAlive: true,
        showTrackControls: false,
      });
    }
  }, [
    activeSlots.length,
    isPlaying,
    backgroundMediaMeta.title,
    backgroundMediaMeta.subtitle,
  ]);

  useEffect(() => {
    return () => {
      if (isAndroidCapacitor() && hasSyncedAndroidRef.current) {
        hasSyncedAndroidRef.current = false;
        void syncAndroidBackgroundAudio({
          source: "streamer",
          playing: false,
          keepServiceAlive: false,
        });
      }
    };
  }, []);

  useEffect(() => {
    if (!onPlaybackStateChange) return;
    const next: StreamerPlaybackSummary = {
      activeCount: activeSlots.length,
      playingCount,
      isPlaying,
      isViewMuted: allActiveMuted,
      isAllPaused,
      primaryTitle: backgroundMediaMeta.title,
      primarySubtitle: backgroundMediaMeta.subtitle,
    };
    const prev = prevSummaryRef.current;
    if (
      prev &&
      prev.activeCount === next.activeCount &&
      prev.playingCount === next.playingCount &&
      prev.isPlaying === next.isPlaying &&
      prev.isViewMuted === next.isViewMuted &&
      prev.isAllPaused === next.isAllPaused &&
      prev.primaryTitle === next.primaryTitle &&
      prev.primarySubtitle === next.primarySubtitle
    ) {
      return;
    }
    prevSummaryRef.current = next;
    onPlaybackStateChange(next);
  }, [
    activeSlots.length,
    playingCount,
    isPlaying,
    allActiveMuted,
    isAllPaused,
    backgroundMediaMeta.title,
    backgroundMediaMeta.subtitle,
    onPlaybackStateChange,
  ]);

  // Global Mute/Unmute toggle
  const handleToggleViewMute = useCallback(
    (silentToast = false) => {
      if (activeSlots.length === 0) return;

      if (!allActiveMuted) {
        setViewMuted(true);
        for (const sl of activeSlots) {
          sendYouTubeCommand(
            iframeRefs.current[sl.slotId] || null,
            "mute",
            [],
            sl.slotId,
          );
        }
        if (!silentToast) pushToast("Muted all stacked streams");
        return;
      }

      if (viewMuted) {
        setViewMuted(false);
        if (allIndividuallyMuted) {
          updateAllStreamSlots((sl) => ({
            ...sl,
            muted: false,
            volume: sl.volume === 0 ? 50 : sl.volume,
          }));
        } else {
          for (const sl of activeSlots) {
            if (!sl.muted && sl.volume > 0) {
              applySlotAudio(
                sl,
                iframeRefs.current[sl.slotId] || null,
                sleepFadeRef.current,
              );
            }
          }
        }
        if (!silentToast) pushToast("Unmuted stacked streams");
        return;
      }

      updateAllStreamSlots((sl) => ({
        ...sl,
        muted: false,
        volume: sl.volume === 0 ? 50 : sl.volume,
      }));
      if (!silentToast) pushToast("Unmuted all stacked streams");
    },
    [
      activeSlots,
      allActiveMuted,
      viewMuted,
      allIndividuallyMuted,
      updateAllStreamSlots,
      applySlotAudio,
      pushToast,
    ],
  );

  // Explicit Pause All helper (used by UI Pause All, Android notification Pause/Stop/Dismiss)
  const pauseAllStreams = useCallback(
    (silentToast = false, stopSleepTimer = false, suppressBanner = false) => {
      const slots = activeSlotsRef.current;
      if (suppressBanner) {
        bannerDismissedRef.current = true;
        hasSyncedAndroidRef.current = false;
      }
      if (slots.length === 0) {
        if (isAndroidCapacitor()) {
          void syncAndroidBackgroundAudio({
            source: "streamer",
            playing: false,
            keepServiceAlive: false,
            showTrackControls: false,
          });
        }
        return;
      }
      markIntentionalPause();
      preBackgroundPlayingRef.current.clear();
      const currentlyPlayingIds = slots
        .filter((sl) => {
          const st = playerStatesRef.current[sl.slotId];
          return st === 1 || st === 3;
        })
        .map((sl) => sl.slotId);
      if (currentlyPlayingIds.length > 0) {
        pausedSlotIdsRef.current = currentlyPlayingIds;
      }
      for (const sl of slots) {
        sendYouTubeCommand(
          iframeRefs.current[sl.slotId] || null,
          "pauseVideo",
          [],
          sl.slotId,
        );
      }
      allPausedRef.current = true;
      setAllPaused(true);
      if (stopSleepTimer) {
        setSleepRemainingSeconds(null);
      }
      setPlayerStates((prev) => {
        const next = { ...prev };
        for (const sl of slots) {
          if (next[sl.slotId] === 1 || next[sl.slotId] === 3) {
            next[sl.slotId] = 2;
          }
        }
        return next;
      });
      if (suppressBanner && isAndroidCapacitor()) {
        void syncAndroidBackgroundAudio({
          source: "streamer",
          playing: false,
          keepServiceAlive: false,
          showTrackControls: false,
        });
      }
      if (!silentToast) pushToast("Paused all stacked streams");
    },
    [markIntentionalPause, pushToast],
  );

  // Explicit Resume All helper (used by Play All button & Android notification Play)
  const resumeAllStreams = useCallback(
    (silentToast = false) => {
      const slots = activeSlotsRef.current;
      if (slots.length === 0) return;

      bannerDismissedRef.current = false;
      const slotIdsSet = new Set(slots.map((sl) => sl.slotId));
      const savedTargets = pausedSlotIdsRef.current.filter((id) =>
        slotIdsSet.has(id),
      );
      const targets =
        savedTargets.length > 0 ? savedTargets : slots.map((sl) => sl.slotId);

      allPausedRef.current = false;
      for (const slotId of targets) {
        playingIntentsRef.current.add(slotId);
        const slot = slots.find((sl) => sl.slotId === slotId);
        const iframe = iframeRefs.current[slotId] || null;
        sendYouTubeCommand(iframe, "playVideo", [], slotId);
        if (slot) applySlotAudio(slot, iframe, sleepFadeRef.current);
      }
      setAllPaused(false);
      setPlayerStates((prev) => {
        const next = { ...prev };
        for (const id of targets) next[id] = 1;
        return next;
      });
      if (!silentToast) pushToast("Playing all stacked streams");
    },
    [applySlotAudio, pushToast],
  );

  // Handle Android media notification Play / Pause / Stop / Dismiss buttons
  useEffect(() => {
    if (!isAndroidCapacitor()) return;
    return subscribeAndroidMediaControls((action, source) => {
      if (source && source !== "streamer") return;
      if (action === "play") {
        resumeAllStreams(true);
      } else if (action === "pause") {
        pauseAllStreams(true, false, false);
      } else if (action === "stop" || action === "dismiss") {
        pauseAllStreams(true, action === "stop", true);
      }
    });
  }, [pauseAllStreams, resumeAllStreams]);

  // Combined Play All / Pause All toggle
  const handleTogglePauseAll = useCallback(
    (silentToast = false) => {
      if (activeSlots.length === 0) return;

      const currentlyPlayingIds = activeSlots
        .filter(
          (sl) =>
            playerStates[sl.slotId] === 1 || playerStates[sl.slotId] === 3,
        )
        .map((sl) => sl.slotId);

      if (currentlyPlayingIds.length > 0 && !isAllPaused) {
        pauseAllStreams(silentToast);
        return;
      }

      resumeAllStreams(silentToast);
    },
    [activeSlots, isAllPaused, playerStates, pauseAllStreams, resumeAllStreams],
  );

  // Sync All: seeks every active slot to 0:00 and starts synchronized playback
  const handleSyncAll = useCallback(() => {
    if (activeSlots.length === 0) return;
    for (const slot of activeSlots) {
      playingIntentsRef.current.add(slot.slotId);
      const iframe = iframeRefs.current[slot.slotId] || null;
      sendYouTubeCommand(iframe, "seekTo", [0, true], slot.slotId);
      sendYouTubeCommand(iframe, "playVideo", [], slot.slotId);
      applySlotAudio(slot, iframe, sleepFadeRef.current);
    }
    setAllPaused(false);
    setLoopDoneMap({});
    setPlayerStates((prev) => {
      const next = { ...prev };
      for (const sl of activeSlots) next[sl.slotId] = 1;
      return next;
    });
    pushToast("Synced all streams to 0:00", "success");
  }, [activeSlots, applySlotAudio, pushToast]);

  // Explicit Stop All helper (pauses and resets all streams to 0:00 while keeping layout intact)
  const stopAllStreams = useCallback(
    (silentToast = false) => {
      const slots = activeSlotsRef.current;
      bannerDismissedRef.current = true;
      hasSyncedAndroidRef.current = false;
      markIntentionalPause();
      preBackgroundPlayingRef.current.clear();
      pausedSlotIdsRef.current = [];
      playingIntentsRef.current.clear();
      setSleepRemainingSeconds(null);
      allPausedRef.current = false;
      setAllPaused(false);
      setLoopDoneMap({});

      for (const sl of slots) {
        const iframe = iframeRefs.current[sl.slotId] || null;
        sendYouTubeCommand(iframe, "pauseVideo", [], sl.slotId);
        sendYouTubeCommand(iframe, "seekTo", [0, true], sl.slotId);
      }

      setPlayerStates((prev) => {
        const next = { ...prev };
        for (const sl of slots) {
          next[sl.slotId] = 2;
        }
        return next;
      });

      if (isAndroidCapacitor()) {
        void syncAndroidBackgroundAudio({
          source: "streamer",
          playing: false,
          keepServiceAlive: false,
          showTrackControls: false,
        });
      }
      if (!silentToast && slots.length > 0) {
        pushToast("Stopped and reset streams");
      }
    },
    [markIntentionalPause, pushToast],
  );

  // Expose imperative controls for KansoShell's nav tab quick-buttons & corner widget
  useImperativeHandle(
    ref,
    () => ({
      toggleViewMute: () => handleToggleViewMute(true),
      togglePauseAll: () => handleTogglePauseAll(true),
      stopAll: () => stopAllStreams(false),
    }),
    [handleToggleViewMute, handleTogglePauseAll, stopAllStreams],
  );

  // Quick-Add URL / 11-char ID handler (saves to Vault if new, layers onto stack)
  const handleQuickAddUrl = useCallback(
    async (rawUrl: string): Promise<boolean> => {
      const parsed = parseYouTubeUrl(rawUrl);
      if (!parsed) {
        pushToast(
          "Enter a valid YouTube URL or 11-character video ID",
          "error",
        );
        return false;
      }

      const existing = streams.find((s) => s.videoId === parsed.videoId);
      if (existing) {
        addStreamSlot(existing.id);
        pushToast(
          `Layered "${existing.customLabel || existing.title}" onto stack`,
          "success",
        );
        return true;
      }

      const meta = await fetchYouTubeMetadata(rawUrl);
      addStream(
        {
          url: parsed.normalizedUrl,
          videoId: parsed.videoId,
          title: meta?.title || `YouTube Stream (${parsed.videoId})`,
          channel: meta?.channel || "",
          customLabel: "",
          thumbnailUrl: meta?.thumbnailUrl || parsed.thumbnailUrl,
          category: "Subliminals",
          tags: [],
          favorite: false,
          notes: "",
          affirmations: "",
          folderIds: [],
          rating: 0,
          listenCount: 1,
          lastListenedAt: new Date().toISOString(),
        },
        true,
      );
      return true;
    },
    [streams, addStreamSlot, addStream, pushToast],
  );

  // Per-card mute toggle
  const handleToggleCardMute = useCallback(
    (slot: StackSlot) => {
      if (viewMuted) {
        setViewMuted(false);
        updateAllStreamSlots((sl) => ({
          ...sl,
          muted: sl.slotId !== slot.slotId,
        }));
        return;
      }
      updateStreamSlot(slot.slotId, { muted: !slot.muted });
    },
    [viewMuted, updateAllStreamSlots, updateStreamSlot],
  );

  // Per-card volume change (auto-unmutes slot when dragged above 0)
  const handleChangeCardVolume = useCallback(
    (slot: StackSlot, nextVol: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(nextVol)));
      if (viewMuted && clamped > 0) {
        setViewMuted(false);
      }
      updateStreamSlot(slot.slotId, {
        volume: clamped,
        muted: clamped === 0 ? true : false,
      });
    },
    [viewMuted, updateStreamSlot],
  );

  const handleToggleLoopMode = useCallback(
    (slot: StackSlot) => {
      const nextMode = slot.loopMode === "infinite" ? "count" : "infinite";
      updateStreamSlot(slot.slotId, { loopMode: nextMode });
      if (
        nextMode === "infinite" ||
        (completedLoops[slot.slotId] || 0) < slot.loopCount
      ) {
        setLoopDoneMap((prev) => ({ ...prev, [slot.slotId]: false }));
      }
    },
    [updateStreamSlot, completedLoops],
  );

  const handleChangeLoopCount = useCallback(
    (slot: StackSlot, nextCount: number) => {
      const safeCount = Math.max(1, Math.min(999, Math.round(nextCount)));
      updateStreamSlot(slot.slotId, {
        loopMode: "count",
        loopCount: safeCount,
      });
      if ((completedLoops[slot.slotId] || 0) < safeCount) {
        setLoopDoneMap((prev) => ({ ...prev, [slot.slotId]: false }));
      }
    },
    [updateStreamSlot, completedLoops],
  );

  const handleQuietLayer = useCallback(() => {
    setViewMuted(false);
    updateAllStreamSlots((sl) => ({ ...sl, volume: 20, muted: false }));
    pushToast("Quiet Layer set (20% bed)", "success");
  }, [updateAllStreamSlots, pushToast]);

  const handleBalanceAll = useCallback(() => {
    setViewMuted(false);
    updateAllStreamSlots((sl) => ({ ...sl, volume: 50, muted: false }));
    pushToast("Balanced all layers to 50%", "success");
  }, [updateAllStreamSlots, pushToast]);

  const handleStartSleepTimer = useCallback(
    (minutes: number) => {
      const safeMins = Math.max(1, Math.min(480, Math.round(minutes)));
      setSleepRemainingSeconds(safeMins * 60);
      pushToast(`Sleep timer set for ${safeMins}m (with fade-out)`, "success");
    },
    [pushToast],
  );

  const handleCancelSleepTimer = useCallback(() => {
    setSleepRemainingSeconds(null);
    pushToast("Sleep timer cancelled");
  }, [pushToast]);

  const handleToggleSidebar = useCallback(() => {
    if (isLargeViewport) {
      updateStreamerState({ sidebarOpen: !desktopSidebarOpen });
    } else {
      setMobileSidebarOpen((prev) => !prev);
    }
  }, [isLargeViewport, desktopSidebarOpen, updateStreamerState]);

  // Grid columns & Fit/Canvas style calculation
  const desktopColumns = useMemo(() => {
    if (viewMode === "tiles" && streamerState.layoutMode === "auto") {
      return Math.min(6, Math.max(2, activeSlots.length || 2));
    }
    return resolveGridColumns(
      streamerState.layoutMode,
      activeSlots.length,
      streamerState.customCols,
    );
  }, [
    viewMode,
    streamerState.layoutMode,
    streamerState.customCols,
    activeSlots.length,
  ]);

  const gridContainerStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (viewMode === "mixer") return undefined;
    if (!isDesktopGridViewport) {
      return {
        gridTemplateColumns:
          viewMode === "tiles"
            ? "repeat(2, minmax(0, 1fr))"
            : "repeat(1, minmax(0, 1fr))",
      };
    }
    if (sizingMode === "canvas") {
      const minWidth = viewMode === "tiles" ? 200 : 280;
      return {
        gridTemplateColumns: `repeat(${desktopColumns}, minmax(${minWidth}px, 1fr))`,
      };
    }
    return {
      gridTemplateColumns: `repeat(${desktopColumns}, minmax(0, 1fr))`,
    };
  }, [viewMode, isDesktopGridViewport, sizingMode, desktopColumns]);

  const singleColDropAxis = useMemo(() => {
    if (viewMode === "mixer") return true;
    if (!isDesktopGridViewport) return viewMode !== "tiles";
    return desktopColumns <= 1;
  }, [viewMode, isDesktopGridViewport, desktopColumns]);

  const handleReorderSlot = useCallback(
    (
      draggedSlotId: string,
      targetSlotId: string,
      position: "before" | "after",
    ) => {
      if (!draggedSlotId || !targetSlotId || draggedSlotId === targetSlotId) {
        return;
      }
      const fromIndex = activeSlots.findIndex(
        (s) => s.slotId === draggedSlotId,
      );
      const targetIdx = activeSlots.findIndex(
        (s) => s.slotId === targetSlotId,
      );
      if (fromIndex === -1 || targetIdx === -1) return;
      const adjustedTarget = targetIdx > fromIndex ? targetIdx - 1 : targetIdx;
      const toIndex =
        position === "before" ? adjustedTarget : adjustedTarget + 1;
      if (fromIndex !== toIndex) {
        reorderActiveSlots(fromIndex, toIndex);
      }
    },
    [activeSlots, reorderActiveSlots],
  );

  const resolveSlotTouchDrop = useCallback(
    (
      clientX: number,
      clientY: number,
      activeSlotId: string,
    ): { slotId: string; position: "before" | "after" } | null => {
      for (const slot of activeSlots) {
        if (slot.slotId === activeSlotId) continue;
        const el = slotElRefs.current.get(slot.slotId);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          const position: "before" | "after" = singleColDropAxis
            ? clientY < rect.top + rect.height / 2
              ? "before"
              : "after"
            : clientX < rect.left + rect.width / 2
              ? "before"
              : "after";
          return { slotId: slot.slotId, position };
        }
      }
      return null;
    },
    [activeSlots, singleColDropAxis],
  );

  const handleVaultLoadStreams = useCallback(
    (
      streamIds: string[],
      mode: "replace" | "append" = "replace",
      label?: string,
    ) => {
      loadStreamsToGrid(streamIds, mode, label);
      if (mode === "replace") {
        setSubView("grid");
      }
    },
    [loadStreamsToGrid],
  );

  const handleSidebarStackStream = useCallback(
    (streamId: string) => {
      const stream = streamById.get(streamId);
      const alreadyIn = activeStreamIdSet.has(streamId);
      addStreamSlot(streamId);
      if (stream) {
        pushToast(
          alreadyIn
            ? `Added layer: "${stream.customLabel || stream.title}"`
            : `Stacked "${stream.customLabel || stream.title}"`,
          "success",
        );
      }
    },
    [streamById, activeStreamIdSet, addStreamSlot, pushToast],
  );

  return (
    <div className="flex flex-col h-full flex-1 min-h-0 lg:h-dvh lg:min-h-[520px] overflow-hidden overscroll-none">
      {/* Bar 1: Compact Header */}
      <StreamerTopBar
        subView={subView}
        onChangeSubView={setSubView}
        activeCount={activeSlots.length}
        vaultCount={streams.length}
        onQuickAddUrl={handleQuickAddUrl}
      />

      {/* Bar 2: Unified 32px Transport, Mixer & Layout Control Bar (shown on Live Grid) */}
      {subView === "grid" && (
        <StreamerTransportBar
          stackedCount={activeSlots.length}
          isPlaying={isPlaying}
          isAllPaused={isAllPaused}
          allActiveMuted={allActiveMuted}
          masterVolume={masterVolume}
          sleepRemainingSeconds={sleepRemainingSeconds}
          viewMode={viewMode}
          onChangeViewMode={(mode) =>
            updateStreamerState({ viewMode: mode, activePresetId: null })
          }
          layoutMode={streamerState.layoutMode}
          onChangeLayoutMode={(mode) =>
            updateStreamerState({ layoutMode: mode, activePresetId: null })
          }
          sizingMode={sizingMode}
          onChangeSizingMode={(mode) =>
            updateStreamerState({ sizingMode: mode, activePresetId: null })
          }
          sidebarOpen={isLargeViewport ? desktopSidebarOpen : mobileSidebarOpen}
          onToggleSidebar={handleToggleSidebar}
          onTogglePlayPauseAll={() => handleTogglePauseAll(false)}
          onToggleMuteAll={() => handleToggleViewMute(false)}
          onSyncAll={handleSyncAll}
          onChangeMasterVolume={(vol) =>
            updateStreamerState({
              masterVolume: Math.max(0, Math.min(100, vol)),
            })
          }
          onQuietLayer={handleQuietLayer}
          onBalanceAll={handleBalanceAll}
          onStartSleepTimer={handleStartSleepTimer}
          onCancelSleepTimer={handleCancelSleepTimer}
          onSaveStack={(name, category) => saveStreamPreset(name, category)}
          onClearStack={clearStreamSlots}
        />
      )}

      {/* Main Studio Workspace Area (Live Stack stays mounted offscreen when Vault is open so audio NEVER stops) */}
      <div className="relative flex-1 min-h-0 flex overflow-hidden">
        {/* Layer 1: Live Multi-Stream Stack Canvas + Collapsible Right Sidebar */}
        <div
          aria-hidden={subView !== "grid"}
          className={
            subView === "grid"
              ? "flex flex-1 min-w-0 min-h-0 overflow-hidden"
              : "fixed -left-[9999px] top-0 w-[1024px] h-[600px] opacity-0 pointer-events-none select-none overflow-hidden"
          }
        >
          {/* Scrollable Stack Grid / Compact Mixer / Mini Tiles */}
          <div
            className={`flex-1 min-w-0 overflow-y-auto overscroll-none ${
              sizingMode === "canvas" ? "overflow-x-auto" : "overflow-x-hidden"
            } p-3.5 sm:p-5`}
            style={{ backgroundColor: "var(--bg-canvas)" }}
          >
            {activeSlots.length === 0 ? (
              <div className="h-full min-h-[340px] flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
                <div
                  className="w-12 h-12 rounded-2xl border flex items-center justify-center"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--accent)",
                  }}
                >
                  <LayoutGrid className="w-5 h-5" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="font-display text-base font-bold">
                    Your Live Stack is empty
                  </h2>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Paste a YouTube URL or 11-character ID above, pick tracks
                    from Quick-Add in the library sidebar, or load a saved
                    Routine Stack Preset.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSubView("vault")}
                    className="h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "var(--accent-fg)",
                    }}
                  >
                    <FolderKanban className="w-3.5 h-3.5" />
                    <span>Browse Vault</span>
                  </button>
                  {streamPresets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => loadStreamPreset(streamPresets[0].id)}
                      className="h-9 px-3.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-hover)]"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>Load {streamPresets[0].name}</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div
                ref={slotsGridRef}
                className={
                  viewMode === "mixer"
                    ? "flex flex-col gap-2.5 max-w-[1400px] mx-auto"
                    : `grid ${viewMode === "tiles" ? "gap-2.5" : "gap-3.5"} ${
                        sizingMode === "fit" && desktopColumns === 1
                          ? "max-w-4xl mx-auto"
                          : sizingMode === "fit"
                            ? "max-w-[1800px] mx-auto"
                            : ""
                      }`
                }
                style={gridContainerStyle}
              >
                {domOrderedSlots.map((slot) => {
                  const stream = streamById.get(slot.streamId);
                  if (!stream) return null;
                  const visualIndex = slotOrderIndexById.get(slot.slotId) ?? 0;
                  const dropPosition =
                    slotDropTarget?.slotId === slot.slotId
                      ? slotDropTarget.position
                      : null;

                  return (
                    <StreamSlotCard
                      key={slot.slotId}
                      slot={slot}
                      stream={stream}
                      index={visualIndex}
                      viewMode={viewMode}
                      isGloballyMuted={viewMuted}
                      completedLoops={completedLoops[slot.slotId] || 0}
                      loopTargetReached={Boolean(loopDoneMap[slot.slotId])}
                      isDragging={draggingSlotId === slot.slotId}
                      isAnyDragging={draggingSlotId !== null}
                      dropPosition={dropPosition}
                      singleColDropAxis={singleColDropAxis}
                      canReorder={activeSlots.length > 1}
                      cardRef={(el) => {
                        if (el) slotElRefs.current.set(slot.slotId, el);
                        else slotElRefs.current.delete(slot.slotId);
                      }}
                      iframeRef={(el) => {
                        iframeRefs.current[slot.slotId] = el;
                      }}
                      onIframeLoad={(el) => handleIframeLoad(slot, el)}
                      onDragStart={(e) => {
                        if (activeSlots.length <= 1) {
                          e.preventDefault();
                          return;
                        }
                        e.dataTransfer.setData(
                          "application/x-kanso-stream-slot-id",
                          slot.slotId,
                        );
                        e.dataTransfer.effectAllowed = "move";
                        activeDragSlotIdRef.current = slot.slotId;
                        setSlotDropTarget(null);
                        if (dragStartRafRef.current !== null) {
                          window.cancelAnimationFrame(dragStartRafRef.current);
                        }
                        // Defer visual opacity/scale & iframe drag shield by 1 frame so
                        // the browser snapshots the unscaled card before mutating styles.
                        dragStartRafRef.current = window.requestAnimationFrame(
                          () => {
                            dragStartRafRef.current = null;
                            if (activeDragSlotIdRef.current === slot.slotId) {
                              setDraggingSlotId(slot.slotId);
                            }
                          },
                        );
                      }}
                      onDragOver={(e) => {
                        const hasSlotType =
                          Array.from(e.dataTransfer.types).includes(
                            "application/x-kanso-stream-slot-id",
                          ) || Boolean(activeDragSlotIdRef.current);
                        if (!hasSlotType) return;
                        const activeId = activeDragSlotIdRef.current;
                        if (!activeId || activeId === slot.slotId) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        const rect = e.currentTarget.getBoundingClientRect();
                        const position: "before" | "after" = singleColDropAxis
                          ? e.clientY < rect.top + rect.height / 2
                            ? "before"
                            : "after"
                          : e.clientX < rect.left + rect.width / 2
                            ? "before"
                            : "after";
                        setSlotDropTarget((prev) =>
                          prev?.slotId === slot.slotId &&
                          prev.position === position
                            ? prev
                            : { slotId: slot.slotId, position },
                        );
                      }}
                      onDragLeave={(e) => {
                        if (
                          !e.currentTarget.contains(e.relatedTarget as Node)
                        ) {
                          setSlotDropTarget((prev) =>
                            prev?.slotId === slot.slotId ? null : prev,
                          );
                        }
                      }}
                      onDrop={(e) => {
                        const hasSlotType =
                          Array.from(e.dataTransfer.types).includes(
                            "application/x-kanso-stream-slot-id",
                          ) || Boolean(activeDragSlotIdRef.current);
                        if (!hasSlotType) return;
                        const draggedId =
                          e.dataTransfer.getData(
                            "application/x-kanso-stream-slot-id",
                          ) || activeDragSlotIdRef.current;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const position: "before" | "after" = singleColDropAxis
                          ? e.clientY < rect.top + rect.height / 2
                            ? "before"
                            : "after"
                          : e.clientX < rect.left + rect.width / 2
                            ? "before"
                            : "after";
                        clearSlotDragState();
                        if (!draggedId || draggedId === slot.slotId) return;
                        e.preventDefault();
                        handleReorderSlot(draggedId, slot.slotId, position);
                      }}
                      onDragEnd={clearSlotDragState}
                      onGripPointerDown={(e) => {
                        if (
                          e.pointerType === "mouse" ||
                          activeSlots.length <= 1
                        ) {
                          return;
                        }
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        activeDragSlotIdRef.current = slot.slotId;
                        setDraggingSlotId(slot.slotId);
                        setSlotDropTarget(null);
                      }}
                      onGripPointerMove={(e) => {
                        if (
                          e.pointerType === "mouse" ||
                          activeDragSlotIdRef.current !== slot.slotId
                        ) {
                          return;
                        }
                        setSlotDropTarget(
                          resolveSlotTouchDrop(
                            e.clientX,
                            e.clientY,
                            slot.slotId,
                          ),
                        );
                      }}
                      onGripPointerUp={(e) => {
                        if (e.pointerType === "mouse") return;
                        e.stopPropagation();
                        if (activeDragSlotIdRef.current === slot.slotId) {
                          const target =
                            resolveSlotTouchDrop(
                              e.clientX,
                              e.clientY,
                              slot.slotId,
                            ) ?? slotDropTarget;
                          clearSlotDragState();
                          if (target && target.slotId !== slot.slotId) {
                            handleReorderSlot(
                              slot.slotId,
                              target.slotId,
                              target.position,
                            );
                          }
                        } else {
                          clearSlotDragState();
                        }
                      }}
                      onGripPointerCancel={clearSlotDragState}
                      onToggleMute={() => handleToggleCardMute(slot)}
                      onChangeVolume={(vol) =>
                        handleChangeCardVolume(slot, vol)
                      }
                      onToggleLoopMode={() => handleToggleLoopMode(slot)}
                      onChangeLoopCount={(count) =>
                        handleChangeLoopCount(slot, count)
                      }
                      onRemove={() => removeStreamSlot(slot.slotId)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Desktop Collapsible Right Studio Sidebar */}
          {isLargeViewport && desktopSidebarOpen && (
            <aside
              className="relative hidden lg:flex lg:flex-col shrink-0 border-l h-full overflow-hidden select-none"
              style={{
                width: studioSidebarWidth,
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
              aria-label="Routine Stack Presets and Quick-Add from Vault"
            >
              {/* Left Resizing Drag Handle */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20 hover:bg-[var(--accent-subtle)] active:bg-[var(--accent-primary)] transition-colors"
                title="Drag to resize sidebar, double-click to reset"
                onPointerDown={handleSidebarResizeStart}
                onDoubleClick={handleSidebarResizeDoubleClick}
              />
              <StreamerStudioSidebar
                streams={streams}
                folders={streamFolders}
                presets={streamPresets}
                activePresetId={streamerState.activePresetId}
                activeStreamIdSet={activeStreamIdSet}
                sidebarWidth={studioSidebarWidth}
                onLoadPreset={(presetId) => loadStreamPreset(presetId)}
                onDeletePreset={(presetId) => deleteStreamPreset(presetId)}
                onStackStream={handleSidebarStackStream}
                onEditStream={(streamId) => setEditingStreamId(streamId)}
                onDeleteStream={(streamId) => deleteStream(streamId)}
              />
            </aside>
          )}
        </div>

        {/* Mobile / Tablet Slide-Over Right Studio Sidebar Drawer */}
        {isActiveView &&
          subView === "grid" &&
          !isLargeViewport &&
          mobileSidebarOpen && (
            <div
              className="lg:hidden fixed inset-0 z-50 flex justify-end"
              role="dialog"
              aria-modal="true"
              aria-label="Studio Presets and Quick-Add Vault"
            >
              <div
                className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
                onClick={() => setMobileSidebarOpen(false)}
                aria-hidden="true"
              />
              <div
                className="relative z-10 w-80 max-w-[88vw] h-full border-l flex flex-col overflow-hidden"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-strong)",
                  boxShadow: "var(--shadow-popover)",
                }}
              >
                <StreamerStudioSidebar
                  streams={streams}
                  folders={streamFolders}
                  presets={streamPresets}
                  activePresetId={streamerState.activePresetId}
                  activeStreamIdSet={activeStreamIdSet}
                  sidebarWidth={320}
                  onLoadPreset={(presetId) => loadStreamPreset(presetId)}
                  onDeletePreset={(presetId) => deleteStreamPreset(presetId)}
                  onStackStream={handleSidebarStackStream}
                  onCloseMobile={() => setMobileSidebarOpen(false)}
                  onEditStream={(streamId) => {
                    setMobileSidebarOpen(false);
                    setEditingStreamId(streamId);
                  }}
                  onDeleteStream={(streamId) => deleteStream(streamId)}
                />
              </div>
            </div>
          )}

        {/* Layer 2: Refreshed Full-Canvas Stream Vault Subview */}
        {subView === "vault" && (
          <StreamVaultView
            isActiveView={isActiveView}
            streams={streams}
            folders={streamFolders}
            activeStreams={activeStreams}
            activeIdSet={activeStreamIdSet}
            playingCount={playingCount}
            isAllPaused={isAllPaused}
            allActiveMuted={allActiveMuted}
            onTogglePauseAll={() => handleTogglePauseAll(false)}
            onToggleViewMute={() => handleToggleViewMute(false)}
            onBackToGrid={() => setSubView("grid")}
            onAddStream={(stream, addToGrid) => addStream(stream, addToGrid)}
            onUpdateStream={updateStream}
            onDeleteStream={deleteStream}
            onToggleStreamInGrid={toggleStreamInGrid}
            onStackStream={handleSidebarStackStream}
            onLoadStreamsToGrid={handleVaultLoadStreams}
            onReorderStreams={reorderVaultStreams}
            onIncrementListen={incrementStreamListen}
            onAddFolder={(name, parentId) =>
              addStreamFolder(name, parentId ?? null)
            }
            onRenameFolder={(id, name) => updateStreamFolder(id, { name })}
            onUpdateFolder={(id, patch) => updateStreamFolder(id, patch)}
            onDeleteFolder={deleteStreamFolder}
            topicIcons={streamTopicIcons}
            onSetTopicIcon={(topic, icon) => setStreamTopicIcon(topic, icon)}
            channelConfigs={streamChannels}
            onUpdateChannelMeta={updateStreamChannelMeta}
            onReorderChannels={reorderStreamChannels}
            onRenameOrMergeChannels={renameOrMergeStreamChannels}
            onBatchUpdateChannels={batchUpdateStreamChannels}
            onDeleteChannels={deleteStreamChannels}
            onNotify={pushToast}
          />
        )}

        {/* Global Stream Details / Edit Drawer (opened from Quick-Add or other surfaces) */}
        {editingStream && (
          <StreamEditorDrawer
            mode="edit"
            stream={editingStream}
            allStreams={streams}
            folders={streamFolders}
            inGrid={activeStreamIdSet.has(editingStream.id)}
            onClose={() => setEditingStreamId(null)}
            onCreate={(stream, addToGrid) => addStream(stream, addToGrid)}
            onUpdate={(id, updates) => {
              updateStream(id, updates);
            }}
            onDelete={(id) => {
              deleteStream(id);
              setEditingStreamId(null);
            }}
            onToggleInGrid={(id) => toggleStreamInGrid(id)}
            onAddFolder={(name, parentId) =>
              addStreamFolder(name, parentId ?? null)
            }
            onNotify={pushToast}
          />
        )}
      </div>
    </div>
  );
});

StreamerView.displayName = "StreamerView";
