import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  Folder,
  FolderPlus,
  Hash,
  Inbox,
  Layers,
  PanelLeftClose,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { AiChatFolder, AiChatRecord, AiPlatform } from "../../types/aiVault";
import { NotePageIcon } from "../IconLibrary";
import { AI_PLATFORM_META } from "./aiVaultUiUtils";

export type AiVaultScope =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "unfiled" }
  | { kind: "folder"; folderId: string }
  | { kind: "model"; platform: AiPlatform; modelName: string }
  | { kind: "topic"; topic: string };

export function serializeAiVaultScope(scope: AiVaultScope): string {
  switch (scope.kind) {
    case "all":
      return "all";
    case "favorites":
      return "favorites";
    case "unfiled":
      return "unfiled";
    case "folder":
      return `folder:${scope.folderId}`;
    case "model":
      return `model:${scope.platform}::${scope.modelName}`;
    case "topic":
      return `topic:${scope.topic}`;
  }
}

export function isSameAiVaultScope(a: AiVaultScope, b: AiVaultScope): boolean {
  return serializeAiVaultScope(a) === serializeAiVaultScope(b);
}

interface AiVaultSidebarProps {
  chats: AiChatRecord[];
  folders: AiChatFolder[];
  scope: AiVaultScope;
  width: number;
  isCollapsedDesktop: boolean;
  isMobileDrawerOpen: boolean;
  onWidthChange: (width: number) => void;
  onCollapseDesktop: () => void;
  onCloseMobileDrawer: () => void;
  onSelectScope: (scope: AiVaultScope) => void;
  onCreateFolder: (parentId: string | null) => void;
  onEditFolder: (folder: AiChatFolder) => void;
  onDeleteFolder: (folder: AiChatFolder) => void;
  onReorderFolder: (
    draggedId: string,
    targetId: string,
    position: "before" | "after" | "inside",
  ) => void;
  onMoveChatToFolder: (chatId: string, folderId: string | null) => void;
}

const FOLDER_DRAG_MIME = "application/x-kanso-ai-folder-id";
const CHAT_DRAG_MIME = "application/x-kanso-ai-chat-id";

export const AiVaultSidebar: React.FC<AiVaultSidebarProps> = ({
  chats,
  folders,
  scope,
  width,
  isCollapsedDesktop,
  isMobileDrawerOpen,
  onWidthChange,
  onCollapseDesktop,
  onCloseMobileDrawer,
  onSelectScope,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onReorderFolder,
  onMoveChatToFolder,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [sectionsCollapsed, setSectionsCollapsed] = useState<{
    models: boolean;
    topics: boolean;
  }>({ models: false, topics: false });
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [dropState, setDropState] = useState<{
    targetId: string;
    position: "before" | "after" | "inside" | "chat-drop";
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    folder: AiChatFolder;
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const resizingRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const sortedFolders = useMemo(
    () =>
      [...folders].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
      ),
    [folders],
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, AiChatFolder[]>();
    for (const folder of sortedFolders) {
      const pid = folder.parentId ?? null;
      const list = map.get(pid) || [];
      list.push(folder);
      map.set(pid, list);
    }
    return map;
  }, [sortedFolders]);

  const folderDirectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of chats) {
      if (c.folderId) {
        counts.set(c.folderId, (counts.get(c.folderId) || 0) + 1);
      }
    }
    return counts;
  }, [chats]);

  const favoritesCount = useMemo(
    () => chats.filter((c) => c.favorite).length,
    [chats],
  );
  const unfiledCount = useMemo(
    () => chats.filter((c) => !c.folderId).length,
    [chats],
  );

  const modelGroups = useMemo(() => {
    const map = new Map<
      string,
      { platform: AiPlatform; modelName: string; count: number }
    >();
    for (const c of chats) {
      const modelName = (c.model || "").trim() || AI_PLATFORM_META[c.platform].label;
      const key = `${c.platform}::${modelName}`;
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { platform: c.platform, modelName, count: 1 });
    }
    return Array.from(map.values()).sort(
      (a, b) => b.count - a.count || a.modelName.localeCompare(b.modelName),
    );
  }, [chats]);

  const topicGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of chats) {
      const topic = (c.topic || "").trim();
      if (!topic) continue;
      map.set(topic, (map.get(topic) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
  }, [chats]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const clearDrag = useCallback(() => {
    setDraggingFolderId(null);
    setDropState(null);
  }, []);

  useEffect(() => {
    window.addEventListener("dragend", clearDrag);
    window.addEventListener("drop", clearDrag);
    return () => {
      window.removeEventListener("dragend", clearDrag);
      window.removeEventListener("drop", clearDrag);
    };
  }, [clearDrag]);

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizingRef.current = { startX: e.clientX, startWidth: width };
    const onMove = (ev: PointerEvent) => {
      if (!resizingRef.current) return;
      const next = Math.max(
        215,
        Math.min(340, resizingRef.current.startWidth + (ev.clientX - resizingRef.current.startX)),
      );
      onWidthChange(next);
    };
    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const renderFolderBranch = (
    parentId: string | null,
    depth: number,
    isMobile: boolean,
  ): React.ReactNode => {
    const kids = childrenByParent.get(parentId) || [];
    return kids.map((folder) => {
      const subKids = childrenByParent.get(folder.id) || [];
      const hasKids = subKids.length > 0;
      const isExpanded = expandedFolders[folder.id] ?? true;
      const active = isSameAiVaultScope(scope, { kind: "folder", folderId: folder.id });
      const count = folderDirectCounts.get(folder.id) || 0;
      const isDropInside =
        dropState?.targetId === folder.id &&
        (dropState.position === "inside" || dropState.position === "chat-drop");
      const isDropBefore =
        dropState?.targetId === folder.id && dropState.position === "before";
      const isDropAfter =
        dropState?.targetId === folder.id && dropState.position === "after";

      return (
        <div key={folder.id} className="relative">
          {isDropBefore && (
            <div
              className="absolute left-2 right-2 top-0 h-0.5 rounded-full pointer-events-none z-10"
              style={{ backgroundColor: "var(--accent)" }}
            />
          )}
          <div
            draggable={!isMobile}
            onDragStart={(e) => {
              if (isMobile) return;
              e.dataTransfer.setData(FOLDER_DRAG_MIME, folder.id);
              e.dataTransfer.effectAllowed = "move";
              setDraggingFolderId(folder.id);
            }}
            onDragEnd={clearDrag}
            onDragOver={(e) => {
              if (isMobile) return;
              const isChat = e.dataTransfer.types.includes(CHAT_DRAG_MIME);
              const isFolder = e.dataTransfer.types.includes(FOLDER_DRAG_MIME);
              if (!isChat && !isFolder) return;
              if (isFolder && draggingFolderId === folder.id) return;
              e.preventDefault();
              if (isChat) {
                setDropState({ targetId: folder.id, position: "chat-drop" });
                return;
              }
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientY - rect.top) / Math.max(1, rect.height);
              const pos: "before" | "after" | "inside" =
                ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside";
              setDropState({ targetId: folder.id, position: pos });
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDropState((prev) => (prev?.targetId === folder.id ? null : prev));
              }
            }}
            onDrop={(e) => {
              if (isMobile) return;
              const droppedChatId = e.dataTransfer.getData(CHAT_DRAG_MIME);
              if (droppedChatId) {
                e.preventDefault();
                clearDrag();
                onMoveChatToFolder(droppedChatId, folder.id);
                return;
              }
              const draggedFolder =
                e.dataTransfer.getData(FOLDER_DRAG_MIME) || draggingFolderId;
              if (!draggedFolder || draggedFolder === folder.id) {
                clearDrag();
                return;
              }
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientY - rect.top) / Math.max(1, rect.height);
              const pos: "before" | "after" | "inside" =
                ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside";
              clearDrag();
              onReorderFolder(draggedFolder, folder.id, pos);
            }}
            onContextMenu={(e) => {
              if (isMobile) return;
              e.preventDefault();
              e.stopPropagation();
              const mw = 180;
              const mh = 136;
              setContextMenu({
                folder,
                x: Math.max(8, Math.min(window.innerWidth - mw - 8, e.clientX)),
                y: Math.max(8, Math.min(window.innerHeight - mh - 8, e.clientY)),
              });
            }}
            className="group flex items-center gap-1 rounded-lg pr-1.5 py-1.5 transition-colors cursor-pointer"
            style={{
              paddingLeft: `${depth * 14 + 6}px`,
              backgroundColor: isDropInside
                ? "var(--accent-soft)"
                : active
                  ? "var(--accent-soft)"
                  : "transparent",
              outline: isDropInside ? "1px solid var(--accent)" : undefined,
              opacity: draggingFolderId === folder.id ? 0.5 : 1,
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!hasKids) return;
                setExpandedFolders((prev) => ({
                  ...prev,
                  [folder.id]: !isExpanded,
                }));
              }}
              aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
              className={`w-4 h-4 flex items-center justify-center rounded shrink-0 ${
                hasKids ? "opacity-75 hover:opacity-100 cursor-pointer" : "opacity-0 pointer-events-none"
              }`}
              style={{ color: "var(--text-muted)" }}
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
                onSelectScope({ kind: "folder", folderId: folder.id });
                if (isMobile) onCloseMobileDrawer();
              }}
              className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
            >
              <NotePageIcon
                icon={folder.icon}
                fallback="Folder"
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
              />
              <span
                className="text-xs font-medium truncate"
                style={{
                  color: active ? "var(--accent)" : "var(--text-primary)",
                }}
              >
                {folder.name}
              </span>
            </button>

            <span
              className="text-[11px] font-mono tabular-nums shrink-0"
              style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
            >
              {count}
            </span>

            {isMobile && (
              <div className="flex items-center gap-0.5 ml-1">
                <button
                  type="button"
                  onClick={() => onEditFolder(folder)}
                  aria-label="Edit folder"
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteFolder(folder)}
                  aria-label="Delete folder"
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)]"
                  style={{ color: "var(--danger)" }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          {isDropAfter && (
            <div
              className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full pointer-events-none z-10"
              style={{ backgroundColor: "var(--accent)" }}
            />
          )}
          {hasKids && isExpanded && renderFolderBranch(folder.id, depth + 1, isMobile)}
        </div>
      );
    });
  };

  const sidebarBody = (isMobile: boolean) => (
    <div
      className="h-full flex flex-col select-none"
      style={{ backgroundColor: "var(--bg-sidebar)" }}
    >
      {/* Header */}
      <div
        className="h-12 px-3.5 flex items-center justify-between gap-2 border-b shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <span className="text-xs font-semibold tracking-tight truncate">
          AI Vault
        </span>
        {isMobile ? (
          <button
            type="button"
            onClick={onCloseMobileDrawer}
            aria-label="Close AI Vault drawer"
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onCollapseDesktop}
            title="Collapse sidebar"
            aria-label="Collapse AI Vault sidebar"
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Scrollable Sections */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2.5 space-y-4">
        {/* Core Collections */}
        <div className="space-y-0.5">
          {(
            [
              {
                scopeItem: { kind: "all" } as AiVaultScope,
                label: "All Chats",
                count: chats.length,
                icon: Layers,
              },
              {
                scopeItem: { kind: "favorites" } as AiVaultScope,
                label: "Favorites",
                count: favoritesCount,
                icon: Star,
              },
              {
                scopeItem: { kind: "unfiled" } as AiVaultScope,
                label: "Unfiled",
                count: unfiledCount,
                icon: Inbox,
                allowChatDrop: true,
              },
            ] as Array<{
              scopeItem: AiVaultScope;
              label: string;
              count: number;
              icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
              allowChatDrop?: boolean;
            }>
          ).map(({ scopeItem, label, count, icon: Icon, allowChatDrop }) => {
            const active = isSameAiVaultScope(scope, scopeItem);
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  onSelectScope(scopeItem);
                  if (isMobile) onCloseMobileDrawer();
                }}
                onDragOver={
                  allowChatDrop && !isMobile
                    ? (e) => {
                        if (e.dataTransfer.types.includes(CHAT_DRAG_MIME)) {
                          e.preventDefault();
                        }
                      }
                    : undefined
                }
                onDrop={
                  allowChatDrop && !isMobile
                    ? (e) => {
                        const chatId = e.dataTransfer.getData(CHAT_DRAG_MIME);
                        if (chatId) {
                          e.preventDefault();
                          onMoveChatToFolder(chatId, null);
                        }
                      }
                    : undefined
                }
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{
                  backgroundColor: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--accent)" : "var(--text-primary)",
                }}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Icon
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
                  />
                  <span className="truncate">{label}</span>
                </span>
                <span
                  className="text-[11px] font-mono tabular-nums"
                  style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Nested Folders */}
        <div className="space-y-1">
          <div className="px-2 flex items-center justify-between">
            <span
              className="text-[10.5px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Folders
            </span>
            <button
              type="button"
              onClick={() => onCreateFolder(null)}
              title="New folder"
              aria-label="New folder"
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {sortedFolders.length === 0 ? (
            <button
              type="button"
              onClick={() => onCreateFolder(null)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border border-dashed transition-colors hover:border-[var(--accent)] cursor-pointer"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Create folder</span>
            </button>
          ) : (
            <div className="space-y-0.5">{renderFolderBranch(null, 0, isMobile)}</div>
          )}
        </div>

        {/* Models */}
        {modelGroups.length > 0 && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() =>
                setSectionsCollapsed((prev) => ({ ...prev, models: !prev.models }))
              }
              className="w-full px-2 flex items-center justify-between text-left cursor-pointer"
            >
              <span
                className="text-[10.5px] font-semibold uppercase tracking-wider inline-flex items-center gap-1"
                style={{ color: "var(--text-muted)" }}
              >
                <Cpu className="w-3 h-3" />
                <span>Models</span>
              </span>
              {sectionsCollapsed.models ? (
                <ChevronRight className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
              ) : (
                <ChevronDown className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
              )}
            </button>

            {!sectionsCollapsed.models && (
              <div className="space-y-0.5">
                {modelGroups.map((m) => {
                  const s: AiVaultScope = {
                    kind: "model",
                    platform: m.platform,
                    modelName: m.modelName,
                  };
                  const active = isSameAiVaultScope(scope, s);
                  const dot = AI_PLATFORM_META[m.platform].dotColor;
                  return (
                    <button
                      key={`${m.platform}::${m.modelName}`}
                      type="button"
                      onClick={() => {
                        onSelectScope(s);
                        if (isMobile) onCloseMobileDrawer();
                      }}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{
                        backgroundColor: active ? "var(--accent-soft)" : "transparent",
                        color: active ? "var(--accent)" : "var(--text-secondary)",
                      }}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: dot }}
                        />
                        <span className="truncate font-medium">{m.modelName}</span>
                      </span>
                      <span
                        className="text-[11px] font-mono tabular-nums"
                        style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
                      >
                        {m.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Topics */}
        {topicGroups.length > 0 && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() =>
                setSectionsCollapsed((prev) => ({ ...prev, topics: !prev.topics }))
              }
              className="w-full px-2 flex items-center justify-between text-left cursor-pointer"
            >
              <span
                className="text-[10.5px] font-semibold uppercase tracking-wider inline-flex items-center gap-1"
                style={{ color: "var(--text-muted)" }}
              >
                <Hash className="w-3 h-3" />
                <span>Topics</span>
              </span>
              {sectionsCollapsed.topics ? (
                <ChevronRight className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
              ) : (
                <ChevronDown className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
              )}
            </button>

            {!sectionsCollapsed.topics && (
              <div className="space-y-0.5">
                {topicGroups.map((t) => {
                  const s: AiVaultScope = { kind: "topic", topic: t.topic };
                  const active = isSameAiVaultScope(scope, s);
                  return (
                    <button
                      key={t.topic}
                      type="button"
                      onClick={() => {
                        onSelectScope(s);
                        if (isMobile) onCloseMobileDrawer();
                      }}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{
                        backgroundColor: active ? "var(--accent-soft)" : "transparent",
                        color: active ? "var(--accent)" : "var(--text-secondary)",
                      }}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Hash className="w-3 h-3 shrink-0 opacity-65" />
                        <span className="truncate font-medium">{t.topic}</span>
                      </span>
                      <span
                        className="text-[11px] font-mono tabular-nums"
                        style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
                      >
                        {t.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Resizable Sidebar */}
      {!isCollapsedDesktop && (
        <aside
          aria-label="AI Vault sidebar"
          className="hidden lg:flex h-full shrink-0 border-r relative"
          style={{ width, borderColor: "var(--border-subtle)" }}
        >
          <div className="flex-1 min-w-0 h-full overflow-hidden">
            {sidebarBody(false)}
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize AI Vault sidebar"
            onPointerDown={handleResizePointerDown}
            className="w-1 hover:w-1.5 cursor-col-resize absolute top-0 bottom-0 right-0 z-20 transition-colors hover:bg-[var(--accent)]/40"
          />
        </aside>
      )}

      {/* Mobile Slide-Over Folder Drawer */}
      {isMobileDrawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex bg-black/50 backdrop-blur-[1px] overscroll-none"
          onClick={onCloseMobileDrawer}
        >
          <div
            className="w-[min(84vw,300px)] h-full pt-safe pb-safe border-r overflow-hidden"
            style={{ borderColor: "var(--border-strong)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarBody(true)}
          </div>
        </div>
      )}

      {/* Desktop Right-Click Context Menu for Folders */}
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
            role="menuitem"
            onClick={() => {
              const fid = contextMenu.folder.id;
              setContextMenu(null);
              onCreateFolder(fid);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5 opacity-80" />
            <span>New Subfolder</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const f = contextMenu.folder;
              setContextMenu(null);
              onEditFolder(f);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5 opacity-80" />
            <span>Rename & Icon</span>
          </button>
          <div
            className="my-1 h-px"
            style={{ backgroundColor: "var(--border-subtle)" }}
          />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const f = contextMenu.folder;
              setContextMenu(null);
              onDeleteFolder(f);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--danger)" }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Folder</span>
          </button>
        </div>
      )}
    </>
  );
};
