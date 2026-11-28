import {
  BookMarked,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Download,
  Folder,
  FolderPlus,
  HardDrive,
  Highlighter,
  Library,
  PanelLeftClose,
  Pencil,
  Plus,
  Star,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { DynamicIcon } from "../IconLibrary";
import { IconPickerPopover } from "../IconPicker";
import type { LibraryPointerDropTarget } from "../../hooks/useLibraryBookDrag";
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "../../hooks/usePreferences";
import {
  FOLDER_COLORS,
  formatFileSize,
  getBookFolderIds,
  getFolderColorHex,
  getFolderDescendantIds,
} from "../../lib/formatters";
import type {
  BookRecord,
  CategoryRecord,
  FolderColor,
  FolderRecord,
  SidebarSectionKey,
  SmartView,
} from "../../types/library";

export interface ActiveLibraryFilter {
  kind: "smart" | "folder" | "category";
  id: string;
}

interface LibrarySidebarProps {
  books: BookRecord[];
  folders: FolderRecord[];
  categories: CategoryRecord[];
  allTags: Array<{ name: string; count: number }>;
  totalHighlightsCount: number;
  activeFilter: ActiveLibraryFilter;
  selectedTags: string[];
  collapsedSections: Record<SidebarSectionKey, boolean>;
  sidebarWidth: number;
  isExportingBackup: boolean;
  isParsingBackup: boolean;
  onSidebarWidthChange: (width: number) => void;
  onToggleSection: (section: SidebarSectionKey) => void;
  onSelectFilter: (filter: ActiveLibraryFilter) => void;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  onCreateFolder: (
    name: string,
    parentId?: string | null,
    color?: FolderColor,
    icon?: string,
  ) => void;
  onUpdateFolder: (
    id: string,
    patch: { name?: string; color?: FolderColor; icon?: string },
  ) => void;
  onDeleteFolder: (id: string) => void;
  onCreateCategory: (name: string, icon?: string) => void;
  onUpdateCategory: (
    id: string,
    patch: { name?: string; icon?: string },
  ) => void;
  onDeleteCategory: (id: string) => void;
  onDropBooksToFolder: (bookIds: string[], folderId: string) => void;
  onDropBooksToCategory: (bookIds: string[], categoryId: string) => void;
  onDropBooksToTag: (bookIds: string[], tagName: string) => void;
  onDropBooksToFavorites: (bookIds: string[]) => void;
  onExportBackup: () => void;
  onSelectImportBackupFile: (file: File) => void;
  onOpenStorageManager: () => void;
  isCollapsedDesktop?: boolean;
  onCollapseDesktop?: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  activePointerDropTarget?: LibraryPointerDropTarget | null;
}

function extractDraggedBookIds(dt: DataTransfer): string[] {
  const multiRaw = dt.getData("application/x-folio-book-ids");
  if (multiRaw) {
    try {
      const parsed = JSON.parse(multiRaw);
      if (Array.isArray(parsed)) {
        const ids = parsed.filter((id): id is string => typeof id === "string");
        if (ids.length > 0) return ids;
      }
    } catch {
      // fall through
    }
  }
  const single = dt.getData("application/x-folio-book-id");
  return single ? [single] : [];
}

function hasDraggedBookPayload(dt: DataTransfer): boolean {
  return (
    dt.types.includes("application/x-folio-book-ids") ||
    dt.types.includes("application/x-folio-book-id")
  );
}

export const LibrarySidebar: React.FC<LibrarySidebarProps> = ({
  books,
  folders,
  categories,
  allTags,
  totalHighlightsCount,
  activeFilter,
  selectedTags,
  collapsedSections,
  sidebarWidth,
  isExportingBackup,
  isParsingBackup,
  onSidebarWidthChange,
  onToggleSection,
  onSelectFilter,
  onToggleTag,
  onClearTags,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onDropBooksToFolder,
  onDropBooksToCategory,
  onDropBooksToTag,
  onDropBooksToFavorites,
  onExportBackup,
  onSelectImportBackupFile,
  onOpenStorageManager,
  isCollapsedDesktop = false,
  onCollapseDesktop,
  isOpenMobile,
  onCloseMobile,
  scrollContainerRef,
  activePointerDropTarget,
}) => {
  // Root or nested folder creation state
  const [addingFolderParentId, setAddingFolderParentId] = useState<
    string | null | undefined
  >(undefined);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState<FolderColor>("neutral");
  const [newFolderIcon, setNewFolderIcon] = useState("Folder");
  const [newFolderIconOpen, setNewFolderIconOpen] = useState(false);

  // Inline folder editing state (name + color + icon)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [editingFolderColor, setEditingFolderColor] =
    useState<FolderColor>("neutral");
  const [editingFolderIcon, setEditingFolderIcon] = useState("Folder");
  const [editingFolderIconOpen, setEditingFolderIconOpen] = useState(false);

  // Collapsed folder tree nodes
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    new Set(),
  );

  // Category creation & inline edit state
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("Bookmark");
  const [newCategoryIconOpen, setNewCategoryIconOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategoryIcon, setEditingCategoryIcon] = useState("Bookmark");
  const [editingCategoryIconOpen, setEditingCategoryIconOpen] = useState(false);

  // Drag-over highlight target
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Right-click context menu for sidebar folders & categories
  const [sidebarContextMenu, setSidebarContextMenu] = useState<
    | {
        kind: "folder";
        folder: FolderRecord;
        depth: number;
        x: number;
        y: number;
      }
    | {
        kind: "category";
        category: CategoryRecord;
        x: number;
        y: number;
      }
    | null
  >(null);

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
      setNewFolderIconOpen(false);
      setEditingFolderIconOpen(false);
      setNewCategoryIconOpen(false);
      setEditingCategoryIconOpen(false);
    };
    setIsLgViewport(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Resizing state
  const [isResizing, setIsResizing] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const totalBytes = books.reduce((sum, b) => sum + (b.fileSize || 0), 0);

  const smartCounts: Record<SmartView, number> = {
    all: books.length,
    reading: books.filter((b) => b.status === "reading").length,
    unread: books.filter((b) => b.status === "unread").length,
    finished: books.filter((b) => b.status === "finished").length,
    favorites: books.filter((b) => b.isFavorite).length,
    highlights: totalHighlightsCount,
  };

  const smartItems: Array<{
    id: SmartView;
    label: string;
    icon: React.ReactNode;
    acceptsDrop?: boolean;
  }> = [
    {
      id: "all",
      label: "All Books",
      icon: <Library className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: "reading",
      label: "Currently Reading",
      icon: <BookOpen className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: "unread",
      label: "Unread",
      icon: <Circle className="w-3 h-3 shrink-0" />,
    },
    {
      id: "finished",
      label: "Finished",
      icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: "favorites",
      label: "Favorites",
      icon: <Star className="w-3.5 h-3.5 shrink-0" />,
      acceptsDrop: true,
    },
    {
      id: "highlights",
      label: "Highlights & Notes",
      icon: <Highlighter className="w-3.5 h-3.5 shrink-0" />,
    },
  ];

  // Build children map for nested folder rendering
  const folderChildrenMap = useMemo(() => {
    const byId = new Set(folders.map((f) => f.id));
    const map = new Map<string | null, FolderRecord[]>();
    for (const folder of folders) {
      const parentKey =
        folder.parentId && byId.has(folder.parentId) ? folder.parentId : null;
      const list = map.get(parentKey) ?? [];
      list.push(folder);
      map.set(parentKey, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [folders]);

  const folderBookCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const folder of folders) {
      const descendants = getFolderDescendantIds(folders, folder.id);
      counts.set(
        folder.id,
        books.filter((b) =>
          getBookFolderIds(b).some((id) => descendants.has(id)),
        ).length,
      );
    }
    return counts;
  }, [folders, books]);

  const handleStartResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, startWidth + (moveEvent.clientX - startX)),
      );
      onSidebarWidthChange(nextWidth);
    };

    const onPointerUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const handleFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (trimmed && addingFolderParentId !== undefined) {
      onCreateFolder(trimmed, addingFolderParentId, newFolderColor, newFolderIcon);
      if (addingFolderParentId) {
        setCollapsedFolderIds((prev) => {
          const next = new Set(prev);
          next.delete(addingFolderParentId);
          return next;
        });
      }
      setNewFolderName("");
      setNewFolderColor("neutral");
      setNewFolderIcon("Folder");
      setNewFolderIconOpen(false);
      setAddingFolderParentId(undefined);
    }
  };

  const handleFolderEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = editingFolderName.trim();
    if (editingFolderId && trimmed) {
      onUpdateFolder(editingFolderId, {
        name: trimmed,
        color: editingFolderColor,
        icon: editingFolderIcon,
      });
    }
    setEditingFolderId(null);
    setEditingFolderName("");
    setEditingFolderIconOpen(false);
  };

  const handleCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (trimmed) {
      onCreateCategory(trimmed, newCategoryIcon);
      setNewCategoryName("");
      setNewCategoryIcon("Bookmark");
      setNewCategoryIconOpen(false);
      setAddingCategory(false);
    }
  };

  const handleCategoryEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = editingCategoryName.trim();
    if (editingCategoryId && trimmed) {
      onUpdateCategory(editingCategoryId, {
        name: trimmed,
        icon: editingCategoryIcon,
      });
    }
    setEditingCategoryId(null);
    setEditingCategoryName("");
    setEditingCategoryIconOpen(false);
  };

  const selectAndClose = (filter: ActiveLibraryFilter) => {
    onSelectFilter(filter);
    onCloseMobile();
  };

  const toggleFolderExpanded = (folderId: string) => {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const renderColorSwatches = (
    selected: FolderColor,
    onSelect: (c: FolderColor) => void,
  ) => (
    <div className="flex items-center gap-1.5 pt-1">
      {FOLDER_COLORS.map((col) => (
        <button
          key={col.id}
          type="button"
          title={col.label}
          aria-label={`Folder color ${col.label}`}
          onClick={() => onSelect(col.id)}
          className={`w-3.5 h-3.5 rounded-full border transition-transform cursor-pointer ${
            selected === col.id
              ? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg-sidebar)] scale-105"
              : "border-black/15 opacity-80 hover:opacity-100"
          }`}
          style={{ backgroundColor: col.swatch }}
        />
      ))}
    </div>
  );

  const renderFolderForm = (parentId: string | null, depth: number) => {
    const newFolderHex = getFolderColorHex(newFolderColor) ?? undefined;
    return (
      <form
        onSubmit={handleFolderSubmit}
        className="my-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 space-y-1.5"
        style={{ marginLeft: `${depth * 12}px` }}
      >
        <div className="flex items-center gap-1.5">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setNewFolderIconOpen((v) => !v)}
              title="Choose folder icon"
              aria-label="Choose folder icon"
              className="w-7 h-7 rounded border border-[var(--border-strong)] bg-[var(--bg-input)] flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={newFolderHex ? { color: newFolderHex } : { color: "var(--accent)" }}
            >
              <DynamicIcon name={newFolderIcon} className="w-3.5 h-3.5" />
            </button>
            <IconPickerPopover
              open={newFolderIconOpen}
              onClose={() => setNewFolderIconOpen(false)}
              value={newFolderIcon}
              onChange={setNewFolderIcon}
              accentColor={newFolderHex}
              title="Folder Icon"
              widthClass="w-[268px]"
            />
          </div>
          <input
            type="text"
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={parentId ? "Sub-folder name..." : "Folder name..."}
            className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setAddingFolderParentId(undefined);
                setNewFolderName("");
                setNewFolderIconOpen(false);
              }
            }}
          />
          <button
            type="submit"
            className="px-2 py-1 text-[11px] font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] cursor-pointer shrink-0"
          >
            Add
          </button>
        </div>
        {renderColorSwatches(newFolderColor, setNewFolderColor)}
      </form>
    );
  };

  const renderFolderTree = (
    parentId: string | null,
    depth: number,
    isDesktop: boolean,
  ): React.ReactNode => {
    const items = folderChildrenMap.get(parentId) ?? [];
    return items.map((folder) => {
      const children = folderChildrenMap.get(folder.id) ?? [];
      const hasChildren = children.length > 0;
      const isExpanded = !collapsedFolderIds.has(folder.id);
      const active =
        activeFilter.kind === "folder" && activeFilter.id === folder.id;
      const count = folderBookCountMap.get(folder.id) ?? 0;
      const isEditing = editingFolderId === folder.id;
      const dropKey = `folder:${folder.id}`;
      const isDragOver =
        dragOverKey === dropKey ||
        (activePointerDropTarget?.kind === "sidebar-folder" &&
          activePointerDropTarget.id === folder.id);
      const accentHex = getFolderColorHex(folder.color);
      const editingHex = getFolderColorHex(editingFolderColor) ?? undefined;

      return (
        <div key={folder.id}>
          {isEditing ? (
            <form
              onSubmit={handleFolderEditSubmit}
              className="my-1 rounded-md border border-[var(--accent)] bg-[var(--bg-surface)] p-2 space-y-1.5"
              style={{ marginLeft: `${depth * 12}px` }}
            >
              <div className="flex items-center gap-1">
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingFolderIconOpen((v) => !v)}
                    title="Choose folder icon"
                    aria-label="Choose folder icon"
                    className="w-7 h-7 rounded border border-[var(--border-strong)] bg-[var(--bg-input)] flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={editingHex ? { color: editingHex } : { color: "var(--accent)" }}
                  >
                    <DynamicIcon name={editingFolderIcon} className="w-3.5 h-3.5" />
                  </button>
                  <IconPickerPopover
                    open={editingFolderIconOpen}
                    onClose={() => setEditingFolderIconOpen(false)}
                    value={editingFolderIcon}
                    onChange={setEditingFolderIcon}
                    accentColor={editingHex}
                    title="Folder Icon"
                    widthClass="w-[268px]"
                  />
                </div>
                <input
                  type="text"
                  autoFocus
                  value={editingFolderName}
                  onChange={(e) => setEditingFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setEditingFolderId(null);
                      setEditingFolderIconOpen(false);
                    }
                  }}
                  className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)]"
                />
                <button
                  type="submit"
                  className="px-2 py-1 text-[11px] font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] cursor-pointer"
                >
                  Save
                </button>
              </div>
              {renderColorSwatches(editingFolderColor, setEditingFolderColor)}
            </form>
          ) : (
            <div
              data-library-drop-kind="sidebar-folder"
              data-library-drop-id={folder.id}
              data-library-drop-label={folder.name}
              onDragOver={(e) => {
                if (hasDraggedBookPayload(e.dataTransfer)) {
                  e.preventDefault();
                  setDragOverKey(dropKey);
                }
              }}
              onDragLeave={() => {
                if (dragOverKey === dropKey) setDragOverKey(null);
              }}
              onDrop={(e) => {
                const ids = extractDraggedBookIds(e.dataTransfer);
                if (ids.length > 0) {
                  e.preventDefault();
                  onDropBooksToFolder(ids, folder.id);
                }
                setDragOverKey(null);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSidebarContextMenu({
                  kind: "folder",
                  folder,
                  depth,
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
              style={{ paddingLeft: `${6 + Math.min(depth, 3) * 12}px` }}
              className={`group flex items-center justify-between gap-1 pr-2 py-1.5 rounded-md text-xs transition-colors ${
                isDragOver
                  ? "ring-1 ring-[var(--accent)] bg-[var(--bg-accent-subtle)]"
                  : active
                    ? "bg-[var(--bg-accent-subtle)] text-[var(--accent)] font-medium"
                    : "text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
              }`}
            >
              <div className="flex items-center gap-1 min-w-0 flex-1">
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFolderExpanded(folder.id);
                    }}
                    aria-label={
                      isExpanded
                        ? `Collapse ${folder.name}`
                        : `Expand ${folder.name}`
                    }
                    className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </button>
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}

                <button
                  type="button"
                  onClick={() =>
                    selectAndClose({ kind: "folder", id: folder.id })
                  }
                  className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                  title={folder.name}
                >
                  <DynamicIcon
                    name={folder.icon || "Folder"}
                    className="w-3.5 h-3.5 shrink-0"
                    style={
                      accentHex
                        ? { color: accentHex }
                        : { color: active ? "var(--accent)" : "var(--text-secondary)" }
                    }
                  />
                  <span className="truncate">{folder.name}</span>
                </button>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                {!isDesktop && (
                  <>
                    {depth < 3 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddingFolderParentId(folder.id);
                          setNewFolderName("");
                          setNewFolderColor(folder.color ?? "neutral");
                          setNewFolderIcon("Folder");
                        }}
                        title={`Add sub-folder inside ${folder.name}`}
                        aria-label={`Add sub-folder inside ${folder.name}`}
                        className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer opacity-75 hover:opacity-100"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFolderId(folder.id);
                        setEditingFolderName(folder.name);
                        setEditingFolderColor(folder.color ?? "neutral");
                        setEditingFolderIcon(folder.icon || "Folder");
                        setEditingFolderIconOpen(false);
                      }}
                      title="Edit folder name, color & icon"
                      aria-label={`Edit ${folder.name}`}
                      className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer opacity-75 hover:opacity-100"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFolder(folder.id);
                      }}
                      title="Delete folder"
                      aria-label={`Delete ${folder.name}`}
                      className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--danger)] cursor-pointer opacity-75 hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] w-4 text-right">
                  {count}
                </span>
              </div>
            </div>
          )}

          {/* Inline Sub-Folder Creation Form */}
          {addingFolderParentId === folder.id &&
            renderFolderForm(folder.id, depth + 1)}

          {/* Nested Children */}
          {hasChildren && isExpanded && (
            <div className="mt-0.5 space-y-0.5">
              {renderFolderTree(folder.id, depth + 1, isDesktop)}
            </div>
          )}
        </div>
      );
    });
  };

  const sidebarContent = (isDesktop: boolean) => (
    <aside
      style={isDesktop ? { width: `${sidebarWidth}px` } : { width: "264px" }}
      className="relative flex flex-col h-full shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] select-none"
    >
      {/* Hidden Backup File Input */}
      <input
        ref={backupInputRef}
        type="file"
        accept=".zip,application/zip"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelectImportBackupFile(file);
          e.target.value = "";
        }}
        className="hidden"
      />

      {/* Rail Header */}
      <div className="h-[52px] px-4 flex items-center justify-between border-b border-[var(--border-subtle)] shrink-0">
        <button
          type="button"
          onClick={() => selectAndClose({ kind: "smart", id: "all" })}
          className="flex items-center gap-2 text-left cursor-pointer whitespace-nowrap shrink-0"
        >
          <BookMarked className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <span className="font-display text-base font-semibold tracking-tight text-[var(--text-primary)]">
            Shelves
          </span>
        </button>

        {isDesktop && onCollapseDesktop && (
          <button
            type="button"
            onClick={onCollapseDesktop}
            title="Hide shelves sidebar"
            aria-label="Hide shelves sidebar"
            className="hidden lg:inline-flex p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close sidebar"
          className="lg:hidden p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Navigation Sections (Compact 12px Scale) */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain px-2.5 py-3.5 space-y-4"
      >
        {/* Smart Library Views */}
        <div>
          <button
            type="button"
            onClick={() => onToggleSection("library")}
            className="w-full px-2 mb-1 flex items-center justify-between text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <span>Library</span>
            {collapsedSections.library ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>

          {!collapsedSections.library && (
            <nav className="space-y-0.5" aria-label="Library views">
              {smartItems.map((item) => {
                const active =
                  activeFilter.kind === "smart" && activeFilter.id === item.id;
                const dropKey = `smart:${item.id}`;
                const isDragOver =
                  item.acceptsDrop &&
                  (dragOverKey === dropKey ||
                    (item.id === "favorites" &&
                      activePointerDropTarget?.kind === "sidebar-favorites"));

                return (
                  <button
                    key={item.id}
                    type="button"
                    data-library-drop-kind={
                      item.acceptsDrop && item.id === "favorites"
                        ? "sidebar-favorites"
                        : undefined
                    }
                    data-library-drop-label={
                      item.acceptsDrop ? item.label : undefined
                    }
                    onClick={() =>
                      selectAndClose({ kind: "smart", id: item.id })
                    }
                    onDragOver={(e) => {
                      if (
                        item.acceptsDrop &&
                        hasDraggedBookPayload(e.dataTransfer)
                      ) {
                        e.preventDefault();
                        setDragOverKey(dropKey);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverKey === dropKey) setDragOverKey(null);
                    }}
                    onDrop={(e) => {
                      if (!item.acceptsDrop) return;
                      const ids = extractDraggedBookIds(e.dataTransfer);
                      if (ids.length > 0) {
                        e.preventDefault();
                        onDropBooksToFavorites(ids);
                      }
                      setDragOverKey(null);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      isDragOver
                        ? "ring-1 ring-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]"
                        : active
                          ? "bg-[var(--bg-accent-subtle)] text-[var(--accent)] font-medium"
                          : "text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className={
                          active || isDragOver
                            ? "text-[var(--accent)]"
                            : "text-[var(--text-secondary)]"
                        }
                      >
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] shrink-0">
                      {smartCounts[item.id]}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        {/* Nested Colored Folders Section */}
        <div>
          <div className="px-2 mb-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onToggleSection("folders")}
              className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {collapsedSections.folders ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              <span>Folders</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (collapsedSections.folders) onToggleSection("folders");
                setAddingFolderParentId((prev) =>
                  prev === null ? undefined : null,
                );
                setNewFolderName("");
                setNewFolderColor("neutral");
              }}
              title="New folder"
              aria-label="Create new folder"
              className="p-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          {!collapsedSections.folders && (
            <>
              {addingFolderParentId === null && renderFolderForm(null, 0)}

              {folders.length === 0 && addingFolderParentId === undefined ? (
                <p className="px-2 py-1 text-[11px] text-[var(--text-muted)]">
                  No folders yet
                </p>
              ) : (
                <div className="space-y-0.5">
                  {renderFolderTree(null, 0, isDesktop)}
                </div>
              )}
            </>
          )}
        </div>

        {/* Categories Section (Drag-and-Drop Enabled) */}
        <div>
          <div className="px-2 mb-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onToggleSection("categories")}
              className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {collapsedSections.categories ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              <span>Categories</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (collapsedSections.categories) onToggleSection("categories");
                setAddingCategory((v) => !v);
              }}
              title="New category"
              aria-label="Create new category"
              className="p-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {!collapsedSections.categories && (
            <>
              {addingCategory && (
                <form onSubmit={handleCategorySubmit} className="px-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setNewCategoryIconOpen((v) => !v)}
                        title="Choose category icon"
                        aria-label="Choose category icon"
                        className="w-7 h-7 rounded border border-[var(--border-strong)] bg-[var(--bg-input)] flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        style={{ color: "var(--accent)" }}
                      >
                        <DynamicIcon name={newCategoryIcon} className="w-3.5 h-3.5" />
                      </button>
                      <IconPickerPopover
                        open={newCategoryIconOpen}
                        onClose={() => setNewCategoryIconOpen(false)}
                        value={newCategoryIcon}
                        onChange={setNewCategoryIcon}
                        title="Category Icon"
                        widthClass="w-[268px]"
                      />
                    </div>
                    <input
                      type="text"
                      autoFocus
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Category name..."
                      className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setAddingCategory(false);
                          setNewCategoryName("");
                          setNewCategoryIconOpen(false);
                        }
                      }}
                    />
                    <button
                      type="submit"
                      className="px-2 py-1 text-[11px] font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] cursor-pointer shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-0.5">
                {categories.map((cat) => {
                  const active =
                    activeFilter.kind === "category" &&
                    activeFilter.id === cat.id;
                  const count = books.filter(
                    (b) => b.categoryId === cat.id,
                  ).length;
                  const dropKey = `category:${cat.id}`;
                  const isDragOver =
                    dragOverKey === dropKey ||
                    (activePointerDropTarget?.kind === "sidebar-category" &&
                      activePointerDropTarget.id === cat.id);
                  const isEditingCat = editingCategoryId === cat.id;

                  if (isEditingCat) {
                    return (
                      <form
                        key={cat.id}
                        onSubmit={handleCategoryEditSubmit}
                        className="my-1 rounded-md border border-[var(--accent)] bg-[var(--bg-surface)] p-1.5"
                      >
                        <div className="flex items-center gap-1">
                          <div className="relative shrink-0">
                            <button
                              type="button"
                              onClick={() => setEditingCategoryIconOpen((v) => !v)}
                              title="Choose category icon"
                              aria-label="Choose category icon"
                              className="w-7 h-7 rounded border border-[var(--border-strong)] bg-[var(--bg-input)] flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                              style={{ color: "var(--accent)" }}
                            >
                              <DynamicIcon
                                name={editingCategoryIcon}
                                className="w-3.5 h-3.5"
                              />
                            </button>
                            <IconPickerPopover
                              open={editingCategoryIconOpen}
                              onClose={() => setEditingCategoryIconOpen(false)}
                              value={editingCategoryIcon}
                              onChange={setEditingCategoryIcon}
                              title="Category Icon"
                              widthClass="w-[268px]"
                            />
                          </div>
                          <input
                            type="text"
                            autoFocus
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setEditingCategoryId(null);
                                setEditingCategoryIconOpen(false);
                              }
                            }}
                            className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)]"
                          />
                          <button
                            type="submit"
                            className="px-2 py-1 text-[11px] font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] cursor-pointer shrink-0"
                          >
                            Save
                          </button>
                        </div>
                      </form>
                    );
                  }

                  return (
                    <div
                      key={cat.id}
                      data-library-drop-kind="sidebar-category"
                      data-library-drop-id={cat.id}
                      data-library-drop-label={cat.name}
                      onDragOver={(e) => {
                        if (hasDraggedBookPayload(e.dataTransfer)) {
                          e.preventDefault();
                          setDragOverKey(dropKey);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverKey === dropKey) setDragOverKey(null);
                      }}
                      onDrop={(e) => {
                        const ids = extractDraggedBookIds(e.dataTransfer);
                        if (ids.length > 0) {
                          e.preventDefault();
                          onDropBooksToCategory(ids, cat.id);
                        }
                        setDragOverKey(null);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSidebarContextMenu({
                          kind: "category",
                          category: cat,
                          x: e.clientX,
                          y: e.clientY,
                        });
                      }}
                      className={`group flex items-center justify-between gap-1 px-2 py-1.5 rounded-md text-xs transition-colors ${
                        isDragOver
                          ? "ring-1 ring-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]"
                          : active
                            ? "bg-[var(--bg-accent-subtle)] text-[var(--accent)] font-medium"
                            : "text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          selectAndClose({ kind: "category", id: cat.id })
                        }
                        className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                        title={cat.name}
                      >
                        {cat.icon ? (
                          <DynamicIcon
                            name={cat.icon}
                            className="w-3.5 h-3.5 shrink-0"
                            style={{
                              color: active
                                ? "var(--accent)"
                                : "var(--text-secondary)",
                            }}
                          />
                        ) : (
                          <BookMarked
                            className="w-3.5 h-3.5 shrink-0"
                            style={{
                              color: active
                                ? "var(--accent)"
                                : "var(--text-secondary)",
                            }}
                          />
                        )}
                        <span className="truncate">{cat.name}</span>
                      </button>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {!isDesktop && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCategoryId(cat.id);
                                setEditingCategoryName(cat.name);
                                setEditingCategoryIcon(cat.icon || "Bookmark");
                                setEditingCategoryIconOpen(false);
                              }}
                              title="Edit category name & icon"
                              aria-label={`Edit ${cat.name}`}
                              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer opacity-75 hover:opacity-100"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteCategory(cat.id);
                              }}
                              title="Remove category"
                              aria-label={`Remove ${cat.name}`}
                              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--danger)] cursor-pointer opacity-75 hover:opacity-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] w-4 text-right">
                          {count}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Tags Section (Drag-and-Drop Enabled) */}
        <div>
          <div className="px-2 mb-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onToggleSection("tags")}
              className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {collapsedSections.tags ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              <span>Tags</span>
            </button>
            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={onClearTags}
                className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {!collapsedSections.tags &&
            (allTags.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-[var(--text-muted)]">
                Add tags via Edit Metadata
              </p>
            ) : (
              <div className="space-y-0.5">
                {allTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag.name);
                  const dropKey = `tag:${tag.name}`;
                  const isDragOver =
                    dragOverKey === dropKey ||
                    (activePointerDropTarget?.kind === "sidebar-tag" &&
                      activePointerDropTarget.id === tag.name);

                  return (
                    <button
                      key={tag.name}
                      type="button"
                      data-library-drop-kind="sidebar-tag"
                      data-library-drop-id={tag.name}
                      data-library-drop-label={tag.name}
                      onClick={() => onToggleTag(tag.name)}
                      onDragOver={(e) => {
                        if (hasDraggedBookPayload(e.dataTransfer)) {
                          e.preventDefault();
                          setDragOverKey(dropKey);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverKey === dropKey) setDragOverKey(null);
                      }}
                      onDrop={(e) => {
                        const ids = extractDraggedBookIds(e.dataTransfer);
                        if (ids.length > 0) {
                          e.preventDefault();
                          onDropBooksToTag(ids, tag.name);
                        }
                        setDragOverKey(null);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                        isDragOver
                          ? "ring-1 ring-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]"
                          : isSelected
                            ? "bg-[var(--bg-accent-subtle)] text-[var(--accent)] font-medium"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Tag className="w-3 h-3 shrink-0 opacity-75" />
                        <span className="truncate">{tag.name}</span>
                      </span>
                      <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] shrink-0">
                        {tag.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
        </div>
      </div>

      {/* Offline Storage Summary, Full ZIP Backup Actions & PWA Install */}
      <div className="p-3 border-t border-[var(--border-subtle)] space-y-2.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            onCloseMobile();
            onOpenStorageManager();
          }}
          title="Inspect local storage, spot duplicates, or replace oversized book files"
          className="w-full inline-flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-medium rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
        >
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <HardDrive className="w-3 h-3 shrink-0 text-[var(--accent)]" />
            <span className="truncate">Manage Files</span>
          </span>
          <span className="font-mono-tabular text-[var(--text-secondary)] shrink-0">
            {books.length} · {formatFileSize(totalBytes)}
          </span>
        </button>

        {/* Export Backup & Import Backup Buttons */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={isExportingBackup || isParsingBackup}
            onClick={onExportBackup}
            title="Export full library ZIP backup (books, folders, notes, settings)"
            className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-55 transition-colors cursor-pointer whitespace-nowrap truncate"
          >
            <Download className="w-3 h-3 shrink-0 text-[var(--accent)]" />
            <span className="truncate">
              {isExportingBackup ? "Exporting…" : "Export"}
            </span>
          </button>

          <button
            type="button"
            disabled={isExportingBackup || isParsingBackup}
            onClick={() => backupInputRef.current?.click()}
            title="Import a Kanso Library .zip backup archive"
            className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-55 transition-colors cursor-pointer whitespace-nowrap truncate"
          >
            <Upload className="w-3 h-3 shrink-0 text-[var(--text-secondary)]" />
            <span className="truncate">
              {isParsingBackup ? "Reading…" : "Import"}
            </span>
          </button>
        </div>
      </div>

      {/* Desktop Drag-Resize Divider */}
      {isDesktop && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar width (double-click to reset)"
          title="Drag to resize sidebar · Double-click to reset"
          onPointerDown={handleStartResize}
          onDoubleClick={() => onSidebarWidthChange(DEFAULT_SIDEBAR_WIDTH)}
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
      {/* Desktop collapsible resizable sidebar */}
      {isLgViewport && !isCollapsedDesktop && (
        <div className="hidden lg:block h-full shrink-0">
          {sidebarContent(true)}
        </div>
      )}

      {/* Mobile / narrow viewport slide-over sidebar */}
      {!isLgViewport && isOpenMobile && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex bg-black/50 backdrop-blur-[1px] overscroll-none"
          onClick={onCloseMobile}
        >
          <div
            className="h-full bg-[var(--bg-sidebar)] pt-safe pb-safe flex overscroll-none"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent(false)}
          </div>
        </div>
      )}

      {/* Right-Click Context Menu for Folders & Categories */}
      {sidebarContextMenu && (
        <div
          className="fixed inset-0 z-[80]"
          onClick={() => setSidebarContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setSidebarContextMenu(null);
          }}
        >
          <div
            className="fixed w-48 rounded-xl border p-1 space-y-0.5"
            onClick={(e) => e.stopPropagation()}
            style={{
              left:
                typeof window !== "undefined"
                  ? Math.min(
                      Math.max(12, sidebarContextMenu.x),
                      window.innerWidth - 204,
                    )
                  : sidebarContextMenu.x,
              top:
                typeof window !== "undefined"
                  ? Math.min(
                      Math.max(12, sidebarContextMenu.y),
                      window.innerHeight -
                        (sidebarContextMenu.kind === "folder" &&
                        sidebarContextMenu.depth < 3
                          ? 164
                          : 128),
                    )
                  : sidebarContextMenu.y,
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
              {sidebarContextMenu.kind === "folder"
                ? sidebarContextMenu.folder.name
                : sidebarContextMenu.category.name}
            </div>

            {sidebarContextMenu.kind === "folder" ? (
              <>
                {sidebarContextMenu.depth < 3 && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = sidebarContextMenu.folder;
                      setSidebarContextMenu(null);
                      if (collapsedSections.folders) onToggleSection("folders");
                      setCollapsedFolderIds((prev) => {
                        const next = new Set(prev);
                        next.delete(target.id);
                        return next;
                      });
                      setAddingFolderParentId(target.id);
                      setNewFolderName("");
                      setNewFolderColor(target.color ?? "neutral");
                      setNewFolderIcon("Folder");
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <FolderPlus className="w-3.5 h-3.5 opacity-75" />
                    <span>New Sub-folder</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const target = sidebarContextMenu.folder;
                    setSidebarContextMenu(null);
                    setEditingFolderId(target.id);
                    setEditingFolderName(target.name);
                    setEditingFolderColor(target.color ?? "neutral");
                    setEditingFolderIcon(target.icon || "Folder");
                    setEditingFolderIconOpen(false);
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
                    const target = sidebarContextMenu.folder;
                    setSidebarContextMenu(null);
                    onDeleteFolder(target.id);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  style={{ color: "var(--danger)" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Folder</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const target = sidebarContextMenu.category;
                    setSidebarContextMenu(null);
                    setEditingCategoryId(target.id);
                    setEditingCategoryName(target.name);
                    setEditingCategoryIcon(target.icon || "Bookmark");
                    setEditingCategoryIconOpen(false);
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
                    const target = sidebarContextMenu.category;
                    setSidebarContextMenu(null);
                    onDeleteCategory(target.id);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  style={{ color: "var(--danger)" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Category</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
