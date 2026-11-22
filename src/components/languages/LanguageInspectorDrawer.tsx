import React, { useEffect, useState } from "react";
import {
  Check,
  Edit3,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import {
  formatSrsIntervalLabel,
  LANGUAGE_CEFR_LEVELS,
  LANGUAGE_ITEM_TYPE_META,
  LANGUAGE_MASTERY_META,
  LANGUAGE_REGISTER_META,
  LANGUAGE_TOPIC_PACKS,
  parseClozeSegments,
  parsePatternSegments,
  speakLanguageText,
  stripClozeBrackets,
} from "../../lib/languageUtils";
import type {
  LanguageCefrLevel,
  LanguageDeck,
  LanguageExample,
  LanguageItem,
  LanguageItemType,
  LanguageProfile,
  LanguageRegister,
} from "../../types/languages";
import { getTodayKey } from "../../utils/date";

interface LanguageInspectorDrawerProps {
  item: LanguageItem | null;
  language: LanguageProfile;
  decks: LanguageDeck[];
  initialEditMode?: boolean;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<LanguageItem>) => void;
  onDelete: (id: string) => void;
  onOpenInStudio?: (itemId: string) => void;
  onNotify: (msg: string, tone?: "neutral" | "success" | "error") => void;
}

export const LanguageInspectorDrawer: React.FC<
  LanguageInspectorDrawerProps
> = ({
  item,
  language,
  decks,
  initialEditMode = false,
  onClose,
  onUpdate,
  onDelete,
  onOpenInStudio,
  onNotify,
}) => {
  const [editing, setEditing] = useState(initialEditMode);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Editable draft state
  const [type, setType] = useState<LanguageItemType>("vocab");
  const [term, setTerm] = useState("");
  const [reading, setReading] = useState("");
  const [meaning, setMeaning] = useState("");
  const [patternFormula, setPatternFormula] = useState("");
  const [slotHints, setSlotHints] = useState("");
  const [partOfSpeech, setPartOfSpeech] = useState("");
  const [register, setRegister] = useState<LanguageRegister>("neutral");
  const [rootsAndEtymology, setRootsAndEtymology] = useState("");
  const [nuanceNotes, setNuanceNotes] = useState("");
  const [topic, setTopic] = useState("Daily Life");
  const [cefrLevel, setCefrLevel] = useState<LanguageCefrLevel>("");
  const [deckIds, setDeckIds] = useState<string[]>([]);
  const [tagsInput, setTagsInput] = useState("");
  const [examples, setExamples] = useState<LanguageExample[]>([]);

  useEffect(() => {
    if (!item) return;
    setEditing(initialEditMode);
    setConfirmDelete(false);
    setType(item.type);
    setTerm(item.term);
    setReading(item.reading || "");
    setMeaning(item.meaning);
    setPatternFormula(item.patternFormula || "");
    setSlotHints(item.slotHints || "");
    setPartOfSpeech(item.partOfSpeech || "");
    setRegister(item.register || "neutral");
    setRootsAndEtymology(item.rootsAndEtymology || "");
    setNuanceNotes(item.nuanceNotes || "");
    setTopic(item.topic || "Daily Life");
    setCefrLevel(item.cefrLevel || "");
    setDeckIds(item.deckIds || []);
    setTagsInput((item.tags || []).join(", "));
    setExamples(
      (item.examples || []).map((ex) => ({
        ...ex,
      })),
    );
  }, [item, initialEditMode]);

  if (!item) return null;

  const handleSpeak = (text: string, rate: 0.7 | 1) => {
    const ok = speakLanguageText(text, language.ttsLocale, rate);
    if (!ok) {
      onNotify(
        "Speech synthesis is not available in this browser.",
        "error",
      );
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTerm = term.trim();
    if (!cleanTerm) {
      onNotify("Term or pattern cannot be empty.", "error");
      return;
    }
    const cleanTags = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const cleanExamples = examples
      .filter((ex) => ex.sentence.trim().length > 0)
      .map((ex) => ({
        id: ex.id,
        sentence: ex.sentence.trim(),
        reading: ex.reading?.trim() || undefined,
        translation: ex.translation.trim(),
        interlinearGloss: ex.interlinearGloss?.trim() || undefined,
        isContrast: Boolean(ex.isContrast),
      }));

    onUpdate(item.id, {
      type,
      term: cleanTerm,
      reading: reading.trim() || undefined,
      meaning: meaning.trim() || cleanTerm,
      patternFormula: patternFormula.trim() || undefined,
      slotHints: slotHints.trim() || undefined,
      partOfSpeech: partOfSpeech.trim() || undefined,
      register,
      rootsAndEtymology: rootsAndEtymology.trim() || undefined,
      nuanceNotes: nuanceNotes.trim() || undefined,
      topic: topic.trim() || "Daily Life",
      cefrLevel,
      deckIds,
      tags: Array.from(new Set(cleanTags)),
      examples: cleanExamples,
    });
    setEditing(false);
    onNotify("Entry updated", "success");
  };

  const handleAddExample = () => {
    setExamples((prev) => [
      ...prev,
      {
        id: `lex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        sentence: "",
        reading: "",
        translation: "",
        interlinearGloss: "",
        isContrast: false,
      },
    ]);
  };

  const handleUpdateExample = (
    exId: string,
    patch: Partial<LanguageExample>,
  ) => {
    setExamples((prev) =>
      prev.map((ex) => (ex.id === exId ? { ...ex, ...patch } : ex)),
    );
  };

  const handleRemoveExample = (exId: string) => {
    setExamples((prev) => prev.filter((ex) => ex.id !== exId));
  };

  const handleToggleDeck = (deckId: string) => {
    setDeckIds((prev) =>
      prev.includes(deckId)
        ? prev.filter((id) => id !== deckId)
        : [...prev, deckId],
    );
  };

  const handleResetSrs = () => {
    onUpdate(item.id, {
      srs: {
        stage: "new",
        easeFactor: 2.5,
        intervalDays: 0,
        repetitions: 0,
        lapses: 0,
        dueDate: getTodayKey(),
        lastReviewedAt: null,
      },
    });
    onNotify("Spaced repetition schedule reset to New", "success");
  };

  const itemDecks = decks.filter((d) => item.deckIds.includes(d.id));
  const masteryInfo = LANGUAGE_MASTERY_META[item.srs?.stage || "new"];
  const typeMeta = LANGUAGE_ITEM_TYPE_META[item.type];
  const formulaSegments = item.patternFormula
    ? parsePatternSegments(item.patternFormula)
    : [];

  return (
    <aside
      className="flex flex-col h-full border-l overflow-hidden"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
      aria-label="Language Entry Inspector"
    >
      {/* Top Toolbar */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div
          className="text-xs flex items-center gap-1.5 min-w-0 truncate"
          style={{ color: "var(--text-muted)" }}
        >
          <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
            {typeMeta.short}
          </span>
          {item.cefrLevel && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{item.cefrLevel}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span style={{ color: masteryInfo.toneColor }}>
            {masteryInfo.label}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onUpdate(item.id, { favorite: !item.favorite })}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{
              color: item.favorite ? "var(--warning)" : "var(--text-muted)",
            }}
            aria-label={item.favorite ? "Remove favorite" : "Mark favorite"}
            title="Favorite"
          >
            <Star
              className="w-4 h-4"
              fill={item.favorite ? "currentColor" : "none"}
            />
          </button>

          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
            style={{
              borderColor: "var(--border-subtle)",
              backgroundColor: editing
                ? "var(--accent-soft)"
                : "var(--bg-surface-subtle)",
              color: editing ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            <Edit3 className="w-3.5 h-3.5" />
            {editing ? "Preview" : "Edit"}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ color: "var(--text-muted)" }}
            aria-label="Close inspector"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-5">
        {editing ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              <label className="space-y-1 text-xs">
                <span style={{ color: "var(--text-secondary)" }}>Type</span>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as LanguageItemType)}
                  className="w-full h-9 px-2.5 rounded-lg border text-xs"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                >
                  <option value="vocab">Vocabulary / Noun</option>
                  <option value="grammar">Grammar Pattern</option>
                  <option value="phrase">Phrase / Chunk</option>
                  <option value="block">Building Block</option>
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span style={{ color: "var(--text-secondary)" }}>Register</span>
                <select
                  value={register}
                  onChange={(e) =>
                    setRegister(e.target.value as LanguageRegister)
                  }
                  className="w-full h-9 px-2.5 rounded-lg border text-xs"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                >
                  {Object.entries(LANGUAGE_REGISTER_META).map(([key, meta]) => (
                    <option key={key} value={key}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1 text-xs">
              <span style={{ color: "var(--text-secondary)" }}>
                Term / Expression *
              </span>
              <input
                type="text"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border text-sm font-medium"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
                required
              />
            </label>

            <label className="block space-y-1 text-xs">
              <span style={{ color: "var(--text-secondary)" }}>
                Pronunciation / Reading / IPA
              </span>
              <input
                type="text"
                value={reading}
                onChange={(e) => setReading(e.target.value)}
                placeholder="e.g. きっさてん · /kɪsːaten/"
                className="w-full h-9 px-3 rounded-lg border text-xs font-mono"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              />
            </label>

            <label className="block space-y-1 text-xs">
              <span style={{ color: "var(--text-secondary)" }}>Meaning *</span>
              <input
                type="text"
                value={meaning}
                onChange={(e) => setMeaning(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border text-sm"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
                required
              />
            </label>

            <div className="space-y-2.5 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
              <label className="block space-y-1 text-xs">
                <span style={{ color: "var(--text-secondary)" }}>
                  Pattern Formula (use [Slot] for Sentence Studio)
                </span>
                <input
                  type="text"
                  value={patternFormula}
                  onChange={(e) => setPatternFormula(e.target.value)}
                  placeholder="e.g. [Time] に [Place] で [Noun] を [Verb-て]みる"
                  className="w-full h-9 px-3 rounded-lg border text-xs font-mono"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                />
              </label>

              <label className="block space-y-1 text-xs">
                <span style={{ color: "var(--text-secondary)" }}>
                  Slot Hints (Slot:opt1,opt2 | Slot2:optA,optB)
                </span>
                <input
                  type="text"
                  value={slotHints}
                  onChange={(e) => setSlotHints(e.target.value)}
                  placeholder="e.g. Time:今日,週末 | Place:カフェ,駅"
                  className="w-full h-9 px-3 rounded-lg border text-xs font-mono"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="space-y-1 text-xs">
                <span style={{ color: "var(--text-secondary)" }}>
                  POS / Gender / Classifier
                </span>
                <input
                  type="text"
                  value={partOfSpeech}
                  onChange={(e) => setPartOfSpeech(e.target.value)}
                  placeholder="e.g. Noun (f.), Classifier: 個"
                  className="w-full h-9 px-2.5 rounded-lg border text-xs"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                />
              </label>

              <label className="space-y-1 text-xs">
                <span style={{ color: "var(--text-secondary)" }}>
                  CEFR Level
                </span>
                <select
                  value={cefrLevel}
                  onChange={(e) =>
                    setCefrLevel(e.target.value as LanguageCefrLevel)
                  }
                  className="w-full h-9 px-2.5 rounded-lg border text-xs"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                >
                  <option value="">Unranked</option>
                  {LANGUAGE_CEFR_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="space-y-1 text-xs">
                <span style={{ color: "var(--text-secondary)" }}>Topic Pack</span>
                <input
                  list="kanso-language-topics"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border text-xs"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                />
                <datalist id="kanso-language-topics">
                  {LANGUAGE_TOPIC_PACKS.map((tp) => (
                    <option key={tp} value={tp} />
                  ))}
                </datalist>
              </label>

              <label className="space-y-1 text-xs">
                <span style={{ color: "var(--text-secondary)" }}>
                  Tags (comma separated)
                </span>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="verb, coffee, polite"
                  className="w-full h-9 px-2.5 rounded-lg border text-xs"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                />
              </label>
            </div>

            {decks.length > 0 && (
              <div className="space-y-1.5">
                <span
                  className="text-xs block"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Custom Decks
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {decks.map((d) => {
                    const active = deckIds.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => handleToggleDeck(d.id)}
                        className="h-7 px-2.5 rounded-md border text-xs font-medium whitespace-nowrap"
                        style={{
                          borderColor: active
                            ? "var(--accent)"
                            : "var(--border-subtle)",
                          backgroundColor: active
                            ? "var(--accent-soft)"
                            : "var(--bg-surface-subtle)",
                          color: active
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                        }}
                      >
                        {d.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="block space-y-1 text-xs">
              <span style={{ color: "var(--text-secondary)" }}>
                Roots, Affixes &amp; Etymology
              </span>
              <textarea
                rows={2}
                value={rootsAndEtymology}
                onChange={(e) => setRootsAndEtymology(e.target.value)}
                placeholder="Word breakdown, kanji radicals, cognates..."
                className="w-full p-2.5 rounded-lg border text-xs leading-relaxed"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              />
            </label>

            <label className="block space-y-1 text-xs">
              <span style={{ color: "var(--text-secondary)" }}>
                Usage &amp; Nuance Notes
              </span>
              <textarea
                rows={2}
                value={nuanceNotes}
                onChange={(e) => setNuanceNotes(e.target.value)}
                placeholder="Difference from synonyms, grammar restrictions..."
                className="w-full p-2.5 rounded-lg border text-xs leading-relaxed"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              />
            </label>

            {/* Examples Editor */}
            <div
              className="space-y-2.5 pt-2 border-t"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Examples (wrap cloze targets in {"{{brackets}}"})
                </span>
                <button
                  type="button"
                  onClick={handleAddExample}
                  className="h-7 px-2.5 rounded-md border text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: "var(--accent)",
                  }}
                >
                  <Plus className="w-3 h-3" />
                  Add Example
                </button>
              </div>

              {examples.map((ex, idx) => (
                <div
                  key={ex.id}
                  className="p-3 rounded-xl border space-y-2"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[11px] font-mono tabular-nums"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Example {idx + 1}
                    </span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(ex.isContrast)}
                          onChange={(e) =>
                            handleUpdateExample(ex.id, {
                              isContrast: e.target.checked,
                            })
                          }
                          style={{ accentColor: "var(--accent)" }}
                        />
                        Contrast example
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveExample(ex.id)}
                        className="text-xs"
                        style={{ color: "var(--danger)" }}
                        aria-label="Remove example"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={ex.sentence}
                    onChange={(e) =>
                      handleUpdateExample(ex.id, { sentence: e.target.value })
                    }
                    placeholder="Sentence with {{cloze}} highlight..."
                    className="w-full h-8 px-2.5 rounded-lg border text-xs"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface)",
                    }}
                  />
                  <input
                    type="text"
                    value={ex.reading || ""}
                    onChange={(e) =>
                      handleUpdateExample(ex.id, { reading: e.target.value })
                    }
                    placeholder="Optional phonetic reading..."
                    className="w-full h-8 px-2.5 rounded-lg border text-xs font-mono"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface)",
                    }}
                  />
                  <input
                    type="text"
                    value={ex.translation}
                    onChange={(e) =>
                      handleUpdateExample(ex.id, {
                        translation: e.target.value,
                      })
                    }
                    placeholder="Translation..."
                    className="w-full h-8 px-2.5 rounded-lg border text-xs"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface)",
                    }}
                  />
                  <input
                    type="text"
                    value={ex.interlinearGloss || ""}
                    onChange={(e) =>
                      handleUpdateExample(ex.id, {
                        interlinearGloss: e.target.value,
                      })
                    }
                    placeholder="Interlinear gloss e.g. 今日(today) · カフェで(at café)"
                    className="w-full h-8 px-2.5 rounded-lg border text-xs font-mono"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface)",
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="h-9 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: "var(--danger)",
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(item.id);
                    onClose();
                  }}
                  className="h-9 px-3 rounded-lg text-xs font-semibold"
                  style={{
                    backgroundColor: "var(--danger)",
                    color: "#ffffff",
                  }}
                >
                  Confirm Delete
                </button>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="h-9 px-3.5 rounded-lg border text-xs font-medium"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  <Check className="w-3.5 h-3.5" />
                  Save Entry
                </button>
              </div>
            </div>
          </form>
        ) : (
          <>
            {/* Headword + Pronunciation + TTS */}
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-xl font-bold tracking-tight break-words">
                    {item.term}
                  </h3>
                  {item.reading && (
                    <div
                      className="text-sm font-mono mt-0.5 break-words"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {item.reading}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSpeak(item.term, 1)}
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                      color: "var(--text-secondary)",
                    }}
                    title="Speak at normal speed (1.0x)"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    1.0x
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSpeak(item.term, 0.7)}
                    className="h-8 px-2 rounded-lg border text-xs font-mono tabular-nums whitespace-nowrap"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                      color: "var(--text-muted)",
                    }}
                    title="Speak slowly (0.7x)"
                  >
                    0.7x
                  </button>
                </div>
              </div>

              <p className="text-sm leading-relaxed">{item.meaning}</p>

              {/* Unboxed Linguistic Metadata Line */}
              <div
                className="text-xs flex flex-wrap items-center gap-x-2 gap-y-1 pt-1"
                style={{ color: "var(--text-muted)" }}
              >
                {item.partOfSpeech && <span>{item.partOfSpeech}</span>}
                {item.partOfSpeech && <span aria-hidden="true">·</span>}
                <span>{LANGUAGE_REGISTER_META[item.register]?.label}</span>
                <span aria-hidden="true">·</span>
                <span>{item.topic}</span>
                {itemDecks.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{itemDecks.map((d) => d.name).join(", ")}</span>
                  </>
                )}
              </div>

              {item.tags.length > 0 && (
                <div
                  className="text-xs font-mono"
                  style={{ color: "var(--text-muted)" }}
                >
                  {item.tags.map((t) => `#${t}`).join("  ")}
                </div>
              )}
            </div>

            {/* Pattern Formula & Slots */}
            {item.patternFormula && (
              <div
                className="p-3.5 rounded-xl border space-y-2.5"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Pattern Formula
                  </span>
                  {onOpenInStudio && (
                    <button
                      type="button"
                      onClick={() => onOpenInStudio(item.id)}
                      className="text-xs font-medium whitespace-nowrap"
                      style={{ color: "var(--accent)" }}
                    >
                      Open in Block Studio →
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-sm font-mono leading-relaxed">
                  {formulaSegments.map((seg, i) =>
                    seg.kind === "slot" ? (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md border text-xs font-semibold"
                        style={{
                          borderColor: "var(--accent)",
                          backgroundColor: "var(--accent-soft)",
                          color: "var(--accent)",
                        }}
                      >
                        [{seg.value}]
                      </span>
                    ) : (
                      <span key={i}>{seg.value}</span>
                    ),
                  )}
                </div>

                {item.slotHints && (
                  <div
                    className="text-xs font-mono leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Slots: {item.slotHints}
                  </div>
                )}
              </div>
            )}

            {/* Roots & Nuance Notes */}
            {(item.rootsAndEtymology || item.nuanceNotes) && (
              <div
                className="space-y-3 pt-3 border-t"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {item.rootsAndEtymology && (
                  <div className="space-y-1">
                    <div
                      className="text-xs font-semibold"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Roots, Affixes &amp; Etymology
                    </div>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {item.rootsAndEtymology}
                    </p>
                  </div>
                )}
                {item.nuanceNotes && (
                  <div className="space-y-1">
                    <div
                      className="text-xs font-semibold"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Nuance &amp; Usage Notes
                    </div>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {item.nuanceNotes}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Context Examples with Cloze Highlight + Interlinear Gloss */}
            <div
              className="space-y-2.5 pt-3 border-t"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div
                className="text-xs font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                Examples &amp; Interlinear Gloss ({item.examples.length})
              </div>

              {item.examples.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  No example sentences yet. Click Edit to add context sentences
                  with {"{{cloze}}"} highlights.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {item.examples.map((ex) => {
                    const segs = parseClozeSegments(ex.sentence);
                    return (
                      <div
                        key={ex.id}
                        className="p-3 rounded-xl border space-y-1.5"
                        style={{
                          borderColor: "var(--border-subtle)",
                          backgroundColor: "var(--bg-surface-subtle)",
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm leading-relaxed min-w-0">
                            {ex.isContrast && (
                              <span
                                className="text-[11px] font-semibold mr-1.5"
                                style={{ color: "var(--warning)" }}
                              >
                                Contrast:
                              </span>
                            )}
                            {segs.map((seg, i) =>
                              seg.kind === "cloze" ? (
                                <mark
                                  key={i}
                                  className="px-1 py-0.5 rounded font-semibold"
                                  style={{
                                    backgroundColor: "var(--accent-soft)",
                                    color: "var(--accent)",
                                  }}
                                >
                                  {seg.value}
                                </mark>
                              ) : (
                                <span key={i}>{seg.value}</span>
                              ),
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                handleSpeak(stripClozeBrackets(ex.sentence), 1)
                              }
                              className="w-7 h-7 rounded-md border flex items-center justify-center"
                              style={{
                                borderColor: "var(--border-subtle)",
                                color: "var(--text-secondary)",
                              }}
                              title="Play example (1.0x)"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleSpeak(
                                  stripClozeBrackets(ex.sentence),
                                  0.7,
                                )
                              }
                              className="h-7 px-1.5 rounded-md border text-[11px] font-mono tabular-nums"
                              style={{
                                borderColor: "var(--border-subtle)",
                                color: "var(--text-muted)",
                              }}
                              title="Play slowly (0.7x)"
                            >
                              0.7x
                            </button>
                          </div>
                        </div>

                        {ex.reading && (
                          <div
                            className="text-xs font-mono"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {ex.reading}
                          </div>
                        )}
                        {ex.translation && (
                          <div
                            className="text-xs"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {ex.translation}
                          </div>
                        )}
                        {ex.interlinearGloss && (
                          <div
                            className="text-[11px] font-mono pt-1 border-t"
                            style={{
                              borderColor: "var(--border-subtle)",
                              color: "var(--text-muted)",
                            }}
                          >
                            {ex.interlinearGloss}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SM-2 Memory Schedule */}
            <div
              className="space-y-2 pt-3 border-t"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-xs font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                >
                  SM-2 Memory Schedule
                </span>
                <button
                  type="button"
                  onClick={handleResetSrs}
                  className="text-xs inline-flex items-center gap-1 whitespace-nowrap"
                  style={{ color: "var(--text-muted)" }}
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset SRS
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                <div
                  className="p-2 rounded-lg border"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Interval
                  </div>
                  <div className="font-semibold mt-0.5">
                    {formatSrsIntervalLabel(item.srs.intervalDays)}
                  </div>
                </div>
                <div
                  className="p-2 rounded-lg border"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Ease
                  </div>
                  <div className="font-semibold mt-0.5">
                    {item.srs.easeFactor.toFixed(2)}
                  </div>
                </div>
                <div
                  className="p-2 rounded-lg border"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Reps / Lapses
                  </div>
                  <div className="font-semibold mt-0.5">
                    {item.srs.repetitions} / {item.srs.lapses}
                  </div>
                </div>
                <div
                  className="p-2 rounded-lg border"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Due Date
                  </div>
                  <div className="font-semibold mt-0.5">{item.srs.dueDate}</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
