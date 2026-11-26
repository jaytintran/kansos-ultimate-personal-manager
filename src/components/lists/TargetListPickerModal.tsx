import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import type { ListCollection } from "../../types";
import { flattenListTree } from "../../lib/listTree";
import { ListIcon as CollectionIcon } from "../IconLibrary";
import { BottomSheet } from "../ui/BottomSheet";

interface TargetListPickerModalProps {
  open: boolean;
  isDesktop: boolean;
  lists: ListCollection[];
  listItemCounts: Map<string, number>;
  defaultListId: string | null;
  onClose: () => void;
  onSelectList: (listId: string, title?: string) => void;
  onCreateList: () => void;
}

export const TargetListPickerModal: React.FC<TargetListPickerModalProps> = ({
  open,
  isDesktop,
  lists,
  listItemCounts,
  defaultListId,
  onClose,
  onSelectList,
  onCreateList,
}) => {
  const [titleDraft, setTitleDraft] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitleDraft("");
    setFilterQuery("");
    const timer = window.setTimeout(() => {
      titleInputRef.current?.focus();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !isDesktop) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isDesktop, onClose]);

  const flattenedNodes = useMemo(() => flattenListTree(lists), [lists]);

  const orderedNodes = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return flattenedNodes;
    return flattenedNodes.filter(
      (n) =>
        n.list.title.toLowerCase().includes(q) ||
        n.pathLabel.toLowerCase().includes(q),
    );
  }, [flattenedNodes, filterQuery]);

  const fallbackTargetListId = useMemo(() => {
    if (
      defaultListId &&
      orderedNodes.some((n) => n.list.id === defaultListId)
    ) {
      return defaultListId;
    }
    return orderedNodes[0]?.list.id || lists[0]?.id || null;
  }, [defaultListId, orderedNodes, lists]);

  const handleConfirmWithList = (listId: string) => {
    const cleanTitle = titleDraft.trim();
    onSelectList(listId, cleanTitle || undefined);
  };

  const pickerBody = (
    <div className="p-4 space-y-3">
      {lists.length === 0 ? (
        <div
          className="rounded-xl border border-dashed py-8 px-4 text-center space-y-3"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <p className="text-xs">
            Create a list first so your new item has a collection to live in.
          </p>
          <button
            type="button"
            onClick={() => {
              onClose();
              onCreateList();
            }}
            className="h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New List</span>
          </button>
        </div>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (fallbackTargetListId) {
                handleConfirmWithList(fallbackTargetListId);
              }
            }}
            className="space-y-1.5"
          >
            <label
              htmlFor="kanso-target-list-item-title"
              className="block text-[11px] font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Item title (optional)
            </label>
            <input
              id="kanso-target-list-item-title"
              ref={titleInputRef}
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="e.g. Designing Data-Intensive Applications, #research..."
              className="w-full h-10 sm:h-9 px-3 rounded-lg border text-sm sm:text-xs outline-none transition-colors focus:border-[var(--accent)]"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            />
          </form>

          {lists.length > 5 && (
            <div
              className="flex items-center gap-2 h-9 sm:h-8 px-2.5 rounded-lg border"
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
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Search lists..."
                className="flex-1 min-w-0 bg-transparent text-xs outline-none"
                style={{ color: "var(--text-primary)" }}
              />
              {filterQuery && (
                <button
                  type="button"
                  onClick={() => setFilterQuery("")}
                  aria-label="Clear search"
                  className="p-0.5 opacity-70 hover:opacity-100 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <div className="space-y-1">
            <div
              className="text-[11px] font-medium px-1"
              style={{ color: "var(--text-muted)" }}
            >
              Choose target list
            </div>
            <div className="max-h-[46dvh] lg:max-h-[300px] overflow-y-auto overscroll-none space-y-1 pr-0.5">
              {orderedNodes.length === 0 ? (
                <p
                  className="py-6 text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  No lists match &ldquo;{filterQuery}&rdquo;
                </p>
              ) : (
                orderedNodes.map((node) => {
                  const list = node.list;
                  const isDefault = list.id === defaultListId;
                  const count = listItemCounts.get(list.id) || 0;
                  const color = list.color || "#4f46e5";

                  return (
                    <button
                      key={list.id}
                      type="button"
                      onClick={() => handleConfirmWithList(list.id)}
                      className="w-full min-h-[44px] lg:min-h-[38px] pr-3 py-2 rounded-xl border text-left flex items-center justify-between gap-2.5 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{
                        paddingLeft: `${12 + Math.min(node.depth, 5) * 16}px`,
                        backgroundColor: isDefault
                          ? "var(--accent-soft)"
                          : "var(--bg-surface)",
                        borderColor: isDefault
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                      }}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: `${color}1c`,
                            color,
                          }}
                        >
                          <CollectionIcon
                            name={list.icon}
                            className="w-3.5 h-3.5"
                          />
                        </span>
                        <span className="min-w-0">
                          <span
                            className="block text-xs font-semibold truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {list.title}
                          </span>
                          {(node.depth > 0 || isDefault) && (
                            <span
                              className="block text-[11px] truncate"
                              style={{
                                color: isDefault
                                  ? "var(--accent)"
                                  : "var(--text-muted)",
                              }}
                            >
                              {isDefault && node.depth > 0
                                ? `Current · ${node.pathLabel}`
                                : isDefault
                                  ? "Current list"
                                  : node.pathLabel}
                            </span>
                          )}
                        </span>
                      </span>

                      <span className="flex items-center gap-2 shrink-0">
                        <span
                          className="text-[11px] font-mono tabular-nums"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {count}
                        </span>
                        {isDefault && (
                          <Check
                            className="w-3.5 h-3.5"
                            style={{ color: "var(--accent)" }}
                          />
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );

  if (!open) return null;

  if (!isDesktop) {
    return (
      <BottomSheet
        isOpen={open}
        onClose={onClose}
        title="New List Item Tab"
        subtitle="Pick a target list to create and open this item"
        ariaLabel="Choose target list for new item tab"
      >
        {pickerBody}
      </BottomSheet>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose target list for new item tab"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden flex flex-col"
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
            <h2
              className="font-display text-sm font-semibold truncate"
              style={{ color: "var(--text-primary)" }}
            >
              New List Item Tab
            </h2>
            <p
              className="text-[11px] truncate mt-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              Pick a target list to create and open this item
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close target list picker"
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {pickerBody}
      </div>
    </div>
  );
};
