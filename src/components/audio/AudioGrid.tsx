import {
  AlertTriangle,
  Check,
  GripVertical,
  Info,
  Layers,
  Link2,
  MoreHorizontal,
  Pencil,
  Play,
  Star,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { formatAudioDuration } from "../../lib/audioFormatters";
import type {
  AudioCardDetailOptions,
  AudioCoverSize,
  AudioTrackRecord,
} from "../../types/audio";
import { AudioArtwork } from "./AudioArtwork";
import { extractDraggedAudioIds, hasDraggedAudioPayload } from "./AudioSidebar";

interface AudioGridProps {
  tracks: AudioTrackRecord[];
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  coverSize: AudioCoverSize;
  cardDetails: AudioCardDetailOptions;
  inspectorOpen: boolean;
  inspectedTrackId: string | null;
  activeSlotTrackIds: Set<string>;
  playingTrackIds: Set<string>;
  isCustomSort?: boolean;
  onReorderTracks?: (
    draggedIds: string[],
    targetTrackId: string,
    position: "before" | "after",
  ) => void;
  onPlayTrack: (track: AudioTrackRecord) => void;
  onAddToMix: (track: AudioTrackRecord) => void;
  onInspectTrack: (track: AudioTrackRecord) => void;
  onEditTrack: (track: AudioTrackRecord) => void;
  onToggleFavorite: (track: AudioTrackRecord) => void;
  onToggleSelect: (trackId: string, shiftKey: boolean) => void;
  onQuickAction?: (track: AudioTrackRecord) => void;
  onContextMenuTrack?: (track: AudioTrackRecord, e: React.MouseEvent) => void;
  missingTrackIds?: Set<string>;
  onRelinkTrack?: (track: AudioTrackRecord) => void;
}

const GRID_COLUMNS_BY_SIZE: Record<AudioCoverSize, string> = {
  compact:
    "grid-cols-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-x-4 gap-y-6 sm:gap-y-7",
  standard:
    "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-x-4 sm:gap-x-6 gap-y-6 sm:gap-y-8",
  large:
    "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-5 sm:gap-x-7 gap-y-7 sm:gap-y-9",
};

export const AudioGrid: React.FC<AudioGridProps> = ({
  tracks,
  selectedIds,
  isSelectionMode,
  coverSize,
  cardDetails,
  inspectorOpen,
  inspectedTrackId,
  activeSlotTrackIds,
  playingTrackIds,
  isCustomSort = false,
  onReorderTracks,
  onPlayTrack,
  onAddToMix,
  onInspectTrack,
  onEditTrack,
  onToggleFavorite,
  onToggleSelect,
  onQuickAction,
  onContextMenuTrack,
  missingTrackIds,
  onRelinkTrack,
}) => {
  const activeDragIdsRef = useRef<string[]>([]);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [dropTarget, setDropTarget] = useState<{
    trackId: string;
    position: "before" | "after";
  } | null>(null);

  const clearDragState = () => {
    activeDragIdsRef.current = [];
    setDraggingIds([]);
    setDropTarget(null);
  };

  const handleCardPrimaryClick = (
    track: AudioTrackRecord,
    e: React.MouseEvent,
  ) => {
    if (isSelectionMode || e.shiftKey || e.metaKey || e.ctrlKey) {
      e.preventDefault();
      onToggleSelect(track.id, e.shiftKey);
      return;
    }
    const isDesktopInspector =
      inspectorOpen &&
      typeof window !== "undefined" &&
      window.innerWidth >= 1280;
    if (isDesktopInspector) {
      onInspectTrack(track);
    } else {
      onPlayTrack(track);
    }
  };

  return (
    <div className={`grid ${GRID_COLUMNS_BY_SIZE[coverSize]}`}>
      {tracks.map((track) => {
        const isSelected = selectedIds.has(track.id);
        const isInspected = inspectorOpen && inspectedTrackId === track.id;
        const isPlayingTrack = playingTrackIds.has(track.id);
        const isInMix = activeSlotTrackIds.has(track.id);
        const resumePct =
          track.durationSeconds > 0 && track.currentPositionSeconds > 1
            ? Math.min(
                100,
                Math.max(
                  2,
                  (track.currentPositionSeconds / track.durationSeconds) * 100,
                ),
              )
            : 0;

        const metaParts: React.ReactNode[] = [];
        if (cardDetails.duration) {
          metaParts.push(
            <span key="dur" className="font-mono tabular-nums shrink-0">
              {formatAudioDuration(track.durationSeconds)}
            </span>,
          );
        }
        if (cardDetails.format) {
          metaParts.push(
            <span key="fmt" className="font-mono tabular-nums uppercase shrink-0">
              {track.format}
            </span>,
          );
        }
        if (cardDetails.playCount && (track.playCount ?? 0) > 0) {
          metaParts.push(
            <span key="plays" className="font-mono tabular-nums shrink-0">
              {track.playCount} plays
            </span>,
          );
        }
        if (isInMix) {
          metaParts.push(
            <span
              key="mix"
              className="font-medium text-[var(--accent)] shrink-0"
            >
              {isPlayingTrack ? "Playing" : "In Mix"}
            </span>,
          );
        }

        const isBeingDragged = draggingIds.includes(track.id);
        const isDropTarget = dropTarget?.trackId === track.id;

        return (
          <article
            key={track.id}
            draggable
            onDragStart={(e) => {
              const dragIds =
                selectedIds.has(track.id) && selectedIds.size > 1
                  ? Array.from(selectedIds)
                  : [track.id];
              e.dataTransfer.setData("application/x-kanso-audio-id", track.id);
              e.dataTransfer.setData(
                "application/x-kanso-audio-ids",
                JSON.stringify(dragIds),
              );
              e.dataTransfer.effectAllowed = "move";
              activeDragIdsRef.current = dragIds;
              setDraggingIds(dragIds);
            }}
            onDragEnd={clearDragState}
            onDragOver={(e) => {
              if (!isCustomSort || !onReorderTracks) return;
              if (!hasDraggedAudioPayload(e.dataTransfer)) return;
              if (activeDragIdsRef.current.includes(track.id)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const rect = e.currentTarget.getBoundingClientRect();
              const position: "before" | "after" =
                e.clientX < rect.left + rect.width / 2 ? "before" : "after";
              setDropTarget((prev) =>
                prev?.trackId === track.id && prev.position === position
                  ? prev
                  : { trackId: track.id, position },
              );
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDropTarget((prev) =>
                  prev?.trackId === track.id ? null : prev,
                );
              }
            }}
            onDrop={(e) => {
              if (!isCustomSort || !onReorderTracks) return;
              if (!hasDraggedAudioPayload(e.dataTransfer)) return;
              const dragIds =
                extractDraggedAudioIds(e.dataTransfer).length > 0
                  ? extractDraggedAudioIds(e.dataTransfer)
                  : activeDragIdsRef.current;
              const rect = e.currentTarget.getBoundingClientRect();
              const position: "before" | "after" =
                e.clientX < rect.left + rect.width / 2 ? "before" : "after";
              clearDragState();
              if (dragIds.length === 0 || dragIds.includes(track.id)) return;
              e.preventDefault();
              onReorderTracks(dragIds, track.id, position);
            }}
            onContextMenu={(e) => {
              if (!onContextMenuTrack) return;
              e.preventDefault();
              onContextMenuTrack(track, e);
            }}
            className={`group relative flex flex-col min-w-0 transition-all duration-150 ${
              isCustomSort ? "cursor-grab active:cursor-grabbing" : ""
            } ${isBeingDragged ? "opacity-45 scale-[0.98]" : ""}`}
          >
            {isDropTarget && (
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute top-0 bottom-10 w-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] z-20 ${
                  dropTarget.position === "before"
                    ? "-left-2 sm:-left-3"
                    : "-right-2 sm:-right-3"
                }`}
              />
            )}

            {/* Square Cover Artwork */}
            <div
              onClick={(e) => handleCardPrimaryClick(track, e)}
              onDoubleClick={() => onPlayTrack(track)}
              className={`relative cursor-pointer rounded-[6px] transition-transform duration-150 ease-out group-hover:-translate-y-0.5 ${
                isSelected
                  ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-canvas)]"
                  : isDropTarget
                    ? "ring-1 ring-[var(--accent)]/60 ring-offset-2 ring-offset-[var(--bg-canvas)]"
                    : isInspected
                      ? "ring-2 ring-[var(--text-primary)]/45 ring-offset-2 ring-offset-[var(--bg-canvas)]"
                      : ""
              }`}
            >
              <AudioArtwork
                title={track.title}
                artist={track.artist}
                format={track.format}
                coverDataUrl={track.coverDataUrl}
                paletteIndex={track.coverPaletteIndex}
                coverStyle={track.coverStyle}
                size={coverSize === "large" ? "lg" : "md"}
                isPlaying={isPlayingTrack}
              />

              {/* Subtle bottom resume bar */}
              {cardDetails.resumeBar && resumePct > 0 && (
                <div
                  aria-label="Saved playback position"
                  className="absolute inset-x-0 bottom-0 h-1 bg-black/35 overflow-hidden rounded-b-[6px]"
                >
                  <div
                    className="h-full bg-[var(--accent)] transition-all"
                    style={{ width: `${resumePct}%` }}
                  />
                </div>
              )}

              {/* Selection Checkbox (top-left) */}
              <button
                type="button"
                aria-label={
                  isSelected
                    ? `Deselect ${track.title}`
                    : `Select ${track.title}`
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(track.id, e.shiftKey);
                }}
                className={`absolute top-2 left-2 w-6 h-6 rounded flex items-center justify-center border transition-opacity cursor-pointer ${
                  isSelected
                    ? "opacity-100 bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]"
                    : isSelectionMode
                      ? "opacity-100 bg-[var(--bg-elevated)]/95 border-[var(--border-strong)] text-transparent hover:border-[var(--accent)]"
                      : "opacity-0 group-hover:opacity-100 focus:opacity-100 bg-[var(--bg-elevated)]/95 border-[var(--border-strong)] text-transparent hover:border-[var(--accent)]"
                }`}
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>

              {/* Desktop Hover Quick Actions (top-right) */}
              <div
                className={`hidden lg:flex absolute top-2 right-2 items-center gap-1 transition-opacity ${
                  track.isFavorite
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                }`}
              >
                <button
                  type="button"
                  title={
                    track.isFavorite ? "Remove favorite" : "Mark as favorite"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(track);
                  }}
                  className="w-7 h-7 rounded flex items-center justify-center bg-[var(--bg-elevated)]/95 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer"
                >
                  <Star
                    className={`w-3.5 h-3.5 ${
                      track.isFavorite
                        ? "fill-[var(--accent)] text-[var(--accent)]"
                        : ""
                    }`}
                  />
                </button>
                <button
                  type="button"
                  title="Add track layer to active mixer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddToMix(track);
                  }}
                  className="w-7 h-7 rounded flex items-center justify-center bg-[var(--bg-elevated)]/95 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <Layers className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Inspect track details"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInspectTrack(track);
                  }}
                  className="w-7 h-7 rounded flex items-center justify-center bg-[var(--bg-elevated)]/95 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Edit metadata"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditTrack(track);
                  }}
                  className="w-7 h-7 rounded flex items-center justify-center bg-[var(--bg-elevated)]/95 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Desktop Hover Play Button (bottom-right) */}
              <button
                type="button"
                title="Play track"
                aria-label={`Play ${track.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayTrack(track);
                }}
                className={`hidden lg:flex absolute bottom-2 right-2 w-8 h-8 rounded-full items-center justify-center bg-[var(--accent)] text-[var(--accent-contrast)] shadow-md transition-opacity cursor-pointer ${
                  isPlayingTrack
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                }`}
              >
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              </button>

              {/* Mobile Quick Action Button (<lg) */}
              {onQuickAction && !isSelectionMode && (
                <button
                  type="button"
                  aria-label={`More actions for ${track.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickAction(track);
                  }}
                  className="lg:hidden absolute top-0 right-0 w-11 h-11 flex items-start justify-end p-1.5 cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-md flex items-center justify-center bg-[var(--bg-elevated)]/92 backdrop-blur-xs border border-[var(--border-subtle)] text-[var(--text-primary)] shadow-xs">
                    <MoreHorizontal className="w-4 h-4" />
                  </span>
                </button>
              )}

              {isCustomSort && (
                <span
                  aria-hidden="true"
                  className="hidden lg:flex absolute bottom-2 left-2 w-6 h-6 rounded items-center justify-center bg-[var(--bg-elevated)]/90 border border-[var(--border-subtle)] text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </span>
              )}

              {track.isFavorite && !isSelectionMode && (
                <span
                  aria-hidden="true"
                  className="lg:hidden absolute top-1.5 left-1.5 w-6 h-6 rounded-md flex items-center justify-center bg-[var(--bg-elevated)]/90 border border-[var(--border-subtle)]"
                >
                  <Star className="w-3 h-3 fill-[var(--accent)] text-[var(--accent)]" />
                </span>
              )}
            </div>

            {/* Clean Unboxed Zero-Pill Metadata */}
            <div className="mt-2 min-w-0">
              <button
                type="button"
                onClick={(e) => handleCardPrimaryClick(track, e)}
                onDoubleClick={() => onPlayTrack(track)}
                className="text-left w-full font-sans text-sm font-medium leading-snug text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors line-clamp-2 cursor-pointer"
              >
                {track.title}
              </button>

              {cardDetails.artist && (
                <p className="mt-0.5 text-xs text-[var(--text-secondary)] truncate">
                  {track.artist}
                </p>
              )}

              {cardDetails.album && track.album?.trim() && (
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate">
                  {track.album}
                </p>
              )}

              {metaParts.length > 0 && (
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] truncate">
                  {metaParts.map((part, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && <span aria-hidden="true">·</span>}
                      {part}
                    </React.Fragment>
                  ))}
                </div>
              )}

              {cardDetails.tags && track.tags.length > 0 && (
                <p
                  className="mt-1 text-[11px] text-[var(--text-muted)] truncate"
                  title={track.tags.join(", ")}
                >
                  {track.tags.slice(0, 3).join(" · ")}
                </p>
              )}

              {missingTrackIds?.has(track.id) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRelinkTrack?.(track);
                  }}
                  title="Linked Android file could not be read — tap to relink"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--warning)] hover:text-[var(--accent)] hover:underline cursor-pointer"
                >
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>Missing</span>
                  <span aria-hidden="true">·</span>
                  <Link2 className="w-3 h-3 shrink-0" />
                  <span>Relink</span>
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
};
