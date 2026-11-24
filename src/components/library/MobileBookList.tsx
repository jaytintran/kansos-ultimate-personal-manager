import {
  AlertTriangle,
  Check,
  GripVertical,
  Link2,
  MoreHorizontal,
  Star,
} from "lucide-react";
import React, { useRef, useState } from "react";
import type { LibraryPointerDropTarget } from "../../hooks/useLibraryBookDrag";
import type {
  BookRecord,
  CardDetailOptions,
  CategoryRecord,
} from "../../types/library";
import { BookCover } from "./BookCover";

interface MobileBookListProps {
  books: BookRecord[];
  categories: CategoryRecord[];
  cardDetails: CardDetailOptions;
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  isCustomSort?: boolean;
  activeDragBookIds?: Set<string>;
  activePointerDropTarget?: LibraryPointerDropTarget | null;
  onBookPointerDown?: (bookId: string, e: React.PointerEvent) => void;
  shouldSuppressClick?: () => boolean;
  onReorderBooks?: (
    draggedIds: string[],
    targetBookId: string,
    position: "before" | "after",
  ) => void;
  onOpenBook: (book: BookRecord) => void;
  onQuickAction: (book: BookRecord) => void;
  onToggleSelect: (bookId: string, shiftKey: boolean) => void;
  missingBookIds?: Set<string>;
  onRelinkBook?: (book: BookRecord) => void;
}

export const MobileBookList: React.FC<MobileBookListProps> = ({
  books,
  categories,
  cardDetails,
  selectedIds,
  isSelectionMode,
  isCustomSort = false,
  activeDragBookIds,
  activePointerDropTarget,
  onBookPointerDown,
  shouldSuppressClick,
  onReorderBooks,
  onOpenBook,
  onQuickAction,
  onToggleSelect,
  missingBookIds,
  onRelinkBook,
}) => {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    bookId: string;
    position: "before" | "after";
  } | null>(null);

  const resolveDropTargetAtY = (
    clientY: number,
    activeId: string,
  ): { bookId: string; position: "before" | "after" } | null => {
    for (const book of books) {
      if (book.id === activeId) continue;
      const el = rowRefs.current.get(book.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return {
          bookId: book.id,
          position: clientY < rect.top + rect.height / 2 ? "before" : "after",
        };
      }
    }
    return null;
  };

  const resetPointerDrag = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  return (
    <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)] bg-[var(--bg-surface)] -mx-4 sm:mx-0 sm:rounded-lg sm:border">
      {books.map((book) => {
        const isSelected = selectedIds.has(book.id);
        const isDragging =
          draggingId === book.id || Boolean(activeDragBookIds?.has(book.id));
        const pointerReorderTarget =
          activePointerDropTarget?.kind === "book-reorder" &&
          activePointerDropTarget.bookId === book.id
            ? activePointerDropTarget
            : null;
        const resolvedDropPos =
          dropTarget?.bookId === book.id
            ? dropTarget.position
            : pointerReorderTarget?.position ?? null;
        const isDropTarget = resolvedDropPos !== null;
        const categoryName = book.categoryId
          ? categoryNameById.get(book.categoryId)
          : null;
        const progressLabel =
          book.status === "finished"
            ? "Finished"
            : book.progress > 0
              ? `${book.progress}%`
              : "Unread";

        return (
          <div
            key={book.id}
            ref={(el) => {
              if (el) rowRefs.current.set(book.id, el);
              else rowRefs.current.delete(book.id);
            }}
            data-library-reorder-id={isCustomSort ? book.id : undefined}
            data-library-reorder-axis={isCustomSort ? "y" : undefined}
            onPointerDown={(e) => onBookPointerDown?.(book.id, e)}
            onClick={() => {
              if (draggingId || shouldSuppressClick?.()) return;
              if (isSelectionMode) {
                onToggleSelect(book.id, false);
              } else {
                onOpenBook(book);
              }
            }}
            style={
              isDropTarget && resolvedDropPos
                ? {
                    boxShadow:
                      resolvedDropPos === "before"
                        ? "inset 0 2px 0 var(--accent)"
                        : "inset 0 -2px 0 var(--accent)",
                  }
                : undefined
            }
            className={`flex items-center gap-3 px-4 py-3 min-h-[76px] transition-colors active:bg-[var(--bg-surface-hover)] cursor-pointer ${
              isDragging
                ? "opacity-65 bg-[var(--accent-soft)]"
                : isSelected
                  ? "bg-[var(--bg-accent-subtle)]/60"
                  : ""
            }`}
          >
            {/* Touch/Pointer Drag Handle when Custom Order is active */}
            {isCustomSort && !isSelectionMode && onReorderBooks && (
              <div
                role="button"
                tabIndex={0}
                data-no-book-drag="true"
                aria-label={`Reorder ${book.title}`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDraggingId(book.id);
                  setDropTarget(null);
                }}
                onPointerMove={(e) => {
                  if (draggingId !== book.id) return;
                  const nextTarget = resolveDropTargetAtY(e.clientY, book.id);
                  setDropTarget(nextTarget);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (draggingId === book.id) {
                    const finalTarget =
                      resolveDropTargetAtY(e.clientY, book.id) ?? dropTarget;
                    if (finalTarget && finalTarget.bookId !== book.id) {
                      onReorderBooks(
                        [book.id],
                        finalTarget.bookId,
                        finalTarget.position,
                      );
                    }
                  }
                  resetPointerDrag();
                }}
                onPointerCancel={resetPointerDrag}
                className="touch-none select-none min-w-[36px] min-h-[44px] -ml-2 flex items-center justify-center rounded-lg text-[var(--text-muted)] active:text-[var(--accent)] cursor-grab active:cursor-grabbing shrink-0"
              >
                <GripVertical className="w-4 h-4" />
              </div>
            )}

            {/* Selection Checkbox (visible when in selection mode) */}
            {isSelectionMode && (
              <button
                type="button"
                data-no-book-drag="true"
                aria-label={
                  isSelected ? `Deselect ${book.title}` : `Select ${book.title}`
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(book.id, false);
                }}
                className={`w-6 h-6 rounded flex items-center justify-center border shrink-0 transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]"
                    : "bg-[var(--bg-elevated)] border-[var(--border-strong)] text-transparent"
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
                <h3 className="font-sans text-sm font-medium leading-snug text-[var(--text-primary)] line-clamp-2 flex-1">
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

              <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                {book.author}
              </p>

              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] truncate">
                <span className="font-mono-tabular uppercase shrink-0">
                  {book.format}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular shrink-0">
                  {progressLabel}
                </span>
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
                    style={{
                      width: `${Math.min(100, Math.max(4, book.progress))}%`,
                    }}
                  />
                </div>
              )}

              {missingBookIds?.has(book.id) && (
                <button
                  type="button"
                  data-no-book-drag="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRelinkBook?.(book);
                  }}
                  className="mt-1.5 inline-flex items-center gap-1.5 min-h-[28px] text-[11px] font-medium text-[var(--warning)] hover:text-[var(--accent)] cursor-pointer"
                >
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>Missing</span>
                  <span aria-hidden="true">·</span>
                  <Link2 className="w-3 h-3 shrink-0" />
                  <span>Tap to Relink</span>
                </button>
              )}
            </div>

            {/* Always-Visible 44px Touch Quick Menu Button */}
            {!isSelectionMode && (
              <button
                type="button"
                data-no-book-drag="true"
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
