import React, { useEffect, useState } from 'react';
import {
  Node,
  NodeViewContent,
  NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
} from '@tiptap/react';
import CodeBlock from '@tiptap/extension-code-block';
import {
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  ImageOff,
  Maximize2,
  Minimize2,
  Trash2,
} from 'lucide-react';
import {
  extractNoteImageId,
  isLocalNoteImageUri,
  noteImageDb,
} from '../../lib/db';

// ============================================================================
// 1. Callout Block (Tone + Icon Selector, Hairline Kanso Styling)
// ============================================================================

const CALLOUT_TONES: Array<{
  tone: 'note' | 'tip' | 'important' | 'warn';
  label: string;
  icon: string;
  tint: string;
}> = [
  {
    tone: 'note',
    label: 'Note',
    icon: '💡',
    tint: 'var(--bg-surface-subtle)',
  },
  {
    tone: 'tip',
    label: 'Insight',
    icon: '🌿',
    tint: 'color-mix(in srgb, var(--success) 7%, var(--bg-surface-subtle))',
  },
  {
    tone: 'important',
    label: 'Key Point',
    icon: '⚡',
    tint: 'color-mix(in srgb, var(--accent) 8%, var(--bg-surface-subtle))',
  },
  {
    tone: 'warn',
    label: 'Caution',
    icon: '⚠️',
    tint: 'color-mix(in srgb, var(--warning) 9%, var(--bg-surface-subtle))',
  },
];

const CalloutNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes }) => {
  const tone = (node.attrs.tone as string) || 'note';
  const icon = (node.attrs.icon as string) || '💡';
  const meta = CALLOUT_TONES.find((t) => t.tone === tone) || CALLOUT_TONES[0];

  const cycleTone = () => {
    const idx = CALLOUT_TONES.findIndex((t) => t.tone === tone);
    const next = CALLOUT_TONES[(idx + 1) % CALLOUT_TONES.length];
    updateAttributes({ tone: next.tone, icon: next.icon });
  };

  return (
    <NodeViewWrapper
      data-type="callout"
      data-tone={tone}
      data-icon={icon}
      className="my-3 rounded-xl border px-3.5 py-3 flex items-start gap-3 transition-colors"
      style={{
        backgroundColor: meta.tint,
        borderColor: 'var(--border-subtle)',
      }}
    >
      <button
        type="button"
        contentEditable={false}
        onClick={cycleTone}
        title={`${meta.label} — click to cycle callout style`}
        aria-label={`Callout style: ${meta.label}. Click to cycle`}
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-base transition-colors hover:bg-[var(--bg-surface)] select-none"
      >
        {icon}
      </button>
      <div className="flex-1 min-w-0 kanso-callout-body">
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
};

export const CalloutNode = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: 'note',
        parseHTML: (el) => el.getAttribute('data-tone') || 'note',
        renderHTML: (attrs) => ({ 'data-tone': attrs.tone || 'note' }),
      },
      icon: {
        default: '💡',
        parseHTML: (el) => el.getAttribute('data-icon') || '💡',
        renderHTML: (attrs) => ({ 'data-icon': attrs.icon || '💡' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView);
  },
});

// ============================================================================
// 2. Toggle / Collapsible Block
// ============================================================================

const ToggleNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes }) => {
  const isOpen = node.attrs.open !== false && node.attrs.open !== 'false';
  const summary = (node.attrs.summary as string) ?? '';

  return (
    <NodeViewWrapper
      data-type="toggle"
      data-summary={summary}
      data-open={isOpen ? 'true' : 'false'}
      className="my-2.5 rounded-xl border px-3 py-2"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex items-center gap-1.5" contentEditable={false}>
        <button
          type="button"
          onClick={() => updateAttributes({ open: !isOpen })}
          className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-transform hover:bg-[var(--bg-surface-subtle)]"
          style={{ color: 'var(--text-secondary)' }}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Collapse toggle' : 'Expand toggle'}
        >
          <ChevronRight
            className={`w-4 h-4 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
          />
        </button>
        <input
          type="text"
          value={summary}
          onChange={(e) => updateAttributes({ summary: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Toggle heading..."
          className="flex-1 min-w-0 bg-transparent text-sm font-semibold outline-none py-0.5"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>
      <div className={isOpen ? 'pl-7 pt-1.5 pb-0.5' : 'hidden'}>
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
};

export const ToggleNode = Node.create({
  name: 'toggleBlock',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      summary: {
        default: 'Toggle details',
        parseHTML: (el) => el.getAttribute('data-summary') || 'Toggle details',
        renderHTML: (attrs) => ({ 'data-summary': attrs.summary || 'Toggle details' }),
      },
      open: {
        default: true,
        parseHTML: (el) => el.getAttribute('data-open') !== 'false',
        renderHTML: (attrs) => ({ 'data-open': attrs.open === false ? 'false' : 'true' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'toggle' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleNodeView);
  },
});

// ============================================================================
// 3. Code Block with Language Selector & Copy Button
// ============================================================================

const CODE_LANGUAGES = [
  { id: 'plaintext', label: 'Plain Text' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'bash', label: 'Shell / Bash' },
  { id: 'json', label: 'JSON' },
  { id: 'sql', label: 'SQL' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'rust', label: 'Rust' },
  { id: 'go', label: 'Go' },
];

const CodeBlockNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes }) => {
  const [copied, setCopied] = useState(false);
  const language = (node.attrs.language as string) || 'plaintext';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent || '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <NodeViewWrapper
      className="my-3 rounded-xl border overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-surface-subtle)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div
        contentEditable={false}
        className="flex items-center justify-between px-3 py-1.5 border-b text-xs"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-surface) 70%, var(--bg-surface-subtle))',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <select
          value={language}
          onChange={(e) => updateAttributes({ language: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label="Code block language"
          className="bg-transparent text-xs font-mono outline-none cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          {CODE_LANGUAGES.map((lang) => (
            <option key={lang.id} value={lang.id}>
              {lang.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors hover:bg-[var(--bg-surface-hover)]"
          style={{ color: copied ? 'var(--success)' : 'var(--text-secondary)' }}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      <pre className="!m-0 !border-0 !rounded-none !bg-transparent px-3.5 py-3 overflow-x-auto text-[13px] font-mono leading-relaxed">
        <NodeViewContent<'code'> as="code" />
      </pre>
    </NodeViewWrapper>
  );
};

export const CodeBlockWithLang = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      language: {
        default: 'plaintext',
        parseHTML: (el) =>
          el.getAttribute('data-language') ||
          el.querySelector('code')?.className.match(/language-([a-z0-9_-]+)/i)?.[1] ||
          'plaintext',
        renderHTML: (attrs) => ({
          'data-language': attrs.language || 'plaintext',
        }),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
});

// ============================================================================
// 4. Image Embed Block (URL / Data URL + Caption + Graceful Fallback)
// ============================================================================

const ImageEmbedNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, deleteNode }) => {
  const [imgError, setImgError] = useState(false);
  const src = (node.attrs.src as string) || '';
  const alt = (node.attrs.alt as string) || '';
  const caption = (node.attrs.caption as string) || '';
  const widthMode = (node.attrs.width as 'default' | 'wide') || 'default';

  const isLocalIdb = isLocalNoteImageUri(src);
  const [resolvedLocalSrc, setResolvedLocalSrc] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState<boolean>(isLocalIdb);

  useEffect(() => {
    setImgError(false);
    if (!isLocalIdb) {
      setResolvedLocalSrc(null);
      setLocalLoading(false);
      return;
    }
    let cancelled = false;
    setLocalLoading(true);
    const id = extractNoteImageId(src);
    void noteImageDb.getImage(id).then((dataUrl) => {
      if (cancelled) return;
      setResolvedLocalSrc(dataUrl);
      setLocalLoading(false);
      if (!dataUrl) setImgError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isLocalIdb, src]);

  const effectiveSrc = isLocalIdb ? (resolvedLocalSrc ?? '') : src;

  return (
    <NodeViewWrapper
      data-type="image-embed"
      data-src={src}
      data-alt={alt}
      data-caption={caption}
      data-width={widthMode}
      className="my-4 group relative"
      contentEditable={false}
    >
      <figure
        className={`rounded-xl border overflow-hidden mx-auto transition-all ${
          widthMode === 'wide' ? 'w-full' : 'max-w-xl'
        }`}
        style={{
          backgroundColor: 'var(--bg-surface-subtle)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="relative flex items-center justify-center min-h-[120px]">
          {localLoading ? (
            <div
              className="py-10 px-4 flex flex-col items-center gap-2 text-xs text-center"
              style={{ color: 'var(--text-muted)' }}
            >
              <span>Loading local image...</span>
            </div>
          ) : !effectiveSrc || imgError ? (
            <div
              className="py-10 px-4 flex flex-col items-center gap-2 text-xs text-center"
              style={{ color: 'var(--text-muted)' }}
            >
              <ImageOff className="w-6 h-6 opacity-70" />
              <span>
                {isLocalIdb
                  ? 'Local image is stored on another device only (not synced via Gist).'
                  : 'Image could not be loaded. Check the URL or replace with an upload.'}
              </span>
            </div>
          ) : (
            <img
              src={effectiveSrc}
              alt={alt || caption || 'Embedded note visual'}
              onError={() => setImgError(true)}
              className="w-full max-h-[460px] object-contain block"
            />
          )}

          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() =>
                updateAttributes({ width: widthMode === 'wide' ? 'default' : 'wide' })
              }
              title={widthMode === 'wide' ? 'Standard width' : 'Wide width'}
              aria-label="Toggle image width"
              className="h-7 w-7 rounded-lg border flex items-center justify-center backdrop-blur-sm"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 90%, transparent)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {widthMode === 'wide' ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={deleteNode}
              title="Remove image"
              aria-label="Remove image"
              className="h-7 w-7 rounded-lg border flex items-center justify-center backdrop-blur-sm"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 90%, transparent)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--danger)',
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <figcaption
          className="px-3 py-1.5 border-t"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}
        >
          <input
            type="text"
            value={caption}
            onChange={(e) => updateAttributes({ caption: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Write a caption..."
            className="w-full bg-transparent text-xs outline-none text-center"
            style={{ color: 'var(--text-secondary)' }}
          />
        </figcaption>
      </figure>
    </NodeViewWrapper>
  );
};

export const ImageEmbedNode = Node.create({
  name: 'imageEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-src') || el.getAttribute('src') || '',
        renderHTML: (attrs) => ({ 'data-src': attrs.src || '' }),
      },
      alt: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-alt') || el.getAttribute('alt') || '',
        renderHTML: (attrs) => ({ 'data-alt': attrs.alt || '' }),
      },
      caption: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-caption') || '',
        renderHTML: (attrs) => ({ 'data-caption': attrs.caption || '' }),
      },
      width: {
        default: 'default',
        parseHTML: (el) => el.getAttribute('data-width') || 'default',
        renderHTML: (attrs) => ({ 'data-width': attrs.width || 'default' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="image-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'image-embed' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageEmbedNodeView);
  },
});

// ============================================================================
// 5. Web Bookmark Card Block
// ============================================================================

function getDomainLabel(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl;
  }
}

const BookmarkNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, deleteNode }) => {
  const url = (node.attrs.url as string) || '';
  const title = (node.attrs.title as string) || '';
  const description = (node.attrs.description as string) || '';
  const domain = getDomainLabel(url);

  return (
    <NodeViewWrapper
      data-type="bookmark"
      data-url={url}
      data-title={title}
      data-description={description}
      className="my-3 group"
      contentEditable={false}
    >
      <div
        className="rounded-xl border px-4 py-3 flex items-start justify-between gap-3 transition-colors"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
            <span className="truncate font-mono">{domain || 'Web Bookmark'}</span>
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => updateAttributes({ title: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Bookmark title..."
            className="w-full bg-transparent text-sm font-semibold outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          <input
            type="text"
            value={description}
            onChange={(e) => updateAttributes({ description: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Add short note or context..."
            className="w-full bg-transparent text-xs outline-none"
            style={{ color: 'var(--text-secondary)' }}
          />
        </div>

        <div className="flex items-center gap-1 shrink-0 pt-0.5">
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${url}`}
              aria-label={`Open ${title || url}`}
              className="h-8 w-8 rounded-lg border flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-subtle)]"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--accent)',
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={deleteNode}
            title="Remove bookmark"
            aria-label="Remove bookmark"
            className="h-8 w-8 rounded-lg border flex items-center justify-center opacity-70 hover:opacity-100 transition-colors"
            style={{
              borderColor: 'var(--border-subtle)',
              color: 'var(--danger)',
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const BookmarkNode = Node.create({
  name: 'bookmarkCard',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-url') || '',
        renderHTML: (attrs) => ({ 'data-url': attrs.url || '' }),
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-title') || '',
        renderHTML: (attrs) => ({ 'data-title': attrs.title || '' }),
      },
      description: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-description') || '',
        renderHTML: (attrs) => ({ 'data-description': attrs.description || '' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="bookmark"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'bookmark' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BookmarkNodeView);
  },
});

// ============================================================================
// 6. Bi-Directional [[WikiLink]] Inline Node
// ============================================================================

const WikiLinkNodeView: React.FC<NodeViewProps> = ({ node, extension }) => {
  const noteId = (node.attrs.noteId as string) || '';
  const title = (node.attrs.title as string) || 'Untitled';
  const storage = extension.storage as {
    onNavigate?: (targetId: string, title: string) => void;
  };

  return (
    <NodeViewWrapper as="span" className="inline align-baseline">
      <button
        type="button"
        contentEditable={false}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          storage.onNavigate?.(noteId, title);
        }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md text-[0.9em] font-medium transition-colors align-baseline hover:underline"
        style={{
          backgroundColor: 'var(--accent-soft)',
          color: 'var(--accent)',
        }}
        title={`Open note: ${title}`}
      >
        <FileText className="w-3 h-3 shrink-0" />
        <span>{title}</span>
      </button>
    </NodeViewWrapper>
  );
};

export interface WikiLinkStorage {
  onNavigate?: (targetId: string, title: string) => void;
}

export const WikiLinkNode = Node.create<Record<string, never>, WikiLinkStorage>({
  name: 'wikiLink',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,

  addStorage() {
    return {
      onNavigate: undefined,
    };
  },

  addAttributes() {
    return {
      noteId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-note-id') || '',
        renderHTML: (attrs) => ({ 'data-note-id': attrs.noteId || '' }),
      },
      title: {
        default: 'Untitled',
        parseHTML: (el) =>
          el.getAttribute('data-note-title') ||
          (el.textContent || '').replace(/^\[\[|\]\]$/g, '').trim() ||
          'Untitled',
        renderHTML: (attrs) => ({ 'data-note-title': attrs.title || 'Untitled' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-wiki-link]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const label = HTMLAttributes['data-note-title'] || 'Untitled';
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-wiki-link': '' }),
      `[[${label}]]`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkNodeView);
  },
});
