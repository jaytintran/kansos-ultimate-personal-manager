import {FolderInput, FolderPlus, X} from 'lucide-react';
import React, {useEffect} from 'react';

export interface PendingFolderDrop {
  kind: 'sidebar' | 'view';
  targetFolderId: string;
  targetFolderName: string;
  bookIds: string[];
  bookTitles: string[];
  existingFolderNames: string[];
}

interface FolderDropActionModalProps {
  pendingDrop: PendingFolderDrop | null;
  onAdd: () => void;
  onMove: () => void;
  onCancel: () => void;
}

export const FolderDropActionModal: React.FC<FolderDropActionModalProps> = ({
  pendingDrop,
  onAdd,
  onMove,
  onCancel,
}) => {
  useEffect(() => {
    if (!pendingDrop) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingDrop, onCancel]);

  if (!pendingDrop) return null;

  const count = pendingDrop.bookIds.length;
  const singleTitle = count === 1 ? pendingDrop.bookTitles[0] : null;
  const existingLabel = pendingDrop.existingFolderNames.slice(0, 3).join(' · ');
  const extraCount = Math.max(0, pendingDrop.existingFolderNames.length - 3);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Add or move to ${pendingDrop.targetFolderName}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif-editorial text-lg font-semibold text-[var(--text-primary)] leading-snug">
              Add or Move to &ldquo;{pendingDrop.targetFolderName}&rdquo;?
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {singleTitle ? (
                <>
                  <span className="font-medium text-[var(--text-primary)]">
                    &ldquo;{singleTitle}&rdquo;
                  </span>{' '}
                  is already filed in another folder.
                </>
              ) : (
                <>
                  <span className="font-mono-tabular font-medium text-[var(--text-primary)]">
                    {count}
                  </span>{' '}
                  selected books include titles already filed in other folders.
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel folder drop"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Context Summary */}
        <div className="px-6 py-4 space-y-4">
          {existingLabel && (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs">
              <span className="block text-[11px] font-medium text-[var(--text-muted)]">
                Currently in
              </span>
              <p className="mt-0.5 text-[var(--text-primary)] leading-relaxed">
                {existingLabel}
                {extraCount > 0 ? ` · +${extraCount} more` : ''}
              </p>
            </div>
          )}

          {/* Action Choices */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={onAdd}
              className="w-full px-4 py-3 rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-3 text-left cursor-pointer"
            >
              <FolderPlus className="w-4 h-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">
                  Add to &ldquo;{pendingDrop.targetFolderName}&rdquo;
                </span>
                <span className="block text-[11px] opacity-85">
                  Keep in current {pendingDrop.existingFolderNames.length === 1 ? 'folder' : 'folders'} as well
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={onMove}
              className="w-full px-4 py-3 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors flex items-center gap-3 text-left cursor-pointer"
            >
              <FolderInput className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">
                  Move to &ldquo;{pendingDrop.targetFolderName}&rdquo;
                </span>
                <span className="block text-[11px] text-[var(--text-secondary)]">
                  Remove from previous{' '}
                  {pendingDrop.kind === 'sidebar' ? 'library folders' : 'folders in this view'}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 text-xs font-medium rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
