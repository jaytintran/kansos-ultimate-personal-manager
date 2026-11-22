import { AlertTriangle, ArchiveRestore, X } from "lucide-react";
import React, { useState } from "react";
import type { ParsedAudioBackupArchive } from "../../lib/audioBackup";
import { formatFileSize, formatShortDate } from "../../lib/formatters";

interface AudioImportBackupModalProps {
  backup: ParsedAudioBackupArchive;
  existingTracksCount: number;
  isRestoring: boolean;
  onConfirm: (mode: "merge" | "replace") => void;
  onCancel: () => void;
}

export const AudioImportBackupModal: React.FC<AudioImportBackupModalProps> = ({
  backup,
  existingTracksCount,
  isRestoring,
  onConfirm,
  onCancel,
}) => {
  const [mode, setMode] = useState<"merge" | "replace">(
    existingTracksCount > 0 ? "merge" : "replace",
  );
  const { snapshot } = backup;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={() => {
        if (!isRestoring) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import Kanso Audio backup"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <ArchiveRestore className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Import Audio ZIP Backup
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)] truncate">
                {backup.fileName} · {formatFileSize(backup.fileSize)} · Exported{" "}
                {formatShortDate(backup.exportedAt)}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isRestoring}
            onClick={onCancel}
            aria-label="Close backup import modal"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-3 gap-3 pb-4 border-b border-[var(--border-subtle)] text-xs">
            <div>
              <div className="font-mono tabular-nums text-base font-semibold text-[var(--text-primary)]">
                {snapshot.tracks.length}
              </div>
              <div className="text-[var(--text-muted)]">
                Tracks ({snapshot.files.length} files)
              </div>
            </div>
            <div>
              <div className="font-mono tabular-nums text-base font-semibold text-[var(--text-primary)]">
                {snapshot.folders.length + snapshot.playlists.length}
              </div>
              <div className="text-[var(--text-muted)]">Folders &amp; Playlists</div>
            </div>
            <div>
              <div className="font-mono tabular-nums text-base font-semibold text-[var(--text-primary)]">
                {snapshot.presets.length}
              </div>
              <div className="text-[var(--text-muted)]">Mix Presets</div>
            </div>
          </div>

          <div className="space-y-2.5">
            <span className="block text-xs font-medium text-[var(--text-secondary)]">
              How should this archive be applied?
            </span>

            <label
              className={`flex items-start gap-3 p-3.5 rounded-md border transition-colors cursor-pointer ${
                mode === "merge"
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
              }`}
            >
              <input
                type="radio"
                name="audio-restore-mode"
                value="merge"
                checked={mode === "merge"}
                onChange={() => setMode("merge")}
                className="mt-0.5 accent-[var(--accent)] cursor-pointer"
              />
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Merge with Current Audio Library
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  Keeps all {existingTracksCount} existing tracks and adds missing
                  tracks, folders, playlists, and mix presets without duplicates.
                </p>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3.5 rounded-md border transition-colors cursor-pointer ${
                mode === "replace"
                  ? "border-[var(--danger)] bg-[var(--bg-surface)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
              }`}
            >
              <input
                type="radio"
                name="audio-restore-mode"
                value="replace"
                checked={mode === "replace"}
                onChange={() => setMode("replace")}
                className="mt-0.5 accent-[var(--danger)] cursor-pointer"
              />
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Replace Entire Audio Library
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  Clears existing local audio files, playlists, and mix presets,
                  then restores this archive cleanly.
                </p>
              </div>
            </label>

            {mode === "replace" && existingTracksCount > 0 && (
              <div className="flex items-start gap-2 pt-1 text-[11px] text-[var(--danger)]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  This overwrites all {existingTracksCount} local audio tracks on
                  this device.
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isRestoring}
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-md border border-[var(--border-strong)] text-[var(--text-primary)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isRestoring}
            onClick={() => onConfirm(mode)}
            className={`px-4 py-2 text-xs font-medium rounded-md text-white disabled:opacity-60 cursor-pointer ${
              mode === "replace"
                ? "bg-[var(--danger)]"
                : "bg-[var(--accent)] text-[var(--accent-contrast)]"
            }`}
          >
            {isRestoring
              ? "Restoring…"
              : mode === "replace"
                ? "Replace Audio"
                : "Merge Backup"}
          </button>
        </div>
      </div>
    </div>
  );
};
