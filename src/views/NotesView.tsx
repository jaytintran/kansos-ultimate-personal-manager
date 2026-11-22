import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  FileText,
  FolderOpen,
  GripVertical,
  LayoutGrid,
  Library,
  List as ListIcon,
  MoreVertical,
  Pencil,
  Pin,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { DynamicIcon, LIST_ICON_KEYS } from "../components/IconLibrary";
import { BookCover } from "../components/library/BookCover";
import { RichContent } from "../components/RichContent";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  BookNoteLink,
  BookRecord,
  ContextMenuRecord,
  DetailSheetTarget,
  Entry,
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

const BOOK_NOTES_TAB_ID = "__book_notes__";
const SORT_STORAGE_KEY = "kanso_notes_sort_v1";
const VIEW_MODE_STORAGE_KEY = "kanso_notes_view_mode_v1";

const LEGACY_EMOJI_ICON_MAP: Record<string, string> = {
  "📚": "BookOpen",
  "🌿": "Leaf",
  "✍️": "PenLine",
  "📓": "Bookmark",
};

const NOTEBOOK_ICON_KEYS = [
  "BookOpen",
  "Leaf",
  "PenLine",
  "Bookmark",
  ...LIST_ICON_KEYS.filter((k) => !["BookOpen", "Bookmark"].includes(k)),
];

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
  onOpenDetail: (target: DetailSheetTarget) => void;
  onOpenContextMenu: (record: ContextMenuRecord, e: React.MouseEvent) => void;
  onJumpToBookLocation?: (bookLink: BookNoteLink) => void;
}

export const NotesView: React.FC<NotesViewProps> = ({
  onOpenDetail,
  onOpenContextMenu,
  onJumpToBookLocation,
}) => {
  const {
    workspace,
    pushToast,
    updateEntry,
    addNoteNotebook,
    updateNoteNotebook,
    deleteNoteNotebook,
    reorderNoteNotebooks,
    reorderNoteEntries,
  } = useWorkspace();

  const notebooks = useMemo(
    () => workspace.noteNotebooks || [],
    [workspace.noteNotebooks],
  );

  const [selectedNotebookId, setSelectedNotebookId] = useState<
    "all" | "unfiled" | string
  >("all");
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

  const [notebookModal, setNotebookModal] = useState<{
    mode: "create" | "edit";
    notebook?: NoteNotebook;
    name: string;
    icon: string;
  } | null>(null);

  // Drag & drop state (Note reordering, Note -> Notebook filing, Notebook tab reordering)
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
    const onSynced = () => {
      try {
        const savedSort = localStorage.getItem(SORT_STORAGE_KEY) as NoteSort | null;
        setSortBy(savedSort || "pinned");
        const savedView = localStorage.getItem(VIEW_MODE_STORAGE_KEY) as NotesViewMode | null;
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
      selectedNotebookId !== "all" &&
      selectedNotebookId !== "unfiled" &&
      selectedNotebookId !== BOOK_NOTES_TAB_ID &&
      !notebooks.some((nb) => nb.id === selectedNotebookId)
    ) {
      setSelectedNotebookId("all");
    }
  }, [notebooks, selectedNotebookId]);

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

  // Aggregate standalone + Timeline-born active notes
  const allNotes = useMemo(
    () => workspace.entries.filter((e) => e.type === "note" && !e.archived),
    [workspace.entries],
  );

  const bookNotes = useMemo(
    () => allNotes.filter((n) => Boolean(n.bookLink)),
    [allNotes],
  );

  const notebookCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let unfiled = 0;
    allNotes.forEach((n) => {
      if (n.notebookId && notebookMap.has(n.notebookId)) {
        counts.set(n.notebookId, (counts.get(n.notebookId) || 0) + 1);
      } else {
        unfiled += 1;
      }
    });
    return { counts, unfiled };
  }, [allNotes, notebookMap]);

  const notesInScope = useMemo(() => {
    if (selectedNotebookId === "all") return allNotes;
    if (selectedNotebookId === BOOK_NOTES_TAB_ID) return bookNotes;
    if (selectedNotebookId === "unfiled") {
      return allNotes.filter(
        (n) => !n.notebookId || !notebookMap.has(n.notebookId),
      );
    }
    return allNotes.filter((n) => n.notebookId === selectedNotebookId);
  }, [allNotes, bookNotes, selectedNotebookId, notebookMap]);

  const scopeTags = useMemo(() => {
    const set = new Set<string>();
    notesInScope.forEach((n) => (n.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [notesInScope]);

  // Reset tag filter if the active notebook doesn't have the selected tag
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

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notesInScope
      .filter((note) => {
        if (selectedTag !== "all" && !(note.tags || []).includes(selectedTag))
          return false;
        if (!q) return true;
        return (
          note.title.toLowerCase().includes(q) ||
          note.content.toLowerCase().includes(q) ||
          (note.tags || []).some((t) => t.toLowerCase().includes(q)) ||
          Boolean(note.bookLink?.bookTitle.toLowerCase().includes(q)) ||
          Boolean(note.bookLink?.bookAuthor?.toLowerCase().includes(q)) ||
          Boolean(note.bookLink?.locationLabel.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortBy === "custom") {
          return customNoteOrderCompare(a, b);
        }
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
  }, [notesInScope, search, selectedTag, sortBy, customNoteOrderCompare]);

  const groupedBookNotes = useMemo(() => {
    if (selectedNotebookId !== BOOK_NOTES_TAB_ID) return [];
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
  }, [selectedNotebookId, filteredNotes, bookById]);

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

  const handleFileNoteToNotebook = useCallback(
    (noteId: string, targetNotebookId: string | null) => {
      const note = allNotes.find((n) => n.id === noteId);
      if (!note) return;
      const currentNbId = note.notebookId ?? null;
      if (currentNbId === targetNotebookId) return;

      updateEntry(noteId, { notebookId: targetNotebookId });
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
    [allNotes, notebookMap, updateEntry, pushToast],
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
    selectedNotebookId !== "all" &&
    selectedNotebookId !== "unfiled" &&
    selectedNotebookId !== BOOK_NOTES_TAB_ID
      ? notebookMap.get(selectedNotebookId) || null
      : null;

  const handleSaveNotebookModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notebookModal || !notebookModal.name.trim()) return;
    if (notebookModal.mode === "create") {
      const created = addNoteNotebook(
        notebookModal.name.trim(),
        notebookModal.icon,
      );
      setSelectedNotebookId(created.id);
    } else if (notebookModal.notebook) {
      updateNoteNotebook(notebookModal.notebook.id, {
        name: notebookModal.name.trim(),
        icon: notebookModal.icon,
      });
    }
    setNotebookModal(null);
  };

  const handleDeleteActiveNotebook = () => {
    if (!activeNotebook) return;
    deleteNoteNotebook(activeNotebook.id);
    setSelectedNotebookId("all");
  };

  return (
    <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-20 space-y-4">
      {/* Header */}
      <header
        className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b mb-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight truncate">
            {activeNotebook
              ? activeNotebook.name
              : selectedNotebookId === BOOK_NOTES_TAB_ID
                ? "Book Notes"
                : selectedNotebookId === "unfiled"
                  ? "Unfiled Notes"
                  : "Notes"}
          </h1>
          <span
            className="text-xs font-mono tabular-nums shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            {notesInScope.length}
          </span>
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
                className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)]"
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
                onClick={handleDeleteActiveNotebook}
                className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)]"
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

          <button
            type="button"
            onClick={() =>
              onOpenDetail({
                mode: "note",
                draft: {
                  type: "note",
                  title: "",
                  content: "",
                  notebookId: activeNotebook ? activeNotebook.id : null,
                  syncToTimeline:
                    workspace.settings.defaultNoteTimelineSync ?? false,
                },
              })
            }
            className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Note</span>
          </button>
        </div>
      </header>

      {/* Horizontal Scrolling Notebooks Strip */}
      <nav
        aria-label="Notebooks"
        className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <button
          type="button"
          onClick={() => setSelectedNotebookId("all")}
          className="h-10 px-3 inline-flex items-center gap-2 text-xs font-medium shrink-0 border-b-2 transition-colors whitespace-nowrap"
          style={{
            borderColor:
              selectedNotebookId === "all" ? "var(--accent)" : "transparent",
            color:
              selectedNotebookId === "all"
                ? "var(--text-primary)"
                : "var(--text-secondary)",
            backgroundColor:
              selectedNotebookId === "all"
                ? "var(--accent-soft)"
                : "transparent",
          }}
        >
          <BookOpen
            className="w-3.5 h-3.5 shrink-0"
            style={{
              color:
                selectedNotebookId === "all"
                  ? "var(--accent)"
                  : "var(--text-muted)",
            }}
          />
          <span className={selectedNotebookId === "all" ? "font-semibold" : ""}>
            All Notes
          </span>
          <span
            className="font-mono tabular-nums text-[11px] opacity-75"
            style={{
              color:
                selectedNotebookId === "all"
                  ? "var(--accent)"
                  : "var(--text-muted)",
            }}
          >
            {allNotes.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedNotebookId(BOOK_NOTES_TAB_ID)}
          className="h-10 px-3 inline-flex items-center gap-2 text-xs font-medium shrink-0 border-b-2 transition-colors whitespace-nowrap"
          style={{
            borderColor:
              selectedNotebookId === BOOK_NOTES_TAB_ID
                ? "var(--accent)"
                : "transparent",
            color:
              selectedNotebookId === BOOK_NOTES_TAB_ID
                ? "var(--text-primary)"
                : "var(--text-secondary)",
            backgroundColor:
              selectedNotebookId === BOOK_NOTES_TAB_ID
                ? "var(--accent-soft)"
                : "transparent",
          }}
        >
          <Library
            className="w-3.5 h-3.5 shrink-0"
            style={{
              color:
                selectedNotebookId === BOOK_NOTES_TAB_ID
                  ? "var(--accent)"
                  : "var(--text-muted)",
            }}
          />
          <span
            className={
              selectedNotebookId === BOOK_NOTES_TAB_ID ? "font-semibold" : ""
            }
          >
            Book Notes
          </span>
          <span
            className="font-mono tabular-nums text-[11px] opacity-75"
            style={{
              color:
                selectedNotebookId === BOOK_NOTES_TAB_ID
                  ? "var(--accent)"
                  : "var(--text-muted)",
            }}
          >
            {bookNotes.length}
          </span>
        </button>

        {notebooks.map((nb) => {
          const active = selectedNotebookId === nb.id;
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
                  handleFileNoteToNotebook(noteId, nb.id);
                  return;
                }
                if (types.includes("application/x-kanso-notebook-id")) {
                  const draggedNbId =
                    e.dataTransfer.getData(
                      "application/x-kanso-notebook-id",
                    ) || activeDragNotebookIdRef.current;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: "before" | "after" =
                    e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                  clearAllDragStates();
                  if (!draggedNbId || draggedNbId === nb.id) return;
                  e.preventDefault();
                  reorderNoteNotebooks(draggedNbId, nb.id, position);
                }
              }}
              onClick={() => setSelectedNotebookId(nb.id)}
              title="Click to open · Drag to reorder · Drop notes here to file"
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
                backgroundColor: isNoteDropHover
                  ? "var(--accent-soft)"
                  : active
                    ? "var(--accent-soft)"
                    : "transparent",
              }}
            >
              {isNbDropTarget && (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent)] z-20 ${
                    notebookDropTarget.position === "before"
                      ? "left-0"
                      : "right-0"
                  }`}
                />
              )}
              <DynamicIcon
                name={iconName}
                className="w-3.5 h-3.5 shrink-0"
                style={{
                  color:
                    isNoteDropHover || active
                      ? "var(--accent)"
                      : "var(--text-muted)",
                }}
              />
              <span className={active ? "font-semibold" : ""}>{nb.name}</span>
              <span
                className="font-mono tabular-nums text-[11px] opacity-75"
                style={{
                  color:
                    isNoteDropHover || active
                      ? "var(--accent)"
                      : "var(--text-muted)",
                }}
              >
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
            onDragOver={(e) => {
              if (
                !e.dataTransfer.types.includes("application/x-kanso-note-id")
              ) {
                return;
              }
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setNoteFileDropTargetId("__unfiled__");
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setNoteFileDropTargetId((prev) =>
                  prev === "__unfiled__" ? null : prev,
                );
              }
            }}
            onDrop={(e) => {
              if (
                !e.dataTransfer.types.includes("application/x-kanso-note-id")
              ) {
                return;
              }
              const noteId =
                e.dataTransfer.getData("application/x-kanso-note-id") ||
                activeDragNoteIdRef.current;
              clearAllDragStates();
              if (!noteId) return;
              e.preventDefault();
              handleFileNoteToNotebook(noteId, null);
            }}
            onClick={() => setSelectedNotebookId("unfiled")}
            title="Unfiled notes · Drop a note here to remove it from its notebook"
            className={`h-10 px-3 inline-flex items-center gap-2 text-xs font-medium shrink-0 border-b-2 transition-all whitespace-nowrap ${
              noteFileDropTargetId === "__unfiled__"
                ? "ring-1 ring-inset ring-[var(--accent)] rounded-t-md"
                : ""
            }`}
            style={{
              borderColor:
                noteFileDropTargetId === "__unfiled__" ||
                selectedNotebookId === "unfiled"
                  ? "var(--accent)"
                  : "transparent",
              color:
                noteFileDropTargetId === "__unfiled__" ||
                selectedNotebookId === "unfiled"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                noteFileDropTargetId === "__unfiled__" ||
                selectedNotebookId === "unfiled"
                  ? "var(--accent-soft)"
                  : "transparent",
            }}
          >
            <FolderOpen
              className="w-3.5 h-3.5 shrink-0"
              style={{
                color:
                  noteFileDropTargetId === "__unfiled__" ||
                  selectedNotebookId === "unfiled"
                    ? "var(--accent)"
                    : "var(--text-muted)",
              }}
            />
            <span
              className={
                selectedNotebookId === "unfiled" ? "font-semibold" : ""
              }
            >
              Unfiled
            </span>
            <span
              className="font-mono tabular-nums text-[11px] opacity-75"
              style={{
                color:
                  noteFileDropTargetId === "__unfiled__" ||
                  selectedNotebookId === "unfiled"
                    ? "var(--accent)"
                    : "var(--text-muted)",
              }}
            >
              {notebookCounts.unfiled}
            </span>
          </button>
        )}

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
                : selectedNotebookId === BOOK_NOTES_TAB_ID
                  ? "Search book notes, titles, or pages..."
                  : "Search notes..."
            }
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
                ? "Custom order active — drag cards or rows to rearrange (click to switch back)"
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
            className="h-6.5 w-7 flex items-center justify-center rounded-md transition-colors"
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
            className="h-6.5 w-7 flex items-center justify-center rounded-md transition-colors"
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

      {/* Notes Content: Grouped Book Notes OR Unified 2-3 Col Compact Hairline Cards OR Quiet List */}
      {(() => {
        const renderGridCard = (note: Entry, compactBookLocationOnly = false) => {
          const words = countWordsFromHtml(note.content);
          const updatedDay = formatCompactDayHeading(
            toLocalDateKey(note.updatedAt || note.createdAt),
          );
          const noteNotebook = note.notebookId
            ? notebookMap.get(note.notebookId)
            : null;
          const isBeingDragged = draggingNoteId === note.id;
          const isDropTarget = noteDropTarget?.noteId === note.id;
          const singleCol = isSingleColumnGrid();
          const link = note.bookLink ?? null;
          const liveLinkedBook =
            link?.bookId ? bookById.get(link.bookId) ?? null : null;

          return (
            <article
              key={note.id}
              ref={(el) => {
                if (el) noteElRefs.current.set(note.id, el);
                else noteElRefs.current.delete(note.id);
              }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-kanso-note-id", note.id);
                e.dataTransfer.effectAllowed = "move";
                activeDragNoteIdRef.current = note.id;
                setDraggingNoteId(note.id);
              }}
              onDragEnd={clearAllDragStates}
              onDragOver={(e) => {
                if (!isCustomSort) return;
                if (
                  !e.dataTransfer.types.includes(
                    "application/x-kanso-note-id",
                  )
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
                if (!isCustomSort) return;
                if (
                  !e.dataTransfer.types.includes(
                    "application/x-kanso-note-id",
                  )
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
                onOpenDetail({ mode: "note", id: note.id });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onOpenContextMenu({ kind: "entry", entry: note }, e);
              }}
              className={`relative rounded-xl border p-3 flex flex-col justify-between gap-2.5 cursor-pointer transition-all duration-150 hover:border-[var(--border-strong)] min-h-[156px] ${
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
              {/* Insertion line indicator when reordering */}
              {isDropTarget && (
                <div
                  aria-hidden="true"
                  className={
                    singleCol
                      ? `pointer-events-none absolute inset-x-2 h-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] z-20 ${
                          noteDropTarget.position === "before"
                            ? "-top-1.5"
                            : "-bottom-1.5"
                        }`
                      : `pointer-events-none absolute top-1 bottom-1 w-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] z-20 ${
                          noteDropTarget.position === "before"
                            ? "-left-1.5"
                            : "-right-1.5"
                        }`
                  }
                />
              )}

              <div className="space-y-1.5 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-1.5 min-w-0 flex-1">
                    {isCustomSort && (
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Reorder ${note.title || "Untitled Note"}`}
                        title="Drag to reorder or drop onto a notebook tab"
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
                              resolved.notebookTargetId ??
                              noteFileDropTargetId;
                            const cardTarget =
                              resolved.noteTarget ?? noteDropTarget;
                            clearAllDragStates();
                            if (nbTarget) {
                              handleFileNoteToNotebook(
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
                        className="touch-none select-none w-6 h-6 -ml-1 -mt-0.5 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] active:text-[var(--accent)] cursor-grab active:cursor-grabbing shrink-0"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                    )}

                    <h2
                      className="text-sm font-medium leading-snug line-clamp-2 min-w-0"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {note.title || "Untitled Note"}
                    </h2>
                  </div>

                  {/* Always-visible Pin indicator & Action trigger */}
                  <div className="flex items-center gap-0.5 shrink-0 -mr-1 -mt-0.5">
                    {note.pinned && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateEntry(note.id, { pinned: false });
                        }}
                        className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)]"
                        style={{ color: "var(--accent)" }}
                        title="Pinned note (click to unpin)"
                        aria-label="Unpin note"
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenContextMenu({ kind: "entry", entry: note }, e);
                      }}
                      className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)]"
                      style={{ color: "var(--text-muted)" }}
                      aria-label="Note actions"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {note.content ? (
                  <RichContent
                    html={note.content}
                    className="line-clamp-5 text-xs"
                    fade
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
                {link && (
                  liveLinkedBook && onJumpToBookLocation ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToBookLocation(link);
                      }}
                      title={`Jump to ${liveLinkedBook.title} (${link.locationLabel})`}
                      className="w-full inline-flex items-center justify-between gap-1.5 py-1 text-[11px] font-medium text-[var(--accent)] hover:underline text-left min-w-0 cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <BookOpen className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {compactBookLocationOnly
                            ? link.locationLabel
                            : `${liveLinkedBook.title} · ${link.locationLabel}`}
                        </span>
                      </span>
                      <ArrowUpRight className="w-3 h-3 shrink-0 opacity-85" />
                    </button>
                  ) : (
                    <div
                      className="inline-flex items-center gap-1.5 py-0.5 text-[11px] min-w-0 max-w-full truncate"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <BookOpen className="w-3 h-3 shrink-0 opacity-75" />
                      <span className="truncate">
                        {compactBookLocationOnly
                          ? `${link.locationLabel} · Removed from library`
                          : `${link.bookTitle} · ${link.locationLabel} (Removed)`}
                      </span>
                    </div>
                  )
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
                  {selectedNotebookId === "all" && noteNotebook && (
                    <span> · {noteNotebook.name}</span>
                  )}
                  {note.tags.length > 0 && (
                    <span> · {note.tags.map((t) => `#${t}`).join(" ")}</span>
                  )}
                </div>
              </div>
            </article>
          );
        };

        const renderListRow = (note: Entry, compactBookLocationOnly = false) => {
          const words = countWordsFromHtml(note.content);
          const updatedDay = formatCompactDayHeading(
            toLocalDateKey(note.updatedAt || note.createdAt),
          );
          const noteNotebook = note.notebookId
            ? notebookMap.get(note.notebookId)
            : null;
          const plainSnippet = note.content
            ? stripHtmlPreview(note.content)
            : "";
          const isBeingDragged = draggingNoteId === note.id;
          const isDropTarget = noteDropTarget?.noteId === note.id;
          const link = note.bookLink ?? null;
          const liveLinkedBook =
            link?.bookId ? bookById.get(link.bookId) ?? null : null;

          return (
            <div
              key={note.id}
              ref={(el) => {
                if (el) noteElRefs.current.set(note.id, el);
                else noteElRefs.current.delete(note.id);
              }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-kanso-note-id", note.id);
                e.dataTransfer.effectAllowed = "move";
                activeDragNoteIdRef.current = note.id;
                setDraggingNoteId(note.id);
              }}
              onDragEnd={clearAllDragStates}
              onDragOver={(e) => {
                if (!isCustomSort) return;
                if (
                  !e.dataTransfer.types.includes(
                    "application/x-kanso-note-id",
                  )
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
                if (!isCustomSort) return;
                if (
                  !e.dataTransfer.types.includes(
                    "application/x-kanso-note-id",
                  )
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
                onOpenDetail({ mode: "note", id: note.id });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
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
                isCustomSort ? "cursor-grab active:cursor-grabbing" : ""
              } ${isBeingDragged ? "opacity-50 bg-[var(--accent-soft)]" : ""}`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {isCustomSort && (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Reorder ${note.title || "Untitled Note"}`}
                    title="Drag to reorder or drop onto a notebook tab"
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
                        const rowTarget =
                          resolved.noteTarget ?? noteDropTarget;
                        clearAllDragStates();
                        if (nbTarget) {
                          handleFileNoteToNotebook(
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
                    className="touch-none select-none min-w-[32px] min-h-[36px] -ml-1 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] active:text-[var(--accent)] cursor-grab active:cursor-grabbing shrink-0"
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>
                )}

                {note.pinned && (
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
                <span
                  className="text-sm font-medium leading-snug truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {note.title || "Untitled Note"}
                </span>
                {plainSnippet && (
                  <span
                    className="hidden md:inline text-xs truncate flex-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    — {plainSnippet}
                  </span>
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
                      title={`Jump to ${liveLinkedBook.title} (${link.locationLabel})`}
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

                <div
                  className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  {selectedNotebookId === "all" && noteNotebook && (
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

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenContextMenu({ kind: "entry", entry: note }, e);
                  }}
                  className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)]"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Note actions"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
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
                {activeNotebook
                  ? `No notes in ${activeNotebook.name}`
                  : selectedNotebookId === BOOK_NOTES_TAB_ID
                    ? bookNotes.length === 0
                      ? "No book-linked notes yet"
                      : "No matching book notes"
                    : "No matching notes"}
              </p>
              <p className="text-xs max-w-md mx-auto">
                {selectedNotebookId === BOOK_NOTES_TAB_ID && bookNotes.length === 0
                  ? "Open any book in Library and write notes inside the Study Studio panel, or link any existing note to a book from its Details modal."
                  : "Create a fresh note or adjust your notebook, search, and tag filters."}
              </p>
            </div>
          );
        }

        if (selectedNotebookId === BOOK_NOTES_TAB_ID) {
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
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
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
              <label
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Icon
              </label>
              <div className="flex flex-wrap gap-1.5">
                {NOTEBOOK_ICON_KEYS.map((key) => {
                  const active = notebookModal.icon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setNotebookModal({ ...notebookModal, icon: key })
                      }
                      className="h-8 w-8 flex items-center justify-center rounded-lg border transition-colors"
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
                      title={key}
                    >
                      <DynamicIcon name={key} className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
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
