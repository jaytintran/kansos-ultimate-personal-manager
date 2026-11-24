import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TruncatedNoteTitleProps {
  title: string;
  as?: "h2" | "span";
  className?: string;
  style?: React.CSSProperties;
}

export const TruncatedNoteTitle: React.FC<TruncatedNoteTitleProps> = ({
  title,
  as = "h2",
  className = "",
  style,
}) => {
  const textRef = useRef<HTMLElement | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
    placement: "above" | "below";
    maxWidth: number;
  } | null>(null);

  const displayTitle = title || "Untitled Note";

  const hideTooltip = useCallback(() => {
    setTooltipPos(null);
  }, []);

  const showIfTruncated = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth + 1) {
      setTooltipPos(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const margin = 12;
    const maxWidth = Math.min(340, Math.max(200, window.innerWidth - margin * 2));
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - maxWidth - margin),
    );
    const placement: "above" | "below" = rect.top > 72 ? "above" : "below";
    const top = placement === "above" ? rect.top - 6 : rect.bottom + 6;
    setTooltipPos({ top, left, placement, maxWidth });
  }, []);

  useEffect(() => {
    if (!tooltipPos) return;
    const handleClear = () => setTooltipPos(null);
    window.addEventListener("scroll", handleClear, true);
    window.addEventListener("resize", handleClear);
    return () => {
      window.removeEventListener("scroll", handleClear, true);
      window.removeEventListener("resize", handleClear);
    };
  }, [tooltipPos]);

  const setRef = (node: HTMLElement | null) => {
    textRef.current = node;
  };

  const Tag = as;

  return (
    <>
      <Tag
        ref={setRef as React.Ref<never>}
        onMouseEnter={showIfTruncated}
        onMouseLeave={hideTooltip}
        onMouseDown={hideTooltip}
        className={`truncate ${className}`}
        style={style}
      >
        {displayTitle}
      </Tag>

      {tooltipPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[95] rounded-lg border px-2.5 py-1.5 text-xs font-medium leading-snug break-words"
            style={{
              top: `${tooltipPos.top}px`,
              left: `${tooltipPos.left}px`,
              maxWidth: `${tooltipPos.maxWidth}px`,
              transform:
                tooltipPos.placement === "above"
                  ? "translateY(-100%)"
                  : undefined,
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              color: "var(--text-primary)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            {displayTitle}
          </div>,
          document.body,
        )}
    </>
  );
};
