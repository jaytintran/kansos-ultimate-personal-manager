import { useCallback, useEffect, useState } from "react";
import type {
  AudioCardDetailOptions,
  AudioCoverSize,
  AudioGroupByField,
  AudioSidebarSectionKey,
  AudioSortDirection,
  AudioSortField,
} from "../types/audio";
import { VIEW_PREFERENCE_SYNC_EVENT } from "../utils/viewPreferences";

export const AUDIO_PREFS_STORAGE_KEY = "kanso_audio_studio_prefs_v1";

export const DEFAULT_AUDIO_CARD_DETAILS: AudioCardDetailOptions = {
  artist: true,
  album: false,
  format: true,
  duration: true,
  playCount: false,
  tags: false,
  resumeBar: true,
};

export interface AudioStudioUiPreferences {
  viewMode: "grid" | "table";
  coverSize: AudioCoverSize;
  cardDetails: AudioCardDetailOptions;
  sortField: AudioSortField;
  sortDirection: AudioSortDirection;
  groupBy: AudioGroupByField;
  sidebarWidth: number;
  sidebarCollapsedDesktop: boolean;
  collapsedSections: Record<AudioSidebarSectionKey, boolean>;
  visualizerMode: "spectrum" | "waveform";
}

const DEFAULT_AUDIO_UI_PREFS: AudioStudioUiPreferences = {
  viewMode: "grid",
  coverSize: "standard",
  cardDetails: DEFAULT_AUDIO_CARD_DETAILS,
  sortField: "addedAt",
  sortDirection: "desc",
  groupBy: "none",
  sidebarWidth: 248,
  sidebarCollapsedDesktop: false,
  collapsedSections: {
    views: false,
    folders: false,
    playlists: false,
    presets: false,
    tags: true,
  },
  visualizerMode: "spectrum",
};

function loadAudioPrefs(): AudioStudioUiPreferences {
  try {
    const raw = localStorage.getItem(AUDIO_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_AUDIO_UI_PREFS;
    const parsed = JSON.parse(raw) as Partial<AudioStudioUiPreferences>;
    return {
      ...DEFAULT_AUDIO_UI_PREFS,
      ...parsed,
      cardDetails: {
        ...DEFAULT_AUDIO_CARD_DETAILS,
        ...(parsed.cardDetails ?? {}),
      },
      collapsedSections: {
        ...DEFAULT_AUDIO_UI_PREFS.collapsedSections,
        ...(parsed.collapsedSections ?? {}),
      },
    };
  } catch {
    return DEFAULT_AUDIO_UI_PREFS;
  }
}

export function useAudioPreferences() {
  const [prefs, setPrefs] = useState<AudioStudioUiPreferences>(loadAudioPrefs);

  useEffect(() => {
    try {
      localStorage.setItem(AUDIO_PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage quota errors
    }
  }, [prefs]);

  useEffect(() => {
    const onSynced = () => {
      setPrefs(loadAudioPrefs());
    };
    window.addEventListener(VIEW_PREFERENCE_SYNC_EVENT, onSynced);
    return () => {
      window.removeEventListener(VIEW_PREFERENCE_SYNC_EVENT, onSynced);
    };
  }, []);

  const updateUiPrefs = useCallback(
    (patch: Partial<AudioStudioUiPreferences>) => {
      setPrefs((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const updateCardDetails = useCallback(
    (patch: Partial<AudioCardDetailOptions>) => {
      setPrefs((prev) => ({
        ...prev,
        cardDetails: { ...prev.cardDetails, ...patch },
      }));
    },
    [],
  );

  const toggleSidebarSection = useCallback(
    (section: AudioSidebarSectionKey) => {
      setPrefs((prev) => ({
        ...prev,
        collapsedSections: {
          ...prev.collapsedSections,
          [section]: !prev.collapsedSections[section],
        },
      }));
    },
    [],
  );

  return {
    prefs,
    updateUiPrefs,
    updateCardDetails,
    toggleSidebarSection,
  };
}
