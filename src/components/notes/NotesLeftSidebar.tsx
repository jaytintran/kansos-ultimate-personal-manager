import React, { useMemo, useRef, useState } from "react";
import {
  Archive,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderOpen,
  Library,
  ListChecks,
  PanelLeftClose,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from "lucide-react";
import { DynamicIcon, NotePageIcon } from "../IconLibrary";
import { buildNoteChildrenMap, wouldCreateParentCycle } from "../../lib/noteGraphUtils";
import type { Entry, NoteNotebook } from "../../types";

export const DEFAULT_NOTES_SIDEBAR_WIDTH = 252;
export const MIN_NOTES_SIDEBAR_WIDTH = 200;
export const MAX_NOTES_SIDEBAR_WIDTH = 380;

export type NotesScope =
  | { kind: "all" }
  | { kind: "book_notes" }
  | { kind: "list_notes" }
  | { kind: "unfiled" }
  | { kind: "archive" }
  | { kind: "notebook"; notebookId: string };

export interface NotesWorkspaceTreeProps {
  allNotes: Entry[];
  archivedNotesCount: number;
  bookNotesCount: number;
  listNotesCount: number;
  notebooks: NoteNotebook[];
  scope: NotesScope;
  focusedNoteId: string | null;
  onSelectScope: (scope: NotesScope) => void;
  onOpenNote: (noteId: string) => void;
  onCreateNote: (options: { notebookId?: string | null; parentId?: string | null }) => void;
  onRenameNote?: (noteId: string, newTitle: string) => void;
  onTogglePinNote?: (note: Entry) => void;
  onDeleteNote?: (note: Entry) => void;
  onCreateNotebook: () => void;
  onEditNotebook: (notebook: NoteNotebook) => void;
  onDeleteNotebook: (notebook: NoteNotebook) => void;
  onNestNoteUnderParent: (draggedNoteId: string, newParentId: string | null) => void;
  onMoveNoteToNotebook: (noteId: string, notebookId: string | null) => void;
  onReorderNotebook: (draggedId: string, targetId: string, position: "before" | "after") => void;
}

interface NotesLeftSidebarProps extends NotesWorkspaceTreeProps {
  sidebarWidth: number;
  isCollapsedDesktop: boolean;
  onCollapseDesktop: () => void;
  onSidebarWidthChange: (width: number) => void;
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

const NotesWorkspaceTreeBody: React.FC<
  NotesWorkspaceTreeProps & { variant: "sidebar" | "tab" }
> = ({
  variant,
  allNotes,
  archivedNotesCount,
  bookNotesCount,
  listNotesCount,
  notebooks,
  scope,
  focusedNoteId,
  onSelectScope,
  onOpenNote,
  onCreateNote,
  onRenameNote,
  onTogglePinNote,
  onDeleteNote,
  onCreateNotebook,
  onEditNotebook,
  onDeleteNotebook,
  onNestNoteUnderParent,
  onMoveNoteToNotebook,
  onReorderNotebook,
}) => {
  const isTab = variant === "tab";
  const [sectionsCollapsed, setSectionsCollapsed] = useState<{
    smart: boolean;
    notebooks: boolean;
    unfiled: boolean;
  }>({ smart: false, notebooks: false, unfiled: false });

  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>(loadExpandedIds);
  const [dropHighlightKey, setDropHighlightKey] = useState<string | null>(null);
  const [nbDropTarget, setNbDropTarget] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);
  const [rowContextMenu, setRowContextMenu] = useState<
    | { kind: "page"; note: Entry; x: number; y: number }
    | { kind: "notebook"; notebook: NoteNotebook; x: number; y: number }
    | null
  >(null);
  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null);
  const [renamingNoteTitle, setRenamingNoteTitle] = useState("");

  const dragNoteIdRef = useRef<string | null>(null);
  const dragNotebookIdRef = useRef<string | null>(null);

  const commitNoteRename = (note: Entry) => {
    const trimmed = renamingNoteTitle.trim();
    if (trimmed !== (note.title || "") && onRenameNote) {
      onRenameNote(note.id, trimmed);
    }
    setRenamingNoteId(null);
    setRenamingNoteTitle("");
  };

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
    () =>
      allNotes.filter(
        (n) => (!n.notebookId || !notebookMap.has(n.notebookId)) && !n.bookLink,
      ),
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
          draggable={!isTab}
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
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setRowContextMenu({ kind: "page", note, x: e.clientX, y: e.clientY });
          }}
          style={{
            paddingLeft: `${(isTab ? 10 : 8) + depth * (isTab ? 16 : 14)}px`,
            backgroundColor: isDropHover
              ? "var(--accent-soft)"
              : isFocused
                ? "var(--accent-soft)"
                : "transparent",
            color: isFocused ? "var(--accent)" : "var(--text-secondary)",
          }}
          className={`group flex items-center gap-1.5 pr-1.5 ${
            isTab ? "py-1.5 rounded-lg text-[13px]" : "py-1 rounded-md text-xs"
          } transition-colors hover:bg-[var(--bg-surface-hover)] ${
            isDropHover ? "ring-1 ring-[var(--accent)]" : ""
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleExpanded(`note:${note.id}`);
            }}
            className={`${isTab ? "w-5 h-5" : "w-4 h-4"} flex items-center justify-center rounded shrink-0 ${
              hasChildren
                ? "hover:bg-[var(--bg-surface)] cursor-pointer opacity-75 hover:opacity-100"
                : "opacity-0 pointer-events-none"
            }`}
            aria-label={isExpanded ? "Collapse sub-pages" : "Expand sub-pages"}
            tabIndex={hasChildren ? 0 : -1}
          >
            {hasChildren &&
              (isExpanded ? (
                <ChevronDown className={isTab ? "w-3.5 h-3.5" : "w-3 h-3"} />
              ) : (
                <ChevronRight className={isTab ? "w-3.5 h-3.5" : "w-3 h-3"} />
              ))}
          </button>

          {renamingNoteId === note.id ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                commitNoteRename(note);
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 flex items-center gap-1.5 py-0.5"
            >
              <NotePageIcon
                icon={note.icon}
                className={`${isTab ? "w-4 h-4" : "w-3.5 h-3.5"} shrink-0 opacity-85`}
                style={{ color: "var(--accent)" }}
              />
              <input
                type="text"
                autoFocus
                value={renamingNoteTitle}
                onChange={(e) => setRenamingNoteTitle(e.target.value)}
                onBlur={() => commitNoteRename(note)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setRenamingNoteId(null);
                    setRenamingNoteTitle("");
                  }
                }}
                placeholder="Untitled Note"
                className="flex-1 min-w-0 px-1.5 py-0.5 rounded border text-xs outline-none"
                style={{
                  backgroundColor: "var(--bg-input)",
                  borderColor: "var(--accent)",
                  color: "var(--text-primary)",
                }}
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => onOpenNote(note.id)}
              className="flex-1 min-w-0 flex items-center gap-2 text-left py-0.5 cursor-pointer"
              title={note.title || "Untitled Note"}
            >
              <NotePageIcon
                icon={note.icon}
                className={`${isTab ? "w-4 h-4" : "w-3.5 h-3.5"} shrink-0 opacity-85`}
                style={{
                  color: isFocused
                    ? "var(--accent)"
                    : note.icon
                      ? "var(--accent)"
                      : "var(--text-muted)",
                }}
              />
              <span
                className={`truncate ${isFocused ? "font-medium" : ""}`}
                style={{ color: isFocused ? "var(--text-primary)" : "var(--text-secondary)" }}
              >
                {note.title || "Untitled Note"}
              </span>
            </button>
          )}

          {isTab && renamingNoteId !== note.id && (
            <div className="flex items-center gap-0.5 shrink-0 opacity-75">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedTrue(`note:${note.id}`);
                  onCreateNote({
                    notebookId: note.notebookId ?? null,
                    parentId: note.id,
                  });
                }}
                title={`Add sub-page inside ${note.title || "Untitled Note"}`}
                aria-label={`Add sub-page inside ${note.title || "Untitled Note"}`}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              {onRenameNote && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenamingNoteId(note.id);
                    setRenamingNoteTitle(note.title || "");
                  }}
                  title="Rename note"
                  aria-label={`Rename ${note.title || "Untitled Note"}`}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {onDeleteNote && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNote(note);
                  }}
                  title="Delete note"
                  aria-label={`Delete ${note.title || "Untitled Note"}`}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
            {children.map((child) => renderPageNode(child, depth + 1, nextVisited))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`flex-1 min-h-0 overflow-y-auto ${
        isTab ? "px-3.5 py-4 space-y-5" : "px-2 py-3 space-y-4"
      }`}
    >
      {/* Smart Views */}
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => setSectionsCollapsed((s) => ({ ...s, smart: !s.smart }))}
          className={`w-full px-1.5 flex items-center justify-between font-semibold uppercase tracking-wider cursor-pointer ${
            isTab ? "text-[11px]" : "text-[10.5px]"
          }`}
          style={{ color: "var(--text-muted)" }}
        >
          <span>Smart Views</span>
          {sectionsCollapsed.smart ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {!sectionsCollapsed.smart && (
          <div className={isTab ? "space-y-1" : "space-y-0.5"}>
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
                  kind: "list_notes" as const,
                  label: "From Lists",
                  count: listNotesCount,
                  icon: ListChecks,
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
                  onClick={() => onSelectScope({ kind: item.kind })}
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
                  className={`w-full flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    isTab
                      ? "px-3 py-2 rounded-lg text-[13px]"
                      : "px-2 py-1.5 rounded-md text-xs"
                  } ${isUnfiledHover ? "ring-1 ring-[var(--accent)]" : ""}`}
                  style={{
                    backgroundColor:
                      active || isUnfiledHover ? "var(--accent-soft)" : "transparent",
                    color:
                      active || isUnfiledHover
                        ? "var(--accent)"
                        : "var(--text-secondary)",
                  }}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className={isTab ? "w-4 h-4 shrink-0" : "w-3.5 h-3.5 shrink-0"} />
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
      <div className="space-y-1.5">
        <div className="px-1.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSectionsCollapsed((s) => ({ ...s, notebooks: !s.notebooks }))}
            className={`flex items-center gap-1 font-semibold uppercase tracking-wider cursor-pointer ${
              isTab ? "text-[11px]" : "text-[10.5px]"
            }`}
            style={{ color: "var(--text-muted)" }}
          >
            {sectionsCollapsed.notebooks ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            <span>Notebooks</span>
          </button>
          <button
            type="button"
            onClick={onCreateNotebook}
            title="New notebook"
            aria-label="New notebook"
            className={`${
              isTab ? "h-7 w-7" : "h-5 w-5"
            } flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer`}
            style={{ color: "var(--text-muted)" }}
          >
            <Plus className={isTab ? "w-3.5 h-3.5" : "w-3 h-3"} />
          </button>
        </div>

        {!sectionsCollapsed.notebooks && (
          <div className={isTab ? "space-y-1" : "space-y-0.5"}>
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
                    draggable={!isTab}
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
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRowContextMenu({
                        kind: "notebook",
                        notebook: nb,
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                    className={`group relative flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] ${
                      isTab
                        ? "px-2 py-1.5 rounded-lg text-[13px]"
                        : "px-1.5 py-1 rounded-md text-xs"
                    } ${isDropHover ? "ring-1 ring-[var(--accent)]" : ""}`}
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
                      className={`${
                        isTab ? "w-5 h-5" : "w-4 h-4"
                      } flex items-center justify-center rounded shrink-0 ${
                        roots.length > 0
                          ? "hover:bg-[var(--bg-surface)] cursor-pointer opacity-75"
                          : "opacity-0 pointer-events-none"
                      }`}
                      aria-label={isNbExpanded ? "Collapse notebook" : "Expand notebook"}
                      tabIndex={roots.length > 0 ? 0 : -1}
                    >
                      {roots.length > 0 &&
                        (isNbExpanded ? (
                          <ChevronDown className={isTab ? "w-3.5 h-3.5" : "w-3 h-3"} />
                        ) : (
                          <ChevronRight className={isTab ? "w-3.5 h-3.5" : "w-3 h-3"} />
                        ))}
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectScope({ kind: "notebook", notebookId: nb.id })}
                      className="flex-1 min-w-0 flex items-center gap-2 text-left py-0.5 cursor-pointer"
                      title={nb.name}
                    >
                      <DynamicIcon
                        name={nb.icon || "BookOpen"}
                        className={isTab ? "w-4 h-4 shrink-0" : "w-3.5 h-3.5 shrink-0"}
                      />
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
                      {isTab && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedTrue(`nb:${nb.id}`);
                              onCreateNote({ notebookId: nb.id, parentId: null });
                            }}
                            title={`New note in ${nb.name}`}
                            aria-label={`New note in ${nb.name}`}
                            className="opacity-70 hover:opacity-100 w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditNotebook(nb);
                            }}
                            title="Edit notebook"
                            aria-label={`Edit ${nb.name}`}
                            className="opacity-70 hover:opacity-100 w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteNotebook(nb);
                            }}
                            title="Delete notebook"
                            aria-label={`Delete ${nb.name}`}
                            className="opacity-70 hover:opacity-100 w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
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
              <p className="px-2 py-1 text-xs" style={{ color: "var(--text-muted)" }}>
                No notebooks yet
              </p>
            )}
          </div>
        )}
      </div>

      {/* Unfiled Pages Tree */}
      {unfiledRootPages.length > 0 && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setSectionsCollapsed((s) => ({ ...s, unfiled: !s.unfiled }))}
            className={`w-full px-1.5 flex items-center justify-between font-semibold uppercase tracking-wider cursor-pointer ${
              isTab ? "text-[11px]" : "text-[10.5px]"
            }`}
            style={{ color: "var(--text-muted)" }}
          >
            <span>Unfiled Pages</span>
            {sectionsCollapsed.unfiled ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {!sectionsCollapsed.unfiled && (
            <div className="space-y-0.5">
              {unfiledRootPages.map((n) => renderPageNode(n, 0))}
            </div>
          )}
        </div>
      )}
      {/* Sidebar Row Right-Click Context Menu */}
      {rowContextMenu && (
        <div
          className="fixed inset-0 z-[80]"
          onClick={() => setRowContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setRowContextMenu(null);
          }}
        >
          <div
            className="fixed w-48 rounded-xl border p-1 space-y-0.5"
            onClick={(e) => e.stopPropagation()}
            style={{
              left:
                typeof window !== "undefined"
                  ? Math.min(Math.max(12, rowContextMenu.x), window.innerWidth - 204)
                  : rowContextMenu.x,
              top:
                typeof window !== "undefined"
                  ? Math.min(
                      Math.max(12, rowContextMenu.y),
                      window.innerHeight - (rowContextMenu.kind === "page" ? 216 : 156),
                    )
                  : rowContextMenu.y,
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div
              className="px-2.5 py-1 text-[11px] font-semibold truncate border-b mb-0.5"
              style={{
                color: "var(--text-muted)",
                borderColor: "var(--border-subtle)",
              }}
            >
              {rowContextMenu.kind === "page"
                ? rowContextMenu.note.title || "Untitled Note"
                : rowContextMenu.notebook.name}
            </div>

            {rowContextMenu.kind === "page" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const target = rowContextMenu.note;
                    setRowContextMenu(null);
                    onOpenNote(target.id);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  style={{ color: "var(--text-primary)" }}
                >
                  <ExternalLink className="w-3.5 h-3.5 opacity-75" />
                  <span>Open in Tab</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = rowContextMenu.note;
                    setRowContextMenu(null);
                    setExpandedTrue(`note:${target.id}`);
                    onCreateNote({
                      notebookId: target.notebookId ?? null,
                      parentId: target.id,
                    });
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  style={{ color: "var(--text-primary)" }}
                >
                  <Plus className="w-3.5 h-3.5 opacity-75" />
                  <span>New Sub-page</span>
                </button>
                {onTogglePinNote && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = rowContextMenu.note;
                      setRowContextMenu(null);
                      onTogglePinNote(target);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <Pin className="w-3.5 h-3.5 opacity-75" />
                    <span>{rowContextMenu.note.pinned ? "Unpin Note" : "Pin Note"}</span>
                  </button>
                )}
                {onRenameNote && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = rowContextMenu.note;
                      setRowContextMenu(null);
                      setRenamingNoteId(target.id);
                      setRenamingNoteTitle(target.title || "");
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <Pencil className="w-3.5 h-3.5 opacity-75" />
                    <span>Rename</span>
                  </button>
                )}
                {onDeleteNote && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = rowContextMenu.note;
                      setRowContextMenu(null);
                      onDeleteNote(target);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                    style={{ color: "var(--danger)" }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Note</span>
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const target = rowContextMenu.notebook;
                    setRowContextMenu(null);
                    setExpandedTrue(`nb:${target.id}`);
                    onCreateNote({ notebookId: target.id, parentId: null });
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  style={{ color: "var(--text-primary)" }}
                >
                  <Plus className="w-3.5 h-3.5 opacity-75" />
                  <span>New Note</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = rowContextMenu.notebook;
                    setRowContextMenu(null);
                    onEditNotebook(target);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  style={{ color: "var(--text-primary)" }}
                >
                  <Pencil className="w-3.5 h-3.5 opacity-75" />
                  <span>Rename / Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = rowContextMenu.notebook;
                    setRowContextMenu(null);
                    onDeleteNotebook(target);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  style={{ color: "var(--danger)" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Notebook</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const NotesWorkspaceTab: React.FC<NotesWorkspaceTreeProps> = (props) => {
  const { scope, onCreateNote, onCreateNotebook } = props;

  return (
    <div
      className="lg:hidden flex-1 min-h-0 flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--bg-canvas)" }}
    >
      {/* Pinned Workspace Tab Header */}
      <header
        className="shrink-0 relative z-20 px-4 sm:px-6 pt-4 pb-3 border-b bg-[var(--bg-canvas)] flex items-center justify-between gap-3"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <h1 className="font-display text-lg font-semibold tracking-tight leading-tight">
          Workspace
        </h1>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onCreateNotebook}
            className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Notebook</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onCreateNote({
                notebookId: scope.kind === "notebook" ? scope.notebookId : null,
                parentId: null,
              })
            }
            className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
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

      <NotesWorkspaceTreeBody {...props} variant="tab" />
    </div>
  );
};

export const NotesLeftSidebar: React.FC<NotesLeftSidebarProps> = ({
  sidebarWidth,
  isCollapsedDesktop,
  onCollapseDesktop,
  onSidebarWidthChange,
  ...treeProps
}) => {
  const [isResizing, setIsResizing] = useState(false);

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

  if (isCollapsedDesktop) return null;

  return (
    <div className="hidden lg:block h-full shrink-0">
      <aside
        className="relative h-full flex flex-col border-r shrink-0 select-none"
        style={{
          width: sidebarWidth,
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
              onClick={() =>
                treeProps.onCreateNote({
                  notebookId:
                    treeProps.scope.kind === "notebook"
                      ? treeProps.scope.notebookId
                      : null,
                  parentId: null,
                })
              }
              title="New note"
              aria-label="New note"
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              <Plus className="w-4 h-4" />
            </button>
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
          </div>
        </div>

        <NotesWorkspaceTreeBody {...treeProps} variant="sidebar" />

        {/* Desktop Drag-Resize Divider */}
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
      </aside>
    </div>
  );
};
