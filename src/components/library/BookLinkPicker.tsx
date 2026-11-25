import { BookOpen, Check, ChevronDown, Search, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BookNoteLink } from "../../types";
import type { BookRecord } from "../../types/library";
import { BookCover } from "./BookCover";

export function buildBookNoteLink(
  book: BookRecord,
  existingQuote?: string,
): BookNoteLink {
  const unitIndex =
    book.currentLocation?.unitIndex ?? (book.format === "pdf" ? 1 : 0);
  const scrollRatio = book.currentLocation?.scrollRatio ?? 0;
  const locationLabel =
    book.currentLocation?.label ||
    (book.format === "pdf" ? `Page ${unitIndex}` : `Section ${unitIndex + 1}`);
  return {
    bookId: book.id,
    bookTitle: book.title,
    bookAuthor: book.author,
    bookFormat: book.format,
    unitIndex,
    scrollRatio,
    locationLabel,
    ...(existingQuote !== undefined ? { quote: existingQuote } : {}),
    bookRemoved: false,
  };
}

interface BookLinkPickerProps {
  books: BookRecord[];
  selectedBook: BookRecord | null;
  removedBookTitle?: string | null;
  emptyLabel?: string;
  onSelectBook: (book: BookRecord | null) => void;
}

export const BookLinkPicker: React.FC<BookLinkPickerProps> = ({
  books,
  selectedBook,
  removedBookTitle = null,
  emptyLabel = "None (unlinked)",
  onSelectBook,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pickerOpen) {
      setQuery("");
      return;
    }
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerOpen]);

  const groupedBooks = useMemo(() => {
    const q = query.trim().toLowerCase();

    const matchesQuery = (book: BookRecord) => {
      if (!q) return true;
      return (
        (book.title || "").toLowerCase().includes(q) ||
        (book.author || "").toLowerCase().includes(q)
      );
    };

    const byRecentThenTitle = (a: BookRecord, b: BookRecord) => {
      const aTime = a.lastReadAt ?? a.addedAt ?? 0;
      const bTime = b.lastReadAt ?? b.addedAt ?? 0;
      if (bTime !== aTime) return bTime - aTime;
      return (a.title || "").localeCompare(b.title || "");
    };

    const readingBooks: BookRecord[] = [];
    const recentBooks: BookRecord[] = [];
    const otherBooks: BookRecord[] = [];

    for (const book of books) {
      if (!matchesQuery(book)) continue;
      if (book.status === "reading") {
        readingBooks.push(book);
      } else if (book.lastReadAt && book.lastReadAt > 0) {
        recentBooks.push(book);
      } else {
        otherBooks.push(book);
      }
    }

    readingBooks.sort(byRecentThenTitle);
    recentBooks.sort(byRecentThenTitle);
    otherBooks.sort(byRecentThenTitle);

    const groups: Array<{ id: string; label: string; items: BookRecord[] }> = [];
    if (readingBooks.length > 0) {
      groups.push({
        id: "reading",
        label: "Currently Reading",
        items: readingBooks,
      });
    }
    if (recentBooks.length > 0) {
      groups.push({
        id: "recent",
        label: "Recently Read",
        items: recentBooks,
      });
    }
    if (otherBooks.length > 0) {
      groups.push({
        id: "library",
        label:
          readingBooks.length > 0 || recentBooks.length > 0
            ? "Library"
            : "All Books",
        items: otherBooks,
      });
    }

    return groups;
  }, [books, query]);

  const hasMatches = groupedBooks.length > 0;
  const isRemovedSnapshot = Boolean(!selectedBook && removedBookTitle);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        aria-expanded={pickerOpen}
        aria-haspopup="listbox"
        className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1 -mx-1 text-xs font-medium text-left transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
        style={{
          color:
            selectedBook || isRemovedSnapshot
              ? "var(--text-primary)"
              : "var(--text-muted)",
        }}
      >
        <span className="flex items-center gap-2 min-w-0">
          {selectedBook ? (
            <>
              <span className="w-4 shrink-0">
                <BookCover
                  title={selectedBook.title}
                  author={selectedBook.author}
                  format={selectedBook.format}
                  coverDataUrl={selectedBook.coverDataUrl}
                  paletteIndex={selectedBook.coverPaletteIndex}
                  coverStyle={selectedBook.coverStyle}
                  size="sm"
                />
              </span>
              <span className="truncate">{selectedBook.title}</span>
            </>
          ) : isRemovedSnapshot ? (
            <>
              <BookOpen
                className="w-3.5 h-3.5 shrink-0 opacity-70"
                style={{ color: "var(--text-muted)" }}
              />
              <span
                className="truncate"
                style={{ color: "var(--text-muted)" }}
              >
                {removedBookTitle} (Removed)
              </span>
            </>
          ) : (
            <span className="truncate">{emptyLabel}</span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 opacity-70 transition-transform ${
            pickerOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {pickerOpen && (
        <div
          role="listbox"
          aria-label="Select a library book"
          className="mt-1 rounded-xl border overflow-hidden"
          style={{
            backgroundColor: "var(--bg-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow: "var(--shadow-popover)",
          }}
        >
          <div
            className="px-2.5 py-2 border-b flex items-center gap-2"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <Search
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search books by title or author..."
              autoFocus
              className="flex-1 min-w-0 bg-transparent text-xs outline-none"
              style={{ color: "var(--text-primary)" }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="p-0.5 rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                aria-label="Clear book search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto overscroll-contain p-1.5 space-y-2">
            {(selectedBook || isRemovedSnapshot) && !query.trim() && (
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onSelectBook(null);
                  setPickerOpen(false);
                }}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                <span>{emptyLabel}</span>
              </button>
            )}

            {!hasMatches ? (
              <div
                className="py-5 px-3 text-center text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {books.length === 0
                  ? "No books in your Library yet."
                  : "No matching books found."}
              </div>
            ) : (
              groupedBooks.map((group) => (
                <div key={group.id} className="space-y-0.5">
                  <div
                    className="px-2 py-0.5 text-[11px] font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {group.label}
                  </div>
                  {group.items.map((book) => {
                    const selected = selectedBook?.id === book.id;
                    return (
                      <button
                        key={book.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          onSelectBook(book);
                          setPickerOpen(false);
                        }}
                        className="w-full flex items-center justify-between gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        style={{
                          backgroundColor: selected
                            ? "var(--accent-soft)"
                            : "transparent",
                          color: selected
                            ? "var(--accent)"
                            : "var(--text-primary)",
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-6 shrink-0">
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
                          <div className="min-w-0 flex-1">
                            <div
                              className="text-xs font-medium truncate"
                              style={{
                                color: selected
                                  ? "var(--accent)"
                                  : "var(--text-primary)",
                              }}
                            >
                              {book.title || "Untitled Book"}
                            </div>
                            <div
                              className="text-[11px] truncate"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {book.author || "Unknown author"}
                            </div>
                          </div>
                        </div>
                        {selected && (
                          <Check className="w-3.5 h-3.5 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
