import { ArrowRight, BookOpen } from "lucide-react";
import React from "react";
import { formatRelativeDate } from "../../lib/formatters";
import type { BookRecord } from "../../types/library";
import { BookCover } from "./BookCover";

interface ContinueReadingShelfProps {
  books: BookRecord[];
  totalHighlightsCount: number;
  onOpenBook: (book: BookRecord) => void;
  onInspectBook: (book: BookRecord) => void;
  onOpenHighlightsHub: () => void;
}

export const ContinueReadingShelf: React.FC<ContinueReadingShelfProps> = ({
  books,
  totalHighlightsCount,
  onOpenBook,
  onInspectBook,
  onOpenHighlightsHub,
}) => {
  const readingCount = books.filter((b) => b.status === "reading").length;
  const finishedCount = books.filter((b) => b.status === "finished").length;
  const unreadCount = books.filter((b) => b.status === "unread").length;

  const activeReads = books
    .filter(
      (b) =>
        b.status === "reading" ||
        (b.lastReadAt !== null && b.status !== "finished"),
    )
    .sort((a, b) => (b.lastReadAt ?? b.addedAt) - (a.lastReadAt ?? a.addedAt))
    .slice(0, 6);

  return (
    <section
      aria-label="Reading overview and continue reading"
      className="mb-8 space-y-5"
    >
      {/* Compact Continue Reading Horizontal Shelf */}
      {activeReads.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Continue Reading
            </h2>
            <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
              {activeReads.length} Active
            </span>
          </div>

          <div
            data-folio-carousel="true"
            className="flex gap-3.5 overflow-x-auto pb-2 -mx-1 px-1"
          >
            {activeReads.map((book) => (
              <div
                key={book.id}
                className="group w-[268px] sm:w-[288px] shrink-0 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] transition-colors p-3 flex items-center gap-3.5"
              >
                <button
                  type="button"
                  onClick={() => onOpenBook(book)}
                  className="w-12 shrink-0 cursor-pointer transition-transform duration-150 group-hover:-translate-y-0.5"
                  aria-label={`Continue reading ${book.title}`}
                >
                  <BookCover
                    title={book.title}
                    author={book.author}
                    format={book.format}
                    coverDataUrl={book.coverDataUrl}
                    paletteIndex={book.coverPaletteIndex}
                    coverStyle={book.coverStyle}
                    size="sm"
                  />
                </button>

                <div className="flex-1 min-w-0 flex flex-col justify-between h-full">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenBook(book)}
                      className="text-left w-full font-sans text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent)] truncate cursor-pointer"
                      title={book.title}
                    >
                      {book.title}
                    </button>
                    {book.subtitle?.trim() && (
                      <p
                        className="text-[11px] text-[var(--text-secondary)] truncate leading-tight mt-0.5"
                        title={book.subtitle}
                      >
                        {book.subtitle}
                      </p>
                    )}
                    <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                      {book.currentLocation?.label || book.author}
                    </p>
                  </div>

                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                      <span className="font-mono-tabular text-[var(--text-primary)] font-medium">
                        {book.progress}%
                      </span>
                      <span className="truncate">
                        {formatRelativeDate(book.lastReadAt)}
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)]"
                        style={{
                          width: `${Math.min(100, Math.max(3, book.progress))}%`,
                        }}
                      />
                    </div>
                    <div className="pt-0.5 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenBook(book)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer whitespace-nowrap"
                      >
                        <BookOpen className="w-3 h-3" />
                        <span>Resume</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onInspectBook(book)}
                        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
