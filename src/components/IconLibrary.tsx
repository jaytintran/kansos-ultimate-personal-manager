import React from 'react';
import {
  Activity,
  Archive,
  BookOpen,
  Bookmark,
  Brain,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Code,
  Coffee,
  Compass,
  Droplets,
  Dumbbell,
  FileText,
  Film,
  Flame,
  FolderKanban,
  Footprints,
  GraduationCap,
  Heart,
  Hourglass,
  Leaf,
  ListChecks,
  MessageSquareText,
  Moon,
  Music,
  PenLine,
  Star,
  Sun,
  Target,
} from 'lucide-react';
import { EntryType } from '../types';

export const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  BookOpen,
  Dumbbell,
  PenLine,
  Droplets,
  Moon,
  Flame,
  Heart,
  Coffee,
  Code,
  Music,
  Sun,
  Footprints,
  Brain,
  Leaf,
  Activity,
  Target,
  Film,
  GraduationCap,
  FolderKanban,
  ListChecks,
  Compass,
  Star,
  Bookmark,
  Archive,
};

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

export const DynamicIcon: React.FC<{
  name: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ name, className = 'w-4 h-4', style }) => {
  const Icon = ICON_MAP[name] || Target;
  return <Icon className={className} style={style} />;
};

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
