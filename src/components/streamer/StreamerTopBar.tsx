import React, { useState } from 'react';
import {
  FolderKanban,
  LayoutGrid,
  Loader2,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Rows3,
  SlidersHorizontal,
} from 'lucide-react';
import { StreamLayoutMode, StreamSizingMode, StreamViewMode } from '../../types';

export type StreamerSubView = 'grid' | 'vault';

const LAYOUT_PRESETS: { id: StreamLayoutMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: '1', label: '1' },
  { id: '2', label: '2' },
  { id: '2x2', label: '2×2' },
  { id: '3x2', label: '3×2' },
  { id: '3x3', label: '3×3' },
  { id: '4x4', label: '4×4' },
  { id: '5x5', label: '5×5' },
  { id: '6x6', label: '6×6' },
  { id: '7x7', label: '7×7' },
  { id: '8x8', label: '8×8' },
];

interface StreamerTopBarProps {
  subView: StreamerSubView;
  onChangeSubView: (subView: StreamerSubView) => void;
  activeCount: number;
  vaultCount: number;
  viewMode: StreamViewMode;
  onChangeViewMode: (mode: StreamViewMode) => void;
  layoutMode: StreamLayoutMode;
  onChangeLayoutMode: (mode: StreamLayoutMode) => void;
  sizingMode: StreamSizingMode;
  onChangeSizingMode: (mode: StreamSizingMode) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onQuickAddUrl: (rawUrl: string) => Promise<boolean>;
}

export const StreamerTopBar: React.FC<StreamerTopBarProps> = ({
  subView,
  onChangeSubView,
  activeCount,
  vaultCount,
  viewMode,
  onChangeViewMode,
  layoutMode,
  onChangeLayoutMode,
  sizingMode,
  onChangeSizingMode,
  sidebarOpen,
  onToggleSidebar,
  onQuickAddUrl,
}) => {
  const [quickUrl, setQuickUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUrl.trim() || adding) return;
    setAdding(true);
    try {
      const ok = await onQuickAddUrl(quickUrl.trim());
      if (ok) {
        setQuickUrl('');
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <header
      className="px-3.5 sm:px-5 py-2.5 border-b flex flex-col gap-2.5 shrink-0"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Row 1: Title + Live Grid/Vault Switcher + Quick-Add URL Input (when in Live Grid) + Sidebar Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="font-display text-base sm:text-lg font-bold tracking-tight whitespace-nowrap">
            Streamer
          </h1>

          <div
            className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderColor: 'var(--border-subtle)',
            }}
            role="tablist"
            aria-label="Streamer subview"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subView === 'grid'}
              onClick={() => onChangeSubView('grid')}
              className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              style={{
                backgroundColor: subView === 'grid' ? 'var(--bg-surface)' : 'transparent',
                color: subView === 'grid' ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Live Grid</span>
              <span
                className="text-[11px] font-mono tabular-nums opacity-80"
                style={{ color: subView === 'grid' ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {activeCount}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={subView === 'vault'}
              onClick={() => onChangeSubView('vault')}
              className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              style={{
                backgroundColor: subView === 'vault' ? 'var(--bg-surface)' : 'transparent',
                color: subView === 'vault' ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>Vault</span>
              <span
                className="text-[11px] font-mono tabular-nums opacity-80"
                style={{ color: subView === 'vault' ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {vaultCount}
              </span>
            </button>
          </div>
        </div>

        {/* Quick-Add YouTube URL Bar + Add to Stack + Sidebar Collapse */}
        {subView === 'grid' && (
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2 min-w-[260px]">
            <form
              onSubmit={handleQuickAddSubmit}
              className="flex flex-1 items-center gap-1.5 min-w-[220px] max-w-xl"
            >
              <input
                type="text"
                value={quickUrl}
                onChange={(e) => setQuickUrl(e.target.value)}
                placeholder="Paste YouTube URL or 11-char ID to layer onto stack..."
                className="flex-1 min-w-0 h-8 px-3 rounded-lg border text-xs outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
                aria-label="Paste YouTube URL or 11-character ID"
              />
              <button
                type="submit"
                disabled={!quickUrl.trim() || adding}
                className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-45 transition-opacity"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-fg)',
                }}
              >
                {adding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Add to Stack</span>
              </button>
            </form>

            <button
              type="button"
              onClick={onToggleSidebar}
              className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors hover:bg-[var(--bg-surface-hover)]"
              style={{
                backgroundColor: sidebarOpen ? 'var(--accent-soft)' : 'var(--bg-surface-subtle)',
                borderColor: sidebarOpen ? 'var(--accent)' : 'var(--border-subtle)',
                color: sidebarOpen ? 'var(--accent)' : 'var(--text-secondary)',
              }}
              title={sidebarOpen ? 'Hide studio sidebar' : 'Show presets & quick-add sidebar'}
              aria-label={sidebarOpen ? 'Hide studio sidebar' : 'Show studio sidebar'}
            >
              {sidebarOpen ? (
                <PanelRightClose className="w-3.5 h-3.5" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Library</span>
            </button>
          </div>
        )}
      </div>

      {/* Row 2 (Live Grid only): View Mode Switcher + Layout Presets + Fit/Canvas */}
      {subView === 'grid' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Display Mode Switcher: Video Grid | Compact Mixer | Mini Tiles */}
          <div
            className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderColor: 'var(--border-subtle)',
            }}
            role="group"
            aria-label="Live stack view mode"
          >
            <button
              type="button"
              onClick={() => onChangeViewMode('grid')}
              className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              style={{
                backgroundColor: viewMode === 'grid' ? 'var(--bg-surface)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Video Grid</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeViewMode('mixer')}
              className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              style={{
                backgroundColor: viewMode === 'mixer' ? 'var(--bg-surface)' : 'transparent',
                color: viewMode === 'mixer' ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Compact Mixer</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeViewMode('tiles')}
              className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              style={{
                backgroundColor: viewMode === 'tiles' ? 'var(--bg-surface)' : 'transparent',
                color: viewMode === 'tiles' ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <Rows3 className="w-3.5 h-3.5" />
              <span>Mini Tiles</span>
            </button>
          </div>

          {/* Grid Column Presets (Auto, 1, 2, 2x2..8x8) + Fit/Canvas */}
          <div className="flex flex-wrap items-center gap-2">
            {viewMode !== 'mixer' && (
              <div
                className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border overflow-x-auto max-w-full"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                }}
                role="group"
                aria-label="Grid layout presets"
              >
                {LAYOUT_PRESETS.map((opt) => {
                  const active =
                    layoutMode === opt.id || (opt.id === '1' && layoutMode === '1x1');
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChangeLayoutMode(opt.id)}
                      className="h-7 px-2 rounded-md text-[11px] font-mono tabular-nums font-medium transition-colors whitespace-nowrap shrink-0"
                      style={{
                        backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            {viewMode !== 'mixer' && (
              <div
                className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                }}
                role="group"
                aria-label="Grid sizing mode"
              >
                <button
                  type="button"
                  onClick={() => onChangeSizingMode('fit')}
                  className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: sizingMode === 'fit' ? 'var(--bg-surface)' : 'transparent',
                    color: sizingMode === 'fit' ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                  title="Fit columns cleanly inside viewport width"
                >
                  <Minimize2 className="w-3 h-3" />
                  <span>Fit</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeSizingMode('canvas')}
                  className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: sizingMode === 'canvas' ? 'var(--bg-surface)' : 'transparent',
                    color: sizingMode === 'canvas' ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                  title="Maintain roomy minimum card width on an expansive scrollable canvas"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>Canvas</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
