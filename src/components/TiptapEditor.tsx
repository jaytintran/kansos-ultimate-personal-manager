import React, { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {
  Bold,
  CheckSquare,
  Code,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Terminal,
} from 'lucide-react';

interface TiptapEditorProps {
  docId: string;
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export const TiptapEditor: React.FC<TiptapEditorProps> = ({
  docId,
  content,
  onChange,
  placeholder = 'Write details in markdown (# heading, **bold**, - list, [ ] checklist)...',
  minHeight = 200,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: content || '',
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      onChange(html === '<p></p>' ? '' : html);
    },
  });

  // Sync content when switching to a different document
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    const normalizedCurrent = currentHtml === '<p></p>' ? '' : currentHtml;
    const normalizedNext = content || '';
    if (normalizedCurrent !== normalizedNext) {
      editor.commands.setContent(normalizedNext, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, editor]);

  if (!editor) return null;

  const ToolbarBtn: React.FC<{
    active?: boolean;
    onClick: () => void;
    label: string;
    children: React.ReactNode;
  }> = ({ active, onClick, label, children }) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="h-8 w-8 flex items-center justify-center rounded-md transition-colors"
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
      className="rounded-xl border overflow-hidden transition-colors"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div
        className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b"
        style={{
          backgroundColor: 'var(--bg-surface-subtle)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <ToolbarBtn
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          label="Heading"
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
          label="Checklist"
        >
          <CheckSquare className="w-4 h-4" />
        </ToolbarBtn>

        <span
          className="mx-1 h-4 w-px"
          style={{ backgroundColor: 'var(--border-strong)' }}
          aria-hidden="true"
        />

        <ToolbarBtn
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          label="Quote"
        >
          <Quote className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
          label="Inline code"
        >
          <Code className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          label="Code block"
        >
          <Terminal className="w-4 h-4" />
        </ToolbarBtn>
      </div>

      <div className="kanso-tiptap px-4 py-3" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
