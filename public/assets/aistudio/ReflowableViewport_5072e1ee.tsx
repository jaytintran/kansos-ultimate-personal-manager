import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  StickyNote,
  X,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {HIGHLIGHT_COLORS} from '../../lib/formatters';
import {
  applyTtsDomHighlight,
  clearTtsDomHighlights,
  extractReflowableNarrationMap,
  findFirstVisibleReflowableSentence,
  findSentenceAtDomPoint,
  type NarrationSentence,
} from '../../lib/narrationText';
import type {BookReadingMetrics} from '../../lib/readerUtils';
import type {
  HighlightColor,
  HighlightRecord,
  ParsedChapter,
  ReaderPreferences,
} from '../../types/library';
import {FootnotePopover, type FootnotePreviewState} from './FootnotePopover';
import {ImageLightbox, type LightboxImageState} from './ImageLightbox';

interface SelectionMenuState {
  unitIndex: number;
  text: string;
  prefix: string;
  suffix: string;
  x: number;
  y: number;
}

interface JumpHistoryEntry {
  unitIndex: number;
  scrollRatio: number;
  label: string;
}

export interface ReflowableNavHandle {
  stepPrev: () => void;
  stepNext: () => void;
  getFirstVisibleSentenceIndex: () => number;
}

interface ReflowableViewportProps {
  navRef?: React.Ref<ReflowableNavHandle>;
  chapters: ParsedChapter[];
  chapterIndex: number;
  initialScrollRatio: number;
  jumpNonce: number;
  targetAnchorId?: string | null;
  metrics: BookReadingMetrics | null;
  currentVirtualPage: number;
  progressPct: number;
  prefs: ReaderPreferences;
  allHighlights: HighlightRecord[];
  searchHighlight: {
    unitIndex: number;
    query: string;
    occurrenceInUnit: number;
    nonce: number;
  } | null;
  headerPinned: boolean;
  bottomBarPinned: boolean;
  topOverlayActive: boolean;
  bottomOverlayActive: boolean;
  voiceActive?: boolean;
  voicePlaying?: boolean;
  voiceTapToRead?: boolean;
  voiceSkipNoise?: boolean;
  activeSentenceIndex?: number;
  activeWordIndex?: number;
  voiceFollowEnabled?: boolean;
  recenterNonce?: number;
  onSentencesReady?: (sentences: NarrationSentence[]) => void;
  onSentenceTap?: (sentenceIndex: number, targetChapterIndex?: number) => void;
  onUserDetachedScroll?: () => void;
  onChapterChange: (
    nextIndex: number,
    initialRatio?: number,
    isUserScroll?: boolean,
    anchorId?: string
  ) => void;
  onScrollProgress: (scrollRatio: number) => void;
  onCreateHighlight: (payload: {
    unitIndex?: number;
    selectedText: string;
    prefixContext: string;
    suffixContext: string;
    color: HighlightColor;
    note: string;
  }) => void;
  onFocusHighlight: (highlightId: string) => void;
  onScrollDirection?: (dir: 'up' | 'down') => void;
  onCenterTap?: () => void;
}

function escapeSelectorAttr(val: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(val);
  }
  return val.replace(/["\\]/g, '\\$&');
}

function findAnchorElement(
  container: HTMLElement,
  chapterIdx: number,
  anchorId: string
): HTMLElement | null {
  const escapedId = escapeSelectorAttr(`folio-ch-${chapterIdx}-${anchorId}`);
  const byScopedId = container.querySelector<HTMLElement>(`#${escapedId}`);
  if (byScopedId) return byScopedId;
  const escapedAnchor = escapeSelectorAttr(anchorId);
  return (
    container.querySelector<HTMLElement>(`[data-folio-target-id="${escapedAnchor}"]`) ||
    container.querySelector<HTMLElement>(`[id="${escapedAnchor}"]`)
  );
}

function triggerAnchorFlash(el: HTMLElement) {
  el.classList.remove('folio-anchor-flash');
  void el.offsetWidth;
  el.classList.add('folio-anchor-flash');
  window.setTimeout(() => {
    el.classList.remove('folio-anchor-flash');
  }, 1700);
}

function extractFootnoteHtml(
  chapters: ParsedChapter[],
  targetChapterIndex: number,
  anchorId: string
): string | null {
  const targetChapter = chapters[targetChapterIndex];
  if (!targetChapter) return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(targetChapter.html, 'text/html');
  const anchorEl = findAnchorElement(doc.body, targetChapterIndex, anchorId);
  if (!anchorEl) return null;

  // If the anchor itself is just an inline <a/> or tiny span inside a note container, climb up to the note block
  const blockContainer =
    anchorEl.matches('aside, li, dd, p, blockquote') && (anchorEl.textContent?.trim().length ?? 0) > 4
      ? anchorEl
      : anchorEl.closest('aside, li, dd, p, div') || anchorEl;

  // Avoid accidentally pulling in the entire chapter body wrapper if anchor was inside a huge <div>
  const chosen =
    blockContainer.tagName === 'DIV' &&
    (blockContainer.textContent?.length ?? 0) > 1800 &&
    anchorEl !== blockContainer
      ? anchorEl.parentElement || anchorEl
      : blockContainer;

  const clone = chosen.cloneNode(true) as HTMLElement;
  // Strip noisy back-return arrow links inside footnote preview
  clone.querySelectorAll('a').forEach((a) => {
    const txt = (a.textContent || '').trim();
    if (/^[↩↵↑^]+$/.test(txt) || a.getAttribute('role') === 'doc-backlink') {
      a.remove();
    }
  });

  const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return clone.innerHTML || `<p>${text}</p>`;
}

function applyHighlightsToDom(container: HTMLElement, highlights: HighlightRecord[]) {
  if (highlights.length === 0) return;

  for (const hl of highlights) {
    const target = hl.selectedText.trim();
    if (!target || target.length < 2) continue;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node = walker.nextNode();
    while (node) {
      if (
        node.nodeValue &&
        node.parentElement &&
        !node.parentElement.closest('mark.folio-hl')
      ) {
        textNodes.push(node as Text);
      }
      node = walker.nextNode();
    }

    let fullText = '';
    const offsets: Array<{node: Text; start: number; end: number}> = [];
    for (const tn of textNodes) {
      const start = fullText.length;
      const val = tn.nodeValue || '';
      fullText += val;
      offsets.push({node: tn, start, end: start + val.length});
    }

    let matchIndex = -1;
    if (hl.prefixContext) {
      const searchWithPrefix = hl.prefixContext + hl.selectedText;
      const idx = fullText.indexOf(searchWithPrefix);
      if (idx !== -1) {
        matchIndex = idx + hl.prefixContext.length;
      }
    }
    if (matchIndex === -1) {
      matchIndex = fullText.indexOf(hl.selectedText);
    }
    if (matchIndex === -1) continue;

    const matchEnd = matchIndex + hl.selectedText.length;
    const involved = offsets.filter((o) => o.end > matchIndex && o.start < matchEnd);

    for (const seg of involved) {
      const localStart = Math.max(0, matchIndex - seg.start);
      const localEnd = Math.min(seg.node.nodeValue?.length ?? 0, matchEnd - seg.start);
      if (localEnd <= localStart) continue;

      const textNode = seg.node;
      const value = textNode.nodeValue || '';
      const before = value.slice(0, localStart);
      const middle = value.slice(localStart, localEnd);
      const after = value.slice(localEnd);

      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));

      const mark = document.createElement('mark');
      mark.className = `folio-hl folio-hl-${hl.color}`;
      mark.dataset.highlightId = hl.id;
      if (hl.note) mark.title = hl.note;
      mark.textContent = middle;
      frag.appendChild(mark);

      if (after) frag.appendChild(document.createTextNode(after));
      textNode.parentNode?.replaceChild(frag, textNode);
    }
  }
}

function applySearchMatchHighlight(
  container: HTMLElement,
  query: string,
  occurrenceInUnit: number
): HTMLElement | null {
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    if (node.nodeValue) textNodes.push(node as Text);
    node = walker.nextNode();
  }

  let fullText = '';
  const offsets: Array<{node: Text; start: number; end: number}> = [];
  for (const tn of textNodes) {
    const start = fullText.length;
    const val = tn.nodeValue || '';
    fullText += val;
    offsets.push({node: tn, start, end: start + val.length});
  }

  const lowerFull = fullText.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  let searchPos = 0;
  let foundIdx = -1;

  for (let count = 0; count <= occurrenceInUnit; count++) {
    const idx = lowerFull.indexOf(lowerQuery, searchPos);
    if (idx === -1) break;
    foundIdx = idx;
    searchPos = idx + lowerQuery.length;
  }

  if (foundIdx === -1) return null;

  const matchEnd = foundIdx + trimmed.length;
  const involved = offsets.filter((o) => o.end > foundIdx && o.start < matchEnd);
  let firstMark: HTMLElement | null = null;

  for (const seg of involved) {
    const localStart = Math.max(0, foundIdx - seg.start);
    const localEnd = Math.min(seg.node.nodeValue?.length ?? 0, matchEnd - seg.start);
    if (localEnd <= localStart) continue;

    const textNode = seg.node;
    const value = textNode.nodeValue || '';
    const before = value.slice(0, localStart);
    const middle = value.slice(localStart, localEnd);
    const after = value.slice(localEnd);

    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));

    const mark = document.createElement('mark');
    mark.className = 'folio-search-match';
    mark.textContent = middle;
    if (!firstMark) firstMark = mark;
    frag.appendChild(mark);

    if (after) frag.appendChild(document.createTextNode(after));
    textNode.parentNode?.replaceChild(frag, textNode);
  }

  return firstMark;
}

interface ContinuousChapterCardProps {
  chapter: ParsedChapter;
  totalChapters: number;
  startVirtualPage: number;
  virtualPageCount: number;
  isHydrated: boolean;
  isActiveChapter: boolean;
  estimatedHeight: number;
  highlights: HighlightRecord[];
  searchMatch: {query: string; occurrenceInUnit: number; nonce: number} | null;
  pendingAnchorId: string | null;
  fontClass: string;
  proseCustomStyles: React.CSSProperties;
  voiceTapActive: boolean;
  onSlotRef: (chapterIndex: number, el: HTMLDivElement | null) => void;
  onProseRef: (chapterIndex: number, el: HTMLDivElement | null) => void;
  onHeightMeasured: (chapterIndex: number, height: number) => void;
  onPendingAnchorConsumed: (chapterIndex: number) => void;
  onMouseUpProse: (chapterIndex: number) => void;
}

const ContinuousChapterCard: React.FC<ContinuousChapterCardProps> = React.memo(
  ({
    chapter,
    totalChapters,
    startVirtualPage,
    virtualPageCount,
    isHydrated,
    isActiveChapter,
    estimatedHeight,
    highlights,
    searchMatch,
    pendingAnchorId,
    fontClass,
    proseCustomStyles,
    voiceTapActive,
    onSlotRef,
    onProseRef,
    onHeightMeasured,
    onPendingAnchorConsumed,
    onMouseUpProse,
  }) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const proseElRef = useRef<HTMLDivElement>(null);

    const setCardRef = useCallback(
      (el: HTMLDivElement | null) => {
        (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        onSlotRef(chapter.index, el);
      },
      [chapter.index, onSlotRef]
    );

    const setProseElement = useCallback(
      (el: HTMLDivElement | null) => {
        (proseElRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        onProseRef(chapter.index, el);
      },
      [chapter.index, onProseRef]
    );

    // Hydrate chapter HTML, highlights, and search matches when near viewport
    useLayoutEffect(() => {
      if (!isHydrated) return;
      const el = proseElRef.current;
      if (!el) return;

      el.innerHTML = chapter.html;
      applyHighlightsToDom(el, highlights);

      let searchEl: HTMLElement | null = null;
      if (searchMatch && searchMatch.query.trim().length >= 2) {
        searchEl = applySearchMatchHighlight(
          el,
          searchMatch.query,
          searchMatch.occurrenceInUnit
        );
      }

      if (pendingAnchorId) {
        const anchorTarget = findAnchorElement(el, chapter.index, pendingAnchorId);
        if (anchorTarget) {
          window.requestAnimationFrame(() => {
            anchorTarget.scrollIntoView({behavior: 'smooth', block: 'center'});
            triggerAnchorFlash(anchorTarget);
            onPendingAnchorConsumed(chapter.index);
          });
        }
      } else if (searchEl) {
        window.requestAnimationFrame(() => {
          searchEl?.scrollIntoView({behavior: 'smooth', block: 'center'});
        });
      }
    }, [
      isHydrated,
      chapter.html,
      chapter.index,
      highlights,
      searchMatch,
      pendingAnchorId,
      onPendingAnchorConsumed,
    ]);

    // Observe rendered height so scrolling past unmounted/mounted cards never drifts
    useEffect(() => {
      if (!isHydrated) return;
      const card = cardRef.current;
      if (!card) return;

      const report = () => {
        const h = card.offsetHeight;
        if (h > 100) onHeightMeasured(chapter.index, h);
      };

      report();
      const ro = new ResizeObserver(report);
      ro.observe(card);
      return () => ro.disconnect();
    }, [isHydrated, chapter.index, onHeightMeasured]);

    const endVirtualPage = startVirtualPage + virtualPageCount - 1;
    const pageSpanLabel =
      virtualPageCount > 1
        ? `pp. ${startVirtualPage}–${endVirtualPage}`
        : `p. ${startVirtualPage}`;

    // Subtle right-edge virtual page markers for multi-page chapters (overlay, zero prose DOM mutation)
    const virtualPageTicks = useMemo(() => {
      if (!isHydrated || virtualPageCount <= 1) return [];
      const maxTicks = 24;
      const step = Math.max(1, Math.ceil(virtualPageCount / maxTicks));
      const ticks: Array<{pageNum: number; topPct: number}> = [];
      for (let p = 1; p < virtualPageCount; p += step) {
        ticks.push({
          pageNum: startVirtualPage + p,
          topPct: (p / virtualPageCount) * 100,
        });
      }
      return ticks;
    }, [isHydrated, virtualPageCount, startVirtualPage]);

    return (
      <article
        ref={setCardRef}
        data-chapter-index={chapter.index}
        aria-label={chapter.title}
        style={!isHydrated ? {minHeight: `${estimatedHeight}px`} : undefined}
        className={`folio-page-card rounded-lg relative transition-colors ${
          isActiveChapter ? 'ring-1 ring-[var(--border-strong)]/60' : ''
        }`}
      >
        {/* Archival Section Opener Strip */}
        <header className="px-6 sm:px-12 pt-6 pb-3.5 border-b border-[var(--border-subtle)]/80 flex items-baseline justify-between gap-4">
          <div className="min-w-0 flex items-baseline gap-2.5">
            <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] shrink-0">
              {String(chapter.index + 1).padStart(2, '0')}
            </span>
            <h2 className="font-serif-editorial text-xs sm:text-sm font-medium text-[var(--text-secondary)] truncate">
              {chapter.title}
            </h2>
          </div>
          <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] shrink-0">
            {pageSpanLabel}
          </span>
        </header>

        {isHydrated ? (
          <div className="relative px-6 sm:px-12 py-7 sm:py-10">
            {/* Subtle Virtual Page Break Margin Ticks */}
            {virtualPageTicks.length > 0 && (
              <div
                aria-hidden="true"
                className="hidden sm:block pointer-events-none absolute inset-y-8 right-2 w-9 select-none"
              >
                {virtualPageTicks.map((t) => (
                  <div
                    key={t.pageNum}
                    style={{top: `${t.topPct}%`}}
                    className="absolute right-0 -translate-y-1/2 flex items-center gap-1 opacity-55"
                  >
                    <span className="w-2 h-px bg-[var(--border-strong)]" />
                    <span className="font-mono-tabular text-[9px] text-[var(--text-muted)]">
                      {t.pageNum}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div
              ref={setProseElement}
              onMouseUp={() => onMouseUpProse(chapter.index)}
              onTouchEnd={() => onMouseUpProse(chapter.index)}
              className={`folio-prose ${fontClass} ${
                voiceTapActive ? 'folio-voice-tap-active' : ''
              }`}
              style={proseCustomStyles}
            />
          </div>
        ) : (
          <div className="px-6 sm:px-12 py-20 flex flex-col items-center justify-center text-center gap-2 text-[var(--text-muted)]">
            <span className="font-serif-editorial text-base text-[var(--text-secondary)]">
              {chapter.title}
            </span>
            <span className="font-mono-tabular text-[11px]">
              {pageSpanLabel} · Section {chapter.index + 1} of {totalChapters}
            </span>
          </div>
        )}
      </article>
    );
  }
);

ContinuousChapterCard.displayName = 'ContinuousChapterCard';

export const ReflowableViewport: React.FC<ReflowableViewportProps> = ({
  navRef,
  chapters,
  chapterIndex,
  initialScrollRatio,
  jumpNonce,
  targetAnchorId = null,
  metrics,
  currentVirtualPage,
  progressPct,
  prefs,
  allHighlights,
  searchHighlight,
  headerPinned,
  bottomBarPinned,
  topOverlayActive,
  bottomOverlayActive,
  voiceActive = false,
  voicePlaying = false,
  voiceTapToRead = true,
  voiceSkipNoise = true,
  activeSentenceIndex = -1,
  activeWordIndex = -1,
  voiceFollowEnabled = true,
  recenterNonce = 0,
  onSentencesReady,
  onSentenceTap,
  onUserDetachedScroll,
  onChapterChange,
  onScrollProgress,
  onCreateHighlight,
  onFocusHighlight,
  onScrollDirection,
  onCenterTap,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const spreadFrameRef = useRef<HTMLDivElement>(null);
  const paginatedProseRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const proseRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const measuredHeightsRef = useRef<Map<number, number>>(new Map());

  const lastScrollTopRef = useRef<number>(0);
  const scrollRafRef = useRef<number | null>(null);
  const programmaticJumpRef = useRef<boolean>(false);
  const programmaticJumpTimerRef = useRef<number | null>(null);
  const programmaticVoiceScrollRef = useRef<boolean>(false);
  const voiceScrollTimerRef = useRef<number | null>(null);

  const sentencesRef = useRef<NarrationSentence[]>([]);
  const lastAutoScrolledSentenceRef = useRef<number>(-1);
  const lastRecenterNonceRef = useRef<number>(0);
  const onSentencesReadyRef = useRef(onSentencesReady);
  onSentencesReadyRef.current = onSentencesReady;

  const currentRatioRef = useRef<number>(initialScrollRatio);
  const activeChapterRef = useRef<number>(chapterIndex);
  activeChapterRef.current = chapterIndex;
  const prevJumpNonceRef = useRef<number>(jumpNonce);
  const prevLayoutRef = useRef<ReaderPreferences['readingLayout']>(prefs.readingLayout);

  const isPaginated = prefs.readingLayout === 'page' || prefs.readingLayout === 'spread';
  const isSpread = prefs.readingLayout === 'spread';

  const [spreadDims, setSpreadDims] = useState<{width: number; height: number}>({
    width: 900,
    height: 620,
  });
  const [spreadIndex, setSpreadIndex] = useState<number>(0);
  const [totalSpreads, setTotalSpreads] = useState<number>(1);

  const [visibleSet, setVisibleSet] = useState<Set<number>>(() => new Set([chapterIndex]));
  const [pendingAnchor, setPendingAnchor] = useState<{
    chapterIndex: number;
    anchorId: string;
  } | null>(null);
  const [jumpHistory, setJumpHistory] = useState<JumpHistoryEntry[]>([]);

  const [selectionMenu, setSelectionMenu] = useState<SelectionMenuState | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteColor, setNoteColor] = useState<HighlightColor>('amber');
  const [noteText, setNoteText] = useState('');

  const [footnotePreview, setFootnotePreview] = useState<FootnotePreviewState | null>(null);
  const [lightboxImage, setLightboxImage] = useState<LightboxImageState | null>(null);

  const chapter = chapters[chapterIndex] ?? chapters[0];
  const hasPrevChapter = chapterIndex > 0;
  const hasNextChapter = chapterIndex < chapters.length - 1;
  const isTwoColumn = isSpread && spreadDims.width >= 680;
  const columnGap = isTwoColumn ? 56 : 32;
  const spreadStepPx = spreadDims.width + columnGap;
  const totalVirtualPages = metrics?.totalVirtualPages ?? chapters.length;

  // Group highlights per chapter once so all mounted cards restore cleanly
  const highlightsByChapter = useMemo(() => {
    const map = new Map<number, HighlightRecord[]>();
    for (const hl of allHighlights) {
      if (!hl.selectedText || hl.selectedText.length === 0) continue;
      const list = map.get(hl.unitIndex);
      if (list) list.push(hl);
      else map.set(hl.unitIndex, [hl]);
    }
    return map;
  }, [allHighlights]);

  const registerSlotRef = useCallback((idx: number, el: HTMLDivElement | null) => {
    if (el) slotRefs.current.set(idx, el);
    else slotRefs.current.delete(idx);
  }, []);

  const registerProseRef = useCallback((idx: number, el: HTMLDivElement | null) => {
    if (el) proseRefs.current.set(idx, el);
    else proseRefs.current.delete(idx);
  }, []);

  const handleHeightMeasured = useCallback((idx: number, height: number) => {
    measuredHeightsRef.current.set(idx, height);
  }, []);

  const handlePendingAnchorConsumed = useCallback((idx: number) => {
    setPendingAnchor((prev) => (prev && prev.chapterIndex === idx ? null : prev));
  }, []);

  // Measure paginated frame viewport dimensions
  useEffect(() => {
    if (!isPaginated) return;
    const el = spreadFrameRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 160 && rect.height > 160) {
        setSpreadDims({
          width: Math.floor(rect.width),
          height: Math.floor(rect.height),
        });
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isPaginated, prefs.readingLayout]);

  // Continuous Scroll: Observe near-viewport chapter slots for lazy DOM hydration
  useEffect(() => {
    if (isPaginated) return;
    const root = scrollContainerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleSet((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const entry of entries) {
            const idxStr = (entry.target as HTMLElement).dataset.chapterIndex;
            if (!idxStr) continue;
            const idx = parseInt(idxStr, 10);
            if (entry.isIntersecting) {
              if (!next.has(idx)) {
                next.add(idx);
                changed = true;
              }
            }
          }
          return changed ? next : prev;
        });
      },
      {root, rootMargin: '1100px 0px'}
    );

    slotRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [isPaginated, chapters.length]);

  // Keep window around active chapter + jump anchor always hydrated
  useEffect(() => {
    if (isPaginated) return;
    setVisibleSet((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (let d = -2; d <= 3; d++) {
        const idx = chapterIndex + d;
        if (idx >= 0 && idx < chapters.length && !next.has(idx)) {
          next.add(idx);
          changed = true;
        }
      }
      if (pendingAnchor && !next.has(pendingAnchor.chapterIndex)) {
        next.add(pendingAnchor.chapterIndex);
        changed = true;
      }
      // Trim very distant chapters (> 18 away) when chapter count is large to keep DOM light
      if (chapters.length > 24 && next.size > 20) {
        for (const idx of Array.from(next)) {
          if (Math.abs(idx - chapterIndex) > 10 && idx !== pendingAnchor?.chapterIndex) {
            next.delete(idx);
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [isPaginated, chapterIndex, chapters.length, pendingAnchor]);

  // Explicit scroll jumps (TOC, Scrubber, Search, Bookmark, Return jump, initial mount, layout change)
  useEffect(() => {
    if (isPaginated) return;
    const scroller = scrollContainerRef.current;
    if (!scroller) return;

    if (targetAnchorId) {
      setPendingAnchor({chapterIndex, anchorId: targetAnchorId});
    }

    programmaticJumpRef.current = true;
    if (programmaticJumpTimerRef.current) {
      window.clearTimeout(programmaticJumpTimerRef.current);
    }
    programmaticJumpTimerRef.current = window.setTimeout(() => {
      programmaticJumpRef.current = false;
    }, 550);

    const layoutChanged = prevLayoutRef.current !== prefs.readingLayout;
    const isExplicitJump = prevJumpNonceRef.current !== jumpNonce;
    prevLayoutRef.current = prefs.readingLayout;
    prevJumpNonceRef.current = jumpNonce;
    const effectiveRatio =
      layoutChanged && !isExplicitJump ? currentRatioRef.current : initialScrollRatio;

    const raf = window.requestAnimationFrame(() => {
      const cardEl = slotRefs.current.get(chapterIndex);
      if (!cardEl) return;

      if (targetAnchorId) {
        const anchorEl = findAnchorElement(cardEl, chapterIndex, targetAnchorId);
        if (anchorEl) {
          anchorEl.scrollIntoView({behavior: 'auto', block: 'center'});
          triggerAnchorFlash(anchorEl);
          setPendingAnchor(null);
          return;
        }
      }

      if (searchHighlight && searchHighlight.unitIndex === chapterIndex) {
        const searchMark = cardEl.querySelector<HTMLElement>('mark.folio-search-match');
        if (searchMark) {
          searchMark.scrollIntoView({behavior: 'smooth', block: 'center'});
          return;
        }
      }

      if (chapterIndex === 0 && effectiveRatio <= 0.01) {
        scroller.scrollTop = 0;
        lastScrollTopRef.current = 0;
        currentRatioRef.current = 0;
        return;
      }

      const cardTop = cardEl.offsetTop;
      const cardHeight = cardEl.offsetHeight;
      const topOffsetPad = headerPinned ? 24 : 52;
      const scrollableSpan = Math.max(0, cardHeight - scroller.clientHeight * 0.45);
      const targetTop = Math.max(
        0,
        cardTop - topOffsetPad + Math.round(scrollableSpan * effectiveRatio)
      );
      scroller.scrollTop = targetTop;
      lastScrollTopRef.current = scroller.scrollTop;
      currentRatioRef.current = effectiveRatio;
    });

    setSelectionMenu(null);
    setNoteOpen(false);
    setFootnotePreview(null);

    return () => window.cancelAnimationFrame(raf);
  }, [isPaginated, jumpNonce, prefs.readingLayout]);

  // Continuous Scroll: Rebuild TTS narration map whenever active chapter changes or prose re-renders
  useEffect(() => {
    if (isPaginated) return;
    const timer = window.requestAnimationFrame(() => {
      const el = proseRefs.current.get(chapterIndex);
      if (!el) return;
      const extracted = extractReflowableNarrationMap(el, chapterIndex, voiceSkipNoise);
      sentencesRef.current = extracted;
      onSentencesReadyRef.current?.(extracted);
      lastAutoScrolledSentenceRef.current = -1;
    });
    return () => window.cancelAnimationFrame(timer);
  }, [
    isPaginated,
    chapterIndex,
    chapters,
    voiceSkipNoise,
    visibleSet,
    prefs.fontFamily,
    prefs.fontSize,
    prefs.lineHeight,
    prefs.paragraphSpacing,
    prefs.textIndent,
    prefs.textAlign,
    prefs.pageWidth,
  ]);

  // Paginated Mode (Single-Page & Two-Page Spread): Synchronous layout + pagination calculation
  useLayoutEffect(() => {
    if (!isPaginated) return;
    const el = paginatedProseRef.current;
    if (!el || !chapter) return;

    const currentHighlights = highlightsByChapter.get(chapterIndex) ?? [];
    el.innerHTML = chapter.html;
    applyHighlightsToDom(el, currentHighlights);

    let searchEl: HTMLElement | null = null;
    if (
      searchHighlight &&
      searchHighlight.unitIndex === chapterIndex &&
      searchHighlight.query.trim().length >= 2
    ) {
      searchEl = applySearchMatchHighlight(
        el,
        searchHighlight.query,
        searchHighlight.occurrenceInUnit
      );
    }

    const scrollW = el.scrollWidth;
    const count = Math.max(1, Math.ceil((scrollW + columnGap - 4) / Math.max(1, spreadStepPx)));
    setTotalSpreads(count);

    let nextIdx = 0;
    const anchorToResolve =
      targetAnchorId || (pendingAnchor?.chapterIndex === chapterIndex ? pendingAnchor.anchorId : null);

    const isExplicitJump = prevJumpNonceRef.current !== jumpNonce;
    const layoutChanged = prevLayoutRef.current !== prefs.readingLayout;
    const effectiveRatio =
      layoutChanged && !isExplicitJump ? currentRatioRef.current : initialScrollRatio;
    prevLayoutRef.current = prefs.readingLayout;
    prevJumpNonceRef.current = jumpNonce;

    if (anchorToResolve) {
      const anchorEl = findAnchorElement(el, chapterIndex, anchorToResolve);
      if (anchorEl) {
        nextIdx = Math.min(
          count - 1,
          Math.max(0, Math.floor(anchorEl.offsetLeft / Math.max(1, spreadStepPx)))
        );
        triggerAnchorFlash(anchorEl);
      }
      if (pendingAnchor?.chapterIndex === chapterIndex) {
        setPendingAnchor(null);
      }
    } else if (searchEl) {
      nextIdx = Math.min(
        count - 1,
        Math.max(0, Math.floor(searchEl.offsetLeft / Math.max(1, spreadStepPx)))
      );
    } else if (effectiveRatio >= 0.99) {
      nextIdx = count - 1;
    } else {
      nextIdx = Math.min(count - 1, Math.max(0, Math.round(effectiveRatio * (count - 1))));
    }

    setSpreadIndex(nextIdx);
    currentRatioRef.current = count > 1 ? nextIdx / (count - 1) : 0;

    setSelectionMenu(null);
    setNoteOpen(false);
    setFootnotePreview(null);
    lastAutoScrolledSentenceRef.current = -1;

    const extracted = extractReflowableNarrationMap(el, chapterIndex, voiceSkipNoise);
    sentencesRef.current = extracted;
    onSentencesReadyRef.current?.(extracted);
  }, [
    isPaginated,
    chapter,
    chapterIndex,
    highlightsByChapter,
    searchHighlight,
    targetAnchorId,
    jumpNonce,
    voiceSkipNoise,
    prefs.readingLayout,
    spreadDims.width,
    spreadDims.height,
    prefs.fontFamily,
    prefs.fontSize,
    prefs.lineHeight,
    prefs.paragraphSpacing,
    prefs.textIndent,
    prefs.textAlign,
    prefs.pageWidth,
    initialScrollRatio,
    columnGap,
    spreadStepPx,
  ]);

  // Get the active .folio-prose container regardless of reading layout mode
  const getActiveProseContainer = useCallback((): HTMLElement | null => {
    if (isPaginated) return paginatedProseRef.current;
    return proseRefs.current.get(chapterIndex) ?? null;
  }, [isPaginated, chapterIndex]);

  // Apply live sentence + active word DOM highlights & auto-scroll / page turn
  useEffect(() => {
    // Clear stale TTS spans from any mounted prose containers first if voice turned off
    if (!voiceActive || activeSentenceIndex < 0) {
      if (isPaginated) {
        clearTtsDomHighlights(paginatedProseRef.current);
      } else {
        proseRefs.current.forEach((node) => clearTtsDomHighlights(node));
      }
      lastAutoScrolledSentenceRef.current = -1;
      return;
    }

    const el = getActiveProseContainer();
    if (!el) return;

    if (!isPaginated) {
      proseRefs.current.forEach((node, idx) => {
        if (idx !== chapterIndex) clearTtsDomHighlights(node);
      });
    }

    const sentence = sentencesRef.current[activeSentenceIndex];
    if (!sentence) {
      clearTtsDomHighlights(el);
      return;
    }

    const {sentenceEl, wordEl} = applyTtsDomHighlight(
      el,
      sentence,
      activeWordIndex,
      voiceSkipNoise
    );

    const forceRecenter = recenterNonce !== lastRecenterNonceRef.current;
    if (forceRecenter) {
      lastRecenterNonceRef.current = recenterNonce;
    }

    const sentenceChanged = lastAutoScrolledSentenceRef.current !== activeSentenceIndex;
    const targetEl = wordEl || sentenceEl;

    if (targetEl && (voiceFollowEnabled || forceRecenter) && (sentenceChanged || forceRecenter)) {
      lastAutoScrolledSentenceRef.current = activeSentenceIndex;

      if (isPaginated) {
        const offsetLeft = targetEl.offsetLeft;
        const targetSpread = Math.min(
          Math.max(0, totalSpreads - 1),
          Math.max(0, Math.floor(offsetLeft / Math.max(1, spreadStepPx)))
        );
        if (targetSpread !== spreadIndex) {
          setSpreadIndex(targetSpread);
          const ratio = totalSpreads > 1 ? targetSpread / (totalSpreads - 1) : 0;
          currentRatioRef.current = ratio;
          onScrollProgress(ratio);
        }
      } else {
        const scroller = scrollContainerRef.current;
        if (scroller) {
          const vpRect = scroller.getBoundingClientRect();
          const elRect = targetEl.getBoundingClientRect();
          const outsideComfortBand =
            forceRecenter ||
            elRect.top < vpRect.top + vpRect.height * 0.22 ||
            elRect.bottom > vpRect.bottom - vpRect.height * 0.28;

          if (outsideComfortBand) {
            programmaticVoiceScrollRef.current = true;
            if (voiceScrollTimerRef.current) window.clearTimeout(voiceScrollTimerRef.current);
            targetEl.scrollIntoView({behavior: 'smooth', block: 'center'});
            voiceScrollTimerRef.current = window.setTimeout(() => {
              programmaticVoiceScrollRef.current = false;
            }, 520);
          }
        }
      }
    }
  }, [
    voiceActive,
    activeSentenceIndex,
    activeWordIndex,
    voiceSkipNoise,
    voiceFollowEnabled,
    recenterNonce,
    isPaginated,
    chapterIndex,
    totalSpreads,
    spreadStepPx,
    spreadIndex,
    getActiveProseContainer,
    onScrollProgress,
  ]);

  const stepPrev = useCallback(() => {
    if (isPaginated) {
      if (spreadIndex > 0) {
        const next = spreadIndex - 1;
        setSpreadIndex(next);
        const ratio = totalSpreads > 1 ? next / (totalSpreads - 1) : 0;
        currentRatioRef.current = ratio;
        onScrollProgress(ratio);
        onScrollDirection?.('down');
      } else if (hasPrevChapter) {
        onChapterChange(chapterIndex - 1, 1);
      }
    } else if (hasPrevChapter) {
      onChapterChange(chapterIndex - 1, 0);
    }
  }, [
    isPaginated,
    spreadIndex,
    totalSpreads,
    hasPrevChapter,
    chapterIndex,
    onChapterChange,
    onScrollProgress,
    onScrollDirection,
  ]);

  const stepNext = useCallback(() => {
    if (isPaginated) {
      if (spreadIndex < totalSpreads - 1) {
        const next = spreadIndex + 1;
        setSpreadIndex(next);
        const ratio = totalSpreads > 1 ? next / (totalSpreads - 1) : 1;
        currentRatioRef.current = ratio;
        onScrollProgress(ratio);
        onScrollDirection?.('down');
      } else if (hasNextChapter) {
        onChapterChange(chapterIndex + 1, 0);
      }
    } else if (hasNextChapter) {
      onChapterChange(chapterIndex + 1, 0);
    }
  }, [
    isPaginated,
    spreadIndex,
    totalSpreads,
    hasNextChapter,
    chapterIndex,
    onChapterChange,
    onScrollProgress,
    onScrollDirection,
  ]);

  const getFirstVisibleSentenceIndex = useCallback(() => {
    const el = getActiveProseContainer();
    if (!el || sentencesRef.current.length === 0) return 0;
    const viewportEl = isPaginated ? spreadFrameRef.current : scrollContainerRef.current;
    return findFirstVisibleReflowableSentence(el, viewportEl, sentencesRef.current, voiceSkipNoise);
  }, [isPaginated, getActiveProseContainer, voiceSkipNoise]);

  useImperativeHandle(
    navRef,
    () => ({stepPrev, stepNext, getFirstVisibleSentenceIndex}),
    [stepPrev, stepNext, getFirstVisibleSentenceIndex]
  );

  // Keyboard navigation: ArrowLeft/Right and Space/Shift+Space cross chapters seamlessly
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (lightboxImage || footnotePreview) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepNext();
      } else if (e.code === 'Space' && !voiceActive) {
        // Yield Spacebar to Voice Narration Play/Pause when Voice mode is open
        if (tag === 'BUTTON' || tag === 'A') return;
        e.preventDefault();
        if (isPaginated) {
          if (e.shiftKey) stepPrev();
          else stepNext();
        } else {
          const scroller = scrollContainerRef.current;
          if (scroller) {
            const stepPx = Math.max(260, Math.round(scroller.clientHeight * 0.85));
            scroller.scrollBy({top: e.shiftKey ? -stepPx : stepPx, behavior: 'smooth'});
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stepPrev, stepNext, isPaginated, voiceActive, lightboxImage, footnotePreview]);

  // Debounced mouse-wheel page turning for Single-Page and Two-Page Spread modes
  const wheelAccumRef = useRef(0);
  const wheelResetTimerRef = useRef<number | null>(null);
  const lastWheelFlipAtRef = useRef(0);

  const handlePaginatedWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!isPaginated || e.ctrlKey || lightboxImage || footnotePreview || selectionMenu) return;
      const rawDelta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      const delta = e.deltaMode === 1 ? rawDelta * 32 : rawDelta;
      if (Math.abs(delta) < 3) return;

      const now = Date.now();
      if (now - lastWheelFlipAtRef.current < 260) return;

      wheelAccumRef.current += delta;
      if (wheelResetTimerRef.current) window.clearTimeout(wheelResetTimerRef.current);
      wheelResetTimerRef.current = window.setTimeout(() => {
        wheelAccumRef.current = 0;
      }, 180);

      if (Math.abs(wheelAccumRef.current) >= 44) {
        const dir = wheelAccumRef.current > 0 ? 'next' : 'prev';
        wheelAccumRef.current = 0;
        lastWheelFlipAtRef.current = now;
        if (dir === 'next') stepNext();
        else stepPrev();
      }
    },
    [isPaginated, lightboxImage, footnotePreview, selectionMenu, stepNext, stepPrev]
  );

  // Clear programmatic jump lock immediately if user physically scrolls or touches
  const clearProgrammaticJump = useCallback(() => {
    if (programmaticJumpRef.current) {
      programmaticJumpRef.current = false;
      if (programmaticJumpTimerRef.current) {
        window.clearTimeout(programmaticJumpTimerRef.current);
        programmaticJumpTimerRef.current = null;
      }
    }
  }, []);

  // Continuous Scroll tracking with rAF throttling
  const handleScroll = useCallback(() => {
    const scroller = scrollContainerRef.current;
    if (!scroller) return;

    const top = scroller.scrollTop;
    const delta = top - lastScrollTopRef.current;

    if (
      voiceActive &&
      voicePlaying &&
      voiceFollowEnabled &&
      !programmaticVoiceScrollRef.current &&
      Math.abs(delta) > 28
    ) {
      onUserDetachedScroll?.();
    }

    if (delta > 14 && top > 48) {
      onScrollDirection?.('down');
      lastScrollTopRef.current = top;
    } else if (delta < -14 || top <= 24) {
      onScrollDirection?.('up');
      lastScrollTopRef.current = top;
    }

    if (programmaticJumpRef.current) return;

    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = scrollContainerRef.current;
      if (!el) return;

      const sTop = el.scrollTop;
      const cHeight = el.clientHeight;
      const maxScroll = Math.max(0, el.scrollHeight - cHeight);
      const normDoc = maxScroll > 0 ? Math.min(1, Math.max(0, sTop / maxScroll)) : 0;
      const probeY = sTop + cHeight * (0.14 + 0.72 * normDoc);

      let matchedIdx = activeChapterRef.current;
      let matchedRatio = currentRatioRef.current;

      if (sTop <= 8) {
        matchedIdx = 0;
        matchedRatio = 0;
      } else if (maxScroll > 0 && sTop >= maxScroll - 6) {
        matchedIdx = chapters.length - 1;
        matchedRatio = 1;
      } else {
        let bestDist = Number.POSITIVE_INFINITY;
        slotRefs.current.forEach((slotEl, idx) => {
          const slotTop = slotEl.offsetTop;
          const slotH = Math.max(1, slotEl.offsetHeight);
          const slotBottom = slotTop + slotH;
          if (probeY >= slotTop && probeY <= slotBottom) {
            bestDist = 0;
            matchedIdx = idx;
            matchedRatio = Math.min(1, Math.max(0, (probeY - slotTop) / slotH));
          } else {
            const dist = probeY < slotTop ? slotTop - probeY : probeY - slotBottom;
            if (dist < bestDist) {
              bestDist = dist;
              matchedIdx = idx;
              matchedRatio = probeY < slotTop ? 0 : 1;
            }
          }
        });
      }

      currentRatioRef.current = matchedRatio;
      if (matchedIdx !== activeChapterRef.current) {
        onChapterChange(matchedIdx, matchedRatio, true);
      } else {
        onScrollProgress(matchedRatio);
      }
    });
  }, [
    chapters.length,
    voiceActive,
    voicePlaying,
    voiceFollowEnabled,
    onUserDetachedScroll,
    onScrollDirection,
    onChapterChange,
    onScrollProgress,
  ]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) window.cancelAnimationFrame(scrollRafRef.current);
      if (programmaticJumpTimerRef.current) window.clearTimeout(programmaticJumpTimerRef.current);
      if (voiceScrollTimerRef.current) window.clearTimeout(voiceScrollTimerRef.current);
      if (wheelResetTimerRef.current) window.clearTimeout(wheelResetTimerRef.current);
    };
  }, []);

  const handleMouseUpOnChapter = useCallback((targetChapterIdx: number) => {
    const prose = isPaginated
      ? paginatedProseRef.current
      : proseRefs.current.get(targetChapterIdx);
    if (!prose) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      if (!noteOpen) setSelectionMenu(null);
      return;
    }

    const range = sel.getRangeAt(0);
    if (!prose.contains(range.commonAncestorContainer)) {
      if (!noteOpen) setSelectionMenu(null);
      return;
    }

    const selectedText = sel.toString().trim();
    if (selectedText.length < 2) {
      if (!noteOpen) setSelectionMenu(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    const fullText = prose.textContent || '';
    const idx = fullText.indexOf(selectedText);
    const prefix = idx > 0 ? fullText.slice(Math.max(0, idx - 24), idx) : '';
    const suffix =
      idx !== -1 ? fullText.slice(idx + selectedText.length, idx + selectedText.length + 24) : '';

    setSelectionMenu({
      unitIndex: targetChapterIdx,
      text: selectedText,
      prefix,
      suffix,
      x: Math.min(window.innerWidth - 160, Math.max(160, rect.left + rect.width / 2)),
      y: Math.max(72, rect.top - 12),
    });
    setNoteOpen(false);
    setNoteText('');
  }, [isPaginated, noteOpen]);

  const touchStartRef = useRef<{x: number; y: number; time: number} | null>(null);
  const justSwipedRef = useRef(false);

  const turnPageMobile = useCallback(
    (dir: 'prev' | 'next') => {
      if (isPaginated) {
        if (dir === 'next') stepNext();
        else stepPrev();
        return;
      }
      const scroller = scrollContainerRef.current;
      if (scroller) {
        const pageStep = Math.max(240, scroller.clientHeight * 0.84);
        if (dir === 'next') {
          const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 24;
          if (!atBottom) {
            scroller.scrollBy({top: pageStep, behavior: 'smooth'});
            return;
          }
          if (hasNextChapter) onChapterChange(chapterIndex + 1, 0);
        } else {
          if (scroller.scrollTop > 32) {
            scroller.scrollBy({top: -pageStep, behavior: 'smooth'});
            return;
          }
          if (hasPrevChapter) onChapterChange(chapterIndex - 1, 0);
        }
      } else {
        if (dir === 'next') stepNext();
        else stepPrev();
      }
    },
    [isPaginated, stepNext, stepPrev, hasNextChapter, hasPrevChapter, chapterIndex, onChapterChange]
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    clearProgrammaticJump();
    if (window.innerWidth >= 1024 || e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStartRef.current = {x: t.clientX, y: t.clientY, time: Date.now()};
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (window.innerWidth >= 1024 || !touchStartRef.current || e.changedTouches.length !== 1) return;
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const elapsed = Date.now() - start.time;

    if (elapsed < 600 && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      justSwipedRef.current = true;
      window.setTimeout(() => {
        justSwipedRef.current = false;
      }, 280);
      turnPageMobile(dx < 0 ? 'next' : 'prev');
    }
  };

  const navigateWithHistory = useCallback(
    (targetCh: number, anchorId?: string) => {
      setJumpHistory((prev) => [
        ...prev.slice(-9),
        {
          unitIndex: chapterIndex,
          scrollRatio: currentRatioRef.current,
          label: chapters[chapterIndex]?.title || `Section ${chapterIndex + 1}`,
        },
      ]);
      setFootnotePreview(null);
      if (anchorId) {
        setPendingAnchor({chapterIndex: targetCh, anchorId});
      }
      onChapterChange(targetCh, 0, false, anchorId);
    },
    [chapterIndex, chapters, onChapterChange]
  );

  const handleReturnJump = useCallback(() => {
    setJumpHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      onChapterChange(last.unitIndex, last.scrollRatio, false);
      return prev.slice(0, -1);
    });
  }, [onChapterChange]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (justSwipedRef.current) return;
    const el = e.target as HTMLElement | null;
    if (!el) return;

    const hlMark = el.closest('mark.folio-hl') as HTMLElement | null;
    if (hlMark?.dataset.highlightId) {
      onFocusHighlight(hlMark.dataset.highlightId);
      return;
    }

    // Intercept internal EPUB links & footnote references cleanly
    const link = el.closest('a') as HTMLAnchorElement | null;
    if (link) {
      const targetChAttr = link.getAttribute('data-folio-chapter');
      if (targetChAttr !== null) {
        e.preventDefault();
        e.stopPropagation();
        const targetCh = parseInt(targetChAttr, 10);
        const anchorId = link.getAttribute('data-folio-anchor') || undefined;
        const isNoteref = link.getAttribute('data-folio-noteref') === 'true';

        if (!Number.isNaN(targetCh) && targetCh >= 0 && targetCh < chapters.length) {
          if (isNoteref && anchorId) {
            const noteHtml = extractFootnoteHtml(chapters, targetCh, anchorId);
            if (noteHtml) {
              const rect = link.getBoundingClientRect();
              const linkText = (link.textContent || '').replace(/\s+/g, ' ').trim();
              setFootnotePreview({
                title: linkText ? `Note ${linkText}` : `Note · ${chapters[targetCh].title}`,
                html: noteHtml,
                targetChapterIndex: targetCh,
                anchorId,
                x: rect.left + rect.width / 2,
                y: rect.top,
              });
              return;
            }
          }
          navigateWithHistory(targetCh, anchorId);
          return;
        }
      }
      // Allow external http(s) links to open without toggling chrome
      e.stopPropagation();
      return;
    }

    // Click non-linked EPUB images to zoom in lightbox
    const clickedImg = el.closest('img') as HTMLImageElement | null;
    if (clickedImg && clickedImg.src && !clickedImg.closest('a')) {
      e.stopPropagation();
      const figCaption =
        clickedImg.closest('figure')?.querySelector('figcaption')?.textContent?.trim() || undefined;
      setLightboxImage({
        src: clickedImg.src,
        alt: clickedImg.alt || '',
        caption: figCaption,
      });
      return;
    }

    if (el.closest('button, input, textarea, select')) return;

    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;

    // On mobile viewports (<1024px), outer 20% edge zones turn pages
    if (window.innerWidth < 1024) {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
      if (relX < 0.2) {
        turnPageMobile('prev');
        return;
      }
      if (relX > 0.8) {
        turnPageMobile('next');
        return;
      }
    }

    // Tap any sentence to read from there when Voice mode & tap-to-read are active
    if (voiceActive && voiceTapToRead) {
      const cardEl = el.closest('[data-chapter-index]') as HTMLElement | null;
      const targetChIdx = cardEl
        ? parseInt(cardEl.dataset.chapterIndex || String(chapterIndex), 10)
        : chapterIndex;
      const proseEl = isPaginated
        ? paginatedProseRef.current
        : proseRefs.current.get(targetChIdx) ?? getActiveProseContainer();

      if (proseEl && proseEl.contains(el)) {
        const localSentences =
          targetChIdx === chapterIndex
            ? sentencesRef.current
            : extractReflowableNarrationMap(proseEl, targetChIdx, voiceSkipNoise);
        const tappedIdx = findSentenceAtDomPoint(
          proseEl,
          localSentences,
          e.clientX,
          e.clientY,
          voiceSkipNoise
        );
        if (tappedIdx !== null) {
          onSentenceTap?.(tappedIdx, targetChIdx !== chapterIndex ? targetChIdx : undefined);
          return;
        }
      }
    }

    onCenterTap?.();
  };

  const commitHighlight = (color: HighlightColor, note = '') => {
    if (!selectionMenu) return;
    onCreateHighlight({
      unitIndex: selectionMenu.unitIndex,
      selectedText: selectionMenu.text,
      prefixContext: selectionMenu.prefix,
      suffixContext: selectionMenu.suffix,
      color,
      note,
    });
    window.getSelection()?.removeAllRanges();
    setSelectionMenu(null);
    setNoteOpen(false);
    setNoteText('');
  };

  const fontClass =
    prefs.fontFamily === 'sans'
      ? 'font-sans-ui'
      : prefs.fontFamily === 'mono'
        ? 'font-mono-tabular'
        : 'font-serif-editorial';

  const proseCustomStyles = useMemo(
    () =>
      ({
        fontSize: `${prefs.fontSize}px`,
        lineHeight: prefs.lineHeight,
        '--folio-para-gap': `${prefs.paragraphSpacing}em`,
        '--folio-text-align': prefs.textAlign,
        '--folio-text-indent': `${prefs.textIndent}em`,
      }) as React.CSSProperties,
    [prefs.fontSize, prefs.lineHeight, prefs.paragraphSpacing, prefs.textAlign, prefs.textIndent]
  );

  const canGoPrev = isPaginated ? spreadIndex > 0 || hasPrevChapter : hasPrevChapter;
  const canGoNext = isPaginated ? spreadIndex < totalSpreads - 1 || hasNextChapter : hasNextChapter;

  const paginatedTopPad = headerPinned ? 'pt-11' : topOverlayActive ? 'pt-24' : 'pt-11';
  const paginatedBottomPad = bottomBarPinned ? 'pb-4' : bottomOverlayActive ? 'pb-16' : 'pb-5';
  const scrollTopPad = headerPinned ? 'pt-12' : 'pt-28';
  const scrollBottomPad = bottomBarPinned ? 'pb-14' : 'pb-28';

  const paginatedMaxWidth = isSpread
    ? `${Math.min(1280, prefs.pageWidth + 460)}px`
    : `${Math.min(880, prefs.pageWidth + 110)}px`;

  return (
    <div className="flex-1 min-w-0 h-full relative folio-reading-desk flex flex-col overflow-hidden">
      {/* Subtle Floating Current-Chapter Header Indicator (disappears gently when full header overlays) */}
      <div
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 z-20 transition-all duration-180 ${
          topOverlayActive ? 'top-2 opacity-0' : 'top-2.5 opacity-100'
        }`}
      >
        <div className="pointer-events-auto inline-flex items-center gap-2.5 px-3 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)]/94 backdrop-blur-xs shadow-xs text-[11px] max-w-[calc(100vw-2rem)]">
          <span className="text-[var(--text-secondary)] truncate max-w-[160px] sm:max-w-[280px]">
            {chapter?.title}
          </span>
          <span aria-hidden="true" className="text-[var(--border-strong)]">
            ·
          </span>
          <span className="font-mono-tabular text-[var(--text-primary)] whitespace-nowrap shrink-0">
            Page {currentVirtualPage} of {totalVirtualPages}
          </span>
          <span aria-hidden="true" className="hidden sm:inline text-[var(--border-strong)]">
            ·
          </span>
          <span className="hidden sm:inline font-mono-tabular text-[var(--text-muted)] shrink-0">
            {Math.round(progressPct)}%
          </span>
          {jumpHistory.length > 0 && (
            <>
              <span aria-hidden="true" className="text-[var(--border-strong)]">
                ·
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleReturnJump();
                }}
                title={`Return to ${jumpHistory[jumpHistory.length - 1].label}`}
                className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Return</span>
              </button>
            </>
          )}
        </div>
      </div>

      {isPaginated ? (
        /* Paginated Framed Editorial Viewport: Single-Page or Two-Page Codex Spread */
        <div
          onClick={handleCanvasClick}
          onWheel={handlePaginatedWheel}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className={`flex-1 min-h-0 flex flex-col justify-between px-3 sm:px-10 lg:px-14 transition-[padding] duration-180 ${paginatedTopPad} ${paginatedBottomPad}`}
        >
          <div
            className="mx-auto w-full flex-1 min-h-0 flex flex-col relative"
            style={{maxWidth: paginatedMaxWidth}}
          >
            {/* Framed Editorial Paper Sheet */}
            <div className="folio-page-card rounded-lg flex-1 min-h-0 flex flex-col px-5 sm:px-10 lg:px-12 py-5 sm:py-7 relative">
              {/* Quiet Top Sheet Running Header */}
              <div className="mb-4 pb-2 border-b border-[var(--border-subtle)]/75 flex items-center justify-between text-[11px] text-[var(--text-muted)] shrink-0">
                <span className="truncate">{chapter?.title}</span>
                <span className="font-mono-tabular shrink-0 ml-4">
                  {isTwoColumn ? 'Spread' : 'Page'} {spreadIndex + 1} / {totalSpreads}
                </span>
              </div>

              {/* Multi-Column Paginated Frame */}
              <div ref={spreadFrameRef} className="relative flex-1 min-h-0 overflow-hidden">
                {/* Subtle vertical center codex gutter divider when 2 columns are active */}
                {isTwoColumn && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-8 folio-codex-gutter z-10"
                  />
                )}

                <div
                  ref={paginatedProseRef}
                  onMouseUp={() => handleMouseUpOnChapter(chapterIndex)}
                  onTouchEnd={() => handleMouseUpOnChapter(chapterIndex)}
                  className={`folio-prose folio-spread-content ${fontClass} ${
                    voiceActive && voiceTapToRead ? 'folio-voice-tap-active' : ''
                  } transition-transform duration-200 ease-out`}
                  style={{
                    ...proseCustomStyles,
                    height: `${spreadDims.height}px`,
                    columnWidth: `${
                      isTwoColumn
                        ? Math.floor((spreadDims.width - columnGap) / 2)
                        : spreadDims.width
                    }px`,
                    columnGap: `${columnGap}px`,
                    transform: `translateX(-${spreadIndex * spreadStepPx}px)`,
                  }}
                />
              </div>
            </div>

            {/* Subtle Side Page-Turn Buttons */}
            <button
              type="button"
              disabled={!canGoPrev}
              onClick={(e) => {
                e.stopPropagation();
                stepPrev();
              }}
              aria-label={isTwoColumn ? 'Previous spread' : 'Previous page'}
              className="hidden sm:flex items-center justify-center absolute -left-9 lg:-left-11 top-1/2 -translate-y-1/2 w-8 h-16 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/90 disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer z-20"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              disabled={!canGoNext}
              onClick={(e) => {
                e.stopPropagation();
                stepNext();
              }}
              aria-label={isTwoColumn ? 'Next spread' : 'Next page'}
              className="hidden sm:flex items-center justify-center absolute -right-9 lg:-right-11 top-1/2 -translate-y-1/2 w-8 h-16 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/90 disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer z-20"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        /* Continuous Vertical Virtual-Page Stack */
        <div
          ref={scrollContainerRef}
          data-folio-vscroll="true"
          onScroll={handleScroll}
          onWheel={clearProgrammaticJump}
          onClick={handleCanvasClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="flex-1 overflow-y-auto folio-reading-desk relative"
        >
          <div
            className={`mx-auto px-3 sm:px-8 space-y-6 ${scrollTopPad} ${scrollBottomPad}`}
            style={{maxWidth: `${prefs.pageWidth + 112}px`}}
          >
            {chapters.map((ch) => {
              const chMetric = metrics?.chapters[ch.index];
              const startVPage = chMetric?.startVirtualPage ?? ch.index + 1;
              const vPageCount = chMetric?.virtualPageCount ?? 1;
              const estHeight =
                measuredHeightsRef.current.get(ch.index) ?? Math.max(380, vPageCount * 760);

              return (
                <ContinuousChapterCard
                  key={ch.index}
                  chapter={ch}
                  totalChapters={chapters.length}
                  startVirtualPage={startVPage}
                  virtualPageCount={vPageCount}
                  isHydrated={visibleSet.has(ch.index)}
                  isActiveChapter={ch.index === chapterIndex}
                  estimatedHeight={estHeight}
                  highlights={highlightsByChapter.get(ch.index) ?? []}
                  searchMatch={
                    searchHighlight && searchHighlight.unitIndex === ch.index
                      ? {
                          query: searchHighlight.query,
                          occurrenceInUnit: searchHighlight.occurrenceInUnit,
                          nonce: searchHighlight.nonce,
                        }
                      : null
                  }
                  pendingAnchorId={
                    pendingAnchor?.chapterIndex === ch.index ? pendingAnchor.anchorId : null
                  }
                  fontClass={fontClass}
                  proseCustomStyles={proseCustomStyles}
                  voiceTapActive={voiceActive && voiceTapToRead}
                  onSlotRef={registerSlotRef}
                  onProseRef={registerProseRef}
                  onHeightMeasured={handleHeightMeasured}
                  onPendingAnchorConsumed={handlePendingAnchorConsumed}
                  onMouseUpProse={handleMouseUpOnChapter}
                />
              );
            })}

            {/* Quiet End-of-Book Flourish */}
            <div className="py-10 text-center text-xs text-[var(--text-muted)] font-serif-editorial">
              <span>End of Document · </span>
              <span className="font-mono-tabular">
                {totalVirtualPages} {totalVirtualPages === 1 ? 'page' : 'pages'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Footnote Preview Popover */}
      <FootnotePopover
        footnote={footnotePreview}
        onJumpToSource={(targetCh, anchor) => navigateWithHistory(targetCh, anchor)}
        onClose={() => setFootnotePreview(null)}
      />

      {/* Illustration Zoom Lightbox */}
      <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />

      {/* Floating Highlight & Note Toolbar */}
      {selectionMenu && (
        <div
          style={{
            left: `${selectionMenu.x}px`,
            top: `${selectionMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-xl p-2"
        >
          {!noteOpen ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-1">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={`Highlight ${c.label}`}
                    aria-label={`Highlight in ${c.label}`}
                    onClick={() => commitHighlight(c.id)}
                    className="w-5 h-5 rounded-full border border-black/15 hover:scale-110 transition-transform cursor-pointer"
                    style={{backgroundColor: c.swatch}}
                  />
                ))}
              </div>
              <div className="h-4 w-px bg-[var(--border-subtle)]" />
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
              >
                <StickyNote className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Add Note</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectionMenu(null)}
                aria-label="Dismiss selection toolbar"
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="w-72 p-1.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {HIGHLIGHT_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setNoteColor(c.id)}
                      aria-label={`Select ${c.label} highlight`}
                      className={`w-4 h-4 rounded-full cursor-pointer ${
                        noteColor === c.id
                          ? 'ring-2 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--bg-elevated)]'
                          : 'opacity-70'
                      }`}
                      style={{backgroundColor: c.swatch}}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectionMenu(null)}
                  aria-label="Cancel note"
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                rows={3}
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write a note for this highlight..."
                className="w-full px-2.5 py-2 text-xs rounded border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNoteOpen(false)}
                  className="px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => commitHighlight(noteColor, noteText.trim())}
                  className="px-3 py-1 text-xs font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] cursor-pointer"
                >
                  Save Highlight
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
