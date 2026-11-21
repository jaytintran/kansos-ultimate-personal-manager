import {
  BookMarked,
  BookOpen,
  CheckCircle2,
  Circle,
  FolderPlus,
  Highlighter,
  Library,
  Star,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import {
  flattenFoldersHierarchy,
  getBookFolderIds,
  getFolderColorHex,
  getFolderDescendantIds,
} from "../../lib/formatters";
import type {
  BookRecord,
  CategoryRecord,
  FolderRecord,
  SmartView,
} from "../../../library";
import type { ActiveLibraryFilter } from "./LibrarySidebar";
import { LibraryStatusDropdown } from "./LibraryStatusDropdown";

interface LibraryShelfStripProps {
  books: BookRecord[];
  folders: FolderRecord[];
  categories: CategoryRecord[];
  totalHighlightsCount: number;
  activeFilter: ActiveLibraryFilter;
  onSelectFilter: (filter: ActiveLibraryFilter) => void;
  onRequestCreateFolder: () => void;
  onDropBooksToFolder: (bookIds: string[], folderId: string) => void;
  onDropBooksToCategory: (bookIds: string[], categoryId: string) => void;
  onDropBooksToFavorites: (bookIds: string[]) => void;
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

export const LibraryShelfStrip: React.FC<LibraryShelfStripProps> = ({
  books,
  folders,
  categories,
  totalHighlightsCount,
  activeFilter,
  onSelectFilter,
  onRequestCreateFolder,
  onDropBooksToFolder,
  onDropBooksToCategory,
  onDropBooksToFavorites,
}) => {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const smartCounts: Record<SmartView, number> = useMemo(
    () => ({
      all: books.length,
      reading: books.filter((b) => b.status === "reading").length,
      unread: books.filter((b) => b.status === "unread").length,
      finished: books.filter((b) => b.status === "finished").length,
      favorites: books.filter((b) => b.isFavorite).length,
      highlights: totalHighlightsCount,
    }),
    [books, totalHighlightsCount],
  );

  const smartItemsOld: Array<{
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
      label: "Reading",
      icon: <BookOpen className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: "unread",
      label: "Unread",
      icon: <Circle className="w-3.5 h-3.5 shrink-0" />,
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
      label: "Highlights",
      icon: <Highlighter className="w-3.5 h-3.5 shrink-0" />,
    },
  ];

  const smartItems: Array<{
    id: SmartView;
    label: string;
    icon: React.ReactNode;
    acceptsDrop?: boolean;
  }> = [
    {
      id: "favorites",
      label: "Favorites",
      icon: <Star className="w-3.5 h-3.5 shrink-0" />,
      acceptsDrop: true,
    },
    {
      id: "highlights",
      label: "Highlights",
      icon: <Highlighter className="w-3.5 h-3.5 shrink-0" />,
    },
  ];

  const flattenedFolders = useMemo(
    () => flattenFoldersHierarchy(folders),
    [folders],
  );

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

  const categoryBookCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of books) {
      if (b.categoryId) {
        counts.set(b.categoryId, (counts.get(b.categoryId) ?? 0) + 1);
      }
    }
    return counts;
  }, [books]);

  return (
    <nav
      aria-label="Library shelves and folders"
      className="flex items-center gap-0.5 overflow-x-auto no-scrollbar border-b px-4 sm:px-6 bg-[var(--bg-canvas)] shrink-0"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      {/* Status dropdown (All / Reading / Unread / Finished) */}
      <LibraryStatusDropdown
        activeFilter={activeFilter}
        smartCounts={smartCounts}
        onSelectFilter={onSelectFilter}
      />

      {/* Smart Shelves */}
      {smartItems.map((item) => {
        const active =
          activeFilter.kind === "smart" && activeFilter.id === item.id;
        const dropKey = `smart:${item.id}`;
        const isDragOver = dragOverKey === dropKey;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectFilter({ kind: "smart", id: item.id })}
            onDragOver={(e) => {
              if (!item.acceptsDrop || !hasDraggedBookPayload(e.dataTransfer))
                return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              if (dragOverKey !== dropKey) setDragOverKey(dropKey);
            }}
            onDragLeave={() => {
              if (dragOverKey === dropKey) setDragOverKey(null);
            }}
            onDrop={(e) => {
              if (!item.acceptsDrop) return;
              e.preventDefault();
              setDragOverKey(null);
              const ids = extractDraggedBookIds(e.dataTransfer);
              if (ids.length > 0 && item.id === "favorites") {
                onDropBooksToFavorites(ids);
              }
            }}
            className={`h-10 px-3 inline-flex items-center gap-1.5 text-xs font-medium shrink-0 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              isDragOver
                ? "ring-1 ring-inset ring-[var(--accent)] rounded-t-md"
                : ""
            }`}
            style={{
              borderColor: active ? "var(--accent)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              backgroundColor: active
                ? "var(--accent-soft)"
                : isDragOver
                  ? "var(--bg-accent-subtle)"
                  : "transparent",
            }}
          >
            <span
              style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
            >
              {item.icon}
            </span>
            <span className={active ? "font-semibold" : ""}>{item.label}</span>
            <span
              className="font-mono tabular-nums text-[11px] opacity-75"
              style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
            >
              {smartCounts[item.id]}
            </span>
          </button>
        );
      })}

      {/* Folders */}
      {flattenedFolders.length > 0 && (
        <>
          <span
            aria-hidden="true"
            className="h-4 w-px mx-1.5 shrink-0"
            style={{ backgroundColor: "var(--border-subtle)" }}
          />
          {flattenedFolders.map(({ folder, pathLabel }) => {
            const active =
              activeFilter.kind === "folder" && activeFilter.id === folder.id;
            const count = folderBookCountMap.get(folder.id) ?? 0;
            const dropKey = `folder:${folder.id}`;
            const isDragOver = dragOverKey === dropKey;
            const dotColor = getFolderColorHex(folder.color);

            return (
              <button
                key={folder.id}
                type="button"
                title={pathLabel}
                onClick={() =>
                  onSelectFilter({ kind: "folder", id: folder.id })
                }
                onDragOver={(e) => {
                  if (!hasDraggedBookPayload(e.dataTransfer)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverKey !== dropKey) setDragOverKey(dropKey);
                }}
                onDragLeave={() => {
                  if (dragOverKey === dropKey) setDragOverKey(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverKey(null);
                  const ids = extractDraggedBookIds(e.dataTransfer);
                  if (ids.length > 0) onDropBooksToFolder(ids, folder.id);
                }}
                className={`h-10 px-3 inline-flex items-center gap-1.5 text-xs font-medium shrink-0 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  isDragOver
                    ? "ring-1 ring-inset ring-[var(--accent)] rounded-t-md"
                    : ""
                }`}
                style={{
                  borderColor: active ? "var(--accent)" : "transparent",
                  color: active
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                  backgroundColor: active
                    ? "var(--accent-soft)"
                    : isDragOver
                      ? "var(--bg-accent-subtle)"
                      : "transparent",
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      dotColor ??
                      (active ? "var(--accent)" : "var(--text-muted)"),
                  }}
                />
                <span
                  className={`max-w-[160px] truncate ${active ? "font-semibold" : ""}`}
                >
                  {pathLabel}
                </span>
                <span
                  className="font-mono tabular-nums text-[11px] opacity-75"
                  style={{
                    color: active ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <>
          <span
            aria-hidden="true"
            className="h-4 w-px mx-1.5 shrink-0"
            style={{ backgroundColor: "var(--border-subtle)" }}
          />
          {categories.map((cat) => {
            const active =
              activeFilter.kind === "category" && activeFilter.id === cat.id;
            const count = categoryBookCountMap.get(cat.id) ?? 0;
            const dropKey = `category:${cat.id}`;
            const isDragOver = dragOverKey === dropKey;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectFilter({ kind: "category", id: cat.id })}
                onDragOver={(e) => {
                  if (!hasDraggedBookPayload(e.dataTransfer)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  if (dragOverKey !== dropKey) setDragOverKey(dropKey);
                }}
                onDragLeave={() => {
                  if (dragOverKey === dropKey) setDragOverKey(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverKey(null);
                  const ids = extractDraggedBookIds(e.dataTransfer);
                  if (ids.length > 0) onDropBooksToCategory(ids, cat.id);
                }}
                className={`h-10 px-3 inline-flex items-center gap-1.5 text-xs font-medium shrink-0 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  isDragOver
                    ? "ring-1 ring-inset ring-[var(--accent)] rounded-t-md"
                    : ""
                }`}
                style={{
                  borderColor: active ? "var(--accent)" : "transparent",
                  color: active
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                  backgroundColor: active
                    ? "var(--accent-soft)"
                    : isDragOver
                      ? "var(--bg-accent-subtle)"
                      : "transparent",
                }}
              >
                <BookMarked
                  className="w-3.5 h-3.5 shrink-0"
                  style={{
                    color: active ? "var(--accent)" : "var(--text-muted)",
                  }}
                />
                <span
                  className={`max-w-[140px] truncate ${active ? "font-semibold" : ""}`}
                >
                  {cat.name}
                </span>
                <span
                  className="font-mono tabular-nums text-[11px] opacity-75"
                  style={{
                    color: active ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </>
      )}

      {/* + Folder Action */}
      <button
        type="button"
        onClick={onRequestCreateFolder}
        className="h-8 ml-2 px-2.5 inline-flex items-center gap-1 text-xs font-medium rounded-lg shrink-0 whitespace-nowrap transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
        style={{ color: "var(--text-muted)" }}
        title="Create new library folder"
      >
        <FolderPlus className="w-3.5 h-3.5" />
        <span>New Folder</span>
      </button>
    </nav>
  );
};
