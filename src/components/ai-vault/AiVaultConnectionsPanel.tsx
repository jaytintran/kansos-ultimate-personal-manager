import React, { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Network,
  Plus,
  Search,
  Unlink,
  X,
} from "lucide-react";
import type { AiChatRecord } from "../../types/aiVault";
import type { BookNoteLink, BookRecord, Entry } from "../../types";
import { AI_PLATFORM_META } from "./aiVaultUiUtils";

export type AiConnectionMode = "tree" | "graph";

interface AiVaultConnectionsPanelProps {
  chat: AiChatRecord;
  allNotes: Entry[];
  allBooks: BookRecord[];
  isOpenDesktop: boolean;
  isOpenMobile: boolean;
  mode: AiConnectionMode;
  onModeChange: (mode: AiConnectionMode) => void;
  onToggleNoteLink: (noteId: string) => void;
  onToggleBookLink: (bookId: string) => void;
  onJumpToNote?: (noteId: string) => void;
  onJumpToBookLocation?: (bookLink: BookNoteLink) => void;
  onCloseDesktop: () => void;
  onCloseMobile: () => void;
}

export const AiVaultConnectionsPanel: React.FC<AiVaultConnectionsPanelProps> = ({
  chat,
  allNotes,
  allBooks,
  isOpenDesktop,
  isOpenMobile,
  mode,
  onModeChange,
  onToggleNoteLink,
  onToggleBookLink,
  onJumpToNote,
  onJumpToBookLocation,
  onCloseDesktop,
  onCloseMobile,
}) => {
  const [pickerTab, setPickerTab] = useState<"note" | "book" | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<{ notes: boolean; books: boolean }>({
    notes: false,
    books: false,
  });

  const activeNotes = useMemo(
    () => allNotes.filter((n) => n.type === "note" && !n.archived),
    [allNotes],
  );
  const noteById = useMemo(
    () => new Map(activeNotes.map((n) => [n.id, n])),
    [activeNotes],
  );
  const bookById = useMemo(
    () => new Map(allBooks.map((b) => [b.id, b])),
    [allBooks],
  );

  const linkedNotes = useMemo(
    () =>
      (chat.linkedNoteIds || [])
        .map((id) => noteById.get(id))
        .filter((n): n is Entry => Boolean(n)),
    [chat.linkedNoteIds, noteById],
  );

  const linkedBooks = useMemo(
    () =>
      (chat.linkedBookIds || [])
        .map((id) => bookById.get(id))
        .filter((b): b is BookRecord => Boolean(b)),
    [chat.linkedBookIds, bookById],
  );

  const noteCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const linkedSet = new Set(chat.linkedNoteIds || []);
    return activeNotes
      .filter((n) => !q || (n.title || "Untitled Note").toLowerCase().includes(q))
      .sort((a, b) => Number(linkedSet.has(a.id)) - Number(linkedSet.has(b.id)))
      .slice(0, 14);
  }, [activeNotes, query, chat.linkedNoteIds]);

  const bookCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const linkedSet = new Set(chat.linkedBookIds || []);
    return allBooks
      .filter(
        (b) =>
          !q ||
          b.title.toLowerCase().includes(q) ||
          (b.author || "").toLowerCase().includes(q),
      )
      .sort((a, b) => Number(linkedSet.has(a.id)) - Number(linkedSet.has(b.id)))
      .slice(0, 14);
  }, [allBooks, query, chat.linkedBookIds]);

  const graphNodes = useMemo(() => {
    const total = linkedNotes.length + linkedBooks.length;
    const nodes: Array<{
      id: string;
      kind: "note" | "book";
      label: string;
      x: number;
      y: number;
      rawId: string;
    }> = [];
    if (total === 0) return nodes;
    const radius = total <= 4 ? 115 : total <= 8 ? 138 : 155;
    linkedNotes.forEach((n, idx) => {
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
      nodes.push({
        id: `note:${n.id}`,
        kind: "note",
        label: n.title || "Untitled Note",
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        rawId: n.id,
      });
    });
    linkedBooks.forEach((b, idx) => {
      const angle = ((linkedNotes.length + idx) / total) * Math.PI * 2 - Math.PI / 2;
      nodes.push({
        id: `book:${b.id}`,
        kind: "book",
        label: b.title || "Untitled Book",
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        rawId: b.id,
      });
    });
    return nodes;
  }, [linkedNotes, linkedBooks]);

  const panelBody = (isMobile: boolean) => (
    <div
      className="h-full flex flex-col"
      style={{ backgroundColor: "var(--bg-canvas)" }}
    >
      {/* Header */}
      <div
        className="h-12 px-3 flex items-center justify-between gap-2 border-b shrink-0"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Network className="w-4 h-4 shrink-0" style={{ color: "var(--accent)" }} />
          <span className="text-xs font-semibold truncate">Connections</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className="inline-flex items-center p-0.5 rounded-lg border"
            style={{
              backgroundColor: "var(--bg-surface-subtle)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <button
              type="button"
              onClick={() => onModeChange("tree")}
              className="px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer"
              style={{
                backgroundColor: mode === "tree" ? "var(--bg-surface)" : "transparent",
                color: mode === "tree" ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              Tree
            </button>
            <button
              type="button"
              onClick={() => onModeChange("graph")}
              className="px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer"
              style={{
                backgroundColor: mode === "graph" ? "var(--bg-surface)" : "transparent",
                color: mode === "graph" ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              Graph
            </button>
          </div>

          <button
            type="button"
            onClick={isMobile ? onCloseMobile : onCloseDesktop}
            aria-label="Close connections"
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Link Pickers */}
      <div
        className="px-3 py-2.5 border-b space-y-2 shrink-0"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setPickerTab((prev) => (prev === "note" ? null : "note"));
              setQuery("");
            }}
            className="flex-1 h-7 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center justify-center gap-1 hover:border-[var(--accent)] cursor-pointer"
            style={{
              backgroundColor:
                pickerTab === "note" ? "var(--accent-soft)" : "var(--bg-canvas)",
              borderColor:
                pickerTab === "note" ? "var(--accent)" : "var(--border-subtle)",
              color:
                pickerTab === "note" ? "var(--accent)" : "var(--text-primary)",
            }}
          >
            <Plus className="w-3 h-3" />
            <span>Link Note</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPickerTab((prev) => (prev === "book" ? null : "book"));
              setQuery("");
            }}
            className="flex-1 h-7 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center justify-center gap-1 hover:border-[var(--accent)] cursor-pointer"
            style={{
              backgroundColor:
                pickerTab === "book" ? "var(--accent-soft)" : "var(--bg-canvas)",
              borderColor:
                pickerTab === "book" ? "var(--accent)" : "var(--border-subtle)",
              color:
                pickerTab === "book" ? "var(--accent)" : "var(--text-primary)",
            }}
          >
            <Plus className="w-3 h-3" />
            <span>Link Book</span>
          </button>
        </div>

        {pickerTab && (
          <div
            className="rounded-xl border p-2 space-y-1.5"
            style={{
              backgroundColor: "var(--bg-canvas)",
              borderColor: "var(--accent)",
            }}
          >
            <div
              className="flex items-center gap-1.5 px-2 h-7 rounded-md border"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              <Search className="w-3 h-3 shrink-0" style={{ color: "var(--text-muted)" }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  pickerTab === "note" ? "Search notes to link..." : "Search books to link..."
                }
                autoFocus
                className="flex-1 min-w-0 bg-transparent text-xs outline-none"
              />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {pickerTab === "note"
                ? noteCandidates.map((n) => {
                    const isLinked = (chat.linkedNoteIds || []).includes(n.id);
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => onToggleNoteLink(n.id)}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs text-left hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <FileText className="w-3 h-3 shrink-0 opacity-75" />
                          <span className="truncate">{n.title || "Untitled Note"}</span>
                        </span>
                        <span
                          className="text-[10px] font-mono shrink-0"
                          style={{
                            color: isLinked ? "var(--accent)" : "var(--text-muted)",
                          }}
                        >
                          {isLinked ? "Linked" : "Link"}
                        </span>
                      </button>
                    );
                  })
                : bookCandidates.map((b) => {
                    const isLinked = (chat.linkedBookIds || []).includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onToggleBookLink(b.id)}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs text-left hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <BookOpen className="w-3 h-3 shrink-0 opacity-75" />
                          <span className="truncate">{b.title}</span>
                        </span>
                        <span
                          className="text-[10px] font-mono shrink-0"
                          style={{
                            color: isLinked ? "var(--accent)" : "var(--text-muted)",
                          }}
                        >
                          {isLinked ? "Linked" : "Link"}
                        </span>
                      </button>
                    );
                  })}
            </div>
          </div>
        )}
      </div>

      {/* Main Connections Body */}
      {mode === "tree" ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
          {/* Linked Notes Group */}
          <div
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <button
              type="button"
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, notes: !prev.notes }))
              }
              className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <FileText className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
                <span>Linked Notes</span>
              </span>
              <span
                className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                <span>{linkedNotes.length}</span>
                {collapsed.notes ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </span>
            </button>

            {!collapsed.notes && (
              <div
                className="px-1.5 pb-1.5 pt-1 border-t space-y-0.5"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {linkedNotes.length === 0 ? (
                  <p className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    No notes linked yet. Click &ldquo;+ Link Note&rdquo; above.
                  </p>
                ) : (
                  linkedNotes.map((note) => (
                    <div
                      key={note.id}
                      className="group flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-surface-hover)]"
                    >
                      <button
                        type="button"
                        onClick={() => onJumpToNote?.(note.id)}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0 opacity-75" />
                        <span className="text-xs font-medium truncate">
                          {note.title || "Untitled Note"}
                        </span>
                      </button>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleNoteLink(note.id)}
                          title="Unlink note"
                          className="h-6 w-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-surface)] cursor-pointer"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <Unlink className="w-3 h-3" />
                        </button>
                        {onJumpToNote && (
                          <button
                            type="button"
                            onClick={() => onJumpToNote(note.id)}
                            title="Open note"
                            className="h-6 w-6 rounded flex items-center justify-center hover:bg-[var(--bg-surface)] cursor-pointer"
                            style={{ color: "var(--accent)" }}
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Linked Books Group */}
          <div
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <button
              type="button"
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, books: !prev.books }))
              }
              className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <BookOpen className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
                <span>Linked Books</span>
              </span>
              <span
                className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                <span>{linkedBooks.length}</span>
                {collapsed.books ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </span>
            </button>

            {!collapsed.books && (
              <div
                className="px-1.5 pb-1.5 pt-1 border-t space-y-0.5"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {linkedBooks.length === 0 ? (
                  <p className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    No books linked yet. Click &ldquo;+ Link Book&rdquo; above.
                  </p>
                ) : (
                  linkedBooks.map((book) => (
                    <div
                      key={book.id}
                      className="group flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-surface-hover)]"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onJumpToBookLocation?.({
                            bookId: book.id,
                            bookTitle: book.title,
                            unitIndex: 0,
                            scrollRatio: 0,
                            locationLabel: book.format === "pdf" ? "Page 1" : "Start",
                          })
                        }
                        className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5 shrink-0 opacity-75" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate">
                            {book.title}
                          </div>
                          {book.author && (
                            <div
                              className="text-[10.5px] truncate"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {book.author}
                            </div>
                          )}
                        </div>
                      </button>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleBookLink(book.id)}
                          title="Unlink book"
                          className="h-6 w-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-surface)] cursor-pointer"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <Unlink className="w-3 h-3" />
                        </button>
                        {onJumpToBookLocation && (
                          <button
                            type="button"
                            onClick={() =>
                              onJumpToBookLocation({
                                bookId: book.id,
                                bookTitle: book.title,
                                unitIndex: 0,
                                scrollRatio: 0,
                                locationLabel: book.format === "pdf" ? "Page 1" : "Start",
                              })
                            }
                            title="Open in Library"
                            className="h-6 w-6 rounded flex items-center justify-center hover:bg-[var(--bg-surface)] cursor-pointer"
                            style={{ color: "var(--accent)" }}
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Radial Graph */
        <div className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
          {graphNodes.length === 0 ? (
            <div
              className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2"
              style={{ color: "var(--text-muted)" }}
            >
              <Network className="w-7 h-7 opacity-40" />
              <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                No linked connections yet
              </p>
              <p className="text-[11px]">
                Link Notes or Library Books to visualize connections around this AI chat.
              </p>
            </div>
          ) : (
            <svg viewBox="-220 -220 440 440" className="w-full h-full select-none">
              {graphNodes.map((n) => (
                <line
                  key={`edge-${n.id}`}
                  x1={0}
                  y1={0}
                  x2={n.x}
                  y2={n.y}
                  stroke="var(--accent)"
                  strokeWidth={1.3}
                  strokeDasharray={n.kind === "book" ? "4 3" : undefined}
                  opacity={0.65}
                />
              ))}

              {/* Center AI Chat Node */}
              <g transform="translate(0, 0)">
                <circle
                  r={14}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  opacity={0.75}
                />
                <circle
                  r={9.5}
                  fill={AI_PLATFORM_META[chat.platform]?.dotColor || "var(--accent)"}
                  stroke="var(--bg-canvas)"
                  strokeWidth={1.5}
                />
                <text
                  y={24}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--text-primary)"
                  stroke="var(--bg-canvas)"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {chat.title.length > 20 ? `${chat.title.slice(0, 19)}…` : chat.title}
                </text>
              </g>

              {graphNodes.map((n) => (
                <g
                  key={n.id}
                  transform={`translate(${n.x}, ${n.y})`}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    if (n.kind === "note") onJumpToNote?.(n.rawId);
                    else
                      onJumpToBookLocation?.({
                        bookId: n.rawId,
                        bookTitle: n.label,
                        unitIndex: 0,
                        scrollRatio: 0,
                        locationLabel: "Start",
                      });
                  }}
                >
                  <circle
                    r={7}
                    fill={n.kind === "note" ? "#3b82f6" : "#10b981"}
                    stroke="var(--bg-canvas)"
                    strokeWidth={1.5}
                  />
                  <text
                    y={18}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={500}
                    fill="var(--text-secondary)"
                    stroke="var(--bg-canvas)"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label}
                  </text>
                </g>
              ))}
            </svg>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {isOpenDesktop && (
        <aside
          aria-label="AI Vault connections"
          className="hidden lg:flex lg:flex-col w-[320px] xl:w-[360px] h-full shrink-0 border-l overflow-hidden"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {panelBody(false)}
        </aside>
      )}

      {isOpenMobile && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex justify-end bg-black/50 backdrop-blur-[1px] overscroll-none"
          onClick={onCloseMobile}
        >
          <div
            className="w-[min(92vw,370px)] h-full pt-safe pb-safe border-l flex flex-col overflow-hidden"
            style={{ borderColor: "var(--border-strong)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {panelBody(true)}
          </div>
        </div>
      )}
    </>
  );
};
