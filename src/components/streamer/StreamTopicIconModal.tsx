import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { DynamicIcon } from '../IconLibrary';
import { IconPicker } from '../IconPicker';

interface StreamTopicIconModalProps {
  topicName: string | null;
  currentIcon?: string;
  onClose: () => void;
  onSelectIcon: (topicName: string, icon: string | undefined) => void;
}

export const StreamTopicIconModal: React.FC<StreamTopicIconModalProps> = ({
  topicName,
  currentIcon,
  onClose,
  onSelectIcon,
}) => {
  useEffect(() => {
    if (!topicName) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [topicName, onClose]);

  if (!topicName) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Choose icon for topic ${topicName}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        <div
          className="px-4 py-3 border-b flex items-center justify-between gap-2"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <DynamicIcon
              name={currentIcon || 'Tag'}
              className="w-4 h-4 shrink-0"
              style={{ color: 'var(--accent)' }}
            />
            <h2 className="font-display text-sm font-semibold truncate">
              Topic Icon · {topicName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-7 h-7 rounded-lg inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          <IconPicker
            value={currentIcon || null}
            onChange={(iconKey) => {
              onSelectIcon(topicName, iconKey);
              onClose();
            }}
            onClear={() => {
              onSelectIcon(topicName, undefined);
              onClose();
            }}
            allowClear
            clearLabel="Default"
            autoFocusSearch
            maxGridHeightClass="max-h-[240px]"
          />
        </div>
      </div>
    </div>
  );
};
