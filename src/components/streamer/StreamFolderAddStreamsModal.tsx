import React, { useEffect, useMemo, useState } from 'react';
import { Check, FolderPlus, MonitorPlay, Search, X } from 'lucide-react';
import { StreamFolder, StreamItem } from '../../types';

interface StreamFolderAddStreamsModalProps {
  folder: StreamFolder | null;
  streams: StreamItem[];
  onClose: () => void;
  onAddStreams: (folderId: string, streamIds: string[]) => void;
}

export const StreamFolderAddStreamsModal: React.FC<
  StreamFolderAddStreamsModalProps
> = ({ folder, streams, onClose, onAddStreams }) => {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!folder) return;
    setQuery('');
    setSelectedIds(new Set());
  }, [folder]);

  useEffect(() => {
    if (!folder) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [folder, onClose]);

  const candidateStreams = useMemo(() => {
    if (!folder) return [];
    const q = query.trim().toLowerCase();
    return streams
      .filter((s) => !(s.folderIds ?? []).includes(folder.id))
      .filter((s) => {
        if (!q) return true;
        return [
          s.customLabel || '',
          s.title,
          s.channel,
          s.category,
          ...s.tags,
        ]
          .join(' ')
          .toLowerCase()
          .includes(q);
      });
  }, [folder, streams, query]);

  if (!folder) return null;

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0) return;
    onAddStreams(folder.id, Array.from(selectedIds));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Add streams to ${folder.name}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        <div
          className="px-4 py-3 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="min-w-0">
            <h2 className="font-display text-sm font-semibold truncate">
              Add Streams to “{folder.name}”
            </h2>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Pick existing Vault streams to file into this folder
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-7 h-7 rounded-lg inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div
            className="px-4 py-2.5 border-b shrink-0"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search streams by title, channel, topic, or tag..."
                className="w-full h-8 pl-8 pr-7 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="h-6 w-6 rounded flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {candidateStreams.length === 0 ? (
              <div
                className="py-10 text-center text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                {streams.length === 0
                  ? 'No streams in your Vault yet.'
                  : query
                    ? 'No matching streams outside this folder.'
                    : 'All saved streams are already in this folder.'}
              </div>
            ) : (
              candidateStreams.map((item) => {
                const checked = selectedIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleId(item.id)}
                    className="w-full px-2.5 py-2 rounded-xl border text-left flex items-center gap-2.5 transition-colors cursor-pointer"
                    style={{
                      backgroundColor: checked
                        ? 'var(--accent-soft)'
                        : 'var(--bg-surface)',
                      borderColor: checked
                        ? 'var(--accent)'
                        : 'var(--border-subtle)',
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: checked
                          ? 'var(--accent)'
                          : 'var(--bg-canvas)',
                        borderColor: checked
                          ? 'var(--accent)'
                          : 'var(--border-strong)',
                        color: 'var(--accent-fg)',
                      }}
                    >
                      {checked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>

                    <div
                      className="w-12 h-7 rounded overflow-hidden border shrink-0 flex items-center justify-center"
                      style={{
                        backgroundColor: 'var(--bg-surface-subtle)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.customLabel || item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <MonitorPlay
                          className="w-3.5 h-3.5"
                          style={{ color: 'var(--text-muted)' }}
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div
                        className="text-xs font-semibold truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {item.customLabel || item.title}
                      </div>
                      <div
                        className="text-[11px] truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {[item.channel || 'YouTube', item.category || 'General']
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div
            className="px-4 py-3 border-t flex items-center justify-between gap-2 shrink-0"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <span
              className="text-xs font-mono tabular-nums"
              style={{ color: 'var(--text-muted)' }}
            >
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-3 rounded-lg border text-xs font-medium cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={selectedIds.size === 0}
                className="h-8 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-fg)',
                }}
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>
                  Add{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
