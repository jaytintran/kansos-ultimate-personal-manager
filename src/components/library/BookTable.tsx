import {ArrowDown, ArrowUp, BookOpen, Check, Info, Pencil, Star} from 'lucide-react';
import React, {useMemo} from 'react';
import {flattenFoldersHierarchy, formatShortDate, getBookFolderIds} from '../../lib/formatters';
import type {
  BookRecord,
  CategoryRecord,
  FolderRecord,
  SortDirection,
  SortField,
} from '../../types/library';
import {BookCover} from './BookCover';

interface BookTableProps {
  books: BookRecord[];
  categories: CategoryRecord[];
  folders: FolderRecord[];
  selectedIds: Set<string>;
  allSelected: boolean;
  inspectorOpen: boolean;
  inspectedBookId: string | null;
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField) => void;
  onToggleSelect: (bookId: string, shiftKey: boolean) => void;
  onToggleSelectAll: () => void;
  onOpenBook: (book: BookRecord) => void;
  onInspectBook: (book: BookRecord) => void;
  onEditBook: (book: BookRecord) => void;
  onToggleFavorite: (book: BookRecord) => void;
  onContextMenuBook?: (book: BookRecord, e: React.MouseEvent) => void;
}

export const BookTable: React.FC<BookTableProps> = ({
  books,
  categories,
  folders,
  selectedIds,
  allSelected,
  inspectorOpen,
  inspectedBookId,
  sortField,
  sortDirection,
  onSortChange,
  onToggleSelect,
  onToggleSelectAll,
  onOpenBook,
  onInspectBook,
  onEditBook,
  onToggleFavorite,
  onContextMenuBook,
}) => {
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const folderById = useMemo(
    () => new Map(flattenFoldersHierarchy(folders).map((item) => [item.folder.id, item.pathLabel])),
    [folders]
  );

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 inline ml-1 text-[var(--accent)]" />
    ) : (
      <ArrowDown className="w-3 h-3 inline ml-1 text-[var(--accent)]" />
    );
  };

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-muted)] bg-[var(--bg-sidebar)]/55">
            <th className="w-10 px-3 py-2.5">
              <button
                type="button"
                onClick={onToggleSelectAll}
                aria-label={allSelected ? 'Deselect all visible books' : 'Select all visible books'}
                className={`w-4 h-4 rounded flex items-center justify-center border transition-colors cursor-pointer ${
                  allSelected
                    ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'border-[var(--border-strong)] bg-[var(--bg-input)] text-transparent hover:border-[var(--accent)]'
                }`}
              >
                <Check className="w-3 h-3 stroke-[2.5]" />
              </button>
            </th>
            <th className="px-3 py-2.5">
              <button
                type="button"
                onClick={() => onSortChange('title')}
                className="hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                Title {renderSortIcon('title')}
              </button>
            </th>
            <th className="px-3 py-2.5">
              <button
                type="button"
                onClick={() => onSortChange('author')}
                className="hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                Author {renderSortIcon('author')}
              </button>
            </th>
            <th className="px-3 py-2.5 w-20">
              <button
                type="button"
                onClick={() => onSortChange('format')}
                className="hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                Format {renderSortIcon('format')}
              </button>
            </th>
            <th className="px-3 py-2.5 hidden md:table-cell">Category</th>
            <th className="px-3 py-2.5 hidden lg:table-cell">Folder</th>
            <th className="px-3 py-2.5 hidden xl:table-cell">Tags</th>
            <th className="px-3 py-2.5 text-right w-28">
              <button
                type="button"
                onClick={() => onSortChange('progress')}
                className="hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                Progress {renderSortIcon('progress')}
              </button>
            </th>
            <th className="px-3 py-2.5 text-right hidden sm:table-cell w-28">
              <button
                type="button"
                onClick={() => onSortChange('addedAt')}
                className="hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                Added {renderSortIcon('addedAt')}
              </button>
            </th>
            <th className="px-3 py-2.5 text-right w-28">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
          {books.map((book) => {
            const isSelected = selectedIds.has(book.id);
            const isInspected = inspectorOpen && inspectedBookId === book.id;
            const category = book.categoryId ? categoryById.get(book.categoryId) || '—' : '—';
            const folderNames = getBookFolderIds(book)
              .map((id) => folderById.get(id))
              .filter((name): name is string => Boolean(name));
            const folder = folderNames.length > 0 ? folderNames.join(' · ') : '—';

            return (
              <tr
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
                onClick={() => {
                  if (inspectorOpen) onInspectBook(book);
                }}
                onDoubleClick={() => onOpenBook(book)}
                className={`h-[46px] transition-colors ${
                  isSelected || isInspected
                    ? 'bg-[var(--bg-accent-subtle)]'
                    : 'hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    aria-label={isSelected ? `Deselect ${book.title}` : `Select ${book.title}`}
                    onClick={(e) => onToggleSelect(book.id, e.shiftKey)}
                    className={`w-4 h-4 rounded flex items-center justify-center border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'border-[var(--border-strong)] bg-[var(--bg-input)] text-transparent hover:border-[var(--accent)]'
                    }`}
                  >
                    <Check className="w-3 h-3 stroke-[2.5]" />
                  </button>
                </td>

                <td className="px-3 py-2 max-w-[280px]">
                  <div className="flex items-center gap-3 min-w-0">
                    <BookCover
                      title={book.title}
                      author={book.author}
                      format={book.format}
                      coverDataUrl={book.coverDataUrl}
                      paletteIndex={book.coverPaletteIndex}
                      coverStyle={book.coverStyle}
                      size="sm"
                      className="w-6 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (inspectorOpen) onInspectBook(book);
                          else onOpenBook(book);
                        }}
                        className="block w-full font-serif-editorial text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent)] truncate text-left cursor-pointer"
                      >
                        {book.title}
                      </button>
                      {book.subtitle?.trim() && (
                        <p
                          className="text-[11px] text-[var(--text-secondary)] truncate leading-snug"
                          title={book.subtitle}
                        >
                          {book.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                </td>

                <td className="px-3 py-2 text-[var(--text-secondary)] max-w-[180px] truncate">
                  {book.author}
                </td>

                <td className="px-3 py-2 font-mono-tabular uppercase text-[11px] text-[var(--text-secondary)]">
                  {book.format}
                </td>

                <td className="px-3 py-2 hidden md:table-cell text-[var(--text-secondary)] max-w-[140px] truncate">
                  {category}
                </td>

                <td
                  className="px-3 py-2 hidden lg:table-cell text-[var(--text-secondary)] max-w-[160px] truncate"
                  title={folder}
                >
                  {folder}
                </td>

                <td
                  className="px-3 py-2 hidden xl:table-cell text-[var(--text-muted)] max-w-[180px] truncate"
                  title={book.tags.join(', ')}
                >
                  {book.tags.length > 0 ? book.tags.join(' · ') : '—'}
                </td>

                <td className="px-3 py-2 text-right font-mono-tabular text-[var(--text-primary)]">
                  <div className="inline-flex items-center gap-2 justify-end">
                    <div className="w-12 h-1 rounded-full bg-[var(--border-subtle)] overflow-hidden hidden sm:block">
                      <div
                        className="h-full bg-[var(--accent)]"
                        style={{width: `${book.progress}%`}}
                      />
                    </div>
                    <span className="w-8 text-right">{book.progress}%</span>
                  </div>
                </td>

                <td className="px-3 py-2 text-right hidden sm:table-cell font-mono-tabular text-[var(--text-muted)] whitespace-nowrap">
                  {formatShortDate(book.addedAt)}
                </td>

                <td
                  className="px-3 py-2 text-right whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(book)}
                      title={book.isFavorite ? 'Unfavorite' : 'Favorite'}
                      aria-label={`Toggle favorite for ${book.title}`}
                      className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-canvas)] cursor-pointer"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          book.isFavorite ? 'fill-[var(--accent)] text-[var(--accent)]' : ''
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => onInspectBook(book)}
                      title="Inspect book details"
                      aria-label={`Inspect ${book.title}`}
                      className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] cursor-pointer"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditBook(book)}
                      title="Edit metadata"
                      aria-label={`Edit metadata for ${book.title}`}
                      className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenBook(book)}
                      title="Open in reader"
                      aria-label={`Read ${book.title}`}
                      className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-canvas)] cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
