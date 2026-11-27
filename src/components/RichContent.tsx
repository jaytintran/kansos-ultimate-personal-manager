import React, { useMemo } from 'react';
import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common);

const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  jsx: 'javascript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  md: 'markdown',
  cs: 'csharp',
  'c#': 'csharp',
  'c++': 'cpp',
};

interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: string[] };
  children?: HastNode[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHast(node: HastNode): string {
  if (node.type === 'text') {
    return escapeHtml(node.value || '');
  }
  if (node.type === 'element' && node.tagName) {
    const cls = node.properties?.className?.join(' ');
    const attr = cls ? ` class="${escapeHtml(cls)}"` : '';
    const inner = (node.children || []).map(renderHast).join('');
    return `<${node.tagName}${attr}>${inner}</${node.tagName}>`;
  }
  if (node.children) {
    return node.children.map(renderHast).join('');
  }
  return '';
}

function highlightCode(code: string, lang?: string | null): string {
  const rawLang = (lang || '').trim().toLowerCase();
  if (!rawLang || rawLang === 'plaintext' || rawLang === 'text' || rawLang === 'plain') {
    return escapeHtml(code);
  }
  const resolved = LANGUAGE_ALIASES[rawLang] || rawLang;
  try {
    if (lowlight.registered(resolved)) {
      const tree = lowlight.highlight(resolved, code) as unknown as HastNode;
      return renderHast(tree);
    }
    const auto = lowlight.highlightAuto(code) as unknown as HastNode;
    return renderHast(auto);
  } catch {
    return escapeHtml(code);
  }
}

function sanitizeTableStyle(rawStyle: string, tagName: string): string {
  const safeDecls: string[] = [];
  const decls = rawStyle.split(';');
  for (const decl of decls) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx <= 0) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim().toLowerCase();
    if (!val || /url\(|expression\(|javascript:/i.test(val)) continue;

    if ((tagName === 'th' || tagName === 'td') && prop === 'text-align') {
      if (val === 'left' || val === 'center' || val === 'right') {
        safeDecls.push(`text-align: ${val}`);
      }
    } else if (
      (tagName === 'table' || tagName === 'col') &&
      (prop === 'width' || prop === 'min-width')
    ) {
      if (/^\d+(?:\.\d+)?(px|%)$/.test(val)) {
        safeDecls.push(`${prop}: ${val}`);
      }
    }
  }
  return safeDecls.join('; ');
}

function processRichHtml(rawHtml: string): { html: string; hasTable: boolean } {
  if (!rawHtml || !rawHtml.trim()) return { html: '', hasTable: false };
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return { html: rawHtml, hasTable: /<table\b/i.test(rawHtml) };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    // Strip dangerous tags and event handlers
    doc.querySelectorAll('script, style, iframe, object, embed, link').forEach((el) => el.remove());
    doc.querySelectorAll('*').forEach((el) => {
      const tag = el.tagName.toLowerCase();
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const trimmedHref = name === 'href' ? attr.value.trim().toLowerCase() : '';
        if (
          name.startsWith('on') ||
          (name === 'href' &&
            (trimmedHref.startsWith('javascript:') ||
              trimmedHref.startsWith('data:') ||
              trimmedHref.startsWith('vbscript:')))
        ) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (name === 'style') {
          if (tag === 'table' || tag === 'col' || tag === 'th' || tag === 'td') {
            const safeStyle = sanitizeTableStyle(attr.value, tag);
            if (safeStyle) {
              el.setAttribute('style', safeStyle);
            } else {
              el.removeAttribute('style');
            }
          } else {
            el.removeAttribute('style');
          }
        }
      }

      if (tag === 'a') {
        const href = (el.getAttribute('href') || '').trim();
        if (/^#ts=\d+$/i.test(href)) {
          el.removeAttribute('target');
          el.removeAttribute('rel');
        } else if (href) {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }
      }

      if ((tag === 'th' || tag === 'td') && !el.getAttribute('style')) {
        const legacyAlign = (el.getAttribute('align') || '').trim().toLowerCase();
        if (legacyAlign === 'left' || legacyAlign === 'center' || legacyAlign === 'right') {
          el.setAttribute('style', `text-align: ${legacyAlign}`);
        }
      }
    });

    // Ensure every table is wrapped for clean borders & horizontal overflow
    const tables = Array.from(doc.querySelectorAll('table'));
    tables.forEach((table) => {
      const parent = table.parentElement;
      const alreadyWrapped =
        parent &&
        (parent.classList.contains('tableWrapper') ||
          parent.classList.contains('kanso-table-wrap'));
      if (!alreadyWrapped && parent) {
        const wrapper = doc.createElement('div');
        wrapper.className = 'kanso-table-wrap';
        parent.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      }
    });

    // Highlight <pre><code> blocks with lowlight on display
    doc.querySelectorAll('pre').forEach((pre) => {
      const codeEl = pre.querySelector('code');
      if (!codeEl) return;
      const preLang = pre.getAttribute('data-language');
      const codeClass = codeEl.getAttribute('class') || '';
      const classMatch = codeClass.match(/language-([a-z0-9+#-]+)/i);
      const lang = preLang || classMatch?.[1] || 'plaintext';
      const rawCode = codeEl.textContent || '';
      codeEl.innerHTML = highlightCode(rawCode, lang);
      if (lang && lang !== 'plaintext') {
        pre.setAttribute('data-language', lang);
      }
    });

    return {
      html: doc.body.innerHTML,
      hasTable: tables.length > 0,
    };
  } catch {
    return { html: rawHtml, hasTable: /<table\b/i.test(rawHtml) };
  }
}

interface RichContentProps {
  html: string;
  className?: string;
  fade?: boolean;
  onTimestampClick?: (seconds: number) => void;
}

export const RichContent: React.FC<RichContentProps> = ({
  html,
  className = '',
  fade = false,
  onTimestampClick,
}) => {
  const { html: processed, hasTable } = useMemo(() => processRichHtml(html), [html]);
  if (!processed) return null;

  return (
    <div
      className={`kanso-rich-content text-sm leading-relaxed ${fade ? 'kanso-card-fade' : ''} ${
        hasTable ? 'kanso-rich-has-table' : ''
      } ${className}`}
      style={{ color: 'var(--text-secondary)' }}
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
        const href = anchor?.getAttribute('href')?.trim() || '';
        const match = href.match(/^#ts=(\d+)$/i);
        if (match) {
          e.preventDefault();
          if (onTimestampClick) {
            e.stopPropagation();
            onTimestampClick(Number(match[1]));
          }
        }
      }}
      dangerouslySetInnerHTML={{ __html: processed }}
    />
  );
};
