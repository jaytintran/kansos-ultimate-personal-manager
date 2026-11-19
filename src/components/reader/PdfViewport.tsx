import {StickyNote, X} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {HIGHLIGHT_COLORS} from '../../lib/formatters';
import {
  extractPdfPageSentences,
  type NarrationSentence,
  type PdfSpanMeta,
} from '../../lib/narrationText';
import type {PdfDocumentHandle} from '../../lib/parsers/pdfParser';
import type {HighlightColor, ReaderPreferences} from '../../types/library';

interface PdfSelectionMenu {
  text: string;
  pageNumber: number;
  x: number;
  y: number;
}

interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface HighlightBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PdfPageCanvasProps {
  pdf: PdfDocumentHandle;
  pageNumber: number;
  containerWidth: number;
  prefs: ReaderPreferences;
  isNearViewport: boolean;
  defaultSize: {width: number; height: number};
  searchHighlightQuery: string | null;
  voiceActive: boolean;
  voiceTapToRead: boolean;
  voiceSkipNoise: boolean;
  isActiveVoicePage: boolean;
  activeSentenceIndex: number;
  activeWordIndex: number;
  voiceFollowEnabled: boolean;
  recenterNonce: number;
  onBeginVoiceAutoScroll: () => void;
  onPageSentencesReady: (pageNumber: number, sentences: NarrationSentence[]) => void;
  onSentenceTap: (pageNumber: number, sentenceIndex: number) => void;
  onTextSelected: (menu: PdfSelectionMenu) => void;
  onSizeMeasured?: (pageNumber: number, size: {width: number; height: number}) => void;
}

const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdf,
  pageNumber,
  containerWidth,
  prefs,
  isNearViewport,
  defaultSize,
  searchHighlightQuery,
  voiceActive,
  voiceTapToRead,
  voiceSkipNoise,
  isActiveVoicePage,
  activeSentenceIndex,
  activeWordIndex,
  voiceFollowEnabled,
  recenterNonce,
  onBeginVoiceAutoScroll,
  onPageSentencesReady,
  onSentenceTap,
  onTextSelected,
  onSizeMeasured,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const activeVoiceBoxRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState(defaultSize);
  const [rendering, setRendering] = useState(false);
  const [spanMetas, setSpanMetas] = useState<PdfSpanMeta[]>([]);
  const [pageSentences, setPageSentences] = useState<NarrationSentence[]>([]);
  const lastScrolledSentRef = useRef<number>(-1);
  const lastRecenterRef = useRef<number>(0);
  const onPageSentencesReadyRef = useRef(onPageSentencesReady);
  onPageSentencesReadyRef.current = onPageSentencesReady;

  useEffect(() => {
    setDims(defaultSize);
  }, [defaultSize.width, defaultSize.height]);

  useEffect(() => {
    if (!isNearViewport) return;
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    const renderPage = async () => {
      setRendering(true);
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({scale: 1});
        const effectiveScale =
          prefs.pdfFitMode === 'width'
            ? Math.max(0.5, Math.min(2.2, containerWidth / baseViewport.width))
            : prefs.pdfZoom;

        const viewport = page.getViewport({scale: effectiveScale});
        const nextDims = {
          width: Math.floor(viewport.width),
          height: Math.floor(viewport.height),
        };
        setDims(nextDims);
        onSizeMeasured?.(pageNumber, nextDims);

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${nextDims.width}px`;
        canvas.style.height = `${nextDims.height}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, viewport.width, viewport.height);

        renderTask = page.render({canvasContext: ctx, viewport, canvas});
        await renderTask.promise;
        if (cancelled) return;

        // Build selectable transparent text layer with optional search match highlights
        const textLayer = textLayerRef.current;
        if (textLayer) {
          textLayer.innerHTML = '';
          const textContent = await page.getTextContent();
          if (cancelled) return;

          const lowerSearch = searchHighlightQuery?.trim().toLowerCase() || '';
          const frag = document.createDocumentFragment();
          const createdSpans: Array<{
            span: HTMLSpanElement;
            text: string;
            left: number;
            top: number;
            fontHeight: number;
            pdfWidth: number;
          }> = [];

          let spanIdx = 0;
          for (const rawItem of textContent.items) {
            const item = rawItem as TextItemLike;
            if (!item.str || !item.transform) continue;
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            const fontHeight = Math.hypot(tx[2], tx[3]) || 12;
            const angle = Math.atan2(tx[1], tx[0]);
            const left = tx[4];
            const top = tx[5] - fontHeight * 0.85;
            const span = document.createElement('span');
            span.textContent = item.str;
            span.dataset.spanIndex = String(spanIdx);
            span.style.left = `${left}px`;
            span.style.top = `${top}px`;
            span.style.fontSize = `${fontHeight}px`;
            span.style.fontFamily = 'sans-serif';
            if (Math.abs(angle) > 0.01) {
              span.style.transform = `rotate(${angle}rad)`;
            }
            if (lowerSearch.length >= 2 && item.str.toLowerCase().includes(lowerSearch)) {
              span.className = 'folio-pdf-search-hit';
            }
            frag.appendChild(span);
            createdSpans.push({
              span,
              text: item.str,
              left,
              top,
              fontHeight,
              pdfWidth: (item.width || 0) * effectiveScale,
            });
            spanIdx++;
          }
          textLayer.appendChild(frag);

          const measuredMetas: PdfSpanMeta[] = createdSpans.map((entry, idx) => ({
            spanIndex: idx,
            text: entry.text,
            left: entry.left,
            top: entry.top,
            width: Math.max(entry.span.offsetWidth, entry.pdfWidth, entry.fontHeight * 0.4),
            height: Math.max(entry.span.offsetHeight, entry.fontHeight * 1.12),
          }));
          setSpanMetas(measuredMetas);
        }
      } catch (err) {
        if ((err as {name?: string})?.name !== 'RenderingCancelledException') {
          // Graceful fallback
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [
    pdf,
    pageNumber,
    containerWidth,
    prefs.pdfFitMode,
    prefs.pdfZoom,
    isNearViewport,
    searchHighlightQuery,
  ]);

  // Extract synchronized narration sentences whenever text layer or noise filter updates
  useEffect(() => {
    if (spanMetas.length === 0) return;
    const extracted = extractPdfPageSentences(spanMetas, pageNumber, dims.height, voiceSkipNoise);
    setPageSentences(extracted);
    onPageSentencesReadyRef.current(pageNumber, extracted);
  }, [spanMetas, pageNumber, dims.height, voiceSkipNoise]);

  // Compute exact sentence and active word highlight boxes on this PDF page
  const {sentenceBoxes, wordBoxes} = useMemo(() => {
    if (!voiceActive || !isActiveVoicePage || activeSentenceIndex < 0) {
      return {sentenceBoxes: [] as HighlightBox[], wordBoxes: [] as HighlightBox[]};
    }
    const sentence = pageSentences[activeSentenceIndex];
    if (!sentence || !sentence.pdfSegments || sentence.pdfSegments.length === 0) {
      return {sentenceBoxes: [] as HighlightBox[], wordBoxes: [] as HighlightBox[]};
    }

    const sBoxes: HighlightBox[] = [];
    for (const seg of sentence.pdfSegments) {
      const meta = spanMetas[seg.spanIndex];
      if (!meta) continue;
      const totalChars = Math.max(1, meta.text.length);
      const fracStart = Math.max(0, Math.min(1, seg.startInSpan / totalChars));
      const fracEnd = Math.max(fracStart, Math.min(1, seg.endInSpan / totalChars));
      sBoxes.push({
        left: meta.left + meta.width * fracStart,
        top: meta.top,
        width: Math.max(4, meta.width * (fracEnd - fracStart)),
        height: meta.height,
      });
    }

    const wBoxes: HighlightBox[] = [];
    if (activeWordIndex >= 0 && activeWordIndex < sentence.words.length) {
      const word = sentence.words[activeWordIndex];
      for (const seg of sentence.pdfSegments) {
        if (seg.endInSentence <= word.startInSentence || seg.startInSentence >= word.endInSentence) {
          continue;
        }
        const meta = spanMetas[seg.spanIndex];
        if (!meta) continue;
        const overlapStart = Math.max(seg.startInSentence, word.startInSentence);
        const overlapEnd = Math.min(seg.endInSentence, word.endInSentence);
        const spanCharStart = seg.startInSpan + (overlapStart - seg.startInSentence);
        const spanCharEnd = seg.startInSpan + (overlapEnd - seg.startInSentence);
        const totalChars = Math.max(1, meta.text.length);
        const fracStart = Math.max(0, Math.min(1, spanCharStart / totalChars));
        const fracEnd = Math.max(fracStart, Math.min(1, spanCharEnd / totalChars));
        wBoxes.push({
          left: meta.left + meta.width * fracStart,
          top: meta.top,
          width: Math.max(6, meta.width * (fracEnd - fracStart)),
          height: meta.height,
        });
      }
    }

    return {sentenceBoxes: sBoxes, wordBoxes: wBoxes};
  }, [voiceActive, isActiveVoicePage, activeSentenceIndex, activeWordIndex, pageSentences, spanMetas]);

  // Smoothly auto-scroll to active PDF sentence/word box when voice progresses
  useEffect(() => {
    if (!voiceActive || !isActiveVoicePage || activeSentenceIndex < 0) {
      lastScrolledSentRef.current = -1;
      return;
    }
    const force = recenterNonce !== lastRecenterRef.current;
    if (force) lastRecenterRef.current = recenterNonce;
    const changed = lastScrolledSentRef.current !== activeSentenceIndex;

    if ((voiceFollowEnabled || force) && (changed || force) && activeVoiceBoxRef.current) {
      lastScrolledSentRef.current = activeSentenceIndex;
      onBeginVoiceAutoScroll();
      activeVoiceBoxRef.current.scrollIntoView({behavior: 'smooth', block: 'center'});
    }
  }, [
    voiceActive,
    isActiveVoicePage,
    activeSentenceIndex,
    voiceFollowEnabled,
    recenterNonce,
    sentenceBoxes.length,
    onBeginVoiceAutoScroll,
  ]);

  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const textLayer = textLayerRef.current;
    const range = sel.getRangeAt(0);
    if (!textLayer || !textLayer.contains(range.commonAncestorContainer)) return;
    const text = sel.toString().replace(/\s+/g, ' ').trim();
    if (text.length < 2) return;
    const rect = range.getBoundingClientRect();
    onTextSelected({
      text,
      pageNumber,
      x: Math.min(window.innerWidth - 160, Math.max(160, rect.left + rect.width / 2)),
      y: Math.max(72, rect.top - 12),
    });
  };

  const handleTextLayerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!voiceActive || !voiceTapToRead) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;
    const span = (e.target as HTMLElement | null)?.closest('span[data-span-index]') as HTMLElement | null;
    if (!span) return;
    const spanIdx = Number(span.dataset.spanIndex);
    if (!Number.isFinite(spanIdx)) return;

    const match = pageSentences.find((s) =>
      s.pdfSegments?.some((seg) => seg.spanIndex === spanIdx)
    );
    if (match) {
      e.stopPropagation();
      onSentenceTap(pageNumber, match.index);
    }
  };

  const toneClass = !prefs.pdfThemeTone
    ? ''
    : prefs.theme === 'dark'
      ? 'pdf-tone-dark'
      : 'pdf-tone-sepia';

  return (
    <div
      className={`relative rounded-[4px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-sm overflow-hidden shrink-0 ${toneClass}`}
      style={{width: `${dims.width}px`, height: `${dims.height}px`}}
    >
      {isNearViewport ? (
        <>
          <canvas ref={canvasRef} className="block" />
          {/* Synchronized Voice Narration Highlights Layer */}
          {sentenceBoxes.length > 0 && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {sentenceBoxes.map((box, idx) => (
                <div
                  key={`s-${idx}`}
                  ref={idx === 0 ? activeVoiceBoxRef : undefined}
                  className="folio-pdf-tts-sentence"
                  style={{
                    left: `${box.left}px`,
                    top: `${box.top}px`,
                    width: `${box.width}px`,
                    height: `${box.height}px`,
                  }}
                />
              ))}
              {wordBoxes.map((box, idx) => (
                <div
                  key={`w-${idx}`}
                  className="folio-pdf-tts-word"
                  style={{
                    left: `${box.left}px`,
                    top: `${box.top}px`,
                    width: `${box.width}px`,
                    height: `${box.height}px`,
                  }}
                />
              ))}
            </div>
          )}
          <div
            ref={textLayerRef}
            onMouseUp={handleMouseUp}
            onTouchEnd={handleMouseUp}
            onClick={handleTextLayerClick}
            className="folio-pdf-text-layer"
          />
          {rendering && (
            <div className="pointer-events-none absolute inset-0 bg-[var(--bg-canvas)]/15" />
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center font-mono-tabular text-xs text-[var(--text-muted)]">
          Page {pageNumber}
        </div>
      )}
    </div>
  );
};

interface PdfViewportProps {
  pdf: PdfDocumentHandle;
  pageNumber: number;
  jumpNonce: number;
  prefs: ReaderPreferences;
  headerPinned: boolean;
  bottomBarPinned: boolean;
  searchHighlight: {pageNumber: number; query: string} | null;
  voiceActive?: boolean;
  voicePlaying?: boolean;
  voiceTapToRead?: boolean;
  voiceSkipNoise?: boolean;
  activeVoicePage?: number;
  activeSentenceIndex?: number;
  activeWordIndex?: number;
  voiceFollowEnabled?: boolean;
  recenterNonce?: number;
  onPageSentencesReady?: (pageNumber: number, sentences: NarrationSentence[]) => void;
  onSentenceTap?: (pageNumber: number, sentenceIndex: number) => void;
  onUserDetachedScroll?: () => void;
  onPageChange: (nextPage: number, isUserScroll?: boolean) => void;
  onCreateHighlight: (payload: {
    unitIndex: number;
    selectedText: string;
    prefixContext: string;
    suffixContext: string;
    color: HighlightColor;
    note: string;
  }) => void;
  onScrollDirection?: (dir: 'up' | 'down') => void;
  onCenterTap?: () => void;
}

export const PdfViewport: React.FC<PdfViewportProps> = ({
  pdf,
  pageNumber,
  jumpNonce,
  prefs,
  headerPinned,
  bottomBarPinned,
  searchHighlight,
  voiceActive = false,
  voicePlaying = false,
  voiceTapToRead = true,
  voiceSkipNoise = true,
  activeVoicePage = -1,
  activeSentenceIndex = -1,
  activeWordIndex = -1,
  voiceFollowEnabled = true,
  recenterNonce = 0,
  onPageSentencesReady,
  onSentenceTap,
  onUserDetachedScroll,
  onPageChange,
  onCreateHighlight,
  onScrollDirection,
  onCenterTap,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const lastScrollTopRef = useRef<number>(0);
  const programmaticScrollRef = useRef<boolean>(false);
  const voiceScrollTimerRef = useRef<number | null>(null);

  const [containerWidth, setContainerWidth] = useState<number>(820);
  const [baseAspect, setBaseAspect] = useState<number>(1.33); // height / width
  const [visibleSet, setVisibleSet] = useState<Set<number>>(() => new Set([pageNumber]));
  const [selectionMenu, setSelectionMenu] = useState<PdfSelectionMenu | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteColor, setNoteColor] = useState<HighlightColor>('amber');
  const [noteText, setNoteText] = useState('');

  const handleBeginVoiceAutoScroll = useCallback(() => {
    programmaticScrollRef.current = true;
    if (voiceScrollTimerRef.current) window.clearTimeout(voiceScrollTimerRef.current);
    voiceScrollTimerRef.current = window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 520);
  }, []);

  const isContinuous = prefs.pdfLayout === 'continuous';

  // Query page 1 dimensions once to establish accurate placeholder heights
  useEffect(() => {
    let active = true;
    pdf
      .getPage(1)
      .then((p) => {
        if (!active) return;
        const vp = p.getViewport({scale: 1});
        if (vp.width > 0 && vp.height > 0) {
          setBaseAspect(vp.height / vp.width);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pdf]);

  // Measure scroll viewport width for Fit Width
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 240) {
        setContainerWidth(Math.min(1020, w - 56));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Observe visible PDF page slots in Continuous mode for windowed rendering
  useEffect(() => {
    if (!isContinuous) return;
    const root = scrollContainerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleSet((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const entry of entries) {
            const pNum = Number((entry.target as HTMLElement).dataset.pageNumber);
            if (!pNum) continue;
            if (entry.isIntersecting) {
              if (!next.has(pNum)) {
                next.add(pNum);
                changed = true;
              }
            } else {
              if (next.has(pNum)) {
                next.delete(pNum);
                changed = true;
              }
            }
          }
          return changed ? next : prev;
        });
      },
      {root, rootMargin: '900px 0px', threshold: 0.01}
    );

    slotRefs.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [isContinuous, pdf.numPages]);

  // Programmatic jump to target page (from TOC, Scrubber, Bookmarks, or Search)
  useEffect(() => {
    if (!isContinuous) {
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
      return;
    }
    const slot = slotRefs.current.get(pageNumber);
    if (!slot) return;
    programmaticScrollRef.current = true;
    slot.scrollIntoView({behavior: 'auto', block: 'start'});
    setVisibleSet((prev) => new Set([...prev, pageNumber, Math.max(1, pageNumber - 1), Math.min(pdf.numPages, pageNumber + 1)]));
    const timer = window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 250);
    return () => window.clearTimeout(timer);
  }, [jumpNonce, isContinuous, pdf.numPages]);

  // Keyboard page turning (for Single Page mode or quick stepping)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft' && pageNumber > 1) {
        onPageChange(pageNumber - 1, false);
      } else if (e.key === 'ArrowRight' && pageNumber < pdf.numPages) {
        onPageChange(pageNumber + 1, false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pageNumber, pdf.numPages, onPageChange]);

  const handleScroll = useCallback(() => {
    const scroller = scrollContainerRef.current;
    if (!scroller) return;

    const top = scroller.scrollTop;
    const delta = top - lastScrollTopRef.current;
    if (
      voiceActive &&
      voicePlaying &&
      voiceFollowEnabled &&
      !programmaticScrollRef.current &&
      Math.abs(delta) > 30
    ) {
      onUserDetachedScroll?.();
    }
    if (delta > 16 && top > 60) {
      onScrollDirection?.('down');
      lastScrollTopRef.current = top;
    } else if (delta < -16 || top <= 24) {
      onScrollDirection?.('up');
      lastScrollTopRef.current = top;
    }

    if (!isContinuous || programmaticScrollRef.current) return;

    // Identify page closest to vertical center of the viewport
    const viewportMid = top + scroller.clientHeight * 0.35;
    let bestPage = pageNumber;
    let bestDist = Number.POSITIVE_INFINITY;

    slotRefs.current.forEach((el, pNum) => {
      const elMid = el.offsetTop + el.offsetHeight / 2;
      const dist = Math.abs(elMid - viewportMid);
      if (dist < bestDist) {
        bestDist = dist;
        bestPage = pNum;
      }
    });

    if (bestPage !== pageNumber) {
      onPageChange(bestPage, true);
    }
  }, [
    isContinuous,
    pageNumber,
    onPageChange,
    onScrollDirection,
    voiceActive,
    voicePlaying,
    voiceFollowEnabled,
    onUserDetachedScroll,
  ]);

  const touchStartRef = useRef<{x: number; y: number; time: number} | null>(null);
  const justSwipedRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
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
      if (dx < 0 && pageNumber < pdf.numPages) {
        onPageChange(pageNumber + 1, false);
      } else if (dx > 0 && pageNumber > 1) {
        onPageChange(pageNumber - 1, false);
      }
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (justSwipedRef.current) return;
    const el = e.target as HTMLElement | null;
    if (!el || el.closest('button, input, textarea')) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;
    setSelectionMenu(null);

    if (window.innerWidth < 1024) {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
      if (relX < 0.2) {
        if (pageNumber > 1) onPageChange(pageNumber - 1, false);
        return;
      }
      if (relX > 0.8) {
        if (pageNumber < pdf.numPages) onPageChange(pageNumber + 1, false);
        return;
      }
    }

    onCenterTap?.();
  };

  const commitHighlight = (color: HighlightColor, note = '') => {
    if (!selectionMenu) return;
    onCreateHighlight({
      unitIndex: selectionMenu.pageNumber,
      selectedText: selectionMenu.text,
      prefixContext: '',
      suffixContext: '',
      color,
      note,
    });
    window.getSelection()?.removeAllRanges();
    setSelectionMenu(null);
    setNoteOpen(false);
    setNoteText('');
  };

  const estimatedWidth =
    prefs.pdfFitMode === 'width'
      ? Math.floor(containerWidth)
      : Math.floor(612 * prefs.pdfZoom);
  const defaultSize = {
    width: Math.max(280, estimatedWidth),
    height: Math.max(360, Math.floor(estimatedWidth * baseAspect)),
  };

  const pageNumbers = isContinuous
    ? Array.from({length: pdf.numPages}, (_, i) => i + 1)
    : [Math.min(pdf.numPages, Math.max(1, pageNumber))];

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col bg-[var(--bg-canvas)] relative overflow-hidden">
      <div
        ref={scrollContainerRef}
        data-folio-vscroll="true"
        onScroll={handleScroll}
        onClick={handleCanvasClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`flex-1 overflow-auto px-3 sm:px-5 flex flex-col items-center gap-6 ${
          headerPinned ? 'pt-8' : 'pt-28'
        } ${bottomBarPinned ? 'pb-12' : 'pb-24'}`}
      >
        {pageNumbers.map((pNum) => {
          const isNear =
            !isContinuous ||
            visibleSet.has(pNum) ||
            Math.abs(pNum - pageNumber) <= 1;

          const activeQueryForPage =
            searchHighlight && searchHighlight.pageNumber === pNum
              ? searchHighlight.query
              : null;

          return (
            <div
              key={pNum}
              data-page-number={pNum}
              ref={(node) => {
                if (node) slotRefs.current.set(pNum, node);
                else slotRefs.current.delete(pNum);
              }}
              className={`${headerPinned ? 'scroll-mt-8' : 'scroll-mt-28'} flex flex-col items-center gap-2 shrink-0`}
            >
              <PdfPageCanvas
                pdf={pdf}
                pageNumber={pNum}
                containerWidth={containerWidth}
                prefs={prefs}
                isNearViewport={isNear}
                defaultSize={defaultSize}
                searchHighlightQuery={activeQueryForPage}
                voiceActive={voiceActive}
                voiceTapToRead={voiceTapToRead}
                voiceSkipNoise={voiceSkipNoise}
                isActiveVoicePage={voiceActive && activeVoicePage === pNum}
                activeSentenceIndex={activeSentenceIndex}
                activeWordIndex={activeWordIndex}
                voiceFollowEnabled={voiceFollowEnabled}
                recenterNonce={recenterNonce}
                onBeginVoiceAutoScroll={handleBeginVoiceAutoScroll}
                onPageSentencesReady={(pn, sents) => onPageSentencesReady?.(pn, sents)}
                onSentenceTap={(pn, sIdx) => onSentenceTap?.(pn, sIdx)}
                onTextSelected={(menu) => {
                  setSelectionMenu(menu);
                  setNoteOpen(false);
                  setNoteText('');
                }}
              />
              {isContinuous && (
                <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                  {pNum} / {pdf.numPages}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Highlight & Note Toolbar for PDF */}
      {selectionMenu && (
        <div
          style={{left: `${selectionMenu.x}px`, top: `${selectionMenu.y}px`}}
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
                    title={`Save ${c.label} highlight`}
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
                aria-label="Close highlight bar"
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
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
                placeholder="Write a note for this excerpt..."
                className="w-full px-2.5 py-2 text-xs rounded border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNoteOpen(false)}
                  className="px-2.5 py-1 text-xs text-[var(--text-secondary)] cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => commitHighlight(noteColor, noteText.trim())}
                  className="px-3 py-1 text-xs font-medium rounded bg-[var(--accent)] text-[var(--accent-contrast)] cursor-pointer"
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
