import {AlertTriangle, ArchiveRestore, X} from 'lucide-react';
import React, {useState} from 'react';
import type {ParsedBackupArchive} from '../../lib/backup';
import {formatFileSize, formatShortDate} from '../../lib/formatters';

interface ImportBackupModalProps {
  backup: ParsedBackupArchive;
  existingBooksCount: number;
  isRestoring: boolean;
  onConfirm: (mode: 'merge' | 'replace') => void;
  onCancel: () => void;
}

export const ImportBackupModal: React.FC<ImportBackupModalProps> = ({
  backup,
  existingBooksCount,
  isRestoring,
  onConfirm,
  onCancel,
}) => {
  const [mode, setMode] = useState<'merge' | 'replace'>(
    existingBooksCount > 0 ? 'merge' : 'replace'
  );

  const {snapshot} = backup;

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
        aria-label="Import Folio backup"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <ArchiveRestore className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-serif-editorial text-lg font-semibold text-[var(--text-primary)]">
                Import Library Backup
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)] truncate">
                {backup.fileName} · {formatFileSize(backup.fileSize)} · Exported{' '}
                {formatShortDate(backup.exportedAt)}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isRestoring}
            onClick={onCancel}
            aria-label="Close backup import modal"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Backup Contents Summary */}
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-4 border-b border-[var(--border-subtle)] text-xs">
            <div>
              <div className="font-mono-tabular text-base font-semibold text-[var(--text-primary)]">
                {snapshot.books.length}
              </div>
              <div className="text-[var(--text-muted)]">
                Books ({snapshot.files.length} files)
              </div>
            </div>
            <div>
              <div className="font-mono-tabular text-base font-semibold text-[var(--text-primary)]">
                {snapshot.folders.length + snapshot.viewFolders.length}
              </div>
              <div className="text-[var(--text-muted)]">Folders &amp; shelves</div>
            </div>
            <div>
              <div className="font-mono-tabular text-base font-semibold text-[var(--text-primary)]">
                {snapshot.highlights.length + snapshot.bookmarks.length}
              </div>
              <div className="text-[var(--text-muted)]">Highlights &amp; bookmarks</div>
            </div>
          </div>

          {/* Merge vs Replace Options */}
          <div className="space-y-2.5">
            <span className="block text-xs font-medium text-[var(--text-secondary)]">
              How should this backup be applied?
            </span>

            <label
              className={`flex items-start gap-3 p-3.5 rounded-md border transition-colors cursor-pointer ${
                mode === 'merge'
                  ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'
              }`}
            >
              <input
                type="radio"
                name="restore-mode"
                value="merge"
                checked={mode === 'merge'}
                onChange={() => setMode('merge')}
                className="mt-0.5 accent-[var(--accent)] cursor-pointer"
              />
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Merge with Current Library
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  Keeps all {existingBooksCount} current {existingBooksCount === 1 ? 'book' : 'books'}{' '}
                  and adds missing books, folders, view shelves, highlights, and bookmarks from the
                  backup without creating duplicates.
                </p>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3.5 rounded-md border transition-colors cursor-pointer ${
                mode === 'replace'
                  ? 'border-[var(--danger)] bg-[var(--bg-surface)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'
              }`}
            >
              <input
                type="radio"
                name="restore-mode"
                value="replace"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
                className="mt-0.5 accent-[var(--danger)] cursor-pointer"
              />
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Replace Entire Library
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  Clears all existing local books, folders, notes, and settings, then restores this
                  backup exactly as it was exported.
                </p>
              </div>
            </label>

            {mode === 'replace' && existingBooksCount > 0 && (
              <div className="flex items-start gap-2 pt-1 text-[11px] text-[var(--danger)]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  This will overwrite your current {existingBooksCount}{' '}
                  {existingBooksCount === 1 ? 'book' : 'books'} and annotations in this browser.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isRestoring}
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-md border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isRestoring}
            onClick={() => onConfirm(mode)}
            className={`px-4 py-2 text-xs font-medium rounded-md text-white disabled:opacity-60 cursor-pointer whitespace-nowrap ${
              mode === 'replace'
                ? 'bg-[var(--danger)] hover:bg-[var(--danger-hover)]'
                : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]'
            }`}
          >
            {isRestoring
              ? 'Restoring Backup...'
              : mode === 'replace'
                ? 'Replace Library'
                : 'Merge Backup'}
          </button>
        </div>
      </div>
    </div>
  );
};
