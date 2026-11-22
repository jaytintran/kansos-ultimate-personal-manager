import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AUDIO_EQ_PRESETS } from "../lib/audioFormatters";
import { resolveAudioPlaybackUrl } from "../lib/audioFileLoader";
import type {
  AudioMixSlot,
  AudioStudioState,
  AudioTrackRecord,
} from "../types/audio";
import {
  isAndroidCapacitor,
  subscribeAndroidMediaControls,
  syncAndroidBackgroundAudio,
} from "../utils/androidSaf";

export interface AudioPlaybackSummary {
  activeCount: number;
  playingCount: number;
  isPlaying: boolean;
  isViewMuted: boolean;
  isAllPaused: boolean;
  primaryTrackId: string | null;
  primaryTitle: string | null;
  primaryArtist: string | null;
  primaryCoverDataUrl: string | null;
  currentTime: number;
  duration: number;
}

export interface AudioControllerHandle {
  togglePauseAll: () => void;
  toggleViewMute: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  stopAll: () => void;
}

export interface SlotRuntimeInfo {
  currentTime: number;
  duration: number;
  playing: boolean;
  loading: boolean;
  error: boolean;
}

interface InternalSlotNode {
  slotId: string;
  trackId: string;
  audio: HTMLAudioElement;
  blobUrl: string | null;
  revokeUrl: (() => void) | null;
  sourceNode: MediaElementAudioSourceNode | null;
  gainNode: GainNode | null;
  initialSeekApplied: boolean;
  lastSavedAt: number;
  loading: boolean;
  error: boolean;
}

interface UseAudioMixerEngineArgs {
  tracks: AudioTrackRecord[];
  audioState: AudioStudioState;
  onUpdateTrack: (id: string, patch: Partial<AudioTrackRecord>) => void;
  onUpdateAudioState: (
    patch:
      | Partial<AudioStudioState>
      | ((prev: AudioStudioState) => AudioStudioState),
  ) => void;
  onRecordPlay: (trackId: string) => void;
  onMissingTrackFile?: (track: AudioTrackRecord) => void;
  onPlaybackStateChange?: (summary: AudioPlaybackSummary) => void;
}

export function useAudioMixerEngine({
  tracks,
  audioState,
  onUpdateTrack,
  onUpdateAudioState,
  onRecordPlay,
  onMissingTrackFile,
  onPlaybackStateChange,
}: UseAudioMixerEngineArgs) {
  const [viewMuted, setViewMuted] = useState(false);
  const [isAllPaused, setIsAllPaused] = useState(true);
  const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState<
    number | null
  >(null);
  const [slotRuntime, setSlotRuntime] = useState<
    Record<string, SlotRuntimeInfo>
  >({});
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const slotsRef = useRef<Map<string, InternalSlotNode>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lowFilterRef = useRef<BiquadFilterNode | null>(null);
  const midFilterRef = useRef<BiquadFilterNode | null>(null);
  const highFilterRef = useRef<BiquadFilterNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const sleepFadeRef = useRef(1);

  const setAllPausedSync = useCallback((paused: boolean) => {
    isAllPausedRef.current = paused;
    setIsAllPaused(paused);
  }, []);

  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const audioStateRef = useRef(audioState);
  audioStateRef.current = audioState;
  const viewMutedRef = useRef(viewMuted);
  viewMutedRef.current = viewMuted;
  const isAllPausedRef = useRef(isAllPaused);

  const trackMap = useMemo(
    () => new Map(tracks.map((t) => [t.id, t])),
    [tracks],
  );
  const trackMapRef = useRef(trackMap);
  trackMapRef.current = trackMap;

  const onUpdateTrackRef = useRef(onUpdateTrack);
  onUpdateTrackRef.current = onUpdateTrack;
  const onUpdateAudioStateRef = useRef(onUpdateAudioState);
  onUpdateAudioStateRef.current = onUpdateAudioState;
  const onRecordPlayRef = useRef(onRecordPlay);
  onRecordPlayRef.current = onRecordPlay;
  const onMissingTrackFileRef = useRef(onMissingTrackFile);
  onMissingTrackFileRef.current = onMissingTrackFile;

  const ensureWebAudioGraph = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === "suspended") {
        void audioCtxRef.current.resume().catch(() => undefined);
      }
      return {
        ctx: audioCtxRef.current,
        low: lowFilterRef.current!,
        master: masterGainRef.current!,
      };
    }

    const AudioCtx =
      window.AudioContext ||
      (
        window as unknown as {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioCtx) return null;

    try {
      const ctx = new AudioCtx();
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = 120;

      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      mid.frequency.value = 1000;
      mid.Q.value = 0.9;

      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = 6000;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;

      const master = ctx.createGain();
      master.gain.value = (audioStateRef.current.masterVolume ?? 100) / 100;

      low.connect(mid);
      mid.connect(high);
      high.connect(analyser);
      analyser.connect(master);
      master.connect(ctx.destination);

      audioCtxRef.current = ctx;
      lowFilterRef.current = low;
      midFilterRef.current = mid;
      highFilterRef.current = high;
      analyserRef.current = analyser;
      masterGainRef.current = master;
      setAnalyserNode(analyser);

      return { ctx, low, master };
    } catch {
      return null;
    }
  }, []);

  // Apply EQ preset + master gain + per-slot volume/solo/mute
  const syncAudioGains = useCallback(() => {
    const state = audioStateRef.current;
    const eq =
      AUDIO_EQ_PRESETS.find((p) => p.id === state.eqPreset) ??
      AUDIO_EQ_PRESETS[0];

    if (lowFilterRef.current && midFilterRef.current && highFilterRef.current) {
      lowFilterRef.current.gain.value = eq.lowDb;
      midFilterRef.current.gain.value = eq.midDb;
      highFilterRef.current.gain.value = eq.highDb;
    }

    const masterLinear = viewMutedRef.current
      ? 0
      : Math.max(0, Math.min(1, (state.masterVolume ?? 100) / 100)) *
        sleepFadeRef.current;

    if (masterGainRef.current) {
      masterGainRef.current.gain.value = masterLinear;
    }

    const anySolo = state.activeSlots.some((sl) => Boolean(sl.solo));

    for (const slot of state.activeSlots) {
      const entry = slotsRef.current.get(slot.slotId);
      if (!entry) continue;
      const audible = !slot.muted && (!anySolo || Boolean(slot.solo));
      const slotLinear = audible
        ? Math.max(0, Math.min(1, (slot.volume ?? 100) / 100))
        : 0;

      if (entry.gainNode) {
        entry.gainNode.gain.value = slotLinear;
        entry.audio.volume = 1;
      } else {
        entry.audio.volume = slotLinear * masterLinear;
      }

      if (entry.audio.loop !== Boolean(slot.loop)) {
        entry.audio.loop = Boolean(slot.loop);
      }
      const targetRate = Math.max(0.5, Math.min(3, slot.playbackRate || 1));
      if (Math.abs(entry.audio.playbackRate - targetRate) > 0.01) {
        entry.audio.playbackRate = targetRate;
      }
    }
  }, []);

  const persistSlotPosition = useCallback(
    (entry: InternalSlotNode, forceZero = false) => {
      const track = trackMapRef.current.get(entry.trackId);
      if (!track) return;
      const dur = Number.isFinite(entry.audio.duration)
        ? entry.audio.duration
        : track.durationSeconds;
      const nextPos = forceZero
        ? 0
        : dur > 0 && entry.audio.currentTime >= dur - 1.2
          ? 0
          : Math.max(0, Math.round(entry.audio.currentTime * 10) / 10);
      if (Math.abs((track.currentPositionSeconds || 0) - nextPos) >= 0.4 || forceZero) {
        entry.lastSavedAt = Date.now();
        onUpdateTrackRef.current(track.id, {
          currentPositionSeconds: nextPos,
          ...(dur > 0 && track.durationSeconds <= 0
            ? { durationSeconds: dur }
            : {}),
        });
      }
    },
    [],
  );

  const getNextTrackId = useCallback(
    (currentTrackId: string | null, forceWrap = false): string | null => {
      const state = audioStateRef.current;
      const allTracks = tracksRef.current;
      if (allTracks.length === 0) return null;

      // 1. Check explicit queue first
      if (state.queueTrackIds.length > 0) {
        const nextQueued = state.queueTrackIds.find((id) =>
          trackMapRef.current.has(id),
        );
        if (nextQueued) {
          onUpdateAudioStateRef.current((prev) => ({
            ...prev,
            queueTrackIds: prev.queueTrackIds.filter((id) => id !== nextQueued),
          }));
          return nextQueued;
        }
      }

      if (state.shuffle && allTracks.length > 1) {
        const candidates = allTracks.filter((t) => t.id !== currentTrackId);
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        return pick?.id ?? null;
      }

      if (!currentTrackId) return allTracks[0]?.id ?? null;
      const idx = allTracks.findIndex((t) => t.id === currentTrackId);
      if (idx === -1) return allTracks[0]?.id ?? null;
      if (idx + 1 < allTracks.length) {
        return allTracks[idx + 1].id;
      }
      if (state.repeatMode === "all" || forceWrap) {
        return allTracks[0].id;
      }
      return null;
    },
    [],
  );

  const switchPrimaryTrack = useCallback(
    (nextTrackId: string) => {
      const state = audioStateRef.current;
      const currentPrimaryId =
        state.primaryTrackId ?? state.activeSlots[0]?.trackId ?? null;
      const targetSlot =
        state.activeSlots.find((sl) => sl.trackId === currentPrimaryId) ??
        state.activeSlots[0];

      if (targetSlot) {
        const existingNode = slotsRef.current.get(targetSlot.slotId);
        if (existingNode) {
          persistSlotPosition(existingNode);
        }
        onRecordPlayRef.current(nextTrackId);
        setAllPausedSync(false);
        onUpdateAudioStateRef.current((prev) => ({
          ...prev,
          primaryTrackId: nextTrackId,
          activeSlots: prev.activeSlots.map((sl) =>
            sl.slotId === targetSlot.slotId
              ? {
                  ...sl,
                  trackId: nextTrackId,
                  abLoopStart: null,
                  abLoopEnd: null,
                }
              : sl,
          ),
        }));
      } else {
        onRecordPlayRef.current(nextTrackId);
        setAllPausedSync(false);
        onUpdateAudioStateRef.current((prev) => ({
          ...prev,
          primaryTrackId: nextTrackId,
          activeSlots: [
            {
              slotId: `aslot_${Date.now().toString(36)}`,
              trackId: nextTrackId,
              volume: 90,
              muted: false,
              solo: false,
              loop: false,
              playbackRate: 1,
              abLoopStart: null,
              abLoopEnd: null,
            },
          ],
        }));
      }
    },
    [persistSlotPosition, setAllPausedSync],
  );

  const playNext = useCallback(
    (forceWrap = true) => {
      const state = audioStateRef.current;
      const currentId =
        state.primaryTrackId ?? state.activeSlots[0]?.trackId ?? null;
      const nextId = getNextTrackId(currentId, forceWrap);
      if (nextId) {
        switchPrimaryTrack(nextId);
      }
    },
    [getNextTrackId, switchPrimaryTrack],
  );

  const playPrev = useCallback(() => {
    const state = audioStateRef.current;
    const allTracks = tracksRef.current;
    if (allTracks.length === 0) return;

    const currentId =
      state.primaryTrackId ?? state.activeSlots[0]?.trackId ?? null;
    const primarySlot =
      state.activeSlots.find((sl) => sl.trackId === currentId) ??
      state.activeSlots[0];
    if (primarySlot) {
      const node = slotsRef.current.get(primarySlot.slotId);
      if (node && node.audio.currentTime > 3) {
        node.audio.currentTime = 0;
        return;
      }
    }

    if (!currentId) {
      switchPrimaryTrack(allTracks[0].id);
      return;
    }
    const idx = allTracks.findIndex((t) => t.id === currentId);
    const prevIdx = idx <= 0 ? allTracks.length - 1 : idx - 1;
    const prevTrack = allTracks[prevIdx];
    if (prevTrack) {
      switchPrimaryTrack(prevTrack.id);
    }
  }, [switchPrimaryTrack]);

  const syncNodeRuntime = useCallback((node: InternalSlotNode) => {
    const track = trackMapRef.current.get(node.trackId);
    const dur =
      Number.isFinite(node.audio.duration) && node.audio.duration > 0
        ? node.audio.duration
        : track?.durationSeconds ?? 0;
    const nextCur = Number.isFinite(node.audio.currentTime)
      ? node.audio.currentTime
      : 0;
    const nextPlaying = !node.audio.paused && !node.audio.ended;
    setSlotRuntime((prev) => {
      const curRt = prev[node.slotId];
      if (
        curRt &&
        Math.abs(curRt.currentTime - nextCur) < 0.08 &&
        Math.abs(curRt.duration - dur) < 0.08 &&
        curRt.playing === nextPlaying &&
        curRt.loading === node.loading &&
        curRt.error === node.error
      ) {
        return prev;
      }
      return {
        ...prev,
        [node.slotId]: {
          currentTime: nextCur,
          duration: dur,
          playing: nextPlaying,
          loading: node.loading,
          error: node.error,
        },
      };
    });
  }, []);

  const loadSlotSource = useCallback(
    (node: InternalSlotNode, track: AudioTrackRecord) => {
      node.loading = true;
      node.error = false;
      syncNodeRuntime(node);

      void resolveAudioPlaybackUrl(track)
        .then(({ url, revoke }) => {
          if (slotsRef.current.get(node.slotId) !== node) {
            revoke();
            return;
          }
          if (node.revokeUrl && node.blobUrl !== url) {
            node.revokeUrl();
          }
          node.blobUrl = url;
          node.revokeUrl = revoke;
          node.loading = false;
          node.error = false;

          // Only apply crossOrigin="anonymous" for remote cross-origin HTTP(S) URLs.
          // Setting crossOrigin on blob:/same-origin _capacitor_file_ URLs can break Android WebView playback.
          const isRemoteCrossOrigin =
            typeof window !== "undefined" &&
            (url.startsWith("http://") || url.startsWith("https://")) &&
            !url.startsWith(window.location.origin);
          if (isRemoteCrossOrigin) {
            node.audio.crossOrigin = "anonymous";
          } else {
            node.audio.removeAttribute("crossOrigin");
          }

          node.audio.src = url;
          node.audio.load();
          syncAudioGains();
          if (!isAllPausedRef.current) {
            if (audioCtxRef.current?.state === "suspended") {
              void audioCtxRef.current.resume().catch(() => undefined);
            }
            void node.audio.play().catch(() => undefined);
          }
          syncNodeRuntime(node);
        })
        .catch(() => {
          if (slotsRef.current.get(node.slotId) !== node) return;
          node.loading = false;
          node.error = true;
          syncNodeRuntime(node);
          onMissingTrackFileRef.current?.(track);
        });
    },
    [syncAudioGains, syncNodeRuntime],
  );

  const playNodeAudio = useCallback(
    (node: InternalSlotNode, rewindIfEnded = true) => {
      ensureWebAudioGraph();
      if (audioCtxRef.current?.state === "suspended") {
        void audioCtxRef.current.resume().catch(() => undefined);
      }

      const track = trackMapRef.current.get(node.trackId);
      if (node.error || node.audio.error || !node.blobUrl) {
        if (track && !node.loading) {
          loadSlotSource(node, track);
        }
        return;
      }

      const dur =
        Number.isFinite(node.audio.duration) && node.audio.duration > 0
          ? node.audio.duration
          : track?.durationSeconds ?? 0;
      const isAtOrNearEnd =
        node.audio.ended ||
        (dur > 0 && node.audio.currentTime >= dur - 0.5);

      if (rewindIfEnded && isAtOrNearEnd) {
        try {
          node.audio.currentTime = 0;
        } catch {
          // Ignore seek error before ready
        }
        if (track && (track.currentPositionSeconds || 0) > 0) {
          onUpdateTrackRef.current(track.id, { currentPositionSeconds: 0 });
        }
        syncNodeRuntime(node);
      }

      if (node.audio.paused || node.audio.ended) {
        void node.audio.play().catch(() => {
          if (slotsRef.current.get(node.slotId) !== node) return;
          if (node.audio.readyState === 0 && node.blobUrl) {
            try {
              node.audio.load();
              if (rewindIfEnded && isAtOrNearEnd) {
                node.audio.currentTime = 0;
              }
              void node.audio.play().catch(() => undefined);
            } catch {
              // Ignore retry failure
            }
          }
        });
      }
    },
    [ensureWebAudioGraph, loadSlotSource, syncNodeRuntime],
  );

  // Synchronize HTMLAudioElements with audioState.activeSlots
  useEffect(() => {
    const activeSlots = audioState.activeSlots;
    const activeSlotIds = new Set(activeSlots.map((sl) => sl.slotId));

    // Remove stale slots
    for (const [slotId, node] of slotsRef.current.entries()) {
      if (!activeSlotIds.has(slotId)) {
        persistSlotPosition(node);
        try {
          node.audio.pause();
          node.audio.removeAttribute("src");
          node.audio.load();
        } catch {
          // Ignore cleanup errors
        }
        node.revokeUrl?.();
        try {
          node.sourceNode?.disconnect();
          node.gainNode?.disconnect();
        } catch {
          // Ignore disconnect errors
        }
        slotsRef.current.delete(slotId);
        setSlotRuntime((prev) => {
          const next = { ...prev };
          delete next[slotId];
          return next;
        });
      }
    }

    if (activeSlots.length === 0) {
      setAllPausedSync(true);
      return;
    }

    // Create or update slots
    for (const slot of activeSlots) {
      const existing = slotsRef.current.get(slot.slotId);
      const needsNewTrackLoad = !existing || existing.trackId !== slot.trackId;

      if (needsNewTrackLoad) {
        if (existing) {
          persistSlotPosition(existing);
          try {
            existing.audio.pause();
            existing.audio.removeAttribute("src");
            existing.audio.load();
          } catch {
            // Ignore
          }
          existing.revokeUrl?.();
          try {
            existing.sourceNode?.disconnect();
            existing.gainNode?.disconnect();
          } catch {
            // Ignore
          }
          slotsRef.current.delete(slot.slotId);
        }

        const track = trackMapRef.current.get(slot.trackId);
        if (!track) continue;

        const audio = new Audio();
        audio.preload = "auto";
        audio.loop = Boolean(slot.loop);
        audio.playbackRate = Math.max(0.5, Math.min(3, slot.playbackRate || 1));

        const node: InternalSlotNode = {
          slotId: slot.slotId,
          trackId: slot.trackId,
          audio,
          blobUrl: null,
          revokeUrl: null,
          sourceNode: null,
          gainNode: null,
          initialSeekApplied: false,
          lastSavedAt: Date.now(),
          loading: true,
          error: false,
        };
        slotsRef.current.set(slot.slotId, node);

        const graph = ensureWebAudioGraph();
        if (graph) {
          try {
            const source = graph.ctx.createMediaElementSource(audio);
            const gain = graph.ctx.createGain();
            source.connect(gain);
            gain.connect(graph.low);
            node.sourceNode = source;
            node.gainNode = gain;
          } catch {
            // Fallback to native HTMLAudioElement volume
          }
        }

        setSlotRuntime((prev) => ({
          ...prev,
          [slot.slotId]: {
            currentTime: track.currentPositionSeconds || 0,
            duration: track.durationSeconds || 0,
            playing: false,
            loading: true,
            error: false,
          },
        }));

        audio.addEventListener("loadedmetadata", () => {
          if (slotsRef.current.get(slot.slotId) !== node) return;
          node.loading = false;
          const liveTrack = trackMapRef.current.get(slot.trackId);
          const dur =
            Number.isFinite(audio.duration) && audio.duration > 0
              ? audio.duration
              : liveTrack?.durationSeconds ?? 0;

          if (liveTrack && dur > 0 && liveTrack.durationSeconds <= 0) {
            onUpdateTrackRef.current(liveTrack.id, { durationSeconds: dur });
          }

          if (!node.initialSeekApplied && liveTrack) {
            node.initialSeekApplied = true;
            const saved = liveTrack.currentPositionSeconds || 0;
            if (saved > 0.5 && (dur <= 0 || saved < dur - 1.5)) {
              try {
                audio.currentTime = saved;
              } catch {
                // Ignore early seek failure
              }
            }
          }
          syncNodeRuntime(node);
        });

        audio.addEventListener("timeupdate", () => {
          if (slotsRef.current.get(slot.slotId) !== node) return;
          const liveSlot = audioStateRef.current.activeSlots.find(
            (s) => s.slotId === slot.slotId,
          );
          if (
            liveSlot &&
            liveSlot.abLoopStart != null &&
            liveSlot.abLoopEnd != null &&
            liveSlot.abLoopEnd > liveSlot.abLoopStart + 0.25 &&
            audio.currentTime >= liveSlot.abLoopEnd
          ) {
            audio.currentTime = Math.max(0, liveSlot.abLoopStart);
          }

          if (!audio.paused && Date.now() - node.lastSavedAt >= 4000) {
            persistSlotPosition(node);
          }
          syncNodeRuntime(node);
        });

        audio.addEventListener("play", () => {
          if (slotsRef.current.get(slot.slotId) !== node) return;
          syncNodeRuntime(node);
        });
        audio.addEventListener("pause", () => {
          if (slotsRef.current.get(slot.slotId) !== node) return;
          persistSlotPosition(node);
          syncNodeRuntime(node);
        });

        audio.addEventListener("ended", () => {
          if (slotsRef.current.get(slot.slotId) !== node) return;
          persistSlotPosition(node, true);
          const state = audioStateRef.current;
          const isPrimary =
            state.primaryTrackId === slot.trackId ||
            state.activeSlots.length === 1;
          if (!isPrimary) {
            syncNodeRuntime(node);
            return;
          }

          if (state.repeatMode === "one") {
            audio.currentTime = 0;
            void audio.play().catch(() => undefined);
            syncNodeRuntime(node);
            return;
          }

          const nextId = getNextTrackId(slot.trackId, false);
          if (nextId) {
            switchPrimaryTrack(nextId);
          } else {
            setAllPausedSync(true);
            syncNodeRuntime(node);
          }
        });

        audio.addEventListener("error", () => {
          if (slotsRef.current.get(slot.slotId) !== node) return;
          // Ignore blank src teardown error
          if (!audio.getAttribute("src")) return;
          node.loading = false;
          node.error = true;
          syncNodeRuntime(node);
        });

        loadSlotSource(node, track);
      }
    }

    syncAudioGains();
  }, [
    audioState.activeSlots,
    ensureWebAudioGraph,
    getNextTrackId,
    loadSlotSource,
    persistSlotPosition,
    setAllPausedSync,
    switchPrimaryTrack,
    syncAudioGains,
    syncNodeRuntime,
  ]);

  // Keep gain & EQ settings synced whenever mix sliders or EQ change
  useEffect(() => {
    syncAudioGains();
  }, [
    audioState.activeSlots,
    audioState.masterVolume,
    audioState.eqPreset,
    viewMuted,
    syncAudioGains,
  ]);

  // Flush track positions cleanly before tab close / unmount
  useEffect(() => {
    const flushAll = () => {
      for (const node of slotsRef.current.values()) {
        persistSlotPosition(node);
      }
    };
    window.addEventListener("pagehide", flushAll);
    window.addEventListener("beforeunload", flushAll);
    return () => {
      window.removeEventListener("pagehide", flushAll);
      window.removeEventListener("beforeunload", flushAll);
      flushAll();
      for (const node of slotsRef.current.values()) {
        try {
          node.audio.pause();
          node.audio.removeAttribute("src");
          node.audio.load();
        } catch {
          // Ignore
        }
        node.revokeUrl?.();
      }
      slotsRef.current.clear();
      try {
        void audioCtxRef.current?.close();
      } catch {
        // Ignore
      }
    };
  }, [persistSlotPosition]);

  const togglePlayPauseAll = useCallback(() => {
    const slots = audioStateRef.current.activeSlots;
    if (slots.length === 0) return;
    ensureWebAudioGraph();

    const anyPlaying = Array.from(slotsRef.current.values()).some(
      (n) => !n.audio.paused && !n.audio.ended,
    );

    if (anyPlaying && !isAllPausedRef.current) {
      setAllPausedSync(true);
      for (const node of slotsRef.current.values()) {
        node.audio.pause();
        persistSlotPosition(node);
      }
    } else {
      setAllPausedSync(false);
      for (const node of slotsRef.current.values()) {
        playNodeAudio(node, true);
      }
    }
  }, [ensureWebAudioGraph, persistSlotPosition, playNodeAudio, setAllPausedSync]);

  const ensurePlaying = useCallback(
    (options?: { rewindIfEndedTrackId?: string }) => {
      ensureWebAudioGraph();
      setAllPausedSync(false);
      for (const node of slotsRef.current.values()) {
        const shouldRewindTrack =
          !options?.rewindIfEndedTrackId ||
          node.trackId === options.rewindIfEndedTrackId;
        if (
          shouldRewindTrack ||
          node.audio.paused ||
          node.audio.ended ||
          node.error ||
          !node.blobUrl
        ) {
          playNodeAudio(node, true);
        }
      }
    },
    [ensureWebAudioGraph, playNodeAudio, setAllPausedSync],
  );

  const togglePlaySlot = useCallback(
    (slotId: string) => {
      const node = slotsRef.current.get(slotId);
      if (!node) return;
      ensureWebAudioGraph();
      if (node.audio.paused || node.audio.ended || node.error || !node.blobUrl) {
        setAllPausedSync(false);
        playNodeAudio(node, true);
      } else {
        node.audio.pause();
        persistSlotPosition(node);
      }
    },
    [ensureWebAudioGraph, persistSlotPosition, playNodeAudio, setAllPausedSync],
  );

  const seekSlot = useCallback(
    (slotId: string, seconds: number) => {
      const node = slotsRef.current.get(slotId);
      if (!node) return;
      const track = trackMapRef.current.get(node.trackId);
      const dur =
        Number.isFinite(node.audio.duration) && node.audio.duration > 0
          ? node.audio.duration
          : track?.durationSeconds ?? 0;
      const clamped = Math.max(0, dur > 0 ? Math.min(dur, seconds) : seconds);
      try {
        node.audio.currentTime = clamped;
      } catch {
        // Ignore early seek failure
      }
      setSlotRuntime((prev) => ({
        ...prev,
        [slotId]: {
          ...(prev[slotId] ?? {
            duration: dur,
            playing: !node.audio.paused,
            loading: node.loading,
            error: node.error,
          }),
          currentTime: clamped,
        },
      }));
      persistSlotPosition(node);
    },
    [persistSlotPosition],
  );

  const skipPrimary = useCallback(
    (deltaSeconds: number) => {
      const state = audioStateRef.current;
      const targetSlot =
        state.activeSlots.find((sl) => sl.trackId === state.primaryTrackId) ??
        state.activeSlots[0];
      if (!targetSlot) return;
      const node = slotsRef.current.get(targetSlot.slotId);
      if (!node) return;
      seekSlot(targetSlot.slotId, (node.audio.currentTime || 0) + deltaSeconds);
    },
    [seekSlot],
  );

  const toggleViewMute = useCallback(() => {
    setViewMuted((v) => !v);
  }, []);

  const stopAll = useCallback(() => {
    setAllPausedSync(true);
    setSleepRemainingSeconds(null);
    sleepFadeRef.current = 1;
    for (const node of slotsRef.current.values()) {
      try {
        node.audio.pause();
        persistSlotPosition(node);
      } catch {
        // Ignore
      }
    }
  }, [persistSlotPosition, setAllPausedSync]);

  // Sleep Timer with smooth 8-second fade-out
  useEffect(() => {
    if (sleepRemainingSeconds === null) {
      sleepFadeRef.current = 1;
      syncAudioGains();
      return;
    }

    if (sleepRemainingSeconds <= 0) {
      sleepFadeRef.current = 1;
      setSleepRemainingSeconds(null);
      setAllPausedSync(true);
      for (const node of slotsRef.current.values()) {
        node.audio.pause();
        persistSlotPosition(node);
      }
      syncAudioGains();
      return;
    }

    if (sleepRemainingSeconds <= 8) {
      sleepFadeRef.current = Math.max(0.03, sleepRemainingSeconds / 8);
      syncAudioGains();
    } else if (sleepFadeRef.current !== 1) {
      sleepFadeRef.current = 1;
      syncAudioGains();
    }

    const timer = window.setTimeout(() => {
      setSleepRemainingSeconds((prev) => (prev === null ? null : prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [sleepRemainingSeconds, persistSlotPosition, syncAudioGains]);

  const startSleepTimer = useCallback((minutes: number) => {
    sleepFadeRef.current = 1;
    setSleepRemainingSeconds(Math.max(1, Math.round(minutes * 60)));
  }, []);

  const cancelSleepTimer = useCallback(() => {
    sleepFadeRef.current = 1;
    setSleepRemainingSeconds(null);
    syncAudioGains();
  }, [syncAudioGains]);

  // Compute summary for App.tsx sidebar/mini-player, Web MediaSession, & Android Notification
  const primarySlot: AudioMixSlot | null = useMemo(() => {
    if (audioState.activeSlots.length === 0) return null;
    return (
      audioState.activeSlots.find(
        (sl) => sl.trackId === audioState.primaryTrackId,
      ) ?? audioState.activeSlots[0]
    );
  }, [audioState.activeSlots, audioState.primaryTrackId]);

  const primaryTrack = primarySlot
    ? trackMap.get(primarySlot.trackId) ?? null
    : null;

  const playingCount = useMemo(() => {
    let count = 0;
    for (const slot of audioState.activeSlots) {
      if (slotRuntime[slot.slotId]?.playing) count++;
    }
    return count;
  }, [audioState.activeSlots, slotRuntime]);

  const isPlaying =
    audioState.activeSlots.length > 0 && !isAllPaused && playingCount > 0;

  const primaryRt = primarySlot ? slotRuntime[primarySlot.slotId] : undefined;

  const summaryCurrentTime = Math.floor(
    primaryRt?.currentTime ?? primaryTrack?.currentPositionSeconds ?? 0,
  );
  const summaryDuration = Math.floor(
    primaryRt?.duration ?? primaryTrack?.durationSeconds ?? 0,
  );

  const summary: AudioPlaybackSummary = useMemo(
    () => ({
      activeCount: audioState.activeSlots.length,
      playingCount,
      isPlaying,
      isViewMuted: viewMuted,
      isAllPaused: isAllPaused && audioState.activeSlots.length > 0,
      primaryTrackId: primaryTrack?.id ?? null,
      primaryTitle: primaryTrack?.title ?? null,
      primaryArtist: primaryTrack?.artist ?? null,
      primaryCoverDataUrl: primaryTrack?.coverDataUrl ?? null,
      currentTime: summaryCurrentTime,
      duration: summaryDuration,
    }),
    [
      audioState.activeSlots.length,
      playingCount,
      isPlaying,
      viewMuted,
      isAllPaused,
      primaryTrack?.id,
      primaryTrack?.title,
      primaryTrack?.artist,
      primaryTrack?.coverDataUrl,
      summaryCurrentTime,
      summaryDuration,
    ],
  );

  const lastEmittedSummaryRef = useRef<AudioPlaybackSummary | null>(null);
  useEffect(() => {
    if (!onPlaybackStateChange) return;
    const prev = lastEmittedSummaryRef.current;
    if (
      prev &&
      prev.activeCount === summary.activeCount &&
      prev.playingCount === summary.playingCount &&
      prev.isPlaying === summary.isPlaying &&
      prev.isViewMuted === summary.isViewMuted &&
      prev.isAllPaused === summary.isAllPaused &&
      prev.primaryTrackId === summary.primaryTrackId &&
      prev.primaryTitle === summary.primaryTitle &&
      prev.primaryArtist === summary.primaryArtist &&
      prev.primaryCoverDataUrl === summary.primaryCoverDataUrl &&
      prev.currentTime === summary.currentTime &&
      prev.duration === summary.duration
    ) {
      return;
    }
    lastEmittedSummaryRef.current = summary;
    onPlaybackStateChange(summary);
  }, [summary, onPlaybackStateChange]);

  // Web MediaSession metadata & transport actions (desktop & browser lock screen)
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    const ms = navigator.mediaSession;
    if (!primaryTrack || audioState.activeSlots.length === 0) {
      ms.playbackState = "none";
      return;
    }

    try {
      if (typeof MediaMetadata !== "undefined") {
        ms.metadata = new MediaMetadata({
          title:
            audioState.activeSlots.length > 1
              ? `${primaryTrack.title} (+${audioState.activeSlots.length - 1} mix)`
              : primaryTrack.title,
          artist: primaryTrack.artist || "Unknown Artist",
          album: primaryTrack.album || "Kanso Audio",
          artwork: primaryTrack.coverDataUrl
            ? [{ src: primaryTrack.coverDataUrl }]
            : undefined,
        });
      }
      ms.playbackState = isPlaying ? "playing" : "paused";
      ms.setActionHandler("play", () => {
        if (isAllPausedRef.current) togglePlayPauseAll();
      });
      ms.setActionHandler("pause", () => {
        if (!isAllPausedRef.current) togglePlayPauseAll();
      });
      ms.setActionHandler("nexttrack", () => playNext(true));
      ms.setActionHandler("previoustrack", () => playPrev());
      ms.setActionHandler("seekbackward", () => skipPrimary(-15));
      ms.setActionHandler("seekforward", () => skipPrimary(30));
      ms.setActionHandler("stop", () => stopAll());
    } catch {
      // Ignore MediaSession errors on unsupported platforms
    }
  }, [
    primaryTrack,
    audioState.activeSlots.length,
    isPlaying,
    togglePlayPauseAll,
    playNext,
    playPrev,
    skipPrimary,
    stopAll,
  ]);

  // Native Android Foreground Media Service sync & notification transport buttons
  const hasSyncedAndroidRef = useRef(false);
  useEffect(() => {
    if (!isAndroidCapacitor()) return;
    if (audioState.activeSlots.length === 0) {
      if (hasSyncedAndroidRef.current) {
        hasSyncedAndroidRef.current = false;
        void syncAndroidBackgroundAudio({
          playing: false,
          keepServiceAlive: false,
          showTrackControls: true,
        });
      }
      return;
    }

    if (isPlaying || hasSyncedAndroidRef.current) {
      hasSyncedAndroidRef.current = true;
      void syncAndroidBackgroundAudio({
        playing: isPlaying,
        title:
          audioState.activeSlots.length > 1 && primaryTrack
            ? `${primaryTrack.title} (+${audioState.activeSlots.length - 1} mix)`
            : primaryTrack?.title || "Kanso Audio",
        subtitle: primaryTrack?.artist || "Offline Audio Studio",
        keepServiceAlive: true,
        showTrackControls: true,
      });
    }
  }, [audioState.activeSlots.length, isPlaying, primaryTrack]);

  useEffect(() => {
    if (!isAndroidCapacitor()) return;
    return subscribeAndroidMediaControls((action) => {
      if (audioStateRef.current.activeSlots.length === 0) return;
      if (action === "play") {
        if (isAllPausedRef.current) togglePlayPauseAll();
      } else if (action === "pause") {
        if (!isAllPausedRef.current) togglePlayPauseAll();
      } else if (action === "next") {
        playNext(true);
      } else if (action === "previous") {
        playPrev();
      } else if (action === "stop") {
        stopAll();
      }
    });
  }, [togglePlayPauseAll, playNext, playPrev, stopAll]);

  return {
    viewMuted,
    isAllPaused,
    isPlaying,
    slotRuntime,
    sleepRemainingSeconds,
    analyserNode,
    summary,
    primarySlot,
    primaryTrack,
    ensurePlaying,
    togglePlayPauseAll,
    togglePlaySlot,
    toggleViewMute,
    seekSlot,
    skipPrimary,
    playNext,
    playPrev,
    stopAll,
    startSleepTimer,
    cancelSleepTimer,
  };
}
