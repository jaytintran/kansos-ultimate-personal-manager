import {Check, Play, RotateCcw, Search, Square, Volume2} from 'lucide-react';
import React, {useMemo, useState} from 'react';
import {NARRATOR_TONES} from '../../hooks/useVoicePreferences';
import type {BookVoiceOverride, NarratorTone} from '../../types/library';

interface VoiceSettingsPanelProps {
  settings: BookVoiceOverride & {skipNoise: boolean; tapToRead: boolean};
  deviceVoices: SpeechSynthesisVoice[];
  hasBookOverride: boolean;
  previewingVoiceUri: string | null;
  embeddedInSheet?: boolean;
  onUpdateBookVoice: (patch: Partial<BookVoiceOverride>) => void;
  onUpdateGlobalOption: (patch: {skipNoise?: boolean; tapToRead?: boolean}) => void;
  onResetBookOverride: () => void;
  onPreviewVoice: (voiceUri: string, tone: NarratorTone, rate: number) => void;
}

const SPEED_PRESETS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5];

export const VoiceSettingsPanel: React.FC<VoiceSettingsPanelProps> = ({
  settings,
  deviceVoices,
  hasBookOverride,
  previewingVoiceUri,
  embeddedInSheet = false,
  onUpdateBookVoice,
  onUpdateGlobalOption,
  onResetBookOverride,
  onPreviewVoice,
}) => {
  const [voiceFilter, setVoiceFilter] = useState('');

  const filteredVoices = useMemo(() => {
    const q = voiceFilter.trim().toLowerCase();
    if (!q) return deviceVoices;
    return deviceVoices.filter(
      (v) => v.name.toLowerCase().includes(q) || v.lang.toLowerCase().includes(q)
    );
  }, [deviceVoices, voiceFilter]);

  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  return (
    <div
      className={
        embeddedInSheet
          ? 'p-4 space-y-5 text-xs'
          : 'w-[340px] max-h-[78vh] overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl p-4 space-y-5 text-xs'
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-serif-editorial text-sm font-semibold text-[var(--text-primary)]">
            Offline Narrator &amp; Voice
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            {hasBookOverride
              ? 'Voice & speed remembered for this book'
              : 'Runs locally on your device — works offline'}
          </p>
        </div>
        {hasBookOverride && (
          <button
            type="button"
            onClick={onResetBookOverride}
            title="Reset this book's voice settings"
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Narrator Tone Presets */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Narrator Tone
          </span>
          <span className="text-[11px] text-[var(--text-muted)] truncate">
            {NARRATOR_TONES.find((t) => t.id === settings.tone)?.description}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-sidebar)]">
          {NARRATOR_TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onUpdateBookVoice({tone: t.id})}
              className={`min-h-[34px] px-2 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                settings.tone === t.id
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Offline Device Voices Picker with Live Sample Preview */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Device Voices
          </span>
          {deviceVoices.length > 0 && (
            <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
              {filteredVoices.length} available
            </span>
          )}
        </div>

        {deviceVoices.length > 8 && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={voiceFilter}
              onChange={(e) => setVoiceFilter(e.target.value)}
              placeholder="Filter voices or language..."
              aria-label="Filter device voices"
              className="w-full h-8 pl-8 pr-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        )}

        <div className="max-h-52 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
          {!speechSupported ? (
            <div className="p-4 text-center text-[var(--text-muted)]">
              Speech synthesis is not supported in this browser.
            </div>
          ) : filteredVoices.length === 0 ? (
            <div className="p-4 text-center text-[var(--text-muted)] flex items-center justify-center gap-2">
              <Volume2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                {deviceVoices.length === 0
                  ? 'Using your system default offline voice'
                  : 'No matching voices found'}
              </span>
            </div>
          ) : (
            filteredVoices.slice(0, 40).map((voice) => {
              const selected =
                settings.deviceVoiceUri === voice.voiceURI ||
                (!settings.deviceVoiceUri && voice.default);
              const isPreviewing = previewingVoiceUri === voice.voiceURI;
              return (
                <div
                  key={voice.voiceURI}
                  onClick={() => onUpdateBookVoice({deviceVoiceUri: voice.voiceURI})}
                  className={`flex items-center justify-between gap-2 px-3 py-2 cursor-pointer transition-colors ${
                    selected
                      ? 'bg-[var(--bg-accent-subtle)]'
                      : 'hover:bg-[var(--bg-surface-hover)]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-medium truncate ${
                          selected ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {voice.name}
                      </span>
                      {selected && (
                        <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] font-mono-tabular">
                      {voice.lang}
                      {voice.localService ? ' · Offline' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreviewVoice(voice.voiceURI, settings.tone, settings.rate);
                    }}
                    title={isPreviewing ? `Stop ${voice.name} preview` : `Preview ${voice.name}`}
                    aria-label={
                      isPreviewing ? `Stop ${voice.name} preview` : `Preview ${voice.name}`
                    }
                    className={`min-w-[34px] min-h-[34px] px-2.5 rounded-md border inline-flex items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer shrink-0 ${
                      isPreviewing
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    {isPreviewing ? (
                      <>
                        <Square className="w-2.5 h-2.5 fill-current" />
                        <span>Stop</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 fill-current" />
                        <span>Preview</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Speed Slider (0.7x to 2.5x) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Playback Speed
          </span>
          <span className="font-mono-tabular text-xs font-semibold text-[var(--accent)]">
            {settings.rate.toFixed(2).replace(/\.00$/, '.0')}×
          </span>
        </div>
        <input
          type="range"
          min={0.7}
          max={2.5}
          step={0.05}
          value={settings.rate}
          onChange={(e) => onUpdateBookVoice({rate: Number(e.target.value)})}
          aria-label="Playback speed"
          className="w-full accent-[var(--accent)] cursor-pointer"
        />
        <div className="flex items-center justify-between gap-1">
          {SPEED_PRESETS.map((spd) => (
            <button
              key={spd}
              type="button"
              onClick={() => onUpdateBookVoice({rate: spd})}
              className={`px-1.5 py-1 rounded text-[11px] font-mono-tabular transition-colors cursor-pointer ${
                Math.abs(settings.rate - spd) < 0.03
                  ? 'bg-[var(--bg-accent-subtle)] text-[var(--accent)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {spd}×
            </button>
          ))}
        </div>
      </div>

      {/* Smart Reading Polish Switches */}
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
        <button
          type="button"
          role="switch"
          aria-checked={settings.skipNoise}
          onClick={() => onUpdateGlobalOption({skipNoise: !settings.skipNoise})}
          className="w-full min-h-[42px] px-3 flex items-center justify-between gap-3 text-left cursor-pointer"
        >
          <span className="text-xs text-[var(--text-primary)]">
            Skip footnotes, headers &amp; page numbers
          </span>
          <span
            className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center shrink-0 ${
              settings.skipNoise
                ? 'bg-[var(--accent)] justify-end'
                : 'bg-[var(--border-strong)] justify-start'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-[var(--bg-elevated)] shadow-xs" />
          </span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={settings.tapToRead}
          onClick={() => onUpdateGlobalOption({tapToRead: !settings.tapToRead})}
          className="w-full min-h-[42px] px-3 flex items-center justify-between gap-3 text-left cursor-pointer"
        >
          <span className="text-xs text-[var(--text-primary)]">
            Tap any sentence to read from there
          </span>
          <span
            className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center shrink-0 ${
              settings.tapToRead
                ? 'bg-[var(--accent)] justify-end'
                : 'bg-[var(--border-strong)] justify-start'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-[var(--bg-elevated)] shadow-xs" />
          </span>
        </button>
      </div>
    </div>
  );
};
