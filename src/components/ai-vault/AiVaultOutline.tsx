import React, { useEffect, useRef, useState } from "react";
import {
  AlignRight,
  ArrowUp,
  ChevronDown,
  ListTree,
  PanelRightOpen,
  X,
} from "lucide-react";

export interface AiOutlineItem {
  id: string; // e.g. turnId or `${turnId}::h0`
  kind: "turn" | "heading";
  turnId: string;
  turnRole?: "user" | "assistant" | "note";
  badge: string; // "Q1", "A1", "N1", or "H2"
  label: string;
  depth: number; // 0 for turn, 1..3 for headings
}

export type AiOutlineMode = "full" | "compact";

interface OutlineSharedListProps {
  items: AiOutlineItem[];
  activeItemId: string | null;
  isScrolledDown: boolean;
  onJumpToItem: (item: AiOutlineItem) => void;
  onJumpToTop: () => void;
  touchSized?: boolean;
}

const OutlineNavList: React.FC<OutlineSharedListProps> = ({
  items,
  activeItemId,
  isScrolledDown,
  onJumpToItem,
  onJumpToTop,
  touchSized = false,
}) => {
  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!activeItemId) return;
    const nav = navRef.current;
    const btn = itemRefs.current.get(activeItemId);
    if (!nav || !btn) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    if (btnRect.top < navRect.top + 8) {
      nav.scrollTop -= navRect.top + 8 - btnRect.top;
    } else if (btnRect.bottom > navRect.bottom - 8) {
      nav.scrollTop += btnRect.bottom - (navRect.bottom - 8);
    }
  }, [activeItemId]);

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Conversation outline"
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-0.5 ${
          touchSized ? "px-3 py-2" : "px-1.5 py-1.5"
        }`}
      >
        {items.map((item) => {
          const isActive = item.id === activeItemId;
          const isTurn = item.kind === "turn";
          return (
            <button
              key={item.id}
              ref={(el) => {
                if (el) itemRefs.current.set(item.id, el);
                else itemRefs.current.delete(item.id);
              }}
              type="button"
              onClick={() => onJumpToItem(item)}
              aria-current={isActive ? "location" : undefined}
              title={item.label}
              className={`relative w-full flex items-center gap-1.5 text-left rounded-lg transition-colors cursor-pointer group ${
                touchSized ? "py-2.5 pr-3" : "py-1.5 pr-2"
              } hover:bg-[var(--bg-surface-hover)]`}
              style={{
                paddingLeft: `${item.depth * (touchSized ? 12 : 9) + (touchSized ? 12 : 10)}px`,
                backgroundColor: isActive
                  ? "color-mix(in srgb, var(--accent) 9%, transparent)"
                  : undefined,
              }}
            >
              <span
                aria-hidden="true"
                className="absolute left-1 top-1.5 bottom-1.5 w-[2px] rounded-full transition-opacity duration-150"
                style={{
                  backgroundColor: "var(--accent)",
                  opacity: isActive ? 1 : 0,
                }}
              />

              <span
                className="font-mono tabular-nums text-[10px] shrink-0"
                style={{
                  color: isActive
                    ? "var(--accent)"
                    : isTurn
                      ? "var(--text-secondary)"
                      : "var(--text-muted)",
                  fontWeight: isTurn ? 600 : 500,
                }}
              >
                {item.badge}
              </span>

              <span
                className={`truncate leading-snug ${
                  touchSized
                    ? isTurn
                      ? "text-sm font-medium"
                      : "text-xs"
                    : isTurn
                      ? "text-xs font-medium"
                      : "text-[11.5px]"
                }`}
                style={{
                  color: isActive
                    ? "var(--accent)"
                    : isTurn
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  fontWeight: isActive ? 600 : undefined,
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

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
        >
          <ArrowUp className="w-3 h-3 shrink-0" />
          <span>Top</span>
        </button>
        <span
          className="text-[10.5px] font-mono tabular-nums"
          style={{ color: "var(--text-muted)" }}
        >
          {items.filter((i) => i.kind === "turn").length} turns
        </span>
      </div>
    </>
  );
};

interface DesktopAiVaultOutlineProps {
  items: AiOutlineItem[];
  activeItemId: string | null;
  isScrolledDown: boolean;
  connOpenDesktop: boolean;
  preferredMode: AiOutlineMode;
  onTogglePreferredMode: () => void;
  onJumpToItem: (item: AiOutlineItem) => void;
  onJumpToTop: () => void;
}

export const DesktopAiVaultOutline: React.FC<DesktopAiVaultOutlineProps> = ({
  items,
  activeItemId,
  isScrolledDown,
  connOpenDesktop,
  preferredMode,
  onTogglePreferredMode,
  onJumpToItem,
  onJumpToTop,
}) => {
  const [hoverCardOpen, setHoverCardOpen] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);

  const effectiveCompact = connOpenDesktop || preferredMode === "compact";

  useEffect(() => {
    setHoverCardOpen(false);
  }, [effectiveCompact]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  if (items.length === 0) return null;

  const scheduleClose = () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = window.setTimeout(() => {
      setHoverCardOpen(false);
    }, 150);
  };

  const cancelClose = () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  if (effectiveCompact) {
    return (
      <div
        className="hidden lg:block sticky top-12 z-20 self-start ml-auto mr-3 xl:mr-5"
        onMouseEnter={() => {
          cancelClose();
          setHoverCardOpen(true);
        }}
        onMouseLeave={scheduleClose}
      >
        <div
          aria-label="Conversation outline bars"
          className="flex flex-col items-end gap-[5px] py-2 px-1.5 rounded-lg cursor-pointer"
        >
          {items.slice(0, 32).map((item) => {
            const isActive = item.id === activeItemId;
            const barWidth =
              item.kind === "turn" ? 18 : item.depth <= 1 ? 13 : 9;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onJumpToItem(item)}
                title={`${item.badge} · ${item.label}`}
                aria-label={`Jump to ${item.label}`}
                className="h-[2.5px] rounded-full transition-all duration-150 cursor-pointer"
                style={{
                  width: `${isActive ? Math.max(barWidth, 20) : barWidth}px`,
                  backgroundColor: isActive
                    ? "var(--accent)"
                    : "var(--border-strong)",
                  opacity: isActive ? 1 : item.kind === "turn" ? 0.72 : 0.42,
                }}
              />
            );
          })}
        </div>

        {hoverCardOpen && (
          <div
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            className="absolute right-0 top-0 w-64 max-h-[calc(100dvh-11rem)] rounded-xl border flex flex-col overflow-hidden"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div
              className="px-3 py-2 border-b flex items-center justify-between gap-2 shrink-0"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <span
                className="text-[11px] font-semibold uppercase tracking-wider inline-flex items-center gap-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                <ListTree className="w-3 h-3" style={{ color: "var(--accent)" }} />
                <span>Outline</span>
              </span>
              {!connOpenDesktop && (
                <button
                  type="button"
                  onClick={() => {
                    setHoverCardOpen(false);
                    onTogglePreferredMode();
                  }}
                  title="Expand outline"
                  className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                >
                  <PanelRightOpen className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <OutlineNavList
              items={items}
              activeItemId={activeItemId}
              isScrolledDown={isScrolledDown}
              onJumpToItem={(item) => {
                onJumpToItem(item);
                setHoverCardOpen(false);
              }}
              onJumpToTop={() => {
                onJumpToTop();
                setHoverCardOpen(false);
              }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <aside
      aria-label="Conversation outline"
      className="hidden lg:flex lg:flex-col sticky top-12 z-10 self-start ml-auto mr-3 xl:mr-5 w-52 xl:w-56 max-h-[calc(100dvh-10rem)] rounded-xl border overflow-hidden transition-colors"
      style={{
        backgroundColor: "color-mix(in srgb, var(--bg-surface) 90%, transparent)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div
        className="px-2.5 py-2 border-b flex items-center justify-between gap-1.5 shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <span
          className="text-[10.5px] font-semibold uppercase tracking-wider inline-flex items-center gap-1.5"
          style={{ color: "var(--text-muted)" }}
        >
          <ListTree className="w-3 h-3" style={{ color: "var(--accent)" }} />
          <span>Outline</span>
        </span>
        <button
          type="button"
          onClick={onTogglePreferredMode}
          title="Collapse to compact bars"
          aria-label="Collapse outline to compact bars"
          className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          style={{ color: "var(--text-muted)" }}
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <OutlineNavList
        items={items}
        activeItemId={activeItemId}
        isScrolledDown={isScrolledDown}
        onJumpToItem={onJumpToItem}
        onJumpToTop={onJumpToTop}
      />
    </aside>
  );
};

interface MobileAiVaultOutlineProps {
  items: AiOutlineItem[];
  activeItemId: string | null;
  isScrolledDown: boolean;
  drawerOpen: boolean;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
  onJumpToItem: (item: AiOutlineItem) => void;
  onJumpToTop: () => void;
}

export const MobileAiVaultOutline: React.FC<MobileAiVaultOutlineProps> = ({
  items,
  activeItemId,
  isScrolledDown,
  drawerOpen,
  onOpenDrawer,
  onCloseDrawer,
  onJumpToItem,
  onJumpToTop,
}) => {
  if (items.length === 0) return null;
  const activeItem = items.find((i) => i.id === activeItemId) || items[0];

  return (
    <>
      {/* Compact Sticky Active-Turn / Jump Bar (<= 15% height cap) */}
      <div className="lg:hidden sticky top-2 z-20 mb-3">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="w-full h-9 px-3 rounded-xl border flex items-center justify-between gap-2 text-left backdrop-blur-md"
          style={{
            backgroundColor: "color-mix(in srgb, var(--bg-surface) 92%, transparent)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <span className="flex items-center gap-2 min-w-0">
            <ListTree className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--accent)" }} />
            <span
              className="text-[10.5px] font-mono tabular-nums shrink-0"
              style={{ color: "var(--accent)" }}
            >
              {activeItem.badge}
            </span>
            <span
              className="text-xs font-medium truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {activeItem.label}
            </span>
          </span>
          <span
            className="text-[10.5px] font-mono inline-flex items-center gap-1 shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            <span>Jump</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </span>
        </button>
      </div>

      {/* Bottom Sheet Drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bg-black/50 backdrop-blur-[1px] overscroll-none"
          onClick={onCloseDrawer}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Conversation outline"
            className="w-full max-h-[75dvh] rounded-t-2xl border-t flex flex-col overflow-hidden pb-safe"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div
                className="w-9 h-1 rounded-full"
                style={{ backgroundColor: "var(--border-strong)" }}
              />
            </div>
            <div
              className="px-4 py-2 border-b flex items-center justify-between shrink-0"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-center gap-2">
                <ListTree className="w-4 h-4" style={{ color: "var(--accent)" }} />
                <span className="text-sm font-semibold">Jump to Turn & Heading</span>
              </div>
              <button
                type="button"
                onClick={onCloseDrawer}
                aria-label="Close outline"
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)]"
                style={{ color: "var(--text-muted)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <OutlineNavList
              items={items}
              activeItemId={activeItemId}
              isScrolledDown={isScrolledDown}
              touchSized
              onJumpToItem={(item) => {
                onCloseDrawer();
                window.setTimeout(() => onJumpToItem(item), 60);
              }}
              onJumpToTop={() => {
                onCloseDrawer();
                window.setTimeout(() => onJumpToTop(), 60);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
};
