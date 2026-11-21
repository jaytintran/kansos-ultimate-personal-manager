import {
  AlignJustify,
  AlignLeft,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Columns2,
  FileText,
  Minus,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Type,
} from "lucide-react";
import React, { useState } from "react";
import {
  findActiveTypographyPreset,
  READER_FONT_OPTIONS,
  resolveReaderFont,
  TYPOGRAPHY_PRESETS,
} from "../../lib/readerUtils";
import type {
  BookFormat,
  ReaderContrastPreset,
  ReaderFontWeight,
  ReaderPreferences,
} from "../../../library";

interface TypographyPopoverProps {
  format: BookFormat;
  prefs: ReaderPreferences;
  embeddedInSheet?: boolean;
  onUpdate: (patch: Partial<ReaderPreferences>) => void;
  onReset: () => void;
}

const WEIGHT_OPTIONS: Array<{ value: ReaderFontWeight; label: string }> = [
  { value: 300, label: "Light" },
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semi" },
];

const CONTRAST_OPTIONS: Array<{ id: ReaderContrastPreset; label: string }> = [
  { id: "soft", label: "Soft" },
  { id: "balanced", label: "Balanced" },
  { id: "crisp", label: "Crisp" },
];

export const TypographyPopover: React.FC<TypographyPopoverProps> = ({
  format,
  prefs,
  embeddedInSheet = false,
  onUpdate,
  onReset,
}) => {
  const [showSpacingAdvanced, setShowSpacingAdvanced] = useState(false);
  const isPdf = format === "pdf";
  const showReflowControls = !isPdf || prefs.pdfViewMode === "reflow";
  const activeFont = resolveReaderFont(prefs.fontFamily);
  const activePresetId = findActiveTypographyPreset(prefs);
  const serifFonts = READER_FONT_OPTIONS.filter((f) => f.group === "serif");
  const sansMonoFonts = READER_FONT_OPTIONS.filter((f) => f.group !== "serif");

  return (
    <div
      role={embeddedInSheet ? undefined : "dialog"}
      aria-label={embeddedInSheet ? undefined : "Reader appearance settings"}
      className={
        embeddedInSheet
          ? "w-full p-4 space-y-5"
          : "w-[368px] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl p-5 space-y-4"
      }
    >
      {/* Reading Surface */}
      <div>
        <div className="text-[11px] font-medium text-[var(--text-muted)] mb-2">
          Reading Surface
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onUpdate({ theme: "kanso" })}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              prefs.theme === "kanso"
                ? "border-[var(--accent)] ring-1 ring-[var(--accent)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Palette className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>Kanso</span>
          </button>

          <button
            type="button"
            onClick={() => onUpdate({ theme: "sepia" })}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              prefs.theme === "sepia"
                ? "border-[#9A4D1E] ring-1 ring-[#9A4D1E] bg-[#F4EFE6] text-[#2B2118]"
                : "border-[var(--border-subtle)] bg-[#F4EFE6] text-[#2B2118] opacity-80 hover:opacity-100"
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-[#9A4D1E] shrink-0" />
            <span>Sepia</span>
          </button>

          <button
            type="button"
            onClick={() => onUpdate({ theme: "dark" })}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              prefs.theme === "dark"
                ? "border-[#D98A4E] ring-1 ring-[#D98A4E] bg-[#121110] text-[#EAE4DC]"
                : "border-[var(--border-subtle)] bg-[#121110] text-[#EAE4DC] opacity-80 hover:opacity-100"
            }`}
          >
            <Moon className="w-3.5 h-3.5 text-[#D98A4E] shrink-0" />
            <span>Dark</span>
          </button>
        </div>
      </div>

      {/* Contrast & Brightness Presets */}
      <div className="grid grid-cols-5 gap-3 items-end">
        <div className="col-span-3">
          <div className="text-[11px] font-medium text-[var(--text-muted)] mb-1.5">
            Contrast
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-[var(--bg-sidebar)]">
            {CONTRAST_OPTIONS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onUpdate({ contrastPreset: c.id })}
                className={`py-1.5 px-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  prefs.contrastPreset === c.id
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              Brightness
            </span>
            <span className="font-mono-tabular text-[11px] text-[var(--text-primary)]">
              {prefs.brightness}%
            </span>
          </div>
          <input
            type="range"
            min={75}
            max={115}
            step={5}
            value={prefs.brightness}
            onChange={(e) =>
              onUpdate({ brightness: parseInt(e.target.value, 10) })
            }
            aria-label="Page brightness"
            className="w-full accent-[var(--accent)] cursor-pointer my-1.5"
          />
        </div>
      </div>

      {/* PDF Display Mode Switch (Original vs Reflow Text) */}
      {isPdf && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              PDF Mode
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">
              {prefs.pdfViewMode === "reflow"
                ? "Custom typography active"
                : "Fixed PDF canvas"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-md bg-[var(--bg-sidebar)]">
            <button
              type="button"
              onClick={() => onUpdate({ pdfViewMode: "original" })}
              className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                prefs.pdfViewMode === "original"
                  ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>Original</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdate({ pdfViewMode: "reflow" })}
              className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                prefs.pdfViewMode === "reflow"
                  ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Type className="w-3.5 h-3.5 shrink-0" />
              <span>Reflow Text</span>
            </button>
          </div>
        </div>
      )}

      {!showReflowControls ? (
        <>
          {/* PDF Original Scroll Mode */}
          <div>
            <div className="text-[11px] font-medium text-[var(--text-muted)] mb-2">
              Page Flow
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-md bg-[var(--bg-sidebar)]">
              <button
                type="button"
                onClick={() => onUpdate({ pdfLayout: "continuous" })}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  prefs.pdfLayout === "continuous"
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <ScrollText className="w-3.5 h-3.5 shrink-0" />
                <span>Continuous</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ pdfLayout: "single" })}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  prefs.pdfLayout === "single"
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>Single Page</span>
              </button>
            </div>
          </div>

          {/* PDF Fit / Zoom */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                Page Scaling
              </span>
              <span className="font-mono-tabular text-xs text-[var(--text-primary)]">
                {prefs.pdfFitMode === "width"
                  ? "Fit Width"
                  : `${Math.round(prefs.pdfZoom * 100)}%`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-md bg-[var(--bg-sidebar)] mb-3">
              <button
                type="button"
                onClick={() => onUpdate({ pdfFitMode: "width" })}
                className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  prefs.pdfFitMode === "width"
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Fit Width
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ pdfFitMode: "manual" })}
                className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  prefs.pdfFitMode === "manual"
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Manual Zoom
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    pdfFitMode: "manual",
                    pdfZoom: Math.max(
                      0.6,
                      Number((prefs.pdfZoom - 0.15).toFixed(2)),
                    ),
                  })
                }
                aria-label="Zoom out"
                className="p-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="range"
                min={0.6}
                max={2.2}
                step={0.05}
                value={prefs.pdfZoom}
                onChange={(e) =>
                  onUpdate({
                    pdfFitMode: "manual",
                    pdfZoom: parseFloat(e.target.value),
                  })
                }
                aria-label="PDF zoom level"
                className="flex-1 accent-[var(--accent)] cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    pdfFitMode: "manual",
                    pdfZoom: Math.min(
                      2.2,
                      Number((prefs.pdfZoom + 0.15).toFixed(2)),
                    ),
                  })
                }
                aria-label="Zoom in"
                className="p-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* PDF Theme Tone */}
          <label className="flex items-start justify-between gap-3 pt-2 border-t border-[var(--border-subtle)] cursor-pointer">
            <div>
              <div className="text-xs font-medium text-[var(--text-primary)]">
                Harmonize page tone
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Tint bright PDF pages to match{" "}
                {prefs.theme === "dark"
                  ? "Dark"
                  : prefs.theme === "sepia"
                    ? "Sepia"
                    : "Kanso"}{" "}
                surface
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.pdfThemeTone}
              onChange={(e) => onUpdate({ pdfThemeTone: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-[var(--accent)] cursor-pointer"
            />
          </label>
        </>
      ) : (
        <>
          {/* Reading Layout: Continuous vs Single Page vs Two-Page Spread */}
          <div>
            <div className="text-[11px] font-medium text-[var(--text-muted)] mb-2">
              Page Layout
            </div>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-[var(--bg-sidebar)]">
              <button
                type="button"
                onClick={() => onUpdate({ readingLayout: "scroll" })}
                className={`inline-flex items-center justify-center gap-1 py-1.5 px-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  prefs.readingLayout === "scroll"
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <ScrollText className="w-3.5 h-3.5 shrink-0" />
                <span>Continuous</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ readingLayout: "page" })}
                className={`inline-flex items-center justify-center gap-1 py-1.5 px-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  prefs.readingLayout === "page"
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>Single Page</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ readingLayout: "spread" })}
                className={`inline-flex items-center justify-center gap-1 py-1.5 px-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  prefs.readingLayout === "spread"
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Columns2 className="w-3.5 h-3.5 shrink-0" />
                <span>Spread</span>
              </button>
            </div>
          </div>

          {/* Formatting Mode: Clean Kanso vs Publisher Styles (EPUB) */}
          {!isPdf && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">
                  Formatting
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {prefs.publisherStyles
                    ? "Original alignment, verse & ornaments"
                    : "Uniform Kanso typography"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-md bg-[var(--bg-sidebar)]">
                <button
                  type="button"
                  onClick={() => onUpdate({ publisherStyles: false })}
                  className={`py-1.5 px-2 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    !prefs.publisherStyles
                      ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Clean Kanso
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate({ publisherStyles: true })}
                  className={`py-1.5 px-2 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    prefs.publisherStyles
                      ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Publisher Styles
                </button>
              </div>
            </div>
          )}

          {/* 1-Click Typography Presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)]">
                <Sparkles className="w-3 h-3 text-[var(--accent)]" />
                Presets
              </span>
              {activePresetId && (
                <span className="text-[10px] text-[var(--text-muted)]">
                  {
                    TYPOGRAPHY_PRESETS.find((p) => p.id === activePresetId)
                      ?.description
                  }
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {TYPOGRAPHY_PRESETS.map((preset) => {
                const selected = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onUpdate(preset.patch)}
                    className={`px-2.5 py-1.5 rounded-md border text-left transition-colors cursor-pointer ${
                      selected
                        ? "border-[var(--accent)] ring-1 ring-[var(--accent)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-sidebar)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
                    }`}
                  >
                    <div className="text-xs font-medium truncate">
                      {preset.label}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate">
                      {preset.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expanded Typeface Family Picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                Typeface
              </span>
              <span className="text-[11px] text-[var(--text-primary)] font-medium">
                {activeFont.label}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] text-[var(--text-muted)]">
                Book Serifs
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {serifFonts.map((f) => {
                  const selected = activeFont.id === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onUpdate({ fontFamily: f.id })}
                      style={{ fontFamily: f.cssFamily }}
                      className={`py-1.5 px-2.5 rounded-md border text-xs text-left transition-colors cursor-pointer whitespace-nowrap truncate ${
                        selected
                          ? "border-[var(--accent)] ring-1 ring-[var(--accent)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium"
                          : "border-[var(--border-subtle)] bg-[var(--bg-sidebar)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              <div className="text-[10px] text-[var(--text-muted)] pt-0.5">
                Clean Sans &amp; Mono
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {sansMonoFonts.map((f) => {
                  const selected = activeFont.id === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onUpdate({ fontFamily: f.id })}
                      style={{ fontFamily: f.cssFamily }}
                      className={`py-1.5 px-2.5 rounded-md border text-xs text-left transition-colors cursor-pointer whitespace-nowrap truncate ${
                        selected
                          ? "border-[var(--accent)] ring-1 ring-[var(--accent)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium"
                          : "border-[var(--border-subtle)] bg-[var(--bg-sidebar)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Font Weight & Text Alignment */}
          <div className="grid grid-cols-5 gap-2">
            <div className="col-span-3">
              <div className="text-[11px] font-medium text-[var(--text-muted)] mb-1.5">
                Weight
              </div>
              <div className="grid grid-cols-4 gap-0.5 p-1 rounded-md bg-[var(--bg-sidebar)]">
                {WEIGHT_OPTIONS.map((w) => (
                  <button
                    key={w.value}
                    type="button"
                    onClick={() => onUpdate({ fontWeight: w.value })}
                    className={`py-1.5 text-[10px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                      prefs.fontWeight === w.value
                        ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="col-span-2">
              <div className="text-[11px] font-medium text-[var(--text-muted)] mb-1.5">
                Align
              </div>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-[var(--bg-sidebar)]">
                <button
                  type="button"
                  title="Align left"
                  aria-label="Align left"
                  onClick={() => onUpdate({ textAlign: "left" })}
                  className={`py-1.5 flex items-center justify-center rounded transition-colors cursor-pointer ${
                    prefs.textAlign === "left"
                      ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Justify text"
                  aria-label="Justify text"
                  onClick={() => onUpdate({ textAlign: "justify" })}
                  className={`py-1.5 flex items-center justify-center rounded transition-colors cursor-pointer ${
                    prefs.textAlign === "justify"
                      ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <AlignJustify className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Font Size */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                Text Size
              </span>
              <span className="font-mono-tabular text-xs text-[var(--text-primary)]">
                {prefs.fontSize}px
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onUpdate({ fontSize: Math.max(14, prefs.fontSize - 1) })
                }
                aria-label="Decrease font size"
                className="p-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="range"
                min={14}
                max={28}
                step={1}
                value={prefs.fontSize}
                onChange={(e) =>
                  onUpdate({ fontSize: parseInt(e.target.value, 10) })
                }
                aria-label="Font size"
                className="flex-1 accent-[var(--accent)] cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdate({ fontSize: Math.min(28, prefs.fontSize + 1) })
                }
                aria-label="Increase font size"
                className="p-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Line Height & Paragraph Gap */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">
                  Line Height
                </span>
                <span className="font-mono-tabular text-[11px] text-[var(--text-primary)]">
                  {prefs.lineHeight.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={1.25}
                max={2.3}
                step={0.05}
                value={prefs.lineHeight}
                onChange={(e) =>
                  onUpdate({ lineHeight: parseFloat(e.target.value) })
                }
                aria-label="Line height"
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">
                  Paragraph Gap
                </span>
                <span className="font-mono-tabular text-[11px] text-[var(--text-primary)]">
                  {prefs.paragraphSpacing.toFixed(1)}em
                </span>
              </div>
              <input
                type="range"
                min={0.2}
                max={2.2}
                step={0.1}
                value={prefs.paragraphSpacing}
                onChange={(e) =>
                  onUpdate({ paragraphSpacing: parseFloat(e.target.value) })
                }
                aria-label="Paragraph spacing"
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
            </div>
          </div>

          {/* Collapsible Fine-Tune Spacing & Width */}
          <div className="pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setShowSpacingAdvanced((v) => !v)}
              aria-expanded={showSpacingAdvanced}
              className="w-full flex items-center justify-between py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <span className="inline-flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                Spacing, Indent &amp; Page Width
              </span>
              {showSpacingAdvanced ? (
                <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              )}
            </button>

            {showSpacingAdvanced && (
              <div className="pt-3 space-y-3.5">
                {/* Word Spacing & Letter Spacing */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-medium text-[var(--text-muted)]">
                        Word Spacing
                      </span>
                      <span className="font-mono-tabular text-[11px] text-[var(--text-primary)]">
                        {prefs.wordSpacing >= 0
                          ? `+${prefs.wordSpacing.toFixed(2)}`
                          : prefs.wordSpacing.toFixed(2)}
                        em
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-0.04}
                      max={0.36}
                      step={0.02}
                      value={prefs.wordSpacing}
                      onChange={(e) =>
                        onUpdate({ wordSpacing: parseFloat(e.target.value) })
                      }
                      aria-label="Word spacing"
                      className="w-full accent-[var(--accent)] cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-medium text-[var(--text-muted)]">
                        Letter Spacing
                      </span>
                      <span className="font-mono-tabular text-[11px] text-[var(--text-primary)]">
                        {prefs.letterSpacing >= 0
                          ? `+${prefs.letterSpacing.toFixed(2)}`
                          : prefs.letterSpacing.toFixed(2)}
                        em
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-0.02}
                      max={0.12}
                      step={0.01}
                      value={prefs.letterSpacing}
                      onChange={(e) =>
                        onUpdate({ letterSpacing: parseFloat(e.target.value) })
                      }
                      aria-label="Letter spacing"
                      className="w-full accent-[var(--accent)] cursor-pointer"
                    />
                  </div>
                </div>

                {/* First-Line Indent & Page Margins */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-medium text-[var(--text-muted)]">
                        First Indent
                      </span>
                      <span className="font-mono-tabular text-[11px] text-[var(--text-primary)]">
                        {prefs.textIndent.toFixed(1)}em
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2.2}
                      step={0.2}
                      value={prefs.textIndent}
                      onChange={(e) =>
                        onUpdate({ textIndent: parseFloat(e.target.value) })
                      }
                      aria-label="First-line paragraph indent"
                      className="w-full accent-[var(--accent)] cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-medium text-[var(--text-muted)]">
                        Page Margins
                      </span>
                      <span className="font-mono-tabular text-[11px] text-[var(--text-primary)]">
                        {prefs.pageMargins}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={16}
                      max={96}
                      step={4}
                      value={prefs.pageMargins}
                      onChange={(e) =>
                        onUpdate({ pageMargins: parseInt(e.target.value, 10) })
                      }
                      aria-label="Page side margins"
                      className="w-full accent-[var(--accent)] cursor-pointer"
                    />
                  </div>
                </div>

                {/* Column / Spread Width */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-[var(--text-muted)]">
                      {prefs.readingLayout === "spread"
                        ? "Spread Width"
                        : "Column Width"}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-[var(--text-primary)]">
                      {prefs.pageWidth}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={540}
                    max={960}
                    step={20}
                    value={prefs.pageWidth}
                    onChange={(e) =>
                      onUpdate({ pageWidth: parseInt(e.target.value, 10) })
                    }
                    aria-label="Reading column width"
                    className="w-full accent-[var(--accent)] cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Workspace Pinning Shortcuts */}
      <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
        <div className="text-[11px] font-medium text-[var(--text-muted)]">
          Pinned Workspace
        </div>
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-xs text-[var(--text-primary)]">
            Pin top header
          </span>
          <input
            type="checkbox"
            checked={prefs.pinHeader}
            onChange={(e) => onUpdate({ pinHeader: e.target.checked })}
            className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
          />
        </label>
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-xs text-[var(--text-primary)]">
            Pin bottom scrubber
          </span>
          <input
            type="checkbox"
            checked={prefs.pinBottomBar}
            onChange={(e) => onUpdate({ pinBottomBar: e.target.checked })}
            className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
          />
        </label>
        <label className="hidden lg:flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-xs text-[var(--text-primary)]">
            Pin left navigation sidebar
          </span>
          <input
            type="checkbox"
            checked={prefs.pinLeftSidebar}
            onChange={(e) => onUpdate({ pinLeftSidebar: e.target.checked })}
            className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
          />
        </label>
      </div>

      <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-end">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          Reset typography
        </button>
      </div>
    </div>
  );
};
