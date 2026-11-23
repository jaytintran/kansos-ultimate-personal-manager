import React from "react";
import { AlertTriangle, Archive, GitBranch, Trash2, X } from "lucide-react";

export interface NoteBranchActionPrompt {
  action: "delete" | "archive";
  noteId: string;
  noteTitle: string;
  directChildCount: number;
  totalDescendantCount: number;
}

interface NoteDeleteBranchModalProps {
  prompt: NoteBranchActionPrompt | null;
  onChoose: (mode: "promote" | "cascade") => void;
  onCancel: () => void;
}

export const NoteDeleteBranchModal: React.FC<NoteDeleteBranchModalProps> = ({
  prompt,
  onChoose,
  onCancel,
}) => {
  if (!prompt) return null;

  const isArchive = prompt.action === "archive";
  const countLabel =
    prompt.totalDescendantCount === 1
      ? "1 sub-page"
      : `${prompt.totalDescendantCount} sub-pages`;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4 overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-label={isArchive ? "Archive parent note" : "Delete parent note"}
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        className="relative z-10 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border overflow-hidden pb-safe sm:pb-0"
        style={{
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-strong)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3.5 border-b"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{
                backgroundColor: isArchive
                  ? "var(--accent-soft)"
                  : "rgba(220, 38, 38, 0.12)",
                color: isArchive ? "var(--accent)" : "var(--danger)",
              }}
            >
              <AlertTriangle className="w-4 h-4" />
            </span>
            <h2 className="font-display text-sm font-bold truncate">
              {isArchive ? "Archive Note with Sub-pages" : "Delete Note with Sub-pages"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p
            className="text-xs leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            <strong style={{ color: "var(--text-primary)" }}>
              &ldquo;{prompt.noteTitle || "Untitled Note"}&rdquo;
            </strong>{" "}
            contains{" "}
            <span className="font-mono font-semibold">{countLabel}</span>. How
            would you like to handle nested child pages?
          </p>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onChoose("promote")}
              className="w-full p-3 rounded-xl border text-left transition-colors hover:bg-[var(--bg-surface-hover)] flex items-start gap-3 cursor-pointer"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--accent)",
              }}
            >
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{
                  backgroundColor: "var(--accent-soft)",
                  color: "var(--accent)",
                }}
              >
                <GitBranch className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold flex items-center gap-2">
                  <span>Promote sub-pages up one level</span>
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: "var(--accent-soft)",
                      color: "var(--accent)",
                    }}
                  >
                    Recommended
                  </span>
                </div>
                <p
                  className="text-[11px] mt-0.5 leading-snug"
                  style={{ color: "var(--text-muted)" }}
                >
                  Keeps all {countLabel} intact by moving direct children to the
                  parent level.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onChoose("cascade")}
              className="w-full p-3 rounded-xl border text-left transition-colors hover:bg-[var(--bg-surface-hover)] flex items-start gap-3 cursor-pointer"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{
                  backgroundColor: isArchive
                    ? "var(--bg-surface-subtle)"
                    : "rgba(220, 38, 38, 0.12)",
                  color: isArchive ? "var(--text-secondary)" : "var(--danger)",
                }}
              >
                {isArchive ? (
                  <Archive className="w-4 h-4" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </span>
              <div className="min-w-0">
                <div
                  className="text-xs font-semibold"
                  style={{
                    color: isArchive ? "var(--text-primary)" : "var(--danger)",
                  }}
                >
                  {isArchive
                    ? `Archive note and all ${countLabel} together`
                    : `Delete note and all ${countLabel} together`}
                </div>
                <p
                  className="text-[11px] mt-0.5 leading-snug"
                  style={{ color: "var(--text-muted)" }}
                >
                  {isArchive
                    ? "Moves the entire sub-page branch to Archive."
                    : "Permanently deletes the entire sub-page branch."}
                </p>
              </div>
            </button>
          </div>

          <div className="flex justify-end pt-1">
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
          </div>
        </div>
      </div>
    </div>
  );
};
