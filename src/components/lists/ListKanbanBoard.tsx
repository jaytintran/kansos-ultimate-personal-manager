import React, { useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Inbox,
  PauseCircle,
  Plus,
  XCircle,
} from "lucide-react";
import type { ListCollection, ListItem, ListItemStatus } from "../../types";

export interface KanbanColumnDef {
  id: string;
  label: string;
  color: string;
  status?: ListItemStatus;
  listId?: string;
  collapsible?: boolean;
  items: ListItem[];
}

const STATUS_ICON_MAP: Record<
  ListItemStatus,
  React.ComponentType<{ className?: string; style?: React.CSSProperties }>
> = {
  inbox: Inbox,
  processing: Clock,
  done: CheckCircle2,
  "maybe-later": PauseCircle,
  dropped: XCircle,
};

interface ListKanbanBoardProps {
  columns: KanbanColumnDef[];
  droppedCollapsed: boolean;
  onToggleDroppedCollapsed: () => void;
  draggingItemId: string | null;
  itemDropTarget: { itemId: string; position: "before" | "after" } | null;
  onClearDragStates: () => void;
  onDropOnColumn: (itemId: string, col: KanbanColumnDef) => void;
  onDropOnItem: (
    draggedId: string,
    targetItemId: string,
    position: "before" | "after",
  ) => void;
  onInlineAddInColumn: (col: KanbanColumnDef, rawText: string) => void;
  renderCard: (item: ListItem) => React.ReactNode;
}

export const ListKanbanBoard: React.FC<ListKanbanBoardProps> = ({
  columns,
  droppedCollapsed,
  onToggleDroppedCollapsed,
  draggingItemId,
  onClearDragStates,
  onDropOnColumn,
  onInlineAddInColumn,
  renderCard,
}) => {
  const [hoverColId, setHoverColId] = useState<string | null>(null);
  const [addingColId, setAddingColId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");

  const submitAdd = (col: KanbanColumnDef) => {
    const trimmed = draftText.trim();
    if (!trimmed) {
      setAddingColId(null);
      return;
    }
    onInlineAddInColumn(col, trimmed);
    setDraftText("");
    setAddingColId(null);
  };

  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-6 min-h-[420px]">
      {columns.map((col) => {
        const isDroppedCollapsed = Boolean(col.collapsible && droppedCollapsed);
        const isHover = hoverColId === col.id && draggingItemId !== null;
        const StatusIcon = col.status ? STATUS_ICON_MAP[col.status] : null;

        if (isDroppedCollapsed) {
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                if (
                  !e.dataTransfer.types.includes(
                    "application/x-kanso-list-item-id",
                  )
                ) {
                  return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setHoverColId(col.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setHoverColId((prev) => (prev === col.id ? null : prev));
                }
              }}
              onDrop={(e) => {
                if (
                  !e.dataTransfer.types.includes(
                    "application/x-kanso-list-item-id",
                  )
                ) {
                  return;
                }
                const draggedId = e.dataTransfer.getData(
                  "application/x-kanso-list-item-id",
                );
                setHoverColId(null);
                onClearDragStates();
                if (!draggedId) return;
                e.preventDefault();
                onDropOnColumn(draggedId, col);
              }}
              onClick={onToggleDroppedCollapsed}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleDroppedCollapsed();
                }
              }}
              title="Expand Dropped column (or drop an item here)"
              className={`w-12 shrink-0 min-h-[260px] rounded-xl border py-3 px-1.5 flex flex-col items-center justify-between gap-2 cursor-pointer transition-colors ${
                isHover
                  ? "ring-1 ring-[var(--accent)] bg-[var(--accent-soft)]/50"
                  : "hover:bg-[var(--bg-surface-subtle)]"
              }`}
              style={{
                backgroundColor: isHover
                  ? "var(--accent-soft)"
                  : "var(--bg-surface)",
                borderColor: isHover
                  ? "var(--accent)"
                  : "var(--border-subtle)",
              }}
            >
              <ChevronLeft
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--text-muted)" }}
              />
              <div className="flex flex-col items-center gap-2 my-auto">
                {StatusIcon && (
                  <StatusIcon
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: col.color }}
                  />
                )}
                <span
                  className="text-[11px] font-semibold tracking-wide [writing-mode:vertical-rl] rotate-180 select-none"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {col.label}
                </span>
              </div>
              <span
                className="text-[11px] font-mono tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                {col.items.length}
              </span>
            </div>
          );
        }

        return (
          <section
            key={col.id}
            aria-label={`${col.label} column`}
            onDragOver={(e) => {
              if (
                !e.dataTransfer.types.includes(
                  "application/x-kanso-list-item-id",
                )
              ) {
                return;
              }
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setHoverColId(col.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setHoverColId((prev) => (prev === col.id ? null : prev));
              }
            }}
            onDrop={(e) => {
              if (
                !e.dataTransfer.types.includes(
                  "application/x-kanso-list-item-id",
                )
              ) {
                return;
              }
              const draggedId = e.dataTransfer.getData(
                "application/x-kanso-list-item-id",
              );
              setHoverColId(null);
              onClearDragStates();
              if (!draggedId) return;
              e.preventDefault();
              onDropOnColumn(draggedId, col);
            }}
            className={`w-[292px] sm:w-[310px] shrink-0 rounded-2xl border p-2.5 flex flex-col gap-2.5 transition-colors ${
              isHover ? "ring-1 ring-[var(--accent)]" : ""
            }`}
            style={{
              backgroundColor: isHover
                ? "var(--accent-soft)"
                : "var(--bg-surface-subtle)",
              borderColor: isHover ? "var(--accent)" : "var(--border-subtle)",
            }}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                {StatusIcon ? (
                  <StatusIcon
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: col.color }}
                  />
                ) : (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: col.color }}
                  />
                )}
                <h3
                  className="text-xs font-semibold truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {col.label}
                </h3>
                <span
                  className="text-[11px] font-mono tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  {col.items.length}
                </span>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setAddingColId(col.id);
                    setDraftText("");
                  }}
                  title={`Add to ${col.label}`}
                  aria-label={`Add item to ${col.label}`}
                  className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                {col.collapsible && (
                  <button
                    type="button"
                    onClick={onToggleDroppedCollapsed}
                    title="Collapse Dropped column"
                    aria-label="Collapse Dropped column"
                    className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Cards Stack */}
            <div className="space-y-2 min-h-[48px]">
              {col.items.length === 0 ? (
                <div
                  className="rounded-xl border border-dashed py-6 px-3 text-center text-[11px]"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-muted)",
                  }}
                >
                  Drop items here
                </div>
              ) : (
                col.items.map((item) => (
                  <div key={item.id}>{renderCard(item)}</div>
                ))
              )}
            </div>

            {/* Inline Quick-Add at Bottom of Column */}
            {addingColId === col.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitAdd(col);
                }}
                className="rounded-xl border p-2 space-y-2"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--accent)",
                }}
              >
                <input
                  type="text"
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setAddingColId(null);
                      setDraftText("");
                    }
                  }}
                  placeholder={`Add to ${col.label} (#tag, URL, date)...`}
                  autoFocus
                  className="w-full bg-transparent text-xs outline-none placeholder:opacity-55"
                  style={{ color: "var(--text-primary)" }}
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setAddingColId(null);
                      setDraftText("");
                    }}
                    className="h-6 px-2 rounded text-[11px] font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!draftText.trim()}
                    className="h-6 px-2.5 rounded text-[11px] font-semibold disabled:opacity-40 cursor-pointer"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "var(--accent-fg)",
                    }}
                  >
                    Add
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAddingColId(col.id);
                  setDraftText("");
                }}
                className="h-8 px-2 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface)] cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add item</span>
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
};

export function buildKanbanColumnsForList(
  items: ListItem[],
  statusMeta: Record<ListItemStatus, { label: string; color: string }>,
  statusOrder: ListItemStatus[],
): KanbanColumnDef[] {
  return statusOrder.map((st) => ({
    id: `status:${st}`,
    label: statusMeta[st].label,
    color: statusMeta[st].color,
    status: st,
    collapsible: st === "dropped",
    items: items.filter((i) => i.status === st),
  }));
}

export function buildKanbanColumnsForSmartTab(
  items: ListItem[],
  lists: ListCollection[],
): KanbanColumnDef[] {
  return lists.map((l) => ({
    id: `list:${l.id}`,
    label: l.title,
    color: l.color || "#4f46e5",
    listId: l.id,
    items: items.filter((i) => i.listId === l.id),
  }));
}

export function buildKanbanColumnsForSublists(
  items: ListItem[],
  parentList: ListCollection,
  sublists: ListCollection[],
  resolveBranch: (itemListId: string, baseListId: string) => string | "__direct__" | null,
): KanbanColumnDef[] {
  const buckets = new Map<string, ListItem[]>();
  const directItems: ListItem[] = [];

  for (const item of items) {
    const branch = resolveBranch(item.listId, parentList.id);
    if (branch === "__direct__") {
      directItems.push(item);
    } else if (branch) {
      const bucket = buckets.get(branch) || [];
      bucket.push(item);
      buckets.set(branch, bucket);
    }
  }

  const cols: KanbanColumnDef[] = sublists.map((sub) => ({
    id: `sublist:${sub.id}`,
    label: sub.title,
    color: sub.color || parentList.color || "#4f46e5",
    listId: sub.id,
    items: buckets.get(sub.id) || [],
  }));

  if (directItems.length > 0) {
    cols.unshift({
      id: `sublist:__direct__:${parentList.id}`,
      label: `Direct (${parentList.title})`,
      color: parentList.color || "#64748b",
      listId: parentList.id,
      items: directItems,
    });
  }

  return cols;
}
