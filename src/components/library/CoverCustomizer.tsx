import {ChevronDown, ChevronUp, ImagePlus, Palette, RotateCcw} from 'lucide-react';
import React, {useRef, useState} from 'react';
import {
  COVER_PALETTES,
  COVER_STYLES,
  compressCoverImageToDataUrl,
} from '../../lib/formatters';
import type {BookFormat, CoverStyle} from '../../types/library';
import {BookCover} from './BookCover';

interface CoverCustomizerProps {
  title: string;
  author: string;
  format: BookFormat;
  coverDataUrl: string | null;
  coverPaletteIndex: number;
  coverStyle: CoverStyle;
  onChange: (patch: {
    coverDataUrl?: string | null;
    coverPaletteIndex?: number;
    coverStyle?: CoverStyle;
  }) => void;
  compact?: boolean;
  collapsibleGenerated?: boolean;
}

export const CoverCustomizer: React.FC<CoverCustomizerProps> = ({
  title,
  author,
  format,
  coverDataUrl,
  coverPaletteIndex,
  coverStyle,
  onChange,
  compact = false,
  collapsibleGenerated = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showGeneratedControls, setShowGeneratedControls] = useState(!collapsibleGenerated);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setIsProcessing(true);
    try {
      const dataUrl = await compressCoverImageToDataUrl(file);
      onChange({coverDataUrl: dataUrl});
    } catch {
      setUploadError('Could not read that image. Try PNG, JPG, or WebP.');
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  const generatedControlsVisible = !collapsibleGenerated || showGeneratedControls;

  return (
    <div className="space-y-3.5">
      {/* Upload / Customize Generated Cover / Reset Row */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          disabled={isProcessing}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
        >
          <ImagePlus className="w-3.5 h-3.5" />
          <span>{isProcessing ? 'Processing...' : coverDataUrl ? 'Replace Image' : 'Upload Cover'}</span>
        </button>

        {collapsibleGenerated && (
          <button
            type="button"
            aria-expanded={showGeneratedControls}
            onClick={() => setShowGeneratedControls((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
              showGeneratedControls
                ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)]'
                : 'border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Generated Cover Style</span>
            {showGeneratedControls ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        )}

        {coverDataUrl && (
          <button
            type="button"
            onClick={() => onChange({coverDataUrl: null})}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Use Generated Cover</span>
          </button>
        )}
      </div>

      {uploadError && <p className="text-[11px] text-[var(--danger)]">{uploadError}</p>}

      {/* Generated Cover Style & Palette Controls */}
      {generatedControlsVisible && (
        <div className="space-y-3 pt-1">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                Generated Cover Style
              </span>
              {coverDataUrl && (
                <span className="text-[10px] text-[var(--text-muted)]">
                  Selecting a style switches off custom image
                </span>
              )}
            </div>
            <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-4'} gap-2`}>
              {COVER_STYLES.map((style) => {
                const active = !coverDataUrl && coverStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => onChange({coverStyle: style.id, coverDataUrl: null})}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-md border text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="w-10">
                      <BookCover
                        title={title}
                        author={author}
                        format={format}
                        coverDataUrl={null}
                        paletteIndex={coverPaletteIndex}
                        coverStyle={style.id}
                        size="sm"
                      />
                    </div>
                    <span className="text-[11px] font-medium text-[var(--text-primary)] truncate w-full text-center">
                      {style.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">
              Archival Palette
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {COVER_PALETTES.map((pal, idx) => {
                const active = !coverDataUrl && coverPaletteIndex === idx;
                return (
                  <button
                    key={pal.name}
                    type="button"
                    title={pal.name}
                    aria-label={`Select ${pal.name} cover palette`}
                    onClick={() => onChange({coverPaletteIndex: idx, coverDataUrl: null})}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] transition-colors cursor-pointer ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--text-primary)] font-medium'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-xs shrink-0 border border-black/15"
                      style={{backgroundColor: pal.bg}}
                    />
                    <span>{pal.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
