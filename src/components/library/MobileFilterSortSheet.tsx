import {ArrowDownWideNarrow, ArrowUpNarrowWide, Check, RotateCcw} from 'lucide-react';
import React from 'react';
import type {
  BookFormat,
  CardDetailOptions,
  CoverSize,
  GroupByField,
  SortDirection,
  SortField,
} from '../../types/library';
import {BottomSheet} from '../ui/BottomSheet';

interface MobileFilterSortSheetProps {
  isOpen: boolean;
  formatFilter: 'all' | BookFormat;
  groupBy: GroupByField;
  sortField: SortField;
  sortDirection: SortDirection;
  coverSize: CoverSize;
  cardDetails: CardDetailOptions;
  hasViewFolders: boolean;
  hideFiledBooks: boolean;
  hasActiveFilters: boolean;
  onFormatChange: (fmt: 'all' | BookFormat) => void;
  onGroupByChange: (groupBy: GroupByField) => void;
  onSortFieldChange: (field: SortField) => void;
  onToggleSortDirection: () => void;
  onCoverSizeChange: (size: CoverSize) => void;
  onCardDetailsChange: (patch: Partial<CardDetailOptions>) => void;
  onToggleHideFiled: () => void;
  onResetFilters: () => void;
  onClose: () => void;
}

const SORT_OPTIONS: Array<{id: SortField; label: string}> = [
  {id: 'addedAt', label: 'Date Added'},
  {id: 'recent', label: 'Recently Read'},
  {id: 'title', label: 'Title'},
  {id: 'author', label: 'Author'},
  {id: 'progress', label: 'Progress'},
  {id: 'format', label: 'Format'},
];

const GROUP_OPTIONS: Array<{id: GroupByField; label: string}> = [
  {id: 'none', label: 'None'},
  {id: 'author', label: 'Author'},
  {id: 'series', label: 'Series'},
  {id: 'status', label: 'Status'},
  {id: 'format', label: 'Format'},
];

const DETAIL_TOGGLES: Array<{key: keyof CardDetailOptions; label: string}> = [
  {key: 'subtitle', label: 'Subtitle'},
  {key: 'author', label: 'Author'},
  {key: 'format', label: 'Format'},
  {key: 'category', label: 'Category'},
  {key: 'progress', label: 'Progress'},
  {key: 'tags', label: 'Tags'},
];

export const MobileFilterSortSheet: React.FC<MobileFilterSortSheetProps> = ({
  isOpen,
  formatFilter,
  groupBy,
  sortField,
  sortDirection,
  coverSize,
  cardDetails,
  hasViewFolders,
  hideFiledBooks,
  hasActiveFilters,
  onFormatChange,
  onGroupByChange,
  onSortFieldChange,
  onToggleSortDirection,
  onCoverSizeChange,
  onCardDetailsChange,
  onToggleHideFiled,
  onResetFilters,
  onClose,
}) => {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Filter & Display"
      ariaLabel="Filter, sort, and display options"
      headerActions={
        hasActiveFilters ? (
          <button
            type="button"
            onClick={onResetFilters}
            className="min-h-[40px] px-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] active:bg-[var(--bg-surface-hover)] rounded-md cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        ) : undefined
      }
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full h-11 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] font-medium text-sm active:opacity-90 cursor-pointer"
        >
          Done
        </button>
      }
    >
      <div className="p-4 space-y-6">
        {/* Format Filter */}
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Format
          </p>
          <div className="grid grid-cols-4 gap-1 p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-sidebar)]">
            {(['all', 'epub', 'pdf', 'mobi'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => onFormatChange(fmt)}
                className={`min-h-[38px] text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  formatFilter === fmt
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                {fmt === 'all' ? 'All' : fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </section>

        {/* Sort By & Direction */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Sort By
            </p>
            <button
              type="button"
              onClick={onToggleSortDirection}
              className="min-h-[36px] px-2.5 inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
            >
              {sortDirection === 'asc' ? (
                <>
                  <ArrowUpNarrowWide className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Ascending</span>
                </>
              ) : (
                <>
                  <ArrowDownWideNarrow className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Descending</span>
                </>
              )}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {SORT_OPTIONS.map((opt) => {
              const active = sortField === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSortFieldChange(opt.id)}
                  className={`min-h-[42px] px-3 rounded-lg border text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]'
                  }`}
                >
                  <span>{opt.label}</span>
                  {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Group By */}
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Group Books By
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {GROUP_OPTIONS.map((opt) => {
              const active = groupBy === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onGroupByChange(opt.id)}
                  className={`min-h-[40px] px-2.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Cover Size */}
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Grid Density
          </p>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-sidebar)]">
            {(['compact', 'standard', 'large'] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => onCoverSizeChange(sz)}
                className={`min-h-[38px] text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
                  coverSize === sz
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        </section>

        {/* Card Metadata Toggles */}
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Card Details
          </p>
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
            {DETAIL_TOGGLES.map((item) => {
              const checked = cardDetails[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  onClick={() => onCardDetailsChange({[item.key]: !checked})}
                  className="w-full min-h-[44px] px-3.5 flex items-center justify-between text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  <span>{item.label}</span>
                  <span
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                      checked ? 'bg-[var(--accent)] justify-end' : 'bg-[var(--border-strong)] justify-start'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-[var(--bg-elevated)] shadow-xs" />
                  </span>
                </button>
              );
            })}
            {hasViewFolders && (
              <button
                type="button"
                role="switch"
                aria-checked={hideFiledBooks}
                onClick={onToggleHideFiled}
                className="w-full min-h-[44px] px-3.5 flex items-center justify-between text-xs font-medium text-[var(--text-primary)] cursor-pointer"
              >
                <span>Hide books filed in folders</span>
                <span
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                    hideFiledBooks
                      ? 'bg-[var(--accent)] justify-end'
                      : 'bg-[var(--border-strong)] justify-start'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-[var(--bg-elevated)] shadow-xs" />
                </span>
              </button>
            )}
          </div>
        </section>
      </div>
    </BottomSheet>
  );
};
