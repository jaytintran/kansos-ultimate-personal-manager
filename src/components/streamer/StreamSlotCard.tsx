import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  ExternalLink,
  Infinity as InfinityIcon,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { StackSlot, StreamItem, StreamViewMode } from '../../types';
import { buildYouTubeEmbedUrl } from '../../utils/youtube';

interface StreamSlotCardProps {
  slot: StackSlot;
  stream: StreamItem;
  index: number;
  viewMode: StreamViewMode;
  cleanPlayer: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isGloballyMuted: boolean;
  completedLoops: number;
  loopTargetReached: boolean;
  isDragging: boolean;
  isAnyDragging: boolean;
  dropPosition: 'before' | 'after' | null;
  singleColDropAxis: boolean;
  canReorder: boolean;
  cardRef?: (el: HTMLElement | null) => void;
  iframeRef: (el: HTMLIFrameElement | null) => void;
  onIframeLoad: (iframe: HTMLIFrameElement | null) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onHeaderTouchDragStart: () => void;
  onHeaderTouchDragMove: (clientX: number, clientY: number) => void;
  onHeaderTouchDragEnd: (clientX: number, clientY: number) => void;
  onHeaderTouchDragCancel: () => void;
  onTogglePlayPause: () => void;
  onSeek: (seconds: number) => void;
  onToggleMute: () => void;
  onChangeVolume: (volume: number) => void;
  onSetLoopMode: (mode: 'infinite' | 'count') => void;
  onChangeLoopCount: (count: number) => void;
  onResetLoop: () => void;
  onRemove: () => void;
}

function formatPlaybackTimestamp(rawSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(rawSeconds) ? rawSeconds : 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export const StreamSlotCard: React.FC<StreamSlotCardProps> = ({
  slot,
  stream,
  index,
  viewMode,
  cleanPlayer,
  isPlaying,
  currentTime,
  duration,
  isGloballyMuted,
  completedLoops,
  loopTargetReached,
  isDragging,
  isAnyDragging,
  dropPosition,
  singleColDropAxis,
  canReorder,
  cardRef,
  iframeRef,
  onIframeLoad,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onHeaderTouchDragStart,
  onHeaderTouchDragMove,
  onHeaderTouchDragEnd,
  onHeaderTouchDragCancel,
  onTogglePlayPause,
  onSeek,
  onToggleMute,
  onChangeVolume,
  onSetLoopMode,
  onChangeLoopCount,
  onResetLoop,
  onRemove,
}) => {
  const effectiveMuted = isGloballyMuted || slot.muted || slot.volume === 0;
  const displayedVolume = effectiveMuted ? 0 : slot.volume;
  const isInfinite = slot.loopMode === 'infinite';
  const loopStatusText = isInfinite
    ? `${completedLoops}/∞ loops`
    : loopTargetReached
      ? `${completedLoops}/${slot.loopCount} done`
      : `${completedLoops}/${slot.loopCount} loops`;

  const displayTitle = stream.customLabel || stream.title;
  const subtitleParts = [
    stream.channel || 'YouTube',
    stream.category || 'General',
    loopStatusText,
  ].filter(Boolean);

  const isMixer = viewMode === 'mixer';
  const isTiles = viewMode === 'tiles';

  const watchUrl = `https://www.youtube.com/watch?v=${stream.videoId}`;

  // Manual numeric loop count draft & compact loop dropdown state
  const [loopDraft, setLoopDraft] = useState(String(slot.loopCount));
  const [isEditingLoop, setIsEditingLoop] = useState(false);
  const [loopMenuOpen, setLoopMenuOpen] = useState(false);
  const [loopMenuPos, setLoopMenuPos] = useState<{
    left: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const loopTriggerRef = useRef<HTMLButtonElement | null>(null);
  const loopMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isEditingLoop) {
      setLoopDraft(String(slot.loopCount));
    }
  }, [slot.loopCount, isEditingLoop]);

  const commitLoopDraft = (closeMenuAfter = false) => {
    setIsEditingLoop(false);
    const parsed = parseInt(loopDraft, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      const clamped = Math.min(999, parsed);
      onChangeLoopCount(clamped);
      setLoopDraft(String(clamped));
    } else {
      setLoopDraft(String(slot.loopCount));
    }
    if (closeMenuAfter) {
      setLoopMenuOpen(false);
    }
  };

  const openOrToggleLoopMenu = () => {
    if (loopMenuOpen) {
      setLoopMenuOpen(false);
      return;
    }
    const triggerEl = loopTriggerRef.current;
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const menuWidth = 196;
    const left = Math.min(
      Math.max(8, window.innerWidth - menuWidth - 8),
      Math.max(8, rect.right - menuWidth),
    );
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow >= 230 || spaceBelow >= rect.top) {
      setLoopMenuPos({ left, top: rect.bottom + 6 });
    } else {
      setLoopMenuPos({ left, bottom: window.innerHeight - rect.top + 6 });
    }
    setLoopMenuOpen(true);
  };

  useEffect(() => {
    if (!loopMenuOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (
        loopTriggerRef.current?.contains(target) ||
        loopMenuRef.current?.contains(target)
      ) {
        return;
      }
      setLoopMenuOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLoopMenuOpen(false);
        loopTriggerRef.current?.focus();
      }
    };

    const handleScrollOrResize = (e: Event) => {
      if (
        e.type === 'scroll' &&
        e.target instanceof Node &&
        loopMenuRef.current?.contains(e.target)
      ) {
        return;
      }
      setLoopMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [loopMenuOpen]);

  // Header-only drag guard (desktop HTML5 drag + mobile touch-hold)
  const dragAllowedFromHeaderRef = useRef(false);
  const didDragRef = useRef(false);
  const touchHoldRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    timerId: number | null;
    activated: boolean;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (touchHoldRef.current?.timerId !== null && touchHoldRef.current?.timerId !== undefined) {
        window.clearTimeout(touchHoldRef.current.timerId);
      }
      touchHoldRef.current = null;
    };
  }, []);

  // Video overlay & Play-button touch-scroll guards
  const lastVideoPointerTypeRef = useRef<string>('mouse');
  const playButtonPointerStartRef = useRef<{
    x: number;
    y: number;
    pointerType: string;
  } | null>(null);

  const handlePlayButtonPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    playButtonPointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      pointerType: e.pointerType,
    };
  };

  const handlePlayButtonClick = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    const start = playButtonPointerStartRef.current;
    playButtonPointerStartRef.current = null;
    if (start && start.pointerType !== 'mouse') {
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (moved > 8) return;
    }
    onTogglePlayPause();
  };

  // Seekable progress bar hover + pointer scrub state (supports pan-y vertical scrolling on touch)
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
  const activeScrubPointerIdRef = useRef<number | null>(null);
  const pendingSeekTouchRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);

  const computeFraction = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const canSeek = duration > 0 && Number.isFinite(duration);
  const liveFraction = canSeek ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  const displayedFraction = scrubFraction !== null ? scrubFraction : liveFraction;
  const activeTooltipFraction = scrubFraction !== null ? scrubFraction : hoverFraction;
  const tooltipSeconds =
    activeTooltipFraction !== null && canSeek ? activeTooltipFraction * duration : 0;

  // Thin custom volume bar state (shows % tooltip strictly while adjusting)
  const volumeTrackRef = useRef<HTMLDivElement | null>(null);
  const activeVolumePointerIdRef = useRef<number | null>(null);
  const volumeToastTimerRef = useRef<number | null>(null);
  const [isAdjustingVolume, setIsAdjustingVolume] = useState(false);

  useEffect(() => {
    return () => {
      if (volumeToastTimerRef.current !== null) {
        window.clearTimeout(volumeToastTimerRef.current);
      }
    };
  }, []);

  const computeVolumeFromClientX = (clientX: number): number => {
    const el = volumeTrackRef.current;
    if (!el) return slot.volume;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return slot.volume;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(frac * 100);
  };

  const flashVolumeTooltip = () => {
    setIsAdjustingVolume(true);
    if (volumeToastTimerRef.current !== null) {
      window.clearTimeout(volumeToastTimerRef.current);
    }
    volumeToastTimerRef.current = window.setTimeout(() => {
      volumeToastTimerRef.current = null;
      if (activeVolumePointerIdRef.current === null) {
        setIsAdjustingVolume(false);
      }
    }, 850);
  };

  const renderFlushSeekBar = () => (
    <div
      ref={trackRef}
      data-progress-scrub="true"
      role="slider"
      tabIndex={canSeek ? 0 : -1}
      aria-label={`Seek position for ${displayTitle}`}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration || 0)}
      aria-valuenow={Math.round(currentTime || 0)}
      onPointerEnter={(e) => {
        if (!canSeek || e.pointerType !== 'mouse') return;
        setHoverFraction(computeFraction(e.clientX));
      }}
      onPointerMove={(e) => {
        if (!canSeek) return;
        if (activeScrubPointerIdRef.current === e.pointerId) {
          setScrubFraction(computeFraction(e.clientX));
          return;
        }
        const pending = pendingSeekTouchRef.current;
        if (pending && pending.pointerId === e.pointerId) {
          const dx = Math.abs(e.clientX - pending.startX);
          const dy = Math.abs(e.clientY - pending.startY);
          if (dy > 6 && dy > dx) {
            pendingSeekTouchRef.current = null;
            return;
          }
          if (dx >= 6 && dx >= dy) {
            pendingSeekTouchRef.current = null;
            activeScrubPointerIdRef.current = e.pointerId;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // ignore
            }
            const frac = computeFraction(e.clientX);
            setScrubFraction(frac);
            setHoverFraction(frac);
          }
          return;
        }
        if (e.pointerType === 'mouse') {
          setHoverFraction(computeFraction(e.clientX));
        }
      }}
      onPointerLeave={() => {
        if (activeScrubPointerIdRef.current === null) {
          setHoverFraction(null);
        }
      }}
      onPointerDown={(e) => {
        if (!canSeek) return;
        e.stopPropagation();
        if (e.pointerType === 'mouse') {
          activeScrubPointerIdRef.current = e.pointerId;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          const frac = computeFraction(e.clientX);
          setScrubFraction(frac);
          setHoverFraction(frac);
        } else {
          pendingSeekTouchRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
          };
        }
      }}
      onPointerUp={(e) => {
        if (activeScrubPointerIdRef.current === e.pointerId) {
          e.stopPropagation();
          const frac = computeFraction(e.clientX);
          activeScrubPointerIdRef.current = null;
          pendingSeekTouchRef.current = null;
          setScrubFraction(null);
          if (canSeek) {
            onSeek(frac * duration);
          }
          return;
        }
        const pending = pendingSeekTouchRef.current;
        if (pending && pending.pointerId === e.pointerId) {
          const moved = Math.hypot(
            e.clientX - pending.startX,
            e.clientY - pending.startY,
          );
          pendingSeekTouchRef.current = null;
          if (moved < 6 && canSeek) {
            e.stopPropagation();
            onSeek(computeFraction(e.clientX) * duration);
          }
        }
      }}
      onPointerCancel={(e) => {
        if (activeScrubPointerIdRef.current === e.pointerId) {
          activeScrubPointerIdRef.current = null;
          setScrubFraction(null);
        }
        if (pendingSeekTouchRef.current?.pointerId === e.pointerId) {
          pendingSeekTouchRef.current = null;
        }
        setHoverFraction(null);
      }}
      onKeyDown={(e) => {
        if (!canSeek) return;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onSeek(Math.max(0, currentTime - 5));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          onSeek(Math.min(duration, currentTime + 5));
        }
      }}
      className={`absolute inset-x-0 bottom-0 z-20 h-6 flex items-end touch-pan-y select-none group/scrub ${
        canSeek ? 'cursor-pointer' : 'cursor-default opacity-60'
      }`}
    >
      {/* Hover / Scrubbing Timestamp Tooltip positioned cleanly above the 24px hit area */}
      {activeTooltipFraction !== null && canSeek && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-6 -translate-x-1/2 px-1.5 py-0.5 rounded-md border text-[10px] font-mono tabular-nums whitespace-nowrap z-30"
          style={{
            left: `${Math.min(88, Math.max(12, activeTooltipFraction * 100))}%`,
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-primary)',
            boxShadow: 'var(--shadow-popover)',
          }}
        >
          {formatPlaybackTimestamp(tooltipSeconds)} / {formatPlaybackTimestamp(duration)}
        </div>
      )}

      {/* Razor-slim 3px visual track flush at bottom edge of video */}
      <div
        className="relative w-full h-[3px] group-hover/scrub:h-1 transition-[height]"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.25)' }}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="h-full"
            style={{
              width: `${displayedFraction * 100}%`,
              backgroundColor: 'var(--accent)',
            }}
          />
        </div>

        {/* Playhead Dot: 8px always visible on touch devices, hover-reveal on desktop, scales up on scrub */}
        {canSeek && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full shadow-xs transition-[opacity,transform] ${
              scrubFraction !== null
                ? '!opacity-100 scale-150'
                : 'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/scrub:opacity-100'
            }`}
            style={{
              left: `${displayedFraction * 100}%`,
              backgroundColor: 'var(--accent)',
            }}
          />
        )}
      </div>
    </div>
  );

  const renderVolumeSlider = () => (
    <div
      ref={volumeTrackRef}
      role="slider"
      tabIndex={0}
      aria-label={`Volume for ${displayTitle}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={displayedVolume}
      onPointerDown={(e) => {
        e.stopPropagation();
        activeVolumePointerIdRef.current = e.pointerId;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        if (volumeToastTimerRef.current !== null) {
          window.clearTimeout(volumeToastTimerRef.current);
          volumeToastTimerRef.current = null;
        }
        setIsAdjustingVolume(true);
        onChangeVolume(computeVolumeFromClientX(e.clientX));
      }}
      onPointerMove={(e) => {
        if (activeVolumePointerIdRef.current !== e.pointerId) return;
        e.stopPropagation();
        onChangeVolume(computeVolumeFromClientX(e.clientX));
      }}
      onPointerUp={(e) => {
        if (activeVolumePointerIdRef.current !== e.pointerId) return;
        e.stopPropagation();
        activeVolumePointerIdRef.current = null;
        setIsAdjustingVolume(false);
      }}
      onPointerCancel={(e) => {
        if (activeVolumePointerIdRef.current === e.pointerId) {
          activeVolumePointerIdRef.current = null;
          setIsAdjustingVolume(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          flashVolumeTooltip();
          onChangeVolume(Math.max(0, displayedVolume - 5));
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          flashVolumeTooltip();
          onChangeVolume(Math.min(100, displayedVolume + 5));
        }
      }}
      className="relative flex-1 min-w-[44px] h-6 flex items-center touch-none select-none cursor-pointer group/vol"
    >
      {/* Numeric volume percentage popover shown strictly while adjusting */}
      {isAdjustingVolume && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-7 -translate-x-1/2 px-1.5 py-0.5 rounded-md border text-[10px] font-mono tabular-nums whitespace-nowrap z-30"
          style={{
            left: `${Math.min(90, Math.max(10, displayedVolume))}%`,
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-primary)',
            boxShadow: 'var(--shadow-popover)',
          }}
        >
          {displayedVolume}%
        </div>
      )}

      {/* Slim horizontal track */}
      <div
        className="relative w-full h-1 group-hover/vol:h-1.5 rounded-full overflow-hidden transition-[height]"
        style={{ backgroundColor: 'var(--border-strong)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${displayedVolume}%`,
            backgroundColor: effectiveMuted ? 'var(--text-muted)' : 'var(--accent)',
          }}
        />
      </div>

      {/* Compact thumb dot */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full transition-transform ${
          isAdjustingVolume
            ? 'w-3 h-3 scale-110'
            : 'w-2.5 h-2.5 group-hover/vol:scale-110'
        }`}
        style={{
          left: `${displayedVolume}%`,
          backgroundColor: effectiveMuted ? 'var(--text-muted)' : 'var(--accent)',
        }}
      />
    </div>
  );

  const renderLoopControls = (compact: boolean) => (
    <div className="shrink-0">
      <button
        ref={loopTriggerRef}
        type="button"
        onClick={openOrToggleLoopMenu}
        aria-haspopup="menu"
        aria-expanded={loopMenuOpen}
        aria-label={`Loop settings for ${displayTitle}: ${isInfinite ? 'Infinite' : `${completedLoops} of ${slot.loopCount}`}`}
        title={
          isInfinite
            ? 'Infinite loop (click to change)'
            : loopTargetReached
              ? `${completedLoops}/${slot.loopCount} done (click to reset or change)`
              : `${completedLoops}/${slot.loopCount} loops (click to change)`
        }
        className={`${
          compact ? 'h-6.5 px-1.5 text-[10px] gap-1' : 'h-7 px-2 text-[11px] gap-1.5'
        } rounded-lg border font-medium inline-flex items-center shrink-0 transition-colors cursor-pointer hover:bg-[var(--bg-surface-hover)]`}
        style={{
          backgroundColor: loopTargetReached
            ? 'var(--accent-soft)'
            : 'var(--bg-surface-subtle)',
          borderColor: loopTargetReached || loopMenuOpen
            ? 'var(--accent)'
            : 'var(--border-subtle)',
          color: loopTargetReached
            ? 'var(--accent)'
            : isInfinite
              ? 'var(--text-secondary)'
              : 'var(--text-primary)',
          fontWeight: loopTargetReached ? 600 : 500,
        }}
      >
        {isInfinite ? (
          <>
            <InfinityIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Infinite</span>
          </>
        ) : (
          <>
            <Repeat className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} shrink-0`} />
            <span className="font-mono tabular-nums">
              {completedLoops}/{slot.loopCount}
            </span>
          </>
        )}
        <ChevronDown
          className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} opacity-70 shrink-0 transition-transform ${
            loopMenuOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {loopMenuOpen &&
        loopMenuPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={loopMenuRef}
            data-slot-loop-menu="true"
            role="menu"
            aria-label={`Loop controls for ${displayTitle}`}
            className="fixed z-[70] w-[196px] rounded-xl border p-1.5 space-y-1.5"
            style={{
              left: loopMenuPos.left,
              top: loopMenuPos.top,
              bottom: loopMenuPos.bottom,
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-strong)',
              boxShadow: 'var(--shadow-popover)',
            }}
          >
            {/* Option 1: Infinite Loop */}
            <button
              type="button"
              role="menuitemradio"
              aria-checked={isInfinite}
              onClick={() => {
                onSetLoopMode('infinite');
                setLoopMenuOpen(false);
              }}
              className="w-full h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer hover:bg-[var(--bg-surface-hover)]"
              style={{
                backgroundColor: isInfinite ? 'var(--accent-soft)' : 'transparent',
                color: isInfinite ? 'var(--accent)' : 'var(--text-primary)',
              }}
            >
              <InfinityIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-left">Infinite</span>
              {isInfinite && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>

            <div className="border-t" style={{ borderColor: 'var(--border-subtle)' }} />

            {/* Option 2: Inline Custom Presets (3, 5, 10) + Custom Count Input */}
            <div className="px-1 py-0.5 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-medium px-0.5">
                <span style={{ color: 'var(--text-muted)' }}>Repeat count</span>
                {!isInfinite && (
                  <span
                    className="font-mono tabular-nums"
                    style={{
                      color: loopTargetReached ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {completedLoops}/{slot.loopCount}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1">
                {[3, 5, 10].map((preset) => {
                  const activePreset = !isInfinite && slot.loopCount === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        onChangeLoopCount(preset);
                        setLoopDraft(String(preset));
                        setLoopMenuOpen(false);
                      }}
                      className="h-7 rounded-lg border text-[11px] font-mono tabular-nums font-semibold transition-colors cursor-pointer hover:bg-[var(--bg-surface-hover)]"
                      style={{
                        backgroundColor: activePreset
                          ? 'var(--accent-soft)'
                          : 'var(--bg-surface-subtle)',
                        borderColor: activePreset
                          ? 'var(--accent)'
                          : 'var(--border-subtle)',
                        color: activePreset ? 'var(--accent)' : 'var(--text-primary)',
                      }}
                    >
                      {preset}×
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={3}
                  value={loopDraft}
                  placeholder="Custom"
                  onFocus={(e) => {
                    setIsEditingLoop(true);
                    e.currentTarget.select();
                  }}
                  onChange={(e) => {
                    const digitsOnly = e.target.value.replace(/\D+/g, '').slice(0, 3);
                    setLoopDraft(digitsOnly);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitLoopDraft(true);
                    }
                  }}
                  onBlur={() => commitLoopDraft(false)}
                  className="flex-1 min-w-0 h-7 px-2 rounded-lg border bg-[var(--bg-surface-subtle)] text-xs font-mono tabular-nums outline-none focus:border-[var(--accent)]"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                  aria-label={`Custom loop count for ${displayTitle}`}
                />
                <button
                  type="button"
                  onClick={() => commitLoopDraft(true)}
                  className="h-7 px-2.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer shrink-0 hover:bg-[var(--bg-surface-hover)]"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  Set
                </button>
              </div>
            </div>

            <div className="border-t" style={{ borderColor: 'var(--border-subtle)' }} />

            {/* Option 3: Reset Loops & Replay */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onResetLoop();
                setLoopMenuOpen(false);
              }}
              className="w-full h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer hover:bg-[var(--bg-surface-hover)]"
              style={{
                backgroundColor: loopTargetReached
                  ? 'var(--accent-soft)'
                  : 'transparent',
                color: loopTargetReached ? 'var(--accent)' : 'var(--text-primary)',
              }}
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>{loopTargetReached ? 'Reset & Replay' : 'Reset Loops'}</span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );

  return (
    <article
      ref={cardRef}
      onMouseDownCapture={(e) => {
        if (!canReorder) {
          dragAllowedFromHeaderRef.current = false;
          e.currentTarget.draggable = false;
          return;
        }
        const targetEl = e.target instanceof Element ? e.target : null;
        const inHeader = Boolean(targetEl?.closest('[data-slot-drag-header="true"]'));
        const blockedControl = Boolean(
          targetEl?.closest('input, textarea, button, select, iframe, a, [data-progress-scrub="true"]'),
        );
        const allowDrag = inHeader && !blockedControl;
        dragAllowedFromHeaderRef.current = allowDrag;
        e.currentTarget.draggable = allowDrag;
      }}
      onMouseUpCapture={(e) => {
        dragAllowedFromHeaderRef.current = false;
        e.currentTarget.draggable = false;
      }}
      onDragStart={(e) => {
        if (!canReorder || !dragAllowedFromHeaderRef.current) {
          e.preventDefault();
          return;
        }
        didDragRef.current = true;
        onDragStart(e);
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={(e) => {
        dragAllowedFromHeaderRef.current = false;
        e.currentTarget.draggable = false;
        window.setTimeout(() => {
          didDragRef.current = false;
        }, 0);
        onDragEnd();
      }}
      className={`group relative rounded-xl border transition-all duration-150 ${
        isDragging ? 'opacity-45 scale-[0.98]' : ''
      } ${
        dropPosition
          ? 'ring-1 ring-[var(--accent)]/60 ring-offset-1 ring-offset-[var(--bg-canvas)]'
          : ''
      }`}
      style={{
        order: index,
        backgroundColor: 'var(--bg-surface)',
        borderColor: dropPosition ? 'var(--accent)' : 'var(--border-subtle)',
      }}
    >
      {/* Directional accent insertion bar when reordering */}
      {dropPosition && (
        <div
          aria-hidden="true"
          className={
            singleColDropAxis
              ? `pointer-events-none absolute inset-x-2 h-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] z-30 ${
                  dropPosition === 'before' ? '-top-1.5' : '-bottom-1.5'
                }`
              : `pointer-events-none absolute top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] z-30 ${
                  dropPosition === 'before' ? '-left-1.5' : '-right-1.5'
                }`
          }
        />
      )}

      <div
        className={`rounded-[11px] overflow-hidden flex ${
          isMixer ? 'flex-col sm:flex-row' : 'flex-col'
        }`}
      >
        {/* Video Frame (kept continuously mounted in identical DOM path across Grid / Tiles / Mixer so audio never drops) */}
        <div
          className={
            isMixer
              ? 'w-full sm:w-44 md:w-52 shrink-0 sm:order-1 flex flex-col'
              : 'w-full order-2 flex flex-col'
          }
        >
          <div className="relative w-full aspect-video bg-black">
            <div className="absolute inset-0 overflow-hidden">
              <iframe
                ref={iframeRef}
                onLoad={(e) => onIframeLoad(e.currentTarget)}
                src={buildYouTubeEmbedUrl(stream.videoId, cleanPlayer)}
                title={displayTitle}
                className={`absolute inset-0 w-full h-full border-0 ${
                  cleanPlayer || isAnyDragging ? 'pointer-events-none' : ''
                }`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
              {/* Clean-player & drag shield: desktop mouse toggles play/pause; touchscreens use dedicated buttons */}
              {(cleanPlayer || isAnyDragging) && (
                <div
                  role={cleanPlayer ? 'button' : undefined}
                  tabIndex={cleanPlayer ? 0 : undefined}
                  aria-hidden={cleanPlayer ? undefined : true}
                  aria-label={
                    cleanPlayer
                      ? isPlaying
                        ? `Pause ${displayTitle}`
                        : `Play ${displayTitle}`
                      : undefined
                  }
                  aria-pressed={cleanPlayer ? isPlaying : undefined}
                  onPointerDown={(e) => {
                    lastVideoPointerTypeRef.current = e.pointerType;
                    didDragRef.current = false;
                  }}
                  onMouseDown={() => {
                    didDragRef.current = false;
                  }}
                  onClick={(e) => {
                    if (!cleanPlayer || isAnyDragging || didDragRef.current) return;
                    if (lastVideoPointerTypeRef.current !== 'mouse') return;
                    e.stopPropagation();
                    onTogglePlayPause();
                  }}
                  onKeyDown={(e) => {
                    if (!cleanPlayer) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onTogglePlayPause();
                    }
                  }}
                  className={`absolute inset-0 z-10 select-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] ${
                    cleanPlayer
                      ? isAnyDragging
                        ? 'cursor-grabbing'
                        : 'lg:cursor-pointer'
                      : ''
                  }`}
                />
              )}
            </div>

            {/* Option C: Top-left Play/Pause pill on the video frame in Clean mode (clear of bottom 24px seekbar zone) */}
            {cleanPlayer && !isAnyDragging && (
              <button
                type="button"
                onPointerDown={handlePlayButtonPointerDown}
                onClick={handlePlayButtonClick}
                title={isPlaying ? 'Pause stream' : 'Play stream'}
                aria-label={isPlaying ? `Pause ${displayTitle}` : `Play ${displayTitle}`}
                className={`absolute top-2 left-2 z-20 inline-flex items-center justify-center rounded-full bg-black/65 hover:bg-black/80 text-white backdrop-blur-xs border border-white/15 shadow-sm transition-colors cursor-pointer ${
                  isTiles
                    ? 'h-6.5 w-6.5'
                    : 'h-7 px-2.5 gap-1.5 text-[11px] font-medium'
                }`}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3 h-3 fill-current shrink-0" />
                    {!isTiles && <span>Pause</span>}
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current shrink-0 ml-0.5" />
                    {!isTiles && <span>Play</span>}
                  </>
                )}
              </button>
            )}

            {/* Flush YouTube-style 3px seekbar with 24px upward touch zone along the video bottom edge */}
            {cleanPlayer && !isAnyDragging && renderFlushSeekBar()}
          </div>
        </div>

        {/* Header + Controls Container */}
        <div
          className={
            isMixer
              ? 'flex-1 min-w-0 flex flex-col justify-between sm:order-2'
              : 'contents'
          }
        >
          {/* Draggable Card Header (no grip icon; left-aligned title/subtitle; buttons excluded from drag) */}
          <div
            data-slot-drag-header="true"
            onPointerDown={(e) => {
              if (!canReorder || e.pointerType === 'mouse') return;
              if (
                e.target instanceof Element &&
                e.target.closest('a, button, input, select, textarea')
              ) {
                return;
              }
              if (
                touchHoldRef.current?.timerId !== null &&
                touchHoldRef.current?.timerId !== undefined
              ) {
                window.clearTimeout(touchHoldRef.current.timerId);
              }
              const headerEl = e.currentTarget;
              const pointerId = e.pointerId;
              const startX = e.clientX;
              const startY = e.clientY;
              const timerId = window.setTimeout(() => {
                if (
                  !touchHoldRef.current ||
                  touchHoldRef.current.pointerId !== pointerId
                ) {
                  return;
                }
                touchHoldRef.current.activated = true;
                touchHoldRef.current.timerId = null;
                try {
                  headerEl.setPointerCapture(pointerId);
                } catch {
                  // ignore
                }
                onHeaderTouchDragStart();
              }, 180);

              touchHoldRef.current = {
                pointerId,
                startX,
                startY,
                timerId,
                activated: false,
              };
            }}
            onPointerMove={(e) => {
              const state = touchHoldRef.current;
              if (!state || state.pointerId !== e.pointerId) return;
              if (!state.activated) {
                const moved = Math.hypot(
                  e.clientX - state.startX,
                  e.clientY - state.startY,
                );
                if (moved > 8) {
                  if (state.timerId !== null) {
                    window.clearTimeout(state.timerId);
                  }
                  touchHoldRef.current = null;
                }
                return;
              }
              e.preventDefault();
              onHeaderTouchDragMove(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              const state = touchHoldRef.current;
              if (!state || state.pointerId !== e.pointerId) return;
              if (state.timerId !== null) {
                window.clearTimeout(state.timerId);
              }
              const wasActivated = state.activated;
              touchHoldRef.current = null;
              if (wasActivated) {
                e.stopPropagation();
                onHeaderTouchDragEnd(e.clientX, e.clientY);
              }
            }}
            onPointerCancel={(e) => {
              const state = touchHoldRef.current;
              if (!state || state.pointerId !== e.pointerId) return;
              if (state.timerId !== null) {
                window.clearTimeout(state.timerId);
              }
              const wasActivated = state.activated;
              touchHoldRef.current = null;
              if (wasActivated) {
                onHeaderTouchDragCancel();
              }
            }}
            onContextMenu={(e) => {
              if (touchHoldRef.current) {
                e.preventDefault();
              }
            }}
            className={`px-3 ${isTiles ? 'py-1.5' : 'py-2'} border-b flex items-center justify-between gap-2 select-none ${
              isMixer ? '' : 'order-1'
            } ${canReorder ? 'cursor-grab active:cursor-grabbing' : ''} ${
              isDragging ? 'touch-none' : ''
            }`}
            style={{
              borderColor: 'var(--border-subtle)',
              backgroundColor: 'var(--bg-surface-subtle)',
            }}
            title={canReorder ? 'Drag header to reorder' : undefined}
          >
            <div className="min-w-0 flex-1">
              <div
                className={`${isTiles ? 'text-xs' : 'text-sm'} font-medium leading-snug truncate`}
                title={displayTitle}
              >
                {displayTitle}
              </div>
              {!isTiles && (
                <div
                  className="text-[11px] truncate font-mono tabular-nums"
                  style={{
                    color: loopTargetReached ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {subtitleParts.join(' · ')}
                </div>
              )}
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <a
                href={watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)] shrink-0"
                style={{ color: 'var(--text-muted)' }}
                title="Open video on YouTube"
                aria-label={`Open ${displayTitle} on YouTube`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={onRemove}
                className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)] shrink-0"
                style={{ color: 'var(--text-muted)' }}
                title="Remove from stack"
                aria-label={`Remove ${displayTitle} from stack`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Card Footer Controls */}
          {isTiles ? (
            /* Tiles Mode: Ultra-minimal single row */
            <div
              className="px-2 py-1.5 border-t order-3 flex items-center gap-1.5"
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              {cleanPlayer && (
                <button
                  type="button"
                  onPointerDown={handlePlayButtonPointerDown}
                  onClick={handlePlayButtonClick}
                  className="h-6.5 w-6.5 -ml-0.5 rounded-md flex items-center justify-center shrink-0 transition-colors cursor-pointer hover:bg-[var(--bg-surface-hover)]"
                  style={{
                    color: isPlaying ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                  title={isPlaying ? 'Pause stream' : 'Play stream'}
                  aria-label={isPlaying ? `Pause ${displayTitle}` : `Play ${displayTitle}`}
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={onToggleMute}
                className="h-6.5 w-6.5 rounded-md flex items-center justify-center transition-colors shrink-0 cursor-pointer hover:bg-[var(--bg-surface-hover)]"
                style={{
                  color: effectiveMuted ? 'var(--danger)' : 'var(--text-secondary)',
                }}
                title={effectiveMuted ? 'Unmute card' : 'Mute card'}
                aria-label={effectiveMuted ? 'Unmute card' : 'Mute card'}
              >
                {effectiveMuted ? (
                  <VolumeX className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>

              {renderVolumeSlider()}

              {renderLoopControls(true)}
            </div>
          ) : (
            /* Grid & Mixer Mode: Clean single transport row below video (seekbar lives flush on video bottom edge) */
            <div
              className={`px-3 py-2 flex items-center gap-1.5 ${
                isMixer ? 'border-t sm:border-t-0' : 'border-t order-3'
              }`}
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              {cleanPlayer && (
                <button
                  type="button"
                  onPointerDown={handlePlayButtonPointerDown}
                  onClick={handlePlayButtonClick}
                  className="h-7 w-7 -ml-1 rounded-md flex items-center justify-center shrink-0 transition-colors cursor-pointer hover:bg-[var(--bg-surface-hover)]"
                  style={{
                    color: isPlaying ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                  title={isPlaying ? 'Pause stream' : 'Play stream'}
                  aria-label={isPlaying ? `Pause ${displayTitle}` : `Play ${displayTitle}`}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={onToggleMute}
                className={`h-7 w-7 ${cleanPlayer ? '' : '-ml-1'} rounded-md flex items-center justify-center transition-colors shrink-0 cursor-pointer hover:bg-[var(--bg-surface-hover)]`}
                style={{
                  color: effectiveMuted ? 'var(--danger)' : 'var(--text-secondary)',
                }}
                title={effectiveMuted ? 'Unmute card' : 'Mute card'}
                aria-label={effectiveMuted ? 'Unmute card' : 'Mute card'}
              >
                {effectiveMuted ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              {renderVolumeSlider()}

              {renderLoopControls(false)}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
