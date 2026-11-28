import React, { useEffect, useRef, useState } from "react";
import {
  AlignRight,
  ArrowUp,
  ChevronDown,
  CornerDownRight,
  ListTree,
  PanelRightOpen,
  X,
} from "lucide-react";

export interface TocHeadingItem {
  id: string;
  index: number;
  level: number;
  depth: number;
  text: string;
  pos: number | null;
}

export type DesktopTocMode = "full" | "compact";

interface TocSharedListProps {
  headings: TocHeadingItem[];
  activeHeadingId: string | null;
  isScrolledDown: boolean;
  hasSubPagesSection: boolean;
  subPagesCount: number;
  onJumpToHeading: (item: TocHeadingItem) => void;
  onJumpToTop: () => void;
  onJumpToSubPages: () => void;
  touchSized?: boolean;
}

const TocHeadingNavList: React.FC<TocSharedListProps> = ({
  headings,
  activeHeadingId,
  isScrolledDown,
  hasSubPagesSection,
  subPagesCount,
  onJumpToHeading,
  onJumpToTop,
  onJumpToSubPages,
  touchSized = false,
}) => {
  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Keep the active item visible inside the TOC scroll list without scrolling outer containers
  useEffect(() => {
    if (!activeHeadingId) return;
    const nav = navRef.current;
    const btn = itemRefs.current.get(activeHeadingId);
    if (!nav || !btn) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    if (btnRect.top < navRect.top + 8) {
      nav.scrollTop -= navRect.top + 8 - btnRect.top;
    } else if (btnRect.bottom > navRect.bottom - 8) {
      nav.scrollTop += btnRect.bottom - (navRect.bottom - 8);
    }
  }, [activeHeadingId]);

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Table of Contents"
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-0.5 ${
          touchSized ? "px-3 py-2" : "px-1.5 py-1.5"
        }`}
      >
        {headings.map((h) => {
          const isActive = h.id === activeHeadingId;
          return (
            <button
              key={h.id}
              ref={(el) => {
                if (el) itemRefs.current.set(h.id, el);
                else itemRefs.current.delete(h.id);
              }}
              type="button"
              onClick={() => onJumpToHeading(h)}
              aria-current={isActive ? "location" : undefined}
              title={h.text}
              className={`relative w-full flex items-center gap-1.5 text-left rounded-lg transition-colors cursor-pointer group ${
                touchSized ? "py-2.5 pr-3" : "py-1.5 pr-2"
              } hover:bg-[var(--bg-surface-hover)]`}
              style={{
                paddingLeft: `${h.depth * (touchSized ? 14 : 10) + (touchSized ? 12 : 10)}px`,
                backgroundColor: isActive
                  ? "color-mix(in srgb, var(--accent) 9%, transparent)"
                  : undefined,
              }}
            >
              {/* Left active indicator bar */}
              <span
                aria-hidden="true"
                className="absolute left-1 top-1.5 bottom-1.5 w-[2px] rounded-full transition-opacity duration-150"
                style={{
                  backgroundColor: "var(--accent)",
                  opacity: isActive ? 1 : 0,
                }}
              />

              {/* Subtle H1 / H2 / H3 prefix tag */}
              <span
                className="font-mono tabular-nums text-[10px] shrink-0 transition-opacity"
                style={{
                  color: isActive ? "var(--accent)" : "var(--text-muted)",
                  opacity: isActive ? 0.95 : 0.6,
                }}
              >
                H{h.level}
              </span>

              <span
                className={`truncate leading-snug ${
                  touchSized
                    ? h.depth === 0
                      ? "text-sm font-medium"
                      : "text-xs font-normal"
                    : h.depth === 0
                      ? "text-xs font-medium"
                      : "text-[11.5px] font-normal"
                }`}
                style={{
                  color: isActive
                    ? "var(--accent)"
                    : h.depth === 0
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  fontWeight: isActive ? 600 : undefined,
                }}
              >
                {h.text}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Quick navigation links: Back to top + Sub-pages */}
      <div
        className={`shrink-0 border-t flex items-center justify-between gap-1.5 ${
          touchSized ? "px-4 py-2.5" : "px-2 py-1.5"
        }`}
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <button
          type="button"
          onClick={onJumpToTop}
          disabled={!isScrolledDown}
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors ${
            isScrolledDown
              ? "hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              : "opacity-40 cursor-default"
          }`}
          style={{
            color: isScrolledDown ? "var(--text-secondary)" : "var(--text-muted)",
          }}
          title="Scroll back to top"
        >
          <ArrowUp className="w-3 h-3 shrink-0" />
          <span>Top</span>
        </button>

        {hasSubPagesSection && (
          <button
            type="button"
            onClick={onJumpToSubPages}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
            title="Jump to Sub-pages section"
          >
            <CornerDownRight className="w-3 h-3 shrink-0 opacity-80" />
            <span>Sub-pages</span>
            {subPagesCount > 0 && (
              <span
                className="font-mono tabular-nums text-[10px]"
                style={{ color: "var(--text-muted)" }}
              >
                {subPagesCount}
              </span>
            )}
          </button>
        )}
      </div>
    </>
  );
};

interface DesktopFloatingTocProps {
  headings: TocHeadingItem[];
  activeHeadingId: string | null;
  isScrolledDown: boolean;
  hasSubPagesSection: boolean;
  subPagesCount: number;
  connOpenDesktop: boolean;
  preferredMode: DesktopTocMode;
  onTogglePreferredMode: () => void;
  onJumpToHeading: (item: TocHeadingItem) => void;
  onJumpToTop: () => void;
  onJumpToSubPages: () => void;
}

export const DesktopFloatingToc: React.FC<DesktopFloatingTocProps> = ({
  headings,
  activeHeadingId,
  isScrolledDown,
  hasSubPagesSection,
  subPagesCount,
  connOpenDesktop,
  preferredMode,
  onTogglePreferredMode,
  onJumpToHeading,
  onJumpToTop,
  onJumpToSubPages,
}) => {
  const [hoverCardOpen, setHoverCardOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const effectiveMode: DesktopTocMode = connOpenDesktop ? "compact" : preferredMode;

  useEffect(() => {
    if (effectiveMode === "full") {
      setHoverCardOpen(false);
    }
  }, [effectiveMode]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const openHoverCard = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setHoverCardOpen(true);
  };

  const scheduleCloseHoverCard = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setHoverCardOpen(false);
    }, 150);
  };

  if (headings.length < 3) return null;

  if (effectiveMode === "compact") {
    return (
      <div
        className="hidden lg:block absolute top-4 right-5 z-20 select-none"
        onMouseEnter={openHoverCard}
        onMouseLeave={scheduleCloseHoverCard}
        onKeyDown={(e) => {
          if (e.key === "Escape") setHoverCardOpen(false);
        }}
      >
        {/* Minimal Notion-style horizontal indicator lines */}
        <div
          aria-label="Table of Contents lines"
          className={`flex flex-col items-end py-1.5 px-1 rounded-lg transition-opacity duration-150 ${
            hoverCardOpen ? "opacity-0 pointer-events-none" : "opacity-100"
          } max-h-[calc(100vh-11rem)] overflow-y-auto no-scrollbar`}
        >
          {headings.map((h) => {
            const isActive = h.id === activeHeadingId;
            const widthClass =
              h.depth === 0 ? "w-5" : h.depth === 1 ? "w-3.5" : "w-2.5";
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => onJumpToHeading(h)}
                aria-label={`Jump to ${h.text}`}
                title={`H${h.level} · ${h.text}`}
                className="py-[4.5px] px-1 flex items-center justify-end cursor-pointer group"
              >
                <span
                  className={`block rounded-full transition-all duration-150 ${widthClass} ${
                    isActive
                      ? "h-[2.5px]"
                      : "h-[2px] opacity-45 group-hover:opacity-95"
                  }`}
                  style={{
                    backgroundColor: isActive
                      ? "var(--accent)"
                      : "var(--text-muted)",
                  }}
                />
              </button>
            );
          })}
        </div>

        {/* Floating TOC card expanded on hover */}
        {hoverCardOpen && (
          <aside
            aria-label="Table of Contents"
            className="absolute top-0 right-0 w-[236px] max-h-[min(64vh,460px)] flex flex-col rounded-xl border shadow-xl backdrop-blur-md overflow-hidden"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--bg-elevated) 95%, transparent)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div
              className="shrink-0 px-3 py-2 border-b flex items-center justify-between gap-2"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider min-w-0"
                style={{ color: "var(--text-muted)" }}
              >
                <ListTree
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: "var(--accent)" }}
                />
                <span className="truncate">Contents</span>
                <span className="font-mono tabular-nums opacity-75">
                  {headings.length}
                </span>
              </span>

              {!connOpenDesktop ? (
                <button
                  type="button"
                  onClick={() => {
                    setHoverCardOpen(false);
                    onTogglePreferredMode();
                  }}
                  title="Pin expanded TOC rail"
                  aria-label="Pin expanded TOC rail"
                  className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  <PanelRightOpen className="w-3.5 h-3.5" />
                </button>
              ) : (
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    color: "var(--text-muted)",
                  }}
                  title="Compact lines while Connections panel is open"
                >
                  compact
                </span>
              )}
            </div>

            <TocHeadingNavList
              headings={headings}
              activeHeadingId={activeHeadingId}
              isScrolledDown={isScrolledDown}
              hasSubPagesSection={hasSubPagesSection}
              subPagesCount={subPagesCount}
              onJumpToHeading={onJumpToHeading}
              onJumpToTop={onJumpToTop}
              onJumpToSubPages={onJumpToSubPages}
            />
          </aside>
        )}
      </div>
    );
  }

  return (
    <aside
      aria-label="Table of Contents"
      className="hidden lg:flex flex-col absolute top-4 right-5 z-20 w-[204px] xl:w-[224px] max-h-[min(66vh,480px)] rounded-xl border backdrop-blur-md shadow-sm overflow-hidden"
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--bg-surface) 92%, transparent)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div
        className="shrink-0 px-3 py-2 border-b flex items-center justify-between gap-2"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider min-w-0"
          style={{ color: "var(--text-muted)" }}
        >
          <ListTree
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: "var(--accent)" }}
          />
          <span className="truncate">Contents</span>
          <span className="font-mono tabular-nums opacity-75">
            {headings.length}
          </span>
        </span>

        <button
          type="button"
          onClick={onTogglePreferredMode}
          title="Collapse to Notion-style compact lines"
          aria-label="Collapse to compact lines"
          className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
          style={{ color: "var(--text-muted)" }}
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <TocHeadingNavList
        headings={headings}
        activeHeadingId={activeHeadingId}
        isScrolledDown={isScrolledDown}
        hasSubPagesSection={hasSubPagesSection}
        subPagesCount={subPagesCount}
        onJumpToHeading={onJumpToHeading}
        onJumpToTop={onJumpToTop}
        onJumpToSubPages={onJumpToSubPages}
      />
    </aside>
  );
};

interface MobileStickyTocBarProps {
  headings: TocHeadingItem[];
  activeHeadingId: string | null;
  onOpen: () => void;
}

export const MobileStickyTocBar: React.FC<MobileStickyTocBarProps> = ({
  headings,
  activeHeadingId,
  onOpen,
}) => {
  if (headings.length < 3) return null;

  const activeIndex = Math.max(
    0,
    headings.findIndex((h) => h.id === activeHeadingId),
  );
  const current = headings[activeIndex] ?? headings[0];

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open Table of Contents"
      className="lg:hidden shrink-0 w-full px-4 sm:px-6 py-1.5 border-b flex items-center justify-between gap-2 text-left transition-colors active:bg-[var(--bg-surface-hover)] cursor-pointer"
      style={{
        backgroundColor: "var(--bg-surface-subtle)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <span className="inline-flex items-center gap-2 min-w-0 flex-1">
        <ListTree
          className="w-3.5 h-3.5 shrink-0"
          style={{ color: "var(--accent)" }}
        />
        <span
          className="font-mono tabular-nums text-[10px] shrink-0 px-1 py-0.5 rounded"
          style={{
            backgroundColor: "var(--accent-soft)",
            color: "var(--accent)",
          }}
        >
          H{current.level}
        </span>
        <span
          className="text-xs font-medium truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {current.text}
        </span>
      </span>

      <span
        className="inline-flex items-center gap-1 shrink-0 text-[11px] font-mono tabular-nums"
        style={{ color: "var(--text-muted)" }}
      >
        <span>
          {activeIndex + 1}/{headings.length}
        </span>
        <ChevronDown className="w-3.5 h-3.5 opacity-75" />
      </span>
    </button>
  );
};

interface MobileTocBottomSheetProps {
  open: boolean;
  headings: TocHeadingItem[];
  activeHeadingId: string | null;
  isScrolledDown: boolean;
  hasSubPagesSection: boolean;
  subPagesCount: number;
  onClose: () => void;
  onJumpToHeading: (item: TocHeadingItem) => void;
  onJumpToTop: () => void;
  onJumpToSubPages: () => void;
}

export const MobileTocBottomSheet: React.FC<MobileTocBottomSheetProps> = ({
  open,
  headings,
  activeHeadingId,
  isScrolledDown,
  hasSubPagesSection,
  subPagesCount,
  onClose,
  onJumpToHeading,
  onJumpToTop,
  onJumpToSubPages,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open || headings.length < 3) return null;

  return (
    <div
      className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Table of Contents"
    >
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-hidden="true"
      />

      <div
        className="relative z-10 w-full max-h-[72vh] rounded-t-2xl border-t shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-subtle)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Drag handle indicator */}
        <div className="pt-2.5 pb-1 flex justify-center shrink-0">
          <span
            className="w-9 h-1 rounded-full"
            style={{ backgroundColor: "var(--border-strong)" }}
          />
        </div>

        <div
          className="px-4 pb-2.5 border-b flex items-center justify-between gap-2 shrink-0"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <span className="inline-flex items-center gap-2 min-w-0">
            <ListTree
              className="w-4 h-4 shrink-0"
              style={{ color: "var(--accent)" }}
            />
            <span
              className="text-sm font-semibold truncate"
              style={{ color: "var(--text-primary)" }}
            >
              Table of Contents
            </span>
            <span
              className="text-xs font-mono tabular-nums"
              style={{ color: "var(--text-muted)" }}
            >
              {headings.length}
            </span>
          </span>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Table of Contents"
            className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <TocHeadingNavList
          headings={headings}
          activeHeadingId={activeHeadingId}
          isScrolledDown={isScrolledDown}
          hasSubPagesSection={hasSubPagesSection}
          subPagesCount={subPagesCount}
          touchSized
          onJumpToHeading={(item) => {
            onClose();
            onJumpToHeading(item);
          }}
          onJumpToTop={() => {
            onClose();
            onJumpToTop();
          }}
          onJumpToSubPages={() => {
            onClose();
            onJumpToSubPages();
          }}
        />
      </div>
    </div>
  );
};
