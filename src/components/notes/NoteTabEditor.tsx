import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "@tiptap/react";
import {
  Archive,
  ArrowUpRight,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  GitBranch,
  Hash,
  Link2,
  ListChecks,
  Maximize2,
  Network,
  PanelLeftOpen,
  Pin,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useWorkspace } from "../../context/WorkspaceContext";
import {
  getNoteAncestorChain,
  getNoteDescendantIds,
} from "../../lib/noteGraphUtils";
import type { BookNoteLink, Entry, ListItemNoteLink } from "../../types";
import {
  countWordsFromHtml,
  formatCompactDayHeading,
  formatTime,
  getEntryDayKey,
} from "../../utils/date";
import { normalizeListItemNoteLinks } from "../../utils/listItemLinks";
import { ListItemLinksPicker } from "../lists/ListItemLinksPicker";
import type { TimestampFieldFocus } from "../TimestampsModal";
import { TiptapEditor, TiptapThumbToolbar } from "../TiptapEditor";
import { NotePageIcon } from "../IconLibrary";
import { IconPickerPopover } from "../IconPicker";

const PROPS_OPEN_STORAGE_KEY = "kanso_note_tab_props_open_v1";

function loadPropsOpenPref(): boolean {
  try {
    return localStorage.getItem(PROPS_OPEN_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

const PropertyRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  alignTop?: boolean;
}> = ({ icon, label, children, alignTop = false }) => (
  <div
    className={`flex ${
      alignTop ? "items-start" : "items-center"
    } gap-2 py-1 min-h-[32px] text-xs`}
  >
    <div
      className={`w-[104px] shrink-0 flex items-center gap-2 select-none ${
        alignTop ? "pt-1" : ""
      }`}
      style={{ color: "var(--text-muted)" }}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="truncate font-medium">{label}</span>
    </div>
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

interface NoteTabEditorProps {
  note: Entry;
  allActiveNotes: Entry[];
  sidebarCollapsedDesktop: boolean;
  connOpenDesktop: boolean;
  onExpandDesktopSidebar: () => void;
  onOpenMobileTree: () => void;
  onToggleDesktopConnections: () => void;
  onOpenMobileConnections: () => void;
  onOpenNoteTab: (noteId: string) => void;
  onCreateNoteTab: (options?: {
    notebookId?: string | null;
    parentId?: string | null;
    title?: string;
  }) => Entry;
  onOpenInModal: (noteId: string) => void;
  onOpenTimestamps?: (entryId: string, focus?: TimestampFieldFocus) => void;
  onJumpToBookLocation?: (bookLink: BookNoteLink) => void;
  onJumpToListItem?: (listItemId: string) => void;
  onRequestArchive: (note: Entry) => void;
  onRequestDelete: (note: Entry) => void;
  onRestoreNote: (noteId: string) => void;
}

function buildNoteSnapshot(src: {
  title: string;
  icon: string;
  content: string;
  tags: string[];
  pinned: boolean;
  listIds: string[];
  syncToTimeline: boolean;
  notebookId: string | null;
  parentId: string | null;
  bookLink: BookNoteLink | null;
  listItemLinks: ListItemNoteLink[];
}): string {
  return JSON.stringify(src);
}

export const NoteTabEditor: React.FC<NoteTabEditorProps> = ({
  note,
  allActiveNotes,
  sidebarCollapsedDesktop,
  connOpenDesktop,
  onExpandDesktopSidebar,
  onOpenMobileTree,
  onToggleDesktopConnections,
  onOpenMobileConnections,
  onOpenNoteTab,
  onCreateNoteTab,
  onOpenInModal,
  onOpenTimestamps,
  onJumpToBookLocation,
  onJumpToListItem,
  onRequestArchive,
  onRequestDelete,
  onRestoreNote,
}) => {
  const { workspace, updateEntry, addNotePage, pushToast } = useWorkspace();

  const [title, setTitle] = useState(() => note.title ?? "");
  const [icon, setIcon] = useState<string>(() => note.icon ?? "");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [content, setContent] = useState(() => note.content ?? "");
  const [tags, setTags] = useState<string[]>(() => note.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [pinned, setPinned] = useState(() => Boolean(note.pinned));
  const [listIds, setListIds] = useState<string[]>(() => note.listIds ?? []);
  const [syncToTimeline, setSyncToTimeline] = useState(() =>
    Boolean(note.syncToTimeline),
  );
  const [notebookId, setNotebookId] = useState<string | null>(
    () => note.notebookId ?? null,
  );
  const [parentId, setParentId] = useState<string | null>(
    () => note.parentId ?? null,
  );
  const [bookLink, setBookLink] = useState<BookNoteLink | null>(
    () => note.bookLink ?? null,
  );
  const [listItemLinks, setListItemLinks] = useState<ListItemNoteLink[]>(() =>
    normalizeListItemNoteLinks(note.listItemLinks),
  );

  const [propsExpanded, setPropsExpanded] = useState<boolean>(loadPropsOpenPref);
  const [subPagesCollapsed, setSubPagesCollapsed] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);

  const lastSavedSnapRef = useRef<string>(
    buildNoteSnapshot({
      title: note.title ?? "",
      icon: note.icon ?? "",
      content: note.content ?? "",
      tags: note.tags ?? [],
      pinned: Boolean(note.pinned),
      listIds: note.listIds ?? [],
      syncToTimeline: Boolean(note.syncToTimeline),
      notebookId: note.notebookId ?? null,
      parentId: note.parentId ?? null,
      bookLink: note.bookLink ?? null,
      listItemLinks: normalizeListItemNoteLinks(note.listItemLinks),
    }),
  );

  const latestDraftRef = useRef({
    noteId: note.id,
    title,
    icon,
    content,
    tags,
    pinned,
    listIds,
    syncToTimeline,
    notebookId,
    parentId,
    bookLink,
    listItemLinks,
  });

  latestDraftRef.current = {
    noteId: note.id,
    title,
    icon,
    content,
    tags,
    pinned,
    listIds,
    syncToTimeline,
    notebookId,
    parentId,
    bookLink,
    listItemLinks,
  };

  useEffect(() => {
    editorRef.current = editorInstance;
  }, [editorInstance]);

  // Persist properties open/collapsed preference locally
  useEffect(() => {
    try {
      localStorage.setItem(PROPS_OPEN_STORAGE_KEY, String(propsExpanded));
    } catch {
      // Ignore
    }
  }, [propsExpanded]);

  // Auto-resize display title textarea
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title, note.id]);

  // Sync external mutations (sidebar move, context menu pin, connection map link, modal edit)
  useEffect(() => {
    const incomingListItemLinks = normalizeListItemNoteLinks(note.listItemLinks);
    const incomingSnap = buildNoteSnapshot({
      title: note.title ?? "",
      icon: note.icon ?? "",
      content: note.content ?? "",
      tags: note.tags ?? [],
      pinned: Boolean(note.pinned),
      listIds: note.listIds ?? [],
      syncToTimeline: Boolean(note.syncToTimeline),
      notebookId: note.notebookId ?? null,
      parentId: note.parentId ?? null,
      bookLink: note.bookLink ?? null,
      listItemLinks: incomingListItemLinks,
    });
    if (incomingSnap === lastSavedSnapRef.current) return;

    const currentLocalSnap = buildNoteSnapshot({
      title: latestDraftRef.current.title,
      icon: latestDraftRef.current.icon,
      content: latestDraftRef.current.content,
      tags: latestDraftRef.current.tags,
      pinned: latestDraftRef.current.pinned,
      listIds: latestDraftRef.current.listIds,
      syncToTimeline: latestDraftRef.current.syncToTimeline,
      notebookId: latestDraftRef.current.notebookId,
      parentId: latestDraftRef.current.parentId,
      bookLink: latestDraftRef.current.bookLink,
      listItemLinks: latestDraftRef.current.listItemLinks,
    });

    if (currentLocalSnap === lastSavedSnapRef.current) {
      // Local draft isn't dirty: sync cleanly to incoming note
      setTitle(note.title ?? "");
      setIcon(note.icon ?? "");
      setContent(note.content ?? "");
      setTags(note.tags ?? []);
      setPinned(Boolean(note.pinned));
      setListIds(note.listIds ?? []);
      setSyncToTimeline(Boolean(note.syncToTimeline));
      setNotebookId(note.notebookId ?? null);
      setParentId(note.parentId ?? null);
      setBookLink(note.bookLink ?? null);
      setListItemLinks(incomingListItemLinks);
      lastSavedSnapRef.current = incomingSnap;
    }
  }, [
    note.id,
    note.title,
    note.icon,
    note.content,
    note.tags,
    note.pinned,
    note.listIds,
    note.syncToTimeline,
    note.notebookId,
    note.parentId,
    note.bookLink,
    note.listItemLinks,
  ]);

  const flushSave = useCallback(() => {
    const draft = latestDraftRef.current;
    const ed = editorRef.current;
    const liveHtml = ed && !ed.isDestroyed ? ed.getHTML() : null;
    const effectiveContent =
      liveHtml !== null ? (liveHtml === "<p></p>" ? "" : liveHtml) : draft.content;

    const snap = buildNoteSnapshot({
      title: draft.title,
      icon: draft.icon,
      content: effectiveContent,
      tags: draft.tags,
      pinned: draft.pinned,
      listIds: draft.listIds,
      syncToTimeline: draft.syncToTimeline,
      notebookId: draft.notebookId,
      parentId: draft.parentId,
      bookLink: draft.bookLink,
      listItemLinks: draft.listItemLinks,
    });
    if (snap === lastSavedSnapRef.current) {
      setSaveState("saved");
      return;
    }

    updateEntry(draft.noteId, {
      title: draft.title.trim() || "Untitled Note",
      icon: draft.icon || "",
      content: effectiveContent,
      tags: draft.tags,
      pinned: draft.pinned,
      listIds: draft.listIds,
      syncToTimeline: draft.syncToTimeline,
      notebookId: draft.notebookId,
      parentId: draft.parentId,
      bookLink: draft.bookLink,
      listItemLinks:
        draft.listItemLinks.length > 0 ? draft.listItemLinks : undefined,
    });
    lastSavedSnapRef.current = snap;
    setSaveState("saved");
  }, [updateEntry]);

  // Debounced autosave
  useEffect(() => {
    const currentSnap = buildNoteSnapshot({
      title,
      icon,
      content,
      tags,
      pinned,
      listIds,
      syncToTimeline,
      notebookId,
      parentId,
      bookLink,
      listItemLinks,
    });
    if (currentSnap === lastSavedSnapRef.current) return;

    setSaveState("saving");
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      if (!isComposingRef.current) flushSave();
    }, 350);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    title,
    icon,
    content,
    tags,
    pinned,
    listIds,
    syncToTimeline,
    notebookId,
    parentId,
    bookLink,
    listItemLinks,
    flushSave,
  ]);

  // Flush unsaved edits cleanly on unmount, tab switch, or page hide/unload
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushSave();
    };
    window.addEventListener("pagehide", flushSave);
    window.addEventListener("beforeunload", flushSave);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", flushSave);
      window.removeEventListener("beforeunload", flushSave);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      flushSave();
    };
  }, [flushSave]);

  const noteMap = useMemo(
    () => new Map(allActiveNotes.map((n) => [n.id, n])),
    [allActiveNotes],
  );
  const descendantIds = useMemo(
    () => getNoteDescendantIds(note.id, allActiveNotes),
    [note.id, allActiveNotes],
  );
  const ancestorChain = useMemo(() => {
    if (parentId) {
      const p = noteMap.get(parentId);
      if (p) {
        const chain = getNoteAncestorChain(p.id, noteMap);
        return [...chain, p].filter((anc) => anc.id !== note.id);
      }
    }
    return getNoteAncestorChain(note.id, noteMap);
  }, [note.id, parentId, noteMap]);

  const childSubPages = useMemo(
    () =>
      allActiveNotes
        .filter((n) => n.parentId === note.id)
        .sort((a, b) => {
          const ao =
            typeof a.sortOrder === "number"
              ? a.sortOrder
              : Number.MAX_SAFE_INTEGER;
          const bo =
            typeof b.sortOrder === "number"
              ? b.sortOrder
              : Number.MAX_SAFE_INTEGER;
          if (ao !== bo) return ao - bo;
          return (
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
          );
        }),
    [note.id, allActiveNotes],
  );

  const availableParentNotes = useMemo(
    () =>
      allActiveNotes.filter(
        (n) => n.id !== note.id && !descendantIds.has(n.id),
      ),
    [allActiveNotes, note.id, descendantIds],
  );

  const activeNotebookObj = useMemo(
    () =>
      notebookId
        ? (workspace.noteNotebooks || []).find((nb) => nb.id === notebookId) ??
          null
        : null,
    [notebookId, workspace.noteNotebooks],
  );

  const linkedBook = useMemo(
    () =>
      bookLink?.bookId
        ? workspace.books.find((b) => b.id === bookLink.bookId) || null
        : null,
    [bookLink?.bookId, workspace.books],
  );
  const isRemovedSnapshot = Boolean(bookLink && !linkedBook);

  const activeLists = workspace.lists || [];
  const timeFormat = workspace.settings.timeFormat;
  const wordCount = useMemo(() => countWordsFromHtml(content), [content]);

  const handleAddTag = (raw: string) => {
    const clean = raw.trim().replace(/^#/, "").toLowerCase();
    if (!clean || tags.includes(clean)) {
      setTagInput("");
      return;
    }
    setTags((prev) => [...prev, clean]);
    setTagInput("");
  };

  const handleNavigateToNote = (targetId: string, linkTitle?: string) => {
    const found =
      noteMap.get(targetId) ??
      (linkTitle
        ? allActiveNotes.find(
            (n) =>
              (n.title || "").trim().toLowerCase() ===
              linkTitle.trim().toLowerCase(),
          )
        : undefined);
    if (!found) {
      pushToast("Linked note not found", "neutral");
      return;
    }
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    flushSave();
    onOpenNoteTab(found.id);
  };

  const handleCreateSubPage = () => {
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    flushSave();
    onCreateNoteTab({
      notebookId,
      parentId: note.id,
    });
  };

  return (
    <div
      className="flex-1 min-h-0 flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--bg-canvas)" }}
      onCompositionStart={() => {
        isComposingRef.current = true;
      }}
      onCompositionEnd={() => {
        isComposingRef.current = false;
      }}
    >
      {/* Clean Note Action & Breadcrumb Header */}
      <header
        className="h-11 px-4 sm:px-6 border-b flex items-center justify-between gap-3 shrink-0"
        style={{
          backgroundColor: "var(--bg-canvas)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {sidebarCollapsedDesktop && (
            <button
              type="button"
              onClick={onExpandDesktopSidebar}
              title="Show notes sidebar"
              aria-label="Show notes sidebar"
              className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg border transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer shrink-0"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              <PanelLeftOpen className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenMobileTree}
            title="Page tree & notebooks"
            aria-label="Open page tree"
            className="lg:hidden h-7 w-7 flex items-center justify-center rounded-lg border shrink-0 cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <PanelLeftOpen className="w-3.5 h-3.5" />
          </button>

          {/* Notion-style Ancestor Breadcrumb Trail */}
          <nav
            aria-label="Page breadcrumb"
            className="flex items-center gap-1 text-xs min-w-0 overflow-hidden"
            style={{ color: "var(--text-muted)" }}
          >
            <span className="truncate max-w-[120px] hidden sm:inline">
              {activeNotebookObj ? activeNotebookObj.name : "All Notes"}
            </span>
            {ancestorChain.map((anc) => (
              <React.Fragment key={anc.id}>
                <ChevronRight className="w-3 h-3 shrink-0 opacity-60 hidden sm:inline" />
                <button
                  type="button"
                  onClick={() => handleNavigateToNote(anc.id)}
                  className="truncate max-w-[130px] hover:underline cursor-pointer"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {anc.title || "Untitled Note"}
                </button>
              </React.Fragment>
            ))}
            {(ancestorChain.length > 0 || activeNotebookObj) && (
              <ChevronRight className="w-3 h-3 shrink-0 opacity-60 hidden sm:inline" />
            )}
            <span
              className="inline-flex items-center gap-1.5 truncate font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {icon && (
                <NotePageIcon
                  icon={icon}
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: "var(--accent)" }}
                />
              )}
              <span className="truncate">{title.trim() || "Untitled Note"}</span>
            </span>
          </nav>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <span
            className="hidden md:inline text-[11px] font-mono tabular-nums mr-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            {wordCount}w · {saveState === "saving" ? "Saving..." : "Autosaved"}
          </span>

          {!note.archived && (
            <button
              type="button"
              onClick={() => setPinned((p) => !p)}
              className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                backgroundColor: pinned ? "var(--accent-soft)" : "transparent",
                color: pinned ? "var(--accent)" : "var(--text-muted)",
              }}
              title={pinned ? "Unpin note" : "Pin note"}
              aria-label="Toggle pin"
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Connection Map Toggle */}
          <button
            type="button"
            onClick={onToggleDesktopConnections}
            aria-pressed={connOpenDesktop}
            title={
              connOpenDesktop
                ? "Hide connection map"
                : "Show connection map (Tree & Graph)"
            }
            className="hidden lg:inline-flex h-7 px-2 rounded-lg border text-xs font-medium items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
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
            <span className="hidden xl:inline">Connections</span>
          </button>

          <button
            type="button"
            onClick={onOpenMobileConnections}
            aria-label="Open connections map"
            title="Connections map"
            className="lg:hidden h-7 w-7 flex items-center justify-center rounded-lg border cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <Network className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              flushSave();
              onOpenInModal(note.id);
            }}
            title="Open in Details Modal"
            aria-label="Open in Details Modal"
            className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {!note.archived && (
            <button
              type="button"
              onClick={() => {
                flushSave();
                onRequestArchive(note);
              }}
              title="Archive note"
              aria-label="Archive note"
              className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              flushSave();
              onRequestDelete(note);
            }}
            title="Delete note"
            aria-label="Delete note"
            className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--danger)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Archived Banner */}
      {note.archived && (
        <div
          className="px-4 sm:px-6 py-2 border-b flex flex-wrap items-center justify-between gap-2 text-xs shrink-0"
          style={{
            backgroundColor: "var(--bg-surface-subtle)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-secondary)",
          }}
        >
          <span>This note is in the Archive.</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onRestoreNote(note.id)}
              className="h-7 px-2.5 rounded-md font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--accent)" }}
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restore</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Writing Canvas */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-none px-5 sm:px-8 lg:px-10 py-6 lg:py-8 pb-24 lg:pb-12">
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Page Icon + Clean Auto-Growing Display Title */}
          <div className="flex items-start gap-2.5 sm:gap-3">
            <div className="relative shrink-0 pt-0.5 sm:pt-1">
              <button
                type="button"
                onClick={() => setIconPickerOpen((prev) => !prev)}
                title={icon ? "Change page icon" : "Add page icon"}
                aria-label={icon ? "Change page icon" : "Add page icon"}
                aria-expanded={iconPickerOpen}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{
                  backgroundColor: icon
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                  borderColor: iconPickerOpen
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                  color: icon ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                <NotePageIcon icon={icon} className="w-5 h-5" />
              </button>

              <IconPickerPopover
                open={iconPickerOpen}
                onClose={() => setIconPickerOpen(false)}
                value={icon}
                onChange={(nextIcon) => setIcon(nextIcon)}
                onClear={() => setIcon("")}
                allowClear
                clearLabel="Default"
                title="Page Icon"
                align="left"
              />
            </div>

            <textarea
              ref={titleRef}
              rows={1}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (editorInstance) editorInstance.commands.focus("start");
                }
              }}
              placeholder="Untitled Note"
              className="flex-1 min-w-0 bg-transparent font-display text-2xl sm:text-[1.85rem] font-bold tracking-tight leading-snug resize-none outline-none overflow-hidden placeholder:opacity-35"
              style={{ color: "var(--text-primary)" }}
            />
          </div>

          {/* Collapsible Properties Section */}
          <section
            className="border-y py-2"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <button
              type="button"
              onClick={() => setPropsExpanded((v) => !v)}
              aria-expanded={propsExpanded}
              className="w-full flex flex-wrap items-center justify-between gap-2 py-1 text-left cursor-pointer group"
            >
              <span
                className="inline-flex items-center gap-1.5 text-xs font-medium transition-opacity group-hover:opacity-100"
                style={{ color: "var(--text-muted)" }}
              >
                {propsExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
                <span>Properties</span>
              </span>

              {!propsExpanded && (
                <span
                  className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums min-w-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  <span>{activeNotebookObj ? activeNotebookObj.name : "Unfiled"}</span>
                  {parentId && noteMap.get(parentId) && (
                    <span className="truncate max-w-[140px]">
                      · in {noteMap.get(parentId)!.title || "Untitled Note"}
                    </span>
                  )}
                  {syncToTimeline && (
                    <span style={{ color: "var(--accent)" }}>· Spine</span>
                  )}
                  {bookLink && (
                    <span className="truncate max-w-[160px]" style={{ color: "var(--accent)" }}>
                      · {linkedBook ? linkedBook.title : bookLink.bookTitle}
                    </span>
                  )}
                  {listItemLinks.length > 0 && (
                    <span className="truncate max-w-[160px]" style={{ color: "var(--accent)" }}>
                      · {listItemLinks.length} list {listItemLinks.length === 1 ? "item" : "items"}
                    </span>
                  )}
                  {tags.length > 0 && (
                    <span className="truncate max-w-[180px]" style={{ color: "var(--accent)" }}>
                      · {tags.map((t) => `#${t}`).join(" ")}
                    </span>
                  )}
                </span>
              )}
            </button>

            {propsExpanded && (
              <div className="pt-2 space-y-0.5">
                {/* Date */}
                <PropertyRow
                  icon={<Calendar className="w-3.5 h-3.5" />}
                  label="Date"
                >
                  {onOpenTimestamps ? (
                    <button
                      type="button"
                      onClick={() => onOpenTimestamps(note.id, "date")}
                      className="w-full text-left rounded-md px-2 py-1 -mx-1 font-mono tabular-nums transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {formatCompactDayHeading(getEntryDayKey(note))}
                    </button>
                  ) : (
                    <span
                      className="block px-2 py-1 -mx-1 font-mono tabular-nums"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {formatCompactDayHeading(getEntryDayKey(note))}
                    </span>
                  )}
                </PropertyRow>

                {/* Created */}
                <PropertyRow
                  icon={<Clock className="w-3.5 h-3.5" />}
                  label="Created"
                >
                  {onOpenTimestamps ? (
                    <button
                      type="button"
                      onClick={() => onOpenTimestamps(note.id, "created")}
                      className="w-full text-left rounded-md px-2 py-1 -mx-1 font-mono tabular-nums transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {formatTime(note.createdAt, timeFormat)}
                    </button>
                  ) : (
                    <span
                      className="block px-2 py-1 -mx-1 font-mono tabular-nums"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {formatTime(note.createdAt, timeFormat)}
                    </span>
                  )}
                </PropertyRow>

                {/* Notebook */}
                <PropertyRow
                  icon={<BookOpen className="w-3.5 h-3.5" />}
                  label="Notebook"
                >
                  <select
                    value={notebookId || ""}
                    onChange={(e) => setNotebookId(e.target.value || null)}
                    className="w-full bg-transparent rounded-md px-2 py-1 -mx-1 text-xs font-medium outline-none cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)]"
                    style={{
                      color: notebookId
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                    }}
                  >
                    <option
                      value=""
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        color: "var(--text-primary)",
                      }}
                    >
                      No notebook
                    </option>
                    {(workspace.noteNotebooks || []).map((nb) => (
                      <option
                        key={nb.id}
                        value={nb.id}
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {nb.name}
                      </option>
                    ))}
                  </select>
                </PropertyRow>

                {/* Parent Page */}
                <PropertyRow
                  icon={<GitBranch className="w-3.5 h-3.5" />}
                  label="Parent Page"
                >
                  <select
                    value={parentId || ""}
                    onChange={(e) => setParentId(e.target.value || null)}
                    className="w-full bg-transparent rounded-md px-2 py-1 -mx-1 text-xs font-medium outline-none cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)]"
                    style={{
                      color: parentId
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                    }}
                  >
                    <option
                      value=""
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        color: "var(--text-primary)",
                      }}
                    >
                      Top-level page
                    </option>
                    {availableParentNotes.map((pn) => (
                      <option
                        key={pn.id}
                        value={pn.id}
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {pn.title || "Untitled Note"}
                      </option>
                    ))}
                  </select>
                </PropertyRow>

                {/* Timeline sync */}
                <PropertyRow
                  icon={<Eye className="w-3.5 h-3.5" />}
                  label="Timeline"
                >
                  <button
                    type="button"
                    onClick={() => setSyncToTimeline((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-md px-2 py-1 -mx-1 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    aria-pressed={syncToTimeline}
                  >
                    <span
                      className="h-4 w-7 rounded-full p-0.5 transition-colors flex items-center"
                      style={{
                        backgroundColor: syncToTimeline
                          ? "var(--accent)"
                          : "var(--border-strong)",
                        justifyContent: syncToTimeline
                          ? "flex-end"
                          : "flex-start",
                      }}
                    >
                      <span className="w-3 h-3 rounded-full bg-white shadow-xs" />
                    </span>
                    <span
                      style={{
                        color: syncToTimeline
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                      }}
                    >
                      {syncToTimeline ? "Shown on spine" : "Notes only"}
                    </span>
                  </button>
                </PropertyRow>

                {/* Book Link */}
                <PropertyRow
                  icon={<BookOpen className="w-3.5 h-3.5" />}
                  label="Book"
                  alignTop
                >
                  <div className="space-y-2 -mx-1 px-1">
                    <select
                      value={
                        linkedBook
                          ? linkedBook.id
                          : isRemovedSnapshot
                            ? "__removed__"
                            : ""
                      }
                      onChange={(e) => {
                        const nextId = e.target.value;
                        if (!nextId) {
                          setBookLink(null);
                          return;
                        }
                        if (nextId === "__removed__") return;
                        const chosen = workspace.books.find(
                          (b) => b.id === nextId,
                        );
                        if (!chosen) return;
                        const unitIndex =
                          chosen.currentLocation?.unitIndex ??
                          (chosen.format === "pdf" ? 1 : 0);
                        const scrollRatio =
                          chosen.currentLocation?.scrollRatio ?? 0;
                        const locationLabel =
                          chosen.currentLocation?.label ||
                          (chosen.format === "pdf"
                            ? `Page ${unitIndex}`
                            : `Section ${unitIndex + 1}`);
                        setBookLink({
                          bookId: chosen.id,
                          bookTitle: chosen.title,
                          bookAuthor: chosen.author,
                          bookFormat: chosen.format,
                          unitIndex,
                          scrollRatio,
                          locationLabel,
                          quote: bookLink?.quote,
                          bookRemoved: false,
                        });
                      }}
                      className="w-full bg-transparent rounded-md px-2 py-1 -mx-1 text-xs font-medium outline-none cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)]"
                      style={{
                        color: bookLink
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                      }}
                    >
                      <option
                        value=""
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          color: "var(--text-primary)",
                        }}
                      >
                        None (unlinked)
                      </option>
                      {isRemovedSnapshot && bookLink && (
                        <option
                          value="__removed__"
                          disabled
                          style={{
                            backgroundColor: "var(--bg-elevated)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {bookLink.bookTitle} (Removed)
                        </option>
                      )}
                      {workspace.books.map((b) => (
                        <option
                          key={b.id}
                          value={b.id}
                          style={{
                            backgroundColor: "var(--bg-elevated)",
                            color: "var(--text-primary)",
                          }}
                        >
                          {b.title}
                        </option>
                      ))}
                    </select>

                    {bookLink && linkedBook && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <label
                            className="text-[11px] shrink-0"
                            style={{ color: "var(--text-muted)" }}
                            htmlFor={`tab-book-unit-${note.id}`}
                          >
                            {linkedBook.format === "pdf" ? "Pg" : "Sec"}
                          </label>
                          <input
                            id={`tab-book-unit-${note.id}`}
                            type="number"
                            min={1}
                            max={linkedBook.totalUnits || undefined}
                            value={
                              linkedBook.format === "pdf"
                                ? Math.max(1, bookLink.unitIndex)
                                : bookLink.unitIndex + 1
                            }
                            onChange={(e) => {
                              const parsed = parseInt(e.target.value, 10);
                              if (Number.isNaN(parsed)) return;
                              const isPdf = linkedBook.format === "pdf";
                              const nextUnit = isPdf
                                ? Math.max(
                                    1,
                                    linkedBook.totalUnits > 0
                                      ? Math.min(linkedBook.totalUnits, parsed)
                                      : parsed,
                                  )
                                : Math.max(
                                    0,
                                    linkedBook.totalUnits > 0
                                      ? Math.min(
                                          linkedBook.totalUnits - 1,
                                          parsed - 1,
                                        )
                                      : parsed - 1,
                                  );
                              const defaultLabel = isPdf
                                ? `Page ${nextUnit}`
                                : `Section ${nextUnit + 1}`;
                              const shouldAutoUpdateLabel =
                                !bookLink.locationLabel ||
                                /^(Page|Section)\s+\d+$/i.test(
                                  bookLink.locationLabel.trim(),
                                );
                              setBookLink({
                                ...bookLink,
                                unitIndex: nextUnit,
                                scrollRatio: 0,
                                locationLabel: shouldAutoUpdateLabel
                                  ? defaultLabel
                                  : bookLink.locationLabel,
                              });
                            }}
                            className="w-14 h-7 px-1.5 rounded-md border bg-transparent text-xs font-mono tabular-nums outline-none focus:border-[var(--accent)]"
                            style={{
                              borderColor: "var(--border-subtle)",
                              color: "var(--text-primary)",
                            }}
                          />
                          <input
                            type="text"
                            value={bookLink.locationLabel}
                            onChange={(e) =>
                              setBookLink({
                                ...bookLink,
                                locationLabel: e.target.value,
                              })
                            }
                            placeholder="Location label"
                            className="flex-1 min-w-0 h-7 px-2 rounded-md border bg-transparent text-xs outline-none focus:border-[var(--accent)]"
                            style={{
                              borderColor: "var(--border-subtle)",
                              color: "var(--text-primary)",
                            }}
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          {onJumpToBookLocation && (
                            <button
                              type="button"
                              onClick={() => {
                                if (debounceTimerRef.current) {
                                  window.clearTimeout(debounceTimerRef.current);
                                }
                                flushSave();
                                onJumpToBookLocation(bookLink);
                              }}
                              className="inline-flex items-center gap-1 text-xs font-medium hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                              style={{ color: "var(--accent)" }}
                            >
                              <span>Jump to Page</span>
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                          )}
                          {linkedBook.currentLocation && (
                            <button
                              type="button"
                              onClick={() => {
                                const loc = linkedBook.currentLocation!;
                                setBookLink({
                                  ...bookLink,
                                  unitIndex: loc.unitIndex,
                                  scrollRatio: loc.scrollRatio ?? 0,
                                  locationLabel:
                                    loc.label ||
                                    (linkedBook.format === "pdf"
                                      ? `Page ${loc.unitIndex}`
                                      : `Section ${loc.unitIndex + 1}`),
                                });
                              }}
                              className="text-[11px] font-medium hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              Use current
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setBookLink(null)}
                            className="text-[11px] font-medium hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Unlink
                          </button>
                        </div>
                      </div>
                    )}

                    {bookLink && !linkedBook && (
                      <div className="space-y-1">
                        <p
                          className="text-[11px] leading-snug"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {bookLink.bookTitle} · {bookLink.locationLabel} —
                          Removed from library
                        </p>
                        <button
                          type="button"
                          onClick={() => setBookLink(null)}
                          className="text-[11px] font-medium hover:underline cursor-pointer"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Unlink
                        </button>
                      </div>
                    )}

                    {bookLink?.quote && (
                      <blockquote
                        className="border-l-2 pl-2 text-[11px] italic line-clamp-3"
                        style={{
                          borderColor: "var(--accent)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        “{bookLink.quote}”
                      </blockquote>
                    )}
                  </div>
                </PropertyRow>

                {/* Tags */}
                <PropertyRow
                  icon={<Hash className="w-3.5 h-3.5" />}
                  label="Tags"
                  alignTop
                >
                  <div className="flex flex-wrap items-center gap-1 -mx-1 px-1 py-0.5">
                    {tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setTags((prev) => prev.filter((t) => t !== tag))
                        }
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-mono transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        style={{
                          backgroundColor: "var(--accent-soft)",
                          color: "var(--accent)",
                        }}
                        title={`Remove #${tag}`}
                      >
                        <span>#{tag}</span>
                        <X className="w-3 h-3 opacity-65" />
                      </button>
                    ))}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAddTag(tagInput);
                      }}
                      className="inline-flex items-center"
                    >
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onBlur={() => {
                          if (tagInput.trim()) handleAddTag(tagInput);
                        }}
                        placeholder="+ Add tag"
                        className="w-24 bg-transparent rounded-md px-1.5 py-0.5 text-xs font-mono outline-none transition-colors hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)] placeholder:opacity-55"
                        style={{ color: "var(--text-primary)" }}
                      />
                    </form>
                  </div>
                </PropertyRow>

                {/* Linked Lists */}
                {activeLists.length > 0 && (
                  <PropertyRow
                    icon={<Link2 className="w-3.5 h-3.5" />}
                    label="Lists"
                    alignTop
                  >
                    <div className="flex flex-wrap items-center gap-1 -mx-1 px-1 py-0.5">
                      {activeLists.map((l) => {
                        const linked = listIds.includes(l.id);
                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() =>
                              setListIds((prev) =>
                                linked
                                  ? prev.filter((id) => id !== l.id)
                                  : [...prev, l.id],
                              )
                            }
                            className="px-2 py-0.5 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                            style={{
                              backgroundColor: linked
                                ? "var(--accent-soft)"
                                : "transparent",
                              color: linked
                                ? "var(--accent)"
                                : "var(--text-muted)",
                            }}
                          >
                            <span>{l.title}</span>
                            {linked && <Check className="w-3 h-3" />}
                          </button>
                        );
                      })}
                    </div>
                  </PropertyRow>
                )}

                {/* Linked List Items */}
                <PropertyRow
                  icon={<ListChecks className="w-3.5 h-3.5" />}
                  label="List Items"
                  alignTop
                >
                  <ListItemLinksPicker
                    links={listItemLinks}
                    onChangeLinks={setListItemLinks}
                    onJumpToListItem={onJumpToListItem}
                    onBeforeJump={() => {
                      if (debounceTimerRef.current) {
                        window.clearTimeout(debounceTimerRef.current);
                      }
                      flushSave();
                    }}
                  />
                </PropertyRow>
              </div>
            )}
          </section>

          {/* Borderless Tiptap Editor Canvas */}
          <div className="pt-1">
            <TiptapEditor
              docId={note.id}
              content={content}
              onChange={setContent}
              variant="borderless"
              placeholder="Write details, type [[ to link notes, or / for blocks..."
              minHeight={360}
              onEditorReady={setEditorInstance}
              allNotes={allActiveNotes}
              onOpenNote={handleNavigateToNote}
              onCreateLinkedNote={(linkTitle) =>
                addNotePage({
                  title: linkTitle,
                  notebookId,
                })
              }
            />
          </div>

          {/* Collapsible Sub-Pages Section */}
          {!note.archived && (
            <section
              className="pt-3 border-t space-y-2"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSubPagesCollapsed((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold hover:opacity-85 cursor-pointer"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {subPagesCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  <span>Sub-pages</span>
                  <span
                    className="font-mono tabular-nums text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {childSubPages.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleCreateSubPage}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{ color: "var(--accent)" }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add sub-page</span>
                </button>
              </div>

              {!subPagesCollapsed &&
                (childSubPages.length > 0 ? (
                  <div className="space-y-1">
                    {childSubPages.map((child) => {
                      const grandChildrenCount = allActiveNotes.filter(
                        (n) => n.parentId === child.id,
                      ).length;
                      return (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => handleNavigateToNote(child.id)}
                          className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            borderColor: "var(--border-subtle)",
                          }}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <FileText
                              className="w-3.5 h-3.5 shrink-0"
                              style={{ color: "var(--accent)" }}
                            />
                            <span
                              className="text-xs font-medium truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {child.title || "Untitled Note"}
                            </span>
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            {grandChildrenCount > 0 && (
                              <span
                                className="text-[11px] font-mono tabular-nums"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {grandChildrenCount} sub
                              </span>
                            )}
                            <ChevronRight
                              className="w-3.5 h-3.5"
                              style={{ color: "var(--text-muted)" }}
                            />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p
                    className="text-xs py-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    No sub-pages yet. Nest related pages directly inside this
                    note.
                  </p>
                ))}
            </section>
          )}
        </div>
      </div>

      {/* Mobile Thumb-Zone Bottom Formatting Toolbar */}
      <TiptapThumbToolbar
        editor={editorInstance}
        onDone={() => {
          editorInstance?.commands.blur();
          flushSave();
        }}
      />
    </div>
  );
};
