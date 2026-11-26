import React, { useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  GripVertical,
  Infinity as InfinityIcon,
  Pause,
  Play,
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
  onGripPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onGripPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onGripPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onGripPointerCancel: () => void;
  onTogglePlayPause: () => void;
  onSeek: (seconds: number) => void;
  onToggleMute: () => void;
  onChangeVolume: (volume: number) => void;
  onToggleLoopMode: () => void;
  onChangeLoopCount: (count: number) => void;
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
  onGripPointerDown,
  onGripPointerMove,
  onGripPointerUp,
  onGripPointerCancel,
  onTogglePlayPause,
  onSeek,
  onToggleMute,
  onChangeVolume,
  onToggleLoopMode,
  onChangeLoopCount,
  onRemove,
}) => {
  const effectiveMuted = isGloballyMuted || slot.muted || slot.volume === 0;
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

  // Manual numeric loop count draft (no up/down browser spinner arrows)
  const [loopDraft, setLoopDraft] = useState(String(slot.loopCount));
  const [isEditingLoop, setIsEditingLoop] = useState(false);

  useEffect(() => {
    if (!isEditingLoop) {
      setLoopDraft(String(slot.loopCount));
    }
  }, [slot.loopCount, isEditingLoop]);

  const commitLoopDraft = () => {
    setIsEditingLoop(false);
    const parsed = parseInt(loopDraft, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      const clamped = Math.min(999, parsed);
      onChangeLoopCount(clamped);
      setLoopDraft(String(clamped));
    } else {
      setLoopDraft(String(slot.loopCount));
    }
  };

  // Seekable progress bar hover + pointer scrub state
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
  const activeScrubPointerIdRef = useRef<number | null>(null);

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

  return (
    <article
      ref={cardRef}
      draggable={canReorder}
      onMouseDownCapture={(e) => {
        if (!canReorder) return;
        const blocked =
          e.target instanceof Element &&
          Boolean(
            e.target.closest('input, textarea, button, select, iframe, a, [data-progress-scrub="true"]'),
          );
        e.currentTarget.draggable = !blocked;
      }}
      onMouseUpCapture={(e) => {
        if (canReorder && !e.currentTarget.draggable) {
          e.currentTarget.draggable = true;
        }
      }}
      onDragStart={(e) => {
        if (
          !canReorder ||
          (e.target instanceof Element &&
            e.target.closest('input, textarea, button, select, iframe, a, [data-progress-scrub="true"]'))
        ) {
          e.preventDefault();
          return;
        }
        onDragStart(e);
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={(e) => {
        e.currentTarget.draggable = canReorder;
        onDragEnd();
      }}
      className={`group relative rounded-xl border transition-all duration-150 ${
        canReorder ? 'cursor-grab active:cursor-grabbing' : ''
      } ${isDragging ? 'opacity-45 scale-[0.98]' : ''} ${
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
        {/* Video Frame + Slim Play/Pause & Progress Bar Wrapper
            (kept continuously mounted across Grid / Tiles / Mixer so audio never drops) */}
        <div
          className={
            isMixer
              ? 'w-full sm:w-44 md:w-52 shrink-0 sm:order-1 flex flex-col'
              : 'w-full order-2 flex flex-col'
          }
        >
          <div className="relative w-full aspect-video bg-black overflow-hidden">
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
            {/* Clean-player & drag shield: shows only the video with zero hover overlays */}
            {(cleanPlayer || isAnyDragging) && (
              <div aria-hidden="true" className="absolute inset-0 z-10" />
            )}
          </div>

          {/* Slim Play/Pause + Seekable Progress Bar directly below the video frame (Clean mode) */}
          {cleanPlayer && (
            <div
              className="px-2 py-1 border-t flex items-center gap-2"
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <button
                type="button"
                onClick={onTogglePlayPause}
                className="h-6 w-6 rounded-md border flex items-center justify-center shrink-0 transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{
                  backgroundColor: isPlaying ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  borderColor: isPlaying ? 'var(--accent)' : 'var(--border-subtle)',
                  color: isPlaying ? 'var(--accent)' : 'var(--text-primary)',
                }}
                title={isPlaying ? 'Pause stream' : 'Play stream'}
                aria-label={isPlaying ? `Pause ${displayTitle}` : `Play ${displayTitle}`}
              >
                {isPlaying ? (
                  <Pause className="w-3 h-3 fill-current" />
                ) : (
                  <Play className="w-3 h-3 fill-current ml-0.5" />
                )}
              </button>

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
                  if (!canSeek) return;
                  setHoverFraction(computeFraction(e.clientX));
                }}
                onPointerMove={(e) => {
                  if (!canSeek) return;
                  const frac = computeFraction(e.clientX);
                  if (activeScrubPointerIdRef.current === e.pointerId) {
                    setScrubFraction(frac);
                  } else {
                    setHoverFraction(frac);
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
                  activeScrubPointerIdRef.current = e.pointerId;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const frac = computeFraction(e.clientX);
                  setScrubFraction(frac);
                  setHoverFraction(frac);
                }}
                onPointerUp={(e) => {
                  if (activeScrubPointerIdRef.current !== e.pointerId) return;
                  e.stopPropagation();
                  const frac = computeFraction(e.clientX);
                  activeScrubPointerIdRef.current = null;
                  setScrubFraction(null);
                  if (canSeek) {
                    onSeek(frac * duration);
                  }
                }}
                onPointerCancel={(e) => {
                  if (activeScrubPointerIdRef.current === e.pointerId) {
                    activeScrubPointerIdRef.current = null;
                    setScrubFraction(null);
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
                className={`relative flex-1 min-w-0 h-5 flex items-center touch-none select-none group/scrub ${
                  canSeek ? 'cursor-pointer' : 'cursor-default opacity-60'
                }`}
              >
                {/* Hover / Scrubbing Timestamp Tooltip */}
                {activeTooltipFraction !== null && canSeek && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-7 -translate-x-1/2 px-1.5 py-0.5 rounded-md border text-[10px] font-mono tabular-nums whitespace-nowrap z-30"
                    style={{
                      left: `${Math.min(92, Math.max(8, activeTooltipFraction * 100))}%`,
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--text-primary)',
                      boxShadow: 'var(--shadow-popover)',
                    }}
                  >
                    {formatPlaybackTimestamp(tooltipSeconds)} / {formatPlaybackTimestamp(duration)}
                  </div>
                )}

                {/* Track & Fill */}
                <div
                  className="relative w-full h-1.5 group-hover/scrub:h-2 rounded-full overflow-hidden transition-[height]"
                  style={{ backgroundColor: 'var(--border-strong)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${displayedFraction * 100}%`,
                      backgroundColor: 'var(--accent)',
                    }}
                  />
                </div>

                {/* Scrub Thumb Dot */}
                {canSeek && (
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full transition-opacity ${
                      scrubFraction !== null
                        ? 'opacity-100 scale-110'
                        : 'opacity-0 group-hover/scrub:opacity-100'
                    }`}
                    style={{
                      left: `${displayedFraction * 100}%`,
                      backgroundColor: 'var(--accent)',
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Header + Controls Container */}
        <div
          className={
            isMixer
              ? 'flex-1 min-w-0 flex flex-col justify-between sm:order-2'
              : 'contents'
          }
        >
          {/* Clean Card Header: Drag Grip + Title/Subtitle + External YouTube URL + Remove */}
          <div
            className={`px-2.5 ${isTiles ? 'py-1.5' : 'py-2'} border-b flex items-center justify-between gap-1.5 select-none ${
              isMixer ? '' : 'order-1'
            } ${canReorder ? 'cursor-grab active:cursor-grabbing' : ''}`}
            style={{
              borderColor: 'var(--border-subtle)',
              backgroundColor: 'var(--bg-surface-subtle)',
            }}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {canReorder && (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Reorder ${displayTitle}`}
                  title="Drag to reorder"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={onGripPointerDown}
                  onPointerMove={onGripPointerMove}
                  onPointerUp={onGripPointerUp}
                  onPointerCancel={onGripPointerCancel}
                  className="touch-none select-none w-6 h-6 -ml-1 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] active:text-[var(--accent)] cursor-grab active:cursor-grabbing shrink-0"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
              )}

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

          {/* Card Footer Controls: Direct Volume Slider + Mute + Infinite Loop Toggle + Manual Finite Count */}
          <div
            className={`px-2.5 ${isTiles ? 'py-2 space-y-1.5' : 'py-2.5 space-y-2'} ${
              isMixer ? 'border-t sm:border-t-0' : 'border-t order-3'
            }`}
            style={{
              borderColor: 'var(--border-subtle)',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            {/* Row 1: Mute Toggle + Direct Volume Slider + Tabular % */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleMute}
                className="h-7 w-7 rounded-lg border flex items-center justify-center transition-colors shrink-0 hover:bg-[var(--bg-surface-hover)]"
                style={{
                  backgroundColor: effectiveMuted
                    ? 'var(--bg-surface-subtle)'
                    : 'var(--bg-surface)',
                  borderColor: effectiveMuted ? 'var(--danger)' : 'var(--border-subtle)',
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

              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={slot.volume}
                onChange={(e) => onChangeVolume(Number(e.target.value))}
                className="flex-1 min-w-0 cursor-pointer"
                style={{ accentColor: 'var(--accent)' }}
                aria-label={`Volume for ${displayTitle}`}
              />

              <span
                className="text-[11px] font-mono tabular-nums w-8 text-right shrink-0"
                style={{
                  color: effectiveMuted ? 'var(--text-muted)' : 'var(--text-primary)',
                }}
              >
                {slot.muted ? '0%' : `${slot.volume}%`}
              </span>
            </div>

            {/* Row 2: Infinite Loop Toggle + Manual Numeric Finite Count Input + Live Loop Tracker */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onToggleLoopMode}
                  className="h-7 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: isInfinite
                      ? 'var(--accent-soft)'
                      : 'var(--bg-surface-subtle)',
                    borderColor: isInfinite ? 'var(--accent)' : 'var(--border-subtle)',
                    color: isInfinite ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                  title={
                    isInfinite
                      ? 'Infinite loop active (click for finite loop count)'
                      : 'Finite loop count active (click for infinite loop)'
                  }
                >
                  <InfinityIcon className="w-3.5 h-3.5" />
                  <span>Loop</span>
                </button>

                <div
                  className="h-7 px-2 rounded-lg border inline-flex items-center gap-1.5 transition-colors"
                  style={{
                    backgroundColor: !isInfinite
                      ? 'var(--accent-soft)'
                      : 'var(--bg-surface-subtle)',
                    borderColor: !isInfinite ? 'var(--accent)' : 'var(--border-subtle)',
                  }}
                >
                  <span
                    className="text-[11px] whitespace-nowrap"
                    style={{
                      color: !isInfinite ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    Count
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    value={loopDraft}
                    onFocus={(e) => {
                      setIsEditingLoop(true);
                      e.currentTarget.select();
                    }}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D+/g, '').slice(0, 3);
                      setLoopDraft(digitsOnly);
                      const parsed = parseInt(digitsOnly, 10);
                      if (Number.isFinite(parsed) && parsed >= 1) {
                        onChangeLoopCount(Math.min(999, parsed));
                      }
                    }}
                    onBlur={commitLoopDraft}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    className="w-9 bg-transparent text-xs font-mono tabular-nums text-center outline-none"
                    style={{ color: 'var(--text-primary)' }}
                    aria-label={`Loop count target for ${displayTitle}`}
                  />
                </div>
              </div>

              <span
                className="text-[11px] font-mono tabular-nums whitespace-nowrap"
                style={{
                  color: loopTargetReached ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {loopStatusText}
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};
