import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  CheckSquare,
  Flame,
  Info,
  MoreVertical,
  Timer,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { NlpInputBar, NlpTypeOption } from "../components/NlpInputBar";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  ContextMenuRecord,
  DetailSheetTarget,
  Entry,
  EntryType,
  ListItem,
} from "../types";
import {
  addDaysToKey,
  formatCompactDayHeading,
  formatTime,
  getTodayKey,
  toLocalDateKey,
} from "../utils/date";

type TimeFilter = "all" | "week" | "month" | "year";
type SourceFilter = "all" | "lists" | "events" | "logs" | "focus";

interface AchievementRowItem {
  id: string;
  source: Exclude<SourceFilter, "all">;
  sourceLabel: string;
  title: string;
  tags: string[];
  achievedAt: string;
  dayKey: string;
  record: ContextMenuRecord;
  detailTarget: DetailSheetTarget;
}

interface AchievementsViewProps {
  onOpenDetail: (target: DetailSheetTarget) => void;
  onOpenContextMenu: (record: ContextMenuRecord, e: React.MouseEvent) => void;
}

const ACHIEVEMENT_TYPE_OPTIONS: NlpTypeOption[] = [
  {
    id: "log",
    command: "/log",
    label: "Log",
    hint: "Standalone win or milestone",
    icon: Flame,
    colorVar: "var(--warning)",
  },
  {
    id: "task",
    command: "/task",
    label: "Task",
    hint: "Completed focus task",
    icon: CheckSquare,
    colorVar: "var(--color-entity-blue)",
  },
  {
    id: "event",
    command: "/event",
    label: "Event",
    hint: "Completed event or gathering",
    icon: Calendar,
    colorVar: "var(--success)",
  },
  {
    id: "timeblock",
    command: "/timeblock",
    aliases: ["block"],
    label: "Block",
    hint: "Completed deep work session",
    icon: Timer,
    colorVar: "var(--accent)",
  },
];

export const AchievementsView: React.FC<AchievementsViewProps> = ({
  onOpenDetail,
  onOpenContextMenu,
}) => {
  const { workspace, addAchievementEntry } = useWorkspace();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [composerType, setComposerType] = useState<EntryType>("log");
  const [infoOpen, setInfoOpen] = useState(false);
  const infoPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!infoOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        infoPopoverRef.current &&
        !infoPopoverRef.current.contains(e.target as Node)
      ) {
        setInfoOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInfoOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [infoOpen]);

  const todayKey = getTodayKey();
  const timeFormat = workspace.settings.timeFormat;

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const entry of workspace.entries) {
      for (const tag of entry.tags || []) tagSet.add(tag);
    }
    for (const item of workspace.listItems) {
      for (const tag of item.tags || []) tagSet.add(tag);
    }
    return Array.from(tagSet).sort();
  }, [workspace.entries, workspace.listItems]);

  const listMap = useMemo(() => {
    const map = new Map<string, string>();
    workspace.lists.forEach((l) => map.set(l.id, l.title));
    return map;
  }, [workspace.lists]);

  const allAchievements = useMemo<AchievementRowItem[]>(() => {
    const rows: AchievementRowItem[] = [];

    // 1. Derived completed ListItems (status === 'done')
    for (const item of workspace.listItems) {
      if (item.status !== "done") continue;
      if (!listMap.has(item.listId)) continue;
      const achievedAt = item.completedAt || item.updatedAt || item.createdAt;
      rows.push({
        id: `li-${item.id}`,
        source: "lists",
        sourceLabel: `LIST · ${listMap.get(item.listId)?.toUpperCase() || "LIST"}`,
        title: item.title,
        tags: item.tags || [],
        achievedAt,
        dayKey: toLocalDateKey(achievedAt),
        record: { kind: "list_item", item },
        detailTarget: { mode: "list_item", id: item.id },
      });
    }

    // 2. Entries explicitly marked isAchievement: true (Events, Logs, Focus/Completed Tasks)
    for (const entry of workspace.entries) {
      if (!entry.isAchievement) continue;
      if (entry.type === "task" && !entry.completed) continue;

      let source: Exclude<SourceFilter, "all"> = "logs";
      let sourceLabel = "LOG";
      let mode: DetailSheetTarget["mode"] = "log";

      if (entry.type === "event") {
        source = "events";
        sourceLabel = "EVENT";
        mode = "event";
      } else if (entry.type === "task" || entry.type === "timeblock") {
        source = "focus";
        sourceLabel = entry.type === "timeblock" ? "TIME BLOCK" : "FOCUS";
        mode = "task";
      } else {
        source = "logs";
        sourceLabel = entry.source === "achievement" ? "ACHIEVEMENT" : "LOG";
        mode = "log";
      }

      const achievedAt =
        entry.completedAt || entry.scheduledAt || entry.createdAt;
      rows.push({
        id: `ent-${entry.id}`,
        source,
        sourceLabel,
        title: entry.title,
        tags: entry.tags || [],
        achievedAt,
        dayKey: toLocalDateKey(achievedAt),
        record: { kind: "entry", entry },
        detailTarget: { mode, id: entry.id },
      });
    }

    return rows.sort(
      (a, b) =>
        new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime(),
    );
  }, [workspace.listItems, workspace.entries, listMap]);

  const filteredGrouped = useMemo(() => {
    const weekCutoff = addDaysToKey(todayKey, -7);
    const monthCutoff = addDaysToKey(todayKey, -30);
    const yearPrefix = todayKey.slice(0, 4);

    const filtered = allAchievements.filter((row) => {
      if (sourceFilter !== "all" && row.source !== sourceFilter) return false;
      if (timeFilter === "week" && row.dayKey < weekCutoff) return false;
      if (timeFilter === "month" && row.dayKey < monthCutoff) return false;
      if (timeFilter === "year" && !row.dayKey.startsWith(yearPrefix))
        return false;
      return true;
    });

    const byDay = new Map<string, AchievementRowItem[]>();
    for (const row of filtered) {
      const list = byDay.get(row.dayKey) || [];
      list.push(row);
      byDay.set(row.dayKey, list);
    }

    return {
      total: filtered.length,
      days: Array.from(byDay.entries()).sort(([a], [b]) => b.localeCompare(a)),
    };
  }, [allAchievements, sourceFilter, timeFilter, todayKey]);

  const renderSourceIcon = (source: Exclude<SourceFilter, "all">) => {
    if (source === "lists") {
      return (
        <span
          className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: "rgba(5, 150, 105, 0.14)",
            color: "var(--success)",
          }}
        >
          <CheckCircle2 className="w-4 h-4" />
        </span>
      );
    }
    if (source === "events") {
      return (
        <span
          className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: "rgba(37, 99, 235, 0.14)",
            color: "var(--color-entity-blue)",
          }}
        >
          <Calendar className="w-4 h-4" />
        </span>
      );
    }
    if (source === "focus") {
      return (
        <span
          className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: "var(--accent-soft)",
            color: "var(--accent)",
          }}
        >
          <Zap className="w-4 h-4" />
        </span>
      );
    }
    return (
      <span
        className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
        style={{
          backgroundColor: "rgba(217, 119, 6, 0.14)",
          color: "var(--warning)",
        }}
      >
        <Flame className="w-4 h-4" />
      </span>
    );
  };

  return (
    <div className="h-full flex-1 min-h-0 flex flex-col overflow-hidden overscroll-none lg:block lg:h-auto lg:overflow-visible">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-none lg:overflow-visible">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 pb-4 lg:pb-32 space-y-5">
      {/* Header */}
      <header
        className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight inline-flex items-center gap-2">
            <Trophy
              className="w-4 h-4 shrink-0"
              style={{ color: "var(--warning)" }}
            />
            <span>Achievements</span>
          </h1>
          <div className="relative flex items-center" ref={infoPopoverRef}>
            <button
              type="button"
              onClick={() => setInfoOpen((v) => !v)}
              aria-expanded={infoOpen}
              aria-label="How achievements are created"
              title="How achievements are created"
              className="h-6 w-6 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                backgroundColor: infoOpen ? "var(--accent-soft)" : "transparent",
                color: infoOpen ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              <Info className="w-3.5 h-3.5" />
            </button>

            {infoOpen && (
              <div
                role="dialog"
                aria-label="How achievements are created"
                className="absolute left-0 top-full mt-2 z-40 w-[290px] sm:w-[340px] rounded-xl border p-3.5 space-y-2.5"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: "var(--border-strong)",
                  boxShadow: "var(--shadow-popover)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    How Achievements Are Created
                  </span>
                  <button
                    type="button"
                    onClick={() => setInfoOpen(false)}
                    aria-label="Close guide"
                    className="h-5 w-5 rounded flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <ul
                  className="space-y-2 text-xs leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <li className="flex items-start gap-2">
                    <CheckCircle2
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: "var(--success)" }}
                    />
                    <span>
                      <strong style={{ color: "var(--text-primary)" }}>
                        Lists:
                      </strong>{" "}
                      Any list item marked <strong>Done</strong> automatically
                      appears here.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: "var(--accent)" }}
                    />
                    <span>
                      <strong style={{ color: "var(--text-primary)" }}>
                        Timeline, Events &amp; Focus:
                      </strong>{" "}
                      Toggle <strong>Mark as Achievement</strong> (Trophy) on an
                      event, log, or completed task.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Flame
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: "var(--warning)" }}
                    />
                    <span>
                      <strong style={{ color: "var(--text-primary)" }}>
                        Direct Log:
                      </strong>{" "}
                      Use the composer bar below to record standalone milestones
                      and wins anytime.
                    </span>
                  </li>
                </ul>
              </div>
            )}
          </div>
          <span
            className="text-xs font-mono tabular-nums shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            {filteredGrouped.total}
          </span>
        </div>

        {/* FilterSelect Dropdowns: Time & Source */}
        <div className="flex items-center gap-1.5">
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
            aria-label="Filter by timeframe"
            className="h-8 px-2.5 rounded-lg border text-xs font-medium outline-none"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <option value="all">All Time</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            aria-label="Filter by source"
            className="h-8 px-2.5 rounded-lg border text-xs font-medium outline-none"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <option value="all">All Sources</option>
            <option value="lists">Lists</option>
            <option value="events">Events</option>
            <option value="logs">Logs</option>
            <option value="focus">Focus</option>
          </select>
        </div>
      </header>

      {/* Day-Grouped Achievement Feed */}
      {filteredGrouped.days.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed py-14 px-4 text-center space-y-2"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <Trophy className="w-7 h-7 mx-auto opacity-50" />
          <p className="text-sm font-medium">
            No achievements in this window yet
          </p>
          <p className="text-xs">
            Complete a List item, mark an entry as an Achievement, or record one
            below.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredGrouped.days.map(([dayKey, items]) => (
            <section key={dayKey} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2
                  className="text-xs font-semibold font-mono"
                  style={{ color: "var(--text-muted)" }}
                >
                  {formatCompactDayHeading(dayKey)}
                </h2>
                <span
                  className="text-[11px] font-mono tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  {items.length}
                </span>
              </div>

              <div
                className="rounded-2xl border divide-y overflow-hidden"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                {items.map((row) => (
                  <div
                    key={row.id}
                    onClick={() => onOpenDetail(row.detailTarget)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onOpenContextMenu(row.record, e);
                    }}
                    className="group flex items-center gap-3.5 px-4 py-3 cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    {renderSourceIcon(row.source)}

                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="text-sm font-semibold truncate">
                        {row.title}
                      </div>
                      <div
                        className="flex flex-wrap items-center gap-x-2 text-[11px] font-mono tabular-nums"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <span>{row.sourceLabel}</span>
                        {row.tags.length > 0 && (
                          <>
                            <span>·</span>
                            <span>
                              {row.tags.map((t) => `#${t}`).join(" ")}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span style={{ color: "var(--warning)" }}>
                          Achieved {formatTime(row.achievedAt, timeFormat)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenContextMenu(row.record, e);
                      }}
                      className="h-8 w-8 flex items-center justify-center rounded-lg sm:opacity-0 sm:group-hover:opacity-100 shrink-0"
                      style={{ color: "var(--text-muted)" }}
                      aria-label="Achievement actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

        </div>
      </div>

      {/* Docked Mobile Input Bar (above bottom nav) · Floating Desktop Input Bar */}
      <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 lg:border-t-0 lg:bg-transparent lg:fixed lg:bottom-4 lg:left-60 lg:right-0 lg:z-20 lg:px-6 lg:py-0 lg:pointer-events-none">
        <div className="max-w-6xl mx-auto lg:pointer-events-auto">
          <NlpInputBar
            placeholder='Record an achievement (type "/" for /log, /task, /event, /timeblock)...'
            onSubmit={(raw) => Boolean(addAchievementEntry(raw, composerType))}
            baseDateKey={todayKey}
            availableTags={availableTags}
            submitLabel="Record"
            previewPosition="top"
            elevated
            showTimeblockTip={false}
            typeSwitcher={{
              value: composerType,
              onChange: setComposerType,
              options: ACHIEVEMENT_TYPE_OPTIONS,
              menuHeading: "Record achievement",
            }}
          />
        </div>
      </div>
    </div>
  );
};

// Re-export helper type safety guard
export type { Entry, ListItem };
