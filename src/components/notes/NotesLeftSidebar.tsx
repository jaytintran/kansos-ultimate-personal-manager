import React, { useMemo, useRef, useState } from "react";
import {
  Archive,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  Library,
  PanelLeftClose,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { DynamicIcon } from "../IconLibrary";
import { buildNoteChildrenMap, wouldCreateParentCycle } from "../../lib/noteGraphUtils";
import type { Entry, NoteNotebook } from "../../types";

export const DEFAULT_NOTES_SIDEBAR_WIDTH = 252;
export const MIN_NOTES_SIDEBAR_WIDTH = 200;
export const MAX_NOTES_SIDEBAR_WIDTH = 380;

export type NotesScope =
  | { kind: "all" }
  | { kind: "book_notes" }
  | { kind: "unfiled" }
  | { kind: "archive" }
  | { kind: "notebook"; notebookId: string };

interface NotesLeftSidebarProps {
  allNotes: Entry[];
  archivedNotesCount: number;
  bookNotesCount: number;
  notebooks: NoteNotebook[];
  scope: NotesScope;
  focusedNoteId: string | null;
  sidebarWidth: number;
  isCollapsedDesktop: boolean;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onCollapseDesktop: () => void;
  onSidebarWidthChange: (width: number) => void;
  onSelectScope: (scope: NotesScope) => void;
  onOpenNote: (noteId: string) => void;
  onCreateNote: (options: { notebookId?: string | null; parentId?: string | null }) => void;
  onCreateNotebook: () => void;
  onEditNotebook: (notebook: NoteNotebook) => void;
  onDeleteNotebook: (notebook: NoteNotebook) => void;
  onNestNoteUnderParent: (draggedNoteId: string, newParentId: string | null) => void;
  onMoveNoteToNotebook: (noteId: string, notebookId: string | null) => void;
  onReorderNotebook: (draggedId: string, targetId: string, position: "before" | "after") => void;
}

const EXPANDED_STORAGE_KEY = "kanso_notes_sidebar_expanded_v1";

function loadExpandedIds(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {
    // Ignore
  }
  return {};
}

export const NotesLeftSidebar: React.FC<NotesLeftSidebarProps> = ({
  allNotes,
  archivedNotesCount,
  bookNotesCount,
  notebooks,
  scope,
  focusedNoteId,
  sidebarWidth,
  isCollapsedDesktop,
  isOpenMobile,
  onCloseMobile,
  onCollapseDesktop,
  onSidebarWidthChange,
  onSelectScope,
  onOpenNote,
  onCreateNote,
  onCreateNotebook,
  onEditNotebook,
  onDeleteNotebook,
  onNestNoteUnderParent,
  onMoveNoteToNotebook,
  onReorderNotebook,
}) => {
  const [sectionsCollapsed, setSectionsCollapsed] = useState<{
    smart: boolean;
    notebooks: boolean;
    unfiled: boolean;
  }>({ smart: false, notebooks: false, unfiled: false });

  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>(loadExpandedIds);
  const [isResizing, setIsResizing] = useState(false);
  const [dropHighlightKey, setDropHighlightKey] = useState<string | null>(null);
  const [nbDropTarget, setNbDropTarget] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);

  const dragNoteIdRef = useRef<string | null>(null);
  const dragNotebookIdRef = useRef<string | null>(null);

  const toggleExpanded = (key: string) => {
    setExpandedNodes((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  const setExpandedTrue = (key: string) => {
    setExpandedNodes((prev) => {
      if (prev[key]) return prev;
      const next = { ...prev, [key]: true };
      try {
        localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  const notebookMap = useMemo(
    () => new Map(notebooks.map((nb) => [nb.id, nb])),
    [notebooks],
  );

  const childrenMap = useMemo(() => buildNoteChildrenMap(allNotes), [allNotes]);

  const unfiledNotes = useMemo(
    () => allNotes.filter((n) => !n.notebookId || !notebookMap.has(n.notebookId)),
    [allNotes, notebookMap],
  );

  // Root pages per notebook: parentId is null or parent doesn't exist in same notebook
  const rootPagesByNotebook = useMemo(() => {
    const map = new Map<string, Entry[]>();
    const byId = new Map(allNotes.map((n) => [n.id, n]));
    for (const nb of notebooks) {
      map.set(nb.id, []);
    }
    for (const n of allNotes) {
      if (!n.notebookId || !notebookMap.has(n.notebookId)) continue;
      const parent = n.parentId ? byId.get(n.parentId) : undefined;
      if (!parent || parent.notebookId !== n.notebookId || parent.id === n.id) {
        const arr = map.get(n.notebookId) ?? [];
        arr.push(n);
        map.set(n.notebookId, arr);
      }
    }
    return map;
  }, [allNotes, notebooks, notebookMap]);

  const unfiledRootPages = useMemo(() => {
    const byId = new Map(unfiledNotes.map((n) => [n.id, n]));
    return unfiledNotes.filter((n) => !n.parentId || !byId.has(n.parentId) || n.parentId === n.id);
  }, [unfiledNotes]);

  const totalCountByNotebook = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of allNotes) {
      if (n.notebookId && notebookMap.has(n.notebookId)) {
        map.set(n.notebookId, (map.get(n.notebookId) || 0) + 1);
      }
    }
    return map;
  }, [allNotes, notebookMap]);

  const handleStartResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    setIsResizing(true);

    const onMove = (ev: PointerEvent) => {
      const next = Math.min(
        MAX_NOTES_SIDEBAR_WIDTH,
        Math.max(MIN_NOTES_SIDEBAR_WIDTH, startWidth + (ev.clientX - startX)),
      );
      onSidebarWidthChange(next);
    };
    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const renderPageNode = (note: Entry, depth: number, visited = new Set<string>()): React.ReactNode => {
    if (visited.has(note.id)) return null;
    const nextVisited = new Set(visited);
    nextVisited.add(note.id);

    const children = childrenMap.get(note.id) || [];
    const hasChildren = children.length > 0;
    const isExpanded = Boolean(expandedNodes[`note:${note.id}`]);
    const isFocused = focusedNoteId === note.id;
    const dropKey = `note:${note.id}`;
    const isDropHover = dropHighlightKey === dropKey;

    return (
      <div key={note.id} className="select-none">
        <div
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData("application/x-kanso-note-id", note.id);
            e.dataTransfer.effectAllowed = "move";
            dragNoteIdRef.current = note.id;
          }}
          onDragEnd={() => {
            dragNoteIdRef.current = null;
            setDropHighlightKey(null);
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("application/x-kanso-note-id")) return;
            const draggedId = dragNoteIdRef.current;
            if (draggedId && (draggedId === note.id || wouldCreateParentCycle(draggedId, note.id, allNotes))) {
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            setDropHighlightKey(dropKey);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDropHighlightKey((prev) => (prev === dropKey ? null : prev));
            }
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.types.includes("application/x-kanso-note-id")) return;
            const draggedId =
              e.dataTransfer.getData("application/x-kanso-note-id") || dragNoteIdRef.current;
            setDropHighlightKey(null);
            dragNoteIdRef.current = null;
            if (!draggedId || draggedId === note.id) return;
            if (wouldCreateParentCycle(draggedId, note.id, allNotes)) return;
            e.preventDefault();
            e.stopPropagation();
            setExpandedTrue(`note:${note.id}`);
            onNestNoteUnderParent(draggedId, note.id);
          }}
          style={{
            paddingLeft: `${8 + depth * 14}px`,
            backgroundColor: isDropHover
              ? "var(--accent-soft)"
              : isFocused
                ? "var(--accent-soft)"
                : "transparent",
            color: isFocused ? "var(--accent)" : "var(--text-secondary)",
          }}
          className={`group flex items-center gap-1 pr-1.5 py-1 rounded-md text-xs transition-colors hover:bg-[var(--bg-surface-hover)] ${
            isDropHover ? "ring-1 ring-[var(--accent)]" : ""
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleExpanded(`note:${note.id}`);
            }}
            className={`w-4 h-4 flex items-center justify-center rounded shrink-0 ${
              hasChildren
                ? "hover:bg-[var(--bg-surface)] cursor-pointer opacity-75 hover:opacity-100"
                : "opacity-0 pointer-events-none"
            }`}
            aria-label={isExpanded ? "Collapse sub-pages" : "Expand sub-pages"}
            tabIndex={hasChildren ? 0 : -1}
          >
            {hasChildren &&
              (isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              ))}
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenNote(note.id);
              onCloseMobile();
            }}
            className="flex-1 min-w-0 flex items-center gap-1.5 text-left py-0.5 cursor-pointer"
          >
            <FileText
              className="w-3.5 h-3.5 shrink-0 opacity-75"
              style={{ color: isFocused ? "var(--accent)" : "var(--text-muted)" }}
            />
            <span
              className={`truncate ${isFocused ? "font-medium" : ""}`}
              style={{ color: isFocused ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              {note.title || "Untitled Note"}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedTrue(`note:${note.id}`);
              onCreateNote({
                notebookId: note.notebookId ?? null,
                parentId: note.id,
              });
              onCloseMobile();
            }}
            title={`Add sub-page inside ${note.title || "Untitled Note"}`}
            aria-label={`Add sub-page inside ${note.title || "Untitled Note"}`}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--accent)] transition-opacity shrink-0 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
            {children.map((child) => renderPageNode(child, depth + 1, nextVisited))}
          </div>
        )}
      </div>
    );
  };

  const sidebarContent = (isDesktop: boolean) => (
    <aside
      className="relative h-full flex flex-col border-r shrink-0 select-none"
      style={{
        width: isDesktop ? sidebarWidth : 284,
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {/* Sidebar Top Bar */}
      <div
        className="h-12 px-3 flex items-center justify-between gap-2 border-b shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <span
          className="text-xs font-semibold tracking-wide uppercase"
          style={{ color: "var(--text-muted)" }}
        >
          Workspace
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              onCreateNote({
                notebookId: scope.kind === "notebook" ? scope.notebookId : null,
                parentId: null,
              });
              onCloseMobile();
            }}
            title="New note"
            aria-label="New note"
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            <Plus className="w-4 h-4" />
          </button>
          {isDesktop ? (
            <button
              type="button"
              onClick={onCollapseDesktop}
              title="Collapse sidebar"
              aria-label="Collapse notes sidebar"
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close sidebar"
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Tree Sections */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-4">
        {/* Smart Views */}
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setSectionsCollapsed((s) => ({ ...s, smart: !s.smart }))}
            className="w-full px-1.5 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wider cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <span>Smart Views</span>
            {sectionsCollapsed.smart ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>

          {!sectionsCollapsed.smart && (
            <div className="space-y-0.5">
              {(
                [
                  {
                    kind: "all" as const,
                    label: "All Notes",
                    count: allNotes.length,
                    icon: BookOpen,
                  },
                  {
                    kind: "book_notes" as const,
                    label: "Book Notes",
                    count: bookNotesCount,
                    icon: Library,
                  },
                  {
                    kind: "unfiled" as const,
                    label: "Unfiled",
                    count: unfiledNotes.length,
                    icon: FolderOpen,
                    isDropUnfiled: true,
                  },
                  {
                    kind: "archive" as const,
                    label: "Archive",
                    count: archivedNotesCount,
                    icon: Archive,
                  },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = scope.kind === item.kind;
                const dropKey = `smart:${item.kind}`;
                const isUnfiledHover =
                  "isDropUnfiled" in item && dropHighlightKey === dropKey;

                return (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => {
                      onSelectScope({ kind: item.kind });
                      onCloseMobile();
                    }}
                    onDragOver={(e) => {
                      if (!("isDropUnfiled" in item)) return;
                      if (!e.dataTransfer.types.includes("application/x-kanso-note-id")) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDropHighlightKey(dropKey);
                    }}
                    onDragLeave={() => {
                      setDropHighlightKey((prev) => (prev === dropKey ? null : prev));
                    }}
                    onDrop={(e) => {
                      if (!("isDropUnfiled" in item)) return;
                      if (!e.dataTransfer.types.includes("application/x-kanso-note-id")) return;
                      const noteId =
                        e.dataTransfer.getData("application/x-kanso-note-id") ||
                        dragNoteIdRef.current;
                      setDropHighlightKey(null);
                      dragNoteIdRef.current = null;
                      if (!noteId) return;
                      e.preventDefault();
                      onMoveNoteToNotebook(noteId, null);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      isUnfiledHover ? "ring-1 ring-[var(--accent)]" : ""
                    }`}
                    style={{
                      backgroundColor:
                        active || isUnfiledHover ? "var(--accent-soft)" : "transparent",
                      color:
                        active || isUnfiledHover
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                    }}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className={`truncate ${active ? "font-semibold" : "font-medium"}`}>
                        {item.label}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-[11px] opacity-80 shrink-0">
                      {item.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Notebooks + Nested Pages */}
        <div className="space-y-1">
          <div className="px-1.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSectionsCollapsed((s) => ({ ...s, notebooks: !s.notebooks }))}
              className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              {sectionsCollapsed.notebooks ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              <span>Notebooks</span>
            </button>
            <button
              type="button"
              onClick={onCreateNotebook}
              title="New notebook"
              aria-label="New notebook"
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {!sectionsCollapsed.notebooks && (
            <div className="space-y-0.5">
              {notebooks.map((nb) => {
                const active = scope.kind === "notebook" && scope.notebookId === nb.id;
                const roots = rootPagesByNotebook.get(nb.id) ?? [];
                const totalCount = totalCountByNotebook.get(nb.id) || 0;
                const isNbExpanded = Boolean(expandedNodes[`nb:${nb.id}`]);
                const dropKey = `nb:${nb.id}`;
                const isDropHover = dropHighlightKey === dropKey;
                const isOrderTarget = nbDropTarget?.id === nb.id;

                return (
                  <div key={nb.id} className="space-y-0.5">
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/x-kanso-notebook-id", nb.id);
                        e.dataTransfer.effectAllowed = "move";
                        dragNotebookIdRef.current = nb.id;
                      }}
                      onDragEnd={() => {
                        dragNotebookIdRef.current = null;
                        setNbDropTarget(null);
                      }}
                      onDragOver={(e) => {
                        const types = e.dataTransfer.types;
                        if (types.includes("application/x-kanso-note-id")) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setDropHighlightKey(dropKey);
                          return;
                        }
                        if (
                          types.includes("application/x-kanso-notebook-id") &&
                          dragNotebookIdRef.current &&
                          dragNotebookIdRef.current !== nb.id
                        ) {
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pos =
                            e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                          setNbDropTarget({ id: nb.id, position: pos });
                        }
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDropHighlightKey((prev) => (prev === dropKey ? null : prev));
                          setNbDropTarget((prev) => (prev?.id === nb.id ? null : prev));
                        }
                      }}
                      onDrop={(e) => {
                        const types = e.dataTransfer.types;
                        if (types.includes("application/x-kanso-note-id")) {
                          const noteId =
                            e.dataTransfer.getData("application/x-kanso-note-id") ||
                            dragNoteIdRef.current;
                          setDropHighlightKey(null);
                          dragNoteIdRef.current = null;
                          if (!noteId) return;
                          e.preventDefault();
                          setExpandedTrue(`nb:${nb.id}`);
                          onMoveNoteToNotebook(noteId, nb.id);
                          return;
                        }
                        if (types.includes("application/x-kanso-notebook-id")) {
                          const draggedNbId =
                            e.dataTransfer.getData("application/x-kanso-notebook-id") ||
                            dragNotebookIdRef.current;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pos =
                            e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                          setNbDropTarget(null);
                          dragNotebookIdRef.current = null;
                          if (!draggedNbId || draggedNbId === nb.id) return;
                          e.preventDefault();
                          onReorderNotebook(draggedNbId, nb.id, pos);
                        }
                      }}
                      className={`group relative flex items-center gap-1 px-1.5 py-1 rounded-md text-xs transition-colors hover:bg-[var(--bg-surface-hover)] ${
                        isDropHover ? "ring-1 ring-[var(--accent)]" : ""
                      }`}
                      style={{
                        backgroundColor:
                          active || isDropHover ? "var(--accent-soft)" : "transparent",
                        color:
                          active || isDropHover
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                        boxShadow: isOrderTarget
                          ? nbDropTarget.position === "before"
                            ? "inset 0 2px 0 var(--accent)"
                            : "inset 0 -2px 0 var(--accent)"
                          : undefined,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (roots.length > 0) toggleExpanded(`nb:${nb.id}`);
                        }}
                        className={`w-4 h-4 flex items-center justify-center rounded shrink-0 ${
                          roots.length > 0
                            ? "hover:bg-[var(--bg-surface)] cursor-pointer opacity-75"
                            : "opacity-0 pointer-events-none"
                        }`}
                        aria-label={isNbExpanded ? "Collapse notebook" : "Expand notebook"}
                        tabIndex={roots.length > 0 ? 0 : -1}
                      >
                        {roots.length > 0 &&
                          (isNbExpanded ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          ))}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onSelectScope({ kind: "notebook", notebookId: nb.id });
                          onCloseMobile();
                        }}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left py-0.5 cursor-pointer"
                      >
                        <DynamicIcon name={nb.icon || "BookOpen"} className="w-3.5 h-3.5 shrink-0" />
                        <span
                          className={`truncate ${active ? "font-semibold" : "font-medium"}`}
                          style={{
                            color: active ? "var(--text-primary)" : "var(--text-secondary)",
                          }}
                        >
                          {nb.name}
                        </span>
                      </button>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedTrue(`nb:${nb.id}`);
                            onCreateNote({ notebookId: nb.id, parentId: null });
                            onCloseMobile();
                          }}
                          title={`New note in ${nb.name}`}
                          aria-label={`New note in ${nb.name}`}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditNotebook(nb);
                          }}
                          title="Edit notebook"
                          aria-label={`Edit ${nb.name}`}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteNotebook(nb);
                          }}
                          title="Delete notebook"
                          aria-label={`Delete ${nb.name}`}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <span
                          className="font-mono tabular-nums text-[11px] w-5 text-right"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {totalCount}
                        </span>
                      </div>
                    </div>

                    {isNbExpanded && roots.length > 0 && (
                      <div className="pl-2 space-y-0.5">
                        {roots.map((n) => renderPageNode(n, 0))}
                      </div>
                    )}
                  </div>
                );
              })}

              {notebooks.length === 0 && (
                <p className="px-2 py-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  No notebooks yet
                </p>
              )}
            </div>
          )}
        </div>

        {/* Unfiled Pages Tree */}
        {unfiledRootPages.length > 0 && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setSectionsCollapsed((s) => ({ ...s, unfiled: !s.unfiled }))}
              className="w-full px-1.5 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wider cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <span>Unfiled Pages</span>
              {sectionsCollapsed.unfiled ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>

            {!sectionsCollapsed.unfiled && (
              <div className="space-y-0.5">
                {unfiledRootPages.map((n) => renderPageNode(n, 0))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop Drag-Resize Divider */}
      {isDesktop && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize notes sidebar"
          title="Drag to resize · Double-click to reset"
          onPointerDown={handleStartResize}
          onDoubleClick={() => onSidebarWidthChange(DEFAULT_NOTES_SIDEBAR_WIDTH)}
          className={`absolute top-0 right-[-3px] bottom-0 w-1.5 cursor-col-resize z-20 transition-colors ${
            isResizing ? "bg-[var(--accent)]/60" : "bg-transparent hover:bg-[var(--accent)]/35"
          }`}
        />
      )}
    </aside>
  );

  return (
    <>
      {!isCollapsedDesktop && (
        <div className="hidden lg:block h-full shrink-0">{sidebarContent(true)}</div>
      )}

      {isOpenMobile && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex bg-black/50 backdrop-blur-[1px] overscroll-none"
          onClick={onCloseMobile}
        >
          <div
            className="h-full pt-safe pb-safe flex overscroll-none"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent(false)}
          </div>
        </div>
      )}
    </>
  );
};
