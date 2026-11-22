import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  GripVertical,
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
type ListsSortMode = "custom" | "newest" | "oldest" | "title";

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
    pushToast,
    addList,
    updateList,
    deleteList,
    reorderLists,
    addListItem,
    updateListItem,
    reorderListItems,
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

  // Persisted view/grouping/sort/split preferences
  const [prefs, setPrefs] = useState<{
    viewMode: ListsViewMode;
    groupBy: ListsGroupBy;
    thenBy: ListsGroupBy;
    sortBy: ListsSortMode;
    splitOpen: boolean;
  }>(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        return {
          viewMode: "stacked",
          groupBy: "status",
          thenBy: "none",
          sortBy: "custom",
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
      sortBy: "custom",
      splitOpen: true,
    };
  });

  // Drag & drop state (items reorder, status change, list tab reorder, item -> list tab move)
  const activeDragItemIdRef = useRef<string | null>(null);
  const activeDragListTabIdRef = useRef<string | null>(null);
  const itemElRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const listTabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const statusDropZoneRefs = useRef<Map<ListItemStatus, HTMLElement>>(
    new Map(),
  );

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [itemDropTarget, setItemDropTarget] = useState<{
    itemId: string;
    position: "before" | "after";
  } | null>(null);
  const [statusGroupDropTarget, setStatusGroupDropTarget] =
    useState<ListItemStatus | null>(null);
  const [listTabItemDropTargetId, setListTabItemDropTargetId] = useState<
    string | null
  >(null);

  const [draggingListTabId, setDraggingListTabId] = useState<string | null>(
    null,
  );
  const [listTabDropTarget, setListTabDropTarget] = useState<{
    listId: string;
    position: "before" | "after";
  } | null>(null);

  const clearAllDragStates = useCallback(() => {
    activeDragItemIdRef.current = null;
    activeDragListTabIdRef.current = null;
    setDraggingItemId(null);
    setItemDropTarget(null);
    setStatusGroupDropTarget(null);
    setListTabItemDropTargetId(null);
    setDraggingListTabId(null);
    setListTabDropTarget(null);
  }, []);

  useEffect(() => {
    window.addEventListener("dragend", clearAllDragStates);
    window.addEventListener("drop", clearAllDragStates);
    return () => {
      window.removeEventListener("dragend", clearAllDragStates);
      window.removeEventListener("drop", clearAllDragStates);
    };
  }, [clearAllDragStates]);

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

  const isCustomSort = prefs.sortBy === "custom";

  const customListItemCompare = useCallback((a: ListItem, b: ListItem) => {
    const aOrder =
      typeof a.sortOrder === "number" && Number.isFinite(a.sortOrder)
        ? a.sortOrder
        : null;
    const bOrder =
      typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder)
        ? b.sortOrder
        : null;
    if (aOrder !== null && bOrder !== null) {
      if (aOrder !== bOrder) return aOrder - bOrder;
    } else if (aOrder === null && bOrder !== null) {
      return -1;
    } else if (aOrder !== null && bOrder === null) {
      return 1;
    }
    return (
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
      a.id.localeCompare(b.id)
    );
  }, []);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listItemsAll
      .filter((item) => {
        if (statusFilter !== "all" && item.status !== statusFilter)
          return false;
        if (tagFilter !== "all" && !(item.tags || []).includes(tagFilter))
          return false;
        if (!q) return true;
        return (
          item.title.toLowerCase().includes(q) ||
          (item.subtitle || "").toLowerCase().includes(q) ||
          (item.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (prefs.sortBy === "custom") return customListItemCompare(a, b);
        if (prefs.sortBy === "oldest") {
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        }
        if (prefs.sortBy === "title") {
          return a.title.localeCompare(b.title);
        }
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
  }, [
    listItemsAll,
    statusFilter,
    tagFilter,
    search,
    prefs.sortBy,
    customListItemCompare,
  ]);

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

  const renderedItemOrder = useMemo(() => {
    const out: ListItem[] = [];
    for (const group of groupedTree) {
      if (group.hasSubGroups) {
        for (const sub of group.subGroups) {
          out.push(...sub.items);
        }
      } else {
        out.push(...group.items);
      }
    }
    return out;
  }, [groupedTree]);

  const emptyStatusesForDrag = useMemo(() => {
    if (
      !draggingItemId ||
      prefs.groupBy !== "status" ||
      statusFilter !== "all"
    ) {
      return [];
    }
    const present = new Set(groupedTree.map((g) => g.key));
    return STATUS_ORDER.filter((st) => !present.has(st));
  }, [draggingItemId, prefs.groupBy, statusFilter, groupedTree]);

  const isSingleColumnForElement = useCallback(
    (el: HTMLElement | null) => {
      if (prefs.viewMode !== "grid") return true;
      const parent = el?.parentElement;
      if (parent) {
        const cols = getComputedStyle(parent)
          .gridTemplateColumns.split(" ")
          .filter(Boolean).length;
        if (cols > 0) return cols === 1;
      }
      return typeof window !== "undefined" ? window.innerWidth < 640 : false;
    },
    [prefs.viewMode],
  );

  const handleMoveItemToList = useCallback(
    (itemId: string, targetListId: string) => {
      const item = workspace.listItems.find((i) => i.id === itemId);
      if (!item || item.listId === targetListId) return;
      const targetList = activeLists.find((l) => l.id === targetListId);
      if (!targetList) return;
      updateListItem(itemId, { listId: targetListId });
      pushToast(`Moved to "${targetList.title}"`, "success");
    },
    [workspace.listItems, activeLists, updateListItem, pushToast],
  );

  const handleChangeItemStatus = useCallback(
    (itemId: string, targetStatus: ListItemStatus) => {
      const item = listItemsAll.find((i) => i.id === itemId);
      if (!item || item.status === targetStatus) return;
      updateListItem(itemId, { status: targetStatus });
      pushToast(`Moved to ${STATUS_META[targetStatus].label}`, "success");
    },
    [listItemsAll, updateListItem, pushToast],
  );

  const handleDropItemOnItem = useCallback(
    (draggedId: string, targetItemId: string, position: "before" | "after") => {
      if (!draggedId || !targetItemId || draggedId === targetItemId) return;
      const draggedItem = listItemsAll.find((i) => i.id === draggedId);
      const targetItem = listItemsAll.find((i) => i.id === targetItemId);
      if (!draggedItem || !targetItem) return;

      const shouldChangeStatus =
        prefs.groupBy === "status" && draggedItem.status !== targetItem.status;

      if (!isCustomSort) {
        if (shouldChangeStatus) {
          handleChangeItemStatus(draggedId, targetItem.status);
        }
        return;
      }

      const visibleIds = renderedItemOrder.map((i) => i.id);
      if (!visibleIds.includes(draggedId) || !visibleIds.includes(targetItemId)) {
        if (shouldChangeStatus) {
          handleChangeItemStatus(draggedId, targetItem.status);
        }
        return;
      }

      const remainingVisible = visibleIds.filter((id) => id !== draggedId);
      const targetIndex = remainingVisible.indexOf(targetItemId);
      if (targetIndex === -1) return;

      const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
      const nextVisibleIds = [
        ...remainingVisible.slice(0, insertIndex),
        draggedId,
        ...remainingVisible.slice(insertIndex),
      ];

      const orderChanged = !nextVisibleIds.every(
        (id, idx) => id === visibleIds[idx],
      );
      if (!orderChanged && !shouldChangeStatus) return;

      const visibleSet = new Set(visibleIds);
      const globalSorted = [...listItemsAll].sort(customListItemCompare);
      const byId = new Map(listItemsAll.map((i) => [i.id, i]));
      let visibleCursor = 0;
      const reorderedGlobal: ListItem[] = [];

      for (const item of globalSorted) {
        if (visibleSet.has(item.id)) {
          const nextId = nextVisibleIds[visibleCursor++];
          const nextItem = nextId ? byId.get(nextId) : undefined;
          if (nextItem) reorderedGlobal.push(nextItem);
        } else {
          reorderedGlobal.push(item);
        }
      }
      while (visibleCursor < nextVisibleIds.length) {
        const nextItem = byId.get(nextVisibleIds[visibleCursor++]);
        if (nextItem) reorderedGlobal.push(nextItem);
      }

      const sortOrderById: Record<string, number> = {};
      reorderedGlobal.forEach((item, idx) => {
        sortOrderById[item.id] = idx;
      });

      reorderListItems(
        sortOrderById,
        shouldChangeStatus
          ? { id: draggedId, status: targetItem.status }
          : undefined,
      );
      if (shouldChangeStatus) {
        pushToast(`Moved to ${STATUS_META[targetItem.status].label}`, "success");
      }
    },
    [
      listItemsAll,
      prefs.groupBy,
      isCustomSort,
      renderedItemOrder,
      customListItemCompare,
      reorderListItems,
      handleChangeItemStatus,
      pushToast,
    ],
  );

  const resolveTouchDrop = useCallback(
    (
      clientX: number,
      clientY: number,
      activeItemId: string,
    ): {
      itemTarget: { itemId: string; position: "before" | "after" } | null;
      statusTarget: ListItemStatus | null;
      listTabTargetId: string | null;
    } => {
      for (const [tabId, el] of listTabRefs.current.entries()) {
        if (tabId === selectedListId) continue;
        const rect = el.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return {
            itemTarget: null,
            statusTarget: null,
            listTabTargetId: tabId,
          };
        }
      }

      for (const item of renderedItemOrder) {
        if (item.id === activeItemId) continue;
        const el = itemElRefs.current.get(item.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          const singleCol = isSingleColumnForElement(el);
          const position: "before" | "after" = singleCol
            ? clientY < rect.top + rect.height / 2
              ? "before"
              : "after"
            : clientX < rect.left + rect.width / 2
              ? "before"
              : "after";
          return {
            itemTarget: { itemId: item.id, position },
            statusTarget: null,
            listTabTargetId: null,
          };
        }
      }

      if (prefs.groupBy === "status") {
        for (const [st, el] of statusDropZoneRefs.current.entries()) {
          const rect = el.getBoundingClientRect();
          if (
            clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom
          ) {
            return {
              itemTarget: null,
              statusTarget: st,
              listTabTargetId: null,
            };
          }
        }
      }

      return { itemTarget: null, statusTarget: null, listTabTargetId: null };
    },
    [
      selectedListId,
      renderedItemOrder,
      isSingleColumnForElement,
      prefs.groupBy,
    ],
  );

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
    const isBeingDragged = draggingItemId === item.id;
    const isDropTarget = itemDropTarget?.itemId === item.id;
    const el = itemElRefs.current.get(item.id) ?? null;
    const singleCol = isSingleColumnForElement(el);

    const dragHandle = isCustomSort && (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Reorder ${item.title}`}
        title="Drag to reorder, change status, or drop onto a list tab"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          activeDragItemIdRef.current = item.id;
          setDraggingItemId(item.id);
          setItemDropTarget(null);
          setStatusGroupDropTarget(null);
          setListTabItemDropTargetId(null);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || draggingItemId !== item.id) return;
          const resolved = resolveTouchDrop(e.clientX, e.clientY, item.id);
          setItemDropTarget(resolved.itemTarget);
          setStatusGroupDropTarget(resolved.statusTarget);
          setListTabItemDropTargetId(resolved.listTabTargetId);
        }}
        onPointerUp={(e) => {
          if (e.pointerType === "mouse") return;
          e.stopPropagation();
          if (draggingItemId === item.id) {
            const resolved = resolveTouchDrop(e.clientX, e.clientY, item.id);
            const tabTarget = resolved.listTabTargetId ?? listTabItemDropTargetId;
            const statusTarget = resolved.statusTarget ?? statusGroupDropTarget;
            const targetItem = resolved.itemTarget ?? itemDropTarget;
            clearAllDragStates();
            if (tabTarget) {
              handleMoveItemToList(item.id, tabTarget);
            } else if (statusTarget) {
              handleChangeItemStatus(item.id, statusTarget);
            } else if (targetItem && targetItem.itemId !== item.id) {
              handleDropItemOnItem(
                item.id,
                targetItem.itemId,
                targetItem.position,
              );
            }
          } else {
            clearAllDragStates();
          }
        }}
        onPointerCancel={clearAllDragStates}
        className={`touch-none select-none flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] active:text-[var(--accent)] cursor-grab active:cursor-grabbing shrink-0 ${
          isGrid
            ? "w-6 h-6 -ml-1"
            : isCompact
              ? "w-6 h-7 -ml-1"
              : "w-7 h-7 -ml-1"
        }`}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>
    );

    const commonDragHandlers = {
      ref: (node: HTMLDivElement | null) => {
        if (node) itemElRefs.current.set(item.id, node);
        else itemElRefs.current.delete(item.id);
      },
      draggable: true,
      onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData("application/x-kanso-list-item-id", item.id);
        e.dataTransfer.effectAllowed = "move";
        activeDragItemIdRef.current = item.id;
        setDraggingItemId(item.id);
      },
      onDragEnd: clearAllDragStates,
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
        if (
          !e.dataTransfer.types.includes("application/x-kanso-list-item-id")
        ) {
          return;
        }
        const draggedId = activeDragItemIdRef.current;
        if (!draggedId || draggedId === item.id) return;
        const draggedItem = listItemsAll.find((i) => i.id === draggedId);
        const crossStatus =
          prefs.groupBy === "status" &&
          draggedItem &&
          draggedItem.status !== item.status;
        if (!isCustomSort && !crossStatus) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setStatusGroupDropTarget(null);
        const rect = e.currentTarget.getBoundingClientRect();
        const isRowSingle = isSingleColumnForElement(e.currentTarget);
        const position: "before" | "after" = isRowSingle
          ? e.clientY < rect.top + rect.height / 2
            ? "before"
            : "after"
          : e.clientX < rect.left + rect.width / 2
            ? "before"
            : "after";
        setItemDropTarget((prev) =>
          prev?.itemId === item.id && prev.position === position
            ? prev
            : { itemId: item.id, position },
        );
      },
      onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setItemDropTarget((prev) =>
            prev?.itemId === item.id ? null : prev,
          );
        }
      },
      onDrop: (e: React.DragEvent<HTMLDivElement>) => {
        if (
          !e.dataTransfer.types.includes("application/x-kanso-list-item-id")
        ) {
          return;
        }
        const draggedId =
          e.dataTransfer.getData("application/x-kanso-list-item-id") ||
          activeDragItemIdRef.current;
        const rect = e.currentTarget.getBoundingClientRect();
        const isRowSingle = isSingleColumnForElement(e.currentTarget);
        const position: "before" | "after" = isRowSingle
          ? e.clientY < rect.top + rect.height / 2
            ? "before"
            : "after"
          : e.clientX < rect.left + rect.width / 2
            ? "before"
            : "after";
        clearAllDragStates();
        if (!draggedId || draggedId === item.id) return;
        e.preventDefault();
        e.stopPropagation();
        handleDropItemOnItem(draggedId, item.id, position);
      },
    };

    if (isGrid) {
      return (
        <div
          key={item.id}
          {...commonDragHandlers}
          onClick={() => {
            if (draggingItemId) return;
            onOpenDetail({ mode: "list_item", id: item.id });
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onOpenContextMenu({ kind: "list_item", item }, e);
          }}
          className={`relative rounded-xl border p-3 cursor-pointer transition-all duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-subtle)]/50 flex flex-col justify-between gap-2.5 ${
            isCustomSort ? "cursor-grab active:cursor-grabbing" : ""
          } ${isBeingDragged ? "opacity-45 scale-[0.98]" : ""} ${
            isDropTarget
              ? "ring-1 ring-[var(--accent)]/60 ring-offset-1 ring-offset-[var(--bg-canvas)]"
              : ""
          }`}
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: isDropTarget
              ? "var(--accent)"
              : "var(--border-subtle)",
          }}
        >
          {isDropTarget && (
            <div
              aria-hidden="true"
              className={
                singleCol
                  ? `pointer-events-none absolute inset-x-2 h-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] z-20 ${
                      itemDropTarget.position === "before"
                        ? "-top-1.5"
                        : "-bottom-1.5"
                    }`
                  : `pointer-events-none absolute top-1 bottom-1 w-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] z-20 ${
                      itemDropTarget.position === "before"
                        ? "-left-1.5"
                        : "-right-1.5"
                    }`
              }
            />
          )}

          <div className="flex items-start gap-2">
            {dragHandle}
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
        {...commonDragHandlers}
        onClick={() => {
          if (draggingItemId) return;
          onOpenDetail({ mode: "list_item", id: item.id });
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenContextMenu({ kind: "list_item", item }, e);
        }}
        style={
          isDropTarget
            ? {
                boxShadow:
                  itemDropTarget.position === "before"
                    ? "inset 0 2.5px 0 var(--accent)"
                    : "inset 0 -2.5px 0 var(--accent)",
              }
            : undefined
        }
        className={`relative flex items-start sm:items-center gap-2 px-2 -mx-2 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]/75 ${
          isCompact ? "py-1.5" : "py-2.5"
        } ${isCustomSort ? "cursor-grab active:cursor-grabbing" : ""} ${
          isBeingDragged ? "opacity-50 bg-[var(--accent-soft)]" : ""
        }`}
      >
        {dragHandle}

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
      className="h-full flex-1 min-h-0 lg:h-dvh flex flex-col overflow-hidden overscroll-none"
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
            const isBeingDragged = draggingListTabId === list.id;
            const isItemDropHover = listTabItemDropTargetId === list.id;
            const isTabDropTarget = listTabDropTarget?.listId === list.id;

            return (
              <button
                key={list.id}
                ref={(el) => {
                  if (el) listTabRefs.current.set(list.id, el);
                  else listTabRefs.current.delete(list.id);
                }}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/x-kanso-list-tab-id",
                    list.id,
                  );
                  e.dataTransfer.effectAllowed = "move";
                  activeDragListTabIdRef.current = list.id;
                  setDraggingListTabId(list.id);
                }}
                onDragEnd={clearAllDragStates}
                onDragOver={(e) => {
                  const types = e.dataTransfer.types;
                  if (types.includes("application/x-kanso-list-item-id")) {
                    if (list.id === selectedListId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setListTabItemDropTargetId(list.id);
                    return;
                  }
                  if (types.includes("application/x-kanso-list-tab-id")) {
                    if (activeDragListTabIdRef.current === list.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const rect = e.currentTarget.getBoundingClientRect();
                    const position: "before" | "after" =
                      e.clientX < rect.left + rect.width / 2
                        ? "before"
                        : "after";
                    setListTabDropTarget((prev) =>
                      prev?.listId === list.id && prev.position === position
                        ? prev
                        : { listId: list.id, position },
                    );
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setListTabItemDropTargetId((prev) =>
                      prev === list.id ? null : prev,
                    );
                    setListTabDropTarget((prev) =>
                      prev?.listId === list.id ? null : prev,
                    );
                  }
                }}
                onDrop={(e) => {
                  const types = e.dataTransfer.types;
                  if (types.includes("application/x-kanso-list-item-id")) {
                    const itemId =
                      e.dataTransfer.getData(
                        "application/x-kanso-list-item-id",
                      ) || activeDragItemIdRef.current;
                    clearAllDragStates();
                    if (!itemId || list.id === selectedListId) return;
                    e.preventDefault();
                    handleMoveItemToList(itemId, list.id);
                    return;
                  }
                  if (types.includes("application/x-kanso-list-tab-id")) {
                    const draggedTabId =
                      e.dataTransfer.getData(
                        "application/x-kanso-list-tab-id",
                      ) || activeDragListTabIdRef.current;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const position: "before" | "after" =
                      e.clientX < rect.left + rect.width / 2
                        ? "before"
                        : "after";
                    clearAllDragStates();
                    if (!draggedTabId || draggedTabId === list.id) return;
                    e.preventDefault();
                    reorderLists(draggedTabId, list.id, position);
                  }
                }}
                onClick={() => {
                  setSelectedListId(list.id);
                  setStatusFilter("all");
                  setTagFilter("all");
                }}
                title="Click to open · Drag to reorder · Drop items here to move"
                className={`relative h-10 px-3 inline-flex items-center gap-2 text-xs font-medium shrink-0 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                  isBeingDragged ? "opacity-45" : ""
                } ${
                  isItemDropHover
                    ? "ring-1 ring-inset ring-[var(--accent)] rounded-t-md"
                    : ""
                }`}
                style={{
                  borderColor: isItemDropHover
                    ? "var(--accent)"
                    : active
                      ? accentHex
                      : "transparent",
                  color:
                    isItemDropHover || active
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  backgroundColor: isItemDropHover
                    ? "var(--accent-soft)"
                    : active
                      ? `${accentHex}10`
                      : "transparent",
                }}
              >
                {isTabDropTarget && (
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent)] z-20 ${
                      listTabDropTarget.position === "before"
                        ? "left-0"
                        : "right-0"
                    }`}
                  />
                )}
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
          <section className="flex-1 min-w-0 overflow-y-auto overscroll-none px-4 sm:px-6 py-4 space-y-4">
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

                  {/* Sort Selector + Custom Order GripVertical Toggle */}
                  <div className="flex items-center gap-1">
                    <select
                      value={prefs.sortBy}
                      onChange={(e) =>
                        setPrefs((p) => ({
                          ...p,
                          sortBy: e.target.value as ListsSortMode,
                        }))
                      }
                      aria-label="Sort items"
                      className="h-8 px-2.5 rounded-lg border text-xs outline-none cursor-pointer"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <option value="custom">Sort: Custom Order</option>
                      <option value="newest">Sort: Recently Added</option>
                      <option value="oldest">Sort: Oldest First</option>
                      <option value="title">Sort: Title A–Z</option>
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        setPrefs((p) => ({
                          ...p,
                          sortBy: p.sortBy === "custom" ? "newest" : "custom",
                        }))
                      }
                      title={
                        isCustomSort
                          ? "Custom order active — drag items to rearrange (click to switch to Recently Added)"
                          : "Enable Custom Order (drag & drop)"
                      }
                      aria-label={
                        isCustomSort
                          ? "Custom drag order active"
                          : "Switch to Custom Order"
                      }
                      aria-pressed={isCustomSort}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg border transition-colors cursor-pointer shrink-0"
                      style={{
                        backgroundColor: isCustomSort
                          ? "var(--accent-soft)"
                          : "var(--bg-surface)",
                        borderColor: isCustomSort
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                        color: isCustomSort
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                      }}
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
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
                      const isStatusGroup = prefs.groupBy === "status";
                      const statusKey = isStatusGroup
                        ? (group.key as ListItemStatus)
                        : null;
                      const isStatusDropHover =
                        isStatusGroup &&
                        statusKey !== null &&
                        statusGroupDropTarget === statusKey;

                      return (
                        <div
                          key={group.key}
                          className={`space-y-1.5 rounded-xl transition-colors ${
                            isStatusDropHover
                              ? "ring-1 ring-[var(--accent)] bg-[var(--accent-soft)]/50 p-1.5 -m-1.5"
                              : ""
                          }`}
                        >
                          {group.label && (
                            <button
                              ref={(el) => {
                                if (!statusKey) return;
                                if (el) statusDropZoneRefs.current.set(statusKey, el);
                                else statusDropZoneRefs.current.delete(statusKey);
                              }}
                              type="button"
                              onDragOver={(e) => {
                                if (!isStatusGroup || !statusKey) return;
                                if (
                                  !e.dataTransfer.types.includes(
                                    "application/x-kanso-list-item-id",
                                  )
                                ) {
                                  return;
                                }
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                setItemDropTarget(null);
                                setStatusGroupDropTarget(statusKey);
                              }}
                              onDragLeave={(e) => {
                                if (
                                  statusKey &&
                                  !e.currentTarget.contains(
                                    e.relatedTarget as Node,
                                  )
                                ) {
                                  setStatusGroupDropTarget((prev) =>
                                    prev === statusKey ? null : prev,
                                  );
                                }
                              }}
                              onDrop={(e) => {
                                if (!isStatusGroup || !statusKey) return;
                                if (
                                  !e.dataTransfer.types.includes(
                                    "application/x-kanso-list-item-id",
                                  )
                                ) {
                                  return;
                                }
                                const itemId =
                                  e.dataTransfer.getData(
                                    "application/x-kanso-list-item-id",
                                  ) || activeDragItemIdRef.current;
                                clearAllDragStates();
                                if (!itemId) return;
                                e.preventDefault();
                                handleChangeItemStatus(itemId, statusKey);
                              }}
                              onClick={() =>
                                setCollapsedGroups((prev) => ({
                                  ...prev,
                                  [groupKey]: !prev[groupKey],
                                }))
                              }
                              className={`flex items-center gap-1.5 text-xs font-semibold py-1 px-1.5 -mx-1.5 rounded-lg transition-colors ${
                                isStatusDropHover
                                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                                  : ""
                              }`}
                              style={{
                                color: isStatusDropHover
                                  ? "var(--accent)"
                                  : "var(--text-secondary)",
                              }}
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

                    {/* Quick Drop Targets for Empty Status Groups While Dragging */}
                    {emptyStatusesForDrag.length > 0 && (
                      <div className="pt-1 space-y-1.5">
                        <div
                          className="text-[11px] font-medium"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Drop to change status
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {emptyStatusesForDrag.map((st) => {
                            const sm = STATUS_META[st];
                            const Icon = sm.icon;
                            const isHover = statusGroupDropTarget === st;
                            return (
                              <div
                                key={st}
                                ref={(el) => {
                                  if (el) statusDropZoneRefs.current.set(st, el);
                                  else statusDropZoneRefs.current.delete(st);
                                }}
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
                                  setItemDropTarget(null);
                                  setStatusGroupDropTarget(st);
                                }}
                                onDragLeave={(e) => {
                                  if (
                                    !e.currentTarget.contains(
                                      e.relatedTarget as Node,
                                    )
                                  ) {
                                    setStatusGroupDropTarget((prev) =>
                                      prev === st ? null : prev,
                                    );
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
                                  const itemId =
                                    e.dataTransfer.getData(
                                      "application/x-kanso-list-item-id",
                                    ) || activeDragItemIdRef.current;
                                  clearAllDragStates();
                                  if (!itemId) return;
                                  e.preventDefault();
                                  handleChangeItemStatus(itemId, st);
                                }}
                                className="h-9 px-3 rounded-xl border border-dashed inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
                                style={{
                                  borderColor: isHover
                                    ? "var(--accent)"
                                    : "var(--border-strong)",
                                  backgroundColor: isHover
                                    ? "var(--accent-soft)"
                                    : "var(--bg-surface)",
                                  color: isHover
                                    ? "var(--accent)"
                                    : "var(--text-secondary)",
                                }}
                              >
                                <Icon
                                  className="w-3.5 h-3.5"
                                  style={{ color: sm.color }}
                                />
                                <span>{sm.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
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
