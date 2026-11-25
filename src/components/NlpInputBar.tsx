import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckSquare,
  Clock,
  CornerDownLeft,
  FileText,
  Flame,
  Hash,
  Info,
  Link2,
  Slash,
  Timer,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { EntryType } from '../types';
import { extractUrlFromListInput, parseNlpInput } from '../utils/nlp';

export interface NlpTypeOption {
  id: EntryType;
  command: string;
  aliases?: string[];
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  colorVar: string;
}

const TYPE_OPTIONS: NlpTypeOption[] = [
  {
    id: 'task',
    command: '/task',
    label: 'Task',
    hint: 'Action item or to-do',
    icon: CheckSquare,
    colorVar: 'var(--color-entity-blue)',
  },
  {
    id: 'log',
    command: '/log',
    label: 'Log',
    hint: 'Moment or timestamped update',
    icon: Flame,
    colorVar: 'var(--accent)',
  },
  {
    id: 'note',
    command: '/note',
    label: 'Note',
    hint: 'Thought or quick write-up',
    icon: FileText,
    colorVar: 'var(--color-entity-violet)',
  },
  {
    id: 'event',
    command: '/event',
    label: 'Event',
    hint: 'Calendar meeting or appointment',
    icon: Calendar,
    colorVar: 'var(--success)',
  },
  {
    id: 'timeblock',
    command: '/timeblock',
    aliases: ['block'],
    label: 'Block',
    hint: 'Focused time range block',
    icon: Timer,
    colorVar: 'var(--warning)',
  },
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
    options?: NlpTypeOption[];
    menuHeading?: string;
  };
  availableTags?: string[];
  showTimeblockTip?: boolean;
  parseUrls?: boolean;
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
  parseUrls = false,
}) => {
  const { workspace } = useWorkspace();
  const [value, setValue] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const extractedUrlInfo = useMemo(
    () =>
      parseUrls
        ? extractUrlFromListInput(value)
        : { url: null, strippedText: value, fallbackTitle: null },
    [parseUrls, value],
  );

  const activeTypeOptions = useMemo(
    () => typeSwitcher?.options ?? TYPE_OPTIONS,
    [typeSwitcher?.options],
  );

  // Detect committed leading /prefix command like "/note ", "/task ", "/timeblock "
  const detectedLeadingPrefix = useMemo<{
    type: EntryType;
    matchedPrefix: string;
    strippedText: string;
  } | null>(() => {
    if (!typeSwitcher) return null;
    const trimmedStart = value.trimStart();
    if (!trimmedStart.startsWith('/')) return null;
    const m = trimmedStart.match(/^\/([a-z0-9_-]+)(?:\s+|$)/i);
    if (!m) return null;
    const kw = m[1].toLowerCase();
    const matchedOpt = activeTypeOptions.find(
      (opt) =>
        opt.command.slice(1).toLowerCase() === kw ||
        opt.aliases?.some((a) => a.toLowerCase() === kw),
    );
    if (!matchedOpt) return null;
    return {
      type: matchedOpt.id,
      matchedPrefix: m[0],
      strippedText: trimmedStart.slice(m[0].length),
    };
  }, [value, typeSwitcher, activeTypeOptions]);

  // Detect active leading "/" query without whitespace yet (for Notion-style command popup)
  const activeSlashQuery = useMemo(() => {
    if (!typeSwitcher || disabled) return null;
    const trimmedStart = value.trimStart();
    if (!trimmedStart.startsWith('/')) return null;
    if (/\s/.test(trimmedStart)) return null;
    return trimmedStart.slice(1).toLowerCase();
  }, [value, typeSwitcher, disabled]);

  useEffect(() => {
    if (activeSlashQuery === null) {
      setSlashDismissed(false);
    } else {
      setSlashIndex(0);
    }
  }, [activeSlashQuery]);

  const slashSuggestions = useMemo(() => {
    if (!typeSwitcher || activeSlashQuery === null || slashDismissed) return [];
    const q = activeSlashQuery;
    if (!q) return activeTypeOptions;
    return activeTypeOptions.filter(
      (opt) =>
        opt.command.slice(1).includes(q) ||
        opt.label.toLowerCase().includes(q) ||
        opt.aliases?.some((a) => a.toLowerCase().includes(q)),
    );
  }, [typeSwitcher, activeSlashQuery, slashDismissed, activeTypeOptions]);

  const parsed = useMemo(
    () =>
      parseNlpInput(
        parseUrls ? extractedUrlInfo.strippedText : value,
        baseDateKey,
        workspace.settings.timeFormat,
      ),
    [parseUrls, extractedUrlInfo.strippedText, value, baseDateKey, workspace.settings.timeFormat],
  );

  // Sync segmented type switcher if user types an allowed /command
  useEffect(() => {
    if (
      typeSwitcher &&
      parsed.detectedType &&
      parsed.detectedType !== typeSwitcher.value &&
      activeTypeOptions.some((o) => o.id === parsed.detectedType)
    ) {
      typeSwitcher.onChange(parsed.detectedType);
    }
  }, [parsed.detectedType, typeSwitcher, activeTypeOptions]);

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

  const applySlashCommand = (opt: NlpTypeOption) => {
    typeSwitcher?.onChange(opt.id);
    setValue(`${opt.command} `);
    setSlashDismissed(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleToggleTypeClick = (nextType: EntryType) => {
    typeSwitcher?.onChange(nextType);
    if (detectedLeadingPrefix) {
      const cmd =
        activeTypeOptions.find((o) => o.id === nextType)?.command ?? `/${nextType}`;
      setValue(`${cmd} ${detectedLeadingPrefix.strippedText}`);
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const applyTagSuggestion = (tag: string) => {
    setValue((prev) => prev.replace(/(^|\s)#[a-zA-Z0-9_-]*$/, `$1#${tag} `));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const effectiveTextRemaining = detectedLeadingPrefix
    ? detectedLeadingPrefix.strippedText.trim()
    : value.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || !effectiveTextRemaining) return;
    const result = onSubmit(value);
    if (result !== false) {
      setValue('');
      setSlashDismissed(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (slashSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + slashSuggestions.length) % slashSuggestions.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !detectedLeadingPrefix?.strippedText.trim())) {
        e.preventDefault();
        const chosen = slashSuggestions[slashIndex] ?? slashSuggestions[0];
        if (chosen) applySlashCommand(chosen);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }

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

  const hasTokens =
    (parsed.tokens.length > 0 || Boolean(extractedUrlInfo.url)) && !disabled;

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
        {extractedUrlInfo.url && (
          <span
            className="inline-flex items-center gap-1 font-mono text-[11px]"
            style={{ color: 'var(--accent)' }}
          >
            <Link2 className="w-3 h-3 shrink-0" />
            <span className="truncate max-w-[180px]">
              {extractedUrlInfo.fallbackTitle || extractedUrlInfo.url}
            </span>
          </span>
        )}
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
            · {parsed.cleanTitle || extractedUrlInfo.fallbackTitle}
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
      {/* Notion-style Slash Command Popup (when typeSwitcher is active) */}
      {slashSuggestions.length > 0 && !disabled && (
        <div
          className={`absolute left-0 right-0 sm:right-auto sm:w-80 z-40 rounded-xl border p-1.5 space-y-0.5 ${
            previewPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-1.5'
          }`}
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-strong)',
            boxShadow: 'var(--shadow-popover)',
          }}
          role="listbox"
          aria-label="Entry type slash commands"
        >
          <div
            className="px-2.5 py-1 text-[11px] font-medium flex items-center justify-between"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="inline-flex items-center gap-1">
              <Slash className="w-3 h-3" />
              <span>{typeSwitcher?.menuHeading ?? 'Route entry'}</span>
            </span>
            <span className="font-mono text-[10px]">↑↓ · Tab</span>
          </div>
          {slashSuggestions.map((opt, idx) => {
            const Icon = opt.icon;
            const highlighted = idx === slashIndex;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={highlighted}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySlashCommand(opt);
                }}
                onMouseEnter={() => setSlashIndex(idx)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer"
                style={{
                  backgroundColor: highlighted ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: opt.colorVar }}
                  />
                  <div className="min-w-0">
                    <div
                      className="text-xs font-medium truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {opt.label}
                    </div>
                    <div
                      className="text-[11px] truncate"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {opt.hint}
                    </div>
                  </div>
                </div>
                <span
                  className="text-[11px] font-mono shrink-0"
                  style={{
                    color: highlighted ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {opt.command}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* #tag Autocomplete Popover */}
      {tagSuggestions.length > 0 && slashSuggestions.length === 0 && !disabled && (
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
              className="px-2 py-1 rounded-md text-xs font-mono transition-colors hover:bg-[var(--accent-soft)] cursor-pointer"
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
          typeSwitcher
            ? 'p-1.5 sm:p-2 space-y-1.5'
            : compact
              ? 'px-2.5 py-1.5'
              : 'px-2.5 sm:px-3 py-2'
        }`}
        style={{
          backgroundColor: elevated ? 'var(--bg-elevated)' : 'var(--bg-surface)',
          borderColor: elevated ? 'var(--border-strong)' : 'var(--border-subtle)',
          boxShadow: elevated ? 'var(--shadow-popover)' : 'none',
          opacity: disabled ? 0.65 : 1,
        }}
      >
        {/* Segmented Type Switcher + Slash Hint Indicator */}
        {typeSwitcher && (
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            <div
              className="inline-flex items-center gap-0.5 p-0.5 rounded-lg"
              style={{ backgroundColor: 'var(--bg-surface-subtle)' }}
              role="tablist"
              aria-label="Entry type"
            >
              {activeTypeOptions.map((opt) => {
                const Icon = opt.icon;
                const active = typeSwitcher.value === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleToggleTypeClick(opt.id)}
                    className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                      color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    <Icon
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: active ? opt.colorVar : 'var(--text-muted)' }}
                    />
                    <span className="hidden sm:inline">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <span
              className="hidden sm:inline text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0 pr-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Type / for commands · #tag · time
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {leadingSlot}

          <input
            ref={inputRef}
            type="text"
            value={value}
            disabled={disabled}
            onChange={(e) => {
              setValue(e.target.value);
              setSlashDismissed(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder={disabled && disabledHint ? disabledHint : placeholder}
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:opacity-60 min-h-[36px] px-1"
            style={{ color: 'var(--text-primary)' }}
            aria-label={placeholder}
          />

          <button
            type="submit"
            disabled={disabled || !effectiveTextRemaining}
            className="h-9 px-3 sm:px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-opacity whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer"
            style={{
              backgroundColor:
                effectiveTextRemaining && !disabled
                  ? 'var(--accent)'
                  : 'var(--bg-surface-subtle)',
              color:
                effectiveTextRemaining && !disabled
                  ? 'var(--accent-fg)'
                  : 'var(--text-muted)',
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
