import { Folder, FolderSearch } from "lucide-react";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LibraryPointerDropTarget } from "../../hooks/useLibraryBookDrag";
import {
  flattenFoldersHierarchy,
  getFolderColorHex,
} from "../../lib/formatters";
import type { FolderRecord, ViewFolderRecord } from "../../types/library";
import { DynamicIcon } from "../IconLibrary";

interface FloatingFolderDropDockProps {
  visible: boolean;
  currentViewFolders: ViewFolderRecord[];
  sidebarFolders: FolderRecord[];
  memberViewFolderIds?: Set<string>;
  memberSidebarFolderIds?: Set<string>;
  dockScrollRef?: React.RefObject<HTMLDivElement | null>;
  activePointerDropTarget?: LibraryPointerDropTarget | null;
  onDropToViewFolder: (bookIds: string[], folderId: string) => void;
  onDropToSidebarFolder: (bookIds: string[], folderId: string) => void;
  onDropToMoreFolders: (bookIds: string[]) => void;
}

const THREE_ROW_MAX_HEIGHT_PX = 136; // 3 * 40px card height + 2 * 8px row gap
const OVERFLOW_TOP_THRESHOLD_PX = 132; // Row 4 starts at 144px; anything >= 132px is beyond row 3

function hasBookDragPayload(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return (
    dt.types.includes("application/x-folio-book-ids") ||
    dt.types.includes("application/x-folio-book-id")
  );
}

function extractDraggedBookIds(dt: DataTransfer | null): string[] {
  if (!dt) return [];
  const multi = dt.getData("application/x-folio-book-ids");
  if (multi) {
    try {
      const parsed = JSON.parse(multi);
      if (Array.isArray(parsed)) {
        const ids = parsed.filter((id): id is string => typeof id === "string");
        if (ids.length > 0) return ids;
      }
    } catch {
      // ignore
    }
  }
  const single = dt.getData("application/x-folio-book-id");
  return single ? [single] : [];
}

export const FloatingFolderDropDock: React.FC<FloatingFolderDropDockProps> = ({
  visible,
  currentViewFolders,
  sidebarFolders,
  memberViewFolderIds,
  memberSidebarFolderIds,
  dockScrollRef,
  activePointerDropTarget,
  onDropToViewFolder,
  onDropToSidebarFolder,
  onDropToMoreFolders,
}) => {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [hiddenFolderCount, setHiddenFolderCount] = useState(0);
  const cardsWrapRef = useRef<HTMLDivElement | null>(null);

  const flatSidebarFolders = useMemo(
    () => flattenFoldersHierarchy(sidebarFolders),
    [sidebarFolders],
  );

  const totalFoldersCount =
    currentViewFolders.length + flatSidebarFolders.length;

  useLayoutEffect(() => {
    if (!visible) {
      setHiddenFolderCount(0);
      return;
    }

    const wrapEl = cardsWrapRef.current;
    if (!wrapEl) {
      setHiddenFolderCount(0);
      return;
    }

    const measureOverflow = () => {
      const cards = wrapEl.querySelectorAll<HTMLElement>(
        '[data-tray-folder-card="true"]',
      );
      let hidden = 0;
      cards.forEach((card) => {
        const isOverflowed = card.offsetTop >= OVERFLOW_TOP_THRESHOLD_PX;
        card.dataset.libraryDropDisabled = isOverflowed ? "true" : "false";
        if (isOverflowed) {
          card.setAttribute("aria-hidden", "true");
          hidden += 1;
        } else {
          card.removeAttribute("aria-hidden");
        }
      });
      setHiddenFolderCount(hidden);
    };

    measureOverflow();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(wrapEl);
    return () => observer.disconnect();
  }, [visible, currentViewFolders, flatSidebarFolders]);

  if (!visible) return null;

  const handleDragOver = (key: string) => (e: React.DragEvent) => {
    if (!hasBookDragPayload(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHoveredKey(key);
  };

  const handleDragLeave = (key: string) => () => {
    setHoveredKey((curr) => (curr === key ? null : curr));
  };

  const isMoreOver =
    hoveredKey === "__more__" || activePointerDropTarget?.kind === "dock-more";

  return (
    <div
      aria-label="Folder drop tray"
      className="absolute inset-x-0 bottom-3 z-30 pointer-events-none px-3 sm:px-5 lg:px-7 flex justify-center"
    >
      <div
        ref={dockScrollRef}
        className="pointer-events-auto w-full max-w-[960px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)]/96 backdrop-blur-md shadow-2xl p-2.5 flex items-stretch gap-2.5 animate-folio-sheet-up"
        style={{ boxShadow: "var(--shadow-popover)" }}
      >
        {/* Left/Main Wrapped Minimal Folder Cards (View + Library Folders, capped at 3 rows) */}
        <div className="flex-1 min-w-0 flex items-center">
          {totalFoldersCount === 0 ? (
            <div className="w-full px-3 py-2 text-xs text-[var(--text-muted)]">
              No folders yet — drop on More to organize
            </div>
          ) : (
            <div
              ref={cardsWrapRef}
              className="relative w-full flex flex-wrap content-start items-start gap-2 overflow-hidden"
              style={{ maxHeight: `${THREE_ROW_MAX_HEIGHT_PX}px` }}
            >
              {currentViewFolders.map((vf) => {
                const key = `view:${vf.id}`;
                const isMember = memberViewFolderIds?.has(vf.id) ?? false;
                const isOver =
                  hoveredKey === key ||
                  (activePointerDropTarget?.kind === "dock-view-folder" &&
                    activePointerDropTarget.id === vf.id);
                return (
                  <div
                    key={key}
                    title={isMember ? `${vf.name} (already added)` : vf.name}
                    data-tray-folder-card="true"
                    data-library-drop-kind="dock-view-folder"
                    data-library-drop-id={vf.id}
                    data-library-drop-label={vf.name}
                    data-library-drop-member={isMember ? "true" : "false"}
                    onDragOver={handleDragOver(key)}
                    onDragLeave={handleDragLeave(key)}
                    onDrop={(e) => {
                      const ids = extractDraggedBookIds(e.dataTransfer);
                      if (ids.length > 0) {
                        e.preventDefault();
                        onDropToViewFolder(ids, vf.id);
                      }
                      setHoveredKey(null);
                    }}
                    className={`h-10 shrink-0 inline-flex items-center gap-2 px-3 rounded-lg border text-[13px] font-medium max-w-[168px] sm:max-w-[192px] transition-[border-color,opacity] duration-150 select-none ${
                      isOver
                        ? isMember
                          ? "border-[var(--accent)] bg-[var(--bg-surface)] text-[var(--text-primary)] opacity-80"
                          : "border-[var(--accent)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                        : isMember
                          ? "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] opacity-45"
                          : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <Folder className="w-4 h-4 text-[var(--accent)] shrink-0" />
                    <span className="truncate">{vf.name}</span>
                  </div>
                );
              })}

              {flatSidebarFolders.map(({ folder, pathLabel }) => {
                const key = `sidebar:${folder.id}`;
                const isMember = memberSidebarFolderIds?.has(folder.id) ?? false;
                const isOver =
                  hoveredKey === key ||
                  (activePointerDropTarget?.kind === "dock-sidebar-folder" &&
                    activePointerDropTarget.id === folder.id);
                const hex = getFolderColorHex(folder.color);
                return (
                  <div
                    key={key}
                    title={
                      isMember ? `${pathLabel} (already added)` : pathLabel
                    }
                    data-tray-folder-card="true"
                    data-library-drop-kind="dock-sidebar-folder"
                    data-library-drop-id={folder.id}
                    data-library-drop-label={folder.name}
                    data-library-drop-member={isMember ? "true" : "false"}
                    onDragOver={handleDragOver(key)}
                    onDragLeave={handleDragLeave(key)}
                    onDrop={(e) => {
                      const ids = extractDraggedBookIds(e.dataTransfer);
                      if (ids.length > 0) {
                        e.preventDefault();
                        onDropToSidebarFolder(ids, folder.id);
                      }
                      setHoveredKey(null);
                    }}
                    className={`h-10 shrink-0 inline-flex items-center gap-2 px-3 rounded-lg border text-[13px] font-medium max-w-[168px] sm:max-w-[192px] transition-[border-color,opacity] duration-150 select-none ${
                      isOver
                        ? isMember
                          ? "border-[var(--accent)] bg-[var(--bg-surface)] text-[var(--text-primary)] opacity-80"
                          : "border-[var(--accent)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                        : isMember
                          ? "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] opacity-45"
                          : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <DynamicIcon
                      name={folder.icon || "Folder"}
                      className="w-4 h-4 shrink-0"
                      style={{ color: hex ?? "var(--text-muted)" }}
                    />
                    <span className="truncate">{folder.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Region: Dedicated "More" Drop Zone opening Organize Book */}
        <div className="shrink-0 pl-2.5 border-l border-[var(--border-subtle)] flex items-stretch">
          <div
            data-library-drop-kind="dock-more"
            data-library-drop-label="Choose folders…"
            onDragOver={handleDragOver("__more__")}
            onDragLeave={handleDragLeave("__more__")}
            onDrop={(e) => {
              const ids = extractDraggedBookIds(e.dataTransfer);
              if (ids.length > 0) {
                e.preventDefault();
                onDropToMoreFolders(ids);
              }
              setHoveredKey(null);
            }}
            className={`w-[82px] sm:w-[98px] min-h-[48px] self-stretch rounded-lg border px-2 py-2 flex flex-col items-center justify-center gap-1 text-center transition-colors duration-150 select-none ${
              isMoreOver
                ? "border-[var(--accent)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                : "border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
            }`}
          >
            <FolderSearch className="w-4 h-4 shrink-0" />
            <span className="text-xs font-semibold leading-tight">More</span>
            {hiddenFolderCount > 0 && (
              <span className="font-mono-tabular text-[10px] leading-none text-[var(--text-muted)]">
                +{hiddenFolderCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
