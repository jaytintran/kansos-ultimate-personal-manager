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

function processRichHtml(rawHtml: string): string {
  if (!rawHtml || !rawHtml.trim()) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return rawHtml;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    // Strip dangerous tags and event handlers
    doc.querySelectorAll('script, style, iframe, object, embed, link').forEach((el) => el.remove());
    doc.querySelectorAll('*').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || (name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:'))) {
          el.removeAttribute(attr.name);
        }
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

    return doc.body.innerHTML;
  } catch {
    return rawHtml;
  }
}

interface RichContentProps {
  html: string;
  className?: string;
  fade?: boolean;
}

export const RichContent: React.FC<RichContentProps> = ({ html, className = '', fade = false }) => {
  const processed = useMemo(() => processRichHtml(html), [html]);
  if (!processed) return null;

  return (
    <div
      className={`kanso-rich-content text-sm leading-relaxed ${fade ? 'kanso-card-fade' : ''} ${className}`}
      style={{ color: 'var(--text-secondary)' }}
      dangerouslySetInnerHTML={{ __html: processed }}
    />
  );
};
