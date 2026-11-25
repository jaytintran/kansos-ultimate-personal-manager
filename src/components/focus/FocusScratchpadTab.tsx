import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  GripVertical,
  LayoutGrid,
  List,
  Pin,
  Plus,
  Search,
  Send,
  StickyNote,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { ScratchpadCard } from "../../types";
import { formatTime } from "../../utils/date";
import { AutoGrowTextarea } from "./AutoGrowTextarea";

export const SCRATCHPAD_LIGHT = [
  { name: "Butter", bg: "#fef9c3", border: "#fde047", text: "#422006" },
  { name: "Mint", bg: "#dcfce7", border: "#86efac", text: "#052e16" },
  { name: "Sky", bg: "#dbeafe", border: "#93c5fd", text: "#172554" },
  { name: "Rose", bg: "#fce7f3", border: "#f9a8d4", text: "#500724" },
  { name: "Lavender", bg: "#f3e8ff", border: "#d8b4fe", text: "#3b0764" },
];

export const SCRATCHPAD_DARK = [
  { name: "Butter", bg: "#2e2814", border: "#655217", text: "#fef08a" },
  { name: "Mint", bg: "#12291c", border: "#1e5b38", text: "#bbf7d0" },
  { name: "Sky", bg: "#13233a", border: "#21487a", text: "#bfdbfe" },
  { name: "Rose", bg: "#321626", border: "#72264d", text: "#fbcfe8" },
  { name: "Lavender", bg: "#251738", border: "#572d87", text: "#e9d5ff" },
];

type ScratchpadViewMode = "grid" | "list";
type ScratchpadSortMode = "custom" | "pinned" | "newest" | "color";

const VIEW_STORAGE_KEY = "kanso_focus_scratchpad_view_v1";
const SORT_STORAGE_KEY = "kanso_focus_scratchpad_sort_v1";

function loadViewMode(): ScratchpadViewMode {
  if (typeof window === "undefined") return "grid";
  try {
    const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (v === "grid" || v === "list") return v;
  } catch {
    // Ignore
  }
  return "grid";
}

function loadSortMode(): ScratchpadSortMode {
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

function getMasonryColCount(): number {
  if (typeof window === "undefined") return 3;
  if (window.innerWidth >= 1024) return 3;
  if (window.innerWidth >= 640) return 2;
  return 1;
}

interface FocusScratchpadTabProps {
  scratchpads: ScratchpadCard[];
  isDark: boolean;
  timeFormat: "12h" | "24h";
  onAddScratchpad: (paletteIndex?: number) => void;
  onUpdateScratchpad: (id: string, patch: Partial<ScratchpadCard>) => void;
  onDeleteScratchpad: (id: string) => void;
  onReorderScratchpads: (sortOrderById: Record<string, number>) => void;
  onPromoteToTimeline: (id: string) => void;
  onPromoteToXActive: (id: string) => void;
}

export const FocusScratchpadTab: React.FC<FocusScratchpadTabProps> = ({
  scratchpads,
  isDark,
  timeFormat,
  onAddScratchpad,
  onUpdateScratchpad,
  onDeleteScratchpad,
  onReorderScratchpads,
  onPromoteToTimeline,
  onPromoteToXActive,
}) => {
  const palette = isDark ? SCRATCHPAD_DARK : SCRATCHPAD_LIGHT;

  const [viewMode, setViewMode] = useState<ScratchpadViewMode>(() =>
    loadViewMode(),
  );
  const [sortMode, setSortMode] = useState<ScratchpadSortMode>(() =>
    loadSortMode(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [colorFilter, setColorFilter] = useState<number | null>(null);
  const [masonryColCount, setMasonryColCount] = useState<number>(() =>
    getMasonryColCount(),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setMasonryColCount(getMasonryColCount());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
    const list = [...scratchpads];
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
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
    }
    if (sortMode === "newest") {
      return list.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    }
    if (sortMode === "color") {
      return list.sort((a, b) => {
        const ac = a.paletteIndex % palette.length;
        const bc = b.paletteIndex % palette.length;
        if (ac !== bc) return ac - bc;
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
    }
    // Default: pinned first, then newest
    return list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [scratchpads, sortMode, palette.length]);

  const visibleCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sortedAll.filter((card) => {
      if (pinnedOnly && !card.pinned) return false;
      if (
        colorFilter !== null &&
        card.paletteIndex % palette.length !== colorFilter
      ) {
        return false;
      }
      if (q && !card.content.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [sortedAll, searchQuery, pinnedOnly, colorFilter, palette.length]);

  const masonryColumns = useMemo(() => {
    const count = Math.max(1, masonryColCount);
    const cols: ScratchpadCard[][] = Array.from({ length: count }, () => []);
    visibleCards.forEach((card, idx) => {
      cols[idx % count].push(card);
    });
    return cols;
  }, [visibleCards, masonryColCount]);

  // Drag-and-drop reordering state
  const activeDragIdRef = useRef<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
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

  const handleReorderCards = useCallback(
    (draggedId: string, targetId: string, position: "before" | "after") => {
      if (!draggedId || !targetId || draggedId === targetId) return;
      const ids = sortedAll.map((c) => c.id);
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
      onReorderScratchpads(sortOrderById);
    },
    [sortedAll, sortMode, onReorderScratchpads],
  );

  const resolveTouchDrop = useCallback(
    (
      clientX: number,
      clientY: number,
      activeId: string,
    ): { id: string; position: "before" | "after" } | null => {
      for (const card of visibleCards) {
        if (card.id === activeId) continue;
        const el = cardRefs.current.get(card.id);
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
          return { id: card.id, position: pos };
        }
      }
      return null;
    },
    [visibleCards, viewMode],
  );

  const hasFilters =
    searchQuery.trim().length > 0 || pinnedOnly || colorFilter !== null;

  return (
    <div className="space-y-4">
      {/* Toolbar: Search + Filters + View/Sort + New Sticky */}
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
              placeholder="Search stickies..."
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

          {/* Controls: Sort, View Toggle, New Sticky */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sort selector */}
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
                  setSortMode(e.target.value as ScratchpadSortMode)
                }
                className="bg-transparent outline-none text-xs font-medium cursor-pointer"
                style={{ color: "var(--text-primary)" }}
                aria-label="Sort sticky cards"
              >
                <option value="pinned">Pinned First</option>
                <option value="newest">Newest</option>
                <option value="color">By Color</option>
                <option value="custom">Custom Order</option>
              </select>
            </label>

            {/* Grid / List View Toggle */}
            <div
              className="h-9 inline-flex items-center rounded-xl border p-0.5 shrink-0"
              style={{
                backgroundColor: "var(--bg-surface-subtle)",
                borderColor: "var(--border-subtle)",
              }}
              role="group"
              aria-label="Scratchpad layout"
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

            {/* + New Sticky */}
            <button
              type="button"
              onClick={() =>
                onAddScratchpad(
                  colorFilter !== null ? colorFilter : scratchpads.length % 5,
                )
              }
              className="h-9 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              <Plus className="w-4 h-4" />
              <span>New Sticky</span>
            </button>
          </div>
        </div>

        {/* Color & Pinned Filter Strip */}
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
            {visibleCards.length} of {scratchpads.length} · drag handle to reorder
          </span>
        </div>
      </div>

      {/* Empty state */}
      {visibleCards.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed py-12 px-4 text-center space-y-2"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <StickyNote className="w-7 h-7 mx-auto opacity-50" />
          <p className="text-sm font-medium">
            {hasFilters ? "No matching sticky notes" : "Scratchpad is clear"}
          </p>
          <p className="text-xs">
            {hasFilters
              ? "Try clearing your search or color filters."
              : "Jot down quick ideas, snippets, or promote notes straight into X-Active or Timeline."}
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setPinnedOnly(false);
                setColorFilter(null);
              }}
              className="mt-1 h-8 px-3 rounded-lg border text-xs font-medium cursor-pointer"
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
        /* MASONRY GRID VIEW (Google Keep style) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 items-start">
          {masonryColumns.map((colCards, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-3.5 min-w-0">
              {colCards.map((card) => {
                const pal = palette[card.paletteIndex % palette.length];
                const isBeingDragged = draggingId === card.id;
                const isDrop = dropTarget?.id === card.id;
                return (
                  <div
                    key={card.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(card.id, el);
                      else cardRefs.current.delete(card.id);
                    }}
                    draggable={sortedAll.length > 1}
                    onDragStart={(e) => {
                      if (
                        e.target instanceof HTMLElement &&
                        e.target.closest("textarea, input, button")
                      ) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData(
                        "application/x-kanso-scratchpad-id",
                        card.id,
                      );
                      e.dataTransfer.effectAllowed = "move";
                      activeDragIdRef.current = card.id;
                      setDraggingId(card.id);
                    }}
                    onDragEnd={clearDrag}
                    onDragOver={(e) => {
                      if (
                        !e.dataTransfer.types.includes(
                          "application/x-kanso-scratchpad-id",
                        )
                      ) {
                        return;
                      }
                      if (activeDragIdRef.current === card.id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      const rect = e.currentTarget.getBoundingClientRect();
                      const position: "before" | "after" =
                        e.clientX < rect.left + rect.width / 2
                          ? "before"
                          : "after";
                      setDropTarget((prev) =>
                        prev?.id === card.id && prev.position === position
                          ? prev
                          : { id: card.id, position },
                      );
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDropTarget((prev) =>
                          prev?.id === card.id ? null : prev,
                        );
                      }
                    }}
                    onDrop={(e) => {
                      if (
                        !e.dataTransfer.types.includes(
                          "application/x-kanso-scratchpad-id",
                        )
                      ) {
                        return;
                      }
                      const draggedId =
                        e.dataTransfer.getData(
                          "application/x-kanso-scratchpad-id",
                        ) || activeDragIdRef.current;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const position: "before" | "after" =
                        e.clientX < rect.left + rect.width / 2
                          ? "before"
                          : "after";
                      clearDrag();
                      if (!draggedId || draggedId === card.id) return;
                      e.preventDefault();
                      handleReorderCards(draggedId, card.id, position);
                    }}
                    className={`rounded-2xl border p-3.5 flex flex-col gap-3 transition-all ${
                      isBeingDragged ? "opacity-45 scale-[0.98]" : ""
                    }`}
                    style={{
                      backgroundColor: pal.bg,
                      borderColor: pal.border,
                      color: pal.text,
                      boxShadow: isDrop
                        ? dropTarget.position === "before"
                          ? "inset 3px 0 0 var(--accent)"
                          : "inset -3px 0 0 var(--accent)"
                        : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* Drag Handle + 5 Swatches */}
                      <div className="flex items-center gap-1.5">
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label="Drag to reorder sticky"
                          title="Drag to reorder"
                          onPointerDown={(e) => {
                            if (
                              e.pointerType === "mouse" ||
                              sortedAll.length <= 1
                            ) {
                              return;
                            }
                            e.stopPropagation();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            activeDragIdRef.current = card.id;
                            setDraggingId(card.id);
                            setDropTarget(null);
                          }}
                          onPointerMove={(e) => {
                            if (
                              e.pointerType === "mouse" ||
                              draggingId !== card.id
                            ) {
                              return;
                            }
                            setDropTarget(
                              resolveTouchDrop(e.clientX, e.clientY, card.id),
                            );
                          }}
                          onPointerUp={(e) => {
                            if (e.pointerType === "mouse") return;
                            e.stopPropagation();
                            if (draggingId === card.id) {
                              const resolved =
                                resolveTouchDrop(
                                  e.clientX,
                                  e.clientY,
                                  card.id,
                                ) ?? dropTarget;
                              clearDrag();
                              if (resolved && resolved.id !== card.id) {
                                handleReorderCards(
                                  card.id,
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

                        {palette.map((sw, idx) => (
                          <button
                            key={sw.name}
                            type="button"
                            onClick={() =>
                              onUpdateScratchpad(card.id, { paletteIndex: idx })
                            }
                            className="w-3.5 h-3.5 rounded-full border transition-transform cursor-pointer"
                            style={{
                              backgroundColor: sw.border,
                              borderColor:
                                card.paletteIndex % palette.length === idx
                                  ? pal.text
                                  : "transparent",
                              transform:
                                card.paletteIndex % palette.length === idx
                                  ? "scale(1.18)"
                                  : "scale(1)",
                            }}
                            aria-label={`${sw.name} color`}
                          />
                        ))}
                      </div>

                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateScratchpad(card.id, {
                              pinned: !card.pinned,
                            })
                          }
                          className="h-7 w-7 flex items-center justify-center rounded-md transition-opacity cursor-pointer"
                          style={{ opacity: card.pinned ? 1 : 0.5 }}
                          title={card.pinned ? "Unpin" : "Pin to Today & top"}
                          aria-label={
                            card.pinned ? "Unpin sticky" : "Pin sticky"
                          }
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteScratchpad(card.id)}
                          className="h-7 w-7 flex items-center justify-center rounded-md opacity-60 hover:opacity-100 cursor-pointer"
                          title="Delete card"
                          aria-label="Delete sticky"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <AutoGrowTextarea
                      minRows={2}
                      value={card.content}
                      onChange={(e) =>
                        onUpdateScratchpad(card.id, { content: e.target.value })
                      }
                      placeholder="Write a quick note..."
                      className="text-sm leading-relaxed placeholder:opacity-50"
                      style={{ color: pal.text }}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-black/10 dark:border-white/10">
                      <span className="text-[10px] font-mono tabular-nums opacity-65">
                        {formatTime(card.updatedAt, timeFormat)}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={!card.content.trim()}
                          onClick={() => onPromoteToXActive(card.id)}
                          className="h-7 px-2 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-opacity disabled:opacity-35 bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 whitespace-nowrap cursor-pointer"
                          title="Promote sticky to X-Active task"
                        >
                          <Target className="w-3 h-3" />
                          <span>X-Active</span>
                        </button>
                        <button
                          type="button"
                          disabled={!card.content.trim()}
                          onClick={() => onPromoteToTimeline(card.id)}
                          className="h-7 px-2 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-opacity disabled:opacity-35 bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 whitespace-nowrap cursor-pointer"
                          title="Promote sticky to Timeline Note"
                        >
                          <Send className="w-3 h-3" />
                          <span>Timeline</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        /* COMPACT LIST VIEW */
        <div
          className="rounded-2xl border divide-y overflow-hidden"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          {visibleCards.map((card) => {
            const pal = palette[card.paletteIndex % palette.length];
            const isBeingDragged = draggingId === card.id;
            const isDrop = dropTarget?.id === card.id;
            return (
              <div
                key={card.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(card.id, el);
                  else cardRefs.current.delete(card.id);
                }}
                draggable={sortedAll.length > 1}
                onDragStart={(e) => {
                  if (
                    e.target instanceof HTMLElement &&
                    e.target.closest("textarea, input, button")
                  ) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.setData(
                    "application/x-kanso-scratchpad-id",
                    card.id,
                  );
                  e.dataTransfer.effectAllowed = "move";
                  activeDragIdRef.current = card.id;
                  setDraggingId(card.id);
                }}
                onDragEnd={clearDrag}
                onDragOver={(e) => {
                  if (
                    !e.dataTransfer.types.includes(
                      "application/x-kanso-scratchpad-id",
                    )
                  ) {
                    return;
                  }
                  if (activeDragIdRef.current === card.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: "before" | "after" =
                    e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  setDropTarget((prev) =>
                    prev?.id === card.id && prev.position === position
                      ? prev
                      : { id: card.id, position },
                  );
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDropTarget((prev) =>
                      prev?.id === card.id ? null : prev,
                    );
                  }
                }}
                onDrop={(e) => {
                  if (
                    !e.dataTransfer.types.includes(
                      "application/x-kanso-scratchpad-id",
                    )
                  ) {
                    return;
                  }
                  const draggedId =
                    e.dataTransfer.getData("application/x-kanso-scratchpad-id") ||
                    activeDragIdRef.current;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: "before" | "after" =
                    e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  clearDrag();
                  if (!draggedId || draggedId === card.id) return;
                  e.preventDefault();
                  handleReorderCards(draggedId, card.id, position);
                }}
                className={`group flex items-start gap-2.5 px-3 py-2.5 transition-colors ${
                  isBeingDragged ? "opacity-45" : ""
                }`}
                style={{
                  backgroundColor: pal.bg,
                  color: pal.text,
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
                  aria-label="Drag to reorder sticky"
                  title="Drag to reorder"
                  onPointerDown={(e) => {
                    if (e.pointerType === "mouse" || sortedAll.length <= 1) {
                      return;
                    }
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    activeDragIdRef.current = card.id;
                    setDraggingId(card.id);
                    setDropTarget(null);
                  }}
                  onPointerMove={(e) => {
                    if (e.pointerType === "mouse" || draggingId !== card.id) {
                      return;
                    }
                    setDropTarget(
                      resolveTouchDrop(e.clientX, e.clientY, card.id),
                    );
                  }}
                  onPointerUp={(e) => {
                    if (e.pointerType === "mouse") return;
                    e.stopPropagation();
                    if (draggingId === card.id) {
                      const resolved =
                        resolveTouchDrop(e.clientX, e.clientY, card.id) ??
                        dropTarget;
                      clearDrag();
                      if (resolved && resolved.id !== card.id) {
                        handleReorderCards(
                          card.id,
                          resolved.id,
                          resolved.position,
                        );
                      }
                    } else {
                      clearDrag();
                    }
                  }}
                  onPointerCancel={clearDrag}
                  className="touch-none select-none mt-1 w-5 h-5 flex items-center justify-center rounded opacity-60 hover:opacity-100 cursor-grab active:cursor-grabbing shrink-0"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <AutoGrowTextarea
                    minRows={1}
                    value={card.content}
                    onChange={(e) =>
                      onUpdateScratchpad(card.id, { content: e.target.value })
                    }
                    placeholder="Write a quick note..."
                    className="text-sm leading-snug placeholder:opacity-50"
                    style={{ color: pal.text }}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {palette.map((sw, idx) => (
                        <button
                          key={sw.name}
                          type="button"
                          onClick={() =>
                            onUpdateScratchpad(card.id, { paletteIndex: idx })
                          }
                          className="w-3 h-3 rounded-full border cursor-pointer"
                          style={{
                            backgroundColor: sw.border,
                            borderColor:
                              card.paletteIndex % palette.length === idx
                                ? pal.text
                                : "transparent",
                          }}
                          aria-label={`${sw.name} color`}
                        />
                      ))}
                      <span className="text-[10px] font-mono tabular-nums opacity-65 ml-1">
                        {formatTime(card.updatedAt, timeFormat)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!card.content.trim()}
                        onClick={() => onPromoteToXActive(card.id)}
                        className="h-6 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-35 bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 cursor-pointer"
                      >
                        <Target className="w-3 h-3" />
                        <span>X-Active</span>
                      </button>
                      <button
                        type="button"
                        disabled={!card.content.trim()}
                        onClick={() => onPromoteToTimeline(card.id)}
                        className="h-6 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-35 bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 cursor-pointer"
                      >
                        <Send className="w-3 h-3" />
                        <span>Timeline</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateScratchpad(card.id, { pinned: !card.pinned })
                        }
                        className="h-6 w-6 flex items-center justify-center rounded-md cursor-pointer"
                        style={{ opacity: card.pinned ? 1 : 0.5 }}
                        title={card.pinned ? "Unpin" : "Pin"}
                      >
                        <Pin className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteScratchpad(card.id)}
                        className="h-6 w-6 flex items-center justify-center rounded-md opacity-60 hover:opacity-100 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
