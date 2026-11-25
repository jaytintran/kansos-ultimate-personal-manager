import { X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { StreamFolder } from '../../types';
import { DynamicIcon } from '../IconLibrary';
import { IconPicker } from '../IconPicker';

interface StreamFolderEditModalProps {
  folder: StreamFolder | null;
  onClose: () => void;
  onSave: (folderId: string, patch: { name: string; icon?: string }) => void;
}

export const StreamFolderEditModal: React.FC<StreamFolderEditModalProps> = ({
  folder,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(folder?.name ?? '');
  const [icon, setIcon] = useState<string>(folder?.icon ?? '');

  useEffect(() => {
    if (!folder) return;
    setName(folder.name);
    setIcon(folder.icon ?? '');
  }, [folder]);

  useEffect(() => {
    if (!folder) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [folder, onClose]);

  if (!folder) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(folder.id, {
      name: trimmed,
      icon: icon || undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit folder name and icon"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
            Edit Folder
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="vault-folder-edit-name"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              Folder Name
            </label>
            <input
              id="vault-folder-edit-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Morning Focus, Sleep Stack..."
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Folder Icon
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-muted)]">
                <DynamicIcon
                  name={icon || 'Folder'}
                  className="w-3.5 h-3.5"
                  style={{ color: 'var(--accent)' }}
                />
                <span>{icon || 'Default'}</span>
              </span>
            </div>

            <IconPicker
              value={icon || null}
              onChange={(iconKey) => setIcon(iconKey)}
              onClear={() => setIcon('')}
              allowClear
              clearLabel="Default"
              maxGridHeightClass="max-h-[210px]"
            />
          </div>

          <div className="pt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="h-8 px-3.5 rounded-lg text-xs font-semibold disabled:opacity-45 cursor-pointer"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-fg)',
              }}
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
