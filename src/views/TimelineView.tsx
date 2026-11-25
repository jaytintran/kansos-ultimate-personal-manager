import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  Flame,
  Layers,
  ListFilter,
  MoreVertical,
  Search,
  Sparkles,
  Timer,
  Trophy,
  X,
} from "lucide-react";
import { InlineTitleEdit } from "../components/InlineTitleEdit";
import { NlpInputBar } from "../components/NlpInputBar";
import { RichContent } from "../components/RichContent";
import { TimestampFieldFocus } from "../components/TimestampsModal";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  ContextMenuRecord,
  DetailSheetTarget,
  Entry,
  EntryType,
  Habit,
} from "../types";
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
  parseLocalDateKey,
  stripHtmlToText,
  toLocalDateKey,
} from "../utils/date";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import "react-day-picker/style.css";

type TimelineFilter =
  | "all"
  | "task"
  | "log"
  | "note"
  | "event"
  | "timeblock"
  | "habit";

const TIMELINE_SUBVIEW_STORAGE_KEY = "kanso_timeline_subview_v1";

const FILTER_OPTIONS: {
  id: TimelineFilter;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  colorVar: string;
}[] = [
  { id: "all", label: "All", icon: ListFilter, colorVar: "var(--text-secondary)" },
  { id: "task", label: "Tasks", icon: CheckCircle2, colorVar: "var(--color-entity-blue)" },
  { id: "log", label: "Log", icon: Flame, colorVar: "var(--accent)" },
  { id: "note", label: "Note", icon: FileText, colorVar: "var(--color-entity-violet)" },
  { id: "event", label: "Event", icon: Calendar, colorVar: "var(--success)" },
  { id: "timeblock", label: "Blocks", icon: Timer, colorVar: "var(--warning)" },
  { id: "habit", label: "Habit", icon: Sparkles, colorVar: "var(--success)" },
];

function formatDurationLabel(
  startIso?: string | null,
  endIso?: string | null,
): string {
  if (!startIso || !endIso) return "";
  const mins = Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000,
  );
  if (!Number.isFinite(mins) || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function buildStructuredDayItems(entries: Entry[]) {
  const blocks = entries.filter(
    (e) => e.type === "timeblock" && e.scheduledAt && e.endAt,
  );
  const nestedIds = new Set<string>();
  const blockChildren = new Map<string, Entry[]>();

  for (const block of blocks) {
    const start = new Date(block.scheduledAt!).getTime();
    const end = new Date(block.endAt!).getTime();
    const children: Entry[] = [];
    for (const candidate of entries) {
      if (candidate.id === block.id || candidate.type === "timeblock")
        continue;
      if (nestedIds.has(candidate.id)) continue;
      const t = getEntrySortTime(candidate);
      if (t >= start && t <= end) {
        children.push(candidate);
        nestedIds.add(candidate.id);
      }
    }
    blockChildren.set(block.id, children);
  }

  const topLevel = entries.filter((e) => !nestedIds.has(e.id));
  return { topLevel, blockChildren };
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
  const [subview, setSubview] = useState<"day" | "all-dates">(() => {
    try {
      const saved = localStorage.getItem(TIMELINE_SUBVIEW_STORAGE_KEY);
      return saved === "all-dates" ? "all-dates" : "day";
    } catch {
      return "day";
    }
  });
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey);
  const [calendarPopoverOpen, setCalendarPopoverOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TimelineFilter>("all");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [composerType, setComposerType] = useState<EntryType>(
    workspace.settings.defaultTimelineType || "task",
  );
  const [carryOverCollapsed, setCarryOverCollapsed] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const timeFormat = workspace.settings.timeFormat;
  const displayMode = workspace.settings.timelineDisplayMode || "default";

  useEffect(() => {
    try {
      localStorage.setItem(TIMELINE_SUBVIEW_STORAGE_KEY, subview);
    } catch {
      // Ignore storage errors
    }
  }, [subview]);

  useEffect(() => {
    if (!filterMenuOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        filterMenuRef.current &&
        !filterMenuRef.current.contains(e.target as Node)
      ) {
        setFilterMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFilterMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [filterMenuOpen]);

  // Keyboard shortcuts: Cmd/Ctrl+K or '/' focuses search, Escape clears, A/D steps days
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable = Boolean(
        target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable ||
            target.closest('[contenteditable="true"]')),
      );
      const activeEl = document.activeElement as HTMLElement | null;
      const activeIsEditable = Boolean(
        activeEl &&
          (activeEl.tagName === "INPUT" ||
            activeEl.tagName === "TEXTAREA" ||
            activeEl.tagName === "SELECT" ||
            activeEl.isContentEditable ||
            activeEl.closest('[contenteditable="true"]')),
      );

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "/" && !isEditable && !activeIsEditable) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (
        e.key === "Escape" &&
        document.activeElement === searchInputRef.current
      ) {
        e.preventDefault();
        setSearchQuery("");
        searchInputRef.current?.blur();
      } else if (
        subview === "day" &&
        !isEditable &&
        !activeIsEditable &&
        !calendarPopoverOpen &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        !document.querySelector('[role="dialog"]')
      ) {
        const keyLower = e.key.toLowerCase();
        if (keyLower === "a") {
          e.preventDefault();
          setSelectedDateKey((prev) => addDaysToKey(prev, -1));
        } else if (keyLower === "d") {
          e.preventDefault();
          setSelectedDateKey((prev) => addDaysToKey(prev, 1));
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [calendarPopoverOpen, subview]);

  const habitMap = useMemo(() => {
    const map = new Map<string, Habit>();
    for (const h of workspace.habits) map.set(h.id, h);
    return map;
  }, [workspace.habits]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const e of workspace.entries) {
      for (const t of e.tags) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [workspace.entries]);

  const visibleEntries = useMemo(
    () =>
      workspace.entries.filter((e) => {
        if (!isVisibleOnTimeline(e)) return false;
        if ((e.source === "habit" || e.habitId) && e.habitId) {
          const habit = habitMap.get(e.habitId);
          const dateKey = e.habitDateKey || getEntryDayKey(e);
          if (habit?.missedDates?.[dateKey] && !habit.completions?.[dateKey]) {
            return false;
          }
        }
        return true;
      }),
    [workspace.entries, habitMap],
  );

  const matchesTypeFilter = (entry: Entry): boolean => {
    if (typeFilter === "all") return true;
    if (typeFilter === "habit")
      return entry.source === "habit" || Boolean(entry.habitId);
    if (typeFilter === "log")
      return entry.type === "log" && entry.source !== "habit";
    return entry.type === typeFilter;
  };

  // Full-text search across all days
  const trimmedSearch = searchQuery.trim().toLowerCase();
  const searchGroups = useMemo(() => {
    if (!trimmedSearch) return null;
    const matches = visibleEntries.filter((entry) => {
      if (!matchesTypeFilter(entry)) return false;
      const hay = `${entry.title} ${stripHtmlToText(entry.content)} ${(
        entry.tags || []
      ).join(" ")}`.toLowerCase();
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
          items: items.sort(
            (a, b) => getEntrySortTime(a) - getEntrySortTime(b),
          ),
        })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedSearch, visibleEntries, typeFilter]);

  // All-Dates Spine grouped newest-first, skipping days with no records
  // (future dates with records are included; empty future/past days are skipped)
  const allDatesGroups = useMemo(() => {
    const byDay = new Map<string, Entry[]>();
    let total = 0;

    for (const entry of visibleEntries) {
      if (!matchesTypeFilter(entry)) continue;
      if (trimmedSearch) {
        const hay = `${entry.title} ${stripHtmlToText(entry.content)} ${(
          entry.tags || []
        ).join(" ")}`.toLowerCase();
        if (!hay.includes(trimmedSearch)) continue;
      }
      const dayKey = getEntryDayKey(entry);
      const list = byDay.get(dayKey) || [];
      list.push(entry);
      byDay.set(dayKey, list);
      total++;
    }

    const days = Array.from(byDay.entries())
      .filter(([, items]) => items.length > 0)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dayKey, items]) => {
        const sorted = [...items].sort(
          (a, b) => getEntrySortTime(a) - getEntrySortTime(b),
        );
        return {
          dayKey,
          count: sorted.length,
          structured: buildStructuredDayItems(sorted),
        };
      });

    return { total, days };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEntries, typeFilter, trimmedSearch]);

  // Day entries for selectedDateKey
  const dayEntries = useMemo(() => {
    return visibleEntries
      .filter(
        (e) => getEntryDayKey(e) === selectedDateKey && matchesTypeFilter(e),
      )
      .sort((a, b) => getEntrySortTime(a) - getEntrySortTime(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEntries, selectedDateKey, typeFilter]);

  // Unfinished carry-over tasks from earlier days (shown on Today only in Day subview)
  const carryOverTasks = useMemo(() => {
    if (subview !== "day" || selectedDateKey !== todayKey || trimmedSearch)
      return [];
    return visibleEntries
      .filter(
        (e) =>
          e.type === "task" && !e.completed && getEntryDayKey(e) < todayKey,
      )
      .sort((a, b) => getEntryDayKey(b).localeCompare(getEntryDayKey(a)));
  }, [subview, visibleEntries, selectedDateKey, todayKey, trimmedSearch]);

  // Structure day entries so Time Blocks wrap entries occurring inside their [start, end] range
  const structuredDayItems = useMemo(
    () => buildStructuredDayItems(dayEntries),
    [dayEntries],
  );

  const openEntryDetail = (entry: Entry) => {
    const mode =
      entry.type === "note"
        ? "note"
        : entry.type === "event"
          ? "event"
          : entry.type === "log"
            ? "log"
            : "task";
    onOpenDetail({ mode, id: entry.id });
  };

  /* Restored quiet Kanso circular spine node (compact 28px in default, 20px in compact/flat) */
  const renderSpineNode = (entry: Entry, nested = false) => {
    const isHabit = entry.source === "habit" || Boolean(entry.habitId);
    const isCompact = displayMode === "compact" || nested;
    const nodeBg = nested ? "transparent" : "var(--bg-canvas)";

    if (entry.type === "task") {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleEntryCompleted(entry.id);
          }}
          className={`${
            isCompact ? "w-5 h-5" : "w-7 h-7"
          } rounded-full flex items-center justify-center shrink-0 transition-colors hover:text-[var(--accent)]`}
          style={{
            backgroundColor: nodeBg,
            color: entry.completed ? "var(--success)" : "var(--text-muted)",
          }}
          title={entry.completed ? "Reopen task" : "Complete task"}
          aria-label={entry.completed ? "Reopen task" : "Complete task"}
        >
          {entry.completed ? (
            <CheckCircle2 className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          ) : (
            <Circle className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          )}
        </button>
      );
    }

    if (isHabit) {
      return (
        <span
          className={`${
            isCompact ? "w-5 h-5" : "w-7 h-7 border"
          } rounded-full flex items-center justify-center shrink-0`}
          style={{
            backgroundColor: nodeBg,
            borderColor: "var(--border-subtle)",
            color: "var(--color-entity-amber)",
          }}
        >
          <Flame className={isCompact ? "w-3 h-3" : "w-3.5 h-3.5"} />
        </span>
      );
    }

    if (entry.type === "event") {
      return (
        <span
          className={`${
            isCompact ? "w-5 h-5" : "w-7 h-7 border"
          } rounded-full flex items-center justify-center shrink-0`}
          style={{
            backgroundColor: nodeBg,
            borderColor: "var(--border-subtle)",
            color: "var(--color-entity-blue)",
          }}
        >
          <Calendar className={isCompact ? "w-3 h-3" : "w-3.5 h-3.5"} />
        </span>
      );
    }

    if (entry.type === "note") {
      return (
        <span
          className={`${
            isCompact ? "w-5 h-5" : "w-7 h-7 border"
          } rounded-full flex items-center justify-center shrink-0`}
          style={{
            backgroundColor: nodeBg,
            borderColor: "var(--border-subtle)",
            color: "var(--color-entity-violet)",
          }}
        >
          <FileText className={isCompact ? "w-3 h-3" : "w-3.5 h-3.5"} />
        </span>
      );
    }

    // Log entry: quiet classic spine dot
    return (
      <span
        className={`${
          isCompact ? "w-5 h-5" : "w-7 h-7"
        } rounded-full flex items-center justify-center shrink-0`}
        style={{ backgroundColor: nodeBg }}
      >
        <span
          className={`${isCompact ? "w-2 h-2" : "w-2.5 h-2.5"} rounded-full ring-2`}
          style={{
            backgroundColor: "var(--accent)",
            boxShadow: "0 0 0 2px var(--accent-soft)",
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
            entry.scheduledAt
              ? "scheduled"
              : entry.completedAt
                ? "completed"
                : "date",
          );
        }}
        className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
        style={{
          color: entry.scheduledAt
            ? "var(--color-entity-blue)"
            : entry.completedAt
              ? "var(--success)"
              : "var(--text-muted)",
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
          onOpenContextMenu({ kind: "entry", entry }, e);
        }}
        className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
        style={{ color: "var(--text-muted)" }}
        title="More actions"
        aria-label="More actions"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const renderEntryRow = (entry: Entry, nested = false) => {
    const isHabit = entry.source === "habit" || Boolean(entry.habitId);
    const displayTitle = isHabit ? getCleanTitle(entry) : entry.title;
    const isCompletedTask = entry.type === "task" && entry.completed;
    const allowInline = displayMode !== "compact" && !isHabit;
    const hasRichPreview =
      displayMode === "default" &&
      Boolean(entry.content && stripHtmlToText(entry.content));

    const dateLabel = formatDaySlashMonth(getEntryDayKey(entry));
    const createdLabel = formatTime(entry.createdAt, timeFormat);
    const scheduledLabel = entry.scheduledAt
      ? formatTime(entry.scheduledAt, timeFormat)
      : null;
    const completedLabel = entry.completedAt
      ? formatTime(entry.completedAt, timeFormat)
      : null;

    return (
      <div
        key={entry.id}
        onClick={() => openEntryDetail(entry)}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenContextMenu({ kind: "entry", entry }, e);
        }}
        className={`group relative flex items-start gap-2.5 sm:gap-3 cursor-pointer ${
          displayMode === "compact" ? "py-0.5" : nested ? "py-1" : "py-1.5"
        } ${
          displayMode === "flat" && !nested ? "border-b last:border-b-0" : ""
        }`}
        style={
          displayMode === "flat" && !nested
            ? { borderColor: "var(--border-subtle)" }
            : undefined
        }
      >
        {/* Compact Quiet Spine Node */}
        <div
          className={`relative z-10 shrink-0 ${
            displayMode === "compact" || nested ? "mt-1.5" : "mt-1"
          }`}
        >
          {renderSpineNode(entry, nested)}
        </div>

        {/* Restored Borderless-on-Canvas Entry Body */}
        <div
          className={`flex-1 min-w-0 rounded-xl transition-colors ${
            nested
              ? "px-2 py-1 hover:bg-[var(--bg-surface)]/75"
              : displayMode === "compact"
                ? "px-2 py-1 hover:bg-[var(--bg-surface-subtle)]/75"
                : "px-2.5 py-1.5 hover:bg-[var(--bg-surface-subtle)]/75"
          }`}
        >
          <div className="flex flex-row items-center justify-between gap-2 sm:gap-3">
            {/* Title + Timestamps + Tags + Faded Rich Preview */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                {allowInline ? (
                  <InlineTitleEdit
                    value={displayTitle}
                    allowMobileEdit={false}
                    onCommit={(next) => updateEntry(entry.id, { title: next })}
                    className={`text-[14.5px] font-medium leading-snug ${
                      isCompletedTask ? "line-through" : ""
                    }`}
                    style={{
                      color: isCompletedTask
                        ? "var(--text-muted)"
                        : "var(--text-primary)",
                    }}
                  />
                ) : (
                  <span
                    className={`text-sm font-medium leading-snug truncate ${
                      isCompletedTask ? "line-through" : ""
                    }`}
                    style={{
                      color: isCompletedTask
                        ? "var(--text-muted)"
                        : "var(--text-primary)",
                    }}
                  >
                    {displayTitle}
                  </span>
                )}

                {entry.isAchievement && (
                  <Trophy
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: "var(--warning)" }}
                  />
                )}
              </div>

              {/* Always-Visible Clickable Monospace Date & Timestamps + Inline Tags */}
              <div
                className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-mono tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenTimestamps(entry.id, "date");
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
                    onOpenTimestamps(entry.id, "created");
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
                      onOpenTimestamps(entry.id, "scheduled");
                    }}
                    className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                    style={{ color: "var(--color-entity-blue)" }}
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
                      onOpenTimestamps(entry.id, "completed");
                    }}
                    className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                    style={{ color: "var(--success)" }}
                    title="Edit completed time"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{completedLabel}</span>
                  </button>
                )}

                <span className="uppercase tracking-wider opacity-75 text-[10px]">
                  {isHabit ? "Habit" : entry.type}
                </span>

                {entry.tags.length > 0 && (
                  <span className="opacity-85">
                    {entry.tags.map((t) => `#${t}`).join(" ")}
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
            <div className="flex items-center shrink-0">
              {renderAlwaysVisibleActions(entry)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* Soft-Tinted Vertical Band Wrapping Nested Time Block Items */
  const renderTimeBlock = (block: Entry, children: Entry[]) => {
    const startLabel = block.scheduledAt
      ? formatTime(block.scheduledAt, timeFormat)
      : "";
    const endLabel = block.endAt ? formatTime(block.endAt, timeFormat) : "";
    const duration = formatDurationLabel(block.scheduledAt, block.endAt);

    return (
      <div
        key={block.id}
        className={`relative z-10 my-2.5 ${
          displayMode === "default"
            ? "ml-3.5"
            : displayMode === "compact"
              ? "ml-2.5"
              : ""
        }`}
      >
        <div
          className="rounded-xl border border-l-[3px] overflow-hidden"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--accent) 6%, var(--bg-surface))",
            borderColor:
              "color-mix(in srgb, var(--accent) 20%, var(--border-subtle))",
            borderLeftColor: "var(--accent)",
          }}
        >
          {/* Time Block Band Header */}
          <div
            onClick={() => openEntryDetail(block)}
            onContextMenu={(e) => {
              e.preventDefault();
              onOpenContextMenu({ kind: "entry", entry: block }, e);
            }}
            className="flex items-center justify-between gap-2 px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[var(--accent-soft)]/50"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Timer
                className="w-4 h-4 shrink-0"
                style={{ color: "var(--accent)" }}
              />
              <span
                className="text-sm font-semibold truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {block.title}
              </span>
              <span
                className="text-[11px] font-mono tabular-nums shrink-0"
                style={{ color: "var(--accent)" }}
              >
                {startLabel} – {endLabel}
              </span>
              {duration && (
                <span
                  className="text-[10.5px] font-mono tabular-nums shrink-0 opacity-80"
                  style={{ color: "var(--text-secondary)" }}
                >
                  ({duration})
                </span>
              )}
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTimestamps(block.id, "scheduled");
                }}
                className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{ color: "var(--accent)" }}
                title="Edit block time"
                aria-label="Edit block time"
              >
                <Clock className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenContextMenu({ kind: "entry", entry: block }, e);
                }}
                className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{ color: "var(--text-muted)" }}
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
              borderColor: "color-mix(in srgb, var(--accent) 14%, transparent)",
            }}
          >
            {children.length > 0 ? (
              <div className="relative">
                <div
                  className="absolute left-[9.5px] top-3 bottom-3 w-px"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--accent) 28%, var(--spine-line))",
                  }}
                  aria-hidden="true"
                />
                {children.map((child) => renderEntryRow(child, true))}
              </div>
            ) : (
              <div
                className="py-2 pl-2 text-xs font-mono tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                Focused window · {startLabel} – {endLabel}
                {duration ? ` · ${duration}` : ""}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const spineLeftClass =
    displayMode === "compact" ? "left-[9.5px]" : "left-[13.5px]";

  return (
    <div className="h-full flex-1 min-h-0 flex flex-col overflow-hidden overscroll-none lg:block lg:h-auto lg:overflow-visible">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-none lg:overflow-visible">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 pb-4 lg:pb-36 space-y-5">
      {/* Header: Title Date Picker / All-Dates + Mode Switcher & Type Filter Dropdown + Search */}
      <header
        className="space-y-2.5 relative"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: Single-Day Scrubber OR All-Dates Title */}
          {subview === "day" ? (
            <div className="order-1 relative flex items-center gap-1 sm:gap-1.5 shrink-0 min-w-0">
              <div className="flex items-center gap-0.5 min-w-0">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedDateKey((prev) => addDaysToKey(prev, -1))
                  }
                  className="h-8 w-6 sm:w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer shrink-0"
                  style={{ color: "var(--text-secondary)" }}
                  title="Previous day (A)"
                  aria-label="Previous day"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setCalendarPopoverOpen((v) => !v)}
                  className="font-display text-[15px] sm:text-[20px] font-semibold tracking-tight leading-tight whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 px-1 py-0.5 rounded-lg hover:bg-[var(--bg-surface-subtle)] focus:outline-none"
                  style={{ color: "var(--text-primary)" }}
                  title="Change date"
                >
                  <span>{formatCompactDayHeading(selectedDateKey)}</span>
                  <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-50 shrink-0 mt-0.5" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedDateKey((prev) => addDaysToKey(prev, 1))
                  }
                  className="h-8 w-6 sm:w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer shrink-0"
                  style={{ color: "var(--text-secondary)" }}
                  title="Next day (D)"
                  aria-label="Next day"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {selectedDateKey !== todayKey && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDateKey(todayKey);
                    setCalendarPopoverOpen(false);
                  }}
                  className="h-7 px-2 rounded-lg border text-[11px] font-semibold transition-colors hover:bg-[var(--accent-soft)] cursor-pointer shrink-0"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--accent)",
                  }}
                  title="Jump back to Today"
                >
                  Today
                </button>
              )}

              {/* Calendar Dropdown (Theme-Integrated react-day-picker) */}
              {calendarPopoverOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setCalendarPopoverOpen(false)}
                  />
                  <div
                    className="absolute left-0 top-10 z-30 p-3 rounded-xl border shadow-lg w-[320px]"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-strong)",
                      boxShadow: "var(--shadow-popover)",
                    }}
                  >
                    <div className="flex flex-col gap-2">
                      <DayPicker
                        mode="single"
                        selected={parseLocalDateKey(selectedDateKey)}
                        defaultMonth={parseLocalDateKey(selectedDateKey)}
                        showOutsideDays
                        onSelect={(day) => {
                          if (day) {
                            setSelectedDateKey(toLocalDateKey(day));
                            setCalendarPopoverOpen(false);
                          }
                        }}
                        components={{
                          Chevron: ({ orientation }) =>
                            orientation === "left" ? (
                              <ChevronLeft className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            ),
                        }}
                        classNames={{
                          root: "w-full max-w-[308px] select-none",
                          months: "relative flex flex-col",
                          month: "w-full space-y-2.5",
                          month_caption:
                            "flex items-center justify-center relative h-8",
                          caption_label:
                            "font-display text-sm font-semibold text-[var(--text-primary)]",
                          nav: "flex items-center justify-between absolute inset-x-0 top-0 h-8 pointer-events-none z-10",
                          button_previous:
                            "pointer-events-auto h-7 w-7 inline-flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer",
                          button_next:
                            "pointer-events-auto h-7 w-7 inline-flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer",
                          month_grid: "w-full border-collapse",
                          weekdays: "grid grid-cols-7 mb-1",
                          weekday:
                            "text-center text-[11px] font-medium text-[var(--text-muted)] py-1",
                          weeks: "space-y-0.5",
                          week: "grid grid-cols-7",
                          day: "flex items-center justify-center p-0.5",
                          day_button:
                            "w-9 h-8 rounded-lg font-mono tabular-nums text-xs flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] cursor-pointer",
                          selected:
                            "[&>button]:bg-[var(--accent)] [&>button]:text-[var(--accent-fg)] [&>button]:font-semibold [&>button]:hover:bg-[var(--accent)]",
                          today:
                            "[&>button]:ring-1 [&>button]:ring-[var(--accent)] [&>button]:text-[var(--accent)] [&>button]:font-semibold",
                          outside: "[&>button]:opacity-35",
                          disabled:
                            "[&>button]:opacity-25 [&>button]:cursor-not-allowed",
                        }}
                      />

                      {/* Jump to Today Footer */}
                      {selectedDateKey !== todayKey && (
                        <div
                          className="pt-2 border-t"
                          style={{ borderColor: "var(--border-subtle)" }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDateKey(todayKey);
                              setCalendarPopoverOpen(false);
                            }}
                            className="w-full h-8 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center cursor-pointer hover:bg-[var(--accent-soft)]"
                            style={{
                              backgroundColor: "var(--bg-surface)",
                              color: "var(--accent)",
                              border: "1px solid var(--border-subtle)",
                            }}
                          >
                            Jump to Today
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="order-1 flex items-baseline gap-2.5 min-w-0">
              <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight whitespace-nowrap">
                All Dates
              </h1>
              <span
                className="text-xs font-mono tabular-nums whitespace-nowrap"
                style={{ color: "var(--text-muted)" }}
              >
                {allDatesGroups.days.length}{" "}
                {allDatesGroups.days.length === 1 ? "day" : "days"} ·{" "}
                {allDatesGroups.total}{" "}
                {allDatesGroups.total === 1 ? "record" : "records"}
              </span>
            </div>
          )}

          {/* Right controls on desktop; on mobile Search drops below the header (order-3 basis-full) */}
          <div className="contents sm:flex sm:items-center sm:gap-2 sm:order-2">
            {/* Mode Switcher (Day | All Dates) + Custom Kanso Filter Dropdown */}
            <div className="order-2 sm:order-1 flex items-center gap-1.5 shrink-0">
              <div
                className="inline-flex items-center h-8 p-0.5 rounded-lg border shrink-0"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
                role="group"
                aria-label="Timeline subview"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSubview("day");
                  }}
                  className="h-full px-2 sm:px-2.5 rounded-md text-[11px] sm:text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  style={{
                    backgroundColor:
                      subview === "day" ? "var(--accent-soft)" : "transparent",
                    color:
                      subview === "day" ? "var(--accent)" : "var(--text-muted)",
                  }}
                  aria-pressed={subview === "day"}
                >
                  <CalendarDays className="hidden sm:inline w-3.5 h-3.5 shrink-0" />
                  <span>Day</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCalendarPopoverOpen(false);
                    setSubview("all-dates");
                  }}
                  className="h-full px-2 sm:px-2.5 rounded-md text-[11px] sm:text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  style={{
                    backgroundColor:
                      subview === "all-dates"
                        ? "var(--accent-soft)"
                        : "transparent",
                    color:
                      subview === "all-dates"
                        ? "var(--accent)"
                        : "var(--text-muted)",
                  }}
                  aria-pressed={subview === "all-dates"}
                >
                  <Layers className="hidden sm:inline w-3.5 h-3.5 shrink-0" />
                  <span>All Dates</span>
                </button>
              </div>

              {/* Restyled Kanso Type Filter Popover */}
              {(() => {
                const activeMeta =
                  FILTER_OPTIONS.find((o) => o.id === typeFilter) ??
                  FILTER_OPTIONS[0];
                const ActiveIcon = activeMeta.icon;
                const isFiltered = typeFilter !== "all";
                return (
                  <div className="relative shrink-0" ref={filterMenuRef}>
                    <button
                      type="button"
                      onClick={() => setFilterMenuOpen((v) => !v)}
                      aria-haspopup="listbox"
                      aria-expanded={filterMenuOpen}
                      aria-label="Filter timeline by record type"
                      className="h-8 px-2 sm:px-2.5 rounded-lg border text-[11px] sm:text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer hover:bg-[var(--bg-surface-hover)]"
                      style={{
                        backgroundColor:
                          isFiltered || filterMenuOpen
                            ? "var(--accent-soft)"
                            : "var(--bg-surface)",
                        borderColor:
                          isFiltered || filterMenuOpen
                            ? "var(--accent)"
                            : "var(--border-subtle)",
                        color:
                          isFiltered || filterMenuOpen
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                      }}
                    >
                      <ActiveIcon
                        className="w-3.5 h-3.5 shrink-0"
                        style={{
                          color: isFiltered
                            ? "var(--accent)"
                            : activeMeta.colorVar,
                        }}
                      />
                      <span>{activeMeta.label}</span>
                      <ChevronDown
                        className="w-3.5 h-3.5 opacity-60 shrink-0 transition-transform duration-150"
                        style={{
                          transform: filterMenuOpen
                            ? "rotate(180deg)"
                            : undefined,
                        }}
                      />
                    </button>

                    {filterMenuOpen && (
                      <div
                        role="listbox"
                        aria-label="Timeline record types"
                        className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border p-1 space-y-0.5 z-40"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          borderColor: "var(--border-strong)",
                          boxShadow: "var(--shadow-popover)",
                        }}
                      >
                        {FILTER_OPTIONS.map((opt) => {
                          const Icon = opt.icon;
                          const selected = opt.id === typeFilter;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() => {
                                setTypeFilter(opt.id);
                                setFilterMenuOpen(false);
                              }}
                              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer hover:bg-[var(--bg-surface-subtle)]"
                              style={{
                                backgroundColor: selected
                                  ? "var(--accent-soft)"
                                  : "transparent",
                                color: selected
                                  ? "var(--accent)"
                                  : "var(--text-primary)",
                              }}
                            >
                              <span className="inline-flex items-center gap-2 min-w-0">
                                <Icon
                                  className="w-3.5 h-3.5 shrink-0"
                                  style={{
                                    color: selected
                                      ? "var(--accent)"
                                      : opt.colorVar,
                                  }}
                                />
                                <span className="truncate">{opt.label}</span>
                              </span>
                              {selected && (
                                <Check className="w-3.5 h-3.5 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Search Bar: below view header on mobile (order-3 basis-full), right of controls on desktop */}
            <div
              className="order-3 basis-full sm:order-2 sm:basis-auto flex items-center gap-1.5 h-9 sm:h-8 px-2.5 rounded-xl sm:rounded-lg border sm:w-44 md:w-52 transition-colors"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: searchQuery
                  ? "var(--accent)"
                  : "var(--border-subtle)",
              }}
            >
              <Search
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search timeline... (⌘K)"
                className="flex-1 min-w-0 bg-transparent text-xs outline-none"
                style={{ color: "var(--text-primary)" }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="opacity-70 hover:opacity-100 shrink-0 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Unfinished Carry-Over Strip (Today only) */}
      {carryOverTasks.length > 0 && (
        <section
          className="rounded-xl border overflow-hidden"
          style={{
            backgroundColor: "rgba(217, 119, 6, 0.06)",
            borderColor: "rgba(217, 119, 6, 0.28)",
          }}
        >
          <button
            type="button"
            onClick={() => setCarryOverCollapsed((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold"
            style={{ color: "var(--warning)" }}
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
              style={{ borderColor: "rgba(217, 119, 6, 0.18)" }}
            >
              {carryOverTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">
                      {task.title}
                    </div>
                    <div
                      className="text-[11px] font-mono"
                      style={{ color: "var(--text-muted)" }}
                    >
                      From {formatCompactDayHeading(getEntryDayKey(task))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveEntryToDate(task.id, todayKey)}
                      className="h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <ArrowRight className="w-3 h-3" />
                      <span>Move to today</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleEntryCompleted(task.id)}
                      className="h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1"
                      style={{
                        backgroundColor: "var(--success)",
                        color: "#fff",
                      }}
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

      {/* All-Dates Spine Subview vs Search Results vs Single-Day Spine */}
      {subview === "all-dates" ? (
        <section className="space-y-6">
          {trimmedSearch && (
            <div
              className="px-3.5 py-2 rounded-xl border text-xs font-medium flex items-center justify-between"
              style={{
                backgroundColor: "var(--accent-soft)",
                borderColor: "var(--accent)",
                color: "var(--accent)",
              }}
            >
              <span>
                {allDatesGroups.total}{" "}
                {allDatesGroups.total === 1 ? "match" : "matches"} for &ldquo;
                {searchQuery.trim()}&rdquo;
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="underline text-[11px]"
              >
                Clear
              </button>
            </div>
          )}

          {allDatesGroups.days.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed py-14 px-4 text-center space-y-1.5"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              <p className="text-sm font-medium">
                {trimmedSearch || typeFilter !== "all"
                  ? "No matching records across any dates"
                  : "No recorded dates on the spine yet"}
              </p>
              <p className="text-xs">
                {trimmedSearch || typeFilter !== "all"
                  ? "Try clearing your search or switching record filters."
                  : "Add entries on any day and they will appear here newest-first."}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {allDatesGroups.days.map(({ dayKey, count, structured }) => {
                const isToday = dayKey === todayKey;
                const isFuture = dayKey > todayKey;
                return (
                  <div
                    key={dayKey}
                    className="space-y-1.5 [content-visibility:auto] [contain-intrinsic-size:auto_220px]"
                  >
                    <div className="flex items-center justify-between gap-2 px-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDateKey(dayKey);
                          setSubview("day");
                        }}
                        className="group/day inline-flex items-center gap-2 text-left rounded-md px-1.5 py-0.5 -ml-1.5 transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                        title={`Open ${formatCompactDayHeading(dayKey)} in Day view`}
                      >
                        <span
                          className="text-xs font-semibold font-mono"
                          style={{
                            color: isToday
                              ? "var(--accent)"
                              : isFuture
                                ? "var(--color-entity-blue)"
                                : "var(--text-primary)",
                          }}
                        >
                          {formatCompactDayHeading(dayKey)}
                        </span>
                        {isFuture && (
                          <span
                            className="text-[10px] font-mono uppercase tracking-wider"
                            style={{ color: "var(--color-entity-blue)" }}
                          >
                            Scheduled
                          </span>
                        )}
                        <ArrowRight
                          className="w-3 h-3 opacity-0 group-hover/day:opacity-75 transition-opacity"
                          style={{ color: "var(--accent)" }}
                        />
                      </button>

                      <span
                        className="text-[11px] font-mono tabular-nums shrink-0"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {count} {count === 1 ? "record" : "records"}
                      </span>
                    </div>

                    <div className="relative">
                      {displayMode !== "flat" &&
                        structured.topLevel.length > 1 && (
                          <div
                            className={`absolute ${spineLeftClass} top-4 bottom-4 w-px`}
                            style={{ backgroundColor: "var(--spine-line)" }}
                            aria-hidden="true"
                          />
                        )}
                      {structured.topLevel.map((entry) =>
                        entry.type === "timeblock"
                          ? renderTimeBlock(
                              entry,
                              structured.blockChildren.get(entry.id) || [],
                            )
                          : renderEntryRow(entry),
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : searchGroups ? (
        <div className="space-y-6">
          <div
            className="px-3.5 py-2 rounded-xl border text-xs font-medium flex items-center justify-between"
            style={{
              backgroundColor: "var(--accent-soft)",
              borderColor: "var(--accent)",
              color: "var(--accent)",
            }}
          >
            <span>
              {searchGroups.total}{" "}
              {searchGroups.total === 1 ? "match" : "matches"} for &ldquo;
              {searchQuery.trim()}&rdquo;
            </span>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="underline text-[11px]"
            >
              Clear
            </button>
          </div>

          {searchGroups.days.map(({ dayKey, items }) => (
            <div
              key={dayKey}
              className="space-y-1.5 [content-visibility:auto] [contain-intrinsic-size:auto_220px]"
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedDateKey(dayKey);
                  setSearchQuery("");
                  setSubview("day");
                }}
                className="text-xs font-semibold font-mono px-1 hover:underline cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                {formatCompactDayHeading(dayKey)}
              </button>
              <div className="relative">
                {displayMode !== "flat" && items.length > 1 && (
                  <div
                    className={`absolute ${spineLeftClass} top-4 bottom-4 w-px`}
                    style={{ backgroundColor: "var(--spine-line)" }}
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
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              <p className="text-sm font-medium">Quiet day on the spine</p>
              <p className="text-xs">
                Use the NLP bar below to log work, schedule a task, or block
                time.
              </p>
            </div>
          ) : (
            <div className="relative">
              {displayMode !== "flat" &&
                structuredDayItems.topLevel.length > 1 && (
                  <div
                    className={`absolute ${spineLeftClass} top-4 bottom-4 w-px`}
                    style={{ backgroundColor: "var(--spine-line)" }}
                    aria-hidden="true"
                  />
                )}
              {structuredDayItems.topLevel.map((entry) =>
                entry.type === "timeblock"
                  ? renderTimeBlock(
                      entry,
                      structuredDayItems.blockChildren.get(entry.id) || [],
                    )
                  : renderEntryRow(entry),
              )}
            </div>
          )}
        </section>
      )}

        </div>
      </div>

      {/* Docked Mobile Input Bar (above bottom nav) · Floating Desktop Input Bar */}
      <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 lg:border-t-0 lg:bg-transparent lg:fixed lg:bottom-4 lg:left-60 lg:right-0 lg:z-20 lg:px-6 lg:py-0 lg:pointer-events-none">
        <div className="max-w-6xl mx-auto lg:pointer-events-auto">
          <NlpInputBar
            placeholder='Add to timeline (type "/" for /task, /log, /note, /event, /timeblock)...'
            onSubmit={(raw) => {
              const created = addTimelineEntry(
                composerType,
                raw,
                selectedDateKey,
              );
              return Boolean(created);
            }}
            baseDateKey={selectedDateKey}
            availableTags={availableTags}
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
