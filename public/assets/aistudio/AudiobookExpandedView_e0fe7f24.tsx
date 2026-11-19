import {
  ChevronDown,
  Loader2,
  Moon,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
} from 'lucide-react';
import React, {useEffect, useMemo, useRef} from 'react';
import type {NarrationStatus} from '../../hooks/useAudiobookNarrator';
import type {NarrationSentence} from '../../lib/narrationText';
import type {BookRecord, BookVoiceOverride, SleepTimerMode} from '../../types/library';
import {BookCover} from '../library/BookCover';
import {formatCountdown} from './AudiobookPlayerBar';

interface AudiobookExpandedViewProps {
  book: BookRecord;
  unitLabel: string;
  sentences: NarrationSentence[];
  activeSentenceIndex: number;
  activeWordIndex: number;
  status: NarrationStatus;
  errorMessage: string | null;
  settings: BookVoiceOverride;
  activeVoiceName: string;
  sleepTimerMode: SleepTimerMode;
  sleepSecondsLeft: number | null;
  onTogglePlay: () => void;
  onJumpToSentence: (index: number) => void;
  onStepSentence: (delta: -1 | 1) => void;
  onSkipSeconds: (deltaSec: number) => void;
  onUpdateRate: (rate: number) => void;
  onSelectSleepTimer: (mode: SleepTimerMode) => void;
  onOpenVoiceSettings: () => void;
  onCollapse: () => void;
}

const SLEEP_TABS: Array<{id: SleepTimerMode; label: string}> = [
  {id: 'off', label: 'Off'},
  {id: '15m', label: '15m'},
  {id: '30m', label: '30m'},
  {id: '45m', label: '45m'},
  {id: 'chapter', label: 'Chapter'},
];

export const AudiobookExpandedView: React.FC<AudiobookExpandedViewProps> = ({
  book,
  unitLabel,
  sentences,
  activeSentenceIndex,
  activeWordIndex,
  status,
  errorMessage,
  settings,
  activeVoiceName,
  sleepTimerMode,
  sleepSecondsLeft,
  onTogglePlay,
  onJumpToSentence,
  onStepSentence,
  onSkipSeconds,
  onUpdateRate,
  onSelectSleepTimer,
  onOpenVoiceSettings,
  onCollapse,
}) => {
  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  // Smoothly keep the active spoken sentence centered inside the live teleprompter
  useEffect(() => {
    activeLineRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [activeSentenceIndex]);

  // Escape key collapses back to the book page
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCollapse();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCollapse]);

  const remainingUnitMin = useMemo(() => {
    if (sentences.length === 0) return null;
    const remSec = sentences
      .slice(activeSentenceIndex)
      .reduce((acc, s) => acc + s.estimatedSec, 0);
    const adjustedMin = remSec / Math.max(0.7, settings.rate) / 60;
    return adjustedMin < 1 ? '< 1 min left' : `${Math.ceil(adjustedMin)} min left`;
  }, [sentences, activeSentenceIndex, settings.rate]);

  const voiceSubtitle = `${activeVoiceName} · ${settings.tone[0].toUpperCase()}${settings.tone.slice(1)} · Offline Voice`;

  const progressPct =
    sentences.length > 1
      ? Math.round((activeSentenceIndex / (sentences.length - 1)) * 100)
      : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Audiobook listening studio"
      className="fixed inset-0 z-40 bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col overflow-hidden"
    >
      {/* Top Bar */}
      <header className="pt-safe border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 shrink-0">
        <div className="max-w-5xl mx-auto h-14 px-4 sm:px-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCollapse}
            className="min-h-[40px] px-2.5 -ml-2 rounded-md inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
          >
            <ChevronDown className="w-4 h-4 text-[var(--accent)]" />
            <span>Back to Page</span>
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="text-xs font-medium text-[var(--text-primary)] truncate">{unitLabel}</p>
            <p className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
              {sentences.length > 0
                ? `Sentence ${activeSentenceIndex + 1} of ${sentences.length}`
                : 'Ready'}
              {remainingUnitMin ? ` · ${remainingUnitMin}` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenVoiceSettings}
            className="min-h-[40px] px-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="hidden sm:inline">Voice &amp; Tone</span>
          </button>
        </div>
      </header>

      {/* Error Banner if needed */}
      {status === 'error' && errorMessage && (
        <div className="px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-center gap-3 text-xs">
          <span className="text-[var(--danger)]">{errorMessage}</span>
        </div>
      )}

      {/* Main Content: Cover + Live Synced Teleprompter */}
      <div className="flex-1 min-h-0 max-w-5xl w-full mx-auto px-5 sm:px-8 py-5 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 overflow-hidden">
        {/* Left: Cover & Book Metadata */}
        <div className="lg:col-span-4 flex flex-row lg:flex-col items-center lg:justify-center gap-4 lg:gap-5 shrink-0">
          <div className="w-20 sm:w-24 lg:w-52 shrink-0 shadow-lg rounded-[4px]">
            <BookCover
              title={book.title}
              author={book.author}
              format={book.format}
              coverDataUrl={book.coverDataUrl}
              paletteIndex={book.coverPaletteIndex}
              coverStyle={book.coverStyle}
              size="lg"
            />
          </div>

          <div className="min-w-0 flex-1 lg:flex-none lg:text-center">
            <h2 className="font-serif-editorial text-lg lg:text-2xl font-semibold text-[var(--text-primary)] leading-snug line-clamp-2">
              {book.title}
            </h2>
            <p className="text-xs lg:text-sm text-[var(--text-secondary)] truncate mt-1">
              {book.author}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-2 truncate">{voiceSubtitle}</p>
          </div>
        </div>

        {/* Right: Synchronized Live Transcript (click any sentence to jump) */}
        <div className="lg:col-span-8 min-h-0 flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)] shrink-0">
            <span className="uppercase tracking-wider font-semibold">Live Synced Text</span>
            <span>Tap any line to jump</span>
          </div>

          <div
            data-folio-vscroll="true"
            className="flex-1 overflow-y-auto px-5 sm:px-8 py-8 space-y-4"
          >
            {sentences.length === 0 ? (
              <p className="text-center text-sm text-[var(--text-muted)] py-12">
                No readable text found in this section.
              </p>
            ) : (
              sentences.map((sent) => {
                const isActive = sent.index === activeSentenceIndex;
                const isPast = sent.index < activeSentenceIndex;
                return (
                  <button
                    key={sent.index}
                    ref={isActive ? activeLineRef : undefined}
                    type="button"
                    onClick={() => onJumpToSentence(sent.index)}
                    className={`block w-full text-left font-serif-editorial leading-relaxed transition-all duration-150 rounded-md px-3 py-2 cursor-pointer ${
                      isActive
                        ? 'text-lg sm:text-xl text-[var(--text-primary)] bg-[var(--tts-sentence-bg)]'
                        : isPast
                          ? 'text-sm sm:text-base text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                          : 'text-sm sm:text-base text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {isActive
                      ? sent.words.map((w, wIdx) => {
                          const isCurrentWord = wIdx === activeWordIndex;
                          return (
                            <React.Fragment key={w.index}>
                              <span
                                className={
                                  isCurrentWord ? 'folio-tts-word font-medium' : undefined
                                }
                              >
                                {w.text}
                              </span>
                              {wIdx < sent.words.length - 1 ? ' ' : ''}
                            </React.Fragment>
                          );
                        })
                      : sent.rawText}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom Studio Transport Deck */}
      <footer className="pb-safe border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 space-y-4">
          {/* Sentence Scrubber */}
          <div className="space-y-1">
            <input
              type="range"
              min={0}
              max={Math.max(0, sentences.length - 1)}
              value={Math.min(activeSentenceIndex, Math.max(0, sentences.length - 1))}
              onChange={(e) => onJumpToSentence(Number(e.target.value))}
              aria-label="Jump within current section"
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
            <div className="flex items-center justify-between font-mono-tabular text-[11px] text-[var(--text-muted)]">
              <span>{progressPct}% of section</span>
              <span>
                {activeSentenceIndex + 1} / {Math.max(1, sentences.length)}
              </span>
            </div>
          </div>

          {/* Primary Transport Buttons */}
          <div className="flex items-center justify-center gap-3 sm:gap-5">
            <button
              type="button"
              onClick={() => onStepSentence(-1)}
              aria-label="Previous sentence"
              className="w-11 h-11 rounded-full inline-flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => onSkipSeconds(-15)}
              aria-label="Skip back 15 seconds"
              className="w-12 h-11 rounded-full inline-flex items-center justify-center gap-0.5 text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="font-mono-tabular text-xs font-medium">15</span>
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={status === 'playing' ? 'Pause' : 'Play'}
              className="w-14 h-14 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] inline-flex items-center justify-center shadow-md transition-transform active:scale-95 cursor-pointer"
            >
              {status === 'buffering' ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : status === 'playing' ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onSkipSeconds(15)}
              aria-label="Skip forward 15 seconds"
              className="w-12 h-11 rounded-full inline-flex items-center justify-center gap-0.5 text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              <span className="font-mono-tabular text-xs font-medium">15</span>
              <RotateCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onStepSentence(1)}
              aria-label="Next sentence"
              className="w-11 h-11 rounded-full inline-flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* Secondary Utility Row: Speed Slider & Sleep Timer */}
          <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-1 max-w-xs">
              <span className="text-[11px] font-medium text-[var(--text-muted)] shrink-0">
                Speed
              </span>
              <input
                type="range"
                min={0.7}
                max={2.5}
                step={0.05}
                value={settings.rate}
                onChange={(e) => onUpdateRate(Number(e.target.value))}
                aria-label="Playback speed"
                className="flex-1 accent-[var(--accent)] cursor-pointer"
              />
              <span className="font-mono-tabular text-xs font-semibold text-[var(--accent)] w-10 text-right shrink-0">
                {settings.rate.toFixed(2).replace(/\.00$/, '.0')}×
              </span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <Moon className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 mr-0.5" />
              {SLEEP_TABS.map((tab) => {
                const active = sleepTimerMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onSelectSleepTimer(tab.id)}
                    className={`min-h-[32px] px-2.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--bg-accent-subtle)] text-[var(--accent)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    {active && sleepSecondsLeft !== null && tab.id !== 'chapter'
                      ? formatCountdown(sleepSecondsLeft)
                      : tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
