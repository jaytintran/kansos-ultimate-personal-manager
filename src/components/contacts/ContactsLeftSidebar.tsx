import React, { useMemo, useState } from "react";
import {
  Clock,
  Gift,
  Hash,
  PanelLeftClose,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Users,
  X,
} from "lucide-react";
import { CLOSENESS_TIER_META } from "../../lib/contactUtils";
import type { ContactCircle, ContactClosenessTier } from "../../types/contacts";

export type ContactsScope =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "catchup" }
  | { kind: "milestones" }
  | { kind: "circle"; circleId: string }
  | { kind: "tier"; tier: ContactClosenessTier }
  | { kind: "tag"; tag: string };

const QUICK_CIRCLE_SWATCHES = [
  "#be185d",
  "#b45309",
  "#3b6998",
  "#047857",
  "#4f46e5",
  "#0f766e",
];

interface ContactsLeftSidebarProps {
  scope: ContactsScope;
  onSelectScope: (scope: ContactsScope) => void;
  totalCount: number;
  favoritesCount: number;
  catchUpCount: number;
  milestonesCount: number;
  tierCounts: Record<ContactClosenessTier, number>;
  circles: ContactCircle[];
  circleCounts: Map<string, number>;
  tags: { name: string; count: number }[];
  isCollapsedDesktop: boolean;
  onCollapseDesktop: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onCreateCircle: (name: string, color: string) => ContactCircle;
  onOpenManageCircles: () => void;
}

const TIER_ORDER: ContactClosenessTier[] = [
  "inner",
  "close",
  "regular",
  "acquaintance",
];

export const ContactsLeftSidebar: React.FC<ContactsLeftSidebarProps> = ({
  scope,
  onSelectScope,
  totalCount,
  favoritesCount,
  catchUpCount,
  milestonesCount,
  tierCounts,
  circles,
  circleCounts,
  tags,
  isCollapsedDesktop,
  onCollapseDesktop,
  isOpenMobile,
  onCloseMobile,
  onCreateCircle,
  onOpenManageCircles,
}) => {
  const [filterText, setFilterText] = useState("");
  const [addingCircle, setAddingCircle] = useState(false);
  const [newCircleName, setNewCircleName] = useState("");
  const [newCircleColor, setNewCircleColor] = useState(
    QUICK_CIRCLE_SWATCHES[0],
  );

  const normalizedFilter = filterText.trim().toLowerCase();

  const visibleCircles = useMemo(() => {
    if (!normalizedFilter) return circles;
    return circles.filter((c) =>
      c.name.toLowerCase().includes(normalizedFilter),
    );
  }, [circles, normalizedFilter]);

  const visibleTags = useMemo(() => {
    if (!normalizedFilter) return tags;
    return tags.filter((t) =>
      t.name.toLowerCase().includes(normalizedFilter),
    );
  }, [tags, normalizedFilter]);

  const selectAndClose = (next: ContactsScope) => {
    onSelectScope(next);
    onCloseMobile();
  };

  const handleQuickCreateCircle = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCircleName.trim();
    if (!trimmed) return;
    const created = onCreateCircle(trimmed, newCircleColor);
    setNewCircleName("");
    setAddingCircle(false);
    selectAndClose({ kind: "circle", circleId: created.id });
  };

  const isScopeActive = (candidate: ContactsScope): boolean => {
    if (scope.kind !== candidate.kind) return false;
    if (scope.kind === "circle" && candidate.kind === "circle") {
      return scope.circleId === candidate.circleId;
    }
    if (scope.kind === "tier" && candidate.kind === "tier") {
      return scope.tier === candidate.tier;
    }
    if (scope.kind === "tag" && candidate.kind === "tag") {
      return scope.tag === candidate.tag;
    }
    return true;
  };

  const renderNavRow = (
    key: string,
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    label: string,
    count: number,
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className="w-full h-9 px-2.5 rounded-xl flex items-center justify-between gap-2 text-xs font-medium transition-colors cursor-pointer"
      style={{
        backgroundColor: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-secondary)",
      }}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 flex items-center justify-center">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span
        className="text-[11px] font-mono tabular-nums shrink-0"
        style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
      >
        {count}
      </span>
    </button>
  );

  const railBody = (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--bg-surface)" }}
    >
      {/* Rail Top Header */}
      <div
        className="px-3.5 py-3 border-b flex items-center justify-between gap-2 shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider truncate"
          style={{ color: "var(--text-muted)" }}
        >
          Directory
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenManageCircles}
            className="h-7 px-2 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
            title="Manage circles"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>Circles</span>
          </button>
          <button
            type="button"
            onClick={isOpenMobile ? onCloseMobile : onCollapseDesktop}
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            aria-label={isOpenMobile ? "Close directory menu" : "Collapse sidebar"}
          >
            {isOpenMobile ? (
              <X className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Rail Quick Filter */}
      <div className="px-3 pt-2.5 pb-1.5 shrink-0">
        <div className="relative">
          <Search
            className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter circles or tags..."
            className="w-full h-8 pl-8 pr-7 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-subtle)",
            }}
          />
          {filterText && (
            <button
              type="button"
              onClick={() => setFilterText("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded"
              style={{ color: "var(--text-muted)" }}
              aria-label="Clear sidebar filter"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Rail Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 space-y-5">
        {/* Smart Views */}
        {!normalizedFilter && (
          <section className="space-y-0.5">
            <div
              className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Views
            </div>
            {renderNavRow(
              "all",
              isScopeActive({ kind: "all" }),
              () => selectAndClose({ kind: "all" }),
              <Users className="w-3.5 h-3.5" />,
              "All Contacts",
              totalCount,
            )}
            {renderNavRow(
              "favorites",
              isScopeActive({ kind: "favorites" }),
              () => selectAndClose({ kind: "favorites" }),
              <Star className="w-3.5 h-3.5" />,
              "Favorites",
              favoritesCount,
            )}
            {renderNavRow(
              "catchup",
              isScopeActive({ kind: "catchup" }),
              () => selectAndClose({ kind: "catchup" }),
              <Clock className="w-3.5 h-3.5" />,
              "Needs Catch-Up",
              catchUpCount,
            )}
            {renderNavRow(
              "milestones",
              isScopeActive({ kind: "milestones" }),
              () => selectAndClose({ kind: "milestones" }),
              <Gift className="w-3.5 h-3.5" />,
              "Upcoming Milestones",
              milestonesCount,
            )}
          </section>
        )}

        {/* Circles */}
        <section className="space-y-1">
          <div className="px-2 flex items-center justify-between">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Circles
            </span>
            <button
              type="button"
              onClick={() => setAddingCircle((v) => !v)}
              className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              style={{ color: "var(--accent)" }}
              title="Create new circle"
              aria-label="Create new circle"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {addingCircle && (
            <form
              onSubmit={handleQuickCreateCircle}
              className="mx-1 p-2 rounded-xl border space-y-2"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <input
                type="text"
                value={newCircleName}
                onChange={(e) => setNewCircleName(e.target.value)}
                placeholder="Circle name..."
                autoFocus
                className="w-full h-7 px-2 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              />
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1">
                  {QUICK_CIRCLE_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setNewCircleColor(hex)}
                      className={`w-4 h-4 rounded-full border cursor-pointer ${
                        newCircleColor === hex ? "scale-110" : "opacity-75"
                      }`}
                      style={{
                        backgroundColor: hex,
                        borderColor:
                          newCircleColor === hex
                            ? "var(--text-primary)"
                            : "transparent",
                      }}
                      aria-label={`Circle color ${hex}`}
                    />
                  ))}
                </div>
                <button
                  type="submit"
                  className="h-6 px-2.5 rounded-md text-[11px] font-semibold cursor-pointer"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  Add
                </button>
              </div>
            </form>
          )}

          {visibleCircles.length === 0 ? (
            <div
              className="px-2 py-1.5 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              No circles found
            </div>
          ) : (
            <div className="space-y-0.5">
              {visibleCircles.map((cir) =>
                renderNavRow(
                  cir.id,
                  isScopeActive({ kind: "circle", circleId: cir.id }),
                  () => selectAndClose({ kind: "circle", circleId: cir.id }),
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cir.color }}
                  />,
                  cir.name,
                  circleCounts.get(cir.id) ?? 0,
                ),
              )}
            </div>
          )}
        </section>

        {/* Closeness Tiers */}
        {!normalizedFilter && (
          <section className="space-y-0.5">
            <div
              className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Closeness
            </div>
            {TIER_ORDER.map((tier) => {
              const meta = CLOSENESS_TIER_META[tier];
              return renderNavRow(
                tier,
                isScopeActive({ kind: "tier", tier }),
                () => selectAndClose({ kind: "tier", tier }),
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: meta.color }}
                />,
                meta.label,
                tierCounts[tier] ?? 0,
              );
            })}
          </section>
        )}

        {/* Tags */}
        {visibleTags.length > 0 && (
          <section className="space-y-0.5">
            <div
              className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Tags
            </div>
            {visibleTags.map((tag) =>
              renderNavRow(
                tag.name,
                isScopeActive({ kind: "tag", tag: tag.name }),
                () => selectAndClose({ kind: "tag", tag: tag.name }),
                <Hash className="w-3.5 h-3.5" />,
                tag.name,
                tag.count,
              ),
            )}
          </section>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Rail */}
      {!isCollapsedDesktop && (
        <aside
          className="hidden lg:flex lg:flex-col w-[248px] shrink-0 border-r h-full min-h-0 overflow-hidden"
          style={{ borderColor: "var(--border-subtle)" }}
          aria-label="Contacts directory sidebar"
        >
          {railBody}
        </aside>
      )}

      {/* Mobile Slide-Over Drawer */}
      {isOpenMobile && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex overscroll-none"
          role="dialog"
          aria-modal="true"
          aria-label="Circles and filters"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div
            className="relative z-10 w-[280px] max-w-[85vw] h-dvh pt-safe pb-safe border-r shadow-xl"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            {railBody}
          </div>
        </div>
      )}
    </>
  );
};
