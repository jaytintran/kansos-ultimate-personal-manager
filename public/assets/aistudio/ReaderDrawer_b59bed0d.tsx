import {Bookmark, ChevronDown, ChevronUp, List, Pin, Search, Trash2, X} from 'lucide-react';
import React, {useEffect, useRef} from 'react';
import {formatShortDate} from '../../lib/formatters';
import type {
  BookFormat,
  BookmarkRecord,
  ParsedTocItem,
  SearchMatch,
} from '../../types/library';

export type ReaderDrawerTab = 'toc' | 'search' | 'bookmarks';

interface ReaderDrawerProps {
  isOpen: boolean;
  isPinned: boolean;
  topOverlayActive: boolean;
  bottomOverlayActive: boolean;
  activeTab: ReaderDrawerTab;
  format: BookFormat;
  currentUnitIndex: number;
  toc: ParsedTocItem[];
  chapterStartPages?: Record<number, number>;
  bookmarks: BookmarkRecord[];
  searchQuery: string;
  searchMatches: SearchMatch[];
  activeSearchMatchId: string | null;
  isIndexingSearch: boolean;
  onTabChange: (tab: ReaderDrawerTab) => void;
  onTogglePin: () => void;
  onSearchQueryChange: (q: string) => void;
  onSelectSearchMatch: (match: SearchMatch) => void;
  onStepSearchMatch: (dir: 1 | -1) => void;
  onJumpToUnit: (unitIndex: number, scrollRatio?: number, anchorId?: string) => void;
  onDeleteBookmark: (id: string) => void;
  onClose: () => void;
}

export const ReaderDrawer: React.FC<ReaderDrawerProps> = ({
  isOpen,
  isPinned,
  topOverlayActive,
  bottomOverlayActive,
  activeTab,
  format,
  currentUnitIndex,
  toc,
  chapterStartPages,
  bookmarks,
  searchQuery,
  searchMatches,
  activeSearchMatchId,
  isIndexingSearch,
  onTabChange,
  onTogglePin,
  onSearchQueryChange,
  onSelectSearchMatch,
  onStepSearchMatch,
  onJumpToUnit,
  onDeleteBookmark,
  onClose,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if ((isOpen || isPinned) && activeTab === 'search') {
      const timer = window.setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, isPinned, activeTab]);

  if (!isOpen && !isPinned) return null;

  const activeMatchIdx = activeSearchMatchId
    ? searchMatches.findIndex((m) => m.id === activeSearchMatchId)
    : -1;

  const renderPanelContent = (docked: boolean) => (
    <div className="flex flex-col h-full">
      {/* Header & Tab Strip */}
      <div className="px-4 pt-3 pb-0 border-b border-[var(--border-subtle)] shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="font-serif-editorial text-sm font-semibold text-[var(--text-primary)] truncate">
            Navigate Book
          </span>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onTogglePin}
              title={
                isPinned
                  ? 'Unpin sidebar (switch to overlay drawer)'
                  : 'Pin sidebar to keep accessible while reading'
              }
              aria-label={isPinned ? 'Unpin navigation sidebar' : 'Pin navigation sidebar'}
              aria-pressed={isPinned}
              className={`hidden lg:inline-flex items-center justify-center p-1.5 rounded transition-colors cursor-pointer ${
                isPinned
                  ? 'text-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              title={docked ? 'Hide navigation sidebar' : 'Close navigation drawer'}
              aria-label="Close navigation sidebar"
              className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 -mb-px">
          {(
            [
              {
                id: 'toc',
                label: 'Contents',
                icon: <List className="w-3.5 h-3.5" />,
                count: toc.length,
              },
              {
                id: 'search',
                label: 'Search',
                icon: <Search className="w-3.5 h-3.5" />,
                count: searchQuery.trim().length >= 2 ? searchMatches.length : null,
              },
              {
                id: 'bookmarks',
                label: 'Bookmarks',
                icon: <Bookmark className="w-3.5 h-3.5" />,
                count: bookmarks.length,
              },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`flex-1 inline-flex items-center justify-center gap-1 py-2 text-[11px] font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span className="font-mono-tabular text-[10px] opacity-75">{tab.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3">
        {/* TOC Tab */}
        {activeTab === 'toc' && (
          <div>
            {toc.length === 0 ? (
              <p className="py-10 text-center text-xs text-[var(--text-muted)]">
                This document has no embedded table of contents.
              </p>
            ) : (
              <nav className="space-y-0.5" aria-label="Table of contents">
                {toc.map((item) => {
                  const active = item.unitIndex === currentUnitIndex;
                  const pageBadge =
                    format === 'pdf'
                      ? `p.${item.unitIndex}`
                      : chapterStartPages?.[item.unitIndex]
                        ? `p.${chapterStartPages[item.unitIndex]}`
                        : `${item.unitIndex + 1}`;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onJumpToUnit(item.unitIndex, 0, item.anchorId);
                        if (!docked) onClose();
                      }}
                      style={{paddingLeft: `${10 + Math.min(item.depth, 3) * 12}px`}}
                      className={`w-full text-left pr-2.5 py-2 rounded-md text-xs leading-snug transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                        active
                          ? 'bg-[var(--bg-accent-subtle)] text-[var(--accent)] font-medium'
                          : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      <span className="truncate">{item.title}</span>
                      <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] shrink-0">
                        {pageBadge}
                      </span>
                    </button>
                  );
                })}
              </nav>
            )}
          </div>
        )}

        {/* Full-Text In-Book Search Tab */}
        {activeTab === 'search' && (
          <div className="space-y-3.5">
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchMatches.length > 0) {
                      e.preventDefault();
                      onStepSearchMatch(e.shiftKey ? -1 : 1);
                    }
                  }}
                  placeholder="Find word or phrase..."
                  className="w-full pl-9 pr-8 py-1.5 text-xs rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => onSearchQueryChange('')}
                    aria-label="Clear book search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {searchQuery.trim().length >= 2 && (
                <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span className="font-mono-tabular">
                    {isIndexingSearch
                      ? 'Indexing pages...'
                      : searchMatches.length === 0
                        ? '0 matches'
                        : activeMatchIdx >= 0
                          ? `Match ${activeMatchIdx + 1} of ${searchMatches.length}`
                          : `${searchMatches.length} ${searchMatches.length === 1 ? 'match' : 'matches'}`}
                  </span>

                  {searchMatches.length > 0 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onStepSearchMatch(-1)}
                        aria-label="Previous match"
                        className="p-1 rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onStepSearchMatch(1)}
                        aria-label="Next match"
                        className="p-1 rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {searchQuery.trim().length < 2 ? (
              <p className="py-10 text-center text-xs text-[var(--text-muted)] leading-relaxed">
                Type at least 2 characters to search across every{' '}
                {format === 'pdf' ? 'page' : 'chapter'} in this book.
              </p>
            ) : isIndexingSearch ? (
              <div className="py-10 flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)] animate-spin" />
                <span>Indexing document text...</span>
              </div>
            ) : searchMatches.length === 0 ? (
              <p className="py-10 text-center text-xs text-[var(--text-muted)]">
                No passages found matching &ldquo;{searchQuery.trim()}&rdquo;.
              </p>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {searchMatches.map((match) => {
                  const isActive = match.id === activeSearchMatchId;
                  return (
                    <button
                      key={match.id}
                      type="button"
                      onClick={() => {
                        onSelectSearchMatch(match);
                        if (!docked) onClose();
                      }}
                      className={`w-full text-left py-2.5 px-2 -mx-2 rounded-md transition-colors cursor-pointer space-y-1 ${
                        isActive
                          ? 'bg-[var(--bg-accent-subtle)]'
                          : 'hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                        <span className="truncate font-medium text-[var(--text-secondary)]">
                          {match.unitLabel}
                        </span>
                        <span className="font-mono-tabular shrink-0">
                          {format === 'pdf'
                            ? `p.${match.unitIndex}`
                            : chapterStartPages?.[match.unitIndex]
                              ? `p.${chapterStartPages[match.unitIndex]}`
                              : `#${match.unitIndex + 1}`}
                        </span>
                      </div>
                      <p className="font-serif-editorial text-xs leading-relaxed text-[var(--text-primary)]">
                        <span>{match.snippetBefore}</span>
                        <mark className="folio-search-match">{match.matchText}</mark>
                        <span>{match.snippetAfter}</span>
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Bookmarks Tab */}
        {activeTab === 'bookmarks' && (
          <div>
            {bookmarks.length === 0 ? (
              <div className="py-12 text-center space-y-1.5">
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  No bookmarks saved yet
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Use the bookmark button in the header to save your place.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {bookmarks.map((bm) => (
                  <div key={bm.id} className="py-3 first:pt-0 group flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onJumpToUnit(bm.unitIndex, bm.scrollRatio);
                        if (!docked) onClose();
                      }}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <div className="text-xs font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] truncate">
                        {bm.label}
                      </div>
                      {bm.excerpt && (
                        <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                          {bm.excerpt}
                        </p>
                      )}
                      <div className="mt-1.5 font-mono-tabular text-[11px] text-[var(--text-muted)]">
                        {format === 'pdf'
                          ? `Page ${bm.unitIndex}`
                          : chapterStartPages?.[bm.unitIndex]
                            ? `Page ${chapterStartPages[bm.unitIndex]} · Ch. ${bm.unitIndex + 1}`
                            : `Section ${bm.unitIndex + 1}`}{' '}
                        · {formatShortDate(bm.createdAt)}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteBookmark(bm.id)}
                      aria-label="Delete bookmark"
                      className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Docked Pinned Left Sidebar (lg+) — unchanged */}
      {isPinned && (
        <aside
          aria-label="Pinned book navigation sidebar"
          className={`hidden lg:flex flex-col w-[292px] xl:w-[308px] h-full border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] shrink-0 transition-[padding] duration-180 ${
            topOverlayActive ? 'pt-[84px]' : 'pt-0'
          } ${bottomOverlayActive ? 'pb-[52px]' : 'pb-0'}`}
        >
          {renderPanelContent(true)}
        </aside>
      )}

      {/* Desktop Unpinned Slide-Over Drawer (lg+) — unchanged */}
      {isOpen && !isPinned && (
        <div
          className="hidden lg:flex fixed inset-0 z-50 justify-start bg-black/35"
          onClick={onClose}
        >
          <aside
            role="dialog"
            aria-label="Reader contents, search, and bookmarks"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm h-full bg-[var(--bg-elevated)] border-r border-[var(--border-subtle)] shadow-2xl"
          >
            {renderPanelContent(false)}
          </aside>
        </div>
      )}

      {/* Mobile Slide-Up Bottom Sheet (<lg) */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-[2px]"
          onClick={onClose}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Reader contents, search, and bookmarks"
            onClick={(e) => e.stopPropagation()}
            className="w-full h-[82dvh] max-h-[82dvh] rounded-t-2xl border-t border-x border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl flex flex-col overflow-hidden pb-safe animate-folio-sheet-up"
          >
            <div className="pt-2.5 pb-1 flex justify-center shrink-0">
              <div className="w-10 h-1 rounded-full bg-[var(--border-strong)]" />
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {renderPanelContent(false)}
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
