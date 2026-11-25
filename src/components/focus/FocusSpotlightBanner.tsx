import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Headphones,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Target,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { Entry, ViewId } from "../../types";
import { formatTime } from "../../utils/date";
import type { AudioPlaybackSummary } from "../../views/AudioView";
import type { StreamerPlaybackSummary } from "../../views/StreamerView";

type TimerPreset = "25m" | "50m" | "5m" | "stopwatch";

const PRESET_SECONDS: Record<Exclude<TimerPreset, "stopwatch">, number> = {
  "25m": 25 * 60,
  "50m": 50 * 60,
  "5m": 5 * 60,
};

function formatDurationClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function playGentleChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const strike = (
      freq: number,
      startOffset: number,
      duration: number,
      peak: number,
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(peak, now + startOffset + 0.03);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + startOffset + duration,
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.05);
    };

    strike(528, 0, 1.35, 0.14);
    strike(792, 0.24, 1.5, 0.1);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 2200);
  } catch {
    // Ignore audio context restrictions
  }
}

interface FocusSpotlightBannerProps {
  entry: Entry;
  timeFormat: "12h" | "24h";
  onCompleteItem: (entryId: string) => void;
  onExitSpotlight: () => void;
  onOpenDetail: (entry: Entry) => void;
  onTimerCompleteToast: (title: string) => void;
  audioPlayback?: AudioPlaybackSummary;
  streamerPlayback?: StreamerPlaybackSummary;
  onToggleAudioPlayback?: () => void;
  onToggleStreamerPlayback?: () => void;
  onNavigateView?: (view: ViewId) => void;
}

export const FocusSpotlightBanner: React.FC<FocusSpotlightBannerProps> = ({
  entry,
  timeFormat,
  onCompleteItem,
  onExitSpotlight,
  onOpenDetail,
  onTimerCompleteToast,
  audioPlayback,
  streamerPlayback,
  onToggleAudioPlayback,
  onToggleStreamerPlayback,
  onNavigateView,
}) => {
  const [preset, setPreset] = useState<TimerPreset>("25m");
  const [running, setRunning] = useState(false);
  const [completedAlert, setCompletedAlert] = useState(false);
  const [chimeEnabled, setChimeEnabled] = useState(true);
  const [secondsValue, setSecondsValue] = useState<number>(
    PRESET_SECONDS["25m"],
  );

  const chimeEnabledRef = useRef(chimeEnabled);
  chimeEnabledRef.current = chimeEnabled;
  const entryTitleRef = useRef(entry.title);
  entryTitleRef.current = entry.title;

  useEffect(() => {
    setCompletedAlert(false);
  }, [entry.id]);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      setSecondsValue((prev) => {
        if (preset === "stopwatch") {
          return prev + 1;
        }
        if (prev <= 1) {
          setRunning(false);
          setCompletedAlert(true);
          if (chimeEnabledRef.current) {
            playGentleChime();
          }
          onTimerCompleteToast(entryTitleRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [running, preset, onTimerCompleteToast]);

  const handleSelectPreset = useCallback((nextPreset: TimerPreset) => {
    setRunning(false);
    setCompletedAlert(false);
    setPreset(nextPreset);
    setSecondsValue(
      nextPreset === "stopwatch" ? 0 : PRESET_SECONDS[nextPreset],
    );
  }, []);

  const handleReset = () => {
    setRunning(false);
    setCompletedAlert(false);
    setSecondsValue(preset === "stopwatch" ? 0 : PRESET_SECONDS[preset]);
  };

  const handleKeepGoingStopwatch = () => {
    setCompletedAlert(false);
    setPreset("stopwatch");
    setSecondsValue(0);
    setRunning(true);
  };

  const isAnchor =
    entry.source === "focus-anchor" || entry.focusBucket === "anchor";

  const hasAudioLoaded = Boolean(audioPlayback && audioPlayback.activeCount > 0);
  const hasStreamerLoaded = Boolean(
    streamerPlayback && streamerPlayback.activeCount > 0,
  );
  const activeMediaKind = hasAudioLoaded
    ? "audio"
    : hasStreamerLoaded
      ? "streamer"
      : null;
  const isMediaPlaying =
    activeMediaKind === "audio"
      ? Boolean(audioPlayback?.isPlaying)
      : activeMediaKind === "streamer"
        ? Boolean(streamerPlayback?.isPlaying)
        : false;

  return (
    <section
      aria-label="Now Focusing Spotlight"
      className="rounded-2xl border overflow-hidden transition-colors"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: completedAlert
          ? "var(--success)"
          : "var(--border-strong)",
      }}
    >
      {/* TIER 1: Spacious Header & Full-Width Title */}
      <div className="px-4 py-3 space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs min-w-0"
            style={{ color: "var(--text-muted)" }}
          >
            <span
              className="inline-flex items-center gap-1.5 font-semibold shrink-0"
              style={{ color: "var(--accent)" }}
            >
              {isAnchor ? (
                <Clock className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Target className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>Now Focusing</span>
            </span>

            {entry.scheduledAt && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {formatTime(entry.scheduledAt, timeFormat)}
                  {entry.endAt
                    ? ` – ${formatTime(entry.endAt, timeFormat)}`
                    : ""}
                </span>
              </>
            )}

            {entry.tags.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono truncate">
                  {entry.tags.map((t) => `#${t}`).join(" ")}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onCompleteItem(entry.id)}
              className="h-7 px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-subtle)] whitespace-nowrap shrink-0 cursor-pointer"
              style={{ color: "var(--success)" }}
              title="Complete focused item"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Done</span>
            </button>
            <button
              type="button"
              onClick={onExitSpotlight}
              className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer shrink-0"
              style={{ color: "var(--text-muted)" }}
              title="Exit spotlight"
              aria-label="Exit spotlight"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <button
          type="button"
          onDoubleClick={() => onOpenDetail(entry)}
          onClick={() => onOpenDetail(entry)}
          className="block w-full text-left text-sm font-medium leading-snug line-clamp-2 break-words hover:underline decoration-[var(--border-strong)] underline-offset-4 cursor-pointer"
          style={{ color: "var(--text-primary)" }}
          title="Click to inspect details"
        >
          {entry.title}
        </button>
      </div>

      {/* TIER 2: Quiet Bottom Utility Strip (Timer + Presets + Chime + Audio) */}
      <div
        className="px-4 py-2 border-t flex flex-wrap items-center justify-between gap-2.5"
        style={{
          backgroundColor: "var(--bg-surface-subtle)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* Timer Presets */}
          <div
            className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border"
            style={{
              backgroundColor: "var(--bg-canvas)",
              borderColor: "var(--border-subtle)",
            }}
            role="group"
            aria-label="Session timer mode"
          >
            {(
              [
                { id: "25m" as const, label: "25m" },
                { id: "50m" as const, label: "50m" },
                { id: "5m" as const, label: "5m" },
                { id: "stopwatch" as const, label: "Open" },
              ] as const
            ).map((opt) => {
              const active = preset === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectPreset(opt.id)}
                  className="h-6 px-2 rounded-md text-[11px] font-mono tabular-nums font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  style={{
                    backgroundColor: active
                      ? "var(--bg-surface)"
                      : "transparent",
                    color: active ? "var(--text-primary)" : "var(--text-muted)",
                    boxShadow: active ? "var(--shadow-card)" : "none",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <span
            aria-hidden="true"
            className="hidden sm:block h-4 w-px"
            style={{ backgroundColor: "var(--border-subtle)" }}
          />

          {/* Clock + Start/Pause + Reset + Chime */}
          <div className="inline-flex items-center gap-1.5">
            <span
              className="font-mono tabular-nums text-sm font-semibold min-w-[52px]"
              style={{
                color: completedAlert
                  ? "var(--success)"
                  : running
                    ? "var(--accent)"
                    : "var(--text-primary)",
              }}
            >
              {formatDurationClock(secondsValue)}
            </span>

            <button
              type="button"
              onClick={() => {
                if (completedAlert) {
                  handleReset();
                } else {
                  setRunning((r) => !r);
                }
              }}
              className="h-7 px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              style={{
                backgroundColor: running
                  ? "var(--accent-soft)"
                  : "var(--accent)",
                color: running ? "var(--accent)" : "var(--accent-fg)",
              }}
              aria-label={running ? "Pause timer" : "Start timer"}
            >
              {running ? (
                <>
                  <Pause className="w-3 h-3" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  <span>Start</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
              style={{ color: "var(--text-muted)" }}
              title="Reset timer"
              aria-label="Reset timer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setChimeEnabled((c) => !c)}
              className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
              style={{
                color: chimeEnabled
                  ? "var(--text-secondary)"
                  : "var(--text-muted)",
                opacity: chimeEnabled ? 1 : 0.55,
              }}
              title={chimeEnabled ? "Gentle chime on" : "Chime muted"}
              aria-label={
                chimeEnabled
                  ? "Disable completion chime"
                  : "Enable completion chime"
              }
            >
              {chimeEnabled ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Audio / Streamer Quick Pill */}
        {(activeMediaKind || onNavigateView) && (
          <div className="inline-flex items-center gap-1 ml-auto">
            {activeMediaKind ? (
              <div
                className="inline-flex items-center rounded-lg border overflow-hidden"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface)",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (activeMediaKind === "audio") {
                      onToggleAudioPlayback?.();
                    } else {
                      onToggleStreamerPlayback?.();
                    }
                  }}
                  className="h-7 px-2 inline-flex items-center gap-1 text-xs font-medium transition-colors hover:bg-[var(--bg-surface-hover)] whitespace-nowrap shrink-0 cursor-pointer"
                  style={{
                    color: isMediaPlaying
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                  }}
                  title={
                    isMediaPlaying
                      ? "Pause background audio"
                      : "Resume background audio"
                  }
                >
                  {isMediaPlaying ? (
                    <Pause className="w-3 h-3" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  <span className="max-w-[140px] truncate">
                    {activeMediaKind === "audio"
                      ? audioPlayback?.primaryTitle || "Audio"
                      : "Streamer"}
                  </span>
                </button>
                {onNavigateView && (
                  <button
                    type="button"
                    onClick={() => onNavigateView(activeMediaKind)}
                    className="h-7 w-7 flex items-center justify-center border-l transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-muted)",
                    }}
                    title={`Open ${activeMediaKind === "audio" ? "Audio" : "Streamer"}`}
                    aria-label={`Open ${activeMediaKind === "audio" ? "Audio" : "Streamer"}`}
                  >
                    {activeMediaKind === "audio" ? (
                      <Headphones className="w-3.5 h-3.5" />
                    ) : (
                      <Radio className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            ) : (
              onNavigateView && (
                <button
                  type="button"
                  onClick={() => onNavigateView("audio")}
                  className="h-7 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface-hover)] whitespace-nowrap shrink-0 cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                  title="Open background Audio studio"
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span>Audio</span>
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Countdown Completion Bar */}
      {completedAlert && (
        <div
          className="px-4 py-2.5 border-t flex flex-wrap items-center justify-between gap-2"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: "var(--success)" }}
          >
            Session finished — keep momentum or mark done?
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleKeepGoingStopwatch}
              className="h-7 px-2.5 rounded-lg border text-xs font-medium transition-colors hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            >
              Keep Going
            </button>
            <button
              type="button"
              onClick={() => onCompleteItem(entry.id)}
              className="h-7 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer"
              style={{
                backgroundColor: "var(--success)",
                color: "#ffffff",
              }}
            >
              Complete Item
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
