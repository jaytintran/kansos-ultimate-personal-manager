import React, { useState } from "react";
import {
  CalendarDays,
  Check,
  Maximize2,
  Monitor,
  PanelRight,
  Smartphone,
  Square,
  Zap,
} from "lucide-react";
import {
  DESKTOP_NEW_EVENT_OPTIONS,
  DesktopNewEventUiMode,
  EventComposerPreferences,
  MOBILE_NEW_EVENT_OPTIONS,
  MobileNewEventUiMode,
} from "../../lib/eventComposerPrefs";

interface EventComposerStylePickerProps {
  prefs: EventComposerPreferences;
  onChangePrefs: (next: EventComposerPreferences) => void;
  defaultScope?: "desktop" | "mobile";
  compact?: boolean;
  onLaunchNow?: () => void;
}

function getDesktopIcon(id: DesktopNewEventUiMode) {
  switch (id) {
    case "modal":
      return Square;
    case "drawer":
      return PanelRight;
    case "calendar-studio":
      return CalendarDays;
    case "quick-bar":
      return Zap;
    case "full-sheet":
      return Maximize2;
  }
}

function getMobileIcon(id: MobileNewEventUiMode) {
  switch (id) {
    case "sheet":
      return PanelRight;
    case "calendar-studio":
      return CalendarDays;
    case "quick-dock":
      return Zap;
    case "modal":
      return Square;
    case "full-sheet":
      return Maximize2;
  }
}

export const EventComposerStylePicker: React.FC<
  EventComposerStylePickerProps
> = ({
  prefs,
  onChangePrefs,
  defaultScope = "desktop",
  compact = false,
  onLaunchNow,
}) => {
  const [scope, setScope] = useState<"desktop" | "mobile">(defaultScope);

  return (
    <div className={compact ? "space-y-2.5" : "space-y-3"}>
      {/* Platform Tab Switcher */}
      <div
        className="grid grid-cols-2 gap-1 p-1 rounded-xl border"
        style={{
          backgroundColor: "var(--bg-surface-subtle)",
          borderColor: "var(--border-subtle)",
        }}
        role="tablist"
        aria-label="Choose platform for New Event UI"
      >
        <button
          type="button"
          role="tab"
          aria-selected={scope === "desktop"}
          onClick={() => setScope("desktop")}
          className="h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
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
          <span>Desktop UI</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={scope === "mobile"}
          onClick={() => setScope("mobile")}
          className="h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
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
          <span>Mobile UI</span>
        </button>
      </div>

      {/* Options List */}
      <div className="space-y-1.5">
        {scope === "desktop"
          ? DESKTOP_NEW_EVENT_OPTIONS.map((opt) => {
              const Icon = getDesktopIcon(opt.id);
              const active = prefs.desktopMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    onChangePrefs({ ...prefs, desktopMode: opt.id })
                  }
                  className={`w-full text-left rounded-xl border transition-colors flex items-start gap-2.5 cursor-pointer ${
                    compact ? "p-2.5" : "p-3"
                  }`}
                  style={{
                    backgroundColor: active
                      ? "var(--accent-soft)"
                      : "var(--bg-surface)",
                    borderColor: active
                      ? "var(--accent)"
                      : "var(--border-subtle)",
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      backgroundColor: active
                        ? "var(--accent)"
                        : "var(--bg-surface-subtle)",
                      color: active ? "var(--accent-fg)" : "var(--text-muted)",
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-xs font-semibold truncate"
                        style={{
                          color: active
                            ? "var(--accent)"
                            : "var(--text-primary)",
                        }}
                      >
                        {opt.label}
                      </span>
                      {active && (
                        <Check
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: "var(--accent)" }}
                        />
                      )}
                    </div>
                    <p
                      className="text-[11px] leading-snug mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {opt.description}
                    </p>
                  </div>
                </button>
              );
            })
          : MOBILE_NEW_EVENT_OPTIONS.map((opt) => {
              const Icon = getMobileIcon(opt.id);
              const active = prefs.mobileMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    onChangePrefs({ ...prefs, mobileMode: opt.id })
                  }
                  className={`w-full text-left rounded-xl border transition-colors flex items-start gap-2.5 cursor-pointer ${
                    compact ? "p-2.5" : "p-3"
                  }`}
                  style={{
                    backgroundColor: active
                      ? "var(--accent-soft)"
                      : "var(--bg-surface)",
                    borderColor: active
                      ? "var(--accent)"
                      : "var(--border-subtle)",
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      backgroundColor: active
                        ? "var(--accent)"
                        : "var(--bg-surface-subtle)",
                      color: active ? "var(--accent-fg)" : "var(--text-muted)",
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-xs font-semibold truncate"
                        style={{
                          color: active
                            ? "var(--accent)"
                            : "var(--text-primary)",
                        }}
                      >
                        {opt.label}
                      </span>
                      {active && (
                        <Check
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: "var(--accent)" }}
                        />
                      )}
                    </div>
                    <p
                      className="text-[11px] leading-snug mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {opt.description}
                    </p>
                  </div>
                </button>
              );
            })}
      </div>

      {onLaunchNow && (
        <button
          type="button"
          onClick={onLaunchNow}
          className="w-full h-9 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--accent-fg)",
          }}
        >
          <span>Open New Event Composer</span>
        </button>
      )}
    </div>
  );
};
