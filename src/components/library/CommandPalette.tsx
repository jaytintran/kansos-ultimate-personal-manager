import {
  BookOpen,
  CornerDownLeft,
  Folder,
  HardDrive,
  Highlighter,
  Moon,
  PanelRight,
  Plus,
  Search,
  Sun,
  Tag,
  X,
} from 'lucide-react';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {flattenFoldersHierarchy, formatFileSize} from '../../lib/formatters';
import type {
  BookRecord,
  CategoryRecord,
  FolderRecord,
  HighlightRecord,
  ThemeMode,
} from '../../types/library';
import {BookCover} from './BookCover';

interface CommandPaletteProps {
  isOpen: boolean;
  books: BookRecord[];
  folders: FolderRecord[];
  categories: CategoryRecord[];
  highlights: HighlightRecord[];
  theme: ThemeMode;
  inspectorOpen: boolean;
  onClose: () => void;
  onOpenBook: (book: BookRecord, unitIndex?: number) => void;
  onSelectFolder: (folderId: string) => void;
  onSelectCategory: (categoryId: string) => void;
  onOpenHighlightsHub: () => void;
  onImportBooks: () => void;
  onOpenStorageManager: () => void;
  onToggleTheme: () => void;
  onToggleInspector: () => void;
}

interface PaletteItem {
  id: string;
  section: 'Books' | 'Folders & Categories' | 'Highlights' | 'Actions';
  title: string;
  subtitle?: string;
  book?: BookRecord;
  icon?: React.ReactNode;
  onExecute: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  books,
  folders,
  categories,
  highlights,
  theme,
  inspectorOpen,
  onClose,
  onOpenBook,
  onSelectFolder,
  onSelectCategory,
  onOpenHighlightsHub,
  onImportBooks,
  onOpenStorageManager,
  onToggleTheme,
  onToggleInspector,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  const flatFolders = useMemo(() => flattenFoldersHierarchy(folders), [folders]);
  const bookById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const results: PaletteItem[] = [];

    // 1. Books
    const matchedBooks = books
      .filter((b) => {
        if (!q) return true;
        const hay = `${b.title} ${b.subtitle ?? ''} ${b.author} ${b.series} ${b.tags.join(' ')}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (b.lastReadAt ?? b.addedAt) - (a.lastReadAt ?? a.addedAt))
      .slice(0, q ? 12 : 6);

    for (const book of matchedBooks) {
      results.push({
        id: `book-${book.id}`,
        section: 'Books',
        title: book.title,
        subtitle: [
          book.subtitle?.trim(),
          book.author,
          book.format.toUpperCase(),
          `${book.progress}%`,
        ]
          .filter(Boolean)
          .join(' · '),
        book,
        onExecute: () => {
          onOpenBook(book);
          onClose();
        },
      });
    }

    // 2. Folders & Categories
    for (const item of flatFolders) {
      if (!q || item.pathLabel.toLowerCase().includes(q)) {
        results.push({
          id: `folder-${item.folder.id}`,
          section: 'Folders & Categories',
          title: item.pathLabel,
          subtitle: 'Folder',
          icon: <Folder className="w-4 h-4 text-[var(--text-secondary)]" />,
          onExecute: () => {
            onSelectFolder(item.folder.id);
            onClose();
          },
        });
      }
    }

    for (const cat of categories) {
      if (q && cat.name.toLowerCase().includes(q)) {
        results.push({
          id: `cat-${cat.id}`,
          section: 'Folders & Categories',
          title: cat.name,
          subtitle: 'Category',
          icon: <Tag className="w-4 h-4 text-[var(--text-secondary)]" />,
          onExecute: () => {
            onSelectCategory(cat.id);
            onClose();
          },
        });
      }
    }

    // 3. Highlights (when searching)
    if (q.length >= 2) {
      const matchedHighlights = highlights
        .filter((hl) => {
          const book = bookById.get(hl.bookId);
          if (!book) return false;
          return `${hl.selectedText} ${hl.note}`.toLowerCase().includes(q);
        })
        .slice(0, 6);

      for (const hl of matchedHighlights) {
        const book = bookById.get(hl.bookId);
        if (!book) continue;
        results.push({
          id: `hl-${hl.id}`,
          section: 'Highlights',
          title: `"${hl.selectedText.slice(0, 72)}${hl.selectedText.length > 72 ? '…' : ''}"`,
          subtitle: `${book.title} · ${book.format === 'pdf' ? `Page ${hl.unitIndex}` : `Section ${hl.unitIndex + 1}`}`,
          icon: <Highlighter className="w-4 h-4 text-[var(--accent)]" />,
          onExecute: () => {
            onOpenBook(book, hl.unitIndex);
            onClose();
          },
        });
      }
    }

    // 4. Quick Actions
    const actions: PaletteItem[] = [
      {
        id: 'action-import',
        section: 'Actions',
        title: 'Import e-books (EPUB, PDF, MOBI)',
        subtitle: 'Add files to offline archive',
        icon: <Plus className="w-4 h-4 text-[var(--accent)]" />,
        onExecute: () => {
          onClose();
          onImportBooks();
        },
      },
      {
        id: 'action-highlights',
        section: 'Actions',
        title: 'Open Highlights & Notes Hub',
        subtitle: `${highlights.length} saved annotations`,
        icon: <Highlighter className="w-4 h-4 text-[var(--text-secondary)]" />,
        onExecute: () => {
          onOpenHighlightsHub();
          onClose();
        },
      },
      {
        id: 'action-inspector',
        section: 'Actions',
        title: inspectorOpen ? 'Hide Book Inspector' : 'Show Book Inspector',
        subtitle: 'Toggle right-side detail pane',
        icon: <PanelRight className="w-4 h-4 text-[var(--text-secondary)]" />,
        onExecute: () => {
          onToggleInspector();
          onClose();
        },
      },
      {
        id: 'action-storage',
        section: 'Actions',
        title: 'Manage storage & book files',
        subtitle: `${books.length} ${books.length === 1 ? 'book' : 'books'} · ${formatFileSize(
          books.reduce((sum, b) => sum + (b.fileSize || 0), 0)
        )} · Replace files or find duplicates`,
        icon: <HardDrive className="w-4 h-4 text-[var(--text-secondary)]" />,
        onExecute: () => {
          onClose();
          onOpenStorageManager();
        },
      },
      {
        id: 'action-theme',
        section: 'Actions',
        title: `Switch to ${theme === 'sepia' ? 'Dark' : 'Sepia'} theme`,
        subtitle: 'Appearance',
        icon:
          theme === 'sepia' ? (
            <Moon className="w-4 h-4 text-[var(--text-secondary)]" />
          ) : (
            <Sun className="w-4 h-4 text-[var(--text-secondary)]" />
          ),
        onExecute: () => {
          onToggleTheme();
          onClose();
        },
      },
    ];

    for (const action of actions) {
      if (!q || `${action.title} ${action.subtitle ?? ''}`.toLowerCase().includes(q)) {
        results.push(action);
      }
    }

    return results;
  }, [
    query,
    books,
    flatFolders,
    categories,
    highlights,
    bookById,
    theme,
    inspectorOpen,
    onOpenBook,
    onSelectFolder,
    onSelectCategory,
    onOpenHighlightsHub,
    onImportBooks,
    onOpenStorageManager,
    onToggleTheme,
    onToggleInspector,
    onClose,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (items.length > 0 ? (prev + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        items.length > 0 ? (prev - 1 + items.length) % items.length : 0
      );
    } else if (e.key === 'Enter' && items[activeIndex]) {
      e.preventDefault();
      items[activeIndex].onExecute();
    }
  };

  // Group items by section preserving flat index order
  const sections: Array<{label: PaletteItem['section']; entries: Array<{item: PaletteItem; flatIdx: number}>}> = [];
  items.forEach((item, flatIdx) => {
    const existing = sections.find((s) => s.label === item.section);
    if (existing) {
      existing.entries.push({item, flatIdx});
    } else {
      sections.push({label: item.section, entries: [{item, flatIdx}]});
    }
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden flex flex-col max-h-[70vh]"
      >
        {/* Search Bar */}
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-3 shrink-0">
          <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a book, folder, highlight, or action..."
            className="flex-1 min-w-0 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear command query"
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono-tabular text-[var(--text-muted)] border border-[var(--border-subtle)] rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto py-2">
          {items.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-muted)]">
              No matching books, folders, or commands for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <div className="space-y-3">
              {sections.map((sec) => (
                <div key={sec.label}>
                  <div className="px-4 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                    {sec.label}
                  </div>
                  <div>
                    {sec.entries.map(({item, flatIdx}) => {
                      const active = flatIdx === activeIndex;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onMouseEnter={() => setActiveIndex(flatIdx)}
                          onClick={item.onExecute}
                          className={`w-full px-4 py-2 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                            active
                              ? 'bg-[var(--bg-accent-subtle)] text-[var(--text-primary)]'
                              : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                          }`}
                        >
                          {item.book ? (
                            <div className="w-6 shrink-0">
                              <BookCover
                                title={item.book.title}
                                author={item.book.author}
                                format={item.book.format}
                                coverDataUrl={item.book.coverDataUrl}
                                paletteIndex={item.book.coverPaletteIndex}
                                coverStyle={item.book.coverStyle}
                                size="sm"
                              />
                            </div>
                          ) : (
                            <div className="w-6 h-6 flex items-center justify-center shrink-0">
                              {item.icon ?? <BookOpen className="w-4 h-4 text-[var(--text-secondary)]" />}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{item.title}</div>
                            {item.subtitle && (
                              <div className="text-[11px] text-[var(--text-muted)] truncate">
                                {item.subtitle}
                              </div>
                            )}
                          </div>

                          {active && (
                            <CornerDownLeft className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Hint */}
        <div className="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between text-[11px] text-[var(--text-muted)] shrink-0">
          <span>Use ↑ ↓ to navigate · Enter to open</span>
          <span className="font-mono-tabular">
            {books.length} {books.length === 1 ? 'book' : 'books'} indexed
          </span>
        </div>
      </div>
    </div>
  );
};
