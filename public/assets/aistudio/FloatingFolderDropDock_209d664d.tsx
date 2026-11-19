import {ArrowLeft, Folder, FolderMinus} from 'lucide-react';
import React, {useMemo, useState} from 'react';
import {flattenFoldersHierarchy, getFolderColorHex} from '../../lib/formatters';
import type {FolderRecord, ViewFolderRecord} from '../../types/library';

interface FloatingFolderDropDockProps {
  visible: boolean;
  activeViewLabel: string;
  currentViewFolders: ViewFolderRecord[];
  sidebarFolders: FolderRecord[];
  activeFolderRemovalTarget: {kind: 'view' | 'sidebar'; id: string; name: string} | null;
  onDropToViewFolder: (bookIds: string[], folderId: string) => void;
  onDropToSidebarFolder: (bookIds: string[], folderId: string) => void;
  onDropToRemoveFromCurrentFolder: (bookIds: string[]) => void;
}

function hasBookDragPayload(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return (
    dt.types.includes('application/x-folio-book-ids') ||
    dt.types.includes('application/x-folio-book-id')
  );
}

function extractDraggedBookIds(dt: DataTransfer | null): string[] {
  if (!dt) return [];
  const multi = dt.getData('application/x-folio-book-ids');
  if (multi) {
    try {
      const parsed = JSON.parse(multi);
      if (Array.isArray(parsed)) {
        const ids = parsed.filter((id): id is string => typeof id === 'string');
        if (ids.length > 0) return ids;
      }
    } catch {
      // ignore
    }
  }
  const single = dt.getData('application/x-folio-book-id');
  return single ? [single] : [];
}

export const FloatingFolderDropDock: React.FC<FloatingFolderDropDockProps> = ({
  visible,
  activeViewLabel,
  currentViewFolders,
  sidebarFolders,
  activeFolderRemovalTarget,
  onDropToViewFolder,
  onDropToSidebarFolder,
  onDropToRemoveFromCurrentFolder,
}) => {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const flatSidebarFolders = useMemo(
    () => flattenFoldersHierarchy(sidebarFolders),
    [sidebarFolders]
  );

  const hasTargets =
    Boolean(activeFolderRemovalTarget) ||
    currentViewFolders.length > 0 ||
    flatSidebarFolders.length > 0;

  if (!visible || !hasTargets) return null;

  const handleDragOver = (key: string) => (e: React.DragEvent) => {
    if (!hasBookDragPayload(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setHoveredKey(key);
  };

  const handleDragLeave = (key: string) => () => {
    setHoveredKey((curr) => (curr === key ? null : curr));
  };

  return (
    <div
      aria-label="Quick folder drop dock"
      className="sticky top-0 z-30 h-0 overflow-visible pointer-events-none"
    >
      <div className="px-4 sm:px-5 lg:px-8 pt-3">
        <div className="pointer-events-auto rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)]/96 backdrop-blur-md shadow-xl px-4 py-3 max-h-[55vh] overflow-y-auto transition-all duration-150 ease-out">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Contextual Remove Target when inside a folder */}
            {activeFolderRemovalTarget && (
              <div
                onDragOver={handleDragOver('__remove__')}
                onDragLeave={handleDragLeave('__remove__')}
                onDrop={(e) => {
                  const ids = extractDraggedBookIds(e.dataTransfer);
                  if (ids.length > 0) {
                    e.preventDefault();
                    onDropToRemoveFromCurrentFolder(ids);
                  }
                  setHoveredKey(null);
                }}
                className={`shrink-0 min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-md border text-[13px] font-medium transition-all duration-150 whitespace-nowrap ${
                  hoveredKey === '__remove__'
                    ? 'border-[var(--accent)] ring-2 ring-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)] scale-[1.02]'
                    : 'border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)]'
                }`}
              >
                {hoveredKey === '__remove__' ? (
                  <FolderMinus className="w-4 h-4 shrink-0" />
                ) : (
                  <ArrowLeft className="w-4 h-4 shrink-0" />
                )}
                <span>Remove from &ldquo;{activeFolderRemovalTarget.name}&rdquo;</span>
              </div>
            )}

            {/* Per-View Folders Group */}
            {currentViewFolders.length > 0 && (
              <>
                <span className="text-[11px] font-medium text-[var(--text-muted)] px-1 whitespace-nowrap">
                  In {activeViewLabel}:
                </span>
                {currentViewFolders.map((vf) => {
                  const key = `view:${vf.id}`;
                  const isOver = hoveredKey === key;
                  return (
                    <div
                      key={vf.id}
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
                      className={`shrink-0 min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 rounded-md border text-[13px] font-medium transition-all duration-150 whitespace-nowrap ${
                        isOver
                          ? 'border-[var(--accent)] ring-2 ring-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)] scale-[1.02]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <Folder className="w-4 h-4 text-[var(--accent)] shrink-0" />
                      <span className="max-w-[180px] truncate">{vf.name}</span>
                      <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                        {vf.bookIds.length}
                      </span>
                    </div>
                  );
                })}
              </>
            )}

            {currentViewFolders.length > 0 && flatSidebarFolders.length > 0 && (
              <div className="h-6 w-px bg-[var(--border-subtle)] mx-0.5 shrink-0" />
            )}

            {/* Sidebar Library Folders Group */}
            {flatSidebarFolders.length > 0 && (
              <>
                <span className="text-[11px] font-medium text-[var(--text-muted)] px-1 whitespace-nowrap">
                  Library:
                </span>
                {flatSidebarFolders.map(({folder, pathLabel}) => {
                  const key = `sidebar:${folder.id}`;
                  const isOver = hoveredKey === key;
                  const hex = getFolderColorHex(folder.color);
                  return (
                    <div
                      key={folder.id}
                      title={pathLabel}
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
                      className={`shrink-0 min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 rounded-md border text-[13px] font-medium transition-all duration-150 whitespace-nowrap ${
                        isOver
                          ? 'border-[var(--accent)] ring-2 ring-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)] scale-[1.02]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <Folder
                        className="w-4 h-4 shrink-0"
                        style={{color: hex ?? 'var(--text-muted)'}}
                      />
                      <span className="max-w-[180px] truncate">{folder.name}</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
