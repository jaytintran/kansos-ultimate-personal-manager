import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  BookMarked,
  ChevronDown,
  Edit3,
  FileUp,
  FolderPlus,
  Languages,
  Layers,
  LayoutGrid,
  Plus,
  Search,
  Sparkles,
  Star,
  Table2,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { LanguageImportExportModal } from "../components/languages/LanguageImportExportModal";
import { LanguageInspectorDrawer } from "../components/languages/LanguageInspectorDrawer";
import { LanguageRecallLab } from "../components/languages/LanguageRecallLab";
import { LanguageSentenceStudio } from "../components/languages/LanguageSentenceStudio";
import { LanguageSetupModal } from "../components/languages/LanguageSetupModal";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  computeLanguageStreak,
  isItemDueOnDate,
  LANGUAGE_CEFR_LEVELS,
  LANGUAGE_ITEM_TYPE_META,
  LANGUAGE_MASTERY_META,
  LANGUAGE_PRESETS,
  LANGUAGE_TOPIC_PACKS,
  parseClozeSegments,
  parseQuickLanguageCapture,
  speakLanguageText,
} from "../lib/languageUtils";
import type {
  LanguageCefrLevel,
  LanguageItem,
  LanguageItemType,
  LanguageMasteryStage,
  LanguageProfile,
} from "../types/languages";
import { getTodayKey } from "../utils/date";
import { VIEW_PREFERENCE_SYNC_EVENT } from "../utils/viewPreferences";

const LANGUAGES_PREFS_KEY = "kanso_languages_prefs_v1";

type StudioTab = "vault" | "studio" | "recall";
type VaultLayoutMode = "grid" | "table";
type VaultSortKey = "recent" | "due" | "alpha" | "mastery";

interface LanguagesPrefs {
  layoutMode: VaultLayoutMode;
  sortBy: VaultSortKey;
}

function loadLanguagesPrefs(): LanguagesPrefs {
  try {
    const raw = localStorage.getItem(LANGUAGES_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LanguagesPrefs>;
      return {
        layoutMode: parsed.layoutMode === "table" ? "table" : "grid",
        sortBy: parsed.sortBy || "recent",
      };
    }
  } catch {
    // Ignore storage errors
  }
  return { layoutMode: "grid", sortBy: "recent" };
}

const MASTERY_RANK: Record<LanguageMasteryStage, number> = {
  new: 0,
  learning: 1,
  familiar: 2,
  mastered: 3,
};

export const LanguagesView: React.FC = () => {
  const {
    workspace,
    setActiveLanguageId,
    addLanguageProfile,
    updateLanguageProfile,
    deleteLanguageProfile,
    addLanguageDeck,
    deleteLanguageDeck,
    addLanguageItem,
    updateLanguageItem,
    deleteLanguageItem,
    reviewLanguageItem,
    importLanguageItems,
    pushToast,
  } = useWorkspace();

  const languages = workspace.languages ?? [];
  const allDecks = workspace.languageDecks ?? [];
  const allItems = workspace.languageItems ?? [];
  const dailyStats = workspace.languageDailyStats ?? [];
  const todayKey = getTodayKey();

  const activeLanguage = useMemo<LanguageProfile | null>(() => {
    if (languages.length === 0) return null;
    if (workspace.languageActiveId) {
      const matched = languages.find((l) => l.id === workspace.languageActiveId);
      if (matched) return matched;
    }
    return languages[0];
  }, [languages, workspace.languageActiveId]);

  const [prefs, setPrefs] = useState<LanguagesPrefs>(loadLanguagesPrefs);
  const [studioTab, setStudioTab] = useState<StudioTab>("vault");
  const [studioFocusedPatternId, setStudioFocusedPatternId] = useState<
    string | null
  >(null);

  // Quick Capture Bar state
  const [captureInput, setCaptureInput] = useState("");
  const [captureType, setCaptureType] = useState<LanguageItemType>("vocab");
  const [captureTopic, setCaptureTopic] = useState<string>(
    LANGUAGE_TOPIC_PACKS[0],
  );
  const [captureCefr, setCaptureCefr] = useState<LanguageCefrLevel>("");

  // Vault Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<LanguageItemType | "all">("all");
  const [masteryFilter, setMasteryFilter] = useState<
    LanguageMasteryStage | "all"
  >("all");
  const [cefrFilter, setCefrFilter] = useState<LanguageCefrLevel | "all">("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [deckFilter, setDeckFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  // Selection & Modals
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [inspectorStartEdit, setInspectorStartEdit] = useState(false);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [editingLanguage, setEditingLanguage] =
    useState<LanguageProfile | null>(null);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [newDeckOpen, setNewDeckOpen] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGES_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage write errors
    }
  }, [prefs]);

  useEffect(() => {
    const onSynced = () => setPrefs(loadLanguagesPrefs());
    window.addEventListener(VIEW_PREFERENCE_SYNC_EVENT, onSynced);
    return () =>
      window.removeEventListener(VIEW_PREFERENCE_SYNC_EVENT, onSynced);
  }, []);

  // Scope items and decks to active language
  const languageDecks = useMemo(
    () =>
      activeLanguage
        ? allDecks.filter((d) => d.languageId === activeLanguage.id)
        : [],
    [allDecks, activeLanguage],
  );

  const languageItems = useMemo(
    () =>
      activeLanguage
        ? allItems.filter((it) => it.languageId === activeLanguage.id)
        : [],
    [allItems, activeLanguage],
  );

  // Reset per-language filters when switching languages
  useEffect(() => {
    setSelectedItemId(null);
    setDeckFilter("all");
    setTagFilter("all");
    setTopicFilter("all");
    setStudioFocusedPatternId(null);
  }, [activeLanguage?.id]);

  const availableTopics = useMemo(() => {
    const set = new Set<string>(LANGUAGE_TOPIC_PACKS);
    languageItems.forEach((it) => {
      if (it.topic) set.add(it.topic);
    });
    return Array.from(set);
  }, [languageItems]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    languageItems.forEach((it) => it.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [languageItems]);

  const dueCount = useMemo(
    () => languageItems.filter((it) => isItemDueOnDate(it, todayKey)).length,
    [languageItems, todayKey],
  );

  const todayProgress = useMemo(() => {
    if (!activeLanguage) return { count: 0, goal: 12, streak: 0 };
    const todayStat = dailyStats.find(
      (s) => s.dateKey === todayKey && s.languageId === activeLanguage.id,
    );
    const count =
      (todayStat?.reviewedCount ?? 0) + (todayStat?.capturedCount ?? 0);
    const streak = computeLanguageStreak(
      dailyStats,
      activeLanguage.id,
      todayKey,
    );
    return {
      count,
      goal: activeLanguage.dailyGoal || 12,
      streak,
    };
  }, [activeLanguage, dailyStats, todayKey]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = languageItems.filter((it) => {
      if (onlyFavorites && !it.favorite) return false;
      if (typeFilter !== "all" && it.type !== typeFilter) return false;
      if (masteryFilter !== "all" && it.srs.stage !== masteryFilter)
        return false;
      if (cefrFilter !== "all" && it.cefrLevel !== cefrFilter) return false;
      if (topicFilter !== "all" && it.topic !== topicFilter) return false;
      if (deckFilter !== "all" && !it.deckIds.includes(deckFilter)) return false;
      if (tagFilter !== "all" && !it.tags.includes(tagFilter)) return false;
      if (q) {
        const hay = [
          it.term,
          it.reading || "",
          it.meaning,
          it.patternFormula || "",
          it.partOfSpeech || "",
          it.rootsAndEtymology || "",
          it.nuanceNotes || "",
          it.topic,
          it.tags.join(" "),
          it.examples.map((e) => `${e.sentence} ${e.translation}`).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (prefs.sortBy === "alpha") {
        return a.term.localeCompare(b.term);
      }
      if (prefs.sortBy === "due") {
        return a.srs.dueDate.localeCompare(b.srs.dueDate);
      }
      if (prefs.sortBy === "mastery") {
        return MASTERY_RANK[a.srs.stage] - MASTERY_RANK[b.srs.stage];
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [
    languageItems,
    onlyFavorites,
    typeFilter,
    masteryFilter,
    cefrFilter,
    topicFilter,
    deckFilter,
    tagFilter,
    searchQuery,
    prefs.sortBy,
  ]);

  const selectedItem = useMemo(
    () => languageItems.find((it) => it.id === selectedItemId) || null,
    [languageItems, selectedItemId],
  );

  const handleQuickCapture = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLanguage) return;
    const raw = captureInput.trim();
    if (!raw) return;

    const parsed = parseQuickLanguageCapture(raw, captureType);
    if (!parsed.term) return;

    const created = addLanguageItem({
      languageId: activeLanguage.id,
      type: captureType,
      term: parsed.term,
      reading: parsed.reading || undefined,
      meaning: parsed.meaning || "(Add meaning in inspector)",
      patternFormula: parsed.patternFormula || undefined,
      register: "neutral",
      examples: [],
      topic: topicFilter !== "all" ? topicFilter : captureTopic,
      cefrLevel: parsed.cefrLevel || captureCefr,
      deckIds: deckFilter !== "all" ? [deckFilter] : [],
      tags: parsed.tags,
      favorite: false,
    });

    setCaptureInput("");
    if (!parsed.meaning) {
      setInspectorStartEdit(true);
      setSelectedItemId(created.id);
    }
    pushToast(`Captured "${created.term}"`, "success");
  };

  const handleOpenBlankEditor = () => {
    if (!activeLanguage) return;
    const created = addLanguageItem({
      languageId: activeLanguage.id,
      type: captureType,
      term: captureInput.trim() || "New entry",
      meaning: "",
      register: "neutral",
      examples: [],
      topic: topicFilter !== "all" ? topicFilter : captureTopic,
      cefrLevel: captureCefr,
      deckIds: deckFilter !== "all" ? [deckFilter] : [],
      tags: [],
      favorite: false,
    });
    setCaptureInput("");
    setInspectorStartEdit(true);
    setSelectedItemId(created.id);
  };

  const handleCreateQuickLanguage = (presetKey: string) => {
    const preset = LANGUAGE_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    const created = addLanguageProfile({
      name: preset.name,
      nativeName: preset.nativeName,
      code: preset.code,
      ttsLocale: preset.ttsLocale,
      scriptHint: preset.scriptHint,
      dailyGoal: 12,
    });
    pushToast(`Added ${created.name} workspace`, "success");
  };

  const handleCreateDeck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLanguage) return;
    const clean = newDeckName.trim();
    if (!clean) return;
    const created = addLanguageDeck({
      languageId: activeLanguage.id,
      name: clean,
    });
    setDeckFilter(created.id);
    setNewDeckName("");
    setNewDeckOpen(false);
    pushToast(`Created deck "${created.name}"`, "success");
  };

  const handleSpeak = (text: string, rate: 0.7 | 1, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!activeLanguage) return;
    const ok = speakLanguageText(text, activeLanguage.ttsLocale, rate);
    if (!ok) {
      pushToast("Speech synthesis is unavailable in this browser.", "error");
    }
  };

  // Empty zero-languages onboarding screen
  if (!activeLanguage) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        <div
          className="rounded-2xl border p-6 sm:p-10 space-y-6"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              <Languages className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">
                Languages Absorption Studio
              </h1>
              <p
                className="text-sm leading-relaxed max-w-2xl"
                style={{ color: "var(--text-secondary)" }}
              >
                Capture words, grammar skeletons, conversational phrases, and
                reusable building blocks—then deconstruct, practice via SM-2
                spaced repetition, and recombine slots into new sentences.
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            <div
              className="text-xs font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Start with a Language Preset
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {LANGUAGE_PRESETS.slice(0, 8).map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handleCreateQuickLanguage(preset.key)}
                  className="p-3 rounded-xl border text-left transition-colors hover:border-[var(--accent)]"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{preset.name}</span>
                    <span
                      className="text-[11px] font-mono"
                      style={{ color: "var(--accent)" }}
                    >
                      {preset.code}
                    </span>
                  </div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {preset.nativeName}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setEditingLanguage(null);
                setSetupModalOpen(true);
              }}
              className="h-10 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              <Plus className="w-4 h-4" />
              Configure Custom Language
            </button>
          </div>
        </div>

        <LanguageSetupModal
          open={setupModalOpen}
          editingLanguage={editingLanguage}
          existingLanguages={languages}
          onClose={() => setSetupModalOpen(false)}
          onSave={(draft, editId) => {
            if (editId) updateLanguageProfile(editId, draft);
            else addLanguageProfile(draft);
          }}
          onNotify={pushToast}
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
      {/* Studio Top Bar */}
      <header
        className="rounded-2xl border p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        {/* Left: Language Switcher & Add/Edit Language */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="relative">
            <select
              value={activeLanguage.id}
              onChange={(e) => setActiveLanguageId(e.target.value)}
              aria-label="Select active study language"
              className="appearance-none h-9 pl-3 pr-8 rounded-xl border text-sm font-semibold cursor-pointer"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-surface-subtle)",
              }}
            >
              {languages.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.code} · {lang.name} ({lang.nativeName})
                </option>
              ))}
            </select>
            <ChevronDown
              className="w-3.5 h-3.5 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setEditingLanguage(null);
              setSetupModalOpen(true);
            }}
            className="h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
            title="Add another language"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Language
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingLanguage(activeLanguage);
              setSetupModalOpen(true);
            }}
            className="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
            title="Edit active language settings"
            aria-label="Edit active language settings"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Center: 4-Stage Studio Mode Switcher */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl border"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-surface-subtle)",
          }}
          role="tablist"
          aria-label="Language Studio Mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={studioTab === "vault"}
            onClick={() => setStudioTab("vault")}
            className="h-8 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            style={{
              backgroundColor:
                studioTab === "vault" ? "var(--bg-surface)" : "transparent",
              color:
                studioTab === "vault"
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
              boxShadow:
                studioTab === "vault" ? "0 1px 2px rgba(0,0,0,0.06)" : undefined,
            }}
          >
            <BookMarked className="w-3.5 h-3.5" />
            Vault ({languageItems.length})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={studioTab === "studio"}
            onClick={() => setStudioTab("studio")}
            className="h-8 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            style={{
              backgroundColor:
                studioTab === "studio" ? "var(--bg-surface)" : "transparent",
              color:
                studioTab === "studio"
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
              boxShadow:
                studioTab === "studio"
                  ? "0 1px 2px rgba(0,0,0,0.06)"
                  : undefined,
            }}
          >
            <Layers className="w-3.5 h-3.5" />
            Block Studio
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={studioTab === "recall"}
            onClick={() => setStudioTab("recall")}
            className="h-8 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums"
            style={{
              backgroundColor:
                studioTab === "recall" ? "var(--bg-surface)" : "transparent",
              color:
                studioTab === "recall"
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
              boxShadow:
                studioTab === "recall"
                  ? "0 1px 2px rgba(0,0,0,0.06)"
                  : undefined,
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Recall Lab{dueCount > 0 ? ` · ${dueCount} due` : ""}
          </button>
        </div>

        {/* Right: Subtle Progress Strip + Import/Export */}
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="text-xs font-mono tabular-nums flex items-center gap-2 whitespace-nowrap"
            style={{ color: "var(--text-muted)" }}
          >
            <span>
              Today{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {todayProgress.count}/{todayProgress.goal}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Due{" "}
              <strong
                style={{
                  color: dueCount > 0 ? "var(--accent)" : "var(--text-primary)",
                }}
              >
                {dueCount}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Streak{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {todayProgress.streak}d
              </strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setImportExportOpen(true)}
            className="h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            style={{
              borderColor: "var(--border-subtle)",
              backgroundColor: "var(--bg-surface-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <FileUp className="w-3.5 h-3.5" />
            Import / Export
          </button>
        </div>
      </header>

      {/* STAGE 1 + 2: VAULT (Capture & Deconstruct Blocks) */}
      {studioTab === "vault" && (
        <div className="space-y-4">
          {/* Instant Top Quick-Capture Bar */}
          <form
            onSubmit={handleQuickCapture}
            className="rounded-2xl border p-3 flex flex-wrap items-center gap-2"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <select
              value={captureType}
              onChange={(e) =>
                setCaptureType(e.target.value as LanguageItemType)
              }
              aria-label="Pickup type"
              className="h-9 px-2.5 rounded-xl border text-xs font-semibold shrink-0"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-surface-subtle)",
              }}
            >
              <option value="vocab">Vocab / Noun</option>
              <option value="grammar">Grammar [Slot]</option>
              <option value="phrase">Phrase / Chunk</option>
              <option value="block">Building Block</option>
            </select>

            <input
              type="text"
              value={captureInput}
              onChange={(e) => setCaptureInput(e.target.value)}
              placeholder={`Quick capture in ${activeLanguage.name}: word (reading) = meaning #tag @A2 or [Slot] formula = meaning`}
              className="flex-1 min-w-[220px] h-9 px-3 rounded-xl border text-sm"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-surface-subtle)",
              }}
            />

            <select
              value={captureTopic}
              onChange={(e) => setCaptureTopic(e.target.value)}
              aria-label="Quick capture topic"
              className="h-9 px-2.5 rounded-xl border text-xs hidden sm:block"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-surface-subtle)",
              }}
            >
              {availableTopics.map((tp) => (
                <option key={tp} value={tp}>
                  {tp}
                </option>
              ))}
            </select>

            <select
              value={captureCefr}
              onChange={(e) =>
                setCaptureCefr(e.target.value as LanguageCefrLevel)
              }
              aria-label="Quick capture CEFR level"
              className="h-9 px-2 rounded-xl border text-xs font-mono hidden md:block"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-surface-subtle)",
              }}
            >
              <option value="">Level</option>
              {LANGUAGE_CEFR_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              Capture
            </button>

            <button
              type="button"
              onClick={handleOpenBlankEditor}
              className="h-9 px-3 rounded-xl border text-xs font-medium whitespace-nowrap shrink-0"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              Detailed Entry
            </button>
          </form>

          {/* Filter & Layout Toolbar */}
          <div
            className="rounded-2xl border p-3 space-y-2.5"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search
                  className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-muted)" }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search terms, readings, formulas, roots, examples..."
                  className="w-full h-9 pl-8 pr-8 rounded-xl border text-xs"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--text-muted)" }}
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Type Filter Buttons */}
              <div
                className="flex items-center gap-1 p-1 rounded-xl border overflow-x-auto no-scrollbar"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              >
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "vocab", label: "Vocab" },
                    { id: "grammar", label: "Grammar" },
                    { id: "phrase", label: "Phrases" },
                    { id: "block", label: "Blocks" },
                  ] as const
                ).map((t) => {
                  const active = typeFilter === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTypeFilter(t.id)}
                      className="h-7 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
                      style={{
                        backgroundColor: active
                          ? "var(--bg-surface)"
                          : "transparent",
                        color: active
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Sort & Layout Switcher */}
              <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => setOnlyFavorites((v) => !v)}
                  className="h-9 px-2.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
                  style={{
                    borderColor: onlyFavorites
                      ? "var(--warning)"
                      : "var(--border-subtle)",
                    backgroundColor: onlyFavorites
                      ? "var(--accent-soft)"
                      : "var(--bg-surface-subtle)",
                    color: onlyFavorites
                      ? "var(--warning)"
                      : "var(--text-secondary)",
                  }}
                >
                  <Star
                    className="w-3.5 h-3.5"
                    fill={onlyFavorites ? "currentColor" : "none"}
                  />
                  Starred
                </button>

                <div className="relative">
                  <select
                    value={prefs.sortBy}
                    onChange={(e) =>
                      setPrefs((p) => ({
                        ...p,
                        sortBy: e.target.value as VaultSortKey,
                      }))
                    }
                    aria-label="Sort language items"
                    className="h-9 pl-7 pr-3 rounded-xl border text-xs font-medium"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                    }}
                  >
                    <option value="recent">Newest</option>
                    <option value="due">Due First</option>
                    <option value="alpha">A–Z</option>
                    <option value="mastery">Mastery</option>
                  </select>
                  <ArrowUpDown
                    className="w-3 h-3 pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--text-muted)" }}
                  />
                </div>

                <div
                  className="flex items-center gap-0.5 p-1 rounded-xl border"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setPrefs((p) => ({ ...p, layoutMode: "grid" }))
                    }
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor:
                        prefs.layoutMode === "grid"
                          ? "var(--bg-surface)"
                          : "transparent",
                      color:
                        prefs.layoutMode === "grid"
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                    }}
                    title="Card Grid view"
                    aria-label="Card Grid view"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPrefs((p) => ({ ...p, layoutMode: "table" }))
                    }
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor:
                        prefs.layoutMode === "table"
                          ? "var(--bg-surface)"
                          : "transparent",
                      color:
                        prefs.layoutMode === "table"
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                    }}
                    title="Table view"
                    aria-label="Table view"
                  >
                    <Table2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Secondary Filter Row: Topic, Mastery, CEFR, Deck, Tag */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                className="h-8 px-2.5 rounded-lg border text-xs"
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

              <select
                value={masteryFilter}
                onChange={(e) =>
                  setMasteryFilter(
                    e.target.value as LanguageMasteryStage | "all",
                  )
                }
                className="h-8 px-2.5 rounded-lg border text-xs"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
                aria-label="Filter by mastery stage"
              >
                <option value="all">All Mastery</option>
                <option value="new">New</option>
                <option value="learning">Learning</option>
                <option value="familiar">Familiar</option>
                <option value="mastered">Mastered</option>
              </select>

              <select
                value={cefrFilter}
                onChange={(e) =>
                  setCefrFilter(e.target.value as LanguageCefrLevel | "all")
                }
                className="h-8 px-2.5 rounded-lg border text-xs font-mono"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
                aria-label="Filter by CEFR level"
              >
                <option value="all">All CEFR</option>
                {LANGUAGE_CEFR_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1">
                <select
                  value={deckFilter}
                  onChange={(e) => setDeckFilter(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border text-xs"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                  aria-label="Filter by custom deck"
                >
                  <option value="all">All Decks ({languageDecks.length})</option>
                  {languageDecks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>

                {deckFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => {
                      deleteLanguageDeck(deckFilter);
                      setDeckFilter("all");
                      pushToast("Deleted custom deck", "success");
                    }}
                    className="w-8 h-8 rounded-lg border flex items-center justify-center"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-muted)",
                    }}
                    title="Delete selected deck"
                    aria-label="Delete selected deck"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setNewDeckOpen((v) => !v)}
                  className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  New Deck
                </button>
              </div>

              {availableTags.length > 0 && (
                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border text-xs font-mono"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                  aria-label="Filter by tag"
                >
                  <option value="all">All Tags</option>
                  {availableTags.map((t) => (
                    <option key={t} value={t}>
                      #{t}
                    </option>
                  ))}
                </select>
              )}

              {(typeFilter !== "all" ||
                masteryFilter !== "all" ||
                cefrFilter !== "all" ||
                topicFilter !== "all" ||
                deckFilter !== "all" ||
                tagFilter !== "all" ||
                onlyFavorites ||
                searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter("all");
                    setMasteryFilter("all");
                    setCefrFilter("all");
                    setTopicFilter("all");
                    setDeckFilter("all");
                    setTagFilter("all");
                    setOnlyFavorites(false);
                    setSearchQuery("");
                  }}
                  className="h-8 px-2.5 text-xs font-medium ml-auto"
                  style={{ color: "var(--accent)" }}
                >
                  Reset Filters
                </button>
              )}
            </div>

            {newDeckOpen && (
              <form
                onSubmit={handleCreateDeck}
                className="flex items-center gap-2 pt-2 border-t"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <input
                  type="text"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder={`New ${activeLanguage.name} deck name...`}
                  className="h-8 px-3 rounded-lg border text-xs flex-1 max-w-xs"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                  autoFocus
                />
                <button
                  type="submit"
                  className="h-8 px-3 rounded-lg text-xs font-semibold"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  Create Deck
                </button>
              </form>
            )}
          </div>

          {/* Main Split: Card Grid / Table + Side Inspector Drawer */}
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              {filteredItems.length === 0 ? (
                <div
                  className="rounded-2xl border p-10 text-center space-y-2"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <div className="text-sm font-semibold">
                    No matching language pickups
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Use the quick-capture bar above to add a word, grammar
                    [slot] pattern, phrase, or building block.
                  </p>
                </div>
              ) : prefs.layoutMode === "grid" ? (
                <div
                  className={`grid gap-3 ${
                    selectedItem
                      ? "grid-cols-1 md:grid-cols-2"
                      : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                  }`}
                >
                  {filteredItems.map((item) => {
                    const isSelected = selectedItem?.id === item.id;
                    const firstEx = item.examples[0];
                    const typeMeta = LANGUAGE_ITEM_TYPE_META[item.type];
                    const masteryMeta = LANGUAGE_MASTERY_META[item.srs.stage];

                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setInspectorStartEdit(false);
                          setSelectedItemId(item.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setInspectorStartEdit(false);
                            setSelectedItemId(item.id);
                          }
                        }}
                        className="rounded-2xl border p-4 space-y-2.5 transition-colors text-left"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: isSelected
                            ? "var(--accent)"
                            : "var(--border-subtle)",
                        }}
                      >
                        {/* Top Headword Row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-base font-bold tracking-tight truncate">
                              {item.term}
                            </div>
                            {item.reading && (
                              <div
                                className="text-xs font-mono truncate"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {item.reading}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => handleSpeak(item.term, 1, e)}
                              className="w-7 h-7 rounded-lg border flex items-center justify-center"
                              style={{
                                borderColor: "var(--border-subtle)",
                                color: "var(--text-secondary)",
                              }}
                              title="Speak (1.0x)"
                              aria-label={`Speak ${item.term}`}
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateLanguageItem(item.id, {
                                  favorite: !item.favorite,
                                });
                              }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center"
                              style={{
                                color: item.favorite
                                  ? "var(--warning)"
                                  : "var(--text-muted)",
                              }}
                              aria-label="Toggle favorite"
                            >
                              <Star
                                className="w-3.5 h-3.5"
                                fill={item.favorite ? "currentColor" : "none"}
                              />
                            </button>
                          </div>
                        </div>

                        {/* Meaning */}
                        <div
                          className="text-sm line-clamp-2"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {item.meaning}
                        </div>

                        {/* Pattern Formula if present */}
                        {item.patternFormula && (
                          <div
                            className="text-xs font-mono truncate px-2.5 py-1.5 rounded-lg"
                            style={{
                              backgroundColor: "var(--bg-surface-subtle)",
                              color: "var(--accent)",
                            }}
                          >
                            {item.patternFormula}
                          </div>
                        )}

                        {/* Example Preview with Cloze highlight */}
                        {firstEx && (
                          <div
                            className="text-xs line-clamp-2 leading-relaxed"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {parseClozeSegments(firstEx.sentence).map(
                              (seg, i) =>
                                seg.kind === "cloze" ? (
                                  <span
                                    key={i}
                                    className="font-semibold underline decoration-dotted"
                                    style={{ color: "var(--accent)" }}
                                  >
                                    {seg.value}
                                  </span>
                                ) : (
                                  <span key={i}>{seg.value}</span>
                                ),
                            )}
                          </div>
                        )}

                        {/* Clean Zero-Pill Metadata Footer */}
                        <div
                          className="text-[11px] flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pt-1 border-t"
                          style={{
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-muted)",
                          }}
                        >
                          <span className="font-medium">{typeMeta.short}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.topic}</span>
                          {item.cefrLevel && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {item.cefrLevel}
                              </span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span style={{ color: masteryMeta.toneColor }}>
                            {masteryMeta.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* High-Density Table View */
                <div
                  className="rounded-2xl border overflow-hidden"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr
                          className="border-b"
                          style={{
                            borderColor: "var(--border-subtle)",
                            backgroundColor: "var(--bg-surface-subtle)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          <th className="py-2.5 px-3 font-semibold">Term</th>
                          <th className="py-2.5 px-3 font-semibold">Reading</th>
                          <th className="py-2.5 px-3 font-semibold">
                            Meaning &amp; Formula
                          </th>
                          <th className="py-2.5 px-3 font-semibold">
                            Type · Topic
                          </th>
                          <th className="py-2.5 px-3 font-semibold">CEFR</th>
                          <th className="py-2.5 px-3 font-semibold">Mastery</th>
                          <th className="py-2.5 px-3 font-semibold text-right">
                            Due
                          </th>
                          <th className="py-2.5 px-3 font-semibold text-right">
                            Audio
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.map((item) => {
                          const isSelected = selectedItem?.id === item.id;
                          const masteryMeta =
                            LANGUAGE_MASTERY_META[item.srs.stage];
                          return (
                            <tr
                              key={item.id}
                              onClick={() => {
                                setInspectorStartEdit(false);
                                setSelectedItemId(item.id);
                              }}
                              className="border-b last:border-b-0 cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]"
                              style={{
                                borderColor: "var(--border-subtle)",
                                backgroundColor: isSelected
                                  ? "var(--accent-soft)"
                                  : undefined,
                              }}
                            >
                              <td className="py-2.5 px-3 font-semibold whitespace-nowrap">
                                {item.term}
                              </td>
                              <td
                                className="py-2.5 px-3 font-mono whitespace-nowrap"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {item.reading || "—"}
                              </td>
                              <td className="py-2.5 px-3 max-w-[280px] truncate">
                                <span>{item.meaning}</span>
                                {item.patternFormula && (
                                  <span
                                    className="ml-2 font-mono text-[11px]"
                                    style={{ color: "var(--accent)" }}
                                  >
                                    {item.patternFormula}
                                  </span>
                                )}
                              </td>
                              <td
                                className="py-2.5 px-3 whitespace-nowrap"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {LANGUAGE_ITEM_TYPE_META[item.type].short} ·{" "}
                                {item.topic}
                              </td>
                              <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                                {item.cefrLevel || "—"}
                              </td>
                              <td
                                className="py-2.5 px-3 font-medium whitespace-nowrap"
                                style={{ color: masteryMeta.toneColor }}
                              >
                                {masteryMeta.label}
                              </td>
                              <td
                                className="py-2.5 px-3 font-mono tabular-nums text-right whitespace-nowrap"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {item.srs.dueDate}
                              </td>
                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => handleSpeak(item.term, 1, e)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-md border"
                                  style={{
                                    borderColor: "var(--border-subtle)",
                                  }}
                                  aria-label={`Speak ${item.term}`}
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Desktop Side Inspector Drawer */}
            {selectedItem && (
              <div className="hidden xl:block w-[420px] shrink-0 sticky top-4 max-h-[calc(100dvh-2rem)] rounded-2xl overflow-hidden border" style={{ borderColor: "var(--border-subtle)" }}>
                <LanguageInspectorDrawer
                  item={selectedItem}
                  language={activeLanguage}
                  decks={languageDecks}
                  initialEditMode={inspectorStartEdit}
                  onClose={() => setSelectedItemId(null)}
                  onUpdate={updateLanguageItem}
                  onDelete={deleteLanguageItem}
                  onOpenInStudio={(id) => {
                    setStudioFocusedPatternId(id);
                    setStudioTab("studio");
                  }}
                  onNotify={pushToast}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* STAGE 4: RECOMBINE (Building Block Sentence Studio) */}
      {studioTab === "studio" && (
        <LanguageSentenceStudio
          language={activeLanguage}
          items={languageItems}
          focusedFormulaItemId={studioFocusedPatternId}
          onSaveAsPhrase={(draft) => {
            const created = addLanguageItem({
              languageId: activeLanguage.id,
              type: "phrase",
              term: draft.sentence,
              meaning: draft.translation || "Synthesized sentence",
              register: "neutral",
              examples: [
                {
                  id: `lex-st-${Date.now().toString(36)}`,
                  sentence: draft.sentence,
                  translation: draft.translation,
                  interlinearGloss: draft.interlinearGloss || undefined,
                },
              ],
              topic: draft.topic,
              cefrLevel: "",
              deckIds: [],
              tags: draft.tags,
              favorite: false,
            });
            pushToast(`Saved "${created.term}" to Phrase Vault`, "success");
          }}
          onAttachExampleToPattern={(patternId, exDraft) => {
            const target = languageItems.find((it) => it.id === patternId);
            if (!target) return;
            updateLanguageItem(patternId, {
              examples: [
                ...target.examples,
                {
                  id: `lex-att-${Date.now().toString(36)}`,
                  sentence: exDraft.sentence,
                  translation: exDraft.translation,
                  interlinearGloss: exDraft.interlinearGloss,
                },
              ],
            });
            pushToast(`Added example to "${target.term}"`, "success");
          }}
          onNotify={pushToast}
        />
      )}

      {/* STAGE 3: ACTIVE RECALL (SM-2 Spaced Repetition + 3 Drills) */}
      {studioTab === "recall" && (
        <LanguageRecallLab
          language={activeLanguage}
          items={languageItems}
          decks={languageDecks}
          onReviewItem={reviewLanguageItem}
          onNotify={pushToast}
        />
      )}

      {/* Mobile / Tablet Slide-Over Inspector Drawer */}
      {selectedItem && studioTab === "vault" && (
        <div
          className="xl:hidden fixed inset-0 z-50 flex justify-end"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.45)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedItemId(null);
          }}
        >
          <div className="w-full max-w-md h-full">
            <LanguageInspectorDrawer
              item={selectedItem}
              language={activeLanguage}
              decks={languageDecks}
              initialEditMode={inspectorStartEdit}
              onClose={() => setSelectedItemId(null)}
              onUpdate={updateLanguageItem}
              onDelete={deleteLanguageItem}
              onOpenInStudio={(id) => {
                setSelectedItemId(null);
                setStudioFocusedPatternId(id);
                setStudioTab("studio");
              }}
              onNotify={pushToast}
            />
          </div>
        </div>
      )}

      {/* Setup Modal */}
      <LanguageSetupModal
        open={setupModalOpen}
        editingLanguage={editingLanguage}
        existingLanguages={languages}
        onClose={() => setSetupModalOpen(false)}
        onSave={(draft, editId) => {
          if (editId) {
            updateLanguageProfile(editId, draft);
            pushToast(`Updated ${draft.name}`, "success");
          } else {
            const created = addLanguageProfile(draft);
            pushToast(`Added ${created.name}`, "success");
          }
        }}
        onDelete={(id) => {
          deleteLanguageProfile(id);
          pushToast("Removed language workspace", "success");
        }}
        onNotify={pushToast}
      />

      {/* Import / Export Modal */}
      <LanguageImportExportModal
        open={importExportOpen}
        language={activeLanguage}
        allItems={languageItems}
        filteredItems={filteredItems}
        onClose={() => setImportExportOpen(false)}
        onImport={(drafts) => importLanguageItems(activeLanguage.id, drafts)}
        onNotify={pushToast}
      />
    </div>
  );
};
