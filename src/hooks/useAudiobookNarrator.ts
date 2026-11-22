import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NarrationSentence } from "../lib/narrationText";
import type {
  BookVoiceOverride,
  NarratorTone,
  SleepTimerMode,
} from "../types/library";
import { NARRATOR_TONES } from "./useVoicePreferences";

export type NarrationStatus =
  | "idle"
  | "buffering"
  | "playing"
  | "paused"
  | "error";

interface UseAudiobookNarratorOptions {
  bookId: string;
  unitIndex: number;
  sentences: NarrationSentence[];
  settings: BookVoiceOverride & { skipNoise: boolean; tapToRead: boolean };
  onAdvanceUnit: (dir: "prev" | "next") => boolean;
  onNotify?: (title: string, tone?: "info" | "success" | "error") => void;
}

export function useAudiobookNarrator({
  bookId,
  unitIndex,
  sentences,
  settings,
  onAdvanceUnit,
  onNotify,
}: UseAudiobookNarratorOptions) {
  const [status, setStatus] = useState<NarrationStatus>("idle");
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number>(-1);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const [deviceVoices, setDeviceVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [previewingVoiceUri, setPreviewingVoiceUri] = useState<string | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sleepTimerMode, setSleepTimerModeState] =
    useState<SleepTimerMode>("off");
  const [sleepSecondsLeft, setSleepSecondsLeft] = useState<number | null>(null);

  const sentencesRef = useRef(sentences);
  sentencesRef.current = sentences;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const statusRef = useRef(status);
  statusRef.current = status;
  const activeSentenceRef = useRef(activeSentenceIndex);
  activeSentenceRef.current = activeSentenceIndex;
  const sleepModeRef = useRef(sleepTimerMode);
  sleepModeRef.current = sleepTimerMode;
  const onAdvanceUnitRef = useRef(onAdvanceUnit);
  onAdvanceUnitRef.current = onAdvanceUnit;

  const sessionTokenRef = useRef(0);
  const pendingAdvanceRef = useRef(false);
  const fallbackWordTimerRef = useRef<number | null>(null);
  const receivedBoundaryRef = useRef(false);

  const speechSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // Load device voices offline
  useEffect(() => {
    if (!speechSupported) return;
    const synth = window.speechSynthesis;
    const loadVoices = () => {
      const list = synth.getVoices();
      if (list.length > 0) {
        const sorted = [...list].sort((a, b) => {
          if (a.localService !== b.localService) return a.localService ? -1 : 1;
          if (a.default !== b.default) return a.default ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setDeviceVoices(sorted);
      }
    };
    loadVoices();
    synth.addEventListener?.("voiceschanged", loadVoices);
    return () => {
      synth.removeEventListener?.("voiceschanged", loadVoices);
    };
  }, [speechSupported]);

  const clearFallbackWordTimer = useCallback(() => {
    if (fallbackWordTimerRef.current !== null) {
      window.clearInterval(fallbackWordTimerRef.current);
      fallbackWordTimerRef.current = null;
    }
  }, []);

  const resolveVoice = useCallback(
    (uri: string): SpeechSynthesisVoice | null => {
      if (deviceVoices.length === 0) return null;
      if (uri) {
        const exact = deviceVoices.find((v) => v.voiceURI === uri);
        if (exact) return exact;
      }
      return (
        deviceVoices.find((v) => v.default) ||
        deviceVoices.find((v) => v.lang.toLowerCase().startsWith("en")) ||
        deviceVoices[0] ||
        null
      );
    },
    [deviceVoices],
  );

  const activeVoiceName = useMemo(() => {
    const v = resolveVoice(settings.deviceVoiceUri);
    return v ? v.name : "System Default";
  }, [resolveVoice, settings.deviceVoiceUri]);

  const cancelSpeech = useCallback(() => {
    sessionTokenRef.current += 1;
    clearFallbackWordTimer();
    if (speechSupported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }, [speechSupported, clearFallbackWordTimer]);

  const stop = useCallback(() => {
    pendingAdvanceRef.current = false;
    cancelSpeech();
    setPreviewingVoiceUri(null);
    setStatus("idle");
    setActiveSentenceIndex(-1);
    setActiveWordIndex(-1);
    setErrorMessage(null);
  }, [cancelSpeech]);

  const speakSentenceAt = useCallback(
    (idx: number) => {
      if (!speechSupported) {
        setStatus("error");
        setErrorMessage("Speech synthesis is unavailable in this browser.");
        return;
      }

      const list = sentencesRef.current;
      if (list.length === 0) {
        setStatus("idle");
        setActiveSentenceIndex(-1);
        setActiveWordIndex(-1);
        return;
      }

      if (idx < 0 || idx >= list.length) {
        // Reached end of chapter / page
        if (sleepModeRef.current === "chapter") {
          setSleepTimerModeState("off");
          setSleepSecondsLeft(null);
          stop();
          onNotify?.("Sleep timer paused at end of section", "info");
          return;
        }
        const advanced = onAdvanceUnitRef.current("next");
        if (advanced) {
          pendingAdvanceRef.current = true;
        } else {
          stop();
          onNotify?.("Finished reading book aloud", "success");
        }
        return;
      }

      const sentence = list[idx];
      cancelSpeech();
      const myToken = sessionTokenRef.current;
      receivedBoundaryRef.current = false;

      setStatus("playing");
      setErrorMessage(null);
      setActiveSentenceIndex(idx);
      setActiveWordIndex(0);

      const curSettings = settingsRef.current;
      const toneDef =
        NARRATOR_TONES.find((t) => t.id === curSettings.tone) ??
        NARRATOR_TONES[0];
      const effectiveRate = Math.min(
        2.5,
        Math.max(0.6, curSettings.rate * toneDef.rateMultiplier),
      );

      const utterance = new SpeechSynthesisUtterance(sentence.spokenText);
      const voice = resolveVoice(curSettings.deviceVoiceUri);
      if (voice) utterance.voice = voice;
      utterance.rate = effectiveRate;
      utterance.pitch = toneDef.pitch;

      utterance.onboundary = (event) => {
        if (sessionTokenRef.current !== myToken) return;
        if (typeof event.charIndex === "number") {
          receivedBoundaryRef.current = true;
          clearFallbackWordTimer();
          const charPos = event.charIndex;
          const found = sentence.words.findIndex(
            (w) => charPos >= w.startInSentence && charPos <= w.endInSentence,
          );
          if (found !== -1) {
            setActiveWordIndex(found);
          } else {
            const nearest = sentence.words.findIndex(
              (w) => w.startInSentence >= charPos,
            );
            if (nearest !== -1) setActiveWordIndex(nearest);
          }
        }
      };

      utterance.onend = () => {
        if (sessionTokenRef.current !== myToken) return;
        clearFallbackWordTimer();
        speakSentenceAt(idx + 1);
      };

      utterance.onerror = (ev) => {
        if (sessionTokenRef.current !== myToken) return;
        clearFallbackWordTimer();
        if (ev.error === "interrupted" || ev.error === "canceled") return;
        setStatus("error");
        setErrorMessage(`Voice playback error (${ev.error || "unknown"}).`);
      };

      // Smooth fallback word tracker in case OS voice doesn't emit onboundary events
      if (sentence.words.length > 1) {
        const msPerWord = Math.max(
          120,
          Math.round(60000 / (165 * effectiveRate)),
        );
        let estWord = 0;
        fallbackWordTimerRef.current = window.setInterval(() => {
          if (
            sessionTokenRef.current !== myToken ||
            receivedBoundaryRef.current
          ) {
            clearFallbackWordTimer();
            return;
          }
          estWord = Math.min(sentence.words.length - 1, estWord + 1);
          setActiveWordIndex(estWord);
        }, msPerWord);
      }

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        clearFallbackWordTimer();
        setStatus("error");
        setErrorMessage("Could not start speech synthesis.");
      }
    },
    [
      speechSupported,
      cancelSpeech,
      resolveVoice,
      clearFallbackWordTimer,
      stop,
      onNotify,
    ],
  );

  // Resume automatically after unit advancement once new sentences arrive
  useEffect(() => {
    if (!pendingAdvanceRef.current) return;
    if (sentences.length === 0) return;
    pendingAdvanceRef.current = false;
    speakSentenceAt(0);
  }, [unitIndex, sentences, speakSentenceAt]);

  // Stop cleanly if book changes or unmounts
  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, [bookId, cancelSpeech]);

  // Re-apply voice / rate / tone live while playing
  const voiceKey = `${settings.deviceVoiceUri}|${settings.tone}|${settings.rate}`;
  const prevVoiceKeyRef = useRef(voiceKey);
  useEffect(() => {
    if (prevVoiceKeyRef.current === voiceKey) return;
    prevVoiceKeyRef.current = voiceKey;
    if (statusRef.current === "playing" && activeSentenceRef.current >= 0) {
      speakSentenceAt(activeSentenceRef.current);
    }
  }, [voiceKey, speakSentenceAt]);

  // Sleep timer countdown
  useEffect(() => {
    if (sleepSecondsLeft === null) return;
    if (status !== "playing") return;
    const timer = window.setInterval(() => {
      setSleepSecondsLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          setSleepTimerModeState("off");
          stop();
          onNotify?.("Sleep timer finished — narration paused", "info");
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sleepSecondsLeft, status, stop, onNotify]);

  const setSleepTimerMode = useCallback((mode: SleepTimerMode) => {
    setSleepTimerModeState(mode);
    if (mode === "15m") setSleepSecondsLeft(15 * 60);
    else if (mode === "30m") setSleepSecondsLeft(30 * 60);
    else if (mode === "45m") setSleepSecondsLeft(45 * 60);
    else setSleepSecondsLeft(null);
  }, []);

  const playFrom = useCallback(
    (sentenceIndex: number) => {
      setPreviewingVoiceUri(null);
      speakSentenceAt(Math.max(0, sentenceIndex));
    },
    [speakSentenceAt],
  );

  const togglePlay = useCallback(
    (fallbackStartIndex = 0) => {
      if (statusRef.current === "playing") {
        cancelSpeech();
        setStatus("paused");
        return;
      }
      const resumeIdx =
        activeSentenceRef.current >= 0
          ? activeSentenceRef.current
          : fallbackStartIndex;
      playFrom(resumeIdx);
    },
    [cancelSpeech, playFrom],
  );

  const stepSentence = useCallback(
    (delta: -1 | 1) => {
      const list = sentencesRef.current;
      if (list.length === 0) return;
      const cur =
        activeSentenceRef.current >= 0 ? activeSentenceRef.current : 0;
      const next = cur + delta;
      if (next < 0) {
        if (onAdvanceUnitRef.current("prev")) {
          pendingAdvanceRef.current = statusRef.current === "playing";
        }
        return;
      }
      if (next >= list.length) {
        if (onAdvanceUnitRef.current("next")) {
          pendingAdvanceRef.current = statusRef.current === "playing";
        }
        return;
      }
      if (statusRef.current === "playing") {
        speakSentenceAt(next);
      } else {
        setActiveSentenceIndex(next);
        setActiveWordIndex(0);
      }
    },
    [speakSentenceAt],
  );

  const skipSeconds = useCallback(
    (deltaSec: number) => {
      // Approximate ~1 sentence per ~5 seconds
      const sentenceDelta =
        deltaSec >= 0
          ? Math.max(1, Math.round(deltaSec / 5))
          : -Math.max(1, Math.round(Math.abs(deltaSec) / 5));
      const list = sentencesRef.current;
      if (list.length === 0) return;
      const cur =
        activeSentenceRef.current >= 0 ? activeSentenceRef.current : 0;
      const target = Math.min(
        list.length - 1,
        Math.max(0, cur + sentenceDelta),
      );
      if (statusRef.current === "playing") {
        speakSentenceAt(target);
      } else {
        setActiveSentenceIndex(target);
        setActiveWordIndex(0);
      }
    },
    [speakSentenceAt],
  );

  const stopPreview = useCallback(() => {
    setPreviewingVoiceUri(null);
    if (speechSupported && statusRef.current !== "playing") {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }, [speechSupported]);

  const previewVoice = useCallback(
    (voiceUri: string, tone: NarratorTone, rate: number) => {
      if (!speechSupported) return;
      if (previewingVoiceUri === voiceUri) {
        stopPreview();
        return;
      }
      cancelSpeech();
      if (statusRef.current === "playing") {
        setStatus("paused");
      }
      const toneDef =
        NARRATOR_TONES.find((t) => t.id === tone) ?? NARRATOR_TONES[0];
      const u = new SpeechSynthesisUtterance(
        "Reading in calm focus. Every page stays offline and synchronized.",
      );
      const voice = resolveVoice(voiceUri);
      if (voice) u.voice = voice;
      u.rate = Math.min(2.5, Math.max(0.6, rate * toneDef.rateMultiplier));
      u.pitch = toneDef.pitch;
      u.onend = () => setPreviewingVoiceUri(null);
      u.onerror = () => setPreviewingVoiceUri(null);
      setPreviewingVoiceUri(voiceUri);
      window.speechSynthesis.speak(u);
    },
    [
      speechSupported,
      previewingVoiceUri,
      stopPreview,
      cancelSpeech,
      resolveVoice,
    ],
  );

  return {
    status,
    activeSentenceIndex,
    activeWordIndex,
    deviceVoices,
    activeVoiceName,
    previewingVoiceUri,
    errorMessage,
    sleepTimerMode,
    sleepSecondsLeft,
    playFrom,
    togglePlay,
    stop,
    stepSentence,
    skipSeconds,
    setSleepTimerMode,
    previewVoice,
    stopPreview,
  };
}
