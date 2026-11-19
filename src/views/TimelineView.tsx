import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Inbox,
  Pencil,
  Repeat,
  Trash2,
} from 'lucide-react';
import { ENTRY_TYPE_META, EntryTypeIcon } from '../components/IconLibrary';
import { NlpInputBar } from '../components/NlpInputBar';
import { useWorkspace } from '../context/WorkspaceContext';
import { Entry, EntryType } from '../types';
import {
  addDaysToKey,
  formatLongDate,
  formatRelativeDayLabel,
  formatTime,
  getCalendarMatrix,
  getEffectiveSortIso,
  getEffectiveSortMs,
  getEntryDayKey,
  getTodayKey,
  parseLocalDateKey,
} from '../utils/date';

const ENTRY_CYCLE: EntryType[] = ['log', 'task', 'event', 'note', 'timeblock'];

interface ContextMenuState {
  entry: Entry;
  x: number;
  y: number;
  mobileSheet: boolean;
}

interface TimelineViewProps {
  onInspectEntry: (entryId: string) => void;
}

function hasMeaningfulHtml(html: string): boolean {
  if (!html) return false;
  const plain = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 0;
}

function sanitizePreviewHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

const TimelineDetailsPreview: React.FC<{ html: string }> = ({ html }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [overflows, setOverflows] = useState(false);

  const safeHtml = useMemo(() => sanitizePreviewHtml(html), [html]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      // ~78px corresponds to ~3-4 lines at 13px / 1.5 line-height
      setOverflows(el.scrollHeight > 80);
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [safeHtml]);

  return (
    <div
      ref={containerRef}
      className={`mt-2 kanso-timeline-preview ${
        overflows ? 'kanso-timeline-preview-faded' : ''
      }`}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
};

export const TimelineView: React.FC<TimelineViewProps> = ({ onInspectEntry }) => {
  const {
    workspace,
    addTimelineEntry,
    toggleEntryCompleted,
    updateEntry,
    deleteEntry,
    duplicateEntry,
    moveEntryToDate,
  } = useWorkspace();

  const [selectedDateKey, setSelectedDateKey] = useState<string>(getTodayKey());
  const [activeType, setActiveType] = useState<EntryType>('log');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = parseLocalDateKey(getTodayKey());
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const calendarPopoverRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const { timeFormat } = workspace.settings;
  const todayKey = getTodayKey();

  // Only project Focus tasks onto Timeline once scheduled (Anchors) or completed (Anchor / X-Active / Completed).
  // Open unscheduled X-Active items stay in Focus until crossed off, then appear crossed-out at completedAt.
  const isVisibleOnTimeline = (entry: Entry): boolean => {
    if (entry.focusBucket === 'x-active' && !entry.completed && !entry.scheduledAt) {
      return false;
    }
    return true;
  };

  // Entries on the selected day sorted strictly by: completedAt > scheduledAt > createdAt
  const dayEntries = useMemo(() => {
    return workspace.entries
      .filter((entry) => isVisibleOnTimeline(entry) && getEntryDayKey(entry) === selectedDateKey)
      .sort((a, b) => getEffectiveSortMs(a) - getEffectiveSortMs(b));
  }, [workspace.entries, selectedDateKey]);

  // Days with visible entries for mini calendar indicator
  const daysWithEntries = useMemo(() => {
    const set = new Set<string>();
    for (const e of workspace.entries) {
      if (isVisibleOnTimeline(e)) {
        set.add(getEntryDayKey(e));
      }
    }
    return set;
  }, [workspace.entries]);

  // Keyboard shortcuts Alt+1..5 for entry type & Escape to close overlays
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setCalendarOpen(false);
      }
      if (e.altKey) {
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < ENTRY_CYCLE.length) {
          e.preventDefault();
          setActiveType(ENTRY_CYCLE[idx]);
        }
      }
    };
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
      if (calendarPopoverRef.current && !calendarPopoverRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  const cycleEntryType = () => {
    const idx = ENTRY_CYCLE.indexOf(activeType);
    setActiveType(ENTRY_CYCLE[(idx + 1) % ENTRY_CYCLE.length]);
  };

  const openContextMenuAt = (
    entry: Entry,
    clientX: number,
    clientY: number,
    mobileSheet: boolean
  ) => {
    const menuWidth = 252;
    const menuHeight = 320;
    const x = Math.min(Math.max(12, clientX), window.innerWidth - menuWidth - 12);
    const y = Math.min(Math.max(12, clientY), window.innerHeight - menuHeight - 12);
    setContextMenu({ entry, x, y, mobileSheet });
  };

  // Left-click opens details editor directly!
  const handleRowClick = (entry: Entry) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    setContextMenu(null);
    onInspectEntry(entry.id);
  };

  // Desktop right-click opens anchored context menu
  const handleRowContextMenu = (entry: Entry, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenuAt(entry, e.clientX, e.clientY, window.innerWidth < 640);
  };

  // Mobile tap-and-hold (420ms) opens native slide-up bottom sheet context menu
  const handleRowTouchStart = (entry: Entry, e: React.TouchEvent) => {
    longPressTriggeredRef.current = false;
    const touch = e.touches[0];
    const tx = touch.clientX;
    const ty = touch.clientY;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      openContextMenuAt(entry, tx, ty, true);
    }, 420);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleSpineIconClick = (entry: Entry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.type === 'task' || entry.type === 'timeblock') {
      toggleEntryCompleted(entry.id);
    } else {
      onInspectEntry(entry.id);
    }
  };

  const navigateDay = (delta: number) => {
    const next = addDaysToKey(selectedDateKey, delta);
    setSelectedDateKey(next);
    const d = parseLocalDateKey(next);
    setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

  const calendarCells = useMemo(
    () => getCalendarMatrix(calendarMonth.year, calendarMonth.month),
    [calendarMonth]
  );

  const calendarMonthLabel = new Date(
    calendarMonth.year,
    calendarMonth.month,
    1
  ).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const renderContextMenuActions = (entry: Entry, isSheet: boolean) => (
    <>
      <div
        className={`px-4 ${isSheet ? 'py-3' : 'py-2'} border-b mb-1`}
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div
          className={`${isSheet ? 'text-sm' : 'text-xs'} font-semibold truncate`}
          style={{ color: 'var(--text-primary)' }}
        >
          {entry.title}
        </div>
        <div className="text-[11px] font-mono tabular-nums mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {ENTRY_TYPE_META[entry.type].label} ·{' '}
          {formatTime(getEffectiveSortIso(entry), timeFormat)}
        </div>
      </div>

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          const id = entry.id;
          setContextMenu(null);
          onInspectEntry(id);
        }}
        className={`w-full px-4 ${isSheet ? 'min-h-[44px] text-sm' : 'py-2 text-xs'} text-left font-medium flex items-center gap-3 transition-colors hover:bg-[var(--bg-surface-subtle)]`}
        style={{ color: 'var(--text-primary)' }}
      >
        <Pencil className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
        <span>Edit details &amp; timestamps</span>
      </button>

      {(entry.type === 'task' || entry.type === 'timeblock') && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            toggleEntryCompleted(entry.id);
            setContextMenu(null);
          }}
          className={`w-full px-4 ${isSheet ? 'min-h-[44px] text-sm' : 'py-2 text-xs'} text-left font-medium flex items-center gap-3 transition-colors hover:bg-[var(--bg-surface-subtle)]`}
          style={{ color: 'var(--text-primary)' }}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--success)' }} />
          <span>{entry.completed ? 'Mark incomplete' : 'Mark complete'}</span>
        </button>
      )}

      {/* Quick Convert Type */}
      <div
        className="px-4 py-2.5 border-y my-1"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
          Convert type
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ENTRY_CYCLE.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                updateEntry(entry.id, { type: t });
                setContextMenu(null);
              }}
              className={`${isSheet ? 'px-3 py-1.5 text-xs' : 'px-2 py-1 text-[11px]'} rounded-lg font-medium transition-colors`}
              style={{
                backgroundColor:
                  entry.type === t ? 'var(--accent-soft)' : 'var(--bg-surface-subtle)',
                color: entry.type === t ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {ENTRY_TYPE_META[t].shortLabel}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          moveEntryToDate(entry.id, addDaysToKey(selectedDateKey, -1));
          setContextMenu(null);
        }}
        className={`w-full px-4 ${isSheet ? 'min-h-[44px] text-sm' : 'py-2 text-xs'} text-left flex items-center gap-3 transition-colors hover:bg-[var(--bg-surface-subtle)]`}
        style={{ color: 'var(--text-secondary)' }}
      >
        <ChevronLeft className="w-4 h-4 shrink-0" />
        <span>Move to previous day</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          moveEntryToDate(entry.id, addDaysToKey(selectedDateKey, 1));
          setContextMenu(null);
        }}
        className={`w-full px-4 ${isSheet ? 'min-h-[44px] text-sm' : 'py-2 text-xs'} text-left flex items-center gap-3 transition-colors hover:bg-[var(--bg-surface-subtle)]`}
        style={{ color: 'var(--text-secondary)' }}
      >
        <ChevronRight className="w-4 h-4 shrink-0" />
        <span>Move to next day</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          duplicateEntry(entry.id);
          setContextMenu(null);
        }}
        className={`w-full px-4 ${isSheet ? 'min-h-[44px] text-sm' : 'py-2 text-xs'} text-left flex items-center gap-3 transition-colors hover:bg-[var(--bg-surface-subtle)]`}
        style={{ color: 'var(--text-secondary)' }}
      >
        <Copy className="w-4 h-4 shrink-0" />
        <span>Duplicate entry</span>
      </button>

      <div className="my-1 border-t" style={{ borderColor: 'var(--border-subtle)' }} />

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          deleteEntry(entry.id);
          setContextMenu(null);
        }}
        className={`w-full px-4 ${isSheet ? 'min-h-[44px] text-sm' : 'py-2 text-xs'} text-left font-medium flex items-center gap-3 transition-colors hover:bg-[var(--bg-surface-subtle)]`}
        style={{ color: 'var(--danger)' }}
      >
        <Trash2 className="w-4 h-4 shrink-0" />
        <span>Delete entry</span>
      </button>
    </>
  );

  return (
    <div className="relative max-w-4xl mx-auto px-4 sm:px-8 pt-5 sm:pt-9 pb-40 lg:pb-32 space-y-5 sm:space-y-6">
      {/* Header & Day Selector */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pb-4 sm:pb-5 border-b">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Timeline</h1>
          <p className="mt-1 text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
            {formatLongDate(selectedDateKey)}
          </p>
        </div>

        {/* Date Controls: Chevron Left + Calendar Selector + Chevron Right */}
        <div className="relative flex items-center gap-1.5 self-start sm:self-auto" ref={calendarPopoverRef}>
          {selectedDateKey !== todayKey && (
            <button
              type="button"
              onClick={() => {
                setSelectedDateKey(todayKey);
                const d = parseLocalDateKey(todayKey);
                setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() });
              }}
              className="h-10 sm:h-9 px-3 rounded-xl sm:rounded-lg border text-xs font-medium mr-0.5 whitespace-nowrap"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--accent)',
              }}
            >
              Today
            </button>
          )}

          <button
            type="button"
            onClick={() => navigateDay(-1)}
            className="h-10 w-10 sm:h-9 sm:w-9 flex items-center justify-center rounded-xl sm:rounded-lg border transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            aria-label="Previous day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setCalendarOpen((prev) => !prev)}
            className="h-10 sm:h-9 px-3.5 rounded-xl sm:rounded-lg border text-xs font-medium inline-flex items-center gap-2 whitespace-nowrap transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: calendarOpen ? 'var(--accent)' : 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            aria-expanded={calendarOpen}
          >
            <CalendarIcon className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
            <span className="font-mono tabular-nums">{formatRelativeDayLabel(selectedDateKey)}</span>
          </button>

          <button
            type="button"
            onClick={() => navigateDay(1)}
            className="h-10 w-10 sm:h-9 sm:w-9 flex items-center justify-center rounded-xl sm:rounded-lg border transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            aria-label="Next day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Mini Calendar Popover */}
          {calendarOpen && (
            <div
              className="absolute left-0 sm:left-auto sm:right-0 top-12 z-40 w-72 rounded-xl border p-3.5"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                boxShadow: 'var(--shadow-popover)',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() =>
                    setCalendarMonth((m) =>
                      m.month === 0 ? { year: m.year - 1, month: 11 } : { ...m, month: m.month - 1 }
                    )
                  }
                  className="h-8 w-8 flex items-center justify-center rounded-md"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold font-display">{calendarMonthLabel}</span>
                <button
                  type="button"
                  onClick={() =>
                    setCalendarMonth((m) =>
                      m.month === 11 ? { year: m.year + 1, month: 0 } : { ...m, month: m.month + 1 }
                    )
                  }
                  className="h-8 w-8 flex items-center justify-center rounded-md"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div
                className="grid grid-cols-7 gap-1 text-center text-[11px] mb-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <div key={i} className="py-1">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((key, idx) => {
                  if (!key) return <div key={idx} />;
                  const isSelected = key === selectedDateKey;
                  const isToday = key === todayKey;
                  const hasItems = daysWithEntries.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSelectedDateKey(key);
                        setCalendarOpen(false);
                      }}
                      className="h-8 rounded-md text-xs font-mono tabular-nums flex flex-col items-center justify-center transition-colors relative"
                      style={{
                        backgroundColor: isSelected
                          ? 'var(--accent)'
                          : isToday
                          ? 'var(--accent-soft)'
                          : 'transparent',
                        color: isSelected
                          ? 'var(--accent-fg)'
                          : isToday
                          ? 'var(--accent)'
                          : 'var(--text-primary)',
                      }}
                    >
                      <span>{Number(key.split('-')[2])}</span>
                      {hasItems && !isSelected && (
                        <span
                          className="w-1 h-1 rounded-full absolute bottom-1"
                          style={{ backgroundColor: 'var(--accent)' }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Spine Timeline Flow — Continuous Spine Running Through Exact Center of Every Icon Button */}
      <div className="pt-1">
        {dayEntries.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Nothing on the spine for {formatRelativeDayLabel(selectedDateKey)}.
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Capture a log, task, event, note, or timeblock using the bar below — try "22/11 at
              4:30pm" or "next week".
            </p>
          </div>
        ) : (
          <ul role="list" className="select-none">
            {dayEntries.map((entry, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === dayEntries.length - 1;
              const primaryIso = getEffectiveSortIso(entry);
              const primaryTime = formatTime(primaryIso, timeFormat);
              const createdTime = formatTime(entry.createdAt, timeFormat);
              const scheduledTime = entry.scheduledAt
                ? formatTime(entry.scheduledAt, timeFormat)
                : null;
              const endTime = entry.endAt ? formatTime(entry.endAt, timeFormat) : null;
              const completedTime = entry.completedAt
                ? formatTime(entry.completedAt, timeFormat)
                : null;
              const hasDetails = hasMeaningfulHtml(entry.content);

              return (
                <li
                  key={entry.id}
                  onClick={() => handleRowClick(entry)}
                  onContextMenu={(e) => handleRowContextMenu(entry, e)}
                  onTouchStart={(e) => handleRowTouchStart(entry, e)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                  className="group relative flex items-stretch rounded-xl cursor-pointer transition-colors px-1.5 sm:px-2 -mx-1.5 sm:-mx-2"
                  style={{
                    backgroundColor:
                      contextMenu?.entry.id === entry.id
                        ? 'var(--bg-surface-subtle)'
                        : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (contextMenu?.entry.id !== entry.id) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-surface-subtle)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (contextMenu?.entry.id !== entry.id) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  {/* Track 1: Left Timestamp Column */}
                  <div className="w-[62px] sm:w-[84px] shrink-0 text-right pr-2.5 sm:pr-3 pt-4 pb-3">
                    <time
                      className="block text-[11px] sm:text-xs font-mono tabular-nums font-medium leading-none"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {primaryTime}
                    </time>
                    {endTime && (
                      <span
                        className="block mt-1 text-[10px] sm:text-[11px] font-mono tabular-nums leading-none"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {endTime}
                      </span>
                    )}
                  </div>

                  {/* Track 2: Dedicated Spine Axis Column (line passes strictly through center of icon button) */}
                  <div className="relative w-9 shrink-0 flex flex-col items-center pt-2.5 pb-2.5">
                    {/* Vertical Spine Segment Above Icon */}
                    {!isFirst && (
                      <span
                        className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-[26px] pointer-events-none"
                        style={{ backgroundColor: 'var(--spine-line)' }}
                        aria-hidden="true"
                      />
                    )}
                    {/* Vertical Spine Segment Below Icon */}
                    {!isLast && (
                      <span
                        className="absolute top-[26px] bottom-0 left-1/2 -translate-x-1/2 w-px pointer-events-none"
                        style={{ backgroundColor: 'var(--spine-line)' }}
                        aria-hidden="true"
                      />
                    )}

                    {/* Centered Interactive Icon Button */}
                    <button
                      type="button"
                      onClick={(e) => handleSpineIconClick(entry, e)}
                      className="relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-90"
                      style={{
                        backgroundColor: 'var(--bg-canvas)',
                        color:
                          entry.completed && entry.type === 'task'
                            ? 'var(--success)'
                            : entry.type === 'log'
                            ? 'var(--text-muted)'
                            : 'var(--accent)',
                      }}
                      title={
                        entry.type === 'task'
                          ? entry.completed
                            ? 'Mark incomplete'
                            : 'Mark complete'
                          : 'Open details & timestamps'
                      }
                      aria-label={`Interact with ${entry.title}`}
                    >
                      <EntryTypeIcon
                        type={entry.type}
                        completed={entry.completed}
                        className="w-4 h-4"
                      />
                    </button>
                  </div>

                  {/* Track 3: Entry Content (Right side intentionally open & clean) */}
                  <div className="flex-1 min-w-0 pl-2.5 sm:pl-3.5 pr-4 sm:pr-14 py-3">
                    <div
                      className={`text-sm font-medium leading-snug ${
                        entry.completed && entry.type === 'task' ? 'line-through' : ''
                      }`}
                      style={{
                        color:
                          entry.completed && entry.type === 'task'
                            ? 'var(--text-muted)'
                            : 'var(--text-primary)',
                      }}
                    >
                      {entry.title}
                    </div>

                    {/* Non-redundant Timestamp Badges (<Inbox> created • <Calendar> scheduled • <Check> completed) + location & tags */}
                    <div
                      className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span
                        className="inline-flex items-center gap-1 font-mono tabular-nums"
                        title="Created at"
                      >
                        <Inbox className="w-3 h-3 shrink-0" />
                        <span>{createdTime}</span>
                      </span>

                      {scheduledTime && (
                        <>
                          <span aria-hidden="true">•</span>
                          <span
                            className="inline-flex items-center gap-1 font-mono tabular-nums"
                            title="Scheduled time"
                          >
                            <CalendarIcon className="w-3 h-3 shrink-0" />
                            <span>
                              {scheduledTime}
                              {endTime ? `–${endTime}` : ''}
                            </span>
                          </span>
                        </>
                      )}

                      {completedTime && (
                        <>
                          <span aria-hidden="true">•</span>
                          <span
                            className="inline-flex items-center gap-1 font-mono tabular-nums"
                            style={{ color: 'var(--success)' }}
                            title="Completed at"
                          >
                            <Check className="w-3 h-3 shrink-0" />
                            <span>{completedTime}</span>
                          </span>
                        </>
                      )}

                      {entry.location && (
                        <>
                          <span aria-hidden="true">•</span>
                          <span className="truncate max-w-[180px]">{entry.location}</span>
                        </>
                      )}

                      {entry.tags.length > 0 && (
                        <>
                          <span aria-hidden="true">•</span>
                          <span>{entry.tags.map((t) => `#${t}`).join(' ')}</span>
                        </>
                      )}
                    </div>

                    {/* Faded Rich Details Preview Underneath Metadata */}
                    {hasDetails && <TimelineDetailsPreview html={entry.content} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

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
            placeholder={ENTRY_TYPE_META[activeType].placeholder}
            baseDateKey={selectedDateKey}
            submitLabel={`Add ${ENTRY_TYPE_META[activeType].label}`}
            previewPosition="top"
            elevated
            onEmptyTab={cycleEntryType}
            onSubmit={(rawText) => {
              const created = addTimelineEntry(activeType, rawText, selectedDateKey);
              return Boolean(created);
            }}
            leadingSlot={
              <button
                type="button"
                onClick={cycleEntryType}
                title={`Type: ${ENTRY_TYPE_META[activeType].label} — click to cycle (Tab when empty, or Alt+1..5)`}
                className="h-9 px-2.5 sm:px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors active:scale-95"
                style={{
                  backgroundColor: 'var(--accent-soft)',
                  color: 'var(--accent)',
                }}
              >
                <EntryTypeIcon type={activeType} className="w-3.5 h-3.5" />
                <span className="whitespace-nowrap">{ENTRY_TYPE_META[activeType].shortLabel}</span>
                <Repeat className="w-3 h-3 opacity-70" />
              </button>
            }
          />
        </div>
      </div>

      {/* Desktop Right-Click Floating Context Menu / Mobile Tap-and-Hold Slide-Up Bottom Sheet */}
      {contextMenu &&
        (contextMenu.mobileSheet ? (
          <div
            className="fixed inset-0 z-50 flex items-end"
            role="dialog"
            aria-modal="true"
            aria-label="Entry actions"
          >
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setContextMenu(null)}
              aria-hidden="true"
            />
            <div
              ref={menuRef}
              role="menu"
              className="relative z-10 w-full rounded-t-2xl border-t pb-6 pt-2 overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                boxShadow: 'var(--shadow-popover)',
              }}
            >
              <div className="flex justify-center pb-2">
                <span
                  className="w-10 h-1 rounded-full"
                  style={{ backgroundColor: 'var(--border-strong)' }}
                  aria-hidden="true"
                />
              </div>
              {renderContextMenuActions(contextMenu.entry, true)}
            </div>
          </div>
        ) : (
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-50 w-64 rounded-xl border py-1.5"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              boxShadow: 'var(--shadow-popover)',
            }}
          >
            {renderContextMenuActions(contextMenu.entry, false)}
          </div>
        ))}
    </div>
  );
};
