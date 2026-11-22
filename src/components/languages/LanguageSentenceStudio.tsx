import React, { useEffect, useMemo, useState } from "react";
import {
  BookmarkPlus,
  Check,
  Dices,
  Layers,
  Plus,
  Search,
  Volume2,
} from "lucide-react";
import {
  LANGUAGE_TOPIC_PACKS,
  parsePatternSegments,
  speakLanguageText,
} from "../../lib/languageUtils";
import type { LanguageItem, LanguageProfile } from "../../types/languages";

interface LanguageSentenceStudioProps {
  language: LanguageProfile;
  items: LanguageItem[];
  focusedFormulaItemId?: string | null;
  onSaveAsPhrase: (draft: {
    sentence: string;
    translation: string;
    interlinearGloss: string;
    topic: string;
    tags: string[];
  }) => void;
  onAttachExampleToPattern: (
    patternItemId: string,
    example: {
      sentence: string;
      translation: string;
      interlinearGloss?: string;
    },
  ) => void;
  onNotify: (msg: string, tone?: "neutral" | "success" | "error") => void;
}

interface SlotSuggestion {
  text: string;
  meaning?: string;
  source: "hint" | "vault";
}

function parseSlotHintMap(slotHints?: string): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  if (!slotHints) return map;
  const groups = slotHints.split("|");
  for (const g of groups) {
    const colonIdx = g.indexOf(":");
    if (colonIdx === -1) continue;
    const key = g.slice(0, colonIdx).trim().toLowerCase();
    const values = g
      .slice(colonIdx + 1)
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (key && values.length > 0) {
      map[key] = values;
    }
  }
  return map;
}

export const LanguageSentenceStudio: React.FC<LanguageSentenceStudioProps> = ({
  language,
  items,
  focusedFormulaItemId,
  onSaveAsPhrase,
  onAttachExampleToPattern,
  onNotify,
}) => {
  const patternItems = useMemo(
    () =>
      items.filter(
        (it) =>
          Boolean(it.patternFormula?.trim()) ||
          it.type === "grammar" ||
          it.type === "block",
      ),
    [items],
  );

  const [selectedPatternId, setSelectedPatternId] = useState<string>("custom");
  const [customFormula, setCustomFormula] = useState(
    "[Subject] + [Time] + [Object]",
  );
  const [slotValues, setSlotValues] = useState<Record<string, string>>({});
  const [slotMeanings, setSlotMeanings] = useState<Record<string, string>>({});
  const [activeSlotKey, setActiveSlotKey] = useState<string | null>(null);
  const [vaultSearch, setVaultSearch] = useState("");
  const [customSlotInput, setCustomSlotInput] = useState("");
  const [translation, setTranslation] = useState("");
  const [manualGloss, setManualGloss] = useState("");
  const [patternSearch, setPatternSearch] = useState("");

  useEffect(() => {
    if (focusedFormulaItemId) {
      const found = patternItems.find((p) => p.id === focusedFormulaItemId);
      if (found) {
        setSelectedPatternId(found.id);
        setSlotValues({});
        setSlotMeanings({});
        setActiveSlotKey(null);
        return;
      }
    }
    if (
      selectedPatternId === "custom" &&
      patternItems.length > 0 &&
      !focusedFormulaItemId
    ) {
      setSelectedPatternId(patternItems[0].id);
    }
  }, [focusedFormulaItemId, patternItems, selectedPatternId]);

  const activePatternItem = useMemo(
    () => patternItems.find((p) => p.id === selectedPatternId) || null,
    [patternItems, selectedPatternId],
  );

  const activeFormula =
    selectedPatternId === "custom"
      ? customFormula
      : activePatternItem?.patternFormula || activePatternItem?.term || "";

  const segments = useMemo(
    () => parsePatternSegments(activeFormula),
    [activeFormula],
  );

  const slotSegments = useMemo(
    () => segments.filter((s) => s.kind === "slot"),
    [segments],
  );

  useEffect(() => {
    if (
      slotSegments.length > 0 &&
      (!activeSlotKey ||
        !slotSegments.some((s) => s.slotKey === activeSlotKey))
    ) {
      setActiveSlotKey(slotSegments[0].slotKey || null);
    } else if (slotSegments.length === 0) {
      setActiveSlotKey(null);
    }
  }, [slotSegments, activeSlotKey]);

  const hintMap = useMemo(
    () => parseSlotHintMap(activePatternItem?.slotHints),
    [activePatternItem?.slotHints],
  );

  const activeSlotSegment = useMemo(
    () => slotSegments.find((s) => s.slotKey === activeSlotKey) || null,
    [slotSegments, activeSlotKey],
  );

  const suggestionsForActiveSlot = useMemo<SlotSuggestion[]>(() => {
    if (!activeSlotSegment) return [];
    const slotLabel = activeSlotSegment.value.toLowerCase();
    const out: SlotSuggestion[] = [];
    const seen = new Set<string>();

    // 1. Hints explicitly authored on this pattern
    for (const [hintKey, vals] of Object.entries(hintMap)) {
      if (slotLabel.includes(hintKey) || hintKey.includes(slotLabel)) {
        for (const v of vals) {
          if (!seen.has(v)) {
            seen.add(v);
            out.push({ text: v, source: "hint" });
          }
        }
      }
    }

    // 2. Compatible items from the active language vault
    const needle = vaultSearch.trim().toLowerCase();
    const vaultCandidates = items.filter((it) => {
      if (it.id === activePatternItem?.id) return false;
      if (needle) {
        return (
          it.term.toLowerCase().includes(needle) ||
          it.meaning.toLowerCase().includes(needle) ||
          (it.partOfSpeech || "").toLowerCase().includes(needle) ||
          it.tags.some((t) => t.toLowerCase().includes(needle))
        );
      }
      return it.type === "vocab" || it.type === "block" || it.type === "phrase";
    });

    // Rank items whose POS/tags match the slot label first
    const scored = vaultCandidates
      .map((it) => {
        const hay = `${it.partOfSpeech || ""} ${it.topic} ${it.tags.join(" ")}`.toLowerCase();
        let score = 0;
        if (slotLabel.includes("verb") && hay.includes("verb")) score += 4;
        if (slotLabel.includes("noun") && hay.includes("noun")) score += 4;
        if (slotLabel.includes("time") && hay.includes("time")) score += 4;
        if (slotLabel.includes("place") && hay.includes("place")) score += 4;
        if (slotLabel.includes("adj") && hay.includes("adj")) score += 4;
        if (slotLabel.includes("topic") || slotLabel.includes("clause")) {
          if (it.type === "phrase" || it.type === "block") score += 2;
        }
        return { it, score };
      })
      .sort((a, b) => b.score - a.score);

    for (const { it } of scored.slice(0, 24)) {
      if (!seen.has(it.term)) {
        seen.add(it.term);
        out.push({ text: it.term, meaning: it.meaning, source: "vault" });
      }
    }
    return out;
  }, [activeSlotSegment, hintMap, items, activePatternItem?.id, vaultSearch]);

  const assembledSentence = useMemo(() => {
    if (segments.length === 0) return "";
    return segments
      .map((seg) => {
        if (seg.kind === "text") return seg.value;
        const key = seg.slotKey || seg.value;
        return slotValues[key]?.trim() || `[${seg.value}]`;
      })
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  }, [segments, slotValues]);

  const autoGloss = useMemo(() => {
    const parts: string[] = [];
    for (const seg of segments) {
      if (seg.kind !== "slot") continue;
      const key = seg.slotKey || seg.value;
      const val = slotValues[key]?.trim();
      if (!val) continue;
      const m = slotMeanings[key];
      parts.push(m ? `${val}(${m})` : `${val}(${seg.value})`);
    }
    if (activePatternItem) {
      parts.push(`[Pattern: ${activePatternItem.term} = ${activePatternItem.meaning}]`);
    }
    return parts.join(" · ");
  }, [segments, slotValues, slotMeanings, activePatternItem]);

  const filteredPatterns = useMemo(() => {
    const q = patternSearch.trim().toLowerCase();
    if (!q) return patternItems;
    return patternItems.filter(
      (p) =>
        p.term.toLowerCase().includes(q) ||
        (p.patternFormula || "").toLowerCase().includes(q) ||
        p.meaning.toLowerCase().includes(q),
    );
  }, [patternItems, patternSearch]);

  const handleAssignSlot = (
    slotKey: string,
    text: string,
    meaningText?: string,
  ) => {
    setSlotValues((prev) => ({ ...prev, [slotKey]: text }));
    setSlotMeanings((prev) => {
      const next = { ...prev };
      if (meaningText) next[slotKey] = meaningText;
      else delete next[slotKey];
      return next;
    });
    // Advance to next unfilled slot automatically
    const curIdx = slotSegments.findIndex((s) => s.slotKey === slotKey);
    if (curIdx >= 0 && curIdx + 1 < slotSegments.length) {
      setActiveSlotKey(slotSegments[curIdx + 1].slotKey || null);
    }
  };

  const handleRandomizeSlots = () => {
    if (slotSegments.length === 0) return;
    const nextVals: Record<string, string> = {};
    const nextMeanings: Record<string, string> = {};
    const vocabPool = items.filter(
      (it) => it.type === "vocab" || it.type === "block",
    );

    for (const seg of slotSegments) {
      const key = seg.slotKey || seg.value;
      const label = seg.value.toLowerCase();
      let pickedText = "";
      let pickedMeaning = "";

      for (const [hintKey, vals] of Object.entries(hintMap)) {
        if (
          (label.includes(hintKey) || hintKey.includes(label)) &&
          vals.length > 0
        ) {
          pickedText = vals[Math.floor(Math.random() * vals.length)];
          break;
        }
      }

      if (!pickedText && vocabPool.length > 0) {
        const picked = vocabPool[Math.floor(Math.random() * vocabPool.length)];
        pickedText = picked.term;
        pickedMeaning = picked.meaning;
      }

      if (pickedText) {
        nextVals[key] = pickedText;
        if (pickedMeaning) nextMeanings[key] = pickedMeaning;
      }
    }

    setSlotValues(nextVals);
    setSlotMeanings(nextMeanings);
  };

  const handleSpeak = (rate: 0.7 | 1) => {
    const ok = speakLanguageText(assembledSentence, language.ttsLocale, rate);
    if (!ok) {
      onNotify("Speech synthesis is unavailable in this browser.", "error");
    }
  };

  const handleSavePhrase = () => {
    if (!assembledSentence) return;
    onSaveAsPhrase({
      sentence: assembledSentence,
      translation: translation.trim(),
      interlinearGloss: (manualGloss || autoGloss).trim(),
      topic: activePatternItem?.topic || LANGUAGE_TOPIC_PACKS[0],
      tags: ["studio-built", ...(activePatternItem?.tags.slice(0, 2) || [])],
    });
    setTranslation("");
    setManualGloss("");
  };

  const handleAttachExample = () => {
    if (!activePatternItem || !assembledSentence) return;
    onAttachExampleToPattern(activePatternItem.id, {
      sentence: assembledSentence,
      translation: translation.trim(),
      interlinearGloss: (manualGloss || autoGloss).trim() || undefined,
    });
    setTranslation("");
    setManualGloss("");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left/Top Stage: Interactive Sentence Synthesizer */}
      <div
        className="lg:col-span-8 rounded-2xl border p-4 sm:p-5 space-y-5"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Building Block Sentence Studio
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Click any [Slot] token below to combine grammar skeletons with
              saved vocabulary.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRandomizeSlots}
              disabled={slotSegments.length === 0}
              className="h-8 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-40"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-surface-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              <Dices className="w-3.5 h-3.5" />
              Shuffle Slots
            </button>
            <button
              type="button"
              onClick={() => {
                setSlotValues({});
                setSlotMeanings({});
              }}
              className="h-8 px-2.5 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Custom Formula Input when Custom Selected */}
        {selectedPatternId === "custom" && (
          <label className="block space-y-1 text-xs">
            <span style={{ color: "var(--text-secondary)" }}>
              Custom Formula (use [SlotName] placeholders)
            </span>
            <input
              type="text"
              value={customFormula}
              onChange={(e) => setCustomFormula(e.target.value)}
              placeholder="[Time] + [Subject] + [Verb] + [Object]"
              className="w-full h-10 px-3 rounded-xl border text-sm font-mono"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-surface-subtle)",
              }}
            />
          </label>
        )}

        {/* Interactive Formula Slots */}
        <div
          className="p-4 rounded-xl border space-y-3"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-surface-subtle)",
          }}
        >
          {activePatternItem && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold">{activePatternItem.term}</span>
              <span style={{ color: "var(--text-secondary)" }}>
                {activePatternItem.meaning}
              </span>
            </div>
          )}

          {segments.length === 0 ? (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              Select a pattern or add [Slot] brackets to build sentences.
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-base">
              {segments.map((seg, i) => {
                if (seg.kind === "text") {
                  return (
                    <span key={i} className="font-medium">
                      {seg.value}
                    </span>
                  );
                }
                const key = seg.slotKey || seg.value;
                const filled = slotValues[key]?.trim();
                const isActive = activeSlotKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveSlotKey(key)}
                    className="h-9 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    style={{
                      borderColor: isActive
                        ? "var(--accent)"
                        : filled
                          ? "var(--border-strong)"
                          : "var(--border-subtle)",
                      backgroundColor: isActive
                        ? "var(--accent-soft)"
                        : "var(--bg-surface)",
                      color: filled ? "var(--text-primary)" : "var(--accent)",
                    }}
                  >
                    <span
                      className="text-[10px] font-mono"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {seg.value}:
                    </span>
                    <span className="font-semibold">
                      {filled || "Pick…"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Active Slot Picker */}
        {activeSlotSegment && (
          <div
            className="p-3.5 rounded-xl border space-y-3"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold">
                Fill [{activeSlotSegment.value}]
              </div>
              <div className="flex items-center gap-2 flex-1 sm:flex-initial sm:w-64">
                <div className="relative flex-1">
                  <Search
                    className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <input
                    type="text"
                    value={vaultSearch}
                    onChange={(e) => setVaultSearch(e.target.value)}
                    placeholder="Filter vault blocks..."
                    className="w-full h-8 pl-8 pr-2.5 rounded-lg border text-xs"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Custom Inline Filler */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customSlotInput}
                onChange={(e) => setCustomSlotInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customSlotInput.trim()) {
                    e.preventDefault();
                    handleAssignSlot(
                      activeSlotSegment.slotKey || activeSlotSegment.value,
                      customSlotInput.trim(),
                    );
                    setCustomSlotInput("");
                  }
                }}
                placeholder={`Type custom text for [${activeSlotSegment.value}] and press Enter`}
                className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border text-xs"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              />
              <button
                type="button"
                disabled={!customSlotInput.trim()}
                onClick={() => {
                  handleAssignSlot(
                    activeSlotSegment.slotKey || activeSlotSegment.value,
                    customSlotInput.trim(),
                  );
                  setCustomSlotInput("");
                }}
                className="h-8 px-3 rounded-lg text-xs font-medium disabled:opacity-40 whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                Use Text
              </button>
            </div>

            {/* Suggestions Grid */}
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {suggestionsForActiveSlot.length === 0 ? (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  No matching saved items yet — type any text above.
                </span>
              ) : (
                suggestionsForActiveSlot.map((sug, idx) => {
                  const key =
                    activeSlotSegment.slotKey || activeSlotSegment.value;
                  const selected = slotValues[key] === sug.text;
                  return (
                    <button
                      key={`${sug.text}-${idx}`}
                      type="button"
                      onClick={() =>
                        handleAssignSlot(key, sug.text, sug.meaning)
                      }
                      className="px-2.5 py-1.5 rounded-lg border text-left transition-colors"
                      style={{
                        borderColor: selected
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                        backgroundColor: selected
                          ? "var(--accent-soft)"
                          : "var(--bg-surface-subtle)",
                      }}
                    >
                      <div className="text-xs font-semibold">{sug.text}</div>
                      {sug.meaning && (
                        <div
                          className="text-[10px] truncate max-w-[160px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {sug.meaning}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Live Output & Actions */}
        <div
          className="p-4 rounded-xl border space-y-3"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-surface-subtle)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div
                className="text-[11px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Synthesized Sentence
              </div>
              <div className="text-lg font-semibold leading-snug break-words">
                {assembledSentence || "—"}
              </div>
              {autoGloss && (
                <div
                  className="text-xs font-mono"
                  style={{ color: "var(--text-muted)" }}
                >
                  {manualGloss || autoGloss}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleSpeak(1)}
                disabled={!assembledSentence}
                className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-40"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface)",
                }}
              >
                <Volume2 className="w-3.5 h-3.5" />
                1.0x
              </button>
              <button
                type="button"
                onClick={() => handleSpeak(0.7)}
                disabled={!assembledSentence}
                className="h-8 px-2 rounded-lg border text-xs font-mono tabular-nums whitespace-nowrap disabled:opacity-40"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-muted)",
                }}
              >
                0.7x
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              placeholder="Natural translation (optional)..."
              className="h-9 px-3 rounded-lg border text-xs"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-surface)",
              }}
            />
            <input
              type="text"
              value={manualGloss}
              onChange={(e) => setManualGloss(e.target.value)}
              placeholder="Custom interlinear gloss override (optional)..."
              className="h-9 px-3 rounded-lg border text-xs font-mono"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-surface)",
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {activePatternItem && (
              <button
                type="button"
                onClick={handleAttachExample}
                disabled={!assembledSentence}
                className="h-9 px-3.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                Attach to Pattern Examples
              </button>
            )}
            <button
              type="button"
              onClick={handleSavePhrase}
              disabled={!assembledSentence}
              className="h-9 px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              Save as New Phrase
            </button>
          </div>
        </div>
      </div>

      {/* Right/Bottom Deck: Pattern & Formula Selector */}
      <div
        className="lg:col-span-4 rounded-2xl border p-4 space-y-3"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Layers className="w-4 h-4" style={{ color: "var(--accent)" }} />
            Saved Formulas
          </div>
          <span
            className="text-xs font-mono tabular-nums"
            style={{ color: "var(--text-muted)" }}
          >
            {patternItems.length}
          </span>
        </div>

        <input
          type="text"
          value={patternSearch}
          onChange={(e) => setPatternSearch(e.target.value)}
          placeholder="Search grammar & blocks..."
          className="w-full h-9 px-3 rounded-lg border text-xs"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-surface-subtle)",
          }}
        />

        <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-0.5">
          <button
            type="button"
            onClick={() => {
              setSelectedPatternId("custom");
              setSlotValues({});
              setSlotMeanings({});
            }}
            className="w-full text-left p-2.5 rounded-xl border transition-colors flex items-center justify-between gap-2"
            style={{
              borderColor:
                selectedPatternId === "custom"
                  ? "var(--accent)"
                  : "var(--border-subtle)",
              backgroundColor:
                selectedPatternId === "custom"
                  ? "var(--accent-soft)"
                  : "var(--bg-surface-subtle)",
            }}
          >
            <div>
              <div className="text-xs font-semibold">Custom Free Formula</div>
              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Author any [Slot] template on the fly
              </div>
            </div>
            {selectedPatternId === "custom" && (
              <Check className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--accent)" }} />
            )}
          </button>

          {filteredPatterns.map((p) => {
            const active = selectedPatternId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedPatternId(p.id);
                  setSlotValues({});
                  setSlotMeanings({});
                }}
                className="w-full text-left p-2.5 rounded-xl border transition-colors space-y-1"
                style={{
                  borderColor: active
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                  backgroundColor: active
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate">
                    {p.term}
                  </span>
                  <span
                    className="text-[10px] font-mono shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {p.type}
                  </span>
                </div>
                {p.patternFormula && (
                  <div
                    className="text-[11px] font-mono truncate"
                    style={{ color: "var(--accent)" }}
                  >
                    {p.patternFormula}
                  </div>
                )}
                <div
                  className="text-[11px] truncate"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {p.meaning}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
