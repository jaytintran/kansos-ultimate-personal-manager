import React, { useEffect, useMemo, useState } from 'react';
import {
  Anchor,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  Layers,
  Repeat,
  Trash2,
} from 'lucide-react';
import { NlpInputBar } from '../components/NlpInputBar';
import { useWorkspace } from '../context/WorkspaceContext';
import { Entry, FocusBucket } from '../types';
import {
  addDaysToKey,
  formatLongDate,
  formatRelativeDayLabel,
  formatTime,
  getTodayKey,
  toLocalDateKey,
} from '../utils/date';

type ActiveFocusBucket = Exclude<FocusBucket, null>;
type MobileSectionFilter = 'all' | 'anchor' | 'x-active' | 'completed';

const BUCKET_CYCLE: ActiveFocusBucket[] = ['anchor', 'x-active', 'completed'];

interface FocusViewProps {
  onInspectEntry: (entryId: string) => void;
}

export const FocusView: React.FC<FocusViewProps> = ({ onInspectEntry }) => {
  const { workspace, addFocusItem, toggleEntryCompleted, deleteEntry } = useWorkspace();

  const todayKey = getTodayKey();
  const yesterdayKey = addDaysToKey(todayKey, -1);
  const { xActiveLimit, timeFormat } = workspace.settings;

  const [inputBucket, setInputBucket] = useState<ActiveFocusBucket>('anchor');
  const [mobileFilter, setMobileFilter] = useState<MobileSectionFilter>('all');
  // Explicit user overrides for collapsible Completed date groups;
  // by default Today & Yesterday are expanded, older dates are collapsed.
  const [dateToggleOverrides, setDateToggleOverrides] = useState<Record<string, boolean>>({});

  // Keyboard shortcuts Alt+1 / Alt+2 / Alt+3 to jump input bar section
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === '1') {
        e.preventDefault();
        setInputBucket('anchor');
      } else if (e.key === '2') {
        e.preventDefault();
        setInputBucket('x-active');
      } else if (e.key === '3') {
        e.preventDefault();
        setInputBucket('completed');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const cycleBucket = () => {
    const idx = BUCKET_CYCLE.indexOf(inputBucket);
    setInputBucket(BUCKET_CYCLE[(idx + 1) % BUCKET_CYCLE.length]);
  };

  const { anchors, xActive, completedGroups, completedTodayCount, totalCompletedCount } =
    useMemo(() => {
      const anchorItems = workspace.entries
        .filter((e) => e.focusBucket === 'anchor' && !e.completed)
        .sort((a, b) => {
          const ta = new Date(a.scheduledAt || a.createdAt).getTime();
          const tb = new Date(b.scheduledAt || b.createdAt).getTime();
          return ta - tb;
        });

      const xActiveItems = workspace.entries
        .filter((e) => e.focusBucket === 'x-active' && !e.completed)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const allCompleted = workspace.entries
        .filter((e) => e.focusBucket !== null && e.completed)
        .sort((a, b) => {
          const ta = new Date(a.completedAt || a.createdAt).getTime();
          const tb = new Date(b.completedAt || b.createdAt).getTime();
          return tb - ta;
        });

      const groupMap = new Map<string, Entry[]>();
      for (const item of allCompleted) {
        const dk = toLocalDateKey(item.completedAt || item.createdAt);
        const existing = groupMap.get(dk);
        if (existing) {
          existing.push(item);
        } else {
          groupMap.set(dk, [item]);
        }
      }

      const sortedGroups = Array.from(groupMap.entries())
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([dateKey, items]) => ({ dateKey, items }));

      const todayCount = groupMap.get(todayKey)?.length || 0;

      return {
        anchors: anchorItems,
        xActive: xActiveItems,
        completedGroups: sortedGroups,
        completedTodayCount: todayCount,
        totalCompletedCount: allCompleted.length,
      };
    }, [workspace.entries, todayKey]);

  const isXActiveFull = xActive.length >= xActiveLimit;

  const isDateExpanded = (dateKey: string): boolean => {
    if (dateKey in dateToggleOverrides) {
      return dateToggleOverrides[dateKey];
    }
    return dateKey === todayKey || dateKey === yesterdayKey;
  };

  const toggleDateGroup = (dateKey: string) => {
    setDateToggleOverrides((prev) => ({
      ...prev,
      [dateKey]: !isDateExpanded(dateKey),
    }));
  };

  const bucketMeta: Record<
    ActiveFocusBucket,
    {
      label: string;
      shortLabel: string;
      placeholder: string;
      submitLabel: string;
      icon: React.ComponentType<{ className?: string }>;
    }
  > = {
    anchor: {
      label: 'Anchors',
      shortLabel: 'Anchor',
      placeholder: 'Add scheduled anchor... (e.g. "Budget review at 2:30pm")',
      submitLabel: 'Schedule',
      icon: Anchor,
    },
    'x-active': {
      label: `${xActiveLimit}-Active`,
      shortLabel: `${xActiveLimit}-Active`,
      placeholder: 'Add unscheduled focus task...',
      submitLabel: 'Queue',
      icon: Layers,
    },
    completed: {
      label: 'Completed',
      shortLabel: 'Done',
      placeholder: 'Record finished work... (e.g. "Shipped hotfix at 11:40am")',
      submitLabel: 'Record',
      icon: CheckCircle2,
    },
  };

  const activeMeta = bucketMeta[inputBucket];
  const ActiveBucketIcon = activeMeta.icon;
  const inputDisabled = inputBucket === 'x-active' && isXActiveFull;

  const renderTaskRow = (item: Entry, sourceLabel?: string) => {
    const timeDisplay = item.completed
      ? formatTime(item.completedAt, timeFormat)
      : item.scheduledAt
      ? formatTime(item.scheduledAt, timeFormat)
      : '';
    const hasDetails = Boolean(item.content && item.content.replace(/<[^>]+>/g, '').trim());

    return (
      <div
        key={item.id}
        className="group flex items-center gap-2 sm:gap-3 py-2 sm:py-2.5 px-1.5 sm:px-2 -mx-1.5 sm:-mx-2 rounded-xl transition-colors"
        style={{ backgroundColor: 'transparent' }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-subtle)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <button
          type="button"
          onClick={() => toggleEntryCompleted(item.id)}
          className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-8 sm:w-8 -ml-1.5 sm:ml-0 flex items-center justify-center rounded-lg shrink-0 transition-transform active:scale-90"
          style={{ color: item.completed ? 'var(--success)' : 'var(--text-muted)' }}
          aria-label={item.completed ? `Reopen ${item.title}` : `Complete ${item.title}`}
        >
          {item.completed ? (
            <CheckCircle2 className="w-5 h-5 sm:w-4.5 sm:h-4.5" />
          ) : (
            <Circle className="w-5 h-5 sm:w-4.5 sm:h-4.5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onInspectEntry(item.id)}
          className="flex-1 min-w-0 text-left py-1"
        >
          <div
            className={`text-sm font-medium leading-snug ${item.completed ? 'line-through' : ''}`}
            style={{ color: item.completed ? 'var(--text-muted)' : 'var(--text-primary)' }}
          >
            {item.title}
          </div>
          {(timeDisplay || sourceLabel || hasDetails) && (
            <div
              className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              {timeDisplay && (
                <span className="font-mono tabular-nums inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{timeDisplay}</span>
                </span>
              )}
              {timeDisplay && sourceLabel && <span aria-hidden="true">·</span>}
              {sourceLabel && <span>{sourceLabel}</span>}
              {hasDetails && (
                <>
                  {(timeDisplay || sourceLabel) && <span aria-hidden="true">·</span>}
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    <span>Notes</span>
                  </span>
                </>
              )}
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={() => deleteEntry(item.id)}
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg transition-opacity shrink-0"
          style={{ color: 'var(--text-muted)' }}
          aria-label={`Delete ${item.title}`}
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  const showAnchors = mobileFilter === 'all' || mobileFilter === 'anchor';
  const showXActive = mobileFilter === 'all' || mobileFilter === 'x-active';
  const showCompleted = mobileFilter === 'all' || mobileFilter === 'completed';

  return (
    <div className="relative max-w-5xl mx-auto px-4 sm:px-8 pt-5 sm:pt-9 pb-40 lg:pb-32 space-y-6 sm:space-y-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-2.5 pb-4 sm:pb-5 border-b">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Focus</h1>
          <p className="mt-1 text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
            {formatLongDate(todayKey)}
          </p>
        </div>

        <div
          className="flex items-center gap-3 text-xs font-mono tabular-nums"
          style={{ color: 'var(--text-muted)' }}
        >
          <span>{anchors.length} anchors</span>
          <span aria-hidden="true">·</span>
          <span>
            {xActive.length}/{xActiveLimit} active
          </span>
          <span aria-hidden="true">·</span>
          <span>{completedTodayCount} done today</span>
        </div>
      </header>

      {/* Mobile Quick Section Switcher */}
      <div
        className="lg:hidden flex items-center gap-1 p-1 rounded-xl border overflow-x-auto"
        style={{
          backgroundColor: 'var(--bg-surface-subtle)',
          borderColor: 'var(--border-subtle)',
        }}
        role="tablist"
        aria-label="Filter Focus sections"
      >
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'anchor', label: `Anchors (${anchors.length})` },
            { id: 'x-active', label: `${xActiveLimit}-Active (${xActive.length}/${xActiveLimit})` },
            { id: 'completed', label: `Done (${totalCompletedCount})` },
          ] as { id: MobileSectionFilter; label: string }[]
        ).map((tab) => {
          const active = mobileFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setMobileFilter(tab.id);
                if (tab.id !== 'all') setInputBucket(tab.id);
              }}
              className="flex-1 min-w-fit px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
              style={{
                backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Top 2-column grid on desktop, single-column stacked on mobile */}
      {(showAnchors || showXActive) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* SECTION 1: ANCHORS */}
          {showAnchors && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Anchor className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <h2 className="font-display text-base font-semibold">Anchors</h2>
                  <span
                    className="text-xs font-mono tabular-nums"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {anchors.length}
                  </span>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Scheduled commitments
                </span>
              </div>

              <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {anchors.length === 0 ? (
                  <p className="py-5 text-sm" style={{ color: 'var(--text-muted)' }}>
                    No active anchors. Use the bottom bar toggled to Anchor (try "at 10am").
                  </p>
                ) : (
                  anchors.map((item) => renderTaskRow(item))
                )}
              </div>
            </section>
          )}

          {/* SECTION 2: X-ACTIVE */}
          {showXActive && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <h2 className="font-display text-base font-semibold">{xActiveLimit}-Active</h2>
                  <span
                    className="text-xs font-mono tabular-nums"
                    style={{ color: isXActiveFull ? 'var(--warning)' : 'var(--text-muted)' }}
                  >
                    {xActive.length} / {xActiveLimit}
                  </span>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {isXActiveFull ? 'Queue full' : 'Unscheduled focus'}
                </span>
              </div>

              <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {xActive.length === 0 ? (
                  <p className="py-5 text-sm" style={{ color: 'var(--text-muted)' }}>
                    Queue is open. Keep up to {xActiveLimit} unscheduled tasks here.
                  </p>
                ) : (
                  xActive.map((item) => renderTaskRow(item))
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* SECTION 3: COMPLETED (Date-grouped collapsible sections) */}
      {showCompleted && (
        <section
          className={`${showAnchors || showXActive ? 'pt-6 border-t' : ''} space-y-4`}
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--success)' }} />
              <h2 className="font-display text-base font-semibold">Completed</h2>
              <span
                className="text-xs font-mono tabular-nums"
                style={{ color: 'var(--text-muted)' }}
              >
                {totalCompletedCount} total
              </span>
            </div>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Grouped by completion date
            </span>
          </div>

          {completedGroups.length === 0 ? (
            <p className="py-6 text-sm" style={{ color: 'var(--text-muted)' }}>
              Finished tasks from Anchors, {xActiveLimit}-Active, and recorded completions appear
              here grouped by date.
            </p>
          ) : (
            <div className="space-y-3">
              {completedGroups.map(({ dateKey, items }) => {
                const expanded = isDateExpanded(dateKey);
                return (
                  <div
                    key={dateKey}
                    className="rounded-xl border overflow-hidden"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleDateGroup(dateKey)}
                      aria-expanded={expanded}
                      className="w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors hover:bg-[var(--bg-surface-subtle)]"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {expanded ? (
                          <ChevronDown
                            className="w-4 h-4 shrink-0"
                            style={{ color: 'var(--text-muted)' }}
                          />
                        ) : (
                          <ChevronRight
                            className="w-4 h-4 shrink-0"
                            style={{ color: 'var(--text-muted)' }}
                          />
                        )}
                        <span className="text-sm font-semibold truncate">
                          {formatRelativeDayLabel(dateKey)}
                        </span>
                        <span
                          className="text-xs font-mono tabular-nums hidden sm:inline"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {dateKey}
                        </span>
                      </span>

                      <span
                        className="text-xs font-mono tabular-nums shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {items.length} {items.length === 1 ? 'item' : 'items'}
                      </span>
                    </button>

                    {expanded && (
                      <div
                        className="px-3.5 pb-2 pt-1 border-t divide-y"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        {items.map((item) => {
                          const bucketText =
                            item.focusBucket === 'anchor'
                              ? 'Anchor'
                              : item.focusBucket === 'x-active'
                              ? `${xActiveLimit}-Active`
                              : 'Recorded';
                          return renderTaskRow(item, bucketText);
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Persistent Floating Centered Bottom Input Bar with Subtle Canvas Fade */}
      <div
        className="fixed left-0 lg:left-60 right-0 bottom-15 lg:bottom-0 z-20 pointer-events-none px-3 sm:px-6 pt-8 pb-3 sm:pb-5"
        style={{
          background:
            'linear-gradient(to top, var(--bg-canvas) 58%, color-mix(in srgb, var(--bg-canvas) 82%, transparent) 80%, transparent 100%)',
        }}
      >
        <div className="max-w-3xl mx-auto pointer-events-auto">
          <NlpInputBar
            placeholder={activeMeta.placeholder}
            disabled={inputDisabled}
            disabledHint={`${xActiveLimit}-Active full (${xActive.length}/${xActiveLimit}) — click toggle or press Tab to switch`}
            onSubmit={(text) => addFocusItem(inputBucket, text)}
            baseDateKey={todayKey}
            submitLabel={activeMeta.submitLabel}
            previewPosition="top"
            elevated
            onEmptyTab={cycleBucket}
            leadingSlot={
              <button
                type="button"
                onClick={cycleBucket}
                title={`Target: ${activeMeta.label} — click to cycle (Tab when empty, or Alt+1/2/3)`}
                className="h-9 px-2.5 sm:px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors active:scale-95"
                style={{
                  backgroundColor: 'var(--accent-soft)',
                  color: 'var(--accent)',
                }}
              >
                <ActiveBucketIcon className="w-3.5 h-3.5" />
                <span className="whitespace-nowrap">{activeMeta.shortLabel}</span>
                <Repeat className="w-3 h-3 opacity-70" />
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
};
