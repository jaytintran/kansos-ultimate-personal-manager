import {
  AudioLines,
  Crosshair,
  Loader2,
  Maximize2,
  Moon,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import React, {useState} from 'react';
import type {NarrationStatus} from '../../hooks/useAudiobookNarrator';
import type {BookVoiceOverride, SleepTimerMode} from '../../types/library';

interface AudiobookPlayerBarProps {
  status: NarrationStatus;
  errorMessage: string | null;
  activeSentenceText: string;
  activeSentenceIndex: number;
  totalSentences: number;
  settings: BookVoiceOverride;
  activeVoiceName: string;
  sleepTimerMode: SleepTimerMode;
  sleepSecondsLeft: number | null;
  userDetachedScroll: boolean;
  scrubberVisible: boolean;
  scrubberPinned: boolean;
  voiceSettingsOpen: boolean;
  onTogglePlay: () => void;
  onStepSentence: (delta: -1 | 1) => void;
  onSkipSeconds: (deltaSec: number) => void;
  onUpdateRate: (rate: number) => void;
  onSelectSleepTimer: (mode: SleepTimerMode) => void;
  onToggleVoiceSettings: () => void;
  onRecenterToVoice: () => void;
  onExpandAudiobook: () => void;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const SLEEP_OPTIONS: Array<{id: SleepTimerMode; label: string}> = [
  {id: 'off', label: 'Off'},
  {id: '15m', label: '15 min'},
  {id: '30m', label: '30 min'},
  {id: '45m', label: '45 min'},
  {id: 'chapter', label: 'End of chapter'},
];

const QUICK_SPEEDS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5];

export function formatCountdown(seconds: number | null): string {
  if (seconds === null) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const AudiobookPlayerBar: React.FC<AudiobookPlayerBarProps> = ({
  status,
  errorMessage,
  activeSentenceText,
  activeSentenceIndex,
  totalSentences,
  settings,
  activeVoiceName,
  sleepTimerMode,
  sleepSecondsLeft,
  userDetachedScroll,
  scrubberVisible,
  scrubberPinned,
  voiceSettingsOpen,
  onTogglePlay,
  onStepSentence,
  onSkipSeconds,
  onUpdateRate,
  onSelectSleepTimer,
  onToggleVoiceSettings,
  onRecenterToVoice,
  onExpandAudiobook,
  onClose,
  onMouseEnter,
  onMouseLeave,
}) => {
  const [sleepMenuOpen, setSleepMenuOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);

  const isPlayingOrBuffering = status === 'playing' || status === 'buffering';

  // Position cleanly above the scrubber when scrubber is fixed/unpinned, or docked in flex flow when pinned
  const positioningClass = scrubberPinned
    ? 'relative z-30 shrink-0'
    : `fixed left-0 right-0 z-30 transition-[bottom] duration-180 ease-out ${
        scrubberVisible ? 'bottom-[74px] sm:bottom-[68px]' : 'bottom-0 pb-safe lg:pb-0'
      }`;

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`${positioningClass} border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/96 backdrop-blur-md shadow-lg`}
    >
      {/* Error Banner */}
      {status === 'error' && errorMessage && (
        <div className="px-3 sm:px-5 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2 text-xs">
          <span className="text-[var(--danger)] truncate">{errorMessage}</span>
        </div>
      )}

      {/* Main Docked Bar */}
      <div className="max-w-5xl mx-auto px-2.5 sm:px-5 py-1.5 sm:py-2 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Live Active Snippet & Voice Label (Desktop / Tablet) */}
        <div className="hidden md:flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={onExpandAudiobook}
            title="Expand full Audiobook view"
            className="w-8 h-8 rounded-md bg-[var(--bg-accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0 hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] transition-colors cursor-pointer"
          >
            <AudioLines className="w-4 h-4" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="font-serif-editorial text-xs text-[var(--text-primary)] truncate">
              {activeSentenceText || 'Ready to narrate current passage'}
            </p>
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <span className="truncate">{activeVoiceName}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{settings.tone}</span>
              {totalSentences > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">
                    {activeSentenceIndex + 1}/{totalSentences}
                  </span>
                </>
              )}
            </div>
          </div>

          {userDetachedScroll && (
            <button
              type="button"
              onClick={onRecenterToVoice}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)] text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Crosshair className="w-3 h-3" />
              <span>Follow Voice</span>
            </button>
          )}
        </div>

        {/* Center: Primary Transport Controls */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onStepSentence(-1)}
            title="Previous sentence"
            aria-label="Previous sentence"
            className="min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] inline-flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onSkipSeconds(-15)}
            title="Back 15 seconds"
            aria-label="Skip back 15 seconds"
            className="min-w-[40px] min-h-[38px] sm:min-w-[38px] sm:min-h-[34px] inline-flex items-center justify-center gap-0.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="font-mono-tabular text-[10px] font-medium">15</span>
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlayingOrBuffering ? 'Pause narration' : 'Play narration'}
            className="w-10 h-10 sm:w-9 sm:h-9 mx-0.5 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] inline-flex items-center justify-center shadow-xs transition-colors cursor-pointer shrink-0"
          >
            {status === 'buffering' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : status === 'playing' ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSkipSeconds(15)}
            title="Forward 15 seconds"
            aria-label="Skip forward 15 seconds"
            className="min-w-[40px] min-h-[38px] sm:min-w-[38px] sm:min-h-[34px] inline-flex items-center justify-center gap-0.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <span className="font-mono-tabular text-[10px] font-medium">15</span>
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onStepSentence(1)}
            title="Next sentence"
            aria-label="Next sentence"
            className="min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] inline-flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Speed, Sleep Timer, Voice Settings, Expand, Close */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 relative">
          {userDetachedScroll && (
            <button
              type="button"
              onClick={onRecenterToVoice}
              title="Jump back to active spoken sentence"
              aria-label="Jump to voice"
              className="md:hidden min-w-[38px] min-h-[38px] inline-flex items-center justify-center rounded-md text-[var(--accent)] bg-[var(--bg-accent-subtle)] cursor-pointer"
            >
              <Crosshair className="w-4 h-4" />
            </button>
          )}

          {/* Speed Quick Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setSpeedMenuOpen((v) => !v);
                setSleepMenuOpen(false);
              }}
              title="Playback speed"
              aria-label="Playback speed"
              className="min-h-[38px] sm:min-h-[32px] px-2 rounded-md font-mono-tabular text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
            >
              {settings.rate.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}×
            </button>

            {speedMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setSpeedMenuOpen(false)} />
                <div className="absolute right-0 bottom-11 z-40 w-56 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[var(--text-primary)]">Speed</span>
                    <span className="font-mono-tabular font-semibold text-[var(--accent)]">
                      {settings.rate.toFixed(2).replace(/\.00$/, '.0')}×
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.7}
                    max={2.5}
                    step={0.05}
                    value={settings.rate}
                    onChange={(e) => onUpdateRate(Number(e.target.value))}
                    className="w-full accent-[var(--accent)] cursor-pointer"
                  />
                  <div className="grid grid-cols-4 gap-1">
                    {QUICK_SPEEDS.map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => {
                          onUpdateRate(spd);
                          setSpeedMenuOpen(false);
                        }}
                        className={`py-1 rounded text-[11px] font-mono-tabular cursor-pointer ${
                          Math.abs(settings.rate - spd) < 0.03
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                            : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {spd}×
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sleep Timer Menu */}
          <div className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => {
                setSleepMenuOpen((v) => !v);
                setSpeedMenuOpen(false);
              }}
              title="Sleep timer"
              aria-label="Sleep timer"
              className={`min-h-[32px] px-2 rounded-md inline-flex items-center gap-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                sleepTimerMode !== 'off'
                  ? 'text-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              {sleepTimerMode !== 'off' && (
                <span className="font-mono-tabular text-[11px]">
                  {sleepTimerMode === 'chapter' ? 'Ch.' : formatCountdown(sleepSecondsLeft)}
                </span>
              )}
            </button>

            {sleepMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setSleepMenuOpen(false)} />
                <div className="absolute right-0 bottom-11 z-40 w-44 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-xl p-1.5">
                  <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Sleep Timer
                  </p>
                  {SLEEP_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onSelectSleepTimer(opt.id);
                        setSleepMenuOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded text-left text-xs transition-colors cursor-pointer ${
                        sleepTimerMode === opt.id
                          ? 'bg-[var(--bg-accent-subtle)] text-[var(--accent)] font-medium'
                          : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Voice & Tone Settings */}
          <button
            type="button"
            onClick={() => {
              setSpeedMenuOpen(false);
              setSleepMenuOpen(false);
              onToggleVoiceSettings();
            }}
            title="Voice, tone & narration settings"
            aria-label="Voice and tone settings"
            className={`min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[32px] inline-flex items-center justify-center rounded-md transition-colors cursor-pointer ${
              voiceSettingsOpen
                ? 'text-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* Expand to Full-Screen Audiobook View */}
          <button
            type="button"
            onClick={onExpandAudiobook}
            title="Open Audiobook view"
            aria-label="Expand full Audiobook view"
            className="min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[32px] inline-flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Dismiss Voice Bar */}
          <button
            type="button"
            onClick={onClose}
            title="Close voice reader"
            aria-label="Close voice reader"
            className="min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[32px] inline-flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
