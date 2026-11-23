import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Check,
  Filter,
  Globe,
  LayoutGrid,
  List as ListIcon,
  MapPin,
  MoreVertical,
  Plus,
  Search,
  Trophy,
  X,
} from "lucide-react";
import { RichContent } from "../components/RichContent";
import { useWorkspace } from "../context/WorkspaceContext";
import { ContextMenuRecord, DetailSheetTarget, Entry } from "../types";
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
type EventsViewMode = "grid" | "list";
type EventStatusFilter = "all" | "attended" | "missed" | "universal" | "pending";

interface PersistedEventFilters {
  category: EventCatFilter;
  timeframe: EventTimeframeFilter;
  sort: EventSort;
  viewMode: EventsViewMode;
  status: EventStatusFilter;
}

const FILTER_STORAGE_KEY = "kanso_events_filters_v1";

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

  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [newEventDateOpen, setNewEventDateOpen] = useState(false);
  const [newEventDate, setNewEventDate] = useState(todayKey);

  const [filters, setFilters] = useState<PersistedEventFilters>(() => {
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) {
        return {
          category: "all",
          timeframe: "all",
          sort: "date-asc",
          viewMode: "grid",
          status: "all",
          ...JSON.parse(raw),
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
  });

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // Ignore
    }
  }, [filters]);

  useEffect(() => {
    const onSynced = () => {
      try {
        const raw = localStorage.getItem(FILTER_STORAGE_KEY);
        if (raw) {
          setFilters({
            category: "all",
            timeframe: "all",
            sort: "date-asc",
            viewMode: "grid",
            status: "all",
            ...JSON.parse(raw),
          });
        }
      } catch {
        // Ignore
      }
    };
    window.addEventListener(VIEW_PREFERENCE_SYNC_EVENT, onSynced);
    return () => {
      window.removeEventListener(VIEW_PREFERENCE_SYNC_EVENT, onSynced);
    };
  }, []);

  const allEvents = useMemo(
    () => workspace.entries.filter((e) => e.type === "event"),
    [workspace.entries],
  );

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

        // Status filter
        const sf = (filters as PersistedEventFilters).status ?? "all";
        if (sf !== "all") {
          if (sf === "pending" && ev.attendance !== null) return false;
          else if (sf === "attended" && ev.attendance !== "attended") return false;
          else if (sf === "missed" && ev.attendance !== "missed") return false;
          else if (sf === "universal" && ev.attendance !== "universal") return false;
        }

        if (!q) return true;
        return (
          ev.title.toLowerCase().includes(q) ||
          ev.content.toLowerCase().includes(q) ||
          (ev.location || "").toLowerCase().includes(q) ||
          ev.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (filters.sort === "title-asc") return a.title.localeCompare(b.title);
        const ta = new Date(a.scheduledAt || a.createdAt).getTime();
        const tb = new Date(b.scheduledAt || b.createdAt).getTime();
        return filters.sort === "date-asc" ? ta - tb : tb - ta;
      });
  }, [allEvents, search, filters, todayKey]);

  const activeFilterCount =
    (filters.category !== "all" ? 1 : 0) +
    (filters.timeframe !== "all" ? 1 : 0) +
    (((filters as PersistedEventFilters).status ?? "all") !== "all" ? 1 : 0);

  const handleStartNewEvent = () => {
    const scheduledAt = buildDateAtTime(newEventDate || todayKey, 10, 0);
    setNewEventDateOpen(false);
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
  };

  const getEventPresentation = (ev: Entry) => {
    const dayKey = getEntryDayKey(ev);
    const dateObj = parseLocalDateKey(dayKey);
    const dayNum = String(dateObj.getDate()).padStart(2, "0");
    const monthShort = dateObj.toLocaleString("en-US", { month: "short" });
    const weekday = getDayAbbrev(dayKey);
    const isToday = dayKey === todayKey;
    const isPast = dayKey < todayKey;
    const isUniversal = ev.attendance === "universal";
    // Universal events do NOT become unresolved when past
    const isUnresolved = isPast && !ev.attendance && !ev.isAchievement && !isUniversal;
    const category = ev.eventCategory || "personal";
    const isAchievement = Boolean(ev.isAchievement);

    // Inline compact date chip colors (interactive attendance cycler)
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

    // Quiet dot status for footer (paired with explicit text label)
    let statusDotColor: string =
      category === "official"
        ? "var(--accent)"
        : "var(--color-entity-rose, var(--danger))";
    let statusLabel: string = category === "official" ? "Official" : "Personal";
    // For Universal status, use globe icon indicator instead of dot (returned as flag)
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
    <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-20 space-y-4">
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

        {/* New Event Button + Date Picker Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNewEventDate(todayKey);
              setNewEventDateOpen((v) => !v);
            }}
            className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Event</span>
          </button>

          {newEventDateOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setNewEventDateOpen(false)}
              />
              <div
                className="absolute right-0 top-10 z-30 w-64 rounded-xl border p-3.5 space-y-3"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: "var(--border-strong)",
                  boxShadow: "var(--shadow-popover)",
                }}
              >
                <div className="text-xs font-semibold">Pick Event Date</div>
                <input
                  type="date"
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border text-xs font-mono outline-none"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setNewEventDateOpen(false)}
                    className="h-8 px-2.5 rounded-lg text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleStartNewEvent}
                    className="h-8 px-3 rounded-lg text-xs font-semibold"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "var(--accent-fg)",
                    }}
                  >
                    Continue
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Unified 32px Toolbar: Search, Filter & Sort, Grid/List Toggle */}
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
            placeholder="Search events, locations, or tags..."
            className="flex-1 min-w-0 bg-transparent text-xs outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="opacity-70 hover:opacity-100"
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
            className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5"
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
                          className="h-7 rounded-lg border text-xs capitalize"
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
                        className="h-7 rounded-lg border text-xs capitalize"
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
                    {(["all", "pending", "attended", "missed", "universal"] as EventStatusFilter[]).map(
                      (s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() =>
                            setFilters((f) => ({ ...f, status: s } as PersistedEventFilters))
                          }
                          className="h-7 rounded-lg border text-xs capitalize inline-flex items-center justify-center gap-1"
                          style={{
                            backgroundColor:
                              (filters as PersistedEventFilters).status === s
                                ? "var(--accent-soft)"
                                : "var(--bg-surface)",
                            borderColor:
                              (filters as PersistedEventFilters).status === s
                                ? "var(--accent)"
                                : "var(--border-subtle)",
                            color:
                              (filters as PersistedEventFilters).status === s
                                ? "var(--accent)"
                                : "var(--text-secondary)",
                          }}
                        >
                          {s === "universal" && <Globe className="w-3 h-3" />}
                          {s}
                        </button>
                      ),
                    )}
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
                        className="w-full h-8 px-2.5 rounded-lg text-xs flex items-center justify-between"
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

        {/* Grid / List View Mode Toggle */}
        <div
          className="inline-flex items-center h-8 p-0.5 rounded-lg border shrink-0"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, viewMode: "grid" }))}
            title="Card grid"
            aria-label="Card grid view"
            aria-pressed={filters.viewMode === "grid"}
            className="h-6.5 w-7 flex items-center justify-center rounded-md transition-colors"
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
            className="h-6.5 w-7 flex items-center justify-center rounded-md transition-colors"
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

      {/* Events Content: Unified 2-3 Col Compact Hairline Cards OR Quiet List */}
      {filteredEvents.length === 0 ? (
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

            return (
              <article
                key={ev.id}
                onClick={() => onOpenDetail({ mode: "event", id: ev.id })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onOpenContextMenu({ kind: "entry", entry: ev }, e);
                }}
                className="rounded-xl border p-3 flex flex-col justify-between gap-2.5 cursor-pointer transition-colors hover:border-[var(--border-strong)]"
                style={{
                  backgroundColor: p.isAchievement
                    ? "color-mix(in srgb, var(--warning) 7%, var(--bg-surface))"
                    : "var(--bg-surface)",
                  borderColor: p.isAchievement
                    ? "color-mix(in srgb, var(--warning) 32%, transparent)"
                    : "var(--border-subtle)",
                }}
              >
                <div className="space-y-2 min-w-0">
                  {/* Top Row: Compact Inline Date Chip + Always-Visible Attendance/Achievement & Actions */}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        cycleEventAttendance(ev.id);
                      }}
                      title="Click to cycle attendance (Pending → Attended → Missed → Universal → Pending)"
                      className="h-6 px-2 rounded-md border text-[11px] font-mono tabular-nums font-medium inline-flex items-center gap-1 shrink-0 transition-transform active:scale-95"
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
                        className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)]"
                        style={{ color: "var(--text-muted)" }}
                        aria-label="Event actions"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Unified 14px Sans Medium Title */}
                  <h2
                    className="text-sm font-medium leading-snug line-clamp-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {ev.title}
                  </h2>

                  {/* 2-Line Faded RichContent Preview */}
                  {ev.content && (
                    <RichContent
                      html={ev.content}
                      className="line-clamp-2 text-xs"
                      fade
                    />
                  )}
                </div>

                {/* Unified Bottom Hairline Monospace Metadata Footer + Subtle Dot Status */}
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

            return (
              <div
                key={ev.id}
                onClick={() => onOpenDetail({ mode: "event", id: ev.id })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onOpenContextMenu({ kind: "entry", entry: ev }, e);
                }}
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
                    className="h-6 px-2 rounded-md border text-[11px] font-mono tabular-nums font-medium inline-flex items-center gap-1 shrink-0 transition-transform active:scale-95"
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
                    className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)]"
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
  );
};
