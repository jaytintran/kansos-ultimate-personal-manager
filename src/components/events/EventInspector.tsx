import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "@tiptap/react";
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  FolderKanban,
  Hash,
  MapPin,
  Maximize2,
  Tag,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useWorkspace } from "../../context/WorkspaceContext";
import type {
  Entry,
  EventAttendance,
  EventCategory,
  ListCollection,
} from "../../types";
import {
  addDaysToKey,
  combineLocalDateAndTime,
  getEntryDayKey,
  getTodayKey,
  replaceIsoDateKeepingTime,
  toLocalDateKey,
  toTimeInputValue,
} from "../../utils/date";
import { DynamicIcon } from "../IconLibrary";
import { IconPickerPopover } from "../IconPicker";
import { TiptapEditor } from "../TiptapEditor";

const InspectorRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  alignTop?: boolean;
}> = ({ icon, label, children, alignTop = false }) => (
  <div
    className={`flex ${
      alignTop ? "items-start" : "items-center"
    } gap-2 py-0.5 min-h-[28px] text-xs`}
  >
    <div
      className={`w-[88px] shrink-0 flex items-center gap-1.5 select-none ${
        alignTop ? "pt-1" : ""
      }`}
      style={{ color: "var(--text-muted)" }}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="truncate font-medium">{label}</span>
    </div>
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

interface EventInspectorProps {
  event: Entry;
  lists: ListCollection[];
  allEventTags: string[];
  backToDayLabel?: string | null;
  onBackToDay?: () => void;
  onClose: () => void;
  onOpenModal: (eventId: string) => void;
}

function buildSnapshot(src: {
  title: string;
  icon: string;
  content: string;
  tags: string[];
  location: string;
  eventCategory: EventCategory;
  attendance: EventAttendance;
  isAchievement: boolean;
  listIds: string[];
  scheduledAt: string | null;
  endAt: string | null;
}): string {
  return JSON.stringify(src);
}

export const EventInspector: React.FC<EventInspectorProps> = ({
  event,
  lists,
  allEventTags,
  backToDayLabel,
  onBackToDay,
  onClose,
  onOpenModal,
}) => {
  const { updateEntry, setEventAttendance, deleteEntry, pushToast } =
    useWorkspace();

  const todayKey = getTodayKey();

  const [title, setTitle] = useState(() => event.title ?? "");
  const [icon, setIcon] = useState(() => event.icon ?? "");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [content, setContent] = useState(() => event.content ?? "");
  const [tags, setTags] = useState<string[]>(() => event.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [location, setLocation] = useState(() => event.location ?? "");
  const [eventCategory, setEventCategory] = useState<EventCategory>(
    () => event.eventCategory ?? "personal",
  );
  const [attendance, setAttendance] = useState<EventAttendance>(
    () => event.attendance ?? null,
  );
  const [isAchievement, setIsAchievement] = useState<boolean>(() =>
    Boolean(event.isAchievement),
  );
  const [listIds, setListIds] = useState<string[]>(() => event.listIds ?? []);
  const [scheduledAt, setScheduledAt] = useState<string | null>(
    () => event.scheduledAt ?? null,
  );
  const [endAt, setEndAt] = useState<string | null>(() => event.endAt ?? null);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);

  const lastSavedSnapRef = useRef<string>(
    buildSnapshot({
      title: event.title ?? "",
      icon: event.icon ?? "",
      content: event.content ?? "",
      tags: event.tags ?? [],
      location: event.location ?? "",
      eventCategory: event.eventCategory ?? "personal",
      attendance: event.attendance ?? null,
      isAchievement: Boolean(event.isAchievement),
      listIds: event.listIds ?? [],
      scheduledAt: event.scheduledAt ?? null,
      endAt: event.endAt ?? null,
    }),
  );

  const latestDraftRef = useRef({
    eventId: event.id,
    title,
    icon,
    content,
    tags,
    location,
    eventCategory,
    attendance,
    isAchievement,
    listIds,
    scheduledAt,
    endAt,
  });

  latestDraftRef.current = {
    eventId: event.id,
    title,
    icon,
    content,
    tags,
    location,
    eventCategory,
    attendance,
    isAchievement,
    listIds,
    scheduledAt,
    endAt,
  };

  useEffect(() => {
    editorRef.current = editorInstance;
  }, [editorInstance]);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title, event.id]);

  // Sync external mutations (e.g., cycling attendance on card/calendar pill or editing via modal)
  useEffect(() => {
    const incomingSnap = buildSnapshot({
      title: event.title ?? "",
      icon: event.icon ?? "",
      content: event.content ?? "",
      tags: event.tags ?? [],
      location: event.location ?? "",
      eventCategory: event.eventCategory ?? "personal",
      attendance: event.attendance ?? null,
      isAchievement: Boolean(event.isAchievement),
      listIds: event.listIds ?? [],
      scheduledAt: event.scheduledAt ?? null,
      endAt: event.endAt ?? null,
    });
    if (incomingSnap === lastSavedSnapRef.current) return;

    const cur = latestDraftRef.current;
    const localSnap = buildSnapshot({
      title: cur.title,
      icon: cur.icon,
      content: cur.content,
      tags: cur.tags,
      location: cur.location,
      eventCategory: cur.eventCategory,
      attendance: cur.attendance,
      isAchievement: cur.isAchievement,
      listIds: cur.listIds,
      scheduledAt: cur.scheduledAt,
      endAt: cur.endAt,
    });

    if (localSnap === lastSavedSnapRef.current) {
      setTitle(event.title ?? "");
      setIcon(event.icon ?? "");
      setContent(event.content ?? "");
      setTags(event.tags ?? []);
      setLocation(event.location ?? "");
      setEventCategory(event.eventCategory ?? "personal");
      setAttendance(event.attendance ?? null);
      setIsAchievement(Boolean(event.isAchievement));
      setListIds(event.listIds ?? []);
      setScheduledAt(event.scheduledAt ?? null);
      setEndAt(event.endAt ?? null);
      lastSavedSnapRef.current = incomingSnap;
    }
  }, [
    event.id,
    event.title,
    event.icon,
    event.content,
    event.tags,
    event.location,
    event.eventCategory,
    event.attendance,
    event.isAchievement,
    event.listIds,
    event.scheduledAt,
    event.endAt,
  ]);

  const flushSave = useCallback(() => {
    const draft = latestDraftRef.current;
    const ed = editorRef.current;
    const liveHtml = ed && !ed.isDestroyed ? ed.getHTML() : null;
    const effectiveContent =
      liveHtml !== null
        ? liveHtml === "<p></p>"
          ? ""
          : liveHtml
        : draft.content;

    const snap = buildSnapshot({
      title: draft.title,
      icon: draft.icon,
      content: effectiveContent,
      tags: draft.tags,
      location: draft.location,
      eventCategory: draft.eventCategory,
      attendance: draft.attendance,
      isAchievement: draft.isAchievement,
      listIds: draft.listIds,
      scheduledAt: draft.scheduledAt,
      endAt: draft.endAt,
    });
    if (snap === lastSavedSnapRef.current) {
      setSaveState("saved");
      return;
    }

    updateEntry(draft.eventId, {
      title: draft.title.trim() || "Untitled",
      icon: draft.icon || "",
      content: effectiveContent,
      tags: draft.tags,
      location: draft.location,
      eventCategory: draft.eventCategory,
      attendance: draft.attendance,
      isAchievement: draft.isAchievement,
      listIds: draft.listIds,
      scheduledAt: draft.scheduledAt,
      endAt: draft.endAt,
    });
    lastSavedSnapRef.current = snap;
    setSaveState("saved");
  }, [updateEntry]);

  useEffect(() => {
    const currentSnap = buildSnapshot({
      title,
      icon,
      content,
      tags,
      location,
      eventCategory,
      attendance,
      isAchievement,
      listIds,
      scheduledAt,
      endAt,
    });
    if (currentSnap === lastSavedSnapRef.current) {
      setSaveState("saved");
      return;
    }
    setSaveState("saving");
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      if (!isComposingRef.current) {
        flushSave();
      }
    }, 320);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    title,
    icon,
    content,
    tags,
    location,
    eventCategory,
    attendance,
    isAchievement,
    listIds,
    scheduledAt,
    endAt,
    flushSave,
  ]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      flushSave();
    };
  }, [flushSave]);

  const activeDateKey = useMemo(() => {
    if (scheduledAt) return toLocalDateKey(scheduledAt);
    return getEntryDayKey(event);
  }, [scheduledAt, event]);

  const startTimeVal = useMemo(() => toTimeInputValue(scheduledAt), [scheduledAt]);
  const endTimeVal = useMemo(() => toTimeInputValue(endAt), [endAt]);

  const handleDateChange = (nextDateKey: string) => {
    if (!nextDateKey) return;
    setScheduledAt((prev) =>
      prev
        ? replaceIsoDateKeepingTime(prev, nextDateKey)
        : combineLocalDateAndTime(nextDateKey, "10:00"),
    );
    setEndAt((prev) =>
      prev ? replaceIsoDateKeepingTime(prev, nextDateKey) : null,
    );
  };

  const handleStartTimeChange = (timeHHMM: string) => {
    if (!timeHHMM) return;
    const next = combineLocalDateAndTime(activeDateKey, timeHHMM);
    if (next) setScheduledAt(next);
  };

  const handleEndTimeChange = (timeHHMM: string) => {
    if (!timeHHMM) {
      setEndAt(null);
      return;
    }
    const next = combineLocalDateAndTime(activeDateKey, timeHHMM);
    if (next) setEndAt(next);
  };

  const handleAddTag = (raw: string) => {
    const cleaned = raw.trim().replace(/^#/, "").toLowerCase();
    if (!cleaned) return;
    if (!tags.includes(cleaned)) {
      setTags((prev) => [...prev, cleaned]);
    }
    setTagInput("");
  };

  const quickDateOptions = [
    { label: "Today", key: todayKey },
    { label: "Tomorrow", key: addDaysToKey(todayKey, 1) },
  ];

  return (
    <div
      className="flex-1 min-h-0 flex flex-col"
      onCompositionStart={() => {
        isComposingRef.current = true;
      }}
      onCompositionEnd={() => {
        isComposingRef.current = false;
      }}
    >
      {/* Inspector Action Bar */}
      <div
        className="px-4 py-2 border-b flex items-center justify-between gap-2 shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {backToDayLabel && onBackToDay && (
            <button
              type="button"
              onClick={() => {
                flushSave();
                onBackToDay();
              }}
              className="h-6.5 px-2 -ml-1 rounded-md text-[11px] font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
              style={{ color: "var(--accent)" }}
            >
              <ArrowLeft className="w-3 h-3" />
              <span className="truncate max-w-[110px]">{backToDayLabel}</span>
            </button>
          )}
          <span
            className="text-[11px] font-mono tabular-nums truncate"
            style={{ color: "var(--text-muted)" }}
          >
            {saveState === "saving" ? "Saving..." : "Autosaved"}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              flushSave();
              onOpenModal(event.id);
            }}
            title="Expand in modal"
            aria-label="Expand in modal"
            className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              deleteEntry(event.id);
              pushToast("Event deleted");
              onClose();
            }}
            title="Delete event"
            aria-label="Delete event"
            className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--danger)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              flushSave();
              onClose();
            }}
            title="Close inspector"
            aria-label="Close inspector"
            className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-none px-4 py-4 space-y-4">
        {/* Stacked Borderless Event Icon + Auto-Growing Display Title */}
        <div className="space-y-1">
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setIconPickerOpen((prev) => !prev)}
              title={icon ? "Change event icon" : "Add event icon"}
              aria-label={icon ? "Change event icon" : "Add event icon"}
              aria-expanded={iconPickerOpen}
              className={`-ml-1.5 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer ${
                iconPickerOpen ? "bg-[var(--bg-surface-hover)]" : ""
              }`}
              style={{
                color: icon ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              {icon ? (
                <DynamicIcon name={icon} className="w-5 h-5" />
              ) : (
                <Calendar className="w-5 h-5" />
              )}
            </button>

            <IconPickerPopover
              open={iconPickerOpen}
              onClose={() => setIconPickerOpen(false)}
              value={icon}
              onChange={(nextIcon) => setIcon(nextIcon)}
              onClear={() => setIcon("")}
              allowClear
              clearLabel="Default"
              title="Event Icon"
              align="left"
            />
          </div>

          <textarea
            ref={titleRef}
            rows={1}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                editorInstance?.commands.focus("start");
              }
            }}
            placeholder="Untitled Event"
            className="w-full bg-transparent font-display text-lg font-bold tracking-tight leading-snug resize-none outline-none overflow-hidden placeholder:opacity-40"
            style={{ color: "var(--text-primary)" }}
          />
        </div>

        {/* Event Properties */}
        <div
          className="border-y py-2 space-y-1"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <InspectorRow icon={<Calendar className="w-3.5 h-3.5" />} label="Date">
            <div className="flex flex-wrap items-center gap-1 -mx-1 px-1">
              <input
                type="date"
                value={activeDateKey}
                onChange={(e) => handleDateChange(e.target.value)}
                className="h-7 px-2 rounded-md border text-[11px] font-mono outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              />
              {quickDateOptions.map((opt) => {
                const active = activeDateKey === opt.key;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => handleDateChange(opt.key)}
                    className="h-7 px-2 rounded-md text-[11px] font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
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
          </InspectorRow>

          <InspectorRow icon={<Clock className="w-3.5 h-3.5" />} label="Time">
            <div className="flex flex-wrap items-center gap-1.5 -mx-1 px-1">
              <input
                type="time"
                value={startTimeVal}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                aria-label="Start time"
                className="h-7 px-2 rounded-md border text-[11px] font-mono outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              />
              <span
                className="text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                –
              </span>
              {endTimeVal ? (
                <div className="inline-flex items-center gap-1">
                  <input
                    type="time"
                    value={endTimeVal}
                    onChange={(e) => handleEndTimeChange(e.target.value)}
                    aria-label="End time"
                    className="h-7 px-2 rounded-md border text-[11px] font-mono outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent)]"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setEndAt(null)}
                    title="Clear end time"
                    aria-label="Clear end time"
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const base = startTimeVal || "10:00";
                    const [hh, mm] = base.split(":").map(Number);
                    const nextH = String((hh + 1) % 24).padStart(2, "0");
                    const nextM = String(mm || 0).padStart(2, "0");
                    handleEndTimeChange(`${nextH}:${nextM}`);
                  }}
                  className="h-7 px-2 rounded-md text-[11px] transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                >
                  + End time
                </button>
              )}
            </div>
          </InspectorRow>

          <InspectorRow icon={<Tag className="w-3.5 h-3.5" />} label="Category">
            <div className="flex items-center gap-1 -mx-1">
              {(["personal", "official"] as EventCategory[]).map((cat) => {
                const active = eventCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setEventCategory(cat)}
                    className="px-2 py-1 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? "var(--accent-soft)"
                        : "transparent",
                      color: active
                        ? "var(--accent)"
                        : "var(--text-secondary)",
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </InspectorRow>

          <InspectorRow
            icon={<Users className="w-3.5 h-3.5" />}
            label="Attendance"
            alignTop
          >
            <div className="flex flex-wrap items-center gap-1 -mx-1">
              {(
                [
                  { id: null, label: "Pending" },
                  { id: "attended", label: "Attended" },
                  { id: "missed", label: "Missed" },
                  { id: "universal", label: "Universal" },
                ] as { id: EventAttendance; label: string }[]
              ).map((opt) => {
                const active = attendance === opt.id;
                return (
                  <button
                    key={String(opt.id)}
                    type="button"
                    onClick={() => {
                      setAttendance(opt.id);
                      setEventAttendance(event.id, opt.id);
                    }}
                    className="px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? "var(--accent-soft)"
                        : "transparent",
                      color:
                        active && opt.id === "attended"
                          ? "var(--success)"
                          : active && opt.id === "missed"
                            ? "var(--danger)"
                            : active
                              ? "var(--accent)"
                              : "var(--text-secondary)",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </InspectorRow>

          <InspectorRow
            icon={<MapPin className="w-3.5 h-3.5" />}
            label="Location"
          >
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location..."
              className="w-full bg-transparent rounded-md px-2 py-1 -mx-1 text-xs outline-none transition-colors hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)] placeholder:opacity-50"
              style={{ color: "var(--text-primary)" }}
            />
          </InspectorRow>

          <InspectorRow
            icon={<Trophy className="w-3.5 h-3.5" />}
            label="Milestone"
          >
            <button
              type="button"
              onClick={() => setIsAchievement((v) => !v)}
              className="px-2 py-1 -mx-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                backgroundColor: isAchievement
                  ? "color-mix(in srgb, var(--warning) 14%, transparent)"
                  : "transparent",
                color: isAchievement ? "var(--warning)" : "var(--text-muted)",
              }}
            >
              {isAchievement && <Check className="w-3 h-3" />}
              <span>{isAchievement ? "Achievement" : "Mark achievement"}</span>
            </button>
          </InspectorRow>

          {lists.length > 0 && (
            <InspectorRow
              icon={<FolderKanban className="w-3.5 h-3.5" />}
              label="Lists"
              alignTop
            >
              <div className="flex flex-wrap items-center gap-1 -mx-1 px-1 py-0.5">
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
                      className="px-2 py-0.5 rounded-md border text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
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
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: l.color || "var(--accent)" }}
                      />
                      <span className="truncate max-w-[140px]">{l.title}</span>
                      {linked && <Check className="w-2.5 h-2.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </InspectorRow>
          )}

          <InspectorRow
            icon={<Hash className="w-3.5 h-3.5" />}
            label="Tags"
            alignTop
          >
            <div className="space-y-1 -mx-1 px-1 py-0.5">
              <div className="flex flex-wrap items-center gap-1">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setTags((prev) => prev.filter((t) => t !== tag))
                    }
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-mono cursor-pointer"
                    style={{
                      backgroundColor: "var(--accent-soft)",
                      color: "var(--accent)",
                    }}
                  >
                    <span>#{tag}</span>
                    <X className="w-2.5 h-2.5 opacity-65" />
                  </button>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddTag(tagInput);
                  }}
                  className="inline-flex items-center"
                >
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onBlur={() => {
                      if (tagInput.trim()) handleAddTag(tagInput);
                    }}
                    placeholder="+ Add tag"
                    className="w-24 bg-transparent rounded-md px-1.5 py-0.5 text-[11px] font-mono outline-none transition-colors hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)] placeholder:opacity-55"
                    style={{ color: "var(--text-primary)" }}
                  />
                </form>
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
          </InspectorRow>
        </div>

        {/* Rich Event Notes */}
        <div className="space-y-1.5">
          <div
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Notes
          </div>
          <TiptapEditor
            docId={event.id}
            content={content}
            onChange={setContent}
            variant="borderless"
            placeholder="Write event notes, agenda, or follow-ups..."
            minHeight={200}
            onEditorReady={setEditorInstance}
          />
        </div>
      </div>
    </div>
  );
};
