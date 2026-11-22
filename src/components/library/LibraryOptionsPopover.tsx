import { Download, HardDrive, Plus, Trash2, Upload } from "lucide-react";
import React, { useRef, useState } from "react";
import { formatFileSize } from "../../lib/formatters";
import type {
  BookFormat,
  CardDetailOptions,
  CategoryRecord,
  CoverSize,
  GroupByField,
} from "../../types/library";
import type { ActiveLibraryFilter } from "./LibrarySidebar";

interface LibraryOptionsPopoverProps {
  formatFilter: "all" | BookFormat;
  groupBy: GroupByField;
  coverSize: CoverSize;
  cardDetails: CardDetailOptions;
  allTags: Array<{ name: string; count: number }>;
  selectedTags: string[];
  categories: CategoryRecord[];
  activeFilter: ActiveLibraryFilter;
  totalBytes: number;
  isExportingBackup: boolean;
  isParsingBackup: boolean;
  onFormatFilterChange: (fmt: "all" | BookFormat) => void;
  onGroupByChange: (group: GroupByField) => void;
  onCoverSizeChange: (size: CoverSize) => void;
  onCardDetailsChange: (patch: Partial<CardDetailOptions>) => void;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  onSelectCategory: (categoryId: string) => void;
  onCreateCategory: (name: string) => void;
  onDeleteCategory: (id: string) => void;
  onExportBackup: () => void;
  onSelectImportBackupFile: (file: File) => void;
  onOpenStorageManager: () => void;
  onClose: () => void;
}

const COVER_SIZE_STEPS: CoverSize[] = ["compact", "standard", "large"];

export const LibraryOptionsPopover: React.FC<LibraryOptionsPopoverProps> = ({
  formatFilter,
  groupBy,
  coverSize,
  cardDetails,
  allTags,
  selectedTags,
  categories,
  activeFilter,
  totalBytes,
  isExportingBackup,
  isParsingBackup,
  onFormatFilterChange,
  onGroupByChange,
  onCoverSizeChange,
  onCardDetailsChange,
  onToggleTag,
  onClearTags,
  onSelectCategory,
  onCreateCategory,
  onDeleteCategory,
  onExportBackup,
  onSelectImportBackupFile,
  onOpenStorageManager,
  onClose,
}) => {
  const [newCategoryName, setNewCategoryName] = useState("");
  const backupInputRef = useRef<HTMLInputElement>(null);

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    onCreateCategory(trimmed);
    setNewCategoryName("");
  };

  return (
    <div
      role="dialog"
      aria-label="Library view options"
      className="w-80 max-h-[78vh] overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-xl p-3.5 space-y-3.5 text-xs"
    >
      {/* Hidden Backup ZIP Picker */}
      <input
        ref={backupInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onSelectImportBackupFile(file);
            onClose();
          }
          e.target.value = "";
        }}
      />

      {/* Format Filter */}
      <div className="space-y-1.5">
        <span className="block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Format
        </span>
        <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          {(["all", "epub", "pdf", "mobi"] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => onFormatFilterChange(fmt)}
              className={`h-7 rounded-md text-[11px] font-medium uppercase transition-colors cursor-pointer ${
                formatFilter === fmt
                  ? "bg-[var(--accent-soft)] text-[var(--accent)] font-semibold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Group By */}
      <div className="space-y-1.5">
        <label
          htmlFor="library-options-group"
          className="block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]"
        >
          Group By
        </label>
        <select
          id="library-options-group"
          value={groupBy}
          onChange={(e) => onGroupByChange(e.target.value as GroupByField)}
          className="w-full h-8 px-2.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none cursor-pointer"
        >
          <option value="none">No grouping</option>
          <option value="status">Reading Status</option>
          <option value="format">File Format</option>
          <option value="author">Author</option>
          <option value="category">Category</option>
        </select>
      </div>

      {/* Cover Size & Card Details */}
      <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Cover Size
          </span>
          <span className="font-mono tabular-nums text-[11px] text-[var(--text-secondary)] capitalize">
            {coverSize}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1">
          {COVER_SIZE_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              onClick={() => onCoverSizeChange(step)}
              className={`h-7 text-[11px] rounded-lg border transition-colors capitalize cursor-pointer ${
                coverSize === step
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-semibold"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {step}
            </button>
          ))}
        </div>

        <div className="pt-1 space-y-1">
          <span className="block text-[11px] font-medium text-[var(--text-secondary)]">
            Card Details
          </span>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {(
              [
                { key: "subtitle", label: "Subtitle" },
                { key: "author", label: "Author" },
                { key: "format", label: "Format" },
                { key: "category", label: "Category" },
                { key: "progress", label: "Progress" },
                { key: "tags", label: "Tags" },
              ] as const
            ).map((item) => (
              <label
                key={item.key}
                className="flex items-center gap-2 py-0.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={cardDetails[item.key]}
                  onChange={(e) =>
                    onCardDetailsChange({ [item.key]: e.target.checked })
                  }
                  className="w-3.5 h-3.5 accent-[var(--accent)] rounded cursor-pointer"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Tags Filter */}
      {allTags.length > 0 && (
        <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Filter by Tags
            </span>
            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={onClearTags}
                className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
              >
                Clear ({selectedTags.length})
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {allTags.slice(0, 24).map((tag) => {
              const active = selectedTags.includes(tag.name);
              return (
                <button
                  key={tag.name}
                  type="button"
                  onClick={() => onToggleTag(tag.name)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] transition-colors cursor-pointer ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-medium"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span>#{tag.name}</span>
                  <span className="font-mono tabular-nums text-[10px] opacity-70">
                    {tag.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Categories Quick Manager */}
      <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
        <span className="block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Categories
        </span>
        {categories.length > 0 && (
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {categories.map((cat) => {
              const active =
                activeFilter.kind === "category" && activeFilter.id === cat.id;
              return (
                <div
                  key={cat.id}
                  className="flex items-center justify-between gap-1.5 rounded-md px-2 py-1 hover:bg-[var(--bg-surface-hover)]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectCategory(cat.id);
                      onClose();
                    }}
                    className={`flex-1 text-left truncate cursor-pointer ${
                      active
                        ? "text-[var(--accent)] font-medium"
                        : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {cat.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteCategory(cat.id)}
                    aria-label={`Delete category ${cat.name}`}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <form
          onSubmit={handleAddCategory}
          className="flex items-center gap-1.5"
        >
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="New category…"
            className="flex-1 h-7 px-2 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
          />
          <button
            type="submit"
            disabled={!newCategoryName.trim()}
            className="h-7 px-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
        </form>
      </div>

      {/* Storage & Backup Actions */}
      <div className="pt-3 border-t border-[var(--border-subtle)] space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Storage & Backup
          </span>
          <span className="font-mono tabular-nums text-[11px] text-[var(--text-muted)]">
            {formatFileSize(totalBytes)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenStorageManager();
          }}
          className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] flex items-center gap-2 transition-colors cursor-pointer"
        >
          <HardDrive className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span className="font-medium">Storage Manager</span>
        </button>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={isExportingBackup}
            onClick={() => {
              onClose();
              onExportBackup();
            }}
            className="h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="font-medium">
              {isExportingBackup ? "Exporting…" : "Export ZIP"}
            </span>
          </button>

          <button
            type="button"
            disabled={isParsingBackup}
            onClick={() => backupInputRef.current?.click()}
            className="h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="font-medium">
              {isParsingBackup ? "Reading…" : "Import ZIP"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
