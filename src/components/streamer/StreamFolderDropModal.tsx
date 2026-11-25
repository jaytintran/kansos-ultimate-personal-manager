import {
  Check,
  FolderInput,
  FolderMinus,
  FolderPlus,
  Minus,
  Plus,
  Search,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import type { StreamFolder, StreamItem } from "../../types";
import { DynamicIcon } from "../IconLibrary";
import { flattenStreamFolders } from "./FloatingStreamFolderDropDock";

export interface PendingStreamFolderDrop {
  actionMode: "add-or-move" | "remove";
  targetFolderId: string;
  targetFolderName: string;
  streamIds: string[];
  streamTitles: string[];
  existingFolderNames: string[];
}

interface StreamFolderDropActionModalProps {
  pendingDrop: PendingStreamFolderDrop | null;
  onAdd: () => void;
  onMove: () => void;
  onRemove: () => void;
  onCancel: () => void;
}

export const StreamFolderDropActionModal: React.FC<
  StreamFolderDropActionModalProps
> = ({ pendingDrop, onAdd, onMove, onRemove, onCancel }) => {
  useEffect(() => {
    if (!pendingDrop) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingDrop, onCancel]);

  if (!pendingDrop) return null;

  const isRemoveMode = pendingDrop.actionMode === "remove";
  const count = pendingDrop.streamIds.length;
  const singleTitle = count === 1 ? pendingDrop.streamTitles[0] : null;
  const existingLabel = pendingDrop.existingFolderNames.slice(0, 3).join(" · ");
  const extraCount = Math.max(0, pendingDrop.existingFolderNames.length - 3);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={
          isRemoveMode
            ? `Remove from ${pendingDrop.targetFolderName}`
            : `Add or move to ${pendingDrop.targetFolderName}`
        }
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)] leading-snug">
              {isRemoveMode
                ? `Remove from “${pendingDrop.targetFolderName}”?`
                : `Add or Move to “${pendingDrop.targetFolderName}”?`}
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {isRemoveMode ? (
                singleTitle ? (
                  <>
                    <span className="font-medium text-[var(--text-primary)]">
                      &ldquo;{singleTitle}&rdquo;
                    </span>{" "}
                    is already in this folder. Would you like to remove it?
                  </>
                ) : (
                  <>
                    <span className="font-mono-tabular font-medium text-[var(--text-primary)]">
                      {count}
                    </span>{" "}
                    selected streams are already in this folder. Would you like to remove them?
                  </>
                )
              ) : singleTitle ? (
                <>
                  <span className="font-medium text-[var(--text-primary)]">
                    &ldquo;{singleTitle}&rdquo;
                  </span>{" "}
                  is already filed in another folder.
                </>
              ) : (
                <>
                  <span className="font-mono-tabular font-medium text-[var(--text-primary)]">
                    {count}
                  </span>{" "}
                  selected streams include items already filed in other folders.
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel folder drop"
            className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3.5">
          {!isRemoveMode && existingLabel && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs">
              <span className="block text-[11px] font-medium text-[var(--text-muted)]">
                Currently in
              </span>
              <p className="mt-0.5 text-[var(--text-primary)] leading-relaxed">
                {existingLabel}
                {extraCount > 0 ? ` · +${extraCount} more` : ""}
              </p>
            </div>
          )}

          {isRemoveMode ? (
            <button
              type="button"
              onClick={onRemove}
              className="w-full px-4 py-3 rounded-lg bg-[var(--danger)] text-white hover:opacity-90 transition-opacity flex items-center gap-3 text-left cursor-pointer"
            >
              <FolderMinus className="w-4 h-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">
                  Remove from &ldquo;{pendingDrop.targetFolderName}&rdquo;
                </span>
                <span className="block text-[11px] opacity-85">
                  {count === 1 ? "The stream stays" : "These streams stay"} safely in your Vault
                </span>
              </div>
            </button>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={onAdd}
                className="w-full px-4 py-3 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-95 transition-opacity flex items-center gap-3 text-left cursor-pointer"
              >
                <FolderPlus className="w-4 h-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold">
                    Add to &ldquo;{pendingDrop.targetFolderName}&rdquo;
                  </span>
                  <span className="block text-[11px] opacity-85">
                    Keep in current{" "}
                    {pendingDrop.existingFolderNames.length === 1
                      ? "folder"
                      : "folders"}{" "}
                    as well
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={onMove}
                className="w-full px-4 py-3 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors flex items-center gap-3 text-left cursor-pointer"
              >
                <FolderInput className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold">
                    Move to &ldquo;{pendingDrop.targetFolderName}&rdquo;
                  </span>
                  <span className="block text-[11px] text-[var(--text-secondary)]">
                    Remove from previous Vault folders
                  </span>
                </div>
              </button>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 text-xs font-medium rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            {isRemoveMode ? "Keep in Folder" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface StreamFolderPickerModalProps {
  streamIds: string[] | null;
  streams: StreamItem[];
  folders: StreamFolder[];
  onAddFolder: (name: string, parentId?: string | null) => StreamFolder;
  onApply: (
    streamIds: string[],
    addFolderIds: string[],
    removeFolderIds: string[],
  ) => void;
  onClose: () => void;
}

type TriState = "all" | "some" | "none";

export const StreamFolderPickerModal: React.FC<
  StreamFolderPickerModalProps
> = ({ streamIds, streams, folders, onAddFolder, onApply, onClose }) => {
  const [search, setSearch] = useState("");
  const [decisions, setDecisions] = useState<Map<string, "add" | "remove">>(
    () => new Map(),
  );
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const targetStreams = useMemo(() => {
    if (!streamIds || streamIds.length === 0) return [];
    const byId = new Map(streams.map((s) => [s.id, s]));
    return streamIds
      .map((id) => byId.get(id))
      .filter((s): s is StreamItem => Boolean(s));
  }, [streamIds, streams]);

  const targetKey = targetStreams.map((s) => s.id).join(",");

  useEffect(() => {
    if (!streamIds) return;
    setSearch("");
    setDecisions(new Map());
    setCreatingFolder(false);
    setNewFolderName("");
  }, [targetKey, streamIds]);

  useEffect(() => {
    if (!streamIds) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [streamIds, onClose]);

  const flatFolders = useMemo(
    () => flattenStreamFolders(folders),
    [folders],
  );

  const filteredFolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flatFolders;
    return flatFolders.filter(
      ({ folder, pathLabel }) =>
        folder.name.toLowerCase().includes(q) ||
        pathLabel.toLowerCase().includes(q),
    );
  }, [flatFolders, search]);

  if (!streamIds || targetStreams.length === 0) return null;

  const isSingle = targetStreams.length === 1;
  const leadTitle =
    targetStreams[0].customLabel || targetStreams[0].title || "Stream";

  const getInitialState = (folderId: string): TriState => {
    const count = targetStreams.filter((s) =>
      (s.folderIds ?? []).includes(folderId),
    ).length;
    if (count === 0) return "none";
    if (count === targetStreams.length) return "all";
    return "some";
  };

  const getEffectiveState = (folderId: string): TriState => {
    const d = decisions.get(folderId);
    if (d === "add") return "all";
    if (d === "remove") return "none";
    return getInitialState(folderId);
  };

  const toggleFolder = (folderId: string) => {
    const initial = getInitialState(folderId);
    const current = getEffectiveState(folderId);
    setDecisions((prev) => {
      const next = new Map(prev);
      if (current === "all") {
        if (initial === "none") next.delete(folderId);
        else next.set(folderId, "remove");
      } else {
        if (initial === "all") next.delete(folderId);
        else next.set(folderId, "add");
      }
      return next;
    });
  };

  const handleQuickCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const created = onAddFolder(trimmed, null);
    if (created?.id) {
      setDecisions((prev) => {
        const next = new Map(prev);
        next.set(created.id, "add");
        return next;
      });
    }
    setNewFolderName("");
    setCreatingFolder(false);
  };

  const handleSave = () => {
    const addIds: string[] = [];
    const removeIds: string[] = [];
    decisions.forEach((mode, folderId) => {
      if (mode === "add") addIds.push(folderId);
      else removeIds.push(folderId);
    });
    onApply(
      targetStreams.map((s) => s.id),
      addIds,
      removeIds,
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Organize into folders"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
      >
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)] leading-snug">
              Choose Folders
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)] truncate">
              {isSingle ? (
                <span className="font-medium text-[var(--text-primary)]">
                  {leadTitle}
                </span>
              ) : (
                <>
                  <span className="font-mono-tabular font-semibold text-[var(--text-primary)]">
                    {targetStreams.length}
                  </span>{" "}
                  selected streams
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close folder picker"
            className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search + New Folder */}
        <div className="px-5 pt-3.5 pb-2.5 space-y-2.5 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search folders…"
                autoFocus
                className="w-full h-8 pl-8 pr-7 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="h-6 w-6 rounded flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  aria-label="Clear folder search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCreatingFolder((prev) => !prev)}
              className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>New</span>
            </button>
          </div>

          {creatingFolder && (
            <form onSubmit={handleQuickCreate} className="flex items-center gap-1.5">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="New folder or stack name…"
                autoFocus
                className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-[var(--accent)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] outline-none"
              />
              <button
                type="submit"
                disabled={!newFolderName.trim()}
                className="h-8 px-3 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] text-xs font-semibold disabled:opacity-45 cursor-pointer"
              >
                Create
              </button>
            </form>
          )}
        </div>

        {/* Folder List */}
        <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-1">
          {filteredFolders.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              {folders.length === 0
                ? "No folders created yet — click New to create one."
                : "No folders match your search."}
            </div>
          ) : (
            filteredFolders.map(({ folder, depth, pathLabel }) => {
              const state = getEffectiveState(folder.id);
              const isChecked = state === "all";
              const isPartial = state === "some";
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => toggleFolder(folder.id)}
                  title={pathLabel}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-[var(--bg-surface-hover)] transition-colors text-left cursor-pointer"
                  style={{ paddingLeft: `${10 + depth * 16}px` }}
                >
                  <span
                    className="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors"
                    style={{
                      backgroundColor:
                        isChecked || isPartial
                          ? "var(--accent)"
                          : "var(--bg-surface)",
                      borderColor:
                        isChecked || isPartial
                          ? "var(--accent)"
                          : "var(--border-strong)",
                      color: "var(--accent-fg)",
                    }}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    {isPartial && <Minus className="w-3 h-3 stroke-[3]" />}
                  </span>
                  <DynamicIcon
                    name={folder.icon || "Folder"}
                    className="w-4 h-4 shrink-0"
                    style={{
                      color: isChecked
                        ? "var(--accent)"
                        : "var(--text-muted)",
                    }}
                  />
                  <span className="flex-1 min-w-0 truncate text-[var(--text-primary)]">
                    {folder.name}
                  </span>
                  {isPartial && (
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                      Partial
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-[var(--text-muted)]">
            {decisions.size > 0
              ? `${decisions.size} folder ${decisions.size === 1 ? "change" : "changes"} pending`
              : "Click folders to add or remove"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={decisions.size === 0}
              className="h-8 px-4 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] text-xs font-semibold disabled:opacity-45 cursor-pointer"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
