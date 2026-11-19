import {
  BookOpen,
  Download,
  Highlighter,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import React, {useMemo, useState} from 'react';
import {formatShortDate, HIGHLIGHT_COLORS} from '../../lib/formatters';
import type {BookRecord, HighlightColor, HighlightRecord} from '../../types/library';
import {BookCover} from './BookCover';

interface HighlightsHubViewProps {
  books: BookRecord[];
  highlights: HighlightRecord[];
  onOpenPassage: (book: BookRecord, unitIndex: number) => void;
  onUpdateHighlight: (updated: HighlightRecord) => void;
  onDeleteHighlight: (id: string) => void;
  onBackToBooks: () => void;
}

export const HighlightsHubView: React.FC<HighlightsHubViewProps> = ({
  books,
  highlights,
  onOpenPassage,
  onUpdateHighlight,
  onDeleteHighlight,
  onBackToBooks,
}) => {
  const [query, setQuery] = useState('');
  const [bookFilter, setBookFilter] = useState<string>('all');
  const [colorFilter, setColorFilter] = useState<'all' | HighlightColor>('all');
  const [notesOnly, setNotesOnly] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState('');

  const bookById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  const booksWithHighlights = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of highlights) {
      counts.set(h.bookId, (counts.get(h.bookId) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([bookId, count]) => ({book: bookById.get(bookId), count}))
      .filter((entry): entry is {book: BookRecord; count: number} => Boolean(entry.book))
      .sort((a, b) => b.count - a.count || a.book.title.localeCompare(b.book.title));
  }, [highlights, bookById]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return highlights.filter((hl) => {
      const book = bookById.get(hl.bookId);
      if (!book) return false;
      if (bookFilter !== 'all' && hl.bookId !== bookFilter) return false;
      if (colorFilter !== 'all' && hl.color !== colorFilter) return false;
      if (notesOnly && !hl.note.trim()) return false;
      if (q) {
        const hay = `${hl.selectedText} ${hl.note} ${book.title} ${book.subtitle ?? ''} ${book.author}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [highlights, bookById, bookFilter, colorFilter, notesOnly, query]);

  const handleExportMarkdown = () => {
    if (filtered.length === 0) return;
    const grouped = new Map<string, {book: BookRecord; items: HighlightRecord[]}>();
    for (const hl of filtered) {
      const book = bookById.get(hl.bookId);
      if (!book) continue;
      const entry = grouped.get(book.id) ?? {book, items: []};
      entry.items.push(hl);
      grouped.set(book.id, entry);
    }

    const lines: string[] = ['# Folio Highlights & Study Notes', ''];
    for (const {book, items} of grouped.values()) {
      lines.push(`## ${book.title} — ${book.author}`, '');
      for (const item of items) {
        const loc =
          book.format === 'pdf' ? `Page ${item.unitIndex}` : `Section ${item.unitIndex + 1}`;
        lines.push(`> ${item.selectedText.replace(/\n+/g, ' ')}`);
        lines.push(`> — *${loc} · ${formatShortDate(item.createdAt)}*`);
        if (item.note.trim()) {
          lines.push('', `**Note:** ${item.note.trim()}`);
        }
        lines.push('');
      }
    }

    const blob = new Blob([lines.join('\n')], {type: 'text/markdown;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `folio-highlights-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (highlights.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
        <Highlighter className="w-7 h-7 text-[var(--text-muted)] mb-3" />
        <h2 className="font-serif-editorial text-xl font-semibold text-[var(--text-primary)]">
          No highlights or study notes yet
        </h2>
        <p className="mt-2 text-xs text-[var(--text-secondary)] max-w-sm leading-relaxed">
          Select any passage while reading in Folio to highlight it and add a study note. All of
          your annotations across every book will gather here.
        </p>
        <button
          type="button"
          onClick={onBackToBooks}
          className="mt-5 px-4 py-2 text-xs font-medium rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          Browse Library
        </button>
      </div>
    );
  }

  return (
    <div className="p-5 lg:p-8 pb-24 max-w-5xl w-full mx-auto space-y-6">
      {/* Filter & Export Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-xs min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search passages or notes..."
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear highlight search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={bookFilter}
            onChange={(e) => setBookFilter(e.target.value)}
            aria-label="Filter highlights by book"
            className="px-2.5 py-1.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] max-w-[210px] cursor-pointer"
          >
            <option value="all">All books ({booksWithHighlights.length})</option>
            {booksWithHighlights.map(({book, count}) => (
              <option key={book.id} value={book.id}>
                {book.title} ({count})
              </option>
            ))}
          </select>

          <div
            role="group"
            aria-label="Filter by highlight color"
            className="inline-flex items-center gap-1 p-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-sidebar)]"
          >
            <button
              type="button"
              onClick={() => setColorFilter('all')}
              className={`px-2 py-1 text-[11px] rounded transition-colors cursor-pointer ${
                colorFilter === 'all'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-medium'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              All
            </button>
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.label}
                aria-label={`Filter ${c.label} highlights`}
                onClick={() => setColorFilter(colorFilter === c.id ? 'all' : c.id)}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  colorFilter === c.id ? 'bg-[var(--bg-elevated)] ring-1 ring-[var(--accent)]' : ''
                }`}
              >
                <span
                  className="block w-2.5 h-2.5 rounded-full"
                  style={{backgroundColor: c.swatch}}
                />
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={notesOnly}
              onChange={(e) => setNotesOnly(e.target.checked)}
              className="w-3.5 h-3.5 accent-[var(--accent)] rounded cursor-pointer"
            />
            <span>With notes</span>
          </label>
        </div>

        <button
          type="button"
          disabled={filtered.length === 0}
          onClick={handleExportMarkdown}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Markdown</span>
        </button>
      </div>

      {/* Results List */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <p className="font-serif-editorial text-base text-[var(--text-primary)]">
            No highlights match those filters
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setBookFilter('all');
              setColorFilter('all');
              setNotesOnly(false);
            }}
            className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
          >
            Reset highlight filters
          </button>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-subtle)]">
          {filtered.map((hl) => {
            const book = bookById.get(hl.bookId);
            if (!book) return null;
            const colorMeta = HIGHLIGHT_COLORS.find((c) => c.id === hl.color);
            const isEditing = editingId === hl.id;

            return (
              <article key={hl.id} className="py-5 first:pt-1 space-y-3">
                {/* Provenance Row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
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
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenPassage(book, hl.unitIndex)}
                        className="font-serif-editorial text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] truncate block text-left cursor-pointer"
                      >
                        {book.title}
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                        <span className="truncate">{book.author}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">
                          {book.format === 'pdf'
                            ? `Page ${hl.unitIndex}`
                            : `Section ${hl.unitIndex + 1}`}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{backgroundColor: colorMeta?.swatch ?? '#D99B2B'}}
                          />
                          <span>{colorMeta?.label ?? 'Highlight'}</span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatShortDate(hl.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenPassage(book, hl.unitIndex)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>Open Passage</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(hl.id);
                        setDraftNote(hl.note);
                      }}
                      title="Edit note"
                      aria-label="Edit highlight note"
                      className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteHighlight(hl.id)}
                      title="Delete highlight"
                      aria-label="Delete highlight"
                      className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Passage Quote */}
                <blockquote className="pl-10 font-serif-editorial text-[15px] leading-relaxed text-[var(--text-primary)]">
                  &ldquo;{hl.selectedText}&rdquo;
                </blockquote>

                {/* Study Note or Inline Editor */}
                <div className="pl-10">
                  {isEditing ? (
                    <div className="space-y-2 max-w-2xl">
                      <textarea
                        rows={3}
                        autoFocus
                        value={draftNote}
                        onChange={(e) => setDraftNote(e.target.value)}
                        placeholder="Write your reflection or study note..."
                        className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)] resize-y"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateHighlight({...hl, note: draftNote.trim()});
                            setEditingId(null);
                          }}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] cursor-pointer"
                        >
                          Save Note
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : hl.note.trim() ? (
                    <p className="text-xs leading-relaxed text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md px-3.5 py-2.5 max-w-3xl">
                      {hl.note}
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
