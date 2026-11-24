import type {
  AppFontId,
  DisplayFontId,
  MonoFontId,
  NotesFontId,
  WorkspaceSettings,
} from "../types";

export interface FontOption<TId extends string = string> {
  id: TId;
  label: string;
  category: string;
  description: string;
  cssStack: string;
  sample: string;
  badge?: string;
}

export interface FontPairingPreset {
  id: string;
  name: string;
  tagline: string;
  fontBody: AppFontId;
  fontDisplay: DisplayFontId;
  fontNotes: NotesFontId;
  fontMono: MonoFontId;
}

export const DEFAULT_FONT_BODY: AppFontId = "dm-sans";
export const DEFAULT_FONT_DISPLAY: DisplayFontId = "plus-jakarta-sans";
export const DEFAULT_FONT_NOTES: NotesFontId = "match";
export const DEFAULT_FONT_MONO: MonoFontId = "jetbrains-mono";

export const APP_FONT_OPTIONS: FontOption<AppFontId>[] = [
  {
    id: "dm-sans",
    label: "DM Sans",
    category: "Geometric Sans",
    description: "Warm, balanced default for calm daily scanning",
    cssStack: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Focus on one meaningful task",
    badge: "Default",
  },
  {
    id: "plus-jakarta-sans",
    label: "Plus Jakarta Sans",
    category: "Modern Geometric",
    description: "Crisp open counters with friendly editorial clarity",
    cssStack:
      "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Focus on one meaningful task",
  },
  {
    id: "inter",
    label: "Inter",
    category: "UI Precision",
    description: "Ultra-legible neutral sans for dense lists & tables",
    cssStack: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Focus on one meaningful task",
  },
  {
    id: "manrope",
    label: "Manrope",
    category: "Modern Neo-Grotesque",
    description: "Clean, refined proportions with airy Scandinavian poise",
    cssStack: "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Focus on one meaningful task",
  },
  {
    id: "ibm-plex-sans",
    label: "IBM Plex Sans",
    category: "Humanist Technical",
    description: "Structured, disciplined clarity for finance & systems",
    cssStack: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Focus on one meaningful task",
  },
  {
    id: "public-sans",
    label: "Public Sans",
    category: "Neutral Sans",
    description: "Steady, unhurried workhorse typeface for all-day use",
    cssStack: "'Public Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Focus on one meaningful task",
  },
  {
    id: "nunito-sans",
    label: "Nunito Sans",
    category: "Soft Humanist",
    description: "Gentle, approachable rhythm for lighter personal spaces",
    cssStack: "'Nunito Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Focus on one meaningful task",
  },
  {
    id: "source-serif-4",
    label: "Source Serif 4",
    category: "Editorial Serif",
    description: "Classic bookish warmth across the entire workspace",
    cssStack: "'Source Serif 4', Georgia, Cambria, 'Times New Roman', serif",
    sample: "Focus on one meaningful task",
  },
  {
    id: "system",
    label: "System Default",
    category: "Native OS",
    description: "Uses your device native UI font with zero webfont load",
    cssStack:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    sample: "Focus on one meaningful task",
  },
];

export const DISPLAY_FONT_OPTIONS: FontOption<DisplayFontId>[] = [
  {
    id: "match",
    label: "Match App Font",
    category: "Unified",
    description: "Inherits your primary App Interface font",
    cssStack: "inherit",
    sample: "Today's Focus & Notes",
  },
  {
    id: "plus-jakarta-sans",
    label: "Plus Jakarta Sans",
    category: "Geometric Display",
    description: "Kanso's crisp default for headings & view titles",
    cssStack:
      "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Today's Focus & Notes",
    badge: "Default",
  },
  {
    id: "bricolage-grotesque",
    label: "Bricolage Grotesque",
    category: "Expressive Grotesk",
    description: "Distinctive editorial personality for headings & titles",
    cssStack:
      "'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Today's Focus & Notes",
  },
  {
    id: "outfit",
    label: "Outfit",
    category: "Clean Geometric",
    description: "Minimalist architectural titles with soft symmetry",
    cssStack: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Today's Focus & Notes",
  },
  {
    id: "manrope",
    label: "Manrope",
    category: "Neo-Grotesque",
    description: "Understated elegance for quiet, structured headers",
    cssStack: "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Today's Focus & Notes",
  },
  {
    id: "dm-sans",
    label: "DM Sans",
    category: "Geometric Sans",
    description: "Cohesive low-contrast headings matching DM Sans UI",
    cssStack: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Today's Focus & Notes",
  },
  {
    id: "inter",
    label: "Inter",
    category: "UI Precision",
    description: "Compact, authoritative headings",
    cssStack: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Today's Focus & Notes",
  },
  {
    id: "newsreader",
    label: "Newsreader",
    category: "Magazine Serif",
    description: "High-craft editorial serif headers paired with sans UI",
    cssStack: "'Newsreader', Georgia, Cambria, 'Times New Roman', serif",
    sample: "Today's Focus & Notes",
  },
  {
    id: "source-serif-4",
    label: "Source Serif 4",
    category: "Editorial Serif",
    description: "Warm literary headings for Paper & journaling themes",
    cssStack: "'Source Serif 4', Georgia, Cambria, 'Times New Roman', serif",
    sample: "Today's Focus & Notes",
  },
  {
    id: "literata",
    label: "Literata",
    category: "Book Serif",
    description: "Measured literary serif built for long-form collections",
    cssStack: "'Literata', Georgia, Cambria, 'Times New Roman', serif",
    sample: "Today's Focus & Notes",
  },
  {
    id: "system",
    label: "System Default",
    category: "Native OS",
    description: "Native device heading font",
    cssStack:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    sample: "Today's Focus & Notes",
  },
];

export const NOTES_FONT_OPTIONS: FontOption<NotesFontId>[] = [
  {
    id: "match",
    label: "Match App Font",
    category: "Unified",
    description: "Follows your App Interface font across Notes",
    cssStack: "inherit",
    sample: "Write quietly without distractions.",
    badge: "Default",
  },
  {
    id: "source-serif-4",
    label: "Source Serif 4",
    category: "Editorial Serif",
    description: "Warm magazine & essay readability in the note editor",
    cssStack: "'Source Serif 4', Georgia, Cambria, 'Times New Roman', serif",
    sample: "Write quietly without distractions.",
  },
  {
    id: "literata",
    label: "Literata",
    category: "Book Serif",
    description: "Comfortable, open serif crafted for long writing sessions",
    cssStack: "'Literata', Georgia, Cambria, 'Times New Roman', serif",
    sample: "Write quietly without distractions.",
  },
  {
    id: "newsreader",
    label: "Newsreader",
    category: "Editorial Serif",
    description: "Crisp literary contrast with graceful italics",
    cssStack: "'Newsreader', Georgia, Cambria, 'Times New Roman', serif",
    sample: "Write quietly without distractions.",
  },
  {
    id: "lora",
    label: "Lora",
    category: "Calligraphic Serif",
    description: "Expressive, softly curved serif for personal journals",
    cssStack: "'Lora', Georgia, Cambria, 'Times New Roman', serif",
    sample: "Write quietly without distractions.",
  },
  {
    id: "dm-sans",
    label: "DM Sans",
    category: "Geometric Sans",
    description: "Clean, effortless sans-serif canvas for structured notes",
    cssStack: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Write quietly without distractions.",
  },
  {
    id: "inter",
    label: "Inter",
    category: "UI Precision",
    description: "Tight, scannable spacing for specs & outlines",
    cssStack: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Write quietly without distractions.",
  },
  {
    id: "manrope",
    label: "Manrope",
    category: "Neo-Grotesque",
    description: "Airy modern prose for calm knowledge bases",
    cssStack: "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Write quietly without distractions.",
  },
  {
    id: "ibm-plex-sans",
    label: "IBM Plex Sans",
    category: "Humanist Technical",
    description: "Technical clarity for engineering docs & study notes",
    cssStack: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    sample: "Write quietly without distractions.",
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    category: "Typewriter Mono",
    description: "Plaintext markdown & distraction-free draftsman feel",
    cssStack: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    sample: "Write quietly without distractions.",
  },
  {
    id: "system",
    label: "System Default",
    category: "Native OS",
    description: "Native device prose font",
    cssStack:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    sample: "Write quietly without distractions.",
  },
];

export const MONO_FONT_OPTIONS: FontOption<MonoFontId>[] = [
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    category: "Tabular Mono",
    description: "Tall x-height & crisp timestamps across timeline & code",
    cssStack: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    sample: "09:30 AM · $1,240.00",
    badge: "Default",
  },
  {
    id: "ibm-plex-mono",
    label: "IBM Plex Mono",
    category: "Technical Mono",
    description: "Precision monospace built for ledgers, clocks & snippets",
    cssStack: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
    sample: "09:30 AM · $1,240.00",
  },
  {
    id: "fira-code",
    label: "Fira Code",
    category: "Developer Mono",
    description: "Clean code rhythm with balanced tabular numerals",
    cssStack: "'Fira Code', ui-monospace, SFMono-Regular, monospace",
    sample: "09:30 AM · $1,240.00",
  },
  {
    id: "source-code-pro",
    label: "Source Code Pro",
    category: "Editorial Mono",
    description: "Smooth, unobtrusive mono that pairs gently with serifs",
    cssStack: "'Source Code Pro', ui-monospace, SFMono-Regular, monospace",
    sample: "09:30 AM · $1,240.00",
  },
  {
    id: "space-mono",
    label: "Space Mono",
    category: "Expressive Mono",
    description: "Editorial retro-technical accent for dates & badges",
    cssStack: "'Space Mono', ui-monospace, SFMono-Regular, monospace",
    sample: "09:30 AM · $1,240.00",
  },
  {
    id: "system-mono",
    label: "System Mono",
    category: "Native OS",
    description: "Uses SF Mono / Cascadia / Consolas from your OS",
    cssStack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    sample: "09:30 AM · $1,240.00",
  },
];

export const FONT_PAIRING_PRESETS: FontPairingPreset[] = [
  {
    id: "kanso-default",
    name: "Kanso Default",
    tagline: "DM Sans + Plus Jakarta Sans + JetBrains Mono",
    fontBody: "dm-sans",
    fontDisplay: "plus-jakarta-sans",
    fontNotes: "match",
    fontMono: "jetbrains-mono",
  },
  {
    id: "editorial-paper",
    name: "Editorial Studio",
    tagline: "Inter UI + Newsreader Titles + Source Serif Notes",
    fontBody: "inter",
    fontDisplay: "newsreader",
    fontNotes: "source-serif-4",
    fontMono: "source-code-pro",
  },
  {
    id: "modern-atelier",
    name: "Modern Atelier",
    tagline: "Manrope + Bricolage Grotesque + IBM Plex Mono",
    fontBody: "manrope",
    fontDisplay: "bricolage-grotesque",
    fontNotes: "literata",
    fontMono: "ibm-plex-mono",
  },
  {
    id: "system-precision",
    name: "Technical Focus",
    tagline: "IBM Plex Sans + Unified Headings + IBM Plex Mono",
    fontBody: "ibm-plex-sans",
    fontDisplay: "match",
    fontNotes: "match",
    fontMono: "ibm-plex-mono",
  },
  {
    id: "native-fast",
    name: "Native System",
    tagline: "Zero-latency OS typography everywhere",
    fontBody: "system",
    fontDisplay: "match",
    fontNotes: "match",
    fontMono: "system-mono",
  },
];

const APP_FONT_SET = new Set<string>(APP_FONT_OPTIONS.map((f) => f.id));
const DISPLAY_FONT_SET = new Set<string>(DISPLAY_FONT_OPTIONS.map((f) => f.id));
const NOTES_FONT_SET = new Set<string>(NOTES_FONT_OPTIONS.map((f) => f.id));
const MONO_FONT_SET = new Set<string>(MONO_FONT_OPTIONS.map((f) => f.id));

export function normalizeFontSettings(
  settings?: Partial<WorkspaceSettings> | null,
): {
  fontBody: AppFontId;
  fontDisplay: DisplayFontId;
  fontNotes: NotesFontId;
  fontMono: MonoFontId;
} {
  const fontBody =
    settings?.fontBody && APP_FONT_SET.has(settings.fontBody)
      ? settings.fontBody
      : DEFAULT_FONT_BODY;
  const fontDisplay =
    settings?.fontDisplay && DISPLAY_FONT_SET.has(settings.fontDisplay)
      ? settings.fontDisplay
      : DEFAULT_FONT_DISPLAY;
  const fontNotes =
    settings?.fontNotes && NOTES_FONT_SET.has(settings.fontNotes)
      ? settings.fontNotes
      : DEFAULT_FONT_NOTES;
  const fontMono =
    settings?.fontMono && MONO_FONT_SET.has(settings.fontMono)
      ? settings.fontMono
      : DEFAULT_FONT_MONO;
  return { fontBody, fontDisplay, fontNotes, fontMono };
}

export function resolveWorkspaceFontStacks(
  settings?: Partial<WorkspaceSettings> | null,
) {
  const normalized = normalizeFontSettings(settings);
  const bodyOption =
    APP_FONT_OPTIONS.find((f) => f.id === normalized.fontBody) ??
    APP_FONT_OPTIONS[0];
  const displayOption =
    DISPLAY_FONT_OPTIONS.find((f) => f.id === normalized.fontDisplay) ??
    DISPLAY_FONT_OPTIONS[1];
  const notesOption =
    NOTES_FONT_OPTIONS.find((f) => f.id === normalized.fontNotes) ??
    NOTES_FONT_OPTIONS[0];
  const monoOption =
    MONO_FONT_OPTIONS.find((f) => f.id === normalized.fontMono) ??
    MONO_FONT_OPTIONS[0];

  const bodyStack = bodyOption.cssStack;
  const displayStack =
    displayOption.id === "match" ? bodyStack : displayOption.cssStack;
  const notesStack =
    notesOption.id === "match" ? bodyStack : notesOption.cssStack;
  const monoStack = monoOption.cssStack;

  return {
    ...normalized,
    bodyOption,
    displayOption,
    notesOption,
    monoOption,
    bodyStack,
    displayStack,
    notesStack,
    monoStack,
  };
}

export function applyWorkspaceFonts(
  settings?: Partial<WorkspaceSettings> | null,
) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const { bodyStack, displayStack, notesStack, monoStack } =
    resolveWorkspaceFontStacks(settings);
  root.style.setProperty("--kanso-font-body", bodyStack);
  root.style.setProperty("--kanso-font-display", displayStack);
  root.style.setProperty("--kanso-font-notes", notesStack);
  root.style.setProperty("--kanso-font-mono", monoStack);
  root.style.setProperty("--font-sans", bodyStack);
  root.style.setProperty("--font-mono", monoStack);
}
