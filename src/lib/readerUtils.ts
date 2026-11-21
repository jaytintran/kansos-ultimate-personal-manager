import type {
  ParsedChapter,
  ReaderContrastPreset,
  ReaderFontFamily,
  ReaderPreferences,
  SearchMatch,
  ThemeMode,
} from '../types/library';

export const WORDS_PER_MINUTE = 240;
export const WORDS_PER_VIRTUAL_PAGE = 280;
export const PDF_MINUTES_PER_PAGE = 1.6;

export interface ReaderFontOption {
  id: Exclude<ReaderFontFamily, 'serif' | 'sans'>;
  label: string;
  group: 'serif' | 'sans' | 'mono';
  className: string;
  cssFamily: string;
}

export const READER_FONT_OPTIONS: ReaderFontOption[] = [
  {
    id: 'source-serif',
    label: 'Source Serif',
    group: 'serif',
    className: 'font-serif-editorial',
    cssFamily: "'Source Serif 4', Georgia, Cambria, 'Times New Roman', serif",
  },
  {
    id: 'literata',
    label: 'Literata',
    group: 'serif',
    className: 'font-serif-literata',
    cssFamily: "'Literata', Georgia, Cambria, 'Times New Roman', serif",
  },
  {
    id: 'georgia',
    label: 'Georgia',
    group: 'serif',
    className: 'font-serif-georgia',
    cssFamily: "Georgia, 'Times New Roman', Times, serif",
  },
  {
    id: 'palatino',
    label: 'Palatino',
    group: 'serif',
    className: 'font-serif-palatino',
    cssFamily: "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    group: 'sans',
    className: 'font-sans-ui',
    cssFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  {
    id: 'inter',
    label: 'Inter',
    group: 'sans',
    className: 'font-sans-inter',
    cssFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  {
    id: 'system-sans',
    label: 'System UI',
    group: 'sans',
    className: 'font-sans-system',
    cssFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: 'mono',
    label: 'Mono',
    group: 'mono',
    className: 'font-mono-tabular',
    cssFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  },
];

export function resolveReaderFont(fontFamily: ReaderFontFamily): ReaderFontOption {
  const normalized =
    fontFamily === 'serif' ? 'source-serif' : fontFamily === 'sans' ? 'dm-sans' : fontFamily;
  return READER_FONT_OPTIONS.find((f) => f.id === normalized) ?? READER_FONT_OPTIONS[0];
}

export interface TypographyPreset {
  id: 'paperback' | 'editorial' | 'compact' | 'large';
  label: string;
  description: string;
  patch: Partial<ReaderPreferences>;
}

export const TYPOGRAPHY_PRESETS: TypographyPreset[] = [
  {
    id: 'paperback',
    label: 'Paperback',
    description: 'Classic indented prose',
    patch: {
      fontFamily: 'literata',
      fontSize: 18,
      fontWeight: 400,
      lineHeight: 1.65,
      paragraphSpacing: 0.3,
      textIndent: 1.4,
      textAlign: 'justify',
      wordSpacing: 0,
      letterSpacing: 0,
      pageMargins: 48,
      pageWidth: 680,
    },
  },
  {
    id: 'editorial',
    label: 'Editorial',
    description: 'Airy Kanso default',
    patch: {
      fontFamily: 'source-serif',
      fontSize: 18,
      fontWeight: 400,
      lineHeight: 1.72,
      paragraphSpacing: 0.9,
      textIndent: 0,
      textAlign: 'left',
      wordSpacing: 0,
      letterSpacing: 0,
      pageMargins: 48,
      pageWidth: 720,
    },
  },
  {
    id: 'compact',
    label: 'Compact',
    description: 'Crisp sans, high density',
    patch: {
      fontFamily: 'dm-sans',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.55,
      paragraphSpacing: 0.6,
      textIndent: 0,
      textAlign: 'left',
      wordSpacing: 0,
      letterSpacing: 0,
      pageMargins: 36,
      pageWidth: 780,
    },
  },
  {
    id: 'large',
    label: 'Large Focus',
    description: 'Relaxed large print',
    patch: {
      fontFamily: 'literata',
      fontSize: 22,
      fontWeight: 400,
      lineHeight: 1.85,
      paragraphSpacing: 1.0,
      textIndent: 0,
      textAlign: 'left',
      wordSpacing: 0.02,
      letterSpacing: 0,
      pageMargins: 40,
      pageWidth: 740,
    },
  },
];

export function findActiveTypographyPreset(prefs: ReaderPreferences): TypographyPreset['id'] | null {
  const fontId = resolveReaderFont(prefs.fontFamily).id;
  for (const preset of TYPOGRAPHY_PRESETS) {
    const p = preset.patch;
    if (
      fontId === p.fontFamily &&
      prefs.fontSize === p.fontSize &&
      (prefs.fontWeight ?? 400) === p.fontWeight &&
      Math.abs(prefs.lineHeight - (p.lineHeight ?? 1.72)) < 0.03 &&
      Math.abs(prefs.paragraphSpacing - (p.paragraphSpacing ?? 0.9)) < 0.06 &&
      Math.abs(prefs.textIndent - (p.textIndent ?? 0)) < 0.06 &&
      prefs.textAlign === p.textAlign
    ) {
      return preset.id;
    }
  }
  return null;
}

export function resolveReaderTextInk(
  contrastPreset: ReaderContrastPreset | undefined,
  theme: ThemeMode
): string {
  if (contrastPreset === 'soft') {
    return 'color-mix(in srgb, var(--text-primary) 78%, var(--bg-surface))';
  }
  if (contrastPreset === 'crisp') {
    if (theme === 'dark') return '#fbf8f2';
    if (theme === 'sepia') return '#17110b';
    return 'color-mix(in srgb, var(--text-primary) 94%, #000000)';
  }
  return 'var(--text-primary)';
}

export function resolvePdfCanvasFilter(prefs: ReaderPreferences): string | undefined {
  const contrastMult =
    prefs.contrastPreset === 'soft' ? 0.88 : prefs.contrastPreset === 'crisp' ? 1.12 : 1;
  const brightMult = Math.max(0.7, Math.min(1.2, (prefs.brightness ?? 100) / 100));

  if (prefs.pdfThemeTone) {
    if (prefs.theme === 'dark') {
      return `invert(0.9) hue-rotate(180deg) contrast(${(0.94 * contrastMult).toFixed(2)}) brightness(${(0.94 * brightMult).toFixed(2)})`;
    }
    return `sepia(0.24) contrast(${(0.96 * contrastMult).toFixed(2)}) brightness(${(0.97 * brightMult).toFixed(2)})`;
  }

  if (Math.abs(contrastMult - 1) < 0.005 && Math.abs(brightMult - 1) < 0.005) {
    return undefined;
  }
  return `contrast(${contrastMult.toFixed(2)}) brightness(${brightMult.toFixed(2)})`;
}

export interface ChapterReadingMetric {
  index: number;
  title: string;
  plainText: string;
  wordCount: number;
  startWordOffset: number;
  startPct: number;
  startVirtualPage: number;
  virtualPageCount: number;
}

export interface BookReadingMetrics {
  chapters: ChapterReadingMetric[];
  totalWords: number;
  totalVirtualPages: number;
}

function stripHtmlToPlainText(html: string): string {
  if (!html) return '';
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function computeReflowableMetrics(chapters: ParsedChapter[]): BookReadingMetrics {
  const raw = chapters.map((ch) => {
    const plainText = stripHtmlToPlainText(ch.html);
    const words = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
    const wordCount = Math.max(1, words);
    return {
      index: ch.index,
      title: ch.title,
      plainText,
      wordCount,
    };
  });

  const totalWords = Math.max(
    1,
    raw.reduce((sum, ch) => sum + ch.wordCount, 0)
  );

  let wordOffset = 0;
  let pageCursor = 1;
  const metrics: ChapterReadingMetric[] = raw.map((ch) => {
    const virtualPageCount = Math.max(1, Math.round(ch.wordCount / WORDS_PER_VIRTUAL_PAGE));
    const entry: ChapterReadingMetric = {
      index: ch.index,
      title: ch.title,
      plainText: ch.plainText,
      wordCount: ch.wordCount,
      startWordOffset: wordOffset,
      startPct: (wordOffset / totalWords) * 100,
      startVirtualPage: pageCursor,
      virtualPageCount,
    };
    wordOffset += ch.wordCount;
    pageCursor += virtualPageCount;
    return entry;
  });

  return {
    chapters: metrics,
    totalWords,
    totalVirtualPages: Math.max(1, pageCursor - 1),
  };
}

export function getVirtualPageAtLocation(
  metrics: BookReadingMetrics,
  chapterIndex: number,
  scrollRatio: number
): number {
  const ch = metrics.chapters[chapterIndex] ?? metrics.chapters[0];
  if (!ch) return 1;
  const clamped = Math.min(1, Math.max(0, scrollRatio));
  const offset = Math.min(
    ch.virtualPageCount - 1,
    Math.floor(clamped * ch.virtualPageCount)
  );
  return Math.min(metrics.totalVirtualPages, ch.startVirtualPage + Math.max(0, offset));
}

export function formatReadingTime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0.5) return '<1 min';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hrs = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return mins === 0 ? `${hrs}h` : `${hrs}h ${mins}m`;
}

export function searchTextUnits(
  units: Array<{unitIndex: number; unitLabel: string; text: string}>,
  query: string,
  maxMatches = 250
): SearchMatch[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const lowerQuery = trimmed.toLowerCase();
  const matches: SearchMatch[] = [];

  for (const unit of units) {
    const lowerText = unit.text.toLowerCase();
    let pos = 0;
    let occurrenceInUnit = 0;
    while (pos < lowerText.length && matches.length < maxMatches) {
      const idx = lowerText.indexOf(lowerQuery, pos);
      if (idx === -1) break;
      const beforeStart = Math.max(0, idx - 46);
      const afterEnd = Math.min(unit.text.length, idx + trimmed.length + 54);
      matches.push({
        id: `m-${unit.unitIndex}-${occurrenceInUnit}-${idx}`,
        unitIndex: unit.unitIndex,
        unitLabel: unit.unitLabel,
        occurrenceInUnit,
        snippetBefore: (beforeStart > 0 ? '…' : '') + unit.text.slice(beforeStart, idx),
        matchText: unit.text.slice(idx, idx + trimmed.length),
        snippetAfter: unit.text.slice(idx + trimmed.length, afterEnd) + (afterEnd < unit.text.length ? '…' : ''),
      });
      occurrenceInUnit += 1;
      pos = idx + lowerQuery.length;
    }
    if (matches.length >= maxMatches) break;
  }

  return matches;
}
