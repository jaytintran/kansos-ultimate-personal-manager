import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  FlipHorizontal2,
  Layers,
  Puzzle,
  RotateCcw,
  Sparkles,
  Volume2,
} from "lucide-react";
import {
  extractClozeTargets,
  isItemDueOnDate,
  LANGUAGE_ITEM_TYPE_META,
  LANGUAGE_MASTERY_META,
  parseClozeSegments,
  previewSm2Intervals,
  speakLanguageText,
  stripClozeBrackets,
  tokenizeSentenceForAssembly,
} from "../../lib/languageUtils";
import type {
  LanguageDeck,
  LanguageItem,
  LanguageProfile,
  LanguageSrsRating,
} from "../../types/languages";
import { getTodayKey } from "../../utils/date";

type DrillMode = "flip" | "cloze" | "assembly";
type QueueScope = "due" | "weak" | "all";

interface LanguageRecallLabProps {
  language: LanguageProfile;
  items: LanguageItem[];
  decks: LanguageDeck[];
  onReviewItem: (id: string, rating: LanguageSrsRating) => void;
  onNotify: (msg: string, tone?: "neutral" | "success" | "error") => void;
}

function deterministicShuffle<T>(arr: T[], seedStr: string): T[] {
  const copy = [...arr];
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  for (let i = copy.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const LanguageRecallLab: React.FC<LanguageRecallLabProps> = ({
  language,
  items,
  decks,
  onReviewItem,
  onNotify,
}) => {
  const todayKey = getTodayKey();
  const [drillMode, setDrillMode] = useState<DrillMode>("flip");
  const [scope, setScope] = useState<QueueScope>("due");
  const [deckFilter, setDeckFilter] = useState<string>("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");

  const [revealed, setRevealed] = useState(false);
  const [sessionReviewedIds, setSessionReviewedIds] = useState<string[]>([]);
  const [freeDrillOffset, setFreeDrillOffset] = useState(0);

  // Cloze drill state
  const [clozeInput, setClozeInput] = useState("");
  const [clozeResult, setClozeResult] = useState<"idle" | "correct" | "wrong">(
    "idle",
  );

  // Assembly drill state
  const [pickedTileIndices, setPickedTileIndices] = useState<number[]>([]);
  const [assemblyResult, setAssemblyResult] = useState<
    "idle" | "correct" | "wrong"
  >("idle");

  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.topic) set.add(it.topic);
    });
    return Array.from(set).sort();
  }, [items]);

  const scopedItems = useMemo(() => {
    return items.filter((it) => {
      if (deckFilter !== "all" && !it.deckIds.includes(deckFilter)) {
        return false;
      }
      if (topicFilter !== "all" && it.topic !== topicFilter) {
        return false;
      }
      if (scope === "due") {
        return isItemDueOnDate(it, todayKey);
      }
      if (scope === "weak") {
        return it.srs.stage === "new" || it.srs.stage === "learning";
      }
      return true;
    });
  }, [items, deckFilter, topicFilter, scope, todayKey]);

  const queue = useMemo(() => {
    const sorted = [...scopedItems].sort((a, b) => {
      const aDue = a.srs.dueDate || todayKey;
      const bDue = b.srs.dueDate || todayKey;
      if (aDue !== bDue) return aDue.localeCompare(bDue);
      return a.srs.repetitions - b.srs.repetitions;
    });

    if (scope === "due") {
      // Exclude items already reviewed as Good/Easy in this session unless re-queued via Again
      return sorted;
    }
    if (sorted.length === 0) return [];
    const offset = freeDrillOffset % sorted.length;
    return [...sorted.slice(offset), ...sorted.slice(0, offset)];
  }, [scopedItems, scope, todayKey, freeDrillOffset]);

  const currentItem = queue[0] ?? null;

  // Reset per-card interaction state whenever active card or drill mode changes
  useEffect(() => {
    setRevealed(false);
    setClozeInput("");
    setClozeResult("idle");
    setPickedTileIndices([]);
    setAssemblyResult("idle");
  }, [currentItem?.id, drillMode]);

  const clozeContext = useMemo(() => {
    if (!currentItem) return null;
    const exWithCloze = currentItem.examples.find(
      (ex) => extractClozeTargets(ex.sentence).length > 0,
    );
    if (exWithCloze) {
      const targets = extractClozeTargets(exWithCloze.sentence);
      return {
        sentence: exWithCloze.sentence,
        translation: exWithCloze.translation,
        reading: exWithCloze.reading,
        gloss: exWithCloze.interlinearGloss,
        answer: targets[0],
        segments: parseClozeSegments(exWithCloze.sentence),
      };
    }

    const firstEx = currentItem.examples[0];
    if (firstEx) {
      const cleanTerm = currentItem.term.trim();
      const idx = firstEx.sentence.indexOf(cleanTerm);
      if (idx >= 0) {
        const bracketed =
          firstEx.sentence.slice(0, idx) +
          `{{${cleanTerm}}}` +
          firstEx.sentence.slice(idx + cleanTerm.length);
        return {
          sentence: bracketed,
          translation: firstEx.translation,
          reading: firstEx.reading,
          gloss: firstEx.interlinearGloss,
          answer: cleanTerm,
          segments: parseClozeSegments(bracketed),
        };
      }
      return {
        sentence: `${firstEx.sentence} — Target: {{${cleanTerm}}}`,
        translation: firstEx.translation || currentItem.meaning,
        reading: firstEx.reading,
        gloss: firstEx.interlinearGloss,
        answer: cleanTerm,
        segments: parseClozeSegments(
          `${firstEx.sentence} — Target: {{${cleanTerm}}}`,
        ),
      };
    }

    return {
      sentence: `Recall term for "${currentItem.meaning}": {{${currentItem.term}}}`,
      translation: currentItem.meaning,
      reading: currentItem.reading,
      gloss: undefined,
      answer: currentItem.term,
      segments: parseClozeSegments(
        `Recall term for "${currentItem.meaning}": {{${currentItem.term}}}`,
      ),
    };
  }, [currentItem]);

  const assemblyContext = useMemo(() => {
    if (!currentItem) return null;
    const rawTarget =
      currentItem.examples[0]?.sentence || currentItem.term || "";
    const cleanTarget = stripClozeBrackets(rawTarget).trim();
    const orderedTokens = tokenizeSentenceForAssembly(cleanTarget);
    const shuffled = deterministicShuffle(
      orderedTokens.map((text, idx) => ({ text, originalIndex: idx })),
      `${currentItem.id}-${currentItem.srs.repetitions}`,
    );
    return {
      cleanTarget,
      translation:
        currentItem.examples[0]?.translation || currentItem.meaning,
      orderedTokens,
      shuffledTiles: shuffled,
    };
  }, [currentItem]);

  const intervalPreview = useMemo(() => {
    if (!currentItem) return null;
    return previewSm2Intervals(currentItem.srs, todayKey);
  }, [currentItem, todayKey]);

  const handleGrade = (rating: LanguageSrsRating) => {
    if (!currentItem) return;
    onReviewItem(currentItem.id, rating);
    setSessionReviewedIds((prev) =>
      prev.includes(currentItem.id) ? prev : [...prev, currentItem.id],
    );
    if (scope !== "due") {
      setFreeDrillOffset((o) => o + 1);
    }
    setRevealed(false);
    setClozeInput("");
    setClozeResult("idle");
    setPickedTileIndices([]);
    setAssemblyResult("idle");
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      if (!currentItem) return;

      if (e.code === "Space" && !revealed && drillMode === "flip") {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed) {
        if (e.key === "1") handleGrade(0);
        else if (e.key === "2") handleGrade(1);
        else if (e.key === "3") handleGrade(2);
        else if (e.key === "4") handleGrade(3);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const handleSpeak = (text: string, rate: 0.7 | 1) => {
    const ok = speakLanguageText(text, language.ttsLocale, rate);
    if (!ok) {
      onNotify("Speech synthesis is unavailable in this browser.", "error");
    }
  };

  const handleCheckCloze = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clozeContext) return;
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    if (norm(clozeInput) === norm(clozeContext.answer)) {
      setClozeResult("correct");
      setRevealed(true);
      speakLanguageText(
        stripClozeBrackets(clozeContext.sentence),
        language.ttsLocale,
        1,
      );
    } else {
      setClozeResult("wrong");
    }
  };

  const handleToggleAssemblyTile = (shuffledIdx: number) => {
    if (assemblyResult === "correct") return;
    setAssemblyResult("idle");
    setPickedTileIndices((prev) =>
      prev.includes(shuffledIdx)
        ? prev.filter((i) => i !== shuffledIdx)
        : [...prev, shuffledIdx],
    );
  };

  const handleCheckAssembly = () => {
    if (!assemblyContext) return;
    const built = pickedTileIndices
      .map((idx) => assemblyContext.shuffledTiles[idx]?.text || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const expected = assemblyContext.orderedTokens
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (built === expected) {
      setAssemblyResult("correct");
      setRevealed(true);
      speakLanguageText(assemblyContext.cleanTarget, language.ttsLocale, 1);
    } else {
      setAssemblyResult("wrong");
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Toolbar */}
      <div
        className="rounded-2xl border p-3.5 flex flex-wrap items-center justify-between gap-3"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        {/* Drill Mode Segmented Control */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl border"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-surface-subtle)",
          }}
        >
          {(
            [
              { id: "flip", label: "Flip Card", icon: FlipHorizontal2 },
              { id: "cloze", label: "Cloze Context", icon: Eye },
              { id: "assembly", label: "Block Assembly", icon: Puzzle },
            ] as const
          ).map((mode) => {
            const Icon = mode.icon;
            const active = drillMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setDrillMode(mode.id)}
                className="h-8 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                style={{
                  backgroundColor: active ? "var(--bg-surface)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-muted)",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : undefined,
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {mode.label}
              </button>
            );
          })}
        </div>

        {/* Scope & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as QueueScope);
              setFreeDrillOffset(0);
            }}
            className="h-9 px-2.5 rounded-lg border text-xs font-medium"
            style={{
              borderColor: "var(--border-subtle)",
              backgroundColor: "var(--bg-surface-subtle)",
            }}
            aria-label="Review queue scope"
          >
            <option value="due">Due Today</option>
            <option value="weak">New &amp; Learning</option>
            <option value="all">All Active Items</option>
          </select>

          {decks.length > 0 && (
            <select
              value={deckFilter}
              onChange={(e) => setDeckFilter(e.target.value)}
              className="h-9 px-2.5 rounded-lg border text-xs"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-surface-subtle)",
              }}
              aria-label="Filter by deck"
            >
              <option value="all">All Decks</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          {availableTopics.length > 0 && (
            <select
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              className="h-9 px-2.5 rounded-lg border text-xs"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-surface-subtle)",
              }}
              aria-label="Filter by topic"
            >
              <option value="all">All Topics</option>
              {availableTopics.map((tp) => (
                <option key={tp} value={tp}>
                  {tp}
                </option>
              ))}
            </select>
          )}

          <span
            className="text-xs font-mono tabular-nums px-2"
            style={{ color: "var(--text-muted)" }}
          >
            {queue.length} remaining · {sessionReviewedIds.length} done
          </span>
        </div>
      </div>

      {/* Active Drill Card */}
      {!currentItem ? (
        <div
          className="rounded-2xl border p-8 sm:p-12 text-center space-y-4 max-w-2xl mx-auto"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div
            className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
            style={{
              backgroundColor: "var(--accent-soft)",
              color: "var(--accent)",
            }}
          >
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">
              {scope === "due"
                ? `All ${language.name} reviews complete for today`
                : "No matching items in this drill scope"}
            </h3>
            <p className="text-xs max-w-md mx-auto" style={{ color: "var(--text-muted)" }}>
              {items.length === 0
                ? "Capture your first vocabulary, phrase, or grammar block in the Vault tab to begin spaced repetition."
                : "Switch to All Active Items for free-form practice or capture new pickups above."}
            </p>
          </div>
          {items.length > 0 && scope !== "all" && (
            <button
              type="button"
              onClick={() => {
                setScope("all");
                setFreeDrillOffset(0);
              }}
              className="h-9 px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Practice All Items ({items.length})
            </button>
          )}
        </div>
      ) : (
        <div
          className="rounded-2xl border p-5 sm:p-7 max-w-3xl mx-auto space-y-6"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          {/* Card Meta Line */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div
              className="flex items-center gap-2 min-w-0 truncate"
              style={{ color: "var(--text-muted)" }}
            >
              <span
                className="font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {LANGUAGE_ITEM_TYPE_META[currentItem.type].label}
              </span>
              {currentItem.cefrLevel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {currentItem.cefrLevel}
                  </span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span
                style={{
                  color: LANGUAGE_MASTERY_META[currentItem.srs.stage].toneColor,
                }}
              >
                {LANGUAGE_MASTERY_META[currentItem.srs.stage].label}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleSpeak(currentItem.term, 1)}
                className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              >
                <Volume2 className="w-3.5 h-3.5" />
                1.0x
              </button>
              <button
                type="button"
                onClick={() => handleSpeak(currentItem.term, 0.7)}
                className="h-8 px-2 rounded-lg border text-xs font-mono tabular-nums whitespace-nowrap"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                  color: "var(--text-muted)",
                }}
              >
                0.7x
              </button>
            </div>
          </div>

          {/* DRILL 1: FLIP CARD */}
          {drillMode === "flip" && (
            <div className="space-y-5">
              <div
                onClick={() => {
                  if (!revealed) setRevealed(true);
                }}
                className={`py-8 px-4 rounded-xl border text-center space-y-2 transition-colors ${
                  !revealed ? "cursor-pointer" : ""
                }`}
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              >
                <div className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {currentItem.term}
                </div>
                {currentItem.patternFormula && (
                  <div
                    className="text-sm font-mono pt-1"
                    style={{ color: "var(--accent)" }}
                  >
                    {currentItem.patternFormula}
                  </div>
                )}
                {currentItem.partOfSpeech && (
                  <div
                    className="text-xs pt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {currentItem.partOfSpeech}
                  </div>
                )}
                {!revealed && (
                  <div
                    className="text-xs pt-3"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Click card or press Space to reveal meaning &amp; breakdown
                  </div>
                )}
              </div>

              {!revealed ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setRevealed(true)}
                    className="h-10 px-6 rounded-xl text-xs font-semibold"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "var(--accent-fg)",
                    }}
                  >
                    Reveal Answer
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1 text-center">
                    {currentItem.reading && (
                      <div
                        className="text-sm font-mono"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {currentItem.reading}
                      </div>
                    )}
                    <div className="text-lg font-semibold">
                      {currentItem.meaning}
                    </div>
                  </div>

                  {currentItem.nuanceNotes && (
                    <div
                      className="p-3 rounded-xl border text-xs leading-relaxed"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {currentItem.nuanceNotes}
                    </div>
                  )}

                  {currentItem.examples.length > 0 && (
                    <div className="space-y-2">
                      {currentItem.examples.slice(0, 2).map((ex) => (
                        <div
                          key={ex.id}
                          className="p-3 rounded-xl border flex items-start justify-between gap-3"
                          style={{
                            borderColor: "var(--border-subtle)",
                            backgroundColor: "var(--bg-surface-subtle)",
                          }}
                        >
                          <div className="space-y-1 text-xs min-w-0">
                            <div className="text-sm font-medium">
                              {parseClozeSegments(ex.sentence).map((seg, idx) =>
                                seg.kind === "cloze" ? (
                                  <mark
                                    key={idx}
                                    className="px-1 rounded font-semibold"
                                    style={{
                                      backgroundColor: "var(--accent-soft)",
                                      color: "var(--accent)",
                                    }}
                                  >
                                    {seg.value}
                                  </mark>
                                ) : (
                                  <span key={idx}>{seg.value}</span>
                                ),
                              )}
                            </div>
                            {ex.translation && (
                              <div style={{ color: "var(--text-secondary)" }}>
                                {ex.translation}
                              </div>
                            )}
                            {ex.interlinearGloss && (
                              <div
                                className="font-mono text-[11px]"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {ex.interlinearGloss}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleSpeak(stripClozeBrackets(ex.sentence), 1)
                            }
                            className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0"
                            style={{ borderColor: "var(--border-subtle)" }}
                            title="Play example"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* DRILL 2: CLOZE CONTEXT */}
          {drillMode === "cloze" && clozeContext && (
            <div className="space-y-5">
              <div
                className="p-5 rounded-xl border space-y-3"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              >
                <div className="text-lg font-semibold leading-relaxed">
                  {clozeContext.segments.map((seg, i) => {
                    if (seg.kind === "text") {
                      return <span key={i}>{seg.value}</span>;
                    }
                    return revealed ? (
                      <mark
                        key={i}
                        className="px-1.5 py-0.5 rounded font-bold mx-0.5"
                        style={{
                          backgroundColor: "var(--accent-soft)",
                          color: "var(--accent)",
                        }}
                      >
                        {seg.value}
                      </mark>
                    ) : (
                      <span
                        key={i}
                        className="inline-block px-3 py-0.5 mx-1 rounded border border-dashed font-mono text-sm"
                        style={{
                          borderColor: "var(--accent)",
                          color: "var(--accent)",
                        }}
                      >
                        ______
                      </span>
                    );
                  })}
                </div>
                {clozeContext.translation && (
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Meaning: {clozeContext.translation}
                  </div>
                )}
              </div>

              <form onSubmit={handleCheckCloze} className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={clozeInput}
                  onChange={(e) => {
                    setClozeInput(e.target.value);
                    setClozeResult("idle");
                  }}
                  placeholder="Type missing word or phrase..."
                  className="flex-1 min-w-[200px] h-10 px-3 rounded-xl border text-sm"
                  style={{
                    borderColor:
                      clozeResult === "correct"
                        ? "var(--success)"
                        : clozeResult === "wrong"
                          ? "var(--danger)"
                          : "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                />
                <button
                  type="submit"
                  className="h-10 px-4 rounded-xl text-xs font-semibold whitespace-nowrap"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  Check
                </button>
                {!revealed && (
                  <button
                    type="button"
                    onClick={() => setRevealed(true)}
                    className="h-10 px-3.5 rounded-xl border text-xs font-medium whitespace-nowrap"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Reveal
                  </button>
                )}
              </form>

              {clozeResult === "wrong" && !revealed && (
                <div className="text-xs" style={{ color: "var(--danger)" }}>
                  Not quite — try again or click Reveal to check{" "}
                  {currentItem.reading ? `(${currentItem.reading})` : ""}.
                </div>
              )}

              {revealed && (
                <div
                  className="p-3.5 rounded-xl border space-y-1 text-xs"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <div className="font-semibold">
                    {currentItem.term}{" "}
                    {currentItem.reading ? `(${currentItem.reading})` : ""} —{" "}
                    {currentItem.meaning}
                  </div>
                  {clozeContext.gloss && (
                    <div
                      className="font-mono text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {clozeContext.gloss}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* DRILL 3: BLOCK SENTENCE ASSEMBLY */}
          {drillMode === "assembly" && assemblyContext && (
            <div className="space-y-5">
              <div className="space-y-1">
                <div
                  className="text-xs font-medium flex items-center gap-1.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Assemble the blocks in natural order
                </div>
                <div className="text-sm font-semibold">
                  {assemblyContext.translation}
                </div>
                {currentItem.patternFormula && (
                  <div
                    className="text-xs font-mono"
                    style={{ color: "var(--accent)" }}
                  >
                    Pattern: {currentItem.patternFormula}
                  </div>
                )}
              </div>

              {/* Assembly Drop Target */}
              <div
                className="min-h-[68px] p-3.5 rounded-xl border flex flex-wrap items-center gap-2"
                style={{
                  borderColor:
                    assemblyResult === "correct"
                      ? "var(--success)"
                      : assemblyResult === "wrong"
                        ? "var(--danger)"
                        : "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              >
                {pickedTileIndices.length === 0 ? (
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Tap building blocks below in sequence...
                  </span>
                ) : (
                  pickedTileIndices.map((tileIdx) => {
                    const tile = assemblyContext.shuffledTiles[tileIdx];
                    if (!tile) return null;
                    return (
                      <button
                        key={`picked-${tileIdx}`}
                        type="button"
                        onClick={() => handleToggleAssemblyTile(tileIdx)}
                        className="h-8 px-3 rounded-lg border text-xs font-semibold"
                        style={{
                          borderColor: "var(--accent)",
                          backgroundColor: "var(--bg-surface)",
                        }}
                      >
                        {tile.text}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Available Shuffled Tiles */}
              <div className="flex flex-wrap gap-2">
                {assemblyContext.shuffledTiles.map((tile, idx) => {
                  const used = pickedTileIndices.includes(idx);
                  return (
                    <button
                      key={`pool-${idx}`}
                      type="button"
                      disabled={used}
                      onClick={() => handleToggleAssemblyTile(idx)}
                      className="h-9 px-3 rounded-lg border text-xs font-medium transition-opacity disabled:opacity-25"
                      style={{
                        borderColor: "var(--border-subtle)",
                        backgroundColor: "var(--bg-surface-subtle)",
                      }}
                    >
                      {tile.text}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCheckAssembly}
                  disabled={pickedTileIndices.length === 0}
                  className="h-9 px-4 rounded-lg text-xs font-semibold disabled:opacity-40"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  Check Order
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPickedTileIndices([]);
                    setAssemblyResult("idle");
                  }}
                  className="h-9 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
                {!revealed && (
                  <button
                    type="button"
                    onClick={() => setRevealed(true)}
                    className="h-9 px-3 rounded-lg border text-xs font-medium"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-muted)",
                    }}
                  >
                    Show Answer
                  </button>
                )}
              </div>

              {assemblyResult === "wrong" && !revealed && (
                <div className="text-xs" style={{ color: "var(--danger)" }}>
                  Block order differs — tap any placed block to adjust, or Show
                  Answer.
                </div>
              )}

              {revealed && (
                <div
                  className="p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <div>
                    <div className="font-semibold text-sm">
                      {assemblyContext.cleanTarget}
                    </div>
                    <div style={{ color: "var(--text-muted)" }}>
                      {currentItem.term} · {currentItem.meaning}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleSpeak(assemblyContext.cleanTarget, 1)
                    }
                    className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SM-2 Rating Controls */}
          {revealed && intervalPreview && (
            <div
              className="pt-4 border-t space-y-2"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div
                className="text-[11px] text-center"
                style={{ color: "var(--text-muted)" }}
              >
                Rate recall (shortcuts 1–4)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { rating: 0 as const, label: "Again", color: "var(--danger)" },
                    { rating: 1 as const, label: "Hard", color: "var(--warning)" },
                    { rating: 2 as const, label: "Good", color: "var(--accent)" },
                    { rating: 3 as const, label: "Easy", color: "var(--success)" },
                  ] as const
                ).map((btn) => (
                  <button
                    key={btn.rating}
                    type="button"
                    onClick={() => handleGrade(btn.rating)}
                    className="py-2.5 px-3 rounded-xl border text-center transition-colors"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                    }}
                  >
                    <div
                      className="text-xs font-semibold"
                      style={{ color: btn.color }}
                    >
                      {btn.label}
                    </div>
                    <div
                      className="text-[11px] font-mono tabular-nums mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {intervalPreview[btn.rating]}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
