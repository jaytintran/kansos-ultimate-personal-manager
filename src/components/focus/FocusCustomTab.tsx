import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  GripVertical,
  LayoutGrid,
  List,
  MoreVertical,
  Pencil,
  Pin,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { InlineTitleEdit } from "../InlineTitleEdit";
import { NlpInputBar } from "../NlpInputBar";
import {
  ContextMenuRecord,
  CustomFocusTab,
  DetailSheetTarget,
  Entry,
} from "../../types";
import { formatTime } from "../../utils/date";
import { SCRATCHPAD_DARK, SCRATCHPAD_LIGHT } from "./FocusScratchpadTab";

type CustomTabViewMode = "grid" | "list";
type CustomTabSortMode = "custom" | "pinned" | "newest" | "color";

const VIEW_STORAGE_KEY = "kanso_focus_custom_tab_view_v1";
const SORT_STORAGE_KEY = "kanso_focus_custom_tab_sort_v1";

function loadViewMode(): CustomTabViewMode {
  if (typeof window === "undefined") return "list";
  try {
    const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (v === "grid" || v === "list") return v;
  } catch {
    // Ignore
  }
  return "list";
}

function loadSortMode(): CustomTabSortMode {
  if (typeof window === "undefined") return "pinned";
  try {
    const v = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (v === "custom" || v === "pinned" || v === "newest" || v === "color") {
      return v;
    }
  } catch {
    // Ignore
  }
  return "pinned";
}

interface FocusCustomTabProps {
  tab: CustomFocusTab;
  activeEntries: Entry[];
  completedEntries: Entry[];
  isDark: boolean;
  todayKey: string;
  timeFormat: "12h" | "24h";
  availableTags: string[];
  onAddEntry: (rawText: string) => boolean;
  onUpdateEntry: (id: string, patch: Partial<Entry>) => void;
  onToggleCompleted: (id: string) => void;
  onReorderEntries: (sortOrderById: Record<string, number>) => void;
  onMoveToXActive: (entry: Entry) => void;
  onOpenDetail: (target: DetailSheetTarget) => void;
  onOpenContextMenu: (record: ContextMenuRecord, e: React.MouseEvent) => void;
  onEditTab: () => void;
  onDeleteTab: () => void;
}

export const FocusCustomTab: React.FC<FocusCustomTabProps> = ({
  tab,
  activeEntries,
  completedEntries,
  isDark,
  todayKey,
  timeFormat,
  availableTags,
  onAddEntry,
  onUpdateEntry,
  onToggleCompleted,
  onReorderEntries,
  onMoveToXActive,
  onOpenDetail,
  onOpenContextMenu,
  onEditTab,
  onDeleteTab,
}) => {
  const palette = isDark ? SCRATCHPAD_DARK : SCRATCHPAD_LIGHT;

  const [viewMode, setViewMode] = useState<CustomTabViewMode>(() =>
    loadViewMode(),
  );
  const [sortMode, setSortMode] = useState<CustomTabSortMode>(() =>
    loadSortMode(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [colorFilter, setColorFilter] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      // Ignore
    }
  }, [viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, sortMode);
    } catch {
      // Ignore
    }
  }, [sortMode]);

  const sortedAll = useMemo(() => {
    const list = [...activeEntries];
    if (sortMode === "custom") {
      return list.sort((a, b) => {
        const ao =
          typeof a.sortOrder === "number" && Number.isFinite(a.sortOrder)
            ? a.sortOrder
            : Number.MAX_SAFE_INTEGER;
        const bo =
          typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder)
            ? b.sortOrder
            : Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        if (Boolean(a.pinned) !== Boolean(b.pinned)) {
          return a.pinned ? -1 : 1;
        }
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
    }
    if (sortMode === "newest") {
      return list.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    if (sortMode === "color") {
      return list.sort((a, b) => {
        const ac =
          typeof a.paletteIndex === "number"
            ? a.paletteIndex % palette.length
            : Number.MAX_SAFE_INTEGER;
        const bc =
          typeof b.paletteIndex === "number"
            ? b.paletteIndex % palette.length
            : Number.MAX_SAFE_INTEGER;
        if (ac !== bc) return ac - bc;
        if (Boolean(a.pinned) !== Boolean(b.pinned)) {
          return a.pinned ? -1 : 1;
        }
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
    }
    // Default: pinned first, then newest
    return list.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  }, [activeEntries, sortMode, palette.length]);

  const visibleEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sortedAll.filter((entry) => {
      if (pinnedOnly && !entry.pinned) return false;
      if (colorFilter !== null) {
        if (
          typeof entry.paletteIndex !== "number" ||
          entry.paletteIndex % palette.length !== colorFilter
        ) {
          return false;
        }
      }
      if (q) {
        const inTitle = entry.title.toLowerCase().includes(q);
        const inTags = entry.tags.some((t) => t.toLowerCase().includes(q));
        if (!inTitle && !inTags) return false;
      }
      return true;
    });
  }, [sortedAll, searchQuery, pinnedOnly, colorFilter, palette.length]);

  // Drag-and-drop reordering state
  const activeDragIdRef = useRef<string | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);

  const clearDrag = useCallback(() => {
    activeDragIdRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
  }, []);

  useEffect(() => {
    window.addEventListener("dragend", clearDrag);
    window.addEventListener("drop", clearDrag);
    return () => {
      window.removeEventListener("dragend", clearDrag);
      window.removeEventListener("drop", clearDrag);
    };
  }, [clearDrag]);

  const handleReorderItems = useCallback(
    (draggedId: string, targetId: string, position: "before" | "after") => {
      if (!draggedId || !targetId || draggedId === targetId) return;
      const ids = sortedAll.map((e) => e.id);
      if (!ids.includes(draggedId) || !ids.includes(targetId)) return;
      const remaining = ids.filter((id) => id !== draggedId);
      const targetIndex = remaining.indexOf(targetId);
      if (targetIndex === -1) return;
      const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
      const nextIds = [
        ...remaining.slice(0, insertIndex),
        draggedId,
        ...remaining.slice(insertIndex),
      ];
      if (nextIds.every((id, idx) => id === ids[idx]) && sortMode === "custom") {
        return;
      }
      const sortOrderById: Record<string, number> = {};
      nextIds.forEach((id, idx) => {
        sortOrderById[id] = idx;
      });
      setSortMode("custom");
      onReorderEntries(sortOrderById);
    },
    [sortedAll, sortMode, onReorderEntries],
  );

  const resolveTouchDrop = useCallback(
    (
      clientX: number,
      clientY: number,
      activeId: string,
    ): { id: string; position: "before" | "after" } | null => {
      for (const entry of visibleEntries) {
        if (entry.id === activeId) continue;
        const el = itemRefs.current.get(entry.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          const pos =
            viewMode === "grid"
              ? clientX < rect.left + rect.width / 2
                ? "before"
                : "after"
              : clientY < rect.top + rect.height / 2
                ? "before"
                : "after";
          return { id: entry.id, position: pos };
        }
      }
      return null;
    },
    [visibleEntries, viewMode],
  );

  const hasFilters =
    searchQuery.trim().length > 0 || pinnedOnly || colorFilter !== null;

  return (
    <div className="space-y-4">
      {/* Custom Tab Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: tab.color }}
          />
          <h2 className="font-display text-base font-bold truncate">
            {tab.name}
          </h2>
          <span
            className="text-xs font-mono tabular-nums shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            {activeEntries.length} active
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onEditTab}
            className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={onDeleteTab}
            className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--danger)",
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Direct Add Bar */}
      <NlpInputBar
        placeholder={`Add task to ${tab.name} (surfaces in Timeline when completed)...`}
        onSubmit={onAddEntry}
        baseDateKey={todayKey}
        submitLabel="Add"
        availableTags={availableTags}
        showTimeblockTip={false}
      />

      {/* Scratchpad-parity Toolbar: Search, Sort, Grid/List Toggle, Pin & Color Filters */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Search Input */}
          <div
            className="flex-1 min-w-[200px] max-w-sm h-9 px-3 rounded-xl border flex items-center gap-2"
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${tab.name}...`}
              className="flex-1 min-w-0 bg-transparent outline-none text-xs sm:text-sm"
              style={{ color: "var(--text-primary)" }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="p-0.5 rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort + Grid/List Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <label
              className="h-9 px-2.5 rounded-xl border inline-flex items-center gap-1.5 text-xs"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              <ArrowUpDown
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--text-muted)" }}
              />
              <select
                value={sortMode}
                onChange={(e) =>
                  setSortMode(e.target.value as CustomTabSortMode)
                }
                className="bg-transparent outline-none text-xs font-medium cursor-pointer"
                style={{ color: "var(--text-primary)" }}
                aria-label="Sort custom pad items"
              >
                <option value="pinned">Pinned First</option>
                <option value="newest">Newest</option>
                <option value="color">By Color</option>
                <option value="custom">Custom Order</option>
              </select>
            </label>

            <div
              className="h-9 inline-flex items-center rounded-xl border p-0.5 shrink-0"
              style={{
                backgroundColor: "var(--bg-surface-subtle)",
                borderColor: "var(--border-subtle)",
              }}
              role="group"
              aria-label="Custom tab layout"
            >
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className="h-7.5 px-2.5 rounded-lg inline-flex items-center gap-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor:
                    viewMode === "grid" ? "var(--bg-surface)" : "transparent",
                  color:
                    viewMode === "grid"
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                  boxShadow:
                    viewMode === "grid" ? "var(--shadow-card)" : "none",
                }}
                aria-pressed={viewMode === "grid"}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className="h-7.5 px-2.5 rounded-lg inline-flex items-center gap-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor:
                    viewMode === "list" ? "var(--bg-surface)" : "transparent",
                  color:
                    viewMode === "list"
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                  boxShadow:
                    viewMode === "list" ? "var(--shadow-card)" : "none",
                }}
                aria-pressed={viewMode === "list"}
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">List</span>
              </button>
            </div>
          </div>
        </div>

        {/* Pin & Color Filter Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPinnedOnly((v) => !v)}
              className="h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              style={{
                backgroundColor: pinnedOnly
                  ? "var(--accent-soft)"
                  : "var(--bg-surface)",
                borderColor: pinnedOnly
                  ? "var(--accent)"
                  : "var(--border-subtle)",
                color: pinnedOnly ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              <Pin className="w-3 h-3" />
              <span>Pinned</span>
            </button>

            <span
              className="h-4 w-px mx-0.5"
              style={{ backgroundColor: "var(--border-subtle)" }}
            />

            <button
              type="button"
              onClick={() => setColorFilter(null)}
              className="h-7 px-2 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
              style={{
                backgroundColor:
                  colorFilter === null
                    ? "var(--bg-surface-subtle)"
                    : "transparent",
                borderColor:
                  colorFilter === null
                    ? "var(--border-strong)"
                    : "var(--border-subtle)",
                color:
                  colorFilter === null
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            >
              All colors
            </button>

            <div className="inline-flex items-center gap-1.5 pl-0.5">
              {palette.map((sw, idx) => {
                const active = colorFilter === idx;
                return (
                  <button
                    key={sw.name}
                    type="button"
                    onClick={() =>
                      setColorFilter((prev) => (prev === idx ? null : idx))
                    }
                    className="w-5 h-5 rounded-full border transition-transform cursor-pointer"
                    style={{
                      backgroundColor: sw.border,
                      borderColor: active ? "var(--text-primary)" : "transparent",
                      transform: active ? "scale(1.18)" : "scale(1)",
                    }}
                    title={`Filter by ${sw.name}`}
                    aria-label={`Filter by ${sw.name}`}
                    aria-pressed={active}
                  />
                );
              })}
            </div>
          </div>

          <span
            className="text-[11px] font-mono tabular-nums"
            style={{ color: "var(--text-muted)" }}
          >
            {visibleEntries.length} of {activeEntries.length} · drag handle to
            reorder
          </span>
        </div>
      </div>

      {/* Active Queue */}
      {visibleEntries.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed py-8 px-4 text-center text-xs space-y-2"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <p>
            {hasFilters
              ? `No matching items in ${tab.name}.`
              : `No pending tasks in ${tab.name}.`}
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setPinnedOnly(false);
                setColorFilter(null);
              }}
              className="h-8 px-3 rounded-lg border text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              Reset filters
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {visibleEntries.map((entry) => {
            const hasColor =
              typeof entry.paletteIndex === "number" &&
              entry.paletteIndex >= 0;
            const pal = hasColor
              ? palette[entry.paletteIndex! % palette.length]
              : null;
            const isBeingDragged = draggingId === entry.id;
            const isDrop = dropTarget?.id === entry.id;

            return (
              <div
                key={entry.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(entry.id, el);
                  else itemRefs.current.delete(entry.id);
                }}
                draggable={sortedAll.length > 1}
                onDoubleClick={() =>
                  onOpenDetail({ mode: "task", id: entry.id })
                }
                onDragStart={(e) => {
                  if (
                    e.target instanceof HTMLElement &&
                    e.target.closest("input, textarea, button")
                  ) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.setData(
                    "application/x-kanso-customtab-id",
                    entry.id,
                  );
                  e.dataTransfer.effectAllowed = "move";
                  activeDragIdRef.current = entry.id;
                  setDraggingId(entry.id);
                }}
                onDragEnd={clearDrag}
                onDragOver={(e) => {
                  if (
                    !e.dataTransfer.types.includes(
                      "application/x-kanso-customtab-id",
                    )
                  ) {
                    return;
                  }
                  if (activeDragIdRef.current === entry.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: "before" | "after" =
                    e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                  setDropTarget((prev) =>
                    prev?.id === entry.id && prev.position === position
                      ? prev
                      : { id: entry.id, position },
                  );
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDropTarget((prev) =>
                      prev?.id === entry.id ? null : prev,
                    );
                  }
                }}
                onDrop={(e) => {
                  if (
                    !e.dataTransfer.types.includes(
                      "application/x-kanso-customtab-id",
                    )
                  ) {
                    return;
                  }
                  const draggedId =
                    e.dataTransfer.getData("application/x-kanso-customtab-id") ||
                    activeDragIdRef.current;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: "before" | "after" =
                    e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                  clearDrag();
                  if (!draggedId || draggedId === entry.id) return;
                  e.preventDefault();
                  handleReorderItems(draggedId, entry.id, position);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onOpenContextMenu({ kind: "entry", entry }, e);
                }}
                className={`group rounded-2xl border p-3.5 flex flex-col gap-3 min-h-[150px] transition-all ${
                  isBeingDragged ? "opacity-45 scale-[0.98]" : ""
                }`}
                style={{
                  backgroundColor: pal ? pal.bg : "var(--bg-surface)",
                  borderColor: pal ? pal.border : "var(--border-subtle)",
                  color: pal ? pal.text : "var(--text-primary)",
                  boxShadow: isDrop
                    ? dropTarget.position === "before"
                      ? "inset 3px 0 0 var(--accent)"
                      : "inset -3px 0 0 var(--accent)"
                    : undefined,
                }}
              >
                {/* Card Top: Drag Handle + 5 Color Swatches + Pin + Menu */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`Reorder ${entry.title}`}
                      title="Drag to reorder"
                      onPointerDown={(e) => {
                        if (e.pointerType === "mouse" || sortedAll.length <= 1) {
                          return;
                        }
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        activeDragIdRef.current = entry.id;
                        setDraggingId(entry.id);
                        setDropTarget(null);
                      }}
                      onPointerMove={(e) => {
                        if (
                          e.pointerType === "mouse" ||
                          draggingId !== entry.id
                        ) {
                          return;
                        }
                        setDropTarget(
                          resolveTouchDrop(e.clientX, e.clientY, entry.id),
                        );
                      }}
                      onPointerUp={(e) => {
                        if (e.pointerType === "mouse") return;
                        e.stopPropagation();
                        if (draggingId === entry.id) {
                          const resolved =
                            resolveTouchDrop(e.clientX, e.clientY, entry.id) ??
                            dropTarget;
                          clearDrag();
                          if (resolved && resolved.id !== entry.id) {
                            handleReorderItems(
                              entry.id,
                              resolved.id,
                              resolved.position,
                            );
                          }
                        } else {
                          clearDrag();
                        }
                      }}
                      onPointerCancel={clearDrag}
                      className="touch-none select-none w-5 h-5 -ml-1 flex items-center justify-center rounded opacity-60 hover:opacity-100 cursor-grab active:cursor-grabbing"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>

                    {palette.map((sw, idx) => {
                      const active =
                        hasColor && entry.paletteIndex! % palette.length === idx;
                      return (
                        <button
                          key={sw.name}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateEntry(entry.id, {
                              paletteIndex: active ? null : idx,
                            });
                          }}
                          className="w-3.5 h-3.5 rounded-full border transition-transform cursor-pointer"
                          style={{
                            backgroundColor: sw.border,
                            borderColor: active
                              ? pal
                                ? pal.text
                                : "var(--text-primary)"
                              : "transparent",
                            transform: active ? "scale(1.18)" : "scale(1)",
                          }}
                          title={
                            active
                              ? `Clear ${sw.name} tint`
                              : `Set ${sw.name} color`
                          }
                          aria-label={`${sw.name} color`}
                        />
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateEntry(entry.id, { pinned: !entry.pinned });
                      }}
                      className="h-7 w-7 flex items-center justify-center rounded-md transition-opacity cursor-pointer"
                      style={{ opacity: entry.pinned ? 1 : 0.45 }}
                      title={entry.pinned ? "Unpin" : "Pin to top"}
                      aria-label={entry.pinned ? "Unpin item" : "Pin item"}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenContextMenu({ kind: "entry", entry }, e);
                      }}
                      className="h-7 w-7 flex items-center justify-center rounded-md opacity-65 hover:opacity-100 cursor-pointer"
                      aria-label="More actions"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card Body: Complete circle + Inline Title Edit + Meta */}
                <div className="flex-1 flex items-start gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCompleted(entry.id);
                    }}
                    className="mt-0.5 h-5 w-5 flex items-center justify-center rounded-full shrink-0 cursor-pointer"
                    style={{ color: pal ? pal.text : tab.color }}
                    aria-label={`Complete ${entry.title}`}
                  >
                    <Circle className="w-4.5 h-4.5" />
                  </button>
                  <div className="flex-1 min-w-0 space-y-1">
                    <InlineTitleEdit
                      value={entry.title}
                      allowMobileEdit
                      onCommit={(nextTitle) =>
                        onUpdateEntry(entry.id, { title: nextTitle })
                      }
                      className="text-sm font-medium"
                    />
                    {(entry.scheduledAt || entry.tags.length > 0) && (
                      <div className="flex flex-wrap items-center gap-x-1.5 text-xs font-mono tabular-nums opacity-75">
                        {entry.scheduledAt && (
                          <span>
                            {formatTime(entry.scheduledAt, timeFormat)}
                          </span>
                        )}
                        {entry.scheduledAt && entry.tags.length > 0 && (
                          <span aria-hidden="true">·</span>
                        )}
                        {entry.tags.length > 0 && (
                          <span>
                            {entry.tags.map((t) => `#${t}`).join(" ")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer: Timestamp + Send to X-Active */}
                <div
                  className={`flex items-center justify-between gap-2 pt-2 border-t ${
                    pal
                      ? "border-black/10 dark:border-white/10"
                      : "border-[var(--border-subtle)]"
                  }`}
                >
                  <span className="text-[10px] font-mono tabular-nums opacity-65">
                    {formatTime(entry.updatedAt || entry.createdAt, timeFormat)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveToXActive(entry);
                    }}
                    className={`h-7 px-2 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                      pal
                        ? "bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15"
                        : "hover:bg-[var(--accent-soft)]"
                    }`}
                    style={pal ? undefined : { color: "var(--accent)" }}
                    title="Send to Today's X-Active queue"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>X-Active</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div
          className="rounded-2xl border divide-y overflow-hidden"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          {visibleEntries.map((entry) => {
            const hasColor =
              typeof entry.paletteIndex === "number" &&
              entry.paletteIndex >= 0;
            const pal = hasColor
              ? palette[entry.paletteIndex! % palette.length]
              : null;
            const isBeingDragged = draggingId === entry.id;
            const isDrop = dropTarget?.id === entry.id;

            return (
              <div
                key={entry.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(entry.id, el);
                  else itemRefs.current.delete(entry.id);
                }}
                draggable={sortedAll.length > 1}
                onDoubleClick={() =>
                  onOpenDetail({ mode: "task", id: entry.id })
                }
                onDragStart={(e) => {
                  if (
                    e.target instanceof HTMLElement &&
                    e.target.closest("input, textarea, button")
                  ) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.setData(
                    "application/x-kanso-customtab-id",
                    entry.id,
                  );
                  e.dataTransfer.effectAllowed = "move";
                  activeDragIdRef.current = entry.id;
                  setDraggingId(entry.id);
                }}
                onDragEnd={clearDrag}
                onDragOver={(e) => {
                  if (
                    !e.dataTransfer.types.includes(
                      "application/x-kanso-customtab-id",
                    )
                  ) {
                    return;
                  }
                  if (activeDragIdRef.current === entry.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: "before" | "after" =
                    e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  setDropTarget((prev) =>
                    prev?.id === entry.id && prev.position === position
                      ? prev
                      : { id: entry.id, position },
                  );
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDropTarget((prev) =>
                      prev?.id === entry.id ? null : prev,
                    );
                  }
                }}
                onDrop={(e) => {
                  if (
                    !e.dataTransfer.types.includes(
                      "application/x-kanso-customtab-id",
                    )
                  ) {
                    return;
                  }
                  const draggedId =
                    e.dataTransfer.getData("application/x-kanso-customtab-id") ||
                    activeDragIdRef.current;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: "before" | "after" =
                    e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  clearDrag();
                  if (!draggedId || draggedId === entry.id) return;
                  e.preventDefault();
                  handleReorderItems(draggedId, entry.id, position);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onOpenContextMenu({ kind: "entry", entry }, e);
                }}
                className={`group flex items-start gap-2.5 px-3 py-3 transition-colors ${
                  pal ? "" : "hover:bg-[var(--bg-surface-subtle)]"
                } ${isBeingDragged ? "opacity-45" : ""}`}
                style={{
                  backgroundColor: pal ? pal.bg : undefined,
                  color: pal ? pal.text : "var(--text-primary)",
                  borderColor: "var(--border-subtle)",
                  boxShadow: isDrop
                    ? dropTarget.position === "before"
                      ? "inset 0 2.5px 0 var(--accent)"
                      : "inset 0 -2.5px 0 var(--accent)"
                    : undefined,
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Reorder ${entry.title}`}
                  title="Drag to reorder"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    if (e.pointerType === "mouse" || sortedAll.length <= 1) {
                      return;
                    }
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    activeDragIdRef.current = entry.id;
                    setDraggingId(entry.id);
                    setDropTarget(null);
                  }}
                  onPointerMove={(e) => {
                    if (e.pointerType === "mouse" || draggingId !== entry.id) {
                      return;
                    }
                    setDropTarget(
                      resolveTouchDrop(e.clientX, e.clientY, entry.id),
                    );
                  }}
                  onPointerUp={(e) => {
                    if (e.pointerType === "mouse") return;
                    e.stopPropagation();
                    if (draggingId === entry.id) {
                      const resolved =
                        resolveTouchDrop(e.clientX, e.clientY, entry.id) ??
                        dropTarget;
                      clearDrag();
                      if (resolved && resolved.id !== entry.id) {
                        handleReorderItems(
                          entry.id,
                          resolved.id,
                          resolved.position,
                        );
                      }
                    } else {
                      clearDrag();
                    }
                  }}
                  onPointerCancel={clearDrag}
                  className="touch-none select-none mt-0.5 w-5 h-5 flex items-center justify-center rounded opacity-55 hover:opacity-100 cursor-grab active:cursor-grabbing shrink-0"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCompleted(entry.id);
                  }}
                  className="mt-0.5 h-5 w-5 flex items-center justify-center rounded-full shrink-0 cursor-pointer"
                  style={{ color: pal ? pal.text : tab.color }}
                  aria-label={`Complete ${entry.title}`}
                >
                  <Circle className="w-4.5 h-4.5" />
                </button>

                <div className="flex-1 min-w-0 space-y-0.5">
                  <InlineTitleEdit
                    value={entry.title}
                    allowMobileEdit
                    onCommit={(nextTitle) =>
                      onUpdateEntry(entry.id, { title: nextTitle })
                    }
                    className="text-sm font-medium"
                  />
                  {(entry.scheduledAt || entry.tags.length > 0) && (
                    <div
                      className="flex flex-wrap items-center gap-x-1.5 text-xs font-mono tabular-nums"
                      style={{
                        color: pal ? pal.text : "var(--text-muted)",
                        opacity: pal ? 0.78 : 1,
                      }}
                    >
                      {entry.scheduledAt && (
                        <span>{formatTime(entry.scheduledAt, timeFormat)}</span>
                      )}
                      {entry.scheduledAt && entry.tags.length > 0 && (
                        <span aria-hidden="true">·</span>
                      )}
                      {entry.tags.length > 0 && (
                        <span>{entry.tags.map((t) => `#${t}`).join(" ")}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Inline Color Swatches + Pin + Send to X-Active + Menu */}
                <div className="flex items-center gap-1 shrink-0 self-center">
                  <div
                    className={`hidden sm:inline-flex items-center gap-1 mr-1 transition-opacity ${
                      hasColor
                        ? "opacity-90"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {palette.map((sw, idx) => {
                      const active =
                        hasColor && entry.paletteIndex! % palette.length === idx;
                      return (
                        <button
                          key={sw.name}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateEntry(entry.id, {
                              paletteIndex: active ? null : idx,
                            });
                          }}
                          className="w-3 h-3 rounded-full border cursor-pointer"
                          style={{
                            backgroundColor: sw.border,
                            borderColor: active
                              ? pal
                                ? pal.text
                                : "var(--text-primary)"
                              : "transparent",
                          }}
                          title={
                            active
                              ? `Clear ${sw.name} tint`
                              : `Set ${sw.name} color`
                          }
                          aria-label={`${sw.name} color`}
                        />
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateEntry(entry.id, { pinned: !entry.pinned });
                    }}
                    className={`h-7 w-7 flex items-center justify-center rounded-md transition-opacity cursor-pointer ${
                      entry.pinned
                        ? "opacity-100"
                        : "sm:opacity-0 sm:group-hover:opacity-100"
                    }`}
                    style={{ opacity: entry.pinned ? 1 : 0.6 }}
                    title={entry.pinned ? "Unpin" : "Pin to top"}
                    aria-label={entry.pinned ? "Unpin item" : "Pin item"}
                  >
                    <Pin className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveToXActive(entry);
                    }}
                    className="h-7 px-2 rounded-md text-[11px] font-medium inline-flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                    style={{ color: pal ? pal.text : "var(--accent)" }}
                    title="Send to Today's X-Active queue"
                    aria-label={`Send ${entry.title} to X-Active`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">X-Active</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenContextMenu({ kind: "entry", entry }, e);
                    }}
                    className="h-7 w-7 flex items-center justify-center rounded-md sm:opacity-0 sm:group-hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                    style={{ color: pal ? pal.text : "var(--text-muted)" }}
                    aria-label="More actions"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed tasks in this custom tab */}
      {completedEntries.length > 0 && (
        <div className="space-y-2 pt-2">
          <div
            className="text-xs font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            Completed ({completedEntries.length})
          </div>
          <div
            className="rounded-2xl border divide-y overflow-hidden"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            {completedEntries.map((entry) => (
              <div
                key={entry.id}
                onClick={() => onOpenDetail({ mode: "task", id: entry.id })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onOpenContextMenu({ kind: "entry", entry }, e);
                }}
                className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-[var(--bg-surface-subtle)]"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCompleted(entry.id);
                  }}
                  className="h-5 w-5 flex items-center justify-center shrink-0 cursor-pointer"
                  style={{ color: "var(--success)" }}
                  aria-label="Reopen task"
                >
                  <CheckCircle2 className="w-4.5 h-4.5" />
                </button>
                <span
                  className="text-sm line-through truncate flex-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {entry.title}
                </span>
                {entry.completedAt && (
                  <span
                    className="text-[11px] font-mono tabular-nums"
                    style={{ color: "var(--success)" }}
                  >
                    Done {formatTime(entry.completedAt, timeFormat)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
