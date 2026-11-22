export type LanguageItemType = "vocab" | "grammar" | "phrase" | "block";

export type LanguageMasteryStage =
  | "new"
  | "learning"
  | "familiar"
  | "mastered";

export type LanguageCefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "";

export type LanguageRegister =
  | "neutral"
  | "casual"
  | "polite"
  | "formal"
  | "slang"
  | "literary";

export type LanguageSrsRating = 0 | 1 | 2 | 3; // 0: Again, 1: Hard, 2: Good, 3: Easy

export interface LanguageProfile {
  id: string;
  name: string;
  nativeName: string;
  code: string; // 2-3 char badge e.g. "JA", "ES"
  ttsLocale: string; // BCP-47 tag e.g. "ja-JP", "es-ES"
  scriptHint?: string; // e.g. "Kana / Kanji", "Latin", "Hangul"
  dailyGoal: number;
  createdAt: string;
  updatedAt: string;
}

export interface LanguageExample {
  id: string;
  sentence: string; // Supports inline {{cloze}} brackets
  reading?: string; // Phonetic reading / furigana / pinyin / IPA
  translation: string;
  interlinearGloss?: string; // Optional word-by-word gloss e.g. "きょう(today) · は(topic) · 行く(go)"
  isContrast?: boolean; // Marks nuance/contrast comparison example
}

export interface LanguageSrsState {
  stage: LanguageMasteryStage;
  easeFactor: number; // Default 2.5
  intervalDays: number; // 0 for brand-new/relearn
  repetitions: number;
  lapses: number;
  dueDate: string; // YYYY-MM-DD local date key
  lastReviewedAt: string | null; // ISO timestamp
}

export interface LanguageItem {
  id: string;
  languageId: string;
  type: LanguageItemType;
  term: string; // Primary word, phrase, or grammar headword
  reading?: string; // Pronunciation / IPA / Pinyin / Hiragana
  meaning: string;
  patternFormula?: string; // e.g. "[Time] に [Place] へ [Verb-ます]"
  slotHints?: string; // Comma-separated helper hints for slots e.g. "Time:きょう,あした | Verb:行く,食べる"
  partOfSpeech?: string; // e.g. "Noun (masculine)", "Ichidan Verb", "Particle", "Connector"
  register: LanguageRegister;
  rootsAndEtymology?: string; // Roots, kanji breakdown, affixes, cognates
  nuanceNotes?: string; // Structural usage notes, grammar rules, false friends
  examples: LanguageExample[];
  topic: string; // Topic pack e.g. "Daily Life", "Travel", "Work & Tech"
  cefrLevel: LanguageCefrLevel;
  deckIds: string[];
  tags: string[];
  favorite: boolean;
  srs: LanguageSrsState;
  createdAt: string;
  updatedAt: string;
}

export interface LanguageDeck {
  id: string;
  languageId: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface LanguageDailyStat {
  dateKey: string; // YYYY-MM-DD
  languageId: string;
  reviewedCount: number;
  capturedCount: number;
}

export interface LanguagePreset {
  key: string;
  name: string;
  nativeName: string;
  code: string;
  ttsLocale: string;
  scriptHint: string;
}
