import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatAudioDuration } from "../../lib/audioFormatters";
import type { AudioScrubberStyle } from "../../types/audio";

export interface ScrubberStyleOption {
  id: AudioScrubberStyle;
  label: string;
  description: string;
}

export const SCRUBBER_STYLE_OPTIONS: ScrubberStyleOption[] = [
  {
    id: "rail",
    label: "Classic Rail",
    description: "Precision track with tactile thumb",
  },
  {
    id: "youtube",
    label: "YouTube Line",
    description: "Slim hairline that expands with dot",
  },
  {
    id: "bars",
    label: "Waveform Bars",
    description: "Rounded amplitude & live spectrum",
  },
  {
    id: "mirrored",
    label: "Mirrored Studio",
    description: "Dual-edge symmetrical soundwave",
  },
  {
    id: "ribbon",
    label: "Ribbon Wave",
    description: "Continuous fluid spline curve",
  },
  {
    id: "blocks",
    label: "Equalizer Blocks",
    description: "Segmented studio meter cells",
  },
  {
    id: "groove",
    label: "Hi-Fi Groove",
    description: "Graduated twin-rail diamond needle",
  },
];

export const ScrubberStylePreviewSvg: React.FC<{
  styleId: AudioScrubberStyle;
  active?: boolean;
}> = ({ styleId, active }) => {
  const stroke = active ? "var(--accent)" : "currentColor";
  switch (styleId) {
    case "rail":
      return (
        <svg viewBox="0 0 36 14" className="w-9 h-3.5 shrink-0" aria-hidden="true">
          <rect x="1" y="5" width="34" height="4" rx="2" fill="currentColor" opacity="0.2" />
          <rect x="1" y="5" width="20" height="4" rx="2" fill={stroke} />
          <circle cx="21" cy="7" r="3.5" fill={stroke} />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 36 14" className="w-9 h-3.5 shrink-0" aria-hidden="true">
          <rect x="1" y="6" width="34" height="2" rx="1" fill="currentColor" opacity="0.22" />
          <rect x="1" y="6" width="22" height="2" rx="1" fill={stroke} />
          <circle cx="23" cy="7" r="2.8" fill={stroke} />
        </svg>
      );
    case "bars":
      return (
        <svg viewBox="0 0 36 14" className="w-9 h-3.5 shrink-0" aria-hidden="true">
          {[4, 8, 11, 6, 10, 12, 7, 5, 9, 6].map((h, i) => (
            <rect
              key={i}
              x={2 + i * 3.3}
              y={(14 - h) / 2}
              width="2"
              height={h}
              rx="1"
              fill={i < 6 ? stroke : "currentColor"}
              opacity={i < 6 ? 0.95 : 0.3}
            />
          ))}
        </svg>
      );
    case "mirrored":
      return (
        <svg viewBox="0 0 36 14" className="w-9 h-3.5 shrink-0" aria-hidden="true">
          <line x1="1" y1="7" x2="35" y2="7" stroke="currentColor" strokeWidth="0.7" opacity="0.3" />
          {[3, 7, 10, 5, 11, 8, 6, 9, 5, 4].map((h, i) => (
            <rect
              key={i}
              x={2 + i * 3.3}
              y={7 - h / 2}
              width="2"
              height={h}
              rx="0.8"
              fill={i < 6 ? stroke : "currentColor"}
              opacity={i < 6 ? 0.95 : 0.3}
            />
          ))}
        </svg>
      );
    case "ribbon":
      return (
        <svg viewBox="0 0 36 14" className="w-9 h-3.5 shrink-0" aria-hidden="true">
          <path
            d="M1 9 Q 6 3, 11 8 T 21 6 T 31 8 L 35 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            opacity="0.3"
          />
          <path
            d="M1 9 Q 6 3, 11 8 T 21 6"
            fill="none"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="21" cy="6" r="2.2" fill={stroke} />
        </svg>
      );
    case "blocks":
      return (
        <svg viewBox="0 0 36 14" className="w-9 h-3.5 shrink-0" aria-hidden="true">
          {[2, 3, 4, 2, 3, 4, 2, 3, 2, 1].map((rows, col) =>
            Array.from({ length: rows }).map((_, r) => (
              <rect
                key={`${col}-${r}`}
                x={2 + col * 3.3}
                y={10.5 - r * 2.6}
                width="2.2"
                height="1.9"
                rx="0.4"
                fill={col < 6 ? stroke : "currentColor"}
                opacity={col < 6 ? 0.95 : 0.25}
              />
            )),
          )}
        </svg>
      );
    case "groove":
      return (
        <svg viewBox="0 0 36 14" className="w-9 h-3.5 shrink-0" aria-hidden="true">
          <line x1="1" y1="7" x2="35" y2="7" stroke="currentColor" strokeWidth="1" opacity="0.28" />
          <line x1="9" y1="4.5" x2="9" y2="9.5" stroke="currentColor" strokeWidth="0.9" opacity="0.35" />
          <line x1="18" y1="4.5" x2="18" y2="9.5" stroke="currentColor" strokeWidth="0.9" opacity="0.35" />
          <line x1="27" y1="4.5" x2="27" y2="9.5" stroke="currentColor" strokeWidth="0.9" opacity="0.35" />
          <line x1="1" y1="7" x2="22" y2="7" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
          <polygon points="22,3.5 25.5,7 22,10.5 18.5,7" fill={stroke} />
        </svg>
      );
  }
};

const FALLBACK_WAVEFORM_PEAKS = Array.from({ length: 56 }, (_, i) =>
  Math.max(
    0.2,
    Math.min(0.92, 0.46 + 0.34 * Math.sin(i * 0.43) * Math.cos(i * 0.19)),
  ),
);

interface WaveformPalette {
  accentColor: string;
  mutedColor: string;
  troughColor: string;
  softAccent: string;
  elevatedColor: string;
}

function readWaveformPalette(): WaveformPalette {
  if (typeof window === "undefined") {
    return {
      accentColor: "#b45309",
      mutedColor: "#78716c",
      troughColor: "#efede8",
      softAccent: "rgba(180,83,9,0.2)",
      elevatedColor: "#ffffff",
    };
  }
  const cs = getComputedStyle(document.documentElement);
  return {
    accentColor: cs.getPropertyValue("--accent").trim() || "#b45309",
    mutedColor:
      cs.getPropertyValue("--text-muted").trim() ||
      cs.getPropertyValue("--border-strong").trim() ||
      "#78716c",
    troughColor:
      cs.getPropertyValue("--bg-surface-subtle").trim() ||
      cs.getPropertyValue("--bg-surface").trim() ||
      "rgba(120,113,108,0.12)",
    softAccent:
      cs.getPropertyValue("--accent-soft").trim() || "rgba(180,83,9,0.2)",
    elevatedColor: cs.getPropertyValue("--bg-elevated").trim() || "#ffffff",
  };
}

function isCanvasStyle(style: AudioScrubberStyle): boolean {
  return (
    style === "bars" ||
    style === "mirrored" ||
    style === "ribbon" ||
    style === "blocks"
  );
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
  ctx.fill();
}

interface AudioScrubberProps {
  scrubberStyle: AudioScrubberStyle;
  currentTime: number;
  duration: number;
  peaks?: number[];
  isPlaying: boolean;
  disabled: boolean;
  abLoopStart: number | null;
  abLoopEnd: number | null;
  analyserNode: AnalyserNode | null;
  useStaticWaveformOnly: boolean;
  trackId?: string;
  onSeek: (seconds: number) => void;
}

export const AudioScrubber: React.FC<AudioScrubberProps> = ({
  scrubberStyle,
  currentTime,
  duration,
  peaks,
  isPlaying,
  disabled,
  abLoopStart,
  abLoopEnd,
  analyserNode,
  useStaticWaveformOnly,
  trackId,
  onSeek,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef(false);
  const paletteRef = useRef<WaveformPalette>(readWaveformPalette());
  const freqBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  const ratio =
    duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;

  const normalizedPeaks =
    peaks && peaks.length > 0
      ? peaks.map((p) =>
          Number.isFinite(p) ? Math.max(0.16, Math.min(0.95, p)) : 0.38,
        )
      : FALLBACK_WAVEFORM_PEAKS;

  const drawStateRef = useRef({
    scrubberStyle,
    peaks: normalizedPeaks,
    currentTime,
    duration,
    ratio,
    isPlaying,
    abLoopStart,
    abLoopEnd,
    analyserNode,
    useStaticWaveformOnly,
    hoverRatio,
  });

  drawStateRef.current = {
    scrubberStyle,
    peaks: normalizedPeaks,
    currentTime,
    duration,
    ratio,
    isPlaying,
    abLoopStart,
    abLoopEnd,
    analyserNode,
    useStaticWaveformOnly,
    hoverRatio,
  };

  const drawCanvasFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cssWidth = Math.max(80, rect.width);
    const cssHeight = Math.max(24, rect.height);
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(pixelWidth / cssWidth, 0, 0, pixelHeight / cssHeight, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const pal = paletteRef.current;
    const st = drawStateRef.current;
    const liveSpectrum =
      !st.useStaticWaveformOnly && Boolean(st.analyserNode) && st.isPlaying;

    let freqData: Uint8Array<ArrayBuffer> | null = null;
    if (liveSpectrum && st.analyserNode) {
      if (
        !freqBufferRef.current ||
        freqBufferRef.current.length !== st.analyserNode.frequencyBinCount
      ) {
        freqBufferRef.current = new Uint8Array(
          st.analyserNode.frequencyBinCount,
        );
      }
      freqData = freqBufferRef.current;
      st.analyserNode.getByteFrequencyData(freqData);
    }

    // Track-based styles only use canvas as a subtle live-spectrum backdrop when active
    if (!isCanvasStyle(st.scrubberStyle)) {
      if (!freqData) return;
      const backdropBars = 48;
      const barW = cssWidth / backdropBars;
      const gap = Math.max(1, barW * 0.35);
      for (let i = 0; i < backdropBars; i++) {
        const binIdx = Math.min(
          freqData.length - 1,
          Math.floor((i / backdropBars) * freqData.length * 0.78),
        );
        const amp = Math.max(0.08, (freqData[binIdx] || 0) / 255);
        const h = Math.max(2, amp * (cssHeight - 8));
        ctx.fillStyle =
          (i + 0.5) / backdropBars <= st.ratio ? pal.accentColor : pal.mutedColor;
        ctx.globalAlpha = (i + 0.5) / backdropBars <= st.ratio ? 0.22 : 0.1;
        drawRoundedRect(
          ctx,
          i * barW + gap / 2,
          cssHeight - h - 2,
          Math.max(1.5, barW - gap),
          h,
          1.5,
        );
      }
      return;
    }

    const activePeaks = st.peaks;
    const count = activePeaks.length;

    // Sample amplitude helper blending static waveform peaks + live FFT bins
    const getAmp = (i: number, total: number): number => {
      const peakIdx = Math.min(
        count - 1,
        Math.floor((i / Math.max(1, total)) * count),
      );
      let amp = activePeaks[peakIdx] ?? 0.38;
      if (freqData) {
        const binIdx = Math.min(
          freqData.length - 1,
          Math.floor((i / Math.max(1, total)) * freqData.length * 0.78),
        );
        const liveVal = Math.max(0.14, (freqData[binIdx] || 0) / 255);
        amp = liveVal * 0.72 + amp * 0.28;
      }
      return Math.max(0.12, Math.min(0.98, amp));
    };

    if (st.scrubberStyle === "bars") {
      // Subtle recessed pill trough
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = pal.troughColor;
      drawRoundedRect(ctx, 0, 2, cssWidth, Math.max(4, cssHeight - 4), 5);

      const bars = count;
      const barW = cssWidth / bars;
      const gap = Math.max(1.2, barW * 0.32);

      for (let i = 0; i < bars; i++) {
        const amp = getAmp(i, bars);
        const barH = Math.max(4, amp * (cssHeight - 8));
        const x = i * barW + gap / 2;
        const w = Math.max(1.8, barW - gap);
        const barPos = (i + 0.5) / bars;
        const isPlayed = st.duration > 0 && st.ratio > 0 && barPos <= st.ratio;
        const isHoverPreview =
          !isPlayed &&
          st.hoverRatio !== null &&
          st.duration > 0 &&
          barPos <= st.hoverRatio;

        ctx.fillStyle = isPlayed
          ? pal.accentColor
          : isHoverPreview
            ? pal.accentColor
            : pal.mutedColor;
        ctx.globalAlpha = isPlayed ? 0.96 : isHoverPreview ? 0.42 : 0.36;
        drawRoundedRect(ctx, x, (cssHeight - barH) / 2, w, barH, w / 2);
      }

      if (st.duration > 0) {
        const px = Math.max(2, Math.min(cssWidth - 2, st.ratio * cssWidth));
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = pal.accentColor;
        drawRoundedRect(ctx, px - 3, 1, 6, cssHeight - 2, 3);
        ctx.globalAlpha = 1;
        ctx.fillStyle = pal.accentColor;
        drawRoundedRect(ctx, px - 1.25, 1, 2.5, cssHeight - 2, 1.25);
      }
      return;
    }

    if (st.scrubberStyle === "mirrored") {
      const midY = cssHeight / 2;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = pal.mutedColor;
      ctx.fillRect(0, midY - 0.5, cssWidth, 1);

      const bars = count;
      const barW = cssWidth / bars;
      const gap = Math.max(1, barW * 0.28);

      for (let i = 0; i < bars; i++) {
        const amp = getAmp(i, bars);
        const halfH = Math.max(2, amp * (midY - 3));
        const x = i * barW + gap / 2;
        const w = Math.max(1.5, barW - gap);
        const barPos = (i + 0.5) / bars;
        const isPlayed = st.duration > 0 && st.ratio > 0 && barPos <= st.ratio;
        const isHover =
          !isPlayed && st.hoverRatio !== null && barPos <= st.hoverRatio;

        ctx.fillStyle =
          isPlayed || isHover ? pal.accentColor : pal.mutedColor;
        ctx.globalAlpha = isPlayed ? 0.95 : isHover ? 0.4 : 0.34;
        // Upper reflection
        drawRoundedRect(ctx, x, midY - halfH - 0.5, w, halfH, 1.5);
        // Lower mirror (slightly softer)
        ctx.globalAlpha = isPlayed ? 0.62 : isHover ? 0.28 : 0.22;
        drawRoundedRect(ctx, x, midY + 0.5, w, halfH * 0.86, 1.5);
      }

      if (st.duration > 0) {
        const px = Math.max(2, Math.min(cssWidth - 2, st.ratio * cssWidth));
        ctx.globalAlpha = 1;
        ctx.fillStyle = pal.accentColor;
        ctx.fillRect(px - 1, 2, 2, cssHeight - 4);
        ctx.beginPath();
        ctx.arc(px, midY, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    if (st.scrubberStyle === "ribbon") {
      const ptsCount = Math.max(28, Math.min(64, count));
      const padY = 4;
      const usableH = cssHeight - padY * 2;
      const midY = cssHeight * 0.58;
      const pts: Array<{ x: number; y: number }> = [];

      for (let i = 0; i <= ptsCount; i++) {
        const t = i / ptsCount;
        const amp = getAmp(i, ptsCount);
        const waveOffset = Math.sin(i * 0.55) * 0.16;
        const y = Math.max(
          padY,
          Math.min(
            cssHeight - padY,
            midY - (amp - 0.25 + waveOffset) * usableH * 0.65,
          ),
        );
        pts.push({ x: t * cssWidth, y });
      }

      const traceCurve = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const xc = (pts[i].x + pts[i + 1].x) / 2;
          const yc = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last.x, last.y);
      };

      // Unplayed ribbon outline
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = pal.mutedColor;
      ctx.lineWidth = 1.75;
      ctx.lineCap = "round";
      traceCurve();
      ctx.stroke();

      // Played clipped ribbon fill + stroke
      if (st.duration > 0 && st.ratio > 0) {
        const playX = st.ratio * cssWidth;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, playX, cssHeight);
        ctx.clip();

        // Translucent gradient under curve
        const grad = ctx.createLinearGradient(0, 0, 0, cssHeight);
        grad.addColorStop(0, pal.softAccent);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        traceCurve();
        ctx.lineTo(cssWidth, cssHeight);
        ctx.lineTo(0, cssHeight);
        ctx.closePath();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = grad;
        ctx.fill();

        // Crisp accent stroke
        traceCurve();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = pal.accentColor;
        ctx.lineWidth = 2.25;
        ctx.stroke();
        ctx.restore();

        // Glowing node along the spline at current ratio
        const exactIdx = st.ratio * ptsCount;
        const idx0 = Math.min(pts.length - 1, Math.floor(exactIdx));
        const idx1 = Math.min(pts.length - 1, idx0 + 1);
        const frac = exactIdx - idx0;
        const nodeY = pts[idx0].y + (pts[idx1].y - pts[idx0].y) * frac;

        ctx.globalAlpha = 0.25;
        ctx.fillStyle = pal.accentColor;
        ctx.beginPath();
        ctx.arc(playX, nodeY, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.fillStyle = pal.accentColor;
        ctx.beginPath();
        ctx.arc(playX, nodeY, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    if (st.scrubberStyle === "blocks") {
      const cols = 34;
      const rows = 5;
      const colW = cssWidth / cols;
      const gapX = Math.max(1.5, colW * 0.22);
      const cellW = Math.max(2, colW - gapX);
      const gapY = 1.5;
      const padY = 3;
      const cellH = Math.max(2, (cssHeight - padY * 2 - gapY * (rows - 1)) / rows);

      for (let c = 0; c < cols; c++) {
        const amp = getAmp(c, cols);
        const activeRows = Math.max(1, Math.round(amp * rows));
        const colPos = (c + 0.5) / cols;
        const isPlayed = st.duration > 0 && st.ratio > 0 && colPos <= st.ratio;
        const isHover =
          !isPlayed && st.hoverRatio !== null && colPos <= st.hoverRatio;
        const x = c * colW + gapX / 2;

        for (let r = 0; r < rows; r++) {
          const lit = r < activeRows;
          if (!lit) continue;
          const y = cssHeight - padY - (r + 1) * cellH - r * gapY;
          ctx.fillStyle =
            isPlayed || isHover ? pal.accentColor : pal.mutedColor;
          ctx.globalAlpha = isPlayed ? 0.94 : isHover ? 0.42 : 0.32;
          drawRoundedRect(ctx, x, y, cellW, cellH, 1);
        }
      }
      return;
    }
  }, []);

  useEffect(() => {
    paletteRef.current = readWaveformPalette();
    drawCanvasFrame();

    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      paletteRef.current = readWaveformPalette();
      drawCanvasFrame();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class", "style"],
    });
    return () => observer.disconnect();
  }, [drawCanvasFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawCanvasFrame();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => drawCanvasFrame());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [drawCanvasFrame]);

  useEffect(() => {
    drawCanvasFrame();
  }, [
    drawCanvasFrame,
    scrubberStyle,
    trackId,
    peaks,
    abLoopStart,
    abLoopEnd,
    currentTime,
    duration,
    isPlaying,
    useStaticWaveformOnly,
    hoverRatio,
  ]);

  // 60fps RAF loop when live spectrum is enabled & audio is playing
  useEffect(() => {
    if (useStaticWaveformOnly || !isPlaying || !analyserNode) return;
    let rafId = 0;
    const tick = () => {
      drawCanvasFrame();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [drawCanvasFrame, useStaticWaveformOnly, isPlaying, analyserNode]);

  const computeRatioFromClientX = useCallback((clientX: number): number => {
    const el = containerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)),
    );
  }, []);

  const seekToRatio = useCallback(
    (nextRatio: number) => {
      if (disabled || duration <= 0) return;
      onSeek(nextRatio * duration);
    },
    [disabled, duration, onSeek],
  );

  // Compute A-B loop percentages
  const hasStart = duration > 0 && abLoopStart != null;
  const hasEnd =
    duration > 0 &&
    abLoopStart != null &&
    abLoopEnd != null &&
    abLoopEnd > abLoopStart;
  const startPct = hasStart
    ? Math.max(0, Math.min(100, ((abLoopStart ?? 0) / duration) * 100))
    : 0;
  const endPct = hasEnd
    ? Math.max(startPct, Math.min(100, ((abLoopEnd ?? 0) / duration) * 100))
    : startPct;

  const activeHoverRatio =
    isDragging && hoverRatio !== null
      ? hoverRatio
      : isHovering && hoverRatio !== null
        ? hoverRatio
        : null;
  const hoverSeconds =
    activeHoverRatio !== null && duration > 0
      ? activeHoverRatio * duration
      : null;

  let loopTagHint: string | null = null;
  if (activeHoverRatio !== null && duration > 0) {
    if (hasStart && Math.abs(activeHoverRatio * 100 - startPct) < 2) {
      loopTagHint = "A";
    } else if (hasEnd && Math.abs(activeHoverRatio * 100 - endPct) < 2) {
      loopTagHint = "B";
    }
  }

  const showCanvas =
    isCanvasStyle(scrubberStyle) ||
    (!useStaticWaveformOnly && Boolean(analyserNode) && isPlaying);

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Audio progress scrubber"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, Math.round(duration))}
      aria-valuenow={Math.round(currentTime)}
      aria-valuetext={`${formatAudioDuration(currentTime)} of ${formatAudioDuration(duration)}`}
      onKeyDown={(e) => {
        if (disabled || duration <= 0) return;
        const step = e.shiftKey ? 15 : 5;
        if (e.key === "ArrowRight") {
          e.preventDefault();
          onSeek(Math.min(duration, currentTime + step));
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          onSeek(Math.max(0, currentTime - step));
        } else if (e.key === "Home") {
          e.preventDefault();
          onSeek(0);
        } else if (e.key === "End") {
          e.preventDefault();
          onSeek(duration);
        }
      }}
      onPointerEnter={() => setIsHovering(true)}
      onPointerLeave={() => {
        setIsHovering(false);
        if (!draggingRef.current) setHoverRatio(null);
      }}
      onPointerDown={(e) => {
        if (disabled || duration <= 0) return;
        draggingRef.current = true;
        setIsDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = computeRatioFromClientX(e.clientX);
        setHoverRatio(r);
        seekToRatio(r);
      }}
      onPointerMove={(e) => {
        const r = computeRatioFromClientX(e.clientX);
        setHoverRatio(r);
        if (draggingRef.current) {
          seekToRatio(r);
        }
      }}
      onPointerUp={() => {
        draggingRef.current = false;
        setIsDragging(false);
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
        setIsDragging(false);
        setHoverRatio(null);
      }}
      className={`relative flex-1 min-w-0 h-8 sm:h-7 flex items-center select-none touch-none rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
        disabled || duration <= 0 ? "opacity-60 cursor-default" : "cursor-pointer"
      }`}
    >
      {/* Floating Hover / Scrub Timestamp Tooltip */}
      {hoverSeconds !== null && duration > 0 && (
        <div
          style={{
            left: `${Math.max(6, Math.min(94, (activeHoverRatio ?? 0) * 100))}%`,
          }}
          className="pointer-events-none absolute -top-7 -translate-x-1/2 px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-sm font-mono tabular-nums text-[10px] font-medium text-[var(--text-primary)] whitespace-nowrap z-30 flex items-center gap-1"
        >
          <span>{formatAudioDuration(hoverSeconds)}</span>
          {loopTagHint && (
            <span className="text-[var(--accent)] font-semibold">
              {loopTagHint}
            </span>
          )}
        </div>
      )}

      {/* A-B Loop Highlight Span (shared across all 7 styles) */}
      {hasEnd && (
        <div
          style={{
            left: `${startPct}%`,
            width: `${Math.max(0.5, endPct - startPct)}%`,
          }}
          className="pointer-events-none absolute inset-y-1 rounded-xs bg-[var(--accent-soft)] z-0"
        />
      )}

      {/* High-DPI Canvas Layer (waveform styles + subtle live spectrum backdrop for track styles) */}
      {showCanvas && (
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 w-full h-full rounded-md z-10"
        />
      )}

      {/* Style 1: Classic Rail with Tactile Thumb */}
      {scrubberStyle === "rail" && (
        <div className="relative w-full h-1.5 rounded-full bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)]/70 z-20">
          <div
            style={{ width: `${ratio * 100}%` }}
            className="h-full rounded-full bg-[var(--accent)]"
          />
          {duration > 0 && (
            <div
              style={{ left: `${ratio * 100}%` }}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[var(--accent)] border-2 border-[var(--bg-elevated)] shadow-sm transition-transform duration-150 ${
                isDragging || isHovering ? "scale-120" : "scale-100"
              }`}
            />
          )}
        </div>
      )}

      {/* Style 2: YouTube Line with Dot */}
      {scrubberStyle === "youtube" && (
        <div className="relative w-full flex items-center z-20">
          <div
            className={`relative w-full rounded-full bg-[var(--border-strong)]/45 transition-[height] duration-150 overflow-hidden ${
              isHovering || isDragging ? "h-[5px]" : "h-[3px]"
            }`}
          >
            {/* Hover ghost preview */}
            {activeHoverRatio !== null &&
              activeHoverRatio > ratio &&
              duration > 0 && (
                <div
                  style={{ width: `${activeHoverRatio * 100}%` }}
                  className="absolute inset-y-0 left-0 bg-[var(--text-muted)]/35 rounded-full"
                />
              )}
            {/* Played progress */}
            <div
              style={{ width: `${ratio * 100}%` }}
              className="relative h-full bg-[var(--accent)] rounded-full"
            />
          </div>
          {duration > 0 && (
            <div
              style={{ left: `${ratio * 100}%` }}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)] shadow-sm transition-transform duration-150 ${
                isDragging
                  ? "w-3.5 h-3.5 scale-110"
                  : isHovering
                    ? "w-3 h-3 scale-100"
                    : "w-2.5 h-2.5 scale-90 sm:scale-0"
              }`}
            />
          )}
        </div>
      )}

      {/* Style 7: Hi-Fi Groove Needle with Quarter Graduations */}
      {scrubberStyle === "groove" && (
        <div className="relative w-full h-3 flex items-center z-20">
          {/* Twin groove channel */}
          <div className="relative w-full h-[2px] bg-[var(--border-strong)]/60">
            {/* Quarter-mark ruler ticks */}
            {[25, 50, 75].map((pct) => (
              <span
                key={pct}
                style={{ left: `${pct}%` }}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-2.5 bg-[var(--text-muted)]/45"
              />
            ))}
            {/* Active accent filament */}
            <div
              style={{ width: `${ratio * 100}%` }}
              className="relative h-[3px] -top-[0.5px] bg-[var(--accent)] rounded-full"
            />
          </div>
          {duration > 0 && (
            <div
              style={{ left: `${ratio * 100}%` }}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-45 bg-[var(--accent)] border border-[var(--bg-elevated)] shadow-xs transition-transform duration-150 ${
                isDragging || isHovering ? "scale-125" : "scale-100"
              }`}
            />
          )}
        </div>
      )}

      {/* A & B Loop Point Markers (shared across all 7 styles) */}
      {hasStart && (
        <div
          style={{ left: `${startPct}%` }}
          title={`Loop A: ${formatAudioDuration(abLoopStart ?? 0)}`}
          className="pointer-events-none absolute inset-y-0.5 -translate-x-1/2 flex flex-col items-center z-30"
        >
          <span className="px-1 rounded-xs bg-[var(--accent)] text-[var(--accent-contrast)] font-mono text-[8px] font-bold leading-tight">
            A
          </span>
          <span className="w-px flex-1 bg-[var(--accent)]/80" />
        </div>
      )}

      {hasEnd && (
        <div
          style={{ left: `${endPct}%` }}
          title={`Loop B: ${formatAudioDuration(abLoopEnd ?? 0)}`}
          className="pointer-events-none absolute inset-y-0.5 -translate-x-1/2 flex flex-col items-center z-30"
        >
          <span className="px-1 rounded-xs bg-[var(--accent)] text-[var(--accent-contrast)] font-mono text-[8px] font-bold leading-tight">
            B
          </span>
          <span className="w-px flex-1 bg-[var(--accent)]/80" />
        </div>
      )}
    </div>
  );
};
