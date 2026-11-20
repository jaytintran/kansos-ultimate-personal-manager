import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  Flame,
  MoreVertical,
  Search,
  Timer,
  Trophy,
  X,
} from 'lucide-react';
import { InlineTitleEdit } from '../components/InlineTitleEdit';
import { NlpInputBar } from '../components/NlpInputBar';
import { RichContent } from '../components/RichContent';
import { TimestampFieldFocus } from '../components/TimestampsModal';
import { useWorkspace } from '../context/WorkspaceContext';
import { ContextMenuRecord, DetailSheetTarget, Entry, EntryType } from '../types';
import {
  addDaysToKey,
  formatCompactDayHeading,
  formatDaySlashMonth,
  formatTime,
  getCleanTitle,
  getEntryDayKey,
  getEntrySortTime,
  getTodayKey,
  isVisibleOnTimeline,
  stripHtmlToText,
} from '../utils/date';

type TimelineFilter = 'all' | 'task' | 'log' | 'note' | 'event' | 'timeblock' | 'habit';

const FILTER_CHIPS: { id: TimelineFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'task', label: 'Task' },
  { id: 'log', label: 'Log' },
  { id: 'note', label: 'Note' },
  { id: 'event', label: 'Event' },
  { id: 'timeblock', label: 'Blocks' },
  { id: 'habit', label: 'Habit' },
];

function formatDurationLabel(startIso?: string | null, endIso?: string | null): string {
  if (!startIso || !endIso) return '';
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

interface TimelineViewProps {
  onOpenDetail: (target: DetailSheetTarget) => void;
  onOpenContextMenu: (record: ContextMenuRecord, e: React.MouseEvent) => void;
  onOpenTimestamps: (entryId: string, focus?: TimestampFieldFocus) => void;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  onOpenDetail,
  onOpenContextMenu,
  onOpenTimestamps,
}) => {
  const {
    workspace,
    addTimelineEntry,
    updateEntry,
    toggleEntryCompleted,
    moveEntryToDate,
  } = useWorkspace();

  const todayKey = getTodayKey();
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TimelineFilter>('all');
  const [composerType, setComposerType] = useState<EntryType>('task');
  const [carryOverCollapsed, setCarryOverCollapsed] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const timeFormat = workspace.settings.timeFormat;
  const displayMode = workspace.settings.timelineDisplayMode || 'default';

  // Keyboard shortcuts: Cmd/Ctrl+K or '/' focuses search, Escape clears
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        e.preventDefault();
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const visibleEntries = useMemo(
    () => workspace.entries.filter((e) => isVisibleOnTimeline(e)),
    [workspace.entries]
  );

  const matchesTypeFilter = (entry: Entry): boolean => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'habit') return entry.source === 'habit' || Boolean(entry.habitId);
    if (typeFilter === 'log') return entry.type === 'log' && entry.source !== 'habit';
    return entry.type === typeFilter;
  };

  // Full-text search across all days
  const trimmedSearch = searchQuery.trim().toLowerCase();
  const searchGroups = useMemo(() => {
    if (!trimmedSearch) return null;
    const matches = visibleEntries.filter((entry) => {
      if (!matchesTypeFilter(entry)) return false;
      const hay = `${entry.title} ${stripHtmlToText(entry.content)} ${(entry.tags || []).join(
        ' '
      )}`.toLowerCase();
      return hay.includes(trimmedSearch);
    });
    const byDay = new Map<string, Entry[]>();
    for (const entry of matches) {
      const dayKey = getEntryDayKey(entry);
      const list = byDay.get(dayKey) || [];
      list.push(entry);
      byDay.set(dayKey, list);
    }
    return {
      total: matches.length,
      days: Array.from(byDay.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([dayKey, items]) => ({
          dayKey,
          items: items.sort((a, b) => getEntrySortTime(a) - getEntrySortTime(b)),
        })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedSearch, visibleEntries, typeFilter]);

  // Day entries for selectedDateKey
  const dayEntries = useMemo(() => {
    return visibleEntries
      .filter((e) => getEntryDayKey(e) === selectedDateKey && matchesTypeFilter(e))
      .sort((a, b) => getEntrySortTime(a) - getEntrySortTime(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEntries, selectedDateKey, typeFilter]);

  // Unfinished carry-over tasks from earlier days (shown on Today only)
  const carryOverTasks = useMemo(() => {
    if (selectedDateKey !== todayKey || trimmedSearch) return [];
    return visibleEntries
      .filter(
        (e) =>
          e.type === 'task' &&
          !e.completed &&
          getEntryDayKey(e) < todayKey
      )
      .sort((a, b) => getEntryDayKey(b).localeCompare(getEntryDayKey(a)));
  }, [visibleEntries, selectedDateKey, todayKey, trimmedSearch]);

  // Structure day entries so Time Blocks wrap entries occurring inside their [start, end] range
  const structuredDayItems = useMemo(() => {
    const blocks = dayEntries.filter((e) => e.type === 'timeblock' && e.scheduledAt && e.endAt);
    const nestedIds = new Set<string>();
    const blockChildren = new Map<string, Entry[]>();

    for (const block of blocks) {
      const start = new Date(block.scheduledAt!).getTime();
      const end = new Date(block.endAt!).getTime();
      const children: Entry[] = [];
      for (const candidate of dayEntries) {
        if (candidate.id === block.id || candidate.type === 'timeblock') continue;
        if (nestedIds.has(candidate.id)) continue;
        const t = getEntrySortTime(candidate);
        if (t >= start && t <= end) {
          children.push(candidate);
          nestedIds.add(candidate.id);
        }
      }
      blockChildren.set(block.id, children);
    }

    const topLevel = dayEntries.filter((e) => !nestedIds.has(e.id));
    return { topLevel, blockChildren };
  }, [dayEntries]);

  const openEntryDetail = (entry: Entry) => {
    const mode =
      entry.type === 'note'
        ? 'note'
        : entry.type === 'event'
        ? 'event'
        : entry.type === 'log'
        ? 'log'
        : 'task';
    onOpenDetail({ mode, id: entry.id });
  };

  /* Restored quiet Kanso circular spine node (compact 28px in default, 20px in compact/flat) */
  const renderSpineNode = (entry: Entry, nested = false) => {
    const isHabit = entry.source === 'habit' || Boolean(entry.habitId);
    const isCompact = displayMode === 'compact' || nested;
    const nodeBg = nested ? 'transparent' : 'var(--bg-canvas)';

    if (entry.type === 'task') {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleEntryCompleted(entry.id);
          }}
          className={`${
            isCompact ? 'w-5 h-5' : 'w-7 h-7'
          } rounded-full flex items-center justify-center shrink-0 transition-colors hover:text-[var(--accent)]`}
          style={{
            backgroundColor: nodeBg,
            color: entry.completed ? 'var(--success)' : 'var(--text-muted)',
          }}
          title={entry.completed ? 'Reopen task' : 'Complete task'}
          aria-label={entry.completed ? 'Reopen task' : 'Complete task'}
        >
          {entry.completed ? (
            <CheckCircle2 className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          ) : (
            <Circle className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          )}
        </button>
      );
    }

    if (isHabit) {
      return (
        <span
          className={`${
            isCompact ? 'w-5 h-5' : 'w-7 h-7 border'
          } rounded-full flex items-center justify-center shrink-0`}
          style={{
            backgroundColor: nodeBg,
            borderColor: 'var(--border-subtle)',
            color: 'var(--color-entity-amber)',
          }}
        >
          <Flame className={isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        </span>
      );
    }

    if (entry.type === 'event') {
      return (
        <span
          className={`${
            isCompact ? 'w-5 h-5' : 'w-7 h-7 border'
          } rounded-full flex items-center justify-center shrink-0`}
          style={{
            backgroundColor: nodeBg,
            borderColor: 'var(--border-subtle)',
            color: 'var(--color-entity-blue)',
          }}
        >
          <Calendar className={isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        </span>
      );
    }

    if (entry.type === 'note') {
      return (
        <span
          className={`${
            isCompact ? 'w-5 h-5' : 'w-7 h-7 border'
          } rounded-full flex items-center justify-center shrink-0`}
          style={{
            backgroundColor: nodeBg,
            borderColor: 'var(--border-subtle)',
            color: 'var(--color-entity-violet)',
          }}
        >
          <FileText className={isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        </span>
      );
    }

    // Log entry: quiet classic spine dot
    return (
      <span
        className={`${
          isCompact ? 'w-5 h-5' : 'w-7 h-7'
        } rounded-full flex items-center justify-center shrink-0`}
        style={{ backgroundColor: nodeBg }}
      >
        <span
          className={`${isCompact ? 'w-2 h-2' : 'w-2.5 h-2.5'} rounded-full ring-2`}
          style={{
            backgroundColor: 'var(--accent)',
            boxShadow: '0 0 0 2px var(--accent-soft)',
          }}
        />
      </span>
    );
  };

  /* Always-visible quiet quick action triggers: 1 unified Time button + context menu */
  const renderAlwaysVisibleActions = (entry: Entry) => (
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenTimestamps(
            entry.id,
            entry.scheduledAt ? 'scheduled' : entry.completedAt ? 'completed' : 'date'
          );
        }}
        className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
        style={{
          color: entry.scheduledAt
            ? 'var(--color-entity-blue)'
            : entry.completedAt
            ? 'var(--success)'
            : 'var(--text-muted)',
        }}
        title="Edit date & timestamps"
        aria-label="Edit date and timestamps"
      >
        <Clock className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenContextMenu({ kind: 'entry', entry }, e);
        }}
        className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
        style={{ color: 'var(--text-muted)' }}
        title="More actions"
        aria-label="More actions"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const renderEntryRow = (entry: Entry, nested = false) => {
    const isHabit = entry.source === 'habit' || Boolean(entry.habitId);
    const displayTitle = isHabit ? getCleanTitle(entry) : entry.title;
    const isCompletedTask = entry.type === 'task' && entry.completed;
    const allowInline = displayMode !== 'compact' && !isHabit;
    const hasRichPreview =
      displayMode === 'default' && Boolean(entry.content && stripHtmlToText(entry.content));

    const dateLabel = formatDaySlashMonth(getEntryDayKey(entry));
    const createdLabel = formatTime(entry.createdAt, timeFormat);
    const scheduledLabel = entry.scheduledAt ? formatTime(entry.scheduledAt, timeFormat) : null;
    const completedLabel = entry.completedAt ? formatTime(entry.completedAt, timeFormat) : null;

    return (
      <div
        key={entry.id}
        onClick={() => openEntryDetail(entry)}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenContextMenu({ kind: 'entry', entry }, e);
        }}
        className={`group relative flex items-start gap-2.5 sm:gap-3 cursor-pointer ${
          displayMode === 'compact' ? 'py-0.5' : nested ? 'py-1' : 'py-1.5'
        } ${
          displayMode === 'flat' && !nested ? 'border-b last:border-b-0' : ''
        }`}
        style={
          displayMode === 'flat' && !nested
            ? { borderColor: 'var(--border-subtle)' }
            : undefined
        }
      >
        {/* Compact Quiet Spine Node */}
        <div
          className={`relative z-10 shrink-0 ${
            displayMode === 'compact' || nested ? 'mt-1.5' : 'mt-1'
          }`}
        >
          {renderSpineNode(entry, nested)}
        </div>

        {/* Restored Borderless-on-Canvas Entry Body */}
        <div
          className={`flex-1 min-w-0 rounded-xl transition-colors ${
            nested
              ? 'px-2 py-1 hover:bg-[var(--bg-surface)]/75'
              : displayMode === 'compact'
              ? 'px-2 py-1 hover:bg-[var(--bg-surface-subtle)]/75'
              : 'px-2.5 py-1.5 hover:bg-[var(--bg-surface-subtle)]/75'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-3">
            {/* Title + Timestamps + Tags + Faded Rich Preview */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                {allowInline ? (
                  <InlineTitleEdit
                    value={displayTitle}
                    allowMobileEdit={false}
                    onCommit={(next) => updateEntry(entry.id, { title: next })}
                    className={`text-[14.5px] font-medium leading-snug ${
                      isCompletedTask ? 'line-through' : ''
                    }`}
                    style={{
                      color: isCompletedTask ? 'var(--text-muted)' : 'var(--text-primary)',
                    }}
                  />
                ) : (
                  <span
                    className={`text-sm font-medium leading-snug truncate ${
                      isCompletedTask ? 'line-through' : ''
                    }`}
                    style={{
                      color: isCompletedTask ? 'var(--text-muted)' : 'var(--text-primary)',
                    }}
                  >
                    {displayTitle}
                  </span>
                )}

                {entry.isAchievement && (
                  <Trophy
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: 'var(--warning)' }}
                  />
                )}
              </div>

              {/* Always-Visible Clickable Monospace Date & Timestamps + Inline Tags */}
              <div
                className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-mono tabular-nums"
                style={{ color: 'var(--text-muted)' }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenTimestamps(entry.id, 'date');
                  }}
                  className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] hover:underline cursor-pointer"
                  title="Edit date"
                >
                  <Calendar className="w-3 h-3 opacity-75" />
                  <span>{dateLabel}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenTimestamps(entry.id, 'created');
                  }}
                  className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] hover:underline cursor-pointer"
                  title="Edit created time"
                >
                  <span>{createdLabel}</span>
                </button>

                {scheduledLabel && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenTimestamps(entry.id, 'scheduled');
                    }}
                    className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                    style={{ color: 'var(--color-entity-blue)' }}
                    title="Edit scheduled time"
                  >
                    <CalendarClock className="w-3 h-3" />
                    <span>{scheduledLabel}</span>
                  </button>
                )}

                {completedLabel && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenTimestamps(entry.id, 'completed');
                    }}
                    className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                    style={{ color: 'var(--success)' }}
                    title="Edit completed time"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{completedLabel}</span>
                  </button>
                )}

                <span className="uppercase tracking-wider opacity-75 text-[10px]">
                  {isHabit ? 'Habit' : entry.type}
                </span>

                {entry.tags.length > 0 && (
                  <span className="opacity-85">
                    {entry.tags.map((t) => `#${t}`).join(' ')}
                  </span>
                )}
              </div>

              {/* Restored Smooth Alpha-Faded Rich Details Preview */}
              {hasRichPreview && (
                <div className="mt-1.5">
                  <RichContent
                    html={entry.content}
                    className="kanso-timeline-preview kanso-timeline-preview-faded"
                  />
                </div>
              )}
            </div>

            {/* Always-Visible Quick Action Triggers */}
            <div className="flex items-center justify-end sm:pt-0.5">
              {renderAlwaysVisibleActions(entry)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* Soft-Tinted Vertical Band Wrapping Nested Time Block Items */
  const renderTimeBlock = (block: Entry, children: Entry[]) => {
    const startLabel = block.scheduledAt ? formatTime(block.scheduledAt, timeFormat) : '';
    const endLabel = block.endAt ? formatTime(block.endAt, timeFormat) : '';
    const duration = formatDurationLabel(block.scheduledAt, block.endAt);

    return (
      <div
        key={block.id}
        className={`relative z-10 my-2.5 ${
          displayMode === 'default' ? 'ml-3.5' : displayMode === 'compact' ? 'ml-2.5' : ''
        }`}
      >
        <div
          className="rounded-xl border border-l-[3px] overflow-hidden"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent) 6%, var(--bg-surface))',
            borderColor: 'color-mix(in srgb, var(--accent) 20%, var(--border-subtle))',
            borderLeftColor: 'var(--accent)',
          }}
        >
          {/* Time Block Band Header */}
          <div
            onClick={() => openEntryDetail(block)}
            onContextMenu={(e) => {
              e.preventDefault();
              onOpenContextMenu({ kind: 'entry', entry: block }, e);
            }}
            className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[var(--accent-soft)]/50"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Timer className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
              <span
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {block.title}
              </span>
              <span
                className="text-[11px] font-mono tabular-nums shrink-0"
                style={{ color: 'var(--accent)' }}
              >
                {startLabel} – {endLabel}
              </span>
              {duration && (
                <span
                  className="text-[10.5px] font-mono tabular-nums shrink-0 opacity-80"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  ({duration})
                </span>
              )}
            </div>

            <div className="flex items-center gap-0.5 ml-auto shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTimestamps(block.id, 'scheduled');
                }}
                className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{ color: 'var(--accent)' }}
                title="Edit block time"
                aria-label="Edit block time"
              >
                <Clock className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenContextMenu({ kind: 'entry', entry: block }, e);
                }}
                className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{ color: 'var(--text-muted)' }}
                title="More actions"
                aria-label="More actions"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Nested Entries Inside Soft-Tinted Band */}
          <div
            className="relative px-3 pb-2.5 pt-0.5 border-t"
            style={{
              borderColor: 'color-mix(in srgb, var(--accent) 14%, transparent)',
            }}
          >
            {children.length > 0 ? (
              <div className="relative">
                <div
                  className="absolute left-[9.5px] top-3 bottom-3 w-px"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--accent) 28%, var(--spine-line))',
                  }}
                  aria-hidden="true"
                />
                {children.map((child) => renderEntryRow(child, true))}
              </div>
            ) : (
              <div
                className="py-2 pl-2 text-xs font-mono tabular-nums"
                style={{ color: 'var(--text-muted)' }}
              >
                Focused window · {startLabel} – {endLabel}
                {duration ? ` · ${duration}` : ''}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const spineLeftClass =
    displayMode === 'compact' ? 'left-[9.5px]' : 'left-[13.5px]';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-36 space-y-5">
      {/* Header: Date Scrubber, Search, Filter Chips */}
      <header
        className="space-y-3 pb-3 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between gap-2">
          {/* Unified Segmented Date Scrubber: ‹ | Today, 15/11 ▾ | › */}
          <div className="relative flex items-center gap-1.5 shrink-0">
            <div
              className="inline-flex items-center h-8 rounded-lg border overflow-hidden divide-x"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedDateKey((k) => addDaysToKey(k, -1))}
                className="h-full w-7 flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-subtle)]"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Previous day"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setCalendarOpen((v) => !v)}
                className="h-full px-2.5 text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:bg-[var(--bg-surface-subtle)]"
                style={{ color: 'var(--text-primary)' }}
              >
                <span>{formatCompactDayHeading(selectedDateKey)}</span>
                <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setSelectedDateKey((k) => addDaysToKey(k, 1))}
                className="h-full w-7 flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-subtle)]"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Next day"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {selectedDateKey !== todayKey && (
              <button
                type="button"
                onClick={() => setSelectedDateKey(todayKey)}
                className="h-8 px-2 rounded-lg text-[11px] font-medium shrink-0"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                Today
              </button>
            )}

            {/* Calendar Dropdown */}
            {calendarOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setCalendarOpen(false)} />
                <div
                  className="absolute left-0 top-10 z-30 p-3 rounded-xl border space-y-2 w-60"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-strong)',
                    boxShadow: 'var(--shadow-popover)',
                  }}
                >
                  <input
                    type="date"
                    value={selectedDateKey}
                    onChange={(e) => {
                      if (e.target.value) {
                        setSelectedDateKey(e.target.value);
                        setCalendarOpen(false);
                      }
                    }}
                    className="w-full h-8 px-2.5 rounded-lg border text-xs font-mono outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <div className="flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDateKey(addDaysToKey(todayKey, -1));
                        setCalendarOpen(false);
                      }}
                      className="flex-1 h-7 rounded-md border text-[11px]"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Yesterday
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDateKey(todayKey);
                        setCalendarOpen(false);
                      }}
                      className="flex-1 h-7 rounded-md text-[11px] font-semibold"
                      style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      Today
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Search Bar (Cmd+K / / to focus, Esc to clear) */}
          <div
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border flex-1 min-w-0 sm:flex-none sm:w-56 transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: searchQuery ? 'var(--accent)' : 'var(--border-subtle)',
            }}
          >
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search... (⌘K)"
              className="flex-1 min-w-0 bg-transparent text-xs outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="opacity-70 hover:opacity-100 shrink-0"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Desktop lg+ Type Filter Chips */}
        <div className="hidden lg:flex items-center gap-1">
          {FILTER_CHIPS.map((chip) => {
            const active = typeFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setTypeFilter(chip.id)}
                className="h-7 px-3 rounded-lg text-xs font-medium transition-colors"
                style={{
                  backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Unfinished Carry-Over Strip (Today only) */}
      {carryOverTasks.length > 0 && (
        <section
          className="rounded-xl border overflow-hidden"
          style={{
            backgroundColor: 'rgba(217, 119, 6, 0.06)',
            borderColor: 'rgba(217, 119, 6, 0.28)',
          }}
        >
          <button
            type="button"
            onClick={() => setCarryOverCollapsed((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold"
            style={{ color: 'var(--warning)' }}
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Unfinished carry-over ({carryOverTasks.length})</span>
            </span>
            {carryOverCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {!carryOverCollapsed && (
            <div
              className="divide-y border-t"
              style={{ borderColor: 'rgba(217, 119, 6, 0.18)' }}
            >
              {carryOverTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{task.title}</div>
                    <div className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      From {formatCompactDayHeading(getEntryDayKey(task))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveEntryToDate(task.id, todayKey)}
                      className="h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <ArrowRight className="w-3 h-3" />
                      <span>Move to today</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleEntryCompleted(task.id)}
                      className="h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1"
                      style={{ backgroundColor: 'var(--success)', color: '#fff' }}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Mark complete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Search Mode Results */}
      {searchGroups ? (
        <div className="space-y-6">
          <div
            className="px-3.5 py-2 rounded-xl border text-xs font-medium flex items-center justify-between"
            style={{
              backgroundColor: 'var(--accent-soft)',
              borderColor: 'var(--accent)',
              color: 'var(--accent)',
            }}
          >
            <span>
              {searchGroups.total} {searchGroups.total === 1 ? 'match' : 'matches'} for &ldquo;
              {searchQuery.trim()}&rdquo;
            </span>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="underline text-[11px]"
            >
              Clear
            </button>
          </div>

          {searchGroups.days.map(({ dayKey, items }) => (
            <div key={dayKey} className="space-y-1.5">
              <div
                className="text-xs font-semibold font-mono px-1"
                style={{ color: 'var(--text-muted)' }}
              >
                {formatCompactDayHeading(dayKey)}
              </div>
              <div className="relative">
                {displayMode !== 'flat' && items.length > 1 && (
                  <div
                    className={`absolute ${spineLeftClass} top-4 bottom-4 w-px`}
                    style={{ backgroundColor: 'var(--spine-line)' }}
                    aria-hidden="true"
                  />
                )}
                {items.map((item) => renderEntryRow(item))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Restored Quiet Chronological Day Spine */
        <section className="relative">
          {structuredDayItems.topLevel.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed py-14 px-4 text-center space-y-1.5"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
            >
              <p className="text-sm font-medium">Quiet day on the spine</p>
              <p className="text-xs">
                Use the NLP bar below to log work, schedule a task, or block time.
              </p>
            </div>
          ) : (
            <div className="relative">
              {displayMode !== 'flat' && structuredDayItems.topLevel.length > 1 && (
                <div
                  className={`absolute ${spineLeftClass} top-4 bottom-4 w-px`}
                  style={{ backgroundColor: 'var(--spine-line)' }}
                  aria-hidden="true"
                />
              )}
              {structuredDayItems.topLevel.map((entry) =>
                entry.type === 'timeblock'
                  ? renderTimeBlock(entry, structuredDayItems.blockChildren.get(entry.id) || [])
                  : renderEntryRow(entry)
              )}
            </div>
          )}
        </section>
      )}

      {/* Sticky Bottom NLP Input Bar with Segmented Type Switcher */}
      <div className="fixed bottom-16 lg:bottom-4 left-0 lg:left-60 right-0 z-20 px-4 sm:px-6 pointer-events-none">
        <div className="max-w-4xl mx-auto pointer-events-auto">
          <NlpInputBar
            placeholder='Add to timeline ("Deep Work from 1pm to 3pm", "/note Architecture ideas #sys")...'
            onSubmit={(raw) => {
              const created = addTimelineEntry(composerType, raw, selectedDateKey);
              return Boolean(created);
            }}
            baseDateKey={selectedDateKey}
            previewPosition="top"
            elevated
            typeSwitcher={{
              value: composerType,
              onChange: setComposerType,
            }}
          />
        </div>
      </div>
    </div>
  );
};
