import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Editor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlock from '@tiptap/extension-code-block';
import {
  Bold,
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Slash,
  Strikethrough,
  Terminal,
  Undo2,
} from 'lucide-react';

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
    id: 'divider',
    label: 'Divider',
    description: 'Horizontal rule separator',
    keywords: 'hr divider line rule',
    icon: Minus,
    action: (ed) => ed.chain().focus().setHorizontalRule().run(),
  },
];

function looksLikeMarkdown(text: string): boolean {
  return (
    /^#{1,3}\s+/m.test(text) ||
    /^[-*]\s+\[[ xX]\]\s+/m.test(text) ||
    /^[-*]\s+\S+/m.test(text) ||
    /^\d+\.\s+\S+/m.test(text) ||
    /^>\s+\S+/m.test(text) ||
    /^```/m.test(text) ||
    /\*\*[^*]+\*\*/.test(text)
  );
}

function escapeHtmlStr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMd(s: string): string {
  return escapeHtmlStr(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeLang = 'plaintext';
  let codeBuf: string[] = [];
  let listMode: 'ul' | 'ol' | 'task' | null = null;

  const closeList = () => {
    if (listMode === 'ul') out.push('</ul>');
    else if (listMode === 'ol') out.push('</ol>');
    else if (listMode === 'task') out.push('</ul>');
    listMode = null;
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
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
      closeList();
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      closeList();
      out.push('<hr />');
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (hMatch) {
      closeList();
      const lvl = hMatch[1].length;
      out.push(`<h${lvl}>${inlineMd(hMatch[2])}</h${lvl}>`);
      continue;
    }

    const taskMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      if (listMode !== 'task') {
        closeList();
        out.push('<ul data-type="taskList">');
        listMode = 'task';
      }
      const checked = taskMatch[1].toLowerCase() === 'x';
      out.push(
        `<li data-type="taskItem" data-checked="${checked ? 'true' : 'false'}"><p>${inlineMd(
          taskMatch[2]
        )}</p></li>`
      );
      continue;
    }

    const ulMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (listMode !== 'ul') {
        closeList();
        out.push('<ul>');
        listMode = 'ul';
      }
      out.push(`<li><p>${inlineMd(ulMatch[1])}</p></li>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (listMode !== 'ol') {
        closeList();
        out.push('<ol>');
        listMode = 'ol';
      }
      out.push(`<li><p>${inlineMd(olMatch[1])}</p></li>`);
      continue;
    }

    const qMatch = trimmed.match(/^>\s+(.*)$/);
    if (qMatch) {
      closeList();
      out.push(`<blockquote><p>${inlineMd(qMatch[1])}</p></blockquote>`);
      continue;
    }

    closeList();
    out.push(`<p>${inlineMd(line)}</p>`);
  }

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
}

export const TiptapEditor: React.FC<TiptapEditorProps> = ({
  docId,
  content,
  onChange,
  placeholder = 'Write notes, paste Markdown, or type / for blocks...',
  minHeight = 200,
  variant = 'default',
  onEditorReady,
}) => {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashCoords, setSlashCoords] = useState<{ top: number; left: number } | null>(null);
  const [selectionBar, setSelectionBar] = useState<FloatingPos | null>(null);
  const [, forceRerender] = useState(0);

  const slashRangeRef = useRef<{ from: number; to: number } | null>(null);
  const slashOpenRef = useRef(false);
  const slashIndexRef = useRef(0);
  const filteredSlashRef = useRef<SlashItem[]>(SLASH_ITEMS);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmittedHtmlRef = useRef<string>(content || '');
  const prevDocIdRef = useRef<string>(docId);

  const filteredSlash = useMemo(() => {
    const q = slashQuery.trim().toLowerCase();
    if (!q) return SLASH_ITEMS;
    return SLASH_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords.includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [slashQuery]);

  slashOpenRef.current = slashOpen;
  slashIndexRef.current = slashIndex;
  filteredSlashRef.current = filteredSlash;

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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      CustomCodeBlock,
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: content || '',
    editorProps: {
      handlePaste: (_view, event) => {
        const htmlData = event.clipboardData?.getData('text/html');
        const textData = event.clipboardData?.getData('text/plain');
        if (!htmlData && textData && looksLikeMarkdown(textData)) {
          event.preventDefault();
          const converted = markdownToHtml(textData);
          editorRef.current?.chain().focus().insertContent(converted).run();
          return true;
        }
        return false;
      },
      handleKeyDown: (_view, event) => {
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
            selected.action(activeEd);
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
      forceRerender((n) => (n + 1) % 10000);
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

      // Detect slash command token at cursor
      const { from } = ed.state.selection;
      const textBefore = ed.state.doc.textBetween(Math.max(0, from - 30), from, '\n');
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

  // Dismiss floating selection bar on scroll so it never drifts away from text
  useEffect(() => {
    if (!selectionBar && !slashOpen) return;
    const handleScroll = () => {
      if (selectionBar) setSelectionBar(null);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [selectionBar, slashOpen]);

  if (!editor) return null;

  const isCodeBlockActive = editor.isActive('codeBlock');
  const currentCodeLang = (editor.getAttributes('codeBlock')?.language as string) || 'plaintext';

  const applySlashItem = (item: SlashItem) => {
    if (slashRangeRef.current) {
      editor.chain().focus().deleteRange(slashRangeRef.current).run();
    }
    item.action(editor);
    setSlashOpen(false);
    setSlashQuery('');
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

  // ================= BORDERLESS CANVAS VARIANT =================
  if (variant === 'borderless') {
    return (
      <div ref={wrapperRef} className="relative">
        {/* Contextual Code Block language selector (only visible when cursor is inside code block) */}
        {isCodeBlockActive && (
          <div className="flex items-center justify-end gap-2 mb-2">
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

      <div className="kanso-tiptap px-4 py-3" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>

      {slashMenu}
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
