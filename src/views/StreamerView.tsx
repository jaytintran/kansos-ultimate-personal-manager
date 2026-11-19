import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FolderKanban,
  GripVertical,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  Rows2,
  Save,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { StreamVaultView } from '../components/streamer/StreamVaultView';
import { useWorkspace } from '../context/WorkspaceContext';
import { StreamItem, StreamLayoutMode } from '../types';
import {
  buildYouTubeEmbedUrl,
  parseYouTubeMessage,
  registerYouTubeListener,
  sendYouTubeCommand,
} from '../utils/youtube';

const LAYOUT_OPTIONS: { id: StreamLayoutMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: '1x1', label: '1×1' },
  { id: '2x2', label: '2×2' },
  { id: '3x3', label: '3×3' },
  { id: '4x4', label: '4×4' },
  { id: 'custom', label: 'Custom' },
  { id: 'spotlight', label: 'Spotlight' },
];

const LAYOUT_LABELS: Record<StreamLayoutMode, string> = {
  auto: 'Auto',
  '1x1': '1×1',
  '2x2': '2×2',
  '3x3': '3×3',
  '4x4': '4×4',
  custom: 'Custom',
  spotlight: 'Spotlight',
};

type StreamerSubView = 'grid' | 'vault';

export interface StreamerPlaybackSummary {
  activeCount: number;
  playingCount: number;
  isPlaying: boolean;
  isViewMuted: boolean;
  isAllPaused: boolean;
}

export interface StreamerControllerHandle {
  toggleViewMute: () => void;
  togglePauseAll: () => void;
}

export interface StreamerViewProps {
  isActiveView?: boolean;
  onPlaybackStateChange?: (summary: StreamerPlaybackSummary) => void;
}

export const StreamerView = forwardRef<StreamerControllerHandle, StreamerViewProps>(
  ({ isActiveView = true, onPlaybackStateChange }, ref) => {
    const {
      workspace,
      addStream,
      updateStream,
      deleteStream,
      toggleStreamInGrid,
      loadStreamsToGrid,
      incrementStreamListen,
      addStreamFolder,
      updateStreamFolder,
      deleteStreamFolder,
      reorderActiveStreams,
      updateStreamerState,
      saveStreamPreset,
      loadStreamPreset,
      deleteStreamPreset,
      pushToast,
    } = useWorkspace();

    const { streams, streamPresets, streamerState } = workspace;
    const streamFolders = workspace.streamFolders ?? [];

    // Main subview switcher ('grid' = Live Grid, 'vault' = Full-Canvas URL Vault Manager)
    const [subView, setSubView] = useState<StreamerSubView>('grid');
    const [presetsOpen, setPresetsOpen] = useState(false);
    const [presetNameInput, setPresetNameInput] = useState('');
    const [mobileTwoCol, setMobileTwoCol] = useState(false);
    const [expandedStreamId, setExpandedStreamId] = useState<string | null>(null);
    const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() =>
      typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true
    );

    // Audio & playback runtime state (streams start UNMUTED by default per user preference)
    const [mutedIds, setMutedIds] = useState<Record<string, boolean>>({});
    const [viewMuted, setViewMuted] = useState(false);
    const [allPaused, setAllPaused] = useState(false);
    const [playerStates, setPlayerStates] = useState<Record<string, number>>({});
    const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
    const pausedStreamIdsRef = useRef<string[]>([]);
    const handshakeTimersRef = useRef<Record<string, number[]>>({});
    const prevSummaryRef = useRef<StreamerPlaybackSummary | null>(null);

    // Drag-and-drop reorder state
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const presetsPopoverRef = useRef<HTMLDivElement | null>(null);

    // Responsive viewport listener so we render a single YouTube iframe per active stream
    useEffect(() => {
      if (typeof window === 'undefined') return;
      const mq = window.matchMedia('(min-width: 768px)');
      const handleChange = (e: MediaQueryListEvent) => setIsDesktopViewport(e.matches);
      setIsDesktopViewport(mq.matches);
      mq.addEventListener('change', handleChange);
      return () => mq.removeEventListener('change', handleChange);
    }, []);

    // Map active stream IDs to existing StreamItems
    const streamById = useMemo(() => {
      const map = new Map<string, StreamItem>();
      for (const s of streams) map.set(s.id, s);
      return map;
    }, [streams]);

    const activeStreams = useMemo(
      () =>
        streamerState.activeStreamIds
          .map((id) => streamById.get(id))
          .filter((s): s is StreamItem => Boolean(s)),
      [streamerState.activeStreamIds, streamById]
    );

    const activeIdSet = useMemo(
      () => new Set(activeStreams.map((s) => s.id)),
      [activeStreams]
    );

    const expandedStream = useMemo(
      () => (expandedStreamId ? streamById.get(expandedStreamId) || null : null),
      [expandedStreamId, streamById]
    );

    // Clean up runtime playback state & handshake timers when streams leave the active grid
    useEffect(() => {
      setPlayerStates((prev) => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const key of Object.keys(prev)) {
          if (activeIdSet.has(key)) {
            next[key] = prev[key];
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      for (const key of Object.keys(handshakeTimersRef.current)) {
        if (!activeIdSet.has(key)) {
          for (const timer of handshakeTimersRef.current[key]) {
            window.clearTimeout(timer);
          }
          delete handshakeTimersRef.current[key];
        }
      }

      if (activeStreams.length === 0) {
        setViewMuted(false);
        setAllPaused(false);
        pausedStreamIdsRef.current = [];
      }
    }, [activeIdSet, activeStreams.length]);

    // Clean up any pending handshake timers on unmount
    useEffect(() => {
      return () => {
        for (const timers of Object.values(handshakeTimersRef.current)) {
          for (const timer of timers) {
            window.clearTimeout(timer);
          }
        }
        handshakeTimersRef.current = {};
      };
    }, []);

    // Close transient overlays when switching away from Streamer so they never obscure other views
    useEffect(() => {
      if (!isActiveView) {
        setPresetsOpen(false);
        setExpandedStreamId(null);
      }
    }, [isActiveView]);

    // Listen for real-time YouTube IFrame postMessage state changes across all active streams
    const viewMutedRef = useRef(viewMuted);
    viewMutedRef.current = viewMuted;
    const mutedIdsRef = useRef(mutedIds);
    mutedIdsRef.current = mutedIds;

    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        const parsed = parseYouTubeMessage(event);
        if (!parsed) return;

        // Match message source window directly against our active iframe refs
        let matchedStreamId: string | null = null;
        for (const [streamId, iframe] of Object.entries(iframeRefs.current)) {
          if (iframe && iframe.contentWindow && iframe.contentWindow === event.source) {
            matchedStreamId = streamId;
            break;
          }
        }
        if (!matchedStreamId) return;

        // Handshake acknowledged — cancel any pending retry timers for this iframe
        if (handshakeTimersRef.current[matchedStreamId]) {
          for (const timer of handshakeTimersRef.current[matchedStreamId]) {
            window.clearTimeout(timer);
          }
          delete handshakeTimersRef.current[matchedStreamId];
        }

        if (parsed.playerState !== undefined) {
          const nextState = parsed.playerState;
          setPlayerStates((prev) =>
            prev[matchedStreamId!] === nextState
              ? prev
              : { ...prev, [matchedStreamId!]: nextState }
          );

          if (nextState === 1 || nextState === 3) {
            setAllPaused(false);
            if (viewMutedRef.current || mutedIdsRef.current[matchedStreamId]) {
              sendYouTubeCommand(
                iframeRefs.current[matchedStreamId] || null,
                'mute',
                [],
                matchedStreamId
              );
            }
          }
        }
      };

      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Register YouTube IFrame listener with brief staggered retries on iframe load
    const handleIframeLoad = useCallback((streamId: string, iframe: HTMLIFrameElement | null) => {
      if (!iframe) return;
      if (handshakeTimersRef.current[streamId]) {
        for (const timer of handshakeTimersRef.current[streamId]) {
          window.clearTimeout(timer);
        }
      }

      registerYouTubeListener(iframe, streamId);
      const t1 = window.setTimeout(() => {
        registerYouTubeListener(iframeRefs.current[streamId] || iframe, streamId);
      }, 500);
      const t2 = window.setTimeout(() => {
        registerYouTubeListener(iframeRefs.current[streamId] || iframe, streamId);
      }, 1500);
      handshakeTimersRef.current[streamId] = [t1, t2];

      if (viewMutedRef.current || mutedIdsRef.current[streamId]) {
        sendYouTubeCommand(iframe, 'mute', [], streamId);
      }
    }, []);

    // Close presets dropdown on outside click
    useEffect(() => {
      if (!presetsOpen || !isActiveView) return;
      const handlePointerDown = (e: MouseEvent) => {
        if (
          presetsPopoverRef.current &&
          !presetsPopoverRef.current.contains(e.target as Node)
        ) {
          setPresetsOpen(false);
        }
      };
      window.addEventListener('mousedown', handlePointerDown);
      return () => window.removeEventListener('mousedown', handlePointerDown);
    }, [presetsOpen, isActiveView]);

    // Escape key closes expanded stream overlay or presets popover only when Streamer is visible
    useEffect(() => {
      if (!isActiveView) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (expandedStreamId) {
            setExpandedStreamId(null);
          } else if (presetsOpen) {
            setPresetsOpen(false);
          }
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [expandedStreamId, presetsOpen, isActiveView]);

    // Derived audio & playback summary
    const allIndividuallyMuted = useMemo(
      () =>
        activeStreams.length > 0 && activeStreams.every((s) => Boolean(mutedIds[s.id])),
      [activeStreams, mutedIds]
    );

    const allActiveMuted = viewMuted || allIndividuallyMuted;

    const playingCount = useMemo(
      () =>
        activeStreams.filter((s) => {
          const st = playerStates[s.id];
          return st === 1 || st === 3;
        }).length,
      [activeStreams, playerStates]
    );

    const isPlaying = playingCount > 0;
    const isAllPaused = allPaused && activeStreams.length > 0 && !isPlaying;

    // Notify parent shell only when summary primitives change
    useEffect(() => {
      if (!onPlaybackStateChange) return;
      const next: StreamerPlaybackSummary = {
        activeCount: activeStreams.length,
        playingCount,
        isPlaying,
        isViewMuted: allActiveMuted,
        isAllPaused,
      };
      const prev = prevSummaryRef.current;
      if (
        prev &&
        prev.activeCount === next.activeCount &&
        prev.playingCount === next.playingCount &&
        prev.isPlaying === next.isPlaying &&
        prev.isViewMuted === next.isViewMuted &&
        prev.isAllPaused === next.isAllPaused
      ) {
        return;
      }
      prevSummaryRef.current = next;
      onPlaybackStateChange(next);
    }, [
      activeStreams.length,
      playingCount,
      isPlaying,
      allActiveMuted,
      isAllPaused,
      onPlaybackStateChange,
    ]);

    const handleToggleCardMute = (streamId: string) => {
      if (viewMuted) {
        const nextMap: Record<string, boolean> = { ...mutedIds };
        for (const s of activeStreams) {
          const shouldMute = s.id !== streamId;
          nextMap[s.id] = shouldMute;
          sendYouTubeCommand(
            iframeRefs.current[s.id] || null,
            shouldMute ? 'mute' : 'unMute',
            [],
            s.id
          );
        }
        setViewMuted(false);
        setMutedIds(nextMap);
        return;
      }

      const currentlyMuted = Boolean(mutedIds[streamId]);
      const nextMuted = !currentlyMuted;
      setMutedIds((prev) => ({ ...prev, [streamId]: nextMuted }));
      sendYouTubeCommand(
        iframeRefs.current[streamId] || null,
        nextMuted ? 'mute' : 'unMute',
        [],
        streamId
      );
    };

    // Non-destructive temporary view mute (preserves individual per-card mute choices on unmute)
    const handleToggleViewMute = useCallback(
      (silentToast = false) => {
        if (activeStreams.length === 0) return;

        if (!allActiveMuted) {
          setViewMuted(true);
          for (const s of activeStreams) {
            sendYouTubeCommand(iframeRefs.current[s.id] || null, 'mute', [], s.id);
          }
          if (!silentToast) pushToast('Muted all active streams');
          return;
        }

        if (viewMuted) {
          setViewMuted(false);
          if (allIndividuallyMuted) {
            const nextMap: Record<string, boolean> = { ...mutedIds };
            for (const s of activeStreams) {
              nextMap[s.id] = false;
              sendYouTubeCommand(iframeRefs.current[s.id] || null, 'unMute', [], s.id);
            }
            setMutedIds(nextMap);
          } else {
            for (const s of activeStreams) {
              if (!mutedIds[s.id]) {
                sendYouTubeCommand(iframeRefs.current[s.id] || null, 'unMute', [], s.id);
              }
            }
          }
          if (!silentToast) pushToast('Unmuted active streams');
          return;
        }

        const nextMap: Record<string, boolean> = { ...mutedIds };
        for (const s of activeStreams) {
          nextMap[s.id] = false;
          sendYouTubeCommand(iframeRefs.current[s.id] || null, 'unMute', [], s.id);
        }
        setMutedIds(nextMap);
        if (!silentToast) pushToast('Unmuted all active streams');
      },
      [activeStreams, allActiveMuted, viewMuted, allIndividuallyMuted, mutedIds, pushToast]
    );

    const handleTogglePauseAll = useCallback(
      (silentToast = false) => {
        if (activeStreams.length === 0) return;

        if (isAllPaused) {
          const savedTargets = pausedStreamIdsRef.current.filter((id) => activeIdSet.has(id));
          const targets =
            savedTargets.length > 0 ? savedTargets : activeStreams.map((s) => s.id);
          for (const id of targets) {
            sendYouTubeCommand(iframeRefs.current[id] || null, 'playVideo', [], id);
            if (viewMutedRef.current || mutedIdsRef.current[id]) {
              sendYouTubeCommand(iframeRefs.current[id] || null, 'mute', [], id);
            }
          }
          setAllPaused(false);
          setPlayerStates((prev) => {
            const next = { ...prev };
            for (const id of targets) next[id] = 1;
            return next;
          });
          if (!silentToast) pushToast('Resumed streams');
          return;
        }

        const currentlyPlayingIds = activeStreams
          .filter((s) => playerStates[s.id] === 1 || playerStates[s.id] === 3)
          .map((s) => s.id);
        pausedStreamIdsRef.current =
          currentlyPlayingIds.length > 0
            ? currentlyPlayingIds
            : activeStreams.map((s) => s.id);

        for (const s of activeStreams) {
          sendYouTubeCommand(iframeRefs.current[s.id] || null, 'pauseVideo', [], s.id);
        }
        setAllPaused(true);
        setPlayerStates((prev) => {
          const next = { ...prev };
          for (const s of activeStreams) {
            if (next[s.id] === 1 || next[s.id] === 3) next[s.id] = 2;
          }
          return next;
        });
        if (!silentToast) pushToast('Paused all active streams');
      },
      [activeStreams, activeIdSet, isAllPaused, playerStates, pushToast]
    );

    // Expose imperative controls for KansoShell's Streamer nav tab buttons
    useImperativeHandle(
      ref,
      () => ({
        toggleViewMute: () => handleToggleViewMute(true),
        togglePauseAll: () => handleTogglePauseAll(true),
      }),
      [handleToggleViewMute, handleTogglePauseAll]
    );

    // Spotlight resolution
    const spotlightPrimary = useMemo(() => {
      if (activeStreams.length === 0) return null;
      const preferred = streamerState.spotlightStreamId
        ? activeStreams.find((s) => s.id === streamerState.spotlightStreamId)
        : null;
      return preferred || activeStreams[0];
    }, [activeStreams, streamerState.spotlightStreamId]);

    const spotlightSecondary = useMemo(() => {
      if (!spotlightPrimary) return [];
      return activeStreams.filter((s) => s.id !== spotlightPrimary.id);
    }, [activeStreams, spotlightPrimary]);

    // Desktop CSS grid column calculation
    const desktopColumns = useMemo(() => {
      const count = activeStreams.length;
      switch (streamerState.layoutMode) {
        case '1x1':
          return 1;
        case '2x2':
          return 2;
        case '3x3':
          return 3;
        case '4x4':
          return 4;
        case 'custom':
          return Math.max(1, Math.min(6, streamerState.customCols));
        case 'auto':
        default:
          if (count <= 1) return 1;
          if (count <= 4) return 2;
          if (count <= 9) return 3;
          return 4;
      }
    }, [streamerState.layoutMode, streamerState.customCols, activeStreams.length]);

    const handleSavePresetSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = presetNameInput.trim();
      if (!trimmed) return;
      saveStreamPreset(trimmed);
      setPresetNameInput('');
    };

    // Drag & drop handlers for reordering active grid cards
    const handleCardDragStart = (index: number) => {
      setDragIndex(index);
    };

    const handleCardDragOver = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== index) {
        setDragOverIndex(index);
      }
    };

    const handleCardDrop = (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== dropIndex) {
        reorderActiveStreams(dragIndex, dropIndex);
      }
      setDragIndex(null);
      setDragOverIndex(null);
    };

    const handleCardDragEnd = () => {
      setDragIndex(null);
      setDragOverIndex(null);
    };

    // Render a single live YouTube stream card
    const renderStreamCard = (
      stream: StreamItem,
      activeIndex: number,
      options?: { isPrimarySpotlight?: boolean; compact?: boolean }
    ) => {
      const isMuted = viewMuted || Boolean(mutedIds[stream.id]);
      const isDragging = dragIndex === activeIndex;
      const isDropTarget = dragOverIndex === activeIndex && dragIndex !== activeIndex;
      const isSpotlightMode = streamerState.layoutMode === 'spotlight';
      const isPrimary = Boolean(options?.isPrimarySpotlight);
      const compact = Boolean(options?.compact);

      return (
        <article
          key={stream.id}
          draggable
          onDragStart={() => handleCardDragStart(activeIndex)}
          onDragOver={(e) => handleCardDragOver(e, activeIndex)}
          onDrop={(e) => handleCardDrop(e, activeIndex)}
          onDragEnd={handleCardDragEnd}
          className="rounded-xl border overflow-hidden flex flex-col transition-all"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: isDropTarget
              ? 'var(--accent)'
              : isPrimary
              ? 'var(--border-strong)'
              : 'var(--border-subtle)',
            opacity: isDragging ? 0.55 : 1,
            outline: isDropTarget ? '2px solid var(--accent)' : 'none',
            outlineOffset: '1px',
          }}
        >
          {/* Stream Card Header */}
          <div
            className="px-2.5 py-2 border-b flex items-center justify-between gap-2"
            style={{
              borderColor: 'var(--border-subtle)',
              backgroundColor: 'var(--bg-surface-subtle)',
            }}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span
                className="hidden sm:inline-flex items-center justify-center cursor-grab active:cursor-grabbing shrink-0"
                style={{ color: 'var(--text-muted)' }}
                title="Drag to reorder"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={`${compact ? 'text-xs' : 'text-xs sm:text-sm'} font-medium truncate`}
                  title={stream.customLabel || stream.title}
                >
                  {stream.customLabel || stream.title}
                </div>
                {!compact && (
                  <div
                    className="text-[11px] truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {[stream.channel || 'YouTube', stream.category]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
              </div>
            </div>

            {/* Per-Card Action Controls */}
            <div className="flex items-center gap-0.5 shrink-0">
              {activeStreams.length > 1 && (
                <>
                  <button
                    type="button"
                    disabled={activeIndex === 0}
                    onClick={() => reorderActiveStreams(activeIndex, activeIndex - 1)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-30"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Move earlier in grid"
                    aria-label="Move stream left"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={activeIndex === activeStreams.length - 1}
                    onClick={() => reorderActiveStreams(activeIndex, activeIndex + 1)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-30"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Move later in grid"
                    aria-label="Move stream right"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </>
              )}

              {(!isSpotlightMode || !isPrimary) && activeStreams.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    updateStreamerState({
                      layoutMode: 'spotlight',
                      spotlightStreamId: stream.id,
                      activePresetId: null,
                    })
                  }
                  className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)]"
                  style={{ color: 'var(--text-secondary)' }}
                  title="Spotlight this stream"
                  aria-label="Spotlight stream"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => handleToggleCardMute(stream.id)}
                className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{
                  color: isMuted ? 'var(--danger)' : 'var(--text-secondary)',
                }}
                title={isMuted ? 'Unmute stream' : 'Mute stream'}
                aria-label={isMuted ? 'Unmute stream' : 'Mute stream'}
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setExpandedStreamId(stream.id)}
                className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{ color: 'var(--text-secondary)' }}
                title="Expand stream"
                aria-label="Expand stream"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => toggleStreamInGrid(stream.id)}
                className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{ color: 'var(--text-muted)' }}
                title="Remove from grid (keeps saved URL in Vault)"
                aria-label="Remove stream from grid"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* YouTube Player Frame (16:9, starts UNMUTED by default) */}
          <div className="relative w-full aspect-video bg-black">
            <iframe
              ref={(el) => {
                iframeRefs.current[stream.id] = el;
              }}
              onLoad={(e) => handleIframeLoad(stream.id, e.currentTarget)}
              src={buildYouTubeEmbedUrl(stream.videoId)}
              title={stream.customLabel || stream.title}
              className="absolute inset-0 w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </article>
      );
    };

    const handleVaultLoadStreams = useCallback(
      (streamIds: string[], mode: 'replace' | 'append' = 'replace', label?: string) => {
        loadStreamsToGrid(streamIds, mode, label);
        if (mode === 'replace') {
          setSubView('grid');
        }
      },
      [loadStreamsToGrid]
    );

    return (
      <div className="flex flex-col h-[calc(100dvh-3rem-3.75rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] lg:h-dvh min-h-[520px] overflow-hidden">
        {/* Top Control Toolbar */}
        <header
          className="px-4 sm:px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Left: Title + Cohesive Segmented Live Grid / Vault Switcher */}
          <div className="flex items-center gap-3.5 min-w-0">
            <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight whitespace-nowrap">
              Streamer
            </h1>

            <div
              className="inline-flex items-center gap-0.5 p-1 rounded-xl border shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                borderColor: 'var(--border-subtle)',
              }}
              role="tablist"
              aria-label="Streamer subview"
            >
              <button
                type="button"
                role="tab"
                aria-selected={subView === 'grid'}
                onClick={() => setSubView('grid')}
                className="h-7 px-2.5 sm:px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: subView === 'grid' ? 'var(--bg-surface)' : 'transparent',
                  color: subView === 'grid' ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Live Grid</span>
                <span
                  className="text-[11px] font-mono tabular-nums opacity-75"
                  style={{ color: subView === 'grid' ? 'var(--accent)' : 'var(--text-muted)' }}
                >
                  {activeStreams.length}
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={subView === 'vault'}
                onClick={() => setSubView('vault')}
                className="h-7 px-2.5 sm:px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: subView === 'vault' ? 'var(--bg-surface)' : 'transparent',
                  color: subView === 'vault' ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <FolderKanban className="w-3.5 h-3.5" />
                <span>Vault</span>
                <span
                  className="text-[11px] font-mono tabular-nums opacity-75"
                  style={{ color: subView === 'vault' ? 'var(--accent)' : 'var(--text-muted)' }}
                >
                  {streams.length}
                </span>
              </button>
            </div>
          </div>

          {/* Right Controls (Contextual to Live Grid vs Vault) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Live Grid Layout Controls (shown only on Live Grid) */}
            {subView === 'grid' && (
              <>
                <div
                  className="hidden md:inline-flex items-center gap-0.5 p-1 rounded-xl border"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                  }}
                  role="group"
                  aria-label="Stream grid layout"
                >
                  {LAYOUT_OPTIONS.map((opt) => {
                    const active = streamerState.layoutMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          updateStreamerState({
                            layoutMode: opt.id,
                            activePresetId: null,
                          })
                        }
                        className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                        style={{
                          backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {streamerState.layoutMode === 'custom' && (
                  <div
                    className="hidden md:inline-flex items-center gap-2 px-2.5 py-1 rounded-xl border text-xs font-mono tabular-nums"
                    style={{
                      backgroundColor: 'var(--bg-surface-subtle)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)' }}>Cols</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateStreamerState({
                          customCols: Math.max(1, streamerState.customCols - 1),
                          activePresetId: null,
                        })
                      }
                      className="h-6 w-6 rounded-md border flex items-center justify-center"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                      aria-label="Decrease columns"
                    >
                      -
                    </button>
                    <span className="w-3 text-center font-semibold">
                      {streamerState.customCols}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateStreamerState({
                          customCols: Math.min(6, streamerState.customCols + 1),
                          activePresetId: null,
                        })
                      }
                      className="h-6 w-6 rounded-md border flex items-center justify-center"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                      aria-label="Increase columns"
                    >
                      +
                    </button>

                    <span className="mx-0.5" style={{ color: 'var(--text-muted)' }}>
                      ×
                    </span>

                    <span style={{ color: 'var(--text-muted)' }}>Rows</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateStreamerState({
                          customRows: Math.max(1, streamerState.customRows - 1),
                          activePresetId: null,
                        })
                      }
                      className="h-6 w-6 rounded-md border flex items-center justify-center"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                      aria-label="Decrease rows"
                    >
                      -
                    </button>
                    <span className="w-3 text-center font-semibold">
                      {streamerState.customRows}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateStreamerState({
                          customRows: Math.min(4, streamerState.customRows + 1),
                          activePresetId: null,
                        })
                      }
                      className="h-6 w-6 rounded-md border flex items-center justify-center"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                      aria-label="Increase rows"
                    >
                      +
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setMobileTwoCol((prev) => !prev)}
                  className="md:hidden h-9 px-2.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5"
                  style={{
                    backgroundColor: mobileTwoCol ? 'var(--accent-soft)' : 'var(--bg-surface)',
                    borderColor: mobileTwoCol ? 'var(--accent)' : 'var(--border-subtle)',
                    color: mobileTwoCol ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                  aria-label="Toggle 1-column or 2-column mobile grid"
                >
                  {mobileTwoCol ? (
                    <>
                      <Columns2 className="w-3.5 h-3.5" />
                      <span>2-Col</span>
                    </>
                  ) : (
                    <>
                      <Rows2 className="w-3.5 h-3.5" />
                      <span>1-Col</span>
                    </>
                  )}
                </button>
              </>
            )}

            {/* Named Grid Presets Popover */}
            <div className="relative" ref={presetsPopoverRef}>
              <button
                type="button"
                onClick={() => setPresetsOpen((prev) => !prev)}
                className="h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: presetsOpen ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  borderColor: presetsOpen ? 'var(--accent)' : 'var(--border-subtle)',
                  color: presetsOpen ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Presets</span>
                <span className="font-mono tabular-nums opacity-75">
                  ({streamPresets.length})
                </span>
              </button>

              {presetsOpen && (
                <div
                  className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl border p-3.5 space-y-3 z-40"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-strong)',
                    boxShadow: 'var(--shadow-popover)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Saved Grid Presets</span>
                    <button
                      type="button"
                      onClick={() => setPresetsOpen(false)}
                      className="h-6 w-6 flex items-center justify-center rounded-md"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <form onSubmit={handleSavePresetSubmit} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={presetNameInput}
                      onChange={(e) => setPresetNameInput(e.target.value)}
                      placeholder="Save current grid as..."
                      className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border text-xs outline-none"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={!presetNameInput.trim()}
                      className="h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-45 shrink-0"
                      style={{
                        backgroundColor: 'var(--accent)',
                        color: 'var(--accent-fg)',
                      }}
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </button>
                  </form>

                  <div className="space-y-1 max-h-56 overflow-y-auto">
                    {streamPresets.length === 0 ? (
                      <div
                        className="text-xs py-4 text-center"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        No presets saved yet.
                      </div>
                    ) : (
                      streamPresets.map((preset) => {
                        const isActivePreset = streamerState.activePresetId === preset.id;
                        const layoutSummary =
                          preset.layoutMode === 'custom'
                            ? `${preset.customCols}×${preset.customRows}`
                            : LAYOUT_LABELS[preset.layoutMode];
                        return (
                          <div
                            key={preset.id}
                            className="flex items-center justify-between gap-2 p-2 rounded-xl border transition-colors"
                            style={{
                              backgroundColor: isActivePreset
                                ? 'var(--accent-soft)'
                                : 'var(--bg-surface)',
                              borderColor: isActivePreset
                                ? 'var(--accent)'
                                : 'var(--border-subtle)',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                loadStreamPreset(preset.id);
                                setPresetsOpen(false);
                                setSubView('grid');
                              }}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="text-xs font-semibold truncate">
                                {preset.name}
                              </div>
                              <div
                                className="text-[11px] font-mono tabular-nums"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {layoutSummary} · {preset.streamIds.length} streams
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteStreamPreset(preset.id)}
                              className="h-7 w-7 flex items-center justify-center rounded-lg shrink-0"
                              style={{ color: 'var(--text-muted)' }}
                              title="Delete preset"
                              aria-label={`Delete preset ${preset.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Global Pause & Mute Controls on Live Grid toolbar */}
            {subView === 'grid' && activeStreams.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => handleTogglePauseAll(false)}
                  className="h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: isAllPaused ? 'var(--accent-soft)' : 'var(--bg-surface)',
                    borderColor: isAllPaused ? 'var(--accent)' : 'var(--border-subtle)',
                    color: isAllPaused ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                  title={isAllPaused ? 'Resume all streams' : 'Pause all streams'}
                >
                  {isAllPaused ? (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Resume All</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Pause All</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleViewMute(false)}
                  className="h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
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
                      <span className="hidden sm:inline">Unmute All</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Mute All</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </header>

        {/* Main Canvas Area — Live Grid stays mounted offscreen when Vault is open so audio NEVER stops */}
        <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Layer 1: Live Multi-Stream Grid (permanently mounted for uninterrupted playback) */}
          <div
            aria-hidden={subView !== 'grid'}
            className={
              subView === 'grid'
                ? 'flex-1 overflow-y-auto p-4 sm:p-5'
                : 'fixed -left-[9999px] top-0 w-[1024px] h-[600px] opacity-0 pointer-events-none select-none overflow-hidden'
            }
          >
            {activeStreams.length === 0 ? (
              <div className="h-full min-h-[340px] flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
                <div
                  className="w-12 h-12 rounded-2xl border flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--accent)',
                  }}
                >
                  <LayoutGrid className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="font-display text-base font-bold">No active streams in grid</h2>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Open your Vault to pick subliminals, frequencies, or entire listening folders
                    to launch onto your live multi-stream grid.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSubView('vault')}
                    className="h-10 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: 'var(--accent-fg)',
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Open Vault</span>
                  </button>
                  {streamPresets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => loadStreamPreset(streamPresets[0].id)}
                      className="h-10 px-4 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>Load {streamPresets[0].name}</span>
                    </button>
                  )}
                </div>
              </div>
            ) : streamerState.layoutMode === 'spotlight' && spotlightPrimary ? (
              <div className="space-y-4 max-w-[1600px] mx-auto">
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start">
                  <div className="xl:col-span-3">
                    {renderStreamCard(
                      spotlightPrimary,
                      activeStreams.findIndex((s) => s.id === spotlightPrimary.id),
                      { isPrimarySpotlight: true }
                    )}
                  </div>

                  {spotlightSecondary.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
                      {spotlightSecondary.map((stream) =>
                        renderStreamCard(
                          stream,
                          activeStreams.findIndex((s) => s.id === stream.id),
                          { compact: true }
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div
                  className={`grid ${
                    isDesktopViewport
                      ? 'gap-3.5 max-w-[1800px] mx-auto'
                      : `gap-3 ${mobileTwoCol ? 'grid-cols-2' : 'grid-cols-1'}`
                  }`}
                  style={
                    isDesktopViewport
                      ? {
                          gridTemplateColumns: `repeat(${desktopColumns}, minmax(0, 1fr))`,
                        }
                      : undefined
                  }
                >
                  {(isDesktopViewport && streamerState.layoutMode === 'custom'
                    ? activeStreams.slice(0, streamerState.customCols * streamerState.customRows)
                    : activeStreams
                  ).map((stream, index) =>
                    renderStreamCard(stream, index, {
                      compact: isDesktopViewport ? desktopColumns >= 4 : mobileTwoCol,
                    })
                  )}
                </div>

                {isDesktopViewport &&
                  streamerState.layoutMode === 'custom' &&
                  activeStreams.length > streamerState.customCols * streamerState.customRows && (
                    <div
                      className="text-center text-xs mt-4 font-mono tabular-nums"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Showing {streamerState.customCols * streamerState.customRows} of{' '}
                      {activeStreams.length} active streams (increase custom rows/cols to show
                      more).
                    </div>
                  )}
              </>
            )}
          </div>

          {/* Layer 2: Full-Canvas Stream Vault Subview */}
          {subView === 'vault' && (
            <StreamVaultView
              isActiveView={isActiveView}
              streams={streams}
              folders={streamFolders}
              activeStreams={activeStreams}
              activeIdSet={activeIdSet}
              playingCount={playingCount}
              isAllPaused={isAllPaused}
              allActiveMuted={allActiveMuted}
              onTogglePauseAll={() => handleTogglePauseAll(false)}
              onToggleViewMute={() => handleToggleViewMute(false)}
              onBackToGrid={() => setSubView('grid')}
              onAddStream={(stream, addToGrid) => addStream(stream, addToGrid)}
              onUpdateStream={updateStream}
              onDeleteStream={(id) => {
                if (expandedStreamId === id) setExpandedStreamId(null);
                deleteStream(id);
              }}
              onToggleStreamInGrid={toggleStreamInGrid}
              onLoadStreamsToGrid={handleVaultLoadStreams}
              onIncrementListen={incrementStreamListen}
              onAddFolder={(name, parentId) => addStreamFolder(name, parentId ?? null)}
              onRenameFolder={(id, name) => updateStreamFolder(id, { name })}
              onDeleteFolder={deleteStreamFolder}
              onNotify={pushToast}
            />
          )}
        </div>

        {/* Expanded / Maximized Single Stream Overlay — only rendered while Streamer Grid is active */}
        {isActiveView && subView === 'grid' && expandedStream && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={`Expanded stream: ${expandedStream.customLabel || expandedStream.title}`}
          >
            <div
              className="fixed inset-0 bg-black/75 backdrop-blur-sm"
              onClick={() => setExpandedStreamId(null)}
              aria-hidden="true"
            />
            <div
              className="relative z-10 w-full max-w-6xl rounded-2xl border overflow-hidden flex flex-col"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
                boxShadow: 'var(--shadow-popover)',
              }}
            >
              <div
                className="px-4 py-3 border-b flex items-center justify-between gap-3"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {expandedStream.customLabel || expandedStream.title}
                  </div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    {[expandedStream.channel || 'YouTube', expandedStream.category]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedStreamId(null)}
                  className="h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Restore Grid</span>
                </button>
              </div>

              <div className="relative w-full aspect-video max-h-[80dvh] bg-black">
                <iframe
                  src={buildYouTubeEmbedUrl(expandedStream.videoId)}
                  title={expandedStream.customLabel || expandedStream.title}
                  className="absolute inset-0 w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

StreamerView.displayName = 'StreamerView';
