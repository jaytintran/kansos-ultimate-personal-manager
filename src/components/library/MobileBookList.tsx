import {Check, MoreHorizontal, Star} from 'lucide-react';
import React from 'react';
import type {BookRecord, CardDetailOptions, CategoryRecord} from '../../types/library';
import {BookCover} from './BookCover';

interface MobileBookListProps {
  books: BookRecord[];
  categories: CategoryRecord[];
  cardDetails: CardDetailOptions;
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  onOpenBook: (book: BookRecord) => void;
  onQuickAction: (book: BookRecord) => void;
  onToggleSelect: (bookId: string, shiftKey: boolean) => void;
}

export const MobileBookList: React.FC<MobileBookListProps> = ({
  books,
  categories,
  cardDetails,
  selectedIds,
  isSelectionMode,
  onOpenBook,
  onQuickAction,
  onToggleSelect,
}) => {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)] bg-[var(--bg-surface)] -mx-4 sm:mx-0 sm:rounded-lg sm:border">
      {books.map((book) => {
        const isSelected = selectedIds.has(book.id);
        const categoryName = book.categoryId ? categoryNameById.get(book.categoryId) : null;
        const progressLabel =
          book.status === 'finished'
            ? 'Finished'
            : book.progress > 0
              ? `${book.progress}%`
              : 'Unread';

        return (
          <div
            key={book.id}
            onClick={() => {
              if (isSelectionMode) {
                onToggleSelect(book.id, false);
              } else {
                onOpenBook(book);
              }
            }}
            className={`flex items-center gap-3 px-4 py-3 min-h-[76px] transition-colors active:bg-[var(--bg-surface-hover)] cursor-pointer ${
              isSelected ? 'bg-[var(--bg-accent-subtle)]/60' : ''
            }`}
          >
            {/* Selection Checkbox (visible when in selection mode) */}
            {isSelectionMode && (
              <button
                type="button"
                aria-label={isSelected ? `Deselect ${book.title}` : `Select ${book.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(book.id, false);
                }}
                className={`w-6 h-6 rounded flex items-center justify-center border shrink-0 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'bg-[var(--bg-elevated)] border-[var(--border-strong)] text-transparent'
                }`}
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            )}

            {/* 3:4 Cover Thumbnail */}
            <div className="w-11 shrink-0 relative">
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

            {/* Book Details & Clean Unboxed Metadata */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-1.5">
                <h3 className="font-serif-editorial text-[15px] font-semibold leading-snug text-[var(--text-primary)] line-clamp-2 flex-1">
                  {book.title}
                </h3>
                {book.isFavorite && (
                  <Star className="w-3.5 h-3.5 fill-[var(--accent)] text-[var(--accent)] shrink-0 mt-0.5" />
                )}
              </div>

              {cardDetails.subtitle && book.subtitle?.trim() && (
                <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                  {book.subtitle}
                </p>
              )}

              <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{book.author}</p>

              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] truncate">
                <span className="font-mono-tabular uppercase shrink-0">{book.format}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular shrink-0">{progressLabel}</span>
                {categoryName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{categoryName}</span>
                  </>
                )}
              </div>

              {book.progress > 0 && (
                <div className="mt-1.5 h-1 w-full max-w-[140px] rounded-full bg-[var(--border-subtle)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)]"
                    style={{width: `${Math.min(100, Math.max(4, book.progress))}%`}}
                  />
                </div>
              )}
            </div>

            {/* Always-Visible 44px Touch Quick Menu Button */}
            {!isSelectionMode && (
              <button
                type="button"
                aria-label={`Actions for ${book.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickAction(book);
                }}
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-lg text-[var(--text-secondary)] active:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
