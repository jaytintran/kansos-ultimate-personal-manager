import React, { useState } from 'react';
import {
  FolderKanban,
  LayoutGrid,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
} from 'lucide-react';

export type StreamerSubView = 'grid' | 'vault';

interface StreamerTopBarProps {
  subView: StreamerSubView;
  onChangeSubView: (subView: StreamerSubView) => void;
  activeCount: number;
  vaultCount: number;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onQuickAddUrl: (rawUrl: string) => Promise<boolean>;
}

export const StreamerTopBar: React.FC<StreamerTopBarProps> = ({
  subView,
  onChangeSubView,
  activeCount,
  vaultCount,
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
      className="min-h-[52px] px-4 sm:px-6 py-2 border-b flex flex-wrap items-center justify-between gap-2.5 shrink-0"
      style={{
        backgroundColor: 'var(--bg-canvas)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Left: Unified View Heading + Live Grid / Vault Switcher */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight whitespace-nowrap">
          Streamer
        </h1>

        <div
          className="inline-flex items-center h-8 gap-0.5 p-0.5 rounded-lg border shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface)',
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
            className="h-full px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            style={{
              backgroundColor: subView === 'grid' ? 'var(--accent-soft)' : 'transparent',
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
            className="h-full px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            style={{
              backgroundColor: subView === 'vault' ? 'var(--accent-soft)' : 'transparent',
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

      {/* Right (Live Grid): Compact 32px Quick-Add URL Form + Studio Sidebar Toggle */}
      {subView === 'grid' && (
        <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5 min-w-[240px]">
          <form
            onSubmit={handleQuickAddSubmit}
            className="flex flex-1 items-center gap-1.5 min-w-[200px] max-w-md"
          >
            <input
              type="text"
              value={quickUrl}
              onChange={(e) => setQuickUrl(e.target.value)}
              placeholder="Paste YouTube URL or 11-char ID..."
              className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border text-xs outline-none transition-colors"
              style={{
                backgroundColor: 'var(--bg-surface)',
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
              <span>Add</span>
            </button>
          </form>

          <button
            type="button"
            onClick={onToggleSidebar}
            className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors hover:bg-[var(--bg-surface-hover)]"
            style={{
              backgroundColor: sidebarOpen ? 'var(--accent-soft)' : 'var(--bg-surface)',
              borderColor: sidebarOpen ? 'var(--accent)' : 'var(--border-subtle)',
              color: sidebarOpen ? 'var(--accent)' : 'var(--text-secondary)',
            }}
            title={sidebarOpen ? 'Hide presets & library sidebar' : 'Show presets & library sidebar'}
            aria-label={sidebarOpen ? 'Hide studio sidebar' : 'Show studio sidebar'}
          >
            {sidebarOpen ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Presets</span>
          </button>
        </div>
      )}
    </header>
  );
};
