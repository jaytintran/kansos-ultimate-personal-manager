import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  FileText,
  FolderOpen,
  LayoutGrid,
  List as ListIcon,
  MoreVertical,
  Pencil,
  Pin,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { DynamicIcon, LIST_ICON_KEYS } from '../components/IconLibrary';
import { RichContent } from '../components/RichContent';
import { useWorkspace } from '../context/WorkspaceContext';
import { ContextMenuRecord, DetailSheetTarget, NoteNotebook } from '../types';
import { countWordsFromHtml, formatCompactDayHeading, toLocalDateKey } from '../utils/date';

type NoteSort = 'pinned' | 'updated' | 'created' | 'title';
type NotesViewMode = 'grid' | 'list';

const SORT_STORAGE_KEY = 'kanso_notes_sort_v1';
const VIEW_MODE_STORAGE_KEY = 'kanso_notes_view_mode_v1';

const LEGACY_EMOJI_ICON_MAP: Record<string, string> = {
  '📚': 'BookOpen',
  '🌿': 'Leaf',
  '✍️': 'PenLine',
  '📓': 'Bookmark',
};

const NOTEBOOK_ICON_KEYS = [
  'BookOpen',
  'Leaf',
  'PenLine',
  'Bookmark',
  ...LIST_ICON_KEYS.filter((k) => !['BookOpen', 'Bookmark'].includes(k)),
];

function resolveNotebookIconName(rawIcon?: string): string {
  if (!rawIcon) return 'BookOpen';
  if (LEGACY_EMOJI_ICON_MAP[rawIcon]) return LEGACY_EMOJI_ICON_MAP[rawIcon];
  return rawIcon;
}

function stripHtmlPreview(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

interface NotesViewProps {
  onOpenDetail: (target: DetailSheetTarget) => void;
  onOpenContextMenu: (record: ContextMenuRecord, e: React.MouseEvent) => void;
}

export const NotesView: React.FC<NotesViewProps> = ({
  onOpenDetail,
  onOpenContextMenu,
}) => {
  const {
    workspace,
    updateEntry,
    addNoteNotebook,
    updateNoteNotebook,
    deleteNoteNotebook,
  } = useWorkspace();

  const notebooks = useMemo(() => workspace.noteNotebooks || [], [workspace.noteNotebooks]);

  const [selectedNotebookId, setSelectedNotebookId] = useState<'all' | 'unfiled' | string>('all');
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [sortBy, setSortBy] = useState<NoteSort>(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY) as NoteSort | null;
      return saved || 'pinned';
    } catch {
      return 'pinned';
    }
  });
  const [viewMode, setViewMode] = useState<NotesViewMode>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY) as NotesViewMode | null;
      return saved === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });

  const [notebookModal, setNotebookModal] = useState<{
    mode: 'create' | 'edit';
    notebook?: NoteNotebook;
    name: string;
    icon: string;
  } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, sortBy);
    } catch {
      // Ignore
    }
  }, [sortBy]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // Ignore
    }
  }, [viewMode]);

  // Reset to 'all' if the selected notebook is deleted
  useEffect(() => {
    if (
      selectedNotebookId !== 'all' &&
      selectedNotebookId !== 'unfiled' &&
      !notebooks.some((nb) => nb.id === selectedNotebookId)
    ) {
      setSelectedNotebookId('all');
    }
  }, [notebooks, selectedNotebookId]);

  const notebookMap = useMemo(() => {
    const map = new Map<string, NoteNotebook>();
    notebooks.forEach((nb) => map.set(nb.id, nb));
    return map;
  }, [notebooks]);

  // Aggregate standalone + Timeline-born active notes
  const allNotes = useMemo(
    () =>
      workspace.entries.filter(
        (e) => e.type === 'note' && !e.deletedAt && !e.trashedAt && !e.archived
      ),
    [workspace.entries]
  );

  const notebookCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let unfiled = 0;
    allNotes.forEach((n) => {
      if (n.notebookId && notebookMap.has(n.notebookId)) {
        counts.set(n.notebookId, (counts.get(n.notebookId) || 0) + 1);
      } else {
        unfiled += 1;
      }
    });
    return { counts, unfiled };
  }, [allNotes, notebookMap]);

  const notesInScope = useMemo(() => {
    if (selectedNotebookId === 'all') return allNotes;
    if (selectedNotebookId === 'unfiled') {
      return allNotes.filter((n) => !n.notebookId || !notebookMap.has(n.notebookId));
    }
    return allNotes.filter((n) => n.notebookId === selectedNotebookId);
  }, [allNotes, selectedNotebookId, notebookMap]);

  const scopeTags = useMemo(() => {
    const set = new Set<string>();
    notesInScope.forEach((n) => (n.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [notesInScope]);

  // Reset tag filter if the active notebook doesn't have the selected tag
  useEffect(() => {
    if (selectedTag !== 'all' && !scopeTags.includes(selectedTag)) {
      setSelectedTag('all');
    }
  }, [selectedTag, scopeTags]);

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notesInScope
      .filter((note) => {
        if (selectedTag !== 'all' && !(note.tags || []).includes(selectedTag)) return false;
        if (!q) return true;
        return (
          note.title.toLowerCase().includes(q) ||
          note.content.toLowerCase().includes(q) ||
          (note.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'pinned') {
          if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
          return (
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
          );
        }
        if (sortBy === 'updated') {
          return (
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
          );
        }
        if (sortBy === 'created') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return a.title.localeCompare(b.title);
      });
  }, [notesInScope, search, selectedTag, sortBy]);

  const activeNotebook =
    selectedNotebookId !== 'all' && selectedNotebookId !== 'unfiled'
      ? notebookMap.get(selectedNotebookId) || null
      : null;

  const handleSaveNotebookModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notebookModal || !notebookModal.name.trim()) return;
    if (notebookModal.mode === 'create') {
      const created = addNoteNotebook(notebookModal.name.trim(), notebookModal.icon);
      setSelectedNotebookId(created.id);
    } else if (notebookModal.notebook) {
      updateNoteNotebook(notebookModal.notebook.id, {
        name: notebookModal.name.trim(),
        icon: notebookModal.icon,
      });
    }
    setNotebookModal(null);
  };

  const handleDeleteActiveNotebook = () => {
    if (!activeNotebook) return;
    deleteNoteNotebook(activeNotebook.id);
    setSelectedNotebookId('all');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-20 space-y-4">
      {/* Header */}
      <header
        className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="font-display text-lg sm:text-[20px] font-semibold tracking-tight leading-tight truncate">
            {activeNotebook
              ? activeNotebook.name
              : selectedNotebookId === 'unfiled'
              ? 'Unfiled Notes'
              : 'Notes'}
          </h1>
          <span
            className="text-xs font-mono tabular-nums shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            {notesInScope.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {activeNotebook && (
            <>
              <button
                type="button"
                onClick={() =>
                  setNotebookModal({
                    mode: 'edit',
                    notebook: activeNotebook,
                    name: activeNotebook.name,
                    icon: resolveNotebookIconName(activeNotebook.icon),
                  })
                }
                className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)]"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
                title="Rename notebook"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </button>
              <button
                type="button"
                onClick={handleDeleteActiveNotebook}
                className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)]"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--danger)',
                }}
                title="Delete notebook (notes are preserved)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() =>
              onOpenDetail({
                mode: 'note',
                draft: {
                  type: 'note',
                  title: '',
                  content: '',
                  notebookId: activeNotebook ? activeNotebook.id : null,
                },
              })
            }
            className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Note</span>
          </button>
        </div>
      </header>

      {/* Horizontal Scrolling Notebooks Strip */}
      <nav
        aria-label="Notebooks"
        className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b -mt-1"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <button
          type="button"
          onClick={() => setSelectedNotebookId('all')}
          className="h-10 px-3 inline-flex items-center gap-2 text-xs font-medium shrink-0 border-b-2 transition-colors whitespace-nowrap"
          style={{
            borderColor: selectedNotebookId === 'all' ? 'var(--accent)' : 'transparent',
            color:
              selectedNotebookId === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
            backgroundColor:
              selectedNotebookId === 'all' ? 'var(--accent-soft)' : 'transparent',
          }}
        >
          <BookOpen
            className="w-3.5 h-3.5 shrink-0"
            style={{
              color: selectedNotebookId === 'all' ? 'var(--accent)' : 'var(--text-muted)',
            }}
          />
          <span className={selectedNotebookId === 'all' ? 'font-semibold' : ''}>All Notes</span>
          <span
            className="font-mono tabular-nums text-[11px] opacity-75"
            style={{ color: selectedNotebookId === 'all' ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            {allNotes.length}
          </span>
        </button>

        {notebooks.map((nb) => {
          const active = selectedNotebookId === nb.id;
          const count = notebookCounts.counts.get(nb.id) || 0;
          const iconName = resolveNotebookIconName(nb.icon);
          return (
            <button
              key={nb.id}
              type="button"
              onClick={() => setSelectedNotebookId(nb.id)}
              className="h-10 px-3 inline-flex items-center gap-2 text-xs font-medium shrink-0 border-b-2 transition-colors whitespace-nowrap"
              style={{
                borderColor: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
              }}
            >
              <DynamicIcon
                name={iconName}
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
              />
              <span className={active ? 'font-semibold' : ''}>{nb.name}</span>
              <span
                className="font-mono tabular-nums text-[11px] opacity-75"
                style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {count}
              </span>
            </button>
          );
        })}

        {notebookCounts.unfiled > 0 && (
          <button
            type="button"
            onClick={() => setSelectedNotebookId('unfiled')}
            className="h-10 px-3 inline-flex items-center gap-2 text-xs font-medium shrink-0 border-b-2 transition-colors whitespace-nowrap"
            style={{
              borderColor: selectedNotebookId === 'unfiled' ? 'var(--accent)' : 'transparent',
              color:
                selectedNotebookId === 'unfiled'
                  ? 'var(--text-primary)'
                  : 'var(--text-secondary)',
              backgroundColor:
                selectedNotebookId === 'unfiled' ? 'var(--accent-soft)' : 'transparent',
            }}
          >
            <FolderOpen
              className="w-3.5 h-3.5 shrink-0"
              style={{
                color: selectedNotebookId === 'unfiled' ? 'var(--accent)' : 'var(--text-muted)',
              }}
            />
            <span className={selectedNotebookId === 'unfiled' ? 'font-semibold' : ''}>
              Unfiled
            </span>
            <span
              className="font-mono tabular-nums text-[11px] opacity-75"
              style={{
                color: selectedNotebookId === 'unfiled' ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {notebookCounts.unfiled}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() =>
            setNotebookModal({
              mode: 'create',
              name: '',
              icon: 'BookOpen',
            })
          }
          className="h-8 px-2.5 ml-1 my-1 rounded-lg text-xs font-medium inline-flex items-center gap-1 shrink-0 transition-colors hover:bg-[var(--bg-surface-subtle)]"
          style={{ color: 'var(--text-muted)' }}
          title="New notebook"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New</span>
        </button>
      </nav>

      {/* Unified 32px Toolbar: Search, Tag Filter, Sort, Grid/List Toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border flex-1 min-w-[200px]"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              activeNotebook ? `Search in ${activeNotebook.name}...` : 'Search notes...'
            }
            className="flex-1 min-w-0 bg-transparent text-xs outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="opacity-70 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select
          value={selectedTag}
          onChange={(e) => setSelectedTag(e.target.value)}
          aria-label="Filter by tag"
          className="h-8 px-2.5 rounded-lg border text-xs outline-none"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          <option value="all">All Tags</option>
          {scopeTags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as NoteSort)}
          aria-label="Sort notes"
          className="h-8 px-2.5 rounded-lg border text-xs outline-none"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          <option value="pinned">Sort: Pinned First</option>
          <option value="updated">Sort: Recently Updated</option>
          <option value="created">Sort: Recently Created</option>
          <option value="title">Sort: Title A–Z</option>
        </select>

        {/* Grid / List View Mode Toggle */}
        <div
          className="inline-flex items-center h-8 p-0.5 rounded-lg border shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            title="Card grid"
            aria-label="Card grid view"
            aria-pressed={viewMode === 'grid'}
            className="h-6.5 w-7 flex items-center justify-center rounded-md transition-colors"
            style={{
              backgroundColor: viewMode === 'grid' ? 'var(--accent-soft)' : 'transparent',
              color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            title="Quiet list"
            aria-label="Quiet list view"
            aria-pressed={viewMode === 'list'}
            className="h-6.5 w-7 flex items-center justify-center rounded-md transition-colors"
            style={{
              backgroundColor: viewMode === 'list' ? 'var(--accent-soft)' : 'transparent',
              color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            <ListIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Notes Content: Unified 2-3 Col Compact Hairline Cards OR Quiet List */}
      {filteredNotes.length === 0 ? (
        <div
          className="rounded-xl border border-dashed py-14 px-4 text-center space-y-2"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
        >
          <FileText className="w-6 h-6 mx-auto opacity-50" />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {activeNotebook ? `No notes in ${activeNotebook.name}` : 'No matching notes'}
          </p>
          <p className="text-xs">
            Create a fresh note or adjust your notebook, search, and tag filters.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredNotes.map((note) => {
            const words = countWordsFromHtml(note.content);
            const updatedDay = formatCompactDayHeading(
              toLocalDateKey(note.updatedAt || note.createdAt)
            );
            const noteNotebook = note.notebookId ? notebookMap.get(note.notebookId) : null;

            return (
              <article
                key={note.id}
                onClick={() => onOpenDetail({ mode: 'note', id: note.id })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onOpenContextMenu({ kind: 'entry', entry: note }, e);
                }}
                className="rounded-xl border p-3 flex flex-col justify-between gap-2.5 cursor-pointer transition-colors hover:border-[var(--border-strong)] min-h-[156px]"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h2
                      className="text-sm font-medium leading-snug line-clamp-2 min-w-0"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {note.title || 'Untitled Note'}
                    </h2>

                    {/* Always-visible Pin indicator & Action trigger */}
                    <div className="flex items-center gap-0.5 shrink-0 -mr-1 -mt-0.5">
                      {note.pinned && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateEntry(note.id, { pinned: false });
                          }}
                          className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)]"
                          style={{ color: 'var(--accent)' }}
                          title="Pinned note (click to unpin)"
                          aria-label="Unpin note"
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenContextMenu({ kind: 'entry', entry: note }, e);
                        }}
                        className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)]"
                        style={{ color: 'var(--text-muted)' }}
                        aria-label="Note actions"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {note.content ? (
                    <RichContent html={note.content} className="line-clamp-5 text-xs" fade />
                  ) : (
                    <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                      Empty note...
                    </p>
                  )}
                </div>

                {/* Unified Bottom Hairline Monospace Metadata Footer */}
                <div
                  className="pt-2 border-t text-[11px] font-mono tabular-nums truncate"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>{updatedDay}</span>
                  <span> · {words}w</span>
                  {selectedNotebookId === 'all' && noteNotebook && (
                    <span> · {noteNotebook.name}</span>
                  )}
                  {note.tags.length > 0 && (
                    <span> · {note.tags.map((t) => `#${t}`).join(' ')}</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div
          className="divide-y border-y"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {filteredNotes.map((note) => {
            const words = countWordsFromHtml(note.content);
            const updatedDay = formatCompactDayHeading(
              toLocalDateKey(note.updatedAt || note.createdAt)
            );
            const noteNotebook = note.notebookId ? notebookMap.get(note.notebookId) : null;
            const plainSnippet = note.content ? stripHtmlPreview(note.content) : '';

            return (
              <div
                key={note.id}
                onClick={() => onOpenDetail({ mode: 'note', id: note.id })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onOpenContextMenu({ kind: 'entry', entry: note }, e);
                }}
                className="py-2.5 px-2 -mx-2 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]/75"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {note.pinned && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateEntry(note.id, { pinned: false });
                      }}
                      className="h-5 w-5 flex items-center justify-center rounded shrink-0 hover:bg-[var(--bg-surface-hover)]"
                      style={{ color: 'var(--accent)' }}
                      title="Unpin note"
                      aria-label="Unpin note"
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <span
                    className="text-sm font-medium leading-snug truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {note.title || 'Untitled Note'}
                  </span>
                  {plainSnippet && (
                    <span
                      className="hidden md:inline text-xs truncate flex-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      — {plainSnippet}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div
                    className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono tabular-nums"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {selectedNotebookId === 'all' && noteNotebook && (
                      <span>{noteNotebook.name} ·</span>
                    )}
                    {note.tags.length > 0 && (
                      <span className="max-w-[140px] truncate">
                        {note.tags.map((t) => `#${t}`).join(' ')} ·
                      </span>
                    )}
                    <span>{words}w ·</span>
                    <span>{updatedDay}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenContextMenu({ kind: 'entry', entry: note }, e);
                    }}
                    className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)]"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label="Note actions"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Notebook Modal */}
      {notebookModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setNotebookModal(null)}
          />
          <form
            onSubmit={handleSaveNotebookModal}
            className="relative z-10 w-full max-w-md rounded-2xl border p-5 space-y-4"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-strong)',
              boxShadow: 'var(--shadow-popover)',
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold">
                {notebookModal.mode === 'create' ? 'New Notebook' : 'Edit Notebook'}
              </h3>
              <button
                type="button"
                onClick={() => setNotebookModal(null)}
                className="h-7 w-7 flex items-center justify-center rounded-md"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Notebook Name
              </label>
              <input
                type="text"
                value={notebookModal.name}
                onChange={(e) => setNotebookModal({ ...notebookModal, name: e.target.value })}
                placeholder="e.g. Learning, Design Notes, Personal Journal..."
                autoFocus
                className="w-full h-9 px-3 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Icon
              </label>
              <div className="flex flex-wrap gap-1.5">
                {NOTEBOOK_ICON_KEYS.map((key) => {
                  const active = notebookModal.icon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setNotebookModal({ ...notebookModal, icon: key })}
                      className="h-8 w-8 flex items-center justify-center rounded-lg border transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                        borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                      title={key}
                    >
                      <DynamicIcon name={key} className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNotebookModal(null)}
                className="h-8 px-3 rounded-lg border text-xs font-medium"
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
                disabled={!notebookModal.name.trim()}
                className="h-8 px-3.5 rounded-lg text-xs font-semibold disabled:opacity-40"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {notebookModal.mode === 'create' ? 'Create Notebook' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
