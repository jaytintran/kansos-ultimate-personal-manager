import React, { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  Copy,
  Download,
  FilePlus2,
  GitBranch,
  ImagePlus,
  Link2,
  Maximize2,
  Menu,
  Minimize2,
  MoreHorizontal,
  PanelLeftOpen,
  Plus,
  Smile,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  Entry,
  NoteEditorFont,
  NoteEditorWidth,
  NoteNotebook,
  NoteStatus,
} from "../../types";
import { formatShortDate, formatTime } from "../../utils/date";
import {
  computeNoteBacklinks,
  countWords,
  downloadNoteAsMarkdown,
  noteToMarkdown,
} from "../../utils/noteMarkdown";
import {
  NOTE_COVER_PRESETS,
  NOTE_ICON_PRESETS,
  NOTE_STATUS_OPTIONS,
  resolveCoverStyle,
} from "../../utils/noteTemplates";
import { EntryScheduleEditor } from "../EntryScheduleEditor";
import { NotionBlockEditor } from "./NotionBlockEditor";

interface NotesPageEditorProps {
  note: Entry;
  allNotes: Entry[];
  notebooks: NoteNotebook[];
  timeFormat: "12h" | "24h";
  sidebarCollapsed: boolean;
  onExpandSidebar: () => void;
  onOpenMobileTree: () => void;
  onBackToHome: () => void;
  onOpenNote: (noteId: string, title?: string) => void;
  onCreateLinkedNote: (title: string) => Entry;
  onCreateSubpage: (parentId: string, notebookId?: string | null) => void;
  onUpdateNote: (id: string, patch: Partial<Entry>) => void;
  onDuplicateNote: (id: string) => void;
  onArchiveNote: (id: string, archived: boolean) => void;
  onTrashNote: (id: string) => void;
  onNotify: (msg: string, tone?: "neutral" | "success" | "error") => void;
}

export const NotesPageEditor: React.FC<NotesPageEditorProps> = ({
  note,
  allNotes,
  notebooks,
  timeFormat,
  sidebarCollapsed,
  onExpandSidebar,
  onOpenMobileTree,
  onBackToHome,
  onOpenNote,
  onCreateLinkedNote,
  onCreateSubpage,
  onUpdateNote,
  onDuplicateNote,
  onArchiveNote,
  onTrashNote,
  onNotify,
}) => {
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [customCoverUrl, setCustomCoverUrl] = useState("");
  const [timelinePopoverOpen, setTimelinePopoverOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [propertiesExpanded, setPropertiesExpanded] = useState(true);
  const [backlinksExpanded, setBacklinksExpanded] = useState(true);
  const [tagDraft, setTagDraft] = useState("");
  const [copiedMd, setCopiedMd] = useState(false);

  const activeNotes = allNotes;

  const noteMap = useMemo(
    () => new Map(activeNotes.map((n) => [n.id, n])),
    [activeNotes],
  );

  const notebook = useMemo(
    () => notebooks.find((nb) => nb.id === note.notebookId) || null,
    [notebooks, note.notebookId],
  );

  // Ancestor breadcrumb chain (with cycle guard)
  const ancestors = useMemo(() => {
    const chain: Entry[] = [];
    const seen = new Set<string>([note.id]);
    let cursor = note.parentId ? noteMap.get(note.parentId) : undefined;
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      chain.unshift(cursor);
      cursor = cursor.parentId ? noteMap.get(cursor.parentId) : undefined;
    }
    return chain;
  }, [note.id, note.parentId, noteMap]);

  // Direct child subpages
  const childPages = useMemo(
    () =>
      activeNotes.filter(
        (n) =>
          n.parentId === note.id && !n.archived && n.noteStatus !== "archived",
      ),
    [activeNotes, note.id],
  );

  // Valid parent candidates (exclude self and descendants to prevent cycles)
  const validParentCandidates = useMemo(() => {
    const descendants = new Set<string>([note.id]);
    let added = true;
    while (added) {
      added = false;
      for (const n of activeNotes) {
        if (
          n.parentId &&
          descendants.has(n.parentId) &&
          !descendants.has(n.id)
        ) {
          descendants.add(n.id);
          added = true;
        }
      }
    }
    return activeNotes.filter((n) => !descendants.has(n.id) && !n.archived);
  }, [activeNotes, note.id]);

  // Incoming backlinks
  const backlinks = useMemo(
    () => computeNoteBacklinks(note, activeNotes),
    [note, activeNotes],
  );

  const wordCount = useMemo(() => countWords(note.content), [note.content]);
  const coverStyle = resolveCoverStyle(note.coverPreset);
  const editorWidth: NoteEditorWidth = note.editorWidth || "normal";
  const editorFont: NoteEditorFont = note.editorFont || "sans";
  const isArchived = Boolean(note.archived) || note.noteStatus === "archived";
  const isTimelineSynced =
    note.syncToTimeline !== false &&
    (Boolean(note.syncToTimeline) || Boolean(note.scheduledAt));

  const handleCopyMarkdown = async () => {
    try {
      const md = noteToMarkdown(note, {
        includeFrontmatter: true,
        notebookName: notebook?.name,
      });
      await navigator.clipboard.writeText(md);
      setCopiedMd(true);
      onNotify("Copied clean Markdown to clipboard", "success");
      window.setTimeout(() => setCopiedMd(false), 1800);
    } catch {
      onNotify("Clipboard access blocked — use Export .md instead", "error");
    }
  };

  const handleExportMarkdown = () => {
    downloadNoteAsMarkdown(note, notebook?.name);
    onNotify("Exported Markdown file (.md)", "success");
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tagDraft.trim().toLowerCase().replace(/^#/, "");
    if (!clean) return;
    if (!note.tags.includes(clean)) {
      onUpdateNote(note.id, { tags: [...note.tags, clean] });
    }
    setTagDraft("");
  };

  return (
    <div className="flex-1 h-full overflow-y-auto">
      {/* Top Sticky Editorial Utility Bar */}
      <div
        className="sticky top-0 z-20 px-3 sm:px-6 py-2.5 border-b backdrop-blur-md flex items-center justify-between gap-2"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--bg-canvas) 92%, transparent)",
          borderColor: "var(--border-subtle)",
        }}
      >
        {/* Left Navigation & Breadcrumbs */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenMobileTree}
            className="lg:hidden h-8 w-8 rounded-lg border flex items-center justify-center shrink-0"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
            aria-label="Open notebooks drawer"
          >
            <Menu className="w-4 h-4" />
          </button>

          {sidebarCollapsed && (
            <button
              type="button"
              onClick={onExpandSidebar}
              className="hidden lg:flex h-8 w-8 rounded-lg border items-center justify-center shrink-0 hover:bg-[var(--bg-surface-subtle)]"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
              title="Expand sidebar"
              aria-label="Expand notes sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onBackToHome}
            className="h-8 px-2 rounded-lg text-xs font-medium inline-flex items-center gap-1 shrink-0 transition-colors hover:bg-[var(--bg-surface-subtle)]"
            style={{ color: "var(--text-secondary)" }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">All Notes</span>
          </button>

          {notebook && (
            <>
              <span
                className="text-xs hidden md:inline"
                style={{ color: "var(--text-muted)" }}
              >
                /
              </span>
              <span
                className="hidden md:inline text-xs font-medium truncate max-w-[120px]"
                style={{ color: "var(--text-secondary)" }}
              >
                {notebook.icon} {notebook.name}
              </span>
            </>
          )}

          {ancestors.map((anc) => (
            <React.Fragment key={anc.id}>
              <span
                className="text-xs hidden md:inline"
                style={{ color: "var(--text-muted)" }}
              >
                /
              </span>
              <button
                type="button"
                onClick={() => onOpenNote(anc.id)}
                className="hidden md:inline text-xs font-medium truncate max-w-[130px] hover:underline"
                style={{ color: "var(--text-secondary)" }}
              >
                {anc.icon || "📝"} {anc.title || "Untitled"}
              </button>
            </React.Fragment>
          ))}

          <span
            className="text-xs hidden sm:inline"
            style={{ color: "var(--text-muted)" }}
          >
            /
          </span>
          <span
            className="text-xs font-semibold truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {note.icon || "📝"} {note.title || "Untitled Note"}
          </span>
        </div>

        {/* Right Page Actions: Typography, Width, Timeline Sync, Markdown Export, Favorite, More */}
        <div className="flex items-center gap-1 shrink-0 relative">
          {/* Font Switcher */}
          <div
            className="hidden sm:inline-flex items-center rounded-lg border p-0.5"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
            role="group"
            aria-label="Page typography"
          >
            {(["sans", "serif", "mono"] as NoteEditorFont[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onUpdateNote(note.id, { editorFont: mode })}
                className="h-6 px-2 rounded-md text-[11px] font-medium capitalize transition-colors"
                style={{
                  backgroundColor:
                    editorFont === mode ? "var(--accent-soft)" : "transparent",
                  color:
                    editorFont === mode ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Width Toggle */}
          <button
            type="button"
            onClick={() =>
              onUpdateNote(note.id, {
                editorWidth: editorWidth === "full" ? "normal" : "full",
              })
            }
            title={
              editorWidth === "full"
                ? "Switch to Normal width"
                : "Switch to Full width"
            }
            aria-label="Toggle page width"
            className="hidden md:flex h-8 w-8 rounded-lg border items-center justify-center transition-colors hover:bg-[var(--bg-surface-subtle)]"
            style={{
              backgroundColor:
                editorWidth === "full"
                  ? "var(--accent-soft)"
                  : "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color:
                editorWidth === "full"
                  ? "var(--accent)"
                  : "var(--text-secondary)",
            }}
          >
            {editorWidth === "full" ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Timeline Sync Popover Toggle */}
          <button
            type="button"
            onClick={() => setTimelinePopoverOpen((v) => !v)}
            title="Timeline date sync settings"
            className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
            style={{
              backgroundColor: isTimelineSynced
                ? "var(--accent-soft)"
                : "var(--bg-surface)",
              borderColor: isTimelineSynced
                ? "var(--accent)"
                : "var(--border-subtle)",
              color: isTimelineSynced
                ? "var(--accent)"
                : "var(--text-secondary)",
            }}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">
              {isTimelineSynced ? "Timeline Synced" : "Timeline"}
            </span>
          </button>

          {/* Copy Clean Markdown */}
          <button
            type="button"
            onClick={() => void handleCopyMarkdown()}
            title="Copy clean Markdown"
            aria-label="Copy clean Markdown"
            className="h-8 w-8 rounded-lg border flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-subtle)]"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: copiedMd ? "var(--success)" : "var(--text-secondary)",
            }}
          >
            {copiedMd ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Export .md File */}
          <button
            type="button"
            onClick={handleExportMarkdown}
            title="Export as .md file"
            aria-label="Export note as Markdown file"
            className="h-8 w-8 rounded-lg border flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-subtle)]"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Favorite Toggle */}
          <button
            type="button"
            onClick={() => onUpdateNote(note.id, { favorite: !note.favorite })}
            title={note.favorite ? "Remove favorite" : "Add to favorites"}
            aria-label="Toggle favorite"
            className="h-8 w-8 rounded-lg border flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-subtle)]"
            style={{
              backgroundColor: note.favorite
                ? "var(--accent-soft)"
                : "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: note.favorite ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            <Star
              className={`w-3.5 h-3.5 ${note.favorite ? "fill-current" : ""}`}
            />
          </button>

          {/* More Page Menu */}
          <button
            type="button"
            onClick={() => setMoreMenuOpen((v) => !v)}
            title="Page options"
            aria-label="Page options"
            className="h-8 w-8 rounded-lg border flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-subtle)]"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {/* Timeline Sync Popover */}
          {timelinePopoverOpen && (
            <div
              className="absolute right-0 top-10 z-30 w-80 sm:w-96 rounded-2xl border p-4 space-y-3"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-strong)",
                boxShadow: "var(--shadow-popover)",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold">Timeline Spine Sync</div>
                  <div
                    className="text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Surface this page on Kanso’s chronological Timeline.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTimelinePopoverOpen(false)}
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Close Timeline sync settings"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <label
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl border cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <span className="text-xs font-medium">Show on Timeline</span>
                <input
                  type="checkbox"
                  checked={isTimelineSynced}
                  onChange={(e) =>
                    onUpdateNote(note.id, { syncToTimeline: e.target.checked })
                  }
                  className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                />
              </label>

              <EntryScheduleEditor
                entry={note}
                timeFormat={timeFormat}
                onUpdate={(patch) =>
                  onUpdateNote(note.id, {
                    ...patch,
                    syncToTimeline:
                      patch.scheduledAt !== undefined &&
                      patch.scheduledAt !== null
                        ? true
                        : note.syncToTimeline,
                  })
                }
                variant="note"
              />
            </div>
          )}

          {/* Page Options Dropdown */}
          {moreMenuOpen && (
            <div
              className="absolute right-0 top-10 z-30 w-52 rounded-xl border py-1.5 text-xs"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-strong)",
                boxShadow: "var(--shadow-popover)",
              }}
            >
              {/* Mobile-only font & width toggles */}
              <div
                className="sm:hidden px-3 py-1.5 border-b space-y-2"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span style={{ color: "var(--text-muted)" }}>Font</span>
                  <div className="flex gap-1">
                    {(["sans", "serif", "mono"] as NoteEditorFont[]).map(
                      (m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            onUpdateNote(note.id, { editorFont: m })
                          }
                          className="px-2 py-0.5 rounded capitalize"
                          style={{
                            backgroundColor:
                              editorFont === m
                                ? "var(--accent-soft)"
                                : "transparent",
                            color:
                              editorFont === m
                                ? "var(--accent)"
                                : "var(--text-secondary)",
                          }}
                        >
                          {m}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateNote(note.id, {
                      editorWidth: editorWidth === "full" ? "normal" : "full",
                    })
                  }
                  className="w-full flex items-center justify-between py-0.5"
                  style={{ color: "var(--text-primary)" }}
                >
                  <span className="flex items-center gap-1.5">
                    <Columns2 className="w-3.5 h-3.5" />
                    <span>Page Width</span>
                  </span>
                  <span
                    className="capitalize"
                    style={{ color: "var(--accent)" }}
                  >
                    {editorWidth}
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  onCreateSubpage(note.id, note.notebookId ?? null);
                  setMoreMenuOpen(false);
                }}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[var(--bg-surface-subtle)]"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                <span>Add nested subpage</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onDuplicateNote(note.id);
                  setMoreMenuOpen(false);
                }}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[var(--bg-surface-subtle)]"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicate page</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onArchiveNote(note.id, !isArchived);
                  setMoreMenuOpen(false);
                }}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[var(--bg-surface-subtle)]"
              >
                {isArchived ? (
                  <>
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    <span>Restore from Archive</span>
                  </>
                ) : (
                  <>
                    <Archive className="w-3.5 h-3.5" />
                    <span>Move to Archive</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  onTrashNote(note.id);
                  setMoreMenuOpen(false);
                }}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[var(--bg-surface-subtle)]"
                style={{ color: "var(--danger)" }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Page</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Subtle Cover Header Banner */}
      {coverStyle && (
        <div
          className="h-32 sm:h-40 w-full border-b relative group"
          style={{
            borderColor: "var(--border-subtle)",
            ...coverStyle,
          }}
        >
          <div className="max-w-5xl mx-auto h-full px-4 sm:px-8 flex items-end justify-end pb-3 gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => setCoverPickerOpen((v) => !v)}
              className="h-7 px-2.5 rounded-lg border text-xs font-medium backdrop-blur-md"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--bg-elevated) 88%, transparent)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            >
              Change cover
            </button>
            <button
              type="button"
              onClick={() => {
                onUpdateNote(note.id, { coverPreset: null });
                setCoverPickerOpen(false);
              }}
              className="h-7 px-2.5 rounded-lg border text-xs font-medium backdrop-blur-md"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--bg-elevated) 88%, transparent)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Main Centered Editorial Page Canvas */}
      <div
        className={`mx-auto px-4 sm:px-8 lg:pl-16 py-6 sm:py-8 space-y-6 transition-all ${
          editorWidth === "full" ? "max-w-6xl" : "max-w-3xl"
        }`}
      >
        {/* Page Header Controls (Icon + Cover Triggers + Title) */}
        <div className="space-y-3 relative">
          <div
            className="flex flex-wrap items-center gap-2 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <button
              type="button"
              onClick={() => setIconPickerOpen((v) => !v)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors hover:bg-[var(--bg-surface-subtle)]"
            >
              <Smile className="w-3.5 h-3.5" />
              <span>{note.icon ? "Change icon" : "Add icon"}</span>
            </button>
            {!coverStyle && (
              <button
                type="button"
                onClick={() => setCoverPickerOpen((v) => !v)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors hover:bg-[var(--bg-surface-subtle)]"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                <span>Add cover</span>
              </button>
            )}
            {isArchived && (
              <span
                className="font-mono text-[11px]"
                style={{ color: "var(--warning)" }}
              >
                · Archived
              </span>
            )}
          </div>

          {/* Icon Picker Popover */}
          {iconPickerOpen && (
            <div
              className="absolute left-0 top-8 z-30 w-72 rounded-2xl border p-3 space-y-2.5"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-strong)",
                boxShadow: "var(--shadow-popover)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Page Icon</span>
                <button
                  type="button"
                  onClick={() => setIconPickerOpen(false)}
                  aria-label="Close icon picker"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-8 gap-1">
                {NOTE_ICON_PRESETS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => {
                      onUpdateNote(note.id, { icon: ic });
                      setIconPickerOpen(false);
                    }}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-base hover:bg-[var(--bg-surface-subtle)]"
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cover Picker Popover */}
          {coverPickerOpen && (
            <div
              className="absolute left-0 top-8 z-30 w-80 rounded-2xl border p-3.5 space-y-3"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-strong)",
                boxShadow: "var(--shadow-popover)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Cover Banner</span>
                <button
                  type="button"
                  onClick={() => setCoverPickerOpen(false)}
                  aria-label="Close cover picker"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {NOTE_COVER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onUpdateNote(note.id, { coverPreset: preset.id });
                      setCoverPickerOpen(false);
                    }}
                    className="rounded-lg border overflow-hidden text-left hover:border-[var(--accent)]"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <div
                      className="h-10 w-full"
                      style={{ background: preset.background }}
                    />
                    <div className="px-1.5 py-1 text-[10px] font-medium truncate">
                      {preset.label}
                    </div>
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const clean = customCoverUrl.trim();
                  if (!clean) return;
                  onUpdateNote(note.id, { coverPreset: `url:${clean}` });
                  setCustomCoverUrl("");
                  setCoverPickerOpen(false);
                }}
                className="flex gap-1.5 pt-1 border-t"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <input
                  type="text"
                  value={customCoverUrl}
                  onChange={(e) => setCustomCoverUrl(e.target.value)}
                  placeholder="Or paste image URL..."
                  className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border text-xs outline-none"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                />
                <button
                  type="submit"
                  className="h-8 px-2.5 rounded-lg text-xs font-semibold"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  Apply
                </button>
              </form>
            </div>
          )}

          {/* Icon + Editorial Title */}
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setIconPickerOpen((v) => !v)}
              className="text-3xl sm:text-4xl leading-none pt-0.5 hover:scale-105 transition-transform shrink-0"
              title="Change page icon"
              aria-label="Change page icon"
            >
              {note.icon || "📝"}
            </button>
            <input
              type="text"
              value={note.title}
              onChange={(e) => onUpdateNote(note.id, { title: e.target.value })}
              placeholder="Untitled Note"
              className="w-full bg-transparent font-display text-2xl sm:text-3xl font-bold tracking-tight outline-none"
              style={{ color: "var(--text-primary)" }}
            />
          </div>
        </div>

        {/* Inline Properties Panel (Status, Notebook, Parent, Tags, Timeline, Stats) */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <button
            type="button"
            onClick={() => setPropertiesExpanded((v) => !v)}
            className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-semibold"
            style={{
              backgroundColor: "var(--bg-surface-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <span className="flex items-center gap-1.5">
              {propertiesExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              <span>Properties</span>
            </span>
            <span
              className="font-mono tabular-nums text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              {wordCount} words · updated{" "}
              {formatShortDate(note.updatedAt || note.createdAt)}{" "}
              {formatTime(note.updatedAt || note.createdAt, timeFormat)}
            </span>
          </button>

          {propertiesExpanded && (
            <div className="px-3.5 py-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
              {/* Status */}
              <div className="flex items-center gap-3 py-0.5">
                <span
                  className="w-20 shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  Status
                </span>
                <select
                  value={note.noteStatus ?? "draft"}
                  onChange={(e) => {
                    const nextStatus = e.target.value as NoteStatus;
                    onUpdateNote(note.id, {
                      noteStatus: nextStatus,
                      archived: nextStatus === "archived",
                    });
                  }}
                  aria-label="Note status"
                  className="flex-1 min-w-0 h-7 px-2 rounded-md border text-xs outline-none"
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                >
                  {NOTE_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notebook */}
              <div className="flex items-center gap-3 py-0.5">
                <span
                  className="w-20 shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  Notebook
                </span>
                <select
                  value={note.notebookId || ""}
                  onChange={(e) =>
                    onUpdateNote(note.id, {
                      notebookId: e.target.value || null,
                    })
                  }
                  aria-label="Note notebook"
                  className="flex-1 min-w-0 h-7 px-2 rounded-md border text-xs outline-none"
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="">No notebook</option>
                  {notebooks.map((nb) => (
                    <option key={nb.id} value={nb.id}>
                      {nb.icon} {nb.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Parent Page */}
              <div className="flex items-center gap-3 py-0.5">
                <span
                  className="w-20 shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  Parent Page
                </span>
                <select
                  value={note.parentId || ""}
                  onChange={(e) =>
                    onUpdateNote(note.id, { parentId: e.target.value || null })
                  }
                  aria-label="Parent page"
                  className="flex-1 min-w-0 h-7 px-2 rounded-md border text-xs outline-none"
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="">Top-level page</option>
                  {validParentCandidates.map((cand) => (
                    <option key={cand.id} value={cand.id}>
                      {cand.icon || "📝"} {cand.title || "Untitled Note"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Timeline Sync Summary */}
              <div className="flex items-center gap-3 py-0.5">
                <span
                  className="w-20 shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  Timeline
                </span>
                <button
                  type="button"
                  onClick={() => setTimelinePopoverOpen((v) => !v)}
                  className="flex-1 min-w-0 h-7 px-2 rounded-md border text-left text-xs truncate flex items-center justify-between"
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    borderColor: "var(--border-subtle)",
                    color: isTimelineSynced
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                  }}
                >
                  <span className="truncate">
                    {isTimelineSynced
                      ? note.scheduledAt
                        ? `Synced · ${formatShortDate(note.scheduledAt)} ${formatTime(
                            note.scheduledAt,
                            timeFormat,
                          )}`
                        : `Synced · ${formatShortDate(note.createdAt)}`
                      : "Not on Timeline (workspace only)"}
                  </span>
                  <Calendar className="w-3 h-3 shrink-0 ml-1" />
                </button>
              </div>

              {/* Tags */}
              <div
                className="sm:col-span-2 flex flex-wrap items-center gap-2 pt-1 border-t"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <span
                  className="w-20 shrink-0 flex items-center gap-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Tag className="w-3 h-3" />
                  <span>Tags</span>
                </span>
                <div className="flex-1 flex flex-wrap items-center gap-2">
                  {note.tags.map((tag, idx) => (
                    <React.Fragment key={tag}>
                      {idx > 0 && (
                        <span
                          aria-hidden="true"
                          style={{ color: "var(--text-muted)" }}
                        >
                          ·
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateNote(note.id, {
                            tags: note.tags.filter((t) => t !== tag),
                          })
                        }
                        className="inline-flex items-center gap-1 font-medium hover:underline"
                        style={{ color: "var(--accent)" }}
                        title="Remove tag"
                      >
                        <span>#{tag}</span>
                        <X className="w-3 h-3 opacity-70" />
                      </button>
                    </React.Fragment>
                  ))}
                  <form
                    onSubmit={handleAddTag}
                    className="inline-flex items-center gap-1"
                  >
                    <input
                      type="text"
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      placeholder="+ add tag"
                      className="w-24 bg-transparent text-xs outline-none px-1 py-0.5"
                      style={{ color: "var(--text-secondary)" }}
                    />
                    {tagDraft.trim() && (
                      <button
                        type="submit"
                        className="h-5 px-1.5 rounded text-[11px]"
                        style={{
                          backgroundColor: "var(--accent-soft)",
                          color: "var(--accent)",
                        }}
                      >
                        Add
                      </button>
                    )}
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Nested Subpages Strip */}
        <div
          className="rounded-xl border px-3.5 py-2.5 space-y-2"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-center justify-between">
            <span
              className="text-xs font-semibold flex items-center gap-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              <GitBranch
                className="w-3.5 h-3.5"
                style={{ color: "var(--accent)" }}
              />
              <span>Subpages ({childPages.length})</span>
            </span>
            <button
              type="button"
              onClick={() => onCreateSubpage(note.id, note.notebookId ?? null)}
              className="text-xs font-medium inline-flex items-center gap-1 hover:underline"
              style={{ color: "var(--accent)" }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add subpage</span>
            </button>
          </div>

          {childPages.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {childPages.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => onOpenNote(child.id)}
                  className="px-2.5 py-1.5 rounded-lg border text-left text-xs font-medium flex items-center gap-2 transition-colors hover:bg-[var(--bg-surface-subtle)]"
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                >
                  <span className="shrink-0">{child.icon || "📝"}</span>
                  <span className="truncate flex-1">
                    {child.title || "Untitled Note"}
                  </span>
                  <ChevronRight
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Full Notion-Style Block Editor */}
        <div className="min-h-[380px] pb-4">
          <NotionBlockEditor
            docId={note.id}
            content={note.content}
            onChange={(html) => onUpdateNote(note.id, { content: html })}
            fontMode={editorFont}
            allNotes={activeNotes}
            onOpenNote={onOpenNote}
            onCreateLinkedNote={onCreateLinkedNote}
          />
        </div>

        {/* Collapsible Backlinks Knowledge Graph Panel */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <button
            type="button"
            onClick={() => setBacklinksExpanded((v) => !v)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold"
            style={{
              backgroundColor: "var(--bg-surface-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <span className="flex items-center gap-1.5">
              {backlinksExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              <Link2
                className="w-3.5 h-3.5"
                style={{ color: "var(--accent)" }}
              />
              <span>Backlinks</span>
            </span>
            <span
              className="font-mono tabular-nums text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              {backlinks.length} incoming{" "}
              {backlinks.length === 1 ? "link" : "links"}
            </span>
          </button>

          {backlinksExpanded && (
            <div className="p-3 space-y-2">
              {backlinks.length === 0 ? (
                <p
                  className="text-xs py-2 text-center"
                  style={{ color: "var(--text-muted)" }}
                >
                  No other pages link to this note yet. Type{" "}
                  <code className="font-mono">[[{note.title || "Note"}]]</code>{" "}
                  anywhere to connect ideas.
                </p>
              ) : (
                backlinks.map(({ note: source, snippet }) => (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => onOpenNote(source.id)}
                    className="w-full text-left p-3 rounded-xl border transition-colors hover:border-[var(--accent)]"
                    style={{
                      backgroundColor: "var(--bg-canvas)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold flex items-center gap-1.5 truncate">
                        <span>{source.icon || "📝"}</span>
                        <span className="truncate">
                          {source.title || "Untitled Note"}
                        </span>
                      </span>
                      <span
                        className="text-[11px] font-mono tabular-nums shrink-0"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {formatShortDate(source.updatedAt || source.createdAt)}
                      </span>
                    </div>
                    {snippet && (
                      <p
                        className="mt-1 text-xs line-clamp-2 leading-relaxed"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {snippet}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
