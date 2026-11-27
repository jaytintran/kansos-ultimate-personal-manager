import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FolderKanban,
  Hash,
  MapPin,
  Maximize2,
  Plus,
  Sparkles,
  Tag,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { useWorkspace } from "../../context/WorkspaceContext";
import {
  DESKTOP_NEW_EVENT_OPTIONS,
  DesktopNewEventUiMode,
  EventComposerPreferences,
  MOBILE_NEW_EVENT_OPTIONS,
  MobileNewEventUiMode,
} from "../../lib/eventComposerPrefs";
import type {
  Entry,
  EventAttendance,
  EventCategory,
  ListCollection,
} from "../../types";
import {
  addDaysToKey,
  combineLocalDateAndTime,
  formatCompactDayHeading,
  formatTime,
  getCalendarMatrix,
  getDayAbbrev,
  getDayNumber,
  getEntryDayKey,
  getTodayKey,
  pad2,
} from "../../utils/date";
import { parseNlpInput } from "../../utils/nlp";
import { DynamicIcon } from "../IconLibrary";
import { IconPickerPopover } from "../IconPicker";

interface NewEventComposerProps {
  open: boolean;
  initialDateKey: string;
  isDesktop: boolean;
  prefs: EventComposerPreferences;
  onUpdatePrefs: (next: EventComposerPreferences) => void;
  allEvents: Entry[];
  lists: ListCollection[];
  allEventTags: string[];
  timeFormat: "12h" | "24h";
  onClose: () => void;
  onCreated?: (created: Entry) => void;
  onOpenFullEditor: (draft: Partial<Entry>) => void;
}

const MINI_CALENDAR_WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const TIME_PRESET_SLOTS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "18:00",
  "20:00",
];

const DURATION_PRESETS: { label: string; minutes: number }[] = [
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "1.5h", minutes: 90 },
  { label: "2h", minutes: 120 },
];

function addMinutesToHHMM(timeHHMM: string, deltaMinutes: number): string {
  const [hRaw, mRaw] = timeHHMM.split(":").map(Number);
  if (Number.isNaN(hRaw) || Number.isNaN(mRaw)) return "";
  const total = (((hRaw * 60 + mRaw + deltaMinutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

function formatHHMMDisplay(
  timeHHMM: string,
  timeFormat: "12h" | "24h",
): string {
  const [hRaw, mRaw] = timeHHMM.split(":").map(Number);
  if (Number.isNaN(hRaw) || Number.isNaN(mRaw)) return timeHHMM;
  if (timeFormat === "24h") {
    return `${pad2(hRaw)}:${pad2(mRaw)}`;
  }
  const suffix = hRaw >= 12 ? "PM" : "AM";
  const h12 = hRaw % 12 === 0 ? 12 : hRaw % 12;
  return mRaw === 0
    ? `${h12} ${suffix}`
    : `${h12}:${pad2(mRaw)} ${suffix}`;
}

function plainTextToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return trimmed
    .split(/\n{2,}/)
    .map((para) => `<p>${escape(para).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export const NewEventComposer: React.FC<NewEventComposerProps> = ({
  open,
  initialDateKey,
  isDesktop,
  prefs,
  onUpdatePrefs,
  allEvents,
  lists,
  allEventTags,
  timeFormat,
  onClose,
  onCreated,
  onOpenFullEditor,
}) => {
  const { createEntry, pushToast } = useWorkspace();
  const todayKey = getTodayKey();

  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [dateKey, setDateKey] = useState(initialDateKey || todayKey);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("");
  const [eventCategory, setEventCategory] = useState<EventCategory>("personal");
  const [attendance, setAttendance] = useState<EventAttendance>(null);
  const [location, setLocation] = useState("");
  const [isAchievement, setIsAchievement] = useState(false);
  const [listIds, setListIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [notesText, setNotesText] = useState("");
  const [quickExpanded, setQuickExpanded] = useState(false);
  const [manualDateTouched, setManualDateTouched] = useState(false);
  const [manualTimeTouched, setManualTimeTouched] = useState(false);

  const [miniCalMonth, setMiniCalMonth] = useState<{
    year: number;
    monthIndex: number;
  }>(() => {
    const parts = (initialDateKey || todayKey).split("-").map(Number);
    return {
      year: parts[0] || new Date().getFullYear(),
      monthIndex: (parts[1] || new Date().getMonth() + 1) - 1,
    };
  });

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const isComposingRef = useRef(false);

  // Reset form each time composer opens
  useEffect(() => {
    if (!open) return;
    const baseKey = initialDateKey || todayKey;
    setTitle("");
    setIcon("");
    setIconPickerOpen(false);
    setDateKey(baseKey);
    setStartTime("10:00");
    setEndTime("");
    setEventCategory("personal");
    setAttendance(null);
    setLocation("");
    setIsAchievement(false);
    setListIds([]);
    setTags([]);
    setTagInput("");
    setNotesText("");
    setQuickExpanded(false);
    setManualDateTouched(false);
    setManualTimeTouched(false);
    const [y, m] = baseKey.split("-").map(Number);
    if (y && m) {
      setMiniCalMonth({ year: y, monthIndex: m - 1 });
    }
    const timer = window.setTimeout(() => {
      titleInputRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(timer);
  }, [open, initialDateKey, todayKey]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isComposingRef.current && !e.isComposing) {
        if (iconPickerOpen) {
          setIconPickerOpen(false);
          return;
        }
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, iconPickerOpen, onClose]);

  const activeDesktopMode: Exclude<DesktopNewEventUiMode, "full-sheet"> =
    prefs.desktopMode === "full-sheet" ? "modal" : prefs.desktopMode;
  const activeMobileMode: Exclude<MobileNewEventUiMode, "full-sheet"> =
    prefs.mobileMode === "full-sheet" ? "sheet" : prefs.mobileMode;

  const isQuickMode = isDesktop
    ? activeDesktopMode === "quick-bar"
    : activeMobileMode === "quick-dock";

  // Smart NLP parsing for Quick Bar / Quick Dock
  const nlpPreview = useMemo(() => {
    if (!isQuickMode || !title.trim()) return null;
    const parsed = parseNlpInput(title, dateKey || todayKey, timeFormat);
    const hasUsefulSignal =
      parsed.hasExplicitDate ||
      parsed.hasExplicitTime ||
      parsed.hasTimeRange ||
      parsed.tags.length > 0;
    if (!hasUsefulSignal) return null;
    return parsed;
  }, [isQuickMode, title, dateKey, todayKey, timeFormat]);

  // Existing events count & list by day for Calendar Studio
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const ev of allEvents) {
      const dk = getEntryDayKey(ev);
      const arr = map.get(dk);
      if (arr) arr.push(ev);
      else map.set(dk, [ev]);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => {
        const ta = new Date(a.scheduledAt || a.createdAt).getTime();
        const tb = new Date(b.scheduledAt || b.createdAt).getTime();
        return ta - tb;
      });
    }
    return map;
  }, [allEvents]);

  const selectedDayExistingEvents = useMemo(
    () => eventsByDay.get(dateKey) ?? [],
    [eventsByDay, dateKey],
  );

  const miniCalMatrix = useMemo(
    () => getCalendarMatrix(miniCalMonth.year, miniCalMonth.monthIndex),
    [miniCalMonth.year, miniCalMonth.monthIndex],
  );

  const miniCalMonthLabel = useMemo(() => {
    const d = new Date(miniCalMonth.year, miniCalMonth.monthIndex, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [miniCalMonth.year, miniCalMonth.monthIndex]);

  if (!open) return null;

  const buildEventDraft = (): Partial<Entry> => {
    const useNlp = isQuickMode && nlpPreview;
    const resolvedTitle =
      useNlp && nlpPreview.cleanTitle.trim()
        ? nlpPreview.cleanTitle.trim()
        : title.trim();

    const resolvedDateKey =
      useNlp && !manualDateTouched && nlpPreview.resolvedDateKey
        ? nlpPreview.resolvedDateKey
        : dateKey || todayKey;

    let scheduledAt =
      combineLocalDateAndTime(resolvedDateKey, startTime || "10:00") ??
      combineLocalDateAndTime(resolvedDateKey, "10:00");
    let resolvedEndAt = endTime
      ? combineLocalDateAndTime(resolvedDateKey, endTime)
      : null;

    if (useNlp && !manualTimeTouched && nlpPreview.scheduledAt) {
      scheduledAt = nlpPreview.scheduledAt;
      if (nlpPreview.endAt) {
        resolvedEndAt = nlpPreview.endAt;
      }
    }

    const mergedTags = Array.from(
      new Set([...tags, ...(useNlp ? nlpPreview.tags : [])]),
    );

    return {
      type: "event",
      title: resolvedTitle || "Untitled Event",
      icon: icon || "",
      content: plainTextToHtml(notesText),
      scheduledAt,
      endAt: resolvedEndAt,
      eventCategory,
      attendance,
      location: location.trim(),
      isAchievement,
      listIds,
      tags: mergedTags,
    };
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim()) {
      titleInputRef.current?.focus();
      return;
    }
    const draft = buildEventDraft();
    const created = createEntry(draft);
    pushToast("Event scheduled", "success");
    onCreated?.(created);
    onClose();
  };

  const handleHandoffToFullEditor = () => {
    const draft = buildEventDraft();
    if (!title.trim()) {
      draft.title = "";
    }
    onClose();
    onOpenFullEditor(draft);
  };

  const handleAddTag = (raw: string) => {
    const cleaned = raw.trim().replace(/^#/, "").toLowerCase();
    if (!cleaned) {
      setTagInput("");
      return;
    }
    if (!tags.includes(cleaned)) {
      setTags((prev) => [...prev, cleaned]);
    }
    setTagInput("");
  };

  const handleSelectDateKey = (nextKey: string) => {
    setDateKey(nextKey);
    setManualDateTouched(true);
    const [y, m] = nextKey.split("-").map(Number);
    if (y && m) {
      setMiniCalMonth({ year: y, monthIndex: m - 1 });
    }
  };

  const applyDurationMinutes = (minutes: number) => {
    const baseStart = startTime || "10:00";
    if (!startTime) setStartTime(baseStart);
    setEndTime(addMinutesToHHMM(baseStart, minutes));
    setManualTimeTouched(true);
  };

  const stepMiniCalMonth = (delta: number) => {
    const d = new Date(miniCalMonth.year, miniCalMonth.monthIndex + delta, 1);
    setMiniCalMonth({ year: d.getFullYear(), monthIndex: d.getMonth() });
  };

  const switchDesktopMode = (mode: DesktopNewEventUiMode) => {
    if (mode === "full-sheet") {
      onUpdatePrefs({ ...prefs, desktopMode: "full-sheet" });
      handleHandoffToFullEditor();
      return;
    }
    onUpdatePrefs({ ...prefs, desktopMode: mode });
  };

  const switchMobileMode = (mode: MobileNewEventUiMode) => {
    if (mode === "full-sheet") {
      onUpdatePrefs({ ...prefs, mobileMode: "full-sheet" });
      handleHandoffToFullEditor();
      return;
    }
    onUpdatePrefs({ ...prefs, mobileMode: mode });
  };

  const dateQuickPresets = [
    { label: "Today", key: todayKey },
    { label: "Tomorrow", key: addDaysToKey(todayKey, 1) },
    { label: "+3 days", key: addDaysToKey(todayKey, 3) },
    { label: "Next wk", key: addDaysToKey(todayKey, 7) },
  ];

  // Shared live UI switcher rendered inside the composer header
  const renderStyleSwitcher = (compact = false) => {
    if (isDesktop) {
      return (
        <div
          className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border overflow-x-auto no-scrollbar"
          style={{
            backgroundColor: "var(--bg-surface-subtle)",
            borderColor: "var(--border-subtle)",
          }}
          role="tablist"
          aria-label="Desktop composer layout"
        >
          {DESKTOP_NEW_EVENT_OPTIONS.filter((o) => o.id !== "full-sheet").map(
            (opt) => {
              const active = activeDesktopMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => switchDesktopMode(opt.id)}
                  title={opt.description}
                  className="h-6.5 px-2 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                  style={{
                    backgroundColor: active
                      ? "var(--bg-surface)"
                      : "transparent",
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                    boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  {compact ? opt.shortLabel : opt.shortLabel}
                </button>
              );
            },
          )}
        </div>
      );
    }

    return (
      <div
        className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border overflow-x-auto no-scrollbar max-w-full"
        style={{
          backgroundColor: "var(--bg-surface-subtle)",
          borderColor: "var(--border-subtle)",
        }}
        role="tablist"
        aria-label="Mobile composer layout"
      >
        {MOBILE_NEW_EVENT_OPTIONS.filter((o) => o.id !== "full-sheet").map(
          (opt) => {
            const active = activeMobileMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchMobileMode(opt.id)}
                className="h-7 px-2 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                style={{
                  backgroundColor: active ? "var(--bg-surface)" : "transparent",
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}
              >
                {opt.shortLabel}
              </button>
            );
          },
        )}
      </div>
    );
  };

  // Shared Title + Icon Header Input
  const renderTitleBlock = (large = true, showSubmitHint = false) => (
    <div className="flex items-start gap-2">
      <div className="relative shrink-0 pt-0.5">
        <button
          type="button"
          onClick={() => setIconPickerOpen((v) => !v)}
          title={icon ? "Change icon" : "Pick icon"}
          aria-label={icon ? "Change icon" : "Pick icon"}
          className={`${
            isDesktop ? "w-9 h-9" : "w-11 h-11"
          } rounded-xl border flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer`}
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: icon ? "var(--accent)" : "var(--border-subtle)",
            color: icon ? "var(--accent)" : "var(--text-muted)",
          }}
        >
          {icon ? (
            <DynamicIcon name={icon} className="w-4.5 h-4.5" />
          ) : (
            <Calendar className="w-4.5 h-4.5" />
          )}
        </button>
        <IconPickerPopover
          open={iconPickerOpen}
          onClose={() => setIconPickerOpen(false)}
          value={icon}
          onChange={setIcon}
          onClear={() => setIcon("")}
          allowClear
          clearLabel="Default"
          title="Event Icon"
          align="left"
        />
      </div>

      <div className="flex-1 min-w-0">
        <input
          ref={titleInputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              if (isQuickMode || (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }
          }}
          placeholder={
            isQuickMode
              ? "Try: Coffee with Sam tomorrow 3pm #friends"
              : "Event title..."
          }
          className={`w-full bg-transparent outline-none font-display font-semibold tracking-tight placeholder:opacity-45 ${
            large ? "text-base sm:text-lg h-9 sm:h-10" : "text-sm h-9"
          }`}
          style={{ color: "var(--text-primary)" }}
        />
        {showSubmitHint && (
          <div
            className="text-[11px] font-mono tabular-nums mt-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {getDayAbbrev(dateKey)} · {formatCompactDayHeading(dateKey)} ·{" "}
            {formatHHMMDisplay(startTime || "10:00", timeFormat)}
            {endTime ? ` – ${formatHHMMDisplay(endTime, timeFormat)}` : ""}
          </div>
        )}
      </div>
    </div>
  );

  // Shared Date & Time Controls
  const renderDateAndTimeSection = (hideDatePresets = false) => {
    const touchH = isDesktop ? "h-8" : "h-10";
    return (
      <div className="space-y-3">
        {!hideDatePresets && (
          <div className="space-y-1.5">
            <label
              className="text-xs font-medium flex items-center gap-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              <Calendar className="w-3.5 h-3.5 opacity-75" />
              <span>Date</span>
              <span
                className="font-mono tabular-nums text-[11px] ml-auto"
                style={{ color: "var(--text-muted)" }}
              >
                {getDayAbbrev(dateKey)} · {formatCompactDayHeading(dateKey)}
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {dateQuickPresets.map((p) => {
                const active = dateKey === p.key;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleSelectDateKey(p.key)}
                    className={`${touchH} px-2.5 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer`}
                    style={{
                      backgroundColor: active
                        ? "var(--accent-soft)"
                        : "var(--bg-surface)",
                      borderColor: active
                        ? "var(--accent)"
                        : "var(--border-subtle)",
                      color: active
                        ? "var(--accent)"
                        : "var(--text-secondary)",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
              <input
                type="date"
                value={dateKey}
                onChange={(e) => {
                  if (e.target.value) handleSelectDateKey(e.target.value);
                }}
                aria-label="Event date"
                className={`${touchH} px-2.5 rounded-lg border text-xs font-mono outline-none transition-colors focus:border-[var(--accent)]`}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label
            className="text-xs font-medium flex items-center gap-1.5"
            style={{ color: "var(--text-secondary)" }}
          >
            <Clock className="w-3.5 h-3.5 opacity-75" />
            <span>Time &amp; Duration</span>
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="time"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
                setManualTimeTouched(true);
              }}
              aria-label="Start time"
              className={`${touchH} px-2.5 rounded-lg border text-xs font-mono outline-none transition-colors focus:border-[var(--accent)]`}
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              to
            </span>
            {endTime ? (
              <div className="inline-flex items-center gap-1">
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setManualTimeTouched(true);
                  }}
                  aria-label="End time"
                  className={`${touchH} px-2.5 rounded-lg border text-xs font-mono outline-none transition-colors focus:border-[var(--accent)]`}
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setEndTime("")}
                  title="Clear end time"
                  aria-label="Clear end time"
                  className={`${
                    isDesktop ? "h-8 w-8" : "h-10 w-10"
                  } rounded-lg border flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer`}
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-muted)",
                  }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="inline-flex flex-wrap items-center gap-1">
                {DURATION_PRESETS.map((dur) => (
                  <button
                    key={dur.label}
                    type="button"
                    onClick={() => applyDurationMinutes(dur.minutes)}
                    className={`${touchH} px-2 rounded-lg border text-xs font-mono whitespace-nowrap shrink-0 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer`}
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    +{dur.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            {["09:00", "10:00", "12:00", "14:00", "17:00", "19:00"].map(
              (slot) => {
                const active = startTime === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => {
                      setStartTime(slot);
                      setManualTimeTouched(true);
                    }}
                    className={`${
                      isDesktop ? "h-7" : "h-9"
                    } px-2 rounded-md text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0 transition-colors cursor-pointer`}
                    style={{
                      backgroundColor: active
                        ? "var(--accent-soft)"
                        : "var(--bg-surface-subtle)",
                      color: active ? "var(--accent)" : "var(--text-secondary)",
                    }}
                  >
                    {formatHHMMDisplay(slot, timeFormat)}
                  </button>
                );
              },
            )}
          </div>
        </div>
      </div>
    );
  };

  // Shared Category, Location, Milestone, Lists, Tags & Notes
  const renderDetailsFields = (compact = false) => {
    const touchH = isDesktop ? "h-8" : "h-10";
    return (
      <div className={compact ? "space-y-2.5" : "space-y-3"}>
        {/* Category + Attendance + Milestone Row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className="text-xs font-medium inline-flex items-center gap-1"
              style={{ color: "var(--text-secondary)" }}
            >
              <Tag className="w-3.5 h-3.5 opacity-75" />
            </span>
            <div
              className="inline-flex items-center p-0.5 rounded-lg border"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              {(["personal", "official"] as EventCategory[]).map((cat) => {
                const active = eventCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setEventCategory(cat)}
                    className={`${
                      isDesktop ? "h-7" : "h-9"
                    } px-2.5 rounded-md text-xs font-medium capitalize whitespace-nowrap shrink-0 transition-colors cursor-pointer`}
                    style={{
                      backgroundColor: active
                        ? "var(--accent-soft)"
                        : "transparent",
                      color: active ? "var(--accent)" : "var(--text-secondary)",
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsAchievement((v) => !v)}
            className={`${touchH} px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer`}
            style={{
              backgroundColor: isAchievement
                ? "color-mix(in srgb, var(--warning) 14%, transparent)"
                : "var(--bg-surface)",
              borderColor: isAchievement
                ? "color-mix(in srgb, var(--warning) 40%, transparent)"
                : "var(--border-subtle)",
              color: isAchievement ? "var(--warning)" : "var(--text-secondary)",
            }}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>{isAchievement ? "Achievement" : "Milestone"}</span>
          </button>
        </div>

        {/* Location */}
        <div
          className={`flex items-center gap-2 ${touchH} px-2.5 rounded-lg border`}
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <MapPin
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location, address, or meeting link..."
            className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:opacity-55"
            style={{ color: "var(--text-primary)" }}
          />
        </div>

        {/* Linked Lists */}
        {lists.length > 0 && (
          <div className="space-y-1">
            <div
              className="text-xs font-medium flex items-center gap-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              <FolderKanban className="w-3.5 h-3.5 opacity-75" />
              <span>Link to Lists</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {lists.map((l) => {
                const linked = listIds.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() =>
                      setListIds((prev) =>
                        linked
                          ? prev.filter((id) => id !== l.id)
                          : [...prev, l.id],
                      )
                    }
                    className={`${
                      isDesktop ? "h-7" : "h-9"
                    } px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer`}
                    style={{
                      backgroundColor: linked
                        ? "var(--accent-soft)"
                        : "var(--bg-surface)",
                      borderColor: linked
                        ? "var(--accent)"
                        : "var(--border-subtle)",
                      color: linked ? "var(--accent)" : "var(--text-secondary)",
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: l.color || "var(--accent)" }}
                    />
                    <span className="truncate max-w-[140px]">{l.title}</span>
                    {linked && <Check className="w-3 h-3 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tags */}
        <div className="space-y-1">
          <div
            className="text-xs font-medium flex items-center gap-1.5"
            style={{ color: "var(--text-secondary)" }}
          >
            <Hash className="w-3.5 h-3.5 opacity-75" />
            <span>Tags</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setTags((prev) => prev.filter((t) => t !== tag))
                }
                className={`${
                  isDesktop ? "h-7" : "h-8"
                } px-2 rounded-md text-xs font-mono inline-flex items-center gap-1 cursor-pointer`}
                style={{
                  backgroundColor: "var(--accent-soft)",
                  color: "var(--accent)",
                }}
              >
                <span>#{tag}</span>
                <X className="w-3 h-3 opacity-70" />
              </button>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  handleAddTag(tagInput);
                }
              }}
              onBlur={() => {
                if (tagInput.trim()) handleAddTag(tagInput);
              }}
              placeholder="+ Add tag"
              className={`${
                isDesktop ? "h-7" : "h-8"
              } w-28 px-2 rounded-md border bg-transparent text-xs font-mono outline-none focus:border-[var(--accent)] placeholder:opacity-55`}
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          {allEventTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {allEventTags
                .filter((t) => !tags.includes(t))
                .slice(0, 6)
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleAddTag(t)}
                    className="text-[11px] font-mono hover:underline cursor-pointer"
                    style={{ color: "var(--text-muted)" }}
                  >
                    +#{t}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <label
            className="text-xs font-medium block"
            style={{ color: "var(--text-secondary)" }}
          >
            Notes
          </label>
          <textarea
            rows={compact ? 2 : 3}
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            placeholder="Agenda, prep notes, or follow-ups..."
            className="w-full rounded-lg border p-2.5 text-xs leading-relaxed outline-none resize-y transition-colors focus:border-[var(--accent)] placeholder:opacity-55"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          />
        </div>
      </div>
    );
  };

  // Interactive Mini Month Calendar (for Calendar & Time Studio)
  const renderMiniCalendar = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold tracking-tight">
          {miniCalMonthLabel}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => stepMiniCalMonth(-1)}
            aria-label="Previous month"
            className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleSelectDateKey(todayKey)}
            className="h-7 px-2 rounded-md border text-[11px] font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => stepMiniCalMonth(1)}
            aria-label="Next month"
            className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 7-column Grid */}
      <div
        className="rounded-xl border p-2"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="grid grid-cols-7 mb-1">
          {MINI_CALENDAR_WEEKDAYS.map((wd) => (
            <div
              key={wd}
              className="text-center text-[10px] font-medium py-1"
              style={{ color: "var(--text-muted)" }}
            >
              {wd}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {miniCalMatrix.map((cellKey, idx) => {
            if (!cellKey) {
              return <div key={`empty-${idx}`} className="h-8 sm:h-8" />;
            }
            const isSelected = cellKey === dateKey;
            const isToday = cellKey === todayKey;
            const dayCount = eventsByDay.get(cellKey)?.length ?? 0;

            return (
              <button
                key={cellKey}
                type="button"
                onClick={() => handleSelectDateKey(cellKey)}
                className={`${
                  isDesktop ? "h-8" : "h-10"
                } rounded-lg flex flex-col items-center justify-center relative text-xs font-mono tabular-nums transition-colors cursor-pointer`}
                style={{
                  backgroundColor: isSelected
                    ? "var(--accent)"
                    : isToday
                      ? "var(--accent-soft)"
                      : "transparent",
                  color: isSelected
                    ? "var(--accent-fg)"
                    : isToday
                      ? "var(--accent)"
                      : "var(--text-primary)",
                  fontWeight: isSelected || isToday ? 600 : 400,
                }}
                title={`${formatCompactDayHeading(cellKey)}${
                  dayCount > 0 ? ` · ${dayCount} scheduled` : ""
                }`}
              >
                <span>{getDayNumber(cellKey)}</span>
                {dayCount > 0 && (
                  <span
                    className="w-1 h-1 rounded-full mt-0.5"
                    style={{
                      backgroundColor: isSelected
                        ? "var(--accent-fg)"
                        : "var(--accent)",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Conflict / Agenda Summary */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
            {getDayAbbrev(dateKey)} · {formatCompactDayHeading(dateKey)}
          </span>
          <span
            className="text-[11px] font-mono tabular-nums"
            style={{ color: "var(--text-muted)" }}
          >
            {selectedDayExistingEvents.length === 0
              ? "Open day"
              : `${selectedDayExistingEvents.length} scheduled`}
          </span>
        </div>

        {selectedDayExistingEvents.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
            {selectedDayExistingEvents.slice(0, 4).map((ev) => (
              <div
                key={ev.id}
                className="flex items-center gap-2 px-2 py-1 rounded-md border text-[11px]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <span
                  className="font-mono tabular-nums shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  {ev.scheduledAt
                    ? formatTime(ev.scheduledAt, timeFormat)
                    : "Anytime"}
                </span>
                <span
                  className="truncate font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {ev.title || "Untitled"}
                </span>
              </div>
            ))}
            {selectedDayExistingEvents.length > 4 && (
              <div
                className="text-[11px] font-mono px-1"
                style={{ color: "var(--text-muted)" }}
              >
                +{selectedDayExistingEvents.length - 4} more on this day
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // Shared Footer Buttons
  const renderFooter = (submitLabel = "Create Event", mobileSticky = false) => (
    <div
      className={`border-t flex items-center justify-between gap-2 shrink-0 ${
        mobileSticky ? "px-4 py-3" : "px-4 sm:px-5 py-3"
      }`}
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <button
        type="button"
        onClick={handleHandoffToFullEditor}
        className={`${
          mobileSticky ? "h-11 px-3.5" : "h-8 px-2.5"
        } rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer`}
        style={{
          backgroundColor: "var(--bg-canvas)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-secondary)",
        }}
        title="Open in full rich-text Event Sheet"
      >
        <Maximize2 className="w-3.5 h-3.5" />
        <span>Full Editor</span>
      </button>

      <div className="flex items-center gap-2 flex-1 justify-end">
        {!mobileSticky && (
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!title.trim()}
          className={`${
            mobileSticky ? "flex-1 sm:flex-initial h-11 px-5" : "h-8 px-4"
          } rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-opacity disabled:opacity-40 cursor-pointer`}
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--accent-fg)",
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{submitLabel}</span>
        </button>
      </div>
    </div>
  );

  // =========================================================================
  // 1. QUICK SPOTLIGHT BAR (Desktop) / QUICK THUMB DOCK (Mobile)
  // =========================================================================
  if (isQuickMode) {
    return (
      <div
        className={`fixed inset-0 z-[60] flex ${
          isDesktop
            ? "items-start justify-center pt-[11vh] px-4"
            : "items-end justify-center"
        } overscroll-none`}
        role="dialog"
        aria-modal="true"
        aria-label="Quick create event"
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
      >
        <div
          className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
        />

        <form
          onSubmit={handleSubmit}
          onClick={(e) => e.stopPropagation()}
          className={`relative z-10 w-full max-w-2xl border flex flex-col overflow-hidden ${
            isDesktop
              ? "rounded-2xl max-h-[78dvh]"
              : "rounded-t-2xl border-b-0 max-h-[84dvh] pb-safe animate-folio-sheet-up"
          }`}
          style={{
            backgroundColor: "var(--bg-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow: "var(--shadow-popover)",
          }}
        >
          {!isDesktop && (
            <div className="pt-2.5 pb-1 flex justify-center shrink-0">
              <div
                className="w-10 h-1 rounded-full"
                style={{ backgroundColor: "var(--border-strong)" }}
              />
            </div>
          )}

          {/* Top Bar */}
          <div
            className="px-4 py-2.5 border-b flex items-center justify-between gap-2 shrink-0"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Zap
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--accent)" }}
              />
              <span className="text-xs font-semibold whitespace-nowrap">
                Quick Event
              </span>
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              {renderStyleSwitcher(true)}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={`${
                  isDesktop ? "h-7 w-7" : "h-9 w-9"
                } rounded-lg flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0`}
                style={{ color: "var(--text-muted)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Spotlight Input + Smart Preview + Quick Controls */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-none px-4 py-3.5 space-y-3">
            {renderTitleBlock(true, false)}

            {nlpPreview && (
              <div
                className="px-3 py-2 rounded-xl border flex flex-wrap items-center gap-2 text-xs"
                style={{
                  backgroundColor: "var(--accent-soft)",
                  borderColor:
                    "color-mix(in srgb, var(--accent) 28%, transparent)",
                  color: "var(--accent)",
                }}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium">
                  Smart fill:{" "}
                  {nlpPreview.cleanTitle || title.trim()}
                </span>
                {nlpPreview.tokens.map((tok, i) => (
                  <span
                    key={`${tok.kind}-${i}`}
                    className="font-mono text-[11px] opacity-90"
                  >
                    · {tok.label}
                  </span>
                ))}
              </div>
            )}

            {/* Single-row Quick Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {dateQuickPresets.slice(0, 3).map((p) => {
                const active = dateKey === p.key;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleSelectDateKey(p.key)}
                    className={`${
                      isDesktop ? "h-8" : "h-10"
                    } px-2.5 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer`}
                    style={{
                      backgroundColor: active
                        ? "var(--accent-soft)"
                        : "var(--bg-surface)",
                      borderColor: active
                        ? "var(--accent)"
                        : "var(--border-subtle)",
                      color: active ? "var(--accent)" : "var(--text-secondary)",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}

              <input
                type="date"
                value={dateKey}
                onChange={(e) => {
                  if (e.target.value) handleSelectDateKey(e.target.value);
                }}
                aria-label="Event date"
                className={`${
                  isDesktop ? "h-8" : "h-10"
                } px-2 rounded-lg border text-xs font-mono shrink-0 outline-none`}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              />

              <input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setManualTimeTouched(true);
                }}
                aria-label="Start time"
                className={`${
                  isDesktop ? "h-8" : "h-10"
                } px-2 rounded-lg border text-xs font-mono shrink-0 outline-none`}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              />

              <button
                type="button"
                onClick={() =>
                  setEventCategory((c) =>
                    c === "personal" ? "official" : "personal",
                  )
                }
                className={`${
                  isDesktop ? "h-8" : "h-10"
                } px-2.5 rounded-lg border text-xs font-medium capitalize whitespace-nowrap shrink-0 cursor-pointer`}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                {eventCategory}
              </button>

              <button
                type="button"
                onClick={() => setQuickExpanded((v) => !v)}
                className={`${
                  isDesktop ? "h-8" : "h-10"
                } px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer`}
                style={{
                  backgroundColor: quickExpanded
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                  borderColor: quickExpanded
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                  color: quickExpanded
                    ? "var(--accent)"
                    : "var(--text-secondary)",
                }}
              >
                <span>Details</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    quickExpanded ? "rotate-180" : ""
                  }`}
                />
              </button>
            </div>

            {quickExpanded && (
              <div
                className="pt-3 border-t"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {renderDetailsFields(true)}
              </div>
            )}
          </div>

          {renderFooter("Create Event", !isDesktop)}
        </form>
      </div>
    );
  }

  // =========================================================================
  // 2. DESKTOP SLIDE-OVER DRAWER / MOBILE THUMB BOTTOM SHEET
  // =========================================================================
  if (
    (isDesktop && activeDesktopMode === "drawer") ||
    (!isDesktop && activeMobileMode === "sheet")
  ) {
    return (
      <div
        className={`fixed inset-0 z-[60] flex ${
          isDesktop ? "justify-end" : "items-end justify-center"
        } overscroll-none`}
        role="dialog"
        aria-modal="true"
        aria-label="Create event"
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
      >
        <div
          className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
        />

        <form
          onSubmit={handleSubmit}
          onClick={(e) => e.stopPropagation()}
          className={`relative z-10 flex flex-col overflow-hidden ${
            isDesktop
              ? "w-full max-w-[460px] h-dvh border-l shadow-2xl"
              : "w-full max-w-2xl max-h-[90dvh] rounded-t-2xl border-t border-x shadow-2xl pb-safe animate-folio-sheet-up"
          }`}
          style={{
            backgroundColor: "var(--bg-canvas)",
            borderColor: "var(--border-strong)",
          }}
        >
          {!isDesktop && (
            <div className="pt-2.5 pb-1 flex justify-center shrink-0">
              <div
                className="w-10 h-1 rounded-full"
                style={{ backgroundColor: "var(--border-strong)" }}
              />
            </div>
          )}

          {/* Header */}
          <div
            className="px-4 py-2.5 border-b flex items-center justify-between gap-2 shrink-0"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <CalendarDays
                className="w-4 h-4 shrink-0"
                style={{ color: "var(--accent)" }}
              />
              <span className="text-xs font-semibold whitespace-nowrap">
                New Event
              </span>
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              {renderStyleSwitcher(true)}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={`${
                  isDesktop ? "h-7 w-7" : "h-9 w-9"
                } rounded-lg flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0`}
                style={{ color: "var(--text-muted)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-none px-4 py-4 space-y-4">
            {renderTitleBlock(true, true)}
            <div
              className="border-t pt-3 space-y-4"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              {renderDateAndTimeSection(false)}
              {renderDetailsFields(false)}
            </div>
          </div>

          {renderFooter("Create Event", !isDesktop)}
        </form>
      </div>
    );
  }

  // =========================================================================
  // 3. CALENDAR & TIME STUDIO (Desktop 2-Column / Mobile Sheet + Month Grid)
  // =========================================================================
  if (
    (isDesktop && activeDesktopMode === "calendar-studio") ||
    (!isDesktop && activeMobileMode === "calendar-studio")
  ) {
    return (
      <div
        className={`fixed inset-0 z-[60] flex ${
          isDesktop
            ? "items-center justify-center p-6"
            : "items-end justify-center"
        } overscroll-none`}
        role="dialog"
        aria-modal="true"
        aria-label="Schedule event studio"
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
      >
        <div
          className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
        />

        <form
          onSubmit={handleSubmit}
          onClick={(e) => e.stopPropagation()}
          className={`relative z-10 w-full flex flex-col overflow-hidden border ${
            isDesktop
              ? "max-w-3xl max-h-[88dvh] rounded-2xl shadow-2xl"
              : "max-w-2xl max-h-[92dvh] rounded-t-2xl border-b-0 shadow-2xl pb-safe animate-folio-sheet-up"
          }`}
          style={{
            backgroundColor: "var(--bg-canvas)",
            borderColor: "var(--border-strong)",
          }}
        >
          {!isDesktop && (
            <div className="pt-2.5 pb-1 flex justify-center shrink-0">
              <div
                className="w-10 h-1 rounded-full"
                style={{ backgroundColor: "var(--border-strong)" }}
              />
            </div>
          )}

          {/* Header */}
          <div
            className="px-4 sm:px-5 py-2.5 border-b flex items-center justify-between gap-2 shrink-0"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Calendar
                className="w-4 h-4 shrink-0"
                style={{ color: "var(--accent)" }}
              />
              <span className="text-xs font-semibold whitespace-nowrap">
                Schedule Studio
              </span>
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              {renderStyleSwitcher()}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={`${
                  isDesktop ? "h-7 w-7" : "h-9 w-9"
                } rounded-lg flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0`}
                style={{ color: "var(--text-muted)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 2-Column Body on Desktop / Stacked on Mobile */}
          {isDesktop ? (
            <div className="flex-1 min-h-0 grid grid-cols-[296px_1fr] overflow-hidden">
              <div
                className="p-4 border-r overflow-y-auto overscroll-none"
                style={{
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                {renderMiniCalendar()}
              </div>

              <div className="p-5 overflow-y-auto overscroll-none space-y-4">
                {renderTitleBlock(true, true)}

                {/* Visual Time Slots Grid */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs font-medium"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Time Slot
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => {
                          setStartTime(e.target.value);
                          setManualTimeTouched(true);
                        }}
                        aria-label="Start time"
                        className="h-7 px-2 rounded-md border text-[11px] font-mono outline-none"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-primary)",
                        }}
                      />
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        –
                      </span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => {
                          setEndTime(e.target.value);
                          setManualTimeTouched(true);
                        }}
                        aria-label="End time"
                        className="h-7 px-2 rounded-md border text-[11px] font-mono outline-none"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-1.5">
                    {TIME_PRESET_SLOTS.map((slot) => {
                      const active = startTime === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => {
                            setStartTime(slot);
                            setManualTimeTouched(true);
                          }}
                          className="h-8 rounded-lg border text-[11px] font-mono tabular-nums transition-colors cursor-pointer"
                          style={{
                            backgroundColor: active
                              ? "var(--accent-soft)"
                              : "var(--bg-surface)",
                            borderColor: active
                              ? "var(--accent)"
                              : "var(--border-subtle)",
                            color: active
                              ? "var(--accent)"
                              : "var(--text-secondary)",
                            fontWeight: active ? 600 : 400,
                          }}
                        >
                          {formatHHMMDisplay(slot, timeFormat)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Duration:
                    </span>
                    {DURATION_PRESETS.map((dur) => (
                      <button
                        key={dur.label}
                        type="button"
                        onClick={() => applyDurationMinutes(dur.minutes)}
                        className="h-7 px-2 rounded-md border text-[11px] font-mono hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {dur.label}
                      </button>
                    ))}
                    {endTime && (
                      <button
                        type="button"
                        onClick={() => setEndTime("")}
                        className="h-7 px-2 rounded-md text-[11px] hover:underline cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Clear end
                      </button>
                    )}
                  </div>
                </div>

                {renderDetailsFields(false)}
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-none px-4 py-4 space-y-4">
              {renderTitleBlock(true, true)}
              <div
                className="p-3 rounded-xl border"
                style={{
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                {renderMiniCalendar()}
              </div>
              {renderDateAndTimeSection(true)}
              {renderDetailsFields(false)}
            </div>
          )}

          {renderFooter("Schedule Event", !isDesktop)}
        </form>
      </div>
    );
  }

  // =========================================================================
  // 4. FOCUSED STUDIO MODAL (Desktop Default & Mobile Centered Card Option)
  // =========================================================================
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-label="New event dialog"
      onCompositionStart={() => {
        isComposingRef.current = true;
      }}
      onCompositionEnd={() => {
        isComposingRef.current = false;
      }}
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-xl max-h-[90dvh] rounded-2xl border flex flex-col overflow-hidden"
        style={{
          backgroundColor: "var(--bg-canvas)",
          borderColor: "var(--border-strong)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        {/* Modal Header */}
        <div
          className="px-4 sm:px-5 py-2.5 border-b flex items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays
              className="w-4 h-4 shrink-0"
              style={{ color: "var(--accent)" }}
            />
            <span className="text-xs font-semibold whitespace-nowrap">
              New Event
            </span>
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            {renderStyleSwitcher()}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`${
                isDesktop ? "h-7 w-7" : "h-9 w-9"
              } rounded-lg flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0`}
              style={{ color: "var(--text-muted)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-none px-4 sm:px-5 py-4 space-y-4">
          {renderTitleBlock(true, true)}
          <div
            className="border-t pt-3.5 space-y-4"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            {renderDateAndTimeSection(false)}
            {renderDetailsFields(false)}
          </div>
        </div>

        {renderFooter("Create Event", !isDesktop)}
      </form>
    </div>
  );
};
