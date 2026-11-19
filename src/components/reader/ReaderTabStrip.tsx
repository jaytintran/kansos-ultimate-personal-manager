import {BookOpen, Library, X} from 'lucide-react';
import React from 'react';
import type {BookRecord} from '../../types/library';

interface ReaderTabStripProps {
  openBooks: BookRecord[];
  activeBookId: string | null; // null means Library view is active
  onSelectLibrary: () => void;
  onSelectBook: (bookId: string) => void;
  onCloseBookTab: (bookId: string) => void;
}

export const ReaderTabStrip: React.FC<ReaderTabStripProps> = ({
  openBooks,
  activeBookId,
  onSelectLibrary,
  onSelectBook,
  onCloseBookTab,
}) => {
  if (openBooks.length === 0) return null;

  const isLibraryActive = activeBookId === null;

  return (
    <div
      role="tablist"
      aria-label="Open books"
      className="pt-safe lg:pt-0 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] select-none shrink-0"
    >
      <div className="h-10 lg:h-9 px-2 flex items-end gap-1 overflow-x-auto no-scrollbar">
        {/* Persistent Library Tab */}
        <button
          type="button"
          role="tab"
          aria-selected={isLibraryActive}
          onClick={onSelectLibrary}
          className={`h-9 lg:h-8 px-3 rounded-t-md inline-flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border-t border-x ${
            isLibraryActive
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] -mb-px'
              : 'bg-transparent text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/70'
          }`}
        >
          <Library className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
          <span>Library</span>
        </button>

        <div className="h-4 w-px bg-[var(--border-subtle)] self-center mx-0.5 shrink-0" />

        {/* Open Book Tabs */}
        {openBooks.map((book) => {
          const isActive = activeBookId === book.id;
          return (
            <div
              key={book.id}
              role="tab"
              aria-selected={isActive}
              className={`group h-9 lg:h-8 max-w-[200px] sm:max-w-[220px] min-w-[116px] sm:min-w-[120px] pl-2.5 pr-1.5 rounded-t-md inline-flex items-center gap-1.5 sm:gap-2 text-xs transition-colors shrink-0 border-t border-x ${
                isActive
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium border-[var(--border-subtle)] -mb-px'
                  : 'bg-transparent text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/70'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectBook(book.id)}
                title={`${book.title} — ${book.author}`}
                className="flex-1 min-w-0 h-full flex items-center gap-1.5 text-left cursor-pointer"
              >
                <BookOpen
                  className={`w-3 h-3 shrink-0 ${
                    isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                  }`}
                />
                <span className="truncate">{book.title}</span>
              </button>

              <span className="font-mono-tabular text-[10px] uppercase text-[var(--text-muted)] hidden sm:inline shrink-0">
                {book.format}
              </span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseBookTab(book.id);
                }}
                aria-label={`Close ${book.title}`}
                className={`p-1 lg:p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] cursor-pointer shrink-0 transition-opacity ${
                  isActive
                    ? 'opacity-85 hover:opacity-100'
                    : 'opacity-70 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100'
                }`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
