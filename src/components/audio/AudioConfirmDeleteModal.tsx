import { AlertTriangle, X } from "lucide-react";
import React from "react";
import { formatFileSize } from "../../lib/formatters";
import type { AudioTrackRecord } from "../../types/audio";

interface AudioConfirmDeleteModalProps {
  tracksToDelete: AudioTrackRecord[];
  onConfirm: () => void;
  onClose: () => void;
}

export const AudioConfirmDeleteModal: React.FC<
  AudioConfirmDeleteModalProps
> = ({ tracksToDelete, onConfirm, onClose }) => {
  if (tracksToDelete.length === 0) return null;
  const totalBytes = tracksToDelete.reduce(
    (sum, t) => sum + (t.fileSize || 0),
    0,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm audio deletion"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-[var(--danger)]/12 text-[var(--danger)] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Delete {tracksToDelete.length}{" "}
                {tracksToDelete.length === 1 ? "track" : "tracks"}?
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close confirmation"
              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">
            This permanently removes the selected{" "}
            {tracksToDelete.length === 1 ? "audio file" : "audio files"} (
            <span className="font-mono tabular-nums text-[var(--text-primary)]">
              {formatFileSize(totalBytes)}
            </span>
            ) from local app storage and removes it from playlists and active mix
            slots.
          </p>

          {tracksToDelete.length <= 5 && (
            <ul className="mt-4 space-y-1 text-xs text-[var(--text-secondary)] border-t border-[var(--border-subtle)] pt-3">
              {tracksToDelete.map((t) => (
                <li key={t.id} className="truncate">
                  {t.title}{" "}
                  <span className="text-[var(--text-muted)]">· {t.artist}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-md border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="px-4 py-2 text-xs font-medium rounded-md bg-[var(--danger)] text-white cursor-pointer"
            >
              Delete Permanently
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
