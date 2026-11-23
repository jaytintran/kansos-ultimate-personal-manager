import React, { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, ExternalLink, FileText, Pin, Plus, X } from "lucide-react";
import type { Entry } from "../../types";

interface NotesTabStripProps {
  openNotes: Entry[];
  activeTabId: string | null; // null means Notes Home view is active
  onSelectHome: () => void;
  onSelectTab: (noteId: string) => void;
  onCloseTab: (noteId: string) => void;
  onCloseOtherTabs: (keepNoteId: string) => void;
  onCloseAllTabs: () => void;
  onReorderTabs: (
    draggedId: string,
    targetId: string,
    position: "before" | "after",
  ) => void;
  onCreateNoteTab: () => void;
  onOpenInModal?: (noteId: string) => void;
}

const TAB_DRAG_MIME = "application/x-kanso-note-tab-id";

export const NotesTabStrip: React.FC<NotesTabStripProps> = ({
  openNotes,
  activeTabId,
  onSelectHome,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  onReorderTabs,
  onCreateNoteTab,
  onOpenInModal,
}) => {
  const isHomeActive = activeTabId === null;

  const activeDragTabIdRef = useRef<string | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    tabId: string;
    position: "before" | "after";
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    noteId: string;
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const clearDragState = useCallback(() => {
    activeDragTabIdRef.current = null;
    setDraggingTabId(null);
    setDropTarget(null);
  }, []);

  // Scroll newly activated tab into view smoothly
  useEffect(() => {
    if (!activeTabId) return;
    const el = tabRefs.current.get(activeTabId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [activeTabId]);

  // Dismiss tab context menu on outside click, Escape, or scroll
  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }
      setContextMenu(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenu(null);
      }
    };
    const handleWindowBlur = () => setContextMenu(null);

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [contextMenu]);

  useEffect(() => {
    window.addEventListener("dragend", clearDragState);
    window.addEventListener("drop", clearDragState);
    return () => {
      window.removeEventListener("dragend", clearDragState);
      window.removeEventListener("drop", clearDragState);
    };
  }, [clearDragState]);

  const handleTabContextMenu = (e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 188;
    const menuHeight = onOpenInModal ? 156 : 118;
    const x =
      typeof window !== "undefined"
        ? Math.min(e.clientX, window.innerWidth - menuWidth - 8)
        : e.clientX;
    const y =
      typeof window !== "undefined"
        ? Math.min(e.clientY, window.innerHeight - menuHeight - 8)
        : e.clientY;
    setContextMenu({
      noteId,
      x: Math.max(8, x),
      y: Math.max(8, y),
    });
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="Open notes"
        className="border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] select-none shrink-0"
      >
        <div className="h-10 lg:h-9 px-2 flex items-end gap-1 overflow-x-auto no-scrollbar">
          {/* Pinned Notes Home Tab */}
          <button
            type="button"
            role="tab"
            aria-selected={isHomeActive}
            onClick={onSelectHome}
            className={`h-9 lg:h-8 px-3 rounded-t-md inline-flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border-t border-x ${
              isHomeActive
                ? "bg-[var(--bg-canvas)] text-[var(--text-primary)] border-[var(--border-subtle)] -mb-px"
                : "bg-transparent text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/70"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>Notes</span>
          </button>

          {openNotes.length > 0 && (
            <div className="h-4 w-px bg-[var(--border-subtle)] self-center mx-0.5 shrink-0" />
          )}

          {/* Open Note Tabs (draggable horizontally) */}
          {openNotes.map((note) => {
            const isActive = activeTabId === note.id;
            const isBeingDragged = draggingTabId === note.id;
            const isTarget = dropTarget?.tabId === note.id;
            const label = note.title?.trim() || "Untitled Note";

            return (
              <div
                key={note.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(note.id, el);
                  else tabRefs.current.delete(note.id);
                }}
                role="tab"
                aria-selected={isActive}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(TAB_DRAG_MIME, note.id);
                  e.dataTransfer.effectAllowed = "move";
                  activeDragTabIdRef.current = note.id;
                  setDraggingTabId(note.id);
                }}
                onDragEnd={clearDragState}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(TAB_DRAG_MIME)) return;
                  if (activeDragTabIdRef.current === note.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: "before" | "after" =
                    e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                  setDropTarget((prev) =>
                    prev?.tabId === note.id && prev.position === position
                      ? prev
                      : { tabId: note.id, position },
                  );
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDropTarget((prev) =>
                      prev?.tabId === note.id ? null : prev,
                    );
                  }
                }}
                onDrop={(e) => {
                  if (!e.dataTransfer.types.includes(TAB_DRAG_MIME)) return;
                  const draggedId =
                    e.dataTransfer.getData(TAB_DRAG_MIME) ||
                    activeDragTabIdRef.current;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position: "before" | "after" =
                    e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                  clearDragState();
                  if (!draggedId || draggedId === note.id) return;
                  e.preventDefault();
                  onReorderTabs(draggedId, note.id, position);
                }}
                onContextMenu={(e) => handleTabContextMenu(e, note.id)}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onCloseTab(note.id);
                  }
                }}
                className={`relative group h-9 lg:h-8 max-w-[200px] sm:max-w-[220px] min-w-[116px] sm:min-w-[120px] pl-2.5 pr-1.5 rounded-t-md inline-flex items-center gap-1.5 text-xs transition-colors shrink-0 border-t border-x ${
                  isBeingDragged ? "opacity-45" : ""
                } ${
                  isActive
                    ? "bg-[var(--bg-canvas)] text-[var(--text-primary)] font-medium border-[var(--border-subtle)] -mb-px"
                    : "bg-transparent text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/70"
                }`}
              >
                {isTarget && (
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-[var(--accent)] z-20 ${
                      dropTarget.position === "before" ? "left-0" : "right-0"
                    }`}
                  />
                )}

                <button
                  type="button"
                  onClick={() => onSelectTab(note.id)}
                  title={label}
                  className="flex-1 min-w-0 h-full flex items-center gap-1.5 text-left cursor-pointer"
                >
                  {note.pinned ? (
                    <Pin className="w-3 h-3 shrink-0 text-[var(--accent)]" />
                  ) : (
                    <FileText
                      className={`w-3 h-3 shrink-0 ${
                        isActive
                          ? "text-[var(--accent)]"
                          : "text-[var(--text-muted)]"
                      }`}
                    />
                  )}
                  <span className="truncate">{label}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(note.id);
                  }}
                  aria-label={`Close ${label}`}
                  className={`p-1 lg:p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer shrink-0 transition-opacity ${
                    isActive
                      ? "opacity-85 hover:opacity-100"
                      : "opacity-70 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100"
                  }`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {/* New Note Tab (+) button on strip */}
          <button
            type="button"
            onClick={onCreateNoteTab}
            title="New note tab"
            aria-label="New note tab"
            className="h-8 w-8 lg:h-7 lg:w-7 mb-0.5 ml-0.5 rounded-md inline-flex items-center justify-center shrink-0 transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right-Click Tab Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Tab actions"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            backgroundColor: "var(--bg-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow: "var(--shadow-popover)",
          }}
          className="fixed z-50 min-w-[180px] rounded-xl border p-1.5 text-xs"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const targetId = contextMenu.noteId;
              setContextMenu(null);
              onCloseTab(targetId);
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between gap-2 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-primary)" }}
          >
            <span>Close Tab</span>
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={openNotes.length <= 1}
            onClick={() => {
              const targetId = contextMenu.noteId;
              setContextMenu(null);
              onCloseOtherTabs(targetId);
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between gap-2 transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            style={{ color: "var(--text-primary)" }}
          >
            <span>Close Others</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setContextMenu(null);
              onCloseAllTabs();
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between gap-2 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-primary)" }}
          >
            <span>Close All</span>
          </button>

          {onOpenInModal && (
            <>
              <div
                className="my-1 h-px"
                style={{ backgroundColor: "var(--border-subtle)" }}
              />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const targetId = contextMenu.noteId;
                  setContextMenu(null);
                  onOpenInModal(targetId);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg text-left flex items-center gap-2 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
              >
                <ExternalLink className="w-3.5 h-3.5 opacity-75" />
                <span>Open in Details Modal</span>
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
};
