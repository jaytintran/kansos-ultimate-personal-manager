import {
  Bookmark,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Highlighter,
  Palette,
  Pencil,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import React, {useState} from 'react';
import {
  flattenFoldersHierarchy,
  formatFileSize,
  formatRelativeDate,
  formatShortDate,
  getBookFolderIds,
  HIGHLIGHT_COLORS,
} from '../../lib/formatters';
import type {
  BookRecord,
  BookmarkRecord,
  CategoryRecord,
  CoverStyle,
  FolderRecord,
  HighlightRecord,
  ReadingStatus,
} from '../../types/library';
import {BookCover} from './BookCover';
import {CoverCustomizer} from './CoverCustomizer';

interface BookInspectorProps {
  book: BookRecord | null;
  isOpen: boolean;
  folders: FolderRecord[];
  categories: CategoryRecord[];
  highlights: HighlightRecord[];
  bookmarks: BookmarkRecord[];
  onClose: () => void;
  onOpenBook: (book: BookRecord, unitIndex?: number) => void;
  onUpdateBook: (updated: BookRecord) => void;
  onEditMetadata: (book: BookRecord) => void;
  onDeleteBook: (bookId: string) => void;
}

export const BookInspector: React.FC<BookInspectorProps> = ({
  book,
  isOpen,
  folders,
  categories,
  highlights,
  bookmarks,
  onClose,
  onOpenBook,
  onUpdateBook,
  onEditMetadata,
  onDeleteBook,
}) => {
  const [showCoverEditor, setShowCoverEditor] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!isOpen) return null;

  const flatFolders = flattenFoldersHierarchy(folders);
  const folderPathById = new Map(flatFolders.map((item) => [item.folder.id, item.pathLabel]));
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));

  const handleStatusChange = (nextStatus: ReadingStatus) => {
    if (!book) return;
    const nextProgress =
      nextStatus === 'finished' ? 100 : nextStatus === 'unread' ? 0 : Math.max(1, book.progress);
    onUpdateBook({
      ...book,
      status: nextStatus,
      progress: nextStatus === book.status ? book.progress : nextProgress,
    });
  };

  const handleCoverPatch = (patch: {
    coverDataUrl?: string | null;
    coverPaletteIndex?: number;
    coverStyle?: CoverStyle;
  }) => {
    if (!book) return;
    onUpdateBook({
      ...book,
      ...patch,
    });
  };

  const panelBody = !book ? (
    <div className="flex flex-col h-full">
      <div className="h-14 px-5 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <span className="font-serif-editorial text-sm font-semibold text-[var(--text-primary)]">
          Book Inspector
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close book inspector"
          className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <BookOpen className="w-6 h-6 text-[var(--text-muted)] mb-3" />
        <p className="font-serif-editorial text-sm font-medium text-[var(--text-primary)]">
          Select a book to inspect
        </p>
        <p className="mt-1.5 text-xs text-[var(--text-muted)] leading-relaxed max-w-[220px]">
          Click any book in your catalog to view its synopsis, customize its cover, or jump into its
          saved notes.
        </p>
      </div>
    </div>
  ) : (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 px-5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0">
        <span className="font-serif-editorial text-sm font-semibold text-[var(--text-primary)] truncate">
          Book Inspector
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onUpdateBook({...book, isFavorite: !book.isFavorite})}
            title={book.isFavorite ? 'Remove favorite' : 'Mark as favorite'}
            aria-label={book.isFavorite ? 'Remove favorite' : 'Mark as favorite'}
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Star
              className={`w-4 h-4 ${
                book.isFavorite ? 'fill-[var(--accent)] text-[var(--accent)]' : ''
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => onEditMetadata(book)}
            title="Edit full metadata"
            aria-label="Edit full metadata"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close book inspector"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Cover + Primary Title */}
        <div className="flex flex-col items-center text-center">
          <div className="w-36 shadow-sm">
            <BookCover
              title={book.title}
              author={book.author}
              format={book.format}
              coverDataUrl={book.coverDataUrl}
              paletteIndex={book.coverPaletteIndex}
              coverStyle={book.coverStyle}
              size="md"
            />
          </div>

          <h2 className="mt-4 font-serif-editorial text-base font-semibold leading-snug text-[var(--text-primary)]">
            {book.title}
          </h2>
          {book.subtitle?.trim() && (
            <p className="mt-1 text-xs text-[var(--text-secondary)] leading-snug line-clamp-2">
              {book.subtitle}
            </p>
          )}
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{book.author}</p>

          <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] text-[var(--text-muted)] font-mono-tabular">
            <span className="uppercase">{book.format}</span>
            <span>·</span>
            <span>{formatFileSize(book.fileSize)}</span>
            {book.year && (
              <>
                <span>·</span>
                <span>{book.year}</span>
              </>
            )}
          </div>

          {/* Primary Action + Cover Customizer Toggle */}
          <div className="mt-4 w-full flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenBook(book)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer whitespace-nowrap"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{book.progress > 0 && book.status !== 'finished' ? 'Continue Reading' : 'Read Book'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCoverEditor((v) => !v)}
              title="Customize cover artwork"
              aria-expanded={showCoverEditor}
              className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                showCoverEditor
                  ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              {showCoverEditor ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Collapsible Cover Customizer */}
        {showCoverEditor && (
          <div className="pt-4 border-t border-[var(--border-subtle)]">
            <CoverCustomizer
              title={book.title}
              author={book.author}
              format={book.format}
              coverDataUrl={book.coverDataUrl}
              coverPaletteIndex={book.coverPaletteIndex}
              coverStyle={book.coverStyle ?? 'editorial'}
              onChange={handleCoverPatch}
              compact
            />
          </div>
        )}

        {/* Reading Progress & Quick Status */}
        <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">Reading progress</span>
            <span className="font-mono-tabular font-medium text-[var(--text-primary)]">
              {book.progress}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-all"
              style={{width: `${book.progress}%`}}
            />
          </div>
          {book.currentLocation?.label && (
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              Last location: {book.currentLocation.label}
              {book.lastReadAt ? ` · ${formatRelativeDate(book.lastReadAt)}` : ''}
            </p>
          )}

          {/* Status Segmented Control */}
          <div
            role="group"
            aria-label="Reading status"
            className="grid grid-cols-3 gap-1 p-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
          >
            {(
              [
                {id: 'unread', label: 'Unread'},
                {id: 'reading', label: 'Reading'},
                {id: 'finished', label: 'Finished'},
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleStatusChange(opt.id)}
                className={`py-1.5 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                  book.status === opt.id
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Synopsis */}
        {book.description && (
          <div className="pt-4 border-t border-[var(--border-subtle)] space-y-1.5">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">Synopsis</span>
            <p className="text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-line line-clamp-6">
              {book.description}
            </p>
          </div>
        )}

        {/* Archival Details */}
        <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2 text-xs">
          <span className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
            Catalog Details
          </span>
          <dl className="space-y-1.5">
            {book.series && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--text-muted)] shrink-0">Series</dt>
                <dd className="text-[var(--text-primary)] text-right truncate">{book.series}</dd>
              </div>
            )}
            {(() => {
              const assignedFolders = getBookFolderIds(book)
                .map((id) => folderPathById.get(id))
                .filter((name): name is string => Boolean(name));
              return (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[var(--text-muted)] shrink-0">
                    {assignedFolders.length > 1 ? 'Folders' : 'Folder'}
                  </dt>
                  <dd
                    className="text-[var(--text-primary)] text-right"
                    title={assignedFolders.join(' · ')}
                  >
                    {assignedFolders.length > 0 ? assignedFolders.join(' · ') : 'Unfiled'}
                  </dd>
                </div>
              );
            })()}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--text-muted)] shrink-0">Category</dt>
              <dd className="text-[var(--text-primary)] text-right truncate">
                {book.categoryId ? categoryById.get(book.categoryId) || '—' : 'Uncategorized'}
              </dd>
            </div>
            {book.publisher && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--text-muted)] shrink-0">Publisher</dt>
                <dd className="text-[var(--text-primary)] text-right truncate">{book.publisher}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--text-muted)] shrink-0">Added</dt>
              <dd className="font-mono-tabular text-[var(--text-secondary)] text-right">
                {formatShortDate(book.addedAt)}
              </dd>
            </div>
            {book.tags.length > 0 && (
              <div className="flex items-baseline justify-between gap-3 pt-1">
                <dt className="text-[var(--text-muted)] shrink-0">Tags</dt>
                <dd className="text-[var(--text-secondary)] text-right">
                  {book.tags.join(' · ')}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Highlights & Bookmarks for this Book */}
        <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              Highlights &amp; Bookmarks
            </span>
            <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
              {highlights.length + bookmarks.length}
            </span>
          </div>

          {highlights.length === 0 && bookmarks.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              No highlights or bookmarks saved for this book yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {highlights.slice(0, 6).map((hl) => {
                const swatch =
                  HIGHLIGHT_COLORS.find((c) => c.id === hl.color)?.swatch ?? '#D99B2B';
                return (
                  <button
                    key={hl.id}
                    type="button"
                    onClick={() => onOpenBook(book, hl.unitIndex)}
                    className="w-full text-left p-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] transition-colors cursor-pointer space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
                      <span className="inline-flex items-center gap-1.5">
                        <Highlighter className="w-3 h-3" style={{color: swatch}} />
                        <span className="font-mono-tabular">
                          {book.format === 'pdf' ? `Page ${hl.unitIndex}` : `Section ${hl.unitIndex + 1}`}
                        </span>
                      </span>
                      <span>{formatShortDate(hl.createdAt)}</span>
                    </div>
                    <p className="font-serif-editorial text-xs text-[var(--text-primary)] line-clamp-3 leading-relaxed">
                      &ldquo;{hl.selectedText}&rdquo;
                    </p>
                    {hl.note && (
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">
                        {hl.note}
                      </p>
                    )}
                  </button>
                );
              })}

              {bookmarks.slice(0, 4).map((bm) => (
                <button
                  key={bm.id}
                  type="button"
                  onClick={() => onOpenBook(book, bm.unitIndex)}
                  className="w-full text-left p-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] transition-colors cursor-pointer flex items-start gap-2"
                >
                  <Bookmark className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {bm.label}
                    </div>
                    <div className="font-mono-tabular text-[10px] text-[var(--text-muted)] mt-0.5">
                      {book.format === 'pdf' ? `Page ${bm.unitIndex}` : `Section ${bm.unitIndex + 1}`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2 shrink-0">
        {confirmDelete ? (
          <div className="flex items-center gap-2 w-full justify-between">
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(false);
                onDeleteBook(book.id);
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--danger)] text-white hover:bg-[var(--danger-hover)] cursor-pointer whitespace-nowrap"
            >
              Confirm Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onEditMetadata(book)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit Metadata</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete book"
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Docked Split Inspector (xl+) — unchanged */}
      <aside
        aria-label="Book inspector panel"
        className="hidden xl:flex flex-col w-[340px] shrink-0 h-full border-l border-[var(--border-subtle)] bg-[var(--bg-sidebar)]"
      >
        {panelBody}
      </aside>

      {/* Tablet Slide-Over Inspector (md to xl) */}
      <div
        className="hidden md:flex xl:hidden fixed inset-0 z-40 justify-end bg-black/40"
        onClick={onClose}
      >
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Book inspector"
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm h-full bg-[var(--bg-elevated)] border-l border-[var(--border-subtle)] shadow-2xl"
        >
          {panelBody}
        </aside>
      </div>

      {/* Mobile Slide-Up Bottom Sheet Inspector (<md) */}
      <div
        className="md:hidden fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      >
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Book details"
          onClick={(e) => e.stopPropagation()}
          className="w-full max-h-[88dvh] rounded-t-2xl border-t border-x border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl flex flex-col overflow-hidden pb-safe animate-folio-sheet-up"
        >
          <div className="pt-2.5 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1 rounded-full bg-[var(--border-strong)]" />
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{panelBody}</div>
        </aside>
      </div>
    </>
  );
};
