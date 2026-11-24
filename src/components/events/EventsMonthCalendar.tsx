import React, { useMemo } from "react";
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  MapPin,
  Plus,
  Trophy,
  X,
} from "lucide-react";
import type { Entry, ListCollection } from "../../types";
import {
  formatCompactDayHeading,
  formatTime,
  getCalendarMatrix,
  getDayAbbrev,
  getDayNumber,
  getEntryDayKey,
  getTodayKey,
} from "../../utils/date";
import { DynamicIcon } from "../IconLibrary";

const WEEKDAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface EventsMonthCalendarProps {
  year: number;
  monthIndex: number;
  onChangeMonth: (next: { year: number; monthIndex: number }) => void;
  events: Entry[];
  listMap: Map<string, ListCollection>;
  selectedEventId: string | null;
  selectedDayKey: string | null;
  timeFormat: "12h" | "24h";
  onSelectDay: (dateKey: string, focusCreate?: boolean) => void;
  onSelectEvent: (event: Entry) => void;
  onOpenEventModal: (eventId: string) => void;
  onNewEventForDayMobile: (dateKey: string) => void;
  onContextMenuEvent: (event: Entry, e: React.MouseEvent) => void;
  onCycleAttendance: (eventId: string) => void;
}

function getCompactTimeLabel(
  iso: string | null | undefined,
  timeFormat: "12h" | "24h",
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (timeFormat === "24h") {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  const h = d.getHours();
  const m = d.getMinutes();
  const suffix = h >= 12 ? "p" : "a";
  const h12 = h % 12 || 12;
  return m === 0
    ? `${h12}${suffix}`
    : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export const EventsMonthCalendar: React.FC<EventsMonthCalendarProps> = ({
  year,
  monthIndex,
  onChangeMonth,
  events,
  listMap,
  selectedEventId,
  selectedDayKey,
  timeFormat,
  onSelectDay,
  onSelectEvent,
  onOpenEventModal,
  onNewEventForDayMobile,
  onContextMenuEvent,
  onCycleAttendance,
}) => {
  const todayKey = getTodayKey();

  const matrix = useMemo(
    () => getCalendarMatrix(year, monthIndex),
    [year, monthIndex],
  );

  const monthTitle = useMemo(() => {
    const d = new Date(year, monthIndex, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [year, monthIndex]);

  const monthPrefix = useMemo(
    () => `${year}-${String(monthIndex + 1).padStart(2, "0")}-`,
    [year, monthIndex],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const ev of events) {
      const dk = getEntryDayKey(ev);
      const bucket = map.get(dk);
      if (bucket) bucket.push(ev);
      else map.set(dk, [ev]);
    }
    for (const [, bucket] of map) {
      bucket.sort((a, b) => {
        const ta = new Date(a.scheduledAt || a.createdAt).getTime();
        const tb = new Date(b.scheduledAt || b.createdAt).getTime();
        return ta - tb;
      });
    }
    return map;
  }, [events]);

  const monthEventCount = useMemo(() => {
    let count = 0;
    for (const [dk, list] of eventsByDay) {
      if (dk.startsWith(monthPrefix)) count += list.length;
    }
    return count;
  }, [eventsByDay, monthPrefix]);

  const stepMonth = (delta: number) => {
    const nextDate = new Date(year, monthIndex + delta, 1);
    onChangeMonth({
      year: nextDate.getFullYear(),
      monthIndex: nextDate.getMonth(),
    });
  };

  const jumpToToday = () => {
    const now = new Date();
    onChangeMonth({ year: now.getFullYear(), monthIndex: now.getMonth() });
    onSelectDay(todayKey);
  };

  const mobileActiveDay = selectedDayKey || todayKey;
  const mobileDayEvents = eventsByDay.get(mobileActiveDay) ?? [];

  return (
    <div className="space-y-3">
      {/* Calendar Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="inline-flex items-center p-0.5 rounded-lg border"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              aria-label="Previous month"
              title="Previous month"
              className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={jumpToToday}
              className="h-7 px-2.5 rounded-md text-xs font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              aria-label="Next month"
              title="Next month"
              className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="font-display text-sm sm:text-base font-semibold tracking-tight">
            {monthTitle}
          </h2>
        </div>

        <span
          className="text-xs font-mono tabular-nums"
          style={{ color: "var(--text-muted)" }}
        >
          {monthEventCount} {monthEventCount === 1 ? "event" : "events"} this month
        </span>
      </div>

      {/* Month Grid */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        {/* Weekday Row */}
        <div
          className="grid grid-cols-7 border-b"
          style={{
            backgroundColor: "var(--bg-surface-subtle)",
            borderColor: "var(--border-subtle)",
          }}
        >
          {WEEKDAY_HEADERS.map((wd) => (
            <div
              key={wd}
              className="py-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-center sm:text-left"
              style={{ color: "var(--text-muted)" }}
            >
              {wd}
            </div>
          ))}
        </div>

        {/* Day Cells */}
        <div className="grid grid-cols-7">
          {matrix.map((dateKey, idx) => {
            const isLastCol = (idx + 1) % 7 === 0;
            const isLastRow = idx >= matrix.length - 7;
            const cellBorders = `${!isLastCol ? "border-r" : ""} ${
              !isLastRow ? "border-b" : ""
            }`;

            if (!dateKey) {
              return (
                <div
                  key={`empty-${idx}`}
                  className={`min-h-[82px] sm:min-h-[112px] ${cellBorders}`}
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                    opacity: 0.45,
                  }}
                />
              );
            }

            const dayEvents = eventsByDay.get(dateKey) ?? [];
            const visibleEvents = dayEvents.slice(0, 3);
            const overflowCount = dayEvents.length - visibleEvents.length;
            const isToday = dateKey === todayKey;
            const isSelectedDay = dateKey === selectedDayKey;
            const dayNum = getDayNumber(dateKey);

            return (
              <div
                key={dateKey}
                role="button"
                tabIndex={0}
                onClick={() => onSelectDay(dateKey)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectDay(dateKey);
                  }
                }}
                className={`group relative min-h-[82px] sm:min-h-[112px] p-1 sm:p-1.5 flex flex-col gap-1 transition-colors cursor-pointer text-left ${cellBorders}`}
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: isSelectedDay
                    ? "color-mix(in srgb, var(--accent-soft) 55%, var(--bg-surface))"
                    : "var(--bg-surface)",
                  boxShadow: isSelectedDay
                    ? "inset 0 0 0 1.5px var(--accent)"
                    : undefined,
                }}
              >
                {/* Cell Header: Day Number + Hover Quick Add */}
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`w-5.5 h-5.5 rounded-full inline-flex items-center justify-center text-[11px] font-mono tabular-nums ${
                      isToday ? "font-bold" : "font-medium"
                    }`}
                    style={{
                      backgroundColor: isToday ? "var(--accent)" : "transparent",
                      color: isToday
                        ? "var(--accent-fg)"
                        : isSelectedDay
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                    }}
                  >
                    {dayNum}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDay(dateKey, true);
                    }}
                    title={`Add event on ${formatCompactDayHeading(dateKey)}`}
                    aria-label={`Add event on ${formatCompactDayHeading(dateKey)}`}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-5 h-5 rounded flex items-center justify-center hover:bg-[var(--bg-surface-hover)] transition-opacity cursor-pointer"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {/* Up to 3 Event Pills */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  {visibleEvents.map((ev) => {
                    const isSelectedEv = selectedEventId === ev.id;
                    const compactTime = getCompactTimeLabel(
                      ev.scheduledAt,
                      timeFormat,
                    );

                    let dotColor =
                      ev.eventCategory === "official"
                        ? "var(--accent)"
                        : "var(--color-entity-rose, var(--danger))";
                    let pillBg = "var(--bg-surface-subtle)";
                    let pillFg = "var(--text-primary)";

                    if (ev.isAchievement) {
                      dotColor = "var(--warning)";
                    } else if (ev.attendance === "attended") {
                      dotColor = "var(--success)";
                      pillBg =
                        "color-mix(in srgb, var(--success) 11%, var(--bg-surface-subtle))";
                    } else if (ev.attendance === "missed") {
                      dotColor = "var(--danger)";
                      pillBg =
                        "color-mix(in srgb, var(--danger) 10%, var(--bg-surface-subtle))";
                      pillFg = "var(--text-muted)";
                    } else if (ev.attendance === "universal") {
                      dotColor = "var(--accent)";
                      pillBg =
                        "color-mix(in srgb, var(--accent) 11%, var(--bg-surface-subtle))";
                    }

                    if (isSelectedEv) {
                      pillBg = "var(--accent-soft)";
                      pillFg = "var(--accent)";
                    }

                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent(ev);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          onOpenEventModal(ev.id);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onContextMenuEvent(ev, e);
                        }}
                        title={`${compactTime ? `${compactTime} · ` : ""}${ev.title || "Untitled Event"}`}
                        className={`w-full px-1 sm:px-1.5 py-0.5 rounded text-[10.5px] sm:text-[11px] leading-tight flex items-center gap-1 text-left transition-colors hover:brightness-95 cursor-pointer ${
                          isSelectedEv ? "ring-1 ring-[var(--accent)]" : ""
                        }`}
                        style={{
                          backgroundColor: pillBg,
                          color: pillFg,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: dotColor }}
                        />
                        {compactTime && (
                          <span
                            className="hidden md:inline font-mono tabular-nums text-[10px] opacity-75 shrink-0"
                          >
                            {compactTime}
                          </span>
                        )}
                        <span className="truncate font-medium">
                          {ev.title || "Untitled"}
                        </span>
                      </button>
                    );
                  })}

                  {overflowCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDay(dateKey);
                      }}
                      className="w-full px-1 text-left text-[10px] font-mono tabular-nums font-medium hover:underline cursor-pointer"
                      style={{ color: "var(--accent)" }}
                    >
                      +{overflowCount} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile Selected Day Agenda Strip (visible < lg where right split pane is hidden) */}
      <div
        className="lg:hidden rounded-xl border p-3 space-y-2.5"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar
              className="w-3.5 h-3.5 shrink-0"
              style={{
                color:
                  mobileActiveDay === todayKey
                    ? "var(--accent)"
                    : "var(--text-muted)",
              }}
            />
            <span className="text-xs font-semibold truncate">
              {getDayAbbrev(mobileActiveDay)} ·{" "}
              {formatCompactDayHeading(mobileActiveDay)}
            </span>
            <span
              className="text-[11px] font-mono tabular-nums"
              style={{ color: "var(--text-muted)" }}
            >
              {mobileDayEvents.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onNewEventForDayMobile(mobileActiveDay)}
            className="h-7 px-2.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>

        {mobileDayEvents.length === 0 ? (
          <p className="text-xs py-1" style={{ color: "var(--text-muted)" }}>
            No events on this day.
          </p>
        ) : (
          <div className="space-y-1.5">
            {mobileDayEvents.map((ev) => {
              const linkedLists = (ev.listIds || [])
                .map((id) => listMap.get(id))
                .filter((l): l is ListCollection => Boolean(l));
              return (
                <div
                  key={ev.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenEventModal(ev.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenEventModal(ev.id);
                    }
                  }}
                  className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCycleAttendance(ev.id);
                      }}
                      className="h-5.5 px-1.5 rounded border text-[10.5px] font-mono tabular-nums inline-flex items-center gap-1 shrink-0"
                      style={{
                        backgroundColor: "var(--bg-surface-subtle)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {ev.attendance === "attended" && (
                        <Check className="w-2.5 h-2.5" />
                      )}
                      {ev.attendance === "missed" && (
                        <X className="w-2.5 h-2.5" />
                      )}
                      {ev.attendance === "universal" && (
                        <Globe className="w-2.5 h-2.5" />
                      )}
                      <span>
                        {ev.scheduledAt
                          ? formatTime(ev.scheduledAt, timeFormat)
                          : "Anytime"}
                      </span>
                    </button>
                    {ev.icon?.trim() && (
                      <DynamicIcon
                        name={ev.icon}
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: "var(--accent)" }}
                      />
                    )}
                    {ev.isAchievement && (
                      <Trophy
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: "var(--warning)" }}
                      />
                    )}
                    <span className="text-xs font-medium truncate">
                      {ev.title || "Untitled"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {ev.location && (
                      <span
                        className="text-[11px] inline-flex items-center gap-0.5 max-w-[90px] truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{ev.location}</span>
                      </span>
                    )}
                    {linkedLists.slice(0, 2).map((l) => (
                      <span
                        key={l.id}
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: l.color || "var(--accent)" }}
                        title={l.title}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
