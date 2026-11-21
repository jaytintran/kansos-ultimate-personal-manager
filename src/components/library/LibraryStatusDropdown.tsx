import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Library,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SmartView } from "../../../library";
import type { ActiveLibraryFilter } from "./LibrarySidebar";

interface LibraryStatusDropdownProps {
  activeFilter: ActiveLibraryFilter;
  smartCounts: Record<SmartView, number>;
  onSelectFilter: (filter: ActiveLibraryFilter) => void;
}

const STATUS_ITEMS: Array<{
  id: SmartView;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    id: "all",
    label: "All Books",
    icon: <Library className="w-3.5 h-3.5 shrink-0" />,
  },
  {
    id: "reading",
    label: "Reading",
    icon: <BookOpen className="w-3.5 h-3.5 shrink-0" />,
  },
  {
    id: "unread",
    label: "Unread",
    icon: <Circle className="w-3.5 h-3.5 shrink-0" />,
  },
  {
    id: "finished",
    label: "Finished",
    icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
  },
];

const STATUS_IDS = new Set<SmartView>(STATUS_ITEMS.map((i) => i.id));

function isStatusActive(activeFilter: ActiveLibraryFilter): boolean {
  return (
    activeFilter.kind === "smart" &&
    STATUS_IDS.has(activeFilter.id as SmartView)
  );
}

export const LibraryStatusDropdown: React.FC<LibraryStatusDropdownProps> = ({
  activeFilter,
  smartCounts,
  onSelectFilter,
}) => {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos({
      top: r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 224),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updateMenuPosition]);

  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const activeStatus = useMemo(() => {
    if (!isStatusActive(activeFilter)) return null;
    return STATUS_ITEMS.find((i) => i.id === activeFilter.id) ?? null;
  }, [activeFilter]);

  // When a non-status filter is active, keep the trigger muted but still
  // showing "All Books" so the control remains predictable.
  const displayItem = activeStatus ?? STATUS_ITEMS[0];
  const triggerIsActive = Boolean(activeStatus);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => (i + 1) % STATUS_ITEMS.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex(
          (i) => (i - 1 + STATUS_ITEMS.length) % STATUS_ITEMS.length,
        );
      } else if (e.key === "Home") {
        e.preventDefault();
        setHighlightedIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setHighlightedIndex(STATUS_ITEMS.length - 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const item = STATUS_ITEMS[highlightedIndex];
        if (item) {
          onSelectFilter({ kind: "smart", id: item.id });
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, highlightedIndex, onSelectFilter]);

  const handleOpen = () => {
    const idx = STATUS_ITEMS.findIndex((i) => i.id === displayItem.id);
    setHighlightedIndex(idx >= 0 ? idx : 0);
    if (!open) updateMenuPosition();
    setOpen((v) => !v);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      {/* Trigger — visually identical to a strip tab */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (
            !open &&
            (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault();
            handleOpen();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={
          triggerIsActive
            ? `${displayItem.label} — click to switch status`
            : "Filter by reading status"
        }
        className="h-10 px-3 inline-flex items-center gap-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer"
        style={{
          borderColor: triggerIsActive ? "var(--accent)" : "transparent",
          color: triggerIsActive
            ? "var(--text-primary)"
            : "var(--text-secondary)",
          backgroundColor: triggerIsActive
            ? "var(--accent-soft)"
            : "transparent",
        }}
      >
        <span
          style={{
            color: triggerIsActive ? "var(--accent)" : "var(--text-muted)",
          }}
        >
          {displayItem.icon}
        </span>
        <span className={triggerIsActive ? "font-semibold" : ""}>
          {displayItem.label}
        </span>
        <span
          className="font-mono tabular-nums text-[11px] opacity-75"
          style={{
            color: triggerIsActive ? "var(--accent)" : "var(--text-muted)",
          }}
        >
          {smartCounts[displayItem.id]}
        </span>
        <ChevronDown
          className={`w-3 h-3 opacity-60 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            aria-label="Reading status"
            className="fixed z-[60] w-56 rounded-lg border overflow-hidden"
            style={{
              top: menuPos?.top ?? 0,
              left: menuPos?.left ?? 0,
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            {STATUS_ITEMS.map((item, index) => {
              const selected = activeStatus?.id === item.id;
              const highlighted = highlightedIndex === index;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => {
                    onSelectFilter({ kind: "smart", id: item.id });
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className="w-full h-9 px-3 flex items-center gap-2 text-xs text-left transition-colors cursor-pointer"
                  style={{
                    backgroundColor: selected
                      ? "var(--accent-soft)"
                      : highlighted
                        ? "var(--bg-surface-hover)"
                        : "transparent",
                    color: selected ? "var(--accent)" : "var(--text-primary)",
                  }}
                >
                  <span
                    style={{
                      color: selected ? "var(--accent)" : "var(--text-muted)",
                    }}
                  >
                    {item.icon}
                  </span>
                  <span className={selected ? "font-semibold" : ""}>
                    {item.label}
                  </span>
                  <span className="ml-auto font-mono tabular-nums text-[11px] opacity-75">
                    {smartCounts[item.id]}
                  </span>
                  {selected && (
                    <Check
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: "var(--accent)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
