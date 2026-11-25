import React, { useCallback, useLayoutEffect, useRef } from "react";

interface AutoGrowTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> {
  value: string;
  minRows?: number;
}

export const AutoGrowTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutoGrowTextareaProps
>(({ value, minRows = 2, className = "", style, onChange, ...rest }, forwardedRef) => {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const setRefs = useCallback(
    (el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      if (typeof forwardedRef === "function") {
        forwardedRef(el);
      } else if (forwardedRef) {
        forwardedRef.current = el;
      }
    },
    [forwardedRef],
  );

  const syncHeight = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      syncHeight();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncHeight]);

  return (
    <textarea
      ref={setRefs}
      rows={minRows}
      value={value}
      onChange={(e) => {
        onChange?.(e);
        syncHeight();
      }}
      className={`w-full bg-transparent resize-none overflow-hidden outline-none ${className}`}
      style={style}
      {...rest}
    />
  );
});

AutoGrowTextarea.displayName = "AutoGrowTextarea";
