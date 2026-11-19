import {BookOpen, FolderTree, Highlighter, Library, Plus} from 'lucide-react';
import React from 'react';
import type {ActiveLibraryFilter} from './LibrarySidebar';

interface MobileBottomNavProps {
  activeFilter: ActiveLibraryFilter;
  selectedTagsCount: number;
  isDrawerOpen: boolean;
  isSelectionActive: boolean;
  isImporting: boolean;
  onSelectLibrary: () => void;
  onSelectReading: () => void;
  onSelectHighlights: () => void;
  onOpenBrowseDrawer: () => void;
  onImportBooks: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeFilter,
  selectedTagsCount,
  isDrawerOpen,
  isSelectionActive,
  isImporting,
  onSelectLibrary,
  onSelectReading,
  onSelectHighlights,
  onOpenBrowseDrawer,
  onImportBooks,
}) => {
  // Yield the thumb zone cleanly to the mobile multi-select action bar when selecting books
  if (isSelectionActive) return null;

  const isAllBooks =
    !isDrawerOpen &&
    activeFilter.kind === 'smart' &&
    activeFilter.id === 'all' &&
    selectedTagsCount === 0;
  const isReading =
    !isDrawerOpen && activeFilter.kind === 'smart' && activeFilter.id === 'reading';
  const isHighlights =
    !isDrawerOpen && activeFilter.kind === 'smart' && activeFilter.id === 'highlights';
  const isBrowse =
    isDrawerOpen ||
    activeFilter.kind === 'folder' ||
    activeFilter.kind === 'category' ||
    selectedTagsCount > 0 ||
    (activeFilter.kind === 'smart' &&
      (activeFilter.id === 'unread' ||
        activeFilter.id === 'finished' ||
        activeFilter.id === 'favorites'));

  const itemClass = (active: boolean) =>
    `min-h-[48px] flex flex-col items-center justify-center gap-0.5 px-1 transition-colors cursor-pointer select-none ${
      active
        ? 'text-[var(--accent)] font-semibold'
        : 'text-[var(--text-secondary)] active:text-[var(--text-primary)]'
    }`;

  return (
    <nav
      aria-label="Mobile navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-md pb-safe"
    >
      <div className="grid grid-cols-5 h-14 items-center px-1">
        <button
          type="button"
          onClick={onSelectLibrary}
          aria-current={isAllBooks ? 'page' : undefined}
          className={itemClass(isAllBooks)}
        >
          <Library className="w-[19px] h-[19px]" />
          <span className="text-[10px] leading-none tracking-tight">Library</span>
        </button>

        <button
          type="button"
          onClick={onSelectReading}
          aria-current={isReading ? 'page' : undefined}
          className={itemClass(isReading)}
        >
          <BookOpen className="w-[19px] h-[19px]" />
          <span className="text-[10px] leading-none tracking-tight">Reading</span>
        </button>

        <button
          type="button"
          onClick={onSelectHighlights}
          aria-current={isHighlights ? 'page' : undefined}
          className={itemClass(isHighlights)}
        >
          <Highlighter className="w-[19px] h-[19px]" />
          <span className="text-[10px] leading-none tracking-tight">Notes</span>
        </button>

        <button
          type="button"
          onClick={onOpenBrowseDrawer}
          aria-expanded={isDrawerOpen}
          className={itemClass(isBrowse)}
        >
          <FolderTree className="w-[19px] h-[19px]" />
          <span className="text-[10px] leading-none tracking-tight">Browse</span>
        </button>

        <button
          type="button"
          disabled={isImporting}
          onClick={onImportBooks}
          className="min-h-[48px] flex flex-col items-center justify-center gap-0.5 px-1 text-[var(--accent)] disabled:opacity-50 cursor-pointer select-none"
        >
          <span className="w-6 h-6 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] flex items-center justify-center">
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          </span>
          <span className="text-[10px] font-medium leading-none tracking-tight">
            {isImporting ? 'Adding' : 'Import'}
          </span>
        </button>
      </div>
    </nav>
  );
};
