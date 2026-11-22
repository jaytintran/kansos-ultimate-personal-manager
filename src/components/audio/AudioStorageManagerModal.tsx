import {
  AlertTriangle,
  Check,
  FileUp,
  FolderOpen,
  HardDrive,
  Link2,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AUDIO_ACCEPT_STRING, formatAudioDuration } from "../../lib/audioFormatters";
import { audioDb, type AudioFileAuditEntry } from "../../lib/db";
import { formatFileSize, formatShortDate } from "../../lib/formatters";
import type { AudioFormat, AudioTrackRecord } from "../../types/audio";
import {
  checkAndroidAudioUris,
  isAndroidCapacitor,
  type AndroidLinkedFolder,
} from "../../utils/androidSaf";
import { AudioArtwork } from "./AudioArtwork";

type StorageSortField = "sizeDesc" | "sizeAsc" | "title" | "addedAt" | "format";
type IssueFilter = "all" | "duplicates" | "missing";

interface AudioStorageManagerModalProps {
  isOpen: boolean;
  tracks: AudioTrackRecord[];
  androidLinkedFolders?: AndroidLinkedFolder[];
  onClose: () => void;
  onReplaceFile: (trackId: string, file: File) => Promise<void>;
  onRelinkTrack?: (track: AudioTrackRecord) => void;
  onDeleteTracks: (trackIds: string[]) => Promise<void>;
  onEditMetadata: (track: AudioTrackRecord) => void;
  onImportAudio: () => void;
  onOpenAndroidFolderManager?: () => void;
  onNotify: (
    title: string,
    tone: "info" | "success" | "error",
    detail?: string,
  ) => void;
}

export const AudioStorageManagerModal: React.FC<
  AudioStorageManagerModalProps
> = ({
  isOpen,
  tracks,
  androidLinkedFolders = [],
  onClose,
  onReplaceFile,
  onRelinkTrack,
  onDeleteTracks,
  onEditMetadata,
  onImportAudio,
  onOpenAndroidFolderManager,
  onNotify,
}) => {
  const [auditEntries, setAuditEntries] = useState<AudioFileAuditEntry[]>([]);
  const [readableUriSet, setReadableUriSet] = useState<Set<string>>(new Set());
  const [isAuditing, setIsAuditing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState<"all" | AudioFormat>("all");
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");
  const [sortField, setSortField] = useState<StorageSortField>("sizeDesc");

  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cleaningOrphans, setCleaningOrphans] = useState(false);

  const replaceTargetIdRef = useRef<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const isAndroidApp = useMemo(() => isAndroidCapacitor(), []);

  const runAudit = useCallback(async () => {
    setIsAuditing(true);
    try {
      const androidUris = isAndroidCapacitor()
        ? Array.from(
            new Set(
              tracks
                .filter((t) => t.storageMode === "android-uri" && t.externalUri)
                .map((t) => t.externalUri as string),
            ),
          )
        : [];

      const [entries, uriChecks] = await Promise.all([
        audioDb.auditAudioFiles(),
        androidUris.length > 0
          ? checkAndroidAudioUris(androidUris).catch(() => ({}))
          : Promise.resolve({}),
      ]);

      setAuditEntries(entries);
      setReadableUriSet(
        new Set(
          Object.entries(uriChecks)
            .filter(([, readable]) => Boolean(readable))
            .map(([uri]) => uri),
        ),
      );
    } catch {
      // Non-fatal fallback
    } finally {
      setIsAuditing(false);
    }
  }, [tracks]);

  useEffect(() => {
    if (!isOpen) return;
    setConfirmDeleteId(null);
    void runAudit();
  }, [isOpen, runAudit]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !replacingId && !deletingId) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, replacingId, deletingId, onClose]);

  const auditByTrackId = useMemo(
    () => new Map(auditEntries.map((entry) => [entry.trackId, entry])),
    [auditEntries],
  );
  const trackIdSet = useMemo(() => new Set(tracks.map((t) => t.id)), [tracks]);

  const orphanEntries = useMemo(
    () => auditEntries.filter((e) => !trackIdSet.has(e.trackId)),
    [auditEntries, trackIdSet],
  );
  const orphanBytes = useMemo(
    () => orphanEntries.reduce((s, e) => s + e.byteLength, 0),
    [orphanEntries],
  );

  const duplicateMap = useMemo(() => {
    const byHash = new Map<string, AudioTrackRecord[]>();
    const sorted = [...tracks].sort((a, b) => a.addedAt - b.addedAt);
    for (const tr of sorted) {
      const sha = auditByTrackId.get(tr.id)?.sha256 || tr.fileHash;
      if (!sha) continue;
      const group = byHash.get(sha) ?? [];
      group.push(tr);
      byHash.set(sha, group);
    }
    const map = new Map<string, string>();
    for (const group of byHash.values()) {
      if (group.length > 1) {
        const primary = group[0];
        for (const item of group) {
          map.set(
            item.id,
            item.id === primary.id ? group[1].title : primary.title,
          );
        }
      }
    }
    return map;
  }, [tracks, auditByTrackId]);

  const linkedReadableIds = useMemo(() => {
    const set = new Set<string>();
    if (!isAndroidApp) return set;
    for (const tr of tracks) {
      if (
        tr.storageMode === "android-uri" &&
        tr.externalUri &&
        readableUriSet.has(tr.externalUri)
      ) {
        set.add(tr.id);
      }
    }
    return set;
  }, [tracks, readableUriSet, isAndroidApp]);

  const missingTrackIds = useMemo(() => {
    if (isAuditing) return new Set<string>();
    const missing = new Set<string>();
    for (const tr of tracks) {
      if (linkedReadableIds.has(tr.id)) continue;
      if (!auditByTrackId.has(tr.id)) missing.add(tr.id);
    }
    return missing;
  }, [tracks, auditByTrackId, isAuditing, linkedReadableIds]);

  const getTrackBytes = useCallback(
    (tr: AudioTrackRecord): number => {
      if (linkedReadableIds.has(tr.id)) return 0;
      const audited = auditByTrackId.get(tr.id);
      if (audited) return audited.byteLength;
      if (missingTrackIds.has(tr.id)) return 0;
      return tr.fileSize || 0;
    },
    [auditByTrackId, linkedReadableIds, missingTrackIds],
  );

  const totalStoredBytes = useMemo(
    () => tracks.reduce((sum, tr) => sum + getTrackBytes(tr), 0),
    [tracks, getTrackBytes],
  );

  const filteredTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = tracks.filter((tr) => {
      if (formatFilter !== "all" && tr.format !== formatFilter) return false;
      if (issueFilter === "duplicates" && !duplicateMap.has(tr.id)) return false;
      if (issueFilter === "missing" && !missingTrackIds.has(tr.id)) return false;
      if (q) {
        const hay = `${tr.title} ${tr.artist} ${tr.album ?? ""} ${tr.fileName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      if (sortField === "sizeDesc") return getTrackBytes(b) - getTrackBytes(a);
      if (sortField === "sizeAsc") return getTrackBytes(a) - getTrackBytes(b);
      if (sortField === "title") return a.title.localeCompare(b.title);
      if (sortField === "format") {
        return a.format.localeCompare(b.format) || getTrackBytes(b) - getTrackBytes(a);
      }
      return b.addedAt - a.addedAt;
    });
    return list;
  }, [
    tracks,
    searchQuery,
    formatFilter,
    issueFilter,
    sortField,
    duplicateMap,
    missingTrackIds,
    getTrackBytes,
  ]);

  if (!isOpen) return null;

  const handleTriggerReplace = (track: AudioTrackRecord) => {
    if (isAndroidCapacitor() && track.storageMode === "android-uri" && onRelinkTrack) {
      onRelinkTrack(track);
      return;
    }
    replaceTargetIdRef.current = track.id;
    replaceInputRef.current?.click();
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const targetId = replaceTargetIdRef.current;
    replaceTargetIdRef.current = null;
    if (!file || !targetId) return;
    setReplacingId(targetId);
    try {
      await onReplaceFile(targetId, file);
      await runAudit();
    } finally {
      setReplacingId(null);
    }
  };

  const handleCleanOrphans = async () => {
    if (orphanEntries.length === 0) return;
    setCleaningOrphans(true);
    try {
      await audioDb.deleteOrphanAudioFiles(orphanEntries.map((o) => o.trackId));
      onNotify(
        `Cleaned ${orphanEntries.length} orphaned audio ${orphanEntries.length === 1 ? "blob" : "blobs"}`,
        "success",
        `Freed ${formatFileSize(orphanBytes)}`,
      );
      await runAudit();
    } catch (err) {
      onNotify(
        "Could not clean orphaned audio blobs",
        "error",
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setCleaningOrphans(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-4"
      onClick={() => {
        if (!replacingId && !deletingId) onClose();
      }}
    >
      <input
        ref={replaceInputRef}
        type="file"
        accept={AUDIO_ACCEPT_STRING}
        onChange={(e) => void handleFileChosen(e)}
        className="hidden"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Audio Storage Manager"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[88vh] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <HardDrive className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Audio Storage &amp; Files
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)] font-mono tabular-nums">
                {tracks.length} {tracks.length === 1 ? "track" : "tracks"} ·{" "}
                {formatFileSize(totalStoredBytes)} in IndexedDB
                {linkedReadableIds.size > 0
                  ? ` · ${linkedReadableIds.size} linked on device`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={isAuditing}
              onClick={() => void runAudit()}
              title="Refresh storage audit"
              className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isAuditing ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              disabled={Boolean(replacingId || deletingId)}
              onClick={onClose}
              aria-label="Close storage manager"
              className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {(duplicateMap.size > 0 ||
          missingTrackIds.size > 0 ||
          orphanEntries.length > 0 ||
          (isAndroidApp && onOpenAndroidFolderManager)) && (
          <div className="px-5 sm:px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {duplicateMap.size > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setIssueFilter((p) => (p === "duplicates" ? "all" : "duplicates"))
                  }
                  className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{duplicateMap.size} duplicate audio files</span>
                </button>
              )}
              {missingTrackIds.size > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setIssueFilter((p) => (p === "missing" ? "all" : "missing"))
                  }
                  className="inline-flex items-center gap-1.5 text-[var(--danger)] hover:underline cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{missingTrackIds.size} missing / unreachable files</span>
                </button>
              )}
              {orphanEntries.length > 0 && (
                <button
                  type="button"
                  disabled={cleaningOrphans}
                  onClick={() => void handleCleanOrphans()}
                  className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {cleaningOrphans
                      ? "Cleaning…"
                      : `Clean ${orphanEntries.length} orphan blobs (${formatFileSize(orphanBytes)})`}
                  </span>
                </button>
              )}
            </div>

            {isAndroidApp && onOpenAndroidFolderManager && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAndroidFolderManager();
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Linked Folders ({androidLinkedFolders.length})</span>
              </button>
            )}
          </div>
        )}

        {tracks.length > 0 && (
          <div className="px-5 sm:px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[200px]">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by title, artist, or file…"
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                />
              </div>
              <select
                value={formatFilter}
                onChange={(e) =>
                  setFormatFilter(e.target.value as "all" | AudioFormat)
                }
                aria-label="Filter audio format"
                className="px-2.5 py-1.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] cursor-pointer"
              >
                <option value="all">All Formats</option>
                <option value="mp3">MP3</option>
                <option value="m4a">M4A</option>
                <option value="wav">WAV</option>
                <option value="flac">FLAC</option>
                <option value="ogg">OGG</option>
                <option value="opus">OPUS</option>
                <option value="aac">AAC</option>
              </select>
            </div>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as StorageSortField)}
              aria-label="Sort audio files"
              className="px-2.5 py-1.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] cursor-pointer"
            >
              <option value="sizeDesc">Largest first</option>
              <option value="sizeAsc">Smallest first</option>
              <option value="title">Title (A–Z)</option>
              <option value="format">Format</option>
              <option value="addedAt">Recently added</option>
            </select>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {tracks.length === 0 ? (
            <div className="py-16 px-6 text-center space-y-3">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Your local audio archive is empty
              </p>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                Import MP3, M4A, WAV, OGG, FLAC, OPUS, or AAC files to organize and
                mix them offline.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onImportAudio();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] cursor-pointer"
              >
                Import Audio Files
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {filteredTracks.map((tr) => {
                const bytes = getTrackBytes(tr);
                const isLinkedReadable = linkedReadableIds.has(tr.id);
                const isBrokenAndroidLink =
                  isAndroidApp &&
                  tr.storageMode === "android-uri" &&
                  missingTrackIds.has(tr.id);
                const isMissing = missingTrackIds.has(tr.id);
                const dupTitle = duplicateMap.get(tr.id);
                return (
                  <div
                    key={tr.id}
                    className="px-5 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--bg-surface-hover)]/50"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 shrink-0">
                        <AudioArtwork
                          title={tr.title}
                          artist={tr.artist}
                          format={tr.format}
                          coverDataUrl={tr.coverDataUrl}
                          paletteIndex={tr.coverPaletteIndex}
                          coverStyle={tr.coverStyle}
                          size="sm"
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {tr.title}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--text-secondary)]">
                          <span className="truncate max-w-[160px]">{tr.artist}</span>
                          <span>·</span>
                          <span className="font-mono tabular-nums uppercase">
                            {tr.format}
                          </span>
                          <span>·</span>
                          <span className="font-mono tabular-nums">
                            {formatAudioDuration(tr.durationSeconds)}
                          </span>
                          <span className="hidden sm:inline text-[var(--text-muted)]">
                            · Added {formatShortDate(tr.addedAt)}
                          </span>
                        </div>
                        {(isLinkedReadable || isMissing || dupTitle) && (
                          <div className="flex flex-wrap items-center gap-x-3 text-[11px]">
                            {isLinkedReadable && (
                              <span className="inline-flex items-center gap-1 text-[var(--accent)]">
                                <Link2 className="w-3 h-3" />
                                Linked ({formatFileSize(tr.fileSize)})
                              </span>
                            )}
                            {isBrokenAndroidLink ? (
                              <span className="inline-flex items-center gap-1 text-[var(--danger)]">
                                <AlertTriangle className="w-3 h-3" />
                                Android file unreachable — relink
                              </span>
                            ) : isMissing ? (
                              <span className="inline-flex items-center gap-1 text-[var(--danger)]">
                                <AlertTriangle className="w-3 h-3" />
                                Audio blob missing on this device
                              </span>
                            ) : null}
                            {dupTitle && (
                              <span className="text-[var(--accent)]">
                                Identical bytes to &ldquo;{dupTitle}&rdquo;
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-right min-w-[68px] font-mono tabular-nums text-xs font-semibold text-[var(--text-primary)]">
                        {isMissing || isLinkedReadable ? "0 B" : formatFileSize(bytes)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={Boolean(replacingId || deletingId)}
                          onClick={() => handleTriggerReplace(tr)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer whitespace-nowrap"
                        >
                          {isBrokenAndroidLink ? (
                            <Link2 className="w-3 h-3 text-[var(--accent)]" />
                          ) : (
                            <FileUp className="w-3 h-3 text-[var(--accent)]" />
                          )}
                          <span>
                            {replacingId === tr.id
                              ? "Saving…"
                              : isBrokenAndroidLink
                                ? "Relink File"
                                : "Replace"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditMetadata(tr)}
                          aria-label={`Edit ${tr.title}`}
                          className="p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteId === tr.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={deletingId === tr.id}
                              onClick={async () => {
                                setDeletingId(tr.id);
                                try {
                                  await onDeleteTracks([tr.id]);
                                  setConfirmDeleteId(null);
                                  await runAudit();
                                } finally {
                                  setDeletingId(null);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-md bg-[var(--danger)] text-white cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              <span>Confirm</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="p-1 rounded text-[var(--text-secondary)] cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(tr.id)}
                            aria-label={`Delete ${tr.title}`}
                            className="p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--danger)] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 sm:px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] text-[var(--text-secondary)]">
            Audio files stay 100% local per device and are excluded from Gist sync.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
