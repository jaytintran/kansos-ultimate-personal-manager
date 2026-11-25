import React, { useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  Clock,
  Copy,
  Edit3,
  Globe,
  PanelTop,
  Plus,
  Tag,
  Target,
  Trash2,
  Trophy,
  X,
  XCircle,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { getNoteDescendantIds } from '../lib/noteGraphUtils';
import { ContextMenuRecord, DetailSheetTarget } from '../types';
import { addDaysToKey, getTodayKey } from '../utils/date';
import { countLinkedNotesForListItems } from '../utils/listItemLinks';
import { DeleteListItemsConfirmModal } from './lists/DeleteListItemsConfirmModal';
import {
  NoteBranchActionPrompt,
  NoteDeleteBranchModal,
} from './notes/NoteDeleteBranchModal';

export interface ContextMenuState {
  record: ContextMenuRecord;
  x: number;
  y: number;
}

interface UniversalContextMenuProps {
  state: ContextMenuState | null;
  onClose: () => void;
  onOpenDetail: (target: DetailSheetTarget) => void;
  onOpenTimestamps: (entryId: string) => void;
  onSelectListItem?: (itemId: string) => void;
  isListItemSelected?: (itemId: string) => boolean;
  onOpenListItemAsTab?: (itemId: string) => void;
}

export const UniversalContextMenu: React.FC<UniversalContextMenuProps> = ({
  state,
  onClose,
  onOpenDetail,
  onOpenTimestamps,
  onSelectListItem,
  isListItemSelected,
  onOpenListItemAsTab,
}) => {
  const {
    workspace,
    updateEntry,
    moveFocusItem,
    toggleEntryAchievement,
    setEventAttendance,
    duplicateEntry,
    moveEntryToDate,
    deleteEntry,
    deleteNotePage,
    updateListItem,
    deleteListItem,
  } = useWorkspace();

  const [subPanel, setSubPanel] = useState<'none' | 'reschedule' | 'tags' | 'move'>('none');
  const [tagDraft, setTagDraft] = useState('');
  const [branchPrompt, setBranchPrompt] = useState<NoteBranchActionPrompt | null>(null);
  const [pendingListItemDelete, setPendingListItemDelete] = useState<{
    id: string;
    title: string;
    exclusivelyLinkedNotesCount: number;
    sharedNotesCount: number;
  } | null>(null);

  useEffect(() => {
    setSubPanel('none');
    setTagDraft('');
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (subPanel !== 'none') setSubPanel('none');
        else onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state, subPanel, onClose]);

  const modals = (
    <>
      <NoteDeleteBranchModal
        prompt={branchPrompt}
        onCancel={() => setBranchPrompt(null)}
        onChoose={(mode) => {
          if (branchPrompt) {
            deleteNotePage(branchPrompt.noteId, mode);
          }
          setBranchPrompt(null);
        }}
      />
      {pendingListItemDelete && (
        <DeleteListItemsConfirmModal
          open={Boolean(pendingListItemDelete)}
          itemCount={1}
          itemTitle={pendingListItemDelete.title}
          exclusivelyLinkedNotesCount={pendingListItemDelete.exclusivelyLinkedNotesCount}
          sharedNotesCount={pendingListItemDelete.sharedNotesCount}
          onCancel={() => setPendingListItemDelete(null)}
          onConfirm={(linkedNotesBehavior) => {
            deleteListItem(pendingListItemDelete.id, linkedNotesBehavior);
            setPendingListItemDelete(null);
          }}
        />
      )}
    </>
  );

  if (!state) return modals;

  const { record } = state;
  // Pull fresh entity from workspace so inline tag edits stay live
  const freshEntry =
    record.kind === 'entry'
      ? workspace.entries.find((e) => e.id === record.entry.id) || record.entry
      : null;
  const freshListItem =
    record.kind === 'list_item'
      ? workspace.listItems.find((i) => i.id === record.item.id) || record.item
      : null;

  const isEntry = Boolean(freshEntry);
  const title = freshEntry ? freshEntry.title : freshListItem?.title || '';
  const currentTags = freshEntry ? freshEntry.tags || [] : freshListItem?.tags || [];

  // Eligibility rules
  const canAchievement = Boolean(
    freshEntry &&
      (freshEntry.type === 'log' ||
        freshEntry.type === 'event' ||
        (freshEntry.type === 'task' && freshEntry.completed))
  );
  const canTimestamps = Boolean(freshEntry);
  const canDuplicate = Boolean(freshEntry);
  const isEvent = Boolean(freshEntry && freshEntry.type === 'event');
  const canReschedule = Boolean(
    freshEntry &&
      !freshEntry.completed &&
      (freshEntry.type === 'task' || freshEntry.type === 'event' || freshEntry.type === 'timeblock')
  );
  const canMoveFocusBucket = Boolean(
    freshEntry && freshEntry.type === 'task' && !freshEntry.completed
  );

  const handleOpenDetails = () => {
    if (freshEntry) {
      const mode =
        freshEntry.type === 'note'
          ? 'note'
          : freshEntry.type === 'event'
          ? 'event'
          : freshEntry.type === 'log'
          ? 'log'
          : 'task';
      onOpenDetail({ mode, id: freshEntry.id });
    } else if (freshListItem) {
      onOpenDetail({ mode: 'list_item', id: freshListItem.id });
    }
    onClose();
  };

  const handleAddTag = (raw: string) => {
    const clean = raw.trim().replace(/^#/, '').toLowerCase();
    if (!clean || currentTags.includes(clean)) {
      setTagDraft('');
      return;
    }
    const next = [...currentTags, clean];
    if (freshEntry) updateEntry(freshEntry.id, { tags: next });
    else if (freshListItem) updateListItem(freshListItem.id, { tags: next });
    setTagDraft('');
  };

  const handleRemoveTag = (tag: string) => {
    const next = currentTags.filter((t) => t !== tag);
    if (freshEntry) updateEntry(freshEntry.id, { tags: next });
    else if (freshListItem) updateListItem(freshListItem.id, { tags: next });
  };

  const handleDelete = () => {
    if (freshEntry) {
      if (freshEntry.type === 'note' && !freshEntry.archived) {
        const activeNotes = workspace.entries.filter(
          (e) => e.type === 'note' && !e.archived
        );
        const descendants = getNoteDescendantIds(freshEntry.id, activeNotes);
        if (descendants.size > 0) {
          const directChildCount = activeNotes.filter(
            (e) => e.parentId === freshEntry.id
          ).length;
          setBranchPrompt({
            action: 'delete',
            noteId: freshEntry.id,
            noteTitle: freshEntry.title || 'Untitled Note',
            directChildCount,
            totalDescendantCount: descendants.size,
          });
          onClose();
          return;
        }
      }
      if (freshEntry.type === 'note') {
        deleteNotePage(freshEntry.id, 'promote');
      } else {
        deleteEntry(freshEntry.id);
      }
    } else if (freshListItem) {
      const impact = countLinkedNotesForListItems(workspace.entries, [freshListItem.id]);
      if (impact.totalAffectedNotes > 0) {
        setPendingListItemDelete({
          id: freshListItem.id,
          title: freshListItem.title || 'Untitled Item',
          exclusivelyLinkedNotesCount: impact.exclusivelyLinkedNotes,
          sharedNotesCount: impact.sharedNotes,
        });
        onClose();
        return;
      }
      deleteListItem(freshListItem.id, 'keep');
    }
    onClose();
  };

  const todayKey = getTodayKey();

  // Compute safe desktop viewport position
  const menuWidth = 248;
  const menuHeight = 360;
  const safeX =
    typeof window !== 'undefined'
      ? Math.min(Math.max(12, state.x), window.innerWidth - menuWidth - 12)
      : state.x;
  const safeY =
    typeof window !== 'undefined'
      ? Math.min(Math.max(12, state.y), window.innerHeight - menuHeight - 12)
      : state.y;

  const btnCls =
    'w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg text-xs font-medium text-left transition-colors hover:bg-[var(--bg-surface-subtle)]';

  const menuContent = (
    <div className="space-y-0.5">
      <div
        className="px-3 py-1.5 text-[11px] font-semibold truncate border-b mb-1"
        style={{ color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' }}
      >
        {title || 'Untitled'}
      </div>

      {subPanel === 'none' && (
        <>
          {freshListItem && onOpenListItemAsTab && (
            <button
              type="button"
              onClick={() => {
                onOpenListItemAsTab(freshListItem.id);
                onClose();
              }}
              className={btnCls}
              style={{ color: 'var(--text-primary)' }}
            >
              <PanelTop className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <span>Open as Tab</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenDetails}
            className={btnCls}
            style={{ color: 'var(--text-primary)' }}
          >
            <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
            <span>Edit Details</span>
          </button>

          {freshListItem && onSelectListItem && (
            <button
              type="button"
              onClick={() => {
                onSelectListItem(freshListItem.id);
                onClose();
              }}
              className={btnCls}
              style={{ color: 'var(--text-primary)' }}
            >
              <CheckSquare
                className="w-3.5 h-3.5"
                style={{
                  color: isListItemSelected?.(freshListItem.id)
                    ? 'var(--accent)'
                    : 'var(--text-secondary)',
                }}
              />
              <span>
                {isListItemSelected?.(freshListItem.id) ? 'Deselect' : 'Select'}
              </span>
            </button>
          )}

          {canAchievement && freshEntry && (
            <button
              type="button"
              onClick={() => {
                toggleEntryAchievement(freshEntry.id);
                onClose();
              }}
              className={btnCls}
              style={{
                color: freshEntry.isAchievement ? 'var(--warning)' : 'var(--text-primary)',
              }}
            >
              <Trophy className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} />
              <span>
                {freshEntry.isAchievement ? 'Unmark Achievement' : 'Mark as Achievement'}
              </span>
            </button>
          )}

          {canTimestamps && freshEntry && (
            <button
              type="button"
              onClick={() => {
                const id = freshEntry.id;
                onClose();
                onOpenTimestamps(id);
              }}
              className={btnCls}
              style={{ color: 'var(--text-primary)' }}
            >
              <Clock className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
              <span>Edit Timestamps</span>
            </button>
          )}

          {canDuplicate && freshEntry && (
            <button
              type="button"
              onClick={() => {
                duplicateEntry(freshEntry.id);
                onClose();
              }}
              className={btnCls}
              style={{ color: 'var(--text-primary)' }}
            >
              <Copy className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
              <span>Duplicate</span>
            </button>
          )}

          {isEvent && freshEntry && (
            <>
              <button
                type="button"
                onClick={() => {
                  setEventAttendance(
                    freshEntry.id,
                    freshEntry.attendance === 'attended' ? null : 'attended'
                  );
                  onClose();
                }}
                className={btnCls}
                style={{ color: 'var(--success)' }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {freshEntry.attendance === 'attended' ? 'Clear attended' : 'Mark attended'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEventAttendance(
                    freshEntry.id,
                    freshEntry.attendance === 'missed' ? null : 'missed'
                  );
                  onClose();
                }}
                className={btnCls}
                style={{ color: 'var(--danger)' }}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>
                  {freshEntry.attendance === 'missed' ? 'Clear missed' : 'Mark missed'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEventAttendance(
                    freshEntry.id,
                    freshEntry.attendance === 'universal' ? null : 'universal'
                  );
                  onClose();
                }}
                className={btnCls}
                style={{ color: 'var(--accent)' }}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>
                  {freshEntry.attendance === 'universal' ? 'Clear universal' : 'Mark universal'}
                </span>
              </button>
            </>
          )}

          {canReschedule && (
            <button
              type="button"
              onClick={() => setSubPanel('reschedule')}
              className={btnCls}
              style={{ color: 'var(--text-primary)' }}
            >
              <CalendarClock className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
              <span>Reschedule</span>
            </button>
          )}

          {canMoveFocusBucket && (
            <button
              type="button"
              onClick={() => setSubPanel('move')}
              className={btnCls}
              style={{ color: 'var(--text-primary)' }}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <span>Move Bucket</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setSubPanel('tags')}
            className={btnCls}
            style={{ color: 'var(--text-primary)' }}
          >
            <Tag className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
            <span>Tags {currentTags.length > 0 ? `(${currentTags.length})` : ''}</span>
          </button>

          <div className="my-1 border-t" style={{ borderColor: 'var(--border-subtle)' }} />

          <button
            type="button"
            onClick={handleDelete}
            className={btnCls}
            style={{ color: 'var(--danger)' }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </>
      )}

      {subPanel === 'move' && freshEntry && (
        <div className="space-y-1 p-1">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Move to bucket
            </span>
            <button
              type="button"
              onClick={() => setSubPanel('none')}
              className="text-[11px]"
              style={{ color: 'var(--accent)' }}
            >
              Back
            </button>
          </div>
          {[
            {
              id: 'x-active' as const,
              label: 'X-Active Tasks',
              active:
                freshEntry.source === 'focus-active' ||
                freshEntry.focusBucket === 'x-active',
            },
            {
              id: 'anchor' as const,
              label: 'Daily Anchors',
              active:
                freshEntry.source === 'focus-anchor' ||
                freshEntry.focusBucket === 'anchor',
            },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                const res = moveFocusItem(freshEntry.id, opt.id);
                onClose();
                if (!res.ok && res.reason === 'capacity') {
                  window.dispatchEvent(
                    new CustomEvent('kanso:focus-swap-request', {
                      detail: { entryId: freshEntry.id },
                    }),
                  );
                }
              }}
              className={btnCls}
              style={{
                color: opt.active ? 'var(--accent)' : 'var(--text-primary)',
                backgroundColor: opt.active ? 'var(--accent-soft)' : undefined,
              }}
            >
              {opt.id === 'x-active' ? (
                <Target className="w-3.5 h-3.5" style={{ color: 'var(--color-entity-blue)' }} />
              ) : (
                <Clock className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              )}
              <span>{opt.label}</span>
            </button>
          ))}
          {(workspace.customTabs ?? []).map((ct) => {
            const active =
              freshEntry.source === 'custom-tab' && freshEntry.tabId === ct.id;
            return (
              <button
                key={ct.id}
                type="button"
                onClick={() => {
                  moveFocusItem(freshEntry.id, 'custom-tab', { tabId: ct.id });
                  onClose();
                }}
                className={btnCls}
                style={{
                  color: active ? ct.color : 'var(--text-primary)',
                  backgroundColor: active ? 'var(--accent-soft)' : undefined,
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: ct.color }}
                />
                <span className="truncate">{ct.name}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              moveFocusItem(freshEntry.id, 'timeline');
              onClose();
            }}
            className={btnCls}
            style={{ color: 'var(--text-secondary)' }}
          >
            <CalendarClock className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            <span>Timeline only</span>
          </button>
        </div>
      )}

      {subPanel === 'reschedule' && freshEntry && (
        <div className="space-y-1 p-1">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Reschedule to
            </span>
            <button
              type="button"
              onClick={() => setSubPanel('none')}
              className="text-[11px]"
              style={{ color: 'var(--accent)' }}
            >
              Back
            </button>
          </div>
          {[
            { label: 'Today', key: todayKey },
            { label: 'Tomorrow', key: addDaysToKey(todayKey, 1) },
            { label: '+2 Days', key: addDaysToKey(todayKey, 2) },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                moveEntryToDate(freshEntry.id, opt.key);
                onClose();
              }}
              className={btnCls}
              style={{ color: 'var(--text-primary)' }}
            >
              <CalendarClock className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <span>{opt.label}</span>
              <span className="ml-auto font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {opt.key.slice(5)}
              </span>
            </button>
          ))}
        </div>
      )}

      {subPanel === 'tags' && (
        <div className="space-y-2.5 p-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {isEntry ? 'Entry Tags' : 'Item Tags'}
            </span>
            <button
              type="button"
              onClick={() => setSubPanel('none')}
              className="text-[11px]"
              style={{ color: 'var(--accent)' }}
            >
              Done
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddTag(tagDraft);
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              placeholder="Add tag..."
              autoFocus
              className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border text-xs outline-none"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              type="submit"
              className="h-8 w-8 flex items-center justify-center rounded-lg shrink-0"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              aria-label="Add tag"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>

          {currentTags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {currentTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-mono"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>#{tag}</span>
                  <X className="w-3 h-3 opacity-60" />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              No tags yet.
            </p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Actions menu">
      <div className="fixed inset-0 bg-black/25 sm:bg-transparent" onClick={onClose} />

      {/* Desktop Floating Popover */}
      <div
        className="hidden sm:block fixed z-10 w-[248px] rounded-xl border p-1.5"
        style={{
          left: safeX,
          top: safeY,
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-popover)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {menuContent}
      </div>

      {/* Mobile Slide-Up Bottom Action Sheet */}
      <div
        className="sm:hidden fixed bottom-0 left-0 right-0 z-10 rounded-t-2xl border-t px-3 pt-2.5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-popover)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pb-2">
          <span
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: 'var(--border-strong)' }}
          />
        </div>
        {menuContent}
      </div>
      {modals}
    </div>
  );
};
