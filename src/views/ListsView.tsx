import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Inbox,
  PauseCircle,
  PlayCircle,
  Plus,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { DynamicIcon, LIST_ICON_KEYS } from '../components/IconLibrary';
import { NlpInputBar } from '../components/NlpInputBar';
import { useWorkspace } from '../context/WorkspaceContext';
import { ListItemStatus } from '../types';
import { formatShortDate, formatTime, getTodayKey } from '../utils/date';

interface ListsViewProps {
  onInspectListItem: (itemId: string) => void;
}

const STATUS_META: Record<
  ListItemStatus,
  {
    label: string;
    colorVar: string;
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  }
> = {
  inbox: { label: 'Inbox', colorVar: 'var(--text-secondary)', icon: Inbox },
  processing: { label: 'Processing', colorVar: 'var(--accent)', icon: PlayCircle },
  done: { label: 'Done', colorVar: 'var(--success)', icon: CheckCircle2 },
  'maybe-later': { label: 'Maybe Later', colorVar: 'var(--warning)', icon: PauseCircle },
  dropped: { label: 'Dropped', colorVar: 'var(--danger)', icon: XCircle },
};

const ALL_STATUSES: ListItemStatus[] = ['inbox', 'processing', 'done', 'maybe-later', 'dropped'];

export const ListsView: React.FC<ListsViewProps> = ({ onInspectListItem }) => {
  const { workspace, addList, deleteList, addListItem, updateListItem, deleteListItem } =
    useWorkspace();

  const [selectedListId, setSelectedListId] = useState<string | null>(() => {
    return workspace.lists[0]?.id || null;
  });
  const [statusFilter, setStatusFilter] = useState<ListItemStatus | 'all'>('all');
  const [createListOpen, setCreateListOpen] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [newListIcon, setNewListIcon] = useState('BookOpen');

  const activeList = useMemo(
    () => workspace.lists.find((l) => l.id === selectedListId) || workspace.lists[0] || null,
    [workspace.lists, selectedListId]
  );

  const itemsInActiveList = useMemo(() => {
    if (!activeList) return [];
    return workspace.listItems.filter((item) => item.listId === activeList.id);
  }, [workspace.listItems, activeList]);

  const statusCounts = useMemo(() => {
    const counts: Record<ListItemStatus, number> = {
      inbox: 0,
      processing: 0,
      done: 0,
      'maybe-later': 0,
      dropped: 0,
    };
    for (const item of itemsInActiveList) {
      counts[item.status]++;
    }
    return counts;
  }, [itemsInActiveList]);

  const visibleItems = useMemo(() => {
    const filtered =
      statusFilter === 'all'
        ? itemsInActiveList
        : itemsInActiveList.filter((item) => item.status === statusFilter);
    return filtered.sort((a, b) => {
      const orderA = ALL_STATUSES.indexOf(a.status);
      const orderB = ALL_STATUSES.indexOf(b.status);
      if (orderA !== orderB) return orderA - orderB;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [itemsInActiveList, statusFilter]);

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListTitle.trim()) return;
    const created = addList(newListTitle.trim(), newListIcon);
    setSelectedListId(created.id);
    setNewListTitle('');
    setCreateListOpen(false);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-9 space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Lists</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Organize books, movies, courses, and projects with clear lifecycle statuses.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateListOpen(true)}
          className="h-10 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap self-start sm:self-auto"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-fg)',
          }}
        >
          <Plus className="w-4 h-4" />
          <span>New List</span>
        </button>
      </header>

      {/* Mobile Horizontal Scrollable Collection Switcher (< lg) */}
      <div className="lg:hidden -mx-4 px-4 overflow-x-auto">
        <div className="flex items-center gap-2 pb-1 min-w-max">
          {workspace.lists.map((list) => {
            const isSelected = activeList?.id === list.id;
            const count = workspace.listItems.filter((i) => i.listId === list.id).length;
            return (
              <button
                key={list.id}
                type="button"
                onClick={() => {
                  setSelectedListId(list.id);
                  setStatusFilter('all');
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-medium inline-flex items-center gap-2 whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: isSelected ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  borderColor: isSelected ? 'var(--accent)' : 'var(--border-subtle)',
                  color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <DynamicIcon name={list.icon} className="w-3.5 h-3.5 shrink-0" />
                <span>{list.title}</span>
                <span className="font-mono tabular-nums opacity-75">{count}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCreateListOpen(true)}
            className="min-h-[40px] px-3 py-2 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* Main Split: Desktop Collection Sidebar + Items Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Desktop Collections Column */}
        <aside className="hidden lg:block lg:col-span-3 space-y-1">
          {workspace.lists.length === 0 ? (
            <p className="text-xs py-4" style={{ color: 'var(--text-muted)' }}>
              No lists yet. Create your first collection.
            </p>
          ) : (
            workspace.lists.map((list) => {
              const isSelected = activeList?.id === list.id;
              const count = workspace.listItems.filter((i) => i.listId === list.id).length;
              return (
                <div
                  key={list.id}
                  className="group flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition-colors"
                  style={{
                    backgroundColor: isSelected ? 'var(--bg-surface-subtle)' : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedListId(list.id);
                      setStatusFilter('all');
                    }}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  >
                    <DynamicIcon
                      name={list.icon}
                      className="w-4 h-4 shrink-0"
                      style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}
                    />
                    <span
                      className="text-sm font-medium truncate"
                      style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      {list.title}
                    </span>
                  </button>

                  <span
                    className="text-xs font-mono tabular-nums"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {count}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      deleteList(list.id);
                      if (selectedListId === list.id) setSelectedListId(null);
                    }}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-6 w-6 flex items-center justify-center rounded-md transition-opacity"
                    style={{ color: 'var(--text-muted)' }}
                    title={`Delete ${list.title}`}
                    aria-label={`Delete ${list.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </aside>

        {/* Active List Panel */}
        <section className="lg:col-span-9 space-y-5">
          {!activeList ? (
            <div
              className="rounded-2xl border py-16 px-6 text-center space-y-3"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <p className="text-sm font-medium">Create a list to start tracking items</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Great for Books, Movies, Courses, Side Projects, or Gear wishlists.
              </p>
              <button
                type="button"
                onClick={() => setCreateListOpen(true)}
                className="h-9 px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create List</span>
              </button>
            </div>
          ) : (
            <>
              {/* Active List Title & Status Filter Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <DynamicIcon
                    name={activeList.icon}
                    className="w-5 h-5"
                    style={{ color: 'var(--accent)' }}
                  />
                  <h2 className="font-display text-xl font-bold">{activeList.title}</h2>
                </div>

                <div
                  className="flex items-center gap-1 p-1 rounded-xl border overflow-x-auto max-w-full"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className="px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors"
                    style={{
                      backgroundColor:
                        statusFilter === 'all' ? 'var(--bg-surface)' : 'transparent',
                      color:
                        statusFilter === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    All{' '}
                    <span className="font-mono tabular-nums opacity-70">
                      {itemsInActiveList.length}
                    </span>
                  </button>
                  {ALL_STATUSES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors"
                      style={{
                        backgroundColor:
                          statusFilter === st ? 'var(--bg-surface)' : 'transparent',
                        color: statusFilter === st ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}
                    >
                      {STATUS_META[st].label}{' '}
                      <span className="font-mono tabular-nums opacity-70">{statusCounts[st]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* NLP Quick Add Item */}
              <NlpInputBar
                placeholder={`Add to ${activeList.title}... (optional time like "tomorrow at 8pm")`}
                baseDateKey={getTodayKey()}
                submitLabel="Add Item"
                onSubmit={(rawText) => {
                  const defaultStatus: ListItemStatus =
                    statusFilter === 'all' ? 'inbox' : statusFilter;
                  const created = addListItem(activeList.id, rawText, defaultStatus);
                  return Boolean(created);
                }}
              />

              {/* Items Table / Rows */}
              <div
                className="rounded-2xl border divide-y overflow-hidden"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {visibleItems.length === 0 ? (
                  <div className="py-12 px-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    No items in this status. Add one above or switch filter tabs.
                  </div>
                ) : (
                  visibleItems.map((item) => {
                    const meta = STATUS_META[item.status];
                    const StatusIcon = meta.icon || Circle;
                    const hasNotes = Boolean(item.content && item.content.replace(/<[^>]+>/g, '').trim());
                    return (
                      <div
                        key={item.id}
                        className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-surface-subtle)]/60"
                      >
                        <StatusIcon
                          className="w-4 h-4 shrink-0"
                          style={{ color: meta.colorVar }}
                        />

                        <button
                          type="button"
                          onClick={() => onInspectListItem(item.id)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <div
                            className={`text-sm font-medium leading-snug ${
                              item.status === 'done' || item.status === 'dropped'
                                ? 'line-through'
                                : ''
                            }`}
                            style={{
                              color:
                                item.status === 'done' || item.status === 'dropped'
                                  ? 'var(--text-muted)'
                                  : 'var(--text-primary)',
                            }}
                          >
                            {item.title}
                          </div>

                          <div
                            className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <span style={{ color: meta.colorVar }}>{meta.label}</span>
                            {item.scheduledAt && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatShortDate(item.scheduledAt)}{' '}
                                  {formatTime(item.scheduledAt, workspace.settings.timeFormat)}
                                </span>
                              </>
                            )}
                            {hasNotes && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1">
                                  <FileText className="w-3 h-3" />
                                  <span>Details</span>
                                </span>
                              </>
                            )}
                          </div>
                        </button>

                        {/* Inline Status Selector */}
                        <select
                          value={item.status}
                          onChange={(e) =>
                            updateListItem(item.id, { status: e.target.value as ListItemStatus })
                          }
                          aria-label={`Change status for ${item.title}`}
                          className="h-8 px-2 rounded-lg border text-xs outline-none shrink-0"
                          style={{
                            backgroundColor: 'var(--bg-surface-subtle)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {ALL_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {STATUS_META[st].label}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => deleteListItem(item.id)}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-8 w-8 flex items-center justify-center rounded-lg transition-opacity shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                          aria-label={`Delete ${item.title}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Create New List Modal (Slide-up bottom sheet on mobile) */}
      {createListOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Create New List"
        >
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setCreateListOpen(false)}
          />
          <form
            onSubmit={handleCreateList}
            className="relative z-10 w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border-t sm:border px-5 sm:px-6 pt-3 sm:pt-6 pb-6 space-y-5"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              boxShadow: 'var(--shadow-popover)',
            }}
          >
            <div className="sm:hidden flex justify-center pb-1">
              <span
                className="w-10 h-1 rounded-full"
                style={{ backgroundColor: 'var(--border-strong)' }}
                aria-hidden="true"
              />
            </div>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">New List</h2>
              <button
                type="button"
                onClick={() => setCreateListOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                List Name
              </label>
              <input
                type="text"
                required
                autoFocus
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                placeholder="e.g. Books, Podcasts, Side Projects"
                className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                Icon
              </label>
              <div className="grid grid-cols-6 gap-1.5">
                {LIST_ICON_KEYS.map((key) => {
                  const active = newListIcon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setNewListIcon(key)}
                      className="h-9 rounded-lg border flex items-center justify-center"
                      style={{
                        backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                        borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >
                      <DynamicIcon name={key} className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateListOpen(false)}
                className="h-9 px-3.5 rounded-lg border text-xs font-medium"
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
                className="h-9 px-4 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                Create List
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
