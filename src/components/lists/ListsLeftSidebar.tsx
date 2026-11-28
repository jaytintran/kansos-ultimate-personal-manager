import React, { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderPlus,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ListIcon as CollectionIcon } from "../IconLibrary";
import { buildListTreeIndex, wouldCreateListCycle } from "../../lib/listTree";
import type { ListCollection, ListItemStatus } from "../../types";

export const DEFAULT_LISTS_SIDEBAR_WIDTH = 252;
export const MIN_LISTS_SIDEBAR_WIDTH = 200;
export const MAX_LISTS_SIDEBAR_WIDTH = 380;

export type ListsSidebarScope =
  | { kind: "list"; listId: string }
  | { kind: "smart"; status: ListItemStatus };

export interface ListsWorkspaceTreeProps {
  lists: ListCollection[];
  listItemCounts: Map<string, number>;
  directListItemCounts?: Map<string, number>;
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
  sectionsCollapsed: { smart: boolean; lists: boolean };
  expandedListIds: Record<string, boolean>;
  onToggleExpandList: (listId: string) => void;
  onToggleSection: (section: "smart" | "lists") => void;
  onSelectScope: (scope: ListsSidebarScope) => void;
  onCreateList: () => void;
  onCreateSublist: (parentList: ListCollection) => void;
  onEditList: (list: ListCollection) => void;
  onDeleteList: (list: ListCollection) => void;
  onReorderList: (
    draggedId: string,
    targetId: string,
    position: "before" | "after" | "inside",
  ) => void;
  onMoveItemToList: (itemId: string, targetListId: string) => void;
  onChangeItemStatus: (itemId: string, targetStatus: ListItemStatus) => void;
  activeDragItemIdRef: React.MutableRefObject<string | null>;
  onClearAllDragStates: () => void;
}

interface ListsLeftSidebarProps extends ListsWorkspaceTreeProps {
  sidebarWidth: number;
  isCollapsedDesktop: boolean;
  onCollapseDesktop: () => void;
  onSidebarWidthChange: (width: number) => void;
}

const ListsWorkspaceTreeBody: React.FC<
  ListsWorkspaceTreeProps & { variant: "sidebar" | "tab" }
> = ({
  variant,
  lists,
  listItemCounts,
  directListItemCounts,
  globalStatusCounts,
  statusOrder,
  statusMeta,
  scope,
  sectionsCollapsed,
  expandedListIds,
  onToggleExpandList,
  onToggleSection,
  onSelectScope,
  onCreateList,
  onCreateSublist,
  onEditList,
  onDeleteList,
  onReorderList,
  onMoveItemToList,
  onChangeItemStatus,
  activeDragItemIdRef,
  onClearAllDragStates,
}) => {
  const isTab = variant === "tab";
  const [sidebarSearch, setSidebarSearch] = useState("");

  // Drag & drop highlights inside sidebar
  const dragListRowIdRef = useRef<string | null>(null);
  const [draggingListRowId, setDraggingListRowId] = useState<string | null>(
    null,
  );
  const [listRowDropTarget, setListRowDropTarget] = useState<{
    listId: string;
    position: "before" | "after" | "inside";
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

  const treeIndex = useMemo(() => buildListTreeIndex(lists), [lists]);

  const hasAnyNestedLists = useMemo(
    () => lists.some((l) => Boolean(l.parentId && treeIndex.byId.has(l.parentId))),
    [lists, treeIndex.byId],
  );

  // When searching, compute which nodes match directly or have matching descendants
  const visibleSearchIds = useMemo(() => {
    if (!normalizedSearch) return null;
    const visible = new Set<string>();
    const visit = (node: ListCollection): boolean => {
      const selfMatches = node.title.toLowerCase().includes(normalizedSearch);
      const children = treeIndex.childrenMap.get(node.id) || [];
      let childMatches = false;
      for (const child of children) {
        if (visit(child)) childMatches = true;
      }
      if (selfMatches || childMatches) {
        visible.add(node.id);
        return true;
      }
      return false;
    };
    for (const root of treeIndex.rootLists) {
      visit(root);
    }
    return visible;
  }, [normalizedSearch, treeIndex]);

  const resetSidebarDrag = () => {
    dragListRowIdRef.current = null;
    setDraggingListRowId(null);
    setListRowDropTarget(null);
    setItemDropHighlightKey(null);
  };

  const computeListRowDropPosition = (
    e: React.DragEvent<HTMLDivElement>,
    draggedId: string | null,
    targetList: ListCollection,
  ): "before" | "after" | "inside" | null => {
    if (!draggedId || draggedId === targetList.id) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const rawPos: "before" | "after" | "inside" =
      relY < rect.height * 0.28
        ? "before"
        : relY > rect.height * 0.72
          ? "after"
          : "inside";

    const candidateParentId =
      rawPos === "inside" ? targetList.id : (targetList.parentId ?? null);

    if (wouldCreateListCycle(draggedId, candidateParentId, treeIndex.byId)) {
      return null;
    }
    return rawPos;
  };

  const renderListNode = (
    list: ListCollection,
    depth: number,
  ): React.ReactNode => {
    if (visibleSearchIds && !visibleSearchIds.has(list.id)) {
      return null;
    }

    const children = (treeIndex.childrenMap.get(list.id) || []).filter(
      (c) => !visibleSearchIds || visibleSearchIds.has(c.id),
    );
    const allChildren = treeIndex.childrenMap.get(list.id) || [];
    const hasChildren = allChildren.length > 0;
    const isExpanded = normalizedSearch
      ? children.length > 0
      : Boolean(expandedListIds[list.id]);

    const active = scope.kind === "list" && scope.listId === list.id;
    const totalCount = listItemCounts.get(list.id) || 0;
    const directCount = directListItemCounts?.get(list.id) ?? totalCount;
    const accentHex = list.color || "#4f46e5";
    const isBeingDragged = draggingListRowId === list.id;
    const dropKey = `list:${list.id}`;
    const isItemDropHover = itemDropHighlightKey === dropKey;
    const isOrderDropTarget = listRowDropTarget?.listId === list.id;
    const dropPos = isOrderDropTarget ? listRowDropTarget?.position : null;

    return (
      <div key={list.id} className="space-y-0.5">
        <div
          draggable={!isTab && !normalizedSearch}
          onDragStart={(e) => {
            if (isTab || normalizedSearch) {
              e.preventDefault();
              return;
            }
            e.dataTransfer.setData("application/x-kanso-list-tab-id", list.id);
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
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setItemDropHighlightKey(dropKey);
              return;
            }
            if (
              !normalizedSearch &&
              types.includes("application/x-kanso-list-tab-id")
            ) {
              const pos = computeListRowDropPosition(
                e,
                dragListRowIdRef.current,
                list,
              );
              if (!pos) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setListRowDropTarget((prev) =>
                prev?.listId === list.id && prev.position === pos
                  ? prev
                  : { listId: list.id, position: pos },
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
                e.dataTransfer.getData("application/x-kanso-list-item-id") ||
                activeDragItemIdRef.current;
              resetSidebarDrag();
              onClearAllDragStates();
              if (!itemId) return;
              e.preventDefault();
              onMoveItemToList(itemId, list.id);
              return;
            }
            if (types.includes("application/x-kanso-list-tab-id")) {
              const draggedId =
                e.dataTransfer.getData("application/x-kanso-list-tab-id") ||
                dragListRowIdRef.current;
              const pos = computeListRowDropPosition(e, draggedId, list);
              resetSidebarDrag();
              onClearAllDragStates();
              if (!draggedId || !pos) return;
              e.preventDefault();
              onReorderList(draggedId, list.id, pos);
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
          className={`group relative flex items-center gap-1.5 pr-2 rounded-lg hover:bg-[var(--bg-surface-hover)] ${
            isTab ? "py-1.5 text-[13px]" : "py-1 text-xs"
          } ${isBeingDragged ? "opacity-45" : ""} ${
            isItemDropHover || dropPos === "inside"
              ? "ring-1 ring-[var(--accent)]"
              : ""
          }`}
          style={{
            paddingLeft: `${(isTab ? 10 : 8) + Math.min(depth, 6) * (isTab ? 16 : 14)}px`,
            backgroundColor:
              isItemDropHover || dropPos === "inside"
                ? "var(--accent-soft)"
                : active
                  ? `${accentHex}16`
                  : undefined,
            boxShadow:
              dropPos === "before"
                ? "inset 0 2px 0 var(--accent)"
                : dropPos === "after"
                  ? "inset 0 -2px 0 var(--accent)"
                  : undefined,
          }}
        >
          {/* Expand/collapse chevron */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpandList(list.id);
              }}
              aria-label={
                isExpanded
                  ? `Collapse ${list.title} sublists`
                  : `Expand ${list.title} sublists`
              }
              className={`${
                isTab ? "w-5 h-5" : "w-4 h-4 -ml-0.5"
              } flex items-center justify-center rounded hover:bg-[var(--bg-surface)] shrink-0 cursor-pointer`}
              style={{ color: "var(--text-muted)" }}
            >
              {isExpanded ? (
                <ChevronDown className={isTab ? "w-3.5 h-3.5" : "w-3 h-3"} />
              ) : (
                <ChevronRight className={isTab ? "w-3.5 h-3.5" : "w-3 h-3"} />
              )}
            </button>
          ) : hasAnyNestedLists ? (
            <span className={isTab ? "w-5 shrink-0" : "w-3.5 shrink-0"} aria-hidden="true" />
          ) : null}

          <button
            type="button"
            onClick={() => onSelectScope({ kind: "list", listId: list.id })}
            className="flex-1 min-w-0 flex items-center gap-2 py-0.5 text-left cursor-pointer"
            title={
              hasChildren
                ? `${list.title} (${directCount} direct, ${totalCount} total)`
                : list.title
            }
          >
            <CollectionIcon
              name={list.icon}
              className={isTab ? "w-4 h-4 shrink-0" : "w-3.5 h-3.5 shrink-0"}
              style={{ color: accentHex }}
            />
            <span
              className={`truncate ${active ? "font-semibold" : "font-medium"}`}
              style={{
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {list.title}
            </span>
          </button>

          {/* Inline Actions on mobile tab only (+ Sublist, Edit, Delete) + Recursive Item Count */}
          <div className="flex items-center gap-0.5 shrink-0">
            {isTab && (
              <div className="flex items-center gap-0.5 opacity-75">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateSublist(list);
                  }}
                  title={`New sublist in ${list.title}`}
                  aria-label={`New sublist in ${list.title}`}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditList(list);
                  }}
                  title="Edit list"
                  aria-label={`Edit ${list.title}`}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteList(list);
                  }}
                  title="Delete list"
                  aria-label={`Delete ${list.title}`}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <span
              className="font-mono tabular-nums text-[11px] min-w-[20px] text-right"
              style={{
                color: active ? accentHex : "var(--text-muted)",
              }}
            >
              {totalCount}
            </span>
          </div>
        </div>

        {/* Recursive Children */}
        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
            {children.map((child) => renderListNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderedRootNodes = treeIndex.rootLists
    .map((root) => renderListNode(root, 0))
    .filter(Boolean);

  return (
    <>
      {/* Find List Search Box */}
      <div className={isTab ? "px-4 pt-3 pb-1 shrink-0" : "px-2.5 pt-2.5 pb-1 shrink-0"}>
        <div
          className={`${
            isTab ? "h-9 px-3" : "h-8 px-2.5"
          } rounded-lg border flex items-center gap-2`}
          style={{
            backgroundColor: isTab ? "var(--bg-surface)" : "var(--bg-canvas)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <Search
            className={isTab ? "w-4 h-4 shrink-0" : "w-3.5 h-3.5 shrink-0"}
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
            placeholder="Find list..."
            aria-label="Filter lists in workspace"
            className={`flex-1 min-w-0 bg-transparent outline-none placeholder:opacity-60 ${
              isTab ? "text-[13px]" : "text-xs"
            }`}
            style={{ color: "var(--text-primary)" }}
          />
          {sidebarSearch && (
            <button
              type="button"
              onClick={() => setSidebarSearch("")}
              aria-label="Clear search"
              className="opacity-70 hover:opacity-100 cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <X className={isTab ? "w-3.5 h-3.5" : "w-3 h-3"} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Sections */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto ${
          isTab ? "px-3.5 py-3.5 space-y-4" : "px-2 py-2.5 space-y-3"
        }`}
      >
        {/* Section 1: Cross-List Smart Views */}
        {filteredSmartStatuses.length > 0 && (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => onToggleSection("smart")}
              className={`w-full px-1.5 flex items-center justify-between font-semibold uppercase tracking-wider cursor-pointer ${
                isTab ? "text-[11px]" : "text-[10.5px]"
              }`}
              style={{ color: "var(--text-muted)" }}
            >
              <span>Smart Views</span>
              {sectionsCollapsed.smart ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {!sectionsCollapsed.smart && (
              <div className={isTab ? "space-y-1" : "space-y-0.5"}>
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
                      onClick={() => onSelectScope({ kind: "smart", status: st })}
                      className={`w-full rounded-lg flex items-center justify-between gap-2 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer ${
                        isTab
                          ? "px-3 py-2 text-[13px]"
                          : "px-2 py-1.5 text-xs"
                      } ${isItemDropHover ? "ring-1 ring-[var(--accent)]" : ""}`}
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
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={isTab ? "w-4 h-4 shrink-0" : "w-3.5 h-3.5 shrink-0"}
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

        {/* Section 2: User Lists (Nested Tree) */}
        <div className="space-y-1.5">
          <div className="px-1.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onToggleSection("lists")}
              className={`flex items-center gap-1 font-semibold uppercase tracking-wider cursor-pointer ${
                isTab ? "text-[11px]" : "text-[10.5px]"
              }`}
              style={{ color: "var(--text-muted)" }}
            >
              <span>Your Lists</span>
              {sectionsCollapsed.lists ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onCreateList}
              title="Create new list"
              aria-label="Create new list"
              className={`${
                isTab ? "w-7 h-7" : "w-5 h-5"
              } flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer`}
              style={{ color: "var(--text-muted)" }}
            >
              <Plus className={isTab ? "w-3.5 h-3.5" : "w-3 h-3"} />
            </button>
          </div>

          {!sectionsCollapsed.lists && (
            <div className={isTab ? "space-y-1" : "space-y-0.5"}>
              {renderedRootNodes}

              {renderedRootNodes.length === 0 && (
                <p
                  className="px-2 py-2 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {normalizedSearch ? "No matching lists" : "No lists yet"}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar List Row Right-Click Context Menu */}
      {listRowContextMenu && (
        <div
          className="fixed inset-0 z-[80]"
          onClick={() => setListRowContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setListRowContextMenu(null);
          }}
        >
          <div
            className="fixed w-48 rounded-xl border p-1 space-y-0.5"
            onClick={(e) => e.stopPropagation()}
            style={{
              left:
                typeof window !== "undefined"
                  ? Math.min(
                      Math.max(12, listRowContextMenu.x),
                      window.innerWidth - 204,
                    )
                  : listRowContextMenu.x,
              top:
                typeof window !== "undefined"
                  ? Math.min(
                      Math.max(12, listRowContextMenu.y),
                      window.innerHeight - 196,
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
                onSelectScope({ kind: "list", listId: target.id });
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              style={{ color: "var(--text-primary)" }}
            >
              <ExternalLink className="w-3.5 h-3.5 opacity-75" />
              <span>Open List</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const target = listRowContextMenu.list;
                setListRowContextMenu(null);
                onCreateSublist(target);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              style={{ color: "var(--text-primary)" }}
            >
              <FolderPlus className="w-3.5 h-3.5 opacity-75" />
              <span>New Sublist</span>
            </button>
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
              <span>Rename / Edit</span>
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

export const ListsWorkspaceTab: React.FC<ListsWorkspaceTreeProps> = (props) => {
  const { onCreateList } = props;

  return (
    <div
      className="lg:hidden flex-1 min-h-0 flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--bg-canvas)" }}
    >
      {/* Pinned Workspace Tab Header */}
      <header
        className="shrink-0 relative z-20 px-4 sm:px-6 pt-4 pb-3 border-b bg-[var(--bg-canvas)] flex items-center justify-between gap-3"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <h1 className="font-display text-lg font-semibold tracking-tight leading-tight">
          Workspace
        </h1>

        <button
          type="button"
          onClick={onCreateList}
          className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--accent-fg)",
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New List</span>
        </button>
      </header>

      <ListsWorkspaceTreeBody {...props} variant="tab" />
    </div>
  );
};

export const ListsLeftSidebar: React.FC<ListsLeftSidebarProps> = ({
  sidebarWidth,
  isCollapsedDesktop,
  onCollapseDesktop,
  onSidebarWidthChange,
  ...treeProps
}) => {
  const [isResizing, setIsResizing] = useState(false);

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

  if (isCollapsedDesktop) return null;

  return (
    <div className="hidden lg:block h-full shrink-0">
      <aside
        aria-label="Lists navigation sidebar"
        className="relative h-full flex flex-col border-r shrink-0 select-none"
        style={{
          width: sidebarWidth,
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
              onClick={treeProps.onCreateList}
              title="New list collection"
              aria-label="New list collection"
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              <Plus className="w-4 h-4" />
            </button>
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
          </div>
        </div>

        <ListsWorkspaceTreeBody {...treeProps} variant="sidebar" />

        {/* Desktop Drag-Resize Divider */}
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
      </aside>
    </div>
  );
};
