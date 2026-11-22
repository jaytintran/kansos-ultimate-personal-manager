import {
  ArrowLeft,
  Folder,
  FolderMinus,
  Layers,
  ListMusic,
  ListPlus,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import {
  flattenFoldersHierarchy,
  getFolderColorHex,
} from "../../lib/formatters";
import type { AudioFolderRecord, AudioPlaylistRecord } from "../../types/audio";
import { extractDraggedAudioIds, hasDraggedAudioPayload } from "./AudioSidebar";

interface FloatingAudioDropDockProps {
  visible: boolean;
  folders: AudioFolderRecord[];
  playlists: AudioPlaylistRecord[];
  activeRemovalTarget: {
    kind: "folder" | "playlist";
    id: string;
    name: string;
  } | null;
  onDropToFolder: (trackIds: string[], folderId: string) => void;
  onDropToPlaylist: (trackIds: string[], playlistId: string) => void;
  onDropToMix: (trackIds: string[]) => void;
  onDropToQueue: (trackIds: string[]) => void;
  onDropToRemoveFromCurrent: (trackIds: string[]) => void;
}

export const FloatingAudioDropDock: React.FC<FloatingAudioDropDockProps> = ({
  visible,
  folders,
  playlists,
  activeRemovalTarget,
  onDropToFolder,
  onDropToPlaylist,
  onDropToMix,
  onDropToQueue,
  onDropToRemoveFromCurrent,
}) => {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const flatFolders = useMemo(
    () => flattenFoldersHierarchy(folders),
    [folders],
  );

  if (!visible) return null;

  const handleDragOver = (key: string) => (e: React.DragEvent) => {
    if (!hasDraggedAudioPayload(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHoveredKey(key);
  };

  const handleDragLeave = (key: string) => () => {
    setHoveredKey((curr) => (curr === key ? null : curr));
  };

  return (
    <div
      aria-label="Quick audio drop dock"
      className="sticky top-0 z-30 h-0 overflow-visible pointer-events-none"
    >
      <div className="px-4 sm:px-5 lg:px-8 pt-3">
        <div className="pointer-events-auto rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)]/96 backdrop-blur-md shadow-xl px-4 py-3 max-h-[50vh] overflow-y-auto transition-all duration-150 ease-out">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Layer into Mixer */}
            <div
              onDragOver={handleDragOver("__mix__")}
              onDragLeave={handleDragLeave("__mix__")}
              onDrop={(e) => {
                const ids = extractDraggedAudioIds(e.dataTransfer);
                if (ids.length > 0) {
                  e.preventDefault();
                  onDropToMix(ids);
                }
                setHoveredKey(null);
              }}
              className={`shrink-0 min-h-[40px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap ${
                hoveredKey === "__mix__"
                  ? "border-[var(--accent)] ring-2 ring-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)] scale-[1.02]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Add to Mixer</span>
            </div>

            {/* Add to Queue */}
            <div
              onDragOver={handleDragOver("__queue__")}
              onDragLeave={handleDragLeave("__queue__")}
              onDrop={(e) => {
                const ids = extractDraggedAudioIds(e.dataTransfer);
                if (ids.length > 0) {
                  e.preventDefault();
                  onDropToQueue(ids);
                }
                setHoveredKey(null);
              }}
              className={`shrink-0 min-h-[40px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap ${
                hoveredKey === "__queue__"
                  ? "border-[var(--accent)] ring-2 ring-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)] scale-[1.02]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
              }`}
            >
              <ListPlus className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Add to Queue</span>
            </div>

            {/* Remove from Current Folder/Playlist */}
            {activeRemovalTarget && (
              <div
                onDragOver={handleDragOver("__remove__")}
                onDragLeave={handleDragLeave("__remove__")}
                onDrop={(e) => {
                  const ids = extractDraggedAudioIds(e.dataTransfer);
                  if (ids.length > 0) {
                    e.preventDefault();
                    onDropToRemoveFromCurrent(ids);
                  }
                  setHoveredKey(null);
                }}
                className={`shrink-0 min-h-[40px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap ${
                  hoveredKey === "__remove__"
                    ? "border-[var(--accent)] ring-2 ring-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)] scale-[1.02]"
                    : "border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                }`}
              >
                {hoveredKey === "__remove__" ? (
                  <FolderMinus className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>Remove from &ldquo;{activeRemovalTarget.name}&rdquo;</span>
              </div>
            )}

            {/* Playlists */}
            {playlists.map((pl) => {
              const key = `playlist:${pl.id}`;
              const isOver = hoveredKey === key;
              return (
                <div
                  key={pl.id}
                  onDragOver={handleDragOver(key)}
                  onDragLeave={handleDragLeave(key)}
                  onDrop={(e) => {
                    const ids = extractDraggedAudioIds(e.dataTransfer);
                    if (ids.length > 0) {
                      e.preventDefault();
                      onDropToPlaylist(ids, pl.id);
                    }
                    setHoveredKey(null);
                  }}
                  className={`shrink-0 min-h-[40px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap ${
                    isOver
                      ? "border-[var(--accent)] ring-2 ring-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)] scale-[1.02]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                  }`}
                >
                  <ListMusic className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span className="max-w-[160px] truncate">{pl.name}</span>
                </div>
              );
            })}

            {/* Folders */}
            {flatFolders.map(({ folder, pathLabel }) => {
              const key = `folder:${folder.id}`;
              const isOver = hoveredKey === key;
              const hex = getFolderColorHex(folder.color);
              return (
                <div
                  key={folder.id}
                  title={pathLabel}
                  onDragOver={handleDragOver(key)}
                  onDragLeave={handleDragLeave(key)}
                  onDrop={(e) => {
                    const ids = extractDraggedAudioIds(e.dataTransfer);
                    if (ids.length > 0) {
                      e.preventDefault();
                      onDropToFolder(ids, folder.id);
                    }
                    setHoveredKey(null);
                  }}
                  className={`shrink-0 min-h-[40px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap ${
                    isOver
                      ? "border-[var(--accent)] ring-2 ring-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)] scale-[1.02]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                  }`}
                >
                  <Folder
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: hex ?? "var(--text-muted)" }}
                  />
                  <span className="max-w-[160px] truncate">{folder.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
