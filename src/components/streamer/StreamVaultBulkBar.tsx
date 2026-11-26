import React from 'react';
import {
  CheckSquare,
  Folder,
  Layers,
  Play,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-react';

interface StreamVaultBulkBarProps {
  selectedCount: number;
  totalVisibleCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onOpenBulkTopic: () => void;
  onOpenBulkTags: () => void;
  onOpenBulkFolders: () => void;
  onBulkFavorite: () => void;
  onOpenBulkRating: () => void;
  onBulkLoadToGrid: () => void;
  onBulkDelete: () => void;
  onCloseBulkMode: () => void;
}

export const StreamVaultBulkBar: React.FC<StreamVaultBulkBarProps> = ({
  selectedCount,
  totalVisibleCount,
  onSelectAll,
  onClearSelection,
  onOpenBulkTopic,
  onOpenBulkTags,
  onOpenBulkFolders,
  onBulkFavorite,
  onOpenBulkRating,
  onBulkLoadToGrid,
  onBulkDelete,
  onCloseBulkMode,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div
      role="region"
      aria-label="Bulk selection actions"
      className="fixed bottom-3 md:bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-1.5rem)] sm:max-w-4xl w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 rounded-2xl border shadow-2xl backdrop-blur-md overflow-x-auto scrollbar-none"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        borderColor: 'var(--border-strong)',
        boxShadow: 'var(--shadow-popover)',
      }}
    >
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="font-mono tabular-nums text-xs font-semibold px-2 py-0.5 rounded-md"
          style={{
            backgroundColor: 'var(--accent-soft)',
            color: 'var(--accent)',
          }}
        >
          {selectedCount} selected
        </span>

        {selectedCount < totalVisibleCount ? (
          <button
            type="button"
            onClick={onSelectAll}
            className="h-7 px-2 text-xs font-medium rounded-lg inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] transition-colors whitespace-nowrap"
            style={{ color: 'var(--text-secondary)' }}
            title="Select all visible streams"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Select All ({totalVisibleCount})</span>
            <span className="sm:hidden">All</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onClearSelection}
            className="h-7 px-2 text-xs font-medium rounded-lg inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] transition-colors whitespace-nowrap"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>Deselect</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {/* Load to Grid */}
        <button
          type="button"
          onClick={onBulkLoadToGrid}
          className="h-7 px-2.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-fg)',
          }}
          title="Load selected streams to Live Grid"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Load Grid</span>
        </button>

        {/* Topic */}
        <button
          type="button"
          onClick={onOpenBulkTopic}
          className="h-7 px-2 text-xs font-medium rounded-lg border inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] transition-colors whitespace-nowrap"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
          title="Edit Topic / Theme"
        >
          <Tag className="w-3 h-3" />
          <span>Topic</span>
        </button>

        {/* Tags */}
        <button
          type="button"
          onClick={onOpenBulkTags}
          className="h-7 px-2 text-xs font-medium rounded-lg border inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] transition-colors whitespace-nowrap"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
          title="Add / Remove Tags"
        >
          <span>Tags</span>
        </button>

        {/* Folders */}
        <button
          type="button"
          onClick={onOpenBulkFolders}
          className="h-7 px-2 text-xs font-medium rounded-lg border inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] transition-colors whitespace-nowrap"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
          title="Assign Folders"
        >
          <Folder className="w-3 h-3" />
          <span className="hidden sm:inline">Folders</span>
        </button>

        {/* Favorite */}
        <button
          type="button"
          onClick={onBulkFavorite}
          className="h-7 px-2 text-xs font-medium rounded-lg border inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] transition-colors whitespace-nowrap"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--warning)',
          }}
          title="Favorite / Unfavorite"
        >
          <Star className="w-3.5 h-3.5 fill-current" />
        </button>

        {/* Rating */}
        <button
          type="button"
          onClick={onOpenBulkRating}
          className="h-7 px-2 text-xs font-medium rounded-lg border inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] transition-colors whitespace-nowrap"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
          title="Set Rating"
        >
          <Star className="w-3 h-3" />
          <span className="hidden sm:inline">Rating</span>
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={onBulkDelete}
          className="h-7 px-2 text-xs font-medium rounded-lg border inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] transition-colors whitespace-nowrap"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--danger)',
          }}
          title="Delete selected streams"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Delete</span>
        </button>

        {/* Close bulk edit */}
        <button
          type="button"
          onClick={onCloseBulkMode}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] ml-1"
          title="Exit Bulk Select"
          aria-label="Exit Bulk Select"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
