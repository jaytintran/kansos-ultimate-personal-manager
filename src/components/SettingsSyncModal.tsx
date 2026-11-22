import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  CloudDownload,
  CloudUpload,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  HardDrive,
  ListTodo,
  MonitorPlay,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useWorkspace } from "../context/WorkspaceContext";
import { pruneMissingBookVoicePreferences } from "../hooks/useVoicePreferences";
import { libraryDb, type BookFileAuditEntry } from "../lib/db";
import { formatFileSize } from "../lib/formatters";
import {
  ColorMode,
  EntryType,
  ThemeId,
  TimelineDisplayMode,
  ViewId,
} from "../types";
import {
  getAndroidImportMode,
  getAndroidLinkedFolders,
  isAndroidCapacitor,
  setAndroidImportMode,
  type AndroidImportStorageMode,
} from "../utils/androidSaf";
import {
  downloadWorkspaceJson,
  GistPullPreview,
  pullWorkspaceFromGist,
  pushWorkspaceToGist,
  validateWorkspacePayload,
} from "../utils/gist";
import { KansoLogo } from "./KansoLogo";

export type SettingsModalTab = "appearance" | "sync" | "workspace" | "storage";

interface SettingsSyncModalProps {
  open: boolean;
  initialTab?: SettingsModalTab;
  onClose: () => void;
}

const THEMES: {
  id: ThemeId;
  name: string;
  tagline: string;
  lightSwatch: [string, string, string];
  darkSwatch: [string, string, string];
}[] = [
  {
    id: "paper",
    name: "Paper",
    tagline: "Archival warm stone & terracotta ink",
    lightSwatch: ["#faf8f5", "#ffffff", "#b45309"],
    darkSwatch: ["#161412", "#1e1b18", "#e5934b"],
  },
  {
    id: "neon",
    name: "Neon",
    tagline: "Electric cobalt & obsidian cyan contrast",
    lightSwatch: ["#f7f8fc", "#ffffff", "#4f46e5"],
    darkSwatch: ["#090b12", "#101421", "#22d3ee"],
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    tagline: "Industrial gunmetal, signal magenta & acid yellow",
    lightSwatch: ["#f6f6f3", "#ffffff", "#d90368"],
    darkSwatch: ["#0d0c12", "#15141e", "#facc15"],
  },
  {
    id: "nordic",
    name: "Nordic",
    tagline: "Glacial mist & polar fjord slate-blue",
    lightSwatch: ["#f4f6f9", "#ffffff", "#3b6998"],
    darkSwatch: ["#1b2029", "#222935", "#88c0d0"],
  },
  {
    id: "emerald",
    name: "Emerald",
    tagline: "Botanical alabaster & deep pine jade",
    lightSwatch: ["#f4f8f5", "#ffffff", "#047857"],
    darkSwatch: ["#0c1512", "#121f1a", "#34d399"],
  },
];

const STARTUP_VIEW_OPTIONS: { id: ViewId; label: string }[] = [
  { id: "focus", label: "Focus" },
  { id: "timeline", label: "Timeline" },
  { id: "habits", label: "Habits" },
  { id: "notes", label: "Notes" },
  { id: "events", label: "Events" },
  { id: "lists", label: "Lists" },
  { id: "library", label: "Library" },
  { id: "streamer", label: "Streamer" },
  { id: "achievements", label: "Achievements" },
];

const TIMELINE_DEFAULT_TYPES: { id: EntryType; label: string }[] = [
  { id: "task", label: "Task" },
  { id: "log", label: "Log" },
  { id: "event", label: "Event" },
  { id: "timeblock", label: "Block" },
  { id: "note", label: "Note" },
];

const LOCAL_STORAGE_KEY_LABELS: Record<string, string> = {
  kanso_workspace_v1: "Primary Workspace JSON",
  kanso_gist_config_v1: "GitHub Gist Sync Config & Token",
  kanso_habits_view_mode_v1: "Habits View Mode",
  kanso_habits_range_v1: "Habits Matrix Range",
  kanso_notes_sort_v1: "Notes Sort Order",
  kanso_notes_view_mode_v1: "Notes Layout Mode",
  kanso_lists_prefs_v1: "Lists View Preferences",
  kanso_events_filters_v1: "Events Filter State",
  kanso_library_studio_prefs_v1: "Library & Reader Preferences",
  kanso_library_voice_prefs_v1: "Audiobook Voice Preferences",
  kanso_android_import_mode_v1: "Android Library Import Mode",
  kanso_android_linked_folders_v1: "Android Linked Device Folders",
};

function measureJsonBytes(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value ?? null)]).size;
  } catch {
    return 0;
  }
}

interface QuotaInfo {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

interface LocalStorageEntryInfo {
  key: string;
  label: string;
  bytes: number;
}

export const SettingsSyncModal: React.FC<SettingsSyncModalProps> = ({
  open,
  initialTab = "appearance",
  onClose,
}) => {
  const {
    workspace,
    gistConfig,
    gistSyncBusy,
    quickPushGist,
    quickPullGist,
    updateSettings,
    updateGistConfig,
    replaceWorkspace,
    purgeWorkspaceSection,
    deleteBook,
    clearWorkspaceData,
    restoreSampleData,
    pushToast,
  } = useWorkspace();

  const [tab, setTab] = useState<SettingsModalTab>(initialTab);
  const [showToken, setShowToken] = useState(false);
  const [syncBusyLocal, setSyncBusyLocal] = useState<"push" | "pull" | null>(
    null,
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pullPreview, setPullPreview] = useState<GistPullPreview | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Storage Tab State
  const [storageLoading, setStorageLoading] = useState(false);
  const [auditEntries, setAuditEntries] = useState<BookFileAuditEntry[]>([]);
  const [quota, setQuota] = useState<QuotaInfo>({
    usage: null,
    quota: null,
    persisted: null,
  });
  const [localKeys, setLocalKeys] = useState<LocalStorageEntryInfo[]>([]);
  const [confirmActionKey, setConfirmActionKey] = useState<string | null>(null);
  const [storageBusyKey, setStorageBusyKey] = useState<string | null>(null);
  const isAndroidApp = useMemo(() => isAndroidCapacitor(), []);
  const [androidImportMode, setAndroidImportModeState] =
    useState<AndroidImportStorageMode>(() =>
      isAndroidCapacitor() ? getAndroidImportMode() : "ask",
    );
  const [androidLinkedFolderCount, setAndroidLinkedFolderCount] = useState<number>(
    () => (isAndroidCapacitor() ? getAndroidLinkedFolders().length : 0),
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshStorageAudit = useCallback(async () => {
    setStorageLoading(true);
    try {
      const [entries, estimate, persisted] = await Promise.all([
        libraryDb.auditStorageFiles(),
        typeof navigator !== "undefined" && navigator.storage?.estimate
          ? navigator.storage.estimate().catch(() => null)
          : Promise.resolve(null),
        typeof navigator !== "undefined" && navigator.storage?.persisted
          ? navigator.storage.persisted().catch(() => null)
          : Promise.resolve(null),
      ]);
      setAuditEntries(entries);
      setQuota({
        usage: typeof estimate?.usage === "number" ? estimate.usage : null,
        quota: typeof estimate?.quota === "number" ? estimate.quota : null,
        persisted,
      });

      const foundKeys: LocalStorageEntryInfo[] = [];
      if (typeof localStorage !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (!k.startsWith("kanso")) continue;
          const val = localStorage.getItem(k) ?? "";
          foundKeys.push({
            key: k,
            label: LOCAL_STORAGE_KEY_LABELS[k] || k,
            bytes: new Blob([val]).size,
          });
        }
        foundKeys.sort((a, b) => b.bytes - a.bytes);
      }
      setLocalKeys(foundKeys);
    } catch {
      // Ignore audit error
    } finally {
      setStorageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setSyncError(null);
      setPullPreview(null);
      setConfirmClear(false);
      setConfirmActionKey(null);
      if (isAndroidApp) {
        setAndroidImportModeState(getAndroidImportMode());
        setAndroidLinkedFolderCount(getAndroidLinkedFolders().length);
      }
    }
  }, [open, initialTab, isAndroidApp]);

  useEffect(() => {
    if (open && tab === "storage") {
      void refreshStorageAudit();
    }
  }, [open, tab, refreshStorageAudit]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const effectiveBusy = gistSyncBusy ?? syncBusyLocal;

  const bookMap = useMemo(
    () => new Map(workspace.books.map((b) => [b.id, b])),
    [workspace.books],
  );

  const orphanBlobs = useMemo(
    () => auditEntries.filter((entry) => !bookMap.has(entry.bookId)),
    [auditEntries, bookMap],
  );

  const orphanBytes = useMemo(
    () => orphanBlobs.reduce((acc, e) => acc + e.byteLength, 0),
    [orphanBlobs],
  );

  const totalIndexedDbBytes = useMemo(
    () => auditEntries.reduce((acc, e) => acc + e.byteLength, 0),
    [auditEntries],
  );

  const totalLocalStorageBytes = useMemo(
    () => localKeys.reduce((acc, k) => acc + k.bytes, 0),
    [localKeys],
  );

  const workspaceJsonBytes = useMemo(
    () =>
      localKeys.find((k) => k.key === "kanso_workspace_v1")?.bytes ??
      measureJsonBytes(workspace),
    [localKeys, workspace],
  );

  const domainMetrics = useMemo(() => {
    const entries = workspace.entries;
    const completedTasks = entries.filter(
      (e) => e.type === "task" && e.completed,
    ).length;
    const archivedNotes = entries.filter(
      (e) =>
        e.type === "note" && (e.archived || e.noteStatus === "archived"),
    ).length;

    return {
      entriesCount: entries.length,
      completedTasks,
      archivedNotes,
      entriesBytes: measureJsonBytes(entries),
      focusCount:
        (workspace.scratchpads?.length ?? 0) +
        (workspace.customTabs?.length ?? 0),
      focusBytes:
        measureJsonBytes(workspace.scratchpads) +
        measureJsonBytes(workspace.customTabs),
      habitsCount:
        workspace.habits.length + (workspace.habitLogs?.length ?? 0),
      habitsBytes:
        measureJsonBytes(workspace.habits) +
        measureJsonBytes(workspace.habitLogs),
      listsCount: workspace.lists.length + workspace.listItems.length,
      listsBytes:
        measureJsonBytes(workspace.lists) +
        measureJsonBytes(workspace.listItems),
      streamerCount:
        workspace.streams.length +
        (workspace.streamFolders?.length ?? 0) +
        workspace.streamPresets.length,
      streamerBytes:
        measureJsonBytes(workspace.streams) +
        measureJsonBytes(workspace.streamFolders) +
        measureJsonBytes(workspace.streamPresets) +
        measureJsonBytes(workspace.streamerState),
      libraryMetaCount:
        workspace.books.length +
        (workspace.bookBookmarks?.length ?? 0) +
        (workspace.bookHighlights?.length ?? 0),
      libraryMetaBytes:
        measureJsonBytes(workspace.books) +
        measureJsonBytes(workspace.libraryFolders) +
        measureJsonBytes(workspace.libraryCategories) +
        measureJsonBytes(workspace.libraryViewFolders) +
        measureJsonBytes(workspace.bookBookmarks) +
        measureJsonBytes(workspace.bookHighlights),
    };
  }, [workspace]);

  if (!open) return null;

  const handlePush = async () => {
    setSyncError(null);
    setPullPreview(null);
    setSyncBusyLocal("push");
    try {
      const result = await pushWorkspaceToGist(workspace, gistConfig);
      updateGistConfig({
        gistId: result.gistId,
        lastSyncedAt: result.updatedAt,
        lastDirection: "push",
      });
      pushToast(
        result.createdNew
          ? `Created private Gist (${result.gistId.slice(0, 8)}…) and pushed`
          : "Pushed workspace to GitHub Gist",
        "success",
      );
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Push failed.");
    } finally {
      setSyncBusyLocal(null);
    }
  };

  const handleFetchPullPreview = async () => {
    setSyncError(null);
    setPullPreview(null);
    setSyncBusyLocal("pull");
    try {
      const preview = await pullWorkspaceFromGist(gistConfig);
      setPullPreview(preview);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Pull failed.");
    } finally {
      setSyncBusyLocal(null);
    }
  };

  const handleConfirmReplacePull = () => {
    if (!pullPreview) return;
    replaceWorkspace(
      pullPreview.workspace,
      "Replaced local workspace from GitHub Gist",
    );
    updateGistConfig({
      lastSyncedAt: new Date().toISOString(),
      lastDirection: "pull",
    });
    setPullPreview(null);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!validateWorkspacePayload(parsed)) {
        setSyncError(
          "Selected JSON file is not a valid Kanso workspace backup.",
        );
        return;
      }
      replaceWorkspace(parsed, "Workspace imported from JSON backup");
      setSyncError(null);
    } catch {
      setSyncError("Failed to read JSON backup file.");
    } finally {
      e.target.value = "";
    }
  };

  const handleRequestPersistence = async () => {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return;
    try {
      const granted = await navigator.storage.persist();
      setQuota((q) => ({ ...q, persisted: granted }));
      pushToast(
        granted
          ? "Persistent browser storage granted"
          : "Browser kept standard storage policy",
        granted ? "success" : "neutral",
      );
    } catch {
      pushToast("Could not request persistent storage", "error");
    }
  };

  const handleCleanOrphans = async () => {
    if (orphanBlobs.length === 0) return;
    setStorageBusyKey("clean-orphans");
    try {
      await libraryDb.deleteOrphanBookFiles(orphanBlobs.map((o) => o.bookId));
      pushToast(
        `Cleaned ${orphanBlobs.length} orphaned ${orphanBlobs.length === 1 ? "file" : "files"} (${formatFileSize(orphanBytes)})`,
        "success",
      );
      await refreshStorageAudit();
    } catch {
      pushToast("Failed to clean orphaned files", "error");
    } finally {
      setStorageBusyKey(null);
      setConfirmActionKey(null);
    }
  };

  const handleDeleteStoredBookOrBlob = async (bookId: string) => {
    setStorageBusyKey(`blob-${bookId}`);
    try {
      if (bookMap.has(bookId)) {
        await deleteBook(bookId);
      } else {
        await libraryDb.deleteBookData(bookId);
        pruneMissingBookVoicePreferences(new Set(bookMap.keys()));
        pushToast("Removed orphaned file from IndexedDB", "success");
      }
      await refreshStorageAudit();
    } catch {
      pushToast("Failed to delete stored file", "error");
    } finally {
      setStorageBusyKey(null);
      setConfirmActionKey(null);
    }
  };

  const handleClearAllBookFiles = async () => {
    setStorageBusyKey("clear-all-blobs");
    try {
      await libraryDb.clearAllData();
      pruneMissingBookVoicePreferences(new Set());
      pushToast("Cleared all stored ebook binary files from IndexedDB", "success");
      await refreshStorageAudit();
    } catch {
      pushToast("Failed to clear IndexedDB files", "error");
    } finally {
      setStorageBusyKey(null);
      setConfirmActionKey(null);
    }
  };

  const handleRemoveLocalStorageKey = (key: string) => {
    try {
      localStorage.removeItem(key);
      if (key === "kanso_gist_config_v1") {
        updateGistConfig({
          token: "",
          gistId: "",
          filename: "kanso-workspace.json",
          lastSyncedAt: null,
          lastDirection: null,
        });
      }
      pushToast(`Cleared ${LOCAL_STORAGE_KEY_LABELS[key] || key}`, "success");
      void refreshStorageAudit();
    } catch {
      pushToast("Failed to remove key", "error");
    } finally {
      setConfirmActionKey(null);
    }
  };

  const handleClearViewPreferences = () => {
    const viewKeys = localKeys
      .map((k) => k.key)
      .filter(
        (k) => k !== "kanso_workspace_v1" && k !== "kanso_gist_config_v1",
      );
    for (const k of viewKeys) {
      localStorage.removeItem(k);
    }
    pushToast(
      `Reset ${viewKeys.length} view preference ${viewKeys.length === 1 ? "key" : "keys"}`,
      "success",
    );
    setConfirmActionKey(null);
    void refreshStorageAudit();
  };

  const quotaPct =
    quota.quota && quota.quota > 0 && quota.usage !== null
      ? Math.min(100, Math.max(0.5, (quota.usage / quota.quota) * 100))
      : null;

  const lsBudgetPct = Math.min(
    100,
    Math.max(1, (totalLocalStorageBytes / (5 * 1024 * 1024)) * 100),
  );

  const showNavCounts = workspace.settings.showNavCounts ?? true;
  const defaultView = workspace.settings.defaultView ?? "focus";
  const defaultTimelineType = workspace.settings.defaultTimelineType ?? "task";
  const defaultNoteTimelineSync =
    workspace.settings.defaultNoteTimelineSync ?? false;

  const renderConfirmButton = (
    actionKey: string,
    label: string,
    onConfirm: () => void,
    disabled?: boolean,
  ) => {
    if (confirmActionKey === actionKey) {
      return (
        <div className="inline-flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={disabled}
            onClick={onConfirm}
            className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-white inline-flex items-center gap-1 disabled:opacity-50"
            style={{ backgroundColor: "var(--danger)" }}
          >
            <Check className="w-3 h-3" />
            <span>Confirm</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setConfirmActionKey(null)}
            className="h-7 w-7 flex items-center justify-center rounded-lg border text-xs"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
            aria-label="Cancel"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    }
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setConfirmActionKey(actionKey)}
        className="h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 shrink-0"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          color: "var(--danger)",
        }}
      >
        <Trash2 className="w-3 h-3" />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4 overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-label="Kanso Settings, Sync, and Storage"
    >
      <div
        className="hidden sm:block fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative z-10 w-full h-dvh sm:h-auto sm:max-w-2xl sm:max-h-[88dvh] rounded-none sm:rounded-2xl border-0 sm:border overflow-hidden overscroll-none flex flex-col pt-safe pb-safe sm:pt-0 sm:pb-0"
        style={{
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-subtle)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b shrink-0"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <KansoLogo size={20} />
            <h2 className="font-display text-base font-bold truncate">
              Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)]"
            style={{ color: "var(--text-muted)" }}
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Navigation Tabs */}
        <div
          className="px-4 sm:px-5 py-2.5 border-b shrink-0"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div
            className="grid grid-cols-4 gap-1 p-1 rounded-xl border"
            style={{
              backgroundColor: "var(--bg-surface-subtle)",
              borderColor: "var(--border-subtle)",
            }}
            role="tablist"
          >
            {(
              [
                { id: "appearance", label: "Theme", icon: Palette },
                { id: "sync", label: "Gist Sync", icon: RefreshCw },
                { id: "workspace", label: "Workspace", icon: SlidersHorizontal },
                { id: "storage", label: "Storage", icon: HardDrive },
              ] as {
                id: SettingsModalTab;
                label: string;
                icon: React.ComponentType<{ className?: string }>;
              }[]
            ).map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(item.id)}
                  className="h-8 px-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: active
                      ? "var(--bg-surface)"
                      : "transparent",
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                    boxShadow: active
                      ? "0 1px 2px rgba(0,0,0,0.06)"
                      : "none",
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto overscroll-none p-4 sm:p-5 space-y-5">
          {/* ================= THEME TAB ================= */}
          {tab === "appearance" && (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">Color Mode</div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Every theme includes tailored light and dark palettes.
                  </div>
                </div>
                <div
                  className="inline-flex items-center gap-1 p-1 rounded-lg border shrink-0"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  {(
                    [
                      { id: "light", label: "Light", icon: Sun },
                      { id: "dark", label: "Dark", icon: Moon },
                    ] as {
                      id: ColorMode;
                      label: string;
                      icon: React.ComponentType<{ className?: string }>;
                    }[]
                  ).map((mode) => {
                    const Icon = mode.icon;
                    const active = workspace.settings.colorMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => updateSettings({ colorMode: mode.id })}
                        className="px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5"
                        style={{
                          backgroundColor: active
                            ? "var(--bg-surface)"
                            : "transparent",
                          color: active
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                        }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{mode.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2.5">
                <div
                  className="text-xs font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Theme Palette (5 Themes)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {THEMES.map((theme) => {
                    const active = workspace.settings.theme === theme.id;
                    const swatches =
                      workspace.settings.colorMode === "dark"
                        ? theme.darkSwatch
                        : theme.lightSwatch;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => updateSettings({ theme: theme.id })}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-colors"
                        style={{
                          backgroundColor: active
                            ? "var(--accent-soft)"
                            : "var(--bg-surface)",
                          borderColor: active
                            ? "var(--accent)"
                            : "var(--border-subtle)",
                        }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold">
                              {theme.name}
                            </span>
                            {active && (
                              <Check
                                className="w-3.5 h-3.5"
                                style={{ color: "var(--accent)" }}
                              />
                            )}
                          </div>
                          <div
                            className="text-[11px] mt-0.5 line-clamp-1"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {theme.tagline}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {swatches.map((hex, i) => (
                            <span
                              key={i}
                              className="w-4 h-4 rounded-full border"
                              style={{
                                backgroundColor: hex,
                                borderColor: "rgba(128,128,128,0.3)",
                              }}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                className="flex items-center justify-between pt-4 border-t"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div>
                  <div className="text-sm font-medium">
                    Clock Display Format
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Applies to Timeline spine, Focus anchors, and NLP previews.
                  </div>
                </div>
                <div
                  className="inline-flex items-center gap-1 p-1 rounded-lg border shrink-0"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  {(["12h", "24h"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => updateSettings({ timeFormat: fmt })}
                      className="px-3 py-1 rounded-md text-xs font-mono font-medium"
                      style={{
                        backgroundColor:
                          workspace.settings.timeFormat === fmt
                            ? "var(--bg-surface)"
                            : "transparent",
                        color:
                          workspace.settings.timeFormat === fmt
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                      }}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ================= GITHUB GIST SYNC TAB ================= */}
          {tab === "sync" && (
            <div className="space-y-4">
              <p
                className="text-xs leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                Kanso runs 100% offline. Connect a GitHub Personal Access Token
                with the <span className="font-mono">gist</span> scope to push
                and pull your workspace snapshot (replace-only on pull). Book
                metadata, covers, notes, highlights, Streamer Vault &amp;
                presets sync across devices, while binary e-book files, active
                Streamer grid layout, and Reader typography/voice settings stay
                per-device.
              </p>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label
                    className="text-xs font-medium block"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    GitHub Personal Access Token (gist scope)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showToken ? "text" : "password"}
                      value={gistConfig.token}
                      onChange={(e) =>
                        updateGistConfig({ token: e.target.value })
                      }
                      placeholder="ghp_... or github_pat_..."
                      className="w-full pl-3 pr-10 py-2 rounded-xl border text-xs font-mono outline-none"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((s) => !s)}
                      className="absolute right-2 h-7 w-7 flex items-center justify-center rounded-md"
                      style={{ color: "var(--text-muted)" }}
                      aria-label={showToken ? "Hide token" : "Show token"}
                    >
                      {showToken ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label
                      className="text-xs font-medium block"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Gist ID (optional on first push)
                    </label>
                    <input
                      type="text"
                      value={gistConfig.gistId}
                      onChange={(e) =>
                        updateGistConfig({ gistId: e.target.value })
                      }
                      placeholder="Auto-filled on first push"
                      className="w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      className="text-xs font-medium block"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Backup Filename
                    </label>
                    <input
                      type="text"
                      value={gistConfig.filename}
                      onChange={(e) =>
                        updateGistConfig({ filename: e.target.value })
                      }
                      placeholder="kanso-workspace.json"
                      className="w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Manual Push & Pull Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={effectiveBusy !== null}
                  onClick={() => void quickPushGist()}
                  className="h-10 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  <CloudUpload className="w-4 h-4" />
                  <span>
                    {effectiveBusy === "push" ? "Pushing..." : "Push Now"}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={effectiveBusy !== null}
                  onClick={() => void quickPullGist()}
                  className="h-10 px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-strong)",
                    color: "var(--text-primary)",
                  }}
                >
                  <CloudDownload className="w-4 h-4" />
                  <span>
                    {effectiveBusy === "pull" ? "Pulling..." : "Instant Pull"}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={effectiveBusy !== null}
                  onClick={() => void handleFetchPullPreview()}
                  className="h-10 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span>Preview Remote</span>
                </button>
              </div>

              {gistConfig.lastSyncedAt && (
                <div
                  className="text-xs font-mono tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  Last {gistConfig.lastDirection || "sync"}:{" "}
                  {new Date(gistConfig.lastSyncedAt).toLocaleString()}
                </div>
              )}

              {syncError && (
                <div
                  className="p-3 rounded-xl border text-xs"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--danger)",
                    color: "var(--danger)",
                  }}
                >
                  {syncError}
                </div>
              )}

              {/* Pull Confirmation Preview */}
              {pullPreview && (
                <div
                  className="p-4 rounded-xl border space-y-3"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--accent)",
                  }}
                >
                  <div className="text-xs font-semibold">
                    Remote Gist Snapshot Ready
                  </div>
                  <div
                    className="text-xs space-y-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <div className="font-mono tabular-nums">
                      Updated:{" "}
                      {new Date(pullPreview.remoteUpdatedAt).toLocaleString()}
                    </div>
                    <div className="font-mono tabular-nums">
                      {pullPreview.summary.entries} entries ·{" "}
                      {pullPreview.summary.habits} habits ·{" "}
                      {pullPreview.summary.lists} lists (
                      {pullPreview.summary.listItems} items) ·{" "}
                      {pullPreview.summary.scratchpads} pads ·{" "}
                      {pullPreview.summary.customTabs} tabs
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmReplacePull}
                      className="h-8 px-3 rounded-lg text-xs font-semibold"
                      style={{
                        backgroundColor: "var(--accent)",
                        color: "var(--accent-fg)",
                      }}
                    >
                      Replace Local with Gist
                    </button>
                    <button
                      type="button"
                      onClick={() => setPullPreview(null)}
                      className="h-8 px-3 rounded-lg text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Local Offline JSON Export / Import */}
              <div
                className="pt-4 border-t space-y-2.5"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div
                  className="text-xs font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Offline Local JSON Backup
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadWorkspaceJson(workspace)}
                    className="h-9 px-3.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export JSON</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-9 px-3.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import JSON</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    onChange={handleImportJson}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Hidden fallback trigger for direct modal push */}
              <button
                type="button"
                onClick={handlePush}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
              />
            </div>
          )}

          {/* ================= WORKSPACE TAB ================= */}
          {tab === "workspace" && (
            <div className="space-y-5">
              {/* X-Active Cap */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">
                    X-Active Queue Limit
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Maximum unscheduled tasks allowed simultaneously in Focus
                    view.
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({
                        xActiveLimit: Math.max(
                          1,
                          workspace.settings.xActiveLimit - 1,
                        ),
                      })
                    }
                    className="h-8 w-8 rounded-lg border font-mono text-sm"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                    aria-label="Decrease limit"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-mono tabular-nums text-sm font-bold">
                    {workspace.settings.xActiveLimit}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({
                        xActiveLimit: Math.min(
                          10,
                          workspace.settings.xActiveLimit + 1,
                        ),
                      })
                    }
                    className="h-8 w-8 rounded-lg border font-mono text-sm"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                    aria-label="Increase limit"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Default Startup View */}
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div>
                  <div className="text-sm font-semibold">
                    Default Startup View
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Choose which workspace module opens automatically on launch.
                  </div>
                </div>
                <select
                  value={defaultView}
                  onChange={(e) =>
                    updateSettings({ defaultView: e.target.value as ViewId })
                  }
                  className="h-9 px-3 rounded-xl border text-xs font-medium outline-none cursor-pointer self-start sm:self-auto"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                >
                  {STARTUP_VIEW_OPTIONS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Timeline Display Mode */}
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div>
                  <div className="text-sm font-semibold">
                    Timeline Display Mode
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Choose row density and spine presentation in Timeline view.
                  </div>
                </div>
                <div
                  className="inline-flex items-center gap-1 p-1 rounded-lg border self-start sm:self-auto"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  {(
                    ["default", "compact", "flat"] as TimelineDisplayMode[]
                  ).map((mode) => {
                    const active =
                      (workspace.settings.timelineDisplayMode || "default") ===
                      mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          updateSettings({ timelineDisplayMode: mode })
                        }
                        className="px-3 py-1 rounded-md text-xs font-medium capitalize"
                        style={{
                          backgroundColor: active
                            ? "var(--bg-surface)"
                            : "transparent",
                          color: active
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                        }}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Default Timeline Composer Type */}
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div>
                  <div className="text-sm font-semibold">
                    Default Timeline Entry Type
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Pre-selected type when capturing items in Timeline view.
                  </div>
                </div>
                <div
                  className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg border self-start sm:self-auto"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  {TIMELINE_DEFAULT_TYPES.map((item) => {
                    const active = defaultTimelineType === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          updateSettings({ defaultTimelineType: item.id })
                        }
                        className="px-2.5 py-1 rounded-md text-xs font-medium"
                        style={{
                          backgroundColor: active
                            ? "var(--bg-surface)"
                            : "transparent",
                          color: active
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Show Sidebar Item Counts */}
              <div
                className="flex items-center justify-between gap-4 pt-4 border-t"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div>
                  <div className="text-sm font-semibold">
                    Sidebar Navigation Counts
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Display item badges next to views in the sidebar and More
                    menu.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showNavCounts}
                  onClick={() =>
                    updateSettings({ showNavCounts: !showNavCounts })
                  }
                  className="h-6 w-11 rounded-full p-0.5 transition-colors flex items-center shrink-0"
                  style={{
                    backgroundColor: showNavCounts
                      ? "var(--accent)"
                      : "var(--border-strong)",
                    justifyContent: showNavCounts ? "flex-end" : "flex-start",
                  }}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
                </button>
              </div>

              {/* Default Note Timeline Sync */}
              <div
                className="flex items-center justify-between gap-4 pt-4 border-t"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div>
                  <div className="text-sm font-semibold">
                    Auto-Sync New Notes to Timeline
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Show newly created notes on the daily Timeline spine by
                    default.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={defaultNoteTimelineSync}
                  onClick={() =>
                    updateSettings({
                      defaultNoteTimelineSync: !defaultNoteTimelineSync,
                    })
                  }
                  className="h-6 w-11 rounded-full p-0.5 transition-colors flex items-center shrink-0"
                  style={{
                    backgroundColor: defaultNoteTimelineSync
                      ? "var(--accent)"
                      : "var(--border-strong)",
                    justifyContent: defaultNoteTimelineSync
                      ? "flex-end"
                      : "flex-start",
                  }}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
                </button>
              </div>

              {/* Android Capacitor-only Library File Storage Preference */}
              {isAndroidApp && (
                <div
                  className="flex flex-col gap-3 pt-4 border-t"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <div>
                    <div className="text-sm font-semibold">
                      Android E-Book Storage Mode
                    </div>
                    <div
                      className="text-xs mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Choose whether imported e-books read directly from device
                      storage (0 B in app) or copy into app storage.
                      {androidLinkedFolderCount > 0
                        ? ` · ${androidLinkedFolderCount} linked folder${androidLinkedFolderCount === 1 ? "" : "s"}`
                        : ""}
                    </div>
                  </div>
                  <div
                    className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg border self-start"
                    style={{
                      backgroundColor: "var(--bg-surface-subtle)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    {(
                      [
                        { id: "ask", label: "Ask every time" },
                        { id: "always-link", label: "Always Link" },
                        { id: "always-copy", label: "Always Copy" },
                      ] as const
                    ).map((opt) => {
                      const active = androidImportMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setAndroidImportMode(opt.id);
                            setAndroidImportModeState(opt.id);
                          }}
                          className="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer"
                          style={{
                            backgroundColor: active
                              ? "var(--bg-surface)"
                              : "transparent",
                            color: active
                              ? "var(--text-primary)"
                              : "var(--text-muted)",
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sample Data & Reset */}
              <div
                className="pt-4 border-t space-y-3"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div>
                  <div className="text-sm font-semibold">Workspace Data</div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Clear preloaded sample entries to start fresh, or restore
                    sample data anytime.
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {!confirmClear ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClear(true)}
                      className="h-9 px-3.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--danger)",
                        color: "var(--danger)",
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear Sample / All Data</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          clearWorkspaceData();
                          setConfirmClear(false);
                        }}
                        className="h-9 px-3.5 rounded-lg text-xs font-semibold text-white"
                        style={{ backgroundColor: "var(--danger)" }}
                      >
                        Confirm Clear Everything
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClear(false)}
                        className="h-9 px-3 rounded-lg border text-xs"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      restoreSampleData();
                      setConfirmClear(false);
                    }}
                    className="h-9 px-3.5 rounded-lg border text-xs font-medium"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Restore Sample Data
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================= STORAGE TAB ================= */}
          {tab === "storage" && (
            <div className="space-y-5">
              {/* Storage Overview */}
              <div
                className="p-4 rounded-xl border space-y-3"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Database
                      className="w-4 h-4 shrink-0"
                      style={{ color: "var(--accent)" }}
                    />
                    <span className="text-sm font-semibold">
                      Browser Storage Overview
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {quota.persisted === false &&
                      typeof navigator !== "undefined" &&
                      typeof navigator.storage?.persist === "function" && (
                        <button
                          type="button"
                          onClick={() => void handleRequestPersistence()}
                          className="h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-subtle)]"
                          style={{
                            borderColor: "var(--border-subtle)",
                            color: "var(--accent)",
                          }}
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>Protect Storage</span>
                        </button>
                      )}
                    <button
                      type="button"
                      disabled={storageLoading}
                      onClick={() => void refreshStorageAudit()}
                      className="h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-subtle)] disabled:opacity-50"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${storageLoading ? "animate-spin" : ""}`}
                      />
                      <span>Scan</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div
                    className="p-3 rounded-xl border space-y-1"
                    style={{
                      backgroundColor: "var(--bg-surface-subtle)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <div
                      className="text-[11px] font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Workspace JSON
                    </div>
                    <div className="text-sm font-mono tabular-nums font-bold">
                      {formatFileSize(workspaceJsonBytes)}
                    </div>
                    <div
                      className="text-[10px] font-mono tabular-nums"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {Math.round(lsBudgetPct)}% of ~5 MB localStorage
                    </div>
                  </div>

                  <div
                    className="p-3 rounded-xl border space-y-1"
                    style={{
                      backgroundColor: "var(--bg-surface-subtle)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <div
                      className="text-[11px] font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      IndexedDB Ebooks
                    </div>
                    <div className="text-sm font-mono tabular-nums font-bold">
                      {formatFileSize(totalIndexedDbBytes)}
                    </div>
                    <div
                      className="text-[10px] font-mono tabular-nums"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {auditEntries.length} stored{" "}
                      {auditEntries.length === 1 ? "file" : "files"}
                    </div>
                  </div>

                  <div
                    className="p-3 rounded-xl border space-y-1"
                    style={{
                      backgroundColor: "var(--bg-surface-subtle)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <div
                      className="text-[11px] font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Origin Quota
                    </div>
                    <div className="text-sm font-mono tabular-nums font-bold">
                      {quota.usage !== null
                        ? formatFileSize(quota.usage)
                        : formatFileSize(
                            totalLocalStorageBytes + totalIndexedDbBytes,
                          )}
                    </div>
                    <div
                      className="text-[10px] font-mono tabular-nums"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {quota.quota !== null
                        ? `of ${formatFileSize(quota.quota)}`
                        : "Estimated total"}
                      {quota.persisted ? " · Persisted" : ""}
                    </div>
                  </div>
                </div>

                {quotaPct !== null && (
                  <div
                    className="h-1.5 w-full rounded-full overflow-hidden"
                    style={{ backgroundColor: "var(--bg-surface-subtle)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${quotaPct}%`,
                        backgroundColor: "var(--accent)",
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Workspace Domains Breakdown & Selective Purge */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">
                      Workspace Data by Module
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Inspect JSON footprint and selectively purge module data.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadWorkspaceJson(workspace)}
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Backup JSON</span>
                  </button>
                </div>

                <div
                  className="rounded-xl border divide-y overflow-hidden"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  {/* Entries */}
                  <div
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <FileText
                        className="w-4 h-4 shrink-0 mt-0.5"
                        style={{ color: "var(--text-secondary)" }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">
                          Entries (Tasks, Logs, Events, Notes)
                        </div>
                        <div
                          className="text-[11px] font-mono tabular-nums mt-0.5"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {domainMetrics.entriesCount} records ·{" "}
                          {formatFileSize(domainMetrics.entriesBytes)}
                          {domainMetrics.completedTasks > 0
                            ? ` · ${domainMetrics.completedTasks} done tasks`
                            : ""}
                          {domainMetrics.archivedNotes > 0
                            ? ` · ${domainMetrics.archivedNotes} archived notes`
                            : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-6 sm:pl-0">
                      {domainMetrics.completedTasks > 0 &&
                        renderConfirmButton(
                          "purge-done-tasks",
                          "Done Tasks",
                          () => {
                            purgeWorkspaceSection(
                              `Purged ${domainMetrics.completedTasks} completed tasks`,
                              (prev) => ({
                                ...prev,
                                entries: prev.entries.filter(
                                  (e) => !(e.type === "task" && e.completed),
                                ),
                              }),
                            );
                            setConfirmActionKey(null);
                          },
                        )}
                      {domainMetrics.archivedNotes > 0 &&
                        renderConfirmButton(
                          "purge-archived-notes",
                          "Archived Notes",
                          () => {
                            purgeWorkspaceSection(
                              `Purged ${domainMetrics.archivedNotes} archived notes`,
                              (prev) => ({
                                ...prev,
                                entries: prev.entries.filter(
                                  (e) =>
                                    !(
                                      e.type === "note" &&
                                      (e.archived ||
                                        e.noteStatus === "archived")
                                    ),
                                ),
                              }),
                            );
                            setConfirmActionKey(null);
                          },
                        )}
                      {domainMetrics.entriesCount > 0 &&
                        renderConfirmButton("purge-entries", "Clear All", () => {
                          purgeWorkspaceSection("Cleared all entries", (prev) => ({
                            ...prev,
                            entries: [],
                            habitLogs: [],
                          }));
                          setConfirmActionKey(null);
                        })}
                    </div>
                  </div>

                  {/* Focus Scratchpads & Custom Tabs */}
                  <div
                    className="p-3.5 flex items-center justify-between gap-2.5"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Sparkles
                        className="w-4 h-4 shrink-0 mt-0.5"
                        style={{ color: "var(--text-secondary)" }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">
                          Scratchpads &amp; Custom Focus Tabs
                        </div>
                        <div
                          className="text-[11px] font-mono tabular-nums mt-0.5"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {workspace.scratchpads?.length ?? 0} pads ·{" "}
                          {workspace.customTabs?.length ?? 0} tabs ·{" "}
                          {formatFileSize(domainMetrics.focusBytes)}
                        </div>
                      </div>
                    </div>
                    {domainMetrics.focusCount > 0 &&
                      renderConfirmButton("purge-focus", "Clear", () => {
                        purgeWorkspaceSection(
                          "Cleared scratchpads & custom focus tabs",
                          (prev) => ({
                            ...prev,
                            scratchpads: [],
                            customTabs: [],
                            entries: prev.entries.filter(
                              (e) => e.source !== "custom-tab",
                            ),
                          }),
                        );
                        setConfirmActionKey(null);
                      })}
                  </div>

                  {/* Habits */}
                  <div
                    className="p-3.5 flex items-center justify-between gap-2.5"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Check
                        className="w-4 h-4 shrink-0 mt-0.5"
                        style={{ color: "var(--text-secondary)" }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">
                          Habits &amp; Completion Logs
                        </div>
                        <div
                          className="text-[11px] font-mono tabular-nums mt-0.5"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {workspace.habits.length} habits ·{" "}
                          {workspace.habitLogs?.length ?? 0} logs ·{" "}
                          {formatFileSize(domainMetrics.habitsBytes)}
                        </div>
                      </div>
                    </div>
                    {domainMetrics.habitsCount > 0 &&
                      renderConfirmButton("purge-habits", "Clear", () => {
                        purgeWorkspaceSection(
                          "Cleared habits and habit logs",
                          (prev) => ({
                            ...prev,
                            habits: [],
                            habitLogs: [],
                            entries: prev.entries.filter((e) => !e.habitId),
                          }),
                        );
                        setConfirmActionKey(null);
                      })}
                  </div>

                  {/* Lists */}
                  <div
                    className="p-3.5 flex items-center justify-between gap-2.5"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <ListTodo
                        className="w-4 h-4 shrink-0 mt-0.5"
                        style={{ color: "var(--text-secondary)" }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">
                          Lists &amp; List Items
                        </div>
                        <div
                          className="text-[11px] font-mono tabular-nums mt-0.5"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {workspace.lists.length} lists ·{" "}
                          {workspace.listItems.length} items ·{" "}
                          {formatFileSize(domainMetrics.listsBytes)}
                        </div>
                      </div>
                    </div>
                    {domainMetrics.listsCount > 0 &&
                      renderConfirmButton("purge-lists", "Clear", () => {
                        purgeWorkspaceSection(
                          "Cleared all lists & items",
                          (prev) => ({
                            ...prev,
                            lists: [],
                            listItems: [],
                            entries: prev.entries.map((e) => ({
                              ...e,
                              listIds: [],
                            })),
                          }),
                        );
                        setConfirmActionKey(null);
                      })}
                  </div>

                  {/* Streamer */}
                  <div
                    className="p-3.5 flex items-center justify-between gap-2.5"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <MonitorPlay
                        className="w-4 h-4 shrink-0 mt-0.5"
                        style={{ color: "var(--text-secondary)" }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">
                          Streamer Vault &amp; Presets
                        </div>
                        <div
                          className="text-[11px] font-mono tabular-nums mt-0.5"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {workspace.streams.length} streams ·{" "}
                          {workspace.streamPresets.length} presets ·{" "}
                          {formatFileSize(domainMetrics.streamerBytes)}
                        </div>
                      </div>
                    </div>
                    {domainMetrics.streamerCount > 0 &&
                      renderConfirmButton("purge-streamer", "Clear", () => {
                        purgeWorkspaceSection(
                          "Cleared Streamer vault & presets",
                          (prev) => ({
                            ...prev,
                            streams: [],
                            streamFolders: [],
                            streamPresets: [],
                            streamerState: {
                              ...prev.streamerState,
                              activeSlots: [],
                              activeStreamIds: [],
                              spotlightStreamId: null,
                              activePresetId: null,
                            },
                          }),
                        );
                        setConfirmActionKey(null);
                      })}
                  </div>

                  {/* Library Metadata */}
                  <div
                    className="p-3.5 flex items-center justify-between gap-2.5"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <BookOpen
                        className="w-4 h-4 shrink-0 mt-0.5"
                        style={{ color: "var(--text-secondary)" }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">
                          Library Catalog, Bookmarks &amp; Highlights
                        </div>
                        <div
                          className="text-[11px] font-mono tabular-nums mt-0.5"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {workspace.books.length} books ·{" "}
                          {workspace.bookBookmarks?.length ?? 0} bookmarks ·{" "}
                          {workspace.bookHighlights?.length ?? 0} highlights ·{" "}
                          {formatFileSize(domainMetrics.libraryMetaBytes)}
                        </div>
                      </div>
                    </div>
                    {domainMetrics.libraryMetaCount > 0 &&
                      renderConfirmButton("purge-library-all", "Clear", () => {
                        void (async () => {
                          await libraryDb.clearAllData();
                          pruneMissingBookVoicePreferences(new Set());
                          purgeWorkspaceSection(
                            "Cleared Library books, annotations & files",
                            (prev) => ({
                              ...prev,
                              books: [],
                              libraryFolders: [],
                              libraryCategories: [],
                              libraryViewFolders: [],
                              bookBookmarks: [],
                              bookHighlights: [],
                            }),
                          );
                          setConfirmActionKey(null);
                          await refreshStorageAudit();
                        })();
                      })}
                  </div>
                </div>
              </div>

              {/* IndexedDB Ebook Binary Files */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">
                      Stored Ebook Files (IndexedDB)
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Offline PDF, EPUB &amp; MOBI binaries stored locally on
                      this device.
                    </div>
                  </div>
                  {auditEntries.length > 0 &&
                    renderConfirmButton(
                      "clear-all-blobs",
                      "Clear All Files",
                      () => void handleClearAllBookFiles(),
                      storageBusyKey !== null,
                    )}
                </div>

                {orphanBlobs.length > 0 && (
                  <div
                    className="p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2"
                    style={{
                      backgroundColor: "var(--bg-surface-subtle)",
                      borderColor: "var(--accent)",
                    }}
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <AlertTriangle
                        className="w-4 h-4 shrink-0"
                        style={{ color: "var(--accent)" }}
                      />
                      <span>
                        <strong>{orphanBlobs.length}</strong> orphaned binary{" "}
                        {orphanBlobs.length === 1 ? "file" : "files"} (
                        {formatFileSize(orphanBytes)}) not linked to any book.
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={storageBusyKey !== null}
                      onClick={() => void handleCleanOrphans()}
                      className="h-7 px-2.5 rounded-lg text-[11px] font-semibold disabled:opacity-50"
                      style={{
                        backgroundColor: "var(--accent)",
                        color: "var(--accent-fg)",
                      }}
                    >
                      {storageBusyKey === "clean-orphans"
                        ? "Cleaning..."
                        : "Clean Orphans"}
                    </button>
                  </div>
                )}

                {auditEntries.length === 0 ? (
                  <div
                    className="p-4 rounded-xl border text-center text-xs"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-muted)",
                    }}
                  >
                    No binary ebook files stored in IndexedDB.
                  </div>
                ) : (
                  <div
                    className="rounded-xl border divide-y max-h-56 overflow-y-auto"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    {auditEntries
                      .slice()
                      .sort((a, b) => b.byteLength - a.byteLength)
                      .map((entry) => {
                        const book = bookMap.get(entry.bookId);
                        const isOrphan = !book;
                        return (
                          <div
                            key={entry.bookId}
                            className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                            style={{ borderColor: "var(--border-subtle)" }}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">
                                {book
                                  ? book.title
                                  : `Orphaned blob (${entry.bookId})`}
                              </div>
                              <div
                                className="text-[11px] font-mono tabular-nums truncate"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {formatFileSize(entry.byteLength)}
                                {book
                                  ? ` · ${book.format.toUpperCase()} · ${book.fileName}`
                                  : " · Unlinked"}
                              </div>
                            </div>
                            {renderConfirmButton(
                              `blob-${entry.bookId}`,
                              isOrphan ? "Delete Blob" : "Delete Book",
                              () =>
                                void handleDeleteStoredBookOrBlob(entry.bookId),
                              storageBusyKey === `blob-${entry.bookId}`,
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* LocalStorage Keys & Preferences */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">
                      LocalStorage Keys &amp; View Preferences
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Inspect raw browser keys including saved filters, voice
                      overrides, and sync credentials.
                    </div>
                  </div>
                  {localKeys.some(
                    (k) =>
                      k.key !== "kanso_workspace_v1" &&
                      k.key !== "kanso_gist_config_v1",
                  ) &&
                    renderConfirmButton(
                      "clear-view-prefs",
                      "Reset View Prefs",
                      handleClearViewPreferences,
                    )}
                </div>

                <div
                  className="rounded-xl border divide-y overflow-hidden"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  {localKeys.map((item) => {
                    const isPrimaryWorkspace =
                      item.key === "kanso_workspace_v1";
                    return (
                      <div
                        key={item.key}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                        style={{ borderColor: "var(--border-subtle)" }}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">
                            {item.label}
                          </div>
                          <div
                            className="text-[10px] font-mono tabular-nums truncate"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {item.key} · {formatFileSize(item.bytes)}
                          </div>
                        </div>
                        {isPrimaryWorkspace ? (
                          <span
                            className="text-[10px] font-mono px-2 py-0.5 rounded-md border shrink-0"
                            style={{
                              borderColor: "var(--border-subtle)",
                              color: "var(--text-muted)",
                            }}
                          >
                            Active DB
                          </span>
                        ) : (
                          renderConfirmButton(
                            `ls-${item.key}`,
                            "Remove",
                            () => handleRemoveLocalStorageKey(item.key),
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
