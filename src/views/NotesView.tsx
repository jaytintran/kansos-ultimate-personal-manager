import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  FileText,
  FolderOpen,
  GitBranch,
  GripVertical,
  LayoutGrid,
  Library,
  Link2,
  ListChecks,
  List as ListIcon,
  MoreVertical,
  Network,
  PanelLeftOpen,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { DynamicIcon, NotePageIcon } from "../components/IconLibrary";
import { IconPicker, IconPickerPopover } from "../components/IconPicker";
import { TruncatedNoteTitle } from "../components/notes/TruncatedNoteTitle";
import { BookCover } from "../components/library/BookCover";
import {
  NoteBranchActionPrompt,
  NoteDeleteBranchModal,
} from "../components/notes/NoteDeleteBranchModal";
import {
  ConnectionMapMode,
  NotesConnectionMap,
} from "../components/notes/NotesConnectionMap";
import {
  DEFAULT_NOTES_SIDEBAR_WIDTH,
  MAX_NOTES_SIDEBAR_WIDTH,
  MIN_NOTES_SIDEBAR_WIDTH,
  NotesLeftSidebar,
  NotesScope,
  NotesWorkspaceTab,
} from "../components/notes/NotesLeftSidebar";
import { NotesTabStrip } from "../components/notes/NotesTabStrip";
import { NoteTabEditor } from "../components/notes/NoteTabEditor";
import type { TimestampFieldFocus } from "../components/TimestampsModal";
import { RichContent } from "../components/RichContent";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  getNoteAncestorChain,
  getNoteDescendantIds,
  wouldCreateParentCycle,
} from "../lib/noteGraphUtils";
import {
  BookNoteLink,
  BookRecord,
  ContextMenuRecord,
  Entry,
  ListCollection,
  ListItem,
  NoteJumpRequest,
  NoteNotebook,
} from "../types";
import {
  countWordsFromHtml,
  formatCompactDayHeading,
  toLocalDateKey,
} from "../utils/date";
import { VIEW_PREFERENCE_SYNC_EVENT } from "../utils/viewPreferences";

type NoteSort = "custom" | "pinned" | "updated" | "created" | "title";
type NotesViewMode = "grid" | "list";

const SORT_STORAGE_KEY = "kanso_notes_sort_v1";
const VIEW_MODE_STORAGE_KEY = "kanso_notes_view_mode_v1";
const SIDEBAR_WIDTH_KEY = "kanso_notes_sidebar_width_v1";
const SIDEBAR_COLLAPSED_KEY = "kanso_notes_sidebar_collapsed_v1";
const CONN_OPEN_KEY = "kanso_notes_conn_open_v1";
const CONN_MODE_KEY = "kanso_notes_conn_mode_v1";
const WORKSPACE_STATE_STORAGE_KEY = "kanso_notes_workspace_state_v1";

interface PersistedNotesWorkspaceState {
  scope: NotesScope;
  drilledParentId: string | null;
  openTabIds: string[];
  activeTabId: string | null;
}

function isValidNotesScope(raw: unknown): raw is NotesScope {
  if (!raw || typeof raw !== "object") return false;
  const candidate = raw as { kind?: unknown; notebookId?: unknown };
  if (
    candidate.kind === "all" ||
    candidate.kind === "book_notes" ||
    candidate.kind === "list_notes" ||
    candidate.kind === "unfiled" ||
    candidate.kind === "archive"
  ) {
    return true;
  }
  return (
    candidate.kind === "notebook" &&
    typeof candidate.notebookId === "string" &&
    candidate.notebookId.length > 0
  );
}

function loadPersistedNotesWorkspaceState(): PersistedNotesWorkspaceState {
  const fallback: PersistedNotesWorkspaceState = {
    scope: { kind: "all" },
    drilledParentId: null,
    openTabIds: [],
    activeTabId: null,
  };
  try {
    const raw = localStorage.getItem(WORKSPACE_STATE_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedNotesWorkspaceState>;
    const scope: NotesScope = isValidNotesScope(parsed?.scope)
      ? parsed.scope
      : { kind: "all" };
    const drilledParentId =
      typeof parsed?.drilledParentId === "string" && parsed.drilledParentId
        ? parsed.drilledParentId
        : null;
    const openTabIds = Array.isArray(parsed?.openTabIds)
      ? Array.from(
          new Set(
            parsed.openTabIds.filter(
              (id): id is string => typeof id === "string" && id.length > 0,
            ),
          ),
        )
      : [];
    const activeTabId =
      typeof parsed?.activeTabId === "string" &&
      openTabIds.includes(parsed.activeTabId)
        ? parsed.activeTabId
        : null;
    return { scope, drilledParentId, openTabIds, activeTabId };
  } catch {
    return fallback;
  }
}

const LEGACY_EMOJI_ICON_MAP: Record<string, string> = {
  "📚": "BookOpen",
  "🌿": "Leaf",
  "✍️": "PenLine",
  "📓": "NotebookPen",
  "📝": "FileText",
};

function resolveNotebookIconName(rawIcon?: string): string {
  if (!rawIcon) return "BookOpen";
  if (LEGACY_EMOJI_ICON_MAP[rawIcon]) return LEGACY_EMOJI_ICON_MAP[rawIcon];
  return rawIcon;
}

function stripHtmlPreview(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface NotesViewProps {
  onOpenContextMenu: (record: ContextMenuRecord, e: React.MouseEvent) => void;
  onJumpToBookLocation?: (bookLink: BookNoteLink) => void;
  onJumpToListItem?: (listItemId: string) => void;
  onJumpToAiChat?: (chatId: string) => void;
  noteJumpRequest?: NoteJumpRequest | null;
  onOpenTimestamps?: (entryId: string, focus?: TimestampFieldFocus) => void;
}

export const NotesView: React.FC<NotesViewProps> = ({
  onOpenContextMenu,
  onJumpToBookLocation,
  onJumpToListItem,
  onJumpToAiChat,
  noteJumpRequest,
  onOpenTimestamps,
}) => {
  const {
    workspace,
    pushToast,
    updateEntry,
    addNotePage,
    deleteNotePage,
    archiveNotePage,
    addNoteNotebook,
    updateNoteNotebook,
    deleteNoteNotebook,
    reorderNoteNotebooks,
    reorderNoteEntries,
    toggleAiChatNoteLink,
  } = useWorkspace();

  const notebooks = useMemo(
    () => workspace.noteNotebooks || [],
    [workspace.noteNotebooks],
  );

  const initialWorkspaceState = useMemo(loadPersistedNotesWorkspaceState, []);

  const [scope, setScope] = useState<NotesScope>(initialWorkspaceState.scope);
  const [drilledParentId, setDrilledParentId] = useState<string | null>(
    initialWorkspaceState.drilledParentId,
  );
  const [openTabIds, setOpenTabIds] = useState<string[]>(
    initialWorkspaceState.openTabIds,
  );
  const [activeTabId, setActiveTabId] = useState<string | null>(
    initialWorkspaceState.activeTabId,
  );
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(
    initialWorkspaceState.activeTabId,
  );
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");

  const [sortBy, setSortBy] = useState<NoteSort>(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY) as NoteSort | null;
      return saved || "pinned";
    } catch {
      return "pinned";
    }
  });
  const [viewMode, setViewMode] = useState<NotesViewMode>(() => {
    try {
      const saved = localStorage.getItem(
        VIEW_MODE_STORAGE_KEY,
      ) as NotesViewMode | null;
      return saved === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });

  // Left sidebar & right connection map layout preferences
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
      if (Number.isFinite(raw) && raw >= MIN_NOTES_SIDEBAR_WIDTH && raw <= MAX_NOTES_SIDEBAR_WIDTH) {
        return raw;
      }
    } catch {
      // Ignore
    }
    return DEFAULT_NOTES_SIDEBAR_WIDTH;
  });
  const [sidebarCollapsedDesktop, setSidebarCollapsedDesktop] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [isWorkspaceTab, setIsWorkspaceTab] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mq = window.matchMedia("(min-width: 1024px)");
    const handleViewportChange = () => {
      if (mq.matches) {
        setIsWorkspaceTab(false);
      }
    };
    handleViewportChange();
    mq.addEventListener("change", handleViewportChange);
    return () => mq.removeEventListener("change", handleViewportChange);
  }, []);

  const [connOpenDesktop, setConnOpenDesktop] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CONN_OPEN_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [mobileConnOpen, setMobileConnOpen] = useState(false);
  const [connMode, setConnMode] = useState<ConnectionMapMode>(() => {
    try {
      return localStorage.getItem(CONN_MODE_KEY) === "graph" ? "graph" : "tree";
    } catch {
      return "tree";
    }
  });

  const [branchPrompt, setBranchPrompt] =
    useState<NoteBranchActionPrompt | null>(null);

  const [notebookModal, setNotebookModal] = useState<{
    mode: "create" | "edit";
    notebook?: NoteNotebook;
    name: string;
    icon: string;
  } | null>(null);

  const [iconPickerTarget, setIconPickerTarget] = useState<{
    noteId: string;
    mode: "grid" | "list";
  } | null>(null);

  // Drag & drop state (Note reordering, Note -> Notebook filing on mobile tab strip)
  const activeDragNoteIdRef = useRef<string | null>(null);
  const activeDragNotebookIdRef = useRef<string | null>(null);
  const noteElRefs = useRef<Map<string, HTMLElement>>(new Map());
  const notebookTabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const gridRef = useRef<HTMLDivElement>(null);

  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [noteDropTarget, setNoteDropTarget] = useState<{
    noteId: string;
    position: "before" | "after";
  } | null>(null);
  const [noteFileDropTargetId, setNoteFileDropTargetId] = useState<
    string | null
  >(null);

  const [draggingNotebookId, setDraggingNotebookId] = useState<string | null>(
    null,
  );
  const [notebookDropTarget, setNotebookDropTarget] = useState<{
    notebookId: string;
    position: "before" | "after";
  } | null>(null);

  const clearAllDragStates = useCallback(() => {
    activeDragNoteIdRef.current = null;
    activeDragNotebookIdRef.current = null;
    setDraggingNoteId(null);
    setNoteDropTarget(null);
    setNoteFileDropTargetId(null);
    setDraggingNotebookId(null);
    setNotebookDropTarget(null);
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
      localStorage.setItem(SORT_STORAGE_KEY, sortBy);
    } catch {
      // Ignore
    }
  }, [sortBy]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // Ignore
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    } catch {
      // Ignore
    }
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsedDesktop));
    } catch {
      // Ignore
    }
  }, [sidebarCollapsedDesktop]);

  useEffect(() => {
    try {
      localStorage.setItem(CONN_OPEN_KEY, String(connOpenDesktop));
    } catch {
      // Ignore
    }
  }, [connOpenDesktop]);

  useEffect(() => {
    try {
      localStorage.setItem(CONN_MODE_KEY, connMode);
    } catch {
      // Ignore
    }
  }, [connMode]);

  useEffect(() => {
    const onSynced = () => {
      try {
        const savedSort = localStorage.getItem(SORT_STORAGE_KEY) as NoteSort | null;
        setSortBy(savedSort || "pinned");
        const savedView = localStorage.getItem(
          VIEW_MODE_STORAGE_KEY,
        ) as NotesViewMode | null;
        setViewMode(savedView === "list" ? "list" : "grid");
      } catch {
        // Ignore
      }
    };
    window.addEventListener(VIEW_PREFERENCE_SYNC_EVENT, onSynced);
    return () => {
      window.removeEventListener(VIEW_PREFERENCE_SYNC_EVENT, onSynced);
    };
  }, []);

  // Reset to 'all' if the selected notebook is deleted
  useEffect(() => {
    if (
      scope.kind === "notebook" &&
      !notebooks.some((nb) => nb.id === scope.notebookId)
    ) {
      setScope({ kind: "all" });
      setDrilledParentId(null);
    }
  }, [notebooks, scope]);

  const notebookMap = useMemo(() => {
    const map = new Map<string, NoteNotebook>();
    notebooks.forEach((nb) => map.set(nb.id, nb));
    return map;
  }, [notebooks]);

  const bookById = useMemo(() => {
    const map = new Map<string, BookRecord>();
    (workspace.books || []).forEach((b) => map.set(b.id, b));
    return map;
  }, [workspace.books]);

  const listById = useMemo(() => {
    const map = new Map<string, ListCollection>();
    (workspace.lists || []).forEach((l) => map.set(l.id, l));
    return map;
  }, [workspace.lists]);

  const listItemById = useMemo(() => {
    const map = new Map<string, ListItem>();
    (workspace.listItems || []).forEach((it) => map.set(it.id, it));
    return map;
  }, [workspace.listItems]);

  const allNotes = useMemo(
    () => workspace.entries.filter((e) => e.type === "note" && !e.archived),
    [workspace.entries],
  );

  const archivedNotes = useMemo(
    () => workspace.entries.filter((e) => e.type === "note" && Boolean(e.archived)),
    [workspace.entries],
  );

  const noteById = useMemo(() => new Map(allNotes.map((n) => [n.id, n])), [allNotes]);
  const anyNoteById = useMemo(() => {
    const map = new Map<string, Entry>();
    allNotes.forEach((n) => map.set(n.id, n));
    archivedNotes.forEach((n) => map.set(n.id, n));
    return map;
  }, [allNotes, archivedNotes]);

  const directChildCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of allNotes) {
      if (n.parentId && noteById.has(n.parentId) && n.parentId !== n.id) {
        counts.set(n.parentId, (counts.get(n.parentId) || 0) + 1);
      }
    }
    return counts;
  }, [allNotes, noteById]);

  // Clear drill-down if parent note no longer exists
  useEffect(() => {
    if (drilledParentId && !noteById.has(drilledParentId)) {
      setDrilledParentId(null);
    }
  }, [drilledParentId, noteById]);

  // Reconcile open tabs & active tab with live notes (drop deleted notes)
  useEffect(() => {
    const filteredIds = openTabIds.filter((id) => anyNoteById.has(id));
    if (filteredIds.length !== openTabIds.length) {
      let nextActive = activeTabId;
      if (activeTabId && !anyNoteById.has(activeTabId)) {
        const prevIndex = openTabIds.indexOf(activeTabId);
        nextActive =
          filteredIds[prevIndex] ??
          filteredIds[prevIndex - 1] ??
          filteredIds[0] ??
          null;
      }
      setOpenTabIds(filteredIds);
      setActiveTabId(nextActive);
    } else if (activeTabId && !filteredIds.includes(activeTabId)) {
      setActiveTabId(null);
    }
  }, [anyNoteById, openTabIds, activeTabId]);

  // Keep focused note in sync with active note tab (for sidebar & connection map)
  useEffect(() => {
    if (activeTabId) {
      setFocusedNoteId(activeTabId);
    }
  }, [activeTabId]);

  // Persist local-only workspace state (NOT synced via GitHub Gist)
  useEffect(() => {
    try {
      const payload: PersistedNotesWorkspaceState = {
        scope,
        drilledParentId,
        openTabIds,
        activeTabId,
      };
      localStorage.setItem(
        WORKSPACE_STATE_STORAGE_KEY,
        JSON.stringify(payload),
      );
    } catch {
      // Ignore storage failures
    }
  }, [scope, drilledParentId, openTabIds, activeTabId]);

  const openNotes = useMemo(
    () =>
      openTabIds
        .map((id) => anyNoteById.get(id))
        .filter((n): n is Entry => Boolean(n)),
    [openTabIds, anyNoteById],
  );

  const activeTabNote = useMemo(
    () => (activeTabId ? anyNoteById.get(activeTabId) ?? null : null),
    [activeTabId, anyNoteById],
  );

  const bookNotes = useMemo(
    () => allNotes.filter((n) => Boolean(n.bookLink)),
    [allNotes],
  );

  const listNotes = useMemo(
    () => allNotes.filter((n) => (n.listItemLinks || []).length > 0),
    [allNotes],
  );

  const notebookCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let unfiled = 0;
    allNotes.forEach((n) => {
      if (n.notebookId && notebookMap.has(n.notebookId)) {
        counts.set(n.notebookId, (counts.get(n.notebookId) || 0) + 1);
      } else if (!n.bookLink) {
        unfiled += 1;
      }
    });
    return { counts, unfiled };
  }, [allNotes, notebookMap]);

  const notesInScope = useMemo(() => {
    if (scope.kind === "archive") return archivedNotes;
    if (scope.kind === "all") return allNotes;
    if (scope.kind === "book_notes") return bookNotes;
    if (scope.kind === "list_notes") return listNotes;
    if (scope.kind === "unfiled") {
      return allNotes.filter(
        (n) => (!n.notebookId || !notebookMap.has(n.notebookId)) && !n.bookLink,
      );
    }
    return allNotes.filter((n) => n.notebookId === scope.notebookId);
  }, [allNotes, archivedNotes, bookNotes, listNotes, scope, notebookMap]);

  const scopeTags = useMemo(() => {
    const set = new Set<string>();
    notesInScope.forEach((n) => (n.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [notesInScope]);

  useEffect(() => {
    if (selectedTag !== "all" && !scopeTags.includes(selectedTag)) {
      setSelectedTag("all");
    }
  }, [selectedTag, scopeTags]);

  const customNoteOrderCompare = useCallback((a: Entry, b: Entry) => {
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
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    const aTime = new Date(a.updatedAt || a.createdAt).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt).getTime();
    return bTime - aTime || a.id.localeCompare(b.id);
  }, []);

  const isCustomSort = sortBy === "custom";
  const hasActiveSearchOrTag = Boolean(search.trim()) || selectedTag !== "all";

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    const scopeIds = new Set(notesInScope.map((n) => n.id));

    return notesInScope
      .filter((note) => {
        if (selectedTag !== "all" && !(note.tags || []).includes(selectedTag))
          return false;

        if (q) {
          const matchesListItemLinks = (note.listItemLinks || []).some((l) => {
            const liveItem = l.listItemId
              ? listItemById.get(l.listItemId)
              : undefined;
            const liveList = liveItem
              ? listById.get(liveItem.listId)
              : l.listId
                ? listById.get(l.listId)
                : undefined;
            return (
              l.itemTitle.toLowerCase().includes(q) ||
              Boolean(liveItem?.title.toLowerCase().includes(q)) ||
              Boolean(l.listTitle?.toLowerCase().includes(q)) ||
              Boolean(liveList?.title.toLowerCase().includes(q)) ||
              Boolean(l.quote?.toLowerCase().includes(q))
            );
          });
          return (
            note.title.toLowerCase().includes(q) ||
            note.content.toLowerCase().includes(q) ||
            (note.tags || []).some((t) => t.toLowerCase().includes(q)) ||
            Boolean(note.bookLink?.bookTitle.toLowerCase().includes(q)) ||
            Boolean(note.bookLink?.bookAuthor?.toLowerCase().includes(q)) ||
            Boolean(note.bookLink?.locationLabel.toLowerCase().includes(q)) ||
            matchesListItemLinks
          );
        }

        // Hierarchy filtering when not searching/tag-filtering & not in book_notes/list_notes/archive
        if (
          !hasActiveSearchOrTag &&
          scope.kind !== "book_notes" &&
          scope.kind !== "list_notes" &&
          scope.kind !== "archive"
        ) {
          if (drilledParentId) {
            return note.parentId === drilledParentId;
          }
          // Root level within scope
          return !note.parentId || !scopeIds.has(note.parentId) || note.parentId === note.id;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "custom") return customNoteOrderCompare(a, b);
        if (sortBy === "pinned") {
          if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
          return (
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
          );
        }
        if (sortBy === "updated") {
          return (
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
          );
        }
        if (sortBy === "created") {
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }
        return a.title.localeCompare(b.title);
      });
  }, [
    notesInScope,
    search,
    selectedTag,
    hasActiveSearchOrTag,
    scope.kind,
    drilledParentId,
    sortBy,
    customNoteOrderCompare,
    listItemById,
    listById,
  ]);

  const groupedBookNotes = useMemo(() => {
    if (scope.kind !== "book_notes") return [];
    const groups = new Map<
      string,
      {
        key: string;
        liveBook: BookRecord | null;
        title: string;
        author?: string;
        notes: Entry[];
      }
    >();

    for (const note of filteredNotes) {
      const link = note.bookLink;
      if (!link) continue;
      const liveBook = link.bookId ? bookById.get(link.bookId) ?? null : null;
      const groupKey = liveBook
        ? `live:${liveBook.id}`
        : `removed:${(link.bookTitle || "Untitled Book").toLowerCase()}`;
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          key: groupKey,
          liveBook,
          title: liveBook?.title || link.bookTitle || "Untitled Book",
          author: liveBook?.author || link.bookAuthor,
          notes: [],
        };
        groups.set(groupKey, group);
      }
      group.notes.push(note);
    }

    return Array.from(groups.values());
  }, [scope.kind, filteredNotes, bookById]);

  const groupedListNotes = useMemo(() => {
    if (scope.kind !== "list_notes") return [];
    const groups = new Map<
      string,
      {
        key: string;
        liveItem: ListItem | null;
        liveList: ListCollection | null;
        itemTitle: string;
        listTitle?: string;
        listColor?: string;
        isRemoved: boolean;
        notes: Array<{ note: Entry; quote?: string }>;
        seenNoteIds: Set<string>;
      }
    >();

    for (const note of filteredNotes) {
      for (const link of note.listItemLinks || []) {
        const liveItem = link.listItemId
          ? listItemById.get(link.listItemId) ?? null
          : null;
        const liveList = liveItem
          ? listById.get(liveItem.listId) ?? null
          : link.listId
            ? listById.get(link.listId) ?? null
            : null;
        const isRemoved = !liveItem || Boolean(link.itemRemoved);
        const itemTitle = liveItem?.title || link.itemTitle || "Untitled Item";
        const groupKey = liveItem
          ? `live:${liveItem.id}`
          : `removed:${link.listId || ""}:${itemTitle.toLowerCase()}`;
        let group = groups.get(groupKey);
        if (!group) {
          group = {
            key: groupKey,
            liveItem,
            liveList,
            itemTitle,
            listTitle: liveList?.title || link.listTitle,
            listColor: liveList?.color || link.listColor,
            isRemoved,
            notes: [],
            seenNoteIds: new Set<string>(),
          };
          groups.set(groupKey, group);
        }
        if (!group.seenNoteIds.has(note.id)) {
          group.seenNoteIds.add(note.id);
          group.notes.push({ note, quote: link.quote });
        }
      }
    }

    return Array.from(groups.values());
  }, [scope.kind, filteredNotes, listItemById, listById]);

  const handleSelectScope = useCallback((nextScope: NotesScope) => {
    setScope(nextScope);
    setDrilledParentId(null);
    setActiveTabId(null);
    setIsWorkspaceTab(false);
  }, []);

  const handleOpenNoteById = useCallback(
    (noteId: string) => {
      if (!anyNoteById.has(noteId)) return;
      setFocusedNoteId(noteId);
      setOpenTabIds((prev) =>
        prev.includes(noteId) ? prev : [...prev, noteId],
      );
      setActiveTabId(noteId);
      setIsWorkspaceTab(false);
    },
    [anyNoteById],
  );

  const lastConsumedNoteJumpNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!noteJumpRequest) return;
    if (lastConsumedNoteJumpNonceRef.current === noteJumpRequest.nonce) return;
    lastConsumedNoteJumpNonceRef.current = noteJumpRequest.nonce;
    if (!anyNoteById.has(noteJumpRequest.noteId)) {
      pushToast("Linked note no longer exists", "neutral");
      return;
    }
    setFocusedNoteId(noteJumpRequest.noteId);
    setOpenTabIds((prev) =>
      prev.includes(noteJumpRequest.noteId)
        ? prev
        : [...prev, noteJumpRequest.noteId],
    );
    setActiveTabId(noteJumpRequest.noteId);
    setIsWorkspaceTab(false);
  }, [noteJumpRequest, anyNoteById, pushToast]);

  const handleCloseNoteTab = useCallback(
    (noteId: string) => {
      setOpenTabIds((prev) => {
        const idx = prev.indexOf(noteId);
        if (idx === -1) return prev;
        const next = prev.filter((id) => id !== noteId);
        if (activeTabId === noteId) {
          const fallbackId = next[idx] ?? next[idx - 1] ?? null;
          setActiveTabId(fallbackId);
          setIsWorkspaceTab(false);
        }
        return next;
      });
    },
    [activeTabId],
  );

  const handleCloseOtherTabs = useCallback((keepNoteId: string) => {
    setOpenTabIds((prev) => (prev.includes(keepNoteId) ? [keepNoteId] : []));
    setActiveTabId(keepNoteId);
    setIsWorkspaceTab(false);
  }, []);

  const handleCloseAllTabs = useCallback(() => {
    setOpenTabIds([]);
    setActiveTabId(null);
    setIsWorkspaceTab(false);
  }, []);

  const handleReorderNoteTabs = useCallback(
    (draggedId: string, targetId: string, position: "before" | "after") => {
      if (!draggedId || !targetId || draggedId === targetId) return;
      setOpenTabIds((prev) => {
        if (!prev.includes(draggedId) || !prev.includes(targetId)) return prev;
        const remaining = prev.filter((id) => id !== draggedId);
        const targetIndex = remaining.indexOf(targetId);
        if (targetIndex === -1) return prev;
        const insertIndex =
          position === "before" ? targetIndex : targetIndex + 1;
        return [
          ...remaining.slice(0, insertIndex),
          draggedId,
          ...remaining.slice(insertIndex),
        ];
      });
    },
    [],
  );

  const handleCreateNoteDirect = useCallback(
    (options?: {
      notebookId?: string | null;
      parentId?: string | null;
      title?: string;
    }) => {
      const created = addNotePage({
        title: options?.title ?? "",
        content: "",
        notebookId: options?.notebookId ?? null,
        parentId: options?.parentId ?? null,
        syncToTimeline: workspace.settings.defaultNoteTimelineSync ?? false,
      });
      setFocusedNoteId(created.id);
      setOpenTabIds((prev) => [...prev, created.id]);
      setActiveTabId(created.id);
      setIsWorkspaceTab(false);
      return created;
    },
    [addNotePage, workspace.settings.defaultNoteTimelineSync],
  );

  const handleNestNoteUnderParent = useCallback(
    (draggedNoteId: string, newParentId: string | null) => {
      if (newParentId && wouldCreateParentCycle(draggedNoteId, newParentId, allNotes)) {
        pushToast("Cannot move a note inside its own sub-page", "neutral");
        return;
      }
      const parentNote = newParentId ? noteById.get(newParentId) : null;
      updateEntry(draggedNoteId, {
        parentId: newParentId,
        ...(parentNote ? { notebookId: parentNote.notebookId ?? null } : {}),
      });
      pushToast(
        parentNote
          ? `Nested under "${parentNote.title || "Untitled Note"}"`
          : "Moved to top level",
        "success",
      );
    },
    [allNotes, noteById, updateEntry, pushToast],
  );

  const handleMoveNoteToNotebook = useCallback(
    (noteId: string, targetNotebookId: string | null) => {
      const note = allNotes.find((n) => n.id === noteId);
      if (!note) return;
      const patch: Partial<Entry> = { notebookId: targetNotebookId };
      // If note had a parent in a different notebook, detach parent so it appears cleanly in target notebook
      if (note.parentId) {
        const parent = noteById.get(note.parentId);
        if (!parent || (parent.notebookId ?? null) !== targetNotebookId) {
          patch.parentId = null;
        }
      }
      updateEntry(noteId, patch);
      if (targetNotebookId === null) {
        pushToast("Moved note to Unfiled", "success");
      } else {
        const nb = notebookMap.get(targetNotebookId);
        pushToast(
          nb ? `Moved to "${nb.name}"` : "Moved note to notebook",
          "success",
        );
      }
    },
    [allNotes, noteById, notebookMap, updateEntry, pushToast],
  );

  const handleReorderNotes = useCallback(
    (draggedId: string, targetNoteId: string, position: "before" | "after") => {
      if (!draggedId || !targetNoteId || draggedId === targetNoteId) return;
      const visibleIds = filteredNotes.map((n) => n.id);
      if (!visibleIds.includes(draggedId) || !visibleIds.includes(targetNoteId))
        return;

      const remainingVisible = visibleIds.filter((id) => id !== draggedId);
      const targetIndex = remainingVisible.indexOf(targetNoteId);
      if (targetIndex === -1) return;

      const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
      const nextVisibleIds = [
        ...remainingVisible.slice(0, insertIndex),
        draggedId,
        ...remainingVisible.slice(insertIndex),
      ];

      if (nextVisibleIds.every((id, idx) => id === visibleIds[idx])) return;

      const visibleSet = new Set(visibleIds);
      const globalSorted = [...allNotes].sort(customNoteOrderCompare);
      const byId = new Map(allNotes.map((n) => [n.id, n]));
      let visibleCursor = 0;
      const reorderedGlobal: Entry[] = [];

      for (const note of globalSorted) {
        if (visibleSet.has(note.id)) {
          const nextId = nextVisibleIds[visibleCursor++];
          const nextNote = nextId ? byId.get(nextId) : undefined;
          if (nextNote) reorderedGlobal.push(nextNote);
        } else {
          reorderedGlobal.push(note);
        }
      }
      while (visibleCursor < nextVisibleIds.length) {
        const nextNote = byId.get(nextVisibleIds[visibleCursor++]);
        if (nextNote) reorderedGlobal.push(nextNote);
      }

      const sortOrderById: Record<string, number> = {};
      reorderedGlobal.forEach((n, idx) => {
        sortOrderById[n.id] = idx;
      });
      reorderNoteEntries(sortOrderById);
    },
    [filteredNotes, allNotes, customNoteOrderCompare, reorderNoteEntries],
  );

  const requestDeleteOrArchiveNote = useCallback(
    (note: Entry, action: "delete" | "archive") => {
      const descendants = getNoteDescendantIds(note.id, allNotes);
      if (!note.archived && descendants.size > 0) {
        setBranchPrompt({
          action,
          noteId: note.id,
          noteTitle: note.title || "Untitled Note",
          directChildCount: directChildCounts.get(note.id) || 0,
          totalDescendantCount: descendants.size,
        });
        return;
      }
      if (action === "archive") {
        archiveNotePage(note.id, true, "promote");
      } else {
        deleteNotePage(note.id, "promote");
        pushToast("Note deleted");
      }
    },
    [allNotes, directChildCounts, archiveNotePage, deleteNotePage, pushToast],
  );

  const isSingleColumnGrid = useCallback(() => {
    if (viewMode === "list") return true;
    const grid = gridRef.current;
    if (grid) {
      const cols = getComputedStyle(grid)
        .gridTemplateColumns.split(" ")
        .filter(Boolean).length;
      if (cols > 0) return cols === 1;
    }
    return typeof window !== "undefined" ? window.innerWidth < 640 : false;
  }, [viewMode]);

  const resolveTouchDrop = useCallback(
    (
      clientX: number,
      clientY: number,
      activeNoteId: string,
    ): {
      noteTarget: { noteId: string; position: "before" | "after" } | null;
      notebookTargetId: string | null;
    } => {
      for (const [tabId, el] of notebookTabRefs.current.entries()) {
        const rect = el.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return { noteTarget: null, notebookTargetId: tabId };
        }
      }

      const singleCol = isSingleColumnGrid();
      for (const note of filteredNotes) {
        if (note.id === activeNoteId) continue;
        const el = noteElRefs.current.get(note.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          const position: "before" | "after" = singleCol
            ? clientY < rect.top + rect.height / 2
              ? "before"
              : "after"
            : clientX < rect.left + rect.width / 2
              ? "before"
              : "after";
          return {
            noteTarget: { noteId: note.id, position },
            notebookTargetId: null,
          };
        }
      }
      return { noteTarget: null, notebookTargetId: null };
    },
    [filteredNotes, isSingleColumnGrid],
  );

  const activeNotebook =
    scope.kind === "notebook"
      ? notebookMap.get(scope.notebookId) || null
      : null;

  const drilledParentNote = drilledParentId
    ? noteById.get(drilledParentId) || null
    : null;
  const drilledAncestors = useMemo(
    () =>
      drilledParentNote
        ? [...getNoteAncestorChain(drilledParentNote.id, noteById), drilledParentNote]
        : [],
    [drilledParentNote, noteById],
  );

  const handleSaveNotebookModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notebookModal || !notebookModal.name.trim()) return;
    if (notebookModal.mode === "create") {
      const created = addNoteNotebook(
        notebookModal.name.trim(),
        notebookModal.icon,
      );
      handleSelectScope({ kind: "notebook", notebookId: created.id });
    } else if (notebookModal.notebook) {
      updateNoteNotebook(notebookModal.notebook.id, {
        name: notebookModal.name.trim(),
        icon: notebookModal.icon,
      });
    }
    setNotebookModal(null);
  };

  const handleDeleteNotebook = (nb: NoteNotebook) => {
    deleteNoteNotebook(nb.id);
    if (scope.kind === "notebook" && scope.notebookId === nb.id) {
      handleSelectScope({ kind: "all" });
    }
  };

  const scopeTitle = activeNotebook
    ? activeNotebook.name
    : scope.kind === "book_notes"
      ? "Book Notes"
      : scope.kind === "list_notes"
        ? "From Lists"
        : scope.kind === "unfiled"
          ? "Unfiled Notes"
          : scope.kind === "archive"
            ? "Archived Notes"
            : "All Notes";

  const homeTabMeta = useMemo(() => {
    if (drilledParentNote) {
      return {
        label: drilledParentNote.title?.trim() || "Untitled Note",
        icon: drilledParentNote.icon || "FileText",
      };
    }
    if (activeNotebook) {
      return {
        label: activeNotebook.name,
        icon: resolveNotebookIconName(activeNotebook.icon),
      };
    }
    switch (scope.kind) {
      case "book_notes":
        return { label: "Book Notes", icon: "Library" };
      case "list_notes":
        return { label: "From Lists", icon: "ListChecks" };
      case "unfiled":
        return { label: "Unfiled Notes", icon: "FolderOpen" };
      case "archive":
        return { label: "Archived Notes", icon: "Archive" };
      case "all":
      default:
        return { label: "Notes", icon: "BookOpen" };
    }
  }, [drilledParentNote, activeNotebook, scope.kind]);

  return (
    <div className="h-full flex-1 min-h-0 lg:h-dvh flex overflow-hidden">
      {/* Desktop Resizable/Collapsible Left Sidebar */}
      <NotesLeftSidebar
        allNotes={allNotes}
        archivedNotesCount={archivedNotes.length}
        bookNotesCount={bookNotes.length}
        listNotesCount={listNotes.length}
        notebooks={notebooks}
        scope={scope}
        focusedNoteId={focusedNoteId}
        sidebarWidth={sidebarWidth}
        isCollapsedDesktop={sidebarCollapsedDesktop}
        onCollapseDesktop={() => setSidebarCollapsedDesktop(true)}
        onSidebarWidthChange={setSidebarWidth}
        onSelectScope={handleSelectScope}
        onOpenNote={handleOpenNoteById}
        onCreateNote={handleCreateNoteDirect}
        onRenameNote={(noteId, newTitle) => updateEntry(noteId, { title: newTitle })}
        onTogglePinNote={(note) => {
          updateEntry(note.id, { pinned: !note.pinned });
          pushToast(note.pinned ? "Note unpinned" : "Note pinned", "success");
        }}
        onDeleteNote={(note) => requestDeleteOrArchiveNote(note, "delete")}
        onCreateNotebook={() =>
          setNotebookModal({
            mode: "create",
            name: "",
            icon: "BookOpen",
          })
        }
        onEditNotebook={(nb) =>
          setNotebookModal({
            mode: "edit",
            notebook: nb,
            name: nb.name,
            icon: resolveNotebookIconName(nb.icon),
          })
        }
        onDeleteNotebook={handleDeleteNotebook}
        onNestNoteUnderParent={handleNestNoteUnderParent}
        onMoveNoteToNotebook={handleMoveNoteToNotebook}
        onReorderNotebook={reorderNoteNotebooks}
      />

      {/* Center Notes Studio Canvas */}
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
        <NotesTabStrip
          openNotes={openNotes}
          activeTabId={activeTabNote ? activeTabNote.id : null}
          isWorkspaceActive={isWorkspaceTab}
          homeTabLabel={homeTabMeta.label}
          homeTabIcon={homeTabMeta.icon}
          onSelectWorkspace={() => setIsWorkspaceTab(true)}
          onSelectHome={() => {
            setIsWorkspaceTab(false);
            setActiveTabId(null);
          }}
          onSelectTab={handleOpenNoteById}
          onCloseTab={handleCloseNoteTab}
          onCloseOtherTabs={handleCloseOtherTabs}
          onCloseAllTabs={handleCloseAllTabs}
          onReorderTabs={handleReorderNoteTabs}
          onCreateNoteTab={() =>
            handleCreateNoteDirect({
              notebookId: activeNotebook ? activeNotebook.id : null,
              parentId: drilledParentNote ? drilledParentNote.id : null,
            })
          }
        />

        {isWorkspaceTab ? (
          <NotesWorkspaceTab
            allNotes={allNotes}
            archivedNotesCount={archivedNotes.length}
            bookNotesCount={bookNotes.length}
            listNotesCount={listNotes.length}
            notebooks={notebooks}
            scope={scope}
            focusedNoteId={focusedNoteId}
            onSelectScope={handleSelectScope}
            onOpenNote={handleOpenNoteById}
            onCreateNote={handleCreateNoteDirect}
            onRenameNote={(noteId, newTitle) => updateEntry(noteId, { title: newTitle })}
            onTogglePinNote={(note) => {
              updateEntry(note.id, { pinned: !note.pinned });
              pushToast(note.pinned ? "Note unpinned" : "Note pinned", "success");
            }}
            onDeleteNote={(note) => requestDeleteOrArchiveNote(note, "delete")}
            onCreateNotebook={() =>
              setNotebookModal({
                mode: "create",
                name: "",
                icon: "BookOpen",
              })
            }
            onEditNotebook={(nb) =>
              setNotebookModal({
                mode: "edit",
                notebook: nb,
                name: nb.name,
                icon: resolveNotebookIconName(nb.icon),
              })
            }
            onDeleteNotebook={handleDeleteNotebook}
            onNestNoteUnderParent={handleNestNoteUnderParent}
            onMoveNoteToNotebook={handleMoveNoteToNotebook}
            onReorderNotebook={reorderNoteNotebooks}
          />
        ) : activeTabNote ? (
          <NoteTabEditor
            key={activeTabNote.id}
            note={activeTabNote}
            allActiveNotes={allNotes}
            sidebarCollapsedDesktop={sidebarCollapsedDesktop}
            connOpenDesktop={connOpenDesktop}
            onExpandDesktopSidebar={() => setSidebarCollapsedDesktop(false)}
            onToggleDesktopConnections={() => setConnOpenDesktop((v) => !v)}
            onOpenMobileConnections={() => setMobileConnOpen(true)}
            onOpenNoteTab={handleOpenNoteById}
            onCreateNoteTab={handleCreateNoteDirect}
            onOpenTimestamps={onOpenTimestamps}
            onJumpToBookLocation={onJumpToBookLocation}
            onJumpToListItem={onJumpToListItem}
            onRequestArchive={(n) => requestDeleteOrArchiveNote(n, "archive")}
            onRequestDelete={(n) => requestDeleteOrArchiveNote(n, "delete")}
            onRestoreNote={(noteId) => {
              archiveNotePage(noteId, false, "promote");
              pushToast("Note restored", "success");
            }}
          />
        ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Pinned Header + Mobile Notebooks Strip + Search/Sort Toolbar */}
          <div
            className="shrink-0 relative z-20 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 pb-3 border-b bg-[var(--bg-canvas)] space-y-3"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            {/* Header */}
            <header
              className="flex flex-wrap items-center justify-between gap-3"
              style={{ borderColor: "var(--border-subtle)" }}
            >
            <div className="flex items-center gap-2 min-w-0">
              {/* Desktop collapsed sidebar reopen */}
              {sidebarCollapsedDesktop && (
                <button
                  type="button"
                  onClick={() => setSidebarCollapsedDesktop(false)}
                  title="Show notes sidebar"
                  aria-label="Show notes sidebar"
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

              <div className="flex items-baseline gap-2.5 min-w-0">
                <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight truncate">
                  {scopeTitle}
                </h1>
                <span
                  className="text-xs font-mono tabular-nums shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  {notesInScope.length}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {activeNotebook && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setNotebookModal({
                        mode: "edit",
                        notebook: activeNotebook,
                        name: activeNotebook.name,
                        icon: resolveNotebookIconName(activeNotebook.icon),
                      })
                    }
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                    title="Rename notebook"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteNotebook(activeNotebook)}
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--danger)",
                    }}
                    title="Delete notebook (notes are preserved)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                </>
              )}

              {/* Connection Map Toggle (Desktop & Mobile) */}
              <button
                type="button"
                onClick={() => setConnOpenDesktop((v) => !v)}
                aria-pressed={connOpenDesktop}
                title={
                  connOpenDesktop
                    ? "Hide connection map"
                    : "Show connection map (Tree & Graph)"
                }
                className="hidden lg:inline-flex h-8 px-2.5 rounded-lg border text-xs font-medium items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                style={{
                  backgroundColor: connOpenDesktop
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                  borderColor: connOpenDesktop
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                  color: connOpenDesktop
                    ? "var(--accent)"
                    : "var(--text-secondary)",
                }}
              >
                <Network className="w-3.5 h-3.5" />
                <span>Connections</span>
              </button>

              <button
                type="button"
                onClick={() => setMobileConnOpen(true)}
                aria-label="Open connections map"
                title="Connections map"
                className="lg:hidden h-8 w-8 flex items-center justify-center rounded-lg border"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                <Network className="w-4 h-4" />
              </button>

              {scope.kind !== "archive" && (
                <button
                  type="button"
                  onClick={() =>
                    handleCreateNoteDirect({
                      notebookId: activeNotebook ? activeNotebook.id : null,
                      parentId: drilledParentNote ? drilledParentNote.id : null,
                    })
                  }
                  className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{drilledParentNote ? "Sub-page" : "New Note"}</span>
                </button>
              )}
            </div>
          </header>

          {/* MOBILE ONLY (< lg): Horizontal Scrolling Notebooks Strip */}
          <nav
            aria-label="Notebooks"
            className="lg:hidden flex items-center gap-1 overflow-x-auto no-scrollbar border-b"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <button
              type="button"
              onClick={() => handleSelectScope({ kind: "all" })}
              className="h-10 px-3 inline-flex items-center gap-2 text-xs font-medium shrink-0 border-b-2 transition-colors whitespace-nowrap"
              style={{
                borderColor:
                  scope.kind === "all" ? "var(--accent)" : "transparent",
                color:
                  scope.kind === "all"
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                backgroundColor:
                  scope.kind === "all" ? "var(--accent-soft)" : "transparent",
              }}
            >
              <BookOpen
                className="w-3.5 h-3.5 shrink-0"
                style={{
                  color:
                    scope.kind === "all"
                      ? "var(--accent)"
                      : "var(--text-muted)",
                }}
              />
              <span className={scope.kind === "all" ? "font-semibold" : ""}>
                All Notes
              </span>
              <span className="font-mono tabular-nums text-[11px] opacity-75">
                {allNotes.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectScope({ kind: "book_notes" })}
              className="h-10 px-3 inline-flex items-center gap-2 text-xs font-medium shrink-0 border-b-2 transition-colors whitespace-nowrap"
              style={{
                borderColor:
                  scope.kind === "book_notes" ? "var(--accent)" : "transparent",
                color:
                  scope.kind === "book_notes"
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                backgroundColor:
                  scope.kind === "book_notes"
                    ? "var(--accent-soft)"
                    : "transparent",
              }}
            >
              <Library
                className="w-3.5 h-3.5 shrink-0"
                style={{
                  color:
                    scope.kind === "book_notes"
                      ? "var(--accent)"
                      : "var(--text-muted)",
                }}
              />
              <span className={scope.kind === "book_notes" ? "font-semibold" : ""}>
                Book Notes
              </span>
              <span className="font-mono tabular-nums text-[11px] opacity-75">
                {bookNotes.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectScope({ kind: "list_notes" })}
              className="h-10 px-3 inline-flex items-center gap-2 text-xs font-medium shrink-0 border-b-2 transition-colors whitespace-nowrap"
              style={{
                borderColor:
                  scope.kind === "list_notes" ? "var(--accent)" : "transparent",
                color:
                  scope.kind === "list_notes"
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                backgroundColor:
                  scope.kind === "list_notes"
                    ? "var(--accent-soft)"
                    : "transparent",
              }}
            >
              <ListChecks
                className="w-3.5 h-3.5 shrink-0"
                style={{
                  color:
                    scope.kind === "list_notes"
                      ? "var(--accent)"
                      : "var(--text-muted)",
                }}
              />
              <span className={scope.kind === "list_notes" ? "font-semibold" : ""}>
                From Lists
              </span>
              <span className="font-mono tabular-nums text-[11px] opacity-75">
                {listNotes.length}
              </span>
            </button>

            {notebooks.map((nb) => {
              const active =
                scope.kind === "notebook" && scope.notebookId === nb.id;
              const count = notebookCounts.counts.get(nb.id) || 0;
              const iconName = resolveNotebookIconName(nb.icon);
              const isBeingDragged = draggingNotebookId === nb.id;
              const isNoteDropHover = noteFileDropTargetId === nb.id;
              const isNbDropTarget = notebookDropTarget?.notebookId === nb.id;

              return (
                <button
                  key={nb.id}
                  ref={(el) => {
                    if (el) notebookTabRefs.current.set(nb.id, el);
                    else notebookTabRefs.current.delete(nb.id);
                  }}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-kanso-notebook-id", nb.id);
                    e.dataTransfer.effectAllowed = "move";
                    activeDragNotebookIdRef.current = nb.id;
                    setDraggingNotebookId(nb.id);
                  }}
                  onDragEnd={clearAllDragStates}
                  onDragOver={(e) => {
                    const types = e.dataTransfer.types;
                    if (types.includes("application/x-kanso-note-id")) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setNoteFileDropTargetId(nb.id);
                      return;
                    }
                    if (types.includes("application/x-kanso-notebook-id")) {
                      if (activeDragNotebookIdRef.current === nb.id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      const rect = e.currentTarget.getBoundingClientRect();
                      const position: "before" | "after" =
                        e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                      setNotebookDropTarget((prev) =>
                        prev?.notebookId === nb.id && prev.position === position
                          ? prev
                          : { notebookId: nb.id, position },
                      );
                    }
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setNoteFileDropTargetId((prev) =>
                        prev === nb.id ? null : prev,
                      );
                      setNotebookDropTarget((prev) =>
                        prev?.notebookId === nb.id ? null : prev,
                      );
                    }
                  }}
                  onDrop={(e) => {
                    const types = e.dataTransfer.types;
                    if (types.includes("application/x-kanso-note-id")) {
                      const noteId =
                        e.dataTransfer.getData("application/x-kanso-note-id") ||
                        activeDragNoteIdRef.current;
                      clearAllDragStates();
                      if (!noteId) return;
                      e.preventDefault();
                      handleMoveNoteToNotebook(noteId, nb.id);
                      return;
                    }
                    if (types.includes("application/x-kanso-notebook-id")) {
                      const draggedNbId =
                        e.dataTransfer.getData("application/x-kanso-notebook-id") ||
                        activeDragNotebookIdRef.current;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const position: "before" | "after" =
                        e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                      clearAllDragStates();
                      if (!draggedNbId || draggedNbId === nb.id) return;
                      e.preventDefault();
                      reorderNoteNotebooks(draggedNbId, nb.id, position);
                    }
                  }}
                  onClick={() =>
                    handleSelectScope({ kind: "notebook", notebookId: nb.id })
                  }
                  className={`relative h-10 px-3 inline-flex items-center gap-2 text-xs font-medium shrink-0 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                    isBeingDragged ? "opacity-45" : ""
                  } ${
                    isNoteDropHover
                      ? "ring-1 ring-inset ring-[var(--accent)] rounded-t-md"
                      : ""
                  }`}
                  style={{
                    borderColor:
                      isNoteDropHover || active ? "var(--accent)" : "transparent",
                    color:
                      isNoteDropHover || active
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                    backgroundColor:
                      isNoteDropHover || active
                        ? "var(--accent-soft)"
                        : "transparent",
                  }}
                >
                  {isNbDropTarget && (
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-[var(--accent)] z-20 ${
                        notebookDropTarget.position === "before"
                          ? "left-0"
                          : "right-0"
                      }`}
                    />
                  )}
                  <DynamicIcon name={iconName} className="w-3.5 h-3.5 shrink-0" />
                  <span className={active ? "font-semibold" : ""}>{nb.name}</span>
                  <span className="font-mono tabular-nums text-[11px] opacity-75">
                    {count}
                  </span>
                </button>
              );
            })}

            {(notebookCounts.unfiled > 0 || draggingNoteId !== null) && (
              <button
                ref={(el) => {
                  if (el) notebookTabRefs.current.set("__unfiled__", el);
                  else notebookTabRefs.current.delete("__unfiled__");
                }}
                type="button"
                onClick={() => handleSelectScope({ kind: "unfiled" })}
                className="h-10 px-3 inline-flex items-center gap-2 text-xs font-medium shrink-0 border-b-2 transition-all whitespace-nowrap"
                style={{
                  borderColor:
                    scope.kind === "unfiled" ? "var(--accent)" : "transparent",
                  color:
                    scope.kind === "unfiled"
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  backgroundColor:
                    scope.kind === "unfiled" ? "var(--accent-soft)" : "transparent",
                }}
              >
                <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                <span className={scope.kind === "unfiled" ? "font-semibold" : ""}>
                  Unfiled
                </span>
                <span className="font-mono tabular-nums text-[11px] opacity-75">
                  {notebookCounts.unfiled}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSelectScope({ kind: "archive" })}
              className="h-10 px-3 inline-flex items-center gap-2 text-xs font-medium shrink-0 border-b-2 transition-all whitespace-nowrap"
              style={{
                borderColor:
                  scope.kind === "archive" ? "var(--accent)" : "transparent",
                color:
                  scope.kind === "archive"
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                backgroundColor:
                  scope.kind === "archive" ? "var(--accent-soft)" : "transparent",
              }}
            >
              <Archive className="w-3.5 h-3.5 shrink-0" />
              <span>Archive</span>
              <span className="font-mono tabular-nums text-[11px] opacity-75">
                {archivedNotes.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setNotebookModal({
                  mode: "create",
                  name: "",
                  icon: "BookOpen",
                })
              }
              className="h-8 px-2.5 ml-1 my-1 rounded-lg text-xs font-medium inline-flex items-center gap-1 shrink-0 transition-colors hover:bg-[var(--bg-surface-subtle)]"
              style={{ color: "var(--text-muted)" }}
              title="New notebook"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </nav>

          {/* Sub-page Drill-Down Breadcrumb Bar */}
          {drilledParentNote && !hasActiveSearchOrTag && (
            <div
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div className="flex items-center gap-1 flex-wrap min-w-0">
                <button
                  type="button"
                  onClick={() => setDrilledParentId(null)}
                  className="hover:underline font-medium cursor-pointer"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {scopeTitle}
                </button>
                {drilledAncestors.map((anc, idx) => {
                  const isLast = idx === drilledAncestors.length - 1;
                  return (
                    <React.Fragment key={anc.id}>
                      <ChevronRight
                        className="w-3.5 h-3.5 shrink-0 opacity-60"
                        style={{ color: "var(--text-muted)" }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          isLast
                            ? handleOpenNoteById(anc.id)
                            : setDrilledParentId(anc.id)
                        }
                        className={`truncate max-w-[180px] hover:underline cursor-pointer ${
                          isLast ? "font-semibold" : ""
                        }`}
                        style={{
                          color: isLast
                            ? "var(--text-primary)"
                            : "var(--text-secondary)",
                        }}
                      >
                        {anc.title || "Untitled Note"}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => handleOpenNoteById(drilledParentNote.id)}
                className="text-[11px] font-medium inline-flex items-center gap-1 hover:underline shrink-0 cursor-pointer"
                style={{ color: "var(--accent)" }}
              >
                <span>Open Parent</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Unified 32px Toolbar: Search, Tag Filter, Sort, Grid/List Toggle */}
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
                placeholder={
                  activeNotebook
                    ? `Search in ${activeNotebook.name}...`
                    : scope.kind === "book_notes"
                      ? "Search book notes, titles, or pages..."
                      : scope.kind === "list_notes"
                        ? "Search list-linked notes, items, or quotes..."
                        : scope.kind === "archive"
                          ? "Search archived notes..."
                          : "Search all notes & sub-pages..."
                }
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

            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              aria-label="Filter by tag"
              className="h-8 px-2.5 rounded-lg border text-xs outline-none"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              <option value="all">All Tags</option>
              {scopeTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as NoteSort)}
                aria-label="Sort notes"
                className="h-8 px-2.5 rounded-lg border text-xs outline-none cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                <option value="custom">Sort: Custom Order</option>
                <option value="pinned">Sort: Pinned First</option>
                <option value="updated">Sort: Recently Updated</option>
                <option value="created">Sort: Recently Created</option>
                <option value="title">Sort: Title A–Z</option>
              </select>

              <button
                type="button"
                onClick={() =>
                  setSortBy((prev) => (prev === "custom" ? "pinned" : "custom"))
                }
                title={
                  isCustomSort
                    ? "Custom order active — drag cards or rows to rearrange"
                    : "Enable Custom Order (drag & drop)"
                }
                aria-label="Toggle custom drag order"
                aria-pressed={isCustomSort}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border transition-colors cursor-pointer shrink-0"
                style={{
                  backgroundColor: isCustomSort
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                  borderColor: isCustomSort
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                  color: isCustomSort ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </button>
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
                onClick={() => setViewMode("grid")}
                title="Card grid"
                aria-label="Card grid view"
                aria-pressed={viewMode === "grid"}
                className="h-6.5 w-7 flex items-center justify-center rounded-md transition-colors cursor-pointer"
                style={{
                  backgroundColor:
                    viewMode === "grid" ? "var(--accent-soft)" : "transparent",
                  color:
                    viewMode === "grid" ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                title="Quiet list"
                aria-label="Quiet list view"
                aria-pressed={viewMode === "list"}
                className="h-6.5 w-7 flex items-center justify-center rounded-md transition-colors cursor-pointer"
                style={{
                  backgroundColor:
                    viewMode === "list" ? "var(--accent-soft)" : "transparent",
                  color:
                    viewMode === "list" ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                <ListIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          </div>

          {/* Scrollable Notes Content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 pt-4 pb-20 space-y-4">
          {(() => {
            const renderGridCard = (
              note: Entry,
              _compactBookLocationOnly = false,
              listGroupContext?: { itemId?: string; quote?: string },
            ) => {
              const words = countWordsFromHtml(note.content);
              const updatedDay = formatCompactDayHeading(
                toLocalDateKey(note.updatedAt || note.createdAt),
              );
              const noteNotebook = note.notebookId
                ? notebookMap.get(note.notebookId)
                : null;
              const parentNote = note.parentId ? noteById.get(note.parentId) : null;
              const subCount = directChildCounts.get(note.id) || 0;
              const isBeingDragged = draggingNoteId === note.id;
              const isDropTarget = noteDropTarget?.noteId === note.id;
              const singleCol = isSingleColumnGrid();
              const link = note.bookLink ?? null;
              const liveLinkedBook =
                link?.bookId ? bookById.get(link.bookId) ?? null : null;
              const itemLinks = note.listItemLinks || [];
              const totalLinksCount = (link ? 1 : 0) + itemLinks.length;
              const linkSummaryTooltip =
                totalLinksCount > 0
                  ? [
                      ...(link
                        ? [
                            liveLinkedBook
                              ? `${liveLinkedBook.title} · ${link.locationLabel}`
                              : `${link.bookTitle} · ${link.locationLabel}`,
                          ]
                        : []),
                      ...itemLinks.map((itemLink) => {
                        const liveItem = itemLink.listItemId
                          ? listItemById.get(itemLink.listItemId) ?? null
                          : null;
                        return (
                          liveItem?.title ||
                          itemLink.itemTitle ||
                          "Untitled Item"
                        );
                      }),
                    ].join("\n")
                  : undefined;

              return (
                <article
                  key={note.id}
                  ref={(el) => {
                    if (el) noteElRefs.current.set(note.id, el);
                    else noteElRefs.current.delete(note.id);
                  }}
                  draggable={!note.archived}
                  onDragStart={(e) => {
                    if (note.archived) return;
                    e.dataTransfer.setData("application/x-kanso-note-id", note.id);
                    e.dataTransfer.effectAllowed = "move";
                    activeDragNoteIdRef.current = note.id;
                    setDraggingNoteId(note.id);
                  }}
                  onDragEnd={clearAllDragStates}
                  onDragOver={(e) => {
                    if (!isCustomSort || note.archived) return;
                    if (
                      !e.dataTransfer.types.includes("application/x-kanso-note-id")
                    ) {
                      return;
                    }
                    if (activeDragNoteIdRef.current === note.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const rect = e.currentTarget.getBoundingClientRect();
                    const position: "before" | "after" = singleCol
                      ? e.clientY < rect.top + rect.height / 2
                        ? "before"
                        : "after"
                      : e.clientX < rect.left + rect.width / 2
                        ? "before"
                        : "after";
                    setNoteDropTarget((prev) =>
                      prev?.noteId === note.id && prev.position === position
                        ? prev
                        : { noteId: note.id, position },
                    );
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setNoteDropTarget((prev) =>
                        prev?.noteId === note.id ? null : prev,
                      );
                    }
                  }}
                  onDrop={(e) => {
                    if (!isCustomSort || note.archived) return;
                    if (
                      !e.dataTransfer.types.includes("application/x-kanso-note-id")
                    ) {
                      return;
                    }
                    const draggedId =
                      e.dataTransfer.getData("application/x-kanso-note-id") ||
                      activeDragNoteIdRef.current;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const position: "before" | "after" = singleCol
                      ? e.clientY < rect.top + rect.height / 2
                        ? "before"
                        : "after"
                      : e.clientX < rect.left + rect.width / 2
                        ? "before"
                        : "after";
                    clearAllDragStates();
                    if (!draggedId || draggedId === note.id) return;
                    e.preventDefault();
                    handleReorderNotes(draggedId, note.id, position);
                  }}
                  onClick={() => {
                    if (draggingNoteId) return;
                    handleOpenNoteById(note.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setFocusedNoteId(note.id);
                    onOpenContextMenu({ kind: "entry", entry: note }, e);
                  }}
                  className={`relative rounded-xl border flex flex-col cursor-pointer transition-all duration-150 hover:border-[var(--border-strong)] min-h-[164px] ${
                    isCustomSort && !note.archived ? "cursor-grab active:cursor-grabbing" : ""
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
                          ? `pointer-events-none absolute inset-x-2 h-[3px] rounded-full bg-[var(--accent)] z-20 ${
                              noteDropTarget.position === "before"
                                ? "-top-1.5"
                                : "-bottom-1.5"
                            }`
                          : `pointer-events-none absolute top-1 bottom-1 w-[3px] rounded-full bg-[var(--accent)] z-20 ${
                              noteDropTarget.position === "before"
                                ? "-left-1.5"
                                : "-right-1.5"
                            }`
                      }
                    />
                  )}

                  {/* Top Card Header Bar: Page Icon + Pin + Actions */}
                  <div
                    className="rounded-t-[11px] px-3 py-1.5 border-b flex items-center justify-between gap-2 shrink-0"
                    style={{
                      backgroundColor: "var(--bg-surface-subtle)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      {isCustomSort && !note.archived && (
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={`Reorder ${note.title || "Untitled Note"}`}
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => {
                            if (e.pointerType === "mouse") return;
                            e.stopPropagation();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            activeDragNoteIdRef.current = note.id;
                            setDraggingNoteId(note.id);
                            setNoteDropTarget(null);
                            setNoteFileDropTargetId(null);
                          }}
                          onPointerMove={(e) => {
                            if (
                              e.pointerType === "mouse" ||
                              draggingNoteId !== note.id
                            ) {
                              return;
                            }
                            const resolved = resolveTouchDrop(
                              e.clientX,
                              e.clientY,
                              note.id,
                            );
                            setNoteDropTarget(resolved.noteTarget);
                            setNoteFileDropTargetId(resolved.notebookTargetId);
                          }}
                          onPointerUp={(e) => {
                            if (e.pointerType === "mouse") return;
                            e.stopPropagation();
                            if (draggingNoteId === note.id) {
                              const resolved = resolveTouchDrop(
                                e.clientX,
                                e.clientY,
                                note.id,
                              );
                              const nbTarget =
                                resolved.notebookTargetId ?? noteFileDropTargetId;
                              const cardTarget =
                                resolved.noteTarget ?? noteDropTarget;
                              clearAllDragStates();
                              if (nbTarget) {
                                handleMoveNoteToNotebook(
                                  note.id,
                                  nbTarget === "__unfiled__" ? null : nbTarget,
                                );
                              } else if (
                                cardTarget &&
                                cardTarget.noteId !== note.id
                              ) {
                                handleReorderNotes(
                                  note.id,
                                  cardTarget.noteId,
                                  cardTarget.position,
                                );
                              }
                            } else {
                              clearAllDragStates();
                            }
                          }}
                          onPointerCancel={clearAllDragStates}
                          className="touch-none select-none w-6 h-6 -ml-1 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-grab active:cursor-grabbing shrink-0"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </div>
                      )}

                      <div
                        className="relative shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIconPickerTarget((prev) =>
                              prev?.noteId === note.id && prev.mode === "grid"
                                ? null
                                : { noteId: note.id, mode: "grid" },
                            );
                          }}
                          title={note.icon ? "Change page icon" : "Add page icon"}
                          aria-label={
                            note.icon ? "Change page icon" : "Add page icon"
                          }
                          aria-expanded={
                            iconPickerTarget?.noteId === note.id &&
                            iconPickerTarget.mode === "grid"
                          }
                          className={`w-6 h-6 -ml-1 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer ${
                            iconPickerTarget?.noteId === note.id &&
                            iconPickerTarget.mode === "grid"
                              ? "bg-[var(--bg-surface-hover)]"
                              : ""
                          }`}
                          style={{
                            color: note.icon
                              ? "var(--accent)"
                              : "var(--text-muted)",
                          }}
                        >
                          <NotePageIcon icon={note.icon} className="w-3.5 h-3.5" />
                        </button>

                        <IconPickerPopover
                          open={
                            iconPickerTarget?.noteId === note.id &&
                            iconPickerTarget.mode === "grid"
                          }
                          onClose={() => setIconPickerTarget(null)}
                          value={note.icon}
                          onChange={(nextIcon) =>
                            updateEntry(note.id, { icon: nextIcon })
                          }
                          onClear={() => updateEntry(note.id, { icon: "" })}
                          allowClear
                          clearLabel="Default"
                          title="Page Icon"
                          align="left"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0 -mr-1">
                      {subCount > 0 && !note.archived && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSearch("");
                            setSelectedTag("all");
                            setDrilledParentId(note.id);
                          }}
                          className="h-6 px-1 inline-flex items-center gap-1 rounded-md text-[11px] font-mono tabular-nums transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--accent)] cursor-pointer shrink-0"
                          style={{ color: "var(--text-muted)" }}
                          title={`${subCount} ${subCount === 1 ? "sub-page" : "sub-pages"} (click to open)`}
                          aria-label={`Open ${subCount} ${subCount === 1 ? "sub-page" : "sub-pages"}`}
                        >
                          <span>{subCount}</span>
                          <GitBranch className="w-3 h-3" />
                        </button>
                      )}
                      {totalLinksCount > 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-1 text-[11px] font-mono tabular-nums shrink-0"
                          style={{ color: "var(--text-muted)" }}
                          title={linkSummaryTooltip}
                          aria-label={`${totalLinksCount} ${totalLinksCount === 1 ? "link" : "links"}`}
                        >
                          <span>{totalLinksCount}</span>
                          <Link2 className="w-3 h-3" />
                        </span>
                      )}
                      {note.archived ? (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              archiveNotePage(note.id, false, "promote");
                              pushToast("Note restored", "success");
                            }}
                            title="Restore note"
                            aria-label="Restore note"
                            className="h-6 px-1.5 flex items-center gap-1 rounded-md text-[11px] font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                            style={{ color: "var(--accent)" }}
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotePage(note.id, "promote");
                              pushToast("Note permanently deleted");
                            }}
                            title="Delete permanently"
                            aria-label="Delete permanently"
                            className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                            style={{ color: "var(--danger)" }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateEntry(note.id, { pinned: !note.pinned });
                            }}
                            className={`h-6 w-6 flex items-center justify-center rounded-md transition-all hover:bg-[var(--bg-surface-hover)] cursor-pointer ${
                              note.pinned
                                ? "opacity-100"
                                : "opacity-60 hover:opacity-100"
                            }`}
                            style={{
                              color: note.pinned
                                ? "var(--accent)"
                                : "var(--text-muted)",
                            }}
                            title={
                              note.pinned
                                ? "Pinned note (click to unpin)"
                                : "Pin note"
                            }
                            aria-label={
                              note.pinned ? "Unpin note" : "Pin note"
                            }
                            aria-pressed={Boolean(note.pinned)}
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFocusedNoteId(note.id);
                              onOpenContextMenu({ kind: "entry", entry: note }, e);
                            }}
                            className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                            style={{ color: "var(--text-muted)" }}
                            aria-label="Note actions"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="p-3 pt-2.5 flex-1 flex flex-col justify-between gap-2.5 min-w-0">
                    <div className="space-y-1.5 min-w-0">
                      <div className="min-w-0">
                        <TruncatedNoteTitle
                          as="h2"
                          title={note.title || "Untitled Note"}
                          className="text-sm font-medium leading-snug min-w-0"
                          style={{ color: "var(--text-primary)" }}
                        />
                        {hasActiveSearchOrTag && parentNote && (
                          <div
                            className="text-[11px] truncate mt-0.5"
                            style={{ color: "var(--text-muted)" }}
                          >
                            in {parentNote.title || "Untitled Note"}
                          </div>
                        )}
                      </div>

                      {note.content ? (
                        <RichContent
                          html={note.content}
                          className="line-clamp-6 text-xs"
                        />
                      ) : (
                        <p
                          className="text-xs italic"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Empty note...
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5 min-w-0">

                    {listGroupContext?.quote && (
                      <blockquote
                        className="border-l-2 pl-2 text-[11px] italic line-clamp-2"
                        style={{
                          borderColor: "var(--accent)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        “{listGroupContext.quote}”
                      </blockquote>
                    )}

                    {/* Unified Bottom Hairline Monospace Metadata Footer */}
                    <div
                      className="pt-2 border-t text-[11px] font-mono tabular-nums truncate"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-muted)",
                      }}
                    >
                      <span>{updatedDay}</span>
                      <span> · {words}w</span>
                      {scope.kind === "all" && noteNotebook && (
                        <span> · {noteNotebook.name}</span>
                      )}
                      {note.tags.length > 0 && (
                        <span> · {note.tags.map((t) => `#${t}`).join(" ")}</span>
                      )}
                    </div>
                    </div>
                  </div>
                </article>
              );
            };

            const renderListRow = (
              note: Entry,
              compactBookLocationOnly = false,
              listGroupContext?: { itemId?: string; quote?: string },
            ) => {
              const words = countWordsFromHtml(note.content);
              const updatedDay = formatCompactDayHeading(
                toLocalDateKey(note.updatedAt || note.createdAt),
              );
              const noteNotebook = note.notebookId
                ? notebookMap.get(note.notebookId)
                : null;
              const subCount = directChildCounts.get(note.id) || 0;
              const plainSnippet = note.content
                ? stripHtmlPreview(note.content)
                : "";
              const isBeingDragged = draggingNoteId === note.id;
              const isDropTarget = noteDropTarget?.noteId === note.id;
              const link = note.bookLink ?? null;
              const liveLinkedBook =
                link?.bookId ? bookById.get(link.bookId) ?? null : null;
              const itemLinks = note.listItemLinks || [];

              return (
                <div
                  key={note.id}
                  ref={(el) => {
                    if (el) noteElRefs.current.set(note.id, el);
                    else noteElRefs.current.delete(note.id);
                  }}
                  draggable={!note.archived}
                  onDragStart={(e) => {
                    if (note.archived) return;
                    e.dataTransfer.setData("application/x-kanso-note-id", note.id);
                    e.dataTransfer.effectAllowed = "move";
                    activeDragNoteIdRef.current = note.id;
                    setDraggingNoteId(note.id);
                  }}
                  onDragEnd={clearAllDragStates}
                  onDragOver={(e) => {
                    if (!isCustomSort || note.archived) return;
                    if (
                      !e.dataTransfer.types.includes("application/x-kanso-note-id")
                    ) {
                      return;
                    }
                    if (activeDragNoteIdRef.current === note.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const rect = e.currentTarget.getBoundingClientRect();
                    const position: "before" | "after" =
                      e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                    setNoteDropTarget((prev) =>
                      prev?.noteId === note.id && prev.position === position
                        ? prev
                        : { noteId: note.id, position },
                    );
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setNoteDropTarget((prev) =>
                        prev?.noteId === note.id ? null : prev,
                      );
                    }
                  }}
                  onDrop={(e) => {
                    if (!isCustomSort || note.archived) return;
                    if (
                      !e.dataTransfer.types.includes("application/x-kanso-note-id")
                    ) {
                      return;
                    }
                    const draggedId =
                      e.dataTransfer.getData("application/x-kanso-note-id") ||
                      activeDragNoteIdRef.current;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const position: "before" | "after" =
                      e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                    clearAllDragStates();
                    if (!draggedId || draggedId === note.id) return;
                    e.preventDefault();
                    handleReorderNotes(draggedId, note.id, position);
                  }}
                  onClick={() => {
                    if (draggingNoteId) return;
                    handleOpenNoteById(note.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setFocusedNoteId(note.id);
                    onOpenContextMenu({ kind: "entry", entry: note }, e);
                  }}
                  style={
                    isDropTarget
                      ? {
                          boxShadow:
                            noteDropTarget.position === "before"
                              ? "inset 0 2px 0 var(--accent)"
                              : "inset 0 -2px 0 var(--accent)",
                        }
                      : undefined
                  }
                  className={`py-2.5 px-2 -mx-2 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]/75 ${
                    isCustomSort && !note.archived ? "cursor-grab active:cursor-grabbing" : ""
                  } ${isBeingDragged ? "opacity-50 bg-[var(--accent-soft)]" : ""}`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isCustomSort && !note.archived && (
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Reorder ${note.title || "Untitled Note"}`}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => {
                          if (e.pointerType === "mouse") return;
                          e.stopPropagation();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          activeDragNoteIdRef.current = note.id;
                          setDraggingNoteId(note.id);
                          setNoteDropTarget(null);
                          setNoteFileDropTargetId(null);
                        }}
                        onPointerMove={(e) => {
                          if (
                            e.pointerType === "mouse" ||
                            draggingNoteId !== note.id
                          ) {
                            return;
                          }
                          const resolved = resolveTouchDrop(
                            e.clientX,
                            e.clientY,
                            note.id,
                          );
                          setNoteDropTarget(resolved.noteTarget);
                          setNoteFileDropTargetId(resolved.notebookTargetId);
                        }}
                        onPointerUp={(e) => {
                          if (e.pointerType === "mouse") return;
                          e.stopPropagation();
                          if (draggingNoteId === note.id) {
                            const resolved = resolveTouchDrop(
                              e.clientX,
                              e.clientY,
                              note.id,
                            );
                            const nbTarget =
                              resolved.notebookTargetId ?? noteFileDropTargetId;
                            const rowTarget = resolved.noteTarget ?? noteDropTarget;
                            clearAllDragStates();
                            if (nbTarget) {
                              handleMoveNoteToNotebook(
                                note.id,
                                nbTarget === "__unfiled__" ? null : nbTarget,
                              );
                            } else if (rowTarget && rowTarget.noteId !== note.id) {
                              handleReorderNotes(
                                note.id,
                                rowTarget.noteId,
                                rowTarget.position,
                              );
                            }
                          } else {
                            clearAllDragStates();
                          }
                        }}
                        onPointerCancel={clearAllDragStates}
                        className="touch-none select-none min-w-[32px] min-h-[36px] -ml-1 flex items-center justify-center rounded-md text-[var(--text-muted)] cursor-grab active:cursor-grabbing shrink-0"
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>
                    )}

                    {note.pinned && !note.archived && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateEntry(note.id, { pinned: false });
                        }}
                        className="h-5 w-5 flex items-center justify-center rounded shrink-0 hover:bg-[var(--bg-surface-hover)]"
                        style={{ color: "var(--accent)" }}
                        title="Unpin note"
                        aria-label="Unpin note"
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <div
                      className="relative shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIconPickerTarget((prev) =>
                            prev?.noteId === note.id && prev.mode === "list"
                              ? null
                              : { noteId: note.id, mode: "list" },
                          );
                        }}
                        title={note.icon ? "Change page icon" : "Add page icon"}
                        aria-label={
                          note.icon ? "Change page icon" : "Add page icon"
                        }
                        aria-expanded={
                          iconPickerTarget?.noteId === note.id &&
                          iconPickerTarget.mode === "list"
                        }
                        className={`w-6 h-6 -ml-0.5 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer ${
                          iconPickerTarget?.noteId === note.id &&
                          iconPickerTarget.mode === "list"
                            ? "bg-[var(--bg-surface-hover)]"
                            : ""
                        }`}
                        style={{
                          color: note.icon
                            ? "var(--accent)"
                            : "var(--text-muted)",
                        }}
                      >
                        <NotePageIcon icon={note.icon} className="w-3.5 h-3.5" />
                      </button>
                      <IconPickerPopover
                        open={
                          iconPickerTarget?.noteId === note.id &&
                          iconPickerTarget.mode === "list"
                        }
                        onClose={() => setIconPickerTarget(null)}
                        value={note.icon}
                        onChange={(nextIcon) =>
                          updateEntry(note.id, { icon: nextIcon })
                        }
                        onClear={() => updateEntry(note.id, { icon: "" })}
                        allowClear
                        clearLabel="Default"
                        title="Page Icon"
                        align="left"
                      />
                    </div>
                    <TruncatedNoteTitle
                      as="span"
                      title={note.title || "Untitled Note"}
                      className="text-sm font-medium leading-snug"
                      style={{ color: "var(--text-primary)" }}
                    />
                    {subCount > 0 && !note.archived && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSearch("");
                          setSelectedTag("all");
                          setDrilledParentId(note.id);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums hover:underline shrink-0 cursor-pointer"
                        style={{ color: "var(--accent)" }}
                      >
                        <GitBranch className="w-3 h-3" />
                        <span>{subCount}</span>
                      </button>
                    )}
                    {listGroupContext?.quote ? (
                      <span
                        className="hidden md:inline text-xs italic truncate flex-1"
                        style={{ color: "var(--text-muted)" }}
                      >
                        — “{listGroupContext.quote}”
                      </span>
                    ) : (
                      plainSnippet && (
                        <span
                          className="hidden md:inline text-xs truncate flex-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          — {plainSnippet}
                        </span>
                      )
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {link && (
                      liveLinkedBook && onJumpToBookLocation ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onJumpToBookLocation(link);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline whitespace-nowrap shrink-0 cursor-pointer max-w-[200px]"
                        >
                          <BookOpen className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            {compactBookLocationOnly
                              ? link.locationLabel
                              : `${liveLinkedBook.title} · ${link.locationLabel}`}
                          </span>
                          <ArrowUpRight className="w-3 h-3 shrink-0" />
                        </button>
                      ) : (
                        <span
                          className="hidden sm:inline-flex items-center gap-1 text-[11px] truncate max-w-[180px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <BookOpen className="w-3 h-3 shrink-0 opacity-75" />
                          <span className="truncate">
                            {compactBookLocationOnly
                              ? `${link.locationLabel} (Removed)`
                              : `${link.bookTitle} (Removed)`}
                          </span>
                        </span>
                      )
                    )}

                    {itemLinks.length > 0 && !listGroupContext && (
                      itemLinks.length > 3 ? (
                        <span
                          className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-mono tabular-nums"
                          style={{
                            backgroundColor: "var(--accent-soft)",
                            color: "var(--accent)",
                          }}
                        >
                          <ListChecks className="w-3 h-3 shrink-0" />
                          <span>{itemLinks.length} items</span>
                        </span>
                      ) : (
                        <div className="hidden sm:flex items-center gap-1 max-w-[260px]">
                          {itemLinks.map((itemLink, idx) => {
                            const liveItem = itemLink.listItemId
                              ? listItemById.get(itemLink.listItemId) ?? null
                              : null;
                            const title =
                              liveItem?.title || itemLink.itemTitle || "Untitled Item";
                            const isRemoved = !liveItem || Boolean(itemLink.itemRemoved);
                            return !isRemoved && liveItem && onJumpToListItem ? (
                              <button
                                key={itemLink.listItemId || idx}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onJumpToListItem(liveItem.id);
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium hover:underline truncate max-w-[120px] cursor-pointer"
                                style={{
                                  backgroundColor: "var(--bg-surface-subtle)",
                                  color: "var(--accent)",
                                }}
                              >
                                <ListChecks className="w-3 h-3 shrink-0" />
                                <span className="truncate">{title}</span>
                              </button>
                            ) : (
                              <span
                                key={itemLink.listItemId || `removed-${idx}`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] truncate max-w-[120px]"
                                style={{
                                  backgroundColor: "var(--bg-surface-subtle)",
                                  color: "var(--text-muted)",
                                }}
                              >
                                <span className="truncate">{title}</span>
                              </span>
                            );
                          })}
                        </div>
                      )
                    )}

                    <div
                      className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono tabular-nums"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {scope.kind === "all" && noteNotebook && (
                        <span>{noteNotebook.name} ·</span>
                      )}
                      {note.tags.length > 0 && (
                        <span className="max-w-[140px] truncate">
                          {note.tags.map((t) => `#${t}`).join(" ")} ·
                        </span>
                      )}
                      <span>{words}w ·</span>
                      <span>{updatedDay}</span>
                    </div>

                    {note.archived ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            archiveNotePage(note.id, false, "promote");
                            pushToast("Note restored", "success");
                          }}
                          className="h-6 px-2 rounded text-[11px] font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                          style={{ color: "var(--accent)" }}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotePage(note.id, "promote");
                            pushToast("Note deleted");
                          }}
                          aria-label="Delete permanently"
                          className="h-6 w-6 flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                          style={{ color: "var(--danger)" }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusedNoteId(note.id);
                          onOpenContextMenu({ kind: "entry", entry: note }, e);
                        }}
                        className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)]"
                        style={{ color: "var(--text-muted)" }}
                        aria-label="Note actions"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            };

            if (filteredNotes.length === 0) {
              return (
                <div
                  className="rounded-xl border border-dashed py-14 px-4 text-center space-y-2"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-muted)",
                  }}
                >
                  <FileText className="w-6 h-6 mx-auto opacity-50" />
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {drilledParentNote
                      ? `No sub-pages inside ${drilledParentNote.title || "Untitled Note"}`
                      : activeNotebook
                        ? `No notes in ${activeNotebook.name}`
                        : scope.kind === "archive"
                          ? "Archive is empty"
                          : scope.kind === "book_notes"
                            ? bookNotes.length === 0
                              ? "No book-linked notes yet"
                              : "No matching book notes"
                            : scope.kind === "list_notes"
                              ? listNotes.length === 0
                                ? "No list-linked notes yet"
                                : "No matching list notes"
                              : scope.kind === "unfiled" &&
                                  notebookCounts.unfiled === 0
                                ? "No unfiled notes"
                                : "No matching notes"}
                  </p>
                  <p className="text-xs max-w-md mx-auto">
                    {scope.kind === "book_notes" && bookNotes.length === 0
                      ? "Open any book in Library and write notes inside the Study Studio panel, or link any existing note to a book from its Details modal."
                      : scope.kind === "list_notes" && listNotes.length === 0
                        ? "Open any item in Lists and create or attach notes, or link existing notes to list items from Note Properties."
                        : scope.kind === "archive"
                          ? "Archived notes appear here so you can restore or remove them anytime."
                          : "Create a fresh note or adjust your notebook, search, and tag filters."}
                  </p>
                </div>
              );
            }

            if (scope.kind === "list_notes") {
              return (
                <div className="space-y-6">
                  {groupedListNotes.map((group) => (
                    <section
                      key={group.key}
                      className="space-y-3 pb-4 border-b last:border-b-0"
                      style={{ borderColor: "var(--border-subtle)" }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: "var(--bg-surface-subtle)",
                              borderColor: "var(--border-subtle)",
                              color: group.isRemoved
                                ? "var(--text-muted)"
                                : "var(--accent)",
                            }}
                          >
                            <ListChecks className="w-4 h-4" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-baseline gap-2 min-w-0">
                              <h2
                                className="font-display text-sm font-semibold truncate"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {group.itemTitle}
                              </h2>
                              <span
                                className="text-xs font-mono tabular-nums shrink-0"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {group.notes.length}{" "}
                                {group.notes.length === 1 ? "note" : "notes"}
                              </span>
                            </div>
                            <div
                              className="text-xs truncate flex items-center gap-1.5"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {group.listTitle && (
                                <span className="inline-flex items-center gap-1.5 truncate">
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{
                                      backgroundColor:
                                        group.listColor || "var(--accent)",
                                    }}
                                  />
                                  <span className="truncate">{group.listTitle}</span>
                                </span>
                              )}
                              {group.isRemoved && (
                                <>
                                  {group.listTitle && <span aria-hidden="true">·</span>}
                                  <span>Removed from lists</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {!group.isRemoved && group.liveItem && onJumpToListItem && (
                          <button
                            type="button"
                            onClick={() => onJumpToListItem(group.liveItem!.id)}
                            className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] whitespace-nowrap shrink-0 cursor-pointer"
                            style={{
                              backgroundColor: "var(--bg-surface)",
                              borderColor: "var(--border-subtle)",
                              color: "var(--text-primary)",
                            }}
                          >
                            <ListChecks className="w-3.5 h-3.5" />
                            <span>Open Item</span>
                          </button>
                        )}
                      </div>

                      {viewMode === "grid" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {group.notes.map(({ note, quote }) =>
                            renderGridCard(note, false, {
                              itemId: group.liveItem?.id,
                              quote,
                            }),
                          )}
                        </div>
                      ) : (
                        <div
                          className="divide-y border-y"
                          style={{ borderColor: "var(--border-subtle)" }}
                        >
                          {group.notes.map(({ note, quote }) =>
                            renderListRow(note, false, {
                              itemId: group.liveItem?.id,
                              quote,
                            }),
                          )}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              );
            }

            if (scope.kind === "book_notes") {
              return (
                <div className="space-y-6">
                  {groupedBookNotes.map((group) => {
                    const firstLink = group.notes[0]?.bookLink;
                    const openTargetBook = group.liveBook;

                    return (
                      <section
                        key={group.key}
                        className="space-y-3 pb-4 border-b last:border-b-0"
                        style={{ borderColor: "var(--border-subtle)" }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {openTargetBook ? (
                              <div className="w-8 shrink-0">
                                <BookCover
                                  title={openTargetBook.title}
                                  author={openTargetBook.author}
                                  format={openTargetBook.format}
                                  coverDataUrl={openTargetBook.coverDataUrl}
                                  paletteIndex={openTargetBook.coverPaletteIndex}
                                  coverStyle={openTargetBook.coverStyle}
                                  size="sm"
                                />
                              </div>
                            ) : (
                              <div
                                className="w-8 h-11 rounded border flex items-center justify-center shrink-0"
                                style={{
                                  backgroundColor: "var(--bg-surface-subtle)",
                                  borderColor: "var(--border-subtle)",
                                  color: "var(--text-muted)",
                                }}
                              >
                                <BookOpen className="w-4 h-4" />
                              </div>
                            )}

                            <div className="min-w-0">
                              <div className="flex items-baseline gap-2 min-w-0">
                                <h2
                                  className="font-display text-sm font-semibold truncate"
                                  style={{ color: "var(--text-primary)" }}
                                >
                                  {group.title}
                                </h2>
                                <span
                                  className="text-xs font-mono tabular-nums shrink-0"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  {group.notes.length}{" "}
                                  {group.notes.length === 1 ? "note" : "notes"}
                                </span>
                              </div>
                              <div
                                className="text-xs truncate flex items-center gap-1.5"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {group.author && (
                                  <span className="truncate">{group.author}</span>
                                )}
                                {!openTargetBook && (
                                  <>
                                    {group.author && <span aria-hidden="true">·</span>}
                                    <span>Removed from library</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {openTargetBook && onJumpToBookLocation && (
                            <button
                              type="button"
                              onClick={() => {
                                onJumpToBookLocation({
                                  bookId: openTargetBook.id,
                                  bookTitle: openTargetBook.title,
                                  bookAuthor: openTargetBook.author,
                                  bookFormat: openTargetBook.format,
                                  unitIndex:
                                    openTargetBook.currentLocation?.unitIndex ??
                                    firstLink?.unitIndex ??
                                    (openTargetBook.format === "pdf" ? 1 : 0),
                                  scrollRatio:
                                    openTargetBook.currentLocation?.scrollRatio ??
                                    firstLink?.scrollRatio ??
                                    0,
                                  locationLabel:
                                    openTargetBook.currentLocation?.label ||
                                    firstLink?.locationLabel ||
                                    "Current Position",
                                });
                              }}
                              className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] whitespace-nowrap shrink-0 cursor-pointer"
                              style={{
                                backgroundColor: "var(--bg-surface)",
                                borderColor: "var(--border-subtle)",
                                color: "var(--text-primary)",
                              }}
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>Open Book</span>
                            </button>
                          )}
                        </div>

                        {viewMode === "grid" ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {group.notes.map((note) => renderGridCard(note, true))}
                          </div>
                        ) : (
                          <div
                            className="divide-y border-y"
                            style={{ borderColor: "var(--border-subtle)" }}
                          >
                            {group.notes.map((note) => renderListRow(note, true))}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              );
            }

            if (viewMode === "grid") {
              return (
                <div
                  ref={gridRef}
                  className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
                >
                  {filteredNotes.map((note) => renderGridCard(note, false))}
                </div>
              );
            }

            return (
              <div
                className="divide-y border-y"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {filteredNotes.map((note) => renderListRow(note, false))}
              </div>
            );
          })()}
          </div>
        </div>
        )}
      </div>

      {/* Right Docked Connection Map (Tree & Anytype Graph) */}
      <NotesConnectionMap
        allNotes={allNotes}
        notebooks={notebooks}
        focusedNoteId={focusedNoteId}
        isOpenDesktop={connOpenDesktop}
        isOpenMobile={mobileConnOpen}
        mode={connMode}
        onModeChange={setConnMode}
        onFocusNote={setFocusedNoteId}
        onOpenNote={handleOpenNoteById}
        onUpdateNoteContent={(noteId, nextHtml, targetTitle) => {
          updateEntry(noteId, { content: nextHtml });
          pushToast(`Linked "${targetTitle}"`, "success");
        }}
        aiChats={workspace.aiChats || []}
        onToggleAiChatLink={toggleAiChatNoteLink}
        onJumpToAiChat={onJumpToAiChat}
        onCloseDesktop={() => setConnOpenDesktop(false)}
        onCloseMobile={() => setMobileConnOpen(false)}
      />

      {/* Safe Branch Delete/Archive Confirmation */}
      <NoteDeleteBranchModal
        prompt={branchPrompt}
        onCancel={() => setBranchPrompt(null)}
        onChoose={(mode) => {
          if (branchPrompt) {
            if (branchPrompt.action === "archive") {
              archiveNotePage(branchPrompt.noteId, true, mode);
            } else {
              deleteNotePage(branchPrompt.noteId, mode);
              pushToast("Note deleted");
            }
          }
          setBranchPrompt(null);
        }}
      />

      {/* Create / Edit Notebook Modal */}
      {notebookModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setNotebookModal(null)}
          />
          <form
            onSubmit={handleSaveNotebookModal}
            className="relative z-10 w-full max-w-md rounded-2xl border p-5 space-y-4"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold">
                {notebookModal.mode === "create"
                  ? "New Notebook"
                  : "Edit Notebook"}
              </h3>
              <button
                type="button"
                onClick={() => setNotebookModal(null)}
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
                Notebook Name
              </label>
              <input
                type="text"
                value={notebookModal.name}
                onChange={(e) =>
                  setNotebookModal({ ...notebookModal, name: e.target.value })
                }
                placeholder="e.g. Learning, Design Notes, Personal Journal..."
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
                  <DynamicIcon
                    name={notebookModal.icon}
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--accent)" }}
                  />
                  <span>{notebookModal.icon}</span>
                </span>
              </div>
              <IconPicker
                value={notebookModal.icon}
                onChange={(key) =>
                  setNotebookModal({ ...notebookModal, icon: key })
                }
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNotebookModal(null)}
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
                disabled={!notebookModal.name.trim()}
                className="h-8 px-3.5 rounded-lg text-xs font-semibold disabled:opacity-40"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                {notebookModal.mode === "create" ? "Create Notebook" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
