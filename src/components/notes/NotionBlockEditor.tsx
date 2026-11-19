import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { NodeSelection } from '@tiptap/pm/state';
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Bookmark,
  CheckSquare,
  ChevronRight,
  Code,
  Copy,
  FileText,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Lightbulb,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Plus,
  Quote,
  Strikethrough,
  Terminal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Entry, NoteEditorFont } from '../../types';
import {
  BookmarkNode,
  CalloutNode,
  CodeBlockWithLang,
  ImageEmbedNode,
  ToggleNode,
  WikiLinkNode,
} from './NoteTiptapExtensions';

interface NotionBlockEditorProps {
  docId: string;
  content: string;
  onChange: (html: string) => void;
  fontMode: NoteEditorFont;
  allNotes: Entry[];
  onOpenNote: (noteId: string, title?: string) => void;
  onCreateLinkedNote: (title: string) => Entry;
}

interface SlashCommandItem {
  id: string;
  label: string;
  description: string;
  category: 'Basic' | 'Rich Blocks' | 'Media & Links';
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'paragraph',
    label: 'Text',
    description: 'Plain paragraph block',
    category: 'Basic',
    keywords: 'text paragraph p normal',
    icon: Pilcrow,
  },
  {
    id: 'h1',
    label: 'Heading 1',
    description: 'Large section title',
    category: 'Basic',
    keywords: 'h1 heading title large',
    icon: Heading1,
  },
  {
    id: 'h2',
    label: 'Heading 2',
    description: 'Medium subsection heading',
    category: 'Basic',
    keywords: 'h2 heading subtitle medium',
    icon: Heading2,
  },
  {
    id: 'h3',
    label: 'Heading 3',
    description: 'Compact subsection heading',
    category: 'Basic',
    keywords: 'h3 heading small',
    icon: Heading3,
  },
  {
    id: 'bulletList',
    label: 'Bullet List',
    description: 'Unordered list items',
    category: 'Basic',
    keywords: 'ul bullet list dots',
    icon: List,
  },
  {
    id: 'orderedList',
    label: 'Numbered List',
    description: 'Sequential numbered steps',
    category: 'Basic',
    keywords: 'ol numbered list steps',
    icon: ListOrdered,
  },
  {
    id: 'taskList',
    label: 'Checklist',
    description: 'Interactive to-do checkboxes',
    category: 'Basic',
    keywords: 'todo task check checkbox checklist',
    icon: CheckSquare,
  },
  {
    id: 'toggle',
    label: 'Toggle List',
    description: 'Collapsible details block',
    category: 'Rich Blocks',
    keywords: 'toggle collapse accordion details',
    icon: ChevronRight,
  },
  {
    id: 'callout',
    label: 'Callout',
    description: 'Highlighted note or key insight',
    category: 'Rich Blocks',
    keywords: 'callout note tip warning highlight box',
    icon: Lightbulb,
  },
  {
    id: 'blockquote',
    label: 'Quote',
    description: 'Editorial pull quote',
    category: 'Rich Blocks',
    keywords: 'quote blockquote citation',
    icon: Quote,
  },
  {
    id: 'codeBlock',
    label: 'Code Block',
    description: 'Syntax block with language selector',
    category: 'Rich Blocks',
    keywords: 'code snippet pre terminal',
    icon: Terminal,
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Subtle horizontal section line',
    category: 'Rich Blocks',
    keywords: 'hr divider separator line',
    icon: Minus,
  },
  {
    id: 'image',
    label: 'Image',
    description: 'Embed image via URL or file upload',
    category: 'Media & Links',
    keywords: 'image img photo picture upload',
    icon: ImageIcon,
  },
  {
    id: 'bookmark',
    label: 'Web Bookmark',
    description: 'Rich link preview card',
    category: 'Media & Links',
    keywords: 'bookmark link card url web',
    icon: Bookmark,
  },
  {
    id: 'wikiLink',
    label: 'Link to Note [[',
    description: 'Bi-directional wiki link to another page',
    category: 'Media & Links',
    keywords: 'wiki link note page reference [[',
    icon: FileText,
  },
];

interface TopLevelBlockInfo {
  index: number;
  pos: number;
  endPos: number;
  top: number;
  height: number;
  typeName: string;
}

export const NotionBlockEditor: React.FC<NotionBlockEditorProps> = ({
  docId,
  content,
  onChange,
  fontMode,
  allNotes,
  onOpenNote,
  onCreateLinkedNote,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Trigger states for Slash Menu (/), WikiLink Menu ([[), Floating Selection Toolbar, Hover Gutter
  const [slashState, setSlashState] = useState<{
    open: boolean;
    query: string;
    from: number;
    to: number;
    x: number;
    y: number;
    selectedIndex: number;
  }>({ open: false, query: '', from: 0, to: 0, x: 0, y: 0, selectedIndex: 0 });

  const [wikiState, setWikiState] = useState<{
    open: boolean;
    query: string;
    from: number;
    to: number;
    x: number;
    y: number;
    selectedIndex: number;
  }>({ open: false, query: '', from: 0, to: 0, x: 0, y: 0, selectedIndex: 0 });

  const [bubbleState, setBubbleState] = useState<{
    open: boolean;
    x: number;
    y: number;
    linkInputOpen: boolean;
    linkUrl: string;
  }>({ open: false, x: 0, y: 0, linkInputOpen: false, linkUrl: '' });

  const [hoveredBlock, setHoveredBlock] = useState<TopLevelBlockInfo | null>(null);
  const [blockMenuBlock, setBlockMenuBlock] = useState<TopLevelBlockInfo | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<{ index: number; top: number } | null>(
    null
  );

  // Clean in-editor modals for Image Embed & Bookmark Card
  const [imageModal, setImageModal] = useState<{
    open: boolean;
    url: string;
    caption: string;
    insertPos?: number;
  }>({ open: false, url: '', caption: '' });

  const [bookmarkModal, setBookmarkModal] = useState<{
    open: boolean;
    url: string;
    title: string;
    description: string;
    insertPos?: number;
  }>({ open: false, url: '', title: '', description: '' });

  // Refs for fresh closures inside ProseMirror handleKeyDown
  const onOpenNoteRef = useRef(onOpenNote);
  onOpenNoteRef.current = onOpenNote;
  const slashRef = useRef(slashState);
  slashRef.current = slashState;
  const wikiRef = useRef(wikiState);
  wikiRef.current = wikiState;
  const allNotesRef = useRef(allNotes);
  allNotesRef.current = allNotes;

  const filteredSlashCommands = useMemo(() => {
    const q = slashState.query.trim().toLowerCase();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.keywords.toLowerCase().includes(q)
    );
  }, [slashState.query]);
  const filteredSlashRef = useRef(filteredSlashCommands);
  filteredSlashRef.current = filteredSlashCommands;

  const wikiCandidates = useMemo(() => {
    const q = wikiState.query.trim().toLowerCase();
    return allNotes
      .filter((n) => !n.trashedAt && n.id !== docId)
      .filter((n) => !q || n.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allNotes, docId, wikiState.query]);
  const wikiCandidatesRef = useRef(wikiCandidates);
  wikiCandidatesRef.current = wikiCandidates;

  const clampPopoverCoords = useCallback((clientX: number, clientY: number, width = 272) => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    const x = Math.max(12, Math.min(clientX, vw - width - 16));
    const y = clientY + 280 > vh ? Math.max(16, clientY - 270) : clientY + 8;
    return { x, y };
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: {
            class: 'kanso-note-link',
            rel: 'noopener noreferrer',
            target: '_blank',
          },
        },
      }),
      Placeholder.configure({
        placeholder: 'Write freely, type "/" for blocks, or "[[" to link another note...',
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CalloutNode,
      ToggleNode,
      CodeBlockWithLang,
      ImageEmbedNode,
      BookmarkNode,
      WikiLinkNode,
    ],
    content: content || '',
    onCreate: ({ editor: ed }) => {
      const storage = ed.storage as unknown as {
        wikiLink?: { onNavigate?: (targetId: string, title: string) => void };
      };
      if (storage.wikiLink) {
        storage.wikiLink.onNavigate = (targetId, title) => {
          onOpenNoteRef.current(targetId, title);
        };
      }
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      onChange(html === '<p></p>' ? '' : html);
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        // Intercept navigation when Slash Menu is open
        if (slashRef.current.open) {
          const items = filteredSlashRef.current;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSlashState((prev) => ({
              ...prev,
              selectedIndex: items.length > 0 ? (prev.selectedIndex + 1) % items.length : 0,
            }));
            return true;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSlashState((prev) => ({
              ...prev,
              selectedIndex:
                items.length > 0 ? (prev.selectedIndex - 1 + items.length) % items.length : 0,
            }));
            return true;
          }
          if (event.key === 'Enter' && items.length > 0) {
            event.preventDefault();
            const chosen = items[slashRef.current.selectedIndex] || items[0];
            if (chosen) executeSlashCommandRef.current(chosen.id);
            return true;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setSlashState((prev) => ({ ...prev, open: false }));
            return true;
          }
        }

        // Intercept navigation when [[ WikiLink menu is open
        if (wikiRef.current.open) {
          const candidates = wikiCandidatesRef.current;
          const hasCreateOption =
            wikiRef.current.query.trim().length > 0 &&
            !candidates.some(
              (c) => c.title.trim().toLowerCase() === wikiRef.current.query.trim().toLowerCase()
            );
          const total = candidates.length + (hasCreateOption ? 1 : 0);

          if (event.key === 'ArrowDown' && total > 0) {
            event.preventDefault();
            setWikiState((prev) => ({
              ...prev,
              selectedIndex: (prev.selectedIndex + 1) % total,
            }));
            return true;
          }
          if (event.key === 'ArrowUp' && total > 0) {
            event.preventDefault();
            setWikiState((prev) => ({
              ...prev,
              selectedIndex: (prev.selectedIndex - 1 + total) % total,
            }));
            return true;
          }
          if (event.key === 'Enter' && total > 0) {
            event.preventDefault();
            const idx = wikiRef.current.selectedIndex;
            if (idx < candidates.length) {
              insertWikiLinkRef.current(candidates[idx]);
            } else if (hasCreateOption) {
              createAndInsertWikiLinkRef.current(wikiRef.current.query.trim());
            }
            return true;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setWikiState((prev) => ({ ...prev, open: false }));
            return true;
          }
        }

        return false;
      },
    },
  });

  // Keep wikiLink click callback fresh
  useEffect(() => {
    if (!editor) return;
    const storage = editor.storage as unknown as {
      wikiLink?: { onNavigate?: (targetId: string, title: string) => void };
    };
    if (storage.wikiLink) {
      storage.wikiLink.onNavigate = (targetId, title) => {
        onOpenNoteRef.current(targetId, title);
      };
    }
  }, [editor]);

  // Sync document content only when switching docId
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    const normalizedCurrent = currentHtml === '<p></p>' ? '' : currentHtml;
    const normalizedNext = content || '';
    if (normalizedCurrent !== normalizedNext) {
      editor.commands.setContent(normalizedNext, { emitUpdate: false });
    }
    setSlashState((prev) => ({ ...prev, open: false }));
    setWikiState((prev) => ({ ...prev, open: false }));
    setBubbleState((prev) => ({ ...prev, open: false, linkInputOpen: false }));
    setHoveredBlock(null);
    setBlockMenuBlock(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, editor]);

  // Helper to apply a Slash Command
  const executeSlashCommand = useCallback(
    (commandId: string) => {
      if (!editor) return;
      const { from, to, open } = slashRef.current;

      const chain = editor.chain().focus();
      if (open && to >= from) {
        chain.deleteRange({ from, to });
      }

      switch (commandId) {
        case 'paragraph':
          chain.setParagraph().run();
          break;
        case 'h1':
          chain.setHeading({ level: 1 }).run();
          break;
        case 'h2':
          chain.setHeading({ level: 2 }).run();
          break;
        case 'h3':
          chain.setHeading({ level: 3 }).run();
          break;
        case 'bulletList':
          chain.toggleBulletList().run();
          break;
        case 'orderedList':
          chain.toggleOrderedList().run();
          break;
        case 'taskList':
          chain.toggleTaskList().run();
          break;
        case 'blockquote':
          chain.toggleBlockquote().run();
          break;
        case 'codeBlock':
          chain.setCodeBlock({ language: 'typescript' }).run();
          break;
        case 'divider':
          chain.setHorizontalRule().run();
          break;
        case 'callout':
          chain
            .insertContent({
              type: 'callout',
              attrs: { tone: 'note', icon: '💡' },
              content: [{ type: 'paragraph' }],
            })
            .run();
          break;
        case 'toggle':
          chain
            .insertContent({
              type: 'toggleBlock',
              attrs: { summary: 'Toggle heading', open: true },
              content: [{ type: 'paragraph' }],
            })
            .run();
          break;
        case 'image':
          chain.run();
          setImageModal({
            open: true,
            url: '',
            caption: '',
            insertPos: editor.state.selection.from,
          });
          break;
        case 'bookmark':
          chain.run();
          setBookmarkModal({
            open: true,
            url: '',
            title: '',
            description: '',
            insertPos: editor.state.selection.from,
          });
          break;
        case 'wikiLink': {
          chain.insertContent('[[').run();
          break;
        }
        default:
          chain.run();
      }

      setSlashState((prev) => ({ ...prev, open: false }));
    },
    [editor]
  );
  const executeSlashCommandRef = useRef(executeSlashCommand);
  executeSlashCommandRef.current = executeSlashCommand;

  const insertWikiLink = useCallback(
    (target: Entry) => {
      if (!editor) return;
      const { from, to, open } = wikiRef.current;
      const chain = editor.chain().focus();
      if (open && to >= from) {
        chain.deleteRange({ from, to });
      }
      chain
        .insertContent([
          {
            type: 'wikiLink',
            attrs: { noteId: target.id, title: target.title || 'Untitled Note' },
          },
          { type: 'text', text: ' ' },
        ])
        .run();
      setWikiState((prev) => ({ ...prev, open: false }));
    },
    [editor]
  );
  const insertWikiLinkRef = useRef(insertWikiLink);
  insertWikiLinkRef.current = insertWikiLink;

  const createAndInsertWikiLink = useCallback(
    (title: string) => {
      const created = onCreateLinkedNote(title);
      insertWikiLink(created);
    },
    [insertWikiLink, onCreateLinkedNote]
  );
  const createAndInsertWikiLinkRef = useRef(createAndInsertWikiLink);
  createAndInsertWikiLinkRef.current = createAndInsertWikiLink;

  // Listen to selection & document changes to drive `/`, `[[`, and Bubble Toolbar
  useEffect(() => {
    if (!editor) return;

    const syncPopovers = () => {
      const { state, view } = editor;
      const { selection } = state;
      const { $from, from, to, empty } = selection;

      // 1. Check [[ Wiki Link trigger first
      if (empty && $from.parent.isTextblock && $from.parent.type.name !== 'codeBlock') {
        const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
        const wikiMatch = /\[\[([^\[\]]*)$/.exec(textBefore);
        if (wikiMatch) {
          const matchStart = from - wikiMatch[0].length;
          const coords = view.coordsAtPos(from);
          const pos = clampPopoverCoords(coords.left, coords.bottom, 280);
          setWikiState((prev) => ({
            open: true,
            query: wikiMatch[1],
            from: matchStart,
            to: from,
            x: pos.x,
            y: pos.y,
            selectedIndex: prev.open && prev.query === wikiMatch[1] ? prev.selectedIndex : 0,
          }));
          setSlashState((prev) => (prev.open ? { ...prev, open: false } : prev));
          setBubbleState((prev) => (prev.open ? { ...prev, open: false } : prev));
          return;
        }

        // 2. Check / Slash Command trigger
        const slashMatch = /(?:^|\s)\/([^\s]*)$/.exec(textBefore);
        if (slashMatch) {
          const slashToken = `/${slashMatch[1]}`;
          const matchStart = from - slashToken.length;
          const coords = view.coordsAtPos(from);
          const pos = clampPopoverCoords(coords.left, coords.bottom, 288);
          setSlashState((prev) => ({
            open: true,
            query: slashMatch[1],
            from: matchStart,
            to: from,
            x: pos.x,
            y: pos.y,
            selectedIndex: prev.open && prev.query === slashMatch[1] ? prev.selectedIndex : 0,
          }));
          setWikiState((prev) => (prev.open ? { ...prev, open: false } : prev));
          setBubbleState((prev) => (prev.open ? { ...prev, open: false } : prev));
          return;
        }
      }

      setSlashState((prev) => (prev.open ? { ...prev, open: false } : prev));
      setWikiState((prev) => (prev.open ? { ...prev, open: false } : prev));

      // 3. Floating Selection Toolbar (non-empty text selection, not atom NodeSelection)
      if (!empty && !(selection instanceof NodeSelection) && !editor.isActive('codeBlock')) {
        const startCoords = view.coordsAtPos(from);
        const endCoords = view.coordsAtPos(to);
        const centerX = (startCoords.left + endCoords.right) / 2;
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
        const clampedX = Math.max(16, Math.min(centerX - 175, vw - 366));
        const clampedY = Math.max(12, Math.min(startCoords.top, endCoords.top) - 50);
        const existingHref = (editor.getAttributes('link').href as string) || '';
        setBubbleState((prev) => ({
          open: true,
          x: clampedX,
          y: clampedY,
          linkInputOpen: prev.open ? prev.linkInputOpen : false,
          linkUrl: prev.linkInputOpen ? prev.linkUrl : existingHref,
        }));
      } else {
        setBubbleState((prev) =>
          prev.open ? { ...prev, open: false, linkInputOpen: false } : prev
        );
      }
    };

    editor.on('selectionUpdate', syncPopovers);
    editor.on('update', syncPopovers);
    return () => {
      editor.off('selectionUpdate', syncPopovers);
      editor.off('update', syncPopovers);
    };
  }, [editor, clampPopoverCoords]);

  // Compute top-level block positions for Hover Gutter (+ and Drag Grip)
  const getTopLevelBlocks = useCallback((): TopLevelBlockInfo[] => {
    if (!editor || !containerRef.current) return [];
    const { doc } = editor.state;
    const containerRect = containerRef.current.getBoundingClientRect();
    const blocks: TopLevelBlockInfo[] = [];

    let offset = 0;
    for (let i = 0; i < doc.childCount; i++) {
      const child = doc.child(i);
      const pos = offset;
      const endPos = pos + child.nodeSize;
      try {
        const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
        if (dom && typeof dom.getBoundingClientRect === 'function') {
          const rect = dom.getBoundingClientRect();
          blocks.push({
            index: i,
            pos,
            endPos,
            top: rect.top - containerRect.top,
            height: rect.height,
            typeName: child.type.name,
          });
        }
      } catch {
        // Ignore transient DOM layout miss
      }
      offset = endPos;
    }
    return blocks;
  }, [editor]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!editor || !containerRef.current || blockMenuBlock) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const relY = e.clientY - containerRect.top;
      const blocks = getTopLevelBlocks();
      const hit = blocks.find((b) => relY >= b.top - 4 && relY <= b.top + b.height + 4);
      if (hit) {
        setHoveredBlock(hit);
      }
    },
    [editor, blockMenuBlock, getTopLevelBlocks]
  );

  // Drag-and-drop block reordering
  const handleBlockDragStart = (e: React.DragEvent, block: TopLevelBlockInfo) => {
    setDraggingIndex(block.index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(block.index));
  };

  const handleContainerDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (draggingIndex === null || !containerRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const containerRect = containerRef.current.getBoundingClientRect();
    const relY = e.clientY - containerRect.top;
    const blocks = getTopLevelBlocks();
    if (blocks.length === 0) return;

    let targetIdx = blocks.length;
    let indicatorTop = blocks[blocks.length - 1].top + blocks[blocks.length - 1].height;
    for (const b of blocks) {
      if (relY < b.top + b.height / 2) {
        targetIdx = b.index;
        indicatorTop = b.top;
        break;
      }
    }
    setDropTargetIndex({ index: targetIdx, top: indicatorTop });
  };

  const handleContainerDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (draggingIndex === null || !editor) return;
    e.preventDefault();
    const blocks = getTopLevelBlocks();
    const fromIdx = draggingIndex;
    const rawToIdx = dropTargetIndex?.index ?? fromIdx;
    setDraggingIndex(null);
    setDropTargetIndex(null);

    if (fromIdx < 0 || fromIdx >= blocks.length) return;
    const adjustedTo = rawToIdx > fromIdx ? rawToIdx - 1 : rawToIdx;
    if (adjustedTo === fromIdx) return;

    const { state, view } = editor;
    const movingNode = state.doc.child(fromIdx);
    const fromPos = blocks[fromIdx].pos;
    const fromEnd = blocks[fromIdx].endPos;

    let tr = state.tr.delete(fromPos, fromEnd);
    // Compute insertion offset after deletion
    let insertPos = 0;
    for (let i = 0; i < adjustedTo && i < tr.doc.childCount; i++) {
      insertPos += tr.doc.child(i).nodeSize;
    }
    tr = tr.insert(insertPos, movingNode);
    view.dispatch(tr);
    view.focus();
  };

  const insertParagraphBelowBlock = (block: TopLevelBlockInfo, openSlash = true) => {
    if (!editor) return;
    const { state, view } = editor;
    const paragraphType = state.schema.nodes.paragraph;
    if (!paragraphType) return;

    if (openSlash) {
      const tr = state.tr.insert(
        block.endPos,
        paragraphType.create(null, state.schema.text('/'))
      );
      view.dispatch(tr);
      editor.chain().focus(block.endPos + 2).run();
    } else {
      const tr = state.tr.insert(block.endPos, paragraphType.create());
      view.dispatch(tr);
      editor.chain().focus(block.endPos + 1).run();
    }
    setBlockMenuBlock(null);
  };

  const moveBlockStep = (block: TopLevelBlockInfo, delta: -1 | 1) => {
    if (!editor) return;
    const blocks = getTopLevelBlocks();
    const targetIdx = block.index + delta;
    if (targetIdx < 0 || targetIdx >= blocks.length) return;
    const { state, view } = editor;
    const movingNode = state.doc.child(block.index);
    let tr = state.tr.delete(block.pos, block.endPos);
    let insertPos = 0;
    for (let i = 0; i < targetIdx && i < tr.doc.childCount; i++) {
      insertPos += tr.doc.child(i).nodeSize;
    }
    tr = tr.insert(insertPos, movingNode);
    view.dispatch(tr);
    setBlockMenuBlock(null);
  };

  const duplicateBlock = (block: TopLevelBlockInfo) => {
    if (!editor) return;
    const { state, view } = editor;
    const node = state.doc.child(block.index);
    const tr = state.tr.insert(block.endPos, node.copy(node.content));
    view.dispatch(tr);
    setBlockMenuBlock(null);
  };

  const deleteBlock = (block: TopLevelBlockInfo) => {
    if (!editor) return;
    const { state, view } = editor;
    if (state.doc.childCount <= 1) {
      editor.chain().focus().clearContent().run();
    } else {
      const tr = state.tr.delete(block.pos, block.endPos);
      view.dispatch(tr);
    }
    setBlockMenuBlock(null);
    setHoveredBlock(null);
  };

  const turnBlockInto = (block: TopLevelBlockInfo, target: string) => {
    if (!editor) return;
    editor.chain().focus(Math.min(block.pos + 1, editor.state.doc.content.size)).run();
    switch (target) {
      case 'paragraph':
        editor.chain().focus().setParagraph().run();
        break;
      case 'h1':
        editor.chain().focus().setHeading({ level: 1 }).run();
        break;
      case 'h2':
        editor.chain().focus().setHeading({ level: 2 }).run();
        break;
      case 'h3':
        editor.chain().focus().setHeading({ level: 3 }).run();
        break;
      case 'blockquote':
        editor.chain().focus().toggleBlockquote().run();
        break;
      case 'bulletList':
        editor.chain().focus().toggleBulletList().run();
        break;
      case 'taskList':
        editor.chain().focus().toggleTaskList().run();
        break;
      case 'codeBlock':
        editor.chain().focus().setCodeBlock({ language: 'typescript' }).run();
        break;
      case 'callout': {
        const text = editor.state.doc.child(block.index).textContent;
        editor
          .chain()
          .focus()
          .deleteRange({ from: block.pos, to: block.endPos })
          .insertContentAt(block.pos, {
            type: 'callout',
            attrs: { tone: 'note', icon: '💡' },
            content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
          })
          .run();
        break;
      }
      case 'toggle': {
        const text = editor.state.doc.child(block.index).textContent;
        editor
          .chain()
          .focus()
          .deleteRange({ from: block.pos, to: block.endPos })
          .insertContentAt(block.pos, {
            type: 'toggleBlock',
            attrs: { summary: text || 'Toggle heading', open: true },
            content: [{ type: 'paragraph' }],
          })
          .run();
        break;
      }
    }
    setBlockMenuBlock(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageModal((prev) => ({
          ...prev,
          url: reader.result as string,
          caption: prev.caption || file.name.replace(/\.[^.]+$/, ''),
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const submitImageModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editor || !imageModal.url.trim()) return;
    const pos = imageModal.insertPos ?? editor.state.selection.from;
    editor
      .chain()
      .focus()
      .insertContentAt(pos, [
        {
          type: 'imageEmbed',
          attrs: {
            src: imageModal.url.trim(),
            alt: imageModal.caption.trim() || 'Embedded image',
            caption: imageModal.caption.trim(),
            width: 'default',
          },
        },
        { type: 'paragraph' },
      ])
      .run();
    setImageModal({ open: false, url: '', caption: '' });
  };

  const submitBookmarkModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editor || !bookmarkModal.url.trim()) return;
    let normalizedUrl = bookmarkModal.url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    const pos = bookmarkModal.insertPos ?? editor.state.selection.from;
    editor
      .chain()
      .focus()
      .insertContentAt(pos, [
        {
          type: 'bookmarkCard',
          attrs: {
            url: normalizedUrl,
            title: bookmarkModal.title.trim() || normalizedUrl,
            description: bookmarkModal.description.trim(),
          },
        },
        { type: 'paragraph' },
      ])
      .run();
    setBookmarkModal({ open: false, url: '', title: '', description: '' });
  };

  const fontClass =
    fontMode === 'serif'
      ? 'font-serif-editorial'
      : fontMode === 'mono'
      ? 'font-mono-tabular'
      : 'font-sans-ui';

  if (!editor) return null;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (!blockMenuBlock) setHoveredBlock(null);
      }}
      onDragOver={handleContainerDragOver}
      onDrop={handleContainerDrop}
      className="relative"
    >
      {/* Touch / Mobile Quick Block Insertion Strip (plus subtle desktop quick-insert trigger) */}
      <div
        className="lg:hidden mb-3 flex items-center gap-1 overflow-x-auto pb-1.5 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <button
          type="button"
          onClick={() => {
            const { from } = editor.state.selection;
            editor.chain().focus().insertContent('/').run();
            const coords = editor.view.coordsAtPos(from + 1);
            const pos = clampPopoverCoords(coords.left, coords.bottom, 288);
            setSlashState({
              open: true,
              query: '',
              from,
              to: from + 1,
              x: pos.x,
              y: pos.y,
              selectedIndex: 0,
            });
          }}
          className="h-8 px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 shrink-0"
          style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Block</span>
        </button>
        {[
          { label: 'H1', action: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
          { label: 'H2', action: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
          { label: 'List', action: () => editor.chain().focus().toggleBulletList().run() },
          { label: 'Task', action: () => editor.chain().focus().toggleTaskList().run() },
          { label: 'Callout', action: () => executeSlashCommand('callout') },
          { label: 'Toggle', action: () => executeSlashCommand('toggle') },
          { label: 'Code', action: () => executeSlashCommand('codeBlock') },
          {
            label: '[[Link',
            action: () => editor.chain().focus().insertContent('[[').run(),
          },
          {
            label: 'Image',
            action: () =>
              setImageModal({
                open: true,
                url: '',
                caption: '',
                insertPos: editor.state.selection.from,
              }),
          },
          {
            label: 'Bookmark',
            action: () =>
              setBookmarkModal({
                open: true,
                url: '',
                title: '',
                description: '',
                insertPos: editor.state.selection.from,
              }),
          },
        ].map((btn) => (
          <button
            key={btn.label}
            type="button"
            onClick={btn.action}
            className="h-8 px-2.5 rounded-lg border text-xs font-medium shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Desktop Hover Block Gutter (+ and Drag Grip Handle) */}
      {hoveredBlock && (
        <div
          className="hidden lg:flex items-center gap-0.5 absolute -left-13 z-10 transition-all duration-100"
          style={{ top: Math.max(0, hoveredBlock.top + 2) }}
        >
          <button
            type="button"
            onClick={() => insertParagraphBelowBlock(hoveredBlock, true)}
            title="Insert block below (/)"
            aria-label="Insert block below"
            className="h-6 w-6 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-subtle)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            draggable
            onDragStart={(e) => handleBlockDragStart(e, hoveredBlock)}
            onDragEnd={() => {
              setDraggingIndex(null);
              setDropTargetIndex(null);
            }}
            onClick={() =>
              setBlockMenuBlock((prev) =>
                prev?.index === hoveredBlock.index ? null : hoveredBlock
              )
            }
            title="Drag to reorder or click for block actions"
            aria-label="Block options and drag handle"
            className="h-6 w-5 rounded-md flex items-center justify-center cursor-grab active:cursor-grabbing transition-colors hover:bg-[var(--bg-surface-subtle)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Drag Drop Insertion Indicator Line */}
      {dropTargetIndex && (
        <div
          className="pointer-events-none absolute left-0 right-0 h-0.5 z-20 rounded-full"
          style={{
            top: dropTargetIndex.top - 1,
            backgroundColor: 'var(--accent)',
          }}
        />
      )}

      {/* Block Context Action Popover (from clicking Grip handle) */}
      {blockMenuBlock && (
        <div
          className="hidden lg:block absolute -left-13 z-30 w-52 rounded-xl border py-1.5 text-xs"
          style={{
            top: Math.max(0, blockMenuBlock.top + 28),
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-subtle)',
            boxShadow: 'var(--shadow-popover)',
          }}
        >
          <div className="px-3 py-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Block Actions
            </span>
            <button
              type="button"
              onClick={() => setBlockMenuBlock(null)}
              aria-label="Close block menu"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-1.5 py-1 grid grid-cols-3 gap-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            {[
              { id: 'paragraph', label: 'Text' },
              { id: 'h1', label: 'H1' },
              { id: 'h2', label: 'H2' },
              { id: 'h3', label: 'H3' },
              { id: 'bulletList', label: 'List' },
              { id: 'taskList', label: 'Task' },
              { id: 'callout', label: 'Callout' },
              { id: 'toggle', label: 'Toggle' },
              { id: 'codeBlock', label: 'Code' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => turnBlockInto(blockMenuBlock, opt.id)}
                className="px-2 py-1 rounded-md text-left hover:bg-[var(--bg-surface-subtle)] transition-colors"
                style={{ color: 'var(--text-primary)' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="py-1">
            <button
              type="button"
              onClick={() => moveBlockStep(blockMenuBlock, -1)}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-surface-subtle)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>Move up</span>
            </button>
            <button
              type="button"
              onClick={() => moveBlockStep(blockMenuBlock, 1)}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-surface-subtle)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Move down</span>
            </button>
            <button
              type="button"
              onClick={() => duplicateBlock(blockMenuBlock)}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-surface-subtle)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Duplicate block</span>
            </button>
            <button
              type="button"
              onClick={() => deleteBlock(blockMenuBlock)}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-surface-subtle)]"
              style={{ color: 'var(--danger)' }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete block</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Tiptap Editorial Surface */}
      <div className={`kanso-tiptap kanso-notion-editor ${fontClass}`}>
        <EditorContent editor={editor} />
      </div>

      {/* Floating Selection Toolbar (Bubble Menu) */}
      {bubbleState.open && (
        <div
          className="fixed z-40 rounded-xl border p-1 flex items-center gap-0.5"
          style={{
            left: bubbleState.x,
            top: bubbleState.y,
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-strong)',
            boxShadow: 'var(--shadow-popover)',
          }}
          onMouseDown={(e) => {
            if (!(e.target instanceof HTMLInputElement)) {
              e.preventDefault();
            }
          }}
        >
          {bubbleState.linkInputOpen ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const raw = bubbleState.linkUrl.trim();
                if (!raw) {
                  editor.chain().focus().unsetLink().run();
                } else {
                  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
                  editor.chain().focus().setLink({ href }).run();
                }
                setBubbleState((prev) => ({ ...prev, linkInputOpen: false }));
              }}
              className="flex items-center gap-1 px-1"
            >
              <input
                type="text"
                autoFocus
                value={bubbleState.linkUrl}
                onChange={(e) =>
                  setBubbleState((prev) => ({ ...prev, linkUrl: e.target.value }))
                }
                placeholder="Paste URL..."
                className="w-44 h-7 px-2 rounded-md border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="submit"
                className="h-7 px-2 rounded-md text-xs font-medium"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => setBubbleState((prev) => ({ ...prev, linkInputOpen: false }))}
                className="h-7 w-7 flex items-center justify-center rounded-md"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Cancel link edit"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                className="h-7 px-2 rounded-lg text-xs font-semibold"
                style={{
                  backgroundColor: editor.isActive('heading', { level: 1 })
                    ? 'var(--accent-soft)'
                    : 'transparent',
                  color: editor.isActive('heading', { level: 1 })
                    ? 'var(--accent)'
                    : 'var(--text-secondary)',
                }}
                title="Heading 1"
              >
                H1
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                className="h-7 px-2 rounded-lg text-xs font-semibold"
                style={{
                  backgroundColor: editor.isActive('heading', { level: 2 })
                    ? 'var(--accent-soft)'
                    : 'transparent',
                  color: editor.isActive('heading', { level: 2 })
                    ? 'var(--accent)'
                    : 'var(--text-secondary)',
                }}
                title="Heading 2"
              >
                H2
              </button>

              <span className="h-4 w-px mx-0.5" style={{ backgroundColor: 'var(--border-subtle)' }} />

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className="h-7 w-7 flex items-center justify-center rounded-lg"
                style={{
                  backgroundColor: editor.isActive('bold') ? 'var(--accent-soft)' : 'transparent',
                  color: editor.isActive('bold') ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                title="Bold"
                aria-label="Bold"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className="h-7 w-7 flex items-center justify-center rounded-lg"
                style={{
                  backgroundColor: editor.isActive('italic') ? 'var(--accent-soft)' : 'transparent',
                  color: editor.isActive('italic') ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                title="Italic"
                aria-label="Italic"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className="h-7 w-7 flex items-center justify-center rounded-lg"
                style={{
                  backgroundColor: editor.isActive('strike') ? 'var(--accent-soft)' : 'transparent',
                  color: editor.isActive('strike') ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                title="Strikethrough"
                aria-label="Strikethrough"
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleCode().run()}
                className="h-7 w-7 flex items-center justify-center rounded-lg"
                style={{
                  backgroundColor: editor.isActive('code') ? 'var(--accent-soft)' : 'transparent',
                  color: editor.isActive('code') ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                title="Inline code"
                aria-label="Inline code"
              >
                <Code className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                className="h-7 w-7 flex items-center justify-center rounded-lg"
                style={{
                  backgroundColor: editor.isActive('blockquote')
                    ? 'var(--accent-soft)'
                    : 'transparent',
                  color: editor.isActive('blockquote') ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                title="Quote"
                aria-label="Quote"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setBubbleState((prev) => ({
                    ...prev,
                    linkInputOpen: true,
                    linkUrl: (editor.getAttributes('link').href as string) || '',
                  }))
                }
                className="h-7 w-7 flex items-center justify-center rounded-lg"
                style={{
                  backgroundColor: editor.isActive('link') ? 'var(--accent-soft)' : 'transparent',
                  color: editor.isActive('link') ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                title="Add web link"
                aria-label="Add web link"
              >
                <Link2 className="w-3.5 h-3.5" />
              </button>

              <span className="h-4 w-px mx-0.5" style={{ backgroundColor: 'var(--border-subtle)' }} />

              <button
                type="button"
                onClick={() => {
                  const { from, to } = editor.state.selection;
                  const selectedText = editor.state.doc.textBetween(from, to, ' ').trim();
                  if (!selectedText) return;
                  const existing = allNotesRef.current.find(
                    (n) => !n.trashedAt && n.title.trim().toLowerCase() === selectedText.toLowerCase()
                  );
                  const target = existing || onCreateLinkedNote(selectedText);
                  editor
                    .chain()
                    .focus()
                    .deleteRange({ from, to })
                    .insertContent({
                      type: 'wikiLink',
                      attrs: { noteId: target.id, title: target.title },
                    })
                    .run();
                }}
                className="h-7 px-2 rounded-lg text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
                style={{ color: 'var(--accent)' }}
                title="Turn selection into [[Wiki Link]]"
              >
                <FileText className="w-3 h-3" />
                <span>[[Link</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* "/" Slash Command Floating Menu */}
      {slashState.open && (
        <div
          className="fixed z-50 w-72 max-h-72 overflow-y-auto rounded-xl border py-1.5"
          style={{
            left: slashState.x,
            top: slashState.y,
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-strong)',
            boxShadow: 'var(--shadow-popover)',
          }}
        >
          <div
            className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider flex items-center justify-between"
            style={{ color: 'var(--text-muted)' }}
          >
            <span>Insert Block</span>
            <span className="font-mono">{slashState.query ? `/${slashState.query}` : '↑↓ Enter'}</span>
          </div>
          {filteredSlashCommands.length === 0 ? (
            <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              No matching block types
            </div>
          ) : (
            filteredSlashCommands.map((cmd, idx) => {
              const Icon = cmd.icon;
              const selected = idx === slashState.selectedIndex;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onMouseEnter={() =>
                    setSlashState((prev) => ({ ...prev, selectedIndex: idx }))
                  }
                  onMouseDown={(e) => {
                    e.preventDefault();
                    executeSlashCommand(cmd.id);
                  }}
                  className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left transition-colors"
                  style={{
                    backgroundColor: selected ? 'var(--accent-soft)' : 'transparent',
                  }}
                >
                  <span
                    className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-xs font-semibold leading-tight"
                      style={{ color: selected ? 'var(--accent)' : 'var(--text-primary)' }}
                    >
                      {cmd.label}
                    </span>
                    <span
                      className="block text-[11px] truncate"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {cmd.description}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* "[[" Wiki Link Autocomplete Floating Menu */}
      {wikiState.open && (
        <div
          className="fixed z-50 w-72 max-h-64 overflow-y-auto rounded-xl border py-1.5"
          style={{
            left: wikiState.x,
            top: wikiState.y,
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-strong)',
            boxShadow: 'var(--shadow-popover)',
          }}
        >
          <div
            className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider flex items-center justify-between"
            style={{ color: 'var(--text-muted)' }}
          >
            <span>Link to Note</span>
            <span className="font-mono">[[{wikiState.query}</span>
          </div>

          {wikiCandidates.map((candidate, idx) => {
            const selected = idx === wikiState.selectedIndex;
            return (
              <button
                key={candidate.id}
                type="button"
                onMouseEnter={() =>
                  setWikiState((prev) => ({ ...prev, selectedIndex: idx }))
                }
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertWikiLink(candidate);
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 text-left transition-colors"
                style={{
                  backgroundColor: selected ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                <span className="text-sm shrink-0">{candidate.icon || '📝'}</span>
                <span
                  className="text-xs font-medium truncate"
                  style={{ color: selected ? 'var(--accent)' : 'var(--text-primary)' }}
                >
                  {candidate.title || 'Untitled Note'}
                </span>
              </button>
            );
          })}

          {wikiState.query.trim().length > 0 &&
            !wikiCandidates.some(
              (c) => c.title.trim().toLowerCase() === wikiState.query.trim().toLowerCase()
            ) && (
              <button
                type="button"
                onMouseEnter={() =>
                  setWikiState((prev) => ({
                    ...prev,
                    selectedIndex: wikiCandidates.length,
                  }))
                }
                onMouseDown={(e) => {
                  e.preventDefault();
                  createAndInsertWikiLink(wikiState.query.trim());
                }}
                className="w-full px-3 py-2 flex items-center gap-2 text-left border-t mt-1"
                style={{
                  borderColor: 'var(--border-subtle)',
                  backgroundColor:
                    wikiState.selectedIndex === wikiCandidates.length
                      ? 'var(--accent-soft)'
                      : 'transparent',
                  color: 'var(--accent)',
                }}
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs font-semibold truncate">
                  Create &amp; link &ldquo;{wikiState.query.trim()}&rdquo;
                </span>
              </button>
            )}

          {wikiCandidates.length === 0 && wikiState.query.trim().length === 0 && (
            <div className="px-3 py-3 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              Type a note title to link or create a new page.
            </div>
          )}
        </div>
      )}

      {/* Image Embed Modal (URL or Local File Upload) */}
      {imageModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Embed Image"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setImageModal({ open: false, url: '', caption: '' })}
          />
          <form
            onSubmit={submitImageModal}
            className="relative z-10 w-full max-w-md rounded-2xl border p-5 space-y-4"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              boxShadow: 'var(--shadow-popover)',
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold">Embed Image</h3>
              <button
                type="button"
                onClick={() => setImageModal({ open: false, url: '', caption: '' })}
                style={{ color: 'var(--text-muted)' }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Image URL
              </label>
              <input
                type="text"
                autoFocus
                value={imageModal.url}
                onChange={(e) => setImageModal((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="https://example.com/diagram.png"
                className="w-full h-9 px-3 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label
                className="flex-1 h-9 px-3 rounded-lg border border-dashed text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]"
                style={{
                  borderColor: 'var(--border-strong)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Or choose local image file</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Caption (optional)
              </label>
              <input
                type="text"
                value={imageModal.caption}
                onChange={(e) =>
                  setImageModal((prev) => ({ ...prev, caption: e.target.value }))
                }
                placeholder="Architecture diagram or figure description..."
                className="w-full h-9 px-3 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setImageModal({ open: false, url: '', caption: '' })}
                className="h-9 px-3.5 rounded-lg border text-xs font-medium"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!imageModal.url.trim()}
                className="h-9 px-4 rounded-lg text-xs font-semibold disabled:opacity-45"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                Embed Image
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Web Bookmark Modal */}
      {bookmarkModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Insert Web Bookmark"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() =>
              setBookmarkModal({ open: false, url: '', title: '', description: '' })
            }
          />
          <form
            onSubmit={submitBookmarkModal}
            className="relative z-10 w-full max-w-md rounded-2xl border p-5 space-y-3.5"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              boxShadow: 'var(--shadow-popover)',
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold">Add Web Bookmark</h3>
              <button
                type="button"
                onClick={() =>
                  setBookmarkModal({ open: false, url: '', title: '', description: '' })
                }
                style={{ color: 'var(--text-muted)' }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                URL
              </label>
              <input
                type="text"
                autoFocus
                value={bookmarkModal.url}
                onChange={(e) =>
                  setBookmarkModal((prev) => ({ ...prev, url: e.target.value }))
                }
                placeholder="https://..."
                className="w-full h-9 px-3 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Title
              </label>
              <input
                type="text"
                value={bookmarkModal.title}
                onChange={(e) =>
                  setBookmarkModal((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Article or resource title"
                className="w-full h-9 px-3 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Short Note (optional)
              </label>
              <input
                type="text"
                value={bookmarkModal.description}
                onChange={(e) =>
                  setBookmarkModal((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Why this link matters..."
                className="w-full h-9 px-3 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  setBookmarkModal({ open: false, url: '', title: '', description: '' })
                }
                className="h-9 px-3.5 rounded-lg border text-xs font-medium"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!bookmarkModal.url.trim()}
                className="h-9 px-4 rounded-lg text-xs font-semibold disabled:opacity-45"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                Insert Bookmark
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
