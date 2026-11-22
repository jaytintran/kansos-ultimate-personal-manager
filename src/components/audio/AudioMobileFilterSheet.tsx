import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  GripVertical,
  RotateCcw,
} from "lucide-react";
import React from "react";
import type {
  AudioCardDetailOptions,
  AudioCoverSize,
  AudioFormat,
  AudioGroupByField,
  AudioSortDirection,
  AudioSortField,
} from "../../types/audio";
import { BottomSheet } from "../ui/BottomSheet";

interface AudioMobileFilterSheetProps {
  isOpen: boolean;
  formatFilter: "all" | AudioFormat;
  groupBy: AudioGroupByField;
  sortField: AudioSortField;
  sortDirection: AudioSortDirection;
  coverSize: AudioCoverSize;
  cardDetails: AudioCardDetailOptions;
  hasActiveFilters: boolean;
  onFormatChange: (fmt: "all" | AudioFormat) => void;
  onGroupByChange: (groupBy: AudioGroupByField) => void;
  onSortFieldChange: (field: AudioSortField) => void;
  onToggleSortDirection: () => void;
  onCoverSizeChange: (size: AudioCoverSize) => void;
  onCardDetailsChange: (patch: Partial<AudioCardDetailOptions>) => void;
  onResetFilters: () => void;
  onClose: () => void;
}

const FORMAT_OPTIONS: Array<"all" | AudioFormat> = [
  "all",
  "mp3",
  "m4a",
  "wav",
  "flac",
  "ogg",
  "opus",
  "aac",
];

const SORT_OPTIONS: Array<{ id: AudioSortField; label: string }> = [
  { id: "custom", label: "Custom Order" },
  { id: "lastPlayedAt", label: "Recently Played" },
  { id: "addedAt", label: "Date Added" },
  { id: "title", label: "Title" },
  { id: "artist", label: "Artist" },
  { id: "duration", label: "Duration" },
  { id: "playCount", label: "Play Count" },
  { id: "format", label: "Format" },
];

const GROUP_OPTIONS: Array<{ id: AudioGroupByField; label: string }> = [
  { id: "none", label: "None" },
  { id: "artist", label: "Artist" },
  { id: "album", label: "Album" },
  { id: "format", label: "Format" },
  { id: "folder", label: "Folder" },
];

const DETAIL_TOGGLES: Array<{
  key: keyof AudioCardDetailOptions;
  label: string;
}> = [
  { key: "artist", label: "Artist" },
  { key: "album", label: "Album" },
  { key: "duration", label: "Duration" },
  { key: "format", label: "Format" },
  { key: "playCount", label: "Play Count" },
  { key: "resumeBar", label: "Resume Bar" },
  { key: "tags", label: "Tags" },
];

export const AudioMobileFilterSheet: React.FC<AudioMobileFilterSheetProps> = ({
  isOpen,
  formatFilter,
  groupBy,
  sortField,
  sortDirection,
  coverSize,
  cardDetails,
  hasActiveFilters,
  onFormatChange,
  onGroupByChange,
  onSortFieldChange,
  onToggleSortDirection,
  onCoverSizeChange,
  onCardDetailsChange,
  onResetFilters,
  onClose,
}) => {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Filter & Display"
      ariaLabel="Audio filter, sort, and display options"
      headerActions={
        hasActiveFilters ? (
          <button
            type="button"
            onClick={onResetFilters}
            className="min-h-[40px] px-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] active:bg-[var(--bg-surface-hover)] rounded-md cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        ) : undefined
      }
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full h-11 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] font-medium text-sm active:opacity-90 cursor-pointer"
        >
          Done
        </button>
      }
    >
      <div className="p-4 space-y-6">
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Format
          </p>
          <div className="grid grid-cols-4 gap-1 p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]">
            {FORMAT_OPTIONS.map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => onFormatChange(fmt)}
                className={`min-h-[36px] text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  formatFilter === fmt
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                {fmt === "all" ? "All" : fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Sort By
            </p>
            {sortField === "custom" ? (
              <span className="min-h-[36px] px-2.5 inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-muted)]">
                <GripVertical className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Drag to reorder</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={onToggleSortDirection}
                className="min-h-[36px] px-2.5 inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
              >
                {sortDirection === "asc" ? (
                  <>
                    <ArrowUpNarrowWide className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>Ascending</span>
                  </>
                ) : (
                  <>
                    <ArrowDownWideNarrow className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>Descending</span>
                  </>
                )}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {SORT_OPTIONS.map((opt) => {
              const active = sortField === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSortFieldChange(opt.id)}
                  className={`min-h-[42px] px-3 rounded-lg border text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                  }`}
                >
                  <span>{opt.label}</span>
                  {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Group Tracks By
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {GROUP_OPTIONS.map((opt) => {
              const active = groupBy === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onGroupByChange(opt.id)}
                  className={`min-h-[40px] px-2.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Grid Density
          </p>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]">
            {(["compact", "standard", "large"] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => onCoverSizeChange(sz)}
                className={`min-h-[38px] text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
                  coverSize === sz
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Card Details
          </p>
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
            {DETAIL_TOGGLES.map((item) => {
              const checked = cardDetails[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  onClick={() => onCardDetailsChange({ [item.key]: !checked })}
                  className="w-full min-h-[44px] px-3.5 flex items-center justify-between text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  <span>{item.label}</span>
                  <span
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                      checked
                        ? "bg-[var(--accent)] justify-end"
                        : "bg-[var(--border-strong)] justify-start"
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-[var(--bg-elevated)] shadow-xs" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </BottomSheet>
  );
};
