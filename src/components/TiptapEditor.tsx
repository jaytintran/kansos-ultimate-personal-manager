import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Editor,
  EditorContent,
  Extension,
  InputRule,
  getMarkRange,
  useEditor,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlock from '@tiptap/extension-code-block';
import { TableKit } from '@tiptap/extension-table';
import { selectedRect } from '@tiptap/pm/tables';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeftRight,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Bold,
  Check,
  CheckSquare,
  Code,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  LayoutGrid,
  Link2,
  List,
  ListOrdered,
  Minus,
  PanelLeft,
  PanelTop,
  Pencil,
  Plus,
  Quote,
  Redo2,
  Slash,
  Strikethrough,
  Table2,
  Terminal,
  Trash2,
  Undo2,
  Unlink,
  WrapText,
  X,
} from 'lucide-react';
import type { Entry } from '../types';
import { WikiLinkNode } from './notes/NoteTiptapExtensions';
import {
  KansoTable,
  KansoTableView,
  autoFitTableColumns,
  getActiveResizeColumnIndex,
  type TableCellMode,
  type TableViewMode,
} from './notes/KansoTableExtension';

export const CODE_LANGUAGES = [
  'plaintext',
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'json',
  'html',
  'css',
  'bash',
  'python',
  'java',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'sql',
  'yaml',
  'markdown',
] as const;

const CustomCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      language: {
        default: 'plaintext',
        parseHTML: (element) =>
          element.getAttribute('data-language') ||
          element
            .querySelector('code')
            ?.getAttribute('class')
            ?.replace(/^language-/, '') ||
          'plaintext',
        renderHTML: (attributes) => ({
          'data-language': attributes.language || 'plaintext',
        }),
      },
    };
  },
});

interface SlashItem {
  id: string;
  label: string;
  description: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  action: (editor: Editor) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  {
    id: 'h1',
    label: 'Heading 1',
    description: 'Large section heading',
    keywords: 'h1 heading title',
    icon: Heading1,
    action: (ed) => ed.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    label: 'Heading 2',
    description: 'Medium section heading',
    keywords: 'h2 heading section',
    icon: Heading2,
    action: (ed) => ed.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    label: 'Heading 3',
    description: 'Compact subsection heading',
    keywords: 'h3 heading subsection',
    icon: Heading3,
    action: (ed) => ed.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: 'bullet',
    label: 'Bullet List',
    description: 'Unordered list items',
    keywords: 'ul bullet list',
    icon: List,
    action: (ed) => ed.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'ordered',
    label: 'Numbered List',
    description: 'Sequential numbered list',
    keywords: 'ol numbered ordered list',
    icon: ListOrdered,
    action: (ed) => ed.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'task',
    label: 'Checklist',
    description: 'Interactive to-do items',
    keywords: 'todo checklist task',
    icon: CheckSquare,
    action: (ed) => ed.chain().focus().toggleTaskList().run(),
  },
  {
    id: 'quote',
    label: 'Quote',
    description: 'Highlighted blockquote',
    keywords: 'blockquote quote callout',
    icon: Quote,
    action: (ed) => ed.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'code',
    label: 'Code Block',
    description: 'Formatted code snippet',
    keywords: 'code snippet pre',
    icon: Terminal,
    action: (ed) => ed.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: 'table',
    label: 'Table',
    description: 'Resizable table with header row',
    keywords: 'table grid columns rows spreadsheet markdown',
    icon: Table2,
    action: (ed) =>
      ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: 'link',
    label: 'Web Link',
    description: 'Insert a clickable URL or Markdown link',
    keywords: 'link url web href markdown http',
    icon: Globe,
    action: () => {
      // Handled inside TiptapEditor so it opens the inline link popover
    },
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Horizontal rule separator',
    keywords: 'hr divider line rule',
    icon: Minus,
    action: (ed) => ed.chain().focus().setHorizontalRule().run(),
  },
];

const OPEN_LINK_POPOVER_EVENT = 'kanso:open-link-popover';

function normalizeSafeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return null;
  if (/^https?:\/\/\S+$/i.test(trimmed) || /^mailto:\S+@\S+$/i.test(trimmed)) {
    return trimmed;
  }
  if (/^www\.[^\s/$.?#].[^\s]*$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  if (/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d+)?(?:[/?#][^\s]*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return null;
}

function parseSingleBareUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(trimmed)) {
    return normalizeSafeUrl(trimmed);
  }
  return null;
}

function openExternalAnchorSafely(href: string): void {
  const safe = normalizeSafeUrl(href);
  if (!safe || typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = safe;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const MarkdownLinkInputExtension = Extension.create({
  name: 'markdownLinkInput',
  addInputRules() {
    return [
      new InputRule({
        find: /\[([^[\]\n]+)\]\(([^\s)\n]+(?:\([^\s)\n]*\)[^\s)\n]*)*)\)$/,
        handler: ({ state, range, match }) => {
          const label = match[1];
          const rawUrl = match[2];
          if (!label || !label.trim() || !rawUrl) return;

          const prevChar =
            range.from > 1 ? state.doc.textBetween(range.from - 1, range.from) : '';
          if (prevChar === '[' || prevChar === '!' || prevChar === '\\') return;

          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.name === 'codeBlock') return;
          const codeMark = state.schema.marks.code;
          if (codeMark && state.doc.rangeHasMark(range.from, range.to, codeMark)) return;

          const href = normalizeSafeUrl(rawUrl);
          if (!href) return;

          const linkType = state.schema.marks.link;
          if (!linkType) return;

          const mark = linkType.create({
            href,
            target: '_blank',
            rel: 'noopener noreferrer',
            class: 'kanso-web-link',
          });
          state.tr
            .insertText(label, range.from, range.to)
            .addMark(range.from, range.from + label.length, mark)
            .removeStoredMark(linkType)
            .setMeta('preventAutolink', true);
        },
      }),
    ];
  },
});

type TableCellAlign = 'left' | 'center' | 'right' | null;

function splitMarkdownTableRow(line: string): string[] {
  let working = line.trim();
  if (working.startsWith('|')) {
    working = working.slice(1);
  }
  if (working.endsWith('|')) {
    let slashCount = 0;
    for (let i = working.length - 2; i >= 0 && working[i] === '\\'; i--) {
      slashCount++;
    }
    if (slashCount % 2 === 0) {
      working = working.slice(0, -1);
    }
  }

  const cells: string[] = [];
  let current = '';
  let inBackticks = false;

  for (let i = 0; i < working.length; i++) {
    const ch = working[i];
    if (ch === '\\' && i + 1 < working.length && working[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }
    if (ch === '`') {
      inBackticks = !inBackticks;
      current += ch;
      continue;
    }
    if (ch === '|' && !inBackticks) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function parseTableSeparatorRow(line: string): TableCellAlign[] | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes('|')) return null;
  const cells = splitMarkdownTableRow(trimmed);
  if (cells.length === 0) return null;

  const alignments: TableCellAlign[] = [];
  for (const raw of cells) {
    const cell = raw.trim();
    if (!/^:?-+:?$/.test(cell) || !cell.includes('-')) {
      return null;
    }
    const leftColon = cell.startsWith(':');
    const rightColon = cell.endsWith(':');
    if (leftColon && rightColon) {
      alignments.push('center');
    } else if (leftColon) {
      alignments.push('left');
    } else if (rightColon) {
      alignments.push('right');
    } else {
      alignments.push(null);
    }
  }
  return alignments;
}

function hasMarkdownTable(text: string): boolean {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.includes('|') && splitMarkdownTableRow(line).some(Boolean)) {
      if (parseTableSeparatorRow(lines[i + 1])) {
        return true;
      }
    }
  }
  return false;
}

function looksLikeMarkdown(text: string): boolean {
  return (
    /^#{1,3}\s+/m.test(text) ||
    /^[-*]\s+\[[ xX]\]\s+/m.test(text) ||
    /^[-*]\s+\S+/m.test(text) ||
    /^\d+\.\s+\S+/m.test(text) ||
    /^>\s+\S+/m.test(text) ||
    /^```/m.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /(?:^|[^![\\])\[[^[\]\n]+\]\([^\s)\n]+\)/.test(text) ||
    hasMarkdownTable(text)
  );
}

function escapeHtmlStr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttrStr(s: string): string {
  return escapeHtmlStr(s).replace(/"/g, '&quot;');
}

function applyBasicInlineFormatting(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function inlineMd(s: string): string {
  const placeholders: string[] = [];
  const stash = (html: string) => {
    const token = `\u0000KANSO_INLINE_${placeholders.length}\u0000`;
    placeholders.push(html);
    return token;
  };

  // 1. Stash inline code spans first so URLs/asterisks inside `code` stay literal
  let working = s.replace(/`([^`]+)`/g, (_m, code) =>
    stash(`<code>${escapeHtmlStr(code)}</code>`)
  );

  // 2. Stash Markdown links [label](url)
  working = working.replace(
    /(\\*)\[([^[\]\n]+)\]\(([^\s)\n]+(?:\([^\s)\n]*\)[^\s)\n]*)*)\)/g,
    (full, slashes: string, label: string, rawUrl: string) => {
      if (slashes.length % 2 === 1) return full;
      const safeHref = normalizeSafeUrl(rawUrl);
      if (!safeHref) return full;
      const formattedLabel = applyBasicInlineFormatting(escapeHtmlStr(label));
      return (
        slashes +
        stash(
          `<a href="${escapeAttrStr(safeHref)}" target="_blank" rel="noopener noreferrer" class="kanso-web-link">${formattedLabel}</a>`
        )
      );
    }
  );

  // 3. Escape remaining raw text
  working = escapeHtmlStr(working);

  // 4. Auto-link bare URLs in remaining plain text
  working = working.replace(
    /(https?:\/\/[^\s<>"'\u0000]+|www\.[^\s<>"'\u0000]+)/gi,
    (rawMatch) => {
      let urlPart = rawMatch;
      let trailing = '';
      while (/[.,;:!?)]$/.test(urlPart)) {
        const lastChar = urlPart.slice(-1);
        if (lastChar === ')') {
          const opens = (urlPart.match(/\(/g) || []).length;
          const closes = (urlPart.match(/\)/g) || []).length;
          if (closes <= opens) break;
        }
        trailing = lastChar + trailing;
        urlPart = urlPart.slice(0, -1);
      }
      const unescapedUrl = urlPart
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      const safeHref = normalizeSafeUrl(unescapedUrl);
      if (!safeHref) return rawMatch;
      return (
        stash(
          `<a href="${escapeAttrStr(safeHref)}" target="_blank" rel="noopener noreferrer" class="kanso-web-link">${urlPart}</a>`
        ) + trailing
      );
    }
  );

  // 5. Apply bold / strike / italic safely without touching stashed HTML attributes
  working = applyBasicInlineFormatting(working);

  // 6. Restore stashed inline tokens
  return working.replace(/\u0000KANSO_INLINE_(\d+)\u0000/g, (_m, idx) => {
    return placeholders[Number(idx)] ?? '';
  });
}

function markdownToHtml(md: string): string {
  const normalized = md.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeLang = 'plaintext';
  let codeBuf: string[] = [];
  let listMode: 'ul' | 'ol' | 'task' | null = null;
  let paragraphBuf: string[] = [];
  let quoteBuf: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuf.length === 0) return;
    const joined = paragraphBuf
      .map((l) => l.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s{2,}/g, ' ');
    if (joined) {
      out.push(`<p>${inlineMd(joined)}</p>`);
    }
    paragraphBuf = [];
  };

  const flushQuote = () => {
    if (quoteBuf.length === 0) return;
    const joined = quoteBuf
      .map((l) => l.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s{2,}/g, ' ');
    if (joined) {
      out.push(`<blockquote><p>${inlineMd(joined)}</p></blockquote>`);
    }
    quoteBuf = [];
  };

  const closeList = () => {
    if (listMode === 'ul') out.push('</ul>');
    else if (listMode === 'ol') out.push('</ol>');
    else if (listMode === 'task') out.push('</ul>');
    listMode = null;
  };

  const detectListKind = (raw: string): 'task' | 'ul' | 'ol' | null => {
    const t = raw.trim();
    if (/^[-*+]\s+\[([ xX])\]\s+/.test(t)) return 'task';
    if (/^[-*+]\s+/.test(t)) return 'ul';
    if (/^\d+[.)]\s+/.test(t)) return 'ol';
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      flushParagraph();
      flushQuote();
      if (!inCode) {
        closeList();
        inCode = true;
        codeLang = line.trim().slice(3).trim() || 'plaintext';
        codeBuf = [];
      } else {
        out.push(
          `<pre data-language="${escapeHtmlStr(codeLang)}"><code class="language-${escapeHtmlStr(
            codeLang
          )}">${escapeHtmlStr(codeBuf.join('\n'))}</code></pre>`
        );
        inCode = false;
        codeBuf = [];
      }
      continue;
    }

    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushQuote();
      if (listMode) {
        // Keep the list open across blank lines when the next non-blank line continues the same list type
        let lookahead = i + 1;
        while (lookahead < lines.length && !lines[lookahead].trim()) {
          lookahead++;
        }
        const nextKind =
          lookahead < lines.length ? detectListKind(lines[lookahead]) : null;
        if (nextKind !== listMode) {
          closeList();
        }
      }
      continue;
    }

    // GFM Pipe Table (header row + alignment/separator row + body rows)
    const nextAligns =
      i + 1 < lines.length && trimmed.includes('|')
        ? parseTableSeparatorRow(lines[i + 1])
        : null;
    if (nextAligns) {
      flushParagraph();
      flushQuote();
      closeList();
      const headerCells = splitMarkdownTableRow(trimmed);
      const colCount = Math.max(nextAligns.length, headerCells.length);
      const colAlign = (idx: number) => nextAligns[idx] ?? null;
      const cellAttr = (align: TableCellAlign) =>
        align ? ` style="text-align: ${align}"` : '';

      const tableRows: string[] = [];
      const headerHtml = Array.from({ length: colCount }, (_, idx) => {
        const rawCell = headerCells[idx] ?? '';
        const content = rawCell ? inlineMd(rawCell) : '';
        return `<th${cellAttr(colAlign(idx))}><p>${content}</p></th>`;
      }).join('');
      tableRows.push(`<tr>${headerHtml}</tr>`);

      let j = i + 2;
      while (j < lines.length) {
        const rowLine = lines[j];
        const rowTrimmed = rowLine.trim();
        if (
          !rowTrimmed ||
          !rowTrimmed.includes('|') ||
          rowTrimmed.startsWith('```') ||
          /^#{1,6}\s+/.test(rowTrimmed) ||
          /^---+$/.test(rowTrimmed)
        ) {
          break;
        }
        const rowCells = splitMarkdownTableRow(rowTrimmed);
        const bodyHtml = Array.from({ length: colCount }, (_, idx) => {
          const rawCell = rowCells[idx] ?? '';
          const content = rawCell ? inlineMd(rawCell) : '';
          return `<td${cellAttr(colAlign(idx))}><p>${content}</p></td>`;
        }).join('');
        tableRows.push(`<tr>${bodyHtml}</tr>`);
        j++;
      }

      out.push(`<table><tbody>${tableRows.join('')}</tbody></table>`);
      i = j - 1;
      continue;
    }

    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      flushParagraph();
      flushQuote();
      closeList();
      out.push('<hr />');
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      flushParagraph();
      flushQuote();
      closeList();
      const lvl = Math.min(3, hMatch[1].length);
      out.push(`<h${lvl}>${inlineMd(hMatch[2].trim())}</h${lvl}>`);
      continue;
    }

    const taskMatch = trimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      flushParagraph();
      flushQuote();
      if (listMode !== 'task') {
        closeList();
        out.push('<ul data-type="taskList">');
        listMode = 'task';
      }
      const checked = taskMatch[1].toLowerCase() === 'x';
      out.push(
        `<li data-type="taskItem" data-checked="${checked ? 'true' : 'false'}"><p>${inlineMd(
          taskMatch[2].trim()
        )}</p></li>`
      );
      continue;
    }

    const ulMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (ulMatch) {
      flushParagraph();
      flushQuote();
      if (listMode !== 'ul') {
        closeList();
        out.push('<ul>');
        listMode = 'ul';
      }
      out.push(`<li><p>${inlineMd(ulMatch[1].trim())}</p></li>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (olMatch) {
      flushParagraph();
      flushQuote();
      if (listMode !== 'ol') {
        closeList();
        out.push('<ol>');
        listMode = 'ol';
      }
      out.push(`<li><p>${inlineMd(olMatch[1].trim())}</p></li>`);
      continue;
    }

    const qMatch = trimmed.match(/^>\s?(.*)$/);
    if (qMatch) {
      flushParagraph();
      closeList();
      const qText = qMatch[1].trim();
      if (!qText) {
        flushQuote();
      } else {
        quoteBuf.push(qText);
      }
      continue;
    }

    // Continuation or plain paragraph line: join single line wraps cleanly
    flushQuote();
    closeList();
    paragraphBuf.push(trimmed);
  }

  flushParagraph();
  flushQuote();
  closeList();
  if (inCode && codeBuf.length > 0) {
    out.push(
      `<pre data-language="${escapeHtmlStr(codeLang)}"><code class="language-${escapeHtmlStr(
        codeLang
      )}">${escapeHtmlStr(codeBuf.join('\n'))}</code></pre>`
    );
  }
  return out.join('');
}

function cleanPastedHtml(rawHtml: string): string {
  if (typeof DOMParser === 'undefined') return rawHtml;
  try {
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
    const body = doc.body;
    if (!body) return rawHtml;

    const VOID_MEDIA_SELECTOR = 'img, hr, table, svg, pre, code, iframe, video, audio';
    const isEmptySpacerElement = (el: Element): boolean => {
      if (el.querySelector(VOID_MEDIA_SELECTOR)) return false;
      const text = (el.textContent || '')
        .replace(/[\u00a0\u200b-\u200d\ufeff]/g, '')
        .trim();
      return text.length === 0;
    };

    // 1. Strip empty spacer paragraphs, divs, headings, and blockquotes
    const spacerCandidates = Array.from(
      body.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6, blockquote')
    ).reverse();
    for (const el of spacerCandidates) {
      const tag = el.tagName.toLowerCase();
      // Preserve Google Docs / Notion wrapper spans only if non-empty
      if (tag === 'div' && el.children.length > 0 && !isEmptySpacerElement(el)) continue;
      if (isEmptySpacerElement(el)) {
        el.remove();
      }
    }

    // 2. Clean leading/trailing/consecutive <br> tags inside text blocks and list items
    for (const block of Array.from(body.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6'))) {
      const brs = Array.from(block.querySelectorAll('br'));
      for (const br of brs) {
        if (br.closest('pre, code')) continue;
        const prev = br.previousSibling;
        const next = br.nextSibling;
        const prevEmpty =
          !prev || (prev.nodeType === Node.TEXT_NODE && !(prev.textContent || '').trim());
        const nextEmpty =
          !next || (next.nodeType === Node.TEXT_NODE && !(next.textContent || '').trim());
        const prevIsBr = prev instanceof Element && prev.tagName.toLowerCase() === 'br';
        if (prevEmpty || nextEmpty || prevIsBr) {
          br.remove();
        }
      }
    }

    // 3. Remove whitespace-only text nodes between block containers and normalize inline whitespace outside <pre>/<code>
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      textNodes.push(current as Text);
      current = walker.nextNode();
    }
    const BLOCK_CONTAINER_TAGS = new Set([
      'BODY',
      'UL',
      'OL',
      'TABLE',
      'THEAD',
      'TBODY',
      'TR',
      'BLOCKQUOTE',
    ]);
    for (const node of textNodes) {
      const parentEl = node.parentElement;
      if (!parentEl || parentEl.closest('pre, code')) continue;
      const val = node.nodeValue || '';
      if (!val.replace(/[\u00a0\u200b-\u200d\ufeff]/g, '').trim()) {
        if (BLOCK_CONTAINER_TAGS.has(parentEl.tagName)) {
          node.remove();
          continue;
        }
      }
      node.nodeValue = val.replace(/[ \t\r\n]+/g, ' ');
    }

    // 4. Merge adjacent identical <ul> / <ol> lists that had spacer nodes stripped between them
    for (const container of [body, ...Array.from(body.querySelectorAll('div, blockquote, li'))]) {
      let child = container.firstElementChild;
      while (child && child.nextElementSibling) {
        const next = child.nextElementSibling;
        const tag = child.tagName.toLowerCase();
        if (
          (tag === 'ul' || tag === 'ol') &&
          next.tagName.toLowerCase() === tag &&
          (child.getAttribute('data-type') || '') === (next.getAttribute('data-type') || '')
        ) {
          while (next.firstChild) {
            child.appendChild(next.firstChild);
          }
          next.remove();
          continue;
        }
        child = next;
      }
    }

    return body.innerHTML.trim();
  } catch {
    return rawHtml;
  }
}

function isTableHeaderRowActive(editor: Editor): boolean {
  if (!editor.isActive('table')) return false;
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'table') {
      const firstRow = node.firstChild;
      if (!firstRow || firstRow.childCount === 0) return false;
      return firstRow.firstChild?.type.name === 'tableHeader';
    }
  }
  return false;
}

function getActiveTableCellAlign(editor: Editor): TableCellAlign {
  if (!editor.isActive('table')) return null;
  const align =
    (editor.getAttributes('tableHeader')?.align as TableCellAlign | undefined) ??
    (editor.getAttributes('tableCell')?.align as TableCellAlign | undefined) ??
    null;
  return align === 'left' || align === 'center' || align === 'right' ? align : null;
}

function applyTableColumnAlignment(
  editor: Editor,
  align: 'left' | 'center' | 'right'
): void {
  if (!editor.isActive('table')) return;
  const { state, view } = editor;
  try {
    const rect = selectedRect(state);
    const cellPositions = new Set<number>();
    for (let row = 0; row < rect.map.height; row++) {
      for (let col = rect.left; col < rect.right; col++) {
        cellPositions.add(rect.tableStart + rect.map.map[row * rect.map.width + col]);
      }
    }
    const current = getActiveTableCellAlign(editor);
    const nextAlign: TableCellAlign = current === align ? null : align;
    const tr = state.tr;
    cellPositions.forEach((pos) => {
      const cell = tr.doc.nodeAt(pos);
      if (cell) {
        tr.setNodeMarkup(pos, undefined, { ...cell.attrs, align: nextAlign });
      }
    });
    if (tr.docChanged) {
      view.dispatch(tr);
      view.focus();
    }
  } catch {
    const current = getActiveTableCellAlign(editor);
    editor
      .chain()
      .focus()
      .setCellAttribute('align', current === align ? null : align)
      .run();
  }
}

interface FloatingPos {
  top: number;
  left: number;
  placement: 'above' | 'below';
}

interface TiptapEditorProps {
  docId: string;
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  variant?: 'default' | 'borderless';
  onEditorReady?: (editor: Editor | null) => void;
  allNotes?: Entry[];
  onOpenNote?: (noteId: string, title?: string) => void;
  onCreateLinkedNote?: (title: string) => Entry;
  onTimestampLinkClick?: (seconds: number) => void;
}

type WikiCandidate =
  | { kind: 'note'; note: Entry }
  | { kind: 'create'; title: string };

interface LinkPopoverState {
  mode: 'view' | 'edit';
  href: string;
  text: string;
  from: number;
  to: number;
  hasExistingLink: boolean;
  top: number;
  left: number;
  placement: 'above' | 'below';
}

export const TiptapEditor: React.FC<TiptapEditorProps> = ({
  docId,
  content,
  onChange,
  placeholder = 'Write notes, paste Markdown, or type / for blocks...',
  minHeight = 200,
  variant = 'default',
  onEditorReady,
  allNotes,
  onOpenNote,
  onCreateLinkedNote,
  onTimestampLinkClick,
}) => {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashCoords, setSlashCoords] = useState<{ top: number; left: number } | null>(null);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [wikiQuery, setWikiQuery] = useState('');
  const [wikiIndex, setWikiIndex] = useState(0);
  const [wikiCoords, setWikiCoords] = useState<{ top: number; left: number } | null>(null);
  const [selectionBar, setSelectionBar] = useState<FloatingPos | null>(null);
  const [linkPopover, setLinkPopover] = useState<LinkPopoverState | null>(null);
  const [linkUrlDraft, setLinkUrlDraft] = useState('');
  const [linkTextDraft, setLinkTextDraft] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [, forceRerender] = useState(0);

  const slashRangeRef = useRef<{ from: number; to: number } | null>(null);
  const slashOpenRef = useRef(false);
  const slashIndexRef = useRef(0);
  const filteredSlashRef = useRef<SlashItem[]>(SLASH_ITEMS);
  const wikiRangeRef = useRef<{ from: number; to: number } | null>(null);
  const wikiOpenRef = useRef(false);
  const wikiIndexRef = useRef(0);
  const wikiCandidatesRef = useRef<WikiCandidate[]>([]);
  const linkPopoverRef = useRef<LinkPopoverState | null>(null);
  linkPopoverRef.current = linkPopover;
  const linkUrlInputRef = useRef<HTMLInputElement | null>(null);
  const allNotesRef = useRef<Entry[] | undefined>(allNotes);
  allNotesRef.current = allNotes;
  const onOpenNoteRef = useRef(onOpenNote);
  onOpenNoteRef.current = onOpenNote;
  const onCreateLinkedNoteRef = useRef(onCreateLinkedNote);
  onCreateLinkedNoteRef.current = onCreateLinkedNote;
  const onTimestampLinkClickRef = useRef(onTimestampLinkClick);
  onTimestampLinkClickRef.current = onTimestampLinkClick;

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmittedHtmlRef = useRef<string>(content || '');
  const prevDocIdRef = useRef<string>(docId);

  const allSlashItems = useMemo(() => {
    if (!allNotes) return SLASH_ITEMS;
    const linkItem: SlashItem = {
      id: 'wikilink',
      label: 'Link to Note [[',
      description: 'Reference or create a linked note',
      keywords: 'wikilink link note reference [[ connection',
      icon: Link2,
      action: (ed) => {
        ed.chain().focus().insertContent('[[').run();
      },
    };
    return [...SLASH_ITEMS, linkItem];
  }, [allNotes]);

  const filteredSlash = useMemo(() => {
    const q = slashQuery.trim().toLowerCase();
    if (!q) return allSlashItems;
    return allSlashItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords.includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [slashQuery, allSlashItems]);

  const wikiCandidates = useMemo<WikiCandidate[]>(() => {
    if (!allNotes) return [];
    const q = wikiQuery.trim();
    const qLower = q.toLowerCase();
    const matches = allNotes
      .filter((n) => n.id !== docId && !n.archived)
      .filter((n) => !qLower || (n.title || 'Untitled Note').toLowerCase().includes(qLower))
      .slice(0, 8)
      .map((note): WikiCandidate => ({ kind: 'note', note }));

    const exactExists =
      qLower.length > 0 &&
      allNotes.some((n) => !n.archived && (n.title || '').trim().toLowerCase() === qLower);
    if (q && !exactExists && onCreateLinkedNote) {
      matches.push({ kind: 'create', title: q });
    }
    return matches;
  }, [allNotes, wikiQuery, docId, onCreateLinkedNote]);

  slashOpenRef.current = slashOpen;
  slashIndexRef.current = slashIndex;
  filteredSlashRef.current = filteredSlash;
  wikiOpenRef.current = wikiOpen;
  wikiIndexRef.current = wikiIndex;
  wikiCandidatesRef.current = wikiCandidates;

  const updateSelectionToolbar = useCallback(
    (ed: Editor) => {
      if (variant !== 'borderless') {
        setSelectionBar(null);
        return;
      }
      const { from, to, empty } = ed.state.selection;
      if (empty || from === to || ed.isActive('codeBlock') || !ed.isFocused) {
        setSelectionBar(null);
        return;
      }

      let rect: DOMRect | null = null;
      const domSel = window.getSelection();
      if (domSel && domSel.rangeCount > 0 && !domSel.isCollapsed) {
        const r = domSel.getRangeAt(0).getBoundingClientRect();
        if (r.width > 0 || r.height > 0) rect = r;
      }

      if (!rect) {
        try {
          const start = ed.view.coordsAtPos(from);
          const end = ed.view.coordsAtPos(to);
          rect = new DOMRect(
            Math.min(start.left, end.left),
            Math.min(start.top, end.top),
            Math.max(1, Math.abs(end.right - start.left)),
            Math.max(16, Math.abs(end.bottom - start.top))
          );
        } catch {
          setSelectionBar(null);
          return;
        }
      }

      const barHalfWidth = 172;
      const centerX = rect.left + rect.width / 2;
      const clampedLeft = Math.max(
        barHalfWidth + 12,
        Math.min(window.innerWidth - barHalfWidth - 12, centerX)
      );
      const showBelow = rect.top < 68;
      setSelectionBar({
        top: showBelow ? rect.bottom + 8 : rect.top - 48,
        left: clampedLeft,
        placement: showBelow ? 'below' : 'above',
      });
    },
    [variant]
  );

  const computePopoverPos = useCallback((rect: DOMRect) => {
    const popWidth = 304;
    const popHeight = 178;
    const clampedLeft = Math.max(
      12,
      Math.min(window.innerWidth - popWidth - 12, rect.left)
    );
    const openAbove =
      rect.bottom + popHeight > window.innerHeight - 64 && rect.top > popHeight + 16;
    return {
      top: openAbove ? rect.top - 8 : rect.bottom + 8,
      left: clampedLeft,
      placement: (openAbove ? 'above' : 'below') as 'above' | 'below',
    };
  }, []);

  const openLinkPopoverForEditor = useCallback(
    (ed: Editor, mode: 'view' | 'edit' = 'edit') => {
      const { state } = ed;
      const linkMarkType = state.schema.marks.link;
      let from = state.selection.from;
      let to = state.selection.to;
      let href = (ed.getAttributes('link')?.href as string) || '';
      const hasExistingLink = Boolean(linkMarkType && ed.isActive('link'));

      if (hasExistingLink && linkMarkType) {
        const range = getMarkRange(state.selection.$from, linkMarkType);
        if (range) {
          from = range.from;
          to = range.to;
        }
      }

      const text = from < to ? state.doc.textBetween(from, to, ' ') : '';
      let rect: DOMRect;
      try {
        const start = ed.view.coordsAtPos(from);
        const end = ed.view.coordsAtPos(Math.max(from, to));
        rect = new DOMRect(
          Math.min(start.left, end.left),
          Math.min(start.top, end.top),
          Math.max(16, Math.abs(end.right - start.left)),
          Math.max(18, Math.abs(end.bottom - start.top))
        );
      } catch {
        rect = new DOMRect(window.innerWidth / 2 - 150, 140, 20, 20);
      }
      const pos = computePopoverPos(rect);
      setSelectionBar(null);
      setSlashOpen(false);
      setWikiOpen(false);
      setLinkUrlDraft(href);
      setLinkTextDraft(text);
      setLinkError('');
      setLinkCopied(false);
      setLinkPopover({
        mode,
        href,
        text,
        from,
        to,
        hasExistingLink,
        ...pos,
      });
    },
    [computePopoverPos]
  );

  const openLinkPopoverRef = useRef(openLinkPopoverForEditor);
  openLinkPopoverRef.current = openLinkPopoverForEditor;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          markdownLinks: false,
          defaultProtocol: 'https',
          HTMLAttributes: {
            class: 'kanso-web-link',
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          isAllowedUri: (url, ctx) => {
            if (/^\s*#ts=\d+\s*$/i.test(url)) return true;
            if (/^\s*(javascript|data|vbscript|file):/i.test(url)) return false;
            return ctx.defaultValidate(url);
          },
        },
      }),
      MarkdownLinkInputExtension,
      CustomCodeBlock,
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({
        table: false,
      }),
      KansoTable.configure({
        resizable: true,
        renderWrapper: true,
        cellMinWidth: 64,
        handleWidth: 6,
        lastColumnResizable: true,
        View: KansoTableView,
      }),
      WikiLinkNode,
    ],
    content: content || '',
    editorProps: {
      handleDOMEvents: {
        dblclick: (view, event) => {
          const ed = editorRef.current;
          if (!ed || !ed.isEditable) return false;
          const colIdx = getActiveResizeColumnIndex(view, event);
          if (colIdx === null) return false;
          event.preventDefault();
          return autoFitTableColumns(ed, colIdx);
        },
      },
      handleClick: (view, pos, event) => {
        const targetEl = event.target;
        const anchorEl =
          targetEl instanceof HTMLElement
            ? (targetEl.closest('a[href]') as HTMLAnchorElement | null)
            : null;
        if (!anchorEl || !view.dom.contains(anchorEl)) {
          if (linkPopoverRef.current) setLinkPopover(null);
          return false;
        }

        const linkMarkType = view.state.schema.marks.link;
        const resolvedPos = view.state.doc.resolve(pos);
        const markRange = linkMarkType ? getMarkRange(resolvedPos, linkMarkType) : undefined;
        const rawHref = anchorEl.getAttribute('href') || '';
        const tsMatch = rawHref.trim().match(/^#ts=(\d+)$/i);
        if (tsMatch) {
          event.preventDefault();
          const seconds = Number(tsMatch[1]);
          if (Number.isFinite(seconds) && onTimestampLinkClickRef.current) {
            onTimestampLinkClickRef.current(seconds);
          }
          return true;
        }

        const safeHref = normalizeSafeUrl(rawHref) || rawHref;

        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          openExternalAnchorSafely(safeHref);
          return true;
        }

        event.preventDefault();
        const from = markRange?.from ?? pos;
        const to = markRange?.to ?? pos;
        const linkText =
          markRange && markRange.from < markRange.to
            ? view.state.doc.textBetween(markRange.from, markRange.to, ' ')
            : anchorEl.textContent || '';
        const coords = computePopoverPos(anchorEl.getBoundingClientRect());
        setSelectionBar(null);
        setSlashOpen(false);
        setWikiOpen(false);
        setLinkUrlDraft(safeHref);
        setLinkTextDraft(linkText);
        setLinkError('');
        setLinkCopied(false);
        setLinkPopover({
          mode: 'view',
          href: safeHref,
          text: linkText,
          from,
          to,
          hasExistingLink: true,
          ...coords,
        });
        return true;
      },
      handlePaste: (_view, event) => {
        if (editorRef.current?.isActive('codeBlock')) {
          return false;
        }
        const htmlData = event.clipboardData?.getData('text/html') || '';
        const textData = event.clipboardData?.getData('text/plain') || '';
        const hasSemanticHtml =
          Boolean(htmlData) &&
          /<(table|thead|tbody|tr|th|td|ul|ol|li|h[1-6]|blockquote|strong|b|em|i|a)\b/i.test(
            htmlData
          );

        const singleBareUrl = !hasSemanticHtml ? parseSingleBareUrl(textData) : null;
        if (singleBareUrl && editorRef.current) {
          event.preventDefault();
          const activeEd = editorRef.current;
          if (!activeEd.state.selection.empty) {
            activeEd.chain().focus().setLink({ href: singleBareUrl }).run();
          } else {
            activeEd
              .chain()
              .focus()
              .insertContent([
                {
                  type: 'text',
                  text: textData.trim(),
                  marks: [
                    {
                      type: 'link',
                      attrs: {
                        href: singleBareUrl,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        class: 'kanso-web-link',
                      },
                    },
                  ],
                },
                { type: 'text', text: ' ' },
              ])
              .run();
          }
          return true;
        }

        if (hasSemanticHtml && editorRef.current) {
          const cleanedHtml = cleanPastedHtml(htmlData);
          if (cleanedHtml) {
            event.preventDefault();
            editorRef.current.chain().focus().insertContent(cleanedHtml).run();
            return true;
          }
        }

        if (
          textData &&
          ((!htmlData && (looksLikeMarkdown(textData) || textData.includes('\n'))) ||
            (!hasSemanticHtml &&
              (hasMarkdownTable(textData) ||
                looksLikeMarkdown(textData) ||
                textData.includes('\n'))))
        ) {
          event.preventDefault();
          const converted = markdownToHtml(textData);
          editorRef.current?.chain().focus().insertContent(converted).run();
          return true;
        }
        return false;
      },
      handleKeyDown: (_view, event) => {
        if (wikiOpenRef.current) {
          const items = wikiCandidatesRef.current;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setWikiIndex((i) => (items.length ? (i + 1) % items.length : 0));
            return true;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setWikiIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
            return true;
          }
          if (event.key === 'Enter') {
            const selected = items[wikiIndexRef.current];
            const activeEd = editorRef.current;
            if (selected && activeEd) {
              event.preventDefault();
              let targetNote: Entry | null = null;
              if (selected.kind === 'note') {
                targetNote = selected.note;
              } else if (onCreateLinkedNoteRef.current) {
                targetNote = onCreateLinkedNoteRef.current(selected.title);
              }
              if (targetNote) {
                const chain = activeEd.chain().focus();
                if (wikiRangeRef.current) chain.deleteRange(wikiRangeRef.current);
                chain
                  .insertContent([
                    {
                      type: 'wikiLink',
                      attrs: {
                        noteId: targetNote.id,
                        title: targetNote.title || 'Untitled Note',
                      },
                    },
                    { type: 'text', text: ' ' },
                  ])
                  .run();
              }
              setWikiOpen(false);
              setWikiQuery('');
              return true;
            }
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setWikiOpen(false);
            setWikiQuery('');
            return true;
          }
        }
        if (event.key === 'Escape' && linkPopoverRef.current) {
          event.preventDefault();
          event.stopPropagation();
          setLinkPopover(null);
          return true;
        }
        if (!slashOpenRef.current) return false;
        const items = filteredSlashRef.current;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSlashIndex((i) => (items.length ? (i + 1) % items.length : 0));
          return true;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSlashIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
          return true;
        }
        if (event.key === 'Enter') {
          const selected = items[slashIndexRef.current];
          const activeEd = editorRef.current;
          if (selected && activeEd) {
            event.preventDefault();
            if (slashRangeRef.current) {
              activeEd.chain().focus().deleteRange(slashRangeRef.current).run();
            }
            if (selected.id === 'link') {
              openLinkPopoverRef.current(activeEd, 'edit');
            } else {
              selected.action(activeEd);
            }
            setSlashOpen(false);
            setSlashQuery('');
            return true;
          }
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setSlashOpen(false);
          setSlashQuery('');
          return true;
        }
        return false;
      },
    },
    onSelectionUpdate: ({ editor: ed }) => {
      updateSelectionToolbar(ed);
      if (variant !== 'borderless') {
        forceRerender((n) => (n + 1) % 10000);
      }
    },
    onTransaction: () => {
      if (variant !== 'borderless') {
        forceRerender((n) => (n + 1) % 10000);
      }
    },
    onBlur: () => {
      window.setTimeout(() => {
        setSelectionBar(null);
      }, 140);
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const normalized = html === '<p></p>' ? '' : html;
      lastEmittedHtmlRef.current = normalized;
      onChangeRef.current(normalized);

      const { from } = ed.state.selection;
      const textBefore = ed.state.doc.textBetween(Math.max(0, from - 48), from, '\n');

      // Detect [[wikilink token at cursor
      const wikiMatch = allNotesRef.current ? textBefore.match(/\[\[([^\]\n]*)$/) : null;
      if (wikiMatch && !ed.isActive('codeBlock')) {
        const query = wikiMatch[1] || '';
        wikiRangeRef.current = { from: from - query.length - 2, to: from };
        setWikiQuery(query);
        setWikiIndex(0);
        try {
          const coords = ed.view.coordsAtPos(from);
          const menuWidth = 264;
          const menuHeight = 280;
          const clampedLeft = Math.max(
            12,
            Math.min(window.innerWidth - menuWidth - 12, coords.left)
          );
          const openAbove = coords.bottom + menuHeight > window.innerHeight - 72;
          setWikiCoords({
            left: clampedLeft,
            top: openAbove
              ? Math.max(12, coords.top - menuHeight - 8)
              : coords.bottom + 6,
          });
        } catch {
          setWikiCoords(null);
        }
        setWikiOpen(true);
        setSlashOpen(false);
        updateSelectionToolbar(ed);
        return;
      } else {
        setWikiOpen(false);
      }

      // Detect slash command token at cursor
      const match = textBefore.match(/(?:^|\s)\/([a-z0-9]*)$/i);
      if (match && !ed.isActive('codeBlock')) {
        const query = match[1] || '';
        slashRangeRef.current = { from: from - query.length - 1, to: from };
        setSlashQuery(query);
        setSlashIndex(0);
        try {
          const coords = ed.view.coordsAtPos(from);
          const menuWidth = 248;
          const menuHeight = 310;
          const clampedLeft = Math.max(
            12,
            Math.min(window.innerWidth - menuWidth - 12, coords.left)
          );
          const openAbove = coords.bottom + menuHeight > window.innerHeight - 72;
          setSlashCoords({
            left: clampedLeft,
            top: openAbove
              ? Math.max(12, coords.top - menuHeight - 8)
              : coords.bottom + 6,
          });
        } catch {
          setSlashCoords(null);
        }
        setSlashOpen(true);
      } else {
        setSlashOpen(false);
      }
      updateSelectionToolbar(ed);
    },
  });

  editorRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    const wikiStorage = (
      editor.storage as { wikiLink?: { onNavigate?: (id: string, title: string) => void } }
    ).wikiLink;
    if (wikiStorage) {
      wikiStorage.onNavigate = (targetId, linkTitle) => {
        onOpenNoteRef.current?.(targetId, linkTitle);
      };
    }
  }, [editor]);

  useEffect(() => {
    onEditorReady?.(editor ?? null);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor) return;
    const docChanged = prevDocIdRef.current !== docId;
    prevDocIdRef.current = docId;

    const normalizedNext = content || '';
    if (!docChanged && normalizedNext === lastEmittedHtmlRef.current) {
      return;
    }

    const currentHtml = editor.getHTML();
    const normalizedCurrent = currentHtml === '<p></p>' ? '' : currentHtml;
    if (normalizedCurrent !== normalizedNext) {
      editor.commands.setContent(normalizedNext, { emitUpdate: false });
    }
    lastEmittedHtmlRef.current = normalizedNext;
  }, [docId, editor, content]);

  // Dismiss floating selection bar / link popover on scroll so it never drifts away from text
  useEffect(() => {
    if (!selectionBar && !slashOpen && !linkPopover) return;
    const handleScroll = () => {
      if (selectionBar) setSelectionBar(null);
      if (linkPopover) setLinkPopover(null);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [selectionBar, slashOpen, linkPopover]);

  // Listen for custom open-link-popover triggers from TiptapThumbToolbar
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onOpenLink = () => {
      openLinkPopoverRef.current(editor, 'edit');
    };
    dom.addEventListener(OPEN_LINK_POPOVER_EVENT, onOpenLink);
    return () => dom.removeEventListener(OPEN_LINK_POPOVER_EVENT, onOpenLink);
  }, [editor]);

  // Autofocus URL field when link edit popover opens; dismiss on outside click / Escape
  useEffect(() => {
    if (!linkPopover) return;
    if (linkPopover.mode === 'edit') {
      window.setTimeout(() => linkUrlInputRef.current?.focus(), 10);
    }
    const onMouseDown = (e: MouseEvent) => {
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest('.kanso-link-popover')) return;
      if (targetEl?.closest('a[href]') && editor?.view.dom.contains(targetEl)) return;
      setLinkPopover(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setLinkPopover(null);
        editor?.commands.focus();
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [linkPopover, editor]);

  if (!editor) return null;

  const isCodeBlockActive = editor.isActive('codeBlock');
  const isTableActive = editor.isActive('table');
  const tableHasHeader = isTableActive ? isTableHeaderRowActive(editor) : false;
  const activeCellAlign = isTableActive ? getActiveTableCellAlign(editor) : null;
  const activeTableAttrs = isTableActive ? editor.getAttributes('table') : {};
  const freezeFirstCol = Boolean(activeTableAttrs?.freezeFirstCol);
  const tableCellMode: TableCellMode =
    activeTableAttrs?.cellMode === 'truncate' ? 'truncate' : 'wrap';
  const tableViewMode: TableViewMode =
    activeTableAttrs?.viewMode === 'cards' ? 'cards' : 'table';
  const currentCodeLang = (editor.getAttributes('codeBlock')?.language as string) || 'plaintext';

  const applySlashItem = (item: SlashItem) => {
    if (slashRangeRef.current) {
      editor.chain().focus().deleteRange(slashRangeRef.current).run();
    }
    if (item.id === 'link') {
      openLinkPopoverForEditor(editor, 'edit');
    } else {
      item.action(editor);
    }
    setSlashOpen(false);
    setSlashQuery('');
  };

  const handleSaveLinkPopover = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkPopover) return;
    const safeHref = normalizeSafeUrl(linkUrlDraft);
    if (!safeHref) {
      setLinkError('Enter a valid URL (e.g. https://example.com)');
      return;
    }
    const label = linkTextDraft.trim() || safeHref;
    const { from, to } = linkPopover;
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from, to },
        [
          {
            type: 'text',
            text: label,
            marks: [
              {
                type: 'link',
                attrs: {
                  href: safeHref,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  class: 'kanso-web-link',
                },
              },
            ],
          },
        ]
      )
      .unsetMark('link')
      .run();
    setLinkPopover(null);
  };

  const handleUnlinkPopover = () => {
    if (!linkPopover) return;
    editor
      .chain()
      .focus()
      .setTextSelection({ from: linkPopover.from, to: linkPopover.to })
      .unsetLink()
      .run();
    setLinkPopover(null);
  };

  const handleCopyLinkUrl = async () => {
    if (!linkPopover?.href) return;
    try {
      await navigator.clipboard.writeText(linkPopover.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      // Ignore clipboard failures
    }
  };

  const applyWikiCandidate = (candidate: WikiCandidate) => {
    let targetNote: Entry | null = null;
    if (candidate.kind === 'note') {
      targetNote = candidate.note;
    } else if (onCreateLinkedNote) {
      targetNote = onCreateLinkedNote(candidate.title);
    }
    if (targetNote) {
      const chain = editor.chain().focus();
      if (wikiRangeRef.current) chain.deleteRange(wikiRangeRef.current);
      chain
        .insertContent([
          {
            type: 'wikiLink',
            attrs: {
              noteId: targetNote.id,
              title: targetNote.title || 'Untitled Note',
            },
          },
          { type: 'text', text: ' ' },
        ])
        .run();
    }
    setWikiOpen(false);
    setWikiQuery('');
  };

  const ToolbarBtn: React.FC<{
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    label: string;
    children: React.ReactNode;
    size?: 'sm' | 'md';
  }> = ({ active, disabled, onClick, label, children, size = 'md' }) => (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={label}
      aria-label={label}
      className={`${
        size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
      } flex items-center justify-center rounded-md transition-colors disabled:opacity-35 hover:bg-[var(--bg-surface-hover)]`}
      style={{
        backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
      }}
    >
      {children}
    </button>
  );

  const wikiMenu = wikiOpen && wikiCandidates.length > 0 && (
    <div
      className={`${
        wikiCoords ? 'fixed' : 'absolute left-2 bottom-2'
      } z-[70] w-66 rounded-xl border p-1.5 space-y-0.5 max-h-[280px] overflow-y-auto`}
      style={{
        ...(wikiCoords ? { top: wikiCoords.top, left: wikiCoords.left } : {}),
        backgroundColor: 'var(--bg-elevated)',
        borderColor: 'var(--border-strong)',
        boxShadow: 'var(--shadow-popover)',
      }}
    >
      <div
        className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider flex items-center justify-between"
        style={{ color: 'var(--text-muted)' }}
      >
        <span>Link to Note</span>
        <span className="font-mono text-[10px] opacity-70">↵</span>
      </div>
      {wikiCandidates.map((cand, idx) => {
        const active = idx === wikiIndex;
        const key = cand.kind === 'note' ? cand.note.id : `create:${cand.title}`;
        return (
          <button
            key={key}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              applyWikiCandidate(cand);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors"
            style={{
              backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-primary)',
            }}
          >
            {cand.kind === 'note' ? (
              <>
                <FileText className="w-3.5 h-3.5 shrink-0 opacity-80" />
                <span className="text-xs font-medium truncate">
                  {cand.note.title || 'Untitled Note'}
                </span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs font-medium truncate">
                  Create &ldquo;{cand.title}&rdquo;
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );

  const slashMenu = slashOpen && filteredSlash.length > 0 && (
    <div
      className={`${
        slashCoords ? 'fixed' : 'absolute left-2 bottom-2'
      } z-[70] w-62 rounded-xl border p-1.5 space-y-0.5 max-h-[300px] overflow-y-auto`}
      style={{
        ...(slashCoords ? { top: slashCoords.top, left: slashCoords.left } : {}),
        backgroundColor: 'var(--bg-elevated)',
        borderColor: 'var(--border-strong)',
        boxShadow: 'var(--shadow-popover)',
      }}
    >
      <div
        className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider flex items-center justify-between"
        style={{ color: 'var(--text-muted)' }}
      >
        <span>Insert Block</span>
        <span className="font-mono text-[10px] opacity-70">↵</span>
      </div>
      {filteredSlash.map((item, idx) => {
        const Icon = item.icon;
        const active = idx === slashIndex;
        return (
          <button
            key={item.id}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              applySlashItem(item);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors"
            style={{
              backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-primary)',
            }}
          >
            <span
              className="w-6 h-6 rounded-md border flex items-center justify-center shrink-0"
              style={{
                backgroundColor: active ? 'transparent' : 'var(--bg-surface-subtle)',
                borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
              }}
            >
              <Icon className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium leading-tight">{item.label}</div>
              <div
                className="text-[10.5px] leading-tight truncate mt-0.5"
                style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {item.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );

  const linkPopoverNode = linkPopover && (
    <div
      className={`kanso-link-popover fixed z-[75] w-[304px] rounded-xl border p-2.5 ${
        linkPopover.placement === 'above' ? '-translate-y-full' : ''
      }`}
      style={{
        top: linkPopover.top,
        left: linkPopover.left,
        backgroundColor: 'var(--bg-elevated)',
        borderColor: 'var(--border-strong)',
        boxShadow: 'var(--shadow-popover)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {linkPopover.mode === 'view' ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 min-w-0">
            <Globe
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: 'var(--accent)' }}
            />
            <span
              className="text-xs font-mono truncate flex-1 min-w-0"
              style={{ color: 'var(--text-secondary)' }}
              title={linkPopover.href}
            >
              {linkPopover.href}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={normalizeSafeUrl(linkPopover.href) || linkPopover.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setLinkPopover(null)}
              className="h-7 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-fg)',
              }}
            >
              <ExternalLink className="w-3 h-3" />
              <span>Open</span>
            </a>
            <button
              type="button"
              onClick={() => void handleCopyLinkUrl()}
              className="h-7 px-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: linkCopied ? 'var(--success)' : 'var(--text-secondary)',
              }}
            >
              {linkCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{linkCopied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLinkUrlDraft(linkPopover.href);
                setLinkTextDraft(linkPopover.text);
                setLinkError('');
                setLinkPopover({ ...linkPopover, mode: 'edit' });
              }}
              className="h-7 px-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <Pencil className="w-3 h-3" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={handleUnlinkPopover}
              title="Remove link"
              aria-label="Remove link"
              className="h-7 w-7 ml-auto rounded-lg border flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--danger)',
              }}
            >
              <Unlink className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSaveLinkPopover} className="space-y-2">
          <div className="flex items-center justify-between">
            <span
              className="text-[10.5px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              {linkPopover.hasExistingLink ? 'Edit Link' : 'Insert Web Link'}
            </span>
            <button
              type="button"
              onClick={() => setLinkPopover(null)}
              aria-label="Close link editor"
              className="h-5 w-5 rounded flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            ref={linkUrlInputRef}
            type="text"
            value={linkUrlDraft}
            onChange={(e) => {
              setLinkUrlDraft(e.target.value);
              if (linkError) setLinkError('');
            }}
            placeholder="https://example.com"
            aria-label="Link URL"
            className="w-full h-8 px-2.5 rounded-lg border text-xs font-mono outline-none focus:border-[var(--accent)]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
          <input
            type="text"
            value={linkTextDraft}
            onChange={(e) => setLinkTextDraft(e.target.value)}
            placeholder="Link label (optional)"
            aria-label="Link text"
            className="w-full h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
          {linkError && (
            <p className="text-[11px]" style={{ color: 'var(--danger)' }}>
              {linkError}
            </p>
          )}
          <div className="flex items-center justify-between gap-1.5 pt-0.5">
            {linkPopover.hasExistingLink ? (
              <button
                type="button"
                onClick={handleUnlinkPopover}
                className="h-7 px-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--danger)',
                }}
              >
                <Unlink className="w-3 h-3" />
                <span>Unlink</span>
              </button>
            ) : (
              <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                Tip: [label](url)
              </span>
            )}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setLinkPopover(null)}
                className="h-7 px-2.5 rounded-lg border text-xs font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-7 px-3 rounded-lg text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-fg)',
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );

  const TableActionBtn: React.FC<{
    active?: boolean;
    disabled?: boolean;
    danger?: boolean;
    onClick: () => void;
    label: string;
    children: React.ReactNode;
  }> = ({ active, disabled, danger, onClick, label, children }) => (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={label}
      aria-label={label}
      className="h-7 px-2 shrink-0 inline-flex items-center gap-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-35"
      style={{
        backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
        color: danger
          ? 'var(--danger)'
          : active
            ? 'var(--accent)'
            : 'var(--text-secondary)',
      }}
    >
      {children}
    </button>
  );

  const tableControlsBar = isTableActive && (
    <div
      role="toolbar"
      aria-label="Table controls"
      className="sticky top-0 z-20 mb-3 flex items-center gap-0.5 overflow-x-auto no-scrollbar rounded-xl border px-1.5 py-1 backdrop-blur-md"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-surface) 92%, transparent)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <TableActionBtn
        disabled={!editor.can().addRowBefore()}
        onClick={() => editor.chain().focus().addRowBefore().run()}
        label="Add row above"
      >
        <BetweenHorizontalStart className="w-3.5 h-3.5" />
        <span>+Row ↑</span>
      </TableActionBtn>
      <TableActionBtn
        disabled={!editor.can().addRowAfter()}
        onClick={() => editor.chain().focus().addRowAfter().run()}
        label="Add row below"
      >
        <BetweenHorizontalEnd className="w-3.5 h-3.5" />
        <span>+Row ↓</span>
      </TableActionBtn>
      <TableActionBtn
        disabled={!editor.can().deleteRow()}
        onClick={() => editor.chain().focus().deleteRow().run()}
        label="Delete row"
      >
        <span>−Row</span>
      </TableActionBtn>

      <span
        className="mx-1 h-4 w-px shrink-0"
        style={{ backgroundColor: 'var(--border-subtle)' }}
        aria-hidden="true"
      />

      <TableActionBtn
        disabled={!editor.can().addColumnBefore()}
        onClick={() => editor.chain().focus().addColumnBefore().run()}
        label="Add column left"
      >
        <BetweenVerticalStart className="w-3.5 h-3.5" />
        <span>+Col ←</span>
      </TableActionBtn>
      <TableActionBtn
        disabled={!editor.can().addColumnAfter()}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        label="Add column right"
      >
        <BetweenVerticalEnd className="w-3.5 h-3.5" />
        <span>+Col →</span>
      </TableActionBtn>
      <TableActionBtn
        disabled={!editor.can().deleteColumn()}
        onClick={() => editor.chain().focus().deleteColumn().run()}
        label="Delete column"
      >
        <span>−Col</span>
      </TableActionBtn>

      <span
        className="mx-1 h-4 w-px shrink-0"
        style={{ backgroundColor: 'var(--border-subtle)' }}
        aria-hidden="true"
      />

      <TableActionBtn
        active={tableHasHeader}
        disabled={!editor.can().toggleHeaderRow()}
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
        label="Toggle header row"
      >
        <PanelTop className="w-3.5 h-3.5" />
        <span>Header</span>
      </TableActionBtn>

      <span
        className="mx-1 h-4 w-px shrink-0"
        style={{ backgroundColor: 'var(--border-subtle)' }}
        aria-hidden="true"
      />

      <ToolbarBtn
        size="sm"
        active={activeCellAlign === 'left'}
        onClick={() => applyTableColumnAlignment(editor, 'left')}
        label="Align column left"
      >
        <AlignLeft className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        size="sm"
        active={activeCellAlign === 'center'}
        onClick={() => applyTableColumnAlignment(editor, 'center')}
        label="Align column center"
      >
        <AlignCenter className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        size="sm"
        active={activeCellAlign === 'right'}
        onClick={() => applyTableColumnAlignment(editor, 'right')}
        label="Align column right"
      >
        <AlignRight className="w-3.5 h-3.5" />
      </ToolbarBtn>

      <span
        className="mx-1 h-4 w-px shrink-0"
        style={{ backgroundColor: 'var(--border-subtle)' }}
        aria-hidden="true"
      />

      <TableActionBtn
        onClick={() => autoFitTableColumns(editor)}
        label="Auto-fit all column widths (or double-click column border)"
      >
        <ArrowLeftRight className="w-3.5 h-3.5" />
        <span>Auto-fit</span>
      </TableActionBtn>
      <TableActionBtn
        active={freezeFirstCol}
        onClick={() =>
          editor
            .chain()
            .focus()
            .updateAttributes('table', { freezeFirstCol: !freezeFirstCol })
            .run()
        }
        label={freezeFirstCol ? 'Unfreeze first column' : 'Freeze first column'}
      >
        <PanelLeft className="w-3.5 h-3.5" />
        <span>Freeze 1st</span>
      </TableActionBtn>
      <TableActionBtn
        active={tableCellMode === 'truncate'}
        onClick={() =>
          editor
            .chain()
            .focus()
            .updateAttributes('table', {
              cellMode: tableCellMode === 'truncate' ? 'wrap' : 'truncate',
            })
            .run()
        }
        label={
          tableCellMode === 'truncate'
            ? 'Switch to wrapped multi-line cells'
            : 'Switch to compact single-line cells'
        }
      >
        <WrapText className="w-3.5 h-3.5" />
        <span>{tableCellMode === 'truncate' ? 'Compact' : 'Wrap'}</span>
      </TableActionBtn>
      <TableActionBtn
        active={tableViewMode === 'cards'}
        onClick={() =>
          editor
            .chain()
            .focus()
            .updateAttributes('table', {
              viewMode: tableViewMode === 'cards' ? 'table' : 'cards',
            })
            .run()
        }
        label={
          tableViewMode === 'cards'
            ? 'Switch back to table grid'
            : 'View and edit rows as stacked cards'
        }
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        <span>{tableViewMode === 'cards' ? 'Table' : 'Cards'}</span>
      </TableActionBtn>

      <span
        className="mx-1 h-4 w-px shrink-0"
        style={{ backgroundColor: 'var(--border-subtle)' }}
        aria-hidden="true"
      />

      <TableActionBtn
        danger
        disabled={!editor.can().deleteTable()}
        onClick={() => editor.chain().focus().deleteTable().run()}
        label="Delete table"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>Delete</span>
      </TableActionBtn>
    </div>
  );

  // ================= BORDERLESS CANVAS VARIANT =================
  if (variant === 'borderless') {
    return (
      <div ref={wrapperRef} className="relative">
        {/* Subtle Desktop Editorial Toolbar for DetailSheet */}
        <div
          role="toolbar"
          aria-label="Editor formatting"
          className="hidden lg:flex items-center gap-0.5 pb-2.5 mb-3 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <ToolbarBtn
            size="sm"
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            label="Heading 2"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            size="sm"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            label="Bold"
          >
            <Bold className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            size="sm"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            label="Italic"
          >
            <Italic className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            size="sm"
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            label="Strikethrough"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            size="sm"
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
            label="Inline code"
          >
            <Code className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            size="sm"
            active={editor.isActive('link')}
            onClick={() => openLinkPopoverForEditor(editor, 'edit')}
            label="Insert or edit web link"
          >
            <Link2 className="w-3.5 h-3.5" />
          </ToolbarBtn>

          <span
            className="mx-1 h-4 w-px"
            style={{ backgroundColor: 'var(--border-subtle)' }}
            aria-hidden="true"
          />

          <ToolbarBtn
            size="sm"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            label="Bullet list"
          >
            <List className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            size="sm"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            label="Numbered list"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            size="sm"
            active={editor.isActive('taskList')}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            label="Checklist"
          >
            <CheckSquare className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            size="sm"
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            label="Quote"
          >
            <Quote className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            size="sm"
            active={isCodeBlockActive}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            label="Code block"
          >
            <Terminal className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            size="sm"
            active={isTableActive}
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            label="Insert table"
          >
            <Table2 className="w-3.5 h-3.5" />
          </ToolbarBtn>

          {isCodeBlockActive && (
            <select
              value={currentCodeLang}
              onChange={(e) =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes('codeBlock', { language: e.target.value })
                  .run()
              }
              aria-label="Code language"
              className="h-7 px-2 rounded-md border text-[11px] font-mono outline-none ml-1"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {CODE_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          )}

          <div className="ml-auto flex items-center gap-0.5">
            <ToolbarBtn
              size="sm"
              disabled={!editor.can().undo()}
              onClick={() => editor.chain().focus().undo().run()}
              label="Undo"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              size="sm"
              disabled={!editor.can().redo()}
              onClick={() => editor.chain().focus().redo().run()}
              label="Redo"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </ToolbarBtn>
          </div>
        </div>

        {/* Mobile Code Block language selector (when inside code block on mobile) */}
        {isCodeBlockActive && (
          <div className="lg:hidden flex items-center justify-end gap-2 mb-2">
            <span
              className="text-[11px] font-mono inline-flex items-center gap-1"
              style={{ color: 'var(--text-muted)' }}
            >
              <Terminal className="w-3 h-3" />
              <span>Code language</span>
            </span>
            <select
              value={currentCodeLang}
              onChange={(e) =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes('codeBlock', { language: e.target.value })
                  .run()
              }
              aria-label="Code language"
              className="h-7 px-2 rounded-md border text-[11px] font-mono outline-none"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {CODE_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>
        )}

        {tableControlsBar}

        {/* Floating Selection Toolbar (appears above highlighted text on desktop & touch) */}
        {selectionBar && (
          <div
            role="toolbar"
            aria-label="Text formatting"
            className="fixed z-[65] -translate-x-1/2 flex items-center gap-0.5 px-1.5 py-1 rounded-xl border"
            style={{
              top: selectionBar.top,
              left: selectionBar.left,
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-strong)',
              boxShadow: 'var(--shadow-popover)',
            }}
          >
            <ToolbarBtn
              size="sm"
              active={editor.isActive('bold')}
              onClick={() => editor.chain().focus().toggleBold().run()}
              label="Bold"
            >
              <Bold className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              size="sm"
              active={editor.isActive('italic')}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              label="Italic"
            >
              <Italic className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              size="sm"
              active={editor.isActive('strike')}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              label="Strikethrough"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              size="sm"
              active={editor.isActive('code')}
              onClick={() => editor.chain().focus().toggleCode().run()}
              label="Inline code"
            >
              <Code className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              size="sm"
              active={editor.isActive('link')}
              onClick={() => openLinkPopoverForEditor(editor, 'edit')}
              label="Insert or edit web link"
            >
              <Link2 className="w-3.5 h-3.5" />
            </ToolbarBtn>

            <span
              className="mx-0.5 h-4 w-px"
              style={{ backgroundColor: 'var(--border-subtle)' }}
              aria-hidden="true"
            />

            <ToolbarBtn
              size="sm"
              active={editor.isActive('heading', { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              label="Heading 2"
            >
              <Heading2 className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              size="sm"
              active={editor.isActive('blockquote')}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              label="Quote"
            >
              <Quote className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              size="sm"
              active={editor.isActive('bulletList')}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              label="Bullet list"
            >
              <List className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              size="sm"
              active={editor.isActive('taskList')}
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              label="Checklist"
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </ToolbarBtn>
          </div>
        )}

        {/* Pure Borderless Writing Canvas */}
        <div
          className="kanso-tiptap kanso-notion-editor cursor-text"
          style={{ minHeight }}
          onClick={() => {
            if (!editor.isFocused) editor.commands.focus();
          }}
        >
          <EditorContent editor={editor} />
        </div>

        {slashMenu}
        {wikiMenu}
        {linkPopoverNode}
      </div>
    );
  }

  // ================= DEFAULT BOXED VARIANT =================
  return (
    <div
      ref={wrapperRef}
      className="relative rounded-xl border overflow-visible transition-colors"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div
        className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b rounded-t-xl"
        style={{
          backgroundColor: 'var(--bg-surface-subtle)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <ToolbarBtn
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          label="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="Bold"
        >
          <Bold className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label="Italic"
        >
          <Italic className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          label="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
          label="Inline code"
        >
          <Code className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('link')}
          onClick={() => openLinkPopoverForEditor(editor, 'edit')}
          label="Insert or edit web link"
        >
          <Link2 className="w-4 h-4" />
        </ToolbarBtn>

        <span
          className="mx-1 h-4 w-px"
          style={{ backgroundColor: 'var(--border-strong)' }}
          aria-hidden="true"
        />

        <ToolbarBtn
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          label="Bullet list"
        >
          <List className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          label="Numbered list"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('taskList')}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          label="Task list"
        >
          <CheckSquare className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          label="Quote"
        >
          <Quote className="w-4 h-4" />
        </ToolbarBtn>

        <span
          className="mx-1 h-4 w-px"
          style={{ backgroundColor: 'var(--border-strong)' }}
          aria-hidden="true"
        />

        <ToolbarBtn
          active={isCodeBlockActive}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          label="Code block"
        >
          <Terminal className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          active={isTableActive}
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          label="Insert table"
        >
          <Table2 className="w-4 h-4" />
        </ToolbarBtn>

        {isCodeBlockActive && (
          <select
            value={currentCodeLang}
            onChange={(e) =>
              editor
                .chain()
                .focus()
                .updateAttributes('codeBlock', { language: e.target.value })
                .run()
            }
            aria-label="Code language"
            className="h-7 px-2 rounded-md border text-[11px] font-mono outline-none ml-0.5"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            {CODE_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarBtn
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
            label="Undo"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
            label="Redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </ToolbarBtn>
        </div>
      </div>

      {isTableActive && (
        <div
          className="px-2 pt-2"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          {tableControlsBar}
        </div>
      )}

      <div className="kanso-tiptap px-4 py-3" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>

      {slashMenu}
      {wikiMenu}
      {linkPopoverNode}
    </div>
  );
};

/* ============================================================================
   Mobile Thumb-Zone Formatting Toolbar (Pinned at bottom of mobile DetailSheet)
   ============================================================================ */

interface TiptapThumbToolbarProps {
  editor: Editor | null;
  onDone: () => void;
}

export const TiptapThumbToolbar: React.FC<TiptapThumbToolbarProps> = ({ editor, onDone }) => {
  const [, bump] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const sync = () => bump((n) => (n + 1) % 10000);
    editor.on('selectionUpdate', sync);
    editor.on('transaction', sync);
    return () => {
      editor.off('selectionUpdate', sync);
      editor.off('transaction', sync);
    };
  }, [editor]);

  const ThumbBtn: React.FC<{
    active?: boolean;
    disabled?: boolean;
    onAction: () => void;
    label: string;
    children: React.ReactNode;
  }> = ({ active, disabled, onAction, label, children }) => (
    <button
      type="button"
      disabled={disabled || !editor}
      onMouseDown={(e) => {
        e.preventDefault();
        onAction();
      }}
      title={label}
      aria-label={label}
      className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg transition-colors disabled:opacity-35"
      style={{
        backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
      }}
    >
      {children}
    </button>
  );

  return (
    <div
      className="lg:hidden shrink-0 border-t pb-safe"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <div className="flex-1 flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          <ThumbBtn
            onAction={() => {
              if (!editor) return;
              editor.chain().focus().insertContent('/').run();
            }}
            label="Insert block (/)"
          >
            <Slash className="w-4 h-4" />
          </ThumbBtn>
          <ThumbBtn
            active={editor?.isActive('heading', { level: 2 })}
            onAction={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            label="Heading 2"
          >
            <Heading2 className="w-4 h-4" />
          </ThumbBtn>
          <ThumbBtn
            active={editor?.isActive('bold')}
            onAction={() => editor?.chain().focus().toggleBold().run()}
            label="Bold"
          >
            <Bold className="w-4 h-4" />
          </ThumbBtn>
          <ThumbBtn
            active={editor?.isActive('italic')}
            onAction={() => editor?.chain().focus().toggleItalic().run()}
            label="Italic"
          >
            <Italic className="w-4 h-4" />
          </ThumbBtn>
          <ThumbBtn
            active={editor?.isActive('strike')}
            onAction={() => editor?.chain().focus().toggleStrike().run()}
            label="Strikethrough"
          >
            <Strikethrough className="w-4 h-4" />
          </ThumbBtn>
          <ThumbBtn
            active={editor?.isActive('code')}
            onAction={() => editor?.chain().focus().toggleCode().run()}
            label="Inline code"
          >
            <Code className="w-4 h-4" />
          </ThumbBtn>
          <ThumbBtn
            active={editor?.isActive('link')}
            onAction={() => {
              editor?.view.dom.dispatchEvent(new CustomEvent(OPEN_LINK_POPOVER_EVENT));
            }}
            label="Insert or edit web link"
          >
            <Link2 className="w-4 h-4" />
          </ThumbBtn>
          <ThumbBtn
            active={editor?.isActive('bulletList')}
            onAction={() => editor?.chain().focus().toggleBulletList().run()}
            label="Bullet list"
          >
            <List className="w-4 h-4" />
          </ThumbBtn>
          <ThumbBtn
            active={editor?.isActive('orderedList')}
            onAction={() => editor?.chain().focus().toggleOrderedList().run()}
            label="Numbered list"
          >
            <ListOrdered className="w-4 h-4" />
          </ThumbBtn>
          <ThumbBtn
            active={editor?.isActive('taskList')}
            onAction={() => editor?.chain().focus().toggleTaskList().run()}
            label="Checklist"
          >
            <CheckSquare className="w-4 h-4" />
          </ThumbBtn>
          <ThumbBtn
            active={editor?.isActive('blockquote')}
            onAction={() => editor?.chain().focus().toggleBlockquote().run()}
            label="Quote"
          >
            <Quote className="w-4 h-4" />
          </ThumbBtn>
          <ThumbBtn
            active={editor?.isActive('codeBlock')}
            onAction={() => editor?.chain().focus().toggleCodeBlock().run()}
            label="Code block"
          >
            <Terminal className="w-4 h-4" />
          </ThumbBtn>
          <ThumbBtn
            active={editor?.isActive('table')}
            onAction={() =>
              editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            label="Insert table"
          >
            <Table2 className="w-4 h-4" />
          </ThumbBtn>
          <ThumbBtn
            disabled={!editor?.can().undo()}
            onAction={() => editor?.chain().focus().undo().run()}
            label="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </ThumbBtn>
          <ThumbBtn
            disabled={!editor?.can().redo()}
            onAction={() => editor?.chain().focus().redo().run()}
            label="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </ThumbBtn>
        </div>

        <span
          className="h-5 w-px shrink-0 mx-0.5"
          style={{ backgroundColor: 'var(--border-subtle)' }}
          aria-hidden="true"
        />

        <button
          type="button"
          onClick={onDone}
          className="h-9 px-3.5 rounded-lg text-xs font-semibold shrink-0 transition-colors"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-fg)',
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
};
