import {
  Check,
  Folder,
  FolderPlus,
  ListMusic,
  Minus,
  Plus,
  RotateCcw,
  Star,
  Tag,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { getAudioFolderIds, getTrackBadgeTint } from "../../lib/audioFormatters";
import { flattenFoldersHierarchy, getFolderColorHex } from "../../lib/formatters";
import type {
  AudioFolderRecord,
  AudioPlaylistRecord,
  AudioTrackRecord,
} from "../../types/audio";

export interface AudioBulkEditPatch {
  addFolderIds: string[];
  removeFolderIds: string[];
  addPlaylistIds: string[];
  removePlaylistIds: string[];
  addTags: string[];
  removeTags: string[];
  artist?: string;
  album?: string;
  genre?: string;
  year?: string;
  favoriteAction: "keep" | "favorite" | "unfavorite";
  resetPosition: boolean;
}

interface AudioBulkEditModalProps {
  selectedTracks: AudioTrackRecord[];
  folders: AudioFolderRecord[];
  playlists: AudioPlaylistRecord[];
  existingTags: string[];
  onCreateFolder: (name: string) => AudioFolderRecord;
  onCreatePlaylist: (name: string) => AudioPlaylistRecord;
  onApply: (patch: AudioBulkEditPatch) => void;
  onClose: () => void;
}

type InitialMembership = "all" | "some" | "none";
type StagedOverride = "unchanged" | "add" | "remove";

function nextTriState(
  initial: InitialMembership,
  current: StagedOverride,
): StagedOverride {
  if (initial === "none") return current === "add" ? "unchanged" : "add";
  if (initial === "all") return current === "remove" ? "unchanged" : "remove";
  if (current === "unchanged") return "add";
  if (current === "add") return "remove";
  return "unchanged";
}

export const AudioBulkEditModal: React.FC<AudioBulkEditModalProps> = ({
  selectedTracks,
  folders,
  playlists,
  existingTags,
  onCreateFolder,
  onCreatePlaylist,
  onApply,
  onClose,
}) => {
  const count = selectedTracks.length;
  const selectedIds = useMemo(
    () => selectedTracks.map((t) => t.id),
    [selectedTracks],
  );

  const [folderOverrides, setFolderOverrides] = useState<
    Record<string, StagedOverride>
  >({});
  const [playlistOverrides, setPlaylistOverrides] = useState<
    Record<string, StagedOverride>
  >({});
  const [tagOverrides, setTagOverrides] = useState<
    Record<string, StagedOverride>
  >({});
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [newPlaylistName, setNewPlaylistName] = useState("");

  const [artistValue, setArtistValue] = useState("");
  const [artistDirty, setArtistDirty] = useState(false);
  const [albumValue, setAlbumValue] = useState("");
  const [albumDirty, setAlbumDirty] = useState(false);
  const [genreValue, setGenreValue] = useState("");
  const [genreDirty, setGenreDirty] = useState(false);
  const [yearValue, setYearValue] = useState("");
  const [yearDirty, setYearDirty] = useState(false);
  const [favoriteAction, setFavoriteAction] = useState<
    "keep" | "favorite" | "unfavorite"
  >("keep");
  const [resetPosition, setResetPosition] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const flatFolders = useMemo(
    () => flattenFoldersHierarchy(folders),
    [folders],
  );

  const initialFolderState = useMemo(() => {
    const map = new Map<string, InitialMembership>();
    for (const f of folders) {
      const m = selectedTracks.filter((t) =>
        getAudioFolderIds(t).includes(f.id),
      ).length;
      map.set(f.id, m === 0 ? "none" : m === count ? "all" : "some");
    }
    return map;
  }, [folders, selectedTracks, count]);

  const initialPlaylistState = useMemo(() => {
    const map = new Map<string, InitialMembership>();
    for (const pl of playlists) {
      const m = selectedIds.filter((id) => pl.trackIds.includes(id)).length;
      map.set(pl.id, m === 0 ? "none" : m === count ? "all" : "some");
    }
    return map;
  }, [playlists, selectedIds, count]);

  const allTagEntries = useMemo(() => {
    const byLower = new Map<string, string>();
    for (const t of existingTags) byLower.set(t.toLowerCase(), t);
    for (const tr of selectedTracks) {
      for (const t of tr.tags) {
        if (!byLower.has(t.toLowerCase())) byLower.set(t.toLowerCase(), t);
      }
    }
    for (const t of customTags) {
      if (!byLower.has(t.toLowerCase())) byLower.set(t.toLowerCase(), t);
    }
    return Array.from(byLower.entries())
      .map(([lower, label]) => {
        const c = selectedTracks.filter((tr) =>
          tr.tags.some((t) => t.toLowerCase() === lower),
        ).length;
        const initial: InitialMembership =
          c === 0 ? "none" : c === count ? "all" : "some";
        return { lower, label, initial };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [existingTags, selectedTracks, customTags, count]);

  const addFolderIds = useMemo(
    () =>
      Object.entries(folderOverrides)
        .filter(([, v]) => v === "add")
        .map(([k]) => k),
    [folderOverrides],
  );
  const removeFolderIds = useMemo(
    () =>
      Object.entries(folderOverrides)
        .filter(([, v]) => v === "remove")
        .map(([k]) => k),
    [folderOverrides],
  );
  const addPlaylistIds = useMemo(
    () =>
      Object.entries(playlistOverrides)
        .filter(([, v]) => v === "add")
        .map(([k]) => k),
    [playlistOverrides],
  );
  const removePlaylistIds = useMemo(
    () =>
      Object.entries(playlistOverrides)
        .filter(([, v]) => v === "remove")
        .map(([k]) => k),
    [playlistOverrides],
  );
  const addTags = useMemo(
    () =>
      allTagEntries
        .filter((e) => tagOverrides[e.lower] === "add")
        .map((e) => e.label),
    [allTagEntries, tagOverrides],
  );
  const removeTags = useMemo(
    () =>
      allTagEntries
        .filter((e) => tagOverrides[e.lower] === "remove")
        .map((e) => e.label),
    [allTagEntries, tagOverrides],
  );

  const hasChanges =
    addFolderIds.length > 0 ||
    removeFolderIds.length > 0 ||
    addPlaylistIds.length > 0 ||
    removePlaylistIds.length > 0 ||
    addTags.length > 0 ||
    removeTags.length > 0 ||
    (artistDirty && Boolean(artistValue.trim())) ||
    albumDirty ||
    genreDirty ||
    yearDirty ||
    favoriteAction !== "keep" ||
    resetPosition;

  const handleAddTagDraft = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setCustomTags((prev) => {
      const next = [...prev];
      for (const p of parts) {
        if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
      }
      return next;
    });
    setTagOverrides((prev) => {
      const next = { ...prev };
      for (const p of parts) next[p.toLowerCase()] = "add";
      return next;
    });
    setNewTagInput("");
  };

  const renderTriBox = (
    initial: InitialMembership,
    override: StagedOverride,
  ) => {
    const visual =
      override === "add"
        ? "checked"
        : override === "remove"
          ? "unchecked"
          : initial === "all"
            ? "checked"
            : initial === "some"
              ? "indeterminate"
              : "unchecked";
    return (
      <span
        className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
          visual === "checked"
            ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]"
            : visual === "indeterminate"
              ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
              : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-transparent"
        }`}
      >
        {visual === "checked" && <Check className="w-3 h-3 stroke-[2.5]" />}
        {visual === "indeterminate" && (
          <Minus className="w-3 h-3 stroke-[2.5]" />
        )}
      </span>
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges) return;
    onApply({
      addFolderIds,
      removeFolderIds,
      addPlaylistIds,
      removePlaylistIds,
      addTags,
      removeTags,
      ...(artistDirty && artistValue.trim()
        ? { artist: artistValue.trim() }
        : {}),
      ...(albumDirty ? { album: albumValue.trim() } : {}),
      ...(genreDirty ? { genre: genreValue.trim() } : {}),
      ...(yearDirty ? { year: yearValue.trim() } : {}),
      favoriteAction,
      resetPosition,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bulk edit tracks"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
      >
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-baseline gap-2.5">
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Bulk Edit Tracks
              </h2>
              <span className="font-mono tabular-nums text-xs text-[var(--text-muted)]">
                {count} {count === 1 ? "track" : "tracks"} selected
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Only fields you edit will be updated across the selected tracks.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bulk edit modal"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          id="audio-bulk-edit-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)]"
        >
          {/* Left Column: Folders, Playlists & Tags */}
          <div className="p-5 sm:p-6 space-y-5">
            {/* Folders */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                Folders
              </h3>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFolderName.trim()) {
                      e.preventDefault();
                      const created = onCreateFolder(newFolderName.trim());
                      setFolderOverrides((prev) => ({
                        ...prev,
                        [created.id]: "add",
                      }));
                      setNewFolderName("");
                    }
                  }}
                  placeholder="Create folder…"
                  className="flex-1 h-8 px-2.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                />
                <button
                  type="button"
                  disabled={!newFolderName.trim()}
                  onClick={() => {
                    const created = onCreateFolder(newFolderName.trim());
                    setFolderOverrides((prev) => ({
                      ...prev,
                      [created.id]: "add",
                    }));
                    setNewFolderName("");
                  }}
                  className="h-8 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-45 inline-flex items-center gap-1 cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>
              {flatFolders.length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] divide-y divide-[var(--border-subtle)]">
                  {flatFolders.map(({ folder, depth }) => {
                    const initial = initialFolderState.get(folder.id) ?? "none";
                    const override = folderOverrides[folder.id] ?? "unchanged";
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() =>
                          setFolderOverrides((prev) => ({
                            ...prev,
                            [folder.id]: nextTriState(initial, override),
                          }))
                        }
                        className="w-full py-2 pr-3 flex items-center justify-between gap-2 text-left text-xs hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        style={{ paddingLeft: `${12 + depth * 12}px` }}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {renderTriBox(initial, override)}
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
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {override === "add"
                            ? "+ Add"
                            : override === "remove"
                              ? "− Remove"
                              : initial}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Playlists */}
            <section className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                Playlists
              </h3>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newPlaylistName.trim()) {
                      e.preventDefault();
                      const created = onCreatePlaylist(newPlaylistName.trim());
                      setPlaylistOverrides((prev) => ({
                        ...prev,
                        [created.id]: "add",
                      }));
                      setNewPlaylistName("");
                    }
                  }}
                  placeholder="Create playlist…"
                  className="flex-1 h-8 px-2.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                />
                <button
                  type="button"
                  disabled={!newPlaylistName.trim()}
                  onClick={() => {
                    const created = onCreatePlaylist(newPlaylistName.trim());
                    setPlaylistOverrides((prev) => ({
                      ...prev,
                      [created.id]: "add",
                    }));
                    setNewPlaylistName("");
                  }}
                  className="h-8 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-45 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>
              {playlists.length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] divide-y divide-[var(--border-subtle)]">
                  {playlists.map((pl) => {
                    const initial = initialPlaylistState.get(pl.id) ?? "none";
                    const override = playlistOverrides[pl.id] ?? "unchanged";
                    return (
                      <button
                        key={pl.id}
                        type="button"
                        onClick={() =>
                          setPlaylistOverrides((prev) => ({
                            ...prev,
                            [pl.id]: nextTriState(initial, override),
                          }))
                        }
                        className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left text-xs hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {renderTriBox(initial, override)}
                          <ListMusic
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: getTrackBadgeTint(pl.color) }}
                          />
                          <span className="truncate text-[var(--text-primary)]">
                            {pl.name}
                          </span>
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {override === "add"
                            ? "+ Add"
                            : override === "remove"
                              ? "− Remove"
                              : initial}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Tags */}
            <section className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                Tags
              </h3>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      handleAddTagDraft(newTagInput);
                    }
                  }}
                  placeholder="Type a tag and press Enter…"
                  className="flex-1 h-8 px-2.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                />
                <button
                  type="button"
                  onClick={() => handleAddTagDraft(newTagInput)}
                  className="h-8 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium cursor-pointer"
                >
                  Add
                </button>
              </div>
              {allTagEntries.length > 0 && (
                <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1.5 pt-1">
                  {allTagEntries.map(({ lower, label, initial }) => {
                    const override = tagOverrides[lower] ?? "unchanged";
                    return (
                      <button
                        key={lower}
                        type="button"
                        onClick={() =>
                          setTagOverrides((prev) => ({
                            ...prev,
                            [lower]: nextTriState(initial, override),
                          }))
                        }
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border cursor-pointer ${
                          override === "add"
                            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
                            : override === "remove"
                              ? "border-[var(--danger)] text-[var(--danger)] line-through"
                              : initial === "all"
                                ? "border-[var(--accent)]/60 bg-[var(--accent-soft)] text-[var(--text-primary)]"
                                : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                        }`}
                      >
                        <Tag className="w-3 h-3" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Metadata + Playback State */}
          <div className="p-5 sm:p-6 space-y-5">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                Metadata Fields
              </h3>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                  Artist
                </label>
                <input
                  type="text"
                  value={artistDirty ? artistValue : ""}
                  placeholder="Keep existing artists"
                  onChange={(e) => {
                    setArtistValue(e.target.value);
                    setArtistDirty(true);
                  }}
                  className="w-full h-9 px-3 text-xs rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                  Album / Series
                </label>
                <input
                  type="text"
                  value={albumDirty ? albumValue : ""}
                  placeholder="Keep existing albums (empty clears on apply)"
                  onChange={(e) => {
                    setAlbumValue(e.target.value);
                    setAlbumDirty(true);
                  }}
                  className="w-full h-9 px-3 text-xs rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">
                    Genre
                  </label>
                  <input
                    type="text"
                    value={genreDirty ? genreValue : ""}
                    placeholder="Keep existing"
                    onChange={(e) => {
                      setGenreValue(e.target.value);
                      setGenreDirty(true);
                    }}
                    className="w-full h-9 px-3 text-xs rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">
                    Year
                  </label>
                  <input
                    type="text"
                    value={yearDirty ? yearValue : ""}
                    placeholder="Keep existing"
                    onChange={(e) => {
                      setYearValue(e.target.value);
                      setYearDirty(true);
                    }}
                    className="w-full h-9 px-3 text-xs rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                  />
                </div>
              </div>
            </section>

            <section className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                Favorites &amp; Resume Position
              </h3>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "keep", label: "Keep" },
                    { id: "favorite", label: "Favorite" },
                    { id: "unfavorite", label: "Unfavorite" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFavoriteAction(opt.id)}
                    className={`h-8 px-2 rounded-md border text-xs font-medium inline-flex items-center justify-center gap-1 cursor-pointer ${
                      favoriteAction === opt.id
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {opt.id !== "keep" && <Star className="w-3 h-3" />}
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resetPosition}
                  onChange={(e) => setResetPosition(e.target.checked)}
                  className="accent-[var(--accent)] cursor-pointer"
                />
                <RotateCcw className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>Reset saved timestamps to 0:00</span>
              </label>
            </section>
          </div>
        </form>

        <div className="px-5 sm:px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-md border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="audio-bulk-edit-form"
            disabled={!hasChanges}
            className="px-4 py-2 text-xs font-medium rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] disabled:opacity-45 cursor-pointer"
          >
            Apply to {count} {count === 1 ? "Track" : "Tracks"}
          </button>
        </div>
      </div>
    </div>
  );
};
