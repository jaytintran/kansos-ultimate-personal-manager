import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  Brain,
  Code2,
  Download,
  ExternalLink,
  FolderOpen,
  LayoutGrid,
  List,
  MessageSquareText,
  PanelLeftOpen,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useWorkspace } from "../context/WorkspaceContext";
import { aiVaultDb, AI_VAULT_BODY_CHANGE_EVENT } from "../lib/db";
import { buildSearchFieldsForChat } from "../lib/aiVaultParser";
import type {
  AiChatBodyRecord,
  AiChatFolder,
  AiChatRecord,
  AiPlatform,
  AiVaultJumpRequest,
} from "../types/aiVault";
import type { BookNoteLink } from "../types";
import {
  AiVaultSidebar,
  type AiVaultScope,
} from "../components/ai-vault/AiVaultSidebar";
import { AiVaultTabStrip } from "../components/ai-vault/AiVaultTabStrip";
import {
  AiVaultReader,
  type AiReaderFont,
  type AiReaderWidth,
} from "../components/ai-vault/AiVaultReader";
import {
  AiVaultImportModal,
  type ImportedAiChatPayload,
} from "../components/ai-vault/AiVaultImportModal";
import type { AiOutlineMode } from "../components/ai-vault/AiVaultOutline";
import type { AiConnectionMode } from "../components/ai-vault/AiVaultConnectionsPanel";
import {
  AI_PLATFORM_LIST,
  AI_PLATFORM_META,
  formatAiChatDate,
  getAiFolderDescendantIds,
} from "../components/ai-vault/aiVaultUiUtils";
import { NotePageIcon, SHARED_ICON_CATALOG } from "../components/IconLibrary";

const AI_VAULT_PREFS_KEY = "kanso_ai_vault_prefs_v1";

type AiVaultDisplayMode = "grid" | "table";
type AiVaultSortKey = "updated" | "chatDate" | "turns" | "title";
type AiVaultSearchScope = "all" | "prompts" | "replies";

interface AiVaultPrefs {
  sidebarWidth: number;
  sidebarCollapsedDesktop: boolean;
  displayMode: AiVaultDisplayMode;
  sortKey: AiVaultSortKey;
  readerWidth: AiReaderWidth;
  readerFont: AiReaderFont;
  outlineMode: AiOutlineMode;
  connOpenDesktop: boolean;
  connMode: AiConnectionMode;
  openTabIds: string[];
  activeTabId: string | null;
}

const DEFAULT_PREFS: AiVaultPrefs = {
  sidebarWidth: 256,
  sidebarCollapsedDesktop: false,
  displayMode: "grid",
  sortKey: "updated",
  readerWidth: "normal",
  readerFont: "sans",
  outlineMode: "full",
  connOpenDesktop: false,
  connMode: "tree",
  openTabIds: [],
  activeTabId: null,
};

function loadPrefs(): AiVaultPrefs {
  try {
    const raw = localStorage.getItem(AI_VAULT_PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<AiVaultPrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

interface AiVaultViewProps {
  onJumpToNote?: (noteId: string) => void;
  onJumpToBookLocation?: (bookLink: BookNoteLink) => void;
  aiVaultJumpRequest?: AiVaultJumpRequest | null;
}

export const AiVaultView: React.FC<AiVaultViewProps> = ({
  onJumpToNote,
  onJumpToBookLocation,
  aiVaultJumpRequest,
}) => {
  const {
    workspace,
    pushToast,
    addAiChat,
    updateAiChat,
    deleteAiChat,
    addAiChatFolder,
    updateAiChatFolder,
    deleteAiChatFolder,
    reorderAiChatFolders,
    toggleAiChatNoteLink,
    toggleAiChatBookLink,
  } = useWorkspace();

  const chats = useMemo(() => workspace.aiChats ?? [], [workspace.aiChats]);
  const folders = useMemo(
    () => workspace.aiChatFolders ?? [],
    [workspace.aiChatFolders],
  );
  const allNotes = useMemo(
    () => workspace.entries.filter((e) => e.type === "note"),
    [workspace.entries],
  );
  const allBooks = useMemo(() => workspace.books || [], [workspace.books]);

  const [prefs, setPrefs] = useState<AiVaultPrefs>(loadPrefs);
  const [scope, setScope] = useState<AiVaultScope>({ kind: "all" });
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<AiVaultSearchScope>("all");
  const [platformFilter, setPlatformFilter] = useState<AiPlatform | "all">("all");
  const [onlyWithCode, setOnlyWithCode] = useState(false);
  const [onlyAnnotated, setOnlyAnnotated] = useState(false);

  // Local IndexedDB bodies cache for full-text search across turns & code
  const [bodiesById, setBodiesById] = useState<Map<string, AiChatBodyRecord>>(
    () => new Map(),
  );

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [reimportChat, setReimportChat] = useState<AiChatRecord | null>(null);
  const [folderModal, setFolderModal] = useState<{
    mode: "create" | "edit";
    parentId: string | null;
    folder?: AiChatFolder;
    name: string;
    icon: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "chat"; chat: AiChatRecord }
    | { kind: "folder"; folder: AiChatFolder }
    | null
  >(null);

  const updatePrefs = useCallback(
    (patch: Partial<AiVaultPrefs> | ((prev: AiVaultPrefs) => AiVaultPrefs)) => {
      setPrefs((prev) => {
        const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
        try {
          localStorage.setItem(AI_VAULT_PREFS_KEY, JSON.stringify(next));
        } catch {
          // ignore storage quota errors
        }
        return next;
      });
    },
    [],
  );

  const refreshBodiesCache = useCallback(async () => {
    const all = await aiVaultDb.getAllBodies();
    const map = new Map<string, AiChatBodyRecord>();
    for (const b of all) map.set(b.chatId, b);
    setBodiesById(map);
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      void refreshBodiesCache();
    }
  }, [searchQuery, refreshBodiesCache]);

  useEffect(() => {
    const onBodyChange = () => {
      if (searchQuery.trim()) {
        void refreshBodiesCache();
      }
    };
    window.addEventListener(AI_VAULT_BODY_CHANGE_EVENT, onBodyChange);
    return () =>
      window.removeEventListener(AI_VAULT_BODY_CHANGE_EVENT, onBodyChange);
  }, [searchQuery, refreshBodiesCache]);

  const chatById = useMemo(() => new Map(chats.map((c) => [c.id, c])), [chats]);
  const openChats = useMemo(
    () =>
      prefs.openTabIds
        .map((id) => chatById.get(id))
        .filter((c): c is AiChatRecord => Boolean(c)),
    [prefs.openTabIds, chatById],
  );
  const activeChat = useMemo(
    () => (prefs.activeTabId ? chatById.get(prefs.activeTabId) ?? null : null),
    [prefs.activeTabId, chatById],
  );

  const openChatTab = useCallback(
    (chatId: string) => {
      updatePrefs((prev) => {
        const nextTabs = prev.openTabIds.includes(chatId)
          ? prev.openTabIds
          : [...prev.openTabIds, chatId].slice(-12);
        return { ...prev, openTabIds: nextTabs, activeTabId: chatId };
      });
    },
    [updatePrefs],
  );

  useEffect(() => {
    if (!aiVaultJumpRequest) return;
    if (chatById.has(aiVaultJumpRequest.chatId)) {
      openChatTab(aiVaultJumpRequest.chatId);
    }
  }, [aiVaultJumpRequest, chatById, openChatTab]);

  const scopeTitle = useMemo(() => {
    switch (scope.kind) {
      case "all":
        return "All AI Chats";
      case "favorites":
        return "Favorites";
      case "unfiled":
        return "Unfiled";
      case "folder":
        return (
          folders.find((f) => f.id === scope.folderId)?.name || "Folder"
        );
      case "model":
        return scope.modelName;
      case "topic":
        return `# ${scope.topic}`;
    }
  }, [scope, folders]);

  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const folderIdsInScope =
      scope.kind === "folder"
        ? getAiFolderDescendantIds(folders, scope.folderId)
        : null;

    const list = chats.filter((chat) => {
      if (scope.kind === "favorites" && !chat.favorite) return false;
      if (scope.kind === "unfiled" && chat.folderId) return false;
      if (
        scope.kind === "folder" &&
        folderIdsInScope &&
        (!chat.folderId || !folderIdsInScope.has(chat.folderId))
      ) {
        return false;
      }
      if (scope.kind === "model") {
        const chatModel =
          (chat.model || "").trim() || AI_PLATFORM_META[chat.platform].label;
        if (chat.platform !== scope.platform || chatModel !== scope.modelName) {
          return false;
        }
      }
      if (scope.kind === "topic" && (chat.topic || "").trim() !== scope.topic) {
        return false;
      }

      if (platformFilter !== "all" && chat.platform !== platformFilter) {
        return false;
      }
      if (onlyWithCode && !chat.hasCode) return false;
      if (onlyAnnotated && chat.annotationCount === 0) return false;

      if (q) {
        const body = bodiesById.get(chat.id);
        const metaMatch = [
          chat.title,
          chat.model,
          chat.topic || "",
          chat.tags.join(" "),
          chat.previewPrompt || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);

        if (searchScope === "prompts") {
          const promptHit = body?.searchPromptText?.includes(q);
          if (!promptHit && !metaMatch) return false;
        } else if (searchScope === "replies") {
          const replyHit = body?.searchReplyText?.includes(q);
          if (!replyHit && !metaMatch) return false;
        } else {
          const bodyHit = body?.searchText?.includes(q);
          if (!bodyHit && !metaMatch) return false;
        }
      }

      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (prefs.sortKey === "title") {
        return (a.title || "").localeCompare(b.title || "");
      }
      if (prefs.sortKey === "turns") {
        return (b.turnCount || 0) - (a.turnCount || 0);
      }
      if (prefs.sortKey === "chatDate") {
        return (b.chatDate || b.createdAt).localeCompare(a.chatDate || a.createdAt);
      }
      return (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt);
    });
    return sorted;
  }, [
    chats,
    folders,
    scope,
    platformFilter,
    onlyWithCode,
    onlyAnnotated,
    searchQuery,
    searchScope,
    bodiesById,
    prefs.sortKey,
  ]);

  const handleSaveImportedChats = async (items: ImportedAiChatPayload[]) => {
    if (reimportChat && items.length === 1) {
      const item = items[0];
      const now = new Date().toISOString();
      const stats = buildSearchFieldsForChat(item.turns, item.annotations);
      await aiVaultDb.saveBody({
        chatId: reimportChat.id,
        turns: item.turns,
        annotations: item.annotations,
        searchText: stats.searchText,
        searchPromptText: stats.searchPromptText,
        searchReplyText: stats.searchReplyText,
        updatedAt: now,
      });
      updateAiChat(reimportChat.id, {
        title: item.title || reimportChat.title,
        platform: item.platform,
        model: item.model,
        topic: item.topic || "",
        folderId: item.folderId,
        tags: item.tags,
        sourceUrl: item.sourceUrl || "",
        chatDate: item.chatDate || null,
        turnCount: item.turns.length,
        annotationCount: item.annotations.length,
        hasCode: stats.hasCode,
        previewPrompt: stats.previewPrompt,
      });
      setReimportChat(null);
      openChatTab(reimportChat.id);
      pushToast("Transcript populated on this device", "success");
      return;
    }

    let lastCreatedId: string | null = null;
    for (const item of items) {
      const stats = buildSearchFieldsForChat(item.turns, item.annotations);
      const created = addAiChat({
        title: item.title,
        platform: item.platform,
        model: item.model,
        topic: item.topic || "",
        folderId: item.folderId,
        tags: item.tags,
        favorite: false,
        sourceUrl: item.sourceUrl || "",
        chatDate: item.chatDate || null,
        turnCount: item.turns.length,
        annotationCount: item.annotations.length,
        hasCode: stats.hasCode,
        previewPrompt: stats.previewPrompt,
        linkedNoteIds: [],
        linkedBookIds: [],
      });
      await aiVaultDb.saveBody({
        chatId: created.id,
        turns: item.turns,
        annotations: item.annotations,
        searchText: stats.searchText,
        searchPromptText: stats.searchPromptText,
        searchReplyText: stats.searchReplyText,
        updatedAt: created.updatedAt,
      });
      lastCreatedId = created.id;
    }

    if (items.length === 1 && lastCreatedId) {
      openChatTab(lastCreatedId);
      pushToast("Saved AI conversation", "success");
    } else if (items.length > 1) {
      pushToast(`Imported ${items.length} AI conversations`, "success");
    }
  };

  const handleExportVaultBackup = async () => {
    const bodies = await aiVaultDb.getAllBodies();
    const bodyMap = new Map(bodies.map((b) => [b.chatId, b]));
    const payload = {
      format: "kanso-ai-vault-v1",
      exportedAt: new Date().toISOString(),
      folders,
      items: chats.map((meta) => ({
        meta,
        body: bodyMap.get(meta.id) || {
          chatId: meta.id,
          turns: [],
          annotations: [],
          searchText: "",
          updatedAt: meta.updatedAt,
        },
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kanso-ai-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    pushToast("Exported AI Vault backup JSON", "success");
  };

  const folderById = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders],
  );

  const iconChoices = useMemo(
    () => SHARED_ICON_CATALOG.slice(0, 14).map((i) => i.key),
    [],
  );

  return (
    <div
      className="flex-1 min-h-0 h-full lg:h-dvh flex overflow-hidden"
      style={{ backgroundColor: "var(--bg-canvas)" }}
    >
      <AiVaultSidebar
        chats={chats}
        folders={folders}
        scope={scope}
        width={prefs.sidebarWidth}
        isCollapsedDesktop={prefs.sidebarCollapsedDesktop}
        isMobileDrawerOpen={mobileDrawerOpen}
        onWidthChange={(w) => updatePrefs({ sidebarWidth: w })}
        onCollapseDesktop={() => updatePrefs({ sidebarCollapsedDesktop: true })}
        onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
        onSelectScope={(s) => {
          setScope(s);
          updatePrefs({ activeTabId: null });
        }}
        onCreateFolder={(parentId) =>
          setFolderModal({
            mode: "create",
            parentId,
            name: "",
            icon: "Folder",
          })
        }
        onEditFolder={(folder) =>
          setFolderModal({
            mode: "edit",
            parentId: folder.parentId ?? null,
            folder,
            name: folder.name,
            icon: folder.icon || "Folder",
          })
        }
        onDeleteFolder={(folder) =>
          setConfirmDelete({ kind: "folder", folder })
        }
        onReorderFolder={reorderAiChatFolders}
        onMoveChatToFolder={(chatId, folderId) => {
          updateAiChat(chatId, { folderId });
          pushToast("Moved conversation", "success");
        }}
      />

      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
        <AiVaultTabStrip
          openChats={openChats}
          activeTabId={activeChat ? activeChat.id : null}
          homeTabLabel={scopeTitle}
          onSelectHome={() => updatePrefs({ activeTabId: null })}
          onSelectTab={(chatId) => openChatTab(chatId)}
          onCloseTab={(chatId) => {
            updatePrefs((prev) => {
              const remaining = prev.openTabIds.filter((id) => id !== chatId);
              const nextActive =
                prev.activeTabId === chatId
                  ? remaining[remaining.length - 1] ?? null
                  : prev.activeTabId;
              return { ...prev, openTabIds: remaining, activeTabId: nextActive };
            });
          }}
          onCloseOtherTabs={(keepId) =>
            updatePrefs({ openTabIds: [keepId], activeTabId: keepId })
          }
          onCloseAllTabs={() =>
            updatePrefs({ openTabIds: [], activeTabId: null })
          }
          onReorderTabs={(draggedId, targetId, position) => {
            updatePrefs((prev) => {
              const copy = prev.openTabIds.filter((id) => id !== draggedId);
              const idx = copy.indexOf(targetId);
              if (idx === -1) return prev;
              copy.splice(position === "before" ? idx : idx + 1, 0, draggedId);
              return { ...prev, openTabIds: copy };
            });
          }}
          onNewChat={() => {
            setReimportChat(null);
            setImportModalOpen(true);
          }}
        />

        {activeChat ? (
          <AiVaultReader
            key={activeChat.id}
            chat={activeChat}
            folders={folders}
            allNotes={allNotes}
            allBooks={allBooks}
            sidebarCollapsedDesktop={prefs.sidebarCollapsedDesktop}
            connOpenDesktop={prefs.connOpenDesktop}
            connMode={prefs.connMode}
            outlineMode={prefs.outlineMode}
            readerWidth={prefs.readerWidth}
            readerFont={prefs.readerFont}
            onExpandDesktopSidebar={() =>
              updatePrefs({ sidebarCollapsedDesktop: false })
            }
            onToggleConnDesktop={() =>
              updatePrefs((p) => ({ ...p, connOpenDesktop: !p.connOpenDesktop }))
            }
            onConnModeChange={(connMode) => updatePrefs({ connMode })}
            onToggleOutlineMode={() =>
              updatePrefs((p) => ({
                ...p,
                outlineMode: p.outlineMode === "full" ? "compact" : "full",
              }))
            }
            onReaderWidthChange={(readerWidth) => updatePrefs({ readerWidth })}
            onReaderFontChange={(readerFont) => updatePrefs({ readerFont })}
            onUpdateChatMeta={updateAiChat}
            onToggleNoteLink={(noteId) =>
              toggleAiChatNoteLink(activeChat.id, noteId)
            }
            onToggleBookLink={(bookId) =>
              toggleAiChatBookLink(activeChat.id, bookId)
            }
            onDeleteChat={(c) => setConfirmDelete({ kind: "chat", chat: c })}
            onRequestRepopulate={(c) => {
              setReimportChat(c);
              setImportModalOpen(true);
            }}
            onJumpToNote={onJumpToNote}
            onJumpToBookLocation={onJumpToBookLocation}
            onNotify={pushToast}
          />
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div
              className="shrink-0 px-4 sm:px-6 lg:px-8 pt-4 pb-3 border-b space-y-3"
              style={{
                backgroundColor: "var(--bg-canvas)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setMobileDrawerOpen(true)}
                    aria-label="Open AI Vault folders"
                    className="lg:hidden h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-[var(--bg-surface-hover)] shrink-0"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>

                  {prefs.sidebarCollapsedDesktop && (
                    <button
                      type="button"
                      onClick={() =>
                        updatePrefs({ sidebarCollapsedDesktop: false })
                      }
                      title="Show AI Vault sidebar"
                      aria-label="Show AI Vault sidebar"
                      className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg border hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <PanelLeftOpen className="w-4 h-4" />
                    </button>
                  )}

                  <div className="flex items-baseline gap-2.5 min-w-0">
                    <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight truncate">
                      {scopeTitle}
                    </h1>
                    <span
                      className="text-xs font-mono tabular-nums shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {filteredChats.length}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {chats.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleExportVaultBackup()}
                      title="Export full AI Vault JSON backup"
                      className="hidden sm:inline-flex h-8 px-2.5 rounded-lg border text-xs font-medium items-center gap-1.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Backup</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setReimportChat(null);
                      setImportModalOpen(true);
                    }}
                    className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "var(--accent-fg)",
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New AI Chat</span>
                  </button>
                </div>
              </header>

              {/* Full-Text Search + Filter & Display Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="flex-1 min-w-[210px] h-8 px-2.5 rounded-lg border flex items-center gap-2"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <Search
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search conversations, code snippets, tags, topics..."
                    className="flex-1 min-w-0 bg-transparent text-xs outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear search"
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div
                  className="inline-flex items-center p-0.5 rounded-lg border"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  {(["all", "prompts", "replies"] as AiVaultSearchScope[]).map(
                    (sc) => (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => setSearchScope(sc)}
                        className="px-2 py-1 rounded-md text-[11px] font-medium capitalize cursor-pointer"
                        style={{
                          backgroundColor:
                            searchScope === sc
                              ? "var(--bg-surface)"
                              : "transparent",
                          color:
                            searchScope === sc
                              ? "var(--text-primary)"
                              : "var(--text-muted)",
                        }}
                      >
                        {sc}
                      </button>
                    ),
                  )}
                </div>

                <select
                  value={platformFilter}
                  onChange={(e) =>
                    setPlatformFilter(e.target.value as AiPlatform | "all")
                  }
                  aria-label="Filter by platform"
                  className="h-8 px-2 rounded-lg border text-xs outline-none cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <option value="all">All Platforms</option>
                  {AI_PLATFORM_LIST.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setOnlyWithCode((v) => !v)}
                  className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  style={{
                    backgroundColor: onlyWithCode
                      ? "var(--accent-soft)"
                      : "var(--bg-surface)",
                    borderColor: onlyWithCode
                      ? "var(--accent)"
                      : "var(--border-subtle)",
                    color: onlyWithCode
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                  }}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Code</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOnlyAnnotated((v) => !v)}
                  className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  style={{
                    backgroundColor: onlyAnnotated
                      ? "var(--accent-soft)"
                      : "var(--bg-surface)",
                    borderColor: onlyAnnotated
                      ? "var(--accent)"
                      : "var(--border-subtle)",
                    color: onlyAnnotated
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                  }}
                >
                  <MessageSquareText className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Notes</span>
                </button>

                <div className="inline-flex items-center gap-1">
                  <ArrowDownUp
                    className="w-3.5 h-3.5 hidden sm:block"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <select
                    value={prefs.sortKey}
                    onChange={(e) =>
                      updatePrefs({ sortKey: e.target.value as AiVaultSortKey })
                    }
                    aria-label="Sort conversations"
                    className="h-8 px-2 rounded-lg border text-xs outline-none cursor-pointer"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <option value="updated">Updated</option>
                    <option value="chatDate">Chat Date</option>
                    <option value="turns">Most Turns</option>
                    <option value="title">Title</option>
                  </select>
                </div>

                <div
                  className="inline-flex items-center p-0.5 rounded-lg border"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => updatePrefs({ displayMode: "grid" })}
                    aria-label="Grid cards view"
                    title="Grid Cards"
                    className="h-6 w-7 flex items-center justify-center rounded-md cursor-pointer"
                    style={{
                      backgroundColor:
                        prefs.displayMode === "grid"
                          ? "var(--bg-surface)"
                          : "transparent",
                      color:
                        prefs.displayMode === "grid"
                          ? "var(--accent)"
                          : "var(--text-muted)",
                    }}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updatePrefs({ displayMode: "table" })}
                    aria-label="Compact table view"
                    title="Compact Table"
                    className="h-6 w-7 flex items-center justify-center rounded-md cursor-pointer"
                    style={{
                      backgroundColor:
                        prefs.displayMode === "table"
                          ? "var(--bg-surface)"
                          : "transparent",
                      color:
                        prefs.displayMode === "table"
                          ? "var(--accent)"
                          : "var(--text-muted)",
                    }}
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-5">
              {filteredChats.length === 0 ? (
                <div
                  className="max-w-md mx-auto my-12 rounded-2xl border p-7 text-center space-y-3"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <Brain
                    className="w-8 h-8 mx-auto opacity-75"
                    style={{ color: "var(--accent)" }}
                  />
                  <div className="space-y-1">
                    <h2 className="font-display text-base font-semibold">
                      {chats.length === 0
                        ? "Archive your best AI conversations"
                        : "No matching AI conversations"}
                    </h2>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {chats.length === 0
                        ? "Paste multi-turn threads from ChatGPT, Claude, Gemini, or Perplexity, highlight key insights in the margin, and connect them to your Notes and Books."
                        : "Try clearing a filter or broadening your search terms."}
                    </p>
                  </div>
                  {chats.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setReimportChat(null);
                        setImportModalOpen(true);
                      }}
                      className="h-8 px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      style={{
                        backgroundColor: "var(--accent)",
                        color: "var(--accent-fg)",
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>New AI Chat</span>
                    </button>
                  )}
                </div>
              ) : prefs.displayMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5 pb-12">
                  {filteredChats.map((chat) => {
                    const pInfo =
                      AI_PLATFORM_META[chat.platform] || AI_PLATFORM_META.other;
                    const folderName = chat.folderId
                      ? folderById.get(chat.folderId)?.name
                      : null;

                    return (
                      <div
                        key={chat.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            "application/x-kanso-ai-chat-id",
                            chat.id,
                          );
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => openChatTab(chat.id)}
                        className="group rounded-xl border p-4 flex flex-col justify-between gap-3 transition-colors hover:border-[var(--accent)] cursor-pointer"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                        }}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span
                              className="inline-flex items-center gap-1.5 font-medium truncate"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: pInfo.dotColor }}
                              />
                              <span className="truncate">
                                {chat.model || pInfo.label}
                              </span>
                            </span>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className="font-mono tabular-nums"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {chat.turnCount} turns
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateAiChat(chat.id, {
                                    favorite: !chat.favorite,
                                  });
                                }}
                                aria-label="Toggle favorite"
                                className="h-5 w-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                              >
                                <Star
                                  className={`w-3.5 h-3.5 ${
                                    chat.favorite
                                      ? "fill-amber-400 text-amber-400"
                                      : "opacity-40 group-hover:opacity-100"
                                  }`}
                                />
                              </button>
                            </div>
                          </div>

                          <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                            {chat.title || "Untitled AI Chat"}
                          </h3>

                          {chat.previewPrompt && (
                            <p
                              className="text-xs leading-relaxed line-clamp-3"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {chat.previewPrompt}
                            </p>
                          )}
                        </div>

                        <div
                          className="pt-2 border-t flex items-center justify-between gap-2 text-[11px]"
                          style={{
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-muted)",
                          }}
                        >
                          <span className="truncate font-mono">
                            {[
                              chat.topic,
                              folderName,
                              ...chat.tags.slice(0, 3).map((t) => `#${t}`),
                            ]
                              .filter(Boolean)
                              .join(" · ") || pInfo.label}
                          </span>

                          <div className="flex items-center gap-1 shrink-0">
                            {chat.chatDate && (
                              <span className="font-mono tabular-nums">
                                {formatAiChatDate(chat.chatDate)}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete({ kind: "chat", chat });
                              }}
                              aria-label="Delete AI chat"
                              className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                              style={{ color: "var(--danger)" }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  className="rounded-xl border overflow-x-auto mb-12"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr
                        className="border-b text-left text-[11px]"
                        style={{
                          backgroundColor: "var(--bg-surface-subtle)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-muted)",
                        }}
                      >
                        <th className="py-2.5 px-3 font-semibold">Title</th>
                        <th className="py-2.5 px-3 font-semibold">Model</th>
                        <th className="py-2.5 px-3 font-semibold hidden md:table-cell">
                          Topic & Tags
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-right">
                          Turns
                        </th>
                        <th className="py-2.5 px-3 font-semibold hidden sm:table-cell text-right">
                          Date
                        </th>
                        <th className="py-2.5 px-2 w-16" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {filteredChats.map((chat) => {
                        const pInfo =
                          AI_PLATFORM_META[chat.platform] ||
                          AI_PLATFORM_META.other;
                        return (
                          <tr
                            key={chat.id}
                            onClick={() => openChatTab(chat.id)}
                            className="group hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                          >
                            <td className="py-2.5 px-3 font-medium max-w-[300px]">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="truncate">
                                  {chat.title || "Untitled AI Chat"}
                                </span>
                                {chat.sourceUrl && (
                                  <ExternalLink
                                    className="w-3 h-3 shrink-0 opacity-45"
                                    aria-hidden="true"
                                  />
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: pInfo.dotColor }}
                                />
                                <span>{chat.model || pInfo.label}</span>
                              </span>
                            </td>
                            <td
                              className="py-2.5 px-3 hidden md:table-cell max-w-[240px] truncate font-mono text-[11px]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {[
                                chat.topic,
                                ...chat.tags.slice(0, 3).map((t) => `#${t}`),
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </td>
                            <td
                              className="py-2.5 px-3 text-right font-mono tabular-nums"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {chat.turnCount}
                            </td>
                            <td
                              className="py-2.5 px-3 hidden sm:table-cell text-right font-mono tabular-nums"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {formatAiChatDate(chat.chatDate || chat.createdAt)}
                            </td>
                            <td className="py-2.5 px-2">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateAiChat(chat.id, {
                                      favorite: !chat.favorite,
                                    });
                                  }}
                                  aria-label="Toggle favorite"
                                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] cursor-pointer"
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      chat.favorite
                                        ? "fill-amber-400 text-amber-400"
                                        : "opacity-45"
                                    }`}
                                  />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDelete({ kind: "chat", chat });
                                  }}
                                  aria-label="Delete AI chat"
                                  className="h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-surface)] cursor-pointer"
                                  style={{ color: "var(--danger)" }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {importModalOpen && (
        <AiVaultImportModal
          open={importModalOpen}
          folders={folders}
          defaultFolderId={scope.kind === "folder" ? scope.folderId : null}
          reimportTarget={
            reimportChat
              ? {
                  id: reimportChat.id,
                  title: reimportChat.title,
                  platform: reimportChat.platform,
                  model: reimportChat.model,
                  topic: reimportChat.topic,
                  folderId: reimportChat.folderId,
                  tags: reimportChat.tags,
                  sourceUrl: reimportChat.sourceUrl,
                  chatDate: reimportChat.chatDate,
                }
              : null
          }
          onClose={() => {
            setImportModalOpen(false);
            setReimportChat(null);
          }}
          onSaveConversations={(items) => void handleSaveImportedChats(items)}
        />
      )}

      {folderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setFolderModal(null)}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const cleanName = folderModal.name.trim();
              if (!cleanName) return;
              if (folderModal.mode === "create") {
                addAiChatFolder(
                  cleanName,
                  folderModal.parentId,
                  folderModal.icon,
                );
                pushToast("Folder created", "success");
              } else if (folderModal.folder) {
                updateAiChatFolder(folderModal.folder.id, {
                  name: cleanName,
                  icon: folderModal.icon,
                });
                pushToast("Folder updated", "success");
              }
              setFolderModal(null);
            }}
            className="relative z-10 w-full max-w-sm rounded-2xl border p-5 space-y-4"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {folderModal.mode === "create"
                  ? "New AI Vault Folder"
                  : "Edit Folder"}
              </h2>
              <button
                type="button"
                onClick={() => setFolderModal(null)}
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label
                className="block text-xs font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Folder Name
              </label>
              <input
                type="text"
                value={folderModal.name}
                onChange={(e) =>
                  setFolderModal({ ...folderModal, name: e.target.value })
                }
                placeholder="e.g. Architecture, Coding Prompts, Research"
                autoFocus
                className="w-full h-9 px-3 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="block text-xs font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Icon
              </label>
              <div className="grid grid-cols-7 gap-1.5">
                {iconChoices.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setFolderModal({ ...folderModal, icon: ic })}
                    className="h-8 rounded-lg border flex items-center justify-center cursor-pointer"
                    style={{
                      backgroundColor:
                        folderModal.icon === ic
                          ? "var(--accent-soft)"
                          : "var(--bg-canvas)",
                      borderColor:
                        folderModal.icon === ic
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                      color:
                        folderModal.icon === ic
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                    }}
                  >
                    <NotePageIcon icon={ic} className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFolderModal(null)}
                className="h-8 px-3 rounded-lg border text-xs font-medium cursor-pointer"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-8 px-4 rounded-lg text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setConfirmDelete(null)}
          />
          <div
            className="relative z-10 w-full max-w-sm rounded-2xl border p-5 space-y-4"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <h2 className="text-sm font-semibold">
              {confirmDelete.kind === "chat"
                ? "Delete AI Conversation?"
                : "Delete Folder?"}
            </h2>
            <p
              className="text-xs leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {confirmDelete.kind === "chat"
                ? `"${confirmDelete.chat.title || "Untitled AI Chat"}" and its local transcript will be removed.`
                : `Folder "${confirmDelete.folder.name}" will be removed. Conversations inside it will become Unfiled.`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="h-8 px-3 rounded-lg border text-xs font-medium cursor-pointer"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmDelete.kind === "chat") {
                    deleteAiChat(confirmDelete.chat.id);
                    pushToast("AI conversation deleted");
                  } else {
                    deleteAiChatFolder(confirmDelete.folder.id);
                    if (
                      scope.kind === "folder" &&
                      scope.folderId === confirmDelete.folder.id
                    ) {
                      setScope({ kind: "all" });
                    }
                    pushToast("Folder deleted");
                  }
                  setConfirmDelete(null);
                }}
                className="h-8 px-4 rounded-lg text-xs font-semibold text-white cursor-pointer"
                style={{ backgroundColor: "var(--danger)" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
