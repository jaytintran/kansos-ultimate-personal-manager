import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Calendar,
  Clock,
  FolderKanban,
  Hash,
  Maximize2,
  RotateCcw,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { useWorkspace } from "../../context/WorkspaceContext";
import type { DetailSheetTarget, Entry, ListItem } from "../../types";
import {
  combineLocalDateAndTime,
  toLocalDateKey,
  toTimeInputValue,
} from "../../utils/date";
import { TiptapEditor } from "../TiptapEditor";

export type AchievementInspectorTarget =
  | {
      kind: "entry";
      entry: Entry;
      sourceLabel: string;
      detailTarget: DetailSheetTarget;
    }
  | {
      kind: "list_item";
      item: ListItem;
      listTitle: string;
      sourceLabel: string;
      detailTarget: DetailSheetTarget;
    };

interface AchievementInspectorProps {
  target: AchievementInspectorTarget;
  allTags: string[];
  onClose: () => void;
  onOpenModal: (detailTarget: DetailSheetTarget) => void;
}

const InspectorRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  alignTop?: boolean;
}> = ({ icon, label, children, alignTop = false }) => (
  <div
    className={`flex ${
      alignTop ? "items-start" : "items-center"
    } gap-2 py-0.5 min-h-[28px] text-xs`}
  >
    <div
      className={`w-[88px] shrink-0 flex items-center gap-1.5 select-none ${
        alignTop ? "pt-1" : ""
      }`}
      style={{ color: "var(--text-muted)" }}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="truncate font-medium">{label}</span>
    </div>
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

export const AchievementInspector: React.FC<AchievementInspectorProps> = ({
  target,
  allTags,
  onClose,
  onOpenModal,
}) => {
  const {
    updateEntry,
    deleteEntry,
    updateListItem,
    deleteListItem,
    pushToast,
  } = useWorkspace();

  const initialRecordId =
    target.kind === "entry" ? `ent-${target.entry.id}` : `li-${target.item.id}`;

  const initialTitle =
    target.kind === "entry" ? target.entry.title : target.item.title;
  const initialContent =
    target.kind === "entry" ? target.entry.content : target.item.content;
  const initialTags =
    target.kind === "entry" ? target.entry.tags || [] : target.item.tags || [];
  const initialAchievedIso =
    target.kind === "entry"
      ? target.entry.completedAt ||
        target.entry.scheduledAt ||
        target.entry.createdAt
      : target.item.completedAt || target.item.updatedAt || target.item.createdAt;

  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState("");
  const [achievedDateKey, setAchievedDateKey] = useState(() =>
    toLocalDateKey(initialAchievedIso),
  );
  const [achievedTimeStr, setAchievedTimeStr] = useState(() =>
    toTimeInputValue(initialAchievedIso),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const lastSavedRef = useRef(
    JSON.stringify({
      title: initialTitle,
      content: initialContent,
      tags: initialTags,
      dateKey: toLocalDateKey(initialAchievedIso),
      timeStr: toTimeInputValue(initialAchievedIso),
    }),
  );

  // Sync local state if external updates change the same record
  useEffect(() => {
    const nextIso =
      target.kind === "entry"
        ? target.entry.completedAt ||
          target.entry.scheduledAt ||
          target.entry.createdAt
        : target.item.completedAt ||
          target.item.updatedAt ||
          target.item.createdAt;
    const nextTitle =
      target.kind === "entry" ? target.entry.title : target.item.title;
    const nextContent =
      target.kind === "entry" ? target.entry.content : target.item.content;
    const nextTags =
      target.kind === "entry"
        ? target.entry.tags || []
        : target.item.tags || [];
    const nextDateKey = toLocalDateKey(nextIso);
    const nextTimeStr = toTimeInputValue(nextIso);

    const incomingSnap = JSON.stringify({
      title: nextTitle,
      content: nextContent,
      tags: nextTags,
      dateKey: nextDateKey,
      timeStr: nextTimeStr,
    });

    if (incomingSnap === lastSavedRef.current) return;
    lastSavedRef.current = incomingSnap;
    setTitle(nextTitle);
    setContent(nextContent);
    setTags(nextTags);
    setAchievedDateKey(nextDateKey);
    setAchievedTimeStr(nextTimeStr);
  }, [target]);

  const flushChanges = useCallback(
    (draft: {
      title: string;
      content: string;
      tags: string[];
      dateKey: string;
      timeStr: string;
    }) => {
      const snap = JSON.stringify(draft);
      if (snap === lastSavedRef.current) return;

      const cleanTitle = draft.title.trim() || "Untitled Achievement";
      const nextIso = combineLocalDateAndTime(draft.dateKey, draft.timeStr);

      if (target.kind === "entry") {
        const patch: Partial<Entry> = {
          title: cleanTitle,
          content: draft.content,
          tags: draft.tags,
          ...(nextIso ? { completedAt: nextIso } : {}),
        };
        if (target.entry.type === "log" && nextIso) {
          patch.createdAt = nextIso;
        }
        updateEntry(target.entry.id, patch);
      } else {
        updateListItem(target.item.id, {
          title: cleanTitle,
          content: draft.content,
          tags: draft.tags,
          ...(nextIso ? { completedAt: nextIso } : {}),
        });
      }

      lastSavedRef.current = JSON.stringify({
        ...draft,
        title: cleanTitle,
      });
    },
    [target, updateEntry, updateListItem],
  );

  // Debounced auto-save
  useEffect(() => {
    const draft = {
      title,
      content,
      tags,
      dateKey: achievedDateKey,
      timeStr: achievedTimeStr,
    };
    const timer = window.setTimeout(() => {
      flushChanges(draft);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [
    title,
    content,
    tags,
    achievedDateKey,
    achievedTimeStr,
    flushChanges,
  ]);

  const handleAddTag = (raw: string) => {
    const clean = raw.trim().replace(/^#/, "").toLowerCase();
    if (!clean) {
      setTagInput("");
      return;
    }
    if (!tags.includes(clean)) {
      setTags((prev) => [...prev, clean]);
    }
    setTagInput("");
  };

  const handleUnmark = () => {
    if (target.kind === "entry") {
      updateEntry(target.entry.id, { isAchievement: false });
      pushToast("Removed from Achievements");
    } else {
      updateListItem(target.item.id, {
        status: "inbox",
        completedAt: null,
      });
      pushToast(`Moved "${target.item.title}" back to ${target.listTitle}`);
    }
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (target.kind === "entry") {
      deleteEntry(target.entry.id);
      pushToast("Achievement deleted");
    } else {
      deleteListItem(target.item.id);
      pushToast("List item deleted");
    }
  };

  useEffect(() => {
    if (!confirmDelete) return;
    const t = window.setTimeout(() => setConfirmDelete(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmDelete]);

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--bg-canvas)" }}
    >
      {/* Inspector Header */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Trophy
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: "var(--warning)" }}
          />
          <span
            className="text-[11px] font-mono font-semibold truncate"
            style={{ color: "var(--text-muted)" }}
          >
            {target.sourceLabel}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onOpenModal(target.detailTarget)}
            className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            title={
              target.kind === "list_item"
                ? "Open in Lists tab"
                : "Open full modal"
            }
            aria-label={
              target.kind === "list_item"
                ? "Open in Lists tab"
                : "Open full modal"
            }
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            title="Close inspector"
            aria-label="Close inspector"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Achievement title..."
          aria-label="Achievement title"
          className="w-full bg-transparent font-display text-lg font-semibold tracking-tight outline-none rounded-md px-1.5 py-1 -mx-1.5 transition-colors hover:bg-[var(--bg-surface-subtle)] focus:bg-[var(--bg-surface-subtle)]"
          style={{ color: "var(--text-primary)" }}
        />

        {/* Properties */}
        <div
          className="space-y-1.5 pb-4 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <InspectorRow
            icon={<Calendar className="w-3.5 h-3.5" />}
            label="Achieved"
          >
            <div className="flex flex-wrap items-center gap-1.5 -mx-1">
              <input
                type="date"
                value={achievedDateKey}
                onChange={(e) => {
                  if (e.target.value) setAchievedDateKey(e.target.value);
                }}
                aria-label="Achieved date"
                className="bg-transparent rounded-md px-1.5 py-0.5 text-xs font-mono tabular-nums outline-none hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)]"
                style={{ color: "var(--text-primary)" }}
              />
              <span
                className="inline-flex items-center gap-1 text-xs font-mono tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                <Clock className="w-3 h-3 shrink-0" />
                <input
                  type="time"
                  value={achievedTimeStr}
                  onChange={(e) => {
                    if (e.target.value) setAchievedTimeStr(e.target.value);
                  }}
                  aria-label="Achieved time"
                  className="bg-transparent rounded-md px-1.5 py-0.5 text-xs font-mono tabular-nums outline-none hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)]"
                  style={{ color: "var(--text-primary)" }}
                />
              </span>
            </div>
          </InspectorRow>

          {target.kind === "list_item" && (
            <InspectorRow
              icon={<FolderKanban className="w-3.5 h-3.5" />}
              label="List"
            >
              <span
                className="text-xs font-medium truncate block"
                style={{ color: "var(--text-secondary)" }}
              >
                {target.listTitle}
              </span>
            </InspectorRow>
          )}

          <InspectorRow
            icon={<Hash className="w-3.5 h-3.5" />}
            label="Tags"
            alignTop
          >
            <div className="space-y-1 -mx-1 px-1 py-0.5">
              <div className="flex flex-wrap items-center gap-1">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setTags((prev) => prev.filter((t) => t !== tag))
                    }
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-mono cursor-pointer"
                    style={{
                      backgroundColor: "var(--accent-soft)",
                      color: "var(--accent)",
                    }}
                  >
                    <span>#{tag}</span>
                    <X className="w-2.5 h-2.5 opacity-65" />
                  </button>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddTag(tagInput);
                  }}
                  className="inline-flex items-center"
                >
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onBlur={() => {
                      if (tagInput.trim()) handleAddTag(tagInput);
                    }}
                    placeholder="+ Add tag"
                    className="w-24 bg-transparent rounded-md px-1.5 py-0.5 text-[11px] font-mono outline-none transition-colors hover:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)] placeholder:opacity-55"
                    style={{ color: "var(--text-primary)" }}
                  />
                </form>
              </div>
              {allTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  {allTags
                    .filter((t) => !tags.includes(t))
                    .slice(0, 6)
                    .map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleAddTag(t)}
                        className="text-[11px] font-mono hover:underline cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                      >
                        +#{t}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </InspectorRow>
        </div>

        {/* Rich Notes */}
        <div className="space-y-1.5">
          <div
            className="text-[11px] font-semibold tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            Notes
          </div>
          <TiptapEditor
            docId={initialRecordId}
            content={content}
            onChange={setContent}
            variant="borderless"
            placeholder="Write reflections, context, or outcome notes..."
            minHeight={180}
          />
        </div>
      </div>

      {/* Footer Actions */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 border-t shrink-0"
        style={{
          borderColor: "var(--border-subtle)",
          backgroundColor: "var(--bg-canvas)",
        }}
      >
        <button
          type="button"
          onClick={handleUnmark}
          className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-secondary)",
          }}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>
            {target.kind === "entry"
              ? "Unmark achievement"
              : "Mark incomplete"}
          </span>
        </button>

        <button
          type="button"
          onClick={handleDelete}
          className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          style={{
            backgroundColor: confirmDelete
              ? "rgba(220, 38, 38, 0.12)"
              : "var(--bg-surface)",
            borderColor: confirmDelete
              ? "var(--danger)"
              : "var(--border-subtle)",
            color: confirmDelete ? "var(--danger)" : "var(--text-muted)",
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{confirmDelete ? "Confirm delete" : "Delete"}</span>
        </button>
      </div>
    </div>
  );
};
