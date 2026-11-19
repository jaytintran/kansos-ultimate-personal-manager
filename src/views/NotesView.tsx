import React, { useMemo, useState } from 'react';
import { ArrowLeft, Clock, Pin, Plus, Search, Tag, Trash2, X } from 'lucide-react';
import { EntryScheduleEditor } from '../components/EntryScheduleEditor';
import { NlpInputBar } from '../components/NlpInputBar';
import { TiptapEditor } from '../components/TiptapEditor';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  formatShortDate,
  formatTime,
  getEffectiveSortMs,
  getTodayKey,
} from '../utils/date';

type NoteSort = 'recent' | 'title' | 'oldest';

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export const NotesView: React.FC = () => {
  const { workspace, addTimelineEntry, updateEntry, deleteEntry } = useWorkspace();
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<NoteSort>('recent');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(() => {
    const first = workspace.entries.find((e) => e.type === 'note');
    return first ? first.id : null;
  });
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [tagDraft, setTagDraft] = useState('');

  const { timeFormat } = workspace.settings;

  const allNotes = useMemo(
    () => workspace.entries.filter((e) => e.type === 'note'),
    [workspace.entries]
  );

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of allNotes) {
      for (const tag of note.tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [allNotes]);

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = allNotes.filter((note) => {
      if (selectedTag && !note.tags.includes(selectedTag)) return false;
      if (!q) return true;
      return (
        note.title.toLowerCase().includes(q) ||
        stripHtml(note.content).toLowerCase().includes(q) ||
        note.tags.some((t) => t.toLowerCase().includes(q))
      );
    });

    return list.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'oldest') return getEffectiveSortMs(a) - getEffectiveSortMs(b);
      return getEffectiveSortMs(b) - getEffectiveSortMs(a);
    });
  }, [allNotes, search, selectedTag, sortBy]);

  const activeNote = useMemo(
    () => allNotes.find((n) => n.id === selectedNoteId) || filteredNotes[0] || null,
    [allNotes, selectedNoteId, filteredNotes]
  );

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNote) return;
    const clean = tagDraft.trim().toLowerCase().replace(/^#/, '');
    if (!clean) return;
    if (!activeNote.tags.includes(clean)) {
      updateEntry(activeNote.id, { tags: [...activeNote.tags, clean] });
    }
    setTagDraft('');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-9 space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-5 border-b">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Notes</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Markdown notes synced automatically with your Timeline spine.
          </p>
        </div>
        <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {allNotes.length} notes · {allTags.length} tags
        </span>
      </header>

      {/* NLP Quick Create */}
      <NlpInputBar
        placeholder='Capture a new note... (add "at 3pm" to place at a specific Timeline slot)'
        baseDateKey={getTodayKey()}
        submitLabel="New Note"
        onSubmit={(rawText) => {
          const created = addTimelineEntry('note', rawText, getTodayKey(), {
            tags: selectedTag ? [selectedTag] : [],
          });
          if (created) {
            setSelectedNoteId(created.id);
            setMobileDetailOpen(true);
            return true;
          }
          return false;
        }}
      />

      {/* Comprehensive Tag Filter & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
            style={{
              backgroundColor: selectedTag === null ? 'var(--accent-soft)' : 'transparent',
              color: selectedTag === null ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            All ({allNotes.length})
          </button>
          {allTags.map(([tag, count]) => {
            const active = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(active ? null : tag)}
                className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                style={{
                  backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface-subtle)',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                #{tag}{' '}
                <span className="font-mono tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border flex-1 md:w-56"
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
              placeholder="Search notes..."
              className="w-full bg-transparent text-xs outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>

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
            <option value="recent">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>
      </div>

      {/* Shared Two-Pane Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Master List */}
        <div
          className={`lg:col-span-4 rounded-2xl border divide-y overflow-hidden ${
            mobileDetailOpen ? 'hidden lg:block' : 'block'
          }`}
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {filteredNotes.length === 0 ? (
            <div className="p-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              No notes match the current filter.
            </div>
          ) : (
            filteredNotes.map((note) => {
              const isActive = activeNote?.id === note.id;
              const excerpt = stripHtml(note.content);
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => {
                    setSelectedNoteId(note.id);
                    setMobileDetailOpen(true);
                  }}
                  className="w-full text-left px-4 py-3.5 transition-colors block"
                  style={{
                    backgroundColor: isActive ? 'var(--bg-surface-subtle)' : 'transparent',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="text-sm font-semibold leading-snug line-clamp-1"
                      style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}
                    >
                      {note.title}
                    </span>
                    {note.pinned && (
                      <Pin
                        className="w-3.5 h-3.5 shrink-0 mt-0.5"
                        style={{ color: 'var(--accent)' }}
                      />
                    )}
                  </div>
                  {excerpt && (
                    <p
                      className="mt-1 text-xs line-clamp-2 leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {excerpt}
                    </p>
                  )}
                  <div
                    className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span className="font-mono tabular-nums">
                      {formatShortDate(note.scheduledAt || note.createdAt)}
                    </span>
                    {note.tags.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{note.tags.map((t) => `#${t}`).join(' ')}</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Detail Editor Pane (Full-screen distraction-free editor on mobile, split pane on lg+) */}
        <div
          className={`lg:col-span-8 lg:rounded-2xl lg:border ${
            mobileDetailOpen
              ? 'fixed inset-0 z-40 overflow-y-auto flex flex-col lg:static lg:inset-auto lg:z-auto lg:block'
              : 'hidden lg:block'
          }`}
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {!activeNote ? (
            <div className="py-20 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Select a note or capture a new one above to begin writing.
            </div>
          ) : (
            <div className="p-4 sm:p-6 space-y-5 pb-12 lg:pb-6">
              <div
                className="sticky top-0 z-10 -mx-4 px-4 py-3 -mt-4 border-b lg:static lg:mx-0 lg:px-0 lg:py-0 lg:mt-0 lg:border-b-0 flex items-center justify-between gap-3"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setMobileDetailOpen(false)}
                  className="lg:hidden min-h-[40px] pr-2 inline-flex items-center gap-1.5 text-sm font-semibold"
                  style={{ color: 'var(--accent)' }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Notes</span>
                </button>

                <div
                  className="hidden lg:flex items-center gap-2 text-xs font-mono tabular-nums"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span>
                    Created {formatShortDate(activeNote.createdAt)}{' '}
                    {formatTime(activeNote.createdAt, timeFormat)}
                  </span>
                  {activeNote.scheduledAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        Scheduled {formatShortDate(activeNote.scheduledAt)}{' '}
                        {formatTime(activeNote.scheduledAt, timeFormat)}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowTimestamps((s) => !s)}
                    className="h-8 px-2.5 rounded-lg border text-xs inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: showTimestamps
                        ? 'var(--accent-soft)'
                        : 'var(--bg-surface-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: showTimestamps ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Timestamps</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateEntry(activeNote.id, { pinned: !activeNote.pinned })}
                    className="h-8 px-2.5 rounded-lg border text-xs inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: activeNote.pinned
                        ? 'var(--accent-soft)'
                        : 'var(--bg-surface-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: activeNote.pinned ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <Pin className="w-3.5 h-3.5" />
                    <span>{activeNote.pinned ? 'Pinned' : 'Pin'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deleteEntry(activeNote.id);
                      setSelectedNoteId(null);
                      setMobileDetailOpen(false);
                    }}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--danger)',
                    }}
                    aria-label="Delete note"
                    title="Delete note"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={activeNote.title}
                onChange={(e) => updateEntry(activeNote.id, { title: e.target.value })}
                placeholder="Note title"
                className="w-full bg-transparent font-display text-xl sm:text-2xl font-bold outline-none"
                style={{ color: 'var(--text-primary)' }}
              />

              {showTimestamps && (
                <EntryScheduleEditor
                  entry={activeNote}
                  timeFormat={timeFormat}
                  onUpdate={(patch) => updateEntry(activeNote.id, patch)}
                  variant="note"
                />
              )}

              {/* Inline Tag Bar */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Tag className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                {activeNote.tags.map((tag, i) => (
                  <React.Fragment key={tag}>
                    {i > 0 && (
                      <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>
                        ·
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        updateEntry(activeNote.id, {
                          tags: activeNote.tags.filter((t) => t !== tag),
                        })
                      }
                      className="inline-flex items-center gap-1 hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      <span>#{tag}</span>
                      <X className="w-3 h-3 opacity-70" />
                    </button>
                  </React.Fragment>
                ))}
                <form onSubmit={handleAddTag} className="inline-flex items-center gap-1">
                  <input
                    type="text"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    placeholder="+ add tag"
                    className="w-24 bg-transparent text-xs outline-none px-1.5 py-0.5 rounded"
                    style={{ color: 'var(--text-secondary)' }}
                  />
                  {tagDraft.trim() && (
                    <button
                      type="submit"
                      className="h-6 px-1.5 rounded text-[11px] inline-flex items-center"
                      style={{
                        backgroundColor: 'var(--accent-soft)',
                        color: 'var(--accent)',
                      }}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </form>
              </div>

              <TiptapEditor
                docId={activeNote.id}
                content={activeNote.content}
                onChange={(html) => updateEntry(activeNote.id, { content: html })}
                minHeight={320}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
