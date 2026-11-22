import type {
  LanguageCefrLevel,
  LanguageDailyStat,
  LanguageExample,
  LanguageItem,
  LanguageItemType,
  LanguageMasteryStage,
  LanguagePreset,
  LanguageRegister,
  LanguageSrsRating,
  LanguageSrsState,
} from "../types/languages";
import { addDaysToKey, getTodayKey } from "../utils/date";

export const LANGUAGE_PRESETS: LanguagePreset[] = [
  {
    key: "ja",
    name: "Japanese",
    nativeName: "日本語",
    code: "JA",
    ttsLocale: "ja-JP",
    scriptHint: "Kanji · Hiragana · Katakana",
  },
  {
    key: "es",
    name: "Spanish",
    nativeName: "Español",
    code: "ES",
    ttsLocale: "es-ES",
    scriptHint: "Latin",
  },
  {
    key: "fr",
    name: "French",
    nativeName: "Français",
    code: "FR",
    ttsLocale: "fr-FR",
    scriptHint: "Latin",
  },
  {
    key: "de",
    name: "German",
    nativeName: "Deutsch",
    code: "DE",
    ttsLocale: "de-DE",
    scriptHint: "Latin",
  },
  {
    key: "zh",
    name: "Mandarin Chinese",
    nativeName: "中文",
    code: "ZH",
    ttsLocale: "zh-CN",
    scriptHint: "Hanzi · Pinyin",
  },
  {
    key: "ko",
    name: "Korean",
    nativeName: "한국어",
    code: "KO",
    ttsLocale: "ko-KR",
    scriptHint: "Hangul",
  },
  {
    key: "it",
    name: "Italian",
    nativeName: "Italiano",
    code: "IT",
    ttsLocale: "it-IT",
    scriptHint: "Latin",
  },
  {
    key: "pt",
    name: "Portuguese",
    nativeName: "Português",
    code: "PT",
    ttsLocale: "pt-PT",
    scriptHint: "Latin",
  },
  {
    key: "vi",
    name: "Vietnamese",
    nativeName: "Tiếng Việt",
    code: "VI",
    ttsLocale: "vi-VN",
    scriptHint: "Quốc ngữ",
  },
  {
    key: "ar",
    name: "Arabic",
    nativeName: "العربية",
    code: "AR",
    ttsLocale: "ar-SA",
    scriptHint: "Arabic Script",
  },
  {
    key: "ru",
    name: "Russian",
    nativeName: "Русский",
    code: "RU",
    ttsLocale: "ru-RU",
    scriptHint: "Cyrillic",
  },
  {
    key: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    code: "HI",
    ttsLocale: "hi-IN",
    scriptHint: "Devanagari",
  },
];

export const LANGUAGE_TOPIC_PACKS: string[] = [
  "Daily Life",
  "Travel & Transit",
  "Work & Tech",
  "Food & Dining",
  "Relationships",
  "Culture & Media",
  "Health & Errands",
  "Abstract & Ideas",
];

export const LANGUAGE_CEFR_LEVELS: LanguageCefrLevel[] = [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
];

export const LANGUAGE_REGISTER_META: Record<
  LanguageRegister,
  { label: string; short: string }
> = {
  neutral: { label: "Neutral", short: "Neutral" },
  casual: { label: "Casual / Conversational", short: "Casual" },
  polite: { label: "Polite", short: "Polite" },
  formal: { label: "Formal / Business", short: "Formal" },
  slang: { label: "Slang / Colloquial", short: "Slang" },
  literary: { label: "Literary / Written", short: "Literary" },
};

export const LANGUAGE_ITEM_TYPE_META: Record<
  LanguageItemType,
  { label: string; short: string; description: string }
> = {
  vocab: {
    label: "Vocabulary & Nouns",
    short: "Vocab",
    description: "Words, nouns, verbs & collocations",
  },
  grammar: {
    label: "Grammar Pattern",
    short: "Grammar",
    description: "Structural rules & [Slot] formulas",
  },
  phrase: {
    label: "Phrase & Chunk",
    short: "Phrase",
    description: "Natural conversational expressions",
  },
  block: {
    label: "Building Block",
    short: "Block",
    description: "Connectors, particles & sentence frames",
  },
};

export const LANGUAGE_MASTERY_META: Record<
  LanguageMasteryStage,
  { label: string; toneColor: string }
> = {
  new: { label: "New", toneColor: "var(--text-muted)" },
  learning: { label: "Learning", toneColor: "var(--warning)" },
  familiar: { label: "Familiar", toneColor: "var(--accent)" },
  mastered: { label: "Mastered", toneColor: "var(--success)" },
};

export function createInitialSrsState(todayKey = getTodayKey()): LanguageSrsState {
  return {
    stage: "new",
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    dueDate: todayKey,
    lastReviewedAt: null,
  };
}

/**
 * Deterministic SM-2 spaced repetition transition.
 * Rating: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy
 */
export function applySm2Review(
  current: LanguageSrsState,
  rating: LanguageSrsRating,
  todayKey = getTodayKey(),
): LanguageSrsState {
  const nowIso = new Date().toISOString();
  let easeFactor = current.easeFactor || 2.5;
  let repetitions = current.repetitions || 0;
  let intervalDays = current.intervalDays || 0;
  let lapses = current.lapses || 0;

  if (rating === 0) {
    // Again: reset streak, slightly penalize ease factor, due today for relearning
    repetitions = 0;
    intervalDays = 0;
    lapses += 1;
    easeFactor = Math.max(1.3, Number((easeFactor - 0.2).toFixed(2)));
    return {
      stage: "learning",
      easeFactor,
      intervalDays,
      repetitions,
      lapses,
      dueDate: todayKey,
      lastReviewedAt: nowIso,
    };
  }

  if (rating === 1) {
    // Hard
    easeFactor = Math.max(1.3, Number((easeFactor - 0.14).toFixed(2)));
    if (repetitions === 0) {
      intervalDays = 1;
    } else {
      intervalDays = Math.max(1, Math.round(intervalDays * 1.2));
    }
    repetitions += 1;
  } else if (rating === 2) {
    // Good
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 4;
    } else {
      intervalDays = Math.max(2, Math.round(intervalDays * easeFactor));
    }
    repetitions += 1;
  } else {
    // Easy
    easeFactor = Math.min(3.0, Number((easeFactor + 0.12).toFixed(2)));
    if (repetitions === 0) {
      intervalDays = 3;
    } else if (repetitions === 1) {
      intervalDays = 7;
    } else {
      intervalDays = Math.max(4, Math.round(intervalDays * easeFactor * 1.25));
    }
    repetitions += 1;
  }

  let stage: LanguageMasteryStage = "learning";
  if (intervalDays >= 21 && repetitions >= 4) {
    stage = "mastered";
  } else if (intervalDays >= 4 && repetitions >= 2) {
    stage = "familiar";
  }

  return {
    stage,
    easeFactor,
    intervalDays,
    repetitions,
    lapses,
    dueDate: addDaysToKey(todayKey, intervalDays),
    lastReviewedAt: nowIso,
  };
}

export function formatSrsIntervalLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  const years = (days / 365).toFixed(1).replace(/\.0$/, "");
  return `${years}y`;
}

export function previewSm2Intervals(
  current: LanguageSrsState,
  todayKey = getTodayKey(),
): Record<LanguageSrsRating, string> {
  return {
    0: "10m",
    1: formatSrsIntervalLabel(applySm2Review(current, 1, todayKey).intervalDays),
    2: formatSrsIntervalLabel(applySm2Review(current, 2, todayKey).intervalDays),
    3: formatSrsIntervalLabel(applySm2Review(current, 3, todayKey).intervalDays),
  };
}

export function isItemDueOnDate(
  item: LanguageItem,
  dateKey = getTodayKey(),
): boolean {
  const due = item.srs?.dueDate || dateKey;
  return due <= dateKey;
}

export function computeLanguageStreak(
  stats: LanguageDailyStat[],
  languageId: string,
  todayKey = getTodayKey(),
): number {
  const activeDates = new Set<string>();
  for (const s of stats) {
    if (
      s.languageId === languageId &&
      (s.reviewedCount > 0 || s.capturedCount > 0)
    ) {
      activeDates.add(s.dateKey);
    }
  }
  if (activeDates.size === 0) return 0;

  let cursor = activeDates.has(todayKey)
    ? todayKey
    : addDaysToKey(todayKey, -1);
  if (!activeDates.has(cursor)) return 0;

  let streak = 0;
  while (activeDates.has(cursor)) {
    streak += 1;
    cursor = addDaysToKey(cursor, -1);
  }
  return streak;
}

// ============================================================================
// Pattern Formula [Slot] Parsing & Inline {{Cloze}} Highlighting
// ============================================================================

export interface PatternSegment {
  kind: "text" | "slot";
  value: string;
  slotKey?: string;
}

export function parsePatternSegments(formula: string): PatternSegment[] {
  if (!formula) return [];
  const regex = /\[([^\]]+)\]/g;
  const segments: PatternSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let slotCounter = 0;

  while ((match = regex.exec(formula)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        kind: "text",
        value: formula.slice(lastIndex, match.index),
      });
    }
    const label = match[1].trim();
    segments.push({
      kind: "slot",
      value: label,
      slotKey: `${label}__${slotCounter}`,
    });
    slotCounter += 1;
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < formula.length) {
    segments.push({
      kind: "text",
      value: formula.slice(lastIndex),
    });
  }

  return segments;
}

export interface ClozeSegment {
  kind: "text" | "cloze";
  value: string;
}

export function parseClozeSegments(sentence: string): ClozeSegment[] {
  if (!sentence) return [];
  const regex = /\{\{([^}]+)\}\}/g;
  const segments: ClozeSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sentence)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        kind: "text",
        value: sentence.slice(lastIndex, match.index),
      });
    }
    segments.push({
      kind: "cloze",
      value: match[1],
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < sentence.length) {
    segments.push({
      kind: "text",
      value: sentence.slice(lastIndex),
    });
  }

  return segments;
}

export function stripClozeBrackets(sentence: string): string {
  return sentence.replace(/\{\{([^}]+)\}\}/g, "$1");
}

export function extractClozeTargets(sentence: string): string[] {
  const targets: string[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(sentence)) !== null) {
    const t = match[1].trim();
    if (t) targets.push(t);
  }
  return targets;
}

/**
 * Splits a clean sentence into ordered assembly tokens for Sentence Assembly drills.
 * Supports space-delimited languages as well as CJK character/clause segmentation.
 */
export function tokenizeSentenceForAssembly(rawSentence: string): string[] {
  const clean = stripClozeBrackets(rawSentence).trim();
  if (!clean) return [];

  // Prefer whitespace tokens if sentence has multiple spaces
  const spaceTokens = clean.split(/\s+/).filter(Boolean);
  if (spaceTokens.length >= 3) {
    return spaceTokens;
  }

  // Fallback for Japanese/Chinese/Korean or unspaced strings: split into meaningful 2-3 char chunks or punctuation boundaries
  const chars = Array.from(clean);
  if (chars.length <= 3) return chars;

  const chunks: string[] = [];
  let buffer = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (/[。、.,!?！？\s]/.test(ch)) {
      if (buffer) {
        chunks.push(buffer);
        buffer = "";
      }
      if (!/\s/.test(ch)) {
        chunks.push(ch);
      }
      continue;
    }
    buffer += ch;
    if (buffer.length >= 2 && i < chars.length - 1) {
      chunks.push(buffer);
      buffer = "";
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

// ============================================================================
// Shorthand Quick Capture Parser
// ============================================================================

export interface ParsedQuickCapture {
  term: string;
  reading: string;
  meaning: string;
  patternFormula: string;
  cefrLevel: LanguageCefrLevel;
  tags: string[];
}

/**
 * Parses fast capture syntax such as:
 *   "食べる (たべる) = to eat #verb @N5"
 *   "[Time] に [Place] へ 行く = go to a place at a time @A1 #grammar"
 *   "Avoir le cafard = to feel down #idiom"
 */
export function parseQuickLanguageCapture(
  rawInput: string,
  itemType: LanguageItemType,
): ParsedQuickCapture {
  let working = rawInput.trim();
  const tags: string[] = [];
  let cefrLevel: LanguageCefrLevel = "";

  // Extract @A1..@C2 CEFR tokens
  working = working.replace(
    /(?:^|\s)@(A1|A2|B1|B2|C1|C2)\b/gi,
    (_m, lvl: string) => {
      cefrLevel = lvl.toUpperCase() as LanguageCefrLevel;
      return " ";
    },
  );

  // Extract #tag tokens
  working = working.replace(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu, (_m, tag: string) => {
    const cleanTag = tag.trim().toLowerCase();
    if (cleanTag && !tags.includes(cleanTag)) {
      tags.push(cleanTag);
    }
    return " ";
  });

  working = working.replace(/\s+/g, " ").trim();

  let leftSide = working;
  let meaning = "";
  const eqMatch = working.match(/^(.+?)\s*(?:=|->|::)\s*(.+)$/);
  if (eqMatch) {
    leftSide = eqMatch[1].trim();
    meaning = eqMatch[2].trim();
  }

  let term = leftSide;
  let reading = "";
  const readingMatch = leftSide.match(/^(.+?)\s*[（(]([^）)]+)[）)]$/);
  if (readingMatch) {
    term = readingMatch[1].trim();
    reading = readingMatch[2].trim();
  }

  const hasSlots = /\[[^\]]+\]/.test(term);
  const patternFormula =
    itemType === "grammar" || itemType === "block" || hasSlots ? term : "";

  return {
    term,
    reading,
    meaning,
    patternFormula,
    cefrLevel,
    tags,
  };
}

// ============================================================================
// Built-in Browser Web Speech TTS Helper (Zero Audio Files Persisted)
// ============================================================================

export function isSpeechSynthesisAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

export function speakLanguageText(
  rawText: string,
  locale: string,
  rate: 0.7 | 1 = 1,
): boolean {
  const cleanText = stripClozeBrackets(rawText)
    .replace(/\[([^\]]+)\]/g, "$1")
    .trim();
  if (!cleanText || !isSpeechSynthesisAvailable()) {
    return false;
  }

  try {
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = locale || "en-US";
    utterance.rate = rate;

    const voices = synth.getVoices();
    if (voices.length > 0 && locale) {
      const normalized = locale.toLowerCase();
      const baseLang = normalized.split("-")[0];
      const exactVoice = voices.find(
        (v) => v.lang.toLowerCase() === normalized,
      );
      const baseVoice = voices.find((v) =>
        v.lang.toLowerCase().startsWith(baseLang),
      );
      if (exactVoice) utterance.voice = exactVoice;
      else if (baseVoice) utterance.voice = baseVoice;
    }

    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function stopLanguageSpeech(): void {
  if (!isSpeechSynthesisAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignore
  }
}

// ============================================================================
// CSV / TSV / Anki Deck Import & Export
// ============================================================================

export type LanguageTransferFormat = "csv" | "tsv" | "anki";

export function parseDelimitedRows(
  text: string,
  delimiter: "," | "\t",
): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const cleanText = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const next = cleanText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\r" && next === "\n") {
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      field = "";
      i += 1;
    } else if (ch === "\n" || ch === "\r") {
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  row.push(field.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

export function detectTextDelimiter(raw: string): "," | "\t" {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length === 0) return ",";
  const first = lines[0];
  const tabCount = (first.match(/\t/g) || []).length;
  const commaCount = (first.match(/,/g) || []).length;
  return tabCount >= commaCount && tabCount > 0 ? "\t" : ",";
}

export interface ImportedLanguageDraft {
  type: LanguageItemType;
  term: string;
  reading?: string;
  meaning: string;
  patternFormula?: string;
  partOfSpeech?: string;
  register?: LanguageRegister;
  topic?: string;
  cefrLevel?: LanguageCefrLevel;
  tags: string[];
  examples: LanguageExample[];
  nuanceNotes?: string;
}

export function escapeDelimitedCell(
  value: string,
  delimiter: "," | "\t",
): string {
  const safe = (value ?? "").replace(/\r?\n/g, " ");
  if (delimiter === "\t") {
    return safe.replace(/\t/g, "  ");
  }
  if (/[",\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function exportLanguageItemsToText(
  items: LanguageItem[],
  format: LanguageTransferFormat,
): string {
  if (format === "anki") {
    const header = [
      "#separator:tab",
      "#html:false",
      "#tags column:8",
    ];
    const rows = items.map((item) => {
      const firstEx = item.examples[0];
      const exampleText = firstEx
        ? `${firstEx.sentence}${firstEx.translation ? ` — ${firstEx.translation}` : ""}`
        : "";
      const noteBits = [
        item.patternFormula ? `Formula: ${item.patternFormula}` : "",
        item.partOfSpeech ? `POS: ${item.partOfSpeech}` : "",
        item.nuanceNotes || "",
      ]
        .filter(Boolean)
        .join(" | ");
      const ankiTags = [
        item.type,
        item.topic.replace(/\s+/g, "_"),
        item.cefrLevel,
        ...item.tags,
      ]
        .filter(Boolean)
        .map((t) => t.replace(/\s+/g, "_"))
        .join(" ");

      return [
        item.term,
        item.reading || "",
        item.meaning,
        item.patternFormula || "",
        exampleText,
        noteBits,
        item.cefrLevel || "",
        ankiTags,
      ]
        .map((c) => escapeDelimitedCell(c, "\t"))
        .join("\t");
    });
    return [...header, ...rows].join("\n");
  }

  const delimiter: "," | "\t" = format === "tsv" ? "\t" : ",";
  const columns = [
    "term",
    "reading",
    "meaning",
    "type",
    "formula",
    "partOfSpeech",
    "register",
    "topic",
    "cefr",
    "example",
    "exampleTranslation",
    "interlinearGloss",
    "nuanceNotes",
    "tags",
  ];
  const headerRow = columns.join(delimiter);
  const bodyRows = items.map((item) => {
    const ex = item.examples[0];
    const cells = [
      item.term,
      item.reading || "",
      item.meaning,
      item.type,
      item.patternFormula || "",
      item.partOfSpeech || "",
      item.register,
      item.topic,
      item.cefrLevel,
      ex?.sentence || "",
      ex?.translation || "",
      ex?.interlinearGloss || "",
      item.nuanceNotes || "",
      item.tags.join("; "),
    ];
    return cells.map((c) => escapeDelimitedCell(c, delimiter)).join(delimiter);
  });

  return [headerRow, ...bodyRows].join("\n");
}
