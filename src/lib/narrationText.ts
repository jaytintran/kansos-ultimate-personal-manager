export interface NarrationWord {
  index: number;
  text: string;
  startInSentence: number;
  endInSentence: number;
}

export interface PdfSpanMeta {
  spanIndex: number;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PdfSentenceSegment {
  spanIndex: number;
  startInSpan: number;
  endInSpan: number;
  startInSentence: number;
  endInSentence: number;
}

export interface NarrationSentence {
  index: number;
  unitIndex: number;
  rawText: string;
  spokenText: string;
  words: NarrationWord[];
  estimatedSec: number;
  domStartOffset?: number;
  domEndOffset?: number;
  pdfSegments?: PdfSentenceSegment[];
}

function tokenizeWords(text: string): NarrationWord[] {
  const words: NarrationWord[] = [];
  const regex = /\S+/g;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = regex.exec(text)) !== null) {
    words.push({
      index: idx++,
      text: m[0],
      startInSentence: m.index,
      endInSentence: m.index + m[0].length,
    });
  }
  return words;
}

function splitIntoSentences(text: string): Array<{text: string; start: number; end: number}> {
  const results: Array<{text: string; start: number; end: number}> = [];
  // Match sentence segments terminated by . ! ? or end of text / line breaks
  const regex = /[^.!?\n]+(?:[.!?]+["'”’)\]]*|\n+|$)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const raw = m[0];
    const leadTrim = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const start = m.index + leadTrim;
    const end = start + trimmed.length;

    // Split overly long sentences cleanly near ~260 chars for responsive speech synthesis
    if (trimmed.length > 320) {
      const chunks = trimmed.match(/.{1,240}(?:\s+|$)/g) ?? [trimmed];
      let cursor = start;
      for (const ch of chunks) {
        const piece = ch.trim();
        if (!piece) {
          cursor += ch.length;
          continue;
        }
        const offsetInChunk = ch.indexOf(piece);
        results.push({
          text: piece,
          start: cursor + offsetInChunk,
          end: cursor + offsetInChunk + piece.length,
        });
        cursor += ch.length;
      }
    } else {
      results.push({text: trimmed, start, end});
    }
  }
  return results;
}

function collectEligibleTextNodes(
  container: HTMLElement,
  skipNoise: boolean
): Array<{node: Text; start: number; end: number}> {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const out: Array<{node: Text; start: number; end: number}> = [];
  let cursor = 0;
  let node = walker.nextNode();
  while (node) {
    const tn = node as Text;
    const parent = tn.parentElement;
    const val = tn.nodeValue ?? '';
    if (val.length > 0 && parent) {
      const isNoisy =
        skipNoise &&
        Boolean(
          parent.closest(
            'sup, sub, aside[role="doc-footnote"], aside[epub\\:type="footnote"], [data-folio-footnote="true"], .footnote, nav'
          )
        );
      if (!isNoisy) {
        const start = cursor;
        cursor += val.length;
        out.push({node: tn, start, end: cursor});
      }
    }
    node = walker.nextNode();
  }
  return out;
}

export function clearTtsDomHighlights(container: HTMLElement | null): void {
  if (!container) return;
  const spans = container.querySelectorAll('span.folio-tts-sentence, span.folio-tts-word');
  if (spans.length === 0) return;
  spans.forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }
    parent.removeChild(span);
  });
  container.normalize();
}

export function extractReflowableNarrationMap(
  container: HTMLElement,
  chapterIndex: number,
  skipNoise = true
): NarrationSentence[] {
  clearTtsDomHighlights(container);
  const nodes = collectEligibleTextNodes(container, skipNoise);
  const fullText = nodes.map((n) => n.node.nodeValue ?? '').join('');
  if (!fullText.trim()) return [];

  const rawSents = splitIntoSentences(fullText);
  const sentences: NarrationSentence[] = [];
  let idx = 0;

  for (const s of rawSents) {
    const cleaned = s.text.replace(/\s+/g, ' ').trim();
    if (cleaned.length < 2) continue;
    if (skipNoise && /^\[\d+\]$/.test(cleaned)) continue;
    if (skipNoise && /^\d+$/.test(cleaned)) continue;

    const words = tokenizeWords(cleaned);
    sentences.push({
      index: idx++,
      unitIndex: chapterIndex,
      rawText: cleaned,
      spokenText: cleaned,
      words,
      estimatedSec: Math.max(1.2, words.length / 2.6),
      domStartOffset: s.start,
      domEndOffset: s.end,
    });
  }

  return sentences;
}

function wrapDomRange(
  container: HTMLElement,
  nodes: Array<{node: Text; start: number; end: number}>,
  rangeStart: number,
  rangeEnd: number,
  className: string
): HTMLElement | null {
  let firstEl: HTMLElement | null = null;
  const involved = nodes.filter((n) => n.end > rangeStart && n.start < rangeEnd);
  for (const seg of involved) {
    const localStart = Math.max(0, rangeStart - seg.start);
    const localEnd = Math.min(seg.node.nodeValue?.length ?? 0, rangeEnd - seg.start);
    if (localEnd <= localStart) continue;

    const val = seg.node.nodeValue ?? '';
    const before = val.slice(0, localStart);
    const middle = val.slice(localStart, localEnd);
    const after = val.slice(localEnd);

    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));

    const span = document.createElement('span');
    span.className = className;
    span.textContent = middle;
    if (!firstEl) firstEl = span;
    frag.appendChild(span);

    if (after) frag.appendChild(document.createTextNode(after));
    seg.node.parentNode?.replaceChild(frag, seg.node);
  }
  return firstEl;
}

export function applyTtsDomHighlight(
  container: HTMLElement,
  sentence: NarrationSentence,
  activeWordIndex: number,
  skipNoise = true
): {sentenceEl: HTMLElement | null; wordEl: HTMLElement | null} {
  clearTtsDomHighlights(container);
  if (sentence.domStartOffset === undefined || sentence.domEndOffset === undefined) {
    return {sentenceEl: null, wordEl: null};
  }

  const nodes = collectEligibleTextNodes(container, skipNoise);
  const sentenceEl = wrapDomRange(
    container,
    nodes,
    sentence.domStartOffset,
    sentence.domEndOffset,
    'folio-tts-sentence'
  );

  let wordEl: HTMLElement | null = null;
  if (activeWordIndex >= 0 && activeWordIndex < sentence.words.length) {
    const word = sentence.words[activeWordIndex];
    const freshNodes = collectEligibleTextNodes(container, skipNoise);
    const fullText = freshNodes.map((n) => n.node.nodeValue ?? '').join('');
    const slice = fullText.slice(sentence.domStartOffset, sentence.domEndOffset);
    // Find word occurrence near proportional offset
    const targetWord = word.text;
    const approx = Math.max(0, Math.min(slice.length, word.startInSentence - 4));
    let localWordIdx = slice.indexOf(targetWord, approx);
    if (localWordIdx === -1) {
      localWordIdx = slice.indexOf(targetWord);
    }
    if (localWordIdx !== -1) {
      const absStart = sentence.domStartOffset + localWordIdx;
      const absEnd = absStart + targetWord.length;
      wordEl = wrapDomRange(container, freshNodes, absStart, absEnd, 'folio-tts-word');
    }
  }

  return {sentenceEl, wordEl};
}

export function findFirstVisibleReflowableSentence(
  container: HTMLElement,
  viewportEl: HTMLElement | null,
  sentences: NarrationSentence[],
  skipNoise = true
): number {
  if (sentences.length === 0) return 0;
  const nodes = collectEligibleTextNodes(container, skipNoise);
  const vpTop = viewportEl ? viewportEl.getBoundingClientRect().top + 24 : 80;

  for (const s of sentences) {
    if (s.domStartOffset === undefined) continue;
    const nodeEntry = nodes.find(
      (n) => n.start <= s.domStartOffset! && n.end > s.domStartOffset!
    );
    if (!nodeEntry) continue;
    const range = document.createRange();
    const localPos = Math.max(0, s.domStartOffset - nodeEntry.start);
    range.setStart(nodeEntry.node, Math.min(localPos, nodeEntry.node.length));
    range.setEnd(nodeEntry.node, Math.min(localPos + 1, nodeEntry.node.length));
    const rect = range.getBoundingClientRect();
    if (rect.bottom >= vpTop) {
      return s.index;
    }
  }
  return 0;
}

export function findSentenceAtDomPoint(
  container: HTMLElement,
  sentences: NarrationSentence[],
  clientX: number,
  clientY: number,
  skipNoise = true
): number | null {
  if (sentences.length === 0) return null;
  let targetNode: Node | null = null;
  let targetOffset = 0;

  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => {offsetNode: Node; offset: number} | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  if (typeof doc.caretRangeFromPoint === 'function') {
    const r = doc.caretRangeFromPoint(clientX, clientY);
    if (r) {
      targetNode = r.startContainer;
      targetOffset = r.startOffset;
    }
  } else if (typeof doc.caretPositionFromPoint === 'function') {
    const pos = doc.caretPositionFromPoint(clientX, clientY);
    if (pos) {
      targetNode = pos.offsetNode;
      targetOffset = pos.offset;
    }
  }

  if (!targetNode || !container.contains(targetNode)) return null;

  const nodes = collectEligibleTextNodes(container, skipNoise);
  const hit = nodes.find((n) => n.node === targetNode);
  if (!hit) return null;

  const absOffset = hit.start + targetOffset;
  const match = sentences.find(
    (s) =>
      s.domStartOffset !== undefined &&
      s.domEndOffset !== undefined &&
      absOffset >= s.domStartOffset &&
      absOffset <= s.domEndOffset
  );
  return match ? match.index : null;
}

export function extractPdfPageSentences(
  spanMetas: PdfSpanMeta[],
  pageNumber: number,
  pageHeight: number,
  skipNoise = true
): NarrationSentence[] {
  if (spanMetas.length === 0) return [];

  // Optionally skip running headers (top 6%) and footers/page numbers (bottom 7%)
  const filtered = spanMetas.filter((meta) => {
    const txt = meta.text.trim();
    if (!txt) return false;
    if (skipNoise && pageHeight > 0) {
      const relY = meta.top / pageHeight;
      if ((relY < 0.06 || relY > 0.93) && txt.length < 48) return false;
      if (/^\d{1,4}$/.test(txt) && (relY < 0.1 || relY > 0.88)) return false;
    }
    return true;
  });

  if (filtered.length === 0) return [];

  // Concatenate spans with single-space separators while recording span char positions
  let fullText = '';
  const spanOffsets: Array<{meta: PdfSpanMeta; start: number; end: number}> = [];
  for (let i = 0; i < filtered.length; i++) {
    const meta = filtered[i];
    if (fullText.length > 0 && !fullText.endsWith(' ') && !meta.text.startsWith(' ')) {
      fullText += ' ';
    }
    const start = fullText.length;
    fullText += meta.text;
    const end = fullText.length;
    spanOffsets.push({meta, start, end});
  }

  const rawSents = splitIntoSentences(fullText);
  const sentences: NarrationSentence[] = [];
  let idx = 0;

  for (const s of rawSents) {
    const cleaned = s.text.replace(/\s+/g, ' ').trim();
    if (cleaned.length < 2) continue;

    const pdfSegments: PdfSentenceSegment[] = [];
    for (const entry of spanOffsets) {
      if (entry.end <= s.start || entry.start >= s.end) continue;
      const overlapStart = Math.max(entry.start, s.start);
      const overlapEnd = Math.min(entry.end, s.end);
      pdfSegments.push({
        spanIndex: entry.meta.spanIndex,
        startInSpan: overlapStart - entry.start,
        endInSpan: overlapEnd - entry.start,
        startInSentence: overlapStart - s.start,
        endInSentence: overlapEnd - s.start,
      });
    }

    const words = tokenizeWords(cleaned);
    sentences.push({
      index: idx++,
      unitIndex: pageNumber,
      rawText: cleaned,
      spokenText: cleaned,
      words,
      estimatedSec: Math.max(1.2, words.length / 2.6),
      pdfSegments,
    });
  }

  return sentences;
}
