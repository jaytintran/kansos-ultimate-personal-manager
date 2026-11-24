import React, { useEffect, useRef, useState } from "react";
import {
  Calendar,
  Check,
  Globe,
  MapPin,
  Plus,
  Trophy,
  X,
} from "lucide-react";
import { useWorkspace } from "../../context/WorkspaceContext";
import type { Entry, EventCategory, ListCollection } from "../../types";
import {
  combineLocalDateAndTime,
  formatCompactDayHeading,
  formatTime,
  getDayAbbrev,
  getTodayKey,
} from "../../utils/date";
import { DynamicIcon } from "../IconLibrary";

interface EventDaySummaryPaneProps {
  dateKey: string;
  events: Entry[];
  listMap: Map<string, ListCollection>;
  focusCreateNonce: number;
  onClose: () => void;
  onSelectEvent: (eventId: string) => void;
  onOpenEventModal: (eventId: string) => void;
  onOpenNewEventModalForDay: (dateKey: string) => void;
  onContextMenuEvent: (event: Entry, e: React.MouseEvent) => void;
}

export const EventDaySummaryPane: React.FC<EventDaySummaryPaneProps> = ({
  dateKey,
  events,
  listMap,
  focusCreateNonce,
  onClose,
  onSelectEvent,
  onOpenEventModal,
  onOpenNewEventModalForDay,
  onContextMenuEvent,
}) => {
  const { workspace, createEntry, cycleEventAttendance, pushToast } =
    useWorkspace();
  const timeFormat = workspace.settings.timeFormat;
  const todayKey = getTodayKey();
  const isToday = dateKey === todayKey;

  const [draftTitle, setDraftTitle] = useState("");
  const [draftTime, setDraftTime] = useState("10:00");
  const [draftCategory, setDraftCategory] =
    useState<EventCategory>("personal");
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (focusCreateNonce > 0) {
      titleInputRef.current?.focus();
    }
  }, [focusCreateNonce, dateKey]);

  const handleQuickCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftTitle.trim();
    if (!trimmed) return;
    const scheduledAt =
      combineLocalDateAndTime(dateKey, draftTime || "10:00") ??
      combineLocalDateAndTime(dateKey, "10:00");
    createEntry({
      type: "event",
      title: trimmed,
      scheduledAt,
      eventCategory: draftCategory,
      attendance: null,
    });
    setDraftTitle("");
    pushToast("Event added", "success");
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Header */}
      <div
        className="px-4 py-2.5 border-b flex items-center justify-between gap-2 shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Calendar
            className="w-4 h-4 shrink-0"
            style={{ color: isToday ? "var(--accent)" : "var(--text-muted)" }}
          />
          <div className="min-w-0 flex items-baseline gap-2">
            <h3 className="font-display text-sm font-semibold truncate">
              {getDayAbbrev(dateKey)} · {formatCompactDayHeading(dateKey)}
            </h3>
            {isToday && (
              <span
                className="text-[11px] font-medium shrink-0"
                style={{ color: "var(--accent)" }}
              >
                Today
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="text-[11px] font-mono tabular-nums"
            style={{ color: "var(--text-muted)" }}
          >
            {events.length} {events.length === 1 ? "event" : "events"}
          </span>
          <button
            type="button"
            onClick={onClose}
            title="Close day summary"
            aria-label="Close day summary"
            className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Body: Quick-Create Draft + Day Event List */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-none px-4 py-4 space-y-4">
        {/* Inline Quick-Create Draft */}
        <form
          onSubmit={handleQuickCreate}
          className="rounded-xl border p-3 space-y-2.5"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Quick Add
            </span>
            <button
              type="button"
              onClick={() => onOpenNewEventModalForDay(dateKey)}
              className="text-[11px] font-medium hover:underline cursor-pointer"
              style={{ color: "var(--accent)" }}
            >
              Full details...
            </button>
          </div>

          <input
            ref={titleInputRef}
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Event title..."
            className="w-full h-8 px-2.5 rounded-lg border text-xs outline-none transition-colors focus:border-[var(--accent)]"
            style={{
              backgroundColor: "var(--bg-canvas)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <input
                type="time"
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value)}
                aria-label="Event start time"
                className="h-7 px-2 rounded-md border text-[11px] font-mono outline-none"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              />
              <div
                className="inline-flex items-center p-0.5 rounded-md border"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                {(["personal", "official"] as EventCategory[]).map((cat) => {
                  const active = draftCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setDraftCategory(cat)}
                      className="h-6 px-2 rounded text-[11px] font-medium capitalize cursor-pointer transition-colors"
                      style={{
                        backgroundColor: active
                          ? "var(--accent-soft)"
                          : "transparent",
                        color: active
                          ? "var(--accent)"
                          : "var(--text-muted)",
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={!draftTitle.trim()}
              className="h-7 px-2.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 transition-opacity disabled:opacity-40 cursor-pointer"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>
        </form>

        {/* Events on this day */}
        {events.length === 0 ? (
          <div
            className="rounded-xl border border-dashed py-10 px-4 text-center space-y-1.5"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            <Calendar className="w-5 h-5 mx-auto opacity-45" />
            <p
              className="text-xs font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              No events scheduled on this day
            </p>
            <p className="text-[11px]">
              Use Quick Add above to schedule one right away.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => {
              const linkedLists = (ev.listIds || [])
                .map((id) => listMap.get(id))
                .filter((l): l is ListCollection => Boolean(l));

              let chipColor = "var(--text-secondary)";
              let chipBg = "var(--bg-surface-subtle)";
              let chipBorder = "var(--border-subtle)";
              if (ev.attendance === "attended") {
                chipColor = "var(--success)";
                chipBg = "color-mix(in srgb, var(--success) 13%, transparent)";
                chipBorder =
                  "color-mix(in srgb, var(--success) 32%, transparent)";
              } else if (ev.attendance === "missed") {
                chipColor = "var(--danger)";
                chipBg = "color-mix(in srgb, var(--danger) 13%, transparent)";
                chipBorder =
                  "color-mix(in srgb, var(--danger) 32%, transparent)";
              } else if (ev.attendance === "universal") {
                chipColor = "var(--accent)";
                chipBg = "color-mix(in srgb, var(--accent) 13%, transparent)";
                chipBorder =
                  "color-mix(in srgb, var(--accent) 30%, transparent)";
              }

              return (
                <div
                  key={ev.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectEvent(ev.id)}
                  onDoubleClick={() => onOpenEventModal(ev.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectEvent(ev.id);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onContextMenuEvent(ev, e);
                  }}
                  className="rounded-xl border p-3 space-y-2 transition-colors hover:border-[var(--border-strong)] cursor-pointer"
                  style={{
                    backgroundColor: ev.isAchievement
                      ? "color-mix(in srgb, var(--warning) 7%, var(--bg-surface))"
                      : "var(--bg-surface)",
                    borderColor: ev.isAchievement
                      ? "color-mix(in srgb, var(--warning) 32%, transparent)"
                      : "var(--border-subtle)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        cycleEventAttendance(ev.id);
                      }}
                      title="Click to cycle attendance"
                      className="h-5.5 px-2 rounded-md border text-[11px] font-mono tabular-nums font-medium inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      style={{
                        backgroundColor: chipBg,
                        color: chipColor,
                        borderColor: chipBorder,
                      }}
                    >
                      {ev.attendance === "attended" && (
                        <Check className="w-3 h-3 shrink-0" />
                      )}
                      {ev.attendance === "missed" && (
                        <X className="w-3 h-3 shrink-0" />
                      )}
                      {ev.attendance === "universal" && (
                        <Globe className="w-3 h-3 shrink-0" />
                      )}
                      <span>
                        {ev.scheduledAt
                          ? formatTime(ev.scheduledAt, timeFormat)
                          : "Anytime"}
                      </span>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      {ev.isAchievement && (
                        <Trophy
                          className="w-3.5 h-3.5"
                          style={{ color: "var(--warning)" }}
                        />
                      )}
                      <span
                        className="text-[11px] font-mono capitalize"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {ev.eventCategory || "personal"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-1.5 min-w-0">
                    {ev.icon?.trim() && (
                      <DynamicIcon
                        name={ev.icon}
                        className="w-3.5 h-3.5 shrink-0 mt-0.5"
                        style={{ color: "var(--accent)" }}
                      />
                    )}
                    <div
                      className="text-xs font-semibold leading-snug line-clamp-2 min-w-0"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {ev.title || "Untitled Event"}
                    </div>
                  </div>

                  {(ev.location || linkedLists.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ev.location && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] truncate max-w-[160px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{ev.location}</span>
                        </span>
                      )}
                      {linkedLists.map((list) => (
                        <span
                          key={list.id}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-medium max-w-[150px]"
                          style={{
                            backgroundColor: "var(--bg-surface-subtle)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: list.color || "var(--accent)",
                            }}
                          />
                          <span className="truncate">{list.title}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
