import { FolderOpen, FolderPlus, RefreshCw, Trash2, X } from "lucide-react";
import React from "react";
import { formatRelativeDate } from "../../lib/formatters";
import type { AndroidLinkedFolder } from "../../utils/androidSaf";

interface AndroidFolderManagerModalProps {
  isOpen: boolean;
  folders: AndroidLinkedFolder[];
  isScanning: boolean;
  onClose: () => void;
  onAddFolder: () => void;
  onScanFolder: (uri: string) => void;
  onScanAll: () => void;
  onRemoveFolder: (uri: string) => void;
}

export const AndroidFolderManagerModal: React.FC<
  AndroidFolderManagerModalProps
> = ({
  isOpen,
  folders,
  isScanning,
  onClose,
  onAddFolder,
  onScanFolder,
  onScanAll,
  onRemoveFolder,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Linked Android device folders"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl overflow-hidden"
      >
        <div className="sm:hidden w-10 h-1.5 rounded-full bg-[var(--border-strong)] mx-auto mt-3" />

        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
              Linked Device Folders
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Scan Android folders for EPUB, PDF, and MOBI files without copying
              them.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close folder manager"
            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {folders.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] space-y-2.5">
              <FolderOpen className="w-6 h-6 text-[var(--text-muted)] mx-auto" />
              <p className="text-sm font-medium text-[var(--text-primary)]">
                No device folders linked yet
              </p>
              <p className="text-xs text-[var(--text-secondary)] max-w-xs mx-auto leading-relaxed">
                Link your Downloads or Books folder once so Kanso can auto-scan
                and match files on your phone.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] overflow-hidden">
              {folders.map((folder) => (
                <div
                  key={folder.uri}
                  className="p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <FolderOpen className="w-4 h-4 text-[var(--accent)] shrink-0" />
                      <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {folder.name}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)] font-mono tabular-nums truncate">
                      {folder.lastScannedAt
                        ? `Scanned ${formatRelativeDate(folder.lastScannedAt)}`
                        : "Not scanned yet"}
                      {typeof folder.lastFoundCount === "number"
                        ? ` · ${folder.lastFoundCount} e-book${folder.lastFoundCount === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isScanning}
                      onClick={() => onScanFolder(folder.uri)}
                      title="Rescan folder"
                      aria-label={`Rescan ${folder.name}`}
                      className="min-w-[44px] min-h-[44px] px-2.5 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)] disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`}
                      />
                      <span className="hidden sm:inline">Scan</span>
                    </button>
                    <button
                      type="button"
                      disabled={isScanning}
                      onClick={() => onRemoveFolder(folder.uri)}
                      title="Unlink folder (keeps books)"
                      aria-label={`Unlink ${folder.name}`}
                      className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--danger)] disabled:opacity-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            disabled={isScanning}
            onClick={onAddFolder}
            className="min-h-[44px] px-4 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Link Folder</span>
          </button>

          {folders.length > 0 && (
            <button
              type="button"
              disabled={isScanning}
              onClick={onScanAll}
              className="min-h-[44px] px-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`}
              />
              <span>{isScanning ? "Scanning…" : "Rescan All"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
