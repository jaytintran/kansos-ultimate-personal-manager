import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  Inbox,
  LayoutGrid,
  List as ListIcon,
  MoreVertical,
  PanelRight,
  PauseCircle,
  Pencil,
  Plus,
  Rows3,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  LIST_ICON_KEYS,
  ListIcon as CollectionIcon,
} from "../components/IconLibrary";
import { NlpInputBar } from "../components/NlpInputBar";
import { RichContent } from "../components/RichContent";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  ContextMenuRecord,
  DetailSheetTarget,
  ListCollection,
  ListCollectionType,
  ListItem,
  ListItemStatus,
} from "../types";
import {
  formatCompactDayHeading,
  getEntryDayKey,
  toLocalDateKey,
} from "../utils/date";

type ListsSubTab = "items" | "notes" | "events";
type ContextPaneTab = "notes" | "events";
type ListsViewMode = "stacked" | "grid" | "compact";
type ListsGroupBy = "tag" | "status" | "none";

const PREFS_KEY = "kanso_lists_prefs_v1";

const LIST_COLORS = [
  "#4f46e5",
  "#b45309",
  "#059669",
  "#0284c7",
  "#e11d48",
  "#9333ea",
  "#d97706",
];

const STATUS_META: Record<
  ListItemStatus,
  {
    label: string;
    chipLabel: string;
    color: string;
    icon: React.ComponentType<{
      className?: string;
      style?: React.CSSProperties;
    }>;
  }
> = {
  inbox: {
    label: "Inbox",
    chipLabel: "Inbox",
    color: "var(--text-secondary)",
    icon: Inbox,
  },
  processing: {
    label: "In Progress",
    chipLabel: "Active",
    color: "var(--accent)",
    icon: Clock,
  },
  done: {
    label: "Completed",
    chipLabel: "Done",
    color: "var(--success)",
    icon: CheckCircle2,
  },
  "maybe-later": {
    label: "Maybe Later",
    chipLabel: "Later",
    color: "var(--text-muted)",
    icon: PauseCircle,
  },
  dropped: {
    label: "Dropped",
    chipLabel: "Dropped",
    color: "var(--danger)",
    icon: XCircle,
  },
};

const STATUS_ORDER: ListItemStatus[] = [
  "inbox",
  "processing",
  "done",
  "maybe-later",
  "dropped",
];

interface ListsViewProps {
  onOpenDetail: (target: DetailSheetTarget) => void;
  onOpenContextMenu: (record: ContextMenuRecord, e: React.MouseEvent) => void;
}

export const ListsView: React.FC<ListsViewProps> = ({
  onOpenDetail,
  onOpenContextMenu,
}) => {
  const {
    workspace,
    addList,
    updateList,
    deleteList,
    addListItem,
    updateListItem,
  } = useWorkspace();

  const activeLists = useMemo(() => workspace.lists, [workspace.lists]);

  const [selectedListId, setSelectedListId] = useState<string>(
    () => activeLists[0]?.id || "",
  );
  const [subTab, setSubTab] = useState<ListsSubTab>("items");
  const [contextTab, setContextTab] = useState<ContextPaneTab>("notes");
  const [statusFilter, setStatusFilter] = useState<ListItemStatus | "all">(
    "all",
  );
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [statusPickerItemId, setStatusPickerItemId] = useState<string | null>(
    null,
  );
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Persisted view/grouping/split preferences
  const [prefs, setPrefs] = useState<{
    viewMode: ListsViewMode;
    groupBy: ListsGroupBy;
    thenBy: ListsGroupBy;
    splitOpen: boolean;
  }>(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        return {
          viewMode: "stacked",
          groupBy: "status",
          thenBy: "none",
          splitOpen: true,
          ...JSON.parse(raw),
        };
      }
    } catch {
      // Ignore
    }
    return {
      viewMode: "stacked",
      groupBy: "status",
      thenBy: "none",
      splitOpen: true,
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore
    }
  }, [prefs]);

  useEffect(() => {
    if (!activeLists.some((l) => l.id === selectedListId)) {
      setSelectedListId(activeLists[0]?.id || "");
    }
  }, [activeLists, selectedListId]);

  const splitVisible = isDesktop && prefs.splitOpen;

  // Keep Tracked Items focused in the left pane whenever desktop split pane is active
  useEffect(() => {
    if (splitVisible && subTab !== "items") {
      setContextTab(subTab);
      setSubTab("items");
    }
  }, [splitVisible, subTab]);

  // Create / Edit List modal state
  const [listModal, setListModal] = useState<{
    mode: "create" | "edit";
    list?: ListCollection;
    title: string;
    icon: string;
    color: string;
    listType: ListCollectionType;
  } | null>(null);

  const currentList = activeLists.find((l) => l.id === selectedListId) || null;

  const listItemCountsByCollection = useMemo(() => {
    const map = new Map<string, number>();
    workspace.listItems.forEach((item) => {
      map.set(item.listId, (map.get(item.listId) || 0) + 1);
    });
    return map;
  }, [workspace.listItems]);

  const listItemsAll = useMemo(
    () => workspace.listItems.filter((i) => i.listId === selectedListId),
    [workspace.listItems, selectedListId],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<ListItemStatus, number> = {
      inbox: 0,
      processing: 0,
      done: 0,
      dropped: 0,
      "maybe-later": 0,
    };
    listItemsAll.forEach((item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
    });
    return counts;
  }, [listItemsAll]);

  const listUniqueTags = useMemo(() => {
    const set = new Set<string>();
    listItemsAll.forEach((item) =>
      (item.tags || []).forEach((t) => set.add(t)),
    );
    return Array.from(set).sort();
  }, [listItemsAll]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listItemsAll.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (tagFilter !== "all" && !(item.tags || []).includes(tagFilter))
        return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        (item.subtitle || "").toLowerCase().includes(q) ||
        (item.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [listItemsAll, statusFilter, tagFilter, search]);

  // Linked Notes & Events for current list
  const linkedNotes = useMemo(
    () =>
      workspace.entries.filter(
        (e) => e.type === "note" && (e.listIds || []).includes(selectedListId),
      ),
    [workspace.entries, selectedListId],
  );

  const linkedEvents = useMemo(
    () =>
      workspace.entries.filter(
        (e) => e.type === "event" && (e.listIds || []).includes(selectedListId),
      ),
    [workspace.entries, selectedListId],
  );

  // Two-level grouping helper
  const groupItems = (
    items: ListItem[],
    by: ListsGroupBy,
  ): { key: string; label: string; items: ListItem[] }[] => {
    if (by === "none") {
      return [{ key: "all", label: "", items }];
    }
    if (by === "status") {
      return STATUS_ORDER.map((st) => ({
        key: st,
        label: STATUS_META[st].label,
        items: items.filter((i) => i.status === st),
      })).filter((g) => g.items.length > 0);
    }
    // by === 'tag'
    const map = new Map<string, ListItem[]>();
    for (const item of items) {
      const primary =
        item.tags && item.tags.length > 0 ? `#${item.tags[0]}` : "Untagged";
      const arr = map.get(primary) || [];
      arr.push(item);
      map.set(primary, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) =>
        a === "Untagged" ? 1 : b === "Untagged" ? -1 : a.localeCompare(b),
      )
      .map(([label, arr]) => ({ key: label, label, items: arr }));
  };

  const groupedTree = useMemo(() => {
    const primary = groupItems(filteredItems, prefs.groupBy);
    const effectiveThenBy: ListsGroupBy =
      prefs.thenBy !== "none" && prefs.thenBy !== prefs.groupBy
        ? prefs.thenBy
        : "none";
    return primary.map((g) => ({
      ...g,
      subGroups: groupItems(g.items, effectiveThenBy),
      hasSubGroups: effectiveThenBy !== "none",
    }));
  }, [filteredItems, prefs.groupBy, prefs.thenBy]);

  const handleSaveListModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!listModal || !listModal.title.trim()) return;
    if (listModal.mode === "create") {
      const created = addList(
        listModal.title.trim(),
        listModal.icon,
        listModal.color,
        listModal.listType,
      );
      setSelectedListId(created.id);
    } else if (listModal.list) {
      updateList(listModal.list.id, {
        title: listModal.title.trim(),
        icon: listModal.icon,
        color: listModal.color,
        listType: listModal.listType,
      });
    }
    setListModal(null);
  };

  const openCreateListModal = () =>
    setListModal({
      mode: "create",
      title: "",
      icon: "ListChecks",
      color: LIST_COLORS[activeLists.length % LIST_COLORS.length],
      listType: "custom",
    });

  const handleSelectContextTab = (tab: ContextPaneTab) => {
    if (splitVisible) {
      setContextTab(tab);
    } else {
      setSubTab(tab);
    }
  };

  const renderStatusButton = (item: ListItem) => {
    const meta = STATUS_META[item.status] || STATUS_META.inbox;
    const StatusIcon = meta.icon;
    const pickerOpen = statusPickerItemId === item.id;

    return (
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setStatusPickerItemId(pickerOpen ? null : item.id);
          }}
          className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)]"
          style={{ color: meta.color }}
          title={`Status: ${meta.label} (click to change)`}
          aria-label={`Change status (${meta.label})`}
        >
          <StatusIcon className="w-4 h-4" />
        </button>

        {pickerOpen && (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={(e) => {
                e.stopPropagation();
                setStatusPickerItemId(null);
              }}
            />
            <div
              className="absolute left-0 top-7 z-30 w-40 rounded-xl border p-1 space-y-0.5"
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-strong)",
                boxShadow: "var(--shadow-popover)",
              }}
            >
              {STATUS_ORDER.map((st) => {
                const sm = STATUS_META[st];
                const Icon = sm.icon;
                const active = item.status === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      updateListItem(item.id, { status: st });
                      setStatusPickerItemId(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)]"
                    style={{
                      backgroundColor: active
                        ? "var(--accent-soft)"
                        : "transparent",
                      color: active ? "var(--accent)" : "var(--text-primary)",
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: sm.color }} />
                    <span>{sm.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderItemRow = (item: ListItem) => {
    const isGrid = prefs.viewMode === "grid";
    const isCompact = prefs.viewMode === "compact";
    const hasDue = Boolean(item.scheduledAt);
    const itemTags = item.tags || [];

    if (isGrid) {
      return (
        <div
          key={item.id}
          onClick={() => onOpenDetail({ mode: "list_item", id: item.id })}
          onContextMenu={(e) => {
            e.preventDefault();
            onOpenContextMenu({ kind: "list_item", item }, e);
          }}
          className="relative rounded-xl border p-3 cursor-pointer transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-subtle)]/50 flex flex-col justify-between gap-2.5"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-start gap-2">
            {renderStatusButton(item)}
            <div className="flex-1 min-w-0 space-y-0.5 pt-0.5">
              <div
                className={`text-sm font-medium leading-snug ${
                  item.status === "done" ? "line-through opacity-60" : ""
                }`}
                style={{ color: "var(--text-primary)" }}
              >
                {item.title}
              </div>
              {item.subtitle && (
                <div
                  className="text-xs line-clamp-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  {item.subtitle}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenContextMenu({ kind: "list_item", item }, e);
              }}
              className="h-6 w-6 flex items-center justify-center rounded-md shrink-0 transition-colors hover:bg-[var(--bg-surface-hover)]"
              style={{ color: "var(--text-muted)" }}
              aria-label="Item actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>

          {(hasDue || itemTags.length > 0) && (
            <div
              className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pl-8 text-[11px] font-mono tabular-nums"
              style={{ color: "var(--text-muted)" }}
            >
              {hasDue && (
                <span>
                  Due{" "}
                  {formatCompactDayHeading(toLocalDateKey(item.scheduledAt!))}
                </span>
              )}
              {itemTags.length > 0 && (
                <span>{itemTags.map((t) => `#${t}`).join(" ")}</span>
              )}
            </div>
          )}
        </div>
      );
    }

    // Quiet borderless row on canvas with hairline dividers (stacked & compact)
    return (
      <div
        key={item.id}
        onClick={() => onOpenDetail({ mode: "list_item", id: item.id })}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenContextMenu({ kind: "list_item", item }, e);
        }}
        className={`relative flex items-start sm:items-center gap-2.5 px-2 -mx-2 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]/75 ${
          isCompact ? "py-1.5" : "py-2.5"
        }`}
      >
        {/* Always-visible Status Icon Button */}
        <div className={isCompact ? "" : "pt-0.5 sm:pt-0"}>
          {renderStatusButton(item)}
        </div>

        {/* Title + optional subtitle */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2 min-w-0">
            <span
              className={`text-sm font-medium leading-snug truncate ${
                item.status === "done" ? "line-through opacity-60" : ""
              }`}
              style={{ color: "var(--text-primary)" }}
            >
              {item.title}
            </span>
            {!isCompact && item.subtitle && (
              <span
                className="text-xs truncate"
                style={{ color: "var(--text-muted)" }}
              >
                {item.subtitle}
              </span>
            )}
          </div>

          {/* Mobile metadata inline row */}
          {(hasDue || itemTags.length > 0) && (
            <div
              className="flex sm:hidden flex-wrap items-center gap-x-2 mt-0.5 text-[11px] font-mono tabular-nums"
              style={{ color: "var(--text-muted)" }}
            >
              {hasDue && (
                <span>
                  Due{" "}
                  {formatCompactDayHeading(toLocalDateKey(item.scheduledAt!))}
                </span>
              )}
              {itemTags.length > 0 && (
                <span>{itemTags.map((t) => `#${t}`).join(" ")}</span>
              )}
            </div>
          )}
        </div>

        {/* Always-visible Desktop Metadata: tags + due date */}
        {(hasDue || itemTags.length > 0) && (
          <div
            className="hidden sm:flex items-center gap-3 shrink-0 text-[11px] font-mono tabular-nums"
            style={{ color: "var(--text-muted)" }}
          >
            {itemTags.length > 0 && (
              <span className="max-w-[180px] truncate">
                {itemTags.map((t) => `#${t}`).join(" ")}
              </span>
            )}
            {hasDue && (
              <span className="whitespace-nowrap">
                Due {formatCompactDayHeading(toLocalDateKey(item.scheduledAt!))}
              </span>
            )}
          </div>
        )}

        {/* Always-visible Context Menu Trigger */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenContextMenu({ kind: "list_item", item }, e);
          }}
          className="h-7 w-7 flex items-center justify-center rounded-md shrink-0 transition-colors hover:bg-[var(--bg-surface-hover)]"
          style={{ color: "var(--text-muted)" }}
          aria-label="Item actions"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  const renderLinkedNotesContent = (compactPane: boolean) => {
    if (!currentList) return null;
    if (linkedNotes.length === 0) {
      return (
        <div
          className="rounded-xl border border-dashed py-10 px-4 text-center text-xs space-y-2"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <FileText className="w-5 h-5 mx-auto opacity-50" />
          <p>No notes linked to {currentList.title} yet.</p>
        </div>
      );
    }
    return (
      <div
        className={
          compactPane ? "space-y-2.5" : "grid grid-cols-1 sm:grid-cols-2 gap-3"
        }
      >
        {linkedNotes.map((note) => (
          <article
            key={note.id}
            onClick={() => onOpenDetail({ mode: "note", id: note.id })}
            onContextMenu={(e) => {
              e.preventDefault();
              onOpenContextMenu({ kind: "entry", entry: note }, e);
            }}
            className="rounded-xl border p-3.5 space-y-1.5 cursor-pointer transition-colors hover:border-[var(--border-strong)]"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: "var(--color-entity-violet)" }}
                />
                <h3 className="font-display text-sm font-semibold truncate">
                  {note.title || "Untitled Note"}
                </h3>
              </div>
              <span
                className="text-[11px] font-mono tabular-nums shrink-0"
                style={{ color: "var(--text-muted)" }}
              >
                {formatCompactDayHeading(
                  toLocalDateKey(note.updatedAt || note.createdAt),
                )}
              </span>
            </div>
            {note.content && (
              <RichContent
                html={note.content}
                className="kanso-timeline-preview kanso-timeline-preview-faded line-clamp-3 text-xs"
              />
            )}
          </article>
        ))}
      </div>
    );
  };

  const renderLinkedEventsContent = () => {
    if (!currentList) return null;
    if (linkedEvents.length === 0) {
      return (
        <div
          className="rounded-xl border border-dashed py-10 px-4 text-center text-xs space-y-2"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <Calendar className="w-5 h-5 mx-auto opacity-50" />
          <p>No events linked to {currentList.title} yet.</p>
        </div>
      );
    }
    return (
      <div
        className="divide-y border-y"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        {linkedEvents.map((ev) => (
          <div
            key={ev.id}
            onClick={() => onOpenDetail({ mode: "event", id: ev.id })}
            onContextMenu={(e) => {
              e.preventDefault();
              onOpenContextMenu({ kind: "entry", entry: ev }, e);
            }}
            className="py-2.5 px-2 -mx-2 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]/75"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Calendar
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--color-entity-blue)" }}
              />
              <span className="text-sm font-medium truncate">{ev.title}</span>
            </div>
            <span
              className="text-[11px] font-mono tabular-nums shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              {formatCompactDayHeading(getEntryDayKey(ev))}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="h-[calc(100dvh-7.25rem)] lg:h-dvh flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--bg-canvas)" }}
    >
      {/* ================= PINNED TOP CHROME ================= */}
      <div className="shrink-0">
        {/* Row 1: Unified Compact View Header */}
        <header
          className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 pb-3 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {currentList ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `${currentList.color || "#4f46e5"}1c`,
                    color: currentList.color || "#4f46e5",
                  }}
                >
                  <CollectionIcon
                    name={currentList.icon}
                    className="w-3.5 h-3.5"
                  />
                </span>
                <div className="flex items-baseline gap-2.5 min-w-0">
                  <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight truncate">
                    {currentList.title}
                  </h1>
                  <span
                    className="text-xs font-mono tabular-nums shrink-0 hidden sm:inline"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {listItemsAll.length} items
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setListModal({
                      mode: "edit",
                      list: currentList,
                      title: currentList.title,
                      icon: currentList.icon,
                      color: currentList.color || LIST_COLORS[0],
                      listType: currentList.listType || "custom",
                    })
                  }
                  className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)]"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                  title="Edit list"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteList(currentList.id)}
                  className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)]"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--danger)",
                  }}
                  title="Delete list"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPrefs((p) => ({ ...p, splitOpen: !p.splitOpen }))
                  }
                  className="hidden lg:inline-flex h-8 px-2.5 rounded-lg border text-xs font-medium items-center gap-1.5 transition-colors"
                  style={{
                    backgroundColor: prefs.splitOpen
                      ? "var(--accent-soft)"
                      : "var(--bg-surface)",
                    borderColor: prefs.splitOpen
                      ? "var(--accent)"
                      : "var(--border-subtle)",
                    color: prefs.splitOpen
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                  }}
                  title={
                    prefs.splitOpen
                      ? "Hide linked context pane"
                      : "Show linked context pane"
                  }
                  aria-pressed={prefs.splitOpen}
                >
                  <PanelRight className="w-3.5 h-3.5" />
                  <span>Linked</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between w-full">
              <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight">
                Lists
              </h1>
              <button
                type="button"
                onClick={openCreateListModal}
                className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New List</span>
              </button>
            </div>
          )}
        </header>

        {/* Row 2: Horizontal Scrolling Collection Strip (Desktop & Mobile) */}
        <nav
          aria-label="List collections"
          className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b px-4 sm:px-6"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {activeLists.map((list) => {
            const active = list.id === selectedListId;
            const count = listItemCountsByCollection.get(list.id) || 0;
            const accentHex = list.color || "#4f46e5";
            return (
              <button
                key={list.id}
                type="button"
                onClick={() => {
                  setSelectedListId(list.id);
                  setStatusFilter("all");
                  setTagFilter("all");
                }}
                className="relative h-10 px-3 inline-flex items-center gap-2 text-xs font-medium shrink-0 border-b-2 transition-colors whitespace-nowrap"
                style={{
                  borderColor: active ? accentHex : "transparent",
                  color: active
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                  backgroundColor: active ? `${accentHex}10` : "transparent",
                }}
              >
                <CollectionIcon
                  name={list.icon}
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: accentHex }}
                />
                <span className={active ? "font-semibold" : ""}>
                  {list.title}
                </span>
                <span
                  className="font-mono tabular-nums text-[11px] opacity-70"
                  style={{ color: active ? accentHex : "var(--text-muted)" }}
                >
                  {count}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={openCreateListModal}
            className="h-8 px-2.5 ml-1 my-1 rounded-lg text-xs font-medium inline-flex items-center gap-1 shrink-0 transition-colors hover:bg-[var(--bg-surface-subtle)]"
            style={{ color: "var(--text-muted)" }}
            title="Create new list collection"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </nav>

        {/* Row 3: Merged Status Counts & Sub-Tabs Bar */}
        {currentList && (
          <div
            className="flex items-center justify-between gap-3 px-4 sm:px-6 py-1.5 border-b overflow-x-auto no-scrollbar"
            // style={{
            //   borderColor: 'var(--border-subtle)',
            //   backgroundColor: 'var(--bg-surface-subtle)',
            // }}
          >
            {/* Left: Status Counts */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  setSubTab("items");
                }}
                className="h-7 px-2 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                style={{
                  backgroundColor:
                    subTab === "items" && statusFilter === "all"
                      ? "var(--bg-surface)"
                      : "transparent",
                  color:
                    subTab === "items" && statusFilter === "all"
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                }}
              >
                <span>All</span>
                <span className="font-mono tabular-nums text-[11px] opacity-75">
                  {listItemsAll.length}
                </span>
              </button>

              {STATUS_ORDER.map((st) => {
                const sm = STATUS_META[st];
                const active = subTab === "items" && statusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setSubTab("items");
                      setStatusFilter((prev) => (prev === st ? "all" : st));
                    }}
                    className="h-7 px-2 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface)]/60"
                    style={{
                      backgroundColor: active
                        ? "var(--accent-soft)"
                        : "transparent",
                      color: active ? "var(--accent)" : "var(--text-secondary)",
                    }}
                  >
                    <span>{sm.chipLabel}</span>
                    <span className="font-mono tabular-nums text-[11px] opacity-75">
                      {statusCounts[st]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right: Linked Notes & Events Triggers */}
            <div
              className="flex items-center gap-1 shrink-0 pl-2 border-l"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <button
                type="button"
                onClick={() => handleSelectContextTab("notes")}
                className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface)]/60"
                style={{
                  backgroundColor:
                    (splitVisible && contextTab === "notes") ||
                    (!splitVisible && subTab === "notes")
                      ? "var(--accent-soft)"
                      : "transparent",
                  color:
                    (splitVisible && contextTab === "notes") ||
                    (!splitVisible && subTab === "notes")
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                }}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Notes</span>
                <span className="font-mono tabular-nums text-[11px] opacity-75">
                  {linkedNotes.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectContextTab("events")}
                className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface)]/60"
                style={{
                  backgroundColor:
                    (splitVisible && contextTab === "events") ||
                    (!splitVisible && subTab === "events")
                      ? "var(--accent-soft)"
                      : "transparent",
                  color:
                    (splitVisible && contextTab === "events") ||
                    (!splitVisible && subTab === "events")
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                }}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Events</span>
                <span className="font-mono tabular-nums text-[11px] opacity-75">
                  {linkedEvents.length}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================= FULL-HEIGHT SPLIT BODY ================= */}
      {!currentList ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div
            className="max-w-sm w-full rounded-2xl border border-dashed py-14 px-6 text-center space-y-3"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            <Circle className="w-7 h-7 mx-auto opacity-50" />
            <p
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Create your first list collection
            </p>
            <p className="text-xs">
              Organize reading lists, projects, courses, or custom queues with
              instant #tag grouping.
            </p>
            <button
              type="button"
              onClick={openCreateListModal}
              className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New List</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* LEFT PRIMARY PANE (Independently Scrolling) */}
          <section className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
            {/* TRACKED ITEMS */}
            {(splitVisible || subTab === "items") && (
              <>
                {/* Inline Quick-Add Bar Directly at Top of Tracked Items */}
                <NlpInputBar
                  placeholder={`Add to ${currentList.title} (use #tag for instant tagging)...`}
                  onSubmit={(raw) =>
                    Boolean(
                      addListItem(
                        currentList.id,
                        raw,
                        statusFilter === "all" ? "inbox" : statusFilter,
                      ),
                    )
                  }
                  availableTags={listUniqueTags}
                  submitLabel="Add"
                  compact
                  previewPosition="bottom"
                  showTimeblockTip={false}
                />

                {/* Compact 32px Filter, ViewMode & 2-Level Grouping Row */}
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border flex-1 min-w-[160px]"
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
                      placeholder="Filter items..."
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

                  {/* View Mode: Stacked / Grid / Compact */}
                  <div
                    className="inline-flex items-center h-8 p-0.5 rounded-lg border"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    {(
                      [
                        { id: "stacked", icon: ListIcon, label: "Quiet rows" },
                        { id: "grid", icon: LayoutGrid, label: "Grid" },
                        { id: "compact", icon: Rows3, label: "Compact rows" },
                      ] as {
                        id: ListsViewMode;
                        icon: React.ComponentType<{ className?: string }>;
                        label: string;
                      }[]
                    ).map((vm) => {
                      const Icon = vm.icon;
                      const active = prefs.viewMode === vm.id;
                      return (
                        <button
                          key={vm.id}
                          type="button"
                          onClick={() =>
                            setPrefs((p) => ({ ...p, viewMode: vm.id }))
                          }
                          title={vm.label}
                          className="h-6.5 w-7 flex items-center justify-center rounded-md"
                          style={{
                            backgroundColor: active
                              ? "var(--accent-soft)"
                              : "transparent",
                            color: active
                              ? "var(--accent)"
                              : "var(--text-muted)",
                          }}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </button>
                      );
                    })}
                  </div>

                  {/* Group By & Then By */}
                  <select
                    value={prefs.groupBy}
                    onChange={(e) =>
                      setPrefs((p) => ({
                        ...p,
                        groupBy: e.target.value as ListsGroupBy,
                      }))
                    }
                    aria-label="Group by"
                    className="h-8 px-2.5 rounded-lg border text-xs outline-none"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <option value="status">Group: Status</option>
                    <option value="tag">Group: Tag</option>
                    <option value="none">Group: None</option>
                  </select>

                  {prefs.groupBy !== "none" && (
                    <select
                      value={prefs.thenBy}
                      onChange={(e) =>
                        setPrefs((p) => ({
                          ...p,
                          thenBy: e.target.value as ListsGroupBy,
                        }))
                      }
                      aria-label="Then by"
                      className="h-8 px-2.5 rounded-lg border text-xs outline-none"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <option value="none">Then: None</option>
                      {prefs.groupBy !== "tag" && (
                        <option value="tag">Then: Tag</option>
                      )}
                      {prefs.groupBy !== "status" && (
                        <option value="status">Then: Status</option>
                      )}
                    </select>
                  )}
                </div>

                {/* Conditional Tag Filter Band (shown when >= 2 unique tags) */}
                {listUniqueTags.length >= 2 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setTagFilter("all")}
                      className="h-6 px-2 rounded-md text-xs font-mono transition-colors"
                      style={{
                        backgroundColor:
                          tagFilter === "all"
                            ? "var(--accent-soft)"
                            : "transparent",
                        color:
                          tagFilter === "all"
                            ? "var(--accent)"
                            : "var(--text-muted)",
                      }}
                    >
                      All tags
                    </button>
                    {listUniqueTags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setTagFilter((prev) => (prev === t ? "all" : t))
                        }
                        className="h-6 px-2 rounded-md text-xs font-mono transition-colors hover:bg-[var(--bg-surface-subtle)]"
                        style={{
                          backgroundColor:
                            tagFilter === t
                              ? "var(--accent-soft)"
                              : "transparent",
                          color:
                            tagFilter === t
                              ? "var(--accent)"
                              : "var(--text-muted)",
                        }}
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}

                {/* Grouped Items Render */}
                {filteredItems.length === 0 ? (
                  <div
                    className="rounded-xl border border-dashed py-12 px-4 text-center text-xs"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-muted)",
                    }}
                  >
                    No items match your current filter. Add one using the bar
                    above.
                  </div>
                ) : (
                  <div className="space-y-5 pb-8">
                    {groupedTree.map((group) => {
                      const groupKey = `${currentList.id}:${group.key}`;
                      const collapsed = Boolean(collapsedGroups[groupKey]);
                      return (
                        <div key={group.key} className="space-y-1.5">
                          {group.label && (
                            <button
                              type="button"
                              onClick={() =>
                                setCollapsedGroups((prev) => ({
                                  ...prev,
                                  [groupKey]: !prev[groupKey],
                                }))
                              }
                              className="flex items-center gap-1.5 text-xs font-semibold py-0.5"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {collapsed ? (
                                <ChevronRight className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                              <span>{group.label}</span>
                              <span
                                className="font-mono tabular-nums text-[11px]"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {group.items.length}
                              </span>
                            </button>
                          )}

                          {!collapsed &&
                            (group.hasSubGroups ? (
                              <div
                                className="space-y-3 pl-3 border-l"
                                style={{ borderColor: "var(--border-subtle)" }}
                              >
                                {group.subGroups.map((sub) => (
                                  <div key={sub.key} className="space-y-1">
                                    <div
                                      className="text-[11px] font-mono font-medium pt-0.5"
                                      style={{ color: "var(--text-muted)" }}
                                    >
                                      {sub.label} ({sub.items.length})
                                    </div>
                                    <div
                                      className={
                                        prefs.viewMode === "grid"
                                          ? "grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                                          : "divide-y border-y"
                                      }
                                      style={
                                        prefs.viewMode === "grid"
                                          ? undefined
                                          : {
                                              borderColor:
                                                "var(--border-subtle)",
                                            }
                                      }
                                    >
                                      {sub.items.map(renderItemRow)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div
                                className={
                                  prefs.viewMode === "grid"
                                    ? "grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                                    : "divide-y border-y"
                                }
                                style={
                                  prefs.viewMode === "grid"
                                    ? undefined
                                    : { borderColor: "var(--border-subtle)" }
                                }
                              >
                                {group.items.map(renderItemRow)}
                              </div>
                            ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* MOBILE / COLLAPSED-SPLIT LINKED NOTES */}
            {!splitVisible && subTab === "notes" && (
              <div className="space-y-3 pb-8">
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Linked Notes ({linkedNotes.length})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenDetail({
                        mode: "note",
                        draft: {
                          type: "note",
                          title: "",
                          listIds: [currentList.id],
                        },
                      })
                    }
                    className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "var(--accent-fg)",
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Note</span>
                  </button>
                </div>
                {renderLinkedNotesContent(false)}
              </div>
            )}

            {/* MOBILE / COLLAPSED-SPLIT LINKED EVENTS */}
            {!splitVisible && subTab === "events" && (
              <div className="space-y-3 pb-8">
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Linked Events ({linkedEvents.length})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenDetail({
                        mode: "event",
                        draft: {
                          type: "event",
                          title: "",
                          listIds: [currentList.id],
                        },
                      })
                    }
                    className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "var(--accent-fg)",
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Event</span>
                  </button>
                </div>
                {renderLinkedEventsContent()}
              </div>
            )}
          </section>

          {/* RIGHT LINKED CONTEXT SPLIT PANE (Desktop lg+ Independently Scrolling) */}
          {splitVisible && (
            <aside
              aria-label="Linked notes and events"
              className="hidden lg:flex lg:flex-col w-80 xl:w-96 shrink-0 border-l overflow-hidden"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-canvas)",
              }}
            >
              {/* Sticky Pane Header */}
              <div
                className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 border-b"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div
                  className="inline-flex items-center p-0.5 rounded-lg border"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setContextTab("notes")}
                    className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                    style={{
                      backgroundColor:
                        contextTab === "notes"
                          ? "var(--accent-soft)"
                          : "transparent",
                      color:
                        contextTab === "notes"
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                    }}
                  >
                    <span>Notes</span>
                    <span className="font-mono tabular-nums text-[11px] opacity-75">
                      {linkedNotes.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setContextTab("events")}
                    className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                    style={{
                      backgroundColor:
                        contextTab === "events"
                          ? "var(--accent-soft)"
                          : "transparent",
                      color:
                        contextTab === "events"
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                    }}
                  >
                    <span>Events</span>
                    <span className="font-mono tabular-nums text-[11px] opacity-75">
                      {linkedEvents.length}
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    contextTab === "notes"
                      ? onOpenDetail({
                          mode: "note",
                          draft: {
                            type: "note",
                            title: "",
                            listIds: [currentList.id],
                          },
                        })
                      : onOpenDetail({
                          mode: "event",
                          draft: {
                            type: "event",
                            title: "",
                            listIds: [currentList.id],
                          },
                        })
                  }
                  className="h-7 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 shrink-0"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{contextTab === "notes" ? "Note" : "Event"}</span>
                </button>
              </div>

              {/* Independently Scrolling Linked Content */}
              <div className="flex-1 overflow-y-auto px-4 py-3.5">
                {contextTab === "notes"
                  ? renderLinkedNotesContent(true)
                  : renderLinkedEventsContent()}
              </div>
            </aside>
          )}
        </div>
      )}

      {/* Create / Edit List Modal */}
      {listModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setListModal(null)}
          />
          <form
            onSubmit={handleSaveListModal}
            className="relative z-10 w-full max-w-md rounded-2xl border p-5 space-y-4"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold">
                {listModal.mode === "create"
                  ? "New List Collection"
                  : "Edit List Collection"}
              </h3>
              <button
                type="button"
                onClick={() => setListModal(null)}
                className="h-7 w-7 flex items-center justify-center rounded-md"
                style={{ color: "var(--text-muted)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Name
              </label>
              <input
                type="text"
                value={listModal.title}
                onChange={(e) =>
                  setListModal({ ...listModal, title: e.target.value })
                }
                placeholder="e.g. Books to Read, Ship Roadmap..."
                autoFocus
                className="w-full h-9 px-3 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                List Type (tailors item fields)
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(
                  [
                    "projects",
                    "books",
                    "courses",
                    "custom",
                  ] as ListCollectionType[]
                ).map((lt) => (
                  <button
                    key={lt}
                    type="button"
                    onClick={() => setListModal({ ...listModal, listType: lt })}
                    className="h-8 rounded-lg border text-xs capitalize font-medium"
                    style={{
                      backgroundColor:
                        listModal.listType === lt
                          ? "var(--accent-soft)"
                          : "var(--bg-surface)",
                      borderColor:
                        listModal.listType === lt
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                      color:
                        listModal.listType === lt
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                    }}
                  >
                    {lt}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Accent Color
              </label>
              <div className="flex items-center gap-2">
                {LIST_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setListModal({ ...listModal, color: hex })}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: hex }}
                  >
                    {listModal.color === hex && (
                      <Check className="w-3.5 h-3.5 text-white" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Icon
              </label>
              <div className="flex flex-wrap gap-1.5">
                {LIST_ICON_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setListModal({ ...listModal, icon: key })}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border"
                    style={{
                      backgroundColor:
                        listModal.icon === key
                          ? `${listModal.color}20`
                          : "var(--bg-surface)",
                      borderColor:
                        listModal.icon === key
                          ? listModal.color
                          : "var(--border-subtle)",
                      color:
                        listModal.icon === key
                          ? listModal.color
                          : "var(--text-secondary)",
                    }}
                  >
                    <CollectionIcon name={key} className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setListModal(null)}
                className="h-8 px-3 rounded-lg border text-xs font-medium"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!listModal.title.trim()}
                className="h-8 px-3.5 rounded-lg text-xs font-semibold disabled:opacity-40"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                {listModal.mode === "create" ? "Create List" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
