import type {ParsedChapter, SearchMatch} from '../types/library';

export const WORDS_PER_MINUTE = 240;
export const WORDS_PER_VIRTUAL_PAGE = 280;
export const PDF_MINUTES_PER_PAGE = 1.6;

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
