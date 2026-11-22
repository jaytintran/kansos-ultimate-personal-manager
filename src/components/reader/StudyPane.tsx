import {
  BookOpen,
  FileText,
  MapPin,
  Maximize2,
  Plus,
  RefreshCw,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { formatShortDate, HIGHLIGHT_COLORS } from "../../lib/formatters";
import type { BookNoteLink, Entry } from "../../types";
import type {
  BookFormat,
  BookRecord,
  HighlightColor,
  HighlightRecord,
} from "../../types/library";
import { stripHtmlToText } from "../../utils/noteMarkdown";
import { RichContent } from "../RichContent";
import { TiptapEditor } from "../TiptapEditor";

interface StudyPaneProps {
  isOpen: boolean;
  topOverlayActive: boolean;
  bottomOverlayActive: boolean;
  book: BookRecord;
  format: BookFormat;
  currentUnitIndex: number;
  currentScrollRatio: number;
  currentUnitLabel: string;
  currentLocationBadge: string;
  highlights: HighlightRecord[];
  bookNotes: Entry[];
  focusedHighlightId: string | null;
  onJumpToUnit: (unitIndex: number, scrollRatio?: number) => void;
  onCreateBookNote: (payload: {
    title: string;
    content: string;
    bookLink: BookNoteLink;
  }) => Entry | null;
  onDeleteBookNote: (noteId: string) => void;
  onExpandNoteToDetail: (noteId: string) => void;
  onUpdateHighlight: (updated: HighlightRecord) => void;
  onDeleteHighlight: (id: string) => void;
  onSendToNotes?: (
    excerptText: string,
    locationLabel: string,
    unitIndex?: number,
  ) => void;
  onClose: () => void;
}

type StudyPaneTab = "notes" | "highlights";
type StudyFilter = "all" | "notes" | HighlightColor;

export const StudyPane: React.FC<StudyPaneProps> = ({
  isOpen,
  topOverlayActive,
  bottomOverlayActive,
  book,
  format,
  currentUnitIndex,
  currentScrollRatio,
  currentLocationBadge,
  highlights,
  bookNotes,
  focusedHighlightId,
  onJumpToUnit,
  onCreateBookNote,
  onDeleteBookNote,
  onExpandNoteToDetail,
  onUpdateHighlight,
  onDeleteHighlight,
  onSendToNotes,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<StudyPaneTab>("notes");
  const [filter, setFilter] = useState<StudyFilter>("all");

  // Rich Markdown note composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftNonce, setDraftNonce] = useState(0);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [capturedPosition, setCapturedPosition] = useState<{
    unitIndex: number;
    scrollRatio: number;
    locationLabel: string;
  }>({
    unitIndex: currentUnitIndex,
    scrollRatio: currentScrollRatio,
    locationLabel: currentLocationBadge,
  });

  // Legacy highlight note editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // Auto-switch to Highlights if user clicks a highlight inside the book
  useEffect(() => {
    if (focusedHighlightId) {
      setActiveTab("highlights");
    }
  }, [focusedHighlightId]);

  const sortedBookNotes = useMemo(() => {
    return [...bookNotes].sort((a, b) => {
      const ta = new Date(a.updatedAt || a.createdAt).getTime();
      const tb = new Date(b.updatedAt || b.createdAt).getTime();
      return tb - ta;
    });
  }, [bookNotes]);

  const filteredHighlights = useMemo(() => {
    return highlights.filter((item) => {
      if (filter === "all") return true;
      if (filter === "notes") return item.note.trim().length > 0;
      return item.color === filter;
    });
  }, [highlights, filter]);

  if (!isOpen) return null;

  const getColorSwatch = (color: HighlightColor) =>
    HIGHLIGHT_COLORS.find((c) => c.id === color)?.swatch ?? "#D99B2B";

  const captureCurrentPosition = () => ({
    unitIndex: currentUnitIndex,
    scrollRatio: Math.min(
      1,
      Math.max(0, Number(currentScrollRatio.toFixed(4)) || 0),
    ),
    locationLabel: currentLocationBadge,
  });

  const handleOpenComposer = () => {
    setActiveTab("notes");
    if (!composerOpen) {
      setCapturedPosition(captureCurrentPosition());
      setComposerOpen(true);
    } else {
      setComposerOpen(false);
    }
  };

  const buildBookLinkForDraft = (): BookNoteLink => ({
    bookId: book.id,
    bookTitle: book.title,
    bookAuthor: book.author,
    bookFormat: book.format,
    unitIndex: capturedPosition.unitIndex,
    scrollRatio: capturedPosition.scrollRatio,
    locationLabel: capturedPosition.locationLabel,
    bookRemoved: false,
  });

  const hasDraftBody =
    stripHtmlToText(draftContent).length > 0 || draftContent.includes("<table");

  const handleSaveNewNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTitle.trim() && !hasDraftBody) return;
    const title =
      draftTitle.trim() || `${book.title} — ${capturedPosition.locationLabel}`;
    onCreateBookNote({
      title,
      content: draftContent,
      bookLink: buildBookLinkForDraft(),
    });
    setDraftTitle("");
    setDraftContent("");
    setDraftNonce((n) => n + 1);
    setComposerOpen(false);
  };

  const handleExpandDraftToDetail = () => {
    const title =
      draftTitle.trim() || `${book.title} — ${capturedPosition.locationLabel}`;
    const created = onCreateBookNote({
      title,
      content: draftContent,
      bookLink: buildBookLinkForDraft(),
    });
    setDraftTitle("");
    setDraftContent("");
    setDraftNonce((n) => n + 1);
    setComposerOpen(false);
    if (created) {
      onExpandNoteToDetail(created.id);
    }
  };

  const totalCount = bookNotes.length + highlights.length;

  const paneContent = (
    <>
      {/* Pane Header */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <StickyNote className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <h2 className="font-serif-editorial text-sm font-semibold text-[var(--text-primary)] truncate">
            Study Studio
          </h2>
          <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] shrink-0">
            {totalCount}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleOpenComposer}
            title="Write a rich Markdown note linked to this page or chapter"
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

      {/* Segmented Notes / Highlights Switcher */}
      <div className="px-4 py-2 border-b border-[var(--border-subtle)] flex items-center gap-1.5 shrink-0 bg-[var(--bg-canvas)]/45">
        <button
          type="button"
          onClick={() => setActiveTab("notes")}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "notes"
              ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Notes</span>
          <span className="font-mono-tabular text-[11px] opacity-75">
            {bookNotes.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("highlights")}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "highlights"
              ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Highlights</span>
          <span className="font-mono-tabular text-[11px] opacity-75">
            {highlights.length}
          </span>
        </button>
      </div>

      {activeTab === "notes" ? (
        <>
          {/* Inline Rich Markdown Composer */}
          {composerOpen && (
            <form
              onSubmit={handleSaveNewNote}
              className="p-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-2.5 shrink-0"
            >
              <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                  <MapPin className="w-3 h-3 text-[var(--accent)] shrink-0" />
                  <span className="truncate font-mono-tabular">
                    {capturedPosition.locationLabel}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setCapturedPosition(captureCurrentPosition())}
                  title="Update captured reading position to current page"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Current pos</span>
                </button>
              </div>

              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Note title..."
                aria-label="Book note title"
                className="w-full px-2.5 py-1.5 text-xs font-medium rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />

              <div className="max-h-[240px] overflow-y-auto text-xs">
                <TiptapEditor
                  docId={`study-draft-${book.id}-${draftNonce}`}
                  content={draftContent}
                  onChange={setDraftContent}
                  placeholder="Write Markdown notes, checklists, or type /table..."
                  variant="default"
                  minHeight={116}
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={handleExpandDraftToDetail}
                  title="Open this draft in the full Note DetailSheet"
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>Expand</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setComposerOpen(false);
                      setDraftTitle("");
                      setDraftContent("");
                    }}
                    className="px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!draftTitle.trim() && !hasDraftBody}
                    className="px-3 py-1 text-xs font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-45 cursor-pointer whitespace-nowrap"
                  >
                    Save Note
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Book-Linked Notes List */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {sortedBookNotes.length === 0 ? (
              <div className="py-14 text-center space-y-2">
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  No notes linked to this book yet
                </p>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed max-w-[245px] mx-auto">
                  Click{" "}
                  <span className="font-medium text-[var(--text-primary)]">
                    + Note
                  </span>{" "}
                  above to write rich Markdown notes or tables anchored to this
                  exact page. They will also appear in Kanso Notes.
                </p>
                {!composerOpen && (
                  <button
                    type="button"
                    onClick={handleOpenComposer}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Write First Note</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {sortedBookNotes.map((note) => {
                  const link = note.bookLink;
                  const isCurrentSection =
                    link !== null &&
                    link !== undefined &&
                    link.unitIndex === currentUnitIndex;

                  return (
                    <article
                      key={note.id}
                      className="py-3.5 first:pt-1 space-y-2"
                    >
                      {/* Location & Actions Row */}
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (link) {
                              onJumpToUnit(
                                link.unitIndex,
                                link.scrollRatio ?? 0,
                              );
                            }
                          }}
                          title="Jump to where this note was taken"
                          className="inline-flex items-center gap-1.5 min-w-0 text-[11px] font-mono-tabular text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"
                        >
                          <MapPin
                            className={`w-3 h-3 shrink-0 ${
                              isCurrentSection ? "text-[var(--accent)]" : ""
                            }`}
                          />
                          <span
                            className={`truncate ${
                              isCurrentSection
                                ? "text-[var(--accent)] font-medium"
                                : ""
                            }`}
                          >
                            {link?.locationLabel || "Linked Book Note"}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="shrink-0">
                            {formatShortDate(
                              new Date(
                                note.updatedAt || note.createdAt,
                              ).getTime(),
                            )}
                          </span>
                        </button>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onExpandNoteToDetail(note.id)}
                            title="Open note in DetailSheet"
                            aria-label="Expand note in DetailSheet"
                            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteBookNote(note.id)}
                            title="Delete note"
                            aria-label="Delete book note"
                            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Note Title */}
                      <button
                        type="button"
                        onClick={() => onExpandNoteToDetail(note.id)}
                        className="block w-full text-left font-serif-editorial text-[13.5px] font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors cursor-pointer leading-snug"
                      >
                        {note.title || "Untitled Note"}
                      </button>

                      {/* Rich Markdown Content Preview */}
                      {note.content && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => onExpandNoteToDetail(note.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onExpandNoteToDetail(note.id);
                            }
                          }}
                          className="cursor-pointer rounded-md p-2 -mx-2 hover:bg-[var(--bg-surface-hover)]/65 transition-colors"
                        >
                          <RichContent
                            html={note.content}
                            className="text-xs leading-relaxed text-[var(--text-secondary)] line-clamp-5"
                            fade
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Highlights Filter Row */}
          <div className="px-4 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0 bg-[var(--bg-canvas)]/45">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "notes", label: "With Notes" },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    filter === f.id
                      ? "bg-[var(--bg-accent-subtle)] text-[var(--accent)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
                    onClick={() => setFilter(active ? "all" : c.id)}
                    className={`w-3.5 h-3.5 rounded-full cursor-pointer transition-transform ${
                      active
                        ? "scale-115 ring-2 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--bg-surface)]"
                        : "opacity-65 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: c.swatch }}
                  />
                );
              })}
            </div>
          </div>

          {/* Scrollable Highlights List */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {filteredHighlights.length === 0 ? (
              <div className="py-14 text-center space-y-2">
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  {highlights.length === 0
                    ? "No highlights saved yet"
                    : "No highlights match this filter"}
                </p>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed max-w-[240px] mx-auto">
                  Select any passage on the left to highlight it, or switch to
                  the Notes tab to write rich Markdown study notes.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {filteredHighlights.map((hl) => {
                  const isFocused = focusedHighlightId === hl.id;
                  const isCurrentSection = hl.unitIndex === currentUnitIndex;
                  const isEditing = editingId === hl.id;

                  return (
                    <div
                      key={hl.id}
                      className={`py-3.5 first:pt-1 space-y-2 ${
                        isFocused
                          ? "bg-[var(--bg-accent-subtle)] -mx-2 px-2 rounded-md"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onJumpToUnit(hl.unitIndex, 0)}
                          className="inline-flex items-center gap-2 text-[11px] font-mono-tabular text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: getColorSwatch(hl.color),
                            }}
                          />
                          <span
                            className={
                              isCurrentSection
                                ? "text-[var(--accent)] font-medium"
                                : ""
                            }
                          >
                            {format === "pdf"
                              ? `Page ${hl.unitIndex}`
                              : `Section ${hl.unitIndex + 1}`}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatShortDate(hl.createdAt)}</span>
                        </button>

                        <div className="flex items-center gap-1">
                          {HIGHLIGHT_COLORS.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() =>
                                onUpdateHighlight({ ...hl, color: c.id })
                              }
                              aria-label={`Set ${c.label}`}
                              className={`w-3 h-3 rounded-full cursor-pointer ${
                                hl.color === c.id
                                  ? "ring-1 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--bg-surface)]"
                                  : "opacity-50 hover:opacity-100"
                              }`}
                              style={{ backgroundColor: c.swatch }}
                            />
                          ))}
                          {onSendToNotes && (
                            <button
                              type="button"
                              onClick={() => {
                                const loc =
                                  format === "pdf"
                                    ? `Page ${hl.unitIndex}`
                                    : `Section ${hl.unitIndex + 1}`;
                                const body = [
                                  hl.selectedText,
                                  hl.note.trim()
                                    ? `Note: ${hl.note.trim()}`
                                    : "",
                                ]
                                  .filter(Boolean)
                                  .join("\n\n");
                                if (body)
                                  onSendToNotes(body, loc, hl.unitIndex);
                              }}
                              title="Send to Kanso Notes"
                              aria-label="Send to Kanso Notes"
                              className="ml-1 p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteHighlight(hl.id)}
                            aria-label="Delete highlight"
                            className="ml-0.5 p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {hl.selectedText && (
                        <button
                          type="button"
                          onClick={() => onJumpToUnit(hl.unitIndex, 0)}
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
                                onUpdateHighlight({
                                  ...hl,
                                  note: editDraft.trim(),
                                });
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
                            setEditDraft("");
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
      )}
    </>
  );

  return (
    <>
      {/* Desktop Docked Split Study Pane (lg+) */}
      <aside
        aria-label="Side-by-side notes and highlights study pane"
        className={`hidden lg:flex lg:w-[368px] xl:w-[396px] h-full border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] flex-col shrink-0 transition-[padding] duration-180 ${
          topOverlayActive ? "lg:pt-[84px]" : "lg:pt-0"
        } ${bottomOverlayActive ? "lg:pb-[52px]" : "lg:pb-0"}`}
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
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {paneContent}
          </div>
        </aside>
      </div>
    </>
  );
};
