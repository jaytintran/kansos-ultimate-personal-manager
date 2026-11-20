import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  MoreVertical,
  Pencil,
  Pin,
  Plus,
  Send,
  StickyNote,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { InlineTitleEdit } from '../components/InlineTitleEdit';
import { NlpInputBar } from '../components/NlpInputBar';
import { useWorkspace } from '../context/WorkspaceContext';
import { ContextMenuRecord, CustomFocusTab, DetailSheetTarget, Entry } from '../types';
import {
  formatCompactDayHeading,
  formatTime,
  getEntryDayKey,
  getTodayKey,
} from '../utils/date';

const SCRATCHPAD_LIGHT = [
  { bg: '#fef9c3', border: '#fde047', text: '#422006' }, // Butter yellow
  { bg: '#dcfce7', border: '#86efac', text: '#052e16' }, // Mint
  { bg: '#dbeafe', border: '#93c5fd', text: '#172554' }, // Sky
  { bg: '#fce7f3', border: '#f9a8d4', text: '#500724' }, // Rose
  { bg: '#f3e8ff', border: '#d8b4fe', text: '#3b0764' }, // Lavender
];

const SCRATCHPAD_DARK = [
  { bg: '#2e2814', border: '#655217', text: '#fef08a' },
  { bg: '#12291c', border: '#1e5b38', text: '#bbf7d0' },
  { bg: '#13233a', border: '#21487a', text: '#bfdbfe' },
  { bg: '#321626', border: '#72264d', text: '#fbcfe8' },
  { bg: '#251738', border: '#572d87', text: '#e9d5ff' },
];

const TAB_COLORS = [
  '#b45309',
  '#4f46e5',
  '#059669',
  '#0284c7',
  '#e11d48',
  '#9333ea',
  '#d97706',
];

interface FocusViewProps {
  onOpenDetail: (target: DetailSheetTarget) => void;
  onOpenContextMenu: (record: ContextMenuRecord, e: React.MouseEvent) => void;
}

export const FocusView: React.FC<FocusViewProps> = ({
  onOpenDetail,
  onOpenContextMenu,
}) => {
  const {
    workspace,
    addFocusItem,
    clearFocusDayFromView,
    updateEntry,
    toggleEntryCompleted,
    hardDeleteEntry,
    addScratchpad,
    updateScratchpad,
    deleteScratchpad,
    sendScratchpadToTimeline,
    addCustomTab,
    updateCustomTab,
    deleteCustomTab,
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<'today' | 'scratchpad' | string>('today');
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  // Custom tab creation / edit modal state
  const [tabModal, setTabModal] = useState<{
    mode: 'create' | 'edit';
    tab?: CustomFocusTab;
    name: string;
    color: string;
  } | null>(null);

  // Auto-swap Scratchpad palette between dark and light via MutationObserver
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const syncDark = () => setIsDark(root.classList.contains('dark'));
    syncDark();
    const observer = new MutationObserver(syncDark);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const todayKey = getTodayKey();
  const timeFormat = workspace.settings.timeFormat;
  const xLimit = workspace.settings.xActiveLimit;

  const activeCustomTabs = useMemo(
    () => (workspace.customTabs ?? []).filter((t) => !t.deletedAt),
    [workspace.customTabs]
  );

  // Reset to 'today' if current custom tab was deleted
  useEffect(() => {
    if (
      activeTab !== 'today' &&
      activeTab !== 'scratchpad' &&
      !activeCustomTabs.some((t) => t.id === activeTab)
    ) {
      setActiveTab('today');
    }
  }, [activeTab, activeCustomTabs]);

  const activeEntries = useMemo(
    () => workspace.entries.filter((e) => !e.deletedAt),
    [workspace.entries]
  );

  // Today tab buckets
  const anchors = useMemo(
    () =>
      activeEntries
        .filter(
          (e) =>
            (e.source === 'focus-anchor' || e.focusBucket === 'anchor') &&
            !e.completed
        )
        .sort((a, b) => {
          const ta = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
          const tb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
          return ta - tb;
        }),
    [activeEntries]
  );

  const xActiveTasks = useMemo(
    () =>
      activeEntries
        .filter(
          (e) =>
            (e.source === 'focus-active' || e.focusBucket === 'x-active') &&
            !e.completed
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [activeEntries]
  );

  const atXCapacity = xActiveTasks.length >= xLimit;

  // Completed (Anchors & Active Work + Log Done entries) grouped by local day key
  const completedByDay = useMemo(() => {
    const completedFocus = activeEntries.filter((e) => {
      if (!e.completed) return false;
      return (
        e.focusBucket !== null ||
        e.source === 'focus-anchor' ||
        e.source === 'focus-active'
      );
    });
    const groups = new Map<string, Entry[]>();
    for (const entry of completedFocus) {
      const dayKey = getEntryDayKey(entry);
      const list = groups.get(dayKey) || [];
      list.push(entry);
      groups.set(dayKey, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dayKey, items]) => ({
        dayKey,
        items: items.sort(
          (a, b) =>
            new Date(b.completedAt || b.createdAt).getTime() -
            new Date(a.completedAt || a.createdAt).getTime()
        ),
      }));
  }, [activeEntries]);

  // Scratchpad cards (pinned first, then updatedAt desc)
  const scratchpads = useMemo(
    () =>
      (workspace.scratchpads ?? [])
        .filter((c) => !c.deletedAt)
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }),
    [workspace.scratchpads]
  );

  const currentCustomTab = activeCustomTabs.find((t) => t.id === activeTab) || null;
  const customTabTasks = useMemo(() => {
    if (!currentCustomTab) return { active: [], completed: [] };
    const matching = activeEntries.filter(
      (e) => e.source === 'custom-tab' && e.tabId === currentCustomTab.id
    );
    return {
      active: matching
        .filter((e) => !e.completed)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      completed: matching
        .filter((e) => e.completed)
        .sort(
          (a, b) =>
            new Date(b.completedAt || b.createdAt).getTime() -
            new Date(a.completedAt || a.createdAt).getTime()
        ),
    };
  }, [activeEntries, currentCustomTab]);

  const palette = isDark ? SCRATCHPAD_DARK : SCRATCHPAD_LIGHT;

  const handleSaveTabModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tabModal || !tabModal.name.trim()) return;
    if (tabModal.mode === 'create') {
      const created = addCustomTab(tabModal.name.trim(), tabModal.color);
      setActiveTab(created.id);
    } else if (tabModal.tab) {
      updateCustomTab(tabModal.tab.id, {
        name: tabModal.name.trim(),
        color: tabModal.color,
      });
    }
    setTabModal(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-20 space-y-5">
      {/* Header + Tabs */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight">
              Focus
            </h1>
            <span
              className="text-xs font-mono tabular-nums truncate"
              style={{ color: 'var(--text-muted)' }}
            >
              {formatCompactDayHeading(todayKey)}
            </span>
          </div>
        </div>

        {/* Tab Bar: Today, Scratchpad, Custom Tabs, + New Tab */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('today')}
            className="h-8 px-3 rounded-t-lg text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 border-b-2 transition-colors"
            style={{
              borderColor: activeTab === 'today' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'today' ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Today</span>
            <span className="font-mono tabular-nums text-[11px] opacity-70">
              {anchors.length + xActiveTasks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('scratchpad')}
            className="h-8 px-3 rounded-t-lg text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 border-b-2 transition-colors"
            style={{
              borderColor: activeTab === 'scratchpad' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'scratchpad' ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            <StickyNote className="w-3.5 h-3.5" />
            <span>Scratchpad</span>
            <span className="font-mono tabular-nums text-[11px] opacity-70">
              {scratchpads.length}
            </span>
          </button>

          {activeCustomTabs.map((ct) => {
            const active = activeTab === ct.id;
            const count = activeEntries.filter(
              (e) => e.source === 'custom-tab' && e.tabId === ct.id && !e.completed
            ).length;
            return (
              <button
                key={ct.id}
                type="button"
                onClick={() => setActiveTab(ct.id)}
                className="h-8 px-3 rounded-t-lg text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 border-b-2 transition-colors"
                style={{
                  borderColor: active ? ct.color : 'transparent',
                  color: active ? ct.color : 'var(--text-secondary)',
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: ct.color }}
                />
                <span>{ct.name}</span>
                <span className="font-mono tabular-nums text-[11px] opacity-70">{count}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() =>
              setTabModal({
                mode: 'create',
                name: '',
                color: TAB_COLORS[activeCustomTabs.length % TAB_COLORS.length],
              })
            }
            className="h-8 px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 shrink-0 ml-1 transition-colors hover:bg-[var(--bg-surface-subtle)]"
            style={{ color: 'var(--text-muted)' }}
            title="New custom focus tab"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tab</span>
          </button>
        </div>
      </header>

      {/* ================= TODAY TAB ================= */}
      {activeTab === 'today' && (
        <div className="space-y-8">
          {/* 1. ANCHORS | DAILY SCHEDULE */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h2 className="font-display text-sm font-bold tracking-tight">
                  Anchors | Daily Schedule
                </h2>
                <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {anchors.length}
                </span>
              </div>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Focus-only commitments
              </span>
            </div>

            <NlpInputBar
              placeholder='Add anchor (e.g., "Standup in 30 mins", "Board meeting at 2pm")...'
              onSubmit={(raw) => addFocusItem('anchor', raw)}
              baseDateKey={todayKey}
              submitLabel="Anchor"
              showTimeblockTip={false}
            />

            {anchors.length > 0 && (
              <div
                className="rounded-2xl border divide-y overflow-hidden"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {anchors.map((entry) => (
                  <div
                    key={entry.id}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onOpenContextMenu({ kind: 'entry', entry }, e);
                    }}
                    className="group flex items-start gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--bg-surface-subtle)]"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleEntryCompleted(entry.id)}
                      className="mt-0.5 h-5 w-5 flex items-center justify-center rounded-full shrink-0 transition-colors"
                      style={{ color: 'var(--accent)' }}
                      title="Complete anchor"
                      aria-label={`Complete ${entry.title}`}
                    >
                      <Circle className="w-4.5 h-4.5" />
                    </button>

                    <div className="flex-1 min-w-0 space-y-0.5">
                      <InlineTitleEdit
                        value={entry.title}
                        allowMobileEdit
                        onCommit={(nextTitle) => updateEntry(entry.id, { title: nextTitle })}
                        className="text-sm font-medium"
                      />
                      <div
                        className="flex flex-wrap items-center gap-x-2 text-xs font-mono tabular-nums"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {entry.scheduledAt && (
                          <span style={{ color: 'var(--accent)' }}>
                            {formatTime(entry.scheduledAt, timeFormat)}
                            {entry.endAt ? ` – ${formatTime(entry.endAt, timeFormat)}` : ''}
                          </span>
                        )}
                        {entry.tags.length > 0 && (
                          <span>{entry.tags.map((t) => `#${t}`).join(' ')}</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenContextMenu({ kind: 'entry', entry }, e);
                      }}
                      className="h-8 w-8 flex items-center justify-center rounded-lg sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                      aria-label="More actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 2. X-ACTIVE MAX TASKS */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4" style={{ color: 'var(--color-entity-blue)' }} />
                <h2 className="font-display text-sm font-bold tracking-tight">
                  X-Active Max Tasks
                </h2>
              </div>
              <span
                className="px-2.5 py-0.5 rounded-full text-[11px] font-mono tabular-nums font-semibold"
                style={{
                  backgroundColor: atXCapacity
                    ? 'rgba(220, 38, 38, 0.14)'
                    : 'var(--accent-soft)',
                  color: atXCapacity ? 'var(--danger)' : 'var(--accent)',
                }}
              >
                {xActiveTasks.length} / {xLimit} ACTIVE
              </span>
            </div>

            <NlpInputBar
              placeholder="Add active task (hidden from Timeline until completed)..."
              disabled={atXCapacity}
              disabledHint={`At ${xLimit}-task active capacity — finish one to unlock`}
              onSubmit={(raw) => addFocusItem('x-active', raw)}
              baseDateKey={todayKey}
              submitLabel="Queue"
              showTimeblockTip={false}
            />

            {xActiveTasks.length > 0 ? (
              <div
                className="rounded-2xl border divide-y overflow-hidden"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {xActiveTasks.map((entry) => (
                  <div
                    key={entry.id}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onOpenContextMenu({ kind: 'entry', entry }, e);
                    }}
                    className="group flex items-start gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--bg-surface-subtle)]"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleEntryCompleted(entry.id)}
                      className="mt-0.5 h-5 w-5 flex items-center justify-center rounded-full shrink-0 transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      title="Mark complete"
                      aria-label={`Complete ${entry.title}`}
                    >
                      <Circle className="w-4.5 h-4.5" />
                    </button>

                    <div className="flex-1 min-w-0 space-y-0.5">
                      <InlineTitleEdit
                        value={entry.title}
                        allowMobileEdit
                        onCommit={(nextTitle) => updateEntry(entry.id, { title: nextTitle })}
                        className="text-sm font-medium"
                      />
                      {(entry.scheduledAt || entry.tags.length > 0) && (
                        <div
                          className="flex flex-wrap items-center gap-x-2 text-xs font-mono tabular-nums"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {entry.scheduledAt && (
                            <span>{formatTime(entry.scheduledAt, timeFormat)}</span>
                          )}
                          {entry.tags.length > 0 && (
                            <span>{entry.tags.map((t) => `#${t}`).join(' ')}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenContextMenu({ kind: 'entry', entry }, e);
                      }}
                      className="h-8 w-8 flex items-center justify-center rounded-lg sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                      aria-label="More actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="rounded-2xl border border-dashed px-4 py-6 text-center text-xs"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                No active tasks queued. Add up to {xLimit} focused tasks above.
              </div>
            )}
          </section>

          {/* 3. COMPLETED (ANCHORS & ACTIVE WORK) + LOG DONE */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--success)' }} />
                <h2 className="font-display text-sm font-bold tracking-tight">
                  Completed (Anchors &amp; Active Work)
                </h2>
              </div>
            </div>

            <NlpInputBar
              placeholder='Log Done (e.g., "Fixed OAuth redirect bug at 10am")...'
              onSubmit={(raw) => addFocusItem('completed', raw)}
              baseDateKey={todayKey}
              submitLabel="Log Done"
              showTimeblockTip={false}
            />

            {completedByDay.length > 0 && (
              <div className="space-y-2.5">
                {completedByDay.map(({ dayKey, items }) => {
                  const collapsed = Boolean(collapsedDays[dayKey]);
                  return (
                    <div
                      key={dayKey}
                      className="rounded-2xl border overflow-hidden"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      {/* Collapsible Day Strip */}
                      <div
                        className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b"
                        style={{
                          backgroundColor: 'var(--bg-surface-subtle)',
                          borderColor: collapsed ? 'transparent' : 'var(--border-subtle)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedDays((prev) => ({ ...prev, [dayKey]: !prev[dayKey] }))
                          }
                          className="flex items-center gap-2 text-xs font-semibold min-w-0"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {collapsed ? (
                            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>{formatCompactDayHeading(dayKey)}</span>
                          <span className="font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                            · {items.length}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => clearFocusDayFromView(dayKey)}
                          className="px-2 py-1 rounded-md text-[11px] font-medium transition-colors hover:bg-[rgba(217,119,6,0.14)] hover:text-[var(--warning)]"
                          style={{ color: 'var(--text-muted)' }}
                          title="Removes from Focus View while keeping entries in Timeline"
                        >
                          Clear from Focus View
                        </button>
                      </div>

                      {!collapsed && (
                        <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                          {items.map((entry) => {
                            const isLog = entry.type === 'log';
                            const ts = entry.completedAt || entry.createdAt;
                            return (
                              <div
                                key={entry.id}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  onOpenContextMenu({ kind: 'entry', entry }, e);
                                }}
                                onClick={() =>
                                  onOpenDetail({
                                    mode: isLog ? 'log' : 'task',
                                    id: entry.id,
                                  })
                                }
                                className="group flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]"
                                style={{ borderColor: 'var(--border-subtle)' }}
                              >
                                {isLog ? (
                                  <span
                                    className="h-5 w-5 flex items-center justify-center shrink-0"
                                    aria-hidden="true"
                                  >
                                    <span
                                      className="w-2.5 h-2.5 rounded-full"
                                      style={{ backgroundColor: 'var(--accent)' }}
                                    />
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleEntryCompleted(entry.id);
                                    }}
                                    className="h-5 w-5 flex items-center justify-center rounded-full shrink-0"
                                    style={{ color: 'var(--success)' }}
                                    title="Reopen task"
                                    aria-label={`Reopen ${entry.title}`}
                                  >
                                    <CheckCircle2 className="w-4.5 h-4.5" />
                                  </button>
                                )}

                                <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2">
                                  <span
                                    className={`text-sm truncate ${
                                      isLog ? '' : 'line-through'
                                    }`}
                                    style={{
                                      color: isLog
                                        ? 'var(--text-secondary)'
                                        : 'var(--text-muted)',
                                    }}
                                  >
                                    {entry.title}
                                  </span>
                                  <span
                                    className="text-[11px] font-mono tabular-nums shrink-0"
                                    style={{
                                      color: isLog ? 'var(--text-secondary)' : 'var(--success)',
                                    }}
                                  >
                                    {isLog
                                      ? `At ${formatTime(ts, timeFormat)}`
                                      : `Done ${formatTime(ts, timeFormat)}`}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    hardDeleteEntry(entry.id);
                                  }}
                                  className="h-7 w-7 flex items-center justify-center rounded-md sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0 hover:bg-[var(--bg-surface)]"
                                  style={{ color: 'var(--danger)' }}
                                  title="Delete everywhere"
                                  aria-label="Delete everywhere"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ================= SCRATCHPAD TAB ================= */}
      {activeTab === 'scratchpad' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Quick-capture sticky cards. Pin to top or promote to a Timeline note in one click.
            </p>
            <button
              type="button"
              onClick={() => addScratchpad(scratchpads.length % 5)}
              className="h-9 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              <Plus className="w-4 h-4" />
              <span>New Sticky</span>
            </button>
          </div>

          {scratchpads.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed py-12 px-4 text-center space-y-2"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
            >
              <StickyNote className="w-7 h-7 mx-auto opacity-50" />
              <p className="text-sm font-medium">Scratchpad is clear</p>
              <p className="text-xs">Jot down transient thoughts, drafts, or meeting snippets.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {scratchpads.map((card) => {
                const pal = palette[card.paletteIndex % palette.length];
                return (
                  <div
                    key={card.id}
                    className="rounded-2xl border p-3.5 flex flex-col gap-3 min-h-[180px] transition-colors"
                    style={{
                      backgroundColor: pal.bg,
                      borderColor: pal.border,
                      color: pal.text,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* 5 Palette Swatches */}
                      <div className="flex items-center gap-1.5">
                        {palette.map((sw, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => updateScratchpad(card.id, { paletteIndex: idx })}
                            className="w-4 h-4 rounded-full border transition-transform"
                            style={{
                              backgroundColor: sw.border,
                              borderColor:
                                card.paletteIndex === idx ? pal.text : 'transparent',
                              transform:
                                card.paletteIndex === idx ? 'scale(1.15)' : 'scale(1)',
                            }}
                            aria-label={`Palette ${idx + 1}`}
                          />
                        ))}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            updateScratchpad(card.id, { pinned: !card.pinned })
                          }
                          className="h-7 w-7 flex items-center justify-center rounded-md transition-opacity"
                          style={{ opacity: card.pinned ? 1 : 0.55 }}
                          title={card.pinned ? 'Unpin' : 'Pin to top'}
                          aria-label="Toggle pin"
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteScratchpad(card.id)}
                          className="h-7 w-7 flex items-center justify-center rounded-md opacity-60 hover:opacity-100"
                          title="Delete card"
                          aria-label="Delete sticky"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <textarea
                      value={card.content}
                      onChange={(e) =>
                        updateScratchpad(card.id, { content: e.target.value })
                      }
                      placeholder="Write a quick note..."
                      className="flex-1 w-full bg-transparent resize-none outline-none text-sm leading-relaxed placeholder:opacity-50"
                      style={{ color: pal.text }}
                    />

                    <div className="flex items-center justify-between pt-2 border-t border-black/10 dark:border-white/10">
                      <span className="text-[10px] font-mono opacity-65">
                        {formatTime(card.updatedAt, timeFormat)}
                      </span>
                      <button
                        type="button"
                        disabled={!card.content.trim()}
                        onClick={() => sendScratchpadToTimeline(card.id)}
                        className="h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-opacity disabled:opacity-35 bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15"
                      >
                        <Send className="w-3 h-3" />
                        <span>Send to Timeline</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= CUSTOM FOCUS TAB ================= */}
      {currentCustomTab && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: currentCustomTab.color }}
              />
              <h2 className="font-display text-base font-bold">{currentCustomTab.name}</h2>
              <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {customTabTasks.active.length} active
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setTabModal({
                    mode: 'edit',
                    tab: currentCustomTab,
                    name: currentCustomTab.name,
                    color: currentCustomTab.color,
                  })
                }
                className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={() => deleteCustomTab(currentCustomTab.id)}
                className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--danger)',
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>

          <NlpInputBar
            placeholder={`Add task to ${currentCustomTab.name} (surfaces in Timeline when completed)...`}
            onSubmit={(raw) => addFocusItem('custom-tab', raw, currentCustomTab.id)}
            baseDateKey={todayKey}
            submitLabel="Add"
            showTimeblockTip={false}
          />

          {/* Active queue */}
          {customTabTasks.active.length > 0 ? (
            <div
              className="rounded-2xl border divide-y overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {customTabTasks.active.map((entry) => (
                <div
                  key={entry.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onOpenContextMenu({ kind: 'entry', entry }, e);
                  }}
                  className="group flex items-start gap-3 px-3.5 py-3 hover:bg-[var(--bg-surface-subtle)]"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <button
                    type="button"
                    onClick={() => toggleEntryCompleted(entry.id)}
                    className="mt-0.5 h-5 w-5 flex items-center justify-center rounded-full shrink-0"
                    style={{ color: currentCustomTab.color }}
                    aria-label={`Complete ${entry.title}`}
                  >
                    <Circle className="w-4.5 h-4.5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <InlineTitleEdit
                      value={entry.title}
                      allowMobileEdit
                      onCommit={(nextTitle) => updateEntry(entry.id, { title: nextTitle })}
                      className="text-sm font-medium"
                    />
                    {entry.tags.length > 0 && (
                      <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {entry.tags.map((t) => `#${t}`).join(' ')}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenContextMenu({ kind: 'entry', entry }, e);
                    }}
                    className="h-8 w-8 flex items-center justify-center rounded-lg sm:opacity-0 sm:group-hover:opacity-100"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label="More actions"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="rounded-2xl border border-dashed py-8 px-4 text-center text-xs"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
            >
              No pending tasks in {currentCustomTab.name}.
            </div>
          )}

          {/* Completed tasks in this custom tab */}
          {customTabTasks.completed.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Completed ({customTabTasks.completed.length})
              </div>
              <div
                className="rounded-2xl border divide-y overflow-hidden"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {customTabTasks.completed.map((entry) => (
                  <div
                    key={entry.id}
                    onClick={() => onOpenDetail({ mode: 'task', id: entry.id })}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onOpenContextMenu({ kind: 'entry', entry }, e);
                    }}
                    className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-[var(--bg-surface-subtle)]"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleEntryCompleted(entry.id);
                      }}
                      className="h-5 w-5 flex items-center justify-center shrink-0"
                      style={{ color: 'var(--success)' }}
                      aria-label="Reopen task"
                    >
                      <CheckCircle2 className="w-4.5 h-4.5" />
                    </button>
                    <span className="text-sm line-through truncate flex-1" style={{ color: 'var(--text-muted)' }}>
                      {entry.title}
                    </span>
                    {entry.completedAt && (
                      <span className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--success)' }}>
                        Done {formatTime(entry.completedAt, timeFormat)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Custom Tab Create / Edit Modal */}
      {tabModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setTabModal(null)}
          />
          <form
            onSubmit={handleSaveTabModal}
            className="relative z-10 w-full max-w-sm rounded-2xl border p-5 space-y-4"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-strong)',
              boxShadow: 'var(--shadow-popover)',
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold">
                {tabModal.mode === 'create' ? 'New Focus Tab' : 'Edit Focus Tab'}
              </h3>
              <button
                type="button"
                onClick={() => setTabModal(null)}
                className="h-7 w-7 flex items-center justify-center rounded-md"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Tab Name
              </label>
              <input
                type="text"
                value={tabModal.name}
                onChange={(e) => setTabModal({ ...tabModal, name: e.target.value })}
                placeholder="e.g. Deep Craft, Errands, Writing..."
                autoFocus
                className="w-full h-10 px-3 rounded-xl border text-sm outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Accent Color
              </label>
              <div className="flex items-center gap-2">
                {TAB_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setTabModal({ ...tabModal, color: hex })}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: hex }}
                  >
                    {tabModal.color === hex && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setTabModal(null)}
                className="h-9 px-3.5 rounded-xl border text-xs font-medium"
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
                disabled={!tabModal.name.trim()}
                className="h-9 px-4 rounded-xl text-xs font-semibold disabled:opacity-40"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {tabModal.mode === 'create' ? 'Create Tab' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
