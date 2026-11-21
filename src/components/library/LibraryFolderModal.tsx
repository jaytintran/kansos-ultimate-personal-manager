import { X } from "lucide-react";
import React, { useState } from "react";
import { FOLDER_COLORS, flattenFoldersHierarchy } from "../../lib/formatters";
import type { FolderColor, FolderRecord } from "../../../library";

interface LibraryFolderModalProps {
  mode: "create" | "edit";
  folder?: FolderRecord;
  folders: FolderRecord[];
  onClose: () => void;
  onSave: (payload: {
    name: string;
    color: FolderColor;
    parentId: string | null;
  }) => void;
}

export const LibraryFolderModal: React.FC<LibraryFolderModalProps> = ({
  mode,
  folder,
  folders,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(folder?.name ?? "");
  const [color, setColor] = useState<FolderColor>(folder?.color ?? "neutral");
  const [parentId, setParentId] = useState<string | null>(
    folder?.parentId ?? null,
  );

  const parentCandidates = flattenFoldersHierarchy(folders).filter(
    (item) => item.folder.id !== folder?.id,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({ name: trimmed, color, parentId });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "Create folder" : "Edit folder"}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
            {mode === "create" ? "New Folder" : "Edit Folder"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="library-folder-name"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              Folder Name
            </label>
            <input
              id="library-folder-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Architecture, Research…"
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          {mode === "create" && parentCandidates.length > 0 && (
            <div className="space-y-1.5">
              <label
                htmlFor="library-folder-parent"
                className="block text-xs font-medium text-[var(--text-secondary)]"
              >
                Parent Folder (optional)
              </label>
              <select
                id="library-folder-parent"
                value={parentId ?? ""}
                onChange={(e) => setParentId(e.target.value || null)}
                className="w-full h-9 px-2.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none cursor-pointer"
              >
                <option value="">Top-level folder</option>
                {parentCandidates.map((item) => (
                  <option key={item.folder.id} value={item.folder.id}>
                    {item.pathLabel}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-[var(--text-secondary)]">
              Accent Dot
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {FOLDER_COLORS.map((swatch) => {
                const selected = color === swatch.id;
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    title={swatch.label}
                    aria-label={`Color ${swatch.label}`}
                    onClick={() => setColor(swatch.id)}
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
                      selected
                        ? "ring-2 ring-offset-2 ring-[var(--accent)] ring-offset-[var(--bg-elevated)] scale-110"
                        : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: swatch.swatch }}
                  />
                );
              })}
            </div>
          </div>

          <div className="pt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="h-8 px-3.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-45 text-xs font-semibold cursor-pointer"
            >
              {mode === "create" ? "Create Folder" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
