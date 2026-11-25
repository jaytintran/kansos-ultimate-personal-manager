import React, { useEffect, useMemo, useState } from "react";
import {
  Circle,
  Clock,
  GitCommitHorizontal,
  LayoutGrid,
  List,
  MoreVertical,
  Play,
  Plus,
} from "lucide-react";
import { InlineTitleEdit } from "../InlineTitleEdit";
import { ContextMenuRecord, DetailSheetTarget, Entry } from "../../types";
import { formatTime } from "../../utils/date";

export type AnchorDisplayStyle = "timeline" | "cards" | "hourly";

const ANCHOR_STYLE_STORAGE_KEY = "kanso_focus_anchor_style_v1";

function loadAnchorStyle(): AnchorDisplayStyle {
  if (typeof window === "undefined") return "timeline";
  try {
    const raw = window.localStorage.getItem(ANCHOR_STYLE_STORAGE_KEY);
    if (raw === "timeline" || raw === "cards" || raw === "hourly") {
      return raw;
    }
  } catch {
    // Ignore storage failures
  }
  return "timeline";
}

function formatHourHeading(hour24: number, timeFormat: "12h" | "24h"): string {
  if (timeFormat === "24h") {
    return `${String(hour24).padStart(2, "0")}:00`;
  }
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const h12 = hour24 % 12 || 12;
  return `${h12}:00 ${suffix}`;
}

interface FocusAnchorsSectionProps {
  anchors: Entry[];
  timeFormat: "12h" | "24h";
  focusedEntryId: string | null;
  onToggleComplete: (entryId: string) => void;
  onUpdateTitle: (entryId: string, nextTitle: string) => void;
  onFocusEntry: (entryId: string) => void;
  onOpenDetail: (target: DetailSheetTarget) => void;
  onOpenContextMenu: (record: ContextMenuRecord, e: React.MouseEvent) => void;
  onPrefillAnchorHour: (hour24: number | null) => void;
}

export const FocusAnchorsSection: React.FC<FocusAnchorsSectionProps> = ({
  anchors,
  timeFormat,
  focusedEntryId,
  onToggleComplete,
  onUpdateTitle,
  onFocusEntry,
  onOpenDetail,
  onOpenContextMenu,
  onPrefillAnchorHour,
}) => {
  const [styleMode, setStyleMode] = useState<AnchorDisplayStyle>(() =>
    loadAnchorStyle(),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ANCHOR_STYLE_STORAGE_KEY, styleMode);
    } catch {
      // Ignore storage failures
    }
  }, [styleMode]);

  const nowMs = Date.now();
  const nextUpcomingId = useMemo(() => {
    const upcoming = anchors.find((a) => {
      if (!a.scheduledAt) return false;
      const endMs = a.endAt
        ? new Date(a.endAt).getTime()
        : new Date(a.scheduledAt).getTime();
      return endMs >= nowMs - 15 * 60_000;
    });
    return upcoming?.id ?? anchors[0]?.id ?? null;
  }, [anchors, nowMs]);

  const hourlyData = useMemo(() => {
    const anytime: Entry[] = [];
    const byHour = new Map<number, Entry[]>();
    let minHour = 6;
    let maxHour = 22;

    for (const a of anchors) {
      if (!a.scheduledAt) {
        anytime.push(a);
        continue;
      }
      const d = new Date(a.scheduledAt);
      const h = d.getHours();
      minHour = Math.min(minHour, h);
      maxHour = Math.max(maxHour, h);
      const list = byHour.get(h) || [];
      list.push(a);
      byHour.set(h, list);
    }

    const hours: number[] = [];
    for (let h = minHour; h <= maxHour; h++) {
      hours.push(h);
    }

    return { anytime, byHour, hours };
  }, [anchors]);

  const renderRowActions = (entry: Entry) => {
    const isFocused = focusedEntryId === entry.id;
    return (
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFocusEntry(entry.id);
          }}
          className={`h-7 w-7 flex items-center justify-center rounded-md transition-all cursor-pointer ${
            isFocused
              ? "opacity-100"
              : "sm:opacity-0 sm:group-hover:opacity-100"
          }`}
          style={{
            backgroundColor: isFocused ? "var(--accent-soft)" : "transparent",
            color: isFocused ? "var(--accent)" : "var(--text-muted)",
          }}
          title={isFocused ? "Currently focusing" : "Focus on this anchor"}
          aria-label={
            isFocused
              ? `${entry.title} is in spotlight`
              : `Focus on ${entry.title}`
          }
        >
          <Play className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenContextMenu({ kind: "entry", entry }, e);
          }}
          className="h-7 w-7 flex items-center justify-center rounded-md sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          aria-label="More actions"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  return (
    <section className="space-y-2.5">
      {/* Header + Style Selector */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Clock
            className="w-4 h-4 shrink-0"
            style={{ color: "var(--accent)" }}
          />
          <h2 className="font-display text-sm font-bold tracking-tight truncate">
            Daily Anchors
          </h2>
          <span
            className="text-xs font-mono tabular-nums shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            {anchors.length}
          </span>
        </div>

        {/* Segmented Style Switcher (Timeline / Cards / Hourly) */}
        <div
          className="inline-flex items-center rounded-lg border p-0.5 shrink-0"
          style={{
            backgroundColor: "var(--bg-surface-subtle)",
            borderColor: "var(--border-subtle)",
          }}
          role="group"
          aria-label="Anchor display style"
        >
          {(
            [
              {
                id: "timeline",
                label: "Timeline",
                icon: GitCommitHorizontal,
              },
              { id: "cards", label: "Cards", icon: List },
              { id: "hourly", label: "Hourly", icon: LayoutGrid },
            ] as const
          ).map((opt) => {
            const active = styleMode === opt.id;
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStyleMode(opt.id)}
                className="h-6 px-2 rounded-md text-[11px] font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor: active ? "var(--bg-surface)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-muted)",
                  boxShadow: active ? "var(--shadow-card)" : "none",
                }}
                title={`${opt.label} view`}
                aria-pressed={active}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Empty state for Timeline & Cards modes */}
      {anchors.length === 0 && styleMode !== "hourly" ? (
        <div
          className="rounded-2xl border border-dashed px-4 py-6 text-center space-y-2"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <p className="text-xs">
            No time-anchored commitments today.
          </p>
          <button
            type="button"
            onClick={() => onPrefillAnchorHour(null)}
            className="h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <Plus className="w-3 h-3" />
            <span>Schedule Anchor</span>
          </button>
        </div>
      ) : null}

      {/* MODE 1: MINIMAL TIMELINE */}
      {styleMode === "timeline" && anchors.length > 0 && (
        <div
          className="rounded-2xl border p-3 sm:p-3.5"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="relative space-y-1">
            {anchors.map((entry, idx) => {
              const isNext = entry.id === nextUpcomingId;
              const isFocused = focusedEntryId === entry.id;
              const isLast = idx === anchors.length - 1;
              return (
                <div
                  key={entry.id}
                  onDoubleClick={() =>
                    onOpenDetail({ mode: "task", id: entry.id })
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onOpenContextMenu({ kind: "entry", entry }, e);
                  }}
                  className="group relative flex items-start gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--bg-surface-subtle)]"
                  style={{
                    backgroundColor:
                      isFocused || isNext
                        ? "var(--accent-soft)"
                        : "transparent",
                  }}
                >
                  {/* Vertical hairline spine */}
                  {!isLast && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[18px] top-7 bottom-[-6px] w-px"
                      style={{ backgroundColor: "var(--border-subtle)" }}
                    />
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleComplete(entry.id);
                    }}
                    className="relative z-10 mt-0.5 h-5 w-5 flex items-center justify-center rounded-full shrink-0 transition-colors cursor-pointer"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      color: isNext ? "var(--accent)" : "var(--text-muted)",
                    }}
                    title="Complete anchor"
                    aria-label={`Complete ${entry.title}`}
                  >
                    <Circle className="w-4 h-4" />
                  </button>

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div
                      className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums"
                      style={{
                        color: isNext
                          ? "var(--accent)"
                          : "var(--text-muted)",
                      }}
                    >
                      {entry.scheduledAt ? (
                        <span className="font-semibold">
                          {formatTime(entry.scheduledAt, timeFormat)}
                          {entry.endAt
                            ? ` – ${formatTime(entry.endAt, timeFormat)}`
                            : ""}
                        </span>
                      ) : (
                        <span>Anytime</span>
                      )}
                      {entry.tags.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">
                            {entry.tags.map((t) => `#${t}`).join(" ")}
                          </span>
                        </>
                      )}
                    </div>

                    <InlineTitleEdit
                      value={entry.title}
                      allowMobileEdit
                      onCommit={(nextTitle) =>
                        onUpdateTitle(entry.id, nextTitle)
                      }
                      className="text-sm font-medium"
                    />
                  </div>

                  {renderRowActions(entry)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODE 2: COMPACT STACKED CARDS */}
      {styleMode === "cards" && anchors.length > 0 && (
        <div className="space-y-2">
          {anchors.map((entry) => {
            const isNext = entry.id === nextUpcomingId;
            const isFocused = focusedEntryId === entry.id;
            return (
              <div
                key={entry.id}
                onDoubleClick={() =>
                  onOpenDetail({ mode: "task", id: entry.id })
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  onOpenContextMenu({ kind: "entry", entry }, e);
                }}
                className="group rounded-xl border px-3 py-2.5 flex items-start gap-2.5 transition-colors hover:bg-[var(--bg-surface-subtle)]"
                style={{
                  backgroundColor:
                    isFocused || isNext
                      ? "var(--accent-soft)"
                      : "var(--bg-surface)",
                  borderColor:
                    isFocused || isNext
                      ? "var(--accent)"
                      : "var(--border-subtle)",
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleComplete(entry.id);
                  }}
                  className="mt-0.5 h-5 w-5 flex items-center justify-center rounded-full shrink-0 cursor-pointer"
                  style={{
                    color: isNext ? "var(--accent)" : "var(--text-muted)",
                  }}
                  title="Complete anchor"
                  aria-label={`Complete ${entry.title}`}
                >
                  <Circle className="w-4 h-4" />
                </button>

                <div className="flex-1 min-w-0 space-y-0.5">
                  <InlineTitleEdit
                    value={entry.title}
                    allowMobileEdit
                    onCommit={(nextTitle) => onUpdateTitle(entry.id, nextTitle)}
                    className="text-sm font-medium"
                  />
                  <div
                    className="flex flex-wrap items-center gap-x-1.5 text-[11px] font-mono tabular-nums"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {entry.scheduledAt && (
                      <span
                        className="font-semibold"
                        style={{
                          color: isNext
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                        }}
                      >
                        {formatTime(entry.scheduledAt, timeFormat)}
                        {entry.endAt
                          ? ` – ${formatTime(entry.endAt, timeFormat)}`
                          : ""}
                      </span>
                    )}
                    {entry.scheduledAt && entry.tags.length > 0 && (
                      <span aria-hidden="true">·</span>
                    )}
                    {entry.tags.length > 0 && (
                      <span>{entry.tags.map((t) => `#${t}`).join(" ")}</span>
                    )}
                  </div>
                </div>

                {renderRowActions(entry)}
              </div>
            );
          })}
        </div>
      )}

      {/* MODE 3: HOURLY GRID (SHOWING EMPTY HOURS TOO) */}
      {styleMode === "hourly" && (
        <div
          className="rounded-2xl border divide-y overflow-hidden"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          {hourlyData.anytime.length > 0 && (
            <div
              className="px-3 py-2 space-y-1"
              style={{
                backgroundColor: "var(--bg-surface-subtle)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div
                className="text-[10px] font-mono uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Anytime
              </div>
              {hourlyData.anytime.map((entry) => (
                <div
                  key={entry.id}
                  onDoubleClick={() =>
                    onOpenDetail({ mode: "task", id: entry.id })
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onOpenContextMenu({ kind: "entry", entry }, e);
                  }}
                  className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-[var(--bg-surface)]"
                >
                  <button
                    type="button"
                    onClick={() => onToggleComplete(entry.id)}
                    className="h-4.5 w-4.5 flex items-center justify-center rounded-full shrink-0 cursor-pointer"
                    style={{ color: "var(--accent)" }}
                    aria-label={`Complete ${entry.title}`}
                  >
                    <Circle className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <InlineTitleEdit
                      value={entry.title}
                      allowMobileEdit
                      onCommit={(nextTitle) =>
                        onUpdateTitle(entry.id, nextTitle)
                      }
                      className="text-xs sm:text-sm font-medium"
                    />
                  </div>
                  {renderRowActions(entry)}
                </div>
              ))}
            </div>
          )}

          {hourlyData.hours.map((hour24) => {
            const slotItems = hourlyData.byHour.get(hour24) || [];
            const hasItems = slotItems.length > 0;
            return (
              <div
                key={hour24}
                className="group/slot flex items-start gap-2.5 px-3 py-1.5 transition-colors hover:bg-[var(--bg-surface-subtle)]/70"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <span
                  className="w-16 shrink-0 pt-1 text-[11px] font-mono tabular-nums"
                  style={{
                    color: hasItems
                      ? "var(--accent)"
                      : "var(--text-muted)",
                  }}
                >
                  {formatHourHeading(hour24, timeFormat)}
                </span>

                {hasItems ? (
                  <div className="flex-1 min-w-0 space-y-1">
                    {slotItems.map((entry) => {
                      const isFocused = focusedEntryId === entry.id;
                      return (
                        <div
                          key={entry.id}
                          onDoubleClick={() =>
                            onOpenDetail({ mode: "task", id: entry.id })
                          }
                          onContextMenu={(e) => {
                            e.preventDefault();
                            onOpenContextMenu({ kind: "entry", entry }, e);
                          }}
                          className="group flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors"
                          style={{
                            backgroundColor: isFocused
                              ? "var(--accent-soft)"
                              : "var(--bg-surface-subtle)",
                          }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleComplete(entry.id);
                            }}
                            className="mt-0.5 h-4 w-4 flex items-center justify-center rounded-full shrink-0 cursor-pointer"
                            style={{ color: "var(--accent)" }}
                            aria-label={`Complete ${entry.title}`}
                          >
                            <Circle className="w-3.5 h-3.5" />
                          </button>
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <InlineTitleEdit
                              value={entry.title}
                              allowMobileEdit
                              onCommit={(nextTitle) =>
                                onUpdateTitle(entry.id, nextTitle)
                              }
                              className="text-xs sm:text-sm font-medium"
                            />
                            <div
                              className="text-[10px] font-mono tabular-nums"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {entry.scheduledAt &&
                                formatTime(entry.scheduledAt, timeFormat)}
                              {entry.endAt
                                ? ` – ${formatTime(entry.endAt, timeFormat)}`
                                : ""}
                              {entry.tags.length > 0
                                ? ` · ${entry.tags.map((t) => `#${t}`).join(" ")}`
                                : ""}
                            </div>
                          </div>
                          {renderRowActions(entry)}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 min-w-0 flex items-center justify-between py-0.5">
                    <span
                      className="text-[11px] opacity-0 group-hover/slot:opacity-70 transition-opacity"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Open slot
                    </span>
                    <button
                      type="button"
                      onClick={() => onPrefillAnchorHour(hour24)}
                      className="h-6 px-2 rounded-md text-[11px] font-medium inline-flex items-center gap-1 sm:opacity-0 sm:group-hover/slot:opacity-100 transition-opacity hover:bg-[var(--bg-surface)] cursor-pointer"
                      style={{ color: "var(--accent)" }}
                      title={`Add anchor at ${formatHourHeading(hour24, timeFormat)}`}
                    >
                      <Plus className="w-3 h-3" />
                      <span>Anchor</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
