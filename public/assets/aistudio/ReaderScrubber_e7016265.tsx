import {ChevronLeft, ChevronRight, Pin} from 'lucide-react';
import React, {useRef, useState} from 'react';
import {formatReadingTime} from '../../lib/readerUtils';
import type {BookFormat} from '../../types/library';

export interface ScrubberMarker {
  unitIndex: number;
  label: string;
  pct: number; // 0..100
}

interface ReaderScrubberProps {
  visible: boolean;
  isPinned: boolean;
  onTogglePin: () => void;
  format: BookFormat;
  progressPct: number; // 0..100
  currentLabel: string;
  virtualPageLabel?: string;
  chapterMinutesLeft: number | null;
  bookMinutesLeft: number;
  markers: ScrubberMarker[];
  canStepPrev: boolean;
  canStepNext: boolean;
  onStepPrev: () => void;
  onStepNext: () => void;
  onScrubToPct: (pct: number) => void;
  onResolvePctLabel: (pct: number) => string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const ReaderScrubber: React.FC<ReaderScrubberProps> = ({
  visible,
  isPinned,
  onTogglePin,
  format,
  progressPct,
  currentLabel,
  virtualPageLabel,
  chapterMinutesLeft,
  bookMinutesLeft,
  markers,
  canStepPrev,
  canStepNext,
  onStepPrev,
  onStepNext,
  onScrubToPct,
  onResolvePctLabel,
  onMouseEnter,
  onMouseLeave,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverState, setHoverState] = useState<{pct: number; label: string} | null>(null);
  const [draggingPct, setDraggingPct] = useState<number | null>(null);

  const displayedPct = draggingPct ?? progressPct;

  const getPctFromClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.min(100, Math.max(0, ratio * 100));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pct = getPctFromClientX(e.clientX);
    setDraggingPct(pct);
    setHoverState({pct, label: onResolvePctLabel(pct)});
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pct = getPctFromClientX(e.clientX);
    setHoverState({pct, label: onResolvePctLabel(pct)});
    if (draggingPct !== null) {
      setDraggingPct(pct);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingPct !== null) {
      const pct = getPctFromClientX(e.clientX);
      setDraggingPct(null);
      onScrubToPct(pct);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const visibleMarkers =
    markers.length <= 45
      ? markers
      : markers.filter((_, i) => i % Math.ceil(markers.length / 40) === 0);

  const positioningClass = isPinned
    ? 'relative z-30 shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] pb-safe lg:pb-0'
    : `fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/96 backdrop-blur-xs pb-safe lg:pb-0 transition-transform duration-180 ease-out ${
        visible ? 'translate-y-0' : 'translate-y-full pointer-events-none'
      }`;

  return (
    <footer
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={positioningClass}
    >
      <div className="px-3 sm:px-5 h-13 flex items-center gap-2 sm:gap-4">
        {/* Left: Current location & virtual page / chapter time */}
        <div className="hidden md:flex flex-col min-w-[175px] max-w-[240px] shrink-0">
          <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">
            {currentLabel}
          </span>
          <span className="font-mono-tabular text-[10px] text-[var(--text-muted)] truncate">
            {format === 'pdf'
              ? `${formatReadingTime(bookMinutesLeft)} left in document`
              : `${virtualPageLabel ? `${virtualPageLabel} · ` : ''}${
                  chapterMinutesLeft !== null
                    ? `${formatReadingTime(chapterMinutesLeft)} left in ch.`
                    : `${formatReadingTime(bookMinutesLeft)} left`
                }`}
          </span>
        </div>

        {/* Center: Step buttons + Interactive Scrubber Track */}
        <div className="flex-1 flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            disabled={!canStepPrev}
            onClick={onStepPrev}
            title={format === 'pdf' ? 'Previous page' : 'Previous section or spread'}
            aria-label="Previous"
            className="min-w-[40px] min-h-[40px] lg:min-w-0 lg:min-h-0 flex items-center justify-center p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="Book reading progress scrubber"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(displayedPct)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
              if (draggingPct === null) setHoverState(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') onScrubToPct(Math.max(0, progressPct - 2));
              if (e.key === 'ArrowRight') onScrubToPct(Math.min(100, progressPct + 2));
            }}
            className="relative flex-1 h-8 flex items-center cursor-pointer select-none touch-none"
          >
            {/* Hover / Drag Preview Tooltip */}
            {hoverState && (
              <div
                style={{left: `${Math.min(92, Math.max(8, hoverState.pct))}%`}}
                className="pointer-events-none absolute -top-9 -translate-x-1/2 px-2.5 py-1 rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[11px] text-[var(--text-primary)] shadow-md whitespace-nowrap max-w-[260px] truncate"
              >
                {hoverState.label}{' '}
                <span className="font-mono-tabular text-[var(--text-muted)]">
                  · {Math.round(hoverState.pct)}%
                </span>
              </div>
            )}

            {/* Base Track */}
            <div className="relative w-full h-1.5 rounded-full bg-[var(--border-subtle)] overflow-visible">
              {/* Filled Progress */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
                style={{width: `${Math.min(100, Math.max(0, displayedPct))}%`}}
              />

              {/* Chapter / Section Boundary Tick Marks */}
              {visibleMarkers.map((m) => (
                <span
                  key={`${m.unitIndex}-${m.pct}`}
                  aria-hidden="true"
                  style={{left: `${m.pct}%`}}
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-[1.5px] h-2.5 bg-[var(--bg-surface)] opacity-85"
                />
              ))}

              {/* Scrubber Thumb */}
              <div
                style={{left: `${Math.min(100, Math.max(0, displayedPct))}%`}}
                className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[var(--accent)] border-2 border-[var(--bg-surface)] shadow-xs"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={!canStepNext}
            onClick={onStepNext}
            title={format === 'pdf' ? 'Next page' : 'Next section or spread'}
            aria-label="Next"
            className="min-w-[40px] min-h-[40px] lg:min-w-0 lg:min-h-0 flex items-center justify-center p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Virtual page / book time left, percentage & independent Pin Bottom Bar toggle */}
        <div className="flex items-center gap-2 text-right shrink-0">
          {format !== 'pdf' && virtualPageLabel && (
            <span className="md:hidden font-mono-tabular text-[10px] text-[var(--text-muted)] whitespace-nowrap">
              {virtualPageLabel}
            </span>
          )}
          {format !== 'pdf' && (
            <span className="hidden sm:inline font-mono-tabular text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
              {formatReadingTime(bookMinutesLeft)} left
            </span>
          )}
          <span className="font-mono-tabular text-xs font-medium text-[var(--text-primary)] w-9 text-right">
            {Math.round(displayedPct)}%
          </span>
          <div className="hidden lg:block h-4 w-px bg-[var(--border-subtle)] mx-0.5" />
          <button
            type="button"
            onClick={onTogglePin}
            title={isPinned ? 'Unpin bottom bar (auto-hide on scroll)' : 'Pin bottom bar in place'}
            aria-label={isPinned ? 'Unpin bottom bar' : 'Pin bottom bar'}
            aria-pressed={isPinned}
            className={`hidden lg:inline-flex p-1.5 rounded-md transition-colors cursor-pointer ${
              isPinned
                ? 'text-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
            }`}
          >
            <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>
    </footer>
  );
};
