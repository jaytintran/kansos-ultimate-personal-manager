import { VIEW_PREFERENCE_SYNC_EVENT } from "../utils/viewPreferences";

export type DesktopNewEventUiMode =
  | "modal"
  | "drawer"
  | "calendar-studio"
  | "quick-bar"
  | "full-sheet";

export type MobileNewEventUiMode =
  | "sheet"
  | "calendar-studio"
  | "quick-dock"
  | "modal"
  | "full-sheet";

export interface EventComposerPreferences {
  desktopMode: DesktopNewEventUiMode;
  mobileMode: MobileNewEventUiMode;
}

export const EVENT_COMPOSER_PREFS_STORAGE_KEY =
  "kanso_events_composer_prefs_v1";
export const EVENT_COMPOSER_PREFS_CHANGED_EVENT =
  "kanso:event-composer-prefs-changed";

export interface NewEventUiOption<T extends string> {
  id: T;
  label: string;
  shortLabel: string;
  description: string;
}

export const DESKTOP_NEW_EVENT_OPTIONS: NewEventUiOption<DesktopNewEventUiMode>[] =
  [
    {
      id: "modal",
      label: "Focused Studio Modal",
      shortLabel: "Modal",
      description:
        "Centered dialog with quick date & time presets, lists, tags, and notes.",
    },
    {
      id: "drawer",
      label: "Slide-Over Side Drawer",
      shortLabel: "Drawer",
      description:
        "Right-edge panel that keeps your events list and calendar visible.",
    },
    {
      id: "calendar-studio",
      label: "Calendar & Time Studio",
      shortLabel: "Calendar",
      description:
        "Split month picker showing busy days alongside visual time & duration slots.",
    },
    {
      id: "quick-bar",
      label: "Quick Spotlight Bar",
      shortLabel: "Quick Bar",
      description:
        "Keyboard-first floating bar with smart date/time/tag detection.",
    },
    {
      id: "full-sheet",
      label: "Full Workspace Editor",
      shortLabel: "Full Sheet",
      description:
        "Jump straight into the full rich-text Event Detail Sheet immediately.",
    },
  ];

export const MOBILE_NEW_EVENT_OPTIONS: NewEventUiOption<MobileNewEventUiMode>[] =
  [
    {
      id: "sheet",
      label: "Thumb Bottom Sheet",
      shortLabel: "Sheet",
      description:
        "Ergonomic slide-up sheet with 44px touch controls and sticky Save bar.",
    },
    {
      id: "calendar-studio",
      label: "Calendar & Time Studio",
      shortLabel: "Calendar",
      description:
        "Interactive month grid with busy-day dots plus quick time & duration chips.",
    },
    {
      id: "quick-dock",
      label: "Quick Thumb Dock",
      shortLabel: "Quick Dock",
      description:
        "Compact one-handed capture bar with smart date/time/tag detection.",
    },
    {
      id: "modal",
      label: "Centered Card Dialog",
      shortLabel: "Card",
      description:
        "Elevated centered card layout with structured fields and quick presets.",
    },
    {
      id: "full-sheet",
      label: "Full-Screen Editor",
      shortLabel: "Full Screen",
      description:
        "Open the full-screen Event Detail Sheet directly with rich notes.",
    },
  ];

const VALID_DESKTOP_MODES = new Set<DesktopNewEventUiMode>([
  "modal",
  "drawer",
  "calendar-studio",
  "quick-bar",
  "full-sheet",
]);

const VALID_MOBILE_MODES = new Set<MobileNewEventUiMode>([
  "sheet",
  "calendar-studio",
  "quick-dock",
  "modal",
  "full-sheet",
]);

export const DEFAULT_EVENT_COMPOSER_PREFS: EventComposerPreferences = {
  desktopMode: "modal",
  mobileMode: "sheet",
};

export function loadEventComposerPrefs(): EventComposerPreferences {
  try {
    const raw = localStorage.getItem(EVENT_COMPOSER_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EVENT_COMPOSER_PREFS };
    const parsed = JSON.parse(raw) as Partial<EventComposerPreferences>;
    return {
      desktopMode:
        parsed.desktopMode && VALID_DESKTOP_MODES.has(parsed.desktopMode)
          ? parsed.desktopMode
          : DEFAULT_EVENT_COMPOSER_PREFS.desktopMode,
      mobileMode:
        parsed.mobileMode && VALID_MOBILE_MODES.has(parsed.mobileMode)
          ? parsed.mobileMode
          : DEFAULT_EVENT_COMPOSER_PREFS.mobileMode,
    };
  } catch {
    return { ...DEFAULT_EVENT_COMPOSER_PREFS };
  }
}

export function saveEventComposerPrefs(
  next: EventComposerPreferences,
): EventComposerPreferences {
  const normalized: EventComposerPreferences = {
    desktopMode: VALID_DESKTOP_MODES.has(next.desktopMode)
      ? next.desktopMode
      : DEFAULT_EVENT_COMPOSER_PREFS.desktopMode,
    mobileMode: VALID_MOBILE_MODES.has(next.mobileMode)
      ? next.mobileMode
      : DEFAULT_EVENT_COMPOSER_PREFS.mobileMode,
  };
  try {
    localStorage.setItem(
      EVENT_COMPOSER_PREFS_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch {
    // Ignore storage errors
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_COMPOSER_PREFS_CHANGED_EVENT));
  }
  return normalized;
}

export function subscribeEventComposerPrefs(
  onUpdate: (prefs: EventComposerPreferences) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handleUpdate = () => onUpdate(loadEventComposerPrefs());
  window.addEventListener(EVENT_COMPOSER_PREFS_CHANGED_EVENT, handleUpdate);
  window.addEventListener(VIEW_PREFERENCE_SYNC_EVENT, handleUpdate);
  return () => {
    window.removeEventListener(
      EVENT_COMPOSER_PREFS_CHANGED_EVENT,
      handleUpdate,
    );
    window.removeEventListener(VIEW_PREFERENCE_SYNC_EVENT, handleUpdate);
  };
}
