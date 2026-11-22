import {
  AlertTriangle,
  CheckSquare,
  FolderInput,
  FolderMinus,
  Info,
  Layers,
  Link2,
  ListMusic,
  Pencil,
  Play,
  Star,
  Trash2,
} from "lucide-react";
import React, { useState } from "react";
import { formatAudioDuration } from "../../lib/audioFormatters";
import type { AudioTrackRecord } from "../../types/audio";
import { BottomSheet } from "../ui/BottomSheet";
import { AudioArtwork } from "./AudioArtwork";

interface AudioMobileActionSheetProps {
  track: AudioTrackRecord | null;
  isMissing?: boolean;
  activePlaylistName?: string | null;
  onClose: () => void;
  onPlayTrack: (track: AudioTrackRecord) => void;
  onLayerInMix: (track: AudioTrackRecord) => void;
  onAddToQueue: (track: AudioTrackRecord) => void;
  onRelinkTrack?: (track: AudioTrackRecord) => void;
  onInspectTrack: (track: AudioTrackRecord) => void;
  onOrganizeTrack: (track: AudioTrackRecord) => void;
  onToggleFavorite: (track: AudioTrackRecord) => void;
  onEditMetadata: (track: AudioTrackRecord) => void;
  onSelectTrack: (track: AudioTrackRecord) => void;
  onRemoveFromPlaylist?: (track: AudioTrackRecord) => void;
  onDeleteTrack: (trackId: string) => void;
}

export const AudioMobileActionSheet: React.FC<AudioMobileActionSheetProps> = ({
  track,
  isMissing = false,
  activePlaylistName,
  onClose,
  onPlayTrack,
  onLayerInMix,
  onAddToQueue,
  onRelinkTrack,
  onInspectTrack,
  onOrganizeTrack,
  onToggleFavorite,
  onEditMetadata,
  onSelectTrack,
  onRemoveFromPlaylist,
  onDeleteTrack,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!track) return null;

  const handleClose = () => {
    setConfirmDelete(false);
    onClose();
  };

  return (
    <BottomSheet
      isOpen={Boolean(track)}
      onClose={handleClose}
      ariaLabel={`Actions for ${track.title}`}
      hideHeader
    >
      <div className="px-4 pt-1 pb-3.5 border-b border-[var(--border-subtle)] flex items-center gap-3">
        <div className="w-12 shrink-0">
          <AudioArtwork
            title={track.title}
            artist={track.artist}
            format={track.format}
            coverDataUrl={track.coverDataUrl}
            paletteIndex={track.coverPaletteIndex}
            coverStyle={track.coverStyle}
            size="sm"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-sm font-semibold text-[var(--text-primary)] line-clamp-2 leading-snug">
            {track.title}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
            {track.artist}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] font-mono tabular-nums uppercase mt-0.5">
            {track.format} · {formatAudioDuration(track.durationSeconds)}
            {track.storageMode === "android-uri" && !isMissing
              ? " · LINKED"
              : ""}
          </p>
          {isMissing && (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--warning)]">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>Linked device file unavailable</span>
            </p>
          )}
        </div>
      </div>

      <div className="py-1.5 px-2 space-y-0.5">
        {isMissing && onRelinkTrack ? (
          <button
            type="button"
            onClick={() => {
              handleClose();
              onRelinkTrack(track);
            }}
            className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--accent)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Link2 className="w-4 h-4 shrink-0" />
            <span>Relink Audio File</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              handleClose();
              onPlayTrack(track);
            }}
            className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--accent)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Play className="w-4 h-4 shrink-0" />
            <span>
              {track.currentPositionSeconds > 1 ? "Resume Track" : "Play Track"}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            handleClose();
            onLayerInMix(track);
          }}
          className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--text-primary)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <Layers className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <span>Layer in Mixer</span>
        </button>

        <button
          type="button"
          onClick={() => {
            handleClose();
            onAddToQueue(track);
          }}
          className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--text-primary)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <ListMusic className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <span>Add to Queue</span>
        </button>

        <button
          type="button"
          onClick={() => {
            handleClose();
            onInspectTrack(track);
          }}
          className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--text-primary)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <Info className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <span>Inspect Track &amp; Resume Point</span>
        </button>

        <button
          type="button"
          onClick={() => {
            handleClose();
            onOrganizeTrack(track);
          }}
          className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--text-primary)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <FolderInput className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <span>Add to Playlist, Folder &amp; Tags</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onToggleFavorite(track);
            handleClose();
          }}
          className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--text-primary)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <Star
            className={`w-4 h-4 shrink-0 ${
              track.isFavorite
                ? "fill-[var(--accent)] text-[var(--accent)]"
                : "text-[var(--text-secondary)]"
            }`}
          />
          <span>
            {track.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            handleClose();
            onEditMetadata(track);
          }}
          className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--text-primary)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <Pencil className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <span>Edit Metadata &amp; Cover</span>
        </button>

        <button
          type="button"
          onClick={() => {
            handleClose();
            onSelectTrack(track);
          }}
          className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--text-primary)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <CheckSquare className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <span>Select Tracks</span>
        </button>

        {onRemoveFromPlaylist && activePlaylistName && (
          <button
            type="button"
            onClick={() => {
              onRemoveFromPlaylist(track);
              handleClose();
            }}
            className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--text-primary)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <FolderMinus className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
            <span className="truncate">
              Remove from &ldquo;{activePlaylistName}&rdquo;
            </span>
          </button>
        )}

        <div className="my-1 border-t border-[var(--border-subtle)]" />

        {confirmDelete ? (
          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--danger)] font-medium">
              Delete permanently from device?
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[40px] px-3 rounded-md border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteTrack(track.id);
                  handleClose();
                }}
                className="min-h-[40px] px-3 rounded-md bg-[var(--danger)] text-white text-xs font-medium cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--danger)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>Delete Track</span>
          </button>
        )}
      </div>
    </BottomSheet>
  );
};
