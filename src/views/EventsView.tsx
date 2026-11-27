import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CalendarDays,
  Check,
  ChevronDown,
  Filter,
  Globe,
  LayoutGrid,
  List as ListIcon,
  MapPin,
  MoreVertical,
  PanelRight,
  Plus,
  Search,
  Trophy,
  X,
} from "lucide-react";
import { DynamicIcon } from "../components/IconLibrary";
import { RichContent } from "../components/RichContent";
import { EventComposerStylePicker } from "../components/events/EventComposerStylePicker";
import { EventDaySummaryPane } from "../components/events/EventDaySummaryPane";
import { EventInspector } from "../components/events/EventInspector";
import { EventsMonthCalendar } from "../components/events/EventsMonthCalendar";
import { NewEventComposer } from "../components/events/NewEventComposer";
import { BottomSheet } from "../components/ui/BottomSheet";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  EventComposerPreferences,
  loadEventComposerPrefs,
  saveEventComposerPrefs,
  subscribeEventComposerPrefs,
} from "../lib/eventComposerPrefs";
import {
  ContextMenuRecord,
  DetailSheetTarget,
  Entry,
  ListCollection,
} from "../types";
import {
  buildDateAtTime,
  formatCompactDayHeading,
  formatTime,
  getDayAbbrev,
  getEntryDayKey,
  getTodayKey,
  parseLocalDateKey,
} from "../utils/date";
import { VIEW_PREFERENCE_SYNC_EVENT } from "../utils/viewPreferences";

type EventCatFilter = "all" | "official" | "personal";
type EventTimeframeFilter = "all" | "upcoming" | "today" | "past";
type EventSort = "date-asc" | "date-desc" | "title-asc";
type EventsViewMode = "grid" | "list" | "calendar";
type EventStatusFilter = "all" | "attended" | "missed" | "universal" | "pending";

interface PersistedEventFilters {
  category: EventCatFilter;
  timeframe: EventTimeframeFilter;
  sort: EventSort;
  viewMode: EventsViewMode;
  status: EventStatusFilter;
}

const FILTER_STORAGE_KEY = "kanso_events_filters_v1";
const SPLIT_OPEN_STORAGE_KEY = "kanso_events_split_open_v1";

function loadPersistedFilters(): PersistedEventFilters {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        category: "all",
        timeframe: "all",
        sort: "date-asc",
        viewMode:
          parsed.viewMode === "list" || parsed.viewMode === "calendar"
            ? parsed.viewMode
            : "grid",
        status: "all",
        ...parsed,
      };
    }
  } catch {
    // Ignore
  }
  return {
    category: "all",
    timeframe: "all",
    sort: "date-asc",
    viewMode: "grid",
    status: "all",
  };
}

interface EventsViewProps {
  onOpenDetail: (target: DetailSheetTarget) => void;
  onOpenContextMenu: (record: ContextMenuRecord, e: React.MouseEvent) => void;
}

export const EventsView: React.FC<EventsViewProps> = ({
  onOpenDetail,
  onOpenContextMenu,
}) => {
  const { workspace, cycleEventAttendance } = useWorkspace();
  const todayKey = getTodayKey();
  const timeFormat = workspace.settings.timeFormat;

  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 1024px)").matches
      : true,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDateKey, setComposerDateKey] = useState(todayKey);
  const [composerStyleMenuOpen, setComposerStyleMenuOpen] = useState(false);
  const [composerPrefs, setComposerPrefs] = useState<EventComposerPreferences>(
    loadEventComposerPrefs,
  );

  const [filters, setFilters] = useState<PersistedEventFilters>(
    loadPersistedFilters,
  );

  const [splitOpen, setSplitOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SPLIT_OPEN_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(todayKey);
  const [openedFromDayKey, setOpenedFromDayKey] = useState<string | null>(null);
  const [focusCreateNonce, setFocusCreateNonce] = useState(0);

  const [calendarMonth, setCalendarMonth] = useState<{
    year: number;
    monthIndex: number;
  }>(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  });

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // Ignore
    }
  }, [filters]);

  useEffect(() => {
    try {
      localStorage.setItem(SPLIT_OPEN_STORAGE_KEY, String(splitOpen));
    } catch {
      // Ignore
    }
  }, [splitOpen]);

  useEffect(() => {
    const onSynced = () => {
      setFilters(loadPersistedFilters());
    };
    window.addEventListener(VIEW_PREFERENCE_SYNC_EVENT, onSynced);
    return () => {
      window.removeEventListener(VIEW_PREFERENCE_SYNC_EVENT, onSynced);
    };
  }, []);

  useEffect(() => {
    return subscribeEventComposerPrefs(setComposerPrefs);
  }, []);

  const activeLists = useMemo(
    () => workspace.lists || [],
    [workspace.lists],
  );

  const listMap = useMemo(
    () => new Map(activeLists.map((l) => [l.id, l])),
    [activeLists],
  );

  const allEvents = useMemo(
    () => workspace.entries.filter((e) => e.type === "event"),
    [workspace.entries],
  );

  const allEventTags = useMemo(() => {
    const set = new Set<string>();
    for (const ev of allEvents) {
      for (const t of ev.tags || []) set.add(t);
    }
    return Array.from(set).sort();
  }, [allEvents]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEvents
      .filter((ev) => {
        const cat = ev.eventCategory || "personal";
        if (filters.category !== "all" && cat !== filters.category)
          return false;

        const dayKey = getEntryDayKey(ev);
        if (filters.timeframe === "today" && dayKey !== todayKey) return false;
        if (filters.timeframe === "upcoming" && dayKey < todayKey) return false;
        if (filters.timeframe === "past" && dayKey >= todayKey) return false;

        const sf = filters.status ?? "all";
        if (sf !== "all") {
          if (sf === "pending" && ev.attendance !== null) return false;
          else if (sf === "attended" && ev.attendance !== "attended")
            return false;
          else if (sf === "missed" && ev.attendance !== "missed") return false;
          else if (sf === "universal" && ev.attendance !== "universal")
            return false;
        }

        if (!q) return true;
        const matchesList = (ev.listIds || []).some((id) =>
          (listMap.get(id)?.title || "").toLowerCase().includes(q),
        );
        return (
          ev.title.toLowerCase().includes(q) ||
          ev.content.toLowerCase().includes(q) ||
          (ev.location || "").toLowerCase().includes(q) ||
          ev.tags.some((t) => t.toLowerCase().includes(q)) ||
          matchesList
        );
      })
      .sort((a, b) => {
        if (filters.sort === "title-asc") return a.title.localeCompare(b.title);
        const ta = new Date(a.scheduledAt || a.createdAt).getTime();
        const tb = new Date(b.scheduledAt || b.createdAt).getTime();
        return filters.sort === "date-asc" ? ta - tb : tb - ta;
      });
  }, [allEvents, search, filters, todayKey, listMap]);

  const selectedEvent = useMemo(
    () =>
      selectedEventId
        ? allEvents.find((e) => e.id === selectedEventId) ?? null
        : null,
    [allEvents, selectedEventId],
  );

  // Clear stale selection if the event was deleted
  useEffect(() => {
    if (selectedEventId && !selectedEvent) {
      setSelectedEventId(null);
    }
  }, [selectedEventId, selectedEvent]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDayKey) return [];
    return filteredEvents
      .filter((ev) => getEntryDayKey(ev) === selectedDayKey)
      .sort((a, b) => {
        const ta = new Date(a.scheduledAt || a.createdAt).getTime();
        const tb = new Date(b.scheduledAt || b.createdAt).getTime();
        return ta - tb;
      });
  }, [filteredEvents, selectedDayKey]);

  const activeFilterCount =
    (filters.category !== "all" ? 1 : 0) +
    (filters.timeframe !== "all" ? 1 : 0) +
    ((filters.status ?? "all") !== "all" ? 1 : 0);

  const handleUpdateComposerPrefs = useCallback(
    (next: EventComposerPreferences) => {
      const saved = saveEventComposerPrefs(next);
      setComposerPrefs(saved);
    },
    [],
  );

  const openNewEventModalForDay = useCallback(
    (dayKey: string) => {
      const scheduledAt = buildDateAtTime(dayKey || todayKey, 10, 0);
      setComposerOpen(false);
      setComposerStyleMenuOpen(false);
      onOpenDetail({
        mode: "event",
        draft: {
          type: "event",
          title: "",
          scheduledAt,
          eventCategory: "personal",
          attendance: null,
        },
      });
    },
    [todayKey, onOpenDetail],
  );

  const handleOpenNewEventForDay = useCallback(
    (dayKey: string) => {
      const targetDay = dayKey || todayKey;
      setComposerStyleMenuOpen(false);
      const activeMode = isDesktop
        ? composerPrefs.desktopMode
        : composerPrefs.mobileMode;
      if (activeMode === "full-sheet") {
        openNewEventModalForDay(targetDay);
        return;
      }
      setComposerDateKey(targetDay);
      setComposerOpen(true);
    },
    [
      todayKey,
      isDesktop,
      composerPrefs.desktopMode,
      composerPrefs.mobileMode,
      openNewEventModalForDay,
    ],
  );

  const handleStartNewEvent = () => {
    const targetDay =
      filters.viewMode === "calendar" && selectedDayKey
        ? selectedDayKey
        : todayKey;
    handleOpenNewEventForDay(targetDay);
  };

  const handleOpenEventClick = useCallback(
    (ev: Entry) => {
      if (isDesktop) {
        setOpenedFromDayKey(null);
        setSelectedEventId(ev.id);
        setSplitOpen(true);
      } else {
        onOpenDetail({ mode: "event", id: ev.id });
      }
    },
    [isDesktop, onOpenDetail],
  );

  const handleSelectCalendarDay = useCallback(
    (dateKey: string, focusCreate = false) => {
      setSelectedDayKey(dateKey);
      if (isDesktop) {
        setSelectedEventId(null);
        setOpenedFromDayKey(null);
        setSplitOpen(true);
        if (focusCreate) {
          setFocusCreateNonce((n) => n + 1);
        }
      } else if (focusCreate) {
        handleOpenNewEventForDay(dateKey);
      }
    },
    [isDesktop, handleOpenNewEventForDay],
  );

  const getEventPresentation = (ev: Entry) => {
    const dayKey = getEntryDayKey(ev);
    const dateObj = parseLocalDateKey(dayKey);
    const dayNum = String(dateObj.getDate()).padStart(2, "0");
    const monthShort = dateObj.toLocaleString("en-US", { month: "short" });
    const weekday = getDayAbbrev(dayKey);
    const isToday = dayKey === todayKey;
    const isPast = dayKey < todayKey;
    const isUniversal = ev.attendance === "universal";
    const isUnresolved =
      isPast && !ev.attendance && !ev.isAchievement && !isUniversal;
    const category = ev.eventCategory || "personal";
    const isAchievement = Boolean(ev.isAchievement);

    let chipBg = "var(--bg-surface-subtle)";
    let chipFg = "var(--text-secondary)";
    let chipBorder = "var(--border-subtle)";
    if (ev.attendance === "attended") {
      chipBg = "color-mix(in srgb, var(--success) 13%, transparent)";
      chipFg = "var(--success)";
      chipBorder = "color-mix(in srgb, var(--success) 32%, transparent)";
    } else if (ev.attendance === "missed") {
      chipBg = "color-mix(in srgb, var(--danger) 13%, transparent)";
      chipFg = "var(--danger)";
      chipBorder = "color-mix(in srgb, var(--danger) 32%, transparent)";
    } else if (isUniversal) {
      chipBg = "color-mix(in srgb, var(--accent) 13%, transparent)";
      chipFg = "var(--accent)";
      chipBorder = "color-mix(in srgb, var(--accent) 30%, transparent)";
    } else if (isToday) {
      chipBg = "var(--accent-soft)";
      chipFg = "var(--accent)";
      chipBorder = "color-mix(in srgb, var(--accent) 30%, transparent)";
    }

    let statusDotColor: string =
      category === "official"
        ? "var(--accent)"
        : "var(--color-entity-rose, var(--danger))";
    let statusLabel: string = category === "official" ? "Official" : "Personal";
    let isUniversalStatus = false;

    if (isAchievement) {
      statusDotColor = "var(--warning)";
      statusLabel = "Achievement";
    } else if (ev.attendance === "attended") {
      statusDotColor = "var(--success)";
      statusLabel = `Attended · ${category === "official" ? "Official" : "Personal"}`;
    } else if (ev.attendance === "missed") {
      statusDotColor = "var(--danger)";
      statusLabel = `Missed · ${category === "official" ? "Official" : "Personal"}`;
    } else if (isUniversal) {
      statusDotColor = "var(--accent)";
      statusLabel = `Universal · ${category === "official" ? "Official" : "Personal"}`;
      isUniversalStatus = true;
    } else if (isToday) {
      statusDotColor = "var(--accent)";
      statusLabel = `Today · ${category === "official" ? "Official" : "Personal"}`;
    } else if (isUnresolved) {
      statusDotColor = "var(--warning)";
      statusLabel = `Unresolved · ${category === "official" ? "Official" : "Personal"}`;
    }

    return {
      dayKey,
      dayNum,
      monthShort,
      weekday,
      isToday,
      isUnresolved,
      isUniversal,
      isUniversalStatus,
      category,
      isAchievement,
      chipBg,
      chipFg,
      chipBorder,
      statusDotColor,
      statusLabel,
    };
  };

  return (
    <div
      className="h-full flex-1 min-h-0 lg:h-dvh flex overflow-hidden overscroll-none"
      style={{ backgroundColor: "var(--bg-canvas)" }}
    >
      {/* Main Scrollable Events Workspace Column */}
      <div className="flex-1 min-w-0 h-full overflow-y-auto overscroll-none px-4 sm:px-6 lg:px-8 pt-5 pb-24 lg:pb-10 space-y-4">
        {/* Header */}
        <header
          className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-baseline gap-2.5 min-w-0">
            <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight">
              Events
            </h1>
            <span
              className="text-xs font-mono tabular-nums shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              {allEvents.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Desktop Split-Pane Inspector Toggle */}
            <button
              type="button"
              onClick={() => setSplitOpen((v) => !v)}
              title={splitOpen ? "Hide inspector" : "Show inspector"}
              aria-label={splitOpen ? "Hide inspector" : "Show inspector"}
              aria-pressed={splitOpen}
              className="hidden lg:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                backgroundColor: splitOpen
                  ? "var(--accent-soft)"
                  : "var(--bg-surface)",
                borderColor: splitOpen
                  ? "var(--accent)"
                  : "var(--border-subtle)",
                color: splitOpen ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              <PanelRight className="w-3.5 h-3.5" />
              <span>Inspector</span>
            </button>

            {/* New Event Split Button + UI Style Selector */}
            <div className="relative flex items-center">
              <div
                className="inline-flex items-center rounded-lg overflow-hidden"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                <button
                  type="button"
                  onClick={handleStartNewEvent}
                  className="h-8 pl-3 pr-2.5 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer hover:brightness-105 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Event</span>
                </button>
                <span
                  aria-hidden="true"
                  className="w-px h-4 opacity-30"
                  style={{ backgroundColor: "var(--accent-fg)" }}
                />
                <button
                  type="button"
                  onClick={() => setComposerStyleMenuOpen((v) => !v)}
                  title="Choose New Event UI style (Desktop & Mobile)"
                  aria-label="Choose New Event UI style"
                  aria-expanded={composerStyleMenuOpen}
                  className="h-8 w-7 inline-flex items-center justify-center cursor-pointer hover:brightness-105 transition-all"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {composerStyleMenuOpen && isDesktop && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setComposerStyleMenuOpen(false)}
                  />
                  <div
                    className="absolute right-0 top-10 z-30 w-80 rounded-2xl border p-3.5 space-y-2.5"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-strong)",
                      boxShadow: "var(--shadow-popover)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold">
                          New Event UI Style
                        </div>
                        <div
                          className="text-[11px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Customize separately for Desktop &amp; Mobile
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setComposerStyleMenuOpen(false)}
                        aria-label="Close style menu"
                        className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <EventComposerStylePicker
                      prefs={composerPrefs}
                      onChangePrefs={handleUpdateComposerPrefs}
                      defaultScope="desktop"
                      compact
                      onLaunchNow={handleStartNewEvent}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Unified 32px Toolbar: Search, Filter & Sort, Calendar / Grid / List Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border flex-1 min-w-[200px]"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <Search
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events, locations, lists, or tags..."
              className="flex-1 min-w-0 bg-transparent text-xs outline-none"
              style={{ color: "var(--text-primary)" }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="opacity-70 hover:opacity-100 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* MultiGroupFilterPopover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor:
                  activeFilterCount > 0
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                borderColor:
                  activeFilterCount > 0
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                color:
                  activeFilterCount > 0
                    ? "var(--accent)"
                    : "var(--text-secondary)",
              }}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filter &amp; Sort</span>
              {activeFilterCount > 0 && (
                <span className="font-mono text-[11px]">
                  ({activeFilterCount})
                </span>
              )}
            </button>

            {filterOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setFilterOpen(false)}
                />
                <div
                  className="absolute right-0 top-10 z-30 w-64 rounded-2xl border p-4 space-y-4"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    borderColor: "var(--border-strong)",
                    boxShadow: "var(--shadow-popover)",
                  }}
                >
                  {/* Category */}
                  <div className="space-y-1.5">
                    <div
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Category
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(["all", "official", "personal"] as EventCatFilter[]).map(
                        (cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() =>
                              setFilters((f) => ({ ...f, category: cat }))
                            }
                            className="h-7 rounded-lg border text-xs capitalize cursor-pointer"
                            style={{
                              backgroundColor:
                                filters.category === cat
                                  ? "var(--accent-soft)"
                                  : "var(--bg-surface)",
                              borderColor:
                                filters.category === cat
                                  ? "var(--accent)"
                                  : "var(--border-subtle)",
                              color:
                                filters.category === cat
                                  ? "var(--accent)"
                                  : "var(--text-secondary)",
                            }}
                          >
                            {cat}
                          </button>
                        ),
                      )}
                    </div>
                  </div>

                  {/* Timeframe */}
                  <div className="space-y-1.5">
                    <div
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Timeframe
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {(
                        [
                          "all",
                          "upcoming",
                          "today",
                          "past",
                        ] as EventTimeframeFilter[]
                      ).map((tf) => (
                        <button
                          key={tf}
                          type="button"
                          onClick={() =>
                            setFilters((f) => ({ ...f, timeframe: tf }))
                          }
                          className="h-7 rounded-lg border text-xs capitalize cursor-pointer"
                          style={{
                            backgroundColor:
                              filters.timeframe === tf
                                ? "var(--accent-soft)"
                                : "var(--bg-surface)",
                            borderColor:
                              filters.timeframe === tf
                                ? "var(--accent)"
                                : "var(--border-subtle)",
                            color:
                              filters.timeframe === tf
                                ? "var(--accent)"
                                : "var(--text-secondary)",
                          }}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="space-y-1.5">
                    <div
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Status
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          "all",
                          "pending",
                          "attended",
                          "missed",
                          "universal",
                        ] as EventStatusFilter[]
                      ).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() =>
                            setFilters((f) => ({ ...f, status: s }))
                          }
                          className="h-7 rounded-lg border text-xs capitalize inline-flex items-center justify-center gap-1 cursor-pointer"
                          style={{
                            backgroundColor:
                              filters.status === s
                                ? "var(--accent-soft)"
                                : "var(--bg-surface)",
                            borderColor:
                              filters.status === s
                                ? "var(--accent)"
                                : "var(--border-subtle)",
                            color:
                              filters.status === s
                                ? "var(--accent)"
                                : "var(--text-secondary)",
                          }}
                        >
                          {s === "universal" && <Globe className="w-3 h-3" />}
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sort */}
                  <div className="space-y-1.5">
                    <div
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Sort
                    </div>
                    <div className="space-y-1">
                      {(
                        [
                          { id: "date-asc", label: "Date (Soonest first)" },
                          { id: "date-desc", label: "Date (Latest first)" },
                          { id: "title-asc", label: "Title (A–Z)" },
                        ] as { id: EventSort; label: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setFilters((f) => ({ ...f, sort: opt.id }))
                          }
                          className="w-full h-8 px-2.5 rounded-lg text-xs flex items-center justify-between cursor-pointer"
                          style={{
                            backgroundColor:
                              filters.sort === opt.id
                                ? "var(--accent-soft)"
                                : "transparent",
                            color:
                              filters.sort === opt.id
                                ? "var(--accent)"
                                : "var(--text-secondary)",
                          }}
                        >
                          <span>{opt.label}</span>
                          {filters.sort === opt.id && (
                            <Check className="w-3.5 h-3.5" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Month Calendar / Card Grid / Quiet List Toggle */}
          <div
            className="inline-flex items-center h-8 p-0.5 rounded-lg border shrink-0"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, viewMode: "calendar" }))}
              title="Month calendar"
              aria-label="Month calendar view"
              aria-pressed={filters.viewMode === "calendar"}
              className="h-6.5 w-7 flex items-center justify-center rounded-md transition-colors cursor-pointer"
              style={{
                backgroundColor:
                  filters.viewMode === "calendar"
                    ? "var(--accent-soft)"
                    : "transparent",
                color:
                  filters.viewMode === "calendar"
                    ? "var(--accent)"
                    : "var(--text-muted)",
              }}
            >
              <CalendarDays className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, viewMode: "grid" }))}
              title="Card grid"
              aria-label="Card grid view"
              aria-pressed={filters.viewMode === "grid"}
              className="h-6.5 w-7 flex items-center justify-center rounded-md transition-colors cursor-pointer"
              style={{
                backgroundColor:
                  filters.viewMode === "grid"
                    ? "var(--accent-soft)"
                    : "transparent",
                color:
                  filters.viewMode === "grid"
                    ? "var(--accent)"
                    : "var(--text-muted)",
              }}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, viewMode: "list" }))}
              title="Quiet list"
              aria-label="Quiet list view"
              aria-pressed={filters.viewMode === "list"}
              className="h-6.5 w-7 flex items-center justify-center rounded-md transition-colors cursor-pointer"
              style={{
                backgroundColor:
                  filters.viewMode === "list"
                    ? "var(--accent-soft)"
                    : "transparent",
                color:
                  filters.viewMode === "list"
                    ? "var(--accent)"
                    : "var(--text-muted)",
              }}
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Events Content */}
        {filters.viewMode === "calendar" ? (
          <EventsMonthCalendar
            year={calendarMonth.year}
            monthIndex={calendarMonth.monthIndex}
            onChangeMonth={setCalendarMonth}
            events={filteredEvents}
            listMap={listMap}
            selectedEventId={splitOpen ? selectedEventId : null}
            selectedDayKey={selectedDayKey}
            timeFormat={timeFormat}
            onSelectDay={handleSelectCalendarDay}
            onSelectEvent={handleOpenEventClick}
            onOpenEventModal={(eventId) =>
              onOpenDetail({ mode: "event", id: eventId })
            }
            onNewEventForDayMobile={handleOpenNewEventForDay}
            onContextMenuEvent={(ev, e) =>
              onOpenContextMenu({ kind: "entry", entry: ev }, e)
            }
            onCycleAttendance={cycleEventAttendance}
          />
        ) : filteredEvents.length === 0 ? (
          <div
            className="rounded-xl border border-dashed py-14 px-4 text-center space-y-2"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            <Calendar className="w-6 h-6 mx-auto opacity-50" />
            <p
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              No events match your filters
            </p>
          </div>
        ) : filters.viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredEvents.map((ev) => {
              const p = getEventPresentation(ev);
              const isSelected =
                isDesktop && splitOpen && selectedEventId === ev.id;
              const linkedLists = (ev.listIds || [])
                .map((id) => listMap.get(id))
                .filter((l): l is ListCollection => Boolean(l));

              return (
                <article
                  key={ev.id}
                  onClick={() => handleOpenEventClick(ev)}
                  onDoubleClick={() =>
                    onOpenDetail({ mode: "event", id: ev.id })
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onOpenContextMenu({ kind: "entry", entry: ev }, e);
                  }}
                  className="rounded-xl border p-3 flex flex-col justify-between gap-2.5 cursor-pointer transition-colors hover:border-[var(--border-strong)]"
                  style={{
                    backgroundColor: p.isAchievement
                      ? "color-mix(in srgb, var(--warning) 7%, var(--bg-surface))"
                      : "var(--bg-surface)",
                    borderColor: isSelected
                      ? "var(--accent)"
                      : p.isAchievement
                        ? "color-mix(in srgb, var(--warning) 32%, transparent)"
                        : "var(--border-subtle)",
                    boxShadow: isSelected
                      ? "0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)"
                      : undefined,
                  }}
                >
                  <div className="space-y-2 min-w-0">
                    {/* Top Row: Compact Inline Date Chip + Attendance/Achievement & Actions */}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          cycleEventAttendance(ev.id);
                        }}
                        title="Click to cycle attendance (Pending → Attended → Missed → Universal → Pending)"
                        className="h-6 px-2 rounded-md border text-[11px] font-mono tabular-nums font-medium inline-flex items-center gap-1 shrink-0 transition-transform active:scale-95 cursor-pointer"
                        style={{
                          backgroundColor: p.chipBg,
                          color: p.chipFg,
                          borderColor: p.chipBorder,
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
                          {p.weekday} · {p.monthShort} {p.dayNum}
                        </span>
                      </button>

                      <div className="flex items-center gap-0.5 shrink-0 -mr-1">
                        {p.isAchievement && (
                          <span
                            className="h-6 w-6 flex items-center justify-center rounded-md"
                            style={{ color: "var(--warning)" }}
                            title="Achievement"
                          >
                            <Trophy className="w-3.5 h-3.5" />
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenContextMenu({ kind: "entry", entry: ev }, e);
                          }}
                          className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                          style={{ color: "var(--text-muted)" }}
                          aria-label="Event actions"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Title (+ Custom Icon when set) */}
                    <div className="flex items-start gap-1.5 min-w-0">
                      {ev.icon?.trim() && (
                        <DynamicIcon
                          name={ev.icon}
                          className="w-4 h-4 shrink-0 mt-0.5"
                          style={{ color: "var(--accent)" }}
                        />
                      )}
                      <h2
                        className="text-sm font-medium leading-snug line-clamp-2 min-w-0"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {ev.title}
                      </h2>
                    </div>

                    {/* 2-Line Faded RichContent Preview */}
                    {ev.content && (
                      <RichContent
                        html={ev.content}
                        className="line-clamp-2 text-xs"
                        fade
                      />
                    )}
                  </div>

                  <div className="space-y-2 min-w-0">
                    {/* Linked Lists Badges with Dot Color */}
                    {linkedLists.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        {linkedLists.map((list) => (
                          <span
                            key={list.id}
                            className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border text-[11px] font-medium max-w-[165px]"
                            style={{
                              backgroundColor: "var(--bg-surface-subtle)",
                              borderColor: "var(--border-subtle)",
                              color: "var(--text-secondary)",
                            }}
                            title={`Linked list: ${list.title}`}
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

                    {/* Bottom Hairline Monospace Metadata Footer */}
                    <div
                      className="pt-2 border-t flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono tabular-nums"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-muted)",
                      }}
                    >
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        {p.isUniversalStatus ? (
                          <Globe
                            className="w-3 h-3 shrink-0"
                            style={{ color: p.statusDotColor }}
                            aria-hidden="true"
                          />
                        ) : (
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: p.statusDotColor }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate">{p.statusLabel}</span>
                      </span>

                      {ev.scheduledAt && (
                        <span>· {formatTime(ev.scheduledAt, timeFormat)}</span>
                      )}

                      {ev.location && (
                        <span className="inline-flex items-center gap-0.5 font-sans truncate max-w-[140px]">
                          <span>·</span>
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{ev.location}</span>
                        </span>
                      )}

                      {p.isAchievement && ev.completedAt && (
                        <span style={{ color: "var(--warning)" }}>
                          · Achieved {formatCompactDayHeading(p.dayKey)}
                        </span>
                      )}

                      {ev.tags.length > 0 && (
                        <span className="truncate">
                          · {ev.tags.map((t) => `#${t}`).join(" ")}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div
            className="divide-y border-y"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            {filteredEvents.map((ev) => {
              const p = getEventPresentation(ev);
              const isSelected =
                isDesktop && splitOpen && selectedEventId === ev.id;
              const linkedLists = (ev.listIds || [])
                .map((id) => listMap.get(id))
                .filter((l): l is ListCollection => Boolean(l));

              return (
                <div
                  key={ev.id}
                  onClick={() => handleOpenEventClick(ev)}
                  onDoubleClick={() =>
                    onOpenDetail({ mode: "event", id: ev.id })
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onOpenContextMenu({ kind: "entry", entry: ev }, e);
                  }}
                  style={
                    isSelected
                      ? { backgroundColor: "var(--accent-soft)" }
                      : undefined
                  }
                  className="py-2.5 px-2 -mx-2 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]/75"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        cycleEventAttendance(ev.id);
                      }}
                      title="Click to cycle attendance (Pending → Attended → Missed → Universal → Pending)"
                      className="h-6 px-2 rounded-md border text-[11px] font-mono tabular-nums font-medium inline-flex items-center gap-1 shrink-0 transition-transform active:scale-95 cursor-pointer"
                      style={{
                        backgroundColor: p.chipBg,
                        color: p.chipFg,
                        borderColor: p.chipBorder,
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
                        {p.monthShort} {p.dayNum}
                      </span>
                    </button>

                    {ev.icon?.trim() && (
                      <DynamicIcon
                        name={ev.icon}
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: "var(--accent)" }}
                      />
                    )}

                    {p.isAchievement && (
                      <Trophy
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: "var(--warning)" }}
                      />
                    )}

                    <span
                      className="text-sm font-medium leading-snug truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {ev.title}
                    </span>

                    {linkedLists.length > 0 && (
                      <div className="hidden md:flex items-center gap-1 shrink-0">
                        {linkedLists.slice(0, 2).map((list) => (
                          <span
                            key={list.id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10.5px] font-medium max-w-[120px]"
                            style={{
                              backgroundColor: "var(--bg-surface)",
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
                        {linkedLists.length > 2 && (
                          <span
                            className="text-[10.5px] font-mono tabular-nums"
                            style={{ color: "var(--text-muted)" }}
                          >
                            +{linkedLists.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div
                      className="hidden sm:flex items-center gap-2 text-[11px] font-mono tabular-nums"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {ev.scheduledAt && (
                        <span>{formatTime(ev.scheduledAt, timeFormat)}</span>
                      )}
                      {ev.location && (
                        <span className="inline-flex items-center gap-0.5 font-sans max-w-[140px] truncate">
                          <span>·</span>
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{ev.location}</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <span>·</span>
                        {p.isUniversalStatus ? (
                          <Globe
                            className="w-3 h-3 shrink-0"
                            style={{ color: p.statusDotColor }}
                            aria-hidden="true"
                          />
                        ) : (
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: p.statusDotColor }}
                            aria-hidden="true"
                          />
                        )}
                        <span>{p.statusLabel}</span>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenContextMenu({ kind: "entry", entry: ev }, e);
                      }}
                      className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                      aria-label="Event actions"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DESKTOP RIGHT SPLIT PANE: Event Inspector OR Selected Day Summary */}
      {splitOpen && (
        <aside
          aria-label="Event inspector and day summary"
          className="hidden lg:flex lg:flex-col w-80 xl:w-[400px] shrink-0 border-l overflow-hidden"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-canvas)",
          }}
        >
          {selectedEvent ? (
            <EventInspector
              key={selectedEvent.id}
              event={selectedEvent}
              lists={activeLists}
              allEventTags={allEventTags}
              backToDayLabel={
                openedFromDayKey
                  ? formatCompactDayHeading(openedFromDayKey)
                  : null
              }
              onBackToDay={
                openedFromDayKey
                  ? () => {
                      setSelectedDayKey(openedFromDayKey);
                      setSelectedEventId(null);
                      setOpenedFromDayKey(null);
                    }
                  : undefined
              }
              onClose={() => {
                setSelectedEventId(null);
                setOpenedFromDayKey(null);
                if (filters.viewMode !== "calendar" || !selectedDayKey) {
                  setSplitOpen(false);
                }
              }}
              onOpenModal={(eventId) =>
                onOpenDetail({ mode: "event", id: eventId })
              }
            />
          ) : filters.viewMode === "calendar" && selectedDayKey ? (
            <EventDaySummaryPane
              dateKey={selectedDayKey}
              events={selectedDayEvents}
              listMap={listMap}
              focusCreateNonce={focusCreateNonce}
              onClose={() => setSplitOpen(false)}
              onSelectEvent={(eventId) => {
                setOpenedFromDayKey(selectedDayKey);
                setSelectedEventId(eventId);
              }}
              onOpenEventModal={(eventId) =>
                onOpenDetail({ mode: "event", id: eventId })
              }
              onOpenNewEventModalForDay={openNewEventModalForDay}
              onContextMenuEvent={(ev, e) =>
                onOpenContextMenu({ kind: "entry", entry: ev }, e)
              }
            />
          ) : (
            <div className="flex-1 flex flex-col">
              <div
                className="px-4 py-2 border-b flex items-center justify-between gap-2 shrink-0"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <span
                  className="text-xs font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Inspector
                </span>
                <button
                  type="button"
                  onClick={() => setSplitOpen(false)}
                  title="Close inspector"
                  aria-label="Close inspector"
                  className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2.5">
                <Calendar
                  className="w-6 h-6 opacity-40"
                  style={{ color: "var(--text-muted)" }}
                />
                <p
                  className="text-xs font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Select an event to inspect
                </p>
                <p
                  className="text-xs max-w-[230px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Click any event card, row, or calendar pill to edit its
                  schedule, attendance, linked lists, and notes inline.
                </p>
              </div>
            </div>
          )}
        </aside>
      )}

      {/* Mobile New Event UI Style Picker Sheet */}
      {!isDesktop && (
        <BottomSheet
          isOpen={composerStyleMenuOpen}
          onClose={() => setComposerStyleMenuOpen(false)}
          title="New Event UI Style"
          subtitle="Choose your preferred layout on Desktop & Mobile"
          ariaLabel="New Event UI Style"
        >
          <div className="p-4">
            <EventComposerStylePicker
              prefs={composerPrefs}
              onChangePrefs={handleUpdateComposerPrefs}
              defaultScope="mobile"
              onLaunchNow={handleStartNewEvent}
            />
          </div>
        </BottomSheet>
      )}

      {/* Multi-Mode New Event Composer */}
      <NewEventComposer
        open={composerOpen}
        initialDateKey={composerDateKey}
        isDesktop={isDesktop}
        prefs={composerPrefs}
        onUpdatePrefs={handleUpdateComposerPrefs}
        allEvents={allEvents}
        lists={activeLists}
        allEventTags={allEventTags}
        timeFormat={timeFormat}
        onClose={() => setComposerOpen(false)}
        onOpenFullEditor={(draft) =>
          onOpenDetail({ mode: "event", draft })
        }
      />
    </div>
  );
};
