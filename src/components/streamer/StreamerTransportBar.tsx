import React, { useEffect, useRef, useState } from "react";
import {
  BookmarkPlus,
  ChevronDown,
  Clock,
  Equal,
  Grid2x2,
  LayoutGrid,
  Maximize2,
  Minimize2,
  MonitorPlay,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  RotateCcw,
  Rows3,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Tv,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  StreamLayoutMode,
  StreamSizingMode,
  StreamViewMode,
} from "../../types";
import { BottomSheet } from "../ui/BottomSheet";

interface StreamerTransportBarProps {
  stackedCount: number;
  isPlaying: boolean;
  isAllPaused: boolean;
  allActiveMuted: boolean;
  masterVolume: number;
  sleepRemainingSeconds: number | null;
  viewMode: StreamViewMode;
  onChangeViewMode: (mode: StreamViewMode) => void;
  playerMode: "clean" | "native";
  onChangePlayerMode: (mode: "clean" | "native") => void;
  layoutMode: StreamLayoutMode;
  onChangeLayoutMode: (mode: StreamLayoutMode) => void;
  sizingMode: StreamSizingMode;
  onChangeSizingMode: (mode: StreamSizingMode) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onTogglePlayPauseAll: () => void;
  onToggleMuteAll: () => void;
  onSyncAll: () => void;
  onChangeMasterVolume: (vol: number) => void;
  onQuietLayer: () => void;
  onBalanceAll: () => void;
  onStartSleepTimer: (minutes: number) => void;
  onCancelSleepTimer: () => void;
  existingCategories?: string[];
  onSaveStack: (name: string, category: string) => void;
  onClearStack: () => void;
}

const LAYOUT_PRESETS: { id: StreamLayoutMode; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "1", label: "1" },
  { id: "2", label: "2" },
  { id: "2x2", label: "2×2" },
  { id: "3x2", label: "3×2" },
  { id: "3x3", label: "3×3" },
  { id: "4x4", label: "4×4" },
  { id: "5x5", label: "5×5" },
  { id: "6x6", label: "6×6" },
  { id: "7x7", label: "7×7" },
  { id: "8x8", label: "8×8" },
];

const SLEEP_PRESETS = [15, 30, 45, 60, 90];
const DEFAULT_PLAYLIST_CATEGORIES = [
  "Focus",
  "Overnight",
  "Study",
  "Healing",
  "General",
];

function formatTimer(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export const StreamerTransportBar: React.FC<StreamerTransportBarProps> = ({
  stackedCount,
  isPlaying,
  isAllPaused,
  allActiveMuted,
  masterVolume,
  sleepRemainingSeconds,
  viewMode,
  onChangeViewMode,
  playerMode,
  onChangePlayerMode,
  layoutMode,
  onChangeLayoutMode,
  sizingMode,
  onChangeSizingMode,
  sidebarOpen,
  onToggleSidebar,
  onTogglePlayPauseAll,
  onToggleMuteAll,
  onSyncAll,
  onChangeMasterVolume,
  onQuietLayer,
  onBalanceAll,
  onStartSleepTimer,
  onCancelSleepTimer,
  existingCategories = [],
  onSaveStack,
  onClearStack,
}) => {
  const [openPopover, setOpenPopover] = useState<
    "layout" | "mix" | "sleep" | "save" | "volume" | null
  >(null);
  const [controlsSheetOpen, setControlsSheetOpen] = useState(false);
  const [confirmClearMobile, setConfirmClearMobile] = useState(false);
  const [customSleepMins, setCustomSleepMins] = useState("25");
  const [presetName, setPresetName] = useState("");
  const [presetCategory, setPresetCategory] = useState("Focus");
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryDraft, setCustomCategoryDraft] = useState("");

  const categoryChoices = React.useMemo(() => {
    const set = new Set<string>(DEFAULT_PLAYLIST_CATEGORIES);
    for (const c of existingCategories) {
      if (c.trim()) set.add(c.trim());
    }
    return Array.from(set);
  }, [existingCategories]);

  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openPopover) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenPopover(null);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
    };
  }, [openPopover]);

  useEffect(() => {
    if (!controlsSheetOpen || stackedCount === 0) {
      setConfirmClearMobile(false);
    }
  }, [controlsSheetOpen, stackedCount]);

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = presetName.trim();
    if (!trimmed) return;
    const resolvedCategory = isCustomCategory
      ? customCategoryDraft.trim() || "General"
      : presetCategory;
    onSaveStack(trimmed, resolvedCategory);
    setPresetName("");
    setCustomCategoryDraft("");
    setIsCustomCategory(false);
    setOpenPopover(null);
    setControlsSheetOpen(false);
  };

  const handleCustomSleepSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(customSleepMins, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    onStartSleepTimer(Math.min(480, parsed));
    setOpenPopover(null);
  };

  const showPauseLabel = isPlaying && !isAllPaused;
  const hasStreams = stackedCount > 0;
  const activeLayoutLabel =
    LAYOUT_PRESETS.find(
      (p) => p.id === layoutMode || (p.id === "1" && layoutMode === "1x1"),
    )?.label || "Auto";

  const VolumeIcon =
    allActiveMuted || masterVolume === 0
      ? VolumeX
      : masterVolume < 50
        ? Volume1
        : Volume2;

  return (
    <div
      ref={barRef}
      className="relative px-3 py-1.5 md:px-6 md:py-4 border-b shrink-0"
      style={{
        backgroundColor: "var(--bg-canvas)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {/* ================================================================
          MOBILE PRIMARY BAR (< md): Single ultra-compact row + popovers + Controls BottomSheet
          ================================================================ */}
      <div className="md:hidden flex items-center justify-between gap-1.5">
        {/* Primary Playback & Audio Controls */}
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            disabled={!hasStreams}
            onClick={onTogglePlayPauseAll}
            className="h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 cursor-pointer"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-fg)",
            }}
            title={
              showPauseLabel
                ? "Pause all stacked streams"
                : "Play all stacked streams"
            }
            aria-label={showPauseLabel ? "Pause all streams" : "Play all streams"}
          >
            {showPauseLabel ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play</span>
              </>
            )}
          </button>

          {/* Segmented Mute All + Sync */}
          <div
            className="inline-flex items-center h-8 rounded-lg border overflow-hidden shrink-0"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <button
              type="button"
              disabled={!hasStreams}
              onClick={onToggleMuteAll}
              className="w-8 h-full inline-flex items-center justify-center transition-colors disabled:opacity-45 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                backgroundColor: allActiveMuted
                  ? "var(--accent-soft)"
                  : "transparent",
                color: allActiveMuted ? "var(--danger)" : "var(--text-secondary)",
              }}
              title={allActiveMuted ? "Unmute all streams" : "Mute all streams"}
              aria-label={allActiveMuted ? "Unmute all streams" : "Mute all streams"}
            >
              {allActiveMuted ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              disabled={!hasStreams}
              onClick={onSyncAll}
              className="w-8 h-full border-l inline-flex items-center justify-center transition-colors disabled:opacity-45 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
              title="Restart all stacked streams together from 0:00"
              aria-label="Sync all streams"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Master Volume Compact Popover Trigger */}
          <button
            type="button"
            onClick={() =>
              setOpenPopover((p) => (p === "volume" ? null : "volume"))
            }
            className="h-8 px-2 rounded-lg border text-[11px] font-mono tabular-nums inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            style={{
              backgroundColor:
                openPopover === "volume"
                  ? "var(--accent-soft)"
                  : "var(--bg-surface)",
              borderColor:
                openPopover === "volume"
                  ? "var(--accent)"
                  : "var(--border-subtle)",
              color:
                openPopover === "volume"
                  ? "var(--accent)"
                  : "var(--text-secondary)",
            }}
            title="Master volume"
            aria-label={`Master volume ${masterVolume}%`}
            aria-expanded={openPopover === "volume"}
          >
            <VolumeIcon className="w-3.5 h-3.5 shrink-0" />
            <span>{masterVolume}%</span>
          </button>
        </div>

        {/* Right Group: Sleep Timer + Manager + Controls Bottom Sheet */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() =>
              setOpenPopover((p) => (p === "sleep" ? null : "sleep"))
            }
            className={`h-8 ${
              sleepRemainingSeconds !== null ? "px-2" : "w-8"
            } rounded-lg border text-[11px] font-medium inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
            style={{
              backgroundColor:
                sleepRemainingSeconds !== null || openPopover === "sleep"
                  ? "var(--accent-soft)"
                  : "var(--bg-surface)",
              borderColor:
                sleepRemainingSeconds !== null || openPopover === "sleep"
                  ? "var(--accent)"
                  : "var(--border-subtle)",
              color:
                sleepRemainingSeconds !== null || openPopover === "sleep"
                  ? "var(--accent)"
                  : "var(--text-secondary)",
            }}
            title="Sleep Timer"
            aria-label="Sleep Timer"
            aria-expanded={openPopover === "sleep"}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            {sleepRemainingSeconds !== null && (
              <span className="font-mono tabular-nums">
                {formatTimer(sleepRemainingSeconds)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setOpenPopover(null);
              onToggleSidebar();
            }}
            className="w-8 h-8 rounded-lg border inline-flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            style={{
              backgroundColor: sidebarOpen
                ? "var(--accent-soft)"
                : "var(--bg-surface)",
              borderColor: sidebarOpen
                ? "var(--accent)"
                : "var(--border-subtle)",
              color: sidebarOpen ? "var(--accent)" : "var(--text-secondary)",
            }}
            title={sidebarOpen ? "Hide manager" : "Show manager"}
            aria-label={sidebarOpen ? "Hide manager" : "Show manager"}
          >
            {sidebarOpen ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setOpenPopover(null);
              setControlsSheetOpen(true);
            }}
            className="h-8 px-2 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1 shrink-0 transition-colors cursor-pointer"
            style={{
              backgroundColor: controlsSheetOpen
                ? "var(--accent-soft)"
                : "var(--bg-surface)",
              borderColor: controlsSheetOpen
                ? "var(--accent)"
                : "var(--border-subtle)",
              color: controlsSheetOpen
                ? "var(--accent)"
                : "var(--text-secondary)",
            }}
            title="View mode, layout, mix, save & clear"
            aria-label="Open stream controls sheet"
          >
            <Settings2 className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden min-[400px]:inline">Controls</span>
          </button>
        </div>
      </div>

      {/* Mobile Anchored Volume Popover */}
      {openPopover === "volume" && (
        <div
          className="md:hidden absolute left-3 right-3 top-full mt-1.5 rounded-xl border p-3 space-y-2.5 z-40"
          style={{
            backgroundColor: "var(--bg-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow: "var(--shadow-popover)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Master Volume</span>
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-mono tabular-nums font-semibold"
                style={{ color: "var(--accent)" }}
              >
                {masterVolume}%
              </span>
              <button
                type="button"
                onClick={() => setOpenPopover(null)}
                className="h-6 w-6 flex items-center justify-center rounded-md"
                style={{ color: "var(--text-muted)" }}
                aria-label="Close volume popover"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={!hasStreams}
              onClick={onToggleMuteAll}
              className="h-8 w-8 rounded-lg border flex items-center justify-center shrink-0 disabled:opacity-45"
              style={{
                backgroundColor: allActiveMuted
                  ? "var(--accent-soft)"
                  : "var(--bg-surface)",
                borderColor: allActiveMuted
                  ? "var(--danger)"
                  : "var(--border-subtle)",
                color: allActiveMuted
                  ? "var(--danger)"
                  : "var(--text-secondary)",
              }}
              aria-label={allActiveMuted ? "Unmute all" : "Mute all"}
            >
              {allActiveMuted ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={masterVolume}
              onChange={(e) => onChangeMasterVolume(Number(e.target.value))}
              className="flex-1 min-w-0 h-6 cursor-pointer"
              style={{ accentColor: "var(--accent)" }}
              aria-label="Master volume slider"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {[25, 50, 75, 100].map((val) => {
              const active = masterVolume === val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => onChangeMasterVolume(val)}
                  className="flex-1 h-7 rounded-lg border text-[11px] font-mono tabular-nums font-medium transition-colors"
                  style={{
                    backgroundColor: active
                      ? "var(--accent-soft)"
                      : "var(--bg-surface)",
                    borderColor: active
                      ? "var(--accent)"
                      : "var(--border-subtle)",
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                  }}
                >
                  {val}%
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile Anchored Sleep Timer Popover */}
      {openPopover === "sleep" && (
        <div
          className="md:hidden absolute left-3 right-3 top-full mt-1.5 rounded-xl border p-3 space-y-2.5 z-40"
          style={{
            backgroundColor: "var(--bg-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow: "var(--shadow-popover)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">
              Sleep Timer (Fade-Out)
            </span>
            <button
              type="button"
              onClick={() => setOpenPopover(null)}
              className="h-6 w-6 flex items-center justify-center rounded-md"
              style={{ color: "var(--text-muted)" }}
              aria-label="Close sleep timer menu"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p
            className="text-[11px] leading-snug"
            style={{ color: "var(--text-muted)" }}
          >
            Gradually fades audio out over the final 15s, then pauses all
            streams.
          </p>

          <div className="grid grid-cols-3 gap-1.5">
            {SLEEP_PRESETS.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => {
                  onStartSleepTimer(mins);
                  setOpenPopover(null);
                }}
                className="h-8 rounded-lg border text-xs font-mono tabular-nums font-medium transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
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
                className="h-8 rounded-lg border text-xs font-medium transition-colors"
                style={{
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--danger)",
                  color: "var(--danger)",
                }}
              >
                Off
              </button>
            )}
          </div>

          <form
            onSubmit={handleCustomSleepSubmit}
            className="flex items-center gap-1.5"
          >
            <input
              type="number"
              min={1}
              max={480}
              value={customSleepMins}
              onChange={(e) => setCustomSleepMins(e.target.value)}
              className="w-20 h-8 px-2 rounded-lg border text-xs font-mono tabular-nums outline-none"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
              aria-label="Custom sleep timer minutes"
            />
            <span
              className="text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              min
            </span>
            <button
              type="submit"
              className="ml-auto h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              Start
            </button>
          </form>
        </div>
      )}

      {/* ================================================================
          MOBILE CONTROLS BOTTOM SHEET (< md)
          ================================================================ */}
      <BottomSheet
        isOpen={controlsSheetOpen}
        onClose={() => setControlsSheetOpen(false)}
        title="Streamer Controls"
        subtitle={`${stackedCount} ${stackedCount === 1 ? "stream" : "streams"} stacked`}
        ariaLabel="Streamer Controls"
      >
        <div className="p-4 space-y-5">
          {/* 1. View Mode & Player Mode Segmented Pills */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                View Mode
              </div>
              <div
                className="grid grid-cols-3 gap-1 p-1 rounded-xl border"
                style={{
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--border-subtle)",
                }}
                role="group"
                aria-label="Live stack view mode"
              >
                {(
                  [
                    { id: "grid", icon: LayoutGrid, label: "Grid" },
                    { id: "mixer", icon: SlidersHorizontal, label: "Mixer" },
                    { id: "tiles", icon: Rows3, label: "Tiles" },
                  ] as {
                    id: StreamViewMode;
                    icon: React.ComponentType<{ className?: string }>;
                    label: string;
                  }[]
                ).map((opt) => {
                  const Icon = opt.icon;
                  const active = viewMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChangeViewMode(opt.id)}
                      className="h-9 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      style={{
                        backgroundColor: active
                          ? "var(--bg-surface)"
                          : "transparent",
                        color: active
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                        boxShadow: active
                          ? "0 1px 2px rgba(0,0,0,0.08)"
                          : "none",
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <div
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                YouTube Player Mode
              </div>
              <div
                className="grid grid-cols-2 gap-1 p-1 rounded-xl border"
                style={{
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--border-subtle)",
                }}
                role="group"
                aria-label="YouTube player mode"
              >
                {(
                  [
                    { id: "clean", icon: MonitorPlay, label: "Clean Player" },
                    { id: "native", icon: Tv, label: "Native YouTube" },
                  ] as {
                    id: "clean" | "native";
                    icon: React.ComponentType<{ className?: string }>;
                    label: string;
                  }[]
                ).map((opt) => {
                  const Icon = opt.icon;
                  const active = playerMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChangePlayerMode(opt.id)}
                      aria-pressed={active}
                      className="h-9 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      style={{
                        backgroundColor: active
                          ? "var(--bg-surface)"
                          : "transparent",
                        color: active
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                        boxShadow: active
                          ? "0 1px 2px rgba(0,0,0,0.08)"
                          : "none",
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. Layout & Viewport Sizing (hidden in Mixer mode) */}
          {viewMode !== "mixer" && (
            <div
              className="pt-4 border-t space-y-3"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div className="space-y-1.5">
                <div
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Grid Columns
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {LAYOUT_PRESETS.map((opt) => {
                    const active =
                      layoutMode === opt.id ||
                      (opt.id === "1" && layoutMode === "1x1");
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChangeLayoutMode(opt.id)}
                        className="h-8 rounded-lg border text-xs font-mono tabular-nums font-medium transition-colors cursor-pointer"
                        style={{
                          backgroundColor: active
                            ? "var(--accent-soft)"
                            : "var(--bg-surface)",
                          borderColor: active
                            ? "var(--accent)"
                            : "var(--border-subtle)",
                          color: active
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <div
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Viewport Sizing
                </div>
                <div
                  className="grid grid-cols-2 gap-1 p-1 rounded-xl border"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onChangeSizingMode("fit")}
                    className="h-9 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    style={{
                      backgroundColor:
                        sizingMode === "fit"
                          ? "var(--bg-surface)"
                          : "transparent",
                      color:
                        sizingMode === "fit"
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                      boxShadow:
                        sizingMode === "fit"
                          ? "0 1px 2px rgba(0,0,0,0.08)"
                          : "none",
                    }}
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Fit Width</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeSizingMode("canvas")}
                    className="h-9 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    style={{
                      backgroundColor:
                        sizingMode === "canvas"
                          ? "var(--bg-surface)"
                          : "transparent",
                      color:
                        sizingMode === "canvas"
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                      boxShadow:
                        sizingMode === "canvas"
                          ? "0 1px 2px rgba(0,0,0,0.08)"
                          : "none",
                    }}
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Canvas</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. Master Volume & Quick Mix Presets */}
          <div
            className="pt-4 border-t space-y-3"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Master Volume & Mix
              </span>
              <span
                className="text-xs font-mono tabular-nums font-semibold"
                style={{ color: "var(--accent)" }}
              >
                {masterVolume}%
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={!hasStreams}
                onClick={onToggleMuteAll}
                className="h-9 w-9 rounded-lg border flex items-center justify-center shrink-0 disabled:opacity-45"
                style={{
                  backgroundColor: allActiveMuted
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                  borderColor: allActiveMuted
                    ? "var(--danger)"
                    : "var(--border-subtle)",
                  color: allActiveMuted
                    ? "var(--danger)"
                    : "var(--text-secondary)",
                }}
                aria-label={allActiveMuted ? "Unmute all" : "Mute all"}
              >
                {allActiveMuted ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={masterVolume}
                onChange={(e) => onChangeMasterVolume(Number(e.target.value))}
                className="flex-1 min-w-0 h-6 cursor-pointer"
                style={{ accentColor: "var(--accent)" }}
                aria-label="Master volume"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!hasStreams}
                onClick={() => {
                  onQuietLayer();
                  setControlsSheetOpen(false);
                }}
                className="p-2.5 rounded-xl border text-left transition-colors disabled:opacity-45 hover:bg-[var(--bg-surface-hover)] flex items-start gap-2 cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <Volume1
                  className="w-3.5 h-3.5 mt-0.5 shrink-0"
                  style={{ color: "var(--accent)" }}
                />
                <div className="min-w-0">
                  <div
                    className="text-xs font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Quiet Layer
                  </div>
                  <div
                    className="text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    All layers to 20%
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={!hasStreams}
                onClick={() => {
                  onBalanceAll();
                  setControlsSheetOpen(false);
                }}
                className="p-2.5 rounded-xl border text-left transition-colors disabled:opacity-45 hover:bg-[var(--bg-surface-hover)] flex items-start gap-2 cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <Equal
                  className="w-3.5 h-3.5 mt-0.5 shrink-0"
                  style={{ color: "var(--accent)" }}
                />
                <div className="min-w-0">
                  <div
                    className="text-xs font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Balance All
                  </div>
                  <div
                    className="text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    All streams to 50%
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 4. Sleep Timer */}
          <div
            className="pt-4 border-t space-y-2.5"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Sleep Timer (Fade-Out)
              </span>
              {sleepRemainingSeconds !== null && (
                <span
                  className="text-xs font-mono tabular-nums font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  {formatTimer(sleepRemainingSeconds)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {SLEEP_PRESETS.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => {
                    onStartSleepTimer(mins);
                    setControlsSheetOpen(false);
                  }}
                  className="h-8 rounded-lg border text-xs font-mono tabular-nums font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                >
                  {mins}m
                </button>
              ))}
              {sleepRemainingSeconds !== null && (
                <button
                  type="button"
                  onClick={onCancelSleepTimer}
                  className="h-8 rounded-lg border text-xs font-medium transition-colors cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--danger)",
                    color: "var(--danger)",
                  }}
                >
                  Turn Off
                </button>
              )}
            </div>
          </div>

          {/* 5. Save Stack as Playlist & Clear Stack (with confirmation) */}
          <div
            className="pt-4 border-t space-y-3"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Stack Actions
            </div>

            <form onSubmit={handleSaveSubmit} className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={presetName}
                  disabled={!hasStreams}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Save stack as playlist..."
                  className="flex-1 min-w-0 h-9 px-3 rounded-lg border text-xs outline-none disabled:opacity-45"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                />
                <button
                  type="submit"
                  disabled={!hasStreams || !presetName.trim()}
                  className="h-9 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-45 cursor-pointer"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>

              {hasStreams &&
                (isCustomCategory ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={customCategoryDraft}
                      onChange={(e) => setCustomCategoryDraft(e.target.value)}
                      placeholder="Custom category..."
                      className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border text-xs outline-none"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomCategory(false);
                        setCustomCategoryDraft("");
                      }}
                      className="h-8 w-8 rounded-lg border flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-muted)",
                      }}
                      aria-label="Back to category list"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <select
                    value={presetCategory}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setIsCustomCategory(true);
                      } else {
                        setPresetCategory(e.target.value);
                      }
                    }}
                    className="w-full h-8 px-2.5 rounded-lg border text-xs outline-none"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                    aria-label="Playlist category"
                  >
                    {categoryChoices.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__custom__">+ Custom category...</option>
                  </select>
                ))}
            </form>

            {/* Clear Stack with 2-step confirmation */}
            {!confirmClearMobile ? (
              <button
                type="button"
                disabled={!hasStreams}
                onClick={() => setConfirmClearMobile(true)}
                className="w-full h-9 px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-45 cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--danger)",
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Stack</span>
              </button>
            ) : (
              <div
                className="p-3 rounded-xl border space-y-2"
                style={{
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--danger)",
                }}
              >
                <div
                  className="text-xs font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Clear all {stackedCount}{" "}
                  {stackedCount === 1 ? "stream" : "streams"} from the live
                  stack?
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmClearMobile(false)}
                    className="h-8 rounded-lg border text-xs font-medium cursor-pointer"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClearStack();
                      setConfirmClearMobile(false);
                      setControlsSheetOpen(false);
                    }}
                    className="h-8 rounded-lg text-xs font-semibold cursor-pointer"
                    style={{
                      backgroundColor: "var(--danger)",
                      color: "#ffffff",
                    }}
                  >
                    Yes, Clear All
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </BottomSheet>

      {/* ================================================================
          DESKTOP TRANSPORT BAR (>= md): Completely preserved unchanged
          ================================================================ */}
      <div className="hidden md:flex flex-wrap items-center justify-between gap-2">
        {/* Left: Transport + Master Volume + Quick Mix Popover */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={!hasStreams}
            onClick={onTogglePlayPauseAll}
            className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-45"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-fg)",
            }}
            title={
              showPauseLabel
                ? "Pause all stacked streams"
                : "Play all stacked streams"
            }
          >
            {showPauseLabel ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play All</span>
              </>
            )}
          </button>

          {/* Segmented Mute + Sync */}
          <div
            className="inline-flex items-center h-8 rounded-lg border overflow-hidden shrink-0"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <button
              type="button"
              disabled={!hasStreams}
              onClick={onToggleMuteAll}
              className="h-full px-2.5 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-45 hover:bg-[var(--bg-surface-hover)]"
              style={{
                backgroundColor: allActiveMuted
                  ? "var(--accent-soft)"
                  : "transparent",
                color: allActiveMuted
                  ? "var(--danger)"
                  : "var(--text-secondary)",
              }}
              title={
                allActiveMuted ? "Unmute all streams" : "Mute all streams"
              }
            >
              {allActiveMuted ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {allActiveMuted ? "Unmute" : "Mute"}
              </span>
            </button>
            <button
              type="button"
              disabled={!hasStreams}
              onClick={onSyncAll}
              className="h-full px-2.5 border-l text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-45 hover:bg-[var(--bg-surface-hover)]"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
              title="Restart all stacked streams together from 0:00"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sync</span>
            </button>
          </div>

          {/* Master Volume Slider */}
          <div
            className="h-8 px-2.5 rounded-lg border inline-flex items-center gap-2 shrink-0"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <span
              className="text-[11px] font-medium whitespace-nowrap hidden sm:inline"
              style={{ color: "var(--text-secondary)" }}
            >
              Master
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={masterVolume}
              onChange={(e) => onChangeMasterVolume(Number(e.target.value))}
              className="w-16 sm:w-20 cursor-pointer"
              style={{ accentColor: "var(--accent)" }}
              aria-label="Master volume"
            />
            <span
              className="text-[11px] font-mono tabular-nums w-7 text-right"
              style={{ color: "var(--accent)" }}
            >
              {masterVolume}%
            </span>
          </div>

          {/* Quick Mix Popover (Quiet Layer & Balance All) */}
          <div className="relative">
            <button
              type="button"
              disabled={!hasStreams}
              onClick={() => setOpenPopover((p) => (p === "mix" ? null : "mix"))}
              className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 hover:bg-[var(--bg-surface-hover)] disabled:opacity-45"
              style={{
                backgroundColor:
                  openPopover === "mix"
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                borderColor:
                  openPopover === "mix"
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                color:
                  openPopover === "mix"
                    ? "var(--accent)"
                    : "var(--text-secondary)",
              }}
              title="Quick volume mix presets"
            >
              <Equal className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Mix</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {openPopover === "mix" && (
              <div
                className="absolute left-0 mt-1.5 w-52 rounded-xl border p-1.5 space-y-1 z-40"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: "var(--border-strong)",
                  boxShadow: "var(--shadow-popover)",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onQuietLayer();
                    setOpenPopover(null);
                  }}
                  className="w-full px-2.5 py-2 rounded-lg text-left transition-colors hover:bg-[var(--bg-surface-subtle)] flex items-start gap-2"
                >
                  <Volume1
                    className="w-3.5 h-3.5 mt-0.5 shrink-0"
                    style={{ color: "var(--accent)" }}
                  />
                  <div className="min-w-0">
                    <div
                      className="text-xs font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Quiet Layer
                    </div>
                    <div
                      className="text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Lower all layers to 20% bed
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onBalanceAll();
                    setOpenPopover(null);
                  }}
                  className="w-full px-2.5 py-2 rounded-lg text-left transition-colors hover:bg-[var(--bg-surface-subtle)] flex items-start gap-2"
                >
                  <Equal
                    className="w-3.5 h-3.5 mt-0.5 shrink-0"
                    style={{ color: "var(--accent)" }}
                  />
                  <div className="min-w-0">
                    <div
                      className="text-xs font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Balance All
                    </div>
                    <div
                      className="text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Equalize all streams to 50%
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: View Mode + Compact Layout Popover + Sleep Timer + Save + Clear */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* View Mode Switcher: Grid | Mixer | Tiles */}
          <div
            className="inline-flex items-center h-8 gap-0.5 p-0.5 rounded-lg border shrink-0"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
            role="group"
            aria-label="Live stack view mode"
          >
            {(
              [
                { id: "grid", icon: LayoutGrid, label: "Grid" },
                { id: "mixer", icon: SlidersHorizontal, label: "Mixer" },
                { id: "tiles", icon: Rows3, label: "Tiles" },
              ] as {
                id: StreamViewMode;
                icon: React.ComponentType<{ className?: string }>;
                label: string;
              }[]
            ).map((opt) => {
              const Icon = opt.icon;
              const active = viewMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeViewMode(opt.id)}
                  title={opt.label}
                  className="h-full px-2 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: active
                      ? "var(--accent-soft)"
                      : "transparent",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Clean vs Native YouTube Player Toggle */}
          <div
            className="inline-flex items-center h-8 gap-0.5 p-0.5 rounded-lg border shrink-0"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
            role="group"
            aria-label="YouTube player mode"
          >
            {(
              [
                {
                  id: "clean",
                  icon: MonitorPlay,
                  label: "Clean",
                  title:
                    "Clean video embed with slim progress bar and no YouTube controller bar",
                },
                {
                  id: "native",
                  icon: Tv,
                  label: "Native",
                  title: "Standard YouTube player with built-in controls",
                },
              ] as {
                id: "clean" | "native";
                icon: React.ComponentType<{ className?: string }>;
                label: string;
                title: string;
              }[]
            ).map((opt) => {
              const Icon = opt.icon;
              const active = playerMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangePlayerMode(opt.id)}
                  title={opt.title}
                  aria-pressed={active}
                  className="h-full px-2 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: active
                      ? "var(--accent-soft)"
                      : "transparent",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Compact Layout & Sizing Popover */}
          {viewMode !== "mixer" && (
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenPopover((p) => (p === "layout" ? null : "layout"))
                }
                className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 hover:bg-[var(--bg-surface-hover)]"
                style={{
                  backgroundColor:
                    openPopover === "layout"
                      ? "var(--accent-soft)"
                      : "var(--bg-surface)",
                  borderColor:
                    openPopover === "layout"
                      ? "var(--accent)"
                      : "var(--border-subtle)",
                  color:
                    openPopover === "layout"
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                }}
                title="Grid columns & canvas sizing"
              >
                <Grid2x2 className="w-3.5 h-3.5" />
                <span className="font-mono tabular-nums text-[11px]">
                  {activeLayoutLabel}
                </span>
                <span className="hidden sm:inline text-[11px] opacity-65">
                  · {sizingMode === "fit" ? "Fit" : "Canvas"}
                </span>
                <ChevronDown className="w-3 h-3 opacity-70" />
              </button>

              {openPopover === "layout" && (
                <div
                  className="absolute right-0 mt-1.5 w-64 rounded-xl border p-3 space-y-3 z-40"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    borderColor: "var(--border-strong)",
                    boxShadow: "var(--shadow-popover)",
                  }}
                >
                  <div className="space-y-1.5">
                    <div
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Grid Columns
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {LAYOUT_PRESETS.map((opt) => {
                        const active =
                          layoutMode === opt.id ||
                          (opt.id === "1" && layoutMode === "1x1");
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => onChangeLayoutMode(opt.id)}
                            className="h-7 rounded-md border text-[11px] font-mono tabular-nums font-medium transition-colors"
                            style={{
                              backgroundColor: active
                                ? "var(--accent-soft)"
                                : "var(--bg-surface)",
                              borderColor: active
                                ? "var(--accent)"
                                : "var(--border-subtle)",
                              color: active
                                ? "var(--accent)"
                                : "var(--text-secondary)",
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    className="space-y-1.5 pt-2 border-t"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <div
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Viewport Sizing
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => onChangeSizingMode("fit")}
                        className="h-7 px-2 rounded-md border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                        style={{
                          backgroundColor:
                            sizingMode === "fit"
                              ? "var(--accent-soft)"
                              : "var(--bg-surface)",
                          borderColor:
                            sizingMode === "fit"
                              ? "var(--accent)"
                              : "var(--border-subtle)",
                          color:
                            sizingMode === "fit"
                              ? "var(--accent)"
                              : "var(--text-secondary)",
                        }}
                      >
                        <Minimize2 className="w-3 h-3" />
                        <span>Fit Width</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeSizingMode("canvas")}
                        className="h-7 px-2 rounded-md border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                        style={{
                          backgroundColor:
                            sizingMode === "canvas"
                              ? "var(--accent-soft)"
                              : "var(--bg-surface)",
                          borderColor:
                            sizingMode === "canvas"
                              ? "var(--accent)"
                              : "var(--border-subtle)",
                          color:
                            sizingMode === "canvas"
                              ? "var(--accent)"
                              : "var(--text-secondary)",
                        }}
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>Canvas</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sleep Timer Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenPopover((p) => (p === "sleep" ? null : "sleep"))
              }
              className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 hover:bg-[var(--bg-surface-hover)]"
              style={{
                backgroundColor:
                  sleepRemainingSeconds !== null || openPopover === "sleep"
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                borderColor:
                  sleepRemainingSeconds !== null || openPopover === "sleep"
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                color:
                  sleepRemainingSeconds !== null || openPopover === "sleep"
                    ? "var(--accent)"
                    : "var(--text-secondary)",
              }}
              title="Sleep Timer with gradual fade-out pause"
            >
              <Clock className="w-3.5 h-3.5" />
              {sleepRemainingSeconds !== null ? (
                <span className="font-mono tabular-nums">
                  {formatTimer(sleepRemainingSeconds)}
                </span>
              ) : (
                <span className="hidden lg:inline">Timer</span>
              )}
            </button>

            {openPopover === "sleep" && (
              <div
                className="absolute right-0 mt-1.5 w-64 rounded-xl border p-3 space-y-2.5 z-40"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: "var(--border-strong)",
                  boxShadow: "var(--shadow-popover)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">
                    Sleep Timer (Fade-Out)
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenPopover(null)}
                    className="h-6 w-6 flex items-center justify-center rounded-md"
                    style={{ color: "var(--text-muted)" }}
                    aria-label="Close sleep timer menu"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p
                  className="text-[11px] leading-snug"
                  style={{ color: "var(--text-muted)" }}
                >
                  Gradually fades audio out over the final 15s, then pauses all
                  streams.
                </p>

                <div className="grid grid-cols-3 gap-1.5">
                  {SLEEP_PRESETS.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => {
                        onStartSleepTimer(mins);
                        setOpenPopover(null);
                      }}
                      className="h-7 rounded-lg border text-xs font-mono tabular-nums font-medium transition-colors hover:bg-[var(--bg-surface-hover)]"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }}
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
                      className="h-7 rounded-lg border text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: "var(--bg-surface-subtle)",
                        borderColor: "var(--danger)",
                        color: "var(--danger)",
                      }}
                    >
                      Off
                    </button>
                  )}
                </div>

                <form
                  onSubmit={handleCustomSleepSubmit}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="number"
                    min={1}
                    max={480}
                    value={customSleepMins}
                    onChange={(e) => setCustomSleepMins(e.target.value)}
                    className="w-20 h-7 px-2 rounded-lg border text-xs font-mono tabular-nums outline-none"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-primary)",
                    }}
                    aria-label="Custom sleep timer minutes"
                  />
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    min
                  </span>
                  <button
                    type="submit"
                    className="ml-auto h-7 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "var(--accent-fg)",
                    }}
                  >
                    Start
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Save Stack Popover */}
          <div className="relative">
            <button
              type="button"
              disabled={!hasStreams}
              onClick={() =>
                setOpenPopover((p) => (p === "save" ? null : "save"))
              }
              className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 hover:bg-[var(--bg-surface-hover)] disabled:opacity-45"
              style={{
                backgroundColor:
                  openPopover === "save"
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                borderColor:
                  openPopover === "save"
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                color:
                  openPopover === "save"
                    ? "var(--accent)"
                    : "var(--text-secondary)",
              }}
              title="Save current stack as playlist"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Save</span>
            </button>

            {openPopover === "save" && (
              <div
                className="absolute right-0 mt-1.5 w-72 rounded-xl border p-3.5 space-y-2.5 z-40"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: "var(--border-strong)",
                  boxShadow: "var(--shadow-popover)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Save Playlist</span>
                  <button
                    type="button"
                    onClick={() => setOpenPopover(null)}
                    className="h-6 w-6 flex items-center justify-center rounded-md"
                    style={{ color: "var(--text-muted)" }}
                    aria-label="Close save playlist dialog"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <form onSubmit={handleSaveSubmit} className="space-y-2">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="Playlist name (e.g. Deep Focus Mix)..."
                    autoFocus
                    className="w-full h-8 px-2.5 rounded-lg border text-xs outline-none"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-primary)",
                    }}
                  />

                  {isCustomCategory ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={customCategoryDraft}
                        onChange={(e) => setCustomCategoryDraft(e.target.value)}
                        placeholder="Custom category..."
                        autoFocus
                        className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border text-xs outline-none"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-primary)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomCategory(false);
                          setCustomCategoryDraft("");
                        }}
                        className="h-8 w-8 rounded-lg border flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-muted)",
                        }}
                        title="Choose from saved categories"
                        aria-label="Back to category list"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <select
                      value={presetCategory}
                      onChange={(e) => {
                        if (e.target.value === "__custom__") {
                          setIsCustomCategory(true);
                        } else {
                          setPresetCategory(e.target.value);
                        }
                      }}
                      className="w-full h-8 px-2 rounded-lg border text-xs outline-none"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                      aria-label="Playlist category"
                    >
                      {categoryChoices.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="__custom__">+ Custom category...</option>
                    </select>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!presetName.trim()}
                      className="h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap disabled:opacity-45"
                      style={{
                        backgroundColor: "var(--accent)",
                        color: "var(--accent-fg)",
                      }}
                    >
                      Save Playlist
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Clear Stack */}
          <button
            type="button"
            disabled={!hasStreams}
            onClick={onClearStack}
            className="h-8 w-8 lg:w-auto lg:px-2.5 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 hover:bg-[var(--bg-surface-hover)] disabled:opacity-45"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
            title="Clear all stacked streams"
            aria-label="Clear stack"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Clear</span>
          </button>

          {/* Manager Split Pane Toggle */}
          <button
            type="button"
            onClick={onToggleSidebar}
            className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors hover:bg-[var(--bg-surface-hover)]"
            style={{
              backgroundColor: sidebarOpen
                ? "var(--accent-soft)"
                : "var(--bg-surface)",
              borderColor: sidebarOpen
                ? "var(--accent)"
                : "var(--border-subtle)",
              color: sidebarOpen ? "var(--accent)" : "var(--text-secondary)",
            }}
            title={
              sidebarOpen
                ? "Hide manager split pane"
                : "Show manager split pane"
            }
            aria-label={
              sidebarOpen ? "Hide manager split pane" : "Show manager split pane"
            }
          >
            {sidebarOpen ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
            <span className="hidden lg:inline">Manager</span>
          </button>
        </div>
      </div>
    </div>
  );
};
