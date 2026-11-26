import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Editor } from "@tiptap/react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Flame,
  FolderKanban,
  GitBranch,
  Hash,
  Link2,
  ListChecks,
  MapPin,
  Maximize2,
  Minimize2,
  Palette,
  Pin,
  Plus,
  Repeat,
  Sparkles,
  Tag,
  Trash2,
  Trophy,
  Type,
  Users,
  X,
} from "lucide-react";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  getNoteAncestorChain,
  getNoteDescendantIds,
} from "../lib/noteGraphUtils";
import {
  NoteBranchActionPrompt,
  NoteDeleteBranchModal,
} from "./notes/NoteDeleteBranchModal";
import { flattenListTree, formatIndentedListOptionLabel } from "../lib/listTree";
import {
  BookNoteLink,
  DetailSheetTarget,
  Entry,
  EventAttendance,
  EventCategory,
  Habit,
  HabitFrequencyType,
  ListCollectionType,
  ListItem,
  ListItemNoteLink,
  ListItemStatus,
} from "../types";
import {
  addDaysToKey,
  formatCompactDayHeading,
  formatTime,
  getDayAbbrev,
  getEntryDayKey,
  getRecentDateKeys,
  getTodayKey,
  isHabitScheduledOnDay,
} from "../utils/date";
import {
  DynamicIcon,
  EntryTypeIcon,
  HabitIcon,
  ListIcon,
  NotePageIcon,
  SHARED_ICON_CATALOG,
} from "./IconLibrary";
import { IconPickerPopover } from "./IconPicker";
import { TimestampFieldFocus } from "./TimestampsModal";
import { TiptapEditor, TiptapThumbToolbar } from "./TiptapEditor";
import {
  getListItemBookLink,
  normalizeExternalUrl,
  openExternalUrlSafely,
  setListItemBookLink,
} from "../utils/listBookLinks";
import {
  countLinkedNotesForListItems,
  normalizeListItemNoteLinks,
} from "../utils/listItemLinks";
import { DeleteListItemsConfirmModal } from "./lists/DeleteListItemsConfirmModal";
import { ListItemLinkedNotesSection } from "./lists/ListItemLinkedNotesSection";
import { ListItemLinksPicker } from "./lists/ListItemLinksPicker";
import { BookLinkPicker, buildBookNoteLink } from "./library/BookLinkPicker";

const HABIT_COLOR_PRESETS = [
  "#b45309",
  "#4f46e5",
  "#059669",
  "#0284c7",
  "#e11d48",
  "#9333ea",
  "#d97706",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const LIST_STATUS_OPTIONS: { id: ListItemStatus; label: string }[] = [
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

/* Notion-style borderless property row primitive */
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

interface DetailSheetProps {
  target: DetailSheetTarget | null;
  onClose: () => void;
  onOpenDetail?: (target: DetailSheetTarget) => void;
  onOpenTimestamps: (entryId: string, focus?: TimestampFieldFocus) => void;
  onJumpToBookLocation?: (bookLink: BookNoteLink) => void;
  onJumpToNote?: (noteId: string) => void;
  onJumpToListItem?: (listItemId: string) => void;
}

interface DetailSheetInnerProps extends DetailSheetProps {
  isFullPage: boolean;
  onToggleFullPage: () => void;
}

const DetailSheetInner: React.FC<DetailSheetInnerProps> = ({
  target,
  onClose,
  onOpenDetail,
  onOpenTimestamps,
  onJumpToBookLocation,
  onJumpToNote,
  onJumpToListItem,
  isFullPage,
  onToggleFullPage,
}) => {
  const {
    workspace,
    moveFocusItem,
    createEntry,
    updateEntry,
    deleteEntry,
    deleteNotePage,
    addNotePage,
    toggleEntryCompleted,
    toggleEntryAchievement,
    setEventAttendance,
    addHabit,
    updateHabit,
    deleteHabit,
    toggleHabitCompletion,
    cycleHabitDayStatus,
    addListItem,
    updateListItem,
    deleteListItem,
    pushToast,
  } = useWorkspace();

  const isEntryMode =
    target?.mode === "note" ||
    target?.mode === "event" ||
    target?.mode === "task" ||
    target?.mode === "log";

  const existingEntry = useMemo(
    () =>
      isEntryMode && target?.id
        ? workspace.entries.find((e) => e.id === target.id) || null
        : null,
    [isEntryMode, target?.id, workspace.entries],
  );

  const existingHabit = useMemo(
    () =>
      target?.mode === "habit" && target?.id
        ? workspace.habits.find((h) => h.id === target.id) || null
        : null,
    [target?.mode, target?.id, workspace.habits],
  );

  const existingListItem = useMemo(
    () =>
      target?.mode === "list_item" && target?.id
        ? workspace.listItems.find((i) => i.id === target.id) || null
        : null,
    [target?.mode, target?.id, workspace.listItems],
  );

  const [createdId, setCreatedId] = useState<string | null>(null);
  const activeId = target?.id || createdId;
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [mobilePropsCollapsed, setMobilePropsCollapsed] = useState(false);
  const [isLgViewport, setIsLgViewport] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 1024px)").matches
      : true,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      setIsLgViewport(mq.matches);
      setHabitIconPickerOpen(false);
      setNoteIconPickerOpen(false);
    };
    setIsLgViewport(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const activeLists = useMemo(() => workspace.lists, [workspace.lists]);
  const flattenedLists = useMemo(
    () => flattenListTree(activeLists),
    [activeLists],
  );
  const sessionDraftDocIdRef = useRef(
    `draft-${target?.mode ?? "item"}-${Date.now().toString(36)}`,
  );

  const initialEntrySrc = isEntryMode
    ? existingEntry || (target?.draft as Partial<Entry> | undefined)
    : undefined;
  const initialHabitSrc =
    target?.mode === "habit"
      ? existingHabit || (target?.draft as Partial<Habit> | undefined)
      : undefined;
  const initialListSrc =
    target?.mode === "list_item"
      ? existingListItem || (target?.draft as Partial<ListItem> | undefined)
      : undefined;

  // Shared draft state (initialized synchronously so Render #1 has full title & content)
  const [title, setTitle] = useState(
    () =>
      (isEntryMode
        ? initialEntrySrc?.title
        : target?.mode === "habit"
          ? initialHabitSrc?.title
          : initialListSrc?.title) ?? "",
  );
  const [noteIcon, setNoteIcon] = useState<string>(
    () => (isEntryMode ? initialEntrySrc?.icon : "") ?? "",
  );
  const [noteIconPickerOpen, setNoteIconPickerOpen] = useState(false);
  const [content, setContent] = useState(
    () =>
      (isEntryMode
        ? initialEntrySrc?.content
        : target?.mode === "list_item"
          ? initialListSrc?.content
          : "") ?? "",
  );
  const [tags, setTags] = useState<string[]>(
    () =>
      (isEntryMode
        ? initialEntrySrc?.tags
        : target?.mode === "list_item"
          ? initialListSrc?.tags
          : []) ?? [],
  );
  const [tagInput, setTagInput] = useState("");
  const [pinned, setPinned] = useState(() => Boolean(initialEntrySrc?.pinned));
  const [location, setLocation] = useState(
    () => initialEntrySrc?.location ?? "",
  );
  const [eventCategory, setEventCategory] = useState<EventCategory>(
    () => initialEntrySrc?.eventCategory ?? "personal",
  );
  const [attendance, setAttendance] = useState<EventAttendance>(
    () => initialEntrySrc?.attendance ?? null,
  );
  const [listIds, setListIds] = useState<string[]>(
    () => initialEntrySrc?.listIds ?? [],
  );
  const [syncToTimeline, setSyncToTimeline] = useState(() =>
    Boolean(
      initialEntrySrc?.syncToTimeline ??
        (target?.mode === "note" && !existingEntry
          ? workspace.settings.defaultNoteTimelineSync
          : false),
    ),
  );
  const [notebookId, setNotebookId] = useState<string | null>(
    () => initialEntrySrc?.notebookId ?? null,
  );
  const [parentId, setParentId] = useState<string | null>(
    () => initialEntrySrc?.parentId ?? null,
  );
  const [bookLink, setBookLink] = useState<BookNoteLink | null>(
    () => initialEntrySrc?.bookLink ?? null,
  );
  const [listItemLinks, setListItemLinks] = useState<ListItemNoteLink[]>(() =>
    normalizeListItemNoteLinks(initialEntrySrc?.listItemLinks),
  );
  const [deleteListItemConfirmOpen, setDeleteListItemConfirmOpen] =
    useState(false);
  const [subPagesCollapsed, setSubPagesCollapsed] = useState(false);
  const [branchPrompt, setBranchPrompt] =
    useState<NoteBranchActionPrompt | null>(null);

  // Habit draft state
  const [habitPurpose, setHabitPurpose] = useState(
    () => initialHabitSrc?.purpose ?? "",
  );
  const [habitColor, setHabitColor] = useState(
    () => initialHabitSrc?.color ?? HABIT_COLOR_PRESETS[0],
  );
  const [habitIcon, setHabitIcon] = useState(
    () => initialHabitSrc?.icon ?? "Flame",
  );
  const [habitIconPickerOpen, setHabitIconPickerOpen] = useState(false);
  const [habitFreq, setHabitFreq] = useState<HabitFrequencyType>(
    () => initialHabitSrc?.frequencyType ?? "daily",
  );
  const [habitCustomDays, setHabitCustomDays] = useState<number[]>(
    () => initialHabitSrc?.customDays ?? [1, 3, 5],
  );
  const [habitWeeklyTarget, setHabitWeeklyTarget] = useState(
    () => initialHabitSrc?.weeklyTarget ?? 4,
  );

  // List item draft state
  const [listSubtitle, setListSubtitle] = useState(
    () => initialListSrc?.subtitle ?? "",
  );
  const [listStatus, setListStatus] = useState<ListItemStatus>(
    () => initialListSrc?.status ?? "inbox",
  );
  const [listId, setListId] = useState(
    () => initialListSrc?.listId ?? activeLists[0]?.id ?? "",
  );
  const [listDueDate, setListDueDate] = useState(() =>
    initialListSrc?.scheduledAt ? initialListSrc.scheduledAt.slice(0, 10) : "",
  );
  const [listUrl, setListUrl] = useState(() => initialListSrc?.url ?? "");
  const [listBookLink, setListBookLink] = useState<BookNoteLink | null>(() =>
    target?.mode === "list_item" && target.id
      ? getListItemBookLink(target.id)
      : null,
  );

  const lastSavedSnapRef = useRef<string>("");
  const debounceTimerRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize display title textarea
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title, target?.id, target?.mode]);

  // Hydrate form when target changes
  useEffect(() => {
    setCreatedId(null);
    setTagInput("");
    setMobilePropsCollapsed(false);
    setDeleteListItemConfirmOpen(false);
    if (!target) return;

    if (isEntryMode) {
      const src = existingEntry || (target.draft as Partial<Entry> | undefined);
      const nextTitle = src?.title ?? "";
      const nextNoteIcon = src?.icon ?? "";
      const nextContent = src?.content ?? "";
      const nextTags = src?.tags ?? [];
      const nextPinned = Boolean(src?.pinned);
      const nextLocation = src?.location ?? "";
      const nextCat: EventCategory = src?.eventCategory ?? "personal";
      const nextAtt: EventAttendance = src?.attendance ?? null;
      const nextListIds = src?.listIds ?? [];
      const nextSync = Boolean(
        src?.syncToTimeline ??
          (target.mode === "note" && !existingEntry
            ? workspace.settings.defaultNoteTimelineSync
            : false),
      );
      const nextNotebookId = src?.notebookId ?? null;
      const nextParentId = src?.parentId ?? null;
      const nextBookLink = src?.bookLink ?? null;
      const nextListItemLinks = normalizeListItemNoteLinks(src?.listItemLinks);

      setTitle(nextTitle);
      setNoteIcon(nextNoteIcon);
      setNoteIconPickerOpen(false);
      setContent(nextContent);
      setTags(nextTags);
      setPinned(nextPinned);
      setLocation(nextLocation);
      setEventCategory(nextCat);
      setAttendance(nextAtt);
      setListIds(nextListIds);
      setSyncToTimeline(nextSync);
      setNotebookId(nextNotebookId);
      setParentId(nextParentId);
      setBookLink(nextBookLink);
      setListItemLinks(nextListItemLinks);

      lastSavedSnapRef.current = JSON.stringify({
        title: nextTitle,
        noteIcon: nextNoteIcon,
        content: nextContent,
        tags: nextTags,
        pinned: nextPinned,
        location: nextLocation,
        eventCategory: nextCat,
        attendance: nextAtt,
        listIds: nextListIds,
        syncToTimeline: nextSync,
        notebookId: nextNotebookId,
        parentId: nextParentId,
        bookLink: nextBookLink,
        listItemLinks: nextListItemLinks,
      });
    } else if (target.mode === "habit") {
      const src = existingHabit || (target.draft as Partial<Habit> | undefined);
      const nextTitle = src?.title ?? "";
      const nextPurpose = src?.purpose ?? "";
      const nextColor = src?.color ?? HABIT_COLOR_PRESETS[0];
      const nextIcon = src?.icon ?? "Flame";
      const nextFreq: HabitFrequencyType = src?.frequencyType ?? "daily";
      const nextDays = src?.customDays ?? [1, 3, 5];
      const nextTarget = src?.weeklyTarget ?? 4;

      setTitle(nextTitle);
      setHabitPurpose(nextPurpose);
      setHabitColor(nextColor);
      setHabitIcon(nextIcon);
      setHabitIconPickerOpen(false);
      setHabitFreq(nextFreq);
      setHabitCustomDays(nextDays);
      setHabitWeeklyTarget(nextTarget);

      lastSavedSnapRef.current = JSON.stringify({
        title: nextTitle,
        habitPurpose: nextPurpose,
        habitColor: nextColor,
        habitIcon: nextIcon,
        habitFreq: nextFreq,
        habitCustomDays: nextDays,
        habitWeeklyTarget: nextTarget,
      });
    } else if (target.mode === "list_item") {
      const src =
        existingListItem || (target.draft as Partial<ListItem> | undefined);
      const nextTitle = src?.title ?? "";
      const nextSub = src?.subtitle ?? "";
      const nextStatus: ListItemStatus = src?.status ?? "inbox";
      const nextListId = src?.listId ?? activeLists[0]?.id ?? "";
      const nextTags = src?.tags ?? [];
      const nextContent = src?.content ?? "";
      const nextDue = src?.scheduledAt ? src.scheduledAt.slice(0, 10) : "";
      const nextUrl = src?.url ?? "";
      const nextBookLink = target.id ? getListItemBookLink(target.id) : null;

      setTitle(nextTitle);
      setListSubtitle(nextSub);
      setListStatus(nextStatus);
      setListId(nextListId);
      setTags(nextTags);
      setContent(nextContent);
      setListDueDate(nextDue);
      setListUrl(nextUrl);
      setListBookLink(nextBookLink);

      lastSavedSnapRef.current = JSON.stringify({
        title: nextTitle,
        listSubtitle: nextSub,
        listStatus: nextStatus,
        listId: nextListId,
        tags: nextTags,
        content: nextContent,
        listDueDate: nextDue,
        listUrl: nextUrl,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    target?.mode,
    target?.id,
    (target?.draft as Partial<Entry> | undefined)?.notebookId,
    (target?.draft as Partial<Entry> | undefined)?.parentId,
  ]);

  // Flush save routine with snapshot deduplication
  const flushSave = useCallback(() => {
    if (!target) return;

    const liveHtml =
      editorInstance && !editorInstance.isDestroyed
        ? editorInstance.getHTML()
        : null;
    const effectiveContent =
      liveHtml !== null ? (liveHtml === "<p></p>" ? "" : liveHtml) : content;

    if (isEntryMode) {
      const snapObj = {
        title,
        noteIcon,
        content: effectiveContent,
        tags,
        pinned,
        location,
        eventCategory,
        attendance,
        listIds,
        syncToTimeline,
        notebookId,
        parentId,
        bookLink,
        listItemLinks,
      };
      const snap = JSON.stringify(snapObj);
      if (snap === lastSavedSnapRef.current) return;

      const patch: Partial<Entry> = {
        title:
          title.trim() ||
          (target.mode === "note" ? "Untitled Note" : "Untitled"),
        icon:
          target.mode === "note" || target.mode === "event"
            ? noteIcon || ""
            : undefined,
        content: effectiveContent,
        tags,
        pinned,
        location,
        eventCategory: target.mode === "event" ? eventCategory : undefined,
        attendance: target.mode === "event" ? attendance : undefined,
        listIds,
        syncToTimeline: target.mode === "note" ? syncToTimeline : undefined,
        notebookId: target.mode === "note" ? notebookId : undefined,
        parentId: target.mode === "note" ? parentId : undefined,
        bookLink: target.mode === "note" ? bookLink : undefined,
        listItemLinks:
          target.mode === "note"
            ? listItemLinks.length > 0
              ? listItemLinks
              : undefined
            : undefined,
      };

      if (activeId) {
        updateEntry(activeId, patch);
      } else if (title.trim() || effectiveContent.trim()) {
        const created = createEntry({
          ...(target.draft as Partial<Entry>),
          type: target.mode as Entry["type"],
          ...patch,
        });
        setCreatedId(created.id);
      }
      if (effectiveContent !== content) setContent(effectiveContent);
      lastSavedSnapRef.current = snap;
    } else if (target.mode === "habit") {
      const snapObj = {
        title,
        habitPurpose,
        habitColor,
        habitIcon,
        habitFreq,
        habitCustomDays,
        habitWeeklyTarget,
      };
      const snap = JSON.stringify(snapObj);
      if (snap === lastSavedSnapRef.current) return;

      const patch = {
        title: title.trim() || "Untitled Habit",
        purpose: habitPurpose.trim(),
        color: habitColor,
        icon: habitIcon,
        frequencyType: habitFreq,
        customDays: habitFreq === "custom" ? habitCustomDays : undefined,
        weeklyTarget: habitFreq === "weekly" ? habitWeeklyTarget : undefined,
      };

      if (activeId) {
        updateHabit(activeId, patch);
        lastSavedSnapRef.current = snap;
      }
    } else if (target.mode === "list_item") {
      const snapObj = {
        title,
        listSubtitle,
        listStatus,
        listId,
        tags,
        content: effectiveContent,
        listDueDate,
        listUrl,
      };
      const snap = JSON.stringify(snapObj);
      if (snap === lastSavedSnapRef.current) {
        if (activeId) {
          setListItemBookLink(activeId, listBookLink);
        }
        return;
      }

      const scheduledAt = listDueDate
        ? new Date(`${listDueDate}T12:00:00`).toISOString()
        : null;
      const trimmedUrl = listUrl.trim();
      const normalizedUrl = trimmedUrl
        ? normalizeExternalUrl(trimmedUrl) || trimmedUrl
        : undefined;
      const patch: Partial<ListItem> = {
        title: title.trim() || "Untitled Item",
        subtitle: listSubtitle.trim(),
        status: listStatus,
        listId,
        tags,
        content: effectiveContent,
        url: normalizedUrl,
        scheduledAt,
      };

      if (activeId) {
        updateListItem(activeId, patch);
        setListItemBookLink(activeId, listBookLink);
        if (effectiveContent !== content) setContent(effectiveContent);
        lastSavedSnapRef.current = snap;
      } else if (
        (title.trim() || effectiveContent.trim() || trimmedUrl) &&
        listId
      ) {
        const created = addListItem(
          listId,
          title.trim() || "Untitled Item",
          listStatus,
        );
        if (created) {
          updateListItem(created.id, patch);
          setListItemBookLink(created.id, listBookLink);
          setCreatedId(created.id);
          if (effectiveContent !== content) setContent(effectiveContent);
          lastSavedSnapRef.current = snap;
        }
      }
    }
  }, [
    target,
    isEntryMode,
    activeId,
    editorInstance,
    title,
    noteIcon,
    content,
    tags,
    pinned,
    location,
    eventCategory,
    attendance,
    listIds,
    syncToTimeline,
    notebookId,
    parentId,
    bookLink,
    listItemLinks,
    habitPurpose,
    habitColor,
    habitIcon,
    habitFreq,
    habitCustomDays,
    habitWeeklyTarget,
    listSubtitle,
    listStatus,
    listId,
    listDueDate,
    listUrl,
    listBookLink,
    updateEntry,
    createEntry,
    updateHabit,
    updateListItem,
    addListItem,
  ]);

  // Debounced 500ms autosave
  useEffect(() => {
    if (!target) return;
    if (target.mode === "habit" && !activeId) return;
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      flushSave();
    }, 500);
    return () => {
      if (debounceTimerRef.current)
        window.clearTimeout(debounceTimerRef.current);
    };
  }, [target, activeId, flushSave]);

  const handleClose = useCallback(() => {
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    flushSave();
    onClose();
  }, [flushSave, onClose]);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isComposingRef.current && !e.isComposing) {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [target, handleClose]);

  // Same-list tags for ListItem autocomplete
  const sameListTags = useMemo(() => {
    if (target?.mode !== "list_item" || !listId) return [];
    const set = new Set<string>();
    for (const item of workspace.listItems) {
      if (item.listId === listId) {
        (item.tags || []).forEach((t) => set.add(t));
      }
    }
    return Array.from(set).filter((t) => !tags.includes(t));
  }, [target?.mode, listId, workspace.listItems, tags]);

  // Habit 30-day analytics
  const habitRecent30 = useMemo(() => getRecentDateKeys(30), []);
  const liveHabit = useMemo(
    () =>
      activeId
        ? workspace.habits.find((h) => h.id === activeId) || existingHabit
        : null,
    [activeId, workspace.habits, existingHabit],
  );

  const habitStats = useMemo(() => {
    if (!liveHabit) return { streak: 0, adherence: 0, total: 0 };
    const todayKey = getTodayKey();
    let streak = 0;
    let cursor = todayKey;
    for (let i = 0; i < 365; i++) {
      if (liveHabit.completions[cursor]) {
        streak++;
        cursor = addDaysToKey(cursor, -1);
      } else if (liveHabit.missedDates?.[cursor]) {
        cursor = addDaysToKey(cursor, -1);
      } else if (i === 0) {
        cursor = addDaysToKey(cursor, -1);
      } else if (!isHabitScheduledOnDay(liveHabit, cursor)) {
        cursor = addDaysToKey(cursor, -1);
      } else {
        break;
      }
    }
    let scheduledCount = 0;
    let doneCount = 0;
    for (const key of habitRecent30) {
      if (isHabitScheduledOnDay(liveHabit, key)) {
        scheduledCount++;
        if (liveHabit.completions[key]) doneCount++;
      }
    }
    const adherence =
      scheduledCount > 0 ? Math.round((doneCount / scheduledCount) * 100) : 0;
    const total = Object.keys(liveHabit.completions).filter(
      (k) => liveHabit.completions[k],
    ).length;
    return { streak, adherence, total };
  }, [liveHabit, habitRecent30]);

  const allActiveNotes = useMemo(
    () => workspace.entries.filter((e) => e.type === "note" && !e.archived),
    [workspace.entries],
  );
  const noteMap = useMemo(
    () => new Map(allActiveNotes.map((n) => [n.id, n])),
    [allActiveNotes],
  );
  const descendantIds = useMemo(
    () =>
      activeId && target?.mode === "note"
        ? getNoteDescendantIds(activeId, allActiveNotes)
        : new Set<string>(),
    [activeId, target?.mode, allActiveNotes],
  );
  const ancestorChain = useMemo(() => {
    if (target?.mode !== "note") return [];
    if (activeId) return getNoteAncestorChain(activeId, noteMap);
    if (parentId) {
      const p = noteMap.get(parentId);
      return p ? [...getNoteAncestorChain(p.id, noteMap), p] : [];
    }
    return [];
  }, [target?.mode, activeId, parentId, noteMap]);
  const childSubPages = useMemo(() => {
    if (target?.mode !== "note" || !activeId) return [];
    return allActiveNotes
      .filter((n) => n.parentId === activeId)
      .sort((a, b) => {
        const ao = typeof a.sortOrder === "number" ? a.sortOrder : Number.MAX_SAFE_INTEGER;
        const bo = typeof b.sortOrder === "number" ? b.sortOrder : Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      });
  }, [target?.mode, activeId, allActiveNotes]);
  const availableParentNotes = useMemo(
    () =>
      allActiveNotes.filter(
        (n) => n.id !== activeId && !descendantIds.has(n.id),
      ),
    [allActiveNotes, activeId, descendantIds],
  );

  if (!target) return null;

  const liveEntry =
    isEntryMode && activeId
      ? workspace.entries.find((e) => e.id === activeId) || existingEntry
      : null;

  const isCreateMode = !activeId;
  const modeLabel: Record<DetailSheetTarget["mode"], string> = {
    note: "Note",
    event: "Event",
    task: "Task",
    log: "Log",
    habit: "Habit",
    list_item: "List Item",
  };

  const handleAddTag = (raw: string) => {
    const clean = raw.trim().replace(/^#/, "").toLowerCase();
    if (!clean || tags.includes(clean)) {
      setTagInput("");
      return;
    }
    setTags((prev) => [...prev, clean]);
    setTagInput("");
  };

  const handleNavigateToNote = (noteId: string, linkTitle?: string) => {
    if (!onOpenDetail) return;
    const found =
      noteMap.get(noteId) ??
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
    onOpenDetail({ mode: "note", id: found.id });
  };

  const handleCreateSubPage = () => {
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    let ensuredParentId = activeId;
    if (!ensuredParentId) {
      const liveHtml =
        editorInstance && !editorInstance.isDestroyed
          ? editorInstance.getHTML()
          : content;
      const createdParent = addNotePage({
        title: title.trim() || "Untitled Note",
        content: liveHtml === "<p></p>" ? "" : liveHtml,
        notebookId,
        parentId,
        syncToTimeline,
        tags,
      });
      ensuredParentId = createdParent.id;
      setCreatedId(createdParent.id);
    } else {
      flushSave();
    }
    const child = addNotePage({
      title: "",
      content: "",
      notebookId,
      parentId: ensuredParentId,
      syncToTimeline: workspace.settings.defaultNoteTimelineSync ?? false,
    });
    if (onOpenDetail) {
      onOpenDetail({ mode: "note", id: child.id });
    }
  };

  const handleDeleteCurrent = () => {
    if (isEntryMode && activeId) {
      if (target.mode === "note" && descendantIds.size > 0) {
        setBranchPrompt({
          action: "delete",
          noteId: activeId,
          noteTitle: title.trim() || "Untitled Note",
          directChildCount: childSubPages.length,
          totalDescendantCount: descendantIds.size,
        });
        return;
      }
      if (target.mode === "note") {
        deleteNotePage(activeId, "promote");
      } else {
        deleteEntry(activeId);
      }
      pushToast(`${modeLabel[target.mode]} deleted`);
    } else if (target.mode === "habit" && activeId) {
      deleteHabit(activeId);
    } else if (target.mode === "list_item" && activeId) {
      const impact = countLinkedNotesForListItems(workspace.entries, [activeId]);
      if (impact.totalAffectedNotes > 0) {
        setDeleteListItemConfirmOpen(true);
        return;
      }
      deleteListItem(activeId, "keep");
      pushToast("List item deleted");
    }
    onClose();
  };

  const handleCreateHabitSubmit = () => {
    if (!title.trim()) return;
    addHabit({
      title: title.trim(),
      purpose: habitPurpose.trim(),
      icon: habitIcon,
      color: habitColor,
      frequencyType: habitFreq,
      customDays: habitFreq === "custom" ? habitCustomDays : undefined,
      weeklyTarget: habitFreq === "weekly" ? habitWeeklyTarget : undefined,
    });
    onClose();
  };

  const currentListCollection = activeLists.find((l) => l.id === listId);
  const itemMeta = ITEM_META[currentListCollection?.listType || "custom"];
  const timeFormat = workspace.settings.timeFormat;
  const todayKey = getTodayKey();
  const hasRichEditor = isEntryMode || target.mode === "list_item";

  // Reusable Notion-style borderless property rows (rendered in right rail on desktop & directly under title on mobile)
  const renderPropertyRows = () => {
    if (isEntryMode) {
      return (
        <div className="space-y-0.5">
          {/* Task Status row */}
          {liveEntry && liveEntry.type === "task" && (
            <PropertyRow
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
              label="Status"
            >
              <button
                type="button"
                onClick={() => toggleEntryCompleted(liveEntry.id)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 -mx-1 font-medium transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{
                  color: liveEntry.completed
                    ? "var(--success)"
                    : "var(--text-primary)",
                }}
              >
                {liveEntry.completed ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Circle className="w-3.5 h-3.5 opacity-60" />
                )}
                <span>{liveEntry.completed ? "Completed" : "Open"}</span>
              </button>
            </PropertyRow>
          )}

          {/* Focus Bucket Switcher (Anchor / X-Active / Custom Tab / Timeline) */}
          {liveEntry && liveEntry.type === "task" && !liveEntry.completed && (
            <PropertyRow
              icon={<Sparkles className="w-3.5 h-3.5" />}
              label="Focus Bucket"
              alignTop
            >
              <div className="flex flex-wrap items-center gap-1 -mx-1">
                {(() => {
                  const isAnchor =
                    liveEntry.source === "focus-anchor" ||
                    liveEntry.focusBucket === "anchor";
                  const isXActive =
                    liveEntry.source === "focus-active" ||
                    liveEntry.focusBucket === "x-active";
                  const customTabId =
                    liveEntry.source === "custom-tab" ? liveEntry.tabId : null;
                  const isTimelineOnly =
                    !isAnchor && !isXActive && !customTabId;

                  const applyMove = (
                    targetBucket:
                      | "anchor"
                      | "x-active"
                      | "custom-tab"
                      | "timeline",
                    tabId?: string,
                  ) => {
                    const res = moveFocusItem(liveEntry.id, targetBucket, {
                      tabId,
                    });
                    if (!res.ok && res.reason === "capacity") {
                      window.dispatchEvent(
                        new CustomEvent("kanso:focus-swap-request", {
                          detail: { entryId: liveEntry.id },
                        }),
                      );
                    }
                  };

                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => applyMove("x-active")}
                        className="px-2 py-1 rounded-md text-xs font-medium transition-colors"
                        style={{
                          backgroundColor: isXActive
                            ? "var(--accent-soft)"
                            : "transparent",
                          color: isXActive
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                        }}
                      >
                        X-Active
                      </button>
                      <button
                        type="button"
                        onClick={() => applyMove("anchor")}
                        className="px-2 py-1 rounded-md text-xs font-medium transition-colors"
                        style={{
                          backgroundColor: isAnchor
                            ? "var(--accent-soft)"
                            : "transparent",
                          color: isAnchor
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                        }}
                      >
                        Anchor
                      </button>
                      {(workspace.customTabs ?? []).map((ct) => {
                        const active = customTabId === ct.id;
                        return (
                          <button
                            key={ct.id}
                            type="button"
                            onClick={() => applyMove("custom-tab", ct.id)}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors"
                            style={{
                              backgroundColor: active
                                ? "var(--accent-soft)"
                                : "transparent",
                              color: active
                                ? ct.color
                                : "var(--text-secondary)",
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: ct.color }}
                            />
                            <span>{ct.name}</span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => applyMove("timeline")}
                        className="px-2 py-1 rounded-md text-xs font-medium transition-colors"
                        style={{
                          backgroundColor: isTimelineOnly
                            ? "var(--accent-soft)"
                            : "transparent",
                          color: isTimelineOnly
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                        }}
                      >
                        Timeline
                      </button>
                    </>
                  );
                })()}
              </div>
            </PropertyRow>
          )}

          {/* Date row */}
          {liveEntry && (
            <PropertyRow
              icon={<Calendar className="w-3.5 h-3.5" />}
              label="Date"
            >
              <button
                type="button"
                onClick={() => onOpenTimestamps(liveEntry.id, "date")}
                className="w-full text-left rounded-md px-2 py-1 -mx-1 font-mono tabular-nums transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{ color: "var(--text-primary)" }}
              >
                {formatCompactDayHeading(getEntryDayKey(liveEntry))}
              </button>
            </PropertyRow>
          )}

          {/* Created time */}
          {liveEntry && (
            <PropertyRow
              icon={<Clock className="w-3.5 h-3.5" />}
              label="Created"
            >
              <button
                type="button"
                onClick={() => onOpenTimestamps(liveEntry.id, "created")}
                className="w-full text-left rounded-md px-2 py-1 -mx-1 font-mono tabular-nums transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{ color: "var(--text-secondary)" }}
              >
                {formatTime(liveEntry.createdAt, timeFormat)}
              </button>
            </PropertyRow>
          )}

          {/* Scheduled time */}
          {liveEntry &&
            (liveEntry.scheduledAt ||
              liveEntry.type === "task" ||
              liveEntry.type === "event") && (
              <PropertyRow
                icon={<CalendarClock className="w-3.5 h-3.5" />}
                label="Scheduled"
              >
                <button
                  type="button"
                  onClick={() => onOpenTimestamps(liveEntry.id, "scheduled")}
                  className="w-full text-left rounded-md px-2 py-1 -mx-1 font-mono tabular-nums transition-colors hover:bg-[var(--bg-surface-hover)]"
                  style={{
                    color: liveEntry.scheduledAt
                      ? "var(--color-entity-blue)"
                      : "var(--text-muted)",
                  }}
                >
                  {liveEntry.scheduledAt
                    ? formatTime(liveEntry.scheduledAt, timeFormat)
                    : "Empty"}
                </button>
              </PropertyRow>
            )}

          {/* Completed time */}
          {liveEntry &&
            (liveEntry.completedAt || liveEntry.type === "task") && (
              <PropertyRow
                icon={<Check className="w-3.5 h-3.5" />}
                label="Completed"
              >
                <button
                  type="button"
                  onClick={() => onOpenTimestamps(liveEntry.id, "completed")}
                  className="w-full text-left rounded-md px-2 py-1 -mx-1 font-mono tabular-nums transition-colors hover:bg-[var(--bg-surface-hover)]"
                  style={{
                    color: liveEntry.completedAt
                      ? "var(--success)"
                      : "var(--text-muted)",
                  }}
                >
                  {liveEntry.completedAt
                    ? formatTime(liveEntry.completedAt, timeFormat)
                    : "Empty"}
                </button>
              </PropertyRow>
            )}

          {/* Event Category, Attendance, Location */}
          {target.mode === "event" && (
            <>
              <PropertyRow
                icon={<Tag className="w-3.5 h-3.5" />}
                label="Category"
              >
                <div className="flex items-center gap-1 -mx-1">
                  {(["official", "personal"] as EventCategory[]).map((cat) => {
                    const active = eventCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setEventCategory(cat)}
                        className="px-2 py-1 rounded-md text-xs font-medium capitalize transition-colors"
                        style={{
                          backgroundColor: active
                            ? "var(--accent-soft)"
                            : "transparent",
                          color: active
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                        }}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </PropertyRow>

              <PropertyRow
                icon={<Users className="w-3.5 h-3.5" />}
                label="Attendance"
              >
                <div className="flex items-center gap-1 -mx-1 flex-wrap">
                  {(
                    [
                      { id: null, label: "Pending" },
                      { id: "attended", label: "Attended" },
                      { id: "missed", label: "Missed" },
                      { id: "universal", label: "Universal" },
                    ] as { id: EventAttendance; label: string }[]
                  ).map((opt) => {
                    const active = attendance === opt.id;
                    return (
                      <button
                        key={String(opt.id)}
                        type="button"
                        onClick={() => {
                          setAttendance(opt.id);
                          if (liveEntry)
                            setEventAttendance(liveEntry.id, opt.id);
                        }}
                        className="px-2 py-1 rounded-md text-xs font-medium transition-colors"
                        style={{
                          backgroundColor: active
                            ? "var(--accent-soft)"
                            : "transparent",
                          color:
                            active && opt.id === "attended"
                              ? "var(--success)"
                              : active && opt.id === "missed"
                                ? "var(--danger)"
                                : active && opt.id === "universal"
                                  ? "var(--accent)"
                                  : active
                                    ? "var(--accent)"
                                    : "var(--text-secondary)",
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </PropertyRow>

              <PropertyRow
                icon={<MapPin className="w-3.5 h-3.5" />}
                label="Location"
              >
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Empty"
                  className="w-full bg-transparent rounded-md px-2 py-1 -mx-1 text-xs outline-none transition-colors hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)] placeholder:opacity-50"
                  style={{ color: "var(--text-primary)" }}
                />
              </PropertyRow>
            </>
          )}

          {/* Note Notebook & Timeline sync */}
          {target.mode === "note" && (
            <>
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

              <PropertyRow
                icon={<Eye className="w-3.5 h-3.5" />}
                label="Timeline"
              >
                <button
                  type="button"
                  onClick={() => setSyncToTimeline((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-md px-2 py-1 -mx-1 transition-colors hover:bg-[var(--bg-surface-hover)]"
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

              {(() => {
                const linkedBook = bookLink?.bookId
                  ? workspace.books.find((b) => b.id === bookLink.bookId) ||
                    null
                  : null;
                const isRemovedSnapshot = Boolean(bookLink && !linkedBook);

                return (
                  <PropertyRow
                    icon={<BookOpen className="w-3.5 h-3.5" />}
                    label="Book"
                    alignTop
                  >
                    <div className="space-y-2 -mx-1 px-1">
                      <BookLinkPicker
                        books={workspace.books}
                        selectedBook={linkedBook}
                        removedBookTitle={
                          isRemovedSnapshot && bookLink ? bookLink.bookTitle : null
                        }
                        emptyLabel="None (unlinked)"
                        onSelectBook={(chosen) => {
                          if (!chosen) {
                            setBookLink(null);
                            return;
                          }
                          setBookLink(buildBookNoteLink(chosen, bookLink?.quote));
                        }}
                      />

                      {bookLink && linkedBook && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <label
                              className="text-[11px] shrink-0"
                              style={{ color: "var(--text-muted)" }}
                              htmlFor="detail-book-unit"
                            >
                              {linkedBook.format === "pdf" ? "Pg" : "Sec"}
                            </label>
                            <input
                              id="detail-book-unit"
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
                                    window.clearTimeout(
                                      debounceTimerRef.current,
                                    );
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
                );
              })()}
            </>
          )}

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
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-mono transition-colors hover:bg-[var(--bg-surface-hover)]"
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

          {/* Linked Lists (Notes & Events) */}
          {(target.mode === "note" || target.mode === "event") &&
            activeLists.length > 0 && (
              <PropertyRow
                icon={<Link2 className="w-3.5 h-3.5" />}
                label="Lists"
                alignTop
              >
                <div className="flex flex-wrap items-center gap-1 -mx-1 px-1 py-0.5">
                  {flattenedLists.map((node) => {
                    const l = node.list;
                    const linked = listIds.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        title={node.pathLabel}
                        onClick={() =>
                          setListIds((prev) =>
                            linked
                              ? prev.filter((id) => id !== l.id)
                              : [...prev, l.id],
                          )
                        }
                        className="px-2 py-0.5 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)]"
                        style={{
                          backgroundColor: linked
                            ? "var(--accent-soft)"
                            : "transparent",
                          color: linked ? "var(--accent)" : "var(--text-muted)",
                        }}
                      >
                        <span>{node.depth > 0 ? node.pathLabel : l.title}</span>
                        {linked && <Check className="w-3 h-3" />}
                      </button>
                    );
                  })}
                </div>
              </PropertyRow>
            )}

          {/* Linked List Items (Notes) */}
          {target.mode === "note" && (
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
          )}
        </div>
      );
    }

    if (target.mode === "habit") {
      return (
        <div className="space-y-1">
          {/* Schedule Cadence */}
          <PropertyRow
            icon={<Repeat className="w-3.5 h-3.5" />}
            label="Cadence"
            alignTop
          >
            <div className="space-y-2 -mx-1 px-1">
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    { id: "daily", label: "Daily" },
                    { id: "bi-weekly", label: "Bi-weekly" },
                    { id: "weekly", label: "Weekly" },
                    { id: "monthly", label: "Monthly" },
                    { id: "custom", label: "Custom" },
                  ] as { id: HabitFrequencyType; label: string }[]
                ).map((opt) => {
                  const active = habitFreq === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setHabitFreq(opt.id)}
                      className="px-2 py-1 rounded-md text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: active
                          ? "var(--accent-soft)"
                          : "transparent",
                        color: active
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {habitFreq === "custom" && (
                <div className="flex flex-wrap items-center gap-1">
                  {WEEKDAYS.map((day, idx) => {
                    const selected = habitCustomDays.includes(idx);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          setHabitCustomDays((prev) =>
                            selected
                              ? prev.length > 1
                                ? prev.filter((d) => d !== idx)
                                : prev
                              : [...prev, idx].sort(),
                          )
                        }
                        className="h-7 w-8 rounded-md text-[11px] font-medium transition-colors"
                        style={{
                          backgroundColor: selected
                            ? habitColor
                            : "var(--bg-surface-hover)",
                          color: selected ? "#fff" : "var(--text-secondary)",
                        }}
                      >
                        {day.slice(0, 2)}
                      </button>
                    );
                  })}
                </div>
              )}

              {habitFreq === "weekly" && (
                <div
                  className="flex items-center gap-2 text-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <input
                    type="number"
                    min={1}
                    max={7}
                    value={habitWeeklyTarget}
                    onChange={(e) =>
                      setHabitWeeklyTarget(
                        Math.max(1, Math.min(7, Number(e.target.value) || 1)),
                      )
                    }
                    className="w-14 h-7 px-2 rounded-md font-mono text-center outline-none"
                    style={{
                      backgroundColor: "var(--bg-surface-hover)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <span>days / week</span>
                </div>
              )}
            </div>
          </PropertyRow>

          {/* Accent Color */}
          <PropertyRow icon={<Palette className="w-3.5 h-3.5" />} label="Color">
            <div className="flex flex-wrap items-center gap-2 py-0.5">
              {HABIT_COLOR_PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setHabitColor(hex)}
                  className="w-5 h-5 rounded-full flex items-center justify-center transition-transform"
                  style={{
                    backgroundColor: hex,
                    transform: habitColor === hex ? "scale(1.18)" : "scale(1)",
                    boxShadow:
                      habitColor === hex
                        ? `0 0 0 2px var(--bg-canvas), 0 0 0 3.5px ${hex}`
                        : "none",
                  }}
                  aria-label={`Color ${hex}`}
                >
                  {habitColor === hex && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </button>
              ))}
            </div>
          </PropertyRow>

          {/* Icon Picker */}
          <PropertyRow
            icon={<Sparkles className="w-3.5 h-3.5" />}
            label="Icon"
          >
            <div className="relative inline-block">
              <button
                type="button"
                onClick={() => setHabitIconPickerOpen((prev) => !prev)}
                aria-expanded={habitIconPickerOpen}
                aria-label="Choose habit icon"
                className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-2 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{
                  backgroundColor: `${habitColor}16`,
                  borderColor: habitIconPickerOpen
                    ? habitColor
                    : "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              >
                <span
                  className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `${habitColor}24`,
                    color: habitColor,
                  }}
                >
                  <HabitIcon name={habitIcon} className="w-3.5 h-3.5" />
                </span>
                <span>
                  {SHARED_ICON_CATALOG.find(
                    (item) =>
                      item.key.toLowerCase() === habitIcon.toLowerCase(),
                  )?.label || habitIcon}
                </span>
              </button>

              <IconPickerPopover
                open={habitIconPickerOpen}
                onClose={() => setHabitIconPickerOpen(false)}
                value={habitIcon}
                onChange={(nextIcon) => setHabitIcon(nextIcon)}
                accentColor={habitColor}
                title="Habit Icon"
                align="left"
              />
            </div>
          </PropertyRow>
        </div>
      );
    }

    // LIST ITEM MODE
    return (
      <div className="space-y-0.5">
        <PropertyRow
          icon={<Type className="w-3.5 h-3.5" />}
          label={itemMeta.subtitleLabel}
        >
          <input
            type="text"
            value={listSubtitle}
            onChange={(e) => setListSubtitle(e.target.value)}
            placeholder={itemMeta.subtitlePlaceholder}
            className="w-full bg-transparent rounded-md px-2 py-1 -mx-1 text-xs outline-none transition-colors hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)] placeholder:opacity-50"
            style={{ color: "var(--text-primary)" }}
          />
        </PropertyRow>

        <PropertyRow
          icon={<ListChecks className="w-3.5 h-3.5" />}
          label="Status"
        >
          <select
            value={listStatus}
            onChange={(e) => setListStatus(e.target.value as ListItemStatus)}
            className="w-full bg-transparent rounded-md px-2 py-1 -mx-1 text-xs font-medium outline-none cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)]"
            style={{ color: "var(--text-primary)" }}
          >
            {LIST_STATUS_OPTIONS.map((opt) => (
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
          alignTop
        >
          <div className="space-y-1.5 -mx-1 px-1">
            <input
              type="date"
              value={listDueDate}
              onChange={(e) => setListDueDate(e.target.value)}
              className="w-full bg-transparent rounded-md px-1.5 py-1 text-xs font-mono outline-none transition-colors hover:bg-[var(--bg-surface-hover)]"
              style={{
                color: listDueDate
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
              }}
            />
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setListDueDate(addDaysToKey(todayKey, 1))}
                className="px-1.5 py-0.5 rounded text-[11px] transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{ color: "var(--text-secondary)" }}
              >
                Tomorrow
              </button>
              <button
                type="button"
                onClick={() => setListDueDate(addDaysToKey(todayKey, 7))}
                className="px-1.5 py-0.5 rounded text-[11px] transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{ color: "var(--text-secondary)" }}
              >
                Next wk
              </button>
              {listDueDate && (
                <button
                  type="button"
                  onClick={() => setListDueDate("")}
                  className="px-1.5 py-0.5 rounded text-[11px]"
                  style={{ color: "var(--danger)" }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </PropertyRow>

        <PropertyRow
          icon={<Link2 className="w-3.5 h-3.5" />}
          label="URL"
        >
          <div className="flex items-center gap-1 -mx-1">
            <input
              type="url"
              value={listUrl}
              onChange={(e) => setListUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 min-w-0 bg-transparent rounded-md px-2 py-1 text-xs outline-none transition-colors hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)] placeholder:opacity-50"
              style={{ color: "var(--text-primary)" }}
            />
            {normalizeExternalUrl(listUrl) && (
              <button
                type="button"
                onClick={() => openExternalUrlSafely(listUrl)}
                title="Open URL in new tab"
                aria-label="Open URL in new tab"
                className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] shrink-0 cursor-pointer"
                style={{ color: "var(--accent)" }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </PropertyRow>

        {currentListCollection?.listType === "books" && (() => {
          const linkedBook = listBookLink?.bookId
            ? workspace.books.find((b) => b.id === listBookLink.bookId) || null
            : null;
          return (
            <PropertyRow
              icon={<BookOpen className="w-3.5 h-3.5" />}
              label="Library Book"
              alignTop
            >
              <div className="space-y-1.5 -mx-1 px-1">
                <BookLinkPicker
                  books={workspace.books}
                  selectedBook={linkedBook}
                  emptyLabel="None (this device only)"
                  onSelectBook={(chosen) => {
                    if (!chosen) {
                      setListBookLink(null);
                      if (activeId) setListItemBookLink(activeId, null);
                      return;
                    }
                    const nextLink: BookNoteLink = buildBookNoteLink(chosen);
                    setListBookLink(nextLink);
                    if (activeId) setListItemBookLink(activeId, nextLink);
                  }}
                />

                {listBookLink && linkedBook && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {onJumpToBookLocation && (
                      <button
                        type="button"
                        onClick={() => {
                          if (debounceTimerRef.current) {
                            window.clearTimeout(debounceTimerRef.current);
                          }
                          flushSave();
                          onJumpToBookLocation(listBookLink);
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
                        setListBookLink(null);
                        if (activeId) setListItemBookLink(activeId, null);
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
          );
        })()}

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
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-mono"
                  style={{
                    backgroundColor: "var(--accent-soft)",
                    color: "var(--accent)",
                  }}
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
            {sameListTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {sameListTags.slice(0, 6).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleAddTag(t)}
                    className="text-[11px] font-mono hover:underline"
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
    );
  };

  const activeNotebookObj =
    target.mode === "note" && notebookId
      ? (workspace.noteNotebooks || []).find((nb) => nb.id === notebookId) ?? null
      : null;

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-stretch lg:items-center justify-center ${
        isFullPage ? "lg:p-0" : "lg:p-6"
      } overscroll-none`}
      role="dialog"
      aria-modal="true"
      aria-label={`${isCreateMode ? "Create" : "Edit"} ${modeLabel[target.mode]}`}
      onCompositionStart={() => {
        isComposingRef.current = true;
      }}
      onCompositionEnd={() => {
        isComposingRef.current = false;
      }}
    >
      {/* Desktop backdrop */}
      {!isFullPage && (
        <div
          className="hidden lg:block fixed inset-0 bg-black/45 backdrop-blur-[2px]"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* Shell: Full-screen page on Mobile (<lg) | Wide Modal or Full-Page Notion Canvas on Desktop (lg+) */}
      <div
        className={`relative z-10 w-full h-dvh flex flex-col overflow-hidden overscroll-none ${
          isFullPage
            ? "lg:max-w-none lg:w-full lg:h-dvh lg:rounded-none lg:border-0"
            : "lg:max-w-5xl lg:h-[84dvh] lg:rounded-2xl lg:border"
        }`}
        style={{
          backgroundColor: "var(--bg-canvas)",
          borderColor: "var(--border-strong)",
          boxShadow: isFullPage ? "none" : "var(--shadow-popover)",
        }}
      >
        {/* Minimal Hairline Top Bar (centered 56px row with independent safe-area top inset) */}
        <header
          className="border-b shrink-0"
          style={{
            backgroundColor: "var(--bg-canvas)",
            borderColor: "var(--border-subtle)",
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
        >
          <div className="h-14 px-4 sm:px-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={handleClose}
                className="lg:hidden h-10 w-10 flex items-center justify-center rounded-xl -ml-1 transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{ color: "var(--text-secondary)" }}
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <span
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                style={{ color: "var(--accent)" }}
              >
                {isEntryMode ? (
                  target.mode === "event" && noteIcon ? (
                    <DynamicIcon name={noteIcon} className="w-4 h-4" />
                  ) : (
                    <EntryTypeIcon
                      type={target.mode as Entry["type"]}
                      completed={Boolean(liveEntry?.completed)}
                      className="w-4 h-4"
                    />
                  )
                ) : target.mode === "habit" ? (
                  <HabitIcon
                    name={habitIcon}
                    className="w-4 h-4"
                    style={{ color: habitColor }}
                  />
                ) : (
                  <ListIcon
                    name={currentListCollection?.icon || "ListChecks"}
                    className="w-4 h-4"
                  />
                )}
              </span>

              <span
                className="text-xs font-semibold tracking-wide uppercase"
                style={{ color: "var(--text-secondary)" }}
              >
                {modeLabel[target.mode]}
              </span>

              <span
                style={{ color: "var(--border-strong)" }}
                aria-hidden="true"
              >
                ·
              </span>

              <span
                className="text-xs truncate"
                style={{ color: "var(--text-muted)" }}
              >
                {isCreateMode ? "New" : "Autosaved"}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* Quick Task Complete Toggle */}
              {liveEntry && liveEntry.type === "task" && (
                <button
                  type="button"
                  onClick={() => toggleEntryCompleted(liveEntry.id)}
                  className="h-9 lg:h-8 px-2.5 flex items-center gap-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-surface-hover)]"
                  style={{
                    color: liveEntry.completed
                      ? "var(--success)"
                      : "var(--text-secondary)",
                  }}
                  title={liveEntry.completed ? "Reopen task" : "Complete task"}
                >
                  {liveEntry.completed ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Circle className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">
                    {liveEntry.completed ? "Completed" : "Complete"}
                  </span>
                </button>
              )}

              {/* Pin toggle for Notes */}
              {target.mode === "note" && (
                <button
                  type="button"
                  onClick={() => setPinned((p) => !p)}
                  className="h-9 w-9 lg:h-8 lg:w-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)]"
                  style={{
                    backgroundColor: pinned
                      ? "var(--accent-soft)"
                      : "transparent",
                    color: pinned ? "var(--accent)" : "var(--text-muted)",
                  }}
                  title={pinned ? "Unpin note" : "Pin note"}
                  aria-label="Toggle pin"
                >
                  <Pin className="w-4 h-4" />
                </button>
              )}

              {/* Achievement Trophy toggle when already an achievement */}
              {liveEntry && liveEntry.isAchievement && (
                <button
                  type="button"
                  onClick={() => toggleEntryAchievement(liveEntry.id)}
                  className="h-9 lg:h-8 px-2 flex items-center gap-1 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: "rgba(217, 119, 6, 0.14)",
                    color: "var(--warning)",
                  }}
                  title="Remove from Achievements"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Achievement</span>
                </button>
              )}

              {/* Delete */}
              {!isCreateMode && (
                <button
                  type="button"
                  onClick={handleDeleteCurrent}
                  className="h-9 w-9 lg:h-8 lg:w-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)]"
                  style={{ color: "var(--text-muted)" }}
                  title={`Delete ${modeLabel[target.mode]}`}
                  aria-label="Delete"
                >
                  <Trash2 className="w-4 h-4 hover:text-[var(--danger)]" />
                </button>
              )}

              {/* Full-Page Expand Toggle (Desktop) */}
              <button
                type="button"
                onClick={onToggleFullPage}
                className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{
                  backgroundColor: isFullPage
                    ? "var(--accent-soft)"
                    : "transparent",
                  color: isFullPage ? "var(--accent)" : "var(--text-muted)",
                }}
                title={isFullPage ? "Exit full page" : "Open full page"}
                aria-label={isFullPage ? "Exit full page" : "Open full page"}
              >
                {isFullPage ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>

              {/* Desktop Close */}
              <button
                type="button"
                onClick={handleClose}
                className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{ color: "var(--text-muted)" }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Main Body: Single column on Mobile | Wide 2-Column Split on Desktop */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* LEFT PRIMARY WRITING / ANALYTICS CANVAS */}
          <main className="flex-1 min-w-0 overflow-y-auto overscroll-none px-5 sm:px-8 lg:px-10 py-6 lg:py-8">
            <div
              className={
                isFullPage
                  ? "max-w-3xl mx-auto space-y-5"
                  : "max-w-2xl mx-auto lg:mx-0 lg:max-w-none space-y-5"
              }
            >
              {/* Notion-style Ancestor Breadcrumb Trail for Notes */}
              {target.mode === "note" && (
                <nav
                  aria-label="Page breadcrumb"
                  className="flex flex-wrap items-center gap-1 text-xs -mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  <span className="truncate max-w-[140px]">
                    {activeNotebookObj ? activeNotebookObj.name : "All Notes"}
                  </span>
                  {ancestorChain.map((anc) => (
                    <React.Fragment key={anc.id}>
                      <ChevronRight className="w-3 h-3 shrink-0 opacity-60" />
                      <button
                        type="button"
                        onClick={() => handleNavigateToNote(anc.id)}
                        className="truncate max-w-[160px] hover:underline cursor-pointer"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {anc.title || "Untitled Note"}
                      </button>
                    </React.Fragment>
                  ))}
                  <ChevronRight className="w-3 h-3 shrink-0 opacity-60" />
                  <span
                    className="inline-flex items-center gap-1.5 truncate max-w-[200px] font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {noteIcon && (
                      <NotePageIcon
                        icon={noteIcon}
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: "var(--accent)" }}
                      />
                    )}
                    <span className="truncate">{title.trim() || "Untitled Note"}</span>
                  </span>
                </nav>
              )}

              {/* Borderless Auto-Growing Display Title (+ Page / Event Icon Picker) */}
              {target.mode === "note" || target.mode === "event" ? (
                <div className="flex items-start gap-2.5 sm:gap-3">
                  <div className="relative shrink-0 pt-0.5 sm:pt-1">
                    <button
                      type="button"
                      onClick={() => setNoteIconPickerOpen((prev) => !prev)}
                      title={
                        target.mode === "event"
                          ? noteIcon
                            ? "Change event icon"
                            : "Add event icon"
                          : noteIcon
                            ? "Change page icon"
                            : "Add page icon"
                      }
                      aria-label={
                        target.mode === "event"
                          ? noteIcon
                            ? "Change event icon"
                            : "Add event icon"
                          : noteIcon
                            ? "Change page icon"
                            : "Add page icon"
                      }
                      aria-expanded={noteIconPickerOpen}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{
                        backgroundColor: noteIcon
                          ? "var(--accent-soft)"
                          : "var(--bg-surface)",
                        borderColor: noteIconPickerOpen
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                        color: noteIcon ? "var(--accent)" : "var(--text-muted)",
                      }}
                    >
                      {target.mode === "event" ? (
                        noteIcon ? (
                          <DynamicIcon name={noteIcon} className="w-5 h-5" />
                        ) : (
                          <Calendar className="w-5 h-5" />
                        )
                      ) : (
                        <NotePageIcon icon={noteIcon} className="w-5 h-5" />
                      )}
                    </button>

                    <IconPickerPopover
                      open={noteIconPickerOpen}
                      onClose={() => setNoteIconPickerOpen(false)}
                      value={noteIcon}
                      onChange={(nextIcon) => setNoteIcon(nextIcon)}
                      onClear={() => setNoteIcon("")}
                      allowClear
                      clearLabel="Default"
                      title={target.mode === "event" ? "Event Icon" : "Page Icon"}
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
                    placeholder={
                      target.mode === "note" ? "Untitled Note" : "Untitled"
                    }
                    autoFocus={isCreateMode}
                    className="flex-1 min-w-0 bg-transparent font-display text-2xl sm:text-[1.75rem] font-bold tracking-tight leading-snug resize-none outline-none overflow-hidden placeholder:opacity-35"
                    style={{ color: "var(--text-primary)" }}
                  />
                </div>
              ) : (
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
                  placeholder={
                    target.mode === "habit"
                      ? "Habit name (e.g. Morning Walk)..."
                      : "Untitled"
                  }
                  autoFocus={isCreateMode}
                  className="w-full bg-transparent font-display text-2xl sm:text-[1.75rem] font-bold tracking-tight leading-snug resize-none outline-none overflow-hidden placeholder:opacity-35"
                  style={{ color: "var(--text-primary)" }}
                />
              )}

              {/* Habit Borderless Purpose Line (right beneath title) */}
              {target.mode === "habit" && (
                <input
                  type="text"
                  value={habitPurpose}
                  onChange={(e) => setHabitPurpose(e.target.value)}
                  placeholder="Add your purpose or cue (why this habit matters)..."
                  className="w-full bg-transparent text-sm outline-none placeholder:opacity-45 -mt-2"
                  style={{ color: "var(--text-secondary)" }}
                />
              )}

              {/* MOBILE ONLY (<lg): Notion-style borderless property rows directly beneath title */}
              {!isLgViewport && (
                <section
                  className="lg:hidden border-y py-2.5"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  {!mobilePropsCollapsed && renderPropertyRows()}
                  <button
                    type="button"
                    onClick={() => setMobilePropsCollapsed((v) => !v)}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium py-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {mobilePropsCollapsed ? (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" />
                        <span>Show properties</span>
                      </>
                    ) : (
                      <>
                        <ChevronUp className="w-3.5 h-3.5" />
                        <span>Hide properties</span>
                      </>
                    )}
                  </button>
                </section>
              )}

              {/* Borderless Rich Text Canvas (Entry & ListItem modes) */}
              {hasRichEditor && (
                <div className="pt-1">
                  <TiptapEditor
                    docId={target.id || sessionDraftDocIdRef.current}
                    content={content}
                    onChange={setContent}
                    variant="borderless"
                    placeholder={
                      target.mode === "list_item"
                        ? "Write notes, highlights, or type / for blocks..."
                        : target.mode === "note"
                          ? "Write details, type [[ to link notes, or / for blocks..."
                          : "Write details, paste Markdown, or type / for blocks..."
                    }
                    minHeight={300}
                    onEditorReady={setEditorInstance}
                    allNotes={target.mode === "note" ? allActiveNotes : undefined}
                    onOpenNote={
                      target.mode === "note" ? handleNavigateToNote : undefined
                    }
                    onCreateLinkedNote={
                      target.mode === "note"
                        ? (linkTitle) =>
                            addNotePage({
                              title: linkTitle,
                              notebookId,
                            })
                        : undefined
                    }
                  />
                </div>
              )}

              {/* Linked Notes Section inside List Item Canvas */}
              {target.mode === "list_item" && (() => {
                const liveListItem = activeId
                  ? workspace.listItems.find((i) => i.id === activeId) || existingListItem
                  : null;
                if (!liveListItem) {
                  return (
                    <section
                      className="pt-3 border-t"
                      style={{ borderColor: "var(--border-subtle)" }}
                    >
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Enter a title or content to start linking notes to this list item.
                      </p>
                    </section>
                  );
                }
                return (
                  <ListItemLinkedNotesSection
                    item={liveListItem}
                    list={currentListCollection ?? null}
                    onBeforeJump={() => {
                      if (debounceTimerRef.current) {
                        window.clearTimeout(debounceTimerRef.current);
                      }
                      flushSave();
                    }}
                    onJumpToNote={onJumpToNote}
                    onOpenDetail={onOpenDetail}
                  />
                );
              })()}

              {/* Collapsible Inline Sub-Pages Block inside Note Canvas */}
              {target.mode === "note" && (
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

                  {!subPagesCollapsed && (
                    childSubPages.length > 0 ? (
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
                                <NotePageIcon
                                  icon={child.icon}
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
                        No sub-pages yet. Nest related pages directly inside this note.
                      </p>
                    )
                  )}
                </section>
              )}

              {/* Habit Analytics & Interactive 30-Day Matrix Punchstrip */}
              {target.mode === "habit" && (
                <div className="pt-2 space-y-6">
                  {liveHabit ? (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div
                          className="p-3.5 rounded-xl border"
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            borderColor: "var(--border-subtle)",
                          }}
                        >
                          <div
                            className="text-[11px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Current Streak
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 font-mono tabular-nums text-xl font-bold">
                            <Flame
                              className="w-4 h-4"
                              style={{ color: habitColor }}
                            />
                            <span>{habitStats.streak}d</span>
                          </div>
                        </div>
                        <div
                          className="p-3.5 rounded-xl border"
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            borderColor: "var(--border-subtle)",
                          }}
                        >
                          <div
                            className="text-[11px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            30d Adherence
                          </div>
                          <div className="mt-1.5 font-mono tabular-nums text-xl font-bold">
                            {habitStats.adherence}%
                          </div>
                        </div>
                        <div
                          className="p-3.5 rounded-xl border"
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            borderColor: "var(--border-subtle)",
                          }}
                        >
                          <div
                            className="text-[11px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Total Logged
                          </div>
                          <div className="mt-1.5 font-mono tabular-nums text-xl font-bold">
                            {habitStats.total}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <div
                          className="text-[11px] font-semibold uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Last 30 Days · Tap to cycle Done / Missed / Clear
                        </div>
                        <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
                          {habitRecent30.map((key) => {
                            const done = Boolean(liveHabit.completions[key]);
                            const missed = !done && Boolean(liveHabit.missedDates?.[key]);
                            const isToday = key === todayKey;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() =>
                                  cycleHabitDayStatus(liveHabit.id, key)
                                }
                                title={`${getDayAbbrev(key)} ${key}${
                                  done ? " · Done" : missed ? " · Missed" : ""
                                }`}
                                className="h-10 rounded-lg border flex flex-col items-center justify-center text-[11px] font-mono tabular-nums transition-colors cursor-pointer"
                                style={{
                                  backgroundColor: done
                                    ? habitColor
                                    : missed
                                      ? "var(--bg-surface-subtle)"
                                      : "var(--bg-surface)",
                                  borderColor: isToday
                                    ? "var(--accent)"
                                    : done
                                      ? habitColor
                                      : "var(--border-subtle)",
                                  color: done
                                    ? "#fff"
                                    : missed
                                      ? "var(--text-muted)"
                                      : "var(--text-muted)",
                                }}
                              >
                                {done ? (
                                  <Check className="w-3.5 h-3.5" />
                                ) : missed ? (
                                  <X className="w-3.5 h-3.5 opacity-80" />
                                ) : (
                                  key.slice(-2)
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div
                      className="rounded-xl border border-dashed p-5 text-xs space-y-1.5"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-muted)",
                      }}
                    >
                      <p
                        className="font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Set your cadence, color, and icon in Properties.
                      </p>
                      <p>
                        Once created, your 30-day interactive matrix and streak
                        metrics will appear right here.
                      </p>
                    </div>
                  )}

                  {isCreateMode && (
                    <div className="hidden lg:flex justify-start pt-2">
                      <button
                        type="button"
                        disabled={!title.trim()}
                        onClick={handleCreateHabitSubmit}
                        className="h-10 px-5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
                        style={{
                          backgroundColor: "var(--accent)",
                          color: "var(--accent-fg)",
                        }}
                      >
                        <Plus className="w-4 h-4" />
                        <span>Create Habit</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>

          {/* RIGHT PROPERTIES RAIL — DESKTOP ONLY (lg+) */}
          {isLgViewport && (
            <aside
              className="hidden lg:flex lg:flex-col w-80 xl:w-[340px] shrink-0 border-l overflow-y-auto px-5 py-6"
              style={{
                backgroundColor: "var(--bg-surface-subtle)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div
                className="text-[10.5px] font-semibold uppercase tracking-wider mb-3 px-1"
                style={{ color: "var(--text-muted)" }}
              >
                Properties
              </div>

              {renderPropertyRows()}

            {/* Quick Actions Footer inside Desktop Rail */}
            {liveEntry && (
              <div
                className="mt-auto pt-5 border-t space-y-1"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div
                  className="text-[10.5px] font-semibold uppercase tracking-wider mb-2 px-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Quick Actions
                </div>
                <button
                  type="button"
                  onClick={() => onOpenTimestamps(liveEntry.id, "date")}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-surface-hover)] text-left"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <Clock className="w-3.5 h-3.5 opacity-75" />
                  <span>Edit all timestamps</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCurrent}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-surface-hover)] text-left"
                  style={{ color: "var(--danger)" }}
                >
                  <Trash2 className="w-3.5 h-3.5 opacity-80" />
                  <span>Delete {modeLabel[target.mode].toLowerCase()}</span>
                </button>
              </div>
            )}
            </aside>
          )}
        </div>

        {/* MOBILE THUMB-ZONE BOTTOM TOOLBAR */}
        {hasRichEditor && (
          <TiptapThumbToolbar editor={editorInstance} onDone={handleClose} />
        )}

        {/* Mobile Habit Create CTA in thumb-zone */}
        {target.mode === "habit" && isCreateMode && (
          <div
            className="lg:hidden shrink-0 border-t px-4 py-3 pb-safe"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <button
              type="button"
              disabled={!title.trim()}
              onClick={handleCreateHabitSubmit}
              className="w-full h-11 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Create Habit</span>
            </button>
          </div>
        )}
      </div>

      <NoteDeleteBranchModal
        prompt={branchPrompt}
        onCancel={() => setBranchPrompt(null)}
        onChoose={(mode) => {
          if (branchPrompt) {
            deleteNotePage(branchPrompt.noteId, mode);
            pushToast("Note deleted");
          }
          setBranchPrompt(null);
          onClose();
        }}
      />

      {target.mode === "list_item" && activeId && deleteListItemConfirmOpen && (() => {
        const impact = countLinkedNotesForListItems(workspace.entries, [activeId]);
        return (
          <DeleteListItemsConfirmModal
            open={deleteListItemConfirmOpen}
            itemCount={1}
            itemTitle={title.trim() || "Untitled Item"}
            exclusivelyLinkedNotesCount={impact.exclusivelyLinkedNotes}
            sharedNotesCount={impact.sharedNotes}
            onCancel={() => setDeleteListItemConfirmOpen(false)}
            onConfirm={(linkedNotesBehavior) => {
              deleteListItem(activeId, linkedNotesBehavior);
              setDeleteListItemConfirmOpen(false);
              pushToast(
                linkedNotesBehavior === "delete"
                  ? "List item and linked notes deleted"
                  : "List item deleted",
              );
              onClose();
            }}
          />
        );
      })()}
    </div>
  );
};

export const DetailSheet: React.FC<DetailSheetProps> = (props) => {
  const { target } = props;
  const [isFullPage, setIsFullPage] = useState(false);

  if (!target) return null;
  return (
    <DetailSheetInner
      key={`${target.mode}:${target.id ?? "new"}`}
      {...props}
      isFullPage={isFullPage}
      onToggleFullPage={() => setIsFullPage((v) => !v)}
    />
  );
};
