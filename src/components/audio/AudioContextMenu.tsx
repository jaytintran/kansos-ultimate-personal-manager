import {
  Check,
  CheckSquare,
  ChevronRight,
  Folder,
  FolderMinus,
  Info,
  Layers,
  Link2,
  ListMusic,
  Minus,
  Pencil,
  Play,
  SlidersHorizontal,
  Star,
  Trash2,
} from "lucide-react";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getAudioFolderIds, getTrackBadgeTint } from "../../lib/audioFormatters";
import { flattenFoldersHierarchy, getFolderColorHex } from "../../lib/formatters";
import type {
  AudioFolderRecord,
  AudioPlaylistRecord,
  AudioTrackRecord,
} from "../../types/audio";

export interface AudioContextMenuState {
  x: number;
  y: number;
  targetTrackIds: string[];
  primaryTrackId: string;
}

interface AudioContextMenuProps {
  menuState: AudioContextMenuState | null;
  tracks: AudioTrackRecord[];
  folders: AudioFolderRecord[];
  playlists: AudioPlaylistRecord[];
  activePlaylistRemovalName: string | null;
  selectedIds: Set<string>;
  isMissingTrack: (track: AudioTrackRecord) => boolean;
  onClose: () => void;
  onPlayTrack: (track: AudioTrackRecord) => void;
  onLayerInMix: (trackIds: string[]) => void;
  onAddToQueue: (trackIds: string[]) => void;
  onInspectTrack: (track: AudioTrackRecord) => void;
  onEditMetadata: (track: AudioTrackRecord) => void;
  onBulkEditTracks: (trackIds: string[]) => void;
  onToggleFolderMembership: (
    trackIds: string[],
    folderId: string,
    add: boolean,
  ) => void;
  onTogglePlaylistMembership: (
    trackIds: string[],
    playlistId: string,
    add: boolean,
  ) => void;
  onRemoveFromCurrentPlaylist?: (trackIds: string[]) => void;
  onSetFavorite: (trackIds: string[], favorite: boolean) => void;
  onToggleSelectTrack: (trackId: string) => void;
  onClearSelection: () => void;
  onRelinkTrack?: (track: AudioTrackRecord) => void;
  onRequestDeleteTracks: (trackIds: string[]) => void;
}

export const AudioContextMenu: React.FC<AudioContextMenuProps> = ({
  menuState,
  tracks,
  folders,
  playlists,
  activePlaylistRemovalName,
  selectedIds,
  isMissingTrack,
  onClose,
  onPlayTrack,
  onLayerInMix,
  onAddToQueue,
  onInspectTrack,
  onEditMetadata,
  onBulkEditTracks,
  onToggleFolderMembership,
  onTogglePlaylistMembership,
  onRemoveFromCurrentPlaylist,
  onSetFavorite,
  onToggleSelectTrack,
  onClearSelection,
  onRelinkTrack,
  onRequestDeleteTracks,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ left: 0, top: 0 });
  const [submenu, setSubmenu] = useState<"folders" | "playlists" | null>(null);
  const [submenuPos, setSubmenuPos] = useState({ left: 0, top: 0 });

  const targetTracks = useMemo(() => {
    if (!menuState) return [];
    const set = new Set(menuState.targetTrackIds);
    return tracks.filter((t) => set.has(t.id));
  }, [menuState, tracks]);

  const primaryTrack = useMemo(() => {
    if (!menuState) return null;
    return (
      tracks.find((t) => t.id === menuState.primaryTrackId) ??
      targetTracks[0] ??
      null
    );
  }, [menuState, tracks, targetTracks]);

  const flatFolders = useMemo(
    () => flattenFoldersHierarchy(folders),
    [folders],
  );

  useEffect(() => {
    setSubmenu(null);
  }, [menuState?.x, menuState?.y, menuState?.primaryTrackId]);

  useLayoutEffect(() => {
    if (!menuState || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 8;
    setCoords({
      left: Math.min(Math.max(pad, menuState.x), Math.max(pad, window.innerWidth - rect.width - pad)),
      top: Math.min(Math.max(pad, menuState.y), Math.max(pad, window.innerHeight - rect.height - pad)),
    });
  }, [menuState, targetTracks.length]);

  useLayoutEffect(() => {
    if (!submenu || !menuRef.current || !submenuRef.current) return;
    const menuRect = menuRef.current.getBoundingClientRect();
    const subRect = submenuRef.current.getBoundingClientRect();
    const pad = 10;
    let left = menuRect.right + 4;
    if (left + subRect.width > window.innerWidth - pad) {
      left = Math.max(pad, menuRect.left - subRect.width - 4);
    }
    const top = Math.min(
      Math.max(pad, menuRect.top + 48),
      Math.max(pad, window.innerHeight - subRect.height - pad),
    );
    setSubmenuPos({ left, top });
  }, [submenu, coords]);

  useEffect(() => {
    if (!menuState) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current?.contains(target) ||
        submenuRef.current?.contains(target)
      ) {
        return;
      }
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [menuState, onClose]);

  if (!menuState || !primaryTrack || targetTracks.length === 0) return null;

  const targetIds = targetTracks.map((t) => t.id);
  const isMulti = targetTracks.length > 1;
  const allFav = targetTracks.every((t) => t.isFavorite);
  const primaryMissing = !isMulti && isMissingTrack(primaryTrack);

  const renderTriCheck = (state: "all" | "some" | "none") => (
    <span
      className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
        state === "all"
          ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]"
          : state === "some"
            ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
            : "border-[var(--border-strong)] text-transparent"
      }`}
    >
      {state === "all" && <Check className="w-2.5 h-2.5 stroke-[3]" />}
      {state === "some" && <Minus className="w-2.5 h-2.5 stroke-[3]" />}
    </span>
  );

  return (
    <>
      <div
        ref={menuRef}
        role="menu"
        onContextMenu={(e) => e.preventDefault()}
        className="fixed z-50 w-60 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl py-1.5 select-none text-xs"
        style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
      >
        <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] mb-1">
          <p className="font-medium text-[var(--text-primary)] truncate">
            {isMulti ? `${targetTracks.length} tracks selected` : primaryTrack.title}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
            {isMulti ? "Apply to entire selection" : primaryTrack.artist}
          </p>
        </div>

        <div className="px-1 space-y-0.5">
          {!isMulti && (
            <>
              {primaryMissing && onRelinkTrack ? (
                <button
                  type="button"
                  onClick={() => {
                    onRelinkTrack(primaryTrack);
                    onClose();
                  }}
                  className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left rounded text-[var(--accent)] hover:bg-[var(--bg-surface-hover)] cursor-pointer font-medium"
                >
                  <Link2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Relink Audio File</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onPlayTrack(primaryTrack);
                    onClose();
                  }}
                  className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left rounded text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer font-medium"
                >
                  <Play className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>Play Track</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => {
              onLayerInMix(targetIds);
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left rounded text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>{isMulti ? "Layer All in Mixer" : "Layer in Mixer"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onAddToQueue(targetIds);
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left rounded text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <ListMusic className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
            <span>Add to Queue</span>
          </button>

          {!isMulti && (
            <>
              <div className="my-1 border-t border-[var(--border-subtle)]" />
              <button
                type="button"
                onClick={() => {
                  onInspectTrack(primaryTrack);
                  onClose();
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left rounded text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                <Info className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                <span>Inspect Track</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onEditMetadata(primaryTrack);
                  onClose();
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left rounded text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                <span>Edit Metadata &amp; Cover…</span>
              </button>
            </>
          )}

          <div className="my-1 border-t border-[var(--border-subtle)]" />

          <button
            type="button"
            onMouseEnter={() => setSubmenu("playlists")}
            onClick={() => setSubmenu("playlists")}
            className="w-full px-3 py-1.5 flex items-center justify-between text-left rounded text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <span className="inline-flex items-center gap-2.5">
              <ListMusic className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Add to Playlist</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>

          <button
            type="button"
            onMouseEnter={() => setSubmenu("folders")}
            onClick={() => setSubmenu("folders")}
            className="w-full px-3 py-1.5 flex items-center justify-between text-left rounded text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <span className="inline-flex items-center gap-2.5">
              <Folder className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Add to Folder</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>

          {activePlaylistRemovalName && onRemoveFromCurrentPlaylist && (
            <button
              type="button"
              onClick={() => {
                onRemoveFromCurrentPlaylist(targetIds);
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left rounded text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              <FolderMinus className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
              <span className="truncate">
                Remove from &ldquo;{activePlaylistRemovalName}&rdquo;
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onBulkEditTracks(targetIds);
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left rounded text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
            <span>
              {isMulti ? `Bulk Edit ${targetTracks.length} Tracks…` : "Bulk Edit…"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSetFavorite(targetIds, !allFav);
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left rounded text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Star
              className={`w-3.5 h-3.5 shrink-0 ${
                allFav
                  ? "fill-[var(--accent)] text-[var(--accent)]"
                  : "text-[var(--text-secondary)]"
              }`}
            />
            <span>{allFav ? "Remove from Favorites" : "Add to Favorites"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (isMulti) onClearSelection();
              else onToggleSelectTrack(primaryTrack.id);
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left rounded text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
            <span>
              {isMulti
                ? "Clear Selection"
                : selectedIds.has(primaryTrack.id)
                  ? "Deselect Track"
                  : "Select Track"}
            </span>
          </button>

          <div className="my-1 border-t border-[var(--border-subtle)]" />

          <button
            type="button"
            onClick={() => {
              onRequestDeleteTracks(targetIds);
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left rounded text-[var(--danger)] hover:bg-[var(--danger)]/10 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isMulti
                ? `Delete ${targetTracks.length} Tracks…`
                : "Delete Track…"}
            </span>
          </button>
        </div>
      </div>

      {submenu && (
        <div
          ref={submenuRef}
          className="fixed z-50 w-60 max-h-72 overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl p-1.5 space-y-0.5 text-xs select-none"
          style={{ left: `${submenuPos.left}px`, top: `${submenuPos.top}px` }}
        >
          {submenu === "folders" ? (
            flatFolders.length === 0 ? (
              <p className="px-2.5 py-2 text-[var(--text-muted)]">
                No folders created yet.
              </p>
            ) : (
              flatFolders.map(({ folder, depth }) => {
                const matchCount = targetTracks.filter((t) =>
                  getAudioFolderIds(t).includes(folder.id),
                ).length;
                const state =
                  matchCount === 0
                    ? "none"
                    : matchCount === targetTracks.length
                      ? "all"
                      : "some";
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() =>
                      onToggleFolderMembership(
                        targetIds,
                        folder.id,
                        state !== "all",
                      )
                    }
                    className="w-full py-1.5 pr-2.5 flex items-center justify-between gap-2 text-left rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{ paddingLeft: `${10 + depth * 12}px` }}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Folder
                        className="w-3.5 h-3.5 shrink-0"
                        style={{
                          color:
                            getFolderColorHex(folder.color) ??
                            "var(--text-muted)",
                        }}
                      />
                      <span className="truncate text-[var(--text-primary)]">
                        {folder.name}
                      </span>
                    </span>
                    {renderTriCheck(state)}
                  </button>
                );
              })
            )
          ) : playlists.length === 0 ? (
            <p className="px-2.5 py-2 text-[var(--text-muted)]">
              No playlists created yet.
            </p>
          ) : (
            playlists.map((pl) => {
              const matchCount = targetIds.filter((id) =>
                pl.trackIds.includes(id),
              ).length;
              const state =
                matchCount === 0
                  ? "none"
                  : matchCount === targetIds.length
                    ? "all"
                    : "some";
              return (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() =>
                    onTogglePlaylistMembership(
                      targetIds,
                      pl.id,
                      state !== "all",
                    )
                  }
                  className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <ListMusic
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: getTrackBadgeTint(pl.color) }}
                    />
                    <span className="truncate text-[var(--text-primary)]">
                      {pl.name}
                    </span>
                  </span>
                  {renderTriCheck(state)}
                </button>
              );
            })
          )}
        </div>
      )}
    </>
  );
};
