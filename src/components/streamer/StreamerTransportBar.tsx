import React, { useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Clock,
  Equal,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

interface StreamerTransportBarProps {
  stackedCount: number;
  isPlaying: boolean;
  isAllPaused: boolean;
  allActiveMuted: boolean;
  masterVolume: number;
  sleepRemainingSeconds: number | null;
  onTogglePlayPauseAll: () => void;
  onToggleMuteAll: () => void;
  onSyncAll: () => void;
  onChangeMasterVolume: (vol: number) => void;
  onQuietLayer: () => void;
  onBalanceAll: () => void;
  onStartSleepTimer: (minutes: number) => void;
  onCancelSleepTimer: () => void;
  onSaveStack: (name: string, category: string) => void;
  onClearStack: () => void;
}

const SLEEP_PRESETS = [15, 30, 45, 60, 90];
const ROUTINE_CATEGORIES = ['Focus', 'Overnight', 'Study', 'Healing', 'General'];

function formatTimer(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const StreamerTransportBar: React.FC<StreamerTransportBarProps> = ({
  stackedCount,
  isPlaying,
  isAllPaused,
  allActiveMuted,
  masterVolume,
  sleepRemainingSeconds,
  onTogglePlayPauseAll,
  onToggleMuteAll,
  onSyncAll,
  onChangeMasterVolume,
  onQuietLayer,
  onBalanceAll,
  onStartSleepTimer,
  onCancelSleepTimer,
  onSaveStack,
  onClearStack,
}) => {
  const [sleepPopoverOpen, setSleepPopoverOpen] = useState(false);
  const [customSleepMins, setCustomSleepMins] = useState('25');
  const [savePopoverOpen, setSavePopoverOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetCategory, setPresetCategory] = useState('Focus');

  const sleepRef = useRef<HTMLDivElement | null>(null);
  const saveRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!sleepPopoverOpen && !savePopoverOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (sleepPopoverOpen && sleepRef.current && !sleepRef.current.contains(e.target as Node)) {
        setSleepPopoverOpen(false);
      }
      if (savePopoverOpen && saveRef.current && !saveRef.current.contains(e.target as Node)) {
        setSavePopoverOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [sleepPopoverOpen, savePopoverOpen]);

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = presetName.trim();
    if (!trimmed) return;
    onSaveStack(trimmed, presetCategory);
    setPresetName('');
    setSavePopoverOpen(false);
  };

  const handleCustomSleepSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(customSleepMins, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    onStartSleepTimer(Math.min(480, parsed));
    setSleepPopoverOpen(false);
  };

  const showPauseLabel = isPlaying && !isAllPaused;
  const hasStreams = stackedCount > 0;

  return (
    <div
      className="px-3.5 sm:px-5 py-2 border-b flex flex-wrap items-center justify-between gap-2.5 shrink-0"
      style={{
        backgroundColor: 'var(--bg-canvas)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Left: Combined Play/Pause + Combined Mute/Unmute + Separate Sync + Master Mixer */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Global Transport */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!hasStreams}
            onClick={onTogglePlayPauseAll}
            className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-45"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-fg)',
            }}
            title={showPauseLabel ? 'Pause all stacked streams' : 'Play all stacked streams'}
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

          <button
            type="button"
            disabled={!hasStreams}
            onClick={onToggleMuteAll}
            className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-45"
            style={{
              backgroundColor: allActiveMuted ? 'var(--accent-soft)' : 'var(--bg-surface)',
              borderColor: allActiveMuted ? 'var(--danger)' : 'var(--border-subtle)',
              color: allActiveMuted ? 'var(--danger)' : 'var(--text-primary)',
            }}
            title={allActiveMuted ? 'Unmute all streams' : 'Mute all streams'}
          >
            {allActiveMuted ? (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                <span>Unmute</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5" />
                <span>Mute</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={!hasStreams}
            onClick={onSyncAll}
            className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 hover:bg-[var(--bg-surface-hover)] disabled:opacity-45"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            title="Restart all stacked streams together from 0:00"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Sync</span>
          </button>
        </div>

        <span
          className="hidden sm:inline-block h-5 w-px"
          style={{ backgroundColor: 'var(--border-subtle)' }}
          aria-hidden="true"
        />

        {/* Master Volume Slider + Quiet Layer + Balance All */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="h-8 px-2.5 rounded-lg border inline-flex items-center gap-2"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <span
              className="text-[11px] font-medium whitespace-nowrap"
              style={{ color: 'var(--text-secondary)' }}
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
              className="w-20 sm:w-24 cursor-pointer"
              style={{ accentColor: 'var(--accent)' }}
              aria-label="Master volume"
            />
            <span
              className="text-[11px] font-mono tabular-nums w-8 text-right"
              style={{ color: 'var(--accent)' }}
            >
              {masterVolume}%
            </span>
          </div>

          <button
            type="button"
            disabled={!hasStreams}
            onClick={onQuietLayer}
            className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 hover:bg-[var(--bg-surface-hover)] disabled:opacity-45"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            title="Lower all layers to a soft 20% background bed"
          >
            <Volume1 className="w-3.5 h-3.5" />
            <span>Quiet Layer</span>
          </button>

          <button
            type="button"
            disabled={!hasStreams}
            onClick={onBalanceAll}
            className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 hover:bg-[var(--bg-surface-hover)] disabled:opacity-45"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            title="Equalize all stacked streams to 50%"
          >
            <Equal className="w-3.5 h-3.5" />
            <span>Balance All</span>
          </button>
        </div>
      </div>

      {/* Right: Sleep Timer + Count + Save Stack + Clear */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Sleep Timer with Fade-Out Popover */}
        <div className="relative" ref={sleepRef}>
          <button
            type="button"
            onClick={() => setSleepPopoverOpen((prev) => !prev)}
            className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            style={{
              backgroundColor:
                sleepRemainingSeconds !== null ? 'var(--accent-soft)' : 'var(--bg-surface)',
              borderColor:
                sleepRemainingSeconds !== null ? 'var(--accent)' : 'var(--border-subtle)',
              color:
                sleepRemainingSeconds !== null ? 'var(--accent)' : 'var(--text-secondary)',
            }}
            title="Sleep Timer with gradual fade-out pause"
          >
            <Clock className="w-3.5 h-3.5" />
            {sleepRemainingSeconds !== null ? (
              <span className="font-mono tabular-nums">
                {formatTimer(sleepRemainingSeconds)}
              </span>
            ) : (
              <span>Sleep Timer</span>
            )}
          </button>

          {sleepPopoverOpen && (
            <div
              className="absolute right-0 mt-2 w-64 rounded-xl border p-3 space-y-2.5 z-40"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-strong)',
                boxShadow: 'var(--shadow-popover)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Sleep Timer (Fade-Out)</span>
                <button
                  type="button"
                  onClick={() => setSleepPopoverOpen(false)}
                  className="h-6 w-6 flex items-center justify-center rounded-md"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Close sleep timer menu"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                Gradually fades audio out over the final 15s, then pauses all streams.
              </p>

              <div className="grid grid-cols-3 gap-1.5">
                {SLEEP_PRESETS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      onStartSleepTimer(mins);
                      setSleepPopoverOpen(false);
                    }}
                    className="h-7 rounded-lg border text-xs font-mono tabular-nums font-medium transition-colors hover:bg-[var(--bg-surface-hover)]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
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
                      setSleepPopoverOpen(false);
                    }}
                    className="h-7 rounded-lg border text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-surface-subtle)',
                      borderColor: 'var(--danger)',
                      color: 'var(--danger)',
                    }}
                  >
                    Off
                  </button>
                )}
              </div>

              <form onSubmit={handleCustomSleepSubmit} className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={480}
                  value={customSleepMins}
                  onChange={(e) => setCustomSleepMins(e.target.value)}
                  className="w-20 h-7 px-2 rounded-lg border text-xs font-mono tabular-nums outline-none"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                  aria-label="Custom sleep timer minutes"
                />
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  min
                </span>
                <button
                  type="submit"
                  className="ml-auto h-7 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-fg)',
                  }}
                >
                  Start
                </button>
              </form>
            </div>
          )}
        </div>

        <span
          className="text-xs font-mono tabular-nums px-1 whitespace-nowrap"
          style={{ color: 'var(--text-muted)' }}
        >
          {stackedCount} stacked
        </span>

        {/* Save Stack Popover */}
        <div className="relative" ref={saveRef}>
          <button
            type="button"
            disabled={!hasStreams}
            onClick={() => setSavePopoverOpen((prev) => !prev)}
            className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 hover:bg-[var(--bg-surface-hover)] disabled:opacity-45"
            style={{
              backgroundColor: savePopoverOpen ? 'var(--accent-soft)' : 'var(--bg-surface)',
              borderColor: savePopoverOpen ? 'var(--accent)' : 'var(--border-subtle)',
              color: savePopoverOpen ? 'var(--accent)' : 'var(--text-primary)',
            }}
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>Save Stack</span>
          </button>

          {savePopoverOpen && (
            <div
              className="absolute right-0 mt-2 w-72 rounded-xl border p-3.5 space-y-2.5 z-40"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-strong)',
                boxShadow: 'var(--shadow-popover)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Save Routine Stack Preset</span>
                <button
                  type="button"
                  onClick={() => setSavePopoverOpen(false)}
                  className="h-6 w-6 flex items-center justify-center rounded-md"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Close save stack dialog"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form onSubmit={handleSaveSubmit} className="space-y-2">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Preset name (e.g. Deep Focus Mix)..."
                  autoFocus
                  className="w-full h-8 px-2.5 rounded-lg border text-xs outline-none"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />

                <div className="flex items-center gap-2">
                  <select
                    value={presetCategory}
                    onChange={(e) => setPresetCategory(e.target.value)}
                    className="flex-1 h-8 px-2 rounded-lg border text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                    aria-label="Routine category"
                  >
                    {ROUTINE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>

                  <button
                    type="submit"
                    disabled={!presetName.trim()}
                    className="h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap disabled:opacity-45"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: 'var(--accent-fg)',
                    }}
                  >
                    Save Mix
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={!hasStreams}
          onClick={onClearStack}
          className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 hover:bg-[var(--bg-surface-hover)] disabled:opacity-45"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
          title="Clear all stacked streams"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
      </div>
    </div>
  );
};
