import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, GitMerge, Tag, Trash2, Tv, X } from 'lucide-react';
import type { StreamChannelMeta } from '../../types';
import { DynamicIcon } from '../IconLibrary';
import { IconPicker } from '../IconPicker';

export const CHANNEL_ACCENT_SWATCHES = [
  { label: 'Theme Accent', value: '' },
  { label: 'Indigo', value: '#4f46e5' },
  { label: 'Violet', value: '#7c3aed' },
  { label: 'Sky', value: '#0284c7' },
  { label: 'Teal', value: '#0d9488' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Rose', value: '#e11d48' },
  { label: 'Slate', value: '#64748b' },
];

/* ==========================================================================
   1. Channel Settings Modal (Custom Icon, Accent Color, Default Topic)
   ========================================================================== */

interface ChannelSettingsModalProps {
  channelName: string | null;
  meta: StreamChannelMeta | undefined;
  existingTopics: string[];
  onClose: () => void;
  onSave: (channelName: string, patch: Partial<StreamChannelMeta>) => void;
}

export const ChannelSettingsModal: React.FC<ChannelSettingsModalProps> = ({
  channelName,
  meta,
  existingTopics,
  onClose,
  onSave,
}) => {
  const [icon, setIcon] = useState(meta?.icon ?? '');
  const [color, setColor] = useState(meta?.color ?? '');
  const [defaultTopic, setDefaultTopic] = useState(meta?.defaultTopic ?? '');

  useEffect(() => {
    if (!channelName) return;
    setIcon(meta?.icon ?? '');
    setColor(meta?.color ?? '');
    setDefaultTopic(meta?.defaultTopic ?? '');
  }, [channelName, meta]);

  useEffect(() => {
    if (!channelName) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [channelName, onClose]);

  if (!channelName) return null;

  const previewColor = color || 'var(--accent)';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(channelName, {
      icon: icon.trim() || undefined,
      color: color.trim() || undefined,
      defaultTopic: defaultTopic.trim() || undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Customize channel ${channelName}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        <div
          className="px-4 py-3 border-b flex items-center justify-between gap-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{
                backgroundColor: color ? `${color}18` : 'var(--accent-soft)',
                color: previewColor,
              }}
            >
              {icon ? (
                <DynamicIcon name={icon} className="w-4 h-4" />
              ) : (
                <Tv className="w-4 h-4" />
              )}
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-sm font-semibold truncate">
                Customize Channel
              </h2>
              <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                {channelName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close channel settings"
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Default Topic for new streams */}
          <div className="space-y-1.5">
            <label
              htmlFor="channel-default-topic"
              className="block text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Default Topic for New Streams
            </label>
            <input
              id="channel-default-topic"
              type="text"
              value={defaultTopic}
              onChange={(e) => setDefaultTopic(e.target.value)}
              placeholder="e.g., Subliminals, Frequencies, Sleep..."
              className="w-full h-9 px-3 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
            {existingTopics.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5 max-h-24 overflow-y-auto">
                {existingTopics.slice(0, 12).map((top) => {
                  const selected = defaultTopic.trim() === top;
                  return (
                    <button
                      key={top}
                      type="button"
                      onClick={() => setDefaultTopic(selected ? '' : top)}
                      className="h-6 px-2 rounded-md border text-[11px] font-medium cursor-pointer"
                      style={{
                        backgroundColor: selected
                          ? 'var(--accent-soft)'
                          : 'var(--bg-surface)',
                        borderColor: selected
                          ? 'var(--accent)'
                          : 'var(--border-subtle)',
                        color: selected
                          ? 'var(--accent)'
                          : 'var(--text-secondary)',
                      }}
                    >
                      {top}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Accent Color */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                Accent Color
              </span>
              {color && (
                <button
                  type="button"
                  onClick={() => setColor('')}
                  className="text-[11px] hover:underline cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Reset
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {CHANNEL_ACCENT_SWATCHES.map((swatch) => {
                const isSelected = color === swatch.value;
                return (
                  <button
                    key={swatch.label}
                    type="button"
                    onClick={() => setColor(swatch.value)}
                    title={swatch.label}
                    aria-label={swatch.label}
                    className={`h-7 rounded-lg border flex items-center justify-center transition-transform cursor-pointer ${
                      swatch.value ? 'w-7' : 'px-2.5 text-[11px] font-medium'
                    } ${isSelected ? 'ring-2 ring-[var(--accent)] scale-105' : ''}`}
                    style={{
                      backgroundColor: swatch.value || 'var(--bg-surface)',
                      borderColor: isSelected
                        ? 'var(--accent)'
                        : 'var(--border-strong)',
                      color: swatch.value ? '#ffffff' : 'var(--text-secondary)',
                    }}
                  >
                    {swatch.value ? (
                      isSelected ? <Check className="w-3.5 h-3.5" /> : null
                    ) : (
                      'Default'
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Icon Picker */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                Channel Icon
              </span>
              <span
                className="inline-flex items-center gap-1 text-[11px] font-mono"
                style={{ color: 'var(--text-muted)' }}
              >
                {icon ? (
                  <DynamicIcon
                    name={icon}
                    className="w-3.5 h-3.5"
                    style={{ color: previewColor }}
                  />
                ) : (
                  <Tv className="w-3.5 h-3.5" style={{ color: previewColor }} />
                )}
                <span>{icon || 'Default'}</span>
              </span>
            </div>

            <IconPicker
              value={icon || null}
              onChange={(key) => setIcon(key)}
              onClear={() => setIcon('')}
              allowClear
              clearLabel="Default"
              maxGridHeightClass="max-h-[190px]"
            />
          </div>

          <div
            className="pt-2 border-t flex items-center justify-end gap-2"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-lg border text-xs font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-8 px-3.5 rounded-lg text-xs font-semibold cursor-pointer"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-fg)',
              }}
            >
              Save Channel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ==========================================================================
   2. Channel Rename / Merge Modal
   ========================================================================== */

export interface PendingChannelMerge {
  mode: 'confirm-rename-merge' | 'bulk-merge';
  sourceChannels: { name: string; count: number }[];
  suggestedTargetName: string;
  targetExistingCount?: number;
}

interface ChannelRenameMergeModalProps {
  pending: PendingChannelMerge | null;
  existingChannels: { name: string; count: number }[];
  onClose: () => void;
  onConfirm: (fromNames: string[], targetName: string) => void;
}

export const ChannelRenameMergeModal: React.FC<ChannelRenameMergeModalProps> = ({
  pending,
  existingChannels,
  onClose,
  onConfirm,
}) => {
  const [targetName, setTargetName] = useState('');

  useEffect(() => {
    if (!pending) return;
    setTargetName(pending.suggestedTargetName);
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pending, onClose]);

  if (!pending) return null;

  const totalMovingStreams = pending.sourceChannels.reduce(
    (sum, c) => sum + c.count,
    0,
  );
  const resolvedTarget = targetName.trim() || 'Unknown Channel';
  const existingMatch = existingChannels.find((c) => c.name === resolvedTarget);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetName.trim() && pending.mode === 'bulk-merge') return;
    onConfirm(
      pending.sourceChannels.map((c) => c.name),
      resolvedTarget,
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Merge channels"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border p-5 shadow-2xl space-y-4"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        <div
          className="flex items-start justify-between gap-3 pb-2 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
              style={{
                backgroundColor: 'var(--accent-soft)',
                color: 'var(--accent)',
              }}
            >
              <GitMerge className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-sm font-bold">
                {pending.mode === 'confirm-rename-merge'
                  ? 'Merge Into Existing Channel?'
                  : `Merge ${pending.sourceChannels.length} Channels`}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {pending.mode === 'confirm-rename-merge'
                  ? `“${pending.suggestedTargetName}” already exists (${pending.targetExistingCount ?? 0} streams).`
                  : `${totalMovingStreams} total streams will be combined under one channel name.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close merge dialog"
            className="h-7 w-7 rounded-lg flex items-center justify-center cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1">
            <div
              className="text-[11px] font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Source {pending.sourceChannels.length === 1 ? 'channel' : 'channels'}
            </div>
            <div
              className="rounded-lg border px-3 py-2 space-y-1 max-h-32 overflow-y-auto text-xs"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {pending.sourceChannels.map((src) => (
                <div key={src.name} className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{src.name}</span>
                  <span
                    className="font-mono tabular-nums text-[11px] shrink-0"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {src.count} {src.count === 1 ? 'stream' : 'streams'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {pending.mode === 'bulk-merge' && (
            <div className="space-y-1.5">
              <label
                htmlFor="merge-target-channel-name"
                className="block text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                Target Channel Name
              </label>
              <input
                id="merge-target-channel-name"
                type="text"
                autoFocus
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                placeholder="Choose or type final channel name..."
                className="w-full h-9 px-3 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <div className="flex flex-wrap gap-1 pt-0.5 max-h-24 overflow-y-auto">
                {pending.sourceChannels.map((src) => (
                  <button
                    key={src.name}
                    type="button"
                    onClick={() => setTargetName(src.name)}
                    className="h-6 px-2 rounded-md border text-[11px] font-medium cursor-pointer"
                    style={{
                      backgroundColor:
                        targetName.trim() === src.name
                          ? 'var(--accent-soft)'
                          : 'var(--bg-surface)',
                      borderColor:
                        targetName.trim() === src.name
                          ? 'var(--accent)'
                          : 'var(--border-subtle)',
                      color:
                        targetName.trim() === src.name
                          ? 'var(--accent)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    {src.name}
                  </button>
                ))}
              </div>
              {existingMatch &&
                !pending.sourceChannels.some((s) => s.name === existingMatch.name) && (
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Matches existing channel “{existingMatch.name}” ({existingMatch.count} streams).
                  </p>
                )}
            </div>
          )}

          {pending.mode === 'confirm-rename-merge' && (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              All {totalMovingStreams} {totalMovingStreams === 1 ? 'stream' : 'streams'} from{' '}
              <span className="font-semibold text-[var(--text-primary)]">
                {pending.sourceChannels[0]?.name}
              </span>{' '}
              will be moved into{' '}
              <span className="font-semibold text-[var(--text-primary)]">
                {pending.suggestedTargetName}
              </span>
              . Channel pins and metadata will be preserved cleanly.
            </p>
          )}

          <div
            className="flex justify-end gap-2 pt-2 border-t"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-lg text-xs cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending.mode === 'bulk-merge' && !targetName.trim()}
              className="h-8 px-3.5 rounded-lg text-xs font-semibold disabled:opacity-45 cursor-pointer inline-flex items-center gap-1.5"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-fg)',
              }}
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>Merge Channels</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ==========================================================================
   3. Channel Batch Topic & Tags Modal
   ========================================================================== */

interface ChannelBatchEditModalProps {
  channelNames: string[] | null;
  affectedStreamCount: number;
  existingTopics: string[];
  existingTags: string[];
  onClose: () => void;
  onApply: (
    channelNames: string[],
    update: {
      topic?: string;
      tags?: string[];
      tagsMode?: 'append' | 'replace';
    },
  ) => void;
}

export const ChannelBatchEditModal: React.FC<ChannelBatchEditModalProps> = ({
  channelNames,
  affectedStreamCount,
  existingTopics,
  existingTags,
  onClose,
  onApply,
}) => {
  const [applyTopic, setApplyTopic] = useState(true);
  const [topicInput, setTopicInput] = useState('');
  const [applyTags, setApplyTags] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [tagsMode, setTagsMode] = useState<'append' | 'replace'>('append');

  useEffect(() => {
    if (!channelNames) return;
    setApplyTopic(true);
    setTopicInput('');
    setApplyTags(false);
    setTagsInput('');
    setTagsMode('append');
  }, [channelNames]);

  useEffect(() => {
    if (!channelNames) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [channelNames, onClose]);

  if (!channelNames || channelNames.length === 0) return null;

  const canSave =
    (applyTopic && topicInput.trim().length > 0) ||
    (applyTags && (tagsMode === 'replace' || tagsInput.trim().length > 0));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    onApply(channelNames, {
      topic: applyTopic && topicInput.trim() ? topicInput.trim() : undefined,
      tags: applyTags ? parsedTags : undefined,
      tagsMode: applyTags ? tagsMode : undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Batch edit topic and tags for channel"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border p-5 shadow-2xl space-y-4"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        <div
          className="flex items-center justify-between gap-3 pb-2 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Tag className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
            <div className="min-w-0">
              <h3 className="font-display text-sm font-bold truncate">
                {channelNames.length === 1
                  ? `Batch Edit · ${channelNames[0]}`
                  : `Batch Edit ${channelNames.length} Channels`}
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Applies to {affectedStreamCount}{' '}
                {affectedStreamCount === 1 ? 'stream' : 'streams'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close batch edit dialog"
            className="h-7 w-7 rounded-lg flex items-center justify-center cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Topic Update */}
          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={applyTopic}
                onChange={(e) => setApplyTopic(e.target.checked)}
                className="rounded accent-[var(--accent)]"
              />
              <span>Update Topic / Category</span>
            </label>

            {applyTopic && (
              <div className="space-y-1.5 pl-5">
                <input
                  type="text"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  placeholder="e.g. Subliminals, Deep Focus, Sleep"
                  className="w-full h-9 px-3 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                {existingTopics.length > 0 && (
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {existingTopics.map((top) => (
                      <button
                        key={top}
                        type="button"
                        onClick={() => setTopicInput(top)}
                        className="h-6 px-2 rounded-md border text-[11px] font-medium cursor-pointer"
                        style={{
                          backgroundColor:
                            topicInput.trim().toLowerCase() === top.toLowerCase()
                              ? 'var(--accent-soft)'
                              : 'var(--bg-surface)',
                          borderColor:
                            topicInput.trim().toLowerCase() === top.toLowerCase()
                              ? 'var(--accent)'
                              : 'var(--border-subtle)',
                          color:
                            topicInput.trim().toLowerCase() === top.toLowerCase()
                              ? 'var(--accent)'
                              : 'var(--text-secondary)',
                        }}
                      >
                        {top}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tags Update */}
          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={applyTags}
                onChange={(e) => setApplyTags(e.target.checked)}
                className="rounded accent-[var(--accent)]"
              />
              <span>Update Tags</span>
            </label>

            {applyTags && (
              <div className="space-y-2 pl-5">
                <div className="flex items-center gap-1.5">
                  {(['append', 'replace'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTagsMode(m)}
                      className="h-7 px-2.5 rounded-lg border text-[11px] font-medium cursor-pointer"
                      style={{
                        backgroundColor:
                          tagsMode === m ? 'var(--accent-soft)' : 'var(--bg-surface)',
                        borderColor:
                          tagsMode === m ? 'var(--accent)' : 'var(--border-subtle)',
                        color: tagsMode === m ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >
                      {m === 'append' ? 'Append tags' : 'Replace all tags'}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="Comma-separated tags (e.g. rain, theta, 432hz)"
                  className="w-full h-9 px-3 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                {existingTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {existingTags.slice(0, 16).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          const current = tagsInput
                            .split(',')
                            .map((x) => x.trim().toLowerCase())
                            .filter(Boolean);
                          if (!current.includes(t)) {
                            setTagsInput([...current, t].join(', '));
                          }
                        }}
                        className="h-6 px-2 rounded-md border text-[11px] cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            className="flex justify-end gap-2 pt-2 border-t"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-lg text-xs cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="h-8 px-3.5 rounded-lg text-xs font-semibold disabled:opacity-45 cursor-pointer"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-fg)',
              }}
            >
              Apply to {affectedStreamCount} Streams
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ==========================================================================
   4. Delete Channel & All Streams Confirmation Modal
   ========================================================================== */

interface ChannelDeleteModalProps {
  targets: { name: string; count: number }[] | null;
  onClose: () => void;
  onConfirm: (channelNames: string[]) => void;
}

export const ChannelDeleteModal: React.FC<ChannelDeleteModalProps> = ({
  targets,
  onClose,
  onConfirm,
}) => {
  useEffect(() => {
    if (!targets) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [targets, onClose]);

  if (!targets || targets.length === 0) return null;

  const totalStreams = targets.reduce((sum, t) => sum + t.count, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete channel confirmation"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border p-5 shadow-2xl space-y-4"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--danger) 14%, transparent)',
              color: 'var(--danger)',
            }}
          >
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="font-display text-sm font-bold">
              {targets.length === 1
                ? `Delete “${targets[0].name}”?`
                : `Delete ${targets.length} Channels?`}
            </h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              This will permanently remove{' '}
              <span className="font-semibold text-[var(--text-primary)]">
                {totalStreams} {totalStreams === 1 ? 'stream' : 'streams'}
              </span>{' '}
              from your Vault, Live Grid slots, and saved playlists.
            </p>
          </div>
        </div>

        <div
          className="rounded-lg border px-3 py-2 space-y-1 max-h-36 overflow-y-auto text-xs"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {targets.map((t) => (
            <div key={t.name} className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{t.name}</span>
              <span
                className="font-mono tabular-nums text-[11px] shrink-0"
                style={{ color: 'var(--text-muted)' }}
              >
                {t.count} {t.count === 1 ? 'stream' : 'streams'}
              </span>
            </div>
          ))}
        </div>

        <div
          className="flex justify-end gap-2 pt-2 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 rounded-lg border text-xs font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(targets.map((t) => t.name));
              onClose();
            }}
            className="h-8 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            style={{
              backgroundColor: 'var(--danger)',
              color: '#ffffff',
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete {totalStreams} Streams</span>
          </button>
        </div>
      </div>
    </div>
  );
};
