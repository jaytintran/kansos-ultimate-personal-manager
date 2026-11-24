import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Clock, Link2, MapPin, Pin, Plus, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Entry, EntryType, ListItem, ListItemStatus } from '../types';
import {
  combineLocalDateAndTime,
  replaceIsoDateKeepingTime,
  toLocalDateKey,
  toTimeInputValue,
} from '../utils/date';
import { countLinkedNotesForListItems } from '../utils/listItemLinks';
import { EntryScheduleEditor } from './EntryScheduleEditor';
import { ENTRY_TYPE_META, EntryTypeIcon } from './IconLibrary';
import { DeleteListItemsConfirmModal } from './lists/DeleteListItemsConfirmModal';
import { TiptapEditor } from './TiptapEditor';

const ENTRY_TYPES: EntryType[] = ['log', 'task', 'event', 'note', 'timeblock'];
const LIST_STATUSES: { id: ListItemStatus; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'processing', label: 'Processing' },
  { id: 'done', label: 'Done' },
  { id: 'maybe-later', label: 'Maybe Later' },
  { id: 'dropped', label: 'Dropped' },
];

interface EntryInspectorDrawerProps {
  entryId: string | null;
  listItemId: string | null;
  onClose: () => void;
}

export const EntryInspectorDrawer: React.FC<EntryInspectorDrawerProps> = ({
  entryId,
  listItemId,
  onClose,
}) => {
  const { workspace, updateEntry, deleteEntry, toggleEntryCompleted, updateListItem, deleteListItem } =
    useWorkspace();
  const [tagDraft, setTagDraft] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    setDeleteConfirmOpen(false);
  }, [entryId, listItemId]);

  const entry: Entry | undefined = entryId
    ? workspace.entries.find((e) => e.id === entryId)
    : undefined;
  const listItem: ListItem | undefined = listItemId
    ? workspace.listItems.find((i) => i.id === listItemId)
    : undefined;

  if (!entry && !listItem) return null;

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) return;
    const clean = tagDraft.trim().toLowerCase().replace(/^#/, '');
    if (!clean) return;
    if (!entry.tags.includes(clean)) {
      updateEntry(entry.id, { tags: [...entry.tags, clean] });
    }
    setTagDraft('');
  };

  const handleRemoveTag = (tag: string) => {
    if (!entry) return;
    updateEntry(entry.id, { tags: entry.tags.filter((t) => t !== tag) });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Details Editor"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-up bottom sheet (mobile) / Slide-over drawer (desktop) */}
      <div
        className="relative z-10 w-full sm:max-w-xl h-[90dvh] sm:h-full rounded-t-2xl sm:rounded-none flex flex-col border-t sm:border-t-0 sm:border-l overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-canvas)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        {/* Mobile Sheet Drag Handle */}
        <div
          className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <span
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: 'var(--border-strong)' }}
            aria-hidden="true"
          />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {entry ? (
              <>
                <EntryTypeIcon
                  type={entry.type}
                  completed={entry.completed}
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--accent)' }}
                />
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {ENTRY_TYPE_META[entry.type].label} Details
                </span>
              </>
            ) : (
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                List Item Details
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {entry && entry.type === 'note' && (
              <button
                type="button"
                onClick={() => updateEntry(entry.id, { pinned: !entry.pinned })}
                className="h-9 px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                style={{
                  backgroundColor: entry.pinned ? 'var(--accent-soft)' : 'transparent',
                  color: entry.pinned ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <Pin className="w-3.5 h-3.5" />
                <span>{entry.pinned ? 'Pinned' : 'Pin'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (entry) {
                  deleteEntry(entry.id);
                  onClose();
                  return;
                }
                if (listItem) {
                  const impact = countLinkedNotesForListItems(workspace.entries, [listItem.id]);
                  if (impact.totalAffectedNotes > 0) {
                    setDeleteConfirmOpen(true);
                    return;
                  }
                  deleteListItem(listItem.id, 'keep');
                  onClose();
                }
              }}
              className="h-9 w-9 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--danger)' }}
              title="Delete item"
              aria-label="Delete item"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              title="Close inspector"
              aria-label="Close inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {entry && (
            <>
              {/* Title */}
              <div>
                <input
                  type="text"
                  value={entry.title}
                  onChange={(e) => updateEntry(entry.id, { title: e.target.value })}
                  placeholder="Entry title"
                  className="w-full bg-transparent font-display text-xl font-semibold outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>

              {/* Type Switcher + Task Completion */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  className="inline-flex items-center gap-1 p-1 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {ENTRY_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => updateEntry(entry.id, { type: t })}
                      className="px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap"
                      style={{
                        backgroundColor: entry.type === t ? 'var(--bg-surface)' : 'transparent',
                        color: entry.type === t ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}
                    >
                      {ENTRY_TYPE_META[t].shortLabel}
                    </button>
                  ))}
                </div>

                {(entry.type === 'task' || entry.type === 'timeblock') && (
                  <button
                    type="button"
                    onClick={() => toggleEntryCompleted(entry.id)}
                    className="h-8 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    style={{
                      backgroundColor: entry.completed ? 'var(--accent-soft)' : 'var(--bg-surface)',
                      borderColor: entry.completed ? 'var(--accent)' : 'var(--border-subtle)',
                      color: entry.completed ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{entry.completed ? 'Completed' : 'Mark Complete'}</span>
                  </button>
                )}
              </div>

              {/* Separated Date + Smart NLP + Clean Time Rows */}
              <EntryScheduleEditor
                entry={entry}
                timeFormat={workspace.settings.timeFormat}
                onUpdate={(patch) => updateEntry(entry.id, patch)}
                variant="full"
              />

              {/* Event Location */}
              {entry.type === 'event' && (
                <div
                  className="rounded-xl border p-3.5 space-y-1.5"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <label
                    className="flex items-center gap-1.5 text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <MapPin className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    <span>Location or link</span>
                  </label>
                  <input
                    type="text"
                    value={entry.location || ''}
                    onChange={(e) => updateEntry(entry.id, { location: e.target.value })}
                    placeholder="Add location or meeting link..."
                    className="w-full h-9 px-2.5 rounded-lg border text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              )}

              {/* Tags */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>Tags:</span>
                  {entry.tags.length === 0 && (
                    <span style={{ color: 'var(--text-muted)' }}>None</span>
                  )}
                  {entry.tags.map((tag, idx) => (
                    <React.Fragment key={tag}>
                      {idx > 0 && (
                        <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>
                          ·
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="inline-flex items-center gap-1 hover:underline"
                        style={{ color: 'var(--accent)' }}
                        title="Click to remove tag"
                      >
                        <span>#{tag}</span>
                        <X className="w-3 h-3 opacity-70" />
                      </button>
                    </React.Fragment>
                  ))}
                </div>
                <form onSubmit={handleAddTag} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    placeholder="Add tag (e.g. work, design)..."
                    className="flex-1 px-3 py-1.5 rounded-lg border text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!tagDraft.trim()}
                    className="h-8 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1 disabled:opacity-40"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </form>
              </div>

              {/* Markdown Tiptap Editor */}
              <div className="space-y-2">
                <label className="text-xs font-semibold block" style={{ color: 'var(--text-secondary)' }}>
                  Details (Markdown)
                </label>
                <TiptapEditor
                  docId={entry.id}
                  content={entry.content}
                  onChange={(html) => updateEntry(entry.id, { content: html })}
                  minHeight={240}
                />
              </div>
            </>
          )}

          {listItem && (
            <>
              <div>
                <input
                  type="text"
                  value={listItem.title}
                  onChange={(e) => updateListItem(listItem.id, { title: e.target.value })}
                  placeholder="Item title"
                  className="w-full bg-transparent font-display text-xl font-semibold outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>

              {/* Status selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold block" style={{ color: 'var(--text-secondary)' }}>
                  Status
                </label>
                <div
                  className="flex flex-wrap gap-1 p-1 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {LIST_STATUSES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => updateListItem(listItem.id, { status: s.id })}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap"
                      style={{
                        backgroundColor:
                          listItem.status === s.id ? 'var(--bg-surface)' : 'transparent',
                        color:
                          listItem.status === s.id ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Reference URL & Scheduled Date */}
              <div
                className="rounded-xl border p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="space-y-1">
                  <label
                    className="flex items-center gap-1.5 text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Link2 className="w-3 h-3" />
                    <span>Reference URL</span>
                  </label>
                  <input
                    type="url"
                    value={listItem.url || ''}
                    onChange={(e) => updateListItem(listItem.id, { url: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      className="flex items-center gap-1.5 text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Calendar className="w-3 h-3" />
                      <span>Target date &amp; time</span>
                    </label>
                    {listItem.scheduledAt && (
                      <button
                        type="button"
                        onClick={() => updateListItem(listItem.id, { scheduledAt: null })}
                        className="text-[11px] hover:underline"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={listItem.scheduledAt ? toLocalDateKey(listItem.scheduledAt) : ''}
                      onChange={(e) => {
                        if (!e.target.value) {
                          updateListItem(listItem.id, { scheduledAt: null });
                          return;
                        }
                        const iso = listItem.scheduledAt
                          ? replaceIsoDateKeepingTime(listItem.scheduledAt, e.target.value)
                          : combineLocalDateAndTime(e.target.value, '09:00');
                        updateListItem(listItem.id, { scheduledAt: iso });
                      }}
                      className="flex-1 min-w-0 h-9 px-2.5 rounded-lg border text-xs font-mono tabular-nums outline-none"
                      style={{
                        backgroundColor: 'var(--bg-surface-subtle)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <input
                      type="time"
                      value={toTimeInputValue(listItem.scheduledAt)}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const dateKey = listItem.scheduledAt
                          ? toLocalDateKey(listItem.scheduledAt)
                          : toLocalDateKey(new Date());
                        const iso = combineLocalDateAndTime(dateKey, e.target.value);
                        if (iso) updateListItem(listItem.id, { scheduledAt: iso });
                      }}
                      className="w-28 h-9 px-2 rounded-lg border text-xs font-mono tabular-nums outline-none"
                      style={{
                        backgroundColor: 'var(--bg-surface-subtle)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Markdown Tiptap Editor */}
              <div className="space-y-2">
                <label className="text-xs font-semibold block" style={{ color: 'var(--text-secondary)' }}>
                  Notes & Highlights (Markdown)
                </label>
                <TiptapEditor
                  docId={listItem.id}
                  content={listItem.content}
                  onChange={(html) => updateListItem(listItem.id, { content: html })}
                  minHeight={240}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {listItem && deleteConfirmOpen && (() => {
        const impact = countLinkedNotesForListItems(workspace.entries, [listItem.id]);
        return (
          <DeleteListItemsConfirmModal
            open={deleteConfirmOpen}
            itemCount={1}
            itemTitle={listItem.title || 'Untitled Item'}
            exclusivelyLinkedNotesCount={impact.exclusivelyLinkedNotes}
            sharedNotesCount={impact.sharedNotes}
            onCancel={() => setDeleteConfirmOpen(false)}
            onConfirm={(linkedNotesBehavior) => {
              deleteListItem(listItem.id, linkedNotesBehavior);
              setDeleteConfirmOpen(false);
              onClose();
            }}
          />
        );
      })()}
    </div>
  );
};
