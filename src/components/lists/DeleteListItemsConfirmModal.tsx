import { AlertTriangle, X } from "lucide-react";
import React from "react";
import { createPortal } from "react-dom";

interface DeleteListItemsConfirmModalProps {
  open: boolean;
  itemCount: number;
  itemTitle?: string;
  exclusivelyLinkedNotesCount: number;
  sharedNotesCount: number;
  onCancel: () => void;
  onConfirm: (linkedNotesBehavior: "keep" | "delete") => void;
}

export const DeleteListItemsConfirmModal: React.FC<
  DeleteListItemsConfirmModalProps
> = ({
  open,
  itemCount,
  itemTitle,
  exclusivelyLinkedNotesCount,
  sharedNotesCount,
  onCancel,
  onConfirm,
}) => {
  if (!open || typeof document === "undefined") return null;

  const totalNotes = exclusivelyLinkedNotesCount + sharedNotesCount;
  const heading =
    itemCount === 1 && itemTitle
      ? `Delete “${itemTitle}”?`
      : `Delete ${itemCount} ${itemCount === 1 ? "item" : "items"}?`;

  return createPortal(
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border p-5 space-y-4"
        style={{
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-strong)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
              style={{
                backgroundColor: "rgba(220, 38, 38, 0.12)",
                color: "var(--danger)",
              }}
            >
              <AlertTriangle className="w-4 h-4" />
            </span>
            <div className="min-w-0 space-y-1">
              <h3
                className="font-display text-sm font-bold leading-snug break-words"
                style={{ color: "var(--text-primary)" }}
              >
                {heading}
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {totalNotes === 1
                  ? "1 note is linked to this item."
                  : `${totalNotes} notes are linked to ${
                      itemCount === 1 ? "this item" : "these items"
                    }.`}{" "}
                Would you like to keep those notes or delete them as well?
              </p>
              {sharedNotesCount > 0 && (
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {sharedNotesCount}{" "}
                  {sharedNotesCount === 1 ? "note is" : "notes are"} also linked
                  to other items or books and will safely keep those other links
                  if you choose delete.
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] shrink-0 cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 px-3 rounded-lg border text-xs font-medium cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm("keep")}
            className="h-8 px-3 rounded-lg border text-xs font-semibold cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-strong)",
              color: "var(--text-primary)",
            }}
          >
            Keep Notes &amp; Delete
          </button>
          <button
            type="button"
            onClick={() => onConfirm("delete")}
            className="h-8 px-3.5 rounded-lg text-xs font-semibold cursor-pointer"
            style={{
              backgroundColor: "var(--danger)",
              color: "#ffffff",
            }}
          >
            Delete with Notes
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
