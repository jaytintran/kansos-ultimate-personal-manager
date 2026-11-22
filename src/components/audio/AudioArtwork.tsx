import { Disc3 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { COVER_PALETTES } from "../../lib/formatters";
import type { AudioFormat } from "../../types/audio";
import type { CoverStyle } from "../../types/library";

interface AudioArtworkProps {
  title: string;
  artist: string;
  format: AudioFormat;
  coverDataUrl: string | null;
  paletteIndex: number;
  coverStyle?: CoverStyle;
  size?: "sm" | "md" | "lg";
  isPlaying?: boolean;
  className?: string;
}

export const AudioArtwork: React.FC<AudioArtworkProps> = ({
  title,
  artist,
  format,
  coverDataUrl,
  paletteIndex,
  coverStyle = "editorial",
  size = "md",
  isPlaying = false,
  className = "",
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [coverDataUrl]);

  const palette =
    COVER_PALETTES[Math.abs(paletteIndex) % COVER_PALETTES.length];
  const showImage = Boolean(coverDataUrl && !imgFailed);

  if (showImage && coverDataUrl) {
    return (
      <div
        className={`relative overflow-hidden rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] aspect-square ${className}`}
      >
        <img
          src={coverDataUrl}
          alt={`Artwork for ${title}`}
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover pointer-events-none select-none"
        />
        {isPlaying && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-[var(--accent)]"
          />
        )}
      </div>
    );
  }

  if (coverStyle === "minimal") {
    return (
      <div
        className={`relative overflow-hidden rounded-[6px] border border-[var(--border-subtle)] aspect-square flex flex-col justify-between select-none ${className}`}
        style={{ backgroundColor: palette.bg, color: palette.ink }}
      >
        <div
          className={`flex flex-col justify-between h-full ${
            size === "sm" ? "p-1.5" : size === "lg" ? "p-5" : "p-3.5"
          }`}
        >
          {size === "sm" ? (
            <div className="flex items-center justify-center h-full">
              <Disc3 className="w-4 h-4 opacity-80" />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <p
                  className={`font-serif-editorial font-semibold leading-snug line-clamp-2 ${
                    size === "lg" ? "text-base" : "text-xs"
                  }`}
                >
                  {title}
                </p>
                <p className="text-[11px] opacity-75 truncate">{artist}</p>
              </div>
              <div className="space-y-1.5">
                <div
                  className="h-[2px] w-full opacity-80"
                  style={{ backgroundColor: palette.accent }}
                />
                <div className="flex items-center justify-between text-[10px] font-mono tabular-nums uppercase tracking-wider opacity-70">
                  <span>{format}</span>
                  <span>Audio</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (coverStyle === "framed") {
    return (
      <div
        className={`relative overflow-hidden rounded-[6px] border border-[var(--border-subtle)] aspect-square flex flex-col select-none ${className}`}
        style={{ backgroundColor: palette.bg, color: palette.ink }}
      >
        <div
          className={`flex-1 flex flex-col ${
            size === "sm" ? "p-1" : size === "lg" ? "p-3.5" : "p-2.5"
          }`}
        >
          <div
            className="flex-1 flex flex-col justify-between items-center text-center border p-2"
            style={{ borderColor: `${palette.accent}70` }}
          >
            {size === "sm" ? (
              <Disc3 className="w-3.5 h-3.5 my-auto opacity-80" />
            ) : (
              <>
                <span
                  className="font-mono tabular-nums text-[9px] tracking-[0.18em] uppercase opacity-75"
                  style={{ color: palette.accent }}
                >
                  {format}
                </span>
                <p
                  className={`font-serif-editorial font-semibold leading-snug line-clamp-2 my-auto ${
                    size === "lg" ? "text-base" : "text-xs"
                  }`}
                >
                  {title}
                </p>
                <p className="text-[10px] opacity-80 truncate w-full">
                  {artist}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (coverStyle === "swiss") {
    return (
      <div
        className={`relative overflow-hidden rounded-[6px] border border-[var(--border-subtle)] aspect-square flex flex-col justify-between select-none ${className}`}
        style={{ backgroundColor: palette.spine, color: palette.ink }}
      >
        <div
          className={
            size === "sm"
              ? "h-[32%] w-full"
              : "px-3 pt-2.5 pb-2 flex items-center justify-between"
          }
          style={{ backgroundColor: palette.bg }}
        >
          {size !== "sm" && (
            <>
              <span className="font-mono tabular-nums text-[10px] uppercase tracking-widest opacity-80">
                {format}
              </span>
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: palette.accent }}
              />
            </>
          )}
        </div>
        {size === "sm" ? (
          <div className="flex-1 flex items-center justify-center">
            <Disc3 className="w-3.5 h-3.5 opacity-80" />
          </div>
        ) : (
          <div
            className={`flex-1 flex flex-col justify-between px-3 ${
              size === "lg" ? "py-4" : "py-2.5"
            }`}
          >
            <p
              className={`font-semibold tracking-tight leading-tight line-clamp-2 ${
                size === "lg" ? "text-base" : "text-xs"
              }`}
            >
              {title}
            </p>
            <p className="text-[10px] tracking-wide opacity-75 truncate pt-1 border-t border-white/15">
              {artist}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Default: Editorial Vinyl Sleeve
  return (
    <div
      className={`relative overflow-hidden rounded-[6px] border border-[var(--border-subtle)] aspect-square flex flex-col justify-between select-none ${className}`}
      style={{ backgroundColor: palette.bg, color: palette.ink }}
    >
      <div
        aria-hidden="true"
        className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full border opacity-15 pointer-events-none"
        style={{ borderColor: palette.accent }}
      />
      <div
        className={`relative z-10 flex flex-col justify-between h-full ${
          size === "sm" ? "p-1.5" : size === "lg" ? "p-5" : "p-3.5"
        }`}
      >
        {size === "sm" ? (
          <div className="flex items-center justify-center h-full">
            <Disc3 className="w-4 h-4 opacity-80" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-1">
              <span
                className="h-[2px] w-5 rounded-full"
                style={{ backgroundColor: palette.accent }}
              />
              <span className="font-mono tabular-nums text-[10px] tracking-wider uppercase opacity-75">
                {format}
              </span>
            </div>

            <div className="my-auto py-1">
              <p
                className={`font-serif-editorial font-semibold leading-snug line-clamp-2 ${
                  size === "lg" ? "text-base" : "text-xs"
                }`}
              >
                {title}
              </p>
            </div>

            <div className="pt-1.5 border-t border-white/12">
              <p className="text-[11px] opacity-75 truncate">{artist}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
