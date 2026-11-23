import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Columns3,
  ExternalLink,
  FileText,
  Globe,
  GripVertical,
  Inbox,
  LayoutGrid,
  Link2,
  List as ListIcon,
  MoreVertical,
  PanelRight,
  PauseCircle,
  Pencil,
  Plus,
  Rows3,
  Search,
  SlidersHorizontal,
  Square,
  Tag,
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
import { ListItemInspector } from "../components/lists/ListItemInspector";
import {
  buildKanbanColumnsForList,
  buildKanbanColumnsForSmartTab,
  KanbanColumnDef,
  ListKanbanBoard,
} from "../components/lists/ListKanbanBoard";
import {
  AttachLinkedEntriesModal,
  DeleteListConfirmModal,
  ListsGroupBy,
  ListsSortMode,
  ListsViewMode,
  MobileListsFilterSheet,
} from "../components/lists/ListsModals";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  BookNoteLink,
  ContextMenuRecord,
  DetailSheetTarget,
  Entry,
  ListCollection,
  ListCollectionType,
  ListItem,
  ListItemStatus,
} from "../types";
import {
  addDaysToKey,
  formatCompactDayHeading,
  getEntryDayKey,
  getTodayKey,
  toLocalDateKey,
} from "../utils/date";
import {
  formatUrlDisplayLabel,
  normalizeExternalUrl,
  openExternalUrlSafely,
  removeListItemBookLinks,
  useListItemBookLinks,
} from "../utils/listBookLinks";
import { VIEW_PREFERENCE_SYNC_EVENT } from "../utils/viewPreferences";

type ListsSubTab = "items" | "notes" | "events";
type ContextPaneTab = "notes" | "events";
type RightPaneMode = "inspector" | "linked";

type ListsScope =
  | { kind: "list"; listId: string }
  | { kind: "smart"; status: ListItemStatus };

interface LayoutConfig {
  viewMode: ListsViewMode;
  groupBy: ListsGroupBy;
  thenBy: ListsGroupBy;
  sortBy: ListsSortMode;
}

interface ListsWorkspaceState {
  scope: ListsScope;
  statusFilter: ListItemStatus | "all";
  tagFilter: string;
  subTab: ListsSubTab;
  contextTab: ContextPaneTab;
  rightPaneMode: RightPaneMode;
  selectedItemId: string | null;
  collapsedGroups: Record<string, boolean>;
  droppedCollapsed: boolean;
  perListLayout: Record<string, LayoutConfig>;
}

const PREFS_KEY = "kanso_lists_prefs_v1";
// Intentionally excluded from viewPreferences.ts & GitHub Gist sync (device-local workspace memory)
const LOCAL_WORKSPACE_KEY = "kanso_lists_workspace_state_v1";

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

function hasMeaningfulRichContent(html?: string): boolean {
  if (!html) return false;
  const stripped = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
  return stripped.length > 0 || /<(img|hr|pre|table|blockquote|ul|ol|li)\b/i.test(html);
}

function getScopeStorageKey(scope: ListsScope): string {
  return scope.kind === "smart" ? `smart:${scope.status}` : `list:${scope.listId}`;
}

function loadGlobalPrefs(): LayoutConfig & { splitOpen: boolean } {
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
    // Ignore storage errors
  }
  return {
    viewMode: "stacked",
    groupBy: "status",
    thenBy: "none",
    sortBy: "custom",
    splitOpen: true,
  };
}

function loadLocalWorkspaceState(
  fallbackListId: string,
): ListsWorkspaceState {
  const defaults: ListsWorkspaceState = {
    scope: fallbackListId
      ? { kind: "list", listId: fallbackListId }
      : { kind: "smart", status: "inbox" },
    statusFilter: "all",
    tagFilter: "all",
    subTab: "items",
    contextTab: "notes",
    rightPaneMode: "inspector",
    selectedItemId: null,
    collapsedGroups: {},
    droppedCollapsed: true,
    perListLayout: {},
  };

  if (typeof localStorage === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(LOCAL_WORKSPACE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<ListsWorkspaceState>;
    const validScope =
      parsed.scope &&
      ((parsed.scope.kind === "list" && typeof parsed.scope.listId === "string") ||
        (parsed.scope.kind === "smart" &&
          STATUS_ORDER.includes(parsed.scope.status)))
        ? parsed.scope
        : defaults.scope;

    return {
      ...defaults,
      ...parsed,
      scope: validScope,
      collapsedGroups:
        parsed.collapsedGroups && typeof parsed.collapsedGroups === "object"
          ? parsed.collapsedGroups
          : {},
      perListLayout:
        parsed.perListLayout && typeof parsed.perListLayout === "object"
          ? parsed.perListLayout
          : {},
    };
  } catch {
    return defaults;
  }
}

interface ListsViewProps {
  onOpenDetail: (target: DetailSheetTarget) => void;
  onOpenContextMenu: (record: ContextMenuRecord, e: React.MouseEvent) => void;
  onJumpToBookLocation?: (bookLink: BookNoteLink) => void;
  selectItemHandlerRef?: React.MutableRefObject<((itemId: string) => void) | null>;
  isSelectedItemRef?: React.MutableRefObject<((itemId: string) => boolean) | null>;
}

export const ListsView: React.FC<ListsViewProps> = ({
  onOpenDetail,
  onOpenContextMenu,
  onJumpToBookLocation,
  selectItemHandlerRef,
  isSelectedItemRef,
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
    deleteListItem,
    reorderListItems,
    updateEntry,
  } = useWorkspace();

  const activeLists = useMemo(() => workspace.lists, [workspace.lists]);
  const listById = useMemo(
    () => new Map(activeLists.map((l) => [l.id, l])),
    [activeLists],
  );
  const bookLinksMap = useListItemBookLinks();

  // Global synced fallback defaults
  const [prefs, setPrefs] = useState<LayoutConfig & { splitOpen: boolean }>(
    loadGlobalPrefs,
  );

  // Device-local Lists workspace state (NEVER synced via Gist)
  const [localState, setLocalState] = useState<ListsWorkspaceState>(() =>
    loadLocalWorkspaceState(activeLists[0]?.id || ""),
  );

  const [search, setSearch] = useState("");
  const [statusPickerItemId, setStatusPickerItemId] = useState<string | null>(
    null,
  );
  const [duePickerItemId, setDuePickerItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<{
    id: string;
    title: string;
    subtitle: string;
  } | null>(null);

  const [quickJumpOpen, setQuickJumpOpen] = useState(false);
  const [quickJumpQuery, setQuickJumpQuery] = useState("");
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const [smartAddTargetListId, setSmartAddTargetListId] = useState<string>(
    () => activeLists[0]?.id || "",
  );

  // Multi-select bulk action state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkTagOpen, setBulkTagOpen] = useState(false);

  // Modals: Safe delete, Attach linked entries, List Create/Edit
  const [deleteTargetList, setDeleteTargetList] =
    useState<ListCollection | null>(null);
  const [attachModalKind, setAttachModalKind] = useState<
    "notes" | "events" | null
  >(null);
  const [listModal, setListModal] = useState<{
    mode: "create" | "edit";
    list?: ListCollection;
    title: string;
    icon: string;
    color: string;
    listType: ListCollectionType;
  } | null>(null);

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

  // Persist prefs (global fallback + splitOpen)
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore
    }
  }, [prefs]);

  useEffect(() => {
    const onSynced = () => setPrefs(loadGlobalPrefs());
    window.addEventListener(VIEW_PREFERENCE_SYNC_EVENT, onSynced);
    return () => {
      window.removeEventListener(VIEW_PREFERENCE_SYNC_EVENT, onSynced);
    };
  }, []);

  // Persist local workspace state on device only
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify(localState));
    } catch {
      // Ignore
    }
  }, [localState]);

  // Reconcile list scope & smartAddTargetListId if lists change
  useEffect(() => {
    const activeScope = localState.scope;
    if (
      activeScope.kind === "list" &&
      !activeLists.some((l) => l.id === activeScope.listId)
    ) {
      setLocalState((prev) => ({
        ...prev,
        scope: activeLists[0]
          ? { kind: "list", listId: activeLists[0].id }
          : { kind: "smart", status: "inbox" },
      }));
    }
    if (!activeLists.some((l) => l.id === smartAddTargetListId)) {
      setSmartAddTargetListId(activeLists[0]?.id || "");
    }
  }, [activeLists, localState.scope, smartAddTargetListId]);

  // Reconcile selectedItemId if item deleted
  useEffect(() => {
    if (
      localState.selectedItemId &&
      !workspace.listItems.some((i) => i.id === localState.selectedItemId)
    ) {
      setLocalState((prev) => ({ ...prev, selectedItemId: null }));
    }
  }, [localState.selectedItemId, workspace.listItems]);

  // Prune stale selectedIds when items disappear
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const existing = new Set(workspace.listItems.map((i) => i.id));
    let changed = false;
    const next = new Set<string>();
    selectedIds.forEach((id) => {
      if (existing.has(id)) next.add(id);
      else changed = true;
    });
    if (changed) setSelectedIds(next);
  }, [workspace.listItems, selectedIds]);

  const scope = localState.scope;
  const isSmartScope = scope.kind === "smart";
  const currentList =
    scope.kind === "list"
      ? activeLists.find((l) => l.id === scope.listId) || null
      : null;
  const scopeKey = getScopeStorageKey(scope);

  const activeLayout: LayoutConfig = useMemo(() => {
    const saved = localState.perListLayout[scopeKey];
    const defaultGroup: ListsGroupBy = isSmartScope ? "none" : prefs.groupBy;
    if (!saved) {
      return {
        viewMode: prefs.viewMode,
        groupBy: defaultGroup,
        thenBy: isSmartScope ? "none" : prefs.thenBy,
        sortBy: prefs.sortBy,
      };
    }
    return {
      viewMode: saved.viewMode || "stacked",
      groupBy: saved.groupBy || defaultGroup,
      thenBy: saved.thenBy || "none",
      sortBy: saved.sortBy || "custom",
    };
  }, [localState.perListLayout, scopeKey, isSmartScope, prefs]);

  const updateActiveLayout = useCallback(
    (patch: Partial<LayoutConfig>) => {
      setLocalState((prev) => {
        const current = prev.perListLayout[scopeKey] || {
          viewMode: prefs.viewMode,
          groupBy: isSmartScope ? "none" : prefs.groupBy,
          thenBy: isSmartScope ? "none" : prefs.thenBy,
          sortBy: prefs.sortBy,
        };
        return {
          ...prev,
          perListLayout: {
            ...prev.perListLayout,
            [scopeKey]: { ...current, ...patch },
          },
        };
      });
    },
    [scopeKey, isSmartScope, prefs],
  );

  // Drag & drop state
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

  const splitVisible = isDesktop && prefs.splitOpen;

  // Keep Tracked Items focused in the left pane whenever desktop split pane is active
  useEffect(() => {
    if (splitVisible && localState.subTab !== "items") {
      setLocalState((prev) => ({
        ...prev,
        contextTab:
          prev.subTab === "notes" || prev.subTab === "events"
            ? prev.subTab
            : prev.contextTab,
        subTab: "items",
      }));
    }
  }, [splitVisible, localState.subTab]);

  // If on a Smart Tab and desktop right pane was set to "linked", auto switch to "inspector"
  const effectiveRightPaneMode: RightPaneMode = isSmartScope
    ? "inspector"
    : localState.rightPaneMode;

  const listItemCountsByCollection = useMemo(() => {
    const map = new Map<string, number>();
    workspace.listItems.forEach((item) => {
      map.set(item.listId, (map.get(item.listId) || 0) + 1);
    });
    return map;
  }, [workspace.listItems]);

  const globalStatusCounts = useMemo(() => {
    const counts: Record<ListItemStatus, number> = {
      inbox: 0,
      processing: 0,
      done: 0,
      "maybe-later": 0,
      dropped: 0,
    };
    workspace.listItems.forEach((item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
    });
    return counts;
  }, [workspace.listItems]);

  const scopeItemsAll = useMemo(() => {
    if (scope.kind === "smart") {
      return workspace.listItems.filter((i) => i.status === scope.status);
    }
    return workspace.listItems.filter((i) => i.listId === scope.listId);
  }, [workspace.listItems, scope]);

  const scopeStatusCounts = useMemo(() => {
    const counts: Record<ListItemStatus, number> = {
      inbox: 0,
      processing: 0,
      done: 0,
      "maybe-later": 0,
      dropped: 0,
    };
    scopeItemsAll.forEach((item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
    });
    return counts;
  }, [scopeItemsAll]);

  const scopeUniqueTags = useMemo(() => {
    const set = new Set<string>();
    scopeItemsAll.forEach((item) =>
      (item.tags || []).forEach((t) => set.add(t)),
    );
    return Array.from(set).sort();
  }, [scopeItemsAll]);

  const isCustomSort = activeLayout.sortBy === "custom";

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
    return scopeItemsAll
      .filter((item) => {
        if (
          !isSmartScope &&
          localState.statusFilter !== "all" &&
          item.status !== localState.statusFilter
        ) {
          return false;
        }
        if (
          localState.tagFilter !== "all" &&
          !(item.tags || []).includes(localState.tagFilter)
        ) {
          return false;
        }
        if (!q) return true;
        const listTitle = listById.get(item.listId)?.title.toLowerCase() || "";
        return (
          item.title.toLowerCase().includes(q) ||
          (item.subtitle || "").toLowerCase().includes(q) ||
          (item.url || "").toLowerCase().includes(q) ||
          listTitle.includes(q) ||
          (item.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (activeLayout.sortBy === "custom") return customListItemCompare(a, b);
        if (activeLayout.sortBy === "oldest") {
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        }
        if (activeLayout.sortBy === "title") {
          return a.title.localeCompare(b.title);
        }
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
  }, [
    scopeItemsAll,
    isSmartScope,
    localState.statusFilter,
    localState.tagFilter,
    search,
    listById,
    activeLayout.sortBy,
    customListItemCompare,
  ]);

  // Linked Notes & Events for current list (archived notes excluded!)
  const linkedNotes = useMemo(() => {
    if (!currentList) return [];
    return workspace.entries.filter(
      (e) =>
        e.type === "note" &&
        !e.archived &&
        (e.listIds || []).includes(currentList.id),
    );
  }, [workspace.entries, currentList]);

  const linkedEvents = useMemo(() => {
    if (!currentList) return [];
    return workspace.entries.filter(
      (e) =>
        e.type === "event" && (e.listIds || []).includes(currentList.id),
    );
  }, [workspace.entries, currentList]);

  const attachModalCandidates = useMemo(() => {
    if (!attachModalKind) return [];
    if (attachModalKind === "notes") {
      return workspace.entries.filter((e) => e.type === "note" && !e.archived);
    }
    return workspace.entries.filter((e) => e.type === "event");
  }, [attachModalKind, workspace.entries]);

  const handleToggleLinkedEntry = useCallback(
    (entry: Entry) => {
      if (!currentList) return;
      const existing = entry.listIds || [];
      const isLinked = existing.includes(currentList.id);
      const next = isLinked
        ? existing.filter((id) => id !== currentList.id)
        : [...existing, currentList.id];
      updateEntry(entry.id, { listIds: next });
    },
    [currentList, updateEntry],
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
    const primary = groupItems(filteredItems, activeLayout.groupBy);
    const effectiveThenBy: ListsGroupBy =
      activeLayout.thenBy !== "none" &&
      activeLayout.thenBy !== activeLayout.groupBy
        ? activeLayout.thenBy
        : "none";
    return primary.map((g) => ({
      ...g,
      subGroups: groupItems(g.items, effectiveThenBy),
      hasSubGroups: effectiveThenBy !== "none",
    }));
  }, [filteredItems, activeLayout.groupBy, activeLayout.thenBy]);

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
      isSmartScope ||
      activeLayout.viewMode === "board" ||
      activeLayout.groupBy !== "status" ||
      localState.statusFilter !== "all"
    ) {
      return [];
    }
    const present = new Set(groupedTree.map((g) => g.key));
    return STATUS_ORDER.filter((st) => !present.has(st));
  }, [
    draggingItemId,
    isSmartScope,
    activeLayout.viewMode,
    activeLayout.groupBy,
    localState.statusFilter,
    groupedTree,
  ]);

  const isSingleColumnForElement = useCallback(
    (el: HTMLElement | null) => {
      if (activeLayout.viewMode === "board") return true;
      if (activeLayout.viewMode !== "grid") return true;
      const parent = el?.parentElement;
      if (parent) {
        const cols = getComputedStyle(parent)
          .gridTemplateColumns.split(" ")
          .filter(Boolean).length;
        if (cols > 0) return cols === 1;
      }
      return typeof window !== "undefined" ? window.innerWidth < 640 : false;
    },
    [activeLayout.viewMode],
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
      const item = workspace.listItems.find((i) => i.id === itemId);
      if (!item || item.status === targetStatus) return;
      updateListItem(itemId, { status: targetStatus });
      pushToast(`Moved to ${STATUS_META[targetStatus].label}`, "success");
    },
    [workspace.listItems, updateListItem, pushToast],
  );

  const handleDropItemOnItem = useCallback(
    (draggedId: string, targetItemId: string, position: "before" | "after") => {
      if (!draggedId || !targetItemId || draggedId === targetItemId) return;
      const draggedItem = scopeItemsAll.find((i) => i.id === draggedId);
      const targetItem = scopeItemsAll.find((i) => i.id === targetItemId);
      if (!draggedItem || !targetItem) return;

      // Cross-list drop on Kanban Smart Tab
      if (isSmartScope && draggedItem.listId !== targetItem.listId) {
        handleMoveItemToList(draggedId, targetItem.listId);
        return;
      }

      const shouldChangeStatus =
        !isSmartScope &&
        (activeLayout.groupBy === "status" ||
          activeLayout.viewMode === "board") &&
        draggedItem.status !== targetItem.status;

      if (!isCustomSort) {
        if (shouldChangeStatus) {
          handleChangeItemStatus(draggedId, targetItem.status);
        }
        return;
      }

      const visibleIds = renderedItemOrder.map((i) => i.id);
      if (
        !visibleIds.includes(draggedId) ||
        !visibleIds.includes(targetItemId)
      ) {
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
      const globalSorted = [...scopeItemsAll].sort(customListItemCompare);
      const byId = new Map(scopeItemsAll.map((i) => [i.id, i]));
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
      scopeItemsAll,
      isSmartScope,
      handleMoveItemToList,
      activeLayout.groupBy,
      activeLayout.viewMode,
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
        if (scope.kind === "list" && tabId === scope.listId) continue;
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

      if (!isSmartScope && activeLayout.groupBy === "status") {
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
    [scope, renderedItemOrder, isSingleColumnForElement, isSmartScope, activeLayout.groupBy],
  );

  // Item click handler (Desktop: Inspector in right split pane; Mobile: existing DetailSheet modal)
  const handleOpenItem = useCallback(
    (item: ListItem) => {
      if (draggingItemId) return;
      if (selectionMode || selectedIds.size > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        });
        return;
      }

      if (isDesktop) {
        setLocalState((prev) => ({
          ...prev,
          selectedItemId: item.id,
          rightPaneMode: "inspector",
        }));
        setPrefs((p) => (p.splitOpen ? p : { ...p, splitOpen: true }));
      } else {
        onOpenDetail({ mode: "list_item", id: item.id });
      }
    },
    [draggingItemId, selectionMode, selectedIds.size, isDesktop, onOpenDetail],
  );

  const toggleItemSelection = useCallback((itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (selectItemHandlerRef) {
      selectItemHandlerRef.current = (itemId: string) => {
        setSelectionMode(true);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(itemId)) next.delete(itemId);
          else next.add(itemId);
          return next;
        });
      };
    }
    if (isSelectedItemRef) {
      isSelectedItemRef.current = (itemId: string) => selectedIds.has(itemId);
    }
    return () => {
      if (selectItemHandlerRef) selectItemHandlerRef.current = null;
      if (isSelectedItemRef) isSelectedItemRef.current = null;
    };
  }, [selectItemHandlerRef, isSelectedItemRef, selectedIds]);

  const commitInlineEdit = useCallback(() => {
    if (!editingItem) return;
    const trimmedTitle = editingItem.title.trim();
    if (trimmedTitle) {
      updateListItem(editingItem.id, {
        title: trimmedTitle,
        subtitle: editingItem.subtitle.trim(),
      });
    }
    setEditingItem(null);
  }, [editingItem, updateListItem]);

  // Bulk Actions
  const handleBulkStatus = (nextStatus: ListItemStatus) => {
    if (selectedIds.size === 0) return;
    selectedIds.forEach((id) => updateListItem(id, { status: nextStatus }));
    pushToast(
      `Updated ${selectedIds.size} ${selectedIds.size === 1 ? "item" : "items"} to ${STATUS_META[nextStatus].label}`,
      "success",
    );
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const handleBulkMoveList = (targetListId: string) => {
    if (selectedIds.size === 0 || !targetListId) return;
    const target = listById.get(targetListId);
    selectedIds.forEach((id) => updateListItem(id, { listId: targetListId }));
    pushToast(
      `Moved ${selectedIds.size} ${selectedIds.size === 1 ? "item" : "items"}${target ? ` to "${target.title}"` : ""}`,
      "success",
    );
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const handleBulkAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = bulkTagInput.trim().replace(/^#/, "").toLowerCase();
    if (!clean || selectedIds.size === 0) return;
    selectedIds.forEach((id) => {
      const item = workspace.listItems.find((i) => i.id === id);
      if (!item) return;
      const existing = item.tags || [];
      if (!existing.includes(clean)) {
        updateListItem(id, { tags: [...existing, clean] });
      }
    });
    pushToast(`Added #${clean} to ${selectedIds.size} items`, "success");
    setBulkTagInput("");
    setBulkTagOpen(false);
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const ids = Array.from(selectedIds);
    removeListItemBookLinks(ids);
    ids.forEach((id) => deleteListItem(id));
    pushToast(`Deleted ${count} ${count === 1 ? "item" : "items"}`);
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

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
      setLocalState((prev) => ({
        ...prev,
        scope: { kind: "list", listId: created.id },
        statusFilter: "all",
        tagFilter: "all",
      }));
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
      setLocalState((prev) => ({
        ...prev,
        contextTab: tab,
        rightPaneMode: "linked",
      }));
    } else {
      setLocalState((prev) => ({ ...prev, subTab: tab }));
    }
  };

  // Kanban columns & callbacks
  const kanbanColumns = useMemo<KanbanColumnDef[]>(() => {
    if (scope.kind === "smart") {
      return buildKanbanColumnsForSmartTab(filteredItems, activeLists);
    }
    return buildKanbanColumnsForList(filteredItems, STATUS_META, STATUS_ORDER);
  }, [scope.kind, filteredItems, activeLists]);

  const handleDropOnKanbanColumn = useCallback(
    (itemId: string, col: KanbanColumnDef) => {
      if (col.status) {
        handleChangeItemStatus(itemId, col.status);
      } else if (col.listId) {
        handleMoveItemToList(itemId, col.listId);
      }
    },
    [handleChangeItemStatus, handleMoveItemToList],
  );

  const handleInlineAddInKanbanColumn = useCallback(
    (col: KanbanColumnDef, rawText: string) => {
      if (scope.kind === "smart") {
        const targetListId = col.listId || smartAddTargetListId || activeLists[0]?.id;
        if (!targetListId) return;
        addListItem(targetListId, rawText, scope.status);
      } else {
        addListItem(scope.listId, rawText, col.status || "inbox");
      }
    },
    [scope, smartAddTargetListId, activeLists, addListItem],
  );

  const selectedInspectorItem = useMemo(
    () =>
      localState.selectedItemId
        ? workspace.listItems.find((i) => i.id === localState.selectedItemId) ||
          null
        : null,
    [localState.selectedItemId, workspace.listItems],
  );

  const activeMobileFilterCount = useMemo(() => {
    let count = 0;
    if (!isSmartScope && localState.statusFilter !== "all") count++;
    if (localState.tagFilter !== "all") count++;
    if (activeLayout.groupBy !== (isSmartScope ? "none" : "status")) count++;
    if (activeLayout.sortBy !== "custom") count++;
    return count;
  }, [isSmartScope, localState.statusFilter, localState.tagFilter, activeLayout]);

  const todayKey = getTodayKey();

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
            setDuePickerItemId(null);
            setStatusPickerItemId(pickerOpen ? null : item.id);
          }}
          className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
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
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
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

  const renderDueDateChip = (item: ListItem, showHoverAdd = true) => {
    const hasDue = Boolean(item.scheduledAt);
    const dueKey = hasDue ? toLocalDateKey(item.scheduledAt!) : "";
    const isOverdue =
      hasDue &&
      dueKey < todayKey &&
      item.status !== "done" &&
      item.status !== "dropped";
    const pickerOpen = duePickerItemId === item.id;

    return (
      <div
        className="relative inline-flex items-center shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setStatusPickerItemId(null);
            setDuePickerItemId(pickerOpen ? null : item.id);
          }}
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-mono tabular-nums transition-colors cursor-pointer ${
            hasDue
              ? "hover:bg-[var(--bg-surface-hover)]"
              : showHoverAdd
                ? "opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-[var(--bg-surface-hover)]"
                : "hidden"
          }`}
          style={{
            color: isOverdue
              ? "var(--danger)"
              : hasDue
                ? "var(--text-secondary)"
                : "var(--text-muted)",
          }}
          title={hasDue ? "Click to reschedule due date" : "Set due date"}
        >
          <Calendar className="w-3 h-3 opacity-80" />
          <span>{hasDue ? formatCompactDayHeading(dueKey) : "+ Due"}</span>
        </button>

        {pickerOpen && (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={(e) => {
                e.stopPropagation();
                setDuePickerItemId(null);
              }}
            />
            <div
              className="absolute left-0 top-7 z-30 w-48 rounded-xl border p-2 space-y-1.5"
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-strong)",
                boxShadow: "var(--shadow-popover)",
              }}
            >
              <div className="grid grid-cols-3 gap-1">
                {[
                  { label: "Today", key: todayKey },
                  { label: "Tmrw", key: addDaysToKey(todayKey, 1) },
                  { label: "+7d", key: addDaysToKey(todayKey, 7) },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      updateListItem(item.id, {
                        scheduledAt: new Date(
                          `${preset.key}T12:00:00`,
                        ).toISOString(),
                      });
                      setDuePickerItemId(null);
                    }}
                    className="h-6 rounded-md text-[11px] font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      backgroundColor:
                        dueKey === preset.key
                          ? "var(--accent-soft)"
                          : "var(--bg-surface)",
                      color:
                        dueKey === preset.key
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={dueKey}
                onChange={(e) => {
                  const val = e.target.value;
                  updateListItem(item.id, {
                    scheduledAt: val
                      ? new Date(`${val}T12:00:00`).toISOString()
                      : null,
                  });
                  setDuePickerItemId(null);
                }}
                className="w-full h-7 px-1.5 rounded-md border text-[11px] font-mono outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              />
              {hasDue && (
                <button
                  type="button"
                  onClick={() => {
                    updateListItem(item.id, { scheduledAt: null });
                    setDuePickerItemId(null);
                  }}
                  className="w-full h-6 rounded-md text-[11px] font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{ color: "var(--danger)" }}
                >
                  Clear due date
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderSourceListBadge = (item: ListItem) => {
    if (!isSmartScope) return null;
    const srcList = listById.get(item.listId);
    if (!srcList) return null;
    const badgeColor = srcList.color || "#4f46e5";
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium max-w-[130px] truncate shrink-0"
        style={{
          backgroundColor: `${badgeColor}18`,
          color: badgeColor,
        }}
        title={`From list: ${srcList.title}`}
      >
        <CollectionIcon name={srcList.icon} className="w-2.5 h-2.5 shrink-0" />
        <span className="truncate">{srcList.title}</span>
      </span>
    );
  };

  const makeCommonDragHandlers = (item: ListItem, isInlineEditing: boolean) => ({
    ref: (node: HTMLDivElement | null) => {
      if (node) itemElRefs.current.set(item.id, node);
      else itemElRefs.current.delete(item.id);
    },
    draggable: !isInlineEditing,
    onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
      if (isInlineEditing) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("application/x-kanso-list-item-id", item.id);
      e.dataTransfer.effectAllowed = "move";
      activeDragItemIdRef.current = item.id;
      setDraggingItemId(item.id);
    },
    onDragEnd: clearAllDragStates,
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes("application/x-kanso-list-item-id")) {
        return;
      }
      const draggedId = activeDragItemIdRef.current;
      if (!draggedId || draggedId === item.id) return;
      const draggedItem = scopeItemsAll.find((i) => i.id === draggedId);
      const crossStatus =
        !isSmartScope &&
        (activeLayout.groupBy === "status" ||
          activeLayout.viewMode === "board") &&
        draggedItem &&
        draggedItem.status !== item.status;
      const crossList =
        isSmartScope &&
        activeLayout.viewMode === "board" &&
        draggedItem &&
        draggedItem.listId !== item.listId;
      if (!isCustomSort && !crossStatus && !crossList) return;

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
        setItemDropTarget((prev) => (prev?.itemId === item.id ? null : prev));
      }
    },
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes("application/x-kanso-list-item-id")) {
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
  });

  // Redesigned Grid / Kanban Card
  const renderCard = (item: ListItem, inBoard = false) => {
    const itemTags = item.tags || [];
    const isBeingDragged = draggingItemId === item.id;
    const isDropTarget = itemDropTarget?.itemId === item.id;
    const isInlineEditing = editingItem?.id === item.id;
    const isSelectedForEdit =
      isDesktop && prefs.splitOpen && localState.selectedItemId === item.id;
    const isChecked = selectedIds.has(item.id);
    const validUrl = item.url ? normalizeExternalUrl(item.url) : "";
    const itemList = listById.get(item.listId);
    const bookLink =
      itemList?.listType === "books" ? bookLinksMap[item.id] ?? null : null;
    const linkedBookRecord = bookLink
      ? workspace.books.find((b) => b.id === bookLink.bookId) || null
      : null;
    const hasNotesPreview = hasMeaningfulRichContent(item.content);
    const showCheckbox = selectionMode || selectedIds.size > 0;
    const el = itemElRefs.current.get(item.id) ?? null;
    const singleCol = inBoard ? true : isSingleColumnForElement(el);

    const dragHandle = isCustomSort && !isInlineEditing && (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Reorder ${item.title}`}
        title="Drag to reorder or drop onto a list tab"
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
        className="touch-none select-none w-5 h-6 -ml-1 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>
    );

    const hasFooterLeft =
      Boolean(item.scheduledAt) || isSmartScope || !inBoard;
    const showFooter =
      Boolean(item.scheduledAt) ||
      isSmartScope ||
      itemTags.length > 0 ||
      !isInlineEditing;

    return (
      <div
        key={item.id}
        {...makeCommonDragHandlers(item, isInlineEditing)}
        onClick={() => handleOpenItem(item)}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenContextMenu({ kind: "list_item", item }, e);
        }}
        className={`group relative rounded-xl border p-4 cursor-pointer transition-all duration-150 hover:border-[var(--border-strong)] flex flex-col justify-between gap-2.5 ${
          isCustomSort && !isInlineEditing
            ? "cursor-grab active:cursor-grabbing"
            : ""
        } ${isBeingDragged ? "opacity-45 scale-[0.98]" : ""} ${
          isDropTarget
            ? "ring-1 ring-[var(--accent)]/60 ring-offset-1 ring-offset-[var(--bg-canvas)]"
            : ""
        }`}
        style={{
          backgroundColor: isChecked
            ? "var(--accent-soft)"
            : isSelectedForEdit
              ? "var(--bg-surface-subtle)"
              : "var(--bg-surface)",
          borderColor:
            isDropTarget || isSelectedForEdit || isChecked
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

        {/* Top Header Row: Checkbox + Drag + Status + Title/Subtitle + Actions */}
        <div className="space-y-2.5">
          <div className="flex items-start gap-2">
            {(showCheckbox || isChecked) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleItemSelection(item.id);
                }}
                aria-label={isChecked ? "Deselect item" : "Select item"}
                className="h-6 w-5 flex items-center justify-center rounded shrink-0 cursor-pointer transition-opacity"
                style={{
                  color: isChecked ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                {isChecked ? (
                  <CheckSquare className="w-3.5 h-3.5" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
              </button>
            )}

            {dragHandle}
            {renderStatusButton(item)}

            <div className="flex-1 min-w-0 pt-0.5">
              {isInlineEditing ? (
                <div
                  className="space-y-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={editingItem.title}
                    onChange={(e) =>
                      setEditingItem((prev) =>
                        prev ? { ...prev, title: e.target.value } : prev,
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitInlineEdit();
                      } else if (e.key === "Escape") {
                        setEditingItem(null);
                      }
                    }}
                    autoFocus
                    className="w-full px-2 py-1 rounded-md border text-sm font-semibold outline-none"
                    style={{
                      backgroundColor: "var(--bg-canvas)",
                      borderColor: "var(--accent)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={editingItem.subtitle}
                      onChange={(e) =>
                        setEditingItem((prev) =>
                          prev ? { ...prev, subtitle: e.target.value } : prev,
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitInlineEdit();
                        } else if (e.key === "Escape") {
                          setEditingItem(null);
                        }
                      }}
                      placeholder="Subtitle..."
                      className="flex-1 min-w-0 px-2 py-0.5 rounded-md border text-xs outline-none"
                      style={{
                        backgroundColor: "var(--bg-canvas)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={commitInlineEdit}
                      className="h-6 w-6 flex items-center justify-center rounded-md cursor-pointer"
                      style={{
                        backgroundColor: "var(--accent)",
                        color: "var(--accent-fg)",
                      }}
                      aria-label="Save edit"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingItem(null)}
                      className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                      aria-label="Cancel edit"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingItem({
                      id: item.id,
                      title: item.title,
                      subtitle: item.subtitle || "",
                    });
                  }}
                  className="space-y-0.5"
                >
                  <div
                    className={`text-sm font-semibold leading-snug line-clamp-2 ${
                      item.status === "done" ? "line-through opacity-60" : ""
                    }`}
                    style={{ color: "var(--text-primary)" }}
                  >
                    {item.title}
                  </div>
                  {item.subtitle && (
                    <div
                      className="text-xs line-clamp-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {item.subtitle}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!isInlineEditing && (
              <div className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingItem({
                      id: item.id,
                      title: item.title,
                      subtitle: item.subtitle || "",
                    });
                  }}
                  className="h-6 w-6 hidden group-hover:flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                  title="Quick edit title & subtitle"
                  aria-label="Quick edit item"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenContextMenu({ kind: "list_item", item }, e);
                  }}
                  className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Item actions"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 3-line Rich Note Preview inside Card */}
          {hasNotesPreview && (
            <div className="pl-8">
              <RichContent
                html={item.content}
                className="kanso-timeline-preview kanso-timeline-preview-faded line-clamp-3 text-xs leading-relaxed"
                fade
              />
            </div>
          )}

          {/* Clickable External URL Link Chip + Local Library Book Chip */}
          {(validUrl || (bookLink && linkedBookRecord)) && (
            <div className="pl-8 flex flex-wrap items-center gap-1.5">
              {validUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openExternalUrlSafely(item.url!);
                  }}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium max-w-full transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                  title={`Open ${validUrl}`}
                >
                  <Globe className="w-3 h-3 shrink-0 opacity-75" />
                  <span className="truncate">
                    {formatUrlDisplayLabel(item.url!)}
                  </span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-65" />
                </button>
              )}

              {bookLink && linkedBookRecord && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onJumpToBookLocation?.(bookLink);
                  }}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium max-w-full transition-colors hover:border-[var(--accent)] cursor-pointer"
                  style={{
                    backgroundColor: "var(--accent-soft)",
                    borderColor: "transparent",
                    color: "var(--accent)",
                  }}
                  title={`Open "${linkedBookRecord.title}" in Library`}
                >
                  <BookOpen className="w-3 h-3 shrink-0" />
                  <span className="truncate">{linkedBookRecord.title}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Hairline Card Footer: Source List Badge, Due Date Chip & Tags */}
        {showFooter && (
          <div
            className="pt-2.5 border-t flex flex-wrap items-center justify-between gap-2 text-[11px]"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            {hasFooterLeft && (
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                {renderSourceListBadge(item)}
                {renderDueDateChip(item, !inBoard)}
              </div>
            )}

            {itemTags.length > 0 && (
              <div
                className="flex flex-wrap items-center gap-1 font-mono tabular-nums ml-auto"
                style={{ color: "var(--text-muted)" }}
              >
                {itemTags.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="px-1.5 py-0.5 rounded bg-[var(--bg-surface-subtle)]"
                  >
                    #{t}
                  </span>
                ))}
                {itemTags.length > 3 && (
                  <span className="opacity-70">+{itemTags.length - 3}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Stacked & Compact row renderer
  const renderItemRow = (item: ListItem) => {
    if (activeLayout.viewMode === "grid") {
      return renderCard(item, false);
    }

    const isCompact = activeLayout.viewMode === "compact";
    const itemTags = item.tags || [];
    const isBeingDragged = draggingItemId === item.id;
    const isDropTarget = itemDropTarget?.itemId === item.id;
    const isInlineEditing = editingItem?.id === item.id;
    const isSelectedForEdit =
      isDesktop && prefs.splitOpen && localState.selectedItemId === item.id;
    const isChecked = selectedIds.has(item.id);
    const showCheckbox = selectionMode || selectedIds.size > 0;
    const validUrl = item.url ? normalizeExternalUrl(item.url) : "";
    const hasDue = Boolean(item.scheduledAt);

    const dragHandle = isCustomSort && !isInlineEditing && (
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
          isCompact ? "w-6 h-7 -ml-1" : "w-7 h-7 -ml-1"
        }`}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>
    );

    return (
      <div
        key={item.id}
        {...makeCommonDragHandlers(item, isInlineEditing)}
        onClick={() => handleOpenItem(item)}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenContextMenu({ kind: "list_item", item }, e);
        }}
        style={{
          backgroundColor: isChecked
            ? "var(--accent-soft)"
            : isSelectedForEdit
              ? "var(--bg-surface-subtle)"
              : undefined,
          boxShadow: isDropTarget
            ? itemDropTarget.position === "before"
              ? "inset 0 2.5px 0 var(--accent)"
              : "inset 0 -2.5px 0 var(--accent)"
            : undefined,
        }}
        className={`group relative flex items-start sm:items-center gap-2 px-2 -mx-2 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]/75 ${
          isCompact ? "py-1.5" : "py-2.5"
        } ${isCustomSort && !isInlineEditing ? "cursor-grab active:cursor-grabbing" : ""} ${
          isBeingDragged ? "opacity-50 bg-[var(--accent-soft)]" : ""
        }`}
      >
        {/* Multi-select checkbox (shown only after entering multi-select mode) */}
        {(showCheckbox || isChecked) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleItemSelection(item.id);
            }}
            aria-label={isChecked ? "Deselect item" : "Select item"}
            className="h-6 w-5 flex items-center justify-center rounded shrink-0 cursor-pointer transition-opacity"
            style={{
              color: isChecked ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {isChecked ? (
              <CheckSquare className="w-3.5 h-3.5" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
          </button>
        )}

        {dragHandle}

        {/* Status Icon Button */}
        <div className={isCompact ? "" : "pt-0.5 sm:pt-0"}>
          {renderStatusButton(item)}
        </div>

        {/* Title + Subtitle (+ Inline quick edit) */}
        <div className="flex-1 min-w-0">
          {isInlineEditing ? (
            <div
              className="flex flex-wrap items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                value={editingItem.title}
                onChange={(e) =>
                  setEditingItem((prev) =>
                    prev ? { ...prev, title: e.target.value } : prev,
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitInlineEdit();
                  } else if (e.key === "Escape") {
                    setEditingItem(null);
                  }
                }}
                autoFocus
                className="flex-1 min-w-[160px] px-2 py-0.5 rounded-md border text-sm font-medium outline-none"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--accent)",
                  color: "var(--text-primary)",
                }}
              />
              {!isCompact && (
                <input
                  type="text"
                  value={editingItem.subtitle}
                  onChange={(e) =>
                    setEditingItem((prev) =>
                      prev ? { ...prev, subtitle: e.target.value } : prev,
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitInlineEdit();
                    } else if (e.key === "Escape") {
                      setEditingItem(null);
                    }
                  }}
                  placeholder="Subtitle..."
                  className="w-40 px-2 py-0.5 rounded-md border text-xs outline-none"
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                />
              )}
              <button
                type="button"
                onClick={commitInlineEdit}
                className="h-6 w-6 flex items-center justify-center rounded-md cursor-pointer"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
                aria-label="Save edit"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                aria-label="Cancel edit"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingItem({
                  id: item.id,
                  title: item.title,
                  subtitle: item.subtitle || "",
                });
              }}
              className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2 min-w-0"
            >
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
          )}

          {/* Mobile metadata inline row */}
          {(hasDue || itemTags.length > 0 || isSmartScope || Boolean(validUrl)) && (
            <div
              className="flex sm:hidden flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              {renderSourceListBadge(item)}
              {validUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openExternalUrlSafely(item.url!);
                  }}
                  className="inline-flex items-center gap-1 font-medium hover:underline cursor-pointer"
                  style={{ color: "var(--accent)" }}
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>{formatUrlDisplayLabel(item.url!)}</span>
                </button>
              )}
              {hasDue && renderDueDateChip(item, false)}
              {itemTags.length > 0 && (
                <span className="font-mono tabular-nums">
                  {itemTags.map((t) => `#${t}`).join(" ")}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Desktop Metadata: source list badge, URL open button, tags, clickable due date */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          {renderSourceListBadge(item)}

          {validUrl && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openExternalUrlSafely(item.url!);
              }}
              className="h-6 px-1.5 rounded-md inline-flex items-center gap-1 text-[11px] font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--accent)" }}
              title={`Open ${validUrl}`}
              aria-label={`Open ${validUrl}`}
            >
              <ExternalLink className="w-3 h-3" />
            </button>
          )}

          {itemTags.length > 0 && (
            <span
              className="max-w-[160px] truncate text-[11px] font-mono tabular-nums"
              style={{ color: "var(--text-muted)" }}
            >
              {itemTags.map((t) => `#${t}`).join(" ")}
            </span>
          )}

          {renderDueDateChip(item, true)}
        </div>

        {/* Hover Quick-Edit + Context Menu Trigger */}
        {!isInlineEditing && (
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditingItem({
                  id: item.id,
                  title: item.title,
                  subtitle: item.subtitle || "",
                });
              }}
              className="h-7 w-7 hidden group-hover:flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
              title="Quick edit title & subtitle"
              aria-label="Quick edit item"
            >
              <Pencil className="w-3 h-3" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenContextMenu({ kind: "list_item", item }, e);
              }}
              className="h-7 w-7 flex items-center justify-center rounded-md shrink-0 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
              aria-label="Item actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderLinkedNotesContent = (compactPane: boolean) => {
    if (!currentList) return null;
    if (linkedNotes.length === 0) {
      return (
        <div
          className="rounded-xl border border-dashed py-10 px-4 text-center text-xs space-y-2.5"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <FileText className="w-5 h-5 mx-auto opacity-50" />
          <p>No notes linked to {currentList.title} yet.</p>
          <button
            type="button"
            onClick={() => setAttachModalKind("notes")}
            className="h-7 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <Link2 className="w-3 h-3" />
            <span>Attach existing note</span>
          </button>
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
            className="group rounded-xl border p-3.5 space-y-1.5 cursor-pointer transition-colors hover:border-[var(--border-strong)]"
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
              <div className="flex items-center gap-1 shrink-0">
                <span
                  className="text-[11px] font-mono tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  {formatCompactDayHeading(
                    toLocalDateKey(note.updatedAt || note.createdAt),
                  )}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleLinkedEntry(note);
                  }}
                  title="Unlink from list"
                  aria-label="Unlink note from list"
                  className="h-5 w-5 hidden group-hover:flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
            {note.content && (
              <RichContent
                html={note.content}
                className="kanso-timeline-preview kanso-timeline-preview-faded line-clamp-3 text-xs"
                fade
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
          className="rounded-xl border border-dashed py-10 px-4 text-center text-xs space-y-2.5"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <Calendar className="w-5 h-5 mx-auto opacity-50" />
          <p>No events linked to {currentList.title} yet.</p>
          <button
            type="button"
            onClick={() => setAttachModalKind("events")}
            className="h-7 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <Link2 className="w-3 h-3" />
            <span>Attach existing event</span>
          </button>
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
            className="group py-2.5 px-2 -mx-2 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]/75"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Calendar
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--color-entity-blue)" }}
              />
              <span className="text-sm font-medium truncate">{ev.title}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className="text-[11px] font-mono tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                {formatCompactDayHeading(getEntryDayKey(ev))}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleLinkedEntry(ev);
                }}
                title="Unlink from list"
                aria-label="Unlink event from list"
                className="h-5 w-5 hidden group-hover:flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const quickJumpSmartItems = useMemo(() => {
    const q = quickJumpQuery.trim().toLowerCase();
    return STATUS_ORDER.filter((st) =>
      !q ? true : STATUS_META[st].label.toLowerCase().includes(q),
    );
  }, [quickJumpQuery]);

  const quickJumpLists = useMemo(() => {
    const q = quickJumpQuery.trim().toLowerCase();
    return activeLists.filter((l) =>
      !q ? true : l.title.toLowerCase().includes(q),
    );
  }, [activeLists, quickJumpQuery]);

  const activeSmartMeta =
    scope.kind === "smart" ? STATUS_META[scope.status] : null;
  const SmartHeaderIcon = activeSmartMeta?.icon;

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
                    {scopeItemsAll.length}{" "}
                    {scopeItemsAll.length === 1 ? "item" : "items"}
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
                  className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
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
                  onClick={() => setDeleteTargetList(currentList)}
                  className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
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
                  className="hidden lg:inline-flex h-8 px-2.5 rounded-lg border text-xs font-medium items-center gap-1.5 transition-colors cursor-pointer"
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
                    prefs.splitOpen ? "Hide right pane" : "Show right pane"
                  }
                  aria-pressed={prefs.splitOpen}
                >
                  <PanelRight className="w-3.5 h-3.5" />
                  <span>
                    {effectiveRightPaneMode === "inspector"
                      ? "Inspector"
                      : "Linked"}
                  </span>
                </button>
              </div>
            </>
          ) : activeSmartMeta && SmartHeaderIcon ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    color: activeSmartMeta.color,
                  }}
                >
                  <SmartHeaderIcon className="w-3.5 h-3.5" />
                </span>
                <div className="flex items-baseline gap-2.5 min-w-0">
                  <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight truncate">
                    All {activeSmartMeta.label}
                  </h1>
                  <span
                    className="text-xs font-mono tabular-nums shrink-0 hidden sm:inline"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {scopeItemsAll.length}{" "}
                    {scopeItemsAll.length === 1 ? "item" : "items"} across lists
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setPrefs((p) => ({ ...p, splitOpen: !p.splitOpen }))
                  }
                  className="hidden lg:inline-flex h-8 px-2.5 rounded-lg border text-xs font-medium items-center gap-1.5 transition-colors cursor-pointer"
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
                  aria-pressed={prefs.splitOpen}
                >
                  <PanelRight className="w-3.5 h-3.5" />
                  <span>Inspector</span>
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
                className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
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

        {/* Row 2: Quick Jump Picker + Pinned Cross-List Smart Tabs + User Lists Strip */}
        <nav
          aria-label="List collections and smart tabs"
          className="relative flex items-center gap-1 border-b px-4 sm:px-6"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {/* Quick Jump Picker Button */}
          <div className="relative shrink-0 py-1 pr-1">
            <button
              type="button"
              onClick={() => {
                setQuickJumpOpen((o) => !o);
                setQuickJumpQuery("");
              }}
              title="Quick jump to any smart view or list"
              aria-label="Quick jump to list"
              aria-expanded={quickJumpOpen}
              className="h-8 px-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              style={{
                backgroundColor: quickJumpOpen
                  ? "var(--accent-soft)"
                  : "var(--bg-surface)",
                borderColor: quickJumpOpen
                  ? "var(--accent)"
                  : "var(--border-subtle)",
                color: quickJumpOpen
                  ? "var(--accent)"
                  : "var(--text-secondary)",
              }}
            >
              <Search className="w-3 h-3" />
              <ChevronDown className="w-3 h-3 opacity-75" />
            </button>

            {quickJumpOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setQuickJumpOpen(false)}
                />
                <div
                  className="absolute left-0 top-10 z-40 w-64 rounded-2xl border overflow-hidden flex flex-col max-h-[65dvh]"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    borderColor: "var(--border-strong)",
                    boxShadow: "var(--shadow-popover)",
                  }}
                >
                  <div
                    className="p-2 border-b flex items-center gap-1.5"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <Search
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    />
                    <input
                      type="text"
                      value={quickJumpQuery}
                      onChange={(e) => setQuickJumpQuery(e.target.value)}
                      placeholder="Jump to list or status..."
                      autoFocus
                      className="flex-1 min-w-0 bg-transparent text-xs outline-none"
                      style={{ color: "var(--text-primary)" }}
                    />
                  </div>
                  <div className="overflow-y-auto p-1.5 space-y-2">
                    {quickJumpSmartItems.length > 0 && (
                      <div className="space-y-0.5">
                        <div
                          className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Across All Lists
                        </div>
                        {quickJumpSmartItems.map((st) => {
                          const sm = STATUS_META[st];
                          const Icon = sm.icon;
                          const active =
                            scope.kind === "smart" && scope.status === st;
                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() => {
                                setLocalState((prev) => ({
                                  ...prev,
                                  scope: { kind: "smart", status: st },
                                  tagFilter: "all",
                                  subTab: "items",
                                }));
                                setSelectedIds(new Set());
                                setQuickJumpOpen(false);
                              }}
                              className="w-full px-2 py-1.5 rounded-lg flex items-center justify-between gap-2 text-xs font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
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
                                <Icon
                                  className="w-3.5 h-3.5 shrink-0"
                                  style={{ color: sm.color }}
                                />
                                <span className="truncate">{sm.label}</span>
                              </span>
                              <span
                                className="font-mono text-[11px]"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {globalStatusCounts[st]}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {quickJumpLists.length > 0 && (
                      <div className="space-y-0.5">
                        <div
                          className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Lists
                        </div>
                        {quickJumpLists.map((list) => {
                          const active =
                            scope.kind === "list" && scope.listId === list.id;
                          const color = list.color || "#4f46e5";
                          return (
                            <button
                              key={list.id}
                              type="button"
                              onClick={() => {
                                setLocalState((prev) => ({
                                  ...prev,
                                  scope: { kind: "list", listId: list.id },
                                  statusFilter: "all",
                                  tagFilter: "all",
                                }));
                                setSelectedIds(new Set());
                                setQuickJumpOpen(false);
                              }}
                              className="w-full px-2 py-1.5 rounded-lg flex items-center justify-between gap-2 text-xs font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
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
                                  name={list.icon}
                                  className="w-3.5 h-3.5 shrink-0"
                                  style={{ color }}
                                />
                                <span className="truncate">{list.title}</span>
                              </span>
                              <span
                                className="font-mono text-[11px]"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {listItemCountsByCollection.get(list.id) || 0}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Horizontally Scrollable Smart Tabs + Lists */}
          <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {/* 5 Pinned Cross-List Smart Tabs */}
            {STATUS_ORDER.map((st) => {
              const sm = STATUS_META[st];
              const Icon = sm.icon;
              const active = scope.kind === "smart" && scope.status === st;
              return (
                <button
                  key={`smart-${st}`}
                  type="button"
                  onClick={() => {
                    setLocalState((prev) => ({
                      ...prev,
                      scope: { kind: "smart", status: st },
                      tagFilter: "all",
                      subTab: "items",
                    }));
                    setSelectedIds(new Set());
                  }}
                  className="h-10 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium shrink-0 border-b-2 transition-all whitespace-nowrap cursor-pointer"
                  style={{
                    borderColor: active ? "var(--accent)" : "transparent",
                    color: active
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                    backgroundColor: active
                      ? "var(--accent-soft)"
                      : "transparent",
                  }}
                  title={`All ${sm.label} items across lists`}
                >
                  <Icon
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: sm.color }}
                  />
                  <span className={active ? "font-semibold" : ""}>
                    {sm.label}
                  </span>
                  <span
                    className="font-mono tabular-nums text-[11px] opacity-70"
                    style={{
                      color: active ? "var(--accent)" : "var(--text-muted)",
                    }}
                  >
                    {globalStatusCounts[st]}
                  </span>
                </button>
              );
            })}

            <span
              aria-hidden="true"
              className="h-5 w-px shrink-0 mx-1.5"
              style={{ backgroundColor: "var(--border-strong)" }}
            />

            {/* Draggable User List Collection Tabs */}
            {activeLists.map((list) => {
              const active = scope.kind === "list" && scope.listId === list.id;
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
                      if (scope.kind === "list" && list.id === scope.listId)
                        return;
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
                      if (
                        !itemId ||
                        (scope.kind === "list" && list.id === scope.listId)
                      ) {
                        return;
                      }
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
                    setLocalState((prev) => ({
                      ...prev,
                      scope: { kind: "list", listId: list.id },
                      statusFilter: "all",
                      tagFilter: "all",
                    }));
                    setSelectedIds(new Set());
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
              className="h-8 px-2.5 ml-1 my-1 rounded-lg text-xs font-medium inline-flex items-center gap-1 shrink-0 transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
              title="Create new list collection"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>
        </nav>

        {/* Row 3: Status Counts & Linked Context Triggers (shown for concrete lists) */}
        {currentList && (
          <div
            className="flex items-center justify-between gap-3 px-4 sm:px-6 py-1.5 border-b overflow-x-auto no-scrollbar"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            {/* Left: Status Counts */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setLocalState((prev) => ({
                    ...prev,
                    statusFilter: "all",
                    subTab: "items",
                  }))
                }
                className="h-7 px-2 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                style={{
                  backgroundColor:
                    localState.subTab === "items" &&
                    localState.statusFilter === "all"
                      ? "var(--bg-surface)"
                      : "transparent",
                  color:
                    localState.subTab === "items" &&
                    localState.statusFilter === "all"
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                }}
              >
                <span>All</span>
                <span className="font-mono tabular-nums text-[11px] opacity-75">
                  {scopeItemsAll.length}
                </span>
              </button>

              {STATUS_ORDER.map((st) => {
                const sm = STATUS_META[st];
                const active =
                  localState.subTab === "items" &&
                  localState.statusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() =>
                      setLocalState((prev) => ({
                        ...prev,
                        subTab: "items",
                        statusFilter: prev.statusFilter === st ? "all" : st,
                      }))
                    }
                    className="h-7 px-2 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface)]/60 cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? "var(--accent-soft)"
                        : "transparent",
                      color: active ? "var(--accent)" : "var(--text-secondary)",
                    }}
                  >
                    <span>{sm.chipLabel}</span>
                    <span className="font-mono tabular-nums text-[11px] opacity-75">
                      {scopeStatusCounts[st]}
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
                onClick={() => {
                  handleSelectContextTab("notes");
                  if (isDesktop && !prefs.splitOpen) {
                    setPrefs((p) => ({ ...p, splitOpen: true }));
                  }
                }}
                className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface)]/60 cursor-pointer"
                style={{
                  backgroundColor:
                    (splitVisible &&
                      effectiveRightPaneMode === "linked" &&
                      localState.contextTab === "notes") ||
                    (!splitVisible && localState.subTab === "notes")
                      ? "var(--accent-soft)"
                      : "transparent",
                  color:
                    (splitVisible &&
                      effectiveRightPaneMode === "linked" &&
                      localState.contextTab === "notes") ||
                    (!splitVisible && localState.subTab === "notes")
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
                onClick={() => {
                  handleSelectContextTab("events");
                  if (isDesktop && !prefs.splitOpen) {
                    setPrefs((p) => ({ ...p, splitOpen: true }));
                  }
                }}
                className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface)]/60 cursor-pointer"
                style={{
                  backgroundColor:
                    (splitVisible &&
                      effectiveRightPaneMode === "linked" &&
                      localState.contextTab === "events") ||
                    (!splitVisible && localState.subTab === "events")
                      ? "var(--accent-soft)"
                      : "transparent",
                  color:
                    (splitVisible &&
                      effectiveRightPaneMode === "linked" &&
                      localState.contextTab === "events") ||
                    (!splitVisible && localState.subTab === "events")
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
      {!currentList && !isSmartScope ? (
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
              className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
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
          {/* LEFT PRIMARY PANE */}
          <section className="flex-1 min-w-0 overflow-y-auto overscroll-none px-4 sm:px-6 py-4 space-y-4">
            {/* TRACKED ITEMS */}
            {(splitVisible || localState.subTab === "items") && (
              <>
                {/* Smart Quick-Add Bar (URL auto-attach + natural date + #tags) */}
                {(currentList || (isSmartScope && activeLists.length > 0)) && (
                  <NlpInputBar
                    placeholder={
                      currentList
                        ? `Add to ${currentList.title} (paste URL, due tomorrow, #tag)...`
                        : `Add to ${STATUS_META[scope.kind === "smart" ? scope.status : "inbox"].label} (paste URL, due tomorrow, #tag)...`
                    }
                    onSubmit={(raw) => {
                      if (scope.kind === "smart") {
                        const targetId =
                          smartAddTargetListId || activeLists[0]?.id;
                        if (!targetId) return false;
                        return Boolean(
                          addListItem(targetId, raw, scope.status),
                        );
                      }
                      return Boolean(
                        addListItem(
                          scope.listId,
                          raw,
                          localState.statusFilter === "all"
                            ? "inbox"
                            : localState.statusFilter,
                        ),
                      );
                    }}
                    leadingSlot={
                      isSmartScope && activeLists.length > 0 ? (
                        <select
                          value={smartAddTargetListId}
                          onChange={(e) =>
                            setSmartAddTargetListId(e.target.value)
                          }
                          aria-label="Target list"
                          className="h-7 px-2 rounded-lg border text-xs font-medium outline-none max-w-[140px] cursor-pointer"
                          style={{
                            backgroundColor: "var(--bg-surface-subtle)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {activeLists.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.title}
                            </option>
                          ))}
                        </select>
                      ) : undefined
                    }
                    parseUrls
                    availableTags={scopeUniqueTags}
                    submitLabel="Add"
                    compact
                    previewPosition="bottom"
                    showTimeblockTip={false}
                  />
                )}

                {/* Desktop Filter / ViewMode / Multi-Select Bar */}
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border flex-1 min-w-[150px]"
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
                        className="opacity-70 hover:opacity-100 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Mobile Filters Sheet Trigger */}
                  <button
                    type="button"
                    onClick={() => setMobileFilterOpen(true)}
                    className="lg:hidden h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor:
                        activeMobileFilterCount > 0
                          ? "var(--accent-soft)"
                          : "var(--bg-surface)",
                      borderColor:
                        activeMobileFilterCount > 0
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                      color:
                        activeMobileFilterCount > 0
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                    }}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Filters</span>
                    {activeMobileFilterCount > 0 && (
                      <span className="font-mono text-[11px]">
                        {activeMobileFilterCount}
                      </span>
                    )}
                  </button>

                  {/* Desktop View Mode: Stacked / Grid / Compact / Board */}
                  <div
                    className="hidden lg:inline-flex items-center h-8 p-0.5 rounded-lg border"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    {(
                      [
                        { id: "stacked", icon: ListIcon, label: "Quiet rows" },
                        { id: "grid", icon: LayoutGrid, label: "Grid cards" },
                        { id: "compact", icon: Rows3, label: "Compact rows" },
                        { id: "board", icon: Columns3, label: "Kanban board" },
                      ] as {
                        id: ListsViewMode;
                        icon: React.ComponentType<{ className?: string }>;
                        label: string;
                      }[]
                    ).map((vm) => {
                      const Icon = vm.icon;
                      const active = activeLayout.viewMode === vm.id;
                      return (
                        <button
                          key={vm.id}
                          type="button"
                          onClick={() =>
                            updateActiveLayout({ viewMode: vm.id })
                          }
                          title={vm.label}
                          aria-label={vm.label}
                          className="h-6.5 w-7 flex items-center justify-center rounded-md cursor-pointer"
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

                  {/* Desktop Group By & Then By (hidden in Kanban board mode since columns define grouping) */}
                  {activeLayout.viewMode !== "board" && (
                    <>
                      <select
                        value={activeLayout.groupBy}
                        onChange={(e) =>
                          updateActiveLayout({
                            groupBy: e.target.value as ListsGroupBy,
                          })
                        }
                        aria-label="Group by"
                        className="hidden lg:block h-8 px-2.5 rounded-lg border text-xs outline-none cursor-pointer"
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

                      {activeLayout.groupBy !== "none" && (
                        <select
                          value={activeLayout.thenBy}
                          onChange={(e) =>
                            updateActiveLayout({
                              thenBy: e.target.value as ListsGroupBy,
                            })
                          }
                          aria-label="Then by"
                          className="hidden lg:block h-8 px-2.5 rounded-lg border text-xs outline-none cursor-pointer"
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          <option value="none">Then: None</option>
                          {activeLayout.groupBy !== "tag" && (
                            <option value="tag">Then: Tag</option>
                          )}
                          {activeLayout.groupBy !== "status" && (
                            <option value="status">Then: Status</option>
                          )}
                        </select>
                      )}
                    </>
                  )}

                  {/* Desktop Sort Selector + Custom Order Toggle */}
                  <div className="hidden lg:flex items-center gap-1">
                    <select
                      value={activeLayout.sortBy}
                      onChange={(e) =>
                        updateActiveLayout({
                          sortBy: e.target.value as ListsSortMode,
                        })
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
                        updateActiveLayout({
                          sortBy: isCustomSort ? "newest" : "custom",
                        })
                      }
                      title={
                        isCustomSort
                          ? "Custom order active — drag items to rearrange"
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

                  {/* Multi-select Toggle Button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (selectionMode || selectedIds.size > 0) {
                        setSelectionMode(false);
                        setSelectedIds(new Set());
                        setBulkTagOpen(false);
                      } else {
                        setSelectionMode(true);
                      }
                    }}
                    title="Select multiple items for bulk actions"
                    aria-label="Toggle multi-select mode"
                    aria-pressed={selectionMode || selectedIds.size > 0}
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    style={{
                      backgroundColor:
                        selectionMode || selectedIds.size > 0
                          ? "var(--accent-soft)"
                          : "var(--bg-surface)",
                      borderColor:
                        selectionMode || selectedIds.size > 0
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                      color:
                        selectionMode || selectedIds.size > 0
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                    }}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Select</span>
                  </button>
                </div>

                {/* Multi-Select Bulk Action Bar */}
                {(selectionMode || selectedIds.size > 0) && (
                  <div
                    className="rounded-xl border px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                    style={{
                      backgroundColor: "var(--bg-surface-subtle)",
                      borderColor: "var(--accent)",
                    }}
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="font-semibold font-mono tabular-nums"
                        style={{ color: "var(--accent)" }}
                      >
                        {selectedIds.size} selected
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            selectedIds.size === filteredItems.length &&
                            filteredItems.length > 0
                          ) {
                            setSelectedIds(new Set());
                          } else {
                            setSelectedIds(
                              new Set(filteredItems.map((i) => i.id)),
                            );
                          }
                        }}
                        className="px-2 py-0.5 rounded-md hover:bg-[var(--bg-surface-hover)] font-medium cursor-pointer"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {selectedIds.size === filteredItems.length &&
                        filteredItems.length > 0
                          ? "Clear"
                          : `Select all (${filteredItems.length})`}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value=""
                        disabled={selectedIds.size === 0}
                        onChange={(e) => {
                          if (e.target.value) {
                            handleBulkStatus(e.target.value as ListItemStatus);
                          }
                        }}
                        aria-label="Bulk set status"
                        className="h-7 px-2 rounded-lg border text-xs outline-none disabled:opacity-45 cursor-pointer"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <option value="">Set status…</option>
                        {STATUS_ORDER.map((st) => (
                          <option key={st} value={st}>
                            {STATUS_META[st].label}
                          </option>
                        ))}
                      </select>

                      {activeLists.length > 1 && (
                        <select
                          value=""
                          disabled={selectedIds.size === 0}
                          onChange={(e) => {
                            if (e.target.value) {
                              handleBulkMoveList(e.target.value);
                            }
                          }}
                          aria-label="Bulk move to list"
                          className="h-7 px-2 rounded-lg border text-xs outline-none disabled:opacity-45 cursor-pointer"
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-primary)",
                          }}
                        >
                          <option value="">Move to list…</option>
                          {activeLists.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.title}
                            </option>
                          ))}
                        </select>
                      )}

                      {bulkTagOpen ? (
                        <form
                          onSubmit={handleBulkAddTag}
                          className="inline-flex items-center gap-1"
                        >
                          <input
                            type="text"
                            value={bulkTagInput}
                            onChange={(e) => setBulkTagInput(e.target.value)}
                            placeholder="tag"
                            autoFocus
                            className="h-7 w-24 px-2 rounded-lg border text-xs font-mono outline-none"
                            style={{
                              backgroundColor: "var(--bg-surface)",
                              borderColor: "var(--accent)",
                              color: "var(--text-primary)",
                            }}
                          />
                          <button
                            type="submit"
                            className="h-7 px-2 rounded-lg text-xs font-semibold cursor-pointer"
                            style={{
                              backgroundColor: "var(--accent)",
                              color: "var(--accent-fg)",
                            }}
                          >
                            Add
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          disabled={selectedIds.size === 0}
                          onClick={() => setBulkTagOpen(true)}
                          className="h-7 px-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1 disabled:opacity-45 cursor-pointer"
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          <Tag className="w-3 h-3" />
                          <span>Tag</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={selectedIds.size === 0}
                        onClick={handleBulkDelete}
                        className="h-7 px-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1 disabled:opacity-45 cursor-pointer"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--danger)",
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectionMode(false);
                          setSelectedIds(new Set());
                          setBulkTagOpen(false);
                        }}
                        className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                        aria-label="Exit selection mode"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Conditional Tag Filter Band */}
                {scopeUniqueTags.length >= 2 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setLocalState((prev) => ({
                          ...prev,
                          tagFilter: "all",
                        }))
                      }
                      className="h-6 px-2 rounded-md text-xs font-mono transition-colors cursor-pointer"
                      style={{
                        backgroundColor:
                          localState.tagFilter === "all"
                            ? "var(--accent-soft)"
                            : "transparent",
                        color:
                          localState.tagFilter === "all"
                            ? "var(--accent)"
                            : "var(--text-muted)",
                      }}
                    >
                      All tags
                    </button>
                    {scopeUniqueTags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setLocalState((prev) => ({
                            ...prev,
                            tagFilter: prev.tagFilter === t ? "all" : t,
                          }))
                        }
                        className="h-6 px-2 rounded-md text-xs font-mono transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                        style={{
                          backgroundColor:
                            localState.tagFilter === t
                              ? "var(--accent-soft)"
                              : "transparent",
                          color:
                            localState.tagFilter === t
                              ? "var(--accent)"
                              : "var(--text-muted)",
                        }}
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}

                {/* Main Items Display: Kanban Board vs Grouped List/Grid */}
                {activeLayout.viewMode === "board" ? (
                  <ListKanbanBoard
                    columns={kanbanColumns}
                    droppedCollapsed={localState.droppedCollapsed}
                    onToggleDroppedCollapsed={() =>
                      setLocalState((prev) => ({
                        ...prev,
                        droppedCollapsed: !prev.droppedCollapsed,
                      }))
                    }
                    draggingItemId={draggingItemId}
                    itemDropTarget={itemDropTarget}
                    onClearDragStates={clearAllDragStates}
                    onDropOnColumn={handleDropOnKanbanColumn}
                    onDropOnItem={handleDropItemOnItem}
                    onInlineAddInColumn={handleInlineAddInKanbanColumn}
                    renderCard={(item) => renderCard(item, true)}
                  />
                ) : filteredItems.length === 0 ? (
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
                      const groupKey = `${scopeKey}:${group.key}`;
                      const collapsed = Boolean(
                        localState.collapsedGroups[groupKey],
                      );
                      const isStatusGroup =
                        !isSmartScope && activeLayout.groupBy === "status";
                      const statusKey = isStatusGroup
                        ? (group.key as ListItemStatus)
                        : null;
                      const isStatusDropHover =
                        isStatusGroup &&
                        statusKey !== null &&
                        statusGroupDropTarget === statusKey;

                      const gridClassName = splitVisible
                        ? "grid grid-cols-1 md:grid-cols-2 gap-3"
                        : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3";

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
                                if (el)
                                  statusDropZoneRefs.current.set(statusKey, el);
                                else
                                  statusDropZoneRefs.current.delete(statusKey);
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
                                setLocalState((prev) => ({
                                  ...prev,
                                  collapsedGroups: {
                                    ...prev.collapsedGroups,
                                    [groupKey]:
                                      !prev.collapsedGroups[groupKey],
                                  },
                                }))
                              }
                              className={`flex items-center gap-1.5 text-xs font-semibold py-1 px-1.5 -mx-1.5 rounded-lg transition-colors cursor-pointer ${
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
                                        activeLayout.viewMode === "grid"
                                          ? gridClassName
                                          : "divide-y border-y"
                                      }
                                      style={
                                        activeLayout.viewMode === "grid"
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
                                  activeLayout.viewMode === "grid"
                                    ? gridClassName
                                    : "divide-y border-y"
                                }
                                style={
                                  activeLayout.viewMode === "grid"
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
            {!splitVisible &&
              currentList &&
              localState.subTab === "notes" && (
                <div className="space-y-3 pb-8">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Linked Notes ({linkedNotes.length})
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAttachModalKind("notes")}
                        className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Attach</span>
                      </button>
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
                        className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: "var(--accent)",
                          color: "var(--accent-fg)",
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>New Note</span>
                      </button>
                    </div>
                  </div>
                  {renderLinkedNotesContent(false)}
                </div>
              )}

            {/* MOBILE / COLLAPSED-SPLIT LINKED EVENTS */}
            {!splitVisible &&
              currentList &&
              localState.subTab === "events" && (
                <div className="space-y-3 pb-8">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Linked Events ({linkedEvents.length})
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAttachModalKind("events")}
                        className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Attach</span>
                      </button>
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
                        className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: "var(--accent)",
                          color: "var(--accent-fg)",
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>New Event</span>
                      </button>
                    </div>
                  </div>
                  {renderLinkedEventsContent()}
                </div>
              )}
          </section>

          {/* DESKTOP RIGHT SPLIT PANE: Toggles smoothly between Item Inspector & Linked Notes/Events */}
          {splitVisible && (
            <aside
              aria-label="List item inspector and linked notes"
              className="hidden lg:flex lg:flex-col w-80 xl:w-[400px] shrink-0 border-l overflow-hidden"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-canvas)",
              }}
            >
              {/* Mode Toggle Header */}
              {currentList && (
                <div
                  className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b"
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
                      onClick={() =>
                        setLocalState((prev) => ({
                          ...prev,
                          rightPaneMode: "inspector",
                        }))
                      }
                      className="h-6.5 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
                      style={{
                        backgroundColor:
                          effectiveRightPaneMode === "inspector"
                            ? "var(--accent-soft)"
                            : "transparent",
                        color:
                          effectiveRightPaneMode === "inspector"
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                      }}
                    >
                      Item
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLocalState((prev) => ({
                          ...prev,
                          rightPaneMode: "linked",
                        }))
                      }
                      className="h-6.5 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                      style={{
                        backgroundColor:
                          effectiveRightPaneMode === "linked"
                            ? "var(--accent-soft)"
                            : "transparent",
                        color:
                          effectiveRightPaneMode === "linked"
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                      }}
                    >
                      <span>Linked</span>
                      <span className="font-mono text-[11px] opacity-75">
                        {linkedNotes.length + linkedEvents.length}
                      </span>
                    </button>
                  </div>

                  {effectiveRightPaneMode === "linked" && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setAttachModalKind(localState.contextTab)
                        }
                        title="Attach existing note or event"
                        className="h-7 px-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <Link2 className="w-3 h-3" />
                        <span>Attach</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          localState.contextTab === "notes"
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
                        className="h-7 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: "var(--accent)",
                          color: "var(--accent-fg)",
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>
                          {localState.contextTab === "notes" ? "Note" : "Event"}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Pane Content */}
              {effectiveRightPaneMode === "inspector" ? (
                selectedInspectorItem ? (
                  <ListItemInspector
                    key={selectedInspectorItem.id}
                    item={selectedInspectorItem}
                    lists={activeLists}
                    sameListTags={scopeUniqueTags}
                    onClose={() =>
                      setLocalState((prev) => ({
                        ...prev,
                        selectedItemId: null,
                      }))
                    }
                    onOpenModal={(itemId) =>
                      onOpenDetail({ mode: "list_item", id: itemId })
                    }
                    onJumpToBookLocation={onJumpToBookLocation}
                  />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2.5">
                    <ListIcon
                      className="w-6 h-6 opacity-40"
                      style={{ color: "var(--text-muted)" }}
                    />
                    <p
                      className="text-xs font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Select an item to inspect
                    </p>
                    <p
                      className="text-xs max-w-[230px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Click any row or card to edit its details, URL, tags, and
                      rich notes inline.
                    </p>
                  </div>
                )
              ) : (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  {/* Notes / Events Sub-Switch */}
                  <div
                    className="px-4 py-2 border-b flex items-center gap-1.5 shrink-0"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setLocalState((prev) => ({
                          ...prev,
                          contextTab: "notes",
                        }))
                      }
                      className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                      style={{
                        backgroundColor:
                          localState.contextTab === "notes"
                            ? "var(--accent-soft)"
                            : "transparent",
                        color:
                          localState.contextTab === "notes"
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                      }}
                    >
                      <span>Notes</span>
                      <span className="font-mono text-[11px] opacity-75">
                        {linkedNotes.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLocalState((prev) => ({
                          ...prev,
                          contextTab: "events",
                        }))
                      }
                      className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                      style={{
                        backgroundColor:
                          localState.contextTab === "events"
                            ? "var(--accent-soft)"
                            : "transparent",
                        color:
                          localState.contextTab === "events"
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                      }}
                    >
                      <span>Events</span>
                      <span className="font-mono text-[11px] opacity-75">
                        {linkedEvents.length}
                      </span>
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-3.5">
                    {localState.contextTab === "notes"
                      ? renderLinkedNotesContent(true)
                      : renderLinkedEventsContent()}
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>
      )}

      {/* Safe List Delete Confirmation Modal */}
      <DeleteListConfirmModal
        list={deleteTargetList}
        itemCount={
          deleteTargetList
            ? listItemCountsByCollection.get(deleteTargetList.id) || 0
            : 0
        }
        otherLists={
          deleteTargetList
            ? activeLists.filter((l) => l.id !== deleteTargetList.id)
            : []
        }
        onCancel={() => setDeleteTargetList(null)}
        onDelete={(moveToId) => {
          if (!deleteTargetList) return;
          deleteList(deleteTargetList.id, moveToId);
          setDeleteTargetList(null);
        }}
      />

      {/* Attach Existing Notes / Events Modal */}
      <AttachLinkedEntriesModal
        open={Boolean(attachModalKind && currentList)}
        kind={attachModalKind || "notes"}
        list={currentList}
        entries={attachModalCandidates}
        onToggleEntry={handleToggleLinkedEntry}
        onClose={() => setAttachModalKind(null)}
      />

      {/* Mobile Slide-Up Filter & Layout Sheet */}
      <MobileListsFilterSheet
        open={mobileFilterOpen}
        onClose={() => setMobileFilterOpen(false)}
        isSmartScope={isSmartScope}
        viewMode={activeLayout.viewMode}
        groupBy={activeLayout.groupBy}
        thenBy={activeLayout.thenBy}
        sortBy={activeLayout.sortBy}
        statusFilter={localState.statusFilter}
        tagFilter={localState.tagFilter}
        uniqueTags={scopeUniqueTags}
        statusOptions={STATUS_ORDER.map((st) => ({
          id: st,
          label: STATUS_META[st].label,
          count: scopeStatusCounts[st],
        }))}
        onChangeViewMode={(vm) => updateActiveLayout({ viewMode: vm })}
        onChangeGroupBy={(gb) => updateActiveLayout({ groupBy: gb })}
        onChangeThenBy={(tb) => updateActiveLayout({ thenBy: tb })}
        onChangeSortBy={(sb) => updateActiveLayout({ sortBy: sb })}
        onChangeStatusFilter={(st) =>
          setLocalState((prev) => ({ ...prev, statusFilter: st }))
        }
        onChangeTagFilter={(tag) =>
          setLocalState((prev) => ({ ...prev, tagFilter: tag }))
        }
        onResetFilters={() => {
          setLocalState((prev) => ({
            ...prev,
            statusFilter: "all",
            tagFilter: "all",
          }));
          updateActiveLayout({
            groupBy: isSmartScope ? "none" : "status",
            thenBy: "none",
            sortBy: "custom",
          });
        }}
      />

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
                className="h-7 w-7 flex items-center justify-center rounded-md cursor-pointer"
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
                    className="h-8 rounded-lg border text-xs capitalize font-medium cursor-pointer"
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
                    className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
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
                    className="h-8 w-8 flex items-center justify-center rounded-lg border cursor-pointer"
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
                className="h-8 px-3 rounded-lg border text-xs font-medium cursor-pointer"
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
                className="h-8 px-3.5 rounded-lg text-xs font-semibold disabled:opacity-40 cursor-pointer"
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
