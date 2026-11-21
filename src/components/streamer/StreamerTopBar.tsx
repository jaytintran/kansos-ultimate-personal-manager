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
      className="min-h-[52px] px-4 sm:px-6 py-4 border-b flex flex-wrap items-center justify-between gap-2.5 shrink-0 "
      style={{
        backgroundColor: "var(--bg-canvas)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {/* Left: Title-as-tabs — "Streamer | Vault" */}
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
          className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight whitespace-nowrap transition-colors cursor-pointer"
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
          className="mx-2.5 shrink-0"
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
          className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight whitespace-nowrap transition-colors cursor-pointer"
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

      {/* Right (Live Grid): Compact 32px Quick-Add URL Form + Studio Sidebar Toggle */}
      <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5 min-w-[240px]">
        <form
          onSubmit={handleQuickAddSubmit}
          className="flex flex-1 items-center gap-1.5 min-w-[200px] max-w-md"
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
            className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-45 transition-opacity"
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
