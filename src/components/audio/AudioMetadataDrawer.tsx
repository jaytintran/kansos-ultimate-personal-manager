import {
  AlertTriangle,
  Check,
  FileUp,
  Folder,
  Link2,
  ListMusic,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import {
  AUDIO_ACCEPT_STRING,
  getAudioFolderIds,
  sanitizeAudioFileBaseName,
  withAudioFolderIds,
} from "../../lib/audioFormatters";
import { formatAudioDuration } from "../../lib/audioFormatters";
import {
  flattenFoldersHierarchy,
  formatFileSize,
  formatShortDate,
  getFolderColorHex,
} from "../../lib/formatters";
import type {
  AudioFolderRecord,
  AudioPlaylistRecord,
  AudioTrackRecord,
} from "../../types/audio";
import type { CoverStyle } from "../../types/library";
import { isAndroidCapacitor } from "../../utils/androidSaf";
import { CoverCustomizer } from "../library/CoverCustomizer";
import { AudioArtwork } from "./AudioArtwork";

interface AudioMetadataDrawerProps {
  track: AudioTrackRecord;
  isMissing?: boolean;
  folders: AudioFolderRecord[];
  playlists: AudioPlaylistRecord[];
  existingTags: string[];
  onSave: (
    updated: AudioTrackRecord,
    selectedPlaylistIds: string[],
  ) => void;
  onReplaceFile: (trackId: string, file: File) => Promise<void>;
  onRelinkTrack?: (track: AudioTrackRecord) => void;
  onDelete: (trackId: string) => void;
  onCreateFolder: (name: string) => AudioFolderRecord;
  onCreatePlaylist: (name: string) => AudioPlaylistRecord;
  onClose: () => void;
}

function splitAudioFileName(
  fileName: string,
  fallbackFormat: string,
): { baseName: string; extension: string } {
  const trimmed = (fileName || "").trim();
  const match = trimmed.match(/^(.*?)(\.[a-z0-9]{2,6})$/i);
  if (match && match[1]) {
    return { baseName: match[1], extension: match[2].toLowerCase() };
  }
  return { baseName: trimmed || "track", extension: `.${fallbackFormat}` };
}

export const AudioMetadataDrawer: React.FC<AudioMetadataDrawerProps> = ({
  track,
  isMissing = false,
  folders,
  playlists,
  existingTags,
  onSave,
  onReplaceFile,
  onRelinkTrack,
  onDelete,
  onCreateFolder,
  onCreatePlaylist,
  onClose,
}) => {
  const initialFileParts = useMemo(
    () => splitAudioFileName(track.fileName, track.format),
    [track.fileName, track.format],
  );

  const [title, setTitle] = useState(track.title);
  const [fileBaseName, setFileBaseName] = useState(initialFileParts.baseName);
  const [artist, setArtist] = useState(track.artist);
  const [album, setAlbum] = useState(track.album ?? "");
  const [trackNumber, setTrackNumber] = useState(
    track.trackNumber != null ? String(track.trackNumber) : "",
  );
  const [year, setYear] = useState(track.year ?? "");
  const [genre, setGenre] = useState(track.genre ?? "");
  const [notes, setNotes] = useState(track.notes ?? "");
  const [folderIds, setFolderIds] = useState<string[]>(() =>
    getAudioFolderIds(track),
  );
  const [playlistIds, setPlaylistIds] = useState<string[]>(() =>
    playlists
      .filter((pl) => pl.trackIds.includes(track.id))
      .map((pl) => pl.id),
  );
  const [isFavorite, setIsFavorite] = useState(Boolean(track.isFavorite));
  const [tags, setTags] = useState<string[]>(track.tags);
  const [tagInput, setTagInput] = useState("");
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(
    track.coverDataUrl,
  );
  const [coverPaletteIndex, setCoverPaletteIndex] = useState<number>(
    track.coverPaletteIndex,
  );
  const [coverStyle, setCoverStyle] = useState<CoverStyle>(
    track.coverStyle ?? "editorial",
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [quickFolder, setQuickFolder] = useState("");
  const [showQuickFolder, setShowQuickFolder] = useState(false);
  const [quickPlaylist, setQuickPlaylist] = useState("");
  const [showQuickPlaylist, setShowQuickPlaylist] = useState(false);
  const [isReplacingFile, setIsReplacingFile] = useState(false);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  const flatFolders = useMemo(
    () => flattenFoldersHierarchy(folders),
    [folders],
  );

  const addTagsFromString = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setTags((prev) => {
      const next = [...prev];
      for (const t of parts) {
        if (!next.some((ex) => ex.toLowerCase() === t.toLowerCase())) {
          next.push(t);
        }
      }
      return next;
    });
    setTagInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pendingTag = tagInput.trim();
    const finalTags = pendingTag
      ? Array.from(
          new Set([
            ...tags,
            ...pendingTag
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          ]),
        )
      : tags;

    const cleanBaseName =
      sanitizeAudioFileBaseName(fileBaseName) || initialFileParts.baseName;
    const nextFileName = `${cleanBaseName}${initialFileParts.extension}`;
    const parsedNum = parseInt(trackNumber, 10);

    onSave(
      withAudioFolderIds(
        {
          ...track,
          title: title.trim() || track.title,
          fileName: nextFileName,
          artist: artist.trim() || "Unknown Artist",
          album: album.trim(),
          trackNumber:
            Number.isFinite(parsedNum) && parsedNum > 0 ? parsedNum : null,
          year: year.trim(),
          genre: genre.trim(),
          notes: notes.trim(),
          isFavorite,
          tags: finalTags,
          coverDataUrl,
          coverPaletteIndex,
          coverStyle,
        },
        folderIds,
      ),
      playlistIds,
    );
  };

  const suggestedTags = existingTags.filter(
    (t) =>
      !tags.some((curr) => curr.toLowerCase() === t.toLowerCase()) &&
      (tagInput.trim() === "" ||
        t.toLowerCase().includes(tagInput.trim().toLowerCase())),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/45"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit metadata for ${track.title}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg h-full bg-[var(--bg-elevated)] border-l border-[var(--border-subtle)] flex flex-col shadow-2xl"
      >
        <div className="h-14 px-6 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
            Edit Audio Metadata
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close metadata editor"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          id="audio-metadata-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-5"
        >
          {/* Artwork + File Actions */}
          <div className="space-y-4 pb-5 border-b border-[var(--border-subtle)]">
            <div className="flex gap-4 items-start">
              <div className="w-24 shrink-0">
                <AudioArtwork
                  title={title || track.title}
                  artist={artist || track.artist}
                  format={track.format}
                  coverDataUrl={coverDataUrl}
                  paletteIndex={coverPaletteIndex}
                  coverStyle={coverStyle}
                />
              </div>
              <div className="flex-1 min-w-0 text-xs text-[var(--text-secondary)] space-y-2">
                <div>
                  <label
                    htmlFor="audio-file-base-name"
                    className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1"
                  >
                    File Name
                  </label>
                  <div className="flex items-stretch rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] focus-within:border-[var(--accent)] overflow-hidden">
                    <input
                      id="audio-file-base-name"
                      type="text"
                      required
                      value={fileBaseName}
                      onChange={(e) => setFileBaseName(e.target.value)}
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-transparent text-[var(--text-primary)] focus:outline-none"
                    />
                    <span className="inline-flex items-center px-2 py-1.5 text-[11px] font-mono tabular-nums text-[var(--text-muted)] bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] select-none shrink-0">
                      {initialFileParts.extension}
                    </span>
                  </div>
                </div>
                <p className="font-mono tabular-nums text-[11px] text-[var(--text-muted)]">
                  {track.format.toUpperCase()} ·{" "}
                  {formatAudioDuration(track.durationSeconds)} ·{" "}
                  {formatFileSize(track.fileSize)} · Added{" "}
                  {formatShortDate(track.addedAt)}
                </p>
                {isMissing && (
                  <p className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--warning)]">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>File link missing on device</span>
                  </p>
                )}
                <div className="pt-0.5">
                  <input
                    ref={replaceFileInputRef}
                    type="file"
                    accept=".mp3,.m4a,.wav,.ogg,.flac,.opus,.aac,audio/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setIsReplacingFile(true);
                      try {
                        await onReplaceFile(track.id, file);
                      } finally {
                        setIsReplacingFile(false);
                      }
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isReplacingFile}
                    onClick={() => {
                      if (
                        isAndroidCapacitor() &&
                        track.storageMode === "android-uri" &&
                        onRelinkTrack
                      ) {
                        onRelinkTrack(track);
                        return;
                      }
                      replaceFileInputRef.current?.click();
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--accent)] disabled:opacity-55 cursor-pointer"
                  >
                    {isMissing ? (
                      <Link2 className="w-3 h-3 text-[var(--accent)] shrink-0" />
                    ) : (
                      <FileUp className="w-3 h-3 text-[var(--accent)] shrink-0" />
                    )}
                    <span>
                      {isReplacingFile
                        ? "Replacing…"
                        : isMissing
                          ? "Relink File"
                          : "Replace Audio File"}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <CoverCustomizer
              title={title || track.title}
              author={artist || track.artist}
              format="epub"
              coverDataUrl={coverDataUrl}
              coverPaletteIndex={coverPaletteIndex}
              coverStyle={coverStyle}
              collapsibleGenerated
              onChange={(patch) => {
                if ("coverDataUrl" in patch)
                  setCoverDataUrl(patch.coverDataUrl ?? null);
                if (patch.coverPaletteIndex !== undefined)
                  setCoverPaletteIndex(patch.coverPaletteIndex);
                if (patch.coverStyle !== undefined)
                  setCoverStyle(patch.coverStyle);
              }}
            />
          </div>

          {/* Primary Metadata */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Track Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Artist
                </label>
                <input
                  type="text"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Album
                </label>
                <input
                  type="text"
                  value={album}
                  onChange={(e) => setAlbum(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 text-sm rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Track #
                </label>
                <input
                  type="number"
                  min={1}
                  value={trackNumber}
                  onChange={(e) => setTrackNumber(e.target.value)}
                  placeholder="1"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Year
                </label>
                <input
                  type="text"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2024"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Genre
                </label>
                <input
                  type="text"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="Ambient"
                  className="w-full px-3 py-2 text-sm rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)]"
                />
              </div>
            </div>
          </div>

          {/* Folders & Playlists */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Folders ({folderIds.length})
                </label>
                <button
                  type="button"
                  onClick={() => setShowQuickFolder((v) => !v)}
                  className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
                >
                  + New
                </button>
              </div>
              {showQuickFolder && (
                <div className="flex gap-1.5 mb-2">
                  <input
                    type="text"
                    autoFocus
                    value={quickFolder}
                    onChange={(e) => setQuickFolder(e.target.value)}
                    placeholder="Folder name"
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!quickFolder.trim()) return;
                      const created = onCreateFolder(quickFolder.trim());
                      setFolderIds((prev) =>
                        prev.includes(created.id)
                          ? prev
                          : [...prev, created.id],
                      );
                      setQuickFolder("");
                      setShowQuickFolder(false);
                    }}
                    className="px-2.5 py-1.5 text-xs rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              )}
              <div className="max-h-32 overflow-y-auto rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] divide-y divide-[var(--border-subtle)]">
                {flatFolders.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-[var(--text-muted)]">
                    No folders yet
                  </p>
                ) : (
                  flatFolders.map(({ folder, depth }) => {
                    const checked = folderIds.includes(folder.id);
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() =>
                          setFolderIds((prev) =>
                            prev.includes(folder.id)
                              ? prev.filter((id) => id !== folder.id)
                              : [...prev, folder.id],
                          )
                        }
                        className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left text-xs hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        style={{ paddingLeft: `${10 + depth * 12}px` }}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <Folder
                            className="w-3.5 h-3.5 shrink-0"
                            style={{
                              color:
                                getFolderColorHex(folder.color) ??
                                "var(--text-muted)",
                            }}
                          />
                          <span className="truncate">{folder.name}</span>
                        </span>
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                            checked
                              ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]"
                              : "border-[var(--border-strong)] text-transparent"
                          }`}
                        >
                          <Check className="w-3 h-3 stroke-[2.5]" />
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Playlists ({playlistIds.length})
                </label>
                <button
                  type="button"
                  onClick={() => setShowQuickPlaylist((v) => !v)}
                  className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
                >
                  + New
                </button>
              </div>
              {showQuickPlaylist && (
                <div className="flex gap-1.5 mb-2">
                  <input
                    type="text"
                    autoFocus
                    value={quickPlaylist}
                    onChange={(e) => setQuickPlaylist(e.target.value)}
                    placeholder="Playlist name"
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!quickPlaylist.trim()) return;
                      const created = onCreatePlaylist(quickPlaylist.trim());
                      setPlaylistIds((prev) =>
                        prev.includes(created.id)
                          ? prev
                          : [...prev, created.id],
                      );
                      setQuickPlaylist("");
                      setShowQuickPlaylist(false);
                    }}
                    className="px-2.5 py-1.5 text-xs rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              )}
              <div className="max-h-32 overflow-y-auto rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] divide-y divide-[var(--border-subtle)]">
                {playlists.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-[var(--text-muted)]">
                    No playlists yet
                  </p>
                ) : (
                  playlists.map((pl) => {
                    const checked = playlistIds.includes(pl.id);
                    return (
                      <button
                        key={pl.id}
                        type="button"
                        onClick={() =>
                          setPlaylistIds((prev) =>
                            prev.includes(pl.id)
                              ? prev.filter((id) => id !== pl.id)
                              : [...prev, pl.id],
                          )
                        }
                        className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left text-xs hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <ListMusic className="w-3.5 h-3.5 shrink-0 text-[var(--text-secondary)]" />
                          <span className="truncate">{pl.name}</span>
                        </span>
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                            checked
                              ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]"
                              : "border-[var(--border-strong)] text-transparent"
                          }`}
                        >
                          <Check className="w-3 h-3 stroke-[2.5]" />
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-[var(--text-primary)] cursor-pointer">
            <input
              type="checkbox"
              checked={isFavorite}
              onChange={(e) => setIsFavorite(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer"
            />
            <span>Mark as Favorite</span>
          </label>

          {/* Tags Editor */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Tags
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTagsFromString(tagInput);
                  }
                }}
                placeholder="Type a tag and press Enter..."
                className="flex-1 min-w-0 px-3 py-2 text-sm rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)]"
              />
              <button
                type="button"
                onClick={() => addTagsFromString(tagInput)}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>
            {tags.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setTags((prev) => prev.filter((item) => item !== t))
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--danger)] hover:text-[var(--danger)] cursor-pointer"
                  >
                    <span>{t}</span>
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}
            {suggestedTags.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
                <span>Suggestions:</span>
                {suggestedTags.slice(0, 6).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addTagsFromString(s)}
                    className="text-[var(--text-secondary)] hover:text-[var(--accent)] underline cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Track Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Personal notes about this track, mix cue points, etc..."
              className="w-full px-3 py-2 text-sm rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)] resize-y"
            />
          </div>
        </form>

        <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3 shrink-0 bg-[var(--bg-surface)]">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onDelete(track.id)}
                className="px-3 py-2 text-xs font-medium rounded-md bg-[var(--danger)] text-white cursor-pointer"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2.5 py-2 text-xs text-[var(--text-secondary)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--danger)] hover:bg-[var(--bg-surface-hover)] rounded-md cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Track
            </button>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-md border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="audio-metadata-form"
              className="px-4 py-2 text-xs font-medium rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
