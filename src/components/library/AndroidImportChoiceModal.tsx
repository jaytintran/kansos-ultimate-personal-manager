import { Check, HardDrive, Link2, X } from "lucide-react";
import React, { useState } from "react";
import { formatFileSize } from "../../lib/formatters";
import type { AndroidImportStorageMode } from "../../utils/androidSaf";

interface AndroidImportChoiceModalProps {
  isOpen: boolean;
  fileCount: number;
  totalBytes: number;
  contextLabel?: string;
  onChoose: (
    choice: "link" | "copy",
    rememberPreference?: AndroidImportStorageMode,
  ) => void;
  onCancel: () => void;
}

export const AndroidImportChoiceModal: React.FC<
  AndroidImportChoiceModalProps
> = ({
  isOpen,
  fileCount,
  totalBytes,
  contextLabel,
  onChoose,
  onCancel,
}) => {
  const [rememberChoice, setRememberChoice] = useState(false);

  if (!isOpen) return null;

  const sizeLabel = totalBytes > 0 ? formatFileSize(totalBytes) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose Android e-book storage mode"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl overflow-hidden"
      >
        <div className="sm:hidden w-10 h-1.5 rounded-full bg-[var(--border-strong)] mx-auto mt-3" />

        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
              {contextLabel ||
                `Import ${fileCount} ${fileCount === 1 ? "book" : "books"}`}
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Choose whether to read directly from device storage or copy into
              Kanso.
              {sizeLabel ? ` (${sizeLabel})` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel import"
            className="min-w-[40px] min-h-[40px] -mr-1.5 -mt-1 inline-flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <button
            type="button"
            onClick={() =>
              onChoose("link", rememberChoice ? "always-link" : undefined)
            }
            className="w-full min-h-[68px] p-3.5 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] text-left flex items-start gap-3 hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center shrink-0 mt-0.5">
              <Link2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  Link from device storage
                </span>
                <span className="text-[11px] font-mono tabular-nums text-[var(--accent)] font-medium shrink-0">
                  0 B in app
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                Reads directly from your phone without duplicating the file.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onChoose("copy", rememberChoice ? "always-copy" : undefined)
            }
            className="w-full min-h-[68px] p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-left flex items-start gap-3 hover:border-[var(--border-strong)] active:scale-[0.99] transition-all cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] flex items-center justify-center shrink-0 mt-0.5">
              <HardDrive className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  Copy into app library
                </span>
                {sizeLabel && (
                  <span className="text-[11px] font-mono tabular-nums text-[var(--text-muted)] shrink-0">
                    +{sizeLabel}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                Stores a private copy inside Kanso so moving the original file
                won&rsquo;t break reading.
              </p>
            </div>
          </button>

          <label className="pt-1 flex items-center gap-2.5 min-h-[44px] cursor-pointer select-none">
            <button
              type="button"
              role="checkbox"
              aria-checked={rememberChoice}
              onClick={() => setRememberChoice((v) => !v)}
              className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                rememberChoice
                  ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-fg)]"
                  : "bg-[var(--bg-surface)] border-[var(--border-strong)] text-transparent"
              }`}
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
            <span className="text-xs text-[var(--text-secondary)]">
              Remember this choice (you can change it anytime in Settings)
            </span>
          </label>
        </div>
      </div>
    </div>
  );
};
