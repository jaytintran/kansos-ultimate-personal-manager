import type { BookVoiceOverride } from "../types/library";

export const VIEW_PREFERENCE_SYNC_EVENT = "kanso:view-prefs-synced";

export const SYNCED_VIEW_PREFERENCE_KEYS = [
  "kanso_habits_view_mode_v1",
  "kanso_habits_range_v1",
  "kanso_notes_sort_v1",
  "kanso_notes_view_mode_v1",
  "kanso_lists_prefs_v1",
  "kanso_events_filters_v1",
  "kanso_streamer_vault_sort_v1",
  "kanso_library_studio_prefs_v1",
] as const;

const VOICE_PREFS_KEY = "kanso_library_voice_prefs_v1";

interface VoicePrefsShape {
  defaultVoice?: Partial<BookVoiceOverride>;
  skipNoise?: boolean;
  tapToRead?: boolean;
  perBook?: Record<string, BookVoiceOverride>;
}

/**
 * Collects device-agnostic app & view preferences from localStorage for Gist sync.
 * Excludes hardware-specific voice URIs, per-book voice overrides, Gist credentials,
 * and Android SAF storage mode/folder URIs.
 */
export function collectSyncedViewPreferences(): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof localStorage === "undefined") return result;

  for (const key of SYNCED_VIEW_PREFERENCE_KEYS) {
    try {
      const val = localStorage.getItem(key);
      if (val !== null) {
        result[key] = val;
      }
    } catch {
      // Ignore storage access errors
    }
  }

  try {
    const rawVoice = localStorage.getItem(VOICE_PREFS_KEY);
    if (rawVoice) {
      const parsed = JSON.parse(rawVoice) as VoicePrefsShape;
      const sanitizedVoice: VoicePrefsShape = {
        defaultVoice: {
          tone: parsed.defaultVoice?.tone ?? "warm",
          rate:
            typeof parsed.defaultVoice?.rate === "number"
              ? parsed.defaultVoice.rate
              : 1.0,
        },
        skipNoise: parsed.skipNoise ?? true,
        tapToRead: parsed.tapToRead ?? true,
      };
      result[VOICE_PREFS_KEY] = JSON.stringify(sanitizedVoice);
    }
  } catch {
    // Ignore malformed voice prefs
  }

  return result;
}

/**
 * Applies synced view preferences pulled from Gist into localStorage and notifies
 * mounted views so they refresh their UI state immediately.
 */
export function applySyncedViewPreferences(
  incoming?: Record<string, unknown> | null,
): void {
  if (typeof localStorage === "undefined" || !incoming || typeof incoming !== "object") {
    return;
  }

  const allowedSet = new Set<string>(SYNCED_VIEW_PREFERENCE_KEYS);

  for (const [key, value] of Object.entries(incoming)) {
    if (allowedSet.has(key) && typeof value === "string") {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Ignore quota errors
      }
    }
  }

  const incomingVoiceRaw = incoming[VOICE_PREFS_KEY];
  if (typeof incomingVoiceRaw === "string") {
    try {
      const incomingVoice = JSON.parse(incomingVoiceRaw) as VoicePrefsShape;
      let existingLocal: VoicePrefsShape = {};
      const currentRaw = localStorage.getItem(VOICE_PREFS_KEY);
      if (currentRaw) {
        existingLocal = JSON.parse(currentRaw) as VoicePrefsShape;
      }
      const mergedVoice = {
        defaultVoice: {
          deviceVoiceUri: existingLocal.defaultVoice?.deviceVoiceUri ?? "",
          tone:
            incomingVoice.defaultVoice?.tone ??
            existingLocal.defaultVoice?.tone ??
            "warm",
          rate:
            typeof incomingVoice.defaultVoice?.rate === "number"
              ? incomingVoice.defaultVoice.rate
              : (existingLocal.defaultVoice?.rate ?? 1.0),
        },
        skipNoise:
          typeof incomingVoice.skipNoise === "boolean"
            ? incomingVoice.skipNoise
            : (existingLocal.skipNoise ?? true),
        tapToRead:
          typeof incomingVoice.tapToRead === "boolean"
            ? incomingVoice.tapToRead
            : (existingLocal.tapToRead ?? true),
        perBook: existingLocal.perBook ?? {},
      };
      localStorage.setItem(VOICE_PREFS_KEY, JSON.stringify(mergedVoice));
    } catch {
      // Ignore malformed voice prefs
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(VIEW_PREFERENCE_SYNC_EVENT));
  }
}
