import {
  BookOpen,
  CheckSquare,
  FolderInput,
  FolderMinus,
  Info,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react';
import React, {useState} from 'react';
import type {BookRecord} from '../../types/library';
import {BottomSheet} from '../ui/BottomSheet';
import {BookCover} from './BookCover';

interface MobileBookActionSheetProps {
  book: BookRecord | null;
  activeDrilledFolderName?: string | null;
  onClose: () => void;
  onReadBook: (book: BookRecord) => void;
  onInspectBook: (book: BookRecord) => void;
  onOrganizeBook: (book: BookRecord) => void;
  onToggleFavorite: (book: BookRecord) => void;
  onEditMetadata: (book: BookRecord) => void;
  onSelectBook: (book: BookRecord) => void;
  onRemoveFromViewFolder?: (book: BookRecord) => void;
  onDeleteBook: (bookId: string) => void;
}

export const MobileBookActionSheet: React.FC<MobileBookActionSheetProps> = ({
  book,
  activeDrilledFolderName,
  onClose,
  onReadBook,
  onInspectBook,
  onOrganizeBook,
  onToggleFavorite,
  onEditMetadata,
  onSelectBook,
  onRemoveFromViewFolder,
  onDeleteBook,
}) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleClose = () => {
    setConfirmingDelete(false);
    onClose();
  };

  if (!book) return null;

  const progressText =
    book.status === 'finished'
      ? 'Finished'
      : book.progress > 0
        ? `${book.progress}% read`
        : 'Unread';

  return (
    <BottomSheet
      isOpen={Boolean(book)}
      onClose={handleClose}
      ariaLabel={`Actions for ${book.title}`}
      hideHeader
    >
      {/* Book Preview Header */}
      <div className="px-4 pt-1 pb-3.5 border-b border-[var(--border-subtle)] flex items-center gap-3">
        <div className="w-11 shrink-0">
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
          <h2 className="font-serif-editorial text-base font-semibold text-[var(--text-primary)] line-clamp-2 leading-snug">
            {book.title}
          </h2>
          {book.subtitle?.trim() && (
            <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
              {book.subtitle}
            </p>
          )}
          <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{book.author}</p>
          <p className="text-[11px] text-[var(--text-muted)] font-mono-tabular uppercase mt-0.5">
            {book.format} · {progressText}
          </p>
        </div>
      </div>

      {/* Action Rows (48px minimum height for comfortable thumb tapping) */}
      <div className="py-1.5 px-2 space-y-0.5">
        <button
          type="button"
          onClick={() => {
            handleClose();
            onReadBook(book);
          }}
          className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--accent)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <BookOpen className="w-4 h-4 shrink-0" />
          <span>{book.progress > 0 ? 'Continue Reading' : 'Read Book'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            handleClose();
            onInspectBook(book);
          }}
          className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--text-primary)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <Info className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <span>Book Details, Cover &amp; Notes</span>
        </button>

        <button
          type="button"
          onClick={() => {
            handleClose();
            onOrganizeBook(book);
          }}
          className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--text-primary)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <FolderInput className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <span>Move to Folder, Category &amp; Tags</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onToggleFavorite(book);
            handleClose();
          }}
          className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--text-primary)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <Star
            className={`w-4 h-4 shrink-0 ${
              book.isFavorite
                ? 'fill-[var(--accent)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)]'
            }`}
          />
          <span>{book.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            handleClose();
            onEditMetadata(book);
          }}
          className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--text-primary)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <Pencil className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <span>Edit Metadata</span>
        </button>

        <button
          type="button"
          onClick={() => {
            handleClose();
            onSelectBook(book);
          }}
          className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--text-primary)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <CheckSquare className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <span>Select Books</span>
        </button>

        {onRemoveFromViewFolder && activeDrilledFolderName && (
          <button
            type="button"
            onClick={() => {
              onRemoveFromViewFolder(book);
              handleClose();
            }}
            className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--text-primary)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <FolderMinus className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
            <span className="truncate">Remove from &ldquo;{activeDrilledFolderName}&rdquo;</span>
          </button>
        )}

        <div className="my-1 border-t border-[var(--border-subtle)]" />

        {confirmingDelete ? (
          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--danger)] font-medium">
              Delete permanently from device?
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="min-h-[40px] px-3 rounded-md border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteBook(book.id);
                  handleClose();
                }}
                className="min-h-[40px] px-3 rounded-md bg-[var(--danger)] text-white text-xs font-medium cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium text-[var(--danger)] active:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>Delete Book</span>
          </button>
        )}
      </div>
    </BottomSheet>
  );
};
