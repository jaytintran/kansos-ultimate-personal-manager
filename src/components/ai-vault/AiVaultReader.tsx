import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  ArrowDown,
  ArrowUp,
  Brain,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Download,
  ExternalLink,
  GripVertical,
  Link2,
  Maximize2,
  Merge,
  Minimize2,
  Network,
  PanelLeftOpen,
  Pencil,
  Plus,
  Scissors,
  SlidersHorizontal,
  Star,
  StickyNote,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { aiVaultDb, AI_VAULT_BODY_CHANGE_EVENT } from "../../lib/db";
import {
  buildSearchFieldsForChat,
  exportAiChatToMarkdown,
  stripHtmlToPlainText,
} from "../../lib/aiVaultParser";
import type {
  AiChatBodyRecord,
  AiChatFolder,
  AiChatRecord,
  AiConversationTurn,
  AiMarginAnnotation,
  AiMarginAnnotationColor,
  AiPlatform,
  AiTurnRole,
} from "../../types/aiVault";
import type { BookNoteLink, BookRecord, Entry } from "../../types";
import { TiptapEditor, TiptapThumbToolbar } from "../TiptapEditor";
import { AiTurnRenderer } from "./AiTurnRenderer";
import {
  DesktopAiVaultOutline,
  MobileAiVaultOutline,
  type AiOutlineItem,
  type AiOutlineMode,
} from "./AiVaultOutline";
import {
  AiVaultConnectionsPanel,
  type AiConnectionMode,
} from "./AiVaultConnectionsPanel";
import {
  AI_PLATFORM_LIST,
  AI_PLATFORM_META,
  HIGHLIGHT_COLORS,
  formatAiChatDate,
  removeAnnotationMarkFromHtml,
  updateAnnotationColorInHtml,
  wrapQuoteInHtmlWithMark,
} from "./aiVaultUiUtils";

export type AiReaderWidth = "normal" | "wide";
export type AiReaderFont = "sans" | "serif" | "mono";

interface AiVaultReaderProps {
  chat: AiChatRecord;
  folders: AiChatFolder[];
  allNotes: Entry[];
  allBooks: BookRecord[];
  sidebarCollapsedDesktop: boolean;
  connOpenDesktop: boolean;
  connMode: AiConnectionMode;
  outlineMode: AiOutlineMode;
  readerWidth: AiReaderWidth;
  readerFont: AiReaderFont;
  onExpandDesktopSidebar: () => void;
  onToggleConnDesktop: () => void;
  onConnModeChange: (mode: AiConnectionMode) => void;
  onToggleOutlineMode: () => void;
  onReaderWidthChange: (width: AiReaderWidth) => void;
  onReaderFontChange: (font: AiReaderFont) => void;
  onUpdateChatMeta: (
    chatId: string,
    patch: Partial<Omit<AiChatRecord, "id" | "createdAt">>,
  ) => void;
  onToggleNoteLink: (noteId: string) => void;
  onToggleBookLink: (bookId: string) => void;
  onDeleteChat: (chat: AiChatRecord) => void;
  onRequestRepopulate: (chat: AiChatRecord) => void;
  onJumpToNote?: (noteId: string) => void;
  onJumpToBookLocation?: (bookLink: BookNoteLink) => void;
  onNotify: (message: string, tone?: "success" | "error" | "neutral") => void;
}

function makeTurnId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function extractHeadingsFromTurnHtml(
  html: string,
): Array<{ level: number; text: string }> {
  if (!html || typeof DOMParser === "undefined") return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const list: Array<{ level: number; text: string }> = [];
    doc.body.querySelectorAll("h1, h2, h3").forEach((el) => {
      const level = Number(el.tagName.slice(1)) || 2;
      const text = (el.textContent || "").trim();
      if (text) list.push({ level, text });
    });
    return list;
  } catch {
    return [];
  }
}

export const AiVaultReader: React.FC<AiVaultReaderProps> = ({
  chat,
  folders,
  allNotes,
  allBooks,
  sidebarCollapsedDesktop,
  connOpenDesktop,
  connMode,
  outlineMode,
  readerWidth,
  readerFont,
  onExpandDesktopSidebar,
  onToggleConnDesktop,
  onConnModeChange,
  onToggleOutlineMode,
  onReaderWidthChange,
  onReaderFontChange,
  onUpdateChatMeta,
  onToggleNoteLink,
  onToggleBookLink,
  onDeleteChat,
  onRequestRepopulate,
  onJumpToNote,
  onJumpToBookLocation,
  onNotify,
}) => {
  const [body, setBody] = useState<AiChatBodyRecord | null>(null);
  const [bodyLoaded, setBodyLoaded] = useState(false);

  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [metaExpanded, setMetaExpanded] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [mobileConnOpen, setMobileConnOpen] = useState(false);
  const [mobileOutlineOpen, setMobileOutlineOpen] = useState(false);

  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<Record<string, boolean>>({});
  const [expandedSourcesIds, setExpandedSourcesIds] = useState<Record<string, boolean>>({});

  const [splitTargetTurnId, setSplitTargetTurnId] = useState<string | null>(null);
  const [splitAtLineIndex, setSplitAtLineIndex] = useState<number>(1);

  const [deletedTurnUndo, setDeletedTurnUndo] = useState<{
    turn: AiConversationTurn;
    index: number;
    annotations: AiMarginAnnotation[];
  } | null>(null);

  const [draggingTurnId, setDraggingTurnId] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [isScrolledDown, setIsScrolledDown] = useState(false);

  const loadBody = useCallback(async () => {
    const rec = await aiVaultDb.getBody(chat.id);
    setBody(rec);
    setBodyLoaded(true);
  }, [chat.id]);

  useEffect(() => {
    setBodyLoaded(false);
    setEditingTurnId(null);
    setActiveEditor(null);
    setDeletedTurnUndo(null);
    setSplitTargetTurnId(null);
    void loadBody();
  }, [chat.id, loadBody]);

  useEffect(() => {
    const handleBodyChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ chatId?: string }>).detail;
      if (!detail?.chatId || detail.chatId === chat.id) {
        void loadBody();
      }
    };
    window.addEventListener(AI_VAULT_BODY_CHANGE_EVENT, handleBodyChanged);
    return () =>
      window.removeEventListener(AI_VAULT_BODY_CHANGE_EVENT, handleBodyChanged);
  }, [chat.id, loadBody]);

  const persistBody = useCallback(
    (
      nextTurns: AiConversationTurn[],
      nextAnnotations: AiMarginAnnotation[],
      syncMeta = true,
    ) => {
      const searchFields = buildSearchFieldsForChat(nextTurns, nextAnnotations);
      const nextBody: AiChatBodyRecord = {
        chatId: chat.id,
        turns: nextTurns,
        annotations: nextAnnotations,
        searchText: searchFields.searchText,
        searchPromptText: searchFields.searchPromptText,
        searchReplyText: searchFields.searchReplyText,
        updatedAt: new Date().toISOString(),
      };
      setBody(nextBody);
      void aiVaultDb.saveBody(nextBody);
      if (syncMeta) {
        onUpdateChatMeta(chat.id, {
          turnCount: nextTurns.length,
          annotationCount: nextAnnotations.length,
          hasCode: searchFields.hasCode,
          previewPrompt: searchFields.previewPrompt,
        });
      }
    },
    [chat.id, onUpdateChatMeta],
  );

  const turns = useMemo(() => body?.turns || [], [body?.turns]);
  const annotations = useMemo(
    () => body?.annotations || [],
    [body?.annotations],
  );

  const annotationsByTurn = useMemo(() => {
    const map = new Map<string, AiMarginAnnotation[]>();
    for (const ann of annotations) {
      const list = map.get(ann.turnId) || [];
      list.push(ann);
      map.set(ann.turnId, list);
    }
    return map;
  }, [annotations]);

  const outlineItems = useMemo<AiOutlineItem[]>(() => {
    const items: AiOutlineItem[] = [];
    let qCount = 0;
    let aCount = 0;
    let nCount = 0;

    for (const turn of turns) {
      let badge = "T";
      if (turn.role === "user") {
        qCount += 1;
        badge = `Q${qCount}`;
      } else if (turn.role === "assistant") {
        aCount += 1;
        badge = `A${aCount}`;
      } else {
        nCount += 1;
        badge = `N${nCount}`;
      }
      const plain = stripHtmlToPlainText(turn.contentHtml);
      const turnLabel =
        plain.slice(0, 62) || (turn.role === "user" ? "Prompt" : "AI Reply");

      items.push({
        id: turn.id,
        kind: "turn",
        turnId: turn.id,
        turnRole: turn.role,
        badge,
        label: turnLabel,
        depth: 0,
      });

      if (!turn.collapsed && turn.role === "assistant") {
        const headings = extractHeadingsFromTurnHtml(turn.contentHtml);
        headings.forEach((h, hIdx) => {
          items.push({
            id: `${turn.id}::h${hIdx}`,
            kind: "heading",
            turnId: turn.id,
            badge: `H${h.level}`,
            label: h.text,
            depth: Math.min(3, Math.max(1, h.level)),
          });
        });
      }
    }
    return items;
  }, [turns]);

  useEffect(() => {
    const scroller = scrollContainerRef.current;
    if (!scroller) return;

    const handleScroll = () => {
      setIsScrolledDown(scroller.scrollTop > 120);
      const topThreshold = scroller.getBoundingClientRect().top + 130;
      const targets = scroller.querySelectorAll<HTMLElement>(
        "[data-ai-turn-id], [data-ai-heading-id]",
      );
      let currentId: string | null = outlineItems[0]?.id ?? null;
      targets.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top <= topThreshold) {
          currentId =
            el.getAttribute("data-ai-heading-id") ||
            el.getAttribute("data-ai-turn-id") ||
            currentId;
        }
      });
      setActiveOutlineId(currentId);
    };

    handleScroll();
    scroller.addEventListener("scroll", handleScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", handleScroll);
  }, [outlineItems]);

  const jumpToOutlineItem = (item: AiOutlineItem) => {
    const scroller = scrollContainerRef.current;
    if (!scroller) return;
    const selector =
      item.kind === "heading"
        ? `[data-ai-heading-id="${item.id}"]`
        : `[data-ai-turn-id="${item.turnId}"]`;
    const el = scroller.querySelector<HTMLElement>(selector);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveOutlineId(item.id);
    }
  };

  const jumpToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const updateTurn = (turnId: string, patch: Partial<AiConversationTurn>) => {
    const nextTurns = turns.map((t) =>
      t.id === turnId ? { ...t, ...patch } : t,
    );
    persistBody(nextTurns, annotations);
  };

  const toggleAllCollapsed = (
    mode: "expand" | "collapse-all" | "collapse-prompts",
  ) => {
    const nextTurns = turns.map((t) => {
      if (mode === "expand") return { ...t, collapsed: false };
      if (mode === "collapse-all") return { ...t, collapsed: true };
      return t.role === "user" ? { ...t, collapsed: true } : t;
    });
    persistBody(nextTurns, annotations, false);
  };

  const moveTurn = (turnId: string, direction: -1 | 1) => {
    const idx = turns.findIndex((t) => t.id === turnId);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= turns.length) return;
    const copy = [...turns];
    const [removed] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, removed);
    persistBody(copy, annotations);
  };

  const reorderTurnDrag = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const fromIdx = turns.findIndex((t) => t.id === draggedId);
    const toIdx = turns.findIndex((t) => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const copy = [...turns];
    const [removed] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, removed);
    persistBody(copy, annotations);
  };

  const insertTurnAfter = (afterTurnId: string | null, role: AiTurnRole) => {
    const newTurn: AiConversationTurn = {
      id: makeTurnId(),
      role,
      contentHtml: "<p></p>",
      createdAt: new Date().toISOString(),
    };
    const nextTurns = [...turns];
    if (!afterTurnId) {
      nextTurns.push(newTurn);
    } else {
      const idx = nextTurns.findIndex((t) => t.id === afterTurnId);
      nextTurns.splice(idx === -1 ? nextTurns.length : idx + 1, 0, newTurn);
    }
    persistBody(nextTurns, annotations);
    setEditingTurnId(newTurn.id);
  };

  const mergeWithNextTurn = (turnId: string) => {
    const idx = turns.findIndex((t) => t.id === turnId);
    if (idx === -1 || idx >= turns.length - 1) return;
    const cur = turns[idx];
    const next = turns[idx + 1];
    const mergedHtml = `${cur.contentHtml || ""}\n${next.contentHtml || ""}`;
    const mergedThinking =
      [cur.thinkingText, next.thinkingText].filter(Boolean).join("\n\n") ||
      undefined;
    const mergedSources = [...(cur.sources || []), ...(next.sources || [])];

    const updatedTurn: AiConversationTurn = {
      ...cur,
      contentHtml: mergedHtml,
      thinkingText: mergedThinking,
      sources: mergedSources.length > 0 ? mergedSources : undefined,
    };
    const nextTurns = [
      ...turns.slice(0, idx),
      updatedTurn,
      ...turns.slice(idx + 2),
    ];
    const nextAnnotations = annotations.map((a) =>
      a.turnId === next.id ? { ...a, turnId: cur.id } : a,
    );
    persistBody(nextTurns, nextAnnotations);
    onNotify("Merged turn with next block", "success");
  };

  const deleteTurn = (turnId: string) => {
    const idx = turns.findIndex((t) => t.id === turnId);
    if (idx === -1) return;
    const target = turns[idx];
    const removedAnns = annotations.filter((a) => a.turnId === turnId);
    setDeletedTurnUndo({ turn: target, index: idx, annotations: removedAnns });
    if (editingTurnId === turnId) {
      setEditingTurnId(null);
      setActiveEditor(null);
    }
    persistBody(
      turns.filter((t) => t.id !== turnId),
      annotations.filter((a) => a.turnId !== turnId),
    );
  };

  const undoDeleteTurn = () => {
    if (!deletedTurnUndo) return;
    const copy = [...turns];
    copy.splice(
      Math.min(deletedTurnUndo.index, copy.length),
      0,
      deletedTurnUndo.turn,
    );
    persistBody(copy, [...annotations, ...deletedTurnUndo.annotations]);
    setDeletedTurnUndo(null);
  };

  const getSplitBlocks = (html: string): string[] => {
    if (!html || typeof DOMParser === "undefined") return [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const blocks = Array.from(doc.body.children).map((el) => el.outerHTML);
    if (blocks.length > 1) return blocks;
    const text = stripHtmlToPlainText(html);
    const lines = text.split(/\n+/).filter(Boolean);
    return lines.map((l) => `<p>${l}</p>`);
  };

  const confirmSplitTurn = (turnId: string, splitIdx: number) => {
    const idx = turns.findIndex((t) => t.id === turnId);
    if (idx === -1) return;
    const turn = turns[idx];
    const blocks = getSplitBlocks(turn.contentHtml);
    if (blocks.length < 2) return;
    const clamped = Math.max(1, Math.min(blocks.length - 1, splitIdx));
    const firstHtml = blocks.slice(0, clamped).join("");
    const secondHtml = blocks.slice(clamped).join("");

    const firstTurn: AiConversationTurn = {
      ...turn,
      contentHtml: firstHtml,
    };
    const secondTurn: AiConversationTurn = {
      id: makeTurnId(),
      role: turn.role,
      contentHtml: secondHtml,
      createdAt: new Date().toISOString(),
    };
    const nextTurns = [
      ...turns.slice(0, idx),
      firstTurn,
      secondTurn,
      ...turns.slice(idx + 1),
    ];
    persistBody(nextTurns, annotations);
    setSplitTargetTurnId(null);
    onNotify("Turn split cleanly into two blocks", "success");
  };

  const createMarginAnnotation = (
    turnId: string,
    quoteText: string,
    color: AiMarginAnnotationColor,
    applyInEditor?: (annotationId: string, color: AiMarginAnnotationColor) => void,
  ) => {
    const id = makeTurnId();
    const now = new Date().toISOString();
    const newAnn: AiMarginAnnotation = {
      id,
      turnId,
      quoteText: quoteText.slice(0, 220),
      comment: "",
      color,
      createdAt: now,
      updatedAt: now,
    };

    let nextTurns = turns;
    if (applyInEditor) {
      applyInEditor(id, color);
    } else {
      nextTurns = turns.map((t) =>
        t.id === turnId
          ? {
              ...t,
              contentHtml: wrapQuoteInHtmlWithMark(
                t.contentHtml,
                quoteText,
                id,
                color,
              ),
            }
          : t,
      );
    }

    persistBody(nextTurns, [...annotations, newAnn]);
    setActiveAnnotationId(id);
    setEditingAnnotationId(id);
  };

  const updateAnnotation = (
    annId: string,
    patch: Partial<AiMarginAnnotation>,
  ) => {
    const target = annotations.find((a) => a.id === annId);
    if (!target) return;
    const nextAnnotations = annotations.map((a) =>
      a.id === annId
        ? { ...a, ...patch, updatedAt: new Date().toISOString() }
        : a,
    );
    let nextTurns = turns;
    if (patch.color && patch.color !== target.color) {
      nextTurns = turns.map((t) =>
        t.id === target.turnId
          ? {
              ...t,
              contentHtml: updateAnnotationColorInHtml(
                t.contentHtml,
                annId,
                patch.color!,
              ),
            }
          : t,
      );
    }
    persistBody(nextTurns, nextAnnotations);
  };

  const deleteAnnotation = (annId: string) => {
    const target = annotations.find((a) => a.id === annId);
    if (!target) return;
    const nextTurns = turns.map((t) =>
      t.id === target.turnId
        ? {
            ...t,
            contentHtml: removeAnnotationMarkFromHtml(t.contentHtml, annId),
          }
        : t,
    );
    persistBody(
      nextTurns,
      annotations.filter((a) => a.id !== annId),
    );
    if (activeAnnotationId === annId) setActiveAnnotationId(null);
    if (editingAnnotationId === annId) setEditingAnnotationId(null);
  };

  const handleExportMarkdown = () => {
    const md = exportAiChatToMarkdown(chat, turns, annotations);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(chat.title || "ai-chat").replace(/[^\w.-]+/g, "_")}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const payload = {
      format: "kanso-ai-vault-v1",
      exportedAt: new Date().toISOString(),
      items: [
        {
          meta: chat,
          body: body ?? {
            chatId: chat.id,
            turns,
            annotations,
            searchText: "",
            updatedAt: new Date().toISOString(),
          },
        },
      ],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(chat.title || "ai-chat").replace(/[^\w.-]+/g, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const platformInfo = AI_PLATFORM_META[chat.platform] || AI_PLATFORM_META.other;
  const linkedCount =
    (chat.linkedNoteIds?.length || 0) + (chat.linkedBookIds?.length || 0);
  const fontFamilyStyle =
    readerFont === "serif"
      ? "var(--font-serif, Georgia, serif)"
      : readerFont === "mono"
        ? "var(--kanso-font-mono, ui-monospace, monospace)"
        : "inherit";

  const showSideMarginsDesktop =
    !connOpenDesktop && annotations.length > 0 && readerWidth === "wide";

  let qNum = 0;
  let aNum = 0;
  let nNum = 0;

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden relative">
        {/* Compact Reader Header Bar */}
        <div
          className="h-12 px-3 sm:px-5 border-b flex items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {sidebarCollapsedDesktop && (
              <button
                type="button"
                onClick={onExpandDesktopSidebar}
                title="Show AI Vault sidebar"
                aria-label="Show AI Vault sidebar"
                className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg border hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
                style={{
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                onUpdateChatMeta(chat.id, { favorite: !chat.favorite })
              }
              title={chat.favorite ? "Remove favorite" : "Mark favorite"}
              aria-label="Toggle favorite"
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
            >
              <Star
                className={`w-4 h-4 ${
                  chat.favorite ? "fill-amber-400 text-amber-400" : ""
                }`}
                style={{ color: chat.favorite ? undefined : "var(--text-muted)" }}
              />
            </button>

            <span
              className="inline-flex items-center gap-1.5 text-xs font-medium shrink-0"
              style={{ color: "var(--text-secondary)" }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: platformInfo.dotColor }}
              />
              <span className="hidden sm:inline">
                {chat.model || platformInfo.label}
              </span>
            </span>

            {chat.sourceUrl && (
              <a
                href={chat.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open original thread: ${chat.sourceUrl}`}
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] shrink-0"
                style={{ color: "var(--text-muted)" }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                onReaderWidthChange(readerWidth === "normal" ? "wide" : "normal")
              }
              title={
                readerWidth === "wide"
                  ? "Switch to focused 740px reading width"
                  : "Switch to wide reading canvas"
              }
              className="hidden md:inline-flex h-7 px-2 rounded-lg border text-[11px] font-medium items-center gap-1 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              {readerWidth === "wide" ? (
                <Minimize2 className="w-3 h-3" />
              ) : (
                <Maximize2 className="w-3 h-3" />
              )}
              <span>{readerWidth === "wide" ? "Wide" : "Normal"}</span>
            </button>

            <div
              className="hidden sm:inline-flex items-center p-0.5 rounded-lg border"
              style={{
                backgroundColor: "var(--bg-surface-subtle)",
                borderColor: "var(--border-subtle)",
              }}
            >
              {(["sans", "serif", "mono"] as AiReaderFont[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onReaderFontChange(f)}
                  className="px-2 py-0.5 rounded text-[11px] font-medium capitalize cursor-pointer"
                  style={{
                    backgroundColor:
                      readerFont === f ? "var(--bg-surface)" : "transparent",
                    color:
                      readerFont === f ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>

            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const anyExpanded = turns.some((t) => !t.collapsed);
                  toggleAllCollapsed(anyExpanded ? "collapse-prompts" : "expand");
                }}
                title="Collapse all prompts / Expand all turns"
                className="hidden sm:inline-flex h-7 px-2 rounded-lg border text-[11px] font-medium items-center gap-1 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                <ChevronsDownUp className="w-3 h-3" />
                <span className="hidden xl:inline">Prompts</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setMetaExpanded((v) => !v)}
              title="Edit conversation metadata"
              className="h-7 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                backgroundColor: metaExpanded
                  ? "var(--accent-soft)"
                  : "transparent",
                borderColor: metaExpanded
                  ? "var(--accent)"
                  : "var(--border-subtle)",
                color: metaExpanded
                  ? "var(--accent)"
                  : "var(--text-secondary)",
              }}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span className="hidden md:inline">Details</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.innerWidth < 1024) {
                  setMobileConnOpen(true);
                } else {
                  onToggleConnDesktop();
                }
              }}
              className="h-7 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                backgroundColor: connOpenDesktop
                  ? "var(--accent-soft)"
                  : "transparent",
                borderColor: connOpenDesktop
                  ? "var(--accent)"
                  : "var(--border-subtle)",
                color: connOpenDesktop
                  ? "var(--accent)"
                  : "var(--text-secondary)",
              }}
              title="Toggle Notes & Books connections"
            >
              <Network className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Connections</span>
              {linkedCount > 0 && (
                <span className="font-mono tabular-nums text-[10px]">
                  {linkedCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportMarkdown}
              title="Export Markdown"
              className="hidden sm:flex h-7 w-7 items-center justify-center rounded-lg border hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onDeleteChat(chat)}
              title="Delete AI chat"
              aria-label="Delete AI chat"
              className="h-7 w-7 flex items-center justify-center rounded-lg border hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--danger)",
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Scrollable Editorial Reader Canvas + Floating Right Outline */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 lg:px-8 py-5 relative"
        >
          <div className="flex items-start justify-center gap-4">
            <div
              className={`w-full transition-[max-width] duration-200 ${
                readerWidth === "wide" ? "max-w-[1040px]" : "max-w-[740px]"
              }`}
              style={{ fontFamily: fontFamilyStyle }}
            >
              <MobileAiVaultOutline
                items={outlineItems}
                activeItemId={activeOutlineId}
                isScrolledDown={isScrolledDown}
                drawerOpen={mobileOutlineOpen}
                onOpenDrawer={() => setMobileOutlineOpen(true)}
                onCloseDrawer={() => setMobileOutlineOpen(false)}
                onJumpToItem={jumpToOutlineItem}
                onJumpToTop={jumpToTop}
              />

              {/* Title + Quiet Metadata */}
              <div className="mb-5 space-y-2.5">
                <input
                  type="text"
                  value={chat.title}
                  onChange={(e) =>
                    onUpdateChatMeta(chat.id, { title: e.target.value })
                  }
                  placeholder="Untitled AI Chat"
                  className="w-full bg-transparent font-display text-2xl sm:text-[28px] font-semibold tracking-tight outline-none"
                  style={{ color: "var(--text-primary)" }}
                />

                <div
                  className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  <span
                    className="inline-flex items-center gap-1.5 font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: platformInfo.dotColor }}
                    />
                    <span>{platformInfo.label}</span>
                  </span>
                  {chat.model && (
                    <>
                      <span>·</span>
                      <span className="font-mono">{chat.model}</span>
                    </>
                  )}
                  {chat.chatDate && (
                    <>
                      <span>·</span>
                      <span className="font-mono tabular-nums">
                        {formatAiChatDate(chat.chatDate)}
                      </span>
                    </>
                  )}
                  {chat.topic && (
                    <>
                      <span>·</span>
                      <span>{chat.topic}</span>
                    </>
                  )}
                  <span>·</span>
                  <span className="font-mono tabular-nums">
                    {turns.length} turns
                  </span>
                  {annotations.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="font-mono tabular-nums">
                        {annotations.length} notes
                      </span>
                    </>
                  )}
                  {chat.tags.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="font-mono">
                        {chat.tags.map((t) => `#${t}`).join(" ")}
                      </span>
                    </>
                  )}
                </div>

                {/* Expandable Metadata Inspector */}
                {metaExpanded && (
                  <div
                    className="rounded-xl border p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <div>
                      <label className="block text-[10.5px] mb-1" style={{ color: "var(--text-muted)" }}>
                        Platform
                      </label>
                      <select
                        value={chat.platform}
                        onChange={(e) =>
                          onUpdateChatMeta(chat.id, {
                            platform: e.target.value as AiPlatform,
                          })
                        }
                        className="w-full h-8 px-2 rounded-lg border text-xs outline-none"
                        style={{
                          backgroundColor: "var(--bg-canvas)",
                          borderColor: "var(--border-subtle)",
                        }}
                      >
                        {AI_PLATFORM_LIST.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10.5px] mb-1" style={{ color: "var(--text-muted)" }}>
                        Model
                      </label>
                      <input
                        type="text"
                        value={chat.model}
                        onChange={(e) =>
                          onUpdateChatMeta(chat.id, { model: e.target.value })
                        }
                        className="w-full h-8 px-2 rounded-lg border text-xs outline-none"
                        style={{
                          backgroundColor: "var(--bg-canvas)",
                          borderColor: "var(--border-subtle)",
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] mb-1" style={{ color: "var(--text-muted)" }}>
                        Topic
                      </label>
                      <input
                        type="text"
                        value={chat.topic || ""}
                        onChange={(e) =>
                          onUpdateChatMeta(chat.id, { topic: e.target.value })
                        }
                        placeholder="Add topic..."
                        className="w-full h-8 px-2 rounded-lg border text-xs outline-none"
                        style={{
                          backgroundColor: "var(--bg-canvas)",
                          borderColor: "var(--border-subtle)",
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] mb-1" style={{ color: "var(--text-muted)" }}>
                        Folder
                      </label>
                      <select
                        value={chat.folderId || ""}
                        onChange={(e) =>
                          onUpdateChatMeta(chat.id, {
                            folderId: e.target.value || null,
                          })
                        }
                        className="w-full h-8 px-2 rounded-lg border text-xs outline-none"
                        style={{
                          backgroundColor: "var(--bg-canvas)",
                          borderColor: "var(--border-subtle)",
                        }}
                      >
                        <option value="">Unfiled</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10.5px] mb-1" style={{ color: "var(--text-muted)" }}>
                        Chat Date
                      </label>
                      <input
                        type="date"
                        value={chat.chatDate || ""}
                        onChange={(e) =>
                          onUpdateChatMeta(chat.id, {
                            chatDate: e.target.value || null,
                          })
                        }
                        className="w-full h-8 px-2 rounded-lg border text-xs outline-none"
                        style={{
                          backgroundColor: "var(--bg-canvas)",
                          borderColor: "var(--border-subtle)",
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] mb-1" style={{ color: "var(--text-muted)" }}>
                        Source URL
                      </label>
                      <input
                        type="url"
                        value={chat.sourceUrl || ""}
                        onChange={(e) =>
                          onUpdateChatMeta(chat.id, { sourceUrl: e.target.value })
                        }
                        placeholder="https://..."
                        className="w-full h-8 px-2 rounded-lg border text-xs font-mono outline-none"
                        style={{
                          backgroundColor: "var(--bg-canvas)",
                          borderColor: "var(--border-subtle)",
                        }}
                      />
                    </div>

                    <div
                      className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-2 pt-1 border-t"
                      style={{ borderColor: "var(--border-subtle)" }}
                    >
                      <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                        Tags:
                      </span>
                      {chat.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() =>
                            onUpdateChatMeta(chat.id, {
                              tags: chat.tags.filter((t) => t !== tag),
                            })
                          }
                          title="Click to remove tag"
                          className="text-xs font-mono hover:line-through cursor-pointer"
                          style={{ color: "var(--accent)" }}
                        >
                          #{tag}
                        </button>
                      ))}
                      <input
                        type="text"
                        value={tagDraft}
                        onChange={(e) => setTagDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            const clean = tagDraft.trim().replace(/^#/, "");
                            if (clean && !chat.tags.includes(clean)) {
                              onUpdateChatMeta(chat.id, {
                                tags: [...chat.tags, clean],
                              });
                            }
                            setTagDraft("");
                          }
                        }}
                        placeholder="+ Add tag (Enter)"
                        className="h-6 px-2 rounded border text-[11px] bg-transparent outline-none"
                        style={{ borderColor: "var(--border-subtle)" }}
                      />
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleExportJson}
                          className="text-[11px] hover:underline cursor-pointer"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Export JSON Backup
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Undo Turn Delete Banner */}
              {deletedTurnUndo && (
                <div
                  className="mb-4 rounded-xl border px-3 py-2 flex items-center justify-between gap-3 text-xs"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--accent)",
                  }}
                >
                  <span>Turn removed from conversation.</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={undoDeleteTurn}
                      className="font-semibold inline-flex items-center gap-1 cursor-pointer"
                      style={{ color: "var(--accent)" }}
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Undo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletedTurnUndo(null)}
                      className="text-[11px] cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* Local-First Sync Recovery State */}
              {bodyLoaded && turns.length === 0 && (
                <div
                  className="rounded-xl border p-6 text-center space-y-3 mb-6"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <Brain
                    className="w-7 h-7 mx-auto opacity-65"
                    style={{ color: "var(--accent)" }}
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">
                      Transcript stored locally on another device
                    </p>
                    <p
                      className="text-xs max-w-md mx-auto leading-relaxed"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Kanso syncs AI Vault metadata, folders, and links cleanly while keeping heavy conversation transcripts local per device. Paste or import a `.md` / `.json` copy to restore it here.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => onRequestRepopulate(chat)}
                      className="h-8 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      style={{
                        backgroundColor: "var(--accent)",
                        color: "var(--accent-fg)",
                      }}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Paste or Import Transcript</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => insertTurnAfter(null, "user")}
                      className="h-8 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Start Fresh Turn</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Editorial Multi-Turn Thread */}
              <div className="space-y-4 pb-16">
                {turns.map((turn, idx) => {
                  const isUser = turn.role === "user";
                  const isPersonalNote = turn.role === "note";
                  const isEditing = editingTurnId === turn.id;
                  const turnAnns = annotationsByTurn.get(turn.id) || [];

                  let roleBadge = "";
                  let roleLabel = "";
                  if (isUser) {
                    qNum += 1;
                    roleBadge = `Q${qNum}`;
                    roleLabel = "You";
                  } else if (turn.role === "assistant") {
                    aNum += 1;
                    roleBadge = `A${aNum}`;
                    roleLabel = chat.model || platformInfo.label;
                  } else {
                    nNum += 1;
                    roleBadge = `N${nNum}`;
                    roleLabel = "Personal Note";
                  }

                  const splitBlocks =
                    splitTargetTurnId === turn.id
                      ? getSplitBlocks(turn.contentHtml)
                      : [];

                  const turnCard = (
                    <article
                      data-ai-turn-id={turn.id}
                      draggable={!isEditing}
                      onDragStart={(e) => {
                        if (isEditing) return;
                        e.dataTransfer.setData("text/plain", turn.id);
                        setDraggingTurnId(turn.id);
                      }}
                      onDragEnd={() => setDraggingTurnId(null)}
                      onDragOver={(e) => {
                        if (draggingTurnId && draggingTurnId !== turn.id) {
                          e.preventDefault();
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggingTurnId && draggingTurnId !== turn.id) {
                          reorderTurnDrag(draggingTurnId, turn.id);
                        }
                        setDraggingTurnId(null);
                      }}
                      className={`group rounded-xl transition-colors ${
                        isUser || isPersonalNote ? "border p-4" : "py-2 px-1"
                      }`}
                      style={{
                        backgroundColor: isUser
                          ? "var(--bg-surface-subtle)"
                          : isPersonalNote
                            ? "color-mix(in srgb, var(--accent-soft) 45%, var(--bg-surface))"
                            : "transparent",
                        borderColor:
                          isUser || isPersonalNote
                            ? "var(--border-subtle)"
                            : "transparent",
                        opacity: draggingTurnId === turn.id ? 0.55 : 1,
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            title="Drag to reorder turn"
                            className="hidden sm:inline-flex items-center opacity-0 group-hover:opacity-65 cursor-grab"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              updateTurn(turn.id, { collapsed: !turn.collapsed })
                            }
                            title={turn.collapsed ? "Expand turn" : "Collapse turn"}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                            style={{
                              color: isUser || isPersonalNote
                                ? "var(--accent)"
                                : "var(--text-primary)",
                            }}
                          >
                            {turn.collapsed ? (
                              <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                            )}
                            <span className="font-mono text-[11px] opacity-80">
                              {roleBadge}
                            </span>
                            <span>·</span>
                            <span>{roleLabel}</span>
                          </button>

                          {turn.collapsed && (
                            <span
                              className="text-xs truncate max-w-[260px] sm:max-w-[380px]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {stripHtmlToPlainText(turn.contentHtml)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingTurnId((prev) =>
                                prev === turn.id ? null : turn.id,
                              )
                            }
                            className="h-6 px-2 rounded-md text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                            style={{
                              backgroundColor: isEditing
                                ? "var(--accent-soft)"
                                : "transparent",
                              color: isEditing
                                ? "var(--accent)"
                                : "var(--text-secondary)",
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                            <span>{isEditing ? "Done" : "Edit"}</span>
                          </button>

                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveTurn(turn.id, -1)}
                            title="Move up"
                            className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] disabled:opacity-30 cursor-pointer"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === turns.length - 1}
                            onClick={() => moveTurn(turn.id, 1)}
                            title="Move down"
                            className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] disabled:opacity-30 cursor-pointer"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSplitTargetTurnId((prev) =>
                                prev === turn.id ? null : turn.id,
                              );
                              setSplitAtLineIndex(1);
                            }}
                            title="Split turn into two blocks"
                            className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <Scissors className="w-3 h-3" />
                          </button>

                          {idx < turns.length - 1 && (
                            <button
                              type="button"
                              onClick={() => mergeWithNextTurn(turn.id)}
                              title="Merge with next turn"
                              className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                              style={{ color: "var(--text-muted)" }}
                            >
                              <Merge className="w-3 h-3" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => insertTurnAfter(turn.id, "note")}
                            title="Insert personal note below"
                            className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <StickyNote className="w-3 h-3" />
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteTurn(turn.id)}
                            title="Delete turn"
                            className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                            style={{ color: "var(--danger)" }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {splitTargetTurnId === turn.id && (
                        <div
                          className="mb-3 rounded-lg border p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            borderColor: "var(--accent)",
                          }}
                        >
                          {splitBlocks.length < 2 ? (
                            <span style={{ color: "var(--text-muted)" }}>
                              Add a line break or second paragraph inside this turn to split it.
                            </span>
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">Split after block:</span>
                                <select
                                  value={splitAtLineIndex}
                                  onChange={(e) =>
                                    setSplitAtLineIndex(Number(e.target.value))
                                  }
                                  className="h-7 px-2 rounded border text-xs outline-none"
                                  style={{
                                    backgroundColor: "var(--bg-canvas)",
                                    borderColor: "var(--border-subtle)",
                                  }}
                                >
                                  {splitBlocks.slice(0, -1).map((b, bIdx) => (
                                    <option key={bIdx} value={bIdx + 1}>
                                      Block {bIdx + 1}:{" "}
                                      {stripHtmlToPlainText(b).slice(0, 38) || "..."}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSplitTargetTurnId(null)}
                                  className="h-7 px-2 rounded border text-xs cursor-pointer"
                                  style={{ borderColor: "var(--border-subtle)" }}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    confirmSplitTurn(turn.id, splitAtLineIndex)
                                  }
                                  className="h-7 px-2.5 rounded text-xs font-semibold cursor-pointer"
                                  style={{
                                    backgroundColor: "var(--accent)",
                                    color: "var(--accent-fg)",
                                  }}
                                >
                                  Split Turn
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {!turn.collapsed && (
                        <div className="space-y-3">
                          {/* Collapsible Thinking Block */}
                          {turn.thinkingText && (
                            <div
                              className="rounded-lg border overflow-hidden"
                              style={{
                                backgroundColor: "var(--bg-surface-subtle)",
                                borderColor: "var(--border-subtle)",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedThinkingIds((prev) => ({
                                    ...prev,
                                    [turn.id]: !prev[turn.id],
                                  }))
                                }
                                className="w-full px-3 py-1.5 flex items-center justify-between text-[11.5px] font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  <Brain className="w-3.5 h-3.5 opacity-75" />
                                  <span>Model Reasoning / Thinking</span>
                                </span>
                                {expandedThinkingIds[turn.id] ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                              {expandedThinkingIds[turn.id] && (
                                <pre
                                  className="px-3 pb-3 pt-2 border-t text-xs whitespace-pre-wrap leading-relaxed font-mono opacity-90"
                                  style={{
                                    borderColor: "var(--border-subtle)",
                                    color: "var(--text-secondary)",
                                  }}
                                >
                                  {turn.thinkingText}
                                </pre>
                              )}
                            </div>
                          )}

                          {/* Main Rich Turn Body */}
                          {isEditing ? (
                            <div className="kanso-ai-prose">
                              <TiptapEditor
                                docId={`${chat.id}:${turn.id}`}
                                content={turn.contentHtml}
                                variant="borderless"
                                hideBorderlessToolbar
                                minHeight={80}
                                allNotes={allNotes}
                                onOpenNote={(noteId) => onJumpToNote?.(noteId)}
                                onEditorReady={(ed) => setActiveEditor(ed)}
                                onAnnotateSelection={({ quoteText, applyMark }) =>
                                  createMarginAnnotation(
                                    turn.id,
                                    quoteText,
                                    "amber",
                                    applyMark,
                                  )
                                }
                                onChange={(html) =>
                                  updateTurn(turn.id, { contentHtml: html })
                                }
                              />
                            </div>
                          ) : (
                            <AiTurnRenderer
                              turnId={turn.id}
                              html={turn.contentHtml}
                              activeAnnotationId={activeAnnotationId}
                              onSelectAnnotation={(aid) => {
                                setActiveAnnotationId(aid);
                                setEditingAnnotationId(aid);
                              }}
                              onOpenNote={(noteId) => onJumpToNote?.(noteId)}
                              onAnnotateQuote={(quoteText, color) =>
                                createMarginAnnotation(turn.id, quoteText, color)
                              }
                              onRequestEdit={() => setEditingTurnId(turn.id)}
                            />
                          )}

                          {/* Collapsible Sources & Citations */}
                          {turn.sources && turn.sources.length > 0 && (
                            <div
                              className="rounded-lg border overflow-hidden"
                              style={{
                                backgroundColor: "var(--bg-surface)",
                                borderColor: "var(--border-subtle)",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedSourcesIds((prev) => ({
                                    ...prev,
                                    [turn.id]: !prev[turn.id],
                                  }))
                                }
                                className="w-full px-3 py-1.5 flex items-center justify-between text-[11.5px] font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  <Link2 className="w-3.5 h-3.5 opacity-75" />
                                  <span>
                                    Sources & Citations ({turn.sources.length})
                                  </span>
                                </span>
                                {expandedSourcesIds[turn.id] ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                              {expandedSourcesIds[turn.id] && (
                                <div
                                  className="px-3 pb-2.5 pt-1.5 border-t space-y-1 text-xs"
                                  style={{ borderColor: "var(--border-subtle)" }}
                                >
                                  {turn.sources.map((src, sIdx) => (
                                    <div key={src.id || sIdx} className="flex items-center gap-2 min-w-0">
                                      <span
                                        className="font-mono text-[10px] shrink-0"
                                        style={{ color: "var(--text-muted)" }}
                                      >
                                        [{sIdx + 1}]
                                      </span>
                                      {src.url ? (
                                        <a
                                          href={src.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="truncate hover:underline"
                                          style={{ color: "var(--accent)" }}
                                        >
                                          {src.title}
                                        </a>
                                      ) : (
                                        <span className="truncate">{src.title}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {!showSideMarginsDesktop && turnAnns.length > 0 && (
                            <div className="space-y-2 pt-1">
                              {turnAnns.map((ann) => (
                                <MarginAnnotationCard
                                  key={ann.id}
                                  annotation={ann}
                                  isActive={activeAnnotationId === ann.id}
                                  isEditing={editingAnnotationId === ann.id}
                                  onFocus={() => setActiveAnnotationId(ann.id)}
                                  onToggleEdit={() =>
                                    setEditingAnnotationId((prev) =>
                                      prev === ann.id ? null : ann.id,
                                    )
                                  }
                                  onUpdate={(patch) =>
                                    updateAnnotation(ann.id, patch)
                                  }
                                  onDelete={() => deleteAnnotation(ann.id)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );

                  if (!showSideMarginsDesktop) {
                    return <div key={turn.id}>{turnCard}</div>;
                  }

                  return (
                    <div
                      key={turn.id}
                      className="grid grid-cols-[minmax(0,1fr)_250px] gap-4 items-start"
                    >
                      <div>{turnCard}</div>
                      <div className="space-y-2 pt-2">
                        {turnAnns.map((ann) => (
                          <MarginAnnotationCard
                            key={ann.id}
                            annotation={ann}
                            isActive={activeAnnotationId === ann.id}
                            isEditing={editingAnnotationId === ann.id}
                            onFocus={() => setActiveAnnotationId(ann.id)}
                            onToggleEdit={() =>
                              setEditingAnnotationId((prev) =>
                                prev === ann.id ? null : ann.id,
                              )
                            }
                            onUpdate={(patch) => updateAnnotation(ann.id, patch)}
                            onDelete={() => deleteAnnotation(ann.id)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {turns.length > 0 && (
                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => insertTurnAfter(null, "user")}
                      className="h-8 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Prompt</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => insertTurnAfter(null, "assistant")}
                      className="h-8 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add AI Reply</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => insertTurnAfter(null, "note")}
                      className="h-8 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <StickyNote className="w-3.5 h-3.5" />
                      <span>Add Personal Note</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <DesktopAiVaultOutline
              items={outlineItems}
              activeItemId={activeOutlineId}
              isScrolledDown={isScrolledDown}
              connOpenDesktop={connOpenDesktop}
              preferredMode={outlineMode}
              onTogglePreferredMode={onToggleOutlineMode}
              onJumpToItem={jumpToOutlineItem}
              onJumpToTop={jumpToTop}
            />
          </div>
        </div>

        {editingTurnId && activeEditor && (
          <TiptapThumbToolbar
            editor={activeEditor}
            onDone={() => {
              setEditingTurnId(null);
              setActiveEditor(null);
            }}
          />
        )}
      </div>

      <AiVaultConnectionsPanel
        chat={chat}
        allNotes={allNotes}
        allBooks={allBooks}
        isOpenDesktop={connOpenDesktop}
        isOpenMobile={mobileConnOpen}
        mode={connMode}
        onModeChange={onConnModeChange}
        onToggleNoteLink={onToggleNoteLink}
        onToggleBookLink={onToggleBookLink}
        onJumpToNote={onJumpToNote}
        onJumpToBookLocation={onJumpToBookLocation}
        onCloseDesktop={onToggleConnDesktop}
        onCloseMobile={() => setMobileConnOpen(false)}
      />
    </div>
  );
};

interface MarginAnnotationCardProps {
  annotation: AiMarginAnnotation;
  isActive: boolean;
  isEditing: boolean;
  onFocus: () => void;
  onToggleEdit: () => void;
  onUpdate: (patch: Partial<AiMarginAnnotation>) => void;
  onDelete: () => void;
}

const MarginAnnotationCard: React.FC<MarginAnnotationCardProps> = ({
  annotation,
  isActive,
  isEditing,
  onFocus,
  onToggleEdit,
  onUpdate,
  onDelete,
}) => {
  const colorMeta =
    HIGHLIGHT_COLORS.find((c) => c.id === annotation.color) || HIGHLIGHT_COLORS[0];

  return (
    <div
      onClick={onFocus}
      className="rounded-xl border p-2.5 space-y-1.5 transition-colors text-xs"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: isActive ? "var(--accent)" : "var(--border-subtle)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: colorMeta.swatch }}
          />
          <span
            className="text-[11px] italic truncate"
            style={{ color: "var(--text-muted)" }}
            title={annotation.quoteText}
          >
            &ldquo;{annotation.quoteText}&rdquo;
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUpdate({ color: c.id });
              }}
              aria-label={`Color ${c.label}`}
              className="w-3 h-3 rounded-full cursor-pointer"
              style={{
                backgroundColor: c.swatch,
                outline:
                  annotation.color === c.id
                    ? "1.5px solid var(--text-primary)"
                    : "none",
                outlineOffset: "1px",
              }}
            />
          ))}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Delete margin annotation"
            className="h-5 w-5 rounded flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer ml-1"
            style={{ color: "var(--text-muted)" }}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {isEditing ? (
        <textarea
          value={annotation.comment}
          onChange={(e) => onUpdate({ comment: e.target.value })}
          placeholder="Write your takeaway or margin note..."
          rows={2}
          autoFocus
          onBlur={onToggleEdit}
          className="w-full p-1.5 rounded-md border text-xs outline-none focus:border-[var(--accent)] resize-y"
          style={{
            backgroundColor: "var(--bg-canvas)",
            borderColor: "var(--border-subtle)",
          }}
        />
      ) : (
        <p
          onClick={(e) => {
            e.stopPropagation();
            onToggleEdit();
          }}
          className="text-xs leading-relaxed cursor-text"
          style={{
            color: annotation.comment
              ? "var(--text-primary)"
              : "var(--text-muted)",
          }}
        >
          {annotation.comment || "Click to add takeaway note..."}
        </p>
      )}
    </div>
  );
};
