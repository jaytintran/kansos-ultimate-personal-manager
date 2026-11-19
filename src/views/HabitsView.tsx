import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  DynamicIcon,
  HABIT_COLOR_SWATCHES,
  HABIT_ICON_KEYS,
} from '../components/IconLibrary';
import { useWorkspace } from '../context/WorkspaceContext';
import { Habit, HabitFrequencyType } from '../types';
import {
  addDaysToKey,
  formatShortDate,
  getDayNumber,
  getDayOfWeek,
  getDayShortName,
  getMonthDateKeys,
  getRangeDateKeys,
  getTodayKey,
  parseLocalDateKey,
} from '../utils/date';

type RangeMode = '7d' | '14d' | '30d' | 'month';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isScheduledForDay(habit: Habit, dateKey: string): boolean {
  const dow = getDayOfWeek(dateKey);
  if (habit.frequencyType === 'daily') return true;
  if (habit.frequencyType === 'weekdays') return dow >= 1 && dow <= 5;
  if (habit.frequencyType === 'custom') {
    return (habit.customDays || []).includes(dow);
  }
  return true;
}

function calculateCurrentStreak(habit: Habit, todayKey: string): number {
  let streak = 0;
  let cursor = todayKey;
  // Allow streak to stay alive if today isn't completed yet by checking yesterday
  if (!habit.completions[cursor]) {
    cursor = addDaysToKey(cursor, -1);
  }
  for (let i = 0; i < 365; i++) {
    if (habit.completions[cursor]) {
      streak++;
      cursor = addDaysToKey(cursor, -1);
    } else if (!isScheduledForDay(habit, cursor)) {
      cursor = addDaysToKey(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
}

function formatFrequencyLabel(habit: Habit): string {
  if (habit.frequencyType === 'daily') return 'Daily';
  if (habit.frequencyType === 'weekdays') return 'Weekdays';
  if (habit.frequencyType === 'weekly') return `${habit.weeklyTarget || 4}x / week`;
  const days = (habit.customDays || []).map((d) => WEEKDAY_SHORT[d]).join(' · ');
  return days || 'Custom';
}

export const HabitsView: React.FC = () => {
  const { workspace, addHabit, updateHabit, deleteHabit, toggleHabitCompletion } = useWorkspace();
  const todayKey = getTodayKey();

  const [rangeMode, setRangeMode] = useState<RangeMode>('14d');
  const [anchorDateKey, setAnchorDateKey] = useState<string>(todayKey);
  const [expandedHabitId, setExpandedHabitId] = useState<string | null>(null);

  // Habit Builder Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('BookOpen');
  const [color, setColor] = useState(HABIT_COLOR_SWATCHES[0]);
  const [frequencyType, setFrequencyType] = useState<HabitFrequencyType>('daily');
  const [customDays, setCustomDays] = useState<number[]>([1, 3, 5]);
  const [weeklyTarget, setWeeklyTarget] = useState<number>(4);

  const dateKeys = useMemo(() => {
    if (rangeMode === '7d') return getRangeDateKeys(anchorDateKey, 7);
    if (rangeMode === '14d') return getRangeDateKeys(anchorDateKey, 14);
    if (rangeMode === '30d') return getRangeDateKeys(anchorDateKey, 30);
    const d = parseLocalDateKey(anchorDateKey);
    return getMonthDateKeys(d.getFullYear(), d.getMonth());
  }, [rangeMode, anchorDateKey]);

  const heatmapKeys = useMemo(() => getRangeDateKeys(todayKey, 84), [todayKey]); // 12 weeks

  const rangeLabel = useMemo(() => {
    if (rangeMode === 'month') {
      const d = parseLocalDateKey(anchorDateKey);
      return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    if (dateKeys.length === 0) return '';
    return `${formatShortDate(dateKeys[0])} – ${formatShortDate(dateKeys[dateKeys.length - 1])}`;
  }, [rangeMode, anchorDateKey, dateKeys]);

  const shiftRange = (direction: -1 | 1) => {
    if (window.innerWidth < 768) {
      setAnchorDateKey(addDaysToKey(anchorDateKey, direction * 7));
      return;
    }
    if (rangeMode === 'month') {
      const d = parseLocalDateKey(anchorDateKey);
      const next = new Date(d.getFullYear(), d.getMonth() + direction, 15);
      setAnchorDateKey(
        `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(
          next.getDate()
        ).padStart(2, '0')}`
      );
      return;
    }
    const step = rangeMode === '7d' ? 7 : rangeMode === '14d' ? 14 : 30;
    setAnchorDateKey(addDaysToKey(anchorDateKey, direction * step));
  };

  // Summary metrics
  const stats = useMemo(() => {
    const totalHabits = workspace.habits.length;
    const completedToday = workspace.habits.filter((h) => Boolean(h.completions[todayKey])).length;
    let bestStreak = 0;
    let rangeDone = 0;
    let rangePossible = 0;

    for (const h of workspace.habits) {
      const s = calculateCurrentStreak(h, todayKey);
      if (s > bestStreak) bestStreak = s;
      for (const dk of dateKeys) {
        if (dk > todayKey) continue;
        if (isScheduledForDay(h, dk)) {
          rangePossible++;
          if (h.completions[dk]) rangeDone++;
        }
      }
    }

    const consistencyPct = rangePossible > 0 ? Math.round((rangeDone / rangePossible) * 100) : 0;
    return { totalHabits, completedToday, bestStreak, consistencyPct };
  }, [workspace.habits, dateKeys, todayKey]);

  const openCreateModal = () => {
    setEditingHabitId(null);
    setTitle('');
    setIcon('BookOpen');
    setColor(HABIT_COLOR_SWATCHES[workspace.habits.length % HABIT_COLOR_SWATCHES.length]);
    setFrequencyType('daily');
    setCustomDays([1, 3, 5]);
    setWeeklyTarget(4);
    setModalOpen(true);
  };

  const openEditModal = (habit: Habit) => {
    setEditingHabitId(habit.id);
    setTitle(habit.title);
    setIcon(habit.icon);
    setColor(habit.color);
    setFrequencyType(habit.frequencyType);
    setCustomDays(habit.customDays || [1, 3, 5]);
    setWeeklyTarget(habit.weeklyTarget || 4);
    setModalOpen(true);
  };

  const handleSaveHabit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const payload = {
      title: title.trim(),
      icon,
      color,
      frequencyType,
      customDays: frequencyType === 'custom' ? customDays : undefined,
      weeklyTarget: frequencyType === 'weekly' ? weeklyTarget : undefined,
    };

    if (editingHabitId) {
      updateHabit(editingHabitId, payload);
    } else {
      addHabit(payload);
    }
    setModalOpen(false);
  };

  const toggleCustomDay = (dayIndex: number) => {
    setCustomDays((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex].sort()
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-9 space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Habits</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Click any day cell to log consistency across your routine grid.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="h-10 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap self-start sm:self-auto transition-transform active:scale-[0.98]"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-fg)',
          }}
        >
          <Plus className="w-4 h-4" />
          <span>Create Habit</span>
        </button>
      </header>

      {/* Metrics & Controls Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Clean unboxed metrics strip */}
        <div className="flex flex-wrap items-center gap-5 text-sm">
          <div>
            <span className="text-xs block" style={{ color: 'var(--text-muted)' }}>
              Today
            </span>
            <span className="font-mono tabular-nums font-semibold">
              {stats.completedToday} / {stats.totalHabits}
            </span>
          </div>
          <span className="h-7 w-px" style={{ backgroundColor: 'var(--border-subtle)' }} />
          <div>
            <span className="text-xs block" style={{ color: 'var(--text-muted)' }}>
              Best Streak
            </span>
            <span className="font-mono tabular-nums font-semibold inline-flex items-center gap-1">
              <Flame className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              {stats.bestStreak}d
            </span>
          </div>
          <span className="h-7 w-px" style={{ backgroundColor: 'var(--border-subtle)' }} />
          <div>
            <span className="text-xs block" style={{ color: 'var(--text-muted)' }}>
              Range Consistency
            </span>
            <span className="font-mono tabular-nums font-semibold">{stats.consistencyPct}%</span>
          </div>
        </div>

        {/* Range Switcher (Desktop) & Date Navigation */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="hidden md:inline-flex items-center gap-0.5 p-1 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {(
              [
                { id: '7d', label: '7D' },
                { id: '14d', label: '14D' },
                { id: '30d', label: '30D' },
                { id: 'month', label: 'Month' },
              ] as { id: RangeMode; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRangeMode(opt.id)}
                className="px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: rangeMode === opt.id ? 'var(--bg-surface)' : 'transparent',
                  color: rangeMode === opt.id ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftRange(-1)}
              className="h-8 w-8 flex items-center justify-center rounded-lg border"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
              aria-label="Previous range"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnchorDateKey(todayKey)}
              className="h-9 md:h-8 px-3 md:px-2.5 rounded-xl md:rounded-lg border text-xs font-mono tabular-nums whitespace-nowrap"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
              title="Jump to today"
            >
              <span className="md:hidden">
                {formatShortDate(addDaysToKey(anchorDateKey, -6))} – {formatShortDate(anchorDateKey)}
              </span>
              <span className="hidden md:inline">{rangeLabel}</span>
            </button>
            <button
              type="button"
              onClick={() => shiftRange(1)}
              className="h-8 w-8 flex items-center justify-center rounded-lg border"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
              aria-label="Next range"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Habit Grid — Mobile 7-Day Card View + Desktop Matrix Table */}
      {workspace.habits.length === 0 ? (
        <div
          className="rounded-2xl border py-16 px-6 text-center space-y-3"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            No habits yet
          </p>
          <p className="text-xs max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
            Start with one or two daily anchors—pick an icon, accent color, and cadence to build momentum.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-2 h-10 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create first habit</span>
          </button>
        </div>
      ) : (
        <>
          {/* Mobile 7-Day Tactile Habit Cards (< md) */}
          <div className="md:hidden space-y-3">
            {workspace.habits.map((habit) => {
              const mobileKeys = getRangeDateKeys(anchorDateKey, 7);
              const streak = calculateCurrentStreak(habit, todayKey);
              const isExpanded = expandedHabitId === habit.id;

              return (
                <div
                  key={habit.id}
                  className="rounded-2xl border p-4 space-y-3.5"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2.5">
                    <button
                      type="button"
                      onClick={() => setExpandedHabitId(isExpanded ? null : habit.id)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `${habit.color}1a`,
                          color: habit.color,
                        }}
                      >
                        <DynamicIcon name={habit.icon} className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{habit.title}</div>
                        <div
                          className="text-xs flex items-center gap-1.5 mt-0.5"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <span>{formatFrequencyLabel(habit)}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className="font-mono tabular-nums font-semibold inline-flex items-center gap-0.5"
                            style={{ color: streak > 0 ? habit.color : 'var(--text-muted)' }}
                          >
                            <Flame className="w-3 h-3" />
                            {streak}d
                          </span>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => openEditModal(habit)}
                      className="h-10 w-10 flex items-center justify-center rounded-xl shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                      aria-label={`Edit ${habit.title}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 7-Day Tactile Row */}
                  <div className="grid grid-cols-7 gap-1.5">
                    {mobileKeys.map((dk) => {
                      const done = Boolean(habit.completions[dk]);
                      const scheduled = isScheduledForDay(habit, dk);
                      const isToday = dk === todayKey;
                      return (
                        <button
                          key={dk}
                          type="button"
                          onClick={() => toggleHabitCompletion(habit.id, dk)}
                          aria-pressed={done}
                          aria-label={`${habit.title} on ${dk}: ${done ? 'completed' : 'not completed'}`}
                          className="min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 transition-transform active:scale-95"
                          style={{
                            backgroundColor: done
                              ? habit.color
                              : isToday
                              ? 'var(--bg-surface-hover)'
                              : 'var(--bg-surface-subtle)',
                            opacity: !done && !scheduled ? 0.45 : 1,
                            boxShadow: isToday && !done ? `inset 0 0 0 1.5px ${habit.color}` : 'none',
                            color: done ? '#ffffff' : 'var(--text-secondary)',
                          }}
                        >
                          <span className="text-[10px] leading-none opacity-80">
                            {getDayShortName(dk)}
                          </span>
                          <span className="text-xs font-mono tabular-nums font-semibold leading-none mt-0.5">
                            {done ? <Check className="w-3.5 h-3.5 stroke-[2.75]" /> : getDayNumber(dk)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {isExpanded && (
                    <div
                      className="pt-3 border-t space-y-2"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        <span>12-Week Activity</span>
                        <span className="font-mono tabular-nums">
                          {heatmapKeys.filter((k) => habit.completions[k]).length}/84 days
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {heatmapKeys.map((hk) => {
                          const done = Boolean(habit.completions[hk]);
                          return (
                            <button
                              key={hk}
                              type="button"
                              onClick={() => toggleHabitCompletion(habit.id, hk)}
                              title={hk}
                              className="w-3 h-3 rounded-[3px]"
                              style={{
                                backgroundColor: done ? habit.color : 'var(--bg-surface-subtle)',
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop Matrix Table (md+) */}
          <div
            className="hidden md:block rounded-2xl border overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[680px]">
                <thead>
                  <tr
                    className="border-b text-left"
                    style={{
                      backgroundColor: 'var(--bg-surface-subtle)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <th
                      className="py-3 pl-4 pr-3 text-xs font-semibold w-64 sticky left-0 z-10"
                      style={{
                        backgroundColor: 'var(--bg-surface-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Habit
                    </th>
                    {dateKeys.map((dk) => {
                      const isToday = dk === todayKey;
                      return (
                        <th
                          key={dk}
                          className="py-2.5 px-1 text-center font-normal"
                          style={{
                            minWidth: rangeMode === '7d' ? 54 : rangeMode === '14d' ? 40 : 28,
                          }}
                        >
                          <div
                            className="text-[10px] leading-none"
                            style={{ color: isToday ? 'var(--accent)' : 'var(--text-muted)' }}
                          >
                            {getDayShortName(dk)}
                          </div>
                          <div
                            className={`mt-1 text-xs font-mono tabular-nums leading-none ${
                              isToday ? 'font-bold' : ''
                            }`}
                            style={{ color: isToday ? 'var(--accent)' : 'var(--text-secondary)' }}
                          >
                            {getDayNumber(dk)}
                          </div>
                        </th>
                      );
                    })}
                    <th
                      className="py-3 px-4 text-right text-xs font-semibold whitespace-nowrap"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Streak
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {workspace.habits.map((habit) => {
                    const streak = calculateCurrentStreak(habit, todayKey);
                    const isExpanded = expandedHabitId === habit.id;
                    const rangeCompletedCount = dateKeys.filter((dk) => habit.completions[dk]).length;

                    return (
                      <React.Fragment key={habit.id}>
                        <tr className="group transition-colors hover:bg-[var(--bg-surface-subtle)]/50">
                          {/* Habit Name & Metadata */}
                          <td
                            className="py-3 pl-4 pr-3 sticky left-0 z-10 transition-colors"
                            style={{ backgroundColor: 'var(--bg-surface)' }}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                                style={{
                                  backgroundColor: `${habit.color}1a`,
                                  color: habit.color,
                                }}
                              >
                                <DynamicIcon name={habit.icon} className="w-4.5 h-4.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedHabitId(isExpanded ? null : habit.id)
                                  }
                                  className="text-sm font-medium text-left truncate block w-full hover:underline"
                                  style={{ color: 'var(--text-primary)' }}
                                  title="Click to toggle 12-week heatmap"
                                >
                                  {habit.title}
                                </button>
                                <div
                                  className="text-[11px] flex items-center gap-1.5 mt-0.5"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  <span>{formatFrequencyLabel(habit)}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums">
                                    {rangeCompletedCount}/{dateKeys.length}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => openEditModal(habit)}
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-7 w-7 flex items-center justify-center rounded-md transition-opacity shrink-0"
                                style={{ color: 'var(--text-muted)' }}
                                aria-label={`Edit ${habit.title}`}
                                title="Edit habit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>

                          {/* Interactive Day Slots */}
                          {dateKeys.map((dk) => {
                            const done = Boolean(habit.completions[dk]);
                            const scheduled = isScheduledForDay(habit, dk);
                            const isToday = dk === todayKey;
                            const cellSize =
                              rangeMode === '7d'
                                ? 'w-9 h-9'
                                : rangeMode === '14d'
                                ? 'w-8 h-8'
                                : 'w-6 h-6';

                            return (
                              <td key={dk} className="py-2.5 px-0.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => toggleHabitCompletion(habit.id, dk)}
                                  aria-pressed={done}
                                  aria-label={`${habit.title} on ${dk}: ${done ? 'completed' : 'not completed'}`}
                                  className={`${cellSize} mx-auto rounded-lg flex items-center justify-center transition-all active:scale-90`}
                                  style={{
                                    backgroundColor: done
                                      ? habit.color
                                      : isToday
                                      ? 'var(--bg-surface-hover)'
                                      : 'var(--bg-surface-subtle)',
                                    opacity: !done && !scheduled ? 0.45 : 1,
                                    boxShadow:
                                      isToday && !done ? `inset 0 0 0 1.5px ${habit.color}` : 'none',
                                    color: '#ffffff',
                                  }}
                                >
                                  {done && (
                                    <Check
                                      className={
                                        rangeMode === '30d' || rangeMode === 'month'
                                          ? 'w-3 h-3 stroke-[2.75]'
                                          : 'w-4 h-4 stroke-[2.5]'
                                      }
                                    />
                                  )}
                                </button>
                              </td>
                            );
                          })}

                          {/* Streak Counter */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <span
                              className="font-mono tabular-nums text-xs font-semibold inline-flex items-center gap-1"
                              style={{ color: streak > 0 ? habit.color : 'var(--text-muted)' }}
                            >
                              <Flame className="w-3.5 h-3.5" />
                              {streak}d
                            </span>
                          </td>
                        </tr>

                        {/* Expandable 12-Week Contribution Heatmap */}
                        {isExpanded && (
                          <tr>
                            <td
                              colSpan={dateKeys.length + 2}
                              className="px-5 py-4"
                              style={{ backgroundColor: 'var(--bg-surface-subtle)' }}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                                <span
                                  className="text-xs font-medium"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  12-Week Activity Heatmap — {habit.title}
                                </span>
                                <span
                                  className="text-xs font-mono tabular-nums"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  {heatmapKeys.filter((k) => habit.completions[k]).length} completions
                                  in last 84 days
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {heatmapKeys.map((hk) => {
                                  const done = Boolean(habit.completions[hk]);
                                  return (
                                    <button
                                      key={hk}
                                      type="button"
                                      onClick={() => toggleHabitCompletion(habit.id, hk)}
                                      title={`${hk}${done ? ' · Completed' : ''}`}
                                      className="w-3.5 h-3.5 rounded-[3px] transition-transform hover:scale-125"
                                      style={{
                                        backgroundColor: done ? habit.color : 'var(--bg-surface)',
                                        border: done ? 'none' : '1px solid var(--border-subtle)',
                                      }}
                                    />
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Create / Edit Habit Modal (Slide-up bottom sheet on mobile, centered modal on desktop) */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingHabitId ? 'Edit Habit' : 'Create Habit'}
        >
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setModalOpen(false)}
          />
          <form
            onSubmit={handleSaveHabit}
            className="relative z-10 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-t sm:border px-5 sm:px-6 pt-3 sm:pt-6 pb-6 space-y-5 max-h-[90dvh] overflow-y-auto"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              boxShadow: 'var(--shadow-popover)',
            }}
          >
            <div className="sm:hidden flex justify-center pb-1">
              <span
                className="w-10 h-1 rounded-full"
                style={{ backgroundColor: 'var(--border-strong)' }}
                aria-hidden="true"
              />
            </div>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">
                {editingHabitId ? 'Edit Habit' : 'Create Habit'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                Habit Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Read 20 pages, Run 5km, Meditate"
                className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* Color Swatches */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                Accent Color
              </label>
              <div className="flex flex-wrap gap-2">
                {HABIT_COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setColor(swatch)}
                    className="h-7 w-7 rounded-full flex items-center justify-center transition-transform active:scale-90"
                    style={{
                      backgroundColor: swatch,
                      boxShadow: color === swatch ? '0 0 0 2px var(--bg-elevated), 0 0 0 4px var(--text-primary)' : 'none',
                    }}
                    aria-label={`Select color ${swatch}`}
                  >
                    {color === swatch && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Icon Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                Icon
              </label>
              <div className="grid grid-cols-8 gap-1.5">
                {HABIT_ICON_KEYS.map((iconKey) => {
                  const active = icon === iconKey;
                  return (
                    <button
                      key={iconKey}
                      type="button"
                      onClick={() => setIcon(iconKey)}
                      className="h-9 rounded-lg border flex items-center justify-center transition-colors"
                      style={{
                        backgroundColor: active ? `${color}1f` : 'var(--bg-surface)',
                        borderColor: active ? color : 'var(--border-subtle)',
                        color: active ? color : 'var(--text-secondary)',
                      }}
                      aria-label={iconKey}
                    >
                      <DynamicIcon name={iconKey} className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Frequency */}
            <div className="space-y-2.5">
              <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                Frequency
              </label>
              <div
                className="grid grid-cols-4 gap-1 p-1 rounded-lg border"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {(
                  [
                    { id: 'daily', label: 'Daily' },
                    { id: 'weekdays', label: 'Weekdays' },
                    { id: 'custom', label: 'Days' },
                    { id: 'weekly', label: 'Weekly' },
                  ] as { id: HabitFrequencyType; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFrequencyType(opt.id)}
                    className="py-1.5 text-xs font-medium rounded-md transition-colors"
                    style={{
                      backgroundColor:
                        frequencyType === opt.id ? 'var(--bg-surface)' : 'transparent',
                      color:
                        frequencyType === opt.id ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {frequencyType === 'custom' && (
                <div className="grid grid-cols-7 gap-1 pt-1">
                  {WEEKDAY_SHORT.map((day, idx) => {
                    const selected = customDays.includes(idx);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleCustomDay(idx)}
                        className="h-8 rounded-lg border text-xs font-medium transition-colors"
                        style={{
                          backgroundColor: selected ? color : 'var(--bg-surface)',
                          borderColor: selected ? color : 'var(--border-subtle)',
                          color: selected ? '#ffffff' : 'var(--text-secondary)',
                        }}
                      >
                        {day.slice(0, 2)}
                      </button>
                    );
                  })}
                </div>
              )}

              {frequencyType === 'weekly' && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Target days per week
                  </span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setWeeklyTarget(num)}
                        className="w-7 h-7 rounded-md text-xs font-mono tabular-nums font-medium"
                        style={{
                          backgroundColor: weeklyTarget === num ? color : 'var(--bg-surface-subtle)',
                          color: weeklyTarget === num ? '#ffffff' : 'var(--text-secondary)',
                        }}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              {editingHabitId ? (
                <button
                  type="button"
                  onClick={() => {
                    deleteHabit(editingHabitId);
                    setModalOpen(false);
                  }}
                  className="h-9 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
                  style={{ color: 'var(--danger)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-9 px-3.5 rounded-lg border text-xs font-medium"
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
                  className="h-9 px-4 rounded-lg text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-fg)',
                  }}
                >
                  {editingHabitId ? 'Save Changes' : 'Create Habit'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
