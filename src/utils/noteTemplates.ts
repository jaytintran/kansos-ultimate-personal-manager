import { NoteStatus } from '../types';

export interface NoteCoverPreset {
  id: string;
  label: string;
  background: string;
}

export const NOTE_COVER_PRESETS: NoteCoverPreset[] = [
  {
    id: 'paper-warm',
    label: 'Warm Washi',
    background:
      'radial-gradient(circle at 18% 30%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 60%), linear-gradient(120deg, var(--bg-surface-subtle) 0%, color-mix(in srgb, var(--accent) 9%, var(--bg-surface)) 100%)',
  },
  {
    id: 'amber-mist',
    label: 'Amber Horizon',
    background:
      'linear-gradient(135deg, color-mix(in srgb, #d97706 24%, var(--bg-surface-subtle)) 0%, color-mix(in srgb, #f59e0b 12%, var(--bg-surface)) 52%, color-mix(in srgb, var(--accent) 18%, var(--bg-surface-subtle)) 100%)',
  },
  {
    id: 'sage-wash',
    label: 'Botanical Sage',
    background:
      'linear-gradient(135deg, color-mix(in srgb, #059669 20%, var(--bg-surface-subtle)) 0%, color-mix(in srgb, #10b981 10%, var(--bg-surface)) 55%, color-mix(in srgb, #0f766e 16%, var(--bg-surface-subtle)) 100%)',
  },
  {
    id: 'nordic-frost',
    label: 'Nordic Slate',
    background:
      'linear-gradient(135deg, color-mix(in srgb, #3b82f6 18%, var(--bg-surface-subtle)) 0%, color-mix(in srgb, #6366f1 12%, var(--bg-surface)) 55%, color-mix(in srgb, #0891b2 16%, var(--bg-surface-subtle)) 100%)',
  },
  {
    id: 'rose-quartz',
    label: 'Dusk Rose',
    background:
      'linear-gradient(135deg, color-mix(in srgb, #e11d48 16%, var(--bg-surface-subtle)) 0%, color-mix(in srgb, #db2777 10%, var(--bg-surface)) 50%, color-mix(in srgb, #8b5cf6 14%, var(--bg-surface-subtle)) 100%)',
  },
  {
    id: 'ink-dusk',
    label: 'Editorial Grid',
    background:
      'repeating-linear-gradient(90deg, color-mix(in srgb, var(--border-subtle) 45%, transparent) 0 1px, transparent 1px 28px), repeating-linear-gradient(0deg, color-mix(in srgb, var(--border-subtle) 45%, transparent) 0 1px, transparent 1px 28px), linear-gradient(180deg, var(--bg-surface-subtle) 0%, var(--bg-canvas) 100%)',
  },
];

export function resolveCoverStyle(coverPreset: string | null | undefined): React.CSSProperties | null {
  if (!coverPreset) return null;
  if (coverPreset.startsWith('url:')) {
    const rawUrl = coverPreset.slice(4).trim();
    if (!rawUrl) return null;
    return {
      backgroundImage: `url("${rawUrl.replace(/"/g, '%22')}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  const found = NOTE_COVER_PRESETS.find((p) => p.id === coverPreset);
  if (!found) return null;
  return { background: found.background };
}

export const NOTE_ICON_PRESETS: string[] = [
  '📝', '📚', '💡', '🧠', '🌿', '✍️', '📌', '🎯',
  '📖', '🔬', '⚡', '🧭', '🛠️', '🗒️', '☕', '🎧',
  '🗂️', '🧩', '🌟', '🔖', '📐', '🧪', '🎨', '🏛️',
];

export const NOTE_STATUS_OPTIONS: Array<{
  id: NoteStatus;
  label: string;
  dotColor: string;
}> = [
  { id: 'inbox', label: 'Inbox', dotColor: 'var(--text-muted)' },
  { id: 'draft', label: 'Draft', dotColor: 'var(--warning)' },
  { id: 'active', label: 'Active', dotColor: 'var(--accent)' },
  { id: 'evergreen', label: 'Evergreen', dotColor: 'var(--success)' },
  { id: 'archived', label: 'Archived', dotColor: 'var(--border-strong)' },
];

export function getNoteStatusMeta(status?: NoteStatus) {
  return NOTE_STATUS_OPTIONS.find((s) => s.id === status) ?? NOTE_STATUS_OPTIONS[1];
}

export interface NoteTemplateDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  coverPreset: string | null;
  noteStatus: NoteStatus;
  tags: string[];
  defaultTitle: string;
  content: string;
}

export const NOTE_TEMPLATES: NoteTemplateDef[] = [
  {
    id: 'blank',
    name: 'Blank Page',
    description: 'Clean editorial canvas ready for freeform writing.',
    icon: '📝',
    coverPreset: null,
    noteStatus: 'draft',
    tags: [],
    defaultTitle: 'Untitled Note',
    content: '',
  },
  {
    id: 'study-book',
    name: 'Study & Book Notes',
    description: 'Core thesis, chapter synthesis, open questions & action steps.',
    icon: '📚',
    coverPreset: 'sage-wash',
    noteStatus: 'active',
    tags: ['reading', 'study'],
    defaultTitle: 'Book / Study Notes — ',
    content:
      '<div data-type="callout" data-tone="note" data-icon="📖"><p><strong>Source &amp; Context:</strong> Author, chapter range, or topic summary.</p></div><h2>Core Thesis</h2><p>What is the central argument or mental model here?</p><h2>Key Takeaways</h2><ul><li><p>First major insight in your own words</p></li><li><p>Supporting example or evidence</p></li></ul><div data-type="toggle" data-summary="Open Questions &amp; Cross-References" data-open="true"><p>Link related concepts using <code>[[Note]]</code> or list lingering questions to revisit.</p></div><h2>Actionable Takeaways</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Apply one idea in practice this week</p></div></li></ul>',
  },
  {
    id: 'meeting-lecture',
    name: 'Lecture / Meeting Notes',
    description: 'Agenda, structured discussion bullets, decisions & follow-ups.',
    icon: '🧭',
    coverPreset: 'nordic-frost',
    noteStatus: 'active',
    tags: ['notes', 'meeting'],
    defaultTitle: 'Session Notes — ',
    content:
      '<div data-type="callout" data-tone="tip" data-icon="🧭"><p><strong>Context:</strong> Date, topic, or speaker / attendees.</p></div><h2>Agenda &amp; Objectives</h2><ul><li><p>Topic 1</p></li><li><p>Topic 2</p></li></ul><h2>Discussion Notes</h2><p>Capture key points, quotes, and reasoning as they unfold.</p><blockquote><p>Notable quote or principle from the session.</p></blockquote><h2>Decisions &amp; Action Items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Follow-up task or next step</p></div></li></ul>',
  },
  {
    id: 'daily-reflection',
    name: 'Daily Reflection',
    description: 'Morning intention, highlights, lessons learned & tomorrow focus.',
    icon: '🌿',
    coverPreset: 'paper-warm',
    noteStatus: 'draft',
    tags: ['journal', 'reflection'],
    defaultTitle: 'Daily Reflection — ',
    content:
      '<h2>Intention</h2><p>What one outcome will make today feel meaningful?</p><blockquote><p>Pause to notice what deserves attention vs. what can wait.</p></blockquote><h2>Wins &amp; Observations</h2><ul><li><p></p></li></ul><h2>Lessons &amp; Adjustments</h2><p></p><h2>Tomorrow’s Top Priorities</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p></p></div></li></ul>',
  },
  {
    id: 'evergreen-concept',
    name: 'Concept / Evergreen Note',
    description: 'Atomic idea note with definition, example code/diagram & links.',
    icon: '💡',
    coverPreset: 'amber-mist',
    noteStatus: 'evergreen',
    tags: ['evergreen', 'concept'],
    defaultTitle: 'Concept — ',
    content:
      '<div data-type="callout" data-tone="important" data-icon="💡"><p><strong>One-Sentence Summary:</strong> State the concept clearly so your future self grasps it in five seconds.</p></div><h2>How It Works</h2><p>Explain the underlying mechanism, trade-offs, and edge cases.</p><pre data-language="markdown"><code># Example or Pattern\n- Input -> Transformation -> Outcome</code></pre><h2>Connected Ideas</h2><p>Type <code>[[</code> to link related evergreen notes.</p>',
  },
];
