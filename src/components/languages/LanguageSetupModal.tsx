import React, { useEffect, useState } from "react";
import { Check, Plus, Trash2, Volume2, X } from "lucide-react";
import {
  isSpeechSynthesisAvailable,
  LANGUAGE_PRESETS,
  speakLanguageText,
} from "../../lib/languageUtils";
import type { LanguageProfile } from "../../types/languages";

interface LanguageSetupModalProps {
  open: boolean;
  editingLanguage: LanguageProfile | null;
  existingLanguages: LanguageProfile[];
  onClose: () => void;
  onSave: (
    draft: Omit<LanguageProfile, "id" | "createdAt" | "updatedAt">,
    editId?: string,
  ) => void;
  onDelete?: (id: string) => void;
  onNotify: (msg: string, tone?: "neutral" | "success" | "error") => void;
}

export const LanguageSetupModal: React.FC<LanguageSetupModalProps> = ({
  open,
  editingLanguage,
  existingLanguages,
  onClose,
  onSave,
  onDelete,
  onNotify,
}) => {
  const [name, setName] = useState("");
  const [nativeName, setNativeName] = useState("");
  const [code, setCode] = useState("");
  const [ttsLocale, setTtsLocale] = useState("en-US");
  const [scriptHint, setScriptHint] = useState("");
  const [dailyGoal, setDailyGoal] = useState(12);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (editingLanguage) {
      setName(editingLanguage.name);
      setNativeName(editingLanguage.nativeName);
      setCode(editingLanguage.code);
      setTtsLocale(editingLanguage.ttsLocale);
      setScriptHint(editingLanguage.scriptHint || "");
      setDailyGoal(editingLanguage.dailyGoal || 12);
    } else {
      setName("");
      setNativeName("");
      setCode("");
      setTtsLocale("ja-JP");
      setScriptHint("");
      setDailyGoal(12);
    }
  }, [open, editingLanguage]);

  if (!open) return null;

  const existingCodes = new Set(
    existingLanguages.map((l) => l.code.toUpperCase()),
  );

  const applyPreset = (presetKey: string) => {
    const preset = LANGUAGE_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    setName(preset.name);
    setNativeName(preset.nativeName);
    setCode(preset.code);
    setTtsLocale(preset.ttsLocale);
    setScriptHint(preset.scriptHint);
  };

  const handleTestVoice = () => {
    if (!isSpeechSynthesisAvailable()) {
      onNotify("Speech synthesis is unavailable in this browser.", "error");
      return;
    }
    const sampleText = nativeName.trim() || name.trim() || "Hello";
    const ok = speakLanguageText(sampleText, ttsLocale.trim() || "en-US", 1);
    if (!ok) {
      onNotify("Could not start speech synthesis for this locale.", "error");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      onNotify("Enter a language name.", "error");
      return;
    }
    const cleanCode = (code.trim() || cleanName.slice(0, 2)).toUpperCase();
    onSave(
      {
        name: cleanName,
        nativeName: nativeName.trim() || cleanName,
        code: cleanCode.slice(0, 4),
        ttsLocale: ttsLocale.trim() || "en-US",
        scriptHint: scriptHint.trim() || undefined,
        dailyGoal: Math.max(1, Math.min(200, Math.round(dailyGoal) || 12)),
      },
      editingLanguage?.id,
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-label={editingLanguage ? "Edit Language" : "Add Language"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl rounded-2xl border overflow-hidden shadow-xl max-h-[90dvh] flex flex-col"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-primary)",
        }}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              {editingLanguage ? "Edit Language Profile" : "Add Study Language"}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Pick a preset or configure any custom language and speech locale.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "var(--text-muted)" }}
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-5 space-y-5 overflow-y-auto flex-1 min-h-0"
        >
          {!editingLanguage && (
            <div className="space-y-2">
              <div
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Common Presets
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {LANGUAGE_PRESETS.map((preset) => {
                  const alreadyAdded = existingCodes.has(preset.code);
                  const selected =
                    code.toUpperCase() === preset.code && name === preset.name;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => applyPreset(preset.key)}
                      className="text-left px-3 py-2 rounded-xl border transition-colors flex items-center justify-between gap-2 min-w-0"
                      style={{
                        backgroundColor: selected
                          ? "var(--accent-soft)"
                          : "var(--bg-surface-subtle)",
                        borderColor: selected
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                      }}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">
                          {preset.name}
                        </div>
                        <div
                          className="text-[11px] truncate"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {preset.nativeName}
                        </div>
                      </div>
                      <span
                        className="text-[11px] font-mono tabular-nums shrink-0"
                        style={{
                          color: selected
                            ? "var(--accent)"
                            : "var(--text-muted)",
                        }}
                      >
                        {alreadyAdded ? "Added" : preset.code}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <label className="block space-y-1">
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Language Name *
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Japanese, Dutch, Thai"
                className="w-full h-10 px-3 rounded-lg border text-sm bg-transparent"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
                required
              />
            </label>

            <label className="block space-y-1">
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Native Name
              </span>
              <input
                type="text"
                value={nativeName}
                onChange={(e) => setNativeName(e.target.value)}
                placeholder="e.g. 日本語, Nederlands"
                className="w-full h-10 px-3 rounded-lg border text-sm bg-transparent"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              />
            </label>

            <label className="block space-y-1">
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Short Code
              </span>
              <input
                type="text"
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="JA"
                className="w-full h-10 px-3 rounded-lg border text-sm font-mono uppercase"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              />
            </label>

            <label className="block space-y-1">
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Daily Goal (Reviews + Pickups)
              </span>
              <input
                type="number"
                min={1}
                max={200}
                value={dailyGoal}
                onChange={(e) => setDailyGoal(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-lg border text-sm font-mono tabular-nums"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              />
            </label>

            <div className="space-y-1">
              <span
                className="text-xs font-medium block"
                style={{ color: "var(--text-secondary)" }}
              >
                Speech Synthesis Locale
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={ttsLocale}
                  onChange={(e) => setTtsLocale(e.target.value)}
                  placeholder="ja-JP, es-ES, fr-FR"
                  className="flex-1 min-w-0 h-10 px-3 rounded-lg border text-sm font-mono"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                />
                <button
                  type="button"
                  onClick={handleTestVoice}
                  className="h-10 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  Test Voice
                </button>
              </div>
            </div>

            <label className="block space-y-1">
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Script Note (Optional)
              </span>
              <input
                type="text"
                value={scriptHint}
                onChange={(e) => setScriptHint(e.target.value)}
                placeholder="e.g. Kana / Kanji, Cyrillic"
                className="w-full h-10 px-3 rounded-lg border text-sm"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              />
            </label>
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div>
              {editingLanguage && onDelete && (
                <>
                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: "var(--danger)",
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Language
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(editingLanguage.id);
                        onClose();
                      }}
                      className="h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      style={{
                        backgroundColor: "var(--danger)",
                        color: "#ffffff",
                      }}
                    >
                      Confirm Delete All Data
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0"
                style={{
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-9 px-4 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                {editingLanguage ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Save Changes
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    Add Language
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
