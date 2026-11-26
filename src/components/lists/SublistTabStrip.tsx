import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  FolderTree,
  Plus,
  Search,
  X,
} from "lucide-react";
import { ListIcon as CollectionIcon } from "../IconLibrary";
import type { ListCollection } from "../../types";

export type SublistFilterValue = "all" | "direct" | string;

interface SublistTabStripProps {
  parentList: ListCollection;
  sublists: ListCollection[];
  activeFilter: SublistFilterValue;
  allCount: number;
  directCount: number;
  sublistCounts: Map<string, number>;
  onSelectFilter: (next: SublistFilterValue) => void;
  onFocusSublist: (sublistId: string) => void;
  onCreateSublist: () => void;
  onDropItemOnList: (itemId: string, targetListId: string) => void;
  activeDragItemIdRef: React.MutableRefObject<string | null>;
  onClearAllDragStates: () => void;
}

const OVERFLOW_THRESHOLD = 10;
const VISIBLE_BEFORE_OVERFLOW = 6;

export const SublistTabStrip: React.FC<SublistTabStripProps> = ({
  parentList,
  sublists,
  activeFilter,
  allCount,
  directCount,
  sublistCounts,
  onSelectFilter,
  onFocusSublist,
  onCreateSublist,
  onDropItemOnList,
  activeDragItemIdRef,
  onClearAllDragStates,
}) => {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowQuery, setOverflowQuery] = useState("");
  const [dropHoverTarget, setDropHoverTarget] = useState<string | null>(null);
  const dropdownContainerRef = useRef<HTMLDivElement | null>(null);
  const overflowInputRef = useRef<HTMLInputElement | null>(null);

  const hasOverflow = sublists.length > OVERFLOW_THRESHOLD;
  const inlineSublists = useMemo(
    () =>
      hasOverflow ? sublists.slice(0, VISIBLE_BEFORE_OVERFLOW) : sublists,
    [hasOverflow, sublists],
  );
  const overflowSublists = useMemo(
    () => (hasOverflow ? sublists.slice(VISIBLE_BEFORE_OVERFLOW) : []),
    [hasOverflow, sublists],
  );

  const activeOverflowSublist = useMemo(
    () => overflowSublists.find((s) => s.id === activeFilter) || null,
    [overflowSublists, activeFilter],
  );

  const activeChildSublist = useMemo(
    () => sublists.find((s) => s.id === activeFilter) || null,
    [sublists, activeFilter],
  );

  const filteredOverflowSublists = useMemo(() => {
    const q = overflowQuery.trim().toLowerCase();
    if (!q) return overflowSublists;
    return overflowSublists.filter((s) => s.title.toLowerCase().includes(q));
  }, [overflowSublists, overflowQuery]);

  useEffect(() => {
    if (!overflowOpen) {
      setOverflowQuery("");
      return;
    }
    const timer = window.setTimeout(() => {
      overflowInputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [overflowOpen]);

  useEffect(() => {
    if (!overflowOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(e.target as Node)
      ) {
        setOverflowOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOverflowOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [overflowOpen]);

  const makeDropHandlers = (targetListId: string, dropKey: string) => ({
    onDragOver: (e: React.DragEvent<HTMLButtonElement>) => {
      if (
        !e.dataTransfer.types.includes("application/x-kanso-list-item-id")
      ) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropHoverTarget(dropKey);
    },
    onDragLeave: (e: React.DragEvent<HTMLButtonElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setDropHoverTarget((prev) => (prev === dropKey ? null : prev));
      }
    },
    onDrop: (e: React.DragEvent<HTMLButtonElement>) => {
      if (
        !e.dataTransfer.types.includes("application/x-kanso-list-item-id")
      ) {
        return;
      }
      const itemId =
        e.dataTransfer.getData("application/x-kanso-list-item-id") ||
        activeDragItemIdRef.current;
      setDropHoverTarget(null);
      onClearAllDragStates();
      if (!itemId) return;
      e.preventDefault();
      onDropItemOnList(itemId, targetListId);
    },
  });

  if (sublists.length === 0) return null;

  const showDirectTab = directCount > 0 || activeFilter === "direct";

  return (
    <div
      className="flex items-center justify-between gap-2 px-4 sm:px-6 py-1.5 border-b shrink-0"
      style={{
        backgroundColor: "var(--bg-canvas)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-1 min-w-0 flex-1 flex-wrap">
        <span
          className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium pr-1 shrink-0"
          style={{ color: "var(--text-muted)" }}
        >
          <FolderTree className="w-3 h-3 opacity-80" />
        </span>

        {/* All Tab */}
        <button
          type="button"
          onClick={() => onSelectFilter("all")}
          className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors hover:bg-[var(--bg-surface)]/70 cursor-pointer"
          style={{
            backgroundColor:
              activeFilter === "all" ? "var(--accent-soft)" : "transparent",
            color:
              activeFilter === "all"
                ? "var(--accent)"
                : "var(--text-secondary)",
          }}
        >
          <span>All</span>
          <span className="font-mono tabular-nums text-[11px] opacity-75">
            {allCount}
          </span>
        </button>

        {/* Direct (Uncategorized items living directly in parentList) */}
        {showDirectTab && (
          <button
            type="button"
            onClick={() =>
              onSelectFilter(activeFilter === "direct" ? "all" : "direct")
            }
            title={`Items directly in ${parentList.title} (not in a sublist) · Drop item here to move to parent`}
            {...makeDropHandlers(parentList.id, "direct")}
            className={`h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors hover:bg-[var(--bg-surface)]/70 cursor-pointer ${
              dropHoverTarget === "direct" ? "ring-1 ring-[var(--accent)]" : ""
            }`}
            style={{
              backgroundColor:
                dropHoverTarget === "direct" || activeFilter === "direct"
                  ? "var(--accent-soft)"
                  : "transparent",
              color:
                dropHoverTarget === "direct" || activeFilter === "direct"
                  ? "var(--accent)"
                  : "var(--text-secondary)",
            }}
          >
            <span>Direct</span>
            <span className="font-mono tabular-nums text-[11px] opacity-75">
              {directCount}
            </span>
          </button>
        )}

        {/* Inline Sublist Tabs (All if <= 10, or 1..6 if > 10) */}
        {inlineSublists.map((sub) => {
          const active = activeFilter === sub.id;
          const accent = sub.color || parentList.color || "#4f46e5";
          const count = sublistCounts.get(sub.id) || 0;
          const isDropHover = dropHoverTarget === sub.id;

          return (
            <button
              key={sub.id}
              type="button"
              onClick={() => onSelectFilter(active ? "all" : sub.id)}
              onDoubleClick={() => onFocusSublist(sub.id)}
              title={`${sub.title} · Click to filter, double-click to focus · Drop item here to move`}
              {...makeDropHandlers(sub.id, sub.id)}
              className={`h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 max-w-[165px] whitespace-nowrap shrink-0 transition-colors hover:bg-[var(--bg-surface)]/70 cursor-pointer ${
                isDropHover ? "ring-1 ring-[var(--accent)]" : ""
              }`}
              style={{
                backgroundColor: isDropHover
                  ? "var(--accent-soft)"
                  : active
                    ? `${accent}1a`
                    : "transparent",
                color: isDropHover
                  ? "var(--accent)"
                  : active
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
              }}
            >
              <CollectionIcon
                name={sub.icon}
                className="w-3 h-3 shrink-0"
                style={{ color: accent }}
              />
              <span className="truncate">{sub.title}</span>
              <span
                className="font-mono tabular-nums text-[11px] opacity-75 shrink-0"
                style={{ color: active ? accent : "var(--text-muted)" }}
              >
                {count}
              </span>
            </button>
          );
        })}

        {/* Overflow Dropdown Selector (Tab #7 onward when total sublists > 10) */}
        {hasOverflow && overflowSublists.length > 0 && (
          <div ref={dropdownContainerRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setOverflowOpen((prev) => !prev)}
              aria-expanded={overflowOpen}
              aria-label={`More sublists (${overflowSublists.length})`}
              className="h-7 px-2.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 max-w-[185px] whitespace-nowrap shrink-0 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                backgroundColor: activeOverflowSublist
                  ? `${activeOverflowSublist.color || parentList.color || "#4f46e5"}1a`
                  : overflowOpen
                    ? "var(--bg-surface-subtle)"
                    : "var(--bg-surface)",
                borderColor: activeOverflowSublist
                  ? activeOverflowSublist.color || parentList.color || "var(--accent)"
                  : "var(--border-subtle)",
                color: activeOverflowSublist
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              }}
            >
              {activeOverflowSublist ? (
                <>
                  <CollectionIcon
                    name={activeOverflowSublist.icon}
                    className="w-3 h-3 shrink-0"
                    style={{
                      color:
                        activeOverflowSublist.color ||
                        parentList.color ||
                        "#4f46e5",
                    }}
                  />
                  <span className="truncate">{activeOverflowSublist.title}</span>
                  <span className="font-mono tabular-nums text-[11px] opacity-75 shrink-0">
                    {sublistCounts.get(activeOverflowSublist.id) || 0}
                  </span>
                </>
              ) : (
                <span>+{overflowSublists.length} more</span>
              )}
              <ChevronDown className="w-3 h-3 opacity-75 shrink-0" />
            </button>

            {overflowOpen && (
              <div
                className="absolute left-0 top-9 z-40 w-64 max-w-[calc(100vw-2rem)] rounded-xl border overflow-hidden flex flex-col max-h-[320px]"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: "var(--border-strong)",
                  boxShadow: "var(--shadow-popover)",
                }}
              >
                {overflowSublists.length >= 5 && (
                  <div
                    className="p-2 border-b flex items-center gap-1.5"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <Search
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    />
                    <input
                      ref={overflowInputRef}
                      type="text"
                      value={overflowQuery}
                      onChange={(e) => setOverflowQuery(e.target.value)}
                      placeholder="Filter sublists..."
                      className="flex-1 min-w-0 bg-transparent text-xs outline-none"
                      style={{ color: "var(--text-primary)" }}
                    />
                    {overflowQuery && (
                      <button
                        type="button"
                        onClick={() => setOverflowQuery("")}
                        className="opacity-70 hover:opacity-100 cursor-pointer"
                        aria-label="Clear filter"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                <div className="overflow-y-auto p-1 space-y-0.5">
                  {filteredOverflowSublists.length === 0 ? (
                    <p
                      className="py-4 text-center text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      No matching sublists
                    </p>
                  ) : (
                    filteredOverflowSublists.map((sub) => {
                      const active = activeFilter === sub.id;
                      const accent =
                        sub.color || parentList.color || "#4f46e5";
                      const count = sublistCounts.get(sub.id) || 0;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            onSelectFilter(active ? "all" : sub.id);
                            setOverflowOpen(false);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 text-xs font-medium text-left hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                          style={{
                            backgroundColor: active
                              ? "var(--accent-soft)"
                              : "transparent",
                            color: active
                              ? "var(--accent)"
                              : "var(--text-primary)",
                          }}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <CollectionIcon
                              name={sub.icon}
                              className="w-3.5 h-3.5 shrink-0"
                              style={{ color: accent }}
                            />
                            <span className="truncate">{sub.title}</span>
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span
                              className="font-mono tabular-nums text-[11px]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {count}
                            </span>
                            {active && (
                              <Check
                                className="w-3 h-3"
                                style={{ color: "var(--accent)" }}
                              />
                            )}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Create Sublist Button */}
        <button
          type="button"
          onClick={onCreateSublist}
          title={`Add sublist inside ${parentList.title}`}
          aria-label={`Add sublist inside ${parentList.title}`}
          className="h-7 px-2 rounded-md text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          style={{ color: "var(--text-muted)" }}
        >
          <Plus className="w-3 h-3" />
          <span className="hidden md:inline">Sublist</span>
        </button>
      </div>

      {/* Focus Sublist Action when viewing a specific child sublist tab */}
      {activeChildSublist && (
        <button
          type="button"
          onClick={() => onFocusSublist(activeChildSublist.id)}
          title={`Open "${activeChildSublist.title}" directly`}
          className="h-7 px-2 rounded-md border text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-secondary)",
          }}
        >
          <span>Open</span>
          <ArrowUpRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
