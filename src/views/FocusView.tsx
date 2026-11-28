import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  GripVertical,
  MoreVertical,
  Play,
  Plus,
  StickyNote,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { InlineTitleEdit } from "../components/InlineTitleEdit";
import { FocusAnchorsSection } from "../components/focus/FocusAnchorsSection";
import {
  FocusCaptureBar,
  FocusCaptureSubmitTarget,
  TodayCaptureBucket,
} from "../components/focus/FocusCaptureBar";
import { FocusCustomTab } from "../components/focus/FocusCustomTab";
import { FocusScratchpadTab } from "../components/focus/FocusScratchpadTab";
import { FocusSpotlightBanner } from "../components/focus/FocusSpotlightBanner";
import { PinnedScratchpadRail } from "../components/focus/PinnedScratchpadRail";
import { SwapXActiveModal } from "../components/focus/SwapXActiveModal";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  ContextMenuRecord,
  CustomFocusTab,
  DetailSheetTarget,
  Entry,
  ViewId,
} from "../types";
import {
  formatCompactDayHeading,
  formatTime,
  getEntryDayKey,
  getTodayKey,
} from "../utils/date";
import { parseNlpInput } from "../utils/nlp";
import type { AudioPlaybackSummary } from "./AudioView";
import type { StreamerPlaybackSummary } from "./StreamerView";

const TAB_COLORS = [
  "#b45309",
  "#4f46e5",
  "#059669",
  "#0284c7",
  "#e11d48",
  "#9333ea",
  "#d97706",
];

type MobileTodaySection = "all" | "anchors" | "active" | "done";

type PendingSwap =
  | { kind: "move-entry"; entryId: string; title: string }
  | { kind: "promote-scratchpad"; scratchpadId: string; title: string }
  | { kind: "create-xactive"; rawText: string; title: string };

interface FocusViewProps {
  onOpenDetail: (target: DetailSheetTarget) => void;
  onOpenContextMenu: (record: ContextMenuRecord, e: React.MouseEvent) => void;
  audioPlayback?: AudioPlaybackSummary;
  streamerPlayback?: StreamerPlaybackSummary;
  onToggleAudioPlayback?: () => void;
  onToggleStreamerPlayback?: () => void;
  onNavigateView?: (view: ViewId) => void;
}

function formatPrefillHour(hour24: number, timeFormat: "12h" | "24h"): string {
  if (timeFormat === "24h") {
    return `${String(hour24).padStart(2, "0")}:00`;
  }
  const suffix = hour24 >= 12 ? "pm" : "am";
  const h12 = hour24 % 12 || 12;
  return `${h12}${suffix}`;
}

export const FocusView: React.FC<FocusViewProps> = ({
  onOpenDetail,
  onOpenContextMenu,
  audioPlayback,
  streamerPlayback,
  onToggleAudioPlayback,
  onToggleStreamerPlayback,
  onNavigateView,
}) => {
  const {
    workspace,
    addFocusItem,
    moveFocusItem,
    clearFocusDayFromView,
    updateEntry,
    toggleEntryCompleted,
    addScratchpad,
    updateScratchpad,
    reorderScratchpads,
    deleteScratchpad,
    sendScratchpadToTimeline,
    sendScratchpadToXActive,
    addCustomTab,
    updateCustomTab,
    deleteCustomTab,
    deleteEntry,
    reorderNoteEntries,
    pushToast,
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<"today" | "scratchpad" | string>(
    "today",
  );
  const [mobileSection, setMobileSection] =
    useState<MobileTodaySection>("all");
  const [captureBucket, setCaptureBucket] =
    useState<TodayCaptureBucket>("x-active");
  const [capturePrefill, setCapturePrefill] = useState<{
    nonce: number;
    text: string;
    bucket?: TodayCaptureBucket;
  } | null>(null);

  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null);
  const [completedPanelOpen, setCompletedPanelOpen] = useState(true);
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>(
    {},
  );
  const [pendingSwap, setPendingSwap] = useState<PendingSwap | null>(null);

  const [isDark, setIsDark] = useState<boolean>(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );

  // Custom tab creation / edit modal state
  const [tabModal, setTabModal] = useState<{
    mode: "create" | "edit";
    tab?: CustomFocusTab;
    name: string;
    color: string;
  } | null>(null);

  // Auto-swap Scratchpad palette between dark and light via MutationObserver
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const syncDark = () => setIsDark(root.classList.contains("dark"));
    syncDark();
    const observer = new MutationObserver(syncDark);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const todayKey = getTodayKey();
  const timeFormat = workspace.settings.timeFormat;
  const xLimit = workspace.settings.xActiveLimit;

  const activeCustomTabs = useMemo(
    () => workspace.customTabs ?? [],
    [workspace.customTabs],
  );

  // Reset to 'today' if current custom tab was deleted
  useEffect(() => {
    if (
      activeTab !== "today" &&
      activeTab !== "scratchpad" &&
      !activeCustomTabs.some((t) => t.id === activeTab)
    ) {
      setActiveTab("today");
    }
  }, [activeTab, activeCustomTabs]);

  const activeEntries = useMemo(() => workspace.entries, [workspace.entries]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const e of activeEntries) {
      for (const t of e.tags) tagSet.add(t);
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [activeEntries]);

  // Listen for capacity swap requests fired from DetailSheet or UniversalContextMenu
  useEffect(() => {
    const onSwapRequest = (ev: Event) => {
      const detail = (ev as CustomEvent<{ entryId?: string }>).detail;
      const entryId = detail?.entryId;
      if (!entryId) return;
      const found = workspace.entries.find((e) => e.id === entryId);
      if (!found) return;
      setPendingSwap({
        kind: "move-entry",
        entryId: found.id,
        title: found.title,
      });
    };
    window.addEventListener("kanso:focus-swap-request", onSwapRequest);
    return () =>
      window.removeEventListener("kanso:focus-swap-request", onSwapRequest);
  }, [workspace.entries]);

  // Today tab buckets
  const anchors = useMemo(
    () =>
      activeEntries
        .filter(
          (e) =>
            (e.source === "focus-anchor" || e.focusBucket === "anchor") &&
            !e.completed,
        )
        .sort((a, b) => {
          const ta = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
          const tb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
          return ta - tb;
        }),
    [activeEntries],
  );

  // X-Active drag & drop reorder state
  const activeDragXIdRef = useRef<string | null>(null);
  const xRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [draggingXId, setDraggingXId] = useState<string | null>(null);
  const [xDropTarget, setXDropTarget] = useState<{
    entryId: string;
    position: "before" | "after";
  } | null>(null);

  const clearXDragState = useCallback(() => {
    activeDragXIdRef.current = null;
    setDraggingXId(null);
    setXDropTarget(null);
  }, []);

  useEffect(() => {
    window.addEventListener("dragend", clearXDragState);
    window.addEventListener("drop", clearXDragState);
    return () => {
      window.removeEventListener("dragend", clearXDragState);
      window.removeEventListener("drop", clearXDragState);
    };
  }, [clearXDragState]);

  const customEntryOrderCompare = useCallback((a: Entry, b: Entry) => {
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
    return (
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
      a.id.localeCompare(b.id)
    );
  }, []);

  const xActiveTasks = useMemo(
    () =>
      activeEntries
        .filter(
          (e) =>
            (e.source === "focus-active" || e.focusBucket === "x-active") &&
            !e.completed,
        )
        .sort(customEntryOrderCompare),
    [activeEntries, customEntryOrderCompare],
  );

  const handleReorderXActive = useCallback(
    (draggedId: string, targetId: string, position: "before" | "after") => {
      if (!draggedId || !targetId || draggedId === targetId) return;
      const ids = xActiveTasks.map((t) => t.id);
      if (!ids.includes(draggedId) || !ids.includes(targetId)) return;
      const remaining = ids.filter((id) => id !== draggedId);
      const targetIndex = remaining.indexOf(targetId);
      if (targetIndex === -1) return;
      const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
      const nextIds = [
        ...remaining.slice(0, insertIndex),
        draggedId,
        ...remaining.slice(insertIndex),
      ];
      if (nextIds.every((id, idx) => id === ids[idx])) return;

      const sortOrderById: Record<string, number> = {};
      nextIds.forEach((id, idx) => {
        sortOrderById[id] = idx;
      });
      reorderNoteEntries(sortOrderById);
    },
    [xActiveTasks, reorderNoteEntries],
  );

  const resolveXTouchDrop = useCallback(
    (
      clientY: number,
      activeId: string,
    ): { entryId: string; position: "before" | "after" } | null => {
      for (const task of xActiveTasks) {
        if (task.id === activeId) continue;
        const el = xRowRefs.current.get(task.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          return {
            entryId: task.id,
            position: clientY < rect.top + rect.height / 2 ? "before" : "after",
          };
        }
      }
      return null;
    },
    [xActiveTasks],
  );

  const atXCapacity = xActiveTasks.length >= xLimit;

  // Resolve spotlight entry (only active incomplete X-Active or Anchor item)
  const focusedEntry = useMemo(() => {
    if (!focusedEntryId) return null;
    return (
      xActiveTasks.find((e) => e.id === focusedEntryId) ??
      anchors.find((e) => e.id === focusedEntryId) ??
      null
    );
  }, [focusedEntryId, xActiveTasks, anchors]);

  // Clear stale spotlight ID if item was completed/deleted
  useEffect(() => {
    if (focusedEntryId && !focusedEntry) {
      setFocusedEntryId(null);
    }
  }, [focusedEntryId, focusedEntry]);

  // Completed (Anchors & Active Work + Log Done entries) grouped by local day key
  const completedByDay = useMemo(() => {
    const completedFocus = activeEntries.filter((e) => {
      if (!e.completed) return false;
      return (
        e.focusBucket !== null ||
        e.source === "focus-anchor" ||
        e.source === "focus-active"
      );
    });
    const groups = new Map<string, Entry[]>();
    for (const entry of completedFocus) {
      const dayKey = getEntryDayKey(entry);
      const list = groups.get(dayKey) || [];
      list.push(entry);
      groups.set(dayKey, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dayKey, items]) => ({
        dayKey,
        items: items.sort(
          (a, b) =>
            new Date(b.completedAt || b.createdAt).getTime() -
            new Date(a.completedAt || a.createdAt).getTime(),
        ),
      }));
  }, [activeEntries]);

  const totalCompletedCount = useMemo(
    () => completedByDay.reduce((sum, g) => sum + g.items.length, 0),
    [completedByDay],
  );

  // Scratchpad cards
  const scratchpads = useMemo(
    () => [...(workspace.scratchpads ?? [])],
    [workspace.scratchpads],
  );

  const pinnedScratchpads = useMemo(
    () =>
      scratchpads
        .filter((c) => c.pinned)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    [scratchpads],
  );

  const currentCustomTab =
    activeCustomTabs.find((t) => t.id === activeTab) || null;
  const customTabTasks = useMemo(() => {
    if (!currentCustomTab) return { active: [], completed: [] };
    const matching = activeEntries.filter(
      (e) => e.source === "custom-tab" && e.tabId === currentCustomTab.id,
    );
    return {
      active: matching
        .filter((e) => !e.completed)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      completed: matching
        .filter((e) => e.completed)
        .sort(
          (a, b) =>
            new Date(b.completedAt || b.createdAt).getTime() -
            new Date(a.completedAt || a.createdAt).getTime(),
        ),
    };
  }, [activeEntries, currentCustomTab]);

  // Unified Capture Bar submission
  const handleCaptureSubmit = useCallback(
    (target: FocusCaptureSubmitTarget, rawTextForNlp: string): boolean => {
      if (target.bucket === "custom-tab" && target.tabId) {
        const added = addFocusItem("custom-tab", rawTextForNlp, target.tabId);
        if (added) {
          const tab = activeCustomTabs.find((t) => t.id === target.tabId);
          pushToast(
            `Added to ${tab ? tab.name : "Custom Tab"}`,
            "success",
          );
        }
        return added;
      }

      if (target.bucket === "x-active" && atXCapacity) {
        const parsed = parseNlpInput(rawTextForNlp, todayKey, timeFormat);
        pushToast(
          `X-Active is at ${xLimit}-task capacity — choose one to swap`,
          "neutral",
        );
        setPendingSwap({
          kind: "create-xactive",
          rawText: rawTextForNlp,
          title: parsed.cleanTitle || rawTextForNlp.trim(),
        });
        return true;
      }

      return addFocusItem(target.bucket as TodayCaptureBucket, rawTextForNlp);
    },
    [
      addFocusItem,
      activeCustomTabs,
      atXCapacity,
      todayKey,
      timeFormat,
      xLimit,
      pushToast,
    ],
  );

  // Move existing entry to X-Active (triggers swap modal if full)
  const handleMoveEntryToXActive = useCallback(
    (entry: Entry) => {
      const res = moveFocusItem(entry.id, "x-active");
      if (!res.ok && res.reason === "capacity") {
        setPendingSwap({
          kind: "move-entry",
          entryId: entry.id,
          title: entry.title,
        });
      }
    },
    [moveFocusItem],
  );

  // Promote scratchpad card to X-Active (triggers swap modal if full)
  const handlePromoteScratchpadToXActive = useCallback(
    (cardId: string) => {
      const card = scratchpads.find((c) => c.id === cardId);
      if (!card || !card.content.trim()) return;
      const res = sendScratchpadToXActive(cardId);
      if (!res.ok && res.reason === "capacity") {
        const firstLine =
          card.content
            .split("\n")
            .map((l) => l.trim())
            .find(Boolean)
            ?.slice(0, 80) || "Scratchpad Task";
        setPendingSwap({
          kind: "promote-scratchpad",
          scratchpadId: cardId,
          title: firstLine,
        });
      }
    },
    [scratchpads, sendScratchpadToXActive],
  );

  const handleConfirmSwapOut = useCallback(
    (swapOutEntryId: string) => {
      if (!pendingSwap) return;
      if (pendingSwap.kind === "move-entry") {
        moveFocusItem(pendingSwap.entryId, "x-active", { swapOutEntryId });
      } else if (pendingSwap.kind === "promote-scratchpad") {
        sendScratchpadToXActive(pendingSwap.scratchpadId, swapOutEntryId);
      } else if (pendingSwap.kind === "create-xactive") {
        moveFocusItem(swapOutEntryId, "timeline");
        addFocusItem("x-active", pendingSwap.rawText);
        pushToast(`Swapped into X-Active: ${pendingSwap.title}`, "success");
      }
      setPendingSwap(null);
    },
    [
      pendingSwap,
      moveFocusItem,
      sendScratchpadToXActive,
      addFocusItem,
      pushToast,
    ],
  );

  const handleSaveTabModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tabModal || !tabModal.name.trim()) return;
    if (tabModal.mode === "create") {
      const created = addCustomTab(tabModal.name.trim(), tabModal.color);
      setActiveTab(created.id);
    } else if (tabModal.tab) {
      updateCustomTab(tabModal.tab.id, {
        name: tabModal.name.trim(),
        color: tabModal.color,
      });
    }
    setTabModal(null);
  };

  const handleQuickAddPinned = useCallback((): string => {
    const created = addScratchpad(scratchpads.length % 5);
    updateScratchpad(created.id, { pinned: true });
    return created.id;
  }, [addScratchpad, updateScratchpad, scratchpads.length]);

  const showActiveSection =
    mobileSection === "all" || mobileSection === "active";
  const showAnchorsSection =
    mobileSection === "all" || mobileSection === "anchors";
  const showDoneSection = mobileSection === "all" || mobileSection === "done";

  return (
    <div className="h-full flex-1 min-h-0 flex flex-col overflow-hidden overscroll-none lg:min-h-dvh lg:h-auto lg:overflow-visible">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-none lg:overflow-visible">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-0 pb-20 lg:pb-12 space-y-5">
          {/* Pinned Header + Shelf Tab Bar + Mobile Section Pills */}
          <header
            className="sticky top-0 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 pt-3 sm:pt-4 pb-3 border-b bg-[var(--bg-canvas)] space-y-2"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 pb-1">
              <div className="flex items-baseline gap-2.5 min-w-0">
                <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight">
                  Focus
                </h1>
                <span
                  className="text-xs font-mono tabular-nums truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {formatCompactDayHeading(todayKey)}
                </span>
              </div>

              <div
                className="hidden sm:flex items-center gap-2 text-xs font-mono tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                <span>
                  {xActiveTasks.length}/{xLimit} active
                </span>
                <span aria-hidden="true">·</span>
                <span>{anchors.length} anchors</span>
                <span aria-hidden="true">·</span>
                <span>{totalCompletedCount} done</span>
              </div>
            </div>

            {/* Clean horizontal top tab bar matching Library shelves */}
            <nav
              aria-label="Focus tabs"
              className="flex items-center gap-0.5 overflow-x-auto no-scrollbar border-b border-t bg-[var(--bg-canvas)] shrink-0"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              {/* Today */}
              <button
                type="button"
                onClick={() => setActiveTab("today")}
                className="h-10 px-3 inline-flex items-center gap-1.5 text-xs font-medium shrink-0 border-b-2 transition-colors whitespace-nowrap cursor-pointer"
                style={{
                  borderColor:
                    activeTab === "today" ? "var(--accent)" : "transparent",
                  color:
                    activeTab === "today"
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  backgroundColor:
                    activeTab === "today"
                      ? "var(--accent-soft)"
                      : "transparent",
                }}
              >
                <span
                  style={{
                    color:
                      activeTab === "today"
                        ? "var(--accent)"
                        : "var(--text-muted)",
                  }}
                >
                  <Target className="w-3.5 h-3.5 shrink-0" />
                </span>
                <span className={activeTab === "today" ? "font-semibold" : ""}>
                  Today
                </span>
                <span
                  className="font-mono tabular-nums text-[11px] opacity-75"
                  style={{
                    color:
                      activeTab === "today"
                        ? "var(--accent)"
                        : "var(--text-muted)",
                  }}
                >
                  {anchors.length + xActiveTasks.length}
                </span>
              </button>

              {/* Scratchpad */}
              <button
                type="button"
                onClick={() => setActiveTab("scratchpad")}
                className="h-10 px-3 inline-flex items-center gap-1.5 text-xs font-medium shrink-0 border-b-2 transition-colors whitespace-nowrap cursor-pointer"
                style={{
                  borderColor:
                    activeTab === "scratchpad"
                      ? "var(--accent)"
                      : "transparent",
                  color:
                    activeTab === "scratchpad"
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  backgroundColor:
                    activeTab === "scratchpad"
                      ? "var(--accent-soft)"
                      : "transparent",
                }}
              >
                <span
                  style={{
                    color:
                      activeTab === "scratchpad"
                        ? "var(--accent)"
                        : "var(--text-muted)",
                  }}
                >
                  <StickyNote className="w-3.5 h-3.5 shrink-0" />
                </span>
                <span
                  className={
                    activeTab === "scratchpad" ? "font-semibold" : ""
                  }
                >
                  Scratchpad
                </span>
                <span
                  className="font-mono tabular-nums text-[11px] opacity-75"
                  style={{
                    color:
                      activeTab === "scratchpad"
                        ? "var(--accent)"
                        : "var(--text-muted)",
                  }}
                >
                  {scratchpads.length}
                </span>
              </button>

              {/* Custom tabs */}
              {activeCustomTabs.map((ct) => {
                const active = activeTab === ct.id;
                const count = activeEntries.filter(
                  (e) =>
                    e.source === "custom-tab" &&
                    e.tabId === ct.id &&
                    !e.completed,
                ).length;
                return (
                  <button
                    key={ct.id}
                    type="button"
                    onClick={() => setActiveTab(ct.id)}
                    className="h-10 px-3 inline-flex items-center gap-1.5 text-xs font-medium shrink-0 border-b-2 transition-colors whitespace-nowrap cursor-pointer"
                    style={{
                      borderColor: active ? ct.color : "transparent",
                      color: active
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                      backgroundColor: active
                        ? "var(--accent-soft)"
                        : "transparent",
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: ct.color,
                        opacity: active ? 1 : 0.75,
                      }}
                    />
                    <span className={active ? "font-semibold" : ""}>
                      {ct.name}
                    </span>
                    <span
                      className="font-mono tabular-nums text-[11px] opacity-75"
                      style={{
                        color: active ? ct.color : "var(--text-muted)",
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}

              {/* + Tab */}
              <button
                type="button"
                onClick={() =>
                  setTabModal({
                    mode: "create",
                    name: "",
                    color:
                      TAB_COLORS[activeCustomTabs.length % TAB_COLORS.length],
                  })
                }
                className="h-8 ml-2 px-2.5 inline-flex items-center gap-1 text-xs font-medium rounded-lg shrink-0 whitespace-nowrap transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                title="New custom focus tab"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tab</span>
              </button>
            </nav>

            {/* Mobile section filter pills (under tabs when Today is active) */}
            {activeTab === "today" && (
              <div
                className="lg:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5"
                role="tablist"
                aria-label="Filter Today sections"
              >
                {(
                  [
                    { id: "all", label: "All" },
                    {
                      id: "anchors",
                      label: `Anchors · ${anchors.length}`,
                    },
                    {
                      id: "active",
                      label: `Active · ${xActiveTasks.length}/${xLimit}`,
                    },
                    { id: "done", label: `Done · ${totalCompletedCount}` },
                  ] as const
                ).map((pill) => {
                  const selected = mobileSection === pill.id;
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setMobileSection(pill.id)}
                      className="h-7 px-3 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                      style={{
                        backgroundColor: selected
                          ? "var(--accent-soft)"
                          : "var(--bg-surface)",
                        borderColor: selected
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                        color: selected
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                      }}
                    >
                      {pill.label}
                    </button>
                  );
                })}
              </div>
            )}
          </header>

          {/* ================= TODAY TAB ================= */}
          {activeTab === "today" && (
            <div className="space-y-5">
              {/* 1. Pinned Scratchpad Quick-Peek: always visible on desktop; on mobile in All when pinned stickies exist */}
              <div
                className={
                  mobileSection === "all" && pinnedScratchpads.length > 0
                    ? "block"
                    : "hidden lg:block"
                }
              >
                <PinnedScratchpadRail
                  pinnedCards={pinnedScratchpads}
                  isDark={isDark}
                  onUpdateScratchpad={updateScratchpad}
                  onPromoteToXActive={handlePromoteScratchpadToXActive}
                  onPromoteToTimeline={sendScratchpadToTimeline}
                  onQuickAddPinned={handleQuickAddPinned}
                />
              </div>

              {/* 2. Now Focusing Spotlight Banner (only when an item is pinned) */}
              {focusedEntry && (
                <FocusSpotlightBanner
                  entry={focusedEntry}
                  timeFormat={timeFormat}
                  onCompleteItem={(id) => {
                    toggleEntryCompleted(id);
                    setFocusedEntryId(null);
                  }}
                  onExitSpotlight={() => setFocusedEntryId(null)}
                  onOpenDetail={(entry) =>
                    onOpenDetail({ mode: "task", id: entry.id })
                  }
                  onTimerCompleteToast={(title) =>
                    pushToast(`Focus timer complete: ${title}`, "success")
                  }
                  audioPlayback={audioPlayback}
                  streamerPlayback={streamerPlayback}
                  onToggleAudioPlayback={onToggleAudioPlayback}
                  onToggleStreamerPlayback={onToggleStreamerPlayback}
                  onNavigateView={onNavigateView}
                />
              )}

              {/* 3. Desktop Capture Bar is sticky at the bottom to match Timeline View */}

              {/* Two-column cockpit on desktop, stacked on mobile */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(330px,0.85fr)] gap-6 items-start">
                {/* LEFT COLUMN: X-Active Max Tasks + Collapsible Completed Card */}
                <div className="space-y-6 min-w-0">
                  {/* 1. X-ACTIVE MAX TASKS */}
                  {showActiveSection && (
                    <section className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Target
                            className="w-4 h-4 shrink-0"
                            style={{ color: "var(--accent)" }}
                          />
                          <h2 className="font-display text-sm font-bold tracking-tight truncate">
                            X-Active Max Tasks
                          </h2>
                        </div>

                        {/* Thin segmented capacity bar + tabular counter */}
                        <div className="flex items-center gap-2.5 shrink-0">
                          <div
                            className="flex items-center gap-1"
                            aria-hidden="true"
                          >
                            {Array.from({ length: xLimit }).map((_, idx) => {
                              const filled = idx < xActiveTasks.length;
                              return (
                                <span
                                  key={idx}
                                  className="h-1.5 w-4 rounded-full transition-colors"
                                  style={{
                                    backgroundColor: filled
                                      ? atXCapacity
                                        ? "var(--warning)"
                                        : "var(--accent)"
                                      : "var(--border-strong)",
                                    opacity: filled ? 1 : 0.45,
                                  }}
                                />
                              );
                            })}
                          </div>
                          <span
                            className="text-xs font-mono tabular-nums font-semibold"
                            style={{
                              color: atXCapacity
                                ? "var(--warning)"
                                : "var(--text-secondary)",
                            }}
                          >
                            {xActiveTasks.length}/{xLimit}
                          </span>
                        </div>
                      </div>

                      {xActiveTasks.length > 0 ? (
                        <div
                          className="rounded-2xl border divide-y overflow-hidden"
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            borderColor: "var(--border-subtle)",
                          }}
                        >
                          {xActiveTasks.map((entry, idx) => {
                            const isBeingDragged = draggingXId === entry.id;
                            const isDropTarget =
                              xDropTarget?.entryId === entry.id;
                            const isFocused = focusedEntryId === entry.id;
                            const hasTags = entry.tags.length > 0;
                            const slotLabel = String(idx + 1).padStart(2, "0");

                            return (
                              <div
                                key={entry.id}
                                ref={(el) => {
                                  if (el) xRowRefs.current.set(entry.id, el);
                                  else xRowRefs.current.delete(entry.id);
                                }}
                                draggable={xActiveTasks.length > 1}
                                onDoubleClick={() =>
                                  onOpenDetail({ mode: "task", id: entry.id })
                                }
                                onDragStart={(e) => {
                                  if (
                                    e.target instanceof HTMLElement &&
                                    e.target.closest("input, textarea")
                                  ) {
                                    e.preventDefault();
                                    return;
                                  }
                                  e.dataTransfer.setData(
                                    "application/x-kanso-xactive-id",
                                    entry.id,
                                  );
                                  e.dataTransfer.effectAllowed = "move";
                                  activeDragXIdRef.current = entry.id;
                                  setDraggingXId(entry.id);
                                }}
                                onDragEnd={clearXDragState}
                                onDragOver={(e) => {
                                  if (
                                    !e.dataTransfer.types.includes(
                                      "application/x-kanso-xactive-id",
                                    )
                                  ) {
                                    return;
                                  }
                                  if (activeDragXIdRef.current === entry.id) {
                                    return;
                                  }
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = "move";
                                  const rect =
                                    e.currentTarget.getBoundingClientRect();
                                  const position: "before" | "after" =
                                    e.clientY < rect.top + rect.height / 2
                                      ? "before"
                                      : "after";
                                  setXDropTarget((prev) =>
                                    prev?.entryId === entry.id &&
                                    prev.position === position
                                      ? prev
                                      : { entryId: entry.id, position },
                                  );
                                }}
                                onDragLeave={(e) => {
                                  if (
                                    !e.currentTarget.contains(
                                      e.relatedTarget as Node,
                                    )
                                  ) {
                                    setXDropTarget((prev) =>
                                      prev?.entryId === entry.id ? null : prev,
                                    );
                                  }
                                }}
                                onDrop={(e) => {
                                  if (
                                    !e.dataTransfer.types.includes(
                                      "application/x-kanso-xactive-id",
                                    )
                                  ) {
                                    return;
                                  }
                                  const draggedId =
                                    e.dataTransfer.getData(
                                      "application/x-kanso-xactive-id",
                                    ) || activeDragXIdRef.current;
                                  const rect =
                                    e.currentTarget.getBoundingClientRect();
                                  const position: "before" | "after" =
                                    e.clientY < rect.top + rect.height / 2
                                      ? "before"
                                      : "after";
                                  clearXDragState();
                                  if (!draggedId || draggedId === entry.id) {
                                    return;
                                  }
                                  e.preventDefault();
                                  handleReorderXActive(
                                    draggedId,
                                    entry.id,
                                    position,
                                  );
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  onOpenContextMenu(
                                    { kind: "entry", entry },
                                    e,
                                  );
                                }}
                                className={`relative group flex items-center gap-2.5 px-3.5 ${
                                  hasTags || entry.scheduledAt ? "py-3" : "py-2.5"
                                } transition-colors hover:bg-[var(--bg-surface-subtle)] ${
                                  isBeingDragged
                                    ? "opacity-45 bg-[var(--accent-soft)]"
                                    : ""
                                }`}
                                style={{
                                  borderColor: "var(--border-subtle)",
                                  backgroundColor: isFocused
                                    ? "var(--accent-soft)"
                                    : undefined,
                                  boxShadow: isDropTarget
                                    ? xDropTarget.position === "before"
                                      ? "inset 0 2.5px 0 var(--accent)"
                                      : "inset 0 -2.5px 0 var(--accent)"
                                    : undefined,
                                }}
                              >
                                {/* Drag grip + Numbered Slot 01, 02, 03 */}
                                <div className="flex items-center gap-1 shrink-0">
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Reorder ${entry.title}`}
                                    title="Drag to reorder"
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => {
                                      if (e.pointerType === "mouse") return;
                                      if (xActiveTasks.length <= 1) return;
                                      e.stopPropagation();
                                      e.currentTarget.setPointerCapture(
                                        e.pointerId,
                                      );
                                      activeDragXIdRef.current = entry.id;
                                      setDraggingXId(entry.id);
                                      setXDropTarget(null);
                                    }}
                                    onPointerMove={(e) => {
                                      if (
                                        e.pointerType === "mouse" ||
                                        draggingXId !== entry.id
                                      ) {
                                        return;
                                      }
                                      setXDropTarget(
                                        resolveXTouchDrop(e.clientY, entry.id),
                                      );
                                    }}
                                    onPointerUp={(e) => {
                                      if (e.pointerType === "mouse") return;
                                      e.stopPropagation();
                                      if (draggingXId === entry.id) {
                                        const resolved =
                                          resolveXTouchDrop(
                                            e.clientY,
                                            entry.id,
                                          ) ?? xDropTarget;
                                        clearXDragState();
                                        if (
                                          resolved &&
                                          resolved.entryId !== entry.id
                                        ) {
                                          handleReorderXActive(
                                            entry.id,
                                            resolved.entryId,
                                            resolved.position,
                                          );
                                        }
                                      } else {
                                        clearXDragState();
                                      }
                                    }}
                                    onPointerCancel={clearXDragState}
                                    className="touch-none select-none w-5 h-6 -ml-1 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] active:text-[var(--accent)] cursor-grab active:cursor-grabbing shrink-0"
                                  >
                                    <GripVertical className="w-3.5 h-3.5" />
                                  </div>
                                  <span
                                    className="w-5 text-[11px] font-mono tabular-nums font-semibold"
                                    style={{
                                      color: isFocused
                                        ? "var(--accent)"
                                        : "var(--text-muted)",
                                    }}
                                  >
                                    {slotLabel}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleEntryCompleted(entry.id);
                                  }}
                                  className="h-5 w-5 flex items-center justify-center rounded-full shrink-0 transition-colors cursor-pointer"
                                  style={{ color: "var(--text-muted)" }}
                                  title="Mark complete"
                                  aria-label={`Complete ${entry.title}`}
                                >
                                  <Circle className="w-4.5 h-4.5" />
                                </button>

                                <div className="flex-1 min-w-0 space-y-0.5">
                                  <InlineTitleEdit
                                    value={entry.title}
                                    allowMobileEdit
                                    onCommit={(nextTitle) =>
                                      updateEntry(entry.id, {
                                        title: nextTitle,
                                      })
                                    }
                                    className="text-sm font-medium"
                                  />
                                  {(entry.scheduledAt || hasTags) && (
                                    <div
                                      className="flex flex-wrap items-center gap-x-1.5 text-xs font-mono tabular-nums"
                                      style={{ color: "var(--text-muted)" }}
                                    >
                                      {entry.scheduledAt && (
                                        <span>
                                          {formatTime(
                                            entry.scheduledAt,
                                            timeFormat,
                                          )}
                                        </span>
                                      )}
                                      {entry.scheduledAt && hasTags && (
                                        <span aria-hidden="true">·</span>
                                      )}
                                      {hasTags && (
                                        <span>
                                          {entry.tags
                                            .map((t) => `#${t}`)
                                            .join(" ")}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Subtle Focus Play + Context Menu */}
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFocusedEntryId((prev) =>
                                        prev === entry.id ? null : entry.id,
                                      );
                                    }}
                                    className={`h-7 w-7 flex items-center justify-center rounded-md transition-all cursor-pointer ${
                                      isFocused
                                        ? "opacity-100"
                                        : "sm:opacity-0 sm:group-hover:opacity-100"
                                    }`}
                                    style={{
                                      backgroundColor: isFocused
                                        ? "var(--accent-soft)"
                                        : "transparent",
                                      color: isFocused
                                        ? "var(--accent)"
                                        : "var(--text-muted)",
                                    }}
                                    title={
                                      isFocused
                                        ? "Exit spotlight"
                                        : "Focus on this task"
                                    }
                                    aria-label={
                                      isFocused
                                        ? `Stop focusing on ${entry.title}`
                                        : `Focus on ${entry.title}`
                                    }
                                  >
                                    <Play className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenContextMenu(
                                        { kind: "entry", entry },
                                        e,
                                      );
                                    }}
                                    className="h-7 w-7 flex items-center justify-center rounded-md sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                                    style={{ color: "var(--text-muted)" }}
                                    aria-label="More actions"
                                  >
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div
                          className="rounded-2xl border border-dashed px-4 py-6 text-center text-xs"
                          style={{
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-muted)",
                          }}
                        >
                          No active tasks queued. Add up to {xLimit} focused
                          tasks using the capture bar.
                        </div>
                      )}
                    </section>
                  )}

                  {/* 2. COLLAPSIBLE COMPLETED CARD BELOW X-ACTIVE */}
                  {showDoneSection && (
                    <section
                      className="rounded-2xl border overflow-hidden"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setCompletedPanelOpen((o) => !o)}
                        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                        aria-expanded={completedPanelOpen}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2
                            className="w-4 h-4 shrink-0"
                            style={{ color: "var(--success)" }}
                          />
                          <h2 className="font-display text-sm font-bold tracking-tight truncate">
                            Completed (Anchors &amp; Active Work)
                          </h2>
                          <span
                            className="text-xs font-mono tabular-nums shrink-0"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {totalCompletedCount}
                          </span>
                        </div>
                        {completedPanelOpen ? (
                          <ChevronDown
                            className="w-4 h-4 shrink-0"
                            style={{ color: "var(--text-muted)" }}
                          />
                        ) : (
                          <ChevronRight
                            className="w-4 h-4 shrink-0"
                            style={{ color: "var(--text-muted)" }}
                          />
                        )}
                      </button>

                      {completedPanelOpen && (
                        <div
                          className="border-t p-3 space-y-2.5"
                          style={{ borderColor: "var(--border-subtle)" }}
                        >
                          {completedByDay.length === 0 ? (
                            <p
                              className="py-3 text-center text-xs"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Completed anchors, finished tasks, and Done logs
                              will gather here.
                            </p>
                          ) : (
                            completedByDay.map(({ dayKey, items }) => {
                              const collapsed = Boolean(collapsedDays[dayKey]);
                              return (
                                <div
                                  key={dayKey}
                                  className="rounded-xl border overflow-hidden"
                                  style={{
                                    backgroundColor: "var(--bg-surface)",
                                    borderColor: "var(--border-subtle)",
                                  }}
                                >
                                  {/* Collapsible Day Strip */}
                                  <div
                                    className="flex items-center justify-between gap-2 px-3 py-2 border-b"
                                    style={{
                                      backgroundColor:
                                        "var(--bg-surface-subtle)",
                                      borderColor: collapsed
                                        ? "transparent"
                                        : "var(--border-subtle)",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setCollapsedDays((prev) => ({
                                          ...prev,
                                          [dayKey]: !prev[dayKey],
                                        }))
                                      }
                                      className="flex items-center gap-1.5 text-xs font-semibold min-w-0 cursor-pointer"
                                      style={{ color: "var(--text-secondary)" }}
                                    >
                                      {collapsed ? (
                                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                                      ) : (
                                        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                                      )}
                                      <span>
                                        {formatCompactDayHeading(dayKey)}
                                      </span>
                                      <span
                                        className="font-mono tabular-nums"
                                        style={{ color: "var(--text-muted)" }}
                                      >
                                        · {items.length}
                                      </span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        clearFocusDayFromView(dayKey)
                                      }
                                      className="px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors hover:bg-[rgba(217,119,6,0.14)] hover:text-[var(--warning)] cursor-pointer"
                                      style={{ color: "var(--text-muted)" }}
                                      title="Removes from Focus View while keeping entries in Timeline"
                                    >
                                      Clear from Focus View
                                    </button>
                                  </div>

                                  {!collapsed && (
                                    <div
                                      className="divide-y"
                                      style={{
                                        borderColor: "var(--border-subtle)",
                                      }}
                                    >
                                      {items.map((entry) => {
                                        const isLog = entry.type === "log";
                                        const ts =
                                          entry.completedAt || entry.createdAt;
                                        return (
                                          <div
                                            key={entry.id}
                                            onContextMenu={(e) => {
                                              e.preventDefault();
                                              onOpenContextMenu(
                                                { kind: "entry", entry },
                                                e,
                                              );
                                            }}
                                            onClick={() =>
                                              onOpenDetail({
                                                mode: isLog ? "log" : "task",
                                                id: entry.id,
                                              })
                                            }
                                            className="group flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]"
                                            style={{
                                              borderColor:
                                                "var(--border-subtle)",
                                            }}
                                          >
                                            {isLog ? (
                                              <span
                                                className="h-5 w-5 flex items-center justify-center shrink-0"
                                                aria-hidden="true"
                                              >
                                                <span
                                                  className="w-2 h-2 rounded-full"
                                                  style={{
                                                    backgroundColor:
                                                      "var(--accent)",
                                                  }}
                                                />
                                              </span>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  toggleEntryCompleted(
                                                    entry.id,
                                                  );
                                                }}
                                                className="h-5 w-5 flex items-center justify-center rounded-full shrink-0 cursor-pointer"
                                                style={{
                                                  color: "var(--success)",
                                                }}
                                                title="Reopen task"
                                                aria-label={`Reopen ${entry.title}`}
                                              >
                                                <CheckCircle2 className="w-4 h-4" />
                                              </button>
                                            )}

                                            <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2">
                                              <span
                                                className={`text-xs sm:text-sm truncate ${
                                                  isLog ? "" : "line-through"
                                                }`}
                                                style={{
                                                  color: isLog
                                                    ? "var(--text-secondary)"
                                                    : "var(--text-muted)",
                                                }}
                                              >
                                                {entry.title}
                                              </span>
                                              <span
                                                className="text-[11px] font-mono tabular-nums shrink-0"
                                                style={{
                                                  color: isLog
                                                    ? "var(--text-secondary)"
                                                    : "var(--success)",
                                                }}
                                              >
                                                {isLog
                                                  ? `At ${formatTime(ts, timeFormat)}`
                                                  : `Done ${formatTime(ts, timeFormat)}`}
                                              </span>
                                            </div>

                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                deleteEntry(entry.id);
                                              }}
                                              className="h-6 w-6 flex items-center justify-center rounded-md sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0 hover:bg-[var(--bg-surface)] cursor-pointer"
                                              style={{ color: "var(--danger)" }}
                                              title="Delete everywhere"
                                              aria-label="Delete everywhere"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </section>
                  )}
                </div>

                {/* RIGHT RAIL: Daily Anchors */}
                <div className="space-y-6 min-w-0">
                  {showAnchorsSection && (
                    <FocusAnchorsSection
                      anchors={anchors}
                      timeFormat={timeFormat}
                      focusedEntryId={focusedEntryId}
                      onToggleComplete={toggleEntryCompleted}
                      onUpdateTitle={(entryId, nextTitle) =>
                        updateEntry(entryId, { title: nextTitle })
                      }
                      onFocusEntry={(id) =>
                        setFocusedEntryId((prev) => (prev === id ? null : id))
                      }
                      onOpenDetail={onOpenDetail}
                      onOpenContextMenu={onOpenContextMenu}
                      onPrefillAnchorHour={(hour24) => {
                        setCapturePrefill({
                          nonce: Date.now(),
                          bucket: "anchor",
                          text:
                            hour24 !== null
                              ? `at ${formatPrefillHour(hour24, timeFormat)} `
                              : "",
                        });
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= SCRATCHPAD TAB ================= */}
          {activeTab === "scratchpad" && (
            <FocusScratchpadTab
              scratchpads={scratchpads}
              isDark={isDark}
              timeFormat={timeFormat}
              onAddScratchpad={(paletteIndex) => addScratchpad(paletteIndex)}
              onUpdateScratchpad={updateScratchpad}
              onDeleteScratchpad={deleteScratchpad}
              onReorderScratchpads={reorderScratchpads}
              onPromoteToTimeline={sendScratchpadToTimeline}
              onPromoteToXActive={handlePromoteScratchpadToXActive}
            />
          )}

          {/* ================= CUSTOM FOCUS TAB ================= */}
          {currentCustomTab && (
            <FocusCustomTab
              tab={currentCustomTab}
              activeEntries={customTabTasks.active}
              completedEntries={customTabTasks.completed}
              isDark={isDark}
              todayKey={todayKey}
              timeFormat={timeFormat}
              availableTags={allTags}
              onAddEntry={(raw) =>
                addFocusItem("custom-tab", raw, currentCustomTab.id)
              }
              onUpdateEntry={updateEntry}
              onToggleCompleted={toggleEntryCompleted}
              onReorderEntries={reorderNoteEntries}
              onMoveToXActive={handleMoveEntryToXActive}
              onOpenDetail={onOpenDetail}
              onOpenContextMenu={onOpenContextMenu}
              onEditTab={() =>
                setTabModal({
                  mode: "edit",
                  tab: currentCustomTab,
                  name: currentCustomTab.name,
                  color: currentCustomTab.color,
                })
              }
              onDeleteTab={() => deleteCustomTab(currentCustomTab.id)}
            />
          )}
        </div>
      </div>

      {/* Docked Mobile Bottom Capture Bar · Sticky Bottom Capture Bar on Desktop */}
      {activeTab === "today" && (
        <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 lg:border-t-0 lg:bg-transparent lg:sticky lg:bottom-4 lg:z-20 lg:px-8 lg:pb-4 lg:pt-0 lg:pointer-events-none">
          <div className="max-w-6xl mx-auto lg:pointer-events-auto">
            <FocusCaptureBar
              customTabs={activeCustomTabs}
              baseDateKey={todayKey}
              xActiveCount={xActiveTasks.length}
              xLimit={xLimit}
              availableTags={allTags}
              bucket={captureBucket}
              onBucketChange={setCaptureBucket}
              onSubmitItem={handleCaptureSubmit}
              previewPosition="top"
              compact
              elevated
              prefillSeed={capturePrefill}
            />
          </div>
        </div>
      )}

      {/* Custom Tab Create / Edit Modal */}
      {tabModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setTabModal(null)}
          />
          <form
            onSubmit={handleSaveTabModal}
            className="relative z-10 w-full max-w-sm rounded-2xl border p-5 space-y-4"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold">
                {tabModal.mode === "create"
                  ? "New Focus Tab"
                  : "Edit Focus Tab"}
              </h3>
              <button
                type="button"
                onClick={() => setTabModal(null)}
                className="h-7 w-7 flex items-center justify-center rounded-md cursor-pointer"
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
                Tab Name
              </label>
              <input
                type="text"
                value={tabModal.name}
                onChange={(e) =>
                  setTabModal({ ...tabModal, name: e.target.value })
                }
                placeholder="e.g. Deep Craft, Errands, Writing..."
                autoFocus
                className="w-full h-10 px-3 rounded-xl border text-sm outline-none"
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
                Accent Color
              </label>
              <div className="flex items-center gap-2">
                {TAB_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setTabModal({ ...tabModal, color: hex })}
                    className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
                    style={{ backgroundColor: hex }}
                  >
                    {tabModal.color === hex && (
                      <Check className="w-3.5 h-3.5 text-white" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setTabModal(null)}
                className="h-9 px-3.5 rounded-xl border text-xs font-medium cursor-pointer"
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
                disabled={!tabModal.name.trim()}
                className="h-9 px-4 rounded-xl text-xs font-semibold disabled:opacity-40 cursor-pointer"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                {tabModal.mode === "create" ? "Create Tab" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* X-Active Capacity Swap Modal */}
      <SwapXActiveModal
        open={pendingSwap !== null}
        incomingTitle={pendingSwap?.title ?? ""}
        xActiveTasks={xActiveTasks}
        xLimit={xLimit}
        onSelectSwapOut={handleConfirmSwapOut}
        onCancel={() => setPendingSwap(null)}
      />
    </div>
  );
};
