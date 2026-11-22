import {
  AlertTriangle,
  Check,
  GripVertical,
  Link2,
  MoreHorizontal,
  Star,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { formatAudioDuration } from "../../lib/audioFormatters";
import type { AudioCardDetailOptions, AudioTrackRecord } from "../../types/audio";
import { AudioArtwork } from "./AudioArtwork";

interface MobileAudioListProps {
  tracks: AudioTrackRecord[];
  cardDetails: AudioCardDetailOptions;
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  activeSlotTrackIds: Set<string>;
  playingTrackIds: Set<string>;
  isCustomSort?: boolean;
  onReorderTracks?: (
    draggedIds: string[],
    targetTrackId: string,
    position: "before" | "after",
  ) => void;
  onPlayTrack: (track: AudioTrackRecord) => void;
  onQuickAction: (track: AudioTrackRecord) => void;
  onToggleSelect: (trackId: string, shiftKey: boolean) => void;
  missingTrackIds?: Set<string>;
  onRelinkTrack?: (track: AudioTrackRecord) => void;
}

export const MobileAudioList: React.FC<MobileAudioListProps> = ({
  tracks,
  cardDetails,
  selectedIds,
  isSelectionMode,
  activeSlotTrackIds,
  playingTrackIds,
  isCustomSort = false,
  onReorderTracks,
  onPlayTrack,
  onQuickAction,
  onToggleSelect,
  missingTrackIds,
  onRelinkTrack,
}) => {
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    trackId: string;
    position: "before" | "after";
  } | null>(null);

  const resolveDropTargetAtY = (
    clientY: number,
    activeId: string,
  ): { trackId: string; position: "before" | "after" } | null => {
    for (const track of tracks) {
      if (track.id === activeId) continue;
      const el = rowRefs.current.get(track.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return {
          trackId: track.id,
          position: clientY < rect.top + rect.height / 2 ? "before" : "after",
        };
      }
    }
    return null;
  };

  const resetPointerDrag = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  return (
    <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)] bg-[var(--bg-surface)] -mx-4 sm:mx-0 sm:rounded-lg sm:border">
      {tracks.map((track) => {
        const isSelected = selectedIds.has(track.id);
        const isDragging = draggingId === track.id;
        const isDropTarget = dropTarget?.trackId === track.id;
        const isPlayingTrack = playingTrackIds.has(track.id);
        const isInMix = activeSlotTrackIds.has(track.id);
        const resumePct =
          track.durationSeconds > 0 && track.currentPositionSeconds > 1
            ? Math.min(
                100,
                Math.max(
                  4,
                  (track.currentPositionSeconds / track.durationSeconds) * 100,
                ),
              )
            : 0;

        return (
          <div
            key={track.id}
            ref={(el) => {
              if (el) rowRefs.current.set(track.id, el);
              else rowRefs.current.delete(track.id);
            }}
            onClick={() => {
              if (draggingId) return;
              if (isSelectionMode) {
                onToggleSelect(track.id, false);
              } else {
                onPlayTrack(track);
              }
            }}
            style={
              isDropTarget
                ? {
                    boxShadow:
                      dropTarget.position === "before"
                        ? "inset 0 2px 0 var(--accent)"
                        : "inset 0 -2px 0 var(--accent)",
                  }
                : undefined
            }
            className={`flex items-center gap-3 px-4 py-3 min-h-[72px] transition-colors active:bg-[var(--bg-surface-hover)] cursor-pointer ${
              isDragging
                ? "opacity-65 bg-[var(--accent-soft)]"
                : isSelected
                  ? "bg-[var(--bg-accent-subtle)]/60"
                  : ""
            }`}
          >
            {isCustomSort && !isSelectionMode && onReorderTracks && (
              <div
                role="button"
                tabIndex={0}
                aria-label={`Reorder ${track.title}`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDraggingId(track.id);
                  setDropTarget(null);
                }}
                onPointerMove={(e) => {
                  if (draggingId !== track.id) return;
                  setDropTarget(resolveDropTargetAtY(e.clientY, track.id));
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (draggingId === track.id) {
                    const finalTarget =
                      resolveDropTargetAtY(e.clientY, track.id) ?? dropTarget;
                    if (finalTarget && finalTarget.trackId !== track.id) {
                      onReorderTracks(
                        [track.id],
                        finalTarget.trackId,
                        finalTarget.position,
                      );
                    }
                  }
                  resetPointerDrag();
                }}
                onPointerCancel={resetPointerDrag}
                className="touch-none select-none min-w-[36px] min-h-[44px] -ml-2 flex items-center justify-center rounded-lg text-[var(--text-muted)] active:text-[var(--accent)] cursor-grab active:cursor-grabbing shrink-0"
              >
                <GripVertical className="w-4 h-4" />
              </div>
            )}

            {isSelectionMode && (
              <button
                type="button"
                aria-label={
                  isSelected
                    ? `Deselect ${track.title}`
                    : `Select ${track.title}`
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(track.id, false);
                }}
                className={`w-6 h-6 rounded flex items-center justify-center border shrink-0 transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]"
                    : "bg-[var(--bg-elevated)] border-[var(--border-strong)] text-transparent"
                }`}
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            )}

            <div className="w-11 shrink-0 relative">
              <AudioArtwork
                title={track.title}
                artist={track.artist}
                format={track.format}
                coverDataUrl={track.coverDataUrl}
                paletteIndex={track.coverPaletteIndex}
                coverStyle={track.coverStyle}
                size="sm"
                isPlaying={isPlayingTrack}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-1.5">
                <h3
                  className={`font-sans text-sm font-medium leading-snug line-clamp-1 flex-1 ${
                    isInMix ? "text-[var(--accent)]" : "text-[var(--text-primary)]"
                  }`}
                >
                  {track.title}
                </h3>
                {track.isFavorite && (
                  <Star className="w-3.5 h-3.5 fill-[var(--accent)] text-[var(--accent)] shrink-0 mt-0.5" />
                )}
              </div>

              <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                {track.artist}
                {track.album ? ` · ${track.album}` : ""}
              </p>

              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] truncate">
                <span className="font-mono tabular-nums uppercase shrink-0">
                  {track.format}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums shrink-0">
                  {formatAudioDuration(track.durationSeconds)}
                </span>
                {isInMix && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-[var(--accent)] shrink-0">
                      {isPlayingTrack ? "Playing" : "In Mix"}
                    </span>
                  </>
                )}
              </div>

              {cardDetails.resumeBar && resumePct > 0 && (
                <div className="mt-1.5 h-1 w-full max-w-[140px] rounded-full bg-[var(--border-subtle)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)]"
                    style={{ width: `${resumePct}%` }}
                  />
                </div>
              )}

              {missingTrackIds?.has(track.id) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRelinkTrack?.(track);
                  }}
                  className="mt-1.5 inline-flex items-center gap-1.5 min-h-[28px] text-[11px] font-medium text-[var(--warning)] hover:text-[var(--accent)] cursor-pointer"
                >
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>Missing</span>
                  <span aria-hidden="true">·</span>
                  <Link2 className="w-3 h-3 shrink-0" />
                  <span>Tap to Relink</span>
                </button>
              )}
            </div>

            {!isSelectionMode && (
              <button
                type="button"
                aria-label={`Actions for ${track.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickAction(track);
                }}
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-lg text-[var(--text-secondary)] active:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
