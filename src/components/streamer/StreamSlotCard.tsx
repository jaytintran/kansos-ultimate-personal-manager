import React from 'react';
import { GripVertical, Infinity as InfinityIcon, Volume2, VolumeX, X } from 'lucide-react';
import { StackSlot, StreamItem, StreamViewMode } from '../../types';
import { buildYouTubeEmbedUrl } from '../../utils/youtube';

interface StreamSlotCardProps {
  slot: StackSlot;
  stream: StreamItem;
  index: number;
  viewMode: StreamViewMode;
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
  onToggleMute: () => void;
  onChangeVolume: (volume: number) => void;
  onToggleLoopMode: () => void;
  onChangeLoopCount: (count: number) => void;
  onRemove: () => void;
}

export const StreamSlotCard: React.FC<StreamSlotCardProps> = ({
  slot,
  stream,
  index,
  viewMode,
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

  return (
    <article
      ref={cardRef}
      draggable={canReorder}
      onMouseDownCapture={(e) => {
        if (!canReorder) return;
        const blocked =
          e.target instanceof Element &&
          Boolean(e.target.closest('input, textarea, button, select, iframe'));
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
            e.target.closest('input, textarea, button, select, iframe'))
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
      {/* Video Frame (kept continuously mounted across viewModes & reorders so audio never drops) */}
      <div
        className={
          isMixer
            ? 'relative w-full sm:w-44 md:w-52 aspect-video bg-black shrink-0 sm:order-1'
            : 'relative w-full aspect-video bg-black order-2'
        }
      >
        <iframe
          ref={iframeRef}
          onLoad={(e) => onIframeLoad(e.currentTarget)}
          src={buildYouTubeEmbedUrl(stream.videoId)}
          title={displayTitle}
          className={`absolute inset-0 w-full h-full border-0 ${
            isAnyDragging ? 'pointer-events-none' : ''
          }`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
        {/* Transparent drag shield so cross-origin YouTube iframes never swallow dragover/drop events */}
        {isAnyDragging && (
          <div aria-hidden="true" className="absolute inset-0 z-10" />
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
        {/* Clean Card Header: Drag Grip + Title/Subtitle + Remove */}
        <div
          className={`px-2.5 ${isTiles ? 'py-1.5' : 'py-2'} border-b flex items-center justify-between gap-2 select-none ${
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

        {/* Card Footer Controls: Direct Volume Slider + Mute + Infinite Loop Toggle + Finite Count */}
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

          {/* Row 2: Infinite Loop Toggle + Finite Count Input + Live Loop Tracker */}
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
                  type="number"
                  min={1}
                  max={999}
                  value={slot.loopCount}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    if (Number.isFinite(parsed) && parsed >= 1) {
                      onChangeLoopCount(Math.min(999, parsed));
                    }
                  }}
                  className="w-10 bg-transparent text-xs font-mono tabular-nums text-center outline-none"
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
