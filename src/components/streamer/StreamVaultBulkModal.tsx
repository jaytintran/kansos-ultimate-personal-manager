import React, { useState } from 'react';
import { Check, Folder, Star, Tag, Trash2, X } from 'lucide-react';
import { StreamFolder } from '../../types';

export type BulkModalType = 'topic' | 'tags' | 'folders' | 'rating' | 'delete' | null;

interface StreamVaultBulkModalProps {
  type: BulkModalType;
  selectedCount: number;
  folders: StreamFolder[];
  existingTopics: string[];
  existingTags: string[];
  onClose: () => void;
  onApplyTopic: (topic: string) => void;
  onApplyTags: (tags: string[], mode: 'append' | 'replace') => void;
  onApplyFolders: (folderIds: string[], mode: 'append' | 'replace') => void;
  onApplyRating: (rating: number) => void;
  onConfirmDelete: () => void;
}

export const StreamVaultBulkModal: React.FC<StreamVaultBulkModalProps> = ({
  type,
  selectedCount,
  folders,
  existingTopics,
  existingTags,
  onClose,
  onApplyTopic,
  onApplyTags,
  onApplyFolders,
  onApplyRating,
  onConfirmDelete,
}) => {
  // Topic state
  const [topicInput, setTopicInput] = useState('');

  // Tags state
  const [tagsInput, setTagsInput] = useState('');
  const [tagMode, setTagMode] = useState<'append' | 'replace'>('append');

  // Folders state
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [folderMode, setFolderMode] = useState<'append' | 'replace'>('append');

  // Rating state
  const [selectedRating, setSelectedRating] = useState<number>(5);

  if (!type) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative z-10 w-full max-w-md rounded-2xl border p-5 shadow-2xl flex flex-col gap-4 overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 pb-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div>
            <h3 className="font-display text-sm font-bold">
              {type === 'topic' && `Change Topic for ${selectedCount} Streams`}
              {type === 'tags' && `Edit Tags for ${selectedCount} Streams`}
              {type === 'folders' && `Assign Folders for ${selectedCount} Streams`}
              {type === 'rating' && `Set Rating for ${selectedCount} Streams`}
              {type === 'delete' && `Delete ${selectedCount} Streams`}
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {selectedCount} {selectedCount === 1 ? 'stream' : 'streams'} selected
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* TOPIC MODAL */}
        {type === 'topic' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                New Topic / Theme
              </label>
              <input
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder="e.g. Subliminals, Deep Focus, Sleep"
                autoFocus
                className="w-full h-9 px-3 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {existingTopics.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] block" style={{ color: 'var(--text-muted)' }}>
                  Or pick an existing topic:
                </span>
                <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto">
                  {existingTopics.map((top) => {
                    const active = topicInput.trim().toLowerCase() === top.toLowerCase();
                    return (
                      <button
                        key={top}
                        type="button"
                        onClick={() => setTopicInput(top)}
                        className="h-6 px-2 rounded-md border text-[11px] font-medium transition-colors"
                        style={{
                          backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                          borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                          color: active ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                      >
                        {top}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-3 rounded-lg text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (topicInput.trim()) {
                    onApplyTopic(topicInput.trim());
                    onClose();
                  }
                }}
                disabled={!topicInput.trim()}
                className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-fg)',
                }}
              >
                Apply Topic
              </button>
            </div>
          </div>
        )}

        {/* TAGS MODAL */}
        {type === 'tags' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="528hz, binaural, focus, ambient"
                autoFocus
                className="w-full h-9 px-3 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {existingTags.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] block" style={{ color: 'var(--text-muted)' }}>
                  Suggestions:
                </span>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {existingTags.map((tag) => {
                    const currentTags = tagsInput.split(',').map((t) => t.trim().toLowerCase());
                    const active = currentTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          const set = new Set(currentTags.filter(Boolean));
                          if (set.has(tag)) set.delete(tag);
                          else set.add(tag);
                          setTagsInput(Array.from(set).join(', '));
                        }}
                        className="h-6 px-2 rounded-md border text-[11px] font-medium transition-colors"
                        style={{
                          backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                          borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                          color: active ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                Update Mode
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTagMode('append')}
                  className="h-8 px-3 rounded-lg border text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: tagMode === 'append' ? 'var(--accent-soft)' : 'var(--bg-surface)',
                    borderColor: tagMode === 'append' ? 'var(--accent)' : 'var(--border-subtle)',
                    color: tagMode === 'append' ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  Append to existing tags
                </button>
                <button
                  type="button"
                  onClick={() => setTagMode('replace')}
                  className="h-8 px-3 rounded-lg border text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: tagMode === 'replace' ? 'var(--accent-soft)' : 'var(--bg-surface)',
                    borderColor: tagMode === 'replace' ? 'var(--accent)' : 'var(--border-subtle)',
                    color: tagMode === 'replace' ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  Replace all tags
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-3 rounded-lg text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const cleaned = tagsInput
                    .split(',')
                    .map((t) => t.trim().toLowerCase())
                    .filter(Boolean);
                  onApplyTags(cleaned, tagMode);
                  onClose();
                }}
                className="h-8 px-4 rounded-lg text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-fg)',
                }}
              >
                Apply Tags
              </button>
            </div>
          </div>
        )}

        {/* FOLDERS MODAL */}
        {type === 'folders' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                Select Folders & Stacks
              </label>
              {folders.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  No folders created yet.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border p-2" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}>
                  {folders.map((f) => {
                    const checked = selectedFolderIds.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          setSelectedFolderIds((prev) =>
                            prev.includes(f.id)
                              ? prev.filter((id) => id !== f.id)
                              : [...prev, f.id]
                          );
                        }}
                        className="w-full flex items-center gap-2 p-1.5 rounded-md text-xs font-medium hover:bg-[var(--bg-surface-hover)] transition-colors text-left"
                      >
                        <div
                          className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: checked ? 'var(--accent)' : 'transparent',
                            borderColor: checked ? 'var(--accent)' : 'var(--border-strong)',
                            color: 'var(--accent-fg)',
                          }}
                        >
                          {checked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <Folder className="w-3.5 h-3.5 opacity-75 shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                Update Mode
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFolderMode('append')}
                  className="h-8 px-3 rounded-lg border text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: folderMode === 'append' ? 'var(--accent-soft)' : 'var(--bg-surface)',
                    borderColor: folderMode === 'append' ? 'var(--accent)' : 'var(--border-subtle)',
                    color: folderMode === 'append' ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  Append to existing folders
                </button>
                <button
                  type="button"
                  onClick={() => setFolderMode('replace')}
                  className="h-8 px-3 rounded-lg border text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: folderMode === 'replace' ? 'var(--accent-soft)' : 'var(--bg-surface)',
                    borderColor: folderMode === 'replace' ? 'var(--accent)' : 'var(--border-subtle)',
                    color: folderMode === 'replace' ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  Replace all folders
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-3 rounded-lg text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onApplyFolders(selectedFolderIds, folderMode);
                  onClose();
                }}
                className="h-8 px-4 rounded-lg text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-fg)',
                }}
              >
                Apply Folders
              </button>
            </div>
          </div>
        )}

        {/* RATING MODAL */}
        {type === 'rating' && (
          <div className="space-y-4">
            <div className="space-y-2 text-center">
              <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                Choose Star Rating (0 to 5)
              </label>
              <div className="flex items-center justify-center gap-1.5 py-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setSelectedRating(selectedRating === star ? 0 : star)}
                    className="p-1 hover:scale-110 transition-transform"
                    style={{
                      color: star <= selectedRating ? 'var(--warning)' : 'var(--border-strong)',
                    }}
                    aria-label={`${star} stars`}
                  >
                    <Star className={`w-7 h-7 ${star <= selectedRating ? 'fill-current' : ''}`} />
                  </button>
                ))}
              </div>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                {selectedRating === 0 ? 'Clear rating' : `${selectedRating} of 5 Stars`}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-3 rounded-lg text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onApplyRating(selectedRating);
                  onClose();
                }}
                className="h-8 px-4 rounded-lg text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-fg)',
                }}
              >
                Apply Rating
              </button>
            </div>
          </div>
        )}

        {/* DELETE CONFIRMATION MODAL */}
        {type === 'delete' && (
          <div className="space-y-4">
            <div className="rounded-xl border p-3.5 space-y-1" style={{ backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)' }}>
              <p className="text-xs font-medium" style={{ color: 'var(--danger)' }}>
                Warning: This action cannot be undone.
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Are you sure you want to delete {selectedCount} {selectedCount === 1 ? 'stream' : 'streams'} from your Vault?
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-3 rounded-lg text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirmDelete();
                  onClose();
                }}
                className="h-8 px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                style={{
                  backgroundColor: 'var(--danger)',
                  color: '#ffffff',
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete {selectedCount} Streams</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
