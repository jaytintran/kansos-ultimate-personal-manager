import React, { useMemo, useState } from "react";
import {
  Archive,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  LayoutGrid,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Entry, NoteNotebook } from "../../types";

export type NotesScope =
  | { type: "all" }
  | { type: "favorites" }
  | { type: "notebook"; notebookId: string }
  | { type: "archive" };

interface NotesSidebarTreeProps {
  notes: Entry[];
  notebooks: NoteNotebook[];
  activeNoteId: string | null;
  activeScope: NotesScope;
  sidebarCollapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggleCollapse: () => void;
  onSelectScope: (scope: NotesScope) => void;
  onOpenNote: (noteId: string) => void;
  onCreateNote: (opts?: {
    notebookId?: string | null;
    parentId?: string | null;
  }) => void;
  onCreateNotebook: (name: string) => void;
  onRenameNotebook: (id: string, name: string) => void;
  onDeleteNotebook: (id: string) => void;
}

export const NotesSidebarTree: React.FC<NotesSidebarTreeProps> = ({
  notes,
  notebooks,
  activeNoteId,
  activeScope,
  sidebarCollapsed,
  mobileOpen,
  onCloseMobile,
  onToggleCollapse,
  onSelectScope,
  onOpenNote,
  onCreateNote,
  onCreateNotebook,
  onRenameNotebook,
  onDeleteNotebook,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedNotebooks, setExpandedNotebooks] = useState<
    Record<string, boolean>
  >(() => {
    const initial: Record<string, boolean> = {};
    notebooks.forEach((nb) => {
      initial[nb.id] = true;
    });
    return initial;
  });
  const [creatingNotebook, setCreatingNotebook] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState("");
  const [editingNotebookId, setEditingNotebookId] = useState<string | null>(
    null,
  );
  const [editingNotebookName, setEditingNotebookName] = useState("");
  const [notebookMenuId, setNotebookMenuId] = useState<string | null>(null);

  const activeNotes = useMemo(
    () => notes.filter((n) => !n.archived && n.noteStatus !== "archived"),
    [notes],
  );

  const favoriteNotes = useMemo(
    () => activeNotes.filter((n) => Boolean(n.favorite) || Boolean(n.pinned)),
    [activeNotes],
  );

  const archivedCount = useMemo(
    () =>
      notes.filter((n) => Boolean(n.archived) || n.noteStatus === "archived")
        .length,
    [notes],
  );

  const childrenMap = useMemo(() => {
    const map = new Map<string, Entry[]>();
    const activeIds = new Set(activeNotes.map((n) => n.id));
    for (const n of activeNotes) {
      const parentKey =
        n.parentId && activeIds.has(n.parentId) ? n.parentId : "__root__";
      const arr = map.get(parentKey) || [];
      arr.push(n);
      map.set(parentKey, arr);
    }
    return map;
  }, [activeNotes]);

  const rootNotes = childrenMap.get("__root__") || [];
  const standaloneRootNotes = useMemo(
    () =>
      rootNotes.filter(
        (n) => !n.notebookId || !notebooks.some((nb) => nb.id === n.notebookId),
      ),
    [rootNotes, notebooks],
  );

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderPageNode = (note: Entry, depth: number) => {
    const children = childrenMap.get(note.id) || [];
    const hasChildren = children.length > 0;
    const isExpanded = Boolean(expandedNodes[note.id]);
    const isActive = activeNoteId === note.id;

    return (
      <div key={note.id}>
        <div
          className="group flex items-center gap-1 pr-1.5 py-1 rounded-lg transition-colors text-xs"
          style={{
            paddingLeft: `${8 + depth * 14}px`,
            backgroundColor: isActive ? "var(--accent-soft)" : "transparent",
            color: isActive ? "var(--accent)" : "var(--text-secondary)",
          }}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggleNode(note.id)}
            className={`w-4 h-4 flex items-center justify-center rounded shrink-0 ${
              hasChildren
                ? "hover:bg-[var(--bg-surface-hover)]"
                : "opacity-0 pointer-events-none"
            }`}
            aria-label={isExpanded ? "Collapse subpages" : "Expand subpages"}
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenNote(note.id);
              onCloseMobile();
            }}
            className="flex-1 min-w-0 flex items-center gap-1.5 text-left py-0.5"
          >
            <span className="shrink-0 text-xs leading-none">
              {note.icon || "📝"}
            </span>
            <span
              className="truncate font-medium"
              style={{
                color: isActive ? "var(--accent)" : "var(--text-primary)",
              }}
            >
              {note.title || "Untitled Note"}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedNodes((prev) => ({ ...prev, [note.id]: true }));
              onCreateNote({
                parentId: note.id,
                notebookId: note.notebookId ?? null,
              });
              onCloseMobile();
            }}
            title="Add nested subpage"
            aria-label={`Add subpage inside ${note.title || "Untitled Note"}`}
            className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-[var(--bg-surface-hover)] shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
            {children.map((c) => renderPageNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const handleCreateNotebookSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newNotebookName.trim();
    if (!clean) return;
    onCreateNotebook(clean);
    setNewNotebookName("");
    setCreatingNotebook(false);
  };

  const sidebarBody = (
    <div className="flex flex-col h-full">
      {/* Sidebar Header */}
      <div
        className="px-3.5 py-3 border-b flex items-center justify-between gap-2 shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen
            className="w-4 h-4 shrink-0"
            style={{ color: "var(--accent)" }}
          />
          <span className="font-display text-sm font-bold tracking-tight truncate">
            Notes Studio
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              onCreateNote({
                notebookId:
                  activeScope.type === "notebook"
                    ? activeScope.notebookId
                    : null,
              });
              onCloseMobile();
            }}
            title="New blank page"
            aria-label="New blank page"
            className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-subtle)]"
            style={{ color: "var(--accent)" }}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse sidebar"
            aria-label="Collapse notes sidebar"
            className="hidden lg:flex h-7 w-7 rounded-lg items-center justify-center transition-colors hover:bg-[var(--bg-surface-subtle)]"
            style={{ color: "var(--text-muted)" }}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close drawer"
            className="lg:hidden h-7 w-7 rounded-lg flex items-center justify-center"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Tree Navigation */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
        {/* Primary Scopes */}
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => {
              onSelectScope({ type: "all" });
              onCloseMobile();
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors"
            style={{
              backgroundColor:
                activeScope.type === "all" && !activeNoteId
                  ? "var(--accent-soft)"
                  : "transparent",
              color:
                activeScope.type === "all" && !activeNoteId
                  ? "var(--accent)"
                  : "var(--text-primary)",
            }}
          >
            <span className="flex items-center gap-2">
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>All Notes</span>
            </span>
            <span
              className="font-mono tabular-nums text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              {activeNotes.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectScope({ type: "favorites" });
              onCloseMobile();
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors"
            style={{
              backgroundColor:
                activeScope.type === "favorites" && !activeNoteId
                  ? "var(--accent-soft)"
                  : "transparent",
              color:
                activeScope.type === "favorites" && !activeNoteId
                  ? "var(--accent)"
                  : "var(--text-secondary)",
            }}
          >
            <span className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5" />
              <span>Favorites</span>
            </span>
            <span
              className="font-mono tabular-nums text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              {favoriteNotes.length}
            </span>
          </button>
        </div>

        {/* Favorites Quick Jump */}
        {favoriteNotes.length > 0 && (
          <div className="space-y-1">
            <div
              className="px-2.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Pinned &amp; Favorites
            </div>
            <div className="space-y-0.5">
              {favoriteNotes.slice(0, 6).map((fav) => (
                <button
                  key={fav.id}
                  type="button"
                  onClick={() => {
                    onOpenNote(fav.id);
                    onCloseMobile();
                  }}
                  className="w-full px-2.5 py-1 rounded-lg text-xs flex items-center gap-2 text-left transition-colors hover:bg-[var(--bg-surface-subtle)]"
                  style={{
                    backgroundColor:
                      activeNoteId === fav.id
                        ? "var(--accent-soft)"
                        : "transparent",
                    color:
                      activeNoteId === fav.id
                        ? "var(--accent)"
                        : "var(--text-primary)",
                  }}
                >
                  <span className="text-xs shrink-0">{fav.icon || "📝"}</span>
                  <span className="truncate font-medium">
                    {fav.title || "Untitled Note"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notebooks & Nested Pages */}
        <div className="space-y-1.5">
          <div className="px-2.5 flex items-center justify-between">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Notebooks
            </span>
            <button
              type="button"
              onClick={() => setCreatingNotebook((v) => !v)}
              title="New notebook"
              aria-label="New notebook"
              className="h-5 w-5 rounded flex items-center justify-center hover:bg-[var(--bg-surface-subtle)]"
              style={{ color: "var(--text-muted)" }}
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          {creatingNotebook && (
            <form
              onSubmit={handleCreateNotebookSubmit}
              className="px-1.5 pb-1 flex gap-1"
            >
              <input
                type="text"
                autoFocus
                value={newNotebookName}
                onChange={(e) => setNewNotebookName(e.target.value)}
                placeholder="Notebook name..."
                className="flex-1 min-w-0 h-7 px-2 rounded-md border text-xs outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              />
              <button
                type="submit"
                className="h-7 px-2 rounded-md text-[11px] font-semibold"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                Add
              </button>
            </form>
          )}

          <div className="space-y-1">
            {notebooks.map((nb) => {
              const nbNotes = rootNotes.filter((n) => n.notebookId === nb.id);
              const isOpen = expandedNotebooks[nb.id] ?? true;
              const isScopeActive =
                activeScope.type === "notebook" &&
                activeScope.notebookId === nb.id &&
                !activeNoteId;

              return (
                <div key={nb.id} className="space-y-0.5">
                  <div
                    className="group relative flex items-center gap-1 px-1.5 py-1 rounded-lg transition-colors"
                    style={{
                      backgroundColor: isScopeActive
                        ? "var(--accent-soft)"
                        : "transparent",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedNotebooks((prev) => ({
                          ...prev,
                          [nb.id]: !isOpen,
                        }))
                      }
                      className="w-4 h-4 flex items-center justify-center rounded shrink-0 hover:bg-[var(--bg-surface-hover)]"
                      style={{ color: "var(--text-muted)" }}
                      aria-label={
                        isOpen ? "Collapse notebook" : "Expand notebook"
                      }
                    >
                      {isOpen ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>

                    {editingNotebookId === nb.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (editingNotebookName.trim()) {
                            onRenameNotebook(nb.id, editingNotebookName.trim());
                          }
                          setEditingNotebookId(null);
                        }}
                        className="flex-1 flex items-center gap-1"
                      >
                        <input
                          type="text"
                          autoFocus
                          value={editingNotebookName}
                          onChange={(e) =>
                            setEditingNotebookName(e.target.value)
                          }
                          onBlur={() => setEditingNotebookId(null)}
                          className="w-full h-6 px-1.5 rounded border text-xs outline-none"
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-primary)",
                          }}
                        />
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectScope({
                            type: "notebook",
                            notebookId: nb.id,
                          });
                          onCloseMobile();
                        }}
                        className="flex-1 min-w-0 flex items-center gap-1.5 text-left text-xs font-semibold"
                        style={{
                          color: isScopeActive
                            ? "var(--accent)"
                            : "var(--text-primary)",
                        }}
                      >
                        <span className="shrink-0">{nb.icon || "📓"}</span>
                        <span className="truncate">{nb.name}</span>
                      </button>
                    )}

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedNotebooks((prev) => ({
                            ...prev,
                            [nb.id]: true,
                          }));
                          onCreateNote({ notebookId: nb.id });
                          onCloseMobile();
                        }}
                        title="New page in notebook"
                        aria-label={`New page in ${nb.name}`}
                        className="w-5 h-5 rounded flex items-center justify-center hover:bg-[var(--bg-surface-hover)]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setNotebookMenuId((prev) =>
                            prev === nb.id ? null : nb.id,
                          )
                        }
                        title="Notebook options"
                        aria-label={`Options for ${nb.name}`}
                        className="w-5 h-5 rounded flex items-center justify-center hover:bg-[var(--bg-surface-hover)]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <MoreHorizontal className="w-3 h-3" />
                      </button>
                    </div>

                    {notebookMenuId === nb.id && (
                      <div
                        className="absolute right-1 top-7 z-30 w-36 rounded-lg border py-1 text-xs"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          borderColor: "var(--border-subtle)",
                          boxShadow: "var(--shadow-popover)",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNotebookId(nb.id);
                            setEditingNotebookName(nb.name);
                            setNotebookMenuId(null);
                          }}
                          className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-surface-subtle)]"
                          style={{ color: "var(--text-primary)" }}
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Rename</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteNotebook(nb.id);
                            setNotebookMenuId(null);
                          }}
                          className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-surface-subtle)]"
                          style={{ color: "var(--danger)" }}
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {isOpen && nbNotes.length > 0 && (
                    <div className="space-y-0.5 pl-1">
                      {nbNotes.map((note) => renderPageNode(note, 0))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Unfiled / Standalone Pages Tree */}
        {standaloneRootNotes.length > 0 && (
          <div className="space-y-1">
            <div
              className="px-2.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Pages
            </div>
            <div className="space-y-0.5">
              {standaloneRootNotes.map((note) => renderPageNode(note, 0))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Archive & Trash Scopes */}
      <div
        className="px-2.5 py-2.5 border-t space-y-0.5 shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <button
          type="button"
          onClick={() => {
            onSelectScope({ type: "archive" });
            onCloseMobile();
          }}
          className="w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors hover:bg-[var(--bg-surface-subtle)]"
          style={{
            backgroundColor:
              activeScope.type === "archive" && !activeNoteId
                ? "var(--accent-soft)"
                : "transparent",
            color:
              activeScope.type === "archive" && !activeNoteId
                ? "var(--accent)"
                : "var(--text-secondary)",
          }}
        >
          <span className="flex items-center gap-2">
            <Archive className="w-3.5 h-3.5" />
            <span>Archive</span>
          </span>
          <span
            className="font-mono tabular-nums text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {archivedCount}
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Collapsible Left Sidebar */}
      {!sidebarCollapsed && (
        <aside
          className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r h-full"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          {sidebarBody}
        </aside>
      )}

      {/* Mobile / Tablet Slide-Over Drawer */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Notes page tree"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside
            className="relative z-10 w-72 max-w-[85vw] h-full border-r flex flex-col"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            {sidebarBody}
          </aside>
        </div>
      )}
    </>
  );
};
