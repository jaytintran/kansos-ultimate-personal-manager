import React, { useEffect, useRef, useState } from "react";

interface InlineEditableTextProps {
  value: string;
  onCommit: (nextValue: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  align?: "left" | "center";
  mono?: boolean;
  allowEmpty?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

export const InlineEditableText: React.FC<InlineEditableTextProps> = ({
  value,
  onCommit,
  placeholder = "Click to add",
  className = "",
  inputClassName = "",
  align = "left",
  mono = false,
  allowEmpty = true,
  disabled = false,
  ariaLabel,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  const startEditing = (e: React.MouseEvent | React.FocusEvent) => {
    if (disabled) return;
    e.stopPropagation();
    committedRef.current = false;
    setDraft(value);
    setEditing(true);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  };

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = draft.trim();
    setEditing(false);
    if (!allowEmpty && !trimmed) {
      setDraft(value);
      return;
    }
    if (trimmed !== value) {
      onCommit(trimmed);
    } else {
      setDraft(value);
    }
  };

  const cancel = () => {
    committedRef.current = true;
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            cancel();
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        className={`w-full min-w-0 rounded-lg px-2 py-1 outline-none ring-1 ring-[var(--accent)] transition-colors ${
          align === "center" ? "text-center" : "text-left"
        } ${mono ? "font-mono" : ""} ${inputClassName} ${className}`}
        style={{
          backgroundColor: "var(--bg-surface-subtle)",
          color: "var(--text-primary)",
        }}
      />
    );
  }

  const hasValue = value.trim().length > 0;

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      aria-label={ariaLabel || (hasValue ? value : placeholder)}
      title={disabled ? undefined : "Click to edit"}
      className={`max-w-full rounded-lg px-2 py-0.5 transition-colors hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
        align === "center" ? "text-center" : "text-left"
      } ${mono ? "font-mono" : ""} ${
        disabled ? "cursor-default" : "cursor-text"
      } ${className}`}
      style={{
        color: hasValue ? "var(--text-primary)" : "var(--text-muted)",
      }}
    >
      <span className={hasValue ? "" : "opacity-75"}>
        {hasValue ? value : placeholder}
      </span>
    </button>
  );
};
