import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "@tiptap/react";
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  ExternalLink,
  FolderKanban,
  Hash,
  Link2,
  ListChecks,
  Loader2,
  Maximize2,
  Play,
  RefreshCw,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useWorkspace } from "../../context/WorkspaceContext";
import type {
  BookNoteLink,
  ListCollection,
  ListCollectionType,
  ListItem,
  ListItemStatus,
} from "../../types";
import { addDaysToKey, getTodayKey } from "../../utils/date";
import {
  getListItemBookLink,
  normalizeExternalUrl,
  openExternalUrlSafely,
  setListItemBookLink,
} from "../../utils/listBookLinks";
import { countLinkedNotesForListItems } from "../../utils/listItemLinks";
import {
  fetchYouTubeCourseMetadata,
  parseYouTubeCourseUrl,
} from "../../utils/youtube";
import { removeCoursePlaybackProgress } from "../../utils/coursePlaybackProgress";
import { TiptapEditor } from "../TiptapEditor";
import { DeleteListItemsConfirmModal } from "./DeleteListItemsConfirmModal";
import { ListItemLinkedNotesSection } from "./ListItemLinkedNotesSection";
import { BookLinkPicker, buildBookNoteLink } from "../library/BookLinkPicker";
import { flattenListTree, formatIndentedListOptionLabel } from "../../lib/listTree";

const STATUS_OPTIONS: { id: ListItemStatus; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "processing", label: "In Progress" },
  { id: "done", label: "Completed" },
  { id: "maybe-later", label: "Maybe Later" },
  { id: "dropped", label: "Dropped" },
];

const ITEM_META: Record<
  ListCollectionType,
  { subtitleLabel: string; subtitlePlaceholder: string; dueLabel: string }
> = {
  books: {
    subtitleLabel: "Author",
    subtitlePlaceholder: "e.g. Martin Kleppmann",
    dueLabel: "Finish by",
  },
  projects: {
    subtitleLabel: "Scope",
    subtitlePlaceholder: "e.g. Mobile + Desktop rollout",
    dueLabel: "Deadline",
  },
  courses: {
    subtitleLabel: "Provider",
    subtitlePlaceholder: "e.g. MIT OCW / Frontend Masters",
    dueLabel: "Complete by",
  },
  custom: {
    subtitleLabel: "Subtitle",
    subtitlePlaceholder: "Short context or subtitle...",
    dueLabel: "Due date",
  },
};

const InspectorRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  alignTop?: boolean;
}> = ({ icon, label, children, alignTop = false }) => (
  <div
    className={`flex ${
      alignTop ? "items-start" : "items-center"
    } gap-2 py-0.5 min-h-[28px] text-xs`}
  >
    <div
      className={`w-[90px] shrink-0 flex items-center gap-1.5 select-none ${
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

interface ListItemInspectorProps {
  item: ListItem;
  lists: ListCollection[];
  sameListTags: string[];
  onClose: () => void;
  onOpenModal: (itemId: string) => void;
  onJumpToBookLocation?: (bookLink: BookNoteLink) => void;
  onJumpToNote?: (noteId: string) => void;
  onPlayYouTubeItem?: (itemId: string) => void;
}

function buildSnapshot(src: {
  title: string;
  subtitle: string;
  status: ListItemStatus;
  listId: string;
  tags: string[];
  content: string;
  url: string;
  dueDate: string;
}): string {
  return JSON.stringify(src);
}

export const ListItemInspector: React.FC<ListItemInspectorProps> = ({
  item,
  lists,
  sameListTags,
  onClose,
  onOpenModal,
  onJumpToBookLocation,
  onJumpToNote,
  onPlayYouTubeItem,
}) => {
  const { workspace, updateListItem, deleteListItem, pushToast } =
    useWorkspace();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [title, setTitle] = useState(() => item.title ?? "");
  const [subtitle, setSubtitle] = useState(() => item.subtitle ?? "");
  const [status, setStatus] = useState<ListItemStatus>(
    () => item.status ?? "inbox",
  );
  const [listId, setListId] = useState(() => item.listId);
  const [tags, setTags] = useState<string[]>(() => item.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [content, setContent] = useState(() => item.content ?? "");
  const [url, setUrl] = useState(() => item.url ?? "");
  const [dueDate, setDueDate] = useState(() =>
    item.scheduledAt ? item.scheduledAt.slice(0, 10) : "",
  );
  const [bookLink, setBookLink] = useState<BookNoteLink | null>(() =>
    getListItemBookLink(item.id),
  );
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [fetchingYt, setFetchingYt] = useState(false);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);
  const lastAutoFetchedUrlRef = useRef<string>(item.url ?? "");

  const lastSavedSnapRef = useRef<string>(
    buildSnapshot({
      title: item.title ?? "",
      subtitle: item.subtitle ?? "",
      status: item.status ?? "inbox",
      listId: item.listId,
      tags: item.tags ?? [],
      content: item.content ?? "",
      url: item.url ?? "",
      dueDate: item.scheduledAt ? item.scheduledAt.slice(0, 10) : "",
    }),
  );

  const latestDraftRef = useRef({
    itemId: item.id,
    title,
    subtitle,
    status,
    listId,
    tags,
    content,
    url,
    dueDate,
  });

  latestDraftRef.current = {
    itemId: item.id,
    title,
    subtitle,
    status,
    listId,
    tags,
    content,
    url,
    dueDate,
  };

  useEffect(() => {
    editorRef.current = editorInstance;
  }, [editorInstance]);

  // Auto-resize title textarea
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title, item.id]);

  // Sync external mutations (inline edit on card, drag status change, bulk actions, modal edit)
  useEffect(() => {
    const incomingSnap = buildSnapshot({
      title: item.title ?? "",
      subtitle: item.subtitle ?? "",
      status: item.status ?? "inbox",
      listId: item.listId,
      tags: item.tags ?? [],
      content: item.content ?? "",
      url: item.url ?? "",
      dueDate: item.scheduledAt ? item.scheduledAt.slice(0, 10) : "",
    });
    if (incomingSnap === lastSavedSnapRef.current) return;

    const currentLocalSnap = buildSnapshot({
      title: latestDraftRef.current.title,
      subtitle: latestDraftRef.current.subtitle,
      status: latestDraftRef.current.status,
      listId: latestDraftRef.current.listId,
      tags: latestDraftRef.current.tags,
      content: latestDraftRef.current.content,
      url: latestDraftRef.current.url,
      dueDate: latestDraftRef.current.dueDate,
    });

    if (currentLocalSnap === lastSavedSnapRef.current) {
      setTitle(item.title ?? "");
      setSubtitle(item.subtitle ?? "");
      setStatus(item.status ?? "inbox");
      setListId(item.listId);
      setTags(item.tags ?? []);
      setContent(item.content ?? "");
      setUrl(item.url ?? "");
      setDueDate(item.scheduledAt ? item.scheduledAt.slice(0, 10) : "");
      lastSavedSnapRef.current = incomingSnap;
    }
  }, [
    item.id,
    item.title,
    item.subtitle,
    item.status,
    item.listId,
    item.tags,
    item.content,
    item.url,
    item.scheduledAt,
  ]);

  const flushSave = useCallback(() => {
    const draft = latestDraftRef.current;
    const ed = editorRef.current;
    const liveHtml = ed && !ed.isDestroyed ? ed.getHTML() : null;
    const effectiveContent =
      liveHtml !== null
        ? liveHtml === "<p></p>"
          ? ""
          : liveHtml
        : draft.content;

    const snap = buildSnapshot({
      title: draft.title,
      subtitle: draft.subtitle,
      status: draft.status,
      listId: draft.listId,
      tags: draft.tags,
      content: effectiveContent,
      url: draft.url,
      dueDate: draft.dueDate,
    });
    if (snap === lastSavedSnapRef.current) {
      setSaveState("saved");
      return;
    }

    const trimmedUrl = draft.url.trim();
    const normalizedUrl = trimmedUrl
      ? normalizeExternalUrl(trimmedUrl) || trimmedUrl
      : undefined;
    const scheduledAt = draft.dueDate
      ? new Date(`${draft.dueDate}T12:00:00`).toISOString()
      : null;

    updateListItem(draft.itemId, {
      title: draft.title.trim() || "Untitled Item",
      subtitle: draft.subtitle.trim(),
      status: draft.status,
      listId: draft.listId,
      tags: draft.tags,
      content: effectiveContent,
      url: normalizedUrl,
      scheduledAt,
    });
    lastSavedSnapRef.current = snap;
    setSaveState("saved");
  }, [updateListItem]);

  // Live 380ms autosave
  useEffect(() => {
    const currentSnap = buildSnapshot({
      title,
      subtitle,
      status,
      listId,
      tags,
      content,
      url,
      dueDate,
    });
    if (currentSnap === lastSavedSnapRef.current) return;

    setSaveState("saving");
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      if (!isComposingRef.current) flushSave();
    }, 380);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [title, subtitle, status, listId, tags, content, url, dueDate, flushSave]);

  // Flush unsaved edits cleanly on item switch / unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      flushSave();
    };
  }, [flushSave]);

  const flattenedLists = useMemo(() => flattenListTree(lists), [lists]);

  const currentListCollection = useMemo(
    () => lists.find((l) => l.id === listId) || null,
    [lists, listId],
  );
  const itemMeta = ITEM_META[currentListCollection?.listType || "custom"];
  const todayKey = getTodayKey();
  const linkedBook = useMemo(
    () =>
      bookLink?.bookId
        ? workspace.books.find((b) => b.id === bookLink.bookId) || null
        : null,
    [bookLink?.bookId, workspace.books],
  );

  const handleAddTag = (raw: string) => {
    const clean = raw.trim().replace(/^#/, "").toLowerCase();
    if (!clean || tags.includes(clean)) {
      setTagInput("");
      return;
    }
    setTags((prev) => [...prev, clean]);
    setTagInput("");
  };

  const validOpenUrl = normalizeExternalUrl(url);
  const ytCourseInfo = useMemo(() => parseYouTubeCourseUrl(url), [url]);

  const handleFetchYouTubeInfo = useCallback(
    async (forceOverwrite = false) => {
      if (!ytCourseInfo) return;
      setFetchingYt(true);
      try {
        const meta = await fetchYouTubeCourseMetadata(url);
        if (!meta || !meta.fetchedOnline) {
          if (forceOverwrite) {
            pushToast("Couldn't fetch YouTube info right now — URL kept", "neutral");
          }
          return;
        }
        const isBlankTitle =
          !latestDraftRef.current.title.trim() ||
          latestDraftRef.current.title.trim() === "Untitled Item" ||
          latestDraftRef.current.title.trim() === url.trim();
        const isBlankSubtitle = !latestDraftRef.current.subtitle.trim();

        if ((forceOverwrite || isBlankTitle) && meta.title) {
          setTitle(meta.title);
        }
        if ((forceOverwrite || isBlankSubtitle) && meta.channel) {
          setSubtitle(meta.channel);
        }
        if (forceOverwrite) {
          pushToast("Fetched YouTube course details", "success");
        }
      } finally {
        setFetchingYt(false);
      }
    },
    [ytCourseInfo, url, pushToast],
  );

  // Auto-fill blank title or Provider when pasting a YouTube URL
  useEffect(() => {
    const normalized = ytCourseInfo?.normalizedUrl;
    if (!normalized || normalized === lastAutoFetchedUrlRef.current) return;
    lastAutoFetchedUrlRef.current = normalized;
    const needsTitle =
      !title.trim() ||
      title.trim() === "Untitled Item" ||
      title.trim() === url.trim();
    const needsSubtitle = !subtitle.trim();
    if (needsTitle || needsSubtitle) {
      void handleFetchYouTubeInfo(false);
    }
  }, [ytCourseInfo?.normalizedUrl, title, subtitle, url, handleFetchYouTubeInfo]);

  const linkedNotesCounts = useMemo(
    () => countLinkedNotesForListItems(workspace.entries, [item.id]),
    [workspace.entries, item.id],
  );

  return (
    <div
      className="flex-1 min-h-0 flex flex-col overflow-hidden"
      onCompositionStart={() => {
        isComposingRef.current = true;
      }}
      onCompositionEnd={() => {
        isComposingRef.current = false;
      }}
    >
      {/* Inspector Action Bar */}
      <div
        className="px-4 py-2 border-b flex items-center justify-between gap-2 shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <span
          className="text-[11px] font-mono tabular-nums"
          style={{ color: "var(--text-muted)" }}
        >
          {saveState === "saving" ? "Saving..." : "Autosaved"}
        </span>

        <div className="flex items-center gap-1">
          {ytCourseInfo && onPlayYouTubeItem && (
            <button
              type="button"
              onClick={() => {
                flushSave();
                onPlayYouTubeItem(item.id);
              }}
              title="Play course video"
              className="h-7 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-opacity hover:opacity-90 cursor-pointer"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              <Play className="w-3 h-3" />
              <span>Play</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              flushSave();
              onOpenModal(item.id);
            }}
            title="Expand in modal"
            aria-label="Expand in modal"
            className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (linkedNotesCounts.totalAffectedNotes > 0) {
                setDeleteConfirmOpen(true);
                return;
              }
              deleteListItem(item.id);
              pushToast("List item deleted");
              onClose();
            }}
            title="Delete item"
            aria-label="Delete item"
            className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--danger)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              flushSave();
              onClose();
            }}
            title="Close inspector"
            aria-label="Close inspector"
            className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-none px-4 py-4 space-y-4">
        {/* Title */}
        <textarea
          ref={titleRef}
          rows={1}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              editorInstance?.commands.focus("start");
            }
          }}
          placeholder="Untitled Item"
          className="w-full bg-transparent font-display text-lg font-bold tracking-tight leading-snug resize-none outline-none overflow-hidden placeholder:opacity-40"
          style={{ color: "var(--text-primary)" }}
        />

        {/* Properties */}
        <div
          className="border-y py-2 space-y-0.5"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <InspectorRow
            icon={<Type className="w-3.5 h-3.5" />}
            label={itemMeta.subtitleLabel}
          >
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder={itemMeta.subtitlePlaceholder}
              className="w-full bg-transparent rounded-md px-2 py-1 -mx-1 text-xs outline-none transition-colors hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)] placeholder:opacity-50"
              style={{ color: "var(--text-primary)" }}
            />
          </InspectorRow>

          <InspectorRow
            icon={<ListChecks className="w-3.5 h-3.5" />}
            label="Status"
          >
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ListItemStatus)}
              className="w-full bg-transparent rounded-md px-2 py-1 -mx-1 text-xs font-medium outline-none cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)]"
              style={{ color: "var(--text-primary)" }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option
                  key={opt.id}
                  value={opt.id}
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    color: "var(--text-primary)",
                  }}
                >
                  {opt.label}
                </option>
              ))}
            </select>
          </InspectorRow>

          <InspectorRow
            icon={<FolderKanban className="w-3.5 h-3.5" />}
            label="List"
          >
            <select
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              className="w-full bg-transparent rounded-md px-2 py-1 -mx-1 text-xs font-medium outline-none cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)]"
              style={{ color: "var(--text-primary)" }}
            >
              {flattenedLists.map((node) => (
                <option
                  key={node.list.id}
                  value={node.list.id}
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    color: "var(--text-primary)",
                  }}
                >
                  {formatIndentedListOptionLabel(node)}
                </option>
              ))}
            </select>
          </InspectorRow>

          <InspectorRow
            icon={<Calendar className="w-3.5 h-3.5" />}
            label={itemMeta.dueLabel}
            alignTop
          >
            <div className="space-y-1 -mx-1 px-1">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-transparent rounded-md px-1.5 py-1 text-xs font-mono outline-none transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{
                  color: dueDate ? "var(--text-primary)" : "var(--text-muted)",
                }}
              />
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDueDate(addDaysToKey(todayKey, 1))}
                  className="px-1.5 py-0.5 rounded text-[11px] transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() => setDueDate(addDaysToKey(todayKey, 7))}
                  className="px-1.5 py-0.5 rounded text-[11px] transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Next wk
                </button>
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => setDueDate("")}
                    className="px-1.5 py-0.5 rounded text-[11px] cursor-pointer"
                    style={{ color: "var(--danger)" }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </InspectorRow>

          <InspectorRow icon={<Link2 className="w-3.5 h-3.5" />} label="URL">
            <div className="flex items-center gap-1 -mx-1">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 min-w-0 bg-transparent rounded-md px-2 py-1 text-xs outline-none transition-colors hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)] placeholder:opacity-50"
                style={{ color: "var(--text-primary)" }}
              />
              {ytCourseInfo && (
                <button
                  type="button"
                  disabled={fetchingYt}
                  onClick={() => void handleFetchYouTubeInfo(true)}
                  title="Fetch YouTube title and channel"
                  className="h-6 px-1.5 rounded-md border text-[11px] font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-50 shrink-0 cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {fetchingYt ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  <span>Fetch</span>
                </button>
              )}
              {validOpenUrl && (
                <button
                  type="button"
                  onClick={() => openExternalUrlSafely(url)}
                  title="Open URL in new tab"
                  aria-label="Open URL in new tab"
                  className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] shrink-0 cursor-pointer"
                  style={{ color: "var(--accent)" }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </InspectorRow>

          {currentListCollection?.listType === "books" && (
            <InspectorRow
              icon={<BookOpen className="w-3.5 h-3.5" />}
              label="Library"
              alignTop
            >
              <div className="space-y-1.5 -mx-1 px-1">
                <BookLinkPicker
                  books={workspace.books}
                  selectedBook={linkedBook}
                  emptyLabel="None (this device only)"
                  onSelectBook={(chosen) => {
                    if (!chosen) {
                      setBookLink(null);
                      setListItemBookLink(item.id, null);
                      return;
                    }
                    const nextLink: BookNoteLink = buildBookNoteLink(chosen);
                    setBookLink(nextLink);
                    setListItemBookLink(item.id, nextLink);
                  }}
                />

                {bookLink && linkedBook && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {onJumpToBookLocation && (
                      <button
                        type="button"
                        onClick={() => {
                          flushSave();
                          onJumpToBookLocation(bookLink);
                        }}
                        className="inline-flex items-center gap-1 font-medium hover:underline cursor-pointer"
                        style={{ color: "var(--accent)" }}
                      >
                        <span>Open in Library</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setBookLink(null);
                        setListItemBookLink(item.id, null);
                      }}
                      className="hover:underline cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Unlink
                    </button>
                  </div>
                )}
              </div>
            </InspectorRow>
          )}

          <InspectorRow
            icon={<Hash className="w-3.5 h-3.5" />}
            label="Tags"
            alignTop
          >
            <div className="space-y-1 -mx-1 px-1 py-0.5">
              <div className="flex flex-wrap items-center gap-1">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setTags((prev) => prev.filter((t) => t !== tag))
                    }
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-mono cursor-pointer"
                    style={{
                      backgroundColor: "var(--accent-soft)",
                      color: "var(--accent)",
                    }}
                  >
                    <span>#{tag}</span>
                    <X className="w-2.5 h-2.5 opacity-65" />
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
                    className="w-20 bg-transparent rounded-md px-1.5 py-0.5 text-[11px] font-mono outline-none transition-colors hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)] placeholder:opacity-55"
                    style={{ color: "var(--text-primary)" }}
                  />
                </form>
              </div>
              {sameListTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {sameListTags
                    .filter((t) => !tags.includes(t))
                    .slice(0, 5)
                    .map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleAddTag(t)}
                        className="text-[11px] font-mono hover:underline cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                      >
                        +#{t}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </InspectorRow>
        </div>

        {/* Borderless Tiptap Rich Notes Editor */}
        <div>
          <TiptapEditor
            docId={item.id}
            content={content}
            onChange={setContent}
            variant="borderless"
            placeholder="Write notes, links, or type / for blocks..."
            minHeight={220}
            onEditorReady={setEditorInstance}
          />
        </div>

        {/* Linked Notes Section */}
        <ListItemLinkedNotesSection
          item={item}
          list={currentListCollection}
          onBeforeJump={flushSave}
          onJumpToNote={onJumpToNote}
        />
      </div>

      <DeleteListItemsConfirmModal
        open={deleteConfirmOpen}
        itemCount={1}
        itemTitle={title.trim() || item.title}
        exclusivelyLinkedNotesCount={linkedNotesCounts.exclusivelyLinkedNotes}
        sharedNotesCount={linkedNotesCounts.sharedNotes}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={(behavior) => {
          setDeleteConfirmOpen(false);
          deleteListItem(item.id, behavior);
          removeCoursePlaybackProgress([item.id]);
          pushToast(
            behavior === "delete"
              ? "List item & linked notes deleted"
              : "List item deleted (notes kept)",
          );
          onClose();
        }}
      />
    </div>
  );
};
