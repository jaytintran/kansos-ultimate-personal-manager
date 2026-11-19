import React, { useMemo, useState } from 'react';
import { Clock, CornerDownLeft } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { parseNlpInput } from '../utils/nlp';

interface NlpInputBarProps {
  placeholder: string;
  onSubmit: (rawText: string) => boolean | void;
  baseDateKey?: string;
  disabled?: boolean;
  disabledHint?: string;
  leadingSlot?: React.ReactNode;
  submitLabel?: string;
  compact?: boolean;
  previewPosition?: 'bottom' | 'top';
  elevated?: boolean;
  onEmptyTab?: () => void;
}

export const NlpInputBar: React.FC<NlpInputBarProps> = ({
  placeholder,
  onSubmit,
  baseDateKey,
  disabled = false,
  disabledHint,
  leadingSlot,
  submitLabel = 'Add',
  compact = false,
  previewPosition = 'bottom',
  elevated = false,
  onEmptyTab,
}) => {
  const { workspace } = useWorkspace();
  const [value, setValue] = useState('');

  const parsed = useMemo(
    () => parseNlpInput(value, baseDateKey, workspace.settings.timeFormat),
    [value, baseDateKey, workspace.settings.timeFormat]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || !value.trim()) return;
    const result = onSubmit(value);
    if (result !== false) {
      setValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && !value && onEmptyTab) {
      e.preventDefault();
      onEmptyTab();
    }
  };

  const previewNode =
    parsed.previewLabel && !disabled ? (
      <div
        className={`${
          previewPosition === 'top' ? 'mb-1.5 px-3 py-1.5 rounded-lg border' : 'mt-1.5 px-1'
        } flex items-center gap-1.5 text-xs`}
        style={{
          color: 'var(--accent)',
          backgroundColor: previewPosition === 'top' ? 'var(--bg-elevated)' : 'transparent',
          borderColor: previewPosition === 'top' ? 'var(--border-subtle)' : 'transparent',
          boxShadow: previewPosition === 'top' ? 'var(--shadow-popover)' : 'none',
        }}
      >
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span className="font-mono tabular-nums shrink-0">{parsed.previewLabel}</span>
        <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>
          ·
        </span>
        <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
          {parsed.cleanTitle}
        </span>
      </div>
    ) : null;

  return (
    <form onSubmit={handleSubmit} className="w-full">
      {previewPosition === 'top' && previewNode}

      <div
        className={`flex items-center gap-2 rounded-2xl border transition-colors ${
          compact ? 'px-2.5 py-1.5' : 'px-2.5 sm:px-3 py-2'
        }`}
        style={{
          backgroundColor: elevated ? 'var(--bg-elevated)' : 'var(--bg-surface)',
          borderColor: elevated ? 'var(--border-strong)' : 'var(--border-subtle)',
          boxShadow: elevated ? 'var(--shadow-popover)' : 'none',
          opacity: disabled ? 0.72 : 1,
        }}
      >
        {leadingSlot}

        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled && disabledHint ? disabledHint : placeholder}
          className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:opacity-60 min-h-[36px]"
          style={{ color: 'var(--text-primary)' }}
          aria-label={placeholder}
        />

        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="h-9 px-3 sm:px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-opacity whitespace-nowrap shrink-0 disabled:opacity-40"
          style={{
            backgroundColor: value.trim() && !disabled ? 'var(--accent)' : 'var(--bg-surface-subtle)',
            color: value.trim() && !disabled ? 'var(--accent-fg)' : 'var(--text-muted)',
          }}
        >
          <span className="hidden sm:inline">{submitLabel}</span>
          <CornerDownLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      {previewPosition === 'bottom' && previewNode}
    </form>
  );
};
