import React, { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowUpDown,
  FileText,
  LayoutGrid,
  List,
  Menu,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { Entry, NoteNotebook, NoteStatus } from "../../types";
import { formatShortDate } from "../../utils/date";
import {
  computeNoteBacklinks,
  stripHtmlToText,
} from "../../utils/noteMarkdown";
import {
  NOTE_STATUS_OPTIONS,
  NOTE_TEMPLATES,
  NoteTemplateDef,
  getNoteStatusMeta,
  resolveCoverStyle,
} from "../../utils/noteTemplates";
import { NotesScope } from "./NotesSidebarTree";

export type NotesBrowserViewMode = "gallery" | "table" | "list";
export type NotesSortField = "updated" | "created" | "title" | "backlinks";

interface NotesDatabaseHomeProps {
  notes: Entry[];
  notebooks: NoteNotebook[];
  scope: NotesScope;
  sidebarCollapsed: boolean;
  onExpandSidebar: () => void;
  onOpenMobileTree: () => void;
  onOpenNote: (id: string) => void;
  onQuickCapture: (title: string) => void;
  onCreateBlank: () => void;
  onCreateFromTemplate: (template: NoteTemplateDef) => void;
  onUpdateNote: (id: string, patch: Partial<Entry>) => void;
  onArchiveNote: (id: string, archived: boolean) => void;
  onTrashNote: (id: string) => void;
}

export const NotesDatabaseHome: React.FC<NotesDatabaseHomeProps> = ({
  notes,
  notebooks,
  scope,
  sidebarCollapsed,
  onExpandSidebar,
  onOpenMobileTree,
  onOpenNote,
  onQuickCapture,
  onCreateBlank,
  onCreateFromTemplate,
  onUpdateNote,
  onArchiveNote,
  onTrashNote,
}) => {
  const [viewMode, setViewMode] = useState<NotesBrowserViewMode>("gallery");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<NoteStatus | "all">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sortField, setSortField] = useState<NotesSortField>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [captureDraft, setCaptureDraft] = useState("");
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  const notebookMap = useMemo(
    () => new Map(notebooks.map((nb) => [nb.id, nb])),
    [notebooks],
  );

  const noteTitleMap = useMemo(
    () => new Map(notes.map((n) => [n.id, n])),
    [notes],
  );

  // Compute incoming backlink counts once per notes array
  const backlinkCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) {
      counts.set(note.id, computeNoteBacklinks(note, notes).length);
    }
    return counts;
  }, [notes]);

  const scopedNotes = useMemo(() => {
    return notes.filter((n) => {
      const isArchived = Boolean(n.archived) || n.noteStatus === "archived";
      if (scope.type === "archive") return isArchived;
      if (isArchived) return false;
      if (scope.type === "favorites")
        return Boolean(n.favorite) || Boolean(n.pinned);
      if (scope.type === "notebook") return n.notebookId === scope.notebookId;
      return true;
    });
  }, [notes, scope]);

  const availableTags = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of scopedNotes) {
      for (const t of n.tags) {
        map.set(t, (map.get(t) || 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [scopedNotes]);

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = scopedNotes.filter((n) => {
      if (statusFilter !== "all" && (n.noteStatus ?? "draft") !== statusFilter)
        return false;
      if (tagFilter && !n.tags.includes(tagFilter)) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        stripHtmlToText(n.content).toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
      );
    });

    return list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") {
        cmp = (a.title || "Untitled").localeCompare(b.title || "Untitled");
      } else if (sortField === "created") {
        cmp = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      } else if (sortField === "backlinks") {
        cmp = (backlinkCounts.get(a.id) || 0) - (backlinkCounts.get(b.id) || 0);
      } else {
        cmp =
          Date.parse(a.updatedAt || a.createdAt) -
          Date.parse(b.updatedAt || b.createdAt);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [
    scopedNotes,
    statusFilter,
    tagFilter,
    search,
    sortField,
    sortDir,
    backlinkCounts,
  ]);

  const scopeTitle = useMemo(() => {
    if (scope.type === "favorites") return "Favorites";
    if (scope.type === "archive") return "Archive";
    if (scope.type === "notebook") {
      const nb = notebookMap.get(scope.notebookId);
      return nb ? `${nb.icon} ${nb.name}` : "Notebook";
    }
    return "All Notes";
  }, [scope, notebookMap]);

  const handleSortToggle = (field: NotesSortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "title" ? "asc" : "desc");
    }
  };

  const handleQuickCaptureSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = captureDraft.trim();
    if (!clean) return;
    onQuickCapture(clean);
    setCaptureDraft("");
  };

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-5 sm:py-7 space-y-5">
        {/* Top Scope Header */}
        <header
          className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onOpenMobileTree}
              className="lg:hidden h-9 w-9 rounded-lg border flex items-center justify-center shrink-0"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
              aria-label="Open notebooks drawer"
            >
              <Menu className="w-4 h-4" />
            </button>
            {sidebarCollapsed && (
              <button
                type="button"
                onClick={onExpandSidebar}
                className="hidden lg:flex h-8 w-8 rounded-lg border items-center justify-center shrink-0 transition-colors hover:bg-[var(--bg-surface-subtle)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
                title="Expand sidebar"
                aria-label="Expand notes sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight truncate">
                {scopeTitle}
              </h1>
              <p
                className="text-xs font-mono tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                {filteredNotes.length}{" "}
                {filteredNotes.length === 1 ? "page" : "pages"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTemplateModalOpen(true)}
              className="h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface-subtle)]"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            >
              <Sparkles
                className="w-3.5 h-3.5"
                style={{ color: "var(--accent)" }}
              />
              <span>Templates</span>
            </button>
            <button
              type="button"
              onClick={onCreateBlank}
              className="h-9 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-transform active:scale-95"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Page</span>
            </button>
          </div>
        </header>

        {/* Quick Capture Bar (hidden inside Trash/Archive) */}
        {scope.type !== "archive" && (
          <form
            onSubmit={handleQuickCaptureSubmit}
            className="flex items-center gap-2 rounded-xl border px-3 py-1.5"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <Plus
              className="w-4 h-4 shrink-0"
              style={{ color: "var(--accent)" }}
            />
            <input
              type="text"
              value={captureDraft}
              onChange={(e) => setCaptureDraft(e.target.value)}
              placeholder="Quick capture a thought or page title... (Press Enter to create & open)"
              className="flex-1 min-w-0 h-8 bg-transparent text-sm outline-none"
              style={{ color: "var(--text-primary)" }}
            />
            {captureDraft.trim() && (
              <button
                type="submit"
                className="h-7 px-3 rounded-lg text-xs font-semibold shrink-0"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                Capture
              </button>
            )}
          </form>
        )}

        {/* Filter, Search, Sort & Gallery/Table/List View Switcher */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex items-center gap-2 px-3 h-8 rounded-lg border w-full sm:w-56"
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
                placeholder="Search title, body, tags..."
                className="w-full bg-transparent text-xs outline-none"
                style={{ color: "var(--text-primary)" }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {scope.type !== "archive" && (
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as NoteStatus | "all")
                }
                aria-label="Filter by status"
                className="h-8 px-2.5 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                <option value="all">All Statuses</option>
                {NOTE_STATUS_OPTIONS.filter((s) => s.id !== "archived").map(
                  (st) => (
                    <option key={st.id} value={st.id}>
                      {st.label}
                    </option>
                  ),
                )}
              </select>
            )}

            {availableTags.length > 0 && (
              <select
                value={tagFilter || ""}
                onChange={(e) => setTagFilter(e.target.value || null)}
                aria-label="Filter by tag"
                className="h-8 px-2.5 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                <option value="">All Tags</option>
                {availableTags.map(([t, count]) => (
                  <option key={t} value={t}>
                    #{t} ({count})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center justify-between md:justify-end gap-2">
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as NotesSortField)}
              aria-label="Sort notes"
              className="h-8 px-2.5 rounded-lg border text-xs outline-none"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              <option value="updated">Sort: Recently updated</option>
              <option value="created">Sort: Created date</option>
              <option value="title">Sort: Title A–Z</option>
              <option value="backlinks">Sort: Backlinks</option>
            </select>

            <div
              className="inline-flex items-center p-0.5 rounded-lg border"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
              role="tablist"
              aria-label="Notes layout view"
            >
              {(
                [
                  { id: "gallery", label: "Gallery", icon: LayoutGrid },
                  { id: "table", label: "Table", icon: Table2 },
                  { id: "list", label: "List", icon: List },
                ] as const
              ).map((mode) => {
                const Icon = mode.icon;
                const active = viewMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setViewMode(mode.id)}
                    className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                    style={{
                      backgroundColor: active
                        ? "var(--accent-soft)"
                        : "transparent",
                      color: active ? "var(--accent)" : "var(--text-secondary)",
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{mode.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Empty State */}
        {filteredNotes.length === 0 ? (
          <div
            className="rounded-2xl border py-16 px-6 text-center space-y-3"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <FileText
              className="w-8 h-8 mx-auto opacity-50"
              style={{ color: "var(--text-muted)" }}
            />
            <div className="space-y-1">
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {scope.type === "archive"
                  ? "No archived notes"
                  : "No notes match this view"}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                "Capture a quick thought above, start from a template, or clear
                filters."
              </p>
            </div>
            {scope.type !== "archive" && (
              <div className="pt-2 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={onCreateBlank}
                  className="h-9 px-4 rounded-xl text-xs font-semibold"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  Create Blank Page
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateModalOpen(true)}
                  className="h-9 px-4 rounded-xl border text-xs font-medium"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                >
                  Browse Templates
                </button>
              </div>
            )}
          </div>
        ) : viewMode === "gallery" ? (
          /* 1. Gallery Cards View */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredNotes.map((note) => {
              const excerpt = stripHtmlToText(note.content);
              const coverStyle = resolveCoverStyle(note.coverPreset);
              const nb = note.notebookId
                ? notebookMap.get(note.notebookId)
                : null;
              const statusMeta = getNoteStatusMeta(note.noteStatus);
              const parent = note.parentId
                ? noteTitleMap.get(note.parentId)
                : null;
              const linkCount = backlinkCounts.get(note.id) || 0;

              return (
                <div
                  key={note.id}
                  onClick={() => onOpenNote(note.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenNote(note.id);
                    }
                  }}
                  className="group rounded-2xl border overflow-hidden flex flex-col transition-all hover:-translate-y-0.5 cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  {/* Subtle Cover Header */}
                  <div
                    className="h-16 relative border-b shrink-0"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                      ...(coverStyle || {}),
                    }}
                  >
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateNote(note.id, { favorite: !note.favorite });
                        }}
                        aria-label={
                          note.favorite
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                        className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors backdrop-blur-sm"
                        style={{
                          backgroundColor:
                            "color-mix(in srgb, var(--bg-surface) 80%, transparent)",
                          color: note.favorite
                            ? "var(--accent)"
                            : "var(--text-muted)",
                        }}
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${note.favorite ? "fill-current" : ""}`}
                        />
                      </button>
                      {scope.type === "archive" ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onArchiveNote(note.id, false);
                          }}
                          title="Unarchive"
                          aria-label="Unarchive note"
                          className="h-7 w-7 rounded-lg flex items-center justify-center backdrop-blur-sm"
                          style={{
                            backgroundColor:
                              "color-mix(in srgb, var(--bg-surface) 80%, transparent)",
                            color: "var(--accent)",
                          }}
                        >
                          <ArchiveRestore className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onTrashNote(note.id);
                          }}
                          title="Delete Note"
                          aria-label="Move note to Trash"
                          className="h-7 w-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                          style={{
                            backgroundColor:
                              "color-mix(in srgb, var(--bg-surface) 80%, transparent)",
                            color: "var(--danger)",
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-start gap-2">
                        <span className="text-lg leading-none mt-0.5 shrink-0">
                          {note.icon || "📝"}
                        </span>
                        <div className="min-w-0 flex-1">
                          {parent && (
                            <div
                              className="text-[11px] truncate mb-0.5"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {parent.icon || "📝"} {parent.title} /
                            </div>
                          )}
                          <h2 className="font-display text-sm font-bold leading-snug line-clamp-2">
                            {note.title || "Untitled Note"}
                          </h2>
                        </div>
                      </div>

                      <p
                        className="mt-2 text-xs leading-relaxed line-clamp-3"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {excerpt || "Empty page — click to begin writing."}
                      </p>
                    </div>

                    {/* Clean Unboxed Single-Line Metadata */}
                    <div
                      className="pt-2.5 border-t flex items-center justify-between gap-2 text-[11px]"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-muted)",
                      }}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        <span className="inline-flex items-center gap-1 shrink-0">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: statusMeta.dotColor }}
                          />
                          <span>{statusMeta.label}</span>
                        </span>
                        {nb && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{nb.name}</span>
                          </>
                        )}
                        {note.tags.length > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">#{note.tags[0]}</span>
                          </>
                        )}
                      </div>
                      <span className="font-mono tabular-nums shrink-0">
                        {linkCount > 0 ? `${linkCount} links · ` : ""}
                        {formatShortDate(note.updatedAt || note.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === "table" ? (
          /* 2. Dense Sortable Database Table View */
          <div
            className="rounded-2xl border overflow-x-auto"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr
                  className="border-b text-[11px] font-semibold uppercase tracking-wider"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-muted)",
                  }}
                >
                  <th className="py-2.5 px-3.5">
                    <button
                      type="button"
                      onClick={() => handleSortToggle("title")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)]"
                    >
                      <span>Page</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3">Notebook</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 hidden md:table-cell">Tags</th>
                  <th className="py-2.5 px-3 text-right hidden sm:table-cell">
                    <button
                      type="button"
                      onClick={() => handleSortToggle("backlinks")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)]"
                    >
                      <span>Links</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSortToggle("updated")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)]"
                    >
                      <span>Updated</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody
                className="divide-y"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {filteredNotes.map((note) => {
                  const nb = note.notebookId
                    ? notebookMap.get(note.notebookId)
                    : null;
                  const linkCount = backlinkCounts.get(note.id) || 0;
                  return (
                    <tr
                      key={note.id}
                      onClick={() => onOpenNote(note.id)}
                      className="cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]"
                    >
                      <td className="py-2.5 px-3.5 font-medium max-w-[260px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0">{note.icon || "📝"}</span>
                          <span
                            className="truncate font-semibold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {note.title || "Untitled Note"}
                          </span>
                        </div>
                      </td>
                      <td
                        className="py-2.5 px-3 whitespace-nowrap"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {nb ? `${nb.icon} ${nb.name}` : "—"}
                      </td>
                      <td
                        className="py-2.5 px-3 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={note.noteStatus ?? "draft"}
                          onChange={(e) => {
                            const nextStatus = e.target.value as NoteStatus;
                            onUpdateNote(note.id, {
                              noteStatus: nextStatus,
                              archived: nextStatus === "archived",
                            });
                          }}
                          aria-label={`Status for ${note.title}`}
                          className="h-7 px-2 rounded-md border text-[11px] outline-none"
                          style={{
                            backgroundColor: "var(--bg-canvas)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-primary)",
                          }}
                        >
                          {NOTE_STATUS_OPTIONS.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td
                        className="py-2.5 px-3 hidden md:table-cell max-w-[180px] truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {note.tags.length > 0
                          ? note.tags.map((t) => `#${t}`).join(" ")
                          : "—"}
                      </td>
                      <td
                        className="py-2.5 px-3 text-right font-mono tabular-nums hidden sm:table-cell"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {linkCount}
                      </td>
                      <td
                        className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {formatShortDate(note.updatedAt || note.createdAt)}
                      </td>
                      <td
                        className="py-2.5 px-3 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateNote(note.id, {
                                favorite: !note.favorite,
                              })
                            }
                            aria-label="Toggle favorite"
                            className="h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)]"
                            style={{
                              color: note.favorite
                                ? "var(--accent)"
                                : "var(--text-muted)",
                            }}
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${note.favorite ? "fill-current" : ""}`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              scope.type === "archive"
                                ? onArchiveNote(note.id, false)
                                : onTrashNote(note.id)
                            }
                            aria-label={
                              scope.type === "archive"
                                ? "Unarchive"
                                : "Delete Note"
                            }
                            className="h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)]"
                            style={{
                              color:
                                scope.type === "archive"
                                  ? "var(--accent)"
                                  : "var(--danger)",
                            }}
                          >
                            {scope.type === "archive" ? (
                              <ArchiveRestore className="w-3.5 h-3.5" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* 3. Compact List Rows View */
          <div
            className="rounded-2xl border divide-y overflow-hidden"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            {filteredNotes.map((note) => {
              const nb = note.notebookId
                ? notebookMap.get(note.notebookId)
                : null;
              const statusMeta = getNoteStatusMeta(note.noteStatus);
              const excerpt = stripHtmlToText(note.content);
              return (
                <div
                  key={note.id}
                  onClick={() => onOpenNote(note.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenNote(note.id);
                    }
                  }}
                  className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-3">
                    <span className="text-base shrink-0">
                      {note.icon || "📝"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">
                          {note.title || "Untitled Note"}
                        </span>
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          title={statusMeta.label}
                          style={{ backgroundColor: statusMeta.dotColor }}
                        />
                      </div>
                      {excerpt && (
                        <p
                          className="text-xs truncate mt-0.5"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {excerpt}
                        </p>
                      )}
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-3 shrink-0 text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {nb && <span className="hidden sm:inline">{nb.name}</span>}
                    {note.tags.length > 0 && (
                      <span className="hidden md:inline">
                        {note.tags
                          .slice(0, 2)
                          .map((t) => `#${t}`)
                          .join(" ")}
                      </span>
                    )}
                    <span className="font-mono tabular-nums">
                      {formatShortDate(note.updatedAt || note.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateNote(note.id, { favorite: !note.favorite });
                      }}
                      aria-label="Toggle favorite"
                      className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-[var(--bg-surface-hover)]"
                      style={{
                        color: note.favorite
                          ? "var(--accent)"
                          : "var(--text-muted)",
                      }}
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${note.favorite ? "fill-current" : ""}`}
                      />
                    </button>
                    {scope.type === "archive" ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchiveNote(note.id, false);
                        }}
                        aria-label="Unarchive"
                        className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-[var(--bg-surface-hover)]"
                        style={{ color: "var(--accent)" }}
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchiveNote(note.id, true);
                        }}
                        title="Archive"
                        aria-label="Archive note"
                        className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-[var(--bg-surface-hover)]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Starter Templates Modal */}
      {templateModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Choose a Note Template"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setTemplateModalOpen(false)}
          />
          <div
            className="relative z-10 w-full max-w-xl rounded-2xl border p-5 space-y-4"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-subtle)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold">
                  Start from Template
                </h2>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Pre-structured blocks for learning, synthesis, and reflection.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTemplateModalOpen(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center"
                style={{ color: "var(--text-muted)" }}
                aria-label="Close templates"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {NOTE_TEMPLATES.map((tpl) => {
                const cover = resolveCoverStyle(tpl.coverPreset);
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      onCreateFromTemplate(tpl);
                      setTemplateModalOpen(false);
                    }}
                    className="rounded-xl border overflow-hidden text-left transition-all hover:border-[var(--accent)] flex flex-col"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <div
                      className="h-8 w-full border-b"
                      style={{
                        borderColor: "var(--border-subtle)",
                        backgroundColor: "var(--bg-surface-subtle)",
                        ...(cover || {}),
                      }}
                    />
                    <div className="p-3 space-y-1">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <span>{tpl.icon}</span>
                        <span>{tpl.name}</span>
                      </div>
                      <p
                        className="text-xs leading-relaxed"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {tpl.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
