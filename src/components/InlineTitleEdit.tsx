import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface InlineTitleEditProps {
  value: string;
  onCommit: (nextTitle: string) => void;
  allowMobileEdit?: boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}

export const InlineTitleEdit: React.FC<InlineTitleEditProps> = ({
  value,
  onCommit,
  allowMobileEdit = false,
  disabled = false,
  className = '',
  style,
  placeholder = 'Untitled',
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!editing || !el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, draft]);

  const startEditing = (e: React.MouseEvent) => {
    if (disabled) return;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    if (isMobile && !allowMobileEdit) {
      return; // Let row click open DetailSheet on mobile
    }
    e.stopPropagation();
    committedRef.current = false;
    setDraft(value);
    setEditing(true);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  };

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== value) {
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
      <textarea
        ref={textareaRef}
        rows={1}
        value={draft}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => cancel()}
        onChange={(e) => setDraft(e.target.value.replace(/\r?\n/g, ' '))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancel();
          }
        }}
        placeholder={placeholder}
        className={`w-full resize-none overflow-hidden bg-[var(--bg-surface-subtle)] border-0 outline-none rounded-md px-1.5 -mx-1.5 py-0.5 m-0 leading-snug ring-1 ring-[var(--accent)]/40 transition-colors ${className}`}
        style={{
          color: 'var(--text-primary)',
          ...style,
        }}
      />
    );
  }

  return (
    <span
      onClick={startEditing}
      className={`block break-words leading-snug rounded-md px-1.5 -mx-1.5 py-0.5 transition-colors ${
        !disabled ? 'sm:cursor-text sm:hover:bg-[var(--bg-surface-hover)]/75' : ''
      } ${
        allowMobileEdit && !disabled
          ? 'cursor-text hover:bg-[var(--bg-surface-hover)]/75'
          : ''
      } ${className}`}
      style={style}
      title={disabled ? undefined : 'Click to edit title · Double-click for details'}
    >
      {value || placeholder}
    </span>
  );
};
