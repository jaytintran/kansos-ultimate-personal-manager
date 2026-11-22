import {
  CheckSquare,
  Layers,
  ListMusic,
  Pencil,
  Star,
  Trash2,
  X,
} from "lucide-react";
import React from "react";

interface AudioBulkActionBarProps {
  selectedCount: number;
  totalVisibleCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkAddToMix: () => void;
  onBulkAddToQueue: () => void;
  onBulkEdit: () => void;
  onBulkFavorite: () => void;
  onBulkDelete: () => void;
}

export const AudioBulkActionBar: React.FC<AudioBulkActionBarProps> = ({
  selectedCount,
  totalVisibleCount,
  onSelectAll,
  onClearSelection,
  onBulkAddToMix,
  onBulkAddToQueue,
  onBulkEdit,
  onBulkFavorite,
  onBulkDelete,
}) => {
  if (selectedCount === 0) return null;

  return (
    <>
      {/* Desktop Floating Bulk Action Bar (lg+) */}
      <div
        role="region"
        aria-label="Bulk audio selection actions"
        className="hidden lg:flex fixed bottom-24 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)] items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-xl"
      >
        <span className="font-mono tabular-nums text-xs font-medium text-[var(--text-primary)] pr-2 border-r border-[var(--border-subtle)] whitespace-nowrap">
          {selectedCount} selected
        </span>

        {selectedCount < totalVisibleCount && (
          <button
            type="button"
            onClick={onSelectAll}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Select All ({totalVisibleCount})
          </button>
        )}

        <button
          type="button"
          onClick={onBulkAddToMix}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] hover:opacity-95 cursor-pointer whitespace-nowrap"
        >
          <Layers className="w-3.5 h-3.5" />
          Add to Mix
        </button>

        <button
          type="button"
          onClick={onBulkAddToQueue}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
        >
          <ListMusic className="w-3.5 h-3.5" />
          Queue
        </button>

        <button
          type="button"
          onClick={onBulkEdit}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
        >
          <Pencil className="w-3.5 h-3.5" />
          Bulk Edit
        </button>

        <button
          type="button"
          onClick={onBulkFavorite}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
        >
          <Star className="w-3.5 h-3.5" />
          Favorite
        </button>

        <button
          type="button"
          onClick={onBulkDelete}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded text-[var(--danger)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>

        <button
          type="button"
          onClick={onClearSelection}
          aria-label="Clear selection"
          className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Mobile Thumb-Zone Multi-Select Bottom Bar (<lg) */}
      <div
        role="region"
        aria-label="Mobile audio multi-select actions"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-strong)] bg-[var(--bg-elevated)]/96 backdrop-blur-md shadow-2xl pb-safe"
      >
        <div className="px-3 pt-2 pb-1 flex items-center justify-between border-b border-[var(--border-subtle)]">
          <span className="font-mono tabular-nums text-xs font-semibold text-[var(--text-primary)]">
            {selectedCount} selected
          </span>
          <div className="flex items-center gap-2">
            {selectedCount < totalVisibleCount && (
              <button
                type="button"
                onClick={onSelectAll}
                className="min-h-[34px] px-2.5 text-xs font-medium text-[var(--accent)] cursor-pointer"
              >
                Select All ({totalVisibleCount})
              </button>
            )}
            <button
              type="button"
              onClick={onClearSelection}
              className="min-h-[34px] px-2.5 text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>

        <div className="grid grid-cols-5 px-1 py-1">
          <button
            type="button"
            onClick={onBulkAddToMix}
            className="min-h-[48px] flex flex-col items-center justify-center gap-1 text-[var(--accent)] font-medium cursor-pointer active:bg-[var(--bg-surface-hover)] rounded-md"
          >
            <Layers className="w-4 h-4" />
            <span className="text-[10px]">Mix</span>
          </button>

          <button
            type="button"
            onClick={onBulkAddToQueue}
            className="min-h-[48px] flex flex-col items-center justify-center gap-1 text-[var(--text-primary)] font-medium cursor-pointer active:bg-[var(--bg-surface-hover)] rounded-md"
          >
            <ListMusic className="w-4 h-4" />
            <span className="text-[10px]">Queue</span>
          </button>

          <button
            type="button"
            onClick={onBulkEdit}
            className="min-h-[48px] flex flex-col items-center justify-center gap-1 text-[var(--text-primary)] font-medium cursor-pointer active:bg-[var(--bg-surface-hover)] rounded-md"
          >
            <Pencil className="w-4 h-4" />
            <span className="text-[10px]">Edit</span>
          </button>

          <button
            type="button"
            onClick={onBulkFavorite}
            className="min-h-[48px] flex flex-col items-center justify-center gap-1 text-[var(--text-primary)] font-medium cursor-pointer active:bg-[var(--bg-surface-hover)] rounded-md"
          >
            <Star className="w-4 h-4" />
            <span className="text-[10px]">Favorite</span>
          </button>

          <button
            type="button"
            onClick={onBulkDelete}
            className="min-h-[48px] flex flex-col items-center justify-center gap-1 text-[var(--danger)] font-medium cursor-pointer active:bg-[var(--bg-surface-hover)] rounded-md"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-[10px]">Delete</span>
          </button>
        </div>
      </div>
    </>
  );
};
