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
  FolderPlus,
  Globe,
  GripVertical,
  Inbox,
  LayoutGrid,
  Link2,
  List as ListIcon,
  MoreVertical,
  PanelLeftOpen,
  PanelRight,
  PauseCircle,
  Pencil,
  Play,
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
  ListIcon as CollectionIcon,
} from "../components/IconLibrary";
import { IconPicker } from "../components/IconPicker";
import { ListsCaptureBar } from "../components/lists/ListsCaptureBar";
import { RichContent } from "../components/RichContent";
import { ListItemInspector } from "../components/lists/ListItemInspector";
import { ListItemTabEditor } from "../components/lists/ListItemTabEditor";
import { ListsTabStrip } from "../components/lists/ListsTabStrip";
import { TargetListPickerModal } from "../components/lists/TargetListPickerModal";
import { DeleteListItemsConfirmModal } from "../components/lists/DeleteListItemsConfirmModal";
import {
  buildKanbanColumnsForList,
  buildKanbanColumnsForSmartTab,
  buildKanbanColumnsForSublists,
  KanbanColumnDef,
  ListKanbanBoard,
} from "../components/lists/ListKanbanBoard";
import {
  SublistFilterValue,
  SublistTabStrip,
} from "../components/lists/SublistTabStrip";
import {
  buildListTreeIndex,
  computeRecursiveListCounts,
  flattenListTree,
  formatIndentedListOptionLabel,
  getDescendantListIds,
  getDirectChildBranchId,
  getListAncestors,
} from "../lib/listTree";
import {
  DEFAULT_LISTS_SIDEBAR_WIDTH,
  ListsLeftSidebar,
  ListsWorkspaceTab,
  MAX_LISTS_SIDEBAR_WIDTH,
  MIN_LISTS_SIDEBAR_WIDTH,
} from "../components/lists/ListsLeftSidebar";
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
  ListItemJumpRequest,
  ListItemStatus,
} from "../types";
import {
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
import {
  formatCourseResumeLabel,
  removeCoursePlaybackProgress,
  useCoursePlaybackProgress,
} from "../utils/coursePlaybackProgress";
import { useListItemCover } from "../utils/listItemCovers";
import { countLinkedNotesForListItems } from "../utils/listItemLinks";
import { extractUrlFromListInput } from "../utils/nlp";
import { VIEW_PREFERENCE_SYNC_EVENT } from "../utils/viewPreferences";
import {
  fetchYouTubeCourseMetadata,
  parseYouTubeCourseUrl,
} from "../utils/youtube";

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
  openTabIds: string[];
  activeTabId: string | null;
  collapsedGroups: Record<string, boolean>;
  droppedCollapsed: boolean;
  perListLayout: Record<string, LayoutConfig>;
  sidebarWidth: number;
  sidebarCollapsedDesktop: boolean;
  sidebarSectionsCollapsed: { smart: boolean; lists: boolean };
  expandedListIds: Record<string, boolean>;
  sublistFilterByScope: Record<string, SublistFilterValue>;
  boardByByScope: Record<string, "status" | "sublist">;
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
    openTabIds: [],
    activeTabId: null,
    collapsedGroups: {},
    droppedCollapsed: true,
    perListLayout: {},
    sidebarWidth: DEFAULT_LISTS_SIDEBAR_WIDTH,
    sidebarCollapsedDesktop: false,
    sidebarSectionsCollapsed: { smart: false, lists: false },
    expandedListIds: {},
    sublistFilterByScope: {},
    boardByByScope: {},
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

    const rawWidth =
      typeof parsed.sidebarWidth === "number" &&
      Number.isFinite(parsed.sidebarWidth)
        ? Math.min(
            MAX_LISTS_SIDEBAR_WIDTH,
            Math.max(MIN_LISTS_SIDEBAR_WIDTH, parsed.sidebarWidth),
          )
        : DEFAULT_LISTS_SIDEBAR_WIDTH;

    const openTabIds = Array.isArray(parsed.openTabIds)
      ? Array.from(
          new Set(
            parsed.openTabIds.filter(
              (id): id is string => typeof id === "string" && id.length > 0,
            ),
          ),
        )
      : [];
    const activeTabId =
      typeof parsed.activeTabId === "string" &&
      openTabIds.includes(parsed.activeTabId)
        ? parsed.activeTabId
        : null;

    return {
      ...defaults,
      ...parsed,
      scope: validScope,
      openTabIds,
      activeTabId,
      sidebarWidth: rawWidth,
      sidebarCollapsedDesktop: Boolean(parsed.sidebarCollapsedDesktop),
      sidebarSectionsCollapsed:
        parsed.sidebarSectionsCollapsed &&
        typeof parsed.sidebarSectionsCollapsed === "object"
          ? {
              smart: Boolean(parsed.sidebarSectionsCollapsed.smart),
              lists: Boolean(parsed.sidebarSectionsCollapsed.lists),
            }
          : defaults.sidebarSectionsCollapsed,
      collapsedGroups:
        parsed.collapsedGroups && typeof parsed.collapsedGroups === "object"
          ? parsed.collapsedGroups
          : {},
      perListLayout:
        parsed.perListLayout && typeof parsed.perListLayout === "object"
          ? parsed.perListLayout
          : {},
      expandedListIds:
        parsed.expandedListIds && typeof parsed.expandedListIds === "object"
          ? parsed.expandedListIds
          : {},
      sublistFilterByScope:
        parsed.sublistFilterByScope &&
        typeof parsed.sublistFilterByScope === "object"
          ? parsed.sublistFilterByScope
          : {},
      boardByByScope:
        parsed.boardByByScope && typeof parsed.boardByByScope === "object"
          ? parsed.boardByByScope
          : {},
    };
  } catch {
    return defaults;
  }
}

const CourseGridThumbnail: React.FC<{
  src: string | null;
  alt: string;
  isPlaylist: boolean;
  isDone?: boolean;
}> = ({ src, alt, isPlaylist, isDone = false }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
        className={`w-full h-full object-cover transition-all duration-200 group-hover/thumb:scale-[1.02] ${
          isDone ? "opacity-60 grayscale-[60%]" : ""
        }`}
      />
    );
  }
  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center gap-1 text-xs font-medium ${
        isDone ? "opacity-60 grayscale-[60%]" : ""
      }`}
      style={{
        background:
          "linear-gradient(135deg, var(--bg-surface-subtle), var(--accent-soft))",
        color: "var(--text-secondary)",
      }}
    >
      <Play className="w-5 h-5" style={{ color: "var(--accent)" }} />
      <span>{isPlaylist ? "YouTube Playlist" : "YouTube Course"}</span>
    </div>
  );
};

const ListCardTopRegion: React.FC<{
  item: ListItem;
  inBoard: boolean;
  isDone: boolean;
  ytCourseInfo: ReturnType<typeof parseYouTubeCourseUrl>;
  resumeLabel: string | null;
  onPlayYouTube: () => void;
  dueDateDisplay: { label: string; isOverdue: boolean } | null;
  showCheckbox: boolean;
  isChecked: boolean;
  onToggleSelection: () => void;
  dragHandle: React.ReactNode;
  statusButton: React.ReactNode;
  onOpenMenu: (e: React.MouseEvent) => void;
  bottomChips: React.ReactNode;
}> = ({
  item,
  inBoard,
  isDone,
  ytCourseInfo,
  resumeLabel,
  onPlayYouTube,
  dueDateDisplay,
  showCheckbox,
  isChecked,
  onToggleSelection,
  dragHandle,
  statusButton,
  onOpenMenu,
  bottomChips,
}) => {
  const { src } = useListItemCover(item);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const showYouTubeCover = !inBoard && Boolean(ytCourseInfo) && !item.coverUrl;
  const showImageCover =
    !inBoard &&
    (!ytCourseInfo || Boolean(item.coverUrl)) &&
    Boolean(src && failedSrc !== src);
  const hasTopCover = showYouTubeCover || showImageCover;

  const renderDueBadge = (overlay: boolean) => {
    if (!dueDateDisplay) return null;
    return (
      <span
        className={`pointer-events-none inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-mono tabular-nums leading-none ${
          overlay
            ? "absolute top-2.5 right-3 z-10 backdrop-blur-sm shadow-sm"
            : "shrink-0"
        }`}
        style={{
          backgroundColor: dueDateDisplay.isOverdue
            ? overlay
              ? "color-mix(in srgb, var(--danger) 16%, color-mix(in srgb, var(--bg-elevated) 90%, transparent))"
              : "color-mix(in srgb, var(--danger) 10%, var(--bg-surface))"
            : overlay
              ? "color-mix(in srgb, var(--bg-elevated) 88%, transparent)"
              : "var(--bg-surface-subtle)",
          borderColor: dueDateDisplay.isOverdue
            ? "color-mix(in srgb, var(--danger) 40%, transparent)"
            : "var(--border-subtle)",
          color: dueDateDisplay.isOverdue
            ? "var(--danger)"
            : "var(--text-secondary)",
        }}
        title={`Due Date: ${dueDateDisplay.label}`}
      >
        <Calendar className="w-2.5 h-2.5 shrink-0 opacity-80" />
        <span>{dueDateDisplay.label}</span>
      </span>
    );
  };

  return (
    <>
      {!inBoard && hasTopCover && renderDueBadge(true)}

      {showYouTubeCover && ytCourseInfo && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onPlayYouTube();
          }}
          className="relative aspect-video w-full rounded-lg overflow-hidden border group/thumb cursor-pointer"
          style={{
            backgroundColor: "var(--bg-surface-subtle)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <CourseGridThumbnail
            src={ytCourseInfo.thumbnailUrl}
            alt={item.title}
            isPlaylist={ytCourseInfo.kind === "playlist"}
            isDone={isDone}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent flex items-end justify-between p-2.5">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold shadow-sm"
              style={{
                backgroundColor: "rgba(15, 23, 42, 0.85)",
                color: "#ffffff",
              }}
            >
              <Play className="w-3 h-3 ml-0.5" />
              <span>Play</span>
            </span>

            {resumeLabel && (
              <span className="px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-mono tabular-nums">
                {resumeLabel}
              </span>
            )}
          </div>
        </div>
      )}

      {showImageCover && src && (
        <div
          className="relative aspect-video w-full rounded-lg overflow-hidden border"
          style={{
            backgroundColor: "var(--bg-surface-subtle)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <img
            src={src}
            alt={item.title}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setFailedSrc(src)}
            className={`w-full h-full object-cover transition-all duration-200 ${
              isDone ? "opacity-60 grayscale-[60%]" : ""
            }`}
          />
        </div>
      )}

      <div className="space-y-2.5">
        <div className="flex items-start gap-2">
          {(showCheckbox || isChecked) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection();
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
          {statusButton}

          <div className="flex-1 min-w-0 pt-0.5">
            <div className="space-y-0.5">
              <div
                title={item.title}
                className={`text-sm font-semibold leading-snug truncate ${
                  isDone ? "line-through" : ""
                }`}
                style={{ color: "var(--text-primary)" }}
              >
                {item.title}
              </div>
              {item.subtitle && (
                <div
                  className={`text-xs line-clamp-1 ${
                    inBoard && dueDateDisplay && !bottomChips ? "pr-20" : ""
                  }`}
                  style={{ color: "var(--text-muted)" }}
                >
                  {item.subtitle}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!inBoard && !hasTopCover && renderDueBadge(false)}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenMenu(e);
              }}
              className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
              aria-label="Item actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {bottomChips}
      </div>
    </>
  );
};

interface ListsViewProps {
  onOpenDetail: (target: DetailSheetTarget) => void;
  onOpenContextMenu: (record: ContextMenuRecord, e: React.MouseEvent) => void;
  onJumpToBookLocation?: (bookLink: BookNoteLink) => void;
  onJumpToNote?: (noteId: string) => void;
  listItemJumpRequest?: ListItemJumpRequest | null;
  selectItemHandlerRef?: React.MutableRefObject<((itemId: string) => void) | null>;
  isSelectedItemRef?: React.MutableRefObject<((itemId: string) => boolean) | null>;
  openTabHandlerRef?: React.MutableRefObject<((itemId: string) => void) | null>;
}

export const ListsView: React.FC<ListsViewProps> = ({
  onOpenDetail,
  onOpenContextMenu,
  onJumpToBookLocation,
  onJumpToNote,
  listItemJumpRequest,
  selectItemHandlerRef,
  isSelectedItemRef,
  openTabHandlerRef,
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
    deleteListItems,
    reorderListItems,
    updateEntry,
  } = useWorkspace();

  const activeLists = useMemo(() => workspace.lists, [workspace.lists]);
  const listById = useMemo(
    () => new Map(activeLists.map((l) => [l.id, l])),
    [activeLists],
  );
  const bookLinksMap = useListItemBookLinks();
  const courseProgressMap = useCoursePlaybackProgress();

  // Study Tab auto-play launch handshake when Play is clicked from Lists View
  const studyPlayNonceRef = useRef(0);
  const [studyPlayLaunchRequest, setStudyPlayLaunchRequest] = useState<{
    itemId: string;
    nonce: number;
  } | null>(null);

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

  const [quickJumpOpen, setQuickJumpOpen] = useState(false);
  const [quickJumpQuery, setQuickJumpQuery] = useState("");
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [isWorkspaceTab, setIsWorkspaceTab] = useState(false);
  const [targetListPickerOpen, setTargetListPickerOpen] = useState(false);

  const [smartAddTargetListId, setSmartAddTargetListId] = useState<string>(
    () => activeLists[0]?.id || "",
  );
  const [captureStatusByScope, setCaptureStatusByScope] = useState<
    Record<string, ListItemStatus>
  >({});

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
  const [pendingBulkDeleteIds, setPendingBulkDeleteIds] = useState<string[] | null>(
    null,
  );
  const [attachModalKind, setAttachModalKind] = useState<
    "notes" | "events" | null
  >(null);
  const [listAddTargetByScope, setListAddTargetByScope] = useState<
    Record<string, string>
  >({});

  const [listModal, setListModal] = useState<{
    mode: "create" | "edit";
    list?: ListCollection;
    title: string;
    icon: string;
    color: string;
    listType: ListCollectionType;
    parentId: string | null;
  } | null>(null);

  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      setIsDesktop(mq.matches);
      if (mq.matches) {
        setIsWorkspaceTab(false);
      }
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const lastConsumedItemJumpNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!listItemJumpRequest) return;
    if (lastConsumedItemJumpNonceRef.current === listItemJumpRequest.nonce) {
      return;
    }
    lastConsumedItemJumpNonceRef.current = listItemJumpRequest.nonce;
    const targetItem = workspace.listItems.find(
      (it) => it.id === listItemJumpRequest.listItemId,
    );
    if (!targetItem) {
      pushToast("Linked list item no longer exists", "neutral");
      return;
    }

    setLocalState((prev) => ({
      ...prev,
      openTabIds: prev.openTabIds.includes(targetItem.id)
        ? prev.openTabIds
        : [...prev.openTabIds, targetItem.id],
      activeTabId: targetItem.id,
    }));
    setIsWorkspaceTab(false);
  }, [listItemJumpRequest, workspace.listItems, pushToast]);

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

  // Reconcile selectedItemId and open tabs if items are deleted
  useEffect(() => {
    const existing = new Set(workspace.listItems.map((i) => i.id));
    setLocalState((prev) => {
      const nextSelected =
        prev.selectedItemId && !existing.has(prev.selectedItemId)
          ? null
          : prev.selectedItemId;
      const filteredTabs = prev.openTabIds.filter((id) => existing.has(id));
      let nextActive = prev.activeTabId;
      if (prev.activeTabId && !existing.has(prev.activeTabId)) {
        const prevIdx = prev.openTabIds.indexOf(prev.activeTabId);
        nextActive = filteredTabs[prevIdx] ?? filteredTabs[prevIdx - 1] ?? null;
      } else if (nextActive && !filteredTabs.includes(nextActive)) {
        nextActive = null;
      }
      if (
        nextSelected === prev.selectedItemId &&
        filteredTabs.length === prev.openTabIds.length &&
        nextActive === prev.activeTabId
      ) {
        return prev;
      }
      return {
        ...prev,
        selectedItemId: nextSelected,
        openTabIds: filteredTabs,
        activeTabId: nextActive,
      };
    });
  }, [workspace.listItems]);

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

  const listItemById = useMemo(
    () => new Map(workspace.listItems.map((i) => [i.id, i])),
    [workspace.listItems],
  );

  const openTabItems = useMemo(
    () =>
      localState.openTabIds
        .map((id) => listItemById.get(id))
        .filter((it): it is ListItem => Boolean(it)),
    [localState.openTabIds, listItemById],
  );

  const activeTabItem = useMemo(
    () =>
      localState.activeTabId
        ? listItemById.get(localState.activeTabId) ?? null
        : null,
    [localState.activeTabId, listItemById],
  );

  const activeTabItemList = useMemo(
    () =>
      activeTabItem ? listById.get(activeTabItem.listId) ?? null : null,
    [activeTabItem, listById],
  );

  const listTreeIndex = useMemo(
    () => buildListTreeIndex(activeLists),
    [activeLists],
  );
  const flattenedLists = useMemo(
    () => flattenListTree(activeLists),
    [activeLists],
  );
  const listCounts = useMemo(
    () => computeRecursiveListCounts(activeLists, workspace.listItems),
    [activeLists, workspace.listItems],
  );

  const scope = localState.scope;
  const isSmartScope = scope.kind === "smart";
  const currentList =
    scope.kind === "list"
      ? activeLists.find((l) => l.id === scope.listId) || null
      : null;
  const linkedContextList = activeTabItem ? activeTabItemList : currentList;
  const scopeKey = getScopeStorageKey(scope);

  const currentAncestors = useMemo(
    () =>
      currentList
        ? getListAncestors(currentList.id, listTreeIndex.byId)
        : [],
    [currentList, listTreeIndex.byId],
  );

  const directSublists = useMemo(
    () =>
      currentList ? listTreeIndex.childrenMap.get(currentList.id) || [] : [],
    [currentList, listTreeIndex.childrenMap],
  );
  const hasSublists = directSublists.length > 0;

  const activeSublistFilter: SublistFilterValue = useMemo(() => {
    if (!currentList || directSublists.length === 0) return "all";
    const saved = localState.sublistFilterByScope[scopeKey];
    if (!saved || saved === "all" || saved === "direct") return saved || "all";
    return directSublists.some((s) => s.id === saved) ? saved : "all";
  }, [currentList, directSublists, localState.sublistFilterByScope, scopeKey]);

  const focusedSublist = useMemo(
    () =>
      activeSublistFilter !== "all" && activeSublistFilter !== "direct"
        ? directSublists.find((s) => s.id === activeSublistFilter) || null
        : null,
    [activeSublistFilter, directSublists],
  );

  const effectiveBaseList = focusedSublist || currentList;
  const effectiveBaseDirectSublists = useMemo(
    () =>
      effectiveBaseList
        ? listTreeIndex.childrenMap.get(effectiveBaseList.id) || []
        : [],
    [effectiveBaseList, listTreeIndex.childrenMap],
  );
  const effectiveHasSublists =
    effectiveBaseDirectSublists.length > 0 && activeSublistFilter !== "direct";

  const activeLayout: LayoutConfig = useMemo(() => {
    const saved = localState.perListLayout[scopeKey];
    const defaultGroup: ListsGroupBy = isSmartScope
      ? "none"
      : hasSublists
        ? "sublist"
        : prefs.groupBy;
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
  }, [localState.perListLayout, scopeKey, isSmartScope, hasSublists, prefs]);

  const effectiveGroupBy: ListsGroupBy =
    activeLayout.groupBy === "sublist" && !effectiveHasSublists
      ? "status"
      : activeLayout.groupBy;
  const effectiveThenBy: ListsGroupBy =
    activeLayout.thenBy === "sublist" && !effectiveHasSublists
      ? "none"
      : activeLayout.thenBy !== "none" &&
          activeLayout.thenBy !== effectiveGroupBy
        ? activeLayout.thenBy
        : "none";

  const effectiveBoardBy: "status" | "sublist" =
    currentList && effectiveHasSublists
      ? localState.boardByByScope[scopeKey] || "sublist"
      : "status";

  const updateActiveLayout = useCallback(
    (patch: Partial<LayoutConfig>) => {
      setLocalState((prev) => {
        const defaultGroup: ListsGroupBy = isSmartScope
          ? "none"
          : hasSublists
            ? "sublist"
            : prefs.groupBy;
        const current = prev.perListLayout[scopeKey] || {
          viewMode: prefs.viewMode,
          groupBy: defaultGroup,
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
    [scopeKey, isSmartScope, hasSublists, prefs],
  );

  // Drag & drop state
  const activeDragItemIdRef = useRef<string | null>(null);
  const itemElRefs = useRef<Map<string, HTMLDivElement>>(new Map());
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
  const [sublistGroupDropTarget, setSublistGroupDropTarget] =
    useState<string | null>(null);

  const clearAllDragStates = useCallback(() => {
    activeDragItemIdRef.current = null;
    setDraggingItemId(null);
    setItemDropTarget(null);
    setStatusGroupDropTarget(null);
    setSublistGroupDropTarget(null);
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

  // When an item tab is active, hide the Item Inspector and keep Linked Notes & Events toggleable.
  // On a Smart Tab Home view, auto-switch right pane to "inspector".
  const effectiveRightPaneMode: RightPaneMode = activeTabItem
    ? "linked"
    : isSmartScope
      ? "inspector"
      : localState.rightPaneMode;

  const listItemCountsByCollection = listCounts.totalCounts;
  const directListItemCountsByCollection = listCounts.directCounts;

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

  const scopedListIdSet = useMemo(() => {
    if (scope.kind !== "list") return null;
    if (activeSublistFilter === "direct") {
      return new Set([scope.listId]);
    }
    const baseId = focusedSublist ? focusedSublist.id : scope.listId;
    return new Set(getDescendantListIds(baseId, listTreeIndex.childrenMap));
  }, [scope, activeSublistFilter, focusedSublist, listTreeIndex.childrenMap]);

  const scopeItemsAll = useMemo(() => {
    if (scope.kind === "smart") {
      return workspace.listItems.filter((i) => i.status === scope.status);
    }
    if (!scopedListIdSet) return [];
    return workspace.listItems.filter((i) => scopedListIdSet.has(i.listId));
  }, [workspace.listItems, scope, scopedListIdSet]);

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

  // Linked Notes & Events for current/active list (archived notes excluded!)
  const linkedNotes = useMemo(() => {
    if (!linkedContextList) return [];
    return workspace.entries.filter(
      (e) =>
        e.type === "note" &&
        !e.archived &&
        (e.listIds || []).includes(linkedContextList.id),
    );
  }, [workspace.entries, linkedContextList]);

  const linkedEvents = useMemo(() => {
    if (!linkedContextList) return [];
    return workspace.entries.filter(
      (e) =>
        e.type === "event" &&
        (e.listIds || []).includes(linkedContextList.id),
    );
  }, [workspace.entries, linkedContextList]);

  const attachModalCandidates = useMemo(() => {
    if (!attachModalKind) return [];
    if (attachModalKind === "notes") {
      return workspace.entries.filter((e) => e.type === "note" && !e.archived);
    }
    return workspace.entries.filter((e) => e.type === "event");
  }, [attachModalKind, workspace.entries]);

  const handleToggleLinkedEntry = useCallback(
    (entry: Entry) => {
      if (!linkedContextList) return;
      const existing = entry.listIds || [];
      const isLinked = existing.includes(linkedContextList.id);
      const next = isLinked
        ? existing.filter((id) => id !== linkedContextList.id)
        : [...existing, linkedContextList.id];
      updateEntry(entry.id, { listIds: next });
    },
    [linkedContextList, updateEntry],
  );

  // Two-level grouping helper
  const groupItems = useCallback(
    (
      items: ListItem[],
      by: ListsGroupBy,
    ): {
      key: string;
      label: string;
      listId?: string;
      color?: string;
      icon?: string;
      isDirect?: boolean;
      items: ListItem[];
    }[] => {
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
      if (by === "sublist" && effectiveBaseList) {
        const directBucket: ListItem[] = [];
        const childBuckets = new Map<string, ListItem[]>();

        for (const item of items) {
          const branch = getDirectChildBranchId(
            item.listId,
            effectiveBaseList.id,
            listTreeIndex.byId,
          );
          if (branch === "__direct__") {
            directBucket.push(item);
          } else if (branch) {
            const arr = childBuckets.get(branch) || [];
            arr.push(item);
            childBuckets.set(branch, arr);
          }
        }

        const groups: {
          key: string;
          label: string;
          listId?: string;
          color?: string;
          icon?: string;
          isDirect?: boolean;
          items: ListItem[];
        }[] = [];

        if (directBucket.length > 0) {
          groups.push({
            key: `sublist:__direct__:${effectiveBaseList.id}`,
            label: `Direct · ${effectiveBaseList.title}`,
            listId: effectiveBaseList.id,
            color: effectiveBaseList.color || "#4f46e5",
            icon: effectiveBaseList.icon,
            isDirect: true,
            items: directBucket,
          });
        }

        for (const sub of effectiveBaseDirectSublists) {
          const arr = childBuckets.get(sub.id) || [];
          if (arr.length > 0) {
            groups.push({
              key: `sublist:${sub.id}`,
              label: sub.title,
              listId: sub.id,
              color: sub.color || effectiveBaseList.color || "#4f46e5",
              icon: sub.icon,
              items: arr,
            });
          }
        }
        return groups;
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
    },
    [effectiveBaseList, effectiveBaseDirectSublists, listTreeIndex.byId],
  );

  const groupedTree = useMemo(() => {
    const primary = groupItems(filteredItems, effectiveGroupBy);
    return primary.map((g) => ({
      ...g,
      subGroups: groupItems(g.items, effectiveThenBy),
      hasSubGroups: effectiveThenBy !== "none",
    }));
  }, [filteredItems, effectiveGroupBy, effectiveThenBy, groupItems]);

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

  const isCoursesScope = useMemo(
    () =>
      !isSmartScope &&
      (effectiveBaseList?.listType === "courses" ||
        currentList?.listType === "courses"),
    [isSmartScope, effectiveBaseList?.listType, currentList?.listType],
  );

  const courseProgressStats = useMemo(() => {
    if (!isCoursesScope) return null;
    const activeItems = scopeItemsAll.filter((i) => i.status !== "dropped");
    const total = activeItems.length > 0 ? activeItems.length : scopeItemsAll.length;
    const completed = activeItems.filter((i) => i.status === "done").length;
    const inProgress = activeItems.filter((i) => i.status === "processing").length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, percent };
  }, [isCoursesScope, scopeItemsAll]);

  const handleQuickAddListItem = useCallback(
    (
      targetListId: string,
      rawText: string,
      status: ListItemStatus = "inbox",
    ): ListItem | null => {
      const { url, strippedText, fallbackTitle } =
        extractUrlFromListInput(rawText.trim());
      const created = addListItem(targetListId, rawText, status);
      if (!created) return null;

      if (created.url && parseYouTubeCourseUrl(created.url)) {
        const hadCustomTitle =
          Boolean(strippedText) &&
          Boolean(fallbackTitle) &&
          created.title !== fallbackTitle;
        void fetchYouTubeCourseMetadata(created.url).then((meta) => {
          if (!meta || !meta.fetchedOnline) return;
          const patch: Partial<ListItem> = {};
          if (!hadCustomTitle && meta.title) {
            patch.title = meta.title;
          }
          if (!created.subtitle?.trim() && meta.channel) {
            patch.subtitle = meta.channel;
          }
          if (Object.keys(patch).length > 0) {
            updateListItem(created.id, patch);
          }
        });
      }
      return created;
    },
    [addListItem, updateListItem],
  );

  const emptyStatusesForDrag = useMemo(() => {
    if (
      !draggingItemId ||
      isSmartScope ||
      activeLayout.viewMode === "board" ||
      effectiveGroupBy !== "status" ||
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
    effectiveGroupBy,
    localState.statusFilter,
    groupedTree,
  ]);

  const emptySublistsForDrag = useMemo(() => {
    if (
      !draggingItemId ||
      isSmartScope ||
      activeLayout.viewMode === "board" ||
      effectiveGroupBy !== "sublist" ||
      !effectiveBaseList
    ) {
      return [];
    }
    const presentListIds = new Set(
      groupedTree.map((g) => g.listId).filter((id): id is string => Boolean(id)),
    );
    return effectiveBaseDirectSublists.filter((s) => !presentListIds.has(s.id));
  }, [
    draggingItemId,
    isSmartScope,
    activeLayout.viewMode,
    effectiveGroupBy,
    effectiveBaseList,
    groupedTree,
    effectiveBaseDirectSublists,
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

      // Cross-list drop on Kanban Smart Tab or Sublists Board/Grouping
      const isSublistCrossMove =
        !isSmartScope &&
        ((activeLayout.viewMode === "board" && effectiveBoardBy === "sublist") ||
          (activeLayout.viewMode !== "board" && effectiveGroupBy === "sublist")) &&
        draggedItem.listId !== targetItem.listId;
      if (
        (isSmartScope && draggedItem.listId !== targetItem.listId) ||
        isSublistCrossMove
      ) {
        handleMoveItemToList(draggedId, targetItem.listId);
        return;
      }

      const shouldChangeStatus =
        !isSmartScope &&
        ((activeLayout.viewMode === "board" && effectiveBoardBy === "status") ||
          (activeLayout.viewMode !== "board" && effectiveGroupBy === "status")) &&
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
      effectiveGroupBy,
      effectiveBoardBy,
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
    } => {
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
          };
        }
      }

      if (!isSmartScope && effectiveGroupBy === "status") {
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
            };
          }
        }
      }

      return { itemTarget: null, statusTarget: null };
    },
    [renderedItemOrder, isSingleColumnForElement, isSmartScope, effectiveGroupBy],
  );

  // Tab management handlers
  const handleOpenItemTab = useCallback(
    (itemId: string) => {
      if (!listItemById.has(itemId)) return;
      setLocalState((prev) => ({
        ...prev,
        openTabIds: prev.openTabIds.includes(itemId)
          ? prev.openTabIds
          : [...prev.openTabIds, itemId],
        activeTabId: itemId,
      }));
      setIsWorkspaceTab(false);
    },
    [listItemById],
  );

  const handlePlayYouTubeItem = useCallback(
    (itemId: string) => {
      if (!listItemById.has(itemId)) return;
      studyPlayNonceRef.current += 1;
      setStudyPlayLaunchRequest({
        itemId,
        nonce: studyPlayNonceRef.current,
      });
      handleOpenItemTab(itemId);
    },
    [listItemById, handleOpenItemTab],
  );

  const handleCloseItemTab = useCallback((itemId: string) => {
    setLocalState((prev) => {
      const idx = prev.openTabIds.indexOf(itemId);
      if (idx === -1) return prev;
      const nextTabs = prev.openTabIds.filter((id) => id !== itemId);
      let nextActive = prev.activeTabId;
      if (prev.activeTabId === itemId) {
        nextActive = nextTabs[idx] ?? nextTabs[idx - 1] ?? null;
      }
      return {
        ...prev,
        openTabIds: nextTabs,
        activeTabId: nextActive,
      };
    });
    setIsWorkspaceTab(false);
  }, []);

  const handleCloseOtherItemTabs = useCallback((keepItemId: string) => {
    setLocalState((prev) => ({
      ...prev,
      openTabIds: prev.openTabIds.includes(keepItemId) ? [keepItemId] : [],
      activeTabId: prev.openTabIds.includes(keepItemId) ? keepItemId : null,
    }));
    setIsWorkspaceTab(false);
  }, []);

  const handleCloseAllItemTabs = useCallback(() => {
    setLocalState((prev) => ({
      ...prev,
      openTabIds: [],
      activeTabId: null,
    }));
    setIsWorkspaceTab(false);
  }, []);

  const handleReorderItemTabs = useCallback(
    (draggedId: string, targetId: string, position: "before" | "after") => {
      if (!draggedId || !targetId || draggedId === targetId) return;
      setLocalState((prev) => {
        if (
          !prev.openTabIds.includes(draggedId) ||
          !prev.openTabIds.includes(targetId)
        ) {
          return prev;
        }
        const remaining = prev.openTabIds.filter((id) => id !== draggedId);
        const targetIndex = remaining.indexOf(targetId);
        if (targetIndex === -1) return prev;
        const insertIndex =
          position === "before" ? targetIndex : targetIndex + 1;
        return {
          ...prev,
          openTabIds: [
            ...remaining.slice(0, insertIndex),
            draggedId,
            ...remaining.slice(insertIndex),
          ],
        };
      });
    },
    [],
  );

  const handleCreateItemTabInList = useCallback(
    (targetListId: string, rawTitle?: string) => {
      const defaultStatus: ListItemStatus =
        scope.kind === "smart" ? scope.status : "inbox";
      const created = addListItem(
        targetListId,
        rawTitle?.trim() || "Untitled Item",
        defaultStatus,
      );
      if (!created) return;
      setTargetListPickerOpen(false);
      setLocalState((prev) => ({
        ...prev,
        openTabIds: [...prev.openTabIds, created.id],
        activeTabId: created.id,
      }));
      setIsWorkspaceTab(false);
    },
    [addListItem, scope],
  );

  useEffect(() => {
    if (openTabHandlerRef) {
      openTabHandlerRef.current = handleOpenItemTab;
    }
    return () => {
      if (openTabHandlerRef) openTabHandlerRef.current = null;
    };
  }, [openTabHandlerRef, handleOpenItemTab]);

  // Item click handler (Desktop: Inspector in right split pane; Mobile: open as tab)
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
        handleOpenItemTab(item.id);
      }
    },
    [draggingItemId, selectionMode, selectedIds.size, isDesktop, handleOpenItemTab],
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

  const commitBulkDelete = (
    ids: string[],
    linkedNotesBehavior: "keep" | "delete",
  ) => {
    const count = ids.length;
    removeListItemBookLinks(ids);
    removeCoursePlaybackProgress(ids);
    deleteListItems(ids, linkedNotesBehavior);
    pushToast(
      linkedNotesBehavior === "delete"
        ? `Deleted ${count} ${count === 1 ? "item" : "items"} & linked notes`
        : `Deleted ${count} ${count === 1 ? "item" : "items"}`,
    );
    setSelectedIds(new Set());
    setSelectionMode(false);
    setPendingBulkDeleteIds(null);
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const counts = countLinkedNotesForListItems(workspace.entries, ids);
    if (counts.totalAffectedNotes > 0) {
      setPendingBulkDeleteIds(ids);
      return;
    }
    commitBulkDelete(ids, "keep");
  };

  const handleSaveListModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!listModal || !listModal.title.trim()) return;
    const targetParentId = listModal.parentId ?? null;
    if (listModal.mode === "create") {
      const created = addList(
        listModal.title.trim(),
        listModal.icon,
        listModal.color,
        listModal.listType,
        targetParentId,
      );
      setLocalState((prev) => {
        const nextExpanded = { ...prev.expandedListIds };
        let ancCursor = targetParentId;
        const seen = new Set<string>();
        while (ancCursor && !seen.has(ancCursor)) {
          seen.add(ancCursor);
          nextExpanded[ancCursor] = true;
          ancCursor = listTreeIndex.byId.get(ancCursor)?.parentId ?? null;
        }
        const stayingInParent =
          targetParentId &&
          prev.scope.kind === "list" &&
          prev.scope.listId === targetParentId;
        if (stayingInParent) {
          const parentScopeKey = `list:${targetParentId}`;
          return {
            ...prev,
            expandedListIds: nextExpanded,
            sublistFilterByScope: {
              ...prev.sublistFilterByScope,
              [parentScopeKey]: created.id,
            },
            activeTabId: null,
          };
        }
        return {
          ...prev,
          expandedListIds: nextExpanded,
          scope: { kind: "list", listId: created.id },
          statusFilter: "all",
          tagFilter: "all",
          activeTabId: null,
        };
      });
      setIsWorkspaceTab(false);
    } else if (listModal.list) {
      updateList(listModal.list.id, {
        title: listModal.title.trim(),
        icon: listModal.icon,
        color: listModal.color,
        listType: listModal.listType,
        parentId: targetParentId,
      });
      if (targetParentId) {
        setLocalState((prev) => {
          const nextExpanded = { ...prev.expandedListIds };
          let ancCursor: string | null | undefined = targetParentId;
          const seen = new Set<string>();
          while (ancCursor && !seen.has(ancCursor)) {
            seen.add(ancCursor);
            nextExpanded[ancCursor] = true;
            ancCursor = listTreeIndex.byId.get(ancCursor)?.parentId ?? null;
          }
          return { ...prev, expandedListIds: nextExpanded };
        });
      }
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
      parentId: null,
    });

  const openCreateSublistModal = (parentList: ListCollection) =>
    setListModal({
      mode: "create",
      title: "",
      icon: parentList.icon || "FolderKanban",
      color: parentList.color || LIST_COLORS[activeLists.length % LIST_COLORS.length],
      listType: parentList.listType || "custom",
      parentId: parentList.id,
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
      return buildKanbanColumnsForSmartTab(
        filteredItems,
        flattenedLists.map((n) => n.list),
      );
    }
    if (
      effectiveBoardBy === "sublist" &&
      effectiveBaseList &&
      effectiveHasSublists
    ) {
      return buildKanbanColumnsForSublists(
        filteredItems,
        effectiveBaseList,
        effectiveBaseDirectSublists,
        (itemListId, baseId) =>
          getDirectChildBranchId(itemListId, baseId, listTreeIndex.byId),
      );
    }
    return buildKanbanColumnsForList(filteredItems, STATUS_META, STATUS_ORDER);
  }, [
    scope.kind,
    filteredItems,
    flattenedLists,
    effectiveBoardBy,
    effectiveBaseList,
    effectiveHasSublists,
    effectiveBaseDirectSublists,
    listTreeIndex.byId,
  ]);

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
        const targetListId =
          col.listId || smartAddTargetListId || activeLists[0]?.id;
        if (!targetListId) return;
        handleQuickAddListItem(targetListId, rawText, scope.status);
      } else {
        const targetListId =
          col.listId || focusedSublist?.id || scope.listId;
        const targetStatus: ListItemStatus =
          col.status ||
          (localState.statusFilter === "all" ? "inbox" : localState.statusFilter);
        handleQuickAddListItem(targetListId, rawText, targetStatus);
      }
    },
    [
      scope,
      smartAddTargetListId,
      activeLists,
      handleQuickAddListItem,
      focusedSublist,
      localState.statusFilter,
    ],
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
    const defaultGb: ListsGroupBy = isSmartScope
      ? "none"
      : hasSublists
        ? "sublist"
        : "status";
    if (effectiveGroupBy !== defaultGb) count++;
    if (activeLayout.sortBy !== "custom") count++;
    return count;
  }, [
    isSmartScope,
    hasSublists,
    localState.statusFilter,
    localState.tagFilter,
    effectiveGroupBy,
    activeLayout.sortBy,
  ]);

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

  const renderDueDateChip = (item: ListItem) => {
    if (!item.scheduledAt) return null;
    const dueKey = toLocalDateKey(item.scheduledAt);
    const isOverdue =
      dueKey < todayKey &&
      item.status !== "done" &&
      item.status !== "dropped";

    return (
      <span
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-mono tabular-nums shrink-0"
        style={{
          color: isOverdue ? "var(--danger)" : "var(--text-secondary)",
        }}
        title={`Due Date: ${formatCompactDayHeading(dueKey)}`}
      >
        <Calendar className="w-3 h-3 opacity-80" />
        <span>{formatCompactDayHeading(dueKey)}</span>
      </span>
    );
  };

  const renderSourceListBadge = (item: ListItem) => {
    const srcList = listById.get(item.listId);
    if (!srcList) return null;

    if (isSmartScope) {
      const badgeColor = srcList.color || "#4f46e5";
      return (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium max-w-[140px] truncate shrink-0"
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
    }

    if (
      currentList &&
      effectiveHasSublists &&
      effectiveGroupBy !== "sublist" &&
      activeLayout.viewMode !== "board"
    ) {
      if (item.listId === effectiveBaseList?.id) {
        return (
          <span
            className="inline-flex items-center text-[11px] font-medium shrink-0"
            style={{ color: "var(--text-muted)" }}
            title={`Directly in ${effectiveBaseList.title}`}
          >
            Direct
          </span>
        );
      }
      const badgeColor = srcList.color || "#4f46e5";
      return (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium max-w-[130px] truncate shrink-0"
          style={{ color: badgeColor }}
          title={`In sublist: ${srcList.title}`}
        >
          <CollectionIcon name={srcList.icon} className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate" style={{ color: "var(--text-secondary)" }}>
            {srcList.title}
          </span>
        </span>
      );
    }

    return null;
  };

  const makeCommonDragHandlers = (item: ListItem) => ({
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
      if (!e.dataTransfer.types.includes("application/x-kanso-list-item-id")) {
        return;
      }
      const draggedId = activeDragItemIdRef.current;
      if (!draggedId || draggedId === item.id) return;
      const draggedItem = scopeItemsAll.find((i) => i.id === draggedId);
      const crossStatus =
        !isSmartScope &&
        ((activeLayout.viewMode === "board" && effectiveBoardBy === "status") ||
          (activeLayout.viewMode !== "board" && effectiveGroupBy === "status")) &&
        draggedItem &&
        draggedItem.status !== item.status;
      const crossList =
        draggedItem &&
        draggedItem.listId !== item.listId &&
        ((isSmartScope && activeLayout.viewMode === "board") ||
          (!isSmartScope &&
            ((activeLayout.viewMode === "board" &&
              effectiveBoardBy === "sublist") ||
              (activeLayout.viewMode !== "board" &&
                effectiveGroupBy === "sublist"))));
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
    const isBeingDragged = draggingItemId === item.id;
    const isDropTarget = itemDropTarget?.itemId === item.id;
    const isSelectedForEdit =
      isDesktop && prefs.splitOpen && localState.selectedItemId === item.id;
    const isChecked = selectedIds.has(item.id);
    const validUrl = item.url ? normalizeExternalUrl(item.url) : "";
    const itemList = listById.get(item.listId);
    const ytCourseInfo = item.url ? parseYouTubeCourseUrl(item.url) : null;
    const resumeLabel = ytCourseInfo
      ? formatCourseResumeLabel(courseProgressMap[item.id], item.status)
      : null;
    const bookLink =
      itemList?.listType === "books" ? bookLinksMap[item.id] ?? null : null;
    const linkedBookRecord = bookLink
      ? workspace.books.find((b) => b.id === bookLink.bookId) || null
      : null;
    const showCheckbox = selectionMode || selectedIds.size > 0;
    const el = itemElRefs.current.get(item.id) ?? null;
    const singleCol = inBoard ? true : isSingleColumnForElement(el);

    const dragHandle = isCustomSort && (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Reorder ${item.title}`}
        title="Drag to reorder"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          activeDragItemIdRef.current = item.id;
          setDraggingItemId(item.id);
          setItemDropTarget(null);
          setStatusGroupDropTarget(null);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || draggingItemId !== item.id) return;
          const resolved = resolveTouchDrop(e.clientX, e.clientY, item.id);
          setItemDropTarget(resolved.itemTarget);
          setStatusGroupDropTarget(resolved.statusTarget);
        }}
        onPointerUp={(e) => {
          if (e.pointerType === "mouse") return;
          e.stopPropagation();
          if (draggingItemId === item.id) {
            const resolved = resolveTouchDrop(e.clientX, e.clientY, item.id);
            const statusTarget = resolved.statusTarget ?? statusGroupDropTarget;
            const targetItem = resolved.itemTarget ?? itemDropTarget;
            clearAllDragStates();
            if (statusTarget) {
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

    const isDone = item.status === "done";
    const hasBottomBlock =
      Boolean(validUrl && (inBoard || !ytCourseInfo)) ||
      Boolean(bookLink && linkedBookRecord);
    const dueDateDisplay = item.scheduledAt
      ? (() => {
          const dueKey = toLocalDateKey(item.scheduledAt);
          return {
            label: formatCompactDayHeading(dueKey),
            isOverdue:
              dueKey < todayKey &&
              item.status !== "done" &&
              item.status !== "dropped",
          };
        })()
      : null;

    const bottomChips =
      (validUrl && (inBoard || !ytCourseInfo)) ||
      (bookLink && linkedBookRecord) ? (
        <div className="pl-8 flex flex-wrap items-center gap-1.5">
          {validUrl && (inBoard || !ytCourseInfo) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (ytCourseInfo && inBoard) {
                  handlePlayYouTubeItem(item.id);
                } else {
                  openExternalUrlSafely(item.url!);
                }
              }}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium max-w-full transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
              style={{
                backgroundColor: "var(--bg-surface-subtle)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
              title={ytCourseInfo ? "Play course video" : `Open ${validUrl}`}
            >
              {ytCourseInfo ? (
                <Play
                  className="w-3 h-3 shrink-0"
                  style={{ color: "var(--accent)" }}
                />
              ) : (
                <Globe className="w-3 h-3 shrink-0 opacity-75" />
              )}
              <span className="truncate">
                {ytCourseInfo ? "Play Video" : formatUrlDisplayLabel(item.url!)}
              </span>
              {!ytCourseInfo && (
                <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-65" />
              )}
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
      ) : null;

    return (
      <div
        key={item.id}
        {...makeCommonDragHandlers(item)}
        onClick={() => handleOpenItem(item)}
        onDoubleClick={(e) => {
          if (selectionMode || selectedIds.size > 0) return;
          e.stopPropagation();
          handleOpenItemTab(item.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenContextMenu({ kind: "list_item", item }, e);
        }}
        className={`group relative rounded-xl border p-4 ${
          inBoard && dueDateDisplay && (hasBottomBlock || !item.subtitle)
            ? "pb-8"
            : ""
        } cursor-pointer transition-all duration-150 hover:border-[var(--border-strong)] flex flex-col justify-between gap-2.5 ${
          isCustomSort ? "cursor-grab active:cursor-grabbing" : ""
        } ${
          isBeingDragged
            ? "opacity-45 scale-[0.98]"
            : isDone
              ? "opacity-[0.58]"
              : ""
        } ${
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

        <ListCardTopRegion
          item={item}
          inBoard={inBoard}
          isDone={isDone}
          ytCourseInfo={ytCourseInfo}
          resumeLabel={resumeLabel}
          onPlayYouTube={() => handlePlayYouTubeItem(item.id)}
          dueDateDisplay={dueDateDisplay}
          showCheckbox={showCheckbox}
          isChecked={isChecked}
          onToggleSelection={() => toggleItemSelection(item.id)}
          dragHandle={dragHandle}
          statusButton={renderStatusButton(item)}
          onOpenMenu={(e) => onOpenContextMenu({ kind: "list_item", item }, e)}
          bottomChips={bottomChips}
        />

        {/* Small absolute-positioned Due Date badge near bottom-right corner on Kanban Cards */}
        {inBoard && dueDateDisplay && (
          <span
            className="pointer-events-none absolute bottom-2.5 right-3 z-10 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-mono tabular-nums leading-none"
            style={{
              backgroundColor: dueDateDisplay.isOverdue
                ? "color-mix(in srgb, var(--danger) 10%, var(--bg-surface))"
                : "var(--bg-surface-subtle)",
              borderColor: dueDateDisplay.isOverdue
                ? "color-mix(in srgb, var(--danger) 35%, transparent)"
                : "var(--border-subtle)",
              color: dueDateDisplay.isOverdue
                ? "var(--danger)"
                : "var(--text-secondary)",
            }}
            title={`Due Date: ${dueDateDisplay.label}`}
          >
            <Calendar className="w-2.5 h-2.5 shrink-0 opacity-80" />
            <span>{dueDateDisplay.label}</span>
          </span>
        )}
      </div>
    );
  };

  // Stacked (2-row Quiet) & Compact (1-line dense) row renderer
  const renderItemRow = (item: ListItem) => {
    if (activeLayout.viewMode === "grid") {
      return renderCard(item, false);
    }

    const isCompact = activeLayout.viewMode === "compact";
    const isDone = item.status === "done";
    const itemTags = item.tags || [];
    const isBeingDragged = draggingItemId === item.id;
    const isDropTarget = itemDropTarget?.itemId === item.id;
    const isSelectedForEdit =
      isDesktop && prefs.splitOpen && localState.selectedItemId === item.id;
    const isChecked = selectedIds.has(item.id);
    const showCheckbox = selectionMode || selectedIds.size > 0;
    const validUrl = item.url ? normalizeExternalUrl(item.url) : "";
    const ytCourseInfo = item.url ? parseYouTubeCourseUrl(item.url) : null;
    const resumeLabel = ytCourseInfo
      ? formatCourseResumeLabel(courseProgressMap[item.id], item.status)
      : null;
    const hasDue = Boolean(item.scheduledAt);
    const srcList = listById.get(item.listId);
    const showsSublistChip =
      isSmartScope ||
      Boolean(
        currentList &&
          effectiveHasSublists &&
          effectiveGroupBy !== "sublist",
      );
    const sublistChipLabel = showsSublistChip
      ? isSmartScope
        ? srcList?.title
        : item.listId === effectiveBaseList?.id
          ? "Direct"
          : srcList?.title
      : null;

    const dragHandle = isCustomSort && (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Reorder ${item.title}`}
        title="Drag to reorder or change status"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          activeDragItemIdRef.current = item.id;
          setDraggingItemId(item.id);
          setItemDropTarget(null);
          setStatusGroupDropTarget(null);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || draggingItemId !== item.id) return;
          const resolved = resolveTouchDrop(e.clientX, e.clientY, item.id);
          setItemDropTarget(resolved.itemTarget);
          setStatusGroupDropTarget(resolved.statusTarget);
        }}
        onPointerUp={(e) => {
          if (e.pointerType === "mouse") return;
          e.stopPropagation();
          if (draggingItemId === item.id) {
            const resolved = resolveTouchDrop(e.clientX, e.clientY, item.id);
            const statusTarget = resolved.statusTarget ?? statusGroupDropTarget;
            const targetItem = resolved.itemTarget ?? itemDropTarget;
            clearAllDragStates();
            if (statusTarget) {
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

    if (isCompact) {
      return (
        <div
          key={item.id}
          {...makeCommonDragHandlers(item)}
          onClick={() => handleOpenItem(item)}
          onDoubleClick={(e) => {
            if (selectionMode || selectedIds.size > 0) return;
            e.stopPropagation();
            handleOpenItemTab(item.id);
          }}
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
          className={`group relative flex items-center gap-2 px-2 -mx-2 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]/75 py-1.5 ${
            isCustomSort ? "cursor-grab active:cursor-grabbing" : ""
          } ${
            isBeingDragged
              ? "opacity-50 bg-[var(--accent-soft)]"
              : isDone
                ? "opacity-[0.58]"
                : ""
          }`}
        >
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

          <div className="flex-1 min-w-0">
            <span
              className={`text-sm font-medium leading-snug truncate block ${
                isDone ? "line-through" : ""
              }`}
              style={{ color: "var(--text-primary)" }}
            >
              {item.title}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {renderSourceListBadge(item)}
            {ytCourseInfo ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayYouTubeItem(item.id);
                }}
                className="h-6 px-1.5 rounded-md inline-flex items-center gap-1 text-[11px] font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: "var(--accent)" }}
                title="Play course video"
              >
                <Play className="w-3 h-3" />
              </button>
            ) : validUrl ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openExternalUrlSafely(item.url!);
                }}
                className="h-6 px-1.5 rounded-md inline-flex items-center gap-1 text-[11px] font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: "var(--accent)" }}
                title={`Open ${validUrl}`}
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            ) : null}
            {renderDueDateChip(item)}
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
        </div>
      );
    }

    const hasRow2Metadata =
      Boolean(item.subtitle) ||
      Boolean(sublistChipLabel) ||
      itemTags.length > 0 ||
      Boolean(resumeLabel) ||
      hasDue;

    return (
      <div
        key={item.id}
        {...makeCommonDragHandlers(item)}
        onClick={() => handleOpenItem(item)}
        onDoubleClick={(e) => {
          if (selectionMode || selectedIds.size > 0) return;
          e.stopPropagation();
          handleOpenItemTab(item.id);
        }}
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
        className={`group relative flex flex-col gap-1.5 px-2.5 -mx-2 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]/75 py-2.5 ${
          isCustomSort ? "cursor-grab active:cursor-grabbing" : ""
        } ${
          isBeingDragged
            ? "opacity-50 bg-[var(--accent-soft)]"
            : isDone
              ? "opacity-[0.58]"
              : ""
        }`}
      >
        {/* Row 1: Status + Title (wraps up to 2 lines) + Clean Action Triggers */}
        <div className="flex items-start gap-2 min-w-0">
          {(showCheckbox || isChecked) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleItemSelection(item.id);
              }}
              aria-label={isChecked ? "Deselect item" : "Select item"}
              className="h-6 w-5 flex items-center justify-center rounded shrink-0 cursor-pointer transition-opacity mt-0.5"
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

          <div className="pt-0.5 shrink-0">{renderStatusButton(item)}</div>

          <div className="flex-1 min-w-0 pt-0.5">
            <span
              className={`block text-sm font-medium leading-snug line-clamp-2 ${
                isDone ? "line-through" : ""
              }`}
              style={{ color: "var(--text-primary)" }}
            >
              {item.title}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {ytCourseInfo ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayYouTubeItem(item.id);
                }}
                title="Play video in Study Tab"
                aria-label="Play course video"
                className="h-8 sm:h-7 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--accent)",
                }}
              >
                <Play className="w-3 h-3 shrink-0" />
                <span>Play</span>
              </button>
            ) : validUrl ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openExternalUrlSafely(item.url!);
                }}
                title={`Open ${validUrl}`}
                aria-label={`Open ${validUrl} in new tab`}
                className="h-8 w-8 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg border transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--accent)",
                }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenContextMenu({ kind: "list_item", item }, e);
              }}
              className="h-8 w-8 sm:h-7 sm:w-7 flex items-center justify-center rounded-md shrink-0 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
              aria-label="Item actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Row 2: Subtle Bordered Metadata Chips (Provider/Channel, Sublist, Tags, Saved Resume) */}
        {hasRow2Metadata && (
          <div className="pl-8 flex flex-wrap items-center gap-1.5 min-w-0">
            {item.subtitle && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-md border text-[11px] leading-tight max-w-[220px] truncate"
                style={{
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
                title={item.subtitle}
              >
                {item.subtitle}
              </span>
            )}

            {sublistChipLabel && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] leading-tight max-w-[160px] truncate"
                style={{
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                {srcList && sublistChipLabel !== "Direct" && (
                  <CollectionIcon
                    name={srcList.icon}
                    className="w-2.5 h-2.5 shrink-0"
                    style={{ color: srcList.color || "#4f46e5" }}
                  />
                )}
                <span className="truncate">{sublistChipLabel}</span>
              </span>
            )}

            {resumeLabel && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-mono tabular-nums leading-tight"
                style={{
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--accent)",
                }}
              >
                <Clock className="w-2.5 h-2.5 shrink-0" />
                <span>{resumeLabel}</span>
              </span>
            )}

            {itemTags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center px-1.5 py-0.5 rounded-md border text-[11px] font-mono leading-tight"
                style={{
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-muted)",
                }}
              >
                #{t}
              </span>
            ))}

            {hasDue && (
              <span
                className="inline-flex items-center rounded-md border"
                style={{
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                {renderDueDateChip(item)}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderLinkedNotesContent = (compactPane: boolean) => {
    if (!linkedContextList) return null;
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
          <p>No notes linked to {linkedContextList.title} yet.</p>
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
    if (!linkedContextList) return null;
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
          <p>No events linked to {linkedContextList.title} yet.</p>
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
    return flattenedLists.filter((node) =>
      !q
        ? true
        : node.list.title.toLowerCase().includes(q) ||
          node.pathLabel.toLowerCase().includes(q),
    );
  }, [flattenedLists, quickJumpQuery]);

  const activeSmartMeta =
    scope.kind === "smart" ? STATUS_META[scope.status] : null;
  const SmartHeaderIcon = activeSmartMeta?.icon;

  const handleSelectScope = useCallback(
    (nextScope: ListsScope) => {
      setLocalState((prev) => {
        let nextExpanded = prev.expandedListIds;
        if (nextScope.kind === "list") {
          const ancestors = getListAncestors(
            nextScope.listId,
            listTreeIndex.byId,
          );
          if (ancestors.length > 1) {
            nextExpanded = { ...prev.expandedListIds };
            for (let i = 0; i < ancestors.length - 1; i++) {
              nextExpanded[ancestors[i].id] = true;
            }
          }
        }
        return {
          ...prev,
          expandedListIds: nextExpanded,
          scope: nextScope,
          activeTabId: null,
          statusFilter: nextScope.kind === "list" ? "all" : prev.statusFilter,
          tagFilter: "all",
          subTab: nextScope.kind === "smart" ? "items" : prev.subTab,
        };
      });
      setSelectedIds(new Set());
      setSelectionMode(false);
      setIsWorkspaceTab(false);
    },
    [listTreeIndex.byId],
  );

  const renderQuickJumpButton = () => (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setQuickJumpOpen((o) => !o);
          setQuickJumpQuery("");
        }}
        title="Quick jump to any smart view or list"
        aria-label="Quick jump to smart view or list"
        aria-expanded={quickJumpOpen}
        className="h-8 px-2 sm:px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
        style={{
          backgroundColor: quickJumpOpen
            ? "var(--accent-soft)"
            : "var(--bg-surface)",
          borderColor: quickJumpOpen ? "var(--accent)" : "var(--border-subtle)",
          color: quickJumpOpen ? "var(--accent)" : "var(--text-secondary)",
        }}
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden xl:inline">Jump</span>
        <ChevronDown className="w-3 h-3 opacity-75" />
      </button>

      {quickJumpOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setQuickJumpOpen(false)}
          />
          <div
            className="absolute right-0 top-10 z-40 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border overflow-hidden flex flex-col max-h-[65dvh]"
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
                    const active = scope.kind === "smart" && scope.status === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => {
                          handleSelectScope({ kind: "smart", status: st });
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
                  {quickJumpLists.map((node) => {
                    const list = node.list;
                    const active =
                      scope.kind === "list" && scope.listId === list.id;
                    const color = list.color || "#4f46e5";
                    return (
                      <button
                        key={list.id}
                        type="button"
                        onClick={() => {
                          handleSelectScope({ kind: "list", listId: list.id });
                          setQuickJumpOpen(false);
                        }}
                        title={node.pathLabel}
                        className="w-full pr-2 py-1.5 rounded-lg flex items-center justify-between gap-2 text-xs font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        style={{
                          paddingLeft: `${8 + Math.min(node.depth, 4) * 12}px`,
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
                          className="font-mono tabular-nums text-[11px]"
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
  );

  return (
    <div
      className="h-full flex-1 min-h-0 lg:h-dvh flex overflow-hidden overscroll-none"
      style={{ backgroundColor: "var(--bg-canvas)" }}
    >
      {/* Desktop Resizable/Collapsible Left Sidebar */}
      <ListsLeftSidebar
        lists={activeLists}
        listItemCounts={listItemCountsByCollection}
        directListItemCounts={directListItemCountsByCollection}
        globalStatusCounts={globalStatusCounts}
        statusOrder={STATUS_ORDER}
        statusMeta={STATUS_META}
        scope={scope}
        sidebarWidth={localState.sidebarWidth}
        isCollapsedDesktop={localState.sidebarCollapsedDesktop}
        sectionsCollapsed={localState.sidebarSectionsCollapsed}
        expandedListIds={localState.expandedListIds}
        onToggleExpandList={(listId) =>
          setLocalState((prev) => ({
            ...prev,
            expandedListIds: {
              ...prev.expandedListIds,
              [listId]: !prev.expandedListIds[listId],
            },
          }))
        }
        onToggleSection={(section) =>
          setLocalState((prev) => ({
            ...prev,
            sidebarSectionsCollapsed: {
              ...prev.sidebarSectionsCollapsed,
              [section]: !prev.sidebarSectionsCollapsed[section],
            },
          }))
        }
        onCollapseDesktop={() =>
          setLocalState((prev) => ({
            ...prev,
            sidebarCollapsedDesktop: true,
          }))
        }
        onSidebarWidthChange={(w) =>
          setLocalState((prev) => ({ ...prev, sidebarWidth: w }))
        }
        onSelectScope={handleSelectScope}
        onCreateList={openCreateListModal}
        onCreateSublist={openCreateSublistModal}
        onEditList={(list) =>
          setListModal({
            mode: "edit",
            list,
            title: list.title,
            icon: list.icon,
            color: list.color || LIST_COLORS[0],
            listType: list.listType || "custom",
            parentId: list.parentId ?? null,
          })
        }
        onDeleteList={(list) => setDeleteTargetList(list)}
        onReorderList={reorderLists}
        onMoveItemToList={handleMoveItemToList}
        onChangeItemStatus={handleChangeItemStatus}
        activeDragItemIdRef={activeDragItemIdRef}
        onClearAllDragStates={clearAllDragStates}
      />

      {/* Main Lists Workspace Column */}
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
      <ListsTabStrip
        openItems={openTabItems}
        listsById={listById}
        statusMeta={STATUS_META}
        activeTabId={activeTabItem ? activeTabItem.id : null}
        isWorkspaceActive={isWorkspaceTab}
        homeTabLabel={
          currentList
            ? currentList.title
            : activeSmartMeta
              ? activeSmartMeta.label
              : "Lists"
        }
        homeTabIcon={currentList ? currentList.icon : "ListChecks"}
        homeTabColor={
          currentList
            ? currentList.color || "#4f46e5"
            : activeSmartMeta?.color
        }
        homeSmartIcon={SmartHeaderIcon}
        onSelectWorkspace={() => setIsWorkspaceTab(true)}
        onSelectHome={() => {
          setIsWorkspaceTab(false);
          setLocalState((prev) => ({ ...prev, activeTabId: null }));
        }}
        onSelectTab={handleOpenItemTab}
        onCloseTab={handleCloseItemTab}
        onCloseOtherTabs={handleCloseOtherItemTabs}
        onCloseAllTabs={handleCloseAllItemTabs}
        onReorderTabs={handleReorderItemTabs}
        onOpenTargetListPicker={() => setTargetListPickerOpen(true)}
      />

      {/* ================= PINNED TOP CHROME (Home View Only) ================= */}
      {!isWorkspaceTab && !activeTabItem && (
      <div className="shrink-0 relative z-20">
        {/* Row 1: Unified Compact View Header */}
        <header
          className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 pb-3 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {currentList ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Desktop Collapsed Sidebar Reopen */}
                {localState.sidebarCollapsedDesktop && (
                  <button
                    type="button"
                    onClick={() =>
                      setLocalState((prev) => ({
                        ...prev,
                        sidebarCollapsedDesktop: false,
                      }))
                    }
                    title="Show lists sidebar"
                    aria-label="Show lists sidebar"
                    className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer shrink-0"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                )}

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
                <div className="min-w-0">
                  {currentAncestors.length > 1 && (
                    <nav
                      aria-label="List hierarchy breadcrumb"
                      className="flex items-center gap-1 text-[11px] min-w-0 mb-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {currentAncestors.slice(0, -1).map((anc, idx) => (
                        <React.Fragment key={anc.id}>
                          {idx > 0 && (
                            <ChevronRight className="w-3 h-3 shrink-0 opacity-60" />
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              handleSelectScope({ kind: "list", listId: anc.id })
                            }
                            className="hover:underline truncate max-w-[140px] cursor-pointer"
                            style={{ color: "var(--text-secondary)" }}
                            title={`Open ${anc.title}`}
                          >
                            {anc.title}
                          </button>
                        </React.Fragment>
                      ))}
                    </nav>
                  )}
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
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {renderQuickJumpButton()}
                <button
                  type="button"
                  onClick={() => openCreateSublistModal(currentList)}
                  className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                  title={`New sublist inside ${currentList.title}`}
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Sublist</span>
                </button>
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
                      parentId: currentList.parentId ?? null,
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
                {/* Desktop Collapsed Sidebar Reopen */}
                {localState.sidebarCollapsedDesktop && (
                  <button
                    type="button"
                    onClick={() =>
                      setLocalState((prev) => ({
                        ...prev,
                        sidebarCollapsedDesktop: false,
                      }))
                    }
                    title="Show lists sidebar"
                    aria-label="Show lists sidebar"
                    className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer shrink-0"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                )}

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
                {renderQuickJumpButton()}
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
            <div className="flex items-center justify-between w-full gap-2">
              <div className="flex items-center gap-2">
                {localState.sidebarCollapsedDesktop && (
                  <button
                    type="button"
                    onClick={() =>
                      setLocalState((prev) => ({
                        ...prev,
                        sidebarCollapsedDesktop: false,
                      }))
                    }
                    title="Show lists sidebar"
                    aria-label="Show lists sidebar"
                    className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer shrink-0"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                )}
                <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight">
                  Lists
                </h1>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {renderQuickJumpButton()}
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
          )}
        </header>

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

        {/* Row 4: Sublist Tab Strip (shown for parent lists with sublists; >10 groups 7th+ into dropdown) */}
        {currentList && directSublists.length > 0 && (
          <SublistTabStrip
            parentList={currentList}
            sublists={directSublists}
            activeFilter={activeSublistFilter}
            allCount={listCounts.totalCounts.get(currentList.id) || 0}
            directCount={listCounts.directCounts.get(currentList.id) || 0}
            sublistCounts={listCounts.totalCounts}
            onSelectFilter={(next) =>
              setLocalState((prev) => ({
                ...prev,
                subTab: "items",
                sublistFilterByScope: {
                  ...prev.sublistFilterByScope,
                  [scopeKey]: next,
                },
              }))
            }
            onFocusSublist={(sublistId) =>
              handleSelectScope({ kind: "list", listId: sublistId })
            }
            onCreateSublist={() => openCreateSublistModal(currentList)}
            onDropItemOnList={handleMoveItemToList}
            activeDragItemIdRef={activeDragItemIdRef}
            onClearAllDragStates={clearAllDragStates}
          />
        )}

        {/* Row 5: Search/Filters/Select Bar (All Lists Scopes: Smart Views & Regular Lists) */}
        {(currentList || isSmartScope) &&
          (splitVisible || localState.subTab === "items") && (
            <div
              className="px-4 sm:px-6 pt-2.5 pb-2.5 border-b bg-[var(--bg-canvas)]"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              {/* Filter / ViewMode / Multi-Select Bar */}
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

                {/* Desktop Board Column Axis Switch (when viewing parent list in Kanban mode) */}
                {activeLayout.viewMode === "board" &&
                  currentList &&
                  effectiveHasSublists && (
                    <select
                      value={effectiveBoardBy}
                      onChange={(e) =>
                        setLocalState((prev) => ({
                          ...prev,
                          boardByByScope: {
                            ...prev.boardByByScope,
                            [scopeKey]: e.target.value as "status" | "sublist",
                          },
                        }))
                      }
                      aria-label="Board columns"
                      className="hidden lg:block h-8 px-2.5 rounded-lg border text-xs outline-none cursor-pointer"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <option value="sublist">Columns: Sublists</option>
                      <option value="status">Columns: Status</option>
                    </select>
                  )}

                {/* Desktop Group By & Then By (hidden in Kanban board mode since columns define grouping) */}
                {activeLayout.viewMode !== "board" && (
                  <>
                    <select
                      value={effectiveGroupBy}
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
                      {effectiveHasSublists && (
                        <option value="sublist">Group: Sublist</option>
                      )}
                      <option value="status">Group: Status</option>
                      <option value="tag">Group: Tag</option>
                      <option value="none">Group: None</option>
                    </select>

                    {effectiveGroupBy !== "none" && (
                      <select
                        value={effectiveThenBy}
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
                        {effectiveHasSublists &&
                          effectiveGroupBy !== "sublist" && (
                            <option value="sublist">Then: Sublist</option>
                          )}
                        {effectiveGroupBy !== "tag" && (
                          <option value="tag">Then: Tag</option>
                        )}
                        {effectiveGroupBy !== "status" && (
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
            </div>
          )}
      </div>
      )}

      {/* ================= FULL-HEIGHT SPLIT BODY ================= */}
      {isWorkspaceTab ? (
        <ListsWorkspaceTab
          lists={activeLists}
          listItemCounts={listItemCountsByCollection}
          directListItemCounts={directListItemCountsByCollection}
          globalStatusCounts={globalStatusCounts}
          statusOrder={STATUS_ORDER}
          statusMeta={STATUS_META}
          scope={scope}
          sectionsCollapsed={localState.sidebarSectionsCollapsed}
          expandedListIds={localState.expandedListIds}
          onToggleExpandList={(listId) =>
            setLocalState((prev) => ({
              ...prev,
              expandedListIds: {
                ...prev.expandedListIds,
                [listId]: !prev.expandedListIds[listId],
              },
            }))
          }
          onToggleSection={(section) =>
            setLocalState((prev) => ({
              ...prev,
              sidebarSectionsCollapsed: {
                ...prev.sidebarSectionsCollapsed,
                [section]: !prev.sidebarSectionsCollapsed[section],
              },
            }))
          }
          onSelectScope={handleSelectScope}
          onCreateList={openCreateListModal}
          onCreateSublist={openCreateSublistModal}
          onEditList={(list) =>
            setListModal({
              mode: "edit",
              list,
              title: list.title,
              icon: list.icon,
              color: list.color || LIST_COLORS[0],
              listType: list.listType || "custom",
              parentId: list.parentId ?? null,
            })
          }
          onDeleteList={(list) => setDeleteTargetList(list)}
          onReorderList={reorderLists}
          onMoveItemToList={handleMoveItemToList}
          onChangeItemStatus={handleChangeItemStatus}
          activeDragItemIdRef={activeDragItemIdRef}
          onClearAllDragStates={clearAllDragStates}
        />
      ) : activeTabItem ? (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <ListItemTabEditor
            key={activeTabItem.id}
            item={activeTabItem}
            lists={activeLists}
            sidebarCollapsedDesktop={localState.sidebarCollapsedDesktop}
            linkedPaneOpenDesktop={prefs.splitOpen}
            onExpandDesktopSidebar={() =>
              setLocalState((prev) => ({
                ...prev,
                sidebarCollapsedDesktop: false,
              }))
            }
            onToggleDesktopLinkedPane={() =>
              setPrefs((p) => ({ ...p, splitOpen: !p.splitOpen }))
            }
            onSelectParentListHome={(targetListId) =>
              handleSelectScope({ kind: "list", listId: targetListId })
            }
            playLaunchRequest={studyPlayLaunchRequest}
            onJumpToBookLocation={onJumpToBookLocation}
            onJumpToNote={onJumpToNote}
            onItemDeleted={handleCloseItemTab}
          />

          {/* DESKTOP RIGHT SPLIT PANE (Item Tab Active: Inspector hidden, Linked Notes & Events toggleable) */}
          {splitVisible && linkedContextList && (
            <aside
              aria-label="Linked notes and events"
              className="hidden lg:flex lg:flex-col w-80 xl:w-[400px] shrink-0 border-l overflow-hidden"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-canvas)",
              }}
            >
              <div
                className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <span
                  className="text-xs font-semibold truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  Linked · {linkedContextList.title}
                </span>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setAttachModalKind(localState.contextTab)}
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
                              listIds: [linkedContextList.id],
                            },
                          })
                        : onOpenDetail({
                            mode: "event",
                            draft: {
                              type: "event",
                              title: "",
                              listIds: [linkedContextList.id],
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
              </div>

              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
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
            </aside>
          )}
        </div>
      ) : !currentList && !isSmartScope ? (
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
          {/* LEFT PRIMARY PANE + COHESIVE BOTTOM CAPTURE BAR */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden relative">
            <section className="flex-1 min-w-0 overflow-y-auto overscroll-none px-4 sm:px-6 py-4 space-y-4">
            {/* TRACKED ITEMS */}
            {(splitVisible || localState.subTab === "items") && (
              <>

                {/* Quiet Course Progress Summary Bar */}
                {isCoursesScope && courseProgressStats && courseProgressStats.total > 0 && (
                  <div
                    className="rounded-xl border px-3.5 py-2.5 flex items-center justify-between gap-4"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <div className="flex items-center gap-2 text-xs min-w-0">
                      <span
                        className="font-semibold font-mono tabular-nums"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {courseProgressStats.completed} / {courseProgressStats.total} completed
                      </span>
                      {courseProgressStats.inProgress > 0 && (
                        <>
                          <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>
                            ·
                          </span>
                          <span
                            className="font-mono tabular-nums"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {courseProgressStats.inProgress} active
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <div
                        className="w-24 sm:w-36 h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: "var(--bg-surface-subtle)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${courseProgressStats.percent}%`,
                            backgroundColor: "var(--accent)",
                          }}
                        />
                      </div>
                      <span
                        className="text-[11px] font-mono tabular-nums w-8 text-right"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {courseProgressStats.percent}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Quick-Add & Filter/Search/Select controls are pinned above */}

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
                          {flattenedLists.map((node) => (
                            <option key={node.list.id} value={node.list.id}>
                              {formatIndentedListOptionLabel(node)}
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
                    below.
                  </div>
                ) : (
                  <div className="space-y-5 pb-4">
                    {groupedTree.map((group) => {
                      const groupKey = `${scopeKey}:${group.key}`;
                      const collapsed = Boolean(
                        localState.collapsedGroups[groupKey],
                      );
                      const isStatusGroup =
                        !isSmartScope && effectiveGroupBy === "status";
                      const statusKey = isStatusGroup
                        ? (group.key as ListItemStatus)
                        : null;
                      const isStatusDropHover =
                        isStatusGroup &&
                        statusKey !== null &&
                        statusGroupDropTarget === statusKey;

                      const isSublistGroup =
                        !isSmartScope &&
                        effectiveGroupBy === "sublist" &&
                        Boolean(group.listId);
                      const sublistGroupId = isSublistGroup
                        ? group.listId || null
                        : null;
                      const isSublistDropHover =
                        isSublistGroup &&
                        sublistGroupId !== null &&
                        sublistGroupDropTarget === sublistGroupId;
                      const isGroupDropHover =
                        isStatusDropHover || isSublistDropHover;

                      const gridClassName = splitVisible
                        ? "grid grid-cols-1 md:grid-cols-2 gap-3"
                        : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3";

                      return (
                        <div
                          key={group.key}
                          className={`space-y-1.5 rounded-xl transition-colors ${
                            isGroupDropHover
                              ? "ring-1 ring-[var(--accent)] bg-[var(--accent-soft)]/50 p-1.5 -m-1.5"
                              : ""
                          }`}
                        >
                          {group.label && (
                            <div className="flex items-center justify-between gap-2">
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
                                  if (
                                    !e.dataTransfer.types.includes(
                                      "application/x-kanso-list-item-id",
                                    )
                                  ) {
                                    return;
                                  }
                                  if (isStatusGroup && statusKey) {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                    setItemDropTarget(null);
                                    setStatusGroupDropTarget(statusKey);
                                  } else if (isSublistGroup && sublistGroupId) {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                    setItemDropTarget(null);
                                    setSublistGroupDropTarget(sublistGroupId);
                                  }
                                }}
                                onDragLeave={(e) => {
                                  if (
                                    !e.currentTarget.contains(
                                      e.relatedTarget as Node,
                                    )
                                  ) {
                                    if (statusKey) {
                                      setStatusGroupDropTarget((prev) =>
                                        prev === statusKey ? null : prev,
                                      );
                                    }
                                    if (sublistGroupId) {
                                      setSublistGroupDropTarget((prev) =>
                                        prev === sublistGroupId ? null : prev,
                                      );
                                    }
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
                                  if (isStatusGroup && statusKey) {
                                    e.preventDefault();
                                    handleChangeItemStatus(itemId, statusKey);
                                  } else if (isSublistGroup && sublistGroupId) {
                                    e.preventDefault();
                                    handleMoveItemToList(itemId, sublistGroupId);
                                  }
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
                                  isGroupDropHover
                                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                                    : ""
                                }`}
                                style={{
                                  color: isGroupDropHover
                                    ? "var(--accent)"
                                    : "var(--text-secondary)",
                                }}
                              >
                                {collapsed ? (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                                {isSublistGroup && group.icon && (
                                  <CollectionIcon
                                    name={group.icon}
                                    className="w-3.5 h-3.5 shrink-0"
                                    style={{ color: group.color || "#4f46e5" }}
                                  />
                                )}
                                <span>{group.label}</span>
                                <span
                                  className="font-mono tabular-nums text-[11px]"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  {group.items.length}
                                </span>
                              </button>

                              {isSublistGroup &&
                                sublistGroupId &&
                                !group.isDirect && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSelectScope({
                                        kind: "list",
                                        listId: sublistGroupId,
                                      })
                                    }
                                    className="text-[11px] font-medium px-1.5 py-0.5 rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
                                    style={{ color: "var(--text-muted)" }}
                                    title={`Open ${group.label}`}
                                  >
                                    Open
                                  </button>
                                )}
                            </div>
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

                    {/* Quick Drop Targets for Empty Sublists While Dragging */}
                    {emptySublistsForDrag.length > 0 && (
                      <div className="pt-1 space-y-1.5">
                        <div
                          className="text-[11px] font-medium"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Drop to move to sublist
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {emptySublistsForDrag.map((sub) => {
                            const isHover = sublistGroupDropTarget === sub.id;
                            const subColor =
                              sub.color ||
                              effectiveBaseList?.color ||
                              "#4f46e5";
                            return (
                              <div
                                key={sub.id}
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
                                  setSublistGroupDropTarget(sub.id);
                                }}
                                onDragLeave={(e) => {
                                  if (
                                    !e.currentTarget.contains(
                                      e.relatedTarget as Node,
                                    )
                                  ) {
                                    setSublistGroupDropTarget((prev) =>
                                      prev === sub.id ? null : prev,
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
                                  handleMoveItemToList(itemId, sub.id);
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
                                <CollectionIcon
                                  name={sub.icon}
                                  className="w-3.5 h-3.5"
                                  style={{ color: subColor }}
                                />
                                <span>{sub.title}</span>
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

            {/* Cohesive Bottom Capture Bar (Docked Mobile · Floating Desktop) */}
            {(currentList || isSmartScope) &&
              (splitVisible || localState.subTab === "items") &&
              (() => {
                const savedListTarget = listAddTargetByScope[scopeKey];
                const resolvedTargetListId =
                  scope.kind === "smart"
                    ? smartAddTargetListId && listById.has(smartAddTargetListId)
                      ? smartAddTargetListId
                      : activeLists[0]?.id || ""
                    : savedListTarget && listById.has(savedListTarget)
                      ? savedListTarget
                      : activeSublistFilter === "direct" && currentList
                        ? currentList.id
                        : focusedSublist
                          ? focusedSublist.id
                          : currentList?.id || activeLists[0]?.id || "";

                const resolvedCaptureStatus: ListItemStatus =
                  captureStatusByScope[scopeKey] ??
                  (scope.kind === "smart"
                    ? scope.status
                    : localState.statusFilter === "all"
                      ? "inbox"
                      : localState.statusFilter);

                return (
                  <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 lg:border-t-0 lg:bg-transparent lg:px-6 lg:pb-4 lg:pt-1">
                    <div className="max-w-5xl mx-auto">
                      <ListsCaptureBar
                        lists={activeLists}
                        targetListId={resolvedTargetListId}
                        onTargetListChange={(nextId) => {
                          if (scope.kind === "smart") {
                            setSmartAddTargetListId(nextId);
                          } else {
                            setListAddTargetByScope((prev) => ({
                              ...prev,
                              [scopeKey]: nextId,
                            }));
                          }
                        }}
                        status={resolvedCaptureStatus}
                        onStatusChange={(nextStatus) =>
                          setCaptureStatusByScope((prev) => ({
                            ...prev,
                            [scopeKey]: nextStatus,
                          }))
                        }
                        availableTags={scopeUniqueTags}
                        onSubmitItem={(targetId, raw, chosenStatus) => {
                          const created = handleQuickAddListItem(
                            targetId,
                            raw,
                            chosenStatus,
                          );
                          if (!created) return false;
                          if (
                            scope.kind === "list" &&
                            !scopedListIdSet?.has(targetId)
                          ) {
                            const targetTitle =
                              listById.get(targetId)?.title || "target list";
                            pushToast(`Added to ${targetTitle}`, "neutral");
                          } else if (
                            scope.kind === "smart" &&
                            chosenStatus !== scope.status
                          ) {
                            pushToast(
                              `Added to ${STATUS_META[chosenStatus].label}`,
                              "neutral",
                            );
                          }
                          return true;
                        }}
                        previewPosition="top"
                        compact
                        elevated
                      />
                    </div>
                  </div>
                );
              })()}
          </div>

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
                    onOpenAsTab={handleOpenItemTab}
                    onJumpToBookLocation={onJumpToBookLocation}
                    onJumpToNote={onJumpToNote}
                    onPlayYouTubeItem={handlePlayYouTubeItem}
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
      {(() => {
        const deleteBranchIds = deleteTargetList
          ? getDescendantListIds(deleteTargetList.id, listTreeIndex.childrenMap)
          : [];
        const deleteBranchIdSet = new Set(deleteBranchIds);
        const deleteListItemIds = deleteTargetList
          ? workspace.listItems
              .filter((it) => deleteBranchIdSet.has(it.listId))
              .map((it) => it.id)
          : [];
        const listLinkedStats = countLinkedNotesForListItems(
          workspace.entries,
          deleteListItemIds,
        );
        const otherFlatNodes = deleteTargetList
          ? flattenListTree(activeLists, deleteTargetList.id)
          : [];
        const labelById = new Map(
          otherFlatNodes.map((n) => [
            n.list.id,
            formatIndentedListOptionLabel(n),
          ]),
        );

        return (
          <DeleteListConfirmModal
            list={deleteTargetList}
            itemCount={deleteListItemIds.length}
            descendantCount={Math.max(0, deleteBranchIds.length - 1)}
            linkedNotesCount={listLinkedStats.totalAffectedNotes}
            exclusivelyLinkedNotesCount={
              listLinkedStats.exclusivelyLinkedNotes
            }
            sharedNotesCount={listLinkedStats.sharedNotes}
            otherLists={otherFlatNodes.map((n) => n.list)}
            getOptionLabel={(ol) => labelById.get(ol.id) || ol.title}
            onCancel={() => setDeleteTargetList(null)}
            onDelete={(moveToId, linkedNotesBehavior) => {
              if (!deleteTargetList) return;
              deleteList(deleteTargetList.id, moveToId, linkedNotesBehavior);
              setDeleteTargetList(null);
            }}
          />
        );
      })()}

      {/* Bulk Delete Linked Notes Confirmation Modal */}
      {(() => {
        const bulkCounts = pendingBulkDeleteIds
          ? countLinkedNotesForListItems(workspace.entries, pendingBulkDeleteIds)
          : { exclusivelyLinkedNotes: 0, sharedNotes: 0, totalAffectedNotes: 0 };
        return (
          <DeleteListItemsConfirmModal
            open={Boolean(pendingBulkDeleteIds && pendingBulkDeleteIds.length > 0)}
            itemCount={pendingBulkDeleteIds?.length ?? 0}
            exclusivelyLinkedNotesCount={bulkCounts.exclusivelyLinkedNotes}
            sharedNotesCount={bulkCounts.sharedNotes}
            onCancel={() => setPendingBulkDeleteIds(null)}
            onConfirm={(behavior) => {
              if (pendingBulkDeleteIds) {
                commitBulkDelete(pendingBulkDeleteIds, behavior);
              }
            }}
          />
        );
      })()}

      {/* Attach Existing Notes / Events Modal */}
      <AttachLinkedEntriesModal
        open={Boolean(attachModalKind && linkedContextList)}
        kind={attachModalKind || "notes"}
        list={linkedContextList}
        entries={attachModalCandidates}
        onToggleEntry={handleToggleLinkedEntry}
        onClose={() => setAttachModalKind(null)}
      />

      {/* Target List Picker Modal / BottomSheet for Tab Strip "+" */}
      <TargetListPickerModal
        open={targetListPickerOpen}
        isDesktop={isDesktop}
        lists={activeLists}
        listItemCounts={listItemCountsByCollection}
        defaultListId={
          focusedSublist?.id ?? currentList?.id ?? activeTabItem?.listId ?? null
        }
        onClose={() => setTargetListPickerOpen(false)}
        onSelectList={handleCreateItemTabInList}
        onCreateList={openCreateListModal}
      />

      {/* Mobile Slide-Up Filter & Layout Sheet */}
      <MobileListsFilterSheet
        open={mobileFilterOpen}
        onClose={() => setMobileFilterOpen(false)}
        isSmartScope={isSmartScope}
        hasSublists={effectiveHasSublists}
        viewMode={activeLayout.viewMode}
        groupBy={effectiveGroupBy}
        thenBy={effectiveThenBy}
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
            groupBy: isSmartScope
              ? "none"
              : hasSublists
                ? "sublist"
                : "status",
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
            className="relative z-10 w-full max-w-md rounded-2xl border p-5 space-y-4 max-h-[90dvh] overflow-y-auto"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold">
                {listModal.mode === "create"
                  ? listModal.parentId
                    ? "New Sublist"
                    : "New List Collection"
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
                placeholder={
                  listModal.parentId
                    ? "e.g. Philosophy, Systems, Fiction..."
                    : "e.g. Books to Read, Ship Roadmap..."
                }
                autoFocus
                className="w-full h-9 px-3 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            {activeLists.length > 0 && (
              <div className="space-y-1.5">
                <label
                  htmlFor="kanso-list-parent-select"
                  className="text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Parent List
                </label>
                <select
                  id="kanso-list-parent-select"
                  value={listModal.parentId || ""}
                  onChange={(e) =>
                    setListModal({
                      ...listModal,
                      parentId: e.target.value || null,
                    })
                  }
                  className="w-full h-9 px-2.5 rounded-lg border text-xs font-medium outline-none cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="">None (Top-level list)</option>
                  {flattenListTree(
                    activeLists,
                    listModal.mode === "edit" ? listModal.list?.id : undefined,
                  ).map((node) => (
                    <option key={node.list.id} value={node.list.id}>
                      {formatIndentedListOptionLabel(node)}
                    </option>
                  ))}
                </select>
              </div>
            )}

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
              <div className="flex items-center justify-between">
                <label
                  className="text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Icon
                </label>
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono"
                  style={{ color: "var(--text-muted)" }}
                >
                  <CollectionIcon
                    name={listModal.icon}
                    className="w-3.5 h-3.5"
                    style={{ color: listModal.color }}
                  />
                  <span>{listModal.icon}</span>
                </span>
              </div>
              <IconPicker
                value={listModal.icon}
                accentColor={listModal.color}
                onChange={(key) => setListModal({ ...listModal, icon: key })}
              />
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
    </div>
  );
};
