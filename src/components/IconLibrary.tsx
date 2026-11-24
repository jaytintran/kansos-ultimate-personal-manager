import React from 'react';
import {
  Activity,
  Archive,
  Atom,
  Award,
  BookOpen,
  Bookmark,
  Brain,
  Briefcase,
  Calculator,
  Calendar,
  Camera,
  CheckCircle2,
  Circle,
  Clock,
  Code,
  Coffee,
  Coins,
  Compass,
  Cpu,
  Database,
  Droplets,
  Dumbbell,
  FileText,
  Film,
  Flag,
  Flame,
  FlaskConical,
  Folder,
  FolderKanban,
  FolderOpen,
  Footprints,
  Gamepad2,
  Globe,
  GraduationCap,
  Headphones,
  Heart,
  Home,
  Hourglass,
  Inbox,
  Layers,
  Leaf,
  Library,
  Lightbulb,
  ListChecks,
  MapPin,
  MessageSquareText,
  Mic,
  Moon,
  Mountain,
  Music,
  NotebookPen,
  Palette,
  PenLine,
  Plane,
  Quote,
  Radio,
  Sparkles,
  Star,
  Sun,
  Tag,
  Target,
  Terminal,
  TrendingUp,
  Tv,
  Volume2,
  Wallet,
} from 'lucide-react';
import { EntryType } from '../types';

export type IconComponent = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
}>;

export const ICON_MAP: Record<string, IconComponent> = {
  // Knowledge, writing & books
  BookOpen,
  NotebookPen,
  FileText,
  PenLine,
  Bookmark,
  Library,
  GraduationCap,
  Quote,
  Lightbulb,
  Sparkles,
  // Work, projects & productivity
  Folder,
  FolderKanban,
  FolderOpen,
  Briefcase,
  ListChecks,
  Target,
  Calendar,
  Clock,
  Layers,
  Inbox,
  Archive,
  // Media, audio & video
  Music,
  Headphones,
  Film,
  Camera,
  Mic,
  Radio,
  Tv,
  Palette,
  Volume2,
  Gamepad2,
  // Science, code & finance
  Code,
  Terminal,
  Cpu,
  Atom,
  FlaskConical,
  Database,
  Wallet,
  Coins,
  TrendingUp,
  Calculator,
  // Lifestyle, health & nature
  Heart,
  Dumbbell,
  Flame,
  Leaf,
  Sun,
  Moon,
  Coffee,
  Droplets,
  Brain,
  Footprints,
  Activity,
  // Travel, places & symbols
  Compass,
  Globe,
  MapPin,
  Plane,
  Home,
  Mountain,
  Star,
  Award,
  Flag,
  Tag,
};

export type IconCategoryId =
  | 'knowledge'
  | 'work'
  | 'media'
  | 'science'
  | 'lifestyle'
  | 'travel';

export interface IconCategoryMeta {
  id: IconCategoryId;
  label: string;
  shortLabel: string;
}

export const ICON_CATEGORIES: IconCategoryMeta[] = [
  { id: 'knowledge', label: 'Knowledge, writing & books', shortLabel: 'Knowledge' },
  { id: 'work', label: 'Work, projects & productivity', shortLabel: 'Work' },
  { id: 'media', label: 'Media, audio & video', shortLabel: 'Media' },
  { id: 'science', label: 'Science, code & finance', shortLabel: 'Science & Code' },
  { id: 'lifestyle', label: 'Lifestyle, health & nature', shortLabel: 'Lifestyle' },
  { id: 'travel', label: 'Travel, places & symbols', shortLabel: 'Travel & Symbols' },
];

export interface SharedIconItem {
  key: string;
  label: string;
  category: IconCategoryId;
  keywords: string[];
}

export const SHARED_ICON_CATALOG: SharedIconItem[] = [
  // 1. Knowledge, writing & books (10)
  { key: 'BookOpen', label: 'Book', category: 'knowledge', keywords: ['read', 'reading', 'literature', 'study'] },
  { key: 'NotebookPen', label: 'Notebook', category: 'knowledge', keywords: ['journal', 'diary', 'notes', 'write'] },
  { key: 'FileText', label: 'Page', category: 'knowledge', keywords: ['document', 'doc', 'paper', 'article', 'note'] },
  { key: 'PenLine', label: 'Writing', category: 'knowledge', keywords: ['draft', 'essay', 'author', 'edit', 'pen'] },
  { key: 'Bookmark', label: 'Bookmark', category: 'knowledge', keywords: ['save', 'reference', 'marked'] },
  { key: 'Library', label: 'Library', category: 'knowledge', keywords: ['bookshelf', 'archive', 'collection', 'knowledge'] },
  { key: 'GraduationCap', label: 'Study', category: 'knowledge', keywords: ['course', 'learn', 'school', 'degree', 'academic'] },
  { key: 'Quote', label: 'Quote', category: 'knowledge', keywords: ['excerpt', 'citation', 'passage', 'highlight'] },
  { key: 'Lightbulb', label: 'Idea', category: 'knowledge', keywords: ['insight', 'brainstorm', 'concept', 'creative'] },
  { key: 'Sparkles', label: 'Inspiration', category: 'knowledge', keywords: ['magic', 'highlight', 'featured', 'polish'] },

  // 2. Work, projects & productivity (10)
  { key: 'Folder', label: 'Folder', category: 'work', keywords: ['directory', 'group', 'collection', 'shelf'] },
  { key: 'FolderKanban', label: 'Project', category: 'work', keywords: ['kanban', 'board', 'sprint', 'roadmap'] },
  { key: 'Briefcase', label: 'Work', category: 'work', keywords: ['career', 'office', 'business', 'job'] },
  { key: 'ListChecks', label: 'Checklist', category: 'work', keywords: ['tasks', 'todo', 'done', 'checklist'] },
  { key: 'Target', label: 'Goal', category: 'work', keywords: ['focus', 'objective', 'okr', 'aim'] },
  { key: 'Calendar', label: 'Schedule', category: 'work', keywords: ['date', 'event', 'plan', 'month'] },
  { key: 'Clock', label: 'Time', category: 'work', keywords: ['timer', 'hours', 'routine', 'deadline'] },
  { key: 'Layers', label: 'Stack', category: 'work', keywords: ['layers', 'queue', 'bundle', 'topics'] },
  { key: 'Inbox', label: 'Inbox', category: 'work', keywords: ['capture', 'triage', 'incoming'] },
  { key: 'Archive', label: 'Archive', category: 'work', keywords: ['box', 'storage', 'vault', 'history'] },

  // 3. Media, audio & video (10)
  { key: 'Music', label: 'Music', category: 'media', keywords: ['song', 'melody', 'playlist', 'soundtrack'] },
  { key: 'Headphones', label: 'Audio', category: 'media', keywords: ['listen', 'ambient', 'audiobook', 'focus'] },
  { key: 'Film', label: 'Film', category: 'media', keywords: ['movie', 'cinema', 'video', 'watch'] },
  { key: 'Camera', label: 'Photo', category: 'media', keywords: ['photography', 'visual', 'image', 'snapshot'] },
  { key: 'Mic', label: 'Podcast', category: 'media', keywords: ['voice', 'record', 'speech', 'audio'] },
  { key: 'Radio', label: 'Broadcast', category: 'media', keywords: ['frequency', 'stream', 'station', 'waves'] },
  { key: 'Tv', label: 'Stream', category: 'media', keywords: ['video', 'youtube', 'channel', 'screen'] },
  { key: 'Palette', label: 'Design', category: 'media', keywords: ['art', 'color', 'creative', 'studio'] },
  { key: 'Volume2', label: 'Sound', category: 'media', keywords: ['speaker', 'volume', 'subliminal', 'tone'] },
  { key: 'Gamepad2', label: 'Games', category: 'media', keywords: ['play', 'gaming', 'hobby', 'fun'] },

  // 4. Science, code & finance (10)
  { key: 'Code', label: 'Code', category: 'science', keywords: ['programming', 'dev', 'software', 'snippet'] },
  { key: 'Terminal', label: 'Terminal', category: 'science', keywords: ['cli', 'shell', 'command', 'engineering'] },
  { key: 'Cpu', label: 'Tech', category: 'science', keywords: ['hardware', 'ai', 'system', 'compute'] },
  { key: 'Atom', label: 'Science', category: 'science', keywords: ['physics', 'chemistry', 'research', 'theory'] },
  { key: 'FlaskConical', label: 'Experiment', category: 'science', keywords: ['lab', 'test', 'trial', 'hypothesis'] },
  { key: 'Database', label: 'Data', category: 'science', keywords: ['storage', 'sql', 'records', 'knowledgebase'] },
  { key: 'Wallet', label: 'Finance', category: 'science', keywords: ['money', 'budget', 'spending', 'expenses'] },
  { key: 'Coins', label: 'Wealth', category: 'science', keywords: ['savings', 'income', 'investing', 'cash'] },
  { key: 'TrendingUp', label: 'Growth', category: 'science', keywords: ['analytics', 'chart', 'metrics', 'progress'] },
  { key: 'Calculator', label: 'Math', category: 'science', keywords: ['numbers', 'ledger', 'accounting', 'compute'] },

  // 5. Lifestyle, health & nature (10)
  { key: 'Heart', label: 'Health', category: 'lifestyle', keywords: ['wellness', 'love', 'care', 'vitality'] },
  { key: 'Dumbbell', label: 'Fitness', category: 'lifestyle', keywords: ['workout', 'gym', 'strength', 'training'] },
  { key: 'Flame', label: 'Energy', category: 'lifestyle', keywords: ['streak', 'fire', 'motivation', 'passion'] },
  { key: 'Leaf', label: 'Nature', category: 'lifestyle', keywords: ['green', 'calm', 'plant', 'eco'] },
  { key: 'Sun', label: 'Morning', category: 'lifestyle', keywords: ['day', 'light', 'energy', 'summer'] },
  { key: 'Moon', label: 'Night', category: 'lifestyle', keywords: ['sleep', 'evening', 'rest', 'calm'] },
  { key: 'Coffee', label: 'Coffee', category: 'lifestyle', keywords: ['break', 'cafe', 'morning', 'ritual'] },
  { key: 'Droplets', label: 'Hydration', category: 'lifestyle', keywords: ['water', 'flow', 'rain', 'clean'] },
  { key: 'Brain', label: 'Mind', category: 'lifestyle', keywords: ['psychology', 'memory', 'meditation', 'cognition'] },
  { key: 'Footprints', label: 'Walk', category: 'lifestyle', keywords: ['steps', 'run', 'journey', 'habit'] },

  // 6. Travel, places & symbols (10)
  { key: 'Compass', label: 'Explore', category: 'travel', keywords: ['direction', 'adventure', 'discover', 'map'] },
  { key: 'Globe', label: 'World', category: 'travel', keywords: ['earth', 'language', 'culture', 'international'] },
  { key: 'MapPin', label: 'Place', category: 'travel', keywords: ['location', 'city', 'spot', 'pin'] },
  { key: 'Plane', label: 'Travel', category: 'travel', keywords: ['flight', 'trip', 'vacation', 'journey'] },
  { key: 'Home', label: 'Home', category: 'travel', keywords: ['house', 'family', 'personal', 'living'] },
  { key: 'Mountain', label: 'Outdoors', category: 'travel', keywords: ['hike', 'peak', 'summit', 'nature'] },
  { key: 'Star', label: 'Star', category: 'travel', keywords: ['favorite', 'top', 'essential', 'rated'] },
  { key: 'Award', label: 'Achievement', category: 'travel', keywords: ['medal', 'trophy', 'win', 'milestone'] },
  { key: 'Flag', label: 'Milestone', category: 'travel', keywords: ['marker', 'important', 'priority', 'checkpoint'] },
  { key: 'Tag', label: 'Topic', category: 'travel', keywords: ['label', 'theme', 'category', 'tag'] },
];

export const SHARED_ICON_KEYS: string[] = SHARED_ICON_CATALOG.map((item) => item.key);

export const HABIT_ICON_KEYS = [
  'BookOpen',
  'Dumbbell',
  'PenLine',
  'Droplets',
  'Moon',
  'Flame',
  'Heart',
  'Coffee',
  'Code',
  'Footprints',
  'Brain',
  'Leaf',
  'Sun',
  'Music',
  'Activity',
  'Target',
];

export const LIST_ICON_KEYS = [
  'BookOpen',
  'Film',
  'GraduationCap',
  'FolderKanban',
  'ListChecks',
  'Bookmark',
  'Compass',
  'Star',
  'Music',
  'Archive',
  'Code',
  'Coffee',
];

export const HABIT_COLOR_SWATCHES = [
  '#b45309',
  '#047857',
  '#4f46e5',
  '#0284c7',
  '#be185d',
  '#dc2626',
  '#0f766e',
  '#7c3aed',
  '#ca8a04',
  '#334155',
];

const LOWER_ICON_MAP: Record<string, IconComponent> = Object.fromEntries(
  Object.entries(ICON_MAP).map(([k, v]) => [k.toLowerCase(), v])
);

const LEGACY_EMOJI_TO_ICON: Record<string, string> = {
  '📚': 'BookOpen',
  '🌿': 'Leaf',
  '✍️': 'PenLine',
  '📓': 'NotebookPen',
  '📝': 'FileText',
};

export function resolveIconKey(raw?: string | null, fallback = 'FileText'): string {
  if (!raw || !raw.trim()) return fallback;
  const trimmed = raw.trim();
  if (ICON_MAP[trimmed]) return trimmed;
  const lowerMatch = Object.keys(ICON_MAP).find(
    (k) => k.toLowerCase() === trimmed.toLowerCase()
  );
  if (lowerMatch) return lowerMatch;
  if (LEGACY_EMOJI_TO_ICON[trimmed]) return LEGACY_EMOJI_TO_ICON[trimmed];
  return trimmed;
}

export function isLucideIconKey(name?: string | null): boolean {
  if (!name || !name.trim()) return false;
  const trimmed = name.trim();
  return Boolean(ICON_MAP[trimmed] || LOWER_ICON_MAP[trimmed.toLowerCase()]);
}

export const DynamicIcon: React.FC<{
  name: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ name, className = 'w-4 h-4', style }) => {
  const mapped = LEGACY_EMOJI_TO_ICON[name] || name;
  const Icon = ICON_MAP[mapped] || LOWER_ICON_MAP[mapped.toLowerCase()] || Target;
  return <Icon className={className} style={style} />;
};

export const NotePageIcon: React.FC<{
  icon?: string | null;
  className?: string;
  style?: React.CSSProperties;
  fallback?: string;
}> = ({ icon, className = 'w-4 h-4', style, fallback = 'FileText' }) => {
  const resolved = resolveIconKey(icon, fallback);
  if (isLucideIconKey(resolved)) {
    return <DynamicIcon name={resolved} className={className} style={style} />;
  }
  // Graceful fallback if a legacy note holds an unmapped emoji
  return (
    <span
      className={`inline-flex items-center justify-center leading-none select-none ${className}`}
      style={style}
      aria-hidden="true"
    >
      {resolved}
    </span>
  );
};

export const HabitIcon = DynamicIcon;
export const ListIcon = DynamicIcon;

export const ENTRY_TYPE_META: Record<
  EntryType,
  {
    label: string;
    shortLabel: string;
    placeholder: string;
  }
> = {
  log: {
    label: 'Log',
    shortLabel: 'Log',
    placeholder: 'Log what is happening right now... (try "at 2:30pm")',
  },
  task: {
    label: 'Task',
    shortLabel: 'Task',
    placeholder: 'Add a task... (try "Draft release notes at 4pm")',
  },
  event: {
    label: 'Event',
    shortLabel: 'Event',
    placeholder: 'Schedule an event... (try "Design review from 3pm to 4pm")',
  },
  note: {
    label: 'Note',
    shortLabel: 'Note',
    placeholder: 'Capture a note... (shows up in Notes view too)',
  },
  timeblock: {
    label: 'Timeblock',
    shortLabel: 'Block',
    placeholder: 'Block focused time... (try "Deep work from 9am to 11am")',
  },
};

export const EntryTypeIcon: React.FC<{
  type: EntryType;
  completed?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ type, completed = false, className = 'w-4 h-4', style }) => {
  switch (type) {
    case 'task':
      return completed ? (
        <CheckCircle2 className={className} style={style} />
      ) : (
        <Circle className={className} style={style} />
      );
    case 'event':
      return <Calendar className={className} style={style} />;
    case 'note':
      return <FileText className={className} style={style} />;
    case 'timeblock':
      return <Hourglass className={className} style={style} />;
    case 'log':
    default:
      return <MessageSquareText className={className} style={style} />;
  }
};

export const ClockMiniIcon = Clock;
