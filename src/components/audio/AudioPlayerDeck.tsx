import {
  Activity,
  AudioWaveform,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  Clock,
  GripVertical,
  Layers,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { SlotRuntimeInfo } from "../../hooks/useAudioMixerEngine";
import {
  AUDIO_EQ_PRESETS,
  formatAudioDuration,
} from "../../lib/audioFormatters";
import type {
  AudioEqPreset,
  AudioMixSlot,
  AudioRepeatMode,
  AudioStudioState,
  AudioTrackRecord,
} from "../../types/audio";
import { AudioArtwork } from "./AudioArtwork";
import { extractDraggedAudioIds, hasDraggedAudioPayload } from "./AudioSidebar";

interface AudioPlayerDeckProps {
  tracks: AudioTrackRecord[];
  audioState: AudioStudioState;
  primarySlot: AudioMixSlot | null;
  primaryTrack: AudioTrackRecord | null;
  slotRuntime: Record<string, SlotRuntimeInfo>;
  isPlaying: boolean;
  isAllPaused: boolean;
  viewMuted: boolean;
  sleepRemainingSeconds: number | null;
  analyserNode: AnalyserNode | null;
  visualizerMode: "spectrum" | "waveform";
  onChangeVisualizerMode: (mode: "spectrum" | "waveform") => void;
  onTogglePlayPauseAll: () => void;
  onTogglePlaySlot: (slotId: string) => void;
  onToggleViewMute: () => void;
  onSeekSlot: (slotId: string, seconds: number) => void;
  onSkipPrimary: (deltaSeconds: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onUpdateAudioState: (
    patch:
      | Partial<AudioStudioState>
      | ((prev: AudioStudioState) => AudioStudioState),
  ) => void;
  onUpdateSlot: (slotId: string, patch: Partial<AudioMixSlot>) => void;
  onRemoveSlot: (slotId: string) => void;
  onReorderSlots: (fromIndex: number, toIndex: number) => void;
  onClearSlots: () => void;
  onSetEqPreset: (preset: AudioEqPreset) => void;
  onStartSleepTimer: (minutes: number) => void;
  onCancelSleepTimer: () => void;
  onSaveMixPreset: (name: string, category?: string) => void;
  onDropTracksToMix: (trackIds: string[]) => void;
  onDropTracksToQueue: (trackIds: string[]) => void;
  onSelectTrackToPlay: (trackId: string) => void;
}

const SLEEP_PRESETS = [15, 30, 45, 60, 90];
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const AudioPlayerDeck: React.FC<AudioPlayerDeckProps> = ({
  tracks,
  audioState,
  primarySlot,
  primaryTrack,
  slotRuntime,
  isPlaying,
  isAllPaused,
  viewMuted,
  sleepRemainingSeconds,
  analyserNode,
  visualizerMode,
  onChangeVisualizerMode,
  onTogglePlayPauseAll,
  onTogglePlaySlot,
  onToggleViewMute,
  onSeekSlot,
  onSkipPrimary,
  onNext,
  onPrev,
  onUpdateAudioState,
  onUpdateSlot,
  onRemoveSlot,
  onReorderSlots,
  onClearSlots,
  onSetEqPreset,
  onStartSleepTimer,
  onCancelSleepTimer,
  onSaveMixPreset,
  onDropTracksToMix,
  onDropTracksToQueue,
  onSelectTrackToPlay,
}) => {
  const [panelTab, setPanelTab] = useState<"mixer" | "queue" | "dsp">("mixer");
  const [openPopover, setOpenPopover] = useState<
    "sleep" | "eq" | "speed" | "save" | null
  >(null);
  const [customSleepMins, setCustomSleepMins] = useState("25");
  const [presetName, setPresetName] = useState("");
  const [dropZoneOver, setDropZoneOver] = useState<"deck" | "queue" | null>(
    null,
  );
  const [draggedSlotIndex, setDraggedSlotIndex] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const popoverRootRef = useRef<HTMLDivElement | null>(null);
  const draggingSeekRef = useRef(false);

  const trackMap = new Map(tracks.map((t) => [t.id, t]));
  const primaryRt = primarySlot ? slotRuntime[primarySlot.slotId] : undefined;
  const currentTime =
    primaryRt?.currentTime ?? primaryTrack?.currentPositionSeconds ?? 0;
  const duration = primaryRt?.duration ?? primaryTrack?.durationSeconds ?? 0;
  const primaryRate = primarySlot?.playbackRate ?? 1;

  useEffect(() => {
    if (!openPopover) return;
    const onDown = (e: MouseEvent) => {
      if (
        popoverRootRef.current &&
        !popoverRootRef.current.contains(e.target as Node)
      ) {
        setOpenPopover(null);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [openPopover]);

  // Interactive Canvas Waveform & Live Spectrum Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId = 0;

    const peaks =
      primaryTrack?.waveformPeaks && primaryTrack.waveformPeaks.length > 0
        ? primaryTrack.waveformPeaks
        : Array.from({ length: 56 }, (_, i) =>
            Math.max(
              0.2,
              Math.min(0.95, 0.45 + 0.35 * Math.sin(i * 0.45) * Math.cos(i * 0.17)),
            ),
          );

    const freqData = analyserNode
      ? new Uint8Array(analyserNode.frequencyBinCount)
      : null;

    const drawFrame = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(120, Math.round(rect.width));
      const height = Math.max(24, Math.round(rect.height));
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cs = getComputedStyle(document.documentElement);
      const accentColor = cs.getPropertyValue("--accent").trim() || "#b45309";
      const mutedColor =
        cs.getPropertyValue("--border-strong").trim() || "#9ca3af";
      const softAccent =
        cs.getPropertyValue("--accent-soft").trim() || "rgba(180,83,9,0.2)";

      const ratio =
        duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;

      // A-B Loop Highlight Region
      if (
        duration > 0 &&
        primarySlot?.abLoopStart != null &&
        primarySlot?.abLoopEnd != null &&
        primarySlot.abLoopEnd > primarySlot.abLoopStart
      ) {
        const xA = (primarySlot.abLoopStart / duration) * width;
        const xB = (primarySlot.abLoopEnd / duration) * width;
        ctx.fillStyle = softAccent;
        ctx.fillRect(xA, 0, Math.max(2, xB - xA), height);
      }

      if (visualizerMode === "spectrum" && analyserNode && freqData && isPlaying) {
        analyserNode.getByteFrequencyData(freqData);
        const bars = peaks.length;
        const barW = width / bars;
        const gap = Math.max(1, barW * 0.25);
        for (let i = 0; i < bars; i++) {
          const binIdx = Math.min(
            freqData.length - 1,
            Math.floor((i / bars) * freqData.length * 0.8),
          );
          const amp = Math.max(0.12, (freqData[binIdx] || 0) / 255);
          const combined = amp * 0.72 + peaks[i] * 0.28;
          const barH = Math.max(3, combined * (height - 4));
          const x = i * barW;
          const isPlayed = i / bars <= ratio;
          ctx.fillStyle = isPlayed ? accentColor : mutedColor;
          ctx.globalAlpha = isPlayed ? 0.95 : 0.45;
          ctx.fillRect(
            x + gap / 2,
            (height - barH) / 2,
            Math.max(1.5, barW - gap),
            barH,
          );
        }
      } else {
        const bars = peaks.length;
        const barW = width / bars;
        const gap = Math.max(1, barW * 0.28);
        for (let i = 0; i < bars; i++) {
          const barH = Math.max(3, peaks[i] * (height - 4));
          const x = i * barW;
          const isPlayed = i / bars <= ratio;
          ctx.fillStyle = isPlayed ? accentColor : mutedColor;
          ctx.globalAlpha = isPlayed ? 0.95 : 0.42;
          ctx.fillRect(
            x + gap / 2,
            (height - barH) / 2,
            Math.max(1.5, barW - gap),
            barH,
          );
        }
      }

      // Playhead marker
      if (duration > 0) {
        const px = Math.max(1, Math.min(width - 2, ratio * width));
        ctx.globalAlpha = 1;
        ctx.fillStyle = accentColor;
        ctx.fillRect(px - 1, 0, 2, height);
      }

      ctx.restore();

      if (isPlaying && visualizerMode === "spectrum") {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    drawFrame();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [
    primaryTrack,
    primarySlot?.abLoopStart,
    primarySlot?.abLoopEnd,
    currentTime,
    duration,
    isPlaying,
    analyserNode,
    visualizerMode,
  ]);

  const seekFromCanvasPointer = useCallback(
    (clientX: number) => {
      if (!canvasRef.current || !primarySlot || duration <= 0) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)),
      );
      onSeekSlot(primarySlot.slotId, ratio * duration);
    },
    [primarySlot, duration, onSeekSlot],
  );

  const cycleRepeat = () => {
    const order: AudioRepeatMode[] = ["off", "all", "one"];
    const next =
      order[(order.indexOf(audioState.repeatMode) + 1) % order.length];
    onUpdateAudioState({ repeatMode: next });
  };

  const handleSetA = () => {
    if (!primarySlot) return;
    onUpdateSlot(primarySlot.slotId, {
      abLoopStart: Math.round(currentTime * 10) / 10,
      abLoopEnd:
        primarySlot.abLoopEnd != null && primarySlot.abLoopEnd > currentTime + 0.3
          ? primarySlot.abLoopEnd
          : null,
    });
  };

  const handleSetB = () => {
    if (!primarySlot) return;
    const start = primarySlot.abLoopStart ?? 0;
    if (currentTime <= start + 0.3) return;
    onUpdateSlot(primarySlot.slotId, {
      abLoopStart: start,
      abLoopEnd: Math.round(currentTime * 10) / 10,
    });
  };

  const handleClearAB = () => {
    if (!primarySlot) return;
    onUpdateSlot(primarySlot.slotId, { abLoopStart: null, abLoopEnd: null });
  };

  const activeCount = audioState.activeSlots.length;
  const hasAbLoop =
    primarySlot?.abLoopStart != null || primarySlot?.abLoopEnd != null;

  return (
    <div
      ref={popoverRootRef}
      onDragOver={(e) => {
        if (hasDraggedAudioPayload(e.dataTransfer)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDropZoneOver("deck");
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDropZoneOver(null);
        }
      }}
      onDrop={(e) => {
        const ids = extractDraggedAudioIds(e.dataTransfer);
        setDropZoneOver(null);
        if (ids.length > 0) {
          e.preventDefault();
          onDropTracksToMix(ids);
        }
      }}
      className={`shrink-0 border-t bg-[var(--bg-elevated)] transition-colors select-none ${
        dropZoneOver === "deck"
          ? "ring-2 ring-inset ring-[var(--accent)] bg-[var(--bg-accent-subtle)]"
          : "border-[var(--border-subtle)]"
      }`}
    >
      {/* Expandable Multi-Track Mixer / Queue / DSP Drawer */}
      {audioState.mixerExpanded && (
        <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] max-h-[42dvh] flex flex-col">
          {/* Drawer Header Tabs */}
          <div className="px-4 sm:px-6 py-2 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="inline-flex items-center gap-1 p-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
              <button
                type="button"
                onClick={() => setPanelTab("mixer")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                  panelTab === "mixer"
                    ? "bg-[var(--bg-surface)] text-[var(--accent)] shadow-xs"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Mixer Layers ({activeCount})</span>
              </button>
              <button
                type="button"
                onDragOver={(e) => {
                  if (hasDraggedAudioPayload(e.dataTransfer)) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDropZoneOver("queue");
                  }
                }}
                onDrop={(e) => {
                  const ids = extractDraggedAudioIds(e.dataTransfer);
                  setDropZoneOver(null);
                  if (ids.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    onDropTracksToQueue(ids);
                    setPanelTab("queue");
                  }
                }}
                onClick={() => setPanelTab("queue")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                  dropZoneOver === "queue"
                    ? "ring-1 ring-[var(--accent)] text-[var(--accent)]"
                    : panelTab === "queue"
                      ? "bg-[var(--bg-surface)] text-[var(--accent)] shadow-xs"
                      : "text-[var(--text-secondary)]"
                }`}
              >
                <ListMusic className="w-3.5 h-3.5" />
                <span>Queue ({audioState.queueTrackIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setPanelTab("dsp")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                  panelTab === "dsp"
                    ? "bg-[var(--bg-surface)] text-[var(--accent)] shadow-xs"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>EQ &amp; A-B Loop</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {activeCount > 0 && (
                <>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPopover((p) => (p === "save" ? null : "save"))
                      }
                      className="h-7 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-medium text-[var(--text-primary)] hover:border-[var(--accent)] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <BookmarkPlus className="w-3 h-3 text-[var(--accent)]" />
                      <span>Save Mix</span>
                    </button>
                    {openPopover === "save" && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!presetName.trim()) return;
                          onSaveMixPreset(presetName.trim());
                          setPresetName("");
                          setOpenPopover(null);
                        }}
                        className="absolute right-0 bottom-full mb-1.5 w-64 p-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-xl space-y-2 z-50"
                      >
                        <div className="text-xs font-semibold">
                          Save Multi-Track Mix Preset
                        </div>
                        <input
                          type="text"
                          autoFocus
                          value={presetName}
                          onChange={(e) => setPresetName(e.target.value)}
                          placeholder="e.g. Rain + Lofi Focus..."
                          className="w-full h-8 px-2.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] text-xs text-[var(--text-primary)]"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setOpenPopover(null)}
                            className="px-2.5 py-1 text-xs text-[var(--text-muted)] cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={!presetName.trim()}
                            className="px-3 py-1 rounded-md text-xs font-medium bg-[var(--accent)] text-[var(--accent-contrast)] disabled:opacity-45 cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onClearSlots}
                    className="h-7 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--danger)] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear Mix</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => onUpdateAudioState({ mixerExpanded: false })}
                aria-label="Collapse mixer drawer"
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3">
            {panelTab === "mixer" && (
              <>
                {audioState.activeSlots.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] py-3">
                    No active tracks in the mixer yet. Click Play or drag any
                    track card here to layer soundscapes, podcasts, or music
                    simultaneously.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {audioState.activeSlots.map((slot, idx) => {
                      const track = trackMap.get(slot.trackId);
                      if (!track) return null;
                      const rt = slotRuntime[slot.slotId];
                      const slotPos =
                        rt?.currentTime ?? track.currentPositionSeconds ?? 0;
                      const slotDur =
                        rt?.duration ?? track.durationSeconds ?? 0;
                      const slotPlaying = Boolean(rt?.playing);
                      const isPrimary =
                        audioState.primaryTrackId === track.id;

                      return (
                        <div
                          key={slot.slotId}
                          draggable
                          onDragStart={() => setDraggedSlotIndex(idx)}
                          onDragOver={(e) => {
                            if (draggedSlotIndex !== null) e.preventDefault();
                          }}
                          onDrop={(e) => {
                            if (
                              draggedSlotIndex !== null &&
                              draggedSlotIndex !== idx
                            ) {
                              e.preventDefault();
                              onReorderSlots(draggedSlotIndex, idx);
                            }
                            setDraggedSlotIndex(null);
                          }}
                          onDragEnd={() => setDraggedSlotIndex(null)}
                          className={`p-2.5 rounded-lg border flex flex-col gap-2 bg-[var(--bg-canvas)] transition-colors ${
                            isPrimary
                              ? "border-[var(--accent)]"
                              : "border-[var(--border-subtle)]"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <GripVertical className="w-3.5 h-3.5 text-[var(--text-muted)] cursor-grab shrink-0" />
                            <button
                              type="button"
                              onClick={() => onTogglePlaySlot(slot.slotId)}
                              className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--accent)] text-[var(--accent-contrast)] shrink-0 cursor-pointer"
                              aria-label={
                                slotPlaying
                                  ? `Pause ${track.title}`
                                  : `Play ${track.title}`
                              }
                            >
                              {slotPlaying ? (
                                <Pause className="w-3 h-3 fill-current" />
                              ) : (
                                <Play className="w-3 h-3 fill-current ml-0.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateAudioState({ primaryTrackId: track.id })
                              }
                              className="min-w-0 flex-1 text-left cursor-pointer"
                            >
                              <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                                {track.title}
                              </div>
                              <div className="text-[10px] font-mono tabular-nums text-[var(--text-muted)] truncate">
                                {formatAudioDuration(slotPos)} /{" "}
                                {formatAudioDuration(slotDur)} ·{" "}
                                {slot.playbackRate}x
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveSlot(slot.slotId)}
                              title="Remove from mixer"
                              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Slot Seek Mini-Slider */}
                          <input
                            type="range"
                            min={0}
                            max={Math.max(1, slotDur)}
                            step={0.5}
                            value={Math.min(slotPos, Math.max(1, slotDur))}
                            onChange={(e) =>
                              onSeekSlot(slot.slotId, Number(e.target.value))
                            }
                            aria-label={`Seek ${track.title}`}
                            className="w-full h-1 accent-[var(--accent)] cursor-pointer"
                          />

                          {/* Per-Slot Controls */}
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateSlot(slot.slotId, {
                                    muted: !slot.muted,
                                  })
                                }
                                title={slot.muted ? "Unmute layer" : "Mute layer"}
                                className={`p-1 rounded border cursor-pointer ${
                                  slot.muted
                                    ? "border-[var(--danger)] text-[var(--danger)]"
                                    : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
                                }`}
                              >
                                {slot.muted ? (
                                  <VolumeX className="w-3 h-3" />
                                ) : (
                                  <Volume2 className="w-3 h-3" />
                                )}
                              </button>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={slot.volume}
                                onChange={(e) =>
                                  onUpdateSlot(slot.slotId, {
                                    volume: Number(e.target.value),
                                    muted: false,
                                  })
                                }
                                aria-label={`Volume for ${track.title}`}
                                className="w-full max-w-[90px] accent-[var(--accent)] cursor-pointer"
                              />
                              <span className="font-mono tabular-nums text-[10px] text-[var(--text-muted)] w-7">
                                {slot.volume}%
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateSlot(slot.slotId, {
                                    solo: !slot.solo,
                                  })
                                }
                                title="Solo this layer"
                                className={`px-1.5 py-0.5 rounded border font-mono text-[10px] font-semibold cursor-pointer ${
                                  slot.solo
                                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                                    : "border-[var(--border-subtle)] text-[var(--text-muted)]"
                                }`}
                              >
                                S
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateSlot(slot.slotId, {
                                    loop: !slot.loop,
                                  })
                                }
                                title="Loop this layer"
                                className={`p-1 rounded border cursor-pointer ${
                                  slot.loop
                                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                                    : "border-[var(--border-subtle)] text-[var(--text-muted)]"
                                }`}
                              >
                                <Repeat1 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextRate =
                                    SPEED_OPTIONS[
                                      (SPEED_OPTIONS.indexOf(
                                        slot.playbackRate,
                                      ) +
                                        1) %
                                        SPEED_OPTIONS.length
                                    ];
                                  onUpdateSlot(slot.slotId, {
                                    playbackRate: nextRate,
                                  });
                                }}
                                title="Cycle layer playback speed"
                                className="px-1.5 py-0.5 rounded border border-[var(--border-subtle)] font-mono tabular-nums text-[10px] text-[var(--text-secondary)] hover:border-[var(--accent)] cursor-pointer"
                              >
                                {slot.playbackRate}x
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {panelTab === "queue" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">
                    Up Next Queue ({audioState.queueTrackIds.length})
                  </span>
                  {audioState.queueTrackIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateAudioState({ queueTrackIds: [] })
                      }
                      className="text-[11px] text-[var(--danger)] hover:underline cursor-pointer"
                    >
                      Clear Queue
                    </button>
                  )}
                </div>
                {audioState.queueTrackIds.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] py-2">
                    Queue is empty. Drag tracks onto the Queue tab or use
                    &ldquo;Add to Queue&rdquo; from any track menu.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
                    {audioState.queueTrackIds.map((tid, qIdx) => {
                      const track = trackMap.get(tid);
                      if (!track) return null;
                      return (
                        <div
                          key={`${tid}_${qIdx}`}
                          className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateAudioState({
                                queueTrackIds: audioState.queueTrackIds.filter(
                                  (_, i) => i !== qIdx,
                                ),
                              });
                              onSelectTrackToPlay(tid);
                            }}
                            className="flex-1 min-w-0 text-left truncate hover:text-[var(--accent)] cursor-pointer"
                          >
                            <span className="font-mono tabular-nums text-[var(--text-muted)] mr-2">
                              {qIdx + 1}.
                            </span>
                            <span className="font-medium text-[var(--text-primary)]">
                              {track.title}
                            </span>
                            <span className="text-[var(--text-muted)] ml-2">
                              {track.artist}
                            </span>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            {qIdx > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [...audioState.queueTrackIds];
                                  [next[qIdx - 1], next[qIdx]] = [
                                    next[qIdx],
                                    next[qIdx - 1],
                                  ];
                                  onUpdateAudioState({ queueTrackIds: next });
                                }}
                                aria-label="Move up in queue"
                                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateAudioState({
                                  queueTrackIds:
                                    audioState.queueTrackIds.filter(
                                      (_, i) => i !== qIdx,
                                    ),
                                })
                              }
                              aria-label="Remove from queue"
                              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {panelTab === "dsp" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Equalizer Preset
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {AUDIO_EQ_PRESETS.map((eq) => {
                      const active = audioState.eqPreset === eq.id;
                      return (
                        <button
                          key={eq.id}
                          type="button"
                          onClick={() => onSetEqPreset(eq.id)}
                          title={eq.description}
                          className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                            active
                              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                              : "border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          <div className="text-xs font-medium">{eq.label}</div>
                          <div className="text-[10px] opacity-75 line-clamp-1">
                            {eq.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    A–B Section Loop{" "}
                    {primaryTrack ? `(${primaryTrack.title})` : ""}
                  </div>
                  <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!primarySlot}
                        onClick={handleSetA}
                        className="px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium hover:border-[var(--accent)] disabled:opacity-45 cursor-pointer"
                      >
                        Set A{" "}
                        {primarySlot?.abLoopStart != null
                          ? `(${formatAudioDuration(primarySlot.abLoopStart)})`
                          : ""}
                      </button>
                      <button
                        type="button"
                        disabled={!primarySlot}
                        onClick={handleSetB}
                        className="px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium hover:border-[var(--accent)] disabled:opacity-45 cursor-pointer"
                      >
                        Set B{" "}
                        {primarySlot?.abLoopEnd != null
                          ? `(${formatAudioDuration(primarySlot.abLoopEnd)})`
                          : ""}
                      </button>
                      {hasAbLoop && (
                        <button
                          type="button"
                          onClick={handleClearAB}
                          className="px-2.5 py-1.5 rounded-md text-xs text-[var(--danger)] hover:underline cursor-pointer"
                        >
                          Clear A–B
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Mark start (A) and end (B) timestamps while playing to
                      continuously loop any phrase, lecture section, or rhythm.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Persistent Bottom Transport Bar */}
      <div className="px-3 sm:px-6 py-2.5 flex flex-col gap-2">
        {/* Interactive Canvas Waveform & Seek Strip */}
        <div className="flex items-center gap-2.5">
          <span className="font-mono tabular-nums text-[11px] text-[var(--text-muted)] w-10 text-right shrink-0">
            {formatAudioDuration(currentTime)}
          </span>
          <canvas
            ref={canvasRef}
            onPointerDown={(e) => {
              if (!primarySlot || duration <= 0) return;
              draggingSeekRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              seekFromCanvasPointer(e.clientX);
            }}
            onPointerMove={(e) => {
              if (draggingSeekRef.current) {
                seekFromCanvasPointer(e.clientX);
              }
            }}
            onPointerUp={() => {
              draggingSeekRef.current = false;
            }}
            onPointerCancel={() => {
              draggingSeekRef.current = false;
            }}
            className="flex-1 h-7 rounded cursor-pointer touch-none"
            aria-label="Audio seek waveform"
          />
          <span className="font-mono tabular-nums text-[11px] text-[var(--text-muted)] w-10 shrink-0">
            {formatAudioDuration(duration)}
          </span>
          <button
            type="button"
            onClick={() =>
              onChangeVisualizerMode(
                visualizerMode === "spectrum" ? "waveform" : "spectrum",
              )
            }
            title={
              visualizerMode === "spectrum"
                ? "Switch to static waveform"
                : "Switch to live spectrum visualizer"
            }
            className="hidden sm:inline-flex p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer shrink-0"
          >
            {visualizerMode === "spectrum" ? (
              <Activity className="w-3.5 h-3.5 text-[var(--accent)]" />
            ) : (
              <AudioWaveform className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Now Playing Track Info */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-[180px]">
            {primaryTrack ? (
              <>
                <div className="w-9 shrink-0">
                  <AudioArtwork
                    title={primaryTrack.title}
                    artist={primaryTrack.artist}
                    format={primaryTrack.format}
                    coverDataUrl={primaryTrack.coverDataUrl}
                    paletteIndex={primaryTrack.coverPaletteIndex}
                    coverStyle={primaryTrack.coverStyle}
                    size="sm"
                    isPlaying={isPlaying}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {primaryTrack.title}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {primaryTrack.artist}
                    {activeCount > 1 ? ` · +${activeCount - 1} in mix` : ""}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-xs text-[var(--text-muted)] truncate">
                Select or drop tracks here to play &amp; mix
              </div>
            )}
          </div>

          {/* Primary Transport Cluster */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() =>
                onUpdateAudioState({ shuffle: !audioState.shuffle })
              }
              title="Toggle Shuffle"
              className={`hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer ${
                audioState.shuffle
                  ? "text-[var(--accent)] bg-[var(--accent-soft)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              disabled={!primarySlot}
              onClick={() => onSkipPrimary(-15)}
              title="Back 15 seconds"
              className="hidden md:inline-flex h-8 px-1.5 items-center gap-0.5 rounded-lg text-[11px] font-mono tabular-nums text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>15</span>
            </button>

            <button
              type="button"
              disabled={tracks.length === 0}
              onClick={onPrev}
              title="Previous track"
              aria-label="Previous track"
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 cursor-pointer"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={activeCount === 0}
              onClick={onTogglePlayPauseAll}
              aria-label={isPlaying && !isAllPaused ? "Pause audio" : "Play audio"}
              className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-40 cursor-pointer shadow-xs"
            >
              {isPlaying && !isAllPaused ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              disabled={tracks.length === 0}
              onClick={onNext}
              title="Next track"
              aria-label="Next track"
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 cursor-pointer"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={!primarySlot}
              onClick={() => onSkipPrimary(30)}
              title="Forward 30 seconds"
              className="hidden md:inline-flex h-8 px-1.5 items-center gap-0.5 rounded-lg text-[11px] font-mono tabular-nums text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>30</span>
            </button>

            <button
              type="button"
              onClick={cycleRepeat}
              title={`Repeat: ${audioState.repeatMode}`}
              className={`hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer ${
                audioState.repeatMode !== "off"
                  ? "text-[var(--accent)] bg-[var(--accent-soft)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {audioState.repeatMode === "one" ? (
                <Repeat1 className="w-3.5 h-3.5" />
              ) : (
                <Repeat className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Right DSP, Master Volume, Sleep & Mixer Toggle */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Speed Popover */}
            <div className="relative hidden sm:block">
              <button
                type="button"
                disabled={!primarySlot}
                onClick={() =>
                  setOpenPopover((p) => (p === "speed" ? null : "speed"))
                }
                title="Playback Speed"
                className="h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-mono tabular-nums text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
              >
                {primaryRate}x
              </button>
              {openPopover === "speed" && primarySlot && (
                <div className="absolute right-0 bottom-full mb-1.5 w-32 p-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-xl z-50 grid grid-cols-2 gap-1">
                  {SPEED_OPTIONS.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => {
                        onUpdateSlot(primarySlot.slotId, {
                          playbackRate: rate,
                        });
                        setOpenPopover(null);
                      }}
                      className={`h-7 rounded-md font-mono tabular-nums text-[11px] cursor-pointer ${
                        Math.abs(primaryRate - rate) < 0.01
                          ? "bg-[var(--accent-soft)] text-[var(--accent)] font-semibold"
                          : "hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)]"
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sleep Timer Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenPopover((p) => (p === "sleep" ? null : "sleep"))
                }
                title="Sleep Timer with fade-out"
                className={`h-8 px-2 rounded-lg border text-xs inline-flex items-center gap-1 cursor-pointer ${
                  sleepRemainingSeconds !== null
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                {sleepRemainingSeconds !== null && (
                  <span className="font-mono tabular-nums text-[11px]">
                    {formatCountdown(sleepRemainingSeconds)}
                  </span>
                )}
              </button>

              {openPopover === "sleep" && (
                <div className="absolute right-0 bottom-full mb-1.5 w-60 p-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-xl space-y-2.5 z-50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">
                      Sleep Timer (Fade-Out)
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenPopover(null)}
                      className="text-[var(--text-muted)] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SLEEP_PRESETS.map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => {
                          onStartSleepTimer(mins);
                          setOpenPopover(null);
                        }}
                        className="h-7 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] font-mono tabular-nums text-xs hover:border-[var(--accent)] cursor-pointer"
                      >
                        {mins}m
                      </button>
                    ))}
                    {sleepRemainingSeconds !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          onCancelSleepTimer();
                          setOpenPopover(null);
                        }}
                        className="h-7 rounded-md border border-[var(--danger)] text-xs text-[var(--danger)] cursor-pointer"
                      >
                        Off
                      </button>
                    )}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const m = parseInt(customSleepMins, 10);
                      if (Number.isFinite(m) && m > 0) {
                        onStartSleepTimer(Math.min(480, m));
                        setOpenPopover(null);
                      }
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      type="number"
                      min={1}
                      max={480}
                      value={customSleepMins}
                      onChange={(e) => setCustomSleepMins(e.target.value)}
                      className="w-16 h-7 px-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono tabular-nums"
                    />
                    <span className="text-[11px] text-[var(--text-muted)]">
                      min
                    </span>
                    <button
                      type="submit"
                      className="ml-auto h-7 px-2.5 rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-medium cursor-pointer"
                    >
                      Start
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Mute + Master Volume */}
            <div className="h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleViewMute}
                title={viewMuted ? "Unmute Audio View" : "Mute Audio View"}
                className={`cursor-pointer ${
                  viewMuted ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"
                }`}
              >
                {viewMuted ? (
                  <VolumeX className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={audioState.masterVolume}
                onChange={(e) =>
                  onUpdateAudioState({ masterVolume: Number(e.target.value) })
                }
                aria-label="Master audio volume"
                className="hidden md:block w-16 accent-[var(--accent)] cursor-pointer"
              />
            </div>

            {/* Expand / Collapse Mixer & Queue Drawer */}
            <button
              type="button"
              onClick={() =>
                onUpdateAudioState({ mixerExpanded: !audioState.mixerExpanded })
              }
              title={
                audioState.mixerExpanded
                  ? "Collapse Mixer & Queue"
                  : "Expand Multi-Track Mixer, Queue & EQ"
              }
              className={`h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                audioState.mixerExpanded
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mixer</span>
              <span className="font-mono tabular-nums text-[11px]">
                {activeCount}
              </span>
              {audioState.mixerExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronUp className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
