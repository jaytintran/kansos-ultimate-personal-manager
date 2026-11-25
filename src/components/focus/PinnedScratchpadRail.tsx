import React from "react";
import { ArrowRight, Pin, Plus, Send, StickyNote, Target } from "lucide-react";
import { ScratchpadCard } from "../../types";
import { SCRATCHPAD_DARK, SCRATCHPAD_LIGHT } from "./FocusScratchpadTab";
import {
  isScratchpadSingleLinePlain,
  ScratchpadEditor,
} from "./ScratchpadEditor";

interface PinnedScratchpadRailProps {
  pinnedCards: ScratchpadCard[];
  isDark: boolean;
  onUpdateScratchpad: (id: string, patch: Partial<ScratchpadCard>) => void;
  onPromoteToXActive: (id: string) => void;
  onPromoteToTimeline: (id: string) => void;
  onOpenScratchpadTab: () => void;
  onQuickAddPinned: () => void;
}

export const PinnedScratchpadRail: React.FC<PinnedScratchpadRailProps> = ({
  pinnedCards,
  isDark,
  onUpdateScratchpad,
  onPromoteToXActive,
  onPromoteToTimeline,
  onOpenScratchpadTab,
  onQuickAddPinned,
}) => {
  const palette = isDark ? SCRATCHPAD_DARK : SCRATCHPAD_LIGHT;

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StickyNote
            className="w-4 h-4 shrink-0"
            style={{ color: "var(--text-muted)" }}
          />
          <h2 className="font-display text-sm font-bold tracking-tight truncate">
            Pinned Scratchpad
          </h2>
          <span
            className="text-xs font-mono tabular-nums shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            {pinnedCards.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenScratchpadTab}
          className="text-[11px] font-medium inline-flex items-center gap-1 hover:underline shrink-0 cursor-pointer"
          style={{ color: "var(--accent)" }}
        >
          <span>Open all</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {pinnedCards.length === 0 ? (
        <div
          className="rounded-xl border border-dashed px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <p className="text-xs">
            Pin sticky cards in Scratchpad to keep quick thoughts visible while focusing.
          </p>
          <button
            type="button"
            onClick={onQuickAddPinned}
            className="h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-subtle)] shrink-0 cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <Plus className="w-3 h-3" />
            <span>Quick Pinned Note</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 items-start">
          {pinnedCards.map((card) => {
            const pal = palette[card.paletteIndex % palette.length];
            const canRoute = isScratchpadSingleLinePlain(card.content);
            return (
              <div
                key={card.id}
                className="rounded-xl border p-3 space-y-2"
                style={{
                  backgroundColor: pal.bg,
                  borderColor: pal.border,
                  color: pal.text,
                }}
              >
                <ScratchpadEditor
                  minRows={2}
                  value={card.content}
                  onChange={(nextContent) =>
                    onUpdateScratchpad(card.id, { content: nextContent })
                  }
                  placeholder="Quick pinned thought or - []..."
                  className="text-xs sm:text-sm leading-relaxed"
                  textColor={pal.text}
                  bgColor={pal.bg}
                />

                <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-black/10 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateScratchpad(card.id, { pinned: false })
                    }
                    className="h-6 px-1.5 rounded text-[11px] font-medium inline-flex items-center gap-1 opacity-75 hover:opacity-100 cursor-pointer"
                    title="Unpin from Today rail"
                  >
                    <Pin className="w-3 h-3" />
                    <span>Unpin</span>
                  </button>

                  {canRoute && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onPromoteToXActive(card.id)}
                        className="h-6 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 cursor-pointer"
                        title="Send to X-Active"
                      >
                        <Target className="w-3 h-3" />
                        <span>Active</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onPromoteToTimeline(card.id)}
                        className="h-6 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 cursor-pointer"
                        title="Promote to Timeline Note"
                      >
                        <Send className="w-3 h-3" />
                        <span>Note</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
