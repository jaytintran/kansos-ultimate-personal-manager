import {Check, Info, MoreHorizontal, Pencil, Star, X} from 'lucide-react';
import React from 'react';
import type {
  BookRecord,
  CardDetailOptions,
  CategoryRecord,
  CoverSize,
} from '../../types/library';
import {BookCover} from './BookCover';

interface BookGridProps {
  books: BookRecord[];
  categories: CategoryRecord[];
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  coverSize: CoverSize;
  cardDetails: CardDetailOptions;
  inspectorOpen: boolean;
  inspectedBookId: string | null;
  onOpenBook: (book: BookRecord) => void;
  onInspectBook: (book: BookRecord) => void;
  onEditBook: (book: BookRecord) => void;
  onToggleFavorite: (book: BookRecord) => void;
  onToggleSelect: (bookId: string, shiftKey: boolean) => void;
  onRemoveFromFolder?: (book: BookRecord) => void;
  onQuickAction?: (book: BookRecord) => void;
  onContextMenuBook?: (book: BookRecord, e: React.MouseEvent) => void;
}

const GRID_COLUMNS_BY_SIZE: Record<CoverSize, string> = {
  compact:
    'grid-cols-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-x-4 gap-y-6 sm:gap-y-7',
  standard:
    'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-x-4 sm:gap-x-6 gap-y-6 sm:gap-y-9',
  large:
    'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-5 sm:gap-x-7 gap-y-7 sm:gap-y-10',
};

export const BookGrid: React.FC<BookGridProps> = ({
  books,
  categories,
  selectedIds,
  isSelectionMode,
  coverSize,
  cardDetails,
  inspectorOpen,
  inspectedBookId,
  onOpenBook,
  onInspectBook,
  onEditBook,
  onToggleFavorite,
  onToggleSelect,
  onRemoveFromFolder,
  onQuickAction,
  onContextMenuBook,
}) => {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const handleCardPrimaryClick = (book: BookRecord, e: React.MouseEvent) => {
    if (isSelectionMode || e.shiftKey || e.metaKey || e.ctrlKey) {
      e.preventDefault();
      onToggleSelect(book.id, e.shiftKey);
      return;
    }
    const isDesktopInspector =
      inspectorOpen && typeof window !== 'undefined' && window.innerWidth >= 1280;
    if (isDesktopInspector) {
      onInspectBook(book);
    } else {
      onOpenBook(book);
    }
  };

  return (
    <div className={`grid ${GRID_COLUMNS_BY_SIZE[coverSize]}`}>
      {books.map((book) => {
        const isSelected = selectedIds.has(book.id);
        const isInspected = inspectorOpen && inspectedBookId === book.id;
        const categoryName = book.categoryId ? categoryNameById.get(book.categoryId) : null;

        const metaParts: React.ReactNode[] = [];
        if (cardDetails.format) {
          metaParts.push(
            <span key="format" className="font-mono-tabular uppercase shrink-0">
              {book.format}
            </span>
          );
        }
        if (cardDetails.category && categoryName) {
          metaParts.push(
            <span key="category" className="truncate">
              {categoryName}
            </span>
          );
        }
        if (cardDetails.progress) {
          metaParts.push(
            <span key="progress" className="font-mono-tabular shrink-0">
              {book.status === 'finished'
                ? 'Done'
                : book.progress > 0
                  ? `${book.progress}%`
                  : 'Unread'}
            </span>
          );
        }

        return (
          <article
            key={book.id}
            draggable
            onDragStart={(e) => {
              const dragIds =
                selectedIds.has(book.id) && selectedIds.size > 1
                  ? Array.from(selectedIds)
                  : [book.id];
              e.dataTransfer.setData('application/x-folio-book-id', book.id);
              e.dataTransfer.setData('application/x-folio-book-ids', JSON.stringify(dragIds));
              e.dataTransfer.effectAllowed = 'move';
            }}
            onContextMenu={(e) => {
              if (!onContextMenuBook) return;
              e.preventDefault();
              onContextMenuBook(book, e);
            }}
            className="group flex flex-col min-w-0"
          >
            {/* 3:4 Cover Container */}
            <div
              onClick={(e) => handleCardPrimaryClick(book, e)}
              onDoubleClick={() => onOpenBook(book)}
              className={`relative cursor-pointer rounded-[5px] transition-transform duration-150 ease-out group-hover:-translate-y-0.5 ${
                isSelected
                  ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-canvas)]'
                  : isInspected
                    ? 'ring-2 ring-[var(--text-primary)]/45 ring-offset-2 ring-offset-[var(--bg-canvas)]'
                    : ''
              }`}
            >
              <BookCover
                title={book.title}
                author={book.author}
                format={book.format}
                coverDataUrl={book.coverDataUrl}
                paletteIndex={book.coverPaletteIndex}
                coverStyle={book.coverStyle}
                size={coverSize === 'large' ? 'lg' : 'md'}
              />

              {/* Subtle bottom reading progress bar */}
              {cardDetails.progress && book.progress > 0 && (
                <div
                  aria-label={`Reading progress ${book.progress}%`}
                  className="absolute inset-x-0 bottom-0 h-1 bg-black/30 overflow-hidden rounded-b-[4px]"
                >
                  <div
                    className="h-full bg-[var(--accent)] transition-all"
                    style={{width: `${Math.min(100, Math.max(2, book.progress))}%`}}
                  />
                </div>
              )}

              {/* Selection Checkbox (top-left) */}
              <button
                type="button"
                aria-label={isSelected ? `Deselect ${book.title}` : `Select ${book.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(book.id, e.shiftKey);
                }}
                className={`absolute top-2 left-2 w-6 h-6 rounded flex items-center justify-center border transition-opacity cursor-pointer ${
                  isSelected
                    ? 'opacity-100 bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]'
                    : isSelectionMode
                      ? 'opacity-100 bg-[var(--bg-elevated)]/95 border-[var(--border-strong)] text-transparent hover:border-[var(--accent)]'
                      : 'opacity-0 group-hover:opacity-100 focus:opacity-100 bg-[var(--bg-elevated)]/95 border-[var(--border-strong)] text-transparent hover:border-[var(--accent)]'
                }`}
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>

              {/* Desktop Hover Quick Actions (top-right, lg+ only) */}
              <div
                className={`hidden lg:flex absolute top-2 right-2 items-center gap-1 transition-opacity ${
                  book.isFavorite
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                }`}
              >
                <button
                  type="button"
                  title={book.isFavorite ? 'Remove favorite' : 'Mark as favorite'}
                  aria-label={book.isFavorite ? `Unfavorite ${book.title}` : `Favorite ${book.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(book);
                  }}
                  className="w-7 h-7 rounded flex items-center justify-center bg-[var(--bg-elevated)]/95 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer"
                >
                  <Star
                    className={`w-3.5 h-3.5 ${
                      book.isFavorite ? 'fill-[var(--accent)] text-[var(--accent)]' : ''
                    }`}
                  />
                </button>
                <button
                  type="button"
                  title="Inspect book details"
                  aria-label={`Inspect ${book.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onInspectBook(book);
                  }}
                  className="w-7 h-7 rounded flex items-center justify-center bg-[var(--bg-elevated)]/95 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Edit metadata"
                  aria-label={`Edit metadata for ${book.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditBook(book);
                  }}
                  className="w-7 h-7 rounded flex items-center justify-center bg-[var(--bg-elevated)]/95 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {onRemoveFromFolder && (
                  <button
                    type="button"
                    title="Remove from folder"
                    aria-label={`Remove ${book.title} from folder`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFromFolder(book);
                    }}
                    className="w-7 h-7 rounded flex items-center justify-center bg-[var(--bg-elevated)]/95 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--danger)] cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Mobile Always-Accessible Quick Action Button (<lg, 44px hitbox) */}
              {onQuickAction && !isSelectionMode && (
                <button
                  type="button"
                  aria-label={`More actions for ${book.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickAction(book);
                  }}
                  className="lg:hidden absolute top-0 right-0 w-11 h-11 flex items-start justify-end p-1.5 cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-md flex items-center justify-center bg-[var(--bg-elevated)]/92 backdrop-blur-xs border border-[var(--border-subtle)] text-[var(--text-primary)] shadow-xs">
                    <MoreHorizontal className="w-4 h-4" />
                  </span>
                </button>
              )}

              {/* Subtle Favorite Badge on Mobile Cover when favorited */}
              {book.isFavorite && !isSelectionMode && (
                <span
                  aria-hidden="true"
                  className="lg:hidden absolute top-1.5 left-1.5 w-6 h-6 rounded-md flex items-center justify-center bg-[var(--bg-elevated)]/90 border border-[var(--border-subtle)]"
                >
                  <Star className="w-3 h-3 fill-[var(--accent)] text-[var(--accent)]" />
                </span>
              )}
            </div>

            {/* Clean Unboxed Metadata */}
            <div className="mt-2.5 min-w-0">
              <button
                type="button"
                onClick={(e) => handleCardPrimaryClick(book, e)}
                onDoubleClick={() => onOpenBook(book)}
                className={`text-left w-full font-serif-editorial font-semibold leading-snug text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors line-clamp-2 cursor-pointer ${
                  coverSize === 'compact' ? 'text-[13px]' : 'text-[15px]'
                }`}
              >
                {book.title}
              </button>

              {cardDetails.subtitle && book.subtitle?.trim() && (
                <p
                  className="mt-0.5 text-xs text-[var(--text-secondary)] line-clamp-1"
                  title={book.subtitle}
                >
                  {book.subtitle}
                </p>
              )}

              {cardDetails.author && (
                <p className="mt-1 text-xs text-[var(--text-secondary)] truncate">{book.author}</p>
              )}

              {metaParts.length > 0 && (
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] truncate">
                  {metaParts.map((part, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && <span aria-hidden="true">·</span>}
                      {part}
                    </React.Fragment>
                  ))}
                </div>
              )}

              {cardDetails.tags && book.tags.length > 0 && (
                <p
                  className="mt-1 text-[11px] text-[var(--text-muted)] truncate"
                  title={book.tags.join(', ')}
                >
                  {book.tags.slice(0, 3).join(' · ')}
                  {book.tags.length > 3 ? ` +${book.tags.length - 3}` : ''}
                </p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
};
