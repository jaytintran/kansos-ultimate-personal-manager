import {
  ArrowUpRight,
  Check,
  FileText,
  Link2,
  Plus,
  Search,
  X,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkspace } from "../../context/WorkspaceContext";
import type { DetailSheetTarget, Entry, ListCollection, ListItem } from "../../types";
import { formatCompactDayHeading, toLocalDateKey } from "../../utils/date";
import {
  buildListItemNoteLink,
  getNotesLinkedToListItem,
} from "../../utils/listItemLinks";
import { NotePageIcon } from "../IconLibrary";

interface AttachNotesToListItemModalProps {
  open: boolean;
  item: ListItem;
  linkedNoteIds: Set<string>;
  notes: Entry[];
  onToggleNote: (note: Entry) => void;
  onClose: () => void;
}

const AttachNotesToListItemModal: React.FC<AttachNotesToListItemModalProps> = ({
  open,
  item,
  linkedNoteIds,
  notes,
  onToggleNote,
  onClose,
}) => {
  const [query, setQuery] = useState("");

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...notes].sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime(),
    );
    if (!q) return sorted;
    return sorted.filter(
      (n) =>
        (n.title || "").toLowerCase().includes(q) ||
        (n.content || "").toLowerCase().includes(q) ||
        (n.tags || []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [notes, query]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Attach notes to ${item.title}`}
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border overflow-hidden flex flex-col max-h-[75dvh]"
        style={{
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-strong)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <div
          className="px-4 py-3 border-b flex items-center justify-between gap-2"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="min-w-0">
            <h3 className="font-display text-sm font-bold truncate">
              Attach Notes
            </h3>
            <p
              className="text-[11px] truncate"
              style={{ color: "var(--text-muted)" }}
            >
              {item.title || "Untitled Item"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
            style={{ color: "var(--text-muted)" }}
            aria-label="Close attach notes modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="px-4 py-2.5 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div
            className="h-8 px-2.5 rounded-lg border flex items-center gap-2"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <Search
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes by title, content, or #tag..."
              autoFocus
              className="flex-1 min-w-0 bg-transparent text-xs outline-none"
              style={{ color: "var(--text-primary)" }}
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          {filteredNotes.length === 0 ? (
            <div
              className="py-8 text-center text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {notes.length === 0
                ? "No notes in your workspace yet."
                : "No matching notes found."}
            </div>
          ) : (
            filteredNotes.map((note) => {
              const attached = linkedNoteIds.has(note.id);
              const updatedDay = formatCompactDayHeading(
                toLocalDateKey(note.updatedAt || note.createdAt),
              );
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => onToggleNote(note)}
                  className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-left transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{
                    backgroundColor: attached
                      ? "var(--accent-soft)"
                      : "transparent",
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <NotePageIcon
                      icon={note.icon}
                      className="w-3.5 h-3.5 shrink-0"
                      style={{
                        color: attached
                          ? "var(--accent)"
                          : "var(--text-muted)",
                      }}
                    />
                    <div className="min-w-0">
                      <div
                        className="text-xs font-medium truncate"
                        style={{
                          color: attached
                            ? "var(--accent)"
                            : "var(--text-primary)",
                        }}
                      >
                        {note.title || "Untitled Note"}
                      </div>
                      <div
                        className="text-[11px] font-mono tabular-nums truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {updatedDay}
                        {note.tags.length > 0
                          ? ` · ${note.tags.slice(0, 3).map((t) => `#${t}`).join(" ")}`
                          : ""}
                      </div>
                    </div>
                  </div>
                  <span
                    className="h-5 w-5 rounded-md flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: attached
                        ? "var(--accent)"
                        : "var(--bg-surface)",
                      borderColor: attached
                        ? "var(--accent)"
                        : "var(--border-subtle)",
                      color: attached ? "var(--accent-fg)" : "transparent",
                    }}
                  >
                    <Check className="w-3 h-3" />
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface ListItemLinkedNotesSectionProps {
  item: ListItem;
  list: ListCollection | null;
  onBeforeJump?: () => void;
  onJumpToNote?: (noteId: string) => void;
  onOpenDetail?: (target: DetailSheetTarget) => void;
}

export const ListItemLinkedNotesSection: React.FC<
  ListItemLinkedNotesSectionProps
> = ({ item, list, onBeforeJump, onJumpToNote, onOpenDetail }) => {
  const {
    workspace,
    addNotePage,
    linkNoteToListItem,
    unlinkNoteFromListItem,
    pushToast,
  } = useWorkspace();
  const [attachOpen, setAttachOpen] = useState(false);

  const activeNotes = useMemo(
    () =>
      workspace.entries.filter((e) => e.type === "note" && !e.archived),
    [workspace.entries],
  );

  const linkedNotes = useMemo(
    () => getNotesLinkedToListItem(activeNotes, item.id, false),
    [activeNotes, item.id],
  );

  const linkedNoteIds = useMemo(
    () => new Set(linkedNotes.map((n) => n.id)),
    [linkedNotes],
  );

  const handleOpenNote = (noteId: string) => {
    onBeforeJump?.();
    if (onJumpToNote) {
      onJumpToNote(noteId);
    } else if (onOpenDetail) {
      onOpenDetail({ mode: "note", id: noteId });
    }
  };

  const handleCreateLinkedNote = () => {
    const link = buildListItemNoteLink(item, list);
    const created = addNotePage({
      title: "",
      content: "",
      noteStatus: "active",
      listItemLinks: [link],
    });
    pushToast(`Created note linked to "${item.title || "item"}"`, "success");
    handleOpenNote(created.id);
  };

  const handleToggleAttach = (note: Entry) => {
    if (linkedNoteIds.has(note.id)) {
      unlinkNoteFromListItem(note.id, item.id);
    } else {
      linkNoteToListItem(note.id, item.id);
    }
  };

  return (
    <section
      className="pt-3 border-t space-y-2.5"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileText
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: "var(--text-muted)" }}
          />
          <span
            className="text-xs font-semibold truncate"
            style={{ color: "var(--text-secondary)" }}
          >
            Linked Notes
          </span>
          <span
            className="text-[11px] font-mono tabular-nums"
            style={{ color: "var(--text-muted)" }}
          >
            {linkedNotes.length}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setAttachOpen(true)}
            className="h-7 px-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap shrink-0"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <Link2 className="w-3 h-3" />
            <span>Attach</span>
          </button>
          <button
            type="button"
            onClick={handleCreateLinkedNote}
            className="h-7 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Note</span>
          </button>
        </div>
      </div>

      {linkedNotes.length === 0 ? (
        <p className="text-xs py-1" style={{ color: "var(--text-muted)" }}>
          No notes linked to this item yet. Create one or attach existing notes.
        </p>
      ) : (
        <div className="space-y-1.5">
          {linkedNotes.map((note) => {
            const matchingLink = (note.listItemLinks || []).find(
              (l) => l.listItemId === item.id,
            );
            const updatedDay = formatCompactDayHeading(
              toLocalDateKey(note.updatedAt || note.createdAt),
            );
            return (
              <div
                key={note.id}
                className="group flex items-start justify-between gap-2 px-2.5 py-2 rounded-xl border transition-colors hover:border-[var(--border-strong)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <button
                  type="button"
                  onClick={() => handleOpenNote(note.id)}
                  className="flex-1 min-w-0 text-left space-y-0.5 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <NotePageIcon
                      icon={note.icon}
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: "var(--accent)" }}
                    />
                    <span
                      className="text-xs font-medium truncate group-hover:text-[var(--accent)] transition-colors"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {note.title || "Untitled Note"}
                    </span>
                    <span
                      className="text-[11px] font-mono tabular-nums shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    >
                      · {updatedDay}
                    </span>
                  </div>
                  {matchingLink?.quote && (
                    <p
                      className="text-[11px] italic line-clamp-2 pl-5.5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      “{matchingLink.quote}”
                    </p>
                  )}
                </button>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenNote(note.id)}
                    title="Open note in Notes"
                    aria-label="Open note in Notes"
                    className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{ color: "var(--accent)" }}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => unlinkNoteFromListItem(note.id, item.id)}
                    title="Unlink note"
                    aria-label="Unlink note"
                    className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AttachNotesToListItemModal
        open={attachOpen}
        item={item}
        linkedNoteIds={linkedNoteIds}
        notes={activeNotes}
        onToggleNote={handleToggleAttach}
        onClose={() => setAttachOpen(false)}
      />
    </section>
  );
};
