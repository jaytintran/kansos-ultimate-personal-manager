import React, { useMemo, useState } from 'react';
import { Layers, MonitorPlay, Plus, Search, Trash2, X } from 'lucide-react';
import { StreamFolder, StreamItem, StreamPreset } from '../../types';

interface StreamerStudioSidebarProps {
  streams: StreamItem[];
  folders: StreamFolder[];
  presets: StreamPreset[];
  activePresetId: string | null;
  activeStreamIdSet: Set<string>;
  onLoadPreset: (presetId: string) => void;
  onDeletePreset: (presetId: string) => void;
  onStackStream: (streamId: string) => void;
  onCloseMobile?: () => void;
}

export const StreamerStudioSidebar: React.FC<StreamerStudioSidebarProps> = ({
  streams,
  folders,
  presets,
  activePresetId,
  activeStreamIdSet,
  onLoadPreset,
  onDeletePreset,
  onStackStream,
  onCloseMobile,
}) => {
  const [routineFilter, setRoutineFilter] = useState<string>('all');
  const [folderFilter, setFolderFilter] = useState<string>('all');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  const routineOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of presets) {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [presets]);

  const filteredPresets = useMemo(() => {
    if (routineFilter === 'all') return presets;
    return presets.filter((p) => (p.category || 'General') === routineFilter);
  }, [presets, routineFilter]);

  const filteredLibraryStreams = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    return streams.filter((s) => {
      if (folderFilter !== 'all') {
        if (!s.folderIds?.includes(folderFilter)) return false;
      }
      if (q) {
        const hay = `${s.customLabel} ${s.title} ${s.channel} ${s.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [streams, folderFilter, libraryQuery]);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: 'var(--bg-surface)' }}
    >
      {/* Mobile Drawer Header */}
      {onCloseMobile && (
        <div
          className="px-4 py-3 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <span className="font-display text-sm font-bold">Studio Library & Presets</span>
          <button
            type="button"
            onClick={onCloseMobile}
            className="h-8 w-8 rounded-lg flex items-center justify-center"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close studio sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3.5 space-y-5">
        {/* Section 1: Routine Stack Presets */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold tracking-tight whitespace-nowrap">
              Routine Stack Presets
            </h2>
            <select
              value={routineFilter}
              onChange={(e) => setRoutineFilter(e.target.value)}
              className="h-7 px-2 rounded-lg border text-[11px] font-medium outline-none max-w-[130px]"
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
              aria-label="Filter routine presets"
            >
              <option value="all">All Routines</option>
              {routineOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {filteredPresets.length === 0 ? (
            <div
              className="rounded-xl border px-3 py-4 text-center text-[11px]"
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              No saved stack presets yet. Use Save Stack in the transport bar.
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredPresets.map((preset) => {
                const isActive = activePresetId === preset.id;
                const trackCount = preset.slots ? preset.slots.length : preset.streamIds.length;
                const hasMixSaved = Boolean(preset.slots && preset.slots.length > 0);

                return (
                  <div
                    key={preset.id}
                    className="group rounded-xl border p-2.5 flex items-center justify-between gap-2 transition-colors hover:bg-[var(--bg-surface-hover)]"
                    style={{
                      backgroundColor: isActive
                        ? 'var(--accent-soft)'
                        : 'var(--bg-surface-subtle)',
                      borderColor: isActive ? 'var(--accent)' : 'var(--border-subtle)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onLoadPreset(preset.id);
                        onCloseMobile?.();
                      }}
                      className="min-w-0 flex-1 text-left space-y-0.5"
                    >
                      <div
                        className="text-xs font-semibold truncate"
                        style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}
                      >
                        {preset.name}
                      </div>
                      <div
                        className="text-[11px] font-mono tabular-nums truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {[
                          preset.category || 'Routine',
                          `${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}`,
                          hasMixSaved ? 'mix saved' : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onDeletePreset(preset.id)}
                        className="h-7 w-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--bg-surface)]"
                        style={{ color: 'var(--text-muted)' }}
                        title="Delete preset"
                        aria-label={`Delete preset ${preset.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onLoadPreset(preset.id);
                          onCloseMobile?.();
                        }}
                        className="h-7 w-7 rounded-lg flex items-center justify-center"
                        style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
                        title="Load stack mix"
                        aria-label={`Load stack ${preset.name}`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 2: Quick-Add from Library */}
        <section className="space-y-2.5 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold tracking-tight whitespace-nowrap">
              Quick-Add from Library
            </h2>
            <select
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              className="h-7 px-2 rounded-lg border text-[11px] font-medium outline-none max-w-[130px]"
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
              aria-label="Filter library by folder"
            >
              <option value="all">All Folders</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {streams.length >= 6 && (
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                value={libraryQuery}
                onChange={(e) => setLibraryQuery(e.target.value)}
                placeholder="Filter saved tracks..."
                className="w-full h-8 pl-8 pr-2.5 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          )}

          {filteredLibraryStreams.length === 0 ? (
            <div
              className="rounded-xl border px-3 py-4 text-center text-[11px]"
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              No matching streams in Library.
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredLibraryStreams.map((stream) => {
                const alreadyStacked = activeStreamIdSet.has(stream.id);
                const displayTitle = stream.customLabel || stream.title;

                return (
                  <div
                    key={stream.id}
                    className="rounded-xl border p-2 flex items-center gap-2.5 transition-colors hover:bg-[var(--bg-surface-hover)]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: alreadyStacked
                        ? 'var(--border-strong)'
                        : 'var(--border-subtle)',
                    }}
                  >
                    <div
                      className="w-12 h-8 rounded-md overflow-hidden shrink-0 border"
                      style={{
                        backgroundColor: 'var(--bg-surface-subtle)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      {!brokenThumbs[stream.id] ? (
                        <img
                          src={stream.thumbnailUrl}
                          alt={displayTitle}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenThumbs((prev) => ({ ...prev, [stream.id]: true }))
                          }
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <MonitorPlay className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate" title={displayTitle}>
                        {displayTitle}
                      </div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                        {[stream.channel || 'YouTube', stream.category]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onStackStream(stream.id)}
                      className="h-7 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                      style={{
                        backgroundColor: alreadyStacked
                          ? 'var(--accent-soft)'
                          : 'var(--bg-surface-subtle)',
                        borderColor: alreadyStacked
                          ? 'var(--accent)'
                          : 'var(--border-subtle)',
                        color: alreadyStacked ? 'var(--accent)' : 'var(--text-primary)',
                      }}
                      title={
                        alreadyStacked
                          ? 'Add another independent layer of this stream'
                          : 'Add stream to active stack'
                      }
                    >
                      <Plus className="w-3 h-3" />
                      <span>{alreadyStacked ? 'Layer' : 'Stack'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
