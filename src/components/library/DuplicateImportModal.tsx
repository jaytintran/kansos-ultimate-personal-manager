import {AlertTriangle, X} from 'lucide-react';
import React, {useState} from 'react';
import {formatFileSize, formatShortDate} from '../../lib/formatters';
import type {BookRecord, ImportMetadataResult} from '../../types/library';
import {BookCover} from './BookCover';

export type DuplicateResolutionAction = 'skip' | 'replace' | 'keep-both';

export interface PendingDuplicateItem {
  id: string;
  file: File;
  arrayBuffer: ArrayBuffer;
  metadata: ImportMetadataResult;
  existingBook: BookRecord;
  matchReason: 'Same file name & size' | 'Same title & author';
}

interface DuplicateImportModalProps {
  items: PendingDuplicateItem[];
  onResolve: (decisions: Record<string, DuplicateResolutionAction>) => void;
  onCancel: () => void;
}

export const DuplicateImportModal: React.FC<DuplicateImportModalProps> = ({
  items,
  onResolve,
  onCancel,
}) => {
  const [decisions, setDecisions] = useState<Record<string, DuplicateResolutionAction>>(() => {
    const init: Record<string, DuplicateResolutionAction> = {};
    for (const item of items) {
      init[item.id] = 'skip';
    }
    return init;
  });

  const setAll = (action: DuplicateResolutionAction) => {
    const next: Record<string, DuplicateResolutionAction> = {};
    for (const item of items) {
      next[item.id] = action;
    }
    setDecisions(next);
  };

  const replaceCount = Object.values(decisions).filter((d) => d === 'replace').length;
  const keepCount = Object.values(decisions).filter((d) => d === 'keep-both').length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Resolve duplicate books"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[82vh] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
            <div>
              <h2 className="font-serif-editorial text-lg font-semibold text-[var(--text-primary)]">
                Duplicate {items.length === 1 ? 'Book' : 'Books'} Detected
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                {items.length === 1
                  ? 'This file matches a book already in your library. Replacing preserves your folder, tags, bookmarks, and highlights.'
                  : `${items.length} incoming files match books already in your library. Replacing preserves folders, tags, bookmarks, and highlights.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel duplicate resolution"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Batch Quick-Set Strip */}
        {items.length > 1 && (
          <div className="px-6 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3 text-xs shrink-0">
            <span className="text-[var(--text-secondary)]">Set all {items.length} conflicts:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAll('skip')}
                className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                Skip All
              </button>
              <button
                type="button"
                onClick={() => setAll('replace')}
                className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                Replace All
              </button>
              <button
                type="button"
                onClick={() => setAll('keep-both')}
                className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                Keep All
              </button>
            </div>
          </div>
        )}

        {/* Conflict Rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] px-6">
          {items.map((item) => {
            const action = decisions[item.id] ?? 'skip';
            return (
              <div
                key={item.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 shrink-0">
                    <BookCover
                      title={item.existingBook.title}
                      author={item.existingBook.author}
                      format={item.existingBook.format}
                      coverDataUrl={item.existingBook.coverDataUrl}
                      paletteIndex={item.existingBook.coverPaletteIndex}
                      coverStyle={item.existingBook.coverStyle}
                      size="sm"
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="font-serif-editorial text-sm font-semibold text-[var(--text-primary)] truncate">
                      {item.metadata.title}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] truncate">
                      {item.metadata.author} · {item.matchReason}
                    </div>
                    <div className="font-mono-tabular text-[11px] text-[var(--text-muted)] flex flex-wrap items-center gap-x-2">
                      <span>
                        Existing: {item.existingBook.format.toUpperCase()},{' '}
                        {formatFileSize(item.existingBook.fileSize)}, {item.existingBook.progress}%
                        read ({formatShortDate(item.existingBook.addedAt)})
                      </span>
                      <span>·</span>
                      <span>
                        Incoming: {item.metadata.format.toUpperCase()},{' '}
                        {formatFileSize(item.file.size)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Per-Item Resolution Segmented Control */}
                <div
                  role="group"
                  aria-label={`Action for ${item.metadata.title}`}
                  className="inline-flex items-center p-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] shrink-0 self-start sm:self-center"
                >
                  {(
                    [
                      {id: 'skip', label: 'Skip'},
                      {id: 'replace', label: 'Replace'},
                      {id: 'keep-both', label: 'Keep Both'},
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDecisions((prev) => ({...prev, [item.id]: opt.id}))}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                        action === opt.id
                          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3 shrink-0">
          <span className="font-mono-tabular text-xs text-[var(--text-secondary)]">
            {replaceCount > 0 || keepCount > 0
              ? `${replaceCount} replace · ${keepCount} keep both`
              : 'All conflicts set to skip'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium rounded-md border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
            >
              Skip All &amp; Close
            </button>
            <button
              type="button"
              onClick={() => onResolve(decisions)}
              className="px-4 py-2 text-xs font-medium rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] cursor-pointer whitespace-nowrap"
            >
              Apply Choices
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
