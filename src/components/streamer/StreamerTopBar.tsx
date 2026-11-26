import React, { useState } from "react";
import {
  FolderKanban,
  LayoutGrid,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
} from "lucide-react";

export type StreamerSubView = "grid" | "vault";

interface StreamerTopBarProps {
  subView: StreamerSubView;
  onChangeSubView: (subView: StreamerSubView) => void;
  activeCount: number;
  vaultCount: number;
  onQuickAddUrl: (rawUrl: string) => Promise<boolean>;
}

export const StreamerTopBar: React.FC<StreamerTopBarProps> = ({
  subView,
  onChangeSubView,
  activeCount,
  vaultCount,
  onQuickAddUrl,
}) => {
  const [quickUrl, setQuickUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUrl.trim() || adding) return;
    setAdding(true);
    try {
      const ok = await onQuickAddUrl(quickUrl.trim());
      if (ok) {
        setQuickUrl("");
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <header
      className="px-3 py-2 md:min-h-[52px] md:px-6 md:py-4 border-b flex flex-col md:flex-row md:flex-wrap md:items-center md:justify-between gap-1.5 md:gap-2.5 shrink-0"
      style={{
        backgroundColor: "var(--bg-canvas)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {/* Row 1 on mobile / Left on desktop: Title-as-tabs — "Streamer | Vault" */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div
          className="flex items-center min-w-0"
          role="tablist"
          aria-label="Streamer subview"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subView === "grid"}
            onClick={() => onChangeSubView("grid")}
            className="font-display text-base sm:text-lg md:text-[20px] font-semibold tracking-tight leading-tight whitespace-nowrap transition-colors cursor-pointer"
            style={{
              color:
                subView === "grid" ? "var(--text-primary)" : "var(--text-muted)",
            }}
            onMouseEnter={(e) => {
              if (subView !== "grid") {
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
            onMouseLeave={(e) => {
              if (subView !== "grid") {
                e.currentTarget.style.color = "var(--text-muted)";
              }
            }}
          >
            Streamer
          </button>

          <span
            aria-hidden="true"
            className="mx-2 sm:mx-2.5 shrink-0"
            style={{
              width: 1,
              height: "1.1em",
              backgroundColor: "var(--border-strong)",
            }}
          />

          <button
            type="button"
            role="tab"
            aria-selected={subView === "vault"}
            onClick={() => onChangeSubView("vault")}
            className="font-display text-base sm:text-lg md:text-[20px] font-semibold tracking-tight leading-tight whitespace-nowrap transition-colors cursor-pointer"
            style={{
              color:
                subView === "vault" ? "var(--text-primary)" : "var(--text-muted)",
            }}
            onMouseEnter={(e) => {
              if (subView !== "vault") {
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
            onMouseLeave={(e) => {
              if (subView !== "vault") {
                e.currentTarget.style.color = "var(--text-muted)";
              }
            }}
          >
            Vault
          </button>
        </div>

        {/* Compact mobile-only count summary */}
        <div
          className="md:hidden text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0"
          style={{ color: "var(--text-muted)" }}
        >
          {subView === "grid"
            ? `${activeCount} active`
            : `${vaultCount} saved`}
        </div>
      </div>

      {/* Row 2 on mobile / Right on desktop: Slim Quick-Add URL Form */}
      <div className="flex w-full md:w-auto md:flex-1 flex-wrap items-center justify-end gap-1.5 md:min-w-[240px]">
        <form
          onSubmit={handleQuickAddSubmit}
          className="flex flex-1 items-center gap-1.5 min-w-0 md:min-w-[200px] md:max-w-md"
        >
          <input
            type="text"
            value={quickUrl}
            onChange={(e) => setQuickUrl(e.target.value)}
            placeholder="Paste YouTube URL or 11-char ID..."
            className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border text-xs outline-none transition-colors"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
            }}
            aria-label="Paste YouTube URL or 11-character ID"
          />
          <button
            type="submit"
            disabled={!quickUrl.trim() || adding}
            className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-45 transition-opacity cursor-pointer"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            {adding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>Add</span>
          </button>
        </form>
      </div>
    </header>
  );
};
