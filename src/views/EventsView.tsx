import React, { useMemo, useState } from 'react';
import { ArrowLeft, Calendar, MapPin, Search, Trash2 } from 'lucide-react';
import { EntryScheduleEditor } from '../components/EntryScheduleEditor';
import { NlpInputBar } from '../components/NlpInputBar';
import { TiptapEditor } from '../components/TiptapEditor';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  formatRelativeDayLabel,
  formatShortDate,
  formatTime,
  getTodayKey,
  toLocalDateKey,
} from '../utils/date';

type EventScope = 'upcoming' | 'today' | 'past' | 'all';

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export const EventsView: React.FC = () => {
  const { workspace, addTimelineEntry, updateEntry, deleteEntry } = useWorkspace();
  const [scope, setScope] = useState<EventScope>('upcoming');
  const [search, setSearch] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(() => {
    const first = workspace.entries.find((e) => e.type === 'event');
    return first ? first.id : null;
  });
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const todayKey = getTodayKey();
  const { timeFormat } = workspace.settings;

  const allEvents = useMemo(
    () => workspace.entries.filter((e) => e.type === 'event'),
    [workspace.entries]
  );

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = allEvents.filter((ev) => {
      const evDay = toLocalDateKey(ev.scheduledAt || ev.createdAt);
      if (scope === 'today' && evDay !== todayKey) return false;
      if (scope === 'upcoming' && evDay < todayKey) return false;
      if (scope === 'past' && evDay >= todayKey) return false;

      if (!q) return true;
      return (
        ev.title.toLowerCase().includes(q) ||
        (ev.location || '').toLowerCase().includes(q) ||
        stripHtml(ev.content).toLowerCase().includes(q)
      );
    });

    return list.sort((a, b) => {
      const ta = new Date(a.scheduledAt || a.createdAt).getTime();
      const tb = new Date(b.scheduledAt || b.createdAt).getTime();
      return scope === 'past' ? tb - ta : ta - tb;
    });
  }, [allEvents, scope, search, todayKey]);

  const activeEvent = useMemo(
    () => allEvents.find((e) => e.id === selectedEventId) || filteredEvents[0] || null,
    [allEvents, selectedEventId, filteredEvents]
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-9 space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-5 border-b">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Events</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Scheduled calendar events synced automatically with your Timeline spine.
          </p>
        </div>
        <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {allEvents.length} events total
        </span>
      </header>

      {/* NLP Quick Create */}
      <NlpInputBar
        placeholder='Schedule an event... (try "Design sync 22/11 2pm-3pm", "23 December", or "next week")'
        baseDateKey={todayKey}
        submitLabel="New Event"
        onSubmit={(rawText) => {
          const created = addTimelineEntry('event', rawText, todayKey);
          if (created) {
            setSelectedEventId(created.id);
            setMobileDetailOpen(true);
            return true;
          }
          return false;
        }}
      />

      {/* Filter & Search Toolbar (mirrors NotesView structure) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div
          className="inline-flex items-center gap-1 p-1 rounded-lg border self-start"
          style={{
            backgroundColor: 'var(--bg-surface-subtle)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {(
            [
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'today', label: 'Today' },
              { id: 'past', label: 'Past' },
              { id: 'all', label: 'All' },
            ] as { id: EventScope; label: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setScope(opt.id)}
              className="px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
              style={{
                backgroundColor: scope === opt.id ? 'var(--bg-surface)' : 'transparent',
                color: scope === opt.id ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border w-full md:w-64"
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
            placeholder="Search events or locations..."
            className="w-full bg-transparent text-xs outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
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
          {filteredEvents.length === 0 ? (
            <div className="p-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              No events in this view. Add one above using shortcuts like "tomorrow at 10am".
            </div>
          ) : (
            filteredEvents.map((ev) => {
              const isActive = activeEvent?.id === ev.id;
              const startIso = ev.scheduledAt || ev.createdAt;
              const dayKey = toLocalDateKey(startIso);
              const startTime = formatTime(startIso, timeFormat);
              const endTime = ev.endAt ? formatTime(ev.endAt, timeFormat) : null;

              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => {
                    setSelectedEventId(ev.id);
                    setMobileDetailOpen(true);
                  }}
                  className="w-full text-left px-4 py-3.5 transition-colors block"
                  style={{
                    backgroundColor: isActive ? 'var(--bg-surface-subtle)' : 'transparent',
                  }}
                >
                  <div
                    className="text-[11px] font-mono tabular-nums font-medium mb-1"
                    style={{ color: 'var(--accent)' }}
                  >
                    {formatRelativeDayLabel(dayKey)} · {startTime}
                    {endTime ? ` – ${endTime}` : ''}
                  </div>
                  <div
                    className="text-sm font-semibold leading-snug line-clamp-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {ev.title}
                  </div>
                  {ev.location && (
                    <div
                      className="mt-1.5 flex items-center gap-1.5 text-xs truncate"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{ev.location}</span>
                    </div>
                  )}
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
          {!activeEvent ? (
            <div className="py-20 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Select an event or schedule a new one above.
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
                  <span>Events</span>
                </button>

                <div
                  className="hidden lg:flex items-center gap-2 text-xs font-mono tabular-nums"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  <span>
                    {formatShortDate(activeEvent.scheduledAt || activeEvent.createdAt)} ·{' '}
                    {formatTime(activeEvent.scheduledAt || activeEvent.createdAt, timeFormat)}
                    {activeEvent.endAt ? ` – ${formatTime(activeEvent.endAt, timeFormat)}` : ''}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    deleteEntry(activeEvent.id);
                    setSelectedEventId(null);
                    setMobileDetailOpen(false);
                  }}
                  className="h-8 w-8 flex items-center justify-center rounded-lg border ml-auto"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--danger)',
                  }}
                  aria-label="Delete event"
                  title="Delete event"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <input
                type="text"
                value={activeEvent.title}
                onChange={(e) => updateEntry(activeEvent.id, { title: e.target.value })}
                placeholder="Event title"
                className="w-full bg-transparent font-display text-xl sm:text-2xl font-bold outline-none"
                style={{ color: 'var(--text-primary)' }}
              />

              {/* Unified Separated Date + Smart NLP + Time Schedule Editor */}
              <EntryScheduleEditor
                entry={activeEvent}
                timeFormat={timeFormat}
                onUpdate={(patch) => updateEntry(activeEvent.id, patch)}
                variant="event"
              />

              {/* Event Location */}
              <div
                className="p-3.5 rounded-xl border space-y-1.5"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
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
                  value={activeEvent.location || ''}
                  onChange={(e) => updateEntry(activeEvent.id, { location: e.target.value })}
                  placeholder="Add address, room, or meeting URL..."
                  className="w-full h-9 px-2.5 rounded-lg border text-xs outline-none"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold block" style={{ color: 'var(--text-secondary)' }}>
                  Agenda &amp; Notes (Markdown)
                </label>
                <TiptapEditor
                  docId={activeEvent.id}
                  content={activeEvent.content}
                  onChange={(html) => updateEntry(activeEvent.id, { content: html })}
                  placeholder="Write event agenda, prep checklist, or meeting notes..."
                  minHeight={260}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
