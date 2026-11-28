import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  CornerDownLeft,
  Hash,
  Inbox,
  Link2,
  PauseCircle,
  Slash,
  XCircle,
} from "lucide-react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { flattenListTree } from "../../lib/listTree";
import { ListCollection, ListItemStatus } from "../../types";
import { extractUrlFromListInput, parseNlpInput } from "../../utils/nlp";
import { ListIcon as CollectionIcon } from "../IconLibrary";

interface ListsCaptureBarProps {
  lists: ListCollection[];
  targetListId: string;
  onTargetListChange: (listId: string) => void;
  status: ListItemStatus;
  onStatusChange: (next: ListItemStatus) => void;
  availableTags?: string[];
  onSubmitItem: (
    targetListId: string,
    rawText: string,
    status: ListItemStatus,
  ) => boolean;
  previewPosition?: "top" | "bottom";
  elevated?: boolean;
  compact?: boolean;
  placeholder?: string;
}

const QUICK_STATUS_OPTIONS: {
  id: ListItemStatus;
  label: string;
  icon: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  color: string;
}[] = [
  {
    id: "inbox",
    label: "Inbox",
    icon: Inbox,
    color: "var(--text-secondary)",
  },
  {
    id: "processing",
    label: "Active",
    icon: Clock,
    color: "var(--accent)",
  },
  {
    id: "maybe-later",
    label: "Later",
    icon: PauseCircle,
    color: "var(--text-muted)",
  },
];

const EXTRA_SMART_STATUS_OPTIONS: Record<
  "done" | "dropped",
  {
    id: ListItemStatus;
    label: string;
    icon: React.ComponentType<{
      className?: string;
      style?: React.CSSProperties;
    }>;
    color: string;
  }
> = {
  done: {
    id: "done",
    label: "Done",
    icon: CheckCircle2,
    color: "var(--success)",
  },
  dropped: {
    id: "dropped",
    label: "Dropped",
    icon: XCircle,
    color: "var(--danger)",
  },
};

function normalizeSlashSlug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

export const ListsCaptureBar: React.FC<ListsCaptureBarProps> = ({
  lists,
  targetListId,
  onTargetListChange,
  status,
  onStatusChange,
  availableTags = [],
  onSubmitItem,
  previewPosition = "top",
  elevated = true,
  compact = true,
  placeholder,
}) => {
  const { workspace } = useWorkspace();
  const [value, setValue] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const flattenedLists = useMemo(() => flattenListTree(lists), [lists]);

  const targetNode = useMemo(
    () =>
      flattenedLists.find((n) => n.list.id === targetListId) ??
      flattenedLists[0] ??
      null,
    [flattenedLists, targetListId],
  );

  const effectiveTargetListId = targetNode?.list.id || "";
  const hasNoLists = flattenedLists.length === 0;

  useEffect(() => {
    if (!listPickerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setListPickerOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [listPickerOpen]);

  // Detect active leading "/" query without whitespace yet (for list switcher popup)
  const activeSlashQuery = useMemo(() => {
    if (hasNoLists) return null;
    const trimmedStart = value.trimStart();
    if (!trimmedStart.startsWith("/")) return null;
    if (/\s/.test(trimmedStart)) return null;
    return trimmedStart.slice(1).toLowerCase();
  }, [value, hasNoLists]);

  useEffect(() => {
    if (activeSlashQuery === null) {
      setSlashDismissed(false);
    } else {
      setSlashIndex(0);
    }
  }, [activeSlashQuery]);

  const slashSuggestions = useMemo(() => {
    if (activeSlashQuery === null || slashDismissed) return [];
    const q = activeSlashQuery;
    const enriched = flattenedLists.map((node) => {
      const slug = normalizeSlashSlug(node.list.title) || "list";
      return {
        ...node,
        slug: `/${slug}`,
      };
    });
    if (!q) return enriched;
    return enriched.filter(
      (item) =>
        item.list.title.toLowerCase().includes(q) ||
        item.pathLabel.toLowerCase().includes(q) ||
        item.slug.slice(1).includes(q) ||
        (item.list.listType || "custom").toLowerCase().includes(q),
    );
  }, [activeSlashQuery, slashDismissed, flattenedLists]);

  useEffect(() => {
    if (slashIndex >= slashSuggestions.length && slashSuggestions.length > 0) {
      setSlashIndex(0);
    }
  }, [slashIndex, slashSuggestions.length]);

  const extractedUrlInfo = useMemo(
    () => extractUrlFromListInput(value),
    [value],
  );

  const parsed = useMemo(
    () =>
      parseNlpInput(
        extractedUrlInfo.strippedText,
        undefined,
        workspace.settings.timeFormat,
      ),
    [extractedUrlInfo.strippedText, workspace.settings.timeFormat],
  );

  const tagSuggestions = useMemo(() => {
    if (availableTags.length === 0) return [];
    const match = value.match(/(?:^|\s)#([a-zA-Z0-9_-]*)$/);
    if (!match) return [];
    const prefix = match[1].toLowerCase();
    return availableTags
      .filter((t) => !parsed.tags.includes(t) && t.toLowerCase().startsWith(prefix))
      .slice(0, 6);
  }, [value, availableTags, parsed.tags]);

  const applySlashListSelect = (listId: string) => {
    onTargetListChange(listId);
    setValue("");
    setSlashDismissed(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const applyTagSuggestion = (tag: string) => {
    setValue((prev) => prev.replace(/(^|\s)#[a-zA-Z0-9_-]*$/, `$1#${tag} `));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasNoLists || !effectiveTargetListId || !value.trim()) return;
    const ok = onSubmitItem(effectiveTargetListId, value, status);
    if (ok) {
      setValue("");
      setSlashDismissed(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (slashSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex(
          (i) => (i - 1 + slashSuggestions.length) % slashSuggestions.length,
        );
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const chosen = slashSuggestions[slashIndex] ?? slashSuggestions[0];
        if (chosen) applySlashListSelect(chosen.list.id);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }
  };

  const visibleStatusOptions = useMemo(() => {
    if (status === "done" || status === "dropped") {
      return [...QUICK_STATUS_OPTIONS, EXTRA_SMART_STATUS_OPTIONS[status]];
    }
    return QUICK_STATUS_OPTIONS;
  }, [status]);

  const hasPreview =
    !hasNoLists &&
    (parsed.tokens.length > 0 || Boolean(extractedUrlInfo.url));

  const previewNode = hasPreview ? (
    <div
      className={`${
        previewPosition === "top"
          ? "mb-1.5 px-3 py-1.5 rounded-xl border"
          : "mt-1.5 px-1"
      } flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs`}
      style={{
        backgroundColor:
          previewPosition === "top" ? "var(--bg-elevated)" : "transparent",
        borderColor:
          previewPosition === "top" ? "var(--border-subtle)" : "transparent",
        boxShadow: previewPosition === "top" ? "var(--shadow-popover)" : "none",
      }}
    >
      {extractedUrlInfo.url && (
        <span
          className="inline-flex items-center gap-1 font-mono text-[11px]"
          style={{ color: "var(--accent)" }}
        >
          <Link2 className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[180px]">
            {extractedUrlInfo.fallbackTitle || extractedUrlInfo.url}
          </span>
        </span>
      )}
      {parsed.tokens.map((tok, i) => (
        <span
          key={`${tok.kind}-${tok.label}-${i}`}
          className="inline-flex items-center gap-1 font-mono tabular-nums text-[11px]"
          style={{
            color:
              tok.kind === "tag" ? "var(--text-secondary)" : "var(--accent)",
          }}
        >
          {tok.kind === "tag" ? (
            <Hash className="w-3 h-3 shrink-0" />
          ) : (
            <Clock className="w-3 h-3 shrink-0" />
          )}
          <span>{tok.label}</span>
        </span>
      ))}
      {parsed.previewLabel && (
        <span
          className="truncate text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          · {parsed.cleanTitle || extractedUrlInfo.fallbackTitle}
        </span>
      )}
    </div>
  ) : null;

  const computedPlaceholder = hasNoLists
    ? "Create a list first to add items..."
    : placeholder ||
      `Add to ${targetNode?.list.title || "list"} (type / to switch list, paste URL, due tomorrow, #tag)...`;

  return (
    <form onSubmit={handleSubmit} className="w-full relative">
      {/* Slash Command List Switcher Popover */}
      {slashSuggestions.length > 0 && !hasNoLists && (
        <div
          className={`absolute left-0 right-0 sm:right-auto sm:w-80 max-h-72 overflow-y-auto z-40 rounded-xl border p-1.5 space-y-0.5 ${
            previewPosition === "top" ? "bottom-full mb-2" : "top-full mt-1.5"
          }`}
          style={{
            backgroundColor: "var(--bg-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow: "var(--shadow-popover)",
          }}
          role="listbox"
          aria-label="Route item to list"
        >
          <div
            className="px-2.5 py-1 text-[11px] font-medium flex items-center justify-between"
            style={{ color: "var(--text-muted)" }}
          >
            <span className="inline-flex items-center gap-1">
              <Slash className="w-3 h-3" />
              <span>Choose target list</span>
            </span>
            <span className="font-mono text-[10px]">↑↓ · Enter</span>
          </div>
          {slashSuggestions.map((node, idx) => {
            const highlighted = idx === slashIndex;
            const isCurrentTarget = node.list.id === effectiveTargetListId;
            return (
              <button
                key={node.list.id}
                type="button"
                role="option"
                aria-selected={highlighted}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySlashListSelect(node.list.id);
                }}
                onMouseEnter={() => setSlashIndex(idx)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer"
                style={{
                  backgroundColor: highlighted
                    ? "var(--accent-soft)"
                    : "transparent",
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CollectionIcon
                    name={node.list.icon}
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: node.list.color || "var(--accent)" }}
                  />
                  <div className="min-w-0">
                    <div
                      className="text-xs font-medium truncate flex items-center gap-1.5"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <span className="truncate">{node.list.title}</span>
                      {isCurrentTarget && (
                        <Check
                          className="w-3 h-3 shrink-0"
                          style={{ color: "var(--accent)" }}
                        />
                      )}
                    </div>
                    {node.depth > 0 && (
                      <div
                        className="text-[11px] truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {node.pathLabel}
                      </div>
                    )}
                  </div>
                </div>
                <span
                  className="text-[11px] font-mono shrink-0"
                  style={{
                    color: highlighted ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {node.slug}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* #tag Autocomplete Popover */}
      {tagSuggestions.length > 0 &&
        slashSuggestions.length === 0 &&
        !hasNoLists && (
          <div
            className={`absolute left-2 z-30 flex flex-wrap gap-1.5 p-2 rounded-xl border ${
              previewPosition === "top" ? "bottom-full mb-2" : "top-full mt-1.5"
            }`}
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            {tagSuggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyTagSuggestion(tag);
                }}
                className="px-2 py-1 rounded-md text-xs font-mono transition-colors hover:bg-[var(--accent-soft)] cursor-pointer"
                style={{ color: "var(--accent)" }}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

      {/* Clickable Target List Picker Popover */}
      {listPickerOpen && !hasNoLists && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setListPickerOpen(false)}
          />
          <div
            className={`absolute left-0 z-40 w-72 max-h-72 overflow-y-auto rounded-xl border p-1.5 space-y-0.5 ${
              previewPosition === "top" ? "bottom-full mb-2" : "top-full mt-1.5"
            }`}
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              boxShadow: "var(--shadow-popover)",
            }}
            role="listbox"
            aria-label="Select target list"
          >
            {flattenedLists.map((node) => {
              const selected = node.list.id === effectiveTargetListId;
              return (
                <button
                  key={node.list.id}
                  type="button"
                  onClick={() => {
                    onTargetListChange(node.list.id);
                    setListPickerOpen(false);
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{
                    backgroundColor: selected
                      ? "var(--accent-soft)"
                      : "transparent",
                    paddingLeft: `${10 + Math.min(node.depth, 3) * 14}px`,
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CollectionIcon
                      name={node.list.icon}
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: node.list.color || "var(--accent)" }}
                    />
                    <span
                      className="text-xs font-medium truncate"
                      style={{
                        color: selected
                          ? "var(--accent)"
                          : "var(--text-primary)",
                      }}
                    >
                      {node.list.title}
                    </span>
                  </div>
                  {selected && (
                    <Check
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: "var(--accent)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {previewPosition === "top" && previewNode}

      <div
        className={`rounded-2xl border transition-colors ${
          compact ? "p-1.5 space-y-1.5" : "p-2 space-y-1.5"
        }`}
        style={{
          backgroundColor: elevated
            ? "var(--bg-elevated)"
            : "var(--bg-surface)",
          borderColor: elevated
            ? "var(--border-strong)"
            : "var(--border-subtle)",
          boxShadow: elevated ? "var(--shadow-popover)" : "none",
          opacity: hasNoLists ? 0.65 : 1,
        }}
      >
        {/* Top Control Row: Target List Pill + Quick Status Selector + Shortcut Hint */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 min-w-0">
            {targetNode && (
              <button
                type="button"
                onClick={() => setListPickerOpen((o) => !o)}
                aria-expanded={listPickerOpen}
                aria-haspopup="listbox"
                title={
                  targetNode.depth > 0
                    ? `Target list: ${targetNode.pathLabel}`
                    : `Target list: ${targetNode.list.title}`
                }
                className="h-7 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 max-w-[190px] transition-colors hover:bg-[var(--bg-surface-hover)] shrink-0 cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: listPickerOpen
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              >
                <CollectionIcon
                  name={targetNode.list.icon}
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: targetNode.list.color || "var(--accent)" }}
                />
                <span className="truncate">{targetNode.list.title}</span>
                <ChevronDown
                  className="w-3 h-3 shrink-0 opacity-65"
                  style={{ color: "var(--text-muted)" }}
                />
              </button>
            )}

            <div
              className="inline-flex items-center gap-0.5 p-0.5 rounded-lg shrink-0"
              style={{ backgroundColor: "var(--bg-surface-subtle)" }}
              role="tablist"
              aria-label="New item status"
            >
              {visibleStatusOptions.map((opt) => {
                const Icon = opt.icon;
                const active = status === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      onStatusChange(opt.id);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    className="h-6 px-2 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? "var(--bg-surface)"
                        : "transparent",
                      color: active
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                      boxShadow: active
                        ? "0 1px 2px rgba(0,0,0,0.06)"
                        : "none",
                    }}
                  >
                    <Icon
                      className="w-3 h-3 shrink-0"
                      style={{ color: active ? opt.color : "var(--text-muted)" }}
                    />
                    <span className="hidden sm:inline">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <span
            className="hidden md:inline text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0 pr-1"
            style={{ color: "var(--text-muted)" }}
          >
            Type / for list · #tag · due
          </span>
        </div>

        {/* Main Input + Submit Row */}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={value}
            disabled={hasNoLists}
            onChange={(e) => {
              setValue(e.target.value);
              setSlashDismissed(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder={computedPlaceholder}
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:opacity-60 min-h-[36px] px-1.5"
            style={{ color: "var(--text-primary)" }}
            aria-label={computedPlaceholder}
          />

          <button
            type="submit"
            disabled={hasNoLists || !value.trim()}
            className="h-9 px-3 sm:px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-opacity whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer"
            style={{
              backgroundColor:
                value.trim() && !hasNoLists
                  ? "var(--accent)"
                  : "var(--bg-surface-subtle)",
              color:
                value.trim() && !hasNoLists
                  ? "var(--accent-fg)"
                  : "var(--text-muted)",
            }}
          >
            <span className="hidden sm:inline">Add</span>
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {previewPosition === "bottom" && previewNode}
    </form>
  );
};
