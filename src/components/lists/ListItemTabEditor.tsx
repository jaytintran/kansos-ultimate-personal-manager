import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "@tiptap/react";
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  ChevronRight,
  Clock,
  Columns2,
  ExternalLink,
  FolderKanban,
  Hash,
  Link2,
  ListChecks,
  Loader2,
  Maximize2,
  PanelLeftOpen,
  PanelRight,
  PanelTop,
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
import {
  addDaysToKey,
  countWordsFromHtml,
  getTodayKey,
} from "../../utils/date";
import {
  getListItemBookLink,
  normalizeExternalUrl,
  openExternalUrlSafely,
  setListItemBookLink,
} from "../../utils/listBookLinks";
import { countLinkedNotesForListItems } from "../../utils/listItemLinks";
import {
  fetchYouTubeCourseMetadata,
  formatMediaTimestamp,
  parseYouTubeCourseUrl,
} from "../../utils/youtube";
import { removeCoursePlaybackProgress } from "../../utils/coursePlaybackProgress";
import { ListIcon as CollectionIcon } from "../IconLibrary";
import { TiptapEditor, TiptapThumbToolbar } from "../TiptapEditor";
import {
  CourseYouTubePlayer,
  type CourseYouTubePlayerHandle,
} from "./CourseYouTubePlayer";
import { DeleteListItemsConfirmModal } from "./DeleteListItemsConfirmModal";
import { ListItemLinkedNotesSection } from "./ListItemLinkedNotesSection";
import { BookLinkPicker, buildBookNoteLink } from "../library/BookLinkPicker";
import {
  buildListTreeIndex,
  flattenListTree,
  formatIndentedListOptionLabel,
  getListAncestors,
} from "../../lib/listTree";

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

const PropertyRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  alignTop?: boolean;
}> = ({ icon, label, children, alignTop = false }) => (
  <div
    className={`flex ${
      alignTop ? "items-start" : "items-center"
    } gap-2.5 py-1 min-h-[32px] text-xs`}
  >
    <div
      className={`w-[104px] sm:w-[112px] shrink-0 flex items-center gap-2 select-none ${
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

type StudyLayoutMode = "top" | "split";
const STUDY_LAYOUT_KEY = "kanso_course_study_layout_v1";

function loadStudyLayoutMode(): StudyLayoutMode {
  try {
    const raw = localStorage.getItem(STUDY_LAYOUT_KEY);
    if (raw === "top" || raw === "split") return raw;
  } catch {
    // Ignore storage errors
  }
  return "split";
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

interface ListItemTabEditorProps {
  item: ListItem;
  lists: ListCollection[];
  sidebarCollapsedDesktop: boolean;
  linkedPaneOpenDesktop: boolean;
  onExpandDesktopSidebar: () => void;
  onOpenMobileSidebar: () => void;
  onToggleDesktopLinkedPane: () => void;
  onSelectParentListHome: (listId: string) => void;
  onOpenInModal: (itemId: string) => void;
  onJumpToBookLocation?: (bookLink: BookNoteLink) => void;
  onJumpToNote?: (noteId: string) => void;
  onItemDeleted: (itemId: string) => void;
}

export const ListItemTabEditor: React.FC<ListItemTabEditorProps> = ({
  item,
  lists,
  sidebarCollapsedDesktop,
  linkedPaneOpenDesktop,
  onExpandDesktopSidebar,
  onOpenMobileSidebar,
  onToggleDesktopLinkedPane,
  onSelectParentListHome,
  onOpenInModal,
  onJumpToBookLocation,
  onJumpToNote,
  onItemDeleted,
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
  const [studyLayout, setStudyLayout] = useState<StudyLayoutMode>(
    loadStudyLayoutMode,
  );
  const [studyPlayerVisible, setStudyPlayerVisible] = useState(true);
  const [mobilePlayerCollapsed, setMobilePlayerCollapsed] = useState(false);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const playerRef = useRef<CourseYouTubePlayerHandle | null>(null);
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

  // Focus title automatically when opening a newly created untitled item
  useEffect(() => {
    if (item.title === "Untitled Item" && !item.content) {
      const timer = window.setTimeout(() => {
        if (titleRef.current) {
          titleRef.current.focus();
          titleRef.current.select();
        }
      }, 30);
      return () => window.clearTimeout(timer);
    }
  }, [item.id, item.title, item.content]);

  // Sync external mutations (card quick edits, status changes, modal edits, bulk actions)
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

  const listTreeIndex = useMemo(() => buildListTreeIndex(lists), [lists]);
  const flattenedLists = useMemo(() => flattenListTree(lists), [lists]);

  const currentListCollection = useMemo(
    () => lists.find((l) => l.id === listId) || null,
    [lists, listId],
  );
  const ancestorChain = useMemo(
    () =>
      currentListCollection
        ? getListAncestors(currentListCollection.id, listTreeIndex.byId)
        : [],
    [currentListCollection, listTreeIndex.byId],
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

  const sameListTags = useMemo(() => {
    const set = new Set<string>();
    workspace.listItems.forEach((it) => {
      if (it.listId === listId) {
        (it.tags || []).forEach((t) => set.add(t));
      }
    });
    return Array.from(set).sort();
  }, [workspace.listItems, listId]);

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

  const handleSetStudyLayout = useCallback((next: StudyLayoutMode) => {
    setStudyLayout(next);
    try {
      localStorage.setItem(STUDY_LAYOUT_KEY, next);
    } catch {
      // Ignore storage errors
    }
  }, []);

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

  // Auto-fill blank title or Provider when pasting/editing a YouTube URL
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

  const handleInsertTimestamp = useCallback(
    (explicitSeconds?: number) => {
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed) return;
      const rawSec =
        typeof explicitSeconds === "number"
          ? explicitSeconds
          : playerRef.current?.getCurrentTime() ?? 0;
      const secs = Math.max(0, Math.floor(rawSec));
      const label = formatMediaTimestamp(secs);
      ed.chain()
        .focus()
        .insertContent([
          {
            type: "text",
            text: label,
            marks: [
              {
                type: "link",
                attrs: {
                  href: `#ts=${secs}`,
                  class: "kanso-web-link font-mono tabular-nums",
                },
              },
            ],
          },
          { type: "text", text: " " },
        ])
        .unsetMark("link")
        .run();
    },
    [],
  );

  const handleSeekFromNotes = useCallback((seconds: number) => {
    setStudyPlayerVisible(true);
    setMobilePlayerCollapsed(false);
    window.setTimeout(() => {
      playerRef.current?.seekTo(seconds, true);
    }, 30);
  }, []);

  const wordCount = useMemo(() => countWordsFromHtml(content), [content]);
  const linkedNotesCounts = useMemo(
    () => countLinkedNotesForListItems(workspace.entries, [item.id]),
    [workspace.entries, item.id],
  );

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
      {/* Clean Action & Breadcrumb Header */}
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
              title="Show lists sidebar"
              aria-label="Show lists sidebar"
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
            onClick={onOpenMobileSidebar}
            title="Lists & smart views"
            aria-label="Open lists sidebar"
            className="lg:hidden h-7 w-7 flex items-center justify-center rounded-lg border shrink-0 cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <PanelLeftOpen className="w-3.5 h-3.5" />
          </button>

          <nav
            aria-label="List item breadcrumb"
            className="flex items-center gap-1.5 text-xs min-w-0 overflow-hidden"
            style={{ color: "var(--text-muted)" }}
          >
            {ancestorChain.map((anc) => (
              <React.Fragment key={anc.id}>
                <button
                  type="button"
                  onClick={() => {
                    flushSave();
                    onSelectParentListHome(anc.id);
                  }}
                  className="inline-flex items-center gap-1.5 max-w-[140px] hover:underline cursor-pointer shrink-0"
                  style={{ color: "var(--text-secondary)" }}
                  title={`Go to ${anc.title}`}
                >
                  <CollectionIcon
                    name={anc.icon}
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: anc.color || "#4f46e5" }}
                  />
                  <span className="truncate">{anc.title}</span>
                </button>
                <ChevronRight className="w-3 h-3 shrink-0 opacity-60" />
              </React.Fragment>
            ))}
            <span
              className="truncate font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {title.trim() || "Untitled Item"}
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

          {ytCourseInfo && (
            <div className="flex items-center gap-1 mr-0.5">
              {studyPlayerVisible && (
                <div
                  className="hidden lg:inline-flex items-center p-0.5 rounded-lg border"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleSetStudyLayout("top")}
                    title="Video stacked above notes"
                    aria-label="Video stacked above notes"
                    className="h-6 w-6 flex items-center justify-center rounded-md cursor-pointer"
                    style={{
                      backgroundColor:
                        studyLayout === "top"
                          ? "var(--accent-soft)"
                          : "transparent",
                      color:
                        studyLayout === "top"
                          ? "var(--accent)"
                          : "var(--text-muted)",
                    }}
                  >
                    <PanelTop className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetStudyLayout("split")}
                    title="Side-by-side video and notes"
                    aria-label="Side-by-side video and notes"
                    className="h-6 w-6 flex items-center justify-center rounded-md cursor-pointer"
                    style={{
                      backgroundColor:
                        studyLayout === "split"
                          ? "var(--accent-soft)"
                          : "transparent",
                      color:
                        studyLayout === "split"
                          ? "var(--accent)"
                          : "var(--text-muted)",
                    }}
                  >
                    <Columns2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setStudyPlayerVisible((v) => !v)}
                className="h-7 px-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                style={{
                  backgroundColor: studyPlayerVisible
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                  borderColor: studyPlayerVisible
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                  color: studyPlayerVisible
                    ? "var(--accent)"
                    : "var(--text-secondary)",
                }}
                title={studyPlayerVisible ? "Hide video player" : "Show video player"}
              >
                <Play className="w-3 h-3" />
                <span className="hidden sm:inline">
                  {studyPlayerVisible ? "Video" : "Show Video"}
                </span>
              </button>
            </div>
          )}

          {currentListCollection && (
            <button
              type="button"
              onClick={onToggleDesktopLinkedPane}
              className="hidden lg:inline-flex h-7 px-2.5 rounded-lg border text-xs font-medium items-center gap-1.5 transition-colors cursor-pointer mr-0.5"
              style={{
                backgroundColor: linkedPaneOpenDesktop
                  ? "var(--accent-soft)"
                  : "var(--bg-surface)",
                borderColor: linkedPaneOpenDesktop
                  ? "var(--accent)"
                  : "var(--border-subtle)",
                color: linkedPaneOpenDesktop
                  ? "var(--accent)"
                  : "var(--text-secondary)",
              }}
              title={
                linkedPaneOpenDesktop
                  ? "Hide linked notes & events"
                  : "Show linked notes & events"
              }
              aria-pressed={linkedPaneOpenDesktop}
            >
              <PanelRight className="w-3.5 h-3.5" />
              <span>Linked</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              flushSave();
              onOpenInModal(item.id);
            }}
            title="Open in Details Modal"
            aria-label="Open in Details Modal"
            className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
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
              onItemDeleted(item.id);
            }}
            title="Delete item"
            aria-label="Delete item"
            className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--danger)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Study Mode Split/Top Container */}
      <div
        className={`flex-1 min-h-0 flex flex-col ${
          ytCourseInfo && studyPlayerVisible && studyLayout === "split"
            ? "lg:flex-row lg:overflow-hidden overflow-y-auto overscroll-none"
            : "overflow-y-auto overscroll-none"
        }`}
      >
        {/* Embedded Course Video Player (Sticky top on mobile, Top or Left Split on desktop) */}
        {ytCourseInfo && studyPlayerVisible && (
          <div
            className={
              studyLayout === "split"
                ? "sticky top-0 z-20 lg:static lg:w-[46%] xl:w-[48%] shrink-0 px-4 pt-3 pb-2 lg:p-6 lg:border-r lg:overflow-y-auto bg-[var(--bg-canvas)]"
                : "sticky top-0 z-20 lg:static shrink-0 px-4 sm:px-6 lg:px-8 pt-3 sm:pt-5 pb-2 bg-[var(--bg-canvas)]"
            }
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <CourseYouTubePlayer
              ref={playerRef}
              item={{
                ...item,
                title: title.trim() || item.title,
                subtitle: subtitle.trim(),
                status,
                url: validOpenUrl || url,
              }}
              mode="study"
              collapsed={mobilePlayerCollapsed}
              onToggleCollapse={() => setMobilePlayerCollapsed((c) => !c)}
              maxHeightClass={
                studyLayout === "split"
                  ? "max-h-[260px] lg:max-h-none"
                  : "max-h-[240px] sm:max-h-[380px]"
              }
              onInsertTimestamp={(secs) => handleInsertTimestamp(secs)}
              onMarkCompleted={() => {
                setStatus("done");
                pushToast("Course marked completed", "success");
              }}
            />
          </div>
        )}

        {/* Properties Header + Rich Editor Canvas */}
        <div
          className={`${
            ytCourseInfo && studyPlayerVisible && studyLayout === "split"
              ? "flex-1 min-w-0 lg:overflow-y-auto lg:overscroll-none px-4 sm:px-6 lg:px-7 py-4 sm:py-6 pb-24 lg:pb-12"
              : "px-4 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 lg:pb-12"
          }`}
        >
          <div className="w-full space-y-5">
          {/* Full-Width Title & Subtitle */}
          <div className="space-y-1.5">
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
              className="w-full bg-transparent font-display text-2xl sm:text-[26px] font-bold tracking-tight leading-snug resize-none outline-none overflow-hidden placeholder:opacity-40"
              style={{ color: "var(--text-primary)" }}
            />

            <div className="flex items-center gap-2">
              <Type
                className="w-3.5 h-3.5 shrink-0 opacity-60"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder={`${itemMeta.subtitleLabel}: ${itemMeta.subtitlePlaceholder}`}
                className="w-full bg-transparent text-sm outline-none placeholder:opacity-45"
                style={{ color: "var(--text-secondary)" }}
              />
            </div>
          </div>

          {/* Full-Width Properties Header Grid */}
          <div
            className="border-y py-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <PropertyRow
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
            </PropertyRow>

            <PropertyRow
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
            </PropertyRow>

            <PropertyRow
              icon={<Calendar className="w-3.5 h-3.5" />}
              label={itemMeta.dueLabel}
            >
              <div className="flex flex-wrap items-center gap-1.5 -mx-1 px-1">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="bg-transparent rounded-md px-1.5 py-1 text-xs font-mono tabular-nums outline-none transition-colors hover:bg-[var(--bg-surface-hover)]"
                  style={{
                    color: dueDate ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                />
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
            </PropertyRow>

            <PropertyRow icon={<Link2 className="w-3.5 h-3.5" />} label="URL">
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
                    className="h-6 px-2 rounded-md border text-[11px] font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-50 shrink-0 cursor-pointer"
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
            </PropertyRow>

            {currentListCollection?.listType === "books" && (
              <PropertyRow
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
              </PropertyRow>
            )}

            <div className="md:col-span-2">
              <PropertyRow
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
                        className="w-24 bg-transparent rounded-md px-1.5 py-0.5 text-[11px] font-mono outline-none transition-colors hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)] placeholder:opacity-55"
                        style={{ color: "var(--text-primary)" }}
                      />
                    </form>
                  </div>
                  {sameListTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {sameListTags
                        .filter((t) => !tags.includes(t))
                        .slice(0, 6)
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
              </PropertyRow>
            </div>
          </div>

          {/* Full-Width Borderless Tiptap Rich Notes Editor */}
          <div className="pt-1 space-y-2">
            {ytCourseInfo && (
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[11px] font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Course Notes
                </span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleInsertTimestamp()}
                  className="h-7 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--accent)",
                  }}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Insert Timestamp</span>
                </button>
              </div>
            )}
            <TiptapEditor
              docId={item.id}
              content={content}
              onChange={setContent}
              variant="borderless"
              placeholder="Write notes, links, or type / for blocks..."
              minHeight={320}
              onEditorReady={setEditorInstance}
              onTimestampLinkClick={ytCourseInfo ? handleSeekFromNotes : undefined}
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
          onItemDeleted(item.id);
        }}
      />
    </div>
  );
};
