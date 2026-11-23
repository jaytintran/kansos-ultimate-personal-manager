import React, { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ListIcon as CollectionIcon } from "../IconLibrary";
import type { ListCollection, ListItemStatus } from "../../types";

export const DEFAULT_LISTS_SIDEBAR_WIDTH = 252;
export const MIN_LISTS_SIDEBAR_WIDTH = 200;
export const MAX_LISTS_SIDEBAR_WIDTH = 380;

export type ListsSidebarScope =
  | { kind: "list"; listId: string }
  | { kind: "smart"; status: ListItemStatus };

interface ListsLeftSidebarProps {
  lists: ListCollection[];
  listItemCounts: Map<string, number>;
  globalStatusCounts: Record<ListItemStatus, number>;
  statusOrder: ListItemStatus[];
  statusMeta: Record<
    ListItemStatus,
    {
      label: string;
      chipLabel: string;
      color: string;
      icon: React.ComponentType<{
        className?: string;
        style?: React.CSSProperties;
      }>;
    }
  >;
  scope: ListsSidebarScope;
  sidebarWidth: number;
  isCollapsedDesktop: boolean;
  sectionsCollapsed: { smart: boolean; lists: boolean };
  onToggleSection: (section: "smart" | "lists") => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onCollapseDesktop: () => void;
  onSidebarWidthChange: (width: number) => void;
  onSelectScope: (scope: ListsSidebarScope) => void;
  onCreateList: () => void;
  onEditList: (list: ListCollection) => void;
  onDeleteList: (list: ListCollection) => void;
  onReorderList: (
    draggedId: string,
    targetId: string,
    position: "before" | "after",
  ) => void;
  onMoveItemToList: (itemId: string, targetListId: string) => void;
  onChangeItemStatus: (itemId: string, targetStatus: ListItemStatus) => void;
  activeDragItemIdRef: React.MutableRefObject<string | null>;
  onClearAllDragStates: () => void;
}

export const ListsLeftSidebar: React.FC<ListsLeftSidebarProps> = ({
  lists,
  listItemCounts,
  globalStatusCounts,
  statusOrder,
  statusMeta,
  scope,
  sidebarWidth,
  isCollapsedDesktop,
  sectionsCollapsed,
  onToggleSection,
  isOpenMobile,
  onCloseMobile,
  onCollapseDesktop,
  onSidebarWidthChange,
  onSelectScope,
  onCreateList,
  onEditList,
  onDeleteList,
  onReorderList,
  onMoveItemToList,
  onChangeItemStatus,
  activeDragItemIdRef,
  onClearAllDragStates,
}) => {
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [isResizing, setIsResizing] = useState(false);

  // Drag & drop highlights inside sidebar
  const dragListRowIdRef = useRef<string | null>(null);
  const [draggingListRowId, setDraggingListRowId] = useState<string | null>(
    null,
  );
  const [listRowDropTarget, setListRowDropTarget] = useState<{
    listId: string;
    position: "before" | "after";
  } | null>(null);
  const [itemDropHighlightKey, setItemDropHighlightKey] = useState<
    string | null
  >(null);

  // Right-click context menu for sidebar list rows
  const [listRowContextMenu, setListRowContextMenu] = useState<{
    list: ListCollection;
    x: number;
    y: number;
  } | null>(null);

  const normalizedSearch = sidebarSearch.trim().toLowerCase();

  const filteredSmartStatuses = useMemo(() => {
    if (!normalizedSearch) return statusOrder;
    return statusOrder.filter((st) =>
      statusMeta[st].label.toLowerCase().includes(normalizedSearch),
    );
  }, [normalizedSearch, statusOrder, statusMeta]);

  const filteredLists = useMemo(() => {
    if (!normalizedSearch) return lists;
    return lists.filter((l) =>
      l.title.toLowerCase().includes(normalizedSearch),
    );
  }, [lists, normalizedSearch]);

  const handleStartResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    setIsResizing(true);

    const onMove = (ev: PointerEvent) => {
      const next = Math.min(
        MAX_LISTS_SIDEBAR_WIDTH,
        Math.max(MIN_LISTS_SIDEBAR_WIDTH, startWidth + (ev.clientX - startX)),
      );
      onSidebarWidthChange(next);
    };
    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const resetSidebarDrag = () => {
    dragListRowIdRef.current = null;
    setDraggingListRowId(null);
    setListRowDropTarget(null);
    setItemDropHighlightKey(null);
  };

  const sidebarContent = (isDesktop: boolean) => (
    <aside
      aria-label="Lists navigation sidebar"
      className="relative h-full flex flex-col border-r shrink-0 select-none"
      style={{
        width: isDesktop ? sidebarWidth : 284,
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {/* Sidebar Top Bar */}
      <div
        className="h-12 px-3 flex items-center justify-between gap-2 border-b shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <span
          className="text-xs font-semibold tracking-wide uppercase"
          style={{ color: "var(--text-muted)" }}
        >
          Lists
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              onCreateList();
              onCloseMobile();
            }}
            title="New list collection"
            aria-label="New list collection"
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            <Plus className="w-4 h-4" />
          </button>
          {isDesktop ? (
            <button
              type="button"
              onClick={onCollapseDesktop}
              title="Collapse sidebar"
              aria-label="Collapse lists sidebar"
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close sidebar"
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Sidebar Search Box */}
      <div className="px-2.5 pt-2.5 pb-1 shrink-0">
        <div
          className="h-8 px-2.5 rounded-lg border flex items-center gap-1.5"
          style={{
            backgroundColor: "var(--bg-canvas)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <Search
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
            placeholder="Find list..."
            aria-label="Filter lists in sidebar"
            className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:opacity-60"
            style={{ color: "var(--text-primary)" }}
          />
          {sidebarSearch && (
            <button
              type="button"
              onClick={() => setSidebarSearch("")}
              aria-label="Clear sidebar search"
              className="opacity-70 hover:opacity-100 cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Sections */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2.5 space-y-3">
        {/* Section 1: Cross-List Smart Views */}
        {filteredSmartStatuses.length > 0 && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => onToggleSection("smart")}
              className="w-full px-1.5 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wider cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <span>Smart Views</span>
              {sectionsCollapsed.smart ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>

            {!sectionsCollapsed.smart && (
              <div className="space-y-0.5">
                {filteredSmartStatuses.map((st) => {
                  const sm = statusMeta[st];
                  const Icon = sm.icon;
                  const active = scope.kind === "smart" && scope.status === st;
                  const dropKey = `smart:${st}`;
                  const isItemDropHover = itemDropHighlightKey === dropKey;

                  return (
                    <button
                      key={st}
                      type="button"
                      onDragOver={(e) => {
                        if (
                          !e.dataTransfer.types.includes(
                            "application/x-kanso-list-item-id",
                          )
                        ) {
                          return;
                        }
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setItemDropHighlightKey(dropKey);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setItemDropHighlightKey((prev) =>
                            prev === dropKey ? null : prev,
                          );
                        }
                      }}
                      onDrop={(e) => {
                        if (
                          !e.dataTransfer.types.includes(
                            "application/x-kanso-list-item-id",
                          )
                        ) {
                          return;
                        }
                        const itemId =
                          e.dataTransfer.getData(
                            "application/x-kanso-list-item-id",
                          ) || activeDragItemIdRef.current;
                        resetSidebarDrag();
                        onClearAllDragStates();
                        if (!itemId) return;
                        e.preventDefault();
                        onChangeItemStatus(itemId, st);
                      }}
                      onClick={() => {
                        onSelectScope({ kind: "smart", status: st });
                        onCloseMobile();
                      }}
                      className={`w-full px-2 py-1.5 rounded-lg flex items-center justify-between gap-2 text-xs transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer ${
                        isItemDropHover ? "ring-1 ring-[var(--accent)]" : ""
                      }`}
                      style={{
                        backgroundColor: isItemDropHover
                          ? "var(--accent-soft)"
                          : active
                            ? "var(--accent-soft)"
                            : "transparent",
                        color: active
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                      }}
                      title={`View all ${sm.label} items · Drop item here to mark ${sm.label}`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Icon
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: sm.color }}
                        />
                        <span
                          className={`truncate ${active ? "font-semibold" : "font-medium"}`}
                          style={{
                            color: active
                              ? "var(--text-primary)"
                              : "var(--text-secondary)",
                          }}
                        >
                          {sm.label}
                        </span>
                      </span>
                      <span
                        className="font-mono tabular-nums text-[11px] shrink-0"
                        style={{
                          color: active ? "var(--accent)" : "var(--text-muted)",
                        }}
                      >
                        {globalStatusCounts[st]}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Section Divider */}
        <div
          className="border-t mx-1"
          style={{ borderColor: "var(--border-subtle)" }}
        />

        {/* Section 2: User Lists (Flat Customizable Order) */}
        <div className="space-y-1">
          <div className="px-1.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onToggleSection("lists")}
              className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <span>Your Lists</span>
              {sectionsCollapsed.lists ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                onCreateList();
                onCloseMobile();
              }}
              title="Create new list"
              aria-label="Create new list"
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {!sectionsCollapsed.lists && (
            <div className="space-y-0.5">
              {filteredLists.map((list) => {
                const active = scope.kind === "list" && scope.listId === list.id;
                const count = listItemCounts.get(list.id) || 0;
                const accentHex = list.color || "#4f46e5";
                const isBeingDragged = draggingListRowId === list.id;
                const dropKey = `list:${list.id}`;
                const isItemDropHover = itemDropHighlightKey === dropKey;
                const isOrderDropTarget =
                  listRowDropTarget?.listId === list.id;

                return (
                  <div
                    key={list.id}
                    draggable={!normalizedSearch}
                    onDragStart={(e) => {
                      if (normalizedSearch) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData(
                        "application/x-kanso-list-tab-id",
                        list.id,
                      );
                      e.dataTransfer.effectAllowed = "move";
                      dragListRowIdRef.current = list.id;
                      setDraggingListRowId(list.id);
                    }}
                    onDragEnd={() => {
                      resetSidebarDrag();
                      onClearAllDragStates();
                    }}
                    onDragOver={(e) => {
                      const types = e.dataTransfer.types;
                      if (types.includes("application/x-kanso-list-item-id")) {
                        if (scope.kind === "list" && scope.listId === list.id) {
                          return;
                        }
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setItemDropHighlightKey(dropKey);
                        return;
                      }
                      if (
                        !normalizedSearch &&
                        types.includes("application/x-kanso-list-tab-id")
                      ) {
                        if (dragListRowIdRef.current === list.id) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        const rect = e.currentTarget.getBoundingClientRect();
                        const position: "before" | "after" =
                          e.clientY < rect.top + rect.height / 2
                            ? "before"
                            : "after";
                        setListRowDropTarget((prev) =>
                          prev?.listId === list.id &&
                          prev.position === position
                            ? prev
                            : { listId: list.id, position },
                        );
                      }
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setItemDropHighlightKey((prev) =>
                          prev === dropKey ? null : prev,
                        );
                        setListRowDropTarget((prev) =>
                          prev?.listId === list.id ? null : prev,
                        );
                      }
                    }}
                    onDrop={(e) => {
                      const types = e.dataTransfer.types;
                      if (types.includes("application/x-kanso-list-item-id")) {
                        const itemId =
                          e.dataTransfer.getData(
                            "application/x-kanso-list-item-id",
                          ) || activeDragItemIdRef.current;
                        resetSidebarDrag();
                        onClearAllDragStates();
                        if (
                          !itemId ||
                          (scope.kind === "list" && scope.listId === list.id)
                        ) {
                          return;
                        }
                        e.preventDefault();
                        onMoveItemToList(itemId, list.id);
                        return;
                      }
                      if (types.includes("application/x-kanso-list-tab-id")) {
                        const draggedId =
                          e.dataTransfer.getData(
                            "application/x-kanso-list-tab-id",
                          ) || dragListRowIdRef.current;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const position: "before" | "after" =
                          e.clientY < rect.top + rect.height / 2
                            ? "before"
                            : "after";
                        resetSidebarDrag();
                        onClearAllDragStates();
                        if (!draggedId || draggedId === list.id) return;
                        e.preventDefault();
                        onReorderList(draggedId, list.id, position);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setListRowContextMenu({
                        list,
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                    className={`group relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors hover:bg-[var(--bg-surface-hover)] ${
                      isBeingDragged ? "opacity-45" : ""
                    } ${isItemDropHover ? "ring-1 ring-[var(--accent)]" : ""}`}
                    style={{
                      backgroundColor: isItemDropHover
                        ? "var(--accent-soft)"
                        : active
                          ? `${accentHex}16`
                          : "transparent",
                      boxShadow: isOrderDropTarget
                        ? listRowDropTarget.position === "before"
                          ? "inset 0 2px 0 var(--accent)"
                          : "inset 0 -2px 0 var(--accent)"
                        : undefined,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectScope({ kind: "list", listId: list.id });
                        onCloseMobile();
                      }}
                      className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                      title={list.title}
                    >
                      <CollectionIcon
                        name={list.icon}
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: accentHex }}
                      />
                      <span
                        className={`truncate ${active ? "font-semibold" : "font-medium"}`}
                        style={{
                          color: active
                            ? "var(--text-primary)"
                            : "var(--text-secondary)",
                        }}
                      >
                        {list.title}
                      </span>
                    </button>

                    {/* Hover Edit & Delete Actions + Item Count */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditList(list);
                        }}
                        title="Edit list"
                        aria-label={`Edit ${list.title}`}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer transition-opacity"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteList(list);
                        }}
                        title="Delete list"
                        aria-label={`Delete ${list.title}`}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <span
                        className="font-mono tabular-nums text-[11px] min-w-[18px] text-right"
                        style={{
                          color: active ? accentHex : "var(--text-muted)",
                        }}
                      >
                        {count}
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredLists.length === 0 && (
                <p
                  className="px-2 py-2 text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {normalizedSearch ? "No matching lists" : "No lists yet"}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Desktop Drag-Resize Divider */}
      {isDesktop && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize lists sidebar"
          title="Drag to resize · Double-click to reset"
          onPointerDown={handleStartResize}
          onDoubleClick={() => onSidebarWidthChange(DEFAULT_LISTS_SIDEBAR_WIDTH)}
          className={`absolute top-0 right-[-3px] bottom-0 w-1.5 cursor-col-resize z-20 transition-colors ${
            isResizing
              ? "bg-[var(--accent)]/60"
              : "bg-transparent hover:bg-[var(--accent)]/35"
          }`}
        />
      )}
    </aside>
  );

  return (
    <>
      {/* Desktop Resizable/Collapsible Left Sidebar */}
      {!isCollapsedDesktop && (
        <div className="hidden lg:block h-full shrink-0">
          {sidebarContent(true)}
        </div>
      )}

      {/* Mobile Slide-Over Sidebar Drawer */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex bg-black/50 backdrop-blur-[1px] overscroll-none"
          onClick={onCloseMobile}
        >
          <div
            className="h-full pt-safe pb-safe flex overscroll-none"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent(false)}
          </div>
        </div>
      )}

      {/* Sidebar List Row Right-Click Context Menu */}
      {listRowContextMenu && (
        <div
          className="fixed inset-0 z-[70]"
          onClick={() => setListRowContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setListRowContextMenu(null);
          }}
        >
          <div
            className="fixed w-44 rounded-xl border p-1 space-y-0.5"
            onClick={(e) => e.stopPropagation()}
            style={{
              left:
                typeof window !== "undefined"
                  ? Math.min(
                      Math.max(12, listRowContextMenu.x),
                      window.innerWidth - 188,
                    )
                  : listRowContextMenu.x,
              top:
                typeof window !== "undefined"
                  ? Math.min(
                      Math.max(12, listRowContextMenu.y),
                      window.innerHeight - 120,
                    )
                  : listRowContextMenu.y,
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div
              className="px-2.5 py-1 text-[11px] font-semibold truncate border-b mb-0.5"
              style={{
                color: "var(--text-muted)",
                borderColor: "var(--border-subtle)",
              }}
            >
              {listRowContextMenu.list.title}
            </div>
            <button
              type="button"
              onClick={() => {
                const target = listRowContextMenu.list;
                setListRowContextMenu(null);
                onEditList(target);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              style={{ color: "var(--text-primary)" }}
            >
              <Pencil className="w-3.5 h-3.5 opacity-75" />
              <span>Edit List</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const target = listRowContextMenu.list;
                setListRowContextMenu(null);
                onDeleteList(target);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              style={{ color: "var(--danger)" }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete List</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
