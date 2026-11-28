import React, { useCallback, useEffect, useRef, useState } from "react";
import { Layers, Plus, Star, X } from "lucide-react";
import type { AiChatRecord } from "../../types/aiVault";
import { AI_PLATFORM_META } from "./aiVaultUiUtils";

interface AiVaultTabStripProps {
  openChats: AiChatRecord[];
  activeTabId: string | null; // null = Vault Home browser
  homeTabLabel: string;
  onSelectHome: () => void;
  onSelectTab: (chatId: string) => void;
  onCloseTab: (chatId: string) => void;
  onCloseOtherTabs: (keepChatId: string) => void;
  onCloseAllTabs: () => void;
  onReorderTabs: (
    draggedId: string,
    targetId: string,
    position: "before" | "after",
  ) => void;
  onNewChat: () => void;
}

const TAB_DRAG_MIME = "application/x-kanso-ai-tab-id";

export const AiVaultTabStrip: React.FC<AiVaultTabStripProps> = ({
  openChats,
  activeTabId,
  homeTabLabel,
  onSelectHome,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  onReorderTabs,
  onNewChat,
}) => {
  const isHomeActive = activeTabId === null;
  const activeDragIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    tabId: string;
    position: "before" | "after";
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    chatId: string;
    x: number;
    y: number;
  } | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const clearDrag = useCallback(() => {
    activeDragIdRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
  }, []);

  useEffect(() => {
    if (!activeTabId) return;
    tabRefs.current
      .get(activeTabId)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    window.addEventListener("dragend", clearDrag);
    window.addEventListener("drop", clearDrag);
    return () => {
      window.removeEventListener("dragend", clearDrag);
      window.removeEventListener("drop", clearDrag);
    };
  }, [clearDrag]);

  return (
    <>
      <div
        role="tablist"
        aria-label="Open AI conversations"
        className="border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] select-none shrink-0"
      >
        <div className="h-10 lg:h-9 px-2 flex items-end gap-1 overflow-x-auto no-scrollbar">
          {/* Home / Vault Scope Browser Tab */}
          <button
            type="button"
            role="tab"
            aria-selected={isHomeActive}
            onClick={onSelectHome}
            title={homeTabLabel}
            className={`h-9 lg:h-8 px-3 max-w-[190px] rounded-t-md inline-flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border-t border-x ${
              isHomeActive
                ? "bg-[var(--bg-canvas)] text-[var(--text-primary)] border-[var(--border-subtle)] -mb-px"
                : "bg-transparent text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/70"
            }`}
          >
            <Layers
              className={`w-3.5 h-3.5 shrink-0 ${
                isHomeActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
              }`}
            />
            <span className="truncate">{homeTabLabel}</span>
          </button>

          {openChats.length > 0 && (
            <div className="h-4 w-px bg-[var(--border-subtle)] self-center mx-0.5 shrink-0" />
          )}

          {/* Open Conversation Tabs */}
          {openChats.map((chat) => {
            const isActive = activeTabId === chat.id;
            const isTarget = dropTarget?.tabId === chat.id;
            const label = chat.title.trim() || "Untitled Chat";
            const dot = AI_PLATFORM_META[chat.platform]?.dotColor || "#8b5cf6";

            return (
              <div
                key={chat.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(chat.id, el);
                  else tabRefs.current.delete(chat.id);
                }}
                role="tab"
                aria-selected={isActive}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(TAB_DRAG_MIME, chat.id);
                  e.dataTransfer.effectAllowed = "move";
                  activeDragIdRef.current = chat.id;
                  setDraggingId(chat.id);
                }}
                onDragEnd={clearDrag}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(TAB_DRAG_MIME)) return;
                  if (activeDragIdRef.current === chat.id) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: "before" | "after" =
                    e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                  setDropTarget({ tabId: chat.id, position });
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDropTarget((prev) => (prev?.tabId === chat.id ? null : prev));
                  }
                }}
                onDrop={(e) => {
                  if (!e.dataTransfer.types.includes(TAB_DRAG_MIME)) return;
                  const dragged =
                    e.dataTransfer.getData(TAB_DRAG_MIME) || activeDragIdRef.current;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: "before" | "after" =
                    e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                  clearDrag();
                  if (!dragged || dragged === chat.id) return;
                  e.preventDefault();
                  onReorderTabs(dragged, chat.id, position);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    chatId: chat.id,
                    x: Math.max(8, Math.min(window.innerWidth - 192, e.clientX)),
                    y: Math.max(8, Math.min(window.innerHeight - 132, e.clientY)),
                  });
                }}
                className={`relative group h-9 lg:h-8 pl-2.5 pr-1 max-w-[220px] rounded-t-md inline-flex items-center gap-1.5 text-xs transition-colors whitespace-nowrap shrink-0 border-t border-x ${
                  isActive
                    ? "bg-[var(--bg-canvas)] text-[var(--text-primary)] border-[var(--border-subtle)] font-medium -mb-px"
                    : "bg-transparent text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/70"
                }`}
                style={{ opacity: draggingId === chat.id ? 0.5 : 1 }}
              >
                {isTarget && dropTarget.position === "before" && (
                  <span
                    className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                    style={{ backgroundColor: "var(--accent)" }}
                  />
                )}
                {isTarget && dropTarget.position === "after" && (
                  <span
                    className="absolute right-0 top-1 bottom-1 w-0.5 rounded-full"
                    style={{ backgroundColor: "var(--accent)" }}
                  />
                )}

                <button
                  type="button"
                  onClick={() => onSelectTab(chat.id)}
                  onMouseDown={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      onCloseTab(chat.id);
                    }
                  }}
                  className="flex-1 min-w-0 inline-flex items-center gap-1.5 text-left cursor-pointer"
                  title={`${label}${chat.model ? ` · ${chat.model}` : ""}`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: dot }}
                  />
                  <span className="truncate">{label}</span>
                  {chat.favorite && (
                    <Star className="w-2.5 h-2.5 shrink-0 fill-amber-400 text-amber-400" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(chat.id);
                  }}
                  aria-label={`Close ${label}`}
                  className="h-5 w-5 rounded flex items-center justify-center opacity-55 group-hover:opacity-100 hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={onNewChat}
            title="New AI Chat"
            aria-label="New AI Chat"
            className="h-7 w-7 mb-1 ml-0.5 rounded-md flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-50 w-44 rounded-xl border p-1 space-y-0.5"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: "var(--bg-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow: "var(--shadow-popover)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              const id = contextMenu.chatId;
              setContextMenu(null);
              onCloseTab(id);
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs text-left hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            Close Tab
          </button>
          <button
            type="button"
            onClick={() => {
              const id = contextMenu.chatId;
              setContextMenu(null);
              onCloseOtherTabs(id);
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs text-left hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            Close Other Tabs
          </button>
          <button
            type="button"
            onClick={() => {
              setContextMenu(null);
              onCloseAllTabs();
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs text-left hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            Close All Tabs
          </button>
        </div>
      )}
    </>
  );
};
