import {Plus, StickyNote, Trash2, X} from 'lucide-react';
import React, {useMemo, useState} from 'react';
import {formatShortDate, HIGHLIGHT_COLORS} from '../../lib/formatters';
import type {BookFormat, HighlightColor, HighlightRecord} from '../../types/library';

interface StudyPaneProps {
  isOpen: boolean;
  topOverlayActive: boolean;
  bottomOverlayActive: boolean;
  format: BookFormat;
  currentUnitIndex: number;
  currentUnitLabel: string;
  highlights: HighlightRecord[];
  focusedHighlightId: string | null;
  onJumpToUnit: (unitIndex: number) => void;
  onCreateStandaloneNote: (noteText: string, color: HighlightColor) => void;
  onUpdateHighlight: (updated: HighlightRecord) => void;
  onDeleteHighlight: (id: string) => void;
  onClose: () => void;
}

type StudyFilter = 'all' | 'notes' | HighlightColor;

export const StudyPane: React.FC<StudyPaneProps> = ({
  isOpen,
  topOverlayActive,
  bottomOverlayActive,
  format,
  currentUnitIndex,
  currentUnitLabel,
  highlights,
  focusedHighlightId,
  onJumpToUnit,
  onCreateStandaloneNote,
  onUpdateHighlight,
  onDeleteHighlight,
  onClose,
}) => {
  const [filter, setFilter] = useState<StudyFilter>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteColor, setNewNoteColor] = useState<HighlightColor>('amber');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const filteredItems = useMemo(() => {
    return highlights.filter((item) => {
      if (filter === 'all') return true;
      if (filter === 'notes') return item.note.trim().length > 0;
      return item.color === filter;
    });
  }, [highlights, filter]);

  if (!isOpen) return null;

  const getColorSwatch = (color: HighlightColor) =>
    HIGHLIGHT_COLORS.find((c) => c.id === color)?.swatch ?? '#D99B2B';

  const handleSaveNewNote = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newNoteText.trim();
    if (!trimmed) return;
    onCreateStandaloneNote(trimmed, newNoteColor);
    setNewNoteText('');
    setComposerOpen(false);
  };

  const paneContent = (
    <>
      {/* Pane Header */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <StickyNote className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <h2 className="font-serif-editorial text-sm font-semibold text-[var(--text-primary)] truncate">
            Study Notes &amp; Highlights
          </h2>
          <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] shrink-0">
            {highlights.length}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setComposerOpen((v) => !v)}
            title="Add a note for this chapter or page"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Note</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close study pane"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="px-4 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0 bg-[var(--bg-canvas)]/45">
        <div className="flex items-center gap-1">
          {(
            [
              {id: 'all', label: 'All'},
              {id: 'notes', label: 'With Notes'},
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                filter === f.id
                  ? 'bg-[var(--bg-accent-subtle)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {HIGHLIGHT_COLORS.map((c) => {
            const active = filter === c.id;
            return (
              <button
                key={c.id}
                type="button"
                title={`Filter ${c.label}`}
                aria-label={`Filter by ${c.label}`}
                onClick={() => setFilter(active ? 'all' : c.id)}
                className={`w-3.5 h-3.5 rounded-full cursor-pointer transition-transform ${
                  active
                    ? 'scale-115 ring-2 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--bg-surface)]'
                    : 'opacity-65 hover:opacity-100'
                }`}
                style={{backgroundColor: c.swatch}}
              />
            );
          })}
        </div>
      </div>

      {/* Inline Standalone Chapter/Page Note Composer */}
      {composerOpen && (
        <form
          onSubmit={handleSaveNewNote}
          className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-2.5 shrink-0"
        >
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span className="truncate">
              Note for {format === 'pdf' ? `Page ${currentUnitIndex}` : currentUnitLabel}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setNewNoteColor(c.id)}
                  aria-label={`Note color ${c.label}`}
                  className={`w-3.5 h-3.5 rounded-full cursor-pointer ${
                    newNoteColor === c.id
                      ? 'ring-2 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--bg-elevated)]'
                      : 'opacity-65'
                  }`}
                  style={{backgroundColor: c.swatch}}
                />
              ))}
            </div>
          </div>

          <textarea
            rows={3}
            autoFocus
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            placeholder="Capture a reflection, summary, or question while reading..."
            className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-y"
          />

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setComposerOpen(false);
                setNewNoteText('');
              }}
              className="px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 text-xs font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] cursor-pointer"
            >
              Save Note
            </button>
          </div>
        </form>
      )}

      {/* Scrollable Highlights & Notes List */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {filteredItems.length === 0 ? (
          <div className="py-14 text-center space-y-2">
            <p className="text-xs font-medium text-[var(--text-secondary)]">
              {highlights.length === 0
                ? 'Your study margin is empty'
                : 'No notes match this filter'}
            </p>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed max-w-[240px] mx-auto">
              Select any passage on the left to highlight it, or click Note above to write directly
              alongside the text.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {filteredItems.map((hl) => {
              const isFocused = focusedHighlightId === hl.id;
              const isCurrentSection = hl.unitIndex === currentUnitIndex;
              const isEditing = editingId === hl.id;

              return (
                <div
                  key={hl.id}
                  className={`py-3.5 first:pt-1 space-y-2 ${
                    isFocused ? 'bg-[var(--bg-accent-subtle)] -mx-2 px-2 rounded-md' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onJumpToUnit(hl.unitIndex)}
                      className="inline-flex items-center gap-2 text-[11px] font-mono-tabular text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{backgroundColor: getColorSwatch(hl.color)}}
                      />
                      <span className={isCurrentSection ? 'text-[var(--accent)] font-medium' : ''}>
                        {format === 'pdf' ? `Page ${hl.unitIndex}` : `Section ${hl.unitIndex + 1}`}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatShortDate(hl.createdAt)}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {HIGHLIGHT_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onUpdateHighlight({...hl, color: c.id})}
                          aria-label={`Set ${c.label}`}
                          className={`w-3 h-3 rounded-full cursor-pointer ${
                            hl.color === c.id
                              ? 'ring-1 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--bg-surface)]'
                              : 'opacity-50 hover:opacity-100'
                          }`}
                          style={{backgroundColor: c.swatch}}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => onDeleteHighlight(hl.id)}
                        aria-label="Delete item"
                        className="ml-1 p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {hl.selectedText && (
                    <button
                      type="button"
                      onClick={() => onJumpToUnit(hl.unitIndex)}
                      className="block w-full text-left font-serif-editorial text-[13px] leading-relaxed text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer"
                    >
                      &ldquo;{hl.selectedText}&rdquo;
                    </button>
                  )}

                  {isEditing ? (
                    <div className="space-y-2 pt-0.5">
                      <textarea
                        rows={3}
                        autoFocus
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        placeholder="Write your note..."
                        className="w-full px-2.5 py-2 text-xs rounded border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)]"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-2 py-1 text-xs text-[var(--text-secondary)] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateHighlight({...hl, note: editDraft.trim()});
                            setEditingId(null);
                          }}
                          className="px-2.5 py-1 text-xs font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : hl.note ? (
                    <div className="space-y-1">
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                        {hl.note}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(hl.id);
                          setEditDraft(hl.note);
                        }}
                        className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
                      >
                        Edit note
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(hl.id);
                        setEditDraft('');
                      }}
                      className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] underline underline-offset-2 cursor-pointer"
                    >
                      + Add note
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Docked Split Study Pane (lg+) — unchanged */}
      <aside
        aria-label="Side-by-side notes and highlights study pane"
        className={`hidden lg:flex lg:w-[348px] xl:w-[372px] h-full border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] flex-col shrink-0 transition-[padding] duration-180 ${
          topOverlayActive ? 'lg:pt-[84px]' : 'lg:pt-0'
        } ${bottomOverlayActive ? 'lg:pb-[52px]' : 'lg:pb-0'}`}
      >
        {paneContent}
      </aside>

      {/* Mobile Slide-Up Study Notes Bottom Sheet (<lg) */}
      <div
        className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      >
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Study notes and highlights"
          onClick={(e) => e.stopPropagation()}
          className="w-full h-[84dvh] max-h-[84dvh] rounded-t-2xl border-t border-x border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl flex flex-col overflow-hidden pb-safe animate-folio-sheet-up"
        >
          <div className="pt-2.5 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1 rounded-full bg-[var(--border-strong)]" />
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{paneContent}</div>
        </aside>
      </div>
    </>
  );
};
