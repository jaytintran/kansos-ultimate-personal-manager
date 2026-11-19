import { Entry } from '../types';
import { NOTE_STATUS_OPTIONS } from './noteTemplates';

export function stripHtmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(html: string): number {
  const text = stripHtmlToText(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export interface WikiLinkRef {
  targetId?: string;
  title: string;
}

export function extractWikiLinks(html: string): WikiLinkRef[] {
  if (!html) return [];
  const refs: WikiLinkRef[] = [];
  const seen = new Set<string>();

  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('[data-wiki-link]').forEach((el) => {
        const targetId = el.getAttribute('data-note-id') || undefined;
        const rawAttr = el.getAttribute('data-note-title');
        const textTitle = (el.textContent || '').replace(/^\[\[|\]\]$/g, '').trim();
        const title = (rawAttr || textTitle).trim();
        if (!title && !targetId) return;
        const key = `${targetId || ''}::${title.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          refs.push({ targetId, title });
        }
      });
    } catch {
      // Fallback to regex below
    }
  }

  // Also detect plain [[Title]] patterns in text
  const plain = stripHtmlToText(html);
  const regex = /\[\[([^[\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(plain)) !== null) {
    const title = match[1].trim();
    if (!title) continue;
    const key = `::${title.toLowerCase()}`;
    const alreadyByTitle = refs.some((r) => r.title.toLowerCase() === title.toLowerCase());
    if (!alreadyByTitle && !seen.has(key)) {
      seen.add(key);
      refs.push({ title });
    }
  }

  return refs;
}

export interface BacklinkMatch {
  note: Entry;
  snippet: string;
}

export function computeNoteBacklinks(target: Entry, allNotes: Entry[]): BacklinkMatch[] {
  const targetTitleLower = target.title.trim().toLowerCase();
  const matches: BacklinkMatch[] = [];

  for (const candidate of allNotes) {
    if (candidate.id === target.id || candidate.trashedAt) continue;
    const refs = extractWikiLinks(candidate.content);
    const hit = refs.find(
      (ref) =>
        ref.targetId === target.id ||
        (targetTitleLower.length > 0 && ref.title.trim().toLowerCase() === targetTitleLower)
    );
    if (!hit) continue;

    const plain = stripHtmlToText(candidate.content);
    let snippet = plain.slice(0, 150);
    const searchNeedle = `[[${hit.title}]]`;
    const idx = plain.toLowerCase().indexOf(searchNeedle.toLowerCase());
    if (idx >= 0) {
      const start = Math.max(0, idx - 48);
      const end = Math.min(plain.length, idx + searchNeedle.length + 72);
      snippet = `${start > 0 ? '…' : ''}${plain.slice(start, end).trim()}${
        end < plain.length ? '…' : ''
      }`;
    } else if (plain.length > 150) {
      snippet = `${plain.slice(0, 150)}…`;
    }

    matches.push({ note: candidate, snippet });
  }

  return matches;
}

function serializeInlineChildren(node: globalThis.Node): string {
  let out = '';
  node.childNodes.forEach((child) => {
    out += serializeNodeToMarkdown(child);
  });
  return out;
}

function serializeList(listEl: Element, ordered: boolean, depth = 0): string {
  const indent = '  '.repeat(depth);
  const items: string[] = [];
  let index = 1;

  Array.from(listEl.children).forEach((li) => {
    if (li.tagName.toLowerCase() !== 'li') return;
    const isTaskItem =
      listEl.getAttribute('data-type') === 'taskList' ||
      li.getAttribute('data-type') === 'taskItem';

    if (isTaskItem) {
      const checked =
        li.getAttribute('data-checked') === 'true' ||
        Boolean(li.querySelector('input[type="checkbox"]:checked'));
      const contentWrap = li.querySelector(':scope > div') || li;
      const lines: string[] = [];
      const nestedLists: string[] = [];
      Array.from(contentWrap.childNodes).forEach((child) => {
        if (child.nodeType === 1) {
          const tag = (child as Element).tagName.toLowerCase();
          if (tag === 'ul' || tag === 'ol') {
            nestedLists.push(serializeList(child as Element, tag === 'ol', depth + 1));
            return;
          }
          if (tag === 'label') return;
        }
        const part = serializeNodeToMarkdown(child).trim();
        if (part) lines.push(part);
      });
      items.push(`${indent}- [${checked ? 'x' : ' '}] ${lines.join(' ')}`);
      if (nestedLists.length > 0) {
        items.push(nestedLists.join('\n'));
      }
      return;
    }

    const textParts: string[] = [];
    const nestedLists: string[] = [];
    Array.from(li.childNodes).forEach((child) => {
      if (child.nodeType === 1) {
        const tag = (child as Element).tagName.toLowerCase();
        if (tag === 'ul' || tag === 'ol') {
          nestedLists.push(serializeList(child as Element, tag === 'ol', depth + 1));
          return;
        }
      }
      const part = serializeNodeToMarkdown(child).trim();
      if (part) textParts.push(part);
    });
    const bullet = ordered ? `${index++}.` : '-';
    items.push(`${indent}${bullet} ${textParts.join(' ')}`);
    if (nestedLists.length > 0) {
      items.push(nestedLists.join('\n'));
    }
  });

  return items.join('\n');
}

function serializeNodeToMarkdown(node: globalThis.Node): string {
  if (node.nodeType === 3) {
    return node.textContent || '';
  }
  if (node.nodeType !== 1) return '';

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  // Custom Notion Blocks
  if (el.hasAttribute('data-wiki-link')) {
    const title =
      el.getAttribute('data-note-title') ||
      (el.textContent || '').replace(/^\[\[|\]\]$/g, '').trim();
    return `[[${title}]]`;
  }

  if (el.getAttribute('data-type') === 'callout') {
    const tone = (el.getAttribute('data-tone') || 'note').toUpperCase();
    const inner = serializeInlineChildren(el)
      .trim()
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    return `> [!${tone}]\n${inner}\n\n`;
  }

  if (el.getAttribute('data-type') === 'toggle') {
    const summary = el.getAttribute('data-summary') || 'Details';
    const inner = serializeInlineChildren(el).trim();
    return `<details>\n<summary>${summary}</summary>\n\n${inner}\n\n</details>\n\n`;
  }

  if (el.getAttribute('data-type') === 'bookmark') {
    const url = el.getAttribute('data-url') || '';
    const title = el.getAttribute('data-title') || url;
    const desc = el.getAttribute('data-description') || '';
    return desc ? `- [${title}](${url}) — ${desc}\n\n` : `- [${title}](${url})\n\n`;
  }

  if (el.getAttribute('data-type') === 'image-embed') {
    const src = el.getAttribute('data-src') || '';
    const alt = el.getAttribute('data-alt') || el.getAttribute('data-caption') || 'image';
    const caption = el.getAttribute('data-caption') || '';
    return caption ? `![${alt}](${src})\n*${caption}*\n\n` : `![${alt}](${src})\n\n`;
  }

  switch (tag) {
    case 'h1':
      return `# ${serializeInlineChildren(el).trim()}\n\n`;
    case 'h2':
      return `## ${serializeInlineChildren(el).trim()}\n\n`;
    case 'h3':
      return `### ${serializeInlineChildren(el).trim()}\n\n`;
    case 'h4':
      return `#### ${serializeInlineChildren(el).trim()}\n\n`;
    case 'p': {
      const txt = serializeInlineChildren(el).trim();
      return txt ? `${txt}\n\n` : '\n';
    }
    case 'br':
      return '\n';
    case 'hr':
      return `---\n\n`;
    case 'strong':
    case 'b': {
      const txt = serializeInlineChildren(el);
      return txt ? `**${txt}**` : '';
    }
    case 'em':
    case 'i': {
      const txt = serializeInlineChildren(el);
      return txt ? `*${txt}*` : '';
    }
    case 's':
    case 'del':
    case 'strike': {
      const txt = serializeInlineChildren(el);
      return txt ? `~~${txt}~~` : '';
    }
    case 'u':
      return serializeInlineChildren(el);
    case 'code': {
      if (el.parentElement?.tagName.toLowerCase() === 'pre') {
        return el.textContent || '';
      }
      return `\`${el.textContent || ''}\``;
    }
    case 'pre': {
      const codeEl = el.querySelector('code');
      const langAttr = el.getAttribute('data-language') || '';
      const langClass = codeEl?.className.match(/language-([a-z0-9_-]+)/i)?.[1] || '';
      const lang = langAttr || langClass || '';
      const code = codeEl ? codeEl.textContent || '' : el.textContent || '';
      return `\`\`\`${lang}\n${code.replace(/\n$/, '')}\n\`\`\`\n\n`;
    }
    case 'blockquote': {
      const inner = serializeInlineChildren(el)
        .trim()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      return `${inner}\n\n`;
    }
    case 'ul':
      return `${serializeList(el, false)}\n\n`;
    case 'ol':
      return `${serializeList(el, true)}\n\n`;
    case 'a': {
      const href = el.getAttribute('href') || '';
      const label = serializeInlineChildren(el).trim() || href;
      return href ? `[${label}](${href})` : label;
    }
    case 'img': {
      const src = el.getAttribute('src') || '';
      const alt = el.getAttribute('alt') || 'image';
      return src ? `![${alt}](${src})\n\n` : '';
    }
    default:
      return serializeInlineChildren(el);
  }
}

export function noteToMarkdown(
  note: Entry,
  options?: { includeFrontmatter?: boolean; notebookName?: string }
): string {
  const includeFrontmatter = options?.includeFrontmatter ?? true;
  const parts: string[] = [];

  if (includeFrontmatter) {
    const statusLabel =
      NOTE_STATUS_OPTIONS.find((s) => s.id === (note.noteStatus ?? 'draft'))?.label || 'Draft';
    const metaLines: string[] = [
      '---',
      `title: "${(note.title || 'Untitled Note').replace(/"/g, '\\"')}"`,
      `status: ${statusLabel.toLowerCase()}`,
    ];
    if (options?.notebookName) {
      metaLines.push(`notebook: "${options.notebookName.replace(/"/g, '\\"')}"`);
    }
    if (note.tags.length > 0) {
      metaLines.push(`tags: [${note.tags.join(', ')}]`);
    }
    metaLines.push(`created: ${note.createdAt}`);
    if (note.updatedAt) {
      metaLines.push(`updated: ${note.updatedAt}`);
    }
    metaLines.push('---');
    parts.push(metaLines.join('\n'), '');
  }

  parts.push(`# ${note.title || 'Untitled Note'}`, '');

  if (note.content && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(note.content, 'text/html');
    const bodyMd = serializeInlineChildren(doc.body)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (bodyMd) parts.push(bodyMd);
  } else if (note.content) {
    parts.push(stripHtmlToText(note.content));
  }

  return `${parts.join('\n').trim()}\n`;
}

export function downloadNoteAsMarkdown(note: Entry, notebookName?: string): void {
  const markdown = noteToMarkdown(note, { includeFrontmatter: true, notebookName });
  const slug =
    (note.title || 'untitled-note')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'note';
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
