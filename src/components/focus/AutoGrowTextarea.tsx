import React, { useCallback, useLayoutEffect, useRef } from "react";

interface AutoGrowTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> {
  value: string;
  minRows?: number;
}

export const AutoGrowTextarea: React.FC<AutoGrowTextareaProps> = ({
  value,
  minRows = 2,
  className = "",
  style,
  onChange,
  ...rest
}) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const syncHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      syncHeight();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncHeight]);

  return (
    <textarea
      ref={ref}
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
};
