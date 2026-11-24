import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ListChecks,
  Quote,
  Search,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import type { ListItemNoteLink } from "../../types";
import { buildListItemNoteLink } from "../../utils/listItemLinks";

interface ListItemLinksPickerProps {
  links: ListItemNoteLink[];
  onChangeLinks: (nextLinks: ListItemNoteLink[]) => void;
  onJumpToListItem?: (listItemId: string) => void;
  onBeforeJump?: () => void;
}

export const ListItemLinksPicker: React.FC<ListItemLinksPickerProps> = ({
  links,
  onChangeLinks,
  onJumpToListItem,
  onBeforeJump,
}) => {
  const { workspace } = useWorkspace();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editingQuoteIdx, setEditingQuoteIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const lists = workspace.lists || [];
  const listItems = workspace.listItems || [];

  const listById = useMemo(
    () => new Map(lists.map((l) => [l.id, l])),
    [lists],
  );
  const itemById = useMemo(
    () => new Map(listItems.map((i) => [i.id, i])),
    [listItems],
  );

  const linkedItemIdSet = useMemo(() => {
    const set = new Set<string>();
    for (const l of links) {
      if (l.listItemId) set.add(l.listItemId);
    }
    return set;
  }, [links]);

  useEffect(() => {
    if (!pickerOpen) {
      setQuery("");
      return;
    }
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerOpen]);

  const groupedSelectableItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groups: Array<{
      listId: string;
      listTitle: string;
      listColor?: string;
      items: typeof listItems;
    }> = [];

    for (const list of lists) {
      const matchingItems = listItems.filter((it) => {
        if (it.listId !== list.id) return false;
        if (!q) return true;
        return (
          (it.title || "").toLowerCase().includes(q) ||
          (it.subtitle || "").toLowerCase().includes(q) ||
          (list.title || "").toLowerCase().includes(q)
        );
      });
      if (matchingItems.length > 0) {
        groups.push({
          listId: list.id,
          listTitle: list.title,
          listColor: list.color,
          items: matchingItems,
        });
      }
    }

    // Include any orphan items whose parent list doesn't match lists array
    const knownListIds = new Set(lists.map((l) => l.id));
    const orphans = listItems.filter((it) => {
      if (knownListIds.has(it.listId)) return false;
      if (!q) return true;
      return (it.title || "").toLowerCase().includes(q);
    });
    if (orphans.length > 0) {
      groups.push({
        listId: "__other__",
        listTitle: "Other Items",
        items: orphans,
      });
    }

    return groups;
  }, [lists, listItems, query]);

  const toggleItem = (itemId: string) => {
    const item = itemById.get(itemId);
    if (!item) return;
    const exists = links.some((l) => l.listItemId === itemId);
    if (exists) {
      onChangeLinks(links.filter((l) => l.listItemId !== itemId));
    } else {
      const parentList = listById.get(item.listId) ?? null;
      onChangeLinks([...links, buildListItemNoteLink(item, parentList)]);
    }
  };

  const removeLinkAt = (idx: number) => {
    if (editingQuoteIdx === idx) setEditingQuoteIdx(null);
    onChangeLinks(links.filter((_, i) => i !== idx));
  };

  const updateQuoteAt = (idx: number, quoteValue: string) => {
    onChangeLinks(
      links.map((l, i) =>
        i === idx
          ? {
              ...l,
              quote: quoteValue.trim() ? quoteValue : undefined,
            }
          : l,
      ),
    );
  };

  return (
    <div ref={containerRef} className="space-y-1.5 -mx-1 px-1">
      {/* Multi-Select Picker Trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1 -mx-1 text-xs font-medium text-left transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          style={{
            color:
              links.length > 0 ? "var(--text-primary)" : "var(--text-muted)",
          }}
        >
          <span className="truncate">
            {links.length === 0
              ? "Link list items..."
              : `${links.length} ${links.length === 1 ? "item" : "items"} linked`}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 opacity-70 transition-transform ${
              pickerOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {pickerOpen && (
          <div
            role="listbox"
            aria-label="Select list items to link"
            aria-multiselectable="true"
            className="mt-1 rounded-xl border overflow-hidden"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div
              className="px-2.5 py-2 border-b flex items-center gap-2"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <Search
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search list items..."
                autoFocus
                className="flex-1 min-w-0 bg-transparent text-xs outline-none"
                style={{ color: "var(--text-primary)" }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="p-0.5 rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="max-h-56 overflow-y-auto overscroll-contain p-1.5 space-y-2">
              {groupedSelectableItems.length === 0 ? (
                <div
                  className="py-5 px-3 text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {listItems.length === 0
                    ? "No list items yet. Create items in Lists first."
                    : "No matching list items."}
                </div>
              ) : (
                groupedSelectableItems.map((group) => (
                  <div key={group.listId} className="space-y-0.5">
                    <div
                      className="px-2 py-0.5 text-[11px] font-medium flex items-center gap-1.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            group.listColor || "var(--text-muted)",
                        }}
                      />
                      <span className="truncate">{group.listTitle}</span>
                    </div>
                    {group.items.map((it) => {
                      const selected = linkedItemIdSet.has(it.id);
                      return (
                        <button
                          key={it.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => toggleItem(it.id)}
                          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                          style={{
                            backgroundColor: selected
                              ? "var(--accent-soft)"
                              : "transparent",
                            color: selected
                              ? "var(--accent)"
                              : "var(--text-primary)",
                          }}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <ListChecks className="w-3.5 h-3.5 shrink-0 opacity-75" />
                            <span className="truncate font-medium">
                              {it.title || "Untitled Item"}
                            </span>
                          </span>
                          {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Linked List Item Rows with List Badge, Jump, Quote & Unlink */}
      {links.length > 0 && (
        <div className="space-y-1.5 pt-0.5">
          {links.map((link, idx) => {
            const liveItem = link.listItemId
              ? itemById.get(link.listItemId) ?? null
              : null;
            const liveList = liveItem
              ? listById.get(liveItem.listId) ?? null
              : link.listId
                ? listById.get(link.listId) ?? null
                : null;
            const isRemoved = !liveItem || Boolean(link.itemRemoved);
            const displayTitle = liveItem?.title || link.itemTitle || "Untitled Item";
            const displayListTitle = liveList?.title || link.listTitle;
            const displayListColor = liveList?.color || link.listColor;
            const isEditingQuote = editingQuoteIdx === idx;

            return (
              <div
                key={link.listItemId || `removed-${idx}-${link.itemTitle}`}
                className="rounded-lg border px-2.5 py-1.5 space-y-1"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {displayListTitle && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium shrink-0 max-w-[120px] truncate"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                displayListColor || "var(--accent)",
                            }}
                          />
                          <span className="truncate">{displayListTitle}</span>
                        </span>
                      )}
                      {displayListTitle && (
                        <span
                          aria-hidden="true"
                          className="text-[11px] shrink-0"
                          style={{ color: "var(--text-muted)" }}
                        >
                          ·
                        </span>
                      )}
                      <span
                        className="text-xs font-medium truncate"
                        style={{
                          color: isRemoved
                            ? "var(--text-muted)"
                            : "var(--text-primary)",
                        }}
                      >
                        {displayTitle}
                        {isRemoved ? " (Removed)" : ""}
                      </span>
                    </div>

                    {!isEditingQuote && link.quote && (
                      <blockquote
                        className="text-[11px] italic line-clamp-2 pt-0.5"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        “{link.quote}”
                      </blockquote>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!isRemoved && liveItem && onJumpToListItem && (
                      <button
                        type="button"
                        onClick={() => {
                          onBeforeJump?.();
                          onJumpToListItem(liveItem.id);
                        }}
                        title={`Open "${displayTitle}" in Lists`}
                        aria-label={`Open "${displayTitle}" in Lists`}
                        className="h-6 px-1.5 rounded inline-flex items-center gap-0.5 text-[11px] font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
                        style={{ color: "var(--accent)" }}
                      >
                        <span>Open</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setEditingQuoteIdx(isEditingQuote ? null : idx)
                      }
                      title={link.quote ? "Edit snapshot quote" : "Add snapshot quote"}
                      aria-label={link.quote ? "Edit snapshot quote" : "Add snapshot quote"}
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{
                        color:
                          link.quote || isEditingQuote
                            ? "var(--accent)"
                            : "var(--text-muted)",
                      }}
                    >
                      <Quote className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLinkAt(idx)}
                      title="Unlink list item"
                      aria-label="Unlink list item"
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {isEditingQuote && (
                  <div className="pt-1 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={link.quote ?? ""}
                      onChange={(e) => updateQuoteAt(idx, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setEditingQuoteIdx(null);
                        }
                      }}
                      placeholder="Optional snapshot quote or excerpt..."
                      autoFocus
                      className="flex-1 min-w-0 h-7 px-2 rounded-md border bg-transparent text-[11px] outline-none focus:border-[var(--accent)]"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setEditingQuoteIdx(null)}
                      className="h-7 px-2 rounded-md text-[11px] font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{ color: "var(--accent)" }}
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
