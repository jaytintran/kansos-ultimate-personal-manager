import {useCallback, useEffect, useMemo, useState} from 'react';
import type {BookVoiceOverride, NarratorTone} from '../types/library';

export interface NarratorToneOption {
  id: NarratorTone;
  label: string;
  description: string;
  pitch: number;
  rateMultiplier: number;
}

export const NARRATOR_TONES: NarratorToneOption[] = [
  {
    id: 'warm',
    label: 'Warm',
    description: 'Relaxed storytelling cadence',
    pitch: 0.96,
    rateMultiplier: 0.97,
  },
  {
    id: 'crisp',
    label: 'Crisp',
    description: 'Clear articulation for study',
    pitch: 1.04,
    rateMultiplier: 1.02,
  },
  {
    id: 'calm',
    label: 'Calm',
    description: 'Gentle low-fatigue evening pace',
    pitch: 0.9,
    rateMultiplier: 0.92,
  },
];

const VOICE_PREFS_KEY = 'kanso_library_voice_prefs_v1';

interface StoredVoicePrefs {
  defaultVoice: BookVoiceOverride;
  skipNoise: boolean;
  tapToRead: boolean;
  perBook: Record<string, BookVoiceOverride>;
}

const DEFAULT_VOICE_PREFS: StoredVoicePrefs = {
  defaultVoice: {
    deviceVoiceUri: '',
    tone: 'warm',
    rate: 1.0,
  },
  skipNoise: true,
  tapToRead: true,
  perBook: {},
};

function loadVoicePrefs(): StoredVoicePrefs {
  try {
    const raw = localStorage.getItem(VOICE_PREFS_KEY);
    if (!raw) return DEFAULT_VOICE_PREFS;
    const parsed = JSON.parse(raw) as Partial<StoredVoicePrefs>;
    return {
      ...DEFAULT_VOICE_PREFS,
      ...parsed,
      defaultVoice: {
        ...DEFAULT_VOICE_PREFS.defaultVoice,
        ...(parsed.defaultVoice ?? {}),
      },
      perBook: parsed.perBook ?? {},
    };
  } catch {
    return DEFAULT_VOICE_PREFS;
  }
}

export function useVoicePreferences(bookId: string) {
  const [stored, setStored] = useState<StoredVoicePrefs>(loadVoicePrefs);

  useEffect(() => {
    try {
      localStorage.setItem(VOICE_PREFS_KEY, JSON.stringify(stored));
    } catch {
      // Ignore quota errors
    }
  }, [stored]);

  const hasBookOverride = Boolean(stored.perBook[bookId]);

  const effectiveSettings = useMemo(() => {
    const bookVoice = stored.perBook[bookId] ?? stored.defaultVoice;
    return {
      ...bookVoice,
      skipNoise: stored.skipNoise,
      tapToRead: stored.tapToRead,
    };
  }, [stored, bookId]);

  const updateBookVoice = useCallback(
    (patch: Partial<BookVoiceOverride>) => {
      setStored((prev) => {
        const current = prev.perBook[bookId] ?? prev.defaultVoice;
        const nextBookVoice = {...current, ...patch};
        return {
          ...prev,
          defaultVoice: {...prev.defaultVoice, ...patch},
          perBook: {
            ...prev.perBook,
            [bookId]: nextBookVoice,
          },
        };
      });
    },
    [bookId]
  );

  const updateGlobalVoiceOption = useCallback(
    (patch: {skipNoise?: boolean; tapToRead?: boolean}) => {
      setStored((prev) => ({
        ...prev,
        ...patch,
      }));
    },
    []
  );

  const clearBookOverride = useCallback(() => {
    setStored((prev) => {
      const nextPerBook = {...prev.perBook};
      delete nextPerBook[bookId];
      return {
        ...prev,
        perBook: nextPerBook,
      };
    });
  }, [bookId]);

  return {
    effectiveSettings,
    hasBookOverride,
    updateBookVoice,
    updateGlobalVoiceOption,
    clearBookOverride,
  };
}
