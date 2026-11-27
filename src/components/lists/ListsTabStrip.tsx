import React, { useCallback, useEffect, useRef, useState } from "react";
import { FolderTree, Plus, X } from "lucide-react";
import type { ListCollection, ListItem, ListItemStatus } from "../../types";
import { ListIcon as CollectionIcon } from "../IconLibrary";

interface StatusMetaEntry {
  label: string;
  chipLabel: string;
  color: string;
  icon: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
}

interface ListsTabStripProps {
  openItems: ListItem[];
  listsById: Map<string, ListCollection>;
  statusMeta: Record<ListItemStatus, StatusMetaEntry>;
  activeTabId: string | null; // null means Lists Home view is active unless isWorkspaceActive
  isWorkspaceActive?: boolean;
  homeTabLabel: string;
  homeTabIcon?: string;
  homeTabColor?: string;
  homeSmartIcon?: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  onSelectWorkspace?: () => void;
  onSelectHome: () => void;
  onSelectTab: (itemId: string) => void;
  onCloseTab: (itemId: string) => void;
  onCloseOtherTabs: (keepItemId: string) => void;
  onCloseAllTabs: () => void;
  onReorderTabs: (
    draggedId: string,
    targetId: string,
    position: "before" | "after",
  ) => void;
  onOpenTargetListPicker: () => void;
}

const TAB_DRAG_MIME = "application/x-kanso-list-item-tab-id";

export const ListsTabStrip: React.FC<ListsTabStripProps> = ({
  openItems,
  listsById,
  statusMeta,
  activeTabId,
  isWorkspaceActive = false,
  homeTabLabel,
  homeTabIcon,
  homeTabColor,
  homeSmartIcon: HomeSmartIcon,
  onSelectWorkspace,
  onSelectHome,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  onReorderTabs,
  onOpenTargetListPicker,
}) => {
  const isHomeActive = activeTabId === null && !isWorkspaceActive;

  const activeDragTabIdRef = useRef<string | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    tabId: string;
    position: "before" | "after";
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    itemId: string;
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const clearDragState = useCallback(() => {
    activeDragTabIdRef.current = null;
    setDraggingTabId(null);
    setDropTarget(null);
  }, []);

  // Scroll newly activated tab into view smoothly
  useEffect(() => {
    if (!activeTabId) return;
    const el = tabRefs.current.get(activeTabId);
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [activeTabId]);

  // Dismiss tab context menu on outside click, Escape, or window blur
  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }
      setContextMenu(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenu(null);
      }
    };
    const handleWindowBlur = () => setContextMenu(null);

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [contextMenu]);

  useEffect(() => {
    window.addEventListener("dragend", clearDragState);
    window.addEventListener("drop", clearDragState);
    return () => {
      window.removeEventListener("dragend", clearDragState);
      window.removeEventListener("drop", clearDragState);
    };
  }, [clearDragState]);

  const handleTabContextMenu = (e: React.MouseEvent, itemId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 188;
    const menuHeight = 118;
    const x =
      typeof window !== "undefined"
        ? Math.min(e.clientX, window.innerWidth - menuWidth - 8)
        : e.clientX;
    const y =
      typeof window !== "undefined"
        ? Math.min(e.clientY, window.innerHeight - menuHeight - 8)
        : e.clientY;
    setContextMenu({
      itemId,
      x: Math.max(8, x),
      y: Math.max(8, y),
    });
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="Open list items"
        className="border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] select-none shrink-0"
      >
        <div className="h-10 lg:h-9 px-2 flex items-end gap-1 overflow-x-auto no-scrollbar">
          {/* Mobile-Only First Tab: Workspace Tree View */}
          {onSelectWorkspace && (
            <button
              type="button"
              role="tab"
              aria-selected={isWorkspaceActive}
              title="Workspace"
              onClick={onSelectWorkspace}
              className={`lg:hidden h-9 px-3 rounded-t-md inline-flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border-t border-x ${
                isWorkspaceActive
                  ? "bg-[var(--bg-canvas)] text-[var(--text-primary)] border-[var(--border-subtle)] -mb-px"
                  : "bg-transparent text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/70"
              }`}
            >
              <FolderTree
                className={`w-3.5 h-3.5 shrink-0 ${
                  isWorkspaceActive
                    ? "text-[var(--accent)]"
                    : "text-[var(--text-muted)]"
                }`}
              />
              <span>Workspace</span>
            </button>
          )}

          {/* Pinned Scope Home Tab */}
          <button
            type="button"
            role="tab"
            aria-selected={isHomeActive}
            title={homeTabLabel}
            onClick={onSelectHome}
            className={`h-9 lg:h-8 px-3 max-w-[200px] rounded-t-md inline-flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border-t border-x ${
              isHomeActive
                ? "bg-[var(--bg-canvas)] text-[var(--text-primary)] border-[var(--border-subtle)] -mb-px"
                : "bg-transparent text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/70"
            }`}
          >
            {HomeSmartIcon ? (
              <HomeSmartIcon
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: homeTabColor || "var(--accent)" }}
              />
            ) : (
              <CollectionIcon
                name={homeTabIcon || "ListChecks"}
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: homeTabColor || "var(--accent)" }}
              />
            )}
            <span className="truncate">{homeTabLabel}</span>
          </button>

          {openItems.length > 0 && (
            <div className="h-4 w-px bg-[var(--border-subtle)] self-center mx-0.5 shrink-0" />
          )}

          {/* Open List Item Tabs (horizontally draggable) */}
          {openItems.map((item) => {
            const isActive = activeTabId === item.id;
            const isBeingDragged = draggingTabId === item.id;
            const isTarget = dropTarget?.tabId === item.id;
            const label = item.title?.trim() || "Untitled Item";
            const parentList = listsById.get(item.listId);
            const sm = statusMeta[item.status] || statusMeta.inbox;
            const StatusIcon = sm.icon;
            const tabTitle = parentList
              ? `${label} — ${parentList.title}`
              : label;

            return (
              <div
                key={item.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(item.id, el);
                  else tabRefs.current.delete(item.id);
                }}
                role="tab"
                aria-selected={isActive}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(TAB_DRAG_MIME, item.id);
                  e.dataTransfer.effectAllowed = "move";
                  activeDragTabIdRef.current = item.id;
                  setDraggingTabId(item.id);
                }}
                onDragEnd={clearDragState}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(TAB_DRAG_MIME)) return;
                  if (activeDragTabIdRef.current === item.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: "before" | "after" =
                    e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                  setDropTarget((prev) =>
                    prev?.tabId === item.id && prev.position === position
                      ? prev
                      : { tabId: item.id, position },
                  );
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDropTarget((prev) =>
                      prev?.tabId === item.id ? null : prev,
                    );
                  }
                }}
                onDrop={(e) => {
                  if (!e.dataTransfer.types.includes(TAB_DRAG_MIME)) return;
                  const draggedId =
                    e.dataTransfer.getData(TAB_DRAG_MIME) ||
                    activeDragTabIdRef.current;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: "before" | "after" =
                    e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                  clearDragState();
                  if (!draggedId || draggedId === item.id) return;
                  e.preventDefault();
                  onReorderTabs(draggedId, item.id, position);
                }}
                onContextMenu={(e) => handleTabContextMenu(e, item.id)}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onCloseTab(item.id);
                  }
                }}
                className={`relative group h-9 lg:h-8 max-w-[200px] sm:max-w-[220px] min-w-[116px] sm:min-w-[124px] pl-2.5 pr-1.5 rounded-t-md inline-flex items-center gap-1.5 text-xs transition-colors shrink-0 border-t border-x ${
                  isBeingDragged ? "opacity-45" : ""
                } ${
                  isActive
                    ? "bg-[var(--bg-canvas)] text-[var(--text-primary)] font-medium border-[var(--border-subtle)] -mb-px"
                    : "bg-transparent text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/70"
                }`}
              >
                {isTarget && (
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-[var(--accent)] z-20 ${
                      dropTarget.position === "before" ? "left-0" : "right-0"
                    }`}
                  />
                )}

                <button
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  title={tabTitle}
                  className="flex-1 min-w-0 h-full flex items-center gap-1.5 text-left cursor-pointer"
                >
                  <StatusIcon
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: sm.color }}
                  />
                  <span
                    className={`truncate ${
                      item.status === "done" ? "line-through opacity-70" : ""
                    }`}
                  >
                    {label}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(item.id);
                  }}
                  aria-label={`Close ${label}`}
                  className={`p-1 lg:p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer shrink-0 transition-opacity ${
                    isActive
                      ? "opacity-85 hover:opacity-100"
                      : "opacity-70 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100"
                  }`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {/* New List Item Tab (+) button on strip */}
          <button
            type="button"
            onClick={onOpenTargetListPicker}
            title="New list item tab"
            aria-label="New list item tab"
            className="h-8 w-8 lg:h-7 lg:w-7 mb-0.5 ml-0.5 rounded-md inline-flex items-center justify-center shrink-0 transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right-Click Tab Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="List item tab actions"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            backgroundColor: "var(--bg-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow: "var(--shadow-popover)",
          }}
          className="fixed z-50 min-w-[184px] rounded-xl border p-1.5 text-xs"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const targetId = contextMenu.itemId;
              setContextMenu(null);
              onCloseTab(targetId);
            }}
            className="w-full px-2.5 py-2 sm:py-1.5 rounded-lg text-left flex items-center justify-between gap-2 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-primary)" }}
          >
            <span>Close Tab</span>
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={openItems.length <= 1}
            onClick={() => {
              const targetId = contextMenu.itemId;
              setContextMenu(null);
              onCloseOtherTabs(targetId);
            }}
            className="w-full px-2.5 py-2 sm:py-1.5 rounded-lg text-left flex items-center justify-between gap-2 transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            style={{ color: "var(--text-primary)" }}
          >
            <span>Close Others</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setContextMenu(null);
              onCloseAllTabs();
            }}
            className="w-full px-2.5 py-2 sm:py-1.5 rounded-lg text-left flex items-center justify-between gap-2 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-primary)" }}
          >
            <span>Close All</span>
          </button>
        </div>
      )}
    </>
  );
};
