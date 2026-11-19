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
  isDropTarget: boolean;
  iframeRef: (el: HTMLIFrameElement | null) => void;
  onIframeLoad: (iframe: HTMLIFrameElement | null) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onToggleMute: () => void;
  onChangeVolume: (volume: number) => void;
  onToggleLoopMode: () => void;
  onChangeLoopCount: (count: number) => void;
  onRemove: () => void;
}

export const StreamSlotCard: React.FC<StreamSlotCardProps> = ({
  slot,
  stream,
  viewMode,
  isGloballyMuted,
  completedLoops,
  loopTargetReached,
  isDragging,
  isDropTarget,
  iframeRef,
  onIframeLoad,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
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
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`rounded-xl border overflow-hidden flex transition-all ${
        isMixer ? 'flex-col sm:flex-row' : 'flex-col'
      }`}
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: isDropTarget ? 'var(--accent)' : 'var(--border-subtle)',
        opacity: isDragging ? 0.55 : 1,
        outline: isDropTarget ? '2px solid var(--accent)' : 'none',
        outlineOffset: '1px',
      }}
    >
      {/* Video Frame (kept continuously mounted across viewModes so audio never drops) */}
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
          className="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>

      {/* Header + Controls Container */}
      <div
        className={
          isMixer
            ? 'flex-1 min-w-0 flex flex-col justify-between sm:order-2'
            : 'contents'
        }
      >
        {/* Clean Card Header: Drag Grip + Title/Subtitle + Remove (No < or > chevrons) */}
        <div
          className={`px-2.5 ${isTiles ? 'py-1.5' : 'py-2'} border-b flex items-center justify-between gap-2 ${
            isMixer ? '' : 'order-1'
          }`}
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-subtle)',
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span
              className="inline-flex items-center justify-center cursor-grab active:cursor-grabbing shrink-0"
              style={{ color: 'var(--text-muted)' }}
              title="Drag to reorder"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </span>

            <div className="min-w-0 flex-1">
              <div
                className={`${isTiles ? 'text-xs' : 'text-xs sm:text-[13px]'} font-semibold truncate`}
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
    </article>
  );
};
