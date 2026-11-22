import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Headphones,
  Layers,
  Link2,
  ListPlus,
  Palette,
  Pencil,
  Play,
  RotateCcw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import React, { useState } from "react";
import {
  formatAudioDuration,
  getAudioFolderIds,
} from "../../lib/audioFormatters";
import {
  flattenFoldersHierarchy,
  formatFileSize,
  formatRelativeDate,
  formatShortDate,
} from "../../lib/formatters";
import type {
  AudioFolderRecord,
  AudioPlaylistRecord,
  AudioTrackRecord,
} from "../../types/audio";
import type { CoverStyle } from "../../types/library";
import { CoverCustomizer } from "../library/CoverCustomizer";
import { AudioArtwork } from "./AudioArtwork";

interface AudioInspectorProps {
  track: AudioTrackRecord | null;
  isOpen: boolean;
  isMissing?: boolean;
  folders: AudioFolderRecord[];
  playlists: AudioPlaylistRecord[];
  onClose: () => void;
  onPlayTrack: (track: AudioTrackRecord) => void;
  onAddToMix: (track: AudioTrackRecord) => void;
  onAddToQueue: (track: AudioTrackRecord) => void;
  onUpdateTrack: (updated: AudioTrackRecord) => void;
  onEditMetadata: (track: AudioTrackRecord) => void;
  onRelinkTrack?: (track: AudioTrackRecord) => void;
  onDeleteTrack: (trackId: string) => void;
}

export const AudioInspector: React.FC<AudioInspectorProps> = ({
  track,
  isOpen,
  isMissing = false,
  folders,
  playlists,
  onClose,
  onPlayTrack,
  onAddToMix,
  onAddToQueue,
  onUpdateTrack,
  onEditMetadata,
  onRelinkTrack,
  onDeleteTrack,
}) => {
  const [showCoverEditor, setShowCoverEditor] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!isOpen) return null;

  const flatFolders = flattenFoldersHierarchy(folders);
  const folderPathById = new Map(
    flatFolders.map((item) => [item.folder.id, item.pathLabel]),
  );

  const handleCoverPatch = (patch: {
    coverDataUrl?: string | null;
    coverPaletteIndex?: number;
    coverStyle?: CoverStyle;
  }) => {
    if (!track) return;
    onUpdateTrack({
      ...track,
      ...patch,
    });
  };

  const trackPlaylists = track
    ? playlists.filter((pl) => pl.trackIds.includes(track.id))
    : [];

  const resumePct =
    track && track.durationSeconds > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              (track.currentPositionSeconds / track.durationSeconds) * 100,
            ),
          ),
        )
      : 0;

  const panelBody = !track ? (
    <div className="flex flex-col h-full">
      <div className="h-14 px-5 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <span className="font-display text-sm font-semibold text-[var(--text-primary)]">
          Track Inspector
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close track inspector"
          className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <Headphones className="w-6 h-6 text-[var(--text-muted)] mb-3" />
        <p className="font-sans text-sm font-medium text-[var(--text-primary)]">
          Select a track to inspect
        </p>
        <p className="mt-1.5 text-xs text-[var(--text-muted)] leading-relaxed max-w-[220px]">
          Click any audio card to inspect metadata, customize artwork, or layer
          into your mix.
        </p>
      </div>
    </div>
  ) : (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 px-5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0">
        <span className="font-display text-sm font-semibold text-[var(--text-primary)] truncate">
          Track Inspector
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() =>
              onUpdateTrack({ ...track, isFavorite: !track.isFavorite })
            }
            title={track.isFavorite ? "Remove favorite" : "Mark as favorite"}
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Star
              className={`w-4 h-4 ${
                track.isFavorite
                  ? "fill-[var(--accent)] text-[var(--accent)]"
                  : ""
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => onEditMetadata(track)}
            title="Edit metadata"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close track inspector"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        <div className="flex flex-col items-center text-center">
          <div className="w-36 shadow-sm">
            <AudioArtwork
              title={track.title}
              artist={track.artist}
              format={track.format}
              coverDataUrl={track.coverDataUrl}
              paletteIndex={track.coverPaletteIndex}
              coverStyle={track.coverStyle}
              size="md"
            />
          </div>

          <h2 className="mt-4 font-display text-base font-semibold leading-snug text-[var(--text-primary)]">
            {track.title}
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {track.artist}
          </p>
          {track.album?.trim() && (
            <p className="mt-0.5 text-xs text-[var(--text-muted)] line-clamp-1">
              {track.album}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-[var(--text-muted)] font-mono tabular-nums">
            <span className="uppercase">{track.format}</span>
            <span>·</span>
            <span>{formatAudioDuration(track.durationSeconds)}</span>
            <span>·</span>
            <span>{formatFileSize(track.fileSize)}</span>
          </div>

          {isMissing && (
            <div className="mt-3 w-full rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-left text-[11px] text-[var(--warning)] flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Linked Android audio file could not be read. Relink from device
                storage to continue playback.
              </span>
            </div>
          )}

          <div className="mt-4 w-full flex items-center gap-2">
            {isMissing && onRelinkTrack ? (
              <button
                type="button"
                onClick={() => onRelinkTrack(track)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Relink File</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onPlayTrack(track)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {track.currentPositionSeconds > 2 ? "Resume" : "Play Track"}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onAddToMix(track)}
              title="Layer track in active Mixer"
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-md text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onAddToQueue(track)}
              title="Add to Queue"
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-md text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <ListPlus className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setShowCoverEditor((v) => !v)}
              title="Customize artwork"
              className={`inline-flex items-center gap-1 px-2 py-2 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                showCoverEditor
                  ? "border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              {showCoverEditor ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>

        {showCoverEditor && (
          <div className="pt-4 border-t border-[var(--border-subtle)]">
            <CoverCustomizer
              title={track.title}
              author={track.artist}
              format="epub"
              coverDataUrl={track.coverDataUrl}
              coverPaletteIndex={track.coverPaletteIndex}
              coverStyle={track.coverStyle ?? "editorial"}
              onChange={handleCoverPatch}
              compact
            />
          </div>
        )}

        {/* Exact Saved Playback Position */}
        <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">Saved Position</span>
            <span className="font-mono tabular-nums font-medium text-[var(--text-primary)]">
              {formatAudioDuration(track.currentPositionSeconds)} /{" "}
              {formatAudioDuration(track.durationSeconds)}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-all"
              style={{ width: `${resumePct}%` }}
            />
          </div>
          {track.currentPositionSeconds > 0 && (
            <button
              type="button"
              onClick={() =>
                onUpdateTrack({ ...track, currentPositionSeconds: 0 })
              }
              className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset saved timestamp to 0:00</span>
            </button>
          )}
        </div>

        {/* Notes */}
        {track.notes && (
          <div className="pt-4 border-t border-[var(--border-subtle)] space-y-1.5">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              Track Notes
            </span>
            <p className="text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-line">
              {track.notes}
            </p>
          </div>
        )}

        {/* Catalog Details */}
        <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2 text-xs">
          <span className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
            Audio Details
          </span>
          <dl className="space-y-1.5">
            {(() => {
              const assignedFolders = getAudioFolderIds(track)
                .map((id) => folderPathById.get(id))
                .filter((name): name is string => Boolean(name));
              return (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[var(--text-muted)] shrink-0">Folders</dt>
                  <dd className="text-[var(--text-primary)] text-right truncate">
                    {assignedFolders.length > 0
                      ? assignedFolders.join(" · ")
                      : "Unfiled"}
                  </dd>
                </div>
              );
            })()}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--text-muted)] shrink-0">Playlists</dt>
              <dd className="text-[var(--text-primary)] text-right truncate">
                {trackPlaylists.length > 0
                  ? trackPlaylists.map((p) => p.name).join(" · ")
                  : "None"}
              </dd>
            </div>
            {track.genre && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--text-muted)] shrink-0">Genre</dt>
                <dd className="text-[var(--text-primary)] text-right truncate">
                  {track.genre}
                </dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--text-muted)] shrink-0">Plays</dt>
              <dd className="font-mono tabular-nums text-[var(--text-secondary)] text-right">
                {track.playCount ?? 0}
                {track.lastPlayedAt
                  ? ` · ${formatRelativeDate(track.lastPlayedAt)}`
                  : ""}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--text-muted)] shrink-0">Added</dt>
              <dd className="font-mono tabular-nums text-[var(--text-secondary)] text-right">
                {formatShortDate(track.addedAt)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--text-muted)] shrink-0">Storage</dt>
              <dd className="text-right">
                {isMissing ? (
                  <span className="text-[var(--warning)] font-medium">
                    Missing on device
                  </span>
                ) : track.storageMode === "android-uri" ? (
                  <span className="text-[var(--accent)]">
                    Linked on device · 0 B in app
                  </span>
                ) : (
                  <span className="text-[var(--text-secondary)]">
                    App storage · {formatFileSize(track.fileSize)}
                  </span>
                )}
              </dd>
            </div>
            {track.tags.length > 0 && (
              <div className="flex items-baseline justify-between gap-3 pt-1">
                <dt className="text-[var(--text-muted)] shrink-0">Tags</dt>
                <dd className="text-[var(--text-secondary)] text-right">
                  {track.tags.join(" · ")}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2 shrink-0">
        {confirmDelete ? (
          <div className="flex items-center gap-2 w-full justify-between">
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(false);
                onDeleteTrack(track.id);
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--danger)] text-white cursor-pointer"
            >
              Confirm Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-2.5 py-1.5 text-xs text-[var(--text-secondary)] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onEditMetadata(track)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit Metadata</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete track"
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside
        aria-label="Audio track inspector panel"
        className="hidden xl:flex flex-col w-[330px] shrink-0 h-full border-l border-[var(--border-subtle)] bg-[var(--bg-sidebar)]"
      >
        {panelBody}
      </aside>

      <div
        className="hidden md:flex xl:hidden fixed inset-0 z-40 justify-end bg-black/40"
        onClick={onClose}
      >
        <aside
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm h-full bg-[var(--bg-elevated)] border-l border-[var(--border-subtle)] shadow-2xl"
        >
          {panelBody}
        </aside>
      </div>

      <div
        className="md:hidden fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-[2px] overscroll-none"
        onClick={onClose}
      >
        <aside
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className="w-full max-h-[88dvh] rounded-t-2xl border-t border-x border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl flex flex-col overflow-hidden overscroll-none pb-safe"
        >
          <div className="pt-2.5 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1 rounded-full bg-[var(--border-strong)]" />
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {panelBody}
          </div>
        </aside>
      </div>
    </>
  );
};
