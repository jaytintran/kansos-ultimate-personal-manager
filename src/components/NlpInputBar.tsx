import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckSquare,
  Clock,
  CornerDownLeft,
  FileText,
  Flame,
  Hash,
  Info,
  Timer,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { EntryType } from '../types';
import { parseNlpInput } from '../utils/nlp';

const TYPE_OPTIONS: {
  id: EntryType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'task', label: 'Task', icon: CheckSquare },
  { id: 'log', label: 'Log', icon: Flame },
  { id: 'note', label: 'Note', icon: FileText },
  { id: 'event', label: 'Event', icon: Calendar },
  { id: 'timeblock', label: 'Block', icon: Timer },
];

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
  typeSwitcher?: {
    value: EntryType;
    onChange: (next: EntryType) => void;
  };
  availableTags?: string[];
  showTimeblockTip?: boolean;
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
  typeSwitcher,
  availableTags = [],
  showTimeblockTip = true,
}) => {
  const { workspace } = useWorkspace();
  const [value, setValue] = useState('');

  const parsed = useMemo(
    () => parseNlpInput(value, baseDateKey, workspace.settings.timeFormat),
    [value, baseDateKey, workspace.settings.timeFormat]
  );

  // Sync segmented type switcher if user types /task, /log, /note, /event, /timeblock
  useEffect(() => {
    if (typeSwitcher && parsed.detectedType && parsed.detectedType !== typeSwitcher.value) {
      typeSwitcher.onChange(parsed.detectedType);
    }
  }, [parsed.detectedType, typeSwitcher]);

  // Detect active #tag autocomplete token at end of input
  const tagSuggestions = useMemo(() => {
    if (availableTags.length === 0) return [];
    const match = value.match(/(?:^|\s)#([a-zA-Z0-9_-]*)$/);
    if (!match) return [];
    const prefix = match[1].toLowerCase();
    return availableTags
      .filter((t) => !parsed.tags.includes(t) && t.toLowerCase().startsWith(prefix))
      .slice(0, 6);
  }, [value, availableTags, parsed.tags]);

  const applyTagSuggestion = (tag: string) => {
    setValue((prev) => prev.replace(/(^|\s)#[a-zA-Z0-9_-]*$/, `$1#${tag} `));
  };

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

  const activeType = parsed.detectedType || typeSwitcher?.value;
  const needsTimeblockTip =
    showTimeblockTip &&
    activeType === 'timeblock' &&
    !parsed.hasTimeRange &&
    !disabled;

  const hasTokens = parsed.tokens.length > 0 && !disabled;

  const previewNode =
    (hasTokens || needsTimeblockTip) && !disabled ? (
      <div
        className={`${
          previewPosition === 'top' ? 'mb-1.5 px-3 py-1.5 rounded-xl border' : 'mt-1.5 px-1'
        } flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs`}
        style={{
          backgroundColor: previewPosition === 'top' ? 'var(--bg-elevated)' : 'transparent',
          borderColor: previewPosition === 'top' ? 'var(--border-subtle)' : 'transparent',
          boxShadow: previewPosition === 'top' ? 'var(--shadow-popover)' : 'none',
        }}
      >
        {parsed.tokens.map((tok, i) => (
          <span
            key={`${tok.kind}-${tok.label}-${i}`}
            className="inline-flex items-center gap-1 font-mono tabular-nums text-[11px]"
            style={{
              color:
                tok.kind === 'type'
                  ? 'var(--color-entity-violet)'
                  : tok.kind === 'tag'
                  ? 'var(--text-secondary)'
                  : 'var(--accent)',
            }}
          >
            {tok.kind === 'time' || tok.kind === 'date' || tok.kind === 'duration' ? (
              <Clock className="w-3 h-3 shrink-0" />
            ) : tok.kind === 'tag' ? (
              <Hash className="w-3 h-3 shrink-0" />
            ) : null}
            <span>{tok.label}</span>
          </span>
        ))}

        {parsed.previewLabel && (
          <span className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
            · {parsed.cleanTitle}
          </span>
        )}

        {needsTimeblockTip && (
          <span
            className="inline-flex items-center gap-1 text-[11px]"
            style={{ color: 'var(--text-muted)' }}
          >
            <Info className="w-3 h-3 shrink-0" />
            <span>Tip: try &ldquo;from 1pm to 3pm&rdquo; or &ldquo;for 45m&rdquo;</span>
          </span>
        )}
      </div>
    ) : null;

  return (
    <form onSubmit={handleSubmit} className="w-full relative">
      {/* #tag Autocomplete Popover */}
      {tagSuggestions.length > 0 && !disabled && (
        <div
          className={`absolute left-2 z-30 flex flex-wrap gap-1.5 p-2 rounded-xl border ${
            previewPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-1.5'
          }`}
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-strong)',
            boxShadow: 'var(--shadow-popover)',
          }}
        >
          {tagSuggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applyTagSuggestion(tag);
              }}
              className="px-2 py-1 rounded-md text-xs font-mono transition-colors hover:bg-[var(--accent-soft)]"
              style={{ color: 'var(--accent)' }}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {previewPosition === 'top' && previewNode}

      <div
        className={`rounded-2xl border transition-colors ${
          typeSwitcher ? 'p-1.5 sm:p-2 space-y-1.5' : compact ? 'px-2.5 py-1.5' : 'px-2.5 sm:px-3 py-2'
        }`}
        style={{
          backgroundColor: elevated ? 'var(--bg-elevated)' : 'var(--bg-surface)',
          borderColor: elevated ? 'var(--border-strong)' : 'var(--border-subtle)',
          boxShadow: elevated ? 'var(--shadow-popover)' : 'none',
          opacity: disabled ? 0.65 : 1,
        }}
      >
        {/* Optional Segmented Type Switcher */}
        {typeSwitcher && (
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
            {TYPE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = typeSwitcher.value === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => typeSwitcher.onChange(opt.id)}
                  className="h-7 px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors shrink-0"
                  style={{
                    backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2">
          {leadingSlot}

          <input
            type="text"
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled && disabledHint ? disabledHint : placeholder}
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:opacity-60 min-h-[36px] px-1"
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
      </div>

      {previewPosition === 'bottom' && previewNode}
    </form>
  );
};
