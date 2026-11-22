import { AlertTriangle, FileText, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { formatFileSize } from "../../lib/formatters";
import type { BookRecord } from "../../types/library";

export type LinkedNotesDeleteBehavior = "keep" | "delete";

interface ConfirmDeleteModalProps {
  booksToDelete: BookRecord[];
  linkedNotesCount?: number;
  onConfirm: (linkedNotesBehavior: LinkedNotesDeleteBehavior) => void;
  onClose: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  booksToDelete,
  linkedNotesCount = 0,
  onConfirm,
  onClose,
}) => {
  const [linkedNotesBehavior, setLinkedNotesBehavior] =
    useState<LinkedNotesDeleteBehavior>("keep");
  const totalBytes = booksToDelete.reduce(
    (sum, b) => sum + (b.fileSize || 0),
    0,
  );

  useEffect(() => {
    setLinkedNotesBehavior("keep");
  }, [booksToDelete]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm permanent deletion"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-[var(--danger)]/12 text-[var(--danger)] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Delete {booksToDelete.length}{" "}
                {booksToDelete.length === 1 ? "book" : "books"}?
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close confirmation"
              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">
            This permanently removes the selected{" "}
            {booksToDelete.length === 1 ? "book file" : "book files"} (
            <span className="font-mono-tabular text-[var(--text-primary)]">
              {formatFileSize(totalBytes)}
            </span>
            ), bookmarks, and highlights from local offline storage. This cannot
            be undone.
          </p>

          {booksToDelete.length <= 5 && (
            <ul className="mt-4 space-y-1 text-xs text-[var(--text-secondary)] border-t border-[var(--border-subtle)] pt-3">
              {booksToDelete.map((b) => (
                <li key={b.id} className="truncate">
                  {b.title}{" "}
                  <span className="text-[var(--text-muted)]">· {b.author}</span>
                </li>
              ))}
            </ul>
          )}

          {linkedNotesCount > 0 && (
            <div className="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
                <FileText className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span>
                  {linkedNotesCount} linked{" "}
                  {linkedNotesCount === 1 ? "note is" : "notes are"} attached to{" "}
                  {booksToDelete.length === 1 ? "this book" : "these books"}
                </span>
              </div>

              <div className="space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="linked-notes-delete-behavior"
                    value="keep"
                    checked={linkedNotesBehavior === "keep"}
                    onChange={() => setLinkedNotesBehavior("keep")}
                    className="mt-0.5 accent-[var(--accent)] cursor-pointer shrink-0"
                  />
                  <span>
                    <span className="font-medium text-[var(--text-primary)] block">
                      Keep {linkedNotesCount} linked{" "}
                      {linkedNotesCount === 1 ? "note" : "notes"} as snapshots
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Preserve your notes in Kanso Notes with the book title
                      recorded.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="linked-notes-delete-behavior"
                    value="delete"
                    checked={linkedNotesBehavior === "delete"}
                    onChange={() => setLinkedNotesBehavior("delete")}
                    className="mt-0.5 accent-[var(--danger)] cursor-pointer shrink-0"
                  />
                  <span>
                    <span className="font-medium text-[var(--danger)] block">
                      Also delete {linkedNotesCount} linked{" "}
                      {linkedNotesCount === 1 ? "note" : "notes"}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Permanently remove all linked notes from your workspace.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-md border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                onConfirm(linkedNotesCount > 0 ? linkedNotesBehavior : "keep")
              }
              className="px-4 py-2 text-xs font-medium rounded-md bg-[var(--danger)] text-white hover:bg-[var(--danger-hover)] cursor-pointer"
            >
              Delete Permanently
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
