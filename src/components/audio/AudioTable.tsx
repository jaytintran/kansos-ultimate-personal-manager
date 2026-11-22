import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Info,
  Layers,
  Link2,
  ListPlus,
  Pencil,
  Play,
  Star,
} from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import { formatAudioDuration, getAudioFolderIds } from "../../lib/audioFormatters";
import { flattenFoldersHierarchy, formatShortDate } from "../../lib/formatters";
import type {
  AudioFolderRecord,
  AudioSortDirection,
  AudioSortField,
  AudioTrackRecord,
} from "../../types/audio";
import { AudioArtwork } from "./AudioArtwork";
import { extractDraggedAudioIds, hasDraggedAudioPayload } from "./AudioSidebar";

interface AudioTableProps {
  tracks: AudioTrackRecord[];
  folders: AudioFolderRecord[];
  selectedIds: Set<string>;
  allSelected: boolean;
  inspectorOpen: boolean;
  inspectedTrackId: string | null;
  activeSlotTrackIds: Set<string>;
  playingTrackIds: Set<string>;
  sortField: AudioSortField;
  sortDirection: AudioSortDirection;
  isCustomSort?: boolean;
  missingTrackIds?: Set<string>;
  onReorderTracks?: (
    draggedIds: string[],
    targetTrackId: string,
    position: "before" | "after",
  ) => void;
  onSortChange: (field: AudioSortField) => void;
  onToggleSelect: (trackId: string, shiftKey: boolean) => void;
  onToggleSelectAll: () => void;
  onPlayTrack: (track: AudioTrackRecord) => void;
  onAddToMix: (track: AudioTrackRecord) => void;
  onAddToQueue: (track: AudioTrackRecord) => void;
  onInspectTrack: (track: AudioTrackRecord) => void;
  onEditTrack: (track: AudioTrackRecord) => void;
  onRelinkTrack?: (track: AudioTrackRecord) => void;
  onToggleFavorite: (track: AudioTrackRecord) => void;
  onContextMenuTrack?: (track: AudioTrackRecord, e: React.MouseEvent) => void;
}

export const AudioTable: React.FC<AudioTableProps> = ({
  tracks,
  folders,
  selectedIds,
  allSelected,
  inspectorOpen,
  inspectedTrackId,
  activeSlotTrackIds,
  playingTrackIds,
  sortField,
  sortDirection,
  isCustomSort = false,
  missingTrackIds,
  onReorderTracks,
  onSortChange,
  onToggleSelect,
  onToggleSelectAll,
  onPlayTrack,
  onAddToMix,
  onAddToQueue,
  onInspectTrack,
  onEditTrack,
  onRelinkTrack,
  onToggleFavorite,
  onContextMenuTrack,
}) => {
  const folderById = useMemo(
    () =>
      new Map(
        flattenFoldersHierarchy(folders).map((item) => [
          item.folder.id,
          item.pathLabel,
        ]),
      ),
    [folders],
  );

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

  const renderSortIcon = (field: AudioSortField) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3 h-3 inline ml-1 text-[var(--accent)]" />
    ) : (
      <ArrowDown className="w-3 h-3 inline ml-1 text-[var(--accent)]" />
    );
  };

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-muted)] bg-[var(--bg-sidebar)]/55">
            <th className="w-10 px-3 py-2.5">
              <button
                type="button"
                onClick={onToggleSelectAll}
                aria-label={
                  allSelected
                    ? "Deselect all visible tracks"
                    : "Select all visible tracks"
                }
                className={`w-4 h-4 rounded flex items-center justify-center border transition-colors cursor-pointer ${
                  allSelected
                    ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]"
                    : "border-[var(--border-strong)] bg-[var(--bg-input)] text-transparent hover:border-[var(--accent)]"
                }`}
              >
                <Check className="w-3 h-3 stroke-[2.5]" />
              </button>
            </th>
            <th className="px-3 py-2.5">
              <button
                type="button"
                onClick={() => onSortChange("title")}
                className="hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                Title {renderSortIcon("title")}
              </button>
            </th>
            <th className="px-3 py-2.5">
              <button
                type="button"
                onClick={() => onSortChange("artist")}
                className="hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                Artist {renderSortIcon("artist")}
              </button>
            </th>
            <th className="px-3 py-2.5 w-20">
              <button
                type="button"
                onClick={() => onSortChange("format")}
                className="hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                Format {renderSortIcon("format")}
              </button>
            </th>
            <th className="px-3 py-2.5 hidden lg:table-cell">Folder</th>
            <th className="px-3 py-2.5 hidden xl:table-cell">Tags</th>
            <th className="px-3 py-2.5 text-right w-24">
              <button
                type="button"
                onClick={() => onSortChange("duration")}
                className="hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                Duration {renderSortIcon("duration")}
              </button>
            </th>
            <th className="px-3 py-2.5 text-right hidden sm:table-cell w-24">
              <button
                type="button"
                onClick={() => onSortChange("addedAt")}
                className="hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                Added {renderSortIcon("addedAt")}
              </button>
            </th>
            <th className="px-3 py-2.5 text-right w-36">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
          {tracks.map((track) => {
            const isSelected = selectedIds.has(track.id);
            const isInspected = inspectorOpen && inspectedTrackId === track.id;
            const isPlayingTrack = playingTrackIds.has(track.id);
            const isInMix = activeSlotTrackIds.has(track.id);
            const folderNames = getAudioFolderIds(track)
              .map((id) => folderById.get(id))
              .filter((name): name is string => Boolean(name));
            const folder =
              folderNames.length > 0 ? folderNames.join(" · ") : "—";

            const isBeingDragged = draggingIds.includes(track.id);
            const isDropTarget = dropTarget?.trackId === track.id;

            return (
              <tr
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
                    e.clientY < rect.top + rect.height / 2 ? "before" : "after";
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
                    e.clientY < rect.top + rect.height / 2 ? "before" : "after";
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
                onClick={() => {
                  if (inspectorOpen) onInspectTrack(track);
                }}
                onDoubleClick={() => onPlayTrack(track)}
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
                className={`h-[48px] transition-colors ${
                  isCustomSort ? "cursor-grab active:cursor-grabbing" : ""
                } ${isBeingDragged ? "opacity-45" : ""} ${
                  isSelected || isInspected
                    ? "bg-[var(--bg-accent-subtle)]"
                    : "hover:bg-[var(--bg-surface-hover)]"
                }`}
              >
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
                    {isCustomSort && (
                      <GripVertical
                        aria-hidden="true"
                        className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0"
                      />
                    )}
                    <button
                      type="button"
                      aria-label={
                        isSelected
                          ? `Deselect ${track.title}`
                          : `Select ${track.title}`
                      }
                      onClick={(e) => onToggleSelect(track.id, e.shiftKey)}
                      className={`w-4 h-4 rounded flex items-center justify-center border transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]"
                          : "border-[var(--border-strong)] bg-[var(--bg-input)] text-transparent hover:border-[var(--accent)]"
                      }`}
                    >
                      <Check className="w-3 h-3 stroke-[2.5]" />
                    </button>
                  </div>
                </td>

                <td className="px-3 py-2 max-w-[280px]">
                  <div className="flex items-center gap-3 min-w-0">
                    <AudioArtwork
                      title={track.title}
                      artist={track.artist}
                      format={track.format}
                      coverDataUrl={track.coverDataUrl}
                      paletteIndex={track.coverPaletteIndex}
                      coverStyle={track.coverStyle}
                      size="sm"
                      isPlaying={isPlayingTrack}
                      className="w-7 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (inspectorOpen) onInspectTrack(track);
                          else onPlayTrack(track);
                        }}
                        className={`block w-full font-sans text-sm font-medium truncate text-left cursor-pointer ${
                          isInMix
                            ? "text-[var(--accent)]"
                            : "text-[var(--text-primary)] hover:text-[var(--accent)]"
                        }`}
                      >
                        {track.title}
                      </button>
                      {track.album?.trim() && (
                        <p className="text-[11px] text-[var(--text-muted)] truncate leading-snug">
                          {track.album}
                        </p>
                      )}
                      {missingTrackIds?.has(track.id) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRelinkTrack?.(track);
                          }}
                          className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--warning)] hover:text-[var(--accent)] hover:underline cursor-pointer"
                        >
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>Missing · Relink</span>
                        </button>
                      )}
                    </div>
                  </div>
                </td>

                <td className="px-3 py-2 text-[var(--text-secondary)] max-w-[160px] truncate">
                  {track.artist}
                </td>

                <td className="px-3 py-2 font-mono tabular-nums uppercase text-[11px] text-[var(--text-secondary)]">
                  {track.format}
                </td>

                <td
                  className="px-3 py-2 hidden lg:table-cell text-[var(--text-secondary)] max-w-[150px] truncate"
                  title={folder}
                >
                  {folder}
                </td>

                <td
                  className="px-3 py-2 hidden xl:table-cell text-[var(--text-muted)] max-w-[160px] truncate"
                  title={track.tags.join(", ")}
                >
                  {track.tags.length > 0 ? track.tags.join(" · ") : "—"}
                </td>

                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-primary)] whitespace-nowrap">
                  {formatAudioDuration(track.durationSeconds)}
                </td>

                <td className="px-3 py-2 text-right hidden sm:table-cell font-mono tabular-nums text-[var(--text-muted)] whitespace-nowrap">
                  {formatShortDate(track.addedAt)}
                </td>

                <td
                  className="px-3 py-2 text-right whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="inline-flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(track)}
                      title={track.isFavorite ? "Unfavorite" : "Favorite"}
                      className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-canvas)] cursor-pointer"
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
                      onClick={() => onAddToMix(track)}
                      title="Layer in Mixer"
                      className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-canvas)] cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddToQueue(track)}
                      title="Add to Queue"
                      className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] cursor-pointer"
                    >
                      <ListPlus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onInspectTrack(track)}
                      title="Inspect track details"
                      className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] cursor-pointer"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditTrack(track)}
                      title="Edit metadata"
                      className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {missingTrackIds?.has(track.id) && onRelinkTrack && (
                      <button
                        type="button"
                        onClick={() => onRelinkTrack(track)}
                        title="Relink file from Android storage"
                        className="p-1.5 rounded text-[var(--warning)] hover:text-[var(--accent)] hover:bg-[var(--bg-canvas)] cursor-pointer"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onPlayTrack(track)}
                      title="Play track"
                      className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-canvas)] cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
