import { AlertTriangle, X } from "lucide-react";
import React, { useState } from "react";
import { formatAudioDuration } from "../../lib/audioFormatters";
import { formatFileSize } from "../../lib/formatters";
import type {
  AudioImportMetadataResult,
  AudioTrackRecord,
} from "../../types/audio";
import { AudioArtwork } from "./AudioArtwork";

export type AudioDuplicateAction = "skip" | "replace" | "keep-both";

export interface PendingAudioDuplicateItem {
  id: string;
  fileName: string;
  fileSize: number;
  arrayBuffer: ArrayBuffer;
  metadata: AudioImportMetadataResult;
  existingTrack: AudioTrackRecord;
  matchReason: "Identical audio file" | "Same file name & size";
  androidUri?: string;
  androidChoice?: "link" | "copy";
}

interface AudioDuplicateImportModalProps {
  items: PendingAudioDuplicateItem[];
  onResolve: (decisions: Record<string, AudioDuplicateAction>) => void;
  onCancel: () => void;
}

export const AudioDuplicateImportModal: React.FC<
  AudioDuplicateImportModalProps
> = ({ items, onResolve, onCancel }) => {
  const [decisions, setDecisions] = useState<
    Record<string, AudioDuplicateAction>
  >(() => {
    const init: Record<string, AudioDuplicateAction> = {};
    for (const item of items) init[item.id] = "skip";
    return init;
  });

  if (items.length === 0) return null;

  const setAll = (action: AudioDuplicateAction) => {
    const next: Record<string, AudioDuplicateAction> = {};
    for (const item of items) next[item.id] = action;
    setDecisions(next);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Resolve duplicate audio tracks"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[82vh] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Duplicate {items.length === 1 ? "Track" : "Tracks"} Detected
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Replacing updates the local audio file while keeping folders,
                playlists, tags, and saved playback position intact.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close duplicate resolver"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {items.length > 1 && (
          <div className="px-6 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3 text-xs shrink-0">
            <span className="text-[var(--text-secondary)]">
              Set all {items.length} conflicts:
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAll("skip")}
                className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] cursor-pointer"
              >
                Skip All
              </button>
              <button
                type="button"
                onClick={() => setAll("replace")}
                className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] cursor-pointer"
              >
                Replace All
              </button>
              <button
                type="button"
                onClick={() => setAll("keep-both")}
                className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] cursor-pointer"
              >
                Keep All
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] px-6">
          {items.map((item) => {
            const action = decisions[item.id] ?? "skip";
            return (
              <div
                key={item.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 shrink-0">
                    <AudioArtwork
                      title={item.existingTrack.title}
                      artist={item.existingTrack.artist}
                      format={item.existingTrack.format}
                      coverDataUrl={item.existingTrack.coverDataUrl}
                      paletteIndex={item.existingTrack.coverPaletteIndex}
                      coverStyle={item.existingTrack.coverStyle}
                      size="sm"
                    />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {item.metadata.title}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] truncate">
                      {item.metadata.artist} · {item.matchReason}
                    </div>
                    <div className="font-mono tabular-nums text-[11px] text-[var(--text-muted)]">
                      Existing: {item.existingTrack.format.toUpperCase()} ·{" "}
                      {formatAudioDuration(item.existingTrack.durationSeconds)} ·{" "}
                      {formatFileSize(item.existingTrack.fileSize)}
                    </div>
                  </div>
                </div>

                <div className="inline-flex items-center p-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
                  {(
                    [
                      { id: "skip", label: "Skip" },
                      { id: "replace", label: "Replace" },
                      { id: "keep-both", label: "Keep Both" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        setDecisions((p) => ({ ...p, [item.id]: opt.id }))
                      }
                      className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer ${
                        action === opt.id
                          ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                          : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-md border border-[var(--border-strong)] text-[var(--text-primary)] cursor-pointer"
          >
            Skip All &amp; Close
          </button>
          <button
            type="button"
            onClick={() => onResolve(decisions)}
            className="px-4 py-2 text-xs font-medium rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] cursor-pointer"
          >
            Apply Choices
          </button>
        </div>
      </div>
    </div>
  );
};
