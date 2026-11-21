import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Table2,
} from "lucide-react";
import { HabitIcon } from "../components/IconLibrary";
import { useWorkspace } from "../context/WorkspaceContext";
import { DetailSheetTarget, Habit } from "../types";
import {
  addDaysToKey,
  formatDaySlashMonth,
  getDayAbbrev,
  getTodayKey,
  isHabitScheduledOnDay,
} from "../utils/date";

type HabitsViewMode = "matrix" | "cards";
type HabitsRange = "7d" | "14d" | "1m";

const VIEW_MODE_KEY = "kanso_habits_view_mode_v1";
const RANGE_KEY = "kanso_habits_range_v1";

interface HabitsViewProps {
  onOpenDetail: (target: DetailSheetTarget) => void;
}

function getDateRange(
  range: HabitsRange,
  offsetSteps: number,
  todayKey: string,
): string[] {
  const days = range === "7d" ? 7 : range === "14d" ? 14 : 30;
  const endKey = addDaysToKey(todayKey, offsetSteps * days);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(addDaysToKey(endKey, -i));
  }
  return keys;
}

function computeStreak(habit: Habit, todayKey: string): number {
  let streak = 0;
  let cursor = todayKey;
  for (let i = 0; i < 365; i++) {
    if (habit.completions[cursor]) {
      streak++;
      cursor = addDaysToKey(cursor, -1);
    } else if (i === 0) {
      cursor = addDaysToKey(cursor, -1);
    } else if (!isHabitScheduledOnDay(habit, cursor)) {
      cursor = addDaysToKey(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
}

export const HabitsView: React.FC<HabitsViewProps> = ({ onOpenDetail }) => {
  const { workspace, toggleHabitCompletion } = useWorkspace();
  const todayKey = getTodayKey();

  const [viewMode, setViewMode] = useState<HabitsViewMode>(() => {
    try {
      const saved = localStorage.getItem(
        VIEW_MODE_KEY,
      ) as HabitsViewMode | null;
      return saved === "cards" ? "cards" : "matrix";
    } catch {
      return "matrix";
    }
  });

  const [range, setRange] = useState<HabitsRange>(() => {
    try {
      const saved = localStorage.getItem(RANGE_KEY) as HabitsRange | null;
      return saved === "14d" || saved === "1m" ? saved : "7d";
    } catch {
      return "7d";
    }
  });

  const [matrixOffset, setMatrixOffset] = useState(0);
  const [cardOffsets, setCardOffsets] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // Ignore
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem(RANGE_KEY, range);
    } catch {
      // Ignore
    }
    setMatrixOffset(0);
    setCardOffsets({});
  }, [range]);

  const activeHabits = useMemo(() => workspace.habits, [workspace.habits]);

  const matrixKeys = useMemo(
    () => getDateRange(range, matrixOffset, todayKey),
    [range, matrixOffset, todayKey],
  );

  const matrixRangeLabel = `${formatDaySlashMonth(matrixKeys[0])} – ${formatDaySlashMonth(
    matrixKeys[matrixKeys.length - 1],
  )}`;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-20 space-y-5">
      {/* Header */}
      <header
        className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight">
            Habits
          </h1>
          <span
            className="text-xs font-mono tabular-nums shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            {activeHabits.length} active
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Time Range Switcher: 7D / 14D / 1M */}
          <div
            className="inline-flex items-center h-8 p-0.5 rounded-lg border"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            {(
              [
                { id: "7d", label: "7D" },
                { id: "14d", label: "14D" },
                { id: "1m", label: "1M" },
              ] as { id: HabitsRange; label: string }[]
            ).map((opt) => {
              const active = range === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRange(opt.id)}
                  className="h-full px-2 rounded-md text-xs font-mono font-semibold transition-colors"
                  style={{
                    backgroundColor: active
                      ? "var(--accent-soft)"
                      : "transparent",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* View Mode Toggle: Matrix vs Cards (available on desktop & mobile) */}
          <div
            className="inline-flex items-center h-8 p-0.5 rounded-lg border"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode("matrix")}
              className="h-full px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1"
              style={{
                backgroundColor:
                  viewMode === "matrix" ? "var(--accent-soft)" : "transparent",
                color:
                  viewMode === "matrix" ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Matrix</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className="h-full px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1"
              style={{
                backgroundColor:
                  viewMode === "cards" ? "var(--accent-soft)" : "transparent",
                color:
                  viewMode === "cards" ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
          </div>

          {/* New Habit */}
          <button
            type="button"
            onClick={() => onOpenDetail({ mode: "habit" })}
            className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Habit</span>
          </button>
        </div>
      </header>

      {activeHabits.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed py-14 px-4 text-center space-y-2"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <Flame className="w-7 h-7 mx-auto opacity-50" />
          <p className="text-sm font-medium">No habits tracked yet</p>
          <p className="text-xs">
            Create your first habit to build daily consistency and streaks.
          </p>
        </div>
      ) : viewMode === "matrix" ? (
        /* ================= MATRIX VIEW ================= */
        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          {/* Matrix Week / Range Navigation Bar */}
          <div
            className="flex items-center justify-between px-4 py-2.5 border-b"
            style={{
              backgroundColor: "var(--bg-surface-subtle)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Consistency Matrix
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMatrixOffset((o) => o - 1)}
                className="h-7 w-7 flex items-center justify-center rounded-lg border"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
                aria-label="Previous period"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMatrixOffset(0)}
                className="h-7 px-2.5 rounded-lg border text-xs font-mono tabular-nums font-medium"
                style={{
                  backgroundColor:
                    matrixOffset === 0
                      ? "var(--accent-soft)"
                      : "var(--bg-surface)",
                  borderColor:
                    matrixOffset === 0
                      ? "var(--accent)"
                      : "var(--border-subtle)",
                  color:
                    matrixOffset === 0
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                }}
                title="Jump to current period"
              >
                {matrixRangeLabel}
              </button>
              <button
                type="button"
                disabled={matrixOffset >= 0}
                onClick={() => setMatrixOffset((o) => Math.min(0, o + 1))}
                className="h-7 w-7 flex items-center justify-center rounded-lg border disabled:opacity-35"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
                aria-label="Next period"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr
                  className="border-b"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <th
                    className="sticky left-0 z-10 px-4 py-3 text-xs font-semibold min-w-[180px]"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      color: "var(--text-muted)",
                    }}
                  >
                    Habit
                  </th>
                  {matrixKeys.map((key) => {
                    const isToday = key === todayKey;
                    return (
                      <th
                        key={key}
                        className="px-1 py-2.5 text-center font-mono tabular-nums min-w-[38px]"
                        style={{
                          backgroundColor: isToday
                            ? "var(--accent-soft)"
                            : "transparent",
                          color: isToday
                            ? "var(--accent)"
                            : "var(--text-muted)",
                        }}
                      >
                        <div className="text-[10px] uppercase">
                          {getDayAbbrev(key).slice(0, 2)}
                        </div>
                        <div className="text-[11px] font-bold">
                          {key.slice(-2)}
                        </div>
                      </th>
                    );
                  })}
                  <th
                    className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Streak
                  </th>
                </tr>
              </thead>
              <tbody
                className="divide-y"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {activeHabits.map((habit) => {
                  const streak = computeStreak(habit, todayKey);
                  return (
                    <tr
                      key={habit.id}
                      className="group hover:bg-[var(--bg-surface-subtle)] transition-colors"
                      style={{ borderColor: "var(--border-subtle)" }}
                    >
                      {/* Sticky Habit Name Column */}
                      <td
                        className="sticky left-0 z-10 px-4 py-2.5"
                        style={{ backgroundColor: "var(--bg-surface)" }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onOpenDetail({ mode: "habit", id: habit.id })
                            }
                            className="flex items-center gap-2.5 min-w-0 text-left hover:underline"
                          >
                            <span
                              className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                              style={{
                                backgroundColor: `${habit.color}1c`,
                                color: habit.color,
                              }}
                            >
                              <HabitIcon
                                name={habit.icon}
                                className="w-3.5 h-3.5"
                              />
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs sm:text-sm font-semibold truncate">
                                {habit.title}
                              </div>
                              {habit.purpose && (
                                <div
                                  className="text-[11px] truncate max-w-[160px]"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  {habit.purpose}
                                </div>
                              )}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onOpenDetail({ mode: "habit", id: habit.id })
                            }
                            className="h-7 w-7 flex items-center justify-center rounded-md sm:opacity-0 sm:group-hover:opacity-100 shrink-0"
                            style={{ color: "var(--text-muted)" }}
                            aria-label={`Edit ${habit.title}`}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                      {/* Day Cells */}
                      {matrixKeys.map((key) => {
                        const done = Boolean(habit.completions[key]);
                        const isToday = key === todayKey;
                        const scheduled = isHabitScheduledOnDay(habit, key);
                        return (
                          <td
                            key={key}
                            className="p-1 text-center"
                            style={{
                              backgroundColor: isToday
                                ? "var(--accent-soft)"
                                : "transparent",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                toggleHabitCompletion(habit.id, key)
                              }
                              title={`${habit.title} · ${key}`}
                              className="mx-auto w-7 h-7 rounded-lg border flex items-center justify-center transition-transform active:scale-90"
                              style={{
                                backgroundColor: done
                                  ? habit.color
                                  : scheduled
                                    ? "var(--bg-canvas)"
                                    : "transparent",
                                borderColor: done
                                  ? habit.color
                                  : isToday
                                    ? "var(--accent)"
                                    : "var(--border-subtle)",
                                opacity: done || scheduled ? 1 : 0.4,
                              }}
                            >
                              {done && (
                                <Check className="w-3.5 h-3.5 text-white stroke-[2.75]" />
                              )}
                            </button>
                          </td>
                        );
                      })}

                      {/* Flame Streak Column */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span
                          className="inline-flex items-center gap-1 font-mono tabular-nums text-xs font-bold"
                          style={{
                            color:
                              streak > 0 ? habit.color : "var(--text-muted)",
                          }}
                        >
                          <Flame className="w-3.5 h-3.5" />
                          <span>{streak}d</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ================= CARDS VIEW ================= */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeHabits.map((habit) => {
            const offset = cardOffsets[habit.id] ?? 0;
            const keys = getDateRange(range, offset, todayKey);
            const streak = computeStreak(habit, todayKey);
            const doneToday = Boolean(habit.completions[todayKey]);
            const rangeLabel = `${formatDaySlashMonth(keys[0])} – ${formatDaySlashMonth(
              keys[keys.length - 1],
            )}`;

            return (
              <article
                key={habit.id}
                className="rounded-2xl border p-4 space-y-4 flex flex-col justify-between"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onOpenDetail({ mode: "habit", id: habit.id })
                    }
                    className="flex items-center gap-2.5 min-w-0 text-left hover:underline"
                  >
                    <span
                      className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: `${habit.color}1c`,
                        color: habit.color,
                      }}
                    >
                      <HabitIcon name={habit.icon} className="w-4.5 h-4.5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-display text-base font-bold truncate">
                        {habit.title}
                      </h2>
                      {habit.purpose && (
                        <p
                          className="text-xs truncate"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {habit.purpose}
                        </p>
                      )}
                    </div>
                  </button>

                  {/* Top-Right Streak Counter */}
                  <span
                    className="inline-flex items-center gap-1 font-mono tabular-nums text-xs font-bold shrink-0"
                    style={{
                      color: streak > 0 ? habit.color : "var(--text-muted)",
                    }}
                  >
                    <Flame className="w-4 h-4" />
                    <span>{streak}d</span>
                  </span>
                </div>

                {/* Independent Per-Card Range Grid */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[11px] font-mono tabular-nums"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {rangeLabel}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setCardOffsets((prev) => ({
                            ...prev,
                            [habit.id]: offset - 1,
                          }))
                        }
                        className="h-6 w-6 flex items-center justify-center rounded-md border"
                        style={{
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-muted)",
                        }}
                        aria-label="Previous range"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={offset >= 0}
                        onClick={() =>
                          setCardOffsets((prev) => ({
                            ...prev,
                            [habit.id]: Math.min(0, offset + 1),
                          }))
                        }
                        className="h-6 w-6 flex items-center justify-center rounded-md border disabled:opacity-35"
                        style={{
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-muted)",
                        }}
                        aria-label="Next range"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div
                    className={`grid gap-1.5 ${
                      range === "7d"
                        ? "grid-cols-7"
                        : range === "14d"
                          ? "grid-cols-7"
                          : "grid-cols-10"
                    }`}
                  >
                    {keys.map((key) => {
                      const done = Boolean(habit.completions[key]);
                      const isToday = key === todayKey;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleHabitCompletion(habit.id, key)}
                          title={`${getDayAbbrev(key)} ${key}`}
                          className="h-9 rounded-lg border flex flex-col items-center justify-center text-[10px] font-mono tabular-nums transition-colors"
                          style={{
                            backgroundColor: done
                              ? habit.color
                              : "var(--bg-canvas)",
                            borderColor: done
                              ? habit.color
                              : isToday
                                ? "var(--accent)"
                                : "var(--border-subtle)",
                            color: done ? "#fff" : "var(--text-muted)",
                          }}
                        >
                          {done ? (
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          ) : (
                            <span>{key.slice(-2)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom-Right Check Today / Done Today Button */}
                <div
                  className="flex items-center justify-between pt-2 border-t"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <span
                    className="text-[11px] capitalize"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {habit.frequencyType}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleHabitCompletion(habit.id, todayKey)}
                    className="h-8 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                    style={{
                      backgroundColor: doneToday
                        ? habit.color
                        : "var(--bg-surface-subtle)",
                      color: doneToday ? "#fff" : "var(--text-primary)",
                    }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{doneToday ? "Done Today" : "Check Today"}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
