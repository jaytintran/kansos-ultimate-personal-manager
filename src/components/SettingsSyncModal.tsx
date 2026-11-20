import React, { useRef, useState } from 'react';
import {
  Check,
  CloudDownload,
  CloudUpload,
  Download,
  Eye,
  EyeOff,
  Moon,
  Palette,
  RefreshCw,
  SlidersHorizontal,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ColorMode, ThemeId, TimelineDisplayMode } from '../types';
import { KansoLogo } from './KansoLogo';
import {
  downloadWorkspaceJson,
  GistPullPreview,
  pullWorkspaceFromGist,
  pushWorkspaceToGist,
  validateWorkspacePayload,
} from '../utils/gist';

type ModalTab = 'appearance' | 'sync' | 'workspace';

interface SettingsSyncModalProps {
  open: boolean;
  initialTab?: ModalTab;
  onClose: () => void;
}

const THEMES: {
  id: ThemeId;
  name: string;
  tagline: string;
  lightSwatch: [string, string, string];
  darkSwatch: [string, string, string];
}[] = [
  {
    id: 'paper',
    name: 'Paper',
    tagline: 'Archival warm stone & terracotta ink',
    lightSwatch: ['#faf8f5', '#ffffff', '#b45309'],
    darkSwatch: ['#161412', '#1e1b18', '#e5934b'],
  },
  {
    id: 'neon',
    name: 'Neon',
    tagline: 'Electric cobalt & obsidian cyan contrast',
    lightSwatch: ['#f7f8fc', '#ffffff', '#4f46e5'],
    darkSwatch: ['#090b12', '#101421', '#22d3ee'],
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    tagline: 'Industrial gunmetal, signal magenta & acid yellow',
    lightSwatch: ['#f6f6f3', '#ffffff', '#d90368'],
    darkSwatch: ['#0d0c12', '#15141e', '#facc15'],
  },
  {
    id: 'nordic',
    name: 'Nordic',
    tagline: 'Glacial mist & polar fjord slate-blue',
    lightSwatch: ['#f4f6f9', '#ffffff', '#3b6998'],
    darkSwatch: ['#1b2029', '#222935', '#88c0d0'],
  },
  {
    id: 'emerald',
    name: 'Emerald',
    tagline: 'Botanical alabaster & deep pine jade',
    lightSwatch: ['#f4f8f5', '#ffffff', '#047857'],
    darkSwatch: ['#0c1512', '#121f1a', '#34d399'],
  },
];

export const SettingsSyncModal: React.FC<SettingsSyncModalProps> = ({
  open,
  initialTab = 'appearance',
  onClose,
}) => {
  const {
    workspace,
    gistConfig,
    updateSettings,
    updateGistConfig,
    replaceWorkspace,
    mergeRemoteWorkspace,
    clearWorkspaceData,
    restoreSampleData,
    pushToast,
  } = useWorkspace();

  const [tab, setTab] = useState<ModalTab>(initialTab);
  const [showToken, setShowToken] = useState(false);
  const [syncBusy, setSyncBusy] = useState<'push' | 'pull' | 'full' | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pullPreview, setPullPreview] = useState<GistPullPreview | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (open) {
      setTab(initialTab);
      setSyncError(null);
      setPullPreview(null);
      setConfirmClear(false);
    }
  }, [open, initialTab]);

  if (!open) return null;

  const handlePush = async () => {
    setSyncError(null);
    setPullPreview(null);
    setSyncBusy('push');
    try {
      const result = await pushWorkspaceToGist(workspace, gistConfig);
      updateGistConfig({
        gistId: result.gistId,
        lastSyncedAt: result.updatedAt,
        lastDirection: 'push',
      });
      pushToast(
        result.createdNew
          ? `Created private Gist (${result.gistId.slice(0, 8)}…) and pushed`
          : 'Pushed workspace to GitHub Gist',
        'success'
      );
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Push failed.');
    } finally {
      setSyncBusy(null);
    }
  };

  const handleFetchPullPreview = async () => {
    setSyncError(null);
    setPullPreview(null);
    setSyncBusy('pull');
    try {
      const preview = await pullWorkspaceFromGist(gistConfig);
      setPullPreview(preview);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Pull failed.');
    } finally {
      setSyncBusy(null);
    }
  };

  const handleConfirmMergePull = () => {
    if (!pullPreview) return;
    mergeRemoteWorkspace(pullPreview.workspace, 'Merged remote Gist into local workspace');
    updateGistConfig({
      lastSyncedAt: new Date().toISOString(),
      lastDirection: 'pull',
    });
    setPullPreview(null);
  };

  const handleConfirmReplacePull = () => {
    if (!pullPreview) return;
    replaceWorkspace(pullPreview.workspace, 'Replaced local workspace from GitHub Gist');
    updateGistConfig({
      lastSyncedAt: new Date().toISOString(),
      lastDirection: 'pull',
    });
    setPullPreview(null);
  };

  const handleFullSync = async () => {
    setSyncError(null);
    setPullPreview(null);
    setSyncBusy('full');
    try {
      let mergedWorkspace = workspace;
      if (gistConfig.gistId.trim()) {
        const preview = await pullWorkspaceFromGist(gistConfig);
        mergedWorkspace = mergeRemoteWorkspace(preview.workspace);
      }
      const result = await pushWorkspaceToGist(mergedWorkspace, gistConfig);
      updateGistConfig({
        gistId: result.gistId,
        lastSyncedAt: result.updatedAt,
        lastDirection: 'full',
      });
      pushToast('Full 2-way Gist sync complete', 'success');
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Full sync failed.');
    } finally {
      setSyncBusy(null);
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!validateWorkspacePayload(parsed)) {
        setSyncError('Selected JSON file is not a valid Kanso workspace backup.');
        return;
      }
      replaceWorkspace(parsed, 'Workspace imported from JSON backup');
      setSyncError(null);
    } catch {
      setSyncError('Failed to read JSON backup file.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Settings and GitHub Gist Sync"
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative z-10 w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl border-t sm:border overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[88dvh]"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        {/* Mobile Drag Handle */}
        <div
          className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <span
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: 'var(--border-strong)' }}
            aria-hidden="true"
          />
        </div>

        {/* Modal Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 sm:py-4 border-b"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <KansoLogo size={20} />
            <h2 className="font-display text-base font-bold">Kanso Preferences &amp; Sync</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          className="flex items-center gap-1 px-5 pt-3 pb-2 border-b"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {(
            [
              { id: 'appearance', label: 'Themes', icon: Palette },
              { id: 'sync', label: 'GitHub Gist Sync', icon: RefreshCw },
              { id: 'workspace', label: 'Workspace', icon: SlidersHorizontal },
            ] as { id: ModalTab; label: string; icon: React.ComponentType<{ className?: string }> }[]
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* APPEARANCE TAB */}
          {tab === 'appearance' && (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">Color Mode</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Every theme includes tailored light and dark palettes.
                  </div>
                </div>
                <div
                  className="inline-flex items-center gap-1 p-1 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {(
                    [
                      { id: 'light', label: 'Light', icon: Sun },
                      { id: 'dark', label: 'Dark', icon: Moon },
                    ] as { id: ColorMode; label: string; icon: React.ComponentType<{ className?: string }> }[]
                  ).map((mode) => {
                    const Icon = mode.icon;
                    const active = workspace.settings.colorMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => updateSettings({ colorMode: mode.id })}
                        className="px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5"
                        style={{
                          backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                          color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{mode.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Theme Palette (5 Themes)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {THEMES.map((theme) => {
                    const active = workspace.settings.theme === theme.id;
                    const swatches =
                      workspace.settings.colorMode === 'dark'
                        ? theme.darkSwatch
                        : theme.lightSwatch;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => updateSettings({ theme: theme.id })}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-colors"
                        style={{
                          backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                          borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                        }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold">{theme.name}</span>
                            {active && (
                              <Check className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                            )}
                          </div>
                          <div className="text-[11px] mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
                            {theme.tagline}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {swatches.map((hex, i) => (
                            <span
                              key={i}
                              className="w-4 h-4 rounded-full border"
                              style={{
                                backgroundColor: hex,
                                borderColor: 'rgba(128,128,128,0.3)',
                              }}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                className="flex items-center justify-between pt-4 border-t"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <div className="text-sm font-medium">Clock Display Format</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Applies to Timeline spine, Focus anchors, and NLP previews.
                  </div>
                </div>
                <div
                  className="inline-flex items-center gap-1 p-1 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {(['12h', '24h'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => updateSettings({ timeFormat: fmt })}
                      className="px-3 py-1 rounded-md text-xs font-mono font-medium"
                      style={{
                        backgroundColor:
                          workspace.settings.timeFormat === fmt
                            ? 'var(--bg-surface)'
                            : 'transparent',
                        color:
                          workspace.settings.timeFormat === fmt
                            ? 'var(--text-primary)'
                            : 'var(--text-muted)',
                      }}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* GITHUB GIST SYNC TAB */}
          {tab === 'sync' && (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Kanso runs 100% offline in your browser. Connect a GitHub Personal Access Token with
                the <span className="font-mono">gist</span> scope to manually push and pull your
                workspace as a private Gist. Library book metadata, reading progress, bookmarks, and
                Streamer URLs/presets sync automatically while large PDF/EPUB files remain stored
                locally in browser IndexedDB.
              </p>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                    GitHub Personal Access Token (gist scope)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={gistConfig.token}
                      onChange={(e) => updateGistConfig({ token: e.target.value })}
                      placeholder="ghp_... or github_pat_..."
                      className="w-full pl-3 pr-10 py-2 rounded-xl border text-xs font-mono outline-none"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((s) => !s)}
                      className="absolute right-2 h-7 w-7 flex items-center justify-center rounded-md"
                      style={{ color: 'var(--text-muted)' }}
                      aria-label={showToken ? 'Hide token' : 'Show token'}
                    >
                      {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                      Gist ID (optional on first push)
                    </label>
                    <input
                      type="text"
                      value={gistConfig.gistId}
                      onChange={(e) => updateGistConfig({ gistId: e.target.value })}
                      placeholder="Auto-filled on first push"
                      className="w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                      Backup Filename
                    </label>
                    <input
                      type="text"
                      value={gistConfig.filename}
                      onChange={(e) => updateGistConfig({ filename: e.target.value })}
                      placeholder="kanso-workspace.json"
                      className="w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Manual Push, Pull & Full Sync Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={syncBusy !== null}
                  onClick={handleFullSync}
                  className="h-10 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-fg)',
                  }}
                >
                  <RefreshCw className={`w-4 h-4 ${syncBusy === 'full' ? 'animate-spin' : ''}`} />
                  <span>{syncBusy === 'full' ? 'Syncing...' : 'Full Sync'}</span>
                </button>

                <button
                  type="button"
                  disabled={syncBusy !== null}
                  onClick={handlePush}
                  className="h-10 px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <CloudUpload className="w-4 h-4" />
                  <span>{syncBusy === 'push' ? 'Pushing...' : 'Push'}</span>
                </button>

                <button
                  type="button"
                  disabled={syncBusy !== null}
                  onClick={handleFetchPullPreview}
                  className="h-10 px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <CloudDownload className="w-4 h-4" />
                  <span>{syncBusy === 'pull' ? 'Fetching...' : 'Pull'}</span>
                </button>
              </div>

              {gistConfig.lastSyncedAt && (
                <div className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  Last {gistConfig.lastDirection || 'sync'}:{' '}
                  {new Date(gistConfig.lastSyncedAt).toLocaleString()}
                </div>
              )}

              {syncError && (
                <div
                  className="p-3 rounded-xl border text-xs"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--danger)',
                    color: 'var(--danger)',
                  }}
                >
                  {syncError}
                </div>
              )}

              {/* Pull Confirmation Preview */}
              {pullPreview && (
                <div
                  className="p-4 rounded-xl border space-y-3"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--accent)',
                  }}
                >
                  <div className="text-xs font-semibold">Remote Gist Snapshot Ready</div>
                  <div className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
                    <div className="font-mono tabular-nums">
                      Updated: {new Date(pullPreview.remoteUpdatedAt).toLocaleString()}
                    </div>
                    <div className="font-mono tabular-nums">
                      {pullPreview.summary.entries} entries · {pullPreview.summary.habits} habits ·{' '}
                      {pullPreview.summary.lists} lists ({pullPreview.summary.listItems} items) ·{' '}
                      {pullPreview.summary.scratchpads} pads · {pullPreview.summary.customTabs} tabs
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmMergePull}
                      className="h-8 px-3 rounded-lg text-xs font-semibold"
                      style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                    >
                      Merge by ID (Newest Wins)
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmReplacePull}
                      className="h-8 px-3 rounded-lg border text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Replace Local
                    </button>
                    <button
                      type="button"
                      onClick={() => setPullPreview(null)}
                      className="h-8 px-3 rounded-lg text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Local Offline JSON Export / Import */}
              <div
                className="pt-4 border-t space-y-2.5"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Offline Local JSON Backup
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadWorkspaceJson(workspace)}
                    className="h-9 px-3.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export JSON</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-9 px-3.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import JSON</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    onChange={handleImportJson}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          )}

          {/* WORKSPACE TAB */}
          {tab === 'workspace' && (
            <div className="space-y-5">
              {/* X-Active Cap */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">X-Active Queue Limit</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Maximum unscheduled tasks allowed simultaneously in Focus view.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({
                        xActiveLimit: Math.max(1, workspace.settings.xActiveLimit - 1),
                      })
                    }
                    className="h-8 w-8 rounded-lg border font-mono text-sm"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                    aria-label="Decrease limit"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-mono tabular-nums text-sm font-bold">
                    {workspace.settings.xActiveLimit}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({
                        xActiveLimit: Math.min(10, workspace.settings.xActiveLimit + 1),
                      })
                    }
                    className="h-8 w-8 rounded-lg border font-mono text-sm"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                    aria-label="Increase limit"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Timeline Display Mode */}
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <div className="text-sm font-semibold">Timeline Display Mode</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Choose row density and spine presentation in Timeline view.
                  </div>
                </div>
                <div
                  className="inline-flex items-center gap-1 p-1 rounded-lg border self-start sm:self-auto"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {(['default', 'compact', 'flat'] as TimelineDisplayMode[]).map((mode) => {
                    const active = (workspace.settings.timelineDisplayMode || 'default') === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateSettings({ timelineDisplayMode: mode })}
                        className="px-3 py-1 rounded-md text-xs font-medium capitalize"
                        style={{
                          backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                          color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sample Data & Reset */}
              <div
                className="pt-4 border-t space-y-3"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <div className="text-sm font-semibold">Workspace Data</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Clear preloaded sample entries to start fresh, or restore sample data anytime.
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {!confirmClear ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClear(true)}
                      className="h-9 px-3.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--danger)',
                        color: 'var(--danger)',
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear Sample / All Data</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          clearWorkspaceData();
                          setConfirmClear(false);
                        }}
                        className="h-9 px-3.5 rounded-lg text-xs font-semibold text-white"
                        style={{ backgroundColor: 'var(--danger)' }}
                      >
                        Confirm Clear Everything
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClear(false)}
                        className="h-9 px-3 rounded-lg border text-xs"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      restoreSampleData();
                      setConfirmClear(false);
                    }}
                    className="h-9 px-3.5 rounded-lg border text-xs font-medium"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Restore Sample Data
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
