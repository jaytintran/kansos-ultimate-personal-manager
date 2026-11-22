import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CheckSquare,
  ChevronDown,
  FolderOpen,
  GripVertical,
  Headphones,
  LayoutGrid,
  List,
  PanelLeftOpen,
  PanelRight,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { AudioAndroidFolderManagerModal } from "../components/audio/AudioAndroidFolderManagerModal";
import { AudioAndroidImportChoiceModal } from "../components/audio/AudioAndroidImportChoiceModal";
import { AudioBulkActionBar } from "../components/audio/AudioBulkActionBar";
import {
  AudioBulkEditModal,
  type AudioBulkEditPatch,
} from "../components/audio/AudioBulkEditModal";
import { AudioConfirmDeleteModal } from "../components/audio/AudioConfirmDeleteModal";
import {
  AudioContextMenu,
  type AudioContextMenuState,
} from "../components/audio/AudioContextMenu";
import {
  AudioDuplicateImportModal,
  type AudioDuplicateAction,
  type PendingAudioDuplicateItem,
} from "../components/audio/AudioDuplicateImportModal";
import { AudioGrid } from "../components/audio/AudioGrid";
import { AudioImportBackupModal } from "../components/audio/AudioImportBackupModal";
import { AudioInspector } from "../components/audio/AudioInspector";
import { AudioMetadataDrawer } from "../components/audio/AudioMetadataDrawer";
import { AudioMobileActionSheet } from "../components/audio/AudioMobileActionSheet";
import { AudioMobileFilterSheet } from "../components/audio/AudioMobileFilterSheet";
import { AudioOptionsPopover } from "../components/audio/AudioOptionsPopover";
import { AudioPlayerDeck } from "../components/audio/AudioPlayerDeck";
import {
  AudioSidebar,
  type ActiveAudioFilter,
} from "../components/audio/AudioSidebar";
import { AudioStorageManagerModal } from "../components/audio/AudioStorageManagerModal";
import { AudioTable } from "../components/audio/AudioTable";
import { FloatingAudioDropDock } from "../components/audio/FloatingAudioDropDock";
import { MobileAudioList } from "../components/audio/MobileAudioList";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  useAudioMixerEngine,
  type AudioControllerHandle,
  type AudioPlaybackSummary,
} from "../hooks/useAudioMixerEngine";
import { useAudioPreferences } from "../hooks/useAudioPreferences";
import {
  exportAudioBackupZip,
  parseAudioBackupZip,
  type ParsedAudioBackupArchive,
} from "../lib/audioBackup";
import { findMissingAudioIds } from "../lib/audioFileLoader";
import {
  AUDIO_ACCEPT_STRING,
  AUDIO_FORMAT_LABELS,
  getAudioFolderIds,
  withAudioFolderIds,
} from "../lib/audioFormatters";
import {
  detectAudioFormat,
  extractAudioMetadataFromAndroidUri,
  extractAudioMetadataFromBuffer,
} from "../lib/audioMetadata";
import { audioDb } from "../lib/db";
import { getFolderDescendantIds } from "../lib/formatters";
import { DEFAULT_AUDIO_STATE } from "../data/seedData";
import type {
  AudioFormat,
  AudioImportMetadataResult,
  AudioSortField,
  AudioTrackRecord,
} from "../types/audio";
import {
  addOrUpdateAudioAndroidLinkedFolder,
  getAudioAndroidImportMode,
  getAudioAndroidLinkedFolders,
  isAndroidCapacitor,
  pickAndroidAudioDocuments,
  pickAndroidAudioFolder,
  readAndroidUriAsArrayBuffer,
  releaseAndroidUri,
  removeAudioAndroidLinkedFolder,
  scanAndroidAudioFolder,
  setAudioAndroidImportMode,
  type AndroidImportStorageMode,
  type AndroidLinkedFolder,
  type AndroidSafPickedFile,
} from "../utils/androidSaf";

export type { AudioControllerHandle, AudioPlaybackSummary };

export interface AudioViewProps {
  isActiveView?: boolean;
  onPlaybackStateChange?: (summary: AudioPlaybackSummary) => void;
}

const SORT_OPTIONS: Array<{ id: AudioSortField; label: string }> = [
  { id: "custom", label: "Custom Order" },
  { id: "lastPlayedAt", label: "Recently Played" },
  { id: "addedAt", label: "Date Added" },
  { id: "title", label: "Title" },
  { id: "artist", label: "Artist" },
  { id: "duration", label: "Duration" },
  { id: "playCount", label: "Play Count" },
  { id: "fileSize", label: "File Size" },
  { id: "format", label: "Format" },
];

function makeId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function hashPaletteIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 8;
}

export const AudioView = React.forwardRef<AudioControllerHandle, AudioViewProps>(
  ({ isActiveView = true, onPlaybackStateChange }, ref) => {
    const {
      workspace,
      pushToast,
      addAudioTrack,
      updateAudioTrack,
      deleteAudioTracks,
      addAudioFolder,
      updateAudioFolder,
      deleteAudioFolder,
      addAudioPlaylist,
      updateAudioPlaylist,
      deleteAudioPlaylist,
      addTracksToPlaylist,
      removeTrackFromPlaylist,
      reorderPlaylistTracks,
      reorderAudioTracks,
      updateAudioState,
      playAudioTrack,
      addAudioMixSlot,
      updateAudioMixSlot,
      removeAudioMixSlot,
      clearAudioMixSlots,
      reorderAudioMixSlots,
      saveAudioMixPreset,
      loadAudioMixPreset,
      deleteAudioMixPreset,
      recordAudioPlay,
      setAudioEqPreset,
      replaceWorkspace,
    } = useWorkspace();

    const {
      prefs,
      updateUiPrefs,
      updateCardDetails,
      toggleSidebarSection,
    } = useAudioPreferences();

    const tracks = workspace.audioTracks ?? [];
    const folders = workspace.audioFolders ?? [];
    const playlists = workspace.audioPlaylists ?? [];
    const mixPresets = workspace.audioMixPresets ?? [];
    const audioState = workspace.audioState ?? DEFAULT_AUDIO_STATE;

    // Navigation & Filtering State
    const [activeFilter, setActiveFilter] = useState<ActiveAudioFilter>({
      kind: "smart",
      id: "all",
    });
    const [formatFilter, setFormatFilter] = useState<"all" | AudioFormat>("all");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [sidebarCollapsedDesktop, setSidebarCollapsedDesktop] =
      useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    // Selection, Inspector, Popovers, Drawers & Context Menu
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const lastClickedTrackIdRef = useRef<string | null>(null);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [inspectedTrackId, setInspectedTrackId] = useState<string | null>(
      null,
    );
    const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
    const [tracksPendingDelete, setTracksPendingDelete] = useState<
      AudioTrackRecord[]
    >([]);
    const [bulkEditTargets, setBulkEditTargets] = useState<
      AudioTrackRecord[] | null
    >(null);
    const [displayPopoverOpen, setDisplayPopoverOpen] = useState(false);
    const [mobileFilterSheetOpen, setMobileFilterSheetOpen] = useState(false);
    const [mobileActionTrack, setMobileActionTrack] =
      useState<AudioTrackRecord | null>(null);
    const [contextMenu, setContextMenu] =
      useState<AudioContextMenuState | null>(null);

    // Drag & Drop State
    const [isDraggingTracks, setIsDraggingTracks] = useState(false);
    const [isFileDragActive, setIsFileDragActive] = useState(false);

    // Import, Duplicates, Relink, Storage & ZIP Backup
    const [isImporting, setIsImporting] = useState(false);
    const [pendingDuplicates, setPendingDuplicates] = useState<
      PendingAudioDuplicateItem[]
    >([]);
    const [storageManagerOpen, setStorageManagerOpen] = useState(false);
    const [isExportingBackup, setIsExportingBackup] = useState(false);
    const [isParsingBackup, setIsParsingBackup] = useState(false);
    const [isRestoringBackup, setIsRestoringBackup] = useState(false);
    const [pendingBackupArchive, setPendingBackupArchive] =
      useState<ParsedAudioBackupArchive | null>(null);
    const [missingTrackIds, setMissingTrackIds] = useState<Set<string>>(
      () => new Set(),
    );

    // Android Capacitor SAF Storage State
    const isAndroidApp = useMemo(() => isAndroidCapacitor(), []);
    const [androidLinkedFolders, setAndroidLinkedFolders] = useState<
      AndroidLinkedFolder[]
    >(() => getAudioAndroidLinkedFolders());
    const [androidFolderManagerOpen, setAndroidFolderManagerOpen] =
      useState(false);
    const [isScanningAndroidFolders, setIsScanningAndroidFolders] =
      useState(false);
    const [pendingAndroidPick, setPendingAndroidPick] = useState<{
      files: AndroidSafPickedFile[];
      folderId: string | null;
      playlistId: string | null;
      contextLabel?: string;
    } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const singleReplaceInputRef = useRef<HTMLInputElement>(null);
    const replaceTargetIdRef = useRef<string | null>(null);
    const fileDragCounterRef = useRef(0);

    // Clear broken SAF missing track audit periodically or when tracks change
    const runMissingAudit = useCallback(async () => {
      if (!isAndroidCapacitor()) {
        setMissingTrackIds(new Set());
        return;
      }
      const missing = await findMissingAudioIds(tracks);
      setMissingTrackIds(missing);
    }, [tracks]);

    useEffect(() => {
      void runMissingAudit();
    }, [runMissingAudit]);

    // Multi-track Audio Mixer Engine
    const handleEngineMissingFile = useCallback(
      (track: AudioTrackRecord) => {
        setMissingTrackIds((prev) => new Set(prev).add(track.id));
        pushToast(
          track.storageMode === "android-uri"
            ? `Linked audio "${track.title}" could not be read. Tap Relink.`
            : `Audio file "${track.fileName}" is missing from local storage.`,
          "error",
        );
      },
      [pushToast],
    );

    const mixer = useAudioMixerEngine({
      tracks,
      audioState,
      onUpdateTrack: updateAudioTrack,
      onUpdateAudioState: updateAudioState,
      onRecordPlay: recordAudioPlay,
      onMissingTrackFile: handleEngineMissingFile,
      onPlaybackStateChange,
    });

    useImperativeHandle(
      ref,
      () => ({
        togglePauseAll: mixer.togglePlayPauseAll,
        toggleViewMute: mixer.toggleViewMute,
        nextTrack: () => mixer.playNext(true),
        prevTrack: mixer.playPrev,
        stopAll: mixer.stopAll,
      }),
      [mixer],
    );

    // Derived Tags & Counts
    const allTags = useMemo(() => {
      const counts = new Map<string, number>();
      for (const track of tracks) {
        for (const tag of track.tags) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
      return Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }, [tracks]);

    const activeSlotTrackIds = useMemo(
      () => new Set(audioState.activeSlots.map((s) => s.trackId)),
      [audioState.activeSlots],
    );

    const playingTrackIds = useMemo(() => {
      const playing = new Set<string>();
      for (const slot of audioState.activeSlots) {
        const info = mixer.slotRuntime[slot.slotId];
        if (info?.playing) playing.add(slot.trackId);
      }
      return playing;
    }, [audioState.activeSlots, mixer.slotRuntime]);

    const activePlaylist = useMemo(
      () =>
        activeFilter.kind === "playlist"
          ? playlists.find((pl) => pl.id === activeFilter.id) ?? null
          : null,
      [activeFilter, playlists],
    );

    const activeFolder = useMemo(
      () =>
        activeFilter.kind === "folder"
          ? folders.find((f) => f.id === activeFilter.id) ?? null
          : null,
      [activeFilter, folders],
    );

    // Filtered & Sorted Tracks
    const filteredTracks = useMemo(() => {
      let list = [...tracks];

      // 1. Active view filter
      if (activeFilter.kind === "smart") {
        if (activeFilter.id === "mixing") {
          list = list.filter((t) => activeSlotTrackIds.has(t.id));
        } else if (activeFilter.id === "favorites") {
          list = list.filter((t) => Boolean(t.isFavorite));
        } else if (activeFilter.id === "recent") {
          list = list.filter((t) => Boolean(t.lastPlayedAt));
        } else if (activeFilter.id === "unplayed") {
          list = list.filter((t) => (t.playCount ?? 0) === 0);
        }
      } else if (activeFilter.kind === "folder") {
        const descendants = getFolderDescendantIds(folders, activeFilter.id);
        list = list.filter((t) =>
          getAudioFolderIds(t).some((fid) => descendants.has(fid)),
        );
      } else if (activeFilter.kind === "playlist") {
        if (activePlaylist) {
          const orderMap = new Map(
            activePlaylist.trackIds.map((id, idx) => [id, idx]),
          );
          list = list.filter((t) => orderMap.has(t.id));
          if (prefs.sortField === "custom") {
            list.sort(
              (a, b) =>
                (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
            );
          }
        } else {
          list = [];
        }
      }

      // 2. Format chip
      if (formatFilter !== "all") {
        list = list.filter((t) => t.format === formatFilter);
      }

      // 3. Tag chips (AND)
      if (selectedTags.length > 0) {
        list = list.filter((t) =>
          selectedTags.every((tag) => t.tags.includes(tag)),
        );
      }

      // 4. Search query
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        list = list.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.artist.toLowerCase().includes(q) ||
            (t.album || "").toLowerCase().includes(q) ||
            (t.genre || "").toLowerCase().includes(q) ||
            t.tags.some((tag) => tag.toLowerCase().includes(q)),
        );
      }

      // 5. Sort
      const dir = prefs.sortDirection === "asc" ? 1 : -1;
      if (prefs.sortField === "custom") {
        if (activeFilter.kind !== "playlist") {
          list.sort((a, b) => {
            const ao = typeof a.sortOrder === "number" ? a.sortOrder : a.addedAt;
            const bo = typeof b.sortOrder === "number" ? b.sortOrder : b.addedAt;
            return ao - bo;
          });
        } else if (prefs.sortDirection === "desc") {
          list.reverse();
        }
      } else {
        list.sort((a, b) => {
          let cmp = 0;
          switch (prefs.sortField) {
            case "title":
              cmp = a.title.localeCompare(b.title);
              break;
            case "artist":
              cmp = a.artist.localeCompare(b.artist) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0);
              break;
            case "duration":
              cmp = (a.durationSeconds || 0) - (b.durationSeconds || 0);
              break;
            case "playCount":
              cmp = (a.playCount || 0) - (b.playCount || 0);
              break;
            case "fileSize":
              cmp = (a.fileSize || 0) - (b.fileSize || 0);
              break;
            case "format":
              cmp = a.format.localeCompare(b.format);
              break;
            case "lastPlayedAt":
              cmp = (a.lastPlayedAt ?? 0) - (b.lastPlayedAt ?? 0);
              break;
            case "addedAt":
            default:
              cmp = (a.addedAt || 0) - (b.addedAt || 0);
              break;
          }
          return cmp * dir;
        });
      }

      return list;
    }, [
      tracks,
      activeFilter,
      folders,
      activePlaylist,
      activeSlotTrackIds,
      formatFilter,
      selectedTags,
      searchQuery,
      prefs.sortField,
      prefs.sortDirection,
    ]);

    // Grouping
    const groupedTracks = useMemo(() => {
      if (prefs.groupBy === "none") {
        return [{ key: "__all__", label: "", tracks: filteredTracks }];
      }
      const folderNameMap = new Map(folders.map((f) => [f.id, f.name]));
      const buckets = new Map<string, { label: string; tracks: AudioTrackRecord[] }>();

      const pushToBucket = (key: string, label: string, track: AudioTrackRecord) => {
        const existing = buckets.get(key);
        if (existing) existing.tracks.push(track);
        else buckets.set(key, { label, tracks: [track] });
      };

      for (const track of filteredTracks) {
        if (prefs.groupBy === "artist") {
          const label = track.artist.trim() || "Unknown Artist";
          pushToBucket(label.toLowerCase(), label, track);
        } else if (prefs.groupBy === "album") {
          const label = (track.album || "").trim() || "Single / No Album";
          pushToBucket(label.toLowerCase(), label, track);
        } else if (prefs.groupBy === "format") {
          pushToBucket(track.format, AUDIO_FORMAT_LABELS[track.format], track);
        } else if (prefs.groupBy === "folder") {
          const fids = getAudioFolderIds(track);
          if (fids.length === 0) {
            pushToBucket("__unfiled__", "Unfiled", track);
          } else {
            for (const fid of fids) {
              const name = folderNameMap.get(fid) || "Folder";
              pushToBucket(fid, name, track);
            }
          }
        }
      }

      return Array.from(buckets.entries())
        .map(([key, val]) => ({ key, label: val.label, tracks: val.tracks }))
        .sort((a, b) => {
          if (a.key === "__unfiled__") return 1;
          if (b.key === "__unfiled__") return -1;
          return a.label.localeCompare(b.label);
        });
    }, [filteredTracks, prefs.groupBy, folders]);

    // Global drag tracking (for FloatingAudioDropDock)
    useEffect(() => {
      if (!isActiveView) return;
      const handleDragStart = (e: DragEvent) => {
        if (
          e.dataTransfer?.types.includes("application/x-kanso-audio-ids") ||
          e.dataTransfer?.types.includes("application/x-kanso-audio-id")
        ) {
          setIsDraggingTracks(true);
        }
      };
      const handleDragEnd = () => {
        setIsDraggingTracks(false);
      };
      window.addEventListener("dragstart", handleDragStart);
      window.addEventListener("dragend", handleDragEnd);
      window.addEventListener("drop", handleDragEnd);
      return () => {
        window.removeEventListener("dragstart", handleDragStart);
        window.removeEventListener("dragend", handleDragEnd);
        window.removeEventListener("drop", handleDragEnd);
      };
    }, [isActiveView]);

    // Keyboard shortcuts when Audio is active view
    useEffect(() => {
      if (!isActiveView) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        const active = document.activeElement;
        const isTyping =
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          (active instanceof HTMLElement && active.isContentEditable);
        if (e.key === "Escape") {
          if (displayPopoverOpen) {
            setDisplayPopoverOpen(false);
            return;
          }
          if (contextMenu) {
            setContextMenu(null);
            return;
          }
          if (selectedIds.size > 0) {
            setSelectedIds(new Set());
            return;
          }
        }
        if (e.code === "Space" && !isTyping) {
          if (audioState.activeSlots.length > 0) {
            e.preventDefault();
            mixer.togglePlayPauseAll();
          }
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
      isActiveView,
      displayPopoverOpen,
      contextMenu,
      selectedIds.size,
      audioState.activeSlots.length,
      mixer,
    ]);

    // Helper: create track record + save blob (or SAF URI)
    const createTrackFromMetadata = useCallback(
      async (params: {
        trackId?: string;
        meta: AudioImportMetadataResult;
        buffer: ArrayBuffer;
        storageMode: "indexeddb" | "android-uri";
        externalUri?: string;
        folderIds?: string[];
        playlistId?: string | null;
      }): Promise<AudioTrackRecord> => {
        const trackId = params.trackId || makeId("aud");
        if (params.storageMode === "indexeddb") {
          await audioDb.saveAudioFile(
            trackId,
            params.buffer,
            params.meta.mimeType,
            params.meta.fileHash,
          );
        }
        const now = Date.now();
        const maxOrder = tracks.reduce(
          (m, t) => Math.max(m, t.sortOrder ?? t.addedAt ?? 0),
          now,
        );
        const created = addAudioTrack({
          id: trackId,
          format: params.meta.format,
          mimeType: params.meta.mimeType,
          fileName: params.meta.fileName,
          fileSize: params.meta.fileSize,
          fileHash: params.meta.fileHash,
          title: params.meta.title,
          artist: params.meta.artist,
          album: params.meta.album || undefined,
          trackNumber: params.meta.trackNumber,
          year: params.meta.year || undefined,
          genre: params.meta.genre || undefined,
          durationSeconds: params.meta.durationSeconds,
          currentPositionSeconds: 0,
          waveformPeaks: params.meta.waveformPeaks,
          isFavorite: false,
          playCount: 0,
          lastPlayedAt: null,
          addedAt: now,
          folderId: params.folderIds?.[0] ?? null,
          folderIds: params.folderIds ?? [],
          tags: [],
          coverDataUrl: params.meta.coverDataUrl,
          coverPaletteIndex: hashPaletteIndex(
            `${params.meta.title}-${params.meta.artist}-${params.meta.fileName}`,
          ),
          coverStyle: "minimal",
          sortOrder: maxOrder + 1,
          storageMode: params.storageMode,
          externalUri: params.externalUri,
        });

        if (params.playlistId) {
          addTracksToPlaylist(params.playlistId, [created.id]);
        }
        return created;
      },
      [tracks, addAudioTrack, addTracksToPlaylist],
    );

    const findDuplicateTrack = useCallback(
      (
        fileHash: string,
        fileName: string,
        fileSize: number,
      ): {
        existingTrack: AudioTrackRecord;
        reason: "Identical audio file" | "Same file name & size";
      } | null => {
        const byHash = tracks.find(
          (t) => t.fileHash && fileHash && t.fileHash === fileHash,
        );
        if (byHash) {
          return { existingTrack: byHash, reason: "Identical audio file" };
        }
        const normName = fileName.trim().toLowerCase();
        const byNameSize = tracks.find(
          (t) =>
            t.fileName.trim().toLowerCase() === normName &&
            Math.abs((t.fileSize || 0) - fileSize) < 64,
        );
        if (byNameSize) {
          return {
            existingTrack: byNameSize,
            reason: "Same file name & size",
          };
        }
        return null;
      },
      [tracks],
    );

    // Import Web Files (Desktop Picker / Drag-and-Drop)
    const handleImportFiles = useCallback(
      async (fileList: FileList | File[]) => {
        const files = Array.from(fileList);
        if (files.length === 0) return;

        setIsImporting(true);
        const duplicates: PendingAudioDuplicateItem[] = [];
        let importedCount = 0;
        let unsupportedCount = 0;

        const targetFolderIds =
          activeFilter.kind === "folder" ? [activeFilter.id] : [];
        const targetPlaylistId =
          activeFilter.kind === "playlist" ? activeFilter.id : null;

        try {
          for (const file of files) {
            const fmt = detectAudioFormat(file.name, file.type);
            if (!fmt) {
              unsupportedCount++;
              continue;
            }
            const buffer = await file.arrayBuffer();
            const meta = await extractAudioMetadataFromBuffer(
              buffer,
              file.name,
              file.type,
              file.size,
            );
            const dup = findDuplicateTrack(
              meta.fileHash,
              meta.fileName,
              meta.fileSize,
            );
            if (dup) {
              duplicates.push({
                id: makeId("dup"),
                fileName: file.name,
                fileSize: file.size,
                arrayBuffer: buffer,
                metadata: meta,
                existingTrack: dup.existingTrack,
                matchReason: dup.reason,
              });
              continue;
            }
            await createTrackFromMetadata({
              meta,
              buffer,
              storageMode: "indexeddb",
              folderIds: targetFolderIds,
              playlistId: targetPlaylistId,
            });
            importedCount++;
          }

          if (duplicates.length > 0) {
            setPendingDuplicates(duplicates);
          }
          if (importedCount > 0) {
            pushToast(
              importedCount === 1
                ? "Added 1 audio track"
                : `Added ${importedCount} audio tracks`,
              "success",
            );
          }
          if (unsupportedCount > 0) {
            pushToast(
              `Skipped ${unsupportedCount} unsupported file(s)`,
              "neutral",
            );
          }
        } catch (err) {
          pushToast(
            err instanceof Error ? err.message : "Failed to import audio file",
            "error",
          );
        } finally {
          setIsImporting(false);
        }
      },
      [
        activeFilter,
        findDuplicateTrack,
        createTrackFromMetadata,
        pushToast,
      ],
    );

    // Import Android SAF Picked Files with chosen Link vs Copy mode
    const processAndroidPickedFiles = useCallback(
      async (
        pickedFiles: AndroidSafPickedFile[],
        choice: "link" | "copy",
        folderId: string | null,
        playlistId: string | null,
      ) => {
        if (pickedFiles.length === 0) return;
        setIsImporting(true);
        const duplicates: PendingAudioDuplicateItem[] = [];
        let importedCount = 0;

        try {
          for (const pf of pickedFiles) {
            const fmt = detectAudioFormat(pf.name, pf.mimeType);
            if (!fmt) continue;

            // If URI already linked to a track, skip cleanly
            if (
              choice === "link" &&
              tracks.some((t) => t.externalUri === pf.uri)
            ) {
              continue;
            }

            const { metadata: meta, cachedSrc } =
              await extractAudioMetadataFromAndroidUri(
                pf.uri,
                pf.name,
                pf.mimeType,
                pf.size,
              );
            let buffer = new ArrayBuffer(0);
            if (choice === "copy") {
              if (cachedSrc) {
                const res = await fetch(cachedSrc).catch(() => null);
                buffer =
                  res && res.ok
                    ? await res.arrayBuffer()
                    : await readAndroidUriAsArrayBuffer(pf.uri, pf.size);
              } else {
                buffer = await readAndroidUriAsArrayBuffer(pf.uri, pf.size);
              }
            }
            const dup = findDuplicateTrack(
              meta.fileHash,
              meta.fileName,
              meta.fileSize,
            );
            if (dup) {
              duplicates.push({
                id: makeId("dup"),
                fileName: pf.name,
                fileSize: pf.size || meta.fileSize || buffer.byteLength,
                arrayBuffer: buffer,
                metadata: meta,
                existingTrack: dup.existingTrack,
                matchReason: dup.reason,
                androidUri: pf.uri,
                androidChoice: choice,
              });
              continue;
            }

            await createTrackFromMetadata({
              meta,
              buffer,
              storageMode: choice === "link" ? "android-uri" : "indexeddb",
              externalUri: choice === "link" ? pf.uri : undefined,
              folderIds: folderId ? [folderId] : [],
              playlistId,
            });
            if (choice === "copy") {
              void releaseAndroidUri(pf.uri);
            }
            importedCount++;
          }

          if (duplicates.length > 0) {
            setPendingDuplicates(duplicates);
          }
          if (importedCount > 0) {
            pushToast(
              choice === "link"
                ? `Linked ${importedCount} ${importedCount === 1 ? "track" : "tracks"} from device`
                : `Copied ${importedCount} ${importedCount === 1 ? "track" : "tracks"} into app storage`,
              "success",
            );
          }
        } catch (err) {
          pushToast(
            err instanceof Error
              ? err.message
              : "Failed to import Android audio files",
            "error",
          );
        } finally {
          setIsImporting(false);
        }
      },
      [tracks, findDuplicateTrack, createTrackFromMetadata, pushToast],
    );

    const handleTriggerImport = useCallback(async () => {
      if (isAndroidApp) {
        try {
          const picked = await pickAndroidAudioDocuments(true);
          if (picked.cancelled || picked.files.length === 0) return;

          const folderId =
            activeFilter.kind === "folder" ? activeFilter.id : null;
          const playlistId =
            activeFilter.kind === "playlist" ? activeFilter.id : null;
          const mode = getAudioAndroidImportMode();

          if (mode === "always-link") {
            await processAndroidPickedFiles(
              picked.files,
              "link",
              folderId,
              playlistId,
            );
          } else if (mode === "always-copy") {
            await processAndroidPickedFiles(
              picked.files,
              "copy",
              folderId,
              playlistId,
            );
          } else {
            setPendingAndroidPick({
              files: picked.files,
              folderId,
              playlistId,
            });
          }
        } catch (err) {
          pushToast(
            err instanceof Error
              ? err.message
              : "Could not open Android file picker",
            "error",
          );
        }
        return;
      }

      fileInputRef.current?.click();
    }, [isAndroidApp, activeFilter, processAndroidPickedFiles, pushToast]);

    const handleResolveAndroidImportChoice = useCallback(
      async (
        choice: "link" | "copy",
        rememberPreference?: AndroidImportStorageMode,
      ) => {
        if (!pendingAndroidPick) return;
        const payload = pendingAndroidPick;
        setPendingAndroidPick(null);
        if (rememberPreference) {
          setAudioAndroidImportMode(rememberPreference);
        }
        await processAndroidPickedFiles(
          payload.files,
          choice,
          payload.folderId,
          payload.playlistId,
        );
      },
      [pendingAndroidPick, processAndroidPickedFiles],
    );

    // Android Linked Folders Management
    const scanSingleAndroidFolder = useCallback(
      async (folderUri: string, folderName?: string) => {
        setIsScanningAndroidFolders(true);
        try {
          const found = await scanAndroidAudioFolder(folderUri);
          const existingUris = new Set(
            tracks.map((t) => t.externalUri).filter(Boolean),
          );
          const fresh = found.filter(
            (f) =>
              detectAudioFormat(f.name, f.mimeType) !== null &&
              !existingUris.has(f.uri),
          );

          if (fresh.length > 0) {
            await processAndroidPickedFiles(
              fresh,
              "link",
              activeFilter.kind === "folder" ? activeFilter.id : null,
              activeFilter.kind === "playlist" ? activeFilter.id : null,
            );
          }

          const prevFolder = androidLinkedFolders.find(
            (f) => f.uri === folderUri,
          );
          const updatedList = addOrUpdateAudioAndroidLinkedFolder({
            uri: folderUri,
            name: prevFolder?.name || folderName || "Audio Folder",
            addedAt: prevFolder?.addedAt ?? Date.now(),
            lastScannedAt: Date.now(),
            lastFoundCount: found.length,
          });
          setAndroidLinkedFolders(updatedList);
          pushToast(
            fresh.length > 0
              ? `Added ${fresh.length} new audio tracks from folder`
              : `Scanned folder (${found.length} audio files indexed)`,
            "success",
          );
        } catch (err) {
          pushToast(
            err instanceof Error ? err.message : "Failed to scan Android folder",
            "error",
          );
        } finally {
          setIsScanningAndroidFolders(false);
        }
      },
      [
        tracks,
        activeFilter,
        androidLinkedFolders,
        processAndroidPickedFiles,
        pushToast,
      ],
    );

    const handleAddAndroidFolder = useCallback(async () => {
      try {
        const picked = await pickAndroidAudioFolder();
        if (picked.cancelled || !picked.uri) return;
        const folderName = picked.name || "Linked Folder";
        const updated = addOrUpdateAudioAndroidLinkedFolder({
          uri: picked.uri,
          name: folderName,
          addedAt: Date.now(),
          lastScannedAt: null,
        });
        setAndroidLinkedFolders(updated);
        await scanSingleAndroidFolder(picked.uri, folderName);
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : "Could not link folder",
          "error",
        );
      }
    }, [scanSingleAndroidFolder, pushToast]);

    const handleScanAllAndroidFolders = useCallback(async () => {
      for (const folder of androidLinkedFolders) {
        await scanSingleAndroidFolder(folder.uri, folder.name);
      }
    }, [androidLinkedFolders, scanSingleAndroidFolder]);

    const handleRemoveAndroidFolder = useCallback((uri: string) => {
      const next = removeAudioAndroidLinkedFolder(uri);
      setAndroidLinkedFolders(next);
      pushToast("Unlinked device audio folder");
    }, [pushToast]);

    // Duplicate Resolution
    const handleResolveDuplicates = useCallback(
      async (decisions: Record<string, AudioDuplicateAction>) => {
        const items = pendingDuplicates;
        setPendingDuplicates([]);
        for (const item of items) {
          const action = decisions[item.id] ?? "skip";
          if (action === "skip") {
            if (item.androidUri && item.androidChoice === "copy") {
              void releaseAndroidUri(item.androidUri);
            }
            continue;
          }
          if (action === "replace") {
            const useLink = item.androidChoice === "link" && item.androidUri;
            if (useLink) {
              await audioDb
                .deleteAudioFile(item.existingTrack.id)
                .catch(() => undefined);
            } else {
              await audioDb.saveAudioFile(
                item.existingTrack.id,
                item.arrayBuffer,
                item.metadata.mimeType,
                item.metadata.fileHash,
              );
            }
            updateAudioTrack(item.existingTrack.id, {
              fileName: item.metadata.fileName,
              fileSize: item.metadata.fileSize,
              fileHash: item.metadata.fileHash,
              format: item.metadata.format,
              mimeType: item.metadata.mimeType,
              durationSeconds:
                item.metadata.durationSeconds ||
                item.existingTrack.durationSeconds,
              waveformPeaks: item.metadata.waveformPeaks,
              storageMode: useLink ? "android-uri" : "indexeddb",
              externalUri: useLink ? item.androidUri : undefined,
            });
            setMissingTrackIds((prev) => {
              const next = new Set(prev);
              next.delete(item.existingTrack.id);
              return next;
            });
          } else if (action === "keep-both") {
            const useLink = item.androidChoice === "link" && item.androidUri;
            await createTrackFromMetadata({
              meta: item.metadata,
              buffer: item.arrayBuffer,
              storageMode: useLink ? "android-uri" : "indexeddb",
              externalUri: useLink ? item.androidUri : undefined,
              folderIds: getAudioFolderIds(item.existingTrack),
            });
          }
        }
        pushToast("Applied import duplicate choices", "success");
      },
      [pendingDuplicates, updateAudioTrack, createTrackFromMetadata, pushToast],
    );

    // Replace Audio File (for IndexedDB tracks or Desktop)
    const handleReplaceAudioFile = useCallback(
      async (trackId: string, file: File) => {
        const fmt = detectAudioFormat(file.name, file.type);
        if (!fmt) {
          pushToast("Unsupported audio file format", "error");
          return;
        }
        const buffer = await file.arrayBuffer();
        const meta = await extractAudioMetadataFromBuffer(
          buffer,
          file.name,
          file.type,
          file.size,
        );
        await audioDb.saveAudioFile(
          trackId,
          buffer,
          meta.mimeType,
          meta.fileHash,
        );
        updateAudioTrack(trackId, {
          format: meta.format,
          mimeType: meta.mimeType,
          fileName: meta.fileName,
          fileSize: meta.fileSize,
          fileHash: meta.fileHash,
          durationSeconds: meta.durationSeconds || undefined,
          waveformPeaks: meta.waveformPeaks,
          storageMode: "indexeddb",
          externalUri: undefined,
        });
        setMissingTrackIds((prev) => {
          const next = new Set(prev);
          next.delete(trackId);
          return next;
        });
        pushToast("Replaced local audio file", "success");
      },
      [updateAudioTrack, pushToast],
    );

    // Relink broken Android SAF audio link
    const handleRelinkTrack = useCallback(
      async (track: AudioTrackRecord) => {
        if (!isAndroidApp) {
          replaceTargetIdRef.current = track.id;
          singleReplaceInputRef.current?.click();
          return;
        }
        try {
          const picked = await pickAndroidAudioDocuments(false);
          if (picked.cancelled || picked.files.length === 0) return;
          const file = picked.files[0];
          const { metadata: meta } = await extractAudioMetadataFromAndroidUri(
            file.uri,
            file.name,
            file.mimeType,
            file.size,
          );
          await audioDb.deleteAudioFile(track.id).catch(() => undefined);
          updateAudioTrack(track.id, {
            format: meta.format,
            mimeType: meta.mimeType,
            fileName: meta.fileName,
            fileSize: meta.fileSize,
            fileHash: meta.fileHash,
            durationSeconds: meta.durationSeconds || track.durationSeconds,
            waveformPeaks: meta.waveformPeaks,
            storageMode: "android-uri",
            externalUri: file.uri,
          });
          setMissingTrackIds((prev) => {
            const next = new Set(prev);
            next.delete(track.id);
            return next;
          });
          pushToast(`Relinked "${track.title}"`, "success");
        } catch (err) {
          pushToast(
            err instanceof Error ? err.message : "Failed to relink audio file",
            "error",
          );
        }
      },
      [isAndroidApp, updateAudioTrack, pushToast],
    );

    // Play / Layer Mix / Queue Handlers (coexists cleanly with Streamer & Library TTS)
    const handlePlayTrack = useCallback(
      (track: AudioTrackRecord) => {
        if (missingTrackIds.has(track.id)) {
          void handleRelinkTrack(track);
          return;
        }
        playAudioTrack(track.id, { replaceMix: true });
        mixer.ensurePlaying({ rewindIfEndedTrackId: track.id });
      },
      [missingTrackIds, handleRelinkTrack, playAudioTrack, mixer],
    );

    const handleLayerInMix = useCallback(
      (trackIds: string[]) => {
        let added = 0;
        for (const id of trackIds) {
          if (missingTrackIds.has(id)) continue;
          const already = audioState.activeSlots.some((s) => s.trackId === id);
          if (!already) {
            addAudioMixSlot(id, { loop: true, volume: 75 });
            added++;
          }
        }
        if (added > 0) {
          updateAudioState({ mixerExpanded: true });
          mixer.ensurePlaying();
          pushToast(
            added === 1
              ? "Layered track into active mix"
              : `Layered ${added} tracks into mix`,
            "success",
          );
        }
      },
      [
        missingTrackIds,
        audioState.activeSlots,
        addAudioMixSlot,
        updateAudioState,
        mixer,
        pushToast,
      ],
    );

    const handleAddToQueue = useCallback(
      (trackIds: string[]) => {
        const valid = trackIds.filter((id) => !missingTrackIds.has(id));
        if (valid.length === 0) return;
        updateAudioState((prev) => ({
          ...prev,
          queueTrackIds: [...prev.queueTrackIds, ...valid],
        }));
        pushToast(
          valid.length === 1
            ? "Added track to Play Queue"
            : `Added ${valid.length} tracks to Play Queue`,
          "success",
        );
      },
      [missingTrackIds, updateAudioState, pushToast],
    );

    // Selection
    const handleToggleSelect = useCallback(
      (trackId: string, shiftKey: boolean) => {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (shiftKey && lastClickedTrackIdRef.current) {
            const aIdx = filteredTracks.findIndex(
              (t) => t.id === lastClickedTrackIdRef.current,
            );
            const bIdx = filteredTracks.findIndex((t) => t.id === trackId);
            if (aIdx >= 0 && bIdx >= 0) {
              const start = Math.min(aIdx, bIdx);
              const end = Math.max(aIdx, bIdx);
              for (let i = start; i <= end; i++) {
                next.add(filteredTracks[i].id);
              }
              lastClickedTrackIdRef.current = trackId;
              return next;
            }
          }
          if (next.has(trackId)) next.delete(trackId);
          else next.add(trackId);
          lastClickedTrackIdRef.current = trackId;
          return next;
        });
      },
      [filteredTracks],
    );

    const handleToggleSelectAll = useCallback(() => {
      const visibleIds = filteredTracks.map((t) => t.id);
      const allSelected =
        visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
      if (allSelected) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(visibleIds));
      }
    }, [filteredTracks, selectedIds]);

    // Custom Order Drag & Drop Reordering
    const handleReorderTracks = useCallback(
      (
        draggedIds: string[],
        targetTrackId: string,
        position: "before" | "after",
      ) => {
        if (draggedIds.length === 0) return;

        // If inside a playlist in custom sort, reorder playlist.trackIds directly
        if (activeFilter.kind === "playlist" && activePlaylist) {
          const fromId = draggedIds[0];
          const list = activePlaylist.trackIds;
          const fromIdx = list.indexOf(fromId);
          let toIdx = list.indexOf(targetTrackId);
          if (fromIdx < 0 || toIdx < 0 || fromId === targetTrackId) return;
          if (position === "after" && fromIdx > toIdx) toIdx += 1;
          if (position === "before" && fromIdx < toIdx) toIdx -= 1;
          if (fromIdx !== toIdx) {
            reorderPlaylistTracks(activePlaylist.id, fromIdx, toIdx);
          }
          return;
        }

        const dragSet = new Set(draggedIds);
        const sortedAll = [...tracks].sort((a, b) => {
          const ao = typeof a.sortOrder === "number" ? a.sortOrder : a.addedAt;
          const bo = typeof b.sortOrder === "number" ? b.sortOrder : b.addedAt;
          return ao - bo;
        });

        const moving = sortedAll.filter((t) => dragSet.has(t.id));
        const remaining = sortedAll.filter((t) => !dragSet.has(t.id));
        const targetIdx = remaining.findIndex((t) => t.id === targetTrackId);
        if (targetIdx < 0) return;
        const insertIdx = position === "after" ? targetIdx + 1 : targetIdx;
        remaining.splice(insertIdx, 0, ...moving);

        const sortOrderById: Record<string, number> = {};
        remaining.forEach((t, idx) => {
          sortOrderById[t.id] = idx + 1;
        });
        reorderAudioTracks(sortOrderById);
      },
      [
        activeFilter.kind,
        activePlaylist,
        tracks,
        reorderPlaylistTracks,
        reorderAudioTracks,
      ],
    );

    // Organization & Drop Actions
    const handleDropTracksToFolder = useCallback(
      (trackIds: string[], folderId: string) => {
        const folder = folders.find((f) => f.id === folderId);
        for (const id of trackIds) {
          const tr = tracks.find((t) => t.id === id);
          if (!tr) continue;
          const updated = withAudioFolderIds(tr, [
            ...getAudioFolderIds(tr),
            folderId,
          ]);
          updateAudioTrack(id, {
            folderIds: updated.folderIds,
            folderId: updated.folderId,
          });
        }
        pushToast(
          `Added ${trackIds.length} ${trackIds.length === 1 ? "track" : "tracks"} to "${folder?.name || "Folder"}"`,
          "success",
        );
      },
      [folders, tracks, updateAudioTrack, pushToast],
    );

    const handleDropTracksToPlaylist = useCallback(
      (trackIds: string[], playlistId: string) => {
        const pl = playlists.find((p) => p.id === playlistId);
        addTracksToPlaylist(playlistId, trackIds);
        pushToast(
          `Added ${trackIds.length} ${trackIds.length === 1 ? "track" : "tracks"} to "${pl?.name || "Playlist"}"`,
          "success",
        );
      },
      [playlists, addTracksToPlaylist, pushToast],
    );

    const handleDropTracksToTag = useCallback(
      (trackIds: string[], tagName: string) => {
        for (const id of trackIds) {
          const tr = tracks.find((t) => t.id === id);
          if (!tr) continue;
          if (!tr.tags.includes(tagName)) {
            updateAudioTrack(id, { tags: [...tr.tags, tagName] });
          }
        }
        pushToast(
          `Tagged ${trackIds.length} ${trackIds.length === 1 ? "track" : "tracks"} with #${tagName}`,
          "success",
        );
      },
      [tracks, updateAudioTrack, pushToast],
    );

    const handleDropTracksToFavorites = useCallback(
      (trackIds: string[]) => {
        for (const id of trackIds) {
          updateAudioTrack(id, { isFavorite: true });
        }
        pushToast(
          `Starred ${trackIds.length} ${trackIds.length === 1 ? "track" : "tracks"}`,
          "success",
        );
      },
      [updateAudioTrack, pushToast],
    );

    const handleRemoveTracksFromCurrent = useCallback(
      (trackIds: string[]) => {
        if (activeFilter.kind === "folder") {
          for (const id of trackIds) {
            const tr = tracks.find((t) => t.id === id);
            if (!tr) continue;
            const nextIds = getAudioFolderIds(tr).filter(
              (fid) => fid !== activeFilter.id,
            );
            const updated = withAudioFolderIds(tr, nextIds);
            updateAudioTrack(id, {
              folderIds: updated.folderIds,
              folderId: updated.folderId,
            });
          }
          pushToast("Removed from folder");
        } else if (activeFilter.kind === "playlist") {
          for (const id of trackIds) {
            removeTrackFromPlaylist(activeFilter.id, id);
          }
          pushToast("Removed from playlist");
        }
      },
      [
        activeFilter,
        tracks,
        updateAudioTrack,
        removeTrackFromPlaylist,
        pushToast,
      ],
    );

    const handleApplyBulkEdit = useCallback(
      (patch: AudioBulkEditPatch) => {
        if (!bulkEditTargets) return;
        const targetIds = bulkEditTargets.map((t) => t.id);

        for (const track of bulkEditTargets) {
          const currentFolders = getAudioFolderIds(track);
          const nextFolders = [
            ...currentFolders.filter((f) => !patch.removeFolderIds.includes(f)),
            ...patch.addFolderIds,
          ];
          const withFld = withAudioFolderIds(track, nextFolders);

          const nextTags = Array.from(
            new Set([
              ...track.tags.filter((tg) => !patch.removeTags.includes(tg)),
              ...patch.addTags,
            ]),
          );

          const nextPatch: Partial<AudioTrackRecord> = {
            folderIds: withFld.folderIds,
            folderId: withFld.folderId,
            tags: nextTags,
          };

          if (patch.artist !== undefined) nextPatch.artist = patch.artist;
          if (patch.album !== undefined) nextPatch.album = patch.album;
          if (patch.genre !== undefined) nextPatch.genre = patch.genre;
          if (patch.year !== undefined) nextPatch.year = patch.year;
          if (patch.favoriteAction === "favorite") nextPatch.isFavorite = true;
          else if (patch.favoriteAction === "unfavorite")
            nextPatch.isFavorite = false;
          if (patch.resetPosition) nextPatch.currentPositionSeconds = 0;

          updateAudioTrack(track.id, nextPatch);
        }

        for (const plId of patch.addPlaylistIds) {
          addTracksToPlaylist(plId, targetIds);
        }
        for (const plId of patch.removePlaylistIds) {
          for (const tid of targetIds) {
            removeTrackFromPlaylist(plId, tid);
          }
        }

        setBulkEditTargets(null);
        setSelectedIds(new Set());
        pushToast(
          `Updated ${targetIds.length} ${targetIds.length === 1 ? "track" : "tracks"}`,
          "success",
        );
      },
      [
        bulkEditTargets,
        updateAudioTrack,
        addTracksToPlaylist,
        removeTrackFromPlaylist,
        pushToast,
      ],
    );

    // ZIP Backup Export & Import
    const handleExportBackup = useCallback(async () => {
      if (isExportingBackup) return;
      setIsExportingBackup(true);
      try {
        const blob = await exportAudioBackupZip({
          tracks,
          folders,
          playlists,
          presets: mixPresets,
        });
        const dateStr = new Date().toISOString().slice(0, 10);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `kanso-audio-backup-${dateStr}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        pushToast("Exported Audio ZIP backup", "success");
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : "Failed to export Audio backup",
          "error",
        );
      } finally {
        setIsExportingBackup(false);
      }
    }, [isExportingBackup, tracks, folders, playlists, mixPresets, pushToast]);

    const handleSelectImportBackupFile = useCallback(
      async (file: File) => {
        setIsParsingBackup(true);
        try {
          const parsed = await parseAudioBackupZip(file);
          setPendingBackupArchive(parsed);
        } catch (err) {
          pushToast(
            err instanceof Error
              ? err.message
              : "Could not read Audio ZIP backup",
            "error",
          );
        } finally {
          setIsParsingBackup(false);
        }
      },
      [pushToast],
    );

    const handleConfirmRestoreBackup = useCallback(
      async (mode: "merge" | "replace") => {
        if (!pendingBackupArchive) return;
        setIsRestoringBackup(true);
        const { snapshot } = pendingBackupArchive;
        try {
          const fileMap = new Map(snapshot.files.map((f) => [f.trackId, f]));

          if (mode === "replace") {
            await audioDb.clearAllAudioFiles();
            for (const f of snapshot.files) {
              await audioDb.saveAudioFile(f.trackId, f.data, f.mimeType);
            }
            const nextTracks = snapshot.tracks.map((t) => ({
              ...t,
              storageMode: fileMap.has(t.id)
                ? ("indexeddb" as const)
                : t.storageMode,
              externalUri: fileMap.has(t.id) ? undefined : t.externalUri,
            }));
            replaceWorkspace(
              {
                ...workspace,
                audioTracks: nextTracks,
                audioFolders: snapshot.folders,
                audioPlaylists: snapshot.playlists,
                audioMixPresets: snapshot.presets,
              },
              `Restored ${nextTracks.length} audio tracks from ZIP backup`,
              { preserveLocalLibrary: false },
            );
          } else {
            // Merge: save binary files and append missing tracks/folders/playlists/presets
            const existingIds = new Set(tracks.map((t) => t.id));
            const existingHashes = new Set(
              tracks.map((t) => t.fileHash).filter(Boolean),
            );
            const nextTracks = [...tracks];
            let addedTracks = 0;

            for (const tr of snapshot.tracks) {
              if (
                existingIds.has(tr.id) ||
                (tr.fileHash && existingHashes.has(tr.fileHash))
              ) {
                continue;
              }
              const f = fileMap.get(tr.id);
              if (f) {
                await audioDb.saveAudioFile(tr.id, f.data, f.mimeType);
              }
              nextTracks.push({
                ...tr,
                storageMode: f ? "indexeddb" : tr.storageMode,
                externalUri: f ? undefined : tr.externalUri,
              });
              addedTracks++;
            }

            const existingFolderIds = new Set(folders.map((f) => f.id));
            const nextFolders = [
              ...folders,
              ...snapshot.folders.filter((f) => !existingFolderIds.has(f.id)),
            ];
            const existingPlIds = new Set(playlists.map((p) => p.id));
            const nextPlaylists = [
              ...playlists,
              ...snapshot.playlists.filter((p) => !existingPlIds.has(p.id)),
            ];
            const existingPresetIds = new Set(mixPresets.map((p) => p.id));
            const nextPresets = [
              ...mixPresets,
              ...snapshot.presets.filter((p) => !existingPresetIds.has(p.id)),
            ];

            replaceWorkspace(
              {
                ...workspace,
                audioTracks: nextTracks,
                audioFolders: nextFolders,
                audioPlaylists: nextPlaylists,
                audioMixPresets: nextPresets,
              },
              `Merged ${addedTracks} audio tracks from ZIP backup`,
              { preserveLocalLibrary: false },
            );
          }

          setPendingBackupArchive(null);
        } catch (err) {
          pushToast(
            err instanceof Error
              ? err.message
              : "Failed to restore Audio backup",
            "error",
          );
        } finally {
          setIsRestoringBackup(false);
        }
      },
      [
        pendingBackupArchive,
        workspace,
        tracks,
        folders,
        playlists,
        mixPresets,
        replaceWorkspace,
        pushToast,
      ],
    );

    const inspectedTrack = useMemo(
      () =>
        inspectedTrackId
          ? tracks.find((t) => t.id === inspectedTrackId) ?? null
          : null,
      [inspectedTrackId, tracks],
    );

    const editingTrack = useMemo(
      () =>
        editingTrackId
          ? tracks.find((t) => t.id === editingTrackId) ?? null
          : null,
      [editingTrackId, tracks],
    );

    const viewHeading = useMemo(() => {
      if (activeFilter.kind === "folder") return activeFolder?.name || "Folder";
      if (activeFilter.kind === "playlist")
        return activePlaylist?.name || "Playlist";
      switch (activeFilter.id) {
        case "mixing":
          return "Now Mixing";
        case "favorites":
          return "Favorites";
        case "recent":
          return "Recently Played";
        case "unplayed":
          return "Unplayed";
        default:
          return "Audio Studio";
      }
    }, [activeFilter, activeFolder, activePlaylist]);

    const activeRemovalTarget = useMemo(() => {
      if (activeFilter.kind === "folder" && activeFolder) {
        return {
          kind: "folder" as const,
          id: activeFolder.id,
          name: activeFolder.name,
        };
      }
      if (activeFilter.kind === "playlist" && activePlaylist) {
        return {
          kind: "playlist" as const,
          id: activePlaylist.id,
          name: activePlaylist.name,
        };
      }
      return null;
    }, [activeFilter, activeFolder, activePlaylist]);

    const hasActiveFilters =
      formatFilter !== "all" ||
      selectedTags.length > 0 ||
      searchQuery.trim().length > 0 ||
      prefs.groupBy !== "none";

    const isCustomSortActive =
      prefs.sortField === "custom" && prefs.groupBy === "none";

    const totalBytes = useMemo(
      () => tracks.reduce((sum, t) => sum + (t.fileSize || 0), 0),
      [tracks],
    );

    return (
      <div
        className="relative flex flex-col lg:flex-row h-full min-h-0 lg:h-dvh w-full overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)]"
        onDragEnter={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            fileDragCounterRef.current += 1;
            setIsFileDragActive(true);
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
          }
        }}
        onDragLeave={() => {
          if (fileDragCounterRef.current > 0) {
            fileDragCounterRef.current -= 1;
            if (fileDragCounterRef.current === 0) setIsFileDragActive(false);
          }
        }}
        onDrop={(e) => {
          fileDragCounterRef.current = 0;
          setIsFileDragActive(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            e.preventDefault();
            void handleImportFiles(e.dataTransfer.files);
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={AUDIO_ACCEPT_STRING}
          onChange={(e) => {
            if (e.target.files) void handleImportFiles(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
        />

        <input
          ref={singleReplaceInputRef}
          type="file"
          accept={AUDIO_ACCEPT_STRING}
          onChange={(e) => {
            const file = e.target.files?.[0];
            const id = replaceTargetIdRef.current;
            replaceTargetIdRef.current = null;
            if (file && id) void handleReplaceAudioFile(id, file);
            e.target.value = "";
          }}
          className="hidden"
        />

        {/* File Drop Overlay */}
        {isFileDragActive && (
          <div className="fixed inset-0 z-50 bg-[var(--bg-canvas)]/88 backdrop-blur-xs flex items-center justify-center p-6 pointer-events-none">
            <div className="max-w-md w-full rounded-xl border-2 border-dashed border-[var(--accent)] bg-[var(--bg-elevated)] p-8 text-center space-y-2 shadow-2xl">
              <Headphones className="w-8 h-8 text-[var(--accent)] mx-auto" />
              <div className="font-display text-lg font-semibold">
                Drop Audio Tracks to Import
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                MP3, M4A, WAV, FLAC, OGG, OPUS &amp; AAC stored offline on this
                device.
              </p>
            </div>
          </div>
        )}

        {/* Left Audio Sidebar */}
        <AudioSidebar
          tracks={tracks}
          folders={folders}
          playlists={playlists}
          mixPresets={mixPresets}
          activeSlotTrackIds={activeSlotTrackIds}
          activePresetId={audioState.activePresetId}
          allTags={allTags}
          activeFilter={activeFilter}
          selectedTags={selectedTags}
          collapsedSections={prefs.collapsedSections}
          sidebarWidth={prefs.sidebarWidth}
          isExportingBackup={isExportingBackup}
          isParsingBackup={isParsingBackup}
          onSidebarWidthChange={(w) => updateUiPrefs({ sidebarWidth: w })}
          onToggleSection={toggleSidebarSection}
          onSelectFilter={(f) => {
            setActiveFilter(f);
            setSelectedIds(new Set());
          }}
          onToggleTag={(tag) =>
            setSelectedTags((prev) =>
              prev.includes(tag)
                ? prev.filter((t) => t !== tag)
                : [...prev, tag],
            )
          }
          onClearTags={() => setSelectedTags([])}
          onCreateFolder={(name, parentId, color) => {
            addAudioFolder(name, parentId ?? null, color ?? "slate");
          }}
          onUpdateFolder={(id, patch) => updateAudioFolder(id, patch)}
          onDeleteFolder={(id) => {
            deleteAudioFolder(id);
            if (activeFilter.kind === "folder" && activeFilter.id === id) {
              setActiveFilter({ kind: "smart", id: "all" });
            }
          }}
          onCreatePlaylist={(name) => {
            addAudioPlaylist(name);
          }}
          onUpdatePlaylist={(id, patch) => updateAudioPlaylist(id, patch)}
          onDeletePlaylist={(id) => {
            deleteAudioPlaylist(id);
            if (activeFilter.kind === "playlist" && activeFilter.id === id) {
              setActiveFilter({ kind: "smart", id: "all" });
            }
          }}
          onLoadMixPreset={(presetId) => {
            loadAudioMixPreset(presetId);
            mixer.ensurePlaying();
          }}
          onDeleteMixPreset={deleteAudioMixPreset}
          onDropTracksToFolder={handleDropTracksToFolder}
          onDropTracksToPlaylist={handleDropTracksToPlaylist}
          onDropTracksToTag={handleDropTracksToTag}
          onDropTracksToFavorites={handleDropTracksToFavorites}
          onExportBackup={() => void handleExportBackup()}
          onSelectImportBackupFile={(file) =>
            void handleSelectImportBackupFile(file)
          }
          onOpenStorageManager={() => setStorageManagerOpen(true)}
          isCollapsedDesktop={sidebarCollapsedDesktop}
          onCollapseDesktop={() => setSidebarCollapsedDesktop(true)}
          isOpenMobile={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        {/* Center Main Column + Bottom Player Deck */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* Top Shelf Header */}
          <header className="relative z-20 shrink-0 px-4 sm:px-5 lg:px-8 pt-3.5 pb-3 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-2.5">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(true)}
                  aria-label="Open audio sidebar"
                  className="lg:hidden h-9 w-9 inline-flex items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] cursor-pointer shrink-0"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>

                {sidebarCollapsedDesktop && (
                  <button
                    type="button"
                    onClick={() => setSidebarCollapsedDesktop(false)}
                    title="Show audio sidebar"
                    aria-label="Show audio sidebar"
                    className="hidden lg:inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                )}

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight truncate">
                      {viewHeading}
                    </h1>
                    <span className="font-mono tabular-nums text-xs text-[var(--text-muted)] shrink-0">
                      {filteredTracks.length}
                      {filteredTracks.length !== tracks.length
                        ? ` / ${tracks.length}`
                        : ""}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isAndroidApp && (
                  <button
                    type="button"
                    onClick={() => setAndroidFolderManagerOpen(true)}
                    className="h-9 px-2.5 sm:px-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span className="hidden sm:inline">Device Folders</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => void handleTriggerImport()}
                  className="h-9 px-3 sm:px-3.5 rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-medium hover:opacity-95 disabled:opacity-55 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isImporting ? "Importing…" : "Import Audio"}</span>
                </button>
              </div>
            </div>

            {/* Search, Sort, View Mode & Options Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search title, artist, album, tag..."
                  className="w-full h-9 pl-8 pr-7 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Mobile Filter/Sort Button */}
              <button
                type="button"
                onClick={() => setMobileFilterSheetOpen(true)}
                className={`lg:hidden h-9 px-3 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  hasActiveFilters
                    ? "border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filter &amp; Sort</span>
              </button>

              {/* Desktop Sort Controls */}
              <div className="hidden lg:flex items-center gap-1">
                <div className="relative">
                  <select
                    value={prefs.sortField}
                    onChange={(e) =>
                      updateUiPrefs({
                        sortField: e.target.value as AudioSortField,
                      })
                    }
                    aria-label="Sort tracks by"
                    className="h-9 pl-2.5 pr-7 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] appearance-none cursor-pointer focus:outline-none focus:border-[var(--accent)]"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        Sort: {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {prefs.sortField !== "custom" && (
                  <button
                    type="button"
                    onClick={() =>
                      updateUiPrefs({
                        sortDirection:
                          prefs.sortDirection === "asc" ? "desc" : "asc",
                      })
                    }
                    title={
                      prefs.sortDirection === "asc"
                        ? "Ascending order"
                        : "Descending order"
                    }
                    aria-label="Toggle sort direction"
                    className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    {prefs.sortDirection === "asc" ? (
                      <ArrowUpNarrowWide className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownWideNarrow className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>

              {/* Layout Switcher (Desktop Grid vs Table) */}
              <div className="hidden lg:inline-flex items-center p-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <button
                  type="button"
                  onClick={() => updateUiPrefs({ viewMode: "grid" })}
                  title="Grid view"
                  aria-label="Grid view"
                  className={`h-8 w-8 inline-flex items-center justify-center rounded cursor-pointer ${
                    prefs.viewMode === "grid"
                      ? "bg-[var(--bg-surface-hover)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => updateUiPrefs({ viewMode: "table" })}
                  title="Table view"
                  aria-label="Table view"
                  className={`h-8 w-8 inline-flex items-center justify-center rounded cursor-pointer ${
                    prefs.viewMode === "table"
                      ? "bg-[var(--bg-surface-hover)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Select Mode Toggle */}
              <button
                type="button"
                onClick={() => {
                  if (selectedIds.size > 0) setSelectedIds(new Set());
                  else if (filteredTracks.length > 0)
                    setSelectedIds(new Set([filteredTracks[0].id]));
                }}
                title={
                  selectedIds.size > 0
                    ? "Clear selection"
                    : "Select multiple tracks"
                }
                aria-label="Toggle track selection mode"
                className={`h-9 px-2.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  selectedIds.size > 0
                    ? "border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">
                  {selectedIds.size > 0 ? `${selectedIds.size}` : "Select"}
                </span>
              </button>

              {/* Desktop Display Options Popover */}
              <div className="relative hidden lg:block">
                <button
                  type="button"
                  onClick={() => setDisplayPopoverOpen((v) => !v)}
                  aria-expanded={displayPopoverOpen}
                  className={`h-9 px-2.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    displayPopoverOpen || hasActiveFilters
                      ? "border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Options</span>
                  <ChevronDown className="w-3 h-3 opacity-70" />
                </button>

                {displayPopoverOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setDisplayPopoverOpen(false)}
                    />
                    <div className="absolute right-0 top-10 z-40">
                      <AudioOptionsPopover
                        formatFilter={formatFilter}
                        groupBy={prefs.groupBy}
                        coverSize={prefs.coverSize}
                        cardDetails={prefs.cardDetails}
                        allTags={allTags}
                        selectedTags={selectedTags}
                        playlists={playlists}
                        activeFilter={activeFilter}
                        totalBytes={totalBytes}
                        isExportingBackup={isExportingBackup}
                        isParsingBackup={isParsingBackup}
                        onFormatFilterChange={setFormatFilter}
                        onGroupByChange={(groupBy) => updateUiPrefs({ groupBy })}
                        onCoverSizeChange={(coverSize) =>
                          updateUiPrefs({ coverSize })
                        }
                        onCardDetailsChange={updateCardDetails}
                        onToggleTag={(tag) =>
                          setSelectedTags((prev) =>
                            prev.includes(tag)
                              ? prev.filter((t) => t !== tag)
                              : [...prev, tag],
                          )
                        }
                        onClearTags={() => setSelectedTags([])}
                        onSelectPlaylist={(id) =>
                          setActiveFilter({ kind: "playlist", id })
                        }
                        onCreatePlaylist={(name) => {
                          addAudioPlaylist(name);
                        }}
                        onDeletePlaylist={deleteAudioPlaylist}
                        onExportBackup={() => void handleExportBackup()}
                        onSelectImportBackupFile={(file) =>
                          void handleSelectImportBackupFile(file)
                        }
                        onOpenStorageManager={() => setStorageManagerOpen(true)}
                        onClose={() => setDisplayPopoverOpen(false)}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Inspector Toggle */}
              <button
                type="button"
                onClick={() => {
                  if (!inspectorOpen && !inspectedTrackId && filteredTracks[0]) {
                    setInspectedTrackId(
                      audioState.primaryTrackId || filteredTracks[0].id,
                    );
                  }
                  setInspectorOpen((v) => !v);
                }}
                title="Toggle track inspector"
                aria-label="Toggle track inspector"
                className={`h-9 w-9 inline-flex items-center justify-center rounded-md border cursor-pointer ${
                  inspectorOpen
                    ? "border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <PanelRight className="w-4 h-4" />
              </button>
            </div>

            {prefs.sortField === "custom" &&
              prefs.groupBy !== "none" &&
              filteredTracks.length > 1 && (
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                  <GripVertical className="w-3 h-3 shrink-0" />
                  <span>
                    Set Group By to None to drag &amp; drop Custom Order cards.
                  </span>
                </div>
              )}
          </header>

          {/* Main Scrollable Shelf Area + Inspector Split */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            <div className="flex-1 min-w-0 overflow-y-auto overscroll-contain">
              <FloatingAudioDropDock
                visible={isDraggingTracks}
                folders={folders}
                playlists={playlists}
                activeRemovalTarget={activeRemovalTarget}
                onDropToFolder={handleDropTracksToFolder}
                onDropToPlaylist={handleDropTracksToPlaylist}
                onDropToMix={handleLayerInMix}
                onDropToQueue={handleAddToQueue}
                onDropToRemoveFromCurrent={handleRemoveTracksFromCurrent}
              />

              <div className="px-4 sm:px-5 lg:px-8 py-5 sm:py-6 pb-10">
                {filteredTracks.length === 0 ? (
                  <div className="max-w-lg mx-auto my-8 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-8 text-center space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-[var(--bg-accent-subtle)] text-[var(--accent)] flex items-center justify-center mx-auto">
                      <Headphones className="w-6 h-6" />
                    </div>
                    {tracks.length === 0 ? (
                      <>
                        <div className="space-y-1">
                          <h2 className="font-display text-base font-semibold">
                            Your Local Audio Studio is Empty
                          </h2>
                          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                            Import MP3, M4A, FLAC, WAV, OGG, OPUS, or AAC files
                            for offline playback, ambient multi-track mixing, EQ
                            presets, and per-track timestamp memory.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleTriggerImport()}
                            className="h-9 px-4 rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Import Audio Files</span>
                          </button>
                          {isAndroidApp && (
                            <button
                              type="button"
                              onClick={() => setAndroidFolderManagerOpen(true)}
                              className="h-9 px-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <FolderOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
                              <span>Link Device Folder</span>
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <h2 className="font-display text-base font-semibold">
                            No Matching Audio Tracks
                          </h2>
                          <p className="text-xs text-[var(--text-secondary)]">
                            Try clearing your search query, format chip, or
                            selected tags.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveFilter({ kind: "smart", id: "all" });
                            setFormatFilter("all");
                            setSelectedTags([]);
                            setSearchQuery("");
                          }}
                          className="h-8 px-3 rounded-md border border-[var(--border-strong)] text-xs font-medium cursor-pointer"
                        >
                          Reset All Filters
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-8">
                    {groupedTracks.map((group) => (
                      <section key={group.key} className="space-y-3">
                        {group.label && (
                          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                              {group.label}
                            </h2>
                            <span className="font-mono tabular-nums text-[11px] text-[var(--text-muted)]">
                              {group.tracks.length}
                            </span>
                          </div>
                        )}

                        {/* Mobile View List */}
                        <div className="lg:hidden">
                          <MobileAudioList
                            tracks={group.tracks}
                            cardDetails={prefs.cardDetails}
                            selectedIds={selectedIds}
                            isSelectionMode={selectedIds.size > 0}
                            activeSlotTrackIds={activeSlotTrackIds}
                            playingTrackIds={playingTrackIds}
                            isCustomSort={isCustomSortActive}
                            onReorderTracks={handleReorderTracks}
                            onPlayTrack={handlePlayTrack}
                            onQuickAction={(tr) => setMobileActionTrack(tr)}
                            onToggleSelect={handleToggleSelect}
                            missingTrackIds={missingTrackIds}
                            onRelinkTrack={(tr) => void handleRelinkTrack(tr)}
                          />
                        </div>

                        {/* Desktop Grid or Table */}
                        <div className="hidden lg:block">
                          {prefs.viewMode === "table" ? (
                            <AudioTable
                              tracks={group.tracks}
                              folders={folders}
                              selectedIds={selectedIds}
                              allSelected={
                                filteredTracks.length > 0 &&
                                filteredTracks.every((t) =>
                                  selectedIds.has(t.id),
                                )
                              }
                              inspectorOpen={inspectorOpen}
                              inspectedTrackId={inspectedTrackId}
                              activeSlotTrackIds={activeSlotTrackIds}
                              playingTrackIds={playingTrackIds}
                              sortField={prefs.sortField}
                              sortDirection={prefs.sortDirection}
                              isCustomSort={isCustomSortActive}
                              missingTrackIds={missingTrackIds}
                              onReorderTracks={handleReorderTracks}
                              onSortChange={(field) => {
                                if (field === prefs.sortField) {
                                  updateUiPrefs({
                                    sortDirection:
                                      prefs.sortDirection === "asc"
                                        ? "desc"
                                        : "asc",
                                  });
                                } else {
                                  updateUiPrefs({
                                    sortField: field,
                                    sortDirection:
                                      field === "title" || field === "artist"
                                        ? "asc"
                                        : "desc",
                                  });
                                }
                              }}
                              onToggleSelect={handleToggleSelect}
                              onToggleSelectAll={handleToggleSelectAll}
                              onPlayTrack={handlePlayTrack}
                              onAddToMix={(tr) => handleLayerInMix([tr.id])}
                              onAddToQueue={(tr) => handleAddToQueue([tr.id])}
                              onInspectTrack={(tr) => {
                                setInspectedTrackId(tr.id);
                                setInspectorOpen(true);
                              }}
                              onEditTrack={(tr) => setEditingTrackId(tr.id)}
                              onRelinkTrack={(tr) => void handleRelinkTrack(tr)}
                              onToggleFavorite={(tr) =>
                                updateAudioTrack(tr.id, {
                                  isFavorite: !tr.isFavorite,
                                })
                              }
                              onContextMenuTrack={(tr, e) => {
                                e.preventDefault();
                                const targets = selectedIds.has(tr.id)
                                  ? Array.from(selectedIds)
                                  : [tr.id];
                                setContextMenu({
                                  x: e.clientX,
                                  y: e.clientY,
                                  targetTrackIds: targets,
                                  primaryTrackId: tr.id,
                                });
                              }}
                            />
                          ) : (
                            <AudioGrid
                              tracks={group.tracks}
                              selectedIds={selectedIds}
                              isSelectionMode={selectedIds.size > 0}
                              coverSize={prefs.coverSize}
                              cardDetails={prefs.cardDetails}
                              inspectorOpen={inspectorOpen}
                              inspectedTrackId={inspectedTrackId}
                              activeSlotTrackIds={activeSlotTrackIds}
                              playingTrackIds={playingTrackIds}
                              isCustomSort={isCustomSortActive}
                              onReorderTracks={handleReorderTracks}
                              onPlayTrack={handlePlayTrack}
                              onAddToMix={(tr) => handleLayerInMix([tr.id])}
                              onInspectTrack={(tr) => {
                                setInspectedTrackId(tr.id);
                                setInspectorOpen(true);
                              }}
                              onEditTrack={(tr) => setEditingTrackId(tr.id)}
                              onToggleFavorite={(tr) =>
                                updateAudioTrack(tr.id, {
                                  isFavorite: !tr.isFavorite,
                                })
                              }
                              onToggleSelect={handleToggleSelect}
                              onQuickAction={(tr) => setMobileActionTrack(tr)}
                              onContextMenuTrack={(tr, e) => {
                                e.preventDefault();
                                const targets = selectedIds.has(tr.id)
                                  ? Array.from(selectedIds)
                                  : [tr.id];
                                setContextMenu({
                                  x: e.clientX,
                                  y: e.clientY,
                                  targetTrackIds: targets,
                                  primaryTrackId: tr.id,
                                });
                              }}
                              missingTrackIds={missingTrackIds}
                              onRelinkTrack={(tr) => void handleRelinkTrack(tr)}
                            />
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Split Track Inspector Panel */}
            <AudioInspector
              track={inspectedTrack}
              isOpen={inspectorOpen}
              isMissing={
                inspectedTrack ? missingTrackIds.has(inspectedTrack.id) : false
              }
              folders={folders}
              playlists={playlists}
              onClose={() => setInspectorOpen(false)}
              onPlayTrack={handlePlayTrack}
              onAddToMix={(tr) => handleLayerInMix([tr.id])}
              onAddToQueue={(tr) => handleAddToQueue([tr.id])}
              onUpdateTrack={(updated) => updateAudioTrack(updated.id, updated)}
              onEditMetadata={(tr) => setEditingTrackId(tr.id)}
              onRelinkTrack={(tr) => void handleRelinkTrack(tr)}
              onDeleteTrack={(trackId) => {
                const tr = tracks.find((t) => t.id === trackId);
                if (tr) setTracksPendingDelete([tr]);
              }}
            />
          </div>

          {/* Persistent Multi-Track Mixer & Playback Deck */}
          <AudioPlayerDeck
            tracks={tracks}
            audioState={audioState}
            primarySlot={mixer.primarySlot}
            primaryTrack={mixer.primaryTrack}
            slotRuntime={mixer.slotRuntime}
            isPlaying={mixer.isPlaying}
            isAllPaused={mixer.isAllPaused}
            viewMuted={mixer.viewMuted}
            sleepRemainingSeconds={mixer.sleepRemainingSeconds}
            analyserNode={mixer.analyserNode}
            visualizerMode={prefs.visualizerMode}
            onChangeVisualizerMode={(mode) =>
              updateUiPrefs({ visualizerMode: mode })
            }
            scrubberStyle={prefs.scrubberStyle}
            onChangeScrubberStyle={(scrubberStyle) =>
              updateUiPrefs({ scrubberStyle })
            }
            onTogglePlayPauseAll={mixer.togglePlayPauseAll}
            onTogglePlaySlot={mixer.togglePlaySlot}
            onToggleViewMute={mixer.toggleViewMute}
            onSeekSlot={mixer.seekSlot}
            onSkipPrimary={mixer.skipPrimary}
            onNext={() => mixer.playNext(true)}
            onPrev={mixer.playPrev}
            onUpdateAudioState={updateAudioState}
            onUpdateSlot={updateAudioMixSlot}
            onRemoveSlot={removeAudioMixSlot}
            onReorderSlots={reorderAudioMixSlots}
            onClearSlots={clearAudioMixSlots}
            onSetEqPreset={setAudioEqPreset}
            onStartSleepTimer={mixer.startSleepTimer}
            onCancelSleepTimer={mixer.cancelSleepTimer}
            onSaveMixPreset={(name, cat) => {
              saveAudioMixPreset(name, cat);
            }}
            onDropTracksToMix={handleLayerInMix}
            onDropTracksToQueue={handleAddToQueue}
            onSelectTrackToPlay={(trackId) => {
              const tr = tracks.find((t) => t.id === trackId);
              if (tr) handlePlayTrack(tr);
            }}
          />
        </div>

        {/* Multi-Select Bulk Action Bar */}
        <AudioBulkActionBar
          selectedCount={selectedIds.size}
          totalVisibleCount={filteredTracks.length}
          onSelectAll={() =>
            setSelectedIds(new Set(filteredTracks.map((t) => t.id)))
          }
          onClearSelection={() => setSelectedIds(new Set())}
          onBulkAddToMix={() => {
            handleLayerInMix(Array.from(selectedIds));
            setSelectedIds(new Set());
          }}
          onBulkAddToQueue={() => {
            handleAddToQueue(Array.from(selectedIds));
            setSelectedIds(new Set());
          }}
          onBulkEdit={() => {
            const list = tracks.filter((t) => selectedIds.has(t.id));
            if (list.length > 0) setBulkEditTargets(list);
          }}
          onBulkFavorite={() => {
            handleDropTracksToFavorites(Array.from(selectedIds));
            setSelectedIds(new Set());
          }}
          onBulkDelete={() => {
            const list = tracks.filter((t) => selectedIds.has(t.id));
            if (list.length > 0) setTracksPendingDelete(list);
          }}
        />

        {/* Right-Click Context Menu */}
        <AudioContextMenu
          menuState={contextMenu}
          tracks={tracks}
          folders={folders}
          playlists={playlists}
          activePlaylistRemovalName={
            activeFilter.kind === "playlist" && activePlaylist
              ? activePlaylist.name
              : null
          }
          selectedIds={selectedIds}
          isMissingTrack={(tr) => missingTrackIds.has(tr.id)}
          onClose={() => setContextMenu(null)}
          onPlayTrack={handlePlayTrack}
          onLayerInMix={handleLayerInMix}
          onAddToQueue={handleAddToQueue}
          onInspectTrack={(tr) => {
            setInspectedTrackId(tr.id);
            setInspectorOpen(true);
          }}
          onEditMetadata={(tr) => setEditingTrackId(tr.id)}
          onBulkEditTracks={(ids) => {
            const list = tracks.filter((t) => ids.includes(t.id));
            if (list.length > 0) setBulkEditTargets(list);
          }}
          onToggleFolderMembership={(ids, folderId, add) => {
            for (const id of ids) {
              const tr = tracks.find((t) => t.id === id);
              if (!tr) continue;
              const current = getAudioFolderIds(tr);
              const next = add
                ? [...current, folderId]
                : current.filter((fid) => fid !== folderId);
              const updated = withAudioFolderIds(tr, next);
              updateAudioTrack(id, {
                folderIds: updated.folderIds,
                folderId: updated.folderId,
              });
            }
          }}
          onTogglePlaylistMembership={(ids, playlistId, add) => {
            if (add) {
              addTracksToPlaylist(playlistId, ids);
            } else {
              for (const id of ids) removeTrackFromPlaylist(playlistId, id);
            }
          }}
          onRemoveFromCurrentPlaylist={(ids) => {
            if (activeFilter.kind === "playlist") {
              for (const id of ids) {
                removeTrackFromPlaylist(activeFilter.id, id);
              }
            }
          }}
          onSetFavorite={(ids, fav) => {
            for (const id of ids) updateAudioTrack(id, { isFavorite: fav });
          }}
          onToggleSelectTrack={(id) => handleToggleSelect(id, false)}
          onClearSelection={() => setSelectedIds(new Set())}
          onRelinkTrack={(tr) => void handleRelinkTrack(tr)}
          onRequestDeleteTracks={(ids) => {
            const list = tracks.filter((t) => ids.includes(t.id));
            if (list.length > 0) setTracksPendingDelete(list);
          }}
        />

        {/* Mobile Track Action Sheet */}
        <AudioMobileActionSheet
          track={mobileActionTrack}
          isMissing={
            mobileActionTrack ? missingTrackIds.has(mobileActionTrack.id) : false
          }
          activePlaylistName={
            activeFilter.kind === "playlist" && activePlaylist
              ? activePlaylist.name
              : null
          }
          onClose={() => setMobileActionTrack(null)}
          onPlayTrack={handlePlayTrack}
          onLayerInMix={(tr) => handleLayerInMix([tr.id])}
          onAddToQueue={(tr) => handleAddToQueue([tr.id])}
          onRelinkTrack={(tr) => void handleRelinkTrack(tr)}
          onInspectTrack={(tr) => {
            setInspectedTrackId(tr.id);
            setInspectorOpen(true);
          }}
          onOrganizeTrack={(tr) => setBulkEditTargets([tr])}
          onToggleFavorite={(tr) =>
            updateAudioTrack(tr.id, { isFavorite: !tr.isFavorite })
          }
          onEditMetadata={(tr) => setEditingTrackId(tr.id)}
          onSelectTrack={(tr) => handleToggleSelect(tr.id, false)}
          onRemoveFromPlaylist={
            activeFilter.kind === "playlist"
              ? (tr) => removeTrackFromPlaylist(activeFilter.id, tr.id)
              : undefined
          }
          onDeleteTrack={(trackId) => {
            const tr = tracks.find((t) => t.id === trackId);
            if (tr) setTracksPendingDelete([tr]);
          }}
        />

        {/* Mobile Filter & Sort Bottom Sheet */}
        <AudioMobileFilterSheet
          isOpen={mobileFilterSheetOpen}
          formatFilter={formatFilter}
          groupBy={prefs.groupBy}
          sortField={prefs.sortField}
          sortDirection={prefs.sortDirection}
          coverSize={prefs.coverSize}
          cardDetails={prefs.cardDetails}
          hasActiveFilters={hasActiveFilters}
          onFormatChange={setFormatFilter}
          onGroupByChange={(groupBy) => updateUiPrefs({ groupBy })}
          onSortFieldChange={(sortField) => updateUiPrefs({ sortField })}
          onToggleSortDirection={() =>
            updateUiPrefs({
              sortDirection: prefs.sortDirection === "asc" ? "desc" : "asc",
            })
          }
          onCoverSizeChange={(coverSize) => updateUiPrefs({ coverSize })}
          onCardDetailsChange={updateCardDetails}
          onResetFilters={() => {
            setFormatFilter("all");
            setSelectedTags([]);
            setSearchQuery("");
            updateUiPrefs({ groupBy: "none" });
          }}
          onClose={() => setMobileFilterSheetOpen(false)}
        />

        {/* Metadata & Cover Customizer Drawer */}
        {editingTrack && (
          <AudioMetadataDrawer
            track={editingTrack}
            isMissing={missingTrackIds.has(editingTrack.id)}
            folders={folders}
            playlists={playlists}
            existingTags={allTags.map((t) => t.name)}
            onSave={(updated, selectedPlaylistIds) => {
              updateAudioTrack(updated.id, updated);
              const selectedSet = new Set(selectedPlaylistIds);
              for (const pl of playlists) {
                const currentlyHas = pl.trackIds.includes(updated.id);
                const shouldHave = selectedSet.has(pl.id);
                if (!currentlyHas && shouldHave) {
                  addTracksToPlaylist(pl.id, [updated.id]);
                } else if (currentlyHas && !shouldHave) {
                  removeTrackFromPlaylist(pl.id, updated.id);
                }
              }
              setEditingTrackId(null);
              pushToast(`Updated "${updated.title}"`, "success");
            }}
            onReplaceFile={handleReplaceAudioFile}
            onRelinkTrack={(tr) => void handleRelinkTrack(tr)}
            onDelete={(trackId) => {
              setEditingTrackId(null);
              const tr = tracks.find((t) => t.id === trackId);
              if (tr) setTracksPendingDelete([tr]);
            }}
            onCreateFolder={(name) => addAudioFolder(name)}
            onCreatePlaylist={(name) => addAudioPlaylist(name)}
            onClose={() => setEditingTrackId(null)}
          />
        )}

        {/* Bulk Edit / Mobile Organize Modal */}
        {bulkEditTargets && bulkEditTargets.length > 0 && (
          <AudioBulkEditModal
            selectedTracks={bulkEditTargets}
            folders={folders}
            playlists={playlists}
            existingTags={allTags.map((t) => t.name)}
            onCreateFolder={(name) => addAudioFolder(name)}
            onCreatePlaylist={(name) => addAudioPlaylist(name)}
            onApply={handleApplyBulkEdit}
            onClose={() => setBulkEditTargets(null)}
          />
        )}

        {/* Confirm Delete Modal */}
        <AudioConfirmDeleteModal
          tracksToDelete={tracksPendingDelete}
          onConfirm={() => {
            const ids = tracksPendingDelete.map((t) => t.id);
            setTracksPendingDelete([]);
            setSelectedIds((prev) => {
              const next = new Set(prev);
              for (const id of ids) next.delete(id);
              return next;
            });
            if (inspectedTrackId && ids.includes(inspectedTrackId)) {
              setInspectedTrackId(null);
              setInspectorOpen(false);
            }
            void deleteAudioTracks(ids);
          }}
          onClose={() => setTracksPendingDelete([])}
        />

        {/* Local Audio Storage Manager Modal */}
        <AudioStorageManagerModal
          isOpen={storageManagerOpen}
          tracks={tracks}
          androidLinkedFolders={androidLinkedFolders}
          onClose={() => setStorageManagerOpen(false)}
          onReplaceFile={handleReplaceAudioFile}
          onRelinkTrack={(tr) => void handleRelinkTrack(tr)}
          onDeleteTracks={deleteAudioTracks}
          onEditMetadata={(tr) => {
            setStorageManagerOpen(false);
            setEditingTrackId(tr.id);
          }}
          onImportAudio={() => {
            setStorageManagerOpen(false);
            void handleTriggerImport();
          }}
          onOpenAndroidFolderManager={
            isAndroidApp
              ? () => {
                  setStorageManagerOpen(false);
                  setAndroidFolderManagerOpen(true);
                }
              : undefined
          }
          onNotify={(title, tone) =>
            pushToast(title, tone === "info" ? "neutral" : tone)
          }
        />

        {/* ZIP Backup Restore Modal */}
        {pendingBackupArchive && (
          <AudioImportBackupModal
            backup={pendingBackupArchive}
            existingTracksCount={tracks.length}
            isRestoring={isRestoringBackup}
            onConfirm={(mode) => void handleConfirmRestoreBackup(mode)}
            onCancel={() => {
              if (!isRestoringBackup) setPendingBackupArchive(null);
            }}
          />
        )}

        {/* Duplicate Track Resolver Modal */}
        {pendingDuplicates.length > 0 && (
          <AudioDuplicateImportModal
            items={pendingDuplicates}
            onResolve={(decisions) => void handleResolveDuplicates(decisions)}
            onCancel={() => setPendingDuplicates([])}
          />
        )}

        {/* Android Storage Mode Choice Modal */}
        {pendingAndroidPick && (
          <AudioAndroidImportChoiceModal
            isOpen
            fileCount={pendingAndroidPick.files.length}
            totalBytes={pendingAndroidPick.files.reduce(
              (s, f) => s + (f.size || 0),
              0,
            )}
            contextLabel={pendingAndroidPick.contextLabel}
            onChoose={(choice, remember) =>
              void handleResolveAndroidImportChoice(choice, remember)
            }
            onCancel={() => setPendingAndroidPick(null)}
          />
        )}

        {/* Android Linked Folders Modal */}
        <AudioAndroidFolderManagerModal
          isOpen={androidFolderManagerOpen}
          folders={androidLinkedFolders}
          isScanning={isScanningAndroidFolders}
          onClose={() => setAndroidFolderManagerOpen(false)}
          onAddFolder={() => void handleAddAndroidFolder()}
          onScanFolder={(uri) => void scanSingleAndroidFolder(uri)}
          onScanAll={() => void handleScanAllAndroidFolders()}
          onRemoveFolder={handleRemoveAndroidFolder}
        />
      </div>
    );
  },
);

AudioView.displayName = "AudioView";
