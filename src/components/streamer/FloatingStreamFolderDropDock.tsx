import { FolderSearch } from "lucide-react";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { VaultPointerDropTarget } from "../../hooks/useVaultStreamDrag";
import type { StreamFolder } from "../../types";
import { DynamicIcon } from "../IconLibrary";

export interface FlattenedStreamFolderNode {
  folder: StreamFolder;
  depth: number;
  pathLabel: string;
}

export function flattenStreamFolders(
  folders: StreamFolder[],
): FlattenedStreamFolderNode[] {
  const byParent = new Map<string | null, StreamFolder[]>();
  const idSet = new Set(folders.map((f) => f.id));

  for (const folder of folders) {
    const parent =
      folder.parentId && idSet.has(folder.parentId) ? folder.parentId : null;
    const list = byParent.get(parent) ?? [];
    list.push(folder);
    byParent.set(parent, list);
  }

  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const out: FlattenedStreamFolderNode[] = [];
  const visited = new Set<string>();

  const walk = (parentId: string | null, depth: number, prefix: string[]) => {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      const nextPath = [...prefix, child.name];
      out.push({
        folder: child,
        depth,
        pathLabel: nextPath.join(" / "),
      });
      if (depth < 4) {
        walk(child.id, depth + 1, nextPath);
      }
    }
  };

  walk(null, 0, []);
  return out;
}

interface FloatingStreamFolderDropDockProps {
  visible: boolean;
  folders: StreamFolder[];
  memberFolderIds?: Set<string>;
  dockScrollRef?: React.RefObject<HTMLDivElement | null>;
  activePointerDropTarget?: VaultPointerDropTarget | null;
}

const THREE_ROW_MAX_HEIGHT_PX = 136; // 3 * 40px card height + 2 * 8px row gap
const OVERFLOW_TOP_THRESHOLD_PX = 132; // Row 4 starts at 144px; anything >= 132px is beyond row 3

export const FloatingStreamFolderDropDock: React.FC<
  FloatingStreamFolderDropDockProps
> = ({
  visible,
  folders,
  memberFolderIds,
  dockScrollRef,
  activePointerDropTarget,
}) => {
  const [hiddenFolderCount, setHiddenFolderCount] = useState(0);
  const cardsWrapRef = useRef<HTMLDivElement | null>(null);

  const flatFolders = useMemo(
    () => flattenStreamFolders(folders),
    [folders],
  );

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
        card.dataset.vaultDropDisabled = isOverflowed ? "true" : "false";
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
  }, [visible, flatFolders]);

  if (!visible) return null;

  const isMoreOver = activePointerDropTarget?.kind === "dock-more";

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
        {/* Left/Main Wrapped Minimal Folder Cards (all Vault folders, capped at 3 rows) */}
        <div className="flex-1 min-w-0 flex items-center">
          {flatFolders.length === 0 ? (
            <div className="w-full px-3 py-2 text-xs text-[var(--text-muted)]">
              No folders yet — drop on More to create & organize
            </div>
          ) : (
            <div
              ref={cardsWrapRef}
              className="relative w-full flex flex-wrap content-start items-start gap-2 overflow-hidden"
              style={{ maxHeight: `${THREE_ROW_MAX_HEIGHT_PX}px` }}
            >
              {flatFolders.map(({ folder, pathLabel }) => {
                const isMember = memberFolderIds?.has(folder.id) ?? false;
                const isOver =
                  activePointerDropTarget?.kind === "dock-folder" &&
                  activePointerDropTarget.id === folder.id;

                return (
                  <div
                    key={folder.id}
                    title={
                      isMember ? `${pathLabel} (already added)` : pathLabel
                    }
                    data-tray-folder-card="true"
                    data-vault-drop-kind="dock-folder"
                    data-vault-drop-id={folder.id}
                    data-vault-drop-label={folder.name}
                    data-vault-drop-member={isMember ? "true" : "false"}
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
                      style={{
                        color: isOver
                          ? "var(--accent)"
                          : "var(--text-muted)",
                      }}
                    />
                    <span className="truncate">{folder.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Region: Dedicated "More" Drop Zone */}
        <div className="shrink-0 pl-2.5 border-l border-[var(--border-subtle)] flex items-stretch">
          <div
            data-vault-drop-kind="dock-more"
            data-vault-drop-label="Choose folders…"
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
