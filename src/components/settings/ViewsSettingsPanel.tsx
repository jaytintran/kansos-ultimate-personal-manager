import React, { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Monitor,
  Pin,
  PinOff,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import {
  MOBILE_PRIMARY_SLOT_OPTIONS,
  moveDesktopViewToGroup,
  moveDesktopViewWithinGroup,
  moveMobileViewAcrossLists,
  moveMobileViewWithinList,
  resolveNavigationConfig,
  setMobilePrimarySlotLimit,
  toggleViewVisibilityInNav,
  VIEW_META_MAP,
} from "../../lib/viewNavigation";
import type { ViewId, WorkspaceNavigationSettings } from "../../types";

interface ViewsSettingsPanelProps {
  navigation?: WorkspaceNavigationSettings;
  defaultView?: ViewId;
  onUpdateNavigation: (next: WorkspaceNavigationSettings | undefined) => void;
  onUpdateDefaultView?: (nextDefault: ViewId) => void;
  onToast: (text: string, tone?: "neutral" | "success" | "error") => void;
}

type ViewsPanelScope = "desktop" | "mobile";

export const ViewsSettingsPanel: React.FC<ViewsSettingsPanelProps> = ({
  navigation,
  defaultView = "focus",
  onUpdateNavigation,
  onToast,
}) => {
  const [scope, setScope] = useState<ViewsPanelScope>("desktop");

  const resolved = useMemo(
    () => resolveNavigationConfig(navigation),
    [navigation],
  );

  const totalViewsCount = resolved.desktopGroupsAll.reduce(
    (sum, g) => sum + g.length,
    0,
  );
  const enabledCount = resolved.enabledViews.length;
  const hiddenCount = resolved.hiddenViews.length;
  const isCustomLayout = Boolean(navigation);

  const handleToggleView = (viewId: ViewId) => {
    const isCurrentlyHidden = resolved.hiddenSet.has(viewId);
    if (!isCurrentlyHidden && enabledCount <= 1) {
      onToast("At least 1 view must stay active", "error");
      return;
    }
    const next = toggleViewVisibilityInNav(navigation, viewId);
    onUpdateNavigation(next);
  };

  const handleResetLayout = () => {
    onUpdateNavigation(undefined);
    onToast("Restored default view visibility & order", "success");
  };

  const renderVisibilitySwitch = (viewId: ViewId) => {
    const isHidden = resolved.hiddenSet.has(viewId);
    const isEnabled = !isHidden;
    const lockedLast = isEnabled && enabledCount <= 1;
    const meta = VIEW_META_MAP[viewId];

    return (
      <button
        type="button"
        role="switch"
        aria-checked={isEnabled}
        aria-label={
          lockedLast
            ? `${meta.label} cannot be hidden because at least 1 view must remain active`
            : `${isEnabled ? "Hide" : "Show"} ${meta.label}`
        }
        title={
          lockedLast
            ? "At least 1 view must stay active"
            : isEnabled
              ? `Temporarily hide ${meta.label}`
              : `Show ${meta.label}`
        }
        disabled={lockedLast}
        onClick={() => handleToggleView(viewId)}
        className="h-6 w-10 rounded-full p-0.5 transition-colors flex items-center shrink-0 disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
        style={{
          backgroundColor: isEnabled
            ? "var(--accent)"
            : "var(--border-strong)",
          justifyContent: isEnabled ? "flex-end" : "flex-start",
        }}
      >
        <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Status & Reset Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">
            Navigation Views &amp; Layout
          </div>
          <div
            className="text-xs font-mono tabular-nums mt-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {enabledCount} of {totalViewsCount} active
            {hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""} · Syncs via Gist
          </div>
        </div>

        <button
          type="button"
          disabled={!isCustomLayout}
          onClick={handleResetLayout}
          className="h-8 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface-subtle)] disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-secondary)",
          }}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Default</span>
        </button>
      </div>

      {/* Platform Scope Switcher */}
      <div
        className="grid grid-cols-2 gap-1 p-1 rounded-xl border"
        style={{
          backgroundColor: "var(--bg-surface-subtle)",
          borderColor: "var(--border-subtle)",
        }}
        role="tablist"
        aria-label="Choose navigation customization target"
      >
        <button
          type="button"
          role="tab"
          aria-selected={scope === "desktop"}
          onClick={() => setScope("desktop")}
          className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
          style={{
            backgroundColor:
              scope === "desktop" ? "var(--bg-surface)" : "transparent",
            color:
              scope === "desktop" ? "var(--accent)" : "var(--text-secondary)",
            boxShadow:
              scope === "desktop" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
          }}
        >
          <Monitor className="w-3.5 h-3.5 shrink-0" />
          <span>Desktop Groups &amp; Visibility</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={scope === "mobile"}
          onClick={() => setScope("mobile")}
          className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
          style={{
            backgroundColor:
              scope === "mobile" ? "var(--bg-surface)" : "transparent",
            color:
              scope === "mobile" ? "var(--accent)" : "var(--text-secondary)",
            boxShadow:
              scope === "mobile" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
          }}
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span>Mobile Bar &amp; More</span>
        </button>
      </div>

      {/* Note about preserving data when hiding */}
      <div
        className="px-3.5 py-2.5 rounded-xl border text-xs leading-relaxed"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-secondary)",
        }}
      >
        Turning off a view hides it from navigation while keeping all notes,
        entries, contacts, and financial records safely stored.{" "}
        {resolved.hiddenSet.has(defaultView) && (
          <span style={{ color: "var(--accent)" }}>
            Startup view ({VIEW_META_MAP[defaultView]?.label}) is currently
            hidden — launching opens{" "}
            {VIEW_META_MAP[resolved.resolveSafeView(defaultView)]?.label}{" "}
            instead.
          </span>
        )}
      </div>

      {/* ================= DESKTOP GROUPS & VISIBILITY ================= */}
      {scope === "desktop" && (
        <div className="space-y-3">
          {resolved.desktopGroupsAll.map((group, groupIdx) => {
            const groupVisibleCount = group.filter(
              (id) => !resolved.hiddenSet.has(id),
            ).length;

            return (
              <section
                key={`desktop-group-${groupIdx}`}
                className="rounded-xl border overflow-hidden"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div
                  className="px-3.5 py-2 border-b flex items-center justify-between gap-2"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Sidebar Group {groupIdx + 1}
                  </span>
                  <span
                    className="text-[11px] font-mono tabular-nums"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {groupVisibleCount}/{group.length} visible
                  </span>
                </div>

                <div
                  className="divide-y"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  {group.map((viewId, itemIdx) => {
                    const meta = VIEW_META_MAP[viewId];
                    const Icon = meta.icon;
                    const isHidden = resolved.hiddenSet.has(viewId);

                    return (
                      <div
                        key={viewId}
                        className="px-3.5 py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5"
                        style={{
                          borderColor: "var(--border-subtle)",
                          opacity: isHidden ? 0.65 : 1,
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: isHidden
                                ? "var(--bg-surface-subtle)"
                                : "var(--accent-soft)",
                              color: isHidden
                                ? "var(--text-muted)"
                                : "var(--accent)",
                            }}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold truncate">
                                {meta.label}
                              </span>
                              {isHidden && (
                                <span
                                  className="text-[11px]"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  · Hidden
                                </span>
                              )}
                            </div>
                            <div
                              className="text-[11px] truncate"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {meta.description}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                          <button
                            type="button"
                            disabled={itemIdx === 0}
                            onClick={() =>
                              onUpdateNavigation(
                                moveDesktopViewWithinGroup(
                                  navigation,
                                  groupIdx,
                                  itemIdx,
                                  -1,
                                ),
                              )
                            }
                            className="h-8 w-8 rounded-lg border flex items-center justify-center hover:bg-[var(--bg-surface-subtle)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                            style={{
                              backgroundColor: "var(--bg-elevated)",
                              borderColor: "var(--border-subtle)",
                              color: "var(--text-secondary)",
                            }}
                            title={`Move ${meta.label} up`}
                            aria-label={`Move ${meta.label} up`}
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={itemIdx === group.length - 1}
                            onClick={() =>
                              onUpdateNavigation(
                                moveDesktopViewWithinGroup(
                                  navigation,
                                  groupIdx,
                                  itemIdx,
                                  1,
                                ),
                              )
                            }
                            className="h-8 w-8 rounded-lg border flex items-center justify-center hover:bg-[var(--bg-surface-subtle)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                            style={{
                              backgroundColor: "var(--bg-elevated)",
                              borderColor: "var(--border-subtle)",
                              color: "var(--text-secondary)",
                            }}
                            title={`Move ${meta.label} down`}
                            aria-label={`Move ${meta.label} down`}
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          <select
                            value={groupIdx}
                            onChange={(e) =>
                              onUpdateNavigation(
                                moveDesktopViewToGroup(
                                  navigation,
                                  viewId,
                                  Number(e.target.value),
                                ),
                              )
                            }
                            aria-label={`Group for ${meta.label}`}
                            className="h-8 px-2 rounded-lg border text-[11px] font-medium outline-none cursor-pointer"
                            style={{
                              backgroundColor: "var(--bg-elevated)",
                              borderColor: "var(--border-subtle)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {resolved.desktopGroupsAll.map((_, gi) => (
                              <option key={gi} value={gi}>
                                Group {gi + 1}
                              </option>
                            ))}
                            {resolved.desktopGroupsAll.length < 6 && (
                              <option value={resolved.desktopGroupsAll.length}>
                                + New Group
                              </option>
                            )}
                          </select>

                          <div className="pl-1">
                            {renderVisibilitySwitch(viewId)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ================= MOBILE BOTTOM BAR & MORE SHEET ================= */}
      {scope === "mobile" && (
        <div className="space-y-4">
          {/* Bottom Bar Capacity Selector */}
          <section
            className="rounded-xl border p-3.5 flex flex-wrap items-center justify-between gap-3"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold">
                Bottom Bar Capacity
              </div>
              <div
                className="text-[11px] mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                {resolved.mobilePrimaryMaxSlots} view tabs beside More (
                {resolved.mobilePrimaryMaxSlots + 1} buttons total
                {resolved.mobilePrimaryMaxSlots >= 6 ? " · icons only" : ""})
              </div>
            </div>

            <div
              className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 rounded-xl border w-full sm:w-auto shrink-0"
              style={{
                backgroundColor: "var(--bg-surface-subtle)",
                borderColor: "var(--border-subtle)",
              }}
              role="radiogroup"
              aria-label="Mobile bottom bar view tab slots"
            >
              {MOBILE_PRIMARY_SLOT_OPTIONS.map((slotCount) => {
                const selected = resolved.mobilePrimaryMaxSlots === slotCount;
                return (
                  <button
                    key={slotCount}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() =>
                      onUpdateNavigation(
                        setMobilePrimarySlotLimit(navigation, slotCount),
                      )
                    }
                    className="h-8 px-2.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer text-center"
                    style={{
                      backgroundColor: selected
                        ? "var(--bg-surface)"
                        : "transparent",
                      color: selected
                        ? "var(--accent)"
                        : "var(--text-secondary)",
                      boxShadow: selected
                        ? "0 1px 2px rgba(0,0,0,0.06)"
                        : "none",
                    }}
                  >
                    {slotCount} tabs ({slotCount + 1})
                  </button>
                );
              })}
            </div>
          </section>

          {/* Mobile Primary Bottom Bar */}
          <section
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div
              className="px-3.5 py-2 border-b flex items-center justify-between gap-2"
              style={{
                backgroundColor: "var(--bg-surface-subtle)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div>
                <span
                  className="text-xs font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Mobile Bottom Bar
                </span>
                <span
                  className="text-[11px] ml-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  · Up to {resolved.mobilePrimaryMaxSlots} tabs beside More
                </span>
              </div>
              <span
                className="text-[11px] font-mono tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                {resolved.mobilePrimaryAll.length}/
                {resolved.mobilePrimaryMaxSlots} slots
              </span>
            </div>

            {resolved.mobilePrimaryAll.length === 0 ? (
              <div
                className="p-4 text-center text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                No views pinned to the Mobile Bottom Bar. Pin views from More
                Sheet below.
              </div>
            ) : (
              <div
                className="divide-y"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {resolved.mobilePrimaryAll.map((viewId, idx) => {
                  const meta = VIEW_META_MAP[viewId];
                  const Icon = meta.icon;
                  const isHidden = resolved.hiddenSet.has(viewId);

                  return (
                    <div
                      key={viewId}
                      className="px-3.5 py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5"
                      style={{
                        borderColor: "var(--border-subtle)",
                        opacity: isHidden ? 0.65 : 1,
                      }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className="w-5 text-[11px] font-mono tabular-nums text-center shrink-0"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {idx + 1}
                        </span>
                        <Icon
                          className="w-4 h-4 shrink-0"
                          style={{
                            color: isHidden
                              ? "var(--text-muted)"
                              : "var(--accent)",
                          }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">
                            {meta.label}
                            {isHidden && (
                              <span
                                className="font-normal ml-1.5"
                                style={{ color: "var(--text-muted)" }}
                              >
                                · Hidden
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() =>
                            onUpdateNavigation(
                              moveMobileViewWithinList(
                                navigation,
                                "primary",
                                idx,
                                -1,
                              ),
                            )
                          }
                          className="h-8 w-8 rounded-lg border flex items-center justify-center hover:bg-[var(--bg-surface-subtle)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                          style={{
                            backgroundColor: "var(--bg-elevated)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-secondary)",
                          }}
                          title={`Move ${meta.label} left/up`}
                          aria-label={`Move ${meta.label} up in bottom bar`}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          disabled={
                            idx === resolved.mobilePrimaryAll.length - 1
                          }
                          onClick={() =>
                            onUpdateNavigation(
                              moveMobileViewWithinList(
                                navigation,
                                "primary",
                                idx,
                                1,
                              ),
                            )
                          }
                          className="h-8 w-8 rounded-lg border flex items-center justify-center hover:bg-[var(--bg-surface-subtle)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                          style={{
                            backgroundColor: "var(--bg-elevated)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-secondary)",
                          }}
                          title={`Move ${meta.label} right/down`}
                          aria-label={`Move ${meta.label} down in bottom bar`}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            onUpdateNavigation(
                              moveMobileViewAcrossLists(
                                navigation,
                                viewId,
                                "more",
                              ),
                            )
                          }
                          className="h-8 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-subtle)] whitespace-nowrap cursor-pointer"
                          style={{
                            backgroundColor: "var(--bg-elevated)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-secondary)",
                          }}
                          title="Move to Mobile More sheet"
                        >
                          <PinOff className="w-3 h-3" />
                          <span>To More</span>
                        </button>

                        <div className="pl-1">
                          {renderVisibilitySwitch(viewId)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Mobile More Drawer */}
          <section
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div
              className="px-3.5 py-2 border-b flex items-center justify-between gap-2"
              style={{
                backgroundColor: "var(--bg-surface-subtle)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div>
                <span
                  className="text-xs font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Mobile More Sheet
                </span>
                {resolved.mobilePrimaryAll.length >=
                  resolved.mobilePrimaryMaxSlots && (
                  <span
                    className="text-[11px] ml-2"
                    style={{ color: "var(--text-muted)" }}
                  >
                    · Pinning swaps with slot {resolved.mobilePrimaryMaxSlots}
                  </span>
                )}
              </div>
              <span
                className="text-[11px] font-mono tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                {resolved.mobileMoreAll.length} views
              </span>
            </div>

            <div
              className="divide-y"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              {resolved.mobileMoreAll.map((viewId, idx) => {
                const meta = VIEW_META_MAP[viewId];
                const Icon = meta.icon;
                const isHidden = resolved.hiddenSet.has(viewId);

                return (
                  <div
                    key={viewId}
                    className="px-3.5 py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5"
                    style={{
                      borderColor: "var(--border-subtle)",
                      opacity: isHidden ? 0.65 : 1,
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <Icon
                        className="w-4 h-4 shrink-0"
                        style={{
                          color: isHidden
                            ? "var(--text-muted)"
                            : "var(--text-secondary)",
                        }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">
                          {meta.label}
                          {isHidden && (
                            <span
                              className="font-normal ml-1.5"
                              style={{ color: "var(--text-muted)" }}
                            >
                              · Hidden
                            </span>
                          )}
                        </div>
                        <div
                          className="text-[11px] truncate"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {meta.description}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() =>
                          onUpdateNavigation(
                            moveMobileViewWithinList(
                              navigation,
                              "more",
                              idx,
                              -1,
                            ),
                          )
                        }
                        className="h-8 w-8 rounded-lg border flex items-center justify-center hover:bg-[var(--bg-surface-subtle)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-secondary)",
                        }}
                        title={`Move ${meta.label} up`}
                        aria-label={`Move ${meta.label} up in More sheet`}
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={idx === resolved.mobileMoreAll.length - 1}
                        onClick={() =>
                          onUpdateNavigation(
                            moveMobileViewWithinList(
                              navigation,
                              "more",
                              idx,
                              1,
                            ),
                          )
                        }
                        className="h-8 w-8 rounded-lg border flex items-center justify-center hover:bg-[var(--bg-surface-subtle)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-secondary)",
                        }}
                        title={`Move ${meta.label} down`}
                        aria-label={`Move ${meta.label} down in More sheet`}
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onUpdateNavigation(
                            moveMobileViewAcrossLists(
                              navigation,
                              viewId,
                              "primary",
                            ),
                          )
                        }
                        className="h-8 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-subtle)] whitespace-nowrap cursor-pointer"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--accent)",
                        }}
                        title="Pin to Mobile Bottom Bar"
                      >
                        <Pin className="w-3 h-3" />
                        <span>Pin to Bar</span>
                      </button>

                      <div className="pl-1">
                        {renderVisibilitySwitch(viewId)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
