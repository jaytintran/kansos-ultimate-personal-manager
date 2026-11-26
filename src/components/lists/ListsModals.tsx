import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  FileText,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type {
  Entry,
  ListCollection,
  ListItemStatus,
} from "../../types";
import { formatCompactDayHeading, getEntryDayKey, toLocalDateKey } from "../../utils/date";

export type ListsViewMode = "stacked" | "grid" | "compact" | "board";
export type ListsGroupBy = "tag" | "status" | "sublist" | "none";
export type ListsSortMode = "custom" | "newest" | "oldest" | "title";

/* ================= 1. SAFE DELETE LIST MODAL ================= */
interface DeleteListConfirmModalProps {
  list: ListCollection | null;
  itemCount: number;
  descendantCount?: number;
  linkedNotesCount?: number;
  exclusivelyLinkedNotesCount?: number;
  sharedNotesCount?: number;
  otherLists: ListCollection[];
  getOptionLabel?: (list: ListCollection) => string;
  onCancel: () => void;
  onDelete: (
    moveItemsToListId?: string,
    linkedNotesBehavior?: "keep" | "delete",
  ) => void;
}

export const DeleteListConfirmModal: React.FC<DeleteListConfirmModalProps> = ({
  list,
  itemCount,
  descendantCount = 0,
  linkedNotesCount = 0,
  exclusivelyLinkedNotesCount = 0,
  sharedNotesCount = 0,
  otherLists,
  getOptionLabel,
  onCancel,
  onDelete,
}) => {
  const [targetListId, setTargetListId] = useState<string>(
    () => otherLists[0]?.id ?? "",
  );

  React.useEffect(() => {
    setTargetListId(otherLists[0]?.id ?? "");
  }, [list?.id, otherLists]);

  if (!list) return null;

  const hasLinkedNotesToDecide = itemCount > 0 && linkedNotesCount > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Delete ${list.title}`}
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border p-5 space-y-4"
        style={{
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-strong)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                backgroundColor: "rgba(220, 38, 38, 0.12)",
                color: "var(--danger)",
              }}
            >
              <AlertTriangle className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-display text-sm font-bold">
                Delete &ldquo;{list.title}&rdquo;?
              </h3>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {descendantCount > 0
                  ? `Includes ${descendantCount} nested ${
                      descendantCount === 1 ? "sublist" : "sublists"
                    } and ${itemCount} total ${
                      itemCount === 1 ? "item" : "items"
                    }.`
                  : itemCount === 0
                    ? "This list is empty."
                    : `This list contains ${itemCount} ${
                        itemCount === 1 ? "item" : "items"
                      }.`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="h-7 w-7 flex items-center justify-center rounded-md cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {hasLinkedNotesToDecide && (
          <div
            className="rounded-xl border p-3 space-y-1"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <p
              className="text-xs leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {linkedNotesCount === 1
                ? "1 note is linked to items in this list."
                : `${linkedNotesCount} notes are linked to items in this list.`}{" "}
              Move items to preserve them, or choose whether to keep or delete
              linked notes if deleting everything.
            </p>
            {sharedNotesCount > 0 && exclusivelyLinkedNotesCount >= 0 && (
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {sharedNotesCount}{" "}
                {sharedNotesCount === 1 ? "note is" : "notes are"} shared with
                other items or books and will keep those other links.
              </p>
            )}
          </div>
        )}

        {itemCount > 0 && otherLists.length > 0 && (
          <div
            className="rounded-xl border p-3 space-y-2.5"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <p
              className="text-xs font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Move {itemCount} {itemCount === 1 ? "item" : "items"} to another
              list before deleting:
            </p>
            <div className="flex items-center gap-2">
              <select
                value={targetListId}
                onChange={(e) => setTargetListId(e.target.value)}
                className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border text-xs outline-none cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              >
                {otherLists.map((ol) => (
                  <option key={ol.id} value={ol.id}>
                    {getOptionLabel ? getOptionLabel(ol) : ol.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!targetListId}
                onClick={() => onDelete(targetListId, "keep")}
                className="h-8 px-3 rounded-lg text-xs font-semibold shrink-0 disabled:opacity-40 cursor-pointer"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                Move &amp; Delete
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 px-3 rounded-lg border text-xs font-medium cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            Cancel
          </button>
          {hasLinkedNotesToDecide ? (
            <>
              <button
                type="button"
                onClick={() => onDelete(undefined, "keep")}
                className="h-8 px-3 rounded-lg border text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-strong)",
                  color: "var(--text-primary)",
                }}
              >
                Keep Notes &amp; Delete List
              </button>
              <button
                type="button"
                onClick={() => onDelete(undefined, "delete")}
                className="h-8 px-3.5 rounded-lg text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: "var(--danger)",
                  color: "#ffffff",
                }}
              >
                Delete List &amp; Notes
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onDelete(undefined, "keep")}
              className="h-8 px-3.5 rounded-lg text-xs font-semibold cursor-pointer"
              style={{
                backgroundColor: "var(--danger)",
                color: "#ffffff",
              }}
            >
              {itemCount > 0
                ? `Delete List & ${itemCount} ${
                    itemCount === 1 ? "Item" : "Items"
                  }`
                : "Delete List"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ================= 2. ATTACH EXISTING NOTE / EVENT PICKER MODAL ================= */
interface AttachLinkedEntriesModalProps {
  open: boolean;
  kind: "notes" | "events";
  list: ListCollection | null;
  entries: Entry[];
  onToggleEntry: (entry: Entry) => void;
  onClose: () => void;
}

export const AttachLinkedEntriesModal: React.FC<
  AttachLinkedEntriesModalProps
> = ({ open, kind, list, entries, onToggleEntry, onClose }) => {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...entries].sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime(),
    );
    if (!q) return sorted;
    return sorted.filter(
      (e) =>
        (e.title || "").toLowerCase().includes(q) ||
        (e.tags || []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [entries, query]);

  if (!open || !list) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Attach ${kind} to ${list.title}`}
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border overflow-hidden flex flex-col max-h-[75dvh]"
        style={{
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-strong)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <div
          className="px-4 py-3 border-b flex items-center justify-between gap-2"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <h3 className="font-display text-sm font-bold truncate">
            Attach {kind === "notes" ? "Notes" : "Events"} to {list.title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-md cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="px-4 py-2.5 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div
            className="h-8 px-2.5 rounded-lg border flex items-center gap-2"
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${kind}...`}
              autoFocus
              className="flex-1 min-w-0 bg-transparent text-xs outline-none"
              style={{ color: "var(--text-primary)" }}
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <p
              className="py-8 text-center text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              No matching {kind} found.
            </p>
          ) : (
            filtered.map((entry) => {
              const linked = (entry.listIds || []).includes(list.id);
              const dateLabel =
                kind === "notes"
                  ? formatCompactDayHeading(
                      toLocalDateKey(entry.updatedAt || entry.createdAt),
                    )
                  : formatCompactDayHeading(getEntryDayKey(entry));

              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onToggleEntry(entry)}
                  className="w-full px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-left transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{
                    backgroundColor: linked
                      ? "var(--accent-soft)"
                      : "transparent",
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {kind === "notes" ? (
                      <FileText
                        className="w-3.5 h-3.5 shrink-0"
                        style={{
                          color: linked
                            ? "var(--accent)"
                            : "var(--text-muted)",
                        }}
                      />
                    ) : (
                      <Calendar
                        className="w-3.5 h-3.5 shrink-0"
                        style={{
                          color: linked
                            ? "var(--accent)"
                            : "var(--text-muted)",
                        }}
                      />
                    )}
                    <div className="min-w-0">
                      <div
                        className="text-xs font-medium truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {entry.title ||
                          (kind === "notes"
                            ? "Untitled Note"
                            : "Untitled Event")}
                      </div>
                      <div
                        className="text-[11px] font-mono tabular-nums truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {dateLabel}
                        {entry.tags && entry.tags.length > 0
                          ? ` · ${entry.tags.map((t) => `#${t}`).join(" ")}`
                          : ""}
                      </div>
                    </div>
                  </div>

                  <span
                    className="h-5 w-5 rounded-md border flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: linked
                        ? "var(--accent)"
                        : "var(--bg-surface)",
                      borderColor: linked
                        ? "var(--accent)"
                        : "var(--border-strong)",
                      color: "var(--accent-fg)",
                    }}
                  >
                    {linked && <Check className="w-3 h-3" />}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

/* ================= 3. MOBILE SLIDE-UP FILTER & LAYOUT SHEET ================= */
interface MobileListsFilterSheetProps {
  open: boolean;
  onClose: () => void;
  isSmartScope: boolean;
  hasSublists?: boolean;
  viewMode: ListsViewMode;
  groupBy: ListsGroupBy;
  thenBy: ListsGroupBy;
  sortBy: ListsSortMode;
  statusFilter: ListItemStatus | "all";
  tagFilter: string;
  uniqueTags: string[];
  statusOptions: { id: ListItemStatus; label: string; count: number }[];
  onChangeViewMode: (vm: ListsViewMode) => void;
  onChangeGroupBy: (gb: ListsGroupBy) => void;
  onChangeThenBy: (tb: ListsGroupBy) => void;
  onChangeSortBy: (sb: ListsSortMode) => void;
  onChangeStatusFilter: (st: ListItemStatus | "all") => void;
  onChangeTagFilter: (tag: string) => void;
  onResetFilters: () => void;
}

export const MobileListsFilterSheet: React.FC<MobileListsFilterSheetProps> = ({
  open,
  onClose,
  isSmartScope,
  hasSublists = false,
  viewMode,
  groupBy,
  thenBy,
  sortBy,
  statusFilter,
  tagFilter,
  uniqueTags,
  statusOptions,
  onChangeViewMode,
  onChangeGroupBy,
  onChangeThenBy,
  onChangeSortBy,
  onChangeStatusFilter,
  onChangeTagFilter,
  onResetFilters,
}) => {
  if (!open) return null;

  return (
    <div
      className="lg:hidden fixed inset-0 z-50 flex items-end"
      role="dialog"
      aria-modal="true"
      aria-label="Display and filter options"
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full rounded-t-2xl border-t px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] space-y-4 max-h-[82dvh] overflow-y-auto"
        style={{
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-strong)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <div className="flex justify-center">
          <span
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: "var(--border-strong)" }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal
              className="w-4 h-4"
              style={{ color: "var(--accent)" }}
            />
            <h3 className="font-display text-sm font-bold">
              View &amp; Filters
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetFilters}
              className="text-xs font-medium px-2 py-1 rounded-md hover:bg-[var(--bg-surface-hover)]"
              style={{ color: "var(--text-secondary)" }}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-lg text-xs font-semibold"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              Done
            </button>
          </div>
        </div>

        {/* Layout */}
        <div className="space-y-1.5">
          <div
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Layout
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                { id: "stacked", label: "Rows" },
                { id: "grid", label: "Cards" },
                { id: "compact", label: "Compact" },
                { id: "board", label: "Board" },
              ] as { id: ListsViewMode; label: string }[]
            ).map((opt) => {
              const active = viewMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeViewMode(opt.id)}
                  className="h-9 rounded-xl border text-xs font-medium"
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
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status filter (when viewing a specific list) */}
        {!isSmartScope && (
          <div className="space-y-1.5">
            <div
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Status
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onChangeStatusFilter("all")}
                className="h-8 px-2.5 rounded-lg border text-xs font-medium"
                style={{
                  backgroundColor:
                    statusFilter === "all"
                      ? "var(--accent-soft)"
                      : "var(--bg-surface)",
                  borderColor:
                    statusFilter === "all"
                      ? "var(--accent)"
                      : "var(--border-subtle)",
                  color:
                    statusFilter === "all"
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                }}
              >
                All
              </button>
              {statusOptions.map((st) => {
                const active = statusFilter === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() =>
                      onChangeStatusFilter(active ? "all" : st.id)
                    }
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1"
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
                    <span>{st.label}</span>
                    <span className="font-mono text-[11px] opacity-75">
                      {st.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Grouping & Sort */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Group By
            </label>
            <select
              value={groupBy}
              onChange={(e) => onChangeGroupBy(e.target.value as ListsGroupBy)}
              className="w-full h-9 px-2.5 rounded-xl border text-xs outline-none"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            >
              {hasSublists && <option value="sublist">Sublist</option>}
              <option value="status">Status</option>
              <option value="tag">Tag</option>
              <option value="none">None</option>
            </select>
          </div>

          <div className="space-y-1">
            <label
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Then By
            </label>
            <select
              value={groupBy === "none" ? "none" : thenBy}
              disabled={groupBy === "none"}
              onChange={(e) => onChangeThenBy(e.target.value as ListsGroupBy)}
              className="w-full h-9 px-2.5 rounded-xl border text-xs outline-none disabled:opacity-50"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            >
              <option value="none">None</option>
              {hasSublists && groupBy !== "sublist" && (
                <option value="sublist">Sublist</option>
              )}
              {groupBy !== "tag" && <option value="tag">Tag</option>}
              {groupBy !== "status" && <option value="status">Status</option>}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Sort Order
          </label>
          <select
            value={sortBy}
            onChange={(e) => onChangeSortBy(e.target.value as ListsSortMode)}
            className="w-full h-9 px-2.5 rounded-xl border text-xs outline-none"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          >
            <option value="custom">Custom Order (Drag &amp; Drop)</option>
            <option value="newest">Recently Added</option>
            <option value="oldest">Oldest First</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>

        {/* Tags */}
        {uniqueTags.length > 0 && (
          <div className="space-y-1.5">
            <div
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Tag
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onChangeTagFilter("all")}
                className="h-7 px-2.5 rounded-lg border text-xs font-mono"
                style={{
                  backgroundColor:
                    tagFilter === "all"
                      ? "var(--accent-soft)"
                      : "var(--bg-surface)",
                  borderColor:
                    tagFilter === "all"
                      ? "var(--accent)"
                      : "var(--border-subtle)",
                  color:
                    tagFilter === "all"
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                }}
              >
                All tags
              </button>
              {uniqueTags.map((t) => {
                const active = tagFilter === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onChangeTagFilter(active ? "all" : t)}
                    className="h-7 px-2.5 rounded-lg border text-xs font-mono"
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
                    #{t}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
