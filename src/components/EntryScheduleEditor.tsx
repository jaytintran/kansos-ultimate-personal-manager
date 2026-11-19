import React, { useMemo, useState } from 'react';
import { Calendar, Check, Clock, Inbox, Sparkles } from 'lucide-react';
import { Entry } from '../types';
import {
  addDaysToKey,
  addMinutesToIso,
  combineLocalDateAndTime,
  formatRelativeDayLabel,
  formatShortDate,
  formatTime,
  getTodayKey,
  replaceIsoDateKeepingTime,
  replaceIsoTimeKeepingDate,
  toLocalDateKey,
  toTimeInputValue,
} from '../utils/date';
import { parseNlpInput } from '../utils/nlp';

interface EntryScheduleEditorProps {
  entry: Entry;
  timeFormat: '12h' | '24h';
  onUpdate: (patch: Partial<Entry>) => void;
  /** Optional mode to tailor which time rows appear by default (all remain supported). */
  variant?: 'full' | 'event' | 'note';
}

export const EntryScheduleEditor: React.FC<EntryScheduleEditorProps> = ({
  entry,
  timeFormat,
  onUpdate,
  variant = 'full',
}) => {
  const [nlpDraft, setNlpDraft] = useState('');
  const [editingCreatedDate, setEditingCreatedDate] = useState(false);

  const todayKey = getTodayKey();

  // Active separated Date for the entry: prefer scheduledAt -> completedAt -> createdAt
  const activeDateKey = useMemo(() => {
    const anchor = entry.scheduledAt || entry.completedAt || entry.createdAt;
    return toLocalDateKey(anchor);
  }, [entry.scheduledAt, entry.completedAt, entry.createdAt]);

  const createdDateKey = useMemo(() => toLocalDateKey(entry.createdAt), [entry.createdAt]);

  const parsedNlp = useMemo(
    () => parseNlpInput(nlpDraft, activeDateKey, timeFormat),
    [nlpDraft, activeDateKey, timeFormat]
  );

  // Move scheduledAt, endAt, and completedAt onto nextDateKey while keeping createdAt on its original date
  const applyDateShift = (nextDateKey: string) => {
    if (!nextDateKey) return;
    const patch: Partial<Entry> = {};

    if (entry.scheduledAt) {
      patch.scheduledAt = replaceIsoDateKeepingTime(entry.scheduledAt, nextDateKey);
    }
    if (entry.endAt) {
      patch.endAt = replaceIsoDateKeepingTime(entry.endAt, nextDateKey);
    }
    if (entry.completedAt) {
      patch.completedAt = replaceIsoDateKeepingTime(entry.completedAt, nextDateKey);
    }

    // If the entry didn't have scheduled or completed yet, anchor scheduledAt onto the chosen date
    if (!entry.scheduledAt && !entry.completedAt) {
      patch.scheduledAt = combineLocalDateAndTime(nextDateKey, '09:00');
    }

    onUpdate(patch);
  };

  // Apply Smart NLP quick-adjust bar input
  const handleApplyNlp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlpDraft.trim()) return;
    if (!parsedNlp.scheduledAt && !parsedNlp.resolvedDateKey) return;

    const patch: Partial<Entry> = {};

    if (parsedNlp.hasExplicitDate && !parsedNlp.hasExplicitTime && parsedNlp.resolvedDateKey) {
      // Date-only command (e.g. "22/11", "23 December", "next week", "in 3 days"):
      // Shift scheduled, ends, and completed dates while keeping their clock times & leaving created date intact
      applyDateShift(parsedNlp.resolvedDateKey);
      setNlpDraft('');
      return;
    }

    if (parsedNlp.hasExplicitTime && parsedNlp.scheduledAt) {
      const targetDay =
        parsedNlp.hasExplicitDate && parsedNlp.resolvedDateKey
          ? parsedNlp.resolvedDateKey
          : activeDateKey;

      const startTimeStr = toTimeInputValue(parsedNlp.scheduledAt);
      const nextScheduled = combineLocalDateAndTime(targetDay, startTimeStr);
      if (nextScheduled) {
        patch.scheduledAt = nextScheduled;
      }

      if (parsedNlp.endAt) {
        const endTimeStr = toTimeInputValue(parsedNlp.endAt);
        const nextEnd = combineLocalDateAndTime(targetDay, endTimeStr);
        if (nextEnd) {
          patch.endAt = nextEnd;
        }
      } else if (parsedNlp.hasExplicitDate && entry.endAt) {
        patch.endAt = replaceIsoDateKeepingTime(entry.endAt, targetDay);
      }

      if (parsedNlp.hasExplicitDate && entry.completedAt) {
        patch.completedAt = replaceIsoDateKeepingTime(entry.completedAt, targetDay);
      }

      onUpdate(patch);
      setNlpDraft('');
    }
  };

  const showEndsRow =
    variant === 'event' ||
    entry.type === 'event' ||
    entry.type === 'timeblock' ||
    Boolean(entry.endAt);

  const showCompletedRow =
    variant === 'full' || entry.type === 'task' || entry.type === 'timeblock' || Boolean(entry.completedAt);

  const quickDateOptions = [
    { label: 'Today', key: todayKey },
    { label: 'Tomorrow', key: addDaysToKey(todayKey, 1) },
    { label: '+1w', key: addDaysToKey(todayKey, 7) },
  ];

  const nlpPreviewSummary = useMemo(() => {
    if (!nlpDraft.trim()) return null;
    if (!parsedNlp.hasExplicitDate && !parsedNlp.hasExplicitTime) return null;
    if (parsedNlp.hasExplicitDate && !parsedNlp.hasExplicitTime && parsedNlp.resolvedDateKey) {
      return `Move date → ${formatRelativeDayLabel(parsedNlp.resolvedDateKey)} (${formatShortDate(parsedNlp.resolvedDateKey)})`;
    }
    return parsedNlp.previewLabel ? `Set → ${parsedNlp.previewLabel}` : null;
  }, [nlpDraft, parsedNlp]);

  return (
    <div
      className="rounded-xl border p-4 space-y-3.5"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Smart NLP Quick-Input Bar */}
      <form onSubmit={handleApplyNlp} className="space-y-1.5">
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-colors focus-within:border-[var(--accent)]"
          style={{
            backgroundColor: 'var(--bg-surface-subtle)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
          <input
            type="text"
            value={nlpDraft}
            onChange={(e) => setNlpDraft(e.target.value)}
            placeholder='Quick adjust: "22/11 3pm", "23 December", "next week 2pm-3pm"...'
            className="flex-1 min-w-0 bg-transparent text-xs outline-none h-7"
            style={{ color: 'var(--text-primary)' }}
          />
          {nlpDraft.trim() && (
            <button
              type="submit"
              disabled={!nlpPreviewSummary}
              className="h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-40 shrink-0"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-fg)',
              }}
            >
              Apply
            </button>
          )}
        </div>
        {nlpPreviewSummary && (
          <div
            className="px-1 text-[11px] font-mono tabular-nums"
            style={{ color: 'var(--accent)' }}
          >
            {nlpPreviewSummary}
          </div>
        )}
      </form>

      {/* Separated Date Control */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2.5 border-t"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
          <div className="min-w-0">
            <div className="text-xs font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
              Date
            </div>
            <div className="text-[11px] leading-tight mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Applies to scheduled, ends &amp; completed
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="date"
            value={activeDateKey}
            onChange={(e) => {
              if (e.target.value) applyDateShift(e.target.value);
            }}
            aria-label="Entry date"
            className="h-9 px-2.5 rounded-lg border text-xs font-mono tabular-nums outline-none"
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />

          <div
            className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {quickDateOptions.map((opt) => {
              const active = activeDateKey === opt.key;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => applyDateShift(opt.key)}
                  className="h-8 px-2 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Separated Clean Time-Only Rows */}
      <div
        className="pt-2.5 border-t grid grid-cols-1 sm:grid-cols-2 gap-2.5"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {/* Created Time (keeps original creation date intact unless explicitly edited) */}
        <div
          className="p-2.5 rounded-xl border space-y-1.5"
          style={{
            backgroundColor: 'var(--bg-surface-subtle)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <label
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Inbox className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
              <span>Created</span>
            </label>
            <button
              type="button"
              onClick={() => setEditingCreatedDate((prev) => !prev)}
              className="text-[11px] font-mono tabular-nums hover:underline"
              style={{ color: 'var(--text-muted)' }}
              title="Click to adjust original creation date"
            >
              {formatShortDate(createdDateKey)}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="time"
              value={toTimeInputValue(entry.createdAt)}
              onChange={(e) => {
                const nextIso = replaceIsoTimeKeepingDate(entry.createdAt, e.target.value);
                if (nextIso) onUpdate({ createdAt: nextIso });
              }}
              aria-label="Created time"
              className="flex-1 min-w-0 h-9 px-2.5 rounded-lg border text-xs font-mono tabular-nums outline-none"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          {editingCreatedDate && (
            <input
              type="date"
              value={createdDateKey}
              onChange={(e) => {
                if (e.target.value) {
                  onUpdate({ createdAt: replaceIsoDateKeepingTime(entry.createdAt, e.target.value) });
                }
              }}
              aria-label="Original created date"
              className="w-full h-8 px-2 rounded-lg border text-[11px] font-mono tabular-nums outline-none"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            />
          )}
        </div>

        {/* Scheduled Time */}
        <div
          className="p-2.5 rounded-xl border space-y-1.5"
          style={{
            backgroundColor: 'var(--bg-surface-subtle)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <label
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
              <span>Scheduled</span>
            </label>
            <div className="flex items-center gap-2">
              {!entry.scheduledAt ? (
                <button
                  type="button"
                  onClick={() => {
                    const nowTime = toTimeInputValue(new Date().toISOString());
                    const iso = combineLocalDateAndTime(activeDateKey, nowTime);
                    if (iso) onUpdate({ scheduledAt: iso });
                  }}
                  className="text-[11px] font-medium hover:underline"
                  style={{ color: 'var(--accent)' }}
                >
                  Set now
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onUpdate({ scheduledAt: null })}
                  className="text-[11px] hover:underline"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <input
            type="time"
            value={toTimeInputValue(entry.scheduledAt)}
            onChange={(e) => {
              if (!e.target.value) {
                onUpdate({ scheduledAt: null });
                return;
              }
              const targetDate = entry.scheduledAt ? toLocalDateKey(entry.scheduledAt) : activeDateKey;
              const iso = combineLocalDateAndTime(targetDate, e.target.value);
              if (iso) onUpdate({ scheduledAt: iso });
            }}
            aria-label="Scheduled time"
            className="w-full h-9 px-2.5 rounded-lg border text-xs font-mono tabular-nums outline-none"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Ends Time (Events & Timeblocks) */}
        {showEndsRow && (
          <div
            className="p-2.5 rounded-xl border space-y-1.5"
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <label
                className="flex items-center gap-1.5 text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span>Ends</span>
              </label>
              <div className="flex items-center gap-1.5">
                {entry.scheduledAt && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate({ endAt: addMinutesToIso(entry.scheduledAt!, 30) })
                      }
                      className="text-[11px] font-mono hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      +30m
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate({ endAt: addMinutesToIso(entry.scheduledAt!, 60) })
                      }
                      className="text-[11px] font-mono hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      +1h
                    </button>
                  </>
                )}
                {entry.endAt && (
                  <button
                    type="button"
                    onClick={() => onUpdate({ endAt: null })}
                    className="text-[11px] hover:underline"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <input
              type="time"
              value={toTimeInputValue(entry.endAt)}
              onChange={(e) => {
                if (!e.target.value) {
                  onUpdate({ endAt: null });
                  return;
                }
                const targetDate = entry.endAt ? toLocalDateKey(entry.endAt) : activeDateKey;
                const iso = combineLocalDateAndTime(targetDate, e.target.value);
                if (iso) onUpdate({ endAt: iso });
              }}
              aria-label="Ends time"
              className="w-full h-9 px-2.5 rounded-lg border text-xs font-mono tabular-nums outline-none"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        )}

        {/* Completed Time */}
        {showCompletedRow && (
          <div
            className="p-2.5 rounded-xl border space-y-1.5"
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <label
                className="flex items-center gap-1.5 text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Check
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: entry.completedAt ? 'var(--success)' : 'var(--text-muted)' }}
                />
                <span>Completed</span>
              </label>
              <div className="flex items-center gap-2">
                {!entry.completedAt ? (
                  <button
                    type="button"
                    onClick={() => {
                      const nowTime = toTimeInputValue(new Date().toISOString());
                      const iso = combineLocalDateAndTime(activeDateKey, nowTime);
                      onUpdate({
                        completed: true,
                        completedAt: iso || new Date().toISOString(),
                      });
                    }}
                    className="text-[11px] font-medium hover:underline"
                    style={{ color: 'var(--success)' }}
                  >
                    Set now
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onUpdate({ completed: false, completedAt: null })}
                    className="text-[11px] hover:underline"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <input
              type="time"
              value={toTimeInputValue(entry.completedAt)}
              onChange={(e) => {
                if (!e.target.value) {
                  onUpdate({ completed: false, completedAt: null });
                  return;
                }
                const targetDate = entry.completedAt ? toLocalDateKey(entry.completedAt) : activeDateKey;
                const iso = combineLocalDateAndTime(targetDate, e.target.value);
                onUpdate({ completedAt: iso, completed: Boolean(iso) });
              }}
              aria-label="Completed time"
              className="w-full h-9 px-2.5 rounded-lg border text-xs font-mono tabular-nums outline-none"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        )}
      </div>

      {/* Quiet Live Summary Line */}
      <div
        className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono tabular-nums"
        style={{ color: 'var(--text-muted)' }}
      >
        <span className="inline-flex items-center gap-1">
          <Inbox className="w-3 h-3" />
          <span>{formatTime(entry.createdAt, timeFormat)}</span>
        </span>
        {entry.scheduledAt && (
          <>
            <span aria-hidden="true">•</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>
                {formatTime(entry.scheduledAt, timeFormat)}
                {entry.endAt ? `–${formatTime(entry.endAt, timeFormat)}` : ''}
              </span>
            </span>
          </>
        )}
        {entry.completedAt && (
          <>
            <span aria-hidden="true">•</span>
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--success)' }}>
              <Check className="w-3 h-3" />
              <span>{formatTime(entry.completedAt, timeFormat)}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
};
