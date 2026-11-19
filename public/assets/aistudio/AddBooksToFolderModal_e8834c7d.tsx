import {Check, Search, X} from 'lucide-react';
import React, {useMemo, useState} from 'react';
import type {BookRecord, ViewFolderRecord} from '../../types/library';
import {BookCover} from './BookCover';

interface AddBooksToFolderModalProps {
  folder: ViewFolderRecord;
  availableBooks: BookRecord[];
  onSave: (folderId: string, nextBookIds: string[]) => void;
  onClose: () => void;
}

export const AddBooksToFolderModal: React.FC<AddBooksToFolderModalProps> = ({
  folder,
  availableBooks,
  onSave,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(folder.bookIds));

  const filteredBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableBooks;
    return availableBooks.filter((b) =>
      `${b.title} ${b.author} ${b.series}`.toLowerCase().includes(q)
    );
  }, [availableBooks, query]);

  const toggleBook = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Manage books in ${folder.name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[80vh] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="font-serif-editorial text-base font-semibold text-[var(--text-primary)] truncate">
              Books in &ldquo;{folder.name}&rdquo;
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Select books from this view to include in this folder.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close picker"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Quick Actions */}
        <div className="px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center gap-3 shrink-0">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter books in this view..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set(availableBooks.map((b) => b.id)))}
            className="text-xs text-[var(--accent)] hover:underline cursor-pointer whitespace-nowrap"
          >
            Select all
          </button>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>

        {/* Book Checklist */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] px-5">
          {filteredBooks.length === 0 ? (
            <p className="py-10 text-center text-xs text-[var(--text-muted)]">
              No matching books in this view.
            </p>
          ) : (
            filteredBooks.map((book) => {
              const checked = selectedIds.has(book.id);
              return (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => toggleBook(book.id)}
                  className="w-full py-2.5 flex items-center gap-3 text-left hover:bg-[var(--bg-surface-hover)] -mx-2 px-2 rounded transition-colors cursor-pointer"
                >
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                      checked
                        ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'border-[var(--border-strong)] bg-[var(--bg-input)] text-transparent'
                    }`}
                  >
                    <Check className="w-3 h-3 stroke-[2.5]" />
                  </span>
                  <div className="w-7 shrink-0">
                    <BookCover
                      title={book.title}
                      author={book.author}
                      format={book.format}
                      coverDataUrl={book.coverDataUrl}
                      paletteIndex={book.coverPaletteIndex}
                      coverStyle={book.coverStyle}
                      size="sm"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-serif-editorial text-xs font-semibold text-[var(--text-primary)] truncate">
                      {book.title}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] truncate">
                      {book.author} · <span className="font-mono-tabular uppercase">{book.format}</span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3 shrink-0">
          <span className="font-mono-tabular text-xs text-[var(--text-secondary)]">
            {selectedIds.size} {selectedIds.size === 1 ? 'book' : 'books'} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium rounded-md border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(folder.id, Array.from(selectedIds))}
              className="px-4 py-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] cursor-pointer"
            >
              Save Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
