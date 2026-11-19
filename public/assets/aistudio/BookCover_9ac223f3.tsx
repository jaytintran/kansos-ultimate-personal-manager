import React, {useEffect, useState} from 'react';
import {COVER_PALETTES} from '../../lib/formatters';
import type {BookFormat, CoverStyle} from '../../types/library';

interface BookCoverProps {
  title: string;
  author: string;
  format: BookFormat;
  coverDataUrl: string | null;
  paletteIndex: number;
  coverStyle?: CoverStyle;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const BookCover: React.FC<BookCoverProps> = ({
  title,
  author,
  format,
  coverDataUrl,
  paletteIndex,
  coverStyle = 'editorial',
  size = 'md',
  className = '',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [coverDataUrl]);

  const palette = COVER_PALETTES[Math.abs(paletteIndex) % COVER_PALETTES.length];
  const showImage = Boolean(coverDataUrl && !imgFailed);

  if (showImage && coverDataUrl) {
    return (
      <div
        className={`relative overflow-hidden rounded-[4px] border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] aspect-[3/4] ${className}`}
      >
        <img
          src={coverDataUrl}
          alt={`Cover of ${title}`}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
        />
        {/* Subtle book spine crease highlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-2.5 bg-gradient-to-r from-black/22 via-white/8 to-transparent"
        />
      </div>
    );
  }

  // Style 2: Minimalist Band (clean top title plate + calm lower archival field)
  if (coverStyle === 'minimal') {
    return (
      <div
        className={`relative overflow-hidden rounded-[4px] border border-[var(--border-subtle)] aspect-[3/4] flex flex-col select-none ${className}`}
        style={{backgroundColor: palette.bg, color: palette.ink}}
      >
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[6%]"
          style={{backgroundColor: palette.spine}}
        />
        <div
          className={`relative z-10 flex flex-col justify-between h-full pl-[13%] pr-[10%] ${
            size === 'sm' ? 'py-1.5' : size === 'lg' ? 'py-6' : 'py-4'
          }`}
        >
          {size === 'sm' ? (
            <div className="h-1.5 w-full rounded-xs mt-1" style={{backgroundColor: palette.accent}} />
          ) : (
            <>
              <div className="space-y-2">
                <p
                  className={`font-serif-editorial font-semibold leading-snug line-clamp-3 ${
                    size === 'lg' ? 'text-lg' : 'text-sm'
                  }`}
                >
                  {title}
                </p>
                <p className="text-[11px] opacity-75 truncate">{author}</p>
              </div>

              <div className="mt-auto space-y-2">
                <div className="h-[2px] w-full opacity-80" style={{backgroundColor: palette.accent}} />
                <div className="flex items-center justify-between text-[10px] font-mono-tabular uppercase tracking-wider opacity-70">
                  <span>{format}</span>
                  <span>Folio</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Style 3: Framed Plate (fine inner border with centered classical title)
  if (coverStyle === 'framed') {
    return (
      <div
        className={`relative overflow-hidden rounded-[4px] border border-[var(--border-subtle)] aspect-[3/4] flex flex-col select-none ${className}`}
        style={{backgroundColor: palette.bg, color: palette.ink}}
      >
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[7%]"
          style={{backgroundColor: palette.spine}}
        />
        <div
          className={`relative z-10 flex-1 flex flex-col ${
            size === 'sm' ? 'p-1.5 pl-2.5' : size === 'lg' ? 'p-4 pl-6' : 'p-3 pl-5'
          }`}
        >
          <div
            className="flex-1 flex flex-col justify-between items-center text-center border px-2.5 py-3"
            style={{borderColor: `${palette.accent}70`}}
          >
            {size !== 'sm' && (
              <span
                className="font-mono-tabular text-[9px] tracking-[0.18em] uppercase opacity-75"
                style={{color: palette.accent}}
              >
                {format}
              </span>
            )}
            {size !== 'sm' && (
              <p
                className={`font-serif-editorial font-semibold leading-snug line-clamp-4 my-auto ${
                  size === 'lg' ? 'text-lg' : 'text-[13px]'
                }`}
              >
                {title}
              </p>
            )}
            {size !== 'sm' && (
              <div className="w-full space-y-1.5">
                <div
                  className="mx-auto h-px w-8 opacity-65"
                  style={{backgroundColor: palette.accent}}
                />
                <p className="text-[10px] opacity-80 truncate">{author}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Style 4: Swiss Grid (crisp typographic hierarchy & structural rules)
  if (coverStyle === 'swiss') {
    return (
      <div
        className={`relative overflow-hidden rounded-[4px] border border-[var(--border-subtle)] aspect-[3/4] flex flex-col justify-between select-none ${className}`}
        style={{backgroundColor: palette.spine, color: palette.ink}}
      >
        {/* Top Accent Header Block */}
        <div
          className={size === 'sm' ? 'h-[30%] w-full' : 'px-3.5 pt-3 pb-2.5 flex items-center justify-between'}
          style={{backgroundColor: palette.bg}}
        >
          {size !== 'sm' && (
            <>
              <span className="font-mono-tabular text-[10px] uppercase tracking-widest opacity-80">
                {format}
              </span>
              <span
                className="w-3 h-3 rounded-xs shrink-0"
                style={{backgroundColor: palette.accent}}
              />
            </>
          )}
        </div>

        {size !== 'sm' && (
          <div
            className={`flex-1 flex flex-col justify-between px-3.5 ${
              size === 'lg' ? 'py-5' : 'py-3.5'
            }`}
          >
            <p
              className={`font-semibold tracking-tight leading-tight line-clamp-4 ${
                size === 'lg' ? 'text-lg' : 'text-[13px]'
              }`}
            >
              {title}
            </p>
            <div className="pt-2 border-t border-white/15">
              <p className="text-[10px] tracking-wide opacity-75 truncate">{author}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Style 1 (Default): Classic Editorial
  return (
    <div
      className={`relative overflow-hidden rounded-[4px] border border-[var(--border-subtle)] aspect-[3/4] flex flex-col justify-between select-none ${className}`}
      style={{backgroundColor: palette.bg, color: palette.ink}}
    >
      {/* Book spine band */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[10%]"
        style={{backgroundColor: palette.spine}}
      />

      {/* Editorial cover framing */}
      <div
        className={`relative z-10 flex flex-col justify-between h-full pl-[16%] pr-[10%] ${
          size === 'sm' ? 'py-1.5' : size === 'lg' ? 'py-6' : 'py-4'
        }`}
      >
        <div className="flex items-center justify-between gap-1">
          <span
            className="h-[2px] w-6 rounded-full"
            style={{backgroundColor: palette.accent}}
          />
          {size !== 'sm' && (
            <span
              className="font-mono-tabular text-[10px] tracking-wider uppercase opacity-75"
              style={{color: palette.ink}}
            >
              {format}
            </span>
          )}
        </div>

        <div className={size === 'sm' ? 'hidden' : 'my-auto py-2'}>
          <p
            className={`font-serif-editorial font-semibold leading-snug line-clamp-4 ${
              size === 'lg' ? 'text-lg' : 'text-sm'
            }`}
          >
            {title}
          </p>
        </div>

        {size !== 'sm' && (
          <div className="pt-2 border-t border-white/12">
            <p className="text-[11px] opacity-75 truncate">{author}</p>
          </div>
        )}
      </div>
    </div>
  );
};
