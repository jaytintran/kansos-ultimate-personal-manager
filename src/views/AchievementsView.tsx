import React, { useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Flame,
  MoreVertical,
  Trophy,
  Zap,
} from "lucide-react";
import { NlpInputBar } from "../components/NlpInputBar";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  ContextMenuRecord,
  DetailSheetTarget,
  Entry,
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

export const AchievementsView: React.FC<AchievementsViewProps> = ({
  onOpenDetail,
  onOpenContextMenu,
}) => {
  const { workspace, addAchievementEntry } = useWorkspace();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const todayKey = getTodayKey();
  const timeFormat = workspace.settings.timeFormat;

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
      } else if (entry.type === "task") {
        source = "focus";
        sourceLabel = "FOCUS";
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-32 space-y-5">
      {/* Header */}
      <header
        className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight inline-flex items-center gap-2">
            <Trophy
              className="w-4 h-4 shrink-0"
              style={{ color: "var(--warning)" }}
            />
            <span>Achievements</span>
          </h1>
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

      {/* Sticky Bottom NLP Bar: Record an achievement */}
      <div className="fixed bottom-16 lg:bottom-4 left-0 lg:left-60 right-0 z-20 px-4 sm:px-6 pointer-events-none">
        <div className="max-w-4xl mx-auto pointer-events-auto">
          <NlpInputBar
            placeholder='Record an achievement (e.g., "Shipped Kanso v3 #milestone")...'
            onSubmit={(raw) => Boolean(addAchievementEntry(raw))}
            baseDateKey={todayKey}
            submitLabel="Record"
            previewPosition="top"
            elevated
            showTimeblockTip={false}
          />
        </div>
      </div>
    </div>
  );
};

// Re-export helper type safety guard
export type { Entry, ListItem };
