import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  PlusCircle,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  addDaysToKey,
  addMinutesToIso,
  buildDateAtTime,
  formatCompactDayHeading,
  formatShortDate,
  formatTime,
  getEntryDayKey,
  getTodayKey,
  pad2,
  parseLocalDateKey,
  toLocalDateKey,
} from '../utils/date';
import { parseNlpInput } from '../utils/nlp';
import { DayTimeScrubber, ScrubberReferencePin } from './timestamps/DayTimeScrubber';
import { RadialClockPicker } from './timestamps/RadialClockPicker';

export type TimestampFieldFocus = 'date' | 'created' | 'scheduled' | 'completed' | null;
type ActiveTab = 'date' | 'created' | 'scheduled' | 'completed';
type TimeControlMode = 'scrubber' | 'clock';

interface TimestampsModalProps {
  entryId: string | null;
  initialFocus?: TimestampFieldFocus;
  onClose: () => void;
}

function isoToMinutes(iso: string | null | undefined, fallbackMinutes = 9 * 60): number {
  if (!iso) return fallbackMinutes;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallbackMinutes;
  return d.getHours() * 60 + d.getMinutes();
}

function formatMinutesReadout(totalMinutes: number, timeFormat: '12h' | '24h'): string {
  const clamped = Math.max(0, Math.min(1439, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  if (timeFormat === '24h') {
    return `${pad2(h)}:${pad2(m)}`;
  }
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${suffix}`;
}

export const TimestampsModal: React.FC<TimestampsModalProps> = ({
  entryId,
  initialFocus = null,
  onClose,
}) => {
  const { workspace, updateEntry, moveEntryToDate } = useWorkspace();
  const entry = entryId
    ? workspace.entries.find((e) => e.id === entryId && !e.deletedAt)
    : null;

  const [activeTab, setActiveTab] = useState<ActiveTab>(initialFocus || 'date');
  const [timeControlMode, setTimeControlMode] = useState<TimeControlMode>('scrubber');
  const [nlpDraft, setNlpDraft] = useState('');
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());

  // Local text drafts for direct hour/minute typing
  const [hourDraft, setHourDraft] = useState('');
  const [minuteDraft, setMinuteDraft] = useState('');
  const [isEditingDigits, setIsEditingDigits] = useState(false);

  const timeFormat = workspace.settings.timeFormat;
  const todayKey = getTodayKey();
  const anchorDayKey = entry ? getEntryDayKey(entry) : todayKey;

  // Sync tab & calendar month whenever modal opens for an entry/focus
  useEffect(() => {
    if (!entry) return;
    setActiveTab(initialFocus || 'date');
    setNlpDraft('');
    setCalendarMonth(parseLocalDateKey(getEntryDayKey(entry)));
  }, [entry?.id, initialFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close cleanly on Escape
  useEffect(() => {
    if (!entry) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [entry, onClose]);

  const showCompletedTab = Boolean(
    entry &&
      (entry.type === 'task' ||
        entry.type === 'log' ||
        entry.type === 'event' ||
        entry.completedAt)
  );

  // Current minutes for the active time tab
  const nowMinutes = (() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  })();

  const activeTimeIso = useMemo(() => {
    if (!entry) return null;
    if (activeTab === 'created') return entry.createdAt;
    if (activeTab === 'scheduled') return entry.scheduledAt;
    if (activeTab === 'completed') return entry.completedAt;
    return null;
  }, [entry, activeTab]);

  const activeMinutes = useMemo(() => {
    if (!entry || activeTab === 'date') return nowMinutes;
    if (activeTab === 'created') return isoToMinutes(entry.createdAt, nowMinutes);
    if (activeTab === 'scheduled') {
      return isoToMinutes(entry.scheduledAt, isoToMinutes(entry.createdAt, 9 * 60));
    }
    return isoToMinutes(entry.completedAt, nowMinutes);
  }, [entry, activeTab, nowMinutes]);

  // Keep typed digit boxes synced with activeMinutes whenever not actively editing
  useEffect(() => {
    if (isEditingDigits) return;
    const h24 = Math.floor(activeMinutes / 60);
    const m = activeMinutes % 60;
    const displayH = timeFormat === '24h' ? h24 : h24 % 12 === 0 ? 12 : h24 % 12;
    setHourDraft(pad2(displayH));
    setMinuteDraft(pad2(m));
  }, [activeMinutes, timeFormat, isEditingDigits, activeTab]);

  // Apply a time change in minutes (0..1439) to a specific time field
  const applyFieldMinutes = useCallback(
    (field: 'created' | 'scheduled' | 'completed', nextMinutes: number) => {
      if (!entry) return;
      const clamped = Math.max(0, Math.min(1439, Math.round(nextMinutes)));
      const h = Math.floor(clamped / 60);
      const m = clamped % 60;

      const baseDay =
        field === 'created'
          ? toLocalDateKey(entry.createdAt)
          : field === 'scheduled'
          ? entry.scheduledAt
            ? toLocalDateKey(entry.scheduledAt)
            : anchorDayKey
          : entry.completedAt
          ? toLocalDateKey(entry.completedAt)
          : anchorDayKey;

      const nextIso = buildDateAtTime(baseDay, h, m);

      if (field === 'created') {
        updateEntry(entry.id, { createdAt: nextIso });
      } else if (field === 'scheduled') {
        const patch: Partial<typeof entry> = { scheduledAt: nextIso };
        if (entry.endAt && entry.scheduledAt) {
          const dur = Math.max(
            15 * 60 * 1000,
            new Date(entry.endAt).getTime() - new Date(entry.scheduledAt).getTime()
          );
          patch.endAt = new Date(new Date(nextIso).getTime() + dur).toISOString();
        }
        updateEntry(entry.id, patch);
      } else {
        updateEntry(entry.id, { completed: true, completedAt: nextIso });
      }
    },
    [entry, anchorDayKey, updateEntry]
  );

  const applyDateKey = useCallback(
    (nextDayKey: string) => {
      if (!entry || !nextDayKey) return;
      moveEntryToDate(entry.id, nextDayKey);
      setCalendarMonth(parseLocalDateKey(nextDayKey));
    },
    [entry, moveEntryToDate]
  );

  const clearOptionalField = useCallback(
    (field: 'scheduled' | 'completed') => {
      if (!entry) return;
      if (field === 'scheduled') {
        updateEntry(entry.id, { scheduledAt: null, endAt: null });
      } else {
        updateEntry(entry.id, { completed: false, completedAt: null, isAchievement: false });
      }
    },
    [entry, updateEntry]
  );

  // Smart NLP parser with extra support for relative nudges ("+15m", "-1h", "now")
  const nlpIntent = useMemo(() => {
    const trimmed = nlpDraft.trim();
    if (!trimmed || !entry) return null;

    if (/^now$/i.test(trimmed)) {
      const targetField: 'created' | 'scheduled' | 'completed' =
        activeTab === 'date' ? 'scheduled' : activeTab;
      return {
        kind: 'now' as const,
        targetField,
        preview: `Set ${targetField} → ${formatMinutesReadout(nowMinutes, timeFormat)}`,
      };
    }

    const offsetMatch = trimmed.match(/^([+-])\s*(\d+)\s*(m|min|mins|h|hr|hrs)$/i);
    if (offsetMatch) {
      const sign = offsetMatch[1] === '-' ? -1 : 1;
      const qty = parseInt(offsetMatch[2], 10);
      const unit = offsetMatch[3].toLowerCase();
      const deltaMins = sign * (unit.startsWith('h') ? qty * 60 : qty);
      const targetField: 'created' | 'scheduled' | 'completed' =
        activeTab === 'date' ? 'scheduled' : activeTab;
      const baseMins =
        targetField === 'created'
          ? isoToMinutes(entry.createdAt, nowMinutes)
          : targetField === 'scheduled'
          ? isoToMinutes(entry.scheduledAt, nowMinutes)
          : isoToMinutes(entry.completedAt, nowMinutes);
      const nextMins = Math.max(0, Math.min(1439, baseMins + deltaMins));
      return {
        kind: 'offset' as const,
        targetField,
        nextMins,
        preview: `Shift ${targetField} (${offsetMatch[1]}${qty}${unit[0]}) → ${formatMinutesReadout(
          nextMins,
          timeFormat
        )}`,
      };
    }

    const parsed = parseNlpInput(trimmed, anchorDayKey, timeFormat);
    if (!parsed.hasExplicitDate && !parsed.hasExplicitTime) return null;

    const targetField: 'created' | 'scheduled' | 'completed' =
      activeTab === 'date' ? 'scheduled' : activeTab;

    const parts: string[] = [];
    if (parsed.hasExplicitDate && parsed.resolvedDateKey) {
      parts.push(`Date → ${formatCompactDayHeading(parsed.resolvedDateKey)}`);
    }
    if (parsed.hasExplicitTime && parsed.scheduledAt) {
      const label =
        targetField === 'created'
          ? 'Created'
          : targetField === 'completed'
          ? 'Completed'
          : 'Scheduled';
      const rangeStr = parsed.endAt
        ? `${formatTime(parsed.scheduledAt, timeFormat)}–${formatTime(parsed.endAt, timeFormat)}`
        : formatTime(parsed.scheduledAt, timeFormat);
      parts.push(`${label} → ${rangeStr}`);
    }

    return {
      kind: 'nlp' as const,
      targetField,
      parsed,
      preview: parts.join(' · '),
    };
  }, [nlpDraft, entry, activeTab, anchorDayKey, timeFormat, nowMinutes]);

  const handleApplyNlp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlpIntent || !entry) return;

    if (nlpIntent.kind === 'now') {
      applyFieldMinutes(nlpIntent.targetField, nowMinutes);
      setActiveTab(nlpIntent.targetField);
      setNlpDraft('');
      return;
    }

    if (nlpIntent.kind === 'offset') {
      applyFieldMinutes(nlpIntent.targetField, nlpIntent.nextMins);
      setActiveTab(nlpIntent.targetField);
      setNlpDraft('');
      return;
    }

    const { parsed, targetField } = nlpIntent;
    if (parsed.hasExplicitDate && parsed.resolvedDateKey) {
      moveEntryToDate(entry.id, parsed.resolvedDateKey);
      setCalendarMonth(parseLocalDateKey(parsed.resolvedDateKey));
    }

    if (parsed.hasExplicitTime && parsed.scheduledAt) {
      const d = new Date(parsed.scheduledAt);
      const mins = d.getHours() * 60 + d.getMinutes();
      const targetDay =
        parsed.hasExplicitDate && parsed.resolvedDateKey ? parsed.resolvedDateKey : anchorDayKey;
      const nextIso = buildDateAtTime(targetDay, Math.floor(mins / 60), mins % 60);

      if (targetField === 'created') {
        updateEntry(entry.id, { createdAt: nextIso });
      } else if (targetField === 'completed') {
        updateEntry(entry.id, { completed: true, completedAt: nextIso });
      } else {
        const patch: Partial<typeof entry> = { scheduledAt: nextIso };
        if (parsed.endAt) {
          const ed = new Date(parsed.endAt);
          patch.endAt = buildDateAtTime(targetDay, ed.getHours(), ed.getMinutes());
        }
        updateEntry(entry.id, patch);
      }
      setActiveTab(targetField);
    }

    setNlpDraft('');
  };

  // Passive reference pins for the Day Scrubber (shows the entry's other same-day timestamps)
  const referencePins = useMemo<ScrubberReferencePin[]>(() => {
    if (!entry || activeTab === 'date') return [];
    const pins: ScrubberReferencePin[] = [];
    if (activeTab !== 'created' && entry.createdAt && toLocalDateKey(entry.createdAt) === anchorDayKey) {
      pins.push({
        id: 'created',
        label: 'Created',
        minutes: isoToMinutes(entry.createdAt),
        color: 'var(--text-muted)',
      });
    }
    if (
      activeTab !== 'scheduled' &&
      entry.scheduledAt &&
      toLocalDateKey(entry.scheduledAt) === anchorDayKey
    ) {
      pins.push({
        id: 'scheduled',
        label: 'Sched',
        minutes: isoToMinutes(entry.scheduledAt),
        color: 'var(--color-entity-blue)',
      });
    }
    if (
      activeTab !== 'completed' &&
      entry.completedAt &&
      toLocalDateKey(entry.completedAt) === anchorDayKey
    ) {
      pins.push({
        id: 'completed',
        label: 'Done',
        minutes: isoToMinutes(entry.completedAt),
        color: 'var(--success)',
      });
    }
    return pins;
  }, [entry, activeTab, anchorDayKey]);

  if (!entry) return null;

  const currentHour24 = Math.floor(activeMinutes / 60);
  const currentMinute = activeMinutes % 60;
  const isPM = currentHour24 >= 12;

  const activeAccentColor =
    activeTab === 'scheduled'
      ? 'var(--color-entity-blue)'
      : activeTab === 'completed'
      ? 'var(--success)'
      : 'var(--accent)';

  const commitTypedDigits = (rawH: string, rawM: string) => {
    if (activeTab === 'date') return;
    const parsedH = parseInt(rawH, 10);
    const parsedM = parseInt(rawM, 10);
    const safeM = Number.isNaN(parsedM) ? currentMinute : Math.max(0, Math.min(59, parsedM));

    let nextH24 = currentHour24;
    if (!Number.isNaN(parsedH)) {
      if (timeFormat === '24h') {
        nextH24 = Math.max(0, Math.min(23, parsedH));
      } else {
        const clamped12 = Math.max(1, Math.min(12, parsedH));
        nextH24 = isPM
          ? clamped12 === 12
            ? 12
            : clamped12 + 12
          : clamped12 === 12
          ? 0
          : clamped12;
      }
    }
    applyFieldMinutes(activeTab, nextH24 * 60 + safeM);
  };

  const toggleMeridiem = (nextPm: boolean) => {
    if (activeTab === 'date') return;
    if (nextPm === isPM) return;
    const nextH24 = nextPm ? (currentHour24 + 12) % 24 : (currentHour24 + 12) % 24;
    applyFieldMinutes(activeTab, nextH24 * 60 + currentMinute);
  };

  const quickDates = [
    { label: 'Yesterday', key: addDaysToKey(todayKey, -1) },
    { label: 'Today', key: todayKey },
    { label: 'Tomorrow', key: addDaysToKey(todayKey, 1) },
    { label: '+2d', key: addDaysToKey(todayKey, 2) },
    { label: '+1w', key: addDaysToKey(todayKey, 7) },
  ];

  const nudgeSteps = [
    { label: '-1h', delta: -60 },
    { label: '-15m', delta: -15 },
    { label: '-5m', delta: -5 },
  ];
  const nudgeStepsForward = [
    { label: '+5m', delta: 5 },
    { label: '+15m', delta: 15 },
    { label: '+1h', delta: 60 },
  ];

  const showDurationControls =
    activeTab === 'scheduled' &&
    Boolean(entry.scheduledAt) &&
    (entry.type === 'timeblock' || entry.type === 'event' || Boolean(entry.endAt));

  const selectedCalendarDate = parseLocalDateKey(anchorDayKey);

  const tabs: Array<{
    id: ActiveTab;
    label: string;
    value: string;
    muted?: boolean;
    icon: React.ReactNode;
    accent: string;
  }> = [
    {
      id: 'date',
      label: 'Date',
      value: formatShortDate(anchorDayKey),
      icon: <Calendar className="w-3.5 h-3.5 shrink-0" />,
      accent: 'var(--accent)',
    },
    {
      id: 'created',
      label: 'Created',
      value: formatTime(entry.createdAt, timeFormat),
      icon: <PlusCircle className="w-3.5 h-3.5 shrink-0" />,
      accent: 'var(--text-primary)',
    },
    {
      id: 'scheduled',
      label: 'Scheduled',
      value: entry.scheduledAt ? formatTime(entry.scheduledAt, timeFormat) : 'Add',
      muted: !entry.scheduledAt,
      icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
      accent: 'var(--color-entity-blue)',
    },
    ...(showCompletedTab
      ? [
          {
            id: 'completed' as const,
            label: 'Completed',
            value: entry.completedAt ? formatTime(entry.completedAt, timeFormat) : 'Set',
            muted: !entry.completedAt,
            icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
            accent: 'var(--success)',
          },
        ]
      : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit Timestamps"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Single-Layer Studio Modal */}
      <div
        className="relative z-10 w-full max-w-[460px] max-h-[92dvh] rounded-2xl border flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 border-b shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="min-w-0">
            <h3 className="font-display text-sm font-semibold leading-tight text-[var(--text-primary)]">
              Edit Timestamps
            </h3>
            <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {entry.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg shrink-0 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Smart NLP Quick-Adjust Bar */}
        <form
          onSubmit={handleApplyNlp}
          className="px-4 py-2.5 border-b shrink-0 space-y-1.5"
          style={{
            backgroundColor: 'var(--bg-canvas)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div
            className="flex items-center gap-2 h-8 px-2.5 rounded-lg border transition-colors focus-within:border-[var(--accent)]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
            <input
              type="text"
              value={nlpDraft}
              onChange={(e) => setNlpDraft(e.target.value)}
              placeholder='Type "tomorrow 3pm", "23 Nov", "+15m", "now"…'
              className="flex-1 min-w-0 bg-transparent text-xs outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            {nlpDraft.trim() && (
              <button
                type="submit"
                disabled={!nlpIntent}
                className="h-6 px-2 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-40 shrink-0 cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-fg)',
                }}
              >
                Apply
              </button>
            )}
          </div>
          {nlpIntent && (
            <div
              className="px-1 text-[11px] font-mono tabular-nums truncate"
              style={{ color: 'var(--accent)' }}
            >
              {nlpIntent.preview}
            </div>
          )}
        </form>

        {/* 4-Field Segmented Tab Strip */}
        <div
          className="px-4 pt-3 pb-2 shrink-0"
          role="tablist"
          aria-label="Timestamp fields"
        >
          <div
            className={`grid gap-1.5 ${tabs.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-xl border text-left transition-colors cursor-pointer min-w-0"
                  style={{
                    backgroundColor: isActive ? 'var(--accent-soft)' : 'var(--bg-surface)',
                    borderColor: isActive ? tab.accent : 'var(--border-subtle)',
                  }}
                >
                  <span
                    className="flex items-center gap-1 text-[11px] font-medium truncate w-full"
                    style={{
                      color: isActive ? tab.accent : 'var(--text-secondary)',
                    }}
                  >
                    <span style={{ color: tab.accent }}>{tab.icon}</span>
                    <span className="truncate">{tab.label}</span>
                  </span>
                  <span
                    className="text-[11px] font-mono tabular-nums font-medium truncate w-full"
                    style={{
                      color: tab.muted ? 'var(--text-muted)' : 'var(--text-primary)',
                    }}
                  >
                    {tab.value}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Panel Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-1 pb-4">
          {activeTab === 'date' ? (
            <div className="space-y-3">
              {/* Quick Date Shift Chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                {quickDates.map((q) => {
                  const active = anchorDayKey === q.key;
                  return (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => applyDateKey(q.key)}
                      className="h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer"
                      style={{
                        backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                        borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >
                      {q.label}
                    </button>
                  );
                })}
              </div>

              {/* Theme-Integrated react-day-picker Calendar */}
              <div
                className="rounded-xl border p-3 flex justify-center"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <DayPicker
                  mode="single"
                  selected={selectedCalendarDate}
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  showOutsideDays
                  onSelect={(day) => {
                    if (day) applyDateKey(toLocalDateKey(day));
                  }}
                  components={{
                    Chevron: ({ orientation }) =>
                      orientation === 'left' ? (
                        <ChevronLeft className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      ),
                  }}
                  classNames={{
                    root: 'w-full max-w-[308px] select-none',
                    months: 'relative flex flex-col',
                    month: 'w-full space-y-2.5',
                    month_caption: 'flex items-center justify-center relative h-8',
                    caption_label:
                      'font-display text-sm font-semibold text-[var(--text-primary)]',
                    nav: 'flex items-center justify-between absolute inset-x-0 top-0 h-8 pointer-events-none z-10',
                    button_previous:
                      'pointer-events-auto h-7 w-7 inline-flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer',
                    button_next:
                      'pointer-events-auto h-7 w-7 inline-flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer',
                    month_grid: 'w-full border-collapse',
                    weekdays: 'grid grid-cols-7 mb-1',
                    weekday:
                      'text-center text-[11px] font-medium text-[var(--text-muted)] py-1',
                    weeks: 'space-y-0.5',
                    week: 'grid grid-cols-7',
                    day: 'flex items-center justify-center p-0.5',
                    day_button:
                      'w-9 h-8 rounded-lg font-mono tabular-nums text-xs flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] cursor-pointer',
                    selected:
                      '[&>button]:bg-[var(--accent)] [&>button]:text-[var(--accent-fg)] [&>button]:font-semibold [&>button]:hover:bg-[var(--accent)]',
                    today:
                      '[&>button]:ring-1 [&>button]:ring-[var(--accent)] [&>button]:text-[var(--accent)] [&>button]:font-semibold',
                    outside: '[&>button]:opacity-35',
                    disabled: '[&>button]:opacity-25 [&>button]:cursor-not-allowed',
                  }}
                />
              </div>

              <p className="text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>
                Currently on{' '}
                <span
                  className="font-mono tabular-nums font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {formatCompactDayHeading(anchorDayKey)}
                </span>{' '}
                · Clock times stay preserved
              </p>
            </div>
          ) : (
            <div className="space-y-3.5 pt-1">
              {/* Unset hint for Scheduled / Completed */}
              {!activeTimeIso && (
                <div
                  className="px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-2"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>
                    {activeTab === 'scheduled'
                      ? 'Not scheduled yet — scrub, dial, or tap Now.'
                      : 'Not completed yet — scrub, dial, or tap Now.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => applyFieldMinutes(activeTab, nowMinutes)}
                    className="h-6 px-2 rounded-md text-[11px] font-semibold shrink-0 cursor-pointer"
                    style={{
                      backgroundColor: activeAccentColor,
                      color: 'var(--accent-fg, #ffffff)',
                    }}
                  >
                    Set Now
                  </button>
                </div>
              )}

              {/* Direct Typable Clock Readout + Mode Switcher (Scrubber | Clock) */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {/* Direct Typable HH : MM */}
                  <div
                    className="inline-flex items-center rounded-xl border px-2 py-1 gap-0.5"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label="Hours"
                      maxLength={2}
                      value={hourDraft}
                      onFocus={(e) => {
                        setIsEditingDigits(true);
                        e.currentTarget.select();
                      }}
                      onChange={(e) =>
                        setHourDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))
                      }
                      onBlur={() => {
                        setIsEditingDigits(false);
                        commitTypedDigits(hourDraft, minuteDraft);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setIsEditingDigits(false);
                          commitTypedDigits(hourDraft, minuteDraft);
                          e.currentTarget.blur();
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          applyFieldMinutes(activeTab, (activeMinutes + 60) % 1440);
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          applyFieldMinutes(activeTab, (activeMinutes + 1440 - 60) % 1440);
                        }
                      }}
                      className="w-9 h-8 bg-transparent text-center font-mono tabular-nums text-lg font-semibold outline-none rounded-md focus:bg-[var(--accent-soft)]"
                      style={{ color: 'var(--text-primary)' }}
                    />
                    <span
                      className="font-mono text-lg font-semibold opacity-50 select-none"
                      aria-hidden="true"
                    >
                      :
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label="Minutes"
                      maxLength={2}
                      value={minuteDraft}
                      onFocus={(e) => {
                        setIsEditingDigits(true);
                        e.currentTarget.select();
                      }}
                      onChange={(e) =>
                        setMinuteDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))
                      }
                      onBlur={() => {
                        setIsEditingDigits(false);
                        commitTypedDigits(hourDraft, minuteDraft);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setIsEditingDigits(false);
                          commitTypedDigits(hourDraft, minuteDraft);
                          e.currentTarget.blur();
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          const step = e.shiftKey ? 5 : 1;
                          applyFieldMinutes(activeTab, (activeMinutes + step) % 1440);
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          const step = e.shiftKey ? 5 : 1;
                          applyFieldMinutes(activeTab, (activeMinutes + 1440 - step) % 1440);
                        }
                      }}
                      className="w-9 h-8 bg-transparent text-center font-mono tabular-nums text-lg font-semibold outline-none rounded-md focus:bg-[var(--accent-soft)]"
                      style={{ color: 'var(--text-primary)' }}
                    />
                  </div>

                  {/* AM / PM toggle in 12h mode */}
                  {timeFormat === '12h' && (
                    <div
                      className="inline-flex flex-col p-0.5 rounded-lg border"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleMeridiem(false)}
                        className="h-[19px] px-2 rounded text-[10px] font-mono font-semibold transition-colors cursor-pointer"
                        style={{
                          backgroundColor: !isPM ? 'var(--accent-soft)' : 'transparent',
                          color: !isPM ? activeAccentColor : 'var(--text-muted)',
                        }}
                      >
                        AM
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleMeridiem(true)}
                        className="h-[19px] px-2 rounded text-[10px] font-mono font-semibold transition-colors cursor-pointer"
                        style={{
                          backgroundColor: isPM ? 'var(--accent-soft)' : 'transparent',
                          color: isPM ? activeAccentColor : 'var(--text-muted)',
                        }}
                      >
                        PM
                      </button>
                    </div>
                  )}
                </div>

                {/* Scrubber vs Radial Clock Toggle */}
                <div
                  className="inline-flex items-center h-8 p-0.5 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setTimeControlMode('scrubber')}
                    className="h-full px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    style={{
                      backgroundColor:
                        timeControlMode === 'scrubber' ? 'var(--accent-soft)' : 'transparent',
                      color:
                        timeControlMode === 'scrubber'
                          ? activeAccentColor
                          : 'var(--text-secondary)',
                    }}
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span>Scrubber</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeControlMode('clock')}
                    className="h-full px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    style={{
                      backgroundColor:
                        timeControlMode === 'clock' ? 'var(--accent-soft)' : 'transparent',
                      color:
                        timeControlMode === 'clock'
                          ? activeAccentColor
                          : 'var(--text-secondary)',
                    }}
                  >
                    <Clock3 className="w-3 h-3" />
                    <span>Clock</span>
                  </button>
                </div>
              </div>

              {/* Interactive Time Control (Day Scrubber OR Radial Analog Clock) */}
              {timeControlMode === 'scrubber' ? (
                <DayTimeScrubber
                  minutes={activeMinutes}
                  timeFormat={timeFormat}
                  accentColor={activeAccentColor}
                  referencePins={referencePins}
                  isUnset={!activeTimeIso}
                  onChange={(mins) => applyFieldMinutes(activeTab, mins)}
                />
              ) : (
                <RadialClockPicker
                  minutes={activeMinutes}
                  timeFormat={timeFormat}
                  accentColor={activeAccentColor}
                  onChange={(mins) => applyFieldMinutes(activeTab, mins)}
                />
              )}

              {/* Quick Nudge Strip (-1h / -15m / -5m / Now / +5m / +15m / +1h) */}
              <div className="grid grid-cols-7 gap-1 pt-0.5">
                {nudgeSteps.map((step) => (
                  <button
                    key={step.label}
                    type="button"
                    onClick={() => applyFieldMinutes(activeTab, activeMinutes + step.delta)}
                    className="h-8 rounded-lg border font-mono tabular-nums text-[11px] font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {step.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => applyFieldMinutes(activeTab, nowMinutes)}
                  className="h-8 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer"
                  style={{
                    backgroundColor: 'var(--accent-soft)',
                    borderColor: activeAccentColor,
                    color: activeAccentColor,
                  }}
                >
                  Now
                </button>
                {nudgeStepsForward.map((step) => (
                  <button
                    key={step.label}
                    type="button"
                    onClick={() => applyFieldMinutes(activeTab, activeMinutes + step.delta)}
                    className="h-8 rounded-lg border font-mono tabular-nums text-[11px] font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {step.label}
                  </button>
                ))}
              </div>

              {/* Duration / End-Time Row (for Events & Time Blocks on Scheduled tab) */}
              {showDurationControls && entry.scheduledAt && (
                <div
                  className="pt-2.5 border-t flex flex-wrap items-center justify-between gap-2 text-xs"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Ends:{' '}
                    <span
                      className="font-mono tabular-nums font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {entry.endAt ? formatTime(entry.endAt, timeFormat) : 'No end time'}
                    </span>
                  </span>
                  <div className="flex items-center gap-1">
                    {[
                      { label: '+30m', mins: 30 },
                      { label: '+1h', mins: 60 },
                      { label: '+2h', mins: 120 },
                    ].map((dur) => (
                      <button
                        key={dur.label}
                        type="button"
                        onClick={() =>
                          updateEntry(entry.id, {
                            endAt: addMinutesToIso(entry.scheduledAt!, dur.mins),
                          })
                        }
                        className="h-7 px-2 rounded-md border font-mono tabular-nums text-[11px] transition-colors hover:border-[var(--accent)] cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {dur.label}
                      </button>
                    ))}
                    {entry.endAt && (
                      <button
                        type="button"
                        onClick={() => updateEntry(entry.id, { endAt: null })}
                        className="h-7 px-2 rounded-md text-[11px] hover:underline cursor-pointer"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Clean Footer */}
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 border-t shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div>
            {activeTab === 'scheduled' && entry.scheduledAt ? (
              <button
                type="button"
                onClick={() => clearOptionalField('scheduled')}
                className="h-8 px-2.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: 'var(--danger)' }}
              >
                Clear Scheduled
              </button>
            ) : activeTab === 'completed' && entry.completedAt ? (
              <button
                type="button"
                onClick={() => clearOptionalField('completed')}
                className="h-8 px-2.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: 'var(--danger)' }}
              >
                Clear Completed
              </button>
            ) : (
              <span
                className="text-[11px] font-mono tabular-nums"
                style={{ color: 'var(--text-muted)' }}
              >
                Changes saved automatically
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-fg)',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
