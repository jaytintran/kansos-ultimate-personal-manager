import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  FolderPlus,
  GalleryHorizontalEnd,
  LayoutGrid,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import React, {useEffect, useRef, useState} from 'react';
import {COVER_PALETTES} from '../../lib/formatters';
import type {
  BookRecord,
  CoverSize,
  ViewFolderCardLayout,
  ViewFolderDisplayMode,
  ViewFolderRecord,
} from '../../types/library';
import {BookCover} from './BookCover';

interface ViewFoldersSectionProps {
  viewLabel: string;
  viewFolders: ViewFolderRecord[];
  viewBooks: BookRecord[];
  displayMode: ViewFolderDisplayMode;
  cardLayout: ViewFolderCardLayout;
  hideFiledBooks: boolean;
  filedBooksCount: number;
  coverSize: CoverSize;
  inspectorOpen: boolean;
  inspectedBookId: string | null;
  onDisplayModeChange: (mode: ViewFolderDisplayMode) => void;
  onCardLayoutChange: (layout: ViewFolderCardLayout) => void;
  onToggleHideFiled: () => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onOpenFolder: (folderId: string) => void;
  onRequestAddBooks: (folder: ViewFolderRecord) => void;
  onDropBooksToViewFolder: (bookIds: string[], folderId: string) => void;
  onRemoveBookFromViewFolder: (bookId: string, folderId: string) => void;
  onOpenBook: (book: BookRecord) => void;
  onInspectBook: (book: BookRecord) => void;
}

const CARD_GRID_BY_SIZE: Record<CoverSize, string> = {
  compact:
    'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-x-4 gap-y-7',
  standard:
    'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-x-6 gap-y-9',
  large:
    'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-7 gap-y-10',
};

const CAROUSEL_BOOK_WIDTH_BY_SIZE: Record<CoverSize, string> = {
  compact: 'w-[104px] sm:w-[112px]',
  standard: 'w-[126px] sm:w-[138px]',
  large: 'w-[154px] sm:w-[168px]',
};

const CARD_LAYOUT_OPTIONS: Array<{id: ViewFolderCardLayout; label: string; title: string}> = [
  {id: 'stacked', label: 'Stacked', title: 'Fanned stacked cover preview'},
  {id: 'auto', label: 'Auto', title: 'Auto grid density based on book count'},
  {id: '2x2', label: '2×2', title: '2×2 cover grid inside folder card'},
  {id: '3x3', label: '3×3', title: '3×3 cover grid inside folder card'},
  {id: '4x4', label: '4×4', title: '4×4 cover grid inside folder card'},
];

function resolveGridColumns(layout: ViewFolderCardLayout, count: number): 1 | 2 | 3 | 4 {
  if (layout === '2x2') return 2;
  if (layout === '3x3') return 3;
  if (layout === '4x4') return 4;
  // Auto adapts cleanly to folder size
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

const FolderMiniCover: React.FC<{book: BookRecord; cols: 1 | 2 | 3 | 4}> = ({book, cols}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const palette = COVER_PALETTES[Math.abs(book.coverPaletteIndex) % COVER_PALETTES.length];
  const showImage = Boolean(book.coverDataUrl && !imgFailed);

  if (showImage && book.coverDataUrl) {
    return (
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] shadow-2xs">
        <img
          src={book.coverDataUrl}
          alt={book.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover pointer-events-none select-none"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-gradient-to-r from-black/22 via-white/8 to-transparent"
        />
      </div>
    );
  }

  return (
    <div
      className="relative aspect-[3/4] w-full overflow-hidden rounded-[3px] border border-[var(--border-subtle)] flex flex-col select-none shadow-2xs"
      style={{backgroundColor: palette.bg, color: palette.ink}}
      title={book.title}
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[10%]"
        style={{backgroundColor: palette.spine}}
      />
      <div
        className={`relative z-10 flex flex-col justify-between h-full pl-[18%] pr-[10%] ${
          cols === 1 ? 'py-3' : cols === 2 ? 'py-1.5' : 'py-1'
        }`}
      >
        {cols <= 2 ? (
          <>
            <p
              className={`font-serif-editorial font-semibold leading-tight overflow-hidden ${
                cols === 1 ? 'text-xs line-clamp-4' : 'text-[8px] line-clamp-3'
              }`}
            >
              {book.title}
            </p>
            <div
              className="mt-auto h-[1.5px] w-2/3 opacity-75"
              style={{backgroundColor: palette.accent}}
            />
          </>
        ) : (
          <>
            <div
              className="h-[2px] w-3/4 rounded-xs opacity-85 mt-0.5"
              style={{backgroundColor: palette.accent}}
            />
            <div
              className="mt-auto h-[1.5px] w-1/2 rounded-xs opacity-45"
              style={{backgroundColor: palette.ink}}
            />
          </>
        )}
      </div>
    </div>
  );
};

function hasBookDragPayload(dt: DataTransfer): boolean {
  return (
    dt.types.includes('application/x-folio-book-ids') ||
    dt.types.includes('application/x-folio-book-id')
  );
}

function getDraggedBookIds(dt: DataTransfer): string[] {
  const multi = dt.getData('application/x-folio-book-ids');
  if (multi) {
    try {
      const parsed = JSON.parse(multi);
      if (Array.isArray(parsed)) {
        const ids = parsed.filter((id): id is string => typeof id === 'string');
        if (ids.length > 0) return ids;
      }
    } catch {
      // ignore
    }
  }
  const single = dt.getData('application/x-folio-book-id');
  return single ? [single] : [];
}

interface CarouselRowProps {
  folder: ViewFolderRecord;
  booksInFolder: BookRecord[];
  coverSize: CoverSize;
  inspectorOpen: boolean;
  inspectedBookId: string | null;
  isEditing: boolean;
  editingName: string;
  isDragOver: boolean;
  onEditingNameChange: (val: string) => void;
  onStartRename: () => void;
  onCommitRename: (e: React.FormEvent) => void;
  onCancelRename: () => void;
  onOpenFolder: () => void;
  onAddBooks: () => void;
  onDelete: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onOpenBook: (book: BookRecord) => void;
  onInspectBook: (book: BookRecord) => void;
  onRemoveBook: (bookId: string) => void;
}

const FolderCarouselRow: React.FC<CarouselRowProps> = ({
  folder,
  booksInFolder,
  coverSize,
  inspectorOpen,
  inspectedBookId,
  isEditing,
  editingName,
  isDragOver,
  onEditingNameChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onOpenFolder,
  onAddBooks,
  onDelete,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpenBook,
  onInspectBook,
  onRemoveBook,
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollByAmount = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const delta = Math.max(260, Math.round(el.clientWidth * 0.72));
    el.scrollBy({left: direction * delta, behavior: 'smooth'});
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`w-full rounded-lg border transition-colors ${
        isDragOver
          ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
      }`}
    >
      {/* Carousel Shelf Header */}
      <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Folder className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
          {isEditing ? (
            <form onSubmit={onCommitRename} className="flex items-center gap-1.5 flex-1 max-w-xs">
              <input
                type="text"
                autoFocus
                value={editingName}
                onChange={(e) => onEditingNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onCancelRename();
                }}
                className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-[var(--accent)] bg-[var(--bg-input)] text-[var(--text-primary)]"
              />
              <button
                type="submit"
                className="px-2 py-1 text-[11px] font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] cursor-pointer shrink-0"
              >
                Save
              </button>
              <button
                type="button"
                onClick={onCancelRename}
                className="px-1.5 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={onOpenFolder}
              className="flex items-baseline gap-2 min-w-0 text-left group cursor-pointer"
            >
              <span className="font-serif-editorial text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] truncate transition-colors">
                {folder.name}
              </span>
              <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] shrink-0">
                {booksInFolder.length} {booksInFolder.length === 1 ? 'book' : 'books'}
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onAddBooks}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3 h-3" />
            <span className="hidden sm:inline">Add Books</span>
          </button>

          <button
            type="button"
            onClick={onStartRename}
            title="Rename folder"
            aria-label={`Rename ${folder.name}`}
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onDelete}
            title="Delete folder"
            aria-label={`Delete ${folder.name}`}
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--danger)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {booksInFolder.length > 0 && (
            <>
              <div className="h-3.5 w-px bg-[var(--border-subtle)] mx-0.5 hidden sm:block" />
              <button
                type="button"
                onClick={() => scrollByAmount(-1)}
                aria-label={`Scroll ${folder.name} left`}
                className="hidden sm:inline-flex p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => scrollByAmount(1)}
                aria-label={`Scroll ${folder.name} right`}
                className="hidden sm:inline-flex p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Full-Width Horizontal Book Strip */}
      {booksInFolder.length === 0 ? (
        <div className="px-4 py-6 flex items-center justify-between gap-4 text-xs text-[var(--text-muted)]">
          <span>Drag books onto this shelf or click Add Books to group them here.</span>
          <button
            type="button"
            onClick={onAddBooks}
            className="text-[var(--accent)] hover:underline font-medium cursor-pointer whitespace-nowrap shrink-0"
          >
            + Add Books
          </button>
        </div>
      ) : (
        <div
          ref={scrollerRef}
          data-folio-carousel="true"
          className="flex items-start gap-4 overflow-x-auto px-4 py-4 scroll-smooth"
        >
          {booksInFolder.map((book) => {
            const isInspected = inspectorOpen && inspectedBookId === book.id;
            return (
              <div
                key={book.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-folio-book-id', book.id);
                  e.dataTransfer.setData('application/x-folio-book-ids', JSON.stringify([book.id]));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                className={`group shrink-0 flex flex-col ${CAROUSEL_BOOK_WIDTH_BY_SIZE[coverSize]}`}
              >
                <div
                  onClick={() => (inspectorOpen ? onInspectBook(book) : onOpenBook(book))}
                  onDoubleClick={() => onOpenBook(book)}
                  className={`relative cursor-pointer rounded-[5px] transition-transform duration-150 group-hover:-translate-y-0.5 ${
                    isInspected
                      ? 'ring-2 ring-[var(--text-primary)]/45 ring-offset-2 ring-offset-[var(--bg-surface)]'
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

                  {book.progress > 0 && (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30 overflow-hidden rounded-b-[4px]">
                      <div
                        className="h-full bg-[var(--accent)]"
                        style={{width: `${Math.min(100, Math.max(2, book.progress))}%`}}
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    title={`Remove from "${folder.name}"`}
                    aria-label={`Remove ${book.title} from ${folder.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveBook(book.id);
                    }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded flex items-center justify-center bg-[var(--bg-elevated)]/95 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--danger)] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => (inspectorOpen ? onInspectBook(book) : onOpenBook(book))}
                  onDoubleClick={() => onOpenBook(book)}
                  className="mt-2 text-left font-serif-editorial text-xs font-semibold leading-snug text-[var(--text-primary)] hover:text-[var(--accent)] line-clamp-2 cursor-pointer"
                  title={book.title}
                >
                  {book.title}
                </button>
                {book.subtitle?.trim() && (
                  <p
                    className="mt-0.5 text-[11px] text-[var(--text-secondary)] truncate"
                    title={book.subtitle}
                  >
                    {book.subtitle}
                  </p>
                )}
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate">
                  {book.author}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface FolderGridCardProps {
  folder: ViewFolderRecord;
  booksInFolder: BookRecord[];
  cardLayout: ViewFolderCardLayout;
  coverSize: CoverSize;
  isDragOver: boolean;
  isEditing: boolean;
  editingName: string;
  onEditingNameChange: (val: string) => void;
  onStartRename: () => void;
  onCommitRename: (e: React.FormEvent) => void;
  onBlurRename: () => void;
  onCancelRename: () => void;
  onOpenFolder: () => void;
  onRequestAddBooks: () => void;
  onDeleteFolder: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

const FOLDER_SCROLL_DWELL_MS = 500;

const FolderGridCard: React.FC<FolderGridCardProps> = ({
  folder,
  booksInFolder,
  cardLayout,
  coverSize,
  isDragOver,
  isEditing,
  editingName,
  onEditingNameChange,
  onStartRename,
  onCommitRename,
  onBlurRename,
  onCancelRename,
  onOpenFolder,
  onRequestAddBooks,
  onDeleteFolder,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  const [dwellPhase, setDwellPhase] = useState<'locked' | 'arming' | 'unlocked'>('locked');
  const [pulseKey, setPulseKey] = useState(0);

  const isHoveringRef = useRef(false);
  const dwellTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const lastGridScrollAtRef = useRef<number>(0);

  const previewBooks = booksInFolder.slice(0, 3);
  const cols = resolveGridColumns(cardLayout, booksInFolder.length);
  const hasOverflow = cardLayout !== 'stacked' && booksInFolder.length > cols * cols;

  const clearTimers = () => {
    if (dwellTimerRef.current !== null) {
      window.clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  };

  const startArming = () => {
    clearTimers();
    if (!hasOverflow) {
      setDwellPhase('locked');
      return;
    }
    // Never arm inner hover-scroll on touch/coarse pointer devices
    if (
      typeof window !== 'undefined' &&
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches
    ) {
      return;
    }
    setPulseKey((k) => k + 1);
    setDwellPhase('arming');
    dwellTimerRef.current = window.setTimeout(() => {
      dwellTimerRef.current = null;
      if (isHoveringRef.current) {
        setDwellPhase('unlocked');
      }
    }, FOLDER_SCROLL_DWELL_MS);
  };

  // Reset to locked if layout changes or overflow disappears; clean up timers on unmount
  useEffect(() => {
    if (!hasOverflow) {
      clearTimers();
      setDwellPhase('locked');
    }
    return () => clearTimers();
  }, [hasOverflow, cardLayout]);

  // If the user scrolls the main canvas while hovering a locked/arming card, reset the 0.5s dwell timer
  useEffect(() => {
    if (!hasOverflow || dwellPhase === 'unlocked') return;

    const handleCanvasScrollInterrupt = () => {
      if (!isHoveringRef.current) return;
      clearTimers();
      setDwellPhase('locked');
      // Once scrolling settles, if the pointer is still resting inside the card, start a fresh 0.5s dwell
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        if (isHoveringRef.current) {
          startArming();
        }
      }, 170);
    };

    window.addEventListener('wheel', handleCanvasScrollInterrupt, {passive: true});
    window.addEventListener('scroll', handleCanvasScrollInterrupt, {passive: true, capture: true});
    return () => {
      window.removeEventListener('wheel', handleCanvasScrollInterrupt);
      window.removeEventListener('scroll', handleCanvasScrollInterrupt, {capture: true});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOverflow, dwellPhase]);

  const gridColsClass =
    cols === 1
      ? 'grid-cols-1 gap-2 p-4 pt-5'
      : cols === 2
        ? 'grid-cols-2 gap-2 p-2.5 pt-3.5'
        : cols === 3
          ? 'grid-cols-3 gap-1.5 p-2 pt-3'
          : 'grid-cols-4 gap-1 p-1.5 pt-2.5';

  return (
    <article
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="group flex flex-col min-w-0"
    >
      {/* 3:4 Archival Folder Card with Stacked or Hover-Dwell Scrollable Mini Cover Grid */}
      <div
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return;
          isHoveringRef.current = true;
          if (hasOverflow && dwellPhase === 'locked') {
            startArming();
          }
        }}
        onPointerLeave={() => {
          isHoveringRef.current = false;
          clearTimers();
          setDwellPhase('locked');
        }}
        onClick={() => {
          if (isEditing) return;
          if (Date.now() - lastGridScrollAtRef.current < 240) return;
          onOpenFolder();
        }}
        className={`relative aspect-[3/4] rounded-[5px] border transition-all duration-150 cursor-pointer flex items-center justify-center overflow-hidden group-hover:-translate-y-0.5 ${
          isDragOver
            ? 'border-[var(--accent)] ring-2 ring-[var(--accent)] bg-[var(--bg-accent-subtle)]'
            : dwellPhase === 'unlocked'
              ? 'border-[var(--accent)]/60 bg-[var(--bg-surface)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] group-hover:border-[var(--border-strong)]'
        }`}
      >
        {/* Subtle archival folder tab accent across top */}
        <div
          aria-hidden="true"
          className="absolute top-0 left-0 right-0 h-1.5 bg-[var(--bg-sidebar)] border-b border-[var(--border-subtle)] z-20"
        />

        {booksInFolder.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 text-center">
            <Folder className="w-7 h-7 text-[var(--text-muted)] opacity-60" />
            <span className="text-[11px] text-[var(--text-muted)]">Drop books here</span>
          </div>
        ) : cardLayout === 'stacked' ? (
          <div className="relative w-[78%] h-[72%] mt-2 flex items-center justify-center">
            {previewBooks.map((book, idx) => {
              const total = previewBooks.length;
              const offsetMap: Record<
                number,
                Array<{rotate: string; translate: string; z: string; scale: string}>
              > = {
                1: [{rotate: '0deg', translate: '0px, 0px', z: 'z-20', scale: '0.94'}],
                2: [
                  {rotate: '-7deg', translate: '-14%, 4%', z: 'z-10', scale: '0.86'},
                  {rotate: '5deg', translate: '12%, -2%', z: 'z-20', scale: '0.9'},
                ],
                3: [
                  {rotate: '-10deg', translate: '-22%, 7%', z: 'z-10', scale: '0.82'},
                  {rotate: '9deg', translate: '22%, 5%', z: 'z-20', scale: '0.82'},
                  {rotate: '0deg', translate: '0px, -3%', z: 'z-30', scale: '0.88'},
                ],
              };
              const layout = offsetMap[total]?.[idx] ?? offsetMap[1][0];
              return (
                <div
                  key={book.id}
                  className={`absolute w-[64%] shadow-md rounded-[4px] transition-transform duration-200 ${layout.z}`}
                  style={{
                    transform: `translate(${layout.translate}) rotate(${layout.rotate}) scale(${layout.scale})`,
                  }}
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
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {/* Inner Mini-Cover Grid: locked (overflow-y-hidden) until 0.5s dwell unlocks, preserving scrollTop */}
            <div
              onScroll={() => {
                if (dwellPhase === 'unlocked') {
                  lastGridScrollAtRef.current = Date.now();
                }
              }}
              className={`w-full h-full no-scrollbar ${
                dwellPhase === 'unlocked'
                  ? 'overflow-y-auto overscroll-contain'
                  : 'overflow-y-hidden'
              }`}
            >
              <div className={`grid content-start ${gridColsClass}`}>
                {booksInFolder.map((book) => (
                  <FolderMiniCover key={book.id} book={book} cols={cols} />
                ))}
              </div>
            </div>

            {hasOverflow && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-[var(--bg-surface)] via-[var(--bg-surface)]/70 to-transparent z-10"
              />
            )}

            {/* Center-Expanding Faded Radial Circular Wave during 0.5s Hover Dwell */}
            {dwellPhase === 'arming' && (
              <div
                key={pulseKey}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-hidden"
              >
                <div className="w-[165%] aspect-square rounded-full folio-folder-radial-wave" />
              </div>
            )}
          </>
        )}

        {/* Quick Hover Actions (top-right) */}
        <div className="absolute top-3 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-40">
          <button
            type="button"
            title="Add books to folder"
            aria-label={`Add books to ${folder.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onRequestAddBooks();
            }}
            className="w-6 h-6 rounded flex items-center justify-center bg-[var(--bg-elevated)]/95 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Rename folder"
            aria-label={`Rename ${folder.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
            className="w-6 h-6 rounded flex items-center justify-center bg-[var(--bg-elevated)]/95 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            type="button"
            title="Delete folder"
            aria-label={`Delete ${folder.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFolder();
            }}
            className="w-6 h-6 rounded flex items-center justify-center bg-[var(--bg-elevated)]/95 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--danger)] cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Folder Title & Book Count */}
      <div className="mt-2.5 min-w-0">
        {isEditing ? (
          <form onSubmit={onCommitRename} className="flex items-center gap-1">
            <input
              type="text"
              autoFocus
              value={editingName}
              onChange={(e) => onEditingNameChange(e.target.value)}
              onBlur={onBlurRename}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onCancelRename();
              }}
              className="w-full px-1.5 py-0.5 text-xs rounded border border-[var(--accent)] bg-[var(--bg-input)] text-[var(--text-primary)]"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={onOpenFolder}
            className={`text-left w-full font-serif-editorial font-semibold leading-snug text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors line-clamp-2 cursor-pointer ${
              coverSize === 'compact' ? 'text-[13px]' : 'text-[15px]'
            }`}
          >
            {folder.name}
          </button>
        )}

        <p className="mt-0.5 font-mono-tabular text-[11px] text-[var(--text-muted)]">
          {booksInFolder.length} {booksInFolder.length === 1 ? 'book' : 'books'}
        </p>
      </div>
    </article>
  );
};

export const ViewFoldersSection: React.FC<ViewFoldersSectionProps> = ({
  viewLabel,
  viewFolders,
  viewBooks,
  displayMode,
  cardLayout,
  hideFiledBooks,
  filedBooksCount,
  coverSize,
  inspectorOpen,
  inspectedBookId,
  onDisplayModeChange,
  onCardLayoutChange,
  onToggleHideFiled,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onOpenFolder,
  onRequestAddBooks,
  onDropBooksToViewFolder,
  onRemoveBookFromViewFolder,
  onOpenBook,
  onInspectBook,
}) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  const bookById = new Map(viewBooks.map((b) => [b.id, b]));

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreateFolder(trimmed);
    setNewName('');
    setCreating(false);
  };

  const handleRenameSubmit = (folderId: string) => (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = editingName.trim();
    if (trimmed) {
      onRenameFolder(folderId, trimmed);
    }
    setEditingFolderId(null);
    setEditingName('');
  };

  return (
    <section aria-label={`Folders in ${viewLabel}`} className="mb-8 space-y-4">
      {/* Section Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <h2 className="font-serif-editorial text-sm font-semibold text-[var(--text-primary)]">
            Folders in {viewLabel}
          </h2>
          {viewFolders.length > 0 && (
            <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
              {viewFolders.length}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Show / Hide Filed Books Toggle */}
          {viewFolders.length > 0 && filedBooksCount > 0 && (
            <button
              type="button"
              onClick={onToggleHideFiled}
              title={
                hideFiledBooks
                  ? 'Show filed books in the ungrouped list below'
                  : 'Hide filed books from the ungrouped list below'
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                hideFiledBooks
                  ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {hideFiledBooks ? (
                <>
                  <EyeOff className="w-3 h-3" />
                  <span>Filed hidden ({filedBooksCount})</span>
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3" />
                  <span>Showing filed</span>
                </>
              )}
            </button>
          )}

          {/* Card | Carousel Switcher (per-view) */}
          {viewFolders.length > 0 && (
            <div
              role="group"
              aria-label="Folder display style"
              className="inline-flex items-center p-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-sidebar)]"
            >
              <button
                type="button"
                onClick={() => onDisplayModeChange('card')}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  displayMode === 'card'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
                <span>Card</span>
              </button>
              <button
                type="button"
                onClick={() => onDisplayModeChange('carousel')}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  displayMode === 'carousel'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <GalleryHorizontalEnd className="w-3 h-3" />
                <span>Carousel</span>
              </button>
            </div>
          )}

          {/* Folder Card Layout Selector (per-view, visible in Card mode) */}
          {viewFolders.length > 0 && displayMode === 'card' && (
            <div
              role="group"
              aria-label="Folder card cover layout"
              className="inline-flex items-center p-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-sidebar)]"
            >
              {CARD_LAYOUT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.title}
                  onClick={() => onCardLayoutChange(opt.id)}
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    cardLayout === opt.id
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* New Folder Button */}
          {!creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer whitespace-nowrap"
            >
              <FolderPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>New Folder</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Folder Creation Bar */}
      {creating && (
        <form
          onSubmit={handleCreateSubmit}
          className="flex items-center gap-2 max-w-md rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] p-2"
        >
          <FolderPlus className="w-4 h-4 text-[var(--accent)] shrink-0 ml-1" />
          <input
            type="text"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setCreating(false);
                setNewName('');
              }
            }}
            placeholder={`Create folder in ${viewLabel}...`}
            className="flex-1 min-w-0 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <button
            type="submit"
            className="px-2.5 py-1 text-xs font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] cursor-pointer shrink-0"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName('');
            }}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
            aria-label="Cancel folder creation"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}

      {/* Folder Cards Grid OR Full-Width Carousels */}
      {viewFolders.length > 0 &&
        (displayMode === 'card' ? (
          <div className={`grid ${CARD_GRID_BY_SIZE[coverSize]}`}>
            {viewFolders.map((folder) => {
              const booksInFolder = folder.bookIds
                .map((id) => bookById.get(id))
                .filter((b): b is BookRecord => Boolean(b));

              return (
                <FolderGridCard
                  key={folder.id}
                  folder={folder}
                  booksInFolder={booksInFolder}
                  cardLayout={cardLayout}
                  coverSize={coverSize}
                  isDragOver={dragOverFolderId === folder.id}
                  isEditing={editingFolderId === folder.id}
                  editingName={editingName}
                  onEditingNameChange={setEditingName}
                  onStartRename={() => {
                    setEditingFolderId(folder.id);
                    setEditingName(folder.name);
                  }}
                  onCommitRename={handleRenameSubmit(folder.id)}
                  onBlurRename={() => {
                    if (editingName.trim()) {
                      onRenameFolder(folder.id, editingName.trim());
                    }
                    setEditingFolderId(null);
                  }}
                  onCancelRename={() => setEditingFolderId(null)}
                  onOpenFolder={() => onOpenFolder(folder.id)}
                  onRequestAddBooks={() => onRequestAddBooks(folder)}
                  onDeleteFolder={() => onDeleteFolder(folder.id)}
                  onDragOver={(e) => {
                    if (hasBookDragPayload(e.dataTransfer)) {
                      e.preventDefault();
                      setDragOverFolderId(folder.id);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                  }}
                  onDrop={(e) => {
                    const ids = getDraggedBookIds(e.dataTransfer);
                    if (ids.length > 0) {
                      e.preventDefault();
                      onDropBooksToViewFolder(ids, folder.id);
                    }
                    setDragOverFolderId(null);
                  }}
                />
              );
            })}
          </div>
        ) : (
          /* Carousel Mode: Each folder takes the FULL WIDTH of the canvas */
          <div className="space-y-4">
            {viewFolders.map((folder) => {
              const booksInFolder = folder.bookIds
                .map((id) => bookById.get(id))
                .filter((b): b is BookRecord => Boolean(b));

              return (
                <FolderCarouselRow
                  key={folder.id}
                  folder={folder}
                  booksInFolder={booksInFolder}
                  coverSize={coverSize}
                  inspectorOpen={inspectorOpen}
                  inspectedBookId={inspectedBookId}
                  isEditing={editingFolderId === folder.id}
                  editingName={editingName}
                  isDragOver={dragOverFolderId === folder.id}
                  onEditingNameChange={setEditingName}
                  onStartRename={() => {
                    setEditingFolderId(folder.id);
                    setEditingName(folder.name);
                  }}
                  onCommitRename={handleRenameSubmit(folder.id)}
                  onCancelRename={() => setEditingFolderId(null)}
                  onOpenFolder={() => onOpenFolder(folder.id)}
                  onAddBooks={() => onRequestAddBooks(folder)}
                  onDelete={() => onDeleteFolder(folder.id)}
                  onDragOver={(e) => {
                    if (hasBookDragPayload(e.dataTransfer)) {
                      e.preventDefault();
                      setDragOverFolderId(folder.id);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                  }}
                  onDrop={(e) => {
                    const ids = getDraggedBookIds(e.dataTransfer);
                    if (ids.length > 0) {
                      e.preventDefault();
                      onDropBooksToViewFolder(ids, folder.id);
                    }
                    setDragOverFolderId(null);
                  }}
                  onOpenBook={onOpenBook}
                  onInspectBook={onInspectBook}
                  onRemoveBook={(bookId) => onRemoveBookFromViewFolder(bookId, folder.id)}
                />
              );
            })}
          </div>
        ))}
    </section>
  );
};
