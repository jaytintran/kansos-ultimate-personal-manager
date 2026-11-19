import {AlertTriangle, X} from 'lucide-react';
import React from 'react';
import {formatFileSize} from '../../lib/formatters';
import type {BookRecord} from '../../types/library';

interface ConfirmDeleteModalProps {
  booksToDelete: BookRecord[];
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  booksToDelete,
  onConfirm,
  onClose,
}) => {
  const totalBytes = booksToDelete.reduce((sum, b) => sum + (b.fileSize || 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm permanent deletion"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-[var(--danger)]/12 text-[var(--danger)] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <h2 className="font-serif-editorial text-lg font-semibold text-[var(--text-primary)]">
                Delete {booksToDelete.length}{' '}
                {booksToDelete.length === 1 ? 'book' : 'books'}?
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
            This permanently removes the selected{' '}
            {booksToDelete.length === 1 ? 'book file' : 'book files'} (
            <span className="font-mono-tabular text-[var(--text-primary)]">
              {formatFileSize(totalBytes)}
            </span>
            ), bookmarks, and highlights from local offline storage. This cannot be undone.
          </p>

          {booksToDelete.length <= 5 && (
            <ul className="mt-4 space-y-1 text-xs text-[var(--text-secondary)] border-t border-[var(--border-subtle)] pt-3">
              {booksToDelete.map((b) => (
                <li key={b.id} className="truncate">
                  {b.title} <span className="text-[var(--text-muted)]">· {b.author}</span>
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
              className="px-4 py-2 text-xs font-medium rounded-md bg-[var(--danger)] text-white hover:bg-[var(--danger-hover)] cursor-pointer"
            >
              Delete Permanently
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
