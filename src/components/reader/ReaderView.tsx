import {
  AlertCircle,
  Bookmark,
  BookOpen,
  Columns2,
  FileText,
  Headphones,
  List,
  Maximize2,
  Minimize2,
  Moon,
  PanelRight,
  Pin,
  ScrollText,
  Search,
  Sun,
  Type,
} from 'lucide-react';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useAudiobookNarrator} from '../../hooks/useAudiobookNarrator';
import {useVoicePreferences} from '../../hooks/useVoicePreferences';
import {libraryDb} from '../../lib/db';
import type {NarrationSentence} from '../../lib/narrationText';
import {parseEpubForReading} from '../../lib/parsers/epubParser';
import {parseMobiForReading} from '../../lib/parsers/mobiParser';
import {
  destroyPdfDocument,
  extractPdfReflowableBook,
  extractPdfToc,
  loadPdfDocument,
  type PdfDocumentHandle,
} from '../../lib/parsers/pdfParser';
import {
  computeReflowableMetrics,
  getVirtualPageAtLocation,
  PDF_MINUTES_PER_PAGE,
  searchTextUnits,
  WORDS_PER_MINUTE,
} from '../../lib/readerUtils';
import type {
  BookRecord,
  BookmarkRecord,
  HighlightColor,
  HighlightRecord,
  ParsedReflowableBook,
  ParsedTocItem,
  ReaderPreferences,
  SearchMatch,
} from '../../types/library';
import {BottomSheet} from '../ui/BottomSheet';
import {AudiobookExpandedView} from './AudiobookExpandedView';
import {AudiobookPlayerBar} from './AudiobookPlayerBar';
import {PdfViewport} from './PdfViewport';
import {ReaderDrawer, type ReaderDrawerTab} from './ReaderDrawer';
import {
  ReaderScrubber,
  type ScrubberBookmarkMarker,
  type ScrubberMarker,
} from './ReaderScrubber';
import type {BookJumpRequest, BookNoteLink, Entry} from '../../types';
import {ReaderTabStrip} from './ReaderTabStrip';
import {
  ReflowableViewport,
  type ReflowableNavHandle,
} from './ReflowableViewport';
import {StudyPane} from './StudyPane';
import {TypographyPopover} from './TypographyPopover';
import {VoiceSettingsPanel} from './VoiceSettingsPanel';

interface ReaderViewProps {
  book: BookRecord;
  openBooks: BookRecord[];
  prefs: ReaderPreferences;
  zenMode?: boolean;
  jumpRequest?: BookJumpRequest | null;
  bookNotes?: Entry[];
  onCreateBookNote?: (payload: {
    title: string;
    content: string;
    bookLink: BookNoteLink;
  }) => Entry | null;
  onDeleteBookNote?: (noteId: string) => void;
  onOpenNoteDetail?: (noteId: string) => void;
  onToggleZenMode?: () => void;
  onUpdatePrefs: (patch: Partial<ReaderPreferences>) => void;
  onResetPrefs: () => void;
  onToggleTheme: () => void;
  onBookProgressUpdate: (updatedBook: BookRecord) => void;
  onSelectLibrary: () => void;
  onSelectBookTab: (bookId: string) => void;
  onCloseBookTab: (bookId: string) => void;
  onSendHighlightToNotes?: (
    bookTitle: string,
    excerptText: string,
    locationLabel: string,
    linkMeta?: Partial<BookNoteLink>,
  ) => void;
  onNarrationStart?: () => void;
  onAnnotationsChange?: () => void;
  onNotify: (title: string, tone?: 'info' | 'success' | 'error') => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  book,
  openBooks,
  prefs,
  zenMode = false,
  jumpRequest = null,
  bookNotes = [],
  onCreateBookNote,
  onDeleteBookNote,
  onOpenNoteDetail,
  onToggleZenMode,
  onUpdatePrefs,
  onResetPrefs,
  onToggleTheme,
  onBookProgressUpdate,
  onSelectLibrary,
  onSelectBookTab,
  onCloseBookTab,
  onSendHighlightToNotes,
  onNarrationStart,
  onAnnotationsChange,
  onNotify,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reflowable, setReflowable] = useState<ParsedReflowableBook | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentHandle | null>(null);
  const [pdfReflowBook, setPdfReflowBook] = useState<ParsedReflowableBook | null>(null);
  const [pdfReflowWordCount, setPdfReflowWordCount] = useState<number>(0);
  const [isBuildingPdfReflow, setIsBuildingPdfReflow] = useState<boolean>(false);
  const [toc, setToc] = useState<ParsedTocItem[]>([]);

  const [unitIndex, setUnitIndex] = useState<number>(
    book.currentLocation?.unitIndex ?? (book.format === 'pdf' ? 1 : 0)
  );
  const [targetScrollRatio, setTargetScrollRatio] = useState<number>(
    book.currentLocation?.scrollRatio ?? 0
  );
  const [liveScrollRatio, setLiveScrollRatio] = useState<number>(
    book.currentLocation?.scrollRatio ?? 0
  );
  const currentScrollRatioRef = useRef<number>(book.currentLocation?.scrollRatio ?? 0);
  const [pdfJumpNonce, setPdfJumpNonce] = useState<number>(0);
  const [reflowableJumpNonce, setReflowableJumpNonce] = useState<number>(0);
  const [targetAnchorId, setTargetAnchorId] = useState<string | null>(null);

  // Annotations & Panels
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [highlights, setHighlights] = useState<HighlightRecord[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<ReaderDrawerTab>('toc');
  const [studyPaneOpen, setStudyPaneOpen] = useState(false);
  const [focusedHighlightId, setFocusedHighlightId] = useState<string | null>(null);
  const [typographyOpen, setTypographyOpen] = useState(false);

  // Independent auto-hide chrome visibility (for unpinned bars)
  const [headerRevealed, setHeaderRevealed] = useState(true);
  const [bottomRevealed, setBottomRevealed] = useState(true);
  const [hoveringTopBar, setHoveringTopBar] = useState(false);
  const [hoveringBottomBar, setHoveringBottomBar] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setIsMobileViewport(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Full-text Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchMatch, setActiveSearchMatch] = useState<SearchMatch | null>(null);
  const [searchJumpNonce, setSearchJumpNonce] = useState(0);
  const [pdfTextCache, setPdfTextCache] = useState<string[] | null>(null);
  const [isIndexingPdfSearch, setIsIndexingPdfSearch] = useState(false);

  // Voice / Audiobook Reader state
  const {
    effectiveSettings: voiceSettings,
    hasBookOverride: hasBookVoiceOverride,
    updateBookVoice,
    updateGlobalVoiceOption,
    clearBookOverride,
  } = useVoicePreferences(book.id);

  const [voiceOpen, setVoiceOpen] = useState(false);
  const [audiobookExpanded, setAudiobookExpanded] = useState(false);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [userDetachedScroll, setUserDetachedScroll] = useState(false);
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [reflowableSentences, setReflowableSentences] = useState<NarrationSentence[]>([]);
  const [pdfSentencesByPage, setPdfSentencesByPage] = useState<Record<number, NarrationSentence[]>>(
    {}
  );
  const [voicePdfPage, setVoicePdfPage] = useState<number>(
    book.currentLocation?.unitIndex ?? 1
  );
  const pendingPdfStartRef = useRef<{page: number; sentenceIndex: number} | null>(null);

  const reflowableNavRef = useRef<ReflowableNavHandle>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const latestBookRef = useRef(book);
  latestBookRef.current = book;
  const jumpRequestRef = useRef(jumpRequest);
  jumpRequestRef.current = jumpRequest;
  const lastHandledJumpNonceRef = useRef<number | null>(null);

  // Reset per-book reader state cleanly when switching tabs
  useEffect(() => {
    setReflowable(null);
    setPdfDoc(null);
    setPdfReflowBook(null);
    setPdfReflowWordCount(0);
    setIsBuildingPdfReflow(false);
    setToc([]);
    setPdfTextCache(null);
    setSearchQuery('');
    setActiveSearchMatch(null);
    setFocusedHighlightId(null);
    setHeaderRevealed(true);
    setBottomRevealed(true);
    const pendingJump =
      jumpRequestRef.current?.bookId === book.id ? jumpRequestRef.current : null;
    const startUnit =
      pendingJump?.unitIndex ??
      book.currentLocation?.unitIndex ??
      (book.format === 'pdf' ? 1 : 0);
    const startRatio =
      pendingJump?.scrollRatio ?? book.currentLocation?.scrollRatio ?? 0;
    setUnitIndex(startUnit);
    setVoicePdfPage(startUnit);
    setTargetScrollRatio(startRatio);
    setLiveScrollRatio(startRatio);
    currentScrollRatioRef.current = startRatio;
    setTargetAnchorId(null);
    setReflowableJumpNonce(0);
    setVoiceOpen(false);
    setAudiobookExpanded(false);
    setVoiceSettingsOpen(false);
    setUserDetachedScroll(false);
    setReflowableSentences([]);
    setPdfSentencesByPage({});
    pendingPdfStartRef.current = null;
  }, [book.id]);

  const bookTitleRef = useRef(book.title);
  bookTitleRef.current = book.title;

  // Load book binary + bookmarks + highlights
  useEffect(() => {
    let active = true;
    let loadedPdf: PdfDocumentHandle | null = null;
    let cleanupUrls: string[] = [];

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [fileBlob, savedBookmarks, savedHighlights] = await Promise.all([
          libraryDb.getBookFile(book.id),
          libraryDb.getBookmarksForBook(book.id),
          libraryDb.getHighlightsForBook(book.id),
        ]);

        if (!active) return;
        setBookmarks(savedBookmarks);
        setHighlights(savedHighlights);

        if (!fileBlob) {
          throw new Error('The offline file for this book could not be found in local storage.');
        }

        const pendingJump =
          jumpRequestRef.current?.bookId === book.id ? jumpRequestRef.current : null;

        if (book.format === 'pdf') {
          const doc = await loadPdfDocument(fileBlob.data);
          if (!active) {
            await destroyPdfDocument(doc);
            return;
          }
          loadedPdf = doc;
          setPdfDoc(doc);
          const outline = await extractPdfToc(doc);
          if (!active) return;
          setToc(outline);
          const requestedUnit = pendingJump?.unitIndex ?? book.currentLocation?.unitIndex ?? 1;
          const safePage = Math.min(doc.numPages, Math.max(1, requestedUnit));
          setUnitIndex(safePage);
          setPdfJumpNonce((n) => n + 1);
          if (pendingJump) {
            lastHandledJumpNonceRef.current = pendingJump.nonce;
          }
        } else if (book.format === 'epub') {
          const parsed = await parseEpubForReading(fileBlob.data);
          if (!active) {
            parsed.cleanupUrls.forEach((u) => URL.revokeObjectURL(u));
            return;
          }
          cleanupUrls = parsed.cleanupUrls;
          setReflowable(parsed);
          setToc(parsed.toc);
          const requestedUnit = pendingJump?.unitIndex ?? book.currentLocation?.unitIndex ?? 0;
          const safeCh = Math.min(
            Math.max(0, parsed.chapters.length - 1),
            Math.max(0, requestedUnit)
          );
          setUnitIndex(safeCh);
          if (pendingJump) {
            const safeRatio = Math.min(0.99, Math.max(0, pendingJump.scrollRatio || 0));
            setTargetScrollRatio(safeRatio);
            setLiveScrollRatio(safeRatio);
            currentScrollRatioRef.current = safeRatio;
            setReflowableJumpNonce((n) => n + 1);
            lastHandledJumpNonceRef.current = pendingJump.nonce;
          }
        } else {
          const parsed = await parseMobiForReading(fileBlob.data, bookTitleRef.current);
          if (!active) return;
          setReflowable(parsed);
          setToc(parsed.toc);
          const requestedUnit = pendingJump?.unitIndex ?? book.currentLocation?.unitIndex ?? 0;
          const safeCh = Math.min(
            Math.max(0, parsed.chapters.length - 1),
            Math.max(0, requestedUnit)
          );
          setUnitIndex(safeCh);
          if (pendingJump) {
            const safeRatio = Math.min(0.99, Math.max(0, pendingJump.scrollRatio || 0));
            setTargetScrollRatio(safeRatio);
            setLiveScrollRatio(safeRatio);
            currentScrollRatioRef.current = safeRatio;
            setReflowableJumpNonce((n) => n + 1);
            lastHandledJumpNonceRef.current = pendingJump.nonce;
          }
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to open this book.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      if (loadedPdf) void destroyPdfDocument(loadedPdf);
      cleanupUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [book.id, book.format]);

  const isPdfReflow = book.format === 'pdf' && prefs.pdfViewMode === 'reflow';

  // Lazily extract reflowable paragraphs when PDF Reflow Mode is enabled
  useEffect(() => {
    if (!isPdfReflow || !pdfDoc || pdfReflowBook) return;
    let active = true;
    setIsBuildingPdfReflow(true);
    extractPdfReflowableBook(pdfDoc, book.title, book.author)
      .then(({book: extracted, extractedWordCount}) => {
        if (!active) return;
        setPdfReflowBook(extracted);
        setPdfReflowWordCount(extractedWordCount);
        setReflowableJumpNonce((n) => n + 1);
      })
      .catch(() => {
        if (!active) return;
        onNotify('Unable to extract text for reflow mode', 'error');
      })
      .finally(() => {
        if (active) setIsBuildingPdfReflow(false);
      });
    return () => {
      active = false;
    };
  }, [isPdfReflow, pdfDoc, pdfReflowBook, book.title, book.author, onNotify]);

  // Sync jump position when toggling between Original PDF and Reflow Text mode
  const prevPdfViewModeRef = useRef(prefs.pdfViewMode);
  useEffect(() => {
    if (prevPdfViewModeRef.current === prefs.pdfViewMode) return;
    prevPdfViewModeRef.current = prefs.pdfViewMode;
    if (book.format !== 'pdf') return;
    if (prefs.pdfViewMode === 'reflow') {
      setTargetScrollRatio(0);
      setReflowableJumpNonce((n) => n + 1);
    } else {
      setPdfJumpNonce((n) => n + 1);
    }
  }, [book.format, prefs.pdfViewMode]);

  // On mobile (<1024px), reader bars stay retractable via center-tap without overwriting desktop pin preferences
  const effectivePinHeader = isMobileViewport ? false : prefs.pinHeader;
  const effectivePinBottomBar = isMobileViewport ? false : prefs.pinBottomBar;

  // Reveal unpinned bars independently when pointer enters top or bottom hover zones
  const handlePointerMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isMobileViewport) return;
      if (!effectivePinHeader && e.clientY <= 56 && !headerRevealed) {
        setHeaderRevealed(true);
      }
      if (!effectivePinBottomBar && e.clientY >= window.innerHeight - 64 && !bottomRevealed) {
        setBottomRevealed(true);
      }
    },
    [isMobileViewport, effectivePinHeader, effectivePinBottomBar, headerRevealed, bottomRevealed]
  );

  const headerVisible =
    effectivePinHeader ||
    headerRevealed ||
    hoveringTopBar ||
    typographyOpen ||
    voiceSettingsOpen ||
    (drawerOpen && (isMobileViewport || !prefs.pinLeftSidebar)) ||
    loading ||
    Boolean(error);

  const bottomBarVisible =
    effectivePinBottomBar || bottomRevealed || hoveringBottomBar;

  // Floating overlay states (only true when a bar is UNPINNED and currently floating over the workspace)
  const topOverlayActive = !effectivePinHeader && headerVisible;
  const bottomOverlayActive = !effectivePinBottomBar && bottomBarVisible;

  const handleScrollDirection = useCallback(
    (dir: 'up' | 'down') => {
      if (dir === 'down') {
        if (!effectivePinHeader) setHeaderRevealed(false);
        if (!effectivePinBottomBar) setBottomRevealed(false);
      } else {
        if (!effectivePinHeader) setHeaderRevealed(true);
        if (!effectivePinBottomBar) setBottomRevealed(true);
      }
    },
    [effectivePinHeader, effectivePinBottomBar]
  );

  const handleCenterTap = useCallback(() => {
    if (effectivePinHeader && effectivePinBottomBar) return;
    const anyUnpinnedVisible =
      (!effectivePinHeader && headerRevealed) || (!effectivePinBottomBar && bottomRevealed);
    const next = !anyUnpinnedVisible;
    if (!effectivePinHeader) setHeaderRevealed(next);
    if (!effectivePinBottomBar) setBottomRevealed(next);
  }, [effectivePinHeader, effectivePinBottomBar, headerRevealed, bottomRevealed]);

  // Compute word-count & virtual page reading metrics for reflowable books (or PDF Reflow mode)
  const reflowableMetrics = useMemo(() => {
    const src = isPdfReflow ? pdfReflowBook : reflowable;
    if (!src) return null;
    return computeReflowableMetrics(src.chapters);
  }, [isPdfReflow, pdfReflowBook, reflowable]);

  const pdfReflowHighlights = useMemo(
    () => highlights.map((h) => ({...h, unitIndex: Math.max(0, h.unitIndex - 1)})),
    [highlights]
  );

  const totalUnits = useMemo(() => {
    if (book.format === 'pdf') return pdfDoc?.numPages ?? book.totalUnits ?? 1;
    return reflowable?.chapters.length ?? book.totalUnits ?? 1;
  }, [book.format, book.totalUnits, pdfDoc, reflowable]);

  const currentVirtualPage = useMemo(() => {
    if (book.format === 'pdf' || !reflowableMetrics) return 1;
    return getVirtualPageAtLocation(reflowableMetrics, unitIndex, liveScrollRatio);
  }, [book.format, reflowableMetrics, unitIndex, liveScrollRatio]);

  const totalVirtualPages = reflowableMetrics?.totalVirtualPages ?? totalUnits;

  const chapterStartPages = useMemo(() => {
    if (!reflowableMetrics) return undefined;
    const map: Record<number, number> = {};
    for (const ch of reflowableMetrics.chapters) {
      map[ch.index] = ch.startVirtualPage;
    }
    return map;
  }, [reflowableMetrics]);

  const currentUnitLabel = useMemo(() => {
    if (book.format === 'pdf') return `Page ${unitIndex} of ${totalUnits}`;
    return reflowable?.chapters[unitIndex]?.title || `Section ${unitIndex + 1}`;
  }, [book.format, unitIndex, totalUnits, reflowable]);

  // Lazy PDF full-text extraction when user types a search query
  useEffect(() => {
    if (book.format !== 'pdf' || !pdfDoc) return;
    if (searchQuery.trim().length < 2 || pdfTextCache !== null) return;

    let cancelled = false;
    const extractAllPages = async () => {
      setIsIndexingPdfSearch(true);
      const texts: string[] = [];
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        if (cancelled) return;
        try {
          const page = await pdfDoc.getPage(p);
          const content = await page.getTextContent();
          const joined = content.items
            .map((it) => (it as {str?: string}).str ?? '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          texts.push(joined);
        } catch {
          texts.push('');
        }
      }
      if (!cancelled) {
        setPdfTextCache(texts);
        setIsIndexingPdfSearch(false);
      }
    };

    void extractAllPages();
    return () => {
      cancelled = true;
    };
  }, [book.format, pdfDoc, searchQuery, pdfTextCache]);

  // Compute full-text search matches
  const searchMatches = useMemo<SearchMatch[]>(() => {
    if (searchQuery.trim().length < 2) return [];
    if (book.format === 'pdf') {
      if (!pdfTextCache) return [];
      const units = pdfTextCache.map((text, idx) => ({
        unitIndex: idx + 1,
        unitLabel: `Page ${idx + 1}`,
        text,
      }));
      return searchTextUnits(units, searchQuery);
    }
    if (!reflowableMetrics) return [];
    const units = reflowableMetrics.chapters.map((ch) => ({
      unitIndex: ch.index,
      unitLabel: ch.title,
      text: ch.plainText,
    }));
    return searchTextUnits(units, searchQuery);
  }, [book.format, pdfTextCache, reflowableMetrics, searchQuery]);

  // Accurate book percentage + reading time calculations
  const {progressPct, chapterMinutesLeft, bookMinutesLeft, scrubberMarkers} = useMemo(() => {
    if (book.format === 'pdf') {
      const pct = totalUnits <= 1 ? 100 : ((unitIndex - 1) / Math.max(1, totalUnits - 1)) * 100;
      const pagesLeft = Math.max(0, totalUnits - unitIndex + 1);
      const markers: ScrubberMarker[] = toc.map((t) => ({
        unitIndex: t.unitIndex,
        label: t.title,
        pct: totalUnits <= 1 ? 0 : ((t.unitIndex - 1) / (totalUnits - 1)) * 100,
      }));
      return {
        progressPct: Math.min(100, Math.max(0, pct)),
        chapterMinutesLeft: null,
        bookMinutesLeft: pagesLeft * PDF_MINUTES_PER_PAGE,
        scrubberMarkers: markers,
      };
    }

    if (!reflowableMetrics) {
      return {
        progressPct: book.progress,
        chapterMinutesLeft: null,
        bookMinutesLeft: 1,
        scrubberMarkers: [] as ScrubberMarker[],
      };
    }

    const ch = reflowableMetrics.chapters[unitIndex] ?? reflowableMetrics.chapters[0];
    const wordsReadInChapter = Math.round(ch.wordCount * liveScrollRatio);
    const totalWordsRead = ch.startWordOffset + wordsReadInChapter;
    const pct = Math.min(100, Math.max(0, (totalWordsRead / reflowableMetrics.totalWords) * 100));
    const chapterWordsLeft = Math.max(0, ch.wordCount - wordsReadInChapter);
    const bookWordsLeft = Math.max(0, reflowableMetrics.totalWords - totalWordsRead);

    const markers: ScrubberMarker[] = reflowableMetrics.chapters.map((c) => ({
      unitIndex: c.index,
      label: c.title,
      pct: c.startPct,
    }));

    return {
      progressPct: pct,
      chapterMinutesLeft: chapterWordsLeft / WORDS_PER_MINUTE,
      bookMinutesLeft: bookWordsLeft / WORDS_PER_MINUTE,
      scrubberMarkers: markers,
    };
  }, [book.format, book.progress, totalUnits, unitIndex, toc, reflowableMetrics, liveScrollRatio]);

  const persistProgress = useCallback(
    (uIdx: number, scrollRatio: number, immediate = false) => {
      const save = () => {
        const curr = latestBookRef.current;
        let pct = 0;
        if (curr.format === 'pdf') {
          pct = totalUnits <= 1 ? 100 : Math.min(100, Math.max(1, Math.round((uIdx / totalUnits) * 100)));
        } else if (reflowableMetrics) {
          const ch = reflowableMetrics.chapters[uIdx] ?? reflowableMetrics.chapters[0];
          const readWords = ch.startWordOffset + ch.wordCount * scrollRatio;
          pct = Math.min(100, Math.max(1, Math.round((readWords / reflowableMetrics.totalWords) * 100)));
        } else {
          pct = Math.min(100, Math.max(1, Math.round(((uIdx + scrollRatio) / Math.max(1, totalUnits)) * 100)));
        }

        const status = pct >= 98 ? 'finished' : 'reading';
        const updated: BookRecord = {
          ...curr,
          totalUnits,
          progress: pct,
          status,
          lastReadAt: Date.now(),
          currentLocation: {
            unitIndex: uIdx,
            scrollRatio,
            label:
              curr.format === 'pdf'
                ? `Page ${uIdx}`
                : reflowable?.chapters[uIdx]?.title || `Section ${uIdx + 1}`,
          },
        };
        onBookProgressUpdate(updated);
      };

      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      if (immediate) {
        save();
      } else {
        saveTimeoutRef.current = window.setTimeout(save, 500);
      }
    },
    [onBookProgressUpdate, reflowable, reflowableMetrics, totalUnits]
  );

  const handleJumpToUnit = useCallback(
    (nextUnit: number, scrollRatio = 0, isUserScroll = false, anchorId?: string) => {
      setUnitIndex(nextUnit);
      if (book.format === 'pdf' && !isPdfReflow) {
        if (!isUserScroll) {
          setPdfJumpNonce((n) => n + 1);
        }
        persistProgress(nextUnit, 0, !isUserScroll);
      } else {
        setLiveScrollRatio(scrollRatio);
        currentScrollRatioRef.current = scrollRatio;
        if (!isUserScroll) {
          setTargetScrollRatio(scrollRatio);
          setTargetAnchorId(anchorId ?? null);
          setReflowableJumpNonce((n) => n + 1);
        }
        persistProgress(nextUnit, scrollRatio, !isUserScroll);
      }
    },
    [book.format, isPdfReflow, persistProgress]
  );

  const buildLocationBadge = useCallback(
    (uIdx: number, ratio: number): string => {
      if (book.format === 'pdf') {
        return `Page ${uIdx}`;
      }
      const chTitle =
        reflowable?.chapters[uIdx]?.title ||
        reflowableMetrics?.chapters[uIdx]?.title ||
        `Section ${uIdx + 1}`;
      if (reflowableMetrics) {
        const vPage = getVirtualPageAtLocation(reflowableMetrics, uIdx, ratio);
        return `${chTitle} · p. ${vPage}`;
      }
      return chTitle;
    },
    [book.format, reflowable, reflowableMetrics],
  );

  const currentLocationBadge = useMemo(
    () => buildLocationBadge(unitIndex, liveScrollRatio),
    [buildLocationBadge, unitIndex, liveScrollRatio],
  );

  // Consume deep-link jumps from Note cards / DetailSheet even when the book is already open
  useEffect(() => {
    if (loading || error || !jumpRequest) return;
    if (jumpRequest.bookId !== book.id) return;
    if (lastHandledJumpNonceRef.current === jumpRequest.nonce) return;

    const ready = book.format === 'pdf' ? Boolean(pdfDoc) : Boolean(reflowable);
    if (!ready) return;

    lastHandledJumpNonceRef.current = jumpRequest.nonce;
    const clampedUnit =
      book.format === 'pdf'
        ? Math.min(Math.max(1, totalUnits), Math.max(1, jumpRequest.unitIndex || 1))
        : Math.min(Math.max(0, totalUnits - 1), Math.max(0, jumpRequest.unitIndex || 0));
    const clampedRatio = Math.min(0.99, Math.max(0, jumpRequest.scrollRatio || 0));

    handleJumpToUnit(clampedUnit, clampedRatio, false);
    onNotify(`Jumped to ${buildLocationBadge(clampedUnit, clampedRatio)}`, 'info');
  }, [
    loading,
    error,
    jumpRequest,
    book.id,
    book.format,
    pdfDoc,
    reflowable,
    totalUnits,
    handleJumpToUnit,
    buildLocationBadge,
    onNotify,
  ]);

  // Active narration sentences for current unit (EPUB/MOBI/PDF-Reflow chapter or Original PDF page)
  const useReflowableNarration = book.format !== 'pdf' || isPdfReflow;
  const activeNarrationUnit = useReflowableNarration ? unitIndex : voicePdfPage;
  const activeNarrationSentences = useMemo(() => {
    if (!useReflowableNarration) {
      return pdfSentencesByPage[voicePdfPage] ?? [];
    }
    return reflowableSentences;
  }, [useReflowableNarration, pdfSentencesByPage, voicePdfPage, reflowableSentences]);

  const handleAdvanceVoiceUnit = useCallback(
    (dir: 'prev' | 'next'): boolean => {
      if (book.format === 'pdf' && !isPdfReflow) {
        const nextPage = dir === 'next' ? voicePdfPage + 1 : voicePdfPage - 1;
        if (nextPage < 1 || nextPage > totalUnits) return false;
        setVoicePdfPage(nextPage);
        setUserDetachedScroll(false);
        handleJumpToUnit(nextPage, 0, false);
        return true;
      }
      if (book.format === 'pdf' && isPdfReflow) {
        const nextPage = dir === 'next' ? unitIndex + 1 : unitIndex - 1;
        if (nextPage < 1 || nextPage > totalUnits) return false;
        setUserDetachedScroll(false);
        handleJumpToUnit(nextPage, 0, false);
        return true;
      }
      const nextCh = dir === 'next' ? unitIndex + 1 : unitIndex - 1;
      if (nextCh < 0 || nextCh >= totalUnits) return false;
      setUserDetachedScroll(false);
      handleJumpToUnit(nextCh, 0, false);
      return true;
    },
    [book.format, isPdfReflow, voicePdfPage, unitIndex, totalUnits, handleJumpToUnit]
  );

  const narrator = useAudiobookNarrator({
    bookId: book.id,
    unitIndex: activeNarrationUnit,
    sentences: activeNarrationSentences,
    settings: voiceSettings,
    onAdvanceUnit: handleAdvanceVoiceUnit,
    onNotify,
  });

  // Coordinate audio with Kanso Streamer when Audiobook narration starts
  useEffect(() => {
    if (narrator.status === 'playing') {
      onNarrationStart?.();
    }
  }, [narrator.status, onNarrationStart]);

  // Ctrl+F / Cmd+F opens or focuses Search; Escape dismisses open overlays or unpinned drawer
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setHeaderRevealed(true);
        setDrawerTab('search');
        setDrawerOpen(true);
        return;
      }
      if (e.key === 'Escape') {
        if (typographyOpen) {
          setTypographyOpen(false);
        }
        if (voiceSettingsOpen) {
          narrator.stopPreview();
          setVoiceSettingsOpen(false);
        }
        if (drawerOpen && (isMobileViewport || !prefs.pinLeftSidebar)) {
          setDrawerOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    typographyOpen,
    voiceSettingsOpen,
    drawerOpen,
    isMobileViewport,
    prefs.pinLeftSidebar,
    narrator.stopPreview,
  ]);

  // Trigger deferred PDF sentence play once the target PDF page's sentences arrive
  useEffect(() => {
    const pending = pendingPdfStartRef.current;
    if (!pending || useReflowableNarration) return;
    if (pending.page !== voicePdfPage) return;
    const sents = pdfSentencesByPage[pending.page];
    if (!sents || sents.length === 0) return;
    pendingPdfStartRef.current = null;
    narrator.playFrom(Math.min(sents.length - 1, Math.max(0, pending.sentenceIndex)));
  }, [useReflowableNarration, voicePdfPage, pdfSentencesByPage, narrator.playFrom]);

  // Voice keyboard controls (Space to toggle play/pause, [ and ] to step sentence) when player open
  useEffect(() => {
    if (!voiceOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      if (e.code === 'Space') {
        e.preventDefault();
        const fallback = !useReflowableNarration
          ? 0
          : reflowableNavRef.current?.getFirstVisibleSentenceIndex() ?? 0;
        narrator.togglePlay(fallback);
      } else if (e.key === '[') {
        e.preventDefault();
        setUserDetachedScroll(false);
        narrator.stepSentence(-1);
      } else if (e.key === ']') {
        e.preventDefault();
        setUserDetachedScroll(false);
        narrator.stepSentence(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [voiceOpen, useReflowableNarration, narrator]);

  const handleToggleVoiceMode = useCallback(() => {
    if (voiceOpen) {
      narrator.stop();
      setVoiceOpen(false);
      setAudiobookExpanded(false);
      setVoiceSettingsOpen(false);
      setUserDetachedScroll(false);
      return;
    }

    setVoiceOpen(true);
    setUserDetachedScroll(false);
    setTypographyOpen(false);

    if (!useReflowableNarration) {
      setVoicePdfPage(unitIndex);
      const sents = pdfSentencesByPage[unitIndex];
      if (sents && sents.length > 0) {
        narrator.playFrom(0);
      } else {
        pendingPdfStartRef.current = {page: unitIndex, sentenceIndex: 0};
      }
    } else {
      const startIdx = reflowableNavRef.current?.getFirstVisibleSentenceIndex() ?? 0;
      narrator.playFrom(startIdx);
    }
  }, [voiceOpen, narrator, useReflowableNarration, unitIndex, pdfSentencesByPage]);

  const handlePdfPageSentencesReady = useCallback(
    (pageNum: number, sents: NarrationSentence[]) => {
      setPdfSentencesByPage((prev) => {
        if (prev[pageNum] === sents) return prev;
        return {...prev, [pageNum]: sents};
      });
    },
    []
  );

  const handleTapReflowableSentence = useCallback(
    (sentenceIdx: number, targetChapterIdx?: number) => {
      setUserDetachedScroll(false);
      if (!voiceOpen) setVoiceOpen(true);
      if (targetChapterIdx !== undefined) {
        const mappedUnit = book.format === 'pdf' ? targetChapterIdx + 1 : targetChapterIdx;
        if (mappedUnit !== unitIndex) {
          handleJumpToUnit(mappedUnit, 0, true);
        }
      }
      narrator.playFrom(sentenceIdx);
    },
    [voiceOpen, book.format, unitIndex, handleJumpToUnit, narrator]
  );

  const handleTapPdfSentence = useCallback(
    (pageNum: number, sentenceIdx: number) => {
      setUserDetachedScroll(false);
      if (!voiceOpen) setVoiceOpen(true);
      if (pageNum === voicePdfPage && (pdfSentencesByPage[pageNum]?.length ?? 0) > 0) {
        narrator.playFrom(sentenceIdx);
      } else {
        setVoicePdfPage(pageNum);
        pendingPdfStartRef.current = {page: pageNum, sentenceIndex: sentenceIdx};
      }
    },
    [voiceOpen, voicePdfPage, pdfSentencesByPage, narrator]
  );

  const handleRecenterToVoice = useCallback(() => {
    setUserDetachedScroll(false);
    if (!useReflowableNarration && voicePdfPage !== unitIndex) {
      handleJumpToUnit(voicePdfPage, 0, false);
    }
    setRecenterNonce((n) => n + 1);
  }, [useReflowableNarration, voicePdfPage, unitIndex, handleJumpToUnit]);

  const activeSentenceDisplayText =
    activeNarrationSentences[narrator.activeSentenceIndex]?.rawText ?? '';

  const handleScrollProgress = useCallback(
    (scrollRatio: number) => {
      currentScrollRatioRef.current = scrollRatio;
      setLiveScrollRatio(scrollRatio);
      persistProgress(unitIndex, scrollRatio, false);
    },
    [persistProgress, unitIndex]
  );

  // Scrubber resolution & jump
  const resolveScrubberLabel = useCallback(
    (pct: number): string => {
      if (book.format === 'pdf') {
        const targetPage = Math.min(
          totalUnits,
          Math.max(1, Math.round(1 + (pct / 100) * Math.max(0, totalUnits - 1)))
        );
        return `Page ${targetPage} of ${totalUnits}`;
      }
      if (!reflowableMetrics) return `${Math.round(pct)}%`;
      const targetWord = (pct / 100) * reflowableMetrics.totalWords;
      let match = reflowableMetrics.chapters[0];
      for (const ch of reflowableMetrics.chapters) {
        if (ch.startWordOffset <= targetWord) match = ch;
        else break;
      }
      const withinRatio = Math.min(
        0.98,
        Math.max(0, (targetWord - match.startWordOffset) / Math.max(1, match.wordCount))
      );
      const vPage = getVirtualPageAtLocation(reflowableMetrics, match.index, withinRatio);
      return `${match.title} · p. ${vPage}`;
    },
    [book.format, totalUnits, reflowableMetrics]
  );

  const handleScrubToPct = useCallback(
    (pct: number) => {
      if (book.format === 'pdf') {
        const targetPage = Math.min(
          totalUnits,
          Math.max(1, Math.round(1 + (pct / 100) * Math.max(0, totalUnits - 1)))
        );
        handleJumpToUnit(targetPage, 0, false);
        return;
      }
      if (!reflowableMetrics) return;
      const targetWord = (pct / 100) * reflowableMetrics.totalWords;
      let target = reflowableMetrics.chapters[0];
      for (const ch of reflowableMetrics.chapters) {
        if (ch.startWordOffset <= targetWord) target = ch;
        else break;
      }
      const withinRatio = Math.min(
        0.98,
        Math.max(0, (targetWord - target.startWordOffset) / Math.max(1, target.wordCount))
      );
      handleJumpToUnit(target.index, withinRatio);
    },
    [book.format, totalUnits, reflowableMetrics, handleJumpToUnit]
  );

  // Search jump handlers
  const handleSelectSearchMatch = useCallback(
    (match: SearchMatch) => {
      setActiveSearchMatch(match);
      setSearchJumpNonce((n) => n + 1);
      handleJumpToUnit(match.unitIndex, 0, false);
    },
    [handleJumpToUnit]
  );

  const handleStepSearchMatch = useCallback(
    (dir: 1 | -1) => {
      if (searchMatches.length === 0) return;
      const currIdx = activeSearchMatch
        ? searchMatches.findIndex((m) => m.id === activeSearchMatch.id)
        : -1;
      const nextIdx =
        currIdx === -1
          ? dir === 1
            ? 0
            : searchMatches.length - 1
          : (currIdx + dir + searchMatches.length) % searchMatches.length;
      const next = searchMatches[nextIdx];
      setActiveSearchMatch(next);
      setSearchJumpNonce((n) => n + 1);
      handleJumpToUnit(next.unitIndex, 0, false);
    },
    [searchMatches, activeSearchMatch, handleJumpToUnit]
  );

  // Page-level Bookmarks
  const findBookmarkAtCurrentLocation = useCallback(
    (ratio: number): BookmarkRecord | undefined => {
      if (book.format === 'pdf' && !isPdfReflow) {
        return bookmarks.find((b) => b.unitIndex === unitIndex);
      }
      const chPages = !isPdfReflow
        ? reflowableMetrics?.chapters[unitIndex]?.virtualPageCount ?? 1
        : 1;
      const tolerance = isPdfReflow
        ? 0.16
        : Math.min(0.14, Math.max(0.03, 0.85 / Math.max(1, chPages)));

      let bestMatch: BookmarkRecord | undefined;
      let bestDist = Infinity;
      for (const b of bookmarks) {
        if (b.unitIndex !== unitIndex) continue;
        const dist = Math.abs((b.scrollRatio ?? 0) - ratio);
        if (dist <= tolerance && dist < bestDist) {
          bestDist = dist;
          bestMatch = b;
        }
      }
      return bestMatch;
    },
    [bookmarks, book.format, isPdfReflow, unitIndex, reflowableMetrics]
  );

  const currentBookmark = useMemo(
    () => findBookmarkAtCurrentLocation(liveScrollRatio),
    [findBookmarkAtCurrentLocation, liveScrollRatio]
  );
  const isCurrentUnitBookmarked = Boolean(currentBookmark);

  const bookmarkMarkers = useMemo<ScrubberBookmarkMarker[]>(() => {
    if (bookmarks.length === 0) return [];
    if (book.format === 'pdf') {
      return bookmarks.map((bm) => ({
        id: bm.id,
        label: bm.label,
        pct:
          totalUnits <= 1
            ? 0
            : Math.min(100, Math.max(0, ((bm.unitIndex - 1) / Math.max(1, totalUnits - 1)) * 100)),
      }));
    }
    if (!reflowableMetrics) return [];
    return bookmarks.map((bm) => {
      const ch = reflowableMetrics.chapters[bm.unitIndex] ?? reflowableMetrics.chapters[0];
      const wordsAtBm = ch.startWordOffset + ch.wordCount * (bm.scrollRatio ?? 0);
      const pct = Math.min(100, Math.max(0, (wordsAtBm / Math.max(1, reflowableMetrics.totalWords)) * 100));
      return {
        id: bm.id,
        label: bm.label,
        pct,
      };
    });
  }, [bookmarks, book.format, totalUnits, reflowableMetrics]);

  const handleToggleBookmark = async () => {
    const ratio = currentScrollRatioRef.current;
    const existing = findBookmarkAtCurrentLocation(ratio);
    if (existing) {
      await libraryDb.deleteBookmark(existing.id);
      setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
      onAnnotationsChange?.();
      onNotify('Bookmark removed', 'info');
      return;
    }

    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `bm-${Date.now()}`;

    let excerpt = `Saved on page ${unitIndex} of ${totalUnits}`;
    if (book.format !== 'pdf' || isPdfReflow) {
      const metricIdx = isPdfReflow ? Math.max(0, unitIndex - 1) : unitIndex;
      const plainText = reflowableMetrics?.chapters[metricIdx]?.plainText || '';
      if (plainText) {
        let startIdx = Math.floor(plainText.length * Math.min(0.95, Math.max(0, ratio)));
        if (startIdx > 0) {
          const nextSpace = plainText.indexOf(' ', startIdx);
          if (nextSpace !== -1 && nextSpace - startIdx < 32) {
            startIdx = nextSpace + 1;
          }
        }
        const slice = plainText.slice(startIdx, startIdx + 140).trim();
        excerpt = slice || plainText.slice(0, 140).trim();
      }
    }

    const label =
      book.format === 'pdf'
        ? currentUnitLabel
        : reflowableMetrics
          ? `${currentUnitLabel} · p. ${getVirtualPageAtLocation(reflowableMetrics, unitIndex, ratio)}`
          : currentUnitLabel;

    const bm: BookmarkRecord = {
      id,
      bookId: book.id,
      unitIndex,
      scrollRatio: ratio,
      label,
      excerpt,
      createdAt: Date.now(),
    };

    await libraryDb.saveBookmark(bm);
    setBookmarks((prev) =>
      [...prev, bm].sort(
        (a, b) => a.unitIndex - b.unitIndex || (a.scrollRatio ?? 0) - (b.scrollRatio ?? 0)
      )
    );
    onAnnotationsChange?.();
    onNotify('Bookmark saved', 'success');
  };

  const handleDeleteBookmark = async (id: string) => {
    await libraryDb.deleteBookmark(id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    onAnnotationsChange?.();
  };

  // Highlights & Study Notes
  const handleCreateHighlight = async (payload: {
    unitIndex?: number;
    selectedText: string;
    prefixContext: string;
    suffixContext: string;
    color: HighlightColor;
    note: string;
  }) => {
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `hl-${Date.now()}`;

    const record: HighlightRecord = {
      id,
      bookId: book.id,
      unitIndex: payload.unitIndex ?? unitIndex,
      selectedText: payload.selectedText,
      prefixContext: payload.prefixContext,
      suffixContext: payload.suffixContext,
      color: payload.color,
      note: payload.note,
      createdAt: Date.now(),
    };

    await libraryDb.saveHighlight(record);
    setHighlights((prev) => [...prev, record]);
    onAnnotationsChange?.();
    onNotify(payload.note ? 'Highlight and note saved' : 'Highlight saved', 'success');
  };

  const handleUpdateHighlight = async (updated: HighlightRecord) => {
    await libraryDb.saveHighlight(updated);
    setHighlights((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
    onAnnotationsChange?.();
  };

  const handleDeleteHighlight = async (id: string) => {
    await libraryDb.deleteHighlight(id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    if (focusedHighlightId === id) setFocusedHighlightId(null);
    onAnnotationsChange?.();
  };

  const activeReflowableSearch =
    activeSearchMatch &&
    (book.format !== 'pdf' || isPdfReflow) &&
    searchQuery.trim().length >= 2
      ? {
          unitIndex:
            book.format === 'pdf'
              ? Math.max(0, activeSearchMatch.unitIndex - 1)
              : activeSearchMatch.unitIndex,
          query: searchQuery.trim(),
          occurrenceInUnit: activeSearchMatch.occurrenceInUnit,
          nonce: searchJumpNonce,
        }
      : null;

  const activePdfSearch =
    activeSearchMatch && book.format === 'pdf' && !isPdfReflow && searchQuery.trim().length >= 2
      ? {pageNumber: activeSearchMatch.unitIndex, query: searchQuery.trim()}
      : null;

  const topChromeContainerClass = effectivePinHeader
    ? 'relative z-30 shrink-0'
    : `absolute top-0 left-0 right-0 z-30 transition-transform duration-180 ease-out ${
        headerVisible ? 'translate-y-0' : '-translate-y-full pointer-events-none'
      }`;

  return (
    <div
      data-reader-surface={prefs.theme === 'kanso' ? undefined : prefs.theme}
      onMouseMove={handlePointerMove}
      className="h-full flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] relative overflow-hidden"
    >
      {/* Top Chrome: Docked in flex flow when pinned, retractable fixed overlay when unpinned */}
      <div
        onMouseEnter={() => setHoveringTopBar(true)}
        onMouseLeave={() => setHoveringTopBar(false)}
        className={topChromeContainerClass}
      >
        <ReaderTabStrip
          openBooks={openBooks}
          activeBookId={book.id}
          onSelectLibrary={() => {
            narrator.stop();
            persistProgress(unitIndex, currentScrollRatioRef.current, true);
            onSelectLibrary();
          }}
          onSelectBook={(id) => {
            narrator.stop();
            persistProgress(unitIndex, currentScrollRatioRef.current, true);
            onSelectBookTab(id);
          }}
          onCloseBookTab={(id) => {
            if (id === book.id) {
              narrator.stop();
              persistProgress(unitIndex, currentScrollRatioRef.current, true);
            }
            onCloseBookTab(id);
          }}
        />

        <header
          className={`h-12 px-2 sm:px-4 lg:px-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/96 backdrop-blur-xs flex items-center justify-between gap-1.5 sm:gap-3 ${
            openBooks.length === 0 ? 'pt-safe lg:pt-0' : ''
          }`}
        >
          {/* Left: Contents & Search */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setDrawerTab('toc');
                setDrawerOpen(true);
              }}
              title="Table of contents and bookmarks"
              className={`w-9 h-9 md:w-auto md:h-8 md:px-2.5 inline-flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                prefs.pinLeftSidebar && drawerTab === 'toc'
                  ? 'text-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                  : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              <List className="w-4 h-4 text-current opacity-85" />
              <span className="hidden md:inline">Contents</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDrawerTab('search');
                setDrawerOpen(true);
              }}
              title="Search inside book (Ctrl+F)"
              aria-label="Search inside book"
              className={`w-9 h-9 lg:w-auto lg:h-8 lg:px-2.5 inline-flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                searchQuery.trim().length >= 2 || (prefs.pinLeftSidebar && drawerTab === 'search')
                  ? 'text-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              <Search className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
              <span className="hidden lg:inline">Search</span>
            </button>
          </div>

          {/* Center: Book Title & Subtitle */}
          <div className="min-w-0 flex-1 text-center px-1">
            <div className="font-serif-editorial text-sm font-semibold leading-tight text-[var(--text-primary)] truncate">
              {book.title}
            </div>
            {book.subtitle?.trim() && (
              <div
                className="text-[11px] leading-tight text-[var(--text-secondary)] truncate"
                title={book.subtitle}
              >
                {book.subtitle}
              </div>
            )}
          </div>

          {/* Right: PDF Mode Toggle, Layout Switch, Study Pane, Bookmark, Typography, Theme, Pin Header */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 relative">
            {book.format === 'pdf' && (
              <button
                type="button"
                onClick={() =>
                  onUpdatePrefs({
                    pdfViewMode: isPdfReflow ? 'original' : 'reflow',
                  })
                }
                title={
                  isPdfReflow
                    ? 'Reflow Text mode — switch back to Original PDF layout'
                    : 'Original PDF layout — switch to Reflow Text mode for custom fonts & spacing'
                }
                aria-label="Toggle PDF reflow mode"
                aria-pressed={isPdfReflow}
                className={`h-9 sm:h-8 inline-flex items-center justify-center gap-1.5 px-2 lg:px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isPdfReflow
                    ? 'text-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                {isPdfReflow ? (
                  <>
                    <Type className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span className="hidden sm:inline">Reflow</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span className="hidden sm:inline">Original</span>
                  </>
                )}
              </button>
            )}

            {(book.format !== 'pdf' || isPdfReflow) && (
              <button
                type="button"
                onClick={() => {
                  const nextLayout =
                    prefs.readingLayout === 'scroll'
                      ? 'page'
                      : prefs.readingLayout === 'page'
                        ? 'spread'
                        : 'scroll';
                  onUpdatePrefs({readingLayout: nextLayout});
                }}
                title={
                  prefs.readingLayout === 'scroll'
                    ? 'Continuous Scroll — switch to Single Page'
                    : prefs.readingLayout === 'page'
                      ? 'Single Page — switch to Two-Page Spread'
                      : 'Two-Page Spread — switch to Continuous Scroll'
                }
                aria-label="Cycle reading layout mode"
                className="hidden sm:inline-flex items-center justify-center gap-1.5 w-8 h-8 xl:w-auto xl:px-2.5 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer whitespace-nowrap"
              >
                {prefs.readingLayout === 'spread' ? (
                  <>
                    <Columns2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span className="hidden xl:inline">Spread</span>
                  </>
                ) : prefs.readingLayout === 'page' ? (
                  <>
                    <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span className="hidden xl:inline">Page</span>
                  </>
                ) : (
                  <>
                    <ScrollText className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">Scroll</span>
                  </>
                )}
              </button>
            )}

            {/* Listen / Audiobook Narration Toggle */}
            <button
              type="button"
              disabled={loading || Boolean(error)}
              onClick={handleToggleVoiceMode}
              title={voiceOpen ? 'Close Audiobook Voice Reader' : 'Listen with synchronized voice narration'}
              aria-label={voiceOpen ? 'Close voice narration' : 'Start voice narration'}
              aria-pressed={voiceOpen}
              className={`w-9 h-9 md:w-auto md:h-8 md:px-2.5 inline-flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 ${
                voiceOpen
                  ? 'text-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              <Headphones className="w-4 h-4" />
              <span className="hidden md:inline">
                {narrator.status === 'playing' ? 'Listening' : 'Listen'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStudyPaneOpen((v) => !v)}
              title="Toggle side-by-side Notes & Highlights study pane"
              aria-label="Toggle Study Pane"
              className={`relative w-9 h-9 md:w-auto md:h-8 md:px-2.5 inline-flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                studyPaneOpen
                  ? 'text-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              <PanelRight className="w-4 h-4" />
              <span className="hidden md:inline">Study Notes</span>
              {bookNotes.length + highlights.length > 0 && (
                <>
                  <span className="hidden md:inline font-mono-tabular text-[11px] opacity-80">
                    {bookNotes.length + highlights.length}
                  </span>
                  <span className="md:hidden absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-mono-tabular text-[9px] font-semibold leading-[14px] text-center">
                    {bookNotes.length + highlights.length > 99
                      ? '99+'
                      : bookNotes.length + highlights.length}
                  </span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleToggleBookmark}
              title={isCurrentUnitBookmarked ? 'Remove bookmark at this position' : 'Bookmark this page'}
              aria-label={isCurrentUnitBookmarked ? 'Remove bookmark' : 'Bookmark current page'}
              className={`w-9 h-9 lg:w-8 lg:h-8 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer ${
                isCurrentUnitBookmarked
                  ? 'text-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isCurrentUnitBookmarked ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setTypographyOpen((v) => !v)}
              title="Typography and display settings"
              aria-label="Typography settings"
              className={`w-9 h-9 lg:w-8 lg:h-8 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer ${
                typographyOpen
                  ? 'text-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              <Type className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              title={`Cycle reading surface (${prefs.theme === 'kanso' ? 'Kanso → Sepia' : prefs.theme === 'sepia' ? 'Sepia → Dark' : 'Dark → Kanso'})`}
              aria-label="Cycle reading surface theme"
              className="hidden sm:inline-flex items-center justify-center w-9 h-9 lg:w-8 lg:h-8 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
            >
              {prefs.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="hidden lg:block h-4 w-px bg-[var(--border-subtle)] mx-0.5" />

            {/* Desktop Zen / Full-Width Reader Toggle */}
            {onToggleZenMode && (
              <button
                type="button"
                onClick={onToggleZenMode}
                title={zenMode ? 'Exit Zen Reader (show Kanso sidebar)' : 'Zen Reader (hide Kanso sidebar for wide spreads)'}
                aria-label={zenMode ? 'Exit Zen Reader' : 'Enter Zen Reader'}
                aria-pressed={zenMode}
                className={`hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors cursor-pointer ${
                  zenMode
                    ? 'text-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                {zenMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            )}

            {/* Independent Pin Header Toggle (Desktop lg+) */}
            <button
              type="button"
              onClick={() => {
                const next = !prefs.pinHeader;
                onUpdatePrefs({pinHeader: next});
                if (next) setHeaderRevealed(true);
              }}
              title={
                prefs.pinHeader
                  ? 'Unpin header (auto-hide on scroll)'
                  : 'Pin header in place'
              }
              aria-label={prefs.pinHeader ? 'Unpin header' : 'Pin header'}
              aria-pressed={prefs.pinHeader}
              className={`hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors cursor-pointer ${
                prefs.pinHeader
                  ? 'text-[var(--accent)] bg-[var(--bg-accent-subtle)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              <Pin className={`w-3.5 h-3.5 ${prefs.pinHeader ? 'fill-current' : ''}`} />
            </button>

            {/* Desktop Typography Dropdown Popover (lg+) — unchanged */}
            {typographyOpen && (
              <div className="hidden lg:block">
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setTypographyOpen(false)}
                />
                <div className="absolute right-0 top-11 z-40">
                  <TypographyPopover
                    format={book.format}
                    prefs={prefs}
                    onUpdate={onUpdatePrefs}
                    onReset={onResetPrefs}
                  />
                </div>
              </div>
            )}
          </div>
        </header>
      </div>

      {/* Main 3-Column Split Workspace: Docked Left Navigation · Centered Book Canvas · Docked Study Pane */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Book Navigation Sidebar (Docked when pinned on lg+, Overlay Drawer otherwise) */}
        <ReaderDrawer
          isOpen={drawerOpen}
          isPinned={prefs.pinLeftSidebar}
          topOverlayActive={topOverlayActive}
          bottomOverlayActive={bottomOverlayActive}
          activeTab={drawerTab}
          format={book.format}
          currentUnitIndex={unitIndex}
          toc={toc}
          chapterStartPages={chapterStartPages}
          bookmarks={bookmarks}
          searchQuery={searchQuery}
          searchMatches={searchMatches}
          activeSearchMatchId={activeSearchMatch?.id ?? null}
          isIndexingSearch={isIndexingPdfSearch}
          onTabChange={setDrawerTab}
          onTogglePin={() => {
            const nextPinned = !prefs.pinLeftSidebar;
            onUpdatePrefs({pinLeftSidebar: nextPinned});
            if (nextPinned) {
              setDrawerOpen(false);
            } else {
              setDrawerOpen(true);
            }
          }}
          onSearchQueryChange={(q) => {
            setSearchQuery(q);
            if (q.trim().length < 2) setActiveSearchMatch(null);
          }}
          onSelectSearchMatch={handleSelectSearchMatch}
          onStepSearchMatch={handleStepSearchMatch}
          onJumpToUnit={(uIdx, ratio, anchorId) =>
            handleJumpToUnit(uIdx, ratio ?? 0, false, anchorId)
          }
          onDeleteBookmark={(id) => void handleDeleteBookmark(id)}
          onClose={() => {
            setDrawerOpen(false);
            if (prefs.pinLeftSidebar) {
              onUpdatePrefs({pinLeftSidebar: false});
            }
          }}
        />

        {/* Center Reading Canvas (cleanly centered within the remaining space) */}
        {loading ? (
          <div className="flex-1 min-w-0 flex flex-col items-center justify-center p-8 gap-3">
            <div className="w-7 h-7 rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)] animate-spin" />
            <p className="text-xs text-[var(--text-secondary)]">Opening {book.title}...</p>
          </div>
        ) : error ? (
          <div className="flex-1 min-w-0 flex items-center justify-center p-8">
            <div className="max-w-md w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center space-y-3">
              <AlertCircle className="w-6 h-6 text-[var(--danger)] mx-auto" />
              <h2 className="font-serif-editorial text-lg font-semibold text-[var(--text-primary)]">
                Unable to open book
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{error}</p>
              <button
                type="button"
                onClick={onSelectLibrary}
                className="mt-2 px-4 py-2 text-xs font-medium rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] cursor-pointer"
              >
                Return to Library
              </button>
            </div>
          </div>
        ) : book.format === 'pdf' && pdfDoc && isPdfReflow ? (
          isBuildingPdfReflow && !pdfReflowBook ? (
            <div className="flex-1 min-w-0 flex flex-col items-center justify-center p-8 gap-3">
              <div className="w-7 h-7 rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)] animate-spin" />
              <p className="text-xs text-[var(--text-secondary)]">
                Preparing reflowable text for {book.title}...
              </p>
            </div>
          ) : pdfReflowBook ? (
            <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
              {pdfReflowWordCount === 0 && (
                <div className="shrink-0 px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] flex items-center justify-between gap-3 text-xs">
                  <span className="text-[var(--text-secondary)]">
                    No selectable text was found in this PDF (pages may be scanned images).
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdatePrefs({pdfViewMode: 'original'})}
                    className="px-2.5 py-1 rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
                  >
                    Switch to Original
                  </button>
                </div>
              )}
              <ReflowableViewport
                navRef={reflowableNavRef}
                chapters={pdfReflowBook.chapters}
                chapterIndex={Math.max(0, unitIndex - 1)}
                initialScrollRatio={targetScrollRatio}
                jumpNonce={reflowableJumpNonce}
                targetAnchorId={targetAnchorId}
                metrics={null}
                currentVirtualPage={unitIndex}
                progressPct={progressPct}
                prefs={prefs}
                allHighlights={pdfReflowHighlights}
                searchHighlight={activeReflowableSearch}
                headerPinned={effectivePinHeader}
                bottomBarPinned={effectivePinBottomBar}
                topOverlayActive={topOverlayActive}
                bottomOverlayActive={bottomOverlayActive}
                voiceActive={voiceOpen}
                voicePlaying={narrator.status === 'playing'}
                voiceTapToRead={voiceSettings.tapToRead}
                voiceSkipNoise={voiceSettings.skipNoise}
                activeSentenceIndex={narrator.activeSentenceIndex}
                activeWordIndex={narrator.activeWordIndex}
                voiceFollowEnabled={!userDetachedScroll}
                recenterNonce={recenterNonce}
                onSentencesReady={setReflowableSentences}
                onSentenceTap={handleTapReflowableSentence}
                onUserDetachedScroll={() => setUserDetachedScroll(true)}
                onChapterChange={(nextCh, ratio = 0, isUserScroll = false, anchorId) =>
                  handleJumpToUnit(nextCh + 1, ratio, isUserScroll, anchorId)
                }
                onScrollProgress={handleScrollProgress}
                onCreateHighlight={(payload) =>
                  handleCreateHighlight({
                    ...payload,
                    unitIndex: (payload.unitIndex ?? Math.max(0, unitIndex - 1)) + 1,
                  })
                }
                onUpdateHighlight={(updated) =>
                  void handleUpdateHighlight({...updated, unitIndex: updated.unitIndex + 1})
                }
                onDeleteHighlight={(id) => void handleDeleteHighlight(id)}
                onSendToNotes={
                  onSendHighlightToNotes
                    ? (excerpt, _loc, hlUnit) => {
                        const targetUnit = (hlUnit ?? Math.max(0, unitIndex - 1)) + 1;
                        onSendHighlightToNotes(
                          book.title,
                          excerpt,
                          `Page ${targetUnit}`,
                          {
                            bookId: book.id,
                            bookTitle: book.title,
                            bookAuthor: book.author,
                            bookFormat: book.format,
                            unitIndex: targetUnit,
                            scrollRatio: 0,
                            locationLabel: `Page ${targetUnit}`,
                            quote: excerpt.slice(0, 280),
                          },
                        );
                      }
                    : undefined
                }
                onFocusHighlight={(hlId) => {
                  setFocusedHighlightId(hlId);
                  setStudyPaneOpen(true);
                }}
                onScrollDirection={handleScrollDirection}
                onCenterTap={handleCenterTap}
              />
            </div>
          ) : null
        ) : book.format === 'pdf' && pdfDoc ? (
          <PdfViewport
            pdf={pdfDoc}
            pageNumber={unitIndex}
            jumpNonce={pdfJumpNonce}
            prefs={prefs}
            headerPinned={effectivePinHeader}
            bottomBarPinned={effectivePinBottomBar}
            searchHighlight={activePdfSearch}
            voiceActive={voiceOpen}
            voicePlaying={narrator.status === 'playing'}
            voiceTapToRead={voiceSettings.tapToRead}
            voiceSkipNoise={voiceSettings.skipNoise}
            activeVoicePage={voicePdfPage}
            activeSentenceIndex={narrator.activeSentenceIndex}
            activeWordIndex={narrator.activeWordIndex}
            voiceFollowEnabled={!userDetachedScroll}
            recenterNonce={recenterNonce}
            onPageSentencesReady={handlePdfPageSentencesReady}
            onSentenceTap={handleTapPdfSentence}
            onUserDetachedScroll={() => setUserDetachedScroll(true)}
            onPageChange={(nextPage, isUserScroll) => handleJumpToUnit(nextPage, 0, isUserScroll)}
            onCreateHighlight={handleCreateHighlight}
            onScrollDirection={handleScrollDirection}
            onCenterTap={handleCenterTap}
          />
        ) : reflowable ? (
          <ReflowableViewport
            navRef={reflowableNavRef}
            chapters={reflowable.chapters}
            chapterIndex={unitIndex}
            initialScrollRatio={targetScrollRatio}
            jumpNonce={reflowableJumpNonce}
            targetAnchorId={targetAnchorId}
            metrics={reflowableMetrics}
            currentVirtualPage={currentVirtualPage}
            progressPct={progressPct}
            prefs={prefs}
            allHighlights={highlights}
            searchHighlight={activeReflowableSearch}
            headerPinned={effectivePinHeader}
            bottomBarPinned={effectivePinBottomBar}
            topOverlayActive={topOverlayActive}
            bottomOverlayActive={bottomOverlayActive}
            voiceActive={voiceOpen}
            voicePlaying={narrator.status === 'playing'}
            voiceTapToRead={voiceSettings.tapToRead}
            voiceSkipNoise={voiceSettings.skipNoise}
            activeSentenceIndex={narrator.activeSentenceIndex}
            activeWordIndex={narrator.activeWordIndex}
            voiceFollowEnabled={!userDetachedScroll}
            recenterNonce={recenterNonce}
            onSentencesReady={setReflowableSentences}
            onSentenceTap={handleTapReflowableSentence}
            onUserDetachedScroll={() => setUserDetachedScroll(true)}
            onChapterChange={(nextCh, ratio = 0, isUserScroll = false, anchorId) =>
              handleJumpToUnit(nextCh, ratio, isUserScroll, anchorId)
            }
            onScrollProgress={handleScrollProgress}
            onCreateHighlight={handleCreateHighlight}
            onUpdateHighlight={(updated) => void handleUpdateHighlight(updated)}
            onDeleteHighlight={(id) => void handleDeleteHighlight(id)}
            onSendToNotes={
              onSendHighlightToNotes
                ? (excerpt, _loc, hlUnit) => {
                    const targetUnit = hlUnit ?? unitIndex;
                    const ratio = targetUnit === unitIndex ? liveScrollRatio : 0;
                    const badge = buildLocationBadge(targetUnit, ratio);
                    onSendHighlightToNotes(book.title, excerpt, badge, {
                      bookId: book.id,
                      bookTitle: book.title,
                      bookAuthor: book.author,
                      bookFormat: book.format,
                      unitIndex: targetUnit,
                      scrollRatio: ratio,
                      locationLabel: badge,
                      quote: excerpt.slice(0, 280),
                    });
                  }
                : undefined
            }
            onFocusHighlight={(hlId) => {
              setFocusedHighlightId(hlId);
              setStudyPaneOpen(true);
            }}
            onScrollDirection={handleScrollDirection}
            onCenterTap={handleCenterTap}
          />
        ) : null}

        {/* Docked Side-by-Side Split Study Pane (Desktop) / Slide-Up Sheet (Mobile) */}
        <StudyPane
          isOpen={studyPaneOpen}
          topOverlayActive={topOverlayActive}
          bottomOverlayActive={bottomOverlayActive}
          book={book}
          format={book.format}
          currentUnitIndex={unitIndex}
          currentScrollRatio={liveScrollRatio}
          currentUnitLabel={currentUnitLabel}
          currentLocationBadge={currentLocationBadge}
          highlights={highlights}
          bookNotes={bookNotes}
          focusedHighlightId={focusedHighlightId}
          onJumpToUnit={(uIdx, ratio = 0) => handleJumpToUnit(uIdx, ratio, false)}
          onCreateBookNote={(payload) => onCreateBookNote?.(payload) ?? null}
          onDeleteBookNote={(noteId) => onDeleteBookNote?.(noteId)}
          onExpandNoteToDetail={(noteId) => onOpenNoteDetail?.(noteId)}
          onUpdateHighlight={(updated) => void handleUpdateHighlight(updated)}
          onDeleteHighlight={(id) => void handleDeleteHighlight(id)}
          onSendToNotes={
            onSendHighlightToNotes
              ? (excerpt, _loc, hlUnit) => {
                  const targetUnit =
                    hlUnit ?? unitIndex;
                  const ratio = targetUnit === unitIndex ? liveScrollRatio : 0;
                  const badge = buildLocationBadge(targetUnit, ratio);
                  onSendHighlightToNotes(book.title, excerpt, badge, {
                    bookId: book.id,
                    bookTitle: book.title,
                    bookAuthor: book.author,
                    bookFormat: book.format,
                    unitIndex: targetUnit,
                    scrollRatio: ratio,
                    locationLabel: badge,
                    quote: excerpt.slice(0, 280),
                  });
                }
              : undefined
          }
          onClose={() => setStudyPaneOpen(false)}
        />
      </div>

      {/* Mobile Typography Bottom Sheet (<lg) */}
      {isMobileViewport && (
        <BottomSheet
          isOpen={typographyOpen}
          onClose={() => setTypographyOpen(false)}
          title="Typography & Display"
          ariaLabel="Reader appearance settings"
        >
          <TypographyPopover
            format={book.format}
            prefs={prefs}
            embeddedInSheet
            onUpdate={onUpdatePrefs}
            onReset={onResetPrefs}
          />
        </BottomSheet>
      )}

      {/* Voice Settings Popover (Desktop lg+) */}
      {voiceSettingsOpen && !isMobileViewport && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              narrator.stopPreview();
              setVoiceSettingsOpen(false);
            }}
          />
          <div className="fixed right-5 bottom-24 z-50">
            <VoiceSettingsPanel
              settings={voiceSettings}
              deviceVoices={narrator.deviceVoices}
              hasBookOverride={hasBookVoiceOverride}
              previewingVoiceUri={narrator.previewingVoiceUri}
              onUpdateBookVoice={updateBookVoice}
              onUpdateGlobalOption={updateGlobalVoiceOption}
              onResetBookOverride={clearBookOverride}
              onPreviewVoice={(voiceUri, tone, rate) =>
                narrator.previewVoice(voiceUri, tone, rate)
              }
            />
          </div>
        </>
      )}

      {/* Voice Settings Bottom Sheet (Mobile <lg) */}
      {isMobileViewport && (
        <BottomSheet
          isOpen={voiceSettingsOpen}
          onClose={() => {
            narrator.stopPreview();
            setVoiceSettingsOpen(false);
          }}
          title="Offline Narrator & Voice"
          ariaLabel="Narrator and voice settings"
        >
          <VoiceSettingsPanel
            settings={voiceSettings}
            deviceVoices={narrator.deviceVoices}
            hasBookOverride={hasBookVoiceOverride}
            previewingVoiceUri={narrator.previewingVoiceUri}
            embeddedInSheet
            onUpdateBookVoice={updateBookVoice}
            onUpdateGlobalOption={updateGlobalVoiceOption}
            onResetBookOverride={clearBookOverride}
            onPreviewVoice={(voiceUri, tone, rate) => narrator.previewVoice(voiceUri, tone, rate)}
          />
        </BottomSheet>
      )}

      {/* Compact Docked Audiobook Player Bar */}
      {!loading && !error && voiceOpen && !audiobookExpanded && (
        <AudiobookPlayerBar
          status={narrator.status}
          errorMessage={narrator.errorMessage}
          activeSentenceText={activeSentenceDisplayText}
          activeSentenceIndex={narrator.activeSentenceIndex}
          totalSentences={activeNarrationSentences.length}
          settings={voiceSettings}
          activeVoiceName={narrator.activeVoiceName}
          sleepTimerMode={narrator.sleepTimerMode}
          sleepSecondsLeft={narrator.sleepSecondsLeft}
          userDetachedScroll={userDetachedScroll}
          scrubberVisible={bottomBarVisible}
          scrubberPinned={effectivePinBottomBar}
          voiceSettingsOpen={voiceSettingsOpen}
          onTogglePlay={() => {
            const fallback = !useReflowableNarration
              ? 0
              : reflowableNavRef.current?.getFirstVisibleSentenceIndex() ?? 0;
            narrator.togglePlay(fallback);
          }}
          onStepSentence={(delta) => {
            setUserDetachedScroll(false);
            narrator.stepSentence(delta);
          }}
          onSkipSeconds={(sec) => {
            setUserDetachedScroll(false);
            narrator.skipSeconds(sec);
          }}
          onUpdateRate={(rate) => updateBookVoice({rate})}
          onSelectSleepTimer={narrator.setSleepTimerMode}
          onToggleVoiceSettings={() => setVoiceSettingsOpen((v) => !v)}
          onRecenterToVoice={handleRecenterToVoice}
          onExpandAudiobook={() => {
            setVoiceSettingsOpen(false);
            setAudiobookExpanded(true);
          }}
          onClose={() => {
            narrator.stop();
            setVoiceOpen(false);
            setVoiceSettingsOpen(false);
            setUserDetachedScroll(false);
          }}
          onMouseEnter={() => setHoveringBottomBar(true)}
          onMouseLeave={() => setHoveringBottomBar(false)}
        />
      )}

      {/* Full-Screen Expandable Audiobook Studio View */}
      {!loading && !error && voiceOpen && audiobookExpanded && (
        <AudiobookExpandedView
          book={book}
          unitLabel={
            !useReflowableNarration
              ? `Page ${voicePdfPage} of ${totalUnits}`
              : currentUnitLabel
          }
          sentences={activeNarrationSentences}
          activeSentenceIndex={narrator.activeSentenceIndex}
          activeWordIndex={narrator.activeWordIndex}
          status={narrator.status}
          errorMessage={narrator.errorMessage}
          settings={voiceSettings}
          activeVoiceName={narrator.activeVoiceName}
          sleepTimerMode={narrator.sleepTimerMode}
          sleepSecondsLeft={narrator.sleepSecondsLeft}
          onTogglePlay={() => narrator.togglePlay(narrator.activeSentenceIndex)}
          onJumpToSentence={(idx) => {
            setUserDetachedScroll(false);
            narrator.playFrom(idx);
          }}
          onStepSentence={(delta) => {
            setUserDetachedScroll(false);
            narrator.stepSentence(delta);
          }}
          onSkipSeconds={(sec) => {
            setUserDetachedScroll(false);
            narrator.skipSeconds(sec);
          }}
          onUpdateRate={(rate) => updateBookVoice({rate})}
          onSelectSleepTimer={narrator.setSleepTimerMode}
          onOpenVoiceSettings={() => setVoiceSettingsOpen(true)}
          onCollapse={() => setAudiobookExpanded(false)}
        />
      )}

      {/* Bottom Scrubber: Docked flex footer when pinned, retractable fixed overlay when unpinned */}
      {!loading && !error && (
        <ReaderScrubber
          visible={bottomBarVisible}
          isPinned={effectivePinBottomBar}
          onTogglePin={() => {
            const next = !prefs.pinBottomBar;
            onUpdatePrefs({pinBottomBar: next});
            if (next) setBottomRevealed(true);
          }}
          format={book.format}
          progressPct={progressPct}
          currentLabel={currentUnitLabel}
          virtualPageLabel={
            book.format !== 'pdf' && reflowableMetrics
              ? `Page ${currentVirtualPage} of ${totalVirtualPages}`
              : undefined
          }
          compactVirtualPageLabel={
            book.format !== 'pdf' && reflowableMetrics
              ? `${currentVirtualPage}/${totalVirtualPages}`
              : undefined
          }
          chapterMinutesLeft={chapterMinutesLeft}
          bookMinutesLeft={bookMinutesLeft}
          markers={scrubberMarkers}
          bookmarkMarkers={bookmarkMarkers}
          canStepPrev={
            book.format === 'pdf'
              ? unitIndex > 1 ||
                (isPdfReflow &&
                  (prefs.readingLayout === 'page' || prefs.readingLayout === 'spread'))
              : unitIndex > 0 ||
                prefs.readingLayout === 'page' ||
                prefs.readingLayout === 'spread'
          }
          canStepNext={
            book.format === 'pdf'
              ? unitIndex < totalUnits ||
                (isPdfReflow &&
                  (prefs.readingLayout === 'page' || prefs.readingLayout === 'spread'))
              : unitIndex < totalUnits - 1 ||
                prefs.readingLayout === 'page' ||
                prefs.readingLayout === 'spread'
          }
          onStepPrev={() => {
            if (book.format === 'pdf' && !isPdfReflow) {
              if (unitIndex > 1) handleJumpToUnit(unitIndex - 1, 0, false);
            } else {
              reflowableNavRef.current?.stepPrev();
            }
          }}
          onStepNext={() => {
            if (book.format === 'pdf' && !isPdfReflow) {
              if (unitIndex < totalUnits) handleJumpToUnit(unitIndex + 1, 0, false);
            } else {
              reflowableNavRef.current?.stepNext();
            }
          }}
          onScrubToPct={handleScrubToPct}
          onResolvePctLabel={resolveScrubberLabel}
          onMouseEnter={() => setHoveringBottomBar(true)}
          onMouseLeave={() => setHoveringBottomBar(false)}
        />
      )}
    </div>
  );
};
